"""HPD violations, complaints, and landlord owner tracking for District 2."""

import json
import logging
from datetime import datetime, timedelta

import httpx

from config import (
    COUNCIL_DISTRICT,
    DATASETS,
    DISTRICT_ZIPS,
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


async def _fetch_owner_for_registration(registration_id: str) -> tuple[str | None, str | None]:
    """Look up owner name from HPD Registration Contacts."""
    if not registration_id:
        return None, None

    url = _socrata_url(DATASETS["hpd_contacts"])
    params = {
        "registrationid": registration_id,
        "$where": "type='CorporateOwner' OR type='IndividualOwner'",
        "$limit": 1,
    }

    try:
        async with httpx.AsyncClient(headers=SOCRATA_HEADERS, timeout=15) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        if data:
            contact = data[0]
            owner_type = contact.get("type", "")
            if owner_type == "CorporateOwner":
                name = contact.get("corporationname", "Unknown")
            else:
                first = contact.get("firstname", "")
                last = contact.get("lastname", "")
                name = f"{first} {last}".strip() or "Unknown"
            return name, owner_type
    except Exception as e:
        logger.debug(f"Owner lookup failed for reg {registration_id}: {e}")

    return None, None


async def _fetch_building_coords(building_id: str) -> tuple[float | None, float | None]:
    """Get lat/lng for a building from HPD Buildings dataset."""
    if not building_id:
        return None, None

    url = _socrata_url(DATASETS["hpd_buildings"])
    params = {"buildingid": building_id, "$limit": 1}

    try:
        async with httpx.AsyncClient(headers=SOCRATA_HEADERS, timeout=15) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        if data:
            return _float(data[0].get("latitude")), _float(data[0].get("longitude"))
    except Exception as e:
        logger.debug(f"Building coord lookup failed for {building_id}: {e}")

    return None, None


async def fetch_hpd_violations(since_days: int = 30) -> int:
    """Fetch HPD violations for District 2 ZIP codes."""
    since = (datetime.utcnow() - timedelta(days=since_days)).strftime("%Y-%m-%dT00:00:00")
    zip_filter = " OR ".join(f"zip='{z}'" for z in DISTRICT_ZIPS)
    url = _socrata_url(DATASETS["hpd_violations"])
    params = {
        "$where": f"({zip_filter}) AND inspectiondate > '{since}'",
        "$order": "inspectiondate DESC",
        "$limit": SOCRATA_PAGE_SIZE,
    }

    async with httpx.AsyncClient(headers=SOCRATA_HEADERS, timeout=30) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    # Batch fetch unique registration IDs for owner lookups
    reg_ids = set()
    building_ids = set()
    for r in data:
        reg_id = r.get("registrationid")
        bld_id = r.get("buildingid")
        if reg_id:
            reg_ids.add(reg_id)
        if bld_id:
            building_ids.add(bld_id)

    # Fetch owners in bulk (limit concurrent requests)
    owner_cache: dict[str, tuple[str | None, str | None]] = {}
    coord_cache: dict[str, tuple[float | None, float | None]] = {}

    # Batch owner lookups (cap at 50 to avoid rate limiting)
    for reg_id in list(reg_ids)[:50]:
        owner_cache[reg_id] = await _fetch_owner_for_registration(reg_id)

    # Batch coordinate lookups (cap at 50)
    for bld_id in list(building_ids)[:50]:
        coord_cache[bld_id] = await _fetch_building_coords(bld_id)

    rows = []
    for r in data:
        vid = r.get("violationid", "")
        if not vid:
            continue

        reg_id = r.get("registrationid", "")
        bld_id = r.get("buildingid", "")
        owner_name, owner_type = owner_cache.get(reg_id, (None, None))
        lat, lng = coord_cache.get(bld_id, (None, None))

        rows.append({
            "violation_id": vid,
            "building_id": bld_id,
            "registration_id": reg_id,
            "borough": r.get("boro", ""),
            "house_number": r.get("housenumber", ""),
            "street_name": r.get("streetname", ""),
            "zip": r.get("zip", ""),
            "apartment": r.get("apartment"),
            "story": r.get("story"),
            "block": r.get("block"),
            "lot": r.get("lot"),
            "class": r.get("class", ""),
            "inspection_date": r.get("inspectiondate"),
            "approved_date": r.get("approveddate"),
            "nov_description": r.get("novdescription"),
            "nov_issued_date": r.get("novissueddate"),
            "current_status": r.get("currentstatus"),
            "current_status_date": r.get("currentstatusdate"),
            "latitude": lat,
            "longitude": lng,
            "owner_name": owner_name,
            "owner_type": owner_type,
            "raw_data": json.dumps(r),
        })

    count = await upsert_many("hpd_violations", rows, conflict_column="violation_id")
    logger.info(f"HPD violations: fetched {count}")
    return count


async def fetch_hpd_complaints(since_days: int = 30) -> int:
    """Fetch HPD complaints for District 2."""
    since = (datetime.utcnow() - timedelta(days=since_days)).strftime("%Y-%m-%dT00:00:00")
    url = _socrata_url(DATASETS["hpd_complaints"])
    params = {
        "$where": f"council_district='{COUNCIL_DISTRICT}' AND receiveddate > '{since}'",
        "$order": "receiveddate DESC",
        "$limit": SOCRATA_PAGE_SIZE,
    }

    async with httpx.AsyncClient(headers=SOCRATA_HEADERS, timeout=30) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    rows = []
    for r in data:
        problem_id = r.get("problemid", "")
        if not problem_id:
            continue
        rows.append({
            "problem_id": problem_id,
            "complaint_id": r.get("complaintid"),
            "building_id": r.get("buildingid"),
            "borough": r.get("borough"),
            "house_number": r.get("housenumber"),
            "street_name": r.get("streetname"),
            "zip": r.get("postcode"),
            "major_category": r.get("majorcategory"),
            "minor_category": r.get("minorcategory"),
            "complaint_status": r.get("complaintstatus"),
            "complaint_status_date": r.get("complaintstatusdate"),
            "problem_status": r.get("problemstatus"),
            "problem_status_date": r.get("problemstatusdate"),
            "status_description": r.get("statusdescription"),
            "latitude": _float(r.get("latitude")),
            "longitude": _float(r.get("longitude")),
            "received_date": r.get("receiveddate"),
            "raw_data": json.dumps(r),
        })

    count = await upsert_many("hpd_complaints", rows, conflict_column="problem_id")
    logger.info(f"HPD complaints: fetched {count}")
    return count


async def get_top_offenders(limit: int = 20) -> list[dict]:
    """Rank landlords/owners by total open violations."""
    return await query(
        """
        SELECT
            owner_name,
            owner_type,
            COUNT(*) as total_violations,
            SUM(CASE WHEN class = 'C' THEN 1 ELSE 0 END) as class_c,
            SUM(CASE WHEN class = 'B' THEN 1 ELSE 0 END) as class_b,
            SUM(CASE WHEN class = 'A' THEN 1 ELSE 0 END) as class_a,
            COUNT(DISTINCT building_id) as num_buildings,
            GROUP_CONCAT(DISTINCT house_number || ' ' || street_name) as addresses
        FROM hpd_violations
        WHERE owner_name IS NOT NULL
          AND current_status != 'VIOLATION DISMISSED'
        GROUP BY owner_name
        ORDER BY total_violations DESC
        LIMIT ?
        """,
        (limit,),
    )


async def get_violation_summary(period: str = "monthly") -> dict:
    """Get violation count summary with period comparison."""
    if period == "daily":
        since = (datetime.utcnow() - timedelta(days=1)).isoformat()
        prev = (datetime.utcnow() - timedelta(days=2)).isoformat()
    elif period == "weekly":
        since = (datetime.utcnow() - timedelta(weeks=1)).isoformat()
        prev = (datetime.utcnow() - timedelta(weeks=2)).isoformat()
    else:
        since = (datetime.utcnow() - timedelta(days=30)).isoformat()
        prev = (datetime.utcnow() - timedelta(days=60)).isoformat()

    current = await query(
        "SELECT COUNT(*) as total, "
        "SUM(CASE WHEN class='C' THEN 1 ELSE 0 END) as class_c, "
        "SUM(CASE WHEN class='B' THEN 1 ELSE 0 END) as class_b, "
        "SUM(CASE WHEN class='A' THEN 1 ELSE 0 END) as class_a "
        "FROM hpd_violations WHERE inspection_date > ?",
        (since,),
    )
    previous = await query(
        "SELECT COUNT(*) as total FROM hpd_violations WHERE inspection_date > ? AND inspection_date <= ?",
        (prev, since),
    )

    curr = current[0] if current else {"total": 0, "class_c": 0, "class_b": 0, "class_a": 0}
    prev_count = previous[0]["total"] if previous else 0
    pct_change = round((curr["total"] - prev_count) / prev_count * 100, 1) if prev_count > 0 else 0

    return {
        "total": curr["total"],
        "class_a": curr["class_a"],
        "class_b": curr["class_b"],
        "class_c": curr["class_c"],
        "prev_total": prev_count,
        "pct_change": pct_change,
        "period": period,
    }


async def get_violation_trend(months: int = 6) -> list[dict]:
    """Get daily violation counts for trend charts."""
    since = (datetime.utcnow() - timedelta(days=months * 30)).isoformat()
    return await query(
        """
        SELECT date(inspection_date) as date,
               COUNT(*) as total,
               SUM(CASE WHEN class='C' THEN 1 ELSE 0 END) as class_c,
               SUM(CASE WHEN class='B' THEN 1 ELSE 0 END) as class_b,
               SUM(CASE WHEN class='A' THEN 1 ELSE 0 END) as class_a
        FROM hpd_violations
        WHERE inspection_date > ?
        GROUP BY date(inspection_date)
        ORDER BY date
        """,
        (since,),
    )


async def get_hpd_complaint_categories(period: str = "monthly") -> list[dict]:
    """Get HPD complaint major categories breakdown."""
    if period == "daily":
        since = (datetime.utcnow() - timedelta(days=1)).isoformat()
    elif period == "weekly":
        since = (datetime.utcnow() - timedelta(weeks=1)).isoformat()
    else:
        since = (datetime.utcnow() - timedelta(days=30)).isoformat()

    return await query(
        """
        SELECT major_category, COUNT(*) as count
        FROM hpd_complaints
        WHERE received_date > ?
        GROUP BY major_category
        ORDER BY count DESC
        LIMIT 20
        """,
        (since,),
    )


async def get_building_detail(building_id: str) -> dict:
    """Get all violations and complaints for a specific building."""
    violations = await query(
        """
        SELECT * FROM hpd_violations
        WHERE building_id = ?
        ORDER BY inspection_date DESC
        """,
        (building_id,),
    )
    complaints = await query(
        """
        SELECT * FROM hpd_complaints
        WHERE building_id = ?
        ORDER BY received_date DESC
        """,
        (building_id,),
    )
    return {"building_id": building_id, "violations": violations, "complaints": complaints}
