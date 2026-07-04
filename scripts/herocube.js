/* v7.0 — 五柱黄铜立方 (hero pillar cube), the nirnor-style floating object.
   A real Three.js cube: six canvas-textured faces — the five pillars' Roman
   numerals (Ⅰ睡眠 Ⅱ冥想 Ⅲ AI Automation Ⅳ健身 Ⅴ性能量) plus the ◆ sigil — slowly
   tumbling in fixed space behind the glass. Scroll velocity spins it harder
   (Lenis animates native scroll, so window.scrollY is already damped);
   the pointer pulls its orientation gently. ES module (importmap: three). */
import * as THREE from 'three';

(function(){
  // renders only where the 'cube' capability is set (cappa) — was the
  // ['sterile','terminal','monarch'] theme-name blacklist.
  const noCube = !document.documentElement.matches('[data-fx~="cube"]');
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(noCube || reduced) return;

  const host = document.createElement('div');
  host.id = 'herocube';
  document.body.appendChild(host);

  const brass = (getComputedStyle(document.documentElement).getPropertyValue('--brass').trim()) || '#C9A876';
  const soft  = (getComputedStyle(document.documentElement).getPropertyValue('--brass-soft').trim()) || '#D9BE92';

  function faceTexture(glyph){
    const S = 512, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const c = cv.getContext('2d');
    c.fillStyle = 'rgba(18,16,12,0.92)';
    c.fillRect(0, 0, S, S);
    // double brass frame
    c.strokeStyle = brass; c.lineWidth = 3;
    c.strokeRect(18, 18, S - 36, S - 36);
    c.strokeStyle = 'rgba(201,168,118,0.35)'; c.lineWidth = 1;
    c.strokeRect(34, 34, S - 68, S - 68);
    // HUD corner ticks
    c.strokeStyle = soft; c.lineWidth = 4;
    const T = 30, M = 8;
    [[M,M,1,1],[S-M,M,-1,1],[M,S-M,1,-1],[S-M,S-M,-1,-1]].forEach(([x,y,sx,sy])=>{
      c.beginPath(); c.moveTo(x + sx*T, y); c.lineTo(x, y); c.lineTo(x, y + sy*T); c.stroke();
    });
    // glyph — serif brass with glow
    c.font = '600 210px Georgia, "Cormorant Garamond", serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = brass; c.shadowBlur = 46;
    c.fillStyle = soft;
    c.fillText(glyph, S/2, S/2 + 8);
    c.shadowBlur = 0;
    const tx = new THREE.CanvasTexture(cv);
    tx.anisotropy = 4;
    return tx;
  }

  const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 20);
  camera.position.z = 3.6;

  const glyphs = ['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','◆'];
  const mats = glyphs.map(g => new THREE.MeshBasicMaterial({ map: faceTexture(g), transparent: true }));
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.55, 1.55), mats);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(cube.geometry),
    new THREE.LineBasicMaterial({ color: new THREE.Color(brass), transparent: true, opacity: 0.9 })
  );
  const group = new THREE.Group();
  group.add(cube); group.add(edges);
  scene.add(group);

  function size(){
    const s = host.clientWidth || 280;
    renderer.setSize(s, s);
  }
  size();
  host.appendChild(renderer.domElement);

  let t = 0, raf = 0;
  let lastY = window.scrollY, spin = 0;
  let ptx = 0, pty = 0;          // pointer-pulled orientation target

  window.addEventListener('pointermove', e => {
    ptx = (e.clientX / innerWidth  - 0.5) * 0.55;
    pty = (e.clientY / innerHeight - 0.5) * 0.45;
  }, { passive:true });

  function frame(){
    raf = requestAnimationFrame(frame);
    // stop rendering WebGL once the theme no longer has the 'cube' capability
    if(!document.documentElement.matches('[data-fx~="cube"]')) return;
    t += 0.016;
    // scroll velocity feeds the tumble (Lenis-damped native scroll)
    const y = window.scrollY;
    spin += (y - lastY) * 0.00045;
    lastY = y;
    spin *= 0.94;
    group.rotation.x += 0.0042 + spin * 0.6;
    group.rotation.y += 0.0058 + spin;
    // pointer pulls it through space (tumble itself stays free)
    group.position.x += ((ptx * 0.5) - group.position.x) * 0.05;
    group.position.y  = Math.sin(t * 0.8) * 0.08 - pty * 0.3;
    renderer.render(scene, camera);
  }
  function start(){ if(!raf) raf = requestAnimationFrame(frame); }
  function stop(){ if(raf){ cancelAnimationFrame(raf); raf = 0; } }

  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  window.addEventListener('resize', size);

  // GL context recovery — a dropped context otherwise freezes the cube permanently
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); stop(); });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    mats.forEach((m, i) => { m.map = faceTexture(glyphs[i]); m.needsUpdate = true; });
    start();
  });

  start();
})();
