/* Right-side NAVIGATION drawer — six module channels that slide in SAO-style.
   (Was the Markets/Inbox reference drawer; Markets retired → will move into the
   Trading Desk focus page later. Channels reuse the old button ids/onclick so
   rCalDot/rAiDot etc. keep working untouched.)
   SAO menu sounds: open cue on expand, select cue on choosing a channel. They
   honour the device-local mute flag (cyrus_sfx_muted) and only fire from the
   user gesture that opened/selected (so autoplay policy is satisfied). */

const _saoOpen = (() => { try { const a = new Audio('./sounds/sao-menu.mp3'); a.preload = 'auto'; a.volume = 0.5; return a; } catch (e) { return null; } })();
const _saoSel  = (() => { try { const a = new Audio('./sounds/sao-menu-select.mp3'); a.preload = 'auto'; a.volume = 0.55; return a; } catch (e) { return null; } })();
function _navMuted(){ try { return localStorage.getItem('cyrus_sfx_muted') === '1'; } catch (e) { return false; } }
function _navPlay(a){ if (!a || _navMuted()) return; try { a.currentTime = 0; a.play().catch(() => {}); } catch (e) {} }

function openDrawer(){
  const d = document.getElementById('drawer'); if (!d || d.classList.contains('open')) return;
  d._opener = document.activeElement;            // a11y: remember focus to restore on close
  d.classList.add('open');
  document.getElementById('drawer-backdrop').classList.add('open');
  d.setAttribute('aria-hidden', 'false');
  d.removeAttribute('inert');
  _navPlay(_saoOpen);                            // SAO menu-open cue
  d.querySelector('.drawer-close')?.focus();     // move focus into the drawer
}
function closeDrawer(){
  const d = document.getElementById('drawer'); if (!d) return;
  d.classList.remove('open');
  document.getElementById('drawer-backdrop').classList.remove('open');
  d.setAttribute('aria-hidden', 'true'); d.setAttribute('inert', '');
  d._opener?.focus?.(); d._opener = null;        // a11y: restore focus to the opener
}
/* Pick a channel: SAO select cue → the tapped slab EXPANDS IN PLACE into its HUD.
   A ghost rectangle starts at the slab's on-screen rect and grows (clip-path) to
   fullscreen; the real module HUD opens underneath as the morph completes, so it
   reads as "the slab unfolded into the screen". Reduced-motion → plain open. */
const _navOpenMap = { fin:'openFinance', fit:'openFitness', ai:'openAi', cal:'openCalendar', sys:'openSystem', motiv:'openMotivation' };
const _navIdMap   = { fin:'fin-btn', fit:'fit-btn', ai:'ai-btn', cal:'cal-btn', sys:'sys-btn', motiv:'motiv-btn' };
function navOpen(which){
  _navPlay(_saoSel);
  const fn = window[_navOpenMap[which]];
  const slab = document.getElementById(_navIdMap[which]);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  if (!reduce && slab && typeof fn === 'function') {
    const r = slab.getBoundingClientRect();
    const g = document.createElement('div');
    g.className = 'nav-morph-ghost';
    const start = `inset(${r.top}px ${Math.max(0, innerWidth - r.right)}px ${Math.max(0, innerHeight - r.bottom)}px ${r.left}px)`;
    g.style.clipPath = start; g.style.webkitClipPath = start;
    document.body.appendChild(g);
    closeDrawer();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      g.style.clipPath = 'inset(0px)'; g.style.webkitClipPath = 'inset(0px)';
    }));
    setTimeout(() => { try { fn(); } catch(e){} }, 300);   // real HUD opens as the morph fills the screen
    setTimeout(() => g.classList.add('fade'), 380);
    setTimeout(() => g.remove(), 660);
    return;
  }
  closeDrawer();
  if (typeof fn === 'function') setTimeout(fn, 120);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('drawer')?.classList.contains('open')) { e.preventDefault(); closeDrawer(); } });

/* Swipe in from the right screen edge to open the nav (mobile). */
(function(){
  let sx = 0, sy = 0, tracking = false;
  window.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; if (!t) return;
    const open = document.getElementById('drawer')?.classList.contains('open');
    if (!open && t.clientX > window.innerWidth - 26) { sx = t.clientX; sy = t.clientY; tracking = true; }
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!tracking) return; const t = e.touches[0]; if (!t) return;
    if (sx - t.clientX > 42 && Math.abs(t.clientY - sy) < 40) { tracking = false; openDrawer(); }
  }, { passive: true });
  window.addEventListener('touchend', () => { tracking = false; }, { passive: true });
})();
