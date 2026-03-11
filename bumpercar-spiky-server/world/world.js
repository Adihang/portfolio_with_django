const Player = require("./player")
const SpatialGrid = require("./spatialGrid")
const { CELL_SIZE, TICK_RATE, WORLD_SIZE } = require("../config/config")
const { getGameplaySettings } = require("../config/gameplaySettings")
const { postStatsUpdate } = require("../services/accountStats")

const GAMEPLAY_SETTINGS = getGameplaySettings()
const BASE_PLAYER_SPEED_PER_SECOND = GAMEPLAY_SETTINGS.user_base_speed
const DUMMY_BASE_SPEED_PER_SECOND = BASE_PLAYER_SPEED_PER_SECOND * 1.5
const NPC_BASE_SPEED_PER_SECOND = GAMEPLAY_SETTINGS.npc_base_speed
const MAX_BOOSTED_SPEED_PER_SECOND = GAMEPLAY_SETTINGS.user_max_boost_speed
const BOOST_ACCELERATION_PER_SECOND = GAMEPLAY_SETTINGS.user_boost_acceleration
const BOOST_COOLDOWN_PER_SECOND = GAMEPLAY_SETTINGS.user_boost_cooldown
const USER_POST_BOOST_COOLDOWN_MS = GAMEPLAY_SETTINGS.user_post_boost_cooldown_ms
const TICK_DELTA_SECONDS = 1 / TICK_RATE
// 유저 충돌 판정은 아이콘 비율에 맞춘 둥근 직사각형 기반으로 계산한다.
const PLAYER_COLLISION_HALF_HEIGHT = 20
const PLAYER_COLLISION_HALF_WIDTH = PLAYER_COLLISION_HALF_HEIGHT * (300 / 306)
const NPC_COLLISION_SCALE = 3.75
const NPC_COLLISION_SIZE_MULTIPLIER = 0.6
const NPC_COLLISION_HALF_HEIGHT = PLAYER_COLLISION_HALF_HEIGHT * NPC_COLLISION_SCALE * NPC_COLLISION_SIZE_MULTIPLIER
const NPC_COLLISION_HALF_WIDTH = NPC_COLLISION_HALF_HEIGHT * 0.5
// 아래 값들은 충돌 반발/시각효과/가속 잠금에 대한 공통 상수다.
const COLLISION_BOUNCE_DISTANCE = 30
const COLLISION_SPEED_BOUNCE_MULTIPLIER = 5.4
const COLLISION_MAX_BOUNCE_DISTANCE = 78
const WALL_BOUNCE_DISTANCE = 36
const WALL_BOUNCE_SPEED_BOUNCE_MULTIPLIER = 5.4
const WALL_MAX_BOUNCE_DISTANCE = 90
const COLLISION_VISUAL_BASE_DURATION_MS = 1000
const COLLISION_IMPACT_DURATION_MS = 360
const COLLISION_VISUAL_SPEED_DURATION_MULTIPLIER_MS = 90
const COLLISION_VISUAL_MAX_DURATION_MS = 3000
const COLLISION_RECOVERY_DURATION_MS = 1600
const COLLISION_BOOST_LOCK_DURATION_MS = 3000
const COLLISION_ATTACK_DIRECTION_THRESHOLD = 0.001
const PLAYER_DEATH_TRIGGER_COUNT = 3
const PLAYER_STARTING_LIVES = GAMEPLAY_SETTINGS.user_lives
const PLAYER_DEATH_DURATION_MS = 3000
const DUMMY_RESPAWN_DELAY_MS = 3 * 60 * 1000
const RESPAWN_EDGE_PADDING = 120
const NPC_ID = "네르"
const DUMMY_SPECS = [
    { id: "dummy-1", quadrant: 1, displayName: "저는 네르에요" },
    { id: "dummy-2", quadrant: 2, displayName: "제가 네르에요" },
    { id: "dummy-3", quadrant: 3, displayName: "네르는 네르에요" },
    { id: "dummy-4", quadrant: 4, displayName: "세계수 교단의 제사장, 네르입니다" },
]
const NPC_CHARGE_TRIGGER_DISTANCE = GAMEPLAY_SETTINGS.npc_charge_trigger_distance
const NPC_CHARGE_DISTANCE_MULTIPLIER = GAMEPLAY_SETTINGS.npc_charge_distance_multiplier
const NPC_EXTRA_CHARGE_DISTANCE_MULTIPLIER = GAMEPLAY_SETTINGS.npc_extra_charge_distance_multiplier
const NPC_CHARGE_WINDUP_DURATION_MS = GAMEPLAY_SETTINGS.npc_charge_windup_ms
const NPC_REST_DURATION_MS = GAMEPLAY_SETTINGS.npc_rest_ms
const NPC_MAX_HEALTH = GAMEPLAY_SETTINGS.npc_max_health
const NPC_DEATH_ANIMATION_DURATION_MS = 5000
const NPC_RESPAWN_DELAY_MS = 6 * 60 * 1000
const NPC_MAX_BOOSTED_SPEED_PER_SECOND = GAMEPLAY_SETTINGS.npc_max_boost_speed
const NPC_BOOST_ACCELERATION_PER_SECOND = GAMEPLAY_SETTINGS.npc_boost_acceleration
const NPC_BOOST_COOLDOWN_PER_SECOND = GAMEPLAY_SETTINGS.npc_boost_cooldown
const NPC_DAMAGE_MIN = GAMEPLAY_SETTINGS.npc_damage_min
const NPC_DAMAGE_MAX = GAMEPLAY_SETTINGS.npc_damage_max
const NPC_PHASE_TWO_HEALTH_RATIO = GAMEPLAY_SETTINGS.npc_phase_two_health_ratio
const NPC_PHASE_THREE_HEALTH_RATIO = GAMEPLAY_SETTINGS.npc_phase_three_health_ratio
const NPC_PHASE_THREE_TRIGGER_DISTANCE_MULTIPLIER = 1.5
const DUMMY_RETALIATION_DISTANCE_MULTIPLIER = 1.2
// 전체 인간 유저 입력이 이 시간 동안 없으면 진행 상태를 초기화한다.
const INPUT_IDLE_RESET_MS = 10 * 60 * 1000
const EVOLUTION_SKIN_NAME = "evolution"
const EVOLUTION_SPEED_MULTIPLIER = 0.8
const EVOLUTION_HEALTH_SEGMENTS = 5
const DOUBLE_SKIN_NAME = "double"
const DOUBLE_UNIT_HEALTH = 2
const DOUBLE_UNIT_COUNT = 2
const DOUBLE_SEPARATION_ANGLE_DEGREES = 7
const DOUBLE_SEPARATION_ANGLE_RADIANS = DOUBLE_SEPARATION_ANGLE_DEGREES * (Math.PI / 180)
const DOUBLE_MERGED_SIDE_OFFSET = PLAYER_COLLISION_HALF_WIDTH * 0.72
const DOUBLE_SPLIT_PROBABILITY = 0.3
const DOUBLE_REJOIN_EXTRA_DISTANCE = PLAYER_COLLISION_HALF_HEIGHT * 0.25
const DOUBLE_REMERGE_LOCK_MS = 3000
const DOUBLE_SPLIT_PROTECTION_MS = 1000
const DOUBLE_IDLE_REMERGE_DELAY_MS = 2000
const DOUBLE_STEER_MIN_RADIANS = 5 * (Math.PI / 180)
const DOUBLE_STEER_MAX_RADIANS = 45 * (Math.PI / 180)
const DOUBLE_STEER_DEADZONE_RADIANS = 3 * (Math.PI / 180)
const DOUBLE_ALIGNMENT_DEADZONE_DISTANCE = DOUBLE_MERGED_SIDE_OFFSET * 0.35
const DOUBLE_INACTIVE_FADE_MS = 200
const NPC_DEFEAT_BOUNCE_MULTIPLIER = 1.5

function getBaseSpeedForPlayer(player) {
    if (player && player.isNpc) {
        return NPC_BASE_SPEED_PER_SECOND
    }
    if (player && player.isDummy) {
        return DUMMY_BASE_SPEED_PER_SECOND
    }
    const skinName = String(player && player.skinName || "").trim().toLowerCase()
    if (skinName === EVOLUTION_SKIN_NAME) {
        return BASE_PLAYER_SPEED_PER_SECOND * EVOLUTION_SPEED_MULTIPLIER
    }
    return BASE_PLAYER_SPEED_PER_SECOND
}

function isDoubleSkinPlayer(player) {
    return Boolean(player) && String(player.skinName || "").trim().toLowerCase() === DOUBLE_SKIN_NAME
}

function createDoubleUnitState(now = Date.now()) {
    return {
        health: DOUBLE_UNIT_HEALTH,
        x: 0,
        y: 0,
        lastMoveX: 0,
        lastMoveY: 0,
        facingAngle: 0,
        currentSpeed: BASE_PLAYER_SPEED_PER_SECOND,
        boostState: "idle",
        boostDirectionX: 0,
        boostDirectionY: 0,
        collisionVisualUntil: 0,
        collisionImpactUntil: 0,
        collisionVisualType: "win",
        collisionImpactX: 0,
        collisionImpactY: 0,
        collisionRecoveryStartedAt: 0,
        collisionRecoveryUntil: 0,
        boostDisabledStartedAt: now,
        boostDisabledUntil: now,
        splitProtectedUntil: 0,
        inactiveUntil: 0
    }
}

function getDoubleAliveUnitIndices(player) {
    if (!player || !Array.isArray(player.doubleUnits)) {
        return []
    }
    const indices = []
    player.doubleUnits.forEach((unit, index) => {
        if (unit && Number(unit.health || 0) > 0) {
            indices.push(index)
        }
    })
    return indices
}

function getMaxBoostedSpeedForPlayer(player) {
    if (player && player.isNpc) {
        return NPC_MAX_BOOSTED_SPEED_PER_SECOND
    }
    const defaultBoostDelta = MAX_BOOSTED_SPEED_PER_SECOND - BASE_PLAYER_SPEED_PER_SECOND
    return getBaseSpeedForPlayer(player) + defaultBoostDelta
}

function getCollisionSlowSpeedForPlayer(player) {
    if (player && player.isNpc) {
        return NPC_BASE_SPEED_PER_SECOND * 0.35
    }
    if (player && player.isDummy) {
        return DUMMY_BASE_SPEED_PER_SECOND * 0.35
    }
    return getBaseSpeedForPlayer(player) * 0.35
}

function getPlayerDeathTriggerCount(player) {
    if (!player || player.isNpc || player.isDummy) {
        return PLAYER_DEATH_TRIGGER_COUNT
    }
    const skinName = String(player.skinName || "").trim().toLowerCase()
    return skinName === EVOLUTION_SKIN_NAME ? EVOLUTION_HEALTH_SEGMENTS : PLAYER_DEATH_TRIGGER_COUNT
}

function getNpcPhase(player) {
    if (!player || !player.isNpc) {
        return 1
    }
    const npcMaxHealth = Math.max(1, Number(player.npcMaxHealth || NPC_MAX_HEALTH))
    const healthRatio = npcMaxHealth > 0
        ? Math.max(0, Math.min(1, (player.npcHealth || 0) / npcMaxHealth))
        : 1

    if (healthRatio <= NPC_PHASE_THREE_HEALTH_RATIO) {
        return 3
    }
    if (healthRatio <= NPC_PHASE_TWO_HEALTH_RATIO) {
        return 2
    }
    return 1
}

function getDummyPhase(player) {
    if (!player || !player.isDummy) {
        return 1
    }
    const defeatsInCurrentLife = Number(player.defeatReceivedCount || 0) % PLAYER_DEATH_TRIGGER_COUNT
    const remainingHealthSegments = Math.max(0, PLAYER_DEATH_TRIGGER_COUNT - defeatsInCurrentLife)

    if (remainingHealthSegments <= 1) {
        return 3
    }
    if (remainingHealthSegments <= 2) {
        return 2
    }
    return 1
}

function isPersistentHumanPlayer(player) {
    return Boolean(player) && !player.isNpc && !player.isDummy
}

class World {
    constructor() {
        // players: 현재 월드에 존재하는 엔티티
        // playerProgress: 재접속 후 이어붙일 인간 유저 진행도
        this.players = new Map()
        this.playerProgress = new Map()
        this.sharedLivesRemaining = PLAYER_STARTING_LIVES
        this.lastHumanInputAt = Date.now()
        this.roundResetAnnouncementUntil = 0
        this.pendingRoundResetAt = 0
        this.grid = new SpatialGrid(CELL_SIZE)
        this.addDummyPlayers()
        this.addNerNpcPlayer()
    }

    addDummyPlayers() {
        DUMMY_SPECS.forEach((dummySpec) => {
            if (this.players.has(dummySpec.id)) {
                return
            }

            const player = new Player(dummySpec.id)
            const spawnPosition = this.getRandomQuadrantSpawnPosition(dummySpec.quadrant)
            player.x = spawnPosition.x
            player.y = spawnPosition.y
            player.isDummy = true
            player.dummyQuadrant = dummySpec.quadrant
            player.dummyDefaultDisplayName = dummySpec.displayName
            player.baseSpeed = DUMMY_BASE_SPEED_PER_SECOND
            player.currentSpeed = DUMMY_BASE_SPEED_PER_SECOND
            player.collisionSlowSpeed = getCollisionSlowSpeedForPlayer(player)

            this.players.set(dummySpec.id, player)
            this.grid.add(player)
        })
    }

    addNerNpcPlayer() {
        if (this.players.has(NPC_ID)) {
            return this.players.get(NPC_ID)
        }

        const player = new Player(NPC_ID)
        player.x = WORLD_SIZE / 2 + 180
        player.y = WORLD_SIZE / 2
        player.isNpc = true
        player.baseSpeed = NPC_BASE_SPEED_PER_SECOND
        player.currentSpeed = NPC_BASE_SPEED_PER_SECOND
        player.collisionSlowSpeed = getCollisionSlowSpeedForPlayer(player)
        player.npcState = "idle"
        player.npcPhase = 1
        player.npcMaxHealth = this.getScaledNpcMaxHealth()
        player.npcHealth = player.npcMaxHealth

        this.players.set(NPC_ID, player)
        this.grid.add(player)

        return player
    }

    getHumanPlayerCount() {
        return Array.from(this.players.values()).filter((player) => (
            !player.isNpc && !player.isDummy
        )).length
    }

    getScaledNpcMaxHealth() {
        const humanPlayerCount = Math.max(1, this.getHumanPlayerCount())
        return Math.max(1, Math.round(NPC_MAX_HEALTH * (1 + Math.max(0, humanPlayerCount - 1) * 0.2)))
    }

    rebalanceNpcHealthForHumanCount() {
        const npc = this.players.get(NPC_ID)
        if (!npc) {
            return
        }

        const previousMaxHealth = Math.max(1, Number(npc.npcMaxHealth || NPC_MAX_HEALTH))
        const nextMaxHealth = this.getScaledNpcMaxHealth()
        const currentRatio = Math.max(0, Math.min(1, Number(npc.npcHealth || 0) / previousMaxHealth))

        npc.npcMaxHealth = nextMaxHealth
        npc.npcHealth = Math.max(0, Math.min(nextMaxHealth, Math.round(nextMaxHealth * currentRatio)))
        npc.npcPhase = getNpcPhase(npc)
    }

    setNpcHealth(nextHealth) {
        const npc = this.players.get(NPC_ID)
        if (!npc) {
            return null
        }

        const safeHealth = Math.max(0, Math.min(Number(npc.npcMaxHealth || NPC_MAX_HEALTH), Number(nextHealth || 0)))
        npc.npcHealth = safeHealth
        npc.npcPhase = getNpcPhase(npc)
        return npc
    }

    getStoredPlayerProgress(connectionKey) {
        if (!connectionKey) {
            return null
        }
        return this.playerProgress.get(connectionKey) || null
    }

    updateStoredPlayerProgress(player) {
        if (!player || player.isNpc || player.isDummy) {
            return
        }

        const connectionKey = String(player.connectionKey || player.id || "").trim()
        if (!connectionKey) {
            return
        }

        // 연결이 끊겨도 유지돼야 하는 최소 정보만 남긴다.
        this.playerProgress.set(connectionKey, {
            displayId: player.id,
            skinName: player.skinName || "default",
            x: Number(player.x || 0),
            y: Number(player.y || 0),
            facingAngle: typeof player.facingAngle === "number" ? player.facingAngle : 0,
            currentSpeed: Number(player.currentSpeed || getBaseSpeedForPlayer(player)),
            defeatReceivedCount: Number(player.defeatReceivedCount || 0),
            defeatDealtCount: Number(player.defeatDealtCount || 0),
            collisionVisualUntil: Number(player.collisionVisualUntil || 0),
            collisionImpactUntil: Number(player.collisionImpactUntil || 0),
            collisionVisualType: player.collisionVisualType || "win",
            npcDefeatDamageRatio: Number(player.npcDefeatDamageRatio || 0),
            collisionImpactX: Number(player.collisionImpactX || 0),
            collisionImpactY: Number(player.collisionImpactY || 0),
            collisionRecoveryStartedAt: Number(player.collisionRecoveryStartedAt || 0),
            collisionRecoveryUntil: Number(player.collisionRecoveryUntil || 0),
            boostDisabledStartedAt: Number(player.boostDisabledStartedAt || 0),
            boostDisabledUntil: Number(player.boostDisabledUntil || 0),
            deathStartedAt: Number(player.deathStartedAt || 0),
            deathUntil: Number(player.deathUntil || 0),
            respawnRequested: Boolean(player.respawnRequested),
            lastActiveInputAt: Number(player.lastActiveInputAt || 0),
            doubleMerged: Boolean(player.doubleMerged),
            doubleSeparationPhase: String(player.doubleSeparationPhase || "merged"),
            doubleMergeLockUntil: Number(player.doubleMergeLockUntil || 0),
            doubleUnits: Array.isArray(player.doubleUnits)
                ? player.doubleUnits.map((unit) => ({
                    health: Number(unit.health || 0),
                    x: Number(unit.x || 0),
                    y: Number(unit.y || 0),
                    lastMoveX: Number(unit.lastMoveX || 0),
                    lastMoveY: Number(unit.lastMoveY || 0),
                    currentSpeed: Number(unit.currentSpeed || getBaseSpeedForPlayer(player)),
                    boostState: String(unit.boostState || "idle"),
                    boostDirectionX: Number(unit.boostDirectionX || 0),
                    boostDirectionY: Number(unit.boostDirectionY || 0),
                    collisionVisualUntil: Number(unit.collisionVisualUntil || 0),
                    collisionImpactUntil: Number(unit.collisionImpactUntil || 0),
                    collisionVisualType: String(unit.collisionVisualType || "win"),
                    collisionImpactX: Number(unit.collisionImpactX || 0),
                    collisionImpactY: Number(unit.collisionImpactY || 0),
                    collisionRecoveryStartedAt: Number(unit.collisionRecoveryStartedAt || 0),
                    collisionRecoveryUntil: Number(unit.collisionRecoveryUntil || 0),
                    boostDisabledStartedAt: Number(unit.boostDisabledStartedAt || 0),
                    boostDisabledUntil: Number(unit.boostDisabledUntil || 0),
                    inactiveUntil: Number(unit.inactiveUntil || 0),
                }))
                : []
        })
    }

    getOrAssignGuestDisplayId(connectionKey) {
        const savedProgress = this.getStoredPlayerProgress(connectionKey)
        if (savedProgress && savedProgress.displayId) {
            return savedProgress.displayId
        }

        const usedIds = new Set([NPC_ID, ...DUMMY_SPECS.map((dummySpec) => dummySpec.id)])
        for (const player of this.players.values()) {
            usedIds.add(player.id)
        }
        for (const progress of this.playerProgress.values()) {
            if (progress && progress.displayId) {
                usedIds.add(progress.displayId)
            }
        }

        // 게스트는 스핔이1, 스핔이2 ... 식으로 현재 미사용 번호를 찾는다.
        let suffix = 1
        while (usedIds.has(`스핔이${suffix}`)) {
            suffix += 1
        }
        return `스핔이${suffix}`
    }

    areAllHumanPlayersOut() {
        // 공용 목숨이 0 이고, 현재 살아 있는 인간 유저도 없을 때 라운드 종료로 본다.
        if (this.sharedLivesRemaining > 0) {
            return false
        }

        const humanPlayers = Array.from(this.players.values()).filter((player) => (
            !player.isNpc && !player.isDummy
        ))
        if (!humanPlayers.length) {
            return false
        }

        for (const player of humanPlayers) {
            if (!this.isPlayerDead(player)) {
                return false
            }
        }

        return true
    }

    resetNpcForNewRound(player, now) {
        if (!player || !player.isNpc) {
            return
        }

        // 라운드 리셋 시 네르는 기본 위치/기본 상태로 완전히 되돌린다.
        player.x = WORLD_SIZE / 2 + 180
        player.y = WORLD_SIZE / 2
        player.currentSpeed = NPC_BASE_SPEED_PER_SECOND
        player.boostState = "idle"
        player.boostDirectionX = 0
        player.boostDirectionY = 0
        player.input = {
            up: false,
            down: false,
            left: false,
            right: false,
            boost: false,
            respawn: false
        }
        player.lastMoveX = 0
        player.lastMoveY = 0
        player.collisionVisualUntil = 0
        player.collisionVisualType = "win"
        player.npcDefeatDamageRatio = 0
        player.npcWinVisualUntil = 0
        player.playerWinVisualUntil = 0
        player.collisionImpactX = 0
        player.collisionImpactY = 0
        player.collisionRecoveryStartedAt = 0
        player.collisionRecoveryUntil = 0
        player.boostDisabledStartedAt = now
        player.boostDisabledUntil = now
        player.deathStartedAt = 0
        player.deathUntil = 0
        player.npcMaxHealth = this.getScaledNpcMaxHealth()
        player.npcHealth = player.npcMaxHealth
        player.npcPhase = 1
        player.npcRespawnAt = 0
        player.npcState = "idle"
        player.npcTargetId = ""
        player.npcChargeDirectionX = 0
        player.npcChargeDirectionY = 0
        player.npcChargeDistanceRemaining = 0
        player.npcChargeDistanceTotal = 0
        player.npcChargeRedirected = false
        player.npcCounterWindowTargetId = ""
        player.npcCounterWindowPhase = 0
        player.npcCounterWindowUntil = 0
        player.npcCounterWindowConsumed = false
        player.npcChargeWindupStartedAt = 0
        player.npcChargeWindupUntil = 0
        player.npcRestUntil = 0
        player.npcQueuedExtraCharges = 0
        this.grid.move(player)
    }

    resetRoundLives(now) {
        this.sharedLivesRemaining = PLAYER_STARTING_LIVES
        this.roundResetAnnouncementUntil = now + PLAYER_DEATH_DURATION_MS
        this.pendingRoundResetAt = 0

        for (const player of this.players.values()) {
            if (player.isNpc) {
                this.resetNpcForNewRound(player, now)
                continue
            }
            if (player.isDummy) {
                continue
            }

            player.livesRemaining = PLAYER_STARTING_LIVES
            player.respawnRequested = false
            this.updateStoredPlayerProgress(player)
        }
    }

    resetHumanProgressAfterIdle(now) {
        // 장시간 아무 입력이 없으면 "새 판 시작"으로 보고
        // 공용 목숨, 통계, 저장 진행도를 모두 초기화한다.
        this.sharedLivesRemaining = PLAYER_STARTING_LIVES
        this.playerProgress.clear()

        for (const player of this.players.values()) {
            if (player.isNpc) {
                this.resetNpcForNewRound(player, now)
                continue
            }
            if (player.isDummy) {
                continue
            }

            player.defeatReceivedCount = 0
            player.defeatDealtCount = 0
            player.livesRemaining = PLAYER_STARTING_LIVES
            player.respawnRequested = false
            this.respawnPlayer(player, now)
        }
    }

    maybeResetAfterInputIdle(now) {
        if (now - (this.lastHumanInputAt || 0) < INPUT_IDLE_RESET_MS) {
            return
        }

        this.resetHumanProgressAfterIdle(now)
        this.lastHumanInputAt = now
    }

    syncDoubleSkinState(player, now = Date.now()) {
        if (!player || player.isNpc || player.isDummy) {
            return
        }

        const wasDoubleSkin = Boolean(player.isDoubleSkin)
        const shouldUseDoubleSkin = isDoubleSkinPlayer(player)
        player.isDoubleSkin = shouldUseDoubleSkin
        if (!shouldUseDoubleSkin) {
            player.doubleMerged = false
            player.doubleSeparationPhase = "merged"
            player.doubleUnits = [createDoubleUnitState(now), createDoubleUnitState(now)]
            return
        }

        if (!Array.isArray(player.doubleUnits) || player.doubleUnits.length !== DOUBLE_UNIT_COUNT) {
            player.doubleUnits = [createDoubleUnitState(now), createDoubleUnitState(now)]
        }

        player.doubleUnits = player.doubleUnits.map((unit) => ({
            ...createDoubleUnitState(now),
            ...(unit || {}),
            health: Math.max(
                0,
                Math.min(
                    DOUBLE_UNIT_HEALTH,
                    Number(unit && unit.health !== undefined ? unit.health : DOUBLE_UNIT_HEALTH)
                )
            ),
            currentSpeed: Math.max(getBaseSpeedForPlayer(player), Number(unit && unit.currentSpeed || getBaseSpeedForPlayer(player))),
        }))
        const hasMeaningfulUnitPosition = player.doubleUnits.some((unit) => (
            Math.abs(Number(unit && unit.x || 0)) > 0.001 ||
            Math.abs(Number(unit && unit.y || 0)) > 0.001
        ))
        if (!wasDoubleSkin || typeof player.doubleMerged !== "boolean" || !hasMeaningfulUnitPosition) {
            player.doubleMerged = true
        }
        player.doubleMergeLockUntil = Number(player.doubleMergeLockUntil || 0)
        player.doubleSeparationPhase = player.doubleMerged ? "merged" : (player.doubleSeparationPhase || "split")
        this.ensureDoubleUnitLayout(player, now)
    }

    ensureDoubleUnitLayout(player, now = Date.now()) {
        if (!player || !player.isDoubleSkin || !Array.isArray(player.doubleUnits)) {
            return
        }

        const aliveIndices = getDoubleAliveUnitIndices(player)
        if (aliveIndices.length <= 1) {
            player.doubleMerged = false
            player.doubleSeparationPhase = "single"
            player.doubleMergeLockUntil = 0
            player.doubleSeparatedAt = Number(player.doubleSeparatedAt || 0)
            const liveIndex = aliveIndices.length ? aliveIndices[0] : 0
            player.doubleUnits.forEach((unit, index) => {
                if (!unit) {
                    return
                }
                if (index === liveIndex && aliveIndices.length) {
                    unit.x = player.x
                    unit.y = player.y
                    unit.inactiveUntil = 0
                } else {
                    unit.x = player.x
                    unit.y = player.y
                    unit.inactiveUntil = unit.inactiveUntil || (now + DOUBLE_INACTIVE_FADE_MS)
                }
            })
            return
        }

        if (player.doubleMerged) {
            player.doubleSeparationPhase = "merged"
            const angle = typeof player.facingAngle === "number" ? player.facingAngle : 0
            const sideX = -Math.sin(angle)
            const sideY = Math.cos(angle)
            const leftUnit = player.doubleUnits[0]
            const rightUnit = player.doubleUnits[1]
            leftUnit.x = player.x - sideX * DOUBLE_MERGED_SIDE_OFFSET
            leftUnit.y = player.y - sideY * DOUBLE_MERGED_SIDE_OFFSET
            rightUnit.x = player.x + sideX * DOUBLE_MERGED_SIDE_OFFSET
            rightUnit.y = player.y + sideY * DOUBLE_MERGED_SIDE_OFFSET
            leftUnit.inactiveUntil = 0
            rightUnit.inactiveUntil = 0
        }
    }

    getDoubleMergeThreshold(player) {
        return this.getCollisionRadius(player) + DOUBLE_REJOIN_EXTRA_DISTANCE
    }

    getDoubleHitUnitIndex(player, normalX, normalY) {
        if (!player || !player.isDoubleSkin) {
            return 0
        }
        const aliveIndices = getDoubleAliveUnitIndices(player)
        if (aliveIndices.length <= 1) {
            return aliveIndices[0] || 0
        }
        let bestIndex = aliveIndices[0]
        let bestProjection = -Infinity
        aliveIndices.forEach((unitIndex) => {
            const unit = player.doubleUnits[unitIndex]
            if (!unit) {
                return
            }
            const offsetX = Number(unit.x || 0) - Number(player.x || 0)
            const offsetY = Number(unit.y || 0) - Number(player.y || 0)
            const projection = offsetX * normalX + offsetY * normalY
            if (projection > bestProjection) {
                bestProjection = projection
                bestIndex = unitIndex
            }
        })
        if (player.doubleMerged && aliveIndices.length > 1) {
            const movingLeft = Number(player.lastMoveX || 0) < -0.001
            const facingLeft = Math.cos(typeof player.facingAngle === "number" ? player.facingAngle : 0) < 0
            const shouldReverseMergedHit = movingLeft || (!Math.abs(Number(player.lastMoveX || 0)) && facingLeft)
            if (shouldReverseMergedHit) {
                return bestIndex === 0 ? 1 : 0
            }
        }
        return bestIndex
    }

    getCollisionReferencePoint(player, towardX, towardY) {
        if (!player || !player.isDoubleSkin || player.doubleMerged || !Array.isArray(player.doubleUnits)) {
            return {
                x: Number(player && player.x || 0),
                y: Number(player && player.y || 0)
            }
        }

        const aliveIndices = getDoubleAliveUnitIndices(player)
        if (!aliveIndices.length) {
            return {
                x: Number(player.x || 0),
                y: Number(player.y || 0)
            }
        }

        let bestUnit = player.doubleUnits[aliveIndices[0]]
        let bestDistance = Infinity
        aliveIndices.forEach((unitIndex) => {
            const unit = player.doubleUnits[unitIndex]
            if (!unit) {
                return
            }
            const distance = Math.hypot(Number(unit.x || 0) - towardX, Number(unit.y || 0) - towardY)
            if (distance < bestDistance) {
                bestDistance = distance
                bestUnit = unit
            }
        })

        return {
            x: Number(bestUnit && bestUnit.x || player.x || 0),
            y: Number(bestUnit && bestUnit.y || player.y || 0)
        }
    }

    recenterDoublePlayer(player) {
        if (!player || !player.isDoubleSkin || !Array.isArray(player.doubleUnits)) {
            return
        }
        const aliveIndices = getDoubleAliveUnitIndices(player)
        if (!aliveIndices.length) {
            return
        }
        if (aliveIndices.length === 1) {
            const liveUnit = player.doubleUnits[aliveIndices[0]]
            if (liveUnit) {
                player.x = liveUnit.x
                player.y = liveUnit.y
            }
            return
        }
        const liveUnits = aliveIndices.map((unitIndex) => player.doubleUnits[unitIndex]).filter(Boolean)
        if (!liveUnits.length) {
            return
        }
        player.x = liveUnits.reduce((sum, unit) => sum + Number(unit.x || 0), 0) / liveUnits.length
        player.y = liveUnits.reduce((sum, unit) => sum + Number(unit.y || 0), 0) / liveUnits.length
    }

    applyCollisionPush(player, pushDirX, pushDirY, distance) {
        if (!player) {
            return
        }
        const appliedDistance = distance * 0.5
        if (player.isDoubleSkin && !player.doubleMerged && Array.isArray(player.doubleUnits)) {
            const hitUnitIndex = this.getDoubleHitUnitIndex(player, -pushDirX, -pushDirY)
            const targetUnit = player.doubleUnits[hitUnitIndex]
            if (targetUnit && Number(targetUnit.health || 0) > 0) {
                targetUnit.lastMoveX = pushDirX * appliedDistance
                targetUnit.lastMoveY = pushDirY * appliedDistance
                targetUnit.x = this.clampToWorld(Number(targetUnit.x || 0) + pushDirX * appliedDistance)
                targetUnit.y = this.clampToWorld(Number(targetUnit.y || 0) + pushDirY * appliedDistance)
                this.recenterDoublePlayer(player)
                return
            }
        }
        player.lastMoveX = pushDirX * appliedDistance
        player.lastMoveY = pushDirY * appliedDistance
        player.x = this.clampToWorld(Number(player.x || 0) + pushDirX * appliedDistance)
        player.y = this.clampToWorld(Number(player.y || 0) + pushDirY * appliedDistance)
        if (player.isDoubleSkin && player.doubleMerged && Array.isArray(player.doubleUnits)) {
            player.doubleUnits.forEach((unit) => {
                if (!unit || Number(unit.health || 0) <= 0) {
                    return
                }
                unit.lastMoveX = pushDirX * appliedDistance
                unit.lastMoveY = pushDirY * appliedDistance
                unit.x = this.clampToWorld(Number(unit.x || 0) + pushDirX * appliedDistance)
                unit.y = this.clampToWorld(Number(unit.y || 0) + pushDirY * appliedDistance)
            })
        }
    }

    rotateVector(dx, dy, angle) {
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        return {
            dx: dx * cos - dy * sin,
            dy: dx * sin + dy * cos
        }
    }

    normalizeAngle(angle) {
        let nextAngle = angle
        while (nextAngle > Math.PI) {
            nextAngle -= Math.PI * 2
        }
        while (nextAngle < -Math.PI) {
            nextAngle += Math.PI * 2
        }
        return nextAngle
    }

    updateDoubleUnits(player, now, inputDx, inputDy) {
        if (!player || !player.isDoubleSkin || !Array.isArray(player.doubleUnits)) {
            return { dx: inputDx, dy: inputDy }
        }

        const baseSpeed = getBaseSpeedForPlayer(player)
        const maxBoostSpeed = getMaxBoostedSpeedForPlayer(player)
        const aliveIndices = getDoubleAliveUnitIndices(player)
        if (!aliveIndices.length) {
            return { dx: 0, dy: 0 }
        }

        const isMerged = aliveIndices.length > 1 && player.doubleMerged
        const hasInput = Math.hypot(inputDx, inputDy) > 0.001
        const leadUnit = player.doubleUnits[aliveIndices[0]]
        if (!leadUnit) {
            return { dx: inputDx, dy: inputDy }
        }

        if (player.input.boost && hasInput) {
            aliveIndices.forEach((unitIndex, orderIndex) => {
                const unit = player.doubleUnits[unitIndex]
                if (!unit || unit.boostDisabledUntil > now || unit.collisionRecoveryUntil > now) {
                    return
                }
                if (unit.boostState !== "idle") {
                    return
                }
                let direction = { dx: inputDx, dy: inputDy }
                if (isMerged && aliveIndices.length > 1) {
                    direction = this.rotateVector(
                        inputDx,
                        inputDy,
                        orderIndex === 0 ? -DOUBLE_SEPARATION_ANGLE_RADIANS : DOUBLE_SEPARATION_ANGLE_RADIANS
                    )
                    player.doubleMerged = false
                    player.doubleSeparationPhase = "split"
                    player.doubleMergeLockUntil = now + DOUBLE_REMERGE_LOCK_MS
                    player.doubleSeparatedAt = now
                }
                unit.boostState = "charging"
                unit.boostDirectionX = direction.dx
                unit.boostDirectionY = direction.dy
                unit.currentSpeed = baseSpeed
                if (isMerged && aliveIndices.length > 1) {
                    unit.splitProtectedUntil = now + DOUBLE_SPLIT_PROTECTION_MS
                }
            })
        }

        aliveIndices.forEach((unitIndex) => {
            const unit = player.doubleUnits[unitIndex]
            if (!unit) {
                return
            }

            let desiredDx = inputDx
            let desiredDy = inputDy
            const doubleIdleStartedAt = Math.max(
                Number(player.doubleSeparatedAt || 0),
                Number(player.lastActiveInputAt || 0)
            )
            const canAutoMergeMove = !hasInput &&
                !player.doubleMerged &&
                aliveIndices.length > 1 &&
                now - doubleIdleStartedAt >= DOUBLE_IDLE_REMERGE_DELAY_MS
            if (canAutoMergeMove) {
                const otherIndex = aliveIndices.find((index) => index !== unitIndex)
                const otherUnit = typeof otherIndex === "number" ? player.doubleUnits[otherIndex] : null
                if (otherUnit) {
                    const diffX = otherUnit.x - unit.x
                    const diffY = otherUnit.y - unit.y
                    const distance = Math.hypot(diffX, diffY)
                    if (distance > 0.001) {
                        desiredDx = diffX / distance
                        desiredDy = diffY / distance
                        unit.currentSpeed = baseSpeed
                    }
                }
            } else if (!player.doubleMerged && aliveIndices.length > 1 && hasInput && unit.boostState === "idle") {
                const otherIndex = aliveIndices.find((index) => index !== unitIndex)
                const otherUnit = typeof otherIndex === "number" ? player.doubleUnits[otherIndex] : null
                if (otherUnit) {
                    const diffX = otherUnit.x - unit.x
                    const diffY = otherUnit.y - unit.y
                    const distance = Math.hypot(diffX, diffY)
                    if (distance > 0.001) {
                        const attractionRatio = Math.max(0, Math.min(1, 1 - (distance / (DOUBLE_MERGED_SIDE_OFFSET * 6))))
                        const steerAngle = DOUBLE_STEER_MIN_RADIANS + (DOUBLE_STEER_MAX_RADIANS - DOUBLE_STEER_MIN_RADIANS) * attractionRatio
                        const inputAngle = Math.atan2(inputDy, inputDx)
                        const attractionAngle = Math.atan2(diffY, diffX)
                        const angleDelta = this.normalizeAngle(attractionAngle - inputAngle)
                        const lateralDistance = Math.abs((-inputDy * diffX) + (inputDx * diffY))
                        if (
                            Math.abs(angleDelta) <= DOUBLE_STEER_DEADZONE_RADIANS ||
                            lateralDistance <= DOUBLE_ALIGNMENT_DEADZONE_DISTANCE
                        ) {
                            desiredDx = inputDx
                            desiredDy = inputDy
                        } else {
                            const appliedAngle = Math.sign(angleDelta || 1) * Math.min(Math.abs(angleDelta), steerAngle)
                            const rotated = this.rotateVector(inputDx, inputDy, appliedAngle)
                            desiredDx = rotated.dx
                            desiredDy = rotated.dy
                        }
                    }
                }
            }

            if (unit.collisionRecoveryUntil > now) {
                const duration = Math.max(1, unit.collisionRecoveryUntil - unit.collisionRecoveryStartedAt)
                const progress = Math.max(0, Math.min(1, (now - unit.collisionRecoveryStartedAt) / duration))
                unit.boostState = "idle"
                unit.currentSpeed = player.collisionSlowSpeed + (baseSpeed - player.collisionSlowSpeed) * progress
            } else if (unit.boostState === "charging") {
                desiredDx = unit.boostDirectionX
                desiredDy = unit.boostDirectionY
                unit.currentSpeed = Math.min(maxBoostSpeed, unit.currentSpeed + BOOST_ACCELERATION_PER_SECOND * TICK_DELTA_SECONDS)
                if (unit.currentSpeed >= maxBoostSpeed) {
                    unit.boostState = "cooldown"
                }
            } else if (unit.boostState === "cooldown") {
                desiredDx = unit.boostDirectionX
                desiredDy = unit.boostDirectionY
                unit.currentSpeed = Math.max(baseSpeed, unit.currentSpeed - BOOST_COOLDOWN_PER_SECOND * TICK_DELTA_SECONDS)
                if (unit.currentSpeed <= baseSpeed) {
                    unit.currentSpeed = baseSpeed
                    unit.boostState = "idle"
                    unit.boostDirectionX = 0
                    unit.boostDirectionY = 0
                    unit.boostDisabledStartedAt = now
                    unit.boostDisabledUntil = now + USER_POST_BOOST_COOLDOWN_MS
                }
            } else {
                unit.currentSpeed = baseSpeed
            }

            unit.lastMoveX = desiredDx * unit.currentSpeed * TICK_DELTA_SECONDS
            unit.lastMoveY = desiredDy * unit.currentSpeed * TICK_DELTA_SECONDS
            if (Math.abs(desiredDx) > 0.001 || Math.abs(desiredDy) > 0.001) {
                unit.facingAngle = Math.atan2(desiredDy, desiredDx)
            }
            unit.x = this.clampToWorld(unit.x + unit.lastMoveX)
            unit.y = this.clampToWorld(unit.y + unit.lastMoveY)
        })

        if (aliveIndices.length > 1) {
            const unitA = player.doubleUnits[aliveIndices[0]]
            const unitB = player.doubleUnits[aliveIndices[1]]
            const centerX = (unitA.x + unitB.x) / 2
            const centerY = (unitA.y + unitB.y) / 2
            const diffX = unitB.x - unitA.x
            const diffY = unitB.y - unitA.y
            const distance = Math.hypot(diffX, diffY)
            player.x = centerX
            player.y = centerY
            if (player.doubleMerged) {
                player.doubleSeparationPhase = "merged"
                this.ensureDoubleUnitLayout(player, now)
            } else if (distance <= this.getDoubleMergeThreshold(player) && now >= Number(player.doubleMergeLockUntil || 0)) {
                player.doubleMerged = true
                player.doubleSeparationPhase = "merged"
                player.doubleMergeLockUntil = 0
                player.doubleSeparatedAt = 0
                this.ensureDoubleUnitLayout(player, now)
            } else {
                player.doubleMerged = false
                player.doubleSeparationPhase = "split"
            }
        } else {
            const liveIndex = aliveIndices[0]
            const liveUnit = player.doubleUnits[liveIndex]
            player.doubleMerged = false
            player.doubleSeparationPhase = "single"
            player.doubleSeparatedAt = Number(player.doubleSeparatedAt || 0)
            player.x = liveUnit.x
            player.y = liveUnit.y
        }

        const averageMoveX = aliveIndices.reduce((sum, unitIndex) => sum + Number(player.doubleUnits[unitIndex].lastMoveX || 0), 0) / aliveIndices.length
        const averageMoveY = aliveIndices.reduce((sum, unitIndex) => sum + Number(player.doubleUnits[unitIndex].lastMoveY || 0), 0) / aliveIndices.length
        return {
            dx: averageMoveX,
            dy: averageMoveY
        }
    }

    addPlayer(connectionKey, displayId = connectionKey, options = {}) {
        const resolvedConnectionKey = String(connectionKey || displayId || "").trim()
        const resolvedDisplayId = String(displayId || resolvedConnectionKey || "").trim()
        const existingPlayer = this.players.get(resolvedDisplayId)
        if (existingPlayer) {
            this.grid.remove(existingPlayer)
            this.players.delete(resolvedDisplayId)
        }

        const player = new Player(resolvedDisplayId)
        player.connectionKey = resolvedConnectionKey || resolvedDisplayId
        const requestedSkinName = String(options.skinName || "").trim() || ""
        player.skinName = requestedSkinName || "default"
        player.baseSpeed = getBaseSpeedForPlayer(player)
        player.currentSpeed = getBaseSpeedForPlayer(player)
        player.collisionSlowSpeed = getCollisionSlowSpeedForPlayer(player)
        this.syncDoubleSkinState(player)

        // 같은 connectionKey 로 재접속하면 이전 통계를 이어받는다.
        const savedProgress = this.getStoredPlayerProgress(player.connectionKey)
        if (savedProgress) {
            player.skinName = requestedSkinName || (String(savedProgress.skinName || player.skinName || "default").trim() || "default")
            player.baseSpeed = getBaseSpeedForPlayer(player)
            player.collisionSlowSpeed = getCollisionSlowSpeedForPlayer(player)
            this.syncDoubleSkinState(player)
            player.x = this.clampToWorld(Number(savedProgress.x || player.x))
            player.y = this.clampToWorld(Number(savedProgress.y || player.y))
            player.facingAngle = typeof savedProgress.facingAngle === "number"
                ? savedProgress.facingAngle
                : player.facingAngle
            player.currentSpeed = Math.max(
                getBaseSpeedForPlayer(player),
                Number(savedProgress.currentSpeed || getBaseSpeedForPlayer(player))
            )
            player.defeatReceivedCount = Number(savedProgress.defeatReceivedCount || 0)
            player.defeatDealtCount = Number(savedProgress.defeatDealtCount || 0)
            player.collisionVisualUntil = Number(savedProgress.collisionVisualUntil || 0)
            player.collisionImpactUntil = Number(savedProgress.collisionImpactUntil || 0)
            player.collisionVisualType = savedProgress.collisionVisualType || "win"
            player.npcDefeatDamageRatio = Number(savedProgress.npcDefeatDamageRatio || 0)
            player.collisionImpactX = Number(savedProgress.collisionImpactX || 0)
            player.collisionImpactY = Number(savedProgress.collisionImpactY || 0)
            player.collisionRecoveryStartedAt = Number(savedProgress.collisionRecoveryStartedAt || 0)
            player.collisionRecoveryUntil = Number(savedProgress.collisionRecoveryUntil || 0)
            player.boostDisabledStartedAt = Number(savedProgress.boostDisabledStartedAt || 0)
            player.boostDisabledUntil = Number(savedProgress.boostDisabledUntil || 0)
            player.deathStartedAt = Number(savedProgress.deathStartedAt || 0)
            player.deathUntil = Number(savedProgress.deathUntil || 0)
            player.respawnRequested = Boolean(savedProgress.respawnRequested)
            player.lastActiveInputAt = Number(savedProgress.lastActiveInputAt || player.lastActiveInputAt || Date.now())
            const hasSavedDoubleState = Array.isArray(savedProgress.doubleUnits) && savedProgress.doubleUnits.length === DOUBLE_UNIT_COUNT
            if (hasSavedDoubleState) {
                player.doubleMerged = typeof savedProgress.doubleMerged === "boolean" ? savedProgress.doubleMerged : true
                player.doubleSeparationPhase = String(savedProgress.doubleSeparationPhase || (player.doubleMerged ? "merged" : "split"))
                player.doubleMergeLockUntil = Number(savedProgress.doubleMergeLockUntil || 0)
                player.doubleUnits = savedProgress.doubleUnits.map((unit) => ({
                    ...createDoubleUnitState(Date.now()),
                    ...(unit || {}),
                    health: Math.max(
                        0,
                        Math.min(
                            DOUBLE_UNIT_HEALTH,
                            Number(unit && unit.health !== undefined ? unit.health : DOUBLE_UNIT_HEALTH)
                        )
                    ),
                }))
            } else if (player.isDoubleSkin) {
                player.doubleMerged = true
                player.doubleSeparationPhase = "merged"
                player.doubleMergeLockUntil = 0
                player.doubleUnits = [createDoubleUnitState(Date.now()), createDoubleUnitState(Date.now())]
            }
        }
        player.livesRemaining = this.sharedLivesRemaining
        this.syncDoubleSkinState(player)

        this.players.set(resolvedDisplayId, player)
        this.grid.add(player)
        this.updateStoredPlayerProgress(player)
        this.rebalanceNpcHealthForHumanCount()

        return player
    }

    removePlayer(player) {
        this.updateStoredPlayerProgress(player)
        this.grid.remove(player)
        this.players.delete(player.id)
        this.rebalanceNpcHealthForHumanCount()
    }

    handleInput(player, data) {
        try {
            const input = JSON.parse(data)

            // 클라이언트 입력 구조는 이 키 집합으로 고정한다.
            player.input = {
                up: Boolean(input.up),
                down: Boolean(input.down),
                left: Boolean(input.left),
                right: Boolean(input.right),
                boost: Boolean(input.boost),
                respawn: Boolean(input.respawn)
            }
        } catch (error) {
            player.input = {
                up: false,
                down: false,
                left: false,
                right: false,
                boost: false,
                respawn: false
            }
        }
    }

    markHumanInput(player, at = Date.now()) {
        if (!player || player.isNpc || player.isDummy) {
            return
        }

        // 소켓 단위 idle close 와는 별도로,
        // "라운드 전체 유휴 초기화" 기준 시각을 갱신한다.
        this.lastHumanInputAt = at
        player.lastActiveInputAt = at
    }

    clampToWorld(value) {
        return Math.max(0, Math.min(WORLD_SIZE, value))
    }

    getWallBounceDistance(moveDelta) {
        return Math.min(
            WALL_MAX_BOUNCE_DISTANCE,
            WALL_BOUNCE_DISTANCE + Math.abs(moveDelta) * WALL_BOUNCE_SPEED_BOUNCE_MULTIPLIER
        )
    }

    applyWallBouncePosition(nextValue, moveDelta) {
        if (nextValue < 0) {
            return this.clampToWorld(this.getWallBounceDistance(moveDelta))
        }
        if (nextValue > WORLD_SIZE) {
            return this.clampToWorld(WORLD_SIZE - this.getWallBounceDistance(moveDelta))
        }
        return nextValue
    }

    handleWallBoostCollision(player, now, hitNormalX, hitNormalY) {
        if (!player) {
            return
        }

        const collisionVisualUntil = now + COLLISION_VISUAL_BASE_DURATION_MS
        player.collisionVisualUntil = collisionVisualUntil
        player.collisionImpactUntil = now + COLLISION_IMPACT_DURATION_MS
        player.collisionVisualType = "win"
        player.npcDefeatDamageRatio = 0
        player.collisionImpactX = hitNormalX
        player.collisionImpactY = hitNormalY

        if (player.isNpc) {
            player.npcState = "rest"
            player.npcRestUntil = now + NPC_REST_DURATION_MS
            player.npcTargetId = ""
            player.npcChargeDistanceRemaining = 0
            player.npcChargeDistanceTotal = 0
            player.npcChargeWindupStartedAt = 0
            player.npcChargeWindupUntil = 0
            player.npcQueuedExtraCharges = 0
            player.boostState = "idle"
            player.currentSpeed = NPC_BASE_SPEED_PER_SECOND
            player.boostDirectionX = 0
            player.boostDirectionY = 0
            return
        }

        if (player.isDummy) {
            player.boostState = "idle"
            player.currentSpeed = DUMMY_BASE_SPEED_PER_SECOND
            player.boostDirectionX = 0
            player.boostDirectionY = 0
            player.dummyChargeDistanceRemaining = 0
            player.dummyChargeDistanceTotal = 0
            player.dummyState = "chase"
            player.dummyChargeWindupStartedAt = 0
            player.dummyChargeWindupUntil = 0
            player.dummyRestUntil = 0
            player.dummyQueuedExtraCharges = 0
            return
        }

        this.applyCollisionSlow(player, now, collisionVisualUntil)
    }

    getCollisionHalfExtents(player) {
        // 현재는 유저/네르만 다른 충돌 크기를 가진다.
        if (player && player.isNpc) {
            return {
                halfWidth: NPC_COLLISION_HALF_WIDTH,
                halfHeight: NPC_COLLISION_HALF_HEIGHT
            }
        }

        return {
            halfWidth: PLAYER_COLLISION_HALF_WIDTH,
            halfHeight: PLAYER_COLLISION_HALF_HEIGHT
        }
    }

    getSingleCollisionDirectionRadius(player, normalX, normalY, angleOverride = null) {
        // 회전된 둥근 직사각형을 한 방향에서 바라본 "유효 반지름"으로 바꿔서
        // 방향별 충돌 거리 계산에 사용한다.
        const { halfWidth, halfHeight } = this.getCollisionHalfExtents(player)
        const angle = angleOverride === null
            ? (player && typeof player.facingAngle === "number" ? player.facingAngle : 0)
            : angleOverride
        const localXAxisX = Math.cos(angle)
        const localXAxisY = Math.sin(angle)
        const localYAxisX = -Math.sin(angle)
        const localYAxisY = Math.cos(angle)
        const localX = normalX * localXAxisX + normalY * localXAxisY
        const localY = normalX * localYAxisX + normalY * localYAxisY
        const cornerRadius = Math.min(halfWidth, halfHeight) * 0.28
        const innerHalfWidth = Math.max(0, halfWidth - cornerRadius)
        const innerHalfHeight = Math.max(0, halfHeight - cornerRadius)

        return (Math.abs(localX) * innerHalfWidth) + (Math.abs(localY) * innerHalfHeight) + cornerRadius
    }

    getCollisionDirectionRadius(player, normalX, normalY) {
        if (player && player.isDoubleSkin && !player.doubleMerged && Array.isArray(player.doubleUnits)) {
            const aliveIndices = getDoubleAliveUnitIndices(player)
            if (aliveIndices.length) {
                let bestRadius = 0
                aliveIndices.forEach((unitIndex) => {
                    const unit = player.doubleUnits[unitIndex]
                    if (!unit) {
                        return
                    }
                    const offsetX = Number(unit.x || 0) - Number(player.x || 0)
                    const offsetY = Number(unit.y || 0) - Number(player.y || 0)
                    const unitRadius = this.getSingleCollisionDirectionRadius(player, normalX, normalY, typeof unit.facingAngle === "number" ? unit.facingAngle : null)
                    bestRadius = Math.max(bestRadius, (offsetX * normalX) + (offsetY * normalY) + unitRadius)
                })
                return Math.max(0, bestRadius)
            }
        }

        return this.getSingleCollisionDirectionRadius(player, normalX, normalY)
    }

    isPlayerDead(player) {
        return Boolean(player) && player.deathUntil !== 0
    }

    isPlayerDeathAnimating(player, now = Date.now()) {
        return Boolean(player) && player.deathUntil > now
    }

    getRandomEdgeSpawnPosition() {
        const padding = RESPAWN_EDGE_PADDING
        const minAxis = padding
        const maxAxis = Math.max(padding, WORLD_SIZE - padding)
        const axisValue = minAxis + Math.random() * Math.max(0, maxAxis - minAxis)
        const side = Math.floor(Math.random() * 4)

        if (side === 0) {
            return { x: padding, y: axisValue }
        }
        if (side === 1) {
            return { x: WORLD_SIZE - padding, y: axisValue }
        }
        if (side === 2) {
            return { x: axisValue, y: padding }
        }
        return { x: axisValue, y: WORLD_SIZE - padding }
    }

    getRandomQuadrantSpawnPosition(quadrant) {
        const padding = RESPAWN_EDGE_PADDING
        const midpoint = WORLD_SIZE / 2
        const minX = quadrant === 1 || quadrant === 3 ? padding : midpoint + padding
        const maxX = quadrant === 1 || quadrant === 3 ? midpoint - padding : WORLD_SIZE - padding
        const minY = quadrant === 1 || quadrant === 2 ? padding : midpoint + padding
        const maxY = quadrant === 1 || quadrant === 2 ? midpoint - padding : WORLD_SIZE - padding

        return {
            x: minX + Math.random() * Math.max(0, maxX - minX),
            y: minY + Math.random() * Math.max(0, maxY - minY),
        }
    }

    triggerPlayerDeath(player, now, defeatedByPlayer = null) {
        if (!player || player.isNpc || player.isDummy || this.isPlayerDead(player)) {
            return
        }

        // 유저 사망은 공용 목숨을 깎고, 입력과 이동을 모두 멈춘다.
        this.sharedLivesRemaining = Math.max(0, Number(this.sharedLivesRemaining || 0) - 1)
        player.livesRemaining = this.sharedLivesRemaining
        player.deathStartedAt = now
        player.deathUntil = now + PLAYER_DEATH_DURATION_MS
        player.boostState = "idle"
        player.input = {
            up: false,
            down: false,
            left: false,
            right: false,
            boost: false,
            respawn: false
        }
        player.currentSpeed = 0
        player.boostDirectionX = 0
        player.boostDirectionY = 0
        player.respawnRequested = false
        player.collisionVisualType = "defeat"
        player.npcDefeatDamageRatio = 1
        player.collisionVisualUntil = player.deathUntil
        player.collisionImpactUntil = 0
        player.collisionImpactX = 0
        player.collisionImpactY = 0
        player.collisionRecoveryStartedAt = 0
        player.collisionRecoveryUntil = 0
        player.boostDisabledUntil = Math.max(player.boostDisabledUntil || 0, player.deathUntil)
        player.lastMoveX = 0
        player.lastMoveY = 0
        if (defeatedByPlayer && defeatedByPlayer.isNpc) {
            defeatedByPlayer.npcWinVisualUntil = now + 3000
        }
        if (isPersistentHumanPlayer(defeatedByPlayer) && !defeatedByPlayer.isNpc && !defeatedByPlayer.isDummy) {
            defeatedByPlayer.playerWinVisualUntil = now + 3000
            postStatsUpdate(defeatedByPlayer.id, { player_kills: 1 })
        }
        this.updateStoredPlayerProgress(player)
        postStatsUpdate(player.id, { deaths: 1 })

        // 공용 목숨이 모두 소진되고 전원이 쓰러졌다면,
        // 마지막 사망 연출이 끝난 뒤 다음 라운드로 리셋한다.
        if (this.areAllHumanPlayersOut()) {
            this.pendingRoundResetAt = Math.max(Number(this.pendingRoundResetAt || 0), player.deathUntil)
        }
    }

    triggerDummyDeath(player, now, defeatedByPlayer = null) {
        if (!player || !player.isDummy || this.isPlayerDead(player)) {
            return
        }

        // 더미는 공용 목숨과 무관하게 사망 연출 후 3분 뒤 자동 리스폰한다.
        player.deathStartedAt = now
        player.deathUntil = now + PLAYER_DEATH_DURATION_MS
        player.npcRespawnAt = player.deathUntil + DUMMY_RESPAWN_DELAY_MS
        player.boostState = "idle"
        player.input = {
            up: false,
            down: false,
            left: false,
            right: false,
            boost: false,
            respawn: false
        }
        player.currentSpeed = 0
        player.boostDirectionX = 0
        player.boostDirectionY = 0
        player.respawnRequested = false
        player.collisionVisualType = "defeat"
        player.npcDefeatDamageRatio = 1
        player.collisionVisualUntil = player.deathUntil
        player.collisionImpactUntil = 0
        player.npcWinVisualUntil = 0
        player.playerWinVisualUntil = 0
        player.collisionImpactX = 0
        player.collisionImpactY = 0
        player.collisionRecoveryStartedAt = 0
        player.collisionRecoveryUntil = 0
        player.boostDisabledUntil = Math.max(player.boostDisabledUntil || 0, player.deathUntil)
        player.lastMoveX = 0
        player.lastMoveY = 0
        player.dummyRetaliationTargetId = ""
        player.dummyState = "idle"
        player.dummyPhase = 1
        player.dummyChargeDistanceRemaining = 0
        player.dummyChargeDistanceTotal = 0
        player.dummyChargeWindupStartedAt = 0
        player.dummyChargeWindupUntil = 0
        player.dummyRestUntil = 0
        player.dummyQueuedExtraCharges = 0
        if (isPersistentHumanPlayer(defeatedByPlayer)) {
            defeatedByPlayer.playerWinVisualUntil = now + 3000
            postStatsUpdate(defeatedByPlayer.id, { dummy_kills: 1 })
        }
    }

    triggerNpcDeath(player, now, defeatedByPlayer = null) {
        if (!player || !player.isNpc || this.isPlayerDead(player)) {
            return
        }

        // 네르는 체력이 0 이하가 되면 즉시 dead 상태로 들어가고,
        // 애니메이션 후 일정 시간 뒤 자동 리스폰한다.
        player.deathStartedAt = now
        player.deathUntil = now + NPC_DEATH_ANIMATION_DURATION_MS
        player.npcRespawnAt = now + NPC_RESPAWN_DELAY_MS
        player.npcHealth = 0
        player.npcState = "dead"
        player.npcTargetId = ""
        player.npcChargeDistanceRemaining = 0
        player.npcChargeDistanceTotal = 0
        player.npcChargeRedirected = false
        player.npcCounterWindowTargetId = ""
        player.npcCounterWindowPhase = 0
        player.npcCounterWindowUntil = 0
        player.npcCounterWindowConsumed = false
        player.npcChargeWindupStartedAt = 0
        player.npcChargeWindupUntil = 0
        player.npcRestUntil = 0
        player.npcQueuedExtraCharges = 0
        player.boostState = "idle"
        player.currentSpeed = 0
        player.boostDirectionX = 0
        player.boostDirectionY = 0
        player.input.boost = false
        player.collisionVisualType = "defeat"
        player.npcDefeatDamageRatio = 1
        player.collisionVisualUntil = player.deathUntil
        player.collisionImpactUntil = 0
        player.npcWinVisualUntil = 0
        player.playerWinVisualUntil = 0
        player.boostDisabledStartedAt = now
        player.boostDisabledUntil = player.npcRespawnAt
        player.lastMoveX = 0
        player.lastMoveY = 0
        if (isPersistentHumanPlayer(defeatedByPlayer)) {
            defeatedByPlayer.playerWinVisualUntil = now + 3000
            postStatsUpdate(defeatedByPlayer.id, { ner_kills: 1 })
        }
    }

    respawnPlayer(player, now) {
        if (!player) {
            return false
        }
        this.syncDoubleSkinState(player, now)

        // 인간 유저는 공용 목숨이 남아 있을 때만 리스폰 가능하다.
        player.livesRemaining = this.sharedLivesRemaining
        if (!player.isNpc && !player.isDummy && Number(this.sharedLivesRemaining || 0) <= 0) {
            player.respawnRequested = false
            player.input.respawn = false
            this.updateStoredPlayerProgress(player)
            return false
        }

        // 더미는 중앙, 그 외 플레이어는 맵 가장자리에서 리스폰한다.
        const spawnPosition = player.isDummy
            ? this.getRandomQuadrantSpawnPosition(player.dummyQuadrant || 1)
            : this.getRandomEdgeSpawnPosition()
        player.x = spawnPosition.x
        player.y = spawnPosition.y
        player.currentSpeed = getBaseSpeedForPlayer(player)
        player.boostState = "idle"
        player.boostDirectionX = 0
        player.boostDirectionY = 0
        player.input = {
            up: false,
            down: false,
            left: false,
            right: false,
            boost: false,
            respawn: false
        }
        player.lastMoveX = 0
        player.lastMoveY = 0
        player.lastActiveInputAt = now
        player.collisionVisualUntil = 0
        player.collisionImpactUntil = 0
        player.collisionVisualType = "win"
        player.npcDefeatDamageRatio = 0
        player.npcWinVisualUntil = 0
        player.playerWinVisualUntil = 0
        player.collisionImpactX = 0
        player.collisionImpactY = 0
        player.collisionRecoveryStartedAt = 0
        player.collisionRecoveryUntil = 0
        player.boostDisabledStartedAt = now
        player.boostDisabledUntil = now
        player.deathStartedAt = 0
        player.deathUntil = 0
        player.respawnRequested = false
        if (player.isDoubleSkin) {
            player.doubleMerged = true
            player.doubleSeparationPhase = "merged"
            player.doubleMergeLockUntil = 0
            player.doubleUnits = [createDoubleUnitState(now), createDoubleUnitState(now)]
        }
        if (player.isNpc) {
            player.npcMaxHealth = this.getScaledNpcMaxHealth()
            player.npcHealth = player.npcMaxHealth
            player.npcRespawnAt = 0
            player.npcState = "idle"
            player.npcTargetId = ""
            player.npcChargeDistanceRemaining = 0
            player.npcChargeDistanceTotal = 0
            player.npcChargeRedirected = false
            player.npcChargeTargetId = ""
            player.npcChargeHitTarget = false
            player.npcChargeIsPhaseAttack = false
            player.npcChargeWindupStartedAt = 0
            player.npcChargeWindupUntil = 0
            player.npcRestUntil = 0
            player.npcQueuedExtraCharges = 0
        } else if (player.isDummy) {
            player.dummyRetaliationTargetId = ""
            player.dummyState = "idle"
            player.dummyPhase = 1
            player.dummyChargeDistanceRemaining = 0
            player.dummyChargeDistanceTotal = 0
            player.dummyChargeWindupStartedAt = 0
            player.dummyChargeWindupUntil = 0
            player.dummyRestUntil = 0
            player.dummyQueuedExtraCharges = 0
        }
        this.ensureDoubleUnitLayout(player, now)
        this.grid.move(player)
        this.updateStoredPlayerProgress(player)
        return true
    }

    getNpcTarget(player) {
        if (!player || !player.isNpc) {
            return null
        }

        // 현재 타겟이 아직 유효하면 유지하고,
        // 아니면 살아 있는 인간 유저 중 하나를 다시 뽑는다.
        if (player.npcTargetId) {
            const existingTarget = this.players.get(player.npcTargetId)
            if (existingTarget && !existingTarget.isNpc && !existingTarget.isDummy && !this.isPlayerDead(existingTarget)) {
                return existingTarget
            }
        }

        const candidates = Array.from(this.players.values()).filter((candidate) => (
            !candidate.isNpc && !candidate.isDummy && !this.isPlayerDead(candidate)
        ))

        if (!candidates.length) {
            player.npcTargetId = ""
            return null
        }

        const nextTarget = candidates.reduce((closestCandidate, candidate) => {
            if (!closestCandidate) {
                return candidate
            }
            const closestDistance = Math.hypot(closestCandidate.x - player.x, closestCandidate.y - player.y)
            const candidateDistance = Math.hypot(candidate.x - player.x, candidate.y - player.y)
            return candidateDistance < closestDistance ? candidate : closestCandidate
        }, null)
        player.npcTargetId = nextTarget.id
        return nextTarget
    }

    startNpcChargeSkill(player, diffX, diffY, distance, options = {}) {
        if (!player || !player.isNpc) {
            return { dx: 0, dy: 0 }
        }

        // 네르 돌진 스킬은 시작 순간 방향과 총 이동 거리를 고정해 둔다.
        const npcPhase = player.npcPhase || getNpcPhase(player)
        const queueExtraCharge = options.queueExtraCharge !== false
        const instantCharge = options.instant === true
        const distanceMultiplier = Number(options.distanceMultiplier || NPC_CHARGE_DISTANCE_MULTIPLIER)
        const targetId = String(options.targetId || player.npcTargetId || "").trim()
        const isPhaseAttack = Boolean(options.isPhaseAttack)
        const magnitude = distance > 0.001 ? distance : 1
        player.npcChargeDirectionX = diffX / magnitude
        player.npcChargeDirectionY = diffY / magnitude
        player.npcChargeDistanceTotal = distance * distanceMultiplier
        player.npcChargeDistanceRemaining = player.npcChargeDistanceTotal
        player.npcChargeRedirected = false
        player.npcChargeTargetId = targetId
        player.npcChargeHitTarget = false
        player.npcChargeIsPhaseAttack = isPhaseAttack
        player.currentSpeed = NPC_BASE_SPEED_PER_SECOND
        player.npcChargeWindupStartedAt = 0
        player.npcChargeWindupUntil = 0
        if (instantCharge) {
            player.npcState = "charging"
            player.boostState = "charging"
        } else {
            player.npcState = "windup"
            player.boostState = "idle"
            player.npcChargeWindupStartedAt = Date.now()
            player.npcChargeWindupUntil = player.npcChargeWindupStartedAt + NPC_CHARGE_WINDUP_DURATION_MS
        }
        player.npcQueuedExtraCharges = queueExtraCharge && npcPhase >= 2 ? 1 : 0

        return { dx: 0, dy: 0 }
    }

    updateNpc(player, now) {
        if (!player || !player.isNpc) {
            return { dx: 0, dy: 0 }
        }

        player.npcPhase = getNpcPhase(player)
        const npcPhase = player.npcPhase

        // 네르는 충돌 회복 중이면 rest 로 강제 전환한다.
        if (player.collisionRecoveryUntil > now) {
            player.npcState = "rest"
            player.npcRestUntil = Math.max(player.npcRestUntil || 0, player.collisionRecoveryUntil)
            player.npcChargeWindupStartedAt = 0
            player.npcChargeWindupUntil = 0
            return { dx: 0, dy: 0 }
        }

        if (player.npcState === "rest") {
            player.boostState = "idle"
            player.currentSpeed = NPC_BASE_SPEED_PER_SECOND
            player.npcChargeWindupStartedAt = 0
            player.npcChargeWindupUntil = 0
            if (player.npcRestUntil > now) {
                return { dx: 0, dy: 0 }
            }
            if (player.npcQueuedExtraCharges > 0) {
                const retainedTarget = this.getNpcTarget(player)
                if (retainedTarget) {
                    const retainedDiffX = retainedTarget.x - player.x
                    const retainedDiffY = retainedTarget.y - player.y
                    const retainedDistance = Math.hypot(retainedDiffX, retainedDiffY)
                    const instantExtraCharge = npcPhase >= 3
                    player.npcQueuedExtraCharges = Math.max(0, player.npcQueuedExtraCharges - 1)
                    return this.startNpcChargeSkill(
                        player,
                        retainedDiffX,
                        retainedDiffY,
                        retainedDistance,
                        {
                            queueExtraCharge: false,
                            instant: instantExtraCharge,
                            distanceMultiplier: NPC_EXTRA_CHARGE_DISTANCE_MULTIPLIER,
                            targetId: retainedTarget.id,
                            isPhaseAttack: true,
                        }
                    )
                }
                player.npcQueuedExtraCharges = 0
            }
            player.npcState = "chase"
            player.npcTargetId = ""
        }

        const target = this.getNpcTarget(player)
        if (!target) {
            player.npcState = "idle"
            player.boostState = "idle"
            player.currentSpeed = NPC_BASE_SPEED_PER_SECOND
            player.npcChargeWindupStartedAt = 0
            player.npcChargeWindupUntil = 0
            return { dx: 0, dy: 0 }
        }

        const diffX = target.x - player.x
        const diffY = target.y - player.y
        const distance = Math.hypot(diffX, diffY)

        if (player.npcState === "windup") {
            // 예고 정지 중에는 멈춰 있지만 타겟을 바라보는 회전은 계속 갱신한다.
            if (player.npcChargeWindupUntil > now) {
                if (distance > 0.001) {
                    player.npcChargeDirectionX = diffX / distance
                    player.npcChargeDirectionY = diffY / distance
                    player.facingAngle = Math.atan2(player.npcChargeDirectionY, player.npcChargeDirectionX)
                }
                return { dx: 0, dy: 0 }
            }
            player.npcState = "charging"
            player.boostState = "charging"
            player.npcChargeWindupStartedAt = 0
            player.npcChargeWindupUntil = 0
            return {
                dx: player.npcChargeDirectionX || 0,
                dy: player.npcChargeDirectionY || 0
            }
        }

        if (player.npcState === "charging") {
            // charging 동안에는 고정된 방향으로만 직진한다.
            return {
                dx: player.npcChargeDirectionX || 0,
                dy: player.npcChargeDirectionY || 0
            }
        }

        // 충분히 가까워지면 돌진 스킬 시작.
        const triggerDistance = npcPhase >= 3
            ? NPC_CHARGE_TRIGGER_DISTANCE * NPC_PHASE_THREE_TRIGGER_DISTANCE_MULTIPLIER
            : NPC_CHARGE_TRIGGER_DISTANCE
        if (distance <= triggerDistance) {
            return this.startNpcChargeSkill(player, diffX, diffY, distance, {
                targetId: target.id,
                isPhaseAttack: true,
            })
        }

        player.npcState = "chase"
        if (distance < 0.001) {
            return { dx: 0, dy: 0 }
        }

        return {
            dx: diffX / distance,
            dy: diffY / distance
        }
    }

    applyCollisionSlow(player, now, recoveryUntil) {
        if (!player || player.isNpc || this.isPlayerDead(player)) {
            return
        }

        // 인간 유저는 충돌 직후 잠시 느려지지만, 돌진 잠금은 시각 효과 종료까지 유지한다.
        const collisionRecoveryMs = player.collisionVisualType === "defeat"
            ? Math.round(COLLISION_RECOVERY_DURATION_MS * 1.2)
            : COLLISION_RECOVERY_DURATION_MS
        const resolvedRecoveryUntil = now + collisionRecoveryMs
        const resolvedBoostDisabledUntil = Math.max(now + COLLISION_BOOST_LOCK_DURATION_MS, Number(recoveryUntil || 0))
        player.boostState = "idle"
        player.input.boost = false
        player.currentSpeed = player.collisionSlowSpeed
        player.collisionRecoveryStartedAt = now
        player.collisionRecoveryUntil = resolvedRecoveryUntil
        player.boostDisabledStartedAt = now
        player.boostDisabledUntil = resolvedBoostDisabledUntil
        player.npcChargeWindupStartedAt = 0
        player.npcChargeWindupUntil = 0
    }

    getUserDamageAgainstNpc(attacker) {
        if (!attacker || attacker.isNpc || attacker.isDummy) {
            return 0
        }

        const baseSpeed = getBaseSpeedForPlayer(attacker)
        const maxBoostedSpeed = getMaxBoostedSpeedForPlayer(attacker)
        const effectiveClampedSpeed = Math.max(baseSpeed, Number(attacker.currentSpeed || 0))
        const maxSpeedRange = Math.max(1, maxBoostedSpeed - baseSpeed)
        const speedRatio = Math.max(
            0,
            Math.min(1, (effectiveClampedSpeed - baseSpeed) / maxSpeedRange)
        )

        return Math.max(
            NPC_DAMAGE_MIN,
            Math.min(
                NPC_DAMAGE_MAX,
                Math.round(NPC_DAMAGE_MIN + (NPC_DAMAGE_MAX - NPC_DAMAGE_MIN) * speedRatio)
            )
        )
    }

    applyNpcCollisionDamage(targetNpc, attacker, now) {
        if (!targetNpc || !targetNpc.isNpc || this.isPlayerDead(targetNpc)) {
            return
        }

        const damage = this.getUserDamageAgainstNpc(attacker)
        if (damage <= 0) {
            return
        }

        // 유저는 일반 충돌도 최소 공격력이 들어가고,
        // 돌진 속도가 높아질수록 최대 공격력까지 선형으로 오른다.
        targetNpc.npcHealth = Math.max(0, (targetNpc.npcHealth || NPC_MAX_HEALTH) - damage)
        targetNpc.npcDefeatDamageRatio = Math.max(0, Math.min(1, damage / Math.max(1, NPC_DAMAGE_MAX)))
        const counterTargetId = String(targetNpc.npcCounterWindowTargetId || "").trim()
        const isCounterAttack = (
            counterTargetId &&
            counterTargetId === String(attacker.id || "").trim() &&
            targetNpc.npcState === "rest" &&
            now <= Number(targetNpc.npcCounterWindowUntil || 0) &&
            !targetNpc.npcCounterWindowConsumed
        )
        if (isCounterAttack) {
            const npcPhase = Math.max(1, Math.min(3, Number(targetNpc.npcCounterWindowPhase || targetNpc.npcPhase || 1)))
            const retaliationKey = `ner_phase${npcPhase}_attack_dodges`
            postStatsUpdate(attacker.id, { [retaliationKey]: 1 })
            targetNpc.npcCounterWindowConsumed = true
        }
        // 패배 상태가 되면 기존 타겟/연속 돌진 예약을 버리고 새 타겟을 다시 잡게 한다.
        targetNpc.npcTargetId = ""
        targetNpc.npcQueuedExtraCharges = 0

        if (targetNpc.npcHealth <= 0) {
            this.triggerNpcDeath(targetNpc, now, attacker)
        }
    }

    recordNpcPhaseAttackDodge(player) {
        if (!player || !player.isNpc || !player.npcChargeIsPhaseAttack) {
            return
        }
        const targetId = String(player.npcChargeTargetId || "").trim()
        const target = targetId ? this.players.get(targetId) : null
        if (isPersistentHumanPlayer(target) && !this.isPlayerDead(target) && !player.npcChargeHitTarget) {
            player.npcCounterWindowTargetId = target.id
            player.npcCounterWindowPhase = Math.max(1, Math.min(3, Number(player.npcPhase || 1)))
            player.npcCounterWindowUntil = Math.max(
                Number(player.npcRestUntil || 0),
                Date.now() + NPC_REST_DURATION_MS
            )
            player.npcCounterWindowConsumed = false
        } else {
            player.npcCounterWindowTargetId = ""
            player.npcCounterWindowPhase = 0
            player.npcCounterWindowUntil = 0
            player.npcCounterWindowConsumed = false
        }
        player.npcChargeTargetId = ""
        player.npcChargeHitTarget = false
        player.npcChargeIsPhaseAttack = false
    }

    getCollisionRadius(player) {
        const { halfWidth, halfHeight } = this.getCollisionHalfExtents(player)
        return Math.max(halfWidth, halfHeight)
    }

    getDummyRetaliationTarget(player) {
        if (!player || !player.isDummy) {
            return null
        }
        const targetId = String(player.dummyRetaliationTargetId || "").trim()
        if (!targetId) {
            return null
        }
        const target = this.players.get(targetId)
        if (!target || target.isNpc || target.isDummy || this.isPlayerDead(target)) {
            player.dummyRetaliationTargetId = ""
            player.dummyChargeDistanceRemaining = 0
            player.dummyChargeDistanceTotal = 0
            return null
        }
        return target
    }

    startDummyRetaliationCharge(player, target) {
        if (!player || !player.isDummy || !target) {
            return
        }
        const diffX = target.x - player.x
        const diffY = target.y - player.y
        const distance = Math.max(1, Math.hypot(diffX, diffY))
        const dummyPhase = player.dummyPhase || getDummyPhase(player)
        player.boostDirectionX = diffX / distance
        player.boostDirectionY = diffY / distance
        player.currentSpeed = DUMMY_BASE_SPEED_PER_SECOND
        player.dummyChargeDistanceTotal = distance * DUMMY_RETALIATION_DISTANCE_MULTIPLIER
        player.dummyChargeDistanceRemaining = player.dummyChargeDistanceTotal
        player.facingAngle = Math.atan2(player.boostDirectionY, player.boostDirectionX)
        player.dummyQueuedExtraCharges = dummyPhase >= 2 ? 1 : 0
        player.dummyChargeWindupStartedAt = 0
        player.dummyChargeWindupUntil = 0
        if (dummyPhase >= 3) {
            player.dummyState = "charging"
            player.boostState = "charging"
        } else {
            player.dummyState = "windup"
            player.boostState = "idle"
            player.dummyChargeWindupStartedAt = Date.now()
            player.dummyChargeWindupUntil = player.dummyChargeWindupStartedAt + NPC_CHARGE_WINDUP_DURATION_MS
        }
    }

    updateDummy(player) {
        if (!player || !player.isDummy) {
            return { dx: 0, dy: 0 }
        }

        player.dummyPhase = getDummyPhase(player)

        const target = this.getDummyRetaliationTarget(player)
        if (!target) {
            player.dummyState = "idle"
            player.boostState = "idle"
            player.currentSpeed = DUMMY_BASE_SPEED_PER_SECOND
            player.boostDirectionX = 0
            player.boostDirectionY = 0
            return { dx: 0, dy: 0 }
        }

        const diffX = target.x - player.x
        const diffY = target.y - player.y
        const distance = Math.hypot(diffX, diffY)

        if (player.dummyState === "rest") {
            player.boostState = "idle"
            player.currentSpeed = DUMMY_BASE_SPEED_PER_SECOND
            if (player.dummyRestUntil > Date.now()) {
                return { dx: 0, dy: 0 }
            }
            if (player.dummyQueuedExtraCharges > 0) {
                player.dummyQueuedExtraCharges = Math.max(0, player.dummyQueuedExtraCharges - 1)
                player.boostDirectionX = diffX / Math.max(1, distance)
                player.boostDirectionY = diffY / Math.max(1, distance)
                player.dummyChargeDistanceTotal = distance * NPC_EXTRA_CHARGE_DISTANCE_MULTIPLIER
                player.dummyChargeDistanceRemaining = player.dummyChargeDistanceTotal
                player.facingAngle = Math.atan2(player.boostDirectionY, player.boostDirectionX)
                if (player.dummyPhase >= 3) {
                    player.dummyState = "charging"
                    player.boostState = "charging"
                } else {
                    player.dummyState = "windup"
                    player.boostState = "idle"
                    player.dummyChargeWindupStartedAt = Date.now()
                    player.dummyChargeWindupUntil = player.dummyChargeWindupStartedAt + NPC_CHARGE_WINDUP_DURATION_MS
                }
                return { dx: 0, dy: 0 }
            }
            player.dummyState = "chase"
        }

        if (player.dummyState === "windup") {
            if (player.dummyChargeWindupUntil > Date.now()) {
                if (distance > 0.001) {
                    player.boostDirectionX = diffX / distance
                    player.boostDirectionY = diffY / distance
                    player.facingAngle = Math.atan2(player.boostDirectionY, player.boostDirectionX)
                }
                return { dx: 0, dy: 0 }
            }
            player.dummyState = "charging"
            player.boostState = "charging"
            player.dummyChargeWindupStartedAt = 0
            player.dummyChargeWindupUntil = 0
            return {
                dx: player.boostDirectionX || 0,
                dy: player.boostDirectionY || 0,
            }
        }

        if (player.dummyState === "charging") {
            return {
                dx: player.boostDirectionX || 0,
                dy: player.boostDirectionY || 0,
            }
        }

        const triggerDistance = player.dummyPhase >= 3
            ? NPC_CHARGE_TRIGGER_DISTANCE * NPC_PHASE_THREE_TRIGGER_DISTANCE_MULTIPLIER
            : NPC_CHARGE_TRIGGER_DISTANCE
        if (distance <= triggerDistance) {
            this.startDummyRetaliationCharge(player, target)
            return { dx: 0, dy: 0 }
        }

        if (distance < 0.001) {
            return { dx: 0, dy: 0 }
        }

        player.dummyState = "chase"
        return {
            dx: diffX / distance,
            dy: diffY / distance,
        }
    }

    getCollisionSeparationProfile(playerA, playerB) {
        if (playerA.isNpc && !playerB.isNpc) {
            return { pushA: 1 / 3, pushB: 2 / 3, totalScale: 1.8 }
        }
        if (!playerA.isNpc && playerB.isNpc) {
            return { pushA: 2 / 3, pushB: 1 / 3, totalScale: 1.8 }
        }
        if (playerA.isDoubleSkin || playerB.isDoubleSkin) {
            return { pushA: 1 / 2, pushB: 1 / 2, totalScale: 2.25 }
        }
        return { pushA: 1 / 2, pushB: 1 / 2, totalScale: 1.5 }
    }

    applyDoubleSkinDefeat(player, now, normalX, normalY, defeatedByPlayer = null, splitBounceMagnitude = null) {
        if (!player || !player.isDoubleSkin) {
            return false
        }

        const aliveIndices = getDoubleAliveUnitIndices(player)
        if (!aliveIndices.length) {
            return false
        }
        if (Number(player.doubleSplitProtectedUntil || 0) > now) {
            if (defeatedByPlayer && String(player.doubleSplitProtectedById || "") === String(defeatedByPlayer.id || "")) {
                return true
            }
        }
        if (Number(player.doubleDefeatProtectedUntil || 0) > now) {
            if (defeatedByPlayer && String(player.doubleDefeatProtectedById || "") === String(defeatedByPlayer.id || "")) {
                return true
            }
        }

        const hitUnitIndex = aliveIndices.length === 1
            ? aliveIndices[0]
            : this.getDoubleHitUnitIndex(player, normalX, normalY)
        const targetUnit = player.doubleUnits[hitUnitIndex] && Number(player.doubleUnits[hitUnitIndex].health || 0) > 0
            ? player.doubleUnits[hitUnitIndex]
            : player.doubleUnits[aliveIndices[0]]
        if (!targetUnit || Number(targetUnit.health || 0) <= 0) {
            return false
        }
        if (Number(targetUnit.splitProtectedUntil || 0) > now) {
            return true
        }

        // 쌍핔이도 기본 스핔이와 같은 충돌 후 정지/감속 흐름을 탄다.
        aliveIndices.forEach((unitIndex) => {
            const unit = player.doubleUnits[unitIndex]
            if (!unit) {
                return
            }
            unit.boostState = "idle"
            unit.currentSpeed = player.currentSpeed
            unit.collisionRecoveryStartedAt = player.collisionRecoveryStartedAt
            unit.collisionRecoveryUntil = player.collisionRecoveryUntil
            unit.boostDisabledStartedAt = player.boostDisabledStartedAt
            unit.boostDisabledUntil = player.boostDisabledUntil
        })

        const shouldSplitOnly = aliveIndices.length > 1 &&
            player.doubleMerged &&
            Math.random() < DOUBLE_SPLIT_PROBABILITY
        if (shouldSplitOnly) {
            targetUnit.health = Math.max(0, Number(targetUnit.health || 0) - 1)
            targetUnit.collisionVisualType = "defeat"
            targetUnit.collisionVisualUntil = player.collisionVisualUntil
            targetUnit.collisionImpactUntil = player.collisionImpactUntil
            targetUnit.collisionImpactX = player.collisionImpactX
            targetUnit.collisionImpactY = player.collisionImpactY
            player.doubleMerged = false
            player.doubleSeparationPhase = "split"
            player.doubleMergeLockUntil = now + DOUBLE_REMERGE_LOCK_MS
            player.doubleSeparatedAt = now
            player.doubleSplitProtectedUntil = now + DOUBLE_SPLIT_PROTECTION_MS
            player.doubleSplitProtectedById = defeatedByPlayer ? String(defeatedByPlayer.id || "") : ""
            player.doubleDefeatProtectedUntil = Math.max(
                now + COLLISION_IMPACT_DURATION_MS,
                Number(player.collisionRecoveryUntil || 0)
            )
            player.doubleDefeatProtectedById = defeatedByPlayer ? String(defeatedByPlayer.id || "") : ""
            const angle = typeof player.facingAngle === "number" ? player.facingAngle : 0
            const sideX = -Math.sin(angle)
            const sideY = Math.cos(angle)
            const unitA = player.doubleUnits[aliveIndices[0]]
            const unitB = player.doubleUnits[aliveIndices[1]]
            unitA.x = this.clampToWorld(player.x - sideX * DOUBLE_MERGED_SIDE_OFFSET * 1.3)
            unitA.y = this.clampToWorld(player.y - sideY * DOUBLE_MERGED_SIDE_OFFSET * 1.3)
            unitB.x = this.clampToWorld(player.x + sideX * DOUBLE_MERGED_SIDE_OFFSET * 1.3)
            unitB.y = this.clampToWorld(player.y + sideY * DOUBLE_MERGED_SIDE_OFFSET * 1.3)
            const appliedSplitBounceMagnitude = Math.max(
                0,
                Number(splitBounceMagnitude || 0) * 0.7 * (defeatedByPlayer && defeatedByPlayer.isNpc ? NPC_DEFEAT_BOUNCE_MULTIPLIER : 1)
            )
            const oppositeNormalX = -normalX
            const oppositeNormalY = -normalY
            const leftBounce = this.rotateVector(oppositeNormalX, oppositeNormalY, -(40 * Math.PI / 180))
            const rightBounce = this.rotateVector(oppositeNormalX, oppositeNormalY, (40 * Math.PI / 180))
            const unitABounceX = leftBounce.dx
            const unitABounceY = leftBounce.dy
            const unitBBounceX = rightBounce.dx
            const unitBBounceY = rightBounce.dy
            const unitABounceDistance = Math.hypot(unitABounceX, unitABounceY) || 1
            const unitBBounceDistance = Math.hypot(unitBBounceX, unitBBounceY) || 1
            unitA.lastMoveX = (unitABounceX / unitABounceDistance) * appliedSplitBounceMagnitude
            unitA.lastMoveY = (unitABounceY / unitABounceDistance) * appliedSplitBounceMagnitude
            unitB.lastMoveX = (unitBBounceX / unitBBounceDistance) * appliedSplitBounceMagnitude
            unitB.lastMoveY = (unitBBounceY / unitBBounceDistance) * appliedSplitBounceMagnitude
            unitA.x = this.clampToWorld(unitA.x + unitA.lastMoveX * 0.35)
            unitA.y = this.clampToWorld(unitA.y + unitA.lastMoveY * 0.35)
            unitB.x = this.clampToWorld(unitB.x + unitB.lastMoveX * 0.35)
            unitB.y = this.clampToWorld(unitB.y + unitB.lastMoveY * 0.35)
            this.recenterDoublePlayer(player)
            unitA.splitProtectedUntil = now + DOUBLE_SPLIT_PROTECTION_MS
            unitB.splitProtectedUntil = now + DOUBLE_SPLIT_PROTECTION_MS
            return true
        }

        targetUnit.health = Math.max(0, Number(targetUnit.health || 0) - 1)
        targetUnit.collisionVisualType = "defeat"
        targetUnit.collisionVisualUntil = player.collisionVisualUntil
        targetUnit.collisionImpactUntil = player.collisionImpactUntil
        targetUnit.collisionImpactX = normalX
        targetUnit.collisionImpactY = normalY
        targetUnit.collisionRecoveryStartedAt = now
        targetUnit.collisionRecoveryUntil = player.collisionRecoveryUntil
        targetUnit.boostState = "idle"
        targetUnit.currentSpeed = player.currentSpeed
        targetUnit.boostDisabledStartedAt = player.boostDisabledStartedAt
        targetUnit.boostDisabledUntil = player.boostDisabledUntil
        player.doubleDefeatProtectedUntil = Math.max(
            now + COLLISION_IMPACT_DURATION_MS,
            Number(player.collisionRecoveryUntil || 0)
        )
        player.doubleDefeatProtectedById = defeatedByPlayer ? String(defeatedByPlayer.id || "") : ""

        if (targetUnit.health <= 0) {
            targetUnit.inactiveUntil = now + DOUBLE_INACTIVE_FADE_MS
        }

        const stillAlive = getDoubleAliveUnitIndices(player)
        if (!stillAlive.length) {
            this.triggerPlayerDeath(player, now, defeatedByPlayer)
            return true
        }
        if (stillAlive.length === 1) {
            player.doubleMerged = false
            player.doubleSeparationPhase = "single"
            player.doubleMergeLockUntil = 0
            player.doubleSeparatedAt = now
        }
        if (Number(player.doubleSplitProtectedUntil || 0) <= now) {
            player.doubleSplitProtectedById = ""
        }
        if (Number(player.doubleDefeatProtectedUntil || 0) <= now) {
            player.doubleDefeatProtectedById = ""
        }
        return true
    }

    resolvePlayerCollisions() {
        const players = Array.from(this.players.values())
        const now = Date.now()

        // 단순 N^2 루프지만 현재 엔티티 수가 작아서 유지 가능한 구조다.
        for (let index = 0; index < players.length; index += 1) {
            const playerA = players[index]
            if (this.isPlayerDead(playerA)) {
                continue
            }

            for (let innerIndex = index + 1; innerIndex < players.length; innerIndex += 1) {
                const playerB = players[innerIndex]
                if (this.isPlayerDead(playerB)) {
                    continue
                }

                const collisionPointA = this.getCollisionReferencePoint(playerA, Number(playerB.x || 0), Number(playerB.y || 0))
                const collisionPointB = this.getCollisionReferencePoint(playerB, Number(playerA.x || 0), Number(playerA.y || 0))
                let diffX = collisionPointB.x - collisionPointA.x
                let diffY = collisionPointB.y - collisionPointA.y
                let distance = Math.hypot(diffX, diffY)

                if (distance < 0.0001) {
                    diffX = playerB.lastMoveX - playerA.lastMoveX
                    diffY = playerB.lastMoveY - playerA.lastMoveY
                    distance = Math.hypot(diffX, diffY)
                }

                if (distance < 0.0001) {
                    diffX = index % 2 === 0 ? 1 : -1
                    diffY = innerIndex % 2 === 0 ? 1 : -1
                    distance = Math.hypot(diffX, diffY)
                }

                const normalX = diffX / distance
                const normalY = diffY / distance
                // 양쪽 충돌체의 방향별 반지름을 더해 실제 충돌 임계 거리를 만든다.
                const collisionDistance =
                    this.getCollisionDirectionRadius(playerA, normalX, normalY) +
                    this.getCollisionDirectionRadius(playerB, -normalX, -normalY)

                if (distance >= collisionDistance) {
                    continue
                }

                const overlap = collisionDistance - distance
                const relativeMoveX = playerB.lastMoveX - playerA.lastMoveX
                const relativeMoveY = playerB.lastMoveY - playerA.lastMoveY
                const relativeImpactSpeed = Math.max(
                    0,
                    -(relativeMoveX * normalX + relativeMoveY * normalY)
                )
                const bounceDistance = Math.min(
                    COLLISION_MAX_BOUNCE_DISTANCE,
                    COLLISION_BOUNCE_DISTANCE + relativeImpactSpeed * COLLISION_SPEED_BOUNCE_MULTIPLIER
                )
                const separation = overlap / 2 + bounceDistance
                const separationProfile = this.getCollisionSeparationProfile(playerA, playerB)
                const scaledSeparation = separation * separationProfile.totalScale
                const collisionVisualDuration = Math.min(
                    COLLISION_VISUAL_MAX_DURATION_MS,
                    COLLISION_VISUAL_BASE_DURATION_MS +
                        relativeImpactSpeed * COLLISION_VISUAL_SPEED_DURATION_MULTIPLIER_MS
                )
                const collisionVisualUntil = now + collisionVisualDuration
                const collisionImpactUntil = now + COLLISION_IMPACT_DURATION_MS
                const playerAAttackDot = playerA.lastMoveX * normalX + playerA.lastMoveY * normalY
                const playerBAttackDot = -(playerB.lastMoveX * normalX + playerB.lastMoveY * normalY)
                // "가속한 채 진행 방향으로 박았는지"를 공격 판정으로 사용한다.
        const playerAAttacking = (
                    playerA.isNpc
                        ? playerA.npcState === "charging"
                        : playerA.currentSpeed > getBaseSpeedForPlayer(playerA)
                ) && playerAAttackDot > COLLISION_ATTACK_DIRECTION_THRESHOLD
                const playerBAttacking = (
                    playerB.isNpc
                        ? playerB.npcState === "charging"
                        : playerB.currentSpeed > getBaseSpeedForPlayer(playerB)
                ) && playerBAttackDot > COLLISION_ATTACK_DIRECTION_THRESHOLD

                playerA.collisionVisualUntil = collisionVisualUntil
                playerB.collisionVisualUntil = collisionVisualUntil
                playerA.collisionImpactUntil = collisionImpactUntil
                playerB.collisionImpactUntil = collisionImpactUntil
                playerA.collisionVisualType = "win"
                playerB.collisionVisualType = "win"
                playerA.npcDefeatDamageRatio = 0
                playerB.npcDefeatDamageRatio = 0
                playerA.collisionImpactX = -normalX
                playerA.collisionImpactY = -normalY
                playerB.collisionImpactX = normalX
                playerB.collisionImpactY = normalY

                // 공격/피격 결과에 따라 win/defeat 시각 상태와 통계를 기록한다.
                if (playerAAttacking && playerBAttacking) {
                    playerA.collisionVisualType = "defeat"
                    playerB.collisionVisualType = "defeat"
                    playerA.collisionImpactX = -normalX
                    playerA.collisionImpactY = -normalY
                    playerB.collisionImpactX = normalX
                    playerB.collisionImpactY = normalY
                    if (!playerA.isDoubleSkin) {
                        playerA.defeatReceivedCount += 1
                    }
                    if (!playerB.isDoubleSkin) {
                        playerB.defeatReceivedCount += 1
                    }
                    playerA.defeatDealtCount += 1
                    playerB.defeatDealtCount += 1
                    if (playerA.isNpc && isPersistentHumanPlayer(playerB)) {
                        postStatsUpdate(playerB.id, { ner_hits: 1 })
                    }
                    if (playerB.isNpc && isPersistentHumanPlayer(playerA)) {
                        postStatsUpdate(playerA.id, { ner_hits: 1 })
                    }
                } else if (playerAAttacking) {
                    playerB.collisionVisualType = "defeat"
                    playerB.collisionImpactX = normalX
                    playerB.collisionImpactY = normalY
                    playerA.defeatDealtCount += 1
                    if (!playerB.isDoubleSkin) {
                        playerB.defeatReceivedCount += 1
                    }
                    if (playerB.isNpc && isPersistentHumanPlayer(playerA)) {
                        postStatsUpdate(playerA.id, { ner_hits: 1 })
                    }
                    if (playerA.isNpc && playerA.npcChargeTargetId === playerB.id) {
                        playerA.npcChargeHitTarget = true
                    }
                    if (playerB.isDummy && !playerA.isNpc && !playerA.isDummy) {
                        playerB.dummyRetaliationTargetId = playerA.id
                    }
                } else if (playerBAttacking) {
                    playerA.collisionVisualType = "defeat"
                    playerA.collisionImpactX = -normalX
                    playerA.collisionImpactY = -normalY
                    playerB.defeatDealtCount += 1
                    if (!playerA.isDoubleSkin) {
                        playerA.defeatReceivedCount += 1
                    }
                    if (playerA.isNpc && isPersistentHumanPlayer(playerB)) {
                        postStatsUpdate(playerB.id, { ner_hits: 1 })
                    }
                    if (playerB.isNpc && playerB.npcChargeTargetId === playerA.id) {
                        playerB.npcChargeHitTarget = true
                    }
                    if (playerA.isDummy && !playerB.isNpc && !playerB.isDummy) {
                        playerA.dummyRetaliationTargetId = playerB.id
                    }
                }

                if (playerA.isNpc && !playerB.isNpc && !playerB.isDummy) {
                    this.applyNpcCollisionDamage(playerA, playerB, now)
                }
                if (playerB.isNpc && !playerA.isNpc && !playerA.isDummy) {
                    this.applyNpcCollisionDamage(playerB, playerA, now)
                }

                // 일반 유저만 충돌 직후 느려지고, 네르는 감속 대상에서 제외된다.
                this.applyCollisionSlow(playerA, now, collisionVisualUntil)
                this.applyCollisionSlow(playerB, now, collisionVisualUntil)

                let doubleAHandled = false
                let doubleBHandled = false
                if (playerA.collisionVisualType === "defeat" && playerA.isDoubleSkin) {
                    doubleAHandled = this.applyDoubleSkinDefeat(playerA, now, normalX, normalY, playerB, scaledSeparation)
                }
                if (playerB.collisionVisualType === "defeat" && playerB.isDoubleSkin) {
                    doubleBHandled = this.applyDoubleSkinDefeat(playerB, now, -normalX, -normalY, playerA, scaledSeparation)
                }

                if (playerA.collisionVisualType === "defeat" &&
                    !playerA.isDoubleSkin &&
                    !playerA.isNpc &&
                    playerA.defeatReceivedCount % getPlayerDeathTriggerCount(playerA) === 0) {
                    if (playerA.isDummy) {
                        this.triggerDummyDeath(playerA, now, playerB)
                    } else {
                        this.triggerPlayerDeath(playerA, now, playerB)
                    }
                }
                if (playerB.collisionVisualType === "defeat" &&
                    !playerB.isDoubleSkin &&
                    !playerB.isNpc &&
                    playerB.defeatReceivedCount % getPlayerDeathTriggerCount(playerB) === 0) {
                    if (playerB.isDummy) {
                        this.triggerDummyDeath(playerB, now, playerA)
                    } else {
                        this.triggerPlayerDeath(playerB, now, playerA)
                    }
                }

                // 네르가 공격자로 패배를 만들었을 때는 피격자 반발을 더 크게 준다.
                let pushScaleA = 1
                let pushScaleB = 1
                let pushRatioA = separationProfile.pushA
                let pushRatioB = separationProfile.pushB
                if (playerB.isNpc && playerBAttacking && playerA.collisionVisualType === "defeat") {
                    pushScaleA = NPC_DEFEAT_BOUNCE_MULTIPLIER
                    pushRatioA = 1
                    pushRatioB = 0
                }
                if (playerA.isNpc && playerAAttacking && playerB.collisionVisualType === "defeat") {
                    pushScaleB = NPC_DEFEAT_BOUNCE_MULTIPLIER
                    pushRatioA = 0
                    pushRatioB = 1
                }
                if (playerA.isNpc && !playerAAttacking && !playerBAttacking) {
                    pushRatioA = 0
                    pushRatioB = 1
                } else if (playerB.isNpc && !playerAAttacking && !playerBAttacking) {
                    pushRatioA = 1
                    pushRatioB = 0
                }

                // 네르-유저 충돌은 유저가 더 멀리 밀려나게 2:1 비율을 적용한다.
                // 네르가 charging 중일 때도 상태를 끊지 않고 현재 돌진을 유지한다.
                this.applyCollisionPush(playerA, -normalX, -normalY, scaledSeparation * pushRatioA * pushScaleA)
                this.applyCollisionPush(playerB, normalX, normalY, scaledSeparation * pushRatioB * pushScaleB)
            }
        }
    }

    update() {
        const now = Date.now()
        this.maybeResetAfterInputIdle(now)
        if (this.pendingRoundResetAt && now >= this.pendingRoundResetAt && this.areAllHumanPlayersOut()) {
            this.resetRoundLives(now)
        }

        for (const player of this.players.values()) {
            // 사망 상태는 이동/충돌보다 먼저 처리한다.
            if (player.deathUntil !== 0) {
                player.livesRemaining = this.sharedLivesRemaining
                if (!player.isNpc && player.input.respawn && Number(this.sharedLivesRemaining || 0) > 0) {
                    player.respawnRequested = true
                }

                player.boostState = "idle"
                player.currentSpeed = 0
                player.lastMoveX = 0
                player.lastMoveY = 0

                if (player.deathUntil > now) {
                    continue
                }

                if (player.isNpc) {
                    if (player.npcRespawnAt > now) {
                        continue
                    }
                    this.respawnPlayer(player, now)
                    continue
                }

                if (player.isDummy) {
                    if (player.npcRespawnAt > now) {
                        continue
                    }
                    this.respawnPlayer(player, now)
                    continue
                }

                if (player.respawnRequested && Number(this.sharedLivesRemaining || 0) > 0) {
                    this.respawnPlayer(player, now)
                }
                continue
            }

            let dx = 0
            let dy = 0

            if (player.isNpc) {
                // 네르는 자체 AI 상태머신이 방향 벡터를 결정한다.
                const npcVector = this.updateNpc(player, now)
                dx = npcVector.dx
                dy = npcVector.dy
            } else if (player.isDummy) {
                const dummyVector = this.updateDummy(player)
                dx = dummyVector.dx
                dy = dummyVector.dy
            } else {
                if (player.input.left) dx -= 1
                if (player.input.right) dx += 1
                if (player.input.up) dy -= 1
                if (player.input.down) dy += 1
            }

            const isMoving = dx !== 0 || dy !== 0

            if (dx !== 0 && dy !== 0) {
                dx *= Math.SQRT1_2
                dy *= Math.SQRT1_2
            }

            if (player.isDoubleSkin && !player.isNpc && !player.isDummy) {
                const doubleVector = this.updateDoubleUnits(player, now, dx, dy)
                player.lastMoveX = Number(doubleVector.dx || 0)
                player.lastMoveY = Number(doubleVector.dy || 0)
                if (player.lastMoveX !== 0 || player.lastMoveY !== 0) {
                    player.facingAngle = Math.atan2(player.lastMoveY, player.lastMoveX)
                }
                continue
            }

            if (player.collisionRecoveryUntil > now) {
                // 충돌 회복 시간 동안은 지정된 느린 속도에서 기본속도로 선형 복귀한다.
                const recoveryDuration = player.collisionRecoveryUntil - player.collisionRecoveryStartedAt
                const recoveryProgress = recoveryDuration > 0
                    ? (now - player.collisionRecoveryStartedAt) / recoveryDuration
                    : 1
                const clampedRecoveryProgress = Math.max(0, Math.min(1, recoveryProgress))
                const easedRecoveryProgress = 1 - Math.pow(1 - clampedRecoveryProgress, 2)

                player.boostState = "idle"
                const baseSpeed = getBaseSpeedForPlayer(player)
                player.currentSpeed = player.collisionSlowSpeed +
                    (baseSpeed - player.collisionSlowSpeed) * easedRecoveryProgress
            } else {
                if (player.collisionRecoveryUntil !== 0) {
                    player.collisionRecoveryStartedAt = 0
                    player.collisionRecoveryUntil = 0
                    player.currentSpeed = getBaseSpeedForPlayer(player)
                }

                const boostLocked = player.boostDisabledUntil > now

                if (boostLocked) {
                    player.boostState = "idle"
                    player.input.boost = false
                    player.boostDirectionX = 0
                    player.boostDirectionY = 0
                }

                if (player.isDummy && player.dummyState === "charging" && player.boostState === "idle") {
                    player.boostState = "charging"
                } else if (player.isNpc && player.npcState === "charging" && player.boostState === "idle") {
                    player.boostState = "charging"
                } else if (player.input.boost && !boostLocked && player.boostState === "idle" && isMoving) {
                    // 유저 돌진은 시작 방향 저장 후 charging 으로 진입한다.
                    player.boostState = "charging"
                    player.boostDirectionX = dx
                    player.boostDirectionY = dy
                }

                if (player.boostState === "charging") {
                    // charging / cooldown 동안 유저는 시작 방향 고정 직진이다.
                    if (player.isDummy && player.dummyState === "charging") {
                        dx = player.boostDirectionX
                        dy = player.boostDirectionY
                    } else if (!player.isNpc) {
                        dx = player.boostDirectionX
                        dy = player.boostDirectionY
                    }
                    const maxBoostedSpeed = player.isNpc ? NPC_MAX_BOOSTED_SPEED_PER_SECOND : getMaxBoostedSpeedForPlayer(player)
                    const boostAcceleration = player.isNpc ? NPC_BOOST_ACCELERATION_PER_SECOND : BOOST_ACCELERATION_PER_SECOND
                    player.currentSpeed = Math.min(
                        maxBoostedSpeed,
                        player.currentSpeed + boostAcceleration * TICK_DELTA_SECONDS
                    )
                    if (player.currentSpeed >= maxBoostedSpeed) {
                        player.boostState = "cooldown"
                    }
                } else if (player.boostState === "cooldown") {
                    if (player.isDummy && player.dummyState === "charging") {
                        dx = player.boostDirectionX
                        dy = player.boostDirectionY
                    } else if (!player.isNpc) {
                        dx = player.boostDirectionX
                        dy = player.boostDirectionY
                    }
                    const boostCooldown = player.isNpc ? NPC_BOOST_COOLDOWN_PER_SECOND : BOOST_COOLDOWN_PER_SECOND
                    const baseSpeed = getBaseSpeedForPlayer(player)
                    player.currentSpeed = Math.max(
                        baseSpeed,
                        player.currentSpeed - boostCooldown * TICK_DELTA_SECONDS
                    )
                    if (player.currentSpeed <= baseSpeed) {
                        player.currentSpeed = baseSpeed
                        if (player.isNpc) {
                            player.npcState = "rest"
                            player.npcRestUntil = now + NPC_REST_DURATION_MS
                            if (player.npcQueuedExtraCharges <= 0) {
                                player.npcTargetId = ""
                            }
                            player.boostState = "idle"
                            player.boostDirectionX = 0
                            player.boostDirectionY = 0
                        } else if (player.isDummy) {
                            player.boostState = "idle"
                            player.currentSpeed = getBaseSpeedForPlayer(player)
                            player.dummyChargeDistanceRemaining = 0
                            player.dummyChargeDistanceTotal = 0
                            player.dummyState = "rest"
                            player.dummyRestUntil = now + NPC_REST_DURATION_MS
                        } else if (!player.input.boost) {
                            player.boostState = "idle"
                            player.boostDirectionX = 0
                            player.boostDirectionY = 0
                            if (player.boostDisabledUntil <= now) {
                                player.boostDisabledStartedAt = now
                                player.boostDisabledUntil = now + USER_POST_BOOST_COOLDOWN_MS
                            }
                        }
                    }
                } else if (!isMoving) {
                    // 멈춘 상태에서는 남아 있던 속도를 자연스럽게 기본속도로 낮춘다.
                    const baseSpeed = getBaseSpeedForPlayer(player)
                    player.currentSpeed = Math.max(
                        baseSpeed,
                        player.currentSpeed - BOOST_COOLDOWN_PER_SECOND * TICK_DELTA_SECONDS
                    )
                } else {
                    player.currentSpeed = getBaseSpeedForPlayer(player)
                    player.boostDirectionX = 0
                    player.boostDirectionY = 0
                }
            }

            if (dx !== 0 || dy !== 0) {
                // 돌진 잠금으로 보정된 최종 이동 방향 기준으로만 회전 각도를 갱신한다.
                player.facingAngle = Math.atan2(dy, dx)
            }

            player.lastMoveX = dx * player.currentSpeed * TICK_DELTA_SECONDS
            player.lastMoveY = dy * player.currentSpeed * TICK_DELTA_SECONDS

            if (player.isNpc && player.npcState === "charging") {
                player.npcChargeDistanceRemaining = Math.max(
                    0,
                    (player.npcChargeDistanceRemaining || 0) - Math.hypot(player.lastMoveX, player.lastMoveY)
                )
            } else if (player.isDummy && player.dummyState === "charging") {
                player.dummyChargeDistanceRemaining = Math.max(
                    0,
                    (player.dummyChargeDistanceRemaining || 0) - Math.hypot(player.lastMoveX, player.lastMoveY)
                )
                if (player.dummyChargeDistanceRemaining <= 0) {
                    if (player.dummyQueuedExtraCharges > 0) {
                        player.boostState = "idle"
                            player.currentSpeed = getBaseSpeedForPlayer(player)
                        player.dummyState = "rest"
                        player.dummyRestUntil = now
                    } else {
                        player.boostState = "idle"
                        player.currentSpeed = DUMMY_BASE_SPEED_PER_SECOND
                        player.dummyState = "rest"
                        player.dummyRestUntil = now + NPC_REST_DURATION_MS
                    }
                }
            }

            const nextX = player.x + player.lastMoveX
            const nextY = player.y + player.lastMoveY
            const hitLeftWall = nextX < 0
            const hitRightWall = nextX > WORLD_SIZE
            const hitTopWall = nextY < 0
            const hitBottomWall = nextY > WORLD_SIZE

            player.x = this.applyWallBouncePosition(nextX, player.lastMoveX)
            player.y = this.applyWallBouncePosition(nextY, player.lastMoveY)

            if (
                (player.boostState === "charging" || player.boostState === "cooldown") &&
                (hitLeftWall || hitRightWall || hitTopWall || hitBottomWall)
            ) {
                const hitNormalX = hitLeftWall ? 1 : (hitRightWall ? -1 : 0)
                const hitNormalY = hitTopWall ? 1 : (hitBottomWall ? -1 : 0)
                if (player.isNpc) {
                    this.recordNpcPhaseAttackDodge(player)
                }
                this.handleWallBoostCollision(player, now, hitNormalX, hitNormalY)
            }

            if (player.isNpc && player.npcState === "charging" && player.npcChargeDistanceRemaining <= 0) {
                let chainedExtraCharge = false
                if (player.npcQueuedExtraCharges > 0) {
                    const retainedTarget = this.getNpcTarget(player)
                    if (retainedTarget) {
                        const retainedDiffX = retainedTarget.x - player.x
                        const retainedDiffY = retainedTarget.y - player.y
                        const retainedDistance = Math.hypot(retainedDiffX, retainedDiffY)
                        const instantExtraCharge = (player.npcPhase || getNpcPhase(player)) >= 3
                        player.npcQueuedExtraCharges = Math.max(0, player.npcQueuedExtraCharges - 1)
                        player.lastMoveX = 0
                        player.lastMoveY = 0
                        this.startNpcChargeSkill(
                            player,
                            retainedDiffX,
                            retainedDiffY,
                            retainedDistance,
                            {
                                queueExtraCharge: false,
                                instant: instantExtraCharge,
                                distanceMultiplier: NPC_EXTRA_CHARGE_DISTANCE_MULTIPLIER,
                                targetId: retainedTarget.id,
                                isPhaseAttack: true,
                            }
                        )
                        chainedExtraCharge = true
                    } else {
                        player.npcQueuedExtraCharges = 0
                    }
                }
                if (!chainedExtraCharge && player.npcQueuedExtraCharges <= 0) {
                    this.recordNpcPhaseAttackDodge(player)
                    // 돌진 거리를 다 쓰면 네르는 rest 로 들어가고 다음 타겟 선정까지 대기한다.
                    player.npcState = "rest"
                    player.npcRestUntil = now + NPC_REST_DURATION_MS
                    player.npcTargetId = ""
                    player.npcChargeDistanceRemaining = 0
                    player.boostState = "idle"
                    player.currentSpeed = NPC_BASE_SPEED_PER_SECOND
                    player.lastMoveX = 0
                    player.lastMoveY = 0
                }
            }
        }

        // 이동이 끝난 뒤 한 번에 충돌을 해소한다.
        this.resolvePlayerCollisions()

        for (const player of this.players.values()) {
            // 최종 위치 기준으로 spatial grid 도 갱신한다.
            this.grid.move(player)
        }
    }
}

module.exports = World
