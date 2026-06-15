/* Right-side reference drawer (Markets + Inbox panes) */
function openDrawer(pane){
  const d=document.getElementById('drawer');
  d._opener=document.activeElement;            // a11y: remember focus to restore on close
  d.classList.add('open');
  document.getElementById('drawer-backdrop').classList.add('open');
  d.setAttribute('aria-hidden','false');
  d.removeAttribute('inert');
  if(pane) switchPane(pane);
  renderMarkets();
  if(!calendarRendered) renderCalendar();
  d.querySelector('.drawer-close')?.focus();   // move focus into the drawer
}
function closeDrawer(){
  const d=document.getElementById('drawer');
  d.classList.remove('open');
  document.getElementById('drawer-backdrop').classList.remove('open');
  d.setAttribute('aria-hidden','true'); d.setAttribute('inert','');
  d._opener?.focus?.(); d._opener=null;        // a11y: restore focus to the opener
}
function switchPane(pane){
  document.querySelectorAll('.drawer-tab-btn').forEach(btn=>btn.classList.toggle('active', btn.dataset.pane===pane));
  document.querySelectorAll('.drawer-pane').forEach(el=>el.classList.toggle('active', el.id==='pane-'+pane));
}
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && document.getElementById('drawer')?.classList.contains('open')){ e.preventDefault(); closeDrawer(); } });
