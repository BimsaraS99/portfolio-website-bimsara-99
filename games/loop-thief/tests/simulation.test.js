// Run: node --test games/loop-thief/tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const LT = require('../js/simulation.js');
const Save = require('../js/save.js');

const lvl = (map, extra) => LT.parseLevel(Object.assign({ id: 't', name: 'T', objective: 'o', maxGhosts: 3, map }, extra));
const run = (level, ghostPlans, plan) => LT.simulateRun(level, ghostPlans.map((a, i) => ({ id: 'g' + i, colorIndex: i, actions: a })), plan);
const pos = (world, id) => { const c = world.chars.find(c => c.id === id); return [c.x, c.y]; };

const OPEN = lvl(['#######', '#S...X#', '#######']);
const DOOR = lvl(['#########', '#a..S.AX#', '#########']);

test('1. player moves through floor', () => {
  const r = run(OPEN, [], ['R', 'R']);
  assert.deepEqual(pos(r.final, 'player'), [3, 1]);
});

test('2. player cannot move through a wall', () => {
  const r = run(OPEN, [], ['U', 'L']);
  assert.deepEqual(pos(r.final, 'player'), [1, 1]);
  assert.equal(r.frames[1].chars[0].bumped, 'U');
});

test('3. player cannot move through a closed door', () => {
  const r = run(DOOR, [], ['R', 'R']);
  assert.deepEqual(pos(r.final, 'player'), [5, 1]);
});

test('4. a blocked action still consumes a tick', () => {
  const r = run(OPEN, [], ['U', 'R']);
  assert.equal(r.frames.length, 3);
  assert.deepEqual(pos(r.frames[1], 'player'), [1, 1]);
  assert.deepEqual(pos(r.frames[2], 'player'), [2, 1]);
});

test('5 & 6. ghost replays its actions and stays put when they end', () => {
  const r = run(OPEN, [['R', 'R']], ['W', 'W', 'W', 'W']);
  assert.deepEqual(pos(r.frames[1], 'g0'), [2, 1]);
  assert.deepEqual(pos(r.frames[2], 'g0'), [3, 1]);
  assert.deepEqual(pos(r.frames[4], 'g0'), [3, 1]);
});

test('7 & 8. plate activates when occupied and its door opens and closes', () => {
  const r = run(DOOR, [['L', 'L', 'L', 'R']], ['W', 'W', 'W', 'W']);
  assert.equal(r.frames[2].plates.a, false);
  assert.equal(r.frames[3].plates.a, true);
  assert.equal(r.frames[3].doors.A0, true);
  assert.equal(r.frames[4].doors.A0, false);
});

test('doors never close on a character in the doorway', () => {
  const r = run(DOOR, [['L', 'L', 'L', 'W', 'W', 'R']], ['W', 'W', 'W', 'R', 'R', 'W']);
  assert.deepEqual(pos(r.frames[5], 'player'), [6, 1]);
  assert.equal(r.frames[6].doors.A0, true);
});

const SW = lvl(['########', '#S1...X#', '########'], { requires: ['1'] });

test('9. toggle switch changes only on interact', () => {
  const r = run(SW, [], ['R', 'W', 'I', 'W', 'I']);
  assert.equal(r.frames[1].switches['1'], false);
  assert.equal(r.frames[3].switches['1'], true);
  assert.equal(r.frames[4].switches['1'], true);
  assert.equal(r.frames[5].switches['1'], false);
});

test('two hands on one switch in the same tick flip it once', () => {
  const r = run(SW, [['R', 'I']], ['R', 'I']);
  assert.equal(r.final.switches['1'], true);
});

test('10. ghost interactions behave like player interactions', () => {
  const r = run(SW, [['R', 'I']], ['W', 'W', 'R', 'R', 'R', 'R', 'R']);
  assert.equal(r.status, 'won');
});

const LASER = lvl(['#########', '#S.!..aX#', '#########'], { hazards: { '!': { offBy: ['a'] } } });

test('11. a caught ghost goes inactive for the rest of the run', () => {
  const r = run(LASER, [['R', 'R', 'R', 'R']], ['W', 'W', 'W', 'W']);
  const g = r.final.chars[0];
  assert.equal(g.caught, true);
  assert.deepEqual([g.x, g.y], [3, 1]);
});

test('12. walking into an active laser fails the player', () => {
  const r = run(LASER, [], ['R', 'R', 'R']);
  assert.equal(r.status, 'failed');
  assert.match(r.failureReason, /laser/);
});

test('a held plate disables its laser', () => {
  const r = run(lvl(['#########', '#a.S.!.X#', '#########'], { hazards: { '!': { offBy: ['a'] } } }), [['L', 'L']], ['W', 'W', 'R', 'R', 'R', 'R']);
  assert.equal(r.status, 'won');
});

test('13. a ghost reaching the vault does not win', () => {
  const r = run(OPEN, [['R', 'R', 'R', 'R']], ['W']);
  assert.equal(r.status, 'failed');
  assert.deepEqual(pos(r.final, 'g0'), [5, 1]);
});

test('14. player wins on the vault when requirements are met', () => {
  assert.equal(run(OPEN, [], ['R', 'R', 'R', 'R']).status, 'won');
  assert.equal(run(SW, [], ['R', 'R', 'R', 'R', 'R']).status, 'failed');
});

test('15. identical inputs give identical results', () => {
  const a = run(DOOR, [['L', 'L', 'L']], ['W', 'W', 'W', 'R', 'R']);
  const b = run(DOOR, [['L', 'L', 'L']], ['W', 'W', 'W', 'R', 'R']);
  assert.deepEqual(JSON.stringify(a.frames), JSON.stringify(b.frames));
});

test('16. validation catches bad coordinates, references and ids', () => {
  const base = { id: 'x', name: 'X', objective: 'o', maxGhosts: 3 };
  assert.ok(LT.validateLevel(Object.assign({}, base, { map: ['#S#', '#X'] })).some(e => /width/.test(e)));
  assert.ok(LT.validateLevel(Object.assign({}, base, { map: ['#SAX#'] })).some(e => /missing controller "a"/.test(e)));
  assert.ok(LT.validateLevel(Object.assign({}, base, { map: ['#SaaX#'] })).some(e => /duplicate/.test(e)));
  assert.ok(LT.validateLevel(Object.assign({}, base, { map: ['#S.#'] })).some(e => /vault/.test(e)));
  assert.ok(LT.validateLevel(Object.assign({}, base, { map: ['#S?X#'] })).some(e => /unknown tile/.test(e)));
  assert.throws(() => LT.parseLevel(Object.assign({}, base, { map: ['#SAX#'] })));
});

test('17. save loading survives malformed storage', () => {
  const store = v => ({ getItem: () => v, setItem: () => {} });
  assert.deepEqual(Save.load(store('{nope')), Save.defaults());
  assert.deepEqual(Save.load(store(JSON.stringify({ v: 0, unlocked: 9 }))), Save.defaults());
  assert.equal(Save.load(store(JSON.stringify({ v: 1, unlocked: 3, best: { a: -1, b: 2 } }))).unlocked, 3);
  assert.deepEqual(Save.load({ getItem: () => { throw new Error('blocked'); } }), Save.defaults());
  assert.equal(Save.save({ setItem: () => { throw new Error('full'); } }, Save.defaults()), false);
});

test('18 & 19. retry keeps ghosts and adds the failed plan; restart clears all', () => {
  let s = LT.createSession({ id: 'l', maxGhosts: 2 });
  s = LT.retry(s, ['L']).session;
  s = LT.retry(s, ['R']).session;
  assert.equal(s.attempt, 3);
  assert.deepEqual(s.ghosts.map(g => g.actions), [['L'], ['R']]);
  const blocked = LT.retry(s, ['U']);
  assert.equal(blocked.ok, false);
  const replaced = LT.retry(s, ['U'], true).session;
  assert.deepEqual(replaced.ghosts.map(g => g.actions), [['R'], ['U']]);
  assert.notEqual(replaced.ghosts[0].colorIndex, replaced.ghosts[1].colorIndex);
  const r = LT.restart(replaced);
  assert.deepEqual([r.attempt, r.ghosts.length, r.plan.length], [1, 0, 0]);
});

test('20. winning stops the run and ignores further actions', () => {
  const r = run(OPEN, [], ['R', 'R', 'R', 'R', 'L', 'L']);
  assert.equal(r.status, 'won');
  assert.equal(r.final.tick, 4);
  assert.deepEqual(pos(r.final, 'player'), [5, 1]);
});
