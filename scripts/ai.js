/* ════════════ AI Automation · 产出日志 HUD ════════════
   RPG v2 Phase 1 — the signal source. Full-screen HUD (clones the Finance/Calendar
   shell; glass.js wraps #ai-view into .sys-window.ai-hud). You log what you BUILT /
   LEARNED / SHIPPED; the module derives streak / active-days / total. Phase 1 is
   standalone (no EXP/attribute/achievement wiring — that's Phase 2/3). */
const aiUI = { open:false, tab:'log' };
let _aiCloseT = null;
const AI_KINDS = [ {k:'built',label:'构建'}, {k:'learned',label:'学会'}, {k:'shipped',label:'交付'} ];
const AI_KIND_LABEL = { built:'构建', learned:'学会', shipped:'交付' };
let aiEditId = null;

/* ── url scheme allow-list (http/https only; rejects javascript:/data:/vbscript:) ── */
function aiSafeUrl(u){ try{ const p=new URL(String(u), location.href); return (p.protocol==='http:'||p.protocol==='https:') ? p.href : null; }catch(e){ return null; } }

/* ── open / close / routing (clone of calendar.js) ── */
function aiOnHash(){
  if(location.hash==='#ai'){ if(!aiUI.open) openAi(true); }
  else if(aiUI.open){ closeAi(true); }
}
function openAi(fromHash){
  const v = document.getElementById('ai-view'); if(!v) return;
  clearTimeout(_aiCloseT); v.classList.remove('ai-closing');
  aiUI.open = true;
  v.classList.add('open');
  v.setAttribute('aria-hidden','false');
  document.body.classList.add('ai-locked');
  if(window.Sfx) Sfx.open();
  if(!fromHash && location.hash!=='#ai'){ location.hash='ai'; }
  rAi();
}
function closeAi(fromHash){
  const v = document.getElementById('ai-view'); if(!v) return;
  if(!aiUI.open) return;
  aiUI.open = false;
  v.setAttribute('aria-hidden','true');
  if(window.Sfx) Sfx.close();
  aiCloseModal();
  aiDestroyCharts();
  if(!fromHash && location.hash==='#ai'){ history.replaceState(null,'',location.pathname+location.search); }
  const hud = v.querySelector('.sys-window');
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(reduce || !hud){
    v.classList.remove('open'); v.classList.remove('ai-closing'); document.body.classList.remove('ai-locked');
    return;
  }
  v.classList.add('ai-closing');
  clearTimeout(_aiCloseT);
  _aiCloseT = setTimeout(()=>{ v.classList.remove('open'); document.body.classList.remove('ai-locked'); }, 480);
}

function initAi(){
  window.addEventListener('hashchange', aiOnHash);
  document.addEventListener('keydown', (e)=>{
    if(!aiUI.open) return;
    const tag=(e.target.tagName||'').toUpperCase(), typing=tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT';
    if(e.key==='Escape'){ if(aiModalOpen()) aiCloseModal(); else closeAi(); return; }
    if(typing || aiModalOpen()) return;
    if(e.key==='ArrowLeft') aiSwitchTab('log');
    else if(e.key==='ArrowRight') aiSwitchTab('trends');
  });
  // follow-finger swipe between tabs (raw switch — no withViewTransition doubling)
  if(typeof makeHudSwipe==='function'){
    makeHudSwipe('ai-view', {
      bodyId:'ai-body',
      tabs:()=>['log','trends'],
      cur:()=>aiUI.tab,
      guard:()=>aiModalOpen(),
      go:(t)=>{ if(aiUI.tab==='trends' && t!=='trends') aiDestroyCharts(); aiUI.tab=t; rAi(); },
      peek:(el,t)=>{ if(t==='trends') rAiTrendsSkeleton(el); else rAiLog(el); },
    });
  }
  aiOnHash();
}
function aiSwitchTab(t){
  if(aiUI.tab===t) return;
  if(aiUI.tab==='trends' && t!=='trends') aiDestroyCharts();
  if(window.Sfx) Sfx.tab();
  const go=()=>{ aiUI.tab=t; rAi(); };
  if(typeof withViewTransition==='function') withViewTransition(go); else go();
}

/* ── derived signals (exposed for Phase 2/3 to read) ── */
function aiDatesSet(){ const s=new Set(); S.ai.forEach(o=>{ if(o.date) s.add(o.date); }); return s; }
function aiTotalOutputs(){ return S.ai.length; }
function aiActiveDays30(){
  const set=aiDatesSet(); let n=0;
  const base=new Date(TODAY+'T00:00:00+08:00');
  for(let i=0;i<30;i++){ const d=new Date(base); d.setDate(base.getDate()-i); if(set.has(d.toLocaleDateString('sv-SE'))) n++; }
  return n;
}
function aiStreak(){
  const set=aiDatesSet(); let streak=0;
  const base=new Date(TODAY+'T00:00:00+08:00');
  for(let i=0;i<400;i++){ const d=new Date(base); d.setDate(base.getDate()-i); if(set.has(d.toLocaleDateString('sv-SE'))) streak++; else break; }
  return streak;
}

/* ── render ── */
function rAi(){
  if(!aiUI.open) return;
  const body=document.getElementById('ai-body'); if(!body) return;
  // AUT.11 micro-tag (item 1): real streak stat, not decorative — cheap textContent
  // set, safe to re-run on every render (no animation/rebuild involved).
  const mt=document.getElementById('ai-micro');
  if(mt) mt.innerHTML = '<b>AUT.11</b> // 连续 '+aiStreak()+' 天';
  document.querySelectorAll('#ai-view .ai-tab').forEach(b=> b.classList.toggle('active', b.dataset.tab===aiUI.tab));
  if(aiUI.tab==='trends') rAiTrends(body); else rAiLog(body);
}

function aiStatBar(){
  return `<div class="ai-stat-grid">
    <div class="ai-stat"><div class="ai-stat-n">${aiTotalOutputs()}</div><div class="ai-stat-l">总产出</div></div>
    <div class="ai-stat"><div class="ai-stat-n">${aiActiveDays30()}</div><div class="ai-stat-l">活跃天 / 30</div></div>
    <div class="ai-stat"><div class="ai-stat-n">${aiStreak()}</div><div class="ai-stat-l">连续天数</div></div>
  </div>`;
}

function rAiLog(el){
  let html = aiStatBar();
  html += `<button class="ai-add-btn" onclick="aiNewOutput()">+ 记产出</button>`;
  const list = S.ai.slice().sort((a,b)=>{
    if(a.date!==b.date) return (b.date||'').localeCompare(a.date||'');   // newest date first
    return (b.position||0)-(a.position||0);
  });
  if(!list.length){
    html += `<div class="ai-empty">— 还没有产出记录 —<br><span>做出/学会/交付了什么，记一条</span></div>`;
  } else {
    let curDate = null;
    list.forEach(o=>{
      if(o.date!==curDate){
        curDate=o.date;
        html += `<div class="ai-date-head">${aiDateLabel(o.date)}</div>`;
      }
      html += `<div class="ai-row">
        <span class="ai-kind ai-kind-${o.kind||'built'}">${AI_KIND_LABEL[o.kind]||'构建'}</span>
        <div class="ai-row-body">
          <div class="ai-row-title">${escH(o.title)}</div>
          ${o.notes?`<div class="ai-row-notes">${escH(o.notes)}</div>`:''}
          ${(()=>{ const safe=o.link&&aiSafeUrl(o.link); return safe?`<a class="ai-row-link" href="${escH(safe)}" target="_blank" rel="noopener noreferrer">↗ 链接</a>`:''; })()}
        </div>
        <div class="ai-row-actions"><button class="row-btn" onclick="aiEditOutput('${o.id}')">编辑</button><button class="row-btn" onclick="aiDelOutput('${o.id}')">×</button></div>
      </div>`;
    });
  }
  el.innerHTML = html;
  if(typeof attachRipples==='function') attachRipples(el);
}
function aiDateLabel(ds){
  if(!ds) return '';
  const d=new Date(ds+'T00:00:00');
  const wd=['日','一','二','三','四','五','六'][d.getDay()];
  const tag = ds===TODAY ? ' · 今天' : '';
  return `${d.getMonth()+1} 月 ${d.getDate()} 日 · 周${wd}${tag}`;
}

/* ── trends (weekly outputs bar, last 12 weeks) ── */
let _aiCharts = [];
function aiDestroyCharts(){ _aiCharts.forEach(c=>{ try{ c.destroy(); }catch(e){} }); _aiCharts=[]; }
// pure markup-only skeleton (no side-effects) — used by the swipe peek so peeking never destroys/loads charts
function rAiTrendsSkeleton(el){
  el.innerHTML = aiStatBar()
    + `<div class="ai-chart-card"><div class="ai-chart-title">近 12 周产出</div><div class="ai-chart-wrap"><canvas id="ai-week-chart"></canvas></div></div>`
    + `<div class="ai-kind-legend">${AI_KINDS.map(k=>`<span class="ai-kind ai-kind-${k.k}">${k.label}</span>`).join('')} · 三类产出</div>`;
}
function rAiTrends(el){
  rAiTrendsSkeleton(el);
  aiDestroyCharts();
  if(typeof ensureChartJs==='function'){
    ensureChartJs().then(()=>{ if(aiUI.open && aiUI.tab==='trends') aiDrawWeekChart(); }).catch(()=>{});
  }
}
function aiChartColors(){ return (typeof finChartColors==='function') ? finChartColors()
  : { ink:'#222', mute:'#666', ghost:'#999', hair:'#ddd', brass:'#A88455' }; }
function aiDrawWeekChart(){
  const cv=document.getElementById('ai-week-chart'); if(!cv||!window.Chart) return;
  const set = S.ai.map(o=>o.date).filter(Boolean);
  const labels=[], vals=[];
  const base=new Date(TODAY+'T00:00:00+08:00');
  // align to 7-day buckets going back from today; bucket 0 = the most recent 7 days
  for(let w=11; w>=0; w--){
    const end=new Date(base); end.setDate(base.getDate()-w*7);
    const start=new Date(end); start.setDate(end.getDate()-6);
    const startS=start.toLocaleDateString('sv-SE'), endS=end.toLocaleDateString('sv-SE');
    let n=0; set.forEach(d=>{ if(d>=startS && d<=endS) n++; });
    labels.push(`${start.getMonth()+1}/${start.getDate()}`); vals.push(n);
  }
  const c=aiChartColors();
  _aiCharts.push(new Chart(cv,{ type:'bar',
    data:{ labels, datasets:[{ data:vals, backgroundColor:c.brass, borderRadius:3, maxBarThickness:26 }] },
    options:{ responsive:true, maintainAspectRatio:false, animation:{duration:400},
      plugins:{ legend:{display:false} },
      scales:{ x:{ ticks:{ color:c.ghost, font:{size:10} }, grid:{ display:false } },
               y:{ beginAtZero:true, ticks:{ color:c.ghost, font:{size:10}, precision:0 }, grid:{ color:c.hair } } } } }));
}

/* ── CRUD (modal form) ── */
function aiModalEl(){ return document.getElementById('ai-modal'); }
function aiModalOpen(){ const m=aiModalEl(); return !!(m && m.classList.contains('open')); }
function aiCloseModal(){ const m=aiModalEl(); if(m){ m.classList.remove('open'); m.innerHTML=''; } aiEditId=null; }
function aiNewOutput(){ aiEditId='new'; aiOpenModal(); }
function aiEditOutput(id){ aiEditId=id; aiOpenModal(); }
function aiOpenModal(){
  const m=aiModalEl(); if(!m) return;
  const o = aiEditId==='new' ? { id:null, date:TODAY, title:'', kind:'built', notes:'', link:'' } : (S.ai.find(x=>x.id===aiEditId)||{ date:TODAY, kind:'built' });
  const dlabel=(typeof finDateLabel==='function')?finDateLabel(o.date):o.date;
  m.innerHTML = `<div class="ai-modal-card">
      <div class="ai-modal-title">${aiEditId==='new'?'记一条产出':'编辑产出'}</div>
      <input id="ai-f-title" placeholder="做出 / 学会 / 交付了什么…" value="${escH(o.title||'')}" style="width:100%;">
      <div class="fin-seg" data-seg="ai-f-kind" id="ai-f-kindseg">
        ${AI_KINDS.map(k=>`<button type="button" class="fin-seg-btn ${ (o.kind||'built')===k.k?'active':'' }" data-k="${k.k}" onclick="aiPickKind('${k.k}')">${k.label}</button>`).join('')}
      </div>
      <input type="hidden" id="ai-f-kind" value="${escH(o.kind||'built')}">
      <div class="field-row">
        <span class="field-label">日期</span>
        <button type="button" class="fin-datebtn" onclick="finOpenCal('ai-f-date')" style="flex:1;">📅 <span id="ai-f-date-label">${escH(dlabel||'选择日期')}</span></button>
        <input type="hidden" id="ai-f-date" value="${escH(o.date||TODAY)}">
      </div>
      <textarea id="ai-f-notes" placeholder="备注（可选）" style="width:100%;height:54px;resize:none;">${escH(o.notes||'')}</textarea>
      <input id="ai-f-link" placeholder="链接（可选）" value="${escH(o.link||'')}" style="width:100%;">
      <div style="display:flex;gap:6px;">
        <button class="primary fx-btn" onclick="aiSaveOutput()" style="flex:1;">保存</button>
        <button class="ghost fx-btn" onclick="aiCloseModal()" style="flex:1;">取消</button>
      </div>
    </div>`;
  m.classList.add('open');
  requestAnimationFrame(()=>{ const t=document.getElementById('ai-f-title'); if(t) t.focus(); });
}
function aiPickKind(k){
  const h=document.getElementById('ai-f-kind'); if(h) h.value=k;
  document.querySelectorAll('#ai-f-kindseg .fin-seg-btn').forEach(b=>b.classList.toggle('active', b.dataset.k===k));
}
function aiSaveOutput(){
  const tEl=document.getElementById('ai-f-title'); if(!tEl) return;
  const title=tEl.value.trim(); if(!title) return;
  const kind=document.getElementById('ai-f-kind').value||'built';
  let date=document.getElementById('ai-f-date').value||TODAY;
  if(date>TODAY) date=TODAY;   // clamp future dates so streak/activeDays signals stay consistent (YYYY-MM-DD string compare)
  const notes=document.getElementById('ai-f-notes').value.trim();
  let link=document.getElementById('ai-f-link').value.trim();
  if(link && !aiSafeUrl(link)) link='';   // reject hostile schemes (javascript:/data:/vbscript:) at save so stored data is clean
  if(aiEditId==='new'){
    const maxPos=S.ai.reduce((a,o)=>Math.max(a,o.position||0),0);
    S.ai.push({ id:crypto.randomUUID(), date, title, kind, notes, link, position:maxPos+1 });
  } else {
    const o=S.ai.find(x=>x.id===aiEditId);
    if(o){ o.date=date; o.title=title; o.kind=kind; o.notes=notes; o.link=link; }
    else { const maxPos=S.ai.reduce((a,o)=>Math.max(a,o.position||0),0); S.ai.push({ id:aiEditId, date, title, kind, notes, link, position:maxPos+1 }); }   // edit target vanished (realtime echo dropped it) → re-create with the existing id instead of silently dropping the edit
  }
  aiCloseModal();
  saveAiOutputs(); rAi();
  if(typeof rAiDot==='function') rAiDot();
  // RPG v2: 今天有产出 → 自动勾上赛季柱「AI 生意」(ai) → 喂 智力/创造 + EXP
  // (S2 换季前这里是旧柱 III「AI Automation」)
  if(aiDatesSet().has(TODAY) && typeof the90AutoMet==='function') the90AutoMet('ai');
  if(window.Sfx) Sfx.save();
}
function aiDelOutput(id){
  S.ai = S.ai.filter(o=>o.id!==id);
  saveAiOutputs(); rAi();
  if(typeof rAiDot==='function') rAiDot();
}

/* ── header button dot: lit when today has an output ── */
function rAiDot(){
  const btn=document.getElementById('ai-btn'); if(!btn) return;
  btn.classList.toggle('has-today', aiDatesSet().has(TODAY));
}
