// Schüleransicht: Registrierung, Anmeldung, Klasse beitreten, Betriebssteckbrief,
// Klassenteam und Praktikums-Dashboard
import { rpc, store, KEYS } from './api.js';
import {
  html, raw, render, $, $$, submitting, formValues, toast, go, download, richText, fmt, setHeader, busy,
  band, etikett, navToken, isStale,
} from './ui.js';
import {
  TEXTS, STECKBRIEF_FIELDS, LODGING_FIELDS, missingData, parseKuerzel, gradeLabel, appointmentEnd, coverHex,
} from './common.js';
import { icon } from './icons.js';
import { buildIcs, studentEvent } from './ics.js';

const token = () => store.get(KEYS.student);

function accountActions() {
  return html`<a class="btn btn--band btn--small" href="#/konto">${icon('user', { size: 16 })}<span>Konto</span></a>
    <button type="button" class="btn btn--band btn--small" id="student-logout">${icon('logout', { size: 16 })}<span>Abmelden</span></button>`;
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

// Seite mit Band und einem Formular-Blatt, das in das Band hineinragt
const authPage = (title, sub, body) => html`
  ${band({ title, sub, lift: true })}
  <div class="wrap page-body page-body--lift"><div class="narrow">${body}</div></div>`;

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
  const tok = navToken();
  const state = await rpc('student_get_state', { p_token: token() });
  if (isStale(tok)) return;
  if (state.must_change_password) {
    setHeader({ area: 'Schüleransicht', user: state.student.first_name });
    return renderSetNewPassword(main, state);
  }
  setHeader({
    area: 'Schüleransicht',
    user: `${state.student.first_name} ${state.student.last_name}`,
    actions: accountActions(),
    cover: state.class ? coverHex(state.class) : undefined,
  });
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
  render(main, authPage('Anmelden', 'Mit deiner schulischen E-Mail-Adresse und deinem Passwort.', html`
    <form id="login-form" class="sheet form" novalidate>
      <label class="field"><span>Schulische E-Mail-Adresse</span>
        <input type="email" name="email" autocomplete="username" required></label>
      <label class="field"><span>Passwort</span>
        <input type="password" name="password" autocomplete="current-password" required></label>
      <p class="form-error" hidden></p>
      <button type="submit" class="btn btn--primary btn--block">Anmelden</button>
      <div class="auth-links">
        <a href="#/passwort-vergessen">Passwort vergessen?</a>
        <a href="#/code-login">Ich habe einen Einmal-Code</a>
      </div>
    </form>
    <div class="sheet sheet--quiet">
      <h2 class="sheet__title">Noch kein Konto?</h2>
      <p>Registriere dich einmalig, um deine Praktikumsdaten einzutragen.</p>
      <a class="btn btn--block" href="#/registrieren">Jetzt registrieren ${icon('arrowRight')}</a>
    </div>`));
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
  render(main, authPage('Registrieren', 'Lege dein Konto für das Praktikumsportal an.', html`
    <form id="register-form" class="sheet form" novalidate>
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
      <div class="auth-links"><a href="#/">Ich habe schon ein Konto</a></div>
    </form>`));
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
  render(main, authPage('Passwort vergessen', 'Deine Lehrkraft erzeugt dir einen Einmal-Code für ein neues Passwort.', html`
    <div class="sheet" id="forgot-card">
      <p>Mit dem <strong>Einmal-Code</strong> kannst du dich einmalig anmelden (bis zu zwei Stunden nach dem Erzeugen) und legst dabei ein neues Passwort fest.</p>
      <form id="forgot-form" class="form" novalidate>
        <label class="field"><span>Schulische E-Mail-Adresse</span>
          <input type="email" name="email" autocomplete="username" required></label>
        <label class="field"><span>Klassencode <small>(nur nötig, falls du noch keiner Klasse beigetreten bist)</small></span>
          <input name="code" autocomplete="off" class="input-code" maxlength="10"></label>
        <p class="form-error" hidden></p>
        <button type="submit" class="btn btn--primary btn--block">Anfrage an meine Lehrkraft senden</button>
      </form>
      <div class="auth-links"><a href="#/">Zurück zur Anmeldung</a><a href="#/code-login">Ich habe schon einen Einmal-Code</a></div>
    </div>`));
  const form = $('#forgot-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const v = formValues(form);
      if (!v.email.trim()) throw new Error('Bitte gib deine E-Mail-Adresse an.');
      await rpc('student_request_reset', { p_site_password: store.get(KEYS.site), p_email: v.email, p_class_code: v.code });
      render($('#forgot-card'), html`
        <h2 class="sheet__title">Anfrage gesendet</h2>
        <div class="note note--ok">${icon('check')}<p>Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde deine Anfrage an deine Lehrkraft weitergeleitet.</p></div>
        <p>Sobald deine Lehrkraft dir einen Einmal-Code gibt, kannst du dich damit anmelden.
          Der Code ist nach dem Erzeugen <strong>zwei Stunden</strong> gültig und funktioniert nur <strong>einmal</strong>.</p>
        <a class="btn btn--primary btn--block" href="#/code-login">Mit Einmal-Code anmelden ${icon('arrowRight')}</a>`);
    });
  });
}

function renderCodeLogin(main) {
  render(main, authPage('Mit Einmal-Code anmelden', 'Den Code hat dir deine Lehrkraft gegeben. Danach legst du sofort ein neues Passwort fest.', html`
    <form id="code-form" class="sheet form" novalidate>
      <label class="field"><span>Schulische E-Mail-Adresse</span>
        <input type="email" name="email" autocomplete="username" required></label>
      <label class="field"><span>Einmal-Code</span>
        <input name="code" autocomplete="one-time-code" class="input-code input-code--large" required maxlength="12" placeholder="XXXX-XXXX"></label>
      <p class="form-error" hidden></p>
      <button type="submit" class="btn btn--primary btn--block">Anmelden</button>
      <div class="auth-links"><a href="#/">Zurück zur Anmeldung</a></div>
    </form>`));
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
  render(main, authPage('Neues Passwort festlegen', `Hallo ${state.student.first_name}, du hast dich mit einem Einmal-Code angemeldet.`, html`
    <form id="newpw-form" class="sheet form" novalidate>
      <label class="field"><span>Neues Passwort <small>(mindestens 8 Zeichen)</small></span>
        <input type="password" name="password" autocomplete="new-password" required minlength="8" maxlength="72"></label>
      <label class="field"><span>Neues Passwort wiederholen</span>
        <input type="password" name="password2" autocomplete="new-password" required></label>
      <p class="form-error" hidden></p>
      <button type="submit" class="btn btn--primary btn--block">Passwort speichern</button>
    </form>`));
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
    ${band({ crumbs: html`<a href="#/">${icon('arrowLeft', { size: 16 })} Praktikums-Dashboard</a>`, title: 'Mein Konto' })}
    <div class="wrap page-body"><div class="narrow stack-lg">
      <section class="sheet">
        <h2 class="sheet__title">Kontodaten</h2>
        <dl class="data-list">
          <dt>Name</dt><dd>${state.student.first_name} ${state.student.last_name}</dd>
          <dt>E-Mail</dt><dd>${state.student.email}</dd>
          <dt>Klasse</dt><dd>${state.class.name} (${gradeLabel(state.class.grade)})</dd>
        </dl>
      </section>
      <section class="sheet">
        <h2 class="sheet__title">Passwort ändern</h2>
        <form id="pw-form" class="form" novalidate>
          <label class="field"><span>Bisheriges Passwort</span>
            <input type="password" name="old" autocomplete="current-password" required></label>
          <label class="field"><span>Neues Passwort <small>(mindestens 8 Zeichen)</small></span>
            <input type="password" name="password" autocomplete="new-password" required minlength="8" maxlength="72"></label>
          <label class="field"><span>Neues Passwort wiederholen</span>
            <input type="password" name="password2" autocomplete="new-password" required></label>
          <p class="form-error" hidden></p>
          <div class="form-actions"><button type="submit" class="btn btn--primary">Passwort ändern</button></div>
        </form>
      </section>
    </div></div>`);
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
  render(main, authPage('Deiner Klasse beitreten', `Willkommen, ${state.student.first_name}! Gib den Code ein, den du von deiner Lehrkraft für Politik und Wirtschaft bekommen hast.`, html`
    <form id="join-form" class="sheet form" novalidate>
      <label class="field"><span>Klassencode</span>
        <input name="code" class="input-code input-code--large" autocomplete="off" required maxlength="10" placeholder="z. B. K7M2PX" autofocus></label>
      <p class="form-error" hidden></p>
      <button type="submit" class="btn btn--primary btn--block">Beitreten</button>
    </form>`));
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
  const item = (n, label) => html`<li class="${step === n ? 'is-current' : step > n ? 'is-done' : ''}">
    <span class="stepper__dot">${step > n ? icon('check', { size: 14 }) : n}</span>${label}</li>`;
  return html`<ol class="stepper" aria-label="Fortschritt">
    ${item(1, 'Betriebssteckbrief & Unterkunft')}
    ${item(2, 'Klassenteam')}
  </ol>`;
}

function renderSteckbrief(main, state, query) {
  const s = state.student;
  const onboarding = query.get('start') === '1';
  const v = (k) => s[k] ?? '';
  const km = s.distance_km === null || s.distance_km === undefined ? '' : String(s.distance_km).replace('.', ',');
  render(main, html`
    ${band({
      crumbs: onboarding ? stepper(1) : html`<a href="#/">${icon('arrowLeft', { size: 16 })} Praktikums-Dashboard</a>`,
      title: 'Betriebssteckbrief',
      sub: 'Gemeint ist immer der Standort, an dem du dein Praktikum machst. Du kannst auch erst einen Teil ausfüllen und den Rest später ergänzen.',
    })}
    <div class="wrap page-body">
      <form id="steckbrief-form" class="form narrow narrow--wide stack-lg" novalidate>
        <section class="sheet form">
          <h2 class="sheet__title">Praktikumsbetrieb</h2>
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
            <span class="input-unit"><input name="distance_km" value="${km}" inputmode="decimal" maxlength="8" placeholder="z. B. 12,5"><span aria-hidden="true">km</span></span>
            <small class="hint">Tipp: Mit einem Routenplaner ermitteln (Start: Georg-Christoph-Lichtenberg-Schule, Kassel).</small></label>
          <label class="field"><span>Praktikumsberuf</span>
            <input name="job_title" value="${v('job_title')}" maxlength="150"></label>
        </section>

        <section class="sheet form">
          <h2 class="sheet__title">Betreuung im Betrieb</h2>
          <label class="field"><span>Zuständige Betreuungsperson im Praktikumsbetrieb</span>
            <input name="supervisor_name" value="${v('supervisor_name')}" maxlength="150"></label>
          <div class="grid-2">
            <label class="field"><span>E-Mail-Adresse der Betreuungsperson</span>
              <input type="email" name="supervisor_email" value="${v('supervisor_email')}" maxlength="200"></label>
            <label class="field"><span>Telefonnummer der Betreuungsperson</span>
              <input type="tel" name="supervisor_phone" value="${v('supervisor_phone')}" maxlength="60"></label>
          </div>
        </section>

        <section class="sheet form" id="unterkunft">
          <h2 class="sheet__title">Unterkunft während des Praktikums</h2>
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
        </section>

        <p class="form-error" hidden></p>
        <div class="form-actions form-actions--sticky">
          <button type="submit" class="btn btn--primary">${onboarding ? html`Speichern und weiter ${icon('arrowRight')}` : 'Speichern'}</button>
          <a class="btn btn--ghost" href="${onboarding ? '#/klassenteam?start=1' : '#/'}">${onboarding ? 'Später ausfüllen' : 'Abbrechen'}</a>
        </div>
      </form>
    </div>`);

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
    ${band({
      crumbs: onboarding ? stepper(2) : html`<a href="#/">${icon('arrowLeft', { size: 16 })} Praktikums-Dashboard</a>`,
      title: 'Klassenteam',
      sub: 'Liste die Kürzel aller Lehrkräfte auf, die dich unterrichten.',
    })}
    <div class="wrap page-body">
      <form id="team-form" class="sheet form narrow" novalidate>
        <label class="field"><span>Kürzel deiner Lehrkräfte <small>(getrennt durch Kommas oder Leerzeichen)</small></span>
          <textarea name="class_team" rows="4" maxlength="1000" placeholder="z. B. FEI, MÜL, SCH, KRA">${state.student.class_team ?? ''}</textarea></label>
        <div class="chip-preview" id="kuerzel-preview" aria-live="polite"></div>
        <p class="form-error" hidden></p>
        <div class="form-actions">
          <button type="submit" class="btn btn--primary">${onboarding ? html`Speichern und zum Dashboard ${icon('arrowRight')}` : 'Speichern'}</button>
          <a class="btn btn--ghost" href="#/">${onboarding ? 'Später ausfüllen' : 'Abbrechen'}</a>
        </div>
      </form>
    </div>`);
  const form = $('#team-form');
  const area = form.querySelector('textarea');
  const preview = () => {
    const items = parseKuerzel(area.value);
    render($('#kuerzel-preview'), items.length
      ? html`<span class="muted small">Erkannt (${items.length}):</span> ${items.map((k) => html`<span class="chip">${k.key}</span>`)}`
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
const isEmpty = (v) => v === null || v === undefined || String(v).trim() === '';
const marginMark = () => html`<span class="margin-mark" aria-hidden="true">${icon('alert', { size: 15 })}</span>`;

/** Zeile einer Datenliste; fehlende Werte bekommen die Randmarkierung. */
function row(label, value, missing = isEmpty(value)) {
  return html`<dt class="${missing ? 'is-missing' : ''}">${missing ? marginMark() : ''}${label}</dt>
    <dd>${missing ? html`<span class="missing">fehlt noch</span>` : value}</dd>`;
}

// Merkt sich, welche Bereiche beim letzten Besuch unvollständig waren –
// so kann der rote Rand sichtbar verschwinden, sobald alles eingetragen ist.
const PREV_KEY = 'pk_missing_prev';
function readPrevMissing() {
  try { const v = sessionStorage.getItem(PREV_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
function writePrevMissing(list) {
  try { sessionStorage.setItem(PREV_KEY, JSON.stringify(list)); } catch { /* egal */ }
}

function sheetState(section, missingSections, cleared) {
  if (missingSections.has(section)) return 'sheet--page has-margin';
  if (cleared.has(section)) return 'sheet--page has-margin margin-clearing';
  return 'sheet--page';
}
const doneBadge = (section, cleared) => (cleared.has(section)
  ? html`<span class="done-badge">${icon('check', { size: 15 })} vollständig</span>` : '');

function missingNotice(groups) {
  if (!groups.length) return '';
  return html`
    <section class="sheet has-margin notice--danger" role="alert">
      <span class="margin-mark margin-mark--head" aria-hidden="true">${icon('alert', { size: 18 })}</span>
      <h2 class="sheet__title">Es fehlen noch Angaben, die du eintragen solltest</h2>
      <ul class="missing-list">
        ${groups.map((g) => html`<li><strong>${g.section}:</strong> ${g.fields.join(', ')}
          <a href="${g.link}" class="missing-list__link">jetzt eintragen ${icon('arrowRight', { size: 15 })}</a></li>`)}
      </ul>
    </section>`;
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
      ${withIcsButton ? html`<div class="cal-sheet__actions"><button type="button" class="btn btn--small" id="appt-ics">${icon('calendar', { size: 16 })} In meinen Kalender übernehmen (.ics)</button></div>` : ''}
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

function formatLine(kindIcon, label, teacherName) {
  return html`<p class="visit-format"><span class="tag tag--cover">${icon(kindIcon, { size: 16 })}${label}</span>
    ${teacherName ? html`<span>durch <strong>${teacherName}</strong></span>` : ''}</p>`;
}

function visitCard(state) {
  const v = state.visit || { kind: 'none' };
  const s = state.student;
  let info;
  let side = '';
  if (v.kind === 'me') {
    info = html`
      ${formatLine('building', 'Praktikumsbesuch in Präsenz', v.teacher_name)}
      <div class="message-box">${richText(v.message || TEXTS.infoDefault)}</div>
      ${mobileBlock(s)}`;
    if (v.appointment) side = calendarSheet(v.appointment, { kindLabel: 'Praktikumsbesuch in Präsenz', teacherName: v.teacher_name, withIcsButton: true });
  } else if (v.kind === 'video') {
    info = html`
      ${formatLine('video', 'Praktikumsgespräch per Videocall')}
      <p>Du wirst während deines Praktikums durch einen <strong>Videocall</strong> betreut.
        Zuständig ist deine Lehrkraft <strong>${v.teacher_name}</strong>.</p>
      <div class="message-box">${richText(v.message || TEXTS.infoDefault)}</div>`;
    if (v.appointment) side = calendarSheet(v.appointment, { kindLabel: 'Praktikumsgespräch per Videocall', teacherName: v.teacher_name, withIcsButton: true });
  } else if (v.kind === 'other') {
    info = v.teacher_name
      ? html`
        ${formatLine('building', 'Praktikumsbesuch in Präsenz', v.teacher_name)}
        <div class="task-box">
          <h3>Deine Aufgabe</h3>
          <p>Melde dich bitte per <strong>E-Mail bei ${v.teacher_name}</strong>. Diese Lehrkraft wurde dir für deinen
            Praktikumsbesuch zugeteilt. So könnt ihr einen möglichen Besuchstermin absprechen.</p>
        </div>
        ${mobileBlock(s)}`
      : html`
        ${formatLine('building', 'Praktikumsbesuch in Präsenz')}
        <p>Bisher steht nur das Format <strong>„Praktikumsbesuch in Präsenz“</strong> fest.
          Die besuchende Lehrkraft steht noch nicht fest. Schaue bald wieder hier vorbei.</p>
        ${mobileBlock(s)}`;
  } else {
    info = html`<p class="lead">${TEXTS.visitInitial}</p>`;
  }
  return html`
    <section class="sheet sheet--page sheet--visit" id="praktikumsbesuch">
      <h2 class="sheet__title">Praktikumsbesuch / Praktikumsgespräch</h2>
      <div class="visit ${side ? 'visit--with-sheet' : ''}">
        <div class="visit__info">${info}</div>
        ${side ? html`<div class="visit__sheet">${side}</div>` : ''}
      </div>
    </section>`;
}

function renderDashboard(main, state) {
  const s = state.student;
  const groups = missingData(s);
  const missingSections = new Set(groups.map((g) => g.section));
  const prev = readPrevMissing();
  const cleared = new Set((prev || []).filter((sec) => !missingSections.has(sec)));
  writePrevMissing([...missingSections]);
  const t = state.teacher || {};
  const lodgingMissing = new Set(LODGING_FIELDS.filter((f) => isEmpty(s[f.key])).map((f) => f.key));
  const STECK = 'Betriebssteckbrief';
  const LODGE = 'Unterkunft während des Praktikums';
  const TEAM = 'Klassenteam';

  render(main, html`
    ${band({
      title: 'Praktikums-Dashboard',
      aside: etikett([
        ['Name', `${s.first_name} ${s.last_name}`],
        ['Klasse', `${state.class.name} · ${gradeLabel(state.class.grade)}`],
        ['Fach', 'Betriebspraktikum'],
      ]),
    })}
    <div class="wrap page-body dashboard">
      ${missingNotice(groups)}

      <div class="dash-top">
        <section class="sheet ${sheetState(STECK, missingSections, cleared)}">
          <div class="sheet__head"><h2 class="sheet__title">Betriebssteckbrief</h2>${doneBadge(STECK, cleared)}
            <a class="btn btn--small btn--ghost" href="#/steckbrief">${icon('pencil', { size: 15 })}<span class="btn__label">Bearbeiten</span></a></div>
          <dl class="data-list">
            ${row('Praktikumsbetrieb', s.company_name)}
            ${row('Straße, Hausnummer', s.company_street)}
            ${row('PLZ, Ort', [s.company_zip, s.company_city].filter(Boolean).join(' '), isEmpty(s.company_zip) || isEmpty(s.company_city))}
            ${row('Entfernung zur Schule', fmt.km(s.distance_km), isEmpty(s.distance_km))}
            ${row('Praktikumsberuf', s.job_title)}
            ${row('Betreuungsperson', s.supervisor_name)}
            ${row('E-Mail', s.supervisor_email)}
            ${row('Telefon', s.supervisor_phone)}
          </dl>
        </section>

        <div class="dash-aside">
          ${s.lodging_away ? html`
          <section class="sheet ${sheetState(LODGE, missingSections, cleared)}">
            <div class="sheet__head"><h2 class="sheet__title">Unterkunft während des Praktikums</h2>${doneBadge(LODGE, cleared)}
              <a class="btn btn--small btn--ghost" href="#/steckbrief?fokus=unterkunft">${icon('pencil', { size: 15 })}<span class="btn__label">Bearbeiten</span></a></div>
            <dl class="data-list">
              ${row('Ich wohne bei', s.lodging_name, lodgingMissing.has('lodging_name'))}
              ${row('Verhältnis', s.lodging_relation, lodgingMissing.has('lodging_relation'))}
              ${row('Erreichbar im Notfall', s.lodging_contact, lodgingMissing.has('lodging_contact'))}
            </dl>
          </section>` : ''}

          <section class="sheet ${sheetState(TEAM, missingSections, cleared)}">
            <div class="sheet__head"><h2 class="sheet__title">Klassenteam</h2>${doneBadge(TEAM, cleared)}
              <a class="btn btn--small btn--ghost" href="#/klassenteam">${icon('pencil', { size: 15 })}<span class="btn__label">Bearbeiten</span></a></div>
            ${s.class_team
              ? html`<div class="chip-preview">${parseKuerzel(s.class_team).map((k) => html`<span class="chip">${k.key}</span>`)}</div>`
              : html`<p class="is-missing-line">${marginMark()}<span class="missing">fehlt noch</span></p>`}
          </section>
        </div>
      </div>

      ${visitCard(state)}

      <div class="dash-bottom">
        <section class="sheet sheet--page card--sick">
          <h2 class="sheet__title">Verfahren bei Krankheit</h2>
          <p>${TEXTS.sicknessIntro}</p>
          <ol class="steps">
            ${TEXTS.sicknessSteps.map((step, i) => html`<li>${step}${i === 0 && t.contact_email
              ? html` <a class="steps__action" href="mailto:${t.contact_email}">${icon('mail', { size: 15 })} E-Mail schreiben</a>` : ''}</li>`)}
          </ol>
        </section>
        <section class="sheet sheet--page card--emergency">
          <h2 class="sheet__title">Kontaktinformationen für Notfälle</h2>
          <dl class="data-list">
            <dt>Name</dt><dd>${t.contact_name || '–'}</dd>
            <dt>E-Mail</dt><dd>${t.contact_email ? html`<a href="mailto:${t.contact_email}">${t.contact_email}</a>` : '–'}</dd>
            ${t.contact_phone ? html`<dt>Telefon</dt><dd><a href="tel:${t.contact_phone.replace(/[^\d+]/g, '')}">${t.contact_phone}</a></dd>` : ''}
          </dl>
        </section>
      </div>
    </div>`);

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
