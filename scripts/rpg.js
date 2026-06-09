/* RPG "System" layer — a Solo-Leveling-style character panel rendered in the
   classic brass theme. Everything visible is COMPUTED from real CyrusOS data;
   only seenLevel + unlocked achievements are persisted (S.rpg, rpg_state table).

   Cumulative level/EXP comes from The 90's historical check-ins (frozen → monotonic),
   so a level once gained never drops. Attributes reflect recent 30-day form.
   The 90 targets → attributes:  V 健身→STR · II 篮球→AGI · IV 日语→INT · III 赚钱→WIS · I 睡眠→VIT */

// icons carry U+FE0E (text-presentation selector) so they never render as
// full-colour OS emoji and stay monochrome with the brass / sterile palette
const RPG_ATTR_MAP = {
  V:  { key:'STR', name:'力量', icon:'⚔︎' },   // 健身
  II: { key:'AGI', name:'敏捷', icon:'➹︎' },   // 篮球
  IV: { key:'INT', name:'智力', icon:'✦︎' },   // 日语
  III:{ key:'WIS', name:'智慧', icon:'☯︎' },   // 赚钱
  I:  { key:'VIT', name:'体力', icon:'❀︎' },   // 睡眠
};
const RPG_ATTR_ORDER = ['V','II','IV','III','I']; // STR, AGI, INT, WIS, VIT
const RPG_TITLES = { E:'觉醒者', D:'挑战者', C:'攀登者', B:'破限者', A:'支配者', S:'君主' };
// per-pillar hues — MUST mirror the .sa-* colours in system.css (used for SVG fills)
const RPG_ATTR_COLOR = { STR:'#c66a45', AGI:'#94a05c', INT:'#cda63f', WIS:'#d6c391', VIT:'#9c6b3e' };

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
function rpgAttrValueAt(targetId, anchor){
  // recent form anchored at `anchor`: 10 + days-met in the 30 days ending there (→ 10..40)
  let count = 0;
  const base = new Date(anchor + 'T00:00:00+08:00');
  for(let i=0;i<30;i++){
    const d = new Date(base); d.setDate(base.getDate() - i);
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
function rpgAttrValue(targetId){ return rpgAttrValueAt(targetId, TODAY); }
function rpgPerfectToday(){
  const n = rpgTargets().length;
  return n>0 && rpgMetOn(TODAY) === n;
}
function rpgPerfectStreak(){
  // consecutive days (back from today) with ALL targets met
  const n = rpgTargets().length; if(!n) return 0;
  let streak = 0;
  const base = new Date(TODAY + 'T00:00:00+08:00');
  for(let i=0;i<120;i++){
    const dt = new Date(base); dt.setDate(base.getDate() - i);
    const ds = dt.toLocaleDateString('sv-SE');
    if(ds > TODAY) continue;
    if(rpgMetOn(ds) === n) streak++; else break;
  }
  return streak;
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
  const totalExp = rpgTotalExp() + ((S.rpg && S.rpg.bonusExp) || 0);
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

/* ── daily challenge (targets your weakest attribute) ── */
function rpgAttrToTargetId(attrKey){
  for(const tid in RPG_ATTR_MAP){ if(RPG_ATTR_MAP[tid].key===attrKey) return tid; }
  return null;
}
function rpgWeakestAttr(attrs){
  let mk=null, mv=Infinity;
  for(const tid of RPG_ATTR_ORDER){ const k=RPG_ATTR_MAP[tid].key; if(attrs[k] < mv){ mv=attrs[k]; mk=k; } }
  return mk;
}
function rpgTargetMetToday(targetId){
  if(typeof the90Phase!=='function' || typeof the90Day!=='function' || typeof the90ScoreMet!=='function') return false;
  const today = S.the90 && S.the90.daily && S.the90.daily[TODAY];
  if(!today) return false;
  const phase = the90Phase(the90Day());
  return the90ScoreMet((today.scores||{})[targetId], phase);
}
const RPG_CHALLENGE_TEXT = {
  STR: { verb:'完成今日「健身」目标', tip:'让身体记住力量。' },
  AGI: { verb:'完成今日「篮球」目标', tip:'保持身手的灵敏。' },
  INT: { verb:'完成今日「日语」目标', tip:'离 N2 再近一步。' },
  WIS: { verb:'完成今日「赚钱」目标', tip:'让钱开始为你工作。' },
  VIT: { verb:'完成今日「睡眠」目标', tip:'恢复，是更强的开始。' },
};
const RPG_CHALLENGE_EXP = 20;
// Roll today's challenge + auto-grant when the weak pillar is completed.
// Returns true if S.rpg changed. `silent` suppresses the toast (first-load backfill).
function rpgUpdateChallenge(attrs, silent){
  let changed = false;
  if(!S.rpg.daily || S.rpg.daily.date !== TODAY){
    const prev = S.rpg.daily;
    // missed yesterday's challenge → the System carries a penalty into today
    const missed = !!(prev && prev.attr && !prev.claimed && prev.date && prev.date < TODAY);
    const weak = rpgWeakestAttr(attrs);
    S.rpg.daily = { date:TODAY, attr:weak, claimed:false, penalty:missed };
    changed = true;
    if(missed && !silent) sysToast('系统 · 检测到昨日的懈怠 — 惩罚任务已下达');
  }
  const d = S.rpg.daily;
  if(d && d.date===TODAY && !d.claimed){
    const tid = rpgAttrToTargetId(d.attr);
    if(tid && rpgTargetMetToday(tid)){
      d.claimed = true;
      S.rpg.bonusExp = (S.rpg.bonusExp||0) + RPG_CHALLENGE_EXP;
      changed = true;
      if(!silent) sysToast((d.penalty ? '系统 · 惩罚已解除 · 弱点已被直面 +' : '系统 · 弱点已被直面 +') + RPG_CHALLENGE_EXP);
    }
  }
  return changed;
}

/* ── passive skill tree (auto-unlocked from real data; no allocation) ── */
const RPG_SKILLS = [
  { id:'sk_str', branch:'STR', name:'钢筋铁骨', desc:'近 30 天健身达成 ≥15 天', test:(a)=>a.STR>=25 },
  { id:'sk_agi', branch:'AGI', name:'疾风之步', desc:'近 30 天篮球达成 ≥15 天', test:(a)=>a.AGI>=25 },
  { id:'sk_int', branch:'INT', name:'多语之脑', desc:'近 30 天日语达成 ≥15 天', test:(a)=>a.INT>=25 },
  { id:'sk_wis', branch:'WIS', name:'市场之眼', desc:'近 30 天赚钱达成 ≥15 天', test:(a)=>a.WIS>=25 },
  { id:'sk_vit', branch:'VIT', name:'不眠之躯', desc:'近 30 天睡眠达成 ≥15 天', test:(a)=>a.VIT>=25 },
  { id:'sk_awaken',  branch:'CORE', name:'觉醒',     desc:'等级达到 5',     test:(a,r)=>r.level>=5 },
  { id:'sk_hunter',  branch:'CORE', name:'狩猎本能', desc:'连续达标 7 天',  test:()=> (typeof computeThe90Streak==='function' && computeThe90Streak()>=7) },
  { id:'sk_relent',  branch:'CORE', name:'不屈',     desc:'连续达标 30 天', test:()=> (typeof computeThe90Streak==='function' && computeThe90Streak()>=30) },
  { id:'sk_monarch', branch:'CORE', name:'君主之威', desc:'晋升至 S 级',    test:(a,r)=>r.rank==='S' },
];

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
  // hidden / adaptive —門檻明显高于常规曲线，由行为触发
  { id:'streak14', name:'意志试炼', desc:'连续达标 14 天',        hidden:true,  test:()=> (typeof computeThe90Streak==='function' && computeThe90Streak()>=14) },
  { id:'perfectwk',name:'影之支配', desc:'连续 7 天五项全清',      hidden:true,  test:()=> rpgPerfectStreak()>=7 },
];

/* progress hints for LOCKED, non-hidden achievements → [current, target].
   Turns a dead "locked" badge into an aspirational "5 / 7". Hidden ones stay
   masked (no progress, preserve the mystery). */
function _the90StreakSafe(){ return (typeof computeThe90Streak==='function') ? computeThe90Streak() : 0; }
function _the90DaySafe(){ return (typeof the90Day==='function') ? the90Day() : 0; }
const RPG_ACH_PROG = {
  streak3:  ()=>[_the90StreakSafe(), 3],
  streak7:  ()=>[_the90StreakSafe(), 7],
  streak30: ()=>[_the90StreakSafe(), 30],
  day30:    ()=>[_the90DaySafe(), 30],
  day60:    ()=>[_the90DaySafe(), 60],
  day90:    ()=>[_the90DaySafe(), 90],
  perfect:  ()=>[rpgMetOn(TODAY), rpgTargets().length || 5],
  n2_10:    ()=>[((S.jp && S.jp.streak) || 0), 10],
  n2_30:    ()=>[((S.jp && S.jp.streak) || 0), 30],
  lv10:     (r)=>[r.level, 10],
};

/* ── orchestration: recompute, fire level-ups + achievements, persist ── */
let _rpgLastExp = null, _rpgChallengeGranted = false;
function rpgAfterChange(){
  if(!S.rpg) return;
  const probe = computeRPG();
  const firstRun = (S.rpg.seenLevel===1 && Object.keys(S.rpg.achievements||{}).length===0 && (probe.level>1 || probe.totalExp>0));
  let changed = false;

  // daily challenge: roll today's + auto-grant when the weak pillar is done (silent on first load)
  const beforeBonus = S.rpg.bonusExp || 0;
  if(rpgUpdateChallenge(probe.attrs, firstRun)) changed = true;
  _rpgChallengeGranted = (S.rpg.bonusExp || 0) > beforeBonus;

  // Avoid a 2nd full computeRPG() (all-history scan + 5×30 attr loops): the
  // challenge grant only adds a flat RPG_CHALLENGE_EXP, so derive the post-grant
  // EXP scalars from `probe` (attrs / todayExp are unaffected by the bonus).
  let rpg = probe;
  if(_rpgChallengeGranted){
    const totalExp = probe.totalExp + RPG_CHALLENGE_EXP;
    const level = rpgLevelFromExp(totalExp), rank = rpgRank(level);
    rpg = Object.assign({}, probe, {
      totalExp, level, rank, title: RPG_TITLES[rank] || '',
      expInLevel: totalExp - rpgExpForLevel(level),
      expForLevel: rpgExpForLevel(level + 1) - rpgExpForLevel(level),
    });
  }

  if(firstRun){
    // silent backfill so an existing user doesn't get a flood of pop-ups on first load
    S.rpg.seenLevel = rpg.level;
    for(const a of RPG_ACHIEVEMENTS){ try{ if(a.test(rpg)) S.rpg.achievements[a.id] = new Date().toISOString(); }catch(e){} }
    changed = true;
  } else {
    if(_rpgChallengeGranted && window.Sfx) Sfx.quest();
    if(!_rpgChallengeGranted && _rpgLastExp != null && rpg.totalExp > _rpgLastExp){
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
  if(window.Sfx) Sfx.toast();
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
      <div class="sys-cele-voice">「玩家」的极限，已被重新定义。</div>
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
      <div class="sys-cele-voice">${a.hidden?'「系统」承认了你逾越常规的轨迹。':'「系统」已记录你的轨迹。'}</div>
      <button class="sys-cele-close" onclick="sysCloseModal()">确定</button>
    </div>`;
  }
  m.innerHTML = `<div class="sys-modal-back" onclick="sysCloseModal()"></div>${card}`;
  m.classList.add('open'); m.setAttribute('aria-hidden','false');
  if(window.Sfx){
    if(p.type==='levelup'){
      if(typeof rpgRank==='function' && rpgRank(p.from)!==rpgRank(p.to)) Sfx.rankup();
      else Sfx.levelup();
    } else { Sfx.achievement(); }
  }
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

/* ── HUD window view (hash-routed; floats over the dimmed page) ── */
const sysUI = { open:false, tab:'status' };
function openSystem(fromHash){
  const v = document.getElementById('system-view'); if(!v) return;
  clearTimeout(sysUI._closeT); v.classList.remove('sys-closing');   // cancel an in-flight furl
  sysUI.open = true;
  v.classList.add('open'); v.setAttribute('aria-hidden','false');
  document.body.classList.add('sys-locked');
  if(window.Sfx){ Sfx.open(); const mb=v.querySelector('.sys-mute'); if(mb) mb.classList.toggle('sfx-muted', Sfx.muted); }
  if(!fromHash && location.hash!=='#system') location.hash='system';
  rSystem();
  // Entrance ceremony: the boot cover masks the HUD while the window unfurls.
  // Reveal the count-up as the cover lifts WITHOUT rebuilding the panel — a 2nd
  // full rSystem() here used to re-pop the radar and reset every number mid-
  // dissolve (a visible hiccup at the worst moment). Instead we re-animate the
  // existing number nodes; the radar scale-in waits for the lift via .sys-entering.
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  clearTimeout(sysUI._enterT); clearTimeout(sysUI._enterClsT);
  if(!reduce){
    v.classList.add('sys-entering');
    sysUI._enterT = setTimeout(()=>{
      if(sysUI.open && sysUI.tab==='status' && typeof animateNumber==='function'){
        document.querySelectorAll('#sys-body .sys-attr-val[data-attr]').forEach(el=>{
          const target = parseInt(el.textContent, 10);
          if(!isNaN(target)) animateNumber(el, 10, target, 500);
        });
      }
    }, 1300);
    sysUI._enterClsT = setTimeout(()=>{ v.classList.remove('sys-entering'); }, 1950);
  }
}
function closeSystem(fromHash){
  const v = document.getElementById('system-view'); if(!v) return;
  if(!sysUI.open) return;                                   // already closing/closed
  sysUI.open = false;
  if(window.Sfx) Sfx.close();
  clearTimeout(sysUI._enterT); clearTimeout(sysUI._enterClsT); clearTimeout(sysUI._closeT);
  v.classList.remove('sys-entering'); v.setAttribute('aria-hidden','true');
  if(!fromHash && location.hash==='#system') history.replaceState(null,'',location.pathname+location.search);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(reduce){
    v.classList.remove('open'); document.body.classList.remove('sys-locked');
    return;
  }
  // furl the scroll back up the same way it opened, then hide it. Keep .sys-closing
  // after: its both-fill holds the window furled/invisible, so dropping .open won't
  // flash the full window back during the view's fade-out. openSystem clears it.
  v.classList.add('sys-closing');
  sysUI._closeT = setTimeout(()=>{
    v.classList.remove('open');
    document.body.classList.remove('sys-locked');
  }, 500);
}
function sysHashRoute(){
  if(location.hash==='#system'){ if(!sysUI.open) openSystem(true); }
  else if(sysUI.open){ closeSystem(true); }
}
window.addEventListener('hashchange', sysHashRoute);

const SYS_TABS = ['status','quests','skills'];
function sysCycleTab(dir){
  let i = SYS_TABS.indexOf(sysUI.tab); if(i<0) i=0;
  sysSwitchTab(SYS_TABS[(i + dir + SYS_TABS.length) % SYS_TABS.length]);
}
function sysAnyOverlayOpen(){
  return (typeof finUI!=='undefined' && finUI && finUI.open)
      || (typeof motivUI!=='undefined' && motivUI && motivUI.open)
      || sysUI.open;
}
// Keyboard: inside System ←/→ switch tabs, Esc closes; on the main page ↑ (near top) opens System.
document.addEventListener('keydown', (e)=>{
  const t = e.target, tag = (t && t.tagName) || '';
  if(/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (t && t.isContentEditable)) return;
  if(sysUI.open){
    if(e.key==='ArrowRight'){ e.preventDefault(); sysCycleTab(1); }
    else if(e.key==='ArrowLeft'){ e.preventDefault(); sysCycleTab(-1); }
    else if(e.key==='Escape'){ e.preventDefault(); closeSystem(); }
  } else if(e.key==='ArrowUp' && !e.repeat && !sysAnyOverlayOpen() && (window.scrollY||0) < 4
            && !(typeof _nav!=='undefined' && _nav && _nav.active)){
    // pull up from the top of the dashboard to summon the System HUD
    e.preventDefault();
    openSystem();
  }
});

function sysSwitchTab(tab){
  sysUI.tab = tab;
  if(typeof withViewTransition==='function') withViewTransition(rSystem); else rSystem();
}

/* ── render the HUD (dispatch by tab) ── */
function rSystem(){
  if(!sysUI.open) return;
  document.querySelectorAll('#system-view .sys-tab').forEach(b=> b.classList.toggle('active', b.dataset.tab===sysUI.tab));
  const body = document.getElementById('sys-body'); if(!body) return;
  if(sysUI.tab==='quests') rSysQuests(body);
  else if(sysUI.tab==='skills') rSysSkills(body);
  else rSysStatus(body);
  if(typeof attachRipples==='function') attachRipples();
}

/* ── tab: STATUS (level / attrs / achievements / log) ── */
function rpgPenaltyActive(){
  const d = S.rpg && S.rpg.daily;
  return !!(d && d.date===TODAY && d.penalty && !d.claimed);
}

/* Catmull-Rom → cubic-Bézier path through all points (smooth curve). */
function rpgSmoothPath(pts){
  if(!pts.length) return '';
  if(pts.length<2) return `M ${pts[0][0]} ${pts[0][1]}`;
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[i-1]||pts[i], p1=pts[i], p2=pts[i+1], p3=pts[i+2]||p2;
    const c1x=p1[0]+(p2[0]-p0[0])/6, c1y=p1[1]+(p2[1]-p0[1])/6;
    const c2x=p2[0]-(p3[0]-p1[0])/6, c2y=p2[1]-(p3[1]-p1[1])/6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return d;
}

/* ── attribute radar (SVG, hand-rolled to match the brass HUD) ──
   Plots the 5 current attribute values as a pentagon (10→centre, 40→edge), with
   a "30 days ago" ghost overlay (A), a 40-cap potential ring + sonar sweep +
   weakest-pillar pulse (B). */
function rpgRadarSVG(rpg){
  const ids = RPG_ATTR_ORDER, n = ids.length;
  const cx=110, cy=94, R=64;
  const ang = i => (-Math.PI/2) + i*(2*Math.PI/n);
  const P = (i,r)=>[cx+Math.cos(ang(i))*r, cy+Math.sin(ang(i))*r];
  const fmt = p => p[0].toFixed(1)+','+p[1].toFixed(1);
  const rad = v => Math.max(0, Math.min(1,(v-10)/30)) * R;
  const polyAt = r => ids.map((_,i)=>fmt(P(i,r))).join(' ');

  let rings=''; [0.25,0.5,0.75].forEach(f=>{ rings += `<polygon class="rdr-ring" points="${polyAt(f*R)}"/>`; });
  rings += `<polygon class="rdr-cap" points="${polyAt(R)}"/>`;           // B · 40-cap potential ring
  let spokes=''; ids.forEach((_,i)=>{ const p=P(i,R); spokes += `<line class="rdr-spoke" x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}"/>`; });

  // A · ghost polygon — attributes as of 30 days ago
  const ga = new Date(TODAY+'T00:00:00+08:00'); ga.setDate(ga.getDate()-30);
  const gas = ga.toLocaleDateString('sv-SE');
  const ghostPts = ids.map((id,i)=>fmt(P(i, rad(rpgAttrValueAt(id, gas))))).join(' ');

  const weak = (typeof rpgWeakestAttr==='function') ? rpgWeakestAttr(rpg.attrs) : null;
  const data = ids.map((id,i)=>{
    const k = RPG_ATTR_MAP[id].key, v = rpg.attrs[k];
    return { i, k, v, name:RPG_ATTR_MAP[id].name, pt:P(i, rad(v)), color:RPG_ATTR_COLOR[k]||'#a88455' };
  });
  let dots='', labels='';
  data.forEach(d=>{
    const wk = d.k===weak ? ' rdr-dot-weak' : '';
    dots += `<circle class="rdr-dot${wk}" cx="${d.pt[0].toFixed(1)}" cy="${d.pt[1].toFixed(1)}" r="${d.k===weak?3.2:2.6}" fill="${d.color}"/>`;
    const lp = P(d.i, R+15);
    const anchor = lp[0] < cx-6 ? 'end' : (lp[0] > cx+6 ? 'start' : 'middle');
    labels += `<text class="rdr-label" x="${lp[0].toFixed(1)}" y="${lp[1].toFixed(1)}" text-anchor="${anchor}" fill="${d.color}">${d.name}<tspan class="rdr-lv" dx="4">${d.v}</tspan></text>`;
  });

  return `<svg class="sys-radar" viewBox="0 0 220 190" role="img" aria-label="属性雷达图">
    <defs><radialGradient id="rdrFill" cx="50%" cy="50%" r="50%">
      <stop class="rdr-s0" offset="0%"/><stop class="rdr-s1" offset="100%"/>
    </radialGradient></defs>
    ${rings}${spokes}
    <polygon class="rdr-ghost" points="${ghostPts}"/>
    <polygon class="rdr-data" points="${data.map(d=>fmt(d.pt)).join(' ')}" fill="url(#rdrFill)"/>
    ${dots}${labels}
  </svg>`;
}

/* ── growth curve (SVG) ──
   战力 (combat power) = Σ of the 5 attributes = 50 + Σ(daily met-count over the
   trailing 30 days). Derived for each past anchor by sliding the window over the
   frozen The 90 data — no stored history. Smoothed curve + vertical-gradient area
   + The 90 phase milestones (C). Returns {cur, delta, svg}. */
function rpgGrowthSVG(days){
  days = days || 30; const W = 30;
  const total = days + W - 1;
  const mets = [], dates = [];                       // oldest → newest
  const base = new Date(TODAY+'T00:00:00+08:00');
  for(let i=total-1;i>=0;i--){
    const dt = new Date(base); dt.setDate(base.getDate()-i);
    const ds = dt.toLocaleDateString('sv-SE'); dates.push(ds);
    mets.push(ds<=TODAY ? rpgMetOn(ds) : 0);
  }
  const series = []; let sum = 0;
  for(let i=0;i<W;i++) sum += mets[i];
  series.push(50 + sum);
  for(let j=1;j<days;j++){ sum += mets[W-1+j] - mets[j-1]; series.push(50 + sum); }

  const N = series.length;
  const min = Math.min.apply(null,series), max = Math.max.apply(null,series);
  const pad = (max-min)*0.18 || 6, lo = min-pad, hi = max+pad;
  const X = i => (i/(N-1))*100;
  const Y = v => 30 - ((v-lo)/(hi-lo))*27 - 1.5;
  const pts = series.map((v,i)=>[X(i),Y(v)]);
  const line = rpgSmoothPath(pts);
  const area = line + ' L 100 30 L 0 30 Z';

  let marks = '';                                    // C · The 90 phase milestones in window
  if(typeof the90Day==='function'){
    [30,60,90].forEach(M=>{
      for(let j=0;j<days;j++){
        const ds = dates[W-1+j];
        if(ds<=TODAY && the90Day(ds)===M){
          const x = X(j).toFixed(2);
          marks += `<line class="grw-mile" x1="${x}" y1="2" x2="${x}" y2="30"/><circle class="grw-mile-dot" cx="${x}" cy="${Y(series[j]).toFixed(2)}" r="1.7"/>`;
          break;
        }
      }
    });
  }
  return {
    cur: series[N-1], delta: series[N-1]-series[0],
    svg: `<svg class="sys-growth" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label="战力成长曲线">
      <defs><linearGradient id="grwFill" x1="0" y1="0" x2="0" y2="1">
        <stop class="grw-f0" offset="0%"/><stop class="grw-f1" offset="100%"/>
      </linearGradient></defs>
      <path class="grw-area" d="${area}" fill="url(#grwFill)"/>
      ${marks}
      <path class="grw-line" d="${line}"/>
      <circle class="grw-end" cx="${X(N-1).toFixed(2)}" cy="${Y(series[N-1]).toFixed(2)}" r="1.7"/>
    </svg>`
  };
}

function rSysStatus(body){
  const rpg = computeRPG();
  const pct = rpg.expForLevel>0 ? Math.min(100, Math.round(rpg.expInLevel/rpg.expForLevel*100)) : 0;
  const debuff = rpgPenaltyActive() ? '<span class="sys-debuff" title="未完成的惩罚任务">⚠︎ 衰弱</span>' : '';
  const attrRows = RPG_ATTR_ORDER.map(tid=>{
    const m = RPG_ATTR_MAP[tid];
    const val = rpg.attrs[m.key];
    const apct = Math.min(100, Math.max(0, Math.round((val-10)/30*100)));
    return `<div class="sys-attr sa-${m.key}">
      <span class="sys-attr-icon">${m.icon}</span>
      <span class="sys-attr-name">${m.name}<i>${m.key}</i></span>
      <span class="sys-attr-bar"><i style="width:${apct}%"></i></span>
      <span class="sys-attr-val" data-attr="${m.key}">10</span>
    </div>`;
  }).join('');
  const achCards = RPG_ACHIEVEMENTS.map(a=>{
    const locked = !S.rpg.achievements[a.id];
    const masked = a.hidden && locked;
    let progHtml = '';
    if(locked && !masked && typeof RPG_ACH_PROG[a.id]==='function'){
      let p; try{ p = RPG_ACH_PROG[a.id](rpg); }catch(e){}
      if(p && p[1]>0){
        const cur = Math.max(0, Math.min(p[0]|0, p[1]));
        const pc = Math.round(cur / p[1] * 100);
        progHtml = `<div class="sys-ach-prog"><i style="width:${pc}%"></i></div><div class="sys-ach-progn">${cur} / ${p[1]}</div>`;
      }
    }
    return `<div class="sys-ach ${locked?'locked':'unlocked'}">
      <div class="sys-ach-badge">${locked?'◇':'✦'}</div>
      <div class="sys-ach-name">${masked?'? ? ?':escH(a.name)}</div>
      <div class="sys-ach-desc">${masked?'隐藏成就':escH(a.desc)}</div>
      ${progHtml}
    </div>`;
  }).join('');
  const logLines = Object.entries(S.rpg.achievements || {})
    .map(([id,ts])=>({ a:RPG_ACHIEVEMENTS.find(x=>x.id===id), ts }))
    .filter(x=>x.a)
    .sort((a,b)=>String(b.ts||'').localeCompare(String(a.ts||'')))
    .slice(0,8)
    .map(x=>`<div class="sys-log-line"><span class="sys-log-time">${String(x.ts||'').slice(5,10)}</span> 解锁成就「${escH(x.a.name)}」</div>`)
    .join('');
  const g = rpgGrowthSVG(30);
  const _gd = g.delta>0 ? ('↑ +'+g.delta) : (g.delta<0 ? ('↓ '+g.delta) : '— 持平');
  body.innerHTML = `
    <div class="sys-card">
      <div class="sys-corner tl"></div><div class="sys-corner tr"></div><div class="sys-corner bl"></div><div class="sys-corner br"></div>
      <div class="sys-scan"></div>
      <div class="sys-rank-badge">${rpg.rank}</div>
      <div class="sys-card-main">
        <div class="sys-kicker">[ STATUS ]${debuff}</div>
        <div class="sys-level">Lv <span id="sys-level-num">${rpg.level}</span><span class="sys-title"> · ${escH(rpg.title)}</span></div>
        <div class="sys-exp"><i style="width:${pct}%"></i></div>
        <div class="sys-exp-text">${rpg.expInLevel} / ${rpg.expForLevel} EXP　·　今日 +${rpg.todayExp}</div>
      </div>
    </div>
    <div class="sys-sec-label">属性 · ATTRIBUTES</div>
    <div class="sys-radar-wrap">${rpgRadarSVG(rpg)}</div>
    <div class="sys-attrs">${attrRows}</div>
    <div class="sys-sec-label">成长轨迹 · GROWTH</div>
    <div class="sys-growth-head">
      <span class="sys-growth-now">战力 <b>${g.cur}</b></span>
      <span class="sys-growth-delta ${g.delta>=0?'up':'down'}">近 30 天 ${_gd}</span>
    </div>
    ${g.svg}
    <div class="sys-sec-label">成就 · ACHIEVEMENTS</div>
    <div class="sys-achs">${achCards}</div>
    ${logLines ? `<div class="sys-sec-label">系统日志 · LOG</div><div class="sys-log">${logLines}</div>` : ''}
  `;
  // set attribute values directly — the entrance count-up is driven once from
  // openSystem (the cover-lift reveal). Re-renders (tab switch / remote sync) must
  // NOT replay the count-up, which made the panel "reboot" (reset to 10 + re-count)
  // on every render.
  RPG_ATTR_ORDER.forEach(tid=>{
    const m = RPG_ATTR_MAP[tid];
    const el = body.querySelector(`.sys-attr-val[data-attr="${m.key}"]`);
    if(el) el.textContent = rpg.attrs[m.key];
  });
}

/* ── tab: QUESTS (main / daily + challenge / side) ── */
function rSysQuests(body){
  const targets = rpgTargets();
  const day = (typeof the90Day==='function') ? the90Day() : 0;
  const phase = (typeof the90Phase==='function') ? the90Phase(day) : '';
  const phaseLabel = (typeof the90PhaseLabel==='function') ? the90PhaseLabel(phase) : phase;
  const streak = (typeof computeThe90Streak==='function') ? computeThe90Streak() : 0;
  const mainPct = day>0 ? Math.min(100, Math.round(day/90*100)) : 0;
  const todayScores = (S.the90 && S.the90.daily && S.the90.daily[TODAY] && S.the90.daily[TODAY].scores) || {};

  const dailyLines = targets.map(t=>{
    const met = (typeof the90ScoreMet==='function') && the90ScoreMet(todayScores[t.id], phase);
    return `<div class="sys-q-line ${met?'done':''}"><span class="sys-q-check">${met?'✓':'○'}</span>${escH(t.label)}</div>`;
  }).join('');

  const d = S.rpg.daily || {};
  const chAttrM = d.attr ? RPG_ATTR_MAP[rpgAttrToTargetId(d.attr)] : null;
  const chText = d.attr ? RPG_CHALLENGE_TEXT[d.attr] : null;
  const penaltyHtml = rpgPenaltyActive() && chText ? `
    <div class="sys-q-card sys-q-penalty">
      <div class="sys-q-card-head"><span class="sys-q-tag penalty">⚠︎ 惩罚任务</span><span class="sys-q-reward penalty">解除衰弱</span></div>
      <div class="sys-q-title">${escH(chText.verb)}</div>
      <div class="sys-q-desc">昨日的弱点仍未直面。「系统」在注视——完成它，解除「衰弱」。</div>
    </div>` : '';
  const chHtml = (d.date===TODAY && chText) ? `
    <div class="sys-q-card sys-q-challenge ${d.claimed?'done':''}">
      <div class="sys-q-card-head"><span class="sys-q-tag chal">每日挑战</span>
        <span class="sys-q-reward ${d.claimed?'done':''}">${d.claimed?'已完成 +'+RPG_CHALLENGE_EXP:'+'+RPG_CHALLENGE_EXP+' EXP'}</span></div>
      <div class="sys-q-title">${escH(chText.verb)}</div>
      <div class="sys-q-desc">弱项强化 · ${chAttrM?escH(chAttrM.name):''}　·　${escH(chText.tip)}</div>
    </div>` : '';

  const acPending = (S.ac||[]).filter(t=>!t.done).slice(0,6);
  const tdPending = (S.todos||[]).filter(t=>!t.done && t.date)
    .sort((a,b)=>String(a.date).localeCompare(String(b.date))).slice(0,6);
  const sideCards = [
    ...acPending.map(t=>`<div class="sys-q-side"><span class="sys-q-side-tag">学业</span><span class="sys-q-side-name">${escH((t.sub?t.sub+' · ':'')+t.name)}</span><span class="sys-q-side-due">${t.date?escH(String(t.date).slice(5)):''}</span></div>`),
    ...tdPending.map(t=>`<div class="sys-q-side"><span class="sys-q-side-tag td">待办</span><span class="sys-q-side-name">${escH(t.text)}</span><span class="sys-q-side-due">${escH(String(t.date).slice(5))}</span></div>`),
  ].join('') || '<div class="sys-empty">暂无支线任务。</div>';

  body.innerHTML = `
    ${penaltyHtml}
    <div class="sys-sec-label">主线 · MAIN QUEST</div>
    <div class="sys-q-card sys-q-main">
      <div class="sys-corner tl"></div><div class="sys-corner tr"></div><div class="sys-corner bl"></div><div class="sys-corner br"></div>
      <div class="sys-q-card-head"><span class="sys-q-tag main">THE 90</span><span class="sys-q-reward">${day>90?'已完成':'DAY '+day+' / 90'}</span></div>
      <div class="sys-q-title">90 天的蜕变${phaseLabel?' · '+escH(phaseLabel):''}</div>
      <div class="sys-q-bar"><i style="width:${mainPct}%"></i></div>
      <div class="sys-q-desc">当前连续达标 ${streak} 天</div>
    </div>
    <div class="sys-sec-label">日常 · DAILY</div>
    ${chHtml}
    <div class="sys-q-daily">${dailyLines}</div>
    <div class="sys-sec-label">支线 · SIDE QUESTS</div>
    <div class="sys-q-sides">${sideCards}</div>
  `;
}

/* ── tab: SKILLS (passive, auto-unlocked tree) ── */
function rSysSkills(body){
  const rpg = computeRPG();
  const groups = [
    { key:'CORE', label:'核心 · CORE' },
    { key:'STR',  label:'力量 · STR' },
    { key:'AGI',  label:'敏捷 · AGI' },
    { key:'INT',  label:'智力 · INT' },
    { key:'WIS',  label:'智慧 · WIS' },
    { key:'VIT',  label:'体力 · VIT' },
  ];
  let html = '';
  for(const g of groups){
    const skills = RPG_SKILLS.filter(s=>s.branch===g.key);
    if(!skills.length) continue;
    const nodes = skills.map(s=>{
      let un=false; try{ un = s.test(rpg.attrs, rpg); }catch(e){}
      return `<div class="sys-skill ${un?'on':'off'}">
        <div class="sys-skill-node">${un?'✦':'◇'}</div>
        <div class="sys-skill-name">${un?escH(s.name):'? ? ?'}</div>
        <div class="sys-skill-cond">${escH(s.desc)}</div>
      </div>`;
    }).join('');
    html += `<div class="sys-sec-label">${g.label}</div><div class="sys-skill-row">${nodes}</div>`;
  }
  body.innerHTML = html;
}

// Honour a deep-link to #system on first load.
sysHashRoute();
