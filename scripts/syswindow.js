/* ════════════ 暗影君主主题 · SYSTEM 状态窗 ════════════
   monarch-only hero header — a Solo-Leveling「系统」status window surfacing the real
   CyrusOS RPG state (level / rank / title / EXP / 战力 + 六维属性). Built from
   computeRPG(); re-renders on theme switch and when the tab regains focus. Inserted at
   the top of .header, hidden (CSS) outside monarch. Attribute bars scale to /100. */
(function(){
  if(typeof document === 'undefined') return;

  var ORDER = ['STR','AGI','INT','WIS','VIT','CRE'];
  var ICONS = {
    STR:'<path d="M4 20l3-3M7 17l9-9M16 8l4-4M12.5 7.5l4 4"/>',
    AGI:'<path d="M13 3L6 13h5l-1 8 8-11h-6z"/>',
    INT:'<circle cx="12" cy="8" r="3.4"/><path d="M6 20a6 6 0 0 1 12 0"/>',
    WIS:'<path d="M12 3a6 6 0 0 0-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 0 0-4-10z"/><path d="M9.5 19h5M10.5 21.2h3"/>',
    VIT:'<path d="M12 20S4 14.5 4 9a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 5.5-8 11-8 11z"/>',
    CRE:'<path d="M12 3c1.2 3.5-2 4.5-2 7.5a3 3 0 0 0 6 0c0-1.2-.8-2-1.2-2.8C16.5 9 17.5 12 17.5 14a5.5 5.5 0 0 1-11 0C6.5 9 10 7.5 12 3z"/>'
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
    f.innerHTML = '<span class="mf-c tl"></span><span class="mf-c tr"></span><span class="mf-c bl"></span><span class="mf-c br"></span>';
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
