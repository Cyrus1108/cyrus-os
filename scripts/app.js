/* App entry — clock, sessions, metrics, init, render orchestration */
function escH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

/* ════ Reminder lead-time: dropdown + custom "number × unit" ════
   Stored value is always minutes (int). Used by todos + academics forms. */
function toggleRemindCustom(selectId, wrapId){
  const sel = document.getElementById(selectId);
  const wrap = document.getElementById(wrapId);
  if(sel && wrap) wrap.style.display = sel.value === 'custom' ? 'flex' : 'none';
}
function readRemind(selectId, numId, unitId){
  const sel = document.getElementById(selectId).value;
  if(sel === 'custom'){
    const num = parseInt(document.getElementById(numId).value) || 0;
    const unit = parseInt(document.getElementById(unitId).value) || 1;
    return Math.max(0, num * unit);
  }
  return parseInt(sel) || 0;
}
/* Break a minutes value into {num, unit} using the largest clean unit. */
function decomposeRemind(mins){
  if(mins && mins % 1440 === 0) return { num: mins/1440, unit: 1440 };
  if(mins && mins % 60 === 0) return { num: mins/60, unit: 60 };
  return { num: mins || '', unit: 1 };
}
/* Render the custom number+unit row markup for an edit/add form. */
function remindCustomRow(prefix, isCustom, num, unit){
  return `<div id="${prefix}-rc" class="field-row" style="${isCustom?'':'display:none;'}">
    <input id="${prefix}-rc-num" type="number" min="1" value="${isCustom?num:''}" placeholder="数值" style="flex:1;">
    <select id="${prefix}-rc-unit" style="flex:1;">
      <option value="1" ${unit===1?'selected':''}>分钟</option>
      <option value="60" ${unit===60?'selected':''}>小时</option>
      <option value="1440" ${unit===1440?'selected':''}>天</option>
    </select>
  </div>`;
}

/* ════ Themed form controls — replace native date/time/priority/reminder in
   todo + academic forms with components matching the finance module's look.
   Read side is unchanged: getElementById(id).value still returns the value. ════ */

// Date: themed button + hidden input, reuses finance's themed calendar (finOpenCal).
function dateField(id, val){
  return `<button type="button" class="fin-datebtn" onclick="finOpenCal('${id}')">📅 <span id="${id}-label">${val?finDateLabel(val):'选择日期'}</span></button><input type="hidden" id="${id}" value="${val||''}">`;
}
function setDateField(id, ds){
  const h=document.getElementById(id); if(h) h.value=ds||'';
  const l=document.getElementById(id+'-label'); if(l) l.textContent = ds?finDateLabel(ds):'选择日期';
}

// Time: themed button + hidden input + lightweight HH:MM picker (below).
function timeField(id, val){
  return `<button type="button" class="fin-datebtn" onclick="openTimePicker('${id}')">🕐 <span id="${id}-label">${val?val:'选择时间'}</span></button><input type="hidden" id="${id}" value="${val||''}">`;
}
function setTimeField(id, hm){
  const h=document.getElementById(id); if(h) h.value=hm||'';
  const l=document.getElementById(id+'-label'); if(l) l.textContent = hm||'选择时间';
}

// Segmented (few options) / chip row (many options). onpick = optional global fn name.
function segField(id, value, options, onpick){
  const btns = options.map(([v,l])=>`<button type="button" class="fin-seg-btn ${String(v)===String(value)?'active':''}" data-v="${v}" onclick="segPick('${id}','${v}'${onpick?",'"+onpick+"'":''})">${l}</button>`).join('');
  return `<div class="fin-seg" data-seg="${id}">${btns}</div><input type="hidden" id="${id}" value="${value}">`;
}
function chipField(id, value, options, onpick){
  const chips = options.map(([v,l])=>`<button type="button" class="fin-chip ${String(v)===String(value)?'active':''}" data-v="${v}" onclick="segPick('${id}','${v}'${onpick?",'"+onpick+"'":''})">${l}</button>`).join('');
  return `<div class="fin-chiprow" data-seg="${id}">${chips}</div><input type="hidden" id="${id}" value="${value}">`;
}
/* segSet: programmatic setter (form open/reset defaults) — NO sound.
   segPick: the user-gesture path (chip onclick / keyboard next.click()) — clicks. */
function segSet(id, v, onpick){
  const h=document.getElementById(id); if(h) h.value=v;
  document.querySelectorAll('[data-seg="'+id+'"] [data-v]').forEach(b=>b.classList.toggle('active', b.dataset.v===String(v)));
  if(onpick && typeof window[onpick]==='function') window[onpick](id, v);
}
function segPick(id, v, onpick){
  if(window.Sfx) Sfx.tab();
  segSet(id, v, onpick);
}
// Reminder chip handler → show/hide the custom "number×unit" row (`${prefix}-rc`).
function onRemindSeg(id, v){
  const wrap=document.getElementById(id.replace(/-remind$/,'')+'-rc');
  if(wrap) wrap.style.display = (v==='custom') ? 'flex' : 'none';
  if(_nav.active) _navRefresh(); // visible fields may have changed
}

/* ══════════════════════════════════════════════════════════════════
   Form keyboard navigator — ↑↓ moves between form fields,
   Enter dives into the highlighted field, Esc returns to nav layer.
   Works on both add forms (static) and edit forms (dynamic).
   ══════════════════════════════════════════════════════════════════ */
const _nav = { active:false, container:null, fields:[], idx:0 };

// Selectors for navigable form elements, in tab order
const _NAV_SEL = 'input[type=text],input:not([type]),.fin-datebtn,.fin-seg,.fin-chiprow,select,button.primary,button.ghost.fx-btn';

function _navVisible(el){
  if(!el) return false;
  const s = window.getComputedStyle(el);
  return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null;
}

function openFormNav(container, startIdx){
  _nav.container = container;
  _nav.active = true;
  _nav.idx = startIdx || 0;
  _navRefresh(_nav.idx);
}

function closeFormNav(){
  _navClearHl();
  _nav.active = false;
  _nav.container = null;
  _nav.fields = [];
}

function _navRefresh(idx){
  if(!_nav.container) return;
  _nav.fields = Array.from(_nav.container.querySelectorAll(_NAV_SEL))
    .filter(_navVisible);
  // exclude cancel/ghost buttons that aren't submit — keep only .primary + the close ghost
  // (don't exclude anything; let user Tab to them naturally)
  const target = idx !== undefined ? idx : _nav.idx;
  _nav.idx = Math.max(0, Math.min(target, _nav.fields.length - 1));
  _navClearHl();
  const el = _nav.fields[_nav.idx];
  if(el) el.classList.add('form-nav-hl');
}

function _navClearHl(){
  if(_nav.container)
    _nav.container.querySelectorAll('.form-nav-hl').forEach(e=>e.classList.remove('form-nav-hl'));
}

function _navIsTyping(){
  const a = document.activeElement;
  return a && _nav.container && _nav.container.contains(a) &&
    (a.tagName==='INPUT' || a.tagName==='TEXTAREA' || a.tagName==='SELECT');
}

function _navIsInGroup(){
  const a = document.activeElement;
  return a && _nav.container && _nav.container.contains(a) &&
    a.matches('.fin-seg-btn,.fin-chip');
}

function _navActivate(){
  const el = _nav.fields[_nav.idx];
  if(!el) return;
  if(el.matches('input, textarea')){
    _navClearHl(); el.focus(); if(el.select) el.select();
    return;
  }
  if(el.matches('.fin-datebtn')){ el.click(); return; }
  if(el.matches('.fin-seg')){
    const btn = el.querySelector('.fin-seg-btn.active') || el.querySelector('.fin-seg-btn');
    if(btn){ _navClearHl(); btn.focus(); }
    return;
  }
  if(el.matches('.fin-chiprow')){
    const chip = el.querySelector('.fin-chip.active') || el.querySelector('.fin-chip');
    if(chip){ _navClearHl(); chip.focus(); }
    return;
  }
  if(el.matches('select')){ _navClearHl(); el.focus(); return; }
  el.click(); // primary/ghost button
}

document.addEventListener('keydown', function(e){
  if(!_nav.active || !_nav.container) return;
  // Themed pickers own the keyboard while open
  if(typeof finCalOpen==='function' && finCalOpen()) return;
  if(typeof timePickerOpen==='function' && timePickerOpen()) return;

  // Inside a native input / select: only Esc exits back to nav
  if(_navIsTyping()){
    if(e.key==='Escape'){ e.preventDefault(); document.activeElement.blur(); _navRefresh(); }
    return;
  }
  // Inside a seg/chip group (←→ already handled by capture): Esc exits back to nav
  if(_navIsInGroup()){
    if(e.key==='Escape'){ e.preventDefault(); document.activeElement.blur(); _navRefresh(); }
    return;
  }

  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault(); e.stopPropagation();
    _nav.idx = (_nav.idx + (e.key==='ArrowDown'?1:-1) + _nav.fields.length) % _nav.fields.length;
    _navRefresh(_nav.idx);
    return;
  }
  if(e.key==='Enter'){
    e.preventDefault(); e.stopPropagation();
    _navActivate();
    return;
  }
  if(e.key==='Escape'){
    e.preventDefault();
    closeFormNav();
    return;
  }
}, false);

/* ── Lightweight themed time picker (todo / academic only — finance has no time) ── */
const _tp = { targetId:null, h:9, m:0 };
function timePickerOpen(){ const c=document.getElementById('app-timepick'); return !!(c&&c.classList.contains('open')); }
function openTimePicker(targetId){
  const cur=((document.getElementById(targetId)||{}).value)||'09:00';
  const [h,m]=cur.split(':').map(Number);
  _tp.targetId=targetId; _tp.h=isNaN(h)?9:h; _tp.m=isNaN(m)?0:m;
  _tpRender();
}
function _tpRender(){
  let o=document.getElementById('app-timepick');
  if(!o){ o=document.createElement('div'); o.id='app-timepick'; o.className='fin-cal';
    o.addEventListener('click', e=>{ if(e.target===o) _tpClose(); });
    document.body.appendChild(o); }
  const pad=n=>String(n).padStart(2,'0');
  const hh=Array.from({length:24},(_,i)=>i).map(h=>`<button type="button" class="fin-tp-cell ${h===_tp.h?'sel':''}" onclick="_tpSet('h',${h})">${pad(h)}</button>`).join('');
  const mm=[0,5,10,15,20,25,30,35,40,45,50,55].map(m=>`<button type="button" class="fin-tp-cell ${m===_tp.m?'sel':''}" onclick="_tpSet('m',${m})">${pad(m)}</button>`).join('');
  o.innerHTML=`<div class="fin-cal-card">
    <div class="fin-cal-head"><span class="fin-cal-title">选择时间 · ${pad(_tp.h)}:${pad(_tp.m)}</span></div>
    <div class="fin-tp-cols">
      <div class="fin-tp-col"><div class="fin-tp-lbl">时</div><div class="fin-tp-grid">${hh}</div></div>
      <div class="fin-tp-col"><div class="fin-tp-lbl">分</div><div class="fin-tp-grid">${mm}</div></div>
    </div>
    <div class="fin-cal-foot">
      <button class="ghost fx-btn" onclick="_tpConfirm()">确定</button>
      <button class="ghost fx-btn" onclick="_tpClose()">取消</button>
    </div>
    <div class="fin-tp-hint">↑↓ 时 · ←→ 分 · Enter 确定</div>
  </div>`;
  o.classList.add('open');
  // Re-focus card after every re-render so arrow keys work without clicking
  requestAnimationFrame(()=>{ const c=o.querySelector('.fin-cal-card'); if(c){ c.tabIndex=-1; c.focus({preventScroll:true}); } });
}
function _tpSet(k,v){ _tp[k]=v; _tpRender(); }
function _tpConfirm(){ const pad=n=>String(n).padStart(2,'0'); setTimeField(_tp.targetId, pad(_tp.h)+':'+pad(_tp.m)); _tpClose(); }
function _tpClose(){ const o=document.getElementById('app-timepick'); if(o) o.classList.remove('open'); }
function timePickerKey(e){
  const _MM=[0,5,10,15,20,25,30,35,40,45,50,55];
  if(e.key==='Escape'){ e.preventDefault(); _tpClose(); }
  else if(e.key==='Enter'){ e.preventDefault(); _tpConfirm(); }
  else if(e.key==='ArrowUp'){   e.preventDefault(); _tpSet('h',(_tp.h-1+24)%24); }
  else if(e.key==='ArrowDown'){ e.preventDefault(); _tpSet('h',(_tp.h+1)%24); }
  else if(e.key==='ArrowLeft'){  e.preventDefault(); const i=_MM.indexOf(_tp.m); _tpSet('m',_MM[(i-1+12)%12]); }
  else if(e.key==='ArrowRight'){ e.preventDefault(); const i=_MM.indexOf(_tp.m); _tpSet('m',_MM[(i+1)%12]); }
}

/* ── Keyboard navigation for seg/chip groups (priority, reminder chips) ──
   When focused on any .fin-seg-btn or .fin-chip:
   ← / ↑   →  previous option (wraps)
   → / ↓   →  next option (wraps)
   Uses capture phase + stopPropagation so it takes priority over page handlers
   and doesn't accidentally trigger tab-switching (finNavTab) etc. */
document.addEventListener('keydown', function(e){
  const t = e.target;
  if(!t || !t.closest) return;
  if(!t.matches('.fin-seg-btn, .fin-chip')) return;
  if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight'&&e.key!=='ArrowUp'&&e.key!=='ArrowDown') return;
  const group = t.closest('[data-seg]');
  if(!group) return;
  e.preventDefault();
  e.stopPropagation();
  const btns = Array.from(group.querySelectorAll('[data-v]'));
  const idx = btns.indexOf(t);
  if(idx < 0) return;
  const fwd = (e.key==='ArrowRight' || e.key==='ArrowDown');
  const next = btns[(idx + (fwd ? 1 : btns.length - 1)) % btns.length];
  next.focus();
  next.click(); // triggers segPick → updates hidden input + active class
}, true);

/* ── Number count-up animation ──
   Smoothly rolls a numeric display from `from` to `to` over `dur` ms.
   Uses easeInOut for a natural feel. Skips animation if reduced-motion is on. */
function animateNumber(el, from, to, dur){
  if(!el || from===to) return;
  if(matchMedia('(prefers-reduced-motion:reduce)').matches){ el.textContent=to; return; }
  const start=performance.now();
  function tick(now){
    const p=Math.min((now-start)/dur,1);
    const e=p<0.5?2*p*p:-1+(4-2*p)*p; // easeInOut
    el.textContent=Math.round(from+(to-from)*e);
    if(p<1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ── View Transitions helper ──
   Wraps any DOM-mutating fn in document.startViewTransition when supported.
   Falls back silently on unsupported browsers or when reduced-motion is on. */
function withViewTransition(fn){
  if(!document.startViewTransition || matchMedia('(prefers-reduced-motion:reduce)').matches){
    fn(); return;
  }
  document.startViewTransition(fn);
}

/* Ripple effect */
function addRipple(e){
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  const size = Math.max(rect.width, rect.height);
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = (e.clientX - rect.left - size/2) + 'px';
  ripple.style.top = (e.clientY - rect.top - size/2) + 'px';
  btn.appendChild(ripple);
  setTimeout(()=>ripple.remove(), 600);
}
function attachRipples(root){
  // scope to the just-rendered container when given, so a partial re-render doesn't
  // walk the ENTIRE document re-binding ripples (cost scaled to total app buttons)
  (root || document).querySelectorAll('button.primary, button.ghost, button.check-btn').forEach(btn=>{
    if(btn.dataset.rippleAttached) return;
    btn.dataset.rippleAttached = '1';
    btn.addEventListener('click', addRipple);
  });
}

function rDate(){
  const now=new Date();
  const enDays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const enMonths=['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('dateline').textContent=enDays[now.getDay()];
  document.getElementById('datemeta').textContent=`${enMonths[now.getMonth()]} ${now.getDate()} · ${now.getFullYear()}`;
  const h=now.getHours();
  const g=h<12?'Good morning':h<18?'Good afternoon':'Good evening';
  document.getElementById('greeting').textContent=`Cyrus — ${g}`;
  document.getElementById('clock-sub').textContent='Kaohsiung';
}
function tick(){
  const now=new Date(),p=n=>String(n).padStart(2,'0');
  document.getElementById('clock').textContent=`${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
  const m=now.getHours()*60+now.getMinutes();
  const active=SESH.filter(s=>isOn(s,m));
  document.getElementById('sesh-now').textContent=active.length?active.map(s=>s.n).join(' + ')+' — active':'— Quiet hours —';
  document.getElementById('sessions').innerHTML=SESH.map(s=>{
    const on=isOn(s,m);
    return `<div class="sess-row"><div class="sess-dot ${on?'on':''}"></div><span class="sess-name ${on?'on':''}">${s.n}</span><span class="sess-time">${s.r}</span></div>`;
  }).join('');
}

function rMetrics(){
  document.getElementById('m-ac').textContent=S.ac.filter(t=>!t.done).length;
  const d=S.tr.list.filter(i=>i.d).length,t=S.tr.list.length;
  document.getElementById('m-tr').innerHTML=`${d}<span style="color:var(--brass-ghost);"> / ${t}</span>`;
  document.getElementById('m-td').textContent=S.todos.filter(t=>!t.done).length;
  updateShowDoneBtn();
}

function renderAll(){rDate();rMR();rAC();rJP();rTR();rCats();rTodos();if(typeof rThe90==='function') rThe90();if(typeof rLowDay==='function') rLowDay();if(typeof rHermes==='function') rHermes();if(typeof rMotivation==='function') rMotivation();rMetrics();if(typeof rpgAfterChange==='function') rpgAfterChange();attachRipples();}

function onAuthReady(){
  /* Called by auth.js once a Supabase session is established.
     Stage 2a: still reads from localStorage. Stage 2b will swap in Supabase pulls. */
  init();
}

async function init(){
  const mr=loadLS('mr',null);
  if(mr){
    if(mr.date===TODAY){
      S.mr=mr;
    } else {
      S.mr.list = mr.list.map(i=>({...i,d:false}));
      S.mr.date = TODAY;
      saveMR();
    }
  }
  if(cleanMorning()) saveMR();
  const ac=loadLS('ac',null);if(ac)S.ac=ac;
  const jp=loadLS('jp',null);
  if(jp){
    S.jp=jp;
    // daily reset (mirrors mr/tr): yesterday's checks don't carry into today —
    // the log keeps history, the list flags belong to ONE day only
    if(jp.date!==TODAY){S.jp.date=TODAY;S.jp.list=(jp.list||[]).map(i=>({...i,d:false}));saveJP();}
  }
  const tr=loadLS('tr',null);
  if(tr){if(tr.date===TODAY)S.tr=tr;else{S.tr.bias='';S.tr.list=S.tr.list.map(i=>({...i,d:false}));}}
  const tds=loadLS('todos',null);if(tds)S.todos=tds;
  const cats=loadLS('cats',null);if(cats&&cats.length)S.cats=cats;
  const syms=loadLS('symbols',null);if(syms&&Array.isArray(syms)&&syms.length>0)S.symbols=syms;
  const subj=loadLS('subjects',null);if(subj&&Array.isArray(subj))S.subjects=subj;
  const noti=loadLS('notifiedIds',null);if(noti)S.notifiedIds=noti;
  const finA=loadLS('fin_accounts',null);if(finA&&Array.isArray(finA))S.fin.accounts=finA;
  const finC=loadLS('fin_categories',null);if(finC&&Array.isArray(finC))S.fin.categories=finC;
  const finT=loadLS('fin_transactions',null);if(finT&&Array.isArray(finT))S.fin.transactions=finT;
  const finB=loadLS('fin_budgets',null);if(finB&&Array.isArray(finB))S.fin.budgets=finB;
  const finG=loadLS('fin_goals',null);if(finG&&Array.isArray(finG))S.fin.goals=finG;
  const finR=loadLS('fin_recurring',null);if(finR&&Array.isArray(finR))S.fin.recurring=finR;
  /* hydrate RPG state from LS so the pre-pull render doesn't run the firstRun
     backfill against empty data (then re-settle after sync) — kills the
     load-time churn around seenLevel/achievements/_rpgLastExp */
  const rpgLS=loadLS('rpg',null);if(rpgLS&&typeof rpgLS==='object'&&!Array.isArray(rpgLS))S.rpg=Object.assign({},S.rpg,rpgLS);
  showDone = loadLS('show_done', false);
  if(typeof initTheme === 'function') initTheme();
  if(typeof initFinance === 'function') initFinance();
  if(typeof initThe90Keys === 'function') initThe90Keys();

  // Hydrate The 90 state from localStorage cache (first paint before Supabase pull)
  if(typeof ensureThe90Defaults === 'function'){
    ensureThe90Defaults();
    const metaCache = loadLS('the90_meta', null);
    if(metaCache) S.the90.meta = metaCache;
    const dailyCache = loadLS('the90_daily', null);
    if(dailyCache) S.the90.daily = dailyCache;
  }

  initCreed();
  renderAll();
  updateShowDoneBtn();
  tick();
  setInterval(tick,1000);
  attachRipples();
  checkNotifBanner();
  checkReminders();
  setInterval(checkReminders, 30000);
  // after the first-paint entrance animations settle, stop list rows from replaying
  // their fade-in on every re-render (a toggle re-render would otherwise flicker)
  setTimeout(()=>document.body.classList.add('booted'), 1500);

  /* Sync layer (Stage 2b): overlay Supabase data on top of the LS-rendered UI,
     then subscribe to Realtime for cross-device updates. */
  if(typeof pullAll === 'function'){
    await pullAll();
    renderAll();
    if(typeof subscribeRealtime === 'function') subscribeRealtime();
  }

  /* Stage 4: ensure this device's existing push subscription is bound to the current user
     in Supabase (in case the user logged in fresh on a different account). */
  if(typeof reattachPushSubscription === 'function') reattachPushSubscription();
}

/* Service Worker — shell cache for offline + foundation for Stage 4 Web Push.
   Registers regardless of auth state so the login screen also works offline. */
if('serviceWorker' in navigator){
  /* Auto-update: always network-check sw.js (updateViaCache:'none'), re-check when the
     tab regains focus, and reload ONCE when a new SW takes control — so a version bump
     reaches users without a manual hard-refresh (the old cache-first SW could otherwise
     keep serving a stale build indefinitely). */
  let _swRefreshing = false;
  const _hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(_swRefreshing || !_hadController) return;   // skip the very first claim on a clean install
    _swRefreshing = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(reg => {
        reg.update();
        document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') reg.update(); });
      })
      .catch(err => console.error('[sw] registration failed:', err));
  });
}

initAuth();
