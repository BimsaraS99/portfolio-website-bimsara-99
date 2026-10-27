# LOOP THIEF

A time-loop heist puzzle: every failed run becomes a ghost that replays your exact moves on later attempts.
Lives at `/games/loop-thief/` on bimsara.online and is linked from the Playground page (`/games.html`).
The design source of truth is [GAME_SPEC.md](GAME_SPEC.md).

## Run it

No build step. Serve the repository root with any static server and open the game:

```sh
python -m http.server 8000
# http://localhost:8000/games/loop-thief/
```

Opening the HTML file directly (`file://`) also works. Add `#play` to the URL to skip the title screen.

## Tests

```sh
node --test games/loop-thief/tests/*.test.js
```

- `simulation.test.js` covers the 20 rule cases from spec §16, plus a few edge cases.
- `levels.test.js` checks every level. Each one has to:
  - pass validation
  - be won by its intended solution within the ghost and action limits
  - fail if any one ghost is removed
  - be impossible solo (a breadth-first search over every plan the player could make alone)

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | Arrows / WASD | D-pad |
| Use switch | E / Space | USE |
| Wait one tick | Q / . | WAIT |
| Run plan | Enter | RUN |
| Undo / clear plan | Backspace / C | Undo / Clear plan |
| Pause & settings / help | Esc / H | ❚❚ / ? |

## Rules (as implemented)

Each action takes one tick. Every tick resolves in this order:

1. Read each character's next action. A character whose plan has ended waits.
2. Check moves against walls, the grid edge and *closed* doors, using door states from the end of the previous tick.
3. Apply all moves at once. Characters may share a tile.
4. Run interactions. A switch flips at most once per tick, however many characters use it.
5. Recompute plates, doors and lasers.
6. Anyone on an active laser is caught. A caught ghost stops for the rest of the run and no longer presses plates.
7. The player (never a ghost) wins on the vault tile.
8. Advance the tick.

Other rules:

- A blocked move still uses up its tick.
- A door never closes on someone standing in the doorway.
- **Retry** saves the failed plan as a new ghost. **Edit plan** goes back to planning with the same plan and no new ghost. **Restart level** clears all ghosts.
- At the ghost limit, a retry offers to replace the oldest ghost; existing ghosts are never deleted silently.

## Level format

Levels are data in `js/levels.js`. The map legend:

| Tile | Meaning |
| --- | --- |
| `#` | wall |
| `.` | floor |
| `S` | start |
| `X` | vault |
| `a`–`h` | plates |
| `1`–`9` | toggle switches |
| `A`–`H` | doors (opened by the plate with the same lowercase letter unless `doors` says otherwise) |
| `!` `%` | lasers (always on unless `hazards` gives them `offBy` controllers) |

Each level also lists a `solution`, which the tests replay.

## Deviations from the spec

- **Plain JavaScript and Canvas 2D instead of TypeScript, Vite and Phaser, and no GitHub Actions workflow.** The portfolio is a static GitHub Pages site with no build step. A bundler pipeline would change how the whole site deploys. The game deploys like every other page, works under any path because it uses relative URLs, and has no dependencies.
- **Simulation tests use Node's built-in runner instead of Vitest.**
- **Files:**
  - `js/simulation.js` holds the pure rules plus the attempts/ghosts session logic (spec's `ghostManager`).
  - `js/save.js` is the versioned localStorage save.
  - `js/render.js` is the canvas renderer. It never affects the rules.
  - `js/main.js` handles UI, input and audio.
  - `js/attract.js` runs the demo on the Playground card.
