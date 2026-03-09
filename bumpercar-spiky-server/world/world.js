const Player = require("./player")
const SpatialGrid = require("./spatialGrid")
const { CELL_SIZE, TICK_RATE, WORLD_SIZE } = require("../config/config")
const { getGameplaySettings } = require("../config/gameplaySettings")

const GAMEPLAY_SETTINGS = getGameplaySettings()
const BASE_PLAYER_SPEED_PER_SECOND = GAMEPLAY_SETTINGS.user_base_speed
const MAX_BOOSTED_SPEED_PER_SECOND = GAMEPLAY_SETTINGS.user_max_boost_speed
const BOOST_ACCELERATION_PER_SECOND = GAMEPLAY_SETTINGS.user_boost_acceleration
const BOOST_COOLDOWN_PER_SECOND = GAMEPLAY_SETTINGS.user_boost_cooldown
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
const COLLISION_VISUAL_BASE_DURATION_MS = 1000
const COLLISION_VISUAL_SPEED_DURATION_MULTIPLIER_MS = 90
const COLLISION_VISUAL_MAX_DURATION_MS = 3000
const COLLISION_RECOVERY_DURATION_MS = 3000
const COLLISION_BOOST_LOCK_DURATION_MS = 3000
const COLLISION_ATTACK_DIRECTION_THRESHOLD = 0.001
const PLAYER_DEATH_TRIGGER_COUNT = 3
const PLAYER_STARTING_LIVES = GAMEPLAY_SETTINGS.user_lives
const PLAYER_DEATH_DURATION_MS = 3000
const RESPAWN_EDGE_PADDING = 120
const NPC_ID = "네르"
const DUMMY_ID = "스핔이"
const NPC_CHARGE_TRIGGER_DISTANCE = GAMEPLAY_SETTINGS.npc_charge_trigger_distance
const NPC_CHARGE_WINDUP_DURATION_MS = GAMEPLAY_SETTINGS.npc_charge_windup_ms
const NPC_REST_DURATION_MS = GAMEPLAY_SETTINGS.npc_rest_ms
const NPC_MAX_HEALTH = GAMEPLAY_SETTINGS.npc_max_health
const NPC_DEATH_ANIMATION_DURATION_MS = 3000
const NPC_RESPAWN_DELAY_MS = GAMEPLAY_SETTINGS.npc_respawn_delay_ms
const NPC_MAX_BOOSTED_SPEED_PER_SECOND = GAMEPLAY_SETTINGS.npc_max_boost_speed
const NPC_BOOST_ACCELERATION_PER_SECOND = GAMEPLAY_SETTINGS.npc_boost_acceleration
const NPC_BOOST_COOLDOWN_PER_SECOND = GAMEPLAY_SETTINGS.npc_boost_cooldown
const NPC_DAMAGE_MIN = GAMEPLAY_SETTINGS.npc_damage_min
const NPC_DAMAGE_MAX = GAMEPLAY_SETTINGS.npc_damage_max
const NPC_DAMAGE_SPEED_DIVISOR = GAMEPLAY_SETTINGS.npc_damage_speed_divisor
// 전체 인간 유저 입력이 이 시간 동안 없으면 진행 상태를 초기화한다.
const INPUT_IDLE_RESET_MS = 10 * 60 * 1000

class World {
    constructor() {
        // players: 현재 월드에 존재하는 엔티티
        // playerProgress: 재접속 후 이어붙일 인간 유저 진행도
        this.players = new Map()
        this.playerProgress = new Map()
        this.sharedLivesRemaining = PLAYER_STARTING_LIVES
        this.lastHumanInputAt = Date.now()
        this.grid = new SpatialGrid(CELL_SIZE)
        this.addCenterDummyPlayer()
        this.addNerNpcPlayer()
    }

    addCenterDummyPlayer() {
        const dummyId = DUMMY_ID
        if (this.players.has(dummyId)) {
            return this.players.get(dummyId)
        }

        const player = new Player(dummyId)
        player.x = WORLD_SIZE / 2
        player.y = WORLD_SIZE / 2
        player.isDummy = true

        this.players.set(dummyId, player)
        this.grid.add(player)

        return player
    }

    addNerNpcPlayer() {
        if (this.players.has(NPC_ID)) {
            return this.players.get(NPC_ID)
        }

        const player = new Player(NPC_ID)
        player.x = WORLD_SIZE / 2 + 180
        player.y = WORLD_SIZE / 2
        player.isNpc = true
        player.npcState = "idle"
        player.npcHealth = NPC_MAX_HEALTH

        this.players.set(NPC_ID, player)
        this.grid.add(player)

        return player
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
            defeatReceivedCount: Number(player.defeatReceivedCount || 0),
            defeatDealtCount: Number(player.defeatDealtCount || 0)
        })
    }

    getOrAssignGuestDisplayId(connectionKey) {
        const savedProgress = this.getStoredPlayerProgress(connectionKey)
        if (savedProgress && savedProgress.displayId) {
            return savedProgress.displayId
        }

        const usedIds = new Set([NPC_ID, DUMMY_ID])
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
        player.currentSpeed = BASE_PLAYER_SPEED_PER_SECOND
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
        player.collisionImpactX = 0
        player.collisionImpactY = 0
        player.collisionRecoveryStartedAt = 0
        player.collisionRecoveryUntil = 0
        player.boostDisabledUntil = now
        player.deathStartedAt = 0
        player.deathUntil = 0
        player.npcHealth = NPC_MAX_HEALTH
        player.npcRespawnAt = 0
        player.npcState = "idle"
        player.npcTargetId = ""
        player.npcChargeDirectionX = 0
        player.npcChargeDirectionY = 0
        player.npcChargeDistanceRemaining = 0
        player.npcChargeWindupStartedAt = 0
        player.npcChargeWindupUntil = 0
        player.npcRestUntil = 0
        this.grid.move(player)
    }

    resetRoundLives(now) {
        this.sharedLivesRemaining = PLAYER_STARTING_LIVES

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

    addPlayer(connectionKey, displayId = connectionKey) {
        const resolvedConnectionKey = String(connectionKey || displayId || "").trim()
        const resolvedDisplayId = String(displayId || resolvedConnectionKey || "").trim()
        const existingPlayer = this.players.get(resolvedDisplayId)
        if (existingPlayer) {
            this.grid.remove(existingPlayer)
            this.players.delete(resolvedDisplayId)
        }

        const player = new Player(resolvedDisplayId)
        player.connectionKey = resolvedConnectionKey || resolvedDisplayId

        // 같은 connectionKey 로 재접속하면 이전 통계를 이어받는다.
        const savedProgress = this.getStoredPlayerProgress(player.connectionKey)
        if (savedProgress) {
            player.defeatReceivedCount = Number(savedProgress.defeatReceivedCount || 0)
            player.defeatDealtCount = Number(savedProgress.defeatDealtCount || 0)
        }
        player.livesRemaining = this.sharedLivesRemaining

        this.players.set(resolvedDisplayId, player)
        this.grid.add(player)
        this.updateStoredPlayerProgress(player)

        return player
    }

    removePlayer(player) {
        this.updateStoredPlayerProgress(player)
        this.grid.remove(player)
        this.players.delete(player.id)
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
    }

    clampToWorld(value) {
        return Math.max(0, Math.min(WORLD_SIZE, value))
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

    getCollisionDirectionRadius(player, normalX, normalY) {
        // 회전된 둥근 직사각형을 한 방향에서 바라본 "유효 반지름"으로 바꿔서
        // 방향별 충돌 거리 계산에 사용한다.
        const { halfWidth, halfHeight } = this.getCollisionHalfExtents(player)
        const angle = player && typeof player.facingAngle === "number" ? player.facingAngle : 0
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

    triggerPlayerDeath(player, now) {
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
        player.collisionVisualUntil = player.deathUntil
        player.collisionImpactX = 0
        player.collisionImpactY = 0
        player.collisionRecoveryStartedAt = 0
        player.collisionRecoveryUntil = 0
        player.boostDisabledUntil = Math.max(player.boostDisabledUntil || 0, player.deathUntil)
        player.lastMoveX = 0
        player.lastMoveY = 0
        this.updateStoredPlayerProgress(player)

        // 공용 목숨이 모두 소진되고 전원이 쓰러졌다면 다음 라운드로 리셋한다.
        if (this.areAllHumanPlayersOut()) {
            this.resetRoundLives(now)
        }
    }

    triggerNpcDeath(player, now) {
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
        player.npcChargeWindupStartedAt = 0
        player.npcChargeWindupUntil = 0
        player.npcRestUntil = 0
        player.boostState = "idle"
        player.currentSpeed = 0
        player.boostDirectionX = 0
        player.boostDirectionY = 0
        player.input.boost = false
        player.collisionVisualType = "defeat"
        player.collisionVisualUntil = player.deathUntil
        player.boostDisabledUntil = player.npcRespawnAt
        player.lastMoveX = 0
        player.lastMoveY = 0
    }

    respawnPlayer(player, now) {
        if (!player) {
            return false
        }

        // 인간 유저는 공용 목숨이 남아 있을 때만 리스폰 가능하다.
        player.livesRemaining = this.sharedLivesRemaining
        if (!player.isNpc && Number(this.sharedLivesRemaining || 0) <= 0) {
            player.respawnRequested = false
            player.input.respawn = false
            this.updateStoredPlayerProgress(player)
            return false
        }

        // 플레이어는 맵 가장자리 쪽 랜덤 위치에서 다시 나온다.
        const spawnPosition = this.getRandomEdgeSpawnPosition()
        player.x = spawnPosition.x
        player.y = spawnPosition.y
        player.currentSpeed = BASE_PLAYER_SPEED_PER_SECOND
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
        player.collisionImpactX = 0
        player.collisionImpactY = 0
        player.collisionRecoveryStartedAt = 0
        player.collisionRecoveryUntil = 0
        player.boostDisabledUntil = now
        player.deathStartedAt = 0
        player.deathUntil = 0
        player.respawnRequested = false
        if (player.isNpc) {
            player.npcHealth = NPC_MAX_HEALTH
            player.npcRespawnAt = 0
            player.npcState = "idle"
            player.npcTargetId = ""
            player.npcChargeDistanceRemaining = 0
            player.npcChargeWindupStartedAt = 0
            player.npcChargeWindupUntil = 0
            player.npcRestUntil = 0
        }
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

        const nextTarget = candidates[Math.floor(Math.random() * candidates.length)]
        player.npcTargetId = nextTarget.id
        return nextTarget
    }

    startNpcChargeSkill(player, diffX, diffY, distance) {
        if (!player || !player.isNpc) {
            return { dx: 0, dy: 0 }
        }

        // 네르 돌진 스킬은 시작 순간 방향과 총 이동 거리를 고정해 둔다.
        const magnitude = distance > 0.001 ? distance : 1
        player.npcChargeDirectionX = diffX / magnitude
        player.npcChargeDirectionY = diffY / magnitude
        player.npcChargeDistanceRemaining = distance * 2
        player.npcState = "windup"
        player.boostState = "idle"
        player.npcChargeWindupStartedAt = Date.now()
        player.npcChargeWindupUntil = player.npcChargeWindupStartedAt + NPC_CHARGE_WINDUP_DURATION_MS

        return { dx: 0, dy: 0 }
    }

    updateNpc(player, now) {
        if (!player || !player.isNpc) {
            return { dx: 0, dy: 0 }
        }

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
            player.currentSpeed = BASE_PLAYER_SPEED_PER_SECOND
            player.npcChargeWindupStartedAt = 0
            player.npcChargeWindupUntil = 0
            if (player.npcRestUntil > now) {
                return { dx: 0, dy: 0 }
            }
            player.npcState = "chase"
            player.npcTargetId = ""
        }

        const target = this.getNpcTarget(player)
        if (!target) {
            player.npcState = "idle"
            player.boostState = "idle"
            player.currentSpeed = BASE_PLAYER_SPEED_PER_SECOND
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
        if (distance <= NPC_CHARGE_TRIGGER_DISTANCE) {
            return this.startNpcChargeSkill(player, diffX, diffY, distance)
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

        // 인간 유저는 충돌 직후 잠시 느려지고, 그 동안 돌진도 잠긴다.
        const resolvedRecoveryUntil = Math.max(now, Number(recoveryUntil || 0))
        player.boostState = "idle"
        player.input.boost = false
        player.currentSpeed = player.collisionSlowSpeed
        player.collisionRecoveryStartedAt = now
        player.collisionRecoveryUntil = resolvedRecoveryUntil
        player.boostDisabledUntil = resolvedRecoveryUntil
        player.npcChargeWindupStartedAt = 0
        player.npcChargeWindupUntil = 0
    }

    applyNpcDefeatDamage(player, impactSpeed, now) {
        if (!player || !player.isNpc || this.isPlayerDead(player)) {
            return
        }

        // 네르 피해량은 직전 충돌 속도에 비례해서 1~5 사이로 계산한다.
        const damage = Math.max(
            NPC_DAMAGE_MIN,
            Math.min(NPC_DAMAGE_MAX, Math.round(Math.max(0, impactSpeed) / NPC_DAMAGE_SPEED_DIVISOR))
        )
        player.npcHealth = Math.max(0, (player.npcHealth || NPC_MAX_HEALTH) - damage)

        if (player.npcHealth <= 0) {
            this.triggerNpcDeath(player, now)
        }
    }

    getCollisionRadius(player) {
        const { halfWidth, halfHeight } = this.getCollisionHalfExtents(player)
        return Math.max(halfWidth, halfHeight)
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

                let diffX = playerB.x - playerA.x
                let diffY = playerB.y - playerA.y
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
                const collisionVisualDuration = Math.min(
                    COLLISION_VISUAL_MAX_DURATION_MS,
                    COLLISION_VISUAL_BASE_DURATION_MS +
                        relativeImpactSpeed * COLLISION_VISUAL_SPEED_DURATION_MULTIPLIER_MS
                )
                const collisionVisualUntil = now + collisionVisualDuration
                const playerAAttackDot = playerA.lastMoveX * normalX + playerA.lastMoveY * normalY
                const playerBAttackDot = -(playerB.lastMoveX * normalX + playerB.lastMoveY * normalY)
                // "가속한 채 진행 방향으로 박았는지"를 공격 판정으로 사용한다.
                const playerAAttacking = (
                    playerA.isNpc
                        ? playerA.npcState === "charging"
                        : playerA.currentSpeed > BASE_PLAYER_SPEED_PER_SECOND
                ) && playerAAttackDot > COLLISION_ATTACK_DIRECTION_THRESHOLD
                const playerBAttacking = (
                    playerB.isNpc
                        ? playerB.npcState === "charging"
                        : playerB.currentSpeed > BASE_PLAYER_SPEED_PER_SECOND
                ) && playerBAttackDot > COLLISION_ATTACK_DIRECTION_THRESHOLD

                playerA.collisionVisualUntil = collisionVisualUntil
                playerB.collisionVisualUntil = collisionVisualUntil
                playerA.collisionVisualType = "win"
                playerB.collisionVisualType = "win"
                playerA.collisionImpactX = 0
                playerA.collisionImpactY = 0
                playerB.collisionImpactX = 0
                playerB.collisionImpactY = 0

                // 공격/피격 결과에 따라 win/defeat 시각 상태와 통계를 기록한다.
                if (playerAAttacking && playerBAttacking) {
                    playerA.collisionVisualType = "defeat"
                    playerB.collisionVisualType = "defeat"
                    playerA.collisionImpactX = normalX
                    playerA.collisionImpactY = normalY
                    playerB.collisionImpactX = -normalX
                    playerB.collisionImpactY = -normalY
                    playerA.defeatReceivedCount += 1
                    playerB.defeatReceivedCount += 1
                    playerA.defeatDealtCount += 1
                    playerB.defeatDealtCount += 1
                    this.applyNpcDefeatDamage(playerA, relativeImpactSpeed, now)
                    this.applyNpcDefeatDamage(playerB, relativeImpactSpeed, now)
                } else if (playerAAttacking) {
                    playerB.collisionVisualType = "defeat"
                    playerB.collisionImpactX = -normalX
                    playerB.collisionImpactY = -normalY
                    playerA.defeatDealtCount += 1
                    playerB.defeatReceivedCount += 1
                    this.applyNpcDefeatDamage(playerB, relativeImpactSpeed, now)
                } else if (playerBAttacking) {
                    playerA.collisionVisualType = "defeat"
                    playerA.collisionImpactX = normalX
                    playerA.collisionImpactY = normalY
                    playerB.defeatDealtCount += 1
                    playerA.defeatReceivedCount += 1
                    this.applyNpcDefeatDamage(playerA, relativeImpactSpeed, now)
                }

                // 일반 유저만 충돌 직후 느려지고, 네르는 감속 대상에서 제외된다.
                this.applyCollisionSlow(playerA, now, collisionVisualUntil)
                this.applyCollisionSlow(playerB, now, collisionVisualUntil)

                if (playerA.collisionVisualType === "defeat" &&
                    !playerA.isNpc &&
                    !playerA.isDummy &&
                    playerA.defeatReceivedCount % PLAYER_DEATH_TRIGGER_COUNT === 0) {
                    this.triggerPlayerDeath(playerA, now)
                }
                if (playerB.collisionVisualType === "defeat" &&
                    !playerB.isNpc &&
                    !playerB.isDummy &&
                    playerB.defeatReceivedCount % PLAYER_DEATH_TRIGGER_COUNT === 0) {
                    this.triggerPlayerDeath(playerB, now)
                }

                // 최종적으로 겹침 해소 + 반발만큼 서로 밀어낸다.
                playerA.x = this.clampToWorld(playerA.x - normalX * separation)
                playerA.y = this.clampToWorld(playerA.y - normalY * separation)
                playerB.x = this.clampToWorld(playerB.x + normalX * separation)
                playerB.y = this.clampToWorld(playerB.y + normalY * separation)
            }
        }
    }

    update() {
        const now = Date.now()
        this.maybeResetAfterInputIdle(now)

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

            if (isMoving) {
                player.facingAngle = Math.atan2(dy, dx)
            }

            if (player.collisionRecoveryUntil > now) {
                // 충돌 회복 시간 동안은 지정된 느린 속도에서 기본속도로 선형 복귀한다.
                const recoveryDuration = player.collisionRecoveryUntil - player.collisionRecoveryStartedAt
                const recoveryProgress = recoveryDuration > 0
                    ? (now - player.collisionRecoveryStartedAt) / recoveryDuration
                    : 1

                player.boostState = "idle"
                player.currentSpeed = player.collisionSlowSpeed +
                    (BASE_PLAYER_SPEED_PER_SECOND - player.collisionSlowSpeed) * Math.max(0, Math.min(1, recoveryProgress))
            } else {
                if (player.collisionRecoveryUntil !== 0) {
                    player.collisionRecoveryStartedAt = 0
                    player.collisionRecoveryUntil = 0
                    player.currentSpeed = BASE_PLAYER_SPEED_PER_SECOND
                }

                const boostLocked = player.boostDisabledUntil > now

                if (boostLocked) {
                    player.boostState = "idle"
                    player.input.boost = false
                    player.boostDirectionX = 0
                    player.boostDirectionY = 0
                }

                if (player.isNpc && player.npcState === "charging" && player.boostState === "idle") {
                    player.boostState = "charging"
                } else if (player.input.boost && !boostLocked && player.boostState === "idle" && isMoving) {
                    // 유저 돌진은 시작 방향 저장 후 charging 으로 진입한다.
                    player.boostState = "charging"
                    player.boostDirectionX = dx
                    player.boostDirectionY = dy
                }

                if (player.boostState === "charging") {
                    // charging / cooldown 동안 유저는 시작 방향 고정 직진이다.
                    if (!player.isNpc) {
                        dx = player.boostDirectionX || dx
                        dy = player.boostDirectionY || dy
                    }
                    const maxBoostedSpeed = player.isNpc ? NPC_MAX_BOOSTED_SPEED_PER_SECOND : MAX_BOOSTED_SPEED_PER_SECOND
                    const boostAcceleration = player.isNpc ? NPC_BOOST_ACCELERATION_PER_SECOND : BOOST_ACCELERATION_PER_SECOND
                    player.currentSpeed = Math.min(
                        maxBoostedSpeed,
                        player.currentSpeed + boostAcceleration * TICK_DELTA_SECONDS
                    )
                    if (player.currentSpeed >= maxBoostedSpeed) {
                        player.boostState = "cooldown"
                    }
                } else if (player.boostState === "cooldown") {
                    if (!player.isNpc) {
                        dx = player.boostDirectionX || dx
                        dy = player.boostDirectionY || dy
                    }
                    const boostCooldown = player.isNpc ? NPC_BOOST_COOLDOWN_PER_SECOND : BOOST_COOLDOWN_PER_SECOND
                    player.currentSpeed = Math.max(
                        BASE_PLAYER_SPEED_PER_SECOND,
                        player.currentSpeed - boostCooldown * TICK_DELTA_SECONDS
                    )
                    if (player.currentSpeed <= BASE_PLAYER_SPEED_PER_SECOND) {
                        player.currentSpeed = BASE_PLAYER_SPEED_PER_SECOND
                        if (player.isNpc) {
                            player.npcState = "rest"
                            player.npcRestUntil = now + NPC_REST_DURATION_MS
                            player.npcTargetId = ""
                            player.boostState = "idle"
                            player.boostDirectionX = 0
                            player.boostDirectionY = 0
                        } else if (!player.input.boost) {
                            player.boostState = "idle"
                            player.boostDirectionX = 0
                            player.boostDirectionY = 0
                        }
                    }
                } else if (!isMoving) {
                    // 멈춘 상태에서는 남아 있던 속도를 자연스럽게 기본속도로 낮춘다.
                    player.currentSpeed = Math.max(
                        BASE_PLAYER_SPEED_PER_SECOND,
                        player.currentSpeed - BOOST_COOLDOWN_PER_SECOND * TICK_DELTA_SECONDS
                    )
                } else {
                    player.currentSpeed = BASE_PLAYER_SPEED_PER_SECOND
                    player.boostDirectionX = 0
                    player.boostDirectionY = 0
                }
            }

            player.lastMoveX = dx * player.currentSpeed * TICK_DELTA_SECONDS
            player.lastMoveY = dy * player.currentSpeed * TICK_DELTA_SECONDS

            if (player.isNpc && player.npcState === "charging") {
                player.npcChargeDistanceRemaining = Math.max(
                    0,
                    (player.npcChargeDistanceRemaining || 0) - Math.hypot(player.lastMoveX, player.lastMoveY)
                )
            }

            player.x = this.clampToWorld(player.x + player.lastMoveX)
            player.y = this.clampToWorld(player.y + player.lastMoveY)

            if (player.isNpc && player.npcState === "charging" && player.npcChargeDistanceRemaining <= 0) {
                // 돌진 거리를 다 쓰면 네르는 rest 로 들어가고 다음 타겟 선정까지 대기한다.
                player.npcState = "rest"
                player.npcRestUntil = now + NPC_REST_DURATION_MS
                player.npcTargetId = ""
                player.npcChargeDistanceRemaining = 0
                player.boostState = "idle"
                player.currentSpeed = BASE_PLAYER_SPEED_PER_SECOND
                player.lastMoveX = 0
                player.lastMoveY = 0
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
