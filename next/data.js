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
  const keys = ['the90', 'morning', 'academics', 'japanese', 'todos', 'trading', 'system', 'tradingDesk', 'rpg'];
  const fns  = [loadThe90, loadMorning, loadAcademics, loadJapanese, loadTodos, loadTrading, loadSystem, loadTradingDesk, loadRpg];
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

// ── RPG (登升区 / ASCENSION) — READ-ONLY mirror of scripts/rpg.js ────────────
// Everything here is display math. NEXT never writes rpg_state: level-ups,
// achievement unlocks and the daily challenge roll stay the main app's job
// (rpg.js ↔ rpg-stats.py are a mirror pair; this is a THIRD copy of the pure
// formulas only — if you touch the EXP curve / attr matrix there, sync here).
export const RPG_ATTRS = [
  { key: 'STR', name: '力量', icon: '⚔︎' },
  { key: 'AGI', name: '敏捷', icon: '➹︎' },
  { key: 'INT', name: '智力', icon: '✦︎' },
  { key: 'WIS', name: '智慧', icon: '☯︎' },
  { key: 'VIT', name: '体力', icon: '❀︎' },
  { key: 'CRE', name: '创造', icon: '⚙︎' },
];
const RPG_ATTR_ORDER = ['STR', 'AGI', 'INT', 'WIS', 'VIT', 'CRE'];
// the90 target id → attribute weights (sleep is the foundation → feeds all six)
const RPG_ACTIVITY_ATTR = {
  I:   { STR: 1, AGI: 1, INT: 1, WIS: 1, VIT: 1, CRE: 1 },
  II:  { INT: 1, WIS: 1 },
  III: { INT: 1, CRE: 1 },
  IV:  { STR: 1, AGI: 1 },
  V:   { VIT: 1, WIS: 1, INT: 1 },
};
const RPG_TITLES = { E: '觉醒者', D: '挑战者', C: '攀登者', B: '破限者', A: '支配者', S: '君主' };
export const RPG_TIER_EXP = { bronze: 15, silver: 30, gold: 50, platinum: 100 };
export const RPG_ACH_CATS = [
  { key: 'streak', label: '坚持 · STREAK' },
  { key: 'perfect', label: '圆满 · MASTERY' },
  { key: 'journey', label: '历程 · JOURNEY' },
  { key: 'attribute', label: '属性 · ATTRIBUTE' },
  { key: 'power', label: '战力 · POWER' },
  { key: 'rank', label: '阶位 · RANK' },
  { key: 'exp', label: '经验 · EXP' },
  { key: 'japanese', label: '语学 · JAPANESE' },
  { key: 'crossdomain', label: '修行 · DISCIPLINE' },
  { key: 'finance', label: '财富 · FINANCE' },
  { key: 'fitness', label: '体魄 · FITNESS' },
  { key: 'ai', label: '自动化 · AUTOMATION' },
  { key: 'adversity', label: '逆境 · ADVERSITY' },
];
// static gallery metadata only — [id, cat, tier, name, desc, hidden] — the
// unlock TESTS live in rpg.js (they close over main-app state); NEXT displays
// the persisted unlock set from rpg_state.achievements (append-only jsonb).
const RPG_ACH_ROWS = [
  ['streak3', 'streak', 'bronze', '三日不辍', 'The 90 连续达标 3 天', 0],
  ['streak7', 'streak', 'bronze', '一周如一', '连续达标 7 天', 0],
  ['streak14', 'streak', 'silver', '意志试炼', '连续达标 14 天', 1],
  ['streak30', 'streak', 'gold', '而立之恒', '连续达标 30 天', 0],
  ['streak60', 'streak', 'platinum', '炼狱不熄', '连续达标 60 天', 0],
  ['comeback', 'streak', 'silver', '浴火重生', '断档之后，重建 7 天连续达标', 1],
  ['perfect', 'perfect', 'bronze', '圆满一日', '单日五项目标全部达成', 0],
  ['perfectwk', 'perfect', 'gold', '影之支配', '连续 7 天五项全清', 1],
  ['perfectmonth', 'perfect', 'platinum', '无瑕之月', '连续 30 天五项全清', 1],
  ['day30', 'journey', 'bronze', '第一阶段', '抵达 The 90 第 30 天', 0],
  ['day60', 'journey', 'silver', '第二阶段', '抵达第 60 天', 0],
  ['day90', 'journey', 'gold', '登顶', '完成 90 天的旅程', 0],
  ['attr_int35', 'attribute', 'gold', '通明之巅', '智力 INT 达到 35', 0],
  ['attr_cre35', 'attribute', 'gold', '造物之巅', '创造 CRE 达到 35', 0],
  ['attr_balanced', 'attribute', 'platinum', '六维调和', '六项属性全部 ≥ 30 · 无短板', 0],
  ['power150', 'power', 'gold', '破百五十', '战力达到 150', 0],
  ['power180', 'power', 'platinum', '君临战力', '战力达到 180', 1],
  ['lv10', 'rank', 'bronze', 'D 级觉醒', '等级达到 10 · 晋升 D 级', 0],
  ['lv20', 'rank', 'silver', 'C 级猎人', '等级达到 20 · 晋升 C 级', 1],
  ['rank_b', 'rank', 'gold', '破限者', '晋升至 B 级（等级 35）', 0],
  ['rank_a', 'rank', 'platinum', '支配者', '晋升至 A 级（等级 55）', 0],
  ['rank_s', 'rank', 'platinum', '君主', '晋升至 S 级 · 君主加冕', 1],
  ['exp2000', 'exp', 'silver', '积跬步', '累计经验突破 2000', 0],
  ['exp5000', 'exp', 'platinum', '至千里', '累计经验突破 5000', 1],
  ['n2_10', 'japanese', 'bronze', '语之初径', 'N2 连续打卡 10 天', 0],
  ['n2_30', 'japanese', 'silver', '言之恒心', 'N2 连续打卡 30 天', 0],
  ['n2_60', 'japanese', 'gold', '言出于恒', 'N2 连续打卡 60 天', 0],
  ['n2_vol50', 'japanese', 'silver', '百炼之卷', 'N2 累计打卡 50 天', 0],
  ['ac_alldone', 'crossdomain', 'bronze', '学海无波', '学业待办全部完成', 0],
  ['ac_volume10', 'crossdomain', 'silver', '课业不辍', '累计完成 10 项学业', 0],
  ['cleardesk', 'crossdomain', 'bronze', '万事清零', '把待办全部清空', 1],
  ['td_burst5', 'crossdomain', 'silver', '雷厉风行', '单日完成 5 项待办', 0],
  ['td_volume50', 'crossdomain', 'gold', '积少成多', '累计完成 50 项待办', 0],
  ['fin_log_streak7', 'finance', 'silver', '锱铢必录', '连续 7 天记账', 0],
  ['fin_goal_reached', 'finance', 'gold', '积羽沉舟', '达成一个存钱目标', 0],
  ['fin_nw_10k', 'finance', 'bronze', '积铢成两', '净资产突破 RM 10,000', 0],
  ['fin_nw_50k', 'finance', 'silver', '渐入佳境', '净资产突破 RM 50,000', 0],
  ['fin_nw_100k', 'finance', 'gold', '富甲一方', '净资产突破 RM 100,000', 0],
  ['fin_nw_250k', 'finance', 'platinum', '富可敌国', '净资产突破 RM 250,000', 1],
  ['cross1', 'adversity', 'bronze', '初渡', '第一次穿越低谷日', 0],
  ['cross7', 'adversity', 'gold', '渡厄', '穿越低谷日 7 次', 0],
  ['cross30', 'adversity', 'platinum', '渡劫', '穿越低谷日 30 次', 1],
  ['fit_first', 'fitness', 'bronze', '初次启程', '完成第一次训练打卡', 0],
  ['fit_streak7', 'fitness', 'silver', '七日锻形', '连续训练 7 天', 0],
  ['fit_streak30', 'fitness', 'gold', '铁律之躯', '连续训练 30 天', 0],
  ['fit_vol1000', 'fitness', 'silver', '千锤百炼', '累计完成 1000 次', 0],
  ['fit_plan_week', 'fitness', 'gold', '周而复始', '完成一整周的训练计划', 0],
  ['fit_body_log', 'fitness', 'bronze', '丈量自身', '首次记录体征数据', 1],
  ['ai_first', 'ai', 'bronze', '第一次造物', '记录第一条 AI Automation 产出', 0],
  ['ai_vol10', 'ai', 'bronze', '十件成器', '累计 10 条产出', 0],
  ['ai_vol50', 'ai', 'silver', '匠人之路', '累计 50 条产出', 0],
  ['ai_vol200', 'ai', 'platinum', '造物主', '累计 200 条产出', 1],
  ['ai_streak7', 'ai', 'silver', '七日不辍', '连续 7 天有产出', 0],
  ['ai_streak30', 'ai', 'gold', '自动化之魂', '连续 30 天有产出', 0],
  ['ai_ship10', 'ai', 'gold', '交付者', '累计交付 10 件（shipped）', 0],
];
export const RPG_ACH_META = RPG_ACH_ROWS.map(r =>
  ({ id: r[0], cat: r[1], tier: r[2], name: r[3], desc: r[4], hidden: !!r[5] }));
const RPG_ACH_TIER = {};
for (const a of RPG_ACH_META) RPG_ACH_TIER[a.id] = a.tier;

export async function loadRpg(uid) {
  const sb = client(); if (!sb || !uid) return null;
  const { data, error } = await sb.from('rpg_state').select('*').eq('user_id', uid).maybeSingle();
  if (error) throw error;
  return data || null;
}

// cumulative EXP required to BE at level L (k→k+1 costs 100+(k-1)*25)
function rpgExpForLevel(L) { let s = 0; for (let k = 1; k < L; k++) s += 100 + (k - 1) * 25; return s; }
function rpgRankOf(L) { return L >= 80 ? 'S' : L >= 55 ? 'A' : L >= 35 ? 'B' : L >= 20 ? 'C' : L >= 10 ? 'D' : 'E'; }

// The full character sheet, derived from the90 raw rows + the rpg_state row.
// Level/EXP mirror rpgTotalExp/computeRPG; attributes are the 30-day form.
export function computeRpg(the90raw, rpgRow) {
  if (!the90raw) return null;
  const meta = the90raw.meta, dailyRows = the90raw.daily || [];
  const start = (meta && meta.start_date) || THE90_START_DEFAULT;
  const targets = (meta && Array.isArray(meta.targets) && meta.targets.length)
    ? meta.targets : TARGETS_DEFAULT;
  const byDate = Object.create(null);
  for (const r of dailyRows) if (r && r.date) byDate[r.date] = r;
  const metOn = (ds) => {
    const row = byDate[ds]; if (!row) return 0;
    const ph = phaseOf(dayIndex(ds, start));
    const scores = row.scores || {};
    return targets.reduce((n, t) => n + (scoreMet(scores[t.id], ph) ? 1 : 0), 0);
  };
  // ── total EXP: met*10 per day, perfect-day +25, phase milestones +50 ──
  let exp = 0;
  for (const ds in byDate) {
    if (ds > TODAY) continue;
    const met = metOn(ds);
    exp += met * 10;
    if (targets.length && met === targets.length) exp += 25;
  }
  const day = dayIndex(TODAY, start);
  if (day >= 30) exp += 50;
  if (day >= 60) exp += 50;
  if (day >= 90) exp += 50;
  const ach = (rpgRow && rpgRow.achievements) || {};
  let achExp = 0;
  for (const id in ach) achExp += RPG_TIER_EXP[RPG_ACH_TIER[id]] || 0;
  const totalExp = exp + ((rpgRow && rpgRow.bonus_exp) || 0) + achExp;
  let level = 1;
  while (totalExp >= rpgExpForLevel(level + 1)) level++;
  const rank = rpgRankOf(level);
  // ── attributes: weighted 30-day met-fraction per feeder activity (10..100) ──
  const counts = {};
  for (const t of targets) counts[t.id] = 0;
  for (let i = 0; i < 30; i++) {
    const ds = isoMinusDays(TODAY, i);
    const row = byDate[ds]; if (!row) continue;
    const ph = phaseOf(dayIndex(ds, start));
    const scores = row.scores || {};
    for (const t of targets) if (scoreMet(scores[t.id], ph)) counts[t.id]++;
  }
  const attrs = {};
  for (const k of RPG_ATTR_ORDER) {
    let wsum = 0, num = 0;
    for (const tid in RPG_ACTIVITY_ATTR) {
      const w = RPG_ACTIVITY_ATTR[tid][k]; if (!w) continue;
      num += w * ((counts[tid] || 0) / 30);
      wsum += w;
    }
    attrs[k] = wsum ? Math.round(10 + 90 * (num / wsum)) : 10;
  }
  const power = RPG_ATTR_ORDER.reduce((s, k) => s + attrs[k], 0);
  // today's challenge is DISPLAYED only when the main app already rolled it
  const challenge = (rpgRow && rpgRow.daily && rpgRow.daily.date === TODAY) ? rpgRow.daily : null;
  return {
    level, rank, title: RPG_TITLES[rank] || '', totalExp,
    expInLevel: totalExp - rpgExpForLevel(level),
    expForLevel: rpgExpForLevel(level + 1) - rpgExpForLevel(level),
    attrs, counts, power,
    achievements: ach, achCount: Object.keys(ach).length, achExp,
    challenge, seenLevel: (rpgRow && rpgRow.seen_level) || level,
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
