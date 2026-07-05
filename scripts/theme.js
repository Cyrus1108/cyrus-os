/* SOVEREIGN — legacy theme shim.
   The four-theme system (cappa / sterile / terminal / monarch) and the theme
   toggle are retired: CyrusOS now has ONE identity, SOVEREIGN. This module used
   to cycle themes, write data-fx capability maps, and lazy-load the life-tree —
   all of that is gone. What remains is a thin compatibility layer:

   - initTheme()  — called by app.js; stamps the fixed capability set + a stable
                    data-theme="sovereign" (the pre-paint script in index.html
                    already did this to avoid a flash; this re-asserts it).
   - applyTheme() — kept because sync.js calls it when a `theme` value arrives on
                    pull. Per the redesign red line (§3.10), any stored/pulled
                    theme value (cappa/sterile/terminal/monarch or anything else)
                    is silently ignored — we never leave SOVEREIGN. The
                    settings.theme column is NOT deleted; its value is just inert.
   - currentTheme() — compat constant, always 'sovereign'. */

/* Fixed SOVEREIGN capability set (mirrors index.html's pre-paint stamp):
   glass = interaction layer on, flow-additive = energyflow additive blend,
   deco = panel/body decorations on. cube / trails / lifetree are permanently off. */
const SOVEREIGN_FX = 'glass flow-additive deco';

function applySovereign(){
  const d = document.documentElement;
  d.setAttribute('data-theme', 'sovereign');
  d.setAttribute('data-fx', SOVEREIGN_FX);
}

function currentTheme(){ return 'sovereign'; }

/* Compat no-op: ignores whatever name/value is passed (legacy theme values are
   inert under SOVEREIGN) and simply re-asserts the single identity. */
function applyTheme(){ applySovereign(); }

/* Called by app.js after init. */
function initTheme(){ applySovereign(); }
