// ============================================================================
// CYRUS://NEXT — COMMAND DECK · scene.js
// The Three.js tactical deck: The 90 pillar array (one merged draw call via a
// custom ShaderMaterial) + 6 low-poly wireframe stations (one merged LineSegments
// each) + restrained orbit / scroll / focus camera + DOM-projected yellow labels.
// Single WebGL context. Visibility-pause + context-loss recovery in main.js.
// ============================================================================
import * as THREE from 'three';

const gsap = window.gsap;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

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

// per-station wireframe silhouettes (abstract, no textures) --------------------
function stationParts(id) {
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  switch (id) {
    case 'MORNING': // 日冕环 — upright corona ring + radiant core
      return { parts: [
        { geo: new THREE.TorusGeometry(1.45, 0.05, 4, 30), pos: [0, 1.7, 0] },
        { geo: new THREE.TorusGeometry(1.9, 0.03, 4, 6), pos: [0, 1.7, 0] },
        { geo: new THREE.IcosahedronGeometry(0.45, 0), pos: [0, 1.7, 0] },
      ], labelY: 3.7, pickR: 2.1 };
    case 'ACADEMICS': // 书碑 — open-book slab on a plinth
      return { parts: [
        { geo: B(1.7, 0.06, 1.15), pos: [-0.62, 1.5, 0], rot: [0, 0, 22 * DEG] },
        { geo: B(1.7, 0.06, 1.15), pos: [0.62, 1.5, 0], rot: [0, 0, -22 * DEG] },
        { geo: B(1.9, 0.5, 0.5), pos: [0, 0.5, 0] },
      ], labelY: 3.0, pickR: 1.9 };
    case 'JP-N2': // 鸟居 — torii frame
      return { parts: [
        { geo: B(0.14, 2.5, 0.14), pos: [-1.0, 1.25, 0] },
        { geo: B(0.14, 2.5, 0.14), pos: [1.0, 1.25, 0] },
        { geo: B(2.7, 0.2, 0.2), pos: [0, 2.55, 0] },
        { geo: B(2.2, 0.12, 0.16), pos: [0, 1.95, 0] },
      ], labelY: 3.5, pickR: 2.0 };
    case 'TRADING': { // K线碑 — candlestick stele
      const parts = []; const hs = [1.4, 2.2, 1.0, 2.8, 1.8];
      hs.forEach((h, i) => {
        const x = (i - 2) * 0.5;
        parts.push({ geo: B(0.28, h, 0.28), pos: [x, h / 2, 0] });
        parts.push({ geo: B(0.05, h + 0.7, 0.05), pos: [x, (h + 0.7) / 2, 0] });
      });
      return { parts, labelY: 3.7, pickR: 1.9 };
    }
    case 'TODOS': // 堆叠块 — offset stacked slabs
      return { parts: [
        { geo: B(1.6, 0.4, 1.6), pos: [0, 0.25, 0] },
        { geo: B(1.3, 0.4, 1.3), pos: [0.25, 0.75, -0.1], rot: [0, 12 * DEG, 0] },
        { geo: B(1.0, 0.4, 1.0), pos: [-0.15, 1.2, 0.2], rot: [0, -10 * DEG, 0] },
        { geo: B(0.7, 0.4, 0.7), pos: [0.1, 1.6, 0], rot: [0, 20 * DEG, 0] },
      ], labelY: 2.6, pickR: 1.7 };
    case 'SYSTEM': // 核心多面体 — nested polyhedra
    default:
      return { parts: [
        { geo: new THREE.IcosahedronGeometry(1.35, 0), pos: [0, 1.6, 0] },
        { geo: new THREE.OctahedronGeometry(0.7, 0), pos: [0, 1.6, 0] },
      ], labelY: 3.4, pickR: 2.0, spin: true };
  }
}

// ---------------------------------------------------------------------------
export function createScene(canvas, opts) {
  const { mock, reducedMotion, isMobile, labelsEl, onHover } = opts;
  const W0 = () => window.innerWidth, H0 = () => window.innerHeight;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W0(), H0());
  renderer.setClearColor(0x0a0b06, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0a0b06, 26, 66);

  const camera = new THREE.PerspectiveCamera(42, W0() / H0(), 0.1, 200);
  const target = new THREE.Vector3(0, 1.6, 0);

  // -- camera state (spherical orbit around target) ---------------------------
  const cam = {
    baseTheta: -90 * DEG, basePhi: 58 * DEG, baseRadius: 30,
    dragYaw: 0, dragPitch: 0, dragYawT: 0, dragPitchT: 0,      // ±15° inertial offsets
    scroll: 0, mode: reducedMotion ? 'static' : 'deck',
  };
  const focus = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0 };

  // ===== The 90 pillar array — ONE merged LineSegments (custom shader) ========
  const pillars = buildPillars(mock);
  scene.add(pillars.mesh);

  // ===== grid floor ==========================================================
  const grid = buildGrid();
  scene.add(grid);

  // ===== 6 stations ==========================================================
  const stations = [];   // {id, group, mat, pick, anchor, def, spin}
  const pickMeshes = [];
  for (const def of mock.stations) {
    const s = stationParts(def.id);
    const geo = mergeEdges(s.parts);
    const mat = new THREE.LineBasicMaterial({ color: 0x6d6a1c, transparent: true, opacity: reducedMotion ? 0.9 : 0 });
    const line = new THREE.LineSegments(geo, mat);
    const group = new THREE.Group();
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
    stations.push({ id: def.id, group, mat, line, anchor, def, spin: !!s.spin, emph: 0, emphT: 0 });
  }

  // ===== projected DOM labels ===============================================
  const labels = stations.map(st => {
    const el = document.createElement('div');
    el.className = 'lbl';
    const stat = st.def.tag || '';
    el.innerHTML = `<div class="lbl-name">${st.def.label}</div><div class="lbl-stat">${stat}</div>`;
    labelsEl.appendChild(el);
    return { st, el };
  });

  // ===== raycaster / hover ===================================================
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2(-2, -2);
  let hovered = null;

  function pick() {
    if (cam.mode === 'focus') return;
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickMeshes, false)[0];
    const id = hit ? hit.object.userData.id : null;
    if (id !== hovered) { hovered = id; onHover && onHover(id); }
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
    // seed focus obj with current camera so the tween starts where we are
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
    // inertial drag lerp
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
    for (const st of stations) {
      if (st.spin) st.line.rotation.y += dt * 0.35;
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
    const w = W0(), h = H0();
    for (const { st, el } of labels) {
      st.anchor.getWorldPosition(_v); _v.project(camera);
      if (_v.z > 1) { el.style.opacity = '0'; continue; }
      const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-140%)`;
      const dist = camera.position.distanceTo(st.group.position);
      el.style.opacity = cam.mode === 'focus' ? '0' : '1';
      el.classList.toggle('is-hot', hovered === st.id);
      el.classList.toggle('is-dim', dist > 34);
    }
  }

  // ===== loop control ========================================================
  let raf = 0, running = false;
  function loop() { frame(); if (running) raf = requestAnimationFrame(loop); }
  function start() { if (running) return; running = true; clock.getDelta(); raf = requestAnimationFrame(loop); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  function renderOnce() { frame(); }

  // ===== reveal (grid scan-in → pillars rise → stations fade) ===============
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
    stop(); pillars.mesh.geometry.dispose(); pillars.mat.dispose();
    grid.geometry.dispose(); grid.material.dispose();
    for (const st of stations) { st.line.geometry.dispose(); st.mat.dispose(); }
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
// pillar builder — one geometry, custom ShaderMaterial (height reveal sweep,
// score→color ramp, today breathing) => a single draw call.
// ============================================================================
function buildPillars(mock) {
  const days = mock.the90, N = days.length;
  const cols = 10, rows = 9, sp = 1.55, hw = 0.22;
  const pos = [], sc = [], ord = [], tod = [];
  let maxD = 0.0001;
  const gx = i => ((i % cols) - (cols - 1) / 2) * sp;
  const gz = i => (Math.floor(i / cols) - (rows - 1) / 2) * sp;
  for (let i = 0; i < N; i++) maxD = Math.max(maxD, Math.hypot(gx(i), gz(i)));

  for (let i = 0; i < N; i++) {
    const d = days[i], score = d.score, h = 0.4 + score * 5.4;
    const x = gx(i), z = gz(i), order = Math.hypot(x, z) / maxD;
    const isToday = i === mock.todayIndex ? 1 : 0;
    // 8 corners
    const c = [
      [x - hw, 0, z - hw], [x + hw, 0, z - hw], [x + hw, 0, z + hw], [x - hw, 0, z + hw],
      [x - hw, h, z - hw], [x + hw, h, z - hw], [x + hw, h, z + hw], [x - hw, h, z + hw],
    ];
    const edges = [[0,1],[1,2],[2,3],[3,0], [4,5],[5,6],[6,7],[7,4], [0,4],[1,5],[2,6],[3,7]];
    for (const [a, b] of edges) {
      for (const k of [a, b]) {
        pos.push(c[k][0], c[k][1], c[k][2]);
        sc.push(score); ord.push(order); tod.push(isToday);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aScore', new THREE.Float32BufferAttribute(sc, 1));
  g.setAttribute('aOrder', new THREE.Float32BufferAttribute(ord, 1));
  g.setAttribute('aToday', new THREE.Float32BufferAttribute(tod, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uReveal: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      attribute float aScore; attribute float aOrder; attribute float aToday;
      uniform float uReveal;
      varying float vScore; varying float vToday;
      void main(){
        float r = smoothstep(0.0,1.0, clamp((uReveal - aOrder*0.55)/0.45, 0.0,1.0));
        vec3 p = position; p.y *= r;
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
  return { mesh: new THREE.LineSegments(g, mat), mat };
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
