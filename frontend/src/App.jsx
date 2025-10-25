import { useRef, useState } from "react";
import questions from "./features/aq/questions.json";
import { startSession, postAnswer, endSession, ping, API_BASE } from "./services/api/client";

// supportive prompts if the user is quiet
const EMPATHY = [
  "Take your time; there’s no rush.",
  "That’s okay. Answer in your own words.",
  "If you’d like, I can repeat the question.",
  "We can skip and come back later if you prefer."
];

// phrases that map to the four choices
const OPTION_KEYWORDS = {
  "Definitely agree": ["definitely agree", "strongly agree", "absolutely agree"],
  "Slightly agree": ["slightly agree", "somewhat agree", "a little agree"],
  "Slightly disagree": ["slightly disagree", "somewhat disagree", "a little disagree"],
  "Definitely disagree": ["definitely disagree", "strongly disagree", "absolutely disagree"]
};

export default function App() {
  const [consented, setConsented] = useState(false);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");

  const [sessionId, setSessionId] = useState("");
  const [idx, setIdx] = useState(0);
  const [answersMap, setAnswersMap] = useState({}); // { [qid]: { choice, transcript } }

  const [selected, setSelected] = useState("(none)");
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);

  const recRef = useRef(null);
  const empathyTimerRef = useRef(null);

  const question = questions[idx];

  // ---- utilities ----
  const speak = (text) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1; u.pitch = 1;
    u.onstart = () => setStatus("Speaking…");
    u.onend = () => setStatus("Ready");
    speechSynthesis.speak(u);
  };

  const mapToOption = (text) => {
    const t = (text || "").toLowerCase();
    for (const [opt, vals] of Object.entries(OPTION_KEYWORDS)) {
      if (t.includes(opt.toLowerCase()) || vals.some(v => t.includes(v))) return opt;
    }
    return null;
  };

  const startEmpathyTimer = () => {
    clearTimeout(empathyTimerRef.current);
    empathyTimerRef.current = setTimeout(() => {
      if (listening) speak(EMPATHY[Math.floor(Math.random() * EMPATHY.length)]);
    }, 10000);
  };

  const initRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("SpeechRecognition not supported. Please use Chrome on desktop.");
      return null;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => { setListening(true); setStatus("Listening…"); startEmpathyTimer(); };
    rec.onerror = (e) => setStatus("Error: " + e.error);
    rec.onresult = (e) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript + " ";
      }
      if (finalText) {
        const t = finalText.trim();
        setTranscript(t);
        const mapped = mapToOption(t);
        if (mapped) setSelected(mapped);
      }
      startEmpathyTimer();
    };
    rec.onend = () => {
      setListening(false); setStatus("Ready");
      clearTimeout(empathyTimerRef.current);
    };
    return rec;
  };

  const startListening = () => {
    if (!recRef.current) recRef.current = initRecognition();
    if (recRef.current) { setTranscript(""); recRef.current.start(); }
  };
  const stopListening = () => (recRef.current && listening) ? recRef.current.stop() : null;

  // ---- consent / session start ----
  async function handlePing() {
    const res = await ping();
    alert(`Ping: ${JSON.stringify(res)}`);
  }

  async function handleAgree() {
    setError("");
    setStarting(true);
    try {
      const res = await startSession("en-US");
      if (!res?.session_id) throw new Error("No session_id in response");
      setSessionId(res.session_id);
      setConsented(true);
      setStatus("Session started");
      setSelected("(none)");
      setTranscript("");
    } catch (e) {
      console.error(e);
      setError(String(e.message || e));
    } finally {
      setStarting(false);
    }
  }

  // ---- questionnaire actions ----
  const askQuestion = () =>
    speak(`${question.text} You can answer: Definitely agree, Slightly agree, Slightly disagree, or Definitely disagree.`);

  const saveAnswer = async (qid, choice, raw) => {
    if (!sessionId) return;
    await postAnswer({
      session_id: sessionId,
      question_id: qid,
      raw_transcript: raw || choice || "",
      mapped_option: choice || "(none)",
      confidence: choice && choice !== "(none)" ? 0.9 : 0.0,
    });
  };

  const confirm = async () => {
    if (!sessionId) return alert("Start session first.");
    const choice = selected;
    setAnswersMap(prev => ({ ...prev, [question.id]: { choice, transcript } }));
    setStatus("Saving…");
    try {
      await saveAnswer(question.id, choice, transcript);
      setStatus("Saved");
      if (idx < questions.length - 1) {
        setIdx(i => i + 1);
        const nextQ = questions[idx + 1];
        setSelected(answersMap[nextQ.id]?.choice || "(none)");
        setTranscript("");
      } else {
        speak("Great job. You reached the end. You can review or finish.");
      }
    } catch (e) {
      console.error(e);
      setStatus("Save failed");
      alert("Save failed. See console / backend logs.");
    }
  };

  const next = () => {
    if (idx < questions.length - 1) {
      setIdx(i => i + 1);
      const nextQ = questions[idx + 1];
      setSelected(answersMap[nextQ.id]?.choice || "(none)");
      setTranscript("");
    }
  };

  const back = () => {
    if (idx > 0) {
      setIdx(i => i - 1);
      const prevQ = questions[idx - 1];
      setSelected(answersMap[prevQ.id]?.choice || "(none)");
      setTranscript("");
    }
  };

  const skip = () => {
    setAnswersMap(prev => ({ ...prev, [question.id]: { choice: "(none)", transcript: "" } }));
    next();
  };

  const finish = async () => {
    if (!sessionId) return;
    setStatus("Ending…");
    try {
      const res = await endSession(sessionId);
      setStatus("Finished");
      alert("Summary:\n" + JSON.stringify(res.summary, null, 2));
    } catch (e) {
      console.error(e);
      setStatus("Failed to finish");
    }
  };

  // ---- Consent Screen ----
  if (!consented) {
    return (
      <main style={{ maxWidth: 720, margin: "48px auto", padding: 16, fontFamily: "system-ui" }}>
        <h1>AI Health Agent (Prototype)</h1>
        <p style={{ opacity: 0.8 }}>
          This educational demo uses your microphone locally in the browser to capture spoken answers.
          This is not medical advice.
        </p>

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={handleAgree} disabled={starting} style={{ padding: "6px 10px" }}>
            {starting ? "Starting…" : "I Agree"}
          </button>
          <button onClick={handlePing} style={{ padding: "6px 10px" }}>Ping API</button>
          <button onClick={() => alert("You can explore the UI without starting a session.")} style={{ padding: "6px 10px" }}>
            I Do Not Agree
          </button>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
          API_BASE: <code>{API_BASE}</code>
        </div>

        {error && (
          <pre style={{ color: "crimson", marginTop: 12, whiteSpace: "pre-wrap" }}>
            {error}
          </pre>
        )}

        {sessionId && (
          <div style={{ marginTop: 16, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
            <strong>Session started:</strong> {sessionId}
          </div>
        )}
      </main>
    );
  }

  // ---- Questionnaire Screen ----
  const progress = `${idx + 1} / ${questions.length}`;

  return (
    <main style={{ maxWidth: 900, margin: "32px auto", padding: 16, fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>AI Health Agent</h2>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Status: {status} · Session: {sessionId.slice(0, 8)}…
          </div>
        </div>
        <div style={{
          width: 46, height: 46, borderRadius: 999, background: "#f0f9ff", border: "1px solid #e5e7eb",
          display: "grid", placeItems: "center"
        }}>
          <div style={{ width: 10, height: 10, borderRadius: 999, background: listening ? "#22c55e" : "#9ca3af" }} />
        </div>
      </header>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginTop: 14 }}>
        <div style={{ fontWeight: 600 }}>Question {progress}</div>
        <p style={{ fontSize: 18, marginTop: 8 }}>{question.text}</p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {question.options.map(o => (
            <button
              key={o}
              onClick={() => setSelected(o)}
              style={{
                padding: "6px 10px",
                border: selected === o ? "2px solid #06b6d4" : "1px solid #e5e7eb",
                borderRadius: 8,
                background: "#fff"
              }}
            >
              {o}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={askQuestion}>Ask</button>
          <button onClick={startListening} disabled={listening}>Start</button>
          <button onClick={stopListening} disabled={!listening}>Stop</button>
          <button onClick={back} disabled={idx === 0}>Back</button>
          <button onClick={skip}>Skip</button>
          <button onClick={next} disabled={idx === questions.length - 1}>Next</button>
          <button onClick={confirm} disabled={selected === "(none)"}>Confirm</button>
          <button onClick={finish}>Finish</button>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Transcript</div>
          <div style={{ minHeight: 48, border: "1px solid #eee", borderRadius: 6, padding: 8, background: "#fafafa" }}>
            {transcript || "(none)"}
          </div>
        </div>
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Detected Answer</div>
          <div style={{ minHeight: 48, border: "1px solid #eee", borderRadius: 6, padding: 8, background: "#fafafa" }}>
            {selected}
          </div>
        </div>
      </section>

      <Review answersMap={answersMap} />

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginTop: 12 }}>
        <div style={{ fontWeight: 600 }}>Ask the AI (general info only)</div>
        <p style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Not medical advice.</p>
        <ChatBox />
      </section>

      <footer style={{ marginTop: 24, opacity: 0.6, fontSize: 12 }}>
        © 2025 – Educational prototype.
      </footer>
    </main>
  );
}

function Review({ answersMap }) {
  const keys = Object.keys(answersMap);
  if (!keys.length) return null;
  return (
    <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginTop: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Review Answers</div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {keys.map(k => {
          const q = questions.find(q => q.id === Number(k));
          const a = answersMap[k];
          return (
            <li key={k} style={{ marginBottom: 6 }}>
              <strong>{q?.text || `Question ${k}`}</strong>
              <div style={{ fontSize: 14 }}>
                Answer: {a.choice} {a.transcript ? `· (“${a.transcript}”)` : ""}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ChatBox() {
  const [chatInput, setChatInput] = useState("");
  const [chatAnswer, setChatAnswer] = useState("");

  async function askAI() {
    try {
      const r = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: chatInput })
      });
      const data = await r.json();
      if (!data.ok) return alert("AI error");
      setChatAnswer(data.answer);
    } catch (e) {
      console.error(e);
      alert("Network error calling AI.");
    }
  }

  return (
    <>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          placeholder="Ask a general health question…"
          style={{ flex: 1, padding: 8, border: "1px solid #e5e7eb", borderRadius: 8 }}
        />
        <button onClick={askAI}>Ask</button>
      </div>
      {chatAnswer && (
        <div style={{ marginTop: 8, background: "#fafafa", border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
          {chatAnswer}
        </div>
      )}
    </>
  );
}
