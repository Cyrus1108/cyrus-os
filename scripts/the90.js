/* The 90 — 90-day commitment tracker.
   Day 1 = 2026-05-11, Day 90 = 2026-08-09.
   Three phases (30 days each): standardize → stabilize → optimize.

   Standardize:  ✓/✗ per target per day
   Stabilize:    0–3 score per target (deep / partial / minimum / miss)
   Optimize:     ✓/✗ plus an "optimize" prompt per target

   Default targets and identity statements come from Cyrus's 2026-05-11 brief. */

const THE_90_START = '2026-05-11';
const THE_90_END = '2026-08-09';

// Fallback only — the live targets come from Supabase the90_meta (S.the90.meta.targets).
// Kept in sync with the real 5 so the standard/twoMin/badDay fallbacks never show stale text.
const THE_90_TARGETS_DEFAULT = [
  { id: 'I',   label: '21:30 上床',   twoMin: '把手机放到客厅充电器',   badDay: '21:30 灯关 + 闭眼躺平',  standard: '21:30 上床、灯关无手机，实际睡满 7 小时' },
  { id: 'II',  label: '10 分钟冥想',  twoMin: '坐到瑜伽垫 + 打开计时器', badDay: '1 分钟深呼吸 × 3 次',    standard: '完整 10 分钟、不中断的专注冥想' },
  { id: 'III', label: 'AI Automation', twoMin: '打开编辑器或教程，写下今天要推进的一步', badDay: '读 5 分钟 AI 文档 / 教程',  standard: '当天对 AI Automation 有实质投入（学习或构建，有可见产出 / 进展）' },
  { id: 'IV',  label: '每周健身 5 天', twoMin: '换上健身服',            badDay: '10 俯卧撑 + 10 深蹲',    standard: '完成当日训练（力量/有氧 ≥30 分钟），本周累计 ≥5 天' },
  { id: 'V',   label: '性能量管理',   twoMin: '冲动时去阳台站 30 秒',   badDay: '冲动时做 10 俯卧撑代替', standard: '早上绝对不释放；12:30–13:00 后才视情况，非必要或忙碌则保留' },
];

/* 暑假重心转向 AI Automation：柱 III 由「课业全 A」重命名。用户数据自愈（仿
   cleanJapanese）——仅当 III 仍是旧默认标签时整组替换，保留任何未来自定义。幂等。 */
function cleanThe90Targets(){
  const meta = S.the90 && S.the90.meta;
  if(!meta || !Array.isArray(meta.targets)) return false;
  const t = meta.targets.find(x => x.id === 'III');
  if(t && t.label === '课业全 A'){
    t.label    = 'AI Automation';
    t.twoMin   = '打开编辑器或教程，写下今天要推进的一步';
    t.badDay   = '读 5 分钟 AI 文档 / 教程';
    t.standard = '当天对 AI Automation 有实质投入（学习或构建，有可见产出 / 进展）';
    return true;
  }
  return false;
}

const THE_90_IDENTITIES = [
  '我是一个掌控自己睡眠的人',
  '我是一个每天拍球的人',
  '我是一个让钱为我工作的人',
  '我是一个走向日语流利的人',
  '我是一个把训练当饭吃的人',
];

/* ════════ Pure helpers ════════ */

function the90Day(dateStr){
  // Day 1 = start_date. dateStr defaults to TODAY.
  const d = new Date((dateStr || TODAY) + 'T00:00:00+08:00');
  const s = new Date(THE_90_START + 'T00:00:00+08:00');
  return Math.floor((d - s) / 86400000) + 1;
}

function the90Phase(day){
  if(day <= 30) return 'standardize';
  if(day <= 60) return 'stabilize';
  return 'optimize';
}

function the90PhaseLabel(phase){
  return ({standardize:'STANDARDIZE', stabilize:'STABILIZE', optimize:'OPTIMIZE'})[phase] || '';
}

function the90DaysUntil(target, fromDate){
  const a = new Date((fromDate || TODAY) + 'T00:00:00+08:00');
  const b = new Date(target + 'T00:00:00+08:00');
  return Math.ceil((b - a) / 86400000);
}

function the90DateForDay(day){
  const s = new Date(THE_90_START + 'T00:00:00+08:00');
  s.setDate(s.getDate() + day - 1);
  return s.toLocaleDateString('sv-SE');
}

/* Score is truthy if target was met. Standardize: bool. Stabilize: 1–3 = met, 0 = missed. */
function the90ScoreMet(score, phase){
  if(phase === 'stabilize') return typeof score === 'number' ? score > 0 : !!score;
  return !!score;
}

/* ════════ State shape ════════
   S.the90 = {
     meta: { startDate, endDate, targets: [...], currentPhase },
     daily: { 'YYYY-MM-DD': { scores: {I:bool, II:bool, ...}, note: string } }
   }
*/

function ensureThe90Defaults(){
  if(!S.the90) S.the90 = { meta: null, daily: {} };
  if(!S.the90.meta){
    S.the90.meta = {
      startDate: THE_90_START,
      endDate: THE_90_END,
      targets: JSON.parse(JSON.stringify(THE_90_TARGETS_DEFAULT)),
      currentPhase: 'standardize',
    };
  }
}

/* ════════ Interactions ════════ */

let _the90PerfectSfxDate = null;   // SFX latch: 5/5 flourish at most once per day
function toggleThe90(targetId){
  ensureThe90Defaults();
  const today = TODAY;
  if(!S.the90.daily[today]) S.the90.daily[today] = { scores: {}, note: '' };
  const day = the90Day();
  const phase = the90Phase(day);
  const cur = S.the90.daily[today].scores[targetId];

  if(phase === 'stabilize'){
    // Cycle 0 → 3 → 2 → 1 → 0 (start at 3 on first tap = deep work day)
    const next = cur === undefined ? 3 : cur === 3 ? 2 : cur === 2 ? 1 : cur === 1 ? 0 : 3;
    S.the90.daily[today].scores[targetId] = next;
  } else {
    // standardize + optimize: ✓ ↔ ✗
    S.the90.daily[today].scores[targetId] = !cur;
  }
  saveThe90Daily();
  /* SFX — direction by MET status, not raw value (stabilize 3→2→1 stays met).
     Gesture-only: toggleThe90 is reachable solely from the cell onclick.
     The 5/5 flourish is latched per day — untick+retick replays only a tick. */
  if(window.Sfx){
    const scores = S.the90.daily[today].scores;
    const wasMet = the90ScoreMet(cur, phase), isMet = the90ScoreMet(scores[targetId], phase);
    if(isMet && !wasMet){
      const targets = (S.the90.meta && S.the90.meta.targets) || [];
      const all = targets.length > 0 && targets.every(t => the90ScoreMet(scores[t.id], phase));
      if(all && _the90PerfectSfxDate !== today){ _the90PerfectSfxDate = today; Sfx.perfect(); }
      else Sfx.tick();
    } else if(wasMet && !isMet){ Sfx.untick(); }
    else { Sfx.tick(); }                         // met→met step-down (stabilize) — plain tactile tick
  }
  rThe90();
  if(typeof rpgAfterChange === 'function') rpgAfterChange();   // settle EXP / level / achievements
  if(typeof window.lifeTreePulse === 'function') window.lifeTreePulse();   // tree energy feedback on check-in
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
  S.the90.daily[today].scores[targetId] = (phase === 'stabilize') ? 3 : true;
  saveThe90Daily();
  if(typeof rThe90 === 'function') rThe90();
  if(typeof rpgAfterChange === 'function') rpgAfterChange();
  return true;
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
     1 … 5      → toggle the matching target's hard-standard box (left→right)
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
    // 1–5 → toggle that target's hard-standard box
    if(e.key>='1' && e.key<='5'){
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
  const day = the90Day();
  const phase = the90Phase(day);
  meta.currentPhase = phase; // auto-advance

  const todayScores = S.the90.daily[TODAY]?.scores || {};
  const todayNote = S.the90.daily[TODAY]?.note || '';

  // Day X / 90 + phase chip
  // ⑧ day counter: roll the number up on first load (0→day); non-numeric states fall back to text.
  const dayEl = document.getElementById('the90-day');
  if(day < 1) dayEl.textContent = '— PRE';
  else if(day > 90) dayEl.textContent = 'COMPLETE';
  else {
    let dayB = dayEl.querySelector('.n');
    const prevDay = dayB ? (parseInt(dayB.textContent) || 0) : 0;
    if(!dayB){ dayEl.innerHTML = `DAY <b class="n">${prevDay}</b> / 90`; dayB = dayEl.querySelector('.n'); }
    if(typeof animateNumber==='function') animateNumber(dayB, prevDay, day, 500);
    else dayB.textContent = day;
  }
  document.getElementById('the90-phase').textContent = the90PhaseLabel(phase);

  // Identity statement removed per Cyrus's request — only the tagline (date + countdown) shows.

  // Tagline — countdown to August 9
  const daysLeft = the90DaysUntil(THE_90_END, new Date().toLocaleDateString('sv-SE'));   // 读实时日期,跨午夜不会停在昨天
  document.getElementById('the90-tagline').textContent = daysLeft > 0
    ? `8/9 那个 Cyrus 正在向你走来 · ${daysLeft} 天`
    : '8/9 到了。回顾你成为的人。';

  // Today's check-in cells (one per target)
  const cellsHtml = meta.targets.map(t => {
    const score = todayScores[t.id];
    let mark, cls;
    if(phase === 'stabilize'){
      mark = score === undefined ? '·' : String(score);
      cls = score > 0 ? 'on' : score === 0 ? 'off' : '';
    } else {
      mark = score ? '✓' : (score === false ? '✗' : '·');
      cls = score ? 'on' : (score === false ? 'off' : '');
    }
    return `<button class="the90-cell ${cls}" onclick="toggleThe90('${t.id}')" title="${escH(t.label)}">
      <span class="the90-cell-id">${t.id}</span>
      <span class="the90-cell-mark">${mark}</span>
    </button>`;
  }).join('');
  setStableHTML(document.getElementById('the90-cells'), cellsHtml);

  // Target labels under cells
  document.getElementById('the90-labels').innerHTML = meta.targets.map(t =>
    `<span class="the90-label" title="${escH(t.label)}">${escH(t.label)}</span>`
  ).join('');

  // Hard-standard boxes (one per target) — collapsed shows ⌄, expanded reveals the standard.
  // Toggle by click or number keys 1–5 (left→right). Default standard falls back when missing.
  const stdEl = document.getElementById('the90-standards');
  if(stdEl){
    stdEl.innerHTML = meta.targets.map((t,i)=>{
      const std = t.standard || (THE_90_TARGETS_DEFAULT[i] && THE_90_TARGETS_DEFAULT[i].standard) || '';
      const open = !!the90StdOpen[t.id];
      return `<button class="the90-std ${open?'open':''}" onclick="toggleThe90Std('${t.id}')"
        title="硬标准 · ${escH(t.label)}（按 ${i+1}）" aria-expanded="${open}">
        <span class="the90-std-arrow">⌄</span>
        <div class="the90-std-body">
          <div class="the90-std-inner">
            <span class="the90-std-text">${escH(std)}</span>
          </div>
        </div>
      </button>`;
    }).join('');
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
  const weekMet = meta.targets.map(t =>
    weekDates.filter(d => the90ScoreMet(S.the90.daily[d]?.scores?.[t.id], the90Phase(the90Day(d)))).length
  );
  const weekEl = document.getElementById('the90-week');
  const prevWk = [...weekEl.querySelectorAll('.n')].map(e => parseInt(e.textContent) || 0);
  weekEl.innerHTML = weekMet.map((met,i) =>
    `<span class="the90-week-stat"><b class="n">${prevWk[i] || 0}</b>/7<i class="the90-week-bar" style="--p:${met/7}"></i></span>`
  ).join('');
  if(typeof animateNumber==='function'){
    [...weekEl.querySelectorAll('.n')].forEach((b,i)=> animateNumber(b, prevWk[i] || 0, weekMet[i], 400));
  } else {
    [...weekEl.querySelectorAll('.n')].forEach((b,i)=> b.textContent = weekMet[i]);
  }

  // Streak + Best week + next milestone
  const newStreak = computeThe90Streak();
  const streakEl = document.getElementById('the90-streak');
  const prevStreak = parseInt(streakEl.textContent) || 0;
  if(typeof animateNumber==='function') animateNumber(streakEl, prevStreak, newStreak, 500);
  else streakEl.textContent = newStreak;
  // ⑥ Best week + Milestone roll their numbers up too (consistent with Streak).
  const bestStr = computeThe90BestWeek();            // e.g. "23/35"
  const bestNum = parseInt(bestStr) || 0;
  const bestEl = document.getElementById('the90-bestweek');
  let bestB = bestEl.querySelector('.n');
  const prevBest = bestB ? (parseInt(bestB.textContent) || 0) : 0;
  if(!bestB){ bestEl.innerHTML = `<b class="n">${prevBest}</b>/35`; bestB = bestEl.querySelector('.n'); }
  if(typeof animateNumber==='function') animateNumber(bestB, prevBest, bestNum, 500);
  else bestB.textContent = bestNum;

  const nextMs = day < 30 ? 30 : day < 60 ? 60 : day < 90 ? 90 : null;
  const msEl = document.getElementById('the90-milestone');
  if(!nextMs){
    msEl.textContent = '已完成 90 天';
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

  // ④ all-done payoff — fire the warm-white shine + glow flash once, the moment all met.
  const metToday = meta.targets.filter(t => the90ScoreMet(todayScores[t.id], phase)).length;
  const allDone = meta.targets.length > 0 && metToday === meta.targets.length;
  if(the90WasComplete !== null && allDone && !the90WasComplete){
    const cellsBox = document.getElementById('the90-cells');
    if(cellsBox){
      cellsBox.classList.remove('celebrate');
      // reflow so re-adding the class restarts the animation even on rapid re-complete
      void cellsBox.offsetWidth;
      cellsBox.classList.add('celebrate');
      setTimeout(()=> cellsBox.classList.remove('celebrate'), 900);
    }
  }
  the90WasComplete = allDone;

  // Life-tree cultivation-chamber telemetry HUD (sterile theme)
  const ltGrow = document.getElementById('lt-grow');
  if(ltGrow){
    ltGrow.textContent = (day < 1 ? 0 : Math.min(100, Math.round(day / 90 * 100))) + '%';
    document.getElementById('lt-streak').textContent = computeThe90Streak();
    document.getElementById('lt-phase').textContent = the90PhaseLabel(phase);
    document.getElementById('lt-left').textContent = (daysLeft > 0 ? daysLeft : 0) + '天';
    document.getElementById('lt-today').textContent = metToday + '/' + meta.targets.length;
    const ch = document.getElementById('lifetree-chamber');
    if(ch) ch.classList.toggle('milestone', day === 30 || day === 60 || day === 90);
    // state-reactive ambient: more complete today → warmer/brighter whole-system glow
    if(typeof setAmbientLevel === 'function') setAmbientLevel(metToday / meta.targets.length);
  }

  // Heatmap — 13 weeks x 5 targets.
  // Gate the 450-cell innerHTML rebuild behind a cheap signature: it only depends on the
  // in-window day scores, the target set/order, and TODAY (which drives isToday/isFuture;
  // phase is derived from the day index). Unrelated renderAll passes skip the rebuild and
  // reuse the byte-identical cached markup.
  const heatHost = document.getElementById('the90-heatmap');
  const heatSig = TODAY + '|' + meta.targets.map(t => t.id).join(',') + '|' + (() => {
    const parts = [];
    for(let d = 1; d <= 90; d++){
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

  // Drawer contents (two-min entries + bad day minimums)
  document.getElementById('the90-twomin-body').innerHTML = meta.targets.map(t =>
    `<div class="the90-drawer-row"><span class="the90-drawer-id">${t.id}</span><span class="the90-drawer-label">${escH(t.label)}</span><span class="the90-drawer-text">${escH(t.twoMin)}</span></div>`
  ).join('');
  document.getElementById('the90-badday-body').innerHTML = meta.targets.map(t =>
    `<div class="the90-drawer-row"><span class="the90-drawer-id">${t.id}</span><span class="the90-drawer-label">${escH(t.label)}</span><span class="the90-drawer-text">${escH(t.badDay)}</span></div>`
  ).join('');

  // Today's note
  const noteEl = document.getElementById('the90-note');
  if(noteEl && document.activeElement !== noteEl) noteEl.value = todayNote;

  // Today's amplitude (1–5) row + discreet Low Day entry — owned by lowday.js
  const ampEl = document.getElementById('the90-amp');
  if(ampEl && typeof lowdayAmpRowHtml === 'function') ampEl.innerHTML = lowdayAmpRowHtml();
}

function computeThe90Streak(){
  // Reads S.the90.daily, hydrated by pullThe90Daily's last-95-days window (= the 90-day
  // program length + buffer). That window must stay ≥ the program length so no in-window
  // day is trimmed and the streak never breaks falsely on a long run.
  // Current run of days (most recent → back) meeting ≥3 of 5 targets.
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
    // Low Day drops the day's pass-bar to ONE minimal action (≥1 instead of ≥3) — the
    // mechanism behind 「底线永远留在最低」. A low day with 0 met still breaks the run.
    const bar = (typeof lowDayOn === 'function' && lowDayOn(date)) ? 1 : 3;
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
  // Best week so far = max total met-checks (out of 35) across all completed weeks
  let best = 0, bestStr = '0/35';
  const today = new Date(TODAY + 'T00:00:00+08:00');
  for(let w = 0; ; w++){
    const start = new Date(THE_90_START + 'T00:00:00+08:00');
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
      bestStr = `${total}/35`;
    }
  }
  return bestStr;
}

function renderThe90Heatmap(){
  // 13 cols (weeks 1..13) × 5 rows (targets I..V). Each cell = one day.
  // Actually we want one cell per day per target — that's 90 days × 5 targets = 450 cells.
  // Display as a grid: rows = targets, cols = days. We'll show 13 weeks of 7 = 91 days, cap at 90.
  const meta = S.the90.meta;
  const total = 90;

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
      else if(phase === 'stabilize'){
        if(score === 3) cls += ' h-l3';
        else if(score === 2) cls += ' h-l2';
        else if(score === 1) cls += ' h-l1';
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
