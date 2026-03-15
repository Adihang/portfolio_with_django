/**
 * worldNpc.js — 네르 NPC 스폰·AI·데미지 처리 믹스인
 *
 * 네르(Ner)는 게임의 주요 보스 NPC이다.
 * idle → windup → charging → rest 사이클로 플레이어를 추격·돌진하며,
 * 체력 구간에 따라 페이즈(1~3)가 올라갈수록 공격 패턴이 강화된다.
 * 인카운터 스테이지에 따라 여러 마리가 동시에 출현할 수 있다.
 */
const { WORLD_SIZE } = require("../config/config")
const {
    NPC_ID,
    NPC_PHASE_THREE_TRIGGER_DISTANCE_MULTIPLIER,
    NPC_DEFEAT_BOUNCE_MULTIPLIER,
} = require("../config/constants")
const {
    getNpcBaseSpeed,
    getBaseSpeedForPlayer,
    getCollisionSlowSpeedForPlayer,
    isPersistentHumanPlayer,
    getNpcPhase,
    getPlayerAttackDamageScale,
} = require("./worldHelpers")
const {
    NPC_BASE_SPEED_PER_SECOND,
    NPC_MAX_HEALTH,
    NPC_CHARGE_TRIGGER_DISTANCE,
    NPC_CHARGE_DISTANCE_MULTIPLIER,
    NPC_EXTRA_CHARGE_DISTANCE_MULTIPLIER,
    NPC_CHARGE_WINDUP_DURATION_MS,
    NPC_REST_DURATION_MS,
    NPC_DAMAGE_MIN,
    NPC_DAMAGE_MAX,
} = require("./worldSettings")
const { getMaxBoostedSpeedForPlayer } = require("./worldHelpers")
const { postStatsUpdate } = require("../services/accountStats")
const Player = require("./player")

module.exports = {
    /**
     * 기본 위치에 네르 NPC를 스폰한다.
     * @returns {Player} 생성(또는 기존)된 네르 NPC 플레이어 객체
     */
    addNerNpcPlayer() {
        return this.spawnNerNpcPlayer(NPC_ID, {
            x: WORLD_SIZE / 2 + 180,
            y: WORLD_SIZE / 2,
            speedMultiplier: 1,
        })
    },

    /**
     * 지정한 id/옵션으로 네르 NPC를 생성해 월드에 추가한다.
     * @param {string} id - NPC 고유 식별자
     * @param {Object} [options={}] - 스폰 옵션 (x, y, speedMultiplier, encounterVariant 등)
     * @returns {Player} 생성(또는 기존)된 네르 NPC 플레이어 객체
     */
    spawnNerNpcPlayer(id, options = {}) {
        if (this.players.has(id)) {
            return this.players.get(id)
        }

        const player = new Player(id)
        player.x = Number(options.x || WORLD_SIZE / 2)
        player.y = Number(options.y || WORLD_SIZE / 2)
        player.isNpc = true
        player.npcSpeedMultiplier = Math.max(0.1, Number(options.speedMultiplier || 1))
        player.npcEncounterVariant = String(options.encounterVariant || "").trim()
        player.baseSpeed = NPC_BASE_SPEED_PER_SECOND * player.npcSpeedMultiplier
        player.currentSpeed = player.baseSpeed
        player.collisionSlowSpeed = getCollisionSlowSpeedForPlayer(player)
        player.npcState = "idle"
        player.npcPhase = 1
        player.npcMaxHealth = this.getScaledNpcMaxHealth()
        player.npcHealth = player.npcMaxHealth
        this.players.set(id, player)
        this.grid.add(player)

        return player
    },

    /**
     * 월드의 모든 네르 NPC를 제거한다.
     */
    removeNerPlayers() {
        for (const player of Array.from(this.players.values())) {
            if (!player.isNpc) {
                continue
            }
            this.grid.remove(player)
            this.players.delete(player.id)
        }
    },

    /**
     * 모든 네르 NPC 배열을 반환한다.
     * @returns {Player[]} isNpc 가 true 인 플레이어 배열
     */
    getNerPlayers() {
        return Array.from(this.players.values()).filter((player) => player.isNpc)
    },

    /**
     * 살아있는 네르 NPC 배열을 반환한다.
     * @returns {Player[]} 사망 상태가 아닌 네르 NPC 배열
     */
    getAliveNerPlayers() {
        return this.getNerPlayers().filter((player) => !this.isPlayerDead(player))
    },

    /**
     * 네르가 공격할 대상 플레이어를 선정한다.
     * 현재 타겟이 유효하면 유지하고, 아니면 살아 있는 인간 유저 중 가장 가까운 대상을 다시 선택한다.
     * @param {Player} player - 타겟을 선정할 네르 NPC
     * @returns {Player|null} 선정된 타겟 플레이어, 없으면 null
     */
    getNpcTarget(player) {
        if (!player || !player.isNpc) {
            return null
        }

        // 현재 타겟이 아직 유효하면 유지하고,
        // 아니면 살아 있는 인간 유저 중 하나를 다시 뽑는다.
        if (player.npcTargetId) {
            const existingTarget = this.players.get(player.npcTargetId)
            if (existingTarget && !existingTarget.isNpc && !existingTarget.isDummy && !existingTarget.isPumpkinNpc && !this.isPlayerDead(existingTarget)) {
                return existingTarget
            }
        }

        const candidates = Array.from(this.players.values()).filter((candidate) => (
            !candidate.isNpc && !candidate.isDummy && !candidate.isPumpkinNpc && !this.isPlayerDead(candidate)
        ))

        if (!candidates.length) {
            player.npcTargetId = ""
            return null
        }

        const targetedIds = new Set(
            this.getAliveNerPlayers()
                .filter((candidate) => candidate.id !== player.id && candidate.npcTargetId)
                .map((candidate) => String(candidate.npcTargetId || ""))
                .filter(Boolean)
        )
        const untargetedCandidates = candidates.filter((candidate) => !targetedIds.has(candidate.id))
        const targetPool = untargetedCandidates.length ? untargetedCandidates : candidates

        const nextTarget = targetPool.reduce((closestCandidate, candidate) => {
            if (!closestCandidate) {
                return candidate
            }
            const closestDistance = Math.hypot(closestCandidate.x - player.x, closestCandidate.y - player.y)
            const candidateDistance = Math.hypot(candidate.x - player.x, candidate.y - player.y)
            return candidateDistance < closestDistance ? candidate : closestCandidate
        }, null)
        player.npcTargetId = nextTarget.id
        return nextTarget
    },

    /**
     * 페이즈/variant에 따른 돌진 패턴 설정을 반환한다.
     * @param {Player} player - 네르 NPC 플레이어
     * @param {number} npcPhase - 현재 페이즈 (1~3)
     * @returns {{ queuedExtraCharges: number, instantExtraCharge: boolean }} 돌진 패턴 설정 객체
     */
    getNpcChargePattern(player, npcPhase) {
        if (String(player && player.npcEncounterVariant || "") !== "doorboss") {
            return {
                queuedExtraCharges: npcPhase >= 2 ? 1 : 0,
                instantExtraCharge: npcPhase >= 3,
            }
        }

        if (npcPhase >= 3) {
            return {
                queuedExtraCharges: 1,
                instantExtraCharge: true,
            }
        }
        if (npcPhase >= 2) {
            return {
                queuedExtraCharges: 1,
                instantExtraCharge: false,
            }
        }
        return {
            queuedExtraCharges: 0,
            instantExtraCharge: false,
        }
    },

    /**
     * 네르의 돌진 스킬을 시작한다.
     * 시작 순간 방향과 총 이동 거리를 고정하고 windup 또는 charging 상태로 전환한다.
     * @param {Player} player - 돌진을 시작할 네르 NPC
     * @param {number} diffX - 타겟까지의 X 방향 차이
     * @param {number} diffY - 타겟까지의 Y 방향 차이
     * @param {number} distance - 타겟까지의 거리
     * @param {Object} [options={}] - 돌진 옵션 (queueExtraCharge, instant, distanceMultiplier, targetId, isPhaseAttack 등)
     * @returns {{ dx: number, dy: number }} 이 틱의 이동 벡터 (항상 0)
     */
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
        player.currentSpeed = getNpcBaseSpeed(player)
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
        const chargePattern = this.getNpcChargePattern(player, npcPhase)
        player.npcQueuedExtraCharges = queueExtraCharge ? chargePattern.queuedExtraCharges : 0

        return { dx: 0, dy: 0 }
    },

    /**
     * 매 틱마다 네르 AI 상태를 갱신하고 이동 벡터를 반환한다.
     * idle → chase → windup → charging → rest 상태 머신을 구동한다.
     * @param {Player} player - 갱신할 네르 NPC
     * @param {number} now - 현재 타임스탬프 (ms)
     * @returns {{ dx: number, dy: number }} 정규화된 이동 방향 벡터
     */
    updateNpc(player, now) {
        if (!player || !player.isNpc) {
            return { dx: 0, dy: 0 }
        }

        const previousPhase = Math.max(1, Number(player.npcPhase || 1))
        player.npcPhase = getNpcPhase(player)
        const npcPhase = player.npcPhase
        if (npcPhase > previousPhase) {
            this.lastTrackedNerCombatPhase = npcPhase
            this.respawnNeutralPumpkinNpc()
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
            player.currentSpeed = getNpcBaseSpeed(player)
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
                    const chargePattern = this.getNpcChargePattern(player, npcPhase)
                    const instantExtraCharge = chargePattern.instantExtraCharge
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
            player.currentSpeed = getNpcBaseSpeed(player)
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
    },

    /**
     * 유저가 네르에게 가하는 데미지를 계산한다.
     * 현재 이동 속도와 최대 부스트 속도의 비율에 따라 최솟값~최댓값 사이로 선형 보간한다.
     * @param {Player} attacker - 공격하는 유저 플레이어
     * @returns {number} 계산된 데미지 값 (0 이상의 정수)
     */
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

        const baseDamage = Math.max(
            NPC_DAMAGE_MIN,
            Math.min(
                NPC_DAMAGE_MAX,
                Math.round(NPC_DAMAGE_MIN + (NPC_DAMAGE_MAX - NPC_DAMAGE_MIN) * speedRatio)
            )
        )

        return Math.max(1, Math.round(baseDamage * getPlayerAttackDamageScale(attacker)))
    },

    /**
     * 충돌로 인한 데미지를 네르에게 적용한다.
     * 카운터 공격 조건이 충족되면 통계를 기록하고, 체력이 0이 되면 사망을 트리거한다.
     * @param {Player} targetNpc - 데미지를 받을 네르 NPC
     * @param {Player} attacker - 공격한 플레이어
     * @param {number} now - 현재 타임스탬프 (ms)
     */
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
    },

    /**
     * 페이즈 공격이 벽/방어로 회피됐음을 기록한다.
     * 회피 조건을 충족하면 카운터 윈도우를 열어 반격 기회를 부여한다.
     * @param {Player} player - 돌진 스킬을 사용한 네르 NPC
     */
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
    },
}
