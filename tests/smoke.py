"""Browser regression checks. Start a local server; see README.md for prerequisites."""
from playwright.sync_api import sync_playwright, expect
import json
import os, shutil
URL=os.environ.get('BANGTAO_TEST_URL', 'http://127.0.0.1:8000/')
CHROMIUM=shutil.which('chromium') or shutil.which('chromium-browser')
LAUNCH={'executable_path':CHROMIUM} if CHROMIUM else {}
KEY='strength_conditioning_v1'
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True, **LAUNCH)
 context=browser.new_context(viewport={'width':390,'height':844})
 page=context.new_page()
 errors=[]
 console_errors=[]
 page.on('console',lambda msg:console_errors.append(msg.text) if msg.type in ('error','warning') else None)
 page.on('pageerror',lambda e: errors.append(str(e)))
 assert page.goto(URL).status==200
 expect(page).to_have_title('Strength & Conditioning')
 expect(page.locator('#todayTitle')).to_be_visible()
 assert page.locator('#todayPlan input[type=checkbox]').count()==38
 data=page.evaluate('STRENGTH_PROGRAM')
 assert [sum(len(b['entries']) for b in w['blocks']) for w in data['workouts']]==[7,9,5,15,9,2]
 assert [b['rest'] for b in data['workouts'][2]['blocks']]==[90,90,90,60,60]
 page.screenshot(path='/tmp/strength-mobile.png')
 # Seed legacy storage without loading the legacy app. New program must not touch it.
 legacy={'week':3,'slots':['mon','wed','fri'],'days':[{'id':'2026-10-01|A','date':'2026-10-01','choice':'A','complete':True,'fields':{'bench_both_w1':'95'},'notes':'Existing Bangtao history','pain':1,'elapsed':100}],'weekDone':{},'choice':{}}
 legacy_json=json.dumps(legacy,separators=(',',':'))
 page.evaluate('(s)=>localStorage.setItem("bangtao12",s)',legacy_json)
 # Log Power Pull with a failure set and weight, then reload and save.
 page.locator('[data-field="0:0:pullup:both"][data-prop="reps"]').fill('8')
 page.locator('[data-field="1:0:deadlift:both"][data-prop="weight"]').fill('135')
 page.locator('#notes').fill('Power pull test <b>safe text</b>')
 page.locator('[data-field="0:0:pullup:both"][data-prop="done"]').check()
 expect(page.locator('#restCount')).to_have_text('01:00')
 page.reload()
 expect(page.locator('[data-field="1:0:deadlift:both"][data-prop="weight"]')).to_have_value('135')
 expect(page.locator('#notes')).to_have_value('Power pull test <b>safe text</b>')
 page.locator('#skipRest').click()
 page.wait_for_timeout(400)
 expect(page.locator('#restTimer')).to_be_hidden()
 page.locator('[data-field="0:0:pullup:both"][data-prop="done"]').uncheck()
 page.locator('[data-field="0:0:pullup:both"][data-prop="done"]').check()
 expect(page.locator('#restTimer')).to_be_hidden()
 page.on('dialog',lambda d:d.accept())
 page.locator('#saveWorkout').click()
 expect(page.locator('#logged')).to_have_text('1')
 expect(page.locator('#history')).to_contain_text('Power pull test <b>safe text</b>')
 assert page.locator('#history b:has-text("safe text")').count()==0
 page.get_by_role('button',name='Today',exact=True).click()
 page.get_by_role('button',name='Start another session').click()
 expect(page.locator('[data-field="1:0:deadlift:both"][data-prop="weight"]')).to_have_value('135')
 expect(page.locator('[data-field="0:0:pullup:both"][data-prop="reps"]')).to_have_value('')
 # Different workout, same movement, must not inherit Power Pull weights.
 page.locator('#workoutChoice').select_option('pullBiceps')
 expect(page.locator('[data-field="0:0:deadlift:both"][data-prop="weight"]')).to_have_value('')
 # Group rest waits for both exercises; use a deterministic browser time source.
 page.evaluate('window.testNow = Date.now(); Date.now = () => window.testNow')
 page.locator('[data-field="0:0:pullup:both"][data-prop="done"]').check()
 expect(page.locator('#restTimer')).to_be_hidden()
 page.locator('[data-field="0:0:deadlift:both"][data-prop="done"]').check()
 expect(page.locator('#restCount')).to_have_text('01:30')
 page.evaluate('window.testNow += 91000')
 page.wait_for_timeout(350)
 expect(page.locator('#restLabel')).to_have_text('Rest complete')
 page.locator('#skipRest').click()
 # Side-specific group waits for the last side.
 page.locator('#workoutChoice').select_option('pushCore')
 page.locator('[data-field="0:0:overhead:both"][data-prop="done"]').check()
 page.locator('[data-field="0:0:oblique:left"][data-prop="done"]').check()
 expect(page.locator('#restTimer')).to_be_hidden()
 page.locator('[data-field="0:0:oblique:right"][data-prop="done"]').check()
 expect(page.locator('#restCount')).to_have_text('00:30')
 page.locator('#skipRest').click()
 # Timed plank completion participates in the entire five-exercise round.
 for ex in ['inclinefly','backfly','inclinepush','raisefront']:
  page.locator(f'[data-field="2:0:{ex}:both"][data-prop="done"]').check()
 expect(page.locator('#restTimer')).to_be_hidden()
 page.locator('[data-action="exerciseTimer"][data-key="2:0:spiderplank:both"]').click()
 expect(page.locator('#exerciseCount')).to_have_text('00:20')
 page.evaluate('window.testNow += 21000')
 page.wait_for_timeout(350)
 expect(page.locator('[data-field="2:0:spiderplank:both"][data-prop="done"]')).to_be_checked()
 expect(page.locator('#restCount')).to_have_text('00:59')
 # New program storage isolation before the legacy app is used.
 assert page.evaluate('localStorage.getItem("bangtao12")')==legacy_json
 page.locator('#notes').fill('Draft survives program switch')
 page.locator('#programChoice').select_option('bangtao')
 legacy_frame=page.frame_locator('#bangtaoFrame')
 expect(legacy_frame.locator('#weekpill')).to_have_text('Week 3 of 7')
 expect(legacy_frame.locator('#rehab')).to_be_visible()
 legacy_frame.get_by_role('button',name='Progress',exact=True).click()
 expect(legacy_frame.locator('#logged')).to_have_text('1')
 legacy_frame.locator('#history button').click()
 expect(legacy_frame.locator('#history')).to_contain_text('Existing Bangtao history')
 page.locator('#programChoice').select_option('strength')
 expect(page.locator('#notes')).to_have_value('Draft survives program switch')
 expect(page.locator('#restTimer')).to_be_hidden()
 expect(page.locator('#exerciseTimer')).to_be_hidden()
 assert page.locator('iframe').count()==0
 page.reload()
 expect(page.locator('#notes')).to_have_value('Draft survives program switch')
 expect(page.locator('#restTimer')).to_be_hidden()
 # All tabs and complete image library, no clipping at mobile or desktop widths.
 for name,section in [('Program','program'),('Exercises','library'),('Progress','progress'),('Today','today')]:
  page.get_by_role('button',name=name,exact=True).click()
  expect(page.locator('section.active')).to_have_attribute('id',section)
 page.get_by_role('button',name='Exercises',exact=True).click()
 page.locator('#library .guide summary').first.click()
 page.locator('#library').evaluate('(el)=>el.querySelectorAll("img").forEach(i=>i.loading="eager")')
 page.wait_for_function('Array.from(document.querySelectorAll("#library img")).every(i=>i.complete && i.naturalWidth>0)')
 assert page.locator('.photo-fallback').count()==0
 assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
 page.get_by_role('button',name='Today',exact=True).click()
 page.screenshot(path='/tmp/strength-superset-mobile.png')
 page.set_viewport_size({'width':1440,'height':900})
 page.screenshot(path='/tmp/strength-desktop.png')
 assert page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
 assert not errors,errors
 assert not console_errors,console_errors
 print('PASS: prescriptions/counts; mobile+desktop; all tabs; workout logging/history; escaped notes; reload recovery; same-workout weight recall; cross-workout isolation; standalone, group, bilateral and timed completion rests; timer deadlines/skip/no replay; program switching; legacy history; all library images; no page or console errors.')
 browser.close()
