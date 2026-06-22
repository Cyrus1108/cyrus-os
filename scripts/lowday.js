/* Low Day (低谷日) — a manual circuit-breaker STATE on the protagonist.
   When the normal system fails (don't-want-to-move days), the user MANUALLY enters
   this state: the day's pass-bar drops to one minimal action, strategic/judgment
   surfaces lock, and getting through it becomes accumulable identity evidence
   (the Adversity Ledger · 渡). Entry and exit are ALWAYS user-initiated — never auto.

   Persistence rides the90_daily.scores under namespaced keys (zero migration, zero
   sync change — the existing per-day upsert pushes the whole scores object):
     _amp  : 1–5 today's amplitude (filled EVERY day, independent of low-day)
     _low  : entered low-day mode today
     _lowx : crossed today (manual exit / minimal action confirmed) → ledger +1
     _trig : trigger-guess text (nullable; "不知道" still stored)
   State is date-derived, so it auto-reverts to normal at the next day's row. */

/* ── verbatim protocol (spec §7 — do NOT rewrite, beautify, or expand) ── */
const LOWDAY_PROTOCOL_TITLE = '【低谷协议】当我状态崩了、不想动、想放弃今天时：';
const LOWDAY_PROTOCOL_ITEMS = [
  '停。我现在没资格做任何“人生方向”的判断。“我是不是走错了”“这没意义”“今天废了”——这些是情绪，不是事实。现在不做任何战略决定。',
  '只问一件事：接下来这5分钟，能做的最小一件事是什么？小到无法拒绝。不是完成计划，是做一个动作。',
  '做完。不评估，不打分，不问“够不够”。',
  '做完后给逆境账户 +1。——我刚刚证明了：我是一个低谷里照样会动的人。',
];
const LOWDAY_PROTOCOL_FOOT = '记住：行动先于状态。不是等状态好了再做，是做了状态才会松动。波动会来，这很正常。我不需要它消失，我只需要做完这一个动作。';
const LOWDAY_AMP_WORDS = ['极平稳', '平稳', '起伏', '波动', '剧烈'];

/* ── per-day state helpers (read/write the90_daily.scores namespaced keys) ── */
function _lowDayRow(date){ return (S.the90 && S.the90.daily && S.the90.daily[date || TODAY]) || null; }
function _lowDayScores(date){ const r = _lowDayRow(date); return (r && r.scores) || null; }
function _lowEnsureToday(){
  if(typeof ensureThe90Defaults === 'function') ensureThe90Defaults();
  if(!S.the90.daily[TODAY]) S.the90.daily[TODAY] = { scores:{}, note:'' };
  if(!S.the90.daily[TODAY].scores) S.the90.daily[TODAY].scores = {};
  return S.the90.daily[TODAY];
}
function lowDayOn(date){ const s = _lowDayScores(date); return !!(s && s._low); }
function lowDayCrossed(date){ const s = _lowDayScores(date); return !!(s && s._lowx); }
// "currently in low-day mode" — entered today and not yet crossed
function isLowDayActive(){ return lowDayOn(TODAY) && !lowDayCrossed(TODAY); }

/* ── amplitude (1–5, every day) ── */
function lowdayAmp(date){ const s = _lowDayScores(date || TODAY); const v = s ? s._amp : null; return (typeof v === 'number') ? v : null; }
function lowdaySetAmp(n){
  const day = _lowEnsureToday();
  day.scores._amp = (day.scores._amp === n) ? null : n;   // tap the selected one again to clear
  if(day.scores._amp == null) delete day.scores._amp;
  if(window.Sfx){ (typeof day.scores._amp === 'number') ? Sfx.tick() : Sfx.untick(); }
  if(typeof saveThe90Daily === 'function') saveThe90Daily();
  if(typeof rThe90 === 'function') rThe90();
  if(typeof sysUI !== 'undefined' && sysUI.open && typeof rSystem === 'function') rSystem();
}
function lowdayAmpSeries(days){
  days = days || 30;
  const out = [], base = new Date(TODAY + 'T00:00:00+08:00');
  for(let i = days - 1; i >= 0; i--){
    const d = new Date(base); d.setDate(base.getDate() - i);
    const ds = d.toLocaleDateString('sv-SE');
    out.push({ date: ds, amp: lowdayAmp(ds) });
  }
  return out;
}

/* ── trigger guess ── */
let _lowTrigT;
function lowdaySetTrigger(v){
  const day = _lowEnsureToday();
  day.scores._trig = v;
  clearTimeout(_lowTrigT);
  _lowTrigT = setTimeout(()=>{ if(typeof saveThe90Daily === 'function') saveThe90Daily(); }, 500);
}

/* ── adversity ledger (渡) — computed from history; only crossed low-days count ── */
function adversityLedger(){
  let n = 0; const daily = (S.the90 && S.the90.daily) || {};
  for(const date in daily){
    if(date > TODAY) continue;
    const s = daily[date].scores;
    if(s && s._lowx) n++;
  }
  return n;
}

/* ── enter flow: entry button → verbatim protocol modal → confirm → state on ── */
function lowdayRequestEnter(){ if(!isLowDayActive()) lowdayShowProtocol(); }
function lowdayShowProtocol(){
  let m = document.getElementById('lowday-modal');
  if(!m){ m = document.createElement('div'); m.id = 'lowday-modal'; m.className = 'lowday-modal'; m.setAttribute('data-lenis-prevent',''); document.body.appendChild(m); }
  const items = LOWDAY_PROTOCOL_ITEMS.map((t,i)=>
    `<div class="lowday-p-item"><span class="lowday-p-n">${i+1}</span><span class="lowday-p-t">${escH(t)}</span></div>`
  ).join('');
  m.innerHTML = `<div class="lowday-modal-back" onclick="lowdayCloseProtocol()"></div>
    <div class="lowday-card">
      <div class="sys-corner tl"></div><div class="sys-corner tr"></div><div class="sys-corner bl"></div><div class="sys-corner br"></div>
      <div class="lowday-kicker">[ 低谷协议 · LOW-DAY PROTOCOL ]</div>
      <div class="lowday-p-title">${escH(LOWDAY_PROTOCOL_TITLE)}</div>
      <div class="lowday-p-items">${items}</div>
      <div class="lowday-p-foot">${escH(LOWDAY_PROTOCOL_FOOT)}</div>
      <button class="lowday-enter-btn" onclick="lowdayConfirmEnter()">进入低谷日 →</button>
    </div>`;
  requestAnimationFrame(()=> m.classList.add('open'));
  if(typeof pageDepth === 'function') pageDepth(true);
  // the protocol deserves near-silence — just a neutral click, no HUD fanfare
  if(window.Sfx && typeof Sfx.tab === 'function') Sfx.tab();
}
function lowdayCloseProtocol(){ const m = document.getElementById('lowday-modal'); if(m) m.classList.remove('open'); if(typeof pageDepth === 'function') pageDepth(false); }
/* Escape closes the low-day protocol (consistent with other overlays) */
document.addEventListener('keydown', e => {
  if(e.key==='Escape' && document.getElementById('lowday-modal')?.classList.contains('open')){ e.preventDefault(); lowdayCloseProtocol(); }
});
function lowdayConfirmEnter(){
  if(isLowDayActive()){ lowdayCloseProtocol(); return; }   // double-click guard
  lowdayCloseProtocol();
  const day = _lowEnsureToday();
  day.scores._low = true;
  delete day.scores._lowx;
  if(typeof saveThe90Daily === 'function') saveThe90Daily();
  document.body.classList.add('low-day');
  rLowDay();
  if(typeof rThe90 === 'function') rThe90();
  if(typeof sysUI !== 'undefined' && sysUI.open && typeof rSystem === 'function') rSystem();
  if(window.Sfx && typeof Sfx.lowday === 'function') Sfx.lowday();   // somber, not punishing
}

/* ── exit: the manual "渡" ritual (always available) → ledger +1, back to normal ── */
function lowdayCross(){
  if(!isLowDayActive()) return;
  const day = _lowEnsureToday();
  day.scores._lowx = true;
  if(typeof saveThe90Daily === 'function') saveThe90Daily();
  document.body.classList.remove('low-day');
  rLowDay();
  if(typeof rThe90 === 'function') rThe90();
  if(typeof rpgAfterChange === 'function') rpgAfterChange();   // settle 渡 achievements + EXP
  if(typeof sysUI !== 'undefined' && sysUI.open && typeof rSystem === 'function') rSystem();
  if(typeof sysToast === 'function') sysToast('渡 · 你穿过去了 —— 逆境账户 +' + 1, {silent:true});
  if(window.Sfx && typeof Sfx.cross === 'function') Sfx.cross();   // 渡 — relief, not fanfare
}

/* ── mechanism-enforced lock of a strategic surface (spec §3.3) ── */
function lowdayBlocked(what){
  if(typeof sysToast === 'function') sysToast('低谷日 · 不做战略决定 —— ' + what + '已封锁', {silent:true});
  if(window.Sfx && typeof Sfx.blocked === 'function') Sfx.blocked();   // dull denial thud
}

/* ── render: top banner (active only) + the amplitude row (always) ── */
function rLowDay(){
  const host = document.getElementById('lowday-banner');
  const active = isLowDayActive();
  document.body.classList.toggle('low-day', active);
  if(host){
    if(!active){ host.classList.remove('show'); host.innerHTML = ''; }
    else {
      const trig = (_lowDayScores(TODAY) || {})._trig || '';
      host.classList.add('show');
      host.innerHTML = `
        <div class="lowday-banner-row">
          <span class="lowday-banner-tag">低谷日</span>
          <span class="lowday-banner-msg">只做最小动作 · 不做战略判断</span>
          <button class="lowday-cross-btn" onclick="lowdayCross()">渡 · 我穿过去了</button>
        </div>
        <div class="lowday-trig-row">
          <label for="lowday-trig">这几天有没有什么可能埋了单？</label>
          <input id="lowday-trig" type="text" autocomplete="off"
            placeholder="睡眠 / 过度输出 / 某习惯 / 社交消耗 / 其他 / 不知道"
            value="${escH(trig)}" oninput="lowdaySetTrigger(this.value)">
        </div>`;
    }
  }
  // keep the90 panel's amplitude row in sync (it also carries the discreet entry link)
  const ampEl = document.getElementById('the90-amp');
  if(ampEl) setStableHTML(ampEl, lowdayAmpRowHtml());
}

/* amplitude row for the The 90 panel (dots + discreet entry link when not active) */
function lowdayAmpRowHtml(){
  const cur = lowdayAmp(TODAY);
  const dots = [1,2,3,4,5].map(n=>
    `<button class="lowday-amp-dot${cur===n?' sel':''}${cur && n<=cur?' fill':''}" onclick="lowdaySetAmp(${n})" title="振幅 ${n} · ${LOWDAY_AMP_WORDS[n-1]}">${n}</button>`
  ).join('');
  const hint = cur ? ('· ' + LOWDAY_AMP_WORDS[cur-1]) : '1 极平稳 … 5 剧烈';
  const entry = isLowDayActive()
    ? '<span class="lowday-amp-state">低谷日进行中</span>'
    : '<button class="lowday-enter-link" onclick="lowdayRequestEnter()">进入低谷日</button>';
  return `<span class="lowday-amp-label">今日振幅</span>
    <span class="lowday-amp-dots">${dots}</span>
    <span class="lowday-amp-hint">${hint}</span>
    ${entry}`;
}

/* amplitude sparkline for the 状态 tab (last `days` days; 1–5 band). Connects filled
   points only (un-filled days are gaps). Returns '' when there's nothing to show. */
function lowdayAmpSparkSVG(days){
  const series = lowdayAmpSeries(days || 30);
  const filled = series.map((d,i)=>({ i, amp:d.amp })).filter(p=> typeof p.amp === 'number');
  if(filled.length < 1) return '';
  const N = series.length, W = 100, H = 26;
  const X = i => (N>1 ? (i/(N-1))*W : W/2);
  const Y = v => 3 + (1 - (Math.max(1,Math.min(5,v)) - 1)/4) * (H - 6);   // 1→bottom, 5→top
  const pts = filled.map(p=>[X(p.i), Y(p.amp)]);
  const line = (filled.length >= 2 && typeof rpgSmoothPath === 'function')
    ? rpgSmoothPath(pts)
    : 'M ' + pts.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' L ');
  const dots = pts.map(p=>`<circle class="amp-dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="1.3"/>`).join('');
  const last = filled[filled.length-1];
  return `<svg class="sys-amp" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="振幅曲线">
    <line class="amp-base" x1="0" y1="${(H-3).toFixed(1)}" x2="${W}" y2="${(H-3).toFixed(1)}"/>
    <path class="amp-line" d="${line}"/>${dots}
    <circle class="amp-end" cx="${X(last.i).toFixed(1)}" cy="${Y(last.amp).toFixed(1)}" r="1.8"/>
  </svg>`;
}

/* ── hard-lock strategic entries on a low day (mechanism, not willpower) ── */
(function lowdayWrapStrategicEntries(){
  if(typeof window === 'undefined') return;
  if(typeof openFinance === 'function' && !openFinance._lowWrapped){
    const orig = openFinance;
    window.openFinance = function(){ if(isLowDayActive()){ lowdayBlocked('财务'); return; } return orig.apply(this, arguments); };
    window.openFinance._lowWrapped = true;
  }
})();

/* ── init: apply state on load + after every render cycle (renderAll calls rLowDay) ── */
function lowdayInit(){ rLowDay(); }
