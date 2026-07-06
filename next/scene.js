// ============================================================================
// CYRUS://NEXT — COMMAND DECK · scene.js  (v3)
// The Three.js tactical deck. Hidden-line rendering: every wireframe structure
// (90-pillar array + 6 stations) is backed by a bg-coloured SOLID OCCLUDER that
// writes depth, so interior/back lines are culled by the depth buffer.
//
// v3 additions:
//   · Selective hand-written bloom (no examples/jsm): THREE.Layers → bright
//     pass @1/4 res → 2-pass gaussian → additive composite. Glow quota is
//     rationed: only today-pillar + beacon at rest, hovered station on hover,
//     a short HUD-open pulse. Whole pipeline is skipped on mobile / reduced.
//   · Cinematic camera: boot→deck match-move descent (one shot), idle breathing
//     drift after 8s, focus fly on a quadratic-bezier arc with banking roll.
//   · Ghost future: days 58–90 render as dim un-occluded outline stubs.
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

// bloom layer — objects on layer 1 (in addition to 0) feed the bright pass -------
const BLOOM_LAYER = 1;

// pillar grid layout constants (shared by builders + today-glow) -----------------
const P_COLS = 10, P_ROWS = 9, P_SP = 1.55, P_HW = 0.22, GHOST_H = 0.5;
const pillarX = i => ((i % P_COLS) - (P_COLS - 1) / 2) * P_SP;
const pillarZ = i => (Math.floor(i / P_COLS) - (P_ROWS - 1) / 2) * P_SP;
const hOf = s => 0.4 + s * 5.4;                                    // score(0..1) → pillar height
// shared cube edge/corner layout so buildPillars, buildTodayGlow and the live
// setTodayScore updater all agree on vertex order (24 line verts / 12 edges).
const PILLAR_EDGES = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
const PILLAR_FACES = [[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
function pillarCorners(i, h) {
  const x = pillarX(i), z = pillarZ(i);
  return [
    [x - P_HW, 0, z - P_HW], [x + P_HW, 0, z - P_HW], [x + P_HW, 0, z + P_HW], [x - P_HW, 0, z + P_HW],
    [x - P_HW, h, z - P_HW], [x + P_HW, h, z - P_HW], [x + P_HW, h, z + P_HW], [x - P_HW, h, z + P_HW],
  ];
}

// -- station ring layout (angles chosen so none sits dead-center front) -------
const STATION_ANGLE = { MORNING: -90, ACADEMICS: -30, 'JP-N2': 30, TRADING: 90, TODOS: 150, SYSTEM: -150 };
const RING = 13.2;

// ---------------------------------------------------------------------------
// merge an array of primitive parts into ONE line-segment geometry
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

function occluderMaterial() {
  return new THREE.MeshBasicMaterial({
    color: BG, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
}

// triangular gable-roof prism — ONE solid, no crossing faces. Extruded along X.
function prismGeo(len, halfZ, baseY, apexY) {
  const hx = len / 2;
  const A = [-hx, baseY, -halfZ], B = [-hx, baseY, halfZ], C = [-hx, apexY, 0];
  const D = [hx, baseY, -halfZ], E = [hx, baseY, halfZ], F = [hx, apexY, 0];
  const t = (...pts) => pts.flat();
  const v = [
    ...t(A, B, E), ...t(A, E, D),
    ...t(A, D, F), ...t(A, F, C),
    ...t(B, C, F), ...t(B, F, E),
    ...t(A, C, B),
    ...t(D, E, F),
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  return g;
}

// per-station silhouettes. Returns { wire:[parts], solid:[parts], labelY, pickR }
function stationParts(id) {
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  switch (id) {
    case 'MORNING':
      return {
        wire: [
          { geo: new THREE.TorusGeometry(1.45, 0.05, 4, 30), pos: [0, 1.7, 0] },
          { geo: new THREE.TorusGeometry(1.9, 0.03, 4, 6), pos: [0, 1.7, 0] },
          { geo: new THREE.IcosahedronGeometry(0.45, 0), pos: [0, 1.7, 0] },
        ],
        solid: [{ geo: new THREE.IcosahedronGeometry(0.45, 0), pos: [0, 1.7, 0] }],
        labelY: 3.7, pickR: 2.1,
      };
    case 'ACADEMICS':
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
    case 'JP-N2':
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
    case 'TRADING': {
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
        wire.push({ geo: B(0.32, bh, 0.32), pos: [c.x, by, 0] });
        wire.push({ geo: B(0.05, c.wHi - c.bHi, 0.05), pos: [c.x, (c.wHi + c.bHi) / 2, 0] });
        wire.push({ geo: B(0.05, c.bLo - c.wLo, 0.05), pos: [c.x, (c.bLo + c.wLo) / 2, 0] });
        solid.push({ geo: B(0.32, bh, 0.32), pos: [c.x, by, 0] });
      }
      return { wire, solid, labelY: 3.9, pickR: 1.9 };
    }
    case 'TODOS':
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
    case 'SYSTEM':
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
  const bloomOn = !isMobile && !reducedMotion;

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
    dragYaw: 0, dragPitch: 0, dragYawT: 0, dragPitchT: 0,
    scroll: 0, mode: reducedMotion ? 'static' : 'deck',
    intro: reducedMotion ? 0 : 1,     // 1 = high approach pose, 0 = deck base
    idleW: 0, lastInput: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    bloomPulse: 0, _t: 0,
  };
  const focus = { u: 0 };                              // bezier parameter 0..1
  const fp = { p0: new THREE.Vector3(), c: new THREE.Vector3(), p1: new THREE.Vector3(),
    t0: new THREE.Vector3(), t1: new THREE.Vector3(), rollDir: 1 };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const noteInput = () => { cam.lastInput = now(); };

  // ===== The 90 pillar array — merged LineSegments + merged occluder ==========
  const pillars = buildPillars(mock);
  scene.add(pillars.occ);
  scene.add(pillars.mesh);

  // always built (cheap invisible instanced mesh): per-frame hover stays gated to
  // desktop, but on-demand pickPillar() lets a mobile tap open the The 90 log.
  const pillarPick = buildPillarPick(mock);
  scene.add(pillarPick);

  const beacon = buildBeacon(mock, pillars.topY);
  scene.add(beacon.line);

  // ===== grid floor ==========================================================
  const grid = buildGrid();
  scene.add(grid);

  // ===== 6 stations ==========================================================
  const occMat = occluderMaterial();
  const stations = [];
  const pickMeshes = [];
  for (const def of mock.stations) {
    const s = stationParts(def.id);
    const line = new THREE.LineSegments(mergeEdges(s.wire),
      new THREE.LineBasicMaterial({ color: 0x6d6a1c, transparent: true, opacity: reducedMotion ? 0.9 : 0 }));
    const group = new THREE.Group();
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

  // ===== selective bloom pipeline (desktop only) =============================
  let rtBright = null, rtA = null, rtB = null, quadScene = null, quadCam = null,
    quadMesh = null, blurMat = null, compMat = null, todayGlow = null;
  if (bloomOn) setupBloom();

  function bloomSize() {
    const pr = renderer.getPixelRatio();
    return [Math.max(2, Math.floor(W0() * pr * 0.25)), Math.max(2, Math.floor(H0() * pr * 0.25))];
  }
  function makeTargets() {
    const [w, h] = bloomSize();
    const p = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
    rtBright = new THREE.WebGLRenderTarget(w, h, p);
    rtA = new THREE.WebGLRenderTarget(w, h, p);
    rtB = new THREE.WebGLRenderTarget(w, h, p);
    if (blurMat) blurMat.uniforms.uRes.value.set(w, h);
  }
  function setupBloom() {
    makeTargets();
    quadScene = new THREE.Scene();
    quadCam = new THREE.Camera();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const [w, h] = bloomSize();
    blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() }, uRes: { value: new THREE.Vector2(w, h) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `
        precision mediump float;
        uniform sampler2D tDiffuse; uniform vec2 uDir; uniform vec2 uRes; varying vec2 vUv;
        void main(){
          vec2 tx = (uDir / uRes) * 1.6;               // spread widens the glow at 1/4 res
          float w0=0.227027, w1=0.1945946, w2=0.1216216, w3=0.054054, w4=0.016216;
          vec4 c = texture2D(tDiffuse,vUv)*w0;
          c += texture2D(tDiffuse, vUv+tx*1.0)*w1; c += texture2D(tDiffuse, vUv-tx*1.0)*w1;
          c += texture2D(tDiffuse, vUv+tx*2.0)*w2; c += texture2D(tDiffuse, vUv-tx*2.0)*w2;
          c += texture2D(tDiffuse, vUv+tx*3.0)*w3; c += texture2D(tDiffuse, vUv-tx*3.0)*w3;
          c += texture2D(tDiffuse, vUv+tx*4.0)*w4; c += texture2D(tDiffuse, vUv-tx*4.0)*w4;
          gl_FragColor = c;
        }`,
      depthTest: false, depthWrite: false,
    });
    compMat = new THREE.ShaderMaterial({
      uniforms: { tBloom: { value: null }, uStrength: { value: 0.85 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
      fragmentShader: `
        precision mediump float;
        uniform sampler2D tBloom; uniform float uStrength; varying vec2 vUv;
        void main(){ vec3 b = texture2D(tBloom, vUv).rgb; gl_FragColor = vec4(b*uStrength, 1.0); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
    });
    quadMesh = new THREE.Mesh(g, blurMat);
    quadMesh.frustumCulled = false;
    quadScene.add(quadMesh);

    // dedicated bloom-only glow for today's pillar (layer 1 only → drawn just in
    // the bright pass; the real pillar is still drawn once by pillars.mesh).
    todayGlow = buildTodayGlow(mock, pillars);
    scene.add(todayGlow);
    beacon.line.layers.enable(BLOOM_LAYER);            // beacon glows AND renders normally
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
  const extra = [];
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const fmtMon = (iso) => { const [, m, d] = iso.split('-'); return `${MON[+m - 1]} ${d}`; };
  {
    const el = document.createElement('div');
    el.className = 'np';
    el.innerHTML = `<div class="np-main">THE 90</div>
      <div class="np-sub">DAY ${mock.todayIndex + 1} / 90 · 30D AVG <b>${mock.avg30}%</b></div>`;
    labelsEl.appendChild(el);
    extra.push({ anchor: new THREE.Vector3(0, 6.3, -pillars.frontZ - 1.2), el, off: 'translate(-50%,-100%)' });
  }
  {
    const el = document.createElement('div');
    el.className = 'beacon-lbl';
    el.innerHTML = `<span class="bc-dot"></span>TODAY · ${fmtMon(mock.the90[mock.todayIndex].date)}`;
    labelsEl.appendChild(el);
    extra.push({ anchor: new THREE.Vector3(beacon.x, beacon.topY, beacon.z), el, off: 'translate(-50%,-150%)' });
  }
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
  const _p = new THREE.Vector3(), _tv = new THREE.Vector3();
  function deckCamPos(out, extraTheta = 0) {
    const idleTh = Math.sin(cam._t * 0.209) * 2 * DEG * cam.idleW;   // 2π/30 period
    const idlePh = Math.sin(cam._t * 0.170) * 1.2 * DEG * cam.idleW; // 2π/37 period
    const theta = cam.baseTheta + cam.scroll * (150 * DEG) + cam.dragYaw + extraTheta + idleTh - cam.intro * 12 * DEG;
    const phi = clamp(cam.basePhi + cam.dragPitch + idlePh - cam.intro * 26 * DEG, 12 * DEG, 80 * DEG);
    const r = cam.baseRadius - cam.scroll * 8 + cam.intro * 18;
    out.set(
      target.x + r * Math.sin(phi) * Math.cos(theta),
      target.y + r * Math.cos(phi),
      target.z + r * Math.sin(phi) * Math.sin(theta),
    );
    return out;
  }

  // ===== focus / return (quadratic-bezier arc + banking roll) ================
  function focusStation(id) {
    const st = stations.find(s => s.id === id); if (!st) return;
    cam.mode = 'focus';
    const sp = st.group.position;
    const outward = new THREE.Vector3(sp.x, 0, sp.z).normalize();
    fp.p0.copy(camera.position);
    fp.t0.set(target.x, target.y, target.z);
    fp.p1.set(sp.x + outward.x * 5.2, 4.6, sp.z + outward.z * 5.2);
    fp.t1.set(sp.x, 1.5, sp.z);
    fp.c.copy(fp.p0).add(fp.p1).multiplyScalar(0.5);
    fp.c.y += 3.2;
    fp.c.addScaledVector(outward, 2.4);                // bulge outward → banked arc
    fp.rollDir = (sp.x - fp.p0.x) >= 0 ? 1 : -1;
    focus.u = 0;
    if (reducedMotion || !gsap) { focus.u = 1; opts.onFocusDone && opts.onFocusDone(id); return; }
    gsap.killTweensOf(focus);
    gsap.to(focus, { u: 1, duration: 0.95, ease: 'power3.inOut', onComplete: () => opts.onFocusDone && opts.onFocusDone(id) });
  }
  function returnDeck() {
    const dest = deckCamPos(new THREE.Vector3());
    if (reducedMotion || !gsap) { cam.mode = 'deck'; opts.onReturnDone && opts.onReturnDone(); return; }
    fp.p0.copy(camera.position);
    fp.t0.copy(fp.t1);
    fp.p1.copy(dest);
    fp.t1.set(target.x, target.y, target.z);
    fp.c.copy(fp.p0).add(fp.p1).multiplyScalar(0.5); fp.c.y += 3.0;
    fp.rollDir = (dest.x - fp.p0.x) >= 0 ? 1 : -1;
    focus.u = 0;
    gsap.killTweensOf(focus);
    gsap.to(focus, {
      u: 1, duration: 0.8, ease: 'power3.inOut',
      onComplete: () => { cam.mode = 'deck'; opts.onReturnDone && opts.onReturnDone(); },
    });
  }

  // ===== per-frame ===========================================================
  const clock = new THREE.Clock();
  function frame() {
    const dt = clock.getDelta(), t = clock.elapsedTime; cam._t = t;
    cam.dragYaw = lerp(cam.dragYaw, cam.dragYawT, 1 - Math.pow(0.001, dt));
    cam.dragPitch = lerp(cam.dragPitch, cam.dragPitchT, 1 - Math.pow(0.001, dt));

    // idle breathing drift — engages after 8s of no input, retreats instantly
    const idleSec = (now() - cam.lastInput) / 1000;
    const idleTgt = (idleSec > 8 && cam.mode === 'deck') ? 1 : 0;
    cam.idleW = lerp(cam.idleW, idleTgt, 1 - Math.pow(idleTgt ? 0.35 : 0.0002, dt));

    // bloom pulse decay
    if (cam.bloomPulse > 0.002) cam.bloomPulse *= Math.pow(0.015, dt); else cam.bloomPulse = 0;

    let roll = 0;
    if (cam.mode === 'focus') {
      const u = focus.u, iu = 1 - u;
      _p.copy(fp.p0).multiplyScalar(iu * iu).addScaledVector(fp.c, 2 * iu * u).addScaledVector(fp.p1, u * u);
      camera.position.copy(_p);
      _tv.copy(fp.t0).lerp(fp.t1, u);
      camera.lookAt(_tv);
      roll = Math.sin(clamp(u, 0, 1) * Math.PI) * 2 * DEG * fp.rollDir;
    } else {
      deckCamPos(_p); camera.position.copy(_p);
      camera.lookAt(target.x + cam.dragYaw * 1.2, target.y, target.z);
      roll = cam.intro * 1.4 * DEG;
    }
    if (roll) camera.rotateZ(roll);

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
    renderScene();
  }

  // ===== render (bloom pipeline or plain) ====================================
  function renderScene() {
    if (!bloomOn) { renderer.render(scene, camera); return; }
    const rev = pillars.mat.uniforms.uReveal.value;
    const breathe = 0.5 + 0.5 * Math.sin(cam._t * 2.2);
    todayGlow.material.opacity = rev * (0.55 + 0.45 * breathe);

    // (1) bright pass — only bloom-layer objects, @1/4 res, cleared to black
    camera.layers.set(BLOOM_LAYER);
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(rtBright); renderer.clear(); renderer.render(scene, camera);
    // (2) blur horizontal → rtA
    quadMesh.material = blurMat;
    blurMat.uniforms.tDiffuse.value = rtBright.texture; blurMat.uniforms.uDir.value.set(1, 0);
    renderer.setRenderTarget(rtA); renderer.render(quadScene, quadCam);
    // (3) blur vertical → rtB
    blurMat.uniforms.tDiffuse.value = rtA.texture; blurMat.uniforms.uDir.value.set(0, 1);
    renderer.setRenderTarget(rtB); renderer.render(quadScene, quadCam);
    // (4) main pass — everything on layer 0, full res, to screen
    camera.layers.set(0);
    renderer.setRenderTarget(null); renderer.setClearColor(BG, 1);
    renderer.render(scene, camera);
    // (5) additive composite of the blurred bloom over the main image
    quadMesh.material = compMat;
    compMat.uniforms.tBloom.value = rtB.texture;
    compMat.uniforms.uStrength.value = 0.85 + cam.bloomPulse * 1.7;
    const ac = renderer.autoClear; renderer.autoClear = false;
    renderer.render(quadScene, quadCam);
    renderer.autoClear = ac;
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

  // ===== intro / reveal ======================================================
  // beginIntro seeds the high approach pose + a slow pre-drift during boot;
  // reveal() completes the descent + raises pillars in one continuous shot.
  function beginIntro() {
    if (reducedMotion) { cam.intro = 0; return; }
    cam.intro = 1;
    if (gsap) gsap.to(cam, { intro: 0.78, duration: 1.5, ease: 'power1.inOut' });
  }
  function reveal() {
    if (reducedMotion || !gsap) {
      cam.intro = 0; pillars.mat.uniforms.uReveal.value = 1; grid.material.opacity = 0.5;
      for (const st of stations) st.mat.opacity = 0.9;
      renderOnce(); return;
    }
    gsap.killTweensOf(cam);                 // kill the pre-drift, take over the descent
    grid.material.opacity = 0;
    gsap.timeline()
      .to(cam, { intro: 0, duration: 1.5, ease: 'power2.inOut' }, 0)
      .to(grid.material, { opacity: 0.5, duration: 0.8, ease: 'power2.out' }, 0.1)
      .to(pillars.mat.uniforms.uReveal, { value: 1, duration: 1.25, ease: 'power2.out' }, 0.25)
      .to(stations.map(s => s.mat), { opacity: 0.6, duration: 0.6, ease: 'power1.out' }, 0.6);
  }

  // ===== public setters ======================================================
  function setScroll(p) { cam.scroll = clamp(p, 0, 1); noteInput(); }
  function applyDrag(dx, dy) {
    cam.dragYawT = clamp(cam.dragYawT - dx * 0.0022, -15 * DEG, 15 * DEG);
    cam.dragPitchT = clamp(cam.dragPitchT - dy * 0.0018, -15 * DEG, 15 * DEG);
    noteInput();
  }
  function setPointer(x, y) { ndc.set((x / W0()) * 2 - 1, -(y / H0()) * 2 + 1); noteInput(); }
  function highlight(id) {
    for (const st of stations) {
      st.emphT = st.id === id ? 1 : 0;
      if (bloomOn) { if (st.id === id) st.line.layers.enable(BLOOM_LAYER); else st.line.layers.disable(BLOOM_LAYER); }
    }
  }
  function pulseBloom() { cam.bloomPulse = 1; }
  // on-demand hit test against the pillar array at the current pointer ndc —
  // returns the day index under the cursor/tap, or null. Used to open THE 90 log
  // (works on mobile where per-frame pillar hover is disabled).
  function pickPillar() {
    if (!pillarPick || cam.mode === 'focus') return null;
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(pillarPick, false)[0];
    return (hit && hit.instanceId != null) ? hit.instanceId : null;
  }
  // optimistic redraw of TODAY's pillar after a The 90 toggle (score = 0..1).
  function setTodayScore(score) {
    const h = pillars.setTodayScore(score);
    if (bloomOn && todayGlow) updateTodayGlowHeight(todayGlow, mock.todayIndex, h);
    const bpos = beacon.line.geometry.attributes.position;   // lift the beacon base
    bpos.setY(0, h + 0.15); bpos.needsUpdate = true;
    if (!running) renderOnce();
  }
  function resize() {
    camera.aspect = W0() / H0(); camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W0(), H0());
    if (bloomOn) { rtBright.dispose(); rtA.dispose(); rtB.dispose(); makeTargets(); }
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
    if (bloomOn) {
      rtBright.dispose(); rtA.dispose(); rtB.dispose();
      blurMat.dispose(); compMat.dispose(); quadMesh.geometry.dispose();
      todayGlow.geometry.dispose(); todayGlow.material.dispose();
    }
    renderer.dispose();
  }

  return {
    start, stop, renderOnce, reveal, beginIntro, resize, dispose, pulseBloom,
    setScroll, applyDrag, setPointer, highlight, focusStation, returnDeck,
    pickPillar, setTodayScore,
    get mode() { return cam.mode; }, get hovered() { return hovered; },
    get pillarHovered() { return pillarHovered; },
    labelFor: id => (labels.find(l => l.st.id === id) || {}).el,
  };
}

// ============================================================================
// pillar builder — past/today are solid + coloured; future days (i>todayIndex)
// are dim un-occluded outline stubs ("unbuilt future"). The occluder + score
// colour skip ghost pillars entirely; the shader fades everything in on reveal.
// ============================================================================
function buildPillars(mock) {
  const days = mock.the90, N = days.length, TODAY = mock.todayIndex;
  const line = [], sc = [], ord = [], tod = [], gh = [];
  const solid = [], sord = [];
  let maxD = 0.0001;
  for (let i = 0; i < N; i++) maxD = Math.max(maxD, Math.hypot(pillarX(i), pillarZ(i)));

  const FACES = PILLAR_FACES;

  for (let i = 0; i < N; i++) {
    const d = days[i], ghost = i > TODAY;
    const score = ghost ? 0 : d.score;
    const h = ghost ? GHOST_H : hOf(score);
    const x = pillarX(i), z = pillarZ(i), order = Math.hypot(x, z) / maxD;
    const isToday = i === TODAY ? 1 : 0;
    const c = pillarCorners(i, h);
    for (const [a, b] of PILLAR_EDGES) for (const k of [a, b]) {
      line.push(c[k][0], c[k][1], c[k][2]); sc.push(score); ord.push(order); tod.push(isToday); gh.push(ghost ? 1 : 0);
    }
    if (!ghost) for (const f of FACES) for (const k of f) { solid.push(c[k][0], c[k][1], c[k][2]); sord.push(order); }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
  g.setAttribute('aScore', new THREE.Float32BufferAttribute(sc, 1));
  g.setAttribute('aOrder', new THREE.Float32BufferAttribute(ord, 1));
  g.setAttribute('aToday', new THREE.Float32BufferAttribute(tod, 1));
  g.setAttribute('aGhost', new THREE.Float32BufferAttribute(gh, 1));

  const uReveal = { value: 0 }, uTime = { value: 0 };
  const REVEAL = /* glsl */`
    float reveal(float ord){ return smoothstep(0.0,1.0, clamp((uReveal - ord*0.55)/0.45, 0.0,1.0)); }`;

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uReveal, uTime },
    vertexShader: /* glsl */`
      attribute float aScore; attribute float aOrder; attribute float aToday; attribute float aGhost;
      uniform float uReveal;
      varying float vScore; varying float vToday; varying float vGhost; varying float vRev;
      ${REVEAL}
      void main(){
        float rv = reveal(aOrder);
        vec3 p = position; p.y *= rv;
        vScore = aScore; vToday = aToday; vGhost = aGhost; vRev = rv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      }`,
    fragmentShader: /* glsl */`
      precision mediump float;
      uniform float uTime;
      varying float vScore; varying float vToday; varying float vGhost; varying float vRev;
      void main(){
        vec3 dim = vec3(0.12,0.13,0.08);
        vec3 hot = vec3(0.82,0.80,0.06);
        vec3 pcol = mix(dim, hot, vScore*vScore*0.55 + vScore*0.45);
        float breathe = 0.5 + 0.5*sin(uTime*2.2);
        pcol += vToday * (0.2 + 0.6*breathe) * vec3(0.95,0.92,0.35);
        float pa = 0.32 + 0.55*vScore + vToday*0.4*breathe;
        vec3 gcol = vec3(0.22,0.23,0.15);              // dim ghost outline
        vec3 col = mix(pcol, gcol, vGhost);
        float a = mix(pa, 0.12, vGhost);
        gl_FragColor = vec4(col, clamp(a,0.0,1.0) * vRev);
      }`,
  });

  const og = new THREE.BufferGeometry();
  og.setAttribute('position', new THREE.Float32BufferAttribute(solid, 3));
  og.setAttribute('aOrder', new THREE.Float32BufferAttribute(sord, 1));
  const oMat = new THREE.ShaderMaterial({
    uniforms: { uReveal },
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
  occ.renderOrder = -1;

  const frontZ = (P_ROWS - 1) / 2 * P_SP;
  const leftX = -((P_COLS - 1) / 2 * P_SP) - 1.1;
  const ticks = [];
  for (let r = 0; r < P_ROWS; r++) ticks.push({ label: `D${(r + 1) * 10}`, x: leftX, z: (r - (P_ROWS - 1) / 2) * P_SP });

  // live optimistic update of TODAY's pillar (line verts + aScore + occluder)
  // after a The 90 toggle. Today is always a real (non-ghost) pillar, so its
  // vertex slabs are at fixed offsets: line = TODAY*24, solid = TODAY*36.
  let todayH = (TODAY >= 0 && TODAY < N && days[TODAY] && typeof days[TODAY].score === 'number')
    ? hOf(days[TODAY].score) : GHOST_H;
  function setTodayScore(score) {
    if (TODAY < 0 || TODAY >= N) return GHOST_H;
    const s01 = Math.min(1, Math.max(0, +score || 0));
    const h = hOf(s01); todayH = h;
    const c = pillarCorners(TODAY, h);
    const lp = g.attributes.position, ls = g.attributes.aScore;
    let o = TODAY * 24;
    for (const [a, b] of PILLAR_EDGES) {
      lp.setXYZ(o, c[a][0], c[a][1], c[a][2]); ls.setX(o, s01); o++;
      lp.setXYZ(o, c[b][0], c[b][1], c[b][2]); ls.setX(o, s01); o++;
    }
    lp.needsUpdate = true; ls.needsUpdate = true;
    const sp = og.attributes.position;
    let so = TODAY * 36;
    for (const f of FACES) for (const k of f) { sp.setXYZ(so, c[k][0], c[k][1], c[k][2]); so++; }
    sp.needsUpdate = true;
    return h;
  }

  return {
    mesh: new THREE.LineSegments(g, mat), mat, occ, frontZ, setTodayScore,
    topY: i => (i > TODAY ? GHOST_H : (i === TODAY ? todayH : hOf(days[i].score))),
    xOf: pillarX, zOf: pillarZ, ticks,
  };
}

// invisible instanced boxes for pillar picking — only REAL days (0..todayIndex),
// so instanceId maps straight to a scored day (ghosts aren't pickable).
function buildPillarPick(mock) {
  const days = mock.the90, TODAY = mock.todayIndex, count = TODAY + 1;
  const geo = new THREE.BoxGeometry(P_HW * 2, 1, P_HW * 2);
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const h = 0.4 + days[i].score * 5.4;
    m.makeScale(1, h, 1); m.setPosition(pillarX(i), h / 2, pillarZ(i));
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

// today beacon — a thin cyan vertical light rising above today's pillar --------
function buildBeacon(mock, topY) {
  const i = mock.todayIndex;
  const x = pillarX(i), z = pillarZ(i);
  const base = topY(i) + 0.15, top = Math.max(base + 1.6, 6.6);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x, base, z, x, top, z], 3));
  const mat = new THREE.LineBasicMaterial({ color: 0x38d9d0, transparent: true, opacity: 0 });
  return { line: new THREE.LineSegments(g, mat), x, z, topY: top };
}

// bloom-only glow outline for today's pillar (layer 1 only) ---------------------
function buildTodayGlow(mock, pillars) {
  const i = mock.todayIndex, h = pillars.topY(i);
  const c = pillarCorners(i, h);
  const pos = [];
  for (const [a, b] of PILLAR_EDGES) { pos.push(...c[a], ...c[b]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xefe000, transparent: true, opacity: 0 }));
  line.layers.set(BLOOM_LAYER);        // bloom pass only — real pillar drawn by pillars.mesh
  return line;
}
// rewrite the glow outline's verts to a new today height (live optimistic update)
function updateTodayGlowHeight(glow, i, h) {
  const c = pillarCorners(i, h);
  const pos = glow.geometry.attributes.position;
  let o = 0;
  for (const [a, b] of PILLAR_EDGES) {
    pos.setXYZ(o++, c[a][0], c[a][1], c[a][2]);
    pos.setXYZ(o++, c[b][0], c[b][1], c[b][2]);
  }
  pos.needsUpdate = true;
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
