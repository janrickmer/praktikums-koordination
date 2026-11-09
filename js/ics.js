// Erzeugt Kalenderdateien im iCalendar-Format (RFC 5545), die sich in
// Outlook, Apple Kalender, Google Kalender, Thunderbird usw. importieren lassen.
import { appointmentEnd } from './common.js';

const pad = (n) => String(n).padStart(2, '0');
const utc = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const escText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Zeilen länger als 75 Byte müssen umbrochen werden
function fold(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const l = enc.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (len + l > limit) { parts.push(cur); cur = ''; len = 0; }
    cur += ch;
    len += l;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

/**
 * @param {Array<{uid:string,start:Date,end:Date,summary:string,location?:string,description?:string,url?:string}>} events
 */
export function buildIcs(events, calName = 'Praktikumstermine') {
  const now = utc(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GCLS Kassel//Praktikumsportal//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escText(calName)}`,
  ];
  for (const e of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART:${utc(e.start)}`);
    lines.push(`DTEND:${utc(e.end)}`);
    lines.push(`SUMMARY:${escText(e.summary)}`);
    if (e.location) lines.push(`LOCATION:${escText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escText(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

const firstUrl = (s) => (String(s ?? '').match(/\bhttps?:\/\/[^\s<>"']+/) || [null])[0];

/** Termin aus Sicht der Lehrkraft */
export function teacherEvent(a) {
  const name = `${a.first_name} ${a.last_name}`;
  const isVideo = a.kind === 'video';
  const companyAddress = [a.company_street, [a.company_zip, a.company_city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const desc = [
    `${isVideo ? 'Praktikumsgespräch per Videocall' : 'Praktikumsbesuch in Präsenz'}`,
    `Schüler/-in: ${name} (Klasse ${a.class_name})`,
    a.email ? `E-Mail: ${a.email}` : '',
    a.company_name ? `Betrieb: ${a.company_name}${companyAddress ? `, ${companyAddress}` : ''}` : '',
    a.supervisor_name ? `Betreuung im Betrieb: ${a.supervisor_name}${a.supervisor_phone ? `, Tel. ${a.supervisor_phone}` : ''}` : '',
    a.mobile_phone ? `Handy Schüler/-in (nur bei Schwierigkeiten beim Antreffen): ${a.mobile_phone}` : '',
    a.note ? `Hinweis: ${a.note}` : '',
  ].filter(Boolean).join('\n');
  return {
    uid: `praktikum-${a.student_id}@praktikumsportal`,
    start: new Date(a.start),
    end: appointmentEnd(a),
    summary: `${isVideo ? 'Praktikumsgespräch (Video)' : 'Praktikumsbesuch'}: ${name} (${a.class_name})`,
    location: a.location || (isVideo ? '' : [a.company_name, companyAddress].filter(Boolean).join(', ')),
    description: desc,
    url: firstUrl(a.location),
  };
}

/** Termin aus Sicht des Schülers */
export function studentEvent(studentId, appt, kind, teacherName) {
  const isVideo = kind === 'video';
  return {
    uid: `praktikum-schueler-${studentId}@praktikumsportal`,
    start: new Date(appt.start),
    end: appointmentEnd(appt),
    summary: isVideo ? `Praktikumsgespräch per Videocall mit ${teacherName}` : `Praktikumsbesuch durch ${teacherName}`,
    location: appt.location || '',
    description: [isVideo ? 'Praktikumsgespräch per Videocall' : 'Praktikumsbesuch in Präsenz', `Lehrkraft: ${teacherName}`, appt.note ? `Hinweis: ${appt.note}` : ''].filter(Boolean).join('\n'),
    url: firstUrl(appt.location),
  };
}
