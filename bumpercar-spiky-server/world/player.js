const { WORLD_SIZE } = require("../config/config")
const { getGameplaySettings } = require("../config/gameplaySettings")

const GAMEPLAY_SETTINGS = getGameplaySettings()
const BASE_PLAYER_SPEED_PER_SECOND = GAMEPLAY_SETTINGS.user_base_speed
const COLLISION_SLOW_SPEED_PER_SECOND = BASE_PLAYER_SPEED_PER_SECOND * 0.35
const NPC_MAX_HEALTH = GAMEPLAY_SETTINGS.npc_max_health
const PLAYER_STARTING_LIVES = GAMEPLAY_SETTINGS.user_lives

class Player {
    constructor(id) {
        this.id = id
        // connectionKey 는 재접속 시 저장 상태를 이어붙일 때 쓰고,
        // id 는 실제 화면/월드에서 보이는 현재 표시 이름이다.
        this.connectionKey = id
        this.x = Math.random() * WORLD_SIZE
        this.y = Math.random() * WORLD_SIZE
        this.isDummy = false
        this.isNpc = false
        // baseSpeed/currentSpeed 는 기본 이동과 가속/감속 계산의 기준값이다.
        this.baseSpeed = BASE_PLAYER_SPEED_PER_SECOND
        this.currentSpeed = BASE_PLAYER_SPEED_PER_SECOND
        this.collisionSlowSpeed = COLLISION_SLOW_SPEED_PER_SECOND
        // boostState:
        // idle -> 평상시
        // charging -> 가속 중
        // cooldown -> 최고속도 이후 기본속도로 복귀 중
        this.boostState = "idle"
        // 유저 가속은 시작 방향으로 고정 직진하기 때문에 그 방향을 별도로 저장한다.
        this.boostDirectionX = 0
        this.boostDirectionY = 0
        this.input = {
            up: false,
            down: false,
            left: false,
            right: false,
            boost: false
        }
        // lastMove 는 직전 틱 실제 이동량이다.
        // 충돌 방향 판정, 반발 세기, 클라이언트 속도 보간에 같이 쓴다.
        this.lastMoveX = 0
        this.lastMoveY = 0
        // collisionVisual* 은 win/defeat 아이콘 및 피격 연출 타이밍을 의미한다.
        this.collisionVisualUntil = 0
        this.collisionVisualType = "win"
        this.collisionImpactX = 0
        this.collisionImpactY = 0
        // 충돌 직후 잠깐 느려지고, 그 뒤 기본속도로 회복되는 구간 정보.
        this.collisionRecoveryStartedAt = 0
        this.collisionRecoveryUntil = 0
        // boostDisabledUntil 이전까지는 다시 가속할 수 없다.
        this.boostDisabledUntil = 0
        // deathUntil 이 0 이 아니면 사망 상태로 본다.
        this.deathStartedAt = 0
        this.deathUntil = 0
        this.respawnRequested = false
        this.livesRemaining = PLAYER_STARTING_LIVES
        // defeat 통계는 패널 표시와 사망 트리거 계산에 같이 사용된다.
        this.defeatReceivedCount = 0
        this.defeatDealtCount = 0
        // 아래 값들은 네르 NPC 전용 상태다.
        this.npcTargetId = ""
        this.npcState = "idle"
        this.npcHealth = NPC_MAX_HEALTH
        this.npcRespawnAt = 0
        this.npcChargeDirectionX = 0
        this.npcChargeDirectionY = 0
        this.npcChargeDistanceRemaining = 0
        this.npcChargeWindupStartedAt = 0
        this.npcChargeWindupUntil = 0
        this.npcRestUntil = 0
        // facingAngle 은 회전된 충돌 판정과 클라이언트 아이콘 회전에 공통 사용한다.
        this.facingAngle = 0
        this.cell = null
    }
}

module.exports = Player
