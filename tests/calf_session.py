"""Standalone lower-leg workout and existing history stay independently usable."""
import json
import os
import shutil
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('BANGTAO_TEST_URL', 'http://127.0.0.1:8000/')
KEY = 'strength_conditioning_v1'

with sync_playwright() as p:
    chromium = shutil.which('chromium') or shutil.which('chromium-browser')
    browser = p.chromium.launch(headless=True, **({'executable_path': chromium} if chromium else {}))
    context = browser.new_context(viewport={'width': 390, 'height': 844})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto(URL)
    page.locator('#notes').fill('Existing workout')
    page.locator('[data-action="finishWorkout"]').click()
    page.get_by_role('button', name='Today', exact=True).click()
    page.locator('#workoutChoice').select_option('calfMobility')
    expect(page.locator('#todayPlan')).to_contain_text('Standing calf raise')
    expect(page.locator('#todayPlan')).to_contain_text('Seated ankle pumps')
    expect(page.locator('#todayPlan')).not_to_contain_text('Standing tibialis raise')
    assert page.locator('[data-block-card^="stretch-"]').count() == 4
    for exercise, block in [('flatCalfRaise', '0'), ('seatedAnklePump', '1')]:
        assert page.locator(f'[data-field^="{block}:"][data-field*="{exercise}"][data-prop="done"]').count() == 2
        expect(page.locator(f'[data-field="{block}:0:{exercise}:both"][data-prop="reps"]')).to_have_value('10')
        img = page.locator(f'[data-block-card="{block}"] .single-intro > .exercise-info img').first
        img.evaluate('(el) => el.loading = "eager"')
    page.wait_for_function('Array.from(document.querySelectorAll("#todayPlan img")).filter(i => i.loading === "eager").every(i => i.complete && i.naturalWidth > 0)')
    page.locator('[data-field="0:0:flatCalfRaise:both"][data-prop="done"]').check()
    expect(page.locator('#restCount')).to_have_text('01:00')
    page.locator('#skipRest').click()
    page.locator('#notes').fill('Calf session')
    page.reload()
    expect(page.locator('#notes')).to_have_value('Calf session')
    expect(page.locator('[data-field="0:0:flatCalfRaise:both"][data-prop="done"]')).to_be_checked()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.locator('[data-block-card="0"]').scroll_into_view_if_needed()
    page.screenshot(path='/tmp/calf-workout-mobile.png')
    page.locator('[data-action="finishWorkout"]').click()
    page.get_by_role('button', name='Back to history').click()
    expect(page.locator('#history')).to_contain_text('Existing workout')
    expect(page.locator('#history')).to_contain_text('Calf session')
    state = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)
    assert [s['workout'] for s in state['sessions']] == ['powerPull', 'calfMobility']
    assert not errors, errors
    context.close()

    # Replace the old standing movement in an unfinished draft without deleting its entries.
    old = state['sessions'][-1]
    old['id'] = 'previous-draft'
    old['complete'] = False
    old['prescription']['blocks'][1]['entries'][0]['exercise'] = 'tibialisRaise'
    old['fields']['1:0:tibialisRaise:both'] = {'reps':'8', 'weight':'', 'done':True}
    old['rested'].append('1:0')
    seeded = {'version':1, 'selectedWorkout':'calfMobility', 'sessions':[], 'drafts':{'calfMobility':old}, 'lastSaved':{}}
    context = browser.new_context()
    page = context.new_page()
    page.add_init_script("if (!sessionStorage.seeded) { localStorage.setItem(%s,%s); sessionStorage.seeded='1'; }" % (json.dumps(KEY), json.dumps(json.dumps(seeded))))
    page.goto(URL)
    expect(page.locator('#todayPlan')).to_contain_text('Seated ankle pumps')
    expect(page.locator('#todayPlan')).not_to_contain_text('Standing tibialis raise')
    expect(page.locator('[data-field="1:0:seatedAnklePump:both"][data-prop="done"]')).not_to_be_checked()
    page.locator('#notes').fill('Preserve old entries')
    stored = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)
    draft = stored['drafts']['calfMobility']
    assert draft['fields']['1:0:tibialisRaise:both']['reps'] == '8'
    assert '1:0' not in draft['rested']
    context.close()
    browser.close()
print('PASS: standalone calf workout, movements, image loading, rest, reload and existing history.')
