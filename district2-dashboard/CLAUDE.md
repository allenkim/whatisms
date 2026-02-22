# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NYC Council District 2 Intelligence Dashboard — a local-only web app for real-time situational awareness (fire, crime, 311, HPD violations, news) for the Lower East Side, East Village, Greenwich Village, and surrounding neighborhoods. Council Member: Harvey Epstein.

## Running the Application

```bash
cd district2-dashboard
python3 -m venv venv && source venv/bin/activate
pip install -r backend/requirements.txt
export NYC_OPENDATA_APP_TOKEN=your_token_here  # optional, for higher rate limits
python backend/app.py                          # serves at http://127.0.0.1:8050
```

There is no build step, test suite, or linter configured. The frontend is vanilla JS served as static files.

## Deployment

The app is hosted on the same machine where development happens (whatisms.com). Deploy with:

```bash
cd district2-dashboard
docker compose build && docker compose up -d
```

- `Dockerfile` — Python 3.12-slim, installs requirements, copies backend + frontend, runs as non-root `appuser`
- `docker-compose.yml` — Two services: `app` (FastAPI on 8050) + `caddy` (reverse proxy on 80/443)
- Caddy handles TLS and gzip; auth is handled by FastAPI (not Caddy)
- Persistent volumes: `app-data` (SQLite DB), `caddy-data`, `caddy-config`
- Healthcheck: `GET /api/status` (public endpoint, no auth required)

## Architecture

**Backend** (`district2-dashboard/backend/`): Python FastAPI (async) with SQLite (WAL mode).

- `app.py` — FastAPI routes, auth middleware, and lifespan (startup: init DB → check backfill → start scheduler)
- `auth.py` — Session-based authentication, user/project CRUD, bcrypt password hashing
- `config.py` — All constants: dataset IDs, neighborhoods, ZIP codes, schedule intervals, feed URLs
- `db.py` — SQLite schema (12 tables including auth), `init_db()`, `query()`, `execute()` helpers
- `scheduler.py` — APScheduler `AsyncIOScheduler` with 12 periodic jobs (5–1440 min intervals). Jobs wrapped in `_safe_run()` for error isolation.
- `services/events.py` — Fetches FDNY, NYPD, 311, Notify NYC alerts, DOB complaints from Socrata SODA API
- `services/complaints.py` — 311/911 aggregation queries (top issues, trends, summaries)
- `services/hpd.py` — HPD violations, complaints, landlord offender rankings, building drill-down
- `services/news.py` — Google News RSS, hyperlocal RSS (EV Grieve, The Lo-Down, etc.), NYC Council Legistar API
- `services/social.py` — Social media embed config

**Frontend** (`district2-dashboard/frontend/`): Vanilla HTML/CSS/JS, no framework or bundler.

- `index.html` — SPA with 4 tabs (Event Map | 311 & 911 | Harvey Epstein | HPD Violations), served at `/district2`
- `pages/login.html` — Login page (public, inline CSS)
- `pages/portal.html` — Project portal with password change modal, served at `/`
- `pages/admin.html` — Admin panel for user/project management, served at `/admin`
- `js/map.js` — Leaflet.js interactive map with event markers and district boundary overlay
- `js/complaints.js` — Chart.js visualizations for 311/911 data
- `js/epstein-feed.js` — News and social media feed rendering
- `js/hpd.js` — HPD violations charts and tables
- `css/style.css` — Dark theme using CSS variables

**Database**: SQLite at `district2-dashboard/data/district2.db` (auto-created on first run, gitignored).

**Auth**: Session-based (httponly cookies). Default admin: `allen`/`allen1729` (seeded on first run). Admins see all projects; regular users need explicit project assignment via `user_projects` table.

## Key Patterns

- **All backend code is async**: `async def` + `await` for DB ops (`aiosqlite`), HTTP calls (`httpx.AsyncClient`), and scheduling
- **Data ingestion uses upserts**: `ON CONFLICT DO UPDATE` for idempotent refreshes from Socrata APIs
- **No ORM**: Raw SQL throughout `db.py` and service modules
- **Geospatial filtering**: Shapely used in `events.py` to filter data points to District 2 boundaries
- **Socrata SODA API**: All NYC Open Data accessed via `{NYC_OPENDATA_BASE}/{dataset_id}.json` with SoQL query params. Dataset IDs are in `config.py:DATASETS`

## URL Structure

- `/login` — Login page (public)
- `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/password` — Auth API
- `/` — Project portal (authenticated)
- `/district2` — District 2 dashboard (authenticated + project access)
- `/admin` — Admin panel (admin role only)
- `/admin/api/users`, `/admin/api/projects` — Admin CRUD API
- `/static/*` — Frontend static files (authenticated)
- `/api/status` — Health check (public)
- `/api/events`, `/api/complaints/*`, `/api/epstein/*`, `/api/news/*`, `/api/hpd/*` — Data APIs (authenticated)

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `NYC_OPENDATA_APP_TOKEN` | (none) | Socrata API token for higher rate limits |
| `PORT` | `8050` | Server port |
| `BACKFILL_MONTHS` | `12` | Historical data to load on first empty-DB startup |
