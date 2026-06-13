/* v7.0 — 黄铜玻璃 · maximalist interaction layer (nirnor-grade).
   Stack: GSAP + ScrollTrigger + SplitText + Lenis (vendor/, all free since 3.13).
   - Lenis damped smooth-scroll, glued to ScrollTrigger
   - Hero scatter-assemble: the dateline chars fly in from 3D chaos on every
     load, then SplitText.revert() hands the element back to the brassFlow
     gradient. Section titles & eyebrows scatter/assemble ON SCROLL, with
     reverse — typography stays alive while you move.
   - Panels converge from 3D space into the flat grid (once per load,
     clearProps afterwards so the pointer tilt owns transform again).
   - Pointer tilt (JS-lerped, ±3.2°) + brass light-spot.
   - Sketch trails v2: more ink, pointer attraction, full frame rate.
   Sterile theme: everything here is skipped. prefers-reduced-motion: skipped
   (OS-level accessibility wins over maximalism). */

function glassSterile(){ return document.documentElement.getAttribute('data-theme') === 'sterile'; }
function glassReducedMotion(){
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ── Lenis smooth scroll ── */
let _lenis = null;
function glassInitLenis(){
  if(typeof Lenis === 'undefined') return;
  // inner scrollers must keep native behavior
  ['drawer','finance-view','system-view','sys-modal'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.setAttribute('data-lenis-prevent','');
  });
  _lenis = new Lenis({ duration: 1.15, smoothWheel: true });
  if(window.ScrollTrigger) _lenis.on('scroll', ScrollTrigger.update);
  (function raf(time){ _lenis.raf(time); requestAnimationFrame(raf); })(0);
}

/* ── flicker reveal — nirnor's signal-lamp typography: each char blinks a few
   random times then settles lit. No positional flight (用户钦定). ── */
function glassFlicker(chars, baseDelay, spread){
  chars.forEach(ch => {
    const tl = gsap.timeline({ delay: (baseDelay || 0) + Math.random() * (spread == null ? 0.55 : spread) });
    const blinks = 2 + Math.floor(Math.random() * 3);
    tl.set(ch, { autoAlpha: 0 });
    for(let i = 0; i < blinks; i++){
      tl.set(ch, { autoAlpha: 0.8 + Math.random() * 0.2 }, `+=${0.03 + Math.random() * 0.07}`);
      tl.set(ch, { autoAlpha: 0.05 + Math.random() * 0.25 }, `+=${0.02 + Math.random() * 0.05}`);
    }
    tl.to(ch, { autoAlpha: 1, duration: 0.1 }, `+=${0.02 + Math.random() * 0.04}`);
  });
}

/* ── scroll-bound typography + stacked-card choreography ── */
function glassInitScrollFX(){
  if(!(window.gsap && window.ScrollTrigger)) return;
  gsap.registerPlugin(ScrollTrigger);
  // a heavy frame must SLOW a tween down, not swallow it (侧聊保险 #2)
  gsap.ticker.lagSmoothing(100, 16);
  const hasSplit = typeof SplitText !== 'undefined';
  if(hasSplit) gsap.registerPlugin(SplitText);

  /* A. hero — dateline chars flicker alive one by one, every load; SplitText
     reverts afterwards so the brassFlow gradient owns the element again */
  const dl = document.getElementById('dateline');
  if(dl && hasSplit && dl.textContent.trim()){
    const split = new SplitText(dl, { type:'chars' });
    glassFlicker(split.chars, 0.15, 0.8);
    gsap.delayedCall(2.6, () => { try{ split.revert(); }catch(e){} });
  }
  const dm = document.getElementById('datemeta');
  if(dm && hasSplit && dm.textContent.trim()){
    const sp = new SplitText(dm, { type:'chars' });
    glassFlicker(sp.chars, 0.7, 0.7);
    gsap.delayedCall(3.0, () => { try{ sp.revert(); }catch(e){} });
  }

  /* B. the 8/9 tagline — ink-stroke wipe, scroll-reactive (element survives
     re-renders; only textContent changes, inline clip-path persists) */
  const tg = document.getElementById('the90-tagline');
  if(tg) gsap.fromTo(tg,
    { clipPath:'inset(0 100% 0 0)', autoAlpha:0.4 },
    { clipPath:'inset(0 -5% 0 0)', autoAlpha:1, duration:1.1, ease:'power2.inOut',
      scrollTrigger:{ trigger: tg, start:'top 92%', toggleActions:'play none none reverse' } });

  /* C. section titles + eyebrows — flicker in when scrolled into view,
     go dark again when you scroll back above them (typography stays alive) */
  if(hasSplit){
    document.querySelectorAll('.panel .serif-it, .the90-head .serif-it').forEach(el => {
      if(!el.textContent.trim()) return;
      const sp = new SplitText(el, { type:'chars' });
      gsap.set(sp.chars, { autoAlpha: 0 });
      ScrollTrigger.create({
        trigger: el, start: 'top 92%',
        onEnter: () => glassFlicker(sp.chars, 0, 0.45),
        onLeaveBack: () => gsap.set(sp.chars, { autoAlpha: 0 }),
      });
    });
  }
  document.querySelectorAll('.panel-label-row').forEach(el => {
    gsap.set(el, { autoAlpha: 0 });
    ScrollTrigger.create({
      trigger: el, start: 'top 94%',
      onEnter: () => glassFlicker([el], 0, 0.15),
      onLeaveBack: () => gsap.set(el, { autoAlpha: 0 }),
    });
  });

  /* D. hero drifts up slightly as you scroll away (parallax breath) */
  const hd = dl ? dl.parentElement : null;
  if(hd) gsap.to(hd, {
    yPercent: -14, autoAlpha: 0.35, ease: 'none',
    scrollTrigger: { trigger: document.body, start: 'top top', end: '38% top', scrub: 0.6 },
  });
}

/* ── stacked cards (粘性滚动堆叠) — each top-level section pins near the top
   and the next one slides up OVER it; the covered card scales down and dims
   under the incoming glass (scrub-bound). Wrapping happens in JS so renderAll
   (which only ever touches ids INSIDE panels) never notices. ── */
function glassInitStacking(){
  if(!(window.gsap && window.ScrollTrigger)) return;
  const grid = document.getElementById('m-ac') ?
    document.getElementById('m-ac').closest('.panel').parentElement : null;   // the II/III/IV grid row
  const todos = document.getElementById('td-list') ?
    document.getElementById('td-list').closest('.panel') : null;
  const sections = [
    document.getElementById('the90-panel'),
    document.querySelector('.mr-panel'),
    grid,
    todos,
  ].filter(Boolean);

  const cards = sections.map((sec) => {
    const wrap = document.createElement('div');
    wrap.className = 'stack-card';
    sec.parentNode.insertBefore(wrap, sec);
    wrap.appendChild(sec);
    return wrap;
  });

  /* sticky top per card — THE tall-card fix: a card taller than the viewport
     pins by its BOTTOM edge (negative top), so every line of it scrolls into
     view before the next card starts covering it. Recomputed on resize and on
     every ScrollTrigger refresh (pull-render / flip change heights). */
  function setTops(){
    const vh = innerHeight;
    cards.forEach((c, i) => {
      const base = Math.min(Math.max(8, vh * 0.035), 36) + i * 14;
      const h = c.offsetHeight;
      c.style.top = (h + base + 24 < vh) ? base + 'px' : (vh - h - 16) + 'px';
    });
  }
  setTops();
  window.addEventListener('resize', setTops);
  ScrollTrigger.addEventListener('refreshInit', setTops);

  for(let i = 0; i < cards.length - 1; i++){
    gsap.to(cards[i], {
      scale: 0.95, autoAlpha: 0.5, transformOrigin: 'center top', ease: 'none',
      scrollTrigger: {
        trigger: cards[i + 1],
        start: 'top bottom',
        end: 'top top+=120',
        scrub: true,
      },
    });
  }
  ScrollTrigger.refresh();
}

/* ── 3D card flip (交易面板 v1) — front: 今日清单+偏向, back: 市场时段.
   Pure CSS3 transforms (perspective + rotateY + backface-visibility);
   JS is just the class switch. Children move INTO the faces with their ids
   intact, so app.js tick() keeps updating #sessions/#sesh-now untouched. ── */
function glassInitFlip(){
  const trList = document.getElementById('tr-list');
  if(!trList) return;
  const panel = trList.closest('.panel');
  if(!panel || panel.querySelector('.flip3d')) return;
  const head = panel.querySelector('.panel-head');
  const rest = [...panel.children].filter(el => el !== head);
  if(rest.length < 5) return;

  const wrap = document.createElement('div');  wrap.className = 'flip3d';
  const front = document.createElement('div'); front.className = 'flip-face flip-front';
  const back = document.createElement('div');  back.className = 'flip-face flip-back';
  // children 0-3 = 市场时段 sub-label + #sessions + #sesh-now-wrap + rule → back
  rest.slice(0, 4).forEach(el => back.appendChild(el));
  rest.slice(4).forEach(el => front.appendChild(el));
  wrap.appendChild(front); wrap.appendChild(back);
  panel.appendChild(wrap);
  panel.classList.add('flip-host');

  const btn = document.createElement('button');
  btn.className = 'flip-btn';
  btn.textContent = '⇄ 市场时段';
  panel.insertBefore(btn, wrap);

  function syncHeight(){
    const face = wrap.classList.contains('flipped') ? back : front;
    wrap.style.height = face.scrollHeight + 'px';
  }
  if(window.ResizeObserver){
    const ro = new ResizeObserver(syncHeight);
    ro.observe(front); ro.observe(back);
  }
  syncHeight();

  btn.addEventListener('click', () => {
    wrap.classList.toggle('flipped');
    btn.textContent = wrap.classList.contains('flipped') ? '⇄ 今日清单' : '⇄ 市场时段';
    syncHeight();
    if(window.Sfx) Sfx.tab();
    setTimeout(() => { if(window.ScrollTrigger) ScrollTrigger.refresh(); }, 750);
  });
}

/* ── 3D perspective page transition — the main page recedes into depth while
   a protocol modal is up (App-layering, 纯 CSS transform, JS仅开关 class) ── */
function pageDepth(on){
  const pw = document.querySelector('.page-wrapper');
  if(pw) pw.classList.toggle('page-depth', !!on);
}
window.pageDepth = pageDepth;

/* ── Focus Spaces (板块聚焦) — click ⤢ on a board and the SAME panel node
   FLIP-animates out of the deck into a fullscreen dedicated space (all ids,
   checkboxes and sync untouched); the page recedes behind it. Exit: ×,
   backdrop or Esc — it flies back into its slot. GSAP Flip plugin. ── */
let _focus = null;
const FOCUS_INTERACTIVE = 'button,input,textarea,select,a,label,[onclick],.row,.mr-pill,.the90-cell,.lowday-amp-dot,.drag-handle,.cat-pills,.flip-btn,.flip3d';
function glassInitFocus(){
  if(!window.gsap) return;

  // backdrop = the only exit surface besides Esc (按用户要求：无按钮无×)
  const bd = document.createElement('div');
  bd.className = 'focus-backdrop';
  bd.addEventListener('click', () => unfocusPanel());
  document.body.appendChild(bd);

  const targets = [
    document.getElementById('the90-panel'),
    document.querySelector('.mr-panel'),
    ...(document.getElementById('m-ac') ?
        [...document.getElementById('m-ac').closest('.panel').parentElement.children].filter(el => el.classList.contains('panel')) : []),
    document.getElementById('td-list') ? document.getElementById('td-list').closest('.panel') : null,
  ].filter(Boolean);

  /* click-ANYWHERE on the card opens its space — but only a real tap:
     ≤10px pointer travel, ≤600ms, and not on any interactive element
     (so scrolling never misfires and checkboxes stay checkboxes) */
  targets.forEach(p => {
    let sx = 0, sy = 0, st = 0;
    p.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; st = Date.now(); }, { passive:true });
    p.addEventListener('pointerup', e => {
      if(_focus) return;
      if(Math.hypot(e.clientX - sx, e.clientY - sy) > 10 || Date.now() - st > 600) return;
      if(e.target.closest(FOCUS_INTERACTIVE)) return;
      focusPanel(p);
    });
    p.classList.add('focusable');
  });

  document.addEventListener('keydown', e => { if(e.key === 'Escape') unfocusPanel(); });
}
/* manual FLIP — the flight happens entirely as a body-level fixed element in
   viewport coordinates, so transformed ancestors (the deck's scrub scale) can
   never skew the math (the Flip-plugin absolute mode did exactly that).
   .in-flight suspends backdrop-filter during the flight: blurring glass is
   what made the animation stutter. */
/* Focus flight v3 (侧聊诊断): the manual-FLIP math was right but the takeoff
   frame was too expensive — reparent reflow + backdrop blur + page-wide 3D
   recede all landed on frame 0 (300-500ms), and GSAP runs on wall-clock time,
   so frame 2 was already at 70-100% → "open grows from center, close snaps".
   PRIMARY: View Transitions API — the browser snapshots old/new states and
   animates the snapshots on the COMPOSITOR thread; main-thread jank cannot
   eat the animation, and the blur is baked into the snapshot. The shared
   element pairs via view-transition-name (set BEFORE startViewTransition,
   cleared after finished, or it degrades to a center crossfade).
   FALLBACK (old browsers): GSAP flight with lagSmoothing + the heavy side
   effects (backdrop/pageDepth) deferred ~90ms off the takeoff frame. */
function focusPanel(panel){
  if(_focus) return;
  const ph = document.createElement('div');
  ph.className = 'focus-ph';
  ph.style.height = panel.offsetHeight + 'px';
  _focus = { panel, ph, flying: true };
  if(_lenis) _lenis.stop();

  const mutate = () => {
    panel.parentNode.insertBefore(ph, panel);
    document.body.appendChild(panel);
    panel.classList.add('panel-focused');
    panel.setAttribute('data-lenis-prevent','');
    document.body.classList.add('has-focus');
    pageDepth(true);
  };

  if(document.startViewTransition){
    panel.style.viewTransitionName = 'focus-card';
    const vt = document.startViewTransition(mutate);
    vt.finished.finally(() => {
      panel.style.viewTransitionName = '';
      if(_focus) _focus.flying = false;
    });
  } else {
    const first = panel.getBoundingClientRect();
    panel.parentNode.insertBefore(ph, panel);
    document.body.appendChild(panel);
    panel.classList.add('panel-focused', 'in-flight');
    panel.setAttribute('data-lenis-prevent','');
    const last = panel.getBoundingClientRect();
    gsap.fromTo(panel, {
      x: first.left - last.left, y: first.top - last.top,
      scaleX: first.width / last.width, scaleY: first.height / last.height,
      transformOrigin: '0 0',
    }, {
      x: 0, y: 0, scaleX: 1, scaleY: 1, duration: 0.7, ease: 'power3.inOut',
      onComplete: () => {
        panel.classList.remove('in-flight');
        gsap.set(panel, { clearProps: 'transform' });
        if(_focus) _focus.flying = false;
      },
    });
    // heavy side effects ride a later frame so the takeoff frame only flies
    setTimeout(() => { document.body.classList.add('has-focus'); pageDepth(true); }, 90);
  }
  if(window.Sfx && typeof Sfx.open === 'function') Sfx.open();
}
function unfocusPanel(){
  if(!_focus || _focus.flying) return;
  const { panel, ph } = _focus;
  _focus.flying = true;
  if(_lenis) _lenis.start();

  const cleanup = () => {
    panel.classList.remove('panel-focused');
    panel.removeAttribute('data-lenis-prevent');
    ph.parentNode.insertBefore(panel, ph);
    ph.remove();
  };

  if(document.startViewTransition){
    panel.style.viewTransitionName = 'focus-card';
    const vt = document.startViewTransition(() => {
      cleanup();
      document.body.classList.remove('has-focus');
      pageDepth(false);
    });
    vt.finished.finally(() => {
      panel.style.viewTransitionName = '';
      _focus = null;
      if(window.ScrollTrigger) ScrollTrigger.refresh();
    });
  } else {
    panel.classList.add('in-flight');
    document.body.classList.remove('has-focus');
    /* measure the slot at identity — un-recede the page instantly first */
    const pw = document.querySelector('.page-wrapper');
    let pwTrans = null;
    if(pw){
      pwTrans = pw.style.transition;
      pw.style.transition = 'none';
      pw.classList.remove('page-depth');
      void pw.offsetHeight;
    }
    const cur = panel.getBoundingClientRect();
    const tgt = ph.getBoundingClientRect();
    if(pw) pw.style.transition = pwTrans || '';
    gsap.fromTo(panel, {
      x: 0, y: 0, scaleX: 1, scaleY: 1, transformOrigin: '0 0',
    }, {
      x: tgt.left - cur.left, y: tgt.top - cur.top,
      scaleX: tgt.width / cur.width, scaleY: tgt.height / cur.height,
      duration: 0.62, ease: 'power3.inOut',
      onComplete: () => {
        panel.classList.remove('panel-focused', 'in-flight');
        cleanup();
        gsap.set(panel, { clearProps: 'transform' });
        _focus = null;
        if(window.ScrollTrigger) ScrollTrigger.refresh();
      },
    });
  }
  if(window.Sfx && typeof Sfx.close === 'function') Sfx.close();
}
window.unfocusPanel = unfocusPanel;

/* ── Finance → System HUD unification: same backdrop, same .sys-window shell
   (corners/border/glass/seam), same scroll-unfurl open and furl close.
   DOM is wrapped here at init so finance.js internals stay untouched. ── */
function glassInitFinanceHUD(){
  const v = document.getElementById('finance-view');
  if(!v || v.querySelector('.sys-window')) return;
  const bd = document.createElement('div');
  bd.className = 'sys-backdrop';
  bd.addEventListener('click', () => { if(typeof closeFinance === 'function') closeFinance(); });
  const win = document.createElement('div');
  win.className = 'sys-window fin-hud';
  win.innerHTML = '<div class="sys-corner tl"></div><div class="sys-corner tr"></div><div class="sys-corner bl"></div><div class="sys-corner br"></div>';
  while(v.firstChild) win.appendChild(v.firstChild);
  v.appendChild(bd); v.appendChild(win);
}

/* ── Fitness → same HUD shell as Finance/System (sys-window + backdrop). ── */
function glassInitFitnessHUD(){
  const v = document.getElementById('fitness-view');
  if(!v || v.querySelector('.sys-window')) return;
  const bd = document.createElement('div');
  bd.className = 'sys-backdrop';
  bd.addEventListener('click', () => { if(typeof closeFitness === 'function') closeFitness(); });
  const win = document.createElement('div');
  win.className = 'sys-window fit-hud';
  win.innerHTML = '<div class="sys-corner tl"></div><div class="sys-corner tr"></div><div class="sys-corner bl"></div><div class="sys-corner br"></div>';
  while(v.firstChild) win.appendChild(v.firstChild);
  v.appendChild(bd); v.appendChild(win);
}

/* ── pointer tilt + light spot (JS lerp — no CSS transition fighting GSAP) ── */
function glassInitTilt(){
  if(!(window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches)) return;
  const MAX = 3.2;
  document.querySelectorAll('.panel').forEach(p => {
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, hovering = false;
    function tick(){
      cx += (tx - cx) * 0.16; cy += (ty - cy) * 0.16;
      p.style.setProperty('--rx', cy.toFixed(3) + 'deg');
      p.style.setProperty('--ry', cx.toFixed(3) + 'deg');
      if(hovering || Math.abs(cx) > 0.01 || Math.abs(cy) > 0.01) raf = requestAnimationFrame(tick);
      else raf = 0;
    }
    p.addEventListener('pointerenter', () => { hovering = true; if(!raf) raf = requestAnimationFrame(tick); });
    p.addEventListener('pointermove', e => {
      if(glassSterile() || p.classList.contains('panel-focused')) return;
      const r = p.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      tx = nx * 2 * MAX; ty = -ny * 2 * MAX;
      p.style.setProperty('--mx', ((nx + 0.5) * 100).toFixed(1) + '%');
      p.style.setProperty('--my', ((ny + 0.5) * 100).toFixed(1) + '%');
    });
    p.addEventListener('pointerleave', () => { hovering = false; tx = 0; ty = 0; });
  });
}

/* ── sketch trails v2 — more ink, pointer attraction, full frame rate ── */
function glassInitTrails(){
  const cv = document.createElement('canvas');
  cv.id = 'glass-trails';
  document.body.appendChild(cv);
  const ctx = cv.getContext('2d');

  const mobile = window.matchMedia('(pointer:coarse)').matches;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const N = mobile ? 9 : 15;
  let W = 0, H = 0, walkers = [], raf = 0, t = 0;
  let px = -1e4, py = -1e4;            // pointer (attracts the ink)

  function brass(){
    return getComputedStyle(document.documentElement).getPropertyValue('--brass').trim() || '#A88455';
  }
  let stroke = brass();

  function resize(){
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    seed(); prewarm(520);
  }
  function seed(){
    walkers = Array.from({ length: N }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      h: Math.random() * Math.PI * 2,
      s: 0.55 + Math.random() * 0.75,
      w: 0.6 + Math.random() * 0.8,
      f1: 0.003 + Math.random() * 0.004, p1: Math.random() * 7,
      f2: 0.011 + Math.random() * 0.006, p2: Math.random() * 7,
    }));
  }
  function step(){
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.0045)';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = stroke;
    ctx.globalAlpha = 0.09;
    for(const w of walkers){
      w.h += 0.045 * Math.sin(t * w.f1 + w.p1) + 0.028 * Math.sin(t * w.f2 + w.p2)
           + (Math.random() - 0.5) * 0.05;
      // ink leans toward the pointer (nirnor trails feel the cursor)
      const dx = px - w.x, dy = py - w.y, d2 = dx * dx + dy * dy;
      if(d2 < 90000){
        const target = Math.atan2(dy, dx);
        let diff = target - w.h;
        while(diff > Math.PI) diff -= Math.PI * 2;
        while(diff < -Math.PI) diff += Math.PI * 2;
        w.h += diff * 0.035 * (1 - d2 / 90000);
      }
      const nx = w.x + Math.cos(w.h) * w.s;
      const ny = w.y + Math.sin(w.h) * w.s;
      if(nx < -8 || nx > W + 8 || ny < -8 || ny > H + 8 || Math.random() < 0.0006){
        w.x = Math.random() * W; w.y = Math.random() * H;
        w.h = Math.random() * Math.PI * 2;
        continue;
      }
      ctx.lineWidth = w.w;
      ctx.beginPath();
      ctx.moveTo(w.x, w.y); ctx.lineTo(nx, ny);
      ctx.stroke();
      w.x = nx; w.y = ny;
    }
    ctx.globalAlpha = 1;
    t++;
  }
  function prewarm(n){ for(let i = 0; i < n; i++) step(); }
  function loop(){ raf = requestAnimationFrame(loop); step(); }
  function start(){ if(!raf) raf = requestAnimationFrame(loop); }
  function stop(){ if(raf){ cancelAnimationFrame(raf); raf = 0; } }

  window.addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; }, { passive:true });
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  window.addEventListener('resize', () => { stroke = brass(); resize(); });
  if(window.matchMedia){
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { stroke = brass(); });
  }
  resize();
  start();
}

/* called from app.js init() after the first renderAll — once per page load */
function initGlass(){
  if(glassSterile() || glassReducedMotion()) return;
  glassInitLenis();
  glassInitFlip();       // restructure the trading panel before measuring
  glassInitFinanceHUD();
  glassInitFitnessHUD();
  glassInitStacking();   // wrap sections first — triggers measure final layout
  glassInitScrollFX();
  glassInitFocus();
  glassInitTilt();
  glassInitTrails();
}
