import fcntl
import logging
import os
import sys
import threading
import time
from datetime import timedelta
from pathlib import Path

from django.utils import timezone

from .access_log_summary import build_daily_summary, resolve_summary_dir, write_summary_files

logger = logging.getLogger(__name__)

_scheduler_started = False
_scheduler_lock_fd = None
_scheduler_thread = None
_last_generated_date = None


def _env_bool(name, default):
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _should_start_in_this_process():
    if not _env_bool("DJANGO_ACCESS_SUMMARY_SCHEDULER_ENABLED", True):
        return False

    argv0 = Path(sys.argv[0]).name
    command = sys.argv[1] if len(sys.argv) > 1 else ""

    # Prevent scheduler from running on one-off management commands.
    if argv0 == "manage.py":
        if command != "runserver":
            return False
        # Django dev server reloader spawns duplicate process.
        if os.environ.get("RUN_MAIN") != "true":
            return False

    return True


def _acquire_scheduler_lock():
    lock_path = Path(
        os.environ.get(
            "DJANGO_ACCESS_SUMMARY_SCHEDULER_LOCK_FILE",
            "/tmp/hanplanet-access-summary-scheduler.lock",
        )
    )
    lock_path.parent.mkdir(parents=True, exist_ok=True)

    fd = os.open(str(lock_path), os.O_CREAT | os.O_RDWR, 0o644)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        os.close(fd)
        return None

    os.ftruncate(fd, 0)
    os.write(fd, str(os.getpid()).encode("utf-8"))
    os.fsync(fd)
    return fd


def _resolve_top_n():
    try:
        value = int(os.environ.get("DJANGO_ACCESS_SUMMARY_TOP_N", "10"))
    except ValueError:
        value = 10
    return max(1, min(value, 100))


def _resolve_slow_n():
    try:
        value = int(os.environ.get("DJANGO_ACCESS_SUMMARY_SLOW_N", "20"))
    except ValueError:
        value = 20
    return max(1, min(value, 200))


def _summary_json_path(target_date):
    return Path(resolve_summary_dir()) / f"access_summary_{target_date.isoformat()}.json"


def _maybe_generate_previous_day_summary():
    global _last_generated_date

    now = timezone.localtime()
    trigger_at = now.replace(hour=0, minute=5, second=0, microsecond=0)
    if now < trigger_at:
        return

    target_date = (now - timedelta(days=1)).date()
    if _last_generated_date == target_date:
        return

    existing_json = _summary_json_path(target_date)
    if existing_json.exists():
        _last_generated_date = target_date
        return

    top_n = _resolve_top_n()
    slow_n = _resolve_slow_n()
    summary = build_daily_summary(target_date=target_date, top_n=top_n, slow_n=slow_n)
    json_path, md_path = write_summary_files(summary)
    _last_generated_date = target_date
    logger.info(
        "Generated daily access summary date=%s requests=%s path=%s md=%s",
        target_date,
        summary.get("total_requests", 0),
        json_path,
        md_path,
    )


def _scheduler_loop():
    interval_sec = 30
    while True:
        try:
            _maybe_generate_previous_day_summary()
        except Exception as exc:  # pragma: no cover - defensive loop guard
            logger.exception("Access summary scheduler error: %s", exc)
        time.sleep(interval_sec)


def start_access_log_scheduler():
    global _scheduler_started, _scheduler_lock_fd, _scheduler_thread

    if _scheduler_started:
        return False

    if not _should_start_in_this_process():
        return False

    lock_fd = _acquire_scheduler_lock()
    if lock_fd is None:
        logger.info("Access summary scheduler already running in another process.")
        return False

    _scheduler_lock_fd = lock_fd
    _scheduler_thread = threading.Thread(
        target=_scheduler_loop,
        name="access-log-summary-scheduler",
        daemon=True,
    )
    _scheduler_thread.start()
    _scheduler_started = True
    logger.info("Access summary scheduler started (pid=%s).", os.getpid())
    return True
