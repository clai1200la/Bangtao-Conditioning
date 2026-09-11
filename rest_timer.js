(()=>{
  const KEY='bangtao12';
  const $=id=>document.getElementById(id);
  let restEnd=0, restInterval=null, lastStates=new Map(), restAudio;

  function readStore(){
    try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch{return {}}
  }
  function writeStore(s){localStorage.setItem(KEY,JSON.stringify(s))}
  function restSeconds(){
    const s=readStore();
    return [60,120,180].includes(+s.restSeconds)?+s.restSeconds:120;
  }
  function setRestSeconds(sec){
    const s=readStore();
    s.restSeconds=+sec;
    writeStore(s);
    renderChoice();
    if(!restEnd) updateDisplay(+sec);
  }
  function fmt(sec){
    sec=Math.max(0,Math.ceil(sec));
    return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
  }
  function audioCtx(){
    if(!restAudio)restAudio=new(window.AudioContext||window.webkitAudioContext)();
    if(restAudio.state==='suspended')restAudio.resume();
    return restAudio;
  }
  function loudTone(freq,start,duration=.18,volume=.32){
    try{
      const c=audioCtx(),o=c.createOscillator(),g=c.createGain();
      o.type='square';o.frequency.value=freq;
      g.gain.setValueAtTime(volume,c.currentTime+start);
      g.gain.exponentialRampToValueAtTime(.001,c.currentTime+start+duration);
      o.connect(g);g.connect(c.destination);
      o.start(c.currentTime+start);o.stop(c.currentTime+start+duration);
    }catch{}
  }
  function restDoneAlarm(){
    [0,.22,.44,.7].forEach((t,i)=>loudTone(i%2?1500:1050,t,.18,.34));
    if(navigator.vibrate)navigator.vibrate([180,80,180]);
  }
  function updateDisplay(sec){
    const el=$('restTime');
    if(el)el.textContent=fmt(sec);
  }
  function renderChoice(){
    const selected=restSeconds();
    document.querySelectorAll('[data-rest-seconds]').forEach(b=>{
      const active=+b.dataset.restSeconds===selected;
      b.style.fontWeight=active?'800':'500';
      b.style.outline=active?'2px solid currentColor':'none';
    });
  }
  function stopRest(){
    restEnd=0;
    if(restInterval){clearInterval(restInterval);restInterval=null}
    updateDisplay(restSeconds());
    const status=$('restStatus');if(status)status.textContent='Ready';
  }
  function tickRest(){
    if(!restEnd)return;
    const remaining=(restEnd-Date.now())/1000;
    if(remaining<=0){
      restEnd=0;
      if(restInterval){clearInterval(restInterval);restInterval=null}
      updateDisplay(0);
      const status=$('restStatus');if(status)status.textContent='REST DONE';
      restDoneAlarm();
      return;
    }
    updateDisplay(remaining);
  }
  function startRest(){
    const sec=restSeconds();
    try{audioCtx()}catch{}
    restEnd=Date.now()+sec*1000;
    const status=$('restStatus');if(status)status.textContent='Resting';
    updateDisplay(sec);
    if(restInterval)clearInterval(restInterval);
    restInterval=setInterval(tickRest,250);
  }
  function isSetBox(el){return el&&el.type==='checkbox'&&/^[a-zA-Z0-9]+_(?:both|left|right)_d\d+$/.test(el.id)}
  function isLastSetForExercise(el){
    const exercise=el.id.split('_')[0];
    const boxes=[...document.querySelectorAll('#today input[type="checkbox"]')].filter(x=>isSetBox(x)&&x.id.startsWith(exercise+'_'));
    return boxes.length>0&&boxes[boxes.length-1]===el;
  }
  function scanCompletions(){
    const boxes=[...document.querySelectorAll('#today input[type="checkbox"]')].filter(isSetBox);
    const live=new Set();
    for(const box of boxes){
      live.add(box.id);
      if(!lastStates.has(box.id)){lastStates.set(box.id,box.checked);continue}
      const was=lastStates.get(box.id);
      if(!was&&box.checked&&!isLastSetForExercise(box))startRest();
      lastStates.set(box.id,box.checked);
    }
    for(const id of [...lastStates.keys()])if(!live.has(id))lastStates.delete(id);
  }
  function mount(){
    const rotation=document.querySelector('#today .rotation');
    if(!rotation||$('restTimerPanel'))return;
    const panel=document.createElement('div');
    panel.id='restTimerPanel';panel.className='exercise';panel.style.marginTop='10px';
    panel.innerHTML=`<div class="head"><div><div class="title">Rest timer</div><div id="restStatus" class="micro">Ready</div></div><b id="restTime" style="font-size:24px">${fmt(restSeconds())}</b></div><div class="row" style="margin-top:8px"><button class="secondary" data-rest-seconds="60" onclick="setRestDuration(60)">1m</button><button class="secondary" data-rest-seconds="120" onclick="setRestDuration(120)">2m</button><button class="secondary" data-rest-seconds="180" onclick="setRestDuration(180)">3m</button><button class="secondary" onclick="stopRestTimer()">Stop</button></div><div class="micro" style="margin-top:6px">Starts automatically when a set is marked complete.</div>`;
    rotation.insertAdjacentElement('afterend',panel);
    renderChoice();
  }
  window.setRestDuration=setRestSeconds;
  window.stopRestTimer=stopRest;
  window.startRestTimer=startRest;
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tickRest()});
  setInterval(()=>{mount();scanCompletions();if(restEnd)tickRest()},300);
  mount();
})();