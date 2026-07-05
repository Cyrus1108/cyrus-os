/* ═══════════════════════════════════════════════════════════════════════════
   sovereign.js — SOVEREIGN 面板结构件 (P1-β · 面板语言)
   ---------------------------------------------------------------------------
   把已批准样张 design/sovereign-proto.html 的「斜切 SVG hairline 框」产品化到
   主站结构层。每个主页面板挂三件套:
     · .sov-fill  — 背景填充层(实色浮起 + 16px 斜切 clip-path,由 .sov-chamfer 供)
     · .sov-frame — 1px hairline SVG 框(vector-effect:non-scaling-stroke),
                    路径贴合斜切轮廓;为 P2「描边成形」在 el 上暴露 el._sovFramePath
     · .sov-tick  — 左上短刻线(样张 .panel-tick,警示刻线换紫)
   ResizeObserver 随面板尺寸重绘 frame path。幂等:重复调用不重复挂;若面板被
   glass.js 的 flip/stacking 事后重排导致三件套被搬离,MutationObserver 自愈重挂。
   零副作用:不读 S、不触发音效/弹窗/写库。静态结构,prefers-reduced-motion 无关。
   ═══════════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  var SVG_NS  = 'http://www.w3.org/2000/svg';
  var CHAMFER = 16;                 // 与 --chamfer / .sov-chamfer clip-path 同步
  var SEL     = '.panel, .the90-panel, #hermes-panel';
  var managed = [];                 // 已托管面板,供自愈复查

  /* —— 单面板挂框(核心 API) —— */
  function mountPanelFrame(el, opts){
    if(!el) return null;
    // 幂等:若框仍是本面板的直接子节点,直接返回既有 path
    if(el._sovFrameSvg && el._sovFrameSvg.parentNode === el) return el._sovFramePath;
    // 被事后重排搬离(e.g. glass.js 交易面板 flip):拆旧重挂
    if(el._sovFrameSvg) teardown(el);

    opts = opts || {};
    var ch = opts.chamfer || CHAMFER;
    el.classList.add('sov-panel');

    var fill = document.createElement('div');
    fill.className = 'sov-fill sov-chamfer';
    fill.setAttribute('aria-hidden', 'true');

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'sov-frame');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('preserveAspectRatio', 'none');
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(path);

    var tick = document.createElement('span');
    tick.className = 'sov-tick';
    tick.setAttribute('aria-hidden', 'true');

    // 插到最前(内容之前);z-index(CSS)把 fill/frame 压到内容之下,tick 浮于其上
    el.insertBefore(svg, el.firstChild);
    el.insertBefore(tick, el.firstChild);
    el.insertBefore(fill, el.firstChild);

    el._sovFill      = fill;
    el._sovFrameSvg  = svg;
    el._sovFramePath = path;         // P2 描边成形引用
    el._sovTick      = tick;
    el._sovChamfer   = ch;

    function draw(){
      var w = el.clientWidth, h = el.clientHeight;
      if(!w || !h) return;
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      path.setAttribute('d',
        'M0 0 L' + (w - ch) + ' 0 L' + w + ' ' + ch +
        ' L' + w + ' ' + h + ' L' + ch + ' ' + h + ' L0 ' + (h - ch) + ' Z');
    }
    el._sovDraw = draw;
    draw();

    if(window.ResizeObserver){
      var ro = new ResizeObserver(draw);
      ro.observe(el);
      el._sovRO = ro;
    } else {
      window.addEventListener('resize', draw);
    }

    if(managed.indexOf(el) < 0){
      managed.push(el);
      observeDisplacement(el);   // 自愈观察随挂随接(晚挂的交易面板也被覆盖)
    }
    return path;
  }

  function teardown(el){
    [el._sovFill, el._sovTick, el._sovFrameSvg].forEach(function(n){
      if(n && n.parentNode) n.parentNode.removeChild(n);
    });
    if(el._sovRO){ try{ el._sovRO.disconnect(); }catch(e){} el._sovRO = null; }
    el._sovFill = el._sovFrameSvg = el._sovFramePath = el._sovTick = null;
  }

  /* —— 自愈:glass.js flip/stacking 若把三件套搬离面板,重挂 —— */
  var healing = false, healScheduled = false;
  function heal(){
    healing = true;
    for(var i = 0; i < managed.length; i++){
      var el = managed[i];
      if(el._sovFrameSvg && el._sovFrameSvg.parentNode !== el){
        teardown(el);
        mountPanelFrame(el);
      }
    }
    healing = false;
  }
  /* 单例观察器,面板在 mountPanelFrame 首次托管时逐个接入(修复:原一次性
     watchForDisplacement 只覆盖 mountAll 当时的面板,晚挂的交易面板永远没被观察) */
  var dispMO = null;
  function observeDisplacement(el){
    if(!window.MutationObserver) return;
    if(!dispMO){
      dispMO = new MutationObserver(function(){
        if(healing || healScheduled) return;
        healScheduled = true;
        requestAnimationFrame(function(){ healScheduled = false; heal(); });
      });
    }
    dispMO.observe(el, { childList: true });
  }

  /* —— 交易面板特例:glass.js glassInitFlip 会把面板的直接子节点分拣进
     .flip-front / .flip-back 两面。若我们先挂框,三件套会被误分拣、且打乱 flip 的
     内容切分。故:仅当 flip 不会发生(reduced-motion 或非 glass 能力)时立即挂;
     否则等 .flip3d 出现(flip 完成)后再挂,超时兜底。 —— */
  function mountTradingPanel(el){
    if(!el) return;
    var rm  = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var noGlass = !document.documentElement.matches('[data-fx~="glass"]');
    if(rm || noGlass || el.querySelector('.flip3d')){ mountPanelFrame(el); return; }
    var done = false;
    function finish(){ if(done) return; done = true; if(mo) mo.disconnect(); mountPanelFrame(el); }
    var mo = window.MutationObserver ? new MutationObserver(function(){
      if(el.querySelector('.flip3d')) finish();
    }) : null;
    if(mo) mo.observe(el, { childList: true, subtree: true });
    /* 兜底:绝不在 init 完成前抢挂(登录页停留 >6s 的旧竞态会让 glassInitFlip
       把三件套误分拣进 flip 面,review v7.34.0)。轮询等 body.booted(app.js 在
       init+1.5s 落上)——booted 后 flip 若要发生早已发生,再留 1.5s 宽限确认。 */
    (function fallback(){
      if(done) return;
      if(document.body.classList.contains('booted')){
        setTimeout(function(){ if(!done && !el.querySelector('.flip3d')) finish(); }, 1500);
      } else {
        setTimeout(fallback, 3000);
      }
    })();
  }

  function mountAll(){
    var trList = document.getElementById('tr-list');
    var tradingPanel = trList ? trList.closest('.panel') : null;
    document.querySelectorAll(SEL).forEach(function(el){
      if(el === tradingPanel){ mountTradingPanel(el); return; }
      mountPanelFrame(el);
    });
  }

  window.mountPanelFrame     = mountPanelFrame;
  window.mountSovereignFrames = mountAll;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', mountAll);
  } else {
    mountAll();
  }
})();
