// frontend/src/features/avatar/DoctorAvatar.jsx
import { useEffect, useRef, useState } from "react";

/**
 * Simple talking avatar:
 * - SVG "doctor" face (neutral + blinking eyes, animated mouth)
 * - Speaks text via SpeechSynthesis
 * - Animates mouth while speaking
 *
 * Props:
 *   queueSay(text: string): function passed in by parent to enqueue speech
 *   speakingText: string | null          // last text spoken (for subtitle)
 *   onStart?: () => void                  // when speech starts
 *   onEnd?: () => void                    // when speech ends
 */
export default function DoctorAvatar({
  queueSay,
  speakingText,
  onStart,
  onEnd,
}) {
  const [isTalking, setIsTalking] = useState(false);
  const [blink, setBlink] = useState(false);
  const mouthTimer = useRef(null);
  const blinkTimer = useRef(null);

  // Blinking every ~4 sec
  useEffect(() => {
    function loop() {
      setBlink(true);
      setTimeout(() => setBlink(false), 140);
      blinkTimer.current = setTimeout(loop, 4000 + Math.random() * 1500);
    }
    blinkTimer.current = setTimeout(loop, 2000);
    return () => clearTimeout(blinkTimer.current);
  }, []);

  // Provide a local say() helper to speak via parent queue
  function say(line) {
    if (typeof queueSay === "function") queueSay(line);
  }

  // Expose mouth animation controls for the parent via custom events
  useEffect(() => {
    function handleStart() {
      setIsTalking(true);
      if (onStart) onStart();
      // jitter mouth shape each 120ms while speaking
      mouthTimer.current = setInterval(() => {
        const m = document.getElementById("doc-mouth");
        if (!m) return;
        const height = 6 + Math.floor(Math.random() * 10); // 6..16
        m.setAttribute("d", `M 60 95 q 20 ${height} 40 0`);
      }, 120);
    }
    function handleEnd() {
      setIsTalking(false);
      if (onEnd) onEnd();
      clearInterval(mouthTimer.current);
      const m = document.getElementById("doc-mouth");
      if (m) m.setAttribute("d", "M 60 95 q 20 6 40 0"); // closed
    }

    window.addEventListener("doctor_voice_start", handleStart);
    window.addEventListener("doctor_voice_end", handleEnd);
    return () => {
      window.removeEventListener("doctor_voice_start", handleStart);
      window.removeEventListener("doctor_voice_end", handleEnd);
    };
  }, [onStart, onEnd]);

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 12,
        background: "#fcfcff",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontWeight: 700 }}>Your AI Health Agent</div>

      <div
        style={{
          display: "grid",
          placeItems: "center",
          background: "#f3f7ff",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          height: 260,
        }}
      >
        {/* SVG Doctor head */}
        <svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="Doctor avatar">
          {/* Head */}
          <circle cx="80" cy="80" r="54" fill="#ffe8d6" stroke="#d1b6a1" />
          {/* Hair cap */}
          <path d="M 30 60 q 50 -40 100 0 q -5 -35 -50 -35 q -45 0 -50 35 z" fill="#2f3b52" />
          {/* Eyes */}
          <ellipse cx="55" cy="75" rx="10" ry={blink ? 1.5 : 4} fill="#2f3b52" />
          <ellipse cx="105" cy="75" rx="10" ry={blink ? 1.5 : 4} fill="#2f3b52" />
          {/* Nose */}
          <path d="M 80 78 q -2 8 0 10" stroke="#c49a85" strokeWidth="2" fill="none" />
          {/* Mouth (animated) */}
          <path id="doc-mouth" d="M 60 95 q 20 6 40 0" stroke="#c55b6a" strokeWidth="3" fill="none" strokeLinecap="round" />
          {/* Stethoscope */}
          <path d="M 50 115 q -10 10 0 20 q 15 15 30 0" stroke="#2f3b52" strokeWidth="3" fill="none" />
          <circle cx="90" cy="135" r="6" fill="#2f3b52" />
        </svg>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => say("Hello, I am your AI health assistant. I can read questions out loud and give general wellness guidance.")}>
          Greet
        </button>
        <button onClick={() => say("If you stay quiet for a while, I can gently prompt you. Take your time.")}>
          Prompt
        </button>
      </div>

      {/* Subtitle / last line spoken */}
      <div
        style={{
          minHeight: 40,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: 8,
          background: "#fff",
          fontSize: 14,
          color: "#111",
        }}
      >
        {speakingText ? speakingText : isTalking ? "Speaking…" : "Ready."}
      </div>
    </div>
  );
}
