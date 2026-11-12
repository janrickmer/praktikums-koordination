// Lehrkräfte-Ansicht: Konto, Klassen, Schülerliste, Klassenteam, Praktikumsbesuche,
// Videocalls, Termine, Passwort-Anfragen
import { rpc, store, KEYS } from './api.js';
import {
  html, raw, render, $, $$, submitting, formValues, toast, go, download, richText, fmt, setHeader, busy,
  copyText, isoDate, isoTime, localDateTime, band, etikett, navToken, isStale,
} from './ui.js';
import {
  TEXTS, missingCount, parseKuerzel, visitKind, gradeLabel, fullName, sortName, suitcaseIcon,
  COVERS, coverIndex, coverHex,
} from './common.js';
import { icon } from './icons.js';
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

let isAdmin = false;

function headerFor(teacher, { cover, band: bandStyle = 'ink' } = {}) {
  isAdmin = Boolean(teacher && teacher.is_admin);
  setHeader({
    area: 'Lehrkräfte-Ansicht',
    user: teacher ? teacher.contact_name : '',
    actions: html`<button type="button" class="btn btn--band btn--small" id="teacher-logout">${icon('logout', { size: 16 })}<span>Abmelden</span></button>`,
    cover,
    band: bandStyle,
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
  const item = (key, href, label, ic) => html`<a href="${href}" class="${active === key ? 'is-active' : ''}" ${raw(active === key ? 'aria-current="page"' : '')}>${icon(ic, { size: 16 })}${label}</a>`;
  return html`<nav class="subnav tabs" aria-label="Lehrkräfte-Navigation">
    ${item('classes', '#/lehrkraft', 'Meine Klassen', 'heft')}
    ${item('calendar', '#/lehrkraft/kalender', 'Kalender', 'calendar')}
    ${item('profile', '#/lehrkraft/profil', 'Profil & Notfallkontakt', 'user')}
    ${isAdmin ? item('admin', '#/lehrkraft/admin', 'Lehrkräfte', 'users') : ''}
  </nav>`;
}

const authPage = (title, sub, body) => html`
  ${band({ title, sub, lift: true })}
  <div class="wrap page-body page-body--lift"><div class="narrow">${body}</div></div>`;

// ---------------------------------------------------------------------
//  Routing
// ---------------------------------------------------------------------
export async function teacherRoute(main, path, query) {
  if (!token()) {
    setHeader({ area: 'Lehrkräfte-Ansicht', band: 'ink' });
    if (path === '/lehrkraft/registrieren') return renderRegister(main);
    if (path === '/lehrkraft/passwort-vergessen') return renderForgot(main);
    if (path === '/lehrkraft/code-login') return renderCodeLogin(main);
    return renderLogin(main);
  }
  try {
    return await teacherPages(main, path, query);
  } catch (e) {
    // Anmeldung mit Einmal-Code: zuerst ein neues Passwort festlegen
    if (e && e.hint === 'must_change') {
      setHeader({ area: 'Lehrkräfte-Ansicht', band: 'ink' });
      return renderSetNewPassword(main);
    }
    throw e;
  }
}

async function teacherPages(main, path, query) {
  const parts = path.split('/').filter(Boolean);
  if (parts[1] === 'klasse' && parts[2] && parts[3] === 'schueler' && parts[4]) return renderStudent(main, parts[2], parts[4]);
  if (parts[1] === 'klasse' && parts[2]) return renderClass(main, parts[2], query);
  if (parts[1] === 'kalender') {
    const tok = navToken();
    const state = await rpc('teacher_get_state', T());
    if (isStale(tok)) return;
    headerFor(state.teacher);
    return renderCalendar(main, query, { token: token(), subnav: subnav('calendar') });
  }
  if (parts[1] === 'profil') return renderProfile(main);
  if (parts[1] === 'admin') return renderAdmin(main);
  return renderDashboard(main);
}

// ---------------------------------------------------------------------
//  Anmelden / Registrieren
// ---------------------------------------------------------------------
function renderLogin(main) {
  render(main, authPage('Anmelden als Lehrkraft', 'Mit deiner dienstlichen E-Mail-Adresse.', html`
    <form id="tlogin-form" class="sheet form" novalidate>
      <label class="field"><span>Dienstliche E-Mail-Adresse</span>
        <input type="email" name="email" autocomplete="username" required></label>
      <label class="field"><span>Passwort</span>
        <input type="password" name="password" autocomplete="current-password" required></label>
      <p class="form-error" hidden></p>
      <button type="submit" class="btn btn--primary btn--block">Anmelden</button>
      <div class="auth-links">
        <a href="#/lehrkraft/passwort-vergessen">Passwort vergessen?</a>
        <a href="#/lehrkraft/code-login">Ich habe einen Einmal-Code</a>
      </div>
    </form>
    <div class="sheet sheet--quiet">
      <h2 class="sheet__title">Noch kein Benutzerkonto?</h2>
      <p>Als Lehrkraft registrierst du dich zuerst. Dafür brauchst du den Lehrkräfte-Code.</p>
      <a class="btn btn--block" href="#/lehrkraft/registrieren">Benutzerkonto registrieren ${icon('arrowRight')}</a>
    </div>`));
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
  render(main, authPage('Benutzerkonto registrieren', 'Für Lehrkräfte der Georg-Christoph-Lichtenberg-Schule.', html`
    <form id="treg-form" class="sheet form" novalidate>
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
      <div class="auth-links"><a href="#/lehrkraft">Ich habe schon ein Konto</a></div>
    </form>`));
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

function renderForgot(main) {
  render(main, authPage('Passwort vergessen', 'Die Administration des Portals erzeugt dir einen Einmal-Code für ein neues Passwort.', html`
    <div class="sheet" id="tforgot-card">
      <p>Mit dem <strong>Einmal-Code</strong> meldest du dich einmalig an (bis zu zwei Stunden nach dem Erzeugen) und legst dabei ein neues Passwort fest.</p>
      <form id="tforgot-form" class="form" novalidate>
        <label class="field"><span>Dienstliche E-Mail-Adresse</span>
          <input type="email" name="email" autocomplete="username" required></label>
        <p class="form-error" hidden></p>
        <button type="submit" class="btn btn--primary btn--block">Anfrage an die Administration senden</button>
      </form>
      <div class="auth-links"><a href="#/lehrkraft">Zurück zur Anmeldung</a><a href="#/lehrkraft/code-login">Ich habe schon einen Einmal-Code</a></div>
    </div>`));
  const form = $('#tforgot-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const v = formValues(form);
      if (!v.email.trim()) throw new Error('Bitte gib deine dienstliche E-Mail-Adresse an.');
      await rpc('teacher_request_reset', { p_site_password: store.get(KEYS.site), p_email: v.email });
      render($('#tforgot-card'), html`
        <h2 class="sheet__title">Anfrage gesendet</h2>
        <div class="note note--ok">${icon('check')}<p>Falls ein Lehrkräfte-Konto mit dieser E-Mail-Adresse existiert, sieht die Administration jetzt deine Anfrage.</p></div>
        <p>Sobald du den Einmal-Code bekommen hast, meldest du dich damit an. Der Code ist nach dem Erzeugen
          <strong>zwei Stunden</strong> gültig und funktioniert nur <strong>einmal</strong>.</p>
        <a class="btn btn--primary btn--block" href="#/lehrkraft/code-login">Mit Einmal-Code anmelden ${icon('arrowRight')}</a>`);
    });
  });
}

function renderCodeLogin(main) {
  render(main, authPage('Mit Einmal-Code anmelden', 'Den Code hat dir die Administration gegeben. Danach legst du sofort ein neues Passwort fest.', html`
    <form id="tcode-form" class="sheet form" novalidate>
      <label class="field"><span>Dienstliche E-Mail-Adresse</span>
        <input type="email" name="email" autocomplete="username" required></label>
      <label class="field"><span>Einmal-Code</span>
        <input name="code" autocomplete="one-time-code" class="input-code input-code--large" required maxlength="12" placeholder="XXXX-XXXX"></label>
      <p class="form-error" hidden></p>
      <button type="submit" class="btn btn--primary btn--block">Anmelden</button>
      <div class="auth-links"><a href="#/lehrkraft">Zurück zur Anmeldung</a></div>
    </form>`));
  const form = $('#tcode-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const v = formValues(form);
      const res = await rpc('teacher_login_with_code', { p_email: v.email, p_code: v.code });
      store.set(KEYS.teacher, res.token);
      go('#/lehrkraft');
    });
  });
}

function renderSetNewPassword(main) {
  render(main, authPage('Neues Passwort festlegen', 'Du hast dich mit einem Einmal-Code angemeldet. Bitte lege jetzt ein neues Passwort fest.', html`
    <form id="tnewpw-form" class="sheet form" novalidate>
      <label class="field"><span>Neues Passwort <small>(mindestens 8 Zeichen)</small></span>
        <input type="password" name="password" autocomplete="new-password" required minlength="8" maxlength="72"></label>
      <label class="field"><span>Neues Passwort bestätigen</span>
        <input type="password" name="password2" autocomplete="new-password" required></label>
      <p class="form-error" hidden></p>
      <button type="submit" class="btn btn--primary btn--block">Passwort speichern</button>
    </form>`));
  const form = $('#tnewpw-form');
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
      const res = await rpc('teacher_set_new_password', T({ p_new_password: v.password }));
      store.set(KEYS.teacher, res.token);
      toast('Dein neues Passwort ist gespeichert.');
      go('#/lehrkraft');
    });
  });
}

// ---------------------------------------------------------------------
//  Administration: Lehrkräfte und ihre Passwort-Anfragen
// ---------------------------------------------------------------------
const issuedTeacherCodes = new Map();

async function renderAdmin(main) {
  const tok = navToken();
  const [state, data] = await Promise.all([rpc('teacher_get_state', T()), rpc('admin_get_teachers', T())]);
  if (isStale(tok)) return;
  headerFor(state.teacher);
  const refresh = () => (isStale(tok) ? Promise.resolve() : renderAdmin(main));
  const requests = data.teachers.filter((t) => t.requested_at);
  const codeRow = (t) => {
    const c = issuedTeacherCodes.get(t.id);
    if (!c) return '';
    return html`<div class="code-issued" role="status">
      ${icon('key')}
      <span>Einmal-Code für ${t.first_name} ${t.last_name}</span> <strong class="code-display">${c.code}</strong>
      <span class="small">gültig bis ${fmt.time(c.expires_at)} Uhr, nur einmal verwendbar – bitte persönlich weitergeben.</span>
      <button type="button" class="btn btn--small btn--ghost" data-copy="${c.code}">${icon('copy', { size: 15 })} Kopieren</button>
    </div>`;
  };
  render(main, html`
    ${band({ tabs: subnav('admin'), title: 'Lehrkräfte', sub: `${data.teachers.length} registrierte Lehrkräfte · Administration des Portals` })}
    <div class="wrap page-body stack-lg">
      ${requests.length ? html`
      <section class="sheet card--alert">
        <h2 class="sheet__title">${icon('key', { size: 20 })} Passwort-Anfragen von Lehrkräften <span class="tag tag--warn">${requests.length} offen</span></h2>
        <p class="muted small">Erzeuge einen Einmal-Code und gib ihn der Lehrkraft persönlich (oder über einen sicheren Weg) weiter.
          Der Code ist zwei Stunden gültig und nur einmal verwendbar; bei der Anmeldung damit legt die Lehrkraft ein neues Passwort fest.</p>
        <ul class="request-list">
          ${requests.map((t) => html`
            <li>
              <div class="request-main">
                <div><strong>${t.last_name}, ${t.first_name}</strong> <span class="muted small">${t.email}</span></div>
                <div class="small muted">angefragt am ${fmt.dateTime(t.requested_at)}
                  ${t.code_issued_at ? html` · Code erzeugt um ${fmt.time(t.code_issued_at)} Uhr${new Date(t.code_expires_at) < new Date() ? ' (abgelaufen)' : ''}` : ''}</div>
              </div>
              <div class="request-actions">
                <button type="button" class="btn btn--primary btn--small" data-tissue="${t.id}">${t.code_issued_at ? 'Neuen Code erzeugen' : 'Einmal-Code erzeugen'}</button>
                <button type="button" class="btn btn--ghost btn--small" data-tdismiss="${t.id}">Verwerfen</button>
              </div>
              ${codeRow(t)}
            </li>`)}
        </ul>
      </section>` : ''}

      <section class="sheet sheet--flush">
        <div class="sheet__head sheet__head--pad"><h2 class="sheet__title">Alle Lehrkräfte</h2></div>
        <div class="table-wrap">
          <table class="student-table teacher-table">
            <thead><tr><th>Name</th><th>E-Mail</th><th class="num">Klassen</th><th class="num">Schüler/-innen</th><th>Registriert</th><th><span class="sr-only">Aktion</span></th></tr></thead>
            <tbody>
              ${data.teachers.map((t) => html`<tr>
                <td class="col-name">${t.last_name}, ${t.first_name}${t.is_admin ? html` <span class="tag tag--cover">Admin</span>` : ''}${t.requested_at ? html` <span class="tag tag--warn">Anfrage</span>` : ''}</td>
                <td>${t.email}</td>
                <td class="num">${t.class_count}</td>
                <td class="num">${t.student_count}</td>
                <td class="nowrap">${fmt.date(t.created_at)}</td>
                <td>${t.is_me ? '' : html`<button type="button" class="btn btn--small btn--ghost" data-tissue="${t.id}">${icon('key', { size: 15 })} Einmal-Code</button>`}</td>
              </tr>
              ${issuedTeacherCodes.has(t.id) && !t.requested_at ? html`<tr class="row-code"><td colspan="6">${codeRow(t)}</td></tr>` : ''}`)}
            </tbody>
          </table>
        </div>
      </section>
      <p class="hint">Admin-Rechte vergibst du im Supabase SQL Editor mit <code>select app.set_admin('dienstliche@adresse.de');</code>.
        Dein eigenes Passwort setzt du dort bei Bedarf mit <code>app.admin_reset_teacher_password</code> zurück.</p>
    </div>`);
  $$('[data-tissue]', main).forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    const res = await rpc('admin_issue_teacher_code', T({ p_teacher_id: b.dataset.tissue }));
    issuedTeacherCodes.set(b.dataset.tissue, res);
    await refresh();
  })));
  $$('[data-tdismiss]', main).forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    if (!confirm('Anfrage verwerfen? Ein bereits erzeugter Code wird damit ungültig.')) return;
    await rpc('admin_dismiss_teacher_reset', T({ p_teacher_id: b.dataset.tdismiss }));
    issuedTeacherCodes.delete(b.dataset.tdismiss);
    await refresh();
  })));
  $$('[data-copy]', main).forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy)));
}

// ---------------------------------------------------------------------
//  Übersicht: Passwort-Anfragen + Klassen
// ---------------------------------------------------------------------
function codeBox(studentId) {
  const c = issuedCodes.get(studentId);
  if (!c) return '';
  return html`<div class="code-issued" role="status">
    ${icon('key')}
    <span>Einmal-Code</span> <strong class="code-display">${c.code}</strong>
    <span class="small">gültig bis ${fmt.time(c.expires_at)} Uhr, nur einmal verwendbar – bitte persönlich weitergeben.</span>
    <button type="button" class="btn btn--small btn--ghost" data-copy="${c.code}">${icon('copy', { size: 15 })} Kopieren</button>
  </div>`;
}

function resetRequestsCard(requests) {
  if (!requests.length) return '';
  return html`
    <section class="sheet card--alert">
      <h2 class="sheet__title">${icon('key', { size: 20 })} Passwort-Anfragen <span class="tag tag--warn">${requests.length} offen</span></h2>
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

function swatches(name, selected) {
  return html`<fieldset class="swatches">
    <legend>Umschlagfarbe</legend>
    <div class="swatches__row">
      ${COVERS.map((c, i) => html`<label class="swatch" style="--sw:${c.hex}">
        <input type="radio" name="${name}" value="${i}" ${raw(i === selected ? 'checked' : '')}>
        <span class="swatch__dot" aria-hidden="true">${icon('check', { size: 16 })}</span>
        <span class="swatch__name">${c.name}</span>
      </label>`)}
    </div>
  </fieldset>`;
}

function leastUsedCover(classes) {
  const counts = COVERS.map(() => 0);
  for (const c of classes) counts[coverIndex(c)] += 1;
  return counts.indexOf(Math.min(...counts));
}

function wizardCard(classes) {
  if (!wizard.open) {
    if (classes.length) return '';
    return html`<button type="button" class="class-card class-card--add" data-wizard-open>
      <span class="plus">${icon('plus', { size: 26 })}</span><span>Erste Klasse hinzufügen</span></button>`;
  }
  if (wizard.created) {
    const c = wizard.created;
    return html`<div class="class-card class-card--wizard sheet" style="--cover:${coverHex(c)}">
      <div class="wizard-head"><h3>Klasse ${c.name} angelegt</h3><span class="muted small">${gradeLabel(c.grade)}</span></div>
      <p class="small">Diesen Code brauchen deine Schülerinnen und Schüler, um der Klasse beizutreten:</p>
      <div class="join-code join-code--big">${c.join_code}</div>
      <div class="form-actions">
        <button type="button" class="btn btn--small" data-copy="${c.join_code}">${icon('copy', { size: 15 })} Code kopieren</button>
        <a class="btn btn--small btn--primary" href="#/lehrkraft/klasse/${c.id}">Klasse öffnen ${icon('arrowRight', { size: 15 })}</a>
        <button type="button" class="btn btn--small btn--ghost" id="wizard-close">Fertig</button>
      </div>
    </div>`;
  }
  if (!wizard.grade) {
    return html`<div class="class-card class-card--wizard sheet">
      <div class="wizard-head"><h3>Jahrgang auswählen</h3><span class="muted small">Schritt 1 von 2</span></div>
      <div class="grade-choice">
        <button type="button" class="btn btn--choice" data-grade="9"><strong>Jg. 9</strong></button>
        <button type="button" class="btn btn--choice" data-grade="11"><strong>Jg. 11</strong><span>E-Phase</span></button>
      </div>
      <button type="button" class="btn btn--ghost btn--small" id="wizard-close">Abbrechen</button>
    </div>`;
  }
  return html`<form class="class-card class-card--wizard sheet form" id="wizard-form" novalidate>
    <div class="wizard-head"><h3>Namen der Klasse eingeben</h3><span class="muted small">Schritt 2 von 2 · ${gradeLabel(wizard.grade)}</span></div>
    <label class="field"><span>Name der Klasse bzw. des Kurses</span>
      <input name="name" required maxlength="60" placeholder="${wizard.grade === '9' ? 'z. B. 9b' : 'z. B. E-Phase PoWi 2'}" autofocus></label>
    ${swatches('cover', leastUsedCover(classes))}
    <p class="form-error" hidden></p>
    <div class="form-actions">
      <button type="submit" class="btn btn--primary btn--small">Klasse anlegen &amp; Code erzeugen</button>
      <button type="button" class="btn btn--ghost btn--small" id="wizard-back">${icon('arrowLeft', { size: 15 })} Zurück</button>
    </div>
  </form>`;
}

async function createClass(grade, name, cover) {
  try {
    return await rpc('teacher_create_class', T({ p_grade: grade, p_name: name, p_cover: cover }));
  } catch (e) {
    // Datenbank noch ohne Umschlagfarben (schema.sql nicht erneut ausgeführt): ohne Farbe anlegen
    if (e.code === 'PGRST202') return rpc('teacher_create_class', T({ p_grade: grade, p_name: name }));
    throw e;
  }
}

async function renderDashboard(main) {
  const tok = navToken();
  const state = await rpc('teacher_get_state', T());
  if (isStale(tok)) return;
  headerFor(state.teacher);
  const refresh = () => (isStale(tok) ? Promise.resolve() : renderDashboard(main));
  render(main, html`
    ${band({
      tabs: subnav('classes'),
      title: 'Meine Klassen im Praktikum',
      sub: `Schuljahr ${schoolYear()}`,
      aside: html`<button type="button" class="btn btn--band-solid" id="wizard-open">${icon('plus', { size: 18 })} Klasse hinzufügen</button>`,
    })}
    <div class="wrap page-body">
      ${state.teacher_requests ? html`<section class="sheet card--alert">
        <h2 class="sheet__title">${icon('key', { size: 20 })} Passwort-Anfragen von Lehrkräften <span class="tag tag--warn">${state.teacher_requests} offen</span></h2>
        <p><a href="#/lehrkraft/admin">Zur Lehrkräfte-Verwaltung ${icon('arrowRight', { size: 15 })}</a></p>
      </section>` : ''}
      ${resetRequestsCard(state.reset_requests)}
      <section class="class-grid" aria-label="Klassen">
        ${state.classes.map((c) => html`
          <a class="class-card heft" href="#/lehrkraft/klasse/${c.id}" style="--cover:${coverHex(c)}">
            <span class="heft__label">
              <span class="heft__name">${c.name}</span>
              <span class="heft__line"><span>Jahrgang</span><span>${gradeLabel(c.grade)}</span></span>
              <span class="heft__line"><span>Code</span><span class="join-code">${c.join_code}</span></span>
            </span>
            <span class="heft__stats">
              <span>${icon('users', { size: 16 })}<strong>${c.student_count}</strong> Schüler/-innen</span>
              <span>${icon('calendar', { size: 16 })}<strong>${c.appointment_count}</strong> Termine</span>
              ${c.lodging_count ? html`<span>${icon('suitcase', { size: 16 })}<strong>${c.lodging_count}</strong> wohnen woanders</span>` : ''}
            </span>
            ${c.missing_info_count ? html`<span class="heft__alert">${icon('alert', { size: 15 })}${c.missing_info_count} ohne Information zum Besuch/Gespräch</span>` : ''}
          </a>`)}
        ${wizardCard(state.classes)}
      </section>
      ${state.classes.length === 0 && !wizard.open ? html`<p class="muted">Lege zuerst die Klassen an, die sich in diesem Schuljahr im Praktikum befinden.</p>` : ''}
      ${!state.teacher.contact_phone ? html`<p class="hint">Tipp: Unter <a href="#/lehrkraft/profil">Profil &amp; Notfallkontakt</a> kannst du eine Telefonnummer für Notfälle hinterlegen. Sie wird deinen Schülerinnen und Schülern im Dashboard angezeigt.</p>` : ''}
    </div>
  `);
  bindCodeButtons(main, refresh);
  main.querySelectorAll('#wizard-open, [data-wizard-open]').forEach((b) => b.addEventListener('click', () => {
    Object.assign(wizard, { open: true, grade: null, created: null });
    refresh().then(() => { const w = $('.class-card--wizard'); if (w) w.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  }));
  $$('#wizard-close').forEach((b) => b.addEventListener('click', () => { Object.assign(wizard, { open: false, grade: null, created: null }); refresh(); }));
  const back = $('#wizard-back');
  if (back) back.addEventListener('click', () => { wizard.grade = null; refresh(); });
  $$('[data-grade]').forEach((b) => b.addEventListener('click', () => { wizard.grade = b.dataset.grade; refresh(); }));
  const form = $('#wizard-form');
  if (form) form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const v = formValues(form);
      wizard.created = await createClass(wizard.grade, v.name, Number(v.cover));
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
  if (k === 'me') return html`<span class="tag tag--cover">${icon('building', { size: 14 })}Präsenz · ich</span>`;
  if (k === 'video') return html`<span class="tag tag--cover">${icon('video', { size: 14 })}Videocall</span>`;
  if (k === 'other') {
    return s.visit_teacher_name
      ? html`<span class="tag">${icon('building', { size: 14 })}Präsenz · ${s.visit_teacher_name}</span>`
      : html`<span class="tag tag--warn">${icon('building', { size: 14 })}Präsenz · Lehrkraft offen</span>`;
  }
  return html`<span class="tag tag--muted">offen</span>`;
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
  return html`<section class="sheet has-margin notice--danger" role="alert">
    <span class="margin-mark margin-mark--head" aria-hidden="true">${icon('alert', { size: 18 })}</span>
    <h2 class="sheet__title">Diese Schülerinnen und Schüler haben noch keine Information erhalten</h2>
    ${me.length ? html`<p><strong>Praktikumsbesuche durch mich:</strong> ${me.map(fullName).join(', ')}
      – <button type="button" class="link-button" data-open-panel="me">Nachricht hinterlegen</button></p>` : ''}
    ${video.length ? html`<p><strong>Praktikumsgespräche mit Videocall:</strong> ${video.map(fullName).join(', ')}
      – <button type="button" class="link-button" data-open-panel="video">Nachricht hinterlegen</button></p>` : ''}
    <p class="small">Sie sehen bisher nur den Standardtext „${TEXTS.infoDefault}“</p>
  </section>`;
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
    <section class="sheet panel" id="message-panel">
      <div class="sheet__head">
        <h2 class="sheet__title">${icon(kind === 'me' ? 'building' : 'video', { size: 20 })} ${KIND_TITLE[kind]}</h2>
        <button type="button" class="btn btn--ghost btn--small" id="panel-close">${icon('x', { size: 15 })} Schließen</button>
      </div>
      ${noInfo.length ? html`<p class="text-danger"><strong>Noch keine Information erhalten:</strong> ${noInfo.map(fullName).join(', ')}</p>` : ''}
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
              <p class="msg-group__label">${g.type === 'default' ? icon('alert', { size: 14 }) : icon('message', { size: 14 })}${label[g.type]}</p>
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
                    <a class="btn btn--small btn--ghost" href="#/lehrkraft/klasse/${cls.id}/schueler/${s.id}">Termin &amp; Details ${icon('arrowRight', { size: 15 })}</a>
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
    <section class="sheet" id="klassenteam">
      <h2 class="sheet__title">Klassenteam</h2>
      <p class="muted small">Kürzel der Lehrkräfte, die die Schülerinnen und Schüler dieser Klasse angegeben haben.
        Je häufiger ein Kürzel genannt wurde, desto größer ist es; die kleine Zahl nennt die Anzahl. Klicke auf ein Kürzel, um zu sehen, wer es eingetragen hat.</p>
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
  const tok = navToken();
  const [state, data] = cached
    || await Promise.all([rpc('teacher_get_state', T()), rpc('teacher_get_class', T({ p_class_id: classId }))]);
  if (isStale(tok)) return;
  const cls = data.class;
  if (!cached) headerFor(state.teacher, { cover: coverHex(cls), band: 'cover' });
  const students = sortStudents(data.students, classUi.sort);
  // refresh = Daten neu laden (nach Änderungen); repaint = nur neu darstellen (Sortierung, Aufklappen)
  const refresh = () => (isStale(tok) ? Promise.resolve() : renderClass(main, classId, null));
  const repaint = () => (isStale(tok) ? Promise.resolve() : renderClass(main, classId, null, [state, data]));
  const studentHref = (s) => `#/lehrkraft/klasse/${cls.id}/schueler/${s.id}`;

  render(main, html`
    ${band({
      tabs: subnav('classes'),
      crumbs: html`<a href="#/lehrkraft">${icon('arrowLeft', { size: 16 })} Meine Klassen</a>`,
      title: `Klasse ${cls.name}`,
      sub: `${gradeLabel(cls.grade)} · ${students.length} Schüler/-innen`,
      aside: etikett([
        ['Beitrittscode', html`<span class="join-code">${cls.join_code}</span>`],
      ], html`<button type="button" class="btn btn--small btn--ghost etikett__action" data-copy="${cls.join_code}">${icon('copy', { size: 15 })} Kopieren</button>`),
    })}
    <div class="wrap page-body">
      ${noInfoNotice(data.students, cls)}

      <div class="toolbar">
        <div class="toolbar__group">
          <button type="button" class="btn ${classUi.panel === 'me' ? 'btn--primary' : ''}" data-toggle-panel="me" aria-expanded="${classUi.panel === 'me'}">${icon('building', { size: 17 })} Praktikumsbesuche durch mich</button>
          <button type="button" class="btn ${classUi.panel === 'video' ? 'btn--primary' : ''}" data-toggle-panel="video" aria-expanded="${classUi.panel === 'video'}">${icon('video', { size: 17 })} Praktikumsgespräche mit Videocall</button>
        </div>
      </div>

      ${classUi.panel ? messagePanel(classUi.panel, cls, data.students) : ''}

      <section class="sheet sheet--flush">
        <div class="sheet__head sheet__head--pad">
          <h2 class="sheet__title">Schülerinnen und Schüler <span class="muted">(${students.length})</span></h2>
          <label class="sort-select"><span>Sortieren nach</span>
            <select id="sort-select">
              <option value="name" ${raw(classUi.sort === 'name' ? 'selected' : '')}>Nachname (A–Z)</option>
              <option value="km" ${raw(classUi.sort === 'km' ? 'selected' : '')}>Entfernung von der Schule</option>
              <option value="company" ${raw(classUi.sort === 'company' ? 'selected' : '')}>Praktikumsbetrieb (A–Z)</option>
            </select></label>
        </div>
        ${students.length === 0
          ? html`<p class="pad muted">Noch niemand ist dieser Klasse beigetreten. Gib deinen Schülerinnen und Schülern den Beitrittscode <strong class="join-code">${cls.join_code}</strong>.</p>`
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
                  return html`<tr data-href="${studentHref(s)}" class="${miss ? 'row--missing' : ''}">
                    <td class="col-icon">${s.lodging_away ? suitcaseIcon() : ''}</td>
                    <td class="col-name"><a href="${studentHref(s)}">${sortName(s)}</a>${s.reset_requested ? html`<span class="tag tag--warn tag--icon" title="Passwort-Anfrage offen">${icon('key', { size: 14, label: 'Passwort-Anfrage offen' })}</span>` : ''}</td>
                    <td class="c-company">${s.company_name || html`<span class="muted">–</span>`}</td>
                    <td class="c-city">${[s.company_zip, s.company_city].filter(Boolean).join(' ') || html`<span class="muted">–</span>`}</td>
                    <td class="num c-km">${s.distance_km !== null ? fmt.km(s.distance_km) : html`<span class="muted">–</span>`}</td>
                    <td class="c-visit">${visitBadge(s)}</td>
                    <td class="nowrap c-appt">${s.appt_start ? html`${icon('calendar', { size: 14, cls: 'only-mobile' })}${fmt.weekdayShort(s.appt_start)} ${fmt.dateShort(s.appt_start)}, ${fmt.time(s.appt_start)}` : html`<span class="muted">–</span>`}</td>
                    <td class="nowrap c-status">${miss ? html`<span class="text-danger small">${icon('alert', { size: 14 })} ${miss} fehlen</span>` : html`<span class="text-ok small">${icon('check', { size: 14 })} vollständig</span>`}</td>
                  </tr>`;
                })}
              </tbody>
            </table>
          </div>
          <p class="pad small muted legend">${suitcaseIcon()} wohnt während des Praktikums woanders als an der eigenen Adresse · <span class="legend__margin"></span> roter Rand: Angaben fehlen noch</p>`}
      </section>

      ${teamCloud(data.students)}

      <details class="sheet settings">
        <summary>${icon('heft', { size: 17 })} Umschlagfarbe der Klasse</summary>
        <form id="cover-form" class="form" novalidate>
          <p class="small muted">Die Farbe erscheint bei dir und bei allen Schülerinnen und Schülern dieser Klasse.</p>
          ${swatches('cover', coverIndex(cls))}
          <p class="form-error" hidden></p>
          <div class="form-actions"><button type="submit" class="btn btn--small btn--primary">Farbe übernehmen</button></div>
        </form>
      </details>

      <details class="sheet danger-zone">
        <summary>${icon('trash', { size: 17 })} Klasse löschen</summary>
        <form id="delete-class-form" class="form" novalidate>
          <p>Löscht die Klasse <strong>${cls.name}</strong> <strong>mit allen Schülerkonten und Daten</strong> dieser Klasse endgültig
            (z. B. am Ende des Schuljahres). Zur Bestätigung den Klassennamen eingeben:</p>
          <label class="field"><span class="sr-only">Klassenname</span><input name="confirm" autocomplete="off" placeholder="${cls.name}"></label>
          <p class="form-error" hidden></p>
          <div class="form-actions"><button type="submit" class="btn btn--danger">Endgültig löschen</button></div>
        </form>
      </details>
    </div>
  `);

  // Ereignisse
  $$('[data-copy]', main).forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy)));
  const scrollToPanel = () => { const p = $('#message-panel'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  $$('[data-toggle-panel]').forEach((b) => b.addEventListener('click', () => {
    classUi.panel = classUi.panel === b.dataset.togglePanel ? null : b.dataset.togglePanel;
    repaint().then(scrollToPanel);
  }));
  $$('[data-open-panel]').forEach((b) => b.addEventListener('click', () => {
    classUi.panel = b.dataset.openPanel;
    repaint().then(scrollToPanel);
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

  const coverForm = $('#cover-form');
  coverForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(coverForm, async () => {
      await rpc('teacher_set_class_cover', T({ p_class_id: cls.id, p_cover: Number(formValues(coverForm).cover) }));
      toast('Die Umschlagfarbe wurde geändert.');
      await refresh();
    });
  });

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
  const tok = navToken();
  const [state, data] = await Promise.all([rpc('teacher_get_state', T()), rpc('teacher_get_student', T({ p_student_id: studentId }))]);
  if (isStale(tok)) return;
  const s = data.student;
  const cls = data.class;
  headerFor(state.teacher, { cover: coverHex(cls), band: 'cover' });
  const me = data.teacher.contact_name;
  const kind = visitKind(s);
  const refresh = () => (isStale(tok) ? Promise.resolve() : renderStudent(main, classId, studentId));
  const classMsg = kind === 'me' ? cls.visit_message : kind === 'video' ? cls.video_message : null;
  const info = messageInfo(s, cls);
  const companyAddress = [s.company_street, [s.company_zip, s.company_city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const apptStart = s.appt_start ? new Date(s.appt_start) : null;
  const apptEnd = s.appt_end ? new Date(s.appt_end) : null;

  render(main, html`
    ${band({
      tabs: subnav('classes'),
      crumbs: html`<a href="#/lehrkraft">Meine Klassen</a> ${icon('chevronRight', { size: 14 })} <a href="#/lehrkraft/klasse/${cls.id}">${cls.name}</a>`,
      title: html`${fullName(s)}${s.lodging_away ? html` <span class="title-icon">${suitcaseIcon()}</span>` : ''}`,
      sub: `Klasse ${cls.name} · ${gradeLabel(cls.grade)}`,
      aside: kind === 'other' ? html`<button type="button" class="btn btn--band-solid" id="pdf-btn">${icon('file', { size: 18 })} Informationen für die besuchende Lehrkraft</button>` : '',
    })}
    <div class="wrap page-body">
    <div class="detail-grid">
      <div class="detail-col">
        <section class="sheet">
          <h2 class="sheet__title">Kontakt</h2>
          <dl class="data-list">
            <dt>E-Mail</dt><dd><a href="mailto:${s.email}">${s.email}</a></dd>
            <dt>Private Handynummer</dt><dd>${s.mobile_phone ? html`${s.mobile_phone} <span class="small muted">(nur bei Schwierigkeiten beim Antreffen)</span>` : html`<span class="muted">nicht angegeben (freiwillig)</span>`}</dd>
          </dl>
        </section>
        <section class="sheet">
          <h2 class="sheet__title">Betriebssteckbrief</h2>
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
        <section class="sheet">
          <h2 class="sheet__title">Unterkunft während des Praktikums</h2>
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
        <section class="sheet">
          <h2 class="sheet__title">Praktikumsbesuch / Praktikumsgespräch</h2>
          <form id="visit-form" class="form" novalidate>
            <fieldset class="field">
              <legend>Format</legend>
              <label class="choice"><input type="radio" name="format" value="" ${raw(kind === 'none' ? 'checked' : '')}> Noch nicht festgelegt</label>
              <label class="choice"><input type="radio" name="format" value="praesenz" ${raw(s.visit_format === 'praesenz' ? 'checked' : '')}> ${icon('building', { size: 17 })} Praktikumsbesuch in Präsenz</label>
              <label class="choice"><input type="radio" name="format" value="video" ${raw(kind === 'video' ? 'checked' : '')}> ${icon('video', { size: 17 })} Praktikumsgespräch mit Videocall <span class="muted small">(durch mich)</span></label>
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
            <div class="form-actions"><button type="submit" class="btn btn--primary">Speichern</button></div>
          </form>
        </section>

        ${kind === 'me' || kind === 'video' ? html`
        <section class="sheet">
          <h2 class="sheet__title">Nachricht im Dashboard von ${s.first_name}</h2>
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

        <section class="sheet">
          <h2 class="sheet__title">Termin</h2>
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
              ${apptStart ? html`<button type="button" class="btn btn--ghost" id="appt-ics">${icon('download', { size: 15 })} .ics herunterladen</button>
                <span class="form-actions__spacer"></span>
                <button type="button" class="btn btn--ghost btn--danger-text" id="appt-delete">${icon('trash', { size: 15 })} Termin löschen</button>` : ''}
            </div>
          </form>
        </section>` : ''}

        <section class="sheet">
          <h2 class="sheet__title">Weitere Aktionen</h2>
          <div class="stack">
            <div class="action-row">
              <button type="button" class="btn btn--small" data-issue="${s.id}">${icon('key', { size: 15 })} Einmal-Code für neues Passwort erzeugen</button>
              ${s.reset_requested ? html`<span class="tag tag--warn">Passwort-Anfrage offen</span>` : ''}
            </div>
            ${codeBox(s.id)}
            <div class="action-row action-row--danger"><button type="button" class="btn btn--small btn--ghost btn--danger-text" id="remove-btn">Aus der Klasse entfernen</button></div>
          </div>
        </section>
      </div>
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
      download(`Termin_${s.last_name}_${s.first_name}.ics`, buildIcs([ev]), 'text/calendar;charset=utf-8');
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
  const tok = navToken();
  const state = await rpc('teacher_get_state', T());
  if (isStale(tok)) return;
  headerFor(state.teacher);
  const t = state.teacher;
  render(main, html`
    ${band({ tabs: subnav('profile'), title: 'Profil & Notfallkontakt', sub: `${t.first_name} ${t.last_name} · ${t.email}` })}
    <div class="wrap page-body"><div class="narrow narrow--wide stack-lg">
      <section class="sheet">
        <h2 class="sheet__title">Kontaktinformationen für Notfälle</h2>
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
          <div class="form-actions"><button type="submit" class="btn btn--primary">Speichern</button></div>
        </form>
      </section>
      <section class="sheet">
        <h2 class="sheet__title">Passwort ändern</h2>
        <form id="tpw-form" class="form" novalidate>
          <label class="field"><span>Bisheriges Passwort</span><input type="password" name="old" autocomplete="current-password" required></label>
          <label class="field"><span>Neues Passwort <small>(mindestens 8 Zeichen)</small></span><input type="password" name="password" autocomplete="new-password" required></label>
          <label class="field"><span>Neues Passwort bestätigen</span><input type="password" name="password2" autocomplete="new-password" required></label>
          <p class="form-error" hidden></p>
          <div class="form-actions"><button type="submit" class="btn">Passwort ändern</button></div>
        </form>
      </section>
    </div></div>`);
  const pf = $('#profile-form');
  pf.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(pf, async () => {
      const v = formValues(pf);
      await rpc('teacher_update_profile', T({ p_contact_name: v.contact_name, p_contact_email: v.contact_email, p_contact_phone: v.contact_phone }));
      toast('Deine Kontaktinformationen wurden gespeichert.');
      if (!isStale(tok)) await renderProfile(main);
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
