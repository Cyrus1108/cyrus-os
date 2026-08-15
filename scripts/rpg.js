/* RPG "System" layer — a Solo-Leveling-style character panel rendered in the
   classic brass theme. Everything visible is COMPUTED from real CyrusOS data;
   only seenLevel + unlocked achievements are persisted (S.rpg, rpg_state table).

   Cumulative level/EXP comes from The 90's historical check-ins (frozen → monotonic),
   so a level once gained never drops. Attributes reflect recent 30-day form.
   The 90 activities feed attributes MANY-TO-MANY (see RPG_ACTIVITY_ATTR); an
   attribute is the weighted average of its feeders; 战力 = sum of the five. */

// the five RPG attributes (display). icons carry U+FE0E (text-presentation) so
// they stay monochrome with the brass / sterile palette.
const RPG_ATTRS = [
  { key:'STR', name:'力量', icon:'⚔︎' },
  { key:'AGI', name:'敏捷', icon:'➹︎' },
  { key:'INT', name:'智力', icon:'✦︎' },
  { key:'WIS', name:'智慧', icon:'☯︎' },
  { key:'VIT', name:'体力', icon:'❀︎' },
  { key:'CRE', name:'创造', icon:'⚙︎' },
];
const RPG_ATTR_ORDER = ['STR','AGI','INT','WIS','VIT','CRE'];
const RPG_ATTR_NAME = { STR:'力量', AGI:'敏捷', INT:'智力', WIS:'智慧', VIT:'体力', CRE:'创造' };
// activity (the90 target id) → attribute weights. 换季(S2 · 营收之季)后柱子换成
// 四根,矩阵整组替换 —— 不能保留上一季的 I–V 行:rpgAttrFromCounts 会把每一行都算进
// 权重和(wsum),留着死行会永久拉低全部属性。
// 属性归属沿用上一季的对应关系:ai 接旧 III(AI Automation),fit 接旧 IV(健身)。
const RPG_ACTIVITY_ATTR = {
  ai:   { INT:1, CRE:1 },          // AI 生意 — 智力 + 创造(承接旧 III)
  jp:   { INT:1, WIS:1 },          // 日本語 — 智力 + 智慧
  fit:  { STR:1, AGI:1, VIT:1 },   // 健身 — 力量 + 敏捷 + 体力(承接旧 IV,加体力)
  ball: { AGI:1, VIT:1, STR:1 },   // 篮球 — 敏捷 + 体力 + 力量
};
/* 上一季的柱子 id —— 只用于把历史日行的达标数算回累计 EXP(见 rpgMetOn)。
   the90.js 定义了同名常量;这里的字面量是它没加载时的兜底。 */
const RPG_LEGACY_TARGET_IDS = ['I','II','III','IV','V'];
const RPG_TITLES = { E:'觉醒者', D:'挑战者', C:'攀登者', B:'破限者', A:'支配者', S:'君主' };
// per-attr hues — MUST mirror the .sa-* colours in system.css (used for SVG fills).
// SOVEREIGN violet-anchored six-hue ring (50° apart, S50/L70) — see system.css
// .sys-attr.sa-* comment for the legacy-hex → new-hex table + AA contrast check.
const RPG_ATTR_COLOR = { STR:'#D98CCC', AGI:'#99D98C', INT:'#8CB3D9', WIS:'#A68CD9', VIT:'#D98C8C', CRE:'#8CD9BF' };

/* ── pure helpers ── */
function rpgTargets(){
  return (S.the90 && S.the90.meta && S.the90.meta.targets)
    || (typeof SEASON_TARGETS_DEFAULT !== 'undefined' ? SEASON_TARGETS_DEFAULT : []);
}
/* 某一天该按哪一组柱子 id 计数。本季开始之前的日期用上一季的 id —— 否则换季当天
   全部历史日行都会被算成 0 达标,累计 EXP 崩塌、等级倒退,直接违反「等级/EXP 永不
   回退」的红线(ARCHITECTURE §5)。 */
function rpgTargetIdsFor(dateStr){
  const seasonStart = (typeof SEASON_START !== 'undefined') ? SEASON_START : null;
  if(seasonStart && dateStr && dateStr < seasonStart){
    return (typeof SEASON_LEGACY_TARGET_IDS !== 'undefined') ? SEASON_LEGACY_TARGET_IDS : RPG_LEGACY_TARGET_IDS;
  }
  return rpgTargets().map(t => t.id);
}
function rpgMetOn(dateStr){
  // # of targets met on a given date (本季 0..4;上一季的日期 0..5)
  if(typeof the90Phase!=='function' || typeof the90Day!=='function' || typeof the90ScoreMet!=='function') return 0;
  const day = S.the90 && S.the90.daily && S.the90.daily[dateStr];
  if(!day) return 0;
  const phase = the90Phase(the90Day(dateStr));
  const scores = day.scores || {};
  let met = 0;
  for(const id of rpgTargetIdsFor(dateStr)){ if(the90ScoreMet(scores[id], phase)) met++; }
  return met;
}
function rpgTotalExp(){
  // Σ over all past+today days: metCount*10 + perfect-day(25). + phase milestones reached.
  let exp = 0;
  const daily = (S.the90 && S.the90.daily) || {};
  for(const date in daily){
    if(date > TODAY) continue;
    const met = rpgMetOn(date);
    exp += met * 10;
    // 满勤 +25 —— 按「那一天当时有几根柱子」判定(上一季 5 根,本季 4 根),
    // 否则换季会把历史上的满勤日全部作废,累计 EXP 倒退。
    const nTargets = rpgTargetIdsFor(date).length;
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
function rpgTargetMetCounts(anchor){
  // days-met in the 30 days ending at `anchor`, per the90 target id (phase-aware)
  const counts = {};
  for(const t of rpgTargets()) counts[t.id] = 0;
  if(typeof the90Phase!=='function' || typeof the90Day!=='function' || typeof the90ScoreMet!=='function') return counts;
  const base = new Date(anchor + 'T00:00:00+08:00');
  for(let i=0;i<30;i++){
    const d = new Date(base); d.setDate(base.getDate() - i);
    const ds = d.toLocaleDateString('sv-SE');
    if(ds > TODAY) continue;
    const day = S.the90 && S.the90.daily && S.the90.daily[ds];
    if(!day) continue;
    const phase = the90Phase(the90Day(ds));
    const scores = day.scores || {};
    for(const t of rpgTargets()){ if(the90ScoreMet(scores[t.id], phase)) counts[t.id]++; }
  }
  return counts;
}
// attribute = 10 + 90 × weighted-avg of its feeder activities' 30-day met-fraction (→ 10..100)
function rpgAttrFromCounts(attrKey, counts){
  let wsum = 0, num = 0;
  for(const tid in RPG_ACTIVITY_ATTR){
    const w = RPG_ACTIVITY_ATTR[tid][attrKey]; if(!w) continue;
    num += w * ((counts[tid] || 0) / 30);
    wsum += w;
  }
  return wsum ? Math.round(10 + 90 * num / wsum) : 10;
}
function rpgAttrValueAt(attrKey, anchor){ return rpgAttrFromCounts(attrKey, rpgTargetMetCounts(anchor)); }
function rpgAttrValue(attrKey){ return rpgAttrValueAt(attrKey, TODAY); }
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
  const totalExp = rpgTotalExp() + ((S.rpg && S.rpg.bonusExp) || 0) + rpgAchExp();
  const level = rpgLevelFromExp(totalExp);
  const curBase = rpgExpForLevel(level);
  const nextBase = rpgExpForLevel(level+1);
  const rank = rpgRank(level);
  const attrs = {};
  const counts = rpgTargetMetCounts(TODAY);
  for(const k of RPG_ATTR_ORDER){ attrs[k] = rpgAttrFromCounts(k, counts); }
  return {
    totalExp, level, rank,
    title: RPG_TITLES[rank] || '',
    expInLevel: totalExp - curBase,
    expForLevel: nextBase - curBase,
    attrs, counts, todayExp: rpgTodayExp(),
  };
}

/* ── daily challenge (strengthens your weakest attribute) ── */
function rpgWeakestAttr(attrs){
  let mk=null, mv=Infinity;
  for(const k of RPG_ATTR_ORDER){ if(attrs[k] < mv){ mv=attrs[k]; mk=k; } }
  return mk;
}
function rpgTargetMetToday(targetId){
  if(typeof the90Phase!=='function' || typeof the90Day!=='function' || typeof the90ScoreMet!=='function') return false;
  const today = S.the90 && S.the90.daily && S.the90.daily[TODAY];
  if(!today) return false;
  const phase = the90Phase(the90Day());
  return the90ScoreMet((today.scores||{})[targetId], phase);
}
// pick the activity to do for a weak attribute: a feeder NOT done today, highest
// weight. On a weight tie, prefer a non-sleep feeder — 睡眠 (I) feeds every
// attribute so it would otherwise win every day, and "21:30 上床" isn't a
// daytime-actionable challenge. Fall back to sleep only when it's the sole option.
function rpgChallengeActivity(attrKey){
  let best = null, bestW = 0;
  for(const tid in RPG_ACTIVITY_ATTR){
    const w = RPG_ACTIVITY_ATTR[tid][attrKey]; if(!w) continue;
    if(rpgTargetMetToday(tid)) continue;            // already done today → skip
    if(w > bestW || (w === bestW && best === 'I' && tid !== 'I')){ bestW = w; best = tid; }
  }
  return best;                                       // null when every feeder is done today
}
const RPG_CHALLENGE_EXP = 20;
// Roll today's challenge + auto-grant when the chosen activity is completed.
// Returns true if S.rpg changed. `silent` suppresses the toast (first-load backfill).
function rpgUpdateChallenge(attrs, silent){
  let changed = false;
  if(!S.rpg.daily || S.rpg.daily.date !== TODAY){
    const prev = S.rpg.daily;
    // missed yesterday's challenge → the System carries a penalty into today
    const missed = !!(prev && prev.target && !prev.claimed && prev.date && prev.date < TODAY);
    const weak = rpgWeakestAttr(attrs);
    S.rpg.daily = { date:TODAY, attr:weak, target:rpgChallengeActivity(weak), claimed:false, penalty:missed };
    changed = true;
    if(missed && !silent){
      sysToast('系统 · 检测到昨日的懈怠 — 惩罚任务已下达', {silent:true});
      if(window.Sfx) Sfx.penalty();   // a punishment must not ring like a reward
    }
  }
  const d = S.rpg.daily;
  if(d && d.date===TODAY && !d.claimed && d.target){
    if(rpgTargetMetToday(d.target)){
      d.claimed = true;
      S.rpg.bonusExp = (S.rpg.bonusExp||0) + RPG_CHALLENGE_EXP;
      changed = true;
      if(!silent) sysToast((d.penalty ? '系统 · 惩罚已解除 · 弱点已被直面 +' : '系统 · 弱点已被直面 +') + RPG_CHALLENGE_EXP, {silent:true});   // Sfx.quest plays for the grant
    }
  }
  return changed;
}

/* ── real-life skills (curated, fully automatic from real data — no allocation, no
   manual toggle). Each ACTIVE skill adds +10 to the displayed 战力 (rSysStatus
   skillBonus). Five 修行 skills track the The 90 activities (active when that activity
   was met on ≥ RPG_SKILL_REQ of the last 30 days, read from rpg.counts), two 外功
   skills reach into other modules, and four 心法 skills mark character progression.
   Tests receive (attrs, rpg); rpg.counts = per-target 30-day met counts from computeRPG.
   NOTE: "AI Automation" is intentionally absent — it has no data signal to bind to yet.
   Add it here once something in CyrusOS measures it (a todo tag, a tracked ritual, …). */
const RPG_SKILL_REQ = 20;   // a The 90 activity becomes a skill at ≥ this many met-days / 30
const RPG_SKILLS = [
  // 修行 · 五道 — the five The 90 activities, auto-active from real check-ins
  { id:'sk_sleep',   name:'养元', desc:'近 30 天「21:30 上床」≥ '+RPG_SKILL_REQ+' 天 · 睡眠养体力', test:(a,r)=> ((r.counts&&r.counts.I)||0)   >= RPG_SKILL_REQ },
  { id:'sk_zen',     name:'止水', desc:'近 30 天「10 分钟冥想」≥ '+RPG_SKILL_REQ+' 天 · 心神澄明',   test:(a,r)=> ((r.counts&&r.counts.II)||0)  >= RPG_SKILL_REQ },
  { id:'sk_study',   name:'精进', desc:'近 30 天「AI Automation」≥ '+RPG_SKILL_REQ+' 天 · 学问不辍',     test:(a,r)=> ((r.counts&&r.counts.III)||0) >= RPG_SKILL_REQ },
  { id:'sk_iron',    name:'淬体', desc:'近 30 天「健身」≥ '+RPG_SKILL_REQ+' 天 · 钢筋铁骨',         test:(a,r)=> ((r.counts&&r.counts.IV)||0)  >= RPG_SKILL_REQ },
  { id:'sk_essence', name:'固本', desc:'近 30 天「性能量管理」≥ '+RPG_SKILL_REQ+' 天 · 炼精化气',   test:(a,r)=> ((r.counts&&r.counts.V)||0)   >= RPG_SKILL_REQ },
  // 外功 — reach into the other modules
  { id:'sk_lang',    name:'言灵', desc:'N2 连续打卡 ≥ 14 天',  test:()=> (S.jp && S.jp.streak>=14) },
  { id:'sk_wealth',  name:'财基', desc:'净资产站稳 RM 10,000', test:()=> (typeof finNetWorthMYR==='function' && finNetWorthMYR()>=10000) },
  // 心法 · 进阶 — character progression
  { id:'sk_awaken',  name:'觉醒',     desc:'等级达到 5',     test:(a,r)=>r.level>=5 },
  { id:'sk_hunter',  name:'狩猎本能', desc:'连续达标 7 天',  test:()=> (typeof computeThe90Streak==='function' && computeThe90Streak()>=7) },
  { id:'sk_relent',  name:'不屈',     desc:'连续达标 30 天', test:()=> (typeof computeThe90Streak==='function' && computeThe90Streak()>=30) },
  { id:'sk_monarch', name:'君主之威', desc:'晋升至 S 级',    test:(a,r)=>r.rank==='S' },
];

// net worth converted to MYR — base may be TWD; fxRates.MYR = base units per 1 MYR,
// so dividing the base-currency net worth by that rate yields MYR (1 if base IS MYR).
function finNetWorthMYR(){
  if(typeof finNetWorth!=='function' || typeof finRate!=='function') return 0;
  const net = finNetWorth().net, rate = finRate('MYR') || 1;
  return rate ? net/rate : net;
}

/* ── achievements (tested against real data) ──
   id = persisted jsonb key (NEVER rename); cat = gallery category; tier drives
   EXP (RPG_TIER_EXP) + badge hue; hidden masks the card until unlocked.
   55 total across 13 categories (see RPG_ACH_CATS for order + labels). */
const RPG_ACHIEVEMENTS = [
  // 坚持 · STREAK
  { id:'streak3',  cat:'streak', tier:'bronze',   name:'三日不辍', desc:'The 90 连续达标 3 天', hidden:false, test:()=> (typeof computeThe90Streak==='function' && computeThe90Streak()>=3) },
  { id:'streak7',  cat:'streak', tier:'bronze',   name:'一周如一', desc:'连续达标 7 天',        hidden:false, test:()=> (typeof computeThe90Streak==='function' && computeThe90Streak()>=7) },
  { id:'streak14', cat:'streak', tier:'silver',   name:'意志试炼', desc:'连续达标 14 天',       hidden:true,  test:()=> (typeof computeThe90Streak==='function' && computeThe90Streak()>=14) },
  { id:'streak30', cat:'streak', tier:'gold',     name:'而立之恒', desc:'连续达标 30 天',       hidden:false, test:()=> (typeof computeThe90Streak==='function' && computeThe90Streak()>=30) },
  { id:'streak60', cat:'streak', tier:'platinum', name:'炼狱不熄', desc:'连续达标 60 天',       hidden:false, test:()=> (typeof computeThe90Streak==='function' && computeThe90Streak()>=60) },
  { id:'comeback', cat:'streak', tier:'silver',   name:'浴火重生', desc:'断档之后，重建 7 天连续达标', hidden:true, test:()=>{ if(typeof computeThe90Streak!=='function'||typeof the90Day!=='function'||typeof the90DateForDay!=='function'||typeof rpgMetOn!=='function') return false; const cur=computeThe90Streak(); if(cur<7) return false; /* anchor to the streak's last COUNTED day: today only counts if met/crossed, else the run ends yesterday (today is pending) */ const tBar=(typeof lowDayOn==='function'&&lowDayOn(TODAY))?1:3; const tDd=S.the90&&S.the90.daily&&S.the90.daily[TODAY]; const todayCounts=(rpgMetOn(TODAY)>=tBar)||!!(tDd&&tDd.scores&&tDd.scores._lowx); const lastCounted=the90Day()-(todayCounts?0:1); const breakDay=lastCounted-cur; if(breakDay<1) return false; const bd=the90DateForDay(breakDay); if(bd>TODAY) return false; return rpgMetOn(bd)<3; } },
  // 圆满 · MASTERY
  { id:'perfect',     cat:'perfect', tier:'bronze',   name:'圆满一日', desc:'单日五项目标全部达成', hidden:false, test:()=> rpgPerfectToday() },
  { id:'perfectwk',   cat:'perfect', tier:'gold',     name:'影之支配', desc:'连续 7 天五项全清',     hidden:true,  test:()=> rpgPerfectStreak()>=7 },
  { id:'perfectmonth',cat:'perfect', tier:'platinum', name:'无瑕之月', desc:'连续 30 天五项全清',    hidden:true,  test:()=> rpgPerfectStreak()>=30 },
  // 历程 · JOURNEY
  { id:'day30', cat:'journey', tier:'bronze', name:'第一阶段', desc:'抵达 The 90 第 30 天', hidden:false, test:()=> (typeof the90Day==='function' && the90Day()>=30) },
  { id:'day60', cat:'journey', tier:'silver', name:'第二阶段', desc:'抵达第 60 天',         hidden:false, test:()=> (typeof the90Day==='function' && the90Day()>=60) },
  { id:'day90', cat:'journey', tier:'gold',   name:'登顶',     desc:'完成 90 天的旅程',     hidden:false, test:()=> (typeof the90Day==='function' && the90Day()>=90) },
  // 属性 · ATTRIBUTE
  { id:'attr_int35',    cat:'attribute', tier:'gold',     name:'通明之巅', desc:'智力 INT 达到 35',          hidden:false, test:(r)=> r.attrs.INT>=35 },
  { id:'attr_cre35',    cat:'attribute', tier:'gold',     name:'造物之巅', desc:'创造 CRE 达到 35',          hidden:false, test:(r)=> r.attrs.CRE>=35 },
  { id:'attr_balanced', cat:'attribute', tier:'platinum', name:'六维调和', desc:'六项属性全部 ≥ 30 · 无短板', hidden:false, test:(r)=> RPG_ATTR_ORDER.every(k=> r.attrs[k]>=30) },
  // 战力 · POWER
  { id:'power150', cat:'power', tier:'gold',     name:'破百五十', desc:'战力达到 150', hidden:false, test:(r)=> RPG_ATTR_ORDER.reduce((s,k)=> s+r.attrs[k], 0)>=150 },
  { id:'power180', cat:'power', tier:'platinum', name:'君临战力', desc:'战力达到 180', hidden:true,  test:(r)=> RPG_ATTR_ORDER.reduce((s,k)=> s+r.attrs[k], 0)>=180 },
  // 阶位 · RANK
  { id:'lv10',   cat:'rank', tier:'bronze',   name:'D 级觉醒', desc:'等级达到 10 · 晋升 D 级', hidden:false, test:(r)=> r.level>=10 },
  { id:'lv20',   cat:'rank', tier:'silver',   name:'C 级猎人', desc:'等级达到 20 · 晋升 C 级', hidden:true,  test:(r)=> r.level>=20 },
  { id:'rank_b', cat:'rank', tier:'gold',     name:'破限者',   desc:'晋升至 B 级（等级 35）',  hidden:false, test:(r)=> r.level>=35 },
  { id:'rank_a', cat:'rank', tier:'platinum', name:'支配者',   desc:'晋升至 A 级（等级 55）',  hidden:false, test:(r)=> r.level>=55 },
  { id:'rank_s', cat:'rank', tier:'platinum', name:'君主',     desc:'晋升至 S 级 · 君主加冕',  hidden:true,  test:(r)=> r.level>=80 },
  // 经验 · EXP
  { id:'exp2000', cat:'exp', tier:'silver',   name:'积跬步', desc:'累计经验突破 2000', hidden:false, test:(r)=> r.totalExp>=2000 },
  { id:'exp5000', cat:'exp', tier:'platinum', name:'至千里', desc:'累计经验突破 5000', hidden:true,  test:(r)=> r.totalExp>=5000 },
  // 语学 · JAPANESE
  { id:'n2_10',    cat:'japanese', tier:'bronze', name:'语之初径', desc:'N2 连续打卡 10 天', hidden:false, test:()=> (S.jp && S.jp.streak>=10) },
  { id:'n2_30',    cat:'japanese', tier:'silver', name:'言之恒心', desc:'N2 连续打卡 30 天', hidden:false, test:()=> (S.jp && S.jp.streak>=30) },
  { id:'n2_60',    cat:'japanese', tier:'gold',   name:'言出于恒', desc:'N2 连续打卡 60 天', hidden:false, test:()=> (S.jp && S.jp.streak>=60) },
  { id:'n2_vol50', cat:'japanese', tier:'silver', name:'百炼之卷', desc:'N2 累计打卡 50 天', hidden:false, test:()=> (S.jp && S.jp.log && Object.keys(S.jp.log).length>=50) },
  // 修行 · DISCIPLINE
  { id:'ac_alldone',  cat:'crossdomain', tier:'bronze', name:'学海无波', desc:'学业待办全部完成',   hidden:false, test:()=> (S.ac && S.ac.length>0 && S.ac.every(t=>t.done)) },
  { id:'ac_volume10', cat:'crossdomain', tier:'silver', name:'课业不辍', desc:'累计完成 10 项学业', hidden:false, test:()=> (S.ac && S.ac.filter(t=>t.done).length>=10) },
  { id:'cleardesk',   cat:'crossdomain', tier:'bronze', name:'万事清零', desc:'把待办全部清空',     hidden:true,  test:()=> { const a=(S.todos||[]).filter(t=>!t.archived); return a.length>0 && a.every(t=>t.done); } },
  { id:'td_burst5',   cat:'crossdomain', tier:'silver', name:'雷厉风行', desc:'单日完成 5 项待办',   hidden:false, test:()=> { const todos=S.todos||[]; return todos.filter(t=> t.done && t.doneAt && new Date(t.doneAt).toLocaleDateString('sv-SE')===TODAY).length>=5; } },
  { id:'td_volume50', cat:'crossdomain', tier:'gold',   name:'积少成多', desc:'累计完成 50 项待办',   hidden:false, test:()=> (S.todos && S.todos.filter(t=>t.done).length>=50) },
  // 财富 · FINANCE
  { id:'fin_log_streak7', cat:'finance', tier:'silver',   name:'锱铢必录', desc:'连续 7 天记账', hidden:false, test:()=> { const tx=(S.fin&&S.fin.transactions)||[]; if(!tx.length) return false; const days=new Set(tx.map(t=>String(t.date).slice(0,10))); let streak=0; const base=new Date(TODAY+'T00:00:00+08:00'); for(let i=0;i<7;i++){ const d=new Date(base); d.setDate(base.getDate()-i); const ds=d.toLocaleDateString('sv-SE'); if(days.has(ds)) streak++; else break; } return streak>=7; } },
  { id:'fin_goal_reached', cat:'finance', tier:'gold',    name:'积羽沉舟', desc:'达成一个存钱目标', hidden:false, test:()=> { const goals=(S.fin&&S.fin.goals)||[]; return (typeof finGoalSaved==='function') && goals.some(g=> g.target>0 && finGoalSaved(g)>=g.target); } },
  { id:'fin_nw_10k',  cat:'finance', tier:'bronze',   name:'积铢成两', desc:'净资产突破 RM 10,000',  hidden:false, test:()=> finNetWorthMYR()>=10000 },
  { id:'fin_nw_50k',  cat:'finance', tier:'silver',   name:'渐入佳境', desc:'净资产突破 RM 50,000',  hidden:false, test:()=> finNetWorthMYR()>=50000 },
  { id:'fin_nw_100k', cat:'finance', tier:'gold',     name:'富甲一方', desc:'净资产突破 RM 100,000', hidden:false, test:()=> finNetWorthMYR()>=100000 },
  { id:'fin_nw_250k', cat:'finance', tier:'platinum', name:'富可敌国', desc:'净资产突破 RM 250,000', hidden:true,  test:()=> finNetWorthMYR()>=250000 },
  // 逆境 · ADVERSITY — the Adversity Ledger (渡): low days entered and crossed
  { id:'cross1',  cat:'adversity', tier:'bronze',   name:'初渡', desc:'第一次穿越低谷日',  hidden:false, test:()=> (typeof adversityLedger==='function' && adversityLedger()>=1) },
  { id:'cross7',  cat:'adversity', tier:'gold',     name:'渡厄', desc:'穿越低谷日 7 次',  hidden:false, test:()=> (typeof adversityLedger==='function' && adversityLedger()>=7) },
  { id:'cross30', cat:'adversity', tier:'platinum', name:'渡劫', desc:'穿越低谷日 30 次', hidden:true,  test:()=> (typeof adversityLedger==='function' && adversityLedger()>=30) },
  // 体魄 · FITNESS
  { id:'fit_first',     cat:'fitness', tier:'bronze', name:'初次启程', desc:'完成第一次训练打卡',   hidden:false, test:()=> (typeof fitWorkoutCount==='function' && fitWorkoutCount()>=1) },
  { id:'fit_streak7',   cat:'fitness', tier:'silver', name:'七日锻形', desc:'连续训练 7 天',        hidden:false, test:()=> (typeof fitComputeStreak==='function' && fitComputeStreak()>=7) },
  { id:'fit_streak30',  cat:'fitness', tier:'gold',   name:'铁律之躯', desc:'连续训练 30 天',       hidden:false, test:()=> (typeof fitComputeStreak==='function' && fitComputeStreak()>=30) },
  { id:'fit_vol1000',   cat:'fitness', tier:'silver', name:'千锤百炼', desc:'累计完成 1000 次',     hidden:false, test:()=> (typeof fitTotalReps==='function' && fitTotalReps()>=1000) },
  { id:'fit_plan_week', cat:'fitness', tier:'gold',   name:'周而复始', desc:'完成一整周的训练计划', hidden:false, test:()=> (typeof fitPlanWeekComplete==='function' && fitPlanWeekComplete()) },
  { id:'fit_body_log',  cat:'fitness', tier:'bronze', name:'丈量自身', desc:'首次记录体征数据',     hidden:true,  test:()=> (typeof fitBodyLogged==='function' && fitBodyLogged()>=1) },
  // 自动化 · AUTOMATION — AI Automation 产出日志（v7.16）
  { id:'ai_first',    cat:'ai', tier:'bronze',   name:'第一次造物', desc:'记录第一条 AI Automation 产出', hidden:false, test:()=> (typeof aiTotalOutputs==='function' && aiTotalOutputs()>=1) },
  { id:'ai_vol10',    cat:'ai', tier:'bronze',   name:'十件成器',   desc:'累计 10 条产出',               hidden:false, test:()=> (typeof aiTotalOutputs==='function' && aiTotalOutputs()>=10) },
  { id:'ai_vol50',    cat:'ai', tier:'silver',   name:'匠人之路',   desc:'累计 50 条产出',               hidden:false, test:()=> (typeof aiTotalOutputs==='function' && aiTotalOutputs()>=50) },
  { id:'ai_vol200',   cat:'ai', tier:'platinum', name:'造物主',     desc:'累计 200 条产出',              hidden:true,  test:()=> (typeof aiTotalOutputs==='function' && aiTotalOutputs()>=200) },
  { id:'ai_streak7',  cat:'ai', tier:'silver',   name:'七日不辍',   desc:'连续 7 天有产出',              hidden:false, test:()=> (typeof aiStreak==='function' && aiStreak()>=7) },
  { id:'ai_streak30', cat:'ai', tier:'gold',     name:'自动化之魂', desc:'连续 30 天有产出',             hidden:false, test:()=> (typeof aiStreak==='function' && aiStreak()>=30) },
  { id:'ai_ship10',   cat:'ai', tier:'gold',     name:'交付者',     desc:'累计交付 10 件（shipped）',     hidden:false, test:()=> ((S.ai||[]).filter(o=>o.kind==='shipped').length>=10) },
];
// gallery categories — fixed render order + labels (X/N count shown per section)
const RPG_ACH_CATS = [
  { key:'streak',      label:'坚持 · STREAK' },
  { key:'perfect',     label:'圆满 · MASTERY' },
  { key:'journey',     label:'历程 · JOURNEY' },
  { key:'attribute',   label:'属性 · ATTRIBUTE' },
  { key:'power',       label:'战力 · POWER' },
  { key:'rank',        label:'阶位 · RANK' },
  { key:'exp',         label:'经验 · EXP' },
  { key:'japanese',    label:'语学 · JAPANESE' },
  { key:'crossdomain', label:'修行 · DISCIPLINE' },
  { key:'finance',     label:'财富 · FINANCE' },
  { key:'fitness',     label:'体魄 · FITNESS' },
  { key:'ai',          label:'自动化 · AUTOMATION' },
  { key:'adversity',   label:'逆境 · ADVERSITY' },
];
/* tier → EXP (flat: achievements are a recognition layer, not a shortcut — the
   daily The 90 grind stays the dominant level driver). RPG_ACH_TIER is built FROM
   the catalog so the id→tier map can never drift from the achievements themselves. */
const RPG_TIER_EXP = { bronze:15, silver:30, gold:50, platinum:100 };
const RPG_ACH_TIER = {};
RPG_ACHIEVEMENTS.forEach(a=>{ RPG_ACH_TIER[a.id] = a.tier; });
// EXP from unlocked achievements = Σ frozen tier-EXP over the STORED key set (NOT
// live re-tests). rpgAfterChange only ever ADDS keys → append-only → monotonic.
function rpgAchExp(){
  let e = 0; const ach = (S.rpg && S.rpg.achievements) || {};
  for(const id in ach){ e += RPG_TIER_EXP[RPG_ACH_TIER[id]] || 0; }
  return e;
}

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
  streak60:     ()=>[_the90StreakSafe(), 60],
  n2_60:        ()=>[((S.jp && S.jp.streak) || 0), 60],
  n2_vol50:     ()=>[((S.jp && S.jp.log) ? Object.keys(S.jp.log).length : 0), 50],
  attr_int35:   (r)=>[r.attrs.INT, 35],
  attr_balanced:(r)=>[Math.min.apply(null, RPG_ATTR_ORDER.map(k=>r.attrs[k])), 30],
  power150:     (r)=>[RPG_ATTR_ORDER.reduce((s,k)=>s+r.attrs[k],0), 150],
  rank_b:       (r)=>[r.level, 35],
  rank_a:       (r)=>[r.level, 55],
  exp2000:      (r)=>[r.totalExp, 2000],
  ac_volume10:  ()=>[(S.ac ? S.ac.filter(t=>t.done).length : 0), 10],
  td_volume50:  ()=>[(S.todos ? S.todos.filter(t=>t.done).length : 0), 50],
  fin_nw_10k:   ()=>[Math.round(finNetWorthMYR()), 10000],
  fin_nw_50k:   ()=>[Math.round(finNetWorthMYR()), 50000],
  fin_nw_100k:  ()=>[Math.round(finNetWorthMYR()), 100000],
  cross1:       ()=>[(typeof adversityLedger==='function'?adversityLedger():0), 1],
  cross7:       ()=>[(typeof adversityLedger==='function'?adversityLedger():0), 7],
  fit_streak7:  ()=>[(typeof fitComputeStreak==='function'?fitComputeStreak():0), 7],
  fit_streak30: ()=>[(typeof fitComputeStreak==='function'?fitComputeStreak():0), 30],
  fit_vol1000:  ()=>[(typeof fitTotalReps==='function'?fitTotalReps():0), 1000],
  ai_vol10:     ()=>[(typeof aiTotalOutputs==='function'?aiTotalOutputs():0), 10],
  ai_vol50:     ()=>[(typeof aiTotalOutputs==='function'?aiTotalOutputs():0), 50],
  ai_streak7:   ()=>[(typeof aiStreak==='function'?aiStreak():0), 7],
  ai_streak30:  ()=>[(typeof aiStreak==='function'?aiStreak():0), 30],
  ai_ship10:    ()=>[((S.ai||[]).filter(o=>o.kind==='shipped').length), 10],
  attr_cre35:   (r)=>[r.attrs.CRE, 35],
};

/* ── orchestration: recompute, fire level-ups + achievements, persist ── */
let _rpgLastExp = null, _rpgChallengeGranted = false;
function rpgAfterChange(){
  if(!S.rpg) return;
  const probe = computeRPG();
  const firstRun = (S.rpg.seenLevel===1 && Object.keys(S.rpg.achievements||{}).length===0 && (probe.level>1 || probe.totalExp>0));
  let changed = false;
  let _rpgAchExpPass = 0;   // tier EXP of achievements unlocked in THIS pass

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
    // silent backfill: write all currently-true achievements FIRST, then set seenLevel
    // (and _rpgLastExp) to the POST-backfill total so the one-time ach-EXP jump is
    // pre-absorbed — no level-up modal, no phantom "+N 经验" toast on the next tick.
    for(const a of RPG_ACHIEVEMENTS){ try{ if(a.test(rpg)) S.rpg.achievements[a.id] = new Date().toISOString(); }catch(e){} }
    const backfillExp = rpgTotalExp() + ((S.rpg.bonusExp) || 0) + rpgAchExp();
    S.rpg.seenLevel = rpgLevelFromExp(backfillExp);
    _rpgLastExp = backfillExp;
    changed = true;
  } else {
    if(_rpgChallengeGranted && window.Sfx) Sfx.quest();
    if(!_rpgChallengeGranted && _rpgLastExp != null && rpg.totalExp > _rpgLastExp){
      // silent: the gesture that earned the EXP already played its own cue
      // (tick/quest/cross), and sync-replay EXP must never chime at all
      sysToast('[ 系统 ] +' + (rpg.totalExp - _rpgLastExp) + ' 经验', {silent:true});
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
        _rpgAchExpPass += RPG_TIER_EXP[a.tier] || 0;   // absorb into the snapshot below
        sysCelebrate({ type:'achievement', ach:a });
      }
    }
  }
  // include EXP from achievements unlocked THIS pass, or the next unrelated
  // action shows a phantom late "+N 经验" toast for it
  if(!firstRun) _rpgLastExp = rpg.totalExp + _rpgAchExpPass;
  if(changed) saveRPG();
  if(sysUI.open && typeof rSystem==='function') rSystem();
}

/* ── transient toast (global) ──
   opts.silent: skip the chime — used when the calling code path already plays
   its own dedicated cue (tick/quest/cross/blocked/penalty), or when the toast
   is driven by load/sync rather than a local gesture. */
function sysToast(msg, opts){
  let t = document.getElementById('sys-toast');
  if(!t){ t = document.createElement('div'); t.id='sys-toast'; t.className='sys-toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  if(window.Sfx && !(opts && opts.silent)) Sfx.toast();
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
    if(typeof window.crestIgnite==='function') window.crestIgnite();   // 升级/rankup → 徽记点亮
    const num = document.getElementById('sys-cele-num');
    if(num && typeof animateNumber==='function') animateNumber(num, p.from, p.to, 700);
    else if(num) num.textContent = p.to;
  }
  if(typeof attachRipples==='function') attachRipples();
  // no auto-close: a level-up deserves a beat, not a blink — stays until
  // 确定 / backdrop tap (queued celebrations still flow via _celebrateDone)
  clearTimeout(m._timer);
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
  // no pageDepth: full-screen HUD over a half-transparent backdrop — receding
  // the page read as the background "flying up" to cover the view
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

const SYS_TABS = ['status','quests','achievements'];
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

// follow-finger swipe between System tabs (raw switch — no withViewTransition doubling)
if(typeof makeHudSwipe==='function'){
  makeHudSwipe('system-view', {
    bodyId:'sys-body',
    tabs:()=>SYS_TABS,
    cur:()=>sysUI.tab,
    guard:()=>{ const m=document.getElementById('sys-modal'); return !!(m && m.classList.contains('open')); },
    go:(tab)=>{ if(sysUI.tab===tab) return; sysUI.tab=tab; if(window.Sfx) Sfx.tab(); rSystem(); },
    peek:(el,tab)=>{ if(tab==='quests')rSysQuests(el); else if(tab==='achievements')rSysAchievements(el); else rSysStatus(el); },
  });
}

function sysSwitchTab(tab){
  if(sysUI.tab === tab) return;   // re-clicking the active tab: no re-render, no sound
  sysUI.tab = tab;
  if(window.Sfx) Sfx.tab();
  if(typeof withViewTransition==='function') withViewTransition(rSystem); else rSystem();
}

/* ── render the HUD (dispatch by tab) ── */
function rSystem(){
  if(!sysUI.open) return;
  document.querySelectorAll('#system-view .sys-tab').forEach(b=> b.classList.toggle('active', b.dataset.tab===sysUI.tab));
  const body = document.getElementById('sys-body'); if(!body) return;
  if(sysUI.tab==='quests') rSysQuests(body);
  else if(sysUI.tab==='achievements') rSysAchievements(body);
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
   Plots the current attribute values as a polygon (10→centre, 100→edge), with
   a "30 days ago" ghost overlay (A), a 100-cap potential ring + sonar sweep +
   weakest-pillar pulse (B). */
function rpgRadarSVG(rpg){
  const ids = RPG_ATTR_ORDER, n = ids.length;
  const cx=110, cy=94, R=64;
  const ang = i => (-Math.PI/2) + i*(2*Math.PI/n);
  const P = (i,r)=>[cx+Math.cos(ang(i))*r, cy+Math.sin(ang(i))*r];
  const fmt = p => p[0].toFixed(1)+','+p[1].toFixed(1);
  const rad = v => Math.max(0, Math.min(1,(v-10)/90)) * R;
  const polyAt = r => ids.map((_,i)=>fmt(P(i,r))).join(' ');

  let rings=''; [0.25,0.5,0.75].forEach(f=>{ rings += `<polygon class="rdr-ring" points="${polyAt(f*R)}"/>`; });
  rings += `<polygon class="rdr-cap" points="${polyAt(R)}"/>`;           // B · 100-cap potential ring
  let spokes=''; ids.forEach((_,i)=>{ const p=P(i,R); spokes += `<line class="rdr-spoke" x1="${cx}" y1="${cy}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}"/>`; });

  // A · ghost polygon — attributes as of 30 days ago (one window scan, reused for all 5)
  const ga = new Date(TODAY+'T00:00:00+08:00'); ga.setDate(ga.getDate()-30);
  const gas = ga.toLocaleDateString('sv-SE');
  const ghostCounts = (typeof rpgTargetMetCounts==='function') ? rpgTargetMetCounts(gas) : {};
  const ghostPts = ids.map((k,i)=>fmt(P(i, rad(rpgAttrFromCounts(k, ghostCounts))))).join(' ');

  const weak = (typeof rpgWeakestAttr==='function') ? rpgWeakestAttr(rpg.attrs) : null;
  const data = ids.map((k,i)=>{
    const v = rpg.attrs[k];
    return { i, k, v, name:RPG_ATTR_NAME[k]||k, pt:P(i, rad(v)), color:RPG_ATTR_COLOR[k]||'#9D7BE6' };
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
   战力 (combat power) = Σ of the 6 attribute values (each 10–100, so 60–600).
   Derived for each past anchor by sliding a 30-day window over the frozen The 90
   data and re-running the many-to-many attribute formula — no stored history.
   Smoothed curve + vertical-gradient area + The 90 phase milestones (C).
   Returns {cur, delta, svg}. */
function rpgGrowthSVG(days){
  days = days || 30; const W = 30;
  const total = days + W - 1;
  const dates = [];                                  // oldest → newest
  const dayMet = [];                                 // per-day per-target met (1/0)
  const tids = rpgTargets().map(t=>t.id);
  const havePhase = typeof the90Phase==='function' && typeof the90Day==='function' && typeof the90ScoreMet==='function';
  const base = new Date(TODAY+'T00:00:00+08:00');
  for(let i=total-1;i>=0;i--){
    const dt = new Date(base); dt.setDate(base.getDate()-i);
    const ds = dt.toLocaleDateString('sv-SE'); dates.push(ds);
    const m = {};
    const day = ds<=TODAY && havePhase && S.the90 && S.the90.daily && S.the90.daily[ds];
    if(day){
      const phase = the90Phase(the90Day(ds)); const scores = day.scores || {};
      for(const tid of tids) m[tid] = the90ScoreMet(scores[tid], phase) ? 1 : 0;
    }
    dayMet.push(m);
  }
  // rolling 30-day per-target counts → 战力 = Σ of the 5 attribute values at each anchor
  const power = c => RPG_ATTR_ORDER.reduce((s,k)=>s+rpgAttrFromCounts(k,c),0);
  const counts = {}; for(const tid of tids) counts[tid]=0;
  for(let i=0;i<W;i++){ const m=dayMet[i]; for(const tid of tids) counts[tid]+=(m[tid]||0); }
  const series = [power(counts)];
  for(let j=1;j<days;j++){
    const out=dayMet[j-1], inn=dayMet[W-1+j];
    for(const tid of tids) counts[tid] += (inn[tid]||0) - (out[tid]||0);
    series.push(power(counts));
  }

  const N = series.length;
  const min = Math.min.apply(null,series), max = Math.max.apply(null,series);
  const pad = (max-min)*0.18 || 6, lo = min-pad, hi = max+pad;
  const X = i => (i/(N-1))*100;
  const Y = v => 30 - ((v-lo)/(hi-lo))*27 - 1.5;
  const pts = series.map((v,i)=>[X(i),Y(v)]);
  const line = rpgSmoothPath(pts);
  const area = line + ' L 100 30 L 0 30 Z';

  let marks = '';                                    // C · 赛季阶段里程碑(落在窗口内的)
  if(typeof the90Day==='function'){
    const _len = (typeof seasonPhaseLen==='function') ? seasonPhaseLen() : 30;
    const _n = (typeof SEASON_PHASES!=='undefined') ? SEASON_PHASES.length : 3;
    Array.from({length:_n}, (_,i)=>(i+1)*_len).forEach(M=>{
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
  // display-only monotonic clamp: never SHOW a level/rank below the highest already
  // reached (seenLevel). Unchecking today's targets lowers live EXP but must not
  // visibly demote the character. The level-up detector calls computeRPG() itself,
  // so this display clamp never suppresses a real level-up.
  const _seen = (S.rpg && S.rpg.seenLevel) || 1;
  if(rpg.level < _seen){
    rpg.level = _seen;
    rpg.rank = rpgRank(_seen);
    rpg.title = RPG_TITLES[rpg.rank] || '';
    const _cb = rpgExpForLevel(_seen);
    rpg.expInLevel = Math.max(0, rpg.totalExp - _cb);
    rpg.expForLevel = rpgExpForLevel(_seen+1) - _cb;
  }
  const pct = rpg.expForLevel>0 ? Math.min(100, Math.round(rpg.expInLevel/rpg.expForLevel*100)) : 0;
  const debuff = rpgPenaltyActive() ? '<span class="sys-debuff" title="未完成的惩罚任务">⚠︎ 衰弱</span>' : '';
  const lowChip = (typeof isLowDayActive==='function' && isLowDayActive()) ? '<span class="sys-state-low" title="低谷日进行中 · 只做最小动作">低谷日</span>' : '';
  const ledger = (typeof adversityLedger==='function') ? adversityLedger() : 0;
  const ledgerSub = ledger>0 ? ('穿越低谷 '+ledger+' 次 · 不想动时依然动了') : '你的第一次穿越，会记在这里';
  const ampSpark = (typeof lowdayAmpSparkSVG==='function') ? lowdayAmpSparkSVG(30) : '';
  const attrRows = RPG_ATTRS.map(m=>{
    const val = rpg.attrs[m.key];
    const apct = Math.min(100, Math.max(0, Math.round((val-10)/90*100)));
    return `<div class="sys-attr sa-${m.key}">
      <span class="sys-attr-icon">${m.icon}</span>
      <span class="sys-attr-name">${m.name}<i>${m.key}</i></span>
      <span class="sys-attr-bar"><i style="width:${apct}%"></i></span>
      <span class="sys-attr-val" data-attr="${m.key}">10</span>
    </div>`;
  }).join('');
  // skills moved here from the old 技能 tab → one passive strip. Each active skill
  // grants +10 to the DISPLAYED 战力 (a separable "+N 技能" addend); it never feeds
  // totalExp/level, so it's monotonic-safe even as skills flip on/off with recent form.
  const skillOn = s => { try{ return s.test(rpg.attrs, rpg); }catch(e){ return false; } };
  const skillBonus = RPG_SKILLS.filter(skillOn).length * 10;
  const skillStrip = RPG_SKILLS.map(s=>{ const un=skillOn(s); return `<div class="sys-skill ${un?'on':'off'}">
      <div class="sys-skill-node">${un?'✦':'◇'}</div>
      <div class="sys-skill-name">${un?escH(s.name):'? ? ?'}</div>
      <div class="sys-skill-cond">${escH(s.desc)}</div>
    </div>`; }).join('');
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
      <div class="sys-rank-badge"><span class="sys-rank-flow">${rpg.rank}</span></div>
      <div class="sys-card-main">
        <div class="sys-kicker">[ STATUS ]${debuff}${lowChip}</div>
        <div class="sys-level">Lv <span id="sys-level-num">${rpg.level}</span><span class="sys-title"> · ${escH(rpg.title)}</span></div>
        <div class="sys-exp"><i style="width:${pct}%"></i></div>
        <div class="sys-exp-text">${rpg.expInLevel} / ${rpg.expForLevel} EXP　·　今日 +${rpg.todayExp}</div>
      </div>
    </div>
    <div class="sys-adversity">
      <div class="sys-adversity-num">${ledger}</div>
      <div class="sys-adversity-meta"><div class="sys-adversity-title">渡 · 逆境账户</div><div class="sys-adversity-sub">${ledgerSub}</div></div>
    </div>
    <div class="sys-sec-label">属性 · ATTRIBUTES</div>
    <div class="sys-radar-wrap">${rpgRadarSVG(rpg)}</div>
    <div class="sys-attrs">${attrRows}</div>
    <div class="sys-sec-label">成长轨迹 · GROWTH</div>
    <div class="sys-growth-head">
      <span class="sys-growth-now">战力 <b>${g.cur}</b>${skillBonus>0?`<span class="sys-skill-bonus">+${skillBonus} 技能</span>`:''}</span>
      <span class="sys-growth-delta ${g.delta>=0?'up':'down'}">近 30 天 ${_gd}</span>
    </div>
    ${g.svg}
    ${ampSpark ? `<div class="sys-sec-label">振幅 · AMPLITUDE</div>${ampSpark}` : ''}
    <div class="sys-sec-label">技能 · SKILLS</div>
    <div class="sys-skill-row">${skillStrip}</div>
    ${logLines ? `<div class="sys-sec-label">系统日志 · LOG</div><div class="sys-log">${logLines}</div>` : ''}
  `;
  // set attribute values directly — the entrance count-up is driven once from
  // openSystem (the cover-lift reveal). Re-renders (tab switch / remote sync) must
  // NOT replay the count-up, which made the panel "reboot" (reset to 10 + re-count)
  // on every render.
  RPG_ATTRS.forEach(m=>{
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
    // item 3: ✓ glyph → #i-check sprite (done state only; ○ stays a plain glyph —
    // it reads as an empty ring at 13px and a matching outline symbol isn't in
    // the sprite, so swapping it would cost more legibility than it buys).
    const checkHtml = met ? '<svg class="ic"><use href="./vendor/icons.svg#i-check"/></svg>' : '○';
    return `<div class="sys-q-line ${met?'done':''}"><span class="sys-q-check">${checkHtml}</span>${escH(t.label)}</div>`;
  }).join('');

  const d = S.rpg.daily || {};
  const chTarget = d.target ? targets.find(t=>t.id===d.target) : null;
  const chAttrName = d.attr ? (RPG_ATTR_NAME[d.attr] || '') : '';
  const chVerb = chTarget ? ('完成今日「' + chTarget.label + '」') : '';
  const penaltyHtml = rpgPenaltyActive() && chVerb ? `
    <div class="sys-q-card sys-q-penalty">
      <div class="sys-q-card-head"><span class="sys-q-tag penalty">⚠︎ 惩罚任务</span><span class="sys-q-reward penalty">解除衰弱</span></div>
      <div class="sys-q-title">${escH(chVerb)}</div>
      <div class="sys-q-desc">昨日的弱点仍未直面。「系统」在注视——完成它，解除「衰弱」。</div>
    </div>` : '';
  const chHtml = (d.date===TODAY && chVerb) ? `
    <div class="sys-q-card sys-q-challenge ${d.claimed?'done':''}">
      <div class="sys-q-card-head"><span class="sys-q-tag chal">每日挑战</span>
        <span class="sys-q-reward ${d.claimed?'done':''}">${d.claimed?'已完成 +'+RPG_CHALLENGE_EXP:'+'+RPG_CHALLENGE_EXP+' EXP'}</span></div>
      <div class="sys-q-title">${escH(chVerb)}</div>
      <div class="sys-q-desc">弱项强化 · ${escH(chAttrName)}　·　直面你最弱的属性，让「系统」为你重写它。</div>
    </div>` : '';

  const acPending = (S.ac||[]).filter(t=>!t.done).slice(0,6);
  const tdPending = (S.todos||[]).filter(t=>!t.done && !t.archived && t.date)
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

/* ── tab: ACHIEVEMENTS (full gallery — categories · tiers · hidden masking · X/N) ── */
function rSysAchievements(body){
  const rpg = computeRPG();
  const ach = S.rpg.achievements || {};
  const total = RPG_ACHIEVEMENTS.length;
  const unlocked = RPG_ACHIEVEMENTS.filter(a=>ach[a.id]).length;
  const overallPct = total>0 ? Math.round(unlocked/total*100) : 0;

  let sections = '';
  for(const cat of RPG_ACH_CATS){
    const list = RPG_ACHIEVEMENTS.filter(a=>a.cat===cat.key);
    if(!list.length) continue;
    const catUnlocked = list.filter(a=>ach[a.id]).length;
    const cards = list.map(a=>{
      const locked = !ach[a.id];
      const masked = a.hidden && locked;
      // masked cards get a neutral hue so the badge colour never leaks the tier (weight)
      const tierCls = masked ? 'tier-hidden' : ('tier-'+a.tier);
      let progHtml = '';
      if(locked && !masked && typeof RPG_ACH_PROG[a.id]==='function'){
        let p; try{ p = RPG_ACH_PROG[a.id](rpg); }catch(e){}
        if(p && p[1]>0){
          const cur = Math.max(0, Math.min(p[0]|0, p[1]));
          const pc = Math.round(cur / p[1] * 100);
          progHtml = `<div class="sys-ach-prog"><i style="width:${pc}%"></i></div><div class="sys-ach-progn">${cur} / ${p[1]}</div>`;
        }
      }
      return `<div class="sys-ach ${tierCls} ${locked?'locked':'unlocked'}">
        <div class="sys-ach-badge">${locked?'◇':'✦'}</div>
        <div class="sys-ach-name">${masked?'? ? ?':escH(a.name)}</div>
        <div class="sys-ach-desc">${masked?'隐藏成就':escH(a.desc)}</div>
        ${progHtml}
      </div>`;
    }).join('');
    sections += `<div class="sys-ach-cat-head"><span class="sys-sec-label">${cat.label}</span><span class="sys-ach-count">${catUnlocked} / ${list.length}</span></div>
      <div class="sys-achs">${cards}</div>`;
  }

  body.innerHTML = `
    <div class="sys-ach-overall">
      <div class="sys-ach-overall-head"><span>成就 · ACHIEVEMENTS</span><b>${unlocked} / ${total}</b></div>
      <div class="sys-exp"><i style="width:${overallPct}%"></i></div>
    </div>
    ${sections}
  `;
}

// Honour a deep-link to #system on first load.
sysHashRoute();
