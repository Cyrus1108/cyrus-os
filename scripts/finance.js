/* ════════════════════════════════════════════════════════════════
   Finance module — Phase 1 (Ledger · Wallet · More)
   Full-screen view entered via #finance hash. Data lives in fin_* tables
   (pulled by sync.js into S.fin). Balances are derived in JS:
   balance = initial_balance + Σ(income) − Σ(expense) − Σ(transfer_out) + Σ(transfer_in).
   Multi-currency: each account/tx has a currency; aggregates convert to baseCurrency
   (TWD) via S.fin.fxRates (manual rates, "base units per 1 unit of currency").
   Inherits all theme CSS variables → works in both cappa + sterile automatically.
   ════════════════════════════════════════════════════════════════ */

const FIN_SYM = { TWD:'NT$', USD:'US$', MYR:'RM ' };

const finUI = {
  open:false, tab:'wallet', month:null, privacy:false,
  acctMgr:false, search:'',
};

/* ── money + currency helpers ── */
function finRate(c){ const r=S.fin.fxRates||{}; return Number(r[c])||1; }
function finToBase(amt, c){
  const base=S.fin.baseCurrency||'TWD';
  return amt * finRate(c) / (finRate(base)||1);
}
function finNum(amt){
  return Math.abs(amt).toLocaleString('en-US',{minimumFractionDigits:0, maximumFractionDigits:2});
}
/* Format a signed amount in its own currency, honoring the privacy toggle. */
function finMoney(amt, currency, opts){
  opts=opts||{};
  if(finUI.privacy && !opts.noMask) return '<span class="fin-mask">••••</span>';
  const sym = FIN_SYM[currency]!==undefined ? FIN_SYM[currency] : (currency+' ');
  return (amt<0?'−':'') + sym + finNum(amt);
}
function finBaseMoney(amt, opts){ return finMoney(amt, S.fin.baseCurrency||'TWD', opts); }

/* ── derived numbers ── */
function finBalance(acctId){
  const a = S.fin.accounts.find(x=>x.id===acctId); if(!a) return 0;
  let bal = a.initialBalance||0;
  for(const t of S.fin.transactions){
    if(t.type==='expense' && t.accountId===acctId) bal -= t.amount;
    else if(t.type==='income' && t.accountId===acctId) bal += t.amount;
    else if(t.type==='transfer'){
      if(t.accountId===acctId) bal -= t.amount;
      if(t.toAccountId===acctId) bal += (t.toAmount!=null ? t.toAmount : t.amount);
    }
  }
  return bal;
}
function finNetWorth(){
  let assets=0, liab=0;
  for(const a of S.fin.accounts){
    if(a.status!==FIN_ACCT_STATUS.ACTIVE) continue;   // only active counts toward net worth
    const balBase = finToBase(finBalance(a.id), a.currency);
    if(a.isLiability) liab += -balBase;               // amount owed = negative balance, shown positive
    else assets += balBase;
  }
  return { assets, liabilities:liab, net:assets-liab };
}
function finMonthList(month){ return S.fin.transactions.filter(t=>String(t.date).slice(0,7)===month); }
function finTotals(txs){
  let inc=0, exp=0;
  for(const t of txs){
    if(t.type==='income') inc += finToBase(t.amount, t.currency);
    else if(t.type==='expense') exp += finToBase(t.amount, t.currency);
  }
  return { income:inc, expense:exp, net:inc-exp };
}
function finAcct(id){ return S.fin.accounts.find(a=>a.id===id); }
function finCat(id){ return S.fin.categories.find(c=>c.id===id); }
function finSelectableAccounts(){ return S.fin.accounts.filter(a=>a.status!==FIN_ACCT_STATUS.INACTIVE); }
function finTxUsesCategory(catId){ return S.fin.transactions.some(t=>t.categoryId===catId); }
function finTxUsesAccount(acctId){ return S.fin.transactions.some(t=>t.accountId===acctId||t.toAccountId===acctId); }

/* ════════════ view open / close / routing ════════════ */
const FIN_TABS = ['wallet','ledger','analytics','more'];
const finCal = { targetId:null, ym:null, selected:null };
let _finTouchX=null, _finTouchY=null;

function initFinance(){
  finUI.privacy = loadLS('fin_privacy', false);
  finUI.month = TODAY.slice(0,7);
  S.fin.fxMeta = loadLS('fin_fxmeta', null) || {};
  window.addEventListener('hashchange', finOnHash);

  // Keyboard shortcuts (finance view only):
  //   ← / →            switch tabs
  //   ↑ / ↓            quick-record income / expense
  //   Shift + →        quick-record transfer
  //   Esc              step back out (modal → calendar → acct manager → close)
  document.addEventListener('keydown', (e)=>{
    if(!finUI.open) return;
    const tag = e.target.tagName;
    const typing = tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT';
    const modalOpen = finModalOpen();

    if(e.key==='Escape'){
      if(modalOpen) finCloseModal();
      else if(finCalOpen()) finCloseCal();
      else if(finUI.acctMgr) finCloseAcctManager();
      else closeFinance();
      return;
    }
    if(typing || modalOpen || finCalOpen()) return;

    // Quick-entry shortcuts — open the record form pre-set to a type
    if(e.key==='ArrowUp'){ e.preventDefault(); finOpenTxForm(null,'income'); return; }
    if(e.key==='ArrowDown'){ e.preventDefault(); finOpenTxForm(null,'expense'); return; }
    if(e.key==='ArrowRight' && e.shiftKey){ e.preventDefault(); finOpenTxForm(null,'transfer'); return; }

    // Plain ←/→ switch tabs (not while in the account manager)
    if(finUI.acctMgr) return;
    if(e.key==='ArrowRight'){ e.preventDefault(); finNavTab(1); }
    else if(e.key==='ArrowLeft'){ e.preventDefault(); finNavTab(-1); }
  });

  // Touch: horizontal swipe switches tabs (mobile)
  const v = document.getElementById('finance-view');
  if(v){
    v.addEventListener('touchstart', (e)=>{ const t=e.changedTouches[0]; _finTouchX=t.clientX; _finTouchY=t.clientY; }, {passive:true});
    v.addEventListener('touchend', (e)=>{
      if(_finTouchX==null) return;
      const t=e.changedTouches[0], dx=t.clientX-_finTouchX, dy=t.clientY-_finTouchY;
      _finTouchX=null;
      if(finModalOpen() || finCalOpen() || finUI.acctMgr) return;
      if(Math.abs(dx)>60 && Math.abs(dx)>Math.abs(dy)*1.6) finNavTab(dx<0?1:-1);  // swipe left → next tab
    }, {passive:true});
  }

  finOnHash();
}
function finModalOpen(){ const m=document.getElementById('fin-modal'); return !!(m&&m.classList.contains('open')); }
function finCalOpen(){ const c=document.getElementById('fin-cal'); return !!(c&&c.classList.contains('open')); }
function finNavTab(dir){
  let i = FIN_TABS.indexOf(finUI.tab);
  i = Math.max(0, Math.min(FIN_TABS.length-1, i+dir));
  if(FIN_TABS[i]!==finUI.tab) finSwitchTab(FIN_TABS[i]);
}
function finOnHash(){
  if(location.hash==='#finance'){ if(!finUI.open) openFinance(true); }
  else if(finUI.open){ closeFinance(true); }
}
function openFinance(fromHash){
  const v = document.getElementById('finance-view'); if(!v) return;
  finUI.open = true;
  v.classList.add('open');
  v.setAttribute('aria-hidden','false');
  document.body.classList.add('fin-locked');
  if(!fromHash && location.hash!=='#finance'){ location.hash='finance'; }
  // Seed default categories the first time (only once we know the DB is truly empty)
  if(initialPullDone && S.fin.categories.length===0){
    S.fin.categories = DEF_FIN_CATS.map((c,i)=>({ id:crypto.randomUUID(), ...c, archived:false, sort:i }));
    if(typeof finSaveCategories==='function') finSaveCategories();
  }
  finUpdateEye();
  rFinance();
  finFetchRates();   // refresh live FX in the background (cached ~12h)
}
function closeFinance(fromHash){
  const v = document.getElementById('finance-view'); if(!v) return;
  finUI.open = false;
  v.classList.remove('open');
  v.setAttribute('aria-hidden','true');
  document.body.classList.remove('fin-locked');
  finCloseModal();
  if(!fromHash && location.hash==='#finance'){ history.replaceState(null,'',location.pathname+location.search); }
}
function finSwitchTab(tab){ finUI.tab=tab; finUI.acctMgr=false; rFinance(); }
function finTogglePrivacy(){ finUI.privacy=!finUI.privacy; saveLSRaw('fin_privacy', finUI.privacy); finUpdateEye(); rFinance(); }
function finUpdateEye(){ const e=document.getElementById('fin-eye'); if(e) e.textContent = finUI.privacy?'🙈':'👁'; }

/* ════════════ main render ════════════ */
function rFinance(){
  if(!finUI.open) return;
  const body = document.getElementById('fin-body'); if(!body) return;
  document.querySelectorAll('#finance-view .fin-tab').forEach(b=>{
    b.classList.toggle('active', b.dataset.tab===finUI.tab);
  });
  if(finUI.tab==='wallet')        body.innerHTML = finRenderWallet();
  else if(finUI.tab==='ledger')   body.innerHTML = finRenderLedger();
  else if(finUI.tab==='analytics')body.innerHTML = finRenderAnalytics();
  else if(finUI.tab==='more')     body.innerHTML = finRenderMore();
  if(typeof attachRipples==='function') attachRipples();
}

/* ════════════ WALLET ════════════ */
function finRenderWallet(){
  const nw = finNetWorth();
  const base = S.fin.baseCurrency||'TWD';
  if(finUI.acctMgr) return finRenderAcctManager();

  // Asset dashboard
  let h = `<div class="fin-dash">
    <div class="fin-dash-net">
      <div class="fin-dash-label">净资产 · NET WORTH <span class="fin-dash-cur">${base}</span></div>
      <div class="fin-dash-net-val ${nw.net<0?'fin-neg':''}">${finBaseMoney(nw.net)}</div>
    </div>
    <div class="fin-dash-row">
      <div class="fin-dash-cell"><span class="fin-dash-sub">总资产</span><span class="fin-pos">${finBaseMoney(nw.assets)}</span></div>
      <div class="fin-dash-cell"><span class="fin-dash-sub">总负债</span><span class="fin-neg">${finBaseMoney(nw.liabilities)}</span></div>
    </div>
  </div>`;

  // Per-currency subtotals (active accounts only)
  const byCur = {};
  for(const a of S.fin.accounts){
    if(a.status!==FIN_ACCT_STATUS.ACTIVE) continue;
    byCur[a.currency] = (byCur[a.currency]||0) + finBalance(a.id);
  }
  const curKeys = Object.keys(byCur);
  if(curKeys.length>1){
    h += `<div class="fin-curbar">` + curKeys.map(c=>
      `<span class="fin-curchip">${c} <b class="${byCur[c]<0?'fin-neg':''}">${finMoney(byCur[c],c)}</b></span>`
    ).join('') + `</div>`;
  }

  // Account list, grouped by type
  if(!S.fin.accounts.length){
    h += `<div class="fin-empty">还没有账户。<br>点右上「⚙ 管理」创建你的第一个账户。</div>`;
  } else {
    for(const t of FIN_ACCT_TYPES){
      const accts = S.fin.accounts.filter(a=>a.type===t.id && a.status!==FIN_ACCT_STATUS.INACTIVE);
      if(!accts.length) continue;
      h += `<div class="fin-acct-group"><div class="fin-acct-grouphead">${t.icon} ${t.name}</div>`;
      for(const a of accts){
        const bal = finBalance(a.id);
        const excl = a.status===FIN_ACCT_STATUS.EXCLUDED;
        h += `<div class="fin-acct-card">
          <div class="fin-acct-meta">
            <span class="fin-acct-name">${escH(a.name)}${excl?' <span class="fin-acct-tag">不计净资产</span>':''}${a.isLiability?' <span class="fin-acct-tag liab">负债</span>':''}</span>
            <span class="fin-acct-cur">${a.currency}</span>
          </div>
          <span class="fin-acct-bal ${bal<0?'fin-neg':''}">${finMoney(bal, a.currency)}</span>
        </div>`;
      }
      h += `</div>`;
    }
  }

  h += `<div class="fin-wallet-actions">
    <button class="ghost fx-btn" onclick="finOpenAcctManager()">⚙ 管理账户</button>
  </div>`;
  return h;
}

function finOpenAcctManager(){ finUI.acctMgr=true; rFinance(); }
function finCloseAcctManager(){ finUI.acctMgr=false; rFinance(); }

function finRenderAcctManager(){
  const STAT = FIN_ACCT_STATUS;
  let h = `<div class="fin-mgr-head">
    <button class="fin-back-sm" onclick="finCloseAcctManager()">← 钱包</button>
    <span class="fin-mgr-title">账户管理</span>
    <button class="primary fx-btn" onclick="finOpenAcctForm()">+ 新账户</button>
  </div>
  <div class="fin-mgr-legend">✓ 计入净资产　·　− 仅记账不计入　·　☐ 停用</div>`;
  if(!S.fin.accounts.length){
    h += `<div class="fin-empty">还没有账户。点「+ 新账户」开始。</div>`;
    return h;
  }
  for(const a of S.fin.accounts){
    const t = FIN_ACCT_TYPES.find(x=>x.id===a.type)||{icon:'•',name:a.type};
    const mark = a.status===STAT.ACTIVE?'✓':a.status===STAT.EXCLUDED?'−':'☐';
    const bal = finBalance(a.id);
    h += `<div class="fin-mgr-row">
      <button class="fin-tri" data-s="${a.status}" onclick="finCycleAcctStatus('${a.id}')" title="切换状态">${mark}</button>
      <div class="fin-mgr-info" onclick="finOpenAcctForm('${a.id}')">
        <span class="fin-mgr-name">${t.icon} ${escH(a.name)}${a.isLiability?' <span class="fin-acct-tag liab">负债</span>':''}</span>
        <span class="fin-mgr-sub">${a.currency} · ${finMoney(bal,a.currency,{noMask:true})}</span>
      </div>
      <button class="fin-mgr-edit" onclick="finOpenAcctForm('${a.id}')">编辑</button>
    </div>`;
  }
  return h;
}

function finCycleAcctStatus(id){
  const a = finAcct(id); if(!a) return;
  // ACTIVE(1) → EXCLUDED(2) → INACTIVE(0) → ACTIVE(1)
  a.status = a.status===1 ? 2 : a.status===2 ? 0 : 1;
  if(typeof finSaveAccounts==='function') finSaveAccounts();
  saveLSRaw('fin_accounts', S.fin.accounts);
  rFinance();
}

/* ════════════ LEDGER (list view) ════════════ */
function finShiftMonth(delta){
  const [y,m] = finUI.month.split('-').map(Number);
  const d = new Date(y, m-1+delta, 1);
  finUI.month = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  rFinance();
}
function finRenderLedger(){
  const month = finUI.month;
  const txs = finMonthList(month).slice().sort((a,b)=> (a.date<b.date?1:a.date>b.date?-1:(a.created<b.created?1:-1)));
  const tot = finTotals(txs);
  const [yy,mm] = month.split('-');

  // Header dashboard
  let h = `<div class="fin-led-head">
    <div class="fin-month-nav">
      <button class="fin-mn-btn" onclick="finShiftMonth(-1)">‹</button>
      <span class="fin-month-label">${yy} 年 ${Number(mm)} 月</span>
      <button class="fin-mn-btn" onclick="finShiftMonth(1)">›</button>
    </div>
    <div class="fin-led-totals">
      <div class="fin-led-cell"><span class="fin-dash-sub">收入</span><span class="fin-pos">${finBaseMoney(tot.income)}</span></div>
      <div class="fin-led-cell"><span class="fin-dash-sub">支出</span><span class="fin-neg">${finBaseMoney(tot.expense)}</span></div>
      <div class="fin-led-cell"><span class="fin-dash-sub">结余</span><span class="${tot.net<0?'fin-neg':'fin-pos'}">${finBaseMoney(tot.net)}</span></div>
    </div>
    ${finSparkline(txs)}
  </div>`;

  if(!txs.length){
    h += `<div class="fin-empty">本月还没有流水。<br>点右下「+」记一笔。</div>`;
    return h;
  }

  // Group by day
  const days = {};
  for(const t of txs){ (days[t.date]=days[t.date]||[]).push(t); }
  for(const date of Object.keys(days).sort().reverse()){
    const dayTxs = days[date];
    let dInc=0, dExp=0;
    for(const t of dayTxs){
      if(t.type==='income') dInc += finToBase(t.amount,t.currency);
      else if(t.type==='expense') dExp += finToBase(t.amount,t.currency);
    }
    const dd = new Date(date+'T00:00:00');
    const wd = ['日','一','二','三','四','五','六'][dd.getDay()];
    h += `<div class="fin-day">
      <div class="fin-day-head">
        <span class="fin-day-date">${Number(date.slice(5,7))}月${Number(date.slice(8,10))}日 <span class="fin-day-wd">周${wd}</span></span>
        <span class="fin-day-sums">${dInc?`<span class="fin-pos">+${finNum(dInc)}</span>`:''}${dExp?`<span class="fin-neg">−${finNum(dExp)}</span>`:''}</span>
      </div>`;
    for(const t of dayTxs){ h += finTxCard(t); }
    h += `</div>`;
  }
  return h;
}

function finTxCard(t){
  if(t.type==='transfer'){
    const from = finAcct(t.accountId), to = finAcct(t.toAccountId);
    return `<div class="fin-tx" onclick="finOpenTxForm('${t.id}')">
      <span class="fin-tx-ico">⇄</span>
      <div class="fin-tx-body">
        <span class="fin-tx-cat">转账</span>
        <span class="fin-tx-sub">${from?escH(from.name):'?'} → ${to?escH(to.name):'?'}${t.note?' · '+escH(t.note):''}</span>
      </div>
      <span class="fin-tx-amt">${finMoney(t.amount,t.currency)}</span>
    </div>`;
  }
  const c = finCat(t.categoryId);
  const a = finAcct(t.accountId);
  const sign = t.type==='income' ? '+' : '−';
  const cls = t.type==='income' ? 'fin-pos' : 'fin-neg';
  return `<div class="fin-tx" onclick="finOpenTxForm('${t.id}')">
    <span class="fin-tx-ico" style="${c&&c.color?`background:${c.color}22;`:''}">${c?c.icon||'•':'•'}</span>
    <div class="fin-tx-body">
      <span class="fin-tx-cat">${c?escH(c.name):'未分类'}</span>
      <span class="fin-tx-sub">${a?escH(a.name):'?'}${t.note?' · '+escH(t.note):''}</span>
    </div>
    <span class="fin-tx-amt ${cls}">${sign}${finMoney(t.amount,t.currency).replace('−','')}</span>
  </div>`;
}

/* Minimal pure-SVG sparkline of daily net (income−expense) across the month. */
function finSparkline(txs){
  const [y,m] = finUI.month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const net = new Array(days).fill(0);
  for(const t of txs){
    const d = Number(String(t.date).slice(8,10));
    if(t.type==='income') net[d-1]+=finToBase(t.amount,t.currency);
    else if(t.type==='expense') net[d-1]-=finToBase(t.amount,t.currency);
  }
  let cum=0; const cumArr = net.map(v=> cum+=v);
  const max = Math.max(1, ...cumArr.map(Math.abs));
  const W=280, H=40, step=W/Math.max(1,days-1);
  const pts = cumArr.map((v,i)=>`${(i*step).toFixed(1)},${(H/2 - (v/max)*(H/2-3)).toFixed(1)}`).join(' ');
  return `<svg class="fin-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <line x1="0" y1="${H/2}" x2="${W}" y2="${H/2}" class="fin-spark-zero"/>
    <polyline points="${pts}" class="fin-spark-line"/>
  </svg>`;
}

/* ════════════ ANALYTICS (Phase 2 placeholder) ════════════ */
function finRenderAnalytics(){
  return `<div class="fin-soon">
    <div class="fin-soon-glyph">◆</div>
    <div class="fin-soon-title">图表分析 · 预算引擎</div>
    <div class="fin-soon-sub">饼图 / 趋势 / 三种预算模式<br>将在 Phase 2 迭代加入</div>
  </div>`;
}

/* ════════════ MORE ════════════ */
function finRenderMore(){
  // Search
  let h = `<div class="fin-more-sec">
    <div class="fin-more-head">账单搜索</div>
    <input id="fin-search" class="fin-input" placeholder="搜索备注 / 金额 / 分类…" value="${escH(finUI.search)}" oninput="finDoSearch(this.value)">
    <div id="fin-search-results" class="fin-search-results">${finSearchResults()}</div>
  </div>`;

  // Categories
  const exp = S.fin.categories.filter(c=>c.kind==='expense');
  const inc = S.fin.categories.filter(c=>c.kind==='income');
  const catRow = c => {
    const used = finTxUsesCategory(c.id);
    return `<div class="fin-cat-row ${c.archived?'archived':''}">
      <span class="fin-cat-ico" style="${c.color?`background:${c.color}22;`:''}">${c.icon||'•'}</span>
      <span class="fin-cat-name">${escH(c.name)}${c.archived?' <span class="fin-acct-tag">已归档</span>':''}</span>
      <button class="fin-mgr-edit" onclick="finOpenCatForm('${c.id}')">编辑</button>
      ${used
        ? `<button class="fin-mgr-edit" onclick="finArchiveCat('${c.id}')">${c.archived?'恢复':'归档'}</button>`
        : `<button class="fin-mgr-edit danger" onclick="finDeleteCat('${c.id}')">删除</button>`}
    </div>`;
  };
  h += `<div class="fin-more-sec">
    <div class="fin-more-head">分类管理 <button class="primary fx-btn fin-mini" onclick="finOpenCatForm()">+ 新分类</button></div>
    <div class="fin-cat-sub">支出</div>${exp.map(catRow).join('')||'<div class="fin-empty sm">无</div>'}
    <div class="fin-cat-sub">收入</div>${inc.map(catRow).join('')||'<div class="fin-empty sm">无</div>'}
  </div>`;

  // Accounts entry
  h += `<div class="fin-more-sec">
    <div class="fin-more-head">账户</div>
    <button class="ghost fx-btn" onclick="finUI.tab='wallet';finUI.acctMgr=true;rFinance();">⚙ 账户三态管理</button>
  </div>`;

  // Live FX rates (auto)
  const base = S.fin.baseCurrency||'TWD';
  const meta = S.fin.fxMeta||{};
  h += `<div class="fin-more-sec">
    <div class="fin-more-head">汇率 <button class="ghost fx-btn fin-mini" onclick="finFetchRates(true)">🔄 刷新</button></div>
    <div class="fin-fx-auto">
      <div class="fin-fx-note">实时汇率 · 基准 ${base}${meta.updated?` · 更新于 ${finAgo(meta.updated)}`:' · 打开时自动获取'}</div>
      ${FIN_CURRENCIES.filter(c=>c!==base).map(c=>
        `<div class="fin-fx-row"><span>1 ${c}</span><b>${finRate(c).toFixed(4)} ${base}</b></div>`
      ).join('')}
    </div>
  </div>`;
  return h;
}
function finSetRate(c, v){
  v = parseFloat(v); if(!isFinite(v)||v<=0) return;
  S.fin.fxRates = { ...(S.fin.fxRates||{}), [c]:v };
  if(typeof saveFinConfig==='function') saveFinConfig();
  rFinance();
}
function finDoSearch(q){
  finUI.search = q;
  const el = document.getElementById('fin-search-results');
  if(el) el.innerHTML = finSearchResults();
}
function finSearchResults(){
  const q = finUI.search.trim().toLowerCase();
  if(!q) return '';
  const hits = S.fin.transactions.filter(t=>{
    const c = finCat(t.categoryId);
    return (t.note&&t.note.toLowerCase().includes(q))
      || (c&&c.name.toLowerCase().includes(q))
      || String(t.amount).includes(q);
  }).slice(0,40);
  if(!hits.length) return '<div class="fin-empty sm">无匹配</div>';
  return hits.map(t=>`<div class="fin-search-row">${finTxCard(t)}<span class="fin-search-date">${t.date}</span></div>`).join('');
}

/* ════════════ MODAL: transaction / account / category forms ════════════ */
function finModal(html){
  let m = document.getElementById('fin-modal');
  if(!m){
    m = document.createElement('div'); m.id='fin-modal'; m.className='fin-modal';
    m.innerHTML = `<div class="fin-modal-card" id="fin-modal-card"></div>`;
    m.addEventListener('click', e=>{ if(e.target===m) finCloseModal(); });
    document.getElementById('finance-view').appendChild(m);
  }
  document.getElementById('fin-modal-card').innerHTML = html;
  m.classList.add('open');
}
function finCloseModal(){ const m=document.getElementById('fin-modal'); if(m) m.classList.remove('open'); }

/* ── transaction form ── */
function finOpenTxForm(txId, presetType){
  const accts = finSelectableAccounts();
  if(!accts.length && !txId){
    finModal(`<div class="fin-form-title">还没有账户</div>
      <div class="fin-empty sm">请先到「钱包 · 管理账户」创建一个账户，再来记账。</div>
      <div class="fin-form-btns"><button class="ghost fx-btn" onclick="finCloseModal()">知道了</button></div>`);
    return;
  }
  const t = txId ? S.fin.transactions.find(x=>x.id===txId) : null;
  const type = t? t.type : (presetType||'expense');
  const acctOpts = (selId)=> accts.map(a=>`<option value="${a.id}" ${a.id===selId?'selected':''}>${escH(a.name)} · ${a.currency}</option>`).join('');
  const curOpts = (sel)=> FIN_CURRENCIES.map(c=>`<option value="${c}" ${c===sel?'selected':''}>${c}</option>`).join('');
  const defCur = t? t.currency : (accts[0]?accts[0].currency:'TWD');

  finModal(`
    <div class="fin-form-title">${txId?'编辑':'记一笔'}</div>
    <div class="fin-seg" id="fin-tx-typeseg">
      ${['expense','income','transfer'].map(k=>`<button class="fin-seg-btn ${k===type?'active':''}" data-type="${k}" onclick="finTxSetType('${k}')">${k==='expense'?'支出':k==='income'?'收入':'转账'}</button>`).join('')}
    </div>
    <input type="hidden" id="fin-tx-type" value="${type}">
    <input type="hidden" id="fin-tx-id" value="${txId||''}">

    <div class="fin-field">
      <label>金额</label>
      <div class="fin-amt-row">
        <input id="fin-tx-amount" type="number" step="0.01" inputmode="decimal" placeholder="0.00" value="${t?t.amount:''}">
        <select id="fin-tx-currency">${curOpts(defCur)}</select>
      </div>
    </div>

    <div class="fin-field" id="fin-tx-acct-wrap">
      <label id="fin-tx-acct-label">账户</label>
      <select id="fin-tx-account" onchange="finTxAcctChanged()">${acctOpts(t?t.accountId:accts[0].id)}</select>
    </div>

    <div class="fin-field" id="fin-tx-toacct-wrap" style="display:none;">
      <label>转入账户</label>
      <select id="fin-tx-toaccount" onchange="finTxAcctChanged()">${acctOpts(t?t.toAccountId:(accts[1]?accts[1].id:accts[0].id))}</select>
    </div>

    <div class="fin-field" id="fin-tx-toamt-wrap" style="display:none;">
      <label>转入金额（对方币种）</label>
      <input id="fin-tx-toamount" type="number" step="0.01" inputmode="decimal" placeholder="跨币种时填写" value="${t&&t.toAmount!=null?t.toAmount:''}">
    </div>

    <div class="fin-field" id="fin-tx-cat-wrap">
      <label>分类</label>
      <div class="fin-catgrid" id="fin-tx-catgrid"></div>
      <input type="hidden" id="fin-tx-category" value="${t?t.categoryId||'':''}">
    </div>

    <div class="fin-field">
      <label>日期</label>
      <button type="button" class="fin-datebtn" onclick="finOpenCal('fin-tx-date')">📅 <span id="fin-tx-date-label">${finDateLabel(t?t.date:TODAY)}</span></button>
      <input type="hidden" id="fin-tx-date" value="${t?t.date:TODAY}">
    </div>
    <div class="fin-field">
      <label>备注</label>
      <input id="fin-tx-note" type="text" placeholder="可选…" value="${t?escH(t.note||''):''}">
    </div>

    <div class="fin-form-btns">
      ${txId?`<button class="ghost fx-btn danger" onclick="finDeleteTxConfirm('${txId}')">删除</button>`:''}
      <button class="ghost fx-btn" onclick="finCloseModal()">取消</button>
      <button class="primary fx-btn" onclick="finSubmitTx()">保存</button>
    </div>
  `);
  finTxSetType(type, true);
  if(t&&t.categoryId) finRenderCatGrid(t.categoryId);
}
function finTxSetType(type, keepCat){
  document.getElementById('fin-tx-type').value = type;
  document.querySelectorAll('#fin-tx-typeseg .fin-seg-btn').forEach(b=>b.classList.toggle('active', b.dataset.type===type));
  const isTransfer = type==='transfer';
  document.getElementById('fin-tx-cat-wrap').style.display   = isTransfer?'none':'';
  document.getElementById('fin-tx-toacct-wrap').style.display= isTransfer?'':'none';
  document.getElementById('fin-tx-acct-label').textContent   = isTransfer?'转出账户':'账户';
  if(!isTransfer) finRenderCatGrid(keepCat?document.getElementById('fin-tx-category').value:null);
  finTxAcctChanged();
}
function finTxAcctChanged(){
  // Show "to amount" only for cross-currency transfers
  const type = document.getElementById('fin-tx-type').value;
  const wrap = document.getElementById('fin-tx-toamt-wrap');
  if(type!=='transfer'){ wrap.style.display='none'; return; }
  const from = finAcct(document.getElementById('fin-tx-account').value);
  const to = finAcct(document.getElementById('fin-tx-toaccount').value);
  wrap.style.display = (from&&to&&from.currency!==to.currency)?'':'none';
}
function finRenderCatGrid(selId){
  const grid = document.getElementById('fin-tx-catgrid'); if(!grid) return;
  const type = document.getElementById('fin-tx-type').value;
  const kind = type==='income'?'income':'expense';
  const cats = S.fin.categories.filter(c=>c.kind===kind && !c.archived);
  grid.innerHTML = cats.map(c=>`<button type="button" class="fin-catpick ${c.id===selId?'active':''}" data-id="${c.id}" onclick="finPickCat('${c.id}')">
    <span class="fin-catpick-ico" style="${c.color?`background:${c.color}22;`:''}">${c.icon||'•'}</span>${escH(c.name)}</button>`).join('');
  if(!cats.some(c=>c.id===selId)) document.getElementById('fin-tx-category').value = '';
}
function finPickCat(id){
  document.getElementById('fin-tx-category').value = id;
  document.querySelectorAll('#fin-tx-catgrid .fin-catpick').forEach(b=>b.classList.toggle('active', b.dataset.id===id));
}
async function finSubmitTx(){
  const type = document.getElementById('fin-tx-type').value;
  const amount = Math.round((parseFloat(document.getElementById('fin-tx-amount').value)||0)*100)/100;
  if(amount<=0){ alert('请输入金额'); return; }
  const currency = document.getElementById('fin-tx-currency').value;
  const date = document.getElementById('fin-tx-date').value || TODAY;
  const note = document.getElementById('fin-tx-note').value.trim();
  const id = document.getElementById('fin-tx-id').value;

  const tx = { type, amount, currency, date, note, tags:[],
    accountId:null, toAccountId:null, toAmount:null, categoryId:null };

  if(type==='transfer'){
    tx.accountId = document.getElementById('fin-tx-account').value;
    tx.toAccountId = document.getElementById('fin-tx-toaccount').value;
    if(tx.accountId===tx.toAccountId){ alert('转出和转入账户不能相同'); return; }
    const from=finAcct(tx.accountId), to=finAcct(tx.toAccountId);
    if(from&&to&&from.currency!==to.currency){
      const ta=parseFloat(document.getElementById('fin-tx-toamount').value);
      tx.toAmount = isFinite(ta)&&ta>0 ? Math.round(ta*100)/100 : amount;
    }
  } else {
    tx.accountId = document.getElementById('fin-tx-account').value;
    tx.categoryId = document.getElementById('fin-tx-category').value || null;
  }

  if(id){
    tx.id = id;
    const saved = await finUpdateTx(tx);
    const i = S.fin.transactions.findIndex(x=>x.id===id);
    if(i>=0) S.fin.transactions[i] = { ...S.fin.transactions[i], ...tx };
  } else {
    const saved = await finAddTx(tx);
    const newId = saved? saved.id : crypto.randomUUID();
    S.fin.transactions.unshift({ id:newId, created:new Date().toISOString(), ...tx });
  }
  saveLSRaw('fin_transactions', S.fin.transactions);
  finCloseModal();
  rFinance();
}
function finDeleteTxConfirm(id){
  if(!confirm('删除这笔流水？')) return;
  finDeleteTx(id);
  S.fin.transactions = S.fin.transactions.filter(t=>t.id!==id);
  saveLSRaw('fin_transactions', S.fin.transactions);
  finCloseModal();
  rFinance();
}

/* ── account form ── */
function finOpenAcctForm(id){
  const a = id ? finAcct(id) : null;
  const typeOpts = FIN_ACCT_TYPES.map(t=>`<option value="${t.id}" ${a&&a.type===t.id?'selected':''}>${t.icon} ${t.name}</option>`).join('');
  const curOpts = FIN_CURRENCIES.map(c=>`<option value="${c}" ${a&&a.currency===c?'selected':(!a&&c===(S.fin.baseCurrency||'TWD')?'selected':'')}>${c}</option>`).join('');
  finModal(`
    <div class="fin-form-title">${id?'编辑账户':'新账户'}</div>
    <input type="hidden" id="fin-acct-id" value="${id||''}">
    <div class="fin-field"><label>名称</label><input id="fin-acct-name" type="text" placeholder="如 现金 / 国泰世华 / 信用卡" value="${a?escH(a.name):''}"></div>
    <div class="fin-field"><label>类型</label><select id="fin-acct-type">${typeOpts}</select></div>
    <div class="fin-field"><label>币种</label><select id="fin-acct-currency">${curOpts}</select></div>
    <div class="fin-field"><label>${id?'初始余额（建账时的余额，不可追溯改流水）':'当前余额'}</label><input id="fin-acct-init" type="number" step="0.01" inputmode="decimal" placeholder="0.00" value="${a?a.initialBalance:''}"></div>
    <label class="fin-check"><input type="checkbox" id="fin-acct-liab" ${a&&a.isLiability?'checked':''}> 这是负债账户（信用卡 / 借款）</label>
    <div class="fin-form-btns">
      ${id&&!finTxUsesAccount(id)?`<button class="ghost fx-btn danger" onclick="finDeleteAcct('${id}')">删除</button>`:''}
      <button class="ghost fx-btn" onclick="finCloseModal()">取消</button>
      <button class="primary fx-btn" onclick="finSubmitAcct()">保存</button>
    </div>
    ${id&&finTxUsesAccount(id)?'<div class="fin-hint">已有流水的账户不能删除，可在管理里设为「停用」。</div>':''}
  `);
}
function finSubmitAcct(){
  const id = document.getElementById('fin-acct-id').value;
  const name = document.getElementById('fin-acct-name').value.trim();
  if(!name){ alert('请输入账户名称'); return; }
  const type = document.getElementById('fin-acct-type').value;
  const currency = document.getElementById('fin-acct-currency').value;
  const initialBalance = Math.round((parseFloat(document.getElementById('fin-acct-init').value)||0)*100)/100;
  const isLiability = document.getElementById('fin-acct-liab').checked;
  if(id){
    const a = finAcct(id);
    Object.assign(a, { name, type, currency, initialBalance, isLiability });
  } else {
    S.fin.accounts.push({ id:crypto.randomUUID(), name, type, currency, initialBalance,
      isLiability, status:FIN_ACCT_STATUS.ACTIVE, icon:null, color:null, sort:S.fin.accounts.length });
  }
  if(typeof finSaveAccounts==='function') finSaveAccounts();
  saveLSRaw('fin_accounts', S.fin.accounts);
  finCloseModal();
  rFinance();
}
function finDeleteAcct(id){
  if(finTxUsesAccount(id)){ alert('该账户已有流水，不能删除。可设为停用。'); return; }
  if(!confirm('删除这个账户？')) return;
  S.fin.accounts = S.fin.accounts.filter(a=>a.id!==id);
  if(typeof finSaveAccounts==='function') finSaveAccounts();
  saveLSRaw('fin_accounts', S.fin.accounts);
  finCloseModal();
  rFinance();
}

/* ── category form ── */
const FIN_CAT_ICONS = ['🍜','🚌','🛍️','🏠','🎮','💊','📚','📦','💰','✨','📈','🎁','☕','🍔','✈️','🚗','🏥','🎁','💡','📱','🐾','💄','🎵','⚽'];
const FIN_CAT_COLORS = ['#E5704B','#4B89E5','#E54B9A','#8A6E4B','#9A4BE5','#3FB7A0','#C9A227','#888888','#3FAE6B','#6BAE3F'];
function finOpenCatForm(id){
  const c = id ? finCat(id) : null;
  const kind = c? c.kind : 'expense';
  const icon = c? (c.icon||'📦') : '📦';
  const color = c? (c.color||'#888888') : '#888888';
  finModal(`
    <div class="fin-form-title">${id?'编辑分类':'新分类'}</div>
    <input type="hidden" id="fin-cat-id" value="${id||''}">
    <input type="hidden" id="fin-cat-icon" value="${icon}">
    <input type="hidden" id="fin-cat-color" value="${color}">
    <div class="fin-field"><label>名称</label><input id="fin-cat-name" type="text" placeholder="如 餐饮 / 工资" value="${c?escH(c.name):''}"></div>
    <div class="fin-field"><label>类型</label>
      <div class="fin-seg">
        <button type="button" class="fin-seg-btn ${kind==='expense'?'active':''}" data-k="expense" onclick="finCatSetKind('expense')">支出</button>
        <button type="button" class="fin-seg-btn ${kind==='income'?'active':''}" data-k="income" onclick="finCatSetKind('income')">收入</button>
      </div>
      <input type="hidden" id="fin-cat-kind" value="${kind}">
    </div>
    <div class="fin-field"><label>图标</label><div class="fin-iconpick" id="fin-cat-iconpick">${FIN_CAT_ICONS.map(ic=>`<button type="button" class="fin-icon-opt ${ic===icon?'active':''}" onclick="finPickIcon('${ic}')">${ic}</button>`).join('')}</div></div>
    <div class="fin-field"><label>颜色</label><div class="fin-colorpick" id="fin-cat-colorpick">${FIN_CAT_COLORS.map(co=>`<button type="button" class="fin-color-opt ${co===color?'active':''}" style="background:${co}" onclick="finPickColor('${co}')"></button>`).join('')}</div></div>
    <div class="fin-form-btns">
      <button class="ghost fx-btn" onclick="finCloseModal()">取消</button>
      <button class="primary fx-btn" onclick="finSubmitCat()">保存</button>
    </div>
  `);
}
function finCatSetKind(k){ document.getElementById('fin-cat-kind').value=k; document.querySelectorAll('#fin-modal-card .fin-seg-btn[data-k]').forEach(b=>b.classList.toggle('active',b.dataset.k===k)); }
function finPickIcon(ic){ document.getElementById('fin-cat-icon').value=ic; document.querySelectorAll('#fin-cat-iconpick .fin-icon-opt').forEach(b=>b.classList.toggle('active',b.textContent===ic)); }
function finPickColor(co){ document.getElementById('fin-cat-color').value=co; document.querySelectorAll('#fin-cat-colorpick .fin-color-opt').forEach(b=>b.classList.toggle('active',b.style.background.replace(/\s/g,'')===finHexToRgb(co))); }
function finHexToRgb(){ return ''; } // color match handled loosely; active state is cosmetic
function finSubmitCat(){
  const id = document.getElementById('fin-cat-id').value;
  const name = document.getElementById('fin-cat-name').value.trim();
  if(!name){ alert('请输入分类名称'); return; }
  const kind = document.getElementById('fin-cat-kind').value;
  const icon = document.getElementById('fin-cat-icon').value;
  const color = document.getElementById('fin-cat-color').value;
  if(id){ Object.assign(finCat(id), { name, kind, icon, color }); }
  else { S.fin.categories.push({ id:crypto.randomUUID(), name, kind, icon, color, archived:false, sort:S.fin.categories.length }); }
  if(typeof finSaveCategories==='function') finSaveCategories();
  saveLSRaw('fin_categories', S.fin.categories);
  finCloseModal();
  rFinance();
}
function finArchiveCat(id){
  const c = finCat(id); if(!c) return;
  c.archived = !c.archived;
  if(typeof finSaveCategories==='function') finSaveCategories();
  saveLSRaw('fin_categories', S.fin.categories);
  rFinance();
}
function finDeleteCat(id){
  if(finTxUsesCategory(id)){ alert('该分类下已有账单，不能删除，只能归档。'); return; }
  if(!confirm('删除这个分类？')) return;
  S.fin.categories = S.fin.categories.filter(c=>c.id!==id);
  if(typeof finSaveCategories==='function') finSaveCategories();
  saveLSRaw('fin_categories', S.fin.categories);
  rFinance();
}

/* ════════════ live FX rates (auto, cached ~12h) ════════════
   open.er-api.com is free + no key + CORS-enabled. latest/<base> returns
   "units of X per 1 base"; we invert to "base per 1 X" to match fxRates. */
async function finFetchRates(force){
  const base = S.fin.baseCurrency || 'TWD';
  const meta = S.fin.fxMeta || {};
  if(!force && meta.updated && (Date.now()-meta.updated) < 12*3600*1000) return;
  try{
    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    const j = await res.json();
    if(j && j.result==='success' && j.rates){
      const fx = { [base]:1 };
      for(const c of FIN_CURRENCIES){
        if(c!==base && j.rates[c]) fx[c] = Math.round((1/j.rates[c])*10000)/10000;
      }
      S.fin.fxRates = fx;
      S.fin.fxMeta = { updated:Date.now(), auto:true };
      saveLSRaw('fin_fxmeta', S.fin.fxMeta);
      if(typeof saveFinConfig==='function') saveFinConfig();
      if(finUI.open && finUI.tab==='more') rFinance();
    }
  }catch(e){ console.warn('[fin] fx fetch failed', e); }
}
function finAgo(ts){
  if(!ts) return '';
  const s = Math.floor((Date.now()-ts)/1000);
  if(s<60) return '刚刚';
  if(s<3600) return Math.floor(s/60)+' 分钟前';
  if(s<86400) return Math.floor(s/3600)+' 小时前';
  return Math.floor(s/86400)+' 天前';
}

/* ════════════ themed date picker ════════════ */
function finDateLabel(ds){
  if(!ds) return '选择日期';
  const d = new Date(ds+'T00:00:00');
  const wd = ['日','一','二','三','四','五','六'][d.getDay()];
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 · 周${wd}`;
}
function finOpenCal(targetId){
  const hidden = document.getElementById(targetId);
  const cur = (hidden && hidden.value) ? hidden.value : TODAY;
  finCal.targetId = targetId;
  finCal.selected = cur;
  finCal.ym = cur.slice(0,7);
  finCalShow(finCalHtml());
}
function finCalShow(html){
  let o = document.getElementById('fin-cal');
  if(!o){
    o = document.createElement('div'); o.id='fin-cal'; o.className='fin-cal';
    o.addEventListener('click', e=>{ if(e.target===o) finCloseCal(); });
    document.getElementById('finance-view').appendChild(o);
  }
  o.innerHTML = html;
  o.classList.add('open');
}
function finCloseCal(){ const o=document.getElementById('fin-cal'); if(o) o.classList.remove('open'); }
function finCalShift(delta){
  const [y,m] = finCal.ym.split('-').map(Number);
  const d = new Date(y, m-1+delta, 1);
  finCal.ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  finCalShow(finCalHtml());
}
function finCalHtml(){
  const [y,m] = finCal.ym.split('-').map(Number);
  const startWd = new Date(y, m-1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const wd = ['日','一','二','三','四','五','六'];
  let cells = '';
  for(let i=0;i<startWd;i++) cells += `<span class="fin-cal-cell empty"></span>`;
  for(let d=1; d<=days; d++){
    const ds = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cls = (ds===finCal.selected?'sel ':'') + (ds===TODAY?'today':'');
    cells += `<button type="button" class="fin-cal-cell ${cls.trim()}" onclick="finPickDate('${ds}')">${d}</button>`;
  }
  return `<div class="fin-cal-card">
    <div class="fin-cal-head">
      <button class="fin-mn-btn" onclick="finCalShift(-1)">‹</button>
      <span class="fin-cal-title">${y} 年 ${m} 月</span>
      <button class="fin-mn-btn" onclick="finCalShift(1)">›</button>
    </div>
    <div class="fin-cal-wd">${wd.map(w=>`<span>${w}</span>`).join('')}</div>
    <div class="fin-cal-grid">${cells}</div>
    <div class="fin-cal-foot">
      <button class="ghost fx-btn" onclick="finPickDate('${TODAY}')">今天</button>
      <button class="ghost fx-btn" onclick="finCloseCal()">取消</button>
    </div>
  </div>`;
}
function finPickDate(ds){
  const hidden = document.getElementById(finCal.targetId);
  if(hidden) hidden.value = ds;
  const lbl = document.getElementById(finCal.targetId+'-label');
  if(lbl) lbl.textContent = finDateLabel(ds);
  finCloseCal();
}
