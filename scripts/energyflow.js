/* ════════════ 流动能量背景 · Energy Flow ════════════
   全屏 canvas 背景层(z:-2),画缓慢漂移的发光能量丝带——参考《Solo Leveling》「系统」窗口
   的能量氛围。三个主题都显示,颜色取自当前主题的 --brass-soft(cappa 黄铜/sterile 亮黄/
   terminal 亮黄),主题切换自动重新着色。深色主题用 additive('lighter')叠出辉光,浅色
   主题(sterile)用普通混合避免在白底过曝。生命周期照搬 glass-trails:debounce resize +
   visibilitychange RAF 开关 + reduced-motion 只画一帧静态。CSS(components.css)管每主题
   不透明度 + 全屏 HUD 打开时 display:none。纯装饰,pointer-events:none,零数据。 */
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
  var N = mobile ? 5 : 10;                 // 能量丝条数
  var W = 0, H = 0, raf = 0, last = 0;
  var fils = [];
  var col = '#C9A876', additive = true;

  function readTheme(){
    var cs = getComputedStyle(document.documentElement);
    col = (cs.getPropertyValue('--brass-soft').trim()) || (cs.getPropertyValue('--brass').trim()) || '#C9A876';
    additive = document.documentElement.getAttribute('data-theme') !== 'sterile';   // 浅色主题不用 additive(会过曝)
  }
  function rnd(a,b){ return a + Math.random()*(b-a); }
  function seed(){
    fils = [];
    for(var i=0;i<N;i++){
      fils.push({
        y:     rnd(0.05, 0.95),                                 // 基准高度(占 H 比例)
        amp:   rnd(0.04, 0.13),                                 // 波幅
        freq:  rnd(1.1, 2.4),                                   // 横跨屏幕的波数
        phase: rnd(0, Math.PI*2),
        speed: rnd(0.06, 0.16) * (Math.random()<0.5 ? -1 : 1), // 相位漂移(流动)
        drift: rnd(-0.011, 0.011),                             // 竖直漂移
        tilt:  rnd(-0.09, 0.09),                                // 斜度
        w:     rnd(0.55, 1.25) * (mobile ? 1 : 1.15),         // 核心粗细 px(v7.27.2 调细)
        a:     rnd(0.30, 0.58)                                  // 基础 alpha
      });
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
    var yBase = f.y * H, amp = f.amp * H, steps = mobile ? 26 : 46;
    ctx.beginPath();
    for(var s=0;s<=steps;s++){
      var x = (s/steps) * (W + 120) - 60;
      var y = yBase + f.tilt*(x - W/2) + amp*Math.sin((s/steps)*f.freq*Math.PI*2 + f.phase);
      if(s===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col;
    ctx.globalAlpha = f.a*0.26; ctx.lineWidth = f.w*4.2; ctx.stroke();   // 外辉光(v7.27.2 收窄)
    ctx.globalAlpha = f.a*0.56; ctx.lineWidth = f.w*1.9; ctx.stroke();   // 中层
    ctx.globalAlpha = f.a*1.0;  ctx.lineWidth = f.w*0.85;ctx.stroke();   // 亮核(细线)
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
