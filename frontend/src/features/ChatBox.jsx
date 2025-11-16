// frontend/src/features/ChatBox.jsx
import { useEffect, useRef, useState } from "react";
import { chat } from "../services/api/client";

/**
 * Props:
 *  - onSpeak?: (text: string) => void   // App will pass its speak() here
 */
export default function ChatBox({ onSpeak }) {
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

  // --- TTS fallback if onSpeak not provided
  function speakLocal(text) {
    try { window.speechSynthesis.cancel(); } catch {}
    const u = new SpeechSynthesisUtterance(text);
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }
  function stopVoice() {
    try { window.speechSynthesis.cancel(); } catch {}
    setSpeaking(false);
  }

  // --- STT
  function initRec() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("SpeechRecognition not supported in this browser."); return null; }
    const r = new SR();
    r.lang = "en-US"; r.interimResults = true; r.maxAlternatives = 1;
    r.onstart = () => setListening(true);
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
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
    setMessages(m => [...m, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    try {
      const res = await chat(text);
      let reply = res?.answer || "Okay.";
      const speakText = reply.replace(/<[^>]+>/g, " ");
      if (typeof onSpeak === "function") onSpeak(speakText);
      else speakLocal(speakText);

      setMessages(m => [
        ...m,
        { role: "assistant", content: reply, hospitals: res?.hospitals || null, follow_up: res?.follow_up || [] }
      ]);
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
      <div
        ref={scrollRef}
        style={{ border: "1px solid #eee", borderRadius: 6, padding: 10, maxHeight: 260, overflowY: "auto", background: "#fafafa" }}
      >
        {messages.map((m, i) => (<Message key={i} msg={m} onQuick={(q) => send(q)} />))}
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
        <button onClick={startMic} disabled={listening} title="Start mic" style={{ height: 40, alignSelf: "end" }}>
          🎙️ Start
        </button>
        <button onClick={stopMic} disabled={!listening} title="Stop mic" style={{ height: 40, alignSelf: "end" }}>
          ⏹️ Stop
        </button>
        <button onClick={stopVoice} disabled={!speaking} style={{ height: 40, alignSelf: "end", background: "#fee2e2" }}>
          🛑 Stop Voice
        </button>
      </div>
    </div>
  );
}

function Message({ msg, onQuick }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ margin: "8px 0", display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: 620, whiteSpace: "pre-wrap",
          border: "1px solid #e5e7eb", background: isUser ? "#eef2ff" : "#fff",
          color: "#111827", padding: "8px 10px", borderRadius: 8,
        }}
      >
        <RenderWithLinks text={msg.content} />

        {/* Hospitals list */}
        {Array.isArray(msg.hospitals) && msg.hospitals.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {msg.hospitals.map((h, idx) => (
              <div key={idx} style={{ marginBottom: 6 }}>
                <strong>{h.name}</strong>
                {h.maps_url ? <> · <a href={h.maps_url} target="_blank" rel="noreferrer">Open in Google Maps</a></> : null}
              </div>
            ))}
          </div>
        )}

        {/* Follow-up questions as quick chips */}
        {Array.isArray(msg.follow_up) && msg.follow_up.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {msg.follow_up.map((q, i) => (
              <button
                key={i}
                onClick={() => onQuick && onQuick(q)}
                style={{
                  border: "1px solid #e5e7eb", background: "#f8fafc", padding: "4px 8px",
                  borderRadius: 999, fontSize: 12, cursor: "pointer"
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Linkify markdown-style [label](url) and raw https:// links */
function RenderWithLinks({ text }) {
  const parts = linkify(text);
  return parts.map((p, i) =>
    typeof p === "string" ? <span key={i}>{p}</span> : (
      <a key={i} href={p.href} target="_blank" rel="noreferrer">{p.label}</a>
    )
  );
}
function linkify(str) {
  const out = [];
  const md = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0, m;
  while ((m = md.exec(str))) {
    if (m.index > last) out.push(str.slice(last, m.index));
    out.push({ href: m[2], label: m[1] });
    last = md.lastIndex;
  }
  if (last < str.length) out.push(str.slice(last));
  return out.flatMap(chunk => {
    if (typeof chunk !== "string") return chunk;
    const urlRe = /(https?:\/\/[^\s)]+)\b/g;
    const parts = []; let i = 0, u;
    while ((u = urlRe.exec(chunk))) {
      if (u.index > i) parts.push(chunk.slice(i, u.index));
      parts.push({ href: u[1], label: u[1] }); i = urlRe.lastIndex;
    }
    if (i < chunk.length) parts.push(chunk.slice(i));
    return parts;
  });
}
