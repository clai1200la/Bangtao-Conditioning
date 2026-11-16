"""Verify the barbell substitution preserves prior Power Legs data."""
import json
import os
import shutil
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('BANGTAO_TEST_URL', 'http://127.0.0.1:8000/')
KEY = 'strength_conditioning_v1'

with sync_playwright() as p:
    chromium = shutil.which('chromium') or shutil.which('chromium-browser')
    browser = p.chromium.launch(headless=True, **({'executable_path': chromium} if chromium else {}))
    page = browser.new_page()
    page.goto(URL)
    data = page.evaluate('window.STRENGTH_PROGRAM')
    planned = next(w for w in data['workouts'] if w['id'] == 'powerLegs')
    original = data['legacyWorkouts']['powerLegs']
    assert planned['blocks'][1:] == original['blocks'][1:]
    first = planned['blocks'][0]
    assert (first['entries'][0]['exercise'], first['rounds'], first['entries'][0]['target'], first['rest']) == ('backsquat', 5, 10, 90)
    assert original['blocks'][0]['entries'][0]['exercise'] == 'hacksquat'
    assert data['movements']['backsquat']['images'] == ['assets/exercises/Barbell_Squat-0.jpg', 'assets/exercises/Barbell_Squat-1.jpg']
    page.close()

    def fields_for(workout):
        fields = {}
        for block in workout['blocks']:
            for r in range(block['rounds']):
                for entry in block['entries']:
                    for side in (['left', 'right'] if entry['eachSide'] else ['both']):
                        fields[f"{block['id']}:{r}:{entry['exercise']}:{side}"] = {
                            'reps': str(entry['target']), 'weight': '', 'done': False}
        return fields

    def old_session(session_id, date, complete=False, snapshot=False):
        s = {'id': session_id, 'workout': 'powerLegs', 'workoutName': 'Power Legs', 'date': date,
             'fields': fields_for(original), 'notes': session_id, 'elapsed': 0, 'runningSince': None,
             'complete': complete, 'rested': ['0:0'], 'rest': None, 'exerciseTimer': None}
        s['fields']['0:0:hacksquat:both'] = {'reps': '8', 'weight': '190', 'done': True}
        s['fields']['1:0:legpress:both'] = {'reps': '14', 'weight': '230', 'done': True}
        if complete:
            s['finishedAt'] = '2025-01-02T12:00:00.000Z'
        if snapshot:
            s['prescription'] = original
        return s

    for snapshot in (False, True):
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()
        today = page.evaluate("new Date().toLocaleDateString('en-CA')")
        original_draft = old_session('old-draft', today, snapshot=snapshot)
        history = [old_session('old-history-no-snapshot', '2025-01-01', True),
                   old_session('old-history-snapshot', '2025-01-02', True, True)]
        state = {'version': 1, 'selectedWorkout': 'powerLegs', 'sessions': history,
                 'drafts': {'powerLegs': original_draft}, 'lastSaved': {}}
        script = "if (!sessionStorage.getItem('seeded')) {localStorage.setItem(%s,%s);sessionStorage.setItem('seeded','yes')}" % (json.dumps(KEY), json.dumps(json.dumps(state)))
        page.add_init_script(script)
        page.goto(URL)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        expect(page.locator('[data-block-card="0"] h2')).to_have_text('Barbell back squat')
        expect(page.locator('#sessionStatus')).to_contain_text('Earlier hack squat entries are retained')
        expect(page.locator('[data-field="0:0:backsquat:both"][data-prop="weight"]')).to_have_value('')
        expect(page.locator('[data-field="1:0:legpress:both"][data-prop="weight"]')).to_have_value('230')
        expect(page.locator('[data-field="1:0:legpress:both"][data-prop="done"]')).to_be_checked()
        photo = page.locator('[data-block-card="0"] img.exercise-photo')
        expect(photo).to_have_attribute('alt', 'Barbell back squat reference position')
        expect(photo).to_have_attribute('src', 'assets/exercises/Barbell_Squat-1.jpg')
        photo.scroll_into_view_if_needed()
        page.wait_for_function("document.querySelector('[data-block-card=\"0\"] img.exercise-photo').naturalWidth > 0")
        # The machine's old completed set must not suppress rest for the new barbell set.
        page.locator('[data-field="0:0:backsquat:both"][data-prop="weight"]').fill('95')
        page.locator('[data-field="0:0:backsquat:both"][data-prop="done"]').check()
        expect(page.locator('#restLabel')).to_have_text('Rest · next set')
        assert page.locator('#restCount').inner_text() in ('01:30', '01:29')
        page.reload()
        expect(page.locator('[data-field="0:0:backsquat:both"][data-prop="weight"]')).to_have_value('95')
        stored = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)
        assert stored['drafts']['powerLegs']['fields']['0:0:hacksquat:both'] == {'reps':'8', 'weight':'190', 'done':True}
        assert stored['drafts']['powerLegs']['fields']['1:0:legpress:both']['weight'] == '230'
        assert stored['sessions'] == history
        # Complete all current exercises: archived machine fields must not cause an incomplete warning.
        page.locator('#todayPlan .set-complete').evaluate_all("boxes => boxes.forEach(box => { if (!box.checked) {box.checked=true; box.dispatchEvent(new Event('change',{bubbles:true}));} })")
        if page.locator('#restTimer').is_visible():
            page.locator('#skipRest').click()
        page.evaluate('() => { window.confirmCalls = 0; window.confirm = () => {window.confirmCalls++; return false}; }')
        page.locator('#saveWorkout').click()
        assert page.evaluate('window.confirmCalls') == 0
        expect(page.locator('#history')).to_contain_text('Barbell back squat')
        expect(page.locator('#history')).to_contain_text('Earlier hack squat entries')
        expect(page.locator('#history')).to_contain_text('190 lb')
        stored = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)
        saved = next(s for s in stored['sessions'] if s['id'] == 'old-draft')
        assert saved['fields']['0:0:hacksquat:both']['weight'] == '190'
        assert saved['fields']['0:0:backsquat:both']['weight'] == '95'
        assert saved['complete']
        # Historical sessions with and without a snapshot remain machine workouts.
        page.get_by_role('button', name='Back to history').click()
        for record in ('old-history-no-snapshot', 'old-history-snapshot'):
            page.locator('#history button').filter(has_text=record).click()
            expect(page.locator('#history')).to_contain_text('Hack squat')
            expect(page.locator('#history')).to_contain_text('190 lb')
            page.get_by_role('button', name='Back to history').click()
        page.get_by_role('button', name='Today', exact=True).click()
        page.get_by_role('button', name='Start another session').click()
        expect(page.locator('[data-field="0:0:backsquat:both"][data-prop="weight"]')).to_have_value('95')
        page.get_by_role('button', name='Exercises', exact=True).click()
        expect(page.locator('#libraryList')).to_contain_text('Barbell back squat')
        assert page.locator('[data-library-id="hacksquat"]').count() == 0
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert not errors, errors
        context.close()

    # A first barbell session never inherits an unrelated machine weight.
    context = browser.new_context()
    page = context.new_page()
    state = {'version': 1, 'selectedWorkout': 'powerLegs',
             'sessions': [old_session('old', '2025-01-01', True)], 'drafts': {}, 'lastSaved': {}}
    page.add_init_script('localStorage.setItem('+json.dumps(KEY)+','+json.dumps(json.dumps(state))+')')
    page.goto(URL)
    expect(page.locator('[data-field="0:0:backsquat:both"][data-prop="weight"]')).to_have_value('')
    context.close()
    browser.close()
print('PASS: squat prescription, photos, legacy records, migrated drafts, preserved progress, weight isolation, rest, and mobile layout.')
