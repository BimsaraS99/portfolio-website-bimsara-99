/* LOOP THIEF — looping demo player. Runs a level's scripted solution through the
   real simulation and renders it on a canvas. Used by the Playground card and the
   how-to-play guide. */
(function (root) {
  'use strict';
  const LT = root.LoopThief;

  // opts: { def, ghosts: [actions...], plan: actions, maxW, maxH, tick, hold, reduced }
  function Demo(canvas, opts) {
    const level = LT.parseLevel(opts.def);
    const ghosts = (opts.ghosts || []).map((a, i) => ({ id: 'g' + (i + 1), attempt: i + 1, colorIndex: i, actions: a }));
    const run = LT.simulateRun(level, ghosts, opts.plan);
    const r = new LT.Renderer(canvas);
    const TICK = opts.tick || 300, HOLD = opts.hold || 1400, reduced = !!opts.reduced;
    let start = performance.now(), last = start, seg = -1, visible = true, raf = 0, stopped = false;
    r.setLevel(level);

    function fit() { r.fit(opts.maxW ? opts.maxW() : canvas.parentElement.clientWidth - 24, opts.maxH || 300); }
    fit();
    window.addEventListener('resize', fit);
    let io = null;
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(es => { visible = es[0].isIntersecting; });
      io.observe(canvas);
    }

    function frame(now) {
      if (stopped) return;
      const dt = now - last; last = now;
      if (visible) {
        const fr = run.frames, segs = fr.length - 1;
        const el = Math.max(0, now - start);
        let s = Math.floor(el / TICK), k = (el % TICK) / TICK;
        if (s >= segs) {
          s = segs - 1; k = 1;
          if (el > segs * TICK + HOLD) { start = now; seg = -1; s = 0; k = 0; }
        }
        if (s !== seg) {
          seg = s;
          if (s === segs - 1 && run.status === 'won') r.burst(level.exit.x, level.exit.y, '#fde047', reduced ? 10 : 40, 1.2);
          if (opts.onTick) opts.onTick(s, fr[s + 1]);
        }
        r.draw({ from: fr[s], to: fr[s + 1], k, time: now, dt, reduced, ghosts });
      }
      raf = requestAnimationFrame(frame);
    }
    if (reduced) r.draw({ from: run.final, to: run.final, k: 1, time: 0, dt: 16, reduced, ghosts });
    else raf = requestAnimationFrame(frame);

    return {
      stop() { stopped = true; cancelAnimationFrame(raf); window.removeEventListener('resize', fit); if (io) io.disconnect(); }
    };
  }

  root.LoopThief = Object.assign(root.LoopThief || {}, { Demo });
})(window);
