/* crest.js — 君主徽记 (Monarch Crest): the ONE WebGL scene of SOVEREIGN.
   Replaces the retired herocube (git 100f66f). The App-icon violet「C」sigil
   (icons/cover-crest.png) reborn as a Three.js WIREFRAME relief — 100% procedural
   (zero textures): a beveled hexagonal outer ring (echoing the panels' 16px
   斜切), an inner「C」arc, two diamond ornaments and a scatter of orbital motes.
   It breathes and floats fixed behind the The-90 panel; level-up / rankup / 满勤
   briefly ignite it (window.crestIgnite). ES module (importmap: three).

   Inherits the herocube/lifetree discipline: single WebGL context, DPR≤2,
   rAF paused on tab-hide + when its subject panel scrolls off (IntersectionObserver),
   full webglcontextlost/restored recovery, geometry built once (never per-frame).
   Degrades on coarse-pointer / ≤768px to a static inline SVG crest (same构图) with
   CSS breathing; prefers-reduced-motion → fully static, crestIgnite is a no-op.
   Guarded by the `crest` capability flag (data-fx / SOVEREIGN_FX). */
import * as THREE from 'three';

(function(){
  'use strict';

  const el = document.documentElement;
  if(!el.matches('[data-fx~="crest"]')) return;            // capability guard

  const mm = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
  const reduced  = mm('(prefers-reduced-motion: reduce)');
  const lowPower = mm('(pointer: coarse)') || mm('(max-width: 768px)');

  // CSS-var line colours with hard fallbacks (var() may be empty pre-cascade).
  const css   = getComputedStyle(el);
  const BRASS = (css.getPropertyValue('--brass').trim())      || '#9D7BE6';
  const SOFT  = (css.getPropertyValue('--brass-soft').trim()) || '#B892FF';

  const host = document.createElement('div');
  host.id = 'crest';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);

  /* ══════════════════════════════════════════════════════════════════════
     DEGRADE PATH — static inline SVG crest (same构图 line art), no WebGL.
     Coarse pointer / small screen → SVG + CSS opacity breathing.
     prefers-reduced-motion → SVG only (breathing collapses globally), ignite no-op.
     ══════════════════════════════════════════════════════════════════════ */
  if(reduced || lowPower){
    host.innerHTML = crestSVG();
    if(!reduced) host.classList.add('crest-breathe');
    window.crestIgnite = function(){
      if(reduced) return;                                  // reduced-motion → no-op
      host.classList.add('crest-lit');
      clearTimeout(host._litT);
      host._litT = setTimeout(function(){ host.classList.remove('crest-lit'); }, 700);
    };
    return;
  }

  /* ══════════════════════════════════════════════════════════════════════
     WEBGL PATH
     ══════════════════════════════════════════════════════════════════════ */
  const REST = 0.5;                    // resting opacity (§2.4 background-ambient ≤0.5)
  const SPIN = 0.00175;                // ~60s / revolution at 60fps (2π/(60·60))
  const cBrass = new THREE.Color(BRASS), cSoft = new THREE.Color(SOFT);
  const tmp = new THREE.Color();

  let renderer, scene, camera, group, spinner;
  let mats = [];                       // [lineMat, pointMat] — recoloured on ignite
  let raf = 0, io = null, visible = true, wasLit = false;
  let t = 0, lastY = window.scrollY, spin = 0;
  let ptx = 0, pty = 0, curX = 0, curY = 0;
  let igniteStart = -1e9, igniteMax = 0;

  /* ---- geometry factories (all wireframe; built once) ---------------- */
  function hexPts(r){                  // pointy-top hexagon in the xy-plane
    const p = [];
    for(let k = 0; k < 6; k++){
      const a = Math.PI/2 + k * Math.PI/3;
      p.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    return p;
  }
  function hexLoopGeo(r){ return new THREE.BufferGeometry().setFromPoints(hexPts(r)); }
  function connectorGeo(r1, r2){       // radial spokes → beveled ring band
    const p = [], o = hexPts(r1), i = hexPts(r2);
    for(let k = 0; k < 6; k++){ p.push(o[k], i[k]); }
    return new THREE.BufferGeometry().setFromPoints(p);
  }
  function cArcGeo(r){                  // open「C」arc, gap facing +x
    const p = [], a0 = 50 * Math.PI/180, a1 = 310 * Math.PI/180, steps = 48;
    for(let s = 0; s <= steps; s++){
      const a = a0 + (a1 - a0) * s / steps;
      p.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    return new THREE.BufferGeometry().setFromPoints(p);
  }
  function diamondGeo(rOuter){         // two diamond ornaments (top + bottom)
    const p = [], seg = (a, b) => { p.push(a, b); };
    [1, -1].forEach(function(s){
      const cy = s * (rOuter + 0.14), h = 0.16, w = 0.09;
      const top = new THREE.Vector3(0, cy + s*h, 0), bot = new THREE.Vector3(0, cy - s*h, 0);
      const lf  = new THREE.Vector3(-w, cy, 0),      rt  = new THREE.Vector3(w, cy, 0);
      seg(top, lf); seg(lf, bot); seg(bot, rt); seg(rt, top);
    });
    return new THREE.BufferGeometry().setFromPoints(p);   // 8 segments
  }
  function orbitGeo(){                  // ≤12 orbital motes on an outer ring
    const p = [];
    for(let k = 0; k < 9; k++){
      const a = (k / 9) * Math.PI * 2 + 0.4;
      const r = 1.18 + (k % 3) * 0.09;
      p.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, (Math.sin(a * 3) * 0.12)));
    }
    return new THREE.BufferGeometry().setFromPoints(p);
  }

  /* ---- build / rebuild the whole scene (also the context-restore path) -- */
  function buildScene(){
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    scene  = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 20);
    camera.position.z = 4.0;

    const lineMat  = new THREE.LineBasicMaterial({ color: cBrass.clone(), transparent: true,
      opacity: REST, blending: THREE.AdditiveBlending, depthWrite: false });
    const pointMat = new THREE.PointsMaterial({ color: cBrass.clone(), size: 0.055, transparent: true,
      opacity: REST * 0.9, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    mats = [lineMat, pointMat];

    spinner = new THREE.Group();        // continuous self-spin lives here
    group   = new THREE.Group();        // pointer-tilt + bob lives here
    group.add(spinner);
    scene.add(group);

    spinner.add(new THREE.LineLoop(hexLoopGeo(1.0), lineMat));
    spinner.add(new THREE.LineLoop(hexLoopGeo(0.86), lineMat));
    spinner.add(new THREE.LineSegments(connectorGeo(1.0, 0.86), lineMat));
    spinner.add(new THREE.Line(cArcGeo(0.5), lineMat));
    spinner.add(new THREE.LineSegments(diamondGeo(1.0), lineMat));
    spinner.add(new THREE.Points(orbitGeo(), pointMat));

    size();
    host.appendChild(renderer.domElement);

    // GL context recovery — a dropped context otherwise freezes the crest forever.
    renderer.domElement.addEventListener('webglcontextlost', function(e){ e.preventDefault(); stop(); });
    renderer.domElement.addEventListener('webglcontextrestored', function(){ rebuild(); });
  }

  function rebuild(){
    stop();
    try{ if(renderer){ renderer.dispose(); if(renderer.domElement && renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); } }catch(e){}
    buildScene();
    if(visible && !document.hidden) start();
  }

  function size(){
    const s = host.clientWidth || 280;
    if(renderer){ renderer.setSize(s, s, false); camera.aspect = 1; camera.updateProjectionMatrix(); }
  }

  /* ---- animation loop ------------------------------------------------- */
  function frame(){
    raf = requestAnimationFrame(frame);
    if(!el.matches('[data-fx~="crest"]')) return;          // capability turned off → idle
    t += 0.016;

    // scroll velocity feeds the spin (Lenis-damped native scroll), then decays.
    const y = window.scrollY;
    spin += (y - lastY) * 0.0004; lastY = y; spin *= 0.92;

    // ignite envelope: linear decay to 0 within 800ms.
    const lit = igniteMax > 0 ? igniteMax * Math.max(0, 1 - (performance.now() - igniteStart) / 800) : 0;

    spinner.rotation.y += SPIN + spin * 0.5 + lit * 0.02;  // slow spin + scroll + ignite kick

    curX += (ptx - curX) * 0.05; curY += (pty - curY) * 0.05;   // pointer parallax lerp
    group.rotation.x = curY;
    group.rotation.z = curX * 0.6;
    group.position.y = Math.sin(t * 0.8) * 0.06;           // breathing bob

    // Only touch materials while igniting (plus one settle frame) — otherwise
    // resting colour/opacity stay put, no per-frame material churn.
    if(lit > 0 || wasLit){
      tmp.copy(cBrass).lerp(cSoft, lit);
      const op = REST + lit * (0.95 - REST);
      for(const m of mats){ m.color.copy(tmp); m.opacity = op * (m.isPointsMaterial ? 0.9 : 1); }
      wasLit = lit > 0;
    }
    renderer.render(scene, camera);
  }

  function start(){ if(!raf) raf = requestAnimationFrame(frame); }
  function stop(){ if(raf){ cancelAnimationFrame(raf); raf = 0; } }

  /* ---- ignite API ----------------------------------------------------- */
  window.crestIgnite = function(intensity){
    igniteStart = performance.now();
    igniteMax = Math.max(0, Math.min(1, intensity == null ? 1 : intensity));
    if(visible && !document.hidden) start();               // wake if paused so the decay plays
  };

  /* ---- lifecycle: pause when hidden or subject panel off-screen ------- */
  buildScene();

  document.addEventListener('visibilitychange', function(){
    if(document.hidden) stop(); else if(visible) start();
  });
  window.addEventListener('resize', size);

  // Pause the loop when The-90 panel (the crest's subject) scrolls fully away.
  try{
    const subject = document.getElementById('the90-panel') || host;
    io = new IntersectionObserver(function(es){
      visible = es[0].isIntersecting;
      if(visible && !document.hidden) start(); else stop();
    }, { threshold: 0.01 });
    io.observe(subject);
  }catch(e){ visible = true; }

  window.addEventListener('pointermove', function(e){
    ptx = (e.clientX / window.innerWidth  - 0.5) * 0.12;   // ~±7°
    pty = (e.clientY / window.innerHeight - 0.5) * 0.10;
  }, { passive: true });

  start();

  /* ---- static SVG crest (degrade path) -------------------------------- */
  function crestSVG(){
    // pointy-top hexagon (r=40, inner r=34), open C arc, two diamond ornaments.
    const cx = 50, cy = 50;
    const hex = (r) => {
      let d = '';
      for(let k = 0; k < 6; k++){
        const a = Math.PI/2 + k * Math.PI/3;
        const x = (cx + Math.cos(a) * r).toFixed(2);
        const y = (cy - Math.sin(a) * r).toFixed(2);
        d += (k ? 'L' : 'M') + x + ',' + y + ' ';
      }
      return d + 'Z';
    };
    let arc = '';
    for(let s = 0; s <= 40; s++){
      const a = (50 + (310 - 50) * s / 40) * Math.PI/180;
      const x = (cx + Math.cos(a) * 22).toFixed(2);
      const y = (cy - Math.sin(a) * 22).toFixed(2);
      arc += (s ? ' ' : '') + x + ',' + y;
    }
    return '<svg class="crest-svg" viewBox="0 0 100 100" fill="none" '
      + 'stroke="var(--brass,#9D7BE6)" stroke-width="1.4" stroke-linejoin="round" '
      + 'aria-hidden="true" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="' + hex(40) + '"/><path d="' + hex(34) + '" opacity="0.6"/>'
      + '<polyline points="' + arc + '"/>'
      + '<polygon points="50,3 54,10 50,17 46,10"/>'
      + '<polygon points="50,83 54,90 50,97 46,90"/>'
      + '</svg>';
  }
})();
