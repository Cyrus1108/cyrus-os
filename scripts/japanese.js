/* Japanese N2 — practice checklist with AUTO check-in + derived streak.
   完成即打卡: log[TODAY] flips on automatically when every item on TODAY's
   list is checked, and back off if the day stops being complete (same-day
   reversal only — history is never touched). The list length is DYNAMIC
   (items can be added/removed at will), so completion is always measured
   against the CURRENT list, never a hardcoded count. The streak is DERIVED
   from the log — consecutive days ending today (or yesterday while today is
   still unfinished) — never manually incremented, so it can't drift. */
let jpOpen=false;
function toggleJPForm(){jpOpen=!jpOpen;document.getElementById('jp-new-form').style.display=jpOpen?'block':'none';}
function addJPItem(){const t=document.getElementById('jp-new-text').value.trim();if(!t)return;S.jp.list.push({id:'j'+Date.now(),t,d:false});document.getElementById('jp-new-text').value='';jpOpen=false;document.getElementById('jp-new-form').style.display='none';jpSettle();saveJP();rJP();rMetrics();if(typeof rpgAfterChange==='function')rpgAfterChange();}
function toggleJP(id){
  const i=S.jp.list.find(i=>i.id===id);
  if(i){
    i.d=!i.d;
    const r=jpSettle();
    if(window.Sfx){
      if(r.changed&&r.all)Sfx.quest();        // the check that completes the day
      else i.d?Sfx.tick():Sfx.untick();
    }
  }
  saveJP();rJP();rMetrics();if(typeof rpgAfterChange==='function')rpgAfterChange();
}
function delJP(id){if(editingJP===id)editingJP=null;S.jp.list=S.jp.list.filter(i=>i.id!==id);jpSettle();saveJP();rJP();rMetrics();if(typeof rpgAfterChange==='function')rpgAfterChange();}
function startJPEdit(id){editingJP=id;rJP();}
function cancelJPEdit(){editingJP=null;rJP();}
function saveJPEdit(id){const i=S.jp.list.find(i=>i.id===id);if(!i)return;const t=document.getElementById('ej-text').value.trim();if(!t)return;i.t=t;editingJP=null;saveJP();rJP();}

/* streak = consecutive logged days ending today; an unfinished TODAY doesn't
   break the run (it just doesn't count yet) */
function jpComputeStreak(){
  const log=S.jp.log||{};
  const d=new Date();let s=0;
  if(!log[d.toLocaleDateString('sv-SE')])d.setDate(d.getDate()-1);
  while(log[d.toLocaleDateString('sv-SE')]){s++;d.setDate(d.getDate()-1);}
  return s;
}
/* settle the derived state after ANY list mutation (toggle/add/delete).
   Pure — no sounds, no renders; returns whether TODAY's completion flipped. */
function jpSettle(){
  const all=S.jp.list.length>0&&S.jp.list.every(i=>i.d);
  const had=!!S.jp.log[TODAY];
  if(all&&!had)S.jp.log[TODAY]=true;
  else if(!all&&had)delete S.jp.log[TODAY];
  S.jp.streak=jpComputeStreak();
  S.jp.last=Object.keys(S.jp.log).sort().reverse()[0]||null;
  return {changed:all!==had,all};
}
let jpNT;function onJPNote(){S.jp.note=document.getElementById('jp-note').value;clearTimeout(jpNT);jpNT=setTimeout(saveJP,600);}

function rJP(){
  S.jp.streak=jpComputeStreak();   // derived — also corrects stale server values after a pull
  document.getElementById('streak-n').textContent=S.jp.streak;
  const now=new Date(),dow=now.getDay();
  const mon=new Date(now);mon.setDate(now.getDate()-(dow===0?6:dow-1));
  const labs=['M','T','W','T','F','S','S'];
  document.getElementById('week-grid').innerHTML=Array.from({length:7},(_,i)=>{
    const d=new Date(mon);d.setDate(mon.getDate()+i);
    const ds=d.toLocaleDateString('sv-SE'),isT=ds===TODAY,done=S.jp.log[ds],fut=ds>TODAY;
    const cls=['jp-day-cell'];if(done)cls.push('done');if(fut)cls.push('future');if(isT)cls.push('today');
    return `<div class="jp-day"><div class="jp-day-label">${labs[i]}</div><div class="${cls.join(' ')}"></div></div>`;
  }).join('');
  // status line (the old manual check-in button, now display-only): progress
  // toward today's auto check-in, against the CURRENT list length
  const doneN=S.jp.list.filter(i=>i.d).length,totalN=S.jp.list.length;
  const ci=S.jp.log[TODAY],btn=document.getElementById('ci-btn');
  btn.textContent=ci?'— 今日已完成 —':`今日练习 ${doneN}/${totalN} · 全清自动打卡`;
  btn.classList.toggle('done',!!ci);
  document.getElementById('jp-checklist').innerHTML=S.jp.list.map(i=>{
    if(editingJP===i.id){
      return `<div style="padding:5px 0;border-bottom:.5px solid var(--hair);"><div class="edit-box" style="flex-direction:row;padding:6px;align-items:center;">
        <input id="ej-text" value="${escH(i.t)}" style="flex:1;">
        <button class="primary fx-btn" onclick="saveJPEdit('${i.id}')">保存</button>
        <button class="ghost fx-btn" onclick="cancelJPEdit()">×</button>
      </div></div>`;
    }
    return `<div class="row ${i.d?'item-done':''}" data-id="${i.id}">
      <span class="drag-handle" onclick="event.stopPropagation()" aria-label="拖动排序">⠿</span>
      <input type="checkbox" class="row-cb" ${i.d?'checked':''} onchange="toggleJP('${i.id}')">
      <div class="row-body"><span class="item-text">${escH(i.t)}</span></div>
      <div class="row-actions">
        <button class="row-btn" onclick="startJPEdit('${i.id}')">编辑</button>
        <button class="row-btn" onclick="delJP('${i.id}')">×</button>
      </div>
    </div>`;
  }).join('');
  const ne=document.getElementById('jp-note');if(ne&&document.activeElement!==ne)ne.value=S.jp.note||'';
  attachRipples();
  makeSortable(document.getElementById('jp-checklist'), { itemSelector:'.row', handleSelector:'.drag-handle', onReorder:onReorderJP });
}
function onReorderJP(ids){
  S.jp.list = reorderById(S.jp.list, ids);
  saveJP();rJP();
}
