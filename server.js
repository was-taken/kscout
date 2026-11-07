// KScout — tiny zero-dependency server.
// Serves the app from ./public, proxies /api/* to the VEX Events (formerly RobotEvents) v2 API
// (so the API token never reaches the browser), caches responses, and stores scouting notes.
//
// Local use:   node server.js            then open http://localhost:5173
// Hosted use:  set PUBLIC_SITE=1, ROBOTEVENTS_TOKEN and (optionally) TEAM_PASSWORD — see README.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------- configuration ----------
const env = (k, d = '') => (process.env[k] ?? d).toString().trim();
const PUBLIC_SITE = /^(1|true|yes)$/i.test(env('PUBLIC_SITE'));
const PORT = Number(env('PORT')) || 5173;
// Hosts (Render, Railway, Fly…) need the server reachable from outside the machine.
const HOST = env('HOST') || (PUBLIC_SITE ? '0.0.0.0' : '127.0.0.1');
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
// Point DATA_DIR at a persistent disk on your host so notes survive restarts.
const DATA_DIR = path.resolve(env('DATA_DIR') || path.join(ROOT, 'data'));
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');
const ENV_FILE = path.join(ROOT, '.env');
const RE_BASE = env('RE_BASE') || 'https://events.vex.com/api/v2';
const CACHE_TTL_MS = (Number(env('CACHE_MINUTES')) || (PUBLIC_SITE ? 15 : 5)) * 60 * 1000;
const CACHE_MAX_ENTRIES = 3000;
const API_REQS_PER_MIN = Number(env('API_REQS_PER_MIN')) || 600; // per visitor IP
const TEAM_PASSWORD = env('TEAM_PASSWORD');
const SESSION_DAYS = 30;

// Notes modes:
//   file    — local use: notes in data/notes.json, no sign-in (only this computer can reach the app)
//   team    — hosted with TEAM_PASSWORD: shared notes, readable/editable only after signing in
//   browser — hosted without a password: each visitor's notes stay in their own browser
const NOTES_MODE = !PUBLIC_SITE ? 'file' : TEAM_PASSWORD ? 'team' : 'browser';

// ---------- token handling ----------
const TOKEN_FROM_ENV = Boolean(env('ROBOTEVENTS_TOKEN'));
function readEnvToken() {
  if (TOKEN_FROM_ENV) return env('ROBOTEVENTS_TOKEN');
  try {
    const txt = fs.readFileSync(ENV_FILE, 'utf8');
    const m = txt.match(/^\s*ROBOTEVENTS_TOKEN\s*=\s*"?([^"\r\n]+)"?\s*$/m);
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}
let token = readEnvToken();
// The in-app token form only works for local use with no token set by the host.
const TOKEN_EDITABLE = !PUBLIC_SITE && !TOKEN_FROM_ENV;

function saveToken(t) {
  let txt = '';
  try { txt = fs.readFileSync(ENV_FILE, 'utf8'); } catch {}
  const line = `ROBOTEVENTS_TOKEN=${t}`;
  txt = /^\s*ROBOTEVENTS_TOKEN\s*=/m.test(txt)
    ? txt.replace(/^\s*ROBOTEVENTS_TOKEN\s*=.*$/m, line)
    : (txt && !txt.endsWith('\n') ? txt + '\n' : txt) + line + '\n';
  fs.writeFileSync(ENV_FILE, txt, { mode: 0o600 });
  token = t;
  cache.clear();
}

// ---------- team sign-in (signed cookie, no server-side session store) ----------
const SECRET = crypto.createHash('sha256').update('kscout:' + TEAM_PASSWORD + ':' + (token || '')).digest();
function sign(v) { return crypto.createHmac('sha256', SECRET).update(v).digest('base64url'); }
function makeSession() {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  return `${exp}.${sign(String(exp))}`;
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
function signedIn(req) {
  if (NOTES_MODE !== 'team') return false;
  const v = cookies(req).kscout_session || '';
  const [exp, sig] = v.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}
function passwordMatches(p) {
  const a = crypto.createHash('sha256').update(String(p)).digest();
  const b = crypto.createHash('sha256').update(TEAM_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
const isHttps = (req) => (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
function sessionCookie(req, value, maxAgeSec) {
  return `kscout_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${isHttps(req) ? '; Secure' : ''}`;
}

// ---------- rate limiting (fixed one-minute windows per IP) ----------
const buckets = new Map();
function clientIp(req) {
  // Behind a host's proxy the visitor's address is the first X-Forwarded-For entry.
  return (PUBLIC_SITE && (req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
}
function allow(req, kind, perMinute) {
  const key = kind + ':' + clientIp(req);
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start > 60_000) { b = { start: now, n: 0 }; buckets.set(key, b); }
  b.n++;
  return b.n <= perMinute;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now - b.start > 120_000) buckets.delete(k); }, 60_000).unref();

// ---------- cache + upstream ----------
const cache = new Map(); // url -> { at, status, body }
const inflight = new Map(); // url -> Promise, so identical concurrent requests hit VEX Events once

function cacheSet(url, entry) {
  cache.delete(url);
  cache.set(url, entry);
  while (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value); // drop oldest
}

async function fetchUpstream(url) {
  let attempt = 0;
  while (true) {
    attempt++;
    let r;
    try {
      r = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        redirect: 'manual',
      });
    } catch (e) {
      return { status: 502, body: JSON.stringify({ error: 'upstream_unreachable', detail: String(e.message || e) }) };
    }
    // Back off on rate limits a couple of times before giving up.
    if (r.status === 429 && attempt < 4) {
      const wait = Number(r.headers.get('retry-after')) * 1000 || 1500 * attempt;
      await new Promise((ok) => setTimeout(ok, wait));
      continue;
    }
    // An invalid/expired token gets redirected to the login page instead of a JSON error.
    if (r.status >= 300 && r.status < 400) return { status: 401, body: JSON.stringify({ error: 'bad_token' }) };
    const body = await r.text();
    if (r.ok) cacheSet(url, { at: Date.now(), status: r.status, body });
    return { status: r.status, body };
  }
}

async function proxy(req, upstreamPath, res) {
  if (!token) return sendJson(res, 401, { error: 'no_token' });
  if (!allow(req, 'api', API_REQS_PER_MIN)) return sendJson(res, 429, { error: 'Too many requests — slow down and try again in a minute.' });
  const url = RE_BASE + upstreamPath;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    res.writeHead(hit.status, { 'Content-Type': 'application/json', 'X-Cache': 'HIT' });
    return res.end(hit.body);
  }
  let p = inflight.get(url);
  if (!p) { p = fetchUpstream(url).finally(() => inflight.delete(url)); inflight.set(url, p); }
  const out = await p;
  res.writeHead(out.status, { 'Content-Type': 'application/json', 'X-Cache': 'MISS' });
  res.end(out.body);
}

// ---------- notes ----------
function readNotes() {
  try { return JSON.parse(fs.readFileSync(NOTES_FILE, 'utf8')); } catch { return {}; }
}
function writeNotes(obj) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = NOTES_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, NOTES_FILE); // atomic replace, so a crash mid-write can't corrupt notes
}
/** Keep only well-formed note entries so a bad request can't store junk. */
function cleanNotes(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('notes must be an object');
  const out = {};
  for (const [k, n] of Object.entries(obj)) {
    if (!/^[A-Za-z0-9]{1,12}$/.test(k) || !n || typeof n !== 'object') continue;
    out[k.toUpperCase()] = {
      starred: Boolean(n.starred),
      rating: Math.max(0, Math.min(5, Math.round(Number(n.rating) || 0))),
      tags: Array.isArray(n.tags) ? n.tags.filter((t) => typeof t === 'string').slice(0, 20).map((t) => t.slice(0, 40)) : [],
      text: typeof n.text === 'string' ? n.text.slice(0, 10000) : '',
      updated: typeof n.updated === 'string' ? n.updated.slice(0, 40) : undefined,
    };
  }
  return out;
}

// ---------- helpers ----------
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
};
function sendJson(res, status, obj, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 2e6) {
  return new Promise((ok, fail) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > limit) { fail(new Error('too large')); req.destroy(); }
    });
    req.on('end', () => ok(data));
    req.on('error', fail);
  });
}
async function readJson(req, limit) {
  try { return JSON.parse((await readBody(req, limit)) || '{}'); } catch { return null; }
}
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.json': 'application/json',
};

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  if (PUBLIC_SITE && isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  const u = new URL(req.url, 'http://localhost');
  try {
    if (u.pathname.startsWith('/api/')) {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET only' });
      return await proxy(req, u.pathname.slice(4) + u.search, res);
    }

    if (u.pathname === '/healthz') return sendJson(res, 200, { ok: true });

    if (u.pathname === '/local/status') {
      return sendJson(res, 200, {
        hasToken: Boolean(token),
        tokenEditable: TOKEN_EDITABLE,
        publicSite: PUBLIC_SITE,
        notesMode: NOTES_MODE,
        signedIn: signedIn(req),
      });
    }

    if (u.pathname === '/local/token' && req.method === 'POST') {
      if (!TOKEN_EDITABLE) return sendJson(res, 403, { error: 'The API token is set by the server and cannot be changed here.' });
      if (!allow(req, 'token', 10)) return sendJson(res, 429, { error: 'Too many attempts — wait a minute.' });
      const body = await readJson(req, 10_000);
      const t = body?.token;
      if (!t || typeof t !== 'string' || t.length < 20) return sendJson(res, 400, { error: 'invalid token' });
      // Verify before saving.
      const r = await fetch(`${RE_BASE}/programs?per_page=1`, {
        headers: { Authorization: `Bearer ${t.trim()}`, Accept: 'application/json' },
        redirect: 'manual',
      });
      const isJson = (r.headers.get('content-type') || '').includes('json');
      if (!r.ok || !isJson) return sendJson(res, 400, { error: `VEX Events rejected the token (HTTP ${r.status}). Make sure your API access request has been approved and the token was copied in full.` });
      saveToken(t.trim());
      return sendJson(res, 200, { ok: true });
    }

    if (u.pathname === '/local/login' && req.method === 'POST') {
      if (NOTES_MODE !== 'team') return sendJson(res, 404, { error: 'Team sign-in is not enabled on this site.' });
      if (!allow(req, 'login', 5)) return sendJson(res, 429, { error: 'Too many attempts — wait a minute and try again.' });
      const body = await readJson(req, 10_000);
      if (!body || typeof body.password !== 'string' || !passwordMatches(body.password)) {
        return sendJson(res, 401, { error: 'Wrong team password.' });
      }
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, makeSession(), SESSION_DAYS * 86400) });
    }

    if (u.pathname === '/local/logout' && req.method === 'POST') {
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
    }

    if (u.pathname === '/local/notes') {
      if (NOTES_MODE === 'browser') return sendJson(res, 404, { error: 'Notes are stored in your browser on this site.' });
      if (NOTES_MODE === 'team' && !signedIn(req)) return sendJson(res, 401, { error: 'Sign in with the team password to see team notes.' });
      if (req.method === 'GET') return sendJson(res, 200, readNotes());
      if (req.method === 'PUT') {
        if (!allow(req, 'notes', 120)) return sendJson(res, 429, { error: 'Saving too often — try again shortly.' });
        // Same-origin check: block other websites from writing notes with the visitor's cookie.
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) return sendJson(res, 403, { error: 'Cross-site request blocked.' });
        const body = await readJson(req);
        if (!body) return sendJson(res, 400, { error: 'Invalid JSON.' });
        try { writeNotes(cleanNotes(body)); } catch (e) { return sendJson(res, 400, { error: e.message }); }
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 405, { error: 'method not allowed' });
    }

    if (u.pathname.startsWith('/local/')) return sendJson(res, 404, { error: 'not found' });

    // static files
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'method not allowed' });
    let p;
    try { p = decodeURIComponent(u.pathname); } catch { return sendJson(res, 400, { error: 'bad path' }); }
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(PUBLIC_DIR, p));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: 'forbidden' });
    fs.readFile(file, (err, buf) => {
      if (err) {
        // SPA fallback
        return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
          if (e2) { res.writeHead(404); return res.end('Not found'); }
          res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
          res.end(html);
        });
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  } catch (e) {
    console.error(e);
    sendJson(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`KScout running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}  (${PUBLIC_SITE ? 'public site' : 'local'} mode, notes: ${NOTES_MODE})`);
  if (!token) console.log(PUBLIC_SITE ? 'WARNING: set the ROBOTEVENTS_TOKEN environment variable.' : 'No VEX Events API token yet — open the app to add one.');
  if (PUBLIC_SITE && NOTES_MODE === 'team' && TEAM_PASSWORD.length < 10) console.log('WARNING: TEAM_PASSWORD is short — use at least 10 characters.');
  if (PUBLIC_SITE && NOTES_MODE === 'team' && !env('DATA_DIR')) console.log('NOTE: DATA_DIR is not set — on most hosts, notes in ./data are lost when the app restarts.');
});
