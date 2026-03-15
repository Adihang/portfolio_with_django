/**
 * worldSettings.js — 게임플레이 설정 기반 공유 상수 모음
 *
 * gameplaySettings.json 에서 파생된 모든 속도·쿨다운·AI 파라미터를 한 번만 계산해 내보낸다.
 * require() 캐시 덕분에 여러 믹스인이 이 모듈을 import 해도 getGameplaySettings() 는 1회만 호출된다.
 * createDoubleUnitState 팩토리 함수도 이 파일에서 내보내어 double 유닛 초기화를 통일한다.
 */

const { TICK_RATE } = require("../config/config")
const { getGameplaySettings } = require("../config/gameplaySettings")
const { DOUBLE_UNIT_HEALTH } = require("../config/constants")

const GAMEPLAY_SETTINGS = getGameplaySettings()
const BASE_PLAYER_SPEED_PER_SECOND = GAMEPLAY_SETTINGS.user_base_speed
const DUMMY_BASE_SPEED_PER_SECOND = BASE_PLAYER_SPEED_PER_SECOND * 1.5
const NPC_BASE_SPEED_PER_SECOND = GAMEPLAY_SETTINGS.npc_base_speed
const MAX_BOOSTED_SPEED_PER_SECOND = GAMEPLAY_SETTINGS.user_max_boost_speed
const BOOST_ACCELERATION_PER_SECOND = GAMEPLAY_SETTINGS.user_boost_acceleration
const BOOST_COOLDOWN_PER_SECOND = GAMEPLAY_SETTINGS.user_boost_cooldown
const USER_POST_BOOST_COOLDOWN_MS = GAMEPLAY_SETTINGS.user_post_boost_cooldown_ms
const TICK_DELTA_SECONDS = 1 / TICK_RATE
const PLAYER_STARTING_LIVES = GAMEPLAY_SETTINGS.user_lives
const NPC_CHARGE_TRIGGER_DISTANCE = GAMEPLAY_SETTINGS.npc_charge_trigger_distance
const NPC_CHARGE_DISTANCE_MULTIPLIER = GAMEPLAY_SETTINGS.npc_charge_distance_multiplier
const NPC_EXTRA_CHARGE_DISTANCE_MULTIPLIER = GAMEPLAY_SETTINGS.npc_extra_charge_distance_multiplier
const NPC_CHARGE_WINDUP_DURATION_MS = GAMEPLAY_SETTINGS.npc_charge_windup_ms
const NPC_REST_DURATION_MS = GAMEPLAY_SETTINGS.npc_rest_ms
const NPC_MAX_HEALTH = GAMEPLAY_SETTINGS.npc_max_health
const NPC_MAX_BOOSTED_SPEED_PER_SECOND = GAMEPLAY_SETTINGS.npc_max_boost_speed
const NPC_BOOST_ACCELERATION_PER_SECOND = GAMEPLAY_SETTINGS.npc_boost_acceleration
const NPC_BOOST_COOLDOWN_PER_SECOND = GAMEPLAY_SETTINGS.npc_boost_cooldown
const NPC_DAMAGE_MIN = GAMEPLAY_SETTINGS.npc_damage_min
const NPC_DAMAGE_MAX = GAMEPLAY_SETTINGS.npc_damage_max
const PUMPKIN_NPC_DEFEAT_DASH_SPEED_PER_SECOND = Math.max(
    MAX_BOOSTED_SPEED_PER_SECOND * 1.1,
    BASE_PLAYER_SPEED_PER_SECOND * 2
)

/**
 * double 스킨의 개별 유닛 초기 상태 객체를 생성해 반환한다.
 * 체력·위치·부스트·충돌 관련 모든 필드를 기본값으로 초기화한다.
 * @param {number} [now] - 부스트 비활성화 타임스탬프 기준 시각 (기본값: Date.now())
 * @returns {object} 초기화된 유닛 상태 객체
 */
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

module.exports = {
    BASE_PLAYER_SPEED_PER_SECOND,
    DUMMY_BASE_SPEED_PER_SECOND,
    NPC_BASE_SPEED_PER_SECOND,
    MAX_BOOSTED_SPEED_PER_SECOND,
    BOOST_ACCELERATION_PER_SECOND,
    BOOST_COOLDOWN_PER_SECOND,
    USER_POST_BOOST_COOLDOWN_MS,
    TICK_DELTA_SECONDS,
    PLAYER_STARTING_LIVES,
    NPC_CHARGE_TRIGGER_DISTANCE,
    NPC_CHARGE_DISTANCE_MULTIPLIER,
    NPC_EXTRA_CHARGE_DISTANCE_MULTIPLIER,
    NPC_CHARGE_WINDUP_DURATION_MS,
    NPC_REST_DURATION_MS,
    NPC_MAX_HEALTH,
    NPC_MAX_BOOSTED_SPEED_PER_SECOND,
    NPC_BOOST_ACCELERATION_PER_SECOND,
    NPC_BOOST_COOLDOWN_PER_SECOND,
    NPC_DAMAGE_MIN,
    NPC_DAMAGE_MAX,
    PUMPKIN_NPC_DEFEAT_DASH_SPEED_PER_SECOND,
    createDoubleUnitState,
}
