"""News and legislative activity feeds for District 2 and Harvey Epstein."""

import hashlib
import json
import logging
import re
from datetime import datetime

import feedparser
import httpx

from config import DISTRICT_NEIGHBORHOODS, HYPERLOCAL_FEEDS, LEGISTAR_BASE, NEWS_FEEDS, SOCIAL_MEDIA
from db import query, upsert_many

logger = logging.getLogger(__name__)

# Keywords that indicate the article is about the wrong Epstein
EXCLUDE_PATTERNS = re.compile(
    r"(?i)(weinstein|jeffrey\s+epstein|sex\s+traffick|convicted\s+sex|"
    r"epstein\s+island|ghislaine|maxwell|financier|pedophil)",
)

# Keywords that confirm the article is about Council Member Harvey Epstein
CONFIRM_PATTERNS = re.compile(
    r"(?i)(council\s*member|city\s+council|district\s*2|assembly|"
    r"lower\s+east\s+side|east\s+village|legislat|housing|tenant|"
    r"nyc\s+council|new\s+york\s+city\s+council)",
)


def _is_valid_epstein_article(title: str, summary: str = "") -> bool:
    """Filter out articles about Harvey Weinstein or Jeffrey Epstein."""
    text = f"{title} {summary}"
    if EXCLUDE_PATTERNS.search(text):
        return False
    if CONFIRM_PATTERNS.search(text):
        return True
    # If no confirming pattern and no excluding pattern, include but flag
    return True


def _article_id(url: str, title: str) -> str:
    return hashlib.md5(f"{url}:{title}".encode()).hexdigest()


async def fetch_news_feeds() -> int:
    """Fetch all configured Google News RSS feeds."""
    all_rows = []

    for feed_name, feed_url in NEWS_FEEDS.items():
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.get(feed_url)
                resp.raise_for_status()
                content = resp.text

            feed = feedparser.parse(content)
            is_epstein_feed = "epstein" in feed_name

            for entry in feed.entries:
                title = entry.get("title", "")
                summary = entry.get("summary", "")
                url = entry.get("link", "")
                source = entry.get("source", {}).get("title", "") if hasattr(entry, "source") else ""
                published = entry.get("published", "")

                # Parse published date
                pub_date = ""
                if entry.get("published_parsed"):
                    try:
                        pub_date = datetime(*entry.published_parsed[:6]).isoformat()
                    except (TypeError, ValueError):
                        pub_date = published

                # Name disambiguation for Epstein feeds
                if is_epstein_feed and not _is_valid_epstein_article(title, summary):
                    logger.debug(f"Filtered out article: {title}")
                    continue

                aid = _article_id(url, title)
                all_rows.append({
                    "id": aid,
                    "title": title,
                    "summary": summary,
                    "url": url,
                    "source": source,
                    "published_at": pub_date,
                    "feed_name": feed_name,
                    "is_epstein_related": 1 if is_epstein_feed else 0,
                    "is_district_news": 1 if "district" in feed_name or "neighborhood" in feed_name else 0,
                })

        except Exception as e:
            logger.error(f"Failed to fetch feed {feed_name}: {e}")

    count = await upsert_many("news_articles", all_rows)
    logger.info(f"News: fetched {count} articles across {len(NEWS_FEEDS)} feeds")
    return count


async def fetch_hyperlocal_feeds() -> int:
    """Fetch hyperlocal news from EV Grieve, The Lo-Down, THE CITY, Gothamist, amNY.

    These cover District 2 neighborhoods directly and update much more frequently
    than Google News RSS for local events.
    """
    all_rows = []
    neighborhood_keywords = [n.lower() for n in DISTRICT_NEIGHBORHOODS]

    for feed_key, feed_info in HYPERLOCAL_FEEDS.items():
        feed_url = feed_info["url"]
        feed_name = feed_info["name"]
        is_neighborhood_specific = bool(feed_info.get("neighborhoods"))

        try:
            async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
                resp = await client.get(feed_url)
                resp.raise_for_status()
                content = resp.text

            feed = feedparser.parse(content)
            added = 0

            for entry in feed.entries:
                title = entry.get("title", "")
                summary = entry.get("summary", entry.get("description", ""))
                url = entry.get("link", "")
                published = entry.get("published", "")

                # Parse date
                pub_date = ""
                if entry.get("published_parsed"):
                    try:
                        pub_date = datetime(*entry.published_parsed[:6]).isoformat()
                    except (TypeError, ValueError):
                        pub_date = published

                # For citywide feeds (THE CITY, Gothamist, amNY), filter for District 2 relevance
                if not is_neighborhood_specific:
                    text_lower = f"{title} {summary}".lower()
                    is_relevant = any(n in text_lower for n in neighborhood_keywords)
                    if not is_relevant:
                        continue

                aid = _article_id(url, title)
                all_rows.append({
                    "id": aid,
                    "title": title,
                    "summary": summary[:500] if summary else "",
                    "url": url,
                    "source": feed_name,
                    "published_at": pub_date,
                    "feed_name": feed_key,
                    "is_epstein_related": 0,
                    "is_district_news": 1,
                    "is_hyperlocal": 1,
                })
                added += 1

            logger.info(f"Hyperlocal {feed_name}: {added} relevant articles")

        except Exception as e:
            logger.error(f"Failed to fetch hyperlocal feed {feed_name} ({feed_url}): {e}")

    count = await upsert_many("news_articles", all_rows)
    logger.info(f"Hyperlocal: fetched {count} articles total across {len(HYPERLOCAL_FEEDS)} feeds")
    return count


async def fetch_legislation() -> int:
    """Fetch Harvey Epstein's legislative activity from Legistar API."""
    # First, find the person ID for Harvey Epstein
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                f"{LEGISTAR_BASE}/persons",
                params={"$filter": "PersonFullName eq 'Harvey Epstein'"},
            )
            resp.raise_for_status()
            persons = resp.json()

        if not persons:
            logger.warning("Harvey Epstein not found in Legistar")
            return 0

        person_id = persons[0].get("PersonId")

        # Fetch sponsored matters
        resp2_data = []
        async with httpx.AsyncClient(timeout=20) as client:
            resp2 = await client.get(
                f"{LEGISTAR_BASE}/matters",
                params={
                    "$filter": f"MatterSponsorNameId eq {person_id}",
                    "$orderby": "MatterIntroDate desc",
                    "$top": 50,
                },
            )
            if resp2.status_code == 200:
                resp2_data = resp2.json()

        # Also get matters where he's a sponsor via the sponsors endpoint
        async with httpx.AsyncClient(timeout=20) as client:
            sponsors_resp = await client.get(
                f"{LEGISTAR_BASE}/persons/{person_id}/sponsors",
            )
            if sponsors_resp.status_code == 200:
                sponsor_data = sponsors_resp.json()
                matter_ids = [s.get("MatterId") for s in sponsor_data if s.get("MatterId")]

                for mid in matter_ids[:30]:
                    matter_resp = await client.get(f"{LEGISTAR_BASE}/matters/{mid}")
                    if matter_resp.status_code == 200:
                        resp2_data.append(matter_resp.json())

        rows = []
        seen = set()
        for m in resp2_data:
            mid = str(m.get("MatterId", ""))
            if not mid or mid in seen:
                continue
            seen.add(mid)

            rows.append({
                "id": f"leg_{mid}",
                "file_number": m.get("MatterFile", ""),
                "name": m.get("MatterName", ""),
                "title": m.get("MatterTitle", ""),
                "type": m.get("MatterTypeName", ""),
                "status": m.get("MatterStatusName", ""),
                "intro_date": m.get("MatterIntroDate"),
                "agenda_date": m.get("MatterAgendaDate"),
                "passed_date": m.get("MatterPassedDate"),
                "enactment_date": m.get("MatterEnactmentDate"),
                "url": f"https://legistar.council.nyc.gov/LegislationDetail.aspx?ID={mid}",
                "sponsors": json.dumps([m.get("MatterSponsorNameId", "")]),
            })

        count = await upsert_many("legislation", rows)
        logger.info(f"Legislation: fetched {count} items")
        return count

    except Exception as e:
        logger.error(f"Failed to fetch legislation: {e}")
        return 0


async def get_epstein_feed(limit: int = 50) -> list[dict]:
    """Get combined Harvey Epstein news + legislation feed, reverse chronological."""
    news = await query(
        """
        SELECT 'news' as type, title, summary as description, url, source,
               published_at as date, feed_name
        FROM news_articles
        WHERE is_epstein_related = 1
        ORDER BY published_at DESC
        LIMIT ?
        """,
        (limit,),
    )

    legislation = await query(
        """
        SELECT 'legislation' as type, title, name as description, url,
               'NYC Council' as source, intro_date as date, type as feed_name
        FROM legislation
        ORDER BY intro_date DESC
        LIMIT ?
        """,
        (limit,),
    )

    # Merge and sort
    combined = news + legislation
    combined.sort(key=lambda x: x.get("date") or "", reverse=True)
    return combined[:limit]


async def get_district_news(limit: int = 50) -> list[dict]:
    """Get district-level news including hyperlocal feeds."""
    return await query(
        """
        SELECT title, summary, url, source, published_at, feed_name, is_hyperlocal
        FROM news_articles
        WHERE is_district_news = 1 OR is_hyperlocal = 1
        ORDER BY published_at DESC
        LIMIT ?
        """,
        (limit,),
    )
