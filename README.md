# Portfolio With Django

## Result
- https://www.hanplanet.com/portfolio
- https://www.hanplanet.com/Stratagem_Hero
- https://www.hanplanet.com/Salvations_Edge_4/

## Local Development

```bash
cd /Users/imhanbyeol/Development/portfolio_with_django
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py runserver
```

## Configuration

`config/settings.py`는 환경변수/시크릿 파일 기반으로 동작합니다.

중요:
- `DEBUG=False` 환경에서는 `SECRET_KEY`가 필수입니다.
- 우선순위: `DJANGO_SECRET_KEY` -> `config/secrets.json`의 `SECRET_KEY`

예시 (`config/secrets.json`):

```json
{
  "SECRET_KEY": "your-long-random-secret-key"
}
```

권한 권장:

```bash
chmod 600 config/secrets.json
```

## Deployment

배포/운영 상세 문서는 `DEPLOYMENT.md`를 기준으로 사용하세요.

현재 운영 기준:
- Gunicorn: `127.0.0.1:8000`
- Cloudflare Tunnel: `hanplanet.com`, `www.hanplanet.com` -> `http://localhost:8000`
- Ollama: `http://127.0.0.1:11434`
- Static/Media: `DEBUG=False`에서도 `DJANGO_SERVE_FILES=true`면 Django에서 직접 서빙

배포 전 점검:

```bash
.venv/bin/python manage.py check
DJANGO_SECRET_KEY='<YOUR_SECRET>' .venv/bin/python manage.py check --deploy
```

정적 파일 수집:

```bash
python manage.py collectstatic --noinput
```

## Project Structure

```text
portfolio_with_django/
├─ config/                 # Django 프로젝트 설정 (settings, urls, wsgi/asgi)
├─ main/                   # 메인 앱 (models, views, urls, admin, migrations)
├─ templates/              # HTML 템플릿
│  ├─ main/                # 포트폴리오 페이지 템플릿
│  └─ fun/                 # 미니게임 페이지 템플릿
├─ static/                 # 정적 파일 소스 (css, js, 이미지)
├─ staticfiles/            # collectstatic 결과물
├─ media/                  # 업로드 파일 저장 경로
├─ manage.py               # Django 관리 커맨드 진입점
├─ requirements.txt        # Python 의존성 목록
└─ db.sqlite3              # 로컬 개발 DB
```

## 주요 라우트
- `/portfolio/` : 포트폴리오 메인
- `/project/<id>/` : 프로젝트 상세
- `/api/chat/` : Ollama 기반 챗봇 API
- `/Stratagem_Hero/` : 미니게임
- `/Salvations_Edge_4/` : 미니게임
