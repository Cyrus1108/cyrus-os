// ============================================================================
// CYRUS://NEXT — COMMAND DECK · scene.js  (v3)
// The Three.js tactical deck. Hidden-line rendering: every wireframe structure
// (90-pillar array + the district stations) is backed by a bg-coloured SOLID
// OCCLUDER that writes depth, so interior/back lines are culled by the z-buffer.
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
// shortest-arc angular lerp (radians) — keeps the district tour sweep from
// spinning the long way round when azimuths cross the ±180° seam.
const lerpAngle = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };

/* == TUNING ==================================================================
   BG / fog colour ....... const BG below — MUST equal style.css --bg (hidden-line
                           occluders paint this colour; mismatch breaks the trick)
   fog range ............. createScene: `scene.fog = new THREE.Fog(BG, 26, 66)`
   bloom strength ........ const BLOOM_STRENGTH below (baseline; hover/seal pulse
                           adds `+ cam.bloomPulse * 1.7` in renderScene)
   station hues .......... const STATION_HUE below (idle = dimmed/desaturated,
                           hover = brightened — mixed per frame in the loop)
   station fill opacity .. const FILL_OPACITY below (translucent volume faces)
   grid brightness ....... buildGrid fragment shader `float base = ...` line
   dust opacity .......... const DUST_OPACITY below
   ========================================================================== */

// bg / fog colour — occluders paint this so they read as "solid, unlit" ---------
// deep blue-black (owner 2026-07-08: pure near-black read too flat/empty)
const BG = 0x0a0e14;
const BG_V = [0x0a / 255, 0x0e / 255, 0x14 / 255];

// bloom layer — objects on layer 1 (in addition to 0) feed the bright pass -------
const BLOOM_LAYER = 1;
const BLOOM_STRENGTH = 0.75;     // holographic glow baseline (0.6–0.9 sane range)

// per-station hue map — colour as information hierarchy. idle is dimmed +
// slightly desaturated; hover/active lerps toward the bright hue (and the
// brighter line feeds the bloom pass harder → the glow "wakes up").
const STATION_HUE = {
  TRADING: 0xF5A623, FINANCE: 0xF5A623,        // capital — amber
  'JP-N2': 0x4ECDC4,                            // language — teal
  ACADEMICS: 0x9B8CFF,                          // study — violet
  MORNING: 0x5FD068, TODOS: 0x5FD068,           // daily ops — green
  SYSTEM: 0xEFE000,                             // the monarch keeps the yellow
};
const FILL_OPACITY = 0.055;      // translucent volume faces over the occluders

// atmospheric dust field target opacity (additive; faded in on reveal) -----------
const DUST_OPACITY = 0.5;

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

// -- districted "TERRITORY" layout ------------------------------------------
// The 90 monument is the heart (origin). Stations live in thematic DISTRICTS —
// angular sectors at distinct radius bands around it. Each district reserves a
// fixed set of angular SLOTS so later batches drop new modules in without
// re-laying-out the ones already built: a slot is instantiated only if its id
// appears in mock.stations; reserved ids (and '__'-prefixed spacers) hold a gap,
// never an empty station. Placement is deterministic — slots spread evenly
// across [az-arc/2 … az+arc/2] at the district radius — so a module added later
// lands exactly where the gap was held.
// A district MAY carry `y` (default 0) — a group elevation shared by its slots,
// so "ascension" reads vertically (a floating dais) instead of by exile-distance.
const DISTRICTS = [
  // DISCIPLINE — the daily cockpit; closest to the monument, front arc (faces
  // the resting camera). Batch 1: all five instantiated.
  { id: 'DISCIPLINE', az: -90, r: 12, arc: 100, phi: 60,
    slots: ['ACADEMICS', 'JP-N2', 'MORNING', 'TRADING', 'TODOS'] },
  // OPERATIONS — the big apps; right sector. Batch 1: FINANCE (centered);
  // FITNESS/AI/CALENDAR/WISHLIST reserved for later batches.
  // phi 68 → lower, more frontal camera: the bank facade reads face-on instead
  // of being crushed under a ~50° look-down (it's the only station until B4).
  { id: 'OPERATIONS', az: 0, r: 14, arc: 100, phi: 68,
    slots: ['FITNESS', 'AI', 'FINANCE', 'CALENDAR', 'WISHLIST'] },
  // ASCENSION — the game layer; back sector, behind the monument. Batch 1:
  // SYSTEM (centered, spacers hold room for the real RPG later). Pulled IN and
  // lifted UP (y): ascension is expressed by elevation, not by distance.
  { id: 'ASCENSION', az: 90, r: 11.5, arc: 56, phi: 58, y: 2.6,
    slots: ['__asc_l', 'SYSTEM', '__asc_r'] },
  // CREED — belief / resilience; left sector. All reserved for a later batch.
  { id: 'CREED', az: 180, r: 13.5, arc: 72, phi: 62,
    slots: ['PRINCIPLES', 'LOWDAY', 'MOTIVATION'] },
];
// derive per-slot world positions (once) + per-district framing info.
const STATION_LAYOUT = {};   // id → { x, y, z, az, districtId }  (real modules only)
const DISTRICT_INFO = {};    // id → { az, r, phi, y, cx, cz }    (centroid on its axis)
for (const d of DISTRICTS) {
  const n = d.slots.length, caz = d.az * DEG, dy = d.y || 0;
  DISTRICT_INFO[d.id] = { az: d.az, r: d.r, phi: d.phi, y: dy, cx: Math.cos(caz) * d.r, cz: Math.sin(caz) * d.r };
  for (let k = 0; k < n; k++) {
    const id = d.slots[k];
    if (!id || id.startsWith('__')) continue;                    // spacer → hold a gap
    const az = n === 1 ? d.az : d.az - d.arc / 2 + d.arc * (k / (n - 1));
    const a = az * DEG;
    STATION_LAYOUT[id] = { x: Math.cos(a) * d.r, y: dy, z: Math.sin(a) * d.r, az, districtId: d.id };
  }
}

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
// `rpg` (optional) feeds SYSTEM's data-driven monument.
function stationParts(id, rpg) {
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  switch (id) {
    case 'MORNING':
      return {
        wire: [
          { geo: new THREE.TorusGeometry(1.45, 0.05, 4, 30), pos: [0, 1.7, 0] },
          { geo: new THREE.TorusGeometry(1.9, 0.03, 4, 6), pos: [0, 1.7, 0] },
        ],
        solid: [],
        // the sunrise core spins on its own (sub-group, not the whole ring)
        spinParts: [{
          wire: [{ geo: new THREE.IcosahedronGeometry(0.45, 0), pos: [0, 1.7, 0] }],
          solid: [{ geo: new THREE.IcosahedronGeometry(0.44, 0), pos: [0, 1.7, 0] }],
          speed: 0.7,
        }],
        labelY: 3.7, pickR: 2.1,
      };
    case 'ACADEMICS': {                  // 书堆 — cover shells + inset page blocks,
      // varied thickness, staggered offsets, a BIG fanned open book on the summit
      const BOOKS = [
        { w: 1.85, h: 0.30, d: 1.30, y: 0.15, ry: 0, x: 0, z: 0 },
        { w: 1.60, h: 0.22, d: 1.10, y: 0.41, ry: 14, x: 0.10, z: -0.06 },
        { w: 1.95, h: 0.34, d: 1.32, y: 0.69, ry: -8, x: -0.08, z: 0.05 },
        { w: 1.50, h: 0.20, d: 1.00, y: 0.96, ry: 26, x: 0.14, z: 0.02 },
        { w: 1.35, h: 0.24, d: 0.92, y: 1.18, ry: -16, x: -0.05, z: -0.04 },
      ];
      const wire = [], solid = [];
      for (const b of BOOKS) {
        const r = [0, b.ry * DEG, 0];
        // cover shell (also the occluder)
        wire.push({ geo: B(b.w, b.h, b.d), pos: [b.x, b.y, b.z], rot: r });
        solid.push({ geo: B(b.w, b.h, b.d), pos: [b.x, b.y, b.z], rot: r });
        // page block — inset, peeking toward the fore-edge (offset rotated with
        // the book so pages stay on the right side of the spine)
        const fore = 0.05 * b.w;
        const fx = Math.cos(b.ry * DEG) * fore, fz = -Math.sin(b.ry * DEG) * fore;
        wire.push({ geo: B(b.w * 0.94, b.h * 0.56, b.d * 0.86), pos: [b.x + fx, b.y, b.z + fz], rot: r });
      }
      // open book on the summit — two main leaves + a smaller fanned page pair,
      // slight yaw so it reads from the district camera
      const oy = 1.38, yaw = 18 * DEG;
      const leaf = (w, tilt, lift, off) => ({
        geo: B(w, 0.045, 1.05),
        pos: [Math.cos(yaw) * off, oy + lift, -Math.sin(yaw) * off],
        rot: [0, yaw, tilt * DEG],
      });
      wire.push(leaf(0.85, 18, 0, -0.40));   // left cover leaf
      wire.push(leaf(0.85, -18, 0, 0.40));   // right cover leaf
      wire.push(leaf(0.72, 30, 0.05, -0.30)); // fanned page pair (lifted, steeper)
      wire.push(leaf(0.72, -30, 0.05, 0.30));
      return { wire, solid, labelY: 2.9, pickR: 1.9 };
    }
    case 'JP-N2': {                      // 町屋 — two-storey machiya, lantern, fence
      // (the deck's grand torii moved to the entrance axis — see buildTorii)
      const wire = [], solid = [];
      const S = (geo, pos, rot) => { wire.push({ geo: geo.clone(), pos, rot }); solid.push({ geo, pos, rot }); };
      // house — ground floor, skirt roof (披檐), inset upper floor, gable roof
      S(B(2.2, 1.0, 1.5), [0, 0.5, 0]);
      S(B(2.55, 0.06, 1.78), [0, 1.06, 0.06]);                       // 披檐 (slight front overhang)
      S(B(2.0, 0.9, 1.35), [0, 1.52, 0]);
      S(prismGeo(2.45, 0.92, 1.97, 2.5), [0, 0, 0]);                 // gable roof, side gables
      // 格子窗 — ground floor (framed, 4 bars) + upper floor (5 bars)
      wire.push({ geo: B(0.95, 0.5, 0.04), pos: [-0.5, 0.62, 0.76] });
      for (let i = 0; i < 4; i++) wire.push({ geo: B(0.028, 0.5, 0.028), pos: [-0.86 + i * 0.24, 0.62, 0.77] });
      wire.push({ geo: B(1.5, 0.42, 0.04), pos: [0, 1.56, 0.69] });
      for (let i = 0; i < 5; i++) wire.push({ geo: B(0.028, 0.42, 0.028), pos: [-0.6 + i * 0.3, 1.56, 0.70] });
      // door + balcony railing
      S(B(0.5, 0.78, 0.08), [0.62, 0.39, 0.76]);
      wire.push({ geo: B(1.9, 0.04, 0.04), pos: [0, 2.06, 0.74] });
      for (let i = 0; i < 5; i++) wire.push({ geo: B(0.03, 0.24, 0.03), pos: [-0.8 + i * 0.4, 1.95, 0.74] });
      // 石灯笼 — base / post / light box / pyramid cap
      S(B(0.32, 0.12, 0.32), [1.62, 0.06, 0.72]);
      wire.push({ geo: new THREE.CylinderGeometry(0.05, 0.07, 0.45, 6), pos: [1.62, 0.35, 0.72] });
      S(B(0.26, 0.22, 0.26), [1.62, 0.68, 0.72]);
      wire.push({ geo: new THREE.CylinderGeometry(0.01, 0.24, 0.16, 4), pos: [1.62, 0.87, 0.72], rot: [0, 45 * DEG, 0] });
      // 庭院围篱 — two rails + posts, front-left
      wire.push({ geo: B(1.15, 0.035, 0.035), pos: [-1.75, 0.3, 0.8] });
      wire.push({ geo: B(1.15, 0.035, 0.035), pos: [-1.75, 0.52, 0.8] });
      for (let i = 0; i < 3; i++) wire.push({ geo: B(0.04, 0.6, 0.04), pos: [-2.25 + i * 0.5, 0.3, 0.8] });
      return { wire, solid, labelY: 3.3, pickR: 2.0 };
    }
    case 'FINANCE': {                    // neoclassical bank — a real BUILDING,
      const wire = [], solid = [];       // not a flat facade (owner: 厚实、有深度)
      // 3 stylobate steps, deep — they run back under the whole hall
      const STEPS = [
        { w: 4.3, d: 3.6, y: 0.08 },
        { w: 3.95, d: 3.3, y: 0.24 },
        { w: 3.6, d: 3.0, y: 0.40 },
      ];
      for (const s of STEPS) {
        const g = B(s.w, 0.16, s.d), p = [0, s.y, -0.55];   // front edge ≈ z+1.25
        wire.push({ geo: g.clone(), pos: p }); solid.push({ geo: g, pos: p });
      }
      const topStep = 0.48;                        // top face of the 3rd step
      const FZ = 0.45;                             // facade plane (columns/pediment)
      // 8 hexagonal columns across the portico front
      const nCol = 8, span = 3.3, colH = 1.55, colY = topStep + colH / 2;
      for (let i = 0; i < nCol; i++) {
        const x = -span / 2 + span * (i / (nCol - 1));
        wire.push({ geo: new THREE.CylinderGeometry(0.09, 0.09, colH, 6), pos: [x, colY, FZ] });
      }
      const colTop = topStep + colH;               // 2.03
      // entablature across the column tops
      const entY = colTop + 0.11;
      const entG = () => B(3.8, 0.22, 0.6);
      wire.push({ geo: entG(), pos: [0, entY, FZ] }); solid.push({ geo: entG(), pos: [0, entY, FZ] });
      // FRONT-facing pediment: prismGeo extrudes along X → rotate 90° about Y so
      // the triangle reads from the street (ridge runs front-to-back, thin slab)
      const pedBase = colTop + 0.22, pedApex = pedBase + 0.9;
      wire.push({ geo: prismGeo(0.6, 1.9, pedBase, pedApex), rot: [0, 90 * DEG, 0], pos: [0, 0, FZ] });
      solid.push({ geo: prismGeo(0.6, 1.9, pedBase, pedApex), rot: [0, 90 * DEG, 0], pos: [0, 0, FZ] });
      // the HALL — full body behind the portico (side walls read from any angle)
      const bodyG = () => B(3.5, 1.55, 2.4);
      wire.push({ geo: bodyG(), pos: [0, topStep + 0.775, -0.85] });
      solid.push({ geo: bodyG(), pos: [0, topStep + 0.775, -0.85] });
      // hall roof — long gable, ridge front-to-back, kept BELOW the pediment apex
      wire.push({ geo: prismGeo(2.4, 1.78, colTop, colTop + 0.55), rot: [0, 90 * DEG, 0], pos: [0, 0, -0.85] });
      solid.push({ geo: prismGeo(2.4, 1.78, colTop, colTop + 0.55), rot: [0, 90 * DEG, 0], pos: [0, 0, -0.85] });
      // recessed dark door centred behind the middle columns (wire + solid)
      const doorG = () => B(0.85, 1.05, 0.12);
      wire.push({ geo: doorG(), pos: [0, topStep + 0.52, 0.30] });
      solid.push({ geo: doorG(), pos: [0, topStep + 0.52, 0.30] });
      return { wire, solid, labelY: 3.9, pickR: 2.4 };
    }
    case 'TRADING': {                    // K線 — holographic price-chart monument
      const wire = [], solid = [];
      // candles live in a DYNAMIC buffer (st.chart) so the tape can "walk" while
      // the station is selected — see buildChart/updateChart. Seed series 升跌升:
      const chart = {
        slots: [-1.25, -0.75, -0.25, 0.25, 0.75, 1.25],
        candles: [
          { o: 0.6, c: 1.6, hi: 1.9, lo: 0.3 },
          { o: 1.6, c: 2.4, hi: 2.8, lo: 1.3 },
          { o: 2.4, c: 1.4, hi: 2.5, lo: 1.0 },
          { o: 1.4, c: 3.0, hi: 3.3, lo: 1.2 },
          { o: 3.0, c: 1.9, hi: 3.1, lo: 1.6 },
          { o: 1.9, c: 2.5, hi: 2.8, lo: 1.7 },
        ],
      };
      // minimal axis frame → the candles read as a chart, not random posts
      wire.push({ geo: B(2.9, 0.05, 0.05), pos: [0, 0.32, 0] });        // baseline rail
      wire.push({ geo: B(0.05, 3.0, 0.05), pos: [-1.5, 1.82, 0] });     // left value axis
      // 盘前封条 — wax-seal ring that MATERIALIZES on the monument when sealed.
      // Built into a separate LineSegments (st.seal) by the station loop below,
      // toggled by setTradingSealed(). Floats over/in-front-of the chart.
      const sealWire = [
        { geo: new THREE.TorusGeometry(0.55, 0.06, 4, 24), pos: [0, 2.15, 0.45] },
        { geo: B(0.06, 0.9, 0.06), pos: [-0.32, 1.5, 0.45], rot: [0, 0, 32 * DEG] },   // ribbon strokes
        { geo: B(0.06, 0.9, 0.06), pos: [0.32, 1.5, 0.45], rot: [0, 0, -32 * DEG] },
      ];
      return { wire, solid, sealWire, chart, labelY: 3.9, pickR: 1.9 };
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
    default: {
      // SYSTEM's group sits elevated (ASCENSION.y); the hex dais is the floating
      // platform under the core, the hairline tethers it from deck level (local
      // y ≈ -2.6, i.e. world 0) up to the dais underside.
      // B2: the monument is DATA-DRIVEN — a live character sheet in wireframe:
      //   rank (E..S)      → number of orbit rings around the core
      //   EXP-in-level     → rungs climbing the tether toward the dais
      //   unlocked 成就     → shard ring orbiting the core (spins with it)
      //   six attributes   → radar polygon etched on the dais top
      const R = rpg || null;
      const wire = [
        { geo: new THREE.IcosahedronGeometry(1.35, 0), pos: [0, 1.6, 0] },
        { geo: new THREE.CylinderGeometry(1.5, 1.7, 0.18, 6), pos: [0, 0, 0] },     // floating hex dais
        { geo: B(0.03, 2.51, 0.03), pos: [0, -1.345, 0] },                          // hairline tether to deck
      ];
      // rank rings — E=1 … S=6, expanding radii, varied tilts. Each ring is its
      // own spinParts layer precessing about a DIFFERENT body axis (gyroscope
      // feel), instead of riding the whole-monument Y spin.
      const rankIdx = R ? 'EDCBAS'.indexOf(R.rank) + 1 : 2;
      const RING_TILT = [
        [24, 0, 0], [90, 0, 32], [62, 0, -20], [38, 0, 64], [78, 0, -52], [12, 0, 88],
      ];
      const RING_AXIS = [
        [0.25, 1, 0], [1, 0.35, 0.2], [0, 1, 0.45], [0.6, 0.8, -0.3], [-0.4, 1, 0.3], [0.2, 0.5, 1],
      ];
      const spinParts = [];
      for (let k = 0; k < Math.max(1, Math.min(6, rankIdx)); k++) {
        const t = RING_TILT[k];
        spinParts.push({
          wire: [{ geo: new THREE.TorusGeometry(1.7 + k * 0.14, 0.02, 4, 28),
            rot: [t[0] * DEG, t[1] * DEG, t[2] * DEG] }],
          pivot: [0, 1.6, 0], axis: RING_AXIS[k],
          speed: (k % 2 ? -1 : 1) * (0.22 + k * 0.07),
        });
      }
      // EXP ladder — up to 8 rungs climbing the tether (deck → dais underside)
      const expFrac = R && R.expForLevel ? Math.max(0, Math.min(1, R.expInLevel / R.expForLevel)) : 0.35;
      const rungs = Math.round(expFrac * 8);
      for (let k = 0; k < rungs; k++) {
        wire.push({ geo: B(0.34, 0.028, 0.028), pos: [0, -2.35 + k * 0.27, 0] });
      }
      // achievement shards — one small octahedron per unlocked achievement, on
      // their own layer: slow COUNTER-orbit + a gentle vertical bob, so the
      // constellation drifts against the core's spin.
      const shards = Math.min(60, R ? (R.achCount || 0) : 9);
      if (shards) {
        const shardWire = [];
        for (let k = 0; k < shards; k++) {
          const a = (k / shards) * Math.PI * 2;
          const rr = 2.15 + (k % 3) * 0.1;
          shardWire.push({ geo: new THREE.OctahedronGeometry(0.07, 0),
            pos: [Math.cos(a) * rr, Math.sin(k * 2.399) * 0.22, Math.sin(a) * rr] });
        }
        spinParts.push({ wire: shardWire, pivot: [0, 1.6, 0], speed: -0.16, bob: 0.09 });
      }
      // attribute radar — 6 spokes + value polygon etched on the dais top.
      // raw line-segment positions (not EdgesGeometry) → returned as rawWire.
      const attrs = R && R.attrs ? R.attrs : { STR: 40, AGI: 40, INT: 40, WIS: 40, VIT: 40, CRE: 40 };
      const ORDER = ['STR', 'AGI', 'INT', 'WIS', 'VIT', 'CRE'];
      const radar = [], vtx = [];
      const RY = 0.115;                                     // just above the dais face
      for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + k * Math.PI / 3;
        const v = Math.max(0, Math.min(100, attrs[ORDER[k]] || 10));
        const r = 0.35 + 1.1 * (v / 100);
        vtx.push([Math.cos(a) * r, RY, Math.sin(a) * r]);
        // spoke: dais centre → full-scale tip (constant, the static "graph paper")
        radar.push(0, RY, 0, Math.cos(a) * 1.45, RY, Math.sin(a) * 1.45);
      }
      for (let k = 0; k < 6; k++) {                         // value polygon loop
        const p = vtx[k], q = vtx[(k + 1) % 6];
        radar.push(p[0], p[1], p[2], q[0], q[1], q[2]);
      }
      return {
        wire,
        solid: [
          { geo: new THREE.IcosahedronGeometry(1.32, 0), pos: [0, 1.6, 0] },
          { geo: new THREE.CylinderGeometry(1.5, 1.7, 0.18, 6), pos: [0, 0, 0] },
        ],
        spinParts,
        rawWire: new Float32Array(radar),
        labelY: 3.4, pickR: 2.2, spin: true,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// entrance torii — the deck's gate, planted on the approach axis so the boot
// camera descends THROUGH it toward the monument. Pure scenery: no label, no
// pick sphere; solids paint BG so the gate occludes what stands behind it.
// Refined anatomy: inward-leaning pillars (2°), kasagi with upturned ends,
// shimaki below it, gakuzuka centre strut, protruding nuki tie, base stones.
// ---------------------------------------------------------------------------
function buildTorii() {
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const LEAN = 2 * DEG;
  const wire = [
    { geo: new THREE.CylinderGeometry(0.13, 0.16, 4.1, 6), pos: [-1.85, 2.05, 0], rot: [0, 0, -LEAN] },
    { geo: new THREE.CylinderGeometry(0.13, 0.16, 4.1, 6), pos: [1.85, 2.05, 0], rot: [0, 0, LEAN] },
    { geo: B(4.6, 0.24, 0.3), pos: [0, 4.32, 0] },                                  // 笠木 center
    { geo: B(0.62, 0.22, 0.3), pos: [-2.55, 4.42, 0], rot: [0, 0, 10 * DEG] },      // 笠木 upturned ends
    { geo: B(0.62, 0.22, 0.3), pos: [2.55, 4.42, 0], rot: [0, 0, -10 * DEG] },
    { geo: B(4.15, 0.17, 0.24), pos: [0, 4.05, 0] },                                // 島木
    { geo: B(0.2, 0.55, 0.16), pos: [0, 3.66, 0] },                                 // 額束
    { geo: B(4.0, 0.15, 0.2), pos: [0, 3.28, 0] },                                  // 貫 (protrudes)
    { geo: B(0.46, 0.24, 0.46), pos: [-1.88, 0.12, 0] },                            // base stones
    { geo: B(0.46, 0.24, 0.46), pos: [1.88, 0.12, 0] },
  ];
  const solid = wire.map(p => ({ geo: p.geo.clone(), pos: p.pos, rot: p.rot }));
  const line = new THREE.LineSegments(mergeEdges(wire),
    new THREE.LineBasicMaterial({ color: 0x2f7d78, transparent: true, opacity: 0.62 }));
  const occ = new THREE.Mesh(mergeSolid(solid), occluderMaterial());
  const g = new THREE.Group();
  g.add(occ); g.add(line);
  // approach axis, BETWEEN the morning station and the monument — the south
  // camera (overview / DISCIPLINE stop) reads the deck THROUGH the gate, and
  // the walk order tells the story: morning ritual → gate → the 90 days.
  // (z −16.5 was tried first: the overview's steep look-down clips anything
  //  that far south below the frame — the gate was simply never on screen.)
  g.position.set(0, 0, -9.2);
  return { group: g, line, occ };
}

// ---------------------------------------------------------------------------
// TRADING chart — dynamic candle buffers. While the station is selected
// (hover-lock or HUD focus → st.emph ≈ 1) the tape WALKS: the newest candle
// grows from its open toward a rolled target, then the tape slides left and
// the next leg begins — 升 → 跌 → 升 rhythm with jittered magnitudes.
// Wire = 12 box edges + 2 wicks per candle; occluder = 12 tris per body, both
// rewritten into preallocated DynamicDrawUsage buffers (6 candles → tiny).
// ---------------------------------------------------------------------------
const CHART_HW = 0.16;
function chartWrite(ch) {
  const wp = ch.line.geometry.attributes.position.array;
  const sp = ch.occ.geometry.attributes.position.array;
  let wi = 0, si = 0;
  for (let n = 0; n < ch.candles.length; n++) {
    const cd = ch.candles[n];
    const x = ch.slots[n] + (ch.slide || 0);
    let yLo = Math.min(cd.o, cd.c), yHi = Math.max(cd.o, cd.c);
    if (yHi - yLo < 0.02) { yLo -= 0.01; yHi += 0.01; }          // doji still reads
    const c8 = [
      [x - CHART_HW, yLo, -CHART_HW], [x + CHART_HW, yLo, -CHART_HW],
      [x + CHART_HW, yLo, CHART_HW], [x - CHART_HW, yLo, CHART_HW],
      [x - CHART_HW, yHi, -CHART_HW], [x + CHART_HW, yHi, -CHART_HW],
      [x + CHART_HW, yHi, CHART_HW], [x - CHART_HW, yHi, CHART_HW],
    ];
    for (const e of PILLAR_EDGES) {
      const a = c8[e[0]], b = c8[e[1]];
      wp[wi++] = a[0]; wp[wi++] = a[1]; wp[wi++] = a[2];
      wp[wi++] = b[0]; wp[wi++] = b[1]; wp[wi++] = b[2];
    }
    wp[wi++] = x; wp[wi++] = yHi; wp[wi++] = 0; wp[wi++] = x; wp[wi++] = cd.hi; wp[wi++] = 0;
    wp[wi++] = x; wp[wi++] = yLo; wp[wi++] = 0; wp[wi++] = x; wp[wi++] = cd.lo; wp[wi++] = 0;
    for (const f of PILLAR_FACES) {
      for (const vi of f) { const v = c8[vi]; sp[si++] = v[0]; sp[si++] = v[1]; sp[si++] = v[2]; }
    }
  }
  ch.line.geometry.attributes.position.needsUpdate = true;
  ch.occ.geometry.attributes.position.needsUpdate = true;
}
function chartUpdate(st, dt) {
  const ch = st.chart;
  if (ch.slide > 0) { ch.slide = Math.max(0, ch.slide - dt * 2.2); chartWrite(ch); }
  if (st.emph < 0.6) { ch.forming = false; return; }   // tape walks only while selected
  if (!ch.forming) {
    ch.legIdx = ((ch.legIdx ?? -1) + 1) % 3;           // 升 → 跌 → 升
    const dir = [1, -1, 1][ch.legIdx];
    const o = ch.candles[ch.candles.length - 1].c;
    ch.target = Math.min(3.1, Math.max(0.7, o + dir * (0.35 + Math.random() * 0.55)));
    ch.candles.push({ o, c: o, hi: o + 0.03, lo: o - 0.03 });
    if (ch.candles.length > ch.slots.length) { ch.candles.shift(); ch.slide = 0.5; }
    ch.t = 0; ch.forming = true;
  }
  ch.t += dt / 1.15;
  const cur = ch.candles[ch.candles.length - 1];
  const k = Math.min(1, ch.t), e = k * k * (3 - 2 * k);
  cur.c = cur.o + (ch.target - cur.o) * e + Math.sin(k * 16) * 0.045 * (1 - k);
  cur.hi = Math.min(3.3, Math.max(cur.hi, Math.max(cur.o, cur.c) + 0.05));
  cur.lo = Math.max(0.38, Math.min(cur.lo, Math.min(cur.o, cur.c) - 0.05));
  chartWrite(ch);
  if (k >= 1) ch.forming = false;
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
    baseTheta: -90 * DEG, basePhi: 58 * DEG, baseRadius: 27,
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

  // ===== entrance torii (deck gate on the approach axis) =====================
  const torii = buildTorii();
  scene.add(torii.group);

  // ===== atmospheric dust motes (desktop, motion-on only) ====================
  // GPU-drifted THREE.Points volume; excluded from the bloom pass (layer 0),
  // paused with the loop on visibility-hidden, absent under mobile/reduced.
  const dust = (!isMobile && !reducedMotion) ? buildDust(renderer) : null;
  if (dust) scene.add(dust);

  // ===== district stations ===================================================
  const occMat = occluderMaterial();
  const stations = [];
  const pickMeshes = [];
  for (const def of mock.stations) {
    const s = stationParts(def.id, mock.rpg);
    const line = new THREE.LineSegments(mergeEdges(s.wire),
      new THREE.LineBasicMaterial({ color: 0x6d6a1c, transparent: true, opacity: reducedMotion ? 0.9 : 0 }));
    if (bloomOn) line.layers.enable(BLOOM_LAYER);   // every station feeds a soft holo-glow;
    const group = new THREE.Group();                 // hover brightens the colour → glow wakes up
    let occ = null;
    if (s.solid && s.solid.length) { occ = new THREE.Mesh(mergeSolid(s.solid), occMat); group.add(occ); }
    group.add(line);
    // station hue → idle (dimmed, slightly desaturated) / hot (brightened) pair
    const hue = new THREE.Color(STATION_HUE[def.id] || 0xEFE000);
    const lum = hue.r * 0.299 + hue.g * 0.587 + hue.b * 0.114;
    const colIdle = hue.clone().lerp(new THREE.Color(lum, lum, lum), 0.30).multiplyScalar(0.52);
    const colHot = hue.clone().lerp(new THREE.Color(1, 1, 1), 0.18);
    // translucent volume face over the occluder — the silhouette reads as a BODY,
    // not just edges (shares the occluder geometry; disposed once via occ)
    if (occ) {
      const fill = new THREE.Mesh(occ.geometry, new THREE.MeshBasicMaterial({
        color: hue, transparent: true, opacity: FILL_OPACITY,
        depthWrite: false, side: THREE.DoubleSide,
      }));
      fill.userData.isFill = true;
      group.add(fill);
    }
    // optional toggleable sub-mesh (e.g. TRADING's wax seal): separate line, own
    // material, hidden until a flag turns it on. Same family, slightly brighter.
    let seal = null;
    if (s.sealWire && s.sealWire.length) {
      seal = new THREE.LineSegments(mergeEdges(s.sealWire),
        new THREE.LineBasicMaterial({ color: 0xd8c24a, transparent: true, opacity: 0 }));
      seal.visible = false;
      if (bloomOn) seal.layers.enable(BLOOM_LAYER);      // glows while shown
      group.add(seal);
    }
    // optional self-animating sub-parts (MORNING's sunrise core, SYSTEM's rank
    // rings + achievement shards): each entry becomes its own group rotating
    // about its own axis at its own speed (+ optional vertical bob), pivoted at
    // `pivot`. Shares the station's line material so hover emphasis drives all.
    let spinSubs = null;
    if (s.spinParts && s.spinParts.length) {
      spinSubs = s.spinParts.map(sp => {
        const sub = new THREE.Group();
        sub.add(new THREE.LineSegments(mergeEdges(sp.wire), line.material));
        if (sp.solid && sp.solid.length) sub.add(new THREE.Mesh(mergeSolid(sp.solid), occMat));
        const pv = sp.pivot || [0, 0, 0];
        sub.position.set(pv[0], pv[1], pv[2]);
        group.add(sub);
        return {
          sub, baseY: pv[1],
          axis: new THREE.Vector3(...(sp.axis || [0, 1, 0])).normalize(),
          speed: sp.speed || 0.5, bob: sp.bob || 0,
          phase: Math.random() * Math.PI * 2,
        };
      });
    }
    // optional raw line-segment set (e.g. SYSTEM's attribute radar) — positions
    // authored directly, not via EdgesGeometry; shares the station material and
    // spins in lockstep with the main silhouette (see the frame loop).
    let extra = null;
    if (s.rawWire && s.rawWire.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(s.rawWire, 3));
      extra = new THREE.LineSegments(g, line.material);
      group.add(extra);
    }
    // optional dynamic candle chart (TRADING) — preallocated buffers, tape
    // walks in chartUpdate while the station is selected
    let chart = null;
    if (s.chart) {
      const nSlots = s.chart.slots.length;
      const wgeo = new THREE.BufferGeometry();
      wgeo.setAttribute('position',
        new THREE.BufferAttribute(new Float32Array(nSlots * 28 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const sgeo = new THREE.BufferGeometry();
      sgeo.setAttribute('position',
        new THREE.BufferAttribute(new Float32Array(nSlots * 36 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      chart = { ...s.chart, slide: 0, forming: false,
        line: new THREE.LineSegments(wgeo, line.material), occ: new THREE.Mesh(sgeo, occMat) };
      chart.line.frustumCulled = chart.occ.frustumCulled = false;   // buffer grows past first-frame bounds
      if (bloomOn) chart.line.layers.enable(BLOOM_LAYER);
      group.add(chart.occ); group.add(chart.line);
      chartWrite(chart);
    }
    const L = STATION_LAYOUT[def.id] || { x: 0, y: 0, z: 0, districtId: null };
    group.position.set(L.x, L.y || 0, L.z);
    // face the silhouette radially OUTWARD (authored facades look down +z): the
    // district camera sits beyond the ring looking inward, so the centered slot
    // reads frontal and edge slots read as 3/4 views. Directional monuments
    // (e.g. the FINANCE bank facade) are illegible edge-on without this.
    if (L.az != null) group.rotation.y = (90 - L.az) * DEG;
    const pick = new THREE.Mesh(new THREE.SphereGeometry(s.pickR, 8, 6),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    pick.position.y = s.labelY * 0.5;
    pick.userData.id = def.id;
    group.add(pick); pickMeshes.push(pick);
    const anchor = new THREE.Object3D(); anchor.position.y = s.labelY; group.add(anchor);
    scene.add(group);
    stations.push({ id: def.id, group, mat: line.material, line, occ, seal, spinSubs, extra, chart, anchor, def, spin: !!s.spin, emph: 0, emphT: 0, colIdle, colHot, hueHex: '#' + hue.getHexString(), districtId: L.districtId || null });
  }

  // districts that actually have a station this batch → the scroll tour's stops.
  // Reserved districts (no instantiated slot yet, e.g. CREED) never become a
  // stop, so the camera never frames an empty sector.
  const _instDistricts = new Set(stations.map(s => s.districtId).filter(Boolean));
  const TOUR = ['__overview', ...DISTRICTS.map(d => d.id).filter(id => _instDistricts.has(id))];

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
      uniforms: { tBloom: { value: null }, uStrength: { value: BLOOM_STRENGTH } },
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
    el.style.setProperty('--sthue', (st.hueHex || '#EFE000'));   // label follows station hue
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

  // ===== camera resolve — district tour ======================================
  // cam.scroll (0..1, driven by Lenis) eases the camera across TOUR: an OVERVIEW
  // pose first, then each instantiated district's framing pose. Adjacent stops
  // are blended — position orbits the monument at a stop-specific azimuth / phi /
  // radius, and the look-at point lerps from the monument toward the district
  // centroid. Drag / idle-drift / boot-intro perturb on top. Reduced-motion has
  // no Lenis → scroll stays 0 → a static overview (no district fly).
  const _p = new THREE.Vector3(), _tv = new THREE.Vector3();
  function stopParams(id) {
    if (id === '__overview' || !DISTRICT_INFO[id]) return { az: cam.baseTheta, phi: cam.basePhi, r: cam.baseRadius, lx: 0, lz: 0 };
    const info = DISTRICT_INFO[id];
    // camera sits beyond the district (same azimuth, pulled back) looking inward,
    // so the cluster reads in the foreground with the monument as the backdrop.
    return { az: info.az * DEG, phi: info.phi * DEG, r: info.r + 12, lx: info.cx * 0.6, lz: info.cz * 0.6 };
  }
  function resolveDeck(outPos, outTarget) {
    const idleTh = Math.sin(cam._t * 0.209) * 2 * DEG * cam.idleW;   // 2π/30 period
    const idlePh = Math.sin(cam._t * 0.170) * 1.2 * DEG * cam.idleW; // 2π/37 period
    const s = clamp(cam.scroll, 0, 1) * (TOUR.length - 1);
    const i = Math.floor(s), f = s - i;
    const A = stopParams(TOUR[i]);
    const Bp = stopParams(TOUR[Math.min(i + 1, TOUR.length - 1)]);
    const baseTh = lerpAngle(A.az, Bp.az, f);
    const basePh = lerp(A.phi, Bp.phi, f);
    const baseR = lerp(A.r, Bp.r, f);
    const lx = lerp(A.lx, Bp.lx, f), lz = lerp(A.lz, Bp.lz, f);
    const theta = baseTh + cam.dragYaw + idleTh - cam.intro * 12 * DEG;
    const phi = clamp(basePh + cam.dragPitch + idlePh - cam.intro * 26 * DEG, 12 * DEG, 80 * DEG);
    const r = baseR + cam.intro * 18;
    outTarget.set(target.x + lx, target.y, target.z + lz);
    outPos.set(                                        // orbit the monument; look at the (shifted) target
      target.x + r * Math.sin(phi) * Math.cos(theta),
      target.y + r * Math.cos(phi),
      target.z + r * Math.sin(phi) * Math.sin(theta),
    );
    return outPos;
  }

  // ===== focus / return (quadratic-bezier arc + banking roll) ================
  function focusStation(id) {
    const st = stations.find(s => s.id === id); if (!st) return;
    cam.mode = 'focus';
    const sp = st.group.position;
    const outward = new THREE.Vector3(sp.x, 0, sp.z).normalize();
    fp.p0.copy(camera.position);
    fp.t0.set(target.x, target.y, target.z);
    fp.p1.set(sp.x + outward.x * 5.2, 4.6 + sp.y * 0.9, sp.z + outward.z * 5.2);   // respect station elevation
    fp.t1.set(sp.x, 1.5 + sp.y, sp.z);
    // HUD-aware framing: the panel claims the right ~560px, so nudge the
    // look-at toward camera-RIGHT — the monument then reads centered in the
    // remaining LEFT viewport instead of hiding behind the panel (owner
    // 2026-07-08 green-box spec). Angle derived from panel/viewport ratio.
    const hudW = opts.hudWidth ? opts.hudWidth() : 0;
    if (hudW > 0) {
      const W = renderer.domElement.clientWidth || window.innerWidth || 1;
      const frac = Math.min(0.16, (hudW / W) * 0.375);          // fraction of hFOV to shift
      const hFov = 2 * Math.atan(Math.tan(camera.fov * 0.5 * DEG) * camera.aspect);
      const dir = new THREE.Vector3().subVectors(fp.t1, fp.p1);
      const dist = dir.length(); dir.normalize();
      const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
      fp.t1.addScaledVector(right, Math.tan(hFov * frac) * dist);
    }
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
    const dest = new THREE.Vector3(), destT = new THREE.Vector3();
    resolveDeck(dest, destT);                            // district-aware home pose
    if (reducedMotion || !gsap) { cam.mode = 'deck'; opts.onReturnDone && opts.onReturnDone(); return; }
    fp.p0.copy(camera.position);
    fp.t0.copy(fp.t1);
    fp.p1.copy(dest);
    fp.t1.copy(destT);
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
      resolveDeck(_p, _tv); camera.position.copy(_p);
      _tv.x += cam.dragYaw * 1.2;                        // tiny yaw-follow parallax
      camera.lookAt(_tv);
      roll = cam.intro * 1.4 * DEG;
    }
    if (roll) camera.rotateZ(roll);

    pillars.mat.uniforms.uTime.value = t;
    if (dust) dust.material.uniforms.uTime.value = t;
    const breathe = 0.5 + 0.5 * Math.sin(t * 2.2);
    beacon.line.material.opacity = pillars.mat.uniforms.uReveal.value * (0.35 + 0.5 * breathe);
    for (const st of stations) {
      if (st.spin) {
        st.line.rotation.y += dt * 0.35;
        if (st.occ) st.occ.rotation.y = st.line.rotation.y;
        if (st.extra) st.extra.rotation.y = st.line.rotation.y;
      }
      if (st.spinSubs) for (const sp of st.spinSubs) {
        sp.sub.rotateOnAxis(sp.axis, dt * sp.speed);
        if (sp.bob) sp.sub.position.y = sp.baseY + Math.sin(t * 1.3 + sp.phase) * sp.bob;
      }
      if (st.chart) chartUpdate(st, dt);
      st.emph = lerp(st.emph, st.emphT, 1 - Math.pow(0.0001, dt));
      st.mat.color.copy(st.colIdle).lerp(st.colHot, st.emph);   // hue = information layer
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
    compMat.uniforms.uStrength.value = BLOOM_STRENGTH + cam.bloomPulse * 1.7;
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
    const gu = grid.material.uniforms;
    if (reducedMotion || !gsap) {
      cam.intro = 0; pillars.mat.uniforms.uReveal.value = 1;
      gu.uReveal.value = 1; gu.uScan.value = 1;
      for (const st of stations) st.mat.opacity = 0.9;
      if (dust) dust.material.uniforms.uOpacity.value = DUST_OPACITY;
      renderOnce(); return;
    }
    gsap.killTweensOf(cam);                 // kill the pre-drift, take over the descent
    gu.uReveal.value = 0; gu.uScan.value = 0;
    // showstopper (~1.7s, ≤2.6s): grid ink-fades then SCAN-BUILDS radially from
    // the monument outward; pillars rise with a back-out overshoot staggered by
    // distance (aOrder, baked in the shader); stations + dust settle behind it.
    const tl = gsap.timeline();
    tl.to(cam, { intro: 0, duration: 1.5, ease: 'power2.inOut' }, 0)
      .to(gu.uReveal, { value: 1, duration: 0.5, ease: 'power2.out' }, 0.05)
      .to(gu.uScan, { value: 1, duration: 1.15, ease: 'power2.inOut' }, 0.05)
      .to(pillars.mat.uniforms.uReveal, { value: 1, duration: 1.35, ease: 'power2.out' }, 0.35)
      .to(stations.map(s => s.mat), { opacity: 0.6, duration: 0.6, ease: 'power1.out' }, 0.7);
    if (dust) tl.to(dust.material.uniforms.uOpacity, { value: DUST_OPACITY, duration: 1.2, ease: 'power1.out' }, 0.4);
  }

  // ===== public setters ======================================================
  function setScroll(p) { cam.scroll = clamp(p, 0, 1); noteInput(); }
  // jump the tour to a district's framing pose (or 'overview'). Additive nav
  // hook for later batches (e.g. district markers); the scroll tour already
  // drives this continuum, so main.js need not call it. Eases via cam.scroll so
  // it shares one code path with the Lenis tour + returnDeck. reduced-motion /
  // no-gsap → instant. Unknown id is a no-op.
  function frameDistrict(id) {
    const idx = (id === 'overview' || id === '__overview') ? 0 : TOUR.indexOf(id);
    if (idx < 0) return;
    const p = TOUR.length > 1 ? idx / (TOUR.length - 1) : 0;
    noteInput();
    if (reducedMotion || !gsap) { cam.scroll = p; if (!running) renderOnce(); return; }
    gsap.killTweensOf(cam, 'scroll');
    gsap.to(cam, { scroll: p, duration: 0.9, ease: 'power2.inOut' });
  }
  function clearDistrict() { frameDistrict('overview'); }
  function applyDrag(dx, dy) {
    cam.dragYawT = clamp(cam.dragYawT - dx * 0.0022, -15 * DEG, 15 * DEG);
    cam.dragPitchT = clamp(cam.dragPitchT - dy * 0.0018, -15 * DEG, 15 * DEG);
    noteInput();
  }
  function setPointer(x, y) { ndc.set((x / W0()) * 2 - 1, -(y / H0()) * 2 + 1); noteInput(); }
  function highlight(id) {
    // all lines live on the bloom layer permanently — the hover distinction now
    // comes from colour brightness (colHot feeds the bright pass harder)
    for (const st of stations) st.emphT = st.id === id ? 1 : 0;
  }
  function pulseBloom() { cam.bloomPulse = 1; }
  // TRADING wax-seal: materialize / dissolve the seal sub-mesh on the monument.
  // Drives the same state the HUD shows (盘前封盘). Soft fade + a one-time bloom
  // pulse when turning ON (motion allowing); reduced-motion → instant toggle.
  function setTradingSealed(on, pulse = true) {
    const st = stations.find(s => s.id === 'TRADING');
    if (!st || !st.seal) return;
    const seal = st.seal;
    if (reducedMotion || !gsap) {
      seal.visible = !!on; seal.material.opacity = on ? 0.95 : 0;
      if (!running) renderOnce();
      return;
    }
    gsap.killTweensOf(seal.material);
    if (on) {
      seal.visible = true;
      gsap.to(seal.material, { opacity: 0.95, duration: 0.5, ease: 'power2.out' });
      if (pulse) pulseBloom();
    } else {
      gsap.to(seal.material, { opacity: 0, duration: 0.35, ease: 'power2.in',
        onComplete: () => { seal.visible = false; } });
    }
  }
  // magnetic-snap helpers for the Lenis tour (main.js owns Lenis): the nearest
  // tour stop as a 0..1 scroll fraction, and its id (for district annunciation).
  function nearestStop() {
    const n = TOUR.length; if (n <= 1) return 0;
    return Math.round(clamp(cam.scroll, 0, 1) * (n - 1)) / (n - 1);
  }
  function nearestStopId() {
    const n = TOUR.length; if (n <= 1) return TOUR[0];
    return TOUR[Math.round(clamp(cam.scroll, 0, 1) * (n - 1))];
  }
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
    if (dust) dust.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
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
    torii.line.geometry.dispose(); torii.line.material.dispose(); torii.occ.geometry.dispose(); torii.occ.material.dispose();
    if (dust) { dust.geometry.dispose(); dust.material.dispose(); }
    for (const st of stations) { st.line.geometry.dispose(); st.mat.dispose(); if (st.occ) st.occ.geometry.dispose(); if (st.seal) { st.seal.geometry.dispose(); st.seal.material.dispose(); } if (st.spinSubs) st.spinSubs.forEach(sp => sp.sub.children.forEach(c => c.geometry.dispose())); if (st.extra) st.extra.geometry.dispose(); if (st.chart) { st.chart.line.geometry.dispose(); st.chart.occ.geometry.dispose(); } st.group.children.forEach(c => { if (c.userData && c.userData.isFill) c.material.dispose(); }); }
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
    frameDistrict, clearDistrict, pickPillar, setTodayScore,
    setTradingSealed, nearestStop, nearestStopId,
    get mode() { return cam.mode; }, get hovered() { return hovered; },
    get pillarHovered() { return pillarHovered; },
    get districts() { return TOUR.slice(1); },
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
  // shared reveal easing. revRaw = linear per-pillar progress, staggered by
  // distance via aOrder (center rises first). revEase = back-out overshoot for
  // the height rise (settles to exactly 1 at progress 1). reveal = smoothstepped
  // progress for alpha. Line AND occluder call revEase for their y-scale so the
  // hidden-line depth stays consistent through the overshoot.
  const REVEAL = /* glsl */`
    float revRaw(float ord){ return clamp((uReveal - ord*0.55)/0.45, 0.0, 1.0); }
    float revEase(float ord){ float x = revRaw(ord); float c1 = 1.70158, c3 = c1 + 1.0; float xm = x - 1.0; return 1.0 + c3*xm*xm*xm + c1*xm*xm; }
    float reveal(float ord){ return smoothstep(0.0, 1.0, revRaw(ord)); }`;

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uReveal, uTime },
    vertexShader: /* glsl */`
      attribute float aScore; attribute float aOrder; attribute float aToday; attribute float aGhost;
      uniform float uReveal;
      varying float vScore; varying float vToday; varying float vGhost; varying float vRev; varying float vY;
      ${REVEAL}
      void main(){
        vec3 p = position; p.y = position.y * revEase(aOrder);
        vScore = aScore; vToday = aToday; vGhost = aGhost; vRev = reveal(aOrder); vY = position.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      }`,
    fragmentShader: /* glsl */`
      precision mediump float;
      uniform float uTime;
      varying float vScore; varying float vToday; varying float vGhost; varying float vRev; varying float vY;
      void main(){
        vec3 dim = vec3(0.12,0.13,0.08);
        vec3 hot = vec3(0.82,0.80,0.06);
        vec3 pcol = mix(dim, hot, vScore*vScore*0.55 + vScore*0.45);
        float breathe = 0.5 + 0.5*sin(uTime*2.2);
        pcol += vToday * (0.2 + 0.6*breathe) * vec3(0.95,0.92,0.35);
        // vertical gradient: warmer & brighter near the base, dissolving upward
        // (skips ghost stubs) so the field reads lit rather than flat.
        float lit = (1.0 - vGhost) * exp(-vY * 0.55);
        pcol += lit * 0.12 * vec3(1.0, 0.92, 0.32);
        float pa = 0.32 + 0.55*vScore + vToday*0.4*breathe + lit*0.10;
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
      void main(){ vec3 p = position; p.y = position.y * revEase(aOrder);
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
// grid floor — one LineSegments on a ShaderMaterial. Distance-faded: lines
// dissolve into the fog with radial distance (computed per-fragment from an
// interpolated world position, so long spans fade by true distance-to-origin,
// not by their far endpoints). Faint brighter central cross + base ring.
// reveal() drives two uniforms: uReveal (ink fade-in) and uScan (a radial
// wipe that SCAN-BUILDS the floor from the monument outward, hot leading edge).
// ============================================================================
function buildGrid() {
  const half = 26, step = 2, pos = [];
  for (let i = -half; i <= half; i += step) {
    pos.push(-half, 0, i, half, 0, i);
    pos.push(i, 0, -half, i, 0, half);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uReveal: { value: 0 }, uScan: { value: 0 }, uMaxR: { value: half },
      uColor: { value: new THREE.Color(0x2a4a48) }, uHot: { value: new THREE.Color(0x38d9d0) },
    },
    vertexShader: /* glsl */`
      varying vec2 vXZ;
      void main(){ vXZ = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      precision mediump float;
      uniform float uReveal; uniform float uScan; uniform float uMaxR;
      uniform vec3 uColor; uniform vec3 uHot;
      varying vec2 vXZ;
      void main(){
        float d = length(vXZ);
        // radial distance fade — brighter near origin, gone before the hard edge
        float distFade = 1.0 - smoothstep(uMaxR*0.34, uMaxR*0.92, d);
        float nearBoost = smoothstep(uMaxR*0.55, 0.0, d);          // 0 far → 1 at origin
        // faint brighter central cross at the monument base (cyan-kissed)
        float xhair = max(smoothstep(0.28, 0.0, abs(vXZ.x)), smoothstep(0.28, 0.0, abs(vXZ.y))) * nearBoost;
        // faint ring hugging the monument footprint
        float ring = smoothstep(1.4, 0.0, abs(d - 10.0));
        // radial scan-build: front expands from origin; hot edge only while building
        float front = uScan * uMaxR * 1.12;
        float built = 1.0 - smoothstep(front, front + 2.6, d);
        float edge = smoothstep(2.4, 0.0, abs(d - front)) * step(0.001, uScan) * (1.0 - step(1.0, uScan));
        vec3 col = mix(uColor, uHot, clamp(xhair*0.6 + edge, 0.0, 1.0));
        float base = 0.56 + nearBoost*0.24 + xhair*0.40 + ring*0.22;
        float a = base * distFade * built * uReveal + edge * 0.5 * uReveal;
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
      }`,
  });
  return new THREE.LineSegments(g, m);
}

// ============================================================================
// atmospheric dust motes — a cheap GPU-drifted THREE.Points volume around the
// deck (dim yellow, some cyan; additive, size-attenuated). Drift + size are
// done in the vertex shader from uTime, so per-frame cost is one uniform write.
// Kept off the bloom layer; built only on desktop with motion enabled.
// ============================================================================
function buildDust(renderer) {
  const N = 460;
  const pos = new Float32Array(N * 3), size = new Float32Array(N),
    phase = new Float32Array(N), col = new Float32Array(N * 3);
  const YEL = [0.55, 0.50, 0.08], CYA = [0.10, 0.42, 0.40];
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 24;
    pos[i * 3 + 1] = 1.0 + Math.random() * 15.0;
    pos[i * 3 + 2] = (Math.random() * 2 - 1) * 24;
    size[i] = 1.0 + Math.random() * 2.2;
    phase[i] = Math.random() * Math.PI * 2;
    const c = Math.random() < 0.72 ? YEL : CYA;            // mostly yellow, some cyan
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
  g.setAttribute('aColor', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uOpacity: { value: 0 },
      uPixelRatio: { value: renderer ? renderer.getPixelRatio() : Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: /* glsl */`
      uniform float uTime; uniform float uPixelRatio;
      attribute float aSize; attribute float aPhase; attribute vec3 aColor;
      varying vec3 vColor; varying float vFade;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.60 + aPhase) * 0.6;
        p.y += sin(uTime * 0.42 + aPhase * 1.7) * 0.4;
        p.z += cos(uTime * 0.50 + aPhase * 1.3) * 0.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dist = max(0.001, -mv.z);
        gl_PointSize = clamp(aSize * uPixelRatio * (18.0 / dist), 1.0, 9.0);
        gl_Position = projectionMatrix * mv;
        vColor = aColor;
        vFade = smoothstep(3.0, 11.0, dist) * (1.0 - smoothstep(46.0, 72.0, dist));
      }`,
    fragmentShader: /* glsl */`
      precision mediump float;
      uniform float uOpacity; varying vec3 vColor; varying float vFade;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vColor, a * a * vFade * uOpacity);
      }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}
