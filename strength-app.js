/* The legacy app runs in its own document: no shared globals, event listeners or storage. */
(() => {
  'use strict';
  const { movements, workouts, legacyWorkouts = {} } = window.STRENGTH_PROGRAM;
  const KEY = 'strength_conditioning_v1';
  const PROGRAM_KEY = 'conditioning_active_program';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = seconds => {
    const n = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  };
  const day = () => new Date().toLocaleDateString('en-CA');
  const uid = () => window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const defaults = () => ({ version: 1, selectedWorkout: workouts[0].id, sessions: [], drafts: {}, lastSaved: {} });
  function notice(message) { $('storageNotice').textContent = message; $('storageNotice').hidden = false; }
  let storageReadable = true;
  let concurrentConflict = false;
  function readState() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      const saved = JSON.parse(raw);
      if (saved.version !== 1 || !Array.isArray(saved.sessions) || !saved.drafts || typeof saved.drafts !== 'object' || Array.isArray(saved.drafts)) throw new Error('Unsupported saved data');
      const validSession = session => session && workouts.some(w => w.id === session.workout) && session.fields && typeof session.fields === 'object' && !Array.isArray(session.fields) && typeof session.notes === 'string' && Number.isFinite(session.elapsed) && Object.values(session.fields).every(f => f && typeof f === 'object');
      if (!saved.sessions.every(validSession) || !Object.values(saved.drafts).every(validSession)) throw new Error('Invalid session data');
      return { ...defaults(), ...saved, lastSaved: saved.lastSaved || {} };
    } catch {
      storageReadable = false;
      notice('Saved strength data could not be read. Existing data is preserved. This session will stay in memory until storage is available.');
      return defaults();
    }
  }
  const state = readState();
  if (!workouts.some(w => w.id === state.selectedWorkout)) state.selectedWorkout = workouts[0].id;
  let activeProgram = 'strength';
  let restoring = false;
  let activeTab = 'today';
  let current;
  let historyEditing = null;
  let mediaBroken = false;
  const expandedBlocks = new Set();
  let knownDrafts = Object.fromEntries(Object.entries(state.drafts).map(([key, value]) => [key, JSON.stringify(value)]));
  const plannedWorkout = () => workouts.find(w => w.id === state.selectedWorkout);
  // Sessions created before prescriptions were saved use their original program.
  const sessionWorkout = session => session.prescription || legacyWorkouts[session.workout] || workouts.find(w => w.id === session.workout);
  const workout = () => current && current.workout === state.selectedWorkout ? sessionWorkout(current) : plannedWorkout();
  function persist() {
    if (!storageReadable) return false;
    try {
      concurrentConflict = false;
      const raw = localStorage.getItem(KEY);
      const remote = raw ? JSON.parse(raw) : defaults();
      const sessions = new Map(state.sessions.map(session => [session.id, session]));
      (remote.sessions || []).forEach(session => sessions.set(session.id, session));
      const drafts = { ...(remote.drafts || {}) };
      const id = current?.workout;
      const localDraft = id && state.drafts[id];
      const remoteDraft = id && remote.drafts?.[id];
      const savingCurrent = current && state.sessions.some(session => session.id === current.id);
      if ((localDraft || savingCurrent) && (JSON.stringify(remoteDraft) || '') !== (knownDrafts[id] || '')) {
        concurrentConflict = true; notice('This workout changed in another tab. Your edits remain in this tab. Copy your notes or export a backup before reloading to avoid losing them.');
        return false;
      }
      if (localDraft && sessions.has(localDraft.id)) {
        concurrentConflict = true; notice('This workout was saved in another tab. Your edits remain in this tab; export a backup before reloading.');
        return false;
      }
      if (localDraft) drafts[id] = localDraft;
      for (const [workoutId, draft] of Object.entries(drafts)) if (sessions.has(draft.id)) delete drafts[workoutId];
      const lastSaved = { ...state.lastSaved, ...(remote.lastSaved || {}) };
      if (current?.complete) lastSaved[current.workout] = current.id;
      const next = { ...state, sessions: [...sessions.values()], drafts, lastSaved };
      localStorage.setItem(KEY, JSON.stringify(next));
      Object.assign(state, next);
      knownDrafts = Object.fromEntries(Object.entries(state.drafts).map(([key, value]) => [key, JSON.stringify(value)]));
      return true;
    } catch { notice('Browser storage is full or unavailable. Keep this tab open: recent changes are held in memory but could not be saved.'); return false; }
  }
  function fieldKey(block, round, exercise, side) { return `${block}:${round}:${exercise}:${side}`; }
  function makeSession(w = plannedWorkout()) {
    const previous = state.sessions.filter(item => item.workout === w.id && item.complete).sort((a,b) => (b.finishedAt || '').localeCompare(a.finishedAt || ''));
    const session = { prescription: JSON.parse(JSON.stringify(w)), id: uid(), workout: w.id, workoutName: w.name, date: day(), fields: {}, notes: '', elapsed: 0, runningSince: null, complete: false, rested: [], rest: null, exerciseTimer: null };
    w.blocks.forEach(b => {
      for (let round = 0; round < b.rounds; round++) b.entries.forEach(e => {
        (e.eachSide ? ['left','right'] : ['both']).forEach(side => {
          const key = fieldKey(b.id, round, e.exercise, side);
          // The paired exercises used block 1 before the gym-friendly split.
          const oldKey = w.id === 'pushCore' && b.id === '1a' ? fieldKey('1', round, e.exercise, side) : key;
          // Skip empty and unconfirmed suggestions in partial sessions.
          const candidates = previous.map(item => item.fields?.[key] || item.fields?.[oldKey]);
          const last = candidates.find(field => field && field.weightSuggested !== true && ((field.weight !== '' && field.weight != null) || field.done));
          const previousWeight = last?.weight ?? '';
          session.fields[key] = { reps: e.target === 'failure' ? '' : String(e.target), weight: previousWeight, weightSuggested: previousWeight !== '', done: false };
        });
      });
    });
    return session;
  }
  function loadCurrent() {
    const draft = state.drafts[state.selectedWorkout];
    const saved = state.sessions.find(s => s.id === state.lastSaved[state.selectedWorkout] && s.date === day());
    current = draft || saved || makeSession();
    current.rested ||= [];
    // Update an unfinished Power Legs draft without discarding its original machine entries.
    if (draft && current.workout === 'powerLegs') {
      const prior = sessionWorkout(current);
      const first = prior.blocks.find(block => block.id === '0');
      if (first?.entries[0]?.exercise === 'hacksquat') {
        const updated = JSON.parse(JSON.stringify(prior));
        const replacement = plannedWorkout().blocks.find(block => block.id === '0').entries[0];
        updated.blocks.find(block => block.id === '0').entries[0] = JSON.parse(JSON.stringify(replacement));
        current.prescription = updated;
        current.hackSquatMigrated = true;
        // Machine sets and barbell sets are distinct, including their rest timers.
        current.rested = current.rested.filter(token => !token.startsWith('0:'));
      }
    }
    const template = makeSession(sessionWorkout(current));
    for (const [key, field] of Object.entries(template.fields)) if (!current.fields[key]) current.fields[key] = field;
  }
  function saveDraft() {
    if (!current || current.complete) return true;
    current.updatedAt = new Date().toISOString();
    state.drafts[current.workout] = current;
    return persist();
  }
  function elapsed() { return (current.elapsed || 0) + (current.runningSince ? (Date.now() - current.runningSince) / 1000 : 0); }
  function pauseSession() {
    current.elapsed = elapsed();
    current.runningSince = null;
  }
  function stopClocks() { current.rest = null; current.exerciseTimer = null; }
  function targetText(entry) {
    if (entry.target === 'failure') return 'To failure · log actual reps';
    return `${entry.target} ${entry.timed ? 'seconds' : 'reps'}${entry.eachSide ? ' each side' : ''}`;
  }
  function photo(id, large = false) {
    const m = movements[id];
    if (m.cell !== undefined && mediaBroken) return `<span class="exercise-photo photo-fallback" role="img" aria-label="${esc(m.name)} photo unavailable">Photo unavailable</span>`;
    if (m.cell !== undefined) return `<span class="exercise-photo sheet-photo${large ? ' guide-sheet' : ''}" data-cell="${m.cell}" role="img" aria-label="${esc(m.name)} reference pose" title="Illustrative reference photo"></span>`;
    return `<img class="exercise-photo" src="${esc(m.images[1])}" alt="${esc(m.name)} reference position" loading="lazy" width="88" height="88">`;
  }
  function guide(id) {
    const m = movements[id];
    const imgs = m.images ? `<div class="guide-images">${m.images.map((src,i) => `<img src="${src}" alt="${esc(m.name)} · position ${i+1}" loading="lazy" width="300" height="300">`).join('')}</div>` : `<div class="guide-images">${photo(id, true)}</div><p class="guide-caption">Illustrative reference pose. Follow the steps below for the complete movement.</p>`;
    const search = `https://www.youtube.com/results?search_query=${encodeURIComponent(m.name + ' exercise tutorial')}`;
    return `<div class="guide"><a class="ytlink" href="${search}" target="_blank" rel="noopener noreferrer" aria-label="Search YouTube for ${esc(m.name)} tutorials">Search YouTube</a><details><summary>Show movement guide</summary>${imgs}<p>${esc(m.guide)}</p></details></div>`;
  }
  function info(entry) {
    const m = movements[entry.exercise];
    return `<div class="exercise-info">${photo(entry.exercise)}<div class="exercise-heading"><h3>${esc(m.name)}</h3><p class="target">${targetText(entry)}</p>${entry.note ? `<p class="muted">${esc(entry.note)}</p>` : ''}</div></div>`;
  }
  function row(block, round, entry, side) {
    const key = fieldKey(block.id, round, entry.exercise, side);
    const f = current.fields[key];
    const m = movements[entry.exercise];
    const label = `${m.name}, ${block.kind === 'single' ? 'set' : 'round'} ${round+1}${side === 'both' ? '' : `, ${side}`}`;
    const disabled = current.complete ? 'disabled' : '';
    const input = (prop, title, value, placeholder = '') => {
      const suggested = prop === 'weight' && f.weightSuggested === true && value !== '' && value != null;
      const hint = suggested ? ', previous weight, tick Done to confirm' : '';
      return `<label>${title}<input type="number" data-field="${key}" data-prop="${prop}" value="${esc(value)}" min="0" step="${prop === 'weight' ? '0.5' : '1'}" inputmode="decimal" placeholder="${placeholder}" aria-label="${esc(label+' '+title+hint)}" ${suggested ? 'class="suggested-weight" title="Previous weight; tick Done to confirm"' : ''} ${disabled}></label>`;
    };
    const reps = input('reps', entry.timed ? 'SECONDS' : 'ACTUAL REPS', f.reps, entry.target === 'failure' ? 'Actual' : '');
    const weights = m.weighted ? input('weight', (m.weightUnit || 'lb').toUpperCase(), f.weight, '—') : '<span></span>';
    return `<div class="log-row">${side !== 'both' ? `<span class="side-name">${side === 'left' ? 'Left' : 'Right'}</span>` : ''}${reps}${weights}<label class="check-label">DONE<input class="set-complete" type="checkbox" data-field="${key}" data-prop="done" aria-label="${esc(label+' complete')}" ${f.done ? 'checked' : ''} ${disabled}></label></div>${entry.timed ? `<button class="full timed-button secondary" data-action="exerciseTimer" data-key="${key}" ${disabled}>Start ${esc(m.name)} timer</button>` : ''}`;
  }
  function renderToday() {
    const w = workout();
    $('workoutChoice').innerHTML = workouts.map(x => `<option value="${x.id}" ${x.id === w.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    $('workoutSummary').textContent = `${w.blocks.reduce((n,b) => n+b.entries.length,0)} exercises · est. ${w.minutes} min · choose at your own pace`;
    $('weightHint').hidden = !Object.values(current.fields).some(field => field.weightSuggested === true && field.weight !== '' && field.weight != null);
    $('sessionStatus').innerHTML = current.complete ? `<div class="saved-message">✓ Workout saved. <button class="secondary" data-action="newSession">Start another session</button></div>` : (state.drafts[w.id] ? `<p class="micro">Draft from ${esc(current.date)}</p>${current.date !== day() ? '<button class="secondary" data-action="newDraft">Start a new session</button>' : ''}` : '');
    if (w.id === 'pushCore' && !w.blocks.some(block => block.id === '1a')) $('sessionStatus').insertAdjacentHTML('beforeend', '<p class="micro">This session uses the original grouping. New sessions use the updated grouping.</p>');
    if (current.hackSquatMigrated && !current.complete) $('sessionStatus').insertAdjacentHTML('beforeend', '<p class="micro">This draft now uses barbell back squats. Earlier hack squat entries are retained with the session.</p>');
    if (current.complete && w.id === 'powerLegs' && w.blocks[0]?.entries[0]?.exercise === 'hacksquat') $('sessionStatus').insertAdjacentHTML('beforeend', '<p class="micro">This saved session includes hack squats. New sessions use barbell back squats.</p>');
    $('notes').value = current.notes;
    $('notes').disabled = current.complete;
    $('saveWorkout').disabled = current.complete;
    const quickFinish = document.querySelector('[data-action="finishWorkout"]');
    quickFinish.disabled = current.complete;
    quickFinish.textContent = current.complete ? 'Workout saved' : 'Finish / save workout';
    $('saveWorkout').textContent = current.complete ? 'Workout saved' : 'Finish / save workout';
    $('todayPlan').innerHTML = (w.instructions ? `<div class="warning"><strong>${esc(w.instructions)}</strong></div>` : '') + w.blocks.map(b => {
      const name = b.kind === 'single' ? movements[b.entries[0].exercise].name : `${b.kind === 'group' ? 'Exercise group' : b.kind === 'circuit' ? 'Circuit' : 'Superset'} · ${b.rounds} rounds`;
      const restDescription = b.rest ? `${b.rest}s rest after each ${b.kind === 'single' ? 'set' : 'complete round'}` : 'No prescribed rest between rounds';
      let rounds = '';
      if (b.kind === 'single') {
        const entry = b.entries[0];
        rounds = `<div class="single-intro">${info(entry)}${guide(entry.exercise)}</div>`;
        for (let r = 0; r < b.rounds; r++) rounds += `<div class="round" data-block="${b.id}" data-round="${r}"><p class="round-title">Set ${r+1} / ${b.rounds}</p>${(entry.eachSide ? ['left','right'] : ['both']).map(side => row(b,r,entry,side)).join('')}</div>`;
      } else {
        for (let r = 0; r < b.rounds; r++) rounds += `<div class="round grouped-round" data-block="${b.id}" data-round="${r}"><p class="round-title">Round ${r+1} / ${b.rounds}</p><p class="group-indicator">${b.kind === 'superset' ? 'Superset' : b.kind === 'circuit' ? 'Circuit' : 'Exercise group'} · ${b.entries.length} exercises together</p>${b.entries.map(e => `<div class="movement-card" data-exercise="${e.exercise}">${info(e)}${(e.eachSide ? ['left','right'] : ['both']).map(side => row(b,r,e,side)).join('')}${guide(e.exercise)}</div>`).join('')}</div>`;
      }
      const transition = b.transitionRest ? `<div class="between-rest"><span>${b.transitionRest}s between blocks</span><button class="secondary" data-action="rest" data-seconds="${b.transitionRest}" ${current.complete ? 'disabled' : ''}>Start rest</button></div>` : '';
      return `<article class="workout-block" data-block-card="${b.id}"><header class="block-header"><h2>${esc(name)}</h2><p class="micro">${b.rounds} ${b.kind === 'single' ? 'sets' : 'rounds'} · ${restDescription}</p>${b.kind !== 'single' ? `<button class="secondary round-toggle" data-action="toggleRounds" data-block="${b.id}">${expandedBlocks.has(b.id) ? 'Show current round' : 'Show all rounds'}</button>` : ''}</header>${rounds}${transition}</article>`;
    }).join('');
    updateRoundVisibility(); refreshClocks();
  }
  function updateRoundVisibility() {
    workout().blocks.filter(b => b.kind !== 'single').forEach(b => {
      const rounds = [...document.querySelectorAll(`[data-block-card="${b.id}"] .round`)];
      const next = rounds.find(round => [...round.querySelectorAll('.set-complete')].some(box => !box.checked)) || rounds[rounds.length - 1];
      rounds.forEach(round => { round.hidden = !expandedBlocks.has(b.id) && round !== next; });
    });
  }
  function renderProgram() {
    $('programList').innerHTML = workouts.map(w => `<article class="card"><h2>${esc(w.name)}</h2><p class="muted">${w.blocks.reduce((n,b) => n+b.entries.length,0)} exercises · est. ${w.minutes} minutes</p>${w.blocks.some(b => b.kind !== 'single') ? `<p class="group-overview">${[...new Set(w.blocks.filter(b => b.kind !== 'single').map(b => b.kind === 'superset' ? 'Supersets' : b.kind === 'circuit' ? 'Circuit' : 'Exercise group'))].join(' · ')}</p>` : ''}${w.instructions ? `<p class="warning">${esc(w.instructions)}</p>` : ''}<button data-action="choose" data-workout="${w.id}" class="full">Choose workout</button><details><summary>View exercises</summary><ol class="program-outline">${w.blocks.map(b => `<li><b>${b.kind === 'single' ? '' : `${b.kind === 'group' ? 'Group' : b.kind === 'circuit' ? 'Circuit' : 'Superset'} · `}${b.rounds} ${b.kind === 'single' ? 'sets' : 'rounds'}</b><br>${b.entries.map(e => `${esc(movements[e.exercise].name)} — ${targetText(e)}${e.note ? ` (${esc(e.note)})` : ''}`).join('<br>')}<br><span class="micro">${b.rest ? `${b.rest}s rest` : 'No prescribed round rest'}${b.transitionRest ? ` · ${b.transitionRest}s between blocks` : ''}</span></li>`).join('')}</ol></details></article>`).join('');
  }
  function renderLibrary() {
    $('libraryFilter').innerHTML = '<option value="">All workouts</option>' + workouts.map(w => `<option value="${w.id}">${esc(w.name)}</option>`).join('');
    $('libraryList').innerHTML = Object.entries(movements).filter(([id]) => id !== 'hacksquat').map(([id,m]) => `<article class="card" data-library-name="${esc(m.name.toLowerCase())}" data-library-id="${esc(id)}"><div class="exercise-info">${photo(id)}<div class="exercise-heading"><h2>${esc(m.name)}</h2></div></div>${guide(id)}</article>`).join('');
  }
  function filterLibrary() {
    const query = $('librarySearch').value.trim().toLowerCase();
    const selected = workouts.find(w => w.id === $('libraryFilter').value);
    const included = selected ? new Set(selected.blocks.flatMap(block => block.entries.map(entry => entry.exercise))) : null;
    document.querySelectorAll('[data-library-name]').forEach(card => { card.hidden = !card.dataset.libraryName.includes(query) || !!(included && !included.has(card.dataset.libraryId)); });
  }
  // Another tab may have saved a session since this document was opened.
  // Refresh only the history; never replace an in-progress draft here.
  function refreshHistory() {
    if (!storageReadable) return;
    try {
      const remote = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!Array.isArray(remote?.sessions)) return;
      const sessions = new Map(state.sessions.map(session => [session.id, session]));
      remote.sessions.forEach(session => sessions.set(session.id, session));
      state.sessions = [...sessions.values()];
    } catch { notice('Could not refresh workout history from browser storage. Existing data has not been changed.'); }
  }
  function renderProgress() {
    refreshHistory();
    $('logged').textContent = state.sessions.filter(s => s.complete).length;
    $('history').innerHTML = state.sessions.slice().reverse().map(s => `<button class="history-entry" data-action="review" data-id="${esc(s.id)}"><b>${esc(s.workoutName)}</b><span class="muted">${esc(s.date)} · ${s.complete ? 'Completed' : 'Partial'} · ${fmt(s.elapsed)} · ${Object.values(s.fields).filter(f => f.done).length} entries checked</span>${s.notes ? `<span>${esc(s.notes)}</span>` : ''}</button>`).join('') || '<div class="card muted">No completed workouts yet. Finish and save a session to see it here.</div>';
  }
  function archivedHackSquat(session, w) {
    if (w.id !== 'powerLegs' || w.blocks[0]?.entries[0]?.exercise !== 'backsquat') return '';
    const entries = Array.from({length: 5}, (_, round) => session.fields[fieldKey('0', round, 'hacksquat', 'both')]);
    if (!entries.some(f => f && (f.done || f.weight || (f.reps !== '' && f.reps !== '10' && f.reps != null)))) return '';
    return `<div class="review-block"><h3>Earlier hack squat entries</h3><p class="micro">Recorded before this draft was changed to barbell back squats.</p>${entries.map((f, round) => f ? `<p class="muted">Set ${round + 1} · ${esc(f.reps || '—')} reps · ${esc(f.weight || '—')} lb · ${f.done ? '✓' : 'Unchecked'}</p>` : '').join('')}</div>`;
  }
  function review(id) {
    const s = state.sessions.find(x => x.id === id);
    if (!s) return;
    const w = sessionWorkout(s);
    $('history').innerHTML = `<div class="card"><button class="secondary" data-action="historyBack">Back to history</button> <button class="secondary" data-action="editHistory" data-id="${esc(s.id)}">Edit session</button><h2 class="review-title">${esc(s.workoutName)}</h2><p class="muted">${esc(s.date)} · ${fmt(s.elapsed)}</p>${s.notes ? `<p>${esc(s.notes)}</p>` : ''}${w.blocks.map(b => `<div class="review-block"><h3>${b.kind === 'single' ? esc(movements[b.entries[0].exercise].name) : esc(b.kind)}</h3>${Array.from({length:b.rounds},(_,r) => `<p class="micro">${b.kind === 'single' ? 'Set' : 'Round'} ${r+1}</p>${b.entries.map(e => (e.eachSide ? ['left','right'] : ['both']).map(side => {
      const f = s.fields[fieldKey(b.id,r,e.exercise,side)] || {};
      return `<p class="muted">${esc(movements[e.exercise].name)}${side === 'both' ? '' : ` · ${side}`} · ${f.reps === '' ? '—' : esc(f.reps)} ${e.timed ? 'sec' : 'reps'}${movements[e.exercise].weighted ? ` · ${f.weight === '' ? '—' : esc(f.weight)} lb${f.weightSuggested ? ' (previous; unconfirmed)' : ''}` : ''} · ${f.done ? '✓' : 'Unchecked'}</p>`;
    }).join('')).join('')}`).join('')}</div>`).join('')}${archivedHackSquat(s,w)}</div>`;
  }
  function editHistory(id) {
    const session = state.sessions.find(item => item.id === id);
    if (!session) return;
    historyEditing = { original: JSON.stringify(session), value: JSON.parse(JSON.stringify(session)) };
    const w = sessionWorkout(session);
    $('history').innerHTML = `<div class="card"><h2>Edit ${esc(session.workoutName)}</h2><label>Date <input id="historyDate" type="date" required value="${esc(session.date)}"></label><label>Notes <textarea id="historyNotes">${esc(session.notes)}</textarea></label>${w.blocks.map(b => `<div class="review-block"><h3>${b.kind === 'single' ? esc(movements[b.entries[0].exercise].name) : esc(b.kind)}</h3>${Array.from({length:b.rounds},(_,r) => `<p class="micro">${b.kind === 'single' ? 'Set' : 'Round'} ${r+1}</p>${b.entries.map(e => (e.eachSide ? ['left','right'] : ['both']).map(side => {
      const key = fieldKey(b.id,r,e.exercise,side), f = session.fields[key] || {reps:'',weight:'',done:false};
      const label = `${movements[e.exercise].name}${side === 'both' ? '' : ` · ${side}`}`;
      return `<div class="history-edit-row"><b>${esc(label)}</b><label>${e.timed ? 'Seconds' : 'Reps'} <input type="number" min="0" step="1" data-history-key="${esc(key)}" data-history-prop="reps" value="${esc(f.reps)}"></label>${movements[e.exercise].weighted ? `<label>Weight (lb) <input type="number" min="0" step="0.5" data-history-key="${esc(key)}" data-history-prop="weight" value="${esc(f.weight)}"></label>` : ''}<label>Done <input type="checkbox" data-history-key="${esc(key)}" data-history-prop="done" ${f.done ? 'checked' : ''}></label></div>`;
    }).join('')).join('')}`).join('')}</div>`).join('')}<div class="row"><button data-action="saveHistory">Save corrections</button><button class="secondary" data-action="cancelHistory">Cancel</button></div></div>`;
  }
  function saveHistory() {
    if (!historyEditing) return;
    const invalid = $('history').querySelector('input:invalid');
    if (invalid) { invalid.reportValidity(); return; }
    const updated = historyEditing.value;
    updated.date = $('historyDate').value;
    if (!updated.date) { $('historyDate').reportValidity(); return; }
    updated.notes = $('historyNotes').value;
    $('history').querySelectorAll('[data-history-key]').forEach(input => {
      updated.fields[input.dataset.historyKey] ||= {reps:'',weight:'',done:false};
      const field = updated.fields[input.dataset.historyKey];
      const value = input.type === 'checkbox' ? input.checked : input.value;
      if ((input.dataset.historyProp === 'weight' && String(field.weight ?? '') !== value) || (input.dataset.historyProp === 'done' && value)) field.weightSuggested = false;
      field[input.dataset.historyProp] = value;
    });
    try {
      const remote = JSON.parse(localStorage.getItem(KEY) || 'null');
      const index = remote?.sessions?.findIndex(item => item.id === updated.id) ?? -1;
      if (index < 0 || JSON.stringify(remote.sessions[index]) !== historyEditing.original) {
        notice('This session changed in another tab. Your corrections are still on this screen; copy them before reloading.'); return;
      }
      remote.sessions[index] = updated;
      localStorage.setItem(KEY, JSON.stringify(remote));
      state.sessions = remote.sessions;
      if (current.id === updated.id && current.complete) current = updated;
      historyEditing = null; review(updated.id);
    } catch { notice('Could not save corrections. They remain on this screen; please try again.'); }
  }
  function showTab(name) {
    activeTab = name;
    document.querySelectorAll('#strengthShell section').forEach(el => el.classList.toggle('active', el.id === name));
    document.querySelectorAll('[data-tab]').forEach(el => {
      el.classList.toggle('active', el.dataset.tab === name);
      if (el.dataset.tab === name) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
    });
    if (name === 'progress') renderProgress();
    window.scrollTo(0,0);
    const heading = document.querySelector(`#${name} h1`);
    if (heading) { heading.setAttribute('tabindex','-1'); heading.focus({preventScroll:true}); }
  }
  function chooseWorkout(id) {
    if (!workouts.some(w => w.id === id)) return;
    pauseSession(); stopClocks();
    if (!saveDraft()) { $('workoutChoice').value = current.workout; return; }
    state.selectedWorkout = id;
    expandedBlocks.clear(); persist(); loadCurrent(); renderToday(); showTab('today');
  }
  function startRest(seconds, label = 'Rest · next set', startedAt = Date.now()) {
    if (current.complete || !seconds) return;
    current.rest = { end: startedAt + seconds * 1000, label };
    saveDraft(); refreshClocks();
  }
  function completedField(key, completedAt = Date.now()) {
    const [blockId,roundIndex] = key.split(':');
    const b = workout().blocks.find(x => x.id === blockId);
    const round = +roundIndex;
    const keys = b.entries.flatMap(e => (e.eachSide ? ['left','right'] : ['both']).map(side => fieldKey(b.id,round,e.exercise,side)));
    const token = `${b.id}:${round}`;
    if (keys.every(k => current.fields[k].done) && !current.rested.includes(token)) {
      current.rested.push(token);
      const final = round === b.rounds-1;
      const seconds = final ? (b.transitionRest || 0) : b.rest;
      if (seconds && completedAt + seconds * 1000 > Date.now()) startRest(seconds, final ? 'Rest · next block' : b.kind === 'single' ? 'Rest · next set' : 'Rest · next round', completedAt);
    }
  }
  let audioContext;
  function unlockAudio() {
    if (state.soundEnabled === false) return;
    try { const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return; audioContext ||= new Audio(); if (audioContext.state === 'suspended') audioContext.resume().catch(() => {}); } catch { /* Audio is optional. */ }
  }
  function alarm() {
    try { navigator.vibrate?.([150,80,150]); } catch { /* Vibration is optional. */ }
    if (state.soundEnabled === false || !audioContext || audioContext.state !== 'running') return;
    try { const oscillator=audioContext.createOscillator(), gain=audioContext.createGain(), now=audioContext.currentTime; oscillator.frequency.value=880; gain.gain.setValueAtTime(0.08,now); gain.gain.exponentialRampToValueAtTime(0.001,now+0.3); oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(now); oscillator.stop(now+0.3); } catch { /* Audio is optional. */ }
  }
  function refreshClocks() {
    if (!current || activeProgram !== 'strength') return;
    const running = !!current.runningSince;
    const clockText = fmt(elapsed());
    const clockLabel = `${running ? 'Pause' : 'Start'} session timer`;
    if ($('sessionToggle').getAttribute('aria-label') !== clockLabel) {
      $('sessionToggle').innerHTML = `${running ? 'Pause' : 'Start'} · <span id="sessionTime">${clockText}</span>`;
      $('sessionToggle').setAttribute('aria-label', clockLabel);
    } else if ($('sessionTime').textContent !== clockText) $('sessionTime').textContent = clockText;
    $('sessionToggle').disabled = current.complete;
    const rest = current.rest;
    $('restTimer').hidden = !rest;
    if (rest) {
      const seconds = Math.ceil((rest.end-Date.now())/1000);
      const label = seconds <= 0 ? 'Rest complete' : rest.label;
      if ($('restLabel').textContent !== label) $('restLabel').textContent = label;
      if ($('restCount').textContent !== fmt(seconds)) $('restCount').textContent = fmt(seconds);
      if (seconds <= 0 && !rest.announced) { rest.announced = true; alarm(); saveDraft(); }
    }
    const timer = current.exerciseTimer;
    $('exerciseTimer').hidden = !timer;
    if (timer) {
      const seconds = Math.ceil((timer.end-Date.now())/1000);
      if ($('exerciseLabel').textContent !== movements[timer.exercise].name) $('exerciseLabel').textContent = movements[timer.exercise].name;
      if ($('exerciseCount').textContent !== fmt(seconds)) $('exerciseCount').textContent = fmt(seconds);
      if (seconds <= 0) {
        current.exerciseTimer = null;
        current.fields[timer.key].done = true;
        confirmSuggestedWeight(timer.key);
        const checkbox = document.querySelector(`[data-field="${timer.key}"][data-prop="done"]`);
        if (checkbox) checkbox.checked = true;
        completedField(timer.key, timer.end); alarm(); saveDraft(); updateRoundVisibility();
        $('exerciseTimer').hidden = true;
      }
    }
  }
  function finishWorkout() {
    if (current.complete) return;
    const invalid = document.querySelector('#today input:invalid');
    if (invalid) { invalid.reportValidity(); return; }
    const missing = workout().blocks.some(block => Array.from({length: block.rounds}, (_, round) =>
      block.entries.some(entry => (entry.eachSide ? ['left', 'right'] : ['both']).some(side =>
        !current.fields[fieldKey(block.id, round, entry.exercise, side)]?.done))).some(Boolean));
    if (missing && !window.confirm('Some sets are unchecked. Save this workout with the entries you have logged?')) return;
    pauseSession(); stopClocks();
    current.complete = true;
    current.finishedAt = new Date().toISOString();
    state.sessions.push(current);
    state.lastSaved[current.workout] = current.id;
    delete state.drafts[current.workout];
    if (!persist()) {
      state.sessions = state.sessions.filter(session => session.id !== current.id);
      delete state.lastSaved[current.workout];
      current.complete = false;
      delete current.finishedAt;
      state.drafts[current.workout] = current;
      renderToday();
      return;
    }
    renderToday(); showTab('progress'); review(current.id);
  }
  function switchProgram(program) {
    if (program === activeProgram) return;
    if (program === 'bangtao') {
      pauseSession(); stopClocks();
      if (!saveDraft()) { $('programChoice').value = 'strength'; return; }
      activeProgram = 'bangtao';
      $('strengthShell').hidden = true;
      $('legacyMount').hidden = false;
      document.body.classList.add('legacy-active');
      const frame = document.createElement('iframe');
      frame.id = 'bangtaoFrame'; frame.title = 'Bangtao Prep program'; frame.src = 'bangtao.html?v=20261112-2';
      $('legacyMount').replaceChildren(frame);
      document.title = 'Bangtao Prep';
    } else {
      const frame = $('bangtaoFrame');
      // Capture the legacy recovery draft before destroying its document and timers.
      frame?.contentWindow?.preserveBangtaoSession?.();
      $('legacyMount').replaceChildren();
      $('legacyMount').hidden = true;
      $('strengthShell').hidden = false;
      document.body.classList.remove('legacy-active');
      activeProgram = 'strength';
      document.title = 'Strength & Conditioning';
      renderToday(); showTab(activeTab);
    }
    try { localStorage.setItem(PROGRAM_KEY, program); } catch { /* The selector still works in memory. */ }
  }
  function exportData() {
    refreshHistory();
    const backup = { format: 'conditioning-backup', version: 1, strength: state, bangtao: null, recovery: null };
    try { if (!storageReadable) backup.unreadableStrength = localStorage.getItem(KEY); backup.bangtao = localStorage.getItem('bangtao12'); backup.recovery = localStorage.getItem('bangtao12_active_session'); }
    catch { $('backupStatus').textContent = 'Could not read Bangtao data for the backup.'; return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `workout-backup-${day()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('backupStatus').textContent = 'Backup downloaded. Keep it somewhere safe.';
  }
  async function importData(file) {
    if (!file) return;
    try {
      if (file.size > 5000000) throw new Error('Backup is too large.');
      const backup = JSON.parse(await file.text());
      if (backup.format !== 'conditioning-backup' || backup.version !== 1 || backup.strength?.version !== 1 || !Array.isArray(backup.strength.sessions) || !backup.strength.drafts || typeof backup.strength.drafts !== 'object') throw new Error('This is not a supported backup.');
      for (const entry of [...backup.strength.sessions, ...Object.values(backup.strength.drafts)]) {
        if (!entry || !workouts.some(w => w.id === entry.workout) || !entry.fields || typeof entry.fields !== 'object' || Array.isArray(entry.fields) || !Object.values(entry.fields).every(field => field && typeof field === 'object' && !Array.isArray(field)) || typeof entry.notes !== 'string' || !Number.isFinite(entry.elapsed)) throw new Error('The backup contains an invalid session.');
      }
      for (const value of [backup.bangtao, backup.recovery]) if (value !== null) { if (typeof value !== 'string') throw new Error('The backup contains invalid Bangtao data.'); const parsed = JSON.parse(value); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The backup contains invalid Bangtao data.'); }
      const keys = [KEY, 'bangtao12', 'bangtao12_active_session'];
      if (keys.some(key => localStorage.getItem(key) !== null)) throw new Error('Restore requires an empty browser. Your existing data was not changed.');
      try {
        localStorage.setItem(KEY, JSON.stringify(backup.strength));
        if (backup.bangtao !== null) localStorage.setItem('bangtao12', backup.bangtao);
        if (backup.recovery !== null) localStorage.setItem('bangtao12_active_session', backup.recovery);
      } catch (error) { keys.forEach(key => localStorage.removeItem(key)); throw error; }
      restoring = true; location.reload();
    } catch (error) { $('backupStatus').textContent = error.message || 'Could not restore the backup. Your existing data was not changed.'; }
    $('importData').value = '';
  }
  function confirmSuggestedWeight(key) {
    const field = current.fields[key];
    if (!field?.weightSuggested) return;
    field.weightSuggested = false;
    const input = document.querySelector(`[data-field="${key}"][data-prop="weight"]`);
    if (input) {
      input.classList.remove('suggested-weight');
      input.removeAttribute('title');
      input.setAttribute('aria-label', input.getAttribute('aria-label').replace(', previous weight, tick Done to confirm', ''));
    }
    $('weightHint').hidden = !Object.values(current.fields).some(f => f.weightSuggested === true && f.weight !== '' && f.weight != null);
  }
  document.addEventListener('input', event => {
    if (activeProgram !== 'strength') return;
    const el = event.target;
    if (el.id === 'librarySearch') { filterLibrary(); return; }
    if (current.complete) return;
    if (el.id === 'notes') { current.notes = el.value; saveDraft(); return; }
    if (el.dataset.field && el.dataset.prop !== 'done') {
      // Blank entries are allowed; invalid negatives and non-finite values are not saved.
      if (el.value !== '' && (!Number.isFinite(el.valueAsNumber) || el.valueAsNumber < 0)) { el.setCustomValidity('Enter a number of zero or more.'); return; }
      el.setCustomValidity('');
      current.fields[el.dataset.field][el.dataset.prop] = el.value;
      if (el.dataset.prop === 'weight') confirmSuggestedWeight(el.dataset.field);
      saveDraft();
    }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'libraryFilter') { filterLibrary(); return; }
    if (event.target.id === 'importData') { importData(event.target.files[0]); return; }
    if (event.target.id === 'programChoice') { switchProgram(event.target.value); return; }
    if (activeProgram !== 'strength') return;
    if (event.target.id === 'workoutChoice') { chooseWorkout(event.target.value); return; }
    if (event.target.dataset.prop === 'done' && !current.complete) {
      const key = event.target.dataset.field;
      current.fields[key].done = event.target.checked;
      if (event.target.checked) confirmSuggestedWeight(key);
      if (event.target.checked) { unlockAudio(); completedField(key); }
      saveDraft(); updateRoundVisibility();
    }
  });
  document.addEventListener('click', event => {
    if (activeProgram !== 'strength') return;
    const el = event.target.closest('button');
    if (!el) return;
    if (el.dataset.action === 'toggleSound') { state.soundEnabled = state.soundEnabled === false; if (state.soundEnabled) unlockAudio(); el.textContent = state.soundEnabled ? 'Sound on' : 'Sound off'; persist(); return; }
    if (el.dataset.action === 'rest' || el.dataset.action === 'exerciseTimer') unlockAudio();
    if (el.dataset.tab) { showTab(el.dataset.tab); return; }
    if (el.dataset.action === 'toggleRounds') {
      if (expandedBlocks.has(el.dataset.block)) expandedBlocks.delete(el.dataset.block); else expandedBlocks.add(el.dataset.block);
      el.textContent = expandedBlocks.has(el.dataset.block) ? 'Show current round' : 'Show all rounds';
      updateRoundVisibility(); return;
    }
    if (el.id === 'exportData') { exportData(); return; }
    if (el.dataset.action === 'finishWorkout') { finishWorkout(); return; }
    if (el.id === 'sessionToggle') {
      if (current.runningSince) pauseSession(); else current.runningSince = Date.now();
      saveDraft(); refreshClocks();
    } else if (el.id === 'saveWorkout') finishWorkout();
    else if (el.id === 'skipRest') { current.rest = null; saveDraft(); refreshClocks(); }
    else if (el.dataset.adjustRest && current.rest) { current.rest.end = Math.max(Date.now(), current.rest.end) + Number(el.dataset.adjustRest) * 1000; current.rest.announced = false; saveDraft(); refreshClocks(); }
    else if (el.id === 'cancelExercise') { current.exerciseTimer = null; saveDraft(); refreshClocks(); }
    else if (el.dataset.action === 'choose') chooseWorkout(el.dataset.workout);
    else if (el.dataset.action === 'rest') startRest(+el.dataset.seconds, 'Manual rest');
    else if (el.dataset.action === 'review') review(el.dataset.id);
    else if (el.dataset.action === 'historyBack') { historyEditing = null; renderProgress(); }
    else if (el.dataset.action === 'editHistory') editHistory(el.dataset.id);
    else if (el.dataset.action === 'saveHistory') saveHistory();
    else if (el.dataset.action === 'cancelHistory') { const id = historyEditing?.value.id; historyEditing = null; if (id) review(id); }
    else if (el.dataset.action === 'newSession') {
      delete state.lastSaved[state.selectedWorkout];
      current = makeSession(); saveDraft(); renderToday();
    } else if (el.dataset.action === 'newDraft') {
      if (!window.confirm('Move the unfinished session to history as partial and start a new one?')) return;
      pauseSession(); stopClocks();
      const old = current;
      old.finishedAt = new Date().toISOString();
      state.sessions.push(old); delete state.drafts[old.workout];
      if (!persist()) { state.sessions = state.sessions.filter(session => session.id !== old.id); state.drafts[old.workout] = old; return; }
      delete state.lastSaved[state.selectedWorkout]; current = makeSession(); saveDraft(); renderToday(); showTab('today');
    } else if (el.dataset.action === 'exerciseTimer' && !current.complete) {
      const key = el.dataset.key;
      const seconds = +current.fields[key].reps;
      if (!Number.isFinite(seconds) || seconds <= 0) { notice('Enter a duration greater than zero before starting the exercise timer.'); return; }
      current.exerciseTimer = { key, exercise: key.split(':')[2], end: Date.now()+seconds*1000 };
      saveDraft(); refreshClocks();
    }
  });
  document.addEventListener('error', event => {
    if (event.target.tagName !== 'IMG') return;
    const img = event.target;
    const fallback = document.createElement('span');
    fallback.className = 'exercise-photo photo-fallback';
    fallback.textContent = 'Photo unavailable';
    fallback.setAttribute('role','img');
    fallback.setAttribute('aria-label', img.alt + ' (photo unavailable)');
    img.replaceWith(fallback);
  }, true);
  window.addEventListener('pagehide', () => {
    if (restoring) return;
    if (activeProgram === 'strength') saveDraft();
    else $('bangtaoFrame')?.contentWindow?.preserveBangtaoSession?.();
  });
  document.addEventListener('visibilitychange', () => { if (activeProgram === 'strength') { saveDraft(); refreshClocks(); } });
  $('date').textContent = new Date().toLocaleDateString(undefined, {weekday:'long',month:'long',day:'numeric'});
  $('manualRestChoices').innerHTML = [30,45,60,90].map(n => `<button class="secondary" data-action="rest" data-seconds="${n}">${n}s</button>`).join('') + `<button class="secondary" data-action="toggleSound">${state.soundEnabled === false ? 'Sound off' : 'Sound on'}</button>`;
  loadCurrent(); renderToday(); renderProgram(); renderLibrary(); renderProgress();
  setInterval(refreshClocks, 250);
  // Test the shared generated asset once; missing media must never block logging.
  const sheet = new Image();
  sheet.onerror = () => {
    mediaBroken = true;
    document.querySelectorAll('.sheet-photo').forEach(el => { el.classList.remove('sheet-photo'); el.classList.add('photo-fallback'); el.textContent = 'Photo unavailable'; });
  };
  sheet.src = 'assets/exercises/movement-sheet.png';
  try {
    if (localStorage.getItem(PROGRAM_KEY) === 'bangtao') { $('programChoice').value = 'bangtao'; switchProgram('bangtao'); }
  } catch { /* Default to the new program. */ }
})();
