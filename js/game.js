import { GRID_SIZE, TOTAL_TILES, Board } from './board.js';
import { DIRECTIONS, createPlayer, movePlayer, isTrapped } from './player.js';
import { FirebaseService } from './firebase.js';
import { Sound } from './sound.js';
import { Touch } from './touch.js';

export const TICK_MS = 300;
export const PLAYER_COLOURS = {
    player1: { territory: '#E8C4B8', trail: 'rgba(196,88,58,0.18)', trailLine: '#C4583A', circle: '#C4583A' },
    player2: { territory: '#B8DED5', trail: 'rgba(58,124,110,0.18)', trailLine: '#3A7C6E', circle: '#3A7C6E' },
};
const GRID_BG = '#F5F0EB';
const GRID_LINE = 'rgba(44,36,32,0.07)';
const EMPTY_TILE = '#FFFDF9';

let _notifTimer = null;
function showNotification(text, type = 'death') {
    const el = document.getElementById('game-notification');
    if (!el) return;
    clearTimeout(_notifTimer);
    el.textContent = text;
    el.className = `game-notification notif-${type} show`;
    _notifTimer = setTimeout(() => {
        el.classList.remove('show');
    }, 1500);
}

export const Game = {
    canvas: null,
    ctx: null,
    tileSize: 0,

    players: [],
    localPlayerId: null,
    debugMode: false,
    playerNames: { player1: 'Player 1', player2: 'Player 2' },
    tickInterval: null,
    animFrameId: null,
    running: false,

    lastTickTime: 0,
    previousPositions: {},

    timeRemaining: 60,
    timerInterval: null,
    gameState: 'idle',
    onGameEnd: null,

    paused: false,

    claimFlashTiles: [],
    claimFlashTime: 0,
    shakeAmount: 0,
    shakeTime: 0,

    init(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        Board.init();
    },

    resize() {
        const hPad = 24;
        const isTouchDevice = matchMedia('(hover: none) and (pointer: coarse)').matches;
        const vReserve = isTouchDevice ? 210 : 120;
        const maxSize = Math.min(window.innerWidth - hPad, window.innerHeight - vReserve, 600);
        const size = Math.max(maxSize, 200);
        this.canvas.width = size;
        this.canvas.height = size;
        this.tileSize = size / GRID_SIZE;
    },

    setupInput() {
        const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };

        if (this.debugMode) {
            const p1Keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
            const p2Keys = { w: 'up', s: 'down', a: 'left', d: 'right' };

            this._keyHandler = (e) => {
                if (!this.running) return;
                const p1Dir = p1Keys[e.key];
                const p2Dir = p2Keys[e.key];
                if (p1Dir) {
                    e.preventDefault();
                    const p1 = this.players.find(p => p.id === 'player1');
                    if (p1 && opposites[p1Dir] !== p1.direction) p1.nextDirection = p1Dir;
                } else if (p2Dir) {
                    e.preventDefault();
                    const p2 = this.players.find(p => p.id === 'player2');
                    if (p2 && opposites[p2Dir] !== p2.direction) p2.nextDirection = p2Dir;
                }
            };
        } else {
            const keyMap = {
                ArrowUp: 'up', ArrowDown: 'down',
                ArrowLeft: 'left', ArrowRight: 'right',
                w: 'up', s: 'down', a: 'left', d: 'right',
            };
            this._keyHandler = (e) => {
                const dir = keyMap[e.key];
                if (!dir || !this.running) return;
                e.preventDefault();
                const local = this.players.find(p => p.id === this.localPlayerId);
                if (local && opposites[dir] !== local.direction) {
                    local.nextDirection = dir;
                }
            };
        }
        document.addEventListener('keydown', this._keyHandler);

        this._pauseKeyHandler = (e) => {
            if (e.code === 'Space' && this.debugMode && this.gameState === 'playing') {
                e.preventDefault();
                this.togglePause();
            }
        };
        document.addEventListener('keydown', this._pauseKeyHandler);

        const timerBtn = document.getElementById('game-timer');
        this._pauseClickHandler = () => {
            if (this.debugMode && this.gameState === 'playing') {
                this.togglePause();
            }
        };
        timerBtn.addEventListener('click', this._pauseClickHandler);

        const oppositeMap = { up: 'down', down: 'up', left: 'right', right: 'left' };
        Touch.init((dir) => {
            if (!this.running) return;
            Sound.unlock();
            const target = this.debugMode
                ? this.players.find(p => p.id === 'player1')
                : this.players.find(p => p.id === this.localPlayerId);
            if (target && oppositeMap[dir] !== target.direction) {
                target.nextDirection = dir;
            }
        });
    },

    togglePause() {
        this.setPaused(!this.paused);
    },

    setPaused(paused) {
        this.paused = paused;
        this.running = !paused;

        const overlay = document.getElementById('pause-overlay');
        const timerEl = document.getElementById('game-timer');

        if (paused) {
            overlay.classList.remove('hidden');
            timerEl.classList.add('timer-paused');
        } else {
            overlay.classList.add('hidden');
            timerEl.classList.remove('timer-paused');
            this.lastTickTime = performance.now();
        }
    },

    start(localPlayerId) {
        this.localPlayerId = localPlayerId;
        Board.init();

        const p1 = createPlayer('player1', 3, 5, PLAYER_COLOURS.player1, 'left');
        Board.setStartTerritory(3, 5, 'player1');
        p1.score = Board.countTerritory('player1');

        const p2 = createPlayer('player2', 7, 5, PLAYER_COLOURS.player2, 'right');
        Board.setStartTerritory(7, 5, 'player2');
        p2.score = Board.countTerritory('player2');

        this.players = [p1, p2];

        for (const p of this.players) {
            this.previousPositions[p.id] = { x: p.x, y: p.y };
        }

        this.setupInput();

        if (this.debugMode) {
            FirebaseService.onWinnerChange((winner) => {
                if (winner && this.gameState === 'playing') this.endGame();
            });
        } else {
            this.setupSync();
        }

        this.gameState = 'playing';
        this.timeRemaining = 60;
        this.running = true;
        this.lastTickTime = performance.now();
        this.tickInterval = setInterval(() => this.tick(), TICK_MS);

        this.startTimer();

        this.renderLoop();
        this.updateHUDElements();
    },

    setupSync() {
        const opponentId = this.localPlayerId === 'player1' ? 'player2' : 'player1';

        FirebaseService.onOpponentChange(opponentId, (data) => {
            if (!data) return;
            const opp = this.players.find(p => p.id === opponentId);
            if (!opp) return;
            const local = this.players.find(p => p.id === this.localPlayerId);

            this.previousPositions[opp.id] = { x: opp.x, y: opp.y };

            if (data.position) {
                opp.x = data.position.x;
                opp.y = data.position.y;
            }
            if (data.direction) {
                opp.direction = data.direction;
                opp.nextDirection = data.direction;
            }
            if (data.alive !== undefined) {
                if (opp.alive && !data.alive) {
                    Board.clearTrail(opp.id);
                    opp.trail = [];
                }
                if (data.alive === true && opp._killedAt && Date.now() - opp._killedAt < 3000) {
                } else {
                    opp.alive = data.alive;
                }
            }
            if (data.score !== undefined) opp.score = data.score;

            if (data.trail !== undefined) {
                let trailArr = data.trail;
                if (trailArr && typeof trailArr === 'object' && !Array.isArray(trailArr)) {
                    trailArr = Object.values(trailArr);
                }
                if (Array.isArray(trailArr) && trailArr.length > 0) {
                    opp.trail = trailArr.map(p => ({ x: p.x, y: p.y }));
                } else {
                    opp.trail = [];
                }
            }

            if (data.kills !== undefined) {
                const prevKills = opp.kills;
                opp.kills = data.kills;
                if (data.kills > prevKills && local && local.alive) {
                    const trailTiles = Board.getTrailTiles(local.id);
                    local.alive = false;
                    local.respawnTimer = 5;
                    Board.clearTrail(local.id);
                    local.trail = [];
                    if (trailTiles.length > 0) {
                        const clearUpdates = {};
                        for (const t of trailTiles) {
                            clearUpdates[`${t.x}_${t.y}`] = { owner: t.owner, trail: null };
                        }
                        FirebaseService.updateBoard(clearUpdates);
                    }
                    this.triggerShake();
                    Sound.death();
                    showNotification(`Killed by ${this.playerNames[opp.id]}`, 'death');
                }
            }
        });

        FirebaseService.onBoardChange((boardData) => {
            if (!boardData) return;
            const local = this.players.find(p => p.id === this.localPlayerId);
            const localId = local ? local.id : null;

            const prevCounts = {};
            for (const p of this.players) {
                prevCounts[p.id] = Board.countTerritory(p.id);
            }

            const oppId = this.localPlayerId === 'player1' ? 'player2' : 'player1';

            for (const [key, val] of Object.entries(boardData)) {
                const [xStr, yStr] = key.split('_');
                const tile = Board.getTile(parseInt(xStr), parseInt(yStr));
                if (!tile) continue;

                tile.owner = val.owner || null;

                if (tile.trail === localId || val.trail === localId) {
                    continue;
                }
                const trailOwner = val.trail ? this.players.find(p => p.id === val.trail) : null;
                if (trailOwner && !trailOwner.alive) {
                    continue;
                }
                tile.trail = val.trail || null;
            }

            for (const p of this.players) {
                const newCount = Board.countTerritory(p.id);
                if (newCount > prevCounts[p.id] + 1) {
                    this.triggerClaimFlash(p.id);
                }
                p.score = newCount;
            }
            this.updateHUDElements();
        });

        FirebaseService.onWinnerChange((winner) => {
            if (winner && this.gameState === 'playing') {
                this.endGame();
            }
        });
    },

    startTimer() {
        this.timerInterval = setInterval(() => {
            if (!this.running || this.paused) return;
            this.timeRemaining--;
            FirebaseService.setTimeRemaining(this.timeRemaining);
            this.updateHUDElements();

            if (this.timeRemaining <= 0) {
                this.endGame();
            }
        }, 1000);
    },

    tick() {
        if (!this.running || this.paused) return;

        for (const p of this.players) {
            this.previousPositions[p.id] = { x: p.x, y: p.y };
        }
        this.lastTickTime = performance.now();

        if (this.debugMode) {
            this.tickDebug();
        } else {
            this.tickOnline();
        }

        const totalClaimed = this.players.reduce((sum, p) => sum + Board.countTerritory(p.id), 0);
        if (totalClaimed >= TOTAL_TILES) {
            this.endGame();
            return;
        }

        const dominated = this.players.find(p => Board.countTerritory(p.id) >= 100);
        if (dominated) {
            this.endGame();
            return;
        }

        const eliminated = this.players.find(p => p.eliminated);
        if (eliminated) {
            this.endGame();
            return;
        }

        const trapped = this.players.find(p => isTrapped(p));
        if (trapped) {
            this.endGame();
            return;
        }

        this.updateHUDElements();
    },

    tickDebug() {
        const p1 = this.players.find(p => p.id === 'player1');
        const p2 = this.players.find(p => p.id === 'player2');

        for (const player of [p1, p2]) {
            const opponents = this.players.filter(p => p.id !== player.id);
            const prevCount = Board.countTerritory(player.id);
            const prevKills = player.kills;
            const prevAlive = player.alive;

            movePlayer(player, opponents);

            if (player.kills > prevKills) Sound.kill();
            if (prevAlive && !player.alive) this.triggerShake();

            const newCount = Board.countTerritory(player.id);
            if (newCount > prevCount + 1) {
                this.triggerClaimFlash(player.id);
            }
            player.score = newCount;
        }

        const boardUpdates = {};
        for (const tile of Board.tiles) {
            boardUpdates[`${tile.x}_${tile.y}`] = { owner: tile.owner, trail: tile.trail };
        }
        FirebaseService.updateBoard(boardUpdates);
        FirebaseService.updatePlayerPosition(p1.id, p1.x, p1.y, p1.direction);
        FirebaseService.updatePlayerPosition(p2.id, p2.x, p2.y, p2.direction);
        for (const p of [p1, p2]) {
            FirebaseService.updatePlayerState(p.id, {
                score: p.score, kills: p.kills, alive: p.alive,
            });
        }
    },

    tickOnline() {
        const local = this.players.find(p => p.id === this.localPlayerId);
        if (!local) return;

        const snapshot = Board.tiles.map(t => ({ owner: t.owner, trail: t.trail }));

        const opponents = this.players.filter(p => p.id !== this.localPlayerId);
        const prevCount = Board.countTerritory(local.id);
        const prevKills = local.kills;
        const prevAlive = local.alive;
        const localPrev = { x: local.x, y: local.y };

        movePlayer(local, opponents);

        if (local.alive && prevAlive) {
            for (const o of opponents) {
                if (!o.alive) continue;
                const oPrev = this.previousPositions[o.id];
                if (!oPrev) continue;
                const swapped = local.x === oPrev.x && local.y === oPrev.y &&
                                o.x === localPrev.x && o.y === localPrev.y;
                const sameTile = local.x === o.x && local.y === o.y;
                if (swapped || sameTile) {
                    const localOnOwn = Board.getTile(local.x, local.y)?.owner === local.id;
                    const oppOnOwn = Board.getTile(o.x, o.y)?.owner === o.id;
                    if (!localOnOwn && !oppOnOwn) {
                        local.alive = false;
                        local.respawnTimer = 5;
                        Board.clearTrail(local.id);
                        local.trail = [];
                    }
                }
            }
        }

        if (local.alive && prevAlive) {
            for (const opp of opponents) {
                if (!opp.alive || opp.trail.length === 0) continue;
                const steppedOnOppTrail = opp.trail.some(t => t.x === local.x && t.y === local.y);
                if (steppedOnOppTrail) {
                    opp.alive = false;
                    opp.respawnTimer = 5;
                    Board.clearTrail(opp.id);
                    opp.trail = [];
                    local.kills++;
                    opp._killedAt = Date.now();
                }
            }
        }

        if (local.kills > prevKills) {
            Sound.kill();
            showNotification('Kill!', 'kill');
            for (const opp of opponents) {
                if (!opp.alive) opp._killedAt = Date.now();
            }
        }
        if (prevAlive && !local.alive) {
            this.triggerShake();
            showNotification('You died', 'self');
        }

        const newCount = Board.countTerritory(local.id);
        if (newCount > prevCount + 1) {
            this.triggerClaimFlash(local.id);
        }
        local.score = newCount;

        FirebaseService.updatePlayerPosition(local.id, local.x, local.y, local.direction);
        FirebaseService.updatePlayerState(local.id, {
            score: local.score,
            kills: local.kills,
            alive: local.alive,
            trail: local.trail.length > 0 ? local.trail : false,
        });

        const boardUpdates = {};
        for (let i = 0; i < Board.tiles.length; i++) {
            const tile = Board.tiles[i];
            const prev = snapshot[i];
            if (tile.owner !== prev.owner || tile.trail !== prev.trail) {
                const localChanged = tile.owner === local.id || prev.owner === local.id ||
                                     tile.trail === local.id || prev.trail === local.id;
                const oppTrailCleared = prev.trail !== null && prev.trail !== local.id && tile.trail === null;
                if (localChanged || oppTrailCleared) {
                    boardUpdates[`${tile.x}_${tile.y}`] = { owner: tile.owner, trail: tile.trail };
                }
            }
        }
        if (Object.keys(boardUpdates).length > 0) {
            FirebaseService.updateBoard(boardUpdates);
        }
    },

    triggerClaimFlash(playerId) {
        this.claimFlashTiles = Board.getTerritoryTiles(playerId).map(t => ({ x: t.x, y: t.y }));
        this.claimFlashTime = performance.now();
        Sound.claim();
    },

    triggerShake() {
        this.shakeTime = performance.now();
        this.shakeAmount = 6;
        Sound.death();
    },

    endGame() {
        if (this.gameState === 'finished') return;
        this.gameState = 'finished';
        this.running = false;
        clearInterval(this.timerInterval);
        clearInterval(this.tickInterval);
        Sound.gameEnd();

        const p1 = this.players.find(p => p.id === 'player1');
        const p2 = this.players.find(p => p.id === 'player2');
        let winnerId = null;

        if (p1.score > p2.score) winnerId = 'player1';
        else if (p2.score > p1.score) winnerId = 'player2';
        else if (p1.kills > p2.kills) winnerId = 'player1';
        else if (p2.kills > p1.kills) winnerId = 'player2';
        else winnerId = 'draw';

        if (this.localPlayerId === 'player1') {
            FirebaseService.setWinner(winnerId);
            FirebaseService.setSessionState('finished');
        }

        if (this.onGameEnd) {
            this.onGameEnd({
                winner: winnerId,
                scores: { player1: p1.score, player2: p2.score },
                kills: { player1: p1.kills, player2: p2.kills },
            });
        }
    },

    updateHUDElements() {
        const p1 = this.players.find(p => p.id === 'player1');
        const p2 = this.players.find(p => p.id === 'player2');
        const scoreP1El = document.querySelector('#score-p1 .score-val');
        const scoreP2El = document.querySelector('#score-p2 .score-val');
        const killP1El = document.querySelector('#score-p1 .kill-val');
        const killP2El = document.querySelector('#score-p2 .kill-val');
        const nameP1El = document.querySelector('#score-p1 .score-name');
        const nameP2El = document.querySelector('#score-p2 .score-name');
        const timerEl = document.getElementById('game-timer');

        if (scoreP1El && p1) scoreP1El.textContent = p1.score;
        if (scoreP2El && p2) scoreP2El.textContent = p2.score;
        if (killP1El && p1) killP1El.textContent = `${p1.kills} kill${p1.kills !== 1 ? 's' : ''}`;
        if (killP2El && p2) killP2El.textContent = `${p2.kills} kill${p2.kills !== 1 ? 's' : ''}`;
        if (nameP1El) nameP1El.textContent = this.playerNames.player1;
        if (nameP2El) nameP2El.textContent = this.playerNames.player2;
        if (timerEl) timerEl.textContent = Math.max(0, this.timeRemaining);
    },

    renderLoop() {
        this.render();
        this.animFrameId = requestAnimationFrame(() => this.renderLoop());
    },

    render() {
        const ctx = this.ctx;
        const ts = this.tileSize;

        ctx.save();

        if (this.shakeAmount > 0) {
            const elapsed = performance.now() - this.shakeTime;
            if (elapsed < 300) {
                const intensity = this.shakeAmount * (1 - elapsed / 300);
                ctx.translate(
                    Math.sin(elapsed * 0.05) * intensity,
                    Math.cos(elapsed * 0.07) * intensity
                );
            } else {
                this.shakeAmount = 0;
            }
        }

        ctx.fillStyle = GRID_BG;
        ctx.fillRect(-10, -10, this.canvas.width + 20, this.canvas.height + 20);

        const center = GRID_SIZE / 2;
        ctx.strokeStyle = 'rgba(44,36,32,0.04)';
        ctx.lineWidth = 1;
        for (let ring = 1; ring <= 5; ring++) {
            const size = ring * ts;
            ctx.strokeRect(
                (center - ring) * ts,
                (center - ring) * ts,
                size * 2,
                size * 2
            );
        }

        const flashElapsed = performance.now() - this.claimFlashTime;
        const showFlash = flashElapsed < 400;

        for (const tile of Board.tiles) {
            const x = tile.x * ts;
            const y = tile.y * ts;

            if (tile.owner) {
                ctx.fillStyle = PLAYER_COLOURS[tile.owner].territory;
                ctx.fillRect(x, y, ts, ts);

                if (showFlash && this.claimFlashTiles.some(f => f.x === tile.x && f.y === tile.y)) {
                    const flashAlpha = 0.35 * (1 - flashElapsed / 400);
                    ctx.fillStyle = `rgba(184,144,111,${flashAlpha})`;
                    ctx.fillRect(x, y, ts, ts);
                }
            } else {
                ctx.fillStyle = EMPTY_TILE;
                ctx.fillRect(x, y, ts, ts);
            }
        }

        for (const player of this.players) {
            if (!player.alive || player.trail.length === 0) continue;
            const trailColour = PLAYER_COLOURS[player.id]?.trail || 'rgba(0,0,0,0.05)';
            for (const pt of player.trail) {
                ctx.fillStyle = trailColour;
                ctx.fillRect(pt.x * ts, pt.y * ts, ts, ts);
            }
        }

        ctx.strokeStyle = GRID_LINE;
        ctx.lineWidth = 1;
        for (let i = 0; i <= GRID_SIZE; i++) {
            ctx.beginPath();
            ctx.moveTo(i * ts, 0);
            ctx.lineTo(i * ts, this.canvas.height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * ts);
            ctx.lineTo(this.canvas.width, i * ts);
            ctx.stroke();
        }

        const elapsed = performance.now() - this.lastTickTime;
        const t = Math.min(elapsed / TICK_MS, 1);

        for (const player of this.players) {
            if (!player.alive || player.trail.length === 0) continue;

            const colours = PLAYER_COLOURS[player.id];
            const trail = player.trail;
            const prev = this.previousPositions[player.id] || { x: player.x, y: player.y };
            const ix = prev.x + (player.x - prev.x) * this.easeOut(t);
            const iy = prev.y + (player.y - prev.y) * this.easeOut(t);

            const lineWidth = ts * 0.22;

            ctx.save();
            ctx.strokeStyle = colours.trailLine;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.globalAlpha = 0.45;

            const headX = ix * ts + ts / 2;
            const headY = iy * ts + ts / 2;
            const lastTrail = trail[trail.length - 1];
            const lastTX = lastTrail.x * ts + ts / 2;
            const lastTY = lastTrail.y * ts + ts / 2;
            const dxHead = headX - lastTX;
            const dyHead = headY - lastTY;
            const dist = Math.sqrt(dxHead * dxHead + dyHead * dyHead);
            const radius = ts * 0.32;
            let endX = headX, endY = headY;
            if (dist > radius) {
                endX = headX - (dxHead / dist) * radius;
                endY = headY - (dyHead / dist) * radius;
            } else {
                endX = lastTX;
                endY = lastTY;
            }

            ctx.beginPath();
            ctx.moveTo(trail[0].x * ts + ts / 2, trail[0].y * ts + ts / 2);
            for (let i = 1; i < trail.length; i++) {
                ctx.lineTo(trail[i].x * ts + ts / 2, trail[i].y * ts + ts / 2);
            }
            ctx.lineTo(endX, endY);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(trail[0].x * ts + ts / 2, trail[0].y * ts + ts / 2, lineWidth * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = colours.trailLine;
            ctx.fill();

            ctx.restore();
        }

        for (const player of this.players) {
            if (!player.alive) {
                const cx = player.x * ts + ts / 2;
                const cy = player.y * ts + ts / 2;
                ctx.beginPath();
                ctx.arc(cx, cy, ts * 0.25, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(44,36,32,0.08)';
                ctx.fill();
                continue;
            }

            const prev = this.previousPositions[player.id] || { x: player.x, y: player.y };
            const ix = prev.x + (player.x - prev.x) * this.easeOut(t);
            const iy = prev.y + (player.y - prev.y) * this.easeOut(t);

            const cx = ix * ts + ts / 2;
            const cy = iy * ts + ts / 2;
            const radius = ts * 0.32;

            ctx.beginPath();
            ctx.arc(cx + 1, cy + 1.5, radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(44,36,32,0.12)';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = player.colour.circle;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(cx - radius * 0.2, cy - radius * 0.2, radius * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.fill();

            const dir = DIRECTIONS[player.direction];
            if (dir) {
                ctx.beginPath();
                ctx.arc(cx + dir.dx * radius * 0.5, cy + dir.dy * radius * 0.5, 2.5, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.fill();
            }

        }

        ctx.restore();
    },

    easeOut(t) {
        return 1 - (1 - t) * (1 - t);
    },

    stop() {
        this.running = false;
        this.paused = false;
        this.gameState = 'idle';
        if (this.tickInterval) clearInterval(this.tickInterval);
        if (this.timerInterval) clearInterval(this.timerInterval);
        if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler);
            this._keyHandler = null;
        }
        if (this._pauseKeyHandler) {
            document.removeEventListener('keydown', this._pauseKeyHandler);
            this._pauseKeyHandler = null;
        }
        const timerBtn = document.getElementById('game-timer');
        if (timerBtn && this._pauseClickHandler) {
            timerBtn.removeEventListener('click', this._pauseClickHandler);
            this._pauseClickHandler = null;
        }
        const overlay = document.getElementById('pause-overlay');
        if (overlay) overlay.classList.add('hidden');
        Touch.hide();
        FirebaseService.cleanup();
    }
};
