(()=>{
 const KEY='bangtao12_active_session';
 let timer=null, deleting=false, dirty=false, suppressCapture=false;
 const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
 function captureRecovery(previousChoice){if(deleting||suppressCapture)return;const t=document.getElementById('today');if(!t)return;const values={};t.querySelectorAll('input,textarea,select').forEach(el=>{if(!el.id||el.id==='workoutChoice')return;values[el.id]=el.type==='checkbox'?el.checked:el.value});try{const choice=(typeof previousChoice==='string'?previousChoice:document.getElementById('workoutChoice')?.value)||'';const old=JSON.parse(localStorage.getItem(KEY)||'null');const drafts=old?.drafts||{};if(old?.choice&&!old.drafts)drafts[old.choice]=old;drafts[choice]={date:today(),choice,values,updatedAt:Date.now()};localStorage.setItem(KEY,JSON.stringify({drafts}))}catch{}}
 function persistNow(choice){captureRecovery(choice);}
 function persistSoon(){clearTimeout(timer);timer=setTimeout(persistNow,150)}
 function restoreRecovery(){let s;try{s=JSON.parse(localStorage.getItem(KEY)||'null')}catch{return}const current=document.getElementById('workoutChoice')?.value||'';s=s?.drafts?.[current]||s;if(!s||s.date!==today())return;if(s.choice&&current&&s.choice!==current)return;Object.entries(s.values||{}).forEach(([id,v])=>{const el=document.getElementById(id);if(!el)return;if(el.type==='checkbox')el.checked=!!v;else el.value=v})}
 function clearRecovery(){clearTimeout(timer);suppressCapture=true;try{const current=document.getElementById('workoutChoice')?.value||'';const s=JSON.parse(localStorage.getItem(KEY)||'null');if(s?.drafts){delete s.drafts[current];localStorage.setItem(KEY,JSON.stringify(s))}else localStorage.removeItem(KEY)}catch{}}
 function deleteRecovery(){deleting=true;clearTimeout(timer);try{localStorage.removeItem(KEY)}catch{}}
 document.addEventListener('input',e=>{if(e.target?.closest?.('#today')){dirty=true;suppressCapture=false;persistSoon()}},true);
 document.addEventListener('change',e=>{if(e.target?.closest?.('#today')){dirty=true;suppressCapture=false;persistSoon()}},true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)persistNow()});
 window.addEventListener('pagehide',persistNow);
 document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{if(!dirty)restoreRecovery()},100));
 window.preserveBangtaoSession=persistNow;window.restoreBangtaoSession=restoreRecovery;window.deleteBangtaoRecovery=deleteRecovery;window.clearBangtaoSession=clearRecovery;
})();