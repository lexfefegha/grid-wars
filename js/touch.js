const SWIPE_THRESHOLD = 20;
const SWIPE_MAX_TIME = 400;

export const Touch = {
    onDirection: null,
    _startX: 0,
    _startY: 0,
    _startTime: 0,
    _attached: false,

    init(onDirection) {
        this.onDirection = onDirection;
        if (this._attached) return;
        this._attached = true;

        const canvas = document.getElementById('game-canvas');
        const target = canvas || document.body;

        target.addEventListener('touchstart', (e) => this._onStart(e), { passive: false });
        target.addEventListener('touchend', (e) => this._onEnd(e), { passive: false });
    },

    _onStart(e) {
        if (e.touches.length !== 1) return;
        const touch = e.touches[0];
        this._startX = touch.clientX;
        this._startY = touch.clientY;
        this._startTime = Date.now();
    },

    _onEnd(e) {
        if (Date.now() - this._startTime > SWIPE_MAX_TIME) return;
        const touch = e.changedTouches[0];
        const dx = touch.clientX - this._startX;
        const dy = touch.clientY - this._startY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD) return;

        let dir;
        if (absDx > absDy) {
            dir = dx > 0 ? 'right' : 'left';
        } else {
            dir = dy > 0 ? 'down' : 'up';
        }

        e.preventDefault();
        if (this.onDirection) this.onDirection(dir);
    },

    hide() {},
    show() {},
};
