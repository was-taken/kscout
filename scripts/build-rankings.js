#!/usr/bin/env node
// KScout — builds the all-teams rankings for one season.
//
//   npm run rankings            current season
//   npm run rankings -- 197     a specific season id
//
// VEX Events has no single request for every team's results, so this walks every event in
// the season and applies the same formula as the website (public/rating.js). The result is
// public/rankings/<season>.json. Progress is kept in data/, so a stopped run picks up where
// it left off and later runs only fetch new or recent events.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const OUT_DIR = path.join(ROOT, 'public', 'rankings');
const RE_BASE = process.env.RE_BASE || 'https://events.vex.com/api/v2';
const PROGRAM_V5RC = 1;
const CONCURRENCY = 3;
const MAX_ATTEMPTS = 10;
const DAY = 86400000;
const RECHECK_DAYS = 14; // results can be corrected for a while after an event ends

// The website's own code, so a team gets the same rating here as on its team page.
const K = (() => {
  const source = ['data.js', 'rating.js'].map((f) => fs.readFileSync(path.join(ROOT, 'public', f), 'utf8')).join('\n');
  const context = vm.createContext({ console, fetch, setTimeout, clearTimeout });
  vm.runInContext(`${source}\n;this.K = { RATING, buildField, computeRating, bestSkillsTotal, eventFinished, assignPlaces, pool };`, context);
  return context.K;
})();

function readToken() {
  if (process.env.ROBOTEVENTS_TOKEN) return process.env.ROBOTEVENTS_TOKEN.trim();
  try {
    const m = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^\s*ROBOTEVENTS_TOKEN\s*=\s*"?([^"\r\n]+)"?\s*$/m);
    return m ? m[1].trim() : '';
  } catch { return ''; }
}
const token = readToken();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let requests = 0;

async function get(apiPath) {
  for (let attempt = 1; ; attempt++) {
    let r = null;
    try {
      requests++;
      r = await fetch(RE_BASE + apiPath, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'manual' });
    } catch (e) {
      if (attempt >= MAX_ATTEMPTS) throw new Error(`Could not reach VEX Events: ${e.message}`);
    }
    if (r) {
      if (r.status >= 300 && r.status < 400 || r.status === 401) throw new Error('VEX Events rejected the API token.');
      if (r.ok) return r.json();
      if (r.status === 404) return { data: [] };
      if (r.status !== 429 && r.status < 500) throw new Error(`VEX Events returned HTTP ${r.status} for ${apiPath}`);
      if (attempt >= MAX_ATTEMPTS) throw new Error(`VEX Events kept returning HTTP ${r.status} for ${apiPath}`);
    }
    await sleep(attempt * 3000);
  }
}

async function getAll(apiPath) {
  const sep = apiPath.includes('?') ? '&' : '?';
  let out = [];
  for (let page = 1; ; page++) {
    const j = await get(`${apiPath}${sep}per_page=250&page=${page}`);
    out = out.concat(j.data || []);
    if (page >= (j.meta?.last_page || 1)) return out;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file); // never leaves a half-written file
}

/** Everything the rating needs from one event, in a form that can be saved to disk. */
async function fetchEvent(e) {
  const skillsByTeam = new Map();
  for (const k of await getAll(`/events/${e.id}/skills`)) {
    if (!skillsByTeam.has(k.team.id)) skillsByTeam.set(k.team.id, []);
    skillsByTeam.get(k.team.id).push(k);
  }
  const divisions = [];
  if (K.eventFinished(e)) {
    for (const dv of e.divisions?.length ? e.divisions : [{ id: 1 }]) {
      const field = K.buildField(await getAll(`/events/${e.id}/divisions/${dv.id}/matches`));
      if (field.size < K.RATING.minFieldSize) continue;
      const rankings = await getAll(`/events/${e.id}/divisions/${dv.id}/rankings`);
      divisions.push({
        size: field.size,
        contribution: [...field.contribution],
        playoffs: field.playoffs ? [...field.playoffs] : null,
        ranks: rankings.map((r) => [r.team.id, r.rank, r.team.name]),
      });
    }
  }
  return {
    fetchedAt: Date.now(),
    event: { id: e.id, start: e.start, end: e.end, level: e.level, ongoing: e.ongoing },
    skills: [...skillsByTeam].map(([id, records]) => [id, K.bestSkillsTotal(records)]).filter(([, total]) => total > 0),
    divisions,
  };
}

function isSettled(cached) {
  const end = new Date(cached.event.end || cached.event.start).getTime();
  return !cached.event.ongoing && cached.fetchedAt - end >= RECHECK_DAYS * DAY;
}

function rateTeams(cache) {
  const teams = new Map();
  const teamOf = (id) => {
    if (!teams.has(id)) teams.set(id, { entries: [], best: 0, number: '' });
    return teams.get(id);
  };
  let reference = 0, eventsCounted = 0;
  for (const c of Object.values(cache)) {
    for (const [id, total] of c.skills) teamOf(id).best = Math.max(teamOf(id).best, total);
    if (K.eventFinished(c.event) && (c.event.level === 'Signature' || c.event.level === 'World')) {
      for (const [, total] of c.skills) reference = Math.max(reference, total);
    }
    const seen = new Set(); // a team's first division at an event, as on its team page
    for (const d of c.divisions) {
      const field = { size: d.size, contribution: new Map(d.contribution), playoffs: d.playoffs ? new Map(d.playoffs) : null };
      for (const [id, rank, number] of d.ranks) {
        if (seen.has(id)) continue;
        seen.add(id);
        const t = teamOf(id);
        t.number = number;
        t.entries.push({ event: c.event, rank, field });
      }
    }
    if (c.divisions.length) eventsCounted++;
  }
  const rated = [];
  for (const [id, t] of teams) {
    const r = K.computeRating(id, t.entries, { best: t.best, reference: reference || null });
    if (r) rated.push({ id, number: t.number, r });
  }
  K.assignPlaces(rated, (x) => x.r.rating);
  return { rated: rated.sort((a, b) => a.place - b.place || a.number.localeCompare(b.number, undefined, { numeric: true })), reference: reference || null, eventsCounted };
}

const share = (v) => (v == null ? null : Math.round(v * 1000) / 1000);

async function main() {
  if (!token) throw new Error('No API token. Start KScout and add one, or set ROBOTEVENTS_TOKEN.');
  const seasons = await getAll(`/seasons?program[]=${PROGRAM_V5RC}`);
  const now = Date.now();
  const season = process.argv[2]
    ? seasons.find((s) => s.id === Number(process.argv[2]))
    : seasons.slice().sort((a, b) => new Date(b.start) - new Date(a.start)).find((s) => new Date(s.start) <= now);
  if (!season) throw new Error(`Season ${process.argv[2] || ''} not found.`);
  console.log(`Season: ${season.name} (${season.id})`);

  const cacheFile = path.join(DATA_DIR, `rankings-progress-${season.id}.json`);
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch {}

  const events = (await getAll(`/events?season[]=${season.id}`)).filter((e) => new Date(e.start).getTime() <= now);
  const todo = events.filter((e) => !(cache[e.id] && isSettled(cache[e.id])));
  console.log(`${events.length} events have started; ${todo.length} to fetch.`);

  let done = 0;
  const started = Date.now();
  try {
    await K.pool(todo, CONCURRENCY, async (e) => {
      cache[e.id] = await fetchEvent(e);
      if (++done % 25 === 0) {
        writeJson(cacheFile, cache);
        const left = ((Date.now() - started) / done) * (todo.length - done);
        console.log(`${done} of ${todo.length} events · ${requests} requests · about ${Math.ceil(left / 60000)} min left`);
      }
    });
  } finally {
    writeJson(cacheFile, cache);
  }

  const { rated, reference, eventsCounted } = rateTeams(cache);
  console.log(`Rated ${rated.length} teams from ${eventsCounted} events. Looking up team details…`);

  const info = new Map();
  const chunks = [];
  for (let i = 0; i < rated.length; i += 200) chunks.push(rated.slice(i, i + 200).map((x) => x.id));
  await K.pool(chunks, CONCURRENCY, async (ids) => {
    for (const t of await getAll(`/teams?${ids.map((id) => `id[]=${id}`).join('&')}`)) info.set(t.id, t);
  });

  const outFile = path.join(OUT_DIR, `${season.id}.json`);
  writeJson(outFile, {
    season: { id: season.id, name: season.name },
    generatedAt: new Date().toISOString(),
    eventsCounted,
    skillsReference: reference,
    teams: rated.map(({ id, number, place, r }) => {
      const t = info.get(id);
      return {
        id, number, place,
        name: t?.team_name || '',
        grade: t?.grade || '',
        region: t?.location?.region || '',
        country: t?.location?.country || '',
        rating: r.rating,
        confidence: r.confidence,
        events: r.events.length,
        skills: share(r.skillsPart),
        contribution: share(r.breakdown.contribution),
        qualifying: share(r.breakdown.qualifying),
        playoffs: share(r.breakdown.playoffs),
      };
    }),
  });
  console.log(`Done: ${path.relative(ROOT, outFile)} · ${requests} requests in ${Math.ceil((Date.now() - started) / 60000)} min`);
}

main().catch((e) => { console.error(`Failed: ${e.message}\nRun it again to continue from where it stopped.`); process.exit(1); });
