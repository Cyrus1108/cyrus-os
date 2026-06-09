/* RPG "System" layer — a Solo-Leveling-style character panel rendered in the
   classic brass theme. Everything visible is COMPUTED from real CyrusOS data;
   only seenLevel + unlocked achievements are persisted (S.rpg, rpg_state table).

   Cumulative level/EXP comes from The 90's historical check-ins (frozen → monotonic),
   so a level once gained never drops. Attributes reflect recent 30-day form.
   The 90 targets → attributes:  V 健身→STR · II 篮球→AGI · IV 日语→INT · III 赚钱→WIS · I 睡眠→VIT */

const RPG_ATTR_MAP = {
  V:  { key:'STR', name:'力量', icon:'⚔' },   // 健身
  II: { key:'AGI', name:'敏捷', icon:'➹' },   // 篮球
  IV: { key:'INT', name:'智力', icon:'✦' },   // 日语
  III:{ key:'WIS', name:'智慧', icon:'☯' },   // 赚钱
  I:  { key:'VIT', name:'体力', icon:'❀' },   // 睡眠
};
const RPG_ATTR_ORDER = ['V','II','IV','III','I']; // STR, AGI, INT, WIS, VIT
const RPG_TITLES = { E:'觉醒者', D:'挑战者', C:'攀登者', B:'破限者', A:'支配者', S:'君主' };

/* ── pure helpers ── */
function rpgTargets(){
  return (S.the90 && S.the90.meta && S.the90.meta.targets)
    || (typeof THE_90_TARGETS_DEFAULT !== 'undefined' ? THE_90_TARGETS_DEFAULT : []);
}
function rpgMetOn(dateStr){
  // # of targets met on a given date (0..5)
  if(typeof the90Phase!=='function' || typeof the90Day!=='function' || typeof the90ScoreMet!=='function') return 0;
  const day = S.the90 && S.the90.daily && S.the90.daily[dateStr];
  if(!day) return 0;
  const phase = the90Phase(the90Day(dateStr));
  const scores = day.scores || {};
  let met = 0;
  for(const t of rpgTargets()){ if(the90ScoreMet(scores[t.id], phase)) met++; }
  return met;
}
function rpgTotalExp(){
  // Σ over all past+today days: metCount*10 + perfect-day(25). + phase milestones reached.
  let exp = 0;
  const daily = (S.the90 && S.the90.daily) || {};
  const nTargets = rpgTargets().length;
  for(const date in daily){
    if(date > TODAY) continue;
    const met = rpgMetOn(date);
    exp += met * 10;
    if(nTargets && met === nTargets) exp += 25;
  }
  if(typeof the90Day === 'function'){
    const d = the90Day();
    if(d >= 30) exp += 50;
    if(d >= 60) exp += 50;
    if(d >= 90) exp += 50;
  }
  return exp;
}
function rpgExpForLevel(L){
  // cumulative EXP required to BE at level L (k→k+1 costs 100+(k-1)*25)
  let sum = 0;
  for(let k=1; k<L; k++) sum += 100 + (k-1)*25;
  return sum;
}
function rpgLevelFromExp(e){
  let L = 1;
  while(e >= rpgExpForLevel(L+1)) L++;
  return L;
}
function rpgRank(L){
  if(L>=80) return 'S';
  if(L>=55) return 'A';
  if(L>=35) return 'B';
  if(L>=20) return 'C';
  if(L>=10) return 'D';
  return 'E';
}
function rpgAttrValue(targetId){
  // recent form: 10 + days-met in the last 30 (→ 10..40)
  let count = 0;
  for(let i=0;i<30;i++){
    const d = new Date(TODAY + 'T00:00:00+08:00'); d.setDate(d.getDate() - i);
    const ds = d.toLocaleDateString('sv-SE');
    if(ds > TODAY) continue;
    const day = S.the90 && S.the90.daily && S.the90.daily[ds];
    if(!day) continue;
    if(typeof the90Phase==='function' && typeof the90Day==='function' && typeof the90ScoreMet==='function'){
      const phase = the90Phase(the90Day(ds));
      if(the90ScoreMet((day.scores||{})[targetId], phase)) count++;
    }
  }
  return 10 + count;
}
function rpgPerfectToday(){
  const n = rpgTargets().length;
  return n>0 && rpgMetOn(TODAY) === n;
}
function rpgTodayExp(){
  // soft "today's activity" meter across all modules (display only, resets daily)
  let e = 0;
  const n = rpgTargets().length;
  const met = rpgMetOn(TODAY);
  e += met*10; if(n && met===n) e += 25;
  const mr = (S.mr && S.mr.list) || []; if(mr.length && mr.every(i=>i.d)) e += 5;
  const tr = (S.tr && S.tr.list) || []; if(tr.length && tr.every(i=>i.d)) e += 5;
  if(S.jp && S.jp.log && S.jp.log[TODAY]) e += 8;
  const todos = S.todos || [];
  e += todos.filter(t => t.done && t.doneAt && new Date(t.doneAt).toLocaleDateString('sv-SE')===TODAY).length * 2;
  const ac = S.ac || [];
  e += Math.min(ac.filter(t=>t.done).length, 5) * 3;
  return e;
}
function computeRPG(){
  const totalExp = rpgTotalExp();
  const level = rpgLevelFromExp(totalExp);
  const curBase = rpgExpForLevel(level);
  const nextBase = rpgExpForLevel(level+1);
  const rank = rpgRank(level);
  const attrs = {};
  for(const tid of RPG_ATTR_ORDER){ attrs[RPG_ATTR_MAP[tid].key] = rpgAttrValue(tid); }
  return {
    totalExp, level, rank,
    title: RPG_TITLES[rank] || '',
    expInLevel: totalExp - curBase,
    expForLevel: nextBase - curBase,
    attrs, todayExp: rpgTodayExp(),
  };
}

/* ── achievements (tested against real data) ── */
const RPG_ACHIEVEMENTS = [
  { id:'streak3',  name:'三日不辍', desc:'The 90 连续达标 3 天', hidden:false, test:()=> (typeof computeThe90Streak==='function' && computeThe90Streak()>=3) },
  { id:'streak7',  name:'一周如一', desc:'连续达标 7 天',        hidden:false, test:()=> (typeof computeThe90Streak==='function' && computeThe90Streak()>=7) },
  { id:'streak30', name:'而立之恒', desc:'连续达标 30 天',       hidden:false, test:()=> (typeof computeThe90Streak==='function' && computeThe90Streak()>=30) },
  { id:'day30',    name:'第一阶段', desc:'抵达 The 90 第 30 天', hidden:false, test:()=> (typeof the90Day==='function' && the90Day()>=30) },
  { id:'day60',    name:'第二阶段', desc:'抵达第 60 天',         hidden:false, test:()=> (typeof the90Day==='function' && the90Day()>=60) },
  { id:'day90',    name:'登顶',     desc:'完成 90 天的旅程',     hidden:false, test:()=> (typeof the90Day==='function' && the90Day()>=90) },
  { id:'perfect',  name:'圆满一日', desc:'单日五项目标全部达成', hidden:false, test:()=> rpgPerfectToday() },
  { id:'n2_10',    name:'语之初径', desc:'N2 连续打卡 10 天',    hidden:false, test:()=> (S.jp && S.jp.streak>=10) },
  { id:'n2_30',    name:'言之恒心', desc:'N2 连续打卡 30 天',    hidden:false, test:()=> (S.jp && S.jp.streak>=30) },
  { id:'lv10',     name:'D 级觉醒', desc:'等级达到 10',          hidden:false, test:(r)=> r.level>=10 },
  { id:'lv20',     name:'C 级猎人', desc:'等级达到 20',          hidden:true,  test:(r)=> r.level>=20 },
  { id:'cleardesk',name:'万事清零', desc:'把待办全部清空',        hidden:true,  test:()=> (S.todos && S.todos.length>0 && S.todos.every(t=>t.done)) },
];

/* ── orchestration: recompute, fire level-ups + achievements, persist ── */
let _rpgLastExp = null;
function rpgAfterChange(){
  if(!S.rpg) return;
  const rpg = computeRPG();
  const firstRun = (S.rpg.seenLevel===1 && Object.keys(S.rpg.achievements||{}).length===0 && (rpg.level>1 || rpg.totalExp>0));
  let changed = false;

  if(firstRun){
    // silent backfill so an existing user doesn't get a flood of pop-ups on first load
    S.rpg.seenLevel = rpg.level;
    for(const a of RPG_ACHIEVEMENTS){ try{ if(a.test(rpg)) S.rpg.achievements[a.id] = new Date().toISOString(); }catch(e){} }
    changed = true;
  } else {
    if(_rpgLastExp != null && rpg.totalExp > _rpgLastExp){
      sysToast('[ 系统 ] +' + (rpg.totalExp - _rpgLastExp) + ' 经验');
    }
    if(rpg.level > (S.rpg.seenLevel || 1)){
      const from = S.rpg.seenLevel || 1;
      S.rpg.seenLevel = rpg.level;
      changed = true;
      sysCelebrate({ type:'levelup', from, to:rpg.level, rank:rpg.rank, title:rpg.title });
    }
    for(const a of RPG_ACHIEVEMENTS){
      if(S.rpg.achievements[a.id]) continue;
      let ok=false; try{ ok = a.test(rpg); }catch(e){}
      if(ok){
        S.rpg.achievements[a.id] = new Date().toISOString();
        changed = true;
        sysCelebrate({ type:'achievement', ach:a });
      }
    }
  }
  _rpgLastExp = rpg.totalExp;
  if(changed) saveRPG();
  if(sysUI.open && typeof rSystem==='function') rSystem();
}

/* ── transient toast (global) ── */
function sysToast(msg){
  let t = document.getElementById('sys-toast');
  if(!t){ t = document.createElement('div'); t.id='sys-toast'; t.className='sys-toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=> t.classList.remove('show'), 1800);
}

/* ── celebration modal (queued so batches don't stack) ── */
let _celebrateQueue = [], _celebrateActive = false;
function sysCelebrate(payload){ _celebrateQueue.push(payload); _celebrateFlush(); }
function _celebrateFlush(){
  if(_celebrateActive || !_celebrateQueue.length) return;
  _celebrateActive = true;
  sysShowModal(_celebrateQueue.shift());
}
function _celebrateDone(){ _celebrateActive = false; setTimeout(_celebrateFlush, 250); }

function sysShowModal(p){
  const m = document.getElementById('sys-modal'); if(!m){ _celebrateDone(); return; }
  let card;
  if(p.type==='levelup'){
    card = `<div class="sys-cele sys-cele-level">
      <div class="sys-cele-scan"></div>
      <div class="sys-corner tl"></div><div class="sys-corner tr"></div><div class="sys-corner bl"></div><div class="sys-corner br"></div>
      <div class="sys-cele-kicker">[ SYSTEM ]</div>
      <div class="sys-cele-title">LEVEL&nbsp;UP</div>
      <div class="sys-cele-num"><span id="sys-cele-num">${p.from}</span></div>
      <div class="sys-cele-rank">${p.rank} 级 · ${escH(p.title||'')}</div>
      <button class="sys-cele-close" onclick="sysCloseModal()">确定</button>
    </div>`;
  } else {
    const a = p.ach;
    card = `<div class="sys-cele sys-cele-ach">
      <div class="sys-cele-scan"></div>
      <div class="sys-corner tl"></div><div class="sys-corner tr"></div><div class="sys-corner bl"></div><div class="sys-corner br"></div>
      <div class="sys-cele-kicker">[ ${a.hidden?'隐藏任务 · HIDDEN QUEST':'成就解锁 · ACHIEVEMENT'} ]</div>
      <div class="sys-cele-badge">✦</div>
      <div class="sys-cele-title sys-cele-title-sm">${escH(a.name)}</div>
      <div class="sys-cele-desc">${escH(a.desc)}</div>
      <button class="sys-cele-close" onclick="sysCloseModal()">确定</button>
    </div>`;
  }
  m.innerHTML = `<div class="sys-modal-back" onclick="sysCloseModal()"></div>${card}`;
  m.classList.add('open'); m.setAttribute('aria-hidden','false');
  if(p.type==='levelup'){
    const num = document.getElementById('sys-cele-num');
    if(num && typeof animateNumber==='function') animateNumber(num, p.from, p.to, 700);
    else if(num) num.textContent = p.to;
  }
  if(typeof attachRipples==='function') attachRipples();
  clearTimeout(m._timer);
  m._timer = setTimeout(sysCloseModal, p.type==='levelup' ? 6000 : 4500);
}
function sysCloseModal(){
  const m = document.getElementById('sys-modal'); if(!m || !m.classList.contains('open')) return;
  m.classList.remove('open'); m.setAttribute('aria-hidden','true');
  clearTimeout(m._timer);
  _celebrateDone();
}

/* ── full-screen view (hash-routed like finance/motivation) ── */
const sysUI = { open:false };
function openSystem(fromHash){
  const v = document.getElementById('system-view'); if(!v) return;
  sysUI.open = true;
  v.classList.add('open'); v.setAttribute('aria-hidden','false');
  document.body.classList.add('sys-locked');
  if(!fromHash && location.hash!=='#system') location.hash='system';
  rSystem();
}
function closeSystem(fromHash){
  const v = document.getElementById('system-view'); if(!v) return;
  sysUI.open = false;
  v.classList.remove('open'); v.setAttribute('aria-hidden','true');
  document.body.classList.remove('sys-locked');
  if(!fromHash && location.hash==='#system') history.replaceState(null,'',location.pathname+location.search);
}
function sysHashRoute(){
  if(location.hash==='#system'){ if(!sysUI.open) openSystem(true); }
  else if(sysUI.open){ closeSystem(true); }
}
window.addEventListener('hashchange', sysHashRoute);

/* ── render the System / Character view ── */
function rSystem(){
  if(!sysUI.open) return;
  const body = document.getElementById('sys-body'); if(!body) return;
  const rpg = computeRPG();
  const pct = rpg.expForLevel>0 ? Math.min(100, Math.round(rpg.expInLevel/rpg.expForLevel*100)) : 0;

  const attrRows = RPG_ATTR_ORDER.map(tid=>{
    const m = RPG_ATTR_MAP[tid];
    const val = rpg.attrs[m.key];
    const apct = Math.min(100, Math.max(0, Math.round((val-10)/30*100)));
    return `<div class="sys-attr">
      <span class="sys-attr-icon">${m.icon}</span>
      <span class="sys-attr-name">${m.name}<i>${m.key}</i></span>
      <span class="sys-attr-bar"><i style="width:${apct}%"></i></span>
      <span class="sys-attr-val" data-attr="${m.key}">10</span>
    </div>`;
  }).join('');

  const achCards = RPG_ACHIEVEMENTS.map(a=>{
    const locked = !S.rpg.achievements[a.id];
    const masked = a.hidden && locked;
    return `<div class="sys-ach ${locked?'locked':'unlocked'}">
      <div class="sys-ach-badge">${locked?'🔒':'✦'}</div>
      <div class="sys-ach-name">${masked?'? ? ?':escH(a.name)}</div>
      <div class="sys-ach-desc">${masked?'隐藏成就':escH(a.desc)}</div>
    </div>`;
  }).join('');

  const logLines = Object.entries(S.rpg.achievements || {})
    .map(([id,ts])=>({ a:RPG_ACHIEVEMENTS.find(x=>x.id===id), ts }))
    .filter(x=>x.a)
    .sort((a,b)=>String(b.ts||'').localeCompare(String(a.ts||'')))
    .slice(0,8)
    .map(x=>`<div class="sys-log-line"><span class="sys-log-time">${String(x.ts||'').slice(5,10)}</span> 解锁成就「${escH(x.a.name)}」</div>`)
    .join('');

  body.innerHTML = `
    <div class="sys-card">
      <div class="sys-corner tl"></div><div class="sys-corner tr"></div><div class="sys-corner bl"></div><div class="sys-corner br"></div>
      <div class="sys-scan"></div>
      <div class="sys-rank-badge">${rpg.rank}</div>
      <div class="sys-card-main">
        <div class="sys-kicker">[ STATUS ]</div>
        <div class="sys-level">Lv <span id="sys-level-num">${rpg.level}</span><span class="sys-title"> · ${escH(rpg.title)}</span></div>
        <div class="sys-exp"><i style="width:${pct}%"></i></div>
        <div class="sys-exp-text">${rpg.expInLevel} / ${rpg.expForLevel} EXP　·　今日 +${rpg.todayExp}</div>
      </div>
    </div>
    <div class="sys-sec-label">属性 · ATTRIBUTES</div>
    <div class="sys-attrs">${attrRows}</div>
    <div class="sys-sec-label">成就 · ACHIEVEMENTS</div>
    <div class="sys-achs">${achCards}</div>
    ${logLines ? `<div class="sys-sec-label">系统日志 · LOG</div><div class="sys-log">${logLines}</div>` : ''}
  `;

  if(typeof animateNumber==='function'){
    RPG_ATTR_ORDER.forEach(tid=>{
      const m = RPG_ATTR_MAP[tid];
      const el = body.querySelector(`.sys-attr-val[data-attr="${m.key}"]`);
      if(el) animateNumber(el, 10, rpg.attrs[m.key], 500);
    });
  } else {
    RPG_ATTR_ORDER.forEach(tid=>{
      const m = RPG_ATTR_MAP[tid];
      const el = body.querySelector(`.sys-attr-val[data-attr="${m.key}"]`);
      if(el) el.textContent = rpg.attrs[m.key];
    });
  }
  if(typeof attachRipples==='function') attachRipples();
}

// Honour a deep-link to #system on first load.
sysHashRoute();
