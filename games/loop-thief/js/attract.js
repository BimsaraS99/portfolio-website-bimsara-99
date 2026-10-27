/* LOOP THIEF — attract-mode demo for the Playground card. */
(function () {
  'use strict';
  const LT = window.LoopThief, canvas = document.getElementById('attract');
  if (!LT || !LT.Demo || !canvas) return;
  const def = LT.LEVELS.find(l => l.id === 'impossible-door');
  LT.Demo(canvas, {
    def,
    ghosts: def.solution.slice(0, -1),
    plan: def.solution[def.solution.length - 1],
    // Fixed height cap: measuring the parent would let the canvas grow it on every resize.
    maxH: 300, hold: 1600,
    reduced: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  });
})();
