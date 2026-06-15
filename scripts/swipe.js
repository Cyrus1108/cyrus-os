/* ════════════ 手机滑动切换 · swipe ════════════
   Two follow-finger surfaces (用户钦定「跟手 + 上一页被推走 + 拖时能看到下一页」):

   1. makeHudSwipe(viewId, opts) — HUD tab carousel (Finance/Fitness/System).
      During the drag the current body translates with the finger AND the neighbor
      tab is rendered into a fixed ghost overlay that peeks in from the entering edge
      (true two-pane carousel). On release past threshold the neighbor finishes
      sliding in and becomes the real tab; otherwise it springs back. The ghost is
      id-stripped so it can never collide with the real DOM or trigger an id-based
      async chart draw. Vertical gestures fall through to native scroll;
      reduced-motion → instant tab switch on flick (no live peek).
        opts = { bodyId, tabs:()=>[...], cur:()=>tab, go:(tab), peek:(el,tab), guard:()=>bool }
          go(tab):  re-render the REAL body to `tab` (raw switch — no withViewTransition).
          peek(el,tab): render `tab`'s content into the ghost element `el` (no side effects;
                        ids are stripped by the pager afterwards).

   2. initTriCarousel() — main-page 三栏 (课业/日语/交易). CSS handles the scroll-snap
      carousel (real two-pane peek for free); this only wires the dot indicator. */

function makeHudSwipe(viewId, opts){
  const view = document.getElementById(viewId);
  if(!view || typeof opts.go!=='function' || typeof opts.peek!=='function') return;
  const reduce = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches);
  const SKIP = { INPUT:1, TEXTAREA:1, SELECT:1 };   // let native controls own their gesture; buttons/rows still swipe
  let startX=0, startY=0, dx=0, axis=null, body=null, width=0, baseRect=null, gen=0;
  let ghostC=null, ghostInner=null, ghostDir=0, ghostTab=null;

  const bodyEl = () => document.getElementById(opts.bodyId);
  function targetFor(dir){ const tabs=opts.tabs(); const i=tabs.indexOf(opts.cur())+dir; return (i>=0 && i<tabs.length) ? tabs[i] : null; }

  function destroyGhost(){ if(ghostC && ghostC.parentNode) ghostC.parentNode.removeChild(ghostC); ghostC=null; ghostInner=null; ghostTab=null; }
  function buildGhost(dir){
    destroyGhost(); ghostDir=dir;
    const tab=targetFor(dir); if(!tab || !baseRect) return;   // end of range → rubber-band, no ghost
    ghostC=document.createElement('div');
    ghostC.style.cssText=`position:fixed;left:${baseRect.left}px;top:${baseRect.top}px;width:${baseRect.width}px;height:${baseRect.height}px;overflow:hidden;pointer-events:none;z-index:1300;`;
    ghostInner=document.createElement('div');
    ghostInner.className=body.className;                        // inherit body padding/typography
    ghostInner.style.cssText='position:absolute;inset:0;overflow:hidden;will-change:transform;';
    try{ opts.peek(ghostInner, tab); }catch(e){ destroyGhost(); return; }
    ghostInner.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));   // no dup ids / no id-based async draws into the throwaway ghost
    ghostInner.style.transform=`translateX(${dir*width}px)`;   // park on the entering edge
    ghostC.appendChild(ghostInner);
    document.body.appendChild(ghostC);
    ghostTab=tab;
  }

  function resetBody(){ if(body){ body.style.transition=''; body.style.transform=''; body.style.willChange=''; } }

  view.addEventListener('touchstart', (e)=>{
    if(e.touches.length!==1 || (opts.guard && opts.guard()) || SKIP[(e.target.tagName||'').toUpperCase()]){ axis='lock'; return; }
    gen++;                                  // new gesture — stale settles bail out
    destroyGhost();
    const t=e.touches[0]; startX=t.clientX; startY=t.clientY; dx=0; axis=null; ghostDir=0;
    body=bodyEl();
    if(body){ body.style.transition='none'; body.style.transform=''; baseRect=body.getBoundingClientRect(); width=baseRect.width||view.clientWidth; }
  }, {passive:true});

  view.addEventListener('touchmove', (e)=>{
    if(axis==='lock' || !body) return;
    const t=e.touches[0]; dx=t.clientX-startX; const dy=t.clientY-startY;
    if(axis===null){
      if(Math.abs(dx)<8 && Math.abs(dy)<8) return;
      axis=(Math.abs(dx)>Math.abs(dy))?'x':'y';
      if(axis==='x' && !reduce()) body.style.willChange='transform';
    }
    if(axis!=='x') return;
    e.preventDefault();                     // claim the horizontal gesture
    if(reduce()) return;                    // no live peek under reduced-motion
    const dir = dx<0 ? 1 : -1;
    if(dir!==ghostDir) buildGhost(dir);     // engage, or rebuild on direction reversal
    let d = dx;
    if(!targetFor(dir)) d = d*0.32;         // rubber-band at the ends
    body.style.transform=`translateX(${d}px)`;
    if(ghostInner) ghostInner.style.transform=`translateX(${ghostDir*width + d}px)`;
  }, {passive:false});

  view.addEventListener('touchend', ()=>{
    if(axis!=='x' || !body){ axis=null; return; }
    const dir = dx<0 ? 1 : -1;
    const tgt = targetFor(dir);
    const myGen = gen;
    if(reduce()){ if(tgt && Math.abs(dx)>60) opts.go(tgt); axis=null; return; }
    const commit = !!tgt && Math.abs(dx)>60 && ghostInner && ghostTab===tgt;
    body.style.transition='transform .2s ease';
    body.style.transform = commit ? `translateX(${-dir*width}px)` : 'translateX(0)';
    if(ghostInner){ ghostInner.style.transition='transform .2s ease'; ghostInner.style.transform = commit ? 'translateX(0)' : `translateX(${ghostDir*width}px)`; }
    let done=false;
    const finish=()=>{
      if(done) return; done=true;
      if(myGen!==gen) return;               // a newer gesture took over — leave its state alone
      if(commit){ opts.go(tgt); }
      resetBody();
      destroyGhost();
    };
    (ghostInner || body).addEventListener('transitionend', finish, {once:true});
    setTimeout(finish, 240);
    axis=null;
  }, {passive:true});

  view.addEventListener('touchcancel', ()=>{ resetBody(); destroyGhost(); axis=null; }, {passive:true});
}

/* main-page 三栏 carousel dots (CSS does the scroll-snap; this only syncs the dots) */
function initTriCarousel(){
  const grid = document.querySelector('.tri-grid');
  const wrap = document.getElementById('tri-dots');
  if(!grid || !wrap) return;
  const panels = Array.from(grid.children);
  if(panels.length < 2){ wrap.innerHTML=''; return; }
  wrap.innerHTML = panels.map((_,i)=>`<button type="button" class="tri-dot${i===0?' active':''}" data-i="${i}" aria-label="第 ${i+1} 栏"></button>`).join('');
  const dots = Array.from(wrap.children);
  dots.forEach((d,i)=> d.addEventListener('click', ()=>{
    const r = panels[i].getBoundingClientRect(), g = grid.getBoundingClientRect();
    const sm = (window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches) ? 'auto' : 'smooth';
    grid.scrollTo({ left: grid.scrollLeft + r.left - g.left, behavior:sm });
  }));
  let raf=null;
  grid.addEventListener('scroll', ()=>{
    if(raf) return;
    raf = requestAnimationFrame(()=>{
      raf=null;
      const g = grid.getBoundingClientRect(), c = g.left + g.width/2;
      let idx=0, best=Infinity;
      panels.forEach((p,i)=>{ const r=p.getBoundingClientRect(); const dist=Math.abs((r.left+r.width/2)-c); if(dist<best){ best=dist; idx=i; } });
      dots.forEach((d,i)=> d.classList.toggle('active', i===idx));
    });
  }, {passive:true});
}
