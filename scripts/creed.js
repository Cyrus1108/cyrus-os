/* The Creed — collapsible rotating manifesto */
function renderCreed(fade){
  const el = document.getElementById('creed-variant');
  const v = CREED_VARIANTS[currentCreedIdx];
  if(fade){
    el.classList.add('fading');
    setTimeout(()=>{el.innerHTML = v.body;el.classList.remove('fading');}, 350);
  } else {
    el.innerHTML = v.body;
  }
}
function swapCreed(){
  currentCreedIdx = (currentCreedIdx+1) % CREED_VARIANTS.length;
  saveLS('creed_idx', currentCreedIdx);
  renderCreed(true);
}
function initCreed(){
  const wrap = document.getElementById('creed-wrap');
  const trigger = document.getElementById('creed-trigger');
  const savedIdx = loadLS('creed_idx', null);
  currentCreedIdx = savedIdx !== null ? savedIdx : Math.floor(Math.random()*CREED_VARIANTS.length);
  renderCreed(false);
  const saved = loadLS('creed_open', false);
  setCreedState(saved);
  trigger.addEventListener('click', ()=>{
    const willOpen = !wrap.classList.contains('open');
    setCreedState(willOpen);
    saveLS('creed_open', willOpen);
  });
  function setCreedState(open){
    if(open){wrap.classList.add('open');trigger.setAttribute('aria-expanded','true');}
    else{wrap.classList.remove('open');trigger.setAttribute('aria-expanded','false');}
  }
  document.addEventListener('keydown', (e)=>{
    if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT')return;
    if(e.key==='h'||e.key==='H'){
      if(wrap.classList.contains('open')){setCreedState(false);saveLS('creed_open',false);}
    }
  });
}
