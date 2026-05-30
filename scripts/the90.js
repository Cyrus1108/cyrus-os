/* The 90 — 90-day commitment tracker.
   Day 1 = 2026-05-11, Day 90 = 2026-08-09.
   Three phases (30 days each): standardize → stabilize → optimize.

   Standardize:  ✓/✗ per target per day
   Stabilize:    0–3 score per target (deep / partial / minimum / miss)
   Optimize:     ✓/✗ plus an "optimize" prompt per target

   Default targets and identity statements come from Cyrus's 2026-05-11 brief. */

const THE_90_START = '2026-05-11';
const THE_90_END = '2026-08-09';

const THE_90_TARGETS_DEFAULT = [
  { id: 'I',   label: '21:30 上床',     twoMin: '把手机放到客厅充电器',   badDay: '21:30 灯关 + 闭眼躺平' },
  { id: 'II',  label: '10 分钟冥想',    twoMin: '坐到瑜伽垫 + 打开计时器', badDay: '1 分钟深呼吸 × 3 次' },
  { id: 'III', label: '课业全 A',       twoMin: '打开课本翻到当前页',     badDay: '看课程笔记 5 分钟' },
  { id: 'IV',  label: '每周健身 5 天',  twoMin: '换上健身服',             badDay: '10 俯卧撑 + 10 深蹲' },
  { id: 'V',   label: '性能量管理',     twoMin: '冲动时去阳台站 30 秒',   badDay: '冲动时做 10 俯卧撑代替' },
];

const THE_90_IDENTITIES = [
  '我是一个掌控自己睡眠的人',
  '我是一个每天与自己对话的人',
  '我是一个把课业当作奖学金路径的人',
  '我是一个把训练当饭吃的人',
  '我是一个掌控自己性能量的人',
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
  rThe90();
  if(typeof window.lifeTreePulse === 'function') window.lifeTreePulse();   // tree energy feedback on check-in
}

function toggleThe90Drawer(id){
  const el = document.getElementById(id);
  if(el) el.classList.toggle('open');
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
  document.getElementById('the90-day').textContent = day < 1 ? '— PRE' : day > 90 ? 'COMPLETE' : `DAY ${day} / 90`;
  document.getElementById('the90-phase').textContent = the90PhaseLabel(phase);

  // Identity statement removed per Cyrus's request — only the tagline (date + countdown) shows.

  // Tagline — countdown to August 9
  const daysLeft = the90DaysUntil(THE_90_END);
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
  document.getElementById('the90-cells').innerHTML = cellsHtml;

  // Target labels under cells
  document.getElementById('the90-labels').innerHTML = meta.targets.map(t =>
    `<span class="the90-label" title="${escH(t.label)}">${escH(t.label)}</span>`
  ).join('');

  // This week (rolling Mon→Sun) — count met per target
  const now = new Date(TODAY + 'T00:00:00+08:00');
  const dow = now.getDay(); // 0=Sun
  const mon = new Date(now); mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  const weekDates = Array.from({length:7}, (_,i)=>{
    const d = new Date(mon); d.setDate(mon.getDate()+i);
    return d.toLocaleDateString('sv-SE');
  });
  const weekStats = meta.targets.map(t => {
    const met = weekDates.filter(d => the90ScoreMet(S.the90.daily[d]?.scores?.[t.id], the90Phase(the90Day(d)))).length;
    return `<span class="the90-week-stat">${met}/7</span>`;
  }).join('');
  document.getElementById('the90-week').innerHTML = weekStats;

  // Streak + Best week + next milestone
  document.getElementById('the90-streak').textContent = computeThe90Streak();
  document.getElementById('the90-bestweek').textContent = computeThe90BestWeek();
  const nextMs = day < 30 ? 30 : day < 60 ? 60 : day < 90 ? 90 : null;
  document.getElementById('the90-milestone').textContent = nextMs
    ? `DAY ${nextMs} · ${nextMs - day} 天`
    : '已完成 90 天';

  // Life-tree cultivation-chamber telemetry HUD (sterile theme)
  const ltGrow = document.getElementById('lt-grow');
  if(ltGrow){
    ltGrow.textContent = (day < 1 ? 0 : Math.min(100, Math.round(day / 90 * 100))) + '%';
    document.getElementById('lt-streak').textContent = computeThe90Streak();
    document.getElementById('lt-phase').textContent = the90PhaseLabel(phase);
    document.getElementById('lt-left').textContent = (daysLeft > 0 ? daysLeft : 0) + '天';
    const metToday = meta.targets.filter(t => the90ScoreMet(todayScores[t.id], phase)).length;
    document.getElementById('lt-today').textContent = metToday + '/' + meta.targets.length;
    const ch = document.getElementById('lifetree-chamber');
    if(ch) ch.classList.toggle('milestone', day === 30 || day === 60 || day === 90);
    // state-reactive ambient: more complete today → warmer/brighter whole-system glow
    if(typeof setAmbientLevel === 'function') setAmbientLevel(metToday / meta.targets.length);
  }

  // Heatmap — 13 weeks x 5 targets
  document.getElementById('the90-heatmap').innerHTML = renderThe90Heatmap();

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
}

function computeThe90Streak(){
  // Longest current run of days where ≥3 of 5 targets were met
  let streak = 0;
  for(let d = the90Day(); d >= 1; d--){
    const date = the90DateForDay(d);
    if(date > TODAY) continue;
    const day = S.the90.daily[date];
    if(!day) break;
    const phase = the90Phase(d);
    const met = S.the90.meta.targets.filter(t => the90ScoreMet(day.scores?.[t.id], phase)).length;
    if(met >= 3) streak++;
    else break;
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

  const rows = meta.targets.map(t => {
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
      cells.push(`<div class="${cls}" title="${t.id} · ${date}"></div>`);
    }
    return `<div class="the90-h-row" data-id="${t.id}">${cells.join('')}</div>`;
  }).join('');

  return `<div class="the90-h-grid">${rows}</div>`;
}
