/* LOOP THIEF — game controller: screens, input, audio and the run loop. */
(function () {
  'use strict';
  const LT = window.LoopThief, Save = LT.Save;
  const $ = s => document.querySelector(s);
  const SYM = { U: '↑', D: '↓', L: '←', R: '→', I: 'E', W: '·' };
  const NAME = { U: 'Up', D: 'Down', L: 'Left', R: 'Right', I: 'Use', W: 'Wait' };
  const KEYMAP = {
    ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R',
    KeyW: 'U', KeyS: 'D', KeyA: 'L', KeyD: 'R', KeyE: 'I', Space: 'I', KeyQ: 'W', Period: 'W'
  };
  const GHOST_NAMES = ['cyan', 'violet', 'magenta'];

  let storage = null;
  try { storage = window.localStorage; storage.getItem('x'); } catch (e) { storage = null; }
  const memory = { data: null, getItem() { return this.data; }, setItem(k, v) { this.data = v; } };
  const store = storage || memory;

  const S = {
    save: Save.load(store),
    idx: 0, def: null, level: null, session: null,
    mode: 'title',          // title | plan | run | result
    run: null, runStart: 0, seg: -1, lastResult: null,
    spawn: {}, lastTime: 0, confirmReset: false, overlayReturn: null
  };
  const reducedPref = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const reduced = () => S.save.reducedMotion == null ? reducedPref : S.save.reducedMotion;
  const persist = () => Save.save(store, S.save);
  const tickMs = () => reduced() ? 170 : 260;

  const renderer = new LT.Renderer($('#board'));

  /* ---------- Audio (Web Audio blips, only after a user gesture) ---------- */
  let ac = null;
  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!S.save.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      const t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(vol || .05, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
      o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + dur + .02);
    } catch (e) { /* audio is optional */ }
  }
  const sfx = {
    plan: () => tone(880, .04, 'square', .025),
    move: () => tone(240, .05, 'triangle', .05, 200),
    bump: () => tone(110, .1, 'sawtooth', .05, 70),
    toggle: () => { tone(660, .06, 'square', .04); tone(990, .08, 'square', .04, null, .06); },
    doorOpen: () => tone(200, .16, 'triangle', .06, 520),
    doorClose: () => tone(480, .16, 'triangle', .05, 160),
    ghost: () => [440, 660, 880].forEach((f, i) => tone(f, .12, 'triangle', .05, null, i * .07)),
    caught: () => tone(320, .4, 'sawtooth', .07, 50),
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .18, 'square', .045, null, i * .09)),
    fail: () => tone(220, .3, 'triangle', .05, 110)
  };

  /* ---------- Level & session ---------- */

  function loadLevel(i) {
    S.idx = Math.max(0, Math.min(LT.LEVELS.length - 1, i));
    S.def = LT.LEVELS[S.idx];
    S.level = LT.parseLevel(S.def);
    S.session = LT.createSession(S.level);
    S.spawn = {};
    renderer.setLevel(S.level);
    enterPlan();
    layout();
  }

  function enterPlan() {
    S.mode = 'plan'; S.run = null; S.seg = -1;
    refresh();
  }

  function planFrame() { return LT.createInitialWorld(S.level, S.session.ghosts, S.session.plan); }

  // Preview of where the plan walks, treating doors as passable and ignoring timing.
  function planPath() {
    const lv = S.level; let x = lv.start.x, y = lv.start.y;
    const pts = [[x, y]];
    S.session.plan.forEach(a => {
      const m = LT.MOVES[a]; if (!m) return;
      const nx = x + m[0], ny = y + m[1];
      if (nx < 0 || ny < 0 || nx >= lv.width || ny >= lv.height || lv.walls.has(nx + ',' + ny)) return;
      x = nx; y = ny; pts.push([x, y]);
    });
    return pts;
  }

  function ghostTrails() {
    if (!S.session.ghosts.length) return [];
    const r = LT.simulateRun(S.level, S.session.ghosts, []);
    return S.session.ghosts.map((g, i) => ({
      colorIndex: g.colorIndex,
      points: r.frames.map(f => [f.chars[i].x, f.chars[i].y]).filter((p, j, arr) => !j || p[0] !== arr[j - 1][0] || p[1] !== arr[j - 1][1])
    }));
  }

  function addAction(a) {
    if (S.mode !== 'plan' || overlayOpen()) return;
    if (S.session.plan.length >= S.level.maxActions) { toast('Plan is full — ' + S.level.maxActions + ' actions max'); sfx.bump(); bumpTimeline(); return; }
    S.session = Object.assign({}, S.session, { plan: S.session.plan.concat(a) });
    sfx.plan(); refresh();
  }
  function undo() { if (S.mode === 'plan' && S.session.plan.length) { S.session = Object.assign({}, S.session, { plan: S.session.plan.slice(0, -1) }); refresh(); } }
  function clearPlan() { if (S.mode === 'plan') { S.session = Object.assign({}, S.session, { plan: [] }); refresh(); } }

  function startRun() {
    if (S.mode !== 'plan' || overlayOpen()) return;
    if (!S.session.plan.length) { toast('Add some moves first'); bumpTimeline(); return; }
    S.run = LT.simulateRun(S.level, S.session.ghosts, S.session.plan);
    S.mode = 'run'; S.runStart = performance.now(); S.seg = -1;
    refresh();
  }

  function finishRun() {
    const r = S.run;
    S.mode = 'result';
    if (r.status === 'won') {
      sfx.win();
      const ex = S.level.exit;
      for (let i = 0; i < (reduced() ? 1 : 4); i++) setTimeout(() => renderer.burst(ex.x, ex.y, ['#fde047', '#22d3ee', '#f472b6', '#a3e635'][i], reduced() ? 20 : 45, 1.3), i * 140);
      S.save = Save.recordWin(S.save, S.idx, S.def.id, S.session.attempt); persist();
      setTimeout(showWin, reduced() ? 200 : 800);
    } else {
      sfx.fail();
      setTimeout(showFail, 350);
    }
    refresh();
  }

  function retry(replace) {
    const plan = S.run ? S.run.frames[0].chars[S.run.frames[0].chars.length - 1].actions : S.session.plan;
    const res = LT.retry(S.session, plan, replace);
    if (!res.ok) { showFail(); return; }
    S.session = res.session;
    const g = S.session.ghosts[S.session.ghosts.length - 1];
    S.spawn[g.id] = performance.now();
    sfx.ghost();
    renderer.burst(S.level.start.x, S.level.start.y, LT.COLORS.ghosts[g.colorIndex], reduced() ? 10 : 30);
    toast('Ghost ' + g.attempt + ' created — it will repeat that run');
    closeOverlay(); enterPlan();
  }
  function editPlan() {
    const plan = S.run.frames[0].chars[S.run.frames[0].chars.length - 1].actions;
    S.session = LT.edit(S.session, plan);
    closeOverlay(); enterPlan();
  }
  function restartLevel() {
    S.session = LT.restart(S.session); S.spawn = {};
    closeOverlay(); enterPlan(); toast('Level restarted — ghosts cleared');
  }

  /* ---------- HUD, timeline, controls ---------- */

  function refresh() {
    const lv = S.level, sess = S.session;
    if (!lv) return;
    $('#lvlNum').textContent = String(S.idx + 1).padStart(2, '0');
    $('#lvlName').textContent = lv.name;
    $('#objective').textContent = lv.objective;
    $('#attempt').textContent = sess.attempt;
    $('#ghostCount').textContent = sess.ghosts.length + '/' + lv.maxGhosts;
    $('#planCount').textContent = sess.plan.length + '/' + lv.maxActions;
    const showHint = S.idx === 0 || sess.attempt >= 2;
    $('#hint').hidden = !showHint || !lv.hint;
    $('#hint span').textContent = lv.hint;
    $('#coach').textContent = coachText();
    $('#coach').hidden = !$('#coach').textContent;

    const planning = S.mode === 'plan';
    document.querySelectorAll('[data-act], #btnUndo, #btnClear, #btnRun').forEach(b => { b.disabled = !planning; });
    $('#btnRun').classList.toggle('is-ready', planning && sess.plan.length > 0);
    $('#status').textContent = planning ? 'PLANNING' : S.mode === 'run' ? 'RUNNING' : S.run && S.run.status === 'won' ? 'SUCCESS' : 'FAILED';
    $('#status').dataset.mode = S.mode;
    renderTimeline();
  }

  function coachText() {
    if (S.idx !== 0 || S.mode !== 'plan') return '';
    if (!S.session.ghosts.length) return S.session.plan.length ? 'End on the orange plate, then press RUN.' : 'Plan your moves: walk onto the orange plate ←';
    return 'Your ghost will hold the plate. Now plan your way through the door →';
  }

  function chip(a, i, cls) {
    return '<span class="chip ' + (cls || '') + '" title="' + NAME[a] + '" data-i="' + i + '">' + SYM[a] + '</span>';
  }

  function renderTimeline() {
    const cur = S.mode === 'run' ? S.seg : S.mode === 'result' && S.run ? S.run.final.tick - 1 : -1;
    const rows = S.session.ghosts.map(g => {
      const chips = g.actions.map((a, i) => chip(a, i, i === cur ? 'now' : i < cur ? 'done' : '')).join('');
      return '<div class="trow" style="--gc:' + LT.COLORS.ghosts[g.colorIndex] + '"><b>G' + g.attempt + '</b><div class="chips">' + chips + '</div></div>';
    });
    const plan = S.session.plan.length
      ? S.session.plan.map((a, i) => chip(a, i, i === cur ? 'now' : i < cur ? 'done' : '')).join('')
      : '<em>Empty plan — use the arrows, E (use) and Q (wait)</em>';
    rows.push('<div class="trow trow--you"><b>YOU</b><div class="chips">' + plan + '</div></div>');
    $('#timeline').innerHTML = rows.join('');
    const now = $('#timeline .trow--you .now') || $('#timeline .trow--you .chip:last-child');
    if (now && now.scrollIntoView && S.mode !== 'title') now.parentElement.scrollLeft = now.offsetLeft - now.parentElement.clientWidth / 2;
  }

  function bumpTimeline() {
    const el = $('#timeline'); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------- Overlays ---------- */

  const overlayOpen = () => !$('#overlay').hidden;
  function openOverlay(html, cls) {
    stopDemo();
    if (cls !== 'overlay--help') S.helpPage = null;
    const ov = $('#overlay');
    ov.className = 'overlay ' + (cls || '');
    ov.innerHTML = '<div class="panel" role="dialog" aria-modal="true">' + html + '</div>';
    ov.hidden = false;
    const first = ov.querySelector('[autofocus]') || ov.querySelector('button');
    if (first) first.focus();
  }
  function closeOverlay() { stopDemo(); S.helpPage = null; $('#overlay').hidden = true; $('#overlay').innerHTML = ''; S.confirmReset = false; }

  const btn = (cmd, text, cls, extra) => '<button class="pbtn ' + (cls || '') + '" data-cmd="' + cmd + '"' + (extra || '') + '>' + text + '</button>';
  const toggles = () =>
    '<div class="toggles">' +
    btn('sound', (S.save.sound ? '🔊 Sound on' : '🔇 Sound off'), 'pbtn--ghost', ' aria-pressed="' + S.save.sound + '"') +
    btn('motion', (reduced() ? '◼ Reduced motion' : '▶ Full motion'), 'pbtn--ghost', ' aria-pressed="' + reduced() + '"') +
    '</div>';

  function showTitle() {
    S.mode = 'title';
    const cont = S.save.completed.length ? 'Continue · Level ' + Math.min(S.save.unlocked, LT.LEVELS.length) : 'Play';
    openOverlay(
      '<div class="logo" data-text="LOOP THIEF">LOOP THIEF</div>' +
      '<p class="tagline">Every failed attempt becomes part of the plan.</p>' +
      '<div class="pstack">' + btn('play', '▶ ' + cont, 'pbtn--primary', ' autofocus') +
      btn('help', 'How to play') + btn('levels', 'Level select') + '</div>' + toggles() +
      '<p class="credits">v1.0 · a Playground game by Bimsara S. Kahandawala</p>', 'overlay--title');
  }

  /* How-to-play guide: paged, each page optionally runs a live demo through the real simulation. */
  const demoDef = (id, map, extra) => Object.assign({ id, name: id, objective: '-', maxGhosts: 3, map }, extra);
  const HELP = [
    {
      title: 'The heist',
      demo: { def: demoDef('h1', ['#########', '#S.....X#', '#########']), plan: ['R', 'R', 'R', 'R', 'R', 'R'] },
      body:
        '<p>You are the <b class="c-you">thief</b> (white). Your goal in every level is to reach the glowing ' +
        '<b class="c-gold">artifact</b> ◆ in the vault.</p>' +
        '<p>You don\'t steer in real time. Instead, each attempt has two phases:</p>' +
        '<ol class="rules"><li><b>Plan</b> — queue up a list of actions. They appear in the <b>timeline</b> on the right, and a dotted line previews your route.</li>' +
        '<li><b>Run</b> — press <b>▶ RUN</b> and watch the plan play out, one action per <b>tick</b>.</li></ol>' +
        '<p>Every action — moving, waiting or using a switch — takes exactly one tick.</p>'
    },
    {
      title: 'Ghosts: your past selves',
      demo: { def: demoDef('h2', ['#########', '#a..S.AX#', '#########']), ghosts: [['L', 'L', 'L']], plan: ['W', 'W', 'W', 'R', 'R', 'R'] },
      body:
        '<p>Here the red door only opens while someone stands on the orange plate — so you can\'t do it alone.</p>' +
        '<ol class="rules"><li><b>Attempt 1:</b> plan a run that walks onto the plate and stays there. It fails — you never reached the vault.</li>' +
        '<li>Press <b>Retry</b>. That failed run becomes <b class="c-ghost">Ghost 1</b>.</li>' +
        '<li><b>Attempt 2:</b> the ghost repeats your old moves exactly, at the same time as your new plan. It holds the plate; you walk through the door.</li></ol>' +
        '<p>Ghosts never think or adapt. They copy actions, tick for tick — so <b>timing</b> is part of every solution.</p>'
    },
    {
      title: 'Switches & lasers',
      demo: { def: demoDef('h3', ['#######', '#1S!.X#', '#######'], { hazards: { '!': { offBy: ['1'] } } }), ghosts: [['L', 'I']], plan: ['W', 'W', 'R', 'R', 'R'] },
      body:
        '<div class="legend">' +
        '<span><i class="lg lg--plate"></i><span><b>Plate</b> — active only while someone stands on it. Releases as soon as they step off.</span></span>' +
        '<span><i class="lg lg--switch"></i><span><b>Switch</b> — flips ON/OFF only when someone stands on it and presses <b>USE</b> (<kbd>E</kbd>). It stays flipped.</span></span>' +
        '<span><i class="lg lg--door"></i><span><b>Door</b> — a padlock means closed. Dashed wires show which plate or switch controls it; they glow when active.</span></span>' +
        '<span><i class="lg lg--laser"></i><span><b>Laser</b> — catches anyone (ghosts too) standing in it while it\'s on. Some are wired to a plate or switch; striped ones with no wire never turn off.</span></span>' +
        '<span><i class="lg lg--exit"></i><span><b>Artifact</b> — only <b>you</b> can take it. A ghost reaching it does nothing.</span></span>' +
        '</div><p>In the demo, the ghost walks to the switch and uses it, which turns the laser off so you can pass.</p>'
    },
    {
      title: 'Rules of time',
      body:
        '<ul class="rules rules--list">' +
        '<li><b>Everyone moves at once.</b> Each tick, you and all ghosts act simultaneously. Characters can share a tile.</li>' +
        '<li><b>Bumping wastes the tick.</b> Walking into a wall or a closed door keeps you in place, but the action is still used up.</li>' +
        '<li><b>Doors react next tick.</b> A door that opens this tick can be walked through from the next tick on — add a <b>WAIT</b> if you arrive too early.</li>' +
        '<li><b>Doors never close on someone.</b> While anyone stands in a doorway it stays open.</li>' +
        '<li><b>When a plan ends, that character stands still</b> — a ghost parked on a plate keeps holding it for the rest of the run.</li>' +
        '<li><b>Caught ghosts drop out.</b> A ghost caught by a laser stops for the rest of that run and no longer presses plates.</li>' +
        '<li><b>Ghost limit.</b> Each level allows a set number of ghosts (shown in the HUD). At the limit you can replace the oldest one.</li>' +
        '</ul><p class="tip">💡 The game is fully deterministic: the same plans always give the same result.</p>'
    },
    {
      title: 'Controls & buttons',
      body:
        '<table class="keys"><thead><tr><th>Action</th><th>Keyboard</th><th>Touch</th></tr></thead><tbody>' +
        '<tr><td>Move</td><td><kbd>↑↓←→</kbd> or <kbd>WASD</kbd></td><td>D-pad</td></tr>' +
        '<tr><td>Use switch</td><td><kbd>E</kbd> / <kbd>Space</kbd></td><td>USE</td></tr>' +
        '<tr><td>Wait one tick</td><td><kbd>Q</kbd></td><td>WAIT</td></tr>' +
        '<tr><td>Run plan</td><td><kbd>Enter</kbd></td><td>▶ RUN</td></tr>' +
        '<tr><td>Undo / clear</td><td><kbd>Backspace</kbd> / <kbd>C</kbd></td><td>Undo / Clear plan</td></tr>' +
        '<tr><td>Pause · help</td><td><kbd>Esc</kbd> · <kbd>H</kbd></td><td>❚❚ · ?</td></tr></tbody></table>' +
        '<p><b>After a failed run you choose:</b></p>' +
        '<ul class="rules rules--list">' +
        '<li><b>↺ Retry</b> — keeps your ghosts and turns the failed run into a new ghost.</li>' +
        '<li><b>✎ Edit plan</b> — no ghost is made; your plan comes back so you can tweak it.</li>' +
        '<li><b>⟲ Restart level</b> — clears every ghost and starts from scratch.</li></ul>'
    },
    {
      title: 'Thief tips',
      body:
        '<ul class="rules rules--list">' +
        '<li>Plan your <b>helpers first</b>. Each ghost should do one job — hold a plate, flip a switch — and then park.</li>' +
        '<li>Count ticks. Ghost timelines are shown above yours, so you can line up exactly when a door opens.</li>' +
        '<li>Use <b>WAIT</b> generously. Arriving early at a door just means bumping into it.</li>' +
        '<li>A failed run is never wasted — if it did something useful, Retry it into a ghost.</li>' +
        '<li>Stuck? A <b>HINT</b> appears in the side panel after your first attempt.</li></ul>' +
        '<p class="tip">Every failed attempt becomes part of the plan. Good luck. ◆</p>'
    }
  ];

  function stopDemo() { if (S.demo) { S.demo.stop(); S.demo = null; } }

  function showHelp(page) {
    if (page == null) { S.overlayReturn = S.mode === 'title' ? 'title' : null; page = 0; }
    S.helpPage = page;
    const p = HELP[page], last = page === HELP.length - 1;
    const dots = HELP.map((_, i) => '<button class="dot' + (i === page ? ' is-on' : '') + '" data-cmd="helppage:' + i + '" aria-label="Page ' + (i + 1) + '"></button>').join('');
    openOverlay(
      '<p class="help__step">HOW TO PLAY · ' + (page + 1) + '/' + HELP.length + '</p>' +
      '<h2>' + p.title + '</h2>' +
      (p.demo ? '<div class="help__demo"><canvas id="helpDemo" aria-hidden="true"></canvas><span>LIVE EXAMPLE</span></div>' : '') +
      '<div class="help__body">' + p.body + '</div>' +
      '<div class="help__dots">' + dots + '</div>' +
      '<div class="help__nav">' + (page ? btn('helppage:' + (page - 1), '← Back') : btn('back', 'Skip')) +
      (last ? btn('back', S.mode === 'title' ? 'Got it' : 'Start playing ▶', 'pbtn--primary', ' autofocus') : btn('helppage:' + (page + 1), 'Next →', 'pbtn--primary', ' autofocus')) +
      '</div>', 'overlay--help');
    if (p.demo) {
      const c = $('#helpDemo');
      S.demo = LT.Demo(c, Object.assign({ maxH: 140, tick: 380, hold: 1200, reduced: reduced(), maxW: () => c.parentElement.clientWidth - 16 }, p.demo));
    }
    if (!S.save.seenHelp) { S.save.seenHelp = true; persist(); }
  }

  function showLevels() {
    S.overlayReturn = S.mode === 'title' ? 'title' : null;
    const cards = LT.LEVELS.map((l, i) => {
      const locked = i + 1 > S.save.unlocked, done = S.save.completed.includes(l.id), best = S.save.best[l.id];
      return '<button class="lvl ' + (done ? 'is-done' : '') + '" data-cmd="level:' + i + '"' + (locked ? ' disabled' : '') + '>' +
        '<span class="lvl__n">' + String(i + 1).padStart(2, '0') + '</span><span class="lvl__name">' + (locked ? '🔒 Locked' : l.name) + '</span>' +
        '<span class="lvl__meta">' + (done ? '✓ best ' + best + ' attempt' + (best > 1 ? 's' : '') : locked ? '' : 'unsolved') + '</span></button>';
    }).join('');
    openOverlay('<h2>Level select</h2><div class="lvlgrid">' + cards + '</div>' + btn('back', 'Back'));
  }

  function showPause() {
    if (S.mode === 'run') return;
    openOverlay('<h2>Paused</h2><div class="pstack">' + btn('back', '▶ Resume', 'pbtn--primary', ' autofocus') +
      btn('restart', 'Restart level (clears ghosts)') + btn('help', 'How to play') + btn('levels', 'Level select') +
      btn('title', 'Title screen') + '</div>' + toggles() +
      btn('reset', S.confirmReset ? 'Tap again to erase all progress' : 'Reset progress', 'pbtn--danger pbtn--small'));
  }

  function showFail() {
    const r = S.run, sess = S.session, full = sess.ghosts.length >= S.level.maxGhosts;
    const caught = /laser/.test(r.failureReason);
    const next = sess.ghosts.length + 1;
    let actions;
    if (S.level.maxGhosts === 0) actions = '';
    else if (!full) actions = btn('retry', '↺ Retry — this run becomes Ghost ' + sess.attempt, 'pbtn--primary', ' autofocus') +
      '<p class="small">Ghost ' + next + ' of ' + S.level.maxGhosts + ' will replay exactly what you just did.</p>';
    else actions = '<p class="small warn">Ghost limit reached (' + S.level.maxGhosts + '/' + S.level.maxGhosts + ').</p>' +
      btn('replace', '↺ Retry — replace oldest ghost (G' + sess.ghosts[0].attempt + ')', 'pbtn--primary', ' autofocus');
    openOverlay(
      '<div class="result result--fail">' + (caught ? 'CAUGHT' : 'NO LOOT') + '</div>' +
      '<p>' + r.failureReason + '</p><div class="pstack">' + actions +
      btn('edit', '✎ Edit this plan (no ghost)') + btn('restart', '⟲ Restart level (clear ghosts)') + '</div>', 'overlay--fail');
  }

  function showWin() {
    const sess = S.session, last = S.idx === LT.LEVELS.length - 1;
    openOverlay(
      '<div class="result result--win">VAULT CRACKED</div>' +
      '<p class="big">' + String(S.idx + 1).padStart(2, '0') + ' · ' + S.level.name + '</p>' +
      '<div class="stats"><div><b>' + sess.attempt + '</b><span>attempt' + (sess.attempt > 1 ? 's' : '') + '</span></div>' +
      '<div><b>' + sess.ghosts.length + '</b><span>ghost' + (sess.ghosts.length === 1 ? '' : 's') + ' used</span></div>' +
      '<div><b>' + sess.plan.length + '</b><span>moves</span></div></div>' +
      (last ? '<p>You cleaned out the whole facility. Nice loop work.</p>' : '') +
      '<div class="pstack">' + (last ? '' : btn('next', 'Next level ▶', 'pbtn--primary', ' autofocus')) +
      btn('replay', '⟲ Replay level', last ? 'pbtn--primary' : '', last ? ' autofocus' : '') + btn('levels', 'Level select') +
      btn('share', '⇪ Share result') + '</div>', 'overlay--win');
  }

  async function share() {
    const s = S.session;
    const text = 'LOOP THIEF — Level ' + (S.idx + 1) + ' "' + S.level.name + '" solved in ' + s.attempt + ' attempt' + (s.attempt > 1 ? 's' : '') +
      ' with ' + s.ghosts.length + ' ghost' + (s.ghosts.length === 1 ? '' : 's') + '.';
    const url = location.href.split('#')[0];
    try {
      if (navigator.share) { await navigator.share({ title: 'LOOP THIEF', text, url }); return; }
      await navigator.clipboard.writeText(text + ' ' + url); toast('Result copied to clipboard');
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      toast('Could not share — copy: ' + text);
    }
  }

  function command(cmd) {
    if (cmd.startsWith('level:')) { closeOverlay(); loadLevel(+cmd.slice(6)); return; }
    if (cmd.startsWith('helppage:')) { showHelp(+cmd.slice(9)); return; }
    switch (cmd) {
      case 'play':
        closeOverlay(); loadLevel(Math.min(S.save.unlocked, LT.LEVELS.length) - 1);
        if (!S.save.seenHelp) showHelp(); // first-time players get the guide before level 1
        break;
      case 'help': showHelp(); break;
      case 'levels': showLevels(); break;
      case 'back': if (S.overlayReturn === 'title') { S.overlayReturn = null; showTitle(); } else { closeOverlay(); if (S.mode === 'result') S.run.status === 'won' ? showWin() : showFail(); } break;
      case 'title': closeOverlay(); showTitle(); break;
      case 'restart': restartLevel(); break;
      case 'retry': retry(false); break;
      case 'replace': retry(true); break;
      case 'edit': editPlan(); break;
      case 'next': closeOverlay(); loadLevel(S.idx + 1); break;
      case 'replay': closeOverlay(); loadLevel(S.idx); break;
      case 'share': share(); break;
      case 'sound': S.save.sound = !S.save.sound; persist(); rerender(); break;
      case 'motion': S.save.reducedMotion = !reduced(); persist(); rerender(); break;
      case 'reset':
        if (!S.confirmReset) { S.confirmReset = true; showPause(); S.confirmReset = true; break; }
        S.save = Object.assign(Save.defaults(), { sound: S.save.sound, reducedMotion: S.save.reducedMotion }); persist();
        closeOverlay(); toast('Progress erased'); showTitle(); break;
    }
  }
  function rerender() {
    const h = $('#overlay h2'), title = $('#overlay .logo');
    if (title) showTitle(); else if (h && h.textContent === 'Paused') showPause();
    document.documentElement.classList.toggle('reduced', reduced());
  }

  /* ---------- Input ---------- */

  $('#overlay').addEventListener('click', e => { const b = e.target.closest('[data-cmd]'); if (b && !b.disabled) command(b.dataset.cmd); });
  document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => addAction(b.dataset.act)));
  $('#btnUndo').addEventListener('click', undo);
  $('#btnClear').addEventListener('click', clearPlan);
  $('#btnRun').addEventListener('click', startRun);
  $('#btnPause').addEventListener('click', () => overlayOpen() ? null : showPause());
  $('#btnHelp').addEventListener('click', () => overlayOpen() ? null : showHelp());
  $('#btnRestart').addEventListener('click', () => { if (S.mode === 'plan' && !overlayOpen()) restartLevel(); });

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (overlayOpen()) {
      if (S.helpPage != null && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        const n = S.helpPage + (e.key === 'ArrowRight' ? 1 : -1);
        if (n >= 0 && n < HELP.length) showHelp(n);
        return;
      }
      if (e.key === 'Escape' && S.mode !== 'title' && S.mode !== 'result') { e.preventDefault(); command('back'); }
      return;
    }
    if (e.code === 'Escape') { e.preventDefault(); showPause(); return; }
    if (e.code === 'KeyH') { e.preventDefault(); showHelp(); return; }
    if (S.mode !== 'plan') { if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); return; }
    if (e.repeat) { if (KEYMAP[e.code]) e.preventDefault(); return; }
    if (KEYMAP[e.code]) { e.preventDefault(); if (e.target.blur) e.target.blur(); addAction(KEYMAP[e.code]); }
    else if (e.code === 'Backspace') { e.preventDefault(); undo(); }
    else if (e.code === 'KeyC') clearPlan();
    else if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); startRun(); }
  });

  /* ---------- Layout & loop ---------- */

  function layout() {
    if (!S.level) return;
    const wrap = $('#boardWrap'), wide = window.innerWidth >= 960;
    const maxH = wide ? window.innerHeight - 190 : Math.min(window.innerHeight * .52, 560);
    renderer.fit(wrap.clientWidth - 4, Math.max(200, maxH));
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 200));

  function handleEvents(frame) {
    let moved = false;
    frame.events.forEach(ev => {
      const c = ev.char && frame.chars.find(ch => ch.id === ev.char);
      if (ev.type === 'move' && !moved) { moved = true; sfx.move(); }
      else if (ev.type === 'bump' && ev.char === 'player') sfx.bump();
      else if (ev.type === 'toggle') { sfx.toggle(); const sw = S.level.switches.find(s => s.id === ev.id); renderer.burst(sw.x, sw.y, ev.on ? '#34d399' : '#f59e0b', 16, .6); }
      else if (ev.type === 'doorOpen') sfx.doorOpen();
      else if (ev.type === 'doorClose') sfx.doorClose();
      else if (ev.type === 'caught') { sfx.caught(); renderer.burst(c.x, c.y, '#ff3b5c', 30, .9); renderer.shake(ev.char === 'player' ? 320 : 160); }
    });
  }

  function loop(now) {
    const dt = now - (S.lastTime || now); S.lastTime = now;
    if (S.level) {
      let from, to, k = 1;
      if (S.mode === 'run' || (S.mode === 'result' && S.run)) {
        const fr = S.run.frames, segs = fr.length - 1;
        let seg = segs - 1;
        if (S.mode === 'run') {
          const el = now - S.runStart;
          seg = Math.floor(el / tickMs()); k = (el % tickMs()) / tickMs();
          if (seg >= segs) { seg = segs - 1; k = 1; }
        }
        if (seg !== S.seg && seg >= 0) { S.seg = seg; handleEvents(fr[seg + 1]); renderTimeline(); }
        from = fr[Math.max(0, seg)]; to = fr[Math.max(0, seg) + (segs > 0 ? 1 : 0)];
        if (S.mode === 'run' && now - S.runStart >= segs * tickMs() + 120) finishRun();
      } else {
        from = to = planFrame();
      }
      renderer.draw({
        from, to, k, time: now, dt, reduced: reduced(),
        ghosts: S.session.ghosts, spawn: S.spawn,
        trails: S.mode === 'plan' ? ghostTrailsCached() : [],
        planPath: S.mode === 'plan' ? planPath() : null
      });
    }
    requestAnimationFrame(loop);
  }
  let trailKey = '', trailVal = [];
  function ghostTrailsCached() {
    const key = S.def.id + JSON.stringify(S.session.ghosts.map(g => g.actions));
    if (key !== trailKey) { trailKey = key; trailVal = ghostTrails(); }
    return trailVal;
  }

  document.documentElement.classList.toggle('reduced', reduced());
  loadLevel(Math.min(S.save.unlocked, LT.LEVELS.length) - 1);
  // #play skips the title screen (handy for direct links)
  if (location.hash !== '#play') showTitle();
  requestAnimationFrame(loop);
  if (!storage) setTimeout(() => toast('Storage is unavailable — progress lasts for this session only'), 600);
})();
