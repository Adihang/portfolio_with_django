## Result
https://www.hanplanet.com/portfolio

https://www.hanplanet.com/Stratagem_Hero

https://www.hanplanet.com/Salvations_Edge_4/

## Develop
```
python manage.py runserver
```
***
## config/settings.py
```
DEBUG = False
```
***
## requirements
```
pip3 install -r requirements.txt
```
***
## Project Structure
```
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
