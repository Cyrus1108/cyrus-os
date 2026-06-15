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
  d.querySelector('.navd-item')?.focus();        // move focus to the first channel
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
const _navViewMap = { fin:'finance-view', fit:'fitness-view', ai:'ai-view', cal:'calendar-view', sys:'system-view', motiv:'motivation-view' };
function navOpen(which){
  _navPlay(_saoSel);
  const fn = window[_navOpenMap[which]];
  if (typeof fn !== 'function') { closeDrawer(); return; }
  const slab = document.getElementById(_navIdMap[which]);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  if (reduce || !slab) { closeDrawer(); setTimeout(fn, 120); return; }
  // FLIP: open the REAL HUD now, then fly its .sys-window from the tapped slab's
  // rect to its natural position (suppressing the window's own unfurl) — one
  // continuous motion, no empty ghost, no second "open" flash.
  const sr = slab.getBoundingClientRect();
  closeDrawer();
  fn();
  const view = document.getElementById(_navViewMap[which]);
  const win = view && view.querySelector('.sys-window');
  if (!win) return;                            // e.g. motivation has no .sys-window → normal open
  view.classList.add('nav-morphing');          // kills the window's sysScrollOpen so our transform owns it
  win.style.transition = 'none'; win.style.transform = 'none';
  const wr = win.getBoundingClientRect();       // natural rect (forces a sync layout, no paint)
  const sx = Math.max(0.06, sr.width  / (wr.width  || 1));
  const sy = Math.max(0.06, sr.height / (wr.height || 1));
  win.style.transformOrigin = 'top left';
  win.style.willChange = 'transform';
  win.style.transform = `translate(${sr.left - wr.left}px, ${sr.top - wr.top}px) scale(${sx}, ${sy})`;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    win.style.transition = 'transform .44s cubic-bezier(.22,1,.36,1)';
    win.style.transform = 'none';
  }));
  setTimeout(() => { win.style.transition = ''; win.style.transform = ''; win.style.transformOrigin = ''; win.style.willChange = ''; }, 520);
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
