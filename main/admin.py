import gzip
import json
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path

from django.conf import settings
from django.contrib import admin
from django.core.paginator import Paginator
from django.template.response import TemplateResponse
from django.urls import path
from django.utils import timezone

from .models import Career, Hobby, Project, Project_Tag, Stratagem, Stratagem_Class, Stratagem_Hero_Score

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ['title']

admin.site.register(Project_Tag)

@admin.register(Career)
class CareerAdmin(admin.ModelAdmin):
    list_display = ['company']

@admin.register(Hobby)
class HobbyAdmin(admin.ModelAdmin):
    list_display = ['title']

admin.site.register(Stratagem_Class)

@admin.register(Stratagem)
class StratagemAdmin(admin.ModelAdmin):
    list_display = ['name']
    
@admin.register(Stratagem_Hero_Score)
class Stratagem_Hero_ScoreAdmin(admin.ModelAdmin):
    list_display = ['name']

LOG_DAYS_DEFAULT = 30
LOG_PER_PAGE_DEFAULT = 100
LOG_PER_PAGE_MAX = 500
LOG_SCAN_ROWS_MAX = 5000


def _parse_int(value, default, min_value, max_value):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(min_value, min(parsed, max_value))


def _parse_logged_at(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed.astimezone(timezone.get_current_timezone())


def _collect_log_files(log_dir):
    if not log_dir.exists():
        return []

    candidates = {}
    for pattern in ("access_json.log", "access_json_*.log", "access_json_*.log.gz"):
        for file_path in log_dir.glob(pattern):
            candidates[str(file_path)] = file_path

    def sort_key(file_path):
        try:
            return file_path.stat().st_mtime
        except OSError:
            return 0

    return sorted(candidates.values(), key=sort_key)


def _open_log_file(file_path):
    if file_path.suffix == ".gz":
        return gzip.open(file_path, mode="rt", encoding="utf-8", errors="replace")
    return file_path.open(mode="r", encoding="utf-8", errors="replace")


def _load_file_log_rows(limit, days):
    log_dir = Path(getattr(settings, "NGINX_LOG_DIR", "/opt/homebrew/var/log/nginx"))
    files = _collect_log_files(log_dir)
    cutoff = timezone.now() - timedelta(days=days)
    rows = deque(maxlen=limit)
    parse_errors = 0

    for file_path in files:
        try:
            with _open_log_file(file_path) as handle:
                for raw_line in handle:
                    line = raw_line.strip()
                    if not line:
                        continue
                    try:
                        payload = json.loads(line)
                    except json.JSONDecodeError:
                        parse_errors += 1
                        continue

                    logged_at_raw = payload.get("logged_at", "")
                    logged_at = _parse_logged_at(logged_at_raw)
                    if logged_at and logged_at < cutoff:
                        continue

                    rows.append(
                        {
                            "logged_at": (
                                logged_at.strftime("%Y-%m-%d %H:%M:%S")
                                if logged_at
                                else logged_at_raw
                            ),
                            "status": payload.get("status", ""),
                            "method": payload.get("method", ""),
                            "host": payload.get("host", ""),
                            "path": payload.get("path", ""),
                            "request_time_s": payload.get("request_time_s", ""),
                            "client_ip": payload.get("client_ip", ""),
                            "user_agent": payload.get("user_agent", ""),
                        }
                    )
        except OSError:
            continue

    return list(reversed(rows)), len(files), parse_errors, log_dir


def access_log_file_view(request):
    days = _parse_int(request.GET.get("days"), LOG_DAYS_DEFAULT, 1, 30)
    per_page = _parse_int(request.GET.get("per_page"), LOG_PER_PAGE_DEFAULT, 20, LOG_PER_PAGE_MAX)
    page_number = _parse_int(request.GET.get("p"), 1, 1, 999999)
    row_limit = min(max(page_number * per_page, per_page), LOG_SCAN_ROWS_MAX)

    rows, scanned_files, parse_errors, log_dir = _load_file_log_rows(limit=row_limit, days=days)
    paginator = Paginator(rows, per_page)
    page_obj = paginator.get_page(page_number)

    query_params = request.GET.copy()
    query_params.pop("p", None)

    context = {
        **admin.site.each_context(request),
        "title": "접속 로그 (파일 직접 조회)",
        "subtitle": None,
        "file_logs": page_obj.object_list,
        "page_obj": page_obj,
        "paginator": paginator,
        "is_paginated": page_obj.has_other_pages(),
        "days": days,
        "per_page": per_page,
        "base_query": query_params.urlencode(),
        "parse_errors": parse_errors,
        "scanned_files": scanned_files,
        "log_dir": str(log_dir),
        "total_count": paginator.count,
    }
    return TemplateResponse(request, "admin/main/accesslog/file_logs.html", context)


_original_admin_get_urls = admin.site.get_urls


def _get_admin_urls():
    urls = _original_admin_get_urls()
    custom_urls = [
        path(
            "main/accesslog/",
            admin.site.admin_view(access_log_file_view),
            name="main_accesslog_changelist",
        ),
    ]
    return custom_urls + urls


admin.site.get_urls = _get_admin_urls
