class SpatialGrid {
    // 공간 분할 그리드를 초기화한다.
    // size: 각 셀의 한 변 길이(픽셀 단위)
    constructor(size) {
        // 월드를 고정 크기 셀로 나눈 단순 공간 분할 구조.
        // 매 틱 전체 플레이어를 모두 훑지 않고, 주변 셀만 조회하기 위해 쓴다.
        this.size = size
        this.cells = new Map()
    }

    // 월드 좌표 (x, y)를 셀 좌표 { cx, cy } 로 변환한다.
    // x, y: 월드 좌표
    // 반환값: { cx, cy } 정수 셀 좌표
    getCellCoords(x, y) {
        return {
            cx: Math.floor(x / this.size),
            cy: Math.floor(y / this.size)
        }
    }

    // 셀 좌표 (cx, cy) 를 Map 키로 쓸 정수로 변환한다.
    // 문자열 생성 비용을 없애기 위해 정수 연산만 사용한다.
    // cx, cy: 정수 셀 좌표
    // 반환값: 정수 셀 키
    cellKey(cx, cy) {
        return cx * 100003 + cy
    }

    // 플레이어를 현재 위치에 해당하는 셀에 추가하고 player.cell / player.cellX / player.cellY 를 갱신한다.
    // player: 그리드에 등록할 플레이어 객체
    add(player) {
        const { cx, cy } = this.getCellCoords(player.x, player.y)
        const key = this.cellKey(cx, cy)

        if (!this.cells.has(key)) {
            this.cells.set(key, new Set())
        }

        this.cells.get(key).add(player)
        player.cell = key
        player.cellX = cx
        player.cellY = cy
    }

    // 플레이어의 현재 위치를 기준으로 셀이 바뀌었을 때만 그리드 내 위치를 갱신한다.
    // player: 이동한 플레이어 객체
    move(player) {
        const { cx, cy } = this.getCellCoords(player.x, player.y)
        const newKey = this.cellKey(cx, cy)

        if (newKey === player.cell) return

        // 셀이 바뀐 경우에만 기존 셀에서 제거하고 새 셀에 넣는다.
        this.cells.get(player.cell)?.delete(player)

        if (!this.cells.has(newKey)) {
            this.cells.set(newKey, new Set())
        }

        this.cells.get(newKey).add(player)
        player.cell = newKey
        player.cellX = cx
        player.cellY = cy
    }

    // 플레이어를 그리드에서 제거하고, 셀이 비면 셀 항목도 삭제한다.
    // player: 제거할 플레이어 객체
    remove(player) {
        if (!player || player.cell == null) {
            return
        }

        const cell = this.cells.get(player.cell)
        if (!cell) {
            player.cell = null
            return
        }

        cell.delete(player)
        if (cell.size === 0) {
            this.cells.delete(player.cell)
        }

        player.cell = null
    }

    // 플레이어 주변 셀 범위 내의 모든 플레이어 배열을 반환한다.
    // player: 기준 플레이어 객체
    // radius: 탐색 반경 (셀 단위, 기본값 1 → 3x3 범위)
    // 반환값: 주변 플레이어 객체 배열 (중복 없음)
    getNearby(player, radius = 1) {
        if (!player || player.cell == null) {
            return []
        }

        // radius=2 면 현재 셀 기준 5x5 셀 범위를 가져온다.
        // seenIds 로 중복 삽입을 막는다.
        // player.cellX / player.cellY 를 직접 읽어 문자열 파싱 없이 처리한다.
        const cx = player.cellX
        const cy = player.cellY
        const result = []
        const seenIds = new Set()

        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const key = this.cellKey(cx + dx, cy + dy)
                const cell = this.cells.get(key)

                if (!cell) continue

                cell.forEach((p) => {
                    if (seenIds.has(p.id)) {
                        return
                    }

                    seenIds.add(p.id)
                    result.push(p)
                })
            }
        }

        return result
    }
}

module.exports = SpatialGrid
