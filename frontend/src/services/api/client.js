/**
 * API client for the AI Health Agent frontend.
 * Reads VITE_API_BASE_URL or VITE_API_BASE from .env and falls back to localhost.
 * Adds a short timeout so UI never hangs.
 */
const envBase = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE;
export const API_BASE = envBase && envBase.trim() ? envBase.trim() : "http://127.0.0.1:8000";

function withTimeout(ms = 7000) {
  const ctl = new AbortController();
  const id = setTimeout(() => ctl.abort(new Error(`timeout after ${ms}ms`)), ms);
  return { signal: ctl.signal, cancel: () => clearTimeout(id) };
}

async function fetchJSON(url, opts = {}, { timeoutMs = 7000 } = {}) {
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
  try {
    return await fetchJSON(`${API_BASE}/health`, { method: "GET" }, { timeoutMs: 4000 });
  } catch (err) {
    return { ok: false, error: String(err) };
  }
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
