/* ════════════════════════════════════════════════════════════
   Fitness module — v7.11
   Calisthenics-first health HUD, cloned from finance.js (same open/close,
   same sys-window shell, same tab pattern). Tabs: 今日 / 计划 / 趋势 / 饮食.
   Plan drives today: a weekly schedule auto-populates "today"; completing
   every planned set auto-checks-in (mirrors japanese.js jpSettle) and feeds
   the RPG achievement system. Two independent timers: a session stopwatch
   (count-up) and a rest/hold countdown.
   ════════════════════════════════════════════════════════════ */

const FIT_TABS = ['today','plan','trends','diet'];
const FIT_WK_LABEL = { mon:'周一', tue:'周二', wed:'周三', thu:'周四', fri:'周五', sat:'周六', sun:'周日' };
const FIT_DIMS = [
  {k:'weight',l:'体重',u:'kg'}, {k:'waist',l:'腰围',u:'cm'},
  {k:'chest',l:'胸围',u:'cm'}, {k:'arm',l:'臂围',u:'cm'}, {k:'thigh',l:'腿围',u:'cm'},
];

const fitUI = { open:false, tab:'today', dietDate:TODAY, trendDim:'weight' };
let _fitCloseT = null;

function fitEsc(s){ return String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function fitSfx(name){ if(typeof Sfx!=='undefined' && typeof Sfx[name]==='function') Sfx[name](); }

/* ════════════ view open / close / routing (mirrors finance.js) ════════════ */
function fitOnHash(){
  if(location.hash==='#fitness'){ if(!fitUI.open) openFitness(true); }
  else if(fitUI.open){ closeFitness(true); }
}
function openFitness(fromHash){
  const v = document.getElementById('fitness-view'); if(!v) return;
  clearTimeout(_fitCloseT); v.classList.remove('fit-closing');   // cancel an in-flight furl
  fitUI.open = true;
  v.classList.add('open');
  v.setAttribute('aria-hidden','false');
  document.body.classList.add('fit-locked');
  if(!fromHash && location.hash!=='#fitness'){ location.hash='fitness'; }
  // seed the preset exercise library the first time (only once the DB is known empty)
  if(typeof initialPullDone!=='undefined' && initialPullDone && S.fit.exercises.length===0){
    S.fit.exercises = FIT_PRESET.map((e,i)=>({ id:crypto.randomUUID(), name:e.name, kind:e.kind, isPreset:true, sort:i, archived:false }));
    saveFitExercises();
  }
  fitStartTicker();
  rFitness();
}
function closeFitness(fromHash){
  const v = document.getElementById('fitness-view'); if(!v) return;
  if(!fitUI.open) return;                                   // already closing/closed
  fitUI.open = false;
  v.setAttribute('aria-hidden','true');
  fitCloseModal();
  if(fitTimer.up.running) fitSaveDuration();   // flush the running stopwatch's elapsed before we stop the ticker
  fitStopTicker(); fitDestroyCharts();
  if(!fromHash && location.hash==='#fitness'){ history.replaceState(null,'',location.pathname+location.search); }
  const hud = v.querySelector('.sys-window');
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(reduce || !hud){
    v.classList.remove('open'); v.classList.remove('fit-closing'); document.body.classList.remove('fit-locked');
    return;
  }
  // furl the scroll back up, then drop .open but KEEP .fit-closing — its both-fill
  // holds the window furled/invisible, so dropping .open won't flash the full panel
  // back during the view's fade-out. openFitness clears it. (mirrors closeSystem)
  v.classList.add('fit-closing');
  clearTimeout(_fitCloseT);
  _fitCloseT = setTimeout(()=>{ v.classList.remove('open'); document.body.classList.remove('fit-locked'); }, 480);
}
function fitSwitchTab(tab){
  if(fitUI.tab==='trends' && tab!=='trends') fitDestroyCharts();
  fitSfx('tab');
  withViewTransition(()=>{ fitUI.tab=tab; rFitness(); });
}
function fitNavTab(dir){
  let i = FIT_TABS.indexOf(fitUI.tab);
  i = Math.max(0, Math.min(FIT_TABS.length-1, i+dir));
  if(FIT_TABS[i]!==fitUI.tab) fitSwitchTab(FIT_TABS[i]);
}

function initFitness(){
  window.addEventListener('hashchange', fitOnHash);
  document.addEventListener('keydown', (e)=>{
    if(!fitUI.open) return;
    const tag=e.target.tagName, typing=tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT';
    if(e.key==='Escape'){ if(fitModalOpen()) fitCloseModal(); else closeFitness(); return; }
    if(typing || fitModalOpen()) return;
    if(e.key==='ArrowLeft') fitNavTab(-1);
    else if(e.key==='ArrowRight') fitNavTab(1);
  });
}

/* ════════════ modal (reuses .fin-modal styles) ════════════ */
function fitModalOpen(){ const m=document.getElementById('fit-modal'); return !!(m&&m.classList.contains('open')); }
function fitModal(html){
  const m=document.getElementById('fit-modal'); if(!m) return;
  const card=document.getElementById('fit-modal-card'); if(!card) return;
  if(!card.dataset.bound){ card.dataset.bound='1'; m.addEventListener('click', e=>{ if(e.target===m) fitCloseModal(); }); }
  card.innerHTML=html; m.classList.add('open');
}
function fitCloseModal(){ const m=document.getElementById('fit-modal'); if(m) m.classList.remove('open'); }

/* ════════════ helpers ════════════ */
function fitExById(id){ return S.fit.exercises.find(e=>e.id===id); }
function fitActiveExercises(){ return S.fit.exercises.filter(e=>!e.archived).sort((a,b)=>(a.sort||0)-(b.sort||0)); }
function fitTargetLabel(en){ return `${en.sets}×${en.target}${en.kind==='time'?'s':''}`; }
function fitExComplete(en){ return (en.done||[]).filter(x=>x!=null).length >= (en.sets||1); }

/* Build/reconcile today's log against the plan. Past days stay frozen. */
function fitEnsureLog(date){
  const d = date||TODAY;
  if(!S.fit.log[d]) S.fit.log[d] = { entries:[], done:false, durationSec:0, note:'' };
  const day = S.fit.log[d];
  if(d===TODAY){
    const plan = (S.fit.plan.week[fitWeekdayKey(d)])||[];
    // pool prev entries per exId so DUPLICATE slots of the same exercise each get
    // their own carry-over (consumed in order) instead of all collapsing onto one.
    const pool = {}; (day.entries||[]).forEach(en=>{ (pool[en.exId]=pool[en.exId]||[]).push(en); });
    day.entries = plan.map(slot=>{
      const ex = fitExById(slot.exId);
      const prev = (pool[slot.exId]||[]).shift();
      const prevDone = prev && Array.isArray(prev.done) ? prev.done : [];
      const hasRec = prevDone.some(x=>x!=null);
      // never silently drop already-logged sets if the plan's set count was lowered later
      const sets = hasRec ? Math.max(slot.sets||1, prevDone.length) : (slot.sets||1);
      const done = []; for(let j=0;j<sets;j++){ done[j] = prevDone[j]!=null ? prevDone[j] : null; }
      return { exId:slot.exId, name: ex?ex.name:(prev?prev.name:'—'), kind: ex?ex.kind:(prev?prev.kind:'reps'),
        sets, target: slot.target||0, done };
    });
    fitSettle();   // keep day.done consistent with the reconciled entries (e.g. after a plan edit)
  }
  return day;
}

/* auto check-in: all planned sets done → log[TODAY].done (mirror jpSettle) */
function fitSettle(){
  const day = S.fit.log[TODAY]; if(!day) return { changed:false, all:false };
  const entries = day.entries||[];
  const all = entries.length>0 && entries.every(fitExComplete);
  const had = !!day.done;
  if(all && !had) day.done = true;
  else if(!all && had) day.done = false;
  return { changed: all!==had, all };
}
function fitAfterChange(undo){
  const r = fitSettle();
  saveFitLog(TODAY);
  if(r.changed && r.all) fitSfx('quest');
  else fitSfx(undo ? 'untick' : 'tick');
  rFitness();
  if(typeof rpgAfterChange==='function') rpgAfterChange();
}

/* streak — rest days (no plan that weekday) DON'T break it; a planned-but-missed
   past day does. Today not-done neither counts nor breaks. */
function fitComputeStreak(){
  const log = S.fit.log||{}, week = (S.fit.plan&&S.fit.plan.week)||{};
  const planned = ds => { const a = week[fitWeekdayKey(ds)]; return !!(a && a.length); };
  const cur = new Date(TODAY+'T00:00:00');
  let s = 0;
  for(let i=0;i<400;i++){
    const ds = cur.toLocaleDateString('sv-SE');
    const isDone = !!(log[ds] && log[ds].done);
    if(i===0){ if(isDone) s++; }                 // today: count if done, else skip (no break)
    else if(!planned(ds)){ /* rest day holds the streak */ }
    else if(isDone){ s++; }
    else break;                                  // planned but missed → streak ends
    cur.setDate(cur.getDate()-1);
  }
  return s;
}

/* achievement-facing aggregates (rpg.js soft-references these via typeof) */
function fitWorkoutCount(){ return Object.values(S.fit.log||{}).filter(d=>d&&d.done).length; }
function fitTotalReps(){
  let t=0; const log=S.fit.log||{};
  for(const d in log){ (log[d].entries||[]).forEach(en=>{ if(en.kind!=='time') (en.done||[]).forEach(r=>{ if(r!=null) t+=r; }); }); }
  return t;
}
function fitBodyLogged(){ return Object.keys(S.fit.body||{}).length; }
function fitPlanWeekComplete(){
  const week=(S.fit.plan&&S.fit.plan.week)||{}, log=S.fit.log||{};
  if(!FIT_WEEK_KEYS.some(k=>(week[k]||[]).length)) return false;
  const base=new Date(TODAY+'T00:00:00'); let planned=0, done=0;
  for(let i=0;i<7;i++){ const c=new Date(base); c.setDate(base.getDate()-i); const ds=c.toLocaleDateString('sv-SE');
    if((week[fitWeekdayKey(ds)]||[]).length){ planned++; if(log[ds]&&log[ds].done) done++; } }
  return planned>0 && planned===done;
}

/* ════════════ main render dispatch ════════════ */
function rFitness(){
  if(!fitUI.open) return;
  const body=document.getElementById('fit-body'); if(!body) return;
  document.querySelectorAll('#fitness-view .fit-tab').forEach(b=> b.classList.toggle('active', b.dataset.tab===fitUI.tab));
  if(fitUI.tab==='today') rFitToday(body);
  else if(fitUI.tab==='plan') rFitPlan(body);
  else if(fitUI.tab==='trends') rFitTrends(body);
  else if(fitUI.tab==='diet') rFitDiet(body);
}

/* ════════════ 今日 today ════════════ */
function rFitToday(body){
  const k = fitWeekdayKey(TODAY);
  const plan = (S.fit.plan.week[k])||[];
  let html = `<div class="fit-day-head"><span class="fit-day-wk">${FIT_WK_LABEL[k]}</span>`;
  html += plan.length ? `<span class="fit-day-label">训练日 · ${plan.length} 个动作</span>` : `<span class="fit-day-label">休息日</span>`;
  const day = fitEnsureLog(TODAY);
  if(day.done) html += `<span class="fit-day-done">✓ 已完成</span>`;
  html += `</div>`;

  if(!plan.length){
    html += `<div class="fit-rest-day"><div class="fit-rest-glyph">🌙</div>
      <div class="fit-rest-title">今日休息 · 主动恢复</div>
      <div class="fit-rest-sub">今天没有安排训练。去「计划」给这一天加动作，或好好恢复。</div></div>`;
    html += fitTimersHtml();
    body.innerHTML = html;
    return;
  }
  if(day.done){
    html += `<div class="fit-checkin"><span class="fit-checkin-ic">🔥</span>
      <span class="fit-checkin-tx">今日训练已完成 · 连续 <b>${fitComputeStreak()}</b> 天</span></div>`;
  }
  day.entries.forEach((en,ei)=>{
    const complete = fitExComplete(en);
    const prog = (en.done||[]).filter(x=>x!=null).length;
    html += `<div class="fit-ex ${complete?'done':''}">
      <div class="fit-ex-top">
        <span class="fit-ex-name">${fitEsc(en.name)}</span>
        <span class="fit-ex-target">${fitTargetLabel(en)}</span>
        ${complete?'<span class="fit-ex-done-ic">✓</span>':`<span class="fit-ex-prog">${prog}/${en.sets}</span>`}
      </div>
      <div class="fit-sets">${fitPipsHtml(en,ei)}</div>
      <div style="text-align:right;margin-top:8px;"><button class="fit-btn mini" onclick="fitEditReps(${ei})">✎ 记次数</button></div>
    </div>`;
  });
  html += fitTimersHtml();
  body.innerHTML = html;
}
function fitPipsHtml(en, ei){
  let s='';
  for(let j=0;j<en.sets;j++){
    const v=(en.done||[])[j]; const done=v!=null;
    const num = done ? (en.kind==='time'? v+'s' : v) : (en.kind==='time'? en.target+'s' : en.target);
    s += `<button class="fit-pip ${done?'done':''} ${en.kind==='time'?'time':''}" onclick="fitToggleSet(${ei},${j})">
      <span class="fit-pip-n">${num}</span><span class="fit-pip-l">第${j+1}组</span></button>`;
  }
  return s;
}
function fitToggleSet(ei, j){
  const day = fitEnsureLog(TODAY);
  const en = day.entries[ei]; if(!en) return;
  if(!en.done) en.done=[];
  const undo = en.done[j]!=null;
  if(undo){ en.done[j]=null; }
  else {
    en.done[j] = en.target||0;
    if(en.kind==='time' && en.target>0) fitTimerStartDown(en.target);   // hold → start countdown
  }
  fitAfterChange(undo);
}
function fitEditReps(ei){
  const day = fitEnsureLog(TODAY);
  const en = day.entries[ei]; if(!en) return;
  const unit = en.kind==='time'?'秒':'次';
  let rows='';
  for(let j=0;j<en.sets;j++){ const v=(en.done||[])[j];
    rows += `<div class="fin-field"><label>第 ${j+1} 组（${unit}）</label>
      <input type="number" inputmode="numeric" id="fit-rep-${j}" value="${v!=null?v:''}" placeholder="${en.target||''}"></div>`; }
  fitModal(`<div class="fin-form-title">${fitEsc(en.name)} · 记次数</div>${rows}
    <div class="fin-form-btns"><button class="fit-btn" onclick="fitCloseModal()">取消</button>
    <button class="fit-btn brass" onclick="fitSaveReps(${ei})">保存</button></div>`);
}
function fitSaveReps(ei){
  const day = fitEnsureLog(TODAY);
  const en = day.entries[ei]; if(!en) return;
  if(!en.done) en.done=[];
  for(let j=0;j<en.sets;j++){ const el=document.getElementById('fit-rep-'+j); const raw=el?el.value.trim():'';
    en.done[j] = raw==='' ? null : Math.max(0, parseInt(raw,10)||0); }
  fitCloseModal();
  fitAfterChange();
}

/* ════════════ timers — two independent (stopwatch + countdown) ════════════ */
const fitTimer = { up:{ running:false, startTs:0, acc:0 }, down:{ running:false, endTs:0, remain:0, total:0 } };
let _fitTick = null;
function fitFmt(sec){ sec=Math.max(0,Math.round(sec)); const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;
  const mm=String(m).padStart(2,'0'), ss=String(s).padStart(2,'0'); return h>0?`${h}:${mm}:${ss}`:`${m}:${ss}`; }
function fitUpElapsed(){ const u=fitTimer.up; return (u.acc + (u.running? (Date.now()-u.startTs):0))/1000; }
function fitDownRemain(){ const d=fitTimer.down; return d.running ? Math.max(0,(d.endTs-Date.now())/1000) : d.remain; }

function fitTimersHtml(){
  return `<div class="fit-timers">
    <div class="fit-timer count" id="fit-timer-up">
      <div class="fit-timer-cap">总时长 · 正计时</div>
      <div class="fit-timer-disp" id="fit-up-disp">${fitFmt(fitUpElapsed())}</div>
      <div class="fit-timer-btns">
        <button id="fit-up-toggle" onclick="fitUpToggle()">${fitTimer.up.running?'暂停':'开始'}</button>
        <button onclick="fitUpReset()">归零</button>
      </div>
    </div>
    <div class="fit-timer down" id="fit-timer-down">
      <div class="fit-timer-cap">组间 · 倒计时</div>
      <div class="fit-timer-disp" id="fit-down-disp">${fitFmt(fitDownRemain())}</div>
      <div class="fit-timer-btns">
        <button id="fit-down-toggle" onclick="fitDownToggle()">${fitTimer.down.running?'暂停':'开始'}</button>
        <button onclick="fitDownReset()">复位</button>
      </div>
      <div class="fit-timer-presets">
        <button onclick="fitTimerStartDown(60)">60s</button>
        <button onclick="fitTimerStartDown(90)">90s</button>
        <button onclick="fitTimerStartDown(120)">120s</button>
        <button onclick="fitDownCustom()">自定义</button>
      </div>
    </div>
  </div>`;
}
function fitStartTicker(){ if(_fitTick) return; _fitTick=setInterval(fitTickRender, 500); }
function fitStopTicker(){ if(_fitTick){ clearInterval(_fitTick); _fitTick=null; } }
function fitTickRender(){
  const up=document.getElementById('fit-up-disp'); if(up) up.textContent=fitFmt(fitUpElapsed());
  const dn=document.getElementById('fit-down-disp'); if(dn) dn.textContent=fitFmt(fitDownRemain());
  const ut=document.getElementById('fit-up-toggle'); if(ut) ut.textContent=fitTimer.up.running?'暂停':'开始';
  const dt=document.getElementById('fit-down-toggle'); if(dt) dt.textContent=fitTimer.down.running?'暂停':'开始';
  const d=fitTimer.down;
  if(d.running && (d.endTs-Date.now())<=0){ d.running=false; d.remain=0; fitDownRing(); }
}
function fitUpToggle(){ const u=fitTimer.up;
  if(u.running){ u.acc += Date.now()-u.startTs; u.running=false; fitSaveDuration(); }
  else { u.startTs=Date.now(); u.running=true; }
  fitTickRender();
}
function fitUpReset(){ fitTimer.up={running:false,startTs:0,acc:0}; fitSaveDuration(); fitTickRender(); }
function fitSaveDuration(){ const day=S.fit.log[TODAY]; if(!day) return; const sec=Math.round(fitUpElapsed());
  if(sec>(day.durationSec||0)){ day.durationSec=sec; saveFitLog(TODAY); } }
function fitDownToggle(){ const d=fitTimer.down;
  if(d.running){ d.remain=fitDownRemain(); d.running=false; }
  else { if(d.remain<=0) d.remain=d.total||60; d.endTs=Date.now()+d.remain*1000; d.running=true; }
  fitTickRender();
}
function fitDownReset(){ const d=fitTimer.down; d.remain=d.total||0; d.running=false; fitTickRender(); }
function fitTimerStartDown(sec){ const d=fitTimer.down; d.total=sec; d.remain=sec; d.endTs=Date.now()+sec*1000; d.running=true; fitTickRender(); }
function fitDownRing(){
  const el=document.getElementById('fit-timer-down'); if(el){ el.classList.add('ring'); setTimeout(()=>el.classList.remove('ring'),1600); }
  fitSfx('quest');
  if(navigator.vibrate) try{ navigator.vibrate([180,90,180]); }catch(e){}
}
function fitDownCustom(){
  fitModal(`<div class="fin-form-title">自定义倒计时</div>
    <div class="fin-field"><label>秒数</label><input type="number" inputmode="numeric" id="fit-down-secs" value="${fitTimer.down.total||60}"></div>
    <div class="fin-form-btns"><button class="fit-btn" onclick="fitCloseModal()">取消</button>
    <button class="fit-btn brass" onclick="fitDownCustomGo()">开始</button></div>`);
  setTimeout(()=>{ const el=document.getElementById('fit-down-secs'); if(el) el.focus(); },50);
}
function fitDownCustomGo(){ const el=document.getElementById('fit-down-secs'); const s=Math.max(1,parseInt(el?el.value:'',10)||0); fitCloseModal(); if(s) fitTimerStartDown(s); }

/* ════════════ 计划 plan + exercise library ════════════ */
function rFitPlan(body){
  const week = S.fit.plan.week||{};
  const todayKey = fitWeekdayKey(TODAY);
  let html = `<div class="fit-sec"><div class="fit-sec-head"><span>每周计划</span><span style="color:var(--ghost);font-size:11px;">点目标可编辑</span></div>`;
  FIT_WEEK_KEYS.forEach(k=>{
    const slots = week[k]||[];
    html += `<div class="fit-pday ${slots.length?'':'rest'}">
      <div class="fit-pday-head"><span class="fit-pday-name">${FIT_WK_LABEL[k]}</span>
        ${k===todayKey?'<span class="fit-pday-today">今天</span>':''}
        <span class="fit-pday-tools"><button class="fit-btn mini" onclick="fitAddSlot('${k}')">+ 动作</button></span></div>`;
    if(!slots.length) html += `<div class="fit-pempty">休息日</div>`;
    else slots.forEach((slot,i)=>{ const ex=fitExById(slot.exId);
      html += `<div class="fit-slot"><span class="fit-slot-name">${ex?fitEsc(ex.name):'（已删除）'}</span>
        <button class="fit-slot-target" onclick="fitEditSlot('${k}',${i})">${slot.sets||1}×${slot.target||0}${ex&&ex.kind==='time'?'s':''}</button>
        <button class="fit-slot-x" onclick="fitDelSlot('${k}',${i})" aria-label="删除">×</button></div>`; });
    html += `</div>`;
  });
  html += `</div>`;

  html += `<div class="fit-sec"><div class="fit-sec-head"><span>组间休息默认</span></div>
    <div style="display:flex;align-items:center;gap:10px;">
      <input type="number" inputmode="numeric" id="fit-rest-default" value="${S.fit.plan.restDefault||90}" style="width:100px;"> 秒
      <button class="fit-btn mini" onclick="fitSaveRestDefault()">保存</button></div></div>`;

  html += `<div class="fit-sec"><div class="fit-sec-head"><span>动作库</span><button class="fit-btn mini" onclick="fitAddExercise()">+ 新动作</button></div>`;
  const exs = S.fit.exercises.slice().sort((a,b)=>(a.sort||0)-(b.sort||0));
  if(!exs.length) html += `<div class="fit-empty">还没有动作。点「+ 新动作」添加，或打开「今日」自动载入预设。</div>`;
  exs.forEach(ex=>{
    html += `<div class="fit-lib-row ${ex.archived?'archived':''}">
      <span class="fit-lib-name">${fitEsc(ex.name)}</span>
      <span class="fit-lib-kind">${ex.kind==='time'?'计时':'计次'}</span>
      <span class="fit-lib-tools">
        <button onclick="fitEditExercise('${ex.id}')" aria-label="编辑">✎</button>
        <button onclick="fitToggleArchiveExercise('${ex.id}')" aria-label="归档">${ex.archived?'↺':'🗑'}</button>
      </span></div>`;
  });
  html += `</div>`;
  body.innerHTML = html;
}
function fitAddSlot(k){ fitSlotModal(k, -1); }
function fitEditSlot(k, i){ fitSlotModal(k, i); }
function fitSlotModal(k, i){
  const slots = S.fit.plan.week[k]||[];
  const cur = i>=0 ? slots[i] : null;
  const exs = fitActiveExercises();
  if(!exs.length){ fitModal(`<div class="fin-form-title">先添加动作</div>
    <div class="fin-hint">动作库是空的。先到下方「动作库」添加一个动作。</div>
    <div class="fin-form-btns"><button class="fit-btn brass" onclick="fitCloseModal()">好</button></div>`); return; }
  const selId = cur?cur.exId:exs[0].id;
  const opts = exs.map(e=>`<option value="${e.id}" ${e.id===selId?'selected':''}>${fitEsc(e.name)}</option>`).join('');
  fitModal(`<div class="fin-form-title">${FIT_WK_LABEL[k]} · ${cur?'编辑':'添加'}动作</div>
    <div class="fin-field"><label>动作</label><select id="fit-slot-ex">${opts}</select></div>
    <div class="fin-amt-row">
      <div class="fin-field" style="flex:1"><label>组数</label><input type="number" inputmode="numeric" id="fit-slot-sets" value="${cur?cur.sets:3}"></div>
      <div class="fin-field" style="flex:1"><label>目标（次/秒）</label><input type="number" inputmode="numeric" id="fit-slot-target" value="${cur?cur.target:12}"></div>
    </div>
    <div class="fin-form-btns">
      ${cur?`<button class="fit-btn" onclick="fitDelSlot('${k}',${i});fitCloseModal()">删除</button>`:''}
      <button class="fit-btn" onclick="fitCloseModal()">取消</button>
      <button class="fit-btn brass" onclick="fitSaveSlot('${k}',${i})">保存</button></div>`);
}
function fitSaveSlot(k, i){
  const exId = document.getElementById('fit-slot-ex').value;
  const sets = Math.max(1, parseInt(document.getElementById('fit-slot-sets').value,10)||1);
  const target = Math.max(0, parseInt(document.getElementById('fit-slot-target').value,10)||0);
  if(!S.fit.plan.week[k]) S.fit.plan.week[k]=[];
  const slot = { exId, sets, target };
  if(i>=0) S.fit.plan.week[k][i]=slot; else S.fit.plan.week[k].push(slot);
  saveFitPlan(); fitCloseModal(); fitSfx('save'); rFitness();
}
function fitDelSlot(k, i){
  const arr = S.fit.plan.week[k]; if(!arr) return;
  arr.splice(i,1); if(!arr.length) delete S.fit.plan.week[k];
  saveFitPlan(); rFitness();
}
function fitSaveRestDefault(){
  const v = Math.max(0, parseInt(document.getElementById('fit-rest-default').value,10)||90);
  S.fit.plan.restDefault=v; saveFitPlan(); fitSfx('save');
}
function fitAddExercise(){ fitExerciseModal(''); }
function fitEditExercise(id){ fitExerciseModal(id); }
function fitExerciseModal(id){
  const ex = id?fitExById(id):null;
  fitModal(`<div class="fin-form-title">${ex?'编辑动作':'新动作'}</div>
    <div class="fin-field"><label>名称</label><input type="text" id="fit-ex-name" value="${ex?fitEsc(ex.name):''}" placeholder="例如 引体向上"></div>
    <div class="fin-field"><label>类型</label>
      <div class="fin-seg" id="fit-ex-kindseg">
        <button type="button" class="fin-seg-btn ${(!ex||ex.kind==='reps')?'active':''}" data-k="reps" onclick="fitExSetKind('reps')">计次</button>
        <button type="button" class="fin-seg-btn ${ex&&ex.kind==='time'?'active':''}" data-k="time" onclick="fitExSetKind('time')">计时(秒)</button>
      </div><input type="hidden" id="fit-ex-kind" value="${ex?ex.kind:'reps'}"></div>
    <div class="fin-form-btns"><button class="fit-btn" onclick="fitCloseModal()">取消</button>
    <button class="fit-btn brass" onclick="fitSaveExercise('${id||''}')">保存</button></div>`);
}
function fitExSetKind(k){ document.getElementById('fit-ex-kind').value=k;
  document.querySelectorAll('#fit-ex-kindseg .fin-seg-btn').forEach(b=>b.classList.toggle('active', b.dataset.k===k)); }
function fitSaveExercise(id){
  const name = (document.getElementById('fit-ex-name').value||'').trim(); if(!name) return;
  const kind = document.getElementById('fit-ex-kind').value||'reps';
  if(id){ const ex=fitExById(id); if(ex){ ex.name=name; ex.kind=kind; } }
  else { S.fit.exercises.push({ id:crypto.randomUUID(), name, kind, isPreset:false, sort:S.fit.exercises.length, archived:false }); }
  saveFitExercises(); fitCloseModal(); fitSfx('save'); rFitness();
}
function fitToggleArchiveExercise(id){ const ex=fitExById(id); if(!ex) return; ex.archived=!ex.archived; saveFitExercises(); rFitness(); }

/* ════════════ 趋势 trends ════════════ */
let _fitCharts = [];
function fitDestroyCharts(){ _fitCharts.forEach(c=>{ try{ c.destroy(); }catch(e){} }); _fitCharts=[]; }
function rFitTrends(body){
  const streak=fitComputeStreak(), workouts=fitWorkoutCount(), reps=fitTotalReps();
  let html = `<div class="fit-stat-grid">
    <div class="fit-stat"><div class="fit-stat-n">${streak}</div><div class="fit-stat-l">连续天数</div></div>
    <div class="fit-stat"><div class="fit-stat-n">${workouts}</div><div class="fit-stat-l">累计训练</div></div>
    <div class="fit-stat"><div class="fit-stat-n">${reps}</div><div class="fit-stat-l">累计次数</div></div>
  </div>`;
  html += `<div class="fit-chart-card"><div class="fit-chart-title"><span>体征趋势</span><button class="fit-btn mini" onclick="fitBodyModal()">+ 记录</button></div>
    <div class="fit-dim-chips">${FIT_DIMS.map(d=>`<button class="fit-dim-chip ${fitUI.trendDim===d.k?'active':''}" onclick="fitSetDim('${d.k}')">${d.l}</button>`).join('')}</div>
    <div class="fit-chart-wrap"><canvas id="fit-body-chart"></canvas></div></div>`;
  html += `<div class="fit-chart-card"><div class="fit-chart-title"><span>每周训练量</span></div>
    <div class="fit-chart-wrap"><canvas id="fit-vol-chart"></canvas></div></div>`;
  body.innerHTML = html;
  fitDestroyCharts();
  if(typeof ensureChartJs==='function'){
    ensureChartJs().then(()=>{ if(fitUI.open && fitUI.tab==='trends'){ fitDrawBodyChart(); fitDrawVolChart(); } }).catch(()=>{});
  }
}
function fitSetDim(k){ fitUI.trendDim=k; const body=document.getElementById('fit-body'); if(body) rFitTrends(body); }
function fitChartColors(){ return (typeof finChartColors==='function') ? finChartColors()
  : { ink:'#222', mute:'#666', ghost:'#999', hair:'#ddd', brass:'#A88455' }; }
function fitChartOpts(c){ return { responsive:true, maintainAspectRatio:false, animation:{duration:400},
  plugins:{ legend:{ display:false } },
  scales:{ x:{ ticks:{ color:c.ghost, font:{size:10} }, grid:{ display:false } },
           y:{ ticks:{ color:c.ghost, font:{size:10} }, grid:{ color:c.hair } } } }; }
function fitDrawBodyChart(){
  const cv=document.getElementById('fit-body-chart'); if(!cv||!window.Chart) return;
  const dim=FIT_DIMS.find(d=>d.k===fitUI.trendDim)||FIT_DIMS[0];
  const dates=Object.keys(S.fit.body).sort(); const labels=[], vals=[];
  dates.forEach(d=>{ const b=S.fit.body[d]; let v = dim.k==='weight'? b.weight : (b.metrics?b.metrics[dim.k]:null);
    if(v!=null){ labels.push(d.slice(5)); vals.push(Number(v)); } });
  const c=fitChartColors();
  if(!vals.length){ const ctx=cv.getContext('2d'); ctx.clearRect(0,0,cv.width,cv.height);
    ctx.fillStyle=c.ghost; ctx.font='12px sans-serif'; ctx.textAlign='center';
    ctx.fillText('暂无 '+dim.l+' 记录', cv.width/2, cv.height/2); return; }
  _fitCharts.push(new Chart(cv,{ type:'line',
    data:{ labels, datasets:[{ label:dim.l, data:vals, borderColor:c.brass, backgroundColor:'transparent', tension:.3, pointRadius:3, pointBackgroundColor:c.brass }] },
    options:fitChartOpts(c) }));
}
function fitDrawVolChart(){
  const cv=document.getElementById('fit-vol-chart'); if(!cv||!window.Chart) return;
  const now=new Date(TODAY+'T00:00:00'); const dow=(now.getDay()+6)%7;
  const thisMon=new Date(now); thisMon.setDate(now.getDate()-dow);
  const labels=[], vals=[];
  for(let w=7; w>=0; w--){ const mon=new Date(thisMon); mon.setDate(thisMon.getDate()-w*7); let tot=0;
    for(let i=0;i<7;i++){ const d=new Date(mon); d.setDate(mon.getDate()+i); const ds=d.toLocaleDateString('sv-SE');
      const day=S.fit.log[ds]; if(day) (day.entries||[]).forEach(en=>{ if(en.kind!=='time') (en.done||[]).forEach(r=>{ if(r!=null) tot+=r; }); }); }
    labels.push(`${mon.getMonth()+1}/${mon.getDate()}`); vals.push(tot); }
  const c=fitChartColors();
  _fitCharts.push(new Chart(cv,{ type:'bar',
    data:{ labels, datasets:[{ label:'次数', data:vals, backgroundColor:c.brass, borderRadius:3 }] },
    options:fitChartOpts(c) }));
}
function fitBodyModal(){
  const b=S.fit.body[TODAY]||{metrics:{}};
  const fields=FIT_DIMS.map(dim=>{ const v = dim.k==='weight'? (b.weight!=null?b.weight:'') : (b.metrics&&b.metrics[dim.k]!=null?b.metrics[dim.k]:'');
    return `<div class="fin-field" style="flex:1;min-width:120px"><label>${dim.l} (${dim.u})</label>
      <input type="number" inputmode="decimal" id="fit-body-${dim.k}" value="${v}"></div>`; }).join('');
  fitModal(`<div class="fin-form-title">记录体征 · ${TODAY}</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;">${fields}</div>
    <div class="fin-form-btns"><button class="fit-btn" onclick="fitCloseModal()">取消</button>
    <button class="fit-btn brass" onclick="fitSaveBody()">保存</button></div>`);
}
function fitSaveBody(){
  const w=(document.getElementById('fit-body-weight').value||'').trim();
  const metrics={};
  FIT_DIMS.forEach(dim=>{ if(dim.k==='weight') return; const el=document.getElementById('fit-body-'+dim.k);
    const v=el?el.value.trim():''; if(v!=='') metrics[dim.k]=Number(v); });
  S.fit.body[TODAY]={ weight: w===''?null:Number(w), metrics };
  saveFitBody(TODAY); fitCloseModal(); fitSfx('save');
  if(typeof rpgAfterChange==='function') rpgAfterChange();
  rFitness();
}

/* ════════════ 饮食 diet ════════════ */
function rFitDiet(body){
  const d=fitUI.dietDate; const day=S.fit.diet[d]||{meals:[]}; const meals=day.meals||[];
  let html = `<div class="fit-diet-head">
    <button class="fit-diet-nav" onclick="fitDietNav(-1)">‹</button>
    <span class="fit-diet-date">${d===TODAY?'今天':d}</span>
    <button class="fit-diet-nav" onclick="fitDietNav(1)" ${d>=TODAY?'disabled style=\"opacity:.4\"':''}>›</button>
    <button class="fit-btn mini" style="margin-left:auto" onclick="fitMealModal()">+ 记一餐</button></div>`;
  if(!meals.length) html += `<div class="fit-empty">还没有记录。点「+ 记一餐」。</div>`;
  else {
    let tot=0;
    meals.forEach((m,i)=>{ if(m.kcal) tot+=Number(m.kcal)||0;
      html += `<div class="fit-meal"><span class="fit-meal-time">${fitEsc(m.time||'')}</span>
        <span class="fit-meal-name">${fitEsc(m.name)}</span>
        ${m.kcal?`<span class="fit-meal-kcal">${m.kcal} kcal</span>`:''}
        <button class="fit-meal-x" onclick="fitDelMeal(${i})" aria-label="删除">×</button></div>`; });
    if(tot) html += `<div class="fit-diet-total">合计 ${tot} kcal</div>`;
  }
  body.innerHTML = html;
}
function fitDietNav(dir){
  const d=new Date(fitUI.dietDate+'T00:00:00'); d.setDate(d.getDate()+dir);
  const ds=d.toLocaleDateString('sv-SE'); if(ds>TODAY) return;
  fitUI.dietDate=ds; rFitness();
}
function fitMealModal(){
  const now=new Date(); const hh=String(now.getHours()).padStart(2,'0'), mm=String(now.getMinutes()).padStart(2,'0');
  fitModal(`<div class="fin-form-title">记一餐 · ${fitUI.dietDate===TODAY?'今天':fitUI.dietDate}</div>
    <div class="fin-field"><label>内容</label><input type="text" id="fit-meal-name" placeholder="例如 鸡胸肉 + 米饭"></div>
    <div class="fin-amt-row">
      <div class="fin-field" style="flex:1"><label>时间</label><input type="text" id="fit-meal-time" value="${hh}:${mm}"></div>
      <div class="fin-field" style="flex:1"><label>热量 kcal（可选）</label><input type="number" inputmode="numeric" id="fit-meal-kcal"></div></div>
    <div class="fin-form-btns"><button class="fit-btn" onclick="fitCloseModal()">取消</button>
    <button class="fit-btn brass" onclick="fitSaveMeal()">保存</button></div>`);
  setTimeout(()=>{ const el=document.getElementById('fit-meal-name'); if(el) el.focus(); },50);
}
function fitSaveMeal(){
  const name=(document.getElementById('fit-meal-name').value||'').trim(); if(!name) return;
  let time=(document.getElementById('fit-meal-time').value||'').trim();
  const _tm=/^(\d{1,2}):(\d{2})$/.exec(time); if(_tm) time=_tm[1].padStart(2,'0')+':'+_tm[2];   // zero-pad so the sort doesn't put 9:30 after 10:00
  const kcalRaw=(document.getElementById('fit-meal-kcal').value||'').trim();
  const d=fitUI.dietDate; if(!S.fit.diet[d]) S.fit.diet[d]={meals:[]};
  S.fit.diet[d].meals.push({ name, time, kcal: kcalRaw===''?null:Number(kcalRaw), note:'' });
  S.fit.diet[d].meals.sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  saveFitDiet(d); fitCloseModal(); fitSfx('save'); rFitness();
}
function fitDelMeal(i){ const d=fitUI.dietDate; const day=S.fit.diet[d]; if(!day) return;
  day.meals.splice(i,1); saveFitDiet(d); rFitness(); }
