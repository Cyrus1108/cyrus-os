/* v6.51 Phase A — 黄铜玻璃 (brass glass) interaction layer.
   1) Daily text reveal (nirnor-style): the identity texts materialize once per
      day on first entry — dateline wipes up, datemeta rises, the 8/9 tagline
      writes itself left→right, panel eyebrows stagger in. Gated by a DEVICE-
      LOCAL marker (presentation, not state → not synced) so renderAll's many
      re-runs never replay it. Skipped entirely under prefers-reduced-motion
      and on the sterile theme.
   2) Pointer tilt + light spot: hover-capable fine-pointer devices get a
      ±1.6° perspective tilt and a brass glow that follows the cursor
      (CSS vars --rx/--ry/--mx/--my consumed by components.css). */

const RV_LS_KEY = 'reveal_last';   // via loadLS/saveLSRaw (STORAGE_PREFIX'd)

function glassSterile(){ return document.documentElement.getAttribute('data-theme') === 'sterile'; }
function glassReducedMotion(){
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ── daily reveal ── */
function glassDailyReveal(){
  if(glassSterile() || glassReducedMotion()) return;
  if(loadLS(RV_LS_KEY, null) === TODAY) return;
  saveLSRaw(RV_LS_KEY, TODAY);   // stamp first — a mid-animation reload won't replay

  const silk = 'cubic-bezier(0.4, 0.0, 0.2, 1)';
  const anim = (el, pre, keyframes, opts) => {
    if(!el) return;
    el.classList.add(pre);
    const a = el.animate(keyframes, Object.assign({ easing:silk, fill:'backwards' }, opts));
    a.onfinish = () => el.classList.remove(pre);
  };

  // 1. dateline — wipe up from the baseline, like a plate being raised
  anim(document.getElementById('dateline'), 'rv-pre-wipe-up', [
    { clipPath:'inset(0 0 100% 0)', transform:'translateY(14px)' },
    { clipPath:'inset(0 0 -8% 0)', transform:'translateY(0)' },
  ], { duration:750, delay:80 });

  // 2. datemeta — quiet rise underneath
  anim(document.getElementById('datemeta'), 'rv-pre-rise', [
    { opacity:0, transform:'translateY(8px)' },
    { opacity:1, transform:'translateY(0)' },
  ], { duration:520, delay:340 });

  // 3. the 8/9 countdown — writes itself left→right (ink stroke)
  anim(document.getElementById('the90-tagline'), 'rv-pre-wipe-lr', [
    { clipPath:'inset(0 100% 0 0)' },
    { clipPath:'inset(0 -4% 0 0)' },
  ], { duration:900, delay:520 });

  // 4. panel eyebrows — stagger down the page
  document.querySelectorAll('.panel-label-row').forEach((el, i) => {
    anim(el, 'rv-pre-rise', [
      { opacity:0, transform:'translateY(7px)' },
      { opacity:1, transform:'translateY(0)' },
    ], { duration:430, delay:420 + i * 85 });
  });
}

/* ── pointer tilt + light spot ── */
function glassInitTilt(){
  if(!(window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches)) return;
  const MAX = 1.6;     // degrees — material presence, not a carnival card
  let raf = 0;
  document.querySelectorAll('.panel').forEach(p => {
    p.addEventListener('pointermove', e => {
      if(glassSterile()) return;
      if(raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = p.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;   // -0.5 .. 0.5
        const ny = (e.clientY - r.top) / r.height - 0.5;
        p.style.setProperty('--ry', (nx * 2 * MAX).toFixed(2) + 'deg');
        p.style.setProperty('--rx', (-ny * 2 * MAX).toFixed(2) + 'deg');
        p.style.setProperty('--mx', ((nx + 0.5) * 100).toFixed(1) + '%');
        p.style.setProperty('--my', ((ny + 0.5) * 100).toFixed(1) + '%');
      });
    });
    p.addEventListener('pointerleave', () => {
      p.style.setProperty('--rx', '0deg');
      p.style.setProperty('--ry', '0deg');
    });
  });
}

/* ── Phase B: nirnor-style sketch trails ──
   A fixed background canvas where a handful of brass "ink walkers" wander in
   smooth curves; strokes accumulate and slowly dissolve (destination-out),
   giving the drifting pencil-thread field behind the glass. Discipline:
   ~30fps cap, paused while the tab is hidden, skipped under reduced-motion,
   hidden on sterile (CSS), lighter on touch devices. */
function glassInitTrails(){
  if(glassReducedMotion()) return;
  const cv = document.createElement('canvas');
  cv.id = 'glass-trails';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');

  const mobile = window.matchMedia('(pointer:coarse)').matches;
  const DPR = mobile ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
  const N = mobile ? 4 : 7;            // walkers
  const FRAME = 1000 / 30;             // 30fps is plenty for drifting ink
  let W = 0, H = 0, walkers = [], raf = 0, last = 0, t = 0;

  function brass(){
    return getComputedStyle(document.documentElement).getPropertyValue('--brass').trim() || '#A88455';
  }
  let stroke = brass();

  function resize(){
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.lineWidth = 0.7;
    seed(); prewarm(400);              // never start from an empty page
  }
  function seed(){
    walkers = Array.from({ length: N }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      h: Math.random() * Math.PI * 2,
      s: 0.5 + Math.random() * 0.5,                       // px per step
      f1: 0.003 + Math.random() * 0.004, p1: Math.random() * 7,
      f2: 0.011 + Math.random() * 0.006, p2: Math.random() * 7,
    }));
  }
  function step(){
    // dissolve old ink a touch (≈12s half-life at 30fps)
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.0035)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke;
    ctx.globalAlpha = 0.05;            // each pass is a whisper; density comes from time
    ctx.beginPath();
    for(const w of walkers){
      // layered sine steering ≈ organic pencil wander
      w.h += 0.045 * Math.sin(t * w.f1 + w.p1) + 0.028 * Math.sin(t * w.f2 + w.p2)
           + (Math.random() - 0.5) * 0.05;
      const nx = w.x + Math.cos(w.h) * w.s;
      const ny = w.y + Math.sin(w.h) * w.s;
      if(nx < -8 || nx > W + 8 || ny < -8 || ny > H + 8 || Math.random() < 0.0006){
        // wrap/re-seed with a pen lift — no screen-crossing strokes
        w.x = Math.random() * W; w.y = Math.random() * H;
        w.h = Math.random() * Math.PI * 2;
        continue;
      }
      ctx.moveTo(w.x, w.y); ctx.lineTo(nx, ny);
      w.x = nx; w.y = ny;
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    t++;
  }
  function prewarm(n){ for(let i = 0; i < n; i++) step(); }

  function loop(ts){
    raf = requestAnimationFrame(loop);
    if(ts - last < FRAME) return;
    last = ts;
    step();
  }
  function start(){ if(!raf){ last = 0; raf = requestAnimationFrame(loop); } }
  function stop(){ if(raf){ cancelAnimationFrame(raf); raf = 0; } }

  document.addEventListener('visibilitychange', () => {
    document.hidden ? stop() : start();
  });
  window.addEventListener('resize', () => { stroke = brass(); resize(); });
  if(window.matchMedia){
    // theme flip (light/dark) changes --brass → restroke
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      stroke = brass();
    });
  }
  resize();
  start();
}

/* called from app.js init(), right after the first renderAll (content exists,
   LS-painted) — runs exactly once per page load */
function initGlass(){
  glassDailyReveal();
  glassInitTilt();
  glassInitTrails();
}
