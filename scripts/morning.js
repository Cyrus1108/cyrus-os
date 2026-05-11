/* Morning ritual — daily 8-step pill checklist */
function rMR(){
  const list=S.mr.list,done=list.filter(i=>i.d).length;
  const pct=Math.round(done/list.length*100);
  const remMins=list.filter(i=>!i.d).reduce((a,i)=>a+i.mins,0);
  document.getElementById('mr-bar').style.width=pct+'%';
  document.getElementById('mr-count').innerHTML=`${done}<span style="color:var(--brass-ghost);"> / ${list.length}</span>`;
  document.getElementById('mr-time').textContent=done===list.length?'All complete':`~ ${remMins} min remaining`;
  document.getElementById('mr-list').innerHTML=list.map(i=>`
    <div class="mr-pill ${i.d?'done':''}" data-id="${i.id}" onclick="toggleMR('${i.id}', event)">
      <span class="mr-pill-name">${escH(i.t)}</span>
      <span class="mr-pill-time">${i.mins}m</span>
    </div>`).join('');
}
function toggleMR(id,event){
  const i=S.mr.list.find(i=>i.id===id);
  if(i)i.d=!i.d;saveMR();rMR();
  if(event){
    setTimeout(()=>{
      const el=document.querySelector(`.mr-pill[data-id="${id}"]`);
      if(el){el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),500);}
    },10);
  }
}
