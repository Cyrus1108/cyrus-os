/* Academics — university coursework with reminders */
let acOpen=false;
function toggleAcForm(){
  acOpen=!acOpen;
  document.getElementById('ac-form').style.display=acOpen?'block':'none';
  if(acOpen){ requestAnimationFrame(()=>openFormNav(document.getElementById('ac-form'))); }
  else { closeFormNav(); }
}

/* ════ Subject presets ════ */
function toggleSubManage(){document.getElementById('sub-manage').classList.toggle('open');}
function addSubject(){
  const inp = document.getElementById('sub-new');
  const name = inp.value.trim();
  if(!name) return;
  if(!Array.isArray(S.subjects)) S.subjects = [];
  if(S.subjects.includes(name)){inp.value=''; return;}
  S.subjects.push(name);
  inp.value = '';
  saveLS('subjects', S.subjects);
  renderSubjects();
}
function delSubject(name){
  S.subjects = (Array.isArray(S.subjects) ? S.subjects : []).filter(s => s !== name);
  saveLS('subjects', S.subjects);
  renderSubjects();
}
function renderSubjects(){
  const subjects = Array.isArray(S.subjects) ? S.subjects : [];
  // <datalist> options — picks up via list="ac-subjects-list" on the input
  const dl = document.getElementById('ac-subjects-list');
  if(dl) dl.innerHTML = subjects.map(s => `<option value="${escH(s)}">`).join('');
  // Manage panel chips
  const list = document.getElementById('sub-list');
  if(list) list.innerHTML = subjects.length
    ? subjects.map(s => `<div class="cat-item">${escH(s)}<button class="cat-del" onclick="delSubject('${escH(s).replace(/'/g,'&#39;')}')">×</button></div>`).join('')
    : '<div style="color:var(--ghost);font-style:italic;font-size:11px;">尚无预设 · 加几个科目让下次添加更快</div>';
}
function addAcTask(){
  const sub=document.getElementById('f-sub').value.trim(),name=document.getElementById('f-name').value.trim(),date=document.getElementById('f-date').value,time=document.getElementById('f-time').value,pri=document.getElementById('f-pri').value,remind=readRemind('f-remind','f-rc-num','f-rc-unit');
  if(!sub||!name||!date)return;
  const maxPos = S.ac.reduce((m,t)=>Math.max(m,t.position||0),0);
  S.ac.push({id:crypto.randomUUID(),sub,name,date,time,pri,remind,done:false,position:maxPos+1});
  document.getElementById('f-sub').value='';
  document.getElementById('f-name').value='';
  setDateField('f-date','');
  setTimeField('f-time','');
  segSet('f-pri','mid');
  segSet('f-remind','60','onRemindSeg');
  document.getElementById('f-rc').style.display='none';
  closeFormNav();toggleAcForm();saveAC();rAC();rMetrics();
}
function toggleAC(id){const t=S.ac.find(t=>t.id===id);if(t){ t.done=!t.done; if(window.Sfx){ t.done?Sfx.tick():Sfx.untick(); } }saveAC();rAC();rMetrics();if(typeof rpgAfterChange==='function')rpgAfterChange();}
function delAC(id){if(editingAC===id)editingAC=null;S.ac=S.ac.filter(t=>t.id!==id);saveAC();rAC();rMetrics();}
function startAcEdit(id){editingAC=id;rAC();}
function cancelAcEdit(){closeFormNav();editingAC=null;rAC();}
function saveAcEdit(id){
  const t=S.ac.find(t=>t.id===id);if(!t)return;
  const sub=document.getElementById('ea-sub').value.trim();
  const name=document.getElementById('ea-name').value.trim();
  const date=document.getElementById('ea-date').value;
  const time=document.getElementById('ea-time').value;
  const pri=document.getElementById('ea-pri').value;
  const remind=readRemind('ea-remind','ea-rc-num','ea-rc-unit');
  if(!sub||!name||!date)return;
  t.sub=sub;t.name=name;t.date=date;t.time=time;t.pri=pri;t.remind=remind;
  closeFormNav();editingAC=null;saveAC();rAC();rMetrics();
}

function rAC(){
  const el=document.getElementById('ac-list');
  const all=[...S.ac].sort((a,b)=> a.done!==b.done ? (a.done?1:-1) : (a.position||0)-(b.position||0));
  if(!all.length){el.innerHTML='<div class="empty">— 暂无待办 —</div>';return;}
  el.innerHTML=all.map(t=>{
    if(editingAC===t.id){
      return `<div style="padding:6px 0;border-bottom:.5px solid var(--hair);">
        <div class="edit-box">
          <input id="ea-sub" value="${escH(t.sub)}" placeholder="科目" list="ac-subjects-list" style="width:100%;">
          <input id="ea-name" value="${escH(t.name)}" placeholder="内容" style="width:100%;">
          <div class="field-row">
            <span class="field-label">截止</span>
            ${dateField('ea-date', t.date||'')}
          </div>
          <div class="field-row">
            <span class="field-label">时间</span>
            ${timeField('ea-time', (t.time||'').slice(0,5))}
          </div>
          ${segField('ea-pri', t.pri||'mid', [['high','高'],['mid','中'],['low','低']])}
          ${chipField('ea-remind', [0,15,60,240,1440,2880].includes(t.remind)?String(t.remind):'custom', [['0','不提醒'],['15','15分钟'],['60','1小时'],['240','4小时'],['1440','1天'],['2880','2天'],['custom','自定义']], 'onRemindSeg')}
          ${remindCustomRow('ea', ![0,15,60,240,1440,2880].includes(t.remind), decomposeRemind(t.remind).num, decomposeRemind(t.remind).unit)}
          <div style="display:flex;gap:6px;">
            <button class="primary fx-btn" onclick="saveAcEdit('${t.id}')" style="flex:1;">保存</button>
            <button class="ghost fx-btn" onclick="cancelAcEdit()" style="flex:1;">取消</button>
          </div>
        </div>
      </div>`;
    }
    const days=Math.ceil((new Date(t.date+'T23:59:59')-new Date())/86400000);
    let tagCls='tag-ok',tagTxt=days+' days';
    if(t.done){tagCls='tag-done';tagTxt='Done';}
    else if(days<=0){tagCls='tag-urgent';tagTxt='Overdue';}
    else if(days<=3){tagCls='tag-warn';tagTxt=days+' days';}
    const priColor=t.pri==='high'?'var(--color-text-danger)':t.pri==='low'?'var(--ghost)':'var(--brass)';
    return `<div class="row ${t.done?'item-done':''}" data-id="${t.id}" style="${t.done?'opacity:.4;':''}">
      <span class="drag-handle" onclick="event.stopPropagation()" aria-label="拖动排序">⠿</span>
      <input type="checkbox" class="row-cb" ${t.done?'checked':''} onchange="toggleAC('${t.id}')">
      <span class="ac-pri" style="background:${priColor};"></span>
      <div class="row-body">
        <div class="ac-subject">${escH(t.sub)}</div>
        <div class="ac-name">${escH(t.name)}</div>
        <div class="ac-meta">
          <span class="ac-date">${t.date}${t.time?' '+t.time.slice(0,5):''}</span>
          <span class="tag ${tagCls}">${tagTxt}</span>
          ${t.remind>0?`<span class="ac-bell">⏰ ${formatRemind(t.remind)}</span>`:''}
        </div>
      </div>
      <div class="row-actions">
        <button class="row-btn" onclick="startAcEdit('${t.id}')">编辑</button>
        <button class="row-btn" onclick="delAC('${t.id}')">×</button>
      </div>
    </div>`;
  }).join('');
  renderSubjects();
  attachRipples();
  makeSortable(el, { itemSelector:'.row', handleSelector:'.drag-handle', onReorder:onReorderAC });
  if(editingAC){
    const box = el.querySelector('.edit-box');
    if(box) requestAnimationFrame(()=>openFormNav(box));
  }
}
function onReorderAC(ids){
  S.ac = reorderById(S.ac, ids);
  S.ac.forEach((t,i)=>t.position=i);
  saveAC();rAC();
}
