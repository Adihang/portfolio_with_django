import gzip
import heapq
import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.utils import timezone

ACCESS_LOG_PATTERNS = ("access_json.log", "access_json_*.log", "access_json_*.log.gz")

BOT_UA_PATTERN = re.compile(
    r"bot|crawler|spider|slurp|bingpreview|mediapartners|headless|python-requests|curl|wget",
    re.IGNORECASE,
)
MOBILE_UA_PATTERN = re.compile(
    r"android|iphone|ipad|ipod|mobile|windows phone|blackberry",
    re.IGNORECASE,
)


def resolve_log_dir():
    return Path(getattr(settings, "NGINX_LOG_DIR", "/opt/homebrew/var/log/nginx"))


def resolve_summary_dir():
    configured = getattr(settings, "ACCESS_SUMMARY_DIR", "").strip() if hasattr(settings, "ACCESS_SUMMARY_DIR") else ""
    if configured:
        return Path(configured)
    return resolve_log_dir() / "summaries"


def parse_logged_at(value):
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None

    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed.astimezone(timezone.get_current_timezone())


def collect_log_files(log_dir):
    if not log_dir.exists():
        return []

    candidates = {}
    for pattern in ACCESS_LOG_PATTERNS:
        for file_path in log_dir.glob(pattern):
            candidates[str(file_path)] = file_path

    def sort_key(file_path):
        try:
            return file_path.stat().st_mtime
        except OSError:
            return 0

    return sorted(candidates.values(), key=sort_key)


def open_log_file(file_path):
    if file_path.suffix == ".gz":
        return gzip.open(file_path, mode="rt", encoding="utf-8", errors="replace")
    return file_path.open(mode="r", encoding="utf-8", errors="replace")


def parse_request_time(value):
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(parsed) or parsed < 0:
        return None
    return parsed


def user_agent_category(user_agent):
    if not user_agent:
        return "unknown"
    if BOT_UA_PATTERN.search(user_agent):
        return "bot"
    if MOBILE_UA_PATTERN.search(user_agent):
        return "mobile"
    return "desktop"


def percentile(values, ratio):
    if not values:
        return None
    if len(values) == 1:
        return values[0]

    index = (len(values) - 1) * ratio
    lower = int(math.floor(index))
    upper = int(math.ceil(index))
    if lower == upper:
        return values[lower]

    lower_value = values[lower]
    upper_value = values[upper]
    return lower_value + ((upper_value - lower_value) * (index - lower))


def _counter_to_list(counter, key_name, top_n):
    return [{key_name: key, "count": count} for key, count in counter.most_common(top_n)]


def _escape_markdown_cell(value):
    return str(value).replace("|", "\\|").replace("\n", " ")


def build_daily_summary(target_date, log_dir=None, top_n=10, slow_n=20):
    active_log_dir = Path(log_dir) if log_dir else resolve_log_dir()
    files = collect_log_files(active_log_dir)

    total_requests = 0
    parse_errors = 0

    status_counter = Counter()
    status_group_counter = Counter()
    method_counter = Counter()
    path_counter = Counter()
    host_counter = Counter()
    ip_counter = Counter()
    ua_counter = Counter()
    ua_category_counter = Counter()
    error_path_counter = Counter()
    hourly_counter = Counter()
    ip_user_agent_counter = defaultdict(Counter)
    ip_path_counter = defaultdict(Counter)

    request_times = []
    slow_heap = []
    slow_seq = 0

    for file_path in files:
        try:
            with open_log_file(file_path) as handle:
                for raw_line in handle:
                    line = raw_line.strip()
                    if not line:
                        continue
                    try:
                        payload = json.loads(line)
                    except json.JSONDecodeError:
                        parse_errors += 1
                        continue

                    logged_at = parse_logged_at(payload.get("logged_at"))
                    if not logged_at:
                        continue
                    if logged_at.date() != target_date:
                        continue

                    total_requests += 1
                    hourly_counter[logged_at.strftime("%H")] += 1

                    status = None
                    try:
                        status = int(payload.get("status"))
                    except (TypeError, ValueError):
                        status = None

                    if status is not None:
                        status_counter[str(status)] += 1
                        status_group_counter[f"{status // 100}xx"] += 1

                    method = str(payload.get("method", "")).upper() or "UNKNOWN"
                    method_counter[method] += 1

                    path = str(payload.get("path", "")).strip() or "/"
                    path_counter[path] += 1

                    host = str(payload.get("host", "")).strip() or "-"
                    host_counter[host] += 1

                    client_ip = str(payload.get("client_ip", "")).strip() or "unknown"
                    ip_counter[client_ip] += 1

                    user_agent = str(payload.get("user_agent", "")).strip() or "(empty)"
                    ua_counter[user_agent] += 1
                    ua_category_counter[user_agent_category(user_agent)] += 1
                    ip_user_agent_counter[client_ip][user_agent] += 1

                    if status is not None and status >= 400:
                        error_path_counter[path] += 1
                    ip_path_counter[client_ip][path] += 1

                    request_time = parse_request_time(payload.get("request_time_s"))
                    if request_time is not None:
                        request_times.append(request_time)

                        slow_seq += 1
                        slow_item = {
                            "logged_at": logged_at.strftime("%Y-%m-%d %H:%M:%S"),
                            "request_time_s": round(request_time, 4),
                            "status": status if status is not None else "",
                            "method": method,
                            "path": path,
                            "client_ip": client_ip,
                        }

                        heap_item = (request_time, slow_seq, slow_item)
                        if len(slow_heap) < slow_n:
                            heapq.heappush(slow_heap, heap_item)
                        elif request_time > slow_heap[0][0]:
                            heapq.heapreplace(slow_heap, heap_item)
        except OSError:
            continue

    sorted_request_times = sorted(request_times)
    error_requests = sum(
        count for status_code, count in status_counter.items() if int(status_code) >= 400
    )
    error_rate_pct = round((error_requests / total_requests) * 100, 2) if total_requests else 0.0

    request_time_summary = {
        "count": len(sorted_request_times),
        "avg": round(sum(sorted_request_times) / len(sorted_request_times), 4) if sorted_request_times else None,
        "min": round(sorted_request_times[0], 4) if sorted_request_times else None,
        "max": round(sorted_request_times[-1], 4) if sorted_request_times else None,
        "p50": round(percentile(sorted_request_times, 0.50), 4) if sorted_request_times else None,
        "p95": round(percentile(sorted_request_times, 0.95), 4) if sorted_request_times else None,
        "p99": round(percentile(sorted_request_times, 0.99), 4) if sorted_request_times else None,
    }

    slow_requests = [item for _, _, item in sorted(slow_heap, key=lambda v: v[0], reverse=True)]

    anomalies = []
    if total_requests == 0:
        anomalies.append("요청이 없습니다.")
    if error_rate_pct >= 10.0:
        anomalies.append(f"오류율이 높습니다. (4xx/5xx: {error_rate_pct}%)")
    if request_time_summary["p95"] and request_time_summary["p95"] >= 1.5:
        anomalies.append(f"지연이 큽니다. (p95: {request_time_summary['p95']}s)")

    if ip_counter and total_requests > 0:
        top_ip, top_ip_count = ip_counter.most_common(1)[0]
        concentration = (top_ip_count / total_requests) * 100
        if top_ip_count >= 120 or concentration >= 35:
            anomalies.append(
                f"단일 IP 집중도가 높습니다. ({top_ip}: {top_ip_count}건, {concentration:.1f}%)"
            )

    hourly_requests = [
        {"hour": f"{hour:02d}", "count": hourly_counter.get(f"{hour:02d}", 0)}
        for hour in range(24)
    ]

    ip_rankings = []
    for rank, (client_ip, count) in enumerate(ip_counter.most_common(top_n), start=1):
        share_pct = round((count / total_requests) * 100, 2) if total_requests else 0.0
        top_user_agent, top_user_agent_count = (
            ip_user_agent_counter[client_ip].most_common(1)[0]
            if ip_user_agent_counter[client_ip]
            else ("(empty)", 0)
        )
        top_path, top_path_count = (
            ip_path_counter[client_ip].most_common(1)[0]
            if ip_path_counter[client_ip]
            else ("/", 0)
        )
        ip_rankings.append(
            {
                "rank": rank,
                "client_ip": client_ip,
                "count": count,
                "share_pct": share_pct,
                "top_user_agent": top_user_agent,
                "top_user_agent_count": top_user_agent_count,
                "top_path": top_path,
                "top_path_count": top_path_count,
            }
        )

    summary = {
        "date": target_date.isoformat(),
        "generated_at": timezone.now().isoformat(),
        "log_dir": str(active_log_dir),
        "scanned_files": len(files),
        "parse_errors": parse_errors,
        "total_requests": total_requests,
        "unique_ips": len(ip_counter),
        "error_requests": error_requests,
        "error_rate_pct": error_rate_pct,
        "methods": _counter_to_list(method_counter, "method", top_n),
        "status_codes": _counter_to_list(status_counter, "status", top_n),
        "status_groups": _counter_to_list(status_group_counter, "group", top_n),
        "top_paths": _counter_to_list(path_counter, "path", top_n),
        "top_hosts": _counter_to_list(host_counter, "host", top_n),
        "top_ips": _counter_to_list(ip_counter, "client_ip", top_n),
        "top_user_agents": _counter_to_list(ua_counter, "user_agent", top_n),
        "user_agent_categories": _counter_to_list(ua_category_counter, "category", top_n),
        "ip_rankings": ip_rankings,
        "error_paths": _counter_to_list(error_path_counter, "path", top_n),
        "hourly_requests": hourly_requests,
        "request_time": request_time_summary,
        "slow_requests": slow_requests,
        "anomalies": anomalies,
    }
    return summary


def summary_markdown(summary):
    request_time = summary.get("request_time", {})
    lines = [
        f"# Access Log Daily Summary ({summary.get('date', '-')})",
        "",
        f"- Generated at: {summary.get('generated_at', '-')}",
        f"- Total requests: {summary.get('total_requests', 0)}",
        f"- Unique IPs: {summary.get('unique_ips', 0)}",
        f"- Error requests (4xx/5xx): {summary.get('error_requests', 0)} ({summary.get('error_rate_pct', 0)}%)",
        f"- Parse errors: {summary.get('parse_errors', 0)}",
        "",
        "## Request Time",
        f"- avg: {request_time.get('avg')}",
        f"- p50: {request_time.get('p50')}",
        f"- p95: {request_time.get('p95')}",
        f"- p99: {request_time.get('p99')}",
        f"- max: {request_time.get('max')}",
        "",
        "## Top Paths",
    ]

    for row in summary.get("top_paths", []):
        lines.append(f"- {row.get('path')}: {row.get('count')}")

    lines.append("")
    lines.append("## Status Groups")
    for row in summary.get("status_groups", []):
        lines.append(f"- {row.get('group')}: {row.get('count')}")

    lines.append("")
    lines.append("## IP Access Ranking")
    lines.append("| Rank | IP | Requests | Share(%) | Top User-Agent | Top Path |")
    lines.append("| --- | --- | ---: | ---: | --- | --- |")
    ip_rankings = summary.get("ip_rankings", [])
    if ip_rankings:
        for row in ip_rankings:
            lines.append(
                "| "
                f"{row.get('rank', '-')} | "
                f"{_escape_markdown_cell(row.get('client_ip', '-'))} | "
                f"{row.get('count', 0)} | "
                f"{row.get('share_pct', 0)} | "
                f"{_escape_markdown_cell(row.get('top_user_agent', '-'))} | "
                f"{_escape_markdown_cell(row.get('top_path', '-'))} ({row.get('top_path_count', 0)}) "
                "|"
            )
    else:
        lines.append("| - | - | 0 | 0 | - | - |")

    anomalies = summary.get("anomalies", [])
    lines.append("")
    lines.append("## Anomalies")
    if anomalies:
        for issue in anomalies:
            lines.append(f"- {issue}")
    else:
        lines.append("- 특이사항 없음")

    return "\n".join(lines) + "\n"


def write_summary_files(summary, summary_dir=None):
    target_dir = Path(summary_dir) if summary_dir else resolve_summary_dir()
    target_dir.mkdir(parents=True, exist_ok=True)

    target_date = summary.get("date")
    json_path = target_dir / f"access_summary_{target_date}.json"
    md_path = target_dir / f"access_summary_{target_date}.md"

    with json_path.open("w", encoding="utf-8") as json_file:
        json.dump(summary, json_file, ensure_ascii=False, indent=2)
        json_file.write("\n")

    markdown_text = summary_markdown(summary)
    with md_path.open("w", encoding="utf-8") as md_file:
        md_file.write(markdown_text)

    return json_path, md_path
