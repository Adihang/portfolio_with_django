from django.apps import AppConfig


class MainConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "main"

    def ready(self):
        from .access_log_scheduler import start_access_log_scheduler
        import main.signals  # noqa: F401 — 시그널 핸들러 등록

        start_access_log_scheduler()
