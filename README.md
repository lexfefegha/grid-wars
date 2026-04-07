# Grid Wars

A real-time 2-player territory game on an 11×11 grid. Leave your base, draw trails, close loops to claim land, and cut your opponent's trail to eliminate them. Most territory after 60 seconds wins.

Inspired by **Paper.io**, adapted for a discrete grid, tiny board, and private 1v1 sessions via a shared URL.

## How It Works

1. One player creates a game and gets a shareable link
2. The other player opens the link and joins
3. After a 3-2-1 countdown, both players move constantly on the grid
4. Arrow keys (or WASD) set your direction — swipe on mobile — you can't stop
5. Leave your territory to draw a trail, return home to claim everything inside your loop
6. Cross your opponent's trail to eliminate them
7. Most tiles after 60 seconds wins

## Tech Stack

- **Frontend:** Vanilla JavaScript + HTML Canvas
- **Realtime sync:** Firebase Realtime Database
- **Build:** Vite
- **Hosting:** Firebase Hosting

## Setup

### Prerequisites

- Node.js (v18+)
- A Firebase project with Realtime Database enabled

### Install

```bash
npm install
```

### Configure Firebase

Copy the example env file and fill in your Firebase credentials:

```bash
cp .env.example .env
```

Edit `.env` with your Firebase project values:

```
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=your-app-id
VITE_DEBUG_MODE=false
```

### Run Locally

```bash
npm run dev
```

Opens at `http://localhost:5173`. To test multiplayer locally, open two browser tabs.

### Debug Mode

Set `VITE_DEBUG_MODE=true` in `.env` to run a local 2-player session controlled from one browser:

- **Player 1:** Arrow keys
- **Player 2:** WASD
- **Space:** Pause/resume

### Build & Deploy

```bash
npm run build
firebase deploy
```

## File Structure

```
├── index.html          Entry point
├── css/style.css       All styles
├── js/
│   ├── main.js         Session management, routing, countdown
│   ├── game.js         Game loop, canvas rendering, input
│   ├── board.js        Board state, territory logic, flood fill
│   ├── player.js       Player movement, trail, kill/respawn
│   ├── firebase.js     Firebase config, read/write helpers
│   ├── sound.js        Synthesized sound effects (Web Audio API)
│   └── touch.js        Swipe gesture detection for mobile/tablet
├── .env                Firebase credentials (not committed)
├── .env.example        Template for .env
├── firebase.json       Firebase hosting config
├── package.json        Dependencies and scripts
└── scope.md            Design document
```

## Game Rules

- **Movement:** Constant, one tile per 300ms tick. Arrow keys on desktop, swipe on mobile.
- **Territory:** Your claimed tiles. You're safe here.
- **Trail:** Tiles you leave behind when off your territory. Vulnerable.
- **Loop claim:** Return to your territory to claim your trail + everything enclosed (flood fill).
- **Trail kill:** Step on an opponent's trail to destroy it and eliminate them.
- **Walls:** You can't enter opponent territory — it blocks you.
- **Respawn:** On death, respawn in your territory after ~1 second. Territory is kept.
- **Win condition:** Most tiles at 60 seconds, when all 121 tiles are claimed, or when a player dominates 100+ tiles. Tiebreaker: most kills.
- **Elimination:** If you die with no territory and no unclaimed tiles to respawn on, you're out.
- **Trapped:** If you're completely boxed in by opponent territory with no moves, the game ends.
