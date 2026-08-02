import logging
import datetime
from zoneinfo import ZoneInfo
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.db import get_session_factory
from app.config import settings
from app.services.pricing import append_eod

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

def run_eod_job():
    logger.info("Executing EOD append job...")
    SessionMaker = get_session_factory()
    db = SessionMaker()
    try:
        append_eod(db)
        logger.info("EOD append job completed successfully.")
    except Exception as e:
        logger.error(f"Error executing EOD append job: {e}")
    finally:
        db.close()

def start_scheduler():
    if settings.TESTING or not settings.SCHEDULER_ENABLED:
        logger.info("Scheduler disabled in testing mode")
        return
    try:
        if not scheduler.running:
            sydney_tz = ZoneInfo("Australia/Sydney")
            scheduler.add_job(
                run_eod_job,
                trigger=CronTrigger(hour=18, minute=30, timezone=sydney_tz),
                id="append_eod_job",
                replace_existing=True,
                max_instances=1
            )
            scheduler.start()
            logger.info("Scheduler started successfully")
            
            # Startup catch-up check: schedule in background, non-blocking
            scheduler.add_job(
                run_eod_job,
                next_run_time=datetime.datetime.now(sydney_tz),
                id="startup_catchup_job"
            )
    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}")

def stop_scheduler():
    try:
        if scheduler.running:
            scheduler.shutdown()
            logger.info("Scheduler stopped successfully")
    except Exception as e:
        logger.error(f"Failed to stop scheduler: {e}")
