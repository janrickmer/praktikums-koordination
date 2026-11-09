// Kalender der Lehrkraft: Wochenansicht aller fest terminierten
// Praktikumsbesuche und Videocalls + ICS-Export
import { rpc } from './api.js';
import { html, raw, render, $, fmt, isoDate, go, download, band, navToken, isStale } from './ui.js';
import { appointmentEnd, sortName, coverHex } from './common.js';
import { icon } from './icons.js';
import { buildIcs, teacherEvent } from './ics.js';

const HOUR_PX = 64;

function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function parseWeek(query) {
  const v = query && query.get('woche');
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number);
    return startOfWeek(new Date(y, m - 1, d));
  }
  return startOfWeek(new Date());
}
function isoWeekNumber(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 86400000 + 1) / 7);
}
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const minutesOfDay = (d) => d.getHours() * 60 + d.getMinutes();

// Überschneidende Termine nebeneinander anordnen
function layoutDay(events) {
  const sorted = [...events].sort((a, b) => a.startD - b.startD || b.endD - a.endD);
  let cluster = [];
  let clusterEnd = 0;
  const finish = () => {
    const cols = [];
    for (const e of cluster) {
      let i = cols.findIndex((end) => end <= +e.startD);
      if (i === -1) { i = cols.length; cols.push(0); }
      cols[i] = +e.endD;
      e.col = i;
    }
    for (const e of cluster) e.cols = cols.length;
  };
  for (const e of sorted) {
    if (cluster.length && +e.startD >= clusterEnd) { finish(); cluster = []; clusterEnd = 0; }
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, +e.endD);
  }
  if (cluster.length) finish();
  return sorted;
}

const kindLabel = (k) => (k === 'video' ? 'Videocall' : 'Präsenz');
const kindIcon = (k, size = 14) => icon(k === 'video' ? 'video' : 'building', { size });
const studentLink = (a) => `#/lehrkraft/klasse/${a.class_id}/schueler/${a.student_id}`;

export async function renderCalendar(main, query, { token, subnav }) {
  const tok = navToken();
  const data = await rpc('teacher_get_appointments', { p_token: token });
  if (isStale(tok)) return;
  const weekStart = parseWeek(query);
  const weekEnd = addDays(weekStart, 7);
  const today = new Date();
  const all = data.appointments.map((a) => ({ ...a, startD: new Date(a.start), endD: appointmentEnd(a) }));
  const inWeek = all.filter((a) => a.startD >= weekStart && a.startD < weekEnd);
  const hasWeekend = inWeek.some((a) => [0, 6].includes(a.startD.getDay()));
  const days = Array.from({ length: hasWeekend ? 7 : 5 }, (_, i) => addDays(weekStart, i));

  let minH = 7;
  let maxH = 18;
  for (const a of inWeek) {
    minH = Math.min(minH, a.startD.getHours());
    const endMin = sameDay(a.startD, a.endD) ? minutesOfDay(a.endD) : 24 * 60;
    maxH = Math.max(maxH, Math.ceil(endMin / 60));
  }
  maxH = Math.min(24, Math.max(maxH, minH + 1));
  const bodyHeight = (maxH - minH) * HOUR_PX;
  const next = all.find((a) => a.startD >= weekEnd);
  const prevAppt = [...all].reverse().find((a) => a.startD < weekStart);

  const eventBlock = (a) => {
    const top = ((minutesOfDay(a.startD) - minH * 60) / 60) * HOUR_PX;
    const endMin = sameDay(a.startD, a.endD) ? minutesOfDay(a.endD) : maxH * 60;
    const height = Math.max(30, ((endMin - minutesOfDay(a.startD)) / 60) * HOUR_PX - 2);
    const width = 100 / a.cols;
    // kurze Termine: Uhrzeit und Name, Klasse/Format nur im Tooltip
    const narrow = a.cols > 1;
    return html`<a class="event event--${a.kind} ${height < 58 ? 'event--compact' : ''} ${narrow ? 'event--narrow' : ''}" href="${studentLink(a)}"
        style="--cover:${coverHex({ id: a.class_id, cover: a.cover })};top:${top}px;height:${height}px;left:calc(${a.col * width}% + 2px);width:calc(${width}% - 4px)"
        title="${fmt.time(a.startD)}–${fmt.time(a.endD)} ${a.first_name} ${a.last_name} (${a.class_name}) · ${kindLabel(a.kind)}">
      <span class="event__time">${kindIcon(a.kind, 13)}${narrow ? fmt.time(a.startD) : html`${fmt.time(a.startD)}–${fmt.time(a.endD)}`}</span>
      <span class="event__title">${a.first_name} ${a.last_name}</span>
      <span class="event__meta">${a.class_name} · ${kindLabel(a.kind)}</span>
    </a>`;
  };

  render(main, html`
    ${band({
      tabs: subnav,
      title: 'Kalender',
      sub: 'Fest terminierte Praktikumsbesuche und Videocalls, die du selbst durchführst.',
      aside: html`<div class="band__actions">
        <button type="button" class="btn btn--band btn--small" id="ics-week" ${raw(inWeek.length ? '' : 'disabled')}>${icon('download', { size: 15 })} Diese Woche (.ics)</button>
        <button type="button" class="btn btn--band-solid btn--small" id="ics-all" ${raw(all.length ? '' : 'disabled')}>${icon('download', { size: 15 })} Alle Termine (.ics)</button>
      </div>`,
    })}
    <div class="wrap page-body cal-layout">
    <div class="cal-toolbar">
      <div class="cal-toolbar__nav">
        <a class="btn btn--small" href="#/lehrkraft/kalender?woche=${isoDate(addDays(weekStart, -7))}" aria-label="Vorherige Woche">${icon('arrowLeft', { size: 15 })} Vorherige</a>
        <a class="btn btn--small" href="#/lehrkraft/kalender?woche=${isoDate(startOfWeek(today))}">Heute</a>
        <a class="btn btn--small" href="#/lehrkraft/kalender?woche=${isoDate(addDays(weekStart, 7))}" aria-label="Nächste Woche">Nächste ${icon('arrowRight', { size: 15 })}</a>
      </div>
      <h2 class="cal-toolbar__title">KW ${isoWeekNumber(weekStart)} <span class="muted">· ${fmt.dateShort(weekStart)} – ${fmt.date(addDays(weekStart, 6))}</span></h2>
      <label class="cal-toolbar__jump"><span class="small muted">Springe zu</span>
        <input type="date" id="week-jump" value="${isoDate(weekStart)}"></label>
    </div>

    <div class="week-wrap">
      <div class="week" style="--days:${days.length}">
        <div class="week__head">
          <div class="week__corner"></div>
          ${days.map((d) => html`<div class="week__dayhead ${sameDay(d, today) ? 'is-today' : ''}">
            <span>${fmt.weekdayShort(d)}</span> <strong>${fmt.dateShort(d)}</strong></div>`)}
        </div>
        <div class="week__body" style="height:${bodyHeight}px;--hour:${HOUR_PX}px">
          <div class="week__times">
            ${Array.from({ length: maxH - minH }, (_, i) => html`<span style="top:${i * HOUR_PX}px">${String(minH + i).padStart(2, '0')}:00</span>`)}
          </div>
          ${days.map((d) => html`<div class="week__day ${sameDay(d, today) ? 'is-today' : ''}">
            ${layoutDay(inWeek.filter((a) => sameDay(a.startD, d))).map(eventBlock)}
          </div>`)}
        </div>
      </div>
    </div>

    ${!inWeek.length ? html`<p class="muted cal-empty">In dieser Woche sind keine Termine eingetragen.
      ${next ? html`<a href="#/lehrkraft/kalender?woche=${isoDate(startOfWeek(next.startD))}">Zum nächsten Termin (${fmt.date(next.startD)}) ${icon('arrowRight', { size: 14 })}</a>` : ''}
      ${!next && prevAppt ? html`<a href="#/lehrkraft/kalender?woche=${isoDate(startOfWeek(prevAppt.startD))}">${icon('arrowLeft', { size: 14 })} Zum letzten Termin (${fmt.date(prevAppt.startD)})</a>` : ''}</p>` : ''}

    <div class="dash-bottom">
      <section class="sheet">
        <h2 class="sheet__title">Termine dieser Woche</h2>
        ${inWeek.length ? html`<ul class="agenda">
          ${inWeek.map((a) => html`<li style="--cover:${coverHex({ id: a.class_id, cover: a.cover })}">
            <span class="agenda__dot" aria-hidden="true"></span>
            <div>
              <a href="${studentLink(a)}"><strong>${fmt.weekday(a.startD)}, ${fmt.date(a.startD)}</strong>, ${fmt.time(a.startD)}–${fmt.time(a.endD)} Uhr</a>
              <div>${a.first_name} ${a.last_name} <span class="muted">(${a.class_name})</span> <span class="tag tag--cover">${kindIcon(a.kind)}${kindLabel(a.kind)}</span></div>
              ${a.location ? html`<div class="small muted">${a.location}</div>` : ''}
            </div>
          </li>`)}
        </ul>` : html`<p class="muted">Keine Termine.</p>`}
      </section>
      <section class="sheet">
        <h2 class="sheet__title">Noch ohne festen Termin</h2>
        <p class="small muted">Schüler/-innen mit „Praktikumsbesuch durch mich“ oder „Videocall“, für die noch kein Termin festgelegt ist.</p>
        ${data.unscheduled.length ? html`<ul class="plain-list">
          ${data.unscheduled.map((u) => html`<li><a href="${studentLink(u)}">${sortName(u)}</a>
            <span class="muted small">(${u.class_name}) · ${kindLabel(u.kind)}</span></li>`)}
        </ul>` : html`<p class="muted">Alle sind terminiert.</p>`}
      </section>
    </div>
    </div>`);

  $('#week-jump').addEventListener('change', (e) => {
    if (e.target.value) go(`#/lehrkraft/kalender?woche=${e.target.value}`);
  });
  const exportIcs = (list, name) => download(name, buildIcs(list.map(teacherEvent), 'Praktikumstermine'), 'text/calendar;charset=utf-8');
  $('#ics-week').addEventListener('click', () => exportIcs(inWeek, `Praktikumstermine_KW${isoWeekNumber(weekStart)}.ics`));
  $('#ics-all').addEventListener('click', () => exportIcs(all, 'Praktikumstermine_alle.ics'));
}
