# Repository Guidelines — bumpercar-spiky-server

## Current Status

- Node.js WebSocket 게임 서버 운영 중
- launchd(`com.hanplanet.bumpercar-spiky-server`)로 자동 실행
- 로컬/운영 포트: `8081` (8080은 자주 점유됨)
- Django에서 JWT 발급 → 게임 서버에서 검증하는 실서명 인증 흐름 적용됨
- `game.hanplanet.com` → Cloudflare Tunnel → `http://localhost:8081` 연결 확인됨
- 브라우저에서 `/ko/fun/bumpercar-spiky/` 접속 → 로그인 → 게임 이동 확인됨

## Project Structure

- `server.js` — 진입점 (World 생성, WebSocket 서버, 게임 루프)
- `config/config.js` — 서버 상수 (world 크기, AOI 셀 크기, tick rate)
- `config/gameplaySettings.json` — 게임 수치 설정 (Django와 공용, 변경 시 서버 재시작 필요)
- `network/websocket.js` — WebSocket 서버 설정, 클라이언트 연결 처리
- `game/gameLoop.js` — 메인 시뮬레이션 루프, 상태 브로드캐스트
- `world/player.js` — 플레이어 상태 객체
- `world/world.js` — World 상태, 이동/입력 처리, AOI 업데이트
- `world/spatialGrid.js` — AOI 공간 그리드 (근접 플레이어 쿼리 최적화)
- `auth/jwt.js` — JWT 검증 헬퍼 (WebSocket 핸드셰이크에 연결)
- `package.json` — Node 패키지 매니페스트 (`ws`, `jsonwebtoken`, `dotenv`)
- `.env` — 런타임 환경변수 (git-ignored, `.env.example` 참고)
- `deploy/launchd/com.hanplanet.bumpercar-spiky-server.plist` — macOS launchd 등록 파일

## Commands

```bash
# 의존성 설치
npm install

# 운영 실행
npm start

# 로컬 개발 (포트 8081)
npm run dev
```

## Production Deployment

**변경 후 운영 적용:**

```bash
launchctl kickstart -k gui/$(id -u)/com.hanplanet.bumpercar-spiky-server
tail -f /tmp/bumpercar-spiky-server.log
```

launchd 등록 (최초 1회):

```bash
cp deploy/launchd/com.hanplanet.bumpercar-spiky-server.plist \
  ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) \
  ~/Library/LaunchAgents/com.hanplanet.bumpercar-spiky-server.plist
launchctl kickstart -k gui/$(id -u)/com.hanplanet.bumpercar-spiky-server
```

상태 확인:

```bash
launchctl print gui/$(id -u)/com.hanplanet.bumpercar-spiky-server
tail -f /tmp/bumpercar-spiky-server.log
tail -f /tmp/bumpercar-spiky-server-error.log
```

## JWT 연동

Django와 게임 서버의 아래 값은 **반드시 동일**해야 합니다.

| Django `secrets.json` | 게임 서버 `.env` |
|----------------------|----------------|
| `GAME_JWT_SECRET` | `JWT_SECRET` |
| `GAME_JWT_ISSUER` | `JWT_ISSUER` |
| `GAME_JWT_AUDIENCE` | `JWT_AUDIENCE` |

## Environment Variables (.env)

```
PORT=8081
JWT_SECRET=...
JWT_ISSUER=...
JWT_AUDIENCE=...
WORLD_SIZE=...
CELL_SIZE=...
TICK_RATE=...
```

## Not Yet Implemented

- 플레이어/계정 영구 데이터 저장
- 바이너리 프로토콜, 클라이언트 예측, 리컨실리에이션
- 실제 게임플레이 (이동 템플릿 수준)
