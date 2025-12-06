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

const UNCERTAIN_PATTERNS = [
  "i don't know",
  "i dont know",
  "not sure",
  "no idea",
  "maybe",
  "i'm unsure",
  "im unsure",
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
  const progressPct = ((idx + 1) / questions.length) * 100;

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

  // ---- helpers for mapping speech to Likert / uncertainty ----
  const mapToOption = (text) => {
    const t = (text || "").toLowerCase();
    for (const [opt, keys] of Object.entries(OPTION_KEYWORDS)) {
      if (t.includes(opt.toLowerCase()) || keys.some((k) => t.includes(k)))
        return opt;
    }
    return null;
  };

  const containsUncertainty = (text) => {
    const t = (text || "").toLowerCase();
    return UNCERTAIN_PATTERNS.some((p) => t.includes(p));
  };

  // ---- speech recognition for questionnaire ----
  const initRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert(
        "SpeechRecognition not supported in this browser. Please use Chrome on desktop (localhost or https)."
      );
      return null;
    }

    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onstart = () => {
      console.log("[SR] onstart");
      setListening(true);
      setStatus("Listening…");
      startEmpathyTimer();
    };

    rec.onend = () => {
      console.log("[SR] onend");
      setListening(false);
      setStatus("Ready");
      clearTimeout(empathyTimerRef.current);
    };

    rec.onerror = (e) => {
      console.error("[SR] error", e);
      setStatus("Error: " + e.error);
    };

    rec.onresult = (e) => {
      console.log("[SR] onresult", e);
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          finalText += res[0].transcript + " ";
        }
      }

      if (finalText.trim()) {
        const t = finalText.trim();
        console.log("[SR] final transcript:", t);
        setTranscript(t);

        if (containsUncertainty(t)) {
          speak(
            "It’s completely okay to be unsure. You can choose the option that feels closest, or we can skip this question."
          );
        } else {
          const mapped = mapToOption(t);
          if (mapped) {
            setSelected(mapped);
          } else {
            speak(
              "I heard you, but I could not map that clearly to one of the four options. You can also tap the button that fits best."
            );
          }
        }
      } else {
        console.log("[SR] finalText was empty");
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
    if (!recRef.current) {
      recRef.current = initRecognition();
    }
    if (!recRef.current) return;
    try {
      console.log("[SR] starting recognition");
      recRef.current.start();
    } catch (err) {
      console.error("[SR] start error", err);
    }
  };

  const stopListening = () => {
    if (recRef.current && listening) {
      recRef.current.stop();
    }
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
        "Welcome to the autism-focused screening area. I will read each question, and you can answer by voice or by clicking. You can also skip or go back if you need to."
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
        speak(`Thank you. Let's go to the next question. ${nextQ.text}`);
      } else {
        speak(
          "Great job. You reached the end of the questions. You can review or finish whenever you’re ready."
        );
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
      speak("Okay, moving to the next question.");
    }
  };

  const goPrev = () => {
    if (idx > 0) {
      const p = idx - 1;
      setIdx(p);
      setSelected(answersMap[questions[p].id] || "(none)");
      setTranscript("");
      speak("Going back to the previous question.");
    }
  };

  const skip = () => {
    setAnswersMap((prev) => ({ ...prev, [question.id]: "(none)" }));
    speak("No problem, we can skip this question and move on.");
    if (idx < questions.length - 1) {
      const n = idx + 1;
      setIdx(n);
      setSelected(answersMap[questions[n].id] || "(none)");
      setTranscript("");
    }
  };

  const finish = async () => {
    if (!sessionId) return;
    try {
      const res = await endSession(sessionId);
      setSummary(res);
      speak(
        `Thanks for completing the screening. ${
          res?.analysis?.note || ""
        } This is educational only and not a diagnosis.`
      );
    } catch (e) {
      console.error(e);
      alert("Finish failed.");
    }
  };

  // ---------- CONSENT SCREEN ----------
  if (!consented) {
    return (
      <main className="layout fullscreen">
        <div className="hero-card">
          <h1 className="hero-title">AI Health Agent</h1>
          <p className="hero-subtitle">
            A voice-driven, compassionate assistant for educational health
            support and autism-focused screening.
          </p>

          <p className="muted">
            This prototype uses speech and AI for <strong>education only</strong
            >. It does not replace real medical care. Please avoid sharing your
            full name, ID numbers, or emergency situations here.
          </p>

          <div className="hero-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                setConsented(true);
                setView("menu");
              }}
            >
              I Agree &amp; Continue
            </button>
            <button
              className="btn ghost"
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

          <p className="muted api-base">
            API_BASE: <code>{API_BASE}</code>
          </p>
        </div>
      </main>
    );
  }

  // ---------- MENU SCREEN ----------
  if (view === "menu") {
    return (
      <main className="layout fullscreen">
        <div className="hero-card">
          <h2 className="hero-title">What would you like to do today?</h2>
          <p className="hero-subtitle">
            Choose between a general wellness conversation or an autism-focused,
            voice-guided screening with supportive explanations.
          </p>

          <div className="menu-grid">
            <div className="big-card">
              <h3>Ask AI (General Wellness)</h3>
              <p className="muted">
                Talk with the AI about non-emergency health questions, symptoms,
                lifestyle and mental wellbeing. Voice-enabled, friendly, and
                educational — not a diagnosis.
              </p>
              <button className="btn btn-primary" onClick={() => setView("ask")}>
                Open Ask AI
              </button>
            </div>

            <div className="big-card accent">
              <h3>Autism Screening &amp; Info</h3>
              <p className="muted">
                Complete a short screening based on everyday preferences, guided
                entirely by voice (or clicks). Includes plain-language
                reflections and curated resources.
              </p>
              <button className="btn btn-primary" onClick={startAutismSession}>
                Start Autism Screening
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ---------- ASK AI VIEW ----------
  if (view === "ask") {
    return (
      <main
        className="layout"
        style={{
          maxWidth: 1000,
          margin: "2rem auto",
          gridTemplateColumns: "1fr",
        }}
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

    // ---------- AUTISM VIEW ----------
  return (
    <main className="autism-page">
      {/* Header with title + back button */}
      <div className="card autism-header">
        <div className="row header-row">
          <h2 className="card-title">Autism Screening (Voice-Guided)</h2>
          <button className="btn light" onClick={() => setView("menu")}>
            ← Back to menu
          </button>
        </div>
        <p className="muted">
          This short screening is <strong>educational only</strong> and not a
          diagnosis. Try to answer based on your everyday preferences. You can
          respond by voice or by clicking the options.
        </p>
      </div>

      {/* Main two-column layout */}
      <div className="autism-layout">
        {/* LEFT SIDE: avatar + questionnaire */}
        <div className="left-side">
          <div className="card small-avatar-card">
            <h3 className="card-title">Autism Screening Assistant</h3>
            <DoctorAvatar
              queueSay={(text) => speak(text)}
              speakingText={speakingText}
            />

            <div className="avatar-controls">
              <button className="btn light" onClick={stopSpeak}>
                🔇 Stop Voice
              </button>
            </div>

            <div className="avatar-status">
              <span className="badge">{status}</span>
            </div>
          </div>

          <div className="card questionnaire-card">
            <div className="question-header">
              <strong>Question {progress}</strong>
              <span className="badge">
                {sessionId ? sessionId.slice(0, 10) + "…" : "no session"}
              </span>
            </div>

            {/* progress bar */}
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <p className="question-text">{question.text}</p>

            <div className="options-row">
              {question.options.map((o) => (
                <button
                  key={o}
                  className={`option-btn ${
                    selected === o ? "selected-option" : ""
                  }`}
                  onClick={() => setSelected(o)}
                >
                  {o}
                </button>
              ))}
            </div>

                      <div className="controls-row">
            <button
              className="btn ghost"
              onClick={() =>
                speak(
                  `${question.text} You can say: Definitely agree, Slightly agree, Slightly disagree, or Definitely disagree.`
                )
              }
            >
              Ask
            </button>
            <button
              className="btn btn-success"
              onClick={startListening}
              disabled={listening}
            >
              Start
            </button>
            <button
              className="btn btn-danger"
              onClick={stopListening}
              disabled={!listening}
            >
              Stop
            </button>
            <button
              className="btn neutral"
              onClick={goPrev}
              disabled={idx === 0}
            >
              Back
            </button>
            <button className="btn ghost" onClick={skip}>
              Skip
            </button>
            <button
              className="btn neutral"
              onClick={goNext}
              disabled={idx === questions.length - 1}
            >
              Next
            </button>
            <button
              className="btn btn-primary"
              onClick={handleConfirm}
              disabled={selected === "(none)"}
            >
              Confirm
            </button>
            <button className="btn btn-primary" onClick={finish}>
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
              <div className="card summary-card">
                <h4 className="card-title">Session Summary</h4>
                <p>
                  <strong>Saved:</strong> {summary.summary?.count}
                </p>
                <p>
                  <strong>Score:</strong> {summary.analysis?.score} /{" "}
                  {summary.analysis?.total}
                </p>
                <p>
                  <strong>Interpretation:</strong> {summary.analysis?.note}
                </p>
                <p className="muted">{summary.analysis?.guidance}</p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT SIDE: autism educational panel */}
        <div className="right-side">
          <AutismPanel />
        </div>
      </div>
    </main>
  );
}
