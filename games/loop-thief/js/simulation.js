/* LOOP THIEF — deterministic tick simulation.
   Pure logic only (no DOM, no timing). Loads as a browser global (window.LoopThief)
   and as a Node module for the tests.

   Actions: U D L R (move), I (interact), W (wait). One action = one tick.

   Tick order (documented in README):
     1. read each active character's action for this tick (W once a plan has ended)
     2. resolve moves against walls / closed doors / bounds (door states from the previous tick)
     3. apply all moves simultaneously (characters may overlap)
     4. resolve interactions: each switch toggles at most once per tick
     5. recompute plates, doors and lasers
     6. catch anyone standing on an active laser (caught ghosts go inactive)
     7. check the win condition for the current player only
     8. advance the tick
*/
(function (root) {
  'use strict';

  const MOVES = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
  const ACTIONS = ['U', 'D', 'L', 'R', 'I', 'W'];
  const HAZARD_CHARS = '!%';

  const key = (x, y) => x + ',' + y;

  /* ---------- Level parsing & validation ---------- */

  // Map legend: # wall · . floor · S start · X vault (exit)
  //             a–h pressure plate · 1–9 toggle switch · A–H door · ! % laser
  function parseLevel(def) {
    const errors = validateLevel(def);
    if (errors.length) throw new Error('Invalid level "' + (def && def.id) + '":\n  ' + errors.join('\n  '));
    const lv = {
      id: def.id, name: def.name, objective: def.objective, hint: def.hint || '',
      width: def.map[0].length, height: def.map.length,
      maxGhosts: def.maxGhosts, maxActions: def.maxActions || 24,
      requires: def.requires || [],
      walls: new Set(), plates: [], switches: [], doors: [], hazards: [],
      start: null, exit: null
    };
    def.map.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        if (c === '#') lv.walls.add(key(x, y));
        else if (c === 'S') lv.start = { x, y };
        else if (c === 'X') lv.exit = { x, y };
        else if (c >= 'a' && c <= 'h') lv.plates.push({ id: c, x, y });
        else if (c >= '1' && c <= '9') lv.switches.push({ id: c, x, y });
        else if (c >= 'A' && c <= 'H') {
          const cfg = (def.doors || {})[c] || {};
          lv.doors.push({ id: c + lv.doors.length, group: c, x, y,
            by: cfg.by || [c.toLowerCase()], mode: cfg.mode || 'any', invert: !!cfg.invert });
        } else if (HAZARD_CHARS.includes(c)) {
          const cfg = (def.hazards || {})[c] || {};
          lv.hazards.push({ id: 'h' + lv.hazards.length, x, y, offBy: cfg.offBy || [] });
        }
      }
    });
    return lv;
  }

  function validateLevel(def) {
    const errs = [];
    if (!def || typeof def !== 'object') return ['level is not an object'];
    if (!def.id) errs.push('missing id');
    if (!def.name) errs.push('missing name');
    if (!def.objective) errs.push('missing objective');
    if (!Array.isArray(def.map) || !def.map.length) return errs.concat('missing map');
    const w = def.map[0].length;
    const ids = new Set(), seen = { S: 0, X: 0 };
    def.map.forEach((row, y) => {
      if (row.length !== w) errs.push('row ' + y + ' has width ' + row.length + ', expected ' + w);
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        if (c === 'S' || c === 'X') seen[c]++;
        else if ((c >= 'a' && c <= 'h') || (c >= '1' && c <= '9')) {
          if (ids.has(c)) errs.push('duplicate controller "' + c + '"');
          ids.add(c);
        } else if (!('#.'.includes(c) || (c >= 'A' && c <= 'H') || HAZARD_CHARS.includes(c))) {
          errs.push('unknown tile "' + c + '" at ' + key(x, y));
        }
      }
    });
    if (seen.S !== 1) errs.push('needs exactly one start (S), found ' + seen.S);
    if (seen.X !== 1) errs.push('needs exactly one vault (X), found ' + seen.X);
    const refs = (list, where) => list.forEach(id => { if (!ids.has(id)) errs.push(where + ' references missing controller "' + id + '"'); });
    const doorChars = new Set(def.map.join('').split('').filter(c => c >= 'A' && c <= 'H'));
    doorChars.forEach(c => refs(((def.doors || {})[c] || {}).by || [c.toLowerCase()], 'door ' + c));
    Object.keys(def.doors || {}).forEach(c => { if (!doorChars.has(c)) errs.push('door config "' + c + '" has no tile'); });
    Object.keys(def.hazards || {}).forEach(c => refs(def.hazards[c].offBy || [], 'laser ' + c));
    refs(def.requires || [], 'requires');
    if (!Number.isInteger(def.maxGhosts) || def.maxGhosts < 0 || def.maxGhosts > 3) errs.push('maxGhosts must be 0–3');
    return errs;
  }

  /* ---------- World ---------- */

  function createInitialWorld(level, ghosts, plan) {
    const chars = (ghosts || []).map((g, i) => ({
      id: g.id || 'g' + i, kind: 'ghost', color: g.colorIndex == null ? i : g.colorIndex,
      x: level.start.x, y: level.start.y, actions: g.actions, caught: false, action: null, bumped: null
    }));
    chars.push({ id: 'player', kind: 'player', color: -1,
      x: level.start.x, y: level.start.y, actions: plan || [], caught: false, action: null, bumped: null });
    const switches = {};
    level.switches.forEach(s => { switches[s.id] = false; });
    const world = { tick: 0, chars, switches, plates: {}, doors: {}, hazards: {}, status: 'running', failureReason: '', events: [] };
    derive(level, world);
    return world;
  }

  function controllerOn(world, id) {
    return id in world.plates ? world.plates[id] : !!world.switches[id];
  }

  function derive(level, world) {
    const active = world.chars.filter(c => !c.caught);
    const occupied = (x, y) => active.some(c => c.x === x && c.y === y);
    level.plates.forEach(p => { world.plates[p.id] = occupied(p.x, p.y); });
    level.doors.forEach(d => {
      const vals = d.by.map(id => controllerOn(world, id));
      let open = d.mode === 'all' ? vals.every(Boolean) : vals.some(Boolean);
      if (d.invert) open = !open;
      // A door never closes on someone standing in the doorway.
      world.doors[d.id] = open || occupied(d.x, d.y);
    });
    level.hazards.forEach(h => {
      world.hazards[h.id] = !(h.offBy.length && h.offBy.some(id => controllerOn(world, id)));
    });
  }

  function isBlocked(level, world, x, y) {
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) return true;
    if (level.walls.has(key(x, y))) return true;
    const door = level.doors.find(d => d.x === x && d.y === y);
    return !!door && !world.doors[door.id];
  }

  function step(level, prev) {
    const world = {
      tick: prev.tick, status: prev.status, failureReason: '', events: [],
      chars: prev.chars.map(c => Object.assign({}, c, { action: null, bumped: null })),
      switches: Object.assign({}, prev.switches),
      plates: Object.assign({}, prev.plates), doors: Object.assign({}, prev.doors), hazards: Object.assign({}, prev.hazards)
    };
    if (world.status !== 'running') return world;

    // 1–3: intents, collision against the previous tick's doors, simultaneous apply
    const targets = world.chars.map(c => {
      const act = c.caught ? 'W' : (c.actions[world.tick] || 'W');
      c.action = c.caught || world.tick >= c.actions.length ? null : act;
      const mv = MOVES[act];
      if (!mv) return [c.x, c.y];
      const nx = c.x + mv[0], ny = c.y + mv[1];
      if (isBlocked(level, prev, nx, ny)) { c.bumped = act; world.events.push({ type: 'bump', char: c.id }); return [c.x, c.y]; }
      world.events.push({ type: 'move', char: c.id });
      return [nx, ny];
    });
    world.chars.forEach((c, i) => { c.x = targets[i][0]; c.y = targets[i][1]; });

    // 4: interactions — a switch flips once per tick no matter how many hands touch it
    const flips = new Set();
    world.chars.forEach(c => {
      if (c.action !== 'I') return;
      const sw = level.switches.find(s => s.x === c.x && s.y === c.y);
      if (sw) flips.add(sw.id); else world.events.push({ type: 'fizzle', char: c.id });
    });
    flips.forEach(id => { world.switches[id] = !world.switches[id]; world.events.push({ type: 'toggle', id, on: world.switches[id] }); });

    // 5: derived world state
    derive(level, world);
    level.doors.forEach(d => {
      if (world.doors[d.id] !== prev.doors[d.id]) world.events.push({ type: world.doors[d.id] ? 'doorOpen' : 'doorClose', id: d.id });
    });

    // 6: lasers
    world.chars.forEach(c => {
      if (c.caught) return;
      const hz = level.hazards.find(h => h.x === c.x && h.y === c.y);
      if (hz && world.hazards[hz.id]) { c.caught = true; world.events.push({ type: 'caught', char: c.id }); }
    });
    // Caught characters stop pressing plates; refresh so doors react the same tick.
    if (world.events.some(e => e.type === 'caught')) derive(level, world);

    // 7: win / fail for the current player only
    const player = world.chars[world.chars.length - 1];
    if (player.caught) {
      world.status = 'failed'; world.failureReason = 'You walked into an active laser.';
    } else if (player.x === level.exit.x && player.y === level.exit.y && level.requires.every(id => controllerOn(world, id))) {
      world.status = 'won'; world.events.push({ type: 'win' });
    }

    // 8
    world.tick++;
    return world;
  }

  function simulateRun(level, ghosts, plan) {
    let world = createInitialWorld(level, ghosts, plan);
    const frames = [world];
    const length = Math.max(plan.length, ...(ghosts || []).map(g => g.actions.length), 0);
    while (world.status === 'running' && world.tick < length) {
      world = step(level, world);
      frames.push(world);
    }
    if (world.status === 'running') {
      world.status = 'failed';
      world.failureReason = 'Your plan ended before you reached the vault.';
    }
    return { status: world.status, failureReason: world.failureReason, frames, final: world };
  }

  /* ---------- Session: attempts & ghosts ---------- */

  function createSession(level) {
    return { levelId: level.id, maxGhosts: level.maxGhosts, attempt: 1, ghosts: [], plan: [] };
  }

  function nextColor(ghosts) {
    for (let i = 0; i < 3; i++) if (!ghosts.some(g => g.colorIndex === i)) return i;
    return 0;
  }

  // Retry keeps old ghosts and records the failed plan as a new one.
  function retry(session, failedPlan, replaceOldest) {
    const ghosts = session.ghosts.slice();
    if (ghosts.length >= session.maxGhosts) {
      if (!replaceOldest || !ghosts.length) return { ok: false, reason: 'limit', session };
      ghosts.shift();
    }
    ghosts.push({ id: 'g' + session.attempt, attempt: session.attempt, colorIndex: nextColor(ghosts), actions: failedPlan.slice() });
    return { ok: true, session: Object.assign({}, session, { attempt: session.attempt + 1, ghosts, plan: [] }) };
  }

  // Edit keeps the ghosts and the plan, without creating a ghost (still counts as an attempt).
  function edit(session, failedPlan) {
    return Object.assign({}, session, { attempt: session.attempt + 1, plan: failedPlan.slice() });
  }

  function restart(session) {
    return Object.assign({}, session, { attempt: 1, ghosts: [], plan: [] });
  }

  const api = { ACTIONS, MOVES, parseLevel, validateLevel, createInitialWorld, step, simulateRun,
    createSession, retry, edit, restart, controllerOn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LoopThief = Object.assign(root.LoopThief || {}, api);
})(typeof window !== 'undefined' ? window : globalThis);
