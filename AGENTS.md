# Repository Guidelines

## Project Structure & Module Organization
- `config/`: Django project settings, URLs, and ASGI/WSGI entry points.
- `main/`: The primary Django app (models, views, URLs, admin, migrations).
- `templates/`: HTML templates (`templates/main/` for portfolio pages, `templates/fun/` for mini-games).
- `static/`: Source static assets; `staticfiles/` is the collected output from `collectstatic`.
- `media/`: User-uploaded images and files.
- `manage.py`: Django management entry point.
- `requirements.txt`: Python dependencies.
- `django/`: Local virtual environment (keep dependency changes in `requirements.txt`).

## Build, Test, and Development Commands
- `pip3 install -r requirements.txt`: Install Python dependencies.
- `python manage.py runserver`: Start the local development server.
- `python manage.py migrate`: Apply database migrations.
- `python manage.py makemigrations`: Generate migrations after model changes.
- `python manage.py collectstatic`: Collect static assets into `staticfiles/`.
- Style update rule: when `static/css/*`, `static/js/*`, or templates using those assets change, always run `collectstatic` and then restart gunicorn.
- After changing static assets in production-like runtime, run `collectstatic` and then restart gunicorn to apply immediately.
- Local autorun example: `/bin/zsh -lc "launchctl kickstart -k gui/$(id -u)/com.hanplanet.gunicorn"`.
- `python manage.py createsuperuser`: Create an admin account for `/admin/`.

## Coding Style & Naming Conventions
- Python: 4-space indentation, PEP 8 naming (`snake_case` for functions/vars, `CamelCase` for models/classes).
- Django conventions: app modules in `main/`, URL routes in `config/urls.py` and `main/urls.py`.
- Templates: keep page-specific templates under `templates/main/` or `templates/fun/`.
- No formatter or linter is enforced in the repo; keep changes small and consistent with existing style.

## Testing Guidelines
- Tests live in `main/tests.py` using Django’s test framework.
- Run all tests with `python manage.py test`.
- No coverage threshold is defined; add tests when you change model logic or views.

## Commit & Pull Request Guidelines
- Commit history uses short, descriptive messages (often Korean). Keep messages concise and task-focused.
- PRs should include: a brief summary, key files/paths touched, and screenshots for UI changes (templates/static).
- Link related issues or deployment notes when relevant (e.g., migrations or `collectstatic`).

## Security & Configuration Notes
- Secrets are expected in `config/secrets.json` (git-ignored). Do not commit API keys.
- Production uses `DEBUG = False` and deploys via GitHub Actions to EC2; static files must be collected.
- Static change rollout rule: `collectstatic` first, then app process restart (gunicorn) to avoid stale served assets.

## Docker Runtime Stack (for later testing)
- Container chain: `cloudflared -> nginx -> gunicorn(django)`.
- Key files: `docker-compose.yml`, `Dockerfile`, `docker/entrypoint.sh`, `docker/nginx/default.conf`, `docker/cloudflared/config.yml.example`, `.env.docker.example`.

## Docker Test Quickstart
- Prepare env and tunnel config: `cp .env.docker.example .env.docker` and `cp docker/cloudflared/config.yml.example docker/cloudflared/config.yml`.
- Replace `<TUNNEL_ID>` in `docker/cloudflared/config.yml`.
- Copy tunnel credentials: `cp ~/.cloudflared/<TUNNEL_ID>.json docker/cloudflared/<TUNNEL_ID>.json`.
- Ensure DB file exists: `touch db.sqlite3`.
- Start stack: `docker compose up -d --build`.
- Check status/logs: `docker compose ps` and `docker compose logs -f django nginx cloudflared`.
- Smoke test: `curl -I http://127.0.0.1/portfolio/`.

## Access Log Operation Notes
- Nginx access log is JSON format (`access_json`) and written to `/opt/homebrew/var/log/nginx/access_json.log`.
- Rotation and retention are file-based only: `scripts/rotate-nginx-access-json.sh` keeps 30 days.
- Django Admin log page is file-read mode: `/admin/main/accesslog/`.
- Admin index includes a direct link: `/admin/` -> `운영 로그` -> `접속 로그 (파일 직접 조회)`.
- Daily summary command: `.venv/bin/python manage.py summarize_access_logs --date YYYY-MM-DD`.
- Daily summary files: `/opt/homebrew/var/log/nginx/summaries/access_summary_YYYY-MM-DD.(json|md)`.
- Daily summary admin page: `/admin/main/accesslog-summary/` (also linked from `/admin/` 운영 로그 section).
- Default scheduler: in-process Django scheduler (00:05 local time, summarizes previous day).
- Optional external scheduler template: `deploy/launchd/com.hanplanet.nginx-accesslog-summary.plist`.
- Logs are not imported into DB. `AccessLog` model/table and `import_access_logs` command are removed.

## Browser JS Load Incident Notes
- Observed symptom: private mode works, but normal profile sometimes fails to apply navbar style, mobile nav toggle, chatbot toggle, and bubble animation at the same time.
- This pattern indicates stale/blocked JS in a specific browser profile (cache/extension/privacy setting), not a server-only outage.
- Mitigations applied in this repo:
- `main/templatetags/static_versioned.py` adds `static_v` tag to append `?v=<mtime>` for static assets.
- Main templates now use `static_v` for CSS/JS (`templates/base.html`, `templates/none.html`, `templates/fun/*.html`, `templates/main/ProjectDetail.html`).
- `templates/partials/static_script_fallback.html` adds `window.__reloadStaticScript` and `onerror` retry with cache-buster query.
- `config/settings.py` forces JS MIME mapping to `application/javascript`.
- `static/js/chat_widget.js` and `staticfiles/js/chat_widget.js` replaced `??` with older-compatible expression to reduce parser compatibility risk.
- Quick verify:
- `curl -s https://hanplanet.com/portfolio/ | rg "script.js\\?v=|chat_widget.js\\?v=|style.css\\?v="`
- `curl -I https://hanplanet.com/static/js/script.js` should return `content-type: application/javascript`.
