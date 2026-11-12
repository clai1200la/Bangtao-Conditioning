"""Browser regression checks. Start a local server; see README.md for prerequisites."""
from playwright.sync_api import sync_playwright, expect
import json
import os, shutil
URL=os.environ.get('BANGTAO_TEST_URL', 'http://127.0.0.1:8000/')
CHROMIUM=shutil.which('chromium') or shutil.which('chromium-browser')
LAUNCH={'executable_path':CHROMIUM} if CHROMIUM else {}
KEY='strength_conditioning_v1'
with sync_playwright() as p:
 b=p.chromium.launch(headless=True, **LAUNCH)
 page=b.new_page(viewport={'width':320,'height':720})
 errs=[]
 page.on('pageerror',lambda e:errs.append(str(e)))
 page.goto(URL)
 page.evaluate('window.testNow = Date.now(); Date.now = () => window.testNow')
 page.locator('#sessionToggle').click()
 page.evaluate('window.testNow += 65000')
 page.wait_for_timeout(350)
 expect(page.locator('#sessionTime')).to_have_text('01:05')
 page.locator('#sessionToggle').click()
 page.reload()
 expect(page.locator('#sessionTime')).to_have_text('01:05')
 # Manual duration selection, replacement, and skip.
 page.locator('.manual-rest summary').click()
 for sec in [30,45,60,90]:
  page.locator(f'#manualRestChoices [data-seconds="{sec}"]').click()
  expect(page.locator('#restCount')).to_have_text(f'{sec//60:02d}:{sec%60:02d}')
 page.locator('#skipRest').click()
 # Switching workouts saves independent drafts and does not keep timers active.
 page.locator('#notes').fill('Power Pull draft')
 page.locator('#workoutChoice').select_option('powerLegs')
 page.locator('#notes').fill('Legs draft')
 expect(page.locator('#todayPlan .warning')).to_contain_text('Use a box')
 assert page.locator('#todayPlan .exercise-info .sheet-photo[data-cell="0"]').count()==1
 page.locator('#workoutChoice').select_option('powerPull')
 expect(page.locator('#notes')).to_have_value('Power Pull draft')
 page.locator('#workoutChoice').select_option('powerLegs')
 expect(page.locator('#notes')).to_have_value('Legs draft')
 # Legacy draft recovery and selectors.
 page.locator('#programChoice').select_option('bangtao')
 legacy=page.frame_locator('#bangtaoFrame')
 expect(legacy.locator('#today')).to_be_visible()
 legacy.locator('#notes').fill('Legacy unsaved note')
 page.locator('#programChoice').select_option('strength')
 page.locator('#programChoice').select_option('bangtao')
 expect(legacy.locator('#notes')).to_have_value('Legacy unsaved note')
 page.locator('#programChoice').select_option('strength')
 # All narrow layouts, including the five-exercise group.
 for w in ['powerPull','powerPush','powerLegs','pushCore','pullBiceps']:
  page.locator('#workoutChoice').select_option(w)
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),w
 # All photo requests fail: log inputs and textual guides must remain usable.
 page.route('**/assets/exercises/*',lambda route:route.abort())
 page.reload()
 expect(page.locator('#todayTitle')).to_be_visible()
 expect(page.locator('.photo-fallback').first).to_be_visible()
 page.locator('#notes').fill('Works without pictures')
 page.locator('#workoutChoice').select_option('powerLegs')
 page.locator('#todayPlan').evaluate('(el)=>el.querySelectorAll("img").forEach(i=>i.loading="eager")')
 expect(page.locator('#todayPlan .exercise-info .photo-fallback')).to_have_count(5)
 page.locator('#workoutChoice').select_option('pullBiceps')
 expect(page.locator('#notes')).to_have_value('Works without pictures')
 # Corrupt stored JSON must remain untouched and the app must still render.
 page.add_init_script("localStorage.setItem('strength_conditioning_v1','{broken')")
 page.reload()
 expect(page.locator('#storageNotice')).to_contain_text('could not be read')
 page.locator('#notes').fill('In memory only')
 assert page.evaluate('(key)=>localStorage.getItem(key)',KEY)=='{broken'
 assert not errs,errs
 # A separate browser with quota errors also remains usable.
 quota=b.new_page()
 quota.add_init_script('Storage.prototype.setItem = function(){throw new DOMException("Quota exceeded", "QuotaExceededError")}')
 quota.goto(URL)
 quota.locator('#notes').fill('In-memory draft')
 expect(quota.locator('#storageNotice')).to_contain_text('could not be saved')
 quota.locator('#workoutChoice').select_option('powerPush')
 quota.locator('#workoutChoice').select_option('powerPull')
 expect(quota.locator('#notes')).to_have_value('In-memory draft')
 print('PASS: 320px layout across all workouts; session timer pause/reload; four manual rest durations; independent drafts; legacy recovery draft; missing photos; corrupt data preservation; storage quota failure.')
 b.close()
