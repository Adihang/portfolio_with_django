const WebSocket = require("ws")
const { PORT, JWT_SECRET } = require("../config/config")
const { verifyToken } = require("../auth/jwt")

function normalizeClientIp(rawIp) {
    const ip = String(rawIp || "").trim()
    if (!ip) {
        return ""
    }
    if (ip.startsWith("::ffff:")) {
        return ip.slice(7)
    }
    return ip
}

function getClientIp(request) {
    // 프록시/터널 뒤에 있을 수 있으므로 x-forwarded-for 를 먼저 본다.
    const forwardedFor = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim()
    if (forwardedFor) {
        return normalizeClientIp(forwardedFor)
    }
    return normalizeClientIp(request.socket?.remoteAddress)
}

function getConnectionAuth(request, world) {
    const requestUrl = new URL(request.url, "ws://localhost")
    const token = requestUrl.searchParams.get("token")
    const verified = verifyToken(token)

    // 운영 모드에서는 JWT 검증 실패 시 즉시 연결을 거부한다.
    if (JWT_SECRET && !verified.valid) {
        return {
            ok: false,
            reason: "invalid_token"
        }
    }

    return {
        ok: true,
        // connectionKey 는 재접속 시 진행도를 이어붙이는 기준 키다.
        // guest 는 화면용 display id 만 서버에서 새로 할당한다.
        connectionKey: verified.userId || verified.payload?.sub || null,
        userId: verified.payload?.is_guest
            ? world.getOrAssignGuestDisplayId(verified.userId || verified.payload?.sub || "")
            : verified.userId,
        isGuest: Boolean(verified.payload?.is_guest),
        skinName: String(verified.payload?.selected_skin || "default").trim() || "default"
    }
}

function createServer(world) {
    const wss = new WebSocket.Server({ port: PORT })

    wss.on("connection", (ws, request) => {
        const auth = getConnectionAuth(request, world)

        if (!auth.ok) {
            ws.close(4001, auth.reason)
            return
        }

        const clientIp = getClientIp(request)
        if (auth.isGuest && clientIp) {
            // 같은 IP 에서 게스트 중복 접속을 막아
            // 멀티 탭/재접속으로 게스트 제한을 우회하는 걸 줄인다.
            for (const client of wss.clients) {
                if (client === ws) continue
                if (client.readyState !== WebSocket.OPEN) continue
                if (!client.isGuest) continue
                if (client.clientIp !== clientIp) continue
                ws.close(4003, "guest_ip_in_use")
                return
            }
        }

        const id = auth.userId || Math.random().toString(36).slice(2)
        const connectionKey = auth.connectionKey || id
        const player = world.addPlayer(connectionKey, id, { skinName: auth.skinName })

        // 소켓 객체에 플레이어/유휴 판정 정보를 같이 붙여서 관리한다.
        ws.player = player
        ws.isGuest = auth.isGuest
        ws.clientIp = clientIp
        ws.lastActiveInputAt = Date.now()
        ws.send(JSON.stringify({
            type: "welcome",
            id: player.id,
            x: player.x,
            y: player.y
        }))

        ws.on("message", (msg) => {
            const rawMessage = msg.toString()
            try {
                const parsed = JSON.parse(rawMessage)
                if (parsed && parsed.type === "ping") {
                    // RTT 측정용 ping/pong 은 월드 입력 처리와 분리한다.
                    ws.send(JSON.stringify({
                        type: "pong",
                        sentAt: parsed.sentAt || 0
                    }))
                    return
                }
            } catch (error) {}

            // 일반 입력 메시지는 world 가 그대로 해석한다.
            world.handleInput(player, rawMessage)
            try {
                const input = JSON.parse(rawMessage)
                if (Boolean(input.up) || Boolean(input.down) || Boolean(input.left) || Boolean(input.right) || Boolean(input.boost) || Boolean(input.respawn)) {
                    ws.lastActiveInputAt = Date.now()
                    // 인간 유저의 마지막 실제 입력 시각을 따로 갱신해서
                    // "오래 무입력 시 라운드 초기화" 판정에 사용한다.
                    world.markHumanInput(player, ws.lastActiveInputAt)
                }
            } catch (error) {}
        })

        ws.on("close", () => {
            // 월드에서는 플레이어 엔티티를 제거하지만,
            // connectionKey 기준 진행도 일부는 world.playerProgress 에 남을 수 있다.
            world.removePlayer(player)
        })
    })

    return wss
}

module.exports = createServer
