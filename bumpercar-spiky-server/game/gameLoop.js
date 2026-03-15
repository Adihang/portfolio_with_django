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
                    : (p.isPumpkinNpc ? "" : p.id)
                const deathActive = Boolean(p.deathUntil)
                const deathAnimating = now < (p.deathUntil || 0)
                const livesRemaining = p.isNpc || p.isDummy || p.isPumpkinNpc ? null : Math.max(0, Number(world.sharedLivesRemaining || 0))
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
                const collisionRecoveryRemainingMs = Math.max(0, (p.collisionRecoveryUntil || 0) - now)
                const collisionRecoveryDurationMs = Math.max(0, (p.collisionRecoveryUntil || 0) - (p.collisionRecoveryStartedAt || 0))
                const pumpkinFadeOutActive = p.isPumpkinNpc && now < Number(p.pumpkinFadeOutUntil || 0)
                const pumpkinFadeOutProgress = pumpkinFadeOutActive && p.pumpkinFadeOutStartedAt && p.pumpkinFadeOutUntil > p.pumpkinFadeOutStartedAt
                    ? (now - p.pumpkinFadeOutStartedAt) / (p.pumpkinFadeOutUntil - p.pumpkinFadeOutStartedAt)
                    : (pumpkinFadeOutActive ? 0 : 1)
                const playerWinVisualActive = !p.isNpc && !p.isDummy && now < Number(p.playerWinVisualUntil || 0)
                const stopVisualActive = !p.isNpc && !p.isDummy &&
                    !deathActive &&
                    !playerWinVisualActive &&
                    now - Number(p.lastActiveInputAt || 0) >= 3000 &&
                    Math.abs(Number(p.lastMoveX || 0)) < 0.001 &&
                    Math.abs(Number(p.lastMoveY || 0)) < 0.001 &&
                    !Boolean(p.input && (p.input.up || p.input.down || p.input.left || p.input.right || p.input.boost))
                const doubleState = (!p.isNpc && !p.isDummy && p.isDoubleSkin && Array.isArray(p.doubleUnits))
                    ? {
                        merged: Boolean(p.doubleMerged),
                        phase: String(p.doubleSeparationPhase || "merged"),
                        units: p.doubleUnits.map((unit) => ({
                            health: Number(unit.health || 0),
                            x: Number(unit.x || p.x || 0),
                            y: Number(unit.y || p.y || 0),
                            velocityX: Number(unit.lastMoveX || 0) * TICK_RATE,
                            velocityY: Number(unit.lastMoveY || 0) * TICK_RATE,
                            facingAngle: typeof unit.facingAngle === "number" ? unit.facingAngle : 0,
                            currentSpeed: Number(unit.currentSpeed || p.currentSpeed || 0),
                            boostState: String(unit.boostState || "idle"),
                            collisionActive: now < Number(unit.collisionVisualUntil || 0),
                            collisionImpactActive: now < Number(unit.collisionImpactUntil || 0),
                            collisionVisualType: String(unit.collisionVisualType || "win"),
                            collisionImpactX: Number(unit.collisionImpactX || 0),
                            collisionImpactY: Number(unit.collisionImpactY || 0),
                            collisionRecoveryActive: now < Number(unit.collisionRecoveryUntil || 0),
                            collisionRecoveryRemainingMs: Math.max(0, Number(unit.collisionRecoveryUntil || 0) - now),
                            collisionRecoveryDurationMs: Math.max(0, Number(unit.collisionRecoveryUntil || 0) - Number(unit.collisionRecoveryStartedAt || 0)),
                            boostLockedActive: now < Number(unit.boostDisabledUntil || 0),
                            boostLockRemainingMs: Math.max(0, Number(unit.boostDisabledUntil || 0) - now),
                            boostLockDurationMs: Math.max(0, Number(unit.boostDisabledUntil || 0) - Number(unit.boostDisabledStartedAt || 0)),
                            inactive: Number(unit.health || 0) <= 0 || now < Number(unit.inactiveUntil || 0),
                        }))
                    }
                    : null

                return {
                    // 클라이언트는 아래 상태값을 기반으로 보간, 회전, 아이콘 분기,
                    // 사망/충돌 UI, 미니맵, 체력바를 렌더한다.
                    id: p.id,
                    displayName: displayName,
                    skinName: p.skinName || "default",
                    pumpkinBaseSkinName: String(p.pumpkinBaseSkinName || ""),
                    pumpkinNtrTriggerCount: Number(p.pumpkinNtrTriggerCount || 0),
                    x: p.x,
                    y: p.y,
                    velocityX: (p.lastMoveX || 0) * TICK_RATE,
                    velocityY: (p.lastMoveY || 0) * TICK_RATE,
                    facingAngle: typeof p.facingAngle === "number" ? p.facingAngle : 0,
                    isDummy: Boolean(p.isDummy),
                    isNpc: Boolean(p.isNpc),
                    isPumpkinNpc: Boolean(p.isPumpkinNpc),
                    isHouse: Boolean(p.isHouse),
                    houseStage: p.isHouse ? Number(p.houseStage || 0) : 0,
                    houseHealth: p.isHouse ? Number(p.houseHealth || 0) : null,
                    houseMaxHealth: p.isHouse ? Number(p.houseMaxHealth || 0) : null,
                    houseImageKey: p.isHouse ? String(p.houseImageKey || "") : "",
                    npcPhase: p.isNpc ? Number(p.npcPhase || 1) : 1,
                    npcPhaseTwoRatio: p.isNpc ? Number(GAMEPLAY_SETTINGS.npc_phase_two_health_ratio || 0.6) : null,
                    npcPhaseThreeRatio: p.isNpc ? Number(GAMEPLAY_SETTINGS.npc_phase_three_health_ratio || 0.2) : null,
                    npcState: p.isNpc ? (p.npcState || "idle") : "",
                    collisionActive: now < (p.collisionVisualUntil || 0),
                    collisionImpactActive: now < (p.collisionImpactUntil || 0),
                    collisionVisualType: p.collisionVisualType || "win",
                    collisionImpactX: p.collisionImpactX || 0,
                    collisionImpactY: p.collisionImpactY || 0,
                    boostState: p.boostState || "idle",
                    currentSpeed: p.currentSpeed,
                    collisionRecoveryActive: now < (p.collisionRecoveryUntil || 0),
                    collisionRecoveryRemainingMs: collisionRecoveryRemainingMs,
                    collisionRecoveryDurationMs: collisionRecoveryDurationMs,
                    pumpkinFadeOutActive: pumpkinFadeOutActive,
                    pumpkinFadeOutProgress: Math.max(0, Math.min(1, pumpkinFadeOutProgress)),
                    playerWinVisualActive: playerWinVisualActive,
                    stopVisualActive: stopVisualActive,
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
                    roundResetAnnouncementActive: roundResetAnnouncementActive,
                    doubleState: doubleState,
                    encounterStage: Number(world.encounterStage || 0),
                    encounterAnnouncementKey: String(world.encounterAnnouncementKey || ""),
                    encounterCountdownSeconds: world.getEncounterCountdownSecondsRemaining(now),
                    encounterFinaleActive: now < Number(world.encounterFinaleUntil || 0),
                    encounterFinaleUntil: Number(world.encounterFinaleUntil || 0)
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
