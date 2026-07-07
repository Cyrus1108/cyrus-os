// ============================================================================
// CYRUS://NEXT — COMMAND DECK · main.js
// Orchestrates: boot self-check → deck reveal → orbit/scroll/focus interaction
// → slant HUD overlay. Owns the (single) MOCK data object, minimal WebAudio,
// Lenis scroll, and all degradation paths (mobile / reduced-motion / no-WebGL).
// ============================================================================
import { createScene } from './scene.js';
import * as DB from './data.js';

const gsap = window.gsap;
const Lenis = window.Lenis;
const pad = n => String(n).padStart(2, '0');

// ── environment gates ───────────────────────────────────────────────────────
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = window.matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0);
const IS_MOBILE = COARSE || window.innerWidth < 720;

// ════════════════════════════════════════════════════════════════════════════
// MOCK — the single data seam. Swap this object for the Supabase pipeline later;
// shape is real (90 days × 5 tracks, real dates, believable completion rates).
// ════════════════════════════════════════════════════════════════════════════
const MOCK = (() => {
  const N = 90;
  const START = Date.UTC(2026, 4, 11);           // 2026-05-11 · D1 (the challenge's genesis)
  const TODAY_IDX = 56;                           // D57 = 2026-07-06 (in progress)
  let s = 0x9e3779b9;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const TRACKS = ['RISE', 'STUDY', 'JP', 'TRADE', 'BODY'];
  const the90 = [];
  for (let i = 0; i < N; i++) {
    const d = new Date(START + i * 86400000);
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    if (i > TODAY_IDX) { the90.push({ date, tracks: null, score: null, ghost: true }); continue; }
    const ramp = 0.42 + 0.4 * (i / (N - 1));      // upward discipline curve
    const weekly = Math.sin(i / 7 * Math.PI * 2) * 0.06;
    const tracks = TRACKS.map(() => Math.max(0, Math.min(1, ramp + weekly + (rnd() - 0.5) * 0.5)));
    let score = tracks.reduce((a, b) => a + b, 0) / tracks.length;
    if (i === TODAY_IDX) { score = 0.55; }         // today: in-progress
    the90.push({ date, tracks, score: Math.round(score * 100) / 100 });
  }
  const real = the90.slice(0, TODAY_IDX + 1);
  const days30 = real.slice(-30);
  const avg30 = Math.round(days30.reduce((a, d) => a + d.score, 0) / days30.length * 100);
  // longest streak of score ≥ 0.6 (real days only)
  let streak = 0, best = 0;
  for (const d of real) { if (d.score >= 0.6) { streak++; best = Math.max(best, streak); } else streak = 0; }

  // ── mini-viz series (HUD depth) ──────────────────────────────────────────
  const tr = real.slice(-13).map(d => d.tracks[3]);              // TRADE track → pseudo-OHLC
  const candles = [];
  for (let i = 1; i < tr.length; i++) {
    const o = tr[i - 1], c = tr[i], j = (rnd() * 0.12), k = (rnd() * 0.12);
    candles.push({ o, c, hi: Math.min(1, Math.max(o, c) + j), lo: Math.max(0, Math.min(o, c) - k) });
  }
  const viz = {
    sys30: real.slice(-30).map(d => d.score),                    // The90 last 30d
    rise7: real.slice(-7).map(d => d.tracks[0]),                 // wake-ritual 7d dots
    candles,                                                     // 12 mini candles (FINANCE ledger)
    credits: 108 / 120,
    todos: 12 / (12 + 7),
    jp: 1 - 88 / 120,                                            // exam prep progress
    trade: 4 / 6,                                                // TRADING pre-market checklist
  };

  const the90info = {
    demo: true, phase: 'stabilize', todayScores: {}, todayNote: '',
    targets: ['RISE', 'MEDITATE', 'AI BUILD', 'TRAIN', 'ENERGY']
      .map((l, i) => ({ id: ['I', 'II', 'III', 'IV', 'V'][i], label: l })),
  };
  return {
    version: 'v0.1.0-deck', build: '2026.07.06', user: 'qjun.aom', tz: '+08:00',
    live: false, the90info,
    the90, todayIndex: TODAY_IDX, avg30, best, viz,
    stations: [
      { id: 'MORNING', label: 'MORNING', glyph: '☉', tag: 'STREAK <b>42d</b> · WAKE <b>05:40</b>',
        hud: { kicker: 'RITUAL / 日冕', cells: [
          { k: 'Wake streak', v: '42', unit: 'days' },
          { k: 'Avg wake', v: '05:40', accent: 'cyan' },
          { k: 'Rituals today', v: '5', unit: '/ 5' },
          { k: 'Sunlight', v: '18', unit: 'min', accent: 'cyan' },
        ], note: 'Cold plunge + 20-min mobility logged <b>6/7</b> this week.' } },
      { id: 'ACADEMICS', label: 'ACADEMICS', glyph: '§', tag: 'GPA <b>3.86</b> · CR <b>108/120</b>',
        hud: { kicker: 'SCHOLARSHIP / 书碑', cells: [
          { k: 'GPA', v: '3.86', unit: '/ 4.0' },
          { k: 'Credits', v: '108', unit: '/ 120', accent: 'cyan' },
          { k: 'Papers', v: '2', unit: 'in review' },
          { k: 'Deadlines', v: '3', unit: 'this month', accent: 'cyan' },
        ], note: 'Thesis draft <b>ch.3/5</b> · next defense checkpoint in 12 days.' } },
      { id: 'JP-N2', label: 'JP-N2', glyph: '⛩', tag: 'KANJI <b>1200</b> · EXAM <b>D-88</b>',
        hud: { kicker: 'LANGUAGE / 鳥居', cells: [
          { k: 'Kanji', v: '1200', unit: '/ 1200' },
          { k: 'Mock score', v: '128', unit: '/ 180', accent: 'cyan' },
          { k: 'Grammar', v: '86', unit: '%' },
          { k: 'Exam', v: 'D-88', accent: 'cyan' },
        ], note: 'Weak on 聴解 — <b>62%</b>. Shadowing block scheduled daily 21:00.' } },
      { id: 'TRADING', label: 'TRADING', glyph: '↗', tag: 'CHECK <b>4/6</b> · OPEN',
        hud: { kicker: 'PRE-MARKET / 盘前封条', cells: [
          { k: 'Checklist', v: '4', unit: '/ 6' },
          { k: 'Complete', v: '67', unit: '%', accent: 'cyan' },
          { k: 'Seal', v: 'OPEN' },
          { k: 'Bias', v: 'SET', accent: 'cyan' },
        ], note: 'Pre-market discipline — set today’s bias, run the checklist, then 盘前封存 to lock the plan.' } },
      { id: 'FINANCE', label: 'FINANCE', glyph: '¥', tag: 'ACCTS <b>4</b> · TX <b>214</b>',
        hud: { kicker: 'LEDGER / 账簿碑', cells: [
          { k: 'Accounts', v: '4' },
          { k: 'Transactions', v: '214', unit: 'YTD', accent: 'cyan' },
          { k: 'Liabilities', v: '1' },
          { k: 'Last entry', v: 'JUL 06', accent: 'cyan' },
        ], note: 'Full ledger — link to record, edit and delete transactions.' } },
      { id: 'TODOS', label: 'TODOS', glyph: '▤', tag: 'OPEN <b>7</b> · DONE <b>12</b>',
        hud: { kicker: 'BACKLOG / 堆叠', cells: [
          { k: 'Open', v: '7' },
          { k: 'Done today', v: '12', accent: 'cyan' },
          { k: 'Overdue', v: '1' },
          { k: 'Focus blocks', v: '4', unit: 'today', accent: 'cyan' },
        ], note: 'Next up: <b>submit visa docs</b> · due today 18:00.' } },
      { id: 'SYSTEM', label: 'SYSTEM', glyph: '◇', tag: 'LV <b>24</b> · RANK <b>C</b>',
        hud: { kicker: 'CORE / 核心', cells: [
          { k: 'Level', v: '24' },
          { k: 'Uptime', v: '312', unit: 'days', accent: 'cyan' },
          { k: 'Integrity', v: '98', unit: '%' },
          { k: 'Modules', v: '6', unit: '/ 6', accent: 'cyan' },
        ], note: 'The90 30-day avg <b id="sys-avg"></b> · longest streak <b id="sys-streak"></b>.' } },
    ],
    // demo character sheet — same shape computeRpg returns (drives the SYSTEM
    // monument: rings=rank, rungs=EXP, shards=achievements, radar=attrs)
    rpg: {
      level: 24, rank: 'C', title: '攀登者', totalExp: 3120,
      expInLevel: 340, expForLevel: 675,
      attrs: { STR: 52, AGI: 48, INT: 66, WIS: 58, VIT: 44, CRE: 61 },
      counts: {}, power: 329,
      achievements: {}, achCount: 14, achExp: 0,
      challenge: { attr: 'VIT', target: 'V', claimed: false, penalty: false },
      seenLevel: 24,
    },
  };
})();

// ════════════════════════════════════════════════════════════════════════════
// ACTIVE data seam — DATA is MOCK (demo) until a real session + load succeeds,
// then it's swapped for a live object of the IDENTICAL shape (built in
// buildLiveData). LIVE flips the footer/boot copy and enables the two writers.
// ════════════════════════════════════════════════════════════════════════════
let DATA = MOCK;
let LIVE = false;
let lenis = null;                 // hoisted so HUD open/close can pause scroll
let hudFlew = false;              // true when the current HUD flew the camera (station)
let hudKind = 'station';          // 'station' | 'the90'

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ── terminal decode/scramble — glyph churn that settles into the final text ──
// Hand-rolled (rAF), cheap, cancellable. reduced-motion → final text instantly.
// Purely presentational: only writes el.textContent, never touches data.
const SCRAMBLE_GLYPHS = '▚▞▛▜░▒▓#<>/\\|=+*·:.—_0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
// active-scramble registry + ONE global listener: if the tab is backgrounded
// mid-scramble, settle every running scramble to its final text immediately
// (rAF is throttled/paused while hidden, which would freeze a garbage frame).
const _activeScrambles = new Set();
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) for (const fin of [..._activeScrambles]) fin();
  });
}
function scramble(el, finalText, dur = 460) {
  if (!el) return;
  const text = finalText != null ? finalText : el.textContent;
  if (REDUCED || !text) { el.textContent = text || ''; return; }
  if (el._scrRAF) cancelAnimationFrame(el._scrRAF);
  if (el._scrFin) _activeScrambles.delete(el._scrFin);           // drop a superseded finalizer
  const chars = [...text];
  const settleAt = chars.map(() => 0.15 + Math.random() * 0.6);   // per-char lock-in
  const g = SCRAMBLE_GLYPHS, gl = g.length;
  const start = (typeof performance !== 'undefined' ? performance : Date).now();
  const finalize = () => {
    if (el._scrRAF) cancelAnimationFrame(el._scrRAF);
    el._scrRAF = null; el.textContent = text;
    _activeScrambles.delete(finalize); el._scrFin = null;
  };
  el._scrFin = finalize; _activeScrambles.add(finalize);
  const step = (t) => {
    const p = Math.min(1, (t - start) / dur);
    let out = '';
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      out += (c === ' ' || p >= settleAt[i]) ? c : g[(Math.random() * gl) | 0];
    }
    el.textContent = out;
    if (p < 1) { el._scrRAF = requestAnimationFrame(step); }
    else { finalize(); }                                          // settle + deregister
  };
  el._scrRAF = requestAnimationFrame(step);
}

// The 90 per-target display helpers (mirror data.js scoreMet semantics) --------
function the90IsMet(score, phase) {
  return phase === 'stabilize' ? (typeof score === 'number' ? score > 0 : !!score) : !!score;
}
function the90StateLabel(score, phase) {
  if (phase === 'stabilize') { const n = typeof score === 'number' ? score : 0; return n > 0 ? String(n) : '—'; }
  return score ? '✓' : '—';
}

// ════════════════════════════════════════════════════════════════════════════
// minimal WebAudio — 3 cues, gesture-gated (no sound until first user gesture)
// ════════════════════════════════════════════════════════════════════════════
// Ported from scripts/sound.js's approach: oscillator + filtered-noise voices
// routed through a master → lowpass → compressor chain plus a procedural
// convolution reverb (decaying-noise impulse) so cues sit "in space".
const audio = (() => {
  let ctx = null, master = null, verb = null, noiseBuf = null, armed = false;
  const ensure = () => {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      try { ctx = new AC(); } catch { return null; }
      master = ctx.createGain(); master.gain.value = 0.22;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 8200;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -22; comp.knee.value = 18; comp.ratio.value = 5;
      comp.attack.value = 0.004; comp.release.value = 0.16;
      master.connect(lp); lp.connect(comp); comp.connect(ctx.destination);
      try {
        verb = ctx.createConvolver();
        const rate = ctx.sampleRate, len = Math.floor(rate * 1.3), buf = ctx.createBuffer(2, len, rate);
        for (let ch = 0; ch < 2; ch++) { const dd = buf.getChannelData(ch);
          for (let i = 0; i < len; i++) dd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8); }
        verb.buffer = buf; verb.connect(master);
      } catch { verb = null; }
    }
    if (ctx.state === 'suspended') { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch {} }
    return ctx;
  };
  // low breathing ambient drone — started ONCE after the first gesture, sits far
  // under the cues (gentle LFO on its own gain, lowpassed so it's felt not heard).
  let drone = null;
  const startDrone = () => {
    if (drone || REDUCED || !ctx || !master) return;
    try {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.03, ctx.currentTime + 4);   // slow fade-in
      const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;      // A1
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 82.4;    // fifth
      o2.detune.value = 5;
      const g2 = ctx.createGain(); g2.gain.value = 0.4;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180; lp.Q.value = 0.6;
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.08;  // ~12.5s breath
      const lfoG = ctx.createGain(); lfoG.gain.value = 0.013;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(master);
      o1.start(); o2.start(); lfo.start();
      drone = { g, o1, o2, lfo };
    } catch { drone = null; }
  };
  const arm = () => { armed = true; ensure(); startDrone(); };
  const noise = () => {
    if (noiseBuf) return noiseBuf;
    const rate = ctx.sampleRate, len = Math.floor(rate * 0.5); noiseBuf = ctx.createBuffer(1, len, rate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  };
  const send = (node, n) => { node.connect(master); if (n.verb && verb) { const w = ctx.createGain(); w.gain.value = n.verb; node.connect(w); w.connect(verb); } };
  const voice = (t0, n) => {
    const dur = n.dur || 0.18, atk = n.attack || 0.006, rel = n.release || 0.12;
    const o = ctx.createOscillator(); o.type = n.type || 'sine'; o.frequency.setValueAtTime(n.freq, t0);
    if (n.slideTo) o.frequency.exponentialRampToValueAtTime(n.slideTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(n.gain || 0.4, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + rel);
    o.connect(g); send(g, n); o.start(t0); o.stop(t0 + dur + rel + 0.02);
  };
  const nVoice = (t0, n) => {
    const dur = n.dur || 0.05, atk = n.attack || 0.003, rel = n.release || 0.05;
    const src = ctx.createBufferSource(); src.buffer = noise(); src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = n.fType || 'bandpass';
    f.frequency.setValueAtTime(n.f0 || 1800, t0);
    if (n.f1) f.frequency.exponentialRampToValueAtTime(n.f1, t0 + dur);
    f.Q.value = n.q || 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(n.gain || 0.3, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + rel);
    src.connect(f); f.connect(g); send(g, n); src.start(t0); src.stop(t0 + dur + rel + 0.02);
  };
  const play = (osc, noises) => {
    if (!armed || !ensure()) return; const t = ctx.currentTime + 0.02;
    (osc || []).forEach(n => voice(t + (n.at || 0), n));
    (noises || []).forEach(n => nVoice(t + (n.at || 0), n));
  };
  return {
    arm,
    // boot power-on — noise riser + rising saw, spacious tail
    powerup: () => play(
      [{ at: 0.02, freq: 180, dur: 0.5, type: 'sawtooth', gain: 0.16, slideTo: 620, verb: 0.4 }],
      [{ at: 0, f0: 260, f1: 2600, dur: 0.22, gain: 0.12, q: 2.4, verb: 0.5 }]),
    // target-lock click — 2ms noise transient + glass pip
    tick: () => play(
      [{ at: 0.004, freq: 1318, dur: 0.045, type: 'sine', gain: 0.24, release: 0.07 }],
      [{ at: 0, f0: 2600, f1: 4200, dur: 0.016, gain: 0.18, q: 1.0 }]),
    // HUD open — holographic sweep, rising fifth in space
    hud: () => play(
      [{ at: 0.02, freq: 440, dur: 0.24, type: 'triangle', gain: 0.16, slideTo: 880, verb: 0.5 },
       { at: 0.06, freq: 660, dur: 0.2, type: 'sine', gain: 0.1, verb: 0.55 }],
      [{ at: 0, f0: 320, f1: 2400, dur: 0.16, gain: 0.11, q: 2.4, verb: 0.5 }]),
    // bloom-pulse sink — a low-frequency floor drop under the HUD reveal
    sink: () => play(
      [{ at: 0, freq: 120, dur: 0.28, type: 'sine', gain: 0.34, slideTo: 62, release: 0.3, verb: 0.35 },
       { at: 0, freq: 60, dur: 0.34, type: 'sine', gain: 0.22, slideTo: 42, release: 0.35 }],
      [{ at: 0, f0: 180, f1: 70, dur: 0.14, gain: 0.06, q: 1.6, verb: 0.4 }]),
  };
})();

// ════════════════════════════════════════════════════════════════════════════
// boot self-check sequence (≤1.6s, skippable)
// ════════════════════════════════════════════════════════════════════════════
function runBoot(onDone) {
  const bootEl = document.getElementById('boot');
  const log = document.getElementById('boot-log');
  const lines = [
    { t: `CYRUS://NEXT  ${DATA.version}`, c: 'hd' },
    { t: `[ok] kernel ................. mounted`, c: 'ok' },
    { t: `[ok] tactical-grid .......... online`, c: 'ok' },
    { t: LIVE ? `[ok] the90.datastore ........ 90d synced` : `[--] the90.datastore ........ demo dataset`, c: LIVE ? 'ok' : 'hd' },
    { t: `[ok] modules ................ 6/6 linked`, c: 'ok' },
    { t: `[ok] audio.webaudio ......... armed`, c: 'ok' },
    { t: `[${LIVE ? 'ok' : '--'}] session ${DATA.user} .. ${DATA.build} ${DATA.tz}`, c: LIVE ? 'ok' : 'hd' },
    { t: LIVE ? `> deck ready` : `> deck ready · OFFLINE (demo)`, c: 'hd' },
  ];
  if (REDUCED) { finish(); return; }               // reduced-motion: skip ceremony
  let i = 0; const timers = [];
  const step = () => {
    if (i >= lines.length) { timers.push(setTimeout(finish, 200)); return; }
    const ln = lines[i++];
    log.innerHTML += `<span class="${ln.c || ''}">${ln.t}</span>\n`;
    timers.push(setTimeout(step, 150));
  };
  const cursor = () => { log.innerHTML += `<span class="cur">_</span>`; };
  step();
  let done = false;
  function finish() {
    if (done) return; done = true;
    timers.forEach(clearTimeout);
    cursor();
    bootEl.classList.add('is-gone');
    document.documentElement.dataset.boot = 'done';
    setTimeout(() => { bootEl.remove(); }, 550);
    onDone();
  }
  function skip(e) {
    if (done) return;
    audio.arm(); audio.powerup();                   // gesture → sound allowed
    finish();
  }
  window.addEventListener('pointerdown', skip, { once: true });
  window.addEventListener('keydown', skip, { once: true });
}

// ════════════════════════════════════════════════════════════════════════════
// no-WebGL fallback (plain DOM module list)
// ════════════════════════════════════════════════════════════════════════════
function webglOK() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); }
  catch { return false; }
}
function renderFallback() {
  document.getElementById('deck').hidden = true;
  const b = document.getElementById('boot'); if (b) b.remove();
  document.documentElement.dataset.boot = 'done';
  const el = document.getElementById('fallback'); el.hidden = false;
  el.innerHTML = `<h1>CYRUS://NEXT</h1><div class="fb-sub">COMMAND DECK · TEXT FALLBACK · ${LIVE ? 'LIVE' : 'DEMO'} · ${DATA.build}</div>
    <div class="fb-grid">${DATA.stations.map(s => `<div class="fb-card"><h2>${s.label}</h2>
      <ul>${s.hud.cells.map(c => `<li>${c.k}: <b>${c.v}${c.unit ? ' ' + c.unit : ''}</b></li>`).join('')}</ul></div>`).join('')}</div>`;
}

// ════════════════════════════════════════════════════════════════════════════
// HUD overlay
// ════════════════════════════════════════════════════════════════════════════
// ── mini-visualizations (DOM/SVG, monochrome, restrained) per station ────────
function svgBars(vals, hotIdx) {
  const n = vals.length, w = 100 / n;
  const rects = vals.map((v, i) => {
    const h = Math.max(2, v * 28), y = 30 - h;
    return `<rect class="${i === hotIdx ? 'mv-hot' : 'mv-bar'}" x="${(i * w + w * 0.16).toFixed(2)}" y="${y.toFixed(2)}" width="${(w * 0.68).toFixed(2)}" height="${h.toFixed(2)}"/>`;
  }).join('');
  return `<svg class="mv" viewBox="0 0 100 30" preserveAspectRatio="none">${rects}</svg>`;
}
function svgCandles(cs) {
  const n = cs.length, w = 100 / n;
  const body = cs.map((c, i) => {
    const cx = i * w + w / 2, up = c.c >= c.o;
    const cls = up ? 'mv-up' : 'mv-bar';
    const y = 30 - Math.max(c.o, c.c) * 28, bh = Math.max(1.4, Math.abs(c.c - c.o) * 28);
    const wy0 = 30 - c.hi * 28, wy1 = 30 - c.lo * 28;
    return `<line class="mv-wick" x1="${cx.toFixed(2)}" x2="${cx.toFixed(2)}" y1="${wy0.toFixed(2)}" y2="${wy1.toFixed(2)}"/>
      <rect class="${cls}" x="${(cx - w * 0.28).toFixed(2)}" y="${y.toFixed(2)}" width="${(w * 0.56).toFixed(2)}" height="${bh.toFixed(2)}"/>`;
  }).join('');
  return `<svg class="mv" viewBox="0 0 100 30" preserveAspectRatio="none">${body}</svg>`;
}
function svgDots(vals, thresh) {
  return `<div class="mv-dots">${vals.map(v => `<span class="${v >= thresh ? 'on' : ''}"></span>`).join('')}</div>`;
}
function svgRing(frac) {
  const r = 13, c = 2 * Math.PI * r, off = c * (1 - frac);
  return `<svg class="mv-ring" viewBox="0 0 32 32"><circle class="rg-t" cx="16" cy="16" r="${r}"/>
    <circle class="rg-p" cx="16" cy="16" r="${r}" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 16 16)"/></svg>`;
}
function svgMeter(frac) {
  return `<div class="mv-meter"><span style="width:${(frac * 100).toFixed(1)}%"></span></div>`;
}
function buildViz(id) {
  const v = DATA.viz;
  const L = (v && v.labels) || {};       // live labels override the demo defaults
  switch (id) {
    case 'SYSTEM': return { k: L.SYSTEM || 'THE 90 · LAST 30 DAYS', h: svgBars(v.sys30, v.sys30.length - 1) };
    case 'FINANCE': return { k: L.FINANCE || 'LEDGER · LAST 12', h: svgCandles(v.candles) };
    case 'TRADING': return { k: L.TRADING || 'PRE-MARKET · CHECKLIST', h: svgMeter(v.trade || 0) };
    case 'MORNING': return { k: L.MORNING || 'WAKE RITUAL · 7 DAYS', h: svgDots(v.rise7, 0.5) };
    case 'ACADEMICS': return { k: L.ACADEMICS || 'CREDITS · 108 / 120', h: svgMeter(v.credits) };
    case 'JP-N2': return { k: L['JP-N2'] || 'EXAM PREP · D-88', h: svgRing(v.jp) };
    case 'TODOS': return { k: L.TODOS || 'CLEARED TODAY · 12 / 19', h: svgMeter(v.todos) };
    default: return null;
  }
}
// count-up a numeric value span (mono), ~400ms; leaves non-numeric strings as-is
function countUp(el) {
  const raw = el.dataset.v;
  if (!gsap || REDUCED || !/^-?\d+(\.\d+)?$/.test(raw)) { el.textContent = raw; return; }
  const target = parseFloat(raw), dec = (raw.split('.')[1] || '').length, o = { v: 0 };
  gsap.to(o, { v: target, duration: 0.42, ease: 'power2.out',
    onUpdate() { el.textContent = o.v.toFixed(dec); }, onComplete() { el.textContent = raw; } });
}
// animate the mini-viz IN on HUD open: bars/candles grow from baseline, wicks
// fade, dots pop, the ring draws, the meter fills. Presentational only — reads
// the SVG's own final geometry (built by svg*/buildViz) and tweens up to it.
function animateViz(vizEl) {
  if (!vizEl || !gsap || REDUCED) return;
  vizEl.querySelectorAll('.mv-bar, .mv-hot, .mv-up').forEach((r, i) => {
    const h = parseFloat(r.getAttribute('height')) || 0, y = parseFloat(r.getAttribute('y')) || 0;
    gsap.fromTo(r, { attr: { height: 0.4, y: y + h - 0.4 } },
      { attr: { height: h, y }, duration: 0.5, ease: 'power2.out', delay: 0.18 + i * 0.03, overwrite: true });
  });
  const wicks = vizEl.querySelectorAll('.mv-wick');
  if (wicks.length) gsap.fromTo(wicks, { opacity: 0 }, { opacity: 1, duration: 0.4, delay: 0.3, stagger: 0.02, overwrite: true });
  const dots = vizEl.querySelectorAll('.mv-dots span');
  if (dots.length) gsap.fromTo(dots, { scale: 0 }, { scale: 1, duration: 0.34, ease: 'back.out(2)', stagger: 0.045, delay: 0.2, transformOrigin: '50% 50%', overwrite: true });
  const ring = vizEl.querySelector('.mv-ring .rg-p');
  if (ring) {
    const c = parseFloat(ring.getAttribute('stroke-dasharray')) || 0;
    gsap.fromTo(ring, { attr: { 'stroke-dashoffset': c } },
      { attr: { 'stroke-dashoffset': ring.getAttribute('stroke-dashoffset') }, duration: 0.7, ease: 'power2.out', delay: 0.2, overwrite: true });
  }
  const meter = vizEl.querySelector('.mv-meter span');
  if (meter) gsap.fromTo(meter, { width: '0%' }, { width: meter.style.width || '0%', duration: 0.6, ease: 'power2.out', delay: 0.2, overwrite: true });
}

const hudEl = document.getElementById('hud');
let hudOpen = false;

// ── shared HUD body builders ────────────────────────────────────────────────
function stationCellsHTML(cells) {
  return cells.map(c =>
    `<div class="hud-cell${c.wide ? ' wide' : ''}"><div class="hud-k">${esc(c.k)}</div>
     <div class="hud-v${c.accent === 'cyan' ? ' cyan' : ''}"><span class="num" data-v="${esc(c.v)}">${esc(c.v)}</span>${c.unit ? ` <small>${esc(c.unit)}</small>` : ''}</div></div>`
  ).join('');
}
// toggle rows (The 90 / morning). `attr` is the data-* holding the item id.
function logRowsHTML(rows, attr, head) {
  return `<div class="hud-cell wide"><div class="log-head">${esc(head)}</div><div class="log-wrap">` +
    rows.map(r => `<button class="log-row${r.met ? ' is-on' : ''}" ${attr}="${esc(r.id)}">` +
      `${r.tag ? `<span class="log-id">${esc(r.tag)}</span>` : ''}` +
      `<span class="log-lbl">${esc(r.label)}</span><span class="log-state">${esc(r.state)}</span></button>`).join('') +
    `</div></div>`;
}
// station id → writable row-click handler (all defined below; hoisted)
const WRITE_HANDLERS = {
  morning: (btn, st, scene) => onMorningRowClick(btn, scene),
  todos: (btn, st, scene) => onTodoRowClick(btn, scene),
  academics: (btn, st, scene) => onAcademicRowClick(btn, scene),
  japanese: (btn, st, scene) => onJapaneseRowClick(btn, scene),
};
function renderStationBody(st, scene) {
  if (st.id === 'FINANCE' && LIVE) { renderFinanceBody(st, scene); return; }        // finance CRUD body
  if (st.id === 'TRADING' && LIVE) { renderTradingDeskBody(st, scene); return; }     // pre-market desk body
  if (st.id === 'SYSTEM' && st.hud.rpg) { renderSystemBody(st); return; }            // RPG character sheet
  const body = document.getElementById('hud-body');
  let html = stationCellsHTML(st.hud.cells);
  const writable = LIVE && st.writable && WRITE_HANDLERS[st.writable] && Array.isArray(st.hud.rows);
  if (writable) {
    html += st.hud.rows.length
      ? logRowsHTML(st.hud.rows, 'data-rid', st.hud.rowsHead || 'TAP TO LOG')
      : `<div class="hud-cell wide"><div class="hud-note">${st.hud.emptyNote || 'NO SIGNAL — nothing to log.'}</div></div>`;
  } else {
    html += `<div class="hud-cell wide"><div class="hud-note">${st.hud.note}</div></div>`;
  }
  body.innerHTML = html;
  if (writable) {
    const handler = WRITE_HANDLERS[st.writable];
    body.querySelectorAll('.log-row[data-rid]').forEach(btn =>
      btn.addEventListener('click', () => handler(btn, st, scene)));
  }
  body.querySelectorAll('.hud-v .num').forEach(countUp);
}
// ── SYSTEM / RPG character sheet — read-only 登升区 panel ────────────────────
// Level/EXP/attrs/achievements all computed in data.js computeRpg (mirror of
// rpg.js); NEXT never writes rpg_state — unlocks & challenge rolls stay in the
// main app. This panel is the monarch's ledger, not its engine.
function renderSystemBody(st) {
  const r = st.hud.rpg;
  const body = document.getElementById('hud-body');
  let html = stationCellsHTML(st.hud.cells);
  // EXP bar toward next level
  const frac = r.expForLevel ? Math.max(0, Math.min(1, r.expInLevel / r.expForLevel)) : 0;
  html += `<div class="hud-cell wide"><div class="hud-k">EXP · LV ${r.level} → ${r.level + 1}</div>
    <div class="rpg-xp"><span style="width:${(frac * 100).toFixed(1)}%"></span></div>
    <div class="rpg-xp-n"><b>${r.expInLevel}</b> / ${r.expForLevel} · TOTAL <b>${r.totalExp}</b></div></div>`;
  // six attributes — 30-day form bars
  html += `<div class="hud-cell wide"><div class="log-head">ATTRIBUTES · 30D FORM</div><div class="rpg-attrs">` +
    DB.RPG_ATTRS.map(a => {
      const v = Math.max(0, Math.min(100, (r.attrs && r.attrs[a.key]) || 10));
      return `<div class="rpg-attr"><span class="ra-k">${a.icon} ${a.key} ${esc(a.name)}</span>` +
        `<span class="ra-bar"><i style="width:${v}%"></i></span><b class="ra-v">${v}</b></div>`;
    }).join('') + `</div></div>`;
  // daily challenge (display only — rolled & granted by the main app)
  const ch = r.challenge;
  const tName = (tid) => {
    const t = ((DATA.the90info && DATA.the90info.targets) || []).find(x => x && x.id === tid);
    return t ? (t.name || t.label || t.id) : (tid || '—');
  };
  html += `<div class="hud-cell wide"><div class="log-head">DAILY CHALLENGE · 直面弱点</div>` +
    (ch
      ? `<div class="rpg-chal${ch.claimed ? ' is-done' : ''}${ch.penalty ? ' is-pen' : ''}">` +
        `<span class="rc-attr">${esc(ch.attr || '—')}</span>` +
        `<span class="rc-t">${ch.target ? esc(tName(ch.target)) : '全部达成 · 无可指派'}</span>` +
        `<span class="rc-s">${ch.claimed ? '✓ 已完成 +20 EXP' : (ch.penalty ? '惩罚任务 · 前日懈怠' : 'OPEN')}</span></div>`
      : `<div class="hud-note">今日挑战尚未下达 — 由主系统（CyrusOS）滚动生成。</div>`) + `</div>`;
  // achievements gallery — 13 categories, unlocked bright, hidden masked
  const unlocked = r.achievements || {};
  html += `<div class="hud-cell wide"><div class="log-head">ACHIEVEMENTS · ${r.achCount} / ${DB.RPG_ACH_META.length}</div><div class="rpg-ach">`;
  for (const cat of DB.RPG_ACH_CATS) {
    const items = DB.RPG_ACH_META.filter(a => a.cat === cat.key);
    if (!items.length) continue;
    const got = items.filter(a => unlocked[a.id]).length;
    html += `<div class="ra-cat"><div class="ra-cat-h">${esc(cat.label)} <i>${got}/${items.length}</i></div>` +
      items.map(a => {
        const on = !!unlocked[a.id];
        const masked = a.hidden && !on;
        return `<span class="ra-card${on ? ' is-on' : ''}" title="${esc(masked ? '？？？' : a.desc)}">` +
          `<span class="ra-tier">${a.tier === 'platinum' ? '◆' : a.tier === 'gold' ? '●' : a.tier === 'silver' ? '◐' : '○'}</span>` +
          `<span class="ra-n">${esc(masked ? '？？？' : a.name)}</span></span>`;
      }).join('') + `</div>`;
  }
  html += `</div></div>`;
  body.innerHTML = html;
  body.querySelectorAll('.hud-v .num').forEach(countUp);
  if (gsap && !REDUCED) {                          // bars grow in with the panel
    body.querySelectorAll('.ra-bar i, .rpg-xp span').forEach(el => {
      const w = el.style.width;
      gsap.fromTo(el, { width: '0%' }, { width: w, duration: 0.6, ease: 'power2.out', delay: 0.2, overwrite: true });
    });
  }
}

// re-render the currently-open station HUD's body + viz (after a write settles)
function refreshOpenStation(id, scene) {
  if (!(hudOpen && hudKind === 'station')) return;
  const st = DATA.stations.find(x => x.id === id); if (!st) return;
  renderStationBody(st, scene);
  const viz = buildViz(id); const vizEl = document.getElementById('hud-viz');
  if (viz) { vizEl.hidden = false; vizEl.innerHTML = `<div class="hud-viz-k">${esc(viz.k)}</div>${viz.h}`; }
}
function paintDoneRow(btn, done) {
  btn.classList.toggle('is-on', done);
  const s = btn.querySelector('.log-state'); if (s) s.textContent = done ? '✓' : '—';
}

function openHUD(id, scene) {
  const st = DATA.stations.find(s => s.id === id); if (!st) return;
  hudKind = 'station'; hudFlew = true;                    // reached via camera fly
  if (id === 'FINANCE') finForm = { type: 'expense', editId: null };   // fresh finance form each open
  document.getElementById('hud-glyph').textContent = st.glyph;
  document.getElementById('hud-kicker').textContent = st.hud.kicker;
  document.getElementById('hud-title').textContent = st.label;
  scramble(document.getElementById('hud-title'), st.label);   // decode-in the title
  renderStationBody(st, scene);
  const viz = buildViz(id);
  const vizEl = document.getElementById('hud-viz');
  if (viz) { vizEl.hidden = false; vizEl.innerHTML = `<div class="hud-viz-k">${esc(viz.k)}</div>${viz.h}`; animateViz(vizEl); }
  else { vizEl.hidden = true; vizEl.innerHTML = ''; }
  document.getElementById('hud-foot').innerHTML = `<span>${esc(id)} · ${LIVE ? 'LIVE' : 'DEMO'}</span><span>ESC / BACKPLATE ⟵ DECK</span>`;
  const sysAvg = document.getElementById('sys-avg'); if (sysAvg) sysAvg.textContent = DATA.avg30 + '%';
  const sysStreak = document.getElementById('sys-streak'); if (sysStreak) sysStreak.textContent = DATA.best + 'd';
  hudEl.hidden = false;
  requestAnimationFrame(() => hudEl.classList.add('is-open'));
  hudOpen = true;
  // content follows the panel slide-in: cells stagger + numbers count up
  if (gsap && !REDUCED) {
    gsap.fromTo('#hud-body .hud-cell', { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, ease: 'power2.out', delay: 0.12, overwrite: true });
    gsap.fromTo('#hud-viz', { opacity: 0 }, { opacity: 1, duration: 0.5, delay: 0.18, overwrite: true });
    gsap.fromTo('.hud-rule', { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power2.out', delay: 0.15, transformOrigin: 'left', overwrite: true });
  }
  if (scene && scene.pulseBloom) scene.pulseBloom();     // HUD-open bloom pulse
  audio.arm(); audio.hud(); audio.sink();                 // sweep + low-frequency sink
  document.getElementById('readout').textContent = `${id} · FOCUSED`;
}

// ── THE 90 log HUD — the writable monument overlay (no camera fly) ───────────
function openThe90HUD(scene) {
  if (hudOpen) return;
  const info = DATA.the90info || { demo: true, targets: [], phase: 'stabilize', todayScores: {} };
  hudKind = 'the90'; hudFlew = false;
  if (lenis) lenis.stop();
  document.getElementById('hud-glyph').textContent = '❖';
  document.getElementById('hud-kicker').textContent = 'THE 90 / 碑阵';
  document.getElementById('hud-title').textContent = 'THE 90';
  scramble(document.getElementById('hud-title'), 'THE 90');   // decode-in the title
  const vizEl = document.getElementById('hud-viz'); vizEl.hidden = true; vizEl.innerHTML = '';
  const body = document.getElementById('hud-body');
  const rows = (info.targets || []).map(t => {
    const sc = info.todayScores ? info.todayScores[t.id] : undefined;
    return { id: t.id, tag: t.id, label: t.label, met: the90IsMet(sc, info.phase), state: the90StateLabel(sc, info.phase) };
  });
  const head = info.demo ? 'LINK REQUIRED TO LOG · DEMO' : `TAP TO LOG TODAY · ${DB.phaseLabel(info.phase)}`;
  body.innerHTML = rows.length
    ? logRowsHTML(rows, 'data-tid', head)
    : `<div class="hud-cell wide"><div class="hud-note">NO SIGNAL — no targets defined.</div></div>`;
  body.querySelectorAll('.log-row[data-tid]').forEach(btn =>
    btn.addEventListener('click', () => info.demo ? promptLink() : onThe90RowClick(btn, scene)));
  const dnum = (DATA.todayIndex != null ? DATA.todayIndex + 1 : '—');
  document.getElementById('hud-foot').innerHTML = `<span>THE 90 · ${LIVE ? 'LIVE' : 'DEMO'} · D${dnum}/90</span><span>ESC / BACKPLATE ⟵ DECK</span>`;
  hudEl.hidden = false;
  requestAnimationFrame(() => hudEl.classList.add('is-open'));
  hudOpen = true;
  if (gsap && !REDUCED) {
    gsap.fromTo('#hud-body .log-row', { opacity: 0, x: 10 },
      { opacity: 1, x: 0, duration: 0.35, stagger: 0.04, ease: 'power2.out', delay: 0.12, overwrite: true });
    gsap.fromTo('.hud-rule', { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power2.out', delay: 0.15, transformOrigin: 'left', overwrite: true });
  }
  if (scene && scene.pulseBloom) scene.pulseBloom();
  audio.arm(); audio.hud(); audio.sink();
  document.getElementById('readout').textContent = 'THE 90 · LOG';
}

// ── writers: optimistic UI + scene update, persist, revert on failure ────────
function paintThe90Row(btn, score, phase) {
  const met = the90IsMet(score, phase);
  btn.classList.toggle('is-on', met);
  const s = btn.querySelector('.log-state'); if (s) s.textContent = the90StateLabel(score, phase);
}
function applyThe90Ratio(info, scene) {
  const tgts = info.targets || [];
  const ratio = tgts.length
    ? tgts.filter(t => the90IsMet(info.todayScores[t.id], info.phase)).length / tgts.length : 0;
  if (DATA.the90 && DATA.todayIndex != null && DATA.the90[DATA.todayIndex]) DATA.the90[DATA.todayIndex].score = ratio;
  if (scene && scene.setTodayScore) scene.setTodayScore(ratio);
}
async function onThe90RowClick(btn, scene) {
  const info = DATA.the90info; const id = btn.dataset.tid;
  audio.arm(); audio.tick();
  const prev = { ...(info.todayScores || {}) };
  const cur = prev[id];
  const next = info.phase === 'stabilize'
    ? (cur === undefined ? 3 : cur === 3 ? 2 : cur === 2 ? 1 : cur === 1 ? 0 : 3)
    : !cur;
  info.todayScores = { ...prev, [id]: next };              // optimistic
  paintThe90Row(btn, next, info.phase);
  applyThe90Ratio(info, scene);
  try {
    await DB.toggleThe90Target(id, prev, info.phase, info.todayNote);
    setLink('ok');
  } catch (err) {
    info.todayScores = prev;                               // revert
    paintThe90Row(btn, prev[id], info.phase);
    applyThe90Ratio(info, scene);
    setLink('down');
  }
}
async function onMorningRowClick(btn, scene) {
  const mid = btn.dataset.rid;
  audio.arm(); audio.tick();
  const list = (DATA.morning && DATA.morning.list) || [];
  const prev = list.map(x => ({ ...x }));
  const it = list.find(x => x && x.id === mid); if (!it) return;
  it.d = !it.d;                                            // optimistic (in-place)
  paintDoneRow(btn, it.d);
  try {
    const nextList = await DB.toggleMorningItem(mid, prev);
    DATA.morning.list = nextList;                          // first toggle seeds today's row
    rebuildMorningStation();
    refreshOpenStation('MORNING', scene);
    setLink('ok');
  } catch (err) {
    DATA.morning.list = prev; it.d = !it.d;                // revert
    paintDoneRow(btn, it.d);
    setLink('down');
  }
}
async function onTodoRowClick(btn, scene) {
  const id = btn.dataset.rid;
  audio.arm(); audio.tick();
  const item = (DATA._todos || []).find(t => t && t.id === id); if (!item) return;
  const prevDone = !!item.done;
  item.done = !prevDone;                                   // optimistic (in-place)
  if (item.done) item.done_at = new Date().toISOString(); // keep row in "done today" set
  paintDoneRow(btn, item.done);
  rebuildTodosStation(); refreshOpenStation('TODOS', scene);
  try {
    await DB.toggleTodo(id, prevDone);
    setLink('ok');
  } catch (err) {
    item.done = prevDone;                                  // revert (done_at left as-is, mirrors app)
    rebuildTodosStation(); refreshOpenStation('TODOS', scene);
    setLink('down');
  }
}
async function onAcademicRowClick(btn, scene) {
  const id = btn.dataset.rid;
  audio.arm(); audio.tick();
  const item = (DATA._academics || []).find(a => a && a.id === id); if (!item) return;
  const prevDone = !!item.done;
  item.done = !prevDone;                                   // optimistic (in-place)
  paintDoneRow(btn, item.done);
  rebuildAcademicsStation(); refreshOpenStation('ACADEMICS', scene);
  try {
    await DB.toggleAcademic(id, prevDone);
    setLink('ok');
  } catch (err) {
    item.done = prevDone;                                  // revert
    rebuildAcademicsStation(); refreshOpenStation('ACADEMICS', scene);
    setLink('down');
  }
}
async function onJapaneseRowClick(btn, scene) {
  const rid = btn.dataset.rid;
  audio.arm(); audio.tick();
  const jp = DATA._japanese || { list: [], log: {}, note: '' };
  if (rid === '__checkin__') {                             // manual daily check-in
    const wasLogged = !!(jp.log && jp.log[DB.TODAY]);
    paintDoneRow(btn, !wasLogged);
    try {
      const res = await DB.checkInJapanese(jp);
      DATA._japanese = { ...jp, log: res.log, streak: res.streak, last_date: res.last_date };
      rebuildJapaneseStation(); refreshOpenStation('JP-N2', scene);
      setLink('ok');
    } catch (err) { paintDoneRow(btn, wasLogged); setLink('down'); }
    return;
  }
  const item = (jp.list || []).find(i => i && i.id === rid); if (!item) return;
  const prevDone = !!item.d;
  // snapshot the row BEFORE the optimistic flip: toggleJapaneseItem flips the
  // item itself, so handing it the already-flipped jp.list would double-flip
  // (persisting the original value + settling log[TODAY] from the wrong state).
  const jpSnapshot = { ...jp, list: (jp.list || []).map(x => ({ ...x })) };
  item.d = !prevDone;                                      // optimistic (in-place)
  paintDoneRow(btn, item.d);
  try {
    const res = await DB.toggleJapaneseItem(rid, jpSnapshot); // re-reads + unions log, derives streak
    DATA._japanese = { ...jp, list: res.list, log: res.log, streak: res.streak, last_date: res.last_date };
    rebuildJapaneseStation(); refreshOpenStation('JP-N2', scene);
    setLink('ok');
  } catch (err) {
    item.d = prevDone;                                     // revert
    paintDoneRow(btn, item.d);
    setLink('down');
  }
}

function closeHUD(scene) {
  if (!hudOpen) return;
  hudEl.classList.remove('is-open');
  setTimeout(() => { hudEl.hidden = true; }, 500);
  hudOpen = false;
  if (hudFlew) scene.returnDeck();                          // station HUD → fly back
  else if (lenis) lenis.start();                            // overlay HUD → resume scroll
  document.getElementById('readout').textContent = 'DECK · IDLE';
}

// ════════════════════════════════════════════════════════════════════════════
// live data → MOCK-shaped DATA (drop-in for scene + openHUD + buildViz)
// ════════════════════════════════════════════════════════════════════════════
const STATION_GLYPH  = { MORNING: '☉', ACADEMICS: '§', 'JP-N2': '⛩', TRADING: '↗', FINANCE: '¥', TODOS: '▤', SYSTEM: '◇' };
const STATION_KICKER = { MORNING: 'RITUAL / 日冕', ACADEMICS: 'SCHOLARSHIP / 书碑', 'JP-N2': 'LANGUAGE / 鳥居',
  TRADING: 'PRE-MARKET / 盘前封条', FINANCE: 'LEDGER / 账簿碑', TODOS: 'BACKLOG / 堆叠', SYSTEM: 'CORE / 核心' };
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function fmtMon(iso) { const p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? `${MON[+p[1] - 1]} ${p[2]}` : String(iso); }
function dLabel(iso) { const s = String(iso).slice(0, 10); const du = DB.daysUntil(s); return du >= 0 ? ('D-' + du) : fmtMon(s); }

function baseStation(id, tag, cells, note) {
  return { id, label: id, glyph: STATION_GLYPH[id], tag, hud: { kicker: STATION_KICKER[id], cells, note } };
}
function morningStation(list) {
  const done = list.filter(i => i && i.d).length, total = list.length;
  const remMins = list.filter(i => i && !i.d).reduce((a, i) => a + (+i.mins || 0), 0);
  const pct = total ? Math.round(done / total * 100) : 0;
  const nextItem = list.find(i => i && !i.d);
  const st = baseStation('MORNING', `DONE <b>${done}/${total}</b> · ${remMins}m LEFT`, [
    { k: 'Done today', v: String(done), unit: '/ ' + total },
    { k: 'Remaining', v: String(remMins), unit: 'min', accent: 'cyan' },
    { k: 'Rituals', v: String(total) },
    { k: 'Complete', v: String(pct), unit: '%', accent: 'cyan' },
  ], total ? (nextItem ? `Next up: <b>${esc(nextItem.t || '')}</b>.` : 'All rituals cleared today.') : 'No rituals scheduled today.');
  st.writable = 'morning'; st.hud.rowsHead = 'TAP TO LOG · RITUALS';
  st.hud.rows = list.map(i => ({ id: i.id, tag: '', label: i.t || '(untitled)', met: !!i.d, state: i.d ? '✓' : '—' }));
  return st;
}
function academicsStation(acad, done) {
  acad = acad || [];
  const open = acad.filter(a => a && !a.done);
  const dated = open.filter(a => a.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const nx = dated[0];
  const st = baseStation('ACADEMICS', `ITEMS <b>${acad.length}</b> · OPEN <b>${open.length}</b>`, [
    { k: 'Items', v: String(acad.length) },
    { k: 'Done', v: String(done), accent: 'cyan' },
    { k: 'Open', v: String(open.length) },
    { k: 'Next', v: nx ? dLabel(nx.date) : '—', accent: 'cyan' },
  ], nx ? `Next: <b>${esc(nx.name || nx.sub || 'item')}</b> · ${esc(fmtMon(nx.date))}.` : 'Backlog clear — no open items.');
  st.writable = 'academics'; st.hud.rowsHead = 'TAP TO MARK DONE'; st.hud.emptyNote = 'No coursework items.';
  // all items, done sunk to bottom (label is escaped by logRowsHTML — no pre-esc)
  const rows = acad.slice().sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.position || 0) - (b.position || 0));
  st.hud.rows = rows.map(a => ({ id: a.id, tag: '', label: (a.sub ? a.sub + ' · ' : '') + (a.name || 'item'), met: !!a.done, state: a.done ? '✓' : '—' }));
  return st;
}
function japaneseStation(jp, jpDone, jpTotal) {
  const streak = (jp && jp.streak) || 0;
  const last = (jp && jp.last_date) ? fmtMon(jp.last_date) : '—';
  const pct = jpTotal ? Math.round(jpDone / jpTotal * 100) : 0;
  const st = baseStation('JP-N2', `STREAK <b>${streak}d</b> · ${jpDone}/${jpTotal}`, [
    { k: 'Streak', v: String(streak), unit: 'days' },
    { k: 'Checklist', v: String(jpDone), unit: '/ ' + jpTotal, accent: 'cyan' },
    { k: 'Progress', v: String(pct), unit: '%' },
    { k: 'Last', v: last, accent: 'cyan' },
  ], (jp && jp.note) ? esc(jp.note) : 'No note logged.');
  st.writable = 'japanese'; st.hud.emptyNote = 'No checklist — add items in the app.';
  const list = Array.isArray(jp && jp.list) ? jp.list : [];
  const due = list.filter(i => DB.jpItemDueOn(i, DB.TODAY));   // only DUE-today items gate check-in
  if (due.length) {
    st.hud.rowsHead = `TODAY ${due.filter(i => i && i.d).length}/${due.length} · CHECK-IN`;
    st.hud.rows = due.map(i => ({ id: i.id, tag: '', label: i.t || '(item)', met: !!i.d, state: i.d ? '✓' : '—' }));
  } else {                                                     // nothing due → manual "studied today"
    const logged = !!(jp && jp.log && jp.log[DB.TODAY]);
    st.hud.rowsHead = 'DAILY CHECK-IN';
    st.hud.rows = [{ id: '__checkin__', tag: '', label: 'Studied today', met: logged, state: logged ? '✓' : '—' }];
  }
  return st;
}
function financeStation(trading, txns) {
  const accts = trading.accounts || [];
  const liab = accts.filter(a => a && a.is_liability).length;
  const lastTx = txns[0];
  return baseStation('FINANCE', `ACCTS <b>${accts.length}</b> · TX <b>${txns.length}</b>`, [
    { k: 'Accounts', v: String(accts.length) },
    { k: 'Transactions', v: String(txns.length), accent: 'cyan' },
    { k: 'Liabilities', v: String(liab) },
    { k: 'Last entry', v: lastTx ? fmtMon(lastTx.date) : '—', accent: 'cyan' },
  ], lastTx ? `Latest: <b>${esc(lastTx.type || 'entry')}</b> ${esc(String(lastTx.amount ?? ''))} ${esc(lastTx.currency || '')} · tap an entry below to edit.` : 'No transactions on file.');
}
// TRADING = the daily trading DESK (盘前封条): bias + pre-market checklist + seal.
// Summary cells only here; the writable body (bias field / toggle rows / seal
// bar) is rendered by renderTradingDeskBody when LIVE.
function tradingDeskStation(desk) {
  desk = desk || { list: [], bias: '', sealed: false, broke: false };
  const list = Array.isArray(desk.list) ? desk.list : [];
  const done = list.filter(i => i && i.d).length, total = list.length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const hasBias = !!(desk.bias && String(desk.bias).trim());
  return baseStation('TRADING', `CHECK <b>${done}/${total}</b> · ${desk.sealed ? 'SEALED' : 'OPEN'}`, [
    { k: 'Checklist', v: String(done), unit: '/ ' + total },
    { k: 'Complete', v: String(pct), unit: '%', accent: 'cyan' },
    { k: 'Seal', v: desk.sealed ? 'SEALED' : 'OPEN' },
    { k: 'Bias', v: hasBias ? 'SET' : '—', accent: 'cyan' },
  ], desk.sealed
    ? `盘前已封存 · commitment locked${desk.broke ? ' · 今日已破封' : ''}.`
    : (hasBias ? `Bias: <b>${esc(desk.bias)}</b>` : 'No bias logged — set today’s bias & seal the plan.'));
}
function todosStation(open, doneToday, all) {
  all = all || [];
  const overdue = all.filter(t => t && !t.done && !t.archived && t.date && String(t.date).slice(0, 10) < DB.TODAY).length;
  const st = baseStation('TODOS', `OPEN <b>${open}</b> · DONE <b>${doneToday}</b>`, [
    { k: 'Open', v: String(open) },
    { k: 'Done today', v: String(doneToday), accent: 'cyan' },
    { k: 'Overdue', v: String(overdue) },
    { k: 'Total', v: String(all.length), accent: 'cyan' },
  ], open ? `${open} open · ${overdue} overdue.` : 'Inbox zero — all clear.');
  st.writable = 'todos'; st.hud.rowsHead = 'TAP TO LOG · TODAY'; st.hud.emptyNote = 'Inbox zero — nothing to log.';
  // open + today's-done (so a just-completed row stays visible & reversible), done sunk
  const rows = all.filter(t => t && !t.archived && (!t.done || String(t.done_at || '').slice(0, 10) === DB.TODAY));
  rows.sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.position || 0) - (b.position || 0));
  st.hud.rows = rows.map(t => ({ id: t.id, tag: '', label: t.text || '(untitled)', met: !!t.done, state: t.done ? '✓' : '—' }));
  return st;
}
function systemStation(S, sys, rpg) {
  const notices = (sys && sys.notices) || [];
  if (!rpg) {
    // degraded card (no the90 meta) — the pre-B2 SYSTEM station
    return baseStation('SYSTEM', `AVG <b>${S.avg30}%</b> · STREAK <b>${S.best}d</b>`, [
      { k: 'The90 avg', v: String(S.avg30), unit: '% · 30d' },
      { k: 'Longest', v: String(S.best), unit: 'days', accent: 'cyan' },
      { k: 'Notices', v: String(notices.length) },
      { k: 'Day', v: String(S.todayIndex + 1), unit: '/ 90', accent: 'cyan' },
    ], 'The90 30-day avg <b id="sys-avg"></b> · longest streak <b id="sys-streak"></b>.');
  }
  const st = baseStation('SYSTEM', `LV <b>${rpg.level}</b> · RANK <b>${rpg.rank}</b>`, [
    { k: 'Level', v: String(rpg.level), unit: rpg.title },
    { k: 'Rank', v: rpg.rank, accent: 'cyan' },
    { k: '战力 Power', v: String(rpg.power) },
    { k: 'Achievements', v: String(rpg.achCount), unit: '/ ' + DB.RPG_ACH_META.length, accent: 'cyan' },
  ], '');
  st.hud.rpg = rpg;                        // renderSystemBody takes over from here
  return st;
}
function buildLedgerCandles(txns) {
  const amts = (txns || []).slice(0, 12).reverse().map(t => Math.abs(+t.amount || 0));
  if (amts.length < 2) return (MOCK.viz && MOCK.viz.candles) || [];
  const max = Math.max(1, ...amts);
  const norm = amts.map(a => Math.min(1, a / max));
  const out = [];
  for (let i = 1; i < norm.length; i++) {
    const o = norm[i - 1], c = norm[i];
    out.push({ o, c, hi: Math.min(1, Math.max(o, c) + 0.05), lo: Math.max(0, Math.min(o, c) - 0.05) });
  }
  return out;
}
function rebuildMorningStation() {
  const list = (DATA.morning && DATA.morning.list) || [];
  const idx = DATA.stations.findIndex(s => s.id === 'MORNING');
  if (idx >= 0) DATA.stations[idx] = morningStation(list);
  DATA.viz.rise7 = list.map(i => i && i.d ? 1 : 0);
  const done = list.filter(i => i && i.d).length;
  DATA.viz.labels.MORNING = `RITUALS TODAY · ${done} / ${list.length}`;
}
function rebuildTodosStation() {
  const all = DATA._todos || [];
  const open = all.filter(t => t && !t.done && !t.archived).length;
  const doneToday = all.filter(t => t && t.done && String(t.done_at || '').slice(0, 10) === DB.TODAY).length;
  const idx = DATA.stations.findIndex(s => s.id === 'TODOS');
  if (idx >= 0) DATA.stations[idx] = todosStation(open, doneToday, all);
  const den = open + doneToday;
  DATA.viz.todos = den ? doneToday / den : 0;
  DATA.viz.labels.TODOS = `CLEARED TODAY · ${doneToday} / ${den}`;
}
function rebuildAcademicsStation() {
  const acad = DATA._academics || [];
  const done = acad.filter(a => a && a.done).length;
  const idx = DATA.stations.findIndex(s => s.id === 'ACADEMICS');
  if (idx >= 0) DATA.stations[idx] = academicsStation(acad, done);
  DATA.viz.credits = acad.length ? done / acad.length : 0;
  DATA.viz.labels.ACADEMICS = `DONE · ${done} / ${acad.length}`;
}
function rebuildJapaneseStation() {
  const jp = DATA._japanese;
  const list = Array.isArray(jp && jp.list) ? jp.list : [];
  const jpDone = list.filter(x => x && (x.d || x.done || x.checked)).length;
  const idx = DATA.stations.findIndex(s => s.id === 'JP-N2');
  if (idx >= 0) DATA.stations[idx] = japaneseStation(jp, jpDone, list.length);
  DATA.viz.jp = list.length ? jpDone / list.length : 0;
  DATA.viz.labels['JP-N2'] = `CHECKLIST · ${jpDone} / ${list.length}`;
}
function rebuildFinanceStation() {
  const trading = DATA._trading || { accounts: [], transactions: [], categories: [] };
  const txns = trading.transactions || [];
  const idx = DATA.stations.findIndex(s => s.id === 'FINANCE');
  if (idx >= 0) DATA.stations[idx] = financeStation(trading, txns);
  DATA.viz.candles = buildLedgerCandles(txns);
  DATA.viz.labels.FINANCE = `LEDGER · ${txns.length} ENTRIES`;
}
function rebuildTradingDeskStation() {
  const desk = DATA._tradingDesk || { list: [], bias: '', sealed: false, broke: false };
  const list = Array.isArray(desk.list) ? desk.list : [];
  const done = list.filter(i => i && i.d).length;
  const idx = DATA.stations.findIndex(s => s.id === 'TRADING');
  if (idx >= 0) DATA.stations[idx] = tradingDeskStation(desk);
  DATA.viz.trade = list.length ? done / list.length : 0;
  DATA.viz.labels.TRADING = `CHECKLIST · ${done} / ${list.length}`;
}

// ════════════════════════════════════════════════════════════════════════════
// FINANCE full CRUD — add / edit / delete fin_transactions inside the FINANCE
// station HUD (re-homed from the former TRADING station; logic byte-identical).
// Currency is ALWAYS derived from the selected account (never a form field),
// mirroring finSubmitTx. DOM form + recent-tx list.
// ════════════════════════════════════════════════════════════════════════════
let finForm = { type: 'expense', editId: null };
const fmtAmt = n => Math.abs(+n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const currentFinanceStation = () => DATA.stations.find(s => s.id === 'FINANCE');
function finAccounts() {
  return ((DATA._trading && DATA._trading.accounts) || [])
    .filter(a => a && a.status !== 0)                       // exclude inactive (status 0)
    .slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
}
function finCats(kind) {
  return ((DATA._trading && DATA._trading.categories) || [])
    .filter(c => c && !c.archived && c.kind === kind)
    .slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
}
const acctById = id => ((DATA._trading && DATA._trading.accounts) || []).find(a => a && a.id === id);
function acctOptions(sel) {
  return finAccounts().map(a =>
    `<option value="${esc(a.id)}"${a.id === sel ? ' selected' : ''}>${esc(a.name)} · ${esc(a.currency)}</option>`).join('');
}
function catOptions(kind, sel) {
  return `<option value="">— none —</option>` + finCats(kind).map(c =>
    `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc((c.icon ? c.icon + ' ' : '') + c.name)}</option>`).join('');
}
function txRowHTML(tx) {
  const acct = acctById(tx.account_id);
  const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : '⇄';
  const cls = tx.type === 'income' ? 'tx-pos' : tx.type === 'expense' ? 'tx-neg' : 'tx-xfer';
  let label;
  if (tx.type === 'transfer') {
    const to = acctById(tx.to_account_id);
    label = `${acct ? acct.name : '?'} → ${to ? to.name : '?'}`;
  } else {
    const cat = ((DATA._trading && DATA._trading.categories) || []).find(c => c && c.id === tx.category_id);
    label = (cat ? cat.name : 'uncategorized') + (acct ? ' · ' + acct.name : '');
  }
  return `<div class="tx-row">
    <button type="button" class="tx-row-main" data-edit="${esc(tx.id)}">
      <span class="tx-row-date">${esc(String(tx.date).slice(5))}</span>
      <span class="tx-row-lbl">${esc(label)}${tx.note ? ' · ' + esc(tx.note) : ''}</span>
      <span class="tx-row-amt ${cls}">${sign}${esc(fmtAmt(tx.amount))} ${esc(tx.currency || '')}</span>
    </button>
    <button type="button" class="tx-del" data-del="${esc(tx.id)}" aria-label="Delete">🗑</button>
  </div>`;
}
function renderFinanceBody(st, scene) {
  const body = document.getElementById('hud-body');
  const accts = finAccounts();
  let html = stationCellsHTML(st.hud.cells);
  if (!accts.length) {
    html += `<div class="hud-cell wide"><div class="hud-note">NO ACCOUNTS — create one in the main app first.</div></div>`;
    body.innerHTML = html;
    body.querySelectorAll('.hud-v .num').forEach(countUp);
    return;
  }
  const editing = finForm.editId, t = finForm.type;
  const a0 = accts[0].id, a1 = accts[1] ? accts[1].id : a0;
  html += `<div class="hud-cell wide tx-panel">
    <div class="log-head">${editing ? 'EDIT ENTRY' : 'NEW ENTRY'}</div>
    <div class="tx-seg" id="tx-seg">
      ${[['expense', 'EXPENSE'], ['income', 'INCOME'], ['transfer', 'TRANSFER']].map(([k, l]) =>
        `<button type="button" class="tx-seg-btn${k === t ? ' active' : ''}" data-t="${k}">${l}</button>`).join('')}
    </div>
    <div class="tx-field"><label for="tx-account">${t === 'transfer' ? 'FROM' : 'ACCOUNT'}</label>
      <select id="tx-account">${acctOptions(a0)}</select></div>
    <div class="tx-field" id="tx-toacct-wrap" style="${t === 'transfer' ? '' : 'display:none;'}">
      <label for="tx-toaccount">TO</label><select id="tx-toaccount">${acctOptions(a1)}</select></div>
    <div class="tx-field" id="tx-cat-wrap" style="${t === 'transfer' ? 'display:none;' : ''}">
      <label for="tx-category">CATEGORY</label><select id="tx-category">${catOptions(t === 'income' ? 'income' : 'expense', '')}</select></div>
    <div class="tx-field"><label for="tx-amount">AMOUNT <span class="tx-cur" id="tx-cur"></span></label>
      <input id="tx-amount" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00"></div>
    <div class="tx-field" id="tx-toamt-wrap" style="display:none;">
      <label for="tx-toamount">TO AMOUNT <span class="tx-cur" id="tx-tocur"></span> <small>cross-currency</small></label>
      <input id="tx-toamount" type="number" step="0.01" min="0" inputmode="decimal" placeholder="received"></div>
    <div class="tx-field"><label for="tx-note">NOTE <small>optional</small></label>
      <input id="tx-note" type="text" maxlength="120" placeholder="—"></div>
    <div class="tx-field"><label for="tx-date">DATE</label>
      <input id="tx-date" type="date" value="${esc(DB.TODAY)}"></div>
    <div class="tx-msg" id="tx-msg"></div>
    <div class="tx-form-btns">
      ${editing ? `<button type="button" class="tx-btn ghost" id="tx-cancel">CANCEL</button>` : ''}
      <button type="button" class="tx-btn primary" id="tx-submit">${editing ? 'UPDATE ▸' : 'RECORD ▸'}</button>
    </div>
  </div>`;
  const txns = (DATA._trading && DATA._trading.transactions) || [];
  const recent = txns.slice(0, 8);
  html += `<div class="hud-cell wide tx-panel">
    <div class="log-head">RECENT · TAP TO EDIT</div>
    ${recent.length ? `<div class="tx-list">${recent.map(txRowHTML).join('')}</div>` : `<div class="hud-note">No transactions yet.</div>`}
  </div>`;
  body.innerHTML = html;
  wireFinanceBody(scene);
  body.querySelectorAll('.hud-v .num').forEach(countUp);
}
function wireFinanceBody(scene) {
  const body = document.getElementById('hud-body');
  body.querySelectorAll('#tx-seg .tx-seg-btn').forEach(b =>
    b.addEventListener('click', () => { finForm.type = b.dataset.t; finSyncType(); }));
  const acct = document.getElementById('tx-account'), toAcct = document.getElementById('tx-toaccount');
  if (acct) acct.addEventListener('change', finSyncCurrency);
  if (toAcct) toAcct.addEventListener('change', finSyncCurrency);
  const submit = document.getElementById('tx-submit');
  if (submit) submit.addEventListener('click', () => onFinSubmit(scene));
  const cancel = document.getElementById('tx-cancel');
  if (cancel) cancel.addEventListener('click', () => { finForm.editId = null; finForm.type = 'expense'; renderFinanceBody(currentFinanceStation(), scene); });
  body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => loadTxIntoForm(b.dataset.edit, scene)));
  body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => onDeleteClick(b, scene)));
  finSyncType();
}
function finSyncType() {
  const t = finForm.type, isXfer = t === 'transfer';
  document.querySelectorAll('#tx-seg .tx-seg-btn').forEach(b => b.classList.toggle('active', b.dataset.t === t));
  const toWrap = document.getElementById('tx-toacct-wrap'), catWrap = document.getElementById('tx-cat-wrap');
  const acctLabel = document.querySelector('label[for="tx-account"]');
  if (toWrap) toWrap.style.display = isXfer ? '' : 'none';
  if (catWrap) catWrap.style.display = isXfer ? 'none' : '';
  if (acctLabel) acctLabel.textContent = isXfer ? 'FROM' : 'ACCOUNT';
  if (!isXfer) { const cs = document.getElementById('tx-category'); if (cs) cs.innerHTML = catOptions(t === 'income' ? 'income' : 'expense', ''); }
  finSyncCurrency();
}
function finSyncCurrency() {
  const acctEl = document.getElementById('tx-account'); if (!acctEl) return;
  const acct = acctById(acctEl.value);
  const curEl = document.getElementById('tx-cur'); if (curEl) curEl.textContent = acct ? '· ' + acct.currency : '';
  const toWrap = document.getElementById('tx-toamt-wrap');
  if (finForm.type === 'transfer') {
    const to = acctById(document.getElementById('tx-toaccount').value);
    const cross = acct && to && acct.currency !== to.currency;
    if (toWrap) toWrap.style.display = cross ? '' : 'none';
    const tocur = document.getElementById('tx-tocur'); if (tocur) tocur.textContent = to ? '· ' + to.currency : '';
  } else if (toWrap) { toWrap.style.display = 'none'; }
}
function flashFinMsg(msg) { const el = document.getElementById('tx-msg'); if (el) el.textContent = msg; }
function loadTxIntoForm(id, scene) {
  const tx = ((DATA._trading && DATA._trading.transactions) || []).find(t => t && t.id === id);
  if (!tx) return;
  audio.arm(); audio.tick();
  finForm.editId = id; finForm.type = tx.type;
  renderFinanceBody(currentFinanceStation(), scene);   // renders edit mode + builds options for type
  const set = (elId, v) => { const el = document.getElementById(elId); if (el) el.value = (v == null ? '' : v); };
  set('tx-account', tx.account_id);
  if (tx.type === 'transfer') set('tx-toaccount', tx.to_account_id);
  else set('tx-category', tx.category_id || '');
  set('tx-amount', tx.amount);
  set('tx-note', tx.note || '');
  set('tx-date', String(tx.date).slice(0, 10));
  if (tx.type === 'transfer' && tx.to_amount != null) set('tx-toamount', tx.to_amount);
  finSyncCurrency();
  const p = document.querySelector('#hud-body .tx-panel'); if (p && p.scrollIntoView) p.scrollIntoView({ block: 'nearest' });
}
async function onFinSubmit(scene) {
  const type = finForm.type;
  const amount = Math.round((parseFloat(document.getElementById('tx-amount').value) || 0) * 100) / 100;
  if (!(amount > 0)) { flashFinMsg('ENTER AN AMOUNT'); return; }
  const date = document.getElementById('tx-date').value || DB.TODAY;
  const note = document.getElementById('tx-note').value.trim();
  const accountId = document.getElementById('tx-account').value;
  const acct = acctById(accountId);
  if (!acct) { flashFinMsg('SELECT AN ACCOUNT'); return; }
  // currency ALWAYS from the account, never a form field (mirrors finSubmitTx)
  const tx = { type, amount, date, note, accountId, toAccountId: null, toAmount: null, categoryId: null, currency: acct.currency };
  if (type === 'transfer') {
    const toAccountId = document.getElementById('tx-toaccount').value;
    if (accountId === toAccountId) { flashFinMsg('ACCOUNTS MUST DIFFER'); return; }
    const to = acctById(toAccountId);
    tx.toAccountId = toAccountId;
    tx.currency = acct.currency;                       // transfer amount is in the FROM-account currency
    if (to && acct.currency !== to.currency) {         // cross-currency → capture received amount
      const ta = Math.round((parseFloat(document.getElementById('tx-toamount').value) || 0) * 100) / 100;
      tx.toAmount = ta > 0 ? ta : amount;              // fallback 1:1 (matches finSubmitTx)
    }
  } else {
    tx.categoryId = document.getElementById('tx-category').value || null;
  }
  audio.arm(); audio.tick();
  const submit = document.getElementById('tx-submit'); if (submit) submit.disabled = true;
  try {
    if (finForm.editId) {
      const patch = {                                  // NO tags key → the user's tags are preserved
        date: tx.date, type: tx.type, amount: tx.amount, currency: tx.currency,
        account_id: tx.accountId || null, to_account_id: tx.toAccountId || null,
        to_amount: tx.toAmount != null ? tx.toAmount : null,
        category_id: tx.categoryId || null, note: tx.note || null,
      };
      await DB.updateTransaction(finForm.editId, patch);
      finForm.editId = null;
    } else {
      await DB.addTransaction(tx);
    }
    finForm.type = 'expense';
    await reloadFinance(scene);                        // re-pull → cells + candles + recent list
    if (audio.hud) audio.hud();
    setLink('ok');
  } catch (err) {
    if (submit) submit.disabled = false;
    flashFinMsg('WRITE FAILED — RETRY');
    setLink('down');
  }
}
function onDeleteClick(btn, scene) {
  const id = btn.dataset.del;
  if (btn.dataset.armed === '1') { clearTimeout(btn._t); onFinDelete(id, scene); return; }   // 2nd tap → delete
  btn.dataset.armed = '1'; btn.classList.add('armed'); btn.textContent = 'CONFIRM DELETE';
  audio.arm(); audio.tick();
  btn._t = setTimeout(() => { btn.dataset.armed = '0'; btn.classList.remove('armed'); btn.textContent = '🗑'; }, 3000);
}
async function onFinDelete(id, scene) {
  audio.arm(); audio.tick();
  let ok = true;
  try { await DB.deleteTransaction(id); } catch { ok = false; }
  await reloadFinance(scene);                          // re-pull authoritative state either way
  setLink(ok ? 'ok' : 'down');
}
async function reloadFinance(scene) {
  try { if (DATA._uid) DATA._trading = await DB.loadTrading(DATA._uid); } catch { /* keep prior _trading */ }
  rebuildFinanceStation();
  refreshOpenStation('FINANCE', scene);
}

// ════════════════════════════════════════════════════════════════════════════
// TRADING desk (盘前封条) — bias + pre-market checklist + seal. NEW code, but it
// follows the SAME safe daily-write pattern as the other writers: optimistic UI
// → single-row upsert (onConflict user_id,date) via data.js → revert on failure.
// Sealed = read-only (bias field + toggle rows disabled), mirroring trading.js.
// ════════════════════════════════════════════════════════════════════════════
const deskClone = d => ({ ...(d || {}), list: ((d && d.list) || []).map(x => ({ ...x })) });
function renderTradingDeskBody(st, scene) {
  const body = document.getElementById('hud-body');
  const desk = DATA._tradingDesk || { list: [], bias: '', sealed: false, sealedAt: null, broke: false };
  const list = Array.isArray(desk.list) ? desk.list : [];
  const sealed = !!desk.sealed;
  let html = stationCellsHTML(st.hud.cells);
  // today's bias (read-only once sealed)
  html += `<div class="hud-cell wide tx-panel">
    <div class="log-head">${sealed ? 'BIAS · SEALED' : 'TODAY’S BIAS'}</div>
    <div class="tx-field">
      <textarea id="td-bias" rows="2" maxlength="400" placeholder="记录今日交易偏向…"${sealed ? ' readonly' : ''}>${esc(desk.bias || '')}</textarea>
    </div>
  </div>`;
  // pre-market checklist (toggle rows; disabled once sealed)
  html += `<div class="hud-cell wide"><div class="log-head">${sealed ? 'PRE-MARKET · LOCKED' : 'PRE-MARKET CHECKLIST'}</div>`;
  html += list.length
    ? `<div class="log-wrap">` + list.map(i =>
        `<button class="log-row${i.d ? ' is-on' : ''}${sealed ? ' is-locked' : ''}" data-tdid="${esc(i.id)}"${sealed ? ' disabled' : ''}>` +
        `<span class="log-lbl">${esc(i.t || '(item)')}</span><span class="log-state">${i.d ? '✓' : '—'}</span></button>`).join('') + `</div>`
    : `<div class="hud-note">No checklist — set one in the main app.</div>`;
  html += `</div>`;
  // 盘前封条 seal bar
  html += `<div class="hud-cell wide"><div class="td-seal-bar">`;
  if (sealed) {
    const tm = desk.sealedAt ? new Date(desk.sealedAt) : null;
    const tstr = tm ? `${pad(tm.getHours())}:${pad(tm.getMinutes())}` : '';
    html += `<div class="td-seal"><span class="td-seal-stamp">封</span>
      <span class="td-seal-meta"><b>盘前已封存</b><small>${esc(tstr)} · 今日承诺已锁定</small></span>
      <button type="button" class="tx-btn ghost" id="td-break">破封 UNSEAL</button></div>`;
  } else {
    html += `<button type="button" class="tx-btn primary" id="td-seal">🔒 盘前封存 · SEAL</button>${desk.broke ? '<span class="td-broke">今日已破封</span>' : ''}`;
  }
  html += `</div></div>`;
  body.innerHTML = html;
  if (!sealed) {
    body.querySelectorAll('.log-row[data-tdid]').forEach(btn =>
      btn.addEventListener('click', () => onDeskItemClick(btn, scene)));
    const bias = document.getElementById('td-bias');
    if (bias) bias.addEventListener('blur', () => onDeskBiasCommit(bias, scene));
    const seal = document.getElementById('td-seal');
    if (seal) seal.addEventListener('click', () => onDeskSeal(scene));
  } else {
    const brk = document.getElementById('td-break');
    if (brk) brk.addEventListener('click', () => onDeskUnseal(scene));
  }
  body.querySelectorAll('.hud-v .num').forEach(countUp);
}
// mirror the trading desk's sealed state onto the 3D monument (盘前封条 ring).
// pulse=true adds a one-time bloom flash — only when a user action seals it.
function syncTradingSeal(scene, pulse = false) {
  if (!scene || !scene.setTradingSealed) return;
  const desk = DATA._tradingDesk;
  scene.setTradingSealed(!!(desk && desk.sealed), pulse);
}
async function onDeskItemClick(btn, scene) {
  const desk = DATA._tradingDesk; if (!desk || desk.sealed) return;
  const id = btn.dataset.tdid;
  audio.arm(); audio.tick();
  const prev = deskClone(desk);
  const it = (desk.list || []).find(x => x && x.id === id); if (!it) return;
  it.d = !it.d;                                            // optimistic (in-place)
  paintDoneRow(btn, it.d);
  rebuildTradingDeskStation();
  try {
    DATA._tradingDesk = await DB.toggleTradingItem(id, prev);
    rebuildTradingDeskStation(); refreshOpenStation('TRADING', scene);
    setLink('ok');
  } catch (err) {
    DATA._tradingDesk = prev;                              // revert
    rebuildTradingDeskStation(); refreshOpenStation('TRADING', scene);
    setLink('down');
  }
}
async function onDeskBiasCommit(biasEl, scene) {
  const desk = DATA._tradingDesk; if (!desk || desk.sealed) return;
  const val = biasEl.value.trim();
  if (val === (desk.bias || '').trim()) return;            // no change → no write
  audio.arm();
  const prev = deskClone(desk);
  try {
    DATA._tradingDesk = await DB.setTradingBias(val, prev);
    rebuildTradingDeskStation();
    refreshOpenStation('TRADING', scene);                  // reflects the t6 auto-(un)check
    setLink('ok');
  } catch (err) { setLink('down'); }                       // leave the typed text in place
}
async function onDeskSeal(scene) {
  const desk = DATA._tradingDesk; if (!desk || desk.sealed) return;
  audio.arm(); audio.tick();
  const prev = deskClone(desk);
  const biasEl = document.getElementById('td-bias');
  if (biasEl) prev.bias = biasEl.value.trim();             // fold in any uncommitted bias edit
  try {
    DATA._tradingDesk = await DB.sealTradingDesk(prev);
    rebuildTradingDeskStation(); refreshOpenStation('TRADING', scene);
    syncTradingSeal(scene, true);                          // materialize the ring (+bloom pulse)
    if (audio.hud) audio.hud();                            // 印章 / quest cue
    setLink('ok');
  } catch (err) { syncTradingSeal(scene); setLink('down'); }   // revert → reflect true state
}
async function onDeskUnseal(scene) {
  const desk = DATA._tradingDesk; if (!desk || !desk.sealed) return;
  if (!confirm('破封？今日已封存的盘前承诺将解锁，并留下「已破封」记录。')) return;
  audio.arm(); audio.tick();
  const prev = deskClone(desk);
  try {
    DATA._tradingDesk = await DB.unsealTradingDesk(prev);
    rebuildTradingDeskStation(); refreshOpenStation('TRADING', scene);
    syncTradingSeal(scene);                                // dissolve the ring
    setLink('ok');
  } catch (err) { syncTradingSeal(scene); setLink('down'); }   // revert → reflect true state
}

function buildLiveData(loaded, session) {
  const email = (session.user && session.user.email) || 'operator';
  const S = DB.the90Summary(loaded.the90 && loaded.the90.meta, loaded.the90 && loaded.the90.daily);
  const the90 = S.dates.map((date, i) => i > S.todayIndex
    ? { date, score: null, ghost: true }
    : { date, score: S.ratios[i] == null ? 0 : S.ratios[i] });

  const sys30 = [];
  for (let i = Math.max(0, S.todayIndex - 29); i <= S.todayIndex; i++) sys30.push(S.ratios[i] == null ? 0 : S.ratios[i]);

  const morningList = (loaded.morning && loaded.morning.list) || [];
  const acad = loaded.academics || [];
  const jp = loaded.japanese || null;
  const todosArr = loaded.todos || [];
  const trading = loaded.trading || { accounts: [], transactions: [] };   // FINANCE ledger
  const desk = loaded.tradingDesk || null;                                // TRADING pre-market desk
  const sys = loaded.system || { settings: null, notices: [] };
  const txns = trading.transactions || [];

  const mDone = morningList.filter(i => i && i.d).length, mTotal = morningList.length;
  const acadDone = acad.filter(a => a && a.done).length;
  const jpList = Array.isArray(jp && jp.list) ? jp.list : [];
  const jpDone = jpList.filter(x => x && (x.done || x.d || x.checked || x === true)).length;
  const openTodos = todosArr.filter(t => t && !t.done && !t.archived);
  const doneToday = todosArr.filter(t => t && t.done && String(t.done_at || '').slice(0, 10) === DB.TODAY);
  const todosDen = openTodos.length + doneToday.length;
  const deskList = Array.isArray(desk && desk.list) ? desk.list : [];
  const deskDone = deskList.filter(i => i && i.d).length;
  // RPG character sheet — derived read-only (the90 rows + rpg_state); null-safe:
  // without the90 meta the SYSTEM station simply degrades to the AVG/STREAK card.
  let rpg = null;
  try { rpg = DB.computeRpg(loaded.the90, loaded.rpg); } catch { rpg = null; }

  const labels = {
    SYSTEM: 'THE 90 · LAST 30 DAYS',
    FINANCE: `LEDGER · ${txns.length} ENTRIES`,
    TRADING: `CHECKLIST · ${deskDone} / ${deskList.length}`,
    MORNING: `RITUALS TODAY · ${mDone} / ${mTotal}`,
    ACADEMICS: `DONE · ${acadDone} / ${acad.length}`,
    'JP-N2': `CHECKLIST · ${jpDone} / ${jpList.length}`,
    TODOS: `CLEARED TODAY · ${doneToday.length} / ${todosDen}`,
  };
  const stations = [
    morningStation(morningList),
    tradingDeskStation(desk),
    japaneseStation(jp, jpDone, jpList.length),
    academicsStation(acad, acadDone),
    todosStation(openTodos.length, doneToday.length, todosArr),
    financeStation(trading, txns),
    systemStation(S, sys, rpg),
  ];
  return {
    version: 'v1.0-live', build: DB.TODAY, user: email, tz: '+08:00', live: true,
    the90info: { demo: false, phase: S.phase, targets: S.targets, todayScores: S.todayScores, todayNote: S.todayNote, todayDate: S.todayDate },
    morning: { list: morningList, date: (loaded.morning && loaded.morning.date) || DB.TODAY },
    // raw domain arrays kept so the writable stations can recompute after a toggle
    _uid: (session.user && session.user.id) || null,
    _todos: todosArr, _academics: acad, _japanese: jp, _trading: trading, _tradingDesk: desk,
    rpg,
    the90, todayIndex: S.todayIndex, avg30: S.avg30, best: S.best,
    viz: { sys30, rise7: morningList.map(i => i && i.d ? 1 : 0), candles: buildLedgerCandles(txns),
      credits: acad.length ? acadDone / acad.length : 0,
      todos: todosDen ? doneToday.length / todosDen : 0,
      jp: jpList.length ? jpDone / jpList.length : 0,
      trade: deskList.length ? deskDone / deskList.length : 0, labels },
    stations,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// login affordance (demo mode only) — the USER submits; we just build the field
// ════════════════════════════════════════════════════════════════════════════
function linkEls() {
  return {
    root: document.getElementById('link'), form: document.getElementById('link-form'),
    email: document.getElementById('link-email'), msg: document.getElementById('link-msg'),
    toggle: document.getElementById('link-toggle'),
  };
}
function setLink(state) {                // 'ok' | 'demo' | 'down' | 'sent'
  const { root, msg, toggle } = linkEls(); if (!root) return;
  if (state === 'ok') { root.hidden = true; return; }
  root.hidden = false; root.dataset.state = state;
  if (toggle) toggle.textContent = state === 'down' ? '◗ LINK DOWN — RETRY' : '◗ LINK';
  if (msg) msg.textContent =
    state === 'down' ? 'LINK DOWN — retry to reconnect' :
    state === 'sent' ? 'CHECK EMAIL — magic link sent' :
    'OFFLINE DECK — link to sync your data';
}
function promptLink() {
  const { root, form, email } = linkEls(); if (!root) return;
  root.hidden = false; if (form) form.hidden = false; if (email) email.focus();
  if (audio && audio.tick) audio.tick();
}
function wireLink() {
  const { form, email, toggle, msg } = linkEls();
  if (toggle) toggle.addEventListener('click', () => {
    if (linkEls().root.dataset.state === 'down') { location.reload(); return; }
    if (form) form.hidden = !form.hidden;
    if (!form.hidden && email) email.focus();
  });
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const addr = (email && email.value || '').trim(); if (!addr) return;
    if (msg) msg.textContent = 'LINKING…';
    try { const { error } = await DB.signIn(addr); if (error) throw error; setLink('sent'); }
    catch (err) { if (msg) msg.textContent = 'LINK FAILED — ' + (err && err.message || 'retry'); }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// bootstrap — resolve session → real DATA, else demo MOCK (never blocks forever)
// ════════════════════════════════════════════════════════════════════════════
function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}
async function bootstrapData() {
  let session = null;
  try { session = await withTimeout(DB.getSession(), 6000); } catch { session = null; }
  if (!session || !session.user) { DATA = MOCK; LIVE = false; setLink('demo'); return; }
  let loaded = null;
  try { loaded = await withTimeout(DB.loadAll(session.user.id), 8000); } catch { loaded = null; }
  if (!loaded || !loaded.the90) { DATA = MOCK; LIVE = false; setLink('down'); return; }
  try { DATA = buildLiveData(loaded, session); LIVE = true; setLink('ok'); }
  catch { DATA = MOCK; LIVE = false; setLink('down'); }
}

// ════════════════════════════════════════════════════════════════════════════
// boot the app
// ════════════════════════════════════════════════════════════════════════════
async function main() {
  await bootstrapData();
  wireLink();
  // when a magic link completes on this page, re-bootstrap into live mode
  DB.onAuth((event) => { if (event === 'SIGNED_IN' && !LIVE) location.reload(); });

  const canvas = document.getElementById('deck');
  if (!webglOK()) { renderFallback(); return; }

  const reticle = document.getElementById('reticle');
  const retTag = reticle.querySelector('.ret-tag');
  const readout = document.getElementById('readout');
  const useReticle = !COARSE;
  if (useReticle) document.documentElement.dataset.reticle = 'on';

  // re-arm the one-shot ping ring on each new target lock (CSS animation restart)
  const retPing = reticle.querySelector('.ret-ping');
  function pingReticle() {
    if (REDUCED || !retPing) return;
    retPing.classList.remove('is-ping'); void retPing.offsetWidth; retPing.classList.add('is-ping');
  }

  const scene = createScene(canvas, {
    mock: DATA, reducedMotion: REDUCED, isMobile: IS_MOBILE,
    labelsEl: document.getElementById('labels'),
    onHover: (id) => {
      scene.highlight(id);
      if (id) {
        reticle.classList.add('is-locked'); retTag.textContent = 'LOCK · ' + id;
        readout.textContent = id + ' · TARGET';
        audio.tick();
        pingReticle();                                   // lock ping (presentational)
        const lbl = scene.labelFor(id);                  // decode-in the station label
        if (lbl) { const nm = lbl.querySelector('.lbl-name'); if (nm) scramble(nm, nm.dataset.full || nm.textContent, 360); }
      } else {
        reticle.classList.remove('is-locked'); retTag.textContent = '';
        if (!hudOpen) readout.textContent = 'DECK · IDLE';
      }
    },
    // pillar hover (desktop): reticle reads out the day under the cursor. Only
    // owns the reticle when no station is hovered (stations take priority).
    onPillarHover: (info) => {
      if (scene.hovered) return;
      if (info) {
        reticle.classList.add('is-locked');
        retTag.textContent = `D+${info.i + 1} · ${info.date} · ${Math.round(info.score * 100)}%`;
        readout.textContent = 'THE 90 · ' + info.date;
      } else {
        reticle.classList.remove('is-locked'); retTag.textContent = '';
        if (!hudOpen) readout.textContent = 'DECK · IDLE';
      }
    },
    onFocusDone: (id) => openHUD(id, scene),
    onReturnDone: () => { if (lenis) lenis.start(); },
  });

  // stash each station label's true text so hover-lock decode always settles
  // to the real name (never to a garbage frame of an interrupted scramble).
  DATA.stations.forEach(s => {
    const el = scene.labelFor(s.id); if (!el) return;
    const nm = el.querySelector('.lbl-name'); if (nm) nm.dataset.full = nm.textContent;
  });
  // reflect the (already-loaded) trading desk seal state on the monument — no
  // bloom pulse on this initial sync. Covers both LIVE and DEMO (mock desk).
  syncTradingSeal(scene, false);
  // decode-in the deck nameplate once the boot ceremony hands off to the deck.
  const decodeNameplate = () => { const np = document.querySelector('.np-main'); if (np) scramble(np, np.textContent, 620); };

  // ── reticle follows the pointer (desktop) ──────────────────────────────────
  if (useReticle) {
    window.addEventListener('pointermove', (e) => {
      reticle.style.transform = `translate(${e.clientX}px,${e.clientY}px) translate(-50%,-50%)`;
    });
  }

  // ── pointer drag → orbit, tap → focus ──────────────────────────────────────
  let dragging = false, moved = 0, lx = 0, ly = 0;
  canvas.addEventListener('pointerdown', (e) => {
    audio.arm(); dragging = true; moved = 0; lx = e.clientX; ly = e.clientY;
    scene.setPointer(e.clientX, e.clientY);   // fresh ndc so a tap can hit-test pillars (mobile)
    canvas.setPointerCapture?.(e.pointerId);
  });
  window.addEventListener('pointermove', (e) => {
    scene.setPointer(e.clientX, e.clientY);
    if (REDUCED) { scene.renderOnce(); return; }
    if (!dragging) return;
    const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (scene.mode === 'deck') scene.applyDrag(dx, dy);
  });
  const endDrag = (e) => {
    if (!dragging) return; dragging = false;
    if (moved >= 6 || scene.mode !== 'deck' || hudOpen) return;
    if (scene.hovered) {                          // station → camera fly → station HUD
      if (lenis) lenis.stop();
      scene.focusStation(scene.hovered);
    } else if (scene.pickPillar() != null) {      // monument tap → THE 90 log overlay
      openThe90HUD(scene);
    }
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // reduced-motion: hover via move already renders; click focuses / logs directly
  if (REDUCED) {
    canvas.addEventListener('click', (e) => {
      if (hudOpen) return;
      scene.setPointer(e.clientX, e.clientY);
      if (scene.hovered) scene.focusStation(scene.hovered);
      else if (scene.pickPillar() != null) openThe90HUD(scene);
    });
  }

  // ── keyboard + backplate return ────────────────────────────────────────────
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHUD(scene); });
  document.getElementById('hud-close').addEventListener('click', () => closeHUD(scene));
  hudEl.addEventListener('click', (e) => { if (e.target === hudEl) closeHUD(scene); });

  // ── Lenis smooth scroll → camera advance ────────────────────────────────────
  // + magnetic snap (ease to nearest tour stop after ~1s idle) and district
  // annunciation (scramble-decode the sector name into the readout on arrival).
  if (!REDUCED && Lenis) {
    lenis = new Lenis({ lerp: 0.08, wheelMultiplier: 0.9 });
    let snapTimer = 0, lastStopId = null;
    const annunciate = (id) => {
      if (hudOpen || scene.hovered) return;                // hover / HUD own the readout
      scramble(readout, id === '__overview' ? 'DECK · IDLE' : 'SECTOR · ' + id, 420);
    };
    lenis.on('scroll', ({ scroll, limit }) => {
      const frac = limit > 0 ? scroll / limit : 0;
      scene.setScroll(frac);
      // arrival at a new nearest stop → announce the sector
      const id = scene.nearestStopId();
      if (id !== lastStopId) { lastStopId = id; annunciate(id); }
      // magnetic snap: fires only after scroll input goes idle; never fights an
      // active scroll (each event resets the timer), skips if already parked.
      clearTimeout(snapTimer);
      if (limit <= 0) return;
      snapTimer = setTimeout(() => {
        if (scene.mode !== 'deck' || hudOpen) return;       // don't disturb focus / HUD
        const snap = scene.nearestStop();
        if (Math.abs(snap - frac) < 0.004) return;          // already at a stop
        lenis.scrollTo(snap * limit, { duration: 0.7 });    // gentle ease-in
      }, 1000);
    });
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }

  // ── resize / visibility / context-loss ──────────────────────────────────────
  window.addEventListener('resize', () => scene.resize(), { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (REDUCED) return;
    if (document.hidden) scene.stop(); else scene.start();
  });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); scene.stop(); }, false);
  canvas.addEventListener('webglcontextrestored', () => { if (!REDUCED) scene.start(); else scene.renderOnce(); }, false);

  // ── run boot → match-move descent → reveal → live ───────────────────────────
  // The camera starts on a high approach pose and drifts down while the boot log
  // types; when boot finishes the overlay fades and reveal() completes the same
  // descent as the grid scans in and pillars rise — one continuous shot, no cut.
  if (REDUCED) {
    runBoot(() => { scene.reveal(); scene.renderOnce(); decodeNameplate(); });
  } else {
    scene.beginIntro();      // seed approach pose + slow pre-drift (behind boot)
    scene.start();           // render loop on immediately
    runBoot(() => {
      scene.reveal(); decodeNameplate();
      // re-measure Lenis at deck handoff: if it cached its scroll limit before
      // layout settled (limit 0), every wheel clamps to target 0 — input eaten,
      // camera parked — until a window resize. resize() also re-syncs
      // target=actual, which is a no-op here (nothing scrolls during boot).
      if (lenis) lenis.resize();
    });
  }
}

main().catch((err) => { try { console.error('[next] boot failed', err); } catch {} });
