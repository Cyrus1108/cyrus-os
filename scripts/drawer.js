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
  // plain close → SAO cue (same as entering) + exit cascade: PWR→SYS slide out reversed.
  _navPlay(_saoOpen);
  list.classList.add('is-exiting');
  setTimeout(() => {
    _drawerHide(d);                                   // hide the stage WHILE is-exiting still holds the slabs
    setTimeout(() => list.classList.remove('is-exiting'), 360);  // out of view (opacity 0) — only then reset, so no flash-back
  }, 600);
}
/* Pick a channel (SAO select cue), then choreograph the hand-off:
   1. the other five slabs fade + slide away in sequence;
   2. the picked slab glides smoothly to screen centre ("singled out");
   3. the real module HUD then opens from there with its OWN unfurl (sysScrollOpen),
      and closes later with its own furl — we no longer suppress those animations.
   Reduced-motion → plain open. */
const _navOpenMap = { fin:'openFinance', fit:'openFitness', ai:'openAi', cal:'openCalendar', sys:'openSystem', motiv:'openMotivation', shop:'openStore' };
const _navIdMap   = { fin:'fin-btn', fit:'fit-btn', ai:'ai-btn', cal:'cal-btn', sys:'sys-btn', motiv:'motiv-btn', shop:'shop-btn' };
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
  }, 640);
}
/* Desktop keyboard: ← opens the nav (same as the arrow handle); once open, ↑/↓ move
   the selection through the six channels and Enter picks it (native button click →
   navOpen); Esc closes. */
document.addEventListener('keydown', (e) => {
  const d = document.getElementById('drawer');
  const open = d && d.classList.contains('open');
  const ae = document.activeElement;
  const typing = ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable);
  if (typing) return;
  if (open && e.key === 'Escape') { e.preventDefault(); closeDrawer(); return; }
  if (!open && e.key === 'ArrowLeft') {
    const hudOpen = document.querySelector('.fin-view.open, .fit-view.open, .ai-view.open, .cal-view.open, .sys-view.open, .motiv-view.open, .store-view.open') || document.body.classList.contains('has-focus');
    if (!hudOpen) { e.preventDefault(); openDrawer(); }
    return;
  }
  if (!open) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const items = [...d.querySelectorAll('.navd-item')]; if (!items.length) return;
    const cur = items.indexOf(ae);
    const next = cur < 0 ? (e.key === 'ArrowDown' ? 0 : items.length - 1)
                         : (cur + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  }
});

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
