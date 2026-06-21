/* ════════════ 暗影君主主题 · SYSTEM 状态窗 ════════════
   monarch-only hero header — a Solo-Leveling「系统」status window surfacing the real
   CyrusOS RPG state (level / rank / title / EXP / 战力 + 六维属性). Built from
   computeRPG(); re-renders on theme switch and when the tab regains focus. Inserted at
   the top of .header, hidden (CSS) outside monarch. Attribute bars scale to /100. */
(function(){
  if(typeof document === 'undefined') return;

  var ORDER = ['STR','AGI','INT','WIS','VIT','CRE'];
  var ICONS = {
    STR:'<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/>',
    AGI:'<circle cx="14.5" cy="4.8" r="1.7"/><path d="M13.5 7 10 10.5l3.5 2-1 5.5"/><path d="M10 10.5 6.5 9.5"/><path d="M13.5 12l4.5 1.5 1 3.5"/>',
    INT:'<circle cx="12" cy="7.5" r="3.2"/><path d="M6.5 20a5.5 5.5 0 0 1 11 0"/>',
    WIS:'<path d="M9.5 4.5A2.5 2.5 0 0 0 7 7a2.3 2.3 0 0 0-1.2 4.3A2.3 2.3 0 0 0 7 15.5a2.3 2.3 0 0 0 4.5.6V5.8a2.5 2.5 0 0 0-2-1.3z"/><path d="M14.5 4.5A2.5 2.5 0 0 1 17 7a2.3 2.3 0 0 1 1.2 4.3A2.3 2.3 0 0 1 17 15.5a2.3 2.3 0 0 1-4.5.6"/>',
    VIT:'<path d="M12 20.3 4.6 13a4.4 4.4 0 0 1 7.4-4.8A4.4 4.4 0 0 1 19.4 13z"/>',
    CRE:'<path d="M12 3c0 3-2.2 4.2-2.2 7a3.2 3.2 0 0 0 6.4 0c0-1.3-.6-2.4-1.4-3.3C17.6 8 19 10.6 19 13.4a7 7 0 0 1-14 0C5 8.8 9 6.8 12 3z"/>'
  };
  function ico(k){ return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+ICONS[k]+'</svg>'; }
  function clamp(v){ return Math.max(0, Math.min(100, v)); }

  /* 暗影君主剪影 — a shadowy hooded bust with glowing violet eyes + a soft amethyst
     aura. Sits center-right of the window as a faded backdrop. */
  var FIG = '<div class="sysw-fig" aria-hidden="true"><svg viewBox="0 0 240 240" preserveAspectRatio="xMidYMin meet">'+
    '<defs><radialGradient id="swAura" cx="50%" cy="40%" r="58%">'+
      '<stop offset="0%" stop-color="#7C4DD6" stop-opacity="0.55"/>'+
      '<stop offset="52%" stop-color="#5B2FA8" stop-opacity="0.16"/>'+
      '<stop offset="100%" stop-color="#5B2FA8" stop-opacity="0"/>'+
    '</radialGradient></defs>'+
    '<ellipse cx="120" cy="108" rx="98" ry="122" fill="url(#swAura)"/>'+
    '<path d="M120 38 C108 36 100 44 99 56 L88 46 L95 63 C86 67 85 79 92 89 C96 99 108 105 120 105 C132 105 144 99 148 89 C155 79 154 67 145 63 L152 46 L141 56 C140 44 132 36 120 38 Z M96 101 C77 109 61 125 53 153 C45 179 43 208 45 227 L195 227 C197 208 195 179 187 153 C179 125 163 109 144 101 C138 113 102 113 96 101 Z" fill="#0B0718"/>'+
    '<path d="M99 56 C86 67 85 79 92 89 M96 101 C77 109 61 125 53 153 C45 179 43 208 45 227" fill="none" stroke="#9D7BE6" stroke-opacity="0.45" stroke-width="1.4"/>'+
    '<ellipse cx="108" cy="76" rx="9.5" ry="6" fill="#B892FF" opacity="0.4"/><ellipse cx="108" cy="76" rx="4.6" ry="2.8" fill="#F0E8FF"/>'+
    '<ellipse cx="133" cy="76" rx="9.5" ry="6" fill="#B892FF" opacity="0.4"/><ellipse cx="133" cy="76" rx="4.6" ry="2.8" fill="#F0E8FF"/>'+
    '</svg></div>';

  function ensure(){
    var e = document.getElementById('sys-window');
    if(!e){
      e = document.createElement('div'); e.id = 'sys-window'; e.setAttribute('aria-hidden','true');
      var hdr = document.querySelector('.header');
      if(hdr) hdr.insertBefore(e, hdr.firstChild); else (document.body||document.documentElement).appendChild(e);
    }
    return e;
  }

  /* 整页发光紫光框 + 四角发光括号 — monarch-only viewport frame (an approximation of
     the reference's electric border; the precise lightning texture would need a PNG). */
  function ensureFrame(){
    if(document.getElementById('monarch-frame')) return;
    var f = document.createElement('div'); f.id = 'monarch-frame'; f.setAttribute('aria-hidden','true');
    f.innerHTML = '<span class="mf-c tl"></span><span class="mf-c tr"></span><span class="mf-c bl"></span><span class="mf-c br"></span>'+
      '<span class="mf-crest"><svg viewBox="0 0 40 40" fill="currentColor"><path d="M20 3c1.4 5-3 7-3 11.4a3 3 0 0 0 6 0c0-1.4-.7-2.6-1.5-3.7C24 12.4 26 15.4 26 19a8 8 0 0 1-16 0C10 11.6 17 9.6 20 3z"/></svg></span>'+
      '<span class="mf-ver">◇ SYSTEM · CYRUS OS · ONLINE ◇</span>';
    (document.body || document.documentElement).appendChild(f);
  }

  function render(){
    if(document.documentElement.getAttribute('data-theme') !== 'monarch') return;   // monarch-only
    ensureFrame();
    if(typeof computeRPG !== 'function') return;
    var r; try{ r = computeRPG(); }catch(err){ return; }
    var e = ensure();
    var power = ORDER.reduce(function(s,k){ return s + ((r.attrs && r.attrs[k]) || 0); }, 0);
    var expPct = r.expForLevel ? clamp(100 * r.expInLevel / r.expForLevel) : 0;
    var today = (r.todayExp != null) ? r.todayExp : 0;
    var attrs = ORDER.map(function(k){
      var v = (r.attrs && r.attrs[k]) || 0;
      return '<div class="sysw-attr"><span class="sysw-ico">'+ico(k)+'</span>'+
        '<div class="sysw-acol"><div class="sysw-an">'+k+'</div>'+
        '<div class="sysw-abar"><i style="width:'+clamp(v)+'%"></i></div></div>'+
        '<div class="sysw-av">'+v+'</div></div>';
    }).join('');
    e.innerHTML =
      '<div class="sysw-frame">'+ (window.SYSW_FIG_IMG ? '<div class="sysw-fig"><img src="'+window.SYSW_FIG_IMG+'" alt=""></div>' : '') +
        '<div class="sysw-head"><span class="sysw-sys">&#9672; SYSTEM <i class="sysw-kr">시스템 창</i></span>'+
          '<span class="sysw-online"><i></i>ONLINE</span></div>'+
        '<div class="sysw-top">'+
          '<div class="sysw-stat">'+
            '<div class="sysw-lvlrow"><div><div class="sysw-k">LEVEL</div><div class="sysw-lvl">'+r.level+'</div></div>'+
              '<div class="sysw-rank">RANK '+r.rank+'</div></div>'+
            '<div class="sysw-ttl">称号 · '+(r.title||'—')+'</div>'+
            '<div class="sysw-exprow"><span>EXP '+r.expInLevel+' / '+r.expForLevel+'</span><span class="sysw-today">今日 +'+today+'</span></div>'+
            '<div class="sysw-expbar"><i style="width:'+expPct+'%"></i></div>'+
          '</div>'+
          '<div class="sysw-pow"><div class="sysw-k">战力 POWER</div><div class="sysw-pow-n">'+power+'</div></div>'+
        '</div>'+
        '<div class="sysw-attrhd">能力值 <span>ATTRIBUTE</span></div>'+
        '<div class="sysw-attrs">'+attrs+'</div>'+
      '</div>';
  }

  if(document.readyState === 'complete') render(); else window.addEventListener('load', render, { once:true });
  if(window.MutationObserver){
    new MutationObserver(render).observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });
  }
  document.addEventListener('visibilitychange', function(){ if(document.visibilityState === 'visible') render(); });
  window.renderSysWindow = render;
})();
