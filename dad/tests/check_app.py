"""Dad's app: disposable-browser workflow, media, timer and storage isolation checks."""
import json
import os
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('DAD_TEST_URL', 'http://127.0.0.1:8765/dad/')
ROOT = URL.rsplit('dad/', 1)[0]
KEY = 'dad_workouts_v1'
ORIGINAL = {
    'bangtao12': json.dumps({'week': 2, 'slots': ['mon', 'wed', 'fri'], 'days': [], 'weekDone': {}, 'choice': {}}),
    'bangtao12_active_session': '{"drafts":{}}',
    'strength_conditioning_v1': json.dumps({'version': 1, 'selectedWorkout': 'powerPull', 'sessions': [], 'drafts': {}, 'lastSaved': {}}),
    'conditioning_active_program': 'strength',
}
ARTIFACTS = Path('/tmp/dad-qa')
ARTIFACTS.mkdir(exist_ok=True)
errors = []

def act(page, action):
    page.locator(f'[data-action="{action}"]').first.click()

def options(page):
    details = page.locator('.workout-options')
    if details.get_attribute('open') is None:
        details.locator('summary').click()

def phase(page, name):
    options(page)
    page.locator(f'[data-action="phase"][data-phase="{name}"]').click()

def start(page, which='a'):
    page.goto(URL)
    page.locator(f'[data-action="start-workout"][data-id="{which}"]').click()
    expect(page.locator('#exerciseTitle')).to_be_visible()

def read(page):
    return page.evaluate('DadStore.state')

def originals_unchanged(page):
    assert page.evaluate('(keys)=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]))', list(ORIGINAL)) == ORIGINAL

def media_loaded(page):
    page.wait_for_function('document.getElementById("demoImage").complete && document.getElementById("demoImage").naturalWidth > 0')
    expect(page.locator('#demoFailure')).to_be_hidden()

def context(browser, viewport=None, extra=''):
    ctx = browser.new_context(viewport=viewport or {'width': 1194, 'height': 834}, timezone_id='America/Los_Angeles', reduced_motion='reduce')
    ctx.add_init_script('if (location.protocol === "http:" || location.protocol === "https:") { (entries => { for (const [k,v] of Object.entries(entries)) localStorage.setItem(k,v); })(' + json.dumps(ORIGINAL) + ');' + extra + '}')
    ctx.on('page', lambda page: page.on('pageerror', lambda error: errors.append(str(error))))
    return ctx

with sync_playwright() as p:
    chromium = shutil.which('chromium') or shutil.which('chromium-browser')
    browser = p.chromium.launch(headless=True, **({'executable_path': chromium} if chromium else {}))
    ctx = context(browser, extra="""
      window.testOffset=0; const realNow=Date.now; Date.now=()=>realNow()+window.testOffset;
      window.testPings=0;
      window.AudioContext=class { constructor(){this.state='running';this.currentTime=0;} async resume(){} createOscillator(){return {frequency:{value:0},connect(){},start(){window.testPings++;},stop(){}};} createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};} };
    """)
    page = ctx.new_page()
    page.goto(URL)
    expect(page).to_have_title('Dad’s workouts')
    expect(page.locator('h1')).to_have_text('Let’s move today')
    assert page.evaluate('localStorage.getItem("dad_workouts_v1")') is None
    page.screenshot(path=str(ARTIFACTS / 'home-ipad.png'), full_page=True)
    page.locator('[data-action="start-workout"][data-id="a"]').click()
    assert len(read(page)['drafts']['a']['exercises']) == 16
    assert page.evaluate('DadStore.valid(DadStore.state)')
    media_loaded(page)
    expect(page.locator('#demoStep')).to_have_text('Lift one knee and foot')
    act(page, 'demo')
    expect(page.locator('#demoStep')).to_have_text('Both feet on the floor')
    act(page, 'demo')
    act(page, 'hold-timer')
    expect(page.locator('#timerCount')).to_have_text('02:00')
    act(page, 'timer-dismiss')
    act(page, 'done')
    act(page, 'next')
    expect(page.locator('#exerciseTitle')).to_have_text('Shoulder rolls')
    media_loaded(page)
    expect(page.locator('#demoStep')).to_have_text('Lift shoulders toward your ears')
    act(page, 'demo')
    expect(page.locator('#demoStep')).to_have_text('Roll back and relax shoulders down')
    act(page, 'demo')
    phase(page, 'strength')
    expect(page.locator('#exerciseTitle')).to_have_text('Wall push-up')
    media_loaded(page)
    assert page.locator('.exercise-nav').bounding_box()['y'] + page.locator('.exercise-nav').bounding_box()['height'] <= 834
    page.screenshot(path=str(ARTIFACTS / 'strength-ipad.png'), full_page=True)
    original_left = page.locator('#demoImage').evaluate('(i)=>i.style.left')
    act(page, 'demo')
    expect(page.locator('#demoButton')).to_have_text('Pause demo')
    assert page.locator('#demoImage').evaluate('(i)=>i.style.left') != original_left
    act(page, 'demo')
    frame = page.locator('#demoImage').evaluate('(i)=>i.style.left')
    page.wait_for_timeout(1750)
    assert page.locator('#demoImage').evaluate('(i)=>i.style.left') == frame
    act(page, 'rep-plus')
    expect(page.locator('#repValue')).to_have_value('7')
    act(page, 'sound')
    expect(page.locator('#soundButton')).to_have_text('Mute sound')
    act(page, 'done')
    expect(page.locator('#timerLabel')).to_contain_text('Rest')
    expect(page.locator('#timerCount')).to_have_text('01:00')
    act(page, 'timer-add')
    expect(page.locator('#timerCount')).to_have_text('01:30')
    act(page, 'timer-pause')
    page.evaluate('window.testOffset+=100000')
    page.wait_for_timeout(300)
    expect(page.locator('#timerCount')).to_have_text('01:30')
    act(page, 'timer-pause')
    before_ping = page.evaluate('window.testPings')
    page.evaluate('window.testOffset+=91000')
    expect(page.locator('#timerLabel')).to_have_text('Rest complete')
    assert page.evaluate('window.testPings') > before_ping
    assert sum(r['done'] for r in read(page)['drafts']['a']['exercises'][5]['records']) == 1
    page.reload()
    expect(page.locator('#repValue')).to_have_value('7')
    expect(page.locator('#soundButton')).to_have_text('Enable sound')
    assert read(page)['drafts']['a']['exercises'][5]['records'][0]['done']
    options(page)
    act(page, 'add-set')
    assert read(page)['drafts']['a']['exercises'][5]['sets'] == 3
    options(page)
    act(page, 'undo')
    assert not read(page)['drafts']['a']['exercises'][5]['records'][0]['done']
    act(page, 'done')
    act(page, 'next-record')
    expect(page.locator('.set-label')).to_contain_text('Set 2 of 3')
    act(page, 'next')
    expect(page.locator('#exerciseTitle')).to_have_text('Outward shoulder press')
    media_loaded(page)
    expect(page.locator('.set-label')).to_contain_text('Left')
    act(page, 'done')
    act(page, 'next-record')
    expect(page.locator('.set-label')).to_contain_text('Right')
    phase(page, 'cooldown')
    expect(page.locator('#exerciseTitle')).to_have_text('Gentle butterfly stretch')
    act(page, 'next')
    expect(page.locator('#exerciseTitle')).to_have_text('Hamstring stretch')
    expect(page.locator('.physio-note')).to_contain_text('physio’s dose')
    assert page.locator('[data-action="hold-timer"]').count() == 0
    act(page, 'next')
    expect(page.locator('#exerciseTitle')).to_have_text('Calf stretch')
    act(page, 'hold-timer')
    expect(page.locator('#timerCount')).to_have_text('00:20')
    page.evaluate('window.testOffset+=21000')
    expect(page.locator('#timerLabel')).to_have_text('Hold complete')
    assert not read(page)['drafts']['a']['exercises'][14]['records'][0]['done']
    options(page)
    act(page, 'review')
    page.locator('#sessionNotes').fill('First workout <b>safe text</b>')
    act(page, 'finish')
    expect(page.locator('#confirmDialog')).to_be_visible()
    page.locator('#dialogCancel').click()
    assert len(read(page)['history']) == 0
    act(page, 'finish')
    page.locator('#dialogConfirm').click()
    expect(page.locator('h1')).to_have_text('History & Backup')
    assert len(read(page)['history']) == 1
    assert read(page)['history'][0]['partial']
    assert page.locator('.history-detail b').count() == 0
    # Walk can be logged after leaving the iPad at home.
    page.goto(URL + '#walk')
    page.locator('#walkMinutes').fill('12')
    act(page, 'walk-log')
    expect(page.locator('.history-list')).to_contain_text('Walk · 12 minutes')
    originals_unchanged(page)
    assert page.evaluate('DadStore.valid(DadStore.state)')
    with page.expect_download() as download:
        act(page, 'export')
    backup_path = ARTIFACTS / 'backup.json'
    download.value.save_as(str(backup_path))
    backup = json.loads(backup_path.read_text())
    assert backup['app'] == 'dad-workouts' and len(backup['data']['history']) == 2
    assert not any(k in json.dumps(backup) for k in ORIGINAL)
    page.locator('#restoreFile').set_input_files(str(backup_path))
    expect(page.locator('#backupStatus')).to_contain_text('empty')
    # Original app loads on the same origin and leaves Dad's records intact.
    dad_raw = page.evaluate('(k)=>localStorage.getItem(k)', KEY)
    page.goto(ROOT)
    expect(page.locator('#todayTitle')).to_have_text('Strength & Conditioning')
    assert page.evaluate('(k)=>localStorage.getItem(k)', KEY) == dad_raw
    page.goto(URL + '#history')
    originals_unchanged(page)
    ctx.close()

    # Restore is allowed with existing OTHER-app data. Bad backups do not overwrite it.
    ctx = context(browser)
    page = ctx.new_page()
    page.goto(URL + '#history')
    page.locator('#restoreFile').set_input_files({'name': 'bad.json', 'mimeType': 'application/json', 'buffer': b'{"app":"dad-workouts","schemaVersion":1,"data":null}'})
    expect(page.locator('#backupStatus')).to_contain_text('not a valid')
    assert page.evaluate('(k)=>localStorage.getItem(k)', KEY) is None
    page.locator('#restoreFile').set_input_files(str(backup_path))
    expect(page.locator('.history-list')).to_contain_text('Walk · 12 minutes')
    assert read(page)['timer'] is None
    originals_unchanged(page)
    ctx.close()

    # Complete both workouts, check every picture, both positions, and snapshot persistence.
    ctx = context(browser)
    page = ctx.new_page()
    for which in ['a', 'b']:
        start(page, which)
        while page.locator('#exerciseTitle').count():
            media_loaded(page)
            exercise = page.evaluate('(which)=>DadStore.state.drafts[which].exercises[DadStore.state.drafts[which].index]', which)
            if exercise['id'] == 'birddog':
                assert exercise['mode'] == 'reps' and exercise['sets'] == 2
                assert [(r['set'], r['side'], r['value']) for r in exercise['records']] == [(1, 'left', 10), (2, 'right', 10)]
                expect(page.locator('.set-label')).to_contain_text('Left arm + right leg')
                page.screenshot(path=str(ARTIFACTS / 'bird-dog-ipad.png'), full_page=True)
            for _ in exercise['records']:
                if page.locator('#setDone').count():
                    act(page, 'done')
                if page.locator('#nextRecord').inner_text() == 'Next set / side':
                    act(page, 'next-record')
            act(page, 'next')
            page.wait_for_function("""which => {
              const s=window.DadStore.state.drafts[which], title=document.getElementById('exerciseTitle');
              return s.index === s.exercises.length ? !title : title?.textContent === s.exercises[s.index].name;
            }""", arg=which)
        act(page, 'finish')
        expect(page.locator('h1')).to_have_text('History & Backup')
        assert not read(page)['history'][-1]['partial']
    assert len(read(page)['history']) == 2
    originals_unchanged(page)
    ctx.close()

    # Walking elapsed time survives reload, panel pause also pauses the walk, backup freezes elapsed time.
    ctx = context(browser, extra='window.testOffset=0; const n=Date.now; Date.now=()=>n()+window.testOffset;')
    page = ctx.new_page()
    page.goto(URL + '#walk')
    act(page, 'walk-toggle')
    page.evaluate('window.testOffset+=65000')
    act(page, 'timer-pause')
    frozen = read(page)['walkDraft']['elapsed']
    page.evaluate('window.testOffset+=120000')
    assert page.evaluate('DadStore.backup().data.walkDraft.elapsed') == frozen
    expect(page.locator('#walkElapsed')).to_have_text('01:05')
    act(page, 'timer-pause')
    page.evaluate('window.testOffset+=60000')
    act(page, 'walk-save-timed')
    assert read(page)['history'][-1]['minutes'] == 2
    assert read(page)['walkDraft'] is None
    originals_unchanged(page)
    ctx.close()

    # Corrupt data and write failures stay untouched while changes remain exportable.
    ctx = context(browser, extra='localStorage.setItem("dad_workouts_v1","not-json");')
    page = ctx.new_page()
    page.goto(URL)
    expect(page.locator('#storageNotice')).to_contain_text('left untouched')
    page.locator('[data-action="start-workout"][data-id="a"]').click()
    assert page.evaluate('(k)=>localStorage.getItem(k)', KEY) == 'not-json'
    assert page.evaluate('DadStore.backup().preservedStorage') == 'not-json'
    originals_unchanged(page)
    ctx.close()
    ctx = context(browser)
    page = ctx.new_page()
    page.goto(URL)
    page.evaluate('() => { Storage.prototype.setItem=function(){throw new Error("quota");}; }')
    page.locator('[data-action="start-workout"][data-id="a"]').click()
    expect(page.locator('#storageNotice')).to_contain_text('could not save')
    assert read(page)['drafts']['a']
    originals_unchanged(page)
    ctx.close()

    # A second tab cannot silently overwrite the first tab's draft.
    ctx = context(browser)
    first, second = ctx.new_page(), ctx.new_page()
    start(first)
    second.goto(URL + '#workout-a')
    act(first, 'rep-plus')
    expect(second.locator('#storageNotice')).to_contain_text('another tab')
    saved = first.evaluate('(k)=>localStorage.getItem(k)', KEY)
    act(second, 'rep-plus')
    assert second.evaluate('(k)=>localStorage.getItem(k)', KEY) == saved
    originals_unchanged(second)
    ctx.close()

    # Mobile, desktop, native concept size, larger text, missing-media fallback.
    for width, height in [(390, 844), (1024, 768), (1448, 1086), (1536, 960)]:
        ctx = context(browser, {'width': width, 'height': height})
        page = ctx.new_page()
        start(page)
        phase(page, 'strength')
        media_loaded(page)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert page.locator('#setDone').bounding_box()['height'] >= 56
        page.screenshot(path=str(ARTIFACTS / f'strength-{width}.png'), full_page=True)
        page.evaluate('document.documentElement.style.fontSize="28px"')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        originals_unchanged(page)
        ctx.close()
    ctx = context(browser)
    page = ctx.new_page()
    page.route('**/assets/*.webp*', lambda route: route.abort())
    start(page)
    expect(page.locator('#demoFailure')).to_be_visible()
    expect(page.locator('.steps')).to_contain_text('Start slowly')
    ctx.close()
    browser.close()
assert not errors, errors
print('PASS: both complete workouts, bird dog, media, rep corrections, third sets, timers/ping, reload, walks, backup/restore, storage isolation/failures/conflicts, layouts and enlarged text.')
