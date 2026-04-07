import { Board } from './board.js';
import { createPlayer } from './player.js';
import { FirebaseService } from './firebase.js';
import { Game, PLAYER_COLOURS } from './game.js';
import { Sound } from './sound.js';
import '../css/style.css';

const screens = {
    name: document.getElementById('screen-name'),
    waiting: document.getElementById('screen-waiting'),
    game: document.getElementById('screen-game'),
    results: document.getElementById('screen-results'),
};
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNumber = document.getElementById('countdown-number');
const waitingStatus = document.getElementById('waiting-status');
const waitingSpinner = document.getElementById('waiting-spinner');
const shareSection = document.getElementById('share-section');
const shareUrlInput = document.getElementById('share-url');
const copyBtn = document.getElementById('btn-copy-link');
const resultsTitle = document.getElementById('results-title');
const resultsBody = document.getElementById('results-body');
const btnRematch = document.getElementById('btn-rematch');
const btnNewGame = document.getElementById('btn-new-game');
const nameInput = document.getElementById('name-input');
const btnStart = document.getElementById('btn-start');
const debugBanner = document.getElementById('debug-banner');

let localPlayerName = '';

function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    countdownOverlay.classList.add('hidden');
    screens[name].classList.remove('hidden');
}

const params = new URLSearchParams(window.location.search);
const sessionParam = params.get('session');
const isDebug = import.meta.env.VITE_DEBUG_MODE === 'true';

if (isDebug) {
    startDebugMode();
} else if (sessionParam) {
    showJoinFlow(sessionParam);
} else {
    showCreateFlow();
}

// ── Debug Mode ──
async function startDebugMode() {
    Game.debugMode = true;
    Game.playerNames = { player1: 'P1 (arrows)', player2: 'P2 (WASD)' };

    showScreen('waiting');
    waitingStatus.textContent = 'Starting debug session...';
    shareSection.classList.add('hidden');

    try {
        const sessionId = await FirebaseService.createSession('Debug P1');

        await FirebaseService.joinSession(sessionId, 'Debug P2');
        FirebaseService.playerId = 'player1';

        const newUrl = `${window.location.pathname}?debug=true&session=${sessionId}`;
        window.history.replaceState({}, '', newUrl);

        debugBanner.classList.remove('hidden');
        startCountdown();
    } catch (err) {
        waitingStatus.textContent = 'Error starting debug mode.';
        waitingSpinner.classList.add('hidden');
        console.error(err);
    }
}

// ── Create Flow: show name input ──
function showCreateFlow() {
    showScreen('name');
    btnStart.textContent = 'Create Game';
    nameInput.focus();

    btnStart.addEventListener('click', handleCreate);
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleCreate();
    });
}

async function handleCreate() {
    localPlayerName = nameInput.value.trim() || 'Player 1';
    btnStart.disabled = true;
    btnStart.textContent = 'Creating...';

    showScreen('waiting');
    waitingStatus.textContent = 'Creating game...';
    shareSection.classList.add('hidden');

    try {
        const sessionId = await FirebaseService.createSession(localPlayerName);

        const newUrl = `${window.location.pathname}?session=${sessionId}`;
        window.history.replaceState({}, '', newUrl);

        waitingStatus.textContent = 'Waiting for opponent...';
        shareSection.classList.remove('hidden');
        shareUrlInput.value = FirebaseService.getShareUrl();

        FirebaseService.onSessionState((state) => {
            if (state === 'countdown') {
                loadPlayerNames().then(() => startCountdown());
            }
        });
    } catch (err) {
        waitingStatus.textContent = 'Error creating game. Refresh to try again.';
        waitingSpinner.classList.add('hidden');
        console.error(err);
    }
}

// ── Join Flow: check session, show name input ──
async function showJoinFlow(sessionId) {
    showScreen('waiting');
    waitingStatus.textContent = 'Checking session...';
    shareSection.classList.add('hidden');

    try {
        const data = await FirebaseService.getSessionInfo(sessionId);

        if (!data) {
            waitingStatus.textContent = 'Session not found. Check the link and try again.';
            waitingSpinner.classList.add('hidden');
            return;
        }

        if (data.players?.player2) {
            if (data.state === 'playing' || data.state === 'countdown') {
                waitingStatus.textContent = 'Game already in progress.';
            } else {
                waitingStatus.textContent = 'Session is full.';
            }
            waitingSpinner.classList.add('hidden');
            return;
        }

        const hostName = data.players?.player1?.name || 'Someone';
        showScreen('name');
        btnStart.textContent = `Join ${hostName}'s Game`;
        nameInput.focus();

        const onJoin = async () => {
            localPlayerName = nameInput.value.trim() || 'Player 2';
            btnStart.disabled = true;
            btnStart.textContent = 'Joining...';

            showScreen('waiting');
            waitingStatus.textContent = 'Joining game...';
            shareSection.classList.add('hidden');

            try {
                await FirebaseService.joinSession(sessionId, localPlayerName);
                await loadPlayerNames();
                startCountdown();
            } catch (err) {
                waitingStatus.textContent = err.message || 'Error joining game.';
                waitingSpinner.classList.add('hidden');
                console.error(err);
            }
        };

        btnStart.addEventListener('click', onJoin);
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') onJoin();
        });
    } catch (err) {
        waitingStatus.textContent = 'Error checking session.';
        waitingSpinner.classList.add('hidden');
        console.error(err);
    }
}

// ── Load player names from Firebase ──
async function loadPlayerNames() {
    try {
        const data = await FirebaseService.getSessionInfo(FirebaseService.sessionId);
        if (data?.players) {
            Game.playerNames = {
                player1: data.players.player1?.name || 'Player 1',
                player2: data.players.player2?.name || 'Player 2',
            };
        }
    } catch (e) {
        console.warn('Could not load player names', e);
    }
}

// ── 3-2-1 Countdown ──
function startCountdown() {
    showScreen('game');
    Game.init('game-canvas');

    Board.init();
    Board.setStartTerritory(3, 5, 'player1');
    Board.setStartTerritory(7, 5, 'player2');

    const p1 = createPlayer('player1', 3, 5, PLAYER_COLOURS.player1, 'left');
    const p2 = createPlayer('player2', 7, 5, PLAYER_COLOURS.player2, 'right');
    p1.score = 0;
    p2.score = 0;
    Game.players = [p1, p2];
    Game.localPlayerId = FirebaseService.playerId;
    for (const p of Game.players) {
        Game.previousPositions[p.id] = { x: p.x, y: p.y };
    }
    Game.lastTickTime = performance.now();
    Game.updateHUDElements();

    Game.animFrameId = requestAnimationFrame(function loop() {
        Game.render();
        if (Game.gameState !== 'playing') {
            Game.animFrameId = requestAnimationFrame(loop);
        }
    });

    countdownOverlay.classList.remove('hidden');
    let count = 3;
    countdownNumber.textContent = count;
    Sound.unlock();
    Sound.countdownTick();

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownNumber.textContent = count;
            countdownNumber.style.animation = 'none';
            void countdownNumber.offsetHeight;
            countdownNumber.style.animation = '';
            Sound.countdownTick();
        } else if (count === 0) {
            countdownNumber.textContent = 'GO!';
            countdownNumber.style.animation = 'none';
            void countdownNumber.offsetHeight;
            countdownNumber.style.animation = '';
            Sound.countdownGo();
        } else {
            clearInterval(interval);
            countdownOverlay.classList.add('hidden');
            if (Game.animFrameId) cancelAnimationFrame(Game.animFrameId);
            startGame();
        }
    }, 800);
}

// ── Start Game ──
function startGame() {
    if (FirebaseService.playerId === 'player1') {
        FirebaseService.setSessionState('playing');
        FirebaseService.setStartedAt();
    }

    Game.onGameEnd = showResults;
    Game.stop();
    Game.init('game-canvas');
    Game.start(FirebaseService.playerId);
}

// ── Results Screen ──
function showResults(result) {
    showScreen('results');

    const localId = FirebaseService.playerId;
    const isWinner = result.winner === localId;
    const isDraw = result.winner === 'draw';

    const p1Name = Game.playerNames.player1;
    const p2Name = Game.playerNames.player2;

    if (isDraw) {
        resultsTitle.textContent = "It's a Draw";
        resultsTitle.style.color = '';
    } else if (Game.debugMode) {
        const winnerName = result.winner === 'player1' ? p1Name : p2Name;
        resultsTitle.textContent = `${winnerName} Wins`;
        resultsTitle.style.color = PLAYER_COLOURS[result.winner].circle;
    } else if (isWinner) {
        resultsTitle.textContent = 'You Won';
        resultsTitle.style.color = PLAYER_COLOURS[localId].circle;
    } else {
        resultsTitle.textContent = 'You Lost';
        resultsTitle.style.color = PLAYER_COLOURS[localId === 'player1' ? 'player2' : 'player1'].circle;
    }

    resultsBody.innerHTML = `
        <div class="score-line">
            <span style="color:${PLAYER_COLOURS.player1.circle}">
                ${p1Name}: ${result.scores.player1} tiles, ${result.kills.player1} kills
            </span>
        </div>
        <div class="score-line">
            <span style="color:${PLAYER_COLOURS.player2.circle}">
                ${p2Name}: ${result.scores.player2} tiles, ${result.kills.player2} kills
            </span>
        </div>
    `;
}

// ── Rematch ──
btnRematch.addEventListener('click', async () => {
    await FirebaseService.resetSession();
    startCountdown();
});

btnNewGame.addEventListener('click', () => {
    Game.stop();
    FirebaseService.cleanup();
    window.location.href = window.location.pathname;
});

// ── Copy Link ──
copyBtn.addEventListener('click', () => {
    shareUrlInput.select();
    navigator.clipboard.writeText(shareUrlInput.value).then(() => {
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    });
});

// ── Sound Mute Toggle ──
const muteBtn = document.getElementById('btn-mute');
const muteIcon = document.getElementById('mute-icon');

muteBtn.addEventListener('click', () => {
    Sound.unlock();
    const isMuted = Sound.toggle();
    muteBtn.classList.toggle('is-muted', isMuted);
    muteIcon.innerHTML = isMuted ? '&#128263;' : '&#128264;';
});
