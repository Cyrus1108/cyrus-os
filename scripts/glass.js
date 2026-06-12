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

/* called from app.js init(), right after the first renderAll (content exists,
   LS-painted) — runs exactly once per page load */
function initGlass(){
  glassDailyReveal();
  glassInitTilt();
}
