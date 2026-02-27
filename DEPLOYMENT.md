# Django 운영/배포 가이드 (Gunicorn + Cloudflare Tunnel + Ollama)

이 문서는 현재 프로젝트 코드(`config/settings.py`) 기준의 운영 배포 방법을 정리합니다.

현재 기본 구성은 아래와 같습니다.

- Django 앱: `config.wsgi:application`
- Gunicorn 바인드: `127.0.0.1:8000`
- Ollama API: `http://127.0.0.1:11434`
- Cloudflare Tunnel ingress: `hanplanet.com`, `www.hanplanet.com` -> `http://localhost:8000`
- SSH ingress(권장 분리): `ssh.hanplanet.com` -> `ssh://localhost:22` (Docker cloudflared는 `ssh://host.docker.internal:22`)
- 정적/미디어: `DEBUG=False`에서도 `DJANGO_SERVE_FILES=True`일 때 Django가 직접 서빙

## 1. 필수 준비

```bash
cd /Users/imhanbyeol/Development/portfolio_with_django

# 가상환경 (이미 있으면 생략)
python3 -m venv .venv
source .venv/bin/activate

# 의존성 설치
pip install -r requirements.txt

# 정적 파일 수집 (권장)
python manage.py collectstatic --noinput
```

## 2. 시크릿/환경변수 설정 (중요)

현재 코드에서는 `DEBUG=False`일 때 `SECRET_KEY`가 반드시 필요합니다.
우선순위는 아래 순서입니다.

1. 환경변수 `DJANGO_SECRET_KEY`
2. `config/secrets.json`의 `SECRET_KEY`

### 2-1. `config/secrets.json` 방식 (권장)

`config/secrets.json`은 `.gitignore` 대상입니다.

```json
{
  "SECRET_KEY": "여기에_충분히_긴_랜덤_키"
}
```

권한 권장:

```bash
chmod 600 config/secrets.json
```

### 2-2. 주요 환경변수

- `DJANGO_DEBUG` (기본: `false`)
- `DJANGO_SECRET_KEY`
- `DJANGO_ALLOWED_HOSTS` (쉼표 구분)
- `DJANGO_CSRF_TRUSTED_ORIGINS` (쉼표 구분, 스킴 포함)
- `PUBLIC_BASE_URL` (예: `https://hanplanet.com`)
- `DJANGO_SERVE_FILES` (기본: `true`)
- `OLLAMA_BASE_URL` (기본: `http://localhost:11434`)
- `OLLAMA_MODEL` (기본: `llama3.2:latest`)

보안 관련(필요시 오버라이드):

- `DJANGO_SECURE_SSL_REDIRECT`
- `DJANGO_SESSION_COOKIE_SECURE`
- `DJANGO_CSRF_COOKIE_SECURE`
- `DJANGO_SECURE_HSTS_SECONDS`
- `DJANGO_SECURE_HSTS_INCLUDE_SUBDOMAINS`
- `DJANGO_SECURE_HSTS_PRELOAD`

## 3. Gunicorn 서비스 등록

### 3-1. Linux systemd 예시

`/etc/systemd/system/portfolio-gunicorn.service`

```ini
[Unit]
Description=Portfolio Django Gunicorn
After=network.target

[Service]
User=ubuntu
Group=www-data
WorkingDirectory=/Users/imhanbyeol/Development/portfolio_with_django
ExecStart=/Users/imhanbyeol/Development/portfolio_with_django/.venv/bin/python -m gunicorn config.wsgi:application --bind 127.0.0.1:8000 --chdir /Users/imhanbyeol/Development/portfolio_with_django
Restart=always
RestartSec=3

# 환경변수로 운영 시크릿을 줄 경우
# Environment="DJANGO_SECRET_KEY=..."

[Install]
WantedBy=multi-user.target
```

적용:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now portfolio-gunicorn
sudo systemctl status portfolio-gunicorn
```

### 3-2. macOS launchd (현재 로컬 운영 방식)

현재 구성:

- LaunchAgent: `~/Library/LaunchAgents/com.hanplanet.gunicorn.plist`
- 실행 명령: `.venv/bin/python -m gunicorn config.wsgi:application --bind 127.0.0.1:8000 --chdir ...`

상태 확인:

```bash
launchctl print gui/$(id -u)/com.hanplanet.gunicorn
launchctl list | rg com.hanplanet.gunicorn
```

재시작:

```bash
launchctl kickstart -k gui/$(id -u)/com.hanplanet.gunicorn
```

## 4. Ollama 서비스

설치:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

모델 준비:

```bash
ollama pull llama3.2:latest
```

확인:

```bash
curl http://127.0.0.1:11434/api/tags
```

## 5. Cloudflare Tunnel

`~/.cloudflared/config.yml` 예시:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /Users/<USER>/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: www.hanplanet.com
    service: http://localhost:8000
  - hostname: hanplanet.com
    service: http://localhost:8000
  - hostname: ssh.hanplanet.com
    service: ssh://localhost:22
  - service: http_status:404
```

실행:

```bash
cloudflared tunnel ingress validate
cloudflared tunnel route dns <TUNNEL_NAME> ssh.hanplanet.com
cloudflared tunnel run <TUNNEL_NAME>
```

자동실행 사용 시 LaunchAgent/systemd에 동일 명령을 등록합니다.

### 5-1. 보안 필수 설정 (SSH)

1. Cloudflare Access에서 `ssh.hanplanet.com` 애플리케이션 생성
2. 허용 대상을 최소화(본인 계정/그룹만)하고 MFA를 필수로 설정
3. 서버 방화벽/보안그룹에서 22 포트를 인터넷에 직접 노출하지 않음
4. SSH 서버는 키 기반 인증만 허용

`/etc/ssh/sshd_config` 권장:

```text
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
```

변경 후:

```bash
sudo sshd -t
sudo systemctl restart sshd  # Linux
```

### 5-2. 클라이언트 SSH 설정

`~/.ssh/config`:

```sshconfig
Host ssh.hanplanet.com
  User <SSH_USER>
  ProxyCommand /opt/homebrew/bin/cloudflared access ssh --hostname %h
```

접속:

```bash
ssh <SSH_USER>@ssh.hanplanet.com
```

### 5-3. 충돌 방지 원칙

- 웹과 SSH는 반드시 서로 다른 hostname 사용 (`hanplanet.com` 계열과 `ssh.hanplanet.com` 분리)
- `cloudflared` 프로세스를 중복 실행하지 않고 하나의 터널 ingress만 확장
- ingress는 위에서 아래 순서대로 평가되므로 마지막 `http_status:404` 규칙 유지

## 6. 정적/미디어 서빙 정책

현재 코드는 아래 정책입니다.

- `DEBUG=True`: Django 개발용 static/media 서빙
- `DEBUG=False` + `DJANGO_SERVE_FILES=true`: Django가 `/static/`, `/media/` 직접 서빙
- `DEBUG=False` + `DJANGO_SERVE_FILES=false`: Django가 static/media 미서빙 (Nginx/CDN 필요)

Nginx 앞단으로 운영한다면:

1. Nginx에서 `/static/`, `/media/`를 alias로 직접 서빙
2. 앱 환경변수 `DJANGO_SERVE_FILES=false` 권장

## 7. 배포 검증 체크리스트

```bash
# Django 기본 점검
.venv/bin/python manage.py check

# 배포 점검 (SECRET_KEY 필요)
DJANGO_SECRET_KEY='<YOUR_SECRET>' .venv/bin/python manage.py check --deploy

# 로컬 앱 응답
curl -I http://127.0.0.1:8000

# HTTPS 오프로딩 환경 가정 응답 점검
curl -I -H 'X-Forwarded-Proto: https' http://127.0.0.1:8000/portfolio/
curl -I -H 'X-Forwarded-Proto: https' http://127.0.0.1:8000/static/css/style.css
curl -I -H 'X-Forwarded-Proto: https' http://127.0.0.1:8000/media/profile.jpg

# 외부 도메인 확인
curl -I https://hanplanet.com
```

## 8. 트러블슈팅

### 8-1. Gunicorn 부팅 실패 (`ImproperlyConfigured: DJANGO_SECRET_KEY ... required`)

- `config/secrets.json` 존재 여부 확인
- 또는 서비스에 `DJANGO_SECRET_KEY` 환경변수 주입

### 8-2. CSS/이미지 404

- `DJANGO_SERVE_FILES` 값 확인 (`true` 필요)
- `config/urls.py`에 `/static/`, `/media/` 라우트 반영 여부 확인
- `collectstatic` 재실행

### 8-3. 루트 URL 301 리다이렉트

- `SECURE_SSL_REDIRECT=True` 정책으로 정상 동작
- 프록시/터널 환경에서는 `X-Forwarded-Proto: https` 전달 필요

## 9. 자주 쓰는 명령

```bash
# Gunicorn 프로세스 확인
lsof -nP -iTCP:8000 -sTCP:LISTEN
ps aux | rg 'gunicorn config.wsgi' | rg -v rg

# launchd 로그
tail -f ~/Library/Logs/gunicorn.err.log
tail -f ~/Library/Logs/gunicorn.out.log

# cloudflared 상태
ps aux | rg cloudflared | rg -v rg
curl -I https://hanplanet.com
```

## 10. Docker Compose 운영 (Cloudflare Tunnel + Nginx + Gunicorn + Django)

현재 로컬/운영 구조를 컨테이너로 동일하게 구성할 수 있습니다.

- Django + Gunicorn: `Dockerfile`, `docker/entrypoint.sh`
- Nginx: `docker/nginx/default.conf`
- Cloudflare Tunnel: `docker/cloudflared/config.yml`
- 오케스트레이션: `docker-compose.yml`

### 10-1. 준비

```bash
cd /Users/imhanbyeol/Development/portfolio_with_django

cp .env.docker.example .env.docker
cp docker/cloudflared/config.yml.example docker/cloudflared/config.yml
touch db.sqlite3
```

`docker/cloudflared/config.yml`의 `<TUNNEL_ID>`를 실제 값으로 바꾼 뒤,
같은 이름의 credentials 파일을 배치합니다.

```bash
cp ~/.cloudflared/<TUNNEL_ID>.json docker/cloudflared/<TUNNEL_ID>.json

# SSH도 열 경우 DNS 라우트 추가
cloudflared tunnel route dns <TUNNEL_NAME> ssh.hanplanet.com
```

`docker/cloudflared/config.yml`에서 SSH ingress는 아래 값을 사용합니다.

```yaml
- hostname: ssh.hanplanet.com
  service: ssh://host.docker.internal:22
```

### 10-2. 실행

```bash
docker compose up -d --build
docker compose ps
```

### 10-3. 동작 확인

```bash
# nginx(80) -> django(gunicorn) 확인
curl -I http://127.0.0.1/portfolio/

# 컨테이너 로그 확인
docker compose logs -f django nginx cloudflared
```

### 10-4. 중지/재시작

```bash
docker compose down
docker compose up -d
```

## 11. 접속 로그 30일 보관 (Nginx JSON Access Log)

현재 저장소에는 접속 로그를 JSON 형태로 남기고 30일 보관하는 설정이 포함되어 있습니다.

- Nginx 로그 포맷: `nginx/nginx.autorun.conf` (`access_json`)
- 로그 파일: `/opt/homebrew/var/log/nginx/access_json.log`
- 회전/정리 스크립트: `scripts/rotate-nginx-access-json.sh`
- macOS launchd 에이전트 템플릿: `deploy/launchd/com.hanplanet.nginx-accesslog-rotate.plist`
- 로그 조회 URL: `/admin/main/accesslog/` (파일 직접 조회)
- 일일 요약 명령어: `python manage.py summarize_access_logs --date YYYY-MM-DD`
- 요약 파일: `/opt/homebrew/var/log/nginx/summaries/access_summary_YYYY-MM-DD.(json|md)`
- 요약 조회 URL: `/admin/main/accesslog-summary/`
- 기본 자동 요약: Django 서버 내부 스케줄러(매일 00:05, 전날 날짜)
- (옵션) OS 스케줄러 템플릿: `deploy/launchd/com.hanplanet.nginx-accesslog-summary.plist`

### 11-1. Nginx 재적용

```bash
/opt/homebrew/opt/nginx/bin/nginx -t -c /Users/imhanbyeol/Development/portfolio_with_django/nginx/nginx.autorun.conf
launchctl kickstart -k gui/$(id -u)/homebrew.mxcl.nginx
```

### 11-2. 수동 회전 테스트

```bash
cd /Users/imhanbyeol/Development/portfolio_with_django
./scripts/rotate-nginx-access-json.sh
ls -lh /opt/homebrew/var/log/nginx/access_json*
```

### 11-3. 매일 자동 실행(00:05) 등록

```bash
cp /Users/imhanbyeol/Development/portfolio_with_django/deploy/launchd/com.hanplanet.nginx-accesslog-rotate.plist \
  ~/Library/LaunchAgents/com.hanplanet.nginx-accesslog-rotate.plist

launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hanplanet.nginx-accesslog-rotate.plist
launchctl kickstart -k gui/$(id -u)/com.hanplanet.nginx-accesslog-rotate
launchctl print gui/$(id -u)/com.hanplanet.nginx-accesslog-rotate
```

삭제하려면:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.hanplanet.nginx-accesslog-rotate.plist
rm -f ~/Library/LaunchAgents/com.hanplanet.nginx-accesslog-rotate.plist
```

### 11-4. Django Admin에서 조회

관리자 페이지는 DB 적재 없이 Nginx 로그 파일을 직접 읽어 보여줍니다.

- URL: `/admin/main/accesslog/`
- 관리자 메인(`/admin/`)의 `운영 로그` 섹션 링크로 이동 가능
- 접속할 때마다 파일을 다시 읽어 최신 로그를 표시
- 조회 대상: `access_json.log`, `access_json_*.log`, `access_json_*.log.gz`
- 조회 화면은 커스텀 URL/템플릿 기반이며 DB 모델을 사용하지 않음

### 11-5. 데이터 적재 관련 현재 상태

- `AccessLog` 모델/테이블은 삭제됨 (DB에 로그 미적재 정책)
- `import_access_logs` 관리 명령어는 제거됨
- 보관 정책은 파일 회전 + 30일 삭제로만 관리

### 11-6. 일일 요약 생성(수동)

```bash
cd /Users/imhanbyeol/Development/portfolio_with_django
.venv/bin/python manage.py summarize_access_logs --date "$(date -v-1d '+%Y-%m-%d')"
ls -lh /opt/homebrew/var/log/nginx/summaries/access_summary_*
```

### 11-7. 매일 00:05 자동 요약 등록 (전날 날짜)

기본 권장 방식은 **Django 내부 스케줄러** 사용입니다.  
아래 launchd 등록은 서버 프로세스 외부에서 별도로 돌리고 싶을 때만 사용하세요.

```bash
cp /Users/imhanbyeol/Development/portfolio_with_django/deploy/launchd/com.hanplanet.nginx-accesslog-summary.plist \
  ~/Library/LaunchAgents/com.hanplanet.nginx-accesslog-summary.plist

launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hanplanet.nginx-accesslog-summary.plist
launchctl kickstart -k gui/$(id -u)/com.hanplanet.nginx-accesslog-summary
launchctl print gui/$(id -u)/com.hanplanet.nginx-accesslog-summary
```

삭제하려면:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.hanplanet.nginx-accesslog-summary.plist
rm -f ~/Library/LaunchAgents/com.hanplanet.nginx-accesslog-summary.plist
```
