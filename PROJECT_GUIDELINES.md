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

# Game server (bumpercar-spiky-server/) — local dev only
node server.js            # Production mode
PORT=8081 node server.js  # Dev (port 8080 is often occupied locally)
```

**Static asset rollout rule:** After any change to `static/css/*`, `static/js/*`, or templates that reference them, always run `collectstatic` then restart gunicorn — never restart without collecting first.

### Production Deployment (launchd — no Docker)

> Docker is **not in use**. All services run as native macOS launchd daemons.

| Service | launchd label | Restart command |
|---------|--------------|-----------------|
| Django (gunicorn) | `com.hanplanet.gunicorn` | `launchctl kickstart -k gui/$(id -u)/com.hanplanet.gunicorn` |
| Game server | `com.hanplanet.bumpercar-spiky-server` | `launchctl kickstart -k gui/$(id -u)/com.hanplanet.bumpercar-spiky-server` |
| Git server (Gitea) | `com.hanplanet.gitea` | `launchctl kickstart -k gui/$(id -u)/com.hanplanet.gitea` |
| Celery worker | `com.hanplanet.celery` | `launchctl kickstart -k gui/$(id -u)/com.hanplanet.celery` |
| Nginx | `com.hanplanet.nginx` | `launchctl kickstart -k gui/$(id -u)/com.hanplanet.nginx` |

Plist files: `deploy/launchd/` (Django, Gitea, Celery, Nginx) and `bumpercar-spiky-server/deploy/launchd/` (game server).

**Django 변경 후 운영 적용:**
```bash
.venv/bin/python manage.py collectstatic --noinput
launchctl kickstart -k gui/$(id -u)/com.hanplanet.gunicorn
```

**Game server 변경 후 운영 적용:**
```bash
# bumpercar-spiky-server/ 에서 작업
launchctl kickstart -k gui/$(id -u)/com.hanplanet.bumpercar-spiky-server
# 확인: tail -f /tmp/bumpercar-spiky-server.log
```

**Celery worker 변경 후 운영 적용:**
```bash
launchctl kickstart -k gui/$(id -u)/com.hanplanet.celery
# 확인: tail -f log/celery.stdout.log
```

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

**Infrastructure:** Gunicorn → Nginx → Cloudflare Tunnel → hanplanet.com. 모두 launchd 네이티브 데몬으로 실행 (Docker 미사용).

**Git 서버:** Gitea (Homebrew, `/opt/homebrew/bin/gitea`, 포트 3000) + Celery Worker (Redis 브로커) — HanDrive 폴더를 Git 저장소로 변환하는 비동기 작업 처리.

## Configuration

Secrets go in `config/secrets.json` (git-ignored). Key env vars:
- `DJANGO_DEBUG`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`
- `OLLAMA_BASE_URL`, `OLLAMA_MODEL`
- `GAME_JWT_SECRET`, `GAME_WS_PUBLIC_URL`
- `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` (Cloudflare CAPTCHA)
- `FORGEJO_BASE_URL` — Gitea 서버 주소 (기본: `http://localhost:3000`)
- `FORGEJO_ADMIN_TOKEN` — Gitea 관리자 API 토큰 (repo 생성/collaborator 관리용)
- `PUBLIC_GIT_BASE_URL` — 외부 노출 Git URL (운영: `https://hanplanet.com/git`)

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

## Git 서버 (Gitea + Celery)

> Docker 미사용. 모두 launchd로 관리.

**구성:**
- **Gitea** — Homebrew 설치 (`brew install gitea`), 포트 3000, SQLite DB
  - 바이너리: `/opt/homebrew/bin/gitea`
  - 설정: `forgejo/custom/conf/app.ini`
  - work-path: `forgejo/` (data, log, custom 하위 디렉토리)
  - launchd: `com.hanplanet.gitea`
- **Redis** — Celery 브로커 (`redis://127.0.0.1:6379/0`), `brew services start redis`
- **Celery Worker** — `django-celery-results` 백엔드, concurrency=2
  - launchd: `com.hanplanet.celery`
  - 로그: `log/celery.stdout.log`, `log/celery.stderr.log`

**Django 모델:** `GitRepository`, `GitUserMapping`, `GitCollaborator` (`main/models.py`)

**Celery 태스크** (`main/git_tasks.py`):
- `create_repo_task(repo_id)` — 일반 폴더 → Gitea repo 생성 + 파일 push
- `import_repo_task(repo_id)` — 기존 `.git` 폴더 → Gitea mirror push 후 `.git` 삭제

**API 엔드포인트:**
- `POST /api/git/repos/` — repo 생성 요청
- `GET /api/git/repos/by-path/` — 경로로 repo 조회
- `GET /api/git/repos/<id>/status/` — 상태 폴링 (pending/active/failed)
- `POST /api/git/repos/<id>/retry/` — 실패 시 재시도
- `GET /api/git/repos/<id>/clone/` — clone URL 반환
- `POST /api/git/repos/<id>/collaborators/` — collaborator 추가

**Gitea 초기 설정:** `forgejo/setup.sh` 실행 → 출력된 토큰을 `config/secrets.json`의 `FORGEJO_ADMIN_TOKEN`에 저장.

**Git 서버 관련 gitignore 항목:** `forgejo/bin/`, `forgejo/data/`, `forgejo/log/`

## Docker (미사용 — 참고용)

> 현재 운영에서 Docker는 사용하지 않는다. 아래는 이전 설계 참고용.

Container chain: `cloudflared → nginx → gunicorn(django)`.

Key files: `docker-compose.yml`, `Dockerfile`, `docker/entrypoint.sh`, `docker/nginx/default.conf`, `docker/cloudflared/config.yml.example`, `.env.docker.example`.

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
