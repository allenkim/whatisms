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


async def _fetch_contacts_for_registration(registration_id: str) -> dict:
    """Look up all contact types from HPD Registration Contacts.

    Returns dict with keys: owner_name, owner_type, head_officer, officer,
    managing_agent, corporation_name.
    """
    result = {
        "owner_name": None, "owner_type": None,
        "head_officer": None, "officer": None,
        "managing_agent": None, "corporation_name": None,
    }
    if not registration_id:
        return result

    url = _socrata_url(DATASETS["hpd_contacts"])
    params = {
        "registrationid": registration_id,
        "$where": (
            "type='CorporateOwner' OR type='IndividualOwner' OR "
            "type='HeadOfficer' OR type='Officer' OR type='Agent'"
        ),
        "$limit": 10,
    }

    try:
        async with httpx.AsyncClient(headers=SOCRATA_HEADERS, timeout=15) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        for contact in data:
            ctype = contact.get("type", "")
            first = contact.get("firstname", "")
            last = contact.get("lastname", "")
            full_name = f"{first} {last}".strip() or None
            corp_name = contact.get("corporationname") or None

            if ctype == "CorporateOwner":
                result["owner_name"] = corp_name or full_name or "Unknown"
                result["owner_type"] = "CorporateOwner"
                result["corporation_name"] = corp_name
            elif ctype == "IndividualOwner" and not result["owner_name"]:
                result["owner_name"] = full_name or "Unknown"
                result["owner_type"] = "IndividualOwner"
            elif ctype == "HeadOfficer":
                result["head_officer"] = full_name
            elif ctype == "Officer":
                result["officer"] = full_name
            elif ctype == "Agent":
                result["managing_agent"] = full_name
    except Exception as e:
        logger.debug(f"Contact lookup failed for reg {registration_id}: {e}")

    return result


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

    # Fetch contacts in bulk (limit concurrent requests)
    contact_cache: dict[str, dict] = {}
    coord_cache: dict[str, tuple[float | None, float | None]] = {}

    # Batch contact lookups (cap at 200 to balance coverage vs rate limiting)
    for reg_id in list(reg_ids)[:200]:
        contact_cache[reg_id] = await _fetch_contacts_for_registration(reg_id)

    # Batch coordinate lookups (cap at 200)
    for bld_id in list(building_ids)[:200]:
        coord_cache[bld_id] = await _fetch_building_coords(bld_id)

    rows = []
    for r in data:
        vid = r.get("violationid", "")
        if not vid:
            continue

        reg_id = r.get("registrationid", "")
        bld_id = r.get("buildingid", "")
        contacts = contact_cache.get(reg_id, {})
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
            "owner_name": contacts.get("owner_name"),
            "owner_type": contacts.get("owner_type"),
            "head_officer": contacts.get("head_officer"),
            "officer": contacts.get("officer"),
            "managing_agent": contacts.get("managing_agent"),
            "corporation_name": contacts.get("corporation_name"),
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
        "$where": f"council_district={COUNCIL_DISTRICT} AND received_date > '{since}'",
        "$order": "received_date DESC",
        "$limit": SOCRATA_PAGE_SIZE,
    }

    async with httpx.AsyncClient(headers=SOCRATA_HEADERS, timeout=30) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    rows = []
    for r in data:
        problem_id = r.get("problem_id", "")
        if not problem_id:
            continue
        rows.append({
            "problem_id": problem_id,
            "complaint_id": r.get("complaint_id"),
            "building_id": r.get("building_id"),
            "borough": r.get("borough"),
            "house_number": r.get("house_number"),
            "street_name": r.get("street_name"),
            "zip": r.get("post_code"),
            "major_category": r.get("major_category"),
            "minor_category": r.get("minor_category"),
            "complaint_status": r.get("complaint_status"),
            "complaint_status_date": r.get("complaint_status_date"),
            "problem_status": r.get("problem_status"),
            "problem_status_date": r.get("problem_status_date"),
            "status_description": r.get("status_description"),
            "latitude": _float(r.get("latitude")),
            "longitude": _float(r.get("longitude")),
            "received_date": r.get("received_date"),
            "raw_data": json.dumps(r),
        })

    count = await upsert_many("hpd_complaints", rows, conflict_column="problem_id")
    logger.info(f"HPD complaints: fetched {count}")
    return count


async def get_top_offenders(
    limit: int = 20,
    from_date: str | None = None,
    to_date: str | None = None,
) -> list[dict]:
    """Rank landlords/owners by total open violations."""
    conditions = ["owner_name IS NOT NULL", "current_status != 'VIOLATION DISMISSED'"]
    params: list = []
    if from_date:
        conditions.append("inspection_date >= ?")
        params.append(from_date)
    if to_date:
        conditions.append("inspection_date <= ?")
        params.append(to_date)
    where = " AND ".join(conditions)
    params.append(limit)

    return await query(
        f"""
        SELECT
            owner_name,
            owner_type,
            COUNT(*) as total_violations,
            SUM(CASE WHEN class = 'C' THEN 1 ELSE 0 END) as class_c,
            SUM(CASE WHEN class = 'B' THEN 1 ELSE 0 END) as class_b,
            SUM(CASE WHEN class = 'A' THEN 1 ELSE 0 END) as class_a,
            COUNT(DISTINCT building_id) as num_buildings,
            GROUP_CONCAT(DISTINCT house_number || ' ' || street_name) as addresses,
            MAX(head_officer) as head_officer,
            MAX(officer) as officer,
            MAX(corporation_name) as corporation_name,
            MAX(managing_agent) as managing_agent
        FROM hpd_violations
        WHERE {where}
        GROUP BY owner_name
        ORDER BY total_violations DESC
        LIMIT ?
        """,
        tuple(params),
    )


async def get_violation_summary(
    period: str = "monthly",
    from_date: str | None = None,
    to_date: str | None = None,
) -> dict:
    """Get violation count summary with period comparison."""
    if from_date or to_date:
        # Custom date range mode
        conditions = ["1=1"]
        params: list = []
        if from_date:
            conditions.append("inspection_date >= ?")
            params.append(from_date)
        if to_date:
            conditions.append("inspection_date <= ?")
            params.append(to_date)
        where = " AND ".join(conditions)

        current = await query(
            f"SELECT COUNT(*) as total, "
            f"SUM(CASE WHEN class='C' THEN 1 ELSE 0 END) as class_c, "
            f"SUM(CASE WHEN class='B' THEN 1 ELSE 0 END) as class_b, "
            f"SUM(CASE WHEN class='A' THEN 1 ELSE 0 END) as class_a "
            f"FROM hpd_violations WHERE {where}",
            tuple(params),
        )
        curr = current[0] if current else {"total": 0, "class_c": 0, "class_b": 0, "class_a": 0}
        return {
            "total": curr["total"],
            "class_a": curr["class_a"],
            "class_b": curr["class_b"],
            "class_c": curr["class_c"],
            "prev_total": 0,
            "pct_change": 0,
            "period": "custom",
        }

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


async def get_violation_trend(
    months: int = 6,
    from_date: str | None = None,
    to_date: str | None = None,
) -> list[dict]:
    """Get daily violation counts for trend charts."""
    conditions = []
    params: list = []
    if from_date:
        conditions.append("inspection_date >= ?")
        params.append(from_date)
    if to_date:
        conditions.append("inspection_date <= ?")
        params.append(to_date)
    if not conditions:
        since = (datetime.utcnow() - timedelta(days=months * 30)).isoformat()
        conditions.append("inspection_date > ?")
        params.append(since)

    where = " AND ".join(conditions)
    return await query(
        f"""
        SELECT date(inspection_date) as date,
               COUNT(*) as total,
               SUM(CASE WHEN class='C' THEN 1 ELSE 0 END) as class_c,
               SUM(CASE WHEN class='B' THEN 1 ELSE 0 END) as class_b,
               SUM(CASE WHEN class='A' THEN 1 ELSE 0 END) as class_a
        FROM hpd_violations
        WHERE {where}
        GROUP BY date(inspection_date)
        ORDER BY date
        """,
        tuple(params),
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
