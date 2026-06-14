/* Morning ritual — 身心灵 checklist + 完成态 (Fully-ready screen) */
let _mrQuestDate = null;   // SFX latch: all-done fanfare at most once per day

/* a short identity phrase, randomized per day (date-seeded → stable all day) */
const MR_READY_PHRASES = [
  'Sharp. Calm. Ready.',
  'The blade is drawn.',
  'Composed and Dangerous',
  'Locked In.',
  'Eyes Open. Mind Clear.',
  'Effortless. Inevitable.',
  'Light Heart. Heavy Presence.',
];
function mrReadyPhrase(){
  let h = 0; for(const c of TODAY) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return MR_READY_PHRASES[h % MR_READY_PHRASES.length];
}

function rMR(){
  // a detail pill is lifted out of #mr-list (FLIP); rebuilding the list now would
  // orphan its placeholder and strand the pill. Skip until the detail closes.
  if(_mrDetailId) return;
  if(typeof cleanMorning === 'function' && cleanMorning()) saveMR();   // normalize post-pull too
  const list=S.mr.list,done=list.filter(i=>i.d).length;
  const pct=Math.round(done/list.length*100);
  const remMins=list.filter(i=>!i.d).reduce((a,i)=>a+i.mins,0);
  document.getElementById('mr-bar').style.width=pct+'%';
  document.getElementById('mr-count').innerHTML=`${done}<span style="color:var(--brass-ghost);"> / ${list.length}</span>`;
  document.getElementById('mr-time').textContent=done===list.length?'All complete':`~ ${remMins} min remaining`;
  document.getElementById('mr-list').innerHTML=list.map(i=>`
    <div class="mr-pill ${i.d?'done':''}${i.detail&&i.detail.trim()?' has-detail':''}" data-id="${i.id}" onclick="toggleMR('${i.id}', event)">
      <span class="drag-handle" onclick="event.stopPropagation()" aria-label="拖动排序">⠿</span>
      <span class="mr-pill-name">${escH(i.t)}</span>
      <span class="mr-pill-time">${i.mins}m</span>
      <span class="mr-pill-expand" onclick="event.stopPropagation();mrExpand('${i.id}')" aria-label="详情">⌄</span>
    </div>`).join('');
  makeSortable(document.getElementById('mr-list'), { itemSelector:'.mr-pill', handleSelector:'.drag-handle', onReorder:onReorderMR });
  rMRReady(done === list.length && list.length > 0);
}

/* 完成态: a glass veil over the panel + a random phrase that flickers in,
   with a brass line sweeping left→phrase, then phrase→right (the text breaks
   the line, never crossed). Animates once on entering complete; stays static
   while complete; clears the instant a pill is un-done. */
let _mrReadyDismissed = null;   // date the user tapped the ready screen away
function rMRReady(allDone){
  const host = document.getElementById('mr-ready');
  if(!host) return;
  if(!allDone){ host.classList.remove('show'); host.innerHTML = ''; _mrReadyDismissed = null; return; }
  if(_mrReadyDismissed === TODAY || host.classList.contains('show')) return;   // dismissed / already up
  host.innerHTML = `<div class="mr-ready-inner">
    <span class="mr-ready-line mr-ready-line-l"></span>
    <span class="mr-ready-phrase">${escH(mrReadyPhrase())}</span>
    <span class="mr-ready-line mr-ready-line-r"></span>
  </div>`;
  host.classList.add('show');
  const phraseEl = host.querySelector('.mr-ready-phrase');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(phraseEl && window.gsap && typeof SplitText !== 'undefined' && typeof glassFlicker === 'function' && !reduce){
    try{
      const sp = new SplitText(phraseEl, { type:'chars' });
      glassFlicker(sp.chars, 0.25, 0.7);
      gsap.delayedCall(2.6, () => { try{ sp.revert(); }catch(e){} });
    }catch(e){}
  }
}
/* tap the veil to drop back to the checklist (lets you un-tick an item).
   Stays dismissed for the rest of the day unless you break completion. */
function mrDismissReady(){
  const host = document.getElementById('mr-ready');
  if(!host || !host.classList.contains('show')) return;
  host.classList.remove('show');
  _mrReadyDismissed = TODAY;
  setTimeout(() => { if(_mrReadyDismissed === TODAY) host.innerHTML = ''; }, 550);
  if(window.Sfx) Sfx.tab();
}
function onReorderMR(ids){
  S.mr.list = reorderById(S.mr.list, ids);
  saveMR();rMR();
}

/* 项目详情 — tap ⌄ to LIFT the pill from its slot to the center (View
   Transitions / FLIP, same language as the panel Focus Spaces), where it shows
   this step's notes READ-ONLY (expand is usually just to look). Tap 编辑 to
   write; exit via backdrop / Esc → it flies back to its slot. Notes persist in
   the item's `detail` (morning.list jsonb; daily reset clears only `d`). */
let _mrDetailId = null, _mrDetailPh = null, _mrDetailT = null;
const MR_PEN_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

function mrDetailInner(i){
  const has = i.detail && i.detail.trim();
  return `<div class="mr-pill-detail-body">${has ? escH(i.detail) : '<span class="mr-pill-detail-empty">还没有备注 · 点 ✎ 写</span>'}</div>`;
}
function mrExpand(id){
  if(_mrDetailId) return;
  const i = S.mr.list.find(x => x.id === id); if(!i) return;
  const pill = document.querySelector(`.mr-pill[data-id="${id}"]`); if(!pill) return;
  _mrDetailId = id;
  let bd = document.getElementById('mr-detail-bd');
  if(!bd){ bd = document.createElement('div'); bd.id = 'mr-detail-bd'; bd.className = 'mr-detail-bd'; bd.addEventListener('click', mrCloseDetail); document.body.appendChild(bd); }
  const ph = document.createElement('div'); ph.className = 'mr-pill-ph'; ph.style.height = pill.offsetHeight + 'px';
  _mrDetailPh = ph;
  // NO pageDepth here: the page-wrapper transform would skew the View
  // Transitions slot measurement on close (the same hazard the panel Focus
  // Spaces hits) — the backdrop already covers the page.
  const mutate = () => {
    pill.parentNode.insertBefore(ph, pill);
    document.body.appendChild(pill);
    pill.classList.add('mr-pill-expanded');
    pill.setAttribute('data-lenis-prevent', '');
    pill.insertAdjacentHTML('beforeend', `<button class="mr-pen" onclick="event.stopPropagation();mrEditDetail()" aria-label="编辑/查看">${MR_PEN_SVG}</button><div class="mr-pill-detail">${mrDetailInner(i)}</div>`);
    document.body.classList.add('mr-detail-open');
  };
  if(document.startViewTransition){
    pill.style.viewTransitionName = 'mr-fly';
    document.startViewTransition(mutate).finished.finally(() => { pill.style.viewTransitionName = ''; });
  } else {
    const first = pill.getBoundingClientRect();
    mutate();
    const last = pill.getBoundingClientRect();
    if(window.gsap) gsap.fromTo(pill,
      { x:first.left-last.left, y:first.top-last.top, scaleX:first.width/last.width, scaleY:first.height/last.height, transformOrigin:'0 0' },
      { x:0, y:0, scaleX:1, scaleY:1, duration:0.6, ease:'power3.inOut', onComplete:()=>gsap.set(pill,{clearProps:'transform'}) });
  }
  if(window.Sfx) Sfx.tab();
}
/* the ✎ pen toggles edit ↔ read */
function mrEditDetail(){
  const pill = document.querySelector('.mr-pill-expanded'); if(!pill || !_mrDetailId) return;
  const i = S.mr.list.find(x => x.id === _mrDetailId); if(!i) return;
  const d = pill.querySelector('.mr-pill-detail'); if(!d) return;
  const pen = pill.querySelector('.mr-pen');
  if(d.querySelector('.mr-detail-text')){           // editing → commit, back to read
    clearTimeout(_mrDetailT); saveMR();
    d.innerHTML = mrDetailInner(i);
    if(pen) pen.classList.remove('active');
    return;
  }
  d.innerHTML = `<textarea class="mr-detail-text" placeholder="这一项怎么做、要点、提醒…" oninput="mrSaveDetail()">${escH(i.detail || '')}</textarea>`;
  const ta = d.querySelector('textarea'); if(ta){ ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  if(pen) pen.classList.add('active');
}
function mrSaveDetail(){
  const pill = document.querySelector('.mr-pill-expanded'); if(!pill) return;
  const ta = pill.querySelector('.mr-detail-text'); if(!ta) return;
  const i = S.mr.list.find(x => x.id === _mrDetailId); if(!i) return;
  i.detail = ta.value;
  clearTimeout(_mrDetailT); _mrDetailT = setTimeout(saveMR, 600);
}
function mrCloseDetail(){
  if(!_mrDetailId) return;
  const pill = document.querySelector('.mr-pill-expanded');
  const ph = _mrDetailPh;
  const idCap = _mrDetailId;
  clearTimeout(_mrDetailT); saveMR();
  // finish keeps the SAME pill element (no rMR rebuild — that destroyed the
  // view-transition-name'd node and broke the pairing → the instant snap).
  const finish = () => {
    if(pill){
      pill.classList.remove('mr-pill-expanded');
      pill.removeAttribute('data-lenis-prevent');
      const pen = pill.querySelector('.mr-pen'); if(pen) pen.remove();
      const d = pill.querySelector('.mr-pill-detail'); if(d) d.remove();
      const it = S.mr.list.find(x => x.id === idCap);
      pill.classList.toggle('has-detail', !!(it && it.detail && it.detail.trim()));
      if(ph && ph.parentNode){ ph.parentNode.insertBefore(pill, ph); ph.remove(); }
    }
    document.body.classList.remove('mr-detail-open');
    _mrDetailId = null; _mrDetailPh = null;
  };
  if(document.startViewTransition && pill){
    pill.style.viewTransitionName = 'mr-fly';
    document.startViewTransition(finish).finished.finally(() => { if(pill) pill.style.viewTransitionName = ''; });
  } else if(pill && window.gsap && ph){
    const cur = pill.getBoundingClientRect(); const tgt = ph.getBoundingClientRect();
    gsap.to(pill, { x:tgt.left-cur.left, y:tgt.top-cur.top, scaleX:tgt.width/cur.width, scaleY:tgt.height/cur.height, transformOrigin:'0 0', duration:0.55, ease:'power3.inOut', onComplete:()=>{ gsap.set(pill,{clearProps:'transform'}); finish(); } });
  } else { finish(); }
  if(window.Sfx) Sfx.close();
}
document.addEventListener('keydown', e => { if(e.key === 'Escape' && _mrDetailId) mrCloseDetail(); });

function toggleMR(id,event){
  if(_mrDetailId) return;   // a pill is expanded — its taps aren't toggles
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
