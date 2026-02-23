"""Fetches FDNY fire incidents, NYPD crime, Notify NYC alerts, DOB complaints, and news for District 2."""

import hashlib
import json
import logging
from datetime import datetime, timedelta

import feedparser
import httpx

from config import (
    COUNCIL_DISTRICT,
    DATASETS,
    DISTRICT_NEIGHBORHOODS,
    DISTRICT_ZIPS,
    NOTIFY_NYC_RSS,
    SOCRATA_HEADERS,
    SOCRATA_PAGE_SIZE,
)
from db import upsert_many
from services.utils import safe_float as _float, socrata_url as _socrata_url

logger = logging.getLogger(__name__)


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
        "$where": f"CITYCOUNCILDISTRICT={COUNCIL_DISTRICT} AND INCIDENT_DATETIME > '{since}'",
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
        "$where": f"council_district='{COUNCIL_DISTRICT:02d}' AND created_date > '{since}'",
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


async def fetch_notify_nyc_alerts() -> int:
    """Fetch Notify NYC emergency alerts via RSS — the fastest official real-time source (~6 min lag).

    Filters for alerts mentioning District 2 neighborhoods or ZIP codes.
    """
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(NOTIFY_NYC_RSS)
            resp.raise_for_status()
            content = resp.text

        feed = feedparser.parse(content)
    except Exception as e:
        logger.error(f"Notify NYC RSS fetch failed: {e}")
        return 0

    # Neighborhood keywords for filtering (lowercase)
    neighborhood_keywords = [n.lower() for n in DISTRICT_NEIGHBORHOODS]
    zip_keywords = DISTRICT_ZIPS

    rows = []
    for entry in feed.entries:
        title = entry.get("title", "")
        summary = entry.get("summary", entry.get("description", ""))
        link = entry.get("link", "")
        published = entry.get("published", "")

        # Parse date
        pub_date = ""
        if entry.get("published_parsed"):
            try:
                pub_date = datetime(*entry.published_parsed[:6]).isoformat()
            except (TypeError, ValueError):
                pub_date = published

        # Check if alert is relevant to District 2
        text_lower = f"{title} {summary}".lower()
        is_relevant = (
            any(n in text_lower for n in neighborhood_keywords)
            or any(z in text_lower for z in zip_keywords)
            or "manhattan" in text_lower  # broad Manhattan alerts are relevant
            or "citywide" in text_lower
            or "all boroughs" in text_lower
        )

        if not is_relevant:
            continue

        # Determine severity from title keywords
        severity = "medium"
        title_lower = title.lower()
        if any(w in title_lower for w in ["extreme", "evacuati", "major fire", "shooting", "fatality"]):
            severity = "critical"
        elif any(w in title_lower for w in ["fire", "gas leak", "collapse", "hazmat", "power outage"]):
            severity = "high"
        elif any(w in title_lower for w in ["advisory", "delay", "closure", "construction"]):
            severity = "low"

        aid = hashlib.md5(f"notifynyc:{link}:{title}".encode()).hexdigest()
        rows.append({
            "id": f"alert_{aid}",
            "event_type": "alert",
            "title": title,
            "description": summary[:500] if summary else "",
            "latitude": None,
            "longitude": None,
            "address": "",
            "occurred_at": pub_date or datetime.utcnow().isoformat(),
            "source_url": link,
            "raw_data": json.dumps({"title": title, "summary": summary, "link": link}),
            "category": "Emergency Alert",
            "severity": severity,
        })

    count = await upsert_many("events", rows)
    logger.info(f"Notify NYC: fetched {count} relevant alerts")
    return count


async def fetch_notify_nyc_api(since_hours: int = 24) -> int:
    """Fetch Notify NYC alerts from Open Data API (dataset 8vv7-7wx3) for more structured data."""
    since = (datetime.utcnow() - timedelta(hours=since_hours)).isoformat()
    url = _socrata_url(DATASETS["nycem_notifications"])
    params = {
        "$where": f"pubdate > '{since}'",
        "$order": "pubdate DESC",
        "$limit": SOCRATA_PAGE_SIZE,
    }

    try:
        async with httpx.AsyncClient(headers=SOCRATA_HEADERS, timeout=30) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error(f"Notify NYC API fetch failed: {e}")
        return 0

    neighborhood_keywords = [n.lower() for n in DISTRICT_NEIGHBORHOODS]
    zip_keywords = DISTRICT_ZIPS

    rows = []
    for r in data:
        title = r.get("title", "")
        summary = r.get("shortdescription", r.get("fulldescription", ""))
        text_lower = f"{title} {summary}".lower()

        is_relevant = (
            any(n in text_lower for n in neighborhood_keywords)
            or any(z in text_lower for z in zip_keywords)
            or "manhattan" in text_lower
            or "citywide" in text_lower
        )

        if not is_relevant:
            continue

        nid = r.get("id", hashlib.md5(title.encode()).hexdigest())
        severity = "medium"
        title_lower = title.lower()
        if any(w in title_lower for w in ["extreme", "evacuati", "shooting"]):
            severity = "critical"
        elif any(w in title_lower for w in ["fire", "gas leak", "collapse", "outage"]):
            severity = "high"

        rows.append({
            "id": f"alert_api_{nid}",
            "event_type": "alert",
            "title": title,
            "description": summary[:500] if summary else "",
            "latitude": None,
            "longitude": None,
            "address": "",
            "occurred_at": r.get("pubdate", datetime.utcnow().isoformat()),
            "source_url": r.get("link", ""),
            "raw_data": json.dumps(r),
            "category": r.get("category", "Emergency Alert"),
            "severity": severity,
        })

    count = await upsert_many("events", rows)
    logger.info(f"Notify NYC API: fetched {count} relevant alerts")
    return count


async def fetch_dob_complaints(since_hours: int = 24) -> int:
    """Fetch DOB (Dept of Buildings) complaints for District 2 ZIP codes. Updated daily."""
    since = (datetime.utcnow() - timedelta(hours=since_hours)).strftime("%Y-%m-%dT00:00:00")
    zip_filter = " OR ".join(f"zip='{z}'" for z in DISTRICT_ZIPS)
    url = _socrata_url(DATASETS["dob_complaints"])
    params = {
        "$where": f"({zip_filter}) AND date_entered > '{since}'",
        "$order": "date_entered DESC",
        "$limit": SOCRATA_PAGE_SIZE,
    }

    try:
        async with httpx.AsyncClient(headers=SOCRATA_HEADERS, timeout=30) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error(f"DOB complaints fetch failed: {e}")
        return 0

    rows = []
    for r in data:
        complaint_num = r.get("complaint_number", "")
        if not complaint_num:
            continue

        category = r.get("complaint_category", "")
        desc = r.get("complaint_category_description", category)
        status = r.get("status", "")
        house = r.get("house_number", "")
        street = r.get("house_street", "")
        address = f"{house} {street}".strip()

        severity = "low"
        desc_lower = desc.lower()
        if any(w in desc_lower for w in ["unsafe", "collapse", "structural", "crane", "elevator"]):
            severity = "high"
        elif any(w in desc_lower for w in ["illegal", "construction", "no permit"]):
            severity = "medium"

        rows.append({
            "id": f"dob_{complaint_num}",
            "event_type": "dob",
            "title": f"DOB: {desc}" if desc else "DOB Complaint",
            "description": f"Status: {status} - Category: {category}",
            "latitude": None,
            "longitude": None,
            "address": address,
            "occurred_at": r.get("date_entered", ""),
            "source_url": f"https://a810-bisweb.nyc.gov/bisweb/ComplaintsByAddressServlet?allbin={r.get('bin', '')}",
            "raw_data": json.dumps(r),
            "category": category,
            "severity": severity,
        })

    count = await upsert_many("events", rows)
    logger.info(f"DOB: fetched {count} complaints")
    return count


async def backfill_events(months: int = 12):
    """Backfill historical data on first run."""
    logger.info(f"Starting backfill for {months} months...")
    hours = months * 30 * 24
    await fetch_fdny_incidents(since_hours=hours)
    await fetch_nypd_complaints(since_hours=hours)
    await fetch_311_events(since_hours=hours)
    await fetch_notify_nyc_api(since_hours=hours)
    await fetch_dob_complaints(since_hours=hours)
    logger.info("Backfill complete")


