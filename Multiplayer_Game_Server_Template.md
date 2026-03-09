# Hanplanet Multiplayer Game Server Template

## 목표

이 문서는 **hanplanet 웹사이트와 연동되는 `.io 스타일 멀티플레이어 게임 서버 템플릿` 설계 문서**이다.

목표:

* Django 계정 시스템과 연동
* Node.js 기반 WebSocket 게임 서버
* AOI (Area of Interest) 적용
* 확장 가능한 서버 구조
* 첫 번째 게임: **유저들이 그리드 위를 돌아다니는 단순 템플릿**

이 서버는 이후 여러 게임의 **기본 엔진 템플릿**으로 사용된다.

---

# 1. 전체 시스템 구조

```
hanplanet.com           → Django
api.hanplanet.com       → Django API
game.hanplanet.com      → Node Game Server
```

브라우저 통신 구조

```
HTTP  → hanplanet.com
WS    → game.hanplanet.com
```

설명

* **Django**

  * 로그인
  * 계정
  * API
  * 랭킹
  * 데이터 저장

* **Game Server**

  * 실시간 게임 상태
  * WebSocket 통신
  * 월드 시뮬레이션

---

# 2. 첫 번째 게임 (템플릿)

월드

```
2000 x 2000 grid
```

플레이어

```
● 점 하나
```

기능

* WASD 이동
* 실시간 동기화
* AOI 기반 주변 플레이어만 표시

이 게임은 **.io 스타일 서버 템플릿** 역할을 한다.

---

# 3. 프로젝트 구조

```
Hanplanet/bumpercar-spiky-server
│
├ server.js
│
├ network
│   └ websocket.js
│
├ auth
│   └ jwt.js
│
├ world
│   ├ world.js
│   ├ player.js
│   └ spatialGrid.js
│
├ game
│   └ gameLoop.js
│
└ config
    └ config.js
```

이 구조는 이후 **여러 게임을 추가하기 쉽게 설계**되었다.

---

# 4. Config

```javascript
// config/config.js
// 서버 설정값을 모아두는 파일
// 월드 크기, 셀 크기, tick rate 등을 정의

module.exports = {

    WORLD_SIZE: 2000,

    CELL_SIZE: 200,

    TICK_RATE: 30

}
```

---

# 5. Player 객체

```javascript
// world/player.js
// 플레이어 상태를 저장하는 객체

class Player {

    constructor(id) {

        // 플레이어 고유 ID
        this.id = id

        // 초기 위치 랜덤 생성
        this.x = Math.random() * 2000
        this.y = Math.random() * 2000

        // 이동 속도
        this.speed = 5

        // 현재 입력 상태
        this.input = {
            up: false,
            down: false,
            left: false,
            right: false
        }

        // 현재 AOI 셀 위치
        this.cell = null
    }

}

module.exports = Player
```

---

# 6. World 관리

```javascript
// world/world.js
// 게임 월드 전체 상태를 관리하는 클래스

const Player = require("./player")
const SpatialGrid = require("./spatialGrid")

class World {

    constructor() {

        // 모든 플레이어 저장
        this.players = new Map()

        // AOI Grid 생성
        this.grid = new SpatialGrid(200)

    }

    // 플레이어 추가
    addPlayer(id) {

        const player = new Player(id)

        this.players.set(id, player)

        this.grid.add(player)

        return player
    }

    // 플레이어 제거
    removePlayer(player) {

        this.players.delete(player.id)

    }

    // 입력 처리
    handleInput(player, data) {

        const input = JSON.parse(data)

        player.input = input

    }

    // 월드 업데이트
    update() {

        for (const player of this.players.values()) {

            if (player.input.up) player.y -= player.speed
            if (player.input.down) player.y += player.speed
            if (player.input.left) player.x -= player.speed
            if (player.input.right) player.x += player.speed

            // AOI 셀 갱신
            this.grid.move(player)

        }

    }

}

module.exports = World
```

---

# 7. Spatial Grid (AOI)

AOI = **Area of Interest**

플레이어 주변 셀만 동기화한다.

```javascript
// world/spatialGrid.js
// 공간을 격자로 나누어 플레이어 검색을 빠르게 하는 구조

class SpatialGrid {

    constructor(size) {

        this.size = size

        this.cells = new Map()

    }

    getCell(x, y) {

        const cx = Math.floor(x / this.size)
        const cy = Math.floor(y / this.size)

        return `${cx}:${cy}`
    }

    add(player) {

        const key = this.getCell(player.x, player.y)

        if (!this.cells.has(key)) {

            this.cells.set(key, new Set())

        }

        this.cells.get(key).add(player)

        player.cell = key
    }

    move(player) {

        const newKey = this.getCell(player.x, player.y)

        if (newKey === player.cell) return

        this.cells.get(player.cell)?.delete(player)

        if (!this.cells.has(newKey)) {

            this.cells.set(newKey, new Set())

        }

        this.cells.get(newKey).add(player)

        player.cell = newKey
    }

    getNearby(player) {

        const [cx, cy] = player.cell.split(":").map(Number)

        const result = []

        for (let dx = -1; dx <= 1; dx++) {

            for (let dy = -1; dy <= 1; dy++) {

                const key = `${cx + dx}:${cy + dy}`

                const cell = this.cells.get(key)

                if (!cell) continue

                cell.forEach(p => result.push(p))

            }

        }

        return result
    }

}

module.exports = SpatialGrid
```

---

# 8. Game Loop

```javascript
// game/gameLoop.js
// 서버의 메인 게임 루프

function startGameLoop(world, wss) {

    setInterval(() => {

        // 월드 업데이트
        world.update()

        // 각 클라이언트에게 주변 플레이어 상태 전송
        for (const client of wss.clients) {

            const player = client.player

            if (!player) continue

            const nearby = world.grid.getNearby(player)

            const state = nearby.map(p => ({
                id: p.id,
                x: p.x,
                y: p.y
            }))

            client.send(JSON.stringify(state))

        }

    }, 33)

}

module.exports = startGameLoop
```

Tick Rate

```
30 ticks/sec
```

---

# 9. WebSocket 서버

```javascript
// network/websocket.js
// WebSocket 연결 처리

const WebSocket = require("ws")

function createServer(world) {

    const wss = new WebSocket.Server({ port: 8080 })

    wss.on("connection", (ws) => {

        const id = Math.random().toString(36)

        const player = world.addPlayer(id)

        ws.player = player

        ws.on("message", (msg) => {

            world.handleInput(player, msg)

        })

        ws.on("close", () => {

            world.removePlayer(player)

        })

    })

    return wss
}

module.exports = createServer
```

---

# 10. 서버 시작

```javascript
// server.js
// 게임 서버 시작점

const World = require("./world/world")
const createServer = require("./network/websocket")
const startGameLoop = require("./game/gameLoop")

const world = new World()

const wss = createServer(world)

startGameLoop(world, wss)

console.log("Bumper Car Spiky server started")
```

---

# 11. 클라이언트 코드

```javascript
const ws = new WebSocket("wss://game.hanplanet.com")

const input = {
  up:false,
  down:false,
  left:false,
  right:false
}

document.addEventListener("keydown", e => {

  if (e.key === "w") input.up = true
  if (e.key === "s") input.down = true
  if (e.key === "a") input.left = true
  if (e.key === "d") input.right = true

})

document.addEventListener("keyup", e => {

  if (e.key === "w") input.up = false
  if (e.key === "s") input.down = false
  if (e.key === "a") input.left = false
  if (e.key === "d") input.right = false

})

setInterval(() => {

  ws.send(JSON.stringify(input))

}, 50)
```

---

# 이 템플릿의 특징

포함된 기능

* WebSocket multiplayer
* authoritative server
* AOI spatial grid
* tick simulation
* Django 연동 가능한 구조
* 여러 게임 확장 가능

이 구조는 실제 `.io 게임 서버`의 핵심 패턴과 동일하다.

---

# 다음 단계 (확장)

추후 다음 기능을 추가할 수 있다.

```
binary protocol
client prediction
server reconciliation
```

이 세 가지가 추가되면 **완전한 멀티플레이어 게임 엔진 수준**으로 발전한다.
