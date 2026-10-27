/* LOOP THIEF — versioned local save. Survives missing, broken or blocked storage. */
(function (root) {
  'use strict';
  const KEY = 'loopthief.save';
  const VERSION = 1;

  function defaults() {
    return { v: VERSION, unlocked: 1, completed: [], best: {}, sound: true, reducedMotion: null, seenHelp: false };
  }

  function sanitize(raw) {
    const d = defaults();
    if (!raw || typeof raw !== 'object' || raw.v !== VERSION) return d;
    if (Number.isInteger(raw.unlocked) && raw.unlocked >= 1) d.unlocked = raw.unlocked;
    if (Array.isArray(raw.completed)) d.completed = raw.completed.filter(x => typeof x === 'string');
    if (raw.best && typeof raw.best === 'object') {
      Object.keys(raw.best).forEach(k => { if (Number.isInteger(raw.best[k]) && raw.best[k] > 0) d.best[k] = raw.best[k]; });
    }
    if (typeof raw.sound === 'boolean') d.sound = raw.sound;
    if (typeof raw.reducedMotion === 'boolean') d.reducedMotion = raw.reducedMotion;
    if (typeof raw.seenHelp === 'boolean') d.seenHelp = raw.seenHelp;
    return d;
  }

  function load(storage) {
    try { return sanitize(JSON.parse(storage.getItem(KEY))); } catch (e) { return defaults(); }
  }

  function save(storage, data) {
    try { storage.setItem(KEY, JSON.stringify(sanitize(data))); return true; } catch (e) { return false; }
  }

  function recordWin(data, levelIndex, levelId, attempts) {
    const d = sanitize(data);
    if (!d.completed.includes(levelId)) d.completed.push(levelId);
    d.unlocked = Math.max(d.unlocked, levelIndex + 2);
    if (!d.best[levelId] || attempts < d.best[levelId]) d.best[levelId] = attempts;
    return d;
  }

  const api = { KEY, VERSION, defaults, sanitize, load, save, recordWin };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LoopThief = Object.assign(root.LoopThief || {}, { Save: api });
})(typeof window !== 'undefined' ? window : globalThis);
