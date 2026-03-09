require("dotenv").config()

const World = require("./world/world")
const createServer = require("./network/websocket")
const startGameLoop = require("./game/gameLoop")
const { PORT, TICK_RATE, WORLD_SIZE, CELL_SIZE } = require("./config/config")

// 서버 전체 상태는 World 인스턴스 하나가 들고 있고,
// WebSocket 서버와 게임 루프가 같은 world 객체를 공유한다.
const world = new World()
const wss = createServer(world)

// 게임 시뮬레이션과 상태 전송은 고정 tick 루프에서 계속 돈다.
startGameLoop(world, wss)

console.log(`Bumper Car Spiky server started on port ${PORT}`)
console.log(`tick_rate=${TICK_RATE} world_size=${WORLD_SIZE} cell_size=${CELL_SIZE}`)

function shutdown(signal) {
    console.log(`Shutting down game server (${signal})`)

    // 새 연결을 닫고, 기존 소켓 정리 후 프로세스를 종료한다.
    wss.close(() => {
        process.exit(0)
    })

    // close 콜백이 오지 않아도 영원히 hang 되지 않게 강제 종료 타이머를 둔다.
    setTimeout(() => {
        process.exit(1)
    }, 3000).unref()
}

process.on("SIGINT", () => shutdown("SIGINT"))
process.on("SIGTERM", () => shutdown("SIGTERM"))
