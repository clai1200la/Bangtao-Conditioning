/* The legacy app runs in its own document: no shared globals, event listeners or storage. */
(() => {
  'use strict';
  const { movements, workouts } = window.STRENGTH_PROGRAM;
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
  let activeTab = 'today';
  let current;
  let mediaBroken = false;
  const workout = () => workouts.find(w => w.id === state.selectedWorkout);
  function persist() {
    if (!storageReadable) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch { notice('Browser storage is full or unavailable. Keep this tab open: recent changes are held in memory but could not be saved.'); }
  }
  function fieldKey(block, round, exercise, side) { return `${block}:${round}:${exercise}:${side}`; }
  function previousField(key) {
    const previous = state.sessions.filter(s => s.workout === state.selectedWorkout && s.complete).sort((a,b) => b.finishedAt.localeCompare(a.finishedAt));
    return previous.find(s => s.fields?.[key])?.fields[key];
  }
  function makeSession() {
    const w = workout();
    const session = { id: uid(), workout: w.id, workoutName: w.name, date: day(), fields: {}, notes: '', elapsed: 0, runningSince: null, complete: false, rested: [], rest: null, exerciseTimer: null };
    w.blocks.forEach(b => {
      for (let round = 0; round < b.rounds; round++) b.entries.forEach(e => {
        (e.eachSide ? ['left','right'] : ['both']).forEach(side => {
          const key = fieldKey(b.id, round, e.exercise, side);
          session.fields[key] = { reps: e.target === 'failure' ? '' : String(e.target), weight: previousField(key)?.weight ?? '', done: false };
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
  }
  function saveDraft() {
    if (!current || current.complete) return;
    current.updatedAt = new Date().toISOString();
    state.drafts[current.workout] = current;
    persist();
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
    return `<details class="guide"><summary>Show movement guide</summary>${imgs}<p>${esc(m.guide)}</p></details>`;
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
    const input = (prop, title, value, placeholder = '') => `<label>${title}<input type="number" data-field="${key}" data-prop="${prop}" value="${esc(value)}" min="0" step="${prop === 'weight' ? '0.5' : '1'}" inputmode="decimal" placeholder="${placeholder}" aria-label="${esc(label+' '+title)}" ${disabled}></label>`;
    const reps = input('reps', entry.timed ? 'SECONDS' : 'ACTUAL REPS', f.reps, entry.target === 'failure' ? 'Actual' : '');
    const weights = m.weighted ? input('weight', ['hammer','stepup','lunge','reversecurl','lyingtriceps','inclinefly','backfly','flatfly','raisefront'].includes(entry.exercise) ? 'LB / HAND' : 'LB', f.weight, '—') : '<span></span>';
    return `<div class="log-row">${side !== 'both' ? `<span class="side-name">${side === 'left' ? 'Left' : 'Right'}</span>` : ''}${reps}${weights}<label class="check-label">DONE<input class="set-complete" type="checkbox" data-field="${key}" data-prop="done" aria-label="${esc(label+' complete')}" ${f.done ? 'checked' : ''} ${disabled}></label></div>${entry.timed ? `<button class="full timed-button secondary" data-action="exerciseTimer" data-key="${key}" ${disabled}>Start ${esc(m.name)} timer</button>` : ''}`;
  }
  function renderToday() {
    const w = workout();
    $('workoutChoice').innerHTML = workouts.map(x => `<option value="${x.id}" ${x.id === w.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    $('workoutSummary').textContent = `${w.blocks.reduce((n,b) => n+b.entries.length,0)} exercises · est. ${w.minutes} min · choose at your own pace`;
    $('sessionStatus').innerHTML = current.complete ? `<div class="saved-message">✓ Workout saved. <button class="secondary" data-action="newSession">Start another session</button></div>` : (state.drafts[w.id] ? '<p class="micro">Draft saved on this browser</p>' : '');
    $('notes').value = current.notes;
    $('notes').disabled = current.complete;
    $('saveWorkout').disabled = current.complete;
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
        for (let r = 0; r < b.rounds; r++) rounds += `<div class="round" data-block="${b.id}" data-round="${r}"><p class="round-title">Round ${r+1} / ${b.rounds}</p>${b.entries.map(e => `<div class="movement-card" data-exercise="${e.exercise}">${info(e)}${(e.eachSide ? ['left','right'] : ['both']).map(side => row(b,r,e,side)).join('')}${r === 0 ? guide(e.exercise) : ''}</div>`).join('')}</div>`;
      }
      const transition = b.transitionRest ? `<div class="between-rest"><span>${b.transitionRest}s between blocks</span><button class="secondary" data-action="rest" data-seconds="${b.transitionRest}" ${current.complete ? 'disabled' : ''}>Start rest</button></div>` : '';
      return `<article class="workout-block"><header class="block-header"><h2>${esc(name)}</h2><p class="micro">${b.rounds} ${b.kind === 'single' ? 'sets' : 'rounds'} · ${restDescription}</p></header>${rounds}${transition}</article>`;
    }).join('');
    refreshClocks();
  }
  function renderProgram() {
    $('programList').innerHTML = workouts.map(w => `<article class="card"><h2>${esc(w.name)}</h2><p class="muted">${w.blocks.reduce((n,b) => n+b.entries.length,0)} exercises · est. ${w.minutes} minutes</p>${w.instructions ? `<p class="warning">${esc(w.instructions)}</p>` : ''}<ol class="program-outline">${w.blocks.map(b => `<li><b>${b.kind === 'single' ? '' : `${b.kind === 'group' ? 'Group' : b.kind === 'circuit' ? 'Circuit' : 'Superset'} · `}${b.rounds} ${b.kind === 'single' ? 'sets' : 'rounds'}</b><br>${b.entries.map(e => `${esc(movements[e.exercise].name)} — ${targetText(e)}${e.note ? ` (${esc(e.note)})` : ''}`).join('<br>')}<br><span class="micro">${b.rest ? `${b.rest}s rest` : 'No prescribed round rest'}${b.transitionRest ? ` · ${b.transitionRest}s between blocks` : ''}</span></li>`).join('')}</ol><button data-action="choose" data-workout="${w.id}" class="full">Choose workout</button></article>`).join('');
  }
  function renderLibrary() {
    $('libraryList').innerHTML = Object.entries(movements).map(([id,m]) => `<article class="card"><div class="exercise-info">${photo(id)}<div class="exercise-heading"><h2>${esc(m.name)}</h2></div></div>${guide(id)}</article>`).join('');
  }
  function renderProgress() {
    $('logged').textContent = state.sessions.filter(s => s.complete).length;
    $('history').innerHTML = state.sessions.slice().reverse().map(s => `<button class="history-entry" data-action="review" data-id="${esc(s.id)}"><b>${esc(s.workoutName)}</b><span class="muted">${esc(s.date)} · ${fmt(s.elapsed)} · ${Object.values(s.fields).filter(f => f.done).length} entries checked</span>${s.notes ? `<span>${esc(s.notes)}</span>` : ''}</button>`).join('') || '<div class="card muted">No completed workouts yet. Finish and save a session to see it here.</div>';
  }
  function review(id) {
    const s = state.sessions.find(x => x.id === id);
    if (!s) return;
    const w = workouts.find(x => x.id === s.workout);
    $('history').innerHTML = `<div class="card"><button class="secondary" data-action="historyBack">Back to history</button><h2 class="review-title">${esc(s.workoutName)}</h2><p class="muted">${esc(s.date)} · ${fmt(s.elapsed)}</p>${s.notes ? `<p>${esc(s.notes)}</p>` : ''}${w.blocks.map(b => `<div class="review-block"><h3>${b.kind === 'single' ? esc(movements[b.entries[0].exercise].name) : esc(b.kind)}</h3>${Array.from({length:b.rounds},(_,r) => `<p class="micro">${b.kind === 'single' ? 'Set' : 'Round'} ${r+1}</p>${b.entries.map(e => (e.eachSide ? ['left','right'] : ['both']).map(side => {
      const f = s.fields[fieldKey(b.id,r,e.exercise,side)] || {};
      return `<p class="muted">${esc(movements[e.exercise].name)}${side === 'both' ? '' : ` · ${side}`} · ${f.reps === '' ? '—' : esc(f.reps)} ${e.timed ? 'sec' : 'reps'}${movements[e.exercise].weighted ? ` · ${f.weight === '' ? '—' : esc(f.weight)} lb` : ''} · ${f.done ? '✓' : 'Unchecked'}</p>`;
    }).join('')).join('')}`).join('')}</div>`).join('')}</div>`;
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
  }
  function chooseWorkout(id) {
    if (!workouts.some(w => w.id === id)) return;
    pauseSession(); stopClocks(); saveDraft();
    state.selectedWorkout = id;
    persist(); loadCurrent(); renderToday(); showTab('today');
  }
  function startRest(seconds, label = 'Rest · next set') {
    if (current.complete || !seconds) return;
    current.rest = { end: Date.now() + seconds * 1000, label };
    saveDraft(); refreshClocks();
  }
  function completedField(key) {
    const [blockId,roundIndex] = key.split(':');
    const b = workout().blocks.find(x => x.id === blockId);
    const round = +roundIndex;
    const keys = b.entries.flatMap(e => (e.eachSide ? ['left','right'] : ['both']).map(side => fieldKey(b.id,round,e.exercise,side)));
    const token = `${b.id}:${round}`;
    if (keys.every(k => current.fields[k].done) && !current.rested.includes(token)) {
      current.rested.push(token);
      const final = round === b.rounds-1;
      const seconds = final ? (b.transitionRest || 0) : b.rest;
      if (seconds) startRest(seconds, final ? 'Rest · next block' : b.kind === 'single' ? 'Rest · next set' : 'Rest · next round');
    }
  }
  function alarm() {
    try { navigator.vibrate?.([150,80,150]); } catch { /* Vibration is optional. */ }
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
        const checkbox = document.querySelector(`[data-field="${timer.key}"][data-prop="done"]`);
        if (checkbox) checkbox.checked = true;
        completedField(timer.key); alarm(); saveDraft();
        $('exerciseTimer').hidden = true;
      }
    }
  }
  function finishWorkout() {
    if (current.complete) return;
    const invalid = document.querySelector('#today input:invalid');
    if (invalid) { invalid.reportValidity(); return; }
    const missing = Object.values(current.fields).some(f => !f.done);
    if (missing && !window.confirm('Some sets are unchecked. Save this workout with the entries you have logged?')) return;
    pauseSession(); stopClocks();
    current.complete = true;
    current.finishedAt = new Date().toISOString();
    state.sessions.push(current);
    state.lastSaved[current.workout] = current.id;
    delete state.drafts[current.workout];
    persist(); renderToday(); showTab('progress'); review(current.id);
  }
  function switchProgram(program) {
    if (program === activeProgram) return;
    if (program === 'bangtao') {
      pauseSession(); stopClocks(); saveDraft();
      activeProgram = 'bangtao';
      $('strengthShell').hidden = true;
      $('legacyMount').hidden = false;
      document.body.classList.add('legacy-active');
      const frame = document.createElement('iframe');
      frame.id = 'bangtaoFrame'; frame.title = 'Bangtao Prep program'; frame.src = 'bangtao.html';
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
  document.addEventListener('input', event => {
    if (activeProgram !== 'strength' || current.complete) return;
    const el = event.target;
    if (el.id === 'notes') { current.notes = el.value; saveDraft(); return; }
    if (el.dataset.field && el.dataset.prop !== 'done') {
      // Blank entries are allowed; invalid negatives and non-finite values are not saved.
      if (el.value !== '' && (!Number.isFinite(el.valueAsNumber) || el.valueAsNumber < 0)) { el.setCustomValidity('Enter a number of zero or more.'); return; }
      el.setCustomValidity('');
      current.fields[el.dataset.field][el.dataset.prop] = el.value;
      saveDraft();
    }
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'programChoice') { switchProgram(event.target.value); return; }
    if (activeProgram !== 'strength') return;
    if (event.target.id === 'workoutChoice') { chooseWorkout(event.target.value); return; }
    if (event.target.dataset.prop === 'done' && !current.complete) {
      const key = event.target.dataset.field;
      current.fields[key].done = event.target.checked;
      if (event.target.checked) completedField(key);
      saveDraft();
    }
  });
  document.addEventListener('click', event => {
    if (activeProgram !== 'strength') return;
    const el = event.target.closest('button');
    if (!el) return;
    if (el.dataset.tab) { showTab(el.dataset.tab); return; }
    if (el.id === 'sessionToggle') {
      if (current.runningSince) pauseSession(); else current.runningSince = Date.now();
      saveDraft(); refreshClocks();
    } else if (el.id === 'saveWorkout') finishWorkout();
    else if (el.id === 'skipRest') { current.rest = null; saveDraft(); refreshClocks(); }
    else if (el.id === 'cancelExercise') { current.exerciseTimer = null; saveDraft(); refreshClocks(); }
    else if (el.dataset.action === 'choose') chooseWorkout(el.dataset.workout);
    else if (el.dataset.action === 'rest') startRest(+el.dataset.seconds, 'Manual rest');
    else if (el.dataset.action === 'review') review(el.dataset.id);
    else if (el.dataset.action === 'historyBack') renderProgress();
    else if (el.dataset.action === 'newSession') {
      delete state.lastSaved[state.selectedWorkout];
      current = makeSession(); saveDraft(); renderToday();
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
    if (activeProgram === 'strength') saveDraft();
    else $('bangtaoFrame')?.contentWindow?.preserveBangtaoSession?.();
  });
  document.addEventListener('visibilitychange', () => { if (activeProgram === 'strength') { saveDraft(); refreshClocks(); } });
  $('date').textContent = new Date().toLocaleDateString(undefined, {weekday:'long',month:'long',day:'numeric'});
  $('manualRestChoices').innerHTML = [30,45,60,90].map(n => `<button class="secondary" data-action="rest" data-seconds="${n}">${n}s</button>`).join('');
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
