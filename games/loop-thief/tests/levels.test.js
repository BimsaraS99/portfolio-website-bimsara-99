// Every shipped level must be valid, solvable within its limits, and actually need its ghosts.
const test = require('node:test');
const assert = require('node:assert/strict');
const LT = require('../js/simulation.js');
const LEVELS = require('../js/levels.js');

const ghostsOf = plans => plans.map((a, i) => ({ id: 'g' + i, colorIndex: i, actions: a }));

// Breadth-first search over every plan the player could make alone.
function soloSolvable(level) {
  let frontier = [LT.createInitialWorld(level, [], [])];
  const seen = new Set();
  for (let depth = 0; depth < level.maxActions; depth++) {
    const next = [];
    for (const w of frontier) {
      for (const a of LT.ACTIONS) {
        const p = w.chars[0];
        const probe = Object.assign({}, w, { chars: [Object.assign({}, p, { actions: Object.assign([], { [w.tick]: a }) })] });
        const n = LT.step(level, probe);
        if (n.status === 'won') return true;
        if (n.status !== 'running') continue;
        const k = n.chars[0].x + ',' + n.chars[0].y + '|' + JSON.stringify(n.switches);
        if (!seen.has(k)) { seen.add(k); next.push(n); }
      }
    }
    frontier = next;
  }
  return false;
}

LEVELS.forEach((def, i) => {
  test('level ' + (i + 1) + ' "' + def.name + '"', () => {
    assert.deepEqual(LT.validateLevel(def), []);
    const level = LT.parseLevel(def);
    const ghostPlans = def.solution.slice(0, -1), playerPlan = def.solution[def.solution.length - 1];
    assert.ok(ghostPlans.length <= level.maxGhosts, 'solution fits the ghost limit');
    def.solution.forEach(p => assert.ok(p.length <= level.maxActions, 'plan fits the action limit'));

    const win = LT.simulateRun(level, ghostsOf(ghostPlans), playerPlan);
    assert.equal(win.status, 'won', 'intended solution wins');

    // Each ghost was a recorded failed run, so replaying it as the player must fail.
    ghostPlans.forEach((p, gi) => {
      assert.notEqual(LT.simulateRun(level, ghostsOf(ghostPlans.slice(0, gi)), p).status, 'won', 'ghost ' + gi + ' run fails on its own');
    });
    // Dropping any one ghost breaks the solution.
    ghostPlans.forEach((_, gi) => {
      const fewer = ghostPlans.filter((__, j) => j !== gi);
      assert.notEqual(LT.simulateRun(level, ghostsOf(fewer), playerPlan).status, 'won', 'needs ghost ' + gi);
    });
    assert.equal(soloSolvable(level), false, 'cannot be solved without ghosts');
  });
});
