// Lokaler Entwicklungsserver (nur zum Testen, wird für GitHub Pages nicht benötigt).
//
// - liefert die statischen Dateien des Portals aus
// - bildet die Supabase-Schnittstelle POST /rest/v1/rpc/<funktion> nach,
//   indem die gleichnamige Funktion in einer lokalen PostgreSQL-Datenbank
//   aufgerufen wird (als Rolle "anon", genau wie bei Supabase)
//
// Start:  cd dev && npm install && DATABASE_URL=postgres://... node server.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres@localhost:5432/praktikum' });
pool.on('connect', (client) => client.query('set role anon'));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.pdf': 'application/pdf', '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

async function rpc(req, res, fn) {
  if (!/^[a-z_][a-z0-9_]*$/.test(fn)) return send(res, 404, JSON.stringify({ message: 'not found' }));
  let body = '';
  for await (const chunk of req) body += chunk;
  let params = {};
  try { params = body ? JSON.parse(body) : {}; } catch { return send(res, 400, JSON.stringify({ message: 'invalid json' })); }
  const keys = Object.keys(params);
  if (!keys.every((k) => /^[a-z_][a-z0-9_]*$/.test(k))) return send(res, 400, JSON.stringify({ message: 'bad param' }));
  const args = keys.map((k, i) => `${k} => $${i + 1}`).join(', ');
  const values = keys.map((k) => (params[k] !== null && typeof params[k] === 'object' ? JSON.stringify(params[k]) : params[k]));
  try {
    const r = await pool.query(`select public.${fn}(${args}) as r`, values);
    send(res, 200, JSON.stringify(r.rows[0].r));
  } catch (e) {
    const status = e.code === '42883' ? 404 : 400;
    send(res, status, JSON.stringify({ code: e.code, message: e.message, hint: e.hint || null, details: e.detail || null }));
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'POST' && url.pathname.startsWith('/rest/v1/rpc/')) {
    return rpc(req, res, url.pathname.slice('/rest/v1/rpc/'.length));
  }
  if (url.pathname === '/js/config.js') {
    // Lokale Konfiguration statt der echten Supabase-Zugangsdaten
    return send(res, 200, `export const CONFIG = { supabaseUrl: 'http://${req.headers.host}', supabaseKey: 'dev-key', schoolName: 'Georg-Christoph-Lichtenberg-Schule Kassel' };\n`, TYPES['.js']);
  }
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || file.includes(`${path.sep}dev${path.sep}`)) return send(res, 404, 'not found', 'text/plain');
  try {
    const data = await readFile(file);
    send(res, 200, data, TYPES[path.extname(file)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'not found', 'text/plain');
  }
}).listen(PORT, () => console.log(`Praktikumsportal (Entwicklung): http://localhost:${PORT}`));
