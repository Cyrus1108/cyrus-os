/* Sync layer — pull on auth, push after every local save, Realtime for cross-device.
   Push is fire-and-forget; failures are logged but don't block the UI.
   Push functions await pullAllPromise so writes that fire before initial pull completes
   still execute (after pull). Supabase v2 returns {error} — we log it, not try/catch. */

let realtimeChannel = null;
let initialPullDone = false;
let pullAllPromise = null;

function logIfError(label, res){
  if(res && res.error){
    console.error(`[sync] ${label}`, res.error);
  }
}
async function waitForPull(){
  if(pullAllPromise){
    try{ await pullAllPromise; }catch(e){}
  }
}

/* ════════════ PULL ════════════ */

async function pullSettings(){
  const { data } = await sb.from('settings').select('*')
    .eq('user_id', currentUser.id).maybeSingle();
  if(!data) return;
  // Mirror to localStorage so loadLS() keeps working (creed.js etc. read via loadLS)
  if(data.creed_idx != null) saveLSRaw('creed_idx', data.creed_idx);
  if(data.creed_open != null) saveLSRaw('creed_open', data.creed_open);
  if(data.show_done != null) saveLSRaw('show_done', data.show_done);
  if(data.symbols != null){
    saveLSRaw('symbols', data.symbols);
    S.symbols = data.symbols;
  }
  if(data.subjects != null){
    saveLSRaw('subjects', data.subjects);
    S.subjects = data.subjects;
  }
  if(data.notif_banner_dismissed != null) saveLSRaw('notif_banner_dismissed', data.notif_banner_dismissed);
  if(data.theme != null){ saveLSRaw('theme', data.theme); if(typeof applyTheme === 'function') applyTheme(data.theme, false); }
  if(data.fin_base_currency != null) S.fin.baseCurrency = data.fin_base_currency;
  if(data.fin_fx_rates != null) S.fin.fxRates = { TWD:1, ...data.fin_fx_rates };
}

async function pullMorning(){
  const { data } = await sb.from('morning').select('*')
    .eq('user_id', currentUser.id).eq('date', TODAY).maybeSingle();
  if(data && data.list){
    S.mr = { date: data.date, list: data.list };
  } else {
    // No row for today — reset to default (carries over yesterday's custom items, all undone)
    S.mr.list = S.mr.list.map(i=>({...i, d:false}));
    S.mr.date = TODAY;
  }
  if(cleanMorning()) saveMR();
}

async function pullAcademics(){
  // Don't .order('position') here — if the column doesn't exist yet the query
  // errors and returns null, blanking the panel. rAC sorts by position in JS.
  const { data } = await sb.from('academics').select('*')
    .eq('user_id', currentUser.id);
  S.ac = (data || []).map(r => ({
    id: r.id, sub: r.sub, name: r.name,
    date: r.date,
    // Postgres time returns 'HH:MM:SS' — normalize to 'HH:MM' so existing UI code that does `${time}:00` works
    time: r.time ? r.time.slice(0,5) : null,
    pri: r.pri,
    remind: r.remind || 0, done: r.done,
    position: r.position || 0,
  }));
}

async function pullJapanese(){
  const { data } = await sb.from('japanese').select('*')
    .eq('user_id', currentUser.id).maybeSingle();
  if(data){
    S.jp = {
      streak: data.streak || 0,
      last: data.last_date || null,
      log: data.log || {},
      note: data.note || '',
      list: data.list || JSON.parse(JSON.stringify(DEF_JP)),
    };
  }
}

async function pullTrading(){
  const { data } = await sb.from('trading').select('*')
    .eq('user_id', currentUser.id).eq('date', TODAY).maybeSingle();
  if(data){
    S.tr = { date: data.date, bias: data.bias || '', list: data.list };
  } else {
    S.tr.list = S.tr.list.map(i=>({...i, d:false}));
    S.tr.date = TODAY;
    S.tr.bias = '';
  }
}

async function pullCategories(){
  const { data } = await sb.from('categories').select('*')
    .eq('user_id', currentUser.id).order('created_at');
  if(data && data.length){
    S.cats = data.map(c => ({ id: c.id, name: c.name }));
  }
  // If empty, leave S.cats as DEFAULT_CATS — they'll get pushed on next write
}

async function pullThe90Meta(){
  if(typeof ensureThe90Defaults === 'function') ensureThe90Defaults();
  const { data } = await sb.from('the90_meta').select('*')
    .eq('user_id', currentUser.id).maybeSingle();
  if(data){
    S.the90.meta = {
      startDate: data.start_date,
      endDate: data.end_date,
      targets: data.targets,
      currentPhase: data.current_phase || 'standardize',
    };
  } else {
    // No meta yet — push the defaults so other devices see them
    if(typeof saveThe90Meta === 'function') saveThe90Meta();
  }
}

async function pullThe90Daily(){
  if(typeof ensureThe90Defaults === 'function') ensureThe90Defaults();
  // Only fetch the last 95 days (covers entire 90-day window + buffer)
  const since = new Date(Date.now() - 95 * 86400000).toISOString().slice(0,10);
  const { data } = await sb.from('the90_daily').select('*')
    .eq('user_id', currentUser.id).gte('date', since);
  S.the90.daily = {};
  for(const row of (data || [])){
    S.the90.daily[row.date] = { scores: row.scores || {}, note: row.note || '' };
  }
}

async function pullTodos(){
  // Don't .order('position') here — see pullAcademics note. rTodos sorts in JS.
  const { data } = await sb.from('todos').select('*')
    .eq('user_id', currentUser.id);
  S.todos = (data || []).map(r => ({
    id: r.id, text: r.text, cat: r.cat_id,
    date: r.date,
    // Postgres time returns 'HH:MM:SS' — normalize to 'HH:MM' so existing UI code that does `${time}:00` works
    time: r.time ? r.time.slice(0,5) : null,
    pri: r.pri,
    remind: r.remind || 0,
    repeat: r.repeat || 'none',
    customDays: r.custom_days || 0,
    done: r.done,
    doneAt: r.done_at ? new Date(r.done_at).getTime() : null,
    created: r.created_at ? r.created_at.slice(0,10) : TODAY,
    position: r.position || 0,
  }));
}

async function pullHermes(){
  // Only un-dismissed notices; cap to a sane number, newest first.
  const { data } = await sb.from('hermes_notices').select('*')
    .eq('user_id', currentUser.id)
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  S.hermes = (data || []).map(r => ({
    id: r.id,
    text: r.text,
    kind: r.kind || 'insight',
    createdAt: r.created_at ? new Date(r.created_at).getTime() : null,
    dismissedAt: r.dismissed_at ? new Date(r.dismissed_at).getTime() : null,
  }));
}

/* ════════════ Finance (Phase 1) ════════════
   accounts + categories are small (replace-all on edit, like categories/todos).
   transactions can grow, so they use targeted single-row insert/update/delete
   (finAddTx/finUpdateTx/finDeleteTx) instead of replace-all — never re-uploads
   the whole ledger. Balances are derived in JS (initial_balance + sum of tx). */
async function pullFinAccounts(){
  const { data } = await sb.from('fin_accounts').select('*').eq('user_id', currentUser.id);
  S.fin.accounts = (data || []).map(r => ({
    id:r.id, name:r.name, type:r.type, currency:r.currency,
    initialBalance:Number(r.initial_balance)||0,
    isLiability:!!r.is_liability, status:r.status, icon:r.icon, color:r.color,
    sort:r.sort||0, created:r.created_at,
  }));
  saveLSRaw('fin_accounts', S.fin.accounts);
}
async function pullFinCategories(){
  const { data } = await sb.from('fin_categories').select('*').eq('user_id', currentUser.id);
  S.fin.categories = (data || []).map(r => ({
    id:r.id, name:r.name, kind:r.kind, icon:r.icon, color:r.color,
    archived:!!r.archived, sort:r.sort||0, created:r.created_at,
  }));
  saveLSRaw('fin_categories', S.fin.categories);
}
async function pullFinTransactions(){
  // Phase 1: pull all (personal volume is small + wallet balances need the full sum).
  // Phase 3 introduces a balances RPC + snapshots so we can window this by month.
  const { data } = await sb.from('fin_transactions').select('*')
    .eq('user_id', currentUser.id).order('date', { ascending:false });
  S.fin.transactions = (data || []).map(r => ({
    id:r.id, date:r.date, type:r.type,
    amount:Number(r.amount)||0, currency:r.currency,
    accountId:r.account_id, toAccountId:r.to_account_id,
    toAmount:r.to_amount!=null?Number(r.to_amount):null,
    categoryId:r.category_id, note:r.note||'', tags:r.tags||[],
    created:r.created_at,
  }));
  saveLSRaw('fin_transactions', S.fin.transactions);
}

async function pullFinBudgets(){
  const { data } = await sb.from('fin_budgets').select('*').eq('user_id', currentUser.id).order('sort');
  S.fin.budgets = (data || []).map(r => ({
    id:r.id, name:r.name, limit:Number(r.amount_limit)||0, type:r.type,
    targets:r.target_categories||[], period:r.period||'monthly', sort:r.sort||0,
  }));
  saveLSRaw('fin_budgets', S.fin.budgets);
}
async function finSaveBudgets(){
  if(!currentUser) return;
  await waitForPull();
  await replaceTable('fin_budgets', S.fin.budgets, b => ({
    id:b.id, user_id:currentUser.id, name:b.name, amount_limit:b.limit||0,
    type:b.type, target_categories:b.targets||[], period:b.period||'monthly', sort:b.sort||0,
  }));
}

/* Persist base currency + FX rates (lives in the settings row). */
function saveFinConfig(){
  dirty.settings = true;
  if(typeof syncPushSettings === 'function') syncPushSettings();
}

async function pullAll(force){
  if(!currentUser) return;
  if(pullAllPromise && !force) return pullAllPromise;
  pullAllPromise = (async () => {
    try{
      await Promise.all([
        pullSettings(), pullMorning(), pullAcademics(),
        pullJapanese(), pullTrading(), pullCategories(), pullTodos(),
        pullThe90Meta(), pullThe90Daily(), pullHermes(),
        pullFinAccounts(), pullFinCategories(), pullFinTransactions(), pullFinBudgets(),
      ]);
      initialPullDone = true;
      console.log('[sync] initial pull complete');

      // If categories were empty in DB, replace 'c1'..'c4' with uuids and push so future devices see them
      if(S.cats.length && !String(S.cats[0].id).includes('-')){
        S.cats = S.cats.map(c => ({ id: crypto.randomUUID(), name: c.name }));
        saveCats();
      }
    } catch(e){
      console.error('[sync] pullAll', e);
    }
  })();
  return pullAllPromise;
}

/* ════════════ PUSH ════════════ */

async function syncPushSettings(){
  if(!currentUser) return;
  await waitForPull();
  const res = await sb.from('settings').upsert({
    user_id: currentUser.id,
    creed_idx: loadLS('creed_idx', 0),
    creed_open: loadLS('creed_open', false),
    show_done: loadLS('show_done', false),
    symbols: S.symbols,
    subjects: S.subjects,
    notif_banner_dismissed: loadLS('notif_banner_dismissed', false),
    theme: loadLS('theme', 'cappa'),
    fin_base_currency: S.fin.baseCurrency || 'TWD',
    fin_fx_rates: S.fin.fxRates || {TWD:1},
  });
  logIfError('push settings', res);
  if(!res.error) dirty.settings = false;
}

async function syncPushMorning(){
  if(!currentUser) return;
  await waitForPull();
  const res = await sb.from('morning').upsert({
    user_id: currentUser.id,
    date: S.mr.date || TODAY,
    list: S.mr.list,
  }, { onConflict: 'user_id,date' });
  logIfError('push morning', res);
  if(!res.error) dirty.morning = false;
}

async function syncPushJP(){
  if(!currentUser) return;
  await waitForPull();
  const res = await sb.from('japanese').upsert({
    user_id: currentUser.id,
    streak: S.jp.streak,
    last_date: S.jp.last || null,
    log: S.jp.log || {},
    note: S.jp.note || '',
    list: S.jp.list,
  });
  logIfError('push jp', res);
  if(!res.error) dirty.japanese = false;
}

async function syncPushTrading(){
  if(!currentUser) return;
  await waitForPull();
  const res = await sb.from('trading').upsert({
    user_id: currentUser.id,
    date: S.tr.date || TODAY,
    bias: S.tr.bias || '',
    list: S.tr.list,
  }, { onConflict: 'user_id,date' });
  logIfError('push trading', res);
  if(!res.error) dirty.trading = false;
}

/* Helper: replace-all sync (delete remote rows not in local, upsert local).
   Returns true if both delete+upsert succeeded (so caller can clear dirty flag). */
async function replaceTable(table, rows, mapFn){
  const localIds = rows.map(r => r.id);
  let delRes;
  if(localIds.length){
    // Postgrest expects: not.in.("id1","id2")
    const inList = '(' + localIds.map(id => `"${id}"`).join(',') + ')';
    delRes = await sb.from(table).delete().eq('user_id', currentUser.id).not('id', 'in', inList);
  } else {
    delRes = await sb.from(table).delete().eq('user_id', currentUser.id);
  }
  logIfError(`delete ${table}`, delRes);
  if(delRes.error) return false;
  if(rows.length){
    const upRes = await sb.from(table).upsert(rows.map(mapFn));
    logIfError(`upsert ${table}`, upRes);
    if(upRes.error) return false;
  }
  return true;
}

async function syncPushAcademics(){
  if(!currentUser) return;
  await waitForPull();
  const ok = await replaceTable('academics', S.ac, t => ({
    id: t.id, user_id: currentUser.id,
    sub: t.sub, name: t.name,
    date: t.date || null, time: t.time || null,
    pri: t.pri, remind: t.remind || 0, done: t.done,
    position: t.position || 0,
  }));
  if(ok) dirty.academics = false;
}

async function syncPushCategories(){
  if(!currentUser) return;
  await waitForPull();
  const ok = await replaceTable('categories', S.cats, c => ({
    id: c.id, user_id: currentUser.id, name: c.name,
  }));
  if(ok) dirty.categories = false;
}

async function syncPushThe90Meta(){
  if(!currentUser || !S.the90?.meta) return;
  await waitForPull();
  const m = S.the90.meta;
  const res = await sb.from('the90_meta').upsert({
    user_id: currentUser.id,
    start_date: m.startDate,
    end_date: m.endDate,
    targets: m.targets,
    current_phase: m.currentPhase || 'standardize',
  });
  if(!res.error) dirty.the90Meta = false;
  logIfError('push the90_meta', res);
}

async function syncPushThe90Daily(){
  if(!currentUser || !S.the90?.daily) return;
  await waitForPull();
  const day = S.the90.daily[TODAY];
  if(!day) return;
  const res = await sb.from('the90_daily').upsert({
    user_id: currentUser.id,
    date: TODAY,
    scores: day.scores || {},
    note: day.note || '',
  }, { onConflict: 'user_id,date' });
  if(!res.error) dirty.the90Daily = false;
  logIfError('push the90_daily', res);
}

async function syncPushTodos(){
  if(!currentUser) return;
  await waitForPull();
  const ok = await replaceTable('todos', S.todos, t => ({
    id: t.id, user_id: currentUser.id,
    text: t.text,
    cat_id: t.cat || null,
    date: t.date || null, time: t.time || null,
    pri: t.pri, remind: t.remind || 0,
    repeat: t.repeat || 'none',
    custom_days: t.customDays || 0,
    done: t.done,
    done_at: t.doneAt ? new Date(t.doneAt).toISOString() : null,
    position: t.position || 0,
  }));
  if(ok) dirty.todos = false;
}

/* Hermes notices are read+dismiss only on the client — no full push.
   Dismiss stamps dismissed_at; the row stays for history but drops off the panel. */
async function syncDismissHermes(id){
  if(!currentUser) return;
  await waitForPull();
  const res = await sb.from('hermes_notices')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('id', id).eq('user_id', currentUser.id);
  logIfError('dismiss hermes notice', res);
}

/* ── Finance writes ──
   Accounts/categories: replace-all (small sets; archive keeps rows local so they survive).
   Transactions: targeted single-row ops returning the server row (for its generated id). */
async function finSaveAccounts(){
  if(!currentUser) return;
  await waitForPull();
  await replaceTable('fin_accounts', S.fin.accounts, a => ({
    id:a.id, user_id:currentUser.id, name:a.name, type:a.type, currency:a.currency,
    initial_balance:a.initialBalance||0, is_liability:!!a.isLiability,
    status:a.status, icon:a.icon||null, color:a.color||null, sort:a.sort||0,
  }));
}
async function finSaveCategories(){
  if(!currentUser) return;
  await waitForPull();
  await replaceTable('fin_categories', S.fin.categories, c => ({
    id:c.id, user_id:currentUser.id, name:c.name, kind:c.kind,
    icon:c.icon||null, color:c.color||null, archived:!!c.archived, sort:c.sort||0,
  }));
}
async function finAddTx(tx){
  if(!currentUser) return null;
  await waitForPull();
  const { data, error } = await sb.from('fin_transactions').insert({
    user_id:currentUser.id, date:tx.date, type:tx.type,
    amount:tx.amount, currency:tx.currency,
    account_id:tx.accountId||null, to_account_id:tx.toAccountId||null,
    to_amount:tx.toAmount!=null?tx.toAmount:null,
    category_id:tx.categoryId||null, note:tx.note||null,
    tags:(tx.tags&&tx.tags.length)?tx.tags:null,
  }).select().single();
  logIfError('fin add tx', { error });
  return data;
}
async function finUpdateTx(tx){
  if(!currentUser) return null;
  await waitForPull();
  const { data, error } = await sb.from('fin_transactions').update({
    date:tx.date, type:tx.type, amount:tx.amount, currency:tx.currency,
    account_id:tx.accountId||null, to_account_id:tx.toAccountId||null,
    to_amount:tx.toAmount!=null?tx.toAmount:null,
    category_id:tx.categoryId||null, note:tx.note||null,
    tags:(tx.tags&&tx.tags.length)?tx.tags:null,
  }).eq('id', tx.id).eq('user_id', currentUser.id).select().single();
  logIfError('fin update tx', { error });
  return data;
}
async function finDeleteTx(id){
  if(!currentUser) return;
  await waitForPull();
  const res = await sb.from('fin_transactions').delete().eq('id', id).eq('user_id', currentUser.id);
  logIfError('fin delete tx', res);
}

/* ════════════ REALTIME ════════════ */

function subscribeRealtime(){
  if(realtimeChannel || !currentUser) return;
  const uid = currentUser.id;

  realtimeChannel = sb.channel('cyrus-os-' + uid)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'morning', filter: `user_id=eq.${uid}` },
      async () => { await pullMorning(); rMR(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'academics', filter: `user_id=eq.${uid}` },
      async () => { await pullAcademics(); rAC(); rMetrics(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'japanese', filter: `user_id=eq.${uid}` },
      async () => { await pullJapanese(); rJP(); rMetrics(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trading', filter: `user_id=eq.${uid}` },
      async () => { await pullTrading(); rTR(); rMetrics(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `user_id=eq.${uid}` },
      async () => { await pullCategories(); rCats(); rTodos(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: `user_id=eq.${uid}` },
      async () => { await pullTodos(); rTodos(); rMetrics(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hermes_notices', filter: `user_id=eq.${uid}` },
      async () => { await pullHermes(); rHermes(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: `user_id=eq.${uid}` },
      async () => { await pullSettings(); renderAll(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'the90_meta', filter: `user_id=eq.${uid}` },
      async () => { await pullThe90Meta(); rThe90(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'the90_daily', filter: `user_id=eq.${uid}` },
      async () => { await pullThe90Daily(); rThe90(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_accounts', filter: `user_id=eq.${uid}` },
      async () => { await pullFinAccounts(); if(typeof rFinance==='function') rFinance(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_categories', filter: `user_id=eq.${uid}` },
      async () => { await pullFinCategories(); if(typeof rFinance==='function') rFinance(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_transactions', filter: `user_id=eq.${uid}` },
      async () => { await pullFinTransactions(); if(typeof rFinance==='function') rFinance(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_budgets', filter: `user_id=eq.${uid}` },
      async () => { await pullFinBudgets(); if(typeof rFinance==='function') rFinance(); })
    .subscribe((status, err) => {
      console.log('[realtime]', status);
      if(err) console.error('[realtime] error', err);
    });
}

function unsubscribeRealtime(){
  if(realtimeChannel){
    sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

/* Android Chrome aggressively suspends WebSockets in background tabs,
   so Realtime can silently die. On every visibility/focus return:
   1. Re-subscribe if the Realtime channel isn't healthy
   2. Flush any dirty tables (offline writes made while disconnected) — push BEFORE pull,
      otherwise pullAll would overwrite local offline changes with stale remote data
   3. Pull to absorb any remote changes made while we were away */
async function rehydrateOnFocus(){
  if(document.visibilityState !== 'visible') return;
  if(!currentUser) return;

  const ch = realtimeChannel;
  const healthy = ch && (ch.state === 'joined' || ch.state === 'joining');
  if(!healthy){
    console.log('[realtime] re-subscribing (state was ' + (ch ? ch.state : 'none') + ')');
    unsubscribeRealtime();
    subscribeRealtime();
  }

  // Flush offline writes first
  const dirtyTables = Object.entries(dirty).filter(([_, v]) => v).map(([k]) => k);
  if(dirtyTables.length){
    console.log('[sync] flushing dirty:', dirtyTables.join(','));
    const pushes = [];
    if(dirty.morning) pushes.push(syncPushMorning());
    if(dirty.academics) pushes.push(syncPushAcademics());
    if(dirty.japanese) pushes.push(syncPushJP());
    if(dirty.trading) pushes.push(syncPushTrading());
    if(dirty.categories) pushes.push(syncPushCategories());
    if(dirty.todos) pushes.push(syncPushTodos());
    if(dirty.settings) pushes.push(syncPushSettings());
    if(dirty.the90Meta) pushes.push(syncPushThe90Meta());
    if(dirty.the90Daily) pushes.push(syncPushThe90Daily());
    try{ await Promise.all(pushes); }catch(e){ console.error('[sync] flush', e); }
  }

  // Then pull (clean tables are now up-to-date with remote; dirty tables are now pushed and authoritative)
  await pullAll(true);
  renderAll();
}
document.addEventListener('visibilitychange', rehydrateOnFocus);
window.addEventListener('focus', rehydrateOnFocus);
