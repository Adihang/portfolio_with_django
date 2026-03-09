# Repository Guidelines

## Current Status
- This folder was created from `Multiplayer_Game_Server_Template.md`.
- A runnable Node.js WebSocket server skeleton is in place.
- `npm install` has been completed.
- `npm start` was verified to boot and print startup logs.
- `8080` is currently occupied in the local machine, so `PORT=8081 npm start` or `npm run dev` is the safer local default.
- `npm run dev` was verified successfully on port `8081`.
- Hanplanet Django now has a browser game page at `/ko/fun/bumpercar-spiky/` that connects to this server for local play testing.
- End-to-end local verification reached the browser login-and-play stage.
- Real signed JWT verification is now active in the game server for local integration testing.
- A dedicated shared game JWT secret is now configured separately from Django `SECRET_KEY`.

## Project Structure
- `server.js`: Entry point that creates the world, WebSocket server, and game loop.
- `config/config.js`: Shared server constants such as world size, AOI cell size, and tick rate.
- `network/websocket.js`: WebSocket server setup and per-client connection handling.
- `world/player.js`: Player state object.
- `world/world.js`: World state, movement handling, input handling, and AOI updates.
- `world/spatialGrid.js`: AOI spatial grid for nearby-player queries.
- `game/gameLoop.js`: Main simulation loop and state broadcast loop.
- `auth/jwt.js`: JWT verification helper wired to the WebSocket handshake.
- `package.json`: Node package manifest with `ws` and `jsonwebtoken`.
- `server.js`: Now loads `.env` automatically and handles graceful shutdown signals.
- `.env.example`: Example runtime configuration values.
- `.gitignore`: Local dependency and env ignore rules.
- `deploy/launchd/com.hanplanet.bumpercar-spiky-server.plist`: launchd template for keeping the game server alive on macOS.

## Commands
- Install dependencies: `npm install`
- Start server: `npm start`
- Start local dev server on a safer alternate port: `npm run dev`

## Implemented Work
- Created the full folder structure from the template document.
- Added `package.json` so the project can run as a standalone Node server.
- Installed the `ws` dependency.
- Added `jsonwebtoken` for future Django-compatible token verification.
- Added `dotenv` so `.env` is loaded automatically on boot.
- Switched movement/world logic to use shared config values.
- Added simple input normalization to reduce malformed input issues.
- Added world boundary clamping so players stay within the configured map.
- Added safe WebSocket send checks before broadcasting state.
- Added environment-variable based config for port and world settings.
- Added optional token parsing during the WebSocket handshake.
- Added issuer/audience-aware JWT verification for Django-issued game tokens.
- Added graceful shutdown handling in `server.js`.
- Expanded `README.md` with initial setup, local boot checklist, and message format docs.
- Documented the local browser-play test flow with the Hanplanet Django app.
- Updated the auth contract to a real signed JWT flow between Django and the game server.
- Verified local browser login, game connection, and movement by checking the in-page coordinate display after keyboard input.
- Added `game.hanplanet.com` nginx proxy config on the Django repo side and syntax-checked the autorun nginx config.
- Verified nginx WebSocket upgrade flow with a real JWT request and received `101 Switching Protocols`.
- Added a launchd template for local macOS autorun of the game server.
- Documented Cloudflare Tunnel ingress requirements for `game.hanplanet.com`.
- Documented that Django `GAME_JWT_*` values and game server `JWT_*` values must remain identical.

## Not Yet Implemented
- Persistent player/account data storage.
- Fully applied and runtime-verified `game.hanplanet.com` deployment config.
- Binary protocol, client prediction, and reconciliation.
- Any actual gameplay beyond the movement template.

## Recent Session Notes
- The first runtime verification succeeded, then a later retry showed `EADDRINUSE` because port `8080` was already bound on the machine.
- A subsequent `npm run dev` verification on `8081` succeeded after ensuring `dotenv` was installed locally.
- Django-side browser integration work is now in progress/completed enough for local login-and-play verification.
- Playwright-based verification confirmed a logged-in browser could reach `/ko/fun/bumpercar-spiky/`, connect successfully, and move in-game.
- After switching to real JWT auth, Playwright verification still succeeded and movement changed from `46, 1218` to `1856, 1218`.
- `nginx -t` passed for `/Users/imhanbyeol/Development/Hanplanet/nginx/nginx.autorun.conf`, but local port `80` was not listening at verification time, so the proxy path was config-verified rather than full end-to-end runtime-verified.
- A later verification confirmed local port `80` was listening again, and a `Host: game.hanplanet.com` WebSocket upgrade request with a real Django-issued JWT returned `101 Switching Protocols`.
- Cloudflare Tunnel config was updated to include `game.hanplanet.com -> http://localhost:8081`, and public upgrade verification succeeded through Cloudflare as well.
- Keep documenting each material change in this file as the server grows, especially around auth, deployment, and protocol changes.

## Notes For Future Work
- This server now lives inside the Django repository under `Hanplanet/bumpercar-spiky-server`.
- If Django auth is added, expand `auth/jwt.js` first and wire it into the WebSocket handshake.
- If more game modes are added, preserve the current folder split instead of growing `server.js`.
