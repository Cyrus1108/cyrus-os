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
function addJPItem(){const t=document.getElementById('jp-new-text').value.trim();if(!t)return;const rs=document.getElementById('jp-new-repeat'),cs=document.getElementById('jp-new-custom');const rep=(rs&&rs.value)||'daily',cd=(cs&&parseInt(cs.value))||0;S.jp.list.push({id:'j'+Date.now(),t,d:false,repeat:rep,customDays:cd,since:TODAY});document.getElementById('jp-new-text').value='';if(cs){cs.value='';cs.style.display='none';}if(rs)rs.value='daily';jpOpen=false;document.getElementById('jp-new-form').style.display='none';jpSettle();saveJP();rJP();rMetrics();if(typeof rpgAfterChange==='function')rpgAfterChange();}
function toggleJP(id){
  // 三拍:勾选框会被 rJP setHTML 重写,但其行(#jp-checklist [data-id])是 reconcile
  // 复用的持久节点 → beatTap 对行 transform,渲染后仍是同一节点。
  const row=document.querySelector(`#jp-checklist [data-id="${id}"]`);
  const apply=function(){
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
  };
  if(window.beatTap && row) window.beatTap(row, apply);
  else apply();
}
function delJP(id){if(editingJP===id)editingJP=null;S.jp.list=S.jp.list.filter(i=>i.id!==id);jpSettle();saveJP();rJP();rMetrics();if(typeof rpgAfterChange==='function')rpgAfterChange();}
function startJPEdit(id){editingJP=id;rJP();}
function cancelJPEdit(){editingJP=null;rJP();}
function saveJPEdit(id){const i=S.jp.list.find(i=>i.id===id);if(!i)return;const t=document.getElementById('ej-text').value.trim();if(!t)return;i.t=t;const rs=document.getElementById('ej-repeat'),cs=document.getElementById('ej-custom');if(rs)i.repeat=rs.value;if(cs)i.customDays=parseInt(cs.value)||0;if(!i.since)i.since=TODAY;editingJP=null;jpSettle();saveJP();rJP();rMetrics();}

/* streak = consecutive logged days ending today; an unfinished TODAY doesn't
   break the run (it just doesn't count yet) */
function jpComputeStreak(){
  const log=S.jp.log||{};
  const d=new Date();let s=0;
  if(!log[d.toLocaleDateString('sv-SE')])d.setDate(d.getDate()-1);
  while(log[d.toLocaleDateString('sv-SE')]){s++;d.setDate(d.getDate()-1);}
  return s;
}
/* whether a checklist item is scheduled for a given date, per its repeat rule. Items
   default to 'daily' (back-compat: legacy items without a repeat field). Anchor = it.since
   (the day it was created) for 每周/每两周/每月/自定义天数. */
function jpItemDueOn(it, ds){
  const r=it.repeat||'daily';
  if(r==='daily')return true;
  const d=new Date(ds+'T00:00:00'),dow=d.getDay();
  if(r==='weekdays')return dow>=1&&dow<=5;
  if(r==='weekends')return dow===0||dow===6;
  const anchor=new Date((it.since||ds)+'T00:00:00');
  const days=Math.round((d-anchor)/86400000);
  if(days<0)return false;
  if(r==='weekly')return dow===anchor.getDay();
  if(r==='biweekly')return dow===anchor.getDay()&&Math.floor(days/7)%2===0;
  if(r==='monthly')return d.getDate()===anchor.getDate();
  if(r==='custom_days')return it.customDays>0&&days%it.customDays===0;
  return true;
}
function jpDueToday(){return S.jp.list.filter(i=>jpItemDueOn(i,TODAY));}
function toggleJpNewCustom(){const s=document.getElementById('jp-new-repeat'),i=document.getElementById('jp-new-custom');if(s&&i)i.style.display=s.value==='custom_days'?'inline-block':'none';}
function toggleEjCustom(){const s=document.getElementById('ej-repeat'),i=document.getElementById('ej-custom');if(s&&i)i.style.display=s.value==='custom_days'?'inline-block':'none';}

/* settle the derived state after ANY list mutation. Check-in = all of TODAY's DUE items
   done (items not scheduled for today don't block). Pure — no sounds, no renders. */
function jpSettle(){
  const due=jpDueToday();
  const all=due.length>0&&due.every(i=>i.d);
  const had=!!S.jp.log[TODAY];
  if(all&&!had)S.jp.log[TODAY]=true;
  // only AUTO-uncheck when there ARE items due today (a real, incomplete checklist); on a
  // day with nothing due, jpCheckInToday (manual) owns TODAY and must not be wiped.
  else if(!all&&had&&due.length>0)delete S.jp.log[TODAY];
  S.jp.streak=jpComputeStreak();
  S.jp.last=Object.keys(S.jp.log).sort().reverse()[0]||null;
  return {changed:all!==had,all};
}
/* Manual daily check-in — when there's no checklist, the streak is kept by simply marking
   "studied today". Toggles TODAY only; historical days are never touched. */
function jpCheckInToday(){
  if(S.jp.log[TODAY])delete S.jp.log[TODAY];else S.jp.log[TODAY]=true;
  S.jp.streak=jpComputeStreak();
  S.jp.last=Object.keys(S.jp.log).sort().reverse()[0]||null;
  if(window.Sfx){S.jp.log[TODAY]?Sfx.quest():Sfx.untick();}
  saveJP();rJP();rMetrics();if(typeof rpgAfterChange==='function')rpgAfterChange();
}
let jpNT;function onJPNote(){S.jp.note=document.getElementById('jp-note').value;clearTimeout(jpNT);jpNT=setTimeout(saveJP,600);}

const JP_REPS=[['daily','每日'],['weekdays','仅工作日'],['weekends','仅周末'],['weekly','每周'],['biweekly','每两周'],['monthly','每月'],['custom_days','自定义天数…']];
function jpEditInner(i){
  const rep=i.repeat||'daily';
  return `<div class="edit-box" style="padding:6px;">
        <input id="ej-text" value="${escH(i.t)}" style="width:100%;">
        <div style="display:flex;gap:6px;align-items:center;">
          <select id="ej-repeat" onchange="toggleEjCustom()" style="flex:1;">
            ${JP_REPS.map(([v,l])=>`<option value="${v}" ${rep===v?'selected':''}>${l}</option>`).join('')}
          </select>
          <input id="ej-custom" type="number" min="1" max="365" value="${i.customDays||''}" placeholder="每N天" style="width:78px;${rep==='custom_days'?'':'display:none;'}">
        </div>
        <div style="display:flex;gap:6px;">
          <button class="primary fx-btn" onclick="saveJPEdit('${i.id}')" style="flex:1;">保存</button>
          <button class="ghost fx-btn" onclick="cancelJPEdit()" style="flex:1;">取消</button>
        </div>
      </div>`;
}
function jpNotDueInner(i,repBadge){
  return `<span class="drag-handle" onclick="event.stopPropagation()" aria-label="拖动排序">⠿</span>
        <span style="display:inline-block;width:16px;text-align:center;color:var(--ghost);">·</span>
        <div class="row-body"><span class="item-text">${escH(i.t)}</span> ${repBadge}<span class="ac-date">今日无需</span></div>
        <div class="row-actions">
          <button class="row-btn" onclick="startJPEdit('${i.id}')">编辑</button>
          <button class="row-btn" onclick="delJP('${i.id}')">×</button>
        </div>`;
}
function jpDueInner(i,repBadge){
  return `<span class="drag-handle" onclick="event.stopPropagation()" aria-label="拖动排序">⠿</span>
      <input type="checkbox" class="row-cb" ${i.d?'checked':''} onchange="toggleJP('${i.id}')">
      <div class="row-body"><span class="item-text">${escH(i.t)}</span> ${repBadge}</div>
      <div class="row-actions">
        <button class="row-btn" onclick="startJPEdit('${i.id}')">编辑</button>
        <button class="row-btn" onclick="delJP('${i.id}')">×</button>
      </div>`;
}

function rJP(){
  S.jp.streak=jpComputeStreak();   // derived — also corrects stale server values after a pull
  setText(document.getElementById('streak-n'), S.jp.streak);
  const _jpT=document.getElementById('jp-total'); if(_jpT) setText(_jpT, Object.keys(S.jp.log||{}).length);   // 累计打卡天数(全部历史,证明记录没被删)
  const now=new Date(),dow=now.getDay();
  const mon=new Date(now);mon.setDate(now.getDate()-(dow===0?6:dow-1));
  const labs=['M','T','W','T','F','S','S'];
  setHTML(document.getElementById('week-grid'), Array.from({length:7},(_,i)=>{
    const d=new Date(mon);d.setDate(mon.getDate()+i);
    const ds=d.toLocaleDateString('sv-SE'),isT=ds===TODAY,done=S.jp.log[ds],fut=ds>TODAY;
    const cls=['jp-day-cell'];if(done)cls.push('done');if(fut)cls.push('future');if(isT)cls.push('today');
    return `<div class="jp-day"><div class="jp-day-label">${labs[i]}</div><div class="${cls.join(' ')}"></div></div>`;
  }).join(''));
  // check-in status against TODAY's DUE items. No items due today (empty list OR nothing
  // scheduled) → the button is a manual "studied today" toggle so a streak can still be
  // kept; with due items → auto check-in when all done, button is status only.
  const due=jpDueToday();
  const doneN=due.filter(i=>i.d).length,dueN=due.length;
  const ci=S.jp.log[TODAY],btn=document.getElementById('ci-btn');
  if(dueN===0){
    setText(btn, ci ? '✓ 今日已打卡 · 点此取消' : '点此打卡 · 标记今日已学日文');
    btn.onclick = jpCheckInToday;
    btn.style.pointerEvents='auto'; btn.style.cursor='pointer';   // v7.27.7: manual check-in must stay tappable
    setClass(btn,'jp-ci-tappable',true);
  } else {
    setText(btn, ci ? '— 今日已完成 —' : `今日 ${doneN}/${dueN} · 全清自动打卡`);
    btn.onclick = null;
    btn.style.pointerEvents='none'; btn.style.cursor='';
    setClass(btn,'jp-ci-tappable',false);
  }
  setClass(btn,'done',!!ci);
  const ne=document.getElementById('jp-note');if(ne&&document.activeElement!==ne)ne.value=S.jp.note||'';
  const cl=document.getElementById('jp-checklist');
  reconcileList(cl, S.jp.list, {
    key:i=>i.id,
    create:i=>{ const d=document.createElement('div'); d.dataset.id=i.id; return d; },
    update:(d,i)=>{
      if(editingJP===i.id){
        setAttr(d,'class','');
        setAttr(d,'style','padding:5px 0;border-bottom:.5px solid var(--hair);');
        setHTML(d, jpEditInner(i));
        return;
      }
      const repBadge=(i.repeat&&i.repeat!=='daily')?`<span class="ac-bell">↻ ${repeatLabel(i.repeat,i.customDays)}</span>`:'';
      if(!jpItemDueOn(i,TODAY)){
        setAttr(d,'class','row');
        setAttr(d,'style','opacity:.42;');
        setHTML(d, jpNotDueInner(i,repBadge));
        return;
      }
      setAttr(d,'class','row'+(i.d?' item-done':''));
      setAttr(d,'style',null);
      setHTML(d, jpDueInner(i,repBadge));
    }
  });
  attachRipples(cl);   // 只在调和容器内补涟漪;全文档扫描由 renderAll 末尾统一做
  makeSortable(cl, { itemSelector:'.row', handleSelector:'.drag-handle', onReorder:onReorderJP });
}
function onReorderJP(ids){
  S.jp.list = reorderById(S.jp.list, ids);
  saveJP();rJP();
}
