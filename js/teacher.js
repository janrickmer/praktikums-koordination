// Lehrkräfte-Ansicht: Konto, Klassen, Schülerliste, Klassenteam, Praktikumsbesuche,
// Videocalls, Termine, Passwort-Anfragen
import { rpc, store, KEYS } from './api.js';
import {
  html, raw, render, $, $$, submitting, formValues, toast, go, download, richText, fmt, setHeader, busy,
  copyText, isoDate, isoTime, localDateTime,
} from './ui.js';
import {
  TEXTS, missingCount, parseKuerzel, visitKind, gradeLabel, fullName, sortName, suitcaseIcon,
} from './common.js';
import { buildIcs, teacherEvent } from './ics.js';
import { renderCalendar } from './calendar.js';

const token = () => store.get(KEYS.teacher);
const T = (params = {}) => ({ p_token: token(), ...params });

// Einmal-Codes bleiben sichtbar, solange die Seite offen ist
const issuedCodes = new Map();
// Zustand der Klassenansicht
const classUi = { classId: null, panel: null, kuerzel: null, sort: store.get('pk_teacher_sort') || 'name' };
// Assistent "Neue Klasse"
const wizard = { open: false, grade: null, created: null };

function headerFor(teacher) {
  setHeader({
    area: 'Lehrkräfte-Ansicht',
    user: teacher ? teacher.contact_name : '',
    actions: html`<button type="button" class="btn btn--ghost btn--small" id="teacher-logout">Abmelden</button>`,
  });
  const b = document.getElementById('teacher-logout');
  if (b) b.addEventListener('click', async () => {
    const t = token();
    store.del(KEYS.teacher);
    try { if (t) await rpc('logout', { p_token: t }); } catch { /* egal */ }
    go('#/lehrkraft');
  });
}

function subnav(active) {
  const item = (key, href, label) => html`<a href="${href}" class="${active === key ? 'is-active' : ''}" ${raw(active === key ? 'aria-current="page"' : '')}>${label}</a>`;
  return html`<nav class="subnav" aria-label="Lehrkräfte-Navigation">
    ${item('classes', '#/lehrkraft', 'Meine Klassen')}
    ${item('calendar', '#/lehrkraft/kalender', 'Kalender')}
    ${item('profile', '#/lehrkraft/profil', 'Profil & Notfallkontakt')}
  </nav>`;
}

// ---------------------------------------------------------------------
//  Routing
// ---------------------------------------------------------------------
export async function teacherRoute(main, path, query) {
  if (!token()) {
    setHeader({ area: 'Lehrkräfte-Ansicht' });
    if (path === '/lehrkraft/registrieren') return renderRegister(main);
    return renderLogin(main);
  }
  const parts = path.split('/').filter(Boolean);
  if (parts[1] === 'klasse' && parts[2] && parts[3] === 'schueler' && parts[4]) return renderStudent(main, parts[2], parts[4]);
  if (parts[1] === 'klasse' && parts[2]) return renderClass(main, parts[2], query);
  if (parts[1] === 'kalender') {
    const state = await rpc('teacher_get_state', T());
    headerFor(state.teacher);
    return renderCalendar(main, query, { token: token(), subnav: subnav('calendar') });
  }
  if (parts[1] === 'profil') return renderProfile(main);
  return renderDashboard(main);
}

// ---------------------------------------------------------------------
//  Anmelden / Registrieren
// ---------------------------------------------------------------------
function renderLogin(main) {
  render(main, html`
    <section class="narrow">
      <div class="card">
        <p class="eyebrow">Lehrkräfte-Ansicht</p>
        <h1>Anmelden als Lehrkraft</h1>
        <form id="tlogin-form" class="form" novalidate>
          <label class="field"><span>Dienstliche E-Mail-Adresse</span>
            <input type="email" name="email" autocomplete="username" required></label>
          <label class="field"><span>Passwort</span>
            <input type="password" name="password" autocomplete="current-password" required></label>
          <p class="form-error" hidden></p>
          <button type="submit" class="btn btn--primary btn--block">Anmelden</button>
        </form>
        <p class="hint">Passwort vergessen? Bitte wende dich an die Person, die das Portal verwaltet.</p>
      </div>
      <div class="card card--soft">
        <h2>Noch kein Benutzerkonto?</h2>
        <p>Als Lehrkraft musst du dich zuerst registrieren. Dafür brauchst du den Lehrkräfte-Code.</p>
        <a class="btn btn--block" href="#/lehrkraft/registrieren">Benutzerkonto registrieren</a>
      </div>
    </section>`);
  const form = $('#tlogin-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const v = formValues(form);
      const res = await rpc('teacher_login', { p_email: v.email, p_password: v.password });
      store.set(KEYS.teacher, res.token);
      go('#/lehrkraft');
    });
  });
}

function renderRegister(main) {
  render(main, html`
    <section class="narrow">
      <div class="card">
        <p class="eyebrow">Lehrkräfte-Ansicht</p>
        <h1>Benutzerkonto registrieren</h1>
        <form id="treg-form" class="form" novalidate>
          <div class="grid-2">
            <label class="field"><span>Vorname</span>
              <input name="first_name" autocomplete="given-name" required maxlength="80"></label>
            <label class="field"><span>Nachname</span>
              <input name="last_name" autocomplete="family-name" required maxlength="80"></label>
          </div>
          <label class="field"><span>Dienstliche E-Mail-Adresse</span>
            <input type="email" name="email" autocomplete="email" required maxlength="200"></label>
          <label class="field"><span>Passwort <small>(mindestens 8 Zeichen)</small></span>
            <input type="password" name="password" autocomplete="new-password" required minlength="8" maxlength="72"></label>
          <label class="field"><span>Passwort bestätigen</span>
            <input type="password" name="password2" autocomplete="new-password" required></label>
          <label class="field"><span>Lehrkräfte-Code</span>
            <input type="password" name="teacher_code" autocomplete="off" required></label>
          <p class="form-error" hidden></p>
          <button type="submit" class="btn btn--primary btn--block">Registrieren</button>
        </form>
        <div class="auth-links"><a href="#/lehrkraft">Ich habe schon ein Konto</a></div>
      </div>
    </section>`);
  const form = $('#treg-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formValues(form);
    if (v.password !== v.password2) {
      const box = form.querySelector('.form-error');
      box.textContent = 'Die beiden Passwörter stimmen nicht überein.';
      box.hidden = false;
      return;
    }
    submitting(form, async () => {
      const res = await rpc('teacher_register', {
        p_site_password: store.get(KEYS.site), p_teacher_code: v.teacher_code,
        p_first_name: v.first_name, p_last_name: v.last_name, p_email: v.email, p_password: v.password,
      });
      store.set(KEYS.teacher, res.token);
      toast('Dein Benutzerkonto wurde angelegt.');
      go('#/lehrkraft');
    });
  });
}

// ---------------------------------------------------------------------
//  Übersicht: Passwort-Anfragen + Klassen
// ---------------------------------------------------------------------
function codeBox(studentId) {
  const c = issuedCodes.get(studentId);
  if (!c) return '';
  return html`<div class="code-issued" role="status">
    <span>Einmal-Code:</span> <strong class="code-display">${c.code}</strong>
    <span class="small">gültig bis ${fmt.time(c.expires_at)} Uhr, nur einmal verwendbar – bitte persönlich weitergeben.</span>
    <button type="button" class="btn btn--small btn--ghost" data-copy="${c.code}">Kopieren</button>
  </div>`;
}

function resetRequestsCard(requests) {
  if (!requests.length) return '';
  return html`
    <section class="card card--alert">
      <h2>Passwort-Anfragen</h2>
      <p class="muted small">Diese Schülerinnen und Schüler haben „Passwort vergessen“ angeklickt. Erzeuge einen Einmal-Code und gib ihn persönlich weiter.
        Der Code ist zwei Stunden gültig und nur einmal verwendbar; bei der Anmeldung damit muss ein neues Passwort festgelegt werden.</p>
      <ul class="request-list">
        ${requests.map((r) => html`
          <li>
            <div class="request-main">
              <div><strong>${r.last_name}, ${r.first_name}</strong> <span class="muted small">${r.email}</span></div>
              <div class="small muted">Klasse ${r.class_name}${r.in_class ? '' : ' (noch nicht beigetreten)'} · angefragt am ${fmt.dateTime(r.created_at)}
                ${r.code_issued_at ? html` · Code erzeugt um ${fmt.time(r.code_issued_at)} Uhr${new Date(r.code_expires_at) < new Date() ? ' (abgelaufen)' : ''}` : ''}</div>
            </div>
            <div class="request-actions">
              <button type="button" class="btn btn--primary btn--small" data-issue="${r.student_id}">${r.code_issued_at ? 'Neuen Code erzeugen' : 'Einmal-Code erzeugen'}</button>
              <button type="button" class="btn btn--ghost btn--small" data-dismiss="${r.student_id}">Verwerfen</button>
            </div>
            ${codeBox(r.student_id)}
          </li>`)}
      </ul>
    </section>`;
}

function bindCodeButtons(root, refresh) {
  $$('[data-issue]', root).forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    const res = await rpc('teacher_issue_reset_code', T({ p_student_id: b.dataset.issue }));
    issuedCodes.set(b.dataset.issue, res);
    await refresh();
  })));
  $$('[data-dismiss]', root).forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    if (!confirm('Anfrage verwerfen? Ein bereits erzeugter Code wird damit ungültig.')) return;
    await rpc('teacher_dismiss_reset', T({ p_student_id: b.dataset.dismiss }));
    issuedCodes.delete(b.dataset.dismiss);
    await refresh();
  })));
  $$('[data-copy]', root).forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy)));
}

function wizardCard() {
  if (!wizard.open) {
    return html`<button type="button" class="class-card class-card--add" id="wizard-open">
      <span class="plus" aria-hidden="true">+</span><span>Klasse hinzufügen</span></button>`;
  }
  if (wizard.created) {
    const c = wizard.created;
    return html`<div class="class-card class-card--wizard">
      <p class="eyebrow">Klasse angelegt</p>
      <h3>${c.name} <span class="muted small">${gradeLabel(c.grade)}</span></h3>
      <p class="small">Diesen Code brauchen deine Schülerinnen und Schüler, um der Klasse beizutreten:</p>
      <div class="join-code join-code--big">${c.join_code}</div>
      <div class="form-actions">
        <button type="button" class="btn btn--small" data-copy="${c.join_code}">Code kopieren</button>
        <a class="btn btn--small btn--primary" href="#/lehrkraft/klasse/${c.id}">Klasse öffnen</a>
        <button type="button" class="btn btn--small btn--ghost" id="wizard-close">Fertig</button>
      </div>
    </div>`;
  }
  if (!wizard.grade) {
    return html`<div class="class-card class-card--wizard">
      <p class="eyebrow">Schritt 1 von 2</p>
      <h3>Jahrgang auswählen</h3>
      <div class="grade-choice">
        <button type="button" class="btn btn--choice" data-grade="9">Jg. 9</button>
        <button type="button" class="btn btn--choice" data-grade="11">Jg. 11 (E-Phase)</button>
      </div>
      <button type="button" class="btn btn--ghost btn--small" id="wizard-close">Abbrechen</button>
    </div>`;
  }
  return html`<form class="class-card class-card--wizard form" id="wizard-form" novalidate>
    <p class="eyebrow">Schritt 2 von 2 · ${gradeLabel(wizard.grade)}</p>
    <h3>Namen der Klasse eingeben</h3>
    <label class="field"><span>Name der Klasse bzw. des Kurses</span>
      <input name="name" required maxlength="60" placeholder="${wizard.grade === '9' ? 'z. B. 9b' : 'z. B. E-Phase PoWi 2'}" autofocus></label>
    <p class="form-error" hidden></p>
    <div class="form-actions">
      <button type="submit" class="btn btn--primary btn--small">Klasse anlegen &amp; Code erzeugen</button>
      <button type="button" class="btn btn--ghost btn--small" id="wizard-back">Zurück</button>
    </div>
  </form>`;
}

async function renderDashboard(main) {
  const state = await rpc('teacher_get_state', T());
  headerFor(state.teacher);
  const refresh = () => renderDashboard(main);
  render(main, html`
    ${subnav('classes')}
    <header class="page-head">
      <div><p class="eyebrow">Schuljahr ${schoolYear()}</p><h1>Meine Klassen im Praktikum</h1></div>
    </header>
    ${resetRequestsCard(state.reset_requests)}
    <section class="class-grid">
      ${state.classes.map((c) => html`
        <a class="class-card" href="#/lehrkraft/klasse/${c.id}">
          <div class="class-card__head">
            <h3>${c.name}</h3>
            <span class="badge">${gradeLabel(c.grade)}</span>
          </div>
          <div class="class-card__code"><span class="small muted">Beitrittscode</span> <span class="join-code">${c.join_code}</span></div>
          <ul class="class-card__stats">
            <li><strong>${c.student_count}</strong> Schüler/-innen</li>
            <li><strong>${c.appointment_count}</strong> Termine</li>
            ${c.lodging_count ? html`<li>${suitcaseIcon()} <strong>${c.lodging_count}</strong> wohnen woanders</li>` : ''}
          </ul>
          ${c.missing_info_count ? html`<p class="text-danger small">${c.missing_info_count} ohne Information zum Praktikumsbesuch/-gespräch</p>` : ''}
        </a>`)}
      ${wizardCard()}
    </section>
    ${state.classes.length === 0 && !wizard.open ? html`<p class="muted">Lege zuerst die Klassen an, die sich in diesem Schuljahr im Praktikum befinden.</p>` : ''}
    ${!state.teacher.contact_phone ? html`<p class="hint">Tipp: Unter <a href="#/lehrkraft/profil">Profil &amp; Notfallkontakt</a> kannst du eine Telefonnummer für Notfälle hinterlegen. Sie wird deinen Schülerinnen und Schülern im Dashboard angezeigt.</p>` : ''}
  `);
  bindCodeButtons(main, refresh);
  const open = $('#wizard-open');
  if (open) open.addEventListener('click', () => { Object.assign(wizard, { open: true, grade: null, created: null }); refresh(); });
  $$('#wizard-close').forEach((b) => b.addEventListener('click', () => { Object.assign(wizard, { open: false, grade: null, created: null }); refresh(); }));
  const back = $('#wizard-back');
  if (back) back.addEventListener('click', () => { wizard.grade = null; refresh(); });
  $$('[data-grade]').forEach((b) => b.addEventListener('click', () => { wizard.grade = b.dataset.grade; refresh(); }));
  const form = $('#wizard-form');
  if (form) form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const res = await rpc('teacher_create_class', T({ p_grade: wizard.grade, p_name: formValues(form).name }));
      wizard.created = res;
      await refresh();
    });
  });
}

function schoolYear() {
  const d = new Date();
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}/${String(y + 1).slice(2)}`;
}

// ---------------------------------------------------------------------
//  Klassenansicht
// ---------------------------------------------------------------------
const KIND_TITLE = { me: 'Praktikumsbesuche durch mich', video: 'Praktikumsgespräche mit Videocall' };

function visitBadge(s) {
  const k = visitKind(s);
  if (k === 'me') return html`<span class="badge badge--accent">Präsenz · ich</span>`;
  if (k === 'video') return html`<span class="badge badge--video">Videocall</span>`;
  if (k === 'other') {
    return s.visit_teacher_name
      ? html`<span class="badge">Präsenz · ${s.visit_teacher_name}</span>`
      : html`<span class="badge badge--warn">Präsenz · Lehrkraft offen</span>`;
  }
  return html`<span class="badge badge--muted">offen</span>`;
}

function sortStudents(list, mode) {
  const coll = new Intl.Collator('de', { sensitivity: 'base' });
  const byName = (a, b) => coll.compare(a.last_name, b.last_name) || coll.compare(a.first_name, b.first_name);
  const arr = [...list];
  if (mode === 'km') {
    arr.sort((a, b) => {
      const ak = a.distance_km === null ? Infinity : Number(a.distance_km);
      const bk = b.distance_km === null ? Infinity : Number(b.distance_km);
      return ak - bk || byName(a, b);
    });
  } else if (mode === 'company') {
    arr.sort((a, b) => {
      if (!a.company_name && !b.company_name) return byName(a, b);
      if (!a.company_name) return 1;
      if (!b.company_name) return -1;
      return coll.compare(a.company_name, b.company_name) || byName(a, b);
    });
  } else {
    arr.sort(byName);
  }
  return arr;
}

function messageInfo(s, cls) {
  const kind = visitKind(s);
  const classMsg = kind === 'me' ? cls.visit_message : kind === 'video' ? cls.video_message : null;
  if (s.info_message) return { type: 'individual', text: s.info_message };
  if (classMsg) return { type: 'class', text: classMsg };
  return { type: 'default', text: TEXTS.infoDefault };
}

function studentsWithoutInfo(students, cls, kind) {
  return students.filter((s) => visitKind(s) === kind && messageInfo(s, cls).type === 'default');
}

function noInfoNotice(students, cls) {
  const me = studentsWithoutInfo(students, cls, 'me');
  const video = studentsWithoutInfo(students, cls, 'video');
  if (!me.length && !video.length) return '';
  return html`<div class="notice notice--danger" role="alert">
    <h2>Diese Schülerinnen und Schüler haben noch keine Information erhalten</h2>
    ${me.length ? html`<p><strong>Praktikumsbesuche durch mich:</strong> ${me.map(fullName).join(', ')}
      – <button type="button" class="link-button" data-open-panel="me">Nachricht hinterlegen</button></p>` : ''}
    ${video.length ? html`<p><strong>Praktikumsgespräche mit Videocall:</strong> ${video.map(fullName).join(', ')}
      – <button type="button" class="link-button" data-open-panel="video">Nachricht hinterlegen</button></p>` : ''}
    <p class="small">Sie sehen bisher nur den Standardtext „${TEXTS.infoDefault}“</p>
  </div>`;
}

function messagePanel(kind, cls, students) {
  const rel = sortStudents(students.filter((s) => visitKind(s) === kind), 'name');
  const classMsg = kind === 'me' ? cls.visit_message : cls.video_message;
  const what = kind === 'me' ? '„Praktikumsbesuch in Präsenz durch mich“' : '„Praktikumsgespräch per Videocall“';
  const groups = new Map();
  for (const s of rel) {
    const m = messageInfo(s, cls);
    const key = `${m.type}:${m.text}`;
    if (!groups.has(key)) groups.set(key, { ...m, students: [] });
    groups.get(key).students.push(s);
  }
  const order = { default: 0, class: 1, individual: 2 };
  const groupList = [...groups.values()].sort((a, b) => order[a.type] - order[b.type]);
  const label = { class: 'Sammelnachricht', individual: 'Individuelle Nachricht', default: 'Standardtext – noch keine Information' };
  const noInfo = studentsWithoutInfo(students, cls, kind);
  return html`
    <section class="card panel" id="message-panel">
      <div class="card-head">
        <h2>${KIND_TITLE[kind]}</h2>
        <button type="button" class="btn btn--ghost btn--small" id="panel-close">Schließen</button>
      </div>
      ${noInfo.length ? html`<div class="notice notice--danger" role="alert"><p><strong>Noch keine Information erhalten:</strong> ${noInfo.map(fullName).join(', ')}</p></div>` : ''}
      ${rel.length === 0
        ? html`<p class="muted">Bisher ist bei keiner Schülerin und keinem Schüler ${what} ausgewählt.
            Das legst du in der Detailansicht fest (Klick auf einen Namen in der Liste).</p>`
        : html`
        <form id="class-msg-form" class="form" novalidate>
          <label class="field"><span>Nachricht an alle ${rel.length} Schüler/-innen mit ${what}</span>
            <textarea name="message" rows="5" maxlength="5000" placeholder="z. B. Ich besuche dich in der zweiten Praktikumswoche. Den genauen Termin siehst du bald hier.">${classMsg ?? ''}</textarea></label>
          <p class="hint">Die Nachricht erscheint im Praktikums-Dashboard unter „Praktikumsbesuch / Praktikumsgespräch“. Individuelle Nachrichten (unten) haben Vorrang.</p>
          <p class="form-error" hidden></p>
          <div class="form-actions">
            <button type="submit" class="btn btn--primary">Für alle speichern</button>
            ${classMsg ? html`<button type="button" class="btn btn--ghost" id="class-msg-clear">Sammelnachricht entfernen</button>` : ''}
          </div>
        </form>

        <h3>Aktuell angezeigte Nachrichten</h3>
        <div class="msg-groups">
          ${groupList.map((g) => html`
            <article class="msg-group msg-group--${g.type}">
              <p class="msg-group__label">${label[g.type]}</p>
              <div class="msg-group__text">${richText(g.text)}</div>
              <p class="msg-group__who">Sehen diese Nachricht: ${g.students.map(fullName).join(', ')}</p>
            </article>`)}
        </div>

        <h3>Individuelle Nachrichten</h3>
        <ul class="indiv-list">
          ${rel.map((s) => html`
            <li>
              <details ${raw(s.info_message ? 'open' : '')}>
                <summary><span>${sortName(s)}</span>
                  <span class="small muted">${s.info_message ? 'individuelle Nachricht' : classMsg ? 'sieht die Sammelnachricht' : 'sieht den Standardtext'}${s.appt_start ? ` · Termin ${fmt.dateShort(s.appt_start)}, ${fmt.time(s.appt_start)}` : ''}</span></summary>
                <form class="form indiv-form" data-student="${s.id}" novalidate>
                  <textarea name="message" rows="3" maxlength="5000" placeholder="Individuelle Nachricht an ${s.first_name}">${s.info_message ?? ''}</textarea>
                  <p class="form-error" hidden></p>
                  <div class="form-actions">
                    <button type="submit" class="btn btn--small btn--primary">Speichern</button>
                    ${s.info_message ? html`<button type="button" class="btn btn--small btn--ghost" data-clear-indiv="${s.id}">Individuelle Nachricht entfernen</button>` : ''}
                    <a class="btn btn--small btn--ghost" href="#/lehrkraft/klasse/${cls.id}/schueler/${s.id}">Termin &amp; Details</a>
                  </div>
                </form>
              </details>
            </li>`)}
        </ul>`}
    </section>`;
}

function teamCloud(students) {
  const map = new Map();
  const without = [];
  for (const s of students) {
    const items = parseKuerzel(s.class_team);
    if (!items.length) without.push(s);
    for (const it of items) {
      // Groß-/Kleinschreibung wird ignoriert ("fei" = "FEI"), Anzeige einheitlich in Großbuchstaben
      if (!map.has(it.key)) map.set(it.key, { key: it.key, students: [] });
      map.get(it.key).students.push(s);
    }
  }
  const coll = new Intl.Collator('de', { sensitivity: 'base' });
  const entries = [...map.values()].map((e) => ({
    key: e.key,
    label: e.key,
    count: e.students.length,
    students: sortStudents(e.students, 'name'),
  })).sort((a, b) => coll.compare(a.key, b.key));
  const counts = entries.map((e) => e.count);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const size = (c) => (max === min ? 1.3 : 0.9 + ((c - min) / (max - min)) * 1.6);
  const selected = entries.find((e) => e.key === classUi.kuerzel);
  return html`
    <section class="card" id="klassenteam">
      <h2>Klassenteam</h2>
      <p class="muted small">Kürzel der Lehrkräfte, die die Schülerinnen und Schüler dieser Klasse angegeben haben.
        Je häufiger ein Kürzel genannt wurde, desto größer ist es. Klicke auf ein Kürzel, um zu sehen, wer es eingetragen hat.</p>
      ${entries.length
        ? html`<div class="cloud">${entries.map((e) => html`
            <button type="button" class="cloud__item ${selected && selected.key === e.key ? 'is-selected' : ''}" data-kuerzel="${e.key}"
              style="font-size:${size(e.count).toFixed(2)}rem" aria-pressed="${selected && selected.key === e.key ? 'true' : 'false'}"
              title="${e.count} Nennung(en)">${e.label}<sup>${e.count}</sup></button>`)}</div>`
        : html`<p class="muted">Bisher hat noch niemand Kürzel eingetragen.</p>`}
      ${selected ? html`<div class="cloud-detail">
          <p><strong>${selected.label}</strong> wurde von ${selected.count} Schüler/-innen eingetragen:</p>
          <p class="small">${selected.students.map(fullName).join(', ')}</p>
        </div>` : ''}
      ${without.length && entries.length ? html`<p class="small muted">Noch keine Angabe: ${without.map(fullName).join(', ')}</p>` : ''}
    </section>`;
}

async function renderClass(main, classId, query, cached = null) {
  if (classUi.classId !== classId) Object.assign(classUi, { classId, panel: null, kuerzel: null });
  if (query && ['me', 'video'].includes(query.get('panel'))) classUi.panel = query.get('panel');
  const [state, data] = cached
    || await Promise.all([rpc('teacher_get_state', T()), rpc('teacher_get_class', T({ p_class_id: classId }))]);
  if (!cached) headerFor(state.teacher);
  const cls = data.class;
  const students = sortStudents(data.students, classUi.sort);
  // refresh = Daten neu laden (nach Änderungen); repaint = nur neu darstellen (Sortierung, Aufklappen)
  const refresh = () => renderClass(main, classId, null);
  const repaint = () => renderClass(main, classId, null, [state, data]);
  const studentHref = (s) => `#/lehrkraft/klasse/${cls.id}/schueler/${s.id}`;

  render(main, html`
    ${subnav('classes')}
    <p class="breadcrumb"><a href="#/lehrkraft">Meine Klassen</a> › ${cls.name}</p>
    ${noInfoNotice(data.students, cls)}
    <header class="page-head">
      <div>
        <p class="eyebrow">${gradeLabel(cls.grade)}</p>
        <h1>Klasse ${cls.name}</h1>
      </div>
      <div class="page-head__aside">
        <span class="small muted">Beitrittscode</span>
        <span class="join-code">${cls.join_code}</span>
        <button type="button" class="btn btn--small btn--ghost" data-copy="${cls.join_code}">Kopieren</button>
      </div>
    </header>

    <div class="toolbar">
      <div class="toolbar__group">
        <button type="button" class="btn ${classUi.panel === 'me' ? 'btn--primary' : ''}" data-toggle-panel="me" aria-expanded="${classUi.panel === 'me'}">Praktikumsbesuche durch mich</button>
        <button type="button" class="btn ${classUi.panel === 'video' ? 'btn--primary' : ''}" data-toggle-panel="video" aria-expanded="${classUi.panel === 'video'}">Praktikumsgespräche mit Videocall</button>
      </div>
    </div>

    ${classUi.panel ? messagePanel(classUi.panel, cls, data.students) : ''}

    <section class="card card--flush">
      <div class="card-head card-head--pad">
        <h2>Schülerinnen und Schüler <span class="muted">(${students.length})</span></h2>
        <label class="sort-select"><span>Sortieren nach</span>
          <select id="sort-select">
            <option value="name" ${raw(classUi.sort === 'name' ? 'selected' : '')}>Nachname (A–Z)</option>
            <option value="km" ${raw(classUi.sort === 'km' ? 'selected' : '')}>Entfernung von der Schule</option>
            <option value="company" ${raw(classUi.sort === 'company' ? 'selected' : '')}>Praktikumsbetrieb (A–Z)</option>
          </select></label>
      </div>
      ${students.length === 0
        ? html`<p class="pad muted">Noch niemand ist dieser Klasse beigetreten. Gib deinen Schülerinnen und Schülern den Beitrittscode <strong>${cls.join_code}</strong>.</p>`
        : html`<div class="table-wrap">
          <table class="student-table">
            <thead><tr>
              <th class="col-icon"><span class="sr-only">Unterkunft</span></th>
              <th>Name</th><th>Praktikumsbetrieb</th><th>Ort</th><th class="num">Entfernung</th>
              <th>Besuch / Gespräch</th><th>Termin</th><th>Angaben</th>
            </tr></thead>
            <tbody>
              ${students.map((s) => {
                const miss = missingCount(s);
                return html`<tr data-href="${studentHref(s)}">
                  <td class="col-icon">${s.lodging_away ? suitcaseIcon() : ''}</td>
                  <td><a href="${studentHref(s)}">${sortName(s)}</a>${s.reset_requested ? html` <span class="badge badge--warn">Passwort-Anfrage</span>` : ''}</td>
                  <td>${s.company_name || html`<span class="muted">–</span>`}</td>
                  <td>${[s.company_zip, s.company_city].filter(Boolean).join(' ') || html`<span class="muted">–</span>`}</td>
                  <td class="num">${s.distance_km !== null ? fmt.km(s.distance_km) : html`<span class="muted">–</span>`}</td>
                  <td>${visitBadge(s)}</td>
                  <td>${s.appt_start ? html`${fmt.weekdayShort(s.appt_start)} ${fmt.dateShort(s.appt_start)}, ${fmt.time(s.appt_start)}` : html`<span class="muted">–</span>`}</td>
                  <td>${miss ? html`<span class="text-danger small">${miss} fehlen</span>` : html`<span class="text-ok small">vollständig</span>`}</td>
                </tr>`;
              })}
            </tbody>
          </table>
        </div>
        <p class="pad small muted">${suitcaseIcon()} = wohnt während des Praktikums woanders als an der eigenen Adresse</p>`}
    </section>

    ${teamCloud(data.students)}

    <details class="card danger-zone">
      <summary>Klasse löschen</summary>
      <form id="delete-class-form" class="form" novalidate>
        <p>Löscht die Klasse <strong>${cls.name}</strong> <strong>mit allen Schülerkonten und Daten</strong> dieser Klasse endgültig
          (z. B. am Ende des Schuljahres). Zur Bestätigung den Klassennamen eingeben:</p>
        <label class="field"><span class="sr-only">Klassenname</span><input name="confirm" autocomplete="off" placeholder="${cls.name}"></label>
        <p class="form-error" hidden></p>
        <button type="submit" class="btn btn--danger">Endgültig löschen</button>
      </form>
    </details>
  `);

  // Ereignisse
  $$('[data-copy]', main).forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy)));
  $$('[data-toggle-panel]').forEach((b) => b.addEventListener('click', () => {
    classUi.panel = classUi.panel === b.dataset.togglePanel ? null : b.dataset.togglePanel;
    repaint().then(() => { const p = $('#message-panel'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }));
  $$('[data-open-panel]').forEach((b) => b.addEventListener('click', () => {
    classUi.panel = b.dataset.openPanel;
    repaint().then(() => { const p = $('#message-panel'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }));
  const close = $('#panel-close');
  if (close) close.addEventListener('click', () => { classUi.panel = null; repaint(); });

  $('#sort-select').addEventListener('change', (e) => {
    classUi.sort = e.target.value;
    store.set('pk_teacher_sort', classUi.sort);
    repaint();
  });
  $$('tr[data-href]').forEach((tr) => tr.addEventListener('click', (e) => {
    if (e.target.closest('a,button')) return;
    go(tr.dataset.href);
  }));
  $$('[data-kuerzel]').forEach((b) => b.addEventListener('click', () => {
    classUi.kuerzel = classUi.kuerzel === b.dataset.kuerzel ? null : b.dataset.kuerzel;
    repaint().then(() => { const k = $('#klassenteam'); if (k) k.scrollIntoView({ block: 'nearest' }); });
  }));

  const msgForm = $('#class-msg-form');
  if (msgForm) {
    msgForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitting(msgForm, async () => {
        await rpc('teacher_set_class_message', T({ p_class_id: cls.id, p_kind: classUi.panel, p_message: formValues(msgForm).message }));
        toast('Die Sammelnachricht wurde gespeichert.');
        await refresh();
      });
    });
    const clear = $('#class-msg-clear');
    if (clear) clear.addEventListener('click', () => busy(clear, async () => {
      await rpc('teacher_set_class_message', T({ p_class_id: cls.id, p_kind: classUi.panel, p_message: null }));
      toast('Die Sammelnachricht wurde entfernt.');
      await refresh();
    }));
  }
  $$('.indiv-form').forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(f, async () => {
      await rpc('teacher_set_student_message', T({ p_student_id: f.dataset.student, p_message: formValues(f).message }));
      toast('Die individuelle Nachricht wurde gespeichert.');
      await refresh();
    });
  }));
  $$('[data-clear-indiv]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    await rpc('teacher_set_student_message', T({ p_student_id: b.dataset.clearIndiv, p_message: null }));
    toast('Die individuelle Nachricht wurde entfernt.');
    await refresh();
  })));

  const del = $('#delete-class-form');
  del.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(del, async () => {
      await rpc('teacher_delete_class', T({ p_class_id: cls.id, p_confirm_name: formValues(del).confirm }));
      toast(`Die Klasse ${cls.name} wurde gelöscht.`);
      go('#/lehrkraft');
    });
  });
}

// ---------------------------------------------------------------------
//  Einzelner Schüler
// ---------------------------------------------------------------------
const dash = (v) => (v === null || v === undefined || String(v).trim() === '' ? html`<span class="muted">keine Angabe</span>` : v);

async function renderStudent(main, classId, studentId) {
  const [state, data] = await Promise.all([rpc('teacher_get_state', T()), rpc('teacher_get_student', T({ p_student_id: studentId }))]);
  headerFor(state.teacher);
  const s = data.student;
  const cls = data.class;
  const me = data.teacher.contact_name;
  const kind = visitKind(s);
  const refresh = () => renderStudent(main, classId, studentId);
  const classMsg = kind === 'me' ? cls.visit_message : kind === 'video' ? cls.video_message : null;
  const info = messageInfo(s, cls);
  const companyAddress = [s.company_street, [s.company_zip, s.company_city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const apptStart = s.appt_start ? new Date(s.appt_start) : null;
  const apptEnd = s.appt_end ? new Date(s.appt_end) : null;

  render(main, html`
    ${subnav('classes')}
    <p class="breadcrumb"><a href="#/lehrkraft">Meine Klassen</a> › <a href="#/lehrkraft/klasse/${cls.id}">${cls.name}</a> › ${sortName(s)}</p>
    <header class="page-head">
      <div>
        <p class="eyebrow">Klasse ${cls.name} · ${gradeLabel(cls.grade)}</p>
        <h1>${fullName(s)} ${s.lodging_away ? html`<span class="title-icon">${suitcaseIcon()}</span>` : ''}</h1>
      </div>
      ${kind === 'other' ? html`<div class="page-head__aside">
        <button type="button" class="btn btn--primary" id="pdf-btn">Informationen für die besuchende Lehrkraft</button>
      </div>` : ''}
    </header>

    <div class="detail-grid">
      <div class="detail-col">
        <section class="card">
          <h2>Kontakt</h2>
          <dl class="data-list">
            <dt>E-Mail</dt><dd><a href="mailto:${s.email}">${s.email}</a></dd>
            <dt>Private Handynummer</dt><dd>${s.mobile_phone ? html`${s.mobile_phone} <span class="small muted">(nur bei Schwierigkeiten beim Antreffen)</span>` : html`<span class="muted">nicht angegeben (freiwillig)</span>`}</dd>
          </dl>
        </section>
        <section class="card">
          <h2>Betriebssteckbrief</h2>
          <dl class="data-list">
            <dt>Praktikumsbetrieb</dt><dd>${dash(s.company_name)}</dd>
            <dt>Straße, Hausnummer</dt><dd>${dash(s.company_street)}</dd>
            <dt>PLZ, Ort</dt><dd>${dash([s.company_zip, s.company_city].filter(Boolean).join(' '))}</dd>
            <dt>Entfernung zur Schule</dt><dd>${dash(fmt.km(s.distance_km))}</dd>
            <dt>Praktikumsberuf</dt><dd>${dash(s.job_title)}</dd>
            <dt>Betreuungsperson</dt><dd>${dash(s.supervisor_name)}</dd>
            <dt>E-Mail Betreuung</dt><dd>${s.supervisor_email ? html`<a href="mailto:${s.supervisor_email}">${s.supervisor_email}</a>` : dash(null)}</dd>
            <dt>Telefon Betreuung</dt><dd>${dash(s.supervisor_phone)}</dd>
          </dl>
        </section>
        <section class="card">
          <h2>Unterkunft während des Praktikums</h2>
          ${s.lodging_away === true ? html`
            <p class="lodging-flag">${suitcaseIcon()} Wohnt während des Praktikums woanders als an der eigenen Adresse.</p>
            <dl class="data-list">
              <dt>Wohnt bei</dt><dd>${dash(s.lodging_name)}</dd>
              <dt>Verhältnis</dt><dd>${dash(s.lodging_relation)}</dd>
              <dt>Notfallkontakt</dt><dd>${dash(s.lodging_contact)}</dd>
            </dl>`
            : s.lodging_away === false ? html`<p>Wohnt während des Praktikums an der eigenen Adresse.</p>`
            : html`<p class="muted">Noch keine Angabe.</p>`}
        </section>
      </div>

      <div class="detail-col">
        <section class="card">
          <h2>Praktikumsbesuch / Praktikumsgespräch</h2>
          <form id="visit-form" class="form" novalidate>
            <fieldset class="field">
              <legend>Format</legend>
              <label class="choice"><input type="radio" name="format" value="" ${raw(kind === 'none' ? 'checked' : '')}> Noch nicht festgelegt</label>
              <label class="choice"><input type="radio" name="format" value="praesenz" ${raw(s.visit_format === 'praesenz' ? 'checked' : '')}> Praktikumsbesuch in Präsenz</label>
              <label class="choice"><input type="radio" name="format" value="video" ${raw(kind === 'video' ? 'checked' : '')}> Praktikumsgespräch mit Videocall <span class="muted small">(durch mich)</span></label>
            </fieldset>
            <div id="praesenz-fields" class="reveal" ${raw(s.visit_format === 'praesenz' ? '' : 'hidden')}>
              <fieldset class="field">
                <legend>Wer führt den Praktikumsbesuch durch?</legend>
                <label class="choice"><input type="radio" name="by" value="me" ${raw(kind === 'me' ? 'checked' : '')}> Ich selbst (${me})</label>
                <label class="choice"><input type="radio" name="by" value="other" ${raw(kind === 'other' ? 'checked' : '')}> Eine andere Lehrkraft</label>
              </fieldset>
              <label class="field" id="other-name" ${raw(kind === 'other' ? '' : 'hidden')}><span>Name der Lehrkraft, die den Praktikumsbesuch durchführt</span>
                <input name="teacher_name" value="${s.visit_teacher_name ?? ''}" maxlength="120" placeholder="Name – kann auch später ergänzt werden"></label>
            </div>
            <p class="hint" id="kind-hint" hidden>Hinweis: Beim Wechsel der Betreuungsart wird eine individuelle Nachricht zurückgesetzt${apptStart ? ' und ggf. der Termin gelöscht' : ''}.</p>
            <p class="form-error" hidden></p>
            <button type="submit" class="btn btn--primary">Speichern</button>
          </form>
        </section>

        ${kind === 'me' || kind === 'video' ? html`
        <section class="card">
          <h2>Nachricht im Dashboard von ${s.first_name}</h2>
          <p class="small muted">Aktuell angezeigt (${info.type === 'individual' ? 'individuelle Nachricht' : info.type === 'class' ? 'Sammelnachricht' : 'Standardtext – noch keine Information'}):</p>
          <div class="message-box ${info.type === 'default' ? 'message-box--default' : ''}">${richText(info.text)}</div>
          <form id="msg-form" class="form" novalidate>
            <label class="field"><span>Individuelle Nachricht <small>(hat Vorrang vor der Sammelnachricht)</small></span>
              <textarea name="message" rows="4" maxlength="5000">${s.info_message ?? ''}</textarea></label>
            <p class="form-error" hidden></p>
            <div class="form-actions">
              <button type="submit" class="btn btn--primary">Speichern</button>
              ${s.info_message ? html`<button type="button" class="btn btn--ghost" id="msg-clear">Entfernen (${classMsg ? 'Sammelnachricht' : 'Standardtext'} anzeigen)</button>` : ''}
              <a class="btn btn--ghost" href="#/lehrkraft/klasse/${cls.id}?panel=${kind}">Sammelnachricht bearbeiten</a>
            </div>
          </form>
        </section>

        <section class="card">
          <h2>Termin</h2>
          <p class="small muted">Ein fester Termin erscheint im Praktikums-Dashboard als Kalenderblatt und in deinem Kalender.</p>
          <form id="appt-form" class="form" novalidate>
            <div class="grid-3">
              <label class="field"><span>Datum</span><input type="date" name="date" value="${apptStart ? isoDate(apptStart) : ''}" required></label>
              <label class="field"><span>Beginn</span><input type="time" name="start" value="${apptStart ? isoTime(apptStart) : ''}" required></label>
              <label class="field"><span>Ende <small>(optional)</small></span><input type="time" name="end" value="${apptEnd ? isoTime(apptEnd) : ''}"></label>
            </div>
            <label class="field"><span>${kind === 'video' ? 'Link zum Videocall bzw. Ort' : 'Ort'}</span>
              <input name="location" maxlength="500" value="${s.appt_location ?? (kind === 'me' && !apptStart ? [s.company_name, companyAddress].filter(Boolean).join(', ') : '')}"
                placeholder="${kind === 'video' ? 'z. B. https://…' : 'Adresse des Praktikumsbetriebs'}"></label>
            <label class="field"><span>Hinweis zum Termin <small>(optional, für ${s.first_name} sichtbar)</small></span>
              <textarea name="note" rows="2" maxlength="2000">${s.appt_note ?? ''}</textarea></label>
            <p class="form-error" hidden></p>
            <div class="form-actions">
              <button type="submit" class="btn btn--primary">${apptStart ? 'Termin ändern' : 'Termin festlegen'}</button>
              ${apptStart ? html`<button type="button" class="btn btn--ghost" id="appt-ics">.ics herunterladen</button>
                <button type="button" class="btn btn--ghost btn--danger-text" id="appt-delete">Termin löschen</button>` : ''}
            </div>
          </form>
        </section>` : ''}

        <section class="card">
          <h2>Weitere Aktionen</h2>
          <div class="stack">
            <div>
              <button type="button" class="btn btn--small" data-issue="${s.id}">Einmal-Code für neues Passwort erzeugen</button>
              ${s.reset_requested ? html`<span class="badge badge--warn">Passwort-Anfrage offen</span>` : ''}
              ${codeBox(s.id)}
            </div>
            <div><button type="button" class="btn btn--small btn--ghost btn--danger-text" id="remove-btn">Aus der Klasse entfernen</button></div>
          </div>
        </section>
      </div>
    </div>`);

  // Format-Formular
  const vf = $('#visit-form');
  const praesenz = $('#praesenz-fields');
  const otherName = $('#other-name');
  const hint = $('#kind-hint');
  const currentKind = () => {
    const v = formValues(vf);
    if (v.format === 'video') return 'video';
    if (v.format === 'praesenz') return v.by === 'me' ? 'me' : 'other';
    return 'none';
  };
  const update = () => {
    const v = formValues(vf);
    praesenz.hidden = v.format !== 'praesenz';
    otherName.hidden = !(v.format === 'praesenz' && v.by === 'other');
    hint.hidden = !((s.info_message || apptStart) && currentKind() !== kind);
  };
  $$('input[type=radio]', vf).forEach((r) => r.addEventListener('change', update));
  vf.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(vf, async () => {
      const v = formValues(vf);
      if (v.format === 'praesenz' && !v.by) throw new Error('Bitte wähle aus, wer den Praktikumsbesuch durchführt.');
      await rpc('teacher_set_visit', T({
        p_student_id: s.id, p_format: v.format || null, p_by_me: v.by === 'me', p_teacher_name: v.teacher_name || null,
      }));
      toast('Gespeichert. Die Information erscheint im Dashboard des Schülers.');
      await refresh();
    });
  });

  const mf = $('#msg-form');
  if (mf) {
    mf.addEventListener('submit', (e) => {
      e.preventDefault();
      submitting(mf, async () => {
        await rpc('teacher_set_student_message', T({ p_student_id: s.id, p_message: formValues(mf).message }));
        toast('Die Nachricht wurde gespeichert.');
        await refresh();
      });
    });
    const clear = $('#msg-clear');
    if (clear) clear.addEventListener('click', () => busy(clear, async () => {
      await rpc('teacher_set_student_message', T({ p_student_id: s.id, p_message: null }));
      await refresh();
    }));
  }

  const af = $('#appt-form');
  if (af) {
    af.addEventListener('submit', (e) => {
      e.preventDefault();
      submitting(af, async () => {
        const v = formValues(af);
        const start = localDateTime(v.date, v.start);
        if (!start) throw new Error('Bitte gib Datum und Beginn des Termins an.');
        const end = v.end ? localDateTime(v.date, v.end) : null;
        if (end && end <= start) throw new Error('Das Ende muss nach dem Beginn liegen.');
        await rpc('teacher_set_appointment', T({
          p_student_id: s.id, p_start: start.toISOString(), p_end: end ? end.toISOString() : null,
          p_location: v.location, p_note: v.note,
        }));
        toast('Der Termin wurde gespeichert und erscheint im Dashboard des Schülers.');
        await refresh();
      });
    });
    const del = $('#appt-delete');
    if (del) del.addEventListener('click', () => busy(del, async () => {
      if (!confirm('Termin wirklich löschen?')) return;
      await rpc('teacher_set_appointment', T({ p_student_id: s.id, p_start: null, p_end: null, p_location: null, p_note: null }));
      toast('Der Termin wurde gelöscht.');
      await refresh();
    }));
    const ics = $('#appt-ics');
    if (ics) ics.addEventListener('click', () => {
      const ev = teacherEvent({
        ...s, student_id: s.id, class_name: cls.name, kind, start: s.appt_start, end: s.appt_end, location: s.appt_location, note: s.appt_note,
      });
      download(`Termin_${s.last_name}_${s.first_name}.ics`.replace(/\s+/g, '_'), buildIcs([ev]), 'text/calendar;charset=utf-8');
    });
  }

  bindCodeButtons(main, refresh);
  $('#remove-btn').addEventListener('click', (e) => busy(e.currentTarget, async () => {
    if (!confirm(`${fullName(s)} aus der Klasse ${cls.name} entfernen? Die Einstellungen zum Praktikumsbesuch werden dabei zurückgesetzt. Das Konto bleibt bestehen; ${s.first_name} kann mit einem Klassencode erneut beitreten.`)) return;
    await rpc('teacher_remove_student', T({ p_student_id: s.id }));
    toast(`${fullName(s)} wurde aus der Klasse entfernt.`);
    go(`#/lehrkraft/klasse/${cls.id}`);
  }));

  const pdfBtn = $('#pdf-btn');
  if (pdfBtn) pdfBtn.addEventListener('click', () => busy(pdfBtn, async () => {
    pdfBtn.textContent = 'PDF wird erstellt …';
    const { createVisitPdf } = await import('./pdf.js');
    const { bytes, filename } = await createVisitPdf(s, cls);
    download(filename, new Blob([bytes], { type: 'application/pdf' }));
  }));
}

// ---------------------------------------------------------------------
//  Profil & Notfallkontakt
// ---------------------------------------------------------------------
async function renderProfile(main) {
  const state = await rpc('teacher_get_state', T());
  headerFor(state.teacher);
  const t = state.teacher;
  render(main, html`
    ${subnav('profile')}
    <section class="narrow narrow--wide">
      <div class="card">
        <h1>Kontaktinformationen für Notfälle</h1>
        <p class="muted">Diese Angaben erscheinen bei allen Schülerinnen und Schülern deiner Klassen im Praktikums-Dashboard unter
          „Kontaktinformationen für Notfälle“. Der Name wird außerdem beim Praktikumsbesuch bzw. Videocall angezeigt.</p>
        <form id="profile-form" class="form" novalidate>
          <label class="field"><span>Name <small>(Pflicht, z. B. „Frau Muster“ oder „Jana Muster“)</small></span>
            <input name="contact_name" value="${t.contact_name}" required maxlength="120"></label>
          <label class="field"><span>E-Mail-Adresse <small>(Pflicht)</small></span>
            <input type="email" name="contact_email" value="${t.contact_email}" required maxlength="200"></label>
          <label class="field"><span>Telefonnummer <small>(freiwillig)</small></span>
            <input type="tel" name="contact_phone" value="${t.contact_phone ?? ''}" maxlength="60"></label>
          <p class="form-error" hidden></p>
          <button type="submit" class="btn btn--primary">Speichern</button>
        </form>
      </div>
      <div class="card">
        <h2>Benutzerkonto</h2>
        <dl class="data-list">
          <dt>Name</dt><dd>${t.first_name} ${t.last_name}</dd>
          <dt>Dienstliche E-Mail</dt><dd>${t.email}</dd>
        </dl>
        <h3>Passwort ändern</h3>
        <form id="tpw-form" class="form" novalidate>
          <label class="field"><span>Bisheriges Passwort</span><input type="password" name="old" autocomplete="current-password" required></label>
          <label class="field"><span>Neues Passwort <small>(mindestens 8 Zeichen)</small></span><input type="password" name="password" autocomplete="new-password" required></label>
          <label class="field"><span>Neues Passwort bestätigen</span><input type="password" name="password2" autocomplete="new-password" required></label>
          <p class="form-error" hidden></p>
          <button type="submit" class="btn">Passwort ändern</button>
        </form>
      </div>
    </section>`);
  const pf = $('#profile-form');
  pf.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(pf, async () => {
      const v = formValues(pf);
      await rpc('teacher_update_profile', T({ p_contact_name: v.contact_name, p_contact_email: v.contact_email, p_contact_phone: v.contact_phone }));
      toast('Deine Kontaktinformationen wurden gespeichert.');
      await renderProfile(main);
    });
  });
  const pw = $('#tpw-form');
  pw.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = formValues(pw);
    if (v.password !== v.password2) {
      const box = pw.querySelector('.form-error');
      box.textContent = 'Die beiden neuen Passwörter stimmen nicht überein.';
      box.hidden = false;
      return;
    }
    submitting(pw, async () => {
      await rpc('teacher_change_password', T({ p_old_password: v.old, p_new_password: v.password }));
      pw.reset();
      toast('Dein Passwort wurde geändert.');
    });
  });
}
