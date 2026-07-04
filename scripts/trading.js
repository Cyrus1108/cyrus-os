/* Trading desk — daily checklist + bias notes + 盘前封条 (sessions render in app.js tick).
   盘前封条 = commitment lock: seal the day's bias+checklist (印章 + quest 音), then they
   turn read-only until 破封 (which leaves a trace). Resets daily (app.js rollover). */
let trOpen=false;
function toggleTRForm(){ if(S.tr.sealed) return; trOpen=!trOpen;document.getElementById('tr-new-form').style.display=trOpen?'block':'none';}
function addTRItem(){if(S.tr.sealed)return;const t=document.getElementById('tr-new-text').value.trim();if(!t)return;S.tr.list.push({id:'t'+Date.now(),t,d:false});document.getElementById('tr-new-text').value='';trOpen=false;document.getElementById('tr-new-form').style.display='none';saveTR();rTR();rMetrics();}
function toggleTR(id){if(S.tr.sealed)return;const i=S.tr.list.find(i=>i.id===id);if(i){i.d=!i.d;if(window.Sfx){i.d?Sfx.tick():Sfx.untick();}}saveTR();rTR();rMetrics();if(typeof rpgAfterChange==='function')rpgAfterChange();}
function delTR(id){if(S.tr.sealed)return;if(editingTR===id)editingTR=null;S.tr.list=S.tr.list.filter(i=>i.id!==id);saveTR();rTR();}
function startTREdit(id){if(S.tr.sealed)return;editingTR=id;rTR();}
function cancelTREdit(){editingTR=null;rTR();}
function saveTREdit(id){if(S.tr.sealed)return;const i=S.tr.list.find(i=>i.id===id);if(!i)return;const t=document.getElementById('et-text').value.trim();if(!t)return;i.t=t;editingTR=null;saveTR();rTR();}

/* the checklist item that represents "今日已记录交易偏向" — DEF_TR id t6, fall back to text */
function trBiasItem(){ return S.tr.list.find(i=>i.id==='t6') || S.tr.list.find(i=>i.t==='记录今日交易偏向'); }
let bT;
function onBias(){
  if(S.tr.sealed) return;                                   // bias is read-only once sealed
  const wasEmpty = !((S.tr.bias||'').trim().length>0);      // emptiness BEFORE this input
  S.tr.bias=document.getElementById('t-bias').value.trim();  // persist trimmed: whitespace-only ≠ content
  // typing a bias auto-checks the「记录今日交易偏向」item; clearing it un-checks.
  // Only flip on the empty<->non-empty TRANSITION so a deliberate manual uncheck while text is present is respected.
  const it=trBiasItem();
  let changed=false;
  if(it){ const nowEmpty = !(S.tr.bias.length>0); if(nowEmpty!==wasEmpty){ it.d=!nowEmpty; changed=true; } }
  clearTimeout(bT);bT=setTimeout(saveTR,600);
  if(changed){ rTR(); rMetrics(); }
}

/* ── 盘前封条 ── */
function trSeal(){
  if(S.tr.sealed) return;
  S.tr.sealed=true; S.tr.sealedAt=Date.now();
  if(window.Sfx) Sfx.quest();                               // manual once-a-day action — no latch needed
  saveTR(); rTR();
}
function trBreak(){
  if(!S.tr.sealed) return;
  if(!confirm('破封？今日已封存的盘前承诺将解锁，并留下「已破封」记录。')) return;
  S.tr.sealed=false; S.tr.broke=true;
  if(window.Sfx) Sfx.untick();
  saveTR(); rTR();
}
function rTRSeal(){
  const bar=document.getElementById('tr-seal-bar'); if(!bar) return;
  if(S.tr.sealed){
    const tm=S.tr.sealedAt?new Date(S.tr.sealedAt):null;
    const tstr=tm?`${String(tm.getHours()).padStart(2,'0')}:${String(tm.getMinutes()).padStart(2,'0')}`:'';
    setHTML(bar, `<div class="tr-seal" role="status">
        <div class="tr-seal-stamp">封</div>
        <div class="tr-seal-meta"><div class="tr-seal-title">盘前已封存</div><div class="tr-seal-sub">${tstr} · 今日承诺已锁定</div></div>
        <button class="tr-break-btn fx-btn" onclick="trBreak()">破封</button>
      </div>`);
  } else {
    setHTML(bar, `<button class="tr-seal-btn fx-btn" onclick="trSeal()">🔒 盘前封存</button>${S.tr.broke?'<span class="tr-broke-badge">今日已破封</span>':''}`);
  }
}
function trEditInner(i){
  return `<div class="edit-box" style="flex-direction:row;padding:6px;align-items:center;">
        <input id="et-text" value="${escH(i.t)}" style="flex:1;">
        <button class="primary fx-btn" onclick="saveTREdit('${i.id}')">保存</button>
        <button class="ghost fx-btn" onclick="cancelTREdit()">×</button>
      </div>`;
}
function trSealedInner(i){
  return `<input type="checkbox" class="row-cb" ${i.d?'checked':''} disabled>
        <div class="row-body"><span class="item-text">${escH(i.t)}</span></div>`;
}
function trRowInner(i){
  return `<span class="drag-handle" onclick="event.stopPropagation()" aria-label="拖动排序">⠿</span>
      <input type="checkbox" class="row-cb" ${i.d?'checked':''} onchange="toggleTR('${i.id}')">
      <div class="row-body"><span class="item-text">${escH(i.t)}</span></div>
      <div class="row-actions">
        <button class="row-btn" onclick="startTREdit('${i.id}')">编辑</button>
        <button class="row-btn" onclick="delTR('${i.id}')">×</button>
      </div>`;
}

function rTR(){
  const sealed=!!S.tr.sealed;
  const el=document.getElementById('tr-list');
  reconcileList(el, S.tr.list, {
    key:i=>i.id,
    create:i=>{ const d=document.createElement('div'); d.dataset.id=i.id; return d; },
    update:(d,i)=>{
      if(editingTR===i.id && !sealed){
        setAttr(d,'class','');
        setAttr(d,'style','padding:5px 0;border-bottom:.5px solid var(--hair);');
        setHTML(d, trEditInner(i));
        return;
      }
      setAttr(d,'class','row'+(i.d?' item-done':''));
      setAttr(d,'style',null);
      setHTML(d, sealed ? trSealedInner(i) : trRowInner(i));
    }
  });
  const be=document.getElementById('t-bias');
  if(be){ be.readOnly=sealed; if(document.activeElement!==be) be.value=S.tr.bias||''; }
  const ab=document.getElementById('tr-add-btn'); if(ab) ab.style.display=sealed?'none':'';
  if(sealed){ const f=document.getElementById('tr-new-form'); if(f) f.style.display='none'; trOpen=false; }
  rTRSeal();
  attachRipples();
  if(!sealed) makeSortable(el, { itemSelector:'.row', handleSelector:'.drag-handle', onReorder:onReorderTR });
}
function onReorderTR(ids){
  S.tr.list = reorderById(S.tr.list, ids);
  saveTR();rTR();
}
