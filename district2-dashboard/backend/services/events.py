"""Fetches FDNY fire incidents and NYPD crime data for District 2."""

import hashlib
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
from db import upsert_many

logger = logging.getLogger(__name__)


def _socrata_url(dataset_id: str) -> str:
    return f"{NYC_OPENDATA_BASE}/{dataset_id}.json"


def _severity_from_alarm(level: str | None) -> str:
    if not level:
        return "medium"
    try:
        n = int(level)
        if n >= 3:
            return "critical"
        if n >= 2:
            return "high"
        return "medium"
    except ValueError:
        return "medium"


def _crime_severity(law_cat: str | None) -> str:
    if not law_cat:
        return "medium"
    law_cat = law_cat.upper()
    if "FELONY" in law_cat:
        return "high"
    if "MISDEMEANOR" in law_cat:
        return "medium"
    return "low"


async def fetch_fdny_incidents(since_hours: int = 24) -> int:
    """Fetch recent FDNY fire incidents for District 2."""
    since = (datetime.utcnow() - timedelta(hours=since_hours)).isoformat()
    url = _socrata_url(DATASETS["fdny_incidents"])
    params = {
        "$where": f"CITYCOUNCILDISTRICT='{COUNCIL_DISTRICT}' AND INCIDENT_DATETIME > '{since}'",
        "$order": "INCIDENT_DATETIME DESC",
        "$limit": SOCRATA_PAGE_SIZE,
    }

    async with httpx.AsyncClient(headers=SOCRATA_HEADERS, timeout=30) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    rows = []
    for r in data:
        incident_id = r.get("STARFIRE_INCIDENT_ID") or r.get("starfire_incident_id", "")
        if not incident_id:
            continue
        rows.append({
            "id": f"fdny_{incident_id}",
            "event_type": "fire",
            "title": r.get("INCIDENT_CLASSIFICATION") or r.get("incident_classification", "Fire Incident"),
            "description": (
                f"{r.get('INCIDENT_CLASSIFICATION_GROUP') or r.get('incident_classification_group', '')} - "
                f"Alarm Level: {r.get('HIGHEST_ALARM_LEVEL') or r.get('highest_alarm_level', 'N/A')} - "
                f"Response: {r.get('DISPATCH_RESPONSE_SECONDS_QY') or r.get('dispatch_response_seconds_qy', 'N/A')}s"
            ),
            "latitude": None,  # FDNY data doesn't include lat/lng
            "longitude": None,
            "address": r.get("ALARM_BOX_LOCATION") or r.get("alarm_box_location", ""),
            "occurred_at": r.get("INCIDENT_DATETIME") or r.get("incident_datetime", ""),
            "source_url": f"https://data.cityofnewyork.us/resource/{DATASETS['fdny_incidents']}.json?STARFIRE_INCIDENT_ID={incident_id}",
            "raw_data": json.dumps(r),
            "category": r.get("INCIDENT_CLASSIFICATION_GROUP") or r.get("incident_classification_group", ""),
            "severity": _severity_from_alarm(
                r.get("HIGHEST_ALARM_LEVEL") or r.get("highest_alarm_level")
            ),
        })

    count = await upsert_many("events", rows)
    logger.info(f"FDNY: fetched {count} incidents")
    return count


async def fetch_nypd_complaints(since_hours: int = 24) -> int:
    """Fetch recent NYPD crime complaints. Uses ZIP code filtering as proxy for District 2."""
    since = (datetime.utcnow() - timedelta(hours=since_hours)).strftime("%Y-%m-%dT00:00:00")
    zip_filter = " OR ".join(f"incident_zip='{z}'" for z in DISTRICT_ZIPS)
    url = _socrata_url(DATASETS["nypd_complaints_ytd"])
    params = {
        "$where": f"cmplnt_fr_dt > '{since}' AND ({zip_filter})",
        "$order": "cmplnt_fr_dt DESC",
        "$limit": SOCRATA_PAGE_SIZE,
    }

    # NYPD complaint data doesn't have ZIP field; use lat/lng bounding box instead
    # District 2 approximate bounds: lat 40.715-40.748, lng -74.003 to -73.970
    params = {
        "$where": (
            f"cmplnt_fr_dt > '{since}' AND "
            f"latitude > 40.715 AND latitude < 40.748 AND "
            f"longitude > -74.003 AND longitude < -73.970"
        ),
        "$order": "cmplnt_fr_dt DESC",
        "$limit": SOCRATA_PAGE_SIZE,
    }

    async with httpx.AsyncClient(headers=SOCRATA_HEADERS, timeout=30) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    rows = []
    for r in data:
        cmplnt_num = r.get("cmplnt_num", "")
        if not cmplnt_num:
            continue
        offense = r.get("ofns_desc", "Crime Incident")
        pd_desc = r.get("pd_desc", "")
        rows.append({
            "id": f"nypd_{cmplnt_num}",
            "event_type": "crime",
            "title": offense,
            "description": (
                f"{pd_desc} - {r.get('law_cat_cd', '')} - "
                f"Precinct: {r.get('addr_pct_cd', 'N/A')}"
            ),
            "latitude": _float(r.get("latitude")),
            "longitude": _float(r.get("longitude")),
            "address": r.get("prem_typ_desc", ""),
            "occurred_at": r.get("cmplnt_fr_dt", ""),
            "source_url": f"https://data.cityofnewyork.us/resource/{DATASETS['nypd_complaints_ytd']}.json?cmplnt_num={cmplnt_num}",
            "raw_data": json.dumps(r),
            "category": r.get("law_cat_cd", ""),
            "severity": _crime_severity(r.get("law_cat_cd")),
        })

    count = await upsert_many("events", rows)
    logger.info(f"NYPD: fetched {count} complaints")
    return count


async def fetch_311_events(since_hours: int = 24) -> int:
    """Fetch 311 requests and also insert them as map events."""
    since = (datetime.utcnow() - timedelta(hours=since_hours)).isoformat()
    url = _socrata_url(DATASETS["311_requests"])
    params = {
        "$where": f"council_district='{COUNCIL_DISTRICT}' AND created_date > '{since}'",
        "$order": "created_date DESC",
        "$limit": SOCRATA_PAGE_SIZE,
    }

    async with httpx.AsyncClient(headers=SOCRATA_HEADERS, timeout=30) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    event_rows = []
    complaint_rows = []
    for r in data:
        unique_key = r.get("unique_key", "")
        if not unique_key:
            continue

        complaint_type = r.get("complaint_type", "311 Complaint")
        descriptor = r.get("descriptor", "")

        event_rows.append({
            "id": f"311_{unique_key}",
            "event_type": "311",
            "title": complaint_type,
            "description": descriptor,
            "latitude": _float(r.get("latitude")),
            "longitude": _float(r.get("longitude")),
            "address": r.get("incident_address", ""),
            "occurred_at": r.get("created_date", ""),
            "source_url": f"https://portal.311.nyc.gov/check-status/?id={unique_key}",
            "raw_data": json.dumps(r),
            "category": complaint_type,
            "severity": "low",
        })

        complaint_rows.append({
            "unique_key": unique_key,
            "created_date": r.get("created_date", ""),
            "closed_date": r.get("closed_date"),
            "agency": r.get("agency"),
            "complaint_type": complaint_type,
            "descriptor": descriptor,
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

    evt_count = await upsert_many("events", event_rows)
    cmp_count = await upsert_many("complaints_311", complaint_rows, conflict_column="unique_key")
    logger.info(f"311: fetched {evt_count} events, {cmp_count} complaints")
    return evt_count


async def backfill_events(months: int = 12):
    """Backfill historical data on first run."""
    logger.info(f"Starting backfill for {months} months...")
    hours = months * 30 * 24
    await fetch_fdny_incidents(since_hours=hours)
    await fetch_nypd_complaints(since_hours=hours)
    await fetch_311_events(since_hours=hours)
    logger.info("Backfill complete")


def _float(val) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
