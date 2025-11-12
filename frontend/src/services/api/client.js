/**
 * API client for the AI Health Agent frontend.
 * Reads VITE_API_BASE_URL from .env and falls back to localhost.
 */
const envBase = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE;
export const API_BASE = envBase && envBase.trim() ? envBase.trim() : "http://127.0.0.1:8000";

function withTimeout(ms = 8000) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(`timeout after ${ms}ms`), ms);
  return { signal: ctl.signal, cancel: () => clearTimeout(id) };
}

async function fetchJSON(url, opts = {}, { timeoutMs = 8000 } = {}) {
  const { signal, cancel } = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const msg = data?.detail || data?.message || `${res.status} ${res.statusText}`;
      throw new Error(`HTTP ${res.status}: ${msg}`);
    }
    return data;
  } finally {
    cancel();
  }
}

export async function ping() {
  return await fetchJSON(`${API_BASE}/health`, { method: "GET" }, { timeoutMs: 4000 });
}

export async function startSession(locale = "en-US") {
  return await fetchJSON(`${API_BASE}/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale, consent: true }),
  });
}

export async function postAnswer(payload) {
  return await fetchJSON(`${API_BASE}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function endSession(session_id) {
  return await fetchJSON(`${API_BASE}/session/end`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id }),
  });
}

// ---- Location + Chat ----
export const getLocation = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject("Not supported");
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject("Permission denied"),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 8000 }
    );
  });

export async function chat(input) {
  let location = null;
  try { location = await getLocation(); } catch {}
  return await fetchJSON(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: input, location }),
  });
}
