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

## Architecture

**Backend** (`district2-dashboard/backend/`): Python FastAPI (async) with SQLite (WAL mode).

- `app.py` — FastAPI routes and lifespan (startup: init DB → check backfill → start scheduler)
- `config.py` — All constants: dataset IDs, neighborhoods, ZIP codes, schedule intervals, feed URLs
- `db.py` — SQLite schema (8 tables), `init_db()`, `query()`, `execute()` helpers
- `scheduler.py` — APScheduler `AsyncIOScheduler` with 11 periodic jobs (5–1440 min intervals). Jobs wrapped in `_safe_run()` for error isolation.
- `services/events.py` — Fetches FDNY, NYPD, 311, Notify NYC alerts, DOB complaints from Socrata SODA API
- `services/complaints.py` — 311/911 aggregation queries (top issues, trends, summaries)
- `services/hpd.py` — HPD violations, complaints, landlord offender rankings, building drill-down
- `services/news.py` — Google News RSS, hyperlocal RSS (EV Grieve, The Lo-Down, etc.), NYC Council Legistar API
- `services/social.py` — Social media embed config

**Frontend** (`district2-dashboard/frontend/`): Vanilla HTML/CSS/JS, no framework or bundler.

- `index.html` — SPA with 4 tabs (Event Map | 311 & 911 | Harvey Epstein | HPD Violations)
- `js/map.js` — Leaflet.js interactive map with event markers and district boundary overlay
- `js/complaints.js` — Chart.js visualizations for 311/911 data
- `js/epstein-feed.js` — News and social media feed rendering
- `js/hpd.js` — HPD violations charts and tables
- `css/style.css` — Dark theme using CSS variables

**Database**: SQLite at `district2-dashboard/data/district2.db` (auto-created on first run, gitignored).

## Key Patterns

- **All backend code is async**: `async def` + `await` for DB ops (`aiosqlite`), HTTP calls (`httpx.AsyncClient`), and scheduling
- **Data ingestion uses upserts**: `ON CONFLICT DO UPDATE` for idempotent refreshes from Socrata APIs
- **No ORM**: Raw SQL throughout `db.py` and service modules
- **Geospatial filtering**: Shapely used in `events.py` to filter data points to District 2 boundaries
- **Socrata SODA API**: All NYC Open Data accessed via `{NYC_OPENDATA_BASE}/{dataset_id}.json` with SoQL query params. Dataset IDs are in `config.py:DATASETS`

## API Routes

All routes defined in `app.py`. Key prefixes:
- `/api/events` — Map event data
- `/api/complaints/311/*`, `/api/complaints/911/*` — Complaint analysis
- `/api/epstein/*`, `/api/news/*` — News feeds
- `/api/hpd/*` — Housing violations
- `/api/status` — Health check with table row counts
- `/api/district/boundary` — GeoJSON for District 2

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `NYC_OPENDATA_APP_TOKEN` | (none) | Socrata API token for higher rate limits |
| `PORT` | `8050` | Server port |
| `BACKFILL_MONTHS` | `12` | Historical data to load on first empty-DB startup |
