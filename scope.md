# Grid Wars — Scope Document

## Concept

A real-time multiplayer territory game on an 11×11 grid. Primary reference: **Paper.io** — a territory game where players leave trails outside their base, close loops to claim land, and can kill each other by crossing trails. Adapted here for a discrete grid, a small intense board, and private 2-player sessions.

Secondary inspiration: **Goju** (concentric square board game) and abstract strategy games played on 11×11 grids — the board has a natural centre-to-edge structure that creates spatial pressure.

Key difference from Paper.io: the board is tiny (121 tiles), movement is grid-based rather than free-form, and games are private 1v1 via a shared URL. Every move matters more, games are 30-60 seconds, and you can never hide from your opponent. It plays more like a board game at speed than an .io game.

---

## Game Rules

### Setup
- 11×11 grid (121 tiles)
- Player 1 starts at grid position (3, 5) with a 3×3 block of territory (9 tiles)
- Player 2 starts at grid position (7, 5) with a 3×3 block of territory (9 tiles)
- Players start with 3 tiles between them — close enough to feel the tension, far enough to have opening choices
- Game begins after a 3-2-1 countdown

### Movement
- Arrow keys to set direction (up/down/left/right, no diagonal)
- **Constant movement** — once the game starts, your circle moves one tile per tick and never stops. You change direction but you cannot pause. This keeps pressure on and prevents camping.
- Tick speed: one move every 300ms (~3.3 tiles per second)
- If you hit the grid edge, you continue along the edge in your current direction (no death on wall hit — board is too small to punish this)
- You cannot enter an opponent's claimed territory (you slide along its edge instead)

### Territory & Trail (core Paper.io mechanic, adapted for grid)
- **On your own territory:** you move freely, no trail, you are safe
- **Off your territory:** every tile you step on becomes your **trail** (visually distinct — lighter/translucent version of your colour)
- **Closing a loop:** when your trail connects back to any tile of your claimed territory:
  - All trail tiles become your territory
  - All unclaimed tiles enclosed by the loop + your existing territory become yours (flood fill)
  - This is the core "land grab" — the bigger the loop, the bigger the payoff, the bigger the risk
- **You cannot cross your own trail** — if your only moves would put you on your own trail, you are forced back to your territory (or you die, depending on difficulty preference)

### Conflict
- **Trail kill:** if your opponent steps on any tile in your active trail, your trail is destroyed AND you die (respawn at a random tile within your territory). Your trail tiles revert to unclaimed.
- **You CAN enter unclaimed tiles and opponent trail tiles** — this is how you attack
- **You CANNOT enter opponent's claimed territory** — it acts as a wall
- **Head-on collision (both on trails):** both players die and respawn. Both trails destroyed.
- **On your own territory you are safe** — opponent cannot kill you there

### Death & Respawn
- On death: respawn at a random tile within your remaining territory after a 1-second delay
- Your claimed territory is NOT lost on death — only your active trail is lost
- If you have no territory left (all stolen), you respawn with a fresh 2×2 block at a random unclaimed area

### Winning
- Game ends after 60 seconds OR when all 121 tiles are claimed
- **Most tiles wins**
- Tie-breaker: player with most kills wins. Still tied: draw.
- Score display: show tile count for both players throughout the game

### What makes this strategically interesting
- **Small loops vs big loops:** small loops are safe but claim little. Big loops risk your trail being crossed but can steal huge chunks of the board.
- **Offense vs defense:** do you expand into unclaimed land, or hunt your opponent's trail?
- **Territory as walls:** your claimed land blocks your opponent's movement. Shape matters — a long thin territory can cut the board in half.
- **Constant movement pressure:** you can't sit and think. Every tick you're committing to a direction.
- **Respawn keeps it close:** losing a trail hurts but doesn't end the game. Comebacks are possible.

---

## Reference Comparison

| Feature | Paper.io | Grid Wars (this game) |
|---------|----------|----------------------|
| Board | Large, continuous | 11×11 discrete grid |
| Players | Public lobby, many players | 2 (private session via URL) |
| Start territory | Small circle | 3×3 block (9 tiles) |
| Movement | Free-form, continuous | Grid-based, constant, one tile per tick |
| Trail mechanic | Leave trail outside territory | Same (adapted for grid) |
| Loop claim | Fill enclosed area | Same (flood fill on grid) |
| Trail kill | Cross trail = kill owner | Same |
| Death | Lose everything, game over | Respawn, keep territory |
| Game end | Permanent (until death) | 60-second timer |
| Sharing | Public server | Private URL-based session |

---

## Technical Architecture

### Stack
- **Frontend:** Vite + vanilla JavaScript + HTML Canvas. Canvas gives smooth rendering for a game loop and is the right tool for a grid-based game. No Three.js, no React — this is a 2D tile game, keep it simple.
- **Backend/Realtime:** Firebase Realtime Database for state sync. No custom server needed.
- **Hosting:** Firebase Hosting (already provided Firebase project)
- **Build:** Vite (lightweight, handles env variables for Firebase config)
- **Env:** Firebase credentials stored in `.env`, not committed to repo

### Why not [X]?
- **Three.js:** Overkill. This is flat coloured squares and circles.
- **React:** Adds complexity for no benefit. Game loop rendering doesn't suit React's model.
- **Socket.io / custom server:** Firebase Realtime DB does the same job with zero server code.
- **Phaser / game engine:** Tempting but adds a dependency for what is essentially a grid of coloured squares. Canvas API is enough.

### Firebase Data Model

```
sessions/
  {sessionId}/
    state: "waiting" | "playing" | "finished"
    createdAt: timestamp
    startedAt: timestamp
    duration: 60
    board/
      "x_y": { owner: null | playerId, trail: null | playerId }
      // 121 entries, one per tile
      // e.g. "5_5": { owner: "player1", trail: null }
    players/
      {playerId}/
        colour: string (hex)
        position: { x: number, y: number }
        direction: "up" | "down" | "left" | "right"
        score: number
        kills: number
        alive: boolean
        lastUpdate: timestamp
    winner: null | playerId
```

### Game State & Authority
- **Board state is the source of truth.** Both clients read from and write to `board/`.
- Each player writes their own `position` and `direction` on every tick.
- When a player moves onto a new tile, they write the trail/territory update to `board/` via Firebase transaction.
- Trail kill detection: on each move, check if the tile you're moving to has `trail` set to the opponent's ID. If yes, trigger kill logic.
- Loop closure detection: on each move, check if the tile you're moving to has `owner` set to your own ID AND you have an active trail. If yes, trigger flood fill.
- Use Firebase transactions for any tile that both players might claim simultaneously.

### Sync Strategy
- Tick rate: 300ms. Each tick, player writes new position to Firebase.
- Both clients listen to `sessions/{id}` for all changes.
- Visual interpolation: animate the circle smoothly between grid positions over the 300ms tick window. The circle glides rather than jumps.
- Latency tolerance: on a 300ms tick, up to ~150ms of Firebase latency is invisible. Above that, you might see slight rubber-banding. Acceptable for a casual game.

### Session Flow
1. User visits base URL → generate a unique session ID → redirect to `/{sessionId}`
2. URL now contains session ID — this is the shareable link
3. First player sees "waiting for opponent" with the share link prominently displayed
4. Second player visits same URL → joins session → 3-2-1 countdown
5. Game runs for 60 seconds
6. Results screen with tile counts → rematch button

### Flood Fill Algorithm
When a trail connects back to territory, determine which unclaimed tiles are enclosed:
1. Create a temporary grid marking player's territory + trail tiles as "boundary"
2. Flood fill from every edge tile of the grid that is NOT boundary
3. Any unclaimed tile NOT reached by the flood fill is enclosed → claim it
4. All trail tiles become territory
5. Write all new territory tiles to Firebase in a single batch update
6. This is a standard algorithm — well documented, Claude Code handles it

---

## File Structure

```
/
├── index.html              # Entry point
├── src/
│   ├── main.js             # Entry point, session management, routing
│   ├── game.js             # Game loop, canvas rendering, input handling
│   ├── firebase.js         # Firebase config, read/write helpers
│   ├── board.js            # Board state, territory logic, flood fill
│   └── player.js           # Player state, movement, trail management
├── public/
│   └── (static assets if any)
├── .env                    # Firebase credentials (gitignored)
├── .env.example            # Placeholder env for contributors
├── .gitignore
├── vite.config.js
├── package.json
├── firebase.json           # Firebase hosting config
├── scope.md                # This document
├── PROMPTS.md              # Claude Code prompt log
└── README.md               # Setup instructions
```

---

## Build Plan (Phased)

### Phase 1 — Grid and Movement (~30 mins)
- Canvas rendering of 11×11 grid with clean visual style
- Single circle with constant movement on arrow key input
- Trail: tiles change to lighter colour as player moves
- Boundary: circle stays within grid
- No Firebase yet — local only, single player

### Phase 2 — Firebase + Multiplayer (~30 mins)
- Firebase config via env variables
- Session creation: generate ID, put in URL
- Join session: detect session ID in URL, add player
- Two players see each other moving in real time
- "Waiting for opponent" state with shareable link display

### Phase 3 — Game Mechanics (~45 mins)
- Trail vs territory distinction in board state
- Trail connection detection (trail tile adjacent to own territory)
- Flood fill for enclosed area claiming
- Trail kill: crossing opponent trail destroys it, kills owner
- Cannot enter opponent territory (wall behaviour)
- Respawn logic (back to random tile in own territory)
- Cannot cross own trail

### Phase 4 — Game Flow (~20 mins)
- 3-2-1 countdown to start
- 60-second game timer with display
- Score display (tile count per player, live updating)
- Game end: winner announcement, final scores
- Rematch button (resets board, keeps session)

### Phase 5 — Polish (~30 mins)
- Visual design: colour palette, grid styling
- Smooth movement interpolation between ticks
- Trail visual distinction (lighter shade, subtle pulse)
- Territory claim animation (brief flash/ripple when loop closes)
- Kill/death feedback (screen shake or flash)
- Responsive layout (centre the board, scale for screen)
- Mobile message ("grab a keyboard to play")
- Copy link button for sharing

### Phase 6 — Stretch Goals (if time)
- Weighted tile scoring (inner rings worth more — Goju nod)
- Speed boost on own territory (Splatoon nod)
- Kill counter display
- Spectator mode
- More than 2 players (up to 4)
- Sound effects (claim, kill, countdown)

---

## Experience Design Notes

### What makes this fun
- **Immediate understanding:** leave base, draw trail, close loop, claim land. Learned in one round.
- **Readable risk:** your trail is visually vulnerable. You can see exactly how exposed you are.
- **Constant tension:** the board is so small you always see your opponent. No hiding.
- **Quick rounds:** 60 seconds max. "One more game" is irresistible when rounds are this short.
- **Risk/reward every move:** small safe loop or big greedy one? Hunt their trail or expand into open land?
- **No permanent death:** respawning means comebacks happen. A kill shifts momentum but doesn't end the game. This keeps both players engaged for the full 60 seconds.

### Visual direction
- Clean, minimal grid. Thin lines or subtle cell borders, not heavy.
- Two distinct player colours — warm vs cool (e.g. coral vs teal, amber vs blue)
- Territory: solid, confident colour fill
- Trail: same hue but lighter/translucent — visually reads as "in progress" and "vulnerable"
- The circle (player token): small, centred in its tile, with a subtle shadow or glow
- Fill moment (loop closes): brief satisfying flash across all newly claimed tiles
- Kill moment: brief red flash or shake on the victim's screen
- Board: could have subtle concentric ring markings (nod to Goju / abstract board game heritage)
- Overall: feels like a polished indie game, not a tech demo

### How friends would use this
1. One person creates a game on their laptop
2. Copies the URL, sends it via WhatsApp / Discord / iMessage
3. Friend opens the link — instant join, no sign-up
4. 3-2-1 countdown, 60 seconds of intensity
5. Results screen: "Again?" — hit rematch
6. Best of 3 becomes best of 5 becomes "okay one more"

---

## Write-Up Talking Points (for submission)

These are the things to cover in the design write-up alongside the code:

1. **Why a game, not just a grid:** the brief asked about "how might friends use this" — a shared cursor on a grid isn't something friends would return to. A competitive game is.
2. **Why Paper.io as a reference:** proven mechanic that maps naturally to the brief's constraints (circles, arrow keys, shared state, grid). Adapted for a discrete grid, tiny board, and private 2-player sessions.
3. **Why constant movement:** prevents camping, creates urgency, makes the game feel alive even on a small board.
4. **Why respawn instead of permadeath:** on a 60-second game, permadeath after 10 seconds would be boring for the loser. Respawn keeps both players in it.
5. **Why Vite + Canvas + Firebase:** right tools for the job. Lightweight build, no framework overhead for a game loop rendering 121 coloured squares, real-time sync with zero server code.
6. **What you'd improve with more time:** the stretch goals list, plus playtesting to tune tick speed, board size, starting territory size.

---

## Prompts Log
Keep a running log of prompts used with Claude Code in a `PROMPTS.md` file. Commit after each major phase.

---

## Key Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| Flood fill is buggy | Test with known shapes first. Standard algorithm, well-documented. |
| Firebase latency makes game feel laggy | 300ms tick is forgiving. Smooth visual interpolation between ticks. |
| Two players claim same tile on same tick | Firebase transactions. Last write wins is acceptable at this speed. |
| Constant movement feels too fast on small grid | Tune tick speed. 300ms is a starting point — could go to 400ms if it feels frantic. |
| Game feels too simple | The small grid + constant movement + trail risk creates natural depth. Polish feel before adding mechanics. |
| Trail kill feels unfair | 1-second respawn invulnerability. Keep territory on death. Visual warning when trail is long/exposed. |
| Scope creep | Phase 1-4 is the core submission (~2 hours). Phase 5 is polish. Phase 6 is bonus. Stop at 4 if needed. |
