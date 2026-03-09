const fs = require("fs")
const path = require("path")

// Django 관리 페이지에서 바꾸는 공용 수치와 1:1로 맞춰지는 기본값.
// 파일을 읽지 못하더라도 서버가 죽지 않게 항상 fallback 을 제공한다.
const DEFAULT_SETTINGS = {
    user_base_speed: 225,
    user_max_boost_speed: 420,
    user_boost_acceleration: 360,
    user_boost_cooldown: 280,
    user_lives: 3,
    npc_base_speed: 225,
    npc_max_health: 20,
    npc_charge_trigger_distance: 240,
    npc_charge_windup_ms: 500,
    npc_rest_ms: 1800,
    npc_max_boost_speed: 1687.5,
    npc_boost_acceleration: 1350,
    npc_boost_cooldown: 1008,
    npc_respawn_delay_ms: 60000,
    npc_damage_min: 1,
    npc_damage_max: 5,
    npc_damage_speed_divisor: 8
}

const SETTINGS_PATH = process.env.BUMPERCAR_SPIKY_SETTINGS_PATH ||
    path.resolve(__dirname, "../../config/bumpercar_spiky_settings.json")

function normalizeSettings(rawSettings) {
    const normalized = { ...DEFAULT_SETTINGS }
    if (!rawSettings || typeof rawSettings !== "object") {
        return normalized
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

    // 게임이 깨지지 않게 각 값에 최소 범위를 적용한다.
    normalized.user_base_speed = Math.max(1, normalized.user_base_speed)
    normalized.user_max_boost_speed = Math.max(normalized.user_base_speed, normalized.user_max_boost_speed)
    normalized.user_boost_acceleration = Math.max(1, normalized.user_boost_acceleration)
    normalized.user_boost_cooldown = Math.max(1, normalized.user_boost_cooldown)
    normalized.user_lives = Math.max(1, Math.round(normalized.user_lives))
    normalized.npc_base_speed = Math.max(1, normalized.npc_base_speed)
    normalized.npc_max_health = Math.max(1, Math.round(normalized.npc_max_health))
    normalized.npc_charge_trigger_distance = Math.max(1, normalized.npc_charge_trigger_distance)
    normalized.npc_charge_windup_ms = Math.max(0, Math.round(normalized.npc_charge_windup_ms))
    normalized.npc_rest_ms = Math.max(0, Math.round(normalized.npc_rest_ms))
    normalized.npc_max_boost_speed = Math.max(normalized.npc_base_speed, normalized.npc_max_boost_speed)
    normalized.npc_boost_acceleration = Math.max(1, normalized.npc_boost_acceleration)
    normalized.npc_boost_cooldown = Math.max(1, normalized.npc_boost_cooldown)
    normalized.npc_respawn_delay_ms = Math.max(1000, Math.round(normalized.npc_respawn_delay_ms))
    normalized.npc_damage_min = Math.max(1, Math.round(normalized.npc_damage_min))
    normalized.npc_damage_max = Math.max(normalized.npc_damage_min, Math.round(normalized.npc_damage_max))
    normalized.npc_damage_speed_divisor = Math.max(0.1, normalized.npc_damage_speed_divisor)

    return normalized
}

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
