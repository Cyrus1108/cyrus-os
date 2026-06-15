/* General todos + categories */
function rCats(){
  const pills = document.getElementById('cat-pills');
  const allActive = S.activeCat === 'all';
  let html = `<button class="cat-pill ${allActive?'active':''}" onclick="setActiveCat('all')">全部</button>`;
  S.cats.forEach(c=>{
    const isActive = S.activeCat === c.id;
    html += `<button class="cat-pill ${isActive?'active':''}" onclick="setActiveCat('${c.id}')">${escH(c.name)}</button>`;
  });
  html += `<button class="cat-pill cat-pill-manage" onclick="toggleCatManage()">+ 类别</button>`;
  pills.innerHTML = html;

  const selOptions = S.cats.map(c=>`<option value="${c.id}">${escH(c.name)}</option>`).join('');
  const sel = document.getElementById('td-cat');
  if(sel){
    const currentVal = sel.value;
    sel.innerHTML = selOptions;
    if([...sel.options].some(o=>o.value===currentVal)) sel.value = currentVal;
  }

  document.getElementById('cat-list').innerHTML = S.cats.map(c=>
    `<div class="cat-item">${escH(c.name)}<button class="cat-del" onclick="delCategory('${c.id}')">×</button></div>`
  ).join('');
}
function setActiveCat(id){S.activeCat=id;rCats();rTodos();}
function toggleCatManage(){document.getElementById('cat-manage').classList.toggle('open');}
function addCategory(){
  const inp = document.getElementById('cat-new');
  const name = inp.value.trim();
  if(!name) return;
  S.cats.push({id:crypto.randomUUID(), name});
  inp.value = '';
  saveCats(); rCats();
}
function delCategory(id){
  if(S.cats.length <= 1){alert('至少保留一个类别');return;}
  const remaining = S.cats.filter(c=>c.id!==id);
  S.todos.forEach(t=>{if(t.cat===id) t.cat = remaining[0].id;});
  S.cats = remaining;
  if(S.activeCat === id) S.activeCat = 'all';
  saveCats(); saveTodos(); rCats(); rTodos();
}

let tdOpen=false;
function toggleTdForm(){
  tdOpen=!tdOpen;
  document.getElementById('td-form').style.display = tdOpen?'block':'none';
  if(tdOpen){
    setDateField('td-date', TODAY);
    setTimeField('td-time', '');
    segSet('td-pri', 'mid');
    segSet('td-remind', '15', 'onRemindSeg');
    const nc=document.getElementById('td-nocarry'); if(nc) nc.checked=false;
    rCats();
    // Open form navigator so ↑↓/Enter keyboard flow works immediately
    requestAnimationFrame(()=>openFormNav(document.getElementById('td-form')));
  } else {
    closeFormNav();
  }
}
function addTodo(){
  const text = document.getElementById('td-text').value.trim();
  const cat = document.getElementById('td-cat').value;
  const date = document.getElementById('td-date').value;
  const time = document.getElementById('td-time').value;
  const pri = document.getElementById('td-pri').value;
  const remind = readRemind('td-remind', 'td-rc-num', 'td-rc-unit');
  const repeat = document.getElementById('td-repeat').value;
  const customDays = parseInt(document.getElementById('td-repeat-custom').value) || 0;
  const noCarry = document.getElementById('td-nocarry')?.checked || false;
  if(!text) return;
  const maxPos = S.todos.reduce((m,t)=>Math.max(m, t.position||0), 0);
  S.todos.push({
    id:crypto.randomUUID(),
    text,cat,date,time,pri,remind,repeat,customDays,done:false,doneAt:null,
    noCarry, archived:false, archivedAt:null,
    position: maxPos+1,
    created:TODAY
  });
  document.getElementById('td-text').value='';
  setDateField('td-date','');
  setTimeField('td-time','');
  segSet('td-pri','mid');
  segSet('td-remind','15','onRemindSeg');
  document.getElementById('td-repeat').value='none';
  document.getElementById('td-repeat-custom').value='';
  document.getElementById('td-repeat-custom').style.display='none';
  document.getElementById('td-rc').style.display='none';
  closeFormNav();
  toggleTdForm();
  saveTodos(); rTodos();
}

function toggleShowDone(){
  showDone = !showDone;
  saveLS('show_done', showDone);
  rTodos();
  updateShowDoneBtn();
}
function updateShowDoneBtn(){
  const btn = document.getElementById('show-done-btn');
  if(btn){
    const doneCount = S.todos.filter(t=>t.done).length;
    btn.textContent = showDone ? `隐藏已完成 (${doneCount})` : `显示已完成 (${doneCount})`;
  }
}

function rTodos(){
  const el = document.getElementById('td-list');
  updateArchivedBtn();
  rTodosArchived();
  let list = S.todos.slice();
  list = list.filter(t=>!t.archived);                          // archived (expired & swept) live in their own drawer
  if(S.activeCat !== 'all') list = list.filter(t=>t.cat===S.activeCat);
  if(!showDone) list = list.filter(t=>!t.done);
  list.sort((a,b)=>{
    if(a.done !== b.done) return a.done?1:-1;       // done sink to bottom
    return (a.position||0) - (b.position||0);        // manual drag order
  });

  if(!list.length){el.innerHTML='<div class="empty">— 暂无待办 —</div>';return;}
  // (drag-to-reorder wired at the end of this function)

  el.innerHTML = list.map(t=>{
    if(editingTD === t.id){
      return `<div style="padding:6px 0;border-bottom:.5px solid var(--hair);">
        <div class="edit-box">
          <input id="etd-text" value="${escH(t.text)}" style="width:100%;">
          <select id="etd-cat" style="width:100%;">
            ${S.cats.map(c=>`<option value="${c.id}" ${c.id===t.cat?'selected':''}>${escH(c.name)}</option>`).join('')}
          </select>
          <div class="field-row">
            <span class="field-label">截止</span>
            ${dateField('etd-date', t.date||'')}
          </div>
          <div class="field-row">
            <span class="field-label">时间</span>
            ${timeField('etd-time', (t.time||'').slice(0,5))}
          </div>
          ${segField('etd-pri', t.pri||'mid', [['high','高'],['mid','中'],['low','低']])}
          ${chipField('etd-remind', [0,5,15,60,1440].includes(t.remind)?String(t.remind):'custom', [['0','不提醒'],['5','5分钟'],['15','15分钟'],['60','1小时'],['1440','1天'],['custom','自定义']], 'onRemindSeg')}
          ${remindCustomRow('etd', ![0,5,15,60,1440].includes(t.remind), decomposeRemind(t.remind).num, decomposeRemind(t.remind).unit)}
          <select id="etd-repeat" onchange="toggleEtdCustom()" style="width:100%;">
            <option value="none" ${t.repeat==='none'?'selected':''}>不重复</option>
            <option value="daily" ${t.repeat==='daily'?'selected':''}>每日</option>
            <option value="weekdays" ${t.repeat==='weekdays'?'selected':''}>仅工作日</option>
            <option value="weekends" ${t.repeat==='weekends'?'selected':''}>仅周末</option>
            <option value="weekly" ${t.repeat==='weekly'?'selected':''}>每周</option>
            <option value="biweekly" ${t.repeat==='biweekly'?'selected':''}>每两周</option>
            <option value="monthly" ${t.repeat==='monthly'?'selected':''}>每月</option>
            <option value="quarterly" ${t.repeat==='quarterly'?'selected':''}>每季</option>
            <option value="yearly" ${t.repeat==='yearly'?'selected':''}>每年</option>
            <option value="custom_days" ${t.repeat==='custom_days'?'selected':''}>自定义天数…</option>
          </select>
          <input id="etd-custom" type="number" min="1" max="365" value="${t.customDays||''}" placeholder="每隔几天重复" style="width:100%;${t.repeat==='custom_days'?'':'display:none;'}">
          <label class="td-nocarry-row"><input type="checkbox" id="etd-nocarry" ${t.noCarry?'checked':''}> 过期不顺延 · 当天结束后自动归档</label>
          <div style="display:flex;gap:6px;">
            <button class="primary fx-btn" onclick="saveTdEdit('${t.id}')" style="flex:1;">保存</button>
            <button class="ghost fx-btn" onclick="cancelTdEdit()" style="flex:1;">取消</button>
          </div>
        </div>
      </div>`;
    }
    const cat = S.cats.find(c=>c.id===t.cat);
    const priColor = t.pri==='high'?'var(--color-text-danger)':t.pri==='low'?'var(--ghost)':'var(--brass)';
    let dateStr = '';
    let tagCls='tag-ok', tagTxt='';
    if(t.date){
      // Defensive: t.time may be 'HH:MM' (input) or 'HH:MM:SS' (from Postgres) — strip to 'HH:MM'
      const hhmm = t.time ? t.time.slice(0,5) : null;
      const dueTime = hhmm ? `${t.date}T${hhmm}:00` : `${t.date}T23:59:59`;
      const diff = new Date(dueTime) - new Date();
      const hours = Math.ceil(diff/3600000);
      const days = Math.ceil(diff/86400000);
      if(t.done){tagCls='tag-done';tagTxt='Done';}
      else if(diff<0){tagCls='tag-urgent';tagTxt='Overdue';}
      else if(hours<=24){tagCls='tag-warn';tagTxt=hours+'h';}
      else{tagCls='tag-ok';tagTxt=days+'d';}
      dateStr = t.date + (hhmm ? ' '+hhmm : '');
    } else {
      tagTxt = t.done?'Done':'No due';
      tagCls = t.done?'tag-done':'tag-ok';
    }
    return `<div class="todo-row ${t.done?'todo-done':''}" data-id="${t.id}" style="${t.done?'opacity:.4;':''}">
      <div class="todo-main">
        <span class="drag-handle" onclick="event.stopPropagation()" aria-label="拖动排序">⠿</span>
        <input type="checkbox" class="row-cb" ${t.done?'checked':''} onchange="toggleTd('${t.id}')">
        <span class="ac-pri" style="background:${priColor};"></span>
        <div class="todo-body">
          <div class="todo-text">${escH(t.text)}</div>
          <div class="todo-meta">
            ${cat?`<span class="tag tag-cat">${escH(cat.name)}</span>`:''}
            ${dateStr?`<span class="ac-date">${dateStr}</span>`:''}
            <span class="tag ${tagCls}">${tagTxt}</span>
            ${t.remind>0?`<span class="ac-bell">⏰ ${formatRemind(t.remind)}</span>`:''}
            ${t.repeat&&t.repeat!=='none'?`<span class="ac-bell">↻ ${repeatLabel(t.repeat,t.customDays)}</span>`:''}
          </div>
        </div>
        <div class="row-actions">
          <button class="row-btn" onclick="startTdEdit('${t.id}')">编辑</button>
          <button class="row-btn" onclick="delTodo('${t.id}')">×</button>
        </div>
      </div>
    </div>`;
  }).join('');
  attachRipples();
  makeSortable(el, { itemSelector:'.todo-row', handleSelector:'.drag-handle', onReorder:onReorderTodos });
  // Open form navigator on the edit box if an item is being edited
  if(editingTD){
    const box = el.querySelector('.edit-box');
    if(box) requestAnimationFrame(()=>openFormNav(box));
  }
}
function onReorderTodos(ids){
  S.todos = reorderById(S.todos, ids);
  const vis = ids.map(id=>S.todos.find(t=>String(t.id)===String(id))).filter(Boolean);
  if(vis.length){
    const base = Math.min(...vis.map(t=>t.position||0));
    vis.forEach((t,i)=> t.position = base+i);
  }
  saveTodos();
  rTodos();
}
function formatRemind(m){
  if(m>=1440) return Math.floor(m/1440)+'d';
  if(m>=60) return Math.floor(m/60)+'h';
  return m+'m';
}
function repeatLabel(r,customDays){
  if(r==='custom_days' && customDays) return `每${customDays}天`;
  return {daily:'每日',weekdays:'工作日',weekends:'周末',weekly:'每周',biweekly:'每两周',monthly:'每月',quarterly:'每季',yearly:'每年'}[r]||'';
}
function toggleTd(id){
  const t = S.todos.find(t=>t.id===id);
  if(!t) return;
  t.done = !t.done;
  if(t.done){t.doneAt = Date.now();}
  if(t.done && t.repeat && t.repeat !== 'none' && t.date){
    const nextDate = computeNextRepeatDate(t.date, t.repeat, t.customDays);
    if(nextDate){
      S.todos.push({...t,id:crypto.randomUUID(),date:nextDate,done:false,doneAt:null,created:TODAY,position:S.todos.reduce((m,x)=>Math.max(m,x.position||0),0)+1});
    }
  }
  if(window.Sfx){ t.done ? Sfx.tick() : Sfx.untick(); }
  saveTodos(); rTodos(); rMetrics(); updateShowDoneBtn(); if(typeof rpgAfterChange==='function')rpgAfterChange();
}
function computeNextRepeatDate(currentDate, repeat, customDays){
  const next = new Date(currentDate+'T00:00:00');
  switch(repeat){
    case 'daily': next.setDate(next.getDate()+1); break;
    case 'weekdays':
      do{ next.setDate(next.getDate()+1); }
      while(next.getDay()===0 || next.getDay()===6);
      break;
    case 'weekends':
      do{ next.setDate(next.getDate()+1); }
      while(next.getDay()!==0 && next.getDay()!==6);
      break;
    case 'weekly': next.setDate(next.getDate()+7); break;
    case 'biweekly': next.setDate(next.getDate()+14); break;
    case 'monthly': next.setMonth(next.getMonth()+1); break;
    case 'quarterly': next.setMonth(next.getMonth()+3); break;
    case 'yearly': next.setFullYear(next.getFullYear()+1); break;
    case 'custom_days':
      if(!customDays || customDays<1) return null;
      next.setDate(next.getDate()+customDays);
      break;
    default: return null;
  }
  return next.toLocaleDateString('sv-SE');
}
function delTodo(id){
  if(editingTD===id) editingTD=null;
  S.todos = S.todos.filter(t=>t.id!==id);
  saveTodos(); rTodos(); rMetrics();
}
function startTdEdit(id){editingTD=id;rTodos();}
function cancelTdEdit(){closeFormNav();editingTD=null;rTodos();}
function saveTdEdit(id){
  const t = S.todos.find(t=>t.id===id);if(!t)return;
  const text = document.getElementById('etd-text').value.trim();
  if(!text) return;
  t.text = text;
  t.cat = document.getElementById('etd-cat').value;
  t.date = document.getElementById('etd-date').value;
  t.time = document.getElementById('etd-time').value;
  t.pri = document.getElementById('etd-pri').value;
  t.remind = readRemind('etd-remind', 'etd-rc-num', 'etd-rc-unit');
  t.repeat = document.getElementById('etd-repeat').value;
  t.customDays = parseInt(document.getElementById('etd-custom').value) || 0;
  t.noCarry = document.getElementById('etd-nocarry')?.checked || false;
  closeFormNav();editingTD=null;saveTodos();rTodos();rMetrics();
}
function toggleEtdCustom(){
  const sel = document.getElementById('etd-repeat');
  const inp = document.getElementById('etd-custom');
  if(sel && inp){inp.style.display = sel.value==='custom_days' ? 'block' : 'none';}
}
function toggleTdCustom(){
  const sel = document.getElementById('td-repeat');
  const inp = document.getElementById('td-repeat-custom');
  if(sel && inp){inp.style.display = sel.value==='custom_days' ? 'block' : 'none';}
}

/* ════════ 过期不顺延 · 自动归档 ════════
   A task flagged noCarry that's past its due date and still undone gets archived
   on day-rollover (init + after pull + midnight reload) so it stops nagging.
   Archived ≠ done: excluded from active list, counts, and RPG; kept in a drawer
   for restore/delete. Idempotent — only touches overdue+noCarry+undone+unarchived. */
let showArchived = false;
function sweepExpiredTodos(){
  let changed = false;
  S.todos.forEach(t=>{
    if(t.noCarry && !t.done && !t.archived && t.date && t.date < TODAY){
      t.archived = true; t.archivedAt = Date.now(); changed = true;
    }
  });
  if(changed) saveTodos();
  return changed;
}
function archivedTodos(){ return S.todos.filter(t=>t.archived).sort((a,b)=>(b.archivedAt||0)-(a.archivedAt||0)); }
function updateArchivedBtn(){
  const btn = document.getElementById('td-archived-btn'); if(!btn) return;
  const n = S.todos.filter(t=>t.archived).length;
  btn.style.display = n ? '' : 'none';
  btn.textContent = (showArchived?'隐藏已过期':'已过期') + ` (${n})`;
}
function toggleArchived(){ showArchived = !showArchived; rTodos(); }
function rTodosArchived(){
  const box = document.getElementById('td-archived'); if(!box) return;
  if(!showArchived){ box.innerHTML=''; return; }
  const list = archivedTodos();
  if(!list.length){ box.innerHTML='<div class="empty">— 无已过期任务 —</div>'; return; }
  box.innerHTML = `<div class="td-archived-head">已过期 · 未顺延（${list.length}）</div>` + list.map(t=>{
    const cat = S.cats.find(c=>c.id===t.cat);
    return `<div class="todo-row td-archived-row" data-id="${t.id}" style="opacity:.55;">
      <div class="todo-main">
        <span class="ac-pri" style="background:var(--ghost);"></span>
        <div class="todo-body">
          <div class="todo-text" style="text-decoration:line-through;">${escH(t.text)}</div>
          <div class="todo-meta">
            ${cat?`<span class="tag tag-cat">${escH(cat.name)}</span>`:''}
            ${t.date?`<span class="ac-date">${t.date}</span>`:''}
            <span class="tag tag-urgent">已过期</span>
          </div>
        </div>
        <div class="row-actions">
          <button class="row-btn" onclick="restoreTodo('${t.id}')">恢复</button>
          <button class="row-btn" onclick="delTodo('${t.id}')">×</button>
        </div>
      </div>
    </div>`;
  }).join('');
  if(typeof attachRipples==='function') attachRipples(box);
}
function restoreTodo(id){
  const t = S.todos.find(t=>t.id===id); if(!t) return;
  t.archived = false; t.archivedAt = null; t.noCarry = false;   // clear noCarry so the sweep won't re-archive it
  saveTodos(); rTodos(); rMetrics();
}
