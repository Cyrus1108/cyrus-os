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
  if(Array.isArray(data.symbols) && data.symbols.length){
    saveLSRaw('symbols', data.symbols);
    S.symbols = data.symbols;
  }
  if(Array.isArray(data.subjects) && data.subjects.length){
    saveLSRaw('subjects', data.subjects);
    S.subjects = data.subjects;
  }
  if(data.notif_banner_dismissed != null) saveLSRaw('notif_banner_dismissed', data.notif_banner_dismissed);
  if(data.theme != null){ saveLSRaw('theme', data.theme); if(typeof applyTheme === 'function') applyTheme(data.theme, false); }
  if(data.fin_base_currency != null) S.fin.baseCurrency = data.fin_base_currency;
  if(data.fin_fx_rates != null) S.fin.fxRates = { TWD:1, ...data.fin_fx_rates };
  // 信条与原则 auto-show markers (PostgREST returns date columns as 'YYYY-MM-DD')
  if(data.principles_last_shown != null) saveLSRaw('principles_last_shown', data.principles_last_shown);
  if(data.principles_review_prompted != null) saveLSRaw('principles_review_prompted', data.principles_review_prompted);
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

async function pullTrading(){
  const { data } = await sb.from('trading').select('*')
    .eq('user_id', currentUser.id).eq('date', TODAY).maybeSingle();
  if(data){
    S.tr = { date: data.date, bias: data.bias || '', list: Array.isArray(data.list) ? data.list : JSON.parse(JSON.stringify(DEF_TR)),
             sealed: !!data.sealed, sealedAt: data.sealed_at ? new Date(data.sealed_at).getTime() : null, broke: !!data.broke };
  } else {
    S.tr.list = S.tr.list.map(i=>({...i, d:false}));
    S.tr.date = TODAY;
    S.tr.bias = '';
    S.tr.sealed = false; S.tr.sealedAt = null; S.tr.broke = false;
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
  // Only fetch a rolling window: the season length + buffer. It must stay >= seasonLength()
  // so a refresh/realtime pull never trims an in-window day and the streak can't break
  // falsely. S2 是 93 天 → 110 天留足缓冲(换季时顺手加宽,原为 90 天季的 95)。
  const since = new Date(Date.now() - 110 * 86400000).toISOString().slice(0,10);
  const { data } = await sb.from('the90_daily').select('*')
    .eq('user_id', currentUser.id).gte('date', since);
  // Preserve a locally-dirty (un-pushed) TODAY edit so a concurrent realtime/refresh pull
  // can't drop it before it's been pushed. Restore it only if the cloud has no TODAY row.
  const localToday = dirty.the90Daily ? S.the90.daily[TODAY] : null;
  let cloudSuppliedToday = false;
  S.the90.daily = {};
  for(const row of (data || [])){
    S.the90.daily[row.date] = { scores: row.scores || {}, note: row.note || '' };
    if(row.date === TODAY) cloudSuppliedToday = true;
  }
  if(localToday && !cloudSuppliedToday) S.the90.daily[TODAY] = localToday;
}

async function pullTodos(){
  // Don't .order('position') here — if the column doesn't exist yet the query errors and blanks the list. rTodos sorts in JS.
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
    noCarry: !!r.no_carry,
    archived: !!r.archived,
    archivedAt: r.archived_at ? new Date(r.archived_at).getTime() : null,
  }));
}

async function pullCalEvents(){
  const { data } = await sb.from('cal_events').select('*')
    .eq('user_id', currentUser.id);
  S.cal = (data || []).map(r => ({
    id: r.id,
    title: r.title || '',
    date: r.date,
    // Postgres time → 'HH:MM' for the native <input type="time"> the form uses
    start: r.start_time ? r.start_time.slice(0,5) : '',
    end: r.end_time ? r.end_time.slice(0,5) : '',
    loc: r.location || '',
    notes: r.notes || '',
    position: r.position || 0,
  }));
  saveLSRaw('cal_events', S.cal);   // mirror to the fast-boot LS cache
}

async function pullRPG(){
  const { data } = await sb.from('rpg_state').select('*')
    .eq('user_id', currentUser.id).maybeSingle();
  if(data){
    S.rpg.seenLevel = data.seen_level || 1;
    S.rpg.achievements = data.achievements || {};
    S.rpg.bonusExp = data.bonus_exp || 0;
    S.rpg.daily = data.daily || {};
  }
}

/* ════════════ 信条与原则 (Creed & Principles) ════════════ */
async function pullPrinciples(){
  const { data } = await sb.from('principles').select('*')
    .eq('user_id', currentUser.id).order('position');
  S.principles.items = (data || []).map(r => ({
    id: r.id, kind: r.kind, text: r.text, why: r.why || '',
    position: r.position || 0, active: r.active !== false,
  }));
  saveLSRaw('principles', S.principles.items);
}
async function pullPrinciplesDaily(){
  const since = new Date(Date.now() - 95 * 86400000).toISOString().slice(0,10);
  const { data } = await sb.from('principles_daily').select('*')
    .eq('user_id', currentUser.id).gte('date', since);
  S.principles.daily = {};
  for(const row of (data || [])){
    S.principles.daily[row.date] = { checks: row.checks || {}, revise: row.revise || {}, note: row.note || '' };
  }
  saveLSRaw('principles_daily', S.principles.daily);
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
    interestRate:Number(r.interest_rate)||0,
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
  dirty.finBudgets = true;
  await waitForPull();
  const ok = await replaceTable('fin_budgets', S.fin.budgets, b => ({
    id:b.id, user_id:currentUser.id, name:b.name, amount_limit:b.limit||0,
    type:b.type, target_categories:b.targets||[], period:b.period||'monthly', sort:b.sort||0,
  }));
  if(ok) dirty.finBudgets = false;
}
async function pullFinGoals(){
  const { data } = await sb.from('fin_goals').select('*').eq('user_id', currentUser.id).order('sort');
  S.fin.goals = (data || []).map(r => ({
    id:r.id, name:r.name, target:Number(r.target_amount)||0, currency:r.currency,
    mode:r.mode, accountId:r.account_id, savedAmount:Number(r.saved_amount)||0,
    deadline:r.deadline, sort:r.sort||0,
  }));
  saveLSRaw('fin_goals', S.fin.goals);
}
async function finSaveGoals(){
  if(!currentUser) return;
  dirty.finGoals = true;
  await waitForPull();
  const ok = await replaceTable('fin_goals', S.fin.goals, g => ({
    id:g.id, user_id:currentUser.id, name:g.name, target_amount:g.target||0, currency:g.currency,
    mode:g.mode, account_id:g.accountId||null, saved_amount:g.savedAmount||0, deadline:g.deadline||null, sort:g.sort||0,
  }));
  if(ok) dirty.finGoals = false;
}
async function pullFinRecurring(){
  const { data } = await sb.from('fin_recurring').select('*').eq('user_id', currentUser.id).order('sort');
  S.fin.recurring = (data || []).map(r => ({
    id:r.id, name:r.name, type:r.type, amount:Number(r.amount)||0, currency:r.currency,
    accountId:r.account_id, toAccountId:r.to_account_id, toAmount:r.to_amount!=null?Number(r.to_amount):null,
    categoryId:r.category_id, note:r.note||'', tags:r.tags||[],
    frequency:r.frequency, intervalN:r.interval_n||1, nextDate:r.next_date, lastRun:r.last_run, active:!!r.active, sort:r.sort||0,
  }));
  saveLSRaw('fin_recurring', S.fin.recurring);
}
async function finSaveRecurring(){
  if(!currentUser) return;
  dirty.finRecurring = true;
  // Refresh cron-owned scheduling state (next_date/last_run) before pushing so a stale
  // local next_date can't regress over the value the nightly cron already advanced.
  // Merge the server scheduling fields back onto the just-edited local rows (don't clobber
  // the user's in-memory edit, which lives in S.fin.recurring before this push).
  const localRecurring = S.fin.recurring;
  await pullFinRecurring();
  const sched = {};
  for(const r of S.fin.recurring){ sched[r.id] = { nextDate:r.nextDate, lastRun:r.lastRun }; }
  S.fin.recurring = localRecurring.map(r => sched[r.id]
    ? { ...r, nextDate:sched[r.id].nextDate, lastRun:sched[r.id].lastRun }
    : r);
  saveLSRaw('fin_recurring', S.fin.recurring);
  await waitForPull();
  const ok = await replaceTable('fin_recurring', S.fin.recurring, r => ({
    id:r.id, user_id:currentUser.id, name:r.name, type:r.type, amount:r.amount||0, currency:r.currency,
    account_id:r.accountId||null, to_account_id:r.toAccountId||null, to_amount:r.toAmount!=null?r.toAmount:null,
    category_id:r.categoryId||null, note:r.note||null, tags:(r.tags&&r.tags.length)?r.tags:null,
    frequency:r.frequency, interval_n:r.intervalN||1, next_date:r.nextDate, last_run:r.lastRun||null, active:r.active!==false, sort:r.sort||0,
  }));
  if(ok) dirty.finRecurring = false;
}

async function pullFinSnapshots(){
  // last ~400 days of nightly net-worth snapshots (written server-side by pg_cron)
  const since = new Date(Date.now() - 400*86400000).toISOString().slice(0,10);
  const { data } = await sb.from('fin_asset_snapshots').select('date,net_worth')
    .eq('user_id', currentUser.id).gte('date', since);
  const map = {};
  for(const r of (data || [])) map[r.date] = Number(r.net_worth)||0;
  S.fin.snapshots = map;
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
        pullSettings(), pullMorning(), pullTrading(), pullCategories(), pullTodos(),
        pullThe90Meta(), pullThe90Daily(), pullRPG(),
        pullPrinciples(), pullPrinciplesDaily(),
        pullFinAccounts(), pullFinCategories(), pullFinTransactions(), pullFinBudgets(),
        pullFinGoals(), pullFinRecurring(), pullFinSnapshots(),
        pullCalEvents(),
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
      // Clear the cached promise (initialPullDone stays false) so the next pullAll()
      // retries instead of resolving against this broken pull forever.
      pullAllPromise = null;
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
    theme: loadLS('theme', 'sovereign'),
    fin_base_currency: S.fin.baseCurrency || 'TWD',
    fin_fx_rates: S.fin.fxRates || {TWD:1},
    principles_last_shown: loadLS('principles_last_shown', null),
    principles_review_prompted: loadLS('principles_review_prompted', null),
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

async function syncPushTrading(){
  if(!currentUser) return;
  await waitForPull();
  const res = await sb.from('trading').upsert({
    user_id: currentUser.id,
    date: S.tr.date || TODAY,
    bias: S.tr.bias || '',
    list: S.tr.list,
    sealed: !!S.tr.sealed,
    sealed_at: S.tr.sealedAt ? new Date(S.tr.sealedAt).toISOString() : null,
    broke: !!S.tr.broke,
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
    no_carry: t.noCarry || false,
    archived: t.archived || false,
    archived_at: t.archivedAt ? new Date(t.archivedAt).toISOString() : null,
  }));
  if(ok) dirty.todos = false;
}

async function syncPushCalEvents(){
  if(!currentUser) return;
  await waitForPull();
  const ok = await replaceTable('cal_events', S.cal, e => ({
    id: e.id, user_id: currentUser.id,
    title: e.title || '',
    date: e.date,
    start_time: e.start || null,
    end_time: e.end || null,
    location: e.loc || null,
    notes: e.notes || null,
    position: e.position || 0,
  }));
  if(ok) dirty.calEvents = false;
}

async function syncPushRPG(){
  if(!currentUser) return;
  await waitForPull();
  const res = await sb.from('rpg_state').upsert({
    user_id: currentUser.id,
    seen_level: S.rpg.seenLevel || 1,
    achievements: S.rpg.achievements || {},
    bonus_exp: S.rpg.bonusExp || 0,
    daily: S.rpg.daily || {},
    updated_at: new Date().toISOString(),
  });
  logIfError('push rpg_state', res);
  if(!res.error) dirty.rpg = false;
}

async function syncPushPrinciples(){
  if(!currentUser) return;
  await waitForPull();   // guards replaceTable's delete-all against an un-pulled local list
  const ok = await replaceTable('principles', S.principles.items, p => ({
    id: p.id, user_id: currentUser.id, kind: p.kind, text: p.text,
    why: p.why || null, position: p.position || 0, active: p.active !== false,
  }));
  if(ok) dirty.principles = false;
}

async function syncPushPrinciplesDaily(){
  if(!currentUser || !S.principles?.daily) return;
  await waitForPull();
  const day = S.principles.daily[TODAY];
  if(!day) return;
  const res = await sb.from('principles_daily').upsert({
    user_id: currentUser.id,
    date: TODAY,
    checks: day.checks || {},
    revise: day.revise || {},
    note: day.note || '',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,date' });
  logIfError('push principles_daily', res);
  if(!res.error) dirty.principlesDaily = false;
}

/* ── Finance writes ──
   Accounts/categories: replace-all (small sets; archive keeps rows local so they survive).
   Transactions: targeted single-row ops returning the server row (for its generated id). */
async function finSaveAccounts(){
  if(!currentUser) return;
  dirty.finAccounts = true;
  await waitForPull();
  const ok = await replaceTable('fin_accounts', S.fin.accounts, a => ({
    id:a.id, user_id:currentUser.id, name:a.name, type:a.type, currency:a.currency,
    initial_balance:a.initialBalance||0, is_liability:!!a.isLiability,
    status:a.status, icon:a.icon||null, color:a.color||null,
    interest_rate:a.interestRate||0, sort:a.sort||0,
  }));
  if(ok) dirty.finAccounts = false;
}
async function finSaveCategories(){
  if(!currentUser) return;
  dirty.finCategories = true;
  await waitForPull();
  const ok = await replaceTable('fin_categories', S.fin.categories, c => ({
    id:c.id, user_id:currentUser.id, name:c.name, kind:c.kind,
    icon:c.icon||null, color:c.color||null, archived:!!c.archived, sort:c.sort||0,
  }));
  if(ok) dirty.finCategories = false;
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

/* Coalesce realtime bursts: replaceTable() upserts EVERY row on each local change,
   so one edit echoes back as N postgres_changes events. Debounce per table so the
   whole burst collapses into a single pull+render instead of N flickering renders. */
const _rtT = {};
function rtCoalesce(key, fn, ms){ clearTimeout(_rtT[key]); _rtT[key] = setTimeout(fn, ms || 300); }

function subscribeRealtime(){
  if(realtimeChannel || !currentUser) return;
  const uid = currentUser.id;

  realtimeChannel = sb.channel('cyrus-os-' + uid)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'morning', filter: `user_id=eq.${uid}` },
      () => rtCoalesce('morning', async () => { await pullMorning(); rMR(); }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trading', filter: `user_id=eq.${uid}` },
      () => rtCoalesce('trading', async () => { await pullTrading(); rTR(); rMetrics(); }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `user_id=eq.${uid}` },
      () => rtCoalesce('categories', async () => { await pullCategories(); rCats(); rTodos(); }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: `user_id=eq.${uid}` },
      () => rtCoalesce('todos', async () => { await pullTodos(); rTodos(); rMetrics(); }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rpg_state', filter: `user_id=eq.${uid}` },
      () => rtCoalesce('rpg_state', async () => { await pullRPG(); if(typeof rSystem==='function') rSystem(); }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'principles', filter: `user_id=eq.${uid}` },
      () => rtCoalesce('principles', async () => { await pullPrinciples(); if(typeof rPrinciplesModal==='function') rPrinciplesModal(); }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'principles_daily', filter: `user_id=eq.${uid}` },
      () => rtCoalesce('principles_daily', async () => { await pullPrinciplesDaily(); if(typeof rPrinciplesModal==='function') rPrinciplesModal(); }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: `user_id=eq.${uid}` },
      () => rtCoalesce('settings', async () => { await pullSettings(); renderAll(); }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'the90_meta', filter: `user_id=eq.${uid}` },
      () => rtCoalesce('the90_meta', async () => { await pullThe90Meta(); rThe90(); }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'the90_daily', filter: `user_id=eq.${uid}` },
      () => rtCoalesce('the90_daily', async () => { await pullThe90Daily(); rThe90(); }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_accounts', filter: `user_id=eq.${uid}` },
      () => rtCoalesce('fin_accounts', async () => { await pullFinAccounts(); if(typeof rFinance==='function') rFinance(); }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_categories', filter: `user_id=eq.${uid}` },
      () => rtCoalesce('fin_categories', async () => { await pullFinCategories(); if(typeof rFinance==='function') rFinance(); }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_transactions', filter: `user_id=eq.${uid}` },
      () => rtCoalesce('fin_transactions', async () => { await pullFinTransactions(); if(typeof rFinance==='function') rFinance(); }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_budgets', filter: `user_id=eq.${uid}` },
      () => rtCoalesce('fin_budgets', async () => { await pullFinBudgets(); if(typeof rFinance==='function') rFinance(); }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_goals', filter: `user_id=eq.${uid}` },
      () => rtCoalesce('fin_goals', async () => { await pullFinGoals(); if(typeof rFinance==='function') rFinance(); }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fin_recurring', filter: `user_id=eq.${uid}` },
      () => rtCoalesce('fin_recurring', async () => { await pullFinRecurring(); if(typeof rFinance==='function') rFinance(); }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cal_events', filter: `user_id=eq.${uid}` },
      () => rtCoalesce('cal_events', async () => { await pullCalEvents(); if(typeof calUI!=='undefined' && calUI.open && typeof rCalendar==='function') rCalendar(); if(typeof rCalDot==='function') rCalDot(); }))
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
    if(dirty.trading) pushes.push(syncPushTrading());
    if(dirty.categories) pushes.push(syncPushCategories());
    if(dirty.todos) pushes.push(syncPushTodos());
    if(dirty.settings) pushes.push(syncPushSettings());
    if(dirty.the90Meta) pushes.push(syncPushThe90Meta());
    if(dirty.the90Daily) pushes.push(syncPushThe90Daily());
    if(dirty.rpg) pushes.push(syncPushRPG());
    if(dirty.principles) pushes.push(syncPushPrinciples());
    if(dirty.principlesDaily) pushes.push(syncPushPrinciplesDaily());
    if(dirty.calEvents) pushes.push(syncPushCalEvents());
    if(dirty.finAccounts) pushes.push(finSaveAccounts());
    if(dirty.finCategories) pushes.push(finSaveCategories());
    if(dirty.finBudgets) pushes.push(finSaveBudgets());
    if(dirty.finGoals) pushes.push(finSaveGoals());
    if(dirty.finRecurring) pushes.push(finSaveRecurring());
    try{ await Promise.all(pushes); }catch(e){ console.error('[sync] flush', e); }
  }

  // The day rolled over while the tab sat open (TODAY is frozen at page load). Reload so
  // the per-module daily reset re-runs against the new date — otherwise toggles/check-ins
  // keep writing to yesterday's row and 'today' columns/streaks point at the wrong day.
  // Runs AFTER the dirty-flush above so yesterday's date-keyed offline writes are pushed
  // while TODAY is still correct, instead of being discarded by the reload.
  if(new Date().toLocaleDateString('sv-SE') !== TODAY){ location.reload(); return; }

  // Then pull (clean tables are now up-to-date with remote; dirty tables are now pushed and authoritative)
  await pullAll(true);
  renderAll();
  // 晚间核查: after 21:00 the first return to the app prompts the review once
  if(typeof principlesEveningAutoShow === 'function') principlesEveningAutoShow();
}
document.addEventListener('visibilitychange', rehydrateOnFocus);
window.addEventListener('focus', rehydrateOnFocus);
