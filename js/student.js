// Schüleransicht: Registrierung, Anmeldung, Klasse beitreten, Betriebssteckbrief,
// Klassenteam und Praktikums-Dashboard
import { rpc, store, KEYS } from './api.js';
import {
  html, raw, render, $, $$, submitting, formValues, toast, go, download, richText, fmt, setHeader, busy,
} from './ui.js';
import {
  TEXTS, STECKBRIEF_FIELDS, missingData, parseKuerzel, gradeLabel, appointmentEnd,
} from './common.js';
import { buildIcs, studentEvent } from './ics.js';

const token = () => store.get(KEYS.student);

function logoutButton() {
  return html`<a class="btn btn--ghost btn--small" href="#/konto">Konto</a>
    <button type="button" class="btn btn--ghost btn--small" id="student-logout">Abmelden</button>`;
}
function bindLogout() {
  const b = document.getElementById('student-logout');
  if (b) b.addEventListener('click', async () => {
    const t = token();
    store.del(KEYS.student);
    try { if (t) await rpc('logout', { p_token: t }); } catch { /* egal */ }
    go('#/');
  });
}

function bindPasswordConfirm(form) {
  form.addEventListener('submit', (e) => {
    const { password, password2 } = formValues(form);
    if (password2 !== undefined && password !== password2) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const box = form.querySelector('.form-error');
      box.textContent = 'Die beiden Passwörter stimmen nicht überein.';
      box.hidden = false;
    }
  });
}

// ---------------------------------------------------------------------
//  Routing
// ---------------------------------------------------------------------
export async function studentRoute(main, path, query) {
  if (!token()) {
    setHeader({ area: 'Schüleransicht' });
    if (path === '/registrieren') return renderRegister(main);
    if (path === '/passwort-vergessen') return renderForgot(main);
    if (path === '/code-login') return renderCodeLogin(main);
    return renderLogin(main);
  }
  const state = await rpc('student_get_state', { p_token: token() });
  if (state.must_change_password) {
    setHeader({ area: 'Schüleransicht', user: state.student.first_name });
    return renderSetNewPassword(main, state);
  }
  setHeader({ area: 'Schüleransicht', user: `${state.student.first_name} ${state.student.last_name}`, actions: logoutButton() });
  bindLogout();
  if (!state.class) return renderJoin(main, state);
  switch (path) {
    case '/steckbrief': return renderSteckbrief(main, state, query);
    case '/klassenteam': return renderKlassenteam(main, state, query);
    case '/konto': return renderAccount(main, state);
    default: return renderDashboard(main, state);
  }
}

// ---------------------------------------------------------------------
//  Anmelden / Registrieren / Passwort vergessen
// ---------------------------------------------------------------------
function renderLogin(main) {
  render(main, html`
    <section class="narrow">
      <div class="card">
        <h1>Anmelden</h1>
        <p class="muted">Melde dich mit deiner schulischen E-Mail-Adresse an.</p>
        <form id="login-form" class="form" novalidate>
          <label class="field"><span>Schulische E-Mail-Adresse</span>
            <input type="email" name="email" autocomplete="username" required></label>
          <label class="field"><span>Passwort</span>
            <input type="password" name="password" autocomplete="current-password" required></label>
          <p class="form-error" hidden></p>
          <button type="submit" class="btn btn--primary btn--block">Anmelden</button>
        </form>
        <div class="auth-links">
          <a href="#/passwort-vergessen">Passwort vergessen?</a>
          <a href="#/code-login">Ich habe einen Einmal-Code</a>
        </div>
      </div>
      <div class="card card--soft">
        <h2>Noch kein Konto?</h2>
        <p>Registriere dich einmalig, um deine Praktikumsdaten einzutragen.</p>
        <a class="btn btn--block" href="#/registrieren">Jetzt registrieren</a>
      </div>
    </section>`);
  const form = $('#login-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const v = formValues(form);
      const res = await rpc('student_login', { p_email: v.email, p_password: v.password });
      store.set(KEYS.student, res.token);
      go('#/');
    });
  });
}

function renderRegister(main) {
  render(main, html`
    <section class="narrow">
      <div class="card">
        <h1>Registrieren</h1>
        <p class="muted">Lege dein Konto für das Praktikumsportal an.</p>
        <form id="register-form" class="form" novalidate>
          <div class="grid-2">
            <label class="field"><span>Vorname</span>
              <input name="first_name" autocomplete="given-name" required maxlength="80"></label>
            <label class="field"><span>Nachname</span>
              <input name="last_name" autocomplete="family-name" required maxlength="80"></label>
          </div>
          <label class="field"><span>Schulische E-Mail-Adresse</span>
            <input type="email" name="email" autocomplete="email" required maxlength="200"></label>
          <label class="field"><span>Passwort <small>(mindestens 8 Zeichen)</small></span>
            <input type="password" name="password" autocomplete="new-password" required minlength="8" maxlength="72"></label>
          <label class="field"><span>Passwort wiederholen</span>
            <input type="password" name="password2" autocomplete="new-password" required></label>
          <p class="hint">Dein Passwort wird nur verschlüsselt (als nicht umkehrbarer Hash) gespeichert. Auch deine Lehrkraft kann es nicht sehen.</p>
          <p class="form-error" hidden></p>
          <button type="submit" class="btn btn--primary btn--block">Konto anlegen</button>
        </form>
        <div class="auth-links"><a href="#/">Ich habe schon ein Konto</a></div>
      </div>
    </section>`);
  const form = $('#register-form');
  bindPasswordConfirm(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const v = formValues(form);
      const res = await rpc('student_register', {
        p_site_password: store.get(KEYS.site), p_first_name: v.first_name, p_last_name: v.last_name,
        p_email: v.email, p_password: v.password,
      });
      store.set(KEYS.student, res.token);
      toast('Dein Konto wurde angelegt.');
      go('#/');
    });
  });
}

function renderForgot(main) {
  render(main, html`
    <section class="narrow">
      <div class="card" id="forgot-card">
        <h1>Passwort vergessen</h1>
        <p>Deine Lehrkraft erhält eine Anfrage und kann dir einen <strong>Einmal-Code</strong> erzeugen.
          Mit diesem Code kannst du dich einmalig anmelden (bis zu zwei Stunden nach dem Erzeugen) und legst dabei ein neues Passwort fest.</p>
        <form id="forgot-form" class="form" novalidate>
          <label class="field"><span>Schulische E-Mail-Adresse</span>
            <input type="email" name="email" autocomplete="username" required></label>
          <label class="field"><span>Klassencode <small>(nur nötig, falls du noch keiner Klasse beigetreten bist)</small></span>
            <input name="code" autocomplete="off" class="input-code" maxlength="10"></label>
          <p class="form-error" hidden></p>
          <button type="submit" class="btn btn--primary btn--block">Anfrage an meine Lehrkraft senden</button>
        </form>
        <div class="auth-links"><a href="#/">Zurück zur Anmeldung</a><a href="#/code-login">Ich habe schon einen Einmal-Code</a></div>
      </div>
    </section>`);
  const form = $('#forgot-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const v = formValues(form);
      if (!v.email.trim()) throw new Error('Bitte gib deine E-Mail-Adresse an.');
      await rpc('student_request_reset', { p_site_password: store.get(KEYS.site), p_email: v.email, p_class_code: v.code });
      render($('#forgot-card'), html`
        <h1>Anfrage gesendet</h1>
        <div class="notice notice--ok">
          <p>Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde deine Anfrage an deine Lehrkraft weitergeleitet.</p>
        </div>
        <p>Sobald deine Lehrkraft dir einen Einmal-Code gibt, kannst du dich damit anmelden.
          Der Code ist nach dem Erzeugen <strong>zwei Stunden</strong> gültig und funktioniert nur <strong>einmal</strong>.</p>
        <a class="btn btn--primary btn--block" href="#/code-login">Mit Einmal-Code anmelden</a>`);
    });
  });
}

function renderCodeLogin(main) {
  render(main, html`
    <section class="narrow">
      <div class="card">
        <h1>Mit Einmal-Code anmelden</h1>
        <p class="muted">Den Code hat dir deine Lehrkraft gegeben. Danach legst du sofort ein neues Passwort fest.</p>
        <form id="code-form" class="form" novalidate>
          <label class="field"><span>Schulische E-Mail-Adresse</span>
            <input type="email" name="email" autocomplete="username" required></label>
          <label class="field"><span>Einmal-Code</span>
            <input name="code" autocomplete="one-time-code" class="input-code" required maxlength="12" placeholder="XXXX-XXXX"></label>
          <p class="form-error" hidden></p>
          <button type="submit" class="btn btn--primary btn--block">Anmelden</button>
        </form>
        <div class="auth-links"><a href="#/">Zurück zur Anmeldung</a></div>
      </div>
    </section>`);
  const form = $('#code-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const v = formValues(form);
      const res = await rpc('student_login_with_code', { p_email: v.email, p_code: v.code });
      store.set(KEYS.student, res.token);
      go('#/');
    });
  });
}

function renderSetNewPassword(main, state) {
  render(main, html`
    <section class="narrow">
      <div class="card">
        <h1>Neues Passwort festlegen</h1>
        <p>Hallo ${state.student.first_name}, du hast dich mit einem Einmal-Code angemeldet. Bitte lege jetzt ein neues Passwort fest.</p>
        <form id="newpw-form" class="form" novalidate>
          <label class="field"><span>Neues Passwort <small>(mindestens 8 Zeichen)</small></span>
            <input type="password" name="password" autocomplete="new-password" required minlength="8" maxlength="72"></label>
          <label class="field"><span>Neues Passwort wiederholen</span>
            <input type="password" name="password2" autocomplete="new-password" required></label>
          <p class="form-error" hidden></p>
          <button type="submit" class="btn btn--primary btn--block">Passwort speichern</button>
        </form>
      </div>
    </section>`);
  const form = $('#newpw-form');
  bindPasswordConfirm(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const v = formValues(form);
      const res = await rpc('student_set_new_password', { p_token: token(), p_new_password: v.password });
      store.set(KEYS.student, res.token);
      toast('Dein neues Passwort ist gespeichert.');
      go('#/');
    });
  });
}

function renderAccount(main, state) {
  render(main, html`
    <section class="narrow">
      <p class="breadcrumb"><a href="#/">← Zum Praktikums-Dashboard</a></p>
      <div class="card">
        <h1>Mein Konto</h1>
        <dl class="data-list">
          <dt>Name</dt><dd>${state.student.first_name} ${state.student.last_name}</dd>
          <dt>E-Mail</dt><dd>${state.student.email}</dd>
          <dt>Klasse</dt><dd>${state.class.name} (${gradeLabel(state.class.grade)})</dd>
        </dl>
      </div>
      <div class="card">
        <h2>Passwort ändern</h2>
        <form id="pw-form" class="form" novalidate>
          <label class="field"><span>Bisheriges Passwort</span>
            <input type="password" name="old" autocomplete="current-password" required></label>
          <label class="field"><span>Neues Passwort <small>(mindestens 8 Zeichen)</small></span>
            <input type="password" name="password" autocomplete="new-password" required minlength="8" maxlength="72"></label>
          <label class="field"><span>Neues Passwort wiederholen</span>
            <input type="password" name="password2" autocomplete="new-password" required></label>
          <p class="form-error" hidden></p>
          <button type="submit" class="btn btn--primary">Passwort ändern</button>
        </form>
      </div>
    </section>`);
  const form = $('#pw-form');
  bindPasswordConfirm(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const v = formValues(form);
      await rpc('student_change_password', { p_token: token(), p_old_password: v.old, p_new_password: v.password });
      form.reset();
      toast('Dein Passwort wurde geändert.');
    });
  });
}

// ---------------------------------------------------------------------
//  Klasse beitreten
// ---------------------------------------------------------------------
function renderJoin(main, state) {
  render(main, html`
    <section class="narrow">
      <div class="card">
        <p class="eyebrow">Willkommen, ${state.student.first_name}!</p>
        <h1>Deiner Klasse beitreten</h1>
        <p>Gib den Code ein, den du von deiner Lehrkraft für Politik und Wirtschaft bekommen hast.
          Danach wirst du deinem Kurs zugeordnet.</p>
        <form id="join-form" class="form" novalidate>
          <label class="field"><span>Klassencode</span>
            <input name="code" class="input-code input-code--large" autocomplete="off" required maxlength="10" placeholder="z. B. K7M2PX" autofocus></label>
          <p class="form-error" hidden></p>
          <button type="submit" class="btn btn--primary btn--block">Beitreten</button>
        </form>
      </div>
    </section>`);
  const form = $('#join-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const v = formValues(form);
      if (!v.code.trim()) throw new Error('Bitte gib den Code ein.');
      const res = await rpc('student_join_class', { p_token: token(), p_code: v.code });
      toast(`Du bist jetzt der Klasse ${res.class.name} zugeordnet.`);
      go('#/steckbrief?start=1');
    });
  });
}

// ---------------------------------------------------------------------
//  Betriebssteckbrief + Unterkunft
// ---------------------------------------------------------------------
function stepper(step) {
  return html`<ol class="stepper" aria-label="Fortschritt">
    <li class="${step === 1 ? 'is-current' : 'is-done'}">Betriebssteckbrief &amp; Unterkunft</li>
    <li class="${step === 2 ? 'is-current' : ''}">Klassenteam</li>
  </ol>`;
}

function renderSteckbrief(main, state, query) {
  const s = state.student;
  const onboarding = query.get('start') === '1';
  const v = (k) => s[k] ?? '';
  const km = s.distance_km === null || s.distance_km === undefined ? '' : String(s.distance_km).replace('.', ',');
  render(main, html`
    <section class="narrow narrow--wide">
      ${onboarding ? stepper(1) : html`<p class="breadcrumb"><a href="#/">← Zum Praktikums-Dashboard</a></p>`}
      <form id="steckbrief-form" class="form" novalidate>
        <div class="card">
          <h1>Betriebssteckbrief</h1>
          <p class="muted">Trage die Angaben zu deinem Praktikum ein. Du kannst auch erst einen Teil ausfüllen und den Rest später ergänzen.
            Gemeint ist immer der <strong>Standort, an dem du dein Praktikum machst</strong>.</p>
          <label class="field"><span>Name des Praktikumsbetriebs</span>
            <input name="company_name" value="${v('company_name')}" maxlength="200" autocomplete="organization"></label>
          <label class="field"><span>Straße und Hausnummer des Praktikumsbetriebs</span>
            <input name="company_street" value="${v('company_street')}" maxlength="200" autocomplete="off"></label>
          <div class="grid-zip">
            <label class="field"><span>Postleitzahl</span>
              <input name="company_zip" value="${v('company_zip')}" maxlength="10" inputmode="numeric" autocomplete="off"></label>
            <label class="field"><span>Ort</span>
              <input name="company_city" value="${v('company_city')}" maxlength="120" autocomplete="off"></label>
          </div>
          <label class="field"><span>Entfernung in Kilometern mit dem Auto zwischen der Georg-Christoph-Lichtenberg-Schule Kassel und dem Praktikumsbetrieb</span>
            <input name="distance_km" value="${km}" inputmode="decimal" maxlength="8" placeholder="z. B. 12,5" class="input-short">
            <small class="hint">Tipp: Mit einem Routenplaner (Start: Georg-Christoph-Lichtenberg-Schule, Kassel) ermitteln.</small></label>
          <label class="field"><span>Praktikumsberuf</span>
            <input name="job_title" value="${v('job_title')}" maxlength="150"></label>
          <label class="field"><span>Zuständige Betreuungsperson im Praktikumsbetrieb</span>
            <input name="supervisor_name" value="${v('supervisor_name')}" maxlength="150"></label>
          <div class="grid-2">
            <label class="field"><span>E-Mail-Adresse der Betreuungsperson</span>
              <input type="email" name="supervisor_email" value="${v('supervisor_email')}" maxlength="200"></label>
            <label class="field"><span>Telefonnummer der Betreuungsperson</span>
              <input type="tel" name="supervisor_phone" value="${v('supervisor_phone')}" maxlength="60"></label>
          </div>
        </div>

        <div class="card" id="unterkunft">
          <h2>Unterkunft während des Praktikums</h2>
          <fieldset class="field">
            <legend>Wirst du wegen des Praktikums woanders als an deiner eigenen Adresse wohnen?</legend>
            <div class="choice-row">
              <label class="choice"><input type="radio" name="lodging_away" value="true" ${raw(s.lodging_away === true ? 'checked' : '')}> Ja</label>
              <label class="choice"><input type="radio" name="lodging_away" value="false" ${raw(s.lodging_away === false ? 'checked' : '')}> Nein</label>
            </div>
          </fieldset>
          <div id="lodging-fields" class="reveal" ${raw(s.lodging_away === true ? '' : 'hidden')}>
            <label class="field"><span>Wie heißt die Person, bei der du wohnen wirst?</span>
              <input name="lodging_name" value="${v('lodging_name')}" maxlength="150"></label>
            <label class="field"><span>In welchem Verhältnis stehst du zu dieser Person (bspw. Oma, Tante …)?</span>
              <input name="lodging_relation" value="${v('lodging_relation')}" maxlength="150"></label>
            <label class="field"><span>Unter welchen Kontaktmöglichkeiten ist diese Person im Notfall für deine Lehrkraft erreichbar (bspw. Telefonnummer oder E-Mail-Adresse)?</span>
              <textarea name="lodging_contact" rows="2" maxlength="300">${v('lodging_contact')}</textarea></label>
          </div>
        </div>

        <p class="form-error" hidden></p>
        <div class="form-actions">
          <button type="submit" class="btn btn--primary">${onboarding ? 'Speichern und weiter' : 'Speichern'}</button>
          <a class="btn btn--ghost" href="${onboarding ? '#/klassenteam?start=1' : '#/'}">${onboarding ? 'Später ausfüllen' : 'Abbrechen'}</a>
        </div>
      </form>
    </section>`);

  const form = $('#steckbrief-form');
  const lodgingBox = $('#lodging-fields');
  $$('input[name=lodging_away]', form).forEach((r) => r.addEventListener('change', () => {
    lodgingBox.hidden = formValues(form).lodging_away !== 'true';
  }));
  if (query.get('fokus') === 'unterkunft') {
    requestAnimationFrame(() => document.getElementById('unterkunft').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const val = formValues(form);
      const data = {};
      for (const f of STECKBRIEF_FIELDS) data[f.key] = val[f.key] ?? '';
      data.lodging_away = val.lodging_away ?? null;
      if (val.lodging_away === 'true') {
        data.lodging_name = val.lodging_name;
        data.lodging_relation = val.lodging_relation;
        data.lodging_contact = val.lodging_contact;
      }
      await rpc('student_save_profile', { p_token: token(), p_data: data });
      toast('Deine Angaben wurden gespeichert.');
      go(onboarding ? '#/klassenteam?start=1' : '#/');
    });
  });
}

// ---------------------------------------------------------------------
//  Klassenteam
// ---------------------------------------------------------------------
function renderKlassenteam(main, state, query) {
  const onboarding = query.get('start') === '1';
  render(main, html`
    <section class="narrow">
      ${onboarding ? stepper(2) : html`<p class="breadcrumb"><a href="#/">← Zum Praktikums-Dashboard</a></p>`}
      <form id="team-form" class="card form" novalidate>
        <h1>Klassenteam</h1>
        <p>Liste bitte die <strong>Kürzel aller Lehrkräfte</strong> auf, die dich unterrichten.
          Trenne die Kürzel durch Kommas oder Leerzeichen.</p>
        <label class="field"><span>Kürzel deiner Lehrkräfte</span>
          <textarea name="class_team" rows="4" maxlength="1000" placeholder="z. B. FEI, MÜL, SCH, KRA">${state.student.class_team ?? ''}</textarea></label>
        <div class="chip-preview" id="kuerzel-preview" aria-live="polite"></div>
        <p class="form-error" hidden></p>
        <div class="form-actions">
          <button type="submit" class="btn btn--primary">${onboarding ? 'Speichern und zum Dashboard' : 'Speichern'}</button>
          <a class="btn btn--ghost" href="#/">${onboarding ? 'Später ausfüllen' : 'Abbrechen'}</a>
        </div>
      </form>
    </section>`);
  const form = $('#team-form');
  const area = form.querySelector('textarea');
  const preview = () => {
    const items = parseKuerzel(area.value);
    render($('#kuerzel-preview'), items.length
      ? html`<span class="muted small">Erkannt (${items.length}):</span> ${items.map((k) => html`<span class="chip">${k.original}</span>`)}`
      : '');
  };
  area.addEventListener('input', preview);
  preview();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(form, async () => {
      await rpc('student_save_profile', { p_token: token(), p_data: { class_team: area.value } });
      toast('Dein Klassenteam wurde gespeichert.');
      go('#/');
    });
  });
}

// ---------------------------------------------------------------------
//  Praktikums-Dashboard
// ---------------------------------------------------------------------
function show(v) {
  return v === null || v === undefined || String(v).trim() === '' ? html`<span class="missing">fehlt noch</span>` : v;
}

function missingNotice(groups) {
  if (!groups.length) return '';
  return html`
    <div class="notice notice--danger" role="alert">
      <h2>Es fehlen noch Angaben, die du eintragen solltest</h2>
      <ul>
        ${groups.map((g) => html`<li><strong>${g.section}:</strong> ${g.fields.join(', ')}
          – <a href="${g.link}">jetzt eintragen</a></li>`)}
      </ul>
    </div>`;
}

export function calendarSheet(appt, { kindLabel, teacherName, withIcsButton = false } = {}) {
  const start = new Date(appt.start);
  const end = appointmentEnd(appt);
  const isUrl = appt.location && /^https?:\/\//i.test(appt.location.trim());
  return html`
    <div class="cal-sheet">
      <div class="cal-sheet__top">
        <span class="cal-sheet__ring"></span><span class="cal-sheet__ring"></span>
        <span class="cal-sheet__month">${fmt.monthYear(start)}</span>
      </div>
      <div class="cal-sheet__main">
        <div class="cal-sheet__weekday">${fmt.weekday(start)}</div>
        <div class="cal-sheet__day">${start.getDate()}</div>
        <div class="cal-sheet__time">${fmt.time(start)} – ${fmt.time(end)} Uhr</div>
      </div>
      <dl class="cal-sheet__details">
        <dt>Format</dt><dd>${kindLabel}</dd>
        ${teacherName ? html`<dt>Lehrkraft</dt><dd>${teacherName}</dd>` : ''}
        ${appt.location ? html`<dt>${isUrl ? 'Link' : 'Ort'}</dt><dd>${richText(appt.location)}</dd>` : ''}
        ${appt.note ? html`<dt>Hinweis</dt><dd>${richText(appt.note)}</dd>` : ''}
      </dl>
      ${withIcsButton ? html`<div class="cal-sheet__actions"><button type="button" class="btn btn--small" id="appt-ics">In meinen Kalender übernehmen (.ics)</button></div>` : ''}
    </div>`;
}

function mobileBlock(s) {
  return html`
    <form id="mobile-form" class="mobile-form" novalidate>
      <p class="text-danger">${TEXTS.mobileHint}</p>
      <div class="inline-form">
        <label class="field field--grow"><span class="sr-only">Private Handynummer</span>
          <input type="tel" name="mobile_phone" value="${s.mobile_phone ?? ''}" maxlength="40" placeholder="Private Handynummer (freiwillig)" autocomplete="tel"></label>
        <button type="submit" class="btn">Speichern</button>
      </div>
      <p class="form-error" hidden></p>
    </form>`;
}

function visitCard(state) {
  const v = state.visit || { kind: 'none' };
  const s = state.student;
  let body;
  if (v.kind === 'me') {
    body = html`
      <p class="visit-format"><span class="badge badge--accent">Praktikumsbesuch in Präsenz</span> durch <strong>${v.teacher_name}</strong></p>
      <div class="message-box">${richText(v.message || TEXTS.infoDefault)}</div>
      ${v.appointment ? calendarSheet(v.appointment, { kindLabel: 'Praktikumsbesuch in Präsenz', teacherName: v.teacher_name, withIcsButton: true }) : ''}
      ${mobileBlock(s)}`;
  } else if (v.kind === 'video') {
    body = html`
      <p class="visit-format"><span class="badge badge--accent">Praktikumsgespräch per Videocall</span></p>
      <p>Du wirst während deines Praktikums durch einen <strong>Videocall</strong> betreut.
        Zuständig ist deine Lehrkraft <strong>${v.teacher_name}</strong>.</p>
      <div class="message-box">${richText(v.message || TEXTS.infoDefault)}</div>
      ${v.appointment ? calendarSheet(v.appointment, { kindLabel: 'Praktikumsgespräch per Videocall', teacherName: v.teacher_name, withIcsButton: true }) : ''}`;
  } else if (v.kind === 'other') {
    body = v.teacher_name
      ? html`
        <p class="visit-format"><span class="badge badge--accent">Praktikumsbesuch in Präsenz</span> durch <strong>${v.teacher_name}</strong></p>
        <div class="task-box">
          <h3>Deine Aufgabe</h3>
          <p>Melde dich bitte per <strong>E-Mail bei ${v.teacher_name}</strong>. Diese Lehrkraft wurde dir für deinen
            Praktikumsbesuch zugeteilt. So könnt ihr einen möglichen Besuchstermin absprechen.</p>
        </div>
        ${mobileBlock(s)}`
      : html`
        <p class="visit-format"><span class="badge badge--accent">Praktikumsbesuch in Präsenz</span></p>
        <p>Bisher steht nur das Format <strong>„Praktikumsbesuch in Präsenz“</strong> fest.
          Die besuchende Lehrkraft steht noch nicht fest. Schaue bald wieder hier vorbei.</p>
        ${mobileBlock(s)}`;
  } else {
    body = html`<p>${TEXTS.visitInitial}</p>`;
  }
  return html`
    <section class="card card--wide card--visit" id="praktikumsbesuch">
      <h2>Praktikumsbesuch / Praktikumsgespräch</h2>
      ${body}
    </section>`;
}

function renderDashboard(main, state) {
  const s = state.student;
  const groups = missingData(s);
  const t = state.teacher || {};
  render(main, html`
    <section class="dashboard">
      <header class="page-head">
        <div>
          <p class="eyebrow">Klasse ${state.class.name} · ${gradeLabel(state.class.grade)}</p>
          <h1>Praktikums-Dashboard</h1>
        </div>
      </header>

      ${missingNotice(groups)}

      <div class="dash-grid">
        <section class="card">
          <div class="card-head"><h2>Betriebssteckbrief</h2><a class="btn btn--small btn--ghost" href="#/steckbrief">Bearbeiten</a></div>
          <dl class="data-list">
            <dt>Praktikumsbetrieb</dt><dd>${show(s.company_name)}</dd>
            <dt>Adresse</dt><dd>${show(s.company_street)}<br>${show([s.company_zip, s.company_city].filter(Boolean).join(' ') || null)}</dd>
            <dt>Entfernung zur Schule</dt><dd>${show(fmt.km(s.distance_km) || null)}</dd>
            <dt>Praktikumsberuf</dt><dd>${show(s.job_title)}</dd>
            <dt>Betreuungsperson</dt><dd>${show(s.supervisor_name)}</dd>
            <dt>E-Mail</dt><dd>${show(s.supervisor_email)}</dd>
            <dt>Telefon</dt><dd>${show(s.supervisor_phone)}</dd>
          </dl>
        </section>

        ${s.lodging_away ? html`
        <section class="card">
          <div class="card-head"><h2>Unterkunft während des Praktikums</h2><a class="btn btn--small btn--ghost" href="#/steckbrief?fokus=unterkunft">Bearbeiten</a></div>
          <dl class="data-list">
            <dt>Ich wohne bei</dt><dd>${show(s.lodging_name)}</dd>
            <dt>Verhältnis</dt><dd>${show(s.lodging_relation)}</dd>
            <dt>Erreichbar im Notfall</dt><dd>${show(s.lodging_contact)}</dd>
          </dl>
        </section>` : ''}

        <section class="card">
          <div class="card-head"><h2>Klassenteam</h2><a class="btn btn--small btn--ghost" href="#/klassenteam">Bearbeiten</a></div>
          ${s.class_team
            ? html`<div class="chip-preview">${parseKuerzel(s.class_team).map((k) => html`<span class="chip">${k.original}</span>`)}</div>`
            : html`<p><span class="missing">fehlt noch</span></p>`}
        </section>
      </div>

      ${visitCard(state)}

      <div class="dash-grid">
        <section class="card card--sick">
          <h2>Verfahren bei Krankheit</h2>
          <p>${TEXTS.sickness}</p>
        </section>
        <section class="card card--emergency">
          <h2>Kontaktinformationen für Notfälle</h2>
          <dl class="data-list">
            <dt>Name</dt><dd>${t.contact_name || '–'}</dd>
            <dt>E-Mail</dt><dd>${t.contact_email ? html`<a href="mailto:${t.contact_email}">${t.contact_email}</a>` : '–'}</dd>
            ${t.contact_phone ? html`<dt>Telefon</dt><dd><a href="tel:${t.contact_phone.replace(/[^\d+]/g, '')}">${t.contact_phone}</a></dd>` : ''}
          </dl>
        </section>
      </div>
    </section>`);

  const mobileForm = $('#mobile-form');
  if (mobileForm) {
    mobileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitting(mobileForm, async () => {
        await rpc('student_save_profile', { p_token: token(), p_data: { mobile_phone: formValues(mobileForm).mobile_phone } });
        toast('Deine Handynummer wurde gespeichert.');
      });
    });
  }
  const icsBtn = $('#appt-ics');
  if (icsBtn && state.visit && state.visit.appointment) {
    icsBtn.addEventListener('click', () => busy(icsBtn, async () => {
      const ev = studentEvent(s.id, state.visit.appointment, state.visit.kind, state.visit.teacher_name);
      download('Praktikumstermin.ics', buildIcs([ev], 'Praktikum'), 'text/calendar;charset=utf-8');
    }));
  }
}
