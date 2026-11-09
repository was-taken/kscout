/* KScout — the KScout Rating: one 0–100 number for how strong a team has been this season.
 *
 * Results: at each finished event, a team's match play is placed against the rest of its
 * division, then the events are combined with recent and larger events counting more.
 * Skills: the team's best skills score as a share of the top score at this season's
 * biggest events. Tested against 2026 Worlds, this absolute score predicted more than
 * skills placed within each event. Both parts stay comparable across games and seasons.
 * The README explains the formula in plain language.
 */
'use strict';

const RATING = {
  skillsShare: 0.4,   // the rest of the rating comes from results
  // how much each measure counts within one event
  weights: { contribution: 0.45, qualifying: 0.25, playoffs: 0.3 },
  // [lowest, highest] score an event of this level can award
  tiers: { World: [40, 100], Signature: [25, 95], National: [25, 95], Regional: [15, 90], State: [15, 90], Other: [0, 85] },
  recency: 0.85,      // each older event counts this much as the one after it
  fullFieldSize: 24,  // divisions smaller than this count proportionally less
  minFieldSize: 4,    // smaller divisions are ignored
  minQualMatches: 3,  // fewest qualification matches for a reliable contribution estimate
  priorEvents: 1,     // every team starts with this many "average" events...
  priorScore: 42.5,   // ...scored like this: the middle of an ordinary tournament
};

const RATING_LABELS = { contribution: 'Match contribution', qualifying: 'Qualifying finish', playoffs: 'Playoff run' };
const ROUND_DEPTH = { 9: 1, 8: 2, 7: 3, 6: 4, 3: 5, 4: 6, 5: 7 }; // R128 → Final; a win in the Final is one deeper

const isScoredMatch = (m) => m.alliances.every((a) => a.score != null) && (m.scored || m.alliances.reduce((x, a) => x + (a.score || 0), 0) > 0);

/** Share of the field a value beats, counting ties as half: a Map of id → 0..1. */
function percentiles(values) {
  const all = [...values.values()], out = new Map();
  for (const [id, v] of values) {
    let below = 0, tied = 0;
    for (const x of all) { if (x < v) below++; else if (x === v) tied++; }
    out.set(id, (below + tied / 2) / all.length);
  }
  return out;
}

/** How far each team went in the playoffs: a Map of team id → depth, or null if no playoffs were scored. */
function playoffDepths(matches) {
  const elim = matches.filter((m) => ROUND_DEPTH[m.round] && isScoredMatch(m));
  if (!elim.length) return null;
  const depth = new Map(), finalWins = new Map();
  for (const m of elim) {
    for (const a of m.alliances) for (const t of a.teams) depth.set(t.team.id, Math.max(depth.get(t.team.id) || 0, ROUND_DEPTH[m.round]));
    if (m.round !== 5) continue;
    const [x, y] = m.alliances;
    if (x.score === y.score) continue;
    const winner = x.score > y.score ? x : y;
    const key = winner.teams.map((t) => t.team.id).sort((p, q) => p - q).join(',');
    finalWins.set(key, (finalWins.get(key) || 0) + 1);
  }
  const best = Math.max(0, ...finalWins.values());
  const leaders = [...finalWins].filter(([, n]) => n === best);
  if (best && leaders.length === 1) for (const id of leaders[0][0].split(',')) depth.set(Number(id), ROUND_DEPTH[5] + 1);
  return depth;
}

/** Everything needed to place any team within one division at one event. */
function buildField(matches) {
  const quals = matches.filter((m) => m.round === 2 && isScoredMatch(m));
  const played = new Map();
  for (const m of quals) for (const a of m.alliances) for (const t of a.teams) if (!t.sitting) played.set(t.team.id, (played.get(t.team.id) || 0) + 1);

  const opr = computeOPR(quals);
  const ccwm = new Map();
  for (const [id, n] of played) if (n >= RATING.minQualMatches && opr.has(id)) ccwm.set(id, opr.get(id).ccwm);

  let playoffPct = null;
  const depths = playoffDepths(matches);
  if (depths) {
    const d = new Map();
    for (const id of played.keys()) d.set(id, depths.get(id) || 0);
    playoffPct = percentiles(d);
  }
  return { size: played.size, contribution: percentiles(ccwm), playoffs: playoffPct };
}

/** One event's 0..1 measures for a team, or null if the team can't be placed in it. */
function eventMeasures(teamId, rank, field) {
  if (field.size < RATING.minFieldSize) return null;
  const measures = {
    contribution: field.contribution.get(teamId) ?? null,
    qualifying: rank >= 1 ? Math.max(0, Math.min(1, (field.size - rank + 0.5) / field.size)) : null,
    playoffs: field.playoffs?.get(teamId) ?? null,
  };
  // qualification play has to be represented; a playoff run alone isn't enough
  return measures.contribution == null && measures.qualifying == null ? null : measures;
}

/** Highest driver + autonomous total the team posted at one event, from its skills records. */
function bestSkillsTotal(skills) {
  const byEvent = new Map();
  for (const k of skills || []) {
    if (k.type !== 'driver' && k.type !== 'programming') continue;
    const e = byEvent.get(k.event.id) || { driver: 0, programming: 0 };
    e[k.type] = Math.max(e[k.type], k.score || 0);
    byEvent.set(k.event.id, e);
  }
  return Math.max(0, ...[...byEvent.values()].map((e) => e.driver + e.programming));
}

/**
 * entries: [{ event, rank, field }] in any order. skills: { best, reference }, where reference
 * is null if the season has no finished major event yet (the rating is then results only).
 * Returns the rating, or null with nothing to rate.
 */
function computeRating(teamId, entries, skills = { best: 0, reference: null }) {
  const scored = [];
  const chronological = entries.slice().sort((a, b) => new Date(a.event.start) - new Date(b.event.start));
  for (const { event, rank, field } of chronological) {
    const measures = eventMeasures(teamId, rank, field);
    if (!measures) continue;
    let sum = 0, weight = 0;
    for (const [k, w] of Object.entries(RATING.weights)) if (measures[k] != null) { sum += w * measures[k]; weight += w; }
    const percentile = sum / weight;
    const [low, high] = RATING.tiers[event.level] || RATING.tiers.Other;
    scored.push({ event, measures, percentile, size: field.size, score: low + (high - low) * percentile });
  }
  if (!scored.length) return null;

  let top = RATING.priorEvents * RATING.priorScore, bottom = RATING.priorEvents;
  const breakdown = Object.fromEntries(Object.keys(RATING.weights).map((k) => [k, { sum: 0, weight: 0 }]));
  scored.forEach((e, i) => {
    e.weight = RATING.recency ** (scored.length - 1 - i) * Math.min(1, e.size / RATING.fullFieldSize);
    top += e.weight * e.score;
    bottom += e.weight;
    for (const k in breakdown) if (e.measures[k] != null) { breakdown[k].sum += e.weight * e.measures[k]; breakdown[k].weight += e.weight; }
  });
  const results = top / bottom;
  const skillsPart = skills.reference ? Math.min(1, skills.best / skills.reference) : null;
  const rating = skillsPart == null ? results : (1 - RATING.skillsShare) * results + RATING.skillsShare * 100 * skillsPart;
  return {
    rating: Math.round(rating * 10) / 10,
    results,
    skillsPart,
    skillsBest: skills.best,
    skillsReference: skills.reference,
    events: scored.reverse(),
    breakdown: Object.fromEntries(Object.entries(breakdown).map(([k, b]) => [k, b.weight ? b.sum / b.weight : null])),
    confidence: scored.length >= 4 ? 'High' : scored.length >= 2 ? 'Medium' : 'Low',
  };
}

// Divisions are shared between teams, so each is fetched once. A failed fetch is not remembered.
const fieldCache = new Map();
function loadField(eventId, divisionId) {
  const key = `${eventId}:${divisionId}`;
  if (!fieldCache.has(key)) {
    const p = apiAll(`/events/${eventId}/divisions/${divisionId}/matches`).then(buildField);
    p.catch(() => fieldCache.delete(key));
    fieldCache.set(key, p);
  }
  return fieldCache.get(key);
}

// The season's skills yardstick: the top score at any finished Signature event or Worlds.
const skillsRefCache = new Map();
function loadSkillsReference(seasonId) {
  if (!skillsRefCache.has(seasonId)) {
    const p = Promise.all(['Signature', 'World'].map((level) => apiAll(`/events?season[]=${seasonId}&level[]=${level}`)))
      .then(([signature, world]) => pool([...signature, ...world].filter((e) => eventFinished(e)), 3, (e) => apiAll(`/events/${e.id}/skills`)))
      .then((lists) => Math.max(0, ...lists.map((skills) => {
        const byTeam = new Map();
        for (const k of skills) { const l = byTeam.get(k.team.id) || []; l.push(k); byTeam.set(k.team.id, l); }
        return Math.max(0, ...[...byTeam.values()].map(bestSkillsTotal));
      })) || null);
    p.catch(() => skillsRefCache.delete(seasonId));
    skillsRefCache.set(seasonId, p);
  }
  return skillsRefCache.get(seasonId);
}

const eventFinished = (e, now = Date.now()) => !e.ongoing && new Date(e.end || e.start).getTime() + 86400000 < now;

/** Finished events the team was ranked at. An event still in progress is left out until it ends. */
function ratableEvents(d, now = Date.now()) {
  const rankByEvent = new Map();
  for (const r of d.rankings || []) if (!rankByEvent.has(r.event.id)) rankByEvent.set(r.event.id, r);
  return (d.events || []).filter((e) => rankByEvent.has(e.id) && eventFinished(e, now))
    .map((event) => ({ event, rank: rankByEvent.get(event.id).rank, divisionId: rankByEvent.get(event.id).division.id }));
}

/** The team's rating from its already-loaded season data (needs events, rankings and skills). */
async function loadRating(team, d, seasonId) {
  const entries = ratableEvents(d);
  const [fields, reference] = await Promise.all([pool(entries, 3, (e) => loadField(e.event.id, e.divisionId)), loadSkillsReference(seasonId)]);
  return computeRating(team.id, entries.map((e, i) => ({ ...e, field: fields[i] })), { best: bestSkillsTotal(d.skills), reference });
}

/** Adds .place to rated rows: 1 for the best, with equal ratings sharing a place. */
function assignPlaces(rows, getRating) {
  const sorted = rows.filter((r) => getRating(r) != null).sort((a, b) => getRating(b) - getRating(a));
  sorted.forEach((r, i) => { r.place = i && getRating(r) === getRating(sorted[i - 1]) ? sorted[i - 1].place : i + 1; });
  return rows;
}
