/* This module reads and writes ONLY Dad's key. No shared storage cleanup or migration. */
(() => {
  'use strict';
  const KEY = 'dad_workouts_v1';
  const fresh = () => ({ version: 1, revision: '', settings: { sound: false, walkGoal: 50, walkMinutes: 10 }, drafts: {}, history: [], walkDraft: null, timer: null });
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const string = (x, max = 500) => typeof x === 'string' && x.length <= max;
  const number = (x, min = 0, max = 1e15) => Number.isFinite(x) && x >= min && x <= max;
  const integer = (x, min = 0, max = 999) => Number.isInteger(x) && number(x, min, max);
  const id = x => string(x, 100) && /^[a-zA-Z0-9_-]+$/.test(x);
  const date = x => string(x, 40) && Number.isFinite(Date.parse(x));
  const record = r => object(r) && id(r.id) && integer(r.set, 1, 10) && ['both', 'left', 'right'].includes(r.side) && integer(r.value, 0, 3600) && typeof r.done === 'boolean';
  const exercise = e => object(e) && id(e.id) && string(e.name, 100) && string(e.target, 300) &&
    ['warmup', 'strength', 'cooldown'].includes(e.phase) && ['reps', 'holds', 'time', 'physio'].includes(e.mode) &&
    integer(e.sets, 1, 10) && Array.isArray(e.steps) && e.steps.length <= 10 && e.steps.every(x => string(x, 500)) &&
    (e.setsBySide === undefined || e.setsBySide === true && e.sides === true && e.sets === 2 && Array.isArray(e.records) && e.records.length === 2 && e.records.every((r, i) => object(r) && r.set === i + 1 && r.side === (i === 0 ? 'left' : 'right'))) &&
    (!e.easier || string(e.easier)) && (!e.search || string(e.search, 200)) &&
    (!e.seconds || integer(e.seconds, 1, 3600)) && (!e.reps || integer(e.reps, 1, 999)) &&
    object(e.media) && ['strength', 'warmup', 'floor', 'shoulders', 'cooldown', 'isometric', 'birddog', 'hip', 'rolls', 'pelvic', 'squat', 'butterfly'].includes(e.media.sheet) &&
    integer(e.media.row, 0, 2) && (!e.media.rows || [1, 3].includes(e.media.rows)) && (!e.media.caption || string(e.media.caption, 200)) &&
    Array.isArray(e.records) && e.records.length > 0 && e.records.length <= 20 && e.records.every(record) &&
    new Set(e.records.map(r => r.id)).size === e.records.length && integer(e.cursor, 0, e.records.length - 1) && typeof e.skipped === 'boolean';
  const session = s => object(s) && id(s.id) && ['a', 'b'].includes(s.workoutId) && string(s.title, 100) && date(s.startedAt) &&
    integer(s.index, 0, 40) && Array.isArray(s.exercises) && s.exercises.length > 0 && s.exercises.length <= 40 &&
    s.exercises.every(exercise) && s.index <= s.exercises.length && new Set(s.exercises.map(e => e.id)).size === s.exercises.length &&
    (!s.finishedAt || date(s.finishedAt)) && (!s.notes || string(s.notes, 2000));
  const walk = w => object(w) && id(w.id) && w.kind === 'walk' && date(w.finishedAt) && /^\d{4}-\d{2}-\d{2}$/.test(w.date) && date(w.date) && number(w.minutes, 1, 1440);
  const timer = t => t === null || (object(t) && id(t.id) && ['rest', 'hold', 'walk'].includes(t.kind) && string(t.label, 150) &&
    number(t.deadline) && number(t.remaining, 0, 86400) && typeof t.running === 'boolean' && typeof t.completed === 'boolean' &&
    (!t.sessionId || id(t.sessionId)) && (!t.exerciseId || id(t.exerciseId)));
  function valid(s) {
    return object(s) && s.version === 1 && string(s.revision, 100) && object(s.settings) && typeof s.settings.sound === 'boolean' &&
      integer(s.settings.walkGoal, 5, 1500) && integer(s.settings.walkMinutes, 1, 180) && object(s.drafts) &&
      Object.keys(s.drafts).every(k => ['a', 'b'].includes(k) && session(s.drafts[k]) && s.drafts[k].workoutId === k) &&
      Array.isArray(s.history) && s.history.length <= 5000 && s.history.every(h => object(h) && (h.kind === 'walk' ? walk(h) : session(h) && date(h.finishedAt))) &&
      timer(s.timer) && (s.walkDraft === null || (object(s.walkDraft) && number(s.walkDraft.elapsed, 0, 86400) &&
        number(s.walkDraft.started, 0) && typeof s.walkDraft.running === 'boolean'));
  }
  let state = fresh(), expected = null, blocked = '', preserved = null;
  try {
    expected = localStorage.getItem(KEY);
    if (expected !== null) {
      const parsed = JSON.parse(expected);
      if (!valid(parsed)) throw new Error('Unrecognized saved data');
      state = parsed;
    }
  } catch (error) {
    preserved = expected;
    blocked = expected === null ? 'Storage is unavailable. Changes are kept only while this page stays open. Download a backup before leaving.' :
      'Dad’s saved data could not be read and has been left untouched. New changes stay in memory. Download a backup before leaving.';
  }
  function notify() { window.dispatchEvent(new Event('dad-storage-status')); }
  function save() {
    if (blocked) return false;
    try {
      if (localStorage.getItem(KEY) !== expected) {
        blocked = 'Dad’s data changed in another tab. Saving has stopped to protect both copies. Download this tab’s backup before reloading.';
        preserved = localStorage.getItem(KEY); notify(); return false;
      }
      state.revision = crypto.randomUUID();
      const raw = JSON.stringify(state);
      localStorage.setItem(KEY, raw); expected = raw;
      return true;
    } catch {
      blocked = 'This browser could not save your changes. They remain in memory. Download a backup before leaving.';
      notify(); return false;
    }
  }
  window.addEventListener('storage', event => {
    if (event.key !== KEY || event.newValue === expected) return;
    preserved = event.newValue;
    blocked = 'Dad’s data changed in another tab. Saving has stopped to protect both copies. Download this tab’s backup before reloading.';
    notify();
  });
  function backup() {
    const data = structuredClone(state);
    if (data.walkDraft?.running) {
      data.walkDraft.elapsed += Math.max(0, Date.now() - data.walkDraft.started) / 1000;
      data.walkDraft.running = false;
      data.walkDraft.started = 0;
    }
    return { app: 'dad-workouts', schemaVersion: 1, exportedAt: new Date().toISOString(), data,
      ...(preserved !== null ? { preservedStorage: preserved } : {}) };
  }
  function restore(envelope) {
    if (!object(envelope) || envelope.app !== 'dad-workouts' || envelope.schemaVersion !== 1 || !valid(envelope.data)) throw new Error('This is not a valid Dad’s workouts backup. Nothing was changed.');
    if (blocked) throw new Error('Saving is unavailable in this tab. Keep your backup and try an empty Dad’s app in a working browser.');
    const empty = s => s.history.length === 0 && Object.keys(s.drafts).length === 0 && s.walkDraft === null && s.timer === null;
    if (!empty(state)) throw new Error('Restore needs empty Dad workout history and drafts. Your current data was not changed.');
    // Check the live Dad key as well, without reading any other application key.
    const live = localStorage.getItem(KEY);
    if (live !== expected) throw new Error('Dad’s data changed in another tab. Reload before restoring.');
    if (live !== null && !empty(JSON.parse(live))) throw new Error('Dad’s app already has saved workouts. Nothing was changed.');
    const restored = structuredClone(envelope.data);
    restored.revision = crypto.randomUUID();
    restored.timer = null; // Imported alarms must never start or sound unexpectedly.
    if (restored.walkDraft) {
      restored.walkDraft.running = false;
      restored.walkDraft.started = 0;
    }
    const raw = JSON.stringify(restored);
    localStorage.setItem(KEY, raw); expected = raw; state = restored;
  }
  window.DadStore = { key: KEY, get state() { return state; }, get warning() { return blocked; }, save, backup, restore, valid };
})();
