# District 2 Intelligence Dashboard

A local-only web application providing real-time situational awareness for NYC Council District 2.

## Features

- **Event Map**: Interactive Leaflet map with live fire incidents (FDNY), crime reports (NYPD), 311 complaints, and local news — color-coded and filterable
- **311 & 911 Analysis**: Complaint data with daily/weekly/monthly aggregation, top issues charts, and trend analysis
- **Harvey Epstein Feed**: Scrolling feed of the District 2 Council Member's news coverage, social media, and legislative activity
- **HPD Violations**: Housing violations tracker with severity breakdowns, landlord offender rankings, and building-level drill-down

## Data Sources

All data comes from free, public NYC Open Data APIs (Socrata SODA) and Google News RSS:

| Source | Dataset | Updates |
|---|---|---|
| FDNY Fire Incidents | `8m42-w767` | Every 15 min |
| NYPD Crime Complaints | `5uac-w243` | Every 30 min |
| 311 Service Requests | `erm2-nwe9` | Every 15 min |
| HPD Violations | `csn4-vhvf` | Every 6 hours |
| HPD Complaints | `ygpa-z7cr` | Every 6 hours |
| HPD Registration Contacts | `feu5-w2e2` | Every 6 hours |
| Google News RSS | N/A | Every 30 min |

## Setup

```bash
cd district2-dashboard

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# (Optional) Set NYC Open Data app token for higher rate limits
export NYC_OPENDATA_APP_TOKEN=your_token_here

# Run the application
python backend/app.py
```

Then open http://localhost:8050 in your browser.

## Configuration

Environment variables (all optional):

| Variable | Default | Description |
|---|---|---|
| `NYC_OPENDATA_APP_TOKEN` | (none) | Socrata app token for higher rate limits |
| `PORT` | `8050` | Port to run the server on |
| `BACKFILL_MONTHS` | `12` | Months of historical data to load on first run |

## Architecture

- **Backend**: Python + FastAPI with APScheduler for background data refresh
- **Database**: SQLite (local, persisted in `data/district2.db`)
- **Frontend**: Vanilla JS + Leaflet.js + Chart.js (no build step)
- **Runs locally only** — binds to `127.0.0.1`, not publicly accessible
