/* Right-side reference drawer (Markets + Inbox panes) */
function openDrawer(pane){
  document.getElementById('drawer').classList.add('open');
  document.getElementById('drawer-backdrop').classList.add('open');
  document.getElementById('drawer').setAttribute('aria-hidden','false');
  if(pane) switchPane(pane);
  renderMarkets();
  if(!calendarRendered) renderCalendar();
}
function closeDrawer(){
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('drawer-backdrop').classList.remove('open');
  document.getElementById('drawer').setAttribute('aria-hidden','true');
}
function switchPane(pane){
  document.querySelectorAll('.drawer-tab-btn').forEach(btn=>btn.classList.toggle('active', btn.dataset.pane===pane));
  document.querySelectorAll('.drawer-pane').forEach(el=>el.classList.toggle('active', el.id==='pane-'+pane));
}
document.addEventListener('keydown', (e)=>{if(e.key==='Escape')closeDrawer();});
