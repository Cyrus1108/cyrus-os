/* ════════════ 心愿单 · Wishlist / Store HUD ════════════
   Full-screen HUD (clones the Calendar/Finance shell — glass.js wraps #store-view
   into .sys-window.store-hud). A catalog of real things you want to buy:
   · 图片 (Supabase Storage, private bucket `wishlist`, per-user folder)
   · 价格 + 币种 (reuses finance baseCurrency + finMoney formatter)
   · 名称 / 描述 / 购买链接 / 分类 / 想要程度 / 想要⇄已买
   Open/close mirror calendar.js exactly (fade + scroll-unfurl in cappa; instant in
   sterile/reduced-motion). Item shape:
   {id,name,description,price,currency,image_path,link,category,priority,status,bought_at,actual_paid,position} */
const storeUI = { open:false, tab:'want', editId:null, _file:null };
let _storeCloseT = null;
const STORE_PRI = ['随缘','一般','很想'];     // priority index 0..2
const _storeImg = {};                          // image_path -> signed url (memo)

function storeBase(){ return (window.S && S.fin && S.fin.baseCurrency) || 'TWD'; }
function storeMoney(amt, ccy){ return (typeof finMoney==='function') ? finMoney(amt, ccy||storeBase()) : ((ccy||storeBase())+' '+(amt==null?'':amt)); }
function storeSafeLink(u){ u=String(u||'').trim(); return /^https?:\/\//i.test(u) ? u : ''; }

/* ── open / close / routing (clone of calendar.js) ── */
function storeOnHash(){
  if(location.hash==='#store'){ if(!storeUI.open) openStore(true); }
  else if(storeUI.open){ closeStore(true); }
}
function openStore(fromHash){
  const v=document.getElementById('store-view'); if(!v) return;
  clearTimeout(_storeCloseT); v.classList.remove('store-closing');
  storeUI.open=true;
  v.classList.add('open'); v.setAttribute('aria-hidden','false');
  document.body.classList.add('store-locked');
  if(window.Sfx) Sfx.open();
  if(!fromHash && location.hash!=='#store'){ location.hash='store'; }
  rStore();
}
function closeStore(fromHash){
  const v=document.getElementById('store-view'); if(!v || !storeUI.open) return;
  storeUI.open=false;
  if(window.Sfx) Sfx.close();
  v.setAttribute('aria-hidden','true'); storeCloseModal();
  if(!fromHash && location.hash==='#store'){ history.replaceState(null,'',location.pathname+location.search); }
  const hud=v.querySelector('.sys-window');
  const reduce=window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(reduce || !hud){ v.classList.remove('open'); v.classList.remove('store-closing'); document.body.classList.remove('store-locked'); return; }
  v.classList.add('store-closing'); clearTimeout(_storeCloseT);
  _storeCloseT=setTimeout(()=>{ v.classList.remove('open'); document.body.classList.remove('store-locked'); }, 480);
}
function initStore(){
  window.addEventListener('hashchange', storeOnHash);
  document.addEventListener('keydown', e=>{ if(!storeUI.open) return; if(e.key==='Escape'){ if(storeModalOpen()) storeCloseModal(); else closeStore(); e.preventDefault(); } });
  storeOnHash();
}
function storeSwitchTab(t){
  if(storeUI.tab===t) return;
  storeUI.tab=t;
  if(typeof withViewTransition==='function') withViewTransition(()=>rStore()); else rStore();
}

/* ── derived ── */
function storeWants(){ return S.store.filter(i=>i.status!=='bought'); }
function storeBought(){ return S.store.filter(i=>i.status==='bought'); }

/* ── render ── */
function rStore(){
  if(!storeUI.open) return;
  const body=document.getElementById('store-body'); if(!body) return;
  const wants=storeWants(), bought=storeBought();
  const totalVal=wants.reduce((a,i)=>a+(Number(i.price)||0),0);
  const spent=bought.reduce((a,i)=>a+(Number(i.actual_paid!=null?i.actual_paid:i.price)||0),0);
  const base=storeBase();
  const stats=`<div class="store-stats">
      <div class="store-stat"><span class="store-stat-n">${wants.length}</span><span class="store-stat-l">想要</span></div>
      <div class="store-stat"><span class="store-stat-n">${escH(storeMoney(totalVal,base))}</span><span class="store-stat-l">总价值 ≈</span></div>
      <div class="store-stat"><span class="store-stat-n">${bought.length}</span><span class="store-stat-l">已买</span></div>
      <div class="store-stat"><span class="store-stat-n">${escH(storeMoney(spent,base))}</span><span class="store-stat-l">已花</span></div>
    </div>`;
  const tabs=`<div class="store-tabs">
      <button class="store-tab ${storeUI.tab==='want'?'on':''}" onclick="storeSwitchTab('want')">想要 · ${wants.length}</button>
      <button class="store-tab ${storeUI.tab==='bought'?'on':''}" onclick="storeSwitchTab('bought')">已买 · ${bought.length}</button>
    </div>`;
  const list=(storeUI.tab==='want'?wants:bought).slice().sort((a,b)=> ((b.priority||0)-(a.priority||0)) || ((a.position||0)-(b.position||0)));
  const grid=list.length
    ? `<div class="store-grid">${list.map(storeCardHtml).join('')}</div>`
    : `<div class="store-empty">${storeUI.tab==='want'?'— 还没有心愿,点上面「+ 加心愿」加一个 —':'— 还没有已买的 —'}</div>`;
  body.innerHTML = stats + `<div class="store-toolbar">${tabs}<button class="store-add" onclick="storeNew()">+ 加心愿</button></div>` + grid;
  storeLoadImages();
  if(typeof attachRipples==='function') attachRipples(document.getElementById('store-view'));
}

function storeCardHtml(i){
  const pri=i.priority||0, priCls=pri>=2?'p2':pri===1?'p1':'p0';
  const price=(i.price!=null && i.price!=='') ? storeMoney(i.price, i.currency) : '';
  const bought=i.status==='bought';
  const link=storeSafeLink(i.link);
  const img=i.image_path
    ? `<img class="store-card-img" data-path="${escH(i.image_path)}" alt="">`
    : `<div class="store-card-img store-noimg"><svg class="ic"><use href="./vendor/icons.svg#i-shop"/></svg></div>`;
  return `<div class="store-card ${bought?'is-bought':''} ${priCls}">
      <div class="store-card-imgwrap">${img}${pri>=2?'<span class="store-pri-flag">★ 很想</span>':''}${bought?'<span class="store-bought-flag">已买</span>':''}</div>
      <div class="store-card-body">
        <div class="store-card-top"><span class="store-card-name">${escH(i.name||'(未命名)')}</span>${price?`<span class="store-card-price">${escH(price)}</span>`:''}</div>
        ${i.category?`<span class="store-card-cat">${escH(i.category)}</span>`:''}
        ${i.description?`<div class="store-card-desc">${escH(i.description)}</div>`:''}
        <div class="store-card-actions">
          ${link?`<a class="store-card-link" href="${escH(link)}" target="_blank" rel="noopener noreferrer">去看看 ↗</a>`:''}
          <button class="row-btn" onclick="storeToggleBought('${i.id}')">${bought?'↩ 还原':'✓ 已买'}</button>
          <button class="row-btn" onclick="storeEdit('${i.id}')">编辑</button>
          <button class="row-btn" onclick="storeDel('${i.id}')" aria-label="删除"><svg class="ic"><use href="./vendor/icons.svg#i-close"/></svg></button>
        </div>
      </div>
    </div>`;
}

/* ── load images via short-lived signed URLs (private bucket) ── */
async function storeLoadImages(){
  if(!currentUser) return;
  const imgs=[...document.querySelectorAll('#store-view img[data-path]')];
  for(const el of imgs){
    const path=el.getAttribute('data-path'); if(!path) continue;
    if(_storeImg[path]){ el.src=_storeImg[path]; continue; }
    try{
      const { data }=await sb.storage.from('wishlist').createSignedUrl(path, 3600);
      if(data && data.signedUrl){ _storeImg[path]=data.signedUrl; el.src=data.signedUrl; }
    }catch(e){}
  }
}

/* ── CRUD (modal form) ── */
function storeModalEl(){ return document.getElementById('store-modal'); }
function storeModalOpen(){ const m=storeModalEl(); return !!(m && m.classList.contains('open')); }
function storeCloseModal(){ const m=storeModalEl(); if(m){ m.classList.remove('open'); m.innerHTML=''; } storeUI.editId=null; storeUI._file=null; }
function storeNew(){ storeUI.editId='new'; storeOpenModal(); }
function storeEdit(id){ storeUI.editId=id; storeOpenModal(); }
function storeOpenModal(){
  const m=storeModalEl(); if(!m) return;
  const it = storeUI.editId==='new'
    ? { id:null, name:'', description:'', price:'', currency:storeBase(), link:'', category:'', priority:1, status:'want', image_path:'' }
    : (S.store.find(x=>x.id===storeUI.editId) || {});
  const ccyList = (typeof FIN_CURRENCIES!=='undefined') ? FIN_CURRENCIES : ['TWD','USD','MYR','CNY','JPY'];
  const ccyOpts = ccyList.map(c=>`<option value="${c}" ${ (it.currency||storeBase())===c?'selected':'' }>${c}</option>`).join('');
  const priSeg = STORE_PRI.map((p,idx)=>`<button type="button" class="fin-seg-opt ${(it.priority||0)===idx?'on':''}" onclick="storeSegPri(${idx})">${p}</button>`).join('');
  m.innerHTML = `<div class="store-modal-card">
      <div class="store-modal-title">${storeUI.editId==='new'?'加心愿':'编辑心愿'}</div>
      <label class="store-imgpick">
        <input type="file" accept="image/*" id="store-f-file" onchange="storePickImg(this)" hidden>
        <div class="store-imgpick-box" id="store-imgpick-box">${ it.image_path ? '<img data-path="'+escH(it.image_path)+'" alt="">' : '<span class="store-imgpick-hint">＋ 上传图片</span>' }</div>
      </label>
      <input id="store-f-name" placeholder="商品名称…" value="${escH(it.name||'')}" style="width:100%;">
      <textarea id="store-f-desc" placeholder="描述（可选）" style="width:100%;height:54px;resize:none;">${escH(it.description||'')}</textarea>
      <div class="field-row">
        <span class="field-label">价格</span>
        <input id="store-f-price" type="number" step="0.01" inputmode="decimal" placeholder="0.00" value="${it.price!=null && it.price!=='' ? escH(String(it.price)) : ''}" style="flex:1;min-width:0;">
        <select id="store-f-ccy">${ccyOpts}</select>
      </div>
      <input id="store-f-cat" placeholder="分类（可选,如 电子 / 书 / 服饰）" value="${escH(it.category||'')}" style="width:100%;">
      <input id="store-f-link" placeholder="购买链接（可选,https://…）" value="${escH(it.link||'')}" style="width:100%;">
      <div class="field-row"><span class="field-label">想要程度</span><div class="fin-seg" style="flex:1;">${priSeg}</div></div>
      ${ storeUI.editId!=='new' ? `<div class="field-row"><span class="field-label">状态</span><button type="button" class="store-status-btn ${it.status==='bought'?'on':''}" onclick="storeModalToggleBought(this)">${it.status==='bought'?'已买 ✓':'想要'}</button></div>` : '' }
      <div style="display:flex;gap:6px;margin-top:4px;">
        <button class="primary fx-btn" onclick="storeSave()" style="flex:1;">保存</button>
        <button class="ghost fx-btn" onclick="storeCloseModal()" style="flex:1;">取消</button>
      </div>
    </div>`;
  m.dataset.priority = it.priority||0;
  m.dataset.status = it.status||'want';
  m.classList.add('open');
  storeLoadImages();
  requestAnimationFrame(()=>{ const n=document.getElementById('store-f-name'); if(n) n.focus(); });
}
function storeSegPri(idx){
  const m=storeModalEl(); if(!m) return; m.dataset.priority=idx;
  m.querySelectorAll('.fin-seg-opt').forEach((b,i)=>b.classList.toggle('on', i===idx));
}
function storeModalToggleBought(btn){
  const m=storeModalEl(); const now = m.dataset.status==='bought' ? 'want':'bought'; m.dataset.status=now;
  btn.classList.toggle('on', now==='bought'); btn.textContent = now==='bought'?'已买 ✓':'想要';
}
function storePickImg(input){
  const f=input.files && input.files[0]; if(!f) return;
  if(f.size > 5*1024*1024){ alert('图片太大了（上限 5MB）'); input.value=''; return; }
  storeUI._file=f;
  const box=document.getElementById('store-imgpick-box');
  if(box){ const url=URL.createObjectURL(f); box.innerHTML='<img alt="" src="'+url+'">'; }
}
async function storeSave(){
  const nameEl=document.getElementById('store-f-name'); if(!nameEl) return;
  const name=nameEl.value.trim(); if(!name) return;
  const m=storeModalEl();
  const desc=document.getElementById('store-f-desc').value.trim();
  const priceRaw=document.getElementById('store-f-price').value;
  const price = priceRaw==='' ? null : Number(priceRaw);
  const ccy=document.getElementById('store-f-ccy').value || storeBase();
  const cat=document.getElementById('store-f-cat').value.trim();
  const link=document.getElementById('store-f-link').value.trim();
  const priority=Number(m.dataset.priority||0);
  const status=m.dataset.status||'want';
  let item;
  if(storeUI.editId==='new'){
    item={ id:crypto.randomUUID(), name, description:desc, price, currency:ccy, link, category:cat, priority, status,
           bought_at: status==='bought'?TODAY:null, actual_paid:null, image_path:'',
           position:(S.store.reduce((a,i)=>Math.max(a,i.position||0),0)+1) };
    S.store.push(item);
  } else {
    item=S.store.find(x=>x.id===storeUI.editId); if(!item){ storeCloseModal(); return; }
    const wasBought=item.status==='bought';
    item.name=name; item.description=desc; item.price=price; item.currency=ccy; item.link=link; item.category=cat; item.priority=priority; item.status=status;
    if(status==='bought' && !wasBought) item.bought_at=TODAY;
    if(status!=='bought') item.bought_at=null;
  }
  if(storeUI._file && currentUser){
    try{
      const ext=((storeUI._file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')) || 'jpg';
      const path=`${currentUser.id}/${item.id}.${ext}`;
      const up=await sb.storage.from('wishlist').upload(path, storeUI._file, { upsert:true, contentType:storeUI._file.type });
      if(!up.error){ item.image_path=path; delete _storeImg[path]; }
      else console.warn('[store] upload error', up.error);
    }catch(e){ console.warn('[store] upload failed', e); }
  }
  storeUI._file=null;
  storeCloseModal();
  saveStore(); rStore();
  if(typeof rStoreDot==='function') rStoreDot();
  if(window.Sfx) Sfx.save();
}
function storeToggleBought(id){
  const it=S.store.find(x=>x.id===id); if(!it) return;
  if(it.status==='bought'){ it.status='want'; it.bought_at=null; }
  else { it.status='bought'; it.bought_at=TODAY; }
  saveStore(); rStore();
  if(typeof rStoreDot==='function') rStoreDot();
  if(window.Sfx && Sfx.tick) Sfx.tick();
}
function storeDel(id){
  const it=S.store.find(x=>x.id===id);
  if(it && it.image_path && currentUser){ try{ sb.storage.from('wishlist').remove([it.image_path]); }catch(e){} delete _storeImg[it.image_path]; }
  S.store=S.store.filter(x=>x.id!==id);
  saveStore(); rStore();
  if(typeof rStoreDot==='function') rStoreDot();
}

/* ── nav button dot: lit while there are un-bought wishes ── */
function rStoreDot(){
  const wantN = storeWants().length;
  const b=document.getElementById('shop-btn');
  if(b) b.classList.toggle('has-today', wantN>0);
  const n=document.getElementById('store-micro-n');
  if(n) n.textContent = wantN;
}
