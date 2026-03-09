const { TICK_RATE } = require("../config/config")
// 입력이 오래 없으면 연결을 정리해 유령 플레이어가 남지 않게 한다.
const IDLE_TIMEOUT_MS = 180000

function startGameLoop(world, wss) {
    const intervalMs = Math.floor(1000 / TICK_RATE)

    setInterval(() => {
        // 1. 월드 시뮬레이션을 한 틱 진행
        world.update()
        const now = Date.now()

        for (const client of wss.clients) {
            // 2. 오래 입력이 없는 연결은 종료
            if (client.player && now - (client.lastActiveInputAt || 0) >= IDLE_TIMEOUT_MS) {
                if (client.readyState === 1) {
                    client.close(4002, "idle_timeout")
                }
                continue
            }

            const player = client.player

            if (!player) continue

            // 3. 전체 월드를 다 보내지 않고 주변 5x5 셀 범위만 전송한다.
            const nearby = world.grid.getNearby(player, 2)
            const state = nearby.map((p) => {
                const deathActive = Boolean(p.deathUntil)
                const deathAnimating = now < (p.deathUntil || 0)
                const livesRemaining = p.isNpc || p.isDummy ? null : Math.max(0, Number(world.sharedLivesRemaining || 0))
                const deathFadeProgress = deathAnimating && p.deathStartedAt && p.deathUntil > p.deathStartedAt
                    ? (now - p.deathStartedAt) / (p.deathUntil - p.deathStartedAt)
                    : (deathActive ? 1 : 0)
                const deathRespawnReady = deathActive && now >= p.deathUntil && (livesRemaining === null || livesRemaining > 0)
                const npcChargeWindupProgress = p.isNpc && p.npcChargeWindupStartedAt && p.npcChargeWindupUntil > p.npcChargeWindupStartedAt
                    ? (now - p.npcChargeWindupStartedAt) / (p.npcChargeWindupUntil - p.npcChargeWindupStartedAt)
                    : 0
                const npcDeathAnimating = p.isNpc && deathActive && now < (p.deathUntil || 0)

                return {
                    // 클라이언트는 아래 상태값을 기반으로 보간, 회전, 아이콘 분기,
                    // 사망/충돌 UI, 미니맵, 체력바를 렌더한다.
                    id: p.id,
                    x: p.x,
                    y: p.y,
                    velocityX: (p.lastMoveX || 0) * TICK_RATE,
                    velocityY: (p.lastMoveY || 0) * TICK_RATE,
                    facingAngle: typeof p.facingAngle === "number" ? p.facingAngle : 0,
                    isNpc: Boolean(p.isNpc),
                    npcState: p.isNpc ? (p.npcState || "idle") : "",
                    collisionActive: now < (p.collisionVisualUntil || 0),
                    collisionVisualType: p.collisionVisualType || "win",
                    collisionImpactX: p.collisionImpactX || 0,
                    collisionImpactY: p.collisionImpactY || 0,
                    boostState: p.boostState || "idle",
                    currentSpeed: p.currentSpeed,
                    collisionRecoveryActive: now < (p.collisionRecoveryUntil || 0),
                    boostLockedActive: now < (p.boostDisabledUntil || 0),
                    deathActive: deathActive,
                    deathFadeProgress: Math.max(0, Math.min(1, deathFadeProgress)),
                    deathRespawnReady: deathRespawnReady,
                    livesRemaining: livesRemaining,
                    npcHealth: typeof p.npcHealth === "number" ? p.npcHealth : null,
                    npcDeathAnimating: npcDeathAnimating,
                    npcChargeWindupProgress: Math.max(0, Math.min(1, npcChargeWindupProgress)),
                    defeatReceivedCount: p.defeatReceivedCount || 0,
                    defeatDealtCount: p.defeatDealtCount || 0
                }
            })

            if (client.readyState === 1) {
                // 4. 최종적으로 "주변 엔티티 배열" 하나를 매 틱 내려준다.
                client.send(JSON.stringify(state))
            }
        }
    }, intervalMs)
}

module.exports = startGameLoop
