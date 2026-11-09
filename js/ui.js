// Kleine Hilfsfunktionen für Darstellung und Formulare.
// Alle Werte, die in html`...` eingesetzt werden, werden automatisch maskiert
// (Schutz vor eingeschleustem HTML). raw() nur für eigenen, vertrauenswürdigen Code.

export class Safe {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Safe(String(s ?? ''));

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function val(v) {
  if (v instanceof Safe) return v.s;
  if (Array.isArray(v)) return v.map(val).join('');
  if (v === null || v === undefined || v === false) return '';
  return esc(v);
}

export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += val(v) + strings[i + 1]; });
  return new Safe(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function render(el, content) {
  el.innerHTML = String(content);
}

// Navigations-Token: Eine Seite, deren Daten erst nach einem Seitenwechsel ankommen,
// darf die neue Seite nicht mehr überschreiben.
let navGen = 0;
export const bumpNav = () => ++navGen;
export const navToken = () => navGen;
export const isStale = (tok) => tok !== navGen;

const DEFAULT_COVER = '#2a5fd0';

/**
 * Rahmen der Seite: Farbe des Umschlags (Kopfband), Bereichsname, Benutzer, Aktionen.
 * band: 'cover' = Klassenfarbe, 'ink' = dunkles Lehrkräfte-Band.
 */
export function setHeader({ area = '', user = '', actions = null, cover = DEFAULT_COVER, band = 'cover' } = {}) {
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--cover', cover || DEFAULT_COVER);
  document.body.dataset.band = band;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', band === 'ink' ? '#1d2633' : (cover || DEFAULT_COVER));
  const area$ = document.getElementById('header-area');
  if (area$) area$.textContent = area || '';
  const el = document.getElementById('header-right');
  if (!el) return;
  render(el, html`
    ${user ? html`<span class="header-user">${user}</span>` : ''}
    ${actions || ''}`);
}

/**
 * Kopfband einer Seite in der Umschlagfarbe.
 * crumbs: Brotkrumen (HTML), title: Überschrift, sub: Unterzeile, aside: rechter Bereich (z. B. Etikett),
 * tabs: Navigation im Band, lift: Inhalt überlappt das Band (für einzelne Formulare).
 */
export function band({ crumbs = '', title = '', sub = '', aside = '', tabs = '', lift = false } = {}) {
  return html`<section class="band ${lift ? 'band--lift' : ''} ${tabs ? 'band--tabs' : ''}">
    <div class="wrap">
      ${tabs || ''}
      ${crumbs ? html`<div class="band__crumbs">${crumbs}</div>` : ''}
      <div class="band__row">
        <div class="band__title">
          <h1>${title}</h1>
          ${sub ? html`<p class="band__sub">${sub}</p>` : ''}
        </div>
        ${aside ? html`<div class="band__aside">${aside}</div>` : ''}
      </div>
    </div>
  </section>`;
}

/** Heft-Etikett: Zeilen aus [Bezeichnung, Wert] */
export function etikett(rows, extra = '') {
  return html`<div class="etikett">
    ${rows.filter(Boolean).map(([label, value]) => html`<div class="etikett__row"><span class="etikett__label">${label}</span><span class="etikett__value">${value}</span></div>`)}
    ${extra}
  </div>`;
}


/** Text mit Zeilenumbrüchen und anklickbaren Links (sicher maskiert). */
export function richText(text) {
  const s = String(text ?? '');
  const re = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;
  let out = '';
  let last = 0;
  for (const m of s.matchAll(re)) {
    out += esc(s.slice(last, m.index));
    out += `<a href="${esc(m[0])}" target="_blank" rel="noopener noreferrer">${esc(m[0])}</a>`;
    last = m.index + m[0].length;
  }
  out += esc(s.slice(last));
  return raw(out.replace(/\r?\n/g, '<br>'));
}

export function formValues(form) {
  const out = {};
  for (const [k, v] of new FormData(form)) out[k] = typeof v === 'string' ? v : '';
  return out;
}

/** Führt fn aus, sperrt dabei den Button und zeigt Fehler im Formular an. */
export async function submitting(form, fn) {
  const button = form.querySelector('[type=submit]');
  const errorBox = form.querySelector('.form-error');
  if (errorBox) { errorBox.textContent = ''; errorBox.hidden = true; }
  const label = button ? button.innerHTML : '';
  if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = 'Bitte warten …'; }
  try {
    return await fn();
  } catch (e) {
    if (errorBox) { errorBox.textContent = e.message || String(e); errorBox.hidden = false; }
    else toast(e.message || String(e), 'error');
    return undefined;
  } finally {
    if (button && button.isConnected) { button.disabled = false; button.removeAttribute('aria-busy'); button.innerHTML = label; }
  }
}

/** Für einfache Buttons ohne Formular. */
export async function busy(button, fn) {
  const label = button.innerHTML;
  button.disabled = true;
  try {
    return await fn();
  } catch (e) {
    toast(e.message || String(e), 'error');
    return undefined;
  } finally {
    if (button.isConnected) { button.disabled = false; button.innerHTML = label; }
  }
}

export function toast(message, type = 'ok') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  // höchstens zwei Meldungen gleichzeitig
  while (root.children.length >= 2) root.firstElementChild.remove();
  root.appendChild(el);
  setTimeout(() => el.classList.add('toast--out'), type === 'error' ? 6000 : 3200);
  setTimeout(() => el.remove(), type === 'error' ? 6300 : 3500);
}

export function go(hash) {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

/** Dateiname ohne Sonderzeichen (manche Systeme verwerfen sonst den Namen). */
export function fileSafe(name) {
  return String(name ?? '')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
    .replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_(?=\.)|_$/g, '');
}

export function download(filename, data, type) {
  filename = fileSafe(filename) || 'download';
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('In die Zwischenablage kopiert.');
  } catch {
    toast('Kopieren nicht möglich – bitte manuell markieren.', 'error');
  }
}

// ---------------------------------------------------------------------
//  Datum & Zeit (Anzeige in der Zeitzone des Browsers)
// ---------------------------------------------------------------------
const df = (opts) => new Intl.DateTimeFormat('de-DE', opts);
const F = {
  date: df({ day: '2-digit', month: '2-digit', year: 'numeric' }),
  dateShort: df({ day: '2-digit', month: '2-digit' }),
  time: df({ hour: '2-digit', minute: '2-digit' }),
  weekday: df({ weekday: 'long' }),
  weekdayShort: df({ weekday: 'short' }),
  monthYear: df({ month: 'long', year: 'numeric' }),
  long: df({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
};
export const fmt = {
  date: (d) => F.date.format(new Date(d)),
  dateShort: (d) => F.dateShort.format(new Date(d)),
  time: (d) => F.time.format(new Date(d)),
  weekday: (d) => F.weekday.format(new Date(d)),
  weekdayShort: (d) => F.weekdayShort.format(new Date(d)),
  monthYear: (d) => F.monthYear.format(new Date(d)),
  long: (d) => F.long.format(new Date(d)),
  dateTime: (d) => `${F.date.format(new Date(d))}, ${F.time.format(new Date(d))} Uhr`,
  km: (v) => (v === null || v === undefined || v === '' ? '' : `${String(v).replace('.', ',')} km`),
};

const pad = (n) => String(n).padStart(2, '0');
/** yyyy-mm-dd in lokaler Zeit */
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** hh:mm in lokaler Zeit */
export const isoTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** Datum + Uhrzeit aus Formularfeldern (lokale Zeit) */
export function localDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}
