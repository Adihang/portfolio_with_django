/**
 * worldSpawn.js
 * 플레이어 스폰 위치 계산 관련 유틸리티 모듈.
 * 월드 가장자리 또는 특정 사분면 내에서 랜덤 스폰 좌표를 생성하는 함수들을 제공한다.
 */

const { WORLD_SIZE } = require("../config/config")
const { RESPAWN_EDGE_PADDING } = require("../config/constants")

module.exports = {
    /**
     * 월드 전체 경계선(가장자리) 위에서 랜덤한 스폰 좌표를 반환한다.
     * 상/하/좌/우 네 변 중 하나를 무작위로 선택한 뒤, 해당 변의 패딩 범위 안에서 좌표를 생성한다.
     * @returns {{ x: number, y: number }}
     */
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
    },

    // 위치(x, y)가 속한 사분면을 1~4로 반환한다.
    // 1: 좌상, 2: 우상, 3: 좌하, 4: 우하
    /**
     * 주어진 좌표 (x, y)가 월드의 몇 번 사분면에 속하는지 반환한다.
     * 사분면 번호: 1=좌상, 2=우상, 3=좌하, 4=우하
     * @param {number} x
     * @param {number} y
     * @returns {1|2|3|4}
     */
    getQuadrantFromPosition(x, y) {
        const mid = WORLD_SIZE / 2
        if (x < mid && y < mid) return 1
        if (x >= mid && y < mid) return 2
        if (x < mid && y >= mid) return 3
        return 4
    },

    // 지정한 사분면의 가장자리에서 랜덤 위치를 반환한다.
    // 각 사분면은 두 변(세로/가로)을 가지며 그 중 하나를 무작위로 선택한다.
    /**
     * 지정한 사분면(1~4)의 가장자리(두 변 중 하나) 위에서 랜덤 스폰 좌표를 반환한다.
     * 세로 변 또는 가로 변 중 하나를 50% 확률로 선택한 뒤 좌표를 생성한다.
     * @param {1|2|3|4} quadrant
     * @returns {{ x: number, y: number }}
     */
    getRandomEdgeSpawnPositionInQuadrant(quadrant) {
        const padding = RESPAWN_EDGE_PADDING
        const mid = WORLD_SIZE / 2
        const useSideEdge = Math.random() < 0.5

        if (quadrant === 1) {
            if (useSideEdge) return { x: padding, y: padding + Math.random() * Math.max(0, mid - padding) }
            return { x: padding + Math.random() * Math.max(0, mid - padding), y: padding }
        }
        if (quadrant === 2) {
            if (useSideEdge) return { x: WORLD_SIZE - padding, y: padding + Math.random() * Math.max(0, mid - padding) }
            return { x: mid + Math.random() * Math.max(0, WORLD_SIZE - padding - mid), y: padding }
        }
        if (quadrant === 3) {
            if (useSideEdge) return { x: padding, y: mid + Math.random() * Math.max(0, WORLD_SIZE - padding - mid) }
            return { x: padding + Math.random() * Math.max(0, mid - padding), y: WORLD_SIZE - padding }
        }
        // quadrant === 4
        if (useSideEdge) return { x: WORLD_SIZE - padding, y: mid + Math.random() * Math.max(0, WORLD_SIZE - padding - mid) }
        return { x: mid + Math.random() * Math.max(0, WORLD_SIZE - padding - mid), y: WORLD_SIZE - padding }
    },

    /**
     * 지정한 사분면(1~4) 내부 어디서든 랜덤한 스폰 좌표를 반환한다.
     * 가장자리가 아닌 사분면 전체 영역(패딩 제외) 안에서 좌표를 생성한다.
     * @param {1|2|3|4} quadrant
     * @returns {{ x: number, y: number }}
     */
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
    },
}
