// frontend/src/App.jsx
import { useEffect, useRef, useState } from "react";
import questions from "./features/aq/questions.json";
import { startSession, postAnswer, endSession, ping, API_BASE } from "./services/api/client";
import DoctorAvatar from "./features/avatar/DoctorAvatar";
import ChatBox from "./features/ChatBox";

const EMPATHY = [
  "Take your time; there’s no rush.",
  "That’s okay. Answer in your own words.",
  "If you’d like, I can repeat the question.",
  "We can skip and come back later if you prefer."
];

const OPTION_KEYWORDS = {
  "Definitely agree": ["definitely agree", "strongly agree", "absolutely agree"],
  "Slightly agree": ["slightly agree", "somewhat agree", "a little agree"],
  "Slightly disagree": ["slightly disagree", "somewhat disagree"],
  "Definitely disagree": ["definitely disagree", "strongly disagree", "absolutely disagree"]
};

export default function App() {
  const [consented, setConsented] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [selected, setSelected] = useState("(none)");
  const [sessionId, setSessionId] = useState(null);
  const [idx, setIdx] = useState(0);
  const [answersMap, setAnswersMap] = useState({});
  const [summary, setSummary] = useState(null);

  const recRef = useRef(null);
  const empathyTimerRef = useRef(null);
  const utteranceRef = useRef(null);

  const question = questions[idx];
  const progress = `${idx + 1} / ${questions.length}`;

  useEffect(() => {
    console.log("[API_BASE]", API_BASE);
  }, []);

  // ---------- speech synthesis (with avatar sync) ----------
  const speak = (text) => {
    if (utteranceRef.current) {
      speechSynthesis.cancel();
    }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    u.onstart = () => {
      setStatus("Speaking...");
      window.dispatchEvent(new Event("doctor_voice_start"));
    };
    u.onend = () => {
      setStatus("Ready");
      utteranceRef.current = null;
      window.dispatchEvent(new Event("doctor_voice_end"));
    };
    u.onerror = () => {
      window.dispatchEvent(new Event("doctor_voice_end"));
    };
    utteranceRef.current = u;
    speechSynthesis.speak(u);
  };

  const mapToOption = (text) => {
    const t = text.toLowerCase();
    for (const [opt, keys] of Object.entries(OPTION_KEYWORDS)) {
      if (t.includes(opt.toLowerCase()) || keys.some(k => t.includes(k))) {
        return opt;
      }
    }
    return null;
  };

  const startEmpathyTimer = () => {
    clearTimeout(empathyTimerRef.current);
    empathyTimerRef.current = setTimeout(() => {
      if (!listening) return;
      const msg = EMPATHY[Math.floor(Math.random() * EMPATHY.length)];
      speak(msg);
    }, 10000);
  };

  // ---------- speech recognition ----------
  const initRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("SpeechRecognition not supported. Use Chrome desktop.");
      return null;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setListening(true);
      setStatus("Listening...");
      startEmpathyTimer();
    };
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
    rec.onerror = (e) => setStatus("Error: " + e.error);
    rec.onend = () => {
      setListening(false);
      setStatus("Ready");
      clearTimeout(empathyTimerRef.current);
      if (selected === "(none)") speak(EMPATHY[Math.floor(Math.random() * EMPATHY.length)]);
    };
    return rec;
  };

  const startListening = () => {
    if (!recRef.current) recRef.current = initRecognition();
    if (recRef.current) {
      setTranscript("");
      recRef.current.start();
    }
  };
  const stopListening = () => {
    if (recRef.current && listening) recRef.current.stop();
  };

  const handleAsk = () => {
    speak(
      question.text +
      " You can answer: Definitely agree, Slightly agree, Slightly disagree, or Definitely disagree."
    );
  };

  // ---------- session ----------
  const begin = async () => {
    try {
      setStatus("Starting session…");
      const s = await startSession("en-US");
      setSessionId(s.session_id);
      setConsented(true);
      setStatus("Session started");
      setSelected(answersMap[question.id] || "(none)");
      setSummary(null);
      speak("Welcome! Let's begin your health screening.");
    } catch (e) {
      console.error(e);
      setStatus("Failed to start session");
      alert("Could not start session. Check backend logs.");
    }
  };

  const saveAnswer = async (qid, choice, raw) => {
    if (!sessionId) return;
    await postAnswer({
      session_id: sessionId,
      question_id: qid,
      raw_transcript: raw || choice || "",
      mapped_option: choice || "(none)",
      confidence: choice && choice !== "(none)" ? 0.9 : 0.0
    });
  };

  const handleConfirm = async () => {
    if (!sessionId) {
      alert("No session yet.");
      return;
    }
    const choice = selected;
    setAnswersMap(prev => ({ ...prev, [question.id]: choice }));
    setStatus("Saving answer…");
    try {
      await saveAnswer(question.id, choice, transcript);
      setStatus("Saved");
      if (idx < questions.length - 1) {
        const nextIdx = idx + 1;
        setIdx(nextIdx);
        const nextQ = questions[nextIdx];
        setSelected(answersMap[nextQ.id] || "(none)");
        setTranscript("");
        speak(nextQ.text + " Please respond with your level of agreement.");
      } else {
        speak("Great job. You reached the end. You can review or finish.");
      }
    } catch (e) {
      console.error(e);
      setStatus("Failed to save");
    }
  };

  const goNext = () => {
    if (idx < questions.length - 1) {
      const nextIdx = idx + 1;
      setIdx(nextIdx);
      const nextQ = questions[nextIdx];
      setSelected(answersMap[nextQ.id] || "(none)");
      setTranscript("");
    }
  };
  const goPrev = () => {
    if (idx > 0) {
      const prevIdx = idx - 1;
      setIdx(prevIdx);
      const prevQ = questions[prevIdx];
      setSelected(answersMap[prevQ.id] || "(none)");
      setTranscript("");
    }
  };
  const skip = () => {
    setAnswersMap(prev => ({ ...prev, [question.id]: "(none)" }));
    goNext();
  };

  const finish = async () => {
    if (!sessionId) return;
    setStatus("Ending session…");
    try {
      const res = await endSession(sessionId);
      setStatus("Finished");
      setSummary(res);
      const say = `Thank you for completing the questions. ${res.analysis.note}. ${res.analysis.guidance}`;
      speak(say);
    } catch (e) {
      console.error(e);
      setStatus("Failed to finish session");
    }
  };

  // ---------- consent screen ----------
  if (!consented) {
    return (
      <main style={{ maxWidth: 720, margin: "2rem auto", padding: "1rem", fontFamily: "system-ui" }}>
        <h1>AI Health Agent (Prototype)</h1>
        <p style={{ opacity: .8 }}>
          This educational demo uses your microphone locally in the browser to capture spoken
          answers to sample screening questions. This is not medical advice.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={begin}>I Agree</button>
          <button
            onClick={async () => {
              const res = await ping();
              alert("Ping /health -> " + JSON.stringify(res));
            }}
          >
            Ping API
          </button>
          <button onClick={() => alert("You declined. Closing demo.")}>I Do Not Agree</button>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
          API_BASE: <code>{API_BASE}</code>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 1400,
        margin: "2rem auto",
        padding: "1rem",
        fontFamily: "system-ui",
        display: "grid",
        gridTemplateColumns: "400px 1fr",
        gap: "1.5rem",
      }}
    >
      {/* LEFT: SVG Doctor Avatar */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 16,
          background: "#fff",
          height: "fit-content",
        }}
      >
        <DoctorAvatar
          queueSay={(text) => speak(text)}
          speakingText={""}
          onStart={() => {}}
          onEnd={() => {}}
        />
      </div>

      {/* RIGHT: Full UI */}
      <div>
        <div style={{ color: "#22d3ee" }}>
          {status}
          {sessionId ? ` · Session: ${sessionId}` : ""}
        </div>

        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginTop: 12 }}>
          <div>
            <strong>Question {progress}</strong>
          </div>
          <p style={{ fontSize: 18, marginTop: 8 }}>{question.text}</p>
          <div style={{ marginTop: 8 }}>
            {question.options.map((o) => (
              <button key={o} onClick={() => setSelected(o)} style={{ marginRight: 8, marginTop: 4 }}>
                {o}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 10 }}>
            <button onClick={handleAsk}>Ask</button>{" "}
            <button onClick={startListening} disabled={listening}>
              Start
            </button>{" "}
            <button onClick={stopListening} disabled={!listening}>
              Stop
            </button>
          </div>

          <div style={{ marginTop: 10 }}>
            <button onClick={goPrev} disabled={idx === 0}>
              Back
            </button>{" "}
            <button onClick={skip}>Skip</button>{" "}
            <button onClick={goNext} disabled={idx === questions.length - 1}>
              Next
            </button>{" "}
            <button onClick={handleConfirm} disabled={selected === "(none)"}>
              Confirm
            </button>{" "}
            <button onClick={finish}>Finish</button>
          </div>
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginTop: 12 }}>
          <h3>Transcript</h3>
          <div style={{ minHeight: 48, border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
            {transcript || "(none)"}
          </div>
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginTop: 12 }}>
          <h3>Detected Answer</h3>
          <div style={{ minHeight: 48, border: "1px solid #eee", borderRadius: 6, padding: 8 }}>
            {selected}
          </div>
        </section>

        {summary && (
          <section
            style={{
              border: "2px solid #4ade80",
              borderRadius: 8,
              padding: 16,
              marginTop: 12,
              background: "#f6fffb",
            }}
          >
            <h3>Session Summary</h3>
            <p>
              <strong>Answers saved:</strong> {summary.summary?.count}
            </p>
            <p>
              <strong>Score:</strong> {summary.analysis?.score} / {summary.analysis?.total}
            </p>
            <p style={{ marginTop: 8 }}>
              <strong>Interpretation:</strong> {summary.analysis?.note}
            </p>
            <p style={{ opacity: 0.8 }}>{summary.analysis?.guidance}</p>
          </section>
        )}

        {/* NEW: ChatBox with clickable Maps links and avatar voice */}
        <section style={{ border: "1px solid #ddd", borderRadius: 8, padding: 16, marginTop: 12 }}>
          <h3>Ask the AI (General Wellness)</h3>
          <p style={{ opacity: 0.8, marginTop: 4 }}>Educational info only — not medical advice.</p>
          <ChatBox onSpeak={speak} />
        </section>
      </div>
    </main>
  );
}
