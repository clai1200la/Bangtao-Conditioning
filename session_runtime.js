(()=>{
 const KEY='bangtao12_active_session';
 let restoring=false, timer=null;
 const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
 function capture(){
  if(restoring)return;
  const todaySection=document.getElementById('today');if(!todaySection)return;
  const values={};
  todaySection.querySelectorAll('input,textarea,select').forEach(el=>{if(!el.id)return;values[el.id]=el.type==='checkbox'?el.checked:el.value});
  try{localStorage.setItem(KEY,JSON.stringify({date:today(),values,updatedAt:Date.now()}))}catch{}
 }
 function restore(){
  let s;try{s=JSON.parse(localStorage.getItem(KEY)||'null')}catch{return}if(!s||s.date!==today())return;
  restoring=true;
  Object.entries(s.values||{}).forEach(([id,v])=>{const el=document.getElementById(id);if(!el)return;if(el.type==='checkbox')el.checked=!!v;else el.value=v});
  restoring=false;
 }
 function scheduleRestore(){clearTimeout(timer);timer=setTimeout(restore,80)}
 document.addEventListener('input',capture,true);document.addEventListener('change',capture,true);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)capture();else scheduleRestore()});
 window.addEventListener('pagehide',capture);window.addEventListener('pageshow',scheduleRestore);
 const mo=new MutationObserver(()=>scheduleRestore());
 document.addEventListener('DOMContentLoaded',()=>{const t=document.getElementById('today');if(t)mo.observe(t,{childList:true,subtree:true});scheduleRestore()});
 window.preserveBangtaoSession=capture;
})();