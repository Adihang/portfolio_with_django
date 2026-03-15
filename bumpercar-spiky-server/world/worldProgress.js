/**
 * worldProgress.js
 * 플레이어 진행 상태(progress) 영속성 관리 모듈.
 * 연결이 끊어진 뒤에도 플레이어의 상태를 보존하고 재접속 시 복원할 수 있도록
 * playerProgress 맵에 데이터를 저장/조회하는 함수들을 제공한다.
 */

const { NPC_ID, DUMMY_SPECS, DOUBLE_UNIT_COUNT } = require("../config/constants")
const { getBaseSpeedForPlayer } = require("./worldHelpers")

module.exports = {
    /**
     * connectionKey에 대응하는 저장된 플레이어 진행 상태를 반환한다.
     * 저장된 데이터가 없거나 key가 없으면 null을 반환한다.
     * @param {string} connectionKey
     * @returns {object|null}
     */
    getStoredPlayerProgress(connectionKey) {
        if (!connectionKey) {
            return null
        }
        return this.playerProgress.get(connectionKey) || null
    },

    /**
     * 현재 플레이어 상태를 playerProgress 맵에 저장한다.
     * NPC·더미 플레이어는 저장 대상에서 제외하며,
     * 연결이 끊겨도 유지돼야 하는 최소 정보만 직렬화하여 보존한다.
     * @param {object} player
     */
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
            initialSkinName: player.initialSkinName || player.skinName || "default",
            pumpkinEliminated: Boolean(player.pumpkinEliminated),
            pumpkinNtrTriggerCount: Number(player.pumpkinNtrTriggerCount || 0),
            pumpkinBaseSkinName: String(player.pumpkinBaseSkinName || ""),
            pumpkinBaseDoubleHealth: Number(player.pumpkinBaseDoubleHealth || 0),
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
    },

    /**
     * connectionKey에 대한 게스트 표시 ID를 반환한다.
     * 이미 저장된 진행 상태에 displayId가 있으면 그것을 그대로 반환하고,
     * 없으면 현재 미사용 번호를 찾아 "스핔이N" 형식의 새 ID를 생성하여 반환한다.
     * @param {string} connectionKey
     * @returns {string}
     */
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
    },
}
