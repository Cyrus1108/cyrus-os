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

export async function loadMorning(uid) {
  const sb = client(); if (!sb || !uid) return { list: [], date: TODAY, exists: false };
  const { data, error } = await sb.from('morning').select('*')
    .eq('user_id', uid).eq('date', TODAY).maybeSingle();
  if (error) throw error;
  return { list: (data && Array.isArray(data.list)) ? data.list : [], date: TODAY, exists: !!data };
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
  const sb = client(); if (!sb || !uid) return { accounts: [], transactions: [] };
  const [aRes, tRes] = await Promise.all([
    sb.from('fin_accounts').select('*').eq('user_id', uid),
    sb.from('fin_transactions').select('*').eq('user_id', uid).order('date', { ascending: false }),
  ]);
  if (aRes.error) throw aRes.error;
  if (tRes.error) throw tRes.error;
  return { accounts: aRes.data || [], transactions: tRes.data || [] };
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
  const keys = ['the90', 'morning', 'academics', 'japanese', 'todos', 'trading', 'system'];
  const fns  = [loadThe90, loadMorning, loadAcademics, loadJapanese, loadTodos, loadTrading, loadSystem];
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
