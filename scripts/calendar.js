/* ════════════ 专属日历 · Calendar HUD ════════════
   Full-screen HUD (clones the Finance/Fitness shell — glass.js wraps #calendar-view
   into .sys-window.cal-hud). Month grid + selected-day detail:
   · 行程 (cal_events) — editable, owned by this module (archetype C list)
   · 当日事项 — read-only aggregation of dated todos + academics, tap to jump back
   Open/close mirror finance.js exactly (fade + scroll-unfurl in cappa; instant in
   sterile/reduced-motion where no .sys-window wrapper exists). */
const calUI = { open:false, ym:TODAY.slice(0,7), sel:TODAY, editId:null };
let _calCloseT = null;
const CAL_WD = ['日','一','二','三','四','五','六'];

/* ── open / close / routing (clone of finance.js:247-294) ── */
function calOnHash(){
  if(location.hash==='#calendar'){ if(!calUI.open) openCalendar(true); }
  else if(calUI.open){ closeCalendar(true); }
}
function openCalendar(fromHash){
  const v = document.getElementById('calendar-view'); if(!v) return;
  clearTimeout(_calCloseT); v.classList.remove('cal-closing');   // cancel an in-flight furl
  calUI.open = true;
  calUI.sel = calUI.sel || TODAY;
  calUI.ym = (calUI.sel || TODAY).slice(0,7);
  v.classList.add('open');
  v.setAttribute('aria-hidden','false');
  document.body.classList.add('cal-locked');
  if(window.Sfx) Sfx.open();
  if(!fromHash && location.hash!=='#calendar'){ location.hash='calendar'; }
  rCalendar();
}
function closeCalendar(fromHash){
  const v = document.getElementById('calendar-view'); if(!v) return;
  if(!calUI.open) return;                                   // already closing/closed
  calUI.open = false;
  if(window.Sfx) Sfx.close();
  v.setAttribute('aria-hidden','true');
  calCloseModal();
  if(!fromHash && location.hash==='#calendar'){ history.replaceState(null,'',location.pathname+location.search); }
  const hud = v.querySelector('.sys-window');
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(reduce || !hud){
    v.classList.remove('open'); v.classList.remove('cal-closing'); document.body.classList.remove('cal-locked');
    return;
  }
  // keep .cal-closing so the furl's both-fill holds the window furled while the
  // view fades; openCalendar clears it. (mirrors closeFinance/closeSystem)
  v.classList.add('cal-closing');
  clearTimeout(_calCloseT);
  _calCloseT = setTimeout(()=>{ v.classList.remove('open'); document.body.classList.remove('cal-locked'); }, 480);
}

function initCalendar(){
  window.addEventListener('hashchange', calOnHash);
  document.addEventListener('keydown', e=>{ if(!calUI.open) return; if(e.key==='Escape'){ if(calModalOpen()) calCloseModal(); else closeCalendar(); e.preventDefault(); } });
  // 当日事项 rows are role=button/tabindex=0; delegate click + Enter/Space to jump (keeps id off inline onclick)
  const dEl = document.getElementById('cal-day');
  if(dEl){
    const fire = (t)=>{ const row = t && t.closest && t.closest('.cal-item-row[data-jump-id]'); if(row) calJumpTo(row.dataset.jumpKind, row.dataset.jumpId); };
    dEl.addEventListener('click', e=> fire(e.target));
    dEl.addEventListener('keydown', e=>{ if(e.key==='Enter' || e.key===' '){ const row = e.target.closest && e.target.closest('.cal-item-row[data-jump-id]'); if(row){ e.preventDefault(); calJumpTo(row.dataset.jumpKind, row.dataset.jumpId); } } });
  }
  // month swipe: left = next month, right = prev (same threshold as the HUD-tab pager)
  const mEl = document.getElementById('cal-month');
  if(mEl){
    let sx=null, sy=null;
    mEl.addEventListener('touchstart', (e)=>{ const t=e.changedTouches[0]; sx=t.clientX; sy=t.clientY; }, {passive:true});
    mEl.addEventListener('touchend', (e)=>{
      if(sx==null) return;
      const t=e.changedTouches[0], dx=t.clientX-sx, dy=t.clientY-sy; sx=null;
      if(Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)*1.6) calShiftMonth(dx<0?1:-1);
    }, {passive:true});
  }
  calOnHash();
}

/* ── aggregation ── */
function calDayItems(ds){
  const todos = S.todos.filter(t => t.date===ds && !t.archived);
  const acs   = S.ac.filter(a => a.date===ds);
  const evs   = S.cal.filter(e => e.date===ds);
  return { todos, acs, evs, total: todos.length + acs.length + evs.length };
}

/* ── render ── */
function rCalendar(){
  if(!calUI.open) return;
  const m = document.getElementById('cal-month'); if(m) m.innerHTML = calMonthHtml();
  const d = document.getElementById('cal-day');   if(d) d.innerHTML = calDayHtml(calUI.sel);
  if(typeof attachRipples==='function') attachRipples(document.getElementById('calendar-view'));
}

function calMonthHtml(){
  const [y,m] = calUI.ym.split('-').map(Number);
  const startWd = new Date(y, m-1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  let cells = '';
  for(let i=0;i<startWd;i++) cells += `<span class="cal-cell empty"></span>`;
  for(let d=1; d<=days; d++){
    const ds = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const it = calDayItems(ds);
    const cls = (ds===calUI.sel?'sel ':'') + (ds===TODAY?'today ':'') + (it.total?'has ':'');
    let dots = '';
    if(it.evs.length)   dots += '<i class="cal-dot ev"></i>';
    if(it.todos.length) dots += '<i class="cal-dot td"></i>';
    if(it.acs.length)   dots += '<i class="cal-dot ac"></i>';
    cells += `<button type="button" class="cal-cell ${cls.trim()}" onclick="calSelectDay('${ds}')"><span class="cal-cell-n">${d}</span><span class="cal-cell-dots">${dots}</span></button>`;
  }
  return `<div class="cal-month-head">
      <button class="cal-mn-btn" onclick="calShiftMonth(-1)" aria-label="上月">‹</button>
      <span class="cal-month-title">${y} 年 ${m} 月</span>
      <button class="cal-mn-btn" onclick="calShiftMonth(1)" aria-label="下月">›</button>
      <button class="cal-today-btn" onclick="calSelectDay('${TODAY}',true)">今天</button>
    </div>
    <div class="cal-wd">${CAL_WD.map(w=>`<span>${w}</span>`).join('')}</div>
    <div class="cal-grid">${cells}</div>`;
}
function calShiftMonth(dir){
  const [y,m] = calUI.ym.split('-').map(Number);
  const nd = new Date(y, m-1+dir, 1);
  calUI.ym = `${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,'0')}`;
  const m2 = document.getElementById('cal-month'); if(m2) m2.innerHTML = calMonthHtml();
}
function calSelectDay(ds, jumpMonth){
  calUI.sel = ds;
  if(jumpMonth) calUI.ym = ds.slice(0,7);
  rCalendar();
}

function calDayHtml(ds){
  const it = calDayItems(ds);
  const d = new Date(ds+'T00:00:00');
  const wd = CAL_WD[d.getDay()];
  const head = `<div class="cal-day-head"><span class="cal-day-date">${d.getMonth()+1} 月 ${d.getDate()} 日 · 周${wd}</span>${ds===TODAY?'<span class="cal-day-today">今天</span>':''}</div>`;

  // 行程 (editable, sorted by start time; '' sorts last)
  const evs = it.evs.slice().sort((a,b)=> (a.start||'99:99').localeCompare(b.start||'99:99'));
  let evHtml = `<div class="cal-sec-label">行程 · Schedule</div>`;
  if(evs.length){
    evHtml += evs.map(e=>`<div class="cal-ev-row">
        <div class="cal-ev-time">${e.start?escH(e.start)+(e.end?'<br>'+escH(e.end):''):'全天'}</div>
        <div class="cal-ev-body"><div class="cal-ev-title">${escH(e.title)}</div>${e.loc?`<div class="cal-ev-loc">📍 ${escH(e.loc)}</div>`:''}${e.notes?`<div class="cal-ev-notes">${escH(e.notes)}</div>`:''}</div>
        <div class="cal-ev-actions"><button class="row-btn" onclick="calEditEvent('${e.id}')">编辑</button><button class="row-btn" onclick="calDelEvent('${e.id}')" aria-label="删除"><svg class="ic"><use href="./vendor/icons.svg#i-close"/></svg></button></div>
      </div>`).join('');
  } else {
    evHtml += `<div class="cal-empty">— 今日无行程 —</div>`;
  }
  evHtml += `<button class="cal-add-ev" onclick="calNewEvent()">+ 添加行程</button>`;

  // 当日事项 (read-only aggregation of dated academics + todos)
  let itemHtml = `<div class="cal-sec-label">当日事项 · Items</div>`;
  const rows = [];
  it.acs.forEach(a => rows.push({ kind:'ac', id:a.id, text:a.name||'', sub:a.sub||'', done:a.done, time:a.time }));
  it.todos.forEach(t => rows.push({ kind:'td', id:t.id, text:t.text||'', sub:'', done:t.done, time:t.time }));
  if(rows.length){
    itemHtml += rows.map(r=>`<div class="cal-item-row ${r.done?'done':''}" role="button" tabindex="0" data-jump-kind="${r.kind}" data-jump-id="${escH(r.id)}">
        <span class="cal-item-tag cal-tag-${r.kind}">${r.kind==='ac'?'课业':'杂务'}</span>
        <span class="cal-item-text">${escH(r.text)}${r.sub?` · ${escH(r.sub)}`:''}</span>
        ${r.time?`<span class="cal-item-time">${escH(r.time.slice(0,5))}</span>`:''}
        ${r.done?'<span class="cal-item-done">✓</span>':''}
      </div>`).join('');
  } else {
    itemHtml += `<div class="cal-empty">— 今日无杂务 / 课业 —</div>`;
  }

  return head + `<div class="cal-sec">${evHtml}</div><div class="cal-sec">${itemHtml}</div>`;
}

/* ── 行程 CRUD (modal form) ── */
function calModalEl(){ return document.getElementById('cal-modal'); }
function calModalOpen(){ const m=calModalEl(); return !!(m && m.classList.contains('open')); }
function calCloseModal(){ const m=calModalEl(); if(m){ m.classList.remove('open'); m.innerHTML=''; } calUI.editId=null; }
function calNewEvent(){ calUI.editId='new'; calOpenModal(); }
function calEditEvent(id){ calUI.editId=id; calOpenModal(); }
function calOpenModal(){
  const m = calModalEl(); if(!m) return;
  const ev = calUI.editId==='new'
    ? { id:null, title:'', date:calUI.sel, start:'', end:'', loc:'', notes:'' }
    : (S.cal.find(e=>e.id===calUI.editId) || { date:calUI.sel });
  const dlabel = (typeof finDateLabel==='function') ? finDateLabel(ev.date) : ev.date;
  m.innerHTML = `<div class="cal-modal-card">
      <div class="cal-modal-title">${calUI.editId==='new'?'新行程':'编辑行程'}</div>
      <input id="cal-f-title" placeholder="行程标题…" value="${escH(ev.title||'')}" style="width:100%;">
      <div class="field-row">
        <span class="field-label">日期</span>
        <button type="button" class="fin-datebtn" onclick="finOpenCal('cal-f-date')" style="flex:1;">📅 <span id="cal-f-date-label">${escH(dlabel||'选择日期')}</span></button>
        <input type="hidden" id="cal-f-date" value="${escH(ev.date||calUI.sel)}">
      </div>
      <div class="field-row cal-time-row">
        <span class="field-label">时间</span>
        <input type="time" id="cal-f-start" value="${escH(ev.start||'')}">
        <span class="cal-time-sep">→</span>
        <input type="time" id="cal-f-end" value="${escH(ev.end||'')}">
      </div>
      <input id="cal-f-loc" placeholder="地点（可选）" value="${escH(ev.loc||'')}" style="width:100%;">
      <textarea id="cal-f-notes" placeholder="备注（可选）" style="width:100%;height:54px;resize:none;">${escH(ev.notes||'')}</textarea>
      <div style="display:flex;gap:6px;">
        <button class="primary fx-btn" onclick="calSaveEvent()" style="flex:1;">保存</button>
        <button class="ghost fx-btn" onclick="calCloseModal()" style="flex:1;">取消</button>
      </div>
    </div>`;
  m.classList.add('open');
  requestAnimationFrame(()=>{ const t=document.getElementById('cal-f-title'); if(t) t.focus(); });
}
function calSaveEvent(){
  const titleEl = document.getElementById('cal-f-title'); if(!titleEl) return;
  const title = titleEl.value.trim(); if(!title) return;
  const date  = (document.getElementById('cal-f-date').value) || calUI.sel;
  let   start = document.getElementById('cal-f-start').value || '';
  let   end   = document.getElementById('cal-f-end').value || '';
  if(start && end && end < start){ const t = start; start = end; end = t; }  // swap reversed range (HH:MM lexical = chronological)
  const loc   = document.getElementById('cal-f-loc').value.trim();
  const notes = document.getElementById('cal-f-notes').value.trim();
  if(calUI.editId==='new'){
    const maxPos = S.cal.reduce((a,e)=>Math.max(a, e.position||0), 0);
    S.cal.push({ id:crypto.randomUUID(), title, date, start, end, loc, notes, position:maxPos+1 });
  } else {
    const e = S.cal.find(x=>x.id===calUI.editId);
    if(e){ e.title=title; e.date=date; e.start=start; e.end=end; e.loc=loc; e.notes=notes; }
  }
  calUI.sel = date; calUI.ym = date.slice(0,7);
  calCloseModal();
  saveCalEvents(); rCalendar();
  if(typeof rCalDot==='function') rCalDot();
  if(window.Sfx) Sfx.save();
}
function calDelEvent(id){
  S.cal = S.cal.filter(e=>e.id!==id);
  saveCalEvents(); rCalendar();
  if(typeof rCalDot==='function') rCalDot();
}

/* ── jump from a 当日事项 back to its source panel ── */
function calJumpTo(kind, id){
  closeCalendar();
  setTimeout(()=>{
    const sm = (window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches) ? 'auto' : 'smooth';
    const list = document.querySelector(kind==='ac' ? '#ac-list' : '#td-list');
    // academics lives in the tri-grid 课业 column — drive the horizontal scroll there first
    if(kind==='ac'){
      const panel = list ? list.closest('.panel') : null;
      const grid = panel ? panel.closest('.tri-grid') : null;
      if(grid && panel){
        const r = panel.getBoundingClientRect(), g = grid.getBoundingClientRect();
        grid.scrollTo({ left: grid.scrollLeft + r.left - g.left, behavior: sm });
      }
    }
    // scroll to the actual item node (rows carry data-id), with a transient highlight
    const item = list ? list.querySelector(`[data-id="${id}"]`) : null;
    const target = item || (list ? list.closest('.panel') : null) || list;
    if(target && target.scrollIntoView) target.scrollIntoView({ behavior: sm, block:'center' });
    if(item){
      item.classList.add('cal-jump-flash');
      setTimeout(()=>item.classList.remove('cal-jump-flash'), 1600);
    }
  }, 520);   // after the furl-close finishes
}

/* ── header button dot: lit when today has any item ── */
function rCalDot(){
  const total = calDayItems(TODAY).total;
  const btn = document.getElementById('cal-btn');
  if(btn) btn.classList.toggle('has-today', total>0);
  const n = document.getElementById('cal-micro-n');
  if(n) n.textContent = total;
}
