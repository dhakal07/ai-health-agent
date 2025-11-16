// frontend/src/App.jsx
import { useEffect, useRef, useState } from "react";
import questions from "./features/aq/questions.json";
import {
  startSession,
  postAnswer,
  endSession,
  ping,
  API_BASE,
} from "./services/api/client";
import DoctorAvatar from "./features/avatar/DoctorAvatar";
import VoiceChatBox from "./components/VoiceChatBox";
import AutismPanel from "./features/autism/AutismPanel";
import "./styles.css";

const EMPATHY = [
  "Take your time; there’s no rush.",
  "That’s okay. Answer in your own words.",
  "If you’d like, I can repeat the question.",
  "We can skip and come back later if you prefer.",
];

const OPTION_KEYWORDS = {
  "Definitely agree": [
    "definitely agree",
    "strongly agree",
    "absolutely agree",
  ],
  "Slightly agree": ["slightly agree", "somewhat agree", "a little agree"],
  "Slightly disagree": ["slightly disagree", "somewhat disagree"],
  "Definitely disagree": [
    "definitely disagree",
    "strongly disagree",
    "absolutely disagree",
  ],
};

export default function App() {
  const [consented, setConsented] = useState(false);
  const [view, setView] = useState("menu"); // "menu" | "ask" | "autism"
  const [status, setStatus] = useState("Ready");

  // questionnaire / autism session
  const [sessionId, setSessionId] = useState(null);
  const [idx, setIdx] = useState(0);
  const [answersMap, setAnswersMap] = useState({});
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState("(none)");
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);

  // speech synthesis (avatar)
  const [speakingText, setSpeakingText] = useState("");
  const recRef = useRef(null);
  const empathyTimerRef = useRef(null);
  const utteranceRef = useRef(null);

  const question = questions[idx];
  const progress = `${idx + 1} / ${questions.length}`;

  useEffect(() => {
    console.log("[API_BASE]", API_BASE);
  }, []);

  // ---- TTS tied to avatar ----
  const speak = (text) => {
    if (!text) return;
    try {
      window.speechSynthesis.cancel();
    } catch {}
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    u.onstart = () => {
      setSpeakingText(text);
      window.dispatchEvent(new Event("doctor_voice_start"));
    };
    u.onend = () => {
      setSpeakingText("");
      window.dispatchEvent(new Event("doctor_voice_end"));
    };
    u.onerror = () => {
      setSpeakingText("");
      window.dispatchEvent(new Event("doctor_voice_end"));
    };
    utteranceRef.current = u;
    window.speechSynthesis.speak(u);
  };

  const stopSpeak = () => {
    try {
      window.speechSynthesis.cancel();
    } catch {}
    setSpeakingText("");
    window.dispatchEvent(new Event("doctor_voice_end"));
  };

  // ---- free speech → Likert option (for questionnaire) ----
  const mapToOption = (text) => {
    const t = (text || "").toLowerCase();
    for (const [opt, keys] of Object.entries(OPTION_KEYWORDS)) {
      if (t.includes(opt.toLowerCase()) || keys.some((k) => t.includes(k)))
        return opt;
    }
    return null;
  };

  // ---- speech recognition for questionnaire ----
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
      if (listening) {
        const msg = EMPATHY[Math.floor(Math.random() * EMPATHY.length)];
        speak(msg);
      }
    }, 10000);
  };

  const startListening = () => {
    if (!recRef.current) recRef.current = initRecognition();
    if (recRef.current) recRef.current.start();
  };
  const stopListening = () => {
    if (recRef.current && listening) recRef.current.stop();
  };

  // ---- autism session helpers ----
  const startAutismSession = async () => {
    try {
      setStatus("Starting screening…");
      const s = await startSession("en-US");
      setSessionId(s.session_id);
      setIdx(0);
      setAnswersMap({});
      setSelected("(none)");
      setTranscript("");
      setSummary(null);
      setView("autism");
      setStatus("Ready");
      speak(
        "Welcome to the autism-focused screening area. I will read each question, and you can answer by voice or by clicking."
      );
    } catch (e) {
      console.error(e);
      alert("Could not start session — check backend logs.");
      setStatus("Error starting session");
    }
  };

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

  const handleConfirm = async () => {
    if (!sessionId) return alert("No session yet.");
    const choice = selected;
    setAnswersMap((prev) => ({ ...prev, [question.id]: choice }));
    try {
      await saveAnswer(question.id, choice, transcript);
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
      alert("Save failed. Check logs.");
    }
  };

  const goNext = () => {
    if (idx < questions.length - 1) {
      const n = idx + 1;
      setIdx(n);
      setSelected(answersMap[questions[n].id] || "(none)");
      setTranscript("");
    }
  };
  const goPrev = () => {
    if (idx > 0) {
      const p = idx - 1;
      setIdx(p);
      setSelected(answersMap[questions[p].id] || "(none)");
      setTranscript("");
    }
  };
  const skip = () => {
    setAnswersMap((prev) => ({ ...prev, [question.id]: "(none)" }));
    goNext();
  };

  const finish = async () => {
    if (!sessionId) return;
    try {
      const res = await endSession(sessionId);
      setSummary(res);
      speak(
        `Thanks for completing the screening. ${
          res?.analysis?.note || ""
        }`
      );
    } catch (e) {
      console.error(e);
      alert("Finish failed.");
    }
  };

  // ---------- CONSENT SCREEN ----------
  if (!consented) {
    return (
      <main className="layout" style={{ display: "block" }}>
        <div className="card">
          <h1 className="card-title">AI Health Agent (Prototype)</h1>
          <p className="muted">
            This demo uses speech and AI to provide educational health
            information and an autism-focused screening. It does not replace
            real medical care.
          </p>
          <div className="row gap">
            <button
              className="btn"
              onClick={() => {
                setConsented(true);
                setView("menu");
              }}
            >
              I Agree
            </button>
            <button
              className="btn light"
              onClick={async () => {
                const r = await ping();
                alert("Ping /health → " + JSON.stringify(r));
              }}
            >
              Ping API
            </button>
            <button
              className="btn light"
              onClick={() => alert("You can now close this tab.")}
            >
              I Do Not Agree
            </button>
          </div>
          <p className="muted" style={{ marginTop: 8 }}>
            API_BASE: <code>{API_BASE}</code>
          </p>
        </div>
      </main>
    );
  }

  // ---------- MENU SCREEN (two big buttons) ----------
  if (view === "menu") {
    return (
      <main className="layout" style={{ maxWidth: 900, margin: "2rem auto" }}>
        <div className="card">
          <h2 className="card-title">Choose what you want to do</h2>
          <p className="muted" style={{ marginBottom: 16 }}>
            You can either chat with the AI for general wellness questions, or
            go to the autism-focused screening and information area.
          </p>
          <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
            <div className="card" style={{ flex: 1, minWidth: 250 }}>
              <h3>Ask AI (General Wellness)</h3>
              <p className="muted">
                Voice-enabled chat for educational questions about symptoms,
                lifestyle, and general health.
              </p>
              <button
                className="btn"
                style={{ marginTop: 12 }}
                onClick={() => setView("ask")}
              >
                Open Ask AI
              </button>
            </div>
            <div className="card" style={{ flex: 1, minWidth: 250 }}>
              <h3>Autism Screening & Info</h3>
              <p className="muted">
                Voice-guided questionnaire, explanations, and resources related
                to autism and neurodiversity.
              </p>
              <button
                className="btn"
                style={{ marginTop: 12 }}
                onClick={startAutismSession}
              >
                Start Autism Screening
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ---------- ASK AI VIEW (full-width, pretty) ----------
if (view === "ask") {
  return (
    <main
      className="layout"
      style={{ maxWidth: 1000, margin: "2rem auto", gridTemplateColumns: "1fr" }}
    >
      <div className="card">
        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <h2 className="card-title">Ask the AI (General Wellness)</h2>
          <button className="btn light" onClick={() => setView("menu")}>
            ← Back to menu
          </button>
        </div>
        <p className="muted">
          Educational info only — not medical advice. For emergencies in
          Finland, call 112.
        </p>

        <div
          className="row"
          style={{ marginTop: 16, alignItems: "flex-start", gap: 24 }}
        >
          <div style={{ flex: 1, minWidth: 220 }}>
            <DoctorAvatar
              queueSay={(text) => speak(text)}
              speakingText={speakingText}
              onStart={() =>
                window.dispatchEvent(new Event("doctor_voice_start"))
              }
              onEnd={() =>
                window.dispatchEvent(new Event("doctor_voice_end"))
              }
            />
            <button
              className="btn light"
              style={{ marginTop: 8 }}
              onClick={stopSpeak}
            >
              Stop Voice
            </button>
          </div>

          <div style={{ flex: 2, minWidth: 280 }}>
            <VoiceChatBox onSpeak={speak} />
          </div>
        </div>
      </div>
    </main>
  );
}

  // ---------- AUTISM VIEW (avatar + questionnaire + autism panel) ----------
  return (
    <main className="layout">
      {/* LEFT COLUMN: avatar + questionnaire */}
      <div className="avatarBox">
        <div className="card">
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <h3 className="card-title">Your AI Health Agent</h3>
            <span className="badge">{status}</span>
          </div>
          <DoctorAvatar
            queueSay={(text) => speak(text)}
            speakingText={speakingText}
            onStart={() =>
              window.dispatchEvent(new Event("doctor_voice_start"))
            }
            onEnd={() => window.dispatchEvent(new Event("doctor_voice_end"))}
          />
          <div className="row gap" style={{ marginTop: 8 }}>
            <button className="btn light" onClick={stopSpeak}>
              🔇 Stop Voice
            </button>
            <button className="btn light" onClick={() => setView("menu")}>
              ← Back to menu
            </button>
          </div>
        </div>

        <div className="card">
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <strong>Question {progress}</strong>
            <span className="badge">
              {sessionId ? sessionId.slice(0, 10) + "…" : "no session"}
            </span>
          </div>
          <p style={{ marginTop: 8 }}>{question.text}</p>

          <div className="row gap" style={{ flexWrap: "wrap", marginTop: 8 }}>
            {question.options.map((o) => (
              <button
                key={o}
                className="btn light"
                onClick={() => setSelected(o)}
              >
                {o}
              </button>
            ))}
          </div>

          <div
            className="row gap"
            style={{ marginTop: 8, flexWrap: "wrap" }}
          >
            <button
              className="btn"
              onClick={() =>
                speak(
                  `${question.text} You can say: Definitely agree, Slightly agree, Slightly disagree, or Definitely disagree.`
                )
              }
            >
              Ask
            </button>
            <button
              className="btn light"
              onClick={startListening}
              disabled={listening}
            >
              Start
            </button>
            <button
              className="btn light"
              onClick={stopListening}
              disabled={!listening}
            >
              Stop
            </button>
            <button
              className="btn light"
              onClick={goPrev}
              disabled={idx === 0}
            >
              Back
            </button>
            <button className="btn light" onClick={skip}>
              Skip
            </button>
            <button
              className="btn light"
              onClick={goNext}
              disabled={idx === questions.length - 1}
            >
              Next
            </button>
            <button
              className="btn"
              onClick={handleConfirm}
              disabled={selected === "(none)"}
            >
              Confirm
            </button>
            <button className="btn" onClick={finish}>
              Finish
            </button>
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
            <div
              className="blk card"
              style={{ borderColor: "#4ade80", marginTop: 12 }}
            >
              <h4 className="card-title">Session Summary</h4>
              <p>
                <strong>Saved:</strong> {summary.summary?.count}
              </p>
              <p>
                <strong>Score:</strong>{" "}
                {summary.analysis?.score} / {summary.analysis?.total}
              </p>
              <p>
                <strong>Interpretation:</strong> {summary.analysis?.note}
              </p>
              <p className="muted">{summary.analysis?.guidance}</p>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Autism info & deep dive */}
      <AutismPanel />
    </main>
  );
}
