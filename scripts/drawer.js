/* Right-side reference drawer (Markets + Inbox panes) */
function openDrawer(pane){
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawer-backdrop').classList.add('open');
  document.getElementById('drawer').setAttribute('aria-hidden','false');
  document.getElementById('drawer').removeAttribute('inert');
  if(pane) switchPane(pane);
  renderMarkets();
  if(!calendarRendered) renderCalendar();
}
function closeDrawer(){
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawer-backdrop').classList.remove('open');
  const d=document.getElementById('drawer'); d.setAttribute('aria-hidden','true'); d.setAttribute('inert','');
}
function switchPane(pane){
  document.querySelectorAll('.drawer-tab-btn').forEach(btn=>btn.classList.toggle('active', btn.dataset.pane===pane));
  document.querySelectorAll('.drawer-pane').forEach(el=>el.classList.toggle('active', el.id==='pane-'+pane));
}
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && document.getElementById('drawer')?.classList.contains('open')){ e.preventDefault(); closeDrawer(); } });
