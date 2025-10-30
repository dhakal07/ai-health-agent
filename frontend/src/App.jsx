import { useEffect, useRef, useState } from "react";
import questions from "./features/aq/questions.json";
import { startSession, postAnswer, endSession, getAnswers, ping, chat, API_BASE } from "./services/api/client";

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
  const [summary, setSummary] = useState(null);       // { summary, analysis }
  const [aiInput, setAiInput] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const recRef = useRef(null);
  const empathyTimerRef = useRef(null);

  const question = questions[idx];
  const progress = `${idx + 1} / ${questions.length}`;

  useEffect(() => {
    console.log("[API_BASE]", API_BASE);
  }, []);

  // ---------- speech synthesis ----------
  const speak = (text) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1; u.pitch = 1;
    u.onstart = () => setStatus("Speaking...");
    u.onend = () => setStatus("Ready");
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

  // --- Empathy timer: if user is silent/idle for 10s, speak supportively
  const startEmpathyTimer = () => {
    clearTimeout(empathyTimerRef.current);
    empathyTimerRef.current = setTimeout(() => {
      if (!listening) return;
      speak(EMPATHY[Math.floor(Math.random() * EMPATHY.length)]);
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

    rec.onstart = () => { setListening(true); setStatus("Listening..."); startEmpathyTimer(); };
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
      setListening(false); setStatus("Ready");
      clearTimeout(empathyTimerRef.current);
      if (selected === "(none)") speak(EMPATHY[Math.floor(Math.random()*EMPATHY.length)]);
    };
    return rec;
  };

  const startListening = () => {
    if (!recRef.current) recRef.current = initRecognition();
    if (recRef.current) { setTranscript(""); recRef.current.start(); }
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
      // preload answer if revisiting
      const prev = answersMap[question.id];
      setSelected(prev || "(none)");
      setSummary(null);
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
    if (!sessionId) { alert("No session yet. Click I Agree first."); return; }
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
      } else {
        speak("Great job. You reached the end. You can review or finish.");
      }
    } catch (e) {
      console.error(e);
      setStatus("Failed to save");
      alert("Save failed. See console / backend logs.");
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
      setSummary(res); // { summary: {count, answers}, analysis: {score,total,ratio,note,guidance} }
      const say = `Thank you for completing the questions. ${res.analysis.note}. ${res.analysis.guidance}`;
      speak(say);
    } catch (e) {
      console.error(e);
      setStatus("Failed to finish session");
    }
  };

  // ---------- chat ----------
  const askAI = async () => {
    try {
      const data = await chat(aiInput);
      if (!data?.ok) {
        alert("AI error");
        return;
      }
      setAiAnswer(data.answer);
    } catch (e) {
      console.error(e);
      alert("Network error calling AI.");
    }
  };

  // ---------- consent screen ----------
  if (!consented) {
    return (
      <main style={{maxWidth:720, margin:"2rem auto", padding:"1rem", fontFamily:"system-ui"}}>
        <h1>AI Health Agent (Prototype)</h1>
        <p style={{opacity:.8}}>
          This educational demo uses your microphone locally in the browser to capture spoken
          answers to sample screening questions. This is not medical advice.
        </p>
        <div style={{display:"flex", gap:8, marginTop:8}}>
          <button onClick={begin}>I Agree</button>
          <button onClick={async ()=>{ const res = await ping(); alert("Ping /health -> " + JSON.stringify(res)); }}>Ping API</button>
          <button onClick={() => alert("You declined. Closing demo.")}>I Do Not Agree</button>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
          API_BASE: <code>{API_BASE}</code>
        </div>
      </main>
    );
  }

  return (
    <main style={{maxWidth:900, margin:"2rem auto", padding:"1rem", fontFamily:"system-ui"}}>
      <div style={{color:"#22d3ee"}}>{status}{sessionId ? ` · Session: ${sessionId}` : ""}</div>

      <section style={{border:"1px solid #ddd", borderRadius:8, padding:16, marginTop:12}}>
        <div><strong>Question {progress}</strong></div>
        <p style={{fontSize:18, marginTop:8}}>{question.text}</p>
        <div style={{marginTop:8}}>
          {question.options.map(o => (
            <button key={o} onClick={() => setSelected(o)} style={{marginRight:8, marginTop:4}}>{o}</button>
          ))}
        </div>

        <div style={{marginTop:10}}>
          <button onClick={handleAsk}>Ask</button>{" "}
          <button onClick={startListening} disabled={listening}>Start</button>{" "}
          <button onClick={stopListening} disabled={!listening}>Stop</button>
        </div>

        <div style={{marginTop:10}}>
          <button onClick={goPrev} disabled={idx===0}>Back</button>{" "}
          <button onClick={skip}>Skip</button>{" "}
          <button onClick={goNext} disabled={idx===questions.length-1}>Next</button>{" "}
          <button onClick={handleConfirm} disabled={selected==="(none)"}>Confirm</button>{" "}
          <button onClick={finish}>Finish</button>
        </div>
      </section>

      <section style={{border:"1px solid #ddd", borderRadius:8, padding:16, marginTop:12}}>
        <h3>Transcript</h3>
        <div style={{minHeight:48, border:"1px solid #eee", borderRadius:6, padding:8}}>{transcript || "(none)"}</div>
      </section>

      <section style={{border:"1px solid #ddd", borderRadius:8, padding:16, marginTop:12}}>
        <h3>Detected Answer</h3>
        <div style={{minHeight:48, border:"1px solid #eee", borderRadius:6, padding:8}}>{selected}</div>
      </section>

      {summary && (
        <section style={{border:"2px solid #4ade80", borderRadius:8, padding:16, marginTop:12, background:"#f6fffb"}}>
          <h3>Session Summary</h3>
          <p><strong>Answers saved:</strong> {summary.summary?.count}</p>
          <p><strong>Score:</strong> {summary.analysis?.score} / {summary.analysis?.total} (ratio {summary.analysis?.ratio})</p>
          <p style={{marginTop:8}}><strong>Interpretation:</strong> {summary.analysis?.note}</p>
          <p style={{opacity:.8}}>{summary.analysis?.guidance}</p>
          <details style={{marginTop:10}}>
            <summary>Review raw answers</summary>
            <pre style={{whiteSpace:"pre-wrap"}}>{JSON.stringify(summary.summary?.answers, null, 2)}</pre>
          </details>
        </section>
      )}

      <section style={{border:"1px solid #ddd", borderRadius:8, padding:16, marginTop:12}}>
        <h3>Ask the AI (General Wellness)</h3>
        <p style={{opacity:.8, marginTop:4}}>
          Educational info only — not medical advice.
        </p>
        <div style={{display:"flex", gap:8, marginTop:8}}>
          <input
            value={aiInput}
            onChange={e=>setAiInput(e.target.value)}
            placeholder="e.g., How to improve sleep? Headache red flags?"
            style={{flex:1, padding:8, border:"1px solid #eee", borderRadius:6}}
          />
          <button onClick={askAI}>Ask</button>
        </div>
        {aiAnswer && (
          <div style={{marginTop:10, background:"#fafafa", border:"1px solid #eee", borderRadius:6, padding:10}}>
            {aiAnswer}
          </div>
        )}
      </section>

      <footer style={{marginTop:24, opacity:.7}}>
        © 2025 – Educational prototype · Not medical advice.
      </footer>
    </main>
  );
}
