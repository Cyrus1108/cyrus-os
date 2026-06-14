/* ════════════ 手机滑动切换 · swipe ════════════
   Two follow-finger surfaces (用户钦定「跟手 + 上一页被推走」):

   1. makeHudSwipe(viewId, opts) — single-pane HUD tab pager (Finance/Fitness/System).
      Drag the current body with the finger; on release past threshold the current
      pane slides out in the drag direction and the next tab slides in (single-pane
      track illusion — avoids re-rendering chart tabs mid-drag). Vertical gestures
      fall through to native scroll. reduced-motion → instant tab switch on flick.

   2. initTriCarousel() — the main-page 三栏 (课业/日语/交易). On mobile the .tri-grid
      becomes a native scroll-snap carousel (real two-pane peek for free); this only
      wires the dot indicator + dot-to-panel scrolling. */

function makeHudSwipe(viewId, opts){
  const view = document.getElementById(viewId);
  if(!view || typeof opts.go!=='function') return;
  const reduce = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches);
  const SKIP = { INPUT:1, TEXTAREA:1, SELECT:1 };
  let startX=0, startY=0, dx=0, dy=0, axis=null, body=null, width=0;

  const bodyEl = () => document.getElementById(opts.bodyId);
  function targetTab(dir){
    const tabs = opts.tabs(); const i = tabs.indexOf(opts.cur()) + dir;
    return (i>=0 && i<tabs.length) ? tabs[i] : null;
  }
  function finishSlide(){ body.style.transition=''; body.style.transform=''; body.classList.remove('hud-swiping'); }

  function settle(commitTab, dir){
    if(!body){ return; }
    if(commitTab){
      body.style.transition='transform .17s ease';
      body.style.transform = `translateX(${-dir*width}px)`;      // current exits in the drag direction
      let done=false;
      const onOut=()=>{
        if(done) return; done=true;
        body.removeEventListener('transitionend', onOut);
        opts.go(commitTab);                                       // re-render content into the same #body element
        body.style.transition='none';
        body.style.transform = `translateX(${dir*width}px)`;      // new content starts on the opposite side
        void body.offsetWidth;                                    // force reflow
        body.style.transition='transform .2s ease';
        body.style.transform='translateX(0)';
        let din=false;
        const onIn=()=>{ if(din) return; din=true; body.removeEventListener('transitionend', onIn); finishSlide(); };
        body.addEventListener('transitionend', onIn);
        setTimeout(onIn, 320);                                    // fallback if transitionend doesn't fire
      };
      body.addEventListener('transitionend', onOut);
      setTimeout(onOut, 260);
    } else {
      body.style.transition='transform .2s ease';
      body.style.transform='translateX(0)';
      let bk=false;
      const onBack=()=>{ if(bk) return; bk=true; body.removeEventListener('transitionend', onBack); finishSlide(); };
      body.addEventListener('transitionend', onBack);
      setTimeout(onBack, 320);
    }
  }

  view.addEventListener('touchstart', (e)=>{
    if(e.touches.length!==1 || (opts.guard && opts.guard()) || SKIP[(e.target.tagName||'').toUpperCase()]){ axis='lock'; return; }
    const t=e.touches[0]; startX=t.clientX; startY=t.clientY; dx=0; dy=0; axis=null;
    body=bodyEl(); width = body ? body.clientWidth : view.clientWidth;
  }, {passive:true});

  view.addEventListener('touchmove', (e)=>{
    if(axis==='lock' || !body) return;
    const t=e.touches[0]; dx=t.clientX-startX; dy=t.clientY-startY;
    if(axis===null){
      if(Math.abs(dx)<8 && Math.abs(dy)<8) return;                // wait for a clear intent
      axis = (Math.abs(dx) > Math.abs(dy)) ? 'x' : 'y';
      if(axis==='x' && !reduce()){ body.style.transition='none'; body.classList.add('hud-swiping'); }
    }
    if(axis==='x'){
      e.preventDefault();                                         // claim the horizontal gesture
      if(reduce()) return;                                        // reduced-motion: no live drag, just flick on release
      let d = dx;
      if(!targetTab(d<0?1:-1)) d = d*0.32;                        // rubber-band at the ends
      body.style.transform = `translateX(${d}px)`;
    }
  }, {passive:false});

  view.addEventListener('touchend', ()=>{
    if(axis!=='x' || !body){ axis=null; return; }
    const dir = dx<0 ? 1 : -1;
    const tgt = targetTab(dir);
    if(tgt && Math.abs(dx)>60){
      if(reduce()) opts.go(tgt); else settle(tgt, dir);
    } else if(!reduce()){
      settle(null, dir);
    }
    axis=null;
  }, {passive:true});
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
    grid.scrollTo({ left: grid.scrollLeft + r.left - g.left, behavior:'smooth' });
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
