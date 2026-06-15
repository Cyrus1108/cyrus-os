/* Theme switching — "cappa" (default brass/cream) ⇄ "sterile" (Endfield).
   The chosen theme is set on <html data-theme>, persisted to localStorage,
   and synced via settings.theme. The WebGL life-tree (Three.js) is lazy-loaded
   only the first time the sterile theme is activated, so the default theme
   carries zero extra weight. */

let _lifetreeLoading = false;

/* Three themes now: cappa (brass/cream default) → sterile (light Endfield futurism)
   → terminal (dark Arknights tactical). The toggle cycles through them. */
const THEMES = ['cappa', 'sterile', 'terminal'];

function currentTheme(){
  const t = document.documentElement.getAttribute('data-theme');
  return THEMES.includes(t) ? t : 'cappa';
}

function applyTheme(name, persist){
  const t = THEMES.includes(name) ? name : 'cappa';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('cyrus_dashboard_v6_theme', JSON.stringify(t)); } catch(e){}
  // sync to Supabase settings (saveLS is defined in state.js and triggers push)
  if(persist && typeof saveLS === 'function') saveLS('theme', t);
  updateThemeBtn(t);

  if(t === 'sterile'){
    ensureLifeTree();
    if(typeof initAmbient === 'function') initAmbient();
  } else if(typeof window.destroyLifeTree === 'function'){
    // both cappa and terminal drop the life-tree (terminal has its own dark chrome)
    window.destroyLifeTree();
  }
}

function toggleTheme(){
  const i = THEMES.indexOf(currentTheme());
  applyTheme(THEMES[(i + 1) % THEMES.length], true);
}

function updateThemeBtn(t){
  const b = document.getElementById('theme-btn');
  // label shows the NEXT theme in the cycle
  if(b) b.textContent = t === 'cappa' ? '◆ 终末' : t === 'sterile' ? '▣ 终端' : '☼ 经典';
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
