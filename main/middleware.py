import time

from django.conf import settings
from django.core.cache import caches
from django.http import HttpResponse, JsonResponse


class GlobalRateLimitMiddleware:
    """Apply a simple fixed-window rate limit for all incoming Django requests."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if self._is_enabled() and not self._is_exempt_path(request.path or ""):
            limited_response = self._build_rate_limited_response_if_needed(request)
            if limited_response is not None:
                return limited_response

        return self.get_response(request)

    def _is_enabled(self):
        return getattr(settings, "GLOBAL_RATE_LIMIT_ENABLED", True)

    def _is_exempt_path(self, path):
        exempt_prefixes = getattr(
            settings,
            "GLOBAL_RATE_LIMIT_EXEMPT_PATH_PREFIXES",
            ("/static/", "/media/"),
        )
        return any(path.startswith(prefix) for prefix in exempt_prefixes)

    def _build_rate_limited_response_if_needed(self, request):
        cache_backend = self._get_cache_backend()
        request_limit = max(1, int(getattr(settings, "GLOBAL_RATE_LIMIT_REQUESTS", 240)))
        window_seconds = max(1, int(getattr(settings, "GLOBAL_RATE_LIMIT_WINDOW_SECONDS", 60)))
        now = int(time.time())

        client_ip = self._get_client_ip(request)
        window_bucket = now // window_seconds
        cache_key = f"global_rate_limit:{client_ip}:{window_bucket}"

        if cache_backend.add(cache_key, 1, timeout=window_seconds + 2):
            current_count = 1
        else:
            try:
                current_count = cache_backend.incr(cache_key)
            except ValueError:
                cache_backend.set(cache_key, 1, timeout=window_seconds + 2)
                current_count = 1

        if current_count <= request_limit:
            return None

        retry_after = max(1, window_seconds - (now % window_seconds))
        payload = {"error": "Too many requests. Try again later."}

        if self._expects_json(request):
            response = JsonResponse(payload, status=429)
        else:
            response = HttpResponse(payload["error"], status=429, content_type="text/plain; charset=utf-8")

        response["Retry-After"] = str(retry_after)
        return response

    def _get_cache_backend(self):
        cache_alias = getattr(settings, "GLOBAL_RATE_LIMIT_CACHE_ALIAS", "default")
        try:
            return caches[cache_alias]
        except Exception:
            return caches["default"]

    def _get_client_ip(self, request):
        forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "unknown")

    def _expects_json(self, request):
        accept = request.headers.get("Accept", "")
        requested_with = request.headers.get("X-Requested-With", "")
        path = request.path or ""

        return (
            "application/json" in accept
            or requested_with.lower() == "xmlhttprequest"
            or path.startswith("/api/")
            or "/docs/api/" in path
        )
