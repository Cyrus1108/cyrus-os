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

/* 项目详情 — tap a pill's ⌄ to float a card to the center that unrolls like a
   blind (clip-path top→down); a textarea inside holds free-form notes for that
   step (how to do it / cues / reminders), auto-saved into the item's `detail`
   (persisted in morning.list jsonb; daily reset only clears `d`, never detail). */
let _mrDetailT = null;
function mrExpand(id){
  const i = S.mr.list.find(x => x.id === id); if(!i) return;
  let m = document.getElementById('mr-detail-modal');
  if(!m){
    m = document.createElement('div'); m.id = 'mr-detail-modal'; m.className = 'mr-detail-modal';
    m.setAttribute('data-lenis-prevent','');
    m.addEventListener('click', e => { if(e.target === m) mrCloseDetail(); });
    document.body.appendChild(m);
  }
  m.dataset.id = id;
  m.innerHTML = `<div class="mr-detail-card">
    <div class="sys-corner tl"></div><div class="sys-corner tr"></div><div class="sys-corner bl"></div><div class="sys-corner br"></div>
    <div class="mr-detail-kicker">[ 晨间 · ${escH(i.t)} ]</div>
    <div class="mr-detail-meta">${i.mins} 分钟</div>
    <textarea class="mr-detail-text" placeholder="这一项具体怎么做、要点、提醒…（自动保存）" oninput="mrSaveDetail('${id}')">${escH(i.detail || '')}</textarea>
    <button class="mr-detail-done" onclick="mrCloseDetail()">完成 →</button>
  </div>`;
  requestAnimationFrame(() => m.classList.add('open'));
  if(typeof pageDepth === 'function') pageDepth(true);
  if(window.Sfx) Sfx.tab();
  setTimeout(() => { const ta = m.querySelector('.mr-detail-text'); if(ta) ta.focus(); }, 380);
}
function mrSaveDetail(id){
  const m = document.getElementById('mr-detail-modal'); if(!m) return;
  const ta = m.querySelector('.mr-detail-text'); if(!ta) return;
  const i = S.mr.list.find(x => x.id === id); if(!i) return;
  i.detail = ta.value;
  clearTimeout(_mrDetailT); _mrDetailT = setTimeout(saveMR, 600);
}
function mrCloseDetail(){
  const m = document.getElementById('mr-detail-modal'); if(!m || !m.classList.contains('open')) return;
  m.classList.remove('open');
  if(typeof pageDepth === 'function') pageDepth(false);
  clearTimeout(_mrDetailT); saveMR();        // flush any pending edit
  if(typeof rMR === 'function') rMR();        // refresh has-detail dot
  if(window.Sfx) Sfx.close();
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
