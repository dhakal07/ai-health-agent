// frontend/src/components/VoiceChatBox.jsx
import { useEffect, useRef, useState } from "react";
import { chat } from "../services/api/client";

export default function VoiceChatBox({ onSpeak }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I can share general wellness info. What’s on your mind?" }
  ]);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const recRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  function speakLocal(text) {
    try { window.speechSynthesis.cancel(); } catch {}
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    u.pitch = 1.1;
    u.volume = 1.0;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }

  function stopVoice() {
    try { window.speechSynthesis.cancel(); } catch {}
    setSpeaking(false);
  }

  function initRec() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("SpeechRecognition not supported."); return null; }
    const r = new SR();
    r.lang = "en-US"; r.interimResults = true;
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onresult = (e) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript + " ";
      }
      if (finalText) setInput(prev => (prev ? prev + " " : "") + finalText.trim());
    };
    return r;
  }
  function startMic() { if (!recRef.current) recRef.current = initRec(); recRef.current?.start(); }
  function stopMic() { if (recRef.current && listening) recRef.current.stop(); }

  async function send(customText) {
    const text = (customText ?? input).trim();
    if (!text) return;

    const userMsg = { role: "user", content: text };
    setMessages(m => [...m, userMsg]);
    setInput("");
    setSending(true);

    try {
      const history = messages.slice(-6).map(m => ({ role: m.role, content: m.content }));
      const res = await chat(text, history);

      const reply = res?.answer || "Okay.";

      const cleanText = reply
        .replace(/\*\*/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/<\/?[^>]+(>|$)/g, "")
        .replace(/\n/g, " ")
        .trim();

      if (typeof onSpeak === "function") onSpeak(cleanText);
      else speakLocal(cleanText);

      setMessages(m => [...m, {
        role: "assistant",
        content: reply,
        hospitals: res?.hospitals || null,
        follow_up: res?.follow_up || []
      }]);
    } catch (e) {
      console.error(e);
      setMessages(m => [...m, { role: "assistant", content: "Network error. Please try again." }]);
    } finally {
      setSending(false);
    }
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div>
      <div ref={scrollRef} style={{ border: "1px solid #eee", borderRadius: 6, padding: 10, maxHeight: 260, overflowY: "auto", background: "#fafafa" }}>
        {messages.map((m, i) => <Message key={i} msg={m} onQuick={send} />)}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          placeholder="e.g., eye discomfort for 2 days"
          style={{ flex: 1, padding: 8, border: "1px solid #e5e7eb", borderRadius: 6, minWidth: 240 }}
        />
        <button onClick={() => send()} disabled={sending} style={{ height: 40, alignSelf: "end" }}>
          {sending ? "Sending…" : "Ask"}
        </button>
        <button onClick={startMic} disabled={listening} style={{ height: 40, alignSelf: "end" }}>Start</button>
        <button onClick={stopMic} disabled={!listening} style={{ height: 40, alignSelf: "end" }}>Stop</button>
        <button onClick={stopVoice} disabled={!speaking} style={{ height: 40, alignSelf: "end", background: "#fee2e2" }}>Stop Voice</button>
      </div>
    </div>
  );
}

function Message({ msg, onQuick }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ margin: "8px 0", display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div style={{
        maxWidth: 620, whiteSpace: "pre-wrap",
        border: "1px solid #e5e7eb", background: isUser ? "#eef2ff" : "#fff",
        color: "#111827", padding: "8px 10px", borderRadius: 8,
      }}>
        <RenderWithLinks text={msg.content} />
        {Array.isArray(msg.hospitals) && msg.hospitals.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {msg.hospitals.map((h, idx) => (
              <div key={idx} style={{ marginBottom: 6 }}>
                <strong>{h.name}</strong>
                {h.maps_url ? <> · <a href={h.maps_url} target="_blank" rel="noreferrer">Open in Maps</a></> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RenderWithLinks({ text }) {
  const parts = text.split(/(\[.*?\]\(.*?\))/g).map(part => {
    const m = part.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
    return m ? { href: m[2], label: m[1] } : part;
  });
  return parts.map((p, i) =>
    typeof p === "string" ? <span key={i}>{p}</span> : (
      <a key={i} href={p.href} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8" }}>{p.label}</a>
    )
  );
}