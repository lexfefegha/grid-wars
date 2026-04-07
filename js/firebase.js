import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, update, onValue, off, get, serverTimestamp } from 'firebase/database';
import { GRID_SIZE } from './board.js';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const FirebaseService = {
    db: null,
    sessionRef: null,
    sessionId: null,
    playerId: null,
    isInitialized: false,
    listeners: [],

    init() {
        if (this.isInitialized) return;
        const app = initializeApp(firebaseConfig);
        this.db = getDatabase(app);
        this.isInitialized = true;
    },

    generateId() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let id = '';
        for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
        return id;
    },

    sanitizeTile(tile) {
        return {
            owner: tile.owner || false,
            trail: tile.trail || false,
        };
    },

    buildInitialBoard() {
        const boardData = {};
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                boardData[`${x}_${y}`] = { owner: false, trail: false };
            }
        }
        boardData['3_5'] = { owner: 'player1', trail: false };
        boardData['7_5'] = { owner: 'player2', trail: false };
        return boardData;
    },

    async createSession(playerName) {
        this.init();
        this.sessionId = this.generateId();
        this.playerId = 'player1';
        this.sessionRef = ref(this.db, `sessions/${this.sessionId}`);

        await set(this.sessionRef, {
            state: 'waiting',
            createdAt: serverTimestamp(),
            startedAt: false,
            duration: 60,
            board: this.buildInitialBoard(),
            players: {
                player1: {
                    name: playerName || 'Player 1',
                    colour: '#E63946',
                    position: { x: 3, y: 5 },
                    direction: 'left',
                    score: 0,
                    kills: 0,
                    alive: true,
                    ready: false,
                    lastUpdate: serverTimestamp(),
                }
            },
            winner: false,
            timeRemaining: 60,
        });

        return this.sessionId;
    },

    async joinSession(sessionId, playerName) {
        this.init();
        this.sessionId = sessionId;
        this.sessionRef = ref(this.db, `sessions/${this.sessionId}`);

        const snapshot = await get(this.sessionRef);
        const data = snapshot.val();

        if (!data) throw new Error('Session not found');

        if (data.players && data.players.player2) {
            if (data.state === 'playing' || data.state === 'countdown' || data.state === 'ready') {
                throw new Error('Game already in progress');
            }
            throw new Error('Session is full');
        }

        this.playerId = 'player2';
        await set(ref(this.db, `sessions/${this.sessionId}/players/player2`), {
            name: playerName || 'Player 2',
            colour: '#2A9D8F',
            position: { x: 7, y: 5 },
            direction: 'right',
            score: 0,
            kills: 0,
            alive: true,
            ready: true,
            lastUpdate: serverTimestamp(),
        });

        await set(ref(this.db, `sessions/${this.sessionId}/state`), 'ready');
        return this.playerId;
    },

    async getSessionInfo(sessionId) {
        this.init();
        const snapshot = await get(ref(this.db, `sessions/${sessionId}`));
        return snapshot.val();
    },

    _listen(path, callback) {
        const r = ref(this.db, `sessions/${this.sessionId}/${path}`);
        const unsub = onValue(r, snap => callback(snap.val()));
        this.listeners.push({ ref: r, unsub });
    },

    onSessionState(callback) {
        this._listen('state', callback);
    },

    onPlayersChange(callback) {
        this._listen('players', callback);
    },

    onBoardChange(callback) {
        this._listen('board', callback);
    },

    onTimerChange(callback) {
        this._listen('timeRemaining', callback);
    },

    onWinnerChange(callback) {
        this._listen('winner', callback);
    },

    onOpponentChange(opponentId, callback) {
        this._listen(`players/${opponentId}`, callback);
    },

    async updatePlayerPosition(playerId, x, y, direction) {
        if (!this.sessionRef) return;
        return update(ref(this.db, `sessions/${this.sessionId}/players/${playerId}`), {
            position: { x, y },
            direction,
            lastUpdate: serverTimestamp(),
        });
    },

    async updatePlayerState(playerId, data) {
        if (!this.sessionRef) return;
        return update(ref(this.db, `sessions/${this.sessionId}/players/${playerId}`), data);
    },

    async updateBoard(boardUpdates) {
        if (!this.sessionRef) return;
        const updates = {};
        for (const [key, val] of Object.entries(boardUpdates)) {
            updates[`board/${key}`] = this.sanitizeTile(val);
        }
        return update(ref(this.db, `sessions/${this.sessionId}`), updates);
    },

    async batchUpdateBoard(tiles) {
        if (!this.sessionRef) return;
        const updates = {};
        for (const t of tiles) {
            updates[`board/${t.x}_${t.y}`] = this.sanitizeTile(t);
        }
        return update(ref(this.db, `sessions/${this.sessionId}`), updates);
    },

    async setPlayerReady(playerId) {
        if (!this.sessionRef) return;
        return set(ref(this.db, `sessions/${this.sessionId}/players/${playerId}/ready`), true);
    },

    async setSessionState(state) {
        if (!this.sessionRef) return;
        return set(ref(this.db, `sessions/${this.sessionId}/state`), state);
    },

    async setStartedAt() {
        if (!this.sessionRef) return;
        return set(ref(this.db, `sessions/${this.sessionId}/startedAt`), serverTimestamp());
    },

    async setTimeRemaining(time) {
        if (!this.sessionRef) return;
        return set(ref(this.db, `sessions/${this.sessionId}/timeRemaining`), time);
    },

    async setWinner(winnerId) {
        if (!this.sessionRef) return;
        return set(ref(this.db, `sessions/${this.sessionId}/winner`), winnerId);
    },

    async resetSession() {
        if (!this.sessionRef) return;
        return update(ref(this.db, `sessions/${this.sessionId}`), {
            state: 'ready',
            startedAt: false,
            board: this.buildInitialBoard(),
            winner: false,
            timeRemaining: 60,
            'players/player1/position': { x: 3, y: 5 },
            'players/player1/direction': 'left',
            'players/player1/score': 0,
            'players/player1/kills': 0,
            'players/player1/alive': true,
            'players/player1/ready': false,
            'players/player2/position': { x: 7, y: 5 },
            'players/player2/direction': 'right',
            'players/player2/score': 0,
            'players/player2/kills': 0,
            'players/player2/alive': true,
            'players/player2/ready': false,
        });
    },

    cleanup() {
        for (const { ref: r, unsub } of this.listeners) {
            off(r);
        }
        this.listeners = [];
    },

    getShareUrl() {
        return `${window.location.origin}${window.location.pathname}?session=${this.sessionId}`;
    }
};
