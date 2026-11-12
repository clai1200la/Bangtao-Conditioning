from playwright.sync_api import sync_playwright,expect
import json
import os, shutil
URL=os.environ.get('BANGTAO_TEST_URL', 'http://127.0.0.1:8000/')
with sync_playwright() as p:
 chromium=shutil.which('chromium') or shutil.which('chromium-browser')
 b=p.chromium.launch(headless=True, **({'executable_path':chromium} if chromium else {}))
 c=b.new_context();a=c.new_page();z=c.new_page();a.goto(URL);z.goto(URL);a.on('dialog',lambda d:d.accept())
 a.locator('#notes').fill('A');a.locator('#saveWorkout').click();z.locator('#notes').fill('B')
 assert z.evaluate("JSON.parse(localStorage.getItem('strength_conditioning_v1')).sessions.length")==1
 c.close()
 c=b.new_context();a=c.new_page();a.add_init_script("Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError')}");a.goto(URL);a.on('dialog',lambda d:d.accept());a.locator('#saveWorkout').click()
 expect(a.locator('#saveWorkout')).to_be_enabled();expect(a.locator('#storageNotice')).to_contain_text('could not be saved')
 c.close()
 c=b.new_context();a=c.new_page();a.goto(URL+'bangtao.html');a.on('dialog',lambda d:d.accept());a.locator('#workoutChoice').select_option('A');a.locator('#bench_both_w1').fill('123');a.locator('#workoutChoice').select_option('B');a.locator('#workoutChoice').select_option('A');expect(a.locator('#bench_both_w1')).to_have_value('123')
 a.locator('#notes').fill('<img src=x onerror="window.auditInjected=true">');a.locator('button[onclick="saveToday()"]',has_text='Finish').click();assert not a.evaluate('window.auditInjected===true')
 a.get_by_role('button',name='Today',exact=True).click();a.locator('#notes').fill('remove me');a.wait_for_timeout(250);a.get_by_role('button',name='Progress',exact=True).click();a.get_by_role('button',name='Delete All Program Data').click();a.wait_for_load_state('load');a.wait_for_timeout(250);assert a.locator('#notes').input_value()==''
 c.close()
 c=b.new_context();a=c.new_page();a.goto(URL);a.get_by_role('button',name='Exercises',exact=True).click();a.locator('#librarySearch').fill('deadlift');assert a.locator('#libraryList article:visible').count()==1;a.locator('#libraryList summary:visible').click();expect(a.locator('#libraryList a[href*="youtube.com/results"]:visible')).to_have_count(1)
 c.close()
 # Treat every imported legacy history field as text, including IDs and numeric fields.
 legacy={'week':1,'slots':['mon'],'days':[{'id':'x\" onmouseover=\"window.auditUnsafe=true','date':'<img src=x onerror=window.auditUnsafe=true>','choice':'A','complete':True,'fields':{'bench_both_w1':'\" onfocus=\"window.auditUnsafe=true'},'pain':0,'elapsed':0}], 'weekDone':{},'choice':{}}
 c=b.new_context();a=c.new_page();a.add_init_script('localStorage.setItem("bangtao12",'+json.dumps(json.dumps(legacy))+')');a.goto(URL+'bangtao.html');a.wait_for_timeout(300)
 a.get_by_role('button',name='Progress',exact=True).click();a.locator('#history button').first.click();a.wait_for_timeout(200)
 assert not a.evaluate('window.auditUnsafe===true')
 c.close();b.close();print('PASS: cross-tab completed history, failed save, legacy draft switching, escaped notes, deletion, exercise search and video search.')
