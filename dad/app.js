(() => {
  'use strict';
  const store = window.DadStore;
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => crypto.randomUUID();
  const phaseNames = { warmup: 'Warm-up', strength: 'Strength', cooldown: 'Cooldown' };
  const state = () => store.state;
  const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const formatDate = value => new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const clock = seconds => `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;
  const button = (action, label, cls = '', attrs = '') => `<button data-action="${action}" class="${cls}" ${attrs}>${label}</button>`;
  let demoPlaying = false, demoFrame = 1, demoInterval = null, audio = null, audioReady = false, dialogAction = null;
  let feedback = '', reviewPartialConfirmed = false;

  function route() {
    const hash = location.hash.slice(1);
    const match = hash.match(/^(workout|review)-([ab])$/);
    if (match && state().drafts[match[2]]) return { view: match[1], id: match[2] };
    return { view: ['walk', 'history'].includes(hash) ? hash : 'today' };
  }
  function current() {
    const r = route(), session = state().drafts[r.id];
    const exercise = session?.exercises[session.index];
    return { r, session, exercise, record: exercise?.records[exercise.cursor] };
  }
  function announce(message) {
    $('announcement').textContent = message;
  }
  function message(text) {
    feedback = text;
    const el = $('actionStatus');
    if (el) { el.textContent = text; el.hidden = !text; }
    announce(text);
  }
  const status = () => `<p id="actionStatus" class="notice" role="status" ${feedback ? '' : 'hidden'}>${escape(feedback)}</p>`;
  function storageNotice() {
    const el = $('storageNotice');
    el.hidden = !store.warning;
    el.textContent = store.warning;
  }
  function save() {
    const saved = store.save();
    storageNotice();
    return saved;
  }
  function soundButton() {
    return button('sound', audioReady && state().settings.sound ? 'Mute sound' : 'Enable sound', 'secondary sound-button', 'id="soundButton"');
  }
  async function enableSound() {
    if (audioReady && state().settings.sound) {
      state().settings.sound = false; audioReady = false; save(); render(); return;
    }
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Audio unavailable');
      audio ??= new Audio();
      await audio.resume();
      audioReady = audio.state === 'running';
      if (!audioReady) throw new Error('Audio paused');
      state().settings.sound = true; save(); ping(); render();
      message('Sound enabled. Keep this page open for timer sounds.');
    } catch { message('Sound could not start. Timers still show a visible completion message.'); }
  }
  function ping() {
    if (!state().settings.sound || !audioReady || !audio || audio.state !== 'running') return;
    [0, .3].forEach(offset => {
      const oscillator = audio.createOscillator(), gain = audio.createGain(), time = audio.currentTime + offset;
      oscillator.type = 'sine'; oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(.15, time + .02);
      gain.gain.exponentialRampToValueAtTime(.001, time + .23);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(time); oscillator.stop(time + .25);
    });
  }
  const remaining = timer => timer.running ? Math.max(0, Math.ceil((timer.deadline - Date.now()) / 1000)) : Math.ceil(timer.remaining);
  function startTimer(kind, seconds, label, extra = {}) {
    state().timer = { id: uid(), kind, label, remaining: seconds, deadline: Date.now() + seconds * 1000, running: true, completed: false, ...extra };
    save(); renderTimer();
  }
  function renderTimer() {
    const panel = $('timerPanel'), t = state().timer;
    panel.hidden = !t;
    if (!t) { panel.innerHTML = ''; return; }
    const title = t.completed ? `${t.kind === 'rest' ? 'Rest' : t.kind === 'walk' ? 'Walk target' : 'Hold'} complete` : t.label;
    panel.innerHTML = `<div><div class="timer-heading"><strong id="timerLabel">${escape(title)}</strong><span id="timerCount" class="timer-count" aria-live="off">${clock(remaining(t))}</span></div><p class="audio-tip">${audioReady && state().settings.sound ? 'Sound on · keep this page open' : 'Sound off · use Enable sound above'}</p></div>
      <div class="button-row">${!t.completed ? button('timer-pause', t.running ? 'Pause' : 'Resume', 'secondary') + button('timer-add', '+30 sec', 'secondary') : ''}${button('timer-dismiss', t.completed ? 'Dismiss' : t.kind === 'rest' ? 'Skip rest' : 'Cancel timer', 'secondary')}</div>`;
  }
  function tick() {
    const timer = state().timer;
    if (timer?.running && remaining(timer) === 0 && !timer.completed) {
      timer.running = false; timer.completed = true; timer.remaining = 0; save();
      ping(); announce(`${timer.kind === 'rest' ? 'Rest' : timer.kind === 'walk' ? 'Walk target' : 'Hold'} complete.`); renderTimer();
    } else if (timer && $('timerCount')) $('timerCount').textContent = clock(remaining(timer));
    if ($('walkElapsed')) $('walkElapsed').textContent = clock(walkElapsed());
  }
  function makeRecords(exercise, setNumber) {
    return (exercise.setsBySide ? [setNumber === 1 ? 'left' : 'right'] : exercise.sides ? ['left', 'right'] : ['both']).map(side => ({ id: uid(), set: setNumber, side,
      value: exercise.mode === 'time' ? exercise.seconds : exercise.reps || 0, done: false }));
  }
  function startWorkout(id) {
    if (state().walkDraft?.running) {
      state().walkDraft.elapsed = walkElapsed(); state().walkDraft.running = false; state().walkDraft.started = 0;
      if (state().timer?.kind === 'walk') state().timer = null;
      save();
    }
    if (!state().drafts[id]) {
      const definition = window.DAD_PROGRAM.workouts.find(w => w.id === id);
      const exercises = structuredClone(definition.exercises).map(ex => ({ ...ex, skipped: false, cursor: 0,
        records: Array.from({ length: ex.sets }, (_, i) => makeRecords(ex, i + 1)).flat() }));
      state().drafts[id] = { id: uid(), workoutId: id, title: definition.title, startedAt: new Date().toISOString(), index: 0, exercises, notes: '' };
      save();
    }
    const t = state().timer;
    if (t && t.kind !== 'walk' && t.sessionId !== state().drafts[id].id) { state().timer = null; save(); }
    location.hash = `workout-${id}`;
  }
  function completeCount(session) {
    return session.exercises.filter(e => !e.skipped && e.records.every(r => r.done)).length;
  }
  function updatedPlanAvailable(session) {
    const latest = window.DAD_PROGRAM.workouts.find(w => w.id === session.workoutId);
    return latest && (latest.exercises.length !== session.exercises.length || latest.exercises.some((e, i) =>
      ['id', 'mode', 'reps', 'seconds', 'setsBySide'].some(key => e[key] !== session.exercises[i]?.[key])));
  }
  function weeklyMinutes() {
    const monday = new Date(); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
    const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
    return state().history.filter(h => h.kind === 'walk' && h.date >= localDate(monday) && h.date <= localDate(sunday)).reduce((sum, h) => sum + h.minutes, 0);
  }
  function home() {
    const minutes = weeklyMinutes(), goal = state().settings.walkGoal;
    return `<div class="home-intro"><h1>Let’s move today</h1><p class="muted">Choose strength or a walk. Go at your own pace.</p></div>${status()}
      <div class="home-layout"><div><div class="choice-list">${window.DAD_PROGRAM.workouts.map(w => {
        const draft = state().drafts[w.id];
        return `<section class="workout-choice"><h2>${escape(w.title)}</h2><p>Warm-up, full-body strength and stretching.</p><p class="muted small">About 45 minutes · 2 sets, with an optional third</p>${draft ? `<p class="small">In progress · ${completeCount(draft)} of ${draft.exercises.length} exercises done</p>` : ''}<div class="button-row">${button('start-workout', draft ? 'Resume workout' : 'Start workout', '', `data-id="${w.id}"`)}${button('plan', 'See exercises', 'secondary', `data-id="${w.id}"`)}</div><div id="plan-${w.id}" hidden><ol class="plain-list">${w.exercises.map(e => `<li><strong>${phaseNames[e.phase]}:</strong> ${escape(e.name)} · ${escape(e.target)}</li>`).join('')}</ol></div></section>`;
      }).join('')}<section class="workout-choice"><h2>Take a walk</h2><p>Start with 5–10 comfortable minutes. Short walks count.</p><a href="#walk" class="button">Start / log a walk</a></section></div>
      <p class="data-note">Your workouts are saved in this browser on this device. They do not automatically sync to another iPad, phone or computer. Download a backup regularly.</p></div>
      <aside class="week-walking"><h2>Walking this week</h2><div class="total">${minutes} / ${goal} min</div><meter aria-label="Weekly walking minutes" min="0" max="${goal}" value="${Math.min(minutes, goal)}"></meter><p class="small">Monday–Sunday · starting goal ${goal} minutes. Build toward 150 minutes of moderately brisk walking per week as comfortable.</p>
      <h3>A flexible week</h3><ul class="week-plan"><li>Monday: Day A + short walk</li><li>Tuesday & Wednesday: walk</li><li>Thursday: Day B + short walk</li><li>Friday: walk</li><li>Weekend: rest or an optional walk</li></ul><p class="small">Keep strength days apart. No need to catch up or do extra sets after a missed day.</p>${soundButton()}</aside></div>
      <details><summary>Program notes & exercise guidance</summary><p>This starting program is a draft to review with your physiotherapist, especially knee-bending depth, bridges, shoulder loading and prone work. Stop an exercise that causes pain and ask for advice. Do not force a stretch.</p><p>Cat-cow, pelvic tilts and hamstring stretching use your physio’s dose. Bird dog is set to 10 reps with one arm/leg pair, then 10 with the other, as selected for this plan. Follow your physio’s instructions if they differ. Shoulder-blade lifts are light upper-back work; they do not provide the same pulling resistance as rows.</p><p>Start with 2 sets. Bird dog stays at one set per side. For other strength exercises, add a third only when the current amount feels comfortable and technique stays controlled. Use your physio’s advice to progress.</p><p>Illustrations are AI-generated, with arrows and labeled positions. They are guides, not recordings or a substitute for a demonstration from your physio. See <a href="assets/SOURCES.md">image notes and sources</a>.</p><p>Exercise references: <a href="https://www.nhs.uk/live-well/exercise/strength-exercises/" target="_blank" rel="noopener noreferrer">NHS home strength exercises</a> · <a href="https://www.cdc.gov/physical-activity-basics/guidelines/older-adults.html" target="_blank" rel="noopener noreferrer">CDC activity guidance</a>.</p></details>`;
  }
  const movementMedia = exercise => ({ ...exercise.media, ...window.DAD_PROGRAM.mediaGuides?.[exercise.id] });
  const mediaCaption = (m, frame) => m.labels ? `Two-position guide · ${m.caption}` : m.caption || (m.still ? 'Position guide · arrows show stretch direction' : `2-position illustration · position ${frame + 1} of 2`);
  const recordSide = (exercise, record) => record.side === 'both' ? '' : exercise.id === 'birddog' ? (record.side === 'left' ? 'Left arm + right leg' : 'Right arm + left leg') : record.side[0].toUpperCase() + record.side.slice(1);
  function demo(exercise) {
    const m = movementMedia(exercise), rows = m.rows || 3;
    demoFrame = m.initialFrame ?? 1;
    return `<div class="demo-stage ${m.single ? 'single' : ''}" id="demoStage"><img id="demoImage" src="assets/${m.sheet}.webp?v=cartoon-motion-20261128" alt="${escape(exercise.name)}: ${escape(m.labels?.[demoFrame] || (m.single ? m.caption || 'illustrated hold position' : 'illustrated position with movement arrows'))}" style="height:${m.single ? 100 : rows * 100}%;top:-${m.row * 100}%;left:${m.single ? '0' : `-${demoFrame * 100}%`}" decoding="async"><div class="demo-failure" id="demoFailure" hidden>Picture unavailable. Follow the written steps or open the YouTube search.</div></div>
      <p class="demo-step" id="demoStep" aria-live="off" ${m.labels ? '' : 'hidden'}>${escape(m.labels?.[demoFrame] || '')}</p>
      <div class="demo-controls">${m.still ? button('show-position', 'Show position', 'secondary', 'id="demoButton"') : button('demo', 'Play demo', '', 'id="demoButton" aria-pressed="false"')}
      <a class="button secondary" href="https://www.youtube.com/results?search_query=${encodeURIComponent(exercise.search || exercise.name + ' physiotherapy exercise')}" target="_blank" rel="noopener noreferrer">YouTube search</a></div>
      <p class="demo-caption" id="demoCaption">${escape(mediaCaption(m, demoFrame))}</p>`;
  }
  function exerciseView(session) {
    if (session.index >= session.exercises.length) return review(session);
    const e = session.exercises[session.index], rec = e.records[e.cursor], phase = session.exercises.filter(x => x.phase === e.phase);
    const ordinal = phase.indexOf(e) + 1, side = rec.side === 'both' ? '' : `${recordSide(e, rec)} · `;
    const units = e.mode === 'time' ? 'Your seconds:' : e.mode === 'holds' ? 'Your holds:' : 'Your reps:';
    const targetLabel = e.mode === 'time' ? 'Target time' : e.mode === 'holds' ? 'Target holds' : e.id === 'hamstring' ? 'Target stretch' : 'Target reps';
    const counting = window.DAD_PROGRAM.countingGuides?.[e.id];
    const nextIndex = e.records.findIndex((r, i) => i > e.cursor && !r.done);
    return `<div class="workout-top"><div><h1>${escape(session.title)}</h1><p class="phase-label">${phaseNames[e.phase]} · Exercise ${ordinal} of ${phase.length}</p></div><div class="button-row">${soundButton()}${button('home', 'Choose workout', 'secondary')}</div></div>${status()}
      ${updatedPlanAvailable(session) ? `<aside class="notice"><p><strong>An updated workout plan is ready.</strong> This workout keeps the exercises and targets you started with. Review and save it, even if partly done, then start a new workout to use the update.</p>${button('review', 'Review & save current workout', 'secondary')}</aside>` : ''}
      <div class="workout-layout"><div>${demo(e)}</div><section class="instructions" aria-labelledby="exerciseTitle"><h2 id="exerciseTitle">${escape(e.name)}</h2>
      <div class="target" aria-labelledby="targetLabel"><h3 id="targetLabel">${targetLabel}</h3><p id="targetValue">${e.phase === 'strength' && e.mode !== 'physio' ? `${e.sets} sets · ` : ''}${escape(e.target)}</p></div>
      <ul class="steps">${e.steps.map(step => `<li>${escape(step)}</li>`).join('')}</ul>${counting ? `<p class="rep-explanation" id="repExplanation"><strong>${escape(counting.label)}:</strong> ${escape(counting.text)}</p>` : ''}${e.mode === 'physio' ? '<p class="physio-note small">Use your physio’s dose and counting method. Mark Done after completing it. Counting reps here is optional.</p>' : ''}
      <p class="set-label">${e.mode === 'physio' ? 'Prescribed exercise' : `${side}Set ${rec.set} of ${e.sets}`}${e.skipped ? ' · Skipped' : rec.done ? ' · Saved ✓' : ''}</p>
      <div class="rep-control">${button('rep-minus', '−', '', 'id="repMinus" aria-label="Decrease count"')}<div class="rep-number"><label for="repValue">${units}</label><input id="repValue" type="number" inputmode="numeric" min="${e.mode === 'physio' ? 0 : 1}" max="${e.mode === 'time' ? 3600 : 999}" value="${rec.value}" ${counting ? 'aria-describedby="repExplanation"' : ''}></div>${button('rep-plus', '+', '', 'id="repPlus" aria-label="Increase count"')}</div>
      ${rec.done ? button(nextIndex >= 0 ? 'next-record' : 'next', nextIndex >= 0 ? 'Next set / side' : 'Next exercise', 'done-button full', 'id="nextRecord"') : button('done', e.mode === 'physio' ? 'Done' : 'Set done', 'done-button full', 'id="setDone"')}
      ${e.mode === 'time' || e.mode === 'holds' ? `<div class="timer-inline"><strong>${e.mode === 'time' ? 'Movement timer' : 'Hold timer · 5 sec each'}</strong>${button('hold-timer', 'Start timer', 'secondary')}</div>` : ''}
      </section></div>
      <nav class="exercise-nav" aria-label="Exercise navigation">${button('previous', 'Previous', 'secondary', session.index === 0 ? 'disabled' : '')}${button('skip', 'Skip exercise', 'secondary')}${button('next', session.index === session.exercises.length - 1 ? 'Review workout' : 'Next exercise')}</nav>
      <details class="workout-options"><summary>Sets, comfort & workout stages</summary>
      ${e.phase === 'strength' ? '<p class="hint">60-second rest starts automatically after completion.</p>' : ''}
      <div class="record-picker" aria-label="Choose a set to view or correct">${e.records.map((r, i) => button('record', `${r.done ? '✓ ' : ''}${r.side === 'both' ? 'Set ' : recordSide(e, r) + ' · '}${r.set}`, `secondary ${r.done ? 'record-done' : ''} ${i === e.cursor ? 'selected' : ''}`, `data-index="${i}" aria-pressed="${i === e.cursor}"`)).join('')}</div>
      <div class="set-tools">${rec.done ? button('undo', 'Undo completion', 'secondary') : ''}${e.phase === 'strength' && e.mode !== 'physio' && !e.setsBySide && e.sets < 3 ? button('add-set', 'Add a third set', 'secondary') : ''}${button('rest', 'Start a rest', 'secondary')}</div>
      ${e.easier ? `<p class="hint">${escape(e.easier)}</p>` : ''}
      <div class="phase-jump" aria-label="Workout stages">${Object.entries(phaseNames).map(([key, label]) => button('phase', label, `secondary ${e.phase === key ? 'active' : ''}`, `data-phase="${key}"`)).join('')}${button('review', 'Finish / review', 'secondary')}</div></details>
      <p class="save-line">${store.warning ? 'Changes are in memory only. Download a backup.' : 'Saved on this device as you go.'}</p>`;
  }
  function review(session) {
    const done = completeCount(session);
    return `<h1>Review your workout</h1><p>${escape(session.title)}</p>${status()}<p><strong>${done} of ${session.exercises.length} exercises completed.</strong> You can save a partial workout.</p>
      <ul class="review-list">${session.exercises.map((e, i) => `<li><div><strong>${escape(e.name)}</strong><small>${phaseNames[e.phase]} · ${e.skipped ? 'Skipped' : e.records.every(r => r.done) ? 'Done' : `${e.records.filter(r => r.done).length} of ${e.records.length} entries done`}</small></div>${button('go-exercise', 'View / edit', 'secondary', `data-index="${i}"`)}</li>`).join('')}</ul>
      <label for="sessionNotes" class="inline-label">How did it feel? (optional)</label><textarea id="sessionNotes" maxlength="2000" placeholder="Any notes for next time">${escape(session.notes)}</textarea>
      <div class="button-row finish-actions">${button('finish', 'Save workout')}${button('back-to-workout', 'Back to workout', 'secondary')}</div>`;
  }
  function askConfirm(title, text, label, action) {
    $('dialogTitle').textContent = title; $('dialogMessage').textContent = text; $('dialogConfirm').textContent = label;
    dialogAction = action; $('confirmDialog').showModal();
  }
  function finishWorkout() {
    const { session } = current();
    if (!session || state().history.some(h => h.id === session.id)) return;
    if (completeCount(session) !== session.exercises.length && !reviewPartialConfirmed) {
      askConfirm('Save a partial workout?', 'Some exercises are unfinished or skipped. Save what you completed?', 'Save partial workout', () => {
        reviewPartialConfirmed = true; finishWorkout(); reviewPartialConfirmed = false;
      }); return;
    }
    session.finishedAt = new Date().toISOString();
    session.partial = completeCount(session) !== session.exercises.length;
    state().history.push(structuredClone(session)); delete state().drafts[session.workoutId];
    if (state().timer?.sessionId === session.id) state().timer = null;
    save(); location.hash = 'history'; message('Workout saved.');
  }
  function history() {
    const logs = [...state().history].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
    return `<div class="history-layout"><h1>History & Backup</h1>${status()}<p>${logs.length} saved ${logs.length === 1 ? 'session' : 'sessions'} · walking this week: ${weeklyMinutes()} minutes</p>
      ${logs.length ? `<div class="history-list">${logs.map(h => h.kind === 'walk' ? `<article class="history-row"><h2>Walk · ${h.minutes} minutes</h2><p>${escape(formatDate(h.date))}</p></article>` : `<article class="history-row"><details><summary><span>${escape(h.title)}</span><span class="small">${escape(formatDate(h.finishedAt))} · ${h.partial ? 'Partial' : 'Complete'}</span></summary><div class="history-detail"><p>${completeCount(h)} of ${h.exercises.length} exercises done.</p><ul class="plain-list">${h.exercises.map(e => `<li><strong>${escape(e.name)}</strong>: ${e.skipped ? 'Skipped; ' : ''}${e.records.map(r => `${r.side !== 'both' ? recordSide(e, r) + ' · ' : ''}${e.mode === 'physio' ? (r.value ? r.value + ' counted reps · ' : '') + (r.done ? 'prescribed exercise done' : 'not done') : `set ${r.set}: ${r.value} ${e.mode === 'time' ? 'sec' : e.mode === 'holds' ? 'holds' : 'reps'}${r.done ? ' ✓' : ' (not done)'}`}`).map(escape).join('; ')}</li>`).join('')}</ul>${h.notes ? `<p>Notes: ${escape(h.notes)}</p>` : ''}</div></details></article>`).join('')}</div>` : '<p class="notice">No saved workouts yet. Your first workout or walk will appear here.</p>'}
      <section class="backup-section"><h2>Keep a backup</h2><p>Data stays in this browser on this device. It does not automatically sync. Clearing browser data, using private browsing, or changing devices can remove access to these records.</p><p>Download a backup regularly and keep the file somewhere you can find it.</p>${button('export', 'Download backup')}
      <label class="restore-label" for="restoreFile">Restore a Dad’s workouts backup</label><p class="small muted">Restore into Dad’s app with empty history and drafts. It will not change the other workout app. Imported timers stay off.</p><input id="restoreFile" class="restore-input" type="file" accept="application/json,.json"><p id="backupStatus" class="status" role="status"></p></section>
      <section class="backup-section"><h2>Walking goal</h2><label for="weeklyGoal" class="inline-label">Minutes per week</label><input id="weeklyGoal" type="number" min="5" max="1500" step="5" value="${state().settings.walkGoal}"><p class="small muted">Start with what is comfortable. Build toward 150 minutes of moderate walking weekly. The app never increases this automatically.</p>${button('save-goal', 'Save walking goal', 'secondary')}</section><p class="data-note"><a href="assets/SOURCES.md">Illustration notes & sources</a></p></div>`;
  }
  function walkElapsed() {
    const draft = state().walkDraft;
    if (!draft) return 0;
    return draft.elapsed + (draft.running ? Math.max(0, Date.now() - draft.started) / 1000 : 0);
  }
  function walkView() {
    const d = state().walkDraft;
    return `<h1>Take a walk</h1>${status()}<div class="walk-layout"><section><p>Start with 5–10 comfortable minutes on a flat, clear route. Short walks count.</p>
      <label class="inline-label" for="walkTarget">Today’s target (minutes)</label><input id="walkTarget" type="number" min="1" max="180" value="${state().settings.walkMinutes}">
      <div id="walkElapsed" class="walk-time" aria-label="Walk elapsed time" aria-live="off">${clock(walkElapsed())}</div><div class="button-row">${button('walk-toggle', d?.running ? 'Pause walk' : d ? 'Resume walk' : 'Start walk')}${soundButton()}</div>
      ${d ? `<div class="button-row history-actions">${button('walk-save-timed', 'Save timed walk', 'secondary')}${button('walk-discard', 'Discard walk timer', 'quiet')}</div>` : ''}
      <p class="hint">The timer counts elapsed time. It does not track steps, distance or GPS. Sound may not play if the iPad locks or suspends the page.</p>
      <section class="walk-form"><h2>Log a walk afterward</h2><p>You can leave the iPad at home.</p><div class="form-row"><label for="walkMinutes">Minutes walked<input id="walkMinutes" type="number" min="1" max="1440" value="${state().settings.walkMinutes}"></label><label for="walkDate">Date<input id="walkDate" type="date" value="${localDate()}" max="${localDate()}"></label></div>${button('walk-log', 'Save walk')}</section></section>
      <aside class="walk-guidance"><h2>Build up gradually</h2><p>Try 5–10 minutes on five days to begin, if comfortable. Build toward 15–20 minutes, then 30 minutes on five days.</p><p>At a moderate pace you breathe faster but can still talk, rather than sing. Start easier if needed.</p><p>If back or knee symptoms worsen, shorten the walk and ask your physiotherapist about persistent symptoms.</p><p>Chest pain, faintness or unusual breathlessness: stop and seek medical help.</p><p><strong>This week: ${weeklyMinutes()} / ${state().settings.walkGoal} minutes.</strong></p><p><a href="https://www.nhs.uk/live-well/exercise/walking-for-health/" target="_blank" rel="noopener noreferrer">NHS walking guidance</a></p></aside></div>`;
  }
  function render() {
    const focused = document.activeElement?.id;
    clearInterval(demoInterval); demoInterval = null; demoPlaying = false; demoFrame = 1;
    const r = route();
    for (const [id, active] of [['navToday', r.view !== 'history'], ['navHistory', r.view === 'history']]) {
      if (active) $(id).setAttribute('aria-current', 'page'); else $(id).removeAttribute('aria-current');
    }
    if (r.view === 'history') $('main').innerHTML = history();
    else if (r.view === 'walk') $('main').innerHTML = walkView();
    else if (r.view === 'review') $('main').innerHTML = review(state().drafts[r.id]);
    else if (r.view === 'workout') $('main').innerHTML = exerciseView(state().drafts[r.id]);
    else $('main').innerHTML = home();
    if ($('demoImage')) {
      const img = $('demoImage');
      img.addEventListener('error', () => { $('demoFailure').hidden = false; if ($('demoButton')) $('demoButton').disabled = true; });
    }
    if (focused && $(focused)) $(focused).focus({ preventScroll: true });
    storageNotice(); renderTimer();
  }
  function navigateExercise(index) {
    const { session } = current(); if (!session) return;
    const old = session.exercises[session.index];
    if (state().timer?.kind === 'hold' && state().timer.exerciseId === old?.id) state().timer = null;
    session.index = Math.min(session.exercises.length, Math.max(0, index)); save();
    const newHash = session.index === session.exercises.length ? `review-${session.workoutId}` : `workout-${session.workoutId}`;
    if (location.hash.slice(1) !== newHash) location.hash = newHash; else render();
    window.scrollTo({ top: 0 });
    $('main').focus({ preventScroll: true });
  }
  function showFrame(frame) {
    const { exercise } = current(); if (!exercise || !$('demoImage')) return;
    const m = movementMedia(exercise);
    $('demoImage').style.left = m.single ? '0' : `-${frame * 100}%`;
    if (m.labels) {
      $('demoStep').textContent = m.labels[frame];
      $('demoImage').alt = `${exercise.name}: ${m.labels[frame]}`;
    }
    $('demoCaption').textContent = mediaCaption(m, frame);
  }
  function changeCount(delta) {
    const { exercise, record } = current(); if (!record) return;
    record.value = Math.max(exercise.mode === 'physio' ? 0 : 1, Math.min(exercise.mode === 'time' ? 3600 : 999, record.value + delta));
    $('repValue').value = record.value; save();
  }
  function logWalk(minutes, date) {
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error('Enter whole minutes from 1 to 1440.');
    const parsed = new Date(date + 'T12:00:00');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || localDate(parsed) !== date || date > localDate()) throw new Error('Choose a valid date, today or earlier.');
    state().history.push({ id: uid(), kind: 'walk', date, minutes, finishedAt: new Date().toISOString() }); save();
    location.hash = 'history'; message(`Saved a ${minutes}-minute walk.`);
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify(store.backup(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `dad-workouts-${localDate()}.json`; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); message('Backup downloaded. Keep the file somewhere safe.');
  }
  const actions = {
    'start-workout': el => startWorkout(el.dataset.id),
    plan: el => { const panel = $(`plan-${el.dataset.id}`); panel.hidden = !panel.hidden; el.setAttribute('aria-expanded', !panel.hidden); },
    home: () => { location.hash = 'today'; },
    sound: enableSound,
    demo: () => {
      demoPlaying = !demoPlaying; $('demoButton').textContent = demoPlaying ? 'Pause demo' : 'Play demo'; $('demoButton').setAttribute('aria-pressed', demoPlaying);
      clearInterval(demoInterval); if (demoPlaying) { demoFrame = 1 - demoFrame; showFrame(demoFrame); demoInterval = setInterval(() => { demoFrame = 1 - demoFrame; showFrame(demoFrame); }, 1600); }
    },
    'show-position': () => { const { exercise } = current(), m = movementMedia(exercise); demoFrame = m.single ? 0 : 1 - demoFrame; showFrame(demoFrame); if (!m.single && !m.labels) $('demoCaption').textContent = `${m.caption || 'Position guide'} · picture ${demoFrame + 1} of 2`; },
    'rep-minus': () => changeCount(-1), 'rep-plus': () => changeCount(1),
    done: () => {
      const { session, exercise, record } = current(); if (!record || record.done) return;
      exercise.skipped = false; record.done = true; save();
      if (exercise.phase === 'strength') startTimer('rest', 60, 'Rest · ' + exercise.name, { sessionId: session.id, exerciseId: exercise.id });
      render(); announce(`${exercise.name}: ${record.side !== 'both' ? recordSide(exercise, record) + ', ' : ''}saved.`);
    },
    undo: () => { const { record, session, exercise } = current(); record.done = false; if (state().timer?.sessionId === session.id && state().timer.exerciseId === exercise.id) state().timer = null; save(); render(); },
    'next-record': () => { const { exercise } = current(); const index = exercise.records.findIndex((r, i) => i > exercise.cursor && !r.done); if (index >= 0) exercise.cursor = index; save(); render(); },
    record: el => { current().exercise.cursor = Number(el.dataset.index); save(); render(); },
    'add-set': () => { const { exercise } = current(); if (exercise.sets >= 3 || exercise.mode === 'physio' || exercise.setsBySide) return; exercise.sets++; exercise.records.push(...makeRecords(exercise, exercise.sets)); save(); render(); },
    rest: () => { const { session, exercise } = current(); startTimer('rest', 60, 'Rest · ' + exercise.name, { sessionId: session.id, exerciseId: exercise.id }); },
    'hold-timer': () => { const { session, exercise, record } = current(); startTimer('hold', exercise.mode === 'holds' ? exercise.seconds : record.value, 'Timer · ' + exercise.name, { sessionId: session.id, exerciseId: exercise.id }); },
    'timer-pause': () => {
      const t = state().timer; if (!t) return;
      if (t.running) {
        t.remaining = remaining(t); t.running = false;
        if (t.kind === 'walk' && state().walkDraft?.running) { state().walkDraft.elapsed = walkElapsed(); state().walkDraft.running = false; state().walkDraft.started = 0; }
      } else {
        t.deadline = Date.now() + t.remaining * 1000; t.running = true;
        if (t.kind === 'walk' && state().walkDraft) { state().walkDraft.running = true; state().walkDraft.started = Date.now(); }
      }
      save(); if (route().view === 'walk') render(); else renderTimer();
    },
    'timer-add': () => { const t = state().timer; if (!t) return; t.remaining = Math.min(86400, remaining(t) + 30); t.deadline = Date.now() + t.remaining * 1000; t.completed = false; save(); renderTimer(); },
    'timer-dismiss': () => { state().timer = null; save(); renderTimer(); },
    previous: () => navigateExercise(current().session.index - 1), next: () => navigateExercise(current().session.index + 1),
    skip: () => { current().exercise.skipped = true; navigateExercise(current().session.index + 1); },
    phase: el => navigateExercise(current().session.exercises.findIndex(e => e.phase === el.dataset.phase)),
    review: () => { location.hash = 'review-' + current().session.workoutId; },
    'go-exercise': el => navigateExercise(Number(el.dataset.index)),
    'back-to-workout': () => { const { session } = current(); if (session.index >= session.exercises.length) session.index = session.exercises.length - 1; save(); location.hash = 'workout-' + session.workoutId; },
    finish: finishWorkout,
    export: exportBackup,
    'save-goal': () => { const value = Number($('weeklyGoal').value); if (!Number.isInteger(value) || value < 5 || value > 1500) throw new Error('Choose a weekly goal from 5 to 1500 minutes.'); state().settings.walkGoal = value; save(); message('Walking goal saved.'); },
    'walk-toggle': () => {
      const target = Number($('walkTarget').value);
      if (!Number.isInteger(target) || target < 1 || target > 180) throw new Error('Choose a walk target from 1 to 180 minutes.');
      state().settings.walkMinutes = target;
      const d = state().walkDraft;
      if (d?.running) { d.elapsed = walkElapsed(); d.running = false; d.started = 0; if (state().timer?.kind === 'walk') state().timer = null; }
      else { state().walkDraft = { elapsed: d?.elapsed || 0, started: Date.now(), running: true }; const left = target * 60 - state().walkDraft.elapsed; if (left > 0) startTimer('walk', left, 'Walk target'); }
      save(); render();
    },
    'walk-save-timed': () => {
      const seconds = walkElapsed(); if (seconds < 60) throw new Error('Walk for at least a minute, or enter the minutes in “Log a walk afterward”.');
      const minutes = Math.floor(seconds / 60); logWalk(minutes, localDate()); state().walkDraft = null; if (state().timer?.kind === 'walk') state().timer = null; save();
    },
    'walk-discard': () => askConfirm('Discard this walk timer?', 'This only discards the running walk timer. Saved walks stay in your history.', 'Discard timer', () => { state().walkDraft = null; if (state().timer?.kind === 'walk') state().timer = null; save(); render(); }),
    'walk-log': () => logWalk(Number($('walkMinutes').value), $('walkDate').value)
  };
  document.addEventListener('click', async event => {
    if (event.target.closest('a[href="#main"]')) { event.preventDefault(); $('main').focus(); return; }
    const el = event.target.closest('button[data-action]'); if (!el || el.disabled) return;
    feedback = ''; if ($('actionStatus')) $('actionStatus').hidden = true;
    try { await actions[el.dataset.action]?.(el); } catch (error) { message(error.message || 'This action could not be completed.'); }
  });
  document.addEventListener('input', event => {
    if (event.target.id === 'sessionNotes') { const { session } = current(); if (session) { session.notes = event.target.value.slice(0, 2000); save(); } }
  });
  document.addEventListener('change', async event => {
    if (event.target.id === 'repValue') {
      const { exercise, record } = current(), n = Number(event.target.value), max = exercise.mode === 'time' ? 3600 : 999, min = exercise.mode === 'physio' ? 0 : 1;
      if (!Number.isInteger(n) || n < min || n > max || !event.target.value.trim()) { event.target.value = record.value; message(`Enter a whole number from ${min} to ${max}.`); return; }
      record.value = n; save();
    }
    if (event.target.id === 'restoreFile') {
      const input = event.target, file = input.files[0]; if (!file) return;
      try {
        if (file.size > 20 * 1024 * 1024) throw new Error('This file is too large. Choose a Dad’s workouts JSON backup under 20 MB.');
        const envelope = JSON.parse(await file.text()); store.restore(envelope); render(); message('Backup restored. Imported timers are off.');
      } catch (error) { $('backupStatus').textContent = error instanceof SyntaxError ? 'The file is not readable JSON. Nothing was changed.' : error.message; }
      input.value = '';
    }
  });
  $('dialogCancel').addEventListener('click', () => { dialogAction = null; $('confirmDialog').close(); });
  $('dialogConfirm').addEventListener('click', () => { const action = dialogAction; dialogAction = null; $('confirmDialog').close(); try { action?.(); } catch (error) { message(error.message); } });
  $('confirmDialog').addEventListener('cancel', () => { dialogAction = null; });
  window.addEventListener('dad-storage-status', storageNotice);
  window.addEventListener('hashchange', () => { feedback = ''; render(); window.scrollTo({ top: 0 }); $('main').focus({ preventScroll: true }); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && demoPlaying) { clearInterval(demoInterval); demoInterval = null; demoPlaying = false; if ($('demoButton')) { $('demoButton').textContent = 'Play demo'; $('demoButton').setAttribute('aria-pressed', 'false'); } } tick(); });
  render(); tick(); setInterval(tick, 250);
})();
