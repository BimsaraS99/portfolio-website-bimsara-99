# LOOP THIEF — Game Design and Implementation Specification

> **Purpose:** This document is the source of truth for an AI coding agent (such as Claude Code) implementing LOOP THIEF. Read the full document before coding. Build a complete, playable, polished browser game that can be hosted as a static site on GitHub Pages.
>
> **Working title:** LOOP THIEF  
> **Genre:** Single-player time-loop puzzle game  
> **Platform:** Desktop and mobile browsers  
> **Primary goal:** Create a distinctive, easy-to-understand puzzle mechanic with satisfying “aha!” moments and shareable results.  
> **Development approach:** Solo-developer-friendly, small vertical slice first, modular implementation, no backend required for MVP.

---

## 1. Product vision

The player breaks into a secure facility to steal a glowing artifact. Each attempt is short. When a run ends, the player’s actions are recorded as a **ghost** that replays those same actions on subsequent attempts. The player must coordinate with earlier versions of themselves to activate switches, hold doors open, block sensors, and reach the artifact.

**Core promise:** Every failed attempt can become part of the solution.

The game should feel clever rather than punishing. Players should quickly understand what a ghost does, see why a puzzle succeeds or fails, and want to retry immediately.

### Design pillars

1. **Understandable in seconds:** Movement, switches, ghosts, and the objective must be visually clear.
2. **Deterministic puzzles:** Identical inputs from the same starting state produce identical results.
3. **Failure creates progress:** A recorded run becomes a reusable helper, not a wasted attempt.
4. **Fast iteration:** Reset and retry must be nearly instantaneous.
5. **Shareable discoveries:** Solving a room should produce a satisfying result screen and, eventually, a shareable puzzle code or replay.
6. **Static hosting:** The MVP must run entirely client-side and deploy to GitHub Pages.

---

## 2. Scope and non-goals

### MVP must include

- A responsive 2D grid-based game.
- A player character and a short, recorded action sequence for each run.
- Ghosts that replay prior action sequences deterministically.
- Walls, floor, pressure plates, doors, at least one hazard, and an exit/artifact objective.
- A clear run lifecycle: plan/play, record, reset, replay, win.
- At least six handcrafted levels that teach mechanics progressively.
- Keyboard controls and on-screen controls.
- A tutorial level that teaches the ghost mechanic without a long text tutorial.
- Pause/restart controls, level selection, progress persistence, and audio/visual feedback.
- A polished title screen, HUD, win screen, and basic settings.
- Automated tests for core game logic and build validation.
- GitHub Pages deployment configuration.

### Explicitly out of scope for the first release

- Online multiplayer, accounts, cloud saves, or a server.
- User-generated level editor.
- Online leaderboards or global daily-challenge infrastructure.
- Procedural level generation.
- Realistic physics or 3D graphics.
- Monetization or ads.

Do not add these features before the core mechanic is reliable and fun.

---

## 3. Core gameplay model

### 3.1 Room and grid

- Each level is a rectangular grid.
- Each cell has a coordinate `(x, y)` with `(0, 0)` at the top-left.
- The grid contains static terrain and interactive objects.
- A character occupies one grid cell.
- Characters cannot move through walls or closed doors.
- Use a consistent grid size and scale the rendered board to fit the browser viewport.
- Keep the simulation independent from rendering so it can be tested without a browser canvas.

Recommended initial board: approximately 10 columns by 8 rows. Individual levels may use smaller dimensions.

### 3.2 Player and attempts

The player starts each attempt at the level’s configured start position. The player records a sequence of actions. The sequence is replayed alongside all previously created ghosts on the next attempt.

For the MVP, use a **discrete action timeline** instead of free movement. This makes replay synchronization clear and puzzle behaviour reproducible.

Each action consumes one simulation tick. Example actions:

- `MOVE_UP`
- `MOVE_DOWN`
- `MOVE_LEFT`
- `MOVE_RIGHT`
- `INTERACT`
- `WAIT`

The `WAIT` action is important: it allows a player or ghost to remain in place while other characters perform actions. A stationary character stays at its current location until a later movement action changes its position.

### 3.3 Ghost creation

At the end of a recorded attempt, the player’s starting position and action list become a ghost for future attempts.

A ghost:
- Starts at the level’s defined start position.
- Replays the exact recorded actions, in order, one action per tick.
- Does not make decisions, adapt, or pathfind.
- Remains at its final position after its action list ends.
- Can interact with objects under the same rules as the player.
- Is visually distinct from the current player.
- Must be simulated by the game logic, not merely animated visually.

A ghost’s recorded actions should include `WAIT` actions so that timing can be controlled. If an action is blocked by a wall or closed door, the ghost remains in place for that tick; the action is still consumed. This rule must be consistent and explained in the game’s help screen.

### 3.4 Important MVP simplification: planning and execution

Use a clear two-stage run flow:

1. **Planning phase:** The player chooses a sequence of actions using the keyboard or controls. Show a small action timeline.
2. **Execution phase:** Press **Run** to simulate the player’s sequence and all existing ghosts together. The run is resolved tick by tick.
3. **End of run:** If the player wins, show the victory screen. Otherwise, offer **Retry**. On retry, save the just-executed player action sequence as a new ghost, then begin a fresh planning phase.

This is easier to understand and implement than a strict real-time 10-second run. It also lets mobile players plan carefully. The interface may display a 10-second target or optional challenge timer later, but do not make real-time pressure mandatory in the first version.

**Important:** Only add the player’s sequence as a ghost after a failed run. Do not create a ghost from a winning run unless explicitly designed as a later feature. Make the retry button’s behaviour visible and unambiguous.

### 3.5 Attempt and ghost limits

- Initial MVP limit: 3 ghosts per level.
- If a new failed attempt would exceed the limit, do not silently delete an existing ghost.
- Instead, show a clear choice: replace the oldest ghost or restart the level. For the simplest first build, it is acceptable to stop at the limit and prompt the player to restart the level.
- Display the current attempt number and ghost count.
- Allow a full level restart that clears ghosts and recorded actions.
- Allow a retry that preserves prior ghosts and adds the last failed run as a new ghost.

### 3.6 Win condition

The player wins when the **current player character**, not a ghost, reaches the objective tile while all required conditions are met. The level configuration may specify required switches or other conditions.

When the player wins:
- Stop the simulation.
- Ignore further queued actions.
- Play a short visual/audio success effect.
- Show level name, number of attempts, and number of ghosts used.
- Offer **Next Level**, **Replay**, and **Level Select**.
- Save progress locally.

A ghost reaching the exit must not complete the level.

---

## 4. Simulation rules and timing

The game engine must use a deterministic tick-based simulation. Do not rely on CSS animation timing, frame rate, or browser event order to decide puzzle outcomes.

### 4.1 Tick order

At each simulation tick, use the following order consistently:

1. Determine the next action for each active ghost and the current player.
2. Resolve character movement intents against walls, closed doors, and level boundaries.
3. Apply all valid movements simultaneously.
4. Resolve interactions requested on this tick.
5. Recalculate pressure plates, switches, doors, sensors, and other derived world states.
6. Evaluate hazards and failure effects.
7. Evaluate the win condition for the current player.
8. Advance each character’s action index.

The implementation may use a slightly different order if required, but it must be explicitly documented, deterministic, and tested. Avoid accidental dependence on which character is processed first.

### 4.2 Collision policy

For the MVP:
- Characters may share a cell unless a level specifically configures a blocking object. This avoids complicated character-to-character collision rules.
- Movement into a wall, closed door, or outside the grid is blocked.
- If two characters attempt to move into the same cell on the same tick, both movements may be allowed because characters can overlap. This should be the default rule and should be visually readable.
- If two characters try to occupy a switch, the switch is still considered occupied.
- A blocked movement consumes the action tick.

### 4.3 Interactions

`INTERACT` affects the interactive object on the character’s current tile, unless an object explicitly uses adjacent interaction. For the MVP, prefer tile-based interactions.

Recommended simple interaction model:
- Pressure plates activate automatically while occupied.
- Toggle switches change state only when a character uses `INTERACT` on them.
- Doors update from their configured controlling switch/plate.
- The exit is automatically evaluated when the current player occupies it.
- Ghosts can operate switches if their recorded action contains `INTERACT`.

Do not require a separate interaction for pressure plates.

### 4.4 Pressure plates and doors

- A pressure plate is active if at least one eligible character occupies its tile at the end of the movement phase.
- A pressure plate can control one or more doors.
- A door connected to a pressure plate remains open while the plate is active, unless the level specifies a latch behaviour.
- A door connected to a toggle switch stays open/closed according to the switch state.
- Closed doors block movement; open doors do not.
- Visual state must update immediately after the simulation tick.

### 4.5 Hazards

For the MVP, implement one simple hazard type, such as a stationary laser/sensor tile.

Suggested rule:
- If a character occupies an active hazard tile after movement and world-state updates, that character is caught.
- If the current player is caught, the run fails and can be retried.
- If a ghost is caught, it may either stop replaying or reset to its start position. Choose one policy, document it, and use it consistently. Recommended MVP rule: a caught ghost becomes inactive for the rest of the run.
- Do not add moving hazards until the base system works.

### 4.6 Determinism and replay

Given the same level, starting state, existing ghost action sequences, and current player action sequence, the simulation must always produce the same result.

- Simulation logic must be pure or isolated from rendering side effects.
- Do not use random behaviour in puzzle resolution.
- If randomness is added later, use a seeded random number generator and include the seed in the level state.
- Use action indexes rather than elapsed wall-clock time to synchronize ghosts.
- Add unit tests for replay synchronization, blocked movement, pressure plates, doors, hazards, and victory.

---

## 5. Level design rules

Every level must have:
- A unique ID and display name.
- Grid width and height.
- Static terrain.
- Player start position.
- Exit position.
- Interactive objects and their connections.
- A short objective description.
- A tutorial hint, when needed.
- A known intended solution for test validation.

### Level progression

1. **First Echo:** One pressure plate opens one door. The player must record a run that ends on the plate, then use the ghost to pass through the door.
2. **Double Duty:** Two switches or plates must be activated at different positions. Teach timing and `WAIT`.
3. **Laser Hall:** A stationary sensor/laser blocks the route. A ghost must disable or block the sensor.
4. **The Decoy:** Introduce a toggle switch and a misleading route. Teach that ghosts replay actions, not intentions.
5. **Three of You:** The player needs two ghosts in different places at the same time.
6. **The Impossible Door:** Combine pressure plates, a toggle switch, a door, and a hazard.

### Puzzle quality rules

- The player must be able to understand the objective before acting.
- Teach one new mechanic at a time.
- Use clear visual cause and effect.
- Avoid solutions that depend on undocumented timing.
- Avoid requiring pixel-perfect movement.
- Every level must be solvable within the ghost limit.
- Every level must be tested using its intended solution before release.
- Include a way to reset the level and start from a clean state.
- Keep early levels short and satisfying.

---

## 6. Controls and input

### Keyboard

- Arrow keys or `WASD`: choose movement actions.
- `E` or `Space`: interact with a toggle switch on the current tile.
- `Enter`: run the planned sequence.
- `Backspace` or `R`: clear the current planned sequence or reset, but avoid ambiguity. Prefer separate controls for **Undo**, **Clear Plan**, **Retry**, and **Restart Level**.
- `Escape`: pause or open the pause/settings overlay.
- `H`: show controls/help.

Do not bind browser-reserved shortcuts such as `Ctrl+R`. Prevent arrow keys from scrolling the page while the game has focus, without interfering with normal accessibility or text inputs.

### Touch and mouse

- Provide visible directional buttons or a simple D-pad.
- Provide clear **Run**, **Undo**, **Clear Plan**, **Retry**, and **Restart Level** buttons.
- Ensure buttons have adequate touch targets and do not overlap the board.
- Use semantic buttons for menus and controls.
- Support keyboard navigation in menus.

### Input validation

- Ignore gameplay input while a run is executing, while a modal is open, or after victory.
- Prevent duplicate keydown events from adding repeated actions unintentionally.
- Make the currently selected action visible in the plan timeline.
- Give immediate feedback when a plan exceeds the maximum action count.

---

## 7. User interface and screen flow

### 7.1 Title screen

Include:
- Game title: **LOOP THIEF**
- Tagline: **“Every failed attempt becomes part of the plan.”**
- **Play** button.
- **How to Play** button.
- **Level Select** button, enabled when appropriate.
- Settings for sound and reduced motion.
- Small credits/version label.

### 7.2 Main game screen

The layout should prioritize the board.

- **Top HUD:** level name, objective, attempt number, ghost count, pause/settings.
- **Main area:** game grid, player, ghosts, interactive objects, visual effects.
- **Bottom controls:** action timeline, Run, Undo, Clear Plan, Retry, Restart.
- **Optional side panel:** concise current hint and legend.

For small screens, stack the HUD and controls; the board must remain playable without horizontal page scrolling.

### 7.3 How-to-play overlay

Explain these rules in plain language:
1. Plan a short sequence of moves.
2. Press Run to execute it.
3. If you fail, retry to create a ghost that repeats your previous moves.
4. Use ghosts to hold plates, open doors, or operate switches.
5. Reach the exit with your current character.

Include a short animation or a tiny interactive tutorial if practical.

### 7.4 Pause/settings overlay

Include:
- Resume.
- Restart Level.
- Sound on/off.
- Reduced motion on/off.
- Return to Title.

### 7.5 Victory screen

Include:
- Clear success animation.
- Level completed.
- Attempts used.
- Ghosts used.
- Next Level.
- Replay Level.
- Level Select.
- Share result (MVP can use Web Share API where available, with a copy-to-clipboard fallback).

### 7.6 Accessibility

- Do not communicate object states through colour alone; add shapes/icons and/or labels.
- Maintain readable contrast.
- Support keyboard-only navigation for UI.
- Respect reduced-motion preferences.
- Provide sound toggle and do not rely on sound to convey critical information.
- Use descriptive labels and visible focus states.
- Avoid flashing effects that could be harmful.

---

## 8. Visual direction and sound

### Art direction

**Style:** minimalist neon pixel art / crisp geometric 2D.

- Background: deep navy or near-black.
- Player: bright white with cyan outline.
- Ghosts: distinct cyan, violet, and magenta tints with partial transparency.
- Pressure plates: orange/yellow.
- Toggle switches: amber when off and green/cyan when on, plus a shape/state indicator.
- Closed doors: solid red or dark red with a lock symbol.
- Open doors: visibly retracted or transparent.
- Hazards: red beams or red striped tiles.
- Exit/artifact: bright gold/green with a gentle glow.

Keep sprites and tiles readable at small sizes. Do not make every object glow so brightly that the board becomes hard to read.

### Animation

- Short ease-in/ease-out movement between cells.
- Ghosts appear with a brief scanline/glitch effect.
- Active pressure plates visibly depress or illuminate.
- Doors animate opening and closing.
- Victory uses a short burst of particles or a glow.
- Provide reduced-motion mode that disables or minimizes decorative effects.

The simulation must not depend on animation completion.

### Audio

Use small, optional sound effects:
- Move.
- Interact/switch toggle.
- Door open/close.
- Ghost creation.
- Blocked move.
- Hazard/caught.
- Level completion.

Sound can be generated with lightweight Web Audio oscillators or local assets. Start muted if browser autoplay restrictions require it; audio should begin only after user interaction. Include a mute setting.

---

## 9. Visual and interaction feedback

The game must make its internal state legible.

- Each ghost has a distinct colour and a small attempt number label or badge.
- Show the current action timeline and which action is executing.
- Show a ghost’s current action index or progress bar when useful.
- Show a clear blocked-movement cue when a character tries to walk through a wall/closed door.
- Indicate why a door is open, for example by highlighting its connected plate or switch.
- Show whether a hazard is active.
- Explain why the player failed, if possible.
- Show “Ghost created” feedback after retry.
- Show an undo action for planning mistakes.
- Keep the objective visible at all times.

Do not rely on players inferring invisible rules.

---

## 10. Technical architecture

Use:
- **TypeScript**
- **Vite**
- **Phaser 3** for rendering/input/scene handling, or Canvas if the agent has a strong reason to keep dependencies smaller. Prefer Phaser for this specification.
- **Vitest** for unit tests.
- **GitHub Actions + GitHub Pages** for deployment.

Keep game rules independent of Phaser scenes so simulation tests can run in Node.

### Suggested project structure

```text
loop-thief/
├── public/
│   ├── assets/
│   └── favicon.svg
├── src/
│   ├── main.ts
│   ├── game/
│   │   ├── config.ts
│   │   ├── types.ts
│   │   ├── simulation.ts
│   │   ├── actionRecorder.ts
│   │   ├── ghostManager.ts
│   │   ├── levelValidator.ts
│   │   └── saveManager.ts
│   ├── levels/
│   │   ├── index.ts
│   │   ├── level01.ts
│   │   ├── level02.ts
│   │   └── ...
│   ├── scenes/
│   │   ├── BootScene.ts
│   │   ├── MenuScene.ts
│   │   ├── GameScene.ts
│   │   └── UIScene.ts
│   ├── ui/
│   │   ├── controls.ts
│   │   ├── overlays.ts
│   │   └── accessibility.ts
│   ├── styles/
│   │   └── main.css
│   └── tests/
│       ├── simulation.test.ts
│       ├── ghosts.test.ts
│       └── levels.test.ts
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── .github/
│   └── workflows/
│       └── deploy.yml
├── README.md
└── GAME_SPEC.md
```

The agent may adapt the file structure if the result remains modular and testable.

### Suggested domain types

```typescript
export type Direction = "up" | "down" | "left" | "right";

export type Action =
  | { type: "move"; direction: Direction }
  | { type: "interact" }
  | { type: "wait" };

export interface Position {
  x: number;
  y: number;
}

export interface RecordedGhost {
  id: string;
  colorIndex: number;
  startPosition: Position;
  actions: Action[];
}

export interface PlayerPlan {
  actions: Action[];
}

export interface LevelDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  start: Position;
  exit: Position;
  walls: Position[];
  plates: PlateDefinition[];
  switches: SwitchDefinition[];
  doors: DoorDefinition[];
  hazards: HazardDefinition[];
  maxGhosts: number;
  objectiveText: string;
  hint?: string;
}

export interface SimulationResult {
  state: WorldState;
  status: "running" | "won" | "failed";
  failureReason?: string;
}
```

These are starting types, not a mandate to duplicate definitions. Keep type names and rules consistent across the codebase.

### Simulation API

Implement a testable API with equivalents of:

```typescript
createInitialWorld(level)
simulateRun(level, existingGhosts, playerPlan)
validateLevel(level)
```

The exact API can differ, but the simulation should take explicit inputs and return an explicit result. Avoid hidden global state.

### State separation

Keep these separate:
- Static level definition.
- Current simulation state.
- Recorded ghost action sequences.
- Current planned action sequence.
- UI/animation state.
- Persisted player progress and settings.

Do not save Phaser objects or renderer references into localStorage.

---

## 11. Level data and validation

Store levels as data rather than embedding level-specific logic in the renderer.

Each level should be validated before play:
- All coordinates are inside the grid.
- Start and exit are valid traversable cells.
- Doors, plates, switches, and hazards have valid coordinates and IDs.
- Every door reference points to an existing controlling object.
- No invalid duplicate IDs exist.
- Ghost limit is sensible.
- The level has an objective and a display name.

A validation failure should produce a developer-readable error and not a silent broken level.

For the MVP, manually test and unit-test the intended solution for each level. A general-purpose automatic puzzle solver is not required.

---

## 12. Saving and persistence

Use `localStorage` with a versioned schema to save:
- Highest unlocked level.
- Completed level IDs.
- Sound preference.
- Reduced-motion preference.
- Optional best attempt count per level.

Requirements:
- Handle missing, malformed, or outdated saved data without crashing.
- Provide a reset-progress option with a confirmation step.
- Never store secrets or personal information.
- The game must still work if storage is unavailable; persistence can gracefully fall back to session-only progress.
- Avoid saving active simulation objects. Save only serializable data.

---

## 13. Shareability and viral design

Viral growth cannot be guaranteed. Optimize for moments people naturally want to share.

### MVP sharing

- After a win, create a short result string such as: `LOOP THIEF — Level 3 solved in 4 attempts with 2 ghosts`.
- Add a Share button using `navigator.share` where supported.
- Otherwise copy the result to clipboard with a visible success/failure message.
- Add a copyable level identifier or share URL if the level is deterministic and built into the game.

### Later enhancements

- Daily puzzle with a date-derived seed.
- Shareable level codes for user-designed puzzles.
- Ghost replay export/import using compact JSON or a short encoded string.
- A built-in replay viewer for showcasing clever solutions.
- Optional leaderboards only after there is a trustworthy backend and clear anti-cheat requirements.

Do not claim global rankings or online competition if all data is stored locally.

---

## 14. Performance and browser compatibility

- Target modern Chrome, Edge, Firefox, and Safari.
- Keep the initial bundle reasonably small.
- Avoid large external assets or runtime network dependencies.
- The game must remain playable if fonts or optional assets fail to load.
- Handle browser resize and orientation changes.
- Do not require installation or a browser extension.
- Ensure the game works when hosted beneath a repository subpath such as `/loop-thief/`.
- Use Vite’s configurable `base` path rather than hard-coded root-absolute asset URLs.
- Test the production build locally before deployment.
- Avoid autoplaying audio before a user gesture.

---

## 15. GitHub Pages deployment requirements

The repository should deploy automatically from the `main` branch through GitHub Actions.

### Vite configuration

Use a repository-aware base path. For a repository named `loop-thief`:

```typescript
import { defineConfig } from "vite";

export default defineConfig({
  base: "/loop-thief/",
});
```

If the repository name may change, read the base path from an environment variable or document exactly what must be updated.

### Package scripts

Provide at least:
- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run test`
- `npm run typecheck`

### Workflow requirements

- Build the project in CI.
- Run tests and type checks before deployment.
- Upload the production `dist/` directory as the Pages artifact.
- Deploy with the supported GitHub Pages Actions.
- Use minimal required permissions.
- Trigger on pushes to `main` and manual workflow dispatch.
- Document how to enable **Settings → Pages → GitHub Actions**.
- Do not commit build output unless a deliberate alternative deployment method is chosen.

Use current compatible versions of actions and dependencies. Do not assume a workflow succeeded unless it was actually run and verified.

---

## 16. Testing requirements

### Unit tests

At minimum, test:
1. Player can move through floor.
2. Player cannot move through a wall.
3. Player cannot move through a closed door.
4. A blocked action consumes a tick.
5. A ghost replays the correct action sequence.
6. A ghost remains at its final position when its actions end.
7. A pressure plate activates when occupied.
8. A plate-controlled door opens and closes correctly.
9. A toggle switch changes only when interacted with.
10. Ghost interactions work identically to player interactions.
11. A caught ghost follows the defined hazard policy.
12. A hazard causes the correct failure behaviour for the player.
13. A ghost reaching the exit does not win the level.
14. The current player reaching the exit under required conditions wins.
15. Identical inputs produce identical simulation results.
16. Level validation catches invalid coordinates and references.
17. Saving/loading handles malformed localStorage data.
18. Retrying preserves old ghosts and records the previous failed plan.
19. Restarting clears ghosts and plans.
20. Winning stops the run and prevents additional actions.

### Manual QA

Verify:
- The tutorial can be completed by a new player without outside explanation.
- All six levels are solvable.
- The board and controls fit desktop and mobile screens.
- Keyboard controls do not scroll the page unexpectedly.
- Reset/retry labels clearly describe their different effects.
- Audio can be muted.
- Reduced motion works.
- Directly opening the deployed URL works.
- Refreshing a deployed page does not break asset paths.
- The game runs with storage disabled.
- The browser console has no uncaught errors.

---

## 17. Definition of done

The MVP is complete only when all of the following are true:

- [ ] A player can open the game in a browser and start playing without installing anything.
- [ ] The title screen, help overlay, game screen, pause/settings, and victory screen work.
- [ ] The player can create a plan and execute it.
- [ ] A failed run can be replayed as a deterministic ghost.
- [ ] Multiple ghosts can cooperate with the player in the same simulation.
- [ ] Pressure plates, doors, switches, hazards, and exits behave according to this specification.
- [ ] Retry and full restart behave differently and correctly.
- [ ] All six levels are playable and have tested intended solutions.
- [ ] Progress and settings persist safely where browser storage is available.
- [ ] Keyboard and touch controls work.
- [ ] Automated tests, type checking, and production build pass.
- [ ] GitHub Actions deploys the production build to GitHub Pages.
- [ ] The deployed game works at the repository subpath.
- [ ] README explains setup, commands, controls, game rules, and deployment.

---

## 18. Implementation plan for the coding agent

Implement in this order. Do not attempt to build every feature at once.

### Phase A — inspect and scaffold

1. Inspect the existing repository before modifying files.
2. Preserve existing useful code and configuration.
3. If the repository is empty, scaffold Vite + TypeScript + Phaser + Vitest.
4. Add scripts, types, and a minimal README.
5. Confirm the development server and production build work.

### Phase B — simulation first

1. Implement the grid, actions, world state, and deterministic tick system.
2. Implement player movement and walls.
3. Implement action recording and ghost replay.
4. Implement plates, switches, doors, hazards, and exit logic.
5. Write unit tests before adding complex rendering.

### Phase C — playable vertical slice

1. Render one complete level.
2. Add action planning and the Run button.
3. Add ghost creation, retry, and full restart.
4. Make one level that cannot be solved without a ghost.
5. Play it end-to-end and fix rule ambiguities.

### Phase D — content and polish

1. Build the remaining five levels.
2. Add title screen, tutorial, HUD, pause/settings, and victory screen.
3. Add sound, animation, mobile controls, and accessibility options.
4. Add local persistence and result sharing.
5. Test all levels and responsive layouts.

### Phase E — deployment

1. Configure the correct Vite base path.
2. Add GitHub Actions for test, typecheck, build, and Pages deployment.
3. Run all checks locally.
4. Verify the GitHub Pages deployment and asset paths.
5. Update README with the live URL only after it has been verified.

---

## 19. Instructions to the coding agent

- Read this entire file before making changes.
- Treat this document as the design source of truth.
- Inspect the repository and report its existing structure before replacing files.
- Work in small, verifiable stages.
- Prefer readable, maintainable TypeScript over clever abstractions.
- Keep simulation rules independent from animation and rendering.
- Do not silently change game rules; document any necessary deviation.
- Do not leave core features as TODOs, mock buttons, or non-functional placeholders.
- Do not claim tests or deployment passed unless they were actually run.
- If a feature is too large for the current phase, implement the MVP version described here and document the deferred enhancement.
- After each phase, run the relevant tests and build, fix failures, and summarize the files changed.
- Prioritize a complete, fun, deterministic one-level experience over unfinished breadth.
- Once the vertical slice works, continue through the remaining phases unless blocked by a real dependency or missing access.

**First task:** inspect the repository, identify whether it is empty or already contains a project, and then implement Phase A followed by Phase B. Do not start with decorative art or menus before the simulation rules and tests are reliable.
