/* Theme switching — "cappa" (default brass/cream) ⇄ "sterile" (Endfield).
   The chosen theme is set on <html data-theme>, persisted to localStorage,
   and synced via settings.theme. The WebGL life-tree (Three.js) is lazy-loaded
   only the first time the sterile theme is activated, so the default theme
   carries zero extra weight. */

let _lifetreeLoading = false;

function currentTheme(){
  return document.documentElement.getAttribute('data-theme') === 'sterile' ? 'sterile' : 'cappa';
}

function applyTheme(name, persist){
  const t = name === 'sterile' ? 'sterile' : 'cappa';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('cyrus_dashboard_v6_theme', JSON.stringify(t)); } catch(e){}
  // sync to Supabase settings (saveLS is defined in state.js and triggers push)
  if(persist && typeof saveLS === 'function') saveLS('theme', t);
  updateThemeBtn(t);

  if(t === 'sterile'){
    ensureLifeTree();
  } else if(typeof window.destroyLifeTree === 'function'){
    window.destroyLifeTree();
  }
}

function toggleTheme(){
  applyTheme(currentTheme() === 'sterile' ? 'cappa' : 'sterile', true);
}

function updateThemeBtn(t){
  const b = document.getElementById('theme-btn');
  if(b) b.textContent = t === 'sterile' ? '☼ 经典' : '◆ 终末';
}

/* Lazy-load the life-tree module (pulls in Three.js) only when needed. */
function ensureLifeTree(){
  if(typeof window.initLifeTree === 'function'){ window.initLifeTree(); return; }
  if(_lifetreeLoading) return;
  _lifetreeLoading = true;
  import('./lifetree.js')
    .then(() => { if(typeof window.initLifeTree === 'function') window.initLifeTree(); })
    .catch(err => console.error('[theme] life-tree load failed', err))
    .finally(() => { _lifetreeLoading = false; });
}

/* Called by app.js after init, and reads the stored theme (LS first; settings
   pull may update it later via applyTheme). The pre-paint inline script in
   index.html already set data-theme to avoid a flash. */
function initTheme(){
  let t = 'cappa';
  try { const raw = localStorage.getItem('cyrus_dashboard_v6_theme'); if(raw) t = JSON.parse(raw); } catch(e){}
  applyTheme(t, false);
}
