// ============================================================================
// CYRUS://NEXT — COMMAND DECK · scene.js
// The Three.js tactical deck. Hidden-line rendering: every wireframe structure
// (90-pillar array + 6 stations) is backed by a bg-coloured SOLID OCCLUDER that
// writes depth, so interior/back lines are culled by the depth buffer — no more
// "see-through" cages. Occluders are merged (pillars → 1 mesh, 1 per station)
// and use polygonOffset to keep coincident silhouette lines visible.
// Single WebGL context. Visibility-pause + context-loss recovery in main.js.
// ============================================================================
import * as THREE from 'three';

const gsap = window.gsap;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

// bg / fog colour — occluders paint this so they read as "solid, unlit" ---------
const BG = 0x0a0b06;
const BG_V = [0x0a / 255, 0x0b / 255, 0x06 / 255];

// -- station ring layout (angles chosen so none sits dead-center front) -------
const STATION_ANGLE = { MORNING: -90, ACADEMICS: -30, 'JP-N2': 30, TRADING: 90, TODOS: 150, SYSTEM: -150 };
const RING = 13.2;

// ---------------------------------------------------------------------------
// merge an array of primitive parts into ONE line-segment geometry
//   part = { geo, pos?:[x,y,z], rot?:[x,y,z], scl?:number|[x,y,z], thr?:deg }
// ---------------------------------------------------------------------------
function mergeEdges(parts) {
  const out = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
  for (const p of parts) {
    const eg = new THREE.EdgesGeometry(p.geo, p.thr ?? 1);
    e.set((p.rot?.[0] || 0), (p.rot?.[1] || 0), (p.rot?.[2] || 0));
    q.setFromEuler(e);
    const s = Array.isArray(p.scl) ? new THREE.Vector3(...p.scl)
      : new THREE.Vector3(p.scl ?? 1, p.scl ?? 1, p.scl ?? 1);
    m.compose(new THREE.Vector3(...(p.pos || [0, 0, 0])), q, s);
    const pos = eg.attributes.position;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m); out.push(v.x, v.y, v.z); }
    eg.dispose(); p.geo.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return g;
}

// merge an array of solid parts into ONE triangle geometry (occluder volume) ----
function mergeSolid(parts) {
  const out = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3();
  for (const p of parts) {
    const geo = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    e.set((p.rot?.[0] || 0), (p.rot?.[1] || 0), (p.rot?.[2] || 0));
    q.setFromEuler(e);
    const s = Array.isArray(p.scl) ? new THREE.Vector3(...p.scl)
      : new THREE.Vector3(p.scl ?? 1, p.scl ?? 1, p.scl ?? 1);
    m.compose(new THREE.Vector3(...(p.pos || [0, 0, 0])), q, s);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m); out.push(v.x, v.y, v.z); }
    if (geo !== p.geo) geo.dispose();
    p.geo.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return g;
}

// bg-coloured occluder material: writes depth, unlit, faces pushed back so that
// coincident silhouette lines survive. DoubleSide → winding-proof (no holes).
function occluderMaterial() {
  return new THREE.MeshBasicMaterial({
    color: BG, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
}

// triangular gable-roof prism — ONE solid, no crossing faces. Extruded along X.
// Per-quad triangle winding is kept consistent so EdgesGeometry drops the
// coplanar diagonals and yields a clean gable outline.
function prismGeo(len, halfZ, baseY, apexY) {
  const hx = len / 2;
  const A = [-hx, baseY, -halfZ], B = [-hx, baseY, halfZ], C = [-hx, apexY, 0];
  const D = [hx, baseY, -halfZ], E = [hx, baseY, halfZ], F = [hx, apexY, 0];
  const t = (...pts) => pts.flat();
  const v = [
    ...t(A, B, E), ...t(A, E, D),   // bottom quad
    ...t(A, D, F), ...t(A, F, C),   // -Z slope quad
    ...t(B, C, F), ...t(B, F, E),   // +Z slope quad
    ...t(A, C, B),                  // left cap
    ...t(D, E, F),                  // right cap
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}

// per-station silhouettes. Returns { wire:[parts], solid:[parts], labelY, pickR }
// wire → merged LineSegments; solid → merged occluder volume (main masses only,
// thin accents like rings/wicks are left un-occluded on purpose).
function stationParts(id) {
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  switch (id) {
    case 'MORNING': // 日冕环 — upright corona rings + radiant core
      return {
        wire: [
          { geo: new THREE.TorusGeometry(1.45, 0.05, 4, 30), pos: [0, 1.7, 0] },
          { geo: new THREE.TorusGeometry(1.9, 0.03, 4, 6), pos: [0, 1.7, 0] },
          { geo: new THREE.IcosahedronGeometry(0.45, 0), pos: [0, 1.7, 0] },
        ],
        solid: [{ geo: new THREE.IcosahedronGeometry(0.45, 0), pos: [0, 1.7, 0] }],
        labelY: 3.7, pickR: 2.1,
      };
    case 'ACADEMICS': // 书碑 — single gable-prism cover on a plinth (no crossing slabs)
      return {
        wire: [
          { geo: prismGeo(1.7, 0.55, 1.0, 1.7) },
          { geo: B(1.7, 1.0, 0.6), pos: [0, 0.5, 0] },
        ],
        solid: [
          { geo: prismGeo(1.7, 0.55, 1.0, 1.7) },
          { geo: B(1.7, 1.0, 0.6), pos: [0, 0.5, 0] },
        ],
        labelY: 3.0, pickR: 1.9,
      };
    case 'JP-N2': // 鸟居 — torii frame
      return {
        wire: [
          { geo: B(0.14, 2.5, 0.14), pos: [-1.0, 1.25, 0] },
          { geo: B(0.14, 2.5, 0.14), pos: [1.0, 1.25, 0] },
          { geo: B(2.7, 0.2, 0.2), pos: [0, 2.55, 0] },
          { geo: B(2.2, 0.12, 0.16), pos: [0, 1.95, 0] },
        ],
        solid: [
          { geo: B(0.14, 2.5, 0.14), pos: [-1.0, 1.25, 0] },
          { geo: B(0.14, 2.5, 0.14), pos: [1.0, 1.25, 0] },
          { geo: B(2.7, 0.2, 0.2), pos: [0, 2.55, 0] },
          { geo: B(2.2, 0.12, 0.16), pos: [0, 1.95, 0] },
        ],
        labelY: 3.5, pickR: 2.0,
      };
    case 'TRADING': { // K线碑 — real candlestick anatomy: solid bodies + wicks only above/below
      // {x, bLo, bHi, wLo, wHi} — staggered up/down bodies, believable OHLC
      const C = [
        { x: -1.0, bLo: 0.6, bHi: 1.6, wLo: 0.3, wHi: 1.9 },
        { x: -0.5, bLo: 1.6, bHi: 2.4, wLo: 1.3, wHi: 2.8 },
        { x: 0.0, bLo: 1.4, bHi: 2.0, wLo: 1.0, wHi: 2.3 },
        { x: 0.5, bLo: 2.0, bHi: 3.0, wLo: 1.7, wHi: 3.3 },
        { x: 1.0, bLo: 1.5, bHi: 2.2, wLo: 1.2, wHi: 2.6 },
      ];
      const wire = [], solid = [];
      for (const c of C) {
        const bh = c.bHi - c.bLo, by = (c.bHi + c.bLo) / 2;
        wire.push({ geo: B(0.32, bh, 0.32), pos: [c.x, by, 0] });                       // body
        wire.push({ geo: B(0.05, c.wHi - c.bHi, 0.05), pos: [c.x, (c.wHi + c.bHi) / 2, 0] }); // upper wick
        wire.push({ geo: B(0.05, c.bLo - c.wLo, 0.05), pos: [c.x, (c.bLo + c.wLo) / 2, 0] }); // lower wick
        solid.push({ geo: B(0.32, bh, 0.32), pos: [c.x, by, 0] });                      // occlude bodies only
      }
      return { wire, solid, labelY: 3.9, pickR: 1.9 };
    }
    case 'TODOS': // 堆叠块 — offset stacked slabs
      return {
        wire: [
          { geo: B(1.6, 0.4, 1.6), pos: [0, 0.25, 0] },
          { geo: B(1.3, 0.4, 1.3), pos: [0.25, 0.75, -0.1], rot: [0, 12 * DEG, 0] },
          { geo: B(1.0, 0.4, 1.0), pos: [-0.15, 1.2, 0.2], rot: [0, -10 * DEG, 0] },
          { geo: B(0.7, 0.4, 0.7), pos: [0.1, 1.6, 0], rot: [0, 20 * DEG, 0] },
        ],
        solid: [
          { geo: B(1.6, 0.4, 1.6), pos: [0, 0.25, 0] },
          { geo: B(1.3, 0.4, 1.3), pos: [0.25, 0.75, -0.1], rot: [0, 12 * DEG, 0] },
          { geo: B(1.0, 0.4, 1.0), pos: [-0.15, 1.2, 0.2], rot: [0, -10 * DEG, 0] },
          { geo: B(0.7, 0.4, 0.7), pos: [0.1, 1.6, 0], rot: [0, 20 * DEG, 0] },
        ],
        labelY: 2.6, pickR: 1.7,
      };
    case 'SYSTEM': // 核心 — occluded icosahedron core + thin gyro rings (spins)
    default:
      return {
        wire: [
          { geo: new THREE.IcosahedronGeometry(1.35, 0), pos: [0, 1.6, 0] },
          { geo: new THREE.TorusGeometry(1.7, 0.02, 4, 28), pos: [0, 1.6, 0], rot: [24 * DEG, 0, 0] },
          { geo: new THREE.TorusGeometry(1.7, 0.02, 4, 28), pos: [0, 1.6, 0], rot: [90 * DEG, 0, 32 * DEG] },
        ],
        solid: [{ geo: new THREE.IcosahedronGeometry(1.32, 0), pos: [0, 1.6, 0] }],
        labelY: 3.4, pickR: 2.0, spin: true,
      };
  }
}

// ---------------------------------------------------------------------------
export function createScene(canvas, opts) {
  const { mock, reducedMotion, isMobile, labelsEl, onHover, onPillarHover } = opts;
  const W0 = () => window.innerWidth, H0 = () => window.innerHeight;
  const enablePillarHover = !isMobile;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W0(), H0());
  renderer.setClearColor(BG, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 26, 66);

  const camera = new THREE.PerspectiveCamera(42, W0() / H0(), 0.1, 200);
  const target = new THREE.Vector3(0, 1.6, 0);

  // -- camera state (spherical orbit around target) ---------------------------
  const cam = {
    baseTheta: -90 * DEG, basePhi: 58 * DEG, baseRadius: 30,
    dragYaw: 0, dragPitch: 0, dragYawT: 0, dragPitchT: 0,      // ±15° inertial offsets
    scroll: 0, mode: reducedMotion ? 'static' : 'deck',
  };
  const focus = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0 };

  // ===== The 90 pillar array — merged LineSegments + merged occluder ==========
  const pillars = buildPillars(mock);
  scene.add(pillars.occ);   // occluder first (opaque pass writes depth)
  scene.add(pillars.mesh);

  // pillar pick proxy (invisible instanced boxes) — one draw, raycast → day index
  const pillarPick = enablePillarHover ? buildPillarPick(mock) : null;
  if (pillarPick) scene.add(pillarPick);

  // today beacon — thin cyan light rising above today's pillar (breathes) ------
  const beacon = buildBeacon(mock, pillars.topY);
  scene.add(beacon.line);

  // ===== grid floor ==========================================================
  const grid = buildGrid();
  scene.add(grid);

  // ===== 6 stations ==========================================================
  const occMat = occluderMaterial();
  const stations = [];   // {id, group, mat, line, occ, anchor, def, spin}
  const pickMeshes = [];
  for (const def of mock.stations) {
    const s = stationParts(def.id);
    const line = new THREE.LineSegments(mergeEdges(s.wire),
      new THREE.LineBasicMaterial({ color: 0x6d6a1c, transparent: true, opacity: reducedMotion ? 0.9 : 0 }));
    const group = new THREE.Group();
    // occluder (opaque, bg-coloured) added first so it renders before the lines
    let occ = null;
    if (s.solid && s.solid.length) { occ = new THREE.Mesh(mergeSolid(s.solid), occMat); group.add(occ); }
    group.add(line);
    const a = STATION_ANGLE[def.id] * DEG;
    group.position.set(Math.cos(a) * RING, 0, Math.sin(a) * RING);
    const pick = new THREE.Mesh(new THREE.SphereGeometry(s.pickR, 8, 6),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    pick.position.y = s.labelY * 0.5;
    pick.userData.id = def.id;
    group.add(pick); pickMeshes.push(pick);
    const anchor = new THREE.Object3D(); anchor.position.y = s.labelY; group.add(anchor);
    scene.add(group);
    stations.push({ id: def.id, group, mat: line.material, line, occ, anchor, def, spin: !!s.spin, emph: 0, emphT: 0 });
  }

  // ===== projected DOM labels: stations ======================================
  const labels = stations.map(st => {
    const el = document.createElement('div');
    el.className = 'lbl';
    el.innerHTML = `<div class="lbl-name">${st.def.label}</div><div class="lbl-stat">${st.def.tag || ''}</div>`;
    labelsEl.appendChild(el);
    return { st, el };
  });

  // ===== projected DOM labels: array readability suite =======================
  const extra = [];   // { anchor:Vector3, el, off }
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const fmtMon = (iso) => { const [, m, d] = iso.split('-'); return `${MON[+m - 1]} ${d}`; };
  // (a) nameplate — floats above the array, front edge
  {
    const el = document.createElement('div');
    el.className = 'np';
    el.innerHTML = `<div class="np-main">THE 90</div>
      <div class="np-sub">DAY ${mock.todayIndex + 1} / 90 · 30D AVG <b>${mock.avg30}%</b></div>`;
    labelsEl.appendChild(el);
    extra.push({ anchor: new THREE.Vector3(0, 6.3, -pillars.frontZ - 1.2), el, off: 'translate(-50%,-100%)' });
  }
  // (b) today beacon nameplate — at the top of the cyan light
  {
    const el = document.createElement('div');
    el.className = 'beacon-lbl';
    el.innerHTML = `<span class="bc-dot"></span>TODAY · ${fmtMon(mock.the90[mock.todayIndex].date)}`;
    labelsEl.appendChild(el);
    extra.push({ anchor: new THREE.Vector3(beacon.x, beacon.topY, beacon.z), el, off: 'translate(-50%,-150%)' });
  }
  // (d) ground ticks — every 10 days along the left edge (small, dim, mono)
  for (const tk of pillars.ticks) {
    const el = document.createElement('div');
    el.className = 'tick';
    el.textContent = tk.label;
    labelsEl.appendChild(el);
    extra.push({ anchor: new THREE.Vector3(tk.x, 0.05, tk.z), el, off: 'translate(-50%,-50%)' });
  }

  // ===== raycaster / hover ===================================================
  const ray = new THREE.Raycaster();
  ray.params.Line = { threshold: 0.2 };
  const ndc = new THREE.Vector2(-2, -2);
  let hovered = null, pillarHovered = null;

  function pick() {
    if (cam.mode === 'focus') return;
    ray.setFromCamera(ndc, camera);
    const sHit = ray.intersectObjects(pickMeshes, false)[0];
    const sid = sHit ? sHit.object.userData.id : null;
    if (sid !== hovered) { hovered = sid; onHover && onHover(sid); }
    if (!enablePillarHover) return;
    let info = null;
    if (!sid) {
      const pHit = ray.intersectObject(pillarPick, false)[0];
      if (pHit && pHit.instanceId != null) {
        const i = pHit.instanceId, d = mock.the90[i];
        info = { i, date: d.date, score: d.score };
      }
    }
    const key = info ? info.i : null;
    if (key !== pillarHovered) { pillarHovered = key; onPillarHover && onPillarHover(info); }
  }

  // ===== camera resolve ======================================================
  const _p = new THREE.Vector3();
  function deckCamPos(out, extraTheta = 0) {
    const theta = cam.baseTheta + cam.scroll * (150 * DEG) + cam.dragYaw + extraTheta;
    const phi = clamp(cam.basePhi + cam.dragPitch, 20 * DEG, 78 * DEG);
    const r = cam.baseRadius - cam.scroll * 8;
    out.set(
      target.x + r * Math.sin(phi) * Math.cos(theta),
      target.y + r * Math.cos(phi),
      target.z + r * Math.sin(phi) * Math.sin(theta),
    );
    return out;
  }

  // ===== focus / return ======================================================
  function focusStation(id) {
    const st = stations.find(s => s.id === id); if (!st) return;
    focus.px = camera.position.x; focus.py = camera.position.y; focus.pz = camera.position.z;
    focus.tx = target.x; focus.ty = target.y; focus.tz = target.z;
    cam.mode = 'focus';
    const sp = st.group.position;
    const outward = new THREE.Vector3(sp.x, 0, sp.z).normalize();
    const dest = {
      px: sp.x + outward.x * 5.2, py: 4.6, pz: sp.z + outward.z * 5.2,
      tx: sp.x, ty: 1.5, tz: sp.z,
    };
    if (reducedMotion || !gsap) { Object.assign(focus, dest); opts.onFocusDone && opts.onFocusDone(id); return; }
    gsap.to(focus, { ...dest, duration: 0.8, ease: 'expo.out', onComplete: () => opts.onFocusDone && opts.onFocusDone(id) });
  }
  function returnDeck() {
    const dest = deckCamPos(new THREE.Vector3());
    if (reducedMotion || !gsap) { cam.mode = 'deck'; opts.onReturnDone && opts.onReturnDone(); return; }
    gsap.to(focus, {
      px: dest.x, py: dest.y, pz: dest.z, tx: target.x, ty: target.y, tz: target.z,
      duration: 0.7, ease: 'expo.inOut',
      onComplete: () => { cam.mode = 'deck'; opts.onReturnDone && opts.onReturnDone(); },
    });
  }

  // ===== per-frame ===========================================================
  const clock = new THREE.Clock();
  function frame() {
    const dt = clock.getDelta(), t = clock.elapsedTime;
    cam.dragYaw = lerp(cam.dragYaw, cam.dragYawT, 1 - Math.pow(0.001, dt));
    cam.dragPitch = lerp(cam.dragPitch, cam.dragPitchT, 1 - Math.pow(0.001, dt));

    if (cam.mode === 'focus') {
      camera.position.set(focus.px, focus.py, focus.pz);
      camera.lookAt(focus.tx, focus.ty, focus.tz);
    } else {
      deckCamPos(_p); camera.position.copy(_p);
      camera.lookAt(target.x + cam.dragYaw * 1.2, target.y, target.z);
    }

    pillars.mat.uniforms.uTime.value = t;
    const breathe = 0.5 + 0.5 * Math.sin(t * 2.2);
    beacon.line.material.opacity = pillars.mat.uniforms.uReveal.value * (0.35 + 0.5 * breathe);
    for (const st of stations) {
      if (st.spin) { st.line.rotation.y += dt * 0.35; if (st.occ) st.occ.rotation.y = st.line.rotation.y; }
      st.emph = lerp(st.emph, st.emphT, 1 - Math.pow(0.0001, dt));
      st.mat.color.setRGB(0.42 + st.emph * 0.55, 0.42 + st.emph * 0.55, 0.09 + st.emph * 0.02);
      st.mat.opacity = 0.55 + st.emph * 0.4;
    }
    pick();
    updateLabels();
    renderer.render(scene, camera);
  }

  // ===== label projection ====================================================
  const _v = new THREE.Vector3();
  function updateLabels() {
    const w = W0(), h = H0(), focused = cam.mode === 'focus';
    for (const { st, el } of labels) {
      st.anchor.getWorldPosition(_v); _v.project(camera);
      if (_v.z > 1 || focused) { el.style.opacity = '0'; continue; }
      const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-140%)`;
      const dist = camera.position.distanceTo(st.group.position);
      el.style.opacity = '1';
      el.classList.toggle('is-hot', hovered === st.id);
      el.classList.toggle('is-dim', dist > 34);
    }
    for (const e of extra) {
      _v.copy(e.anchor).project(camera);
      if (_v.z > 1 || focused) { e.el.style.opacity = '0'; continue; }
      const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
      e.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) ${e.off}`;
      e.el.style.opacity = '1';
    }
  }

  // ===== loop control ========================================================
  let raf = 0, running = false;
  function loop() { frame(); if (running) raf = requestAnimationFrame(loop); }
  function start() { if (running) return; running = true; clock.getDelta(); raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  function renderOnce() { frame(); }

  // ===== reveal (grid scan-in → pillars+occluders rise → stations fade) ======
  // Occluders share the pillars' uReveal uniform, so the solid mass rises in
  // exact lockstep with the wireframe — no per-frame matrix sync, no popping.
  function reveal() {
    if (reducedMotion || !gsap) { pillars.mat.uniforms.uReveal.value = 1; grid.material.opacity = 0.5; renderOnce(); return; }
    grid.material.opacity = 0;
    gsap.timeline()
      .to(grid.material, { opacity: 0.5, duration: 0.7, ease: 'power2.out' })
      .to(pillars.mat.uniforms.uReveal, { value: 1, duration: 1.1, ease: 'power2.out' }, 0.15)
      .to(stations.map(s => s.mat), { opacity: 0.6, duration: 0.6, ease: 'power1.out' }, 0.5);
  }

  // ===== public setters ======================================================
  function setScroll(p) { cam.scroll = clamp(p, 0, 1); }
  function applyDrag(dx, dy) {
    cam.dragYawT = clamp(cam.dragYawT - dx * 0.0022, -15 * DEG, 15 * DEG);
    cam.dragPitchT = clamp(cam.dragPitchT - dy * 0.0018, -15 * DEG, 15 * DEG);
  }
  function setPointer(x, y) { ndc.set((x / W0()) * 2 - 1, -(y / H0()) * 2 + 1); }
  function highlight(id) { for (const st of stations) st.emphT = st.id === id ? 1 : 0; }
  function resize() {
    camera.aspect = W0() / H0(); camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W0(), H0());
    if (!running) renderOnce();
  }
  function dispose() {
    stop();
    pillars.mesh.geometry.dispose(); pillars.mat.dispose();
    pillars.occ.geometry.dispose(); pillars.occ.material.dispose();
    if (pillarPick) { pillarPick.geometry.dispose(); pillarPick.material.dispose(); }
    beacon.line.geometry.dispose(); beacon.line.material.dispose();
    grid.geometry.dispose(); grid.material.dispose();
    for (const st of stations) { st.line.geometry.dispose(); st.mat.dispose(); if (st.occ) st.occ.geometry.dispose(); }
    occMat.dispose();
    renderer.dispose();
  }

  return {
    start, stop, renderOnce, reveal, resize, dispose,
    setScroll, applyDrag, setPointer, highlight, focusStation, returnDeck,
    get mode() { return cam.mode; }, get hovered() { return hovered; },
    labelFor: id => (labels.find(l => l.st.id === id) || {}).el,
  };
}

// ============================================================================
// pillar builder — wireframe (custom shader) + a merged occluder that shares the
// SAME uReveal uniform (one draw call each). Also derives beacon + tick anchors.
// ============================================================================
function buildPillars(mock) {
  const days = mock.the90, N = days.length;
  const cols = 10, rows = 9, sp = 1.55, hw = 0.22;
  const line = [], sc = [], ord = [], tod = [];      // wireframe
  const solid = [], sord = [];                       // occluder
  let maxD = 0.0001;
  const gx = i => ((i % cols) - (cols - 1) / 2) * sp;
  const gz = i => (Math.floor(i / cols) - (rows - 1) / 2) * sp;
  const hOf = s => 0.4 + s * 5.4;
  for (let i = 0; i < N; i++) maxD = Math.max(maxD, Math.hypot(gx(i), gz(i)));

  // occluder box faces (12 tris) by corner index
  const FACES = [[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];

  for (let i = 0; i < N; i++) {
    const d = days[i], score = d.score, h = hOf(score);
    const x = gx(i), z = gz(i), order = Math.hypot(x, z) / maxD;
    const isToday = i === mock.todayIndex ? 1 : 0;
    const c = [
      [x - hw, 0, z - hw], [x + hw, 0, z - hw], [x + hw, 0, z + hw], [x - hw, 0, z + hw],
      [x - hw, h, z - hw], [x + hw, h, z - hw], [x + hw, h, z + hw], [x - hw, h, z + hw],
    ];
    const edges = [[0,1],[1,2],[2,3],[3,0], [4,5],[5,6],[6,7],[7,4], [0,4],[1,5],[2,6],[3,7]];
    for (const [a, b] of edges) for (const k of [a, b]) {
      line.push(c[k][0], c[k][1], c[k][2]); sc.push(score); ord.push(order); tod.push(isToday);
    }
    for (const f of FACES) for (const k of f) { solid.push(c[k][0], c[k][1], c[k][2]); sord.push(order); }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
  g.setAttribute('aScore', new THREE.Float32BufferAttribute(sc, 1));
  g.setAttribute('aOrder', new THREE.Float32BufferAttribute(ord, 1));
  g.setAttribute('aToday', new THREE.Float32BufferAttribute(tod, 1));

  const uReveal = { value: 0 }, uTime = { value: 0 };
  const REVEAL = /* glsl */`
    float reveal(float ord){ return smoothstep(0.0,1.0, clamp((uReveal - ord*0.55)/0.45, 0.0,1.0)); }`;

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uReveal, uTime },
    vertexShader: /* glsl */`
      attribute float aScore; attribute float aOrder; attribute float aToday;
      uniform float uReveal;
      varying float vScore; varying float vToday;
      ${REVEAL}
      void main(){
        vec3 p = position; p.y *= reveal(aOrder);
        vScore = aScore; vToday = aToday;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      }`,
    fragmentShader: /* glsl */`
      precision mediump float;
      uniform float uTime;
      varying float vScore; varying float vToday;
      void main(){
        vec3 dim = vec3(0.12,0.13,0.08);
        vec3 hot = vec3(0.82,0.80,0.06);
        vec3 col = mix(dim, hot, vScore*vScore*0.55 + vScore*0.45);
        float breathe = 0.5 + 0.5*sin(uTime*2.2);
        col += vToday * (0.2 + 0.6*breathe) * vec3(0.95,0.92,0.35);
        float a = 0.32 + 0.55*vScore + vToday*0.4*breathe;
        gl_FragColor = vec4(col, clamp(a,0.0,1.0));
      }`,
  });

  // merged occluder — same reveal displacement, bg colour, writes depth
  const og = new THREE.BufferGeometry();
  og.setAttribute('position', new THREE.Float32BufferAttribute(solid, 3));
  og.setAttribute('aOrder', new THREE.Float32BufferAttribute(sord, 1));
  const oMat = new THREE.ShaderMaterial({
    uniforms: { uReveal },            // shared reference → rises in lockstep
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute float aOrder; uniform float uReveal;
      ${REVEAL}
      void main(){ vec3 p = position; p.y *= reveal(aOrder);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
    fragmentShader: /* glsl */`
      precision mediump float;
      void main(){ gl_FragColor = vec4(${BG_V[0].toFixed(4)},${BG_V[1].toFixed(4)},${BG_V[2].toFixed(4)},1.0); }`,
  });
  const occ = new THREE.Mesh(og, oMat);
  occ.renderOrder = -1;   // belt-and-braces: paint before the transparent wireframe

  // derived anchors for the readability suite
  const frontZ = (rows - 1) / 2 * sp;                       // |z| of the front/back edge
  const leftX = -((cols - 1) / 2 * sp) - 1.1;               // just left of the array
  const ticks = [];
  for (let r = 0; r < rows; r++) ticks.push({ label: `D${(r + 1) * 10}`, x: leftX, z: (r - (rows - 1) / 2) * sp });

  return {
    mesh: new THREE.LineSegments(g, mat), mat, occ, frontZ,
    topY: i => hOf(days[i].score), xOf: gx, zOf: gz, ticks,
  };
}

// invisible instanced boxes for pillar picking (one draw, no colour/depth write)
function buildPillarPick(mock) {
  const days = mock.the90, N = days.length;
  const cols = 10, rows = 9, sp = 1.55, hw = 0.22;
  const gx = i => ((i % cols) - (cols - 1) / 2) * sp;
  const gz = i => (Math.floor(i / cols) - (rows - 1) / 2) * sp;
  const geo = new THREE.BoxGeometry(hw * 2, 1, hw * 2);
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const m = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const h = 0.4 + days[i].score * 5.4;
    m.makeScale(1, h, 1); m.setPosition(gx(i), h / 2, gz(i));
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

// today beacon — a thin cyan vertical light rising above today's pillar --------
function buildBeacon(mock, topY) {
  const cols = 10, rows = 9, sp = 1.55;
  const i = mock.todayIndex;
  const x = ((i % cols) - (cols - 1) / 2) * sp;
  const z = (Math.floor(i / cols) - (rows - 1) / 2) * sp;
  const base = topY(i) + 0.15, top = Math.max(base + 1.6, 6.6);   // always pokes above the crowd
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x, base, z, x, top, z], 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x38d9d0, transparent: true, opacity: 0 });
  return { line: new THREE.LineSegments(g, mat), x, z, topY: top };
}

// ============================================================================
// grid floor — one LineSegments, faded in on reveal
// ============================================================================
function buildGrid() {
  const half = 26, step = 2, pos = [];
  for (let i = -half; i <= half; i += step) {
    pos.push(-half, 0, i, half, 0, i);
    pos.push(i, 0, -half, i, 0, half);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.LineBasicMaterial({ color: 0x2a4a48, transparent: true, opacity: 0 });
  return new THREE.LineSegments(g, m);
}
