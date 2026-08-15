/* 目标 (Goals) —— 只存 localStorage,不进 Supabase。
   Supabase 那边没有 goals 表,本次也不改 schema,所以这一层走 saveLSRaw 写
   `cyrus_dashboard_v6_goals`,既不进 SETTINGS_KEYS 也不碰 dirty 标志 —— 也就
   永远不会触发任何推送。换设备不同步是有意的取舍(见交付报告)。

   形态:S.goals = [{ id, title, desc, deadline:'YYYY-MM-DD'|'', done, doneAt, position, created }]

   渲染沿用 v7 的骨架 + 键控行调和(render-core.js):行是持久节点,无关的
   renderAll 不会把用户正按着的按钮拆掉重建。日期用全站统一的主题日历
   (finOpenCal + dateField),不用原生 <input type=date>。 */

/* 首次运行的种子目标 —— 只在本机从没存过 goals 时写入一次。 */
const GOALS_SEED = [
  { title: '8/31 前 NT$26,000 宿舍费有着落', desc: '', deadline: '2026-08-31' },
  { title: 'S2 内第一笔生意收入',             desc: '', deadline: '2026-11-13' },
];

let editingGoal = null;
let goalFormOpen = false;
let _goalNavFor = null;   // 已经给哪一行的编辑框武装过键盘导航(每次打开只装一次)

function saveGoals(){ saveLSRaw('goals', S.goals); }

function initGoals(){
  const stored = loadLS('goals', null);
  if(Array.isArray(stored)){ S.goals = stored; return; }
  // 第一次:种下两条。之后就算用户把它们删光(存成 []),也不会再种回来。
  S.goals = GOALS_SEED.map((g, i) => ({
    id: crypto.randomUUID(),
    title: g.title, desc: g.desc, deadline: g.deadline,
    done: false, doneAt: null,
    position: i, created: TODAY,
  }));
  saveGoals();
}

/* ════════ Interactions(手势路径:音效写在状态落地之后、守卫之内)════════ */

function toggleGoalForm(){
  goalFormOpen = !goalFormOpen;
  const f = document.getElementById('goal-form');
  if(f) f.style.display = goalFormOpen ? 'block' : 'none';
  if(goalFormOpen){
    setDateField('goal-deadline', '');
    requestAnimationFrame(()=> openFormNav(document.getElementById('goal-form')));
  } else {
    closeFormNav();
  }
}

function addGoal(){
  const title = document.getElementById('goal-title').value.trim();
  if(!title) return;
  const desc = document.getElementById('goal-desc').value.trim();
  const deadline = document.getElementById('goal-deadline').value;
  const maxPos = S.goals.reduce((m,g)=>Math.max(m, g.position||0), 0);
  S.goals.push({
    id: crypto.randomUUID(),
    title, desc, deadline,
    done: false, doneAt: null,
    position: maxPos + 1, created: TODAY,
  });
  document.getElementById('goal-title').value = '';
  document.getElementById('goal-desc').value = '';
  setDateField('goal-deadline', '');
  closeFormNav();
  toggleGoalForm();
  if(window.Sfx) Sfx.save();
  saveGoals(); rGoals();
}

function toggleGoal(id){
  const g = S.goals.find(g=>g.id===id);
  if(!g) return;
  // 三拍:勾选框会被 setHTML 重写,但它所在的行是 reconcile 复用的持久节点,
  // 所以 beatTap 对行做 transform,渲染后仍是同一节点,动画不断。
  const row = document.querySelector(`#goal-rows [data-id="${id}"]`);
  const apply = function(){
    g.done = !g.done;
    g.doneAt = g.done ? Date.now() : null;
    saveGoals();
    if(window.Sfx){ g.done ? Sfx.quest() : Sfx.untick(); }
    // 达成一个目标是仪式时刻(§2.4 配额辉光,≤800ms 归零,零状态副作用)
    if(g.done && typeof window.ritualPulse === 'function'){
      window.ritualPulse(document.getElementById('goals-panel'));
    }
    rGoals();
  };
  if(window.beatTap && row) window.beatTap(row, apply);
  else apply();
}

function delGoal(id){
  if(editingGoal===id) editingGoal = null;
  S.goals = S.goals.filter(g=>g.id!==id);
  saveGoals(); rGoals();
}

function startGoalEdit(id){ editingGoal = id; rGoals(); }
function cancelGoalEdit(){ closeFormNav(); editingGoal = null; rGoals(); }
function saveGoalEdit(id){
  const g = S.goals.find(g=>g.id===id);
  if(!g) return;
  const title = document.getElementById('eg-title').value.trim();
  if(!title) return;
  g.title = title;
  g.desc = document.getElementById('eg-desc').value.trim();
  g.deadline = document.getElementById('eg-deadline').value;
  closeFormNav(); editingGoal = null;
  saveGoals(); rGoals();
}

function onReorderGoals(ids){
  S.goals = reorderById(S.goals, ids);
  S.goals.forEach((g,i)=> g.position = i);
  saveGoals(); rGoals();
}

/* ════════ Render ════════ */

/* TODAY 到期限之间差几天。正数 = 还有;负数 = 已经逾期。 */
function goalDaysLeft(deadline){
  const a = new Date(TODAY + 'T00:00:00+08:00');
  const b = new Date(deadline + 'T00:00:00+08:00');
  return Math.round((b - a) / 86400000);
}

/* 倒数标签:达成 / 无期限 / 逾期 Xd(红) / 今天 / Xd。 */
function goalCountdown(g){
  if(g.done) return { cls:'tag-done', txt:'达成' };
  if(!g.deadline) return { cls:'tag-ok', txt:'无期限' };
  const d = goalDaysLeft(g.deadline);
  if(d < 0) return { cls:'tag-urgent', txt:`逾期 ${-d}d` };
  if(d === 0) return { cls:'tag-warn', txt:'今天' };
  if(d <= 7) return { cls:'tag-warn', txt:`${d}d` };
  return { cls:'tag-ok', txt:`${d}d` };
}

function goalEditInner(g){
  return `<div class="edit-box">
      <input id="eg-title" value="${escH(g.title)}" placeholder="想达成什么…" style="width:100%;">
      <textarea id="eg-desc" placeholder="说明(可选)" style="width:100%;height:52px;resize:none;">${escH(g.desc||'')}</textarea>
      <div class="field-row">
        <span class="field-label">期限</span>
        ${dateField('eg-deadline', g.deadline||'')}
      </div>
      <div style="display:flex;gap:6px;">
        <button class="primary fx-btn" onclick="saveGoalEdit('${g.id}')" style="flex:1;">保存</button>
        <button class="ghost fx-btn" onclick="cancelGoalEdit()" style="flex:1;">取消</button>
      </div>
    </div>`;
}

function goalRowInner(g){
  const cd = goalCountdown(g);
  return `<span class="drag-handle" onclick="event.stopPropagation()" aria-label="拖动排序">⠿</span>
      <input type="checkbox" class="row-cb" ${g.done?'checked':''} onchange="toggleGoal('${g.id}')">
      <div class="goal-body">
        <div class="goal-title">${escH(g.title)}</div>
        ${g.desc?`<div class="goal-desc">${escH(g.desc)}</div>`:''}
        <div class="goal-meta">
          ${g.deadline?`<span class="ac-date">${escH(g.deadline)}</span>`:''}
          <span class="tag ${cd.cls}">${escH(cd.txt)}</span>
        </div>
      </div>
      <div class="row-actions">
        <button class="row-btn" onclick="startGoalEdit('${g.id}')">编辑</button>
        <button class="row-btn" onclick="delGoal('${g.id}')">×</button>
      </div>`;
}

function rGoals(){
  const el = document.getElementById('goal-list');
  if(!el) return;
  if(!Array.isArray(S.goals)) S.goals = [];

  // 骨架一次成型:行容器 + 空态节点。makeSortable 只在建骨架那一次绑上去。
  if(ensureSkeleton(el, 'goal-v1', ()=>`<div id="goal-rows"></div><div class="empty" id="goal-empty">— 还没有目标 —</div>`)){
    makeSortable(el.querySelector('#goal-rows'), {
      itemSelector:'.goal-card', handleSelector:'.drag-handle', onReorder:onReorderGoals
    });
  }
  const rowsEl = el.querySelector('#goal-rows');
  const emptyEl = el.querySelector('#goal-empty');

  const list = S.goals.slice().sort((a,b)=>{
    if(a.done !== b.done) return a.done ? 1 : -1;      // 达成的沉到底部
    return (a.position||0) - (b.position||0);          // 手动拖拽顺序
  });
  emptyEl.style.display = list.length ? 'none' : '';

  const activeN = S.goals.filter(g=>!g.done).length;
  const countEl = document.getElementById('goal-count');
  if(countEl){
    const prev = parseInt(countEl.textContent) || 0;
    if(typeof animateNumber==='function') animateNumber(countEl, prev, activeN, 400);
    else setText(countEl, String(activeN));
  }
  // 微标签用真实统计(§SOVEREIGN:微标签必须是真实数据)
  setText(document.getElementById('goal-micro-n'), String(activeN));

  reconcileList(rowsEl, list, {
    key: g => g.id,
    create: g => { const d = document.createElement('div'); d.dataset.id = g.id; return d; },
    update: (d, g) => {
      if(editingGoal === g.id){
        d.classList.remove('goal-card','goal-done');
        setAttr(d, 'style', 'padding:6px 0;border-bottom:.5px solid var(--hair);');
        if(setHTML(d, goalEditInner(g))) _goalNavFor = null;   // 编辑框被真的重写 → 重新武装导航器
      } else {
        d.classList.add('goal-card');
        d.classList.toggle('goal-done', !!g.done);
        setAttr(d, 'style', null);
        setHTML(d, goalRowInner(g));
      }
    }
  });

  attachRipples(rowsEl);
  if(editingGoal){
    if(_goalNavFor !== editingGoal){
      _goalNavFor = editingGoal;
      const box = rowsEl.querySelector('.edit-box');
      if(box) requestAnimationFrame(()=>openFormNav(box));
    }
  } else {
    _goalNavFor = null;
  }
}
