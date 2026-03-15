const fs = require("fs")
const path = require("path")

// Django 관리 페이지에서 바꾸는 공용 수치와 1:1로 맞춰지는 기본값.
// 파일을 읽지 못하더라도 서버가 죽지 않게 항상 fallback 을 제공한다.
const DEFAULT_SETTINGS = {
    user_base_speed: 286,
    user_boost_distance: 399.3,
    user_boost_duration_ms: 1238,
    user_post_boost_cooldown_ms: 3000,
    user_lives: 3,
    npc_base_speed: 202.5,
    npc_max_health: 20,
    npc_phase_two_health_ratio: 0.6,
    npc_phase_three_health_ratio: 0.2,
    npc_charge_trigger_distance: 150,
    npc_charge_distance_multiplier: 2.2,
    npc_extra_charge_distance_multiplier: 1.5,
    npc_charge_windup_ms: 500,
    npc_rest_ms: 1800,
    npc_max_boost_speed: 1687.5,
    npc_boost_acceleration: 1350,
    npc_boost_cooldown: 1008,
    npc_respawn_delay_ms: 60000,
    npc_damage_min: 1,
    npc_damage_max: 5
}
const DEFAULT_PLAYER_MAX_BOOST_SPEED_MULTIPLIER = Number((359.0726978998385 / 286).toFixed(4))
const DEFAULT_CHARACTER_SETTINGS = {
    default: {
        base_speed_multiplier: 1,
        max_boost_speed_multiplier: DEFAULT_PLAYER_MAX_BOOST_SPEED_MULTIPLIER,
        max_health_segments: 3,
        movement_type: "classic"
    },
    double: {
        base_speed_multiplier: 1,
        max_boost_speed_multiplier: DEFAULT_PLAYER_MAX_BOOST_SPEED_MULTIPLIER,
        max_health_segments: 4,
        movement_type: "classic"
    },
    many: {
        base_speed_multiplier: 1,
        max_boost_speed_multiplier: DEFAULT_PLAYER_MAX_BOOST_SPEED_MULTIPLIER,
        max_health_segments: 5,
        movement_type: "classic"
    },
    pumkin: {
        base_speed_multiplier: 1.4,
        max_boost_speed_multiplier: DEFAULT_PLAYER_MAX_BOOST_SPEED_MULTIPLIER,
        max_health_segments: 3,
        movement_type: "classic"
    },
    evolution: {
        base_speed_multiplier: 0.8,
        max_boost_speed_multiplier: DEFAULT_PLAYER_MAX_BOOST_SPEED_MULTIPLIER,
        max_health_segments: 5,
        movement_type: "evolution"
    }
}
const ADMIN_BASE_USER_SPEED_REFERENCE = 220
const USER_BASE_SPEED_MULTIPLIER_KEY = "user_base_speed_multiplier"
const NPC_BASE_SPEED_MULTIPLIER_KEY = "npc_base_speed_multiplier"
const NPC_MAX_BOOST_SPEED_MULTIPLIER_KEY = "npc_max_boost_speed_multiplier"

const SETTINGS_PATH = process.env.BUMPERCAR_SPIKY_SETTINGS_PATH ||
    path.resolve(__dirname, "../../config/bumpercar_spiky_settings.json")

// 외부에서 읽어온 원시 설정 객체를 검증하고 기본값을 채워 정규화된 설정 객체를 반환한다.
// rawSettings: JSON 파일에서 파싱한 원시 설정 객체
// 반환값: 모든 필드가 유효한 숫자로 채워진 정규화된 설정 객체
function normalizeSettings(rawSettings) {
    const normalized = { ...DEFAULT_SETTINGS }
    if (!rawSettings || typeof rawSettings !== "object") {
        return normalized
    }

    // 기본 속도, 이동 거리, 지속 시간으로부터 부스트 물리 프로필을 계산한다.
    // baseSpeed: 기본 이동 속도
    // distance: 목표 부스트 이동 거리
    // durationMs: 부스트 지속 시간(ms)
    // 반환값: { distance, durationMs, maxSpeed, acceleration, cooldown } 객체
    const deriveBoostProfile = (baseSpeed, distance, durationMs) => {
        const safeDurationMs = Math.max(1, Math.round(durationMs))
        const durationSeconds = safeDurationMs / 1000
        const minimumDistance = (baseSpeed * durationSeconds) + 1
        const safeDistance = Math.max(Number(distance), minimumDistance)
        const deltaSpeed = Math.max(0, (2 * (safeDistance - (baseSpeed * durationSeconds))) / durationSeconds)
        const maxSpeed = baseSpeed + deltaSpeed
        const acceleration = deltaSpeed > 0 ? (3 * deltaSpeed) / (2 * durationSeconds) : 1
        const cooldown = deltaSpeed > 0 ? acceleration * 2 : 2
        return {
            distance: safeDistance,
            durationMs: safeDurationMs,
            maxSpeed,
            acceleration,
            cooldown
        }
    }

    // 허용된 키만 숫자로 정규화해서 받아오고,
    // 잘못된 값은 조용히 기본값으로 되돌린다.
    for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
        const candidate = rawSettings[key]
        if (candidate === undefined || candidate === null || candidate === "") {
            continue
        }
        const numericValue = Number(candidate)
        normalized[key] = Number.isFinite(numericValue) ? numericValue : defaultValue
    }

    {
        const userBaseMultiplier = Number(rawSettings[USER_BASE_SPEED_MULTIPLIER_KEY])
        if (Number.isFinite(userBaseMultiplier)) {
            normalized.user_base_speed = Math.max(1, userBaseMultiplier) * ADMIN_BASE_USER_SPEED_REFERENCE
        }
    }

    {
        const npcBaseMultiplier = Number(rawSettings[NPC_BASE_SPEED_MULTIPLIER_KEY])
        if (Number.isFinite(npcBaseMultiplier)) {
            normalized.npc_base_speed = Math.max(0.1, npcBaseMultiplier) * Math.max(1, normalized.user_base_speed)
        }
    }

    {
        const npcMaxBoostMultiplier = Number(rawSettings[NPC_MAX_BOOST_SPEED_MULTIPLIER_KEY])
        if (Number.isFinite(npcMaxBoostMultiplier)) {
            normalized.npc_max_boost_speed = Math.max(0.1, npcMaxBoostMultiplier) * Math.max(1, normalized.user_base_speed)
        }
    }

    const normalizedCharacterSettings = JSON.parse(JSON.stringify(DEFAULT_CHARACTER_SETTINGS))
    if (rawSettings.character_settings && typeof rawSettings.character_settings === "object") {
        for (const [skinName, defaultSkinSettings] of Object.entries(DEFAULT_CHARACTER_SETTINGS)) {
            const candidateSkinSettings = rawSettings.character_settings[skinName]
            if (!candidateSkinSettings || typeof candidateSkinSettings !== "object") {
                continue
            }
            for (const [fieldName, defaultFieldValue] of Object.entries(defaultSkinSettings)) {
                if (fieldName === "movement_type") {
                    normalizedCharacterSettings[skinName][fieldName] =
                        String(candidateSkinSettings[fieldName] || "").trim().toLowerCase() === "evolution"
                            ? "evolution"
                            : "classic"
                    continue
                }
                const numericValue = Number(candidateSkinSettings[fieldName])
                normalizedCharacterSettings[skinName][fieldName] = Number.isFinite(numericValue) ? numericValue : defaultFieldValue
            }
        }
    }

    // 게임이 깨지지 않게 각 값에 최소 범위를 적용한다.
    normalized.user_base_speed = Math.max(1, normalized.user_base_speed)
    normalized.user_post_boost_cooldown_ms = Math.max(0, Math.round(normalized.user_post_boost_cooldown_ms))
    normalized.user_lives = Math.max(1, Math.round(normalized.user_lives))
    normalized.npc_base_speed = Math.max(1, normalized.npc_base_speed)
    normalized.npc_max_health = Math.max(1, Math.round(normalized.npc_max_health))
    normalized.npc_phase_two_health_ratio = Math.max(0, Math.min(1, normalized.npc_phase_two_health_ratio))
    normalized.npc_phase_three_health_ratio = Math.max(0, Math.min(normalized.npc_phase_two_health_ratio, normalized.npc_phase_three_health_ratio))
    normalized.npc_charge_trigger_distance = Math.max(1, normalized.npc_charge_trigger_distance)
    normalized.npc_charge_distance_multiplier = Math.max(0.1, normalized.npc_charge_distance_multiplier)
    normalized.npc_extra_charge_distance_multiplier = Math.max(0.1, normalized.npc_extra_charge_distance_multiplier)
    normalized.npc_charge_windup_ms = Math.max(0, Math.round(normalized.npc_charge_windup_ms))
    normalized.npc_rest_ms = Math.max(0, Math.round(normalized.npc_rest_ms))
    normalized.npc_max_boost_speed = Math.max(normalized.npc_base_speed, normalized.npc_max_boost_speed)
    normalized.npc_boost_acceleration = Math.max(1, normalized.npc_boost_acceleration)
    normalized.npc_boost_cooldown = Math.max(1, normalized.npc_boost_cooldown)
    normalized.npc_respawn_delay_ms = Math.max(1000, Math.round(normalized.npc_respawn_delay_ms))
    normalized.npc_damage_min = Math.max(1, Math.round(normalized.npc_damage_min))
    normalized.npc_damage_max = Math.max(normalized.npc_damage_min, Math.round(normalized.npc_damage_max))
    for (const skinSettings of Object.values(normalizedCharacterSettings)) {
        skinSettings.base_speed_multiplier = Math.max(0.1, Number(skinSettings.base_speed_multiplier || 1))
        skinSettings.max_boost_speed_multiplier = Math.max(0.1, Number(skinSettings.max_boost_speed_multiplier || 1))
        skinSettings.max_health_segments = Math.max(1, Math.round(Number(skinSettings.max_health_segments || 1)))
        skinSettings.movement_type = skinSettings.movement_type === "evolution" ? "evolution" : "classic"
    }

    if (rawSettings.user_boost_distance === undefined || rawSettings.user_boost_duration_ms === undefined) {
        const legacyUserMaxSpeed = Number(rawSettings.user_max_boost_speed || 420)
        const legacyUserAcceleration = Math.max(1, Number(rawSettings.user_boost_acceleration || 360))
        const legacyUserCooldown = Math.max(1, Number(rawSettings.user_boost_cooldown || 280))
        const legacyUserDelta = Math.max(0, legacyUserMaxSpeed - normalized.user_base_speed)
        const legacyUserDurationSeconds = (legacyUserDelta / legacyUserAcceleration) + (legacyUserDelta / legacyUserCooldown)
        const legacyUserDistance = normalized.user_base_speed * legacyUserDurationSeconds + (0.5 * legacyUserDelta * legacyUserDurationSeconds)
        normalized.user_boost_distance = legacyUserDistance
        normalized.user_boost_duration_ms = Math.round(legacyUserDurationSeconds * 1000)
    }

    if (rawSettings.npc_max_boost_speed === undefined || rawSettings.npc_boost_acceleration === undefined || rawSettings.npc_boost_cooldown === undefined) {
        const deriveNpcProfile = deriveBoostProfile(
            normalized.npc_base_speed,
            Number(rawSettings.npc_boost_distance || 2431.7),
            Number(rawSettings.npc_boost_duration_ms || 2573)
        )
        normalized.npc_max_boost_speed = deriveNpcProfile.maxSpeed
        normalized.npc_boost_acceleration = deriveNpcProfile.acceleration
        normalized.npc_boost_cooldown = deriveNpcProfile.cooldown
    }

    const userBoostProfile = deriveBoostProfile(
        normalized.user_base_speed,
        normalized.user_boost_distance,
        normalized.user_boost_duration_ms
    )
    normalized.user_boost_distance = userBoostProfile.distance
    normalized.user_boost_duration_ms = userBoostProfile.durationMs
    normalized.user_max_boost_speed = userBoostProfile.maxSpeed
    normalized.user_boost_acceleration = userBoostProfile.acceleration
    normalized.user_boost_cooldown = userBoostProfile.cooldown
    normalized.character_settings = normalizedCharacterSettings
    return normalized
}

// 설정 파일을 읽어 정규화된 게임플레이 설정 객체를 반환한다.
// 파일 읽기 또는 파싱에 실패하면 DEFAULT_SETTINGS 의 복사본을 반환한다.
// 반환값: 정규화된 게임플레이 설정 객체
function getGameplaySettings() {
    try {
        // 서버는 시작 시 이 파일을 한 번 읽고 사용한다.
        // 값을 바꾼 뒤 즉시 반영하려면 프로세스 재시작이 필요하다.
        const raw = fs.readFileSync(SETTINGS_PATH, "utf-8")
        return normalizeSettings(JSON.parse(raw))
    } catch (error) {
        return { ...DEFAULT_SETTINGS }
    }
}

module.exports = {
    DEFAULT_SETTINGS,
    SETTINGS_PATH,
    getGameplaySettings
}
