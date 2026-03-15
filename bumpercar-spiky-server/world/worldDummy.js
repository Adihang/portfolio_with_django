/**
 * worldDummy.js — 더미 플레이어 AI 믹스인
 *
 * 더미는 인간 유저에게 피격됐을 때만 반응하는 고정 위치 연습 상대이다.
 * 평소에는 idle 상태로 대기하다가, 유저에게 맞으면 dummyRetaliationTargetId 를 기록하고
 * 윈드업 → 돌진(charge) → rest 사이클을 반복한다.
 * 더미의 공격 패턴은 dummyPhase(1~3)에 따라 강화된다.
 */

const {
    NPC_PHASE_THREE_TRIGGER_DISTANCE_MULTIPLIER,
    DUMMY_RETALIATION_DISTANCE_MULTIPLIER,
    DUMMY_SPECS,
} = require("../config/constants")
const { getBaseSpeedForPlayer, getCollisionSlowSpeedForPlayer, getDummyPhase, isPersistentHumanPlayer } = require("./worldHelpers")
const { DUMMY_BASE_SPEED_PER_SECOND, NPC_CHARGE_TRIGGER_DISTANCE, NPC_REST_DURATION_MS, NPC_EXTRA_CHARGE_DISTANCE_MULTIPLIER, NPC_CHARGE_WINDUP_DURATION_MS } = require("./worldSettings")
const { postStatsUpdate } = require("../services/accountStats")

module.exports = {
    /**
     * DUMMY_SPECS 에 정의된 더미 플레이어들을 월드에 추가한다.
     * 이미 존재하는 더미는 건너뛴다.
     */
    addDummyPlayers() {
        DUMMY_SPECS.forEach((dummySpec) => {
            if (this.players.has(dummySpec.id)) {
                return
            }

            const Player = require("./player")
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
    },

    /**
     * 더미의 보복 대상 플레이어를 반환한다.
     * 대상이 없거나 사망·NPC·더미이면 null 을 반환하고 targetId 를 초기화한다.
     * @param {object} player - 더미 플레이어
     * @returns {object|null} 보복 대상 플레이어 또는 null
     */
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
    },

    /**
     * 더미가 보복 대상을 향해 돌진을 시작한다.
     * dummyPhase 에 따라 3단계는 즉시 charging, 1·2단계는 windup 후 charging 으로 진입한다.
     * @param {object} player - 더미 플레이어
     * @param {object} target - 보복 대상 플레이어
     */
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
    },

    /**
     * 매 틱마다 더미 AI 상태를 갱신하고 이동 방향 벡터(dx, dy)를 반환한다.
     * 보복 대상이 없으면 idle, 있으면 rest → windup → charging → chase 사이클을 처리한다.
     * @param {object} player - 더미 플레이어
     * @returns {{ dx: number, dy: number }} 이동 방향 벡터 (단위 벡터 또는 0)
     */
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
    },
}
