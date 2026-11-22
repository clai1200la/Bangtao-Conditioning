"""Cooldown prescriptions, timers and existing data preservation."""
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
    for workout in ('powerPull', 'powerPush', 'powerLegs', 'pushCore', 'pullBiceps', 'calfMobility'):
        page.locator('#workoutChoice').select_option(workout)
        expect(page.get_by_role('heading', name='Stretches', exact=True)).to_be_visible()
        assert page.locator('[data-block-card^="stretch-"]').count() == 4
        assert page.locator('[data-block-card^="stretch-"] input[data-prop="done"]').count() == 14
        assert page.locator('[data-block-card^="stretch-"] input[data-prop="reps"]').evaluate_all('(xs) => xs.every(x => x.value === "45")')
        assert page.locator('[data-block-card="stretch-1"] input[data-prop="done"]').count() == 2
        expect(page.locator('[data-block-card="stretch-2"]')).to_contain_text('back knee straight')
        expect(page.locator('[data-block-card="stretch-2"]')).to_contain_text('both knees bent')
    photos = page.locator('[data-block-card^="stretch-"] .single-intro > .exercise-info > .stretch-frame')
    assert photos.count() == 4
    photos.first.locator('img').evaluate('(img) => img.loading = "eager"')
    page.wait_for_function('Array.from(document.querySelectorAll(".stretch-frame img")).filter(i => i.loading === "eager").every(i => i.complete && i.naturalWidth > 0)')
    page.locator('[data-block-card="stretch-2"] summary').click()
    calf_guide = page.locator('[data-block-card="stretch-2"] .stretch-guides .stretch-frame')
    assert calf_guide.count() == 2
    expect(calf_guide.nth(0)).to_have_attribute('aria-label', 'C. Calf / Achilles tendon stretch: back knee straight, heels flat')
    expect(calf_guide.nth(1)).to_have_attribute('aria-label', 'C. Calf / Achilles tendon stretch: both knees bent, heels flat')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.locator('[data-block-card="stretch-2"]').scroll_into_view_if_needed()
    page.screenshot(path='/tmp/stretch-pictures-mobile.png')
    page.evaluate('window.testNow = Date.now(); Date.now = () => window.testNow')
    first = 'stretch-0:0:stretchA:left'
    page.locator(f'[data-action="exerciseTimer"][data-key="{first}"]').click()
    expect(page.locator('#exerciseCount')).to_have_text('00:45')
    expect(page.locator('#exerciseLabel')).to_contain_text('left')
    page.evaluate('window.testNow += 46000')
    page.wait_for_timeout(350)
    expect(page.locator(f'[data-field="{first}"][data-prop="done"]')).to_be_checked()
    expect(page.locator('[data-field="stretch-0:0:stretchA:right"][data-prop="done"]')).not_to_be_checked()
    page.reload()
    expect(page.locator(f'[data-field="{first}"][data-prop="done"]')).to_be_checked()
    page.locator('[data-action="finishWorkout"]').click()
    expect(page.locator('#history')).to_contain_text('Hamstring / groin stretch')
    saved = page.evaluate('(k) => JSON.parse(localStorage.getItem(k))', KEY)
    assert saved['sessions'][-1]['fields'][first]['done'] is True
    assert not errors, errors
    context.close()

    # Previously saved history and an older unfinished draft remain intact.
    old = saved['sessions'][-1]
    old['id'] = 'old-session'
    old['prescription']['blocks'] = [b for b in old['prescription']['blocks'] if not b.get('isStretch')]
    old['fields'] = {k:v for k,v in old['fields'].items() if not k.startswith('stretch-')}
    draft = json.loads(json.dumps(old))
    draft.update(id='old-draft', complete=False, notes='Keep my draft')
    state = {'version':1, 'selectedWorkout':old['workout'], 'sessions':[old], 'drafts':{old['workout']:draft}, 'lastSaved':{}}
    context = browser.new_context()
    page = context.new_page()
    page.add_init_script("if (!sessionStorage.seeded) { localStorage.setItem(%s, %s); sessionStorage.seeded = '1'; }" % (json.dumps(KEY), json.dumps(json.dumps(state))))
    page.goto(URL)
    expect(page.locator('#notes')).to_have_value('Keep my draft')
    assert page.locator('[data-block-card^="stretch-"]').count() == 4
    page.locator('#notes').fill('Keep my draft updated')
    stored = page.evaluate('(k) => JSON.parse(localStorage.getItem(k))', KEY)
    assert stored['sessions'][0] == old
    assert stored['drafts'][old['workout']]['notes'] == 'Keep my draft updated'
    assert len([b for b in stored['drafts'][old['workout']]['prescription']['blocks'] if b.get('isStretch')]) == 4
    context.close()
    browser.close()
print('PASS: cooldowns on all workouts, side counts, timers, saved history and draft migration.')
