# Django 운영 세팅 가이드 (Nginx + Gunicorn + Ollama)

이 문서는 현재 프로젝트 설정을 기준으로 운영 환경을 구성하는 방법을 정리합니다.

- Django 앱: `config.wsgi:application`
- Gunicorn 바인드: `127.0.0.1:8000`
- Ollama API: `http://127.0.0.1:11434`
- Nginx 정적 파일 경로: `staticfiles/`, `media/`

## 1. 디렉터리/의존성 준비

```bash
cd /Users/imhanbyeol/Desktop/Development/portfolio_with_django

# 가상환경 (이미 있으면 생략)
python3 -m venv .venv
source .venv/bin/activate

# Python 패키지 설치
pip install -r requirements.txt

# 정적 파일 수집
python manage.py collectstatic --noinput
```

## 2. Gunicorn 서비스 등록 (systemd)

`/etc/systemd/system/portfolio-gunicorn.service`

```ini
[Unit]
Description=Portfolio Django Gunicorn
After=network.target

[Service]
User=ubuntu
Group=www-data
WorkingDirectory=/Users/imhanbyeol/Desktop/Development/portfolio_with_django
ExecStart=/Users/imhanbyeol/Desktop/Development/portfolio_with_django/.venv/bin/python -m gunicorn config.wsgi:application --bind 127.0.0.1:8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

적용:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now portfolio-gunicorn
sudo systemctl status portfolio-gunicorn
```

## 3. Ollama 설치 및 서비스화

설치:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

모델 준비:

```bash
ollama pull llama3.2:latest
```

systemd 등록 (`/etc/systemd/system/ollama.service`):

```ini
[Unit]
Description=Ollama Service
After=network.target

[Service]
User=ubuntu
ExecStart=/usr/local/bin/ollama serve
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

적용:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ollama
sudo systemctl status ollama
curl http://127.0.0.1:11434/api/tags
```

## 4. Nginx 설정

현재 프로젝트의 Nginx 설정 파일은 `nginx/portfolio.conf`입니다.
운영 서버에서는 경로/유저에 맞게 조정 후 `/etc/nginx/sites-available/portfolio`로 배치하세요.

핵심 포인트:

- `/static/` -> `.../staticfiles/` alias
- `/media/` -> `.../media/` alias
- `/` -> `http://127.0.0.1:8000` 프록시

적용:

```bash
sudo ln -sf /etc/nginx/sites-available/portfolio /etc/nginx/sites-enabled/portfolio
sudo nginx -t
sudo systemctl restart nginx
sudo systemctl status nginx
```

## 5. Cloudflare + Cloudflare Tunnel 설정

### 5-1. cloudflared 설치

```bash
# Ubuntu/Debian 예시
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update
sudo apt install -y cloudflared
```

### 5-2. 터널 생성 및 DNS 연결

```bash
# Cloudflare 로그인 (브라우저 인증)
cloudflared tunnel login

# 터널 생성
cloudflared tunnel create portfolio-tunnel

# DNS 라우팅 (도메인/서브도메인 연결)
cloudflared tunnel route dns portfolio-tunnel hanplanet.com
cloudflared tunnel route dns portfolio-tunnel www.hanplanet.com
```

### 5-3. 터널 설정 파일 작성

`/etc/cloudflared/config.yml`

```yaml
tunnel: portfolio-tunnel
credentials-file: /etc/cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: hanplanet.com
    service: http://localhost:80
  - hostname: www.hanplanet.com
    service: http://localhost:80
  - service: http_status:404
```

참고:
- 현재 가이드는 Nginx를 앞단으로 사용하므로 `service: http://localhost:80`을 권장합니다.
- Nginx 없이 Gunicorn만 쓰면 `service: http://localhost:8000`으로 설정합니다.

### 5-4. cloudflared 서비스 등록 (재부팅 자동실행)

`/etc/systemd/system/cloudflared.service`

```ini
[Unit]
Description=Cloudflare Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/cloudflared --config /etc/cloudflared/config.yml tunnel run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

적용:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared
```

## 6. Django/Ollama 연결 확인

`config/settings.py` 기준값:

- `OLLAMA_BASE_URL = "http://localhost:11434"`
- `OLLAMA_MODEL = "llama3.2:latest"`

확인:

```bash
curl -I http://127.0.0.1:8000
curl -I http://127.0.0.1
curl http://127.0.0.1:11434/api/tags
```

## 7. 운영 체크리스트

- `python manage.py collectstatic --noinput` 실행 여부
- `portfolio-gunicorn`, `ollama`, `nginx`, `cloudflared` 서비스 모두 `active (running)`
- `/static/...` CSS 응답 확인
- `/api/chat/` 호출 시 정상 응답 확인

## 8. 자주 쓰는 명령

```bash
# 서비스 재시작
sudo systemctl restart portfolio-gunicorn
sudo systemctl restart ollama
sudo systemctl restart nginx
sudo systemctl restart cloudflared

# 로그 확인
sudo journalctl -u portfolio-gunicorn -f
sudo journalctl -u ollama -f
sudo journalctl -u nginx -f
sudo journalctl -u cloudflared -f
```

## 참고

현재 `SECRET_KEY`는 `config/settings.py`에 코드 고정값으로 들어가 있습니다.
운영 배포 시에는 환경변수/비밀저장소 방식으로 분리하는 것을 권장합니다.
