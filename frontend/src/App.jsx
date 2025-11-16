// frontend/src/App.jsx
import { useEffect, useRef, useState } from "react";
import questions from "./features/aq/questions.json";
import { startSession, postAnswer, endSession, ping, API_BASE } from "./services/api/client";
import DoctorAvatar from "./features/avatar/DoctorAvatar";
import VoiceChatBox from "./components/VoiceChatBox";
import AutismPanel from "./features/autism/AutismPanel";
import "./styles.css";

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
  const [view, setView] = useState("menu"); // "menu" | "autism" | "wellness"
  const [status, setStatus] = useState("Choose a mode");

  // --- autism screening state ---
  const [sessionId, setSessionId] = useState(null);
  const [idx, setIdx] = useState(0);
  const [answersMap, setAnswersMap] = useState({});
  const [summary, setSummary] = useState(null);

  const [selected, setSelected] = useState("(none)");
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);

  const [speaking, setSpeaking] = useState(false);
  const [speakingText, setSpeakingText] = useState("");

  const recRef = useRef(null);
  const empathyTimerRef = useRef(null);
  const utteranceRef = useRef(null);

  const question = questions[idx];
  const progress = `${idx + 1} / ${questions.length}`;

  useEffect(() => {
    console.log("[API_BASE]", API_BASE);
  }, []);

  // ---------- speech synthesis (avatar voice) ----------
  const speak = (text) => {
    try { window.speechSynthesis.cancel(); } catch {}
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    u.onstart = () => {
      setSpeaking(true);
      setSpeakingText(text);
      window.dispatchEvent(new Event("doctor_voice_start"));
    };
    u.onend = () => {
      setSpeaking(false);
      setSpeakingText("");
      window.dispatchEvent(new Event("doctor_voice_end"));
    };
    u.onerror = () => {
      setSpeaking(false);
      setSpeakingText("");
      window.dispatchEvent(new Event("doctor_voice_end"));
    };
    utteranceRef.current = u;
    window.speechSynthesis.speak(u);
  };

  const stopSpeak = () => {
    try { window.speechSynthesis.cancel(); } catch {}
    setSpeaking(false);
    setSpeakingText("");
    window.dispatchEvent(new Event("doctor_voice_end"));
  };

  // ---------- map free speech -> options ----------
  const mapToOption = (text) => {
    const t = (text || "").toLowerCase();
    for (const [opt, keys] of Object.entries(OPTION_KEYWORDS)) {
      if (t.includes(opt.toLowerCase()) || keys.some(k => t.includes(k))) return opt;
    }
    return null;
  };

  // ---------- speech recognition for autism screening ----------
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
      setStatus("Listening…");
      startEmpathyTimer();
    };
    rec.onend = () => {
      setListening(false);
      setStatus("Ready");
      clearTimeout(empathyTimerRef.current);
    };
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
    return rec;
  };

  const startEmpathyTimer = () => {
    clearTimeout(empathyTimerRef.current);
    empathyTimerRef.current = setTimeout(() => {
      if (listening) speak(EMPATHY[Math.floor(Math.random() * EMPATHY.length)]);
    }, 10000);
  };

  const startListening = () => {
    if (!recRef.current) recRef.current = initRecognition();
    recRef.current?.start();
  };
  const stopListening = () => {
    if (recRef.current && listening) recRef.current.stop();
  };

  // ---------- consent ----------
  const begin = async () => {
    // Just move to menu; autism session will be started when user enters that mode
    setConsented(true);
    setView("menu");
    setStatus("Choose a mode");
  };

  // ---------- AUTISM SESSION (DB + questions) ----------
  const startAutismSession = async () => {
    try {
      setStatus("Starting autism screening…");
      const s = await startSession("en-US");
      setSessionId(s.session_id);
      setIdx(0);
      setAnswersMap({});
      setSummary(null);
      setSelected("(none)");
      setTranscript("");
      setStatus("Ready");
      speak("Welcome! Let's begin the autism-related screening.");
    } catch (e) {
      console.error(e);
      setStatus("Failed to start session");
      alert("Could not start session. Check backend logs.");
    }
  };

  const saveAnswer = async (qid, choice, raw) => {
    if (!sessionId) return; // avoid errors if user hasn't started session
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
      alert("Start the autism screening first.");
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
        speak(nextQ.text);
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
      const say = `Thank you for completing the screening. ${res.analysis.note}. ${res.analysis.guidance}`;
      speak(say);
    } catch (e) {
      console.error(e);
      setStatus("Failed to finish session");
    }
  };

  // ---------- CONSENT SCREEN ----------
  if (!consented) {
    return (
      <main className="layout" style={{ display: "block" }}>
        <div className="card">
          <h1 className="card-title">AI Health Agent (Prototype)</h1>
          <p className="muted">
            This demo uses voice and AI to offer educational wellness guidance and a small autism-related
            screening. It does not replace real medical professionals.
          </p>
          <div className="row gap">
            <button className="btn" onClick={begin}>I Agree</button>
            <button
              className="btn light"
              onClick={async () => {
                const res = await ping();
                alert("Ping /health -> " + JSON.stringify(res));
              }}
            >
              Ping API
            </button>
            <button className="btn light" onClick={() => alert("You can close the tab.")}>
              I Do Not Agree
            </button>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>API_BASE: {API_BASE}</p>
        </div>
      </main>
    );
  }

  // ---------- MENU VIEW ----------
  if (view === "menu") {
    return (
      <main className="layout" style={{ display: "block" }}>
        <div className="card">
          <h2 className="card-title">Choose what you want to explore</h2>
          <p className="muted">You can always come back to this menu.</p>
          <div className="row gap" style={{ marginTop: 16, flexWrap: "wrap" }}>
            <button className="btn" style={{ minWidth: 220 }} onClick={() => setView("autism")}>
              🧩 Autism screening & info
            </button>
            <button className="btn light" style={{ minWidth: 220 }} onClick={() => setView("wellness")}>
              💬 Ask AI (general wellness)
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ---------- AUTISM VIEW ----------
  if (view === "autism") {
    return (
      <main className="layout">
        <div className="avatarBox">
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h3 className="card-title">Your AI Health Agent</h3>
              <span className="badge">{status}</span>
            </div>
            <DoctorAvatar
              queueSay={(text) => speak(text)}
              speakingText={speakingText}
              onStart={() => setSpeaking(true)}
              onEnd={() => setSpeaking(false)}
            />
            <div className="row gap" style={{ marginTop: 8 }}>
              <button className="btn light" onClick={stopSpeak}>🔇 Stop Voice</button>
              <button className="btn light" onClick={() => setView("menu")}>← Back to menu</button>
            </div>
          </div>

          <div className="card">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong>Autism screening – Question {progress}</strong>
              <span className="badge">{sessionId ? sessionId.slice(0, 8) + "…" : "no session"}</span>
            </div>

            <div className="row gap" style={{ marginTop: 8 }}>
              <button className="btn" onClick={startAutismSession}>
                ▶ Start / restart screening
              </button>
            </div>

            <p style={{ marginTop: 12 }}>{question.text}</p>

            <div className="row gap" style={{ flexWrap: "wrap", marginTop: 8 }}>
              {question.options.map(o => (
                <button key={o} className="btn light" onClick={() => setSelected(o)}>{o}</button>
              ))}
            </div>

            <div className="row gap" style={{ marginTop: 8, flexWrap: "wrap" }}>
              <button
                className="btn"
                onClick={() =>
                  speak(
                    question.text +
                    " You can answer: Definitely agree, Slightly agree, Slightly disagree, or Definitely disagree."
                  )
                }
              >
                Ask
              </button>
              <button className="btn light" onClick={startListening} disabled={listening}>Start</button>
              <button className="btn light" onClick={stopListening} disabled={!listening}>Stop</button>
              <button className="btn light" onClick={goPrev} disabled={idx === 0}>Back</button>
              <button className="btn light" onClick={skip}>Skip</button>
              <button className="btn light" onClick={goNext} disabled={idx === questions.length - 1}>Next</button>
              <button className="btn" onClick={handleConfirm} disabled={selected === "(none)"}>Confirm</button>
              <button className="btn" onClick={finish} disabled={!sessionId}>Finish</button>
            </div>

            <div className="blk">
              <div className="muted">Transcript</div>
              <div className="answer">{transcript || "(none)"}</div>
            </div>
            <div className="blk">
              <div className="muted">Detected Answer</div>
              <div className="answer">{selected}</div>
            </div>

            {summary && (
              <div className="blk card" style={{ borderColor: "#4ade80" }}>
                <h4 className="card-title">Session Summary</h4>
                <p><strong>Saved:</strong> {summary.summary?.count}</p>
                <p><strong>Score:</strong> {summary.analysis?.score} / {summary.analysis?.total}</p>
                <p><strong>Interpretation:</strong> {summary.analysis?.note}</p>
                <p className="muted">{summary.analysis?.guidance}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right column = deep-dive info, history, links about autism */}
        <AutismPanel />
      </main>
    );
  }

  // ---------- WELLNESS / ASK-AI VIEW ----------
  return (
    <main className="layout">
      <div className="avatarBox">
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h3 className="card-title">Your AI Health Agent</h3>
            <button className="btn light" onClick={() => setView("menu")}>← Back to menu</button>
          </div>
          <DoctorAvatar
            queueSay={(text) => speak(text)}
            speakingText={speakingText}
            onStart={() => setSpeaking(true)}
            onEnd={() => setSpeaking(false)}
          />
          <div className="row gap" style={{ marginTop: 8 }}>
            <button className="btn light" onClick={stopSpeak}>🔇 Stop Voice</button>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Ask the AI (General Wellness)</h3>
          <p className="muted">Educational info only — not medical advice.</p>
          <VoiceChatBox
            onSpeak={(evOrText) => {
              // VoiceChatBox already has its own TTS; this hook mainly keeps mouth animation in sync
              if (evOrText === "start") {
                window.dispatchEvent(new Event("doctor_voice_start"));
              } else if (evOrText === "end") {
                window.dispatchEvent(new Event("doctor_voice_end"));
              }
            }}
          />
        </div>
      </div>
    </main>
  );
}
