(()=>{
  const active={};
  let ctx=null;
  function getAudio(){
    try{if(navigator.audioSession&&'type' in navigator.audioSession)navigator.audioSession.type='playback'}catch{}
    if(!ctx)ctx=new(window.AudioContext||window.webkitAudioContext)();
    if(ctx.state==='suspended')ctx.resume().catch(()=>{});
    return ctx;
  }
  function toneAt(c,when,freq,dur=.16,gain=.22,type='square'){
    const o=c.createOscillator(),g=c.createGain();
    o.type=type;o.frequency.setValueAtTime(freq,when);
    g.gain.setValueAtTime(.0001,when);
    g.gain.exponentialRampToValueAtTime(gain,when+.01);
    g.gain.exponentialRampToValueAtTime(.0001,when+dur);
    o.connect(g);g.connect(c.destination);o.start(when);o.stop(when+dur+.03);
    return o;
  }
  function loudStart(c,when){toneAt(c,when,1500,.22,.24);toneAt(c,when+.24,1900,.22,.24)}
  function loudFinish(c,when){toneAt(c,when,1150,.24,.28);toneAt(c,when+.27,1550,.24,.28);toneAt(c,when+.54,2050,.34,.28)}
  function tickNow(){const c=getAudio();toneAt(c,c.currentTime+.01,950,.06,.08,'square')}
  function clearTimer(id){const t=active[id];if(!t)return;clearInterval(t.interval);(t.nodes||[]).forEach(n=>{try{n.stop()}catch{}});delete active[id];}
  function finishTimer(id){const t=active[id];if(!t)return;clearInterval(t.interval);delete active[id];const b=document.getElementById(id);if(b){b.classList.remove('running');const c=b.querySelector('.count');if(c)c.textContent='Done'}const box=document.getElementById(t.done);if(box)box.checked=true;}
  function refresh(id){const t=active[id];if(!t)return;const b=document.getElementById(id);if(!b){clearTimer(id);return}const ms=t.endAt-Date.now();if(ms<=0){finishTimer(id);return}const remaining=Math.ceil(ms/1000);const c=b.querySelector('.count');if(c)c.textContent=window.fmt?window.fmt(remaining):`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;}
  function robustCountdown(id,secs,done){
    const b=document.getElementById(id);if(!b)return;
    if(active[id]){clearTimer(id);b.classList.remove('running');return}
    const c=getAudio(),startAt=Date.now()+3000,endAt=startAt+secs*1000;
    b.classList.add('running');const count=b.querySelector('.count');if(count)count.textContent='Ready 3';
    tickNow();setTimeout(()=>{if(active[id])tickNow()},1000);setTimeout(()=>{if(active[id])tickNow()},2000);
    const audioStart=c.currentTime+3.0,audioEnd=audioStart+secs;
    const nodes=[];try{nodes.push(toneAt(c,audioStart,1500,.22,.24),toneAt(c,audioStart+.24,1900,.22,.24));nodes.push(toneAt(c,audioEnd,1150,.24,.28),toneAt(c,audioEnd+.27,1550,.24,.28),toneAt(c,audioEnd+.54,2050,.34,.28))}catch{}
    active[id]={done,startAt,endAt,nodes,interval:null};
    active[id].interval=setInterval(()=>{const t=active[id];if(!t)return;const now=Date.now();if(now<t.startAt){const left=Math.max(1,Math.ceil((t.startAt-now)/1000));if(count)count.textContent='Ready '+left}else refresh(id)},250);
  }
  window.countdownFromInput=function(id,inputId,done){const n=Math.max(1,parseInt(document.getElementById(inputId)?.value,10)||30);robustCountdown(id,n,done)};
  window.countdown=robustCountdown;
  let bike=null;
  window.bikeStart=function(mins){
    const b=document.getElementById('bike_main');if(!b)return;
    if(bike){clearInterval(bike.interval);(bike.nodes||[]).forEach(n=>{try{n.stop()}catch{}});bike=null;b.textContent=`Start ${mins}:00`;return}
    const c=getAudio(),startAt=Date.now()+3000,endAt=startAt+mins*60000;tickNow();setTimeout(()=>{if(bike)tickNow()},1000);setTimeout(()=>{if(bike)tickNow()},2000);
    const a0=c.currentTime+3,a1=a0+mins*60,nodes=[];try{nodes.push(toneAt(c,a0,1500,.22,.24),toneAt(c,a0+.24,1900,.22,.24),toneAt(c,a1,1150,.24,.28),toneAt(c,a1+.27,1550,.24,.28),toneAt(c,a1+.54,2050,.34,.28))}catch{}
    bike={startAt,endAt,nodes,interval:null};b.textContent='Ready 3';
    bike.interval=setInterval(()=>{if(!bike)return;const now=Date.now();if(now<startAt){b.textContent='Ready '+Math.max(1,Math.ceil((startAt-now)/1000));return}const rem=Math.ceil((endAt-now)/1000);if(rem<=0){clearInterval(bike.interval);bike=null;b.textContent='Done';const a=document.getElementById('bike_actual'),d=document.getElementById('bike_done');if(a)a.value=mins;if(d)d.checked=true}else b.textContent=`${String(Math.floor(rem/60)).padStart(2,'0')}:${String(rem%60).padStart(2,'0')}`},250);
  };
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){Object.keys(active).forEach(refresh);if(bike&&Date.now()>=bike.endAt){clearInterval(bike.interval);const b=document.getElementById('bike_main');if(b)b.textContent='Done';const a=document.getElementById('bike_actual'),d=document.getElementById('bike_done');if(a)a.value=Math.round((bike.endAt-bike.startAt)/60000);if(d)d.checked=true;bike=null}}});
})();