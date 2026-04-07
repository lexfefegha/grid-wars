let ctx = null;
let muted = false;

function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
}

function resumeCtx() {
    const c = getCtx();
    if (c.state === 'suspended') c.resume();
}

function tone(freq, duration, type = 'square', volume = 0.12) {
    if (muted) return;
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + duration);
}

export const Sound = {
    get muted() { return muted; },

    toggle() {
        muted = !muted;
        return muted;
    },

    setMuted(val) {
        muted = val;
    },

    unlock() {
        resumeCtx();
    },

    claim() {
        [523, 659, 784].forEach((freq, i) => {
            setTimeout(() => tone(freq, 0.15, 'sine', 0.1), i * 55);
        });
    },

    kill() {
        tone(180, 0.15, 'sawtooth', 0.1);
        setTimeout(() => tone(120, 0.2, 'sawtooth', 0.08), 60);
    },

    death() {
        tone(400, 0.1, 'square', 0.08);
        setTimeout(() => tone(300, 0.1, 'square', 0.08), 80);
        setTimeout(() => tone(200, 0.2, 'square', 0.06), 160);
    },

    countdownTick() {
        tone(440, 0.1, 'sine', 0.1);
    },

    countdownGo() {
        tone(880, 0.25, 'sine', 0.12);
    },

    gameEnd() {
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
            setTimeout(() => tone(freq, 0.2, 'sine', 0.1), i * 100);
        });
    },
};
