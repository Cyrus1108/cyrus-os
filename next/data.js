// ============================================================================
// CYRUS://NEXT — data.js  ·  thin, self-contained Supabase data layer
// ----------------------------------------------------------------------------
// This is the REAL data seam that replaces main.js's MOCK object when a session
// exists. It owns its OWN Supabase client (same connection params + storageKey
// as the main app, so it silently shares the /  login on the same origin) and
// exposes read loaders + the two safe daily writers. It NEVER touches the DOM.
//
// Hard rules honoured here (see task brief):
//   · RLS is auth.uid() = user_id on every table → user_id is always derived
//     from the live session (currentUid()), never hardcoded.
//   · Only the public publishable key is used (identical to scripts/supabase.js).
//   · the90_daily.scores is jsonb with namespaced keys (_amp/_low/_lowx/_trig)
//     mixed with target ids I..V — we ONLY ever read/write by explicit target id
//     and preserve unknown keys on upsert by spreading the existing object.
//   · Finance is read-only in v1 (no writes at all).
// ============================================================================

// -- connection (EXACT values from scripts/supabase.js) ----------------------
const SUPABASE_URL = 'https://whmdrabescmchkupazjh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_pxjnEVtIlYsyI_bSxmjoCw_57-Sk2hn';

// -- "today" in Asia/Taipei, explicit — never trust browser locale -----------
export const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());

// The 90 defaults (used only when the user has no the90_meta row yet) ---------
const THE90_START_DEFAULT = '2026-05-11';
const THE90_END_DEFAULT   = '2026-08-09';
// id + label fallback, kept in sync with scripts/the90.js THE_90_TARGETS_DEFAULT
const TARGETS_DEFAULT = [
  { id: 'I',   label: '21:30 上床' },
  { id: 'II',  label: '10 分钟冥想' },
  { id: 'III', label: 'AI Automation' },
  { id: 'IV',  label: '每周健身 5 天' },
  { id: 'V',   label: '性能量管理' },
];

// Morning ritual default — mirrors scripts/state.js MR_DEFAULT (身心灵, v7.7).
// Used only as the ultimate fallback when the user has NO morning row at all;
// otherwise loadMorning carries forward the most recent prior day's list.
const MR_DEFAULT = [
  { id: 'mr1', t: 'Water', mins: 1, d: false },
  { id: 'mr3', t: 'Meditation', mins: 10, d: false },
  { id: 'mr8', t: 'Bath · 切换', mins: 3, d: false },
  { id: 'mr7', t: 'Calisthenics', mins: 30, d: false },
  { id: 'mr9', t: 'Bath · 洗净', mins: 13, d: false },
  { id: 'mr2', t: "Men's work", mins: 3, d: false },
];
const defaultMorning = () => MR_DEFAULT.map(i => ({ ...i }));

// Trading-desk pre-market checklist default — mirrors scripts/state.js DEF_TR.
// Used as the fallback when the user has no prior `trading` row to carry forward.
const DEF_TR = [
  { id: 't1', t: '宏观背景确认(油/金/BTC联动)', d: false },
  { id: 't2', t: 'BTC 日线市场结构', d: false },
  { id: 't3', t: '黄金 关键流动性位', d: false },
  { id: 't4', t: '原油 趋势方向', d: false },
  { id: 't5', t: '设置关键价位提醒', d: false },
  { id: 't6', t: '记录今日交易偏向', d: false },
];
const defaultTradingList = () => DEF_TR.map(i => ({ ...i }));

// ── lazy client (vendor supabase.js is a UMD global: window.supabase) ────────
// scripts/supabase.js does `const { createClient } = window.supabase;` off the
// classic <script src="../vendor/supabase.js">. We mirror that exactly. Lazy so
// a missing/blocked vendor script never throws at import time (→ demo mode).
let _sb = null, _sbTried = false;
function client() {
  if (_sbTried) return _sb;
  _sbTried = true;
  try {
    const g = (typeof window !== 'undefined') ? window.supabase : null;
    if (g && typeof g.createClient === 'function') {
      _sb = g.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
          persistSession: true,
          detectSessionInUrl: true,
          autoRefreshToken: true,
          storageKey: 'cyrus_os_session',   // shares the main app's session
        },
      });
    }
  } catch { _sb = null; }
  return _sb;
}

// ── pure helpers (day index / phase / met test) ─────────────────────────────
// Day 1 = start_date. Both parsed at Taipei midnight so DST-free arithmetic.
export function dayIndex(dateStr, start) {
  const d = new Date(dateStr + 'T00:00:00+08:00');
  const s = new Date((start || THE90_START_DEFAULT) + 'T00:00:00+08:00');
  return Math.floor((d - s) / 86400000) + 1;
}
export function phaseOf(day) {
  if (day <= 30) return 'standardize';
  if (day <= 60) return 'stabilize';
  return 'optimize';
}
// Mirrors scripts/the90.js the90ScoreMet: stabilize counts 1–3 as met (0 miss),
// standardize/optimize is a plain truthiness test.
export function scoreMet(score, phase) {
  if (phase === 'stabilize') return typeof score === 'number' ? score > 0 : !!score;
  return !!score;
}
export function phaseLabel(phase) {
  return ({ standardize: 'STANDARDIZE', stabilize: 'STABILIZE', optimize: 'OPTIMIZE' })[phase] || '';
}
const clampInt = (v, a, b) => Math.min(b, Math.max(a, v | 0));
const isoTaipei = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date(ms));
const dateMs = (iso) => Date.parse(iso + 'T00:00:00+08:00');
export const isoMinusDays = (iso, n) => isoTaipei(dateMs(iso) - n * 86400000);
export function daysUntil(target, from) {
  return Math.ceil((dateMs(target) - dateMs(from || TODAY)) / 86400000);
}

// ── JP check-in helpers (faithful port of scripts/japanese.js) ───────────────
// Whether a checklist item is scheduled on date `ds` per its repeat rule. Pure
// calendar math (matches jpItemDueOn: local-midnight Date → getDay/date diff).
export function jpItemDueOn(it, ds) {
  const r = (it && it.repeat) || 'daily';
  if (r === 'daily') return true;
  const d = new Date(ds + 'T00:00:00'), dow = d.getDay();
  if (r === 'weekdays') return dow >= 1 && dow <= 5;
  if (r === 'weekends') return dow === 0 || dow === 6;
  const anchor = new Date(((it && it.since) || ds) + 'T00:00:00');
  const days = Math.round((d - anchor) / 86400000);
  if (days < 0) return false;
  if (r === 'weekly') return dow === anchor.getDay();
  if (r === 'biweekly') return dow === anchor.getDay() && Math.floor(days / 7) % 2 === 0;
  if (r === 'monthly') return d.getDate() === anchor.getDate();
  if (r === 'custom_days') return it.customDays > 0 && days % it.customDays === 0;
  return true;
}
// streak = consecutive logged days ending today (or yesterday if today unlogged),
// derived purely from the log — mirrors jpComputeStreak, iterated in Taipei.
function jpComputeStreak(log) {
  log = log || {};
  let cur = TODAY, s = 0;
  if (!log[cur]) cur = isoMinusDays(cur, 1);
  while (log[cur]) { s++; cur = isoMinusDays(cur, 1); }
  return s;
}

// ── auth ────────────────────────────────────────────────────────────────────
export async function getSession() {
  const sb = client(); if (!sb) return null;
  try { const { data } = await sb.auth.getSession(); return (data && data.session) || null; }
  catch { return null; }
}
async function currentUid() {
  const s = await getSession();
  return (s && s.user && s.user.id) || null;
}
export async function signIn(email) {
  const sb = client(); if (!sb) throw new Error('LINK UNAVAILABLE');
  return sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
}
export function onAuth(cb) {
  const sb = client(); if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((event, session) => cb(event, session));
  return () => { try { data.subscription.unsubscribe(); } catch {} };
}

// ── domain reads (all RLS-scoped by the .eq('user_id', uid) filter) ─────────
export async function loadThe90(uid) {
  const sb = client(); if (!sb || !uid) return { meta: null, daily: [] };
  const since = isoMinusDays(TODAY, 95);   // covers every real day back to start
  const [metaRes, dailyRes] = await Promise.all([
    sb.from('the90_meta').select('*').eq('user_id', uid).maybeSingle(),
    sb.from('the90_daily').select('*').eq('user_id', uid).gte('date', since),
  ]);
  if (metaRes.error) throw metaRes.error;
  if (dailyRes.error) throw dailyRes.error;
  return { meta: metaRes.data || null, daily: dailyRes.data || [] };
}

// Today's rituals. If no row exists for today, replicate scripts/sync.js
// pullMorning: carry forward the most recent PRIOR day's list (all d:false), or
// fall back to MR_DEFAULT. `seeded:true` means this is a template not yet in the
// DB — the first toggleMorningItem upsert then creates today's row.
export async function loadMorning(uid) {
  const sb = client(); if (!sb || !uid) return { list: defaultMorning(), date: TODAY, exists: false, seeded: true };
  const today = await sb.from('morning').select('*').eq('user_id', uid).eq('date', TODAY).maybeSingle();
  if (today.error) throw today.error;
  if (today.data && Array.isArray(today.data.list)) {
    return { list: today.data.list, date: TODAY, exists: true, seeded: false };
  }
  const prior = await sb.from('morning').select('list,date').eq('user_id', uid)
    .lt('date', TODAY).order('date', { ascending: false }).limit(1).maybeSingle();
  if (prior.error) throw prior.error;
  const base = (prior.data && Array.isArray(prior.data.list) && prior.data.list.length)
    ? prior.data.list : defaultMorning();
  return { list: base.map(i => ({ ...i, d: false })), date: TODAY, exists: false, seeded: true };
}

export async function loadAcademics(uid) {
  const sb = client(); if (!sb || !uid) return [];
  const { data, error } = await sb.from('academics').select('*').eq('user_id', uid);
  if (error) throw error;
  return (data || []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

export async function loadJapanese(uid) {
  const sb = client(); if (!sb || !uid) return null;
  const { data, error } = await sb.from('japanese').select('*').eq('user_id', uid).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function loadTodos(uid) {
  const sb = client(); if (!sb || !uid) return [];
  const { data, error } = await sb.from('todos').select('*').eq('user_id', uid);
  if (error) throw error;
  return data || [];
}

export async function loadTrading(uid) {
  const sb = client(); if (!sb || !uid) return { accounts: [], transactions: [], categories: [] };
  const [aRes, tRes, cRes] = await Promise.all([
    sb.from('fin_accounts').select('*').eq('user_id', uid),
    sb.from('fin_transactions').select('*').eq('user_id', uid).order('date', { ascending: false }),
    sb.from('fin_categories').select('*').eq('user_id', uid),
  ]);
  if (aRes.error) throw aRes.error;
  if (tRes.error) throw tRes.error;
  if (cRes.error) throw cRes.error;
  return { accounts: aRes.data || [], transactions: tRes.data || [], categories: cRes.data || [] };
}

// TRADING desk (盘前封条) — the daily trading checklist + bias + seal (table
// `trading`, one row per user/day; distinct from the fin_* finance tables above).
// Prototype B / by-day: read TODAY's row; if none, carry the most recent prior
// day's checklist forward (reset every d:false, bias/seal cleared) — exactly the
// app's daily rollover (sync.js pullTrading + app.js rollover), matching how
// loadMorning carries the ritual list forward. First write creates today's row.
export async function loadTradingDesk(uid) {
  const empty = () => ({ date: TODAY, bias: '', list: defaultTradingList(), sealed: false, sealedAt: null, broke: false, exists: false, seeded: true });
  const sb = client(); if (!sb || !uid) return empty();
  const today = await sb.from('trading').select('*').eq('user_id', uid).eq('date', TODAY).maybeSingle();
  if (today.error) throw today.error;
  if (today.data) {
    const d = today.data;
    return {
      date: TODAY, bias: d.bias || '',
      list: Array.isArray(d.list) ? d.list : defaultTradingList(),
      sealed: !!d.sealed, sealedAt: d.sealed_at ? new Date(d.sealed_at).getTime() : null,
      broke: !!d.broke, exists: true, seeded: false,
    };
  }
  const prior = await sb.from('trading').select('list,date').eq('user_id', uid)
    .lt('date', TODAY).order('date', { ascending: false }).limit(1).maybeSingle();
  if (prior.error) throw prior.error;
  const base = (prior.data && Array.isArray(prior.data.list) && prior.data.list.length)
    ? prior.data.list : defaultTradingList();
  return { date: TODAY, bias: '', list: base.map(i => ({ ...i, d: false })),
    sealed: false, sealedAt: null, broke: false, exists: false, seeded: true };
}

export async function loadSystem(uid) {
  const sb = client(); if (!sb || !uid) return { settings: null, notices: [] };
  const [sRes, nRes] = await Promise.all([
    sb.from('settings').select('*').eq('user_id', uid).maybeSingle(),
    sb.from('hermes_notices').select('*').eq('user_id', uid)
      .is('dismissed_at', null).order('created_at', { ascending: false }).limit(50),
  ]);
  if (sRes.error) throw sRes.error;
  if (nRes.error) throw nRes.error;
  return { settings: sRes.data || null, notices: nRes.data || [] };
}

// Load every domain in parallel; individual failures don't sink the others.
// the90 === null signals a hard failure (→ caller falls back to demo/LINK DOWN).
export async function loadAll(uid) {
  const keys = ['the90', 'morning', 'academics', 'japanese', 'todos', 'trading', 'system', 'tradingDesk'];
  const fns  = [loadThe90, loadMorning, loadAcademics, loadJapanese, loadTodos, loadTrading, loadSystem, loadTradingDesk];
  const results = await Promise.allSettled(fns.map(fn => fn(uid)));
  const out = { errors: {} };
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') out[keys[i]] = r.value;
    else { out[keys[i]] = null; out.errors[keys[i]] = String(r.reason && r.reason.message || r.reason); }
  });
  return out;
}

// ── The 90 summary — everything the monument + nameplate + SYSTEM cell need ──
// Returns MOCK-friendly primitives; presentation lives in main.js.
export function the90Summary(meta, dailyRows) {
  const start = (meta && meta.start_date) || THE90_START_DEFAULT;
  const end   = (meta && meta.end_date)   || THE90_END_DEFAULT;
  const targets = (meta && Array.isArray(meta.targets) && meta.targets.length)
    ? meta.targets : TARGETS_DEFAULT;

  const byDate = Object.create(null);
  for (const r of (dailyRows || [])) if (r && r.date) byDate[r.date] = r;

  const baseMs = dateMs(start);
  const dates = [];
  for (let i = 0; i < 90; i++) dates.push(isoTaipei(baseMs + i * 86400000));

  const todayIndex = clampInt(dayIndex(TODAY, start) - 1, 0, 89);

  const ratios = new Array(90).fill(null);
  for (let i = 0; i <= todayIndex; i++) {
    const row = byDate[dates[i]];
    const scores = (row && row.scores) || {};
    const ph = phaseOf(i + 1);
    const met = targets.reduce((n, t) => n + (scoreMet(scores[t.id], ph) ? 1 : 0), 0);
    ratios[i] = targets.length ? met / targets.length : 0;
  }

  // 30-day rolling average (percent), missing days count as 0
  const from = Math.max(0, todayIndex - 29);
  let sum = 0, cnt = 0;
  for (let i = from; i <= todayIndex; i++) { sum += (ratios[i] || 0); cnt++; }
  const avg30 = cnt ? Math.round((sum / cnt) * 100) : 0;

  // longest streak of days meeting >= 3/5 (ratio >= 0.6), mirroring MOCK's rule
  let run = 0, best = 0;
  for (let i = 0; i <= todayIndex; i++) {
    if ((ratios[i] || 0) >= 0.6) { run++; best = Math.max(best, run); } else run = 0;
  }

  const todayRow = byDate[TODAY];
  return {
    start, end, targets, dates, todayIndex,
    todayDate: TODAY,
    phase: phaseOf(todayIndex + 1),
    todayScores: (todayRow && todayRow.scores) || {},
    todayNote: (todayRow && todayRow.note) || '',
    ratios, avg30, best,
  };
}

// ── writers (the only two mutations in v1) ──────────────────────────────────
// Toggle one The 90 target for TODAY. `currentScores` MUST be the full existing
// scores object (namespaced keys included) so they survive the upsert. Transition
// is identical to scripts/the90.js toggleThe90.
export async function toggleThe90Target(targetId, currentScores, phase, existingNote) {
  const sb = client(); const uid = await currentUid();
  if (!sb || !uid) throw new Error('NO SESSION');
  const cur = currentScores ? currentScores[targetId] : undefined;
  let next;
  if (phase === 'stabilize') {
    next = cur === undefined ? 3 : cur === 3 ? 2 : cur === 2 ? 1 : cur === 1 ? 0 : 3;
  } else {
    next = !cur;
  }
  const scores = { ...(currentScores || {}), [targetId]: next };   // preserve _amp/_low/…
  const { error } = await sb.from('the90_daily')
    .upsert({ user_id: uid, date: TODAY, scores, note: existingNote || '' }, { onConflict: 'user_id,date' });
  if (error) throw error;
  return { scores, value: next };
}

// Toggle one MORNING ritual's done flag for TODAY. `list` is the current jsonb
// array; we return the mutated copy (never mutate the caller's array in place).
export async function toggleMorningItem(itemId, list) {
  const sb = client(); const uid = await currentUid();
  if (!sb || !uid) throw new Error('NO SESSION');
  const next = (list || []).map(it => it && it.id === itemId ? { ...it, d: !it.d } : it);
  const { error } = await sb.from('morning')
    .upsert({ user_id: uid, date: TODAY, list: next }, { onConflict: 'user_id,date' });
  if (error) throw error;
  return next;
}

// Toggle one TODO's done flag via a TARGETED update (never replace-all; only the
// one row the user tapped is touched). Mirrors scripts/todos.js toggleTd:
// done_at gets a timestamp when completing and is left untouched when un-doing.
// NOTE: does NOT spawn the next occurrence of a repeating todo (see main-app
// toggleTd + computeNextRepeatDate) — spawn logic is non-trivial and out of
// scope here; a repeat's next occurrence still spawns when toggled in the app.
export async function toggleTodo(id, currentDone) {
  const sb = client(); const uid = await currentUid();
  if (!sb || !uid) throw new Error('NO SESSION');
  const done = !currentDone;
  const patch = { done };
  if (done) patch.done_at = new Date().toISOString();   // set on completion; leave on un-done
  const { error } = await sb.from('todos').update(patch).eq('id', id).eq('user_id', uid);
  if (error) throw error;
  return done;
}

// Toggle one ACADEMICS item's done flag — targeted update, boolean only
// (academics has no done timestamp). Mirrors scripts/academics.js toggleAC.
export async function toggleAcademic(id, currentDone) {
  const sb = client(); const uid = await currentUid();
  if (!sb || !uid) throw new Error('NO SESSION');
  const done = !currentDone;
  const { error } = await sb.from('academics').update({ done }).eq('id', id).eq('user_id', uid);
  if (error) throw error;
  return done;
}

// ── JP-N2 daily check-in (single row/user) ──────────────────────────────────
// CRITICAL: re-read the cloud row's log first and UNION it (never replace/shrink)
// so a concurrent device's logged days survive — mirrors syncPushJP + jpUnionLog.
// This device is authoritative for TODAY only. streak/last_date are DERIVED from
// the merged log (never manually incremented). `state.log` must already reflect
// the intended TODAY value (settled by the caller). No onConflict → user_id is PK.
async function _jpPush(state) {
  const sb = client(); const uid = await currentUid();
  if (!sb || !uid) throw new Error('NO SESSION');
  let log = state.log || {};
  try {
    const { data: cur } = await sb.from('japanese').select('log').eq('user_id', uid).maybeSingle();
    if (cur && cur.log && typeof cur.log === 'object') {
      const merged = Object.assign({}, cur.log, log);   // per-key local wins (jpUnionLog)
      if (log[TODAY]) merged[TODAY] = true; else delete merged[TODAY];   // TODAY authority
      log = merged;
    }
  } catch { /* cloud read failed → push local log as-is (no worse than old behaviour) */ }
  const streak = jpComputeStreak(log);
  const last_date = Object.keys(log).sort().reverse()[0] || null;
  const { error } = await sb.from('japanese').upsert({
    user_id: uid, date: TODAY, streak, last_date, log,
    note: state.note || '', list: state.list || [],
  });
  if (error) throw error;
  return { log, streak, last_date, list: state.list || [], note: state.note || '' };
}

// Toggle one checklist item's `.d`, re-settle log[TODAY] against TODAY's DUE items
// (mirrors jpSettle), then push with the union-preserving writer.
export async function toggleJapaneseItem(itemId, jpRow) {
  const list = (jpRow && Array.isArray(jpRow.list)) ? jpRow.list.map(x => ({ ...x })) : [];
  const it = list.find(i => i && i.id === itemId);
  if (!it) throw new Error('NO ITEM');
  it.d = !it.d;
  const log = { ...((jpRow && jpRow.log) || {}) };
  const due = list.filter(i => jpItemDueOn(i, TODAY));
  const all = due.length > 0 && due.every(i => i.d);
  const had = !!log[TODAY];
  if (all && !had) log[TODAY] = true;
  else if (!all && had && due.length > 0) delete log[TODAY];
  const res = await _jpPush({ list, note: (jpRow && jpRow.note) || '', log });
  return { ...res, itemDone: it.d };
}

// Manual daily check-in when nothing is due today — toggles log[TODAY] directly
// (mirrors jpCheckInToday). Leaves the checklist untouched.
export async function checkInJapanese(jpRow) {
  const log = { ...((jpRow && jpRow.log) || {}) };
  if (log[TODAY]) delete log[TODAY]; else log[TODAY] = true;
  const list = (jpRow && Array.isArray(jpRow.list)) ? jpRow.list : [];
  return _jpPush({ list, note: (jpRow && jpRow.note) || '', log });
}

// ── TRADING (finance) full CRUD — owner-authorized read/write/DELETE of
// fin_transactions (the former insert-only rule is lifted for this table).
// Mirrors sync.js finAddTx / finUpdateTx / finDeleteTx exactly. `tx` carries
// camelCase fields (accountId/toAccountId/toAmount/categoryId) → DB columns.
// CRITICAL: currency is NEVER passed as a form field — the caller derives it
// from the selected account (see main.js), matching finSubmitTx.
export async function addTransaction(tx) {
  const sb = client(); const uid = await currentUid();
  if (!sb || !uid) throw new Error('NO SESSION');
  const { data, error } = await sb.from('fin_transactions').insert({
    user_id: uid, date: tx.date, type: tx.type,
    amount: tx.amount, currency: tx.currency,
    account_id: tx.accountId || null, to_account_id: tx.toAccountId || null,
    to_amount: tx.toAmount != null ? tx.toAmount : null,
    category_id: tx.categoryId || null, note: tx.note || null,
    tags: (tx.tags && tx.tags.length) ? tx.tags : null,
  }).select().single();
  if (error) throw error;
  return data;
}

// Targeted single-row update, scoped to the owner. `patch` uses DB column names
// and should OMIT any column you don't intend to change — unlisted columns keep
// their value (so leaving `tags` out of the patch preserves the user's tags).
export async function updateTransaction(id, patch) {
  const sb = client(); const uid = await currentUid();
  if (!sb || !uid) throw new Error('NO SESSION');
  const { data, error } = await sb.from('fin_transactions')
    .update(patch).eq('id', id).eq('user_id', uid).select().single();
  if (error) throw error;
  return data;
}

// Targeted single-row delete, scoped to the owner (irreversible — the UI gates
// this behind an explicit confirm step). Never a bulk/replace-all delete.
export async function deleteTransaction(id) {
  const sb = client(); const uid = await currentUid();
  if (!sb || !uid) throw new Error('NO SESSION');
  const { error } = await sb.from('fin_transactions').delete().eq('id', id).eq('user_id', uid);
  if (error) throw error;
  return true;
}

// ── TRADING desk writers (盘前封条) ──────────────────────────────────────────
// The whole desk (bias + checklist + seal) lives in ONE `trading` row per
// user/day, so every mutation writes the full row via a single-row upsert
// (onConflict user_id,date) — identical shape to sync.js syncPushTrading, never
// a replace-all. uid always from the live session. Each writer takes the current
// desk, computes the next state WITHOUT mutating the caller, upserts, and returns
// the normalized next desk (the caller does the optimistic UI + revert).
async function _pushTradingDesk(desk) {
  const sb = client(); const uid = await currentUid();
  if (!sb || !uid) throw new Error('NO SESSION');
  const list = Array.isArray(desk.list) ? desk.list : [];
  const bias = desk.bias || '';
  const sealed = !!desk.sealed;
  const sealedAt = sealed ? (desk.sealedAt || Date.now()) : null;
  const broke = !!desk.broke;
  const { error } = await sb.from('trading').upsert({
    user_id: uid, date: TODAY, bias, list,
    sealed, sealed_at: sealedAt ? new Date(sealedAt).toISOString() : null, broke,
  }, { onConflict: 'user_id,date' });
  if (error) throw error;
  return { date: TODAY, bias, list, sealed, sealedAt, broke, exists: true, seeded: false };
}

// Toggle one checklist item's done flag for TODAY. Sealed = read-only (mirrors
// trading.js toggleTR's `if(S.tr.sealed) return`). Returns the next desk.
export async function toggleTradingItem(itemId, desk) {
  if (desk && desk.sealed) return desk;                    // locked
  const base = desk || {};
  const list = (Array.isArray(base.list) ? base.list : [])
    .map(it => it && it.id === itemId ? { ...it, d: !it.d } : it);
  return _pushTradingDesk({ ...base, list });
}

// Set TODAY's bias. Typing/clearing the bias auto-(un)checks the「记录今日交易偏向」
// item (id t6, else by text) ONLY on the empty↔non-empty transition — faithful
// to trading.js onBias so a deliberate manual (un)check with text present stands.
export async function setTradingBias(bias, desk) {
  if (desk && desk.sealed) return desk;                    // bias read-only once sealed
  const base = desk || {};
  const nextBias = (bias || '').trim();
  const wasEmpty = !((base.bias || '').trim().length > 0);
  const nowEmpty = !(nextBias.length > 0);
  const list = (Array.isArray(base.list) ? base.list : []).map(it => ({ ...it }));
  if (nowEmpty !== wasEmpty) {
    const it = list.find(i => i && i.id === 't6') || list.find(i => i && i.t === '记录今日交易偏向');
    if (it) it.d = !nowEmpty;
  }
  return _pushTradingDesk({ ...base, bias: nextBias, list });
}

// 盘前封存 — seal TODAY's commitment (bias + checklist go read-only). Stamps
// sealed_at. Mirrors trading.js trSeal.
export async function sealTradingDesk(desk) {
  if (desk && desk.sealed) return desk;
  return _pushTradingDesk({ ...(desk || {}), sealed: true, sealedAt: Date.now() });
}

// 破封 — break the seal: unlocks and leaves a `broke` trace. Mirrors trading.js
// trBreak (the caller owns the confirm gate).
export async function unsealTradingDesk(desk) {
  if (desk && !desk.sealed) return desk;
  return _pushTradingDesk({ ...(desk || {}), sealed: false, broke: true });
}
