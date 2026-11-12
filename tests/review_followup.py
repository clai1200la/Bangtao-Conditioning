from playwright.sync_api import sync_playwright,expect
import json
import os, shutil
URL=os.environ.get('BANGTAO_TEST_URL', 'http://127.0.0.1:8000/')
KEY='strength_conditioning_v1'
with sync_playwright() as p:
 chromium=shutil.which('chromium') or shutil.which('chromium-browser')
 b=p.chromium.launch(headless=True, **({'executable_path':chromium} if chromium else {}))
 c=b.new_context(viewport={'width':390,'height':844});a=c.new_page();z=c.new_page();a.goto(URL);z.goto(URL)
 a.locator('#notes').fill('First tab');z.locator('#notes').fill('Second tab')
 expect(z.locator('#storageNotice')).to_contain_text('changed in another tab')
 assert json.loads(z.evaluate('(k)=>localStorage.getItem(k)',KEY))['drafts']['powerPull']['notes']=='First tab'
 z.locator('#workoutChoice').select_option('powerLegs')
 expect(z.locator('#workoutChoice')).to_have_value('powerPull')
 expect(z.locator('#notes')).to_have_value('Second tab')
 z.get_by_role('button',name='Progress',exact=True).click()
 with z.expect_download() as dl: z.locator('#exportData').click()
 download=dl.value;download.save_as('/tmp/workout-conflict-backup.json')
 assert json.load(open('/tmp/workout-conflict-backup.json'))['strength']['drafts']['powerPull']['notes']=='Second tab'
 c.close()
 c=b.new_context(viewport={'width':390,'height':844});a=c.new_page();a.goto(URL);a.on('dialog',lambda d:d.accept())
 a.locator('#notes').fill('Before correction');a.locator('[data-field="1:0:deadlift:both"][data-prop="weight"]').fill('100');a.locator('#saveWorkout').click()
 a.get_by_role('button',name='Edit session').click();a.locator('#historyNotes').fill('Corrected note');a.locator('[data-history-key="1:0:deadlift:both"][data-history-prop="weight"]').fill('110');a.get_by_role('button',name='Save corrections').click()
 expect(a.locator('#history')).to_contain_text('Corrected note');expect(a.locator('#history')).to_contain_text('110 lb')
 a.get_by_role('button',name='Today',exact=True).click();a.get_by_role('button',name='Start another session').click()
 expect(a.locator('[data-field="1:0:deadlift:both"][data-prop="weight"]')).to_have_value('110')
 a.reload();a.get_by_role('button',name='Progress',exact=True).click();a.locator('#history button').first.click();expect(a.locator('#history')).to_contain_text('110 lb')
 with a.expect_download() as dl:a.locator('#exportData').click()
 download=dl.value;download.save_as('/tmp/workout-test-backup.json')
 # Existing local data is protected from import.
 a.locator('#importData').set_input_files('/tmp/workout-test-backup.json')
 expect(a.locator('#backupStatus')).to_contain_text('empty browser')
 c.close()
 c=b.new_context(viewport={'width':390,'height':844});a=c.new_page();a.goto(URL)
 a.get_by_role('button',name='Progress',exact=True).click();a.locator('#importData').set_input_files('/tmp/workout-test-backup.json')
 a.wait_for_load_state('load');a.wait_for_timeout(300);a.get_by_role('button',name='Progress',exact=True).click()
 expect(a.locator('#logged')).to_have_text('1');a.locator('#history button').first.click();expect(a.locator('#history')).to_contain_text('Corrected note')
 # Compact mode keeps future rounds hidden until needed; user can show all.
 a.get_by_role('button',name='Today',exact=True).click();a.locator('#workoutChoice').select_option('pushCore')
 block=a.locator('[data-block-card="0"]')
 assert block.locator('.round:visible').count()==1
 block.get_by_role('button',name='Show all rounds').click();assert block.locator('.round:visible').count()==4
 block.get_by_role('button',name='Show current round').click();assert block.locator('.round:visible').count()==1
 for key in ['0:0:overhead:both','0:0:oblique:left','0:0:oblique:right']: a.locator(f'[data-field="{key}"][data-prop="done"]').check()
 assert block.locator('.round:visible').get_attribute('data-round')=='1'
 assert block.locator('.round:visible a[href*="youtube.com/results"]').count()==2
 assert a.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
 a.screenshot(path='/tmp/strength-current-round.png')
 a.get_by_role('button',name='Exercises',exact=True).click()
 a.locator('#libraryFilter').select_option('powerLegs')
 assert a.locator('#libraryList article:visible').count()==5
 a.locator('#librarySearch').fill('hack')
 assert a.locator('#libraryList article:visible').count()==1
 c.close()
 # Old drafts retain their date and can be moved into history as partial.
 c=b.new_context();a=c.new_page();a.goto(URL);a.locator('#notes').fill('Yesterday draft')
 data=a.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY);data['drafts']['powerPull']['date']='2020-01-01';c.close()
 c=b.new_context();a=c.new_page();a.add_init_script('localStorage.setItem('+json.dumps(KEY)+','+json.dumps(json.dumps(data))+')');a.goto(URL);a.on('dialog',lambda d:d.accept())
 expect(a.locator('#sessionStatus')).to_contain_text('2020-01-01');a.get_by_role('button',name='Start a new session').click()
 stored=a.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY)
 assert stored['sessions'][0]['date']=='2020-01-01' and stored['sessions'][0]['complete'] is False
 assert stored['drafts']['powerPull']['date']!='2020-01-01'
 c.close()
 # Incomplete field maps recover missing controls without losing the original draft.
 data['drafts']['powerPull']['fields']={}
 c=b.new_context();a=c.new_page();errs=[];a.on('pageerror',lambda e:errs.append(str(e)));a.add_init_script('localStorage.setItem('+json.dumps(KEY)+','+json.dumps(json.dumps(data))+')');a.goto(URL)
 assert a.locator('#todayPlan input').count()>0 and not errs
 c.close()
 # A timer that expired long ago must not start a fresh rest on reload.
 c=b.new_context();a=c.new_page();a.goto(URL);a.locator('#workoutChoice').select_option('pushCore')
 for ex in ['inclinefly','backfly','inclinepush','raisefront']: a.locator(f'[data-field="2:0:{ex}:both"][data-prop="done"]').check()
 a.locator('[data-action="exerciseTimer"][data-key="2:0:spiderplank:both"]').click()
 data=a.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',KEY);data['drafts']['pushCore']['exerciseTimer']['end']-=300000;c.close()
 c=b.new_context();a=c.new_page();a.add_init_script('localStorage.setItem('+json.dumps(KEY)+','+json.dumps(json.dumps(data))+')');a.goto(URL);a.wait_for_timeout(350)
 expect(a.locator('#restTimer')).to_be_hidden();expect(a.locator('[data-field="2:0:spiderplank:both"][data-prop="done"]')).to_be_checked()
 c.close();b.close()
print('PASS: same-draft conflict, export of unsaved edits, history corrections, backup restore, round visibility, dated drafts, damaged fields and expired timer recovery.')
