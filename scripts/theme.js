/* Theme — TWO identities:
     君主 SOVEREIGN (default)  — data-theme="sovereign", full fx (crest + additive flow)
     终端 TERMINAL  (Arknights) — data-theme="terminal",  fx without crest / flow-additive
   Each identity = a data-theme value + a data-fx capability string. The CSS is token-driven
   and data-fx-gated (see styles/theme-terminal.css + tokens.css), so switching data-theme
   recolors the whole UI and data-fx toggles the heavy decorations. A user toggle persists to
   settings.theme and reloads ONCE, so crest.js / energyflow.js / sovereign.js all re-init
   cleanly from index.html's pre-paint stamp — no fragile live re-wiring of WebGL modules. */

const THEME_FX = window.THEME_FX || { sovereign:'glass flow-additive deco crest', terminal:'glass deco' };
const THEMES = ['sovereign', 'terminal'];
const THEME_LABEL = { sovereign:'♛ 君主', terminal:'◈ 终端' }; // ♛ 君主 / ◈ 终端

function currentTheme(){
  const t = document.documentElement.getAttribute('data-theme');
  return THEMES.includes(t) ? t : 'sovereign';
}

/* Stamp data-theme + its data-fx onto <html>. persist=true (explicit user toggle) writes
   LS + pushes settings, then reloads so every decorative module re-inits for the new
   identity. persist=false (init / cloud pull) only stamps — CSS + the energyflow observer
   recolor live; a natural later reload settles the WebGL crest. Legacy/unknown names
   (cappa/sterile/monarch/…) silently resolve to sovereign (REDESIGN §3.10). */
function applyTheme(name, persist){
  const t = THEMES.includes(name) ? name : 'sovereign';
  const d = document.documentElement;
  const changed = d.getAttribute('data-theme') !== t;
  d.setAttribute('data-theme', t);
  d.setAttribute('data-fx', THEME_FX[t] || THEME_FX.sovereign);
  updateThemeBtn();
  if(persist){
    if(typeof saveLSRaw === 'function') saveLSRaw('theme', t);   // immediate LS so the reload boots into `t`
    if(changed){
      try{ if(typeof syncPushSettings === 'function') syncPushSettings(); }catch(e){}   // sync to cloud (fire-and-forget)
      setTimeout(function(){ location.reload(); }, 420);         // let the push go out, then clean re-init
    }
  }
}

function toggleTheme(){
  applyTheme(currentTheme() === 'sovereign' ? 'terminal' : 'sovereign', true);
}

function updateThemeBtn(){
  const b = document.getElementById('theme-toggle');
  if(b) b.textContent = THEME_LABEL[currentTheme()] || THEME_LABEL.sovereign;
}

/* Called by app.js after init — pre-paint already stamped from LS; re-assert + label. */
function initTheme(){ applyTheme(currentTheme(), false); }
