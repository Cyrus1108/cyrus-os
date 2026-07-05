// ============================================================================
// CYRUS://NEXT — COMMAND DECK · main.js
// Orchestrates: boot self-check → deck reveal → orbit/scroll/focus interaction
// → slant HUD overlay. Owns the (single) MOCK data object, minimal WebAudio,
// Lenis scroll, and all degradation paths (mobile / reduced-motion / no-WebGL).
// ============================================================================
import { createScene } from './scene.js';

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
    candles,                                                     // 12 mini candles
    credits: 108 / 120,
    todos: 12 / (12 + 7),
    jp: 1 - 88 / 120,                                            // exam prep progress
  };

  return {
    version: 'v0.1.0-deck', build: '2026.07.06', user: 'qjun.aom', tz: '+08:00',
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
      { id: 'TRADING', label: 'TRADING', glyph: '↗', tag: 'WIN <b>61%</b> · R <b>2.3</b>',
        hud: { kicker: 'MARKETS / K線碑', cells: [
          { k: 'Win rate', v: '61', unit: '%' },
          { k: 'Avg R', v: '2.3', accent: 'cyan' },
          { k: 'Trades', v: '214', unit: 'YTD' },
          { k: 'Max DD', v: '-8.4', unit: '%', accent: 'cyan' },
        ], note: 'Journal discipline <b>96%</b> · no revenge trades in 21 sessions.' } },
      { id: 'TODOS', label: 'TODOS', glyph: '▤', tag: 'OPEN <b>7</b> · DONE <b>12</b>',
        hud: { kicker: 'BACKLOG / 堆叠', cells: [
          { k: 'Open', v: '7' },
          { k: 'Done today', v: '12', accent: 'cyan' },
          { k: 'Overdue', v: '1' },
          { k: 'Focus blocks', v: '4', unit: 'today', accent: 'cyan' },
        ], note: 'Next up: <b>submit visa docs</b> · due today 18:00.' } },
      { id: 'SYSTEM', label: 'SYSTEM', glyph: '◇', tag: 'LV <b>24</b> · UPTIME <b>312d</b>',
        hud: { kicker: 'CORE / 核心', cells: [
          { k: 'Level', v: '24' },
          { k: 'Uptime', v: '312', unit: 'days', accent: 'cyan' },
          { k: 'Integrity', v: '98', unit: '%' },
          { k: 'Modules', v: '6', unit: '/ 6', accent: 'cyan' },
        ], note: 'The90 30-day avg <b id="sys-avg"></b> · longest streak <b id="sys-streak"></b>.' } },
    ],
  };
})();

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
  const arm = () => { armed = true; ensure(); };
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
    { t: `CYRUS://NEXT  ${MOCK.version}`, c: 'hd' },
    { t: `[ok] kernel ................. mounted`, c: 'ok' },
    { t: `[ok] tactical-grid .......... online`, c: 'ok' },
    { t: `[ok] the90.datastore ........ 90d synced`, c: 'ok' },
    { t: `[ok] modules ................ 6/6 linked`, c: 'ok' },
    { t: `[ok] audio.webaudio ......... armed`, c: 'ok' },
    { t: `[ok] session ${MOCK.user} .. ${MOCK.build} ${MOCK.tz}`, c: 'ok' },
    { t: `> deck ready`, c: 'hd' },
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
  el.innerHTML = `<h1>CYRUS://NEXT</h1><div class="fb-sub">COMMAND DECK · TEXT FALLBACK · ${MOCK.build}</div>
    <div class="fb-grid">${MOCK.stations.map(s => `<div class="fb-card"><h2>${s.label}</h2>
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
  const v = MOCK.viz;
  switch (id) {
    case 'SYSTEM': return { k: 'THE 90 · LAST 30 DAYS', h: svgBars(v.sys30, v.sys30.length - 1) };
    case 'TRADING': return { k: 'LAST 12 SESSIONS', h: svgCandles(v.candles) };
    case 'MORNING': return { k: 'WAKE RITUAL · 7 DAYS', h: svgDots(v.rise7, 0.5) };
    case 'ACADEMICS': return { k: 'CREDITS · 108 / 120', h: svgMeter(v.credits) };
    case 'JP-N2': return { k: 'EXAM PREP · D-88', h: svgRing(v.jp) };
    case 'TODOS': return { k: 'CLEARED TODAY · 12 / 19', h: svgMeter(v.todos) };
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

const hudEl = document.getElementById('hud');
let hudOpen = false;
function openHUD(id, scene) {
  const st = MOCK.stations.find(s => s.id === id); if (!st) return;
  document.getElementById('hud-glyph').textContent = st.glyph;
  document.getElementById('hud-kicker').textContent = st.hud.kicker;
  document.getElementById('hud-title').textContent = st.label;
  document.getElementById('hud-body').innerHTML = st.hud.cells.map(c =>
    `<div class="hud-cell${c.wide ? ' wide' : ''}"><div class="hud-k">${c.k}</div>
     <div class="hud-v${c.accent === 'cyan' ? ' cyan' : ''}"><span class="num" data-v="${c.v}">${c.v}</span>${c.unit ? ` <small>${c.unit}</small>` : ''}</div></div>`
  ).join('') + `<div class="hud-cell wide"><div class="hud-note">${st.hud.note}</div></div>`;
  const viz = buildViz(id);
  const vizEl = document.getElementById('hud-viz');
  if (viz) { vizEl.hidden = false; vizEl.innerHTML = `<div class="hud-viz-k">${viz.k}</div>${viz.h}`; }
  else { vizEl.hidden = true; vizEl.innerHTML = ''; }
  document.getElementById('hud-foot').innerHTML = `<span>${id} · LIVE MOCK</span><span>ESC / BACKPLATE ⟵ DECK</span>`;
  const sysAvg = document.getElementById('sys-avg'); if (sysAvg) sysAvg.textContent = MOCK.avg30 + '%';
  const sysStreak = document.getElementById('sys-streak'); if (sysStreak) sysStreak.textContent = MOCK.best + 'd';
  hudEl.hidden = false;
  requestAnimationFrame(() => hudEl.classList.add('is-open'));
  hudOpen = true;
  // content follows the panel slide-in: cells stagger + numbers count up
  if (gsap && !REDUCED) {
    gsap.fromTo('#hud-body .hud-cell', { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, ease: 'power2.out', delay: 0.12, overwrite: true });
    gsap.fromTo('#hud-viz', { opacity: 0 }, { opacity: 1, duration: 0.5, delay: 0.18, overwrite: true });
  }
  document.querySelectorAll('#hud-body .hud-v .num').forEach(countUp);
  if (scene && scene.pulseBloom) scene.pulseBloom();     // HUD-open bloom pulse
  audio.arm(); audio.hud(); audio.sink();                 // sweep + low-frequency sink
  document.getElementById('readout').textContent = `${id} · FOCUSED`;
}
function closeHUD(scene) {
  if (!hudOpen) return;
  hudEl.classList.remove('is-open');
  setTimeout(() => { hudEl.hidden = true; }, 500);
  hudOpen = false;
  scene.returnDeck();
  document.getElementById('readout').textContent = 'DECK · IDLE';
}

// ════════════════════════════════════════════════════════════════════════════
// boot the app
// ════════════════════════════════════════════════════════════════════════════
function main() {
  const canvas = document.getElementById('deck');
  if (!webglOK()) { renderFallback(); return; }

  const reticle = document.getElementById('reticle');
  const retTag = reticle.querySelector('.ret-tag');
  const readout = document.getElementById('readout');
  const useReticle = !COARSE;
  if (useReticle) document.documentElement.dataset.reticle = 'on';

  const scene = createScene(canvas, {
    mock: MOCK, reducedMotion: REDUCED, isMobile: IS_MOBILE,
    labelsEl: document.getElementById('labels'),
    onHover: (id) => {
      scene.highlight(id);
      if (id) {
        reticle.classList.add('is-locked'); retTag.textContent = 'LOCK · ' + id;
        readout.textContent = id + ' · TARGET';
        audio.tick();
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
    if (moved < 6 && scene.mode === 'deck' && scene.hovered) {
      if (lenis) lenis.stop();
      scene.focusStation(scene.hovered);
    }
  };
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // reduced-motion: hover via move already renders; click focuses directly
  if (REDUCED) {
    canvas.addEventListener('click', () => { if (scene.hovered) scene.focusStation(scene.hovered); });
  }

  // ── keyboard + backplate return ────────────────────────────────────────────
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHUD(scene); });
  document.getElementById('hud-close').addEventListener('click', () => closeHUD(scene));
  hudEl.addEventListener('click', (e) => { if (e.target === hudEl) closeHUD(scene); });

  // ── Lenis smooth scroll → camera advance ────────────────────────────────────
  let lenis = null;
  if (!REDUCED && Lenis) {
    lenis = new Lenis({ lerp: 0.08, wheelMultiplier: 0.9 });
    lenis.on('scroll', ({ scroll, limit }) => { scene.setScroll(limit > 0 ? scroll / limit : 0); });
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
    runBoot(() => { scene.reveal(); scene.renderOnce(); });
  } else {
    scene.beginIntro();      // seed approach pose + slow pre-drift (behind boot)
    scene.start();           // render loop on immediately
    runBoot(() => { scene.reveal(); });
  }
}

main();
