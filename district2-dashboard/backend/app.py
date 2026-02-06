"""District 2 Intelligence Dashboard — FastAPI Application."""

import asyncio
import logging
import os
import sys

# Ensure backend is on the path
sys.path.insert(0, os.path.dirname(__file__))

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Query
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from config import (
    DATASETS,
    HOST,
    NYC_OPENDATA_BASE,
    PORT,
    SOCRATA_HEADERS,
)
from db import init_db, query
from scheduler import check_needs_backfill, run_backfill, setup_scheduler
from services.complaints import (
    get_311_top_issues,
    get_311_trend,
    get_911_type_breakdown,
    get_complaint_summary,
)
from services.hpd import (
    get_building_detail,
    get_hpd_complaint_categories,
    get_top_offenders,
    get_violation_summary,
    get_violation_trend,
)
from services.news import get_district_news, get_epstein_feed
from services.social import get_social_config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    logger.info("Starting District 2 Dashboard...")
    await init_db()

    needs_backfill = await check_needs_backfill()
    setup_scheduler()

    if needs_backfill:
        logger.info("Empty database detected — starting backfill in background")
        asyncio.create_task(run_backfill())

    yield

    from scheduler import scheduler
    scheduler.shutdown(wait=False)
    logger.info("Dashboard shut down")


app = FastAPI(
    title="District 2 Intelligence Dashboard",
    version="1.0.0",
    lifespan=lifespan,
)

# Serve frontend static files
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
app.mount("/static", StaticFiles(directory=frontend_dir), name="static")


# ── Frontend ─────────────────────────────────────────────────────────────────

@app.get("/")
async def index():
    return FileResponse(os.path.join(frontend_dir, "index.html"))


# ── Event Map API ────────────────────────────────────────────────────────────

@app.get("/api/events")
async def get_events(
    days: int = Query(7, ge=1, le=365),
    event_type: str = Query(None, description="Comma-separated: fire,crime,311,news"),
):
    """Get events for the map."""
    where = f"occurred_at > datetime('now', '-{days} days')"
    if event_type:
        types = [f"'{t.strip()}'" for t in event_type.split(",")]
        where += f" AND event_type IN ({','.join(types)})"

    return await query(
        f"""
        SELECT id, event_type, title, description, latitude, longitude,
               address, occurred_at, source_url, category, severity
        FROM events
        WHERE {where}
        ORDER BY occurred_at DESC
        LIMIT 2000
        """
    )


@app.get("/api/events/history")
async def get_event_history(
    from_date: str = Query(None),
    to_date: str = Query(None),
    event_type: str = Query(None),
    limit: int = Query(500, le=5000),
):
    """Search historical events."""
    conditions = []
    params = []
    if from_date:
        conditions.append("occurred_at >= ?")
        params.append(from_date)
    if to_date:
        conditions.append("occurred_at <= ?")
        params.append(to_date)
    if event_type:
        conditions.append("event_type = ?")
        params.append(event_type)

    where = " AND ".join(conditions) if conditions else "1=1"
    params.append(limit)

    return await query(
        f"""
        SELECT id, event_type, title, description, latitude, longitude,
               address, occurred_at, source_url, category, severity
        FROM events WHERE {where}
        ORDER BY occurred_at DESC LIMIT ?
        """,
        tuple(params),
    )


# ── District Boundary ────────────────────────────────────────────────────────

@app.get("/api/district/boundary")
async def get_district_boundary():
    """Fetch District 2 GeoJSON boundary from NYC Open Data."""
    url = f"https://data.cityofnewyork.us/api/geospatial/{DATASETS['council_districts_geo']}?method=export&type=GeoJSON"
    try:
        async with httpx.AsyncClient(headers=SOCRATA_HEADERS, timeout=30) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            geojson = resp.json()

        # Filter to just District 2
        features = [
            f for f in geojson.get("features", [])
            if str(f.get("properties", {}).get("coun_dist", "")) == "2"
        ]
        geojson["features"] = features
        return geojson
    except Exception as e:
        logger.error(f"Failed to fetch district boundary: {e}")
        return {"type": "FeatureCollection", "features": []}


# ── 311 / 911 Analysis API ──────────────────────────────────────────────────

@app.get("/api/complaints/311/top-issues")
async def api_311_top_issues(
    period: str = Query("monthly", regex="^(daily|weekly|monthly)$"),
    limit: int = Query(15, le=50),
):
    return await get_311_top_issues(period, limit)


@app.get("/api/complaints/311/trend")
async def api_311_trend(
    complaint_type: str = Query(None),
    months: int = Query(6, ge=1, le=24),
):
    return await get_311_trend(complaint_type, months)


@app.get("/api/complaints/311/summary")
async def api_311_summary(
    period: str = Query("monthly", regex="^(daily|weekly|monthly)$"),
):
    return await get_complaint_summary(period)


@app.get("/api/complaints/911/breakdown")
async def api_911_breakdown(
    period: str = Query("monthly", regex="^(daily|weekly|monthly)$"),
):
    return await get_911_type_breakdown(period)


@app.get("/api/complaints/311/all")
async def api_311_all(
    limit: int = Query(200, le=2000),
    offset: int = Query(0),
    complaint_type: str = Query(None),
):
    """Raw 311 complaint data table."""
    conditions = ["1=1"]
    params = []
    if complaint_type:
        conditions.append("complaint_type = ?")
        params.append(complaint_type)

    where = " AND ".join(conditions)
    params.extend([limit, offset])

    return await query(
        f"""
        SELECT unique_key, created_date, closed_date, complaint_type, descriptor,
               address, city, status, latitude, longitude
        FROM complaints_311
        WHERE {where}
        ORDER BY created_date DESC
        LIMIT ? OFFSET ?
        """,
        tuple(params),
    )


# ── Harvey Epstein Feed API ─────────────────────────────────────────────────

@app.get("/api/epstein/feed")
async def api_epstein_feed(limit: int = Query(50, le=200)):
    return await get_epstein_feed(limit)


@app.get("/api/epstein/social")
async def api_epstein_social():
    return get_social_config()


@app.get("/api/news/district")
async def api_district_news(limit: int = Query(50, le=200)):
    return await get_district_news(limit)


# ── HPD Violations API ───────────────────────────────────────────────────────

@app.get("/api/hpd/violations/summary")
async def api_hpd_summary(
    period: str = Query("monthly", regex="^(daily|weekly|monthly)$"),
):
    return await get_violation_summary(period)


@app.get("/api/hpd/violations/trend")
async def api_hpd_trend(months: int = Query(6, ge=1, le=24)):
    return await get_violation_trend(months)


@app.get("/api/hpd/violations/offenders")
async def api_hpd_offenders(limit: int = Query(20, le=100)):
    return await get_top_offenders(limit)


@app.get("/api/hpd/complaints/categories")
async def api_hpd_complaint_cats(
    period: str = Query("monthly", regex="^(daily|weekly|monthly)$"),
):
    return await get_hpd_complaint_categories(period)


@app.get("/api/hpd/building/{building_id}")
async def api_building_detail(building_id: str):
    return await get_building_detail(building_id)


@app.get("/api/hpd/violations/all")
async def api_hpd_violations_all(
    limit: int = Query(200, le=2000),
    offset: int = Query(0),
    violation_class: str = Query(None),
):
    """Raw HPD violations data table."""
    conditions = ["1=1"]
    params = []
    if violation_class:
        conditions.append("class = ?")
        params.append(violation_class)

    where = " AND ".join(conditions)
    params.extend([limit, offset])

    return await query(
        f"""
        SELECT violation_id, building_id, borough,
               house_number || ' ' || street_name as address,
               zip, class, inspection_date, nov_description,
               current_status, current_status_date,
               owner_name, latitude, longitude
        FROM hpd_violations
        WHERE {where}
        ORDER BY inspection_date DESC
        LIMIT ? OFFSET ?
        """,
        tuple(params),
    )


# ── Status ───────────────────────────────────────────────────────────────────

@app.get("/api/status")
async def api_status():
    """Dashboard health check with data counts."""
    counts = {}
    for table in ["events", "complaints_311", "calls_911", "hpd_violations",
                   "hpd_complaints", "news_articles", "legislation"]:
        result = await query(f"SELECT COUNT(*) as cnt FROM {table}")
        counts[table] = result[0]["cnt"] if result else 0

    return {
        "status": "running",
        "data_counts": counts,
    }


if __name__ == "__main__":
    import uvicorn
    print(f"\n  District 2 Intelligence Dashboard")
    print(f"  http://{HOST}:{PORT}\n")
    uvicorn.run(
        "app:app",
        host=HOST,
        port=PORT,
        reload=False,
        log_level="info",
    )
