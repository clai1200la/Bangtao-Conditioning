"""Previous weights are suggestions until an actual set is logged."""
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
    weight = lambda r: page.locator(f'[data-field="1:{r}:deadlift:both"][data-prop="weight"]')
    done = lambda r: page.locator(f'[data-field="1:{r}:deadlift:both"][data-prop="done"]')
    # Log a session; the third weight is entered but the set is left unchecked.
    for r, amount in enumerate(('100', '105', '110')):
        weight(r).fill(amount)
    done(0).check()
    done(1).check()
    page.locator('[data-action="finishWorkout"]').click()
    page.get_by_role('button', name='Today', exact=True).click()
    page.get_by_role('button', name='Start another session').click()
    for r, amount in enumerate(('100', '105', '110')):
        expect(weight(r)).to_have_value(amount)
        expect(weight(r)).to_have_class('suggested-weight')
        assert 'previous weight' in weight(r).get_attribute('aria-label')
    expect(page.locator('#weightHint')).to_be_visible()
    assert weight(0).evaluate('(e) => getComputedStyle(e).color') == 'rgb(118, 118, 118)'
    # Reload keeps suggestions grey; checking or editing promotes only that set.
    page.reload()
    expect(weight(0)).to_have_class('suggested-weight')
    done(0).check()
    expect(weight(0)).not_to_have_class('suggested-weight')
    assert weight(0).evaluate('(e) => getComputedStyle(e).color') == 'rgb(23, 23, 23)'
    done(0).uncheck()
    expect(weight(0)).not_to_have_class('suggested-weight')
    weight(1).fill('115')
    expect(weight(1)).not_to_have_class('suggested-weight')
    expect(weight(2)).to_have_class('suggested-weight')
    page.reload()
    expect(weight(0)).not_to_have_class('suggested-weight')
    expect(weight(1)).to_have_value('115')
    expect(weight(1)).not_to_have_class('suggested-weight')
    expect(weight(2)).to_have_class('suggested-weight')
    # Saving a partial workout does not silently record unconfirmed suggestions.
    page.locator('[data-action="finishWorkout"]').click()
    expect(page.locator('#history')).to_contain_text('110 lb (previous; unconfirmed)')
    page.get_by_role('button', name='Today', exact=True).click()
    page.get_by_role('button', name='Start another session').click()
    expect(weight(0)).to_have_value('100')
    expect(weight(1)).to_have_value('115')
    expect(weight(2)).to_have_value('110')
    for r in range(3):
        expect(weight(r)).to_have_class('suggested-weight')
    # Weight recall remains separate by workout, even for the same exercise.
    page.locator('#workoutChoice').select_option('pullBiceps')
    expect(page.locator('[data-field="0:0:deadlift:both"][data-prop="weight"]')).to_have_value('')
    page.locator('#workoutChoice').select_option('powerPull')
    expect(weight(0)).to_have_class('suggested-weight')
    # A completed set with a deliberately blank weight must not resurrect an older weight.
    weight(0).fill('')
    done(0).check()
    page.locator('[data-action="finishWorkout"]').click()
    page.get_by_role('button', name='Today', exact=True).click()
    page.get_by_role('button', name='Start another session').click()
    expect(weight(0)).to_have_value('')
    expect(weight(0)).not_to_have_class('suggested-weight')
    # An existing saved session with no new metadata remains unchanged.
    saved = page.evaluate('(key) => JSON.parse(localStorage.getItem(key))', KEY)
    assert saved['sessions'][0]['fields']['1:0:deadlift:both']['weight'] == '100'
    assert saved['sessions'][1]['fields']['1:2:deadlift:both']['weightSuggested'] is True
    assert not errors, errors
    weight(0).scroll_into_view_if_needed()
    page.screenshot(path='/tmp/weight-suggestions-mobile.png')
    page.set_viewport_size({'width': 1440, 'height': 900})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    context.close()
    browser.close()
print('PASS: grey previous weights, confirmation, edits, reload, partial sessions, per-workout isolation and old history.')
