// PDF "Informationen für die besuchende Lehrkraft":
// Seite 1 = Daten des Schülers, ab Seite 2 = Gesprächsleitfaden (assets/gespraechsleitfaden.pdf).
// Die PDF wird vollständig im Browser erzeugt – es werden keine Daten an Dritte übertragen.
import { TEXTS, gradeLabel, SCHOOL_SHORT } from './common.js';
import { fmt } from './ui.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error(`Die Datei ${src} konnte nicht geladen werden.`));
    document.head.appendChild(el);
  });
}

async function libs() {
  if (!window.PDFLib) await loadScript('vendor/pdf-lib.min.js');
  if (!window.fontkit) await loadScript('vendor/fontkit.umd.min.js');
  return { PDFLib: window.PDFLib, fontkit: window.fontkit };
}

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Die Datei ${url} konnte nicht geladen werden.`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Text in Zeilen umbrechen, die höchstens maxWidth breit sind. */
function wrap(text, font, size, maxWidth) {
  const out = [];
  for (const para of String(text ?? '').split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) { line = candidate; continue; }
      if (line) out.push(line);
      // sehr lange Wörter (z. B. E-Mail-Adressen) hart umbrechen
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth) {
        let i = rest.length - 1;
        while (i > 1 && font.widthOfTextAtSize(rest.slice(0, i), size) > maxWidth) i -= 1;
        out.push(rest.slice(0, i));
        rest = rest.slice(i);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

export async function createVisitPdf(s, cls) {
  const { PDFLib, fontkit } = await libs();
  const { PDFDocument, rgb } = PDFLib;
  const [regBytes, boldBytes, guideBytes] = await Promise.all([
    fetchBytes('assets/fonts/LiberationSans-Regular.ttf'),
    fetchBytes('assets/fonts/LiberationSans-Bold.ttf'),
    fetchBytes('assets/gespraechsleitfaden.pdf'),
  ]);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(regBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });

  const name = `${s.first_name} ${s.last_name}`;
  doc.setTitle(`Praktikumsbesuch – ${name}`);
  doc.setSubject('Informationen für die besuchende Lehrkraft');
  doc.setAuthor(`Praktikumsportal – ${SCHOOL_SHORT}`);
  doc.setCreator('Praktikumsportal');
  doc.setLanguage('de-DE');

  const W = 595.28;
  const H = 841.89;
  const M = 56;
  const contentW = W - 2 * M;
  const ink = rgb(0.11, 0.14, 0.19);
  const muted = rgb(0.38, 0.42, 0.48);
  const accent = rgb(0.11, 0.31, 0.57);
  const danger = rgb(0.71, 0.14, 0.09);
  const line = rgb(0.85, 0.87, 0.9);

  let page = doc.addPage([W, H]);
  let y = H - M;

  const text = (str, { f = font, size = 10.5, color = ink, x = M, maxWidth = contentW, gap = 1.35 } = {}) => {
    for (const l of wrap(str, f, size, maxWidth)) {
      page.drawText(l, { x, y: y - size, size, font: f, color });
      y -= size * gap;
    }
  };

  // Kopf
  text(SCHOOL_SHORT, { size: 9, color: muted });
  y -= 6;
  text('Informationen für die besuchende Lehrkraft', { f: bold, size: 19, color: ink, gap: 1.25 });
  text(`Praktikumsbesuch · erstellt am ${fmt.date(new Date())}`, { size: 10, color: muted });
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: line });
  y -= 18;

  const labelW = 160;
  const section = (title) => {
    y -= 4;
    text(title, { f: bold, size: 12.5, color: accent });
    y -= 4;
  };
  const row = (label, value, extra) => {
    const startY = y;
    const valueText = value === null || value === undefined || String(value).trim() === '' ? '–' : String(value);
    // Label
    let ly = startY;
    for (const l of wrap(label, bold, 10, labelW - 10)) {
      page.drawText(l, { x: M, y: ly - 10, size: 10, font: bold, color: muted });
      ly -= 13.5;
    }
    // Wert
    y = startY;
    text(valueText, { x: M + labelW, maxWidth: contentW - labelW, size: 10.5 });
    if (extra) {
      y -= 1;
      text(extra, { x: M + labelW, maxWidth: contentW - labelW, size: 9, f: bold, color: danger });
    }
    y = Math.min(y, ly) - 5;
  };

  section('Schülerin / Schüler');
  row('Name', name);
  row('Klasse', `${cls.name} (${gradeLabel(cls.grade)})`);
  row('E-Mail-Adresse', s.email);
  if (s.mobile_phone) row('Private Handynummer', s.mobile_phone, `Hinweis: ${TEXTS.pdfMobileNote}`);

  y -= 6;
  section('Betriebssteckbrief');
  row('Praktikumsbetrieb', s.company_name);
  row('Straße und Hausnummer', s.company_street);
  row('PLZ und Ort', [s.company_zip, s.company_city].filter(Boolean).join(' '));
  row('Entfernung zur Schule (Auto)', s.distance_km === null || s.distance_km === undefined ? null : `${String(s.distance_km).replace('.', ',')} km`);
  row('Praktikumsberuf', s.job_title);
  row('Betreuungsperson im Betrieb', s.supervisor_name);
  row('E-Mail der Betreuungsperson', s.supervisor_email);
  row('Telefon der Betreuungsperson', s.supervisor_phone);

  // Hinweis ganz unten auf Seite 1
  const noteSize = 10.5;
  const notePad = 14;
  // Anrede in eigener Zeile, Wortlaut unverändert
  const noteText = TEXTS.pdfColleague.replace(/^(Liebe Kollegin, lieber Kollege,)\s*/, '$1\n');
  const noteLines = wrap(noteText, font, noteSize, contentW - 2 * notePad);
  const noteH = noteLines.length * noteSize * 1.4 + 2 * notePad;
  const footerY = 34;
  let noteTop = footerY + 22 + noteH;
  if (y - 16 < noteTop) {
    page = doc.addPage([W, H]);
    y = H - M;
    noteTop = footerY + 22 + noteH;
  }
  page.drawRectangle({
    x: M, y: noteTop - noteH, width: contentW, height: noteH,
    color: rgb(0.93, 0.95, 0.98), borderColor: rgb(0.78, 0.84, 0.92), borderWidth: 0.8,
  });
  y = noteTop - notePad;
  for (const l of noteLines) {
    page.drawText(l, { x: M + notePad, y: y - noteSize, size: noteSize, font, color: ink });
    y -= noteSize * 1.4;
  }
  page.drawText('Vertraulich: Dieses Dokument enthält personenbezogene Daten und ist nur für den Praktikumsbesuch bestimmt.', {
    x: M, y: footerY, size: 7.5, font, color: muted,
  });

  // Gesprächsleitfaden ab Seite 2 anhängen
  const guide = await PDFDocument.load(guideBytes);
  const pages = await doc.copyPages(guide, guide.getPageIndices());
  pages.forEach((p) => doc.addPage(p));

  const bytes = await doc.save();
  const safe = (v) => String(v ?? '').trim().replace(/[\\/:*?"<>|\s]+/g, '_');
  return { bytes, filename: `Praktikumsbesuch_${safe(s.last_name)}_${safe(s.first_name)}.pdf` };
}
