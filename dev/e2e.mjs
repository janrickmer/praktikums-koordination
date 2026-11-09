// End-to-End-Test aller Abläufe im Browser (Playwright + lokaler Entwicklungsserver).
// Voraussetzung: dev/server.mjs läuft auf BASE_URL mit frisch eingerichteter Datenbank
// (schema.sql + app.set_access_codes(SITE_PASSWORD, TEACHER_CODE), Standard: 'test-seite' / 'Test-Code').
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';

// Playwright wird per require geladen, damit auch eine global installierte Version gefunden wird
const { chromium } = createRequire(import.meta.url)('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const SITE_PW = process.env.SITE_PASSWORD || 'test-seite';
const TEACHER_CODE = process.env.TEACHER_CODE || 'Test-Code';
const SHOTS = process.env.SHOTS || path.resolve('screenshots');
await mkdir(SHOTS, { recursive: true });

const browser = await chromium.launch();
const errors = [];
const run = Date.now().toString(36);
let step = 0;
const log = (msg) => console.log(`  ✓ ${String(++step).padStart(2, '0')} ${msg}`);

async function newPage(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 400/.test(m.text())) errors.push(`console: ${m.text()}`); });
  page.on('dialog', (d) => d.accept());
  return page;
}
const shot = (page, name, fullPage = true) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });
const rpc = (page, fn, params) => page.evaluate(async ([f, p]) => {
  const r = await fetch(`/rest/v1/rpc/${f}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
  return r.json();
}, [fn, params]);

async function passGate(page) {
  await page.goto(BASE);
  await page.fill('#gate-form input[name=password]', 'falsch');
  await page.click('#gate-form button[type=submit]');
  await page.waitForSelector('#gate-form .form-error:not([hidden])');
  await page.fill('#gate-form input[name=password]', SITE_PW);
  await page.click('#gate-form button[type=submit]');
}

// ---------------------------------------------------------------------
console.log('Lehrkraft: Registrierung & Klassen');
const teacher = await newPage();
await passGate(teacher);
await teacher.waitForSelector('#login-form');
await shot(teacher, '01-schueler-login');
await teacher.click('footer a:has-text("Lehrkräfte-Ansicht")');
await teacher.click('a:has-text("Benutzerkonto registrieren")');
const tEmail = `beispiel-${run}@schule.example`;
await teacher.fill('input[name=first_name]', 'Jana');
await teacher.fill('input[name=last_name]', 'Beispiel');
await teacher.fill('input[name=email]', tEmail);
await teacher.fill('input[name=password]', 'geheim123');
await teacher.fill('input[name=password2]', 'geheim124');
await teacher.fill('input[name=teacher_code]', TEACHER_CODE);
await teacher.click('#treg-form button[type=submit]');
await teacher.waitForSelector('#treg-form .form-error:has-text("stimmen nicht")');
await teacher.fill('input[name=password2]', 'geheim123');
await teacher.fill('input[name=teacher_code]', 'XYZ');
await teacher.click('#treg-form button[type=submit]');
await teacher.waitForSelector('#treg-form .form-error:has-text("Lehrkräfte-Code")');
await teacher.fill('input[name=teacher_code]', TEACHER_CODE.toLowerCase());
await teacher.click('#treg-form button[type=submit]');
await teacher.waitForSelector('h1:has-text("Meine Klassen")');
log('Lehrkraft registriert (Passwortbestätigung + Lehrkräfte-Code geprüft)');

async function createClass(grade, name) {
  await teacher.click('#wizard-open');
  await teacher.click(`[data-grade="${grade}"]`);
  await teacher.fill('#wizard-form input[name=name]', name);
  await teacher.click('#wizard-form button[type=submit]');
  await teacher.waitForSelector('.join-code--big');
  const code = (await teacher.textContent('.join-code--big')).trim();
  await teacher.click('#wizard-close');
  return code;
}
const code9 = await createClass('9', '9b');
const code11 = await createClass('11', 'E-Phase PoWi 1');
assert.match(code9, /^[A-Z2-9]{6}$/);
assert.notEqual(code9, code11);
log(`Klassen angelegt (9b: ${code9}, E-Phase: ${code11})`);

await teacher.click('.subnav a:has-text("Profil")');
await teacher.fill('input[name=contact_name]', 'Frau Beispiel');
await teacher.fill('input[name=contact_phone]', '0561 123456');
await teacher.click('#profile-form button[type=submit]');
await teacher.waitForSelector('.toast:has-text("gespeichert")');
log('Notfallkontakt gespeichert');

// ---------------------------------------------------------------------
console.log('Schüler: Registrierung, Klasse, Steckbrief, Klassenteam');
const student = await newPage({ width: 390, height: 844 });
await passGate(student);
await student.click('a:has-text("Jetzt registrieren")');
const sEmail = `max-${run}@schule.example`;
await student.fill('input[name=first_name]', 'Max');
await student.fill('input[name=last_name]', 'Mustermann');
await student.fill('input[name=email]', sEmail);
await student.fill('input[name=password]', 'schueler1');
await student.fill('input[name=password2]', 'schueler1');
await student.click('#register-form button[type=submit]');
await student.waitForSelector('#join-form');
await student.fill('#join-form input[name=code]', 'FALSCH');
await student.click('#join-form button[type=submit]');
await student.waitForSelector('#join-form .form-error:has-text("nicht bekannt")');
await student.fill('#join-form input[name=code]', code9.toLowerCase());
await student.click('#join-form button[type=submit]');
await student.waitForSelector('#steckbrief-form');
log('Schüler registriert und Klasse beigetreten (falscher Code abgewiesen)');

await student.fill('input[name=company_name]', 'Autohaus Kassel GmbH');
await student.fill('input[name=company_street]', 'Werkstraße 5');
await student.fill('input[name=company_zip]', '34117');
await student.fill('input[name=company_city]', 'Kassel');
await student.fill('input[name=distance_km]', '12,5');
await student.fill('input[name=job_title]', 'Kfz-Mechatroniker');
assert.equal(await student.isHidden('#lodging-fields'), true);
await student.check('input[name=lodging_away][value=true]');
assert.equal(await student.isVisible('#lodging-fields'), true);
await student.fill('input[name=lodging_name]', 'Erika Mustermann');
await student.fill('input[name=lodging_relation]', 'Oma');
await shot(student, '02-schueler-steckbrief-mobil');
await student.click('#steckbrief-form button[type=submit]');
await student.waitForSelector('#team-form');
await student.fill('textarea[name=class_team]', 'FEI, MÜL; sch KRA');
await student.waitForSelector('#kuerzel-preview .chip >> nth=3');
await student.click('#team-form button[type=submit]');
await student.waitForSelector('h1:has-text("Praktikums-Dashboard")');
const notice = await student.textContent('.notice--danger');
assert.match(notice, /Betreuungsperson/);
assert.match(notice, /Kontaktmöglichkeit im Notfall/);
assert.doesNotMatch(notice, /Klassenteam/);
assert.match(await student.textContent('#praktikumsbesuch'), /spätestens am ersten Tag deines Praktikums/);
assert.match(await student.textContent('.card--sick'), /Im Krankheitsfall melden Sie sich bitte 1\. per E-Mail/);
assert.match(await student.textContent('.card--emergency'), /Frau Beispiel[\s\S]*0561 123456/);
await shot(student, '03-schueler-dashboard-mobil');
log('Steckbrief, Unterkunft, Klassenteam gespeichert; roter Hinweis zeigt fehlende Angaben');

await student.click('.notice--danger a:has-text("jetzt eintragen") >> nth=0');
await student.waitForSelector('#steckbrief-form');
await student.fill('input[name=supervisor_name]', 'Herr Schrauber');
await student.fill('input[name=supervisor_email]', 'kein-email');
await student.click('#steckbrief-form button[type=submit]');
await student.waitForSelector('#steckbrief-form .form-error:has-text("ungültig")');
await student.fill('input[name=supervisor_email]', 'schrauber@autohaus.example');
await student.fill('input[name=supervisor_phone]', '0561 998877');
await student.fill('textarea[name=lodging_contact]', '0170 1234567');
await student.click('#steckbrief-form button[type=submit]');
await student.waitForSelector('h1:has-text("Praktikums-Dashboard")');
assert.equal(await student.locator('.notice--danger').count(), 0);
log('Fehlende Angaben nachgetragen → roter Hinweis verschwindet (ungültige E-Mail abgewiesen)');

// Weitere Schüler über die Schnittstelle anlegen
async function apiStudent(first, last, code, data) {
  const reg = await rpc(student, 'student_register', { p_site_password: SITE_PW, p_first_name: first, p_last_name: last, p_email: `${first.toLowerCase()}-${run}@schule.example`, p_password: 'passwort1' });
  assert.ok(reg.token, JSON.stringify(reg));
  const j = await rpc(student, 'student_join_class', { p_token: reg.token, p_code: code });
  assert.ok(j.ok, JSON.stringify(j));
  if (data) {
    const s = await rpc(student, 'student_save_profile', { p_token: reg.token, p_data: data });
    assert.ok(s.ok, JSON.stringify(s));
  }
  return reg.token;
}
const tokLea = await apiStudent('Lea', 'Albrecht', code9, { company_name: 'Zahnarztpraxis Dr. Weiß', company_city: 'Baunatal', company_zip: '34225', distance_km: '9', class_team: 'fei mül', lodging_away: 'false' });
const tokSen = await apiStudent('Şenol', 'Yılmaz', code9, { company_name: 'Bäckerei Ölçer', company_street: 'Holländische Str. 1', company_zip: '34127', company_city: 'Kassel', distance_km: '3,2', job_title: 'Bäcker', supervisor_name: 'Frau Öztürk', class_team: 'FEI', lodging_away: 'false' });
const tokTom = await apiStudent('Tom', 'Becker', code9, { company_name: 'Architekturbüro Nord', distance_km: '48', class_team: 'Fei, Kra', lodging_away: 'true', lodging_name: 'Tante Inge' });
log('Drei weitere Schüler angelegt (u. a. mit türkischen Sonderzeichen)');

// ---------------------------------------------------------------------
console.log('Lehrkraft: Klassenansicht, Sortierung, Klassenteam');
await teacher.click('.subnav a:has-text("Meine Klassen")');
await teacher.click('a.class-card:has-text("9b")');
await teacher.waitForSelector('.student-table');
const rows = async () => teacher.$$eval('.student-table tbody tr td:nth-child(2) a', (as) => as.map((a) => a.textContent.trim()));
const expectRows = async (expected) => {
  await teacher.waitForFunction((exp) => JSON.stringify([...document.querySelectorAll('.student-table tbody tr td:nth-child(2) a')].map((a) => a.textContent.trim())) === exp, JSON.stringify(expected), { timeout: 5000 }).catch(() => {});
  assert.deepEqual(await rows(), expected);
};
await expectRows(['Albrecht, Lea', 'Becker, Tom', 'Mustermann, Max', 'Yılmaz, Şenol']);
const icons = await teacher.$$eval('.student-table tbody tr', (trs) => trs.map((tr) => !!tr.querySelector('td.col-icon svg')));
assert.deepEqual(icons, [false, true, true, false]);
await teacher.selectOption('#sort-select', 'km');
await expectRows(['Yılmaz, Şenol', 'Albrecht, Lea', 'Mustermann, Max', 'Becker, Tom']);
await teacher.selectOption('#sort-select', 'company');
await expectRows(['Becker, Tom', 'Mustermann, Max', 'Yılmaz, Şenol', 'Albrecht, Lea']);
await teacher.selectOption('#sort-select', 'name');
log('Schülerliste mit Koffer-Symbol; Sortierung nach Name, km und Betrieb korrekt');

const sizes = await teacher.$$eval('.cloud__item', (bs) => Object.fromEntries(bs.map((b) => [b.dataset.kuerzel, parseFloat(b.style.fontSize)])));
assert.ok(sizes.FEI > sizes['MÜL'] && sizes['MÜL'] > sizes.SCH, JSON.stringify(sizes));
assert.deepEqual(await teacher.$$eval('.cloud__item', (bs) => bs.map((b) => b.firstChild.textContent)), ['FEI', 'KRA', 'MÜL', 'SCH']);
assert.equal(sizes.KRA, sizes['MÜL']);
await teacher.click('[data-kuerzel="MÜL"]');
await teacher.waitForSelector('.cloud-detail');
assert.match(await teacher.textContent('.cloud-detail'), /Lea Albrecht, Max Mustermann/);
log(`Klassenteam-Wolke: Schriftgröße nach Häufigkeit ${JSON.stringify(sizes)}; Klick zeigt Schüler`);

// ---------------------------------------------------------------------
console.log('Lehrkraft: Praktikumsbesuche / Videocalls / Nachrichten');
async function openStudent(name) {
  await teacher.click('.subnav a:has-text("Meine Klassen")');
  await teacher.click('a.class-card:has-text("9b")');
  await teacher.click(`.student-table a:has-text("${name}")`);
  await teacher.waitForSelector('#visit-form');
}
async function setVisit(format, by, teacherName) {
  await teacher.check(`#visit-form input[name=format][value="${format}"]`);
  if (by) await teacher.check(`#visit-form input[name=by][value="${by}"]`);
  if (teacherName !== undefined) await teacher.fill('#visit-form input[name=teacher_name]', teacherName);
  await teacher.click('#visit-form button[type=submit]');
  await teacher.waitForSelector('.toast:has-text("Gespeichert")');
  await teacher.waitForTimeout(150);
}

await openStudent('Mustermann, Max');
assert.equal(await teacher.locator('#pdf-btn').count(), 0);
await setVisit('praesenz', 'me');
await openStudent('Becker, Tom');
await setVisit('praesenz', 'me');
await openStudent('Albrecht, Lea');
await setVisit('video');
await teacher.click('.breadcrumb a:has-text("9b")');
await teacher.waitForSelector('.notice--danger');
const warn = await teacher.textContent('.notice--danger');
assert.match(warn, /Praktikumsbesuche durch mich:.*Tom Becker, Max Mustermann/s);
assert.match(warn, /Videocall:.*Lea Albrecht/s);
log('Roter Hinweis: Schüler ohne Information werden oben aufgeführt');

await teacher.click('[data-toggle-panel="me"]');
await teacher.waitForSelector('#message-panel');
await teacher.fill('#class-msg-form textarea', 'Ich besuche euch in der 2. Woche. Infos: https://example.org/praktikum');
await teacher.click('#class-msg-form button[type=submit]');
await teacher.waitForSelector('.toast:has-text("Sammelnachricht")');
await teacher.waitForSelector('#message-panel .msg-group--class');
let warn2 = await teacher.textContent('.notice--danger');
assert.doesNotMatch(warn2, /Praktikumsbesuche durch mich/);
await teacher.click('#message-panel details:has-text("Becker, Tom") summary');
await teacher.fill('.indiv-form[data-student] textarea >> nth=0', 'Tom, ich komme am Dienstag um 10 Uhr.');
await teacher.click('.indiv-form button[type=submit] >> nth=0');
await teacher.waitForSelector('.msg-group--individual');
const groups = await teacher.$$eval('.msg-group', (gs) => gs.map((g) => [g.querySelector('.msg-group__label').textContent, g.querySelector('.msg-group__who').textContent]));
assert.equal(groups.length, 2);
assert.match(groups[0][1], /Max Mustermann/);
assert.match(groups[1][1], /Tom Becker/);
await shot(teacher, '04-lehrkraft-panel-besuche');
log('Sammelnachricht + individuelle Nachricht; Fenster zeigen, wer welche Nachricht sieht');

await teacher.click('[data-toggle-panel="video"]');
await teacher.fill('#class-msg-form textarea', 'Der Videocall läuft über BigBlueButton. Link folgt.');
await teacher.click('#class-msg-form button[type=submit]');
await teacher.waitForSelector('.toast:has-text("Sammelnachricht")');
await teacher.waitForTimeout(200);
assert.equal(await teacher.locator('.notice--danger').count(), 0);
log('Videocall-Sammelnachricht gespeichert → kein roter Hinweis mehr');

// Andere Lehrkraft
await openStudent('Yılmaz, Şenol');
await setVisit('praesenz', 'other', '');
const senState1 = await rpc(student, 'student_get_state', { p_token: tokSen });
assert.equal(senState1.visit.kind, 'other');
assert.equal(senState1.visit.teacher_name, null);
await setVisit('praesenz', 'other', 'Frau Müller-Lüdenscheidt');
await rpc(student, 'student_save_profile', { p_token: tokSen, p_data: { mobile_phone: '0151 2345678' } });
await teacher.reload();
await teacher.waitForSelector('#pdf-btn');
await shot(teacher, '05-lehrkraft-schuelerdetail-andere-lk');
const [download] = await Promise.all([teacher.waitForEvent('download'), teacher.click('#pdf-btn')]);
const pdfPath = path.join(SHOTS, download.suggestedFilename());
await download.saveAs(pdfPath);
const pdf = await PDFDocument.load(await readFile(pdfPath));
assert.equal(pdf.getPageCount(), 2);
assert.equal(download.suggestedFilename(), 'Praktikumsbesuch_Yilmaz_Senol.pdf');
log(`PDF für besuchende Lehrkraft erzeugt (${pdf.getPageCount()} Seiten: Infos + Gesprächsleitfaden)`);

// Termine
async function setAppointment(name, date, start, end, location) {
  await openStudent(name);
  await teacher.fill('#appt-form input[name=date]', date);
  await teacher.fill('#appt-form input[name=start]', start);
  if (end) await teacher.fill('#appt-form input[name=end]', end);
  if (location !== undefined) await teacher.fill('#appt-form input[name=location]', location);
  await teacher.click('#appt-form button[type=submit]');
  await teacher.waitForSelector('.toast:has-text("Termin wurde gespeichert")');
}
await setAppointment('Mustermann, Max', '2026-11-17', '10:00', '10:45');
await setAppointment('Becker, Tom', '2026-11-17', '10:30', '11:15');
await setAppointment('Albrecht, Lea', '2026-11-19', '14:00', '', 'https://bbb.example/raum-42');
await shot(teacher, '06-lehrkraft-schuelerdetail-termin');
log('Termine für Präsenz (durch mich) und Videocall festgelegt');

// ---------------------------------------------------------------------
console.log('Schüler: Dashboard mit Besuchsinfos & Kalenderblatt');
await student.reload();
await student.waitForSelector('.cal-sheet');
const visitText = await student.textContent('#praktikumsbesuch');
assert.match(visitText, /Praktikumsbesuch in Präsenz\s*durch\s*Frau Beispiel/);
assert.match(visitText, /Ich besuche euch in der 2\. Woche/);
assert.match(await student.textContent('.cal-sheet__day'), /^17$/);
assert.match(await student.textContent('.cal-sheet__time'), /10:00 – 10:45/);
assert.ok(await student.locator('#mobile-form .text-danger').isVisible());
await student.locator('.cal-sheet').scrollIntoViewIfNeeded();
await shot(student, '07-schueler-dashboard-termin-mobil');
const [icsDl] = await Promise.all([student.waitForEvent('download'), student.click('#appt-ics')]);
const icsPath = path.join(SHOTS, 'schueler.ics');
await icsDl.saveAs(icsPath);
const ics = await readFile(icsPath, 'utf8');
assert.match(ics, /BEGIN:VEVENT/);
assert.match(ics, /DTSTART:20261117T090000Z/);
assert.match(ics, /DTEND:20261117T094500Z/);
log('Kalenderblatt + .ics-Export im Schüler-Dashboard (17.11. 10:00–10:45, UTC korrekt)');

const leaState = await rpc(student, 'student_get_state', { p_token: tokLea });
assert.equal(leaState.visit.kind, 'video');
assert.equal(leaState.visit.teacher_name, 'Frau Beispiel');
assert.match(leaState.visit.message, /BigBlueButton/);
assert.equal(leaState.visit.appointment.location, 'https://bbb.example/raum-42');
const tomState = await rpc(student, 'student_get_state', { p_token: tokTom });
assert.match(tomState.visit.message, /Dienstag um 10 Uhr/);
const senState2 = await rpc(student, 'student_get_state', { p_token: tokSen });
assert.equal(senState2.visit.teacher_name, 'Frau Müller-Lüdenscheidt');
assert.equal(senState2.visit.appointment, null);
log('Videocall / individuelle Nachricht / andere Lehrkraft kommen korrekt beim Schüler an');

// Darstellung für Şenol (andere Lehrkraft) und Lea (Video) prüfen
const sen = await newPage({ width: 1100, height: 900 });
await sen.goto(BASE);
await sen.evaluate(([t, pw]) => { localStorage.setItem('pk_site', pw); localStorage.setItem('pk_student_token', t); }, [tokSen, SITE_PW]);
await sen.reload();
await sen.waitForSelector('.task-box');
assert.match(await sen.textContent('.task-box'), /E-Mail bei Frau Müller-Lüdenscheidt/);
assert.equal(await sen.inputValue('#mobile-form input[name=mobile_phone]'), '0151 2345678');
await shot(sen, '08-schueler-andere-lehrkraft');
await sen.evaluate(([t]) => localStorage.setItem('pk_student_token', t), [tokLea]);
await sen.reload();
await sen.waitForSelector('.cal-sheet');
assert.match(await sen.textContent('#praktikumsbesuch'), /durch einen Videocall betreut/);
assert.equal(await sen.locator('#mobile-form').count(), 0);
await shot(sen, '09-schueler-videocall');
log('Schüleransichten für „andere Lehrkraft“ und „Videocall“ geprüft');

// ---------------------------------------------------------------------
console.log('Lehrkraft: Kalender & ICS');
await teacher.click('.subnav a:has-text("Kalender")');
await teacher.waitForSelector('.week');
await teacher.goto(`${BASE}/#/lehrkraft/kalender?woche=2026-11-16`);
await teacher.waitForSelector('.event');
assert.equal(await teacher.locator('.event').count(), 3);
const overlap = await teacher.$$eval('.event', (es) => es.map((e) => e.style.width));
assert.ok(overlap.filter((w) => w.includes('50%')).length === 2, JSON.stringify(overlap));
await shot(teacher, '10-lehrkraft-kalender');
await teacher.click('a:has-text("Nächste →")');
await teacher.waitForSelector('.cal-empty');
await teacher.click('a:has-text("Zum letzten Termin")');
await teacher.waitForSelector('.event');
const [allIcs] = await Promise.all([teacher.waitForEvent('download'), teacher.click('#ics-all')]);
const allPath = path.join(SHOTS, 'alle.ics');
await allIcs.saveAs(allPath);
const all = await readFile(allPath, 'utf8');
assert.equal((all.match(/BEGIN:VEVENT/g) || []).length, 3);
assert.ok(all.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75), 'ICS-Zeilen > 75 Byte');
assert.match(all, /URL:https:\/\/bbb\.example\/raum-42/);
log('Wochenansicht (Überschneidung nebeneinander), Navigation, ICS-Export aller Termine');

// ---------------------------------------------------------------------
console.log('Passwort vergessen → Einmal-Code');
const forgot = await newPage({ width: 390, height: 844 });
await passGate(forgot);
await forgot.click('a:has-text("Passwort vergessen")');
await forgot.fill('#forgot-form input[name=email]', sEmail);
await forgot.click('#forgot-form button[type=submit]');
await forgot.waitForSelector('text=Anfrage gesendet');
await teacher.click('.subnav a:has-text("Meine Klassen")');
await teacher.waitForSelector('.request-list');
assert.match(await teacher.textContent('.request-list'), /Mustermann, Max/);
await teacher.click('[data-issue]');
await teacher.waitForSelector('.code-display');
const resetCode = (await teacher.textContent('.code-display')).trim();
assert.match(resetCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
await shot(teacher, '11-lehrkraft-passwort-anfrage');
await forgot.click('a:has-text("Mit Einmal-Code anmelden")');
await forgot.fill('#code-form input[name=email]', sEmail);
await forgot.fill('#code-form input[name=code]', 'AAAA-BBBB');
await forgot.click('#code-form button[type=submit]');
await forgot.waitForSelector('#code-form .form-error:not([hidden])');
await forgot.fill('#code-form input[name=code]', resetCode.toLowerCase());
await forgot.click('#code-form button[type=submit]');
await forgot.waitForSelector('#newpw-form');
// Eingeschränkte Sitzung darf keine Daten lesen/ändern
const restricted = await rpc(forgot, 'student_save_profile', { p_token: await forgot.evaluate(() => localStorage.getItem('pk_student_token')), p_data: { job_title: 'Hacker' } });
assert.equal(restricted.hint, 'must_change');
await forgot.fill('input[name=password]', 'neuesPasswort9');
await forgot.fill('input[name=password2]', 'neuesPasswort9');
await forgot.click('#newpw-form button[type=submit]');
await forgot.waitForSelector('h1:has-text("Praktikums-Dashboard")');
const reuse = await rpc(forgot, 'student_login_with_code', { p_email: sEmail, p_code: resetCode });
assert.match(reuse.error || '', /falsch/);
const oldPw = await rpc(forgot, 'student_login', { p_email: sEmail, p_password: 'schueler1' });
assert.match(oldPw.error || '', /falsch/);
const newPw = await rpc(forgot, 'student_login', { p_email: sEmail, p_password: 'neuesPasswort9' });
assert.ok(newPw.token);
await teacher.reload();
await teacher.waitForSelector('h1:has-text("Meine Klassen")');
assert.equal(await teacher.locator('.request-list').count(), 0);
log('Anfrage → Code (einmalig, 2 h) → Pflicht zum neuen Passwort; alter Code/altes Passwort ungültig');

// ---------------------------------------------------------------------
console.log('Sicherheit & Aufräumen');
const foreign = await rpc(student, 'teacher_get_class', { p_token: tokLea, p_class_id: '00000000-0000-0000-0000-000000000000' });
assert.equal(foreign.hint, 'session');
const t2 = await rpc(student, 'teacher_register', { p_site_password: SITE_PW, p_teacher_code: TEACHER_CODE, p_first_name: 'Eva', p_last_name: 'Fremd', p_email: `fremd-${run}@schule.example`, p_password: 'passwort1' });
const cls9 = await teacher.evaluate(() => location.hash);
const st = await rpc(student, 'teacher_get_state', { p_token: t2.token });
assert.equal(st.classes.length, 0);
const tState = await rpc(teacher, 'teacher_get_state', { p_token: await teacher.evaluate(() => localStorage.getItem('pk_teacher_token')) });
const classId9 = tState.classes.find((c) => c.name === '9b').id;
const steal = await rpc(student, 'teacher_get_class', { p_token: t2.token, p_class_id: classId9 });
assert.match(steal.message, /nicht gefunden/);
log(`Schüler-Token gilt nicht als Lehrkraft; fremde Lehrkraft sieht keine Klassen anderer (${cls9})`);

await teacher.click('a.class-card:has-text("E-Phase")');
await teacher.click('.danger-zone summary');
await teacher.fill('#delete-class-form input[name=confirm]', 'falsch');
await teacher.click('#delete-class-form button[type=submit]');
await teacher.waitForSelector('#delete-class-form .form-error:not([hidden])');
await teacher.fill('#delete-class-form input[name=confirm]', 'E-Phase PoWi 1');
await teacher.click('#delete-class-form button[type=submit]');
await teacher.waitForSelector('h1:has-text("Meine Klassen")');
assert.equal(await teacher.locator('a.class-card:has-text("E-Phase")').count(), 0);
await teacher.click('a.class-card:has-text("9b")');
await shot(teacher, '12-lehrkraft-klasse-9b');
log('Klasse löschen nur mit exakter Bestätigung');

// Mobile Lehrkraft-Ansicht
const tm = await newPage({ width: 390, height: 844 });
await tm.goto(BASE);
await tm.evaluate(([t, pw]) => { localStorage.setItem('pk_site', pw); localStorage.setItem('pk_teacher_token', t); }, [await teacher.evaluate(() => localStorage.getItem('pk_teacher_token')), SITE_PW]);
await tm.goto(`${BASE}/#/lehrkraft/klasse/${classId9}`);
await tm.waitForSelector('.student-table');
await shot(tm, '13-lehrkraft-klasse-mobil');
const overflow = await tm.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
assert.equal(overflow, false, 'Horizontaler Seitenüberlauf auf dem Handy');
log('Mobile Lehrkräfte-Ansicht ohne horizontalen Seitenüberlauf');

await browser.close();
if (errors.length) {
  console.error('\nBrowser-Fehler:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`\nAlle ${step} Prüfschritte erfolgreich. Screenshots: ${SHOTS}`);
