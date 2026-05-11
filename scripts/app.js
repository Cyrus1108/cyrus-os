/* App entry — clock, sessions, metrics, init, render orchestration */
function escH(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

/* Ripple effect */
function addRipple(e){
  const btn = e.currentTarget;
  const rect = btn.getBoundingClientRect();
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  const size = Math.max(rect.width, rect.height);
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = (e.clientX - rect.left - size/2) + 'px';
  ripple.style.top = (e.clientY - rect.top - size/2) + 'px';
  btn.appendChild(ripple);
  setTimeout(()=>ripple.remove(), 600);
}
function attachRipples(){
  document.querySelectorAll('button.primary, button.ghost, button.check-btn').forEach(btn=>{
    if(btn.dataset.rippleAttached) return;
    btn.dataset.rippleAttached = '1';
    btn.addEventListener('click', addRipple);
  });
}

function rDate(){
  const now=new Date();
  const enDays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const enMonths=['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('dateline').textContent=enDays[now.getDay()];
  document.getElementById('datemeta').textContent=`${enMonths[now.getMonth()]} ${now.getDate()} · ${now.getFullYear()}`;
  const h=now.getHours();
  const g=h<12?'Good morning':h<18?'Good afternoon':'Good evening';
  document.getElementById('greeting').textContent=`Cyrus — ${g}`;
  document.getElementById('clock-sub').textContent='Kaohsiung';
}
function tick(){
  const now=new Date(),p=n=>String(n).padStart(2,'0');
  document.getElementById('clock').textContent=`${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
  const m=now.getHours()*60+now.getMinutes();
  const active=SESH.filter(s=>isOn(s,m));
  document.getElementById('sesh-now').textContent=active.length?active.map(s=>s.n).join(' + ')+' — active':'— Quiet hours —';
  document.getElementById('sessions').innerHTML=SESH.map(s=>{
    const on=isOn(s,m);
    return `<div class="sess-row"><div class="sess-dot ${on?'on':''}"></div><span class="sess-name ${on?'on':''}">${s.n}</span><span class="sess-time">${s.r}</span></div>`;
  }).join('');
}

function rMetrics(){
  document.getElementById('m-ac').textContent=S.ac.filter(t=>!t.done).length;
  const d=S.tr.list.filter(i=>i.d).length,t=S.tr.list.length;
  document.getElementById('m-tr').innerHTML=`${d}<span style="color:var(--brass-ghost);"> / ${t}</span>`;
  document.getElementById('m-td').textContent=S.todos.filter(t=>!t.done).length;
  updateShowDoneBtn();
}

function renderAll(){rDate();rMR();rAC();rJP();rTR();rCats();rTodos();rMetrics();attachRipples();}

function onAuthReady(){
  /* Called by auth.js once a Supabase session is established.
     Stage 2a: still reads from localStorage. Stage 2b will swap in Supabase pulls. */
  init();
}

async function init(){
  const mr=loadLS('mr',null);
  if(mr){
    if(mr.date===TODAY){
      S.mr=mr;
    } else {
      S.mr.list = mr.list.map(i=>({...i,d:false}));
      S.mr.date = TODAY;
      saveMR();
    }
  }
  const ac=loadLS('ac',null);if(ac)S.ac=ac;
  const jp=loadLS('jp',null);if(jp)S.jp=jp;
  const tr=loadLS('tr',null);
  if(tr){if(tr.date===TODAY)S.tr=tr;else{S.tr.bias='';S.tr.list=S.tr.list.map(i=>({...i,d:false}));}}
  const tds=loadLS('todos',null);if(tds)S.todos=tds;
  const cats=loadLS('cats',null);if(cats&&cats.length)S.cats=cats;
  const syms=loadLS('symbols',null);if(syms&&Array.isArray(syms)&&syms.length>0)S.symbols=syms;
  const noti=loadLS('notifiedIds',null);if(noti)S.notifiedIds=noti;
  showDone = loadLS('show_done', false);

  initCreed();
  renderAll();
  updateShowDoneBtn();
  tick();
  setInterval(tick,1000);
  attachRipples();
  checkNotifBanner();
  checkReminders();
  setInterval(checkReminders, 30000);

  /* Sync layer (Stage 2b): overlay Supabase data on top of the LS-rendered UI,
     then subscribe to Realtime for cross-device updates. */
  if(typeof pullAll === 'function'){
    await pullAll();
    renderAll();
    if(typeof subscribeRealtime === 'function') subscribeRealtime();
  }
}

initAuth();
