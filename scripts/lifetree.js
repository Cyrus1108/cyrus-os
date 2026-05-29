/* Life-tree — WebGL particle dragon-blood tree for the Sterile/Endfield theme.
   100% procedural (no model files). Lazy-loaded by theme.js only when the
   sterile theme is active. Growth (seed → full umbrella canopy) is driven by
   the real The 90 progress (window.the90Day). Rendering auto-pauses when the
   tab is hidden, the chamber is scrolled off-screen, or the theme isn't sterile
   — so it costs nothing when not visible.  Exposes window.initLifeTree / destroyLifeTree. */

import * as THREE from 'three';

const N = 4200;
let renderer, scene, camera, group, geo, lgeo, pos, col, FX, THR, LEAF, pairs, lpos, seed;
let raf = 0, running = false, visible = true, io = null;
let p = 0.02, target = 0.2, pulseStart = -1e9;
const cBranch = new THREE.Color(0x9a6b4f), cLeaf = new THREE.Color(0x18B85f),
      cFront = new THREE.Color(0xFBFB45), cDim = new THREE.Color(0x0a160f), tmp = new THREE.Color();

function mulberry32(s){return function(){s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

function buildShape(){
  const rng = mulberry32(20260529);
  const nodes = [];
  const BY=-2.0, TT=-0.50, Cy=TT+0.05, Rh=1.85, Rv=0.64;
  // A) interwoven roots (recursive fork + per-segment twist) — grow first
  function root(x,y,z,dx,dy,dz,len,depth,t0,t1){
    const steps=Math.max(2,Math.floor(len*5)); let cx=x,cy=y,cz=z,ax=dx,ay=dy,az=dz;
    for(let i=1;i<=steps;i++){const u=i/steps;
      ax+=(rng()-.5)*0.32; az+=(rng()-.5)*0.32; ay-=rng()*0.06;
      const m=Math.hypot(ax,ay,az)||1; ax/=m;ay/=m;az/=m;
      cx+=ax*len/steps; cy+=ay*len/steps; cz+=az*len/steps;
      nodes.push({x:cx+(rng()-.5)*0.05,y:cy+(rng()-.5)*0.04,z:cz+(rng()-.5)*0.05,thr:t0+(t1-t0)*u,leaf:false});}
    if(depth<=0||len<0.16){for(let q=0;q<2;q++)nodes.push({x:cx+(rng()-.5)*0.15,y:cy-rng()*0.12,z:cz+(rng()-.5)*0.15,thr:t1,leaf:false});return;}
    const nb=2+(rng()<0.6?1:0);
    for(let b=0;b<nb;b++){const ox=ax+(rng()-.5)*1.35,oy=ay-rng()*0.35-0.05,oz=az+(rng()-.5)*1.35;const m=Math.hypot(ox,oy,oz)||1;
      root(cx,cy,cz,ox/m,oy/m,oz/m,len*(0.7+rng()*0.12),depth-1,t1,Math.min(0.12,t1+0.02));}}
  const ROOTS=13;
  for(let k=0;k<ROOTS;k++){const a=k/ROOTS*Math.PI*2+(rng()-.5)*0.55;
    const ox=Math.cos(a)*0.8,oy=-0.55-rng()*0.3,oz=Math.sin(a)*0.8;const m=Math.hypot(ox,oy,oz)||1;
    root((rng()-.5)*0.12,BY+0.06,(rng()-.5)*0.12,ox/m,oy/m,oz/m,0.55+rng()*0.3,3,0.0,0.05);}
  // B) thick flared trunk
  for(let i=0;i<470;i++){const t=Math.pow(rng(),0.7);const y=BY+(TT-BY)*t;
    const rr=(0.30*(1-0.5*t))+(0.10*Math.pow(1-t,2));
    const a=rng()*Math.PI*2,rad=Math.sqrt(rng())*rr;
    nodes.push({x:Math.cos(a)*rad,y,z:Math.sin(a)*rad,thr:0.07+0.17*t,leaf:false});}
  // C) radiating ribs
  for(let k=0;k<140;k++){const a=rng()*Math.PI*2, tr=0.30+0.70*rng();
    const ex=Math.cos(a)*Rh*tr, ez=Math.sin(a)*Rh*tr, ey=Cy+Rv*Math.cos(tr*Math.PI/2)*0.92;
    const cpx=ex*0.35, cpz=ez*0.35, cpy=TT+0.55, steps=6;
    for(let i=1;i<=steps;i++){const u=i/steps,iu=1-u;
      nodes.push({x:2*iu*u*cpx+u*u*ex, y:iu*iu*TT+2*iu*u*cpy+u*u*ey, z:2*iu*u*cpz+u*u*ez, thr:0.24+0.30*u, leaf:false});}}
  // D) dense thick umbrella canopy
  for(let k=0;k<2100;k++){const a=rng()*Math.PI*2, tr=Math.sqrt(rng());
    const r=Rh*tr, domeY=Cy+Rv*Math.cos(tr*Math.PI/2);
    const yy=domeY - rng()*0.34*(1-0.25*tr) + (rng()-.5)*0.09;
    nodes.push({x:Math.cos(a)*r+(rng()-.5)*0.09, y:yy, z:Math.sin(a)*r+(rng()-.5)*0.09, thr:0.5+0.45*tr, leaf:true});}
  // center vertically by mid-range
  let yMin=1e9,yMax=-1e9; nodes.forEach(n=>{if(n.y<yMin)yMin=n.y;if(n.y>yMax)yMax=n.y;});
  const my=(yMin+yMax)/2; nodes.forEach(n=>n.y-=my); seed=[0,BY-my,0];
  // resample to N
  FX=new Float32Array(N*3); THR=new Float32Array(N); LEAF=new Uint8Array(N);
  for(let i=0;i<N;i++){ const s=i<nodes.length?nodes[i]:nodes[(rng()*nodes.length)|0];
    FX[i*3]=s.x+(i<nodes.length?0:(rng()-.5)*.1); FX[i*3+1]=s.y+(i<nodes.length?0:(rng()-.5)*.1); FX[i*3+2]=s.z+(i<nodes.length?0:(rng()-.5)*.1);
    THR[i]=Math.min(1,s.thr); LEAF[i]=s.leaf?1:0; }
  // plexus pairs (nearest neighbour, windowed)
  pairs=[];
  for(let i=0;i<N;i++){let best=-1,bd=0.18;for(let j=i+1;j<Math.min(N,i+45);j++){
    const dx=FX[i*3]-FX[j*3],dy=FX[i*3+1]-FX[j*3+1],dz=FX[i*3+2]-FX[j*3+2];const d=dx*dx+dy*dy+dz*dz;if(d<bd){bd=d;best=j;}}if(best>=0)pairs.push(i,best);}
}

function dotTex(){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
  const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.4,'rgba(255,255,255,.5)');gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);}

function tick(t){
  // ease p toward real The-90 progress
  let day = 18; try{ if(typeof window.the90Day==='function'){ const d=window.the90Day(); if(isFinite(d)) day=Math.max(0,Math.min(90,d)); } }catch(e){}
  target = Math.max(0.02, day/90); p += (target - p) * 0.05;
  const st = document.getElementById('lt-state'); if(st) st.textContent = 'DAY ' + Math.round(day);
  const time = t*0.001;
  const pulse = Math.max(0, 1-((t-pulseStart)/1100));   // check-in energy flash
  for(let i=0;i<N;i++){
    const reveal = Math.max(0,Math.min(1,(p-THR[i])/0.08));
    const e = reveal*reveal*(3-2*reveal);
    const sj = Math.sin(time*0.7+i)*0.012;
    pos[i*3]   = seed[0]+(FX[i*3]  -seed[0])*e+sj;
    pos[i*3+1] = seed[1]+(FX[i*3+1]-seed[1])*e;
    pos[i*3+2] = seed[2]+(FX[i*3+2]-seed[2])*e+sj;
    if(reveal<=0) tmp.copy(cDim);
    else { const base = LEAF[i]?cLeaf:cBranch; tmp.copy(cFront).lerp(base,e); if(pulse>0) tmp.lerp(cFront, pulse*0.6); }
    col[i*3]=tmp.r; col[i*3+1]=tmp.g; col[i*3+2]=tmp.b;
  }
  geo.attributes.position.needsUpdate=true; geo.attributes.color.needsUpdate=true;
  for(let k=0;k<pairs.length;k+=2){const i=pairs[k],j=pairs[k+1],o=k*3;
    lpos[o]=pos[i*3];lpos[o+1]=pos[i*3+1];lpos[o+2]=pos[i*3+2];
    lpos[o+3]=pos[j*3];lpos[o+4]=pos[j*3+1];lpos[o+5]=pos[j*3+2];}
  lgeo.attributes.position.needsUpdate=true;
  group.rotation.y = time*0.16;
  renderer.render(scene,camera);
}

function loop(t){ if(!running) return; if(shouldRun()) tick(t); raf = requestAnimationFrame(loop); }
function shouldRun(){
  return !document.hidden && visible && document.documentElement.getAttribute('data-theme')==='sterile';
}

window.initLifeTree = function(){
  const host = document.getElementById('lifetree-chamber');
  const mount = document.getElementById('lifetree-mount');
  if(!host || !mount) return;
  if(renderer){ // already built — just resume
    if(!running){ running=true; raf=requestAnimationFrame(loop); }
    return;
  }
  buildShape();
  const W = host.clientWidth || 360, H = host.clientHeight || 300;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, W/H, 0.1, 100); camera.position.set(0,0,6.6);
  renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
  renderer.setSize(W,H); renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
  mount.appendChild(renderer.domElement);
  group = new THREE.Group(); scene.add(group);
  pos = new Float32Array(N*3); col = new Float32Array(N*3);
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos,3));
  geo.setAttribute('color', new THREE.BufferAttribute(col,3));
  const mat = new THREE.PointsMaterial({size:0.045, map:dotTex(), vertexColors:true, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending});
  group.add(new THREE.Points(geo,mat));
  lpos = new Float32Array((pairs.length/2)*6);
  lgeo = new THREE.BufferGeometry(); lgeo.setAttribute('position', new THREE.BufferAttribute(lpos,3));
  group.add(new THREE.LineSegments(lgeo, new THREE.LineBasicMaterial({color:0x34D399, transparent:true, opacity:0.05, blending:THREE.AdditiveBlending, depthWrite:false})));

  // pause when the chamber scrolls out of view (battery)
  try{ io = new IntersectionObserver((es)=>{ visible = es[0].isIntersecting; }, {threshold:0.01}); io.observe(host); }catch(e){ visible = true; }
  // keep canvas sized to the chamber — the chamber may not have its final width
  // at init (it just switched from display:none), which left the tree off-centre.
  try{ new ResizeObserver(()=>onResize()).observe(host); }catch(e){}
  requestAnimationFrame(onResize);
  window.addEventListener('resize', onResize);
  running = true; raf = requestAnimationFrame(loop);
  window.lifeTreePulse = function(){ pulseStart = performance.now(); if(running && raf===0){ raf=requestAnimationFrame(loop); } };
};

function onResize(){
  const host = document.getElementById('lifetree-chamber'); if(!host||!renderer) return;
  const W=host.clientWidth||360, H=host.clientHeight||300;
  renderer.setSize(W,H); camera.aspect=W/H; camera.updateProjectionMatrix();
}

window.destroyLifeTree = function(){
  running = false; if(raf) cancelAnimationFrame(raf); raf=0;
  // keep the built scene around (cheap) so re-entering sterile resumes instantly;
  // just stop the loop. (Full teardown not needed; rendering is gated by shouldRun.)
};

document.addEventListener('visibilitychange', ()=>{ if(running && shouldRun() && !raf){ raf=requestAnimationFrame(loop); } });
