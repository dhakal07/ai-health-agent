// frontend/src/components/VoiceChatBox.jsx
import { useRef, useState } from "react";
import { chat } from "../services/api/client";

/**
 * Voice-first Ask AI box.
 *
 * Props:
 *   onSpeak?: (ev: "start" | "end") => void
 *     - used by App to sync the avatar mouth with speech.
 */
export default function VoiceChatBox({ onSpeak }) {
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);

  const recRef = useRef(null);
  const utteranceRef = useRef(null);

  // ---- Text-to-speech for the AI answer ----
  const speakText = (text) => {
    if (!text) return;

    try {
      window.speechSynthesis.cancel();
    } catch (_) {}

    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;

    u.onstart = () => {
      if (typeof onSpeak === "function") onSpeak("start");
    };
    u.onend = () => {
      if (typeof onSpeak === "function") onSpeak("end");
    };
    u.onerror = () => {
      if (typeof onSpeak === "function") onSpeak("end");
    };

    utteranceRef.current = u;
    window.speechSynthesis.speak(u);
  };

  const stopVoice = () => {
    try {
      window.speechSynthesis.cancel();
    } catch (_) {}
    if (typeof onSpeak === "function") onSpeak("end");
  };

  // ---- Browser speech recognition (voice input) ----
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
    };
    rec.onend = () => {
      setListening(false);
    };
    rec.onerror = () => {
      setListening(false);
    };
    rec.onresult = (e) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalText += e.results[i][0].transcript + " ";
        }
      }
      if (finalText) {
        setInput(finalText.trim());
      }
    };
    return rec;
  };

  const startListening = () => {
    if (!recRef.current) recRef.current = initRecognition();
    if (recRef.current) {
      recRef.current.start();
    }
  };

  const stopListening = () => {
    if (recRef.current && listening) {
      recRef.current.stop();
    }
  };

  // ---- Call backend /chat ----
  const ask = async () => {
    const text = input.trim();
    if (!text) return;
    setSending(true);
    setAnswer("");

    try {
      const res = await chat(text); // uses location + smart backend
      if (!res?.ok) {
        setAnswer("Sorry, I couldn’t process that. Please try again.");
        return;
      }
      setAnswer(res.answer || "");
      speakText(res.answer || "");
    } catch (e) {
      console.error(e);
      setAnswer("Network error. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div className="row" style={{ gap: 8 }}>
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="e.g., I have constipation"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="btn" onClick={ask} disabled={sending}>
          {sending ? "Asking…" : "Ask"}
        </button>
        <button className="btn light" onClick={startListening} disabled={listening}>
          🎙 Start
        </button>
        <button className="btn light" onClick={stopListening} disabled={!listening}>
          ▪ Stop
        </button>
        <button className="btn danger" onClick={stopVoice}>
          🔇 Stop Voice
        </button>
      </div>

      <div className="answer" style={{ marginTop: 12, minHeight: 60 }}>
        {answer || " "}
      </div>
    </div>
  );
}
