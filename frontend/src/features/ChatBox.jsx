// frontend/src/features/ChatBox.jsx
import { useEffect, useRef, useState } from "react";
import { chat } from "../services/api/client";

/**
 * Props:
 * - onSpeak?: (text: string) => void  // optional TTS hook from App (avatar voice)
 */
export default function ChatBox({ onSpeak }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! I can share general wellness info. What’s on your mind?" }
  ]);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  // auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text) return;

    // optimistic add
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      // send last 6 turns (lightweight “memory”)
      const history = next.slice(-6);
      const res = await chat(text, { history });

      if (!res?.ok) {
        setMessages(m => [...m, { role: "assistant", content: "Sorry, I couldn’t process that. Try again." }]);
        return;
      }

      // Build a friendly response string + optional emergency hospitals.
      let reply = res.answer || "Okay.";
      if (res.emergency === true && Array.isArray(res.hospitals) && res.hospitals.length) {
        const list = res.hospitals
          .map(h => `• ${h.name}${h.distance ? ` (${h.distance})` : ""}${h.maps_url ? ` — [Open in Maps](${h.maps_url})` : ""}`)
          .join("\n");
        reply += `\n\nNearest ER options:\n${list}`;
      }

      setMessages(m => [...m, { role: "assistant", content: reply, hospitals: res.hospitals || null }]);

      // speak it
      if (typeof onSpeak === "function") onSpeak(reply);
    } catch (e) {
      console.error(e);
      setMessages(m => [...m, { role: "assistant", content: "Network error. Please try again." }]);
    } finally {
      setSending(false);
    }
  }

  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div>
      <div
        ref={scrollRef}
        style={{
          border: "1px solid #eee",
          borderRadius: 6,
          padding: 10,
          maxHeight: 260,
          overflowY: "auto",
          background: "#fafafa",
        }}
      >
        {messages.map((m, i) => (
          <Message key={i} msg={m} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          rows={2}
          placeholder="e.g., I have chest pain"
          style={{ flex: 1, padding: 8, border: "1px solid #e5e7eb", borderRadius: 6 }}
        />
        <button onClick={send} disabled={sending} style={{ height: 40, alignSelf: "end" }}>
          {sending ? "Sending…" : "Ask"}
        </button>
      </div>
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div
      style={{
        margin: "8px 0",
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: 620,
          whiteSpace: "pre-wrap",
          border: "1px solid #e5e7eb",
          background: isUser ? "#eef2ff" : "#fff",
          color: "#111827",
          padding: "8px 10px",
          borderRadius: 8,
        }}
      >
        <RenderWithLinks text={msg.content} />
        {/* If hospitals were returned, render a clean list with real links */}
        {Array.isArray(msg.hospitals) && msg.hospitals.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {msg.hospitals.map((h, idx) => (
              <div key={idx} style={{ marginBottom: 6 }}>
                <strong>{h.name}</strong>
                {h.distance ? <> — <span>{h.distance}</span></> : null}
                {h.maps_url ? (
                  <>
                    {" · "}
                    <a href={h.maps_url} target="_blank" rel="noreferrer">
                      Open in Google Maps
                    </a>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Minimal markdown-ish linkifier for "(...)[https://...]" and raw https:// links */
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

  // also raw URLs
  return out.flatMap(chunk => {
    if (typeof chunk !== "string") return chunk;
    const urlRe = /(https?:\/\/[^\s)]+)\b/g;
    const parts = [];
    let i = 0, u;
    while ((u = urlRe.exec(chunk))) {
      if (u.index > i) parts.push(chunk.slice(i, u.index));
      parts.push({ href: u[1], label: u[1] });
      i = urlRe.lastIndex;
    }
    if (i < chunk.length) parts.push(chunk.slice(i));
    return parts;
  });
}
