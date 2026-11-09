// Gemeinsame Inhalte und Regeln für Schüler- und Lehrkräfte-Ansicht
import { raw } from './ui.js';

export const TEXTS = {
  visitInitial:
    'In diesem Fenster tauchen spätestens am ersten Tag deines Praktikums weitere Informationen dazu auf, was du bzgl. deines Praktikumsbesuchs zu beachten hast. Schaue hier spätestens an deinem ersten Praktikumstag nach, um den Aufforderungen zu folgen, die hier erscheinen werden.',
  infoDefault:
    'Hier tauchen bald (spätestens am ersten Praktikumstag) weitere Informationen auf. Bitte schaue häufig vorbei, damit dir keine wichtigen Informationen entgehen.',
  mobileHint:
    'Damit die besuchende Lehrkraft dich erreichen kann, falls sie dich nicht findet, kann es sinnvoll sein, deine private Handynummer hier einzutragen. Das ist freiwillig.',
  sickness:
    'Im Krankheitsfall melden Sie sich bitte 1. per E-Mail bei Ihrer bzw. Ihrem PoWi-Lehrer/-in und 2. telefonisch bei Ihrem Arbeitgeber und 3. im Sekretariat der Schule frühzeitig ab.',
  pdfColleague:
    'Liebe Kollegin, lieber Kollege, auf den folgenden Seiten dieser PDF-Datei findest du einen Gesprächsleitfaden für den Praktikumsbesuch. Dieser ist keine Pflicht, sondern lediglich eine Hilfestellung für dich, falls du dich gerne dadurch anleiten lassen möchtest. Vielen Dank für deine Unterstützung.',
  pdfMobileNote:
    'Diese Nummer darf nur verwendet werden, wenn es beim Antreffen zum Praktikumsbesuch Schwierigkeiten gibt.',
};

export const SCHOOL_SHORT = 'Georg-Christoph-Lichtenberg-Schule Kassel';

export const STECKBRIEF_FIELDS = [
  { key: 'company_name', label: 'Name des Praktikumsbetriebs' },
  { key: 'company_street', label: 'Straße und Hausnummer' },
  { key: 'company_zip', label: 'Postleitzahl' },
  { key: 'company_city', label: 'Ort' },
  { key: 'distance_km', label: 'Entfernung zur Schule (km, Auto)' },
  { key: 'job_title', label: 'Praktikumsberuf' },
  { key: 'supervisor_name', label: 'Betreuungsperson im Betrieb' },
  { key: 'supervisor_email', label: 'E-Mail-Adresse der Betreuungsperson' },
  { key: 'supervisor_phone', label: 'Telefonnummer der Betreuungsperson' },
];

export const LODGING_FIELDS = [
  { key: 'lodging_name', label: 'Name der Person, bei der du wohnst' },
  { key: 'lodging_relation', label: 'Verhältnis zu dieser Person' },
  { key: 'lodging_contact', label: 'Kontaktmöglichkeit im Notfall' },
];

const empty = (v) => v === null || v === undefined || String(v).trim() === '';

/** Fehlende Angaben eines Schülers, gruppiert nach Bereich. */
export function missingData(s) {
  const groups = [];
  const steck = STECKBRIEF_FIELDS.filter((f) => empty(s[f.key])).map((f) => f.label);
  if (steck.length) groups.push({ section: 'Betriebssteckbrief', link: '#/steckbrief', fields: steck });
  if (s.lodging_away === null || s.lodging_away === undefined) {
    groups.push({ section: 'Unterkunft während des Praktikums', link: '#/steckbrief?fokus=unterkunft', fields: ['Angabe, ob du während des Praktikums woanders wohnst'] });
  } else if (s.lodging_away) {
    const lod = LODGING_FIELDS.filter((f) => empty(s[f.key])).map((f) => f.label);
    if (lod.length) groups.push({ section: 'Unterkunft während des Praktikums', link: '#/steckbrief?fokus=unterkunft', fields: lod });
  }
  if (empty(s.class_team)) groups.push({ section: 'Klassenteam', link: '#/klassenteam', fields: ['Kürzel deiner Lehrkräfte'] });
  return groups;
}

export const missingCount = (s) => missingData(s).reduce((n, g) => n + g.fields.length, 0);

/** Kürzel aus dem Freitext lesen (Komma, Semikolon, Leerzeichen, Zeilenumbruch, Schrägstrich). */
export function parseKuerzel(text) {
  const seen = new Map();
  for (const part of String(text ?? '').split(/[\s,;/|+&]+/)) {
    const k = part.replace(/^[.\-–()]+|[.\-–()]+$/g, '').trim();
    if (!k || k.toLowerCase() === 'und') continue;
    const key = k.toUpperCase();
    if (!seen.has(key)) seen.set(key, k);
  }
  return [...seen.entries()].map(([key, original]) => ({ key, original }));
}

export function visitKind(s) {
  if (s.visit_format === 'video') return 'video';
  if (s.visit_format === 'praesenz') return s.visit_by_me ? 'me' : 'other';
  return 'none';
}

export const gradeLabel = (g) => (String(g) === '11' ? 'Jg. 11 (E-Phase)' : 'Jg. 9');

export const fullName = (s) => `${s.first_name} ${s.last_name}`;
export const sortName = (s) => `${s.last_name}, ${s.first_name}`;

export const suitcaseIcon = (title = 'Wohnt während des Praktikums woanders') => raw(
  `<svg class="icon-suitcase" viewBox="0 0 24 24" width="18" height="18" role="img" aria-label="${title}"><title>${title}</title>` +
  '<path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
  '<rect x="3.5" y="6" width="17" height="13" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
  '<path d="M8 6v13M16 6v13" stroke="currentColor" stroke-width="1.8"/>' +
  '<circle cx="7" cy="20.5" r="1" fill="currentColor"/><circle cx="17" cy="20.5" r="1" fill="currentColor"/></svg>',
);

export const DEFAULT_DURATION_MIN = 45;
export const appointmentEnd = (a) => (a.end ? new Date(a.end) : new Date(new Date(a.start).getTime() + DEFAULT_DURATION_MIN * 60000));
