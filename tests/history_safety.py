"""History from another tab remains visible, including in exported backups."""
import json
import os
import shutil
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('BANGTAO_TEST_URL', 'http://127.0.0.1:8000/')
KEY = 'strength_conditioning_v1'

with sync_playwright() as p:
    chromium = shutil.which('chromium') or shutil.which('chromium-browser')
    browser = p.chromium.launch(headless=True, **({'executable_path': chromium} if chromium else {}))
    context = browser.new_context()
    first, stale = context.new_page(), context.new_page()
    first.goto(URL)
    stale.goto(URL)
    first.on('dialog', lambda dialog: dialog.accept())
    first.locator('#notes').fill('Saved in another tab')
    first.locator('[data-action="finishWorkout"]').click()
    stale.get_by_role('button', name='Progress', exact=True).click()
    expect(stale.locator('#logged')).to_have_text('1')
    expect(stale.locator('#history')).to_contain_text('Saved in another tab')
    with stale.expect_download() as download:
        stale.locator('#exportData').click()
    download.value.save_as('/tmp/history-safety-backup.json')
    backup = json.load(open('/tmp/history-safety-backup.json'))
    assert backup['strength']['sessions'][0]['notes'] == 'Saved in another tab'
    assert len(json.loads(first.evaluate('(k) => localStorage.getItem(k)', KEY))['sessions']) == 1
    context.close()

    # A failed save must not allow navigation away from an unsaved draft.
    context = browser.new_context()
    page = context.new_page()
    page.goto(URL)
    page.locator('#notes').fill('Keep these edits')
    page.evaluate("() => { Storage.prototype.setItem = function() { throw new Error('storage unavailable'); }; }")
    page.locator('#workoutChoice').select_option('powerLegs')
    expect(page.locator('#workoutChoice')).to_have_value('powerPull')
    expect(page.locator('#notes')).to_have_value('Keep these edits')
    page.locator('#programChoice').select_option('bangtao')
    expect(page.locator('#programChoice')).to_have_value('strength')
    expect(page.locator('#storageNotice')).to_contain_text('unavailable')
    context.close()
    browser.close()
print('PASS: stale history refresh, backup history and navigation after storage failure.')
