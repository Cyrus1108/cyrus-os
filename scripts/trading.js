/* Trading desk — daily checklist + bias notes (sessions are rendered in app.js tick) */
let trOpen=false;
function toggleTRForm(){trOpen=!trOpen;document.getElementById('tr-new-form').style.display=trOpen?'block':'none';}
function addTRItem(){const t=document.getElementById('tr-new-text').value.trim();if(!t)return;S.tr.list.push({id:'t'+Date.now(),t,d:false});document.getElementById('tr-new-text').value='';trOpen=false;document.getElementById('tr-new-form').style.display='none';saveTR();rTR();rMetrics();}
function toggleTR(id){const i=S.tr.list.find(i=>i.id===id);if(i)i.d=!i.d;saveTR();rTR();rMetrics();}
function delTR(id){if(editingTR===id)editingTR=null;S.tr.list=S.tr.list.filter(i=>i.id!==id);saveTR();rTR();}
function startTREdit(id){editingTR=id;rTR();}
function cancelTREdit(){editingTR=null;rTR();}
function saveTREdit(id){const i=S.tr.list.find(i=>i.id===id);if(!i)return;const t=document.getElementById('et-text').value.trim();if(!t)return;i.t=t;editingTR=null;saveTR();rTR();}
let bT;function onBias(){S.tr.bias=document.getElementById('t-bias').value;clearTimeout(bT);bT=setTimeout(saveTR,600);}

function rTR(){
  document.getElementById('tr-list').innerHTML=S.tr.list.map(i=>{
    if(editingTR===i.id){
      return `<div style="padding:5px 0;border-bottom:.5px solid var(--hair);"><div class="edit-box" style="flex-direction:row;padding:6px;align-items:center;">
        <input id="et-text" value="${escH(i.t)}" style="flex:1;">
        <button class="primary fx-btn" onclick="saveTREdit('${i.id}')">保存</button>
        <button class="ghost fx-btn" onclick="cancelTREdit()">×</button>
      </div></div>`;
    }
    return `<div class="row ${i.d?'item-done':''}" data-id="${i.id}">
      <span class="drag-handle" onclick="event.stopPropagation()" aria-label="拖动排序">⠿</span>
      <input type="checkbox" class="row-cb" ${i.d?'checked':''} onchange="toggleTR('${i.id}')">
      <div class="row-body"><span class="item-text">${escH(i.t)}</span></div>
      <div class="row-actions">
        <button class="row-btn" onclick="startTREdit('${i.id}')">编辑</button>
        <button class="row-btn" onclick="delTR('${i.id}')">×</button>
      </div>
    </div>`;
  }).join('');
  const be=document.getElementById('t-bias');if(be&&document.activeElement!==be)be.value=S.tr.bias||'';
  attachRipples();
  makeSortable(document.getElementById('tr-list'), { itemSelector:'.row', handleSelector:'.drag-handle', onReorder:onReorderTR });
}
function onReorderTR(ids){
  S.tr.list = reorderById(S.tr.list, ids);
  saveTR();rTR();
}
