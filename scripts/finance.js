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
  acctMgr:false, search:'', ledgerView:'list', calDay:null,
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
/* All account balances in ONE forward pass over the ledger → {acctId: balance}.
   The transfer asymmetry (toAmount-vs-amount, for cross-currency transfers) is
   preserved EXACTLY as the old per-account loop. Rebuilt per render (forced at the
   top of rFinance) so an in-place edit never serves a stale balance; the ref/length
   check covers sync array swaps and add/delete between forced rebuilds. */
let _finBal = { tx:null, accLen:-1, map:Object.create(null) };
function finBalances(force){
  const tx = S.fin.transactions || [], acc = S.fin.accounts || [];
  if(force || _finBal.tx !== tx || _finBal.accLen !== acc.length){
    const map = Object.create(null);
    for(const a of acc) map[a.id] = a.initialBalance || 0;
    for(const t of tx){
      if(t.type==='expense'){ if(t.accountId in map) map[t.accountId] -= t.amount; }
      else if(t.type==='income'){ if(t.accountId in map) map[t.accountId] += t.amount; }
      else if(t.type==='transfer'){
        if(t.accountId in map) map[t.accountId] -= t.amount;
        if(t.toAccountId in map) map[t.toAccountId] += (t.toAmount!=null ? t.toAmount : t.amount);
      }
    }
    _finBal = { tx, accLen:acc.length, map };
  }
  return _finBal.map;
}
function finBalance(acctId){
  let m = finBalances();
  if(!(acctId in m)) m = finBalances(true);   // account added since the last build
  return (acctId in m) ? m[acctId] : 0;        // 0 only when the account doesn't exist
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
// O(1) id→object lookups (rebuilt when the array is replaced or changes length;
// in-place field edits keep object identity, so the cached entry stays live)
let _finAcctIdx = { src:null, len:-1, map:new Map() };
function finAcct(id){
  const arr = S.fin.accounts || [];
  if(_finAcctIdx.src !== arr || _finAcctIdx.len !== arr.length){
    _finAcctIdx = { src:arr, len:arr.length, map:new Map(arr.map(a=>[a.id, a])) };
  }
  return _finAcctIdx.map.get(id);
}
let _finCatIdx = { src:null, len:-1, map:new Map() };
function finCat(id){
  const arr = S.fin.categories || [];
  if(_finCatIdx.src !== arr || _finCatIdx.len !== arr.length){
    _finCatIdx = { src:arr, len:arr.length, map:new Map(arr.map(c=>[c.id, c])) };
  }
  return _finCatIdx.map.get(id);
}
function finSelectableAccounts(){ return S.fin.accounts.filter(a=>a.status!==FIN_ACCT_STATUS.INACTIVE); }
function finTxUsesCategory(catId){ return S.fin.transactions.some(t=>t.categoryId===catId); }
function finTxUsesAccount(acctId){ return S.fin.transactions.some(t=>t.accountId===acctId||t.toAccountId===acctId); }
/* tags (Phase 2-E) */
function finParseTags(s){ return Array.from(new Set((s||'').split(/[\s,，、]+/).map(x=>x.trim()).filter(Boolean))); }
function finAllTags(){ const set=new Set(); for(const t of S.fin.transactions) for(const tg of (t.tags||[])) if(tg) set.add(tg); return Array.from(set).sort(); }
function finTagCount(tag){ return S.fin.transactions.filter(t=>(t.tags||[]).includes(tag)).length; }
async function finRenameTag(old){
  const input = prompt('重命名标签：', old); if(input==null) return;
  const nv = input.trim(); if(!nv || nv===old) return;
  for(const t of S.fin.transactions){
    if((t.tags||[]).includes(old)){ t.tags = Array.from(new Set(t.tags.map(x=>x===old?nv:x))); if(typeof finUpdateTx==='function') await finUpdateTx(t); }
  }
  saveLSRaw('fin_transactions', S.fin.transactions); rFinance();
}
async function finDeleteTag(tag){
  if(!confirm(`删除标签 #${tag}？会从所有流水移除该标签。`)) return;
  for(const t of S.fin.transactions){
    if((t.tags||[]).includes(tag)){ t.tags = t.tags.filter(x=>x!==tag); if(typeof finUpdateTx==='function') await finUpdateTx(t); }
  }
  saveLSRaw('fin_transactions', S.fin.transactions); rFinance();
}
function finSearchTag(tag){
  finUI.search = tag; finUI.tab='more'; rFinance();
  setTimeout(()=>{ const el=document.getElementById('fin-search'); if(el){ el.value=tag; el.scrollIntoView({block:'center'}); } }, 0);
}

/* ════════════ view open / close / routing ════════════ */
const FIN_TABS = ['wallet','ledger','analytics','more'];
const finCal = { targetId:null, ym:null, selected:null, onPick:null };
const finWiz = { active:false, type:'expense', step:'account', accountIdx:0, accountId:null, catIdx:0, categoryId:null,
  fromIdx:0, toIdx:0, fromAccountId:null, toAccountId:null, toAmount:null, amount:null, date:null, note:'' };
let _finTouchX=null, _finTouchY=null;

function initFinance(){
  finUI.privacy = loadLS('fin_privacy', false);
  finUI.month = TODAY.slice(0,7);
  finUI.ledgerView = loadLS('fin_ledgerview', 'list');
  S.fin.fxMeta = loadLS('fin_fxmeta', null) || {};
  window.addEventListener('hashchange', finOnHash);

  // Keyboard shortcuts (finance view only):
  //   ← / →            switch tabs
  //   ↑ / ↓            quick-record income / expense
  //   Shift + →        quick-record transfer
  //   Esc              step back out (modal → calendar → acct manager → close)
  //   [ / ]  (ledger)  toggle list ↔ calendar view
  //   [ / ]  (charts)  cycle time period  week → month → year → custom
  //   、               toggle amount privacy (hide / show)
  document.addEventListener('keydown', (e)=>{
    if(!finUI.open) return;
    // Calendar popup owns the keyboard while open (←→ ±day, ↑↓ ±week, Enter pick, Esc close)
    if(finCalOpen()){ finCalKey(e); return; }
    // Quick-entry wizard owns the keyboard while active
    if(finWiz.active){ finWizKey(e); return; }

    const tag = e.target.tagName;
    const typing = tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT';
    const modalOpen = finModalOpen();

    if(e.key==='Escape'){
      if(modalOpen) finCloseModal();
      else if(finUI.acctMgr) finCloseAcctManager();
      else closeFinance();
      return;
    }
    if(typing || modalOpen) return;

    // Quick-entry: ↑ income / ↓ expense launch the keyboard wizard; Shift+→ transfer (full form)
    if(e.key==='ArrowUp'){ e.preventDefault(); finWizStart('income'); return; }
    if(e.key==='ArrowDown'){ e.preventDefault(); finWizStart('expense'); return; }
    if(e.key==='ArrowRight' && e.shiftKey){ e.preventDefault(); finWizStart('transfer'); return; }

    // 、— toggle privacy (hide/show amounts). The 、(顿号) key sits on the
    // physical Backslash key; match by e.code so it works regardless of IME state.
    if(e.key==='、' || e.key==='\\' || e.code==='Backslash'){ e.preventDefault(); finTogglePrivacy(); return; }

    // [ / ] — context-aware view/period cycling
    if(e.key===']' || e.key==='['){
      e.preventDefault();
      const fwd = e.key===']';
      if(finUI.tab==='ledger'){
        // Toggle list ↔ calendar
        finSetLedgerView(finUI.ledgerView==='list' ? 'calendar' : 'list');
      } else if(finUI.tab==='analytics' && typeof finAnaSetRange==='function'){
        // Cycle week → month → year → custom (] forward, [ backward)
        const periods = ['week','month','year','custom'];
        const idx = periods.indexOf(finAna.range);
        const next = periods[(idx + (fwd ? 1 : periods.length - 1)) % periods.length];
        finAnaSetRange(next);
      }
      return;
    }

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

  // FAB gestures (mobile mirror of the keyboard shortcuts):
  //   swipe ↑ on + = income · ↓ = expense · → = transfer · plain tap = full form
  const fab = document.querySelector('#finance-view .fin-fab');
  if(fab){
    let fbx=null, fby=null;
    fab.addEventListener('touchstart', (e)=>{ const t=e.changedTouches[0]; fbx=t.clientX; fby=t.clientY; e.stopPropagation(); }, {passive:true});
    fab.addEventListener('touchend', (e)=>{
      if(fbx==null) return;
      const t=e.changedTouches[0], dx=t.clientX-fbx, dy=t.clientY-fby;
      fbx=null;
      e.stopPropagation();                 // don't let the view-level swipe also fire
      const TH=26;
      if(Math.abs(dx)<TH && Math.abs(dy)<TH) return;  // a tap → let the click open the full form
      e.preventDefault();                  // a swipe → cancel the synthesized click
      if(Math.abs(dy) > Math.abs(dx)) finWizStart(dy<0 ? 'income' : 'expense');
      else if(dx>0) finWizStart('transfer');
    }, {passive:false});
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
  if(typeof pageDepth === 'function') pageDepth(true);   // HUD floats over the receded page
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
  // v7.4: furl the HUD scroll first (mirrors closeSystem), then tear down
  if(v.classList.contains('open') && !v.classList.contains('fin-closing') && v.querySelector('.sys-window')){
    v.classList.add('fin-closing');
    setTimeout(()=>{ v.classList.remove('fin-closing'); _closeFinanceCore(v, fromHash); }, 480);
    return;
  }
  _closeFinanceCore(v, fromHash);
}
function _closeFinanceCore(v, fromHash){
  finUI.open = false;
  v.classList.remove('open');
  v.setAttribute('aria-hidden','true');
  document.body.classList.remove('fin-locked');
  if(typeof pageDepth === 'function') pageDepth(false);
  finCloseModal();
  if(!fromHash && location.hash==='#finance'){ history.replaceState(null,'',location.pathname+location.search); }
}
function finSwitchTab(tab){
  if(finUI.tab==='analytics' && tab!=='analytics' && typeof finAnaDestroy==='function') finAnaDestroy();
  withViewTransition(()=>{ finUI.tab=tab; finUI.acctMgr=false; rFinance(); });
}
function finTogglePrivacy(){ finUI.privacy=!finUI.privacy; saveLSRaw('fin_privacy', finUI.privacy); finUpdateEye(); rFinance(); }
function finUpdateEye(){ const e=document.getElementById('fin-eye'); if(e) e.textContent = finUI.privacy?'🙈':'👁'; }

/* ════════════ main render ════════════ */
function rFinance(){
  if(!finUI.open) return;
  const body = document.getElementById('fin-body'); if(!body) return;
  if(typeof finBalances==='function') finBalances(true);   // one fresh balance pass for the whole render

  document.querySelectorAll('#finance-view .fin-tab').forEach(b=>{
    b.classList.toggle('active', b.dataset.tab===finUI.tab);
  });
  if(finUI.tab==='wallet')        body.innerHTML = finRenderWallet();
  else if(finUI.tab==='ledger')   body.innerHTML = finRenderLedger();
  else if(finUI.tab==='analytics')body.innerHTML = finRenderAnalytics();
  else if(finUI.tab==='more')     body.innerHTML = finRenderMore();
  if(typeof attachRipples==='function') attachRipples(body);
}

/* ════════════ WALLET ════════════ */
function finRenderWallet(){
  const nw = finNetWorth();
  const base = S.fin.baseCurrency||'TWD';
  if(finUI.acctMgr) return finRenderAcctManager();

  // Asset dashboard
  const altCur = FIN_CURRENCIES.filter(c=>c!==base)
    .map(c=>`≈ ${finMoney(finRate(c)?nw.net/finRate(c):0, c)}`).join(' ');
  let h = `<div class="fin-dash">
    <div class="fin-dash-net">
      <div class="fin-dash-label">净资产 · NET WORTH <span class="fin-dash-cur">${base}</span></div>
      <div class="fin-dash-net-val ${nw.net<0?'fin-neg':''}">${finBaseMoney(nw.net)}</div>
      ${altCur?`<div class="fin-dash-alt">${altCur}</div>`:''}
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
        // make the monthly-interest cron visible: it accrues on the 1st of each
        // month (server pg_cron), so without this the feature looks broken
        const ir = +a.interestRate || 0;
        let irLine = '';
        if(ir > 0){
          const nf = new Date(); const nm = new Date(nf.getFullYear(), nf.getMonth()+1, 1);
          const md = `${nm.getMonth()+1}/${nm.getDate()}`;
          irLine = bal > 0
            ? `<span class="fin-acct-interest">↑ 下次计息 ${md} · 预计 +${finMoney(Math.round(bal*ir/100/12*100)/100, a.currency)}</span>`
            : `<span class="fin-acct-interest">${md} 起计息 · 需正余额</span>`;
        }
        h += `<div class="fin-acct-card">
          <div class="fin-acct-meta">
            <span class="fin-acct-name">${escH(a.name)}${excl?' <span class="fin-acct-tag">不计净资产</span>':''}${a.isLiability?' <span class="fin-acct-tag liab">负债</span>':''}</span>
            <span class="fin-acct-cur">${a.currency}${a.interestRate>0?` · <span class="fin-acct-rate">${(+a.interestRate)}%/年</span>`:''}</span>
            ${irLine}
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
  finUI.calDay = null;   // selected day belongs to a month; clear on month change
  rFinance();
}
function finSetLedgerView(v){
  finUI.ledgerView = v;
  saveLSRaw('fin_ledgerview', v);
  if(v==='calendar' && !finUI.calDay && finUI.month===TODAY.slice(0,7)) finUI.calDay = TODAY;
  withViewTransition(rFinance);
}
function finRenderLedger(){
  const month = finUI.month;
  const txs = finMonthList(month).slice().sort((a,b)=> (a.date<b.date?1:a.date>b.date?-1:(a.created<b.created?1:-1)));
  const tot = finTotals(txs);
  const [yy,mm] = month.split('-');

  // Shared header: month nav + totals + sparkline + list/calendar toggle
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
    <div class="fin-led-viewtoggle">
      <button class="fin-vt ${finUI.ledgerView==='list'?'active':''}" onclick="finSetLedgerView('list')">列表</button>
      <button class="fin-vt ${finUI.ledgerView==='calendar'?'active':''}" onclick="finSetLedgerView('calendar')">日历</button>
    </div>
  </div>`;

  if(finUI.ledgerView==='calendar') return h + finRenderLedgerCalendar(txs);

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
      <span class="fin-tx-sub">${a?escH(a.name):'?'}${t.note?' · '+escH(t.note):''}${(t.tags&&t.tags.length)?' '+t.tags.map(tg=>`<span class="fin-tx-tag">#${escH(tg)}</span>`).join(''):''}</span>
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

/* ── ledger calendar view (Module 1 View B) ── */
function finShort(n){
  if(finUI.privacy) return '••';
  n = Math.round(Math.abs(n));
  if(n>=10000) return Math.round(n/1000)+'k';
  if(n>=1000) return (n/1000).toFixed(1)+'k';
  return ''+n;
}
function finCalDayPick(ds){ finUI.calDay = (finUI.calDay===ds ? null : ds); rFinance(); }
function finRenderLedgerCalendar(txs){
  const [y,m] = finUI.month.split('-').map(Number);
  const startWd = new Date(y, m-1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const wd = ['日','一','二','三','四','五','六'];

  // per-day income/expense (base currency)
  const agg = {};
  for(const t of txs){
    const d = Number(String(t.date).slice(8,10));
    const a = agg[d] || (agg[d]={inc:0, exp:0});
    if(t.type==='income') a.inc += finToBase(t.amount, t.currency);
    else if(t.type==='expense') a.exp += finToBase(t.amount, t.currency);
  }

  let cells = '';
  for(let i=0;i<startWd;i++) cells += `<div class="fin-lcal-cell empty"></div>`;
  for(let d=1; d<=days; d++){
    const ds = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const a = agg[d];
    const cls = (ds===finUI.calDay?'sel ':'') + (ds===TODAY?'today':'');
    cells += `<button type="button" class="fin-lcal-cell ${cls.trim()}" onclick="finCalDayPick('${ds}')">
      <span class="fin-lcal-d">${d}</span>
      ${a ? `<span class="fin-lcal-sums">${a.inc?`<i class="fin-pos">+${finShort(a.inc)}</i>`:''}${a.exp?`<i class="fin-neg">−${finShort(a.exp)}</i>`:''}</span>` : ''}
    </button>`;
  }

  // selected-day panel
  let dayPanel;
  if(finUI.calDay){
    const dayTxs = txs.filter(t=>t.date===finUI.calDay)
      .sort((a,b)=> (a.created<b.created?1:-1));
    dayPanel = `<div class="fin-lcal-day-head">${finDateLabel(finUI.calDay)}</div>` +
      (dayTxs.length ? dayTxs.map(finTxCard).join('') : '<div class="fin-empty sm">这天没有流水</div>');
  } else {
    dayPanel = `<div class="fin-lcal-hint">点选某天查看当日流水</div>`;
  }

  return `<div class="fin-lcal-wrap">
    <div class="fin-lcal">
      <div class="fin-cal-wd">${wd.map(w=>`<span>${w}</span>`).join('')}</div>
      <div class="fin-lcal-grid">${cells}</div>
    </div>
    <div class="fin-lcal-day">${dayPanel}</div>
  </div>`;
}

/* ════════════ ANALYTICS ════════════
   finRenderAnalytics() lives in finance-charts.js (Chart.js, lazy-loaded). */

/* ════════════ BUDGET ENGINE (Phase 2-C) ════════════
   Monthly budgets, 3 modes: global (all expenses), inclusive (only the listed
   categories), exclusive (all expenses except the listed categories). */
function finBudgetSpent(b){
  const month = TODAY.slice(0,7);
  let spent = 0;
  for(const t of S.fin.transactions){
    if(t.type!=='expense' || String(t.date).slice(0,7)!==month) continue;
    const cat = t.categoryId;
    if(b.type==='inclusive' && !(b.targets||[]).includes(cat)) continue;
    if(b.type==='exclusive' && (b.targets||[]).includes(cat)) continue;
    spent += finToBase(t.amount, t.currency);
  }
  return spent;
}
function finBudgetTypeHint(t){
  return t==='global' ? '统计本月全部支出'
    : t==='inclusive' ? '只统计选中分类的支出'
    : '统计除选中分类外的支出（衡量真正可控的日常开销）';
}
function finBudgetsBlockHtml(){
  let rows = '';
  for(const b of S.fin.budgets){
    const spent = finBudgetSpent(b), pct = b.limit>0 ? spent/b.limit : 0;
    const cls = pct>=1 ? 'over' : pct>=0.8 ? 'warn' : '';
    const typeLabel = b.type==='global'?'全局':b.type==='inclusive'?'专用':'排他';
    rows += `<div class="fin-bud" onclick="finOpenBudgetForm('${b.id}')">
      <div class="fin-bud-top">
        <span class="fin-bud-name">${escH(b.name)} <span class="fin-bud-type">${typeLabel}</span></span>
        <span class="fin-bud-nums ${cls}">${finBaseMoney(spent)} / ${finBaseMoney(b.limit)}</span>
      </div>
      <div class="fin-bud-bar"><div class="fin-bud-fill ${cls}" style="width:${Math.min(100,pct*100).toFixed(0)}%"></div></div>
      <div class="fin-bud-meta ${cls}">${(pct*100).toFixed(0)}%${pct>=1?' · 已超支':''}</div>
    </div>`;
  }
  return `<div class="fin-ana-block span2 fin-bud-block">
    <div class="fin-ana-head"><span>本月预算</span><button class="primary fx-btn fin-mini" onclick="event.stopPropagation();finOpenBudgetForm()">+ 新预算</button></div>
    ${rows || '<div class="fin-empty sm">还没有预算。设一个来盯住开销。</div>'}
  </div>`;
}
function finOpenBudgetForm(id){
  const b = id ? S.fin.budgets.find(x=>x.id===id) : null;
  const type = b ? b.type : 'global';
  const targets = b ? (b.targets||[]) : [];
  const expCats = S.fin.categories.filter(c=>c.kind==='expense' && !c.archived);
  finModal(`
    <div class="fin-form-title">${id?'编辑预算':'新预算'}</div>
    <input type="hidden" id="fin-bud-id" value="${id||''}">
    <div class="fin-field"><label>名称</label><input id="fin-bud-name" type="text" placeholder="如 本月可控开销" value="${b?escH(b.name):''}"></div>
    <div class="fin-field"><label>每月限额 · ${S.fin.baseCurrency||'TWD'}</label><input id="fin-bud-limit" type="number" step="0.01" inputmode="decimal" placeholder="0.00" value="${b?b.limit:''}"></div>
    <div class="fin-field"><label>类型</label>
      <div class="fin-seg" id="fin-bud-typeseg">
        ${[['global','全局'],['inclusive','专用'],['exclusive','排他']].map(([k,l])=>`<button type="button" class="fin-seg-btn ${k===type?'active':''}" data-t="${k}" onclick="finBudgetSetType('${k}')">${l}</button>`).join('')}
      </div>
      <input type="hidden" id="fin-bud-type" value="${type}">
      <div class="fin-hint" id="fin-bud-typehint">${finBudgetTypeHint(type)}</div>
    </div>
    <div class="fin-field" id="fin-bud-cats-wrap" style="${type==='global'?'display:none;':''}">
      <label id="fin-bud-cats-label">${type==='exclusive'?'排除这些分类':'只统计这些分类'}</label>
      <div class="fin-bud-cats">${expCats.map(c=>`<label class="fin-bud-cat"><input type="checkbox" value="${c.id}" ${targets.includes(c.id)?'checked':''}> <span class="fin-wiz-catico" style="${c.color?`background:${c.color}22;`:''}">${c.icon||'•'}</span> ${escH(c.name)}</label>`).join('')}</div>
    </div>
    <div class="fin-form-btns">
      ${id?`<button class="ghost fx-btn danger" onclick="finDeleteBudget('${id}')">删除</button>`:''}
      <button class="ghost fx-btn" onclick="finCloseModal()">取消</button>
      <button class="primary fx-btn" onclick="finSubmitBudget()">保存</button>
    </div>
  `);
}
function finBudgetSetType(t){
  document.getElementById('fin-bud-type').value = t;
  document.querySelectorAll('#fin-bud-typeseg .fin-seg-btn').forEach(b=>b.classList.toggle('active', b.dataset.t===t));
  document.getElementById('fin-bud-cats-wrap').style.display = t==='global' ? 'none' : '';
  document.getElementById('fin-bud-cats-label').textContent = t==='exclusive' ? '排除这些分类' : '只统计这些分类';
  document.getElementById('fin-bud-typehint').textContent = finBudgetTypeHint(t);
}
function finSubmitBudget(){
  const id = document.getElementById('fin-bud-id').value;
  const name = document.getElementById('fin-bud-name').value.trim();
  if(!name){ alert('请输入预算名称'); return; }
  const limit = Math.round((parseFloat(document.getElementById('fin-bud-limit').value)||0)*100)/100;
  if(limit<=0){ alert('请输入限额'); return; }
  const type = document.getElementById('fin-bud-type').value;
  const targets = type==='global' ? [] : Array.from(document.querySelectorAll('#fin-bud-cats-wrap input:checked')).map(i=>i.value);
  if(type!=='global' && !targets.length){ alert('请至少选择一个分类'); return; }
  if(id){ Object.assign(S.fin.budgets.find(b=>b.id===id), { name, limit, type, targets }); }
  else { S.fin.budgets.push({ id:crypto.randomUUID(), name, limit, type, targets, period:'monthly', sort:S.fin.budgets.length }); }
  if(typeof finSaveBudgets==='function') finSaveBudgets();
  saveLSRaw('fin_budgets', S.fin.budgets);
  finCloseModal(); rFinance();
}
function finDeleteBudget(id){
  if(!confirm('删除这个预算？')) return;
  S.fin.budgets = S.fin.budgets.filter(b=>b.id!==id);
  if(typeof finSaveBudgets==='function') finSaveBudgets();
  saveLSRaw('fin_budgets', S.fin.budgets);
  finCloseModal(); rFinance();
}

/* ════════════ SAVINGS GOALS (Phase 3-A) ════════════ */
function finGoalSaved(g){
  if(g.mode==='account' && g.accountId){
    const a = finAcct(g.accountId); if(!a) return 0;
    return finToBase(finBalance(g.accountId), a.currency) / (finRate(g.currency)||1);  // account balance in the goal's currency
  }
  return g.savedAmount||0;
}
function finGoalsBlockHtml(){
  let rows = '';
  for(const g of S.fin.goals){
    const saved = finGoalSaved(g), pct = g.target>0 ? saved/g.target : 0, done = pct>=1;
    rows += `<div class="fin-goal">
      <div class="fin-goal-top">
        <span class="fin-goal-name">${escH(g.name)}${g.deadline?` <span class="fin-goal-dl">${g.deadline}</span>`:''}</span>
        <span class="fin-goal-nums">${finMoney(saved,g.currency)} / ${finMoney(g.target,g.currency)}</span>
      </div>
      <div class="fin-bud-bar"><div class="fin-bud-fill" style="width:${Math.min(100,pct*100).toFixed(0)}%;${done?'background:var(--fin-pos);':''}"></div></div>
      <div class="fin-goal-meta"><span>${(pct*100).toFixed(0)}%${done?' · 达成 🎉':''}</span>
        <span class="fin-goal-acts">${g.mode==='manual'?`<button onclick="finGoalDeposit('${g.id}')">存入</button>`:''}<button onclick="finOpenGoalForm('${g.id}')">编辑</button></span>
      </div>
    </div>`;
  }
  return `<div class="fin-more-sec">
    <div class="fin-more-head">存钱目标 <button class="primary fx-btn fin-mini" onclick="finOpenGoalForm()">+ 新目标</button></div>
    ${rows || '<div class="fin-empty sm">还没有目标。设一个，攒钱有方向。</div>'}
  </div>`;
}
function finOpenGoalForm(id){
  const g = id ? S.fin.goals.find(x=>x.id===id) : null;
  const mode = g ? g.mode : 'manual';
  const accts = finSelectableAccounts();
  const baseCur = g ? g.currency : (S.fin.baseCurrency||'TWD');
  const curOpts = FIN_CURRENCIES.map(c=>`<option value="${c}" ${baseCur===c?'selected':''}>${c}</option>`).join('');
  const acctOpts = accts.map(a=>`<option value="${a.id}" ${g&&g.accountId===a.id?'selected':''}>${escH(a.name)} · ${a.currency}</option>`).join('') || '<option value="">（无账户）</option>';
  finModal(`
    <div class="fin-form-title">${id?'编辑目标':'新目标'}</div>
    <input type="hidden" id="fin-goal-id" value="${id||''}">
    <div class="fin-field"><label>名称</label><input id="fin-goal-name" type="text" placeholder="如 旅游基金 / 紧急预备金" value="${g?escH(g.name):''}"></div>
    <div class="fin-field"><label>目标金额</label><div class="fin-amt-row"><input id="fin-goal-target" type="number" step="0.01" inputmode="decimal" placeholder="0.00" value="${g?g.target:''}"><select id="fin-goal-currency">${curOpts}</select></div></div>
    <div class="fin-field"><label>方式</label>
      <div class="fin-seg" id="fin-goal-modeseg">
        <button type="button" class="fin-seg-btn ${mode==='manual'?'active':''}" data-m="manual" onclick="finGoalSetMode('manual')">手动存入</button>
        <button type="button" class="fin-seg-btn ${mode==='account'?'active':''}" data-m="account" onclick="finGoalSetMode('account')">关联账户</button>
      </div>
      <input type="hidden" id="fin-goal-mode" value="${mode}">
      <div class="fin-hint" id="fin-goal-modehint">${mode==='account'?'进度 = 该账户当前余额（自动）':'进度 = 你手动累计存入的金额'}</div>
    </div>
    <div class="fin-field" id="fin-goal-acct-wrap" style="${mode==='account'?'':'display:none;'}"><label>关联账户</label><select id="fin-goal-account">${acctOpts}</select></div>
    <div class="fin-field" id="fin-goal-saved-wrap" style="${mode==='manual'?'':'display:none;'}"><label>已存入</label><input id="fin-goal-saved" type="number" step="0.01" inputmode="decimal" placeholder="0.00" value="${g?g.savedAmount:''}"></div>
    <div class="fin-field"><label>目标日期（可选）</label>
      <button type="button" class="fin-datebtn" onclick="finOpenCal('fin-goal-deadline')">📅 <span id="fin-goal-deadline-label">${g&&g.deadline?finDateLabel(g.deadline):'不设'}</span></button>
      <input type="hidden" id="fin-goal-deadline" value="${g&&g.deadline?g.deadline:''}">
    </div>
    <div class="fin-form-btns">
      ${id?`<button class="ghost fx-btn danger" onclick="finDeleteGoal('${id}')">删除</button>`:''}
      <button class="ghost fx-btn" onclick="finCloseModal()">取消</button>
      <button class="primary fx-btn" onclick="finSubmitGoal()">保存</button>
    </div>
  `);
}
function finGoalSetMode(m){
  document.getElementById('fin-goal-mode').value = m;
  document.querySelectorAll('#fin-goal-modeseg .fin-seg-btn').forEach(b=>b.classList.toggle('active', b.dataset.m===m));
  document.getElementById('fin-goal-acct-wrap').style.display = m==='account' ? '' : 'none';
  document.getElementById('fin-goal-saved-wrap').style.display = m==='manual' ? '' : 'none';
  document.getElementById('fin-goal-modehint').textContent = m==='account' ? '进度 = 该账户当前余额（自动）' : '进度 = 你手动累计存入的金额';
}
function finSubmitGoal(){
  const id = document.getElementById('fin-goal-id').value;
  const name = document.getElementById('fin-goal-name').value.trim();
  if(!name){ alert('请输入目标名称'); return; }
  const target = Math.round((parseFloat(document.getElementById('fin-goal-target').value)||0)*100)/100;
  if(target<=0){ alert('请输入目标金额'); return; }
  const currency = document.getElementById('fin-goal-currency').value;
  const mode = document.getElementById('fin-goal-mode').value;
  const accountId = mode==='account' ? (document.getElementById('fin-goal-account').value||null) : null;
  const savedAmount = mode==='manual' ? Math.round((parseFloat(document.getElementById('fin-goal-saved').value)||0)*100)/100 : 0;
  const deadline = document.getElementById('fin-goal-deadline').value || null;
  if(id){ Object.assign(S.fin.goals.find(g=>g.id===id), { name, target, currency, mode, accountId, savedAmount, deadline }); }
  else { S.fin.goals.push({ id:crypto.randomUUID(), name, target, currency, mode, accountId, savedAmount, deadline, sort:S.fin.goals.length }); }
  if(typeof finSaveGoals==='function') finSaveGoals();
  saveLSRaw('fin_goals', S.fin.goals);
  finCloseModal(); rFinance();
}
function finGoalDeposit(id){
  const g = S.fin.goals.find(x=>x.id===id); if(!g) return;
  const input = prompt(`存入「${g.name}」(${g.currency})：`, '');
  if(input==null) return;
  const v = parseFloat(input); if(!isFinite(v)||v===0) return;
  g.savedAmount = Math.round(((g.savedAmount||0)+v)*100)/100;
  if(g.savedAmount<0) g.savedAmount=0;
  if(typeof finSaveGoals==='function') finSaveGoals();
  saveLSRaw('fin_goals', S.fin.goals);
  rFinance();
  finToast(`已存入 ${finMoney(v,g.currency,{noMask:true})}`);
}
function finDeleteGoal(id){
  if(!confirm('删除这个目标？')) return;
  S.fin.goals = S.fin.goals.filter(g=>g.id!==id);
  if(typeof finSaveGoals==='function') finSaveGoals();
  saveLSRaw('fin_goals', S.fin.goals);
  finCloseModal(); rFinance();
}

/* ════════════ RECURRING (Phase 3-C) ════════════
   Templates materialized into fin_transactions nightly by pg_cron
   (fin_run_recurring); "▶ 运行" triggers fin_run_recurring_self for instant catch-up. */
const FIN_FREQ_UNIT = { daily:'天', weekly:'周', monthly:'月', yearly:'年' };
function finFreqText(f,n){ const u=FIN_FREQ_UNIT[f]||'月'; return (n>1)?`每 ${n} ${u}`:`每${u}`; }
function finRecurringBlockHtml(){
  let rows = '';
  for(const r of S.fin.recurring){
    const typeL = r.type==='income'?'收入':r.type==='expense'?'支出':'转账';
    const cls = r.type==='income'?'fin-pos':r.type==='expense'?'fin-neg':'';
    rows += `<div class="fin-rec ${r.active?'':'off'}" onclick="finOpenRecurringForm('${r.id}')">
      <div class="fin-rec-top"><span class="fin-rec-name">${escH(r.name)}</span><span class="fin-rec-amt ${cls}">${finMoney(r.amount,r.currency)}</span></div>
      <div class="fin-rec-meta">${typeL} · ${finFreqText(r.frequency,r.intervalN)} · 下次 ${r.nextDate}${r.active?'':' · 已暂停'}</div>
    </div>`;
  }
  return `<div class="fin-more-sec">
    <div class="fin-more-head">周期记账 <span class="fin-rec-headbtns"><button class="ghost fx-btn fin-mini" onclick="event.stopPropagation();finRunRecurringNow()">▶ 运行</button><button class="primary fx-btn fin-mini" onclick="event.stopPropagation();finOpenRecurringForm()">+ 新周期</button></span></div>
    ${rows || '<div class="fin-empty sm">还没有周期记账。如每月 Netflix、房租，到期自动入账。</div>'}
  </div>`;
}
async function finRunRecurringNow(){
  if(typeof sb==='undefined' || !currentUser){ finToast('请先登录'); return; }
  const { data, error } = await sb.rpc('fin_run_recurring_self');
  if(error){ console.error('[fin] run recurring', error); finToast('运行失败'); return; }
  if(typeof pullFinTransactions==='function') await pullFinTransactions();
  if(typeof pullFinRecurring==='function') await pullFinRecurring();
  rFinance();
  finToast(`已生成 ${data||0} 笔`);
}
function finRecCatOptions(kind, sel){
  return S.fin.categories.filter(c=>c.kind===kind && !c.archived)
    .map(c=>`<option value="${c.id}" ${c.id===sel?'selected':''}>${c.icon||''} ${escH(c.name)}</option>`).join('');
}
function finOpenRecurringForm(id){
  const r = id ? S.fin.recurring.find(x=>x.id===id) : null;
  const type = r ? r.type : 'expense';
  const accts = finSelectableAccounts();
  if(!accts.length){ finModal(`<div class="fin-form-title">还没有账户</div><div class="fin-empty sm">请先创建账户再设周期记账。</div><div class="fin-form-btns"><button class="ghost fx-btn" onclick="finCloseModal()">知道了</button></div>`); return; }
  const acctOpts = (sel)=> accts.map(a=>`<option value="${a.id}" ${a.id===sel?'selected':''}>${escH(a.name)} · ${a.currency}</option>`).join('');
  const freq = r ? r.frequency : 'monthly';
  finModal(`
    <div class="fin-form-title">${id?'编辑周期':'新周期记账'}</div>
    <input type="hidden" id="fin-rec-id" value="${id||''}">
    <div class="fin-seg" id="fin-rec-typeseg">${['expense','income','transfer'].map(k=>`<button type="button" class="fin-seg-btn ${k===type?'active':''}" data-type="${k}" onclick="finRecSetType('${k}')">${k==='expense'?'支出':k==='income'?'收入':'转账'}</button>`).join('')}</div>
    <input type="hidden" id="fin-rec-type" value="${type}">
    <div class="fin-field"><label>名称</label><input id="fin-rec-name" type="text" placeholder="如 Netflix / 房租" value="${r?escH(r.name):''}"></div>
    <div class="fin-field"><label>金额 · <span class="fin-cur-suffix" id="fin-rec-curlabel"></span></label><input id="fin-rec-amount" type="number" step="0.01" inputmode="decimal" placeholder="0.00" value="${r?r.amount:''}"></div>
    <div class="fin-field" id="fin-rec-acct-wrap"><label id="fin-rec-acct-label">账户</label><select id="fin-rec-account" onchange="finRecAcctChanged()">${acctOpts(r?r.accountId:(accts[0]&&accts[0].id))}</select></div>
    <div class="fin-field" id="fin-rec-toacct-wrap" style="display:none;"><label>转入账户</label><select id="fin-rec-toaccount" onchange="finRecAcctChanged()">${acctOpts(r?r.toAccountId:(accts[1]?accts[1].id:accts[0].id))}</select></div>
    <div class="fin-field" id="fin-rec-cat-wrap"><label>分类</label><select id="fin-rec-category">${finRecCatOptions(type==='income'?'income':'expense', r&&r.categoryId)}</select></div>
    <div class="fin-field"><label>频率</label>
      <div class="fin-seg" id="fin-rec-freqseg">${[['daily','每日'],['weekly','每周'],['monthly','每月'],['yearly','每年']].map(([k,l])=>`<button type="button" class="fin-seg-btn ${k===freq?'active':''}" data-f="${k}" onclick="finRecSetFreq('${k}')">${l}</button>`).join('')}</div>
      <input type="hidden" id="fin-rec-freq" value="${freq}">
      <div class="field-row" style="margin-top:8px;align-items:center;gap:8px;"><span class="field-label">每隔</span><input id="fin-rec-interval" type="number" min="1" value="${r?r.intervalN:1}" style="flex:1;"><span class="field-label" id="fin-rec-intervalunit">${FIN_FREQ_UNIT[freq]}</span></div>
    </div>
    <div class="fin-field"><label>开始 / 下次日期</label><button type="button" class="fin-datebtn" onclick="finOpenCal('fin-rec-next')">📅 <span id="fin-rec-next-label">${finDateLabel(r?r.nextDate:TODAY)}</span></button><input type="hidden" id="fin-rec-next" value="${r?r.nextDate:TODAY}"></div>
    <div class="fin-field"><label>备注</label><input id="fin-rec-note" type="text" placeholder="可选…" value="${r?escH(r.note||''):''}"></div>
    <label class="fin-check"><input type="checkbox" id="fin-rec-active" ${(!r||r.active)?'checked':''}> 启用（暂停后不再自动入账）</label>
    <div class="fin-form-btns">
      ${id?`<button class="ghost fx-btn danger" onclick="finDeleteRecurring('${id}')">删除</button>`:''}
      <button class="ghost fx-btn" onclick="finCloseModal()">取消</button>
      <button class="primary fx-btn" onclick="finSubmitRecurring()">保存</button>
    </div>
  `);
  finRecSetType(type, true);
}
function finRecSetType(type, keepCat){
  document.getElementById('fin-rec-type').value = type;
  document.querySelectorAll('#fin-rec-typeseg .fin-seg-btn').forEach(b=>b.classList.toggle('active', b.dataset.type===type));
  const isT = type==='transfer';
  document.getElementById('fin-rec-cat-wrap').style.display = isT?'none':'';
  document.getElementById('fin-rec-toacct-wrap').style.display = isT?'':'none';
  document.getElementById('fin-rec-acct-label').textContent = isT?'转出账户':'账户';
  if(!isT){
    const sel = keepCat ? (document.getElementById('fin-rec-category').value) : null;
    document.getElementById('fin-rec-category').innerHTML = finRecCatOptions(type==='income'?'income':'expense', sel);
  }
  finRecAcctChanged();
}
function finRecSetFreq(f){
  document.getElementById('fin-rec-freq').value = f;
  document.querySelectorAll('#fin-rec-freqseg .fin-seg-btn').forEach(b=>b.classList.toggle('active', b.dataset.f===f));
  document.getElementById('fin-rec-intervalunit').textContent = FIN_FREQ_UNIT[f];
}
function finRecAcctChanged(){
  const from = finAcct(document.getElementById('fin-rec-account').value);
  const lbl = document.getElementById('fin-rec-curlabel');
  if(lbl && from) lbl.textContent = from.currency;
}
function finSubmitRecurring(){
  const id = document.getElementById('fin-rec-id').value;
  const name = document.getElementById('fin-rec-name').value.trim();
  if(!name){ alert('请输入名称'); return; }
  const amount = Math.round((parseFloat(document.getElementById('fin-rec-amount').value)||0)*100)/100;
  if(amount<=0){ alert('请输入金额'); return; }
  const type = document.getElementById('fin-rec-type').value;
  const accountId = document.getElementById('fin-rec-account').value;
  const acct = finAcct(accountId);
  const rec = {
    name, type, amount, currency: acct?acct.currency:(S.fin.baseCurrency||'TWD'),
    accountId, toAccountId:null, toAmount:null, categoryId:null,
    note: document.getElementById('fin-rec-note').value.trim(), tags:[],
    frequency: document.getElementById('fin-rec-freq').value,
    intervalN: Math.max(1, parseInt(document.getElementById('fin-rec-interval').value)||1),
    nextDate: document.getElementById('fin-rec-next').value || TODAY,
    active: document.getElementById('fin-rec-active').checked,
  };
  if(type==='transfer'){
    rec.toAccountId = document.getElementById('fin-rec-toaccount').value;
    if(rec.accountId===rec.toAccountId){ alert('转出和转入账户不能相同'); return; }
    const from=acct, to=finAcct(rec.toAccountId);
    if(from&&to&&from.currency!==to.currency) rec.toAmount = amount;   // simple 1:1 default; edit the generated tx for exact fx
  } else {
    rec.categoryId = document.getElementById('fin-rec-category').value || null;
  }
  if(id){ rec.id=id; Object.assign(S.fin.recurring.find(x=>x.id===id), rec); }
  else { S.fin.recurring.push({ id:crypto.randomUUID(), sort:S.fin.recurring.length, ...rec }); }
  if(typeof finSaveRecurring==='function') finSaveRecurring();
  saveLSRaw('fin_recurring', S.fin.recurring);
  finCloseModal(); rFinance();
}
function finDeleteRecurring(id){
  if(!confirm('删除这个周期记账？已生成的流水不受影响。')) return;
  S.fin.recurring = S.fin.recurring.filter(r=>r.id!==id);
  if(typeof finSaveRecurring==='function') finSaveRecurring();
  saveLSRaw('fin_recurring', S.fin.recurring);
  finCloseModal(); rFinance();
}

/* ════════════ MORE ════════════ */
function finRenderMore(){
  // App lock (security) — global, but managed here
  let h = (typeof appLockSettingsHtml==='function') ? appLockSettingsHtml() : '';

  // Search
  h += `<div class="fin-more-sec">
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

  // Savings goals
  h += finGoalsBlockHtml();

  // Recurring
  h += finRecurringBlockHtml();

  // Tags
  const tags = finAllTags();
  h += `<div class="fin-more-sec">
    <div class="fin-more-head">标签</div>
    ${tags.length
      ? `<div class="fin-tag-list">${tags.map(tg=>`<span class="fin-tag-chip">
          <span class="fin-tag-name" onclick="finSearchTag('${escH(tg)}')">#${escH(tg)} <i>${finTagCount(tg)}</i></span>
          <button class="fin-tag-act" onclick="finRenameTag('${escH(tg)}')" title="重命名">✎</button>
          <button class="fin-tag-act danger" onclick="finDeleteTag('${escH(tg)}')" title="删除">✕</button>
        </span>`).join('')}</div>`
      : '<div class="fin-empty sm">还没有标签。记账时在「标签」栏添加，比分类更细。</div>'}
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

  // Export
  h += `<div class="fin-more-sec">
    <div class="fin-more-head">导出</div>
    <div class="fin-export-row">
      <button class="ghost fx-btn" onclick="finExportCSV('month')">本月 CSV</button>
      <button class="ghost fx-btn" onclick="finExportCSV('year')">本年 CSV</button>
    </div>
    <div class="fin-fx-note" style="margin-top:8px;">在浏览器本地生成，可用 Excel 打开做深度复盘。</div>
  </div>`;
  return h;
}

/* ── CSV export (Phase 2-D) — user-initiated download of their own data ── */
function finExportCSV(scope){
  const base = S.fin.baseCurrency||'TWD';
  let txs, tag;
  if(scope==='year'){ tag=TODAY.slice(0,4); txs=S.fin.transactions.filter(t=>String(t.date).slice(0,4)===tag); }
  else { tag=TODAY.slice(0,7); txs=S.fin.transactions.filter(t=>String(t.date).slice(0,7)===tag); }
  txs = txs.slice().sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:0);
  const esc = s => { s=String(s==null?'':s); return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
  const header = ['日期','类型','分类','账户','转入账户','金额','币种',`金额(${base})`,'备注','标签'];
  const lines = txs.map(t=>{
    const typeL = t.type==='income'?'收入':t.type==='expense'?'支出':'转账';
    const c=finCat(t.categoryId), a=finAcct(t.accountId), to=finAcct(t.toAccountId);
    return [t.date, typeL, c?c.name:'', a?a.name:'', to?to.name:'', t.amount, t.currency,
      finToBase(t.amount,t.currency).toFixed(2), t.note||'', (t.tags||[]).join(';')].map(esc).join(',');
  });
  const csv = '﻿' + [header.map(esc).join(','), ...lines].join('\n');   // BOM → Excel reads UTF-8
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `cyrus-finance-${tag}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
  finToast(`已导出 ${txs.length} 笔 · ${tag}`);
}
function finSetRate(c, v){
  v = parseFloat(v); if(!isFinite(v)||v<=0) return;
  S.fin.fxRates = { ...(S.fin.fxRates||{}), [c]:v };
  if(typeof saveFinConfig==='function') saveFinConfig();
  rFinance();
}
let _finSearchT = null;
function finDoSearch(q){
  finUI.search = q;
  // debounce the filter+render so each keystroke doesn't re-scan the whole ledger
  clearTimeout(_finSearchT);
  _finSearchT = setTimeout(()=>{
    const el = document.getElementById('fin-search-results');
    if(el) el.innerHTML = finSearchResults();
  }, 150);
}
function finSearchResults(){
  const q = finUI.search.trim().toLowerCase();
  if(!q) return '';
  const hits = S.fin.transactions.filter(t=>{
    const c = finCat(t.categoryId);
    return (t.note&&t.note.toLowerCase().includes(q))
      || (c&&c.name.toLowerCase().includes(q))
      || String(t.amount).includes(q)
      || (t.tags||[]).some(tg=>tg.toLowerCase().includes(q));
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
  const card = document.getElementById('fin-modal-card');
  // Mobile: swipe down on the sheet to dismiss (bound once; #fin-modal ships in index.html)
  if(card && !card.dataset.swipeBound){
    card.dataset.swipeBound = '1';
    let sy=null, sx=null, st=0;
    card.addEventListener('touchstart', e=>{ const t=e.changedTouches[0]; sy=t.clientY; sx=t.clientX; st=card.scrollTop; }, {passive:true});
    card.addEventListener('touchend', e=>{
      if(sy==null) return;
      const t=e.changedTouches[0], dy=t.clientY-sy, dx=t.clientX-sx; sy=null;
      if(dy>80 && Math.abs(dy)>Math.abs(dx)*1.5 && st<=0){ finWiz.active ? finWizCancel() : finCloseModal(); }
    }, {passive:true});
  }
  card.innerHTML = html;
  m.classList.add('open');
}
function finCloseModal(){ const m=document.getElementById('fin-modal'); if(m) m.classList.remove('open'); finWiz.active=false; }

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
  // Currency is NOT chosen separately — it always equals the selected account's currency.
  const defCur = t? t.currency : (accts[0]?accts[0].currency:'TWD');

  finModal(`
    <div class="fin-form-title">${txId?'编辑':'记一笔'}</div>
    <div class="fin-seg" id="fin-tx-typeseg">
      ${['expense','income','transfer'].map(k=>`<button class="fin-seg-btn ${k===type?'active':''}" data-type="${k}" onclick="finTxSetType('${k}')">${k==='expense'?'支出':k==='income'?'收入':'转账'}</button>`).join('')}
    </div>
    <input type="hidden" id="fin-tx-type" value="${type}">
    <input type="hidden" id="fin-tx-id" value="${txId||''}">

    <div class="fin-field">
      <label>金额 · <span class="fin-cur-suffix" id="fin-tx-curlabel">${defCur}</span></label>
      <input id="fin-tx-amount" type="number" step="0.01" inputmode="decimal" placeholder="0.00" value="${t?t.amount:''}" onkeydown="if(event.key==='Enter'){event.preventDefault();finSubmitTx();}">
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
      <label>转入金额 · <span id="fin-tx-tocurlabel"></span> <span class="fin-hint-inline">（跨币种到账金额）</span></label>
      <input id="fin-tx-toamount" type="number" step="0.01" inputmode="decimal" placeholder="对方账户实际到账" value="${t&&t.toAmount!=null?t.toAmount:''}">
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
    <div class="fin-field">
      <label>标签 <span class="fin-hint-inline">比分类更细 · 空格或逗号分隔</span></label>
      <input id="fin-tx-tags" type="text" placeholder="如 跟朋友聚餐 报销…" value="${t&&t.tags?escH(t.tags.join(' ')):''}" list="fin-tags-list">
      <datalist id="fin-tags-list">${finAllTags().map(tg=>`<option value="${escH(tg)}"></option>`).join('')}</datalist>
    </div>

    <div class="fin-form-btns">
      ${txId?`<button class="ghost fx-btn danger" onclick="finDeleteTxConfirm('${txId}')">删除</button>`:''}
      <button class="ghost fx-btn" onclick="finCloseModal()">取消</button>
      <button class="primary fx-btn" onclick="finSubmitTx()">保存</button>
    </div>
  `);
  finTxSetType(type, true);
  if(t&&t.categoryId) finRenderCatGrid(t.categoryId);
  // Auto-focus the amount field so you can type immediately (esp. via ↑/↓/Shift+→ shortcuts)
  setTimeout(()=>{ const el=document.getElementById('fin-tx-amount'); if(el){ el.focus(); el.select&&el.select(); } }, 60);
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
  // Currency follows the selected account — keep the amount-field label in sync.
  const type = document.getElementById('fin-tx-type').value;
  const from = finAcct(document.getElementById('fin-tx-account').value);
  const curLbl = document.getElementById('fin-tx-curlabel');
  if(curLbl && from) curLbl.textContent = from.currency;
  const wrap = document.getElementById('fin-tx-toamt-wrap');
  if(type!=='transfer'){ if(wrap) wrap.style.display='none'; return; }
  // Transfer: "to amount" only shown for cross-currency moves
  const to = finAcct(document.getElementById('fin-tx-toaccount').value);
  const toLbl = document.getElementById('fin-tx-tocurlabel');
  if(toLbl && to) toLbl.textContent = to.currency;
  if(wrap) wrap.style.display = (from&&to&&from.currency!==to.currency)?'':'none';
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
  const date = document.getElementById('fin-tx-date').value || TODAY;
  const note = document.getElementById('fin-tx-note').value.trim();
  const id = document.getElementById('fin-tx-id').value;

  // Currency is derived from the account (NOT a separate field) so it can never
  // disagree with the account and break the balance math.
  const tags = finParseTags(document.getElementById('fin-tx-tags') ? document.getElementById('fin-tx-tags').value : '');
  const tx = { type, amount, currency:(S.fin.baseCurrency||'TWD'), date, note, tags,
    accountId:null, toAccountId:null, toAmount:null, categoryId:null };

  if(type==='transfer'){
    tx.accountId = document.getElementById('fin-tx-account').value;
    tx.toAccountId = document.getElementById('fin-tx-toaccount').value;
    if(tx.accountId===tx.toAccountId){ alert('转出和转入账户不能相同'); return; }
    const from=finAcct(tx.accountId), to=finAcct(tx.toAccountId);
    tx.currency = from ? from.currency : tx.currency;     // transfer amount is in the from-account currency
    if(from&&to&&from.currency!==to.currency){
      const ta=parseFloat(document.getElementById('fin-tx-toamount').value);
      tx.toAmount = isFinite(ta)&&ta>0 ? Math.round(ta*100)/100 : amount;
    }
  } else {
    tx.accountId = document.getElementById('fin-tx-account').value;
    const acct = finAcct(tx.accountId);
    tx.currency = acct ? acct.currency : tx.currency;     // income/expense currency = account currency
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
  if(window.Sfx) Sfx.save();
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
    <div class="fin-field"><label>年利率 % <span class="fin-hint-inline">储蓄账户填写 · 每月 1 号自动计入利息</span></label><input id="fin-acct-rate" type="number" step="0.001" min="0" inputmode="decimal" placeholder="0（不计息）" value="${a&&a.interestRate?a.interestRate:''}"></div>
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
  const interestRate = Math.max(0, parseFloat(document.getElementById('fin-acct-rate').value)||0);
  const isLiability = document.getElementById('fin-acct-liab').checked;
  if(id){
    const a = finAcct(id);
    Object.assign(a, { name, type, currency, initialBalance, interestRate, isLiability });
  } else {
    S.fin.accounts.push({ id:crypto.randomUUID(), name, type, currency, initialBalance, interestRate,
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
      // don't clobber the More tab — or an input the user is typing into — when the
      // async FX refresh lands; only repaint when nothing is focused
      if(finUI.open && finUI.tab==='more'){
        const ae = document.activeElement;
        if(!(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))) rFinance();
      }
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
function finOpenCal(targetId, onPick){
  const hidden = document.getElementById(targetId);
  const cur = (hidden && hidden.value) ? hidden.value : TODAY;
  finCal.targetId = targetId;
  finCal.onPick = onPick || null;
  finCal.selected = cur;
  finCal.ym = cur.slice(0,7);
  finCalShow(finCalHtml());
}
function finCalShow(html){
  let o = document.getElementById('fin-cal');
  if(!o){
    o = document.createElement('div'); o.id='fin-cal'; o.className='fin-cal';
    o.addEventListener('click', e=>{ if(e.target===o) finCalCancel(); });
    let cy=null, cx=null;
    o.addEventListener('touchstart', e=>{ const t=e.changedTouches[0]; cy=t.clientY; cx=t.clientX; }, {passive:true});
    o.addEventListener('touchend', e=>{
      if(cy==null) return;
      const t=e.changedTouches[0], dy=t.clientY-cy, dx=t.clientX-cx; cy=null;
      if(dy>70 && Math.abs(dy)>Math.abs(dx)*1.5) finCalCancel();   // swipe down to dismiss
    }, {passive:true});
    // Mount on body (not #finance-view) so the themed calendar is reusable
    // app-wide — todo/academic forms on the main page use it too.
    document.body.appendChild(o);
  }
  o.innerHTML = html;
  o.classList.add('open');
}
function finCloseCal(){ const o=document.getElementById('fin-cal'); if(o) o.classList.remove('open'); }
/* Cancel = dismiss without picking; aborts the wizard if it was mid date-step. */
function finCalCancel(){ finCloseCal(); if(finWiz.active && finWiz.step==='date') finWizCancel(); }
/* Keyboard nav inside the calendar popup. */
function finCalKey(e){
  if(e.key==='Escape'){ e.preventDefault(); finCalCancel(); return; }
  if(e.key==='Enter'){ e.preventDefault(); finPickDate(finCal.selected); return; }
  let d=0;
  if(e.key==='ArrowLeft') d=-1;
  else if(e.key==='ArrowRight') d=1;
  else if(e.key==='ArrowUp') d=-7;
  else if(e.key==='ArrowDown') d=7;
  if(d){ e.preventDefault(); finCalMove(d); }
}
function finCalMove(d){
  const dt = new Date(finCal.selected+'T00:00:00');
  dt.setDate(dt.getDate()+d);
  finCal.selected = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  finCal.ym = finCal.selected.slice(0,7);
  finCalShow(finCalHtml());
}
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
      <button class="ghost fx-btn" onclick="finCalCancel()">取消</button>
    </div>
  </div>`;
}
function finPickDate(ds){
  const hidden = document.getElementById(finCal.targetId);
  if(hidden) hidden.value = ds;
  const lbl = document.getElementById(finCal.targetId+'-label');
  if(lbl) lbl.textContent = finDateLabel(ds);
  const cb = finCal.onPick; finCal.onPick = null;
  finCloseCal();
  if(cb) cb(ds);
}

/* ════════════ keyboard quick-entry wizard (↑ income / ↓ expense) ════════════
   account (↑↓ + Enter) → amount (type + Enter) → calendar (Enter / arrows)
   → note (type, Enter = save). Category is left blank for speed. */
function finWizTitle(){ return finWiz.type==='income' ? '记一笔收入' : finWiz.type==='transfer' ? '转账' : '记一笔支出'; }
function finWizAccts(){ return finSelectableAccounts(); }
function finWizCats(){ return S.fin.categories.filter(c=>c.kind===finWiz.type && !c.archived); }
function finWizToList(){ return finWizAccts().filter(x=>x.id!==finWiz.fromAccountId); }  // can't transfer to itself
function finWizStart(type){
  const accts = finWizAccts();
  if(type==='transfer'){
    if(accts.length<2){ finOpenTxForm(null,'transfer'); return; }  // need 2 accounts → fall back to full form
    finWiz.active=true; finWiz.type='transfer'; finWiz.step='tfrom';
    finWiz.fromIdx=0; finWiz.toIdx=0; finWiz.fromAccountId=null; finWiz.toAccountId=null; finWiz.toAmount=null;
    finWiz.amount=null; finWiz.date=TODAY; finWiz.note='';
    finWizRender(); return;
  }
  if(!accts.length){ finOpenTxForm(null, type); return; }  // no accounts → full form prompts to create one
  finWiz.active=true; finWiz.type=type; finWiz.step='account';
  finWiz.accountIdx=0; finWiz.accountId=null;
  finWiz.catIdx=0; finWiz.categoryId=null;
  finWiz.amount=null; finWiz.date=TODAY; finWiz.note='';
  finWizRender();
}
function finWizCancel(){ finWiz.active=false; finCloseCal(); finCloseModal(); }
/* Shared renderer for an account-picker step (account / tfrom / tto). */
function finWizAcctPicker(title, list, activeIdx, pickFn){
  finModal(`<div class="fin-wiz">
    <div class="fin-wiz-head">${title}</div>
    <div class="fin-wiz-accts">
      ${list.map((x,i)=>`<button type="button" class="fin-wiz-acct ${i===activeIdx?'active':''}" onclick="${pickFn}(${i})">
        <span class="fin-wiz-acct-name">${escH(x.name)}</span>
        <span class="fin-wiz-cur">${x.currency}</span></button>`).join('') || '<div class="fin-empty sm">无可用账户</div>'}
    </div>
    <div class="fin-wiz-hint">↑↓ 选择 · Enter 确认 · Esc 取消</div>
  </div>`);
}
function finWizRender(){
  const a = finAcct(finWiz.accountId);
  const isTfer = finWiz.type==='transfer';
  const from = finAcct(finWiz.fromAccountId), to = finAcct(finWiz.toAccountId);
  // amount-side account (income/expense = chosen account; transfer = from-account)
  const amtAcct = isTfer ? from : a;
  if(finWiz.step==='account'){
    finWizAcctPicker(`${finWizTitle()} · 选择账户`, finWizAccts(), finWiz.accountIdx, 'finWizPick');
  } else if(finWiz.step==='tfrom'){
    finWizAcctPicker('转账 · 转出账户', finWizAccts(), finWiz.fromIdx, 'finWizPickFrom');
  } else if(finWiz.step==='tto'){
    finWizAcctPicker('转账 · 转入账户', finWizToList(), finWiz.toIdx, 'finWizPickTo');
  } else if(finWiz.step==='amount'){
    finModal(`<div class="fin-wiz">
      <div class="fin-wiz-head">${finWizTitle()} · 金额 · <span class="fin-cur-suffix">${amtAcct?amtAcct.currency:''}</span></div>
      <input id="fin-wiz-amount" class="fin-wiz-amount" type="number" step="0.01" inputmode="decimal" placeholder="0.00" value="${finWiz.amount!=null?finWiz.amount:''}">
      <div class="fin-wiz-line">${isTfer ? `${from?escH(from.name):''} → ${to?escH(to.name):''}` : `账户：${a?escH(a.name):''}`}</div>
      <div class="fin-wiz-hint">输入金额 · Enter 下一步</div>
    </div>`);
    setTimeout(()=>{ const el=document.getElementById('fin-wiz-amount'); if(el){ el.focus(); el.select&&el.select(); } }, 60);
  } else if(finWiz.step==='toamount'){
    finModal(`<div class="fin-wiz">
      <div class="fin-wiz-head">转账 · 转入金额 · <span class="fin-cur-suffix">${to?to.currency:''}</span></div>
      <input id="fin-wiz-toamount" class="fin-wiz-amount" type="number" step="0.01" inputmode="decimal" placeholder="对方实际到账" value="${finWiz.toAmount!=null?finWiz.toAmount:''}">
      <div class="fin-wiz-line">${from?escH(from.name):''} 付 ${from?from.currency:''} ${finWiz.amount} → ${to?escH(to.name):''}</div>
      <div class="fin-wiz-hint">跨币种到账金额 · Enter 下一步</div>
    </div>`);
    setTimeout(()=>{ const el=document.getElementById('fin-wiz-toamount'); if(el){ el.focus(); el.select&&el.select(); } }, 60);
  } else if(finWiz.step==='category'){
    const cats = finWizCats();
    finModal(`<div class="fin-wiz">
      <div class="fin-wiz-head">${finWizTitle()} · 选择分类</div>
      <div class="fin-wiz-accts">
        ${cats.map((c,i)=>`<button type="button" class="fin-wiz-acct ${i===finWiz.catIdx?'active':''}" onclick="finWizPickCat(${i})">
          <span class="fin-wiz-acct-name"><span class="fin-wiz-catico" style="${c.color?`background:${c.color}22;`:''}">${c.icon||'•'}</span> ${escH(c.name)}</span></button>`).join('')}
        <button type="button" class="fin-wiz-acct ${finWiz.catIdx===cats.length?'active':''}" onclick="finWizPickCat(${cats.length})">
          <span class="fin-wiz-acct-name fin-wiz-skip">（跳过 · 不分类）</span></button>
      </div>
      <div class="fin-wiz-hint">↑↓ 选择 · Enter 确认 · Esc 取消</div>
    </div>`);
  } else if(finWiz.step==='date'){
    finModal(`<div class="fin-wiz">
      <div class="fin-wiz-head">${finWizTitle()} · 日期</div>
      <div class="fin-wiz-summary">${finWizSummary()}</div>
      <input type="hidden" id="fin-wiz-date" value="${finWiz.date}">
      <div class="fin-wiz-hint">日历中 ←→ 改日 · ↑↓ 改周 · Enter 确认</div>
    </div>`);
    finOpenCal('fin-wiz-date', finWizDatePicked);
  } else if(finWiz.step==='note'){
    finModal(`<div class="fin-wiz">
      <div class="fin-wiz-head">${finWizTitle()} · 备注（可选）</div>
      <input id="fin-wiz-note" class="fin-wiz-note" type="text" placeholder="可留空…" value="${escH(finWiz.note||'')}">
      <div class="fin-wiz-summary">${finWizSummary()} · ${finDateLabel(finWiz.date)}</div>
      <div class="fin-wiz-hint">Enter 完成记账</div>
    </div>`);
    setTimeout(()=>{ const el=document.getElementById('fin-wiz-note'); if(el) el.focus(); }, 60);
  }
}
function finWizSummary(){
  if(finWiz.type==='transfer'){
    const from=finAcct(finWiz.fromAccountId), to=finAcct(finWiz.toAccountId);
    return `${from?escH(from.name):''} → ${to?escH(to.name):''} · ${from?from.currency:''} ${finWiz.amount}`;
  }
  const a=finAcct(finWiz.accountId), c=finCat(finWiz.categoryId);
  return `${a?escH(a.name):''} · ${a?a.currency:''} ${finWiz.amount}${c?' · '+escH(c.name):''}`;
}
function finWizMove(d){
  let list, key;
  if(finWiz.step==='account'){ list=finWizAccts(); key='accountIdx'; }
  else if(finWiz.step==='tfrom'){ list=finWizAccts(); key='fromIdx'; }
  else if(finWiz.step==='tto'){ list=finWizToList(); key='toIdx'; }
  else if(finWiz.step==='category'){ const n=finWizCats().length+1; finWiz.catIdx=(finWiz.catIdx+d+n)%n; finWizRender(); return; }
  else return;
  const n=list.length; if(!n) return;
  finWiz[key]=(finWiz[key]+d+n)%n;
  finWizRender();
}
function finWizPick(i){ finWiz.accountIdx=i; finWizChooseAccount(); }
function finWizChooseAccount(){
  const a = finWizAccts()[finWiz.accountIdx]; if(!a) return;
  finWiz.accountId = a.id; finWiz.step='amount'; finWizRender();
}
function finWizPickFrom(i){ finWiz.fromIdx=i; finWizChooseFrom(); }
function finWizChooseFrom(){
  const a = finWizAccts()[finWiz.fromIdx]; if(!a) return;
  finWiz.fromAccountId = a.id; finWiz.toIdx=0; finWiz.step='tto'; finWizRender();
}
function finWizPickTo(i){ finWiz.toIdx=i; finWizChooseTo(); }
function finWizChooseTo(){
  const a = finWizToList()[finWiz.toIdx]; if(!a) return;
  finWiz.toAccountId = a.id; finWiz.step='amount'; finWizRender();
}
function finWizAmountNext(){
  const el = document.getElementById('fin-wiz-amount');
  const v = parseFloat(el ? el.value : '');
  if(!isFinite(v) || v<=0){ if(el){ el.classList.add('shake'); setTimeout(()=>el.classList.remove('shake'),400); el.focus(); } return; }
  finWiz.amount = Math.round(v*100)/100;
  if(finWiz.type==='transfer'){
    const from=finAcct(finWiz.fromAccountId), to=finAcct(finWiz.toAccountId);
    if(from && to && from.currency!==to.currency){ finWiz.step='toamount'; finWizRender(); }
    else { finWiz.toAmount=null; finWiz.step='date'; finWizRender(); }
  } else {
    finWiz.step='category'; finWiz.catIdx=0; finWizRender();
  }
}
function finWizToAmountNext(){
  const el = document.getElementById('fin-wiz-toamount');
  const v = parseFloat(el ? el.value : '');
  finWiz.toAmount = (isFinite(v) && v>0) ? Math.round(v*100)/100 : finWiz.amount;
  finWiz.step='date'; finWizRender();
}
function finWizPickCat(i){ finWiz.catIdx=i; finWizChooseCategory(); }
function finWizChooseCategory(){
  const cats = finWizCats();
  finWiz.categoryId = finWiz.catIdx < cats.length ? cats[finWiz.catIdx].id : null;  // last index = skip
  finWiz.step='date';
  finWizRender();   // opens the calendar via finOpenCal('fin-wiz-date', ...)
}
function finWizDatePicked(ds){
  finWiz.date = ds || TODAY;
  finWiz.step='note';
  finWizRender();
}
function finWizKey(e){
  if(e.key==='Escape'){ e.preventDefault(); finWizCancel(); return; }
  const listStep = ['account','tfrom','tto','category'].includes(finWiz.step);
  if(listStep){
    if(e.key==='ArrowDown'){ e.preventDefault(); finWizMove(1); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); finWizMove(-1); }
    else if(e.key==='Enter'){ e.preventDefault();
      if(finWiz.step==='account') finWizChooseAccount();
      else if(finWiz.step==='tfrom') finWizChooseFrom();
      else if(finWiz.step==='tto') finWizChooseTo();
      else if(finWiz.step==='category') finWizChooseCategory();
    }
    return;
  }
  if(e.key==='Enter'){
    e.preventDefault();
    if(finWiz.step==='amount') finWizAmountNext();
    else if(finWiz.step==='toamount') finWizToAmountNext();
    else if(finWiz.step==='note') finWizSave();
  }
}
async function finWizSave(){
  const noteEl = document.getElementById('fin-wiz-note');
  const note = noteEl ? noteEl.value.trim() : '';
  let tx, toastLabel;
  if(finWiz.type==='transfer'){
    const from = finAcct(finWiz.fromAccountId), to = finAcct(finWiz.toAccountId);
    const cross = from && to && from.currency!==to.currency;
    tx = {
      type:'transfer', amount: finWiz.amount,
      currency: from ? from.currency : (S.fin.baseCurrency||'TWD'),
      date: finWiz.date || TODAY, note, tags:[],
      accountId: finWiz.fromAccountId, toAccountId: finWiz.toAccountId,
      toAmount: cross ? (finWiz.toAmount!=null?finWiz.toAmount:finWiz.amount) : null,
      categoryId: null,
    };
    toastLabel = `转账 ${tx.currency} ${finNum(tx.amount)}`;
  } else {
    const a = finAcct(finWiz.accountId);
    tx = {
      type: finWiz.type, amount: finWiz.amount,
      currency: a ? a.currency : (S.fin.baseCurrency||'TWD'),
      date: finWiz.date || TODAY, note, tags:[],
      accountId: finWiz.accountId, toAccountId:null, toAmount:null, categoryId: finWiz.categoryId || null,
    };
    toastLabel = `${tx.type==='income'?'收入':'支出'} ${tx.currency} ${finNum(tx.amount)}`;
  }
  finWiz.active=false;
  finCloseModal();
  const saved = await finAddTx(tx);
  const newId = saved ? saved.id : crypto.randomUUID();
  S.fin.transactions.unshift({ id:newId, created:new Date().toISOString(), ...tx });
  saveLSRaw('fin_transactions', S.fin.transactions);
  if(window.Sfx) Sfx.save();
  rFinance();
  finToast(`已记一笔 · ${toastLabel}`);
}
function finToast(msg){
  let t = document.getElementById('fin-toast');
  if(!t){ t=document.createElement('div'); t.id='fin-toast'; t.className='fin-toast'; document.getElementById('finance-view').appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 1800);
}
