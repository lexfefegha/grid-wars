import { GRID_SIZE, Board } from './board.js';

export const DIRECTIONS = {
    up:    { dx:  0, dy: -1 },
    down:  { dx:  0, dy:  1 },
    left:  { dx: -1, dy:  0 },
    right: { dx:  1, dy:  0 },
};

export function createPlayer(id, startX, startY, colour, startDirection) {
    return {
        id,
        x: startX,
        y: startY,
        colour,
        direction: startDirection,
        nextDirection: startDirection,
        score: 0,
        kills: 0,
        alive: true,
        eliminated: false,
        respawnTimer: 0,
        trail: [],
    };
}

function isOnOwnTerritory(player) {
    const tile = Board.getTile(player.x, player.y);
    return tile && tile.owner === player.id;
}

export function movePlayer(player, opponents) {
    if (!player.alive) {
        player.respawnTimer--;
        if (player.respawnTimer <= 0) {
            respawnPlayer(player);
        }
        return;
    }

    player.direction = player.nextDirection;
    const { dx, dy } = DIRECTIONS[player.direction];
    let nx = player.x + dx;
    let ny = player.y + dy;

    nx = Math.max(0, Math.min(GRID_SIZE - 1, nx));
    ny = Math.max(0, Math.min(GRID_SIZE - 1, ny));

    const targetTile = Board.getTile(nx, ny);
    if (targetTile) {
        const isOpponentTerritory = targetTile.owner !== null &&
                                     targetTile.owner !== player.id;
        if (isOpponentTerritory) {
            nx = player.x;
            ny = player.y;
        }
    }

    if (targetTile && targetTile.trail === player.id && (nx !== player.x || ny !== player.y)) {
        killPlayer(player);
        return;
    }

    if (targetTile && targetTile.trail !== null && targetTile.trail !== player.id) {
        const victim = opponents.find(p => p.id === targetTile.trail);
        if (victim) {
            killPlayer(victim);
            player.kills++;
        }
    }

    for (const opp of opponents) {
        if (opp.alive && opp.x === nx && opp.y === ny) {
            const playerOnTrail = !isOnOwnTerritory(player);
            const oppOnTrail = !isOnOwnTerritory(opp);
            if (playerOnTrail && oppOnTrail) {
                killPlayer(player);
                killPlayer(opp);
                return;
            }
        }
    }

    player.x = nx;
    player.y = ny;

    const currentTile = Board.getTile(player.x, player.y);
    if (!currentTile) return;

    if (currentTile.owner === player.id) {
        if (player.trail.length > 0) {
            Board.claimLoop(player.id);
            player.trail = [];
        }
    } else {
        if (currentTile.trail !== player.id) {
            Board.setTrail(player.x, player.y, player.id);
            player.trail.push({ x: player.x, y: player.y });
        }
    }

    player.score = Board.countTerritory(player.id);
}

export function isTrapped(player) {
    if (!player.alive) return false;
    for (const { dx, dy } of Object.values(DIRECTIONS)) {
        const nx = player.x + dx;
        const ny = player.y + dy;
        if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
        const tile = Board.getTile(nx, ny);
        if (!tile) continue;
        const blocked = tile.owner !== null && tile.owner !== player.id;
        if (!blocked) return false;
    }
    return true;
}

function killPlayer(player) {
    player.alive = false;
    player.respawnTimer = 3;
    Board.clearTrail(player.id);
    player.trail = [];
}

function respawnPlayer(player) {
    const territoryTiles = Board.getTerritoryTiles(player.id);
    if (territoryTiles.length > 0) {
        const spawn = territoryTiles[Math.floor(Math.random() * territoryTiles.length)];
        player.x = spawn.x;
        player.y = spawn.y;
        player.alive = true;
        player.score = Board.countTerritory(player.id);
        return;
    }

    const unclaimed = Board.tiles.filter(t => t.owner === null && t.trail === null);
    if (unclaimed.length === 0) {
        player.alive = false;
        player.eliminated = true;
        return;
    }

    const candidates = unclaimed.filter(t =>
        t.x < GRID_SIZE - 1 && t.y < GRID_SIZE - 1 &&
        Board.getTile(t.x + 1, t.y)?.owner === null &&
        Board.getTile(t.x, t.y + 1)?.owner === null &&
        Board.getTile(t.x + 1, t.y + 1)?.owner === null
    );
    if (candidates.length > 0) {
        const spot = candidates[Math.floor(Math.random() * candidates.length)];
        Board.setOwner(spot.x, spot.y, player.id);
        Board.setOwner(spot.x + 1, spot.y, player.id);
        Board.setOwner(spot.x, spot.y + 1, player.id);
        Board.setOwner(spot.x + 1, spot.y + 1, player.id);
        player.x = spot.x;
        player.y = spot.y;
    } else {
        const any = unclaimed[Math.floor(Math.random() * unclaimed.length)];
        player.x = any.x;
        player.y = any.y;
        Board.setOwner(any.x, any.y, player.id);
    }
    player.alive = true;
    player.score = Board.countTerritory(player.id);
}
