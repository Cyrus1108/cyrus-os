/* 赛季记分板 —— S2 · 营收之季(2026-08-13 → 2026-11-13)。
   上一季「The 90」(2026-05-11 → 2026-08-09)的继任者。存储与同步完全不变:
   还是 S.the90 / the90_meta / the90_daily,还是同样的字段。变的只有赛季窗口、
   四根柱子、以及所有文案。旧赛季的日行数据一行都不删。

   每日打卡 = 分级打卡(v7.38.0 的评分方式,原样保留):点一下 1、再点 2、再点 3,
   第四下清空。1 = 最低标准 · 2 = 部分 · 3 = 深度;未打卡 = undefined。
   旧布尔值(true/false)由 the90Num 兼容成 3/0,所以上一季的历史照常显示。

   销售行动 = 三个数字计数器(陌生开发 / 跟进 / 新扫码),和打卡存在同一天的
   scores 对象里(scores 是 jsonb,存数字没问题)。全库没有任何地方遍历 scores
   ——只按显式键读(红线:禁止 for-in / Object.keys)——所以数字键与柱子键、以及
   lowday 的 _amp/_low/_lowx/_trig 命名空间键可以安全共处。 */

/* ════════════════ RENAME POINT ════════════════
   这一季所有对用户可见的名字都只写在这个块里。换季只改这里。 */

const SEASON_NAME  = 'S2 · 营收之季';
const SEASON_START = '2026-08-13';
const SEASON_END   = '2026-11-13';

const DAILY_NOTE_LABEL       = '今日营收';
const DAILY_NOTE_PLACEHOLDER = '今天带来了什么进账——钱、证据、客户,都算…';

const SEASON_CHECKIN_LABEL  = '今日打卡';
const SEASON_COUNTERS_LABEL = '销售行动';
const SEASON_WEEK_LABEL     = '本周';
const SEASON_HEATMAP_LABEL  = '热力图 · 全季';
const SEASON_TAGLINE = (daysLeft) => daysLeft > 0
  ? `11/13 那个 Cyrus 正在向你走来 · ${daysLeft} 天`
  : '11/13 到了。回顾你成为的人。';

/* 三个阶段平分赛季窗口(93 天 → 每段 31 天)。只是标签与里程碑,不改变打卡方式:
   全季都是分级打卡(见 the90Graded)。currentPhase 仍照写进 the90_meta,表结构不动。 */
const SEASON_PHASES = [
  { id: 'open',    label: '开局' },
  { id: 'push',    label: '加速' },
  { id: 'harvest', label: '收成' },
];

/* 四根柱子 —— 每天分级打卡 1–3。
   fallback only:真正生效的是 Supabase the90_meta.targets(S.the90.meta.targets)。 */
const SEASON_TARGETS_DEFAULT = [
  { id: 'ai',   label: 'AI 生意', twoMin: '打开客户名单,写一句开场白',   badDay: '发出 1 条陌生开发消息',
    standard: '当天对 AI 生意有实质推进:开发、跟进、交付或产出,有可见证据' },
  { id: 'jp',   label: '日本語',  twoMin: '打开 Anki,过 5 张卡',        badDay: '听 5 分钟日语音频',
    standard: '当天有完整一段日语输入或输出(词汇 / 语法 / 听力 / 口说)' },
  { id: 'fit',  label: '健身',    twoMin: '换上健身服走出房门',          badDay: '10 俯卧撑 + 10 深蹲',
    standard: '完成当日训练(力量 / 有氧 ≥30 分钟)' },
  { id: 'ball', label: '篮球',    twoMin: '把球和鞋放到门口',            badDay: '原地运球 5 分钟',
    standard: '当天真的去打球或练球 ≥30 分钟' },
];

/* 销售行动计数器 —— 每天的整数,和柱子同存在 scores 里。id 不与柱子 id 冲突。 */
const SEASON_COUNTERS = [
  { id: 'dm',     label: '陌生开发' },
  { id: 'follow', label: '跟进' },
  { id: 'scan',   label: '新扫码' },
];

/* 一天算「有效」需要达标几根柱子(streak 用)。低谷日另有一条更低的底线(见 computeThe90Streak)。 */
const SEASON_ACTIVE_THRESHOLD = 3;

/* ════════════════ 上一季(只读) ════════════════
   旧赛季 The 90 的起点与柱子 id。只有两个用途:(1) 迁移判断——起点早于本季的
   meta 就是旧的;(2) RPG 把旧日行的达标数算回历史 EXP(见 rpg.js rpgMetOn),
   否则等级会倒退,违反「等级/EXP 永不回退」的红线。 */
const SEASON_LEGACY_START = '2026-05-11';
const SEASON_LEGACY_TARGET_IDS = ['I', 'II', 'III', 'IV', 'V'];

/* ════════ Pure helpers ════════ */

/* 赛季长度(含首尾两天)。2026-08-13 → 2026-11-13 = 93 天。 */
function seasonLength(){
  const s = new Date(SEASON_START + 'T00:00:00+08:00');
  const e = new Date(SEASON_END + 'T00:00:00+08:00');
  return Math.floor((e - s) / 86400000) + 1;
}
/* 每个阶段的长度(天)。93 / 3 = 31;除不尽时最后一段吃掉余数。 */
function seasonPhaseLen(){ return Math.ceil(seasonLength() / SEASON_PHASES.length); }

function the90Day(dateStr){
  // Day 1 = SEASON_START. dateStr defaults to TODAY.
  const d = new Date((dateStr || TODAY) + 'T00:00:00+08:00');
  const s = new Date(SEASON_START + 'T00:00:00+08:00');
  return Math.floor((d - s) / 86400000) + 1;
}

/* 阶段只是标签与里程碑。上一季的日期会算出 day <= 0 → 落在第一段,这没关系:
   打卡方式全季一致(the90Graded 恒真),所以旧数据的达标判定不受影响。 */
function the90Phase(day){
  const len = seasonPhaseLen();
  const i = Math.min(SEASON_PHASES.length - 1, Math.max(0, Math.ceil(day / len) - 1));
  return SEASON_PHASES[i].id;
}

function the90PhaseLabel(phase){
  const p = SEASON_PHASES.find(x => x.id === phase);
  return p ? p.label : '';
}

/* 分级打卡:本季**全程**都是 1–3 分级(v7.38.0 的评分方式),没有布尔阶段。
   函数签名保留(rpg.js 等按名调用),但恒返回 true。
   对历史数据是等价的:the90ScoreMet 在 graded 分支里对布尔值走 `!!score`,
   与旧的 standardize 布尔判定逐位一致,所以上一季的达标数一个不差。 */
function the90Graded(phase){ return true; }
/* Coerce a legacy boolean score (optimize days logged before it became graded) to a number
   so mixed-type history still renders: true→3, false→0. Numbers/undefined pass through. */
function the90Num(score){ return score === true ? 3 : score === false ? 0 : score; }

function the90DaysUntil(target, fromDate){
  const a = new Date((fromDate || TODAY) + 'T00:00:00+08:00');
  const b = new Date(target + 'T00:00:00+08:00');
  return Math.ceil((b - a) / 86400000);
}

function the90DateForDay(day){
  const s = new Date(SEASON_START + 'T00:00:00+08:00');
  s.setDate(s.getDate() + day - 1);
  return s.toLocaleDateString('sv-SE');
}

/* 达标判定。分级:1–3 = 达标,0 = 没做到,undefined = 未打卡。
   旧布尔值:true = 达标,false = 没做到(与上一季的判定完全一致)。 */
function the90ScoreMet(score, phase){
  if(the90Graded(phase)) return typeof score === 'number' ? score > 0 : !!score;
  return !!score;
}

/* 当前生效的柱子(云端 meta 优先,拉取前用默认值兜底)。 */
function seasonTargets(){
  const t = S.the90 && S.the90.meta && S.the90.meta.targets;
  return (Array.isArray(t) && t.length) ? t : SEASON_TARGETS_DEFAULT;
}

/* 读/写今天那一格计数器的值。计数器只按显式 id 访问,不遍历 scores。 */
function the90CounterValue(counterId, dateStr){
  const sc = S.the90 && S.the90.daily && S.the90.daily[dateStr || TODAY] && S.the90.daily[dateStr || TODAY].scores;
  const v = sc ? Number(sc[counterId]) : 0;
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

/* ════════ State shape ════════
   S.the90 = {
     meta: { startDate, endDate, targets: [...], currentPhase },
     daily: { 'YYYY-MM-DD': { scores: {ai:1..3, …, dm:number, …, _amp:1..5}, note: string } }
   }
*/

function freshSeasonMeta(){
  return {
    startDate: SEASON_START,
    endDate: SEASON_END,
    targets: JSON.parse(JSON.stringify(SEASON_TARGETS_DEFAULT)),
    currentPhase: SEASON_PHASES[0].id,
  };
}

/* 迁移到本季。幂等,而且**每次渲染都重跑**:pullThe90Meta 或 realtime 回声会把
   上一季那行 meta 重新灌回 S,只在 init 迁一次是不够的。判据是起点日期——起点
   早于本季 = 旧的,整组换成本季 meta 并经既有的 saveThe90Meta 落库(同样的列,
   不改表结构)。条件自熄:推上去一次之后再拉回来的就是本季的了。
   (渲染函数里写库违反渲染纯度红线;这是有意的例外,因为只有渲染路径同时看得到
    init / pull / realtime 三条来路。条件为假时零副作用。) */
function ensureThe90Defaults(){
  if(!S.the90) S.the90 = { meta: null, daily: {} };
  if(!S.the90.daily) S.the90.daily = {};
  const m = S.the90.meta;
  if(!m){ S.the90.meta = freshSeasonMeta(); return; }
  if(!m.startDate || m.startDate < SEASON_START){
    S.the90.meta = freshSeasonMeta();
    if(typeof saveThe90Meta === 'function') saveThe90Meta();
    return;
  }
  if(!Array.isArray(m.targets) || !m.targets.length){
    m.targets = JSON.parse(JSON.stringify(SEASON_TARGETS_DEFAULT));
  }
}

/* 今天那一行(没有就现建)。 */
function the90TodayEntry(){
  if(!S.the90.daily[TODAY]) S.the90.daily[TODAY] = { scores: {}, note: '' };
  if(!S.the90.daily[TODAY].scores) S.the90.daily[TODAY].scores = {};
  return S.the90.daily[TODAY];
}

/* ════════ Interactions ════════ */

let _the90PerfectSfxDate = null;   // SFX latch: 满勤 flourish at most once per day
function toggleThe90(targetId){
  // 三拍:被点的打卡格是 reconcile 复用的持久节点(data-key=targetId),beatTap 的
  // transform 不会被 apply 里的 rThe90() 重渲染打断。拿不到格子则直接落地状态。
  const cell = document.querySelector('#the90-cells [data-key="' + targetId + '"]');
  const apply = function(){
    ensureThe90Defaults();
    const today = TODAY;
    the90TodayEntry();
    const day = the90Day();
    const phase = the90Phase(day);
    const cur = S.the90.daily[today].scores[targetId];
    const targets = (S.the90.meta && S.the90.meta.targets) || [];
    // 达成态 BEFORE 本次点击 —— 用于 false→true 的满勤仪式判定(镜像 the90WasComplete 语义)
    const wasAll = targets.length > 0 && targets.every(t => the90ScoreMet(S.the90.daily[today].scores[t.id], phase));

    if(the90Graded(phase)){
      // Ascending grade: (未打卡) → 1 → 2 → 3 → clear (tap UP; a 4th tap resets).
      const c = the90Num(cur);
      const next = (c === 1) ? 2 : (c === 2) ? 3 : (c === undefined || c === 0) ? 1 : undefined;
      if(next === undefined) delete S.the90.daily[today].scores[targetId];
      else S.the90.daily[today].scores[targetId] = next;
    } else {
      // 本季走不到这里(the90Graded 恒真);留着以防未来某季改回布尔打卡。
      S.the90.daily[today].scores[targetId] = !cur;
    }
    saveThe90Daily();
    const scores = S.the90.daily[today].scores;
    const isAll = targets.length > 0 && targets.every(t => the90ScoreMet(scores[t.id], phase));
    /* SFX — direction by MET status, not raw value (stabilize 3→2→1 stays met).
       Gesture-only: toggleThe90 is reachable solely from the cell onclick.
       The 5/5 flourish is latched per day — untick+retick replays only a tick. */
    if(window.Sfx){
      const wasMet = the90ScoreMet(cur, phase), isMet = the90ScoreMet(scores[targetId], phase);
      if(isMet && !wasMet){
        if(isAll && _the90PerfectSfxDate !== today){ _the90PerfectSfxDate = today; Sfx.perfect(); }
        else Sfx.tick();
      } else if(wasMet && !isMet){ Sfx.untick(); }
      else { Sfx.tick(); }                         // met→met step-down (stabilize) — plain tactile tick
    }
    // 满勤庆祝 → ritualPulse(false→true 达成瞬间;§2.4 配额辉光,零 S 副作用)。
    // 音效闩锁(_the90PerfectSfxDate)与 Sfx.perfect 时点原样保留,与视觉解耦。
    if(isAll && !wasAll && typeof window.ritualPulse === 'function'){
      window.ritualPulse(document.getElementById('the90-panel'));
    }
    rThe90();
    if(typeof rpgAfterChange === 'function') rpgAfterChange();   // settle EXP / level / achievements
    if(typeof window.lifeTreePulse === 'function') window.lifeTreePulse();   // tree energy feedback on check-in
  };
  if(window.beatTap && cell) window.beatTap(cell, apply);
  else apply();
}

/* RPG v2: a real module (AI 产出 / 健身打卡) auto-marks its The 90 pillar met for today,
   so the attribute engine (which reads the90 counts) reflects real activity instead of a
   manual self-rating. Idempotent: sets met only when not already met, and NEVER un-sets
   (won't fight a manual check or a stabilize step-down). */
function the90AutoMet(targetId){
  if(typeof ensureThe90Defaults === 'function') ensureThe90Defaults();
  const tgts = (S.the90 && S.the90.meta && S.the90.meta.targets) || [];
  if(!tgts.some(t => t.id === targetId)) return false;
  const today = TODAY;
  if(!S.the90.daily[today]) S.the90.daily[today] = { scores:{}, note:'' };
  const phase = the90Phase(the90Day());
  const cur = S.the90.daily[today].scores[targetId];
  if(the90ScoreMet(cur, phase)) return false;
  S.the90.daily[today].scores[targetId] = the90Graded(phase) ? 3 : true;
  saveThe90Daily();
  if(typeof rThe90 === 'function') rThe90();
  if(typeof rpgAfterChange === 'function') rpgAfterChange();
  return true;
}

/* 销售行动计数器 ±1。存进今天那一行的 scores(与柱子同一个对象,id 不冲突),
   最小值 0。这是手势路径,所以音效写在状态落地之后、守卫之内。 */
function bumpThe90Counter(counterId, delta){
  if(!SEASON_COUNTERS.some(c => c.id === counterId)) return;
  ensureThe90Defaults();
  const entry = the90TodayEntry();
  const cur = the90CounterValue(counterId);
  const next = Math.max(0, cur + delta);
  if(next === cur) return;                                                   // 已经是 0 还按减:不写库、不出声
  entry.scores[counterId] = next;
  saveThe90Daily();
  if(window.Sfx){ next > cur ? Sfx.tick() : Sfx.untick(); }
  rThe90();
}

function toggleThe90Drawer(id){
  const el = document.getElementById(id);
  if(el) el.classList.toggle('open');
}

/* ── Animation gates (session-ephemeral) ──
   the90Cascaded:   heatmap diagonal wave plays once per load, never on toggle.
   the90HeatObserver: IntersectionObserver that fires the cascade when the heatmap
                      first scrolls into view (it sits below the fold + has
                      content-visibility:auto, so a render-time trigger never shows).
   the90WasComplete: tracks all-5-done so the brass sweep fires only at the moment it flips true.
                     Seeded null so the FIRST render (e.g. a page reload of an already-complete
                     day) only latches the state and does NOT replay the celebration; a genuine
                     false→true flip during the session still fires. */
let the90Cascaded = false;
let the90HeatObserver = null;
let the90WasComplete = null;
/* the90HeatSig / the90HeatHtml: cheap memo so the 450-cell heatmap innerHTML is only
   rebuilt when an input that affects it actually changed (scores in-window, TODAY, day,
   target set). Unrelated renderAll passes reuse the cached byte-identical markup. */
let the90HeatSig = null;
let the90HeatHtml = '';

/* Arm a one-shot cascade: play the diagonal wave the moment the heatmap enters the viewport. */
function the90ArmCascade(){
  if(the90Cascaded || the90HeatObserver) return;
  const host = document.getElementById('the90-heatmap');
  if(!host) return;
  const fire = () => {
    if(the90Cascaded) return;
    the90Cascaded = true;
    const grid = host.querySelector('.the90-h-grid');
    if(grid){
      requestAnimationFrame(()=>{
        grid.classList.add('cascade');
        // Remove after the wave finishes so the today-cell breathing (②) regains control.
        setTimeout(()=> grid.classList.remove('cascade'), 1100);
      });
    }
  };
  if(!('IntersectionObserver' in window)){ fire(); return; }
  the90HeatObserver = new IntersectionObserver((entries)=>{
    if(entries.some(e => e.isIntersecting)){
      fire();
      the90HeatObserver.disconnect();
      the90HeatObserver = null;
    }
  }, { threshold: 0.15 });
  the90HeatObserver.observe(host);
}

/* ── Hard-standard boxes — ephemeral expand state (not persisted) ── */
const the90StdOpen = {};
function toggleThe90Std(id){
  the90StdOpen[id] = !the90StdOpen[id];
  rThe90();
}

/* Global keys on the main page (only when the finance overlay is closed):
     、         → open the finance view (mirror of the in-finance privacy key)
     1 … N      → toggle the matching target's hard-standard box (left→right)
   Guarded so it never fires while typing or while finance owns the keyboard. */
function initThe90Keys(){
  document.addEventListener('keydown', (e)=>{
    // Themed calendar / time picker popups (reused on the main page) own the
    // keyboard while open — route to them before anything else.
    if(typeof finCalOpen==='function' && finCalOpen()){ if(typeof finCalKey==='function') finCalKey(e); return; }
    if(typeof timePickerOpen==='function' && timePickerOpen()){ timePickerKey(e); return; }
    // Any full-screen overlay / modal owns the keyboard — don't let the main-page
    // shortcuts (、 / 1–5) leak through to the dashboard hidden underneath it.
    if((typeof finUI!=='undefined' && finUI.open) ||
       (typeof fitUI!=='undefined' && fitUI.open) ||
       (typeof sysUI!=='undefined' && sysUI.open) ||
       (typeof motivUI!=='undefined' && motivUI.open) ||
       (typeof calUI!=='undefined' && calUI.open) ||
       (typeof aiUI!=='undefined' && aiUI.open) ||
       document.body.classList.contains('has-focus') ||
       document.getElementById('drawer')?.classList.contains('open') ||
       document.getElementById('principles-modal')?.classList.contains('open') ||
       document.getElementById('lowday-modal')?.classList.contains('open')) return;
    const tag = e.target.tagName;
    if(tag==='INPUT' || tag==='TEXTAREA' || tag==='SELECT') return;
    if(e.metaKey || e.ctrlKey || e.altKey) return;

    // 、 on the main page → jump into finance. The 、(顿号) key is the physical
    // Backslash key; match by e.code so it fires whatever the IME/input mode.
    if(e.key==='、' || e.key==='\\' || e.code==='Backslash'){
      if(typeof openFinance==='function'){ e.preventDefault(); openFinance(); }
      return;
    }
    // 1–9 → toggle that target's hard-standard box(实际有几根柱子由下面的守卫决定)
    if(e.key>='1' && e.key<='9'){
      if(!document.getElementById('the90-standards')) return;
      ensureThe90Defaults();
      const t = S.the90.meta.targets[Number(e.key)-1];
      if(t){ e.preventDefault(); toggleThe90Std(t.id); }
    }
  });
}

let the90NoteT;
function onThe90Note(){
  ensureThe90Defaults();
  const today = TODAY;
  if(!S.the90.daily[today]) S.the90.daily[today] = { scores: {}, note: '' };
  S.the90.daily[today].note = document.getElementById('the90-note').value;
  clearTimeout(the90NoteT);
  the90NoteT = setTimeout(saveThe90Daily, 600);
}

/* ════════ Render ════════ */

function rThe90(){
  ensureThe90Defaults();
  const meta = S.the90.meta;
  const total = seasonLength();
  const day = the90Day();
  const phase = the90Phase(day);
  meta.currentPhase = phase; // auto-advance

  const todayScores = S.the90.daily[TODAY]?.scores || {};
  const todayNote = S.the90.daily[TODAY]?.note || '';

  // 网格列数交给 CSS 变量:柱子数与赛季长度换了,打卡格/标签/本周/热力图都跟着变。
  // 用 setProperty 逐个写、**不要** setAttr('style', …) 整条覆盖:#the90-panel 是
  // glass.js 的 Focus Space 目标(聚焦飞行期间它自己会往 inline style 里写
  // view-transition-name / FLIP 变换),整条重写会在飞行途中把那些抹掉。
  const panelEl = document.getElementById('the90-panel');
  if(panelEl){
    panelEl.style.setProperty('--the90-n', String(meta.targets.length));
    panelEl.style.setProperty('--the90-days', String(total));
  }
  // 赛季名(静态一次,但 setText 有守卫,重复渲染不写)
  setText(document.getElementById('the90-season'), SEASON_NAME);
  // 各区块标题 —— 全部来自 RENAME POINT 常量块,index.html 里不留死文案
  setText(document.getElementById('the90-checkin-label'), SEASON_CHECKIN_LABEL);
  setText(document.getElementById('the90-counters-label'), SEASON_COUNTERS_LABEL);
  setText(document.getElementById('the90-week-label'), SEASON_WEEK_LABEL);
  setText(document.getElementById('the90-heatmap-label'), SEASON_HEATMAP_LABEL);
  setText(document.getElementById('the90-note-label'), DAILY_NOTE_LABEL);
  setAttr(document.getElementById('the90-note'), 'placeholder', DAILY_NOTE_PLACEHOLDER);

  // Day X / 总天数 + 阶段徽章
  // ⑧ day counter: roll the number up on first load (0→day); non-numeric states fall back to text.
  const dayEl = document.getElementById('the90-day');
  if(day < 1) dayEl.textContent = '— PRE';
  else if(day > total) dayEl.textContent = 'COMPLETE';
  else {
    let dayB = dayEl.querySelector('.n');
    const prevDay = dayB ? (parseInt(dayB.textContent) || 0) : 0;
    if(!dayB || dayEl.dataset.total !== String(total)){
      dayEl.innerHTML = `DAY <b class="n">${prevDay}</b> / ${total}`;
      dayEl.dataset.total = String(total);
      dayB = dayEl.querySelector('.n');
    }
    if(typeof animateNumber==='function') animateNumber(dayB, prevDay, day, 500);
    else dayB.textContent = day;
  }
  setText(document.getElementById('the90-phase'), the90PhaseLabel(phase));

  // Identity statement removed per Cyrus's request — only the tagline (date + countdown) shows.

  // Tagline — 倒数到赛季结束
  const daysLeft = the90DaysUntil(SEASON_END, new Date().toLocaleDateString('sv-SE'));   // 读实时日期,跨午夜不会停在昨天
  setText(document.getElementById('the90-tagline'), SEASON_TAGLINE(daysLeft));

  // Today's check-in cells (one per target) — persistent keyed DOM: only the tapped cell's
  // class/mark change in place, so a redundant render never rebuilds the very <button> a
  // finger is mid-tap on (the "tap twice" class of bug), and the .celebrate class on the
  // container survives untouched.
  reconcileList(document.getElementById('the90-cells'), meta.targets, {
    key: t => t.id,
    create: t => {
      const b = document.createElement('button');
      b.className = 'the90-cell';
      b.setAttribute('onclick', `toggleThe90('${t.id}')`);
      b.innerHTML = `<span class="the90-cell-id">${escH(String(t.id).toUpperCase())}</span><span class="the90-cell-mark"></span>`;
      return b;
    },
    update: (b, t) => {
      const score = todayScores[t.id];
      let mark, on, off;
      if(the90Graded(phase)){
        const n = the90Num(score);
        mark = (n === undefined) ? '·' : String(n);
        on = (typeof n === 'number' && n > 0); off = (n === 0);
      } else {
        mark = score ? '✓' : (score === false ? '✗' : '·');
        on = !!score; off = score === false;
      }
      setClass(b, 'on', on);
      setClass(b, 'off', off);
      setAttr(b, 'title', `${t.label} · 点一下升一级 1→2→3,第四下清空`);
      setText(b.querySelector('.the90-cell-mark'), mark);
    }
  });

  // 销售行动计数器 —— 三个 ± 步进器,值存在同一天的 scores 里(键控行,持久节点)
  const cntEl = document.getElementById('the90-counters');
  if(cntEl){
    reconcileList(cntEl, SEASON_COUNTERS, {
      key: c => c.id,
      create: c => {
        const d = document.createElement('div');
        d.className = 'the90-counter';
        d.innerHTML = `<span class="the90-counter-label">${escH(c.label)}</span>`
          + `<div class="the90-counter-ctl">`
          + `<button class="the90-counter-btn" onclick="bumpThe90Counter('${c.id}',-1)" aria-label="${escH(c.label)} 减一">−</button>`
          + `<span class="the90-counter-num">0</span>`
          + `<button class="the90-counter-btn" onclick="bumpThe90Counter('${c.id}',1)" aria-label="${escH(c.label)} 加一">+</button>`
          + `</div>`;
        return d;
      },
      update: (d, c) => {
        const n = the90CounterValue(c.id);
        const numEl = d.querySelector('.the90-counter-num');
        const prev = parseInt(numEl.textContent) || 0;
        if(typeof animateNumber === 'function') animateNumber(numEl, prev, n, 300);
        else setText(numEl, String(n));
        setClass(d, 'has', n > 0);
      }
    });
  }

  // Target labels under cells
  setHTML(document.getElementById('the90-labels'), meta.targets.map(t =>
    `<span class="the90-label" title="${escH(t.label)}">${escH(t.label)}</span>`
  ).join(''));

  // Hard-standard boxes (one per target) — collapsed shows ⌄, expanded reveals the standard.
  // Toggle by click or number keys 1–5 (left→right). Default standard falls back when missing.
  // Persistent keyed buttons so toggling one open only flips that button's class in place,
  // never rebuilding the sibling boxes.
  const stdEl = document.getElementById('the90-standards');
  if(stdEl){
    reconcileList(stdEl, meta.targets, {
      key: t => t.id,
      create: t => {
        const b = document.createElement('button');
        b.className = 'the90-std';
        b.setAttribute('onclick', `toggleThe90Std('${t.id}')`);
        b.innerHTML = `<span class="the90-std-arrow">⌄</span>`
          + `<div class="the90-std-body"><div class="the90-std-inner"><span class="the90-std-text"></span></div></div>`;
        return b;
      },
      update: (b, t) => {
        const i = meta.targets.indexOf(t);
        const std = t.standard || (SEASON_TARGETS_DEFAULT[i] && SEASON_TARGETS_DEFAULT[i].standard) || '';
        const open = !!the90StdOpen[t.id];
        setClass(b, 'open', open);
        setAttr(b, 'title', `硬标准 · ${t.label}（按 ${i+1}）`);
        setAttr(b, 'aria-expanded', open ? 'true' : 'false');
        setText(b.querySelector('.the90-std-text'), std);
      }
    });
  }

  // This week (rolling Mon→Sun) — count met per target
  const now = new Date(TODAY + 'T00:00:00+08:00');
  const dow = now.getDay(); // 0=Sun
  const mon = new Date(now); mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  const weekDates = Array.from({length:7}, (_,i)=>{
    const d = new Date(mon); d.setDate(mon.getDate()+i);
    return d.toLocaleDateString('sv-SE');
  });
  // ⑤ N/7 number rolls up + a thin brass bar fills proportionally.
  // Persistent keyed stats: the <b class="n"> node survives across renders, so the count-up
  // naturally rolls from its current value to the new one (no innerHTML rebuild each pass).
  const weekItems = meta.targets.map(t => ({
    id: t.id,
    met: weekDates.filter(d => the90ScoreMet(S.the90.daily[d]?.scores?.[t.id], the90Phase(the90Day(d)))).length
  }));
  reconcileList(document.getElementById('the90-week'), weekItems, {
    key: it => it.id,
    create: () => {
      const s = document.createElement('span');
      s.className = 'the90-week-stat';
      s.innerHTML = `<b class="n">0</b>/7<i class="the90-week-bar"></i>`;
      return s;
    },
    update: (s, it) => {
      const bEl = s.querySelector('.n');
      const prev = parseInt(bEl.textContent) || 0;
      if(typeof animateNumber === 'function') animateNumber(bEl, prev, it.met, 400);
      else setText(bEl, it.met);
      setAttr(s.querySelector('.the90-week-bar'), 'style', `--p:${it.met/7}`);
    }
  });

  // Streak + Best week + next milestone
  const newStreak = computeThe90Streak();
  const streakEl = document.getElementById('the90-streak');
  const prevStreak = parseInt(streakEl.textContent) || 0;
  if(typeof animateNumber==='function') animateNumber(streakEl, prevStreak, newStreak, 500);
  else streakEl.textContent = newStreak;
  // ⑥ Best week + Milestone roll their numbers up too (consistent with Streak).
  const weekMax = meta.targets.length * 7;           // 四柱 → 28
  const bestStr = computeThe90BestWeek();            // e.g. "19/28"
  const bestNum = parseInt(bestStr) || 0;
  const bestEl = document.getElementById('the90-bestweek');
  let bestB = bestEl.querySelector('.n');
  const prevBest = bestB ? (parseInt(bestB.textContent) || 0) : 0;
  if(!bestB || bestEl.dataset.max !== String(weekMax)){
    bestEl.innerHTML = `<b class="n">${prevBest}</b>/${weekMax}`;
    bestEl.dataset.max = String(weekMax);
    bestB = bestEl.querySelector('.n');
  }
  if(typeof animateNumber==='function') animateNumber(bestB, prevBest, bestNum, 500);
  else bestB.textContent = bestNum;

  // 里程碑 = 下一个阶段边界(31 / 62 / 93)
  const _len = seasonPhaseLen();
  const nextMs = SEASON_PHASES
    .map((_, i) => Math.min(total, (i + 1) * _len))
    .find(b => day < b) ?? null;
  const msEl = document.getElementById('the90-milestone');
  if(!nextMs){
    msEl.textContent = `已完成 ${total} 天`;
  } else {
    const daysToMs = nextMs - day;
    let msB = msEl.querySelector('.n');
    const prevMs = msB ? (parseInt(msB.textContent) || 0) : 0;
    // rebuild shell if structure missing or milestone target changed (suffix differs)
    if(!msB || msEl.dataset.ms !== String(nextMs)){
      msEl.innerHTML = `DAY ${nextMs} · <b class="n">${prevMs}</b> 天`;
      msEl.dataset.ms = String(nextMs);
      msB = msEl.querySelector('.n');
    }
    if(typeof animateNumber==='function') animateNumber(msB, prevMs, daysToMs, 500);
    else msB.textContent = daysToMs;
  }

  // ④ 满勤仪式:旧 .celebrate 格子扫光已退役(v7.36.0),视觉统一走 ritualPulse。
  //    但满勤可由非点击路径达成(the90AutoMet 自动勾、realtime 远端补完)——只有
  //    render 里的 false→true 闩锁能看到所有路径,故仪式由这里触发;toggleThe90
  //    里的手势触发与本处重合时,ritualPulse 的全局互斥闩(_ritualActive)吸收重复。
  //    (视觉-only + 闩锁一次,是渲染纪律容许的既有先例,同旧 celebrate。)
  const metToday = meta.targets.filter(t => the90ScoreMet(todayScores[t.id], phase)).length;
  const allDone = meta.targets.length > 0 && metToday === meta.targets.length;
  if(the90WasComplete !== null && allDone && !the90WasComplete
     && typeof window.ritualPulse === 'function'){
    window.ritualPulse(document.getElementById('the90-panel'));
  }
  the90WasComplete = allDone;

  // Life-tree cultivation-chamber telemetry HUD (sterile theme)
  const ltGrow = document.getElementById('lt-grow');
  if(ltGrow){
    setText(ltGrow, (day < 1 ? 0 : Math.min(100, Math.round(day / total * 100))) + '%');
    setText(document.getElementById('lt-streak'), computeThe90Streak());
    setText(document.getElementById('lt-phase'), the90PhaseLabel(phase));
    setText(document.getElementById('lt-left'), (daysLeft > 0 ? daysLeft : 0) + '天');
    setText(document.getElementById('lt-today'), metToday + '/' + meta.targets.length);
    const ch = document.getElementById('lifetree-chamber');
    if(ch) ch.classList.toggle('milestone', day > 0 && day % seasonPhaseLen() === 0);
    // state-reactive ambient: more complete today → warmer/brighter whole-system glow
    if(typeof setAmbientLevel === 'function') setAmbientLevel(metToday / meta.targets.length);
  }

  // Heatmap — 赛季全长 × 柱子数(本季 93 × 4 = 372 格)。
  // Gate the full innerHTML rebuild behind a cheap signature: it only depends on the
  // in-window day scores, the target set/order, and TODAY (which drives isToday/isFuture;
  // phase is derived from the day index). Unrelated renderAll passes skip the rebuild and
  // reuse the byte-identical cached markup.
  const heatHost = document.getElementById('the90-heatmap');
  const heatSig = TODAY + '|' + meta.targets.map(t => t.id).join(',') + '|' + (() => {
    const parts = [];
    for(let d = 1; d <= total; d++){
      const date = the90DateForDay(d);
      const sc = S.the90.daily[date]?.scores;
      if(sc) parts.push(date + ':' + meta.targets.map(t => sc[t.id]).join(','));
    }
    return parts.join(';');
  })();
  if(heatSig !== the90HeatSig){
    the90HeatSig = heatSig;
    the90HeatHtml = renderThe90Heatmap();
    heatHost.innerHTML = the90HeatHtml;
  }
  // ① diagonal cascade — armed via IntersectionObserver so it plays when the
  // heatmap actually scrolls into view (one-shot per load). See the90ArmCascade.
  the90ArmCascade();

  // Drawer contents (two-min entries + bad day minimums) — guarded so unrelated renders skip.
  setHTML(document.getElementById('the90-twomin-body'), meta.targets.map(t =>
    `<div class="the90-drawer-row"><span class="the90-drawer-id">${escH(String(t.id).toUpperCase())}</span><span class="the90-drawer-label">${escH(t.label)}</span><span class="the90-drawer-text">${escH(t.twoMin)}</span></div>`
  ).join(''));
  setHTML(document.getElementById('the90-badday-body'), meta.targets.map(t =>
    `<div class="the90-drawer-row"><span class="the90-drawer-id">${escH(String(t.id).toUpperCase())}</span><span class="the90-drawer-label">${escH(t.label)}</span><span class="the90-drawer-text">${escH(t.badDay)}</span></div>`
  ).join(''));

  // Today's note
  const noteEl = document.getElementById('the90-note');
  if(noteEl && document.activeElement !== noteEl) noteEl.value = todayNote;

  // Today's amplitude (1–5) row + discreet Low Day entry — owned by lowday.js.
  // setStableHTML shares lowday.js's cache key (el._stableHTML) so the two writers stay
  // consistent and neither rebuilds the low-day entry button mid-tap.
  const ampEl = document.getElementById('the90-amp');
  if(ampEl && typeof lowdayAmpRowHtml === 'function') setStableHTML(ampEl, lowdayAmpRowHtml());
}

function computeThe90Streak(){
  // Reads S.the90.daily, hydrated by pullThe90Daily's rolling window (= the season length
  // + buffer). That window must stay ≥ seasonLength() so no in-window day is trimmed and
  // the streak never breaks falsely on a long run.
  // Current run of days (most recent → back) meeting ≥ SEASON_ACTIVE_THRESHOLD targets.
  // Today is PENDING: if it isn't met yet it neither counts nor breaks the run —
  // you simply haven't extended your streak today. Only a genuine PAST miss ends it.
  // (This is why it must not collapse to 0 the instant you uncheck today's 3rd target.)
  let streak = 0;
  for(let d = the90Day(); d >= 1; d--){
    const date = the90DateForDay(d);
    if(date > TODAY) continue;
    const day = S.the90.daily[date];
    const phase = the90Phase(d);
    const met = day ? S.the90.meta.targets.filter(t => the90ScoreMet(day.scores?.[t.id], phase)).length : 0;
    // Low Day drops the day's pass-bar to ONE minimal action (≥1 instead of the season
    // threshold) — 「底线永远留在最低」. A low day with 0 met still breaks the run.
    const bar = (typeof lowDayOn === 'function' && lowDayOn(date)) ? 1 : SEASON_ACTIVE_THRESHOLD;
    // 渡: a crossed low day satisfies its own floor even with 0 targets scored — the
    // protocol says do the one minimal action and DON'T grade it, so the crossing
    // itself must hold the streak (「底线永远留在最低」). Else following the protocol
    // literally (tap 渡, tick nothing) would silently break the run.
    const crossed = !!(day && day.scores && day.scores._lowx);
    if(met >= bar || crossed) streak++;
    else if(date === TODAY) continue;   // pending today — don't count, don't break
    else break;                         // a real past miss ends the run
  }
  return streak;
}

function computeThe90BestWeek(){
  // Best week so far = max total met-checks (out of 柱子数 × 7) across all completed weeks
  const max = (S.the90?.meta?.targets || SEASON_TARGETS_DEFAULT).length * 7;
  let best = 0, bestStr = `0/${max}`;
  const today = new Date(TODAY + 'T00:00:00+08:00');
  for(let w = 0; ; w++){
    const start = new Date(SEASON_START + 'T00:00:00+08:00');
    start.setDate(start.getDate() + w * 7);
    if(start > today) break;
    let total = 0, dayCount = 0;
    for(let i=0;i<7;i++){
      const d = new Date(start); d.setDate(start.getDate()+i);
      const ds = d.toLocaleDateString('sv-SE');
      if(ds > TODAY) break;
      dayCount++;
      const phase = the90Phase(the90Day(ds));
      const scores = S.the90.daily[ds]?.scores || {};
      total += S.the90.meta.targets.filter(t => the90ScoreMet(scores[t.id], phase)).length;
    }
    if(dayCount === 7 && total > best){
      best = total;
      bestStr = `${total}/${max}`;
    }
  }
  return bestStr;
}

function renderThe90Heatmap(){
  // 一格 = 某根柱子的某一天。rows = 柱子,cols = 赛季的每一天(本季 4 × 93 = 372 格)。
  // 列数由 CSS 变量 --the90-days 驱动(rThe90 写在 #the90-panel 上),换季不用改 CSS。
  const meta = S.the90.meta;
  const total = seasonLength();

  const rows = meta.targets.map((t, rowIndex) => {
    const cells = [];
    for(let d = 1; d <= total; d++){
      const date = the90DateForDay(d);
      const isToday = date === TODAY;
      const isFuture = date > TODAY;
      const phase = the90Phase(d);
      const score = S.the90.daily[date]?.scores?.[t.id];
      let cls = 'h-cell';
      if(isFuture) cls += ' h-future';
      else if(score === undefined) cls += ' h-empty';
      else if(the90Graded(phase)){
        const n = the90Num(score);
        if(n === 3) cls += ' h-l3';
        else if(n === 2) cls += ' h-l2';
        else if(n === 1) cls += ' h-l1';
        else cls += ' h-miss';
      } else {
        cls += score ? ' h-on' : ' h-miss';
      }
      if(isToday) cls += ' h-today';
      // --wave = diagonal index (row + day) drives the one-time cascade delay
      cells.push(`<div class="${cls}" style="--wave:${rowIndex + d}" title="${t.id} · ${date}"></div>`);
    }
    return `<div class="the90-h-row" data-id="${t.id}">${cells.join('')}</div>`;
  }).join('');

  // ② full-height breathing bar over today's column (only while inside the 1..90 window)
  const tDay = the90Day();
  const todayCol = (tDay >= 1 && tDay <= total)
    ? `<div class="the90-today-col" style="--col:${tDay}"></div>`
    : '';
  return `<div class="the90-h-grid">${rows}${todayCol}</div>`;
}
