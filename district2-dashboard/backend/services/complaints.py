"""311 and 911 complaint analysis service."""

import json
import logging
from datetime import datetime, timedelta

import httpx

from config import (
    COUNCIL_DISTRICT,
    DATASETS,
    NYC_OPENDATA_BASE,
    SOCRATA_HEADERS,
    SOCRATA_PAGE_SIZE,
)
from db import query, upsert_many

logger = logging.getLogger(__name__)


def _socrata_url(dataset_id: str) -> str:
    return f"{NYC_OPENDATA_BASE}/{dataset_id}.json"


def _float(val) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


async def fetch_311_complaints(since_hours: int = 24) -> int:
    """Fetch 311 complaints for District 2 into the complaints_311 table."""
    since = (datetime.utcnow() - timedelta(hours=since_hours)).isoformat()
    url = _socrata_url(DATASETS["311_requests"])
    params = {
        "$where": f"council_district={COUNCIL_DISTRICT} AND created_date > '{since}'",
        "$order": "created_date DESC",
        "$limit": SOCRATA_PAGE_SIZE,
    }

    async with httpx.AsyncClient(headers=SOCRATA_HEADERS, timeout=30) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    rows = []
    for r in data:
        unique_key = r.get("unique_key", "")
        if not unique_key:
            continue
        rows.append({
            "unique_key": unique_key,
            "created_date": r.get("created_date", ""),
            "closed_date": r.get("closed_date"),
            "agency": r.get("agency"),
            "complaint_type": r.get("complaint_type"),
            "descriptor": r.get("descriptor"),
            "location_type": r.get("location_type"),
            "incident_zip": r.get("incident_zip"),
            "address": r.get("incident_address"),
            "city": r.get("city"),
            "status": r.get("status"),
            "resolution_description": r.get("resolution_description"),
            "latitude": _float(r.get("latitude")),
            "longitude": _float(r.get("longitude")),
            "raw_data": json.dumps(r),
        })

    count = await upsert_many("complaints_311", rows, conflict_column="unique_key")
    logger.info(f"311 complaints: fetched {count}")
    return count


async def fetch_911_calls(since_hours: int = 24) -> int:
    """Fetch 911 calls for service near District 2."""
    since = (datetime.utcnow() - timedelta(hours=since_hours)).strftime("%Y-%m-%dT00:00:00")
    url = _socrata_url(DATASETS["nypd_calls_ytd"])

    # District 2 bounding box
    params = {
        "$where": (
            f"create_date > '{since}' AND "
            f"latitude > 40.715 AND latitude < 40.748 AND "
            f"longitude > -74.003 AND longitude < -73.970"
        ),
        "$order": "create_date DESC",
        "$limit": SOCRATA_PAGE_SIZE,
    }

    async with httpx.AsyncClient(headers=SOCRATA_HEADERS, timeout=30) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    rows = []
    for r in data:
        cad_id = r.get("cad_evnt_id", "")
        if not cad_id:
            continue
        rows.append({
            "id": f"911_{cad_id}",
            "incident_date": r.get("incident_date"),
            "incident_time": r.get("incident_time"),
            "call_type": r.get("typ_desc"),
            "borough": r.get("boro_nm"),
            "precinct": r.get("nypd_pct_cd"),
            "latitude": _float(r.get("latitude")),
            "longitude": _float(r.get("longitude")),
            "dispatch_ts": r.get("disp_ts"),
            "arrival_ts": r.get("arrivd_ts"),
            "closing_ts": r.get("closng_ts"),
            "raw_data": json.dumps(r),
        })

    count = await upsert_many("calls_911", rows)
    logger.info(f"911 calls: fetched {count}")
    return count


async def get_311_top_issues(period: str = "monthly", limit: int = 15) -> list[dict]:
    """Get top 311 complaint types for a given period."""
    if period == "daily":
        since = (datetime.utcnow() - timedelta(days=1)).isoformat()
    elif period == "weekly":
        since = (datetime.utcnow() - timedelta(weeks=1)).isoformat()
    else:
        since = (datetime.utcnow() - timedelta(days=30)).isoformat()

    return await query(
        """
        SELECT complaint_type, COUNT(*) as count
        FROM complaints_311
        WHERE created_date > ?
        GROUP BY complaint_type
        ORDER BY count DESC
        LIMIT ?
        """,
        (since, limit),
    )


async def get_311_trend(complaint_type: str | None = None, months: int = 6) -> list[dict]:
    """Get daily complaint counts for trend charting."""
    since = (datetime.utcnow() - timedelta(days=months * 30)).isoformat()
    if complaint_type:
        return await query(
            """
            SELECT date(created_date) as date, COUNT(*) as count
            FROM complaints_311
            WHERE created_date > ? AND complaint_type = ?
            GROUP BY date(created_date)
            ORDER BY date
            """,
            (since, complaint_type),
        )
    return await query(
        """
        SELECT date(created_date) as date, COUNT(*) as count
        FROM complaints_311
        WHERE created_date > ?
        GROUP BY date(created_date)
        ORDER BY date
        """,
        (since,),
    )


async def get_911_type_breakdown(period: str = "monthly") -> list[dict]:
    """Get 911 call type distribution."""
    if period == "daily":
        since = (datetime.utcnow() - timedelta(days=1)).isoformat()
    elif period == "weekly":
        since = (datetime.utcnow() - timedelta(weeks=1)).isoformat()
    else:
        since = (datetime.utcnow() - timedelta(days=30)).isoformat()

    return await query(
        """
        SELECT call_type, COUNT(*) as count
        FROM calls_911
        WHERE incident_date > ?
        GROUP BY call_type
        ORDER BY count DESC
        LIMIT 20
        """,
        (since,),
    )


async def compute_aggregations():
    """Compute daily/weekly/monthly aggregation rollups for 311 and 911 data."""
    logger.info("Computing complaint aggregations...")

    # Daily 311 aggregations for the last 30 days
    for days_ago in range(30):
        day = (datetime.utcnow() - timedelta(days=days_ago)).strftime("%Y-%m-%d")
        day_next = (datetime.utcnow() - timedelta(days=days_ago - 1)).strftime("%Y-%m-%d")

        results = await query(
            """
            SELECT complaint_type, COUNT(*) as count
            FROM complaints_311
            WHERE date(created_date) = ?
            GROUP BY complaint_type
            """,
            (day,),
        )

        agg_rows = []
        for r in results:
            agg_rows.append({
                "data_source": "311",
                "period_type": "daily",
                "period_start": day,
                "period_end": day_next,
                "category": r["complaint_type"],
                "count": r["count"],
            })

        if agg_rows:
            from db import get_db
            db = await get_db()
            try:
                for row in agg_rows:
                    await db.execute(
                        """
                        INSERT INTO aggregations (data_source, period_type, period_start, period_end, category, count)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(data_source, period_type, period_start, category)
                        DO UPDATE SET count = excluded.count, computed_at = datetime('now')
                        """,
                        (row["data_source"], row["period_type"], row["period_start"],
                         row["period_end"], row["category"], row["count"]),
                    )
                await db.commit()
            finally:
                await db.close()

    logger.info("Aggregations computed")


async def get_complaint_summary(period: str = "monthly") -> dict:
    """Get summary stats for the dashboard."""
    if period == "daily":
        since = (datetime.utcnow() - timedelta(days=1)).isoformat()
        prev_since = (datetime.utcnow() - timedelta(days=2)).isoformat()
    elif period == "weekly":
        since = (datetime.utcnow() - timedelta(weeks=1)).isoformat()
        prev_since = (datetime.utcnow() - timedelta(weeks=2)).isoformat()
    else:
        since = (datetime.utcnow() - timedelta(days=30)).isoformat()
        prev_since = (datetime.utcnow() - timedelta(days=60)).isoformat()

    current = await query(
        "SELECT COUNT(*) as count FROM complaints_311 WHERE created_date > ?",
        (since,),
    )
    previous = await query(
        "SELECT COUNT(*) as count FROM complaints_311 WHERE created_date > ? AND created_date <= ?",
        (prev_since, since),
    )

    current_count = current[0]["count"] if current else 0
    prev_count = previous[0]["count"] if previous else 0
    pct_change = (
        round((current_count - prev_count) / prev_count * 100, 1)
        if prev_count > 0
        else 0
    )

    return {
        "total_311": current_count,
        "prev_311": prev_count,
        "pct_change_311": pct_change,
        "period": period,
    }
