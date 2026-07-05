/* ════════════ 流动能量背景 · Energy Flow ════════════
   全屏 canvas 背景层(z:-2),画缓慢漂移的发光能量丝带——SOVEREIGN 主背景氛围层,
   参考《Solo Leveling》「系统」窗口的能量氛围。颜色取自 --brass-soft(SOVEREIGN 下 #B892FF
   君主紫),主题切换自动重新着色。P3-B 深度分层:丝带分 back/mid/front 三个深度层,背景先画
   (更暗更慢更粗更糊、条数多)、前景压上(更亮更快更细更利、条数少),层间用向 #241B45 暗紫混合
   拉开纵深;合成后总亮度守 §2.4 配额(≤现状),纵深来自对比不来自更亮。additive('lighter')
   由 [data-fx~="flow-additive"] 门控。生命周期照搬 glass-trails:debounce resize +
   visibilitychange RAF 开关 + reduced-motion 只画一帧静态 + MutationObserver 重着色。
   CSS(components.css)管不透明度(§2.4 ≤0.5)+ 全屏 HUD 打开时 display:none。
   手机端按层缩减(背景层优先减:6→2)。纯装饰,pointer-events:none,零数据。 */
(function(){
  if(typeof document === 'undefined') return;
  var cv = document.createElement('canvas');
  cv.id = 'energy-flow';
  cv.setAttribute('aria-hidden','true');
  (document.body || document.documentElement).appendChild(cv);
  var ctx = cv.getContext('2d'); if(!ctx) return;

  var DPR    = Math.min(window.devicePixelRatio || 1, 2);
  var mobile = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var W = 0, H = 0, raf = 0, last = 0;
  var fils = [];
  var col = '#B892FF', additive = true;
  var DARK = '#241B45';                    // 深度分层暗紫派生目标(SOVEREIGN 次强调)

  // ── 深度分层 ──────────────────────────────────────────────────────────────
  // 三个深度层,绘制顺序 back→mid→front(背景先画,前景压上)。每层参数化:
  // 条数(手机/桌面)、速度倍率、宽度范围、alpha 范围、向 DARK 混合比(拉深度)、
  // 三段描边轮廓(外辉光/中层/亮核 的宽度×alpha)。背景层更暗更慢更粗更糊、条数多;
  // 前景层更亮更快更细更利、条数少。合成后总 alpha 质量 < 现状(见报告),靠对比出深度。
  var LAYERS = [
    { key:'back',  n:[2,6], amp:[0.06,0.15], sp:[0.030,0.085], w:[0.90,1.75], a:[0.22,0.38], mix:0.72,
      strokes:[{w:5.6,a:0.22},{w:2.7,a:0.32},{w:1.25,a:0.46}], col:'#B892FF' },   // 暗、慢、粗、糊、多
    { key:'mid',   n:[1,3], amp:[0.04,0.12], sp:[0.060,0.160], w:[0.55,1.15], a:[0.32,0.54], mix:0.34,
      strokes:[{w:4.2,a:0.26},{w:1.9,a:0.56},{w:0.85,a:0.90}], col:'#B892FF' },
    { key:'front', n:[1,2], amp:[0.03,0.09], sp:[0.120,0.260], w:[0.40,0.80], a:[0.40,0.62], mix:0.00,
      strokes:[{w:2.8,a:0.22},{w:1.30,a:0.55},{w:0.55,a:1.0}], col:'#B892FF' }    // 亮、快、细、利、少
  ];

  function hx(h){ h=(h||'').replace('#',''); if(h.length===3){h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];} var n=parseInt(h,16); return [(n>>16)&255,(n>>8)&255,n&255]; }
  function mixHex(a,b,t){
    if(!a || a.charAt(0)!=='#') return a || b;                 // 非 hex(如 rgb()/空)→ 不混合,降级为原色
    var A=hx(a), B=hx(b);
    return 'rgb('+Math.round(A[0]+(B[0]-A[0])*t)+','+Math.round(A[1]+(B[1]-A[1])*t)+','+Math.round(A[2]+(B[2]-A[2])*t)+')';
  }
  function readTheme(){
    var cs = getComputedStyle(document.documentElement);
    col = (cs.getPropertyValue('--brass-soft').trim()) || (cs.getPropertyValue('--brass').trim()) || '#B892FF';
    additive = document.documentElement.matches('[data-fx~="flow-additive"]');   // 无此标志→普通混合,不过曝
    for(var i=0;i<LAYERS.length;i++){ LAYERS[i].col = mixHex(col, DARK, LAYERS[i].mix); }  // 层间暗紫派生,主题切换即重着色
  }
  function rnd(a,b){ return a + Math.random()*(b-a); }
  function seed(){
    fils = [];
    var deskW = mobile ? 1 : 1.12;                              // 桌面核心略粗(承 v7.27.2)
    for(var li=0; li<LAYERS.length; li++){
      var L = LAYERS[li], cnt = L.n[mobile ? 0 : 1];            // 手机取 n[0]:背景层减得最多(6→2),按层缩减
      for(var i=0;i<cnt;i++){
        fils.push({
          L:     L,                                             // 所属深度层(描边轮廓/颜色/合成从此读)
          y:     rnd(0.05, 0.95),                               // 基准高度(占 H 比例)
          amp:   rnd(L.amp[0], L.amp[1]),                       // 波幅(背景更大→视差纵深)
          freq:  rnd(1.1, 2.4),                                 // 横跨屏幕的波数
          phase: rnd(0, Math.PI*2),
          speed: rnd(L.sp[0], L.sp[1]) * (Math.random()<0.5 ? -1 : 1), // 相位漂移:背景慢/前景快
          drift: rnd(-0.011, 0.011) * (L.key==='front' ? 1.35 : L.key==='back' ? 0.6 : 1), // 竖直漂移
          tilt:  rnd(-0.09, 0.09),                              // 斜度
          w:     rnd(L.w[0], L.w[1]) * deskW,                   // 核心粗细 px
          a:     rnd(L.a[0], L.a[1])                            // 基础 alpha
        });
      }
    }
  }
  function resize(){
    W = window.innerWidth || document.documentElement.clientWidth || (window.screen && screen.width) || 1280;
    H = window.innerHeight || document.documentElement.clientHeight || (window.screen && screen.height) || 800;
    cv.width  = Math.max(1, Math.round(W * DPR));
    cv.height = Math.max(1, Math.round(H * DPR));
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function drawFil(f){
    var yBase = f.y * H, amp = f.amp * H, steps = mobile ? 40 : 56;
    // 先采样所有点,再用「中点二次贝塞尔」平滑连接:控制点=采样点、终点=相邻两点中点,
    // 得到 C1 连续的曲线、彻底消除折线尖角(手机端低采样下尤其明显)。
    var px = [], py = [];
    for(var s=0;s<=steps;s++){
      var x = (s/steps) * (W + 120) - 60;
      var y = yBase + f.tilt*(x - W/2) + amp*Math.sin((s/steps)*f.freq*Math.PI*2 + f.phase);
      px.push(x); py.push(y);
    }
    ctx.beginPath();
    ctx.moveTo(px[0], py[0]);
    for(var i=1;i<px.length-1;i++){
      ctx.quadraticCurveTo(px[i], py[i], (px[i]+px[i+1])/2, (py[i]+py[i+1])/2);
    }
    ctx.lineTo(px[px.length-1], py[py.length-1]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = f.L.col;   // 层色(暗紫派生)
    var st = f.L.strokes;
    ctx.globalAlpha = f.a*st[0].a; ctx.lineWidth = f.w*st[0].w; ctx.stroke();   // 外辉光(背景更宽更糊/前景更窄更利)
    ctx.globalAlpha = f.a*st[1].a; ctx.lineWidth = f.w*st[1].w; ctx.stroke();   // 中层
    ctx.globalAlpha = f.a*st[2].a; ctx.lineWidth = f.w*st[2].w; ctx.stroke();   // 亮核(细线)
  }
  function frame(dt){
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
    for(var i=0;i<fils.length;i++){
      var f = fils[i];
      f.phase += f.speed*dt;
      f.y += f.drift*dt;
      if(f.y < -0.1) f.y = 1.1; else if(f.y > 1.1) f.y = -0.1;
      drawFil(f);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function loop(now){
    raf = requestAnimationFrame(loop);
    var dt = last ? Math.min((now - last)/1000, 0.05) : 0.016; last = now;
    frame(dt);
  }
  function start(){ if(!raf && !reduce){ last = 0; raf = requestAnimationFrame(loop); } }
  function stop(){ if(raf){ cancelAnimationFrame(raf); raf = 0; } }

  // 脚本在 body 内联执行早于 layout,innerWidth 此时可能为 0 → 等 load + 视口有尺寸再初始化
  function init(){ readTheme(); resize(); seed(); frame(0.016); if(!reduce) start(); }   // 先画一帧静态(立即可见,即使 rAF 未跑也有内容),非 reduced-motion 再起动画
  if(document.readyState === 'complete') init();
  else window.addEventListener('load', init, { once:true });

  var rT = 0;
  window.addEventListener('resize', function(){ clearTimeout(rT); rT = setTimeout(function(){ resize(); seed(); if(reduce) frame(0.016); }, 150); });
  document.addEventListener('visibilitychange', function(){ if(document.hidden) stop(); else if(!reduce) start(); });
  if(window.MutationObserver){
    new MutationObserver(function(){ readTheme(); if(reduce) frame(0.016); })
      .observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });
  }
})();
