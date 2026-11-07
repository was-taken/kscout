/* KScout — UI layer (vanilla JS). Data helpers live in data.js. */
'use strict';

const app = document.getElementById('app');

// ---------------------------------------------------------------- icons
const ICONS = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  home: '<path d="M3.5 10.5 12 3.8l8.5 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5A1.5 1.5 0 0 1 3.5 19z"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  columns: '<rect x="3.5" y="4.5" width="7" height="15" rx="1.5"/><rect x="13.5" y="4.5" width="7" height="15" rx="1.5"/>',
  team: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5a6 6 0 0 1 12 0"/><path d="M15.5 5.3a3.2 3.2 0 0 1 0 6.4M21 19.5a6 6 0 0 0-3.6-5.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 19.5h14"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const icon = (name) => `<span class="ico">${svg(name)}</span>`;
document.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = svg(el.dataset.icon)));

// ---------------------------------------------------------------- small helpers
const shortSeason = (n) => String(n || '').replace(/^.*?(?=\d{4}-\d{4})/, '');
const seasonName = () => shortSeason(state.seasons.find((s) => s.id === state.seasonId)?.name);
const teamLink = (num) => `<a class="lnk" href="#/team/${encodeURIComponent(num)}">${esc(num)}</a>`;
const resBadge = (r) => `<span class="res ${r}">${r === 'U' ? '–' : r}</span>`;
const ratingStars = (r) => (r ? `<span class="stars">${'★'.repeat(r)}</span>` : '<span class="muted">—</span>');
const tagChips = (tags) => (tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join(' ');
const shortAward = (t) => String(t).replace(/\s*\(.*\)$/, '');
const relTime = (d) => {
  if (!d) return '';
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return fmtDate(d);
};

function card({ title, aside = '', body = '', cls = '', bodyCls = '', foot = '', id = '' }) {
  return `<section class="card ${cls}" ${id ? `id="${id}"` : ''}>
    <div class="card-h"><h2>${title}</h2><div class="aside">${aside}</div></div>
    <div class="card-b ${bodyCls}">${body}</div>${foot ? `<div class="card-f">${foot}</div>` : ''}</section>`;
}
function statCard({ title, label, value, pill = '', cls = 'c3', aside = '' }) {
  return `<section class="card ${cls}"><div class="card-h"><h2>${title}</h2><div class="aside">${aside}</div></div>
    <div class="stat-b"><div class="lbl">${label}</div><div class="big">${value}</div>${pill}</div></section>`;
}
const pill = (text, dir) => `<span class="pill ${dir || ''}">${dir === 'up' ? icon('up') : dir === 'down' ? icon('down') : ''}${text}</span>`;

// ---------------------------------------------------------------- shell
function setChrome({ nav = '', crumbs = [], actions = '' } = {}) {
  document.querySelectorAll('.side [data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === nav));
  document.getElementById('crumbs').innerHTML = crumbs.map((c, i) => {
    const last = i === crumbs.length - 1;
    const inner = `${c.icon ? icon(c.icon) : ''}${last ? `<b>${esc(c.label)}</b>` : esc(c.label)}`;
    return (i ? '<span class="sep">/</span>' : '') + (c.href && !last ? `<a class="lnk" href="${c.href}" style="display:inline-flex;gap:7px;align-items:center">${inner}</a>` : `<span style="display:inline-flex;gap:7px;align-items:center;min-width:0">${inner}</span>`);
  }).join('');
  document.getElementById('topActions').innerHTML = actions;
  renderSide();
}

function renderSide() {
  const hash = decodeURIComponent(location.hash);
  const starred = Object.entries(state.notes).filter(([, n]) => n.starred).map(([k]) => k).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  document.getElementById('sideWatch').innerHTML = starred.length
    ? starred.slice(0, 12).map((n) => `<a href="#/team/${encodeURIComponent(n)}" class="${hash === '#/team/' + n ? 'on' : ''}">${icon('team')}<span class="t">${esc(n)}</span></a>`).join('')
    : '<div class="empty-s">Star a team to pin it here</div>';
  const sn = document.querySelector('.side-note');
  if (sn) sn.innerHTML = state.server.notesMode === 'team'
    ? (state.server.signedIn ? 'Team notes · signed in' : '<a class="lnk" href="#/settings">Sign in for team notes</a>')
    : 'Data from VEX Events';
  const recent = ls.get('recent', []).slice(0, 6);
  document.getElementById('sideRecent').innerHTML = recent.length
    ? recent.map((r) => `<a href="#/${r.type}/${encodeURIComponent(r.id)}" class="${hash === `#/${r.type}/${r.id}` ? 'on' : ''}" title="${esc(r.label)}">${icon(r.type === 'team' ? 'team' : 'calendar')}<span class="t">${esc(r.label)}</span></a>`).join('')
    : '<div class="empty-s">Nothing yet</div>';
}

function pushRecent(type, id, label) {
  const r = ls.get('recent', []).filter((x) => !(x.type === type && x.id === id));
  r.unshift({ type, id, label });
  ls.set('recent', r.slice(0, 10));
}

// ---------------------------------------------------------------- table
/** columns: [{key,label,num,wrap,html(row),val(row)}]; opts: {sortKey, asc, foot(rows) -> [cells]} */
function sortableTable(el, columns, rows, { sortKey, asc = false, foot, empty = 'No data yet.' } = {}) {
  let key = sortKey ?? columns[0].key, dir = asc;
  const draw = () => {
    const col = columns.find((c) => c.key === key);
    const val = col?.val || ((r) => r[key]);
    const sorted = rows.slice().sort((a, b) => {
      const x = val(a), y = val(b);
      const xn = x == null || Number.isNaN(x), yn = y == null || Number.isNaN(y);
      if (xn && yn) return 0; if (xn) return 1; if (yn) return -1;
      const c = typeof x === 'string' ? x.localeCompare(y, undefined, { numeric: true }) : x - y;
      return dir ? c : -c;
    });
    const f = foot && rows.length ? foot(rows) : null;
    el.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr>${columns.map((c) =>
      `<th data-k="${c.key}" class="sortable ${c.num ? 'num' : ''} ${c.key === key ? 'sorted' + (dir ? ' asc' : '') : ''}">${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${
      sorted.length ? sorted.map((r) => `<tr>${columns.map((c) =>
        `<td class="${c.num ? 'num' : ''} ${c.wrap ? 'wrap' : ''}">${c.html ? c.html(r) : esc((c.val ? c.val(r) : r[c.key]) ?? '—')}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${columns.length}" class="muted" style="text-align:center;padding:28px">${empty}</td></tr>`}</tbody>${
      f ? `<tfoot><tr>${f.map((v, i) => `<td class="${columns[i]?.num ? 'num' : ''}">${v ?? ''}</td>`).join('')}</tr></tfoot>` : ''}</table></div>`;
    el.querySelectorAll('th.sortable').forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.k;
      if (k === key) dir = !dir; else { key = k; dir = !columns.find((x) => x.key === k).num; }
      draw();
    }));
  };
  draw();
}

function segmented(el, items, initial, onChange) {
  el.innerHTML = `<div class="seg" role="tablist">${items.map((it) => `<button role="tab" data-id="${it.id}">${esc(it.label)}</button>`).join('')}</div>`;
  const pick = (id) => {
    el.querySelectorAll('button').forEach((b) => { const on = b.dataset.id === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    onChange(id);
  };
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => pick(b.dataset.id)));
  pick(initial || items[0].id);
}

// ---------------------------------------------------------------- charts
function niceStep(max, ticks = 4) {
  const raw = max / ticks || 1, mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
}

/** Multi-series line chart with legend, crosshair and tooltip. */
function lineChart(el, pts, series) {
  if (pts.length < 2) { el.innerHTML = '<div class="empty">Not enough scored matches yet.</div>'; return; }
  // draw at the real pixel width so text stays 11px; redraw when the card resizes
  if (!el._ro) {
    let lastW = 0;
    el._ro = new ResizeObserver(() => { const w = Math.round(el.clientWidth); if (w && Math.abs(w - lastW) > 4) { lastW = w; lineChart(el, pts, series); } });
    el._ro.observe(el);
  }
  const W = Math.max(280, Math.round(el.clientWidth) || 720), H = 230, P = { l: 34, r: 14, t: 12, b: 26 };
  const maxY = Math.max(1, ...pts.flatMap((p) => series.map((s) => p[s.key] || 0)));
  const step = niceStep(maxY), top = Math.ceil(maxY / step) * step;
  const x = (i) => P.l + (i * (W - P.l - P.r)) / (pts.length - 1);
  const y = (v) => H - P.b - (v * (H - P.t - P.b)) / top;
  const ticks = []; for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  // event boundary labels, skipping any that would collide
  const marks = []; let lastX = -1e9;
  pts.forEach((p, i) => { if (i === 0 || p.eventId !== pts[i - 1].eventId) { if (x(i) - lastX > 130) { marks.push({ i, name: p.eventName }); lastX = x(i); } } });
  const showDots = pts.length <= 45;
  el.innerHTML = `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>
    <div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(series.map((s) => s.name).join(' and '))} per match">
      ${ticks.map((t) => `<line x1="${P.l}" x2="${W - P.r}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line-2)"/><text x="${P.l - 8}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${t}</text>`).join('')}
      ${marks.map((m) => `<line x1="${x(m.i)}" x2="${x(m.i)}" y1="${P.t}" y2="${H - P.b}" stroke="var(--line-2)" stroke-dasharray="2 3"/><text x="${x(m.i) + (m.i ? 4 : 0)}" y="${H - 8}" font-size="11" fill="var(--muted)">${esc(m.name.length > 18 ? m.name.slice(0, 17) + '…' : m.name)}</text>`).join('')}
      ${series.map((s) => `<path d="${pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[s.key]).toFixed(1)}`).join('')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('')}
      ${showDots ? series.map((s) => pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p[s.key])}" r="3" fill="${s.color}" stroke="var(--surface)" stroke-width="1.5"/>`).join('')).join('') : ''}
      <line class="xh" y1="${P.t}" y2="${H - P.b}" stroke="var(--muted)" stroke-width="1" style="display:none"/>
      <g class="hl"></g>
      <rect x="${P.l}" y="0" width="${W - P.l - P.r}" height="${H}" fill="transparent" class="hit"/>
    </svg><div class="tip"></div></div>`;
  const svgEl = el.querySelector('svg'), tip = el.querySelector('.tip'), xh = el.querySelector('.xh'), hl = el.querySelector('.hl');
  const hit = el.querySelector('.hit');
  const show = (clientX) => {
    const r = svgEl.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(pts.length - 1, Math.round(((vx - P.l) / (W - P.l - P.r)) * (pts.length - 1))));
    const p = pts[i];
    xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.style.display = '';
    hl.innerHTML = series.map((s) => `<circle cx="${x(i)}" cy="${y(p[s.key])}" r="4.5" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`).join('');
    tip.innerHTML = `<div class="t">${esc(p.label)}</div>${series.map((s) => `<div class="r"><i style="background:${s.color}"></i>${esc(s.name)} <b style="margin-left:auto;padding-left:10px">${p[s.key]}</b></div>`).join('')}${p.result ? `<div class="r" style="margin-top:3px">Result ${resBadge(p.result)}</div>` : ''}`;
    tip.style.display = 'block';
    const px = (x(i) / W) * r.width;
    tip.style.left = (px + 14 + tip.offsetWidth > r.width ? px - tip.offsetWidth - 14 : px + 14) + 'px';
    tip.style.top = '8px';
  };
  hit.addEventListener('mousemove', (e) => show(e.clientX));
  hit.addEventListener('touchstart', (e) => show(e.touches[0].clientX), { passive: true });
  hit.addEventListener('mouseleave', () => { tip.style.display = 'none'; xh.style.display = 'none'; hl.innerHTML = ''; });
}

/** Donut with legend, centre total and per-segment tooltip. */
function donutChart(el, segs, centerLabel) {
  const total = segs.reduce((a, s) => a + s.value, 0);
  const S = 200, cx = S / 2, cy = S / 2, R = 84, r0 = 62;
  const pt = (rad, a) => [cx + rad * Math.sin(a), cy - rad * Math.cos(a)];
  const arc = (a0, a1) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = pt(R, a0), [x1, y1] = pt(R, a1), [x2, y2] = pt(r0, a1), [x3, y3] = pt(r0, a0);
    return `M${x0},${y0}A${R},${R} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${r0},${r0} 0 ${large} 0 ${x3},${y3}Z`;
  };
  let a = 0;
  const shapes = total ? segs.map((s, i) => {
    if (!s.value) return '';
    const sweep = (s.value / total) * Math.PI * 2;
    const d = sweep >= Math.PI * 2 - 1e-6 ? arc(0, Math.PI) + arc(Math.PI, Math.PI * 2 - 1e-4) : arc(a, a + sweep);
    a += sweep;
    return `<path d="${d}" fill="${s.color}" stroke="var(--surface)" stroke-width="2" data-i="${i}" style="cursor:default"/>`;
  }).join('') : `<circle cx="${cx}" cy="${cy}" r="${(R + r0) / 2}" fill="none" stroke="var(--line-2)" stroke-width="${R - r0}"/>`;
  el.innerHTML = `<div class="legend">${segs.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)} <b>${s.value}</b></span>`).join('')}</div>
    <div class="chart donut-wrap"><svg viewBox="0 0 ${S} ${S}" style="max-width:210px" role="img" aria-label="${esc(segs.map((s) => `${s.label} ${s.value}`).join(', '))}">${shapes}
      <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="11.5" fill="var(--muted)">${esc(centerLabel)}</text>
      <text x="${cx}" y="${cy + 20}" text-anchor="middle" font-size="28" font-weight="600" fill="var(--text)" style="letter-spacing:-0.03em">${total}</text>
    </svg><div class="tip"></div></div>`;
  const tip = el.querySelector('.tip'), wrap = el.querySelector('.chart');
  el.querySelectorAll('path[data-i]').forEach((p) => {
    p.addEventListener('mousemove', (e) => {
      const s = segs[+p.dataset.i], r = wrap.getBoundingClientRect();
      tip.innerHTML = `<div class="r"><i style="background:${s.color}"></i>${esc(s.label)} <b style="padding-left:8px">${s.value}</b> <span class="muted">${pct(s.value / total)}</span></div>`;
      tip.style.display = 'block'; tip.style.left = e.clientX - r.left + 12 + 'px'; tip.style.top = e.clientY - r.top + 12 + 'px';
    });
    p.addEventListener('mouseleave', () => (tip.style.display = 'none'));
  });
}

// ---------------------------------------------------------------- notes panel
function notesCardHtml(num) {
  const n = note(num);
  return card({
    title: 'Scouting notes', id: 'notesCard', aside: '<span class="saved"></span>',
    body: `<div class="rate" aria-label="Your rating">${[1, 2, 3, 4, 5].map((i) => `<button data-r="${i}" class="${i <= n.rating ? 'on' : ''}" aria-label="${i} star${i > 1 ? 's' : ''}">★</button>`).join('')}</div>
      <div class="taglist">${TAGS.map((t) => `<button data-t="${esc(t)}" class="${n.tags?.includes(t) ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>
      <textarea placeholder="Robot design, auton routes, driver skill, strengths and weaknesses…">${esc(n.text)}</textarea>`,
    foot: `<div style="display:flex;flex-direction:column;gap:2px"><span id="notesUpdated">${n.updated ? 'Updated ' + relTime(n.updated) : ''}</span><span>${state.server.notesMode === 'team' && !state.server.signedIn ? `Saved in this browser only · <a class="lnk" href="#/settings" style="text-decoration:underline">Sign in</a> to share with your team` : esc(notesWhere())}</span></div>`,
  });
}
function bindNotes(num) {
  const c = document.getElementById('notesCard');
  const touch = () => { const u = document.getElementById('notesUpdated'); if (u) u.textContent = 'Updated just now'; };
  c.querySelectorAll('.rate button').forEach((b) => b.addEventListener('click', () => {
    const r = +b.dataset.r;
    setNote(num, { rating: note(num).rating === r ? 0 : r });
    c.querySelectorAll('.rate button').forEach((x) => x.classList.toggle('on', +x.dataset.r <= note(num).rating));
    touch();
  }));
  c.querySelectorAll('.taglist button').forEach((b) => b.addEventListener('click', () => {
    b.classList.toggle('on');
    setNote(num, { tags: [...c.querySelectorAll('.taglist button.on')].map((x) => x.dataset.t) });
    touch();
  }));
  c.querySelector('textarea').addEventListener('input', (e) => { setNote(num, { text: e.target.value }); touch(); });
}

// ---------------------------------------------------------------- views: setup & settings
function tokenForm(msg) {
  return `<p class="muted" style="margin:0 0 6px">This app reads team, match, skills and award data from the official VEX Events API (formerly RobotEvents), which needs a free personal access token.</p>
    <ol>
      <li>Sign in, or create an account, at <a href="https://events.vex.com" target="_blank" rel="noopener">events.vex.com</a>.</li>
      <li>Open the <a href="https://events.vex.com/api/v2" target="_blank" rel="noopener">API page</a> and click <b>Request Access</b>. Approval can take a while.</li>
      <li>Once approved, create an access token and paste it below. It's saved only on this computer, in <code>.env</code>.</li>
    </ol>
    ${msg ? `<div class="error">${esc(msg)}</div>` : ''}
    <form class="hero-search" id="tokenForm"><input class="input" id="tokenInput" type="password" placeholder="Paste your VEX Events API token" aria-label="VEX Events API token"/><button class="btn primary">Save token</button></form>`;
}
function bindTokenForm(after) {
  document.getElementById('tokenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true; btn.textContent = 'Checking…';
    const r = await fetch('/local/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: document.getElementById('tokenInput').value.trim() }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return after(j.error || 'Could not save the token.');
    after(null, true);
  });
}
function renderSetup(msg) {
  setChrome({ crumbs: [{ icon: 'key', label: 'Connect' }] });
  if (!state.server.tokenEditable) {
    app.innerHTML = `<div class="setup">${card({ title: 'This site isn’t connected yet', body: `<p style="margin-top:0">${msg ? esc(msg) : 'The VEX Events API token hasn’t been set up on the server.'}</p><p class="muted" style="margin-bottom:0">Site owner: set the <code>ROBOTEVENTS_TOKEN</code> environment variable in your hosting dashboard and restart the app.</p>` })}</div>`;
    return;
  }
  app.innerHTML = `<div class="setup">${card({ title: 'Connect to VEX Events', body: tokenForm(msg) })}</div>`;
  bindTokenForm((err) => (err ? renderSetup(err) : boot()));
}

function teamCard(msg) {
  if (state.server.notesMode !== 'team') return '';
  if (state.server.signedIn) {
    return card({ cls: 'c5', title: 'Team sign-in', aside: '<span class="saved" style="color:var(--good)">Signed in</span>',
      body: `<p style="margin-top:0">You can see and edit your team’s shared scouting notes. You stay signed in on this browser for 30 days.</p><button class="btn" id="logoutBtn">Sign out</button>` });
  }
  return card({ cls: 'c5', title: 'Team sign-in',
    body: `<p style="margin-top:0">Enter your team password to see and edit shared scouting notes. Until then, notes you write stay in this browser.</p>
      ${msg ? `<div class="error">${esc(msg)}</div>` : ''}
      <form class="hero-search" id="loginForm"><input class="input" id="pwInput" type="password" autocomplete="current-password" placeholder="Team password" aria-label="Team password"/><button class="btn primary">Sign in</button></form>` });
}

function renderSettings(msg, ok, teamMsg, info) {
  setChrome({ nav: 'settings', crumbs: [{ icon: 'sliders', label: 'Settings' }] });
  const count = Object.keys(state.notes).length;
  const tokenCard = state.server.tokenEditable
    ? card({ cls: 'c7', title: 'API token', aside: ok ? '<span class="saved">Token saved</span>' : '', body: tokenForm(msg) })
    : card({ cls: 'c7', title: 'API token', body: `<p style="margin:0">The VEX Events token is set by the server, so it can’t be viewed or changed from the website.</p>` });
  app.innerHTML = `<div class="ph"><div><h1>Settings</h1></div></div>
    ${info ? `<div class="card" style="padding:10px 14px;margin-bottom:12px">${esc(info)}</div>` : ''}
    <div class="grid">
      ${tokenCard}
      ${teamCard(teamMsg)}
      ${card({ cls: 'c5', title: 'Your notes', aside: `${count} team${count === 1 ? '' : 's'}`, body: `<p style="margin-top:0">${esc(notesWhere())}.</p>
        <p class="muted">Download a backup now and then. You can restore it here, or on another browser or computer.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="backupBtn">${icon('download')}Download backup</button><label class="btn" style="cursor:pointer">${icon('up')}Restore backup<input type="file" id="restoreInput" accept="application/json,.json" hidden></label></div>` })}
    </div>`;
  if (state.server.tokenEditable) bindTokenForm((err, good) => renderSettings(err, good));

  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    const r = await fetch('/local/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: document.getElementById('pwInput').value }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return renderSettings(null, false, j.error || 'Sign-in failed.');
    // Bring along any notes written in this browser before signing in.
    const local = ls.get(LOCAL_NOTES_KEY, {}) || {};
    state.server.signedIn = true;
    await loadNotes();
    const added = mergeNotes(local);
    if (added) await saveNotesNow();
    renderSide();
    renderSettings(null, false, null, added ? `Signed in. Added ${added} note${added === 1 ? '' : 's'} from this browser to your team’s notes.` : 'Signed in.');
  });
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await fetch('/local/logout', { method: 'POST' });
    state.server.signedIn = false;
    await loadNotes();
    renderSide();
    renderSettings(null, false, null, 'Signed out. Team notes are hidden on this browser.');
  });
  document.getElementById('backupBtn').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(state.notes, null, 2)], { type: 'application/json' }));
    a.download = `kscout-notes-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  });
  document.getElementById('restoreInput').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    let obj; try { obj = JSON.parse(await f.text()); } catch { return renderSettings(null, false, null, 'That file isn’t a KScout backup.'); }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return renderSettings(null, false, null, 'That file isn’t a KScout backup.');
    const added = mergeNotes(obj);
    const saved = await saveNotesNow();
    renderSide();
    renderSettings(null, false, null, saved ? `Restored ${added} team${added === 1 ? '' : 's'} from the backup (newer notes were kept where both had one).` : 'Could not save the restored notes.');
  });
}

/** Merge notes in; for teams in both, keep whichever was updated last. Returns how many changed. */
function mergeNotes(incoming) {
  let n = 0;
  for (const [k, v] of Object.entries(incoming || {})) {
    if (!v || typeof v !== 'object') continue;
    const cur = state.notes[k];
    if (!cur || (v.updated || '') > (cur.updated || '')) { state.notes[k] = v; n++; }
  }
  return n;
}

// ---------------------------------------------------------------- views: home
function renderHome() {
  setChrome({ nav: 'home', crumbs: [{ icon: 'home', label: 'Home' }] });
  const recent = ls.get('recent', []);
  const watch = Object.entries(state.notes).filter(([, n]) => n.starred || n.rating).map(([num, n]) => ({ num, ...n }));
  app.innerHTML = `<div class="ph"><div><h1>Scout</h1><div class="meta"><span>${esc(seasonName())} season</span></div></div></div>
    <div class="grid">
      ${card({ cls: 'c12', title: 'Find a team or event', body: `<form class="hero-search" id="heroForm"><input class="input" id="heroInput" placeholder="Team number like 1234A, or an event SKU like RE-V5RC-26-1234" aria-label="Team number or event SKU"/><button class="btn primary">Search</button></form>
        ${recent.length ? `<div class="examples">Jump back to ${recent.slice(0, 5).map((r) => `<a href="#/${r.type}/${encodeURIComponent(r.id)}">${esc(r.type === 'team' ? r.id : r.label)}</a>`).join('')}</div>` : '<div class="examples">Tip: press <kbd>/</kbd> anywhere to search.</div>'}` })}
      ${card({ cls: 'c7', title: 'Watchlist', aside: `${watch.length} team${watch.length === 1 ? '' : 's'}`, bodyCls: 'flush', body: '<div id="homeWatch"></div>' })}
      ${card({ cls: 'c5', title: 'Recently viewed', bodyCls: 'flush', body: recent.length ? `<div class="rows">${recent.map((r) => `<a class="k" href="#/${r.type}/${encodeURIComponent(r.id)}"><div class="k"><b>${esc(r.label)}</b><small>${r.type === 'team' ? 'Team' : 'Event · ' + esc(r.id)}</small></div>${icon(r.type === 'team' ? 'team' : 'calendar')}</a>`).join('')}</div>` : '<div class="empty">Teams and events you open show up here.</div>' })}
    </div>`;
  sortableTable(document.getElementById('homeWatch'), [
    { key: 'num', label: 'Team', html: (r) => teamLink(r.num) },
    { key: 'rating', label: 'Rating', html: (r) => ratingStars(r.rating) },
    { key: 'tags', label: 'Tags', wrap: true, val: (r) => (r.tags || []).length, html: (r) => tagChips(r.tags) || '<span class="muted">—</span>' },
  ], watch, { sortKey: 'rating', empty: 'Star or rate teams from their page to track them here.' });
  document.getElementById('heroForm').addEventListener('submit', (e) => { e.preventDefault(); go(document.getElementById('heroInput').value); });
}

// ---------------------------------------------------------------- views: team
async function renderTeam(number) {
  setChrome({ crumbs: [{ icon: 'team', label: 'Teams' }, { label: number.toUpperCase() }] });
  app.innerHTML = '<div class="loading">Loading team…</div>';
  const team = await findTeam(number);
  if (!team) { app.innerHTML = `<div class="error">No V5RC team found with number ${esc(number)}.</div>`; return; }
  pushRecent('team', team.number, `${team.number} · ${team.team_name}`);
  const d = await loadTeamSeason(team.id, state.seasonId);
  const s = summarize(team, d);
  const rankByEv = new Map(d.rankings.map((r) => [r.event.id, r]));
  const awardsByEv = new Map();
  for (const a of d.awards) { const l = awardsByEv.get(a.event.id) || []; l.push(a); awardsByEv.set(a.event.id, l); }
  const now = Date.now();
  const past = d.events.filter((e) => new Date(e.start) <= now).sort((a, b) => new Date(b.start) - new Date(a.start));

  const watchBtn = () => `<button class="btn ${note(team.number).starred ? 'on' : ''}" id="starBtn">${icon('star')}<span class="lbl">${note(team.number).starred ? 'Watching' : 'Watch'}</span></button>`;
  setChrome({
    crumbs: [{ icon: 'team', label: 'Teams' }, { label: team.number }],
    actions: `${watchBtn()}<a class="btn" href="#/compare?teams=${encodeURIComponent(team.number)}">${icon('columns')}<span class="lbl">Compare</span></a><a class="btn" href="https://events.vex.com/teams/V5RC/${encodeURIComponent(team.number)}" target="_blank" rel="noopener">${icon('external')}<span class="lbl">VEX Events</span></a>`,
  });

  // trend: last event's average vs the season average before it
  let trend = pill(s.margin == null ? 'No matches yet' : `Margin ${s.margin >= 0 ? '+' : ''}${fmt1(s.margin)}`);
  if (s.eventAvgs.length >= 2) {
    const last = s.eventAvgs.at(-1).avg, prev = s.eventAvgs.slice(0, -1).reduce((a, e) => a + e.avg, 0) / (s.eventAvgs.length - 1);
    const ch = prev ? (last - prev) / prev : 0;
    trend = pill(`${Math.abs(ch * 100).toFixed(1)}% last event`, ch >= 0 ? 'up' : 'down');
  }

  app.innerHTML = `
    <div class="ph"><div>
      <h1>${esc(team.number)} <span class="soft">${esc(team.team_name)}</span></h1>
      <div class="meta">${team.organization ? `<span>${esc(team.organization)}</span>` : ''}<span>${esc(loc(team.location))}</span>${team.grade ? `<span>${esc(team.grade)}</span>` : ''}${team.robot_name ? `<span>Robot “${esc(team.robot_name)}”</span>` : ''}</div>
    </div></div>
    <div class="dash">
      <div class="grid">
        ${card({ cls: 'c8', title: 'Scores per match', aside: `${s.played} scored matches`, body: '<div id="trend"></div>' })}
        ${card({ cls: 'c4', title: 'Match results', aside: `${pct(s.winRate)} win rate`, body: '<div id="donut"></div>' })}
        ${statCard({ title: 'Win rate', label: 'This season', value: pct(s.winRate), pill: pill(`Quals ${s.qw}-${s.ql}-${s.qt} · Elims ${s.ew}-${s.el}-${s.et}`) })}
        ${statCard({ title: 'Average score', label: 'Alliance points per match', value: fmt1(s.avg), pill: trend })}
        ${statCard({ title: 'Best skills', label: 'Driver + autonomous', value: s.bestSkills || '—', pill: pill(`Driver ${s.bestDriver || '—'} · Auton ${s.bestProg || '—'}`) })}
        ${statCard({ title: 'Average rank', label: `Across ${s.eventsAttended} event${s.eventsAttended === 1 ? '' : 's'}`, value: fmt1(s.avgRank), pill: pill(s.bestRank ? `Best #${s.bestRank}` : 'Not ranked yet') })}
        ${card({ cls: 'c12', title: 'Events', aside: `${past.length} played · ${s.upcoming.length} upcoming`, bodyCls: 'flush', body: '<div id="evTable"></div>' })}
        <section class="card c12"><div class="card-h"><div id="teamSeg"></div><div class="aside" id="teamSegAside"></div></div><div class="card-b flush" id="teamSegBody"></div></section>
      </div>
      <aside class="panel">
        ${notesCardHtml(team.number)}
        ${card({ title: 'Awards', aside: s.awards.length, bodyCls: 'flush', body: s.awards.length ? `<div class="rows">${s.awards.map((a) => `<div><div class="k"><b>${esc(shortAward(a.title))}</b><small>${esc(a.event.name)}</small></div></div>`).join('')}</div>` : '<div class="empty" style="padding:22px">No awards this season</div>' })}
        ${card({ title: 'Upcoming', aside: s.upcoming.length, bodyCls: 'flush', body: s.upcoming.length ? `<div class="rows">${s.upcoming.sort((a, b) => new Date(a.start) - new Date(b.start)).map((e) => `<a class="k" href="#/event/${encodeURIComponent(e.sku)}"><div class="k"><b>${esc(e.name)}</b><small>${fmtDate(e.start)} · ${esc(e.location?.city || '')}</small></div>${icon('calendar')}</a>`).join('')}</div>` : '<div class="empty" style="padding:22px">No upcoming events</div>' })}
      </aside>
    </div>`;

  const onStar = () => {
    setNote(team.number, { starred: !note(team.number).starred });
    document.getElementById('starBtn').outerHTML = watchBtn();
    document.getElementById('starBtn').addEventListener('click', onStar);
    renderSide();
  };
  document.getElementById('starBtn').addEventListener('click', onStar);
  bindNotes(team.number);

  lineChart(document.getElementById('trend'), s.series, [
    { key: 'y', name: 'Alliance score', color: 'var(--s1)' },
    { key: 'opp', name: 'Opponent score', color: 'var(--s2)' },
  ]);
  donutChart(document.getElementById('donut'), [
    { label: 'Wins', value: s.w, color: 'var(--s1)' },
    { label: 'Losses', value: s.l, color: 'var(--s2)' },
    { label: 'Ties', value: s.t, color: 'var(--s3)' },
  ], 'Matches');

  const evRows = past.map((e) => ({ e, r: rankByEv.get(e.id), aw: awardsByEv.get(e.id) || [], sk: s.skillsByEvent.get(e.id) }));
  sortableTable(document.getElementById('evTable'), [
    { key: 'date', label: 'Date', val: (x) => new Date(x.e.start).getTime(), html: (x) => fmtDate(x.e.start) },
    { key: 'name', label: 'Event', val: (x) => x.e.name, html: (x) => `<a class="lnk" href="#/event/${encodeURIComponent(x.e.sku)}">${esc(x.e.name)}</a>` },
    { key: 'city', label: 'City', val: (x) => x.e.location?.city || '' },
    { key: 'rank', label: 'Rank', num: true, val: (x) => x.r?.rank, html: (x) => (x.r ? `#${x.r.rank}` : '—') },
    { key: 'rec', label: 'W-L-T', val: (x) => (x.r ? x.r.wins + x.r.ties / 2 : null), html: (x) => (x.r ? `${x.r.wins}-${x.r.losses}-${x.r.ties}` : '—') },
    { key: 'wp', label: 'WP', num: true, val: (x) => x.r?.wp },
    { key: 'ap', label: 'AP', num: true, val: (x) => x.r?.ap },
    { key: 'sp', label: 'SP', num: true, val: (x) => x.r?.sp },
    { key: 'sk', label: 'Skills', num: true, val: (x) => (x.sk ? x.sk.driver + x.sk.programming : null) },
    { key: 'aw', label: 'Awards', wrap: true, val: (x) => x.aw.length, html: (x) => x.aw.map((a) => `<span class="tag">${esc(shortAward(a.title))}</span>`).join(' ') || '<span class="muted">—</span>' },
  ], evRows, {
    sortKey: 'date', empty: 'No events played this season yet.',
    foot: () => ['Average', '', '', s.avgRank ? '#' + fmt1(s.avgRank) : '—', `${s.qw}-${s.ql}-${s.qt}`, '', '', '', s.bestSkills ? `best ${s.bestSkills}` : '', `${s.awards.length} total`],
  });

  const matchRows = d.matches.filter((m) => m.round !== 1).map((m) => {
    const o = matchOutcome(m, team.id); if (!o) return null;
    const ev = d.events.find((e) => e.id === m.event.id);
    return { m, o, date: m.started || m.scheduled || ev?.start,
      partners: o.mine.teams.filter((t) => t.team.id !== team.id).map((t) => t.team.name),
      opps: o.opp.teams.map((t) => t.team.name) };
  }).filter(Boolean);
  const skillRows = [...s.skillsByEvent.values()].map((e) => ({ ...e, total: e.driver + e.programming, date: d.events.find((x) => x.id === e.event.id)?.start }));
  const body = document.getElementById('teamSegBody'), aside = document.getElementById('teamSegAside');
  segmented(document.getElementById('teamSeg'), [
    { id: 'm', label: `Matches` }, { id: 's', label: 'Skills runs' },
  ], 'm', (id) => {
    if (id === 'm') {
      aside.textContent = `${matchRows.length} matches`;
      sortableTable(body, [
        { key: 'date', label: 'Date', val: (r) => new Date(r.date || 0).getTime(), html: (r) => fmtDate(r.date) },
        { key: 'ev', label: 'Event', val: (r) => r.m.event.name },
        { key: 'name', label: 'Match', val: (r) => r.m.round * 1000 + r.m.matchnum, html: (r) => esc(r.m.name) },
        { key: 'color', label: 'Alliance', val: (r) => r.o.mine.color, html: (r) => `<span class="dot ${r.o.mine.color}"></span>${r.o.mine.color === 'red' ? 'Red' : 'Blue'}` },
        { key: 'partners', label: 'Partner', val: (r) => r.partners.join(), html: (r) => r.partners.map(teamLink).join(', ') || '—' },
        { key: 'opps', label: 'Opponents', val: (r) => r.opps.join(), html: (r) => r.opps.map(teamLink).join(', ') },
        { key: 'score', label: 'Score', num: true, val: (r) => r.o.mine.score, html: (r) => (r.o.scored ? `<b>${r.o.mine.score}</b> <span class="sub">– ${r.o.opp.score}</span>` : '<span class="muted">—</span>') },
        { key: 'res', label: 'Result', val: (r) => r.o.result, html: (r) => resBadge(r.o.result) },
      ], matchRows, { sortKey: 'date', empty: 'No matches this season yet.' });
    } else {
      aside.textContent = `${skillRows.length} events`;
      sortableTable(body, [
        { key: 'date', label: 'Date', val: (r) => new Date(r.date || 0).getTime(), html: (r) => fmtDate(r.date) },
        { key: 'event', label: 'Event', val: (r) => r.event.name },
        { key: 'driver', label: 'Driver', num: true },
        { key: 'programming', label: 'Autonomous', num: true },
        { key: 'total', label: 'Combined', num: true, html: (r) => `<b>${r.total}</b>` },
      ], skillRows, { sortKey: 'total', empty: 'No skills runs this season yet.' });
    }
  });
}

// ---------------------------------------------------------------- views: event
async function renderEvent(sku) {
  setChrome({ crumbs: [{ icon: 'calendar', label: 'Events' }, { label: sku.toUpperCase() }] });
  app.innerHTML = '<div class="loading">Loading event…</div>';
  const j = await api(`/events?sku[]=${encodeURIComponent(sku.toUpperCase())}`);
  const ev = j.data?.[0];
  if (!ev) { app.innerHTML = `<div class="error">No event found with SKU ${esc(sku)}.</div>`; return; }
  pushRecent('event', ev.sku, ev.name);
  setChrome({
    crumbs: [{ icon: 'calendar', label: 'Events' }, { label: ev.name }],
    actions: `<a class="btn" href="https://events.vex.com/robot-competitions/vex-robotics-competition/${encodeURIComponent(ev.sku)}.html" target="_blank" rel="noopener">${icon('external')}<span class="lbl">VEX Events</span></a>`,
  });
  const divs = ev.divisions?.length ? ev.divisions : [{ id: 1, name: 'Default' }];
  const [teams, skills, awards, divData] = await Promise.all([
    apiAll(`/events/${ev.id}/teams`),
    apiAll(`/events/${ev.id}/skills`),
    apiAll(`/events/${ev.id}/awards`),
    Promise.all(divs.map(async (dv) => {
      const [rankings, matches] = await Promise.all([
        apiAll(`/events/${ev.id}/divisions/${dv.id}/rankings`).catch(() => []),
        apiAll(`/events/${ev.id}/divisions/${dv.id}/matches`).catch(() => []),
      ]);
      return { div: dv, rankings, matches, opr: computeOPR(matches) };
    })),
  ]);
  const skillByTeam = new Map();
  for (const k of skills) {
    const e = skillByTeam.get(k.team.id) || { driver: 0, programming: 0, rank: null };
    if (k.type === 'driver') e.driver = Math.max(e.driver, k.score);
    if (k.type === 'programming') e.programming = Math.max(e.programming, k.score);
    if (k.rank) e.rank = e.rank ? Math.min(e.rank, k.rank) : k.rank;
    skillByTeam.set(k.team.id, e);
  }
  const awardsByTeam = new Map();
  for (const a of awards) for (const w of a.teamWinners || []) { const l = awardsByTeam.get(w.team.id) || []; l.push(a.title); awardsByTeam.set(w.team.id, l); }

  const allMatches = divData.flatMap((dd) => dd.matches.map((m) => ({ ...m, divName: dd.div.name })));
  const scored = allMatches.filter((m) => m.round !== 1 && (m.scored || m.alliances.reduce((a, x) => a + (x.score || 0), 0) > 0));
  const allianceScores = scored.flatMap((m) => m.alliances.map((a) => a.score));
  const avgScore = allianceScores.length ? allianceScores.reduce((a, b) => a + b, 0) / allianceScores.length : null;
  let high = null;
  for (const m of scored) for (const a of m.alliances) if (!high || a.score > high.score) high = { score: a.score, m, teams: a.teams.map((t) => t.team.name) };
  const quals = scored.filter((m) => m.round === 2).length;
  const up = new Date(ev.start) > Date.now();
  const sameDay = !ev.end || ev.end.slice(0, 10) === ev.start.slice(0, 10);

  app.innerHTML = `<div class="ph"><div>
      <h1>${esc(ev.name)}</h1>
      <div class="meta"><span>${icon('calendar')}${fmtDate(ev.start)}${sameDay ? '' : ' – ' + fmtDate(ev.end)}</span>${ev.location?.venue ? `<span>${esc(ev.location.venue)}</span>` : ''}<span>${esc(loc(ev.location))}</span><span class="muted">${esc(ev.sku)}</span></div>
    </div></div>
    <div class="grid">
      ${statCard({ title: 'Teams', label: 'Registered', value: teams.length, pill: pill(esc(ev.level || 'Event')) })}
      ${statCard({ title: 'Matches', label: 'Scored so far', value: scored.length, pill: pill(up ? 'Not started' : `${quals} quals · ${scored.length - quals} elims`) })}
      ${statCard({ title: 'Average score', label: 'Per alliance', value: fmt1(avgScore), pill: pill(`${divs.length} division${divs.length === 1 ? '' : 's'}`) })}
      ${statCard({ title: 'High score', label: high ? esc(high.m.name) : 'No scores yet', value: high ? high.score : '—', pill: high ? pill(esc(high.teams.join(' + '))) : '' })}
      <section class="card c12"><div class="card-h"><div id="evSeg"></div><div class="aside" id="evAside"></div></div><div class="card-b flush" id="evBody"></div></section>
    </div>`;

  const body = document.getElementById('evBody'), aside = document.getElementById('evAside');
  const items = [
    ...divData.map((dd) => ({ id: 'd' + dd.div.id, label: divs.length > 1 ? dd.div.name : 'Rankings' })),
    { id: 'pre', label: 'Pre-scout' }, { id: 'sk', label: 'Skills' }, { id: 'mt', label: 'Matches' }, { id: 'aw', label: `Awards` },
  ];
  segmented(document.getElementById('evSeg'), items, divData.some((dd) => dd.rankings.length) ? items[0].id : 'pre', (id) => {
    aside.textContent = '';
    if (id.startsWith('d')) {
      const dd = divData.find((x) => 'd' + x.div.id === id);
      if (!dd.rankings.length) { body.innerHTML = '<div class="empty">No rankings posted yet. Open <b>Pre-scout</b> to see season stats for every registered team.</div>'; return; }
      aside.textContent = 'OPR = points added per match · DPR = points allowed · CCWM = OPR − DPR';
      const rows = dd.rankings.map((r) => ({ ...r, num: r.team.name, ...(dd.opr.get(r.team.id) || {}), sk: skillByTeam.get(r.team.id), aw: awardsByTeam.get(r.team.id) || [] }));
      const avg = (f) => fmt1(rows.reduce((a, r) => a + (f(r) || 0), 0) / rows.length);
      sortableTable(body, [
        { key: 'rank', label: 'Rank', num: true },
        { key: 'num', label: 'Team', html: (r) => teamLink(r.num) + (note(r.num).starred ? ' <span class="stars">★</span>' : '') },
        { key: 'rec', label: 'W-L-T', val: (r) => r.wins + r.ties * 0.5, html: (r) => `${r.wins}-${r.losses}-${r.ties}` },
        { key: 'wp', label: 'WP', num: true }, { key: 'ap', label: 'AP', num: true }, { key: 'sp', label: 'SP', num: true },
        { key: 'average_points', label: 'Avg pts', num: true, html: (r) => fmt1(r.average_points) },
        { key: 'high_score', label: 'High', num: true },
        { key: 'opr', label: 'OPR', num: true, html: (r) => fmt1(r.opr) },
        { key: 'dpr', label: 'DPR', num: true, html: (r) => fmt1(r.dpr) },
        { key: 'ccwm', label: 'CCWM', num: true, html: (r) => fmt1(r.ccwm) },
        { key: 'skills', label: 'Skills', num: true, val: (r) => (r.sk ? r.sk.driver + r.sk.programming : null) },
        { key: 'my', label: 'My rating', val: (r) => note(r.num).rating || null, html: (r) => ratingStars(note(r.num).rating) },
        { key: 'aw', label: 'Awards', wrap: true, val: (r) => r.aw.length, html: (r) => r.aw.map((t) => `<span class="tag">${esc(shortAward(t))}</span>`).join(' ') },
      ], rows, { sortKey: 'rank', asc: true, foot: () => ['', 'Average', '', avg((r) => r.wp), avg((r) => r.ap), avg((r) => r.sp), avg((r) => r.average_points), avg((r) => r.high_score), avg((r) => r.opr), avg((r) => r.dpr), avg((r) => r.ccwm), '', '', ''] });
    } else if (id === 'pre') {
      renderPrescout(body, aside, teams);
    } else if (id === 'sk') {
      const rows = teams.map((t) => ({ num: t.number, name: t.team_name, ...(skillByTeam.get(t.id) || {}) })).filter((r) => r.driver != null);
      rows.forEach((r) => (r.total = r.driver + r.programming));
      aside.textContent = `${rows.length} teams with runs`;
      sortableTable(body, [
        { key: 'rank', label: 'Rank', num: true },
        { key: 'num', label: 'Team', html: (r) => teamLink(r.num) },
        { key: 'name', label: 'Name' },
        { key: 'driver', label: 'Driver', num: true }, { key: 'programming', label: 'Autonomous', num: true },
        { key: 'total', label: 'Combined', num: true, html: (r) => `<b>${r.total}</b>` },
      ], rows, { sortKey: 'total', empty: 'No skills runs posted yet.' });
    } else if (id === 'mt') {
      const al = (m, c) => m.alliances.find((a) => a.color === c);
      const list = (a) => a?.teams.map((t) => teamLink(t.team.name)).join(' ') || '';
      aside.textContent = `${allMatches.length} matches`;
      sortableTable(body, [
        { key: 'name', label: 'Match', val: (m) => (m.round === 2 ? 0 : m.round) * 10000 + m.instance * 100 + m.matchnum, html: (m) => esc(m.name) + (divs.length > 1 ? ` <span class="sub">${esc(m.divName)}</span>` : '') },
        { key: 'red', label: 'Red alliance', val: (m) => list(al(m, 'red')), html: (m) => `<span class="dot red"></span>${list(al(m, 'red'))}` },
        { key: 'rs', label: 'Red', num: true, val: (m) => al(m, 'red')?.score, html: (m) => { const r = al(m, 'red').score, b = al(m, 'blue').score; return r > b ? `<b>${r}</b>` : r; } },
        { key: 'bs', label: 'Blue', num: true, val: (m) => al(m, 'blue')?.score, html: (m) => { const r = al(m, 'red').score, b = al(m, 'blue').score; return b > r ? `<b>${b}</b>` : b; } },
        { key: 'blue', label: 'Blue alliance', val: (m) => list(al(m, 'blue')), html: (m) => `<span class="dot blue"></span>${list(al(m, 'blue'))}` },
      ], allMatches, { sortKey: 'name', asc: true, empty: 'No matches posted yet.' });
    } else if (id === 'aw') {
      aside.textContent = `${awards.length} awards`;
      body.innerHTML = awards.length ? `<div class="rows">${awards.slice().sort((a, b) => a.order - b.order).map((a) => `<div><div class="k"><b>${esc(a.title)}</b>${a.qualifications?.length ? `<small>Qualifies for ${a.qualifications.map(esc).join(', ')}</small>` : ''}</div><div>${(a.teamWinners || []).map((w) => teamLink(w.team.name)).join(', ') || '<span class="muted">TBD</span>'}</div></div>`).join('')}</div>` : '<div class="empty">No awards posted yet.</div>';
    }
  });
}

const prescoutCache = new Map();
function renderPrescout(body, aside, teams) {
  const key = state.seasonId + ':' + teams.map((t) => t.id).join(',');
  const draw = (rows) => {
    aside.textContent = `Season to date · ${rows.length} teams`;
    sortableTable(body, [
      { key: 'num', label: 'Team', val: (r) => r.team.number, html: (r) => teamLink(r.team.number) + (note(r.team.number).starred ? ' <span class="stars">★</span>' : '') },
      { key: 'name', label: 'Name', val: (r) => r.team.team_name },
      { key: 'loc', label: 'Region', val: (r) => r.team.location?.region || r.team.location?.country || '' },
      { key: 'ev', label: 'Events', num: true, val: (r) => r.eventsAttended },
      { key: 'rec', label: 'W-L-T', val: (r) => r.winRate, html: (r) => `${r.w}-${r.l}-${r.t}` },
      { key: 'wr', label: 'Win %', num: true, val: (r) => r.winRate, html: (r) => pct(r.winRate) },
      { key: 'avg', label: 'Avg pts', num: true, val: (r) => r.avg, html: (r) => fmt1(r.avg) },
      { key: 'margin', label: 'Margin', num: true, val: (r) => r.margin, html: (r) => fmt1(r.margin) },
      { key: 'rank', label: 'Avg rank', num: true, val: (r) => r.avgRank, html: (r) => fmt1(r.avgRank) },
      { key: 'skills', label: 'Best skills', num: true, val: (r) => r.bestSkills || null },
      { key: 'awards', label: 'Awards', num: true, val: (r) => r.awards.length },
      { key: 'my', label: 'My rating', val: (r) => note(r.team.number).rating || null, html: (r) => ratingStars(note(r.team.number).rating) },
    ], rows, { sortKey: 'skills' });
  };
  if (prescoutCache.has(key)) return draw(prescoutCache.get(key));
  body.innerHTML = `<div class="card-b"><p style="margin-top:0">Load season stats for all ${teams.length} registered teams: record, average score, best skills, awards and average rank. This makes several requests per team, so the first load can take a minute.</p>
    <button class="btn primary" id="psGo">Load season stats</button> <span class="muted" id="psProg" style="margin-left:8px"></span>
    <div class="progress"><i id="psBar"></i></div></div>`;
  body.querySelector('#psGo').addEventListener('click', async (e) => {
    e.target.disabled = true;
    let done = 0;
    try {
      const rows = await pool(teams, 3, async (t) => {
        const d = await loadTeamSeason(t.id, state.seasonId);
        done++;
        const p = document.getElementById('psProg'), b = document.getElementById('psBar');
        if (p) p.textContent = `${done} of ${teams.length}`;
        if (b) b.style.width = `${(done / teams.length) * 100}%`;
        return summarize(t, d);
      });
      prescoutCache.set(key, rows);
      if (body.isConnected) draw(rows);
    } catch (err) { body.insertAdjacentHTML('afterbegin', `<div class="error" style="margin:14px">${esc(err.message)}</div>`); e.target.disabled = false; }
  });
}

// ---------------------------------------------------------------- views: watchlist & compare
function renderWatchlist() {
  const list = Object.entries(state.notes).filter(([, n]) => n.starred || n.rating || n.text || n.tags?.length).map(([num, n]) => ({ num, ...n }));
  const starred = list.filter((x) => x.starred).slice(0, 6).map((x) => x.num);
  setChrome({
    nav: 'watchlist', crumbs: [{ icon: 'star', label: 'Watchlist' }],
    actions: list.length ? `${starred.length ? `<a class="btn" href="#/compare?teams=${encodeURIComponent(starred.join(','))}">${icon('columns')}<span class="lbl">Compare starred</span></a>` : ''}<button class="btn" id="csv">${icon('download')}<span class="lbl">Export CSV</span></button>` : '',
  });
  app.innerHTML = `<div class="ph"><div><h1>Watchlist</h1><div class="meta"><span>Every team you've starred, rated or written notes about</span></div></div></div>
    <div class="grid">${card({ cls: 'c12', title: 'Teams', aside: `${list.length}`, bodyCls: 'flush', body: '<div id="wl"></div>' })}</div>`;
  sortableTable(document.getElementById('wl'), [
    { key: 'num', label: 'Team', html: (r) => teamLink(r.num) },
    { key: 'starred', label: 'Watching', val: (r) => (r.starred ? 1 : 0), html: (r) => (r.starred ? '<span class="stars">★</span>' : '') },
    { key: 'rating', label: 'Rating', html: (r) => ratingStars(r.rating) },
    { key: 'tags', label: 'Tags', wrap: true, val: (r) => r.tags?.length || 0, html: (r) => tagChips(r.tags) },
    { key: 'text', label: 'Notes', wrap: true, html: (r) => esc((r.text || '').slice(0, 160)) + ((r.text || '').length > 160 ? '…' : '') },
    { key: 'updated', label: 'Updated', val: (r) => r.updated || '', html: (r) => `<span class="muted">${relTime(r.updated)}</span>` },
  ], list, { sortKey: 'rating', empty: 'Star or rate teams from their page to track them here.' });
  document.getElementById('csv')?.addEventListener('click', () => {
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const csv = ['team,watching,rating,tags,notes,updated', ...list.map((r) => [r.num, r.starred ? 'yes' : '', r.rating || '', (r.tags || []).join('; '), r.text, r.updated].map(q).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'v5rc-scouting-notes.csv'; a.click();
  });
}

async function renderCompare(query) {
  const nums = (new URLSearchParams(query).get('teams') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  setChrome({ nav: 'compare', crumbs: [{ icon: 'columns', label: 'Compare' }] });
  app.innerHTML = `<div class="ph"><div><h1>Compare teams</h1><div class="meta"><span>${esc(seasonName())} season · up to 6 teams</span></div></div></div>
    <div class="grid">
      ${card({ cls: 'c12', title: 'Teams', body: `<form class="hero-search" id="cmpForm"><input class="input" id="cmpInput" placeholder="Team numbers, comma separated: 1234A, 5678B" value="${esc(nums.join(', '))}" aria-label="Teams to compare"/><button class="btn primary">Compare</button></form>` })}
      <div class="c12" id="cmpOut"></div>
    </div>`;
  document.getElementById('cmpForm').addEventListener('submit', (e) => {
    e.preventDefault();
    location.hash = '#/compare?teams=' + encodeURIComponent(document.getElementById('cmpInput').value.replace(/\s+/g, ''));
  });
  if (!nums.length) return;
  const out = document.getElementById('cmpOut');
  out.innerHTML = '<div class="loading">Loading teams…</div>';
  const sums = await Promise.all(nums.slice(0, 6).map(async (n) => {
    const t = await findTeam(n);
    return t ? summarize(t, await loadTeamSeason(t.id, state.seasonId)) : { missing: n };
  }));
  const ok = sums.filter((s) => !s.missing);
  const metrics = [
    ['Win rate', (s) => s.winRate, pct, 'max'],
    ['Record', () => null, (_, s) => `${s.w}-${s.l}-${s.t}`],
    ['Matches played', (s) => s.played, fmt0],
    ['Average score', (s) => s.avg, fmt1, 'max'],
    ['Opponent average', (s) => s.avgOpp, fmt1, 'min'],
    ['Average margin', (s) => s.margin, fmt1, 'max'],
    ['High score', (s) => (s.played ? s.high : null), fmt0, 'max'],
    ['Best skills', (s) => s.bestSkills || null, fmt0, 'max'],
    ['Best driver skills', (s) => s.bestDriver || null, fmt0, 'max'],
    ['Best autonomous skills', (s) => s.bestProg || null, fmt0, 'max'],
    ['Average event rank', (s) => s.avgRank, fmt1, 'min'],
    ['Best event rank', (s) => s.bestRank, fmt0, 'min'],
    ['Events attended', (s) => s.eventsAttended, fmt0],
    ['Awards', (s) => s.awards.length, fmt0, 'max'],
  ];
  out.innerHTML = `${sums.filter((s) => s.missing).map((s) => `<div class="error">Team ${esc(s.missing)} not found.</div>`).join('')}
    ${card({ title: 'Side by side', aside: 'Green marks the best value in each row', bodyCls: 'flush', body: `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th>${ok.map((s) => `<th class="num">${teamLink(s.team.number)}<div class="sub" style="font-weight:400">${esc(s.team.team_name)}</div></th>`).join('')}</tr></thead><tbody>
      ${metrics.map(([label, get, f, best]) => {
        const vals = ok.map(get), valid = vals.filter((v) => v != null);
        const target = best && valid.length > 1 ? (best === 'max' ? Math.max(...valid) : Math.min(...valid)) : null;
        return `<tr><td class="sub">${label}</td>${ok.map((s, i) => `<td class="num ${target != null && vals[i] === target ? 'best' : ''}">${f(vals[i], s)}</td>`).join('')}</tr>`;
      }).join('')}
      <tr><td class="sub">My rating</td>${ok.map((s) => `<td class="num">${ratingStars(note(s.team.number).rating)}</td>`).join('')}</tr>
      <tr><td class="sub">Tags</td>${ok.map((s) => `<td class="num wrap">${tagChips(note(s.team.number).tags)}</td>`).join('')}</tr>
    </tbody></table></div>` })}`;
}

// ---------------------------------------------------------------- router & boot
function go(v) {
  v = String(v || '').trim();
  if (!v) return;
  location.hash = /^RE-/i.test(v) ? `#/event/${encodeURIComponent(v.toUpperCase())}` : `#/team/${encodeURIComponent(v.toUpperCase())}`;
}

function showError(e) {
  if (e instanceof ApiError && e.status === 401) return renderSetup(e.message === 'no_token' ? '' : e.message);
  if (e instanceof ApiError && e.status === 429) { app.innerHTML = `<div class="error">Too many requests right now. Wait a minute and try again.</div>`; return; }
  app.innerHTML = `<div class="error">${esc(e.message || e)}</div>`;
}

async function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [pathPart, query = ''] = h.split('?');
  const [view, arg] = pathPart.split('/');
  closeMenu();
  window.scrollTo(0, 0);
  try {
    if (view === 'team' && arg) await renderTeam(decodeURIComponent(arg));
    else if (view === 'event' && arg) await renderEvent(decodeURIComponent(arg));
    else if (view === 'watchlist') renderWatchlist();
    else if (view === 'compare') await renderCompare(query);
    else if (view === 'settings') renderSettings();
    else renderHome();
  } catch (e) { showError(e); }
}

const side = document.getElementById('side'), scrim = document.getElementById('scrim');
function closeMenu() { side.classList.remove('open'); scrim.classList.remove('open'); }
document.getElementById('menuBtn').addEventListener('click', () => { side.classList.add('open'); scrim.classList.add('open'); });
scrim.addEventListener('click', closeMenu);

document.getElementById('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('searchInput');
  go(input.value); input.value = ''; input.blur();
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); document.getElementById('searchInput').focus(); }
});
document.getElementById('seasonSelect').addEventListener('change', (e) => {
  state.seasonId = Number(e.target.value);
  ls.set('seasonId', state.seasonId);
  route();
});

async function boot() {
  try {
    state.server = { ...state.server, ...(await fetch('/local/status').then((r) => r.json())) };
    if (!state.server.hasToken) return renderSetup();
    await loadNotes();
    renderSide();
    const programs = await apiAll('/programs').catch(() => []);
    const v5 = programs.find((p) => /^(V5RC|VRC)$/i.test(p.abbr || p.code || '')) || programs.find((p) => /V5 Robotics Competition/i.test(p.name || ''));
    if (v5) PROGRAM_V5RC = v5.id;
    const seasons = await apiAll(`/seasons?program[]=${PROGRAM_V5RC}`);
    state.seasons = seasons.sort((a, b) => new Date(b.start) - new Date(a.start));
    const now = Date.now();
    const current = state.seasons.find((s) => new Date(s.start) <= now && new Date(s.end) >= now) ||
      state.seasons.find((s) => new Date(s.start) <= now) || state.seasons[0];
    const saved = ls.get('seasonId', null);
    state.seasonId = state.seasons.some((s) => s.id === saved) ? saved : current?.id;
    document.getElementById('seasonSelect').innerHTML = state.seasons.slice(0, 8)
      .map((s) => `<option value="${s.id}" ${s.id === state.seasonId ? 'selected' : ''}>${esc(shortSeason(s.name).split(':')[0])}</option>`).join('');
    window.onhashchange = route;
    route();
  } catch (e) { showError(e); }
}
boot();
