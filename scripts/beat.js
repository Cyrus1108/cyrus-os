/* beat.js — SOVEREIGN 三拍交互原语 (REDESIGN.md §2.5)
   日常操作的「起手 → 确认 → 余韵」三拍,产品化自 design/sovereign-proto.html。
   本文件零副作用、零状态依赖(不读 S):只驱动 transform / 注入视觉图层。

   两个原语挂在 window 上:
     beatTap(el, applyFn, opts?)  —— 轻快三拍(勾选 / 打卡)。
     ritualPulse(panelEl, opts?)  —— 仪式脉冲(满勤庆祝),辉光+典礼金扫光+粒子,
                                      800ms 内强制收场,全局互斥。 */
(function(){
  'use strict';

  const RM = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ═══════════════════════════════════════════════════════════════════════
     beatTap — 三拍产品化
       起手  scale .94  (≤60ms)
       确认  applyFn()  —— 状态切换立即执行,数据不等动画;紧接 scale 1.06 (back.out)
       余韵  scale 1    (settle)
     总时长 ~290ms(≤300ms)。只碰 transform。
     · window.gsap 不可用 / reduced-motion → 直接 applyFn(),无动效。
     · el 为持久节点(渲染层骨架化后 reconcile 复用同一节点),所以 applyFn 触发的
       重渲染不会打断本节点上的动画;confirm/settle 继续在同一 el 上播放。
     · 互斥安全:同一 el 快速连点时,若上一拍的 applyFn 尚未落地,先强制落地再重启,
       杜绝「点两次才记录」类回归。
     ═══════════════════════════════════════════════════════════════════════ */
  window.beatTap = function(el, applyFn, opts){
    const apply = (typeof applyFn === 'function') ? applyFn : function(){};
    const g = window.gsap;
    if(!el || !g || RM()){ apply(); return; }
    opts = opts || {};

    // 连点保护:上一拍若还没到确认点,先把它的状态切换补上,再让位给新拍。
    if(el._beatTL){ if(el._beatFire) el._beatFire(); el._beatTL.kill(); }
    g.killTweensOf(el);

    let done = false;
    const fire = function(){ if(done) return; done = true; try{ apply(); }catch(e){ /* 状态切换绝不吞进动画 */ } };
    el._beatFire = fire;

    const tl = g.timeline({
      onComplete(){ el._beatTL = null; el._beatFire = null; g.set(el, { clearProps:'transform' }); }
    });
    el._beatTL = tl;

    tl.to(el, { scale: 0.94, duration: 0.06, ease: 'power2.out' })   // 起手 ≤60ms
      .add(fire)                                                     // 确认:状态切换立即落地
      .to(el, { scale: 1.06, duration: 0.09, ease: 'back.out(3)' })  // 确认爆点
      .to(el, { scale: 1,    duration: 0.14, ease: 'power2.out' });  // 余韵 settle

    return tl;
  };

  /* ═══════════════════════════════════════════════════════════════════════
     ritualPulse — 仪式脉冲(满勤 / 达成的配额辉光,§2.4)
       #B892FF 辉光泛起→收场 + 典礼金扫光横掠 + 少量粒子(面板本地坐标),
       800ms(--dur-ritual)内完全收场归零。
     · 全局互斥闩:同时只允许一个仪式在跑。
     · 面板缺辉光层则动态注入一次(自带内联样式,不依赖任何 CSS 类,P2 各阶段无耦合)。
     · 零副作用:不读写 S;reduced-motion / 无 gsap 时静默返回(音效时点在调用方,不受影响)。
     opts: { particles?:number }  —— 粒子数,默认 9。
     ═══════════════════════════════════════════════════════════════════════ */
  window.ritualPulse = function(panelEl, opts){
    const g = window.gsap;
    if(!panelEl || RM() || !g) return;
    if(window._ritualActive) return;   // 互斥:一次一个仪式
    opts = opts || {};

    window._ritualActive = true;
    const D = 0.8;   // 800ms

    // 面板需为定位上下文(仅在 static 时补;visual-only)
    if(getComputedStyle(panelEl).position === 'static') panelEl.style.position = 'relative';

    // 注入一次辉光层(全内联样式,tokens 走 var() + 硬编码兜底)
    let layer = panelEl.querySelector(':scope > .beat-ritual-layer');
    if(!layer){
      layer = document.createElement('div');
      layer.className = 'beat-ritual-layer';
      layer.setAttribute('aria-hidden', 'true');
      layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;overflow:visible;';
      layer.innerHTML =
        '<div class="beat-ritual-glow" style="position:absolute;inset:-30px;z-index:-1;opacity:0;'
          + 'background:radial-gradient(60% 50% at 50% 45%, color-mix(in srgb, var(--glow,#B892FF) 55%, transparent), transparent 70%);'
          + 'filter:blur(24px);"></div>'
        + '<div class="beat-ritual-sweep" style="position:absolute;inset:0;opacity:0;'
          + 'background:linear-gradient(105deg, transparent 40%, color-mix(in srgb, var(--gold,#E8C878) 85%, transparent) 50%, transparent 60%);'
          + 'transform:translateX(-120%);"></div>'
        + '<div class="beat-ritual-parts" style="position:absolute;inset:0;overflow:visible;"></div>';
      panelEl.appendChild(layer);
    }
    const glow  = layer.querySelector('.beat-ritual-glow');
    const sweep = layer.querySelector('.beat-ritual-sweep');
    const parts = layer.querySelector('.beat-ritual-parts');

    // 复位
    g.killTweensOf([glow, sweep]);
    g.set(glow,  { opacity: 0 });
    g.set(sweep, { xPercent: -120, opacity: 0 });
    if(parts) parts.innerHTML = '';

    // 辉光泛起→收场
    g.timeline()
      .fromTo(glow, { opacity: 0 }, { opacity: 0.9, duration: D * 0.35, ease: 'power2.out' }, 0)
      .to(glow,     { opacity: 0, duration: D * 0.55, ease: 'power2.in' }, D * 0.35);
    // 典礼金扫光横掠(唯一现身处)
    g.fromTo(sweep, { xPercent: -120, opacity: 0 },
      { xPercent: 120, opacity: 1, duration: D * 0.7, ease: 'power1.inOut',
        onComplete(){ g.set(sweep, { opacity: 0 }); } });

    // 少量粒子上浮 —— 面板本地坐标(不用 getBoundingClientRect)
    const n = (opts.particles != null) ? opts.particles : 9;
    const W = panelEl.clientWidth  || 320;
    const H = panelEl.clientHeight || 320;
    for(let i = 0; i < n; i++){
      const pt = document.createElement('span');
      const gold = (i % 3 === 0);
      pt.style.cssText = 'position:absolute;width:3px;height:3px;border-radius:50%;opacity:0;background:'
        + (gold ? 'var(--gold,#E8C878)' : 'var(--glow,#B892FF)') + ';';
      pt.style.left = (18 + Math.random() * (W - 36)) + 'px';
      pt.style.top  = (H * 0.55 + Math.random() * H * 0.3) + 'px';
      if(parts) parts.appendChild(pt);
      g.timeline()
        .to(pt, { opacity: 1, duration: 0.12 }, 0)
        .to(pt, { y: -(40 + Math.random() * 70), x: (Math.random() - 0.5) * 40,
                  duration: 0.6 + Math.random() * 0.15, ease: 'power2.out' }, 0)
        .to(pt, { opacity: 0, duration: 0.35, ease: 'power1.in' }, 0.4);
    }

    // 800ms 强制收场归零(无论 GSAP 是否按时回调,仪式绝不滞留)
    setTimeout(function(){
      window._ritualActive = false;
      g.killTweensOf([glow, sweep]);
      g.set(glow,  { opacity: 0 });
      g.set(sweep, { xPercent: -120, opacity: 0 });
      if(parts) parts.innerHTML = '';
    }, D * 1000);
  };
})();
