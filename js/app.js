// Einstiegspunkt: Seitenpasswort, Navigation (Hash-Routing), Kopf- und Fußzeile
import { CONFIG } from './config.js';
import { rpc, store, KEYS, isConfigured, setAuthLostHandler } from './api.js';
import { html, render, $, submitting, formValues, toast, setHeader } from './ui.js';
import { studentRoute } from './student.js';
import { teacherRoute } from './teacher.js';

const main = document.getElementById('app');

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { path: path || '/', query: new URLSearchParams(qs || '') };
}

const isTeacherPath = (path) => path === '/lehrkraft' || path.startsWith('/lehrkraft/');

function renderFooter(teacherArea) {
  render(document.getElementById('footer'), html`
    <div class="footer-inner">
      <span>Praktikumsportal · ${CONFIG.schoolName}</span>
      <nav aria-label="Fußzeile">
        ${teacherArea
          ? html`<a href="#/">Zur Schüleransicht</a>`
          : html`<a href="#/lehrkraft">Lehrkräfte-Ansicht</a>`}
      </nav>
    </div>`);
}

function renderSetupNotice() {
  setHeader();
  render(document.getElementById('footer'), '');
  render(main, html`
    <section class="narrow card">
      <h1>Einrichtung erforderlich</h1>
      <p>Das Portal ist noch nicht mit der Datenbank verbunden. Bitte trage in der Datei
        <code>js/config.js</code> die Projekt-URL und den öffentlichen Schlüssel des Supabase-Projekts ein.
        Die Anleitung steht in der <code>README.md</code>.</p>
    </section>`);
}

function renderGate() {
  setHeader();
  render(document.getElementById('footer'), '');
  render(main, html`
    <section class="narrow">
      <div class="card gate">
        <h1>Praktikumsportal</h1>
        <p class="muted">${CONFIG.schoolName}</p>
        <form id="gate-form" class="form" novalidate>
          <label class="field">
            <span>Passwort</span>
            <input type="password" name="password" autocomplete="current-password" required autofocus>
          </label>
          <p class="form-error" hidden></p>
          <button type="submit" class="btn btn--primary btn--block">Weiter</button>
        </form>
      </div>
    </section>`);
  const form = $('#gate-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(form, async () => {
      const { password } = formValues(form);
      const res = await rpc('check_site_password', { p_password: password });
      if (!res || !res.ok) throw new Error('Das Passwort ist nicht korrekt.');
      store.set(KEYS.site, password);
      route();
    });
  });
}

let routing = 0;
export async function route() {
  const ticket = ++routing;
  const { path, query } = parseHash();
  if (!isConfigured()) return renderSetupNotice();
  if (!store.get(KEYS.site)) return renderGate();
  const teacherArea = isTeacherPath(path);
  renderFooter(teacherArea);
  document.body.dataset.area = teacherArea ? 'teacher' : 'student';
  try {
    if (teacherArea) await teacherRoute(main, path, query);
    else await studentRoute(main, path, query);
  } catch (e) {
    if (ticket !== routing) return;
    if (e && (e.hint === 'session' || e.hint === 'site')) return; // wird vom Auth-Handler neu geladen
    render(main, html`
      <section class="narrow card">
        <h1>Da ist etwas schiefgelaufen</h1>
        <p>${e && e.message ? e.message : String(e)}</p>
        <p><button class="btn" type="button" onclick="location.reload()">Seite neu laden</button></p>
      </section>`);
  }
}

setAuthLostHandler((err) => {
  toast(err.message, 'error');
  setTimeout(route, 50);
});

let lastPath = null;
window.addEventListener('hashchange', () => {
  const { path } = parseHash();
  if (path !== lastPath) window.scrollTo(0, 0);
  lastPath = path;
  route();
});
lastPath = parseHash().path;
route();
