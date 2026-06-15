/* System-wide ambient lighting for the Sterile theme.
   Injects three lightweight, pointer-events:none layers (a cursor "lens",
   a slow scan line, and a one-time boot sweep) and wires the pointer-follow.
   Everything is hidden via CSS in the cappa theme, so this is inert there.
   The page colour-wash + panel beams are pure CSS; this only handles the
   pieces that need DOM/JS. */

let _ambReady = false;

function _ambOnMove(e){
  if(typeof currentTheme === 'function' && currentTheme() !== 'sterile') return;
  const c = document.getElementById('amb-cursor');
  if(c) c.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
}

function initAmbient(){
  if(!_ambReady){
    // persistent layers (hidden in cappa via CSS)
    if(!document.getElementById('amb-cursor')){
      const cur = document.createElement('div'); cur.id = 'amb-cursor'; cur.setAttribute('aria-hidden','true');
      document.body.appendChild(cur);
    }
    if(!document.getElementById('amb-scan')){
      const scan = document.createElement('div'); scan.id = 'amb-scan'; scan.setAttribute('aria-hidden','true');
      document.body.appendChild(scan);
    }
    window.addEventListener('pointermove', _ambOnMove, { passive:true });
    // one-time "system boot" sweep on the FIRST sterile activation this session
    bootSweep();
    _ambReady = true;
  }
}

function bootSweep(){
  const s = document.createElement('div'); s.className = 'amb-boot'; s.setAttribute('aria-hidden','true');
  document.body.appendChild(s);
  setTimeout(() => s.remove(), 1300);
}

/* Set the ambient intensity (0..1) — driven by today's check-in completion.
   Higher = warmer/brighter whole-system glow. Called from the90.js. */
function setAmbientLevel(v){
  const x = Math.max(0, Math.min(1, v));
  document.documentElement.style.setProperty('--amb', (0.35 + 0.65 * x).toFixed(3));
}
