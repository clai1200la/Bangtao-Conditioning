(()=>{
 const KEY='bangtao12';let restEnd=0,interval=null,activeRow=null;
 const $=id=>document.getElementById(id);
 const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}};
 const write=s=>localStorage.setItem(KEY,JSON.stringify(s));
 const secs=()=>[45,60,120,180].includes(+read().restSeconds)?+read().restSeconds:120;
 const fmt=n=>`${String(Math.floor(Math.max(0,n)/60)).padStart(2,'0')}:${String(Math.max(0,Math.ceil(n))%60).padStart(2,'0')}`;
 function alarm(){try{navigator.vibrate?.([200,80,200])}catch{}}
 function setDuration(n){const s=read();s.restSeconds=+n;write(s);document.querySelectorAll('[data-rest-choice]').forEach(b=>b.style.fontWeight=(+b.dataset.restChoice===+n?'800':'500'));}
 function clearRow(){if(activeRow){activeRow.remove();activeRow=null}}
 function stop(){restEnd=0;if(interval){clearInterval(interval);interval=null}clearRow()}
 function tick(){if(!restEnd||!activeRow)return;const n=Math.ceil((restEnd-Date.now())/1000),t=activeRow.querySelector('.rest-count');if(n<=0){if(interval)clearInterval(interval);interval=null;restEnd=0;if(t)t.textContent='00:00';activeRow.classList.add('rest-done');alarm();return}if(t)t.textContent=fmt(n)}
 function start(afterBox){stop();const n=secs();restEnd=Date.now()+n*1000;activeRow=document.createElement('div');activeRow.className='complete rest-inline';activeRow.style.cssText='margin:6px 0 10px;padding:10px;border-radius:10px;background:rgba(33,95,75,.09)';activeRow.innerHTML=`<span><b>REST</b> · Next set</span><span><b class="rest-count">${fmt(n)}</b> <button class="secondary" style="padding:5px 8px" onclick="stopRestTimer()">Skip</button></span>`;const row=afterBox.closest('.setrow,.complete')||afterBox.parentElement;row.insertAdjacentElement('afterend',activeRow);interval=setInterval(tick,250)}
 function isBox(el){return el&&el.type==='checkbox'&&/^[a-zA-Z0-9]+_(?:both|left|right)_d\d+$/.test(el.id)}
 function groupBoxes(el){const [ex,side]=el.id.split('_');return [...document.querySelectorAll('#today input[type=checkbox]')].filter(x=>isBox(x)&&x.id.startsWith(ex+'_'+side+'_'))}
 function last(el){const boxes=groupBoxes(el);return boxes.length>0&&boxes[boxes.length-1]===el}
 function mount(){const rotation=document.querySelector('#today .rotation');if(!rotation||$('restChoice'))return;const p=document.createElement('div');p.id='restChoice';p.className='row';p.style.cssText='margin:8px 0;gap:6px';p.innerHTML=`<span class="micro">Rest</span><button class="secondary" data-rest-choice="45" onclick="setRestDuration(45)">45s</button><button class="secondary" data-rest-choice="60" onclick="setRestDuration(60)">1m</button><button class="secondary" data-rest-choice="120" onclick="setRestDuration(120)">2m</button><button class="secondary" data-rest-choice="180" onclick="setRestDuration(180)">3m</button>`;rotation.insertAdjacentElement('afterend',p);setDuration(secs())}
 window.setRestDuration=setDuration;window.stopRestTimer=stop;window.startRestTimer=start;
 document.addEventListener('change',e=>{const b=e.target;if(!isBox(b))return;if(b.checked&&!last(b))start(b);else if(!b.checked&&activeRow)stop()});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
 setInterval(()=>{mount();if(restEnd)tick()},500);mount();
})();