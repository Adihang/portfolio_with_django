class SpatialGrid {
    // 공간 분할 그리드를 초기화한다.
    // size: 각 셀의 한 변 길이(픽셀 단위)
    constructor(size) {
        // 월드를 고정 크기 셀로 나눈 단순 공간 분할 구조.
        // 매 틱 전체 플레이어를 모두 훑지 않고, 주변 셀만 조회하기 위해 쓴다.
        this.size = size
        this.cells = new Map()
    }

    // 월드 좌표 (x, y)가 속하는 셀 키 문자열을 반환한다.
    // x, y: 월드 좌표
    // 반환값: "cx:cy" 형식의 셀 키 문자열
    getCell(x, y) {
        const cx = Math.floor(x / this.size)
        const cy = Math.floor(y / this.size)

        return `${cx}:${cy}`
    }

    // 플레이어를 현재 위치에 해당하는 셀에 추가하고 player.cell 을 갱신한다.
    // player: 그리드에 등록할 플레이어 객체
    add(player) {
        const key = this.getCell(player.x, player.y)

        if (!this.cells.has(key)) {
            this.cells.set(key, new Set())
        }

        this.cells.get(key).add(player)
        player.cell = key
    }

    // 플레이어의 현재 위치를 기준으로 셀이 바뀌었을 때만 그리드 내 위치를 갱신한다.
    // player: 이동한 플레이어 객체
    move(player) {
        const newKey = this.getCell(player.x, player.y)

        if (newKey === player.cell) return

        // 셀이 바뀐 경우에만 기존 셀에서 제거하고 새 셀에 넣는다.
        this.cells.get(player.cell)?.delete(player)

        if (!this.cells.has(newKey)) {
            this.cells.set(newKey, new Set())
        }

        this.cells.get(newKey).add(player)
        player.cell = newKey
    }

    // 플레이어를 그리드에서 제거하고, 셀이 비면 셀 항목도 삭제한다.
    // player: 제거할 플레이어 객체
    remove(player) {
        if (!player || !player.cell) {
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
        if (!player || !player.cell) {
            return []
        }

        // radius=2 면 현재 셀 기준 5x5 셀 범위를 가져온다.
        // seenIds 로 중복 삽입을 막는다.
        const [cx, cy] = player.cell.split(":").map(Number)
        const result = []
        const seenIds = new Set()

        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                const key = `${cx + dx}:${cy + dy}`
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
