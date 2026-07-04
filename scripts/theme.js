/* Theme switching — "cappa" (default brass/cream) ⇄ "sterile" (Endfield).
   The chosen theme is set on <html data-theme>, persisted to localStorage,
   and synced via settings.theme. The WebGL life-tree (Three.js) is lazy-loaded
   only the first time the sterile theme is activated, so the default theme
   carries zero extra weight. */

let _lifetreeLoading = false;

/* Three themes now: cappa (brass/cream default) → sterile (light Endfield futurism)
   → terminal (dark Arknights tactical). The toggle cycles through them. */
const THEMES = ['cappa', 'sterile', 'terminal', 'monarch'];

/* ── Capability flags (data-fx) — THE authoritative map of "which decorative
   layers each theme turns on". applyTheme writes these onto <html data-fx="…">
   and every guard (JS + CSS) reads a flag instead of pattern-matching theme
   names. Flag semantics (archaeology of the pre-existing guards):
     glass         — glass.js maximalist interaction layer + sys-window HUD shell
                     run (was: everything-except-sterile).
     cube          — herocube Three.js hero cube renders (was: cappa only —
                     herocube.js early-returned for sterile/terminal/monarch).
     trails        — glass-trails ink canvas is visible (was: cappa only —
                     terminal & monarch hid #glass-trails via CSS).
     flow-additive — energyflow uses 'lighter' additive blending (was:
                     everything-except-sterile; sterile used source-over).
     lifetree      — sterile life-tree + ambient run (was: sterile only).
     deco          — default-theme panel/body decorations apply (was the CSS
                     `html:not([data-theme="sterile"])` guard).
   ⚠️ index.html's pre-paint inline script embeds a COPY of this map so data-fx
   is correct before first paint — keep the two in sync. */
const THEME_FX = {
  cappa:    'glass cube trails flow-additive deco',
  sterile:  'lifetree',
  terminal: 'glass flow-additive deco',
  monarch:  'glass flow-additive deco',
};

function currentTheme(){
  const t = document.documentElement.getAttribute('data-theme');
  return THEMES.includes(t) ? t : 'cappa';
}

function applyTheme(name, persist){
  const t = THEMES.includes(name) ? name : 'cappa';
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.setAttribute('data-fx', THEME_FX[t] || THEME_FX.cappa);
  try { localStorage.setItem('cyrus_dashboard_v6_theme', JSON.stringify(t)); } catch(e){}
  // sync to Supabase settings (saveLS is defined in state.js and triggers push)
  if(persist && typeof saveLS === 'function') saveLS('theme', t);
  updateThemeBtn(t);

  // life-tree + ambient run only where the 'lifetree' capability is set (sterile).
  if(document.documentElement.matches('[data-fx~="lifetree"]')){
    ensureLifeTree();
    if(typeof initAmbient === 'function') initAmbient();
  } else if(typeof window.destroyLifeTree === 'function'){
    // cappa/terminal/monarch drop the life-tree
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
  if(b) b.textContent = t === 'cappa' ? '◆ 终末' : t === 'sterile' ? '▣ 终端' : t === 'terminal' ? '♛ 君主' : '☼ 经典';
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
