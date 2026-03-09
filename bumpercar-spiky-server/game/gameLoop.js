const { TICK_RATE } = require("../config/config")
const { getGameplaySettings } = require("../config/gameplaySettings")
// 입력이 오래 없으면 연결을 정리해 유령 플레이어가 남지 않게 한다.
const IDLE_TIMEOUT_MS = 180000
const GAMEPLAY_SETTINGS = getGameplaySettings()

function startGameLoop(world, wss) {
    const intervalMs = Math.floor(1000 / TICK_RATE)

    setInterval(() => {
        // 1. 월드 시뮬레이션을 한 틱 진행
        world.update()
        const now = Date.now()
        const roundResetAnnouncementActive = now < (world.roundResetAnnouncementUntil || 0)

        for (const client of wss.clients) {
            // 2. 오래 입력이 없는 연결은 종료
            if (client.player && now - (client.lastActiveInputAt || 0) >= IDLE_TIMEOUT_MS) {
                if (client.readyState === 1) {
                    client.send(JSON.stringify({ type: "idle_timeout" }))
                    client.close(4002, "idle_timeout")
                }
                continue
            }

            const player = client.player

            if (!player) continue

            // 3. 렌더 범위를 화면 밖까지 넓히기 위해 현재 월드의 모든 엔티티를 전송한다.
            const state = Array.from(world.players.values()).map((p) => {
                const displayName = p.isDummy
                    ? (p.dummyRetaliationTargetId ? "네르는 이렇게 폭력적인 역할이 아니란 말이에요!" : (p.dummyDefaultDisplayName || "저는 네르에요"))
                    : p.id
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
                const boostLockRemainingMs = Math.max(0, (p.boostDisabledUntil || 0) - now)
                const boostLockDurationMs = Math.max(0, (p.boostDisabledUntil || 0) - (p.boostDisabledStartedAt || 0))

                return {
                    // 클라이언트는 아래 상태값을 기반으로 보간, 회전, 아이콘 분기,
                    // 사망/충돌 UI, 미니맵, 체력바를 렌더한다.
                    id: p.id,
                    displayName: displayName,
                    x: p.x,
                    y: p.y,
                    velocityX: (p.lastMoveX || 0) * TICK_RATE,
                    velocityY: (p.lastMoveY || 0) * TICK_RATE,
                    facingAngle: typeof p.facingAngle === "number" ? p.facingAngle : 0,
                    isDummy: Boolean(p.isDummy),
                    isNpc: Boolean(p.isNpc),
                    npcPhase: p.isNpc ? Number(p.npcPhase || 1) : 1,
                    npcPhaseTwoRatio: p.isNpc ? Number(GAMEPLAY_SETTINGS.npc_phase_two_health_ratio || 0.6) : null,
                    npcPhaseThreeRatio: p.isNpc ? Number(GAMEPLAY_SETTINGS.npc_phase_three_health_ratio || 0.2) : null,
                    npcState: p.isNpc ? (p.npcState || "idle") : "",
                    collisionActive: now < (p.collisionVisualUntil || 0),
                    collisionVisualType: p.collisionVisualType || "win",
                    collisionImpactX: p.collisionImpactX || 0,
                    collisionImpactY: p.collisionImpactY || 0,
                    boostState: p.boostState || "idle",
                    currentSpeed: p.currentSpeed,
                    collisionRecoveryActive: now < (p.collisionRecoveryUntil || 0),
                    boostLockedActive: now < (p.boostDisabledUntil || 0),
                    boostLockRemainingMs: boostLockRemainingMs,
                    boostLockDurationMs: boostLockDurationMs,
                    deathActive: deathActive,
                    deathFadeProgress: Math.max(0, Math.min(1, deathFadeProgress)),
                    deathRespawnReady: deathRespawnReady,
                    livesRemaining: livesRemaining,
                    npcMaxHealth: typeof p.npcMaxHealth === "number" ? p.npcMaxHealth : null,
                    npcHealth: typeof p.npcHealth === "number" ? p.npcHealth : null,
                    npcDefeatDamageRatio: p.isNpc ? Number(p.npcDefeatDamageRatio || 0) : 0,
                    npcWinVisualActive: p.isNpc ? now < Number(p.npcWinVisualUntil || 0) : false,
                    npcDeathAnimating: npcDeathAnimating,
                    npcChargeWindupProgress: Math.max(0, Math.min(1, npcChargeWindupProgress)),
                    defeatReceivedCount: p.defeatReceivedCount || 0,
                    defeatDealtCount: p.defeatDealtCount || 0,
                    roundResetAnnouncementActive: roundResetAnnouncementActive
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
