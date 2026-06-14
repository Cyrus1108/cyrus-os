/* ════════════════════════════════════════════════════════════════
   Finance analytics (Phase 2-B) — Chart.js charts, lazy-loaded.
   Module 3 of the spec: 区块A 支出/收入分析 (donut + top bar),
   区块B 收支趋势, 区块C 净资产趋势. All colours read live from the
   theme CSS variables so the charts follow cappa / sterile.
   ════════════════════════════════════════════════════════════════ */

let _chartjsPromise = null;
function ensureChartJs(){
  if(window.Chart) return Promise.resolve();
  if(_chartjsPromise) return _chartjsPromise;
  _chartjsPromise = new Promise((res, rej)=>{
    const s = document.createElement('script');
    s.src = './vendor/chart.umd.min.js';   // vendored for offline (precached in sw.js)
    s.onload = ()=>res();
    s.onerror = ()=>rej(new Error('Chart.js load failed'));
    document.head.appendChild(s);
  });
  return _chartjsPromise;
}

const FIN_PALETTE = ['#E5704B','#4B89E5','#E54B9A','#8A6E4B','#9A4BE5','#3FB7A0','#C9A227','#6BAE3F','#3FAE6B','#888888','#D98A3F','#4BC0C0','#B57BDC','#7BAE4B'];
// monochrome ramp from a base hex — used in the sterile/终末 theme so the donut +
// legend read as one accent instead of a rainbow. n shades vary by lightness.
function finMonoRamp(hex, n){
  let r=168,g=132,b=85;                                  // brass fallback
  const s=(hex||'').trim();
  let m=/^#?([0-9a-f]{6})$/i.exec(s);
  if(m){ const v=parseInt(m[1],16); r=(v>>16)&255; g=(v>>8)&255; b=v&255; }
  else if((m=/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i.exec(s))){ r=+m[1]; g=+m[2]; b=+m[3]; }
  const out=[];
  for(let i=0;i<Math.max(1,n);i++){
    const f = 0.18 - (n>1 ? (i/(n-1)) : 0)*0.63;         // +lighter … −darker (tuned for a light bg)
    const t = f>=0 ? 255 : 0, a = Math.abs(f), mix = c => Math.round(c + (t-c)*a);
    out.push(`rgb(${mix(r)},${mix(g)},${mix(b)})`);
  }
  return out;
}
function finCss(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
function finChartColors(){
  return { ink:finCss('--ink'), mute:finCss('--mute'), ghost:finCss('--ghost'),
           hair:finCss('--hair'), brass:finCss('--brass'),
           pos:finCss('--fin-pos')||'#3FAE6B', neg:finCss('--fin-neg')||'#E5704B' };
}

const finAna = { range:'month', dim:'category', kind:'expense', from:null, to:null, charts:[] };

function finDateStr(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function finAnaWindow(){
  const now = new Date(TODAY+'T00:00:00');
  let start, end;
  if(finAna.range==='week'){
    const dow = (now.getDay()+6)%7;                 // Monday = 0
    start = new Date(now); start.setDate(now.getDate()-dow);
    end = new Date(start); end.setDate(start.getDate()+6);
  } else if(finAna.range==='year'){
    start = new Date(now.getFullYear(),0,1); end = new Date(now.getFullYear(),11,31);
  } else if(finAna.range==='custom'){
    start = finAna.from ? new Date(finAna.from+'T00:00:00') : new Date(now.getFullYear(),now.getMonth(),1);
    end   = finAna.to   ? new Date(finAna.to+'T00:00:00')   : now;
  } else { // month
    start = new Date(now.getFullYear(),now.getMonth(),1); end = new Date(now.getFullYear(),now.getMonth()+1,0);
  }
  return { start:finDateStr(start), end:finDateStr(end), startD:start, endD:end };
}
function finAnaTx(){
  const w = finAnaWindow();
  return S.fin.transactions.filter(t=>t.date>=w.start && t.date<=w.end);
}

/* point-in-time balance / net worth (for the net-worth trend) */
function finBalanceAsOf(acctId, date){
  const a = finAcct(acctId); if(!a) return 0;
  let bal = a.initialBalance||0;
  for(const t of S.fin.transactions){
    if(t.date>date) continue;
    if(t.type==='expense' && t.accountId===acctId) bal -= t.amount;
    else if(t.type==='income' && t.accountId===acctId) bal += t.amount;
    else if(t.type==='transfer'){
      if(t.accountId===acctId) bal -= t.amount;
      if(t.toAccountId===acctId) bal += (t.toAmount!=null ? t.toAmount : t.amount);
    }
  }
  return bal;
}
function finNetWorthAsOf(date){
  // Prefer the nightly server snapshot when present (fast, and reflects the fx
  // rates as of that day); fall back to client-side computation for days with none.
  const snap = S.fin.snapshots && S.fin.snapshots[date];
  if(snap!=null) return snap;
  let nw = 0;
  for(const a of S.fin.accounts){
    if(a.status!==FIN_ACCT_STATUS.ACTIVE) continue;
    nw += finToBase(finBalanceAsOf(a.id, date), a.currency);
  }
  return nw;
}

/* ── shell + draw ── */
function finRenderAnalytics(){
  clearTimeout(finAna._drawT);
  finAna._drawT = setTimeout(()=>{ if(typeof finAnaDraw==='function') finAnaDraw(); }, 0);
  const R = (k,label)=>`<button class="fin-vt ${finAna.range===k?'active':''}" onclick="finAnaSetRange('${k}')">${label}</button>`;
  const seg = (cur,opts,fn)=>opts.map(o=>`<button class="fin-anatoggle ${cur===o.k?'active':''}" onclick="${fn}('${o.k}')">${o.label}</button>`).join('');
  const w = finAnaWindow();
  const custom = finAna.range==='custom' ? `<div class="fin-ana-custom">
      <button class="fin-datebtn" onclick="finAnaPickDate('from')">📅 ${finAna.from?finDateLabel(finAna.from):'起始'}</button>
      <span class="fin-ana-dash">→</span>
      <button class="fin-datebtn" onclick="finAnaPickDate('to')">📅 ${finAna.to?finDateLabel(finAna.to):'结束'}</button>
    </div>` : '';
  return `<div class="fin-ana">
    <div class="fin-led-viewtoggle fin-ana-range">${R('week','本周')}${R('month','本月')}${R('year','本年')}${R('custom','自定义')}</div>
    ${custom}
    <div class="fin-ana-grid">
      ${typeof finBudgetsBlockHtml==='function' ? finBudgetsBlockHtml() : ''}
      <div class="fin-ana-block">
        <div class="fin-ana-head"><span>${finAna.kind==='expense'?'支出':'收入'}构成</span>
          <span class="fin-anatoggles">${seg(finAna.kind,[{k:'expense',label:'支出'},{k:'income',label:'收入'}],'finAnaSetKind')}
            <span class="fin-ana-sep"></span>${seg(finAna.dim,[{k:'category',label:'分类'},{k:'account',label:'账户'}],'finAnaSetDim')}</span>
        </div>
        <div class="fin-ana-donutwrap"><canvas id="fin-ana-donut"></canvas></div>
        <div id="fin-ana-toplist" class="fin-ana-toplist"></div>
      </div>
      <div class="fin-ana-block">
        <div class="fin-ana-head"><span>收支趋势</span></div>
        <div class="fin-ana-canvaswrap"><canvas id="fin-ana-trend"></canvas></div>
      </div>
      <div class="fin-ana-block">
        <div class="fin-ana-head"><span>净资产趋势</span><span class="fin-ana-sub">${S.fin.baseCurrency||'TWD'}</span></div>
        <div class="fin-ana-canvaswrap"><canvas id="fin-ana-networth"></canvas></div>
      </div>
    </div>
  </div>`;
}

function finAnaSetRange(r){ finAna.range=r; withViewTransition(rFinance); }
function finAnaSetKind(k){ finAna.kind=k; rFinance(); }
function finAnaSetDim(d){ finAna.dim=d; rFinance(); }
function finAnaPickDate(which){
  // reuse the themed calendar; stash into a hidden input id
  let h = document.getElementById('fin-ana-'+which);
  if(!h){ h=document.createElement('input'); h.type='hidden'; h.id='fin-ana-'+which; document.getElementById('finance-view').appendChild(h); }
  h.value = (which==='from'?finAna.from:finAna.to) || TODAY;
  finOpenCal('fin-ana-'+which, (ds)=>{ if(which==='from') finAna.from=ds; else finAna.to=ds; rFinance(); });
}

function finAnaDestroy(){ finAna.charts.forEach(c=>{ try{ c.destroy(); }catch(e){} }); finAna.charts=[]; }

async function finAnaDraw(){
  if(!finUI.open || finUI.tab!=='analytics') return;
  try{ await ensureChartJs(); }
  catch(e){
    const tl=document.getElementById('fin-ana-toplist');
    if(tl) tl.innerHTML='<div class="fin-empty sm">图表库加载失败（需联网）</div>';
    return;
  }
  // honour reduced-motion: skip Chart.js entrance animations (mirrors rpg.js)
  if(window.Chart && window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches){ Chart.defaults.animation = false; }
  if(!finUI.open || finUI.tab!=='analytics' || !document.getElementById('fin-ana-donut')) return;
  finAnaDestroy();
  Chart.defaults.font.family = finCss('--mono') || 'monospace';
  finAnaDrawDonut();
  finAnaDrawTrend();
  finAnaDrawNetWorth();
}

function finAnaDrawDonut(){
  const cc = finChartColors();
  const txs = finAnaTx().filter(t=>t.type===finAna.kind);
  const groups = {};
  for(const t of txs){
    let key, label, color=null;
    if(finAna.dim==='category'){ const c=finCat(t.categoryId); key=t.categoryId||'none'; label=c?c.name:'未分类'; color=c&&c.color; }
    else { const a=finAcct(t.accountId); key=t.accountId||'none'; label=a?a.name:'未知'; }
    const g = groups[key] || (groups[key]={label,color,total:0});
    g.total += finToBase(t.amount, t.currency);
  }
  const arr = Object.values(groups).sort((a,b)=>b.total-a.total);
  const sterile = document.documentElement.getAttribute('data-theme')==='sterile';
  const ramp = sterile ? finMonoRamp(finCss('--brass'), arr.length) : null;
  const colors = arr.map((g,i)=> ramp ? ramp[i] : (g.color||FIN_PALETTE[i%FIN_PALETTE.length]));
  const total = arr.reduce((s,g)=>s+g.total,0);
  const cv = document.getElementById('fin-ana-donut');
  if(cv && arr.length){
    finAna.charts.push(new Chart(cv,{
      type:'doughnut',
      data:{ labels:arr.map(g=>g.label), datasets:[{ data:arr.map(g=>g.total), backgroundColor:colors, borderWidth:0 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'62%',
        plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:(ctx)=>`${ctx.label}: ${finBaseMoney(ctx.parsed,{noMask:true})}` } } } }
    }));
  }
  const tl = document.getElementById('fin-ana-toplist');
  if(tl){
    tl.innerHTML = arr.slice(0,8).map((g,i)=>{
      const pct = total ? (g.total/total*100) : 0;
      return `<div class="fin-ana-toprow">
        <span class="fin-ana-dot" style="background:${colors[i]}"></span>
        <span class="fin-ana-toplabel">${escH(g.label)}</span>
        <span class="fin-ana-toppct">${pct.toFixed(0)}%</span>
        <span class="fin-ana-topval">${finBaseMoney(g.total)}</span>
      </div>`;
    }).join('') || '<div class="fin-empty sm">此区间无数据</div>';
  }
}

function finAnaDrawTrend(){
  const cc = finChartColors();
  const w = finAnaWindow();
  let labels=[], income=[], expense=[];
  if(finAna.range==='year'){
    for(let m=0;m<12;m++){ labels.push((m+1)+'月'); income.push(0); expense.push(0); }
    for(const t of finAnaTx()){ const m=Number(String(t.date).slice(5,7))-1;
      if(t.type==='income') income[m]+=finToBase(t.amount,t.currency);
      else if(t.type==='expense') expense[m]+=finToBase(t.amount,t.currency); }
  } else {
    const days = Math.round((w.endD-w.startD)/86400000)+1;
    for(let i=0;i<days;i++){ const d=new Date(w.startD); d.setDate(d.getDate()+i); labels.push((d.getMonth()+1)+'/'+d.getDate()); income.push(0); expense.push(0); }
    for(const t of finAnaTx()){ const d=new Date(t.date+'T00:00:00'); const i=Math.round((d-w.startD)/86400000);
      if(i>=0&&i<days){ if(t.type==='income') income[i]+=finToBase(t.amount,t.currency); else if(t.type==='expense') expense[i]+=finToBase(t.amount,t.currency); } }
  }
  const cv = document.getElementById('fin-ana-trend'); if(!cv) return;
  finAna.charts.push(new Chart(cv,{
    type:'bar',
    data:{ labels, datasets:[
      { label:'收入', data:income, backgroundColor:cc.pos, borderRadius:2 },
      { label:'支出', data:expense, backgroundColor:cc.neg, borderRadius:2 } ] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ color:cc.mute, boxWidth:12 } },
        tooltip:{ callbacks:{ label:(ctx)=>`${ctx.dataset.label}: ${finBaseMoney(ctx.parsed.y,{noMask:true})}` } } },
      scales:{ x:{ ticks:{ color:cc.ghost, maxRotation:0, autoSkip:true, maxTicksLimit:12 }, grid:{ display:false } },
        y:{ ticks:{ color:cc.ghost }, grid:{ color:cc.hair } } } }
  }));
}

function finAnaDrawNetWorth(){
  const cc = finChartColors();
  const w = finAnaWindow();
  let labels=[], pts=[];
  if(finAna.range==='year'){
    for(let m=0;m<12;m++){ const last=new Date(w.startD.getFullYear(),m+1,0); labels.push((m+1)+'月'); pts.push(finNetWorthAsOf(finDateStr(last))); }
  } else {
    const days = Math.round((w.endD-w.startD)/86400000)+1;
    const step = days>31 ? Math.ceil(days/31) : 1;
    for(let i=0;i<days;i+=step){ const d=new Date(w.startD); d.setDate(d.getDate()+i); labels.push((d.getMonth()+1)+'/'+d.getDate()); pts.push(finNetWorthAsOf(finDateStr(d))); }
    const le=finDateStr(w.endD); if(labels.length && labels[labels.length-1]!==(w.endD.getMonth()+1)+'/'+w.endD.getDate()){ labels.push((w.endD.getMonth()+1)+'/'+w.endD.getDate()); pts.push(finNetWorthAsOf(le)); }
  }
  const cv = document.getElementById('fin-ana-networth'); if(!cv) return;
  const ctx = cv.getContext('2d');
  const grad = ctx.createLinearGradient(0,0,0,cv.height||200);
  grad.addColorStop(0, cc.brass+'55'); grad.addColorStop(1, cc.brass+'05');
  finAna.charts.push(new Chart(cv,{
    type:'line',
    data:{ labels, datasets:[{ data:pts, borderColor:cc.brass, backgroundColor:grad, fill:true, tension:0.35, pointRadius:0, borderWidth:2 }] },
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:(ctx)=>finBaseMoney(ctx.parsed.y,{noMask:true}) } } },
      scales:{ x:{ ticks:{ color:cc.ghost, maxRotation:0, autoSkip:true, maxTicksLimit:8 }, grid:{ display:false } },
        y:{ ticks:{ color:cc.ghost }, grid:{ color:cc.hair } } } }
  }));
}
