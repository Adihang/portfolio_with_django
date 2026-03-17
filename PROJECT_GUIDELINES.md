# Project Guidelines

Shared reference for all AI coding agents (Claude Code, Codex, etc.) working in this repository.

## Commands

```bash
# Development
.venv/bin/python manage.py runserver          # Start local dev server
.venv/bin/python manage.py migrate            # Apply DB migrations
.venv/bin/python manage.py makemigrations     # Generate migrations after model changes
.venv/bin/python manage.py collectstatic      # Collect static assets into staticfiles/
.venv/bin/python manage.py createsuperuser    # Create admin account for /admin/

# Tests
.venv/bin/python manage.py test               # Run all tests (main/tests.py)
.venv/bin/python manage.py test main.tests.TestClassName  # Run a specific test class

# Access log summary
.venv/bin/python manage.py summarize_access_logs --date YYYY-MM-DD

# Game server (bumpercar-spiky-server/)
node server.js            # Production
PORT=8081 node server.js  # Dev (port 8080 is often occupied locally)

# Docker stack
docker compose up -d --build
docker compose logs -f django nginx cloudflared
```

**Static asset rollout rule:** After any change to `static/css/*`, `static/js/*`, or templates that reference them, always run `collectstatic` then restart gunicorn — never restart without collecting first.

Local gunicorn restart: `/bin/zsh -lc "launchctl kickstart -k gui/$(id -u)/com.hanplanet.gunicorn"`

## Project Structure

- `config/`: Django project settings, URLs, and ASGI/WSGI entry points.
- `main/`: Primary Django app — models, views, URLs, admin, migrations.
- `templates/main/`: Portfolio page templates.
- `templates/fun/`: Mini-game templates (Salvations_Edge_4, Stratagem_Hero, bumpercar-spiky, etc.).
- `templates/handrive/`: Document editor templates.
- `templates/partials/`: Shared reusable partials (including `ui_i18n.html` for all i18n strings).
- `templates/popup/`: Popup/modal templates (never inline in page templates).
- `static/`: Source static assets; `staticfiles/` is the collected output — do not edit directly.
- `media/`: User-uploaded images and files.
- `manage.py`: Django management entry point.
- `requirements.txt`: Python dependencies.
- `bumpercar-spiky-server/`: Separate Node.js WebSocket game server (see its own `AGENTS.md`).

## Architecture

This is a Django 5.0.1 portfolio + content management + multiplayer game platform.

**Backend (`main/`):**
- `views.py` (~155KB) — main page views
- `handrive_views.py` (~145KB) — document editor (HanDrive) views
- `models.py` — `Project`, `Project_Tag`, `Project_Comment`, `Career` models
- `middleware.py` — global rate limiting (240 req/60s, file-based cache)

**Static assets:**
- `main/templatetags/static_versioned.py` — provides `static_v` tag that appends `?v=<mtime>` for cache busting

**Game server (`bumpercar-spiky-server/`):**
- Separate Node.js WebSocket server (port 8080/8081)
- Django issues JWT tokens at `/api/game-auth-token/`; game server verifies them
- `world/world.js` — core game simulation; `world/spatialGrid.js` — AOI optimization

**AI chatbot:** Ollama at `http://localhost:11434` (default model: `llama3.2:latest`), accessed via `/api/chat/`

**Infrastructure:** Gunicorn → Cloudflare Tunnel → hanplanet.com. Docker stack: `cloudflared → nginx → gunicorn(django)`.

## Configuration

Secrets go in `config/secrets.json` (git-ignored). Key env vars:
- `DJANGO_DEBUG`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`
- `OLLAMA_BASE_URL`, `OLLAMA_MODEL`
- `GAME_JWT_SECRET`, `GAME_WS_PUBLIC_URL`
- `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` (Cloudflare CAPTCHA)

Do not commit API keys or secrets. Production uses `DEBUG = False`.

## Coding Style & Naming Conventions

- Python: 4-space indentation, PEP 8 naming (`snake_case` for functions/vars, `CamelCase` for models/classes).
- Django conventions: app modules in `main/`, URL routes in `config/urls.py` and `main/urls.py`.
- No formatter or linter is enforced — keep changes small and consistent with existing style.
- Commit messages: short, descriptive (Korean is fine).

## UI Rules

- Do not change visual design, responsive breakpoints, or animations unless explicitly requested.
- Do not break responsive mode-switch timing or breakpoint behavior when viewport size changes.
- Keep existing transition/animation behavior intact unless explicitly requested.
- Korean/English UI strings must go in `templates/partials/ui_i18n.html` — no per-view duplicates.
- Account popup UI (`ide-auth-account-menu`) must be maintained as a separate shared partial template — do not duplicate popup markup across page templates.
- Popup/modal markup must live in `templates/popup/` or `templates/partials/` — never inline in page templates.
- Popups with similar structure should be merged into a shared base partial and parameterized includes instead of duplicated HTML blocks.
- Static assets should be split by responsibility — do not grow monolithic `style.css` or single JS files.

## Testing Guidelines

- Tests live in `main/tests.py` using Django's test framework.
- Run all tests with `python manage.py test`.
- No coverage threshold is defined; add tests when you change model logic or views.

## Commit & Pull Request Guidelines

- Commit history uses short, descriptive messages (often Korean). Keep messages concise and task-focused.
- PRs should include: a brief summary, key files/paths touched, and screenshots for UI changes (templates/static).
- Link related issues or deployment notes when relevant (e.g., migrations or `collectstatic`).

## Docker Runtime Stack

Container chain: `cloudflared → nginx → gunicorn(django)`.

Key files: `docker-compose.yml`, `Dockerfile`, `docker/entrypoint.sh`, `docker/nginx/default.conf`, `docker/cloudflared/config.yml.example`, `.env.docker.example`.

**Docker Test Quickstart:**
1. `cp .env.docker.example .env.docker` and `cp docker/cloudflared/config.yml.example docker/cloudflared/config.yml`
2. Replace `<TUNNEL_ID>` in `docker/cloudflared/config.yml`
3. `cp ~/.cloudflared/<TUNNEL_ID>.json docker/cloudflared/<TUNNEL_ID>.json`
4. `touch db.sqlite3`
5. `docker compose up -d --build`
6. `docker compose ps` and `docker compose logs -f django nginx cloudflared`
7. Smoke test: `curl -I http://127.0.0.1/portfolio/`

## Access Logs

- Nginx access log: `/opt/homebrew/var/log/nginx/access_json.log` (JSON format)
- Rotation: `scripts/rotate-nginx-access-json.sh` (30-day retention, file-only — not in DB)
- Daily summary: `summarize_access_logs` command → `/opt/homebrew/var/log/nginx/summaries/`
- Admin view: `/admin/main/accesslog/` (file read mode), summaries at `/admin/main/accesslog-summary/`
- Default scheduler: in-process Django scheduler (00:05 local time, summarizes previous day)
- Optional external scheduler: `deploy/launchd/com.hanplanet.nginx-accesslog-summary.plist`
- Logs are not imported into DB; `AccessLog` model/table and `import_access_logs` command are removed.

## Browser JS Load Incident Notes

Observed symptom: private mode works, but normal profile sometimes fails to apply navbar style, mobile nav toggle, chatbot toggle, and bubble animation at the same time. This indicates stale/blocked JS in a specific browser profile (cache/extension/privacy setting), not a server outage.

Mitigations applied:
- `main/templatetags/static_versioned.py` adds `static_v` tag to append `?v=<mtime>` for static assets.
- Main templates use `static_v` for CSS/JS (`templates/base.html`, `templates/none.html`, `templates/fun/*.html`, `templates/main/ProjectDetail.html`).
- `templates/partials/static_script_fallback.html` adds `window.__reloadStaticScript` and `onerror` retry with cache-buster query.
- `config/settings.py` forces JS MIME mapping to `application/javascript`.

Quick verify:
```bash
curl -s https://hanplanet.com/portfolio/ | rg "script.js\?v=|chat_widget.js\?v=|style.css\?v="
curl -I https://hanplanet.com/static/js/script.js  # should return content-type: application/javascript
```
