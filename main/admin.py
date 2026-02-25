import gzip
import json
from collections import deque
from datetime import datetime, timedelta
from pathlib import Path

from django.conf import settings
from django.contrib import admin
from django.core.paginator import Paginator
from django.http import FileResponse, Http404, HttpResponse, StreamingHttpResponse
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils import timezone

from .access_log_summary import BOT_UA_PATTERN, resolve_summary_dir, summary_markdown
from .models import Career, Hobby, Project, Project_Tag, Stratagem, Stratagem_Class, Stratagem_Hero_Score

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ["title", "title_en", "create_date"]
    fields = [
        "order",
        "title",
        "title_en",
        "banner_img",
        "tags",
        "content",
        "content_en",
        "create_date",
    ]

admin.site.register(Project_Tag)

@admin.register(Career)
class CareerAdmin(admin.ModelAdmin):
    list_display = ["company", "company_en", "calculated_period", "join_date", "leave_date"]
    fields = [
        "order",
        "company",
        "company_en",
        "position",
        "content",
        "content_en",
        "join_date",
        "leave_date",
    ]

    @admin.display(description="기간(자동 계산)")
    def calculated_period(self, obj):
        return obj.display_period

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
SUMMARY_PER_PAGE_DEFAULT = 30
SUMMARY_PER_PAGE_MAX = 200
BOT_PATH_HINTS = (
    ".php",
    "/wp-",
    "/wordpress",
    "/xmlrpc.php",
    "/geoserver/",
    "/device.rsp",
    "/cgi-bin/",
    "/boaform/",
    "/actuator/",
    "/manager/html",
)


def _parse_iso_date(value):
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return None


def _parse_int(value, default, min_value, max_value):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(min_value, min(parsed, max_value))


def _parse_bool(value, default=False):
    if value is None:
        return default
    normalized = str(value).strip().lower()
    return normalized in {"1", "true", "yes", "on"}


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


def _is_suspected_bot_request(payload):
    user_agent = str(payload.get("user_agent", "")).strip()
    path = str(payload.get("path", "")).strip().lower()

    if user_agent and BOT_UA_PATTERN.search(user_agent):
        return True

    if path:
        for hint in BOT_PATH_HINTS:
            if hint in path:
                return True

    return False


def _load_file_log_rows(limit, days, exclude_suspected_bots=False):
    log_dir = Path(getattr(settings, "NGINX_LOG_DIR", "/opt/homebrew/var/log/nginx"))
    files = _collect_log_files(log_dir)
    cutoff = timezone.now() - timedelta(days=days)
    rows = deque(maxlen=limit)
    parse_errors = 0
    filtered_bot_rows = 0

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
                    if exclude_suspected_bots and _is_suspected_bot_request(payload):
                        filtered_bot_rows += 1
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

    return list(reversed(rows)), len(files), parse_errors, filtered_bot_rows, log_dir


def access_log_file_view(request):
    days = _parse_int(request.GET.get("days"), LOG_DAYS_DEFAULT, 1, 30)
    per_page = _parse_int(request.GET.get("per_page"), LOG_PER_PAGE_DEFAULT, 20, LOG_PER_PAGE_MAX)
    page_number = _parse_int(request.GET.get("p"), 1, 1, 999999)
    exclude_bots = _parse_bool(request.GET.get("exclude_bots"), default=True)
    row_limit = min(max(page_number * per_page, per_page), LOG_SCAN_ROWS_MAX)

    rows, scanned_files, parse_errors, filtered_bot_rows, log_dir = _load_file_log_rows(
        limit=row_limit,
        days=days,
        exclude_suspected_bots=exclude_bots,
    )
    paginator = Paginator(rows, per_page)
    page_obj = paginator.get_page(page_number)

    query_params = request.GET.copy()
    query_params.pop("p", None)

    context = {
        **admin.site.each_context(request),
        "title": "접속 로그",
        "subtitle": None,
        "file_logs": page_obj.object_list,
        "page_obj": page_obj,
        "paginator": paginator,
        "is_paginated": page_obj.has_other_pages(),
        "days": days,
        "per_page": per_page,
        "base_query": query_params.urlencode(),
        "parse_errors": parse_errors,
        "exclude_bots": exclude_bots,
        "filtered_bot_rows": filtered_bot_rows,
        "scanned_files": scanned_files,
        "log_dir": str(log_dir),
        "total_count": paginator.count,
    }
    return TemplateResponse(request, "admin/main/accesslog/file_logs.html", context)


def _iter_access_log_jsonl_for_date(target_date):
    log_dir = Path(getattr(settings, "NGINX_LOG_DIR", "/opt/homebrew/var/log/nginx"))
    files = _collect_log_files(log_dir)

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
                        continue

                    logged_at_raw = payload.get("logged_at", "")
                    logged_at = _parse_logged_at(logged_at_raw)
                    if logged_at is not None:
                        if logged_at.date() != target_date:
                            continue
                    elif str(logged_at_raw)[:10] != target_date.isoformat():
                        continue

                    yield json.dumps(payload, ensure_ascii=False) + "\n"
        except OSError:
            continue


def access_log_download_view(request, log_date):
    selected_date = _parse_iso_date(log_date)
    if selected_date is None:
        raise Http404("유효하지 않은 날짜 형식입니다. YYYY-MM-DD 를 사용하세요.")

    response = StreamingHttpResponse(
        _iter_access_log_jsonl_for_date(selected_date),
        content_type="application/x-ndjson; charset=utf-8",
    )
    response["Content-Disposition"] = (
        f'attachment; filename="access_log_{selected_date.isoformat()}.jsonl"'
    )
    return response


def _extract_summary_date(file_path):
    stem = file_path.stem
    prefix = "access_summary_"
    if not stem.startswith(prefix):
        return None
    raw_date = stem[len(prefix):]
    try:
        return datetime.strptime(raw_date, "%Y-%m-%d").date()
    except ValueError:
        return None


def _collect_summary_files(summary_dir):
    if not summary_dir.exists():
        return []

    files = list(summary_dir.glob("access_summary_*.json"))

    def sort_key(file_path):
        summary_date = _extract_summary_date(file_path)
        if summary_date:
            return (1, summary_date)
        return (0, datetime.min.date())

    return sorted(files, key=sort_key, reverse=True)


def _load_summary_json(file_path):
    try:
        with file_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    return payload


def access_log_summary_view(request, summary_date=""):
    per_page = _parse_int(request.GET.get("per_page"), SUMMARY_PER_PAGE_DEFAULT, 10, SUMMARY_PER_PAGE_MAX)
    page_number = _parse_int(request.GET.get("p"), 1, 1, 999999)
    selected_date = (summary_date or request.GET.get("date", "")).strip()
    auto_selected_date = False

    summary_dir = Path(resolve_summary_dir())
    summary_files = _collect_summary_files(summary_dir)
    rows = []

    for file_path in summary_files:
        payload = _load_summary_json(file_path)
        if payload is None:
            continue

        row_date = str(payload.get("date", "")).strip() or ""
        if not row_date:
            parsed = _extract_summary_date(file_path)
            row_date = parsed.isoformat() if parsed else file_path.stem

        rows.append(
            {
                "date": row_date,
                "total_requests": payload.get("total_requests", 0),
                "unique_ips": payload.get("unique_ips", 0),
                "error_rate_pct": payload.get("error_rate_pct", 0),
                "parse_errors": payload.get("parse_errors", 0),
                "generated_at": payload.get("generated_at", ""),
            }
        )

    if not selected_date and rows:
        selected_date = rows[0]["date"]
        auto_selected_date = True

    paginator = Paginator(rows, per_page)
    page_obj = paginator.get_page(page_number)

    query_params = request.GET.copy()
    query_params.pop("p", None)

    selected_summary = None
    selected_markdown = ""
    selected_missing = False
    if selected_date:
        selected_json_path = summary_dir / f"access_summary_{selected_date}.json"
        selected_summary = _load_summary_json(selected_json_path)
        if selected_summary is None:
            selected_missing = True
        else:
            selected_md_path = summary_dir / f"access_summary_{selected_date}.md"
            if selected_md_path.exists():
                try:
                    selected_markdown = selected_md_path.read_text(encoding="utf-8")
                except OSError:
                    selected_markdown = ""
            if not selected_markdown:
                selected_markdown = summary_markdown(selected_summary)

    context = {
        **admin.site.each_context(request),
        "title": "일일 요약",
        "subtitle": None,
        "summary_rows": page_obj.object_list,
        "page_obj": page_obj,
        "paginator": paginator,
        "is_paginated": page_obj.has_other_pages(),
        "per_page": per_page,
        "base_query": query_params.urlencode(),
        "summary_dir": str(summary_dir),
        "selected_date": selected_date,
        "selected_summary": selected_summary,
        "selected_markdown": selected_markdown,
        "selected_missing": selected_missing,
        "summary_count": paginator.count,
        "auto_selected_date": auto_selected_date,
    }
    return TemplateResponse(request, "admin/main/accesslog/summary_logs.html", context)


def access_log_summary_download_view(request, summary_date, file_type):
    selected_date = _parse_iso_date(summary_date)
    if selected_date is None:
        raise Http404("유효하지 않은 날짜 형식입니다. YYYY-MM-DD 를 사용하세요.")

    ext = (file_type or "").strip().lower()
    if ext not in {"json", "md"}:
        raise Http404("지원하지 않는 파일 형식입니다.")

    summary_dir = Path(resolve_summary_dir())
    date_str = selected_date.isoformat()
    json_path = summary_dir / f"access_summary_{date_str}.json"
    md_path = summary_dir / f"access_summary_{date_str}.md"

    if ext == "json":
        if not json_path.exists():
            raise Http404("요약 JSON 파일이 없습니다.")
        return FileResponse(
            json_path.open("rb"),
            as_attachment=True,
            filename=json_path.name,
            content_type="application/json",
        )

    if md_path.exists():
        return FileResponse(
            md_path.open("rb"),
            as_attachment=True,
            filename=md_path.name,
            content_type="text/markdown; charset=utf-8",
        )

    summary_payload = _load_summary_json(json_path)
    if summary_payload is None:
        raise Http404("요약 원본 파일이 없어 Markdown을 생성할 수 없습니다.")

    response = HttpResponse(
        summary_markdown(summary_payload),
        content_type="text/markdown; charset=utf-8",
    )
    response["Content-Disposition"] = f'attachment; filename="access_summary_{date_str}.md"'
    return response


def _is_blank(value):
    return not str(value or "").strip()


def translation_audit_view(request):
    missing_projects = []
    missing_careers = []

    for project in Project.objects.all().order_by("id"):
        missing_fields = []
        if _is_blank(project.title_en):
            missing_fields.append("title_en")
        if _is_blank(project.content_en):
            missing_fields.append("content_en")
        if missing_fields:
            missing_projects.append(
                {
                    "id": project.id,
                    "title": project.title,
                    "missing_fields": ", ".join(missing_fields),
                    "change_url": reverse("admin:main_project_change", args=[project.id]),
                }
            )

    for career in Career.objects.all().order_by("id"):
        missing_fields = []
        if _is_blank(career.company_en):
            missing_fields.append("company_en")
        if _is_blank(career.content_en):
            missing_fields.append("content_en")
        if missing_fields:
            missing_careers.append(
                {
                    "id": career.id,
                    "company": career.company,
                    "position": career.position,
                    "missing_fields": ", ".join(missing_fields),
                    "change_url": reverse("admin:main_career_change", args=[career.id]),
                }
            )

    context = {
        **admin.site.each_context(request),
        "title": "번역 누락 점검",
        "subtitle": None,
        "missing_projects": missing_projects,
        "missing_careers": missing_careers,
        "missing_project_count": len(missing_projects),
        "missing_career_count": len(missing_careers),
    }
    return TemplateResponse(request, "admin/main/translation_audit.html", context)


_original_admin_get_urls = admin.site.get_urls


def _get_admin_urls():
    urls = _original_admin_get_urls()
    custom_urls = [
        path(
            "main/accesslog/",
            admin.site.admin_view(access_log_file_view),
            name="main_accesslog_changelist",
        ),
        path(
            "main/accesslog/download/<str:log_date>/",
            admin.site.admin_view(access_log_download_view),
            name="main_accesslog_download",
        ),
        path(
            "main/accesslog-summary/",
            admin.site.admin_view(access_log_summary_view),
            name="main_accesslog_summary_changelist",
        ),
        path(
            "main/accesslog-summary/download/<str:summary_date>/<str:file_type>/",
            admin.site.admin_view(access_log_summary_download_view),
            name="main_accesslog_summary_download",
        ),
        path(
            "main/accesslog-summary/<str:summary_date>/",
            admin.site.admin_view(access_log_summary_view),
            name="main_accesslog_summary_detail",
        ),
        path(
            "main/translation-audit/",
            admin.site.admin_view(translation_audit_view),
            name="main_translation_audit",
        ),
    ]
    return custom_urls + urls


admin.site.get_urls = _get_admin_urls
