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
/* Pick a channel: SAO select cue → close the drawer → open the module HUD. */
function navOpen(which){
  _navPlay(_saoSel);
  closeDrawer();
  const map = { fin:'openFinance', fit:'openFitness', ai:'openAi', cal:'openCalendar', sys:'openSystem', motiv:'openMotivation' };
  const fn = window[map[which]];
  if (typeof fn === 'function') setTimeout(fn, 150);   // let the drawer start closing first
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
