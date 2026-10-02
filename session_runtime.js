(()=>{
 const KEY='bangtao12_active_session';
 let timer=null;
 const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
 function captureRecovery(){const t=document.getElementById('today');if(!t)return;const values={};t.querySelectorAll('input,textarea,select').forEach(el=>{if(!el.id||el.id==='workoutChoice')return;values[el.id]=el.type==='checkbox'?el.checked:el.value});try{localStorage.setItem(KEY,JSON.stringify({date:today(),choice:document.getElementById('workoutChoice')?.value||'',values,updatedAt:Date.now()}))}catch{}}
 function persistNow(){captureRecovery();try{window.autoSaveToday?.()}catch{}}
 function persistSoon(){clearTimeout(timer);timer=setTimeout(persistNow,150)}
 function restoreRecovery(){let s;try{s=JSON.parse(localStorage.getItem(KEY)||'null')}catch{return}if(!s||s.date!==today())return;const current=document.getElementById('workoutChoice')?.value||'';if(s.choice&&current&&s.choice!==current)return;Object.entries(s.values||{}).forEach(([id,v])=>{const el=document.getElementById(id);if(!el)return;if(el.type==='checkbox')el.checked=!!v;else el.value=v})}
 function clearRecovery(){try{localStorage.removeItem(KEY)}catch{}}
 document.addEventListener('input',persistSoon,true);
 document.addEventListener('change',persistSoon,true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)persistNow()});
 window.addEventListener('pagehide',persistNow);
 document.addEventListener('DOMContentLoaded',()=>setTimeout(restoreRecovery,100));
 window.preserveBangtaoSession=persistNow;window.clearBangtaoSession=clearRecovery;
})();