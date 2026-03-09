# Bumper Car Spiky Server

Node.js WebSocket multiplayer game server for Bumper Car Spiky.

## Server Architecture

이 게임은 Django 본 서버와 Node WebSocket 게임 서버가 역할을 나눠서 동작합니다.

- 본 서버(Django): 게임 페이지 렌더링, JWT 발급, 관리자 설정 페이지 제공
- 게임 서버(Node): 실시간 이동, 충돌, NPC, 공용 목숨, 전투 상태 계산
- 브라우저 클라이언트: Django에서 토큰을 받아 WebSocket으로 게임 서버에 접속

운영 연결 흐름:

1. 사용자가 Django 페이지 `/ko/fun/bumpercar-spiky/` 또는 `/en/fun/bumpercar-spiky/`에 접속
2. 브라우저가 Django API `/ko/api/game-auth-token/` 또는 `/en/api/game-auth-token/`으로 게임 JWT 요청
3. Django가 `GAME_JWT_SECRET`, `GAME_JWT_ISSUER`, `GAME_JWT_AUDIENCE` 기준으로 토큰 발급
4. 브라우저가 Django가 내려준 `ws_url`로 WebSocket 연결
5. 현재 운영 기본 공개 주소는 `wss://game.hanplanet.com`
6. 게임 서버가 `.env`의 `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`로 토큰 검증
7. 검증 통과 후 게임 서버가 월드 상태를 주기적으로 전송

즉, 인증과 페이지는 Django가 담당하고, 실시간 판정은 이 Node 서버가 담당합니다.

## File Structure

핵심 파일 구조는 아래와 같습니다.

- `server.js`
  서버 진입점입니다. `World`를 만들고, WebSocket 서버를 열고, 게임 루프를 시작합니다.
- `config/config.js`
  포트, 월드 크기, 셀 크기, tick rate, JWT 검증값 같은 공통 런타임 설정입니다.
- `config/gameplaySettings.js`
  Django와 공유하는 게임 수치 파일 `Hanplanet/config/bumpercar_spiky_settings.json`을 읽습니다.
- `auth/jwt.js`
  Django가 발급한 게임 JWT를 검증합니다.
- `network/websocket.js`
  WebSocket 연결/종료 처리, guest 제한, ping/pong, 입력 수신을 담당합니다.
- `game/gameLoop.js`
  고정 tick 루프를 돌면서 월드를 업데이트하고 각 클라이언트에 주변 상태를 전송합니다.
- `world/player.js`
  플레이어/NPC 한 명의 상태 구조 정의입니다.
- `world/world.js`
  실제 게임 핵심 로직입니다. 이동, 가속, 충돌, 사망, 리스폰, 네르 AI, 공용 목숨을 처리합니다.
- `world/spatialGrid.js`
  주변 플레이어만 빠르게 찾기 위한 공간 분할 구조입니다.
- `deploy/launchd/com.hanplanet.bumpercar-spiky-server.plist`
  macOS에서 게임 서버를 자동 실행/유지하기 위한 launchd 템플릿입니다.

## Initial Setup

```bash
cd /Users/imhanbyeol/Development/Hanplanet/bumpercar-spiky-server
cp .env.example .env
npm install
```

`.env` defaults are already usable for local boot. Change values only when needed.

Recommended local change if `8080` is already in use:

```bash
PORT=8081 npm start
```

Or use the included dev script:

```bash
npm run dev
```

## Run

```bash
npm start
```

The server listens on port `8080` by default.

## Environment

Copy `.env.example` to `.env` and adjust values as needed.

- `PORT`: WebSocket server port
- `WORLD_SIZE`: world width and height
- `CELL_SIZE`: AOI cell size
- `TICK_RATE`: simulation ticks per second
- `JWT_SECRET`: shared secret used to verify Django-issued game JWTs
- `JWT_ISSUER`: expected JWT issuer
- `JWT_AUDIENCE`: expected JWT audience

Important:
- `JWT_SECRET` must match Django `GAME_JWT_SECRET`
- `JWT_ISSUER` must match Django `GAME_JWT_ISSUER`
- `JWT_AUDIENCE` must match Django `GAME_JWT_AUDIENCE`

## WebSocket

- Default URL: `ws://localhost:8080`
- Alternate local URL example: `ws://localhost:8081`
- Optional auth: `ws://localhost:8080?token=<jwt-or-user-id>`
- On connect, the server sends a `welcome` message with the assigned player state.

운영 기준 공개 경로:

- 게임 페이지: `https://www.hanplanet.com/ko/fun/bumpercar-spiky/`
- 토큰 발급 API: `https://www.hanplanet.com/ko/api/game-auth-token/`
- 게임 WebSocket: `wss://game.hanplanet.com`

## Browser Play Test With Hanplanet

1. Start Django locally from `/Users/imhanbyeol/Development/Hanplanet`.
2. Start this game server with `npm run dev`.
3. Open `http://127.0.0.1:8000/ko/fun/bumpercar-spiky/`.
4. If you are not signed in, log in through the existing Hanplanet docs login flow.
5. The browser requests `/ko/api/game-auth-token/` and receives a signed JWT plus `ws_url`.
6. The browser opens the returned WebSocket URL, which is usually `ws://127.0.0.1:8081` locally.

Current note:
- This is browser-playable for local testing now.
- Django now exposes a game token endpoint and the browser requests a signed JWT before opening the WebSocket.
- The game server verifies the JWT with `JWT_SECRET`, `JWT_ISSUER`, and `JWT_AUDIENCE`.
- Verified locally through the Hanplanet login flow and in-browser movement test.
- Dedicated local `GAME_JWT_SECRET` / `JWT_SECRET` values are now configured separately from Django `SECRET_KEY`.

## JWT Contract

Set the same values on both sides:

- Django: `GAME_JWT_SECRET`, `GAME_JWT_ISSUER`, `GAME_JWT_AUDIENCE`
- Game server: `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`

Local example:

```bash
export GAME_JWT_SECRET="local-game-secret"
export GAME_JWT_ISSUER="http://127.0.0.1:8000"
export GAME_JWT_AUDIENCE="hanplanet-game"

export JWT_SECRET="local-game-secret"
export JWT_ISSUER="http://127.0.0.1:8000"
export JWT_AUDIENCE="hanplanet-game"
```

Production-style note:
- Django values are currently loaded from `config/secrets.json` or environment variables.
- The game server uses its own `.env`.
- These two sides must always stay in sync.

## Runtime Flow

서버 내부 동작 순서는 아래와 같습니다.

1. `server.js`가 `World` 인스턴스를 생성
2. `network/websocket.js`가 포트를 열고 WebSocket 연결 수락
3. 클라이언트가 보낸 JWT를 `auth/jwt.js`가 검증
4. 검증이 통과되면 `world.addPlayer()`로 월드에 엔티티 생성
5. 클라이언트 입력은 `world.handleInput()`으로 누적
6. `game/gameLoop.js`가 `TICK_RATE` 기준으로 `world.update()` 실행
7. `world/world.js`에서 이동, 가속, 충돌, NPC, 사망, 리스폰, 공용 목숨 계산
8. `spatialGrid` 기준으로 주변 엔티티만 추려 각 클라이언트에 상태 배열 전송

즉, 입력 수신은 WebSocket 레이어에서, 실제 판정은 `world/world.js`에서, 전송 루프는 `game/gameLoop.js`에서 담당합니다.

## Cloudflare Tunnel

If `game.hanplanet.com` is used publicly, Cloudflare Tunnel also needs its own ingress rule.

Current host-side config pattern:

```yml
ingress:
  - hostname: www.hanplanet.com
    service: http://localhost:8000
  - hostname: hanplanet.com
    service: http://localhost:8000
  - hostname: game.hanplanet.com
    service: http://localhost:8081
  - hostname: ssh.hanplanet.com
    service: ssh://localhost:22
  - service: http_status:404
```

Required commands:

```bash
cloudflared tunnel --config ~/.cloudflared/config.yml ingress validate
cloudflared tunnel route dns hanplanet-local game.hanplanet.com
```

Then restart cloudflared so the new ingress rule is loaded.

Important:
- Without the `game.hanplanet.com` ingress rule, the browser game page will show a disconnected state even if Django and the Node game server are both running.
- In the current setup, Cloudflare Tunnel routes `game.hanplanet.com` directly to `http://localhost:8081`.
- This means nginx `:80` is not required for the public game WebSocket path when Tunnel is used this way.

## Public Verification Checklist

1. Confirm Django is serving the game page.
2. Confirm the game server is listening on `8081`.
3. Confirm `game.hanplanet.com` DNS exists in the tunnel.
4. Confirm cloudflared was restarted after config changes.
5. Confirm a WebSocket upgrade returns `101 Switching Protocols`.
6. Open `https://www.hanplanet.com/ko/fun/bumpercar-spiky/` and verify the connection status becomes connected.

## Client Input Format

Clients should send JSON payloads like:

```json
{
  "up": false,
  "down": false,
  "left": false,
  "right": true
}
```

The server broadcasts an array of nearby players:

```json
[
  {
    "id": "player-id",
    "x": 100,
    "y": 200
  }
]
```

## Local Boot Checklist

1. Copy `.env.example` to `.env`.
2. Run `npm install`.
3. Start with `npm start` or `npm run dev`.
4. Connect a WebSocket client to the configured port.
5. Send movement input JSON at a fixed interval.

## launchd

Template file:

- `deploy/launchd/com.hanplanet.bumpercar-spiky-server.plist`

Example install:

```bash
cp /Users/imhanbyeol/Development/Hanplanet/bumpercar-spiky-server/deploy/launchd/com.hanplanet.bumpercar-spiky-server.plist \
  ~/Library/LaunchAgents/com.hanplanet.bumpercar-spiky-server.plist

launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.hanplanet.bumpercar-spiky-server.plist
launchctl kickstart -k gui/$(id -u)/com.hanplanet.bumpercar-spiky-server
```

Example remove:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.hanplanet.bumpercar-spiky-server.plist
rm -f ~/Library/LaunchAgents/com.hanplanet.bumpercar-spiky-server.plist
```

## Current Limitations

- No persistent storage yet
- No Django-side JWT issue/refresh flow yet
- No room system or matchmaker yet
- No separate production process supervisor outside the current local launchd template yet
