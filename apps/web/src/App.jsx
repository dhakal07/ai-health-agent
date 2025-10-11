import { useRef, useState } from "react";
import questions from "./questions.json";
import { startSession, postAnswer, endSession, ping } from "./lib/api";

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
  const [busy, setBusy] = useState(false); // disables buttons during work
  const recRef = useRef(null);

  const question = questions[0];

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
      if (t.includes(opt.toLowerCase()) || keys.some(k => t.includes(k))) return opt;
    }
    return null;
  };

  const initRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("SpeechRecognition not supported. Use Chrome desktop."); return null; }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => { setListening(true); setStatus("Listening..."); };
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
    };
    rec.onerror = (e) => setStatus("Error: " + e.error);
    rec.onend = () => {
      setListening(false); setStatus("Ready");
      if (selected === "(none)") speak(EMPATHY[Math.floor(Math.random()*EMPATHY.length)]);
    };
    return rec;
  };

  const startListening = () => {
    if (!recRef.current) recRef.current = initRecognition();
    if (recRef.current) recRef.current.start();
  };
  const stopListening = () => {
    if (recRef.current && listening) recRef.current.stop();
  };

  const handleAsk = () => {
    speak(question.text + " You can answer: Definitely agree, Slightly agree, Slightly disagree, or Definitely disagree.");
  };

  // Create a backend session
  const begin = async () => {
    console.log("[UI] I Agree clicked");
    alert("Begin clicked");                    // visual proof the handler runs
    try {
      setBusy(true);
      setStatus("Starting session…");
      const s = await startSession("en-US");   // POST /session/start
      console.log("[UI] /session/start response:", s);
      setSessionId(s.session_id);
      setConsented(true);
      setStatus("Session started");
    } catch (e) {
      console.error("[UI] begin error:", e);
      setStatus("Failed to start session");
      alert("Could not start session. See console / backend logs.");
    } finally {
      setBusy(false);
    }
  };

  // Save answer
  const handleConfirm = async () => {
    if (selected === "(none)") return;
    if (!sessionId) { alert("No session yet. Click I Agree first."); return; }
    try {
      setBusy(true);
      setStatus("Saving answer…");
      await postAnswer({
        session_id: sessionId,
        question_id: question.id,
        raw_transcript: transcript || selected,
        mapped_option: selected,
        confidence: selected === "(none)" ? 0 : 0.9
      });                                      // POST /answer
      setStatus("Saved");
      alert(`Saved:\n\nQuestion: ${question.text}\nAnswer: ${selected}`);
    } catch (e) {
      console.error("[UI] save error:", e);
      setStatus("Failed to save");
      alert("Save failed. See console / backend logs.");
    } finally {
      setBusy(false);
    }
  };

  // End session
  const finish = async () => {
    if (!sessionId) return;
    try {
      setBusy(true);
      setStatus("Ending session…");
      const res = await endSession(sessionId); // POST /session/end
      setStatus("Finished");
      alert("Summary: " + JSON.stringify(res.summary));
    } catch (e) {
      console.error("[UI] finish error:", e);
      setStatus("Failed to finish session");
    } finally {
      setBusy(false);
    }
  };

  if (!consented) {
    return (
      <main style={{maxWidth:720, margin:"2rem auto", padding:"1rem", fontFamily:"system-ui"}}>
        <h1>AI Health Agent (Prototype)</h1>
        <p style={{opacity:.8}}>
          This educational demo uses your microphone locally in the browser to capture spoken
          answers to sample screening questions. No personal data is stored. This is not medical advice.
        </p>
        <button onClick={begin} disabled={busy}>I Agree</button>{" "}
        <button onClick={async ()=>{
          const res = await ping();
          alert("Ping /health -> " + JSON.stringify(res));
        }}>🔍 Ping API</button>{" "}
        <button onClick={() => alert("You declined. Closing demo.")}>I Do Not Agree</button>
      </main>
    );
  }

  return (
    <main style={{maxWidth:720, margin:"2rem auto", padding:"1rem", fontFamily:"system-ui"}}>
      <div style={{color:"#22d3ee"}}>{status}</div>

      <section style={{border:"1px solid #ddd", borderRadius:8, padding:16, marginTop:12}}>
        <div><strong>Question 1 / 1</strong></div>
        <p style={{fontSize:18, marginTop:8}}>{question.text}</p>
        <div style={{marginTop:8}}>
          {question.options.map(o => (
            <button key={o} onClick={() => setSelected(o)} style={{marginRight:8, marginTop:4}}>
              {o}
            </button>
          ))}
        </div>
      </section>

      <div style={{marginTop:12}}>
        <button onClick={handleAsk}>🔊 Ask Question</button>
        <button onClick={startListening} disabled={listening}>🎙️ Start Listening</button>
        <button onClick={stopListening} disabled={!listening}>⏹️ Stop</button>
      </div>

      <section style={{border:"1px solid #ddd", borderRadius:8, padding:16, marginTop:12}}>
        <h3>Transcript</h3>
        <div style={{minHeight:48, border:"1px solid #eee", borderRadius:6, padding:8}}>
          {transcript || "(none)"}
        </div>
      </section>

      <section style={{border:"1px solid #ddd", borderRadius:8, padding:16, marginTop:12}}>
        <h3>Detected Answer</h3>
        <div style={{minHeight:48, border:"1px solid #eee", borderRadius:6, padding:8}}>
          {selected}
        </div>
        <button onClick={handleConfirm} disabled={selected==="(none)" || busy} style={{marginTop:8}}>
          ✅ Confirm Answer
        </button>{" "}
        <button onClick={finish} disabled={busy} style={{marginTop:8}}>🏁 Finish</button>
      </section>

      <footer style={{marginTop:24, opacity:.7}}>
        © 2025 – Educational prototype · Not medical advice.
      </footer>
    </main>
  );
}
