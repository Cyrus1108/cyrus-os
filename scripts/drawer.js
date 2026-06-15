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
function _drawerHide(d){
  d.classList.remove('open');
  document.getElementById('drawer-backdrop')?.classList.remove('open');
  d.setAttribute('aria-hidden', 'true'); d.setAttribute('inert', '');
  d._opener?.focus?.(); d._opener = null;        // a11y: restore focus to the opener
}
function closeDrawer(){
  const d = document.getElementById('drawer'); if (!d || !d.classList.contains('open')) return;
  const list = d.querySelector('.navd-list');
  if (list && list.classList.contains('is-exiting')) return;   // exit cascade already running
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  // hand-off after a pick (the HUD takes over) or reduced-motion → hide instantly
  if (reduce || !list || list.classList.contains('is-picking')) { _drawerHide(d); return; }
  // plain close → exit cascade: PWR→SYS slide out in reverse order, then hide
  list.classList.add('is-exiting');
  setTimeout(() => { list.classList.remove('is-exiting'); _drawerHide(d); }, 430);
}
/* Pick a channel (SAO select cue), then choreograph the hand-off:
   1. the other five slabs fade + slide away in sequence;
   2. the picked slab glides smoothly to screen centre ("singled out");
   3. the real module HUD then opens from there with its OWN unfurl (sysScrollOpen),
      and closes later with its own furl — we no longer suppress those animations.
   Reduced-motion → plain open. */
const _navOpenMap = { fin:'openFinance', fit:'openFitness', ai:'openAi', cal:'openCalendar', sys:'openSystem', motiv:'openMotivation' };
const _navIdMap   = { fin:'fin-btn', fit:'fit-btn', ai:'ai-btn', cal:'cal-btn', sys:'sys-btn', motiv:'motiv-btn' };
function navOpen(which){
  _navPlay(_saoSel);
  const fn = window[_navOpenMap[which]];
  if (typeof fn !== 'function') { closeDrawer(); return; }
  const drawer = document.getElementById('drawer');
  const list = drawer && drawer.querySelector('.navd-list');
  const picked = document.getElementById(_navIdMap[which]);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  if (reduce || !list || !picked) { closeDrawer(); setTimeout(fn, 120); return; }
  const pr = picked.getBoundingClientRect();
  const dx = Math.round(window.innerWidth / 2 - (pr.left + pr.width / 2));
  const dy = Math.round(window.innerHeight / 2 - (pr.top + pr.height / 2));
  list.classList.add('is-picking');              // others fade/slide out (CSS), navSlideIn cleared
  picked.classList.add('picked');                // gets a transform transition
  requestAnimationFrame(() => { picked.style.transform = `translate(${dx}px, ${dy}px)`; });  // glide to centre
  setTimeout(() => {
    fn();                                         // HUD unfurls (its own animation) from centre
    closeDrawer();                                // nav stage fades out behind the HUD
    setTimeout(() => {                            // reset for next open, hidden behind the HUD
      picked.style.transform = '';
      picked.classList.remove('picked');
      list.classList.remove('is-picking');
    }, 420);
  }, 510);
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
