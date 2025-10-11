// apps/web/src/lib/api.js

// 1) Read the env var (from apps/web/.env). If missing, fall back to localhost.
//    We also log it so you can SEE what's happening in the browser console.
const envBase = import.meta.env.VITE_API_BASE;
const API_BASE = envBase && envBase.trim() ? envBase : "http://127.0.0.1:8000";
console.log("[api.js] VITE_API_BASE =", envBase);
console.log("[api.js] API_BASE resolved to:", API_BASE);

// Optional: quick connectivity test you can call from the UI if needed.
export async function ping() {
  const r = await fetch(`${API_BASE}/health`);
  return r.ok ? await r.json() : { ok: false, status: r.status };
}

export async function startSession(locale = "en-US") {
  const r = await fetch(`${API_BASE}/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale, consent: true }),
  });
  if (!r.ok) throw new Error("startSession failed");
  return r.json();
}

export async function postAnswer(payload) {
  const r = await fetch(`${API_BASE}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("postAnswer failed");
  return r.json();
}

export async function endSession(session_id) {
  const r = await fetch(`${API_BASE}/session/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id }),
  });
  if (!r.ok) throw new Error("endSession failed");
  return r.json();
}
