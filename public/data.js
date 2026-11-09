/* KScout — data layer: API access, notes storage and stat calculations. */
'use strict';

let PROGRAM_V5RC = 1; // looked up from /programs at startup
const TAGS = [
  'Strong auton', 'Fast drive', 'Consistent', 'High scorer', 'Good defense',
  'Endgame', 'Reliable', 'Good driver', 'Alliance pick', 'Avoid',
];
const ROUND = { 1: 'Practice', 2: 'Qual', 3: 'QF', 4: 'SF', 5: 'Final', 6: 'R16', 7: 'R32', 8: 'R64', 9: 'R128' };

const state = {
  seasons: [], seasonId: null, notes: {}, teamCache: new Map(),
  // filled from /local/status at startup
  server: { hasToken: false, tokenEditable: true, publicSite: false, notesMode: 'file', signedIn: false },
};

// ---------------------------------------------------------------- utils
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt1 = (n) => (n == null || Number.isNaN(n) ? '—' : (Math.round(n * 10) / 10).toFixed(1));
const fmt0 = (n) => (n == null || Number.isNaN(n) ? '—' : String(Math.round(n)));
const pct = (n) => (n == null || Number.isNaN(n) ? '—' : `${Math.round(n * 100)}%`);
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const loc = (l) => [l?.city, l?.region, l?.country].filter(Boolean).join(', ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

async function api(path) {
  let r;
  // Big rankings can hit a per-minute limit. Waiting long enough lets the limit reset.
  for (let attempt = 1; ; attempt++) {
    r = await fetch('/api' + path);
    if (r.status !== 429 || attempt > 5) break;
    await sleep(attempt * 5000);
  }
  if (r.status === 401) { const b = await r.json().catch(() => ({})); throw new ApiError(401, b.error === 'no_token' ? 'no_token' : 'VEX Events rejected the API token. It may be expired or not yet approved — paste a new one below.'); }
  if (!r.ok) throw new ApiError(r.status, `VEX Events API request failed (HTTP ${r.status}) for ${path}`);
  return r.json();
}

async function apiAll(path) {
  const sep = path.includes('?') ? '&' : '?';
  let page = 1, out = [];
  while (true) {
    const j = await api(`${path}${sep}per_page=250&page=${page}`);
    out = out.concat(j.data || []);
    const last = j.meta?.last_page || 1;
    if (page >= last) break;
    page++;
  }
  return out;
}

async function pool(items, n, fn) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; results[idx] = await fn(items[idx], idx); }
  }));
  return results;
}

// ---------------------------------------------------------------- notes
// Where notes live depends on how the server runs:
//   file    -> data/notes.json on the server (local use)
//   team    -> shared on the server once signed in with the team password; in this browser until then
//   browser -> only in this browser (public site without a team password)
const LOCAL_NOTES_KEY = 'kscout_notes';
const notesOnServer = () => state.server.notesMode === 'file' || (state.server.notesMode === 'team' && state.server.signedIn);
function notesWhere() {
  if (state.server.notesMode === 'file') return 'Saved on the server in data/notes.json';
  if (notesOnServer()) return 'Shared with your team';
  return state.server.notesMode === 'team' ? 'Saved in this browser only · sign in to share with your team' : 'Saved in this browser only';
}

async function loadNotes() {
  if (notesOnServer()) {
    const r = await fetch('/local/notes');
    if (r.ok) return (state.notes = await r.json());
    if (r.status === 401) state.server.signedIn = false;
  }
  return (state.notes = ls.get(LOCAL_NOTES_KEY, {}) || {});
}

let saveTimer = null;
function flashSaved(text, bad) {
  document.querySelectorAll('.saved').forEach((el) => {
    el.textContent = text; el.style.color = bad ? 'var(--bad)' : '';
    if (!bad) setTimeout(() => (el.textContent = ''), 1500);
  });
}
function saveNotesNow() {
  if (!notesOnServer()) { ls.set(LOCAL_NOTES_KEY, state.notes); flashSaved('Saved'); return Promise.resolve(true); }
  return fetch('/local/notes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state.notes) })
    .then((r) => {
      if (r.status === 401) { state.server.signedIn = false; flashSaved('Signed out — not saved', true); return false; }
      if (!r.ok) { flashSaved('Not saved', true); return false; }
      flashSaved('Saved'); return true;
    })
    .catch(() => { flashSaved('Offline — not saved', true); return false; });
}
function note(num) { return state.notes[num] || { starred: false, rating: 0, tags: [], text: '' }; }
function setNote(num, patch) {
  state.notes[num] = { ...note(num), ...patch, updated: new Date().toISOString() };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNotesNow, 400);
}

// ---------------------------------------------------------------- data
async function findTeam(number) {
  const key = number.toUpperCase();
  if (state.teamCache.has(key)) return state.teamCache.get(key);
  const j = await api(`/teams?number[]=${encodeURIComponent(key)}&program[]=${PROGRAM_V5RC}`);
  const t = (j.data || []).find((x) => x.number.toUpperCase() === key) || j.data?.[0] || null;
  if (t) state.teamCache.set(key, t);
  return t;
}

async function loadTeamSeason(teamId, seasonId, parts = ['events', 'matches', 'rankings', 'skills', 'awards']) {
  const q = `?season[]=${seasonId}`;
  const res = await Promise.all(parts.map((p) => apiAll(`/teams/${teamId}/${p}${q}`)));
  return Object.fromEntries(parts.map((p, i) => [p, res[i]]));
}

function matchOutcome(m, teamId) {
  const mine = m.alliances.find((a) => a.teams.some((t) => t.team.id === teamId));
  if (!mine) return null;
  const opp = m.alliances.find((a) => a !== mine);
  const scored = m.scored || (mine.score || 0) + (opp?.score || 0) > 0;
  let result = 'U';
  if (scored) result = mine.score > opp.score ? 'W' : mine.score < opp.score ? 'L' : 'T';
  return { mine, opp, scored, result };
}

/** Season summary for one team from its raw season data. */
function summarize(team, d) {
  const s = { team, w: 0, l: 0, t: 0, qw: 0, ql: 0, qt: 0, ew: 0, el: 0, et: 0, played: 0, pts: 0, opp: 0, high: 0, series: [] };
  const evStart = new Map((d.events || []).map((e) => [e.id, e.start]));
  const ms = (d.matches || []).filter((m) => m.round !== 1).slice().sort((a, b) =>
    (new Date(evStart.get(a.event.id) || 0) - new Date(evStart.get(b.event.id) || 0)) ||
    (new Date(a.started || a.scheduled || 0) - new Date(b.started || b.scheduled || 0)) ||
    (a.round - b.round) || (a.matchnum - b.matchnum));
  for (const m of ms) {
    const o = matchOutcome(m, team.id);
    if (!o || !o.scored) continue;
    s.played++; s.pts += o.mine.score; s.opp += o.opp.score; s.high = Math.max(s.high, o.mine.score);
    const k = o.result.toLowerCase();
    s[k]++;
    if (m.round === 2) s['q' + k]++; else s['e' + k]++;
    s.series.push({ y: o.mine.score, opp: o.opp.score, result: o.result, label: `${m.event.name} · ${m.name}`, eventId: m.event.id, eventName: m.event.name });
  }
  // per-event average score, in the order events were played (for trend pills)
  const evAvg = new Map();
  for (const p of s.series) { const e = evAvg.get(p.eventId) || { name: p.eventName, sum: 0, n: 0 }; e.sum += p.y; e.n++; evAvg.set(p.eventId, e); }
  s.eventAvgs = [...evAvg.values()].map((e) => ({ name: e.name, avg: e.sum / e.n }));
  s.winRate = s.played ? (s.w + s.t * 0.5) / s.played : null;
  s.avg = s.played ? s.pts / s.played : null;
  s.avgOpp = s.played ? s.opp / s.played : null;
  s.margin = s.played ? (s.pts - s.opp) / s.played : null;

  // skills: best per event (driver + programming at the same event)
  const byEv = new Map();
  for (const k of d.skills || []) {
    const e = byEv.get(k.event.id) || { event: k.event, driver: 0, programming: 0 };
    if (k.type === 'driver') e.driver = Math.max(e.driver, k.score);
    if (k.type === 'programming') e.programming = Math.max(e.programming, k.score);
    byEv.set(k.event.id, e);
  }
  s.skillsByEvent = byEv;
  s.bestSkills = 0; s.bestDriver = 0; s.bestProg = 0;
  for (const e of byEv.values()) {
    s.bestSkills = Math.max(s.bestSkills, e.driver + e.programming);
    s.bestDriver = Math.max(s.bestDriver, e.driver);
    s.bestProg = Math.max(s.bestProg, e.programming);
  }

  const ranks = (d.rankings || []).map((r) => r.rank).filter(Boolean);
  s.avgRank = ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null;
  s.bestRank = ranks.length ? Math.min(...ranks) : null;
  s.awards = d.awards || [];
  const now = Date.now();
  s.eventsAttended = (d.events || []).filter((e) => new Date(e.start) <= now).length;
  s.upcoming = (d.events || []).filter((e) => new Date(e.start) > now);
  return s;
}

/** OPR / DPR / CCWM by least squares over qualification matches. */
function computeOPR(matches) {
  const qual = matches.filter((m) => m.round === 2 && m.alliances.every((a) => a.score != null) &&
    (m.scored || m.alliances.reduce((x, a) => x + (a.score || 0), 0) > 0));
  const idx = new Map();
  for (const m of qual) for (const a of m.alliances) for (const t of a.teams) if (!idx.has(t.team.id)) idx.set(t.team.id, idx.size);
  const n = idx.size;
  if (!n) return new Map();
  const M = Array.from({ length: n }, () => new Float64Array(n));
  const vo = new Float64Array(n), vd = new Float64Array(n);
  for (const m of qual) {
    for (const a of m.alliances) {
      const opp = m.alliances.find((x) => x !== a);
      const ids = a.teams.filter((t) => !t.sitting).map((t) => idx.get(t.team.id));
      for (const i of ids) { for (const j of ids) M[i][j] += 1; vo[i] += a.score; vd[i] += opp.score; }
    }
  }
  for (let i = 0; i < n; i++) M[i][i] += 1e-6;
  const solve = (A0, b0) => {
    const A = A0.map((r) => Float64Array.from(r)), b = Float64Array.from(b0);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      const d = A[c][c] || 1e-12;
      for (let r = c + 1; r < n; r++) {
        const f = A[r][c] / d; if (!f) continue;
        for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    const x = new Float64Array(n);
    for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / (A[r][r] || 1e-12); }
    return x;
  };
  const opr = solve(M, vo), dpr = solve(M, vd);
  const out = new Map();
  for (const [id, i] of idx) out.set(id, { opr: opr[i], dpr: dpr[i], ccwm: opr[i] - dpr[i] });
  return out;
}

