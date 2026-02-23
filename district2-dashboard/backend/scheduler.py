"""Background scheduler for periodic data fetching."""

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from config import BACKFILL_MONTHS, SCHEDULE
from db import query

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def _safe_run(name: str, coro):
    """Run a coroutine with error handling so one failure doesn't stop others."""
    try:
        result = await coro
        logger.info(f"Scheduler: {name} completed (result: {result})")
    except Exception as e:
        logger.error(f"Scheduler: {name} failed: {e}")


async def job_fetch_fdny():
    from services.events import fetch_fdny_incidents
    await _safe_run("FDNY", fetch_fdny_incidents(since_hours=1))


async def job_fetch_nypd():
    from services.events import fetch_nypd_complaints
    await _safe_run("NYPD", fetch_nypd_complaints(since_hours=2))


async def job_fetch_311():
    from services.events import fetch_311_events
    await _safe_run("311", fetch_311_events(since_hours=1))


async def job_fetch_911():
    from services.complaints import fetch_911_calls
    await _safe_run("911", fetch_911_calls(since_hours=2))


async def job_fetch_notify_nyc():
    from services.events import fetch_notify_nyc_alerts, fetch_notify_nyc_api
    await _safe_run("Notify NYC RSS", fetch_notify_nyc_alerts())
    await _safe_run("Notify NYC API", fetch_notify_nyc_api(since_hours=1))


async def job_fetch_dob():
    from services.events import fetch_dob_complaints
    await _safe_run("DOB complaints", fetch_dob_complaints(since_hours=24))


async def job_fetch_news():
    from services.news import fetch_news_feeds
    await _safe_run("News", fetch_news_feeds())


async def job_fetch_hyperlocal():
    from services.news import fetch_hyperlocal_feeds
    await _safe_run("Hyperlocal news", fetch_hyperlocal_feeds())


async def job_fetch_hpd():
    from services.hpd import fetch_hpd_violations, fetch_hpd_complaints
    await _safe_run("HPD violations", fetch_hpd_violations(since_days=7))
    await _safe_run("HPD complaints", fetch_hpd_complaints(since_days=7))


async def job_fetch_legislation():
    from services.news import fetch_legislation
    await _safe_run("Legislation", fetch_legislation())


async def job_cleanup_sessions():
    from auth import cleanup_expired_sessions
    await _safe_run("Session cleanup", cleanup_expired_sessions())


async def check_needs_backfill() -> bool:
    """Check if the database has any data; if not, we need a backfill."""
    try:
        result = await query("SELECT COUNT(*) as cnt FROM events")
        return result[0]["cnt"] == 0
    except Exception:
        return True


async def run_backfill():
    """Run initial data backfill."""
    logger.info(f"Running initial backfill ({BACKFILL_MONTHS} months)...")

    from services.events import backfill_events, fetch_notify_nyc_alerts, fetch_notify_nyc_api
    from services.complaints import fetch_311_complaints, fetch_911_calls
    from services.hpd import fetch_hpd_violations, fetch_hpd_complaints
    from services.news import fetch_news_feeds, fetch_hyperlocal_feeds, fetch_legislation

    await _safe_run("Backfill events", backfill_events(months=BACKFILL_MONTHS))
    await _safe_run("Backfill 311", fetch_311_complaints(since_hours=BACKFILL_MONTHS * 30 * 24))
    await _safe_run("Backfill 911", fetch_911_calls(since_hours=BACKFILL_MONTHS * 30 * 24))
    await _safe_run("Backfill HPD violations", fetch_hpd_violations(since_days=BACKFILL_MONTHS * 30))
    await _safe_run("Backfill HPD complaints", fetch_hpd_complaints(since_days=BACKFILL_MONTHS * 30))
    await _safe_run("Backfill news", fetch_news_feeds())
    await _safe_run("Backfill hyperlocal news", fetch_hyperlocal_feeds())
    await _safe_run("Backfill Notify NYC", fetch_notify_nyc_alerts())
    await _safe_run("Backfill Notify NYC API", fetch_notify_nyc_api(since_hours=BACKFILL_MONTHS * 30 * 24))
    await _safe_run("Backfill legislation", fetch_legislation())

    logger.info("Backfill complete")


def setup_scheduler():
    """Configure all scheduled jobs."""
    scheduler.add_job(
        job_fetch_fdny,
        IntervalTrigger(minutes=SCHEDULE["fdny"]),
        id="fdny",
        name="Fetch FDNY incidents",
        replace_existing=True,
    )
    scheduler.add_job(
        job_fetch_nypd,
        IntervalTrigger(minutes=SCHEDULE["nypd"]),
        id="nypd",
        name="Fetch NYPD complaints",
        replace_existing=True,
    )
    scheduler.add_job(
        job_fetch_311,
        IntervalTrigger(minutes=SCHEDULE["311"]),
        id="311_events",
        name="Fetch 311 requests",
        replace_existing=True,
    )
    scheduler.add_job(
        job_fetch_911,
        IntervalTrigger(minutes=SCHEDULE["311"]),
        id="911_calls",
        name="Fetch 911 calls",
        replace_existing=True,
    )
    scheduler.add_job(
        job_fetch_notify_nyc,
        IntervalTrigger(minutes=SCHEDULE["notify_nyc"]),
        id="notify_nyc",
        name="Fetch Notify NYC alerts",
        replace_existing=True,
    )
    scheduler.add_job(
        job_fetch_dob,
        IntervalTrigger(minutes=SCHEDULE["dob"]),
        id="dob",
        name="Fetch DOB complaints",
        replace_existing=True,
    )
    scheduler.add_job(
        job_fetch_news,
        IntervalTrigger(minutes=SCHEDULE["news"]),
        id="news",
        name="Fetch news feeds",
        replace_existing=True,
    )
    scheduler.add_job(
        job_fetch_hyperlocal,
        IntervalTrigger(minutes=SCHEDULE["hyperlocal"]),
        id="hyperlocal",
        name="Fetch hyperlocal news",
        replace_existing=True,
    )
    scheduler.add_job(
        job_fetch_hpd,
        IntervalTrigger(minutes=SCHEDULE["hpd"]),
        id="hpd",
        name="Fetch HPD data",
        replace_existing=True,
    )
    scheduler.add_job(
        job_fetch_legislation,
        IntervalTrigger(minutes=SCHEDULE["legistar"]),
        id="legislation",
        name="Fetch legislation",
        replace_existing=True,
    )
    scheduler.add_job(
        job_cleanup_sessions,
        IntervalTrigger(minutes=1440),
        id="session_cleanup",
        name="Cleanup expired sessions",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler started with all jobs configured")
