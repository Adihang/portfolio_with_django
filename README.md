# Portfolio With Django

## Result
- https://www.hanplanet.com/

## Local Development

```bash
cd /Users/imhanbyeol/Development/Hanplanet
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

## Configuration

`config/secrets.json` (git-ignored)에 시크릿을 관리합니다.

```json
{
  "SECRET_KEY": "여기에_충분히_긴_랜덤_키",
  "FORGEJO_BASE_URL": "http://localhost:3000",
  "FORGEJO_ADMIN_TOKEN": "gitea-admin-api-token",
  "PUBLIC_GIT_BASE_URL": "https://hanplanet.com/git"
}
```

```bash
chmod 600 config/secrets.json
```

주요 환경변수: `DJANGO_DEBUG`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`,
`OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `GAME_JWT_SECRET`, `GAME_WS_PUBLIC_URL`,
`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`

## Deployment (launchd — Docker 미사용)

운영은 모두 macOS launchd 네이티브 데몬으로 실행합니다. Docker는 사용하지 않습니다.
자세한 내용은 `DEPLOYMENT.md`를 참고하세요.

### 실행 중인 서비스

| 서비스 | launchd 라벨 | 재시작 명령 |
|--------|-------------|------------|
| Django (gunicorn) | `com.hanplanet.gunicorn` | `launchctl kickstart -k gui/$(id -u)/com.hanplanet.gunicorn` |
| Nginx | `com.hanplanet.nginx` | `launchctl kickstart -k gui/$(id -u)/com.hanplanet.nginx` |
| Git 서버 (Gitea) | `com.hanplanet.gitea` | `launchctl kickstart -k gui/$(id -u)/com.hanplanet.gitea` |
| Celery Worker | `com.hanplanet.celery` | `launchctl kickstart -k gui/$(id -u)/com.hanplanet.celery` |
| 게임 서버 | `com.hanplanet.bumpercar-spiky-server` | `launchctl kickstart -k gui/$(id -u)/com.hanplanet.bumpercar-spiky-server` |

### Django 변경 후 운영 적용

```bash
.venv/bin/python manage.py collectstatic --noinput
launchctl kickstart -k gui/$(id -u)/com.hanplanet.gunicorn
```

배포 전 점검:

```bash
.venv/bin/python manage.py check
DJANGO_SECRET_KEY='<YOUR_SECRET>' .venv/bin/python manage.py check --deploy
```

## Git 서버 (HanDrive Git 기능)

HanDrive 폴더를 Git 저장소로 변환하는 기능을 위해 Gitea + Celery를 사용합니다.

- **Gitea**: `brew install gitea` 로 설치, 포트 3000, 설정: `forgejo/custom/conf/app.ini`
- **Redis**: Celery 브로커 (`brew services start redis`)
- **Celery Worker**: `django-celery-results` 백엔드

초기 설정:
```bash
cd forgejo && bash setup.sh
# 출력된 토큰을 config/secrets.json의 FORGEJO_ADMIN_TOKEN에 저장
pip install -r requirements.txt
python manage.py migrate
```

## Access Log Retention (30일)

Nginx 접속 로그는 JSON 포맷(`access_json.log`)으로 기록, 30일 보관합니다.

- 로그: `/opt/homebrew/var/log/nginx/access_json.log`
- 회전 스크립트: `scripts/rotate-nginx-access-json.sh`
- 관리자 조회: `/admin/main/accesslog/` (파일 직접 읽기, DB 미적재)
- 일일 요약: `python manage.py summarize_access_logs --date YYYY-MM-DD`
- 요약 조회: `/admin/main/accesslog-summary/`
- 자동 스케줄: 매일 00:05 Django 내부 스케줄러

## Project Structure

```text
Hanplanet/
├─ config/                 # Django 프로젝트 설정 (settings, urls, wsgi/asgi, celery)
├─ main/                   # 메인 앱 (models, views, urls, admin, migrations)
│  ├─ forgejo_client.py    # Gitea API 클라이언트
│  ├─ git_service.py       # Git 서비스 계층
│  └─ git_tasks.py         # Celery 비동기 태스크 (repo 생성/import)
├─ templates/
│  ├─ main/                # 포트폴리오 페이지 템플릿
│  ├─ fun/                 # 미니게임 페이지 템플릿
│  ├─ handrive/            # HanDrive 문서 편집기 템플릿
│  ├─ partials/            # 공통 재사용 파셜 (ui_i18n.html 등)
│  └─ popup/               # 팝업/모달 템플릿
├─ static/                 # 정적 파일 소스 (css, js, 이미지)
├─ staticfiles/            # collectstatic 결과물 (직접 수정 금지)
├─ media/                  # 업로드 파일 저장 경로
├─ forgejo/                # Gitea work-path (custom/conf/app.ini, data/, log/)
├─ bumpercar-spiky-server/ # Node.js WebSocket 게임 서버
├─ deploy/launchd/         # macOS launchd plist 파일들
├─ nginx/                  # Nginx 설정
├─ scripts/                # 유지보수 스크립트
├─ manage.py               # Django 관리 커맨드 진입점
├─ requirements.txt        # Python 의존성 목록
└─ db.sqlite3              # SQLite DB
```

## 주요 라우트

- `/portfolio/` : 포트폴리오 메인
- `/project/<id>/` : 프로젝트 상세
- `/ko/handrive/` : HanDrive 문서 편집기
- `/api/chat/` : Ollama 기반 챗봇 API
- `/api/git/repos/` : Git 저장소 관리 API
- `/ko/fun/bumpercar-spiky/` : 범퍼카 멀티플레이어 게임
- `/Stratagem_Hero/` : 미니게임
- `/Salvations_Edge_4/` : 미니게임
