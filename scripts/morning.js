/* Morning ritual — daily 8-step pill checklist */
let _mrQuestDate = null;   // SFX latch: all-done fanfare at most once per day
function rMR(){
  const list=S.mr.list,done=list.filter(i=>i.d).length;
  const pct=Math.round(done/list.length*100);
  const remMins=list.filter(i=>!i.d).reduce((a,i)=>a+i.mins,0);
  document.getElementById('mr-bar').style.width=pct+'%';
  document.getElementById('mr-count').innerHTML=`${done}<span style="color:var(--brass-ghost);"> / ${list.length}</span>`;
  document.getElementById('mr-time').textContent=done===list.length?'All complete':`~ ${remMins} min remaining`;
  document.getElementById('mr-list').innerHTML=list.map(i=>`
    <div class="mr-pill ${i.d?'done':''}" data-id="${i.id}" onclick="toggleMR('${i.id}', event)">
      <span class="drag-handle" onclick="event.stopPropagation()" aria-label="拖动排序">⠿</span>
      <span class="mr-pill-name">${escH(i.t)}</span>
      <span class="mr-pill-time">${i.mins}m</span>
    </div>`).join('');
  makeSortable(document.getElementById('mr-list'), { itemSelector:'.mr-pill', handleSelector:'.drag-handle', onReorder:onReorderMR });
}
function onReorderMR(ids){
  S.mr.list = reorderById(S.mr.list, ids);
  saveMR();rMR();
}
function toggleMR(id,event){
  const i=S.mr.list.find(i=>i.id===id);
  if(i){
    i.d=!i.d;
    // SFX inside the guard — saveMR/rMR below run even on a failed id lookup.
    // The all-done fanfare is latched per day: untick+retick replays only a tick.
    if(window.Sfx){
      if(i.d && S.mr.list.every(x=>x.d) && _mrQuestDate !== TODAY){ _mrQuestDate = TODAY; Sfx.quest(); }
      else if(i.d) Sfx.tick(); else Sfx.untick();
    }
  }
  saveMR();rMR();
  if(typeof rpgAfterChange==='function')rpgAfterChange();
  if(event){
    setTimeout(()=>{
      const el=document.querySelector(`.mr-pill[data-id="${id}"]`);
      if(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),500);}
    },10);
  }
}
