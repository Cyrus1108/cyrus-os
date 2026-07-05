/* render-core.js — P0 渲染层共用原语(REDESIGN.md §4.3)
   目标:把 rXX() 从「整块 innerHTML 重绘」迁移到「骨架一次成型 + 局部更新」,
   让 GSAP 动画/过渡可以安全绑在面板内部节点上而不被重绘杀死。
   本文件只提供 DOM 复用原语,自身零副作用、零状态依赖(不读 S)。 */
(function(){
  'use strict';

  /* 骨架:容器首次(或 key 变化时)用 buildFn() 建立静态骨架,之后复用。
     返回 true = 本次刚建骨架(调用方可借此做一次性初始化,如挂 makeSortable)。 */
  window.ensureSkeleton = function(el, key, buildFn){
    if(!el) return false;
    if(el.dataset.skel === key) return false;
    el.innerHTML = buildFn();
    el.dataset.skel = key;
    return true;
  };

  /* 文本:仅在变化时写入,避免无谓 mutation(打断动画/丢选区/触发重排)。 */
  window.setText = function(el, text){
    const s = String(text);
    if(el && el.textContent !== s) el.textContent = s;
  };

  /* HTML 片段:仅在与上次写入不同时更新(用 el 上的缓存签名比较)。 */
  window.setHTML = function(el, html){
    if(el && el._rcHTML !== html){ el.innerHTML = html; el._rcHTML = html; }
  };

  /* 类开关:声明式。 */
  window.setClass = function(el, cls, on){
    if(el) el.classList.toggle(cls, !!on);
  };

  /* 属性:仅在变化时写。value 为 null/undefined 时移除该属性。 */
  window.setAttr = function(el, name, value){
    if(!el) return;
    if(value == null){ if(el.hasAttribute(name)) el.removeAttribute(name); return; }
    const s = String(value);
    if(el.getAttribute(name) !== s) el.setAttribute(name, s);
  };

  /* 键控列表调和:按 key 复用行 DOM,只增/删/移动/更新必要节点。
     约定:listEl 内只放键控行(表头/空态放在 listEl 之外或由调用方另行处理)。
     opts: {
       key(item)    -> string   稳定唯一键(如 item.id)
       create(item) -> Element  新行(含只需建一次的结构与事件绑定)
       update(el, item) -> void 幂等地把 item 数据写进已存在的行
     }
     防御(审查确认过的两类事故):
     - 拖拽进行中(dragsort 的 .drag-placeholder 在场)跳过本次调和——
       调和会把无 key 的占位符挤到列表尾,落点时把错误顺序写库;
       跳过一帧无害,落点后的 onReorder→save→render 会补画。
     - items 出现重复 key 时只渲染首个,且清扫一切未被本轮认领的键控节点,
       不会像朴素 Map 版那样每轮渲染泄漏一个幽灵行。 */
  window.reconcileList = function(listEl, items, opts){
    if(!listEl) return;
    if(listEl.querySelector(':scope > .drag-placeholder, :scope > .dragging')) return;
    const pools = new Map();
    for(const child of Array.from(listEl.children)){
      const k = child.dataset && child.dataset.key;
      if(k == null) continue;
      const pool = pools.get(k);
      if(pool) pool.push(child); else pools.set(k, [child]);
    }
    const claimed = new Set(), seen = new Set();
    let prev = null;
    for(const item of items){
      const k = String(opts.key(item));
      if(seen.has(k)) continue;
      seen.add(k);
      const pool = pools.get(k);
      let el = (pool && pool.length) ? pool.shift() : null;
      if(!el){ el = opts.create(item); el.dataset.key = k; }
      claimed.add(el);
      opts.update(el, item);
      const anchor = prev ? prev.nextSibling : listEl.firstChild;
      if(el !== anchor) listEl.insertBefore(el, anchor);
      prev = el;
    }
    for(const child of Array.from(listEl.children)){
      if(child.dataset && child.dataset.key != null && !claimed.has(child)) child.remove();
    }
  };
})();
