class SpatialGrid {
    constructor(size) {
        // 월드를 고정 크기 셀로 나눈 단순 공간 분할 구조.
        // 매 틱 전체 플레이어를 모두 훑지 않고, 주변 셀만 조회하기 위해 쓴다.
        this.size = size
        this.cells = new Map()
    }

    getCell(x, y) {
        const cx = Math.floor(x / this.size)
        const cy = Math.floor(y / this.size)

        return `${cx}:${cy}`
    }

    add(player) {
        const key = this.getCell(player.x, player.y)

        if (!this.cells.has(key)) {
            this.cells.set(key, new Set())
        }

        this.cells.get(key).add(player)
        player.cell = key
    }

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
