from datetime import datetime

from django.core.management.base import BaseCommand, CommandError

from main.access_log_summary import build_daily_summary, resolve_log_dir, resolve_summary_dir, write_summary_files


class Command(BaseCommand):
    help = "Summarize one day's Nginx JSON access logs into JSON/Markdown files."

    def add_arguments(self, parser):
        parser.add_argument(
            "--date",
            type=str,
            default="",
            help="Target date in YYYY-MM-DD format. Defaults to today (server local time).",
        )
        parser.add_argument(
            "--top-n",
            type=int,
            default=10,
            help="Top N rows for ranked sections.",
        )
        parser.add_argument(
            "--slow-n",
            type=int,
            default=20,
            help="Number of slow requests to keep.",
        )
        parser.add_argument(
            "--log-dir",
            type=str,
            default="",
            help="Override log directory (default: settings.NGINX_LOG_DIR or /opt/homebrew/var/log/nginx).",
        )
        parser.add_argument(
            "--summary-dir",
            type=str,
            default="",
            help="Override summary output directory (default: settings.ACCESS_SUMMARY_DIR or <log_dir>/summaries).",
        )

    def handle(self, *args, **options):
        raw_date = (options.get("date") or "").strip()
        if raw_date:
            try:
                target_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
            except ValueError as exc:
                raise CommandError("--date must be in YYYY-MM-DD format.") from exc
        else:
            from django.utils import timezone

            target_date = timezone.localdate()

        top_n = max(1, min(int(options.get("top_n", 10)), 100))
        slow_n = max(1, min(int(options.get("slow_n", 20)), 200))
        log_dir = (options.get("log_dir") or "").strip() or str(resolve_log_dir())
        summary_dir = (options.get("summary_dir") or "").strip() or str(resolve_summary_dir())

        summary = build_daily_summary(
            target_date=target_date,
            log_dir=log_dir,
            top_n=top_n,
            slow_n=slow_n,
        )
        json_path, md_path = write_summary_files(summary, summary_dir=summary_dir)

        self.stdout.write(
            self.style.SUCCESS(
                f"Access summary generated for {target_date}: {json_path} / {md_path}"
            )
        )
        self.stdout.write(
            f"requests={summary.get('total_requests', 0)}, "
            f"unique_ips={summary.get('unique_ips', 0)}, "
            f"error_rate={summary.get('error_rate_pct', 0)}%"
        )
