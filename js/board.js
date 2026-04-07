export const GRID_SIZE = 11;
export const TOTAL_TILES = GRID_SIZE * GRID_SIZE;

export const Board = {
    tiles: [],

    init() {
        this.tiles = [];
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                this.tiles.push({ x, y, owner: null, trail: null });
            }
        }
    },

    getTile(x, y) {
        if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return null;
        return this.tiles[y * GRID_SIZE + x];
    },

    setOwner(x, y, playerId) {
        const tile = this.getTile(x, y);
        if (tile) {
            tile.owner = playerId;
            tile.trail = null;
        }
    },

    setTrail(x, y, playerId) {
        const tile = this.getTile(x, y);
        if (tile) tile.trail = playerId;
    },

    clearTrail(playerId) {
        for (const tile of this.tiles) {
            if (tile.trail === playerId) tile.trail = null;
        }
    },

    getTrailTiles(playerId) {
        return this.tiles.filter(t => t.trail === playerId);
    },

    getTerritoryTiles(playerId) {
        return this.tiles.filter(t => t.owner === playerId);
    },

    countTerritory(playerId) {
        return this.tiles.filter(t => t.owner === playerId).length;
    },

    claimTerritory(x, y, playerId) {
        this.setOwner(x, y, playerId);
    },

    /**
     * When a trail reconnects to territory, claim the trail tiles
     * and flood-fill to find enclosed unclaimed tiles.
     */
    claimLoop(playerId) {
        const trailTiles = this.getTrailTiles(playerId);

        for (const t of trailTiles) {
            this.setOwner(t.x, t.y, playerId);
        }

        const enclosed = this.findEnclosedTiles(playerId);
        for (const t of enclosed) {
            this.setOwner(t.x, t.y, playerId);
        }

        return trailTiles.length + enclosed.length;
    },

    /**
     * Flood fill from edges to find tiles NOT reachable from outside
     * the player's territory boundary. Those tiles are enclosed.
     */
    findEnclosedTiles(playerId) {
        const boundary = new Set();
        for (const tile of this.tiles) {
            if (tile.owner === playerId) {
                boundary.add(`${tile.x},${tile.y}`);
            }
        }

        const visited = new Set();
        const queue = [];

        for (let x = 0; x < GRID_SIZE; x++) {
            for (let y = 0; y < GRID_SIZE; y++) {
                if (x === 0 || x === GRID_SIZE - 1 || y === 0 || y === GRID_SIZE - 1) {
                    const key = `${x},${y}`;
                    if (!boundary.has(key)) {
                        visited.add(key);
                        queue.push({ x, y });
                    }
                }
            }
        }

        const dirs = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
        while (queue.length > 0) {
            const { x, y } = queue.shift();
            for (const { dx, dy } of dirs) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
                const key = `${nx},${ny}`;
                if (visited.has(key) || boundary.has(key)) continue;
                visited.add(key);
                queue.push({ x: nx, y: ny });
            }
        }

        const enclosed = [];
        for (const tile of this.tiles) {
            const key = `${tile.x},${tile.y}`;
            if (!visited.has(key) && tile.owner !== playerId) {
                enclosed.push(tile);
            }
        }
        return enclosed;
    },

    setStartTerritory(cx, cy, playerId) {
        this.setOwner(cx, cy, playerId);
    }
};
