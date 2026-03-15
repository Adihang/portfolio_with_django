const WebSocket = require("ws")
const { PORT, JWT_SECRET } = require("../config/config")
const { verifyToken } = require("../auth/jwt")

// 원시 IP 문자열을 정규화한다. IPv4-mapped IPv6 주소(::ffff: 접두사)를 IPv4 형식으로 변환한다.
// rawIp: 정규화할 원시 IP 문자열
// 반환값: 정규화된 IP 문자열
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

// HTTP 요청에서 클라이언트 IP를 추출한다. 프록시 헤더(x-forwarded-for)를 우선 사용한다.
// request: WebSocket 업그레이드 HTTP 요청 객체
// 반환값: 정규화된 클라이언트 IP 문자열
function getClientIp(request) {
    // 프록시/터널 뒤에 있을 수 있으므로 x-forwarded-for 를 먼저 본다.
    const forwardedFor = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim()
    if (forwardedFor) {
        return normalizeClientIp(forwardedFor)
    }
    return normalizeClientIp(request.socket?.remoteAddress)
}

// 연결 요청의 JWT 토큰을 검증하고 인증 결과 객체를 반환한다.
// request: WebSocket 업그레이드 HTTP 요청 객체
// world: 월드 인스턴스 (게스트 display ID 할당에 사용)
// 반환값: { ok, reason?, connectionKey, userId, isGuest, skinName } 형태의 인증 결과 객체
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

// WebSocket 서버를 생성하고 연결, 메시지, 종료 이벤트 핸들러를 등록한다.
// world: 월드 인스턴스 (플레이어 추가/제거 및 입력 처리에 사용)
// 반환값: 생성된 WebSocket.Server 인스턴스
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
            // JSON 파싱을 한 번만 수행한다.
            let parsed
            try {
                parsed = JSON.parse(msg.toString())
            } catch (error) {
                return
            }

            if (parsed && parsed.type === "ping") {
                // RTT 측정용 ping/pong 은 월드 입력 처리와 분리한다.
                ws.send(JSON.stringify({
                    type: "pong",
                    sentAt: parsed.sentAt || 0
                }))
                return
            }

            // 파싱된 객체를 그대로 전달해 world 내부에서 재파싱하지 않도록 한다.
            world.handleInput(player, parsed)
            const moveX = Number(parsed.moveX || 0)
            const moveY = Number(parsed.moveY || 0)
            const hasAnalogMovement = Number.isFinite(moveX) && Number.isFinite(moveY) && Math.hypot(moveX, moveY) > 0.01
            if (Boolean(parsed.up) || Boolean(parsed.down) || Boolean(parsed.left) || Boolean(parsed.right) || hasAnalogMovement || Boolean(parsed.boost) || Boolean(parsed.respawn)) {
                ws.lastActiveInputAt = Date.now()
                // 인간 유저의 마지막 실제 입력 시각을 따로 갱신해서
                // "오래 무입력 시 라운드 초기화" 판정에 사용한다.
                world.markHumanInput(player, ws.lastActiveInputAt)
            }
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
