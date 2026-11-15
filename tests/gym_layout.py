"""Exercise regrouping and compatibility with saved pre-change workouts."""
import json
import os
import shutil
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('BANGTAO_TEST_URL', 'http://127.0.0.1:8000/')
KEY = 'strength_conditioning_v1'

with sync_playwright() as p:
    chromium = shutil.which('chromium') or shutil.which('chromium-browser')
    browser = p.chromium.launch(headless=True, **({'executable_path': chromium} if chromium else {}))
    inspect = browser.new_page()
    inspect.goto(URL)
    definitions = inspect.evaluate('window.STRENGTH_PROGRAM')
    original = definitions['legacyWorkouts']['pushCore']
    updated = next(w for w in definitions['workouts'] if w['id'] == 'pushCore')
    assert updated['blocks'][0] == original['blocks'][0]
    assert updated['blocks'][3:] == original['blocks'][2:]
    press, pair = updated['blocks'][1:3]
    assert (press['id'], press['kind'], press['rounds'], press['rest'], press['transitionRest']) == ('1', 'single', 4, 60, 60)
    assert (pair['id'], pair['kind'], pair['rounds'], pair['rest'], pair['transitionRest']) == ('1a', 'superset', 4, 30, 30)
    assert [e['exercise'] for e in press['entries'] + pair['entries']] == ['inclinepress', 'spiderpush', 'sidebend']
    assert [e['target'] for e in press['entries'] + pair['entries']] == [15, 20, 12]
    assert pair['entries'][1]['eachSide']
    inspect.close()

    def fields_for(workout):
        fields = {}
        for block in workout['blocks']:
            for round_no in range(block['rounds']):
                for entry in block['entries']:
                    for side in (['left', 'right'] if entry['eachSide'] else ['both']):
                        key = f"{block['id']}:{round_no}:{entry['exercise']}:{side}"
                        fields[key] = {'reps': str(entry['target']), 'weight': '', 'done': False}
        return fields

    def session(id, date, *, complete=False, snapshot=False):
        value = {'id': id, 'workout': 'pushCore', 'workoutName': original['name'], 'date': date,
                 'fields': fields_for(original), 'notes': id, 'elapsed': 0, 'runningSince': None,
                 'complete': complete, 'rested': [], 'rest': None, 'exerciseTimer': None}
        if complete:
            value['finishedAt'] = '2025-01-01T12:00:00.000Z'
        if snapshot:
            value['prescription'] = original
        return value

    # Both historical representations occur in the deployed app. No user data is changed.
    for snapshot in (False, True):
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()
        today = page.evaluate("new Date().toLocaleDateString('en-CA')")
        draft = session('active-draft', today, snapshot=snapshot)
        draft['fields']['1:0:inclinepress:both']['weight'] = '75'
        draft['fields']['1:0:sidebend:left']['weight'] = '45'
        draft['fields']['1:0:sidebend:right']['weight'] = '45'
        history = [session('older-no-snapshot', '2025-01-01', complete=True),
                   session('older-snapshot', '2025-01-02', complete=True, snapshot=True)]
        state = {'version': 1, 'selectedWorkout': 'pushCore', 'sessions': history,
                 'drafts': {'pushCore': draft}, 'lastSaved': {}}
        script = "if (!sessionStorage.getItem('seeded')) {localStorage.setItem(%s,%s);sessionStorage.setItem('seeded','yes')}" % (json.dumps(KEY), json.dumps(json.dumps(state)))
        page.add_init_script(script)
        page.goto(URL)
        page.on('dialog', lambda dialog: dialog.accept())
        expect(page.locator('#sessionStatus')).to_contain_text('original grouping')
        expect(page.locator('[data-block-card="1"] .block-header h2')).to_have_text('Superset · 4 rounds')
        expect(page.locator('[data-field="1:0:sidebend:left"][data-prop="weight"]')).to_have_value('45')
        expect(page.locator('[data-field="1:0:inclinepress:both"][data-prop="weight"]')).to_have_value('75')
        assert page.locator('[data-block-card="1a"]').count() == 0
        page.reload()
        expect(page.locator('[data-field="1:0:sidebend:right"][data-prop="weight"]')).to_have_value('45')
        # Saving the old draft must preserve its original presentation in history.
        page.locator('#saveWorkout').click()
        expect(page.locator('#history')).to_contain_text('Spiderman push-up')
        stored = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)
        saved = next(s for s in stored['sessions'] if s['id'] == 'active-draft')
        assert saved['fields']['1:0:sidebend:left']['weight'] == '45'
        assert '1a:0:sidebend:left' not in saved['fields']
        # Review both old records; lack of a snapshot must not reinterpret the old grouping.
        page.get_by_role('button', name='Back to history').click()
        for record in ('older-no-snapshot', 'older-snapshot'):
            page.locator('#history button').filter(has_text=record).click()
            expect(page.locator('#history')).to_contain_text('Spiderman push-up')
            expect(page.locator('#history')).to_contain_text('Dumbbell side bend')
            page.get_by_role('button', name='Back to history').click()
        page.get_by_role('button', name='Today', exact=True).click()
        page.get_by_role('button', name='Start another session').click()
        expect(page.locator('[data-block-card="1"] .block-header h2')).to_have_text('Barbell incline bench press')
        expect(page.locator('[data-field="1:0:inclinepress:both"][data-prop="weight"]')).to_have_value('75')
        expect(page.locator('[data-field="1a:0:sidebend:left"][data-prop="weight"]')).to_have_value('45')
        expect(page.locator('[data-field="1a:0:sidebend:right"][data-prop="weight"]')).to_have_value('45')
        expect(page.locator('[data-block-card="1a"] .block-header h2')).to_have_text('Superset · 4 rounds')
        expect(page.locator('[data-block-card="1a"] .round:visible .group-indicator')).to_have_text('Superset · 2 exercises together')
        assert page.locator('[data-block-card="1"] .group-indicator').count() == 0
        page.get_by_role('button', name='Program', exact=True).click()
        expect(page.locator('#programList article').filter(has_text='Push, obliques, cardio').locator('.group-overview')).to_contain_text('Supersets')
        page.get_by_role('button', name='Today', exact=True).click()
        page.reload()
        expect(page.locator('[data-field="1a:0:sidebend:left"][data-prop="weight"]')).to_have_value('45')
        page.locator('[data-field="1:0:inclinepress:both"][data-prop="done"]').check()
        expect(page.locator('#restLabel')).to_have_text('Rest · next set')
        assert page.locator('#restCount').inner_text() in ('01:00', '00:59')
        for r in (1, 2, 3):
            page.locator(f'[data-field="1:{r}:inclinepress:both"][data-prop="done"]').check()
        expect(page.locator('#restLabel')).to_have_text('Rest · next block')
        assert page.locator('#restCount').inner_text() in ('01:00', '00:59')
        page.locator('#skipRest').click()
        page.locator('[data-field="1a:0:spiderpush:both"][data-prop="done"]').check()
        page.locator('[data-field="1a:0:sidebend:left"][data-prop="done"]').check()
        expect(page.locator('#restTimer')).to_be_hidden()
        page.locator('[data-field="1a:0:sidebend:right"][data-prop="done"]').check()
        expect(page.locator('#restLabel')).to_have_text('Rest · next round')
        assert page.locator('#restCount').inner_text() in ('00:30', '00:29')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        context.close()
    browser.close()
print('PASS: regrouping, historical sessions, old and new drafts, weight recall, rest timers, mobile layout.')
