/* Japanese N2 — daily check-in + practice list + streak */
let jpOpen=false;
function toggleJPForm(){jpOpen=!jpOpen;document.getElementById('jp-new-form').style.display=jpOpen?'block':'none';}
function addJPItem(){const t=document.getElementById('jp-new-text').value.trim();if(!t)return;S.jp.list.push({id:'j'+Date.now(),t,d:false});document.getElementById('jp-new-text').value='';jpOpen=false;document.getElementById('jp-new-form').style.display='none';saveJP();rJP();}
function toggleJP(id){const i=S.jp.list.find(i=>i.id===id);if(i)i.d=!i.d;saveJP();rJP();rMetrics();}
function delJP(id){if(editingJP===id)editingJP=null;S.jp.list=S.jp.list.filter(i=>i.id!==id);saveJP();rJP();}
function startJPEdit(id){editingJP=id;rJP();}
function cancelJPEdit(){editingJP=null;rJP();}
function saveJPEdit(id){const i=S.jp.list.find(i=>i.id===id);if(!i)return;const t=document.getElementById('ej-text').value.trim();if(!t)return;i.t=t;editingJP=null;saveJP();rJP();}

function checkIn(){
  const was=S.jp.log[TODAY];
  if(!was){S.jp.log[TODAY]=true;const y=new Date();y.setDate(y.getDate()-1);const ys=y.toLocaleDateString('sv-SE');S.jp.streak=(S.jp.last===ys)?S.jp.streak+1:1;S.jp.last=TODAY;}
  else{delete S.jp.log[TODAY];S.jp.streak=Math.max(0,S.jp.streak-1);S.jp.last=Object.keys(S.jp.log).sort().reverse()[0]||null;}
  saveJP();rJP();rMetrics();
}
let jpNT;function onJPNote(){S.jp.note=document.getElementById('jp-note').value;clearTimeout(jpNT);jpNT=setTimeout(saveJP,600);}

function rJP(){
  document.getElementById('streak-n').textContent=S.jp.streak;
  const now=new Date(),dow=now.getDay();
  const mon=new Date(now);mon.setDate(now.getDate()-(dow===0?6:dow-1));
  const labs=['M','T','W','T','F','S','S'];
  document.getElementById('week-grid').innerHTML=Array.from({length:7},(_,i)=>{
    const d=new Date(mon);d.setDate(mon.getDate()+i);
    const ds=d.toLocaleDateString('sv-SE'),isT=ds===TODAY,done=S.jp.log[ds],fut=ds>TODAY;
    const cls=['jp-day-cell'];if(done)cls.push('done');if(fut)cls.push('future');if(isT)cls.push('today');
    return `<div class="jp-day"><div class="jp-day-label">${labs[i]}</div><div class="${cls.join(' ')}"></div></div>`;
  }).join('');
  const ci=S.jp.log[TODAY],btn=document.getElementById('ci-btn');
  btn.textContent=ci?'— Completed today —':'Check in today';
  btn.classList.toggle('done',!!ci);
  document.getElementById('jp-checklist').innerHTML=S.jp.list.map(i=>{
    if(editingJP===i.id){
      return `<div style="padding:5px 0;border-bottom:.5px solid var(--hair);"><div class="edit-box" style="flex-direction:row;padding:6px;align-items:center;">
        <input id="ej-text" value="${escH(i.t)}" style="flex:1;">
        <button class="primary fx-btn" onclick="saveJPEdit('${i.id}')">保存</button>
        <button class="ghost fx-btn" onclick="cancelJPEdit()">×</button>
      </div></div>`;
    }
    return `<div class="row ${i.d?'item-done':''}">
      <input type="checkbox" class="row-cb" ${i.d?'checked':''} onchange="toggleJP('${i.id}')">
      <div class="row-body"><span class="item-text">${escH(i.t)}</span></div>
      <div class="row-actions">
        <button class="row-btn" onclick="startJPEdit('${i.id}')">编辑</button>
        <button class="row-btn" onclick="delJP('${i.id}')">×</button>
      </div>
    </div>`;
  }).join('');
  const ne=document.getElementById('jp-note');if(ne&&document.activeElement!==ne)ne.value=S.jp.note||'';
  attachRipples();
}
