# KScout

A local scouting app for the VEX V5 Robotics Competition, powered by the official VEX Events API (formerly RobotEvents, which moved to events.vex.com in 2026).

## Run it

Requires Node 18+ (no `npm install` needed).

```bash
node server.js
```

Open http://localhost:5173. The first time, the app asks for a VEX Events API token:

1. Sign in (or create an account) at https://events.vex.com
2. Open https://events.vex.com/api/v2 and click **Request Access** (form: https://events.vex.com/api/v2/accessRequest/create). Approval may take a while.
3. Once approved, create an access token and paste it into the app. It's saved to `.env` in this folder (you can also set `ROBOTEVENTS_TOKEN` yourself).

## What's in it

- **Team page** — season record (overall / quals / elims), win rate, average & high score, margin, best skills (driver / auton / combined), average & best event rank, award count, a score-per-match trend chart, and tabs for events (rank, WP/AP/SP, awards, skills at each), full match history, skills runs and awards.
- **Event page** (search a SKU like `RE-V5RC-26-1234`) — rankings per division with computed **OPR / DPR / CCWM**, skills standings, match results, awards, and **Pre-scout teams**: season-to-date stats for every registered team, sortable, so you can scout an event before it starts.
- **Compare** — up to 6 teams side by side, best value per row highlighted.
- **Watchlist & notes** — star teams, rate 1–5, tag them (strong auton, good defense, alliance pick…), write notes. Saved to `data/notes.json`; export to CSV.
- **Season picker** in the header to look at past seasons.

API responses are cached (5 minutes locally, 15 minutes on a public site); rate-limit responses from VEX Events are retried automatically.

## Put it online

The app needs a host that runs Node (Render, Railway, Fly.io and similar), not a static-page host.

1. Push this folder to a GitHub repository. `.gitignore` already keeps `.env` (your token) and `data/` (your notes) out of it.
2. On your host, create a **Web Service** from the repository. Start command: `node server.js`. No build step.
3. Set these **environment variables** in the host's dashboard (never in a file you commit):

| Variable | Value | What it does |
|---|---|---|
| `PUBLIC_SITE` | `1` | Turns on hosted mode: accepts outside connections, turns off the in-app token form, and protects notes. |
| `ROBOTEVENTS_TOKEN` | your VEX Events token | Used by the server only; visitors never see it and can't change it. |
| `TEAM_PASSWORD` | a long password (10+ characters) | Optional. Turns on shared team notes that only people with the password can read or edit. Without it, each visitor's notes stay in their own browser. |
| `DATA_DIR` | a path on a persistent disk, e.g. `/var/data` | Where shared team notes are saved. Without a persistent disk, most hosts erase saved files on every restart or deploy. |

The host sets `PORT` itself. A health check is available at `/healthz`.

### How notes work on a public site

- **With `TEAM_PASSWORD`:** teammates open **Settings → Team sign-in** and enter the password once per browser (it lasts 30 days). Notes are then shared. Notes written before signing in are added to the team's notes at sign-in. Change the password to sign everyone out.
- **Without it:** notes are saved only in each visitor's browser. Nobody else can see or change them.
- **Either way:** use **Settings → Download backup** now and then. **Restore backup** merges a backup back in, keeping whichever version of each note is newer.

### Protections built in

- Password guessing is limited to 5 tries per minute per visitor; sign-in uses a signed, HttpOnly cookie.
- Notes can't be written from other websites, and incoming notes are checked and trimmed before saving.
- Each visitor is limited to 600 API requests a minute (`API_REQS_PER_MIN` to change). Identical requests share one call to VEX Events, and the cache holds up to 3,000 responses.
- Basic security headers are sent (`nosniff`, no framing, same-origin referrer, and HSTS when served over HTTPS).

### Before going public

Every visitor's lookups use **your** VEX Events token. Check the terms you agreed to when requesting API access, and whether they allow a public site built on it. If you only want your own team using it, keep `TEAM_PASSWORD` set and don't share the link widely.

## Running locally (default)

Without `PUBLIC_SITE`, the server listens only on your own computer (`127.0.0.1`), notes are saved to `data/notes.json`, and you can paste a token in **Settings**.
