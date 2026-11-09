import { CONFIG } from './config.js';

export class ApiError extends Error {
  constructor(message, hint = null, code = null) {
    super(message);
    this.hint = hint;
    this.code = code;
  }
}

export const KEYS = { site: 'pk_site', student: 'pk_student_token', teacher: 'pk_teacher_token' };

// localStorage kann (z. B. im privaten Modus) fehlen oder Fehler werfen
export const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* ignorieren */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* ignorieren */ } },
};

export const isConfigured = () => Boolean(CONFIG.supabaseUrl && CONFIG.supabaseKey);

let onAuthLost = () => {};
export function setAuthLostHandler(fn) { onAuthLost = fn; }

const FRIENDLY = {
  '23505': 'Dieser Eintrag existiert bereits.',
  '22007': 'Bitte prüfe die Datums- bzw. Zeitangabe.',
  '22008': 'Bitte prüfe die Datums- bzw. Zeitangabe.',
  '22P02': 'Eine Eingabe hat ein ungültiges Format.',
};

/** Ruft eine Datenbankfunktion (Supabase RPC) auf. */
export async function rpc(fn, params = {}) {
  const url = `${CONFIG.supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`;
  const headers = { 'Content-Type': 'application/json', apikey: CONFIG.supabaseKey };
  // Ältere "anon"-Schlüssel sind JWTs und gehören zusätzlich in den Authorization-Header.
  // Neue "publishable keys" dürfen nur im apikey-Header stehen.
  if (CONFIG.supabaseKey.startsWith('eyJ')) headers.Authorization = `Bearer ${CONFIG.supabaseKey}`;

  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(params) });
  } catch {
    throw new ApiError('Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung und versuche es erneut.');
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  if (!res.ok) {
    const code = data && data.code;
    const message = (code && FRIENDLY[code]) || (data && data.message) || `Serverfehler (${res.status}). Bitte versuche es später erneut.`;
    const err = new ApiError(message, data && data.hint, code || null);
    if (err.hint === 'session' || err.hint === 'site') {
      for (const key of Object.values(KEYS)) {
        if ((err.hint === 'site' && key === KEYS.site) || (params.p_token && store.get(key) === params.p_token)) store.del(key);
      }
      onAuthLost(err);
    }
    throw err;
  }
  if (data && typeof data === 'object' && !Array.isArray(data) && typeof data.error === 'string') {
    throw new ApiError(data.error);
  }
  return data;
}
