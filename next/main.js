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
  const END = Date.UTC(2026, 6, 5);              // 2026-07-05 (today, +08:00 deck)
  const START = END - (N - 1) * 86400000;
  let s = 0x9e3779b9;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const TRACKS = ['RISE', 'STUDY', 'JP', 'TRADE', 'BODY'];
  const the90 = [];
  for (let i = 0; i < N; i++) {
    const d = new Date(START + i * 86400000);
    const ramp = 0.42 + 0.4 * (i / (N - 1));      // upward discipline curve
    const weekly = Math.sin(i / 7 * Math.PI * 2) * 0.06;
    const tracks = TRACKS.map(() => Math.max(0, Math.min(1, ramp + weekly + (rnd() - 0.5) * 0.5)));
    let score = tracks.reduce((a, b) => a + b, 0) / tracks.length;
    if (i === N - 1) { score = 0.55; }             // today: in-progress
    the90.push({
      date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      tracks, score: Math.round(score * 100) / 100,
    });
  }
  const days30 = the90.slice(-30);
  const avg30 = Math.round(days30.reduce((a, d) => a + d.score, 0) / days30.length * 100);
  // longest streak of score ≥ 0.6
  let streak = 0, best = 0;
  for (const d of the90) { if (d.score >= 0.6) { streak++; best = Math.max(best, streak); } else streak = 0; }

  return {
    version: 'v0.1.0-deck', build: '2026.07.05', user: 'qjun.aom', tz: '+08:00',
    the90, todayIndex: N - 1, avg30, best,
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
const audio = (() => {
  let ctx = null, armed = false;
  const ensure = () => {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ctx = new AC(); }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  };
  const arm = () => { armed = true; ensure(); };
  const beep = (freq, dur, type, gain, glideTo) => {
    if (!armed) return; const c = ensure(); if (!c) return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  };
  return {
    arm,
    powerup: () => { beep(180, 0.5, 'sawtooth', 0.05, 620); },              // boot power-on rise
    tick: () => { beep(1300, 0.045, 'square', 0.03); },                     // target-lock click
    hud: () => { beep(420, 0.28, 'triangle', 0.045, 880); },               // HUD open sweep
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
const hudEl = document.getElementById('hud');
let hudOpen = false;
function openHUD(id) {
  const st = MOCK.stations.find(s => s.id === id); if (!st) return;
  document.getElementById('hud-glyph').textContent = st.glyph;
  document.getElementById('hud-kicker').textContent = st.hud.kicker;
  document.getElementById('hud-title').textContent = st.label;
  document.getElementById('hud-body').innerHTML = st.hud.cells.map(c =>
    `<div class="hud-cell${c.wide ? ' wide' : ''}"><div class="hud-k">${c.k}</div>
     <div class="hud-v${c.accent === 'cyan' ? ' cyan' : ''}">${c.v}${c.unit ? ` <small>${c.unit}</small>` : ''}</div></div>`
  ).join('') + `<div class="hud-cell wide"><div class="hud-note">${st.hud.note}</div></div>`;
  document.getElementById('hud-foot').innerHTML = `<span>${id} · LIVE MOCK</span><span>ESC / BACKPLATE ⟵ DECK</span>`;
  const sysAvg = document.getElementById('sys-avg'); if (sysAvg) sysAvg.textContent = MOCK.avg30 + '%';
  const sysStreak = document.getElementById('sys-streak'); if (sysStreak) sysStreak.textContent = MOCK.best + 'd';
  hudEl.hidden = false;
  requestAnimationFrame(() => hudEl.classList.add('is-open'));
  hudOpen = true;
  audio.arm(); audio.hud();
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
    onFocusDone: (id) => openHUD(id),
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

  // ── run boot → reveal → live ────────────────────────────────────────────────
  runBoot(() => {
    scene.reveal();
    if (REDUCED) scene.renderOnce(); else scene.start();
  });
}

main();
