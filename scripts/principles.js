/* 信条与原则 (Creed & Principles) — the constitution as a daily mechanism.
   宣读 read   — auto-opens once per day on the first entry (after initial pull):
                 creed on top, numbered principles below, closed by the daily oath.
   核查 review — after 21:00 the first open/refocus prompts it once; per-principle
                 守/破/无 + 需修订 flag + one line for the day; saved per date.
   修订 edit   — in-app CRUD + drag reorder. 低谷日不修宪: edit is mechanism-locked
                 while a low day is active (lowdayBlocked); read & review stay open.
   Items live in S.principles.items (synced via replaceTable), reviews in
   S.principles.daily[date] (user_id+date upsert). Auto-show markers are synced
   settings columns mirrored to LS: principles_last_shown / principles_review_prompted. */

let prMode = 'read';            // 'read' | 'review' | 'edit'
let editingPR = null;           // item id being inline-edited
let prAddOpen = null;           // 'creed' | 'principle' | null — which add form is open
let prDraft = null;             // review draft {checks,revise,note}; committed by prSaveReview
let prDraftDate = null;         // date the draft belongs to

/* ── selectors ── */
function prItems(kind){
  return (S.principles.items || []).filter(i => i.kind === kind && i.active !== false)
    .sort((a,b) => (a.position||0) - (b.position||0));
}
function prHasItems(){ return (S.principles.items || []).some(i => i.active !== false); }
function prSavedReview(){ return S.principles.daily[TODAY] || { checks:{}, revise:{}, note:'' }; }
function prReviewDoneToday(){
  const d = S.principles.daily[TODAY];
  return !!(d && (Object.keys(d.checks||{}).length || (d.note||'').trim()));
}
function prEnsureDraft(){
  if(prDraft && prDraftDate === TODAY) return;
  const saved = prSavedReview();
  prDraft = { checks:{...(saved.checks||{})}, revise:{...(saved.revise||{})}, note:saved.note||'' };
  prDraftDate = TODAY;
}

/* ── open / close / oath ── */
function principlesShowModal(auto, mode){
  let m = document.getElementById('principles-modal');
  if(!m){
    m = document.createElement('div');
    m.id = 'principles-modal'; m.className = 'principles-modal';
    m.setAttribute('aria-hidden','true');
    document.body.appendChild(m);
  }
  prMode = mode || 'read';
  if(prMode === 'review') prEnsureDraft();
  editingPR = null; prAddOpen = null;
  rPrinciplesModal(true);
  requestAnimationFrame(()=>{ m.classList.add('open'); m.setAttribute('aria-hidden','false'); });
  // the gesture gate keeps the load-time auto-show silent by itself
  if(window.Sfx && typeof Sfx.tab === 'function') Sfx.tab();
}
function principlesCloseModal(silent){
  const m = document.getElementById('principles-modal');
  if(!m || !m.classList.contains('open')) return;
  m.classList.remove('open'); m.setAttribute('aria-hidden','true');
  if(!silent && window.Sfx && typeof Sfx.close === 'function') Sfx.close();
}
/* the daily oath — manual reads also count as today's 宣读 */
function principlesOath(){
  saveLS('principles_last_shown', TODAY);
  principlesCloseModal(true);
  if(window.Sfx && typeof Sfx.save === 'function') Sfx.save();
}

/* ── auto-show ── */
function prModalBlocked(){
  const lm = document.getElementById('lowday-modal');
  if(lm && lm.classList.contains('open')) return true;     // the low-day protocol keeps priority
  const m = document.getElementById('principles-modal');
  return !!(m && m.classList.contains('open'));
}
/* morning 宣读 — called exactly once per page load, after the initial pull
   (offline loads never auto-show: the synced marker can't be trusted yet) */
function principlesAutoShow(){
  if(typeof initialPullDone !== 'undefined' && !initialPullDone) return;
  if(prHasItems() && loadLS('principles_last_shown', null) !== TODAY && !prModalBlocked()){
    saveLS('principles_last_shown', TODAY);   // stamp FIRST — backdrop-close still counts
    if(new Date().getHours() >= 21 && prItems('principle').length && !prReviewDoneToday()){
      // late first open: the review (creed recap on top) IS the reading
      saveLS('principles_review_prompted', TODAY);
      principlesShowModal(true, 'review');
      return;
    }
    principlesShowModal(true, 'read');
    return;
  }
  principlesEveningAutoShow();
}
/* evening 核查 — also called from rehydrateOnFocus, so a 21:00+ return to the
   app prompts the review once even if the page was loaded in the morning */
function principlesEveningAutoShow(){
  if(typeof initialPullDone !== 'undefined' && !initialPullDone) return;
  if(new Date().getHours() < 21) return;
  if(!prItems('principle').length) return;
  if(loadLS('principles_review_prompted', null) === TODAY) return;
  if(prReviewDoneToday()){ saveLS('principles_review_prompted', TODAY); return; }  // done elsewhere — stay quiet
  if(prModalBlocked()) return;
  saveLS('principles_review_prompted', TODAY);
  principlesShowModal(true, 'review');
}

/* ── render ── */
function rPrinciplesModal(force){
  const m = document.getElementById('principles-modal');
  if(!m) return;
  if(!force && !m.classList.contains('open')) return;
  // realtime echoes must not clobber in-progress typing
  const ae = document.activeElement;
  if(!force && ae && m.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) return;
  const tabs = [['read','宣读'],['review','核查'],['edit','修订']]
    .map(([k,l]) => `<button class="pr-mode-btn ${prMode===k?'active':''}" onclick="principlesSetMode('${k}')">${l}</button>`).join('');
  let body;
  if(prMode === 'review') body = prReviewHtml();
  else if(prMode === 'edit') body = prEditHtml();
  else body = prReadHtml();
  m.innerHTML = `<div class="principles-modal-back" onclick="principlesCloseModal()"></div>
    <div class="principles-card">
      <div class="sys-corner tl"></div><div class="sys-corner tr"></div><div class="sys-corner bl"></div><div class="sys-corner br"></div>
      <div class="pr-kicker">[ 信条与原则 · CREED &amp; PRINCIPLES ]</div>
      <div class="pr-head"><div class="pr-modes">${tabs}</div><button class="pr-x" onclick="principlesCloseModal()" aria-label="关闭">×</button></div>
      <div id="pr-body">${body}</div>
    </div>`;
  if(prMode === 'edit' && typeof makeSortable === 'function'){
    const cl = document.getElementById('pr-list-creed');
    const pl = document.getElementById('pr-list-principle');
    if(cl) makeSortable(cl, { itemSelector:'.row', handleSelector:'.drag-handle', onReorder:(ids)=>onReorderPrinciples('creed', ids) });
    if(pl) makeSortable(pl, { itemSelector:'.row', handleSelector:'.drag-handle', onReorder:(ids)=>onReorderPrinciples('principle', ids) });
  }
}

function prReadHtml(){
  const creeds = prItems('creed'), prins = prItems('principle');
  if(!creeds.length && !prins.length){
    return `<div class="pr-empty">宪法尚未立字。<br>第一条信条，从「修订」开始。</div>
      <button class="pr-oath-btn" onclick="principlesSetMode('edit')">去立宪 →</button>`;
  }
  const cHtml = creeds.length ? `<div class="pr-creed-block">${creeds.map(c =>
    `<div class="pr-creed-item">${escH(c.text)}${c.why?`<div class="pr-creed-why">${escH(c.why)}</div>`:''}</div>`).join('')}</div>` : '';
  const pHtml = prins.length ? `${creeds.length?'<div class="pr-divider"></div>':''}<div class="pr-items">${prins.map((p,i) =>
    `<div class="pr-item"><span class="pr-n">${i+1}</span><div><div class="pr-t">${escH(p.text)}</div>${p.why?`<div class="pr-why">${escH(p.why)}</div>`:''}</div></div>`).join('')}</div>` : '';
  return cHtml + pHtml + `<button class="pr-oath-btn" onclick="principlesOath()">今日依此行动 →</button>`;
}

function prReviewHtml(){
  prEnsureDraft();
  const creeds = prItems('creed'), prins = prItems('principle');
  const recap = creeds.length ? `<div class="pr-review-creed">${creeds.map(c=>escH(c.text)).join('<br>')}</div><div class="pr-divider"></div>` : '';
  if(!prins.length){
    return recap + `<div class="pr-review-empty">还没有原则可核查——先去「修订」立下第一条。</div>`;
  }
  const rows = prins.map(p => {
    const v = prDraft.checks[p.id] || '';
    const seg = [['kept','守'],['broke','破'],['na','无']].map(([k,l]) =>
      `<button class="pr-seg-btn ${k} ${v===k?'sel':''}" onclick="prSetCheck('${p.id}','${k}')">${l}</button>`).join('');
    return `<div class="pr-review-row">
      <div class="pr-review-text">${escH(p.text)}</div>
      <div class="pr-review-ctl"><span class="pr-seg">${seg}</span>
        <button class="pr-rev-flag ${prDraft.revise[p.id]?'on':''}" onclick="prToggleRevise('${p.id}')" title="标记需修订">修</button>
      </div></div>`;
  }).join('');
  return recap + `<div class="pr-review-rows">${rows}</div>
    <textarea id="pr-note" class="pr-note" placeholder="今日一句 · 哪条被执行了、哪条被违反了、为什么…" oninput="prOnNote()">${escH(prDraft.note||'')}</textarea>
    <button class="pr-save-btn" onclick="prSaveReview()">记录今日核查</button>`;
}

/* ── review handlers (draft-only until saved) ── */
function prSetCheck(id, val){
  prEnsureDraft();
  if(prDraft.checks[id] === val){ delete prDraft.checks[id]; if(window.Sfx) Sfx.untick(); }
  else { prDraft.checks[id] = val; if(window.Sfx) Sfx.tick(); }
  rPrinciplesModal(true);
}
function prToggleRevise(id){
  prEnsureDraft();
  if(prDraft.revise[id]){ delete prDraft.revise[id]; if(window.Sfx) Sfx.untick(); }
  else { prDraft.revise[id] = true; if(window.Sfx) Sfx.tick(); }
  rPrinciplesModal(true);
}
function prOnNote(){
  const el = document.getElementById('pr-note');
  if(el){ prEnsureDraft(); prDraft.note = el.value; }
}
function prSaveReview(){
  prEnsureDraft();
  const note = document.getElementById('pr-note');
  if(note) prDraft.note = note.value;
  S.principles.daily[TODAY] = { checks:{...prDraft.checks}, revise:{...prDraft.revise}, note:prDraft.note||'' };
  savePrinciplesDaily();
  if(typeof sysToast === 'function') sysToast('[ 系统 ] 晚间核查已记录', {silent:true});
  if(window.Sfx && typeof Sfx.save === 'function') Sfx.save();
  if(typeof rpgAfterChange === 'function') rpgAfterChange();
  rPrinciplesModal(true);
}

/* ── edit mode (修订) — japanese.js archetype; 低谷日不修宪 on every mutator ── */
function prEditGuard(){
  if(typeof isLowDayActive === 'function' && isLowDayActive()){
    if(typeof lowdayBlocked === 'function') lowdayBlocked('原则修订');
    return true;
  }
  return false;
}
function principlesSetMode(m){
  if(m === 'edit' && prEditGuard()) return;
  prMode = m;
  if(m === 'review') prEnsureDraft();
  editingPR = null; prAddOpen = null;
  rPrinciplesModal(true);
  if(window.Sfx && typeof Sfx.tab === 'function') Sfx.tab();
}
function prEditHtml(){
  return prEditSection('creed', '信条 · CREED') + prEditSection('principle', '原则 · PRINCIPLES');
}
function prEditSection(kind, title){
  const items = prItems(kind);
  const addForm = prAddOpen === kind ? `
    <div class="pr-add-form">
      <input id="pr-new-text" placeholder="${kind==='creed'?'信条原文…':'【触发】→【规则】…'}">
      <input id="pr-new-why" placeholder="为什么（可空）">
      <div class="pr-add-form-btns">
        <button class="ghost fx-btn" onclick="prToggleAddForm(null)">×</button>
        <button class="primary fx-btn" onclick="prAddItem('${kind}')">添加</button>
      </div>
    </div>` : '';
  const rows = items.map(i => {
    if(editingPR === i.id){
      return `<div style="padding:5px 0;border-bottom:.5px solid var(--hair);"><div class="edit-box" style="padding:6px;">
        <input id="pr-e-text" value="${escH(i.text)}">
        <input id="pr-e-why" value="${escH(i.why||'')}" placeholder="为什么（可空）">
        <div class="pr-add-form-btns">
          <button class="ghost fx-btn" onclick="prCancelEdit()">×</button>
          <button class="primary fx-btn" onclick="prSaveEdit('${i.id}')">保存</button>
        </div>
      </div></div>`;
    }
    return `<div class="row" data-id="${i.id}">
      <span class="drag-handle" onclick="event.stopPropagation()" aria-label="拖动排序">⠿</span>
      <div class="row-body"><span class="item-text">${escH(i.text)}</span>${i.why?`<div class="pr-edit-why">${escH(i.why)}</div>`:''}</div>
      <div class="row-actions">
        <button class="row-btn" onclick="prStartEdit('${i.id}')">编辑</button>
        <button class="row-btn" onclick="prDelItem('${i.id}')">×</button>
      </div>
    </div>`;
  }).join('');
  return `<div class="pr-edit-sec">
    <div class="pr-edit-sec-head"><span class="pr-edit-sec-title">${title}</span><button class="pr-add-link" onclick="prToggleAddForm('${kind}')">+ 添加</button></div>
    ${addForm}
    <div id="pr-list-${kind}">${rows}</div>
  </div>`;
}
function prToggleAddForm(kind){
  if(kind && prEditGuard()) return;
  prAddOpen = (prAddOpen === kind) ? null : kind;
  rPrinciplesModal(true);
}
function prAddItem(kind){
  if(prEditGuard()) return;
  const t = document.getElementById('pr-new-text');
  const w = document.getElementById('pr-new-why');
  const text = t ? t.value.trim() : '';
  if(!text) return;
  const pos = prItems(kind).reduce((mx,i)=>Math.max(mx, i.position||0), -1) + 1;
  S.principles.items.push({ id:crypto.randomUUID(), kind, text, why:(w?w.value.trim():''), position:pos, active:true });
  prAddOpen = null;
  savePrinciples();
  rPrinciplesModal(true);
  if(window.Sfx) Sfx.tick();
}
function prStartEdit(id){ if(prEditGuard()) return; editingPR = id; rPrinciplesModal(true); }
function prCancelEdit(){ editingPR = null; rPrinciplesModal(true); }
function prSaveEdit(id){
  if(prEditGuard()) return;
  const i = S.principles.items.find(x=>x.id===id); if(!i) return;
  const t = document.getElementById('pr-e-text');
  const w = document.getElementById('pr-e-why');
  const text = t ? t.value.trim() : '';
  if(!text) return;
  i.text = text; i.why = w ? w.value.trim() : '';
  editingPR = null;
  savePrinciples();
  rPrinciplesModal(true);
  if(window.Sfx) Sfx.tick();
}
function prDelItem(id){
  if(prEditGuard()) return;
  if(editingPR === id) editingPR = null;
  S.principles.items = S.principles.items.filter(x=>x.id!==id);
  savePrinciples();
  rPrinciplesModal(true);
  if(window.Sfx) Sfx.untick();
}
function onReorderPrinciples(kind, ids){
  if(prEditGuard()){ rPrinciplesModal(true); return; }
  ids.forEach((id, idx) => {
    const it = S.principles.items.find(x=>x.id===id);
    if(it) it.position = idx;
  });
  savePrinciples();
  rPrinciplesModal(true);
}

/* ── init: the old THE CREED row becomes the manual entrance ── */
function initPrinciples(){
  const t = document.getElementById('creed-trigger');
  if(t) t.addEventListener('click', () => principlesShowModal(false));
}
