/* ════════════════════════════════════════════════════════════════
   App lock — a local privacy gate over the whole dashboard.
   Biometric (WebAuthn platform authenticator) with a 6-digit PIN fallback.
   Protects against "someone picked up my unlocked phone": the Supabase
   session stays valid, but the UI is gated until you re-verify.
   PIN is stored only as a PBKDF2-SHA256 hash + salt in localStorage.
   Auto-locks on load, on inactivity, and when the app returns from background.
   ════════════════════════════════════════════════════════════════ */

const LOCK_KEY = 'cyrus_lock';
const LOCK_BG_MS   = 15 * 1000;         // lock if backgrounded > 15s (e.g. switched apps on mobile)
const lockRT = { unlocked:false, hiddenAt:0, idleTimer:null, entry:'', fails:0, lockoutUntil:0 };

/* ── storage ── */
function lockCfg(){ try{ return JSON.parse(localStorage.getItem(LOCK_KEY) || 'null') || {}; }catch(e){ return {}; } }
function lockSave(c){ try{ localStorage.setItem(LOCK_KEY, JSON.stringify(c)); }catch(e){} }
function lockEnabled(){ return !!lockCfg().enabled; }

/* ── base64url + crypto ── */
function _bufToB64u(buf){ let s=''; const b=new Uint8Array(buf); for(let i=0;i<b.length;i++) s+=String.fromCharCode(b[i]); return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function _b64uToBuf(s){ s=s.replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='='; const bin=atob(s); const b=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) b[i]=bin.charCodeAt(i); return b.buffer; }
async function lockHashPin(pin, saltB64u, iter){
  iter = iter || 210000;
  const salt = saltB64u ? new Uint8Array(_b64uToBuf(saltB64u)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt, iterations:iter, hash:'SHA-256' }, key, 256);
  return { hash:_bufToB64u(bits), salt:_bufToB64u(salt.buffer), iter };
}

/* ── biometric (WebAuthn) ── */
async function lockBioRegister(){
  if(!(window.PublicKeyCredential && navigator.credentials)) return null;
  try{
    const cred = await navigator.credentials.create({ publicKey:{
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name:'Cyrus OS' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name:'cyrus', displayName:'Cyrus' },
      pubKeyCredParams: [{ type:'public-key', alg:-7 }, { type:'public-key', alg:-257 }],
      authenticatorSelection: { authenticatorAttachment:'platform', userVerification:'required', residentKey:'preferred' },
      timeout: 60000, attestation:'none',
    }});
    return cred ? _bufToB64u(cred.rawId) : null;
  }catch(e){ console.warn('[lock] bio register failed', e); return null; }
}
async function lockBioUnlock(){
  const c = lockCfg(); if(!c.credId) return false;
  try{
    const assertion = await navigator.credentials.get({ publicKey:{
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type:'public-key', id: _b64uToBuf(c.credId) }],
      userVerification:'required', timeout:60000,
    }});
    return !!assertion;
  }catch(e){ console.warn('[lock] bio unlock failed', e); return false; }
}

/* ── overlay ── */
function lockOverlay(){ return document.getElementById('applock'); }
function lockMount(){
  if(lockOverlay()) return;
  const o = document.createElement('div');
  o.id='applock'; o.className='applock';
  const pad = [1,2,3,4,5,6,7,8,9,'blank',0,'del'].map(k=>{
    if(k==='blank') return `<span class="applock-key blank"></span>`;
    if(k==='del') return `<button class="applock-key applock-keyfn" onclick="lockKey('del')">⌫</button>`;
    return `<button class="applock-key" onclick="lockKey('${k}')">${k}</button>`;
  }).join('');
  o.innerHTML = `<div class="applock-card">
    <div class="applock-glyph">◆</div>
    <div class="applock-title">Cyrus OS</div>
    <button class="applock-biomain" id="applock-biomain" style="display:none;" onclick="lockBioTap()">面容 / 指纹解锁</button>
    <div class="applock-sub" id="applock-sub">输入 PIN 解锁</div>
    <div class="applock-dots" id="applock-dots">${'<span class="applock-dot"></span>'.repeat(6)}</div>
    <div class="applock-pad">${pad}</div>
    <div class="applock-pinhint" id="applock-pinhint"></div>
    <div class="applock-err" id="applock-err"></div>
    <button class="applock-forgot" onclick="lockForgotPin()">忘记 PIN？</button>
  </div>`;
  document.body.appendChild(o);
}
function lockRenderDots(){
  const dots = document.querySelectorAll('#applock-dots .applock-dot');
  dots.forEach((d,i)=> d.classList.toggle('on', i < lockRT.entry.length));
}
function appShowLock(){
  lockMount();
  lockRT.unlocked = false; lockRT.entry='';
  // Rehydrate persisted lockout so escalating backoff survives a reload.
  { const _c=lockCfg(); lockRT.fails = _c.fails||0; lockRT.lockoutUntil = _c.lockoutUntil||0; }
  document.documentElement.classList.remove('app-locked-boot');
  document.documentElement.classList.add('app-locked');
  const o = lockOverlay(); o.classList.add('show');
  lockRenderDots();
  const err=document.getElementById('applock-err'); if(err) err.textContent='';
  const hasBio = !!lockCfg().credId;
  const bm=document.getElementById('applock-biomain'); if(bm) bm.style.display = hasBio ? '' : 'none';
  const sub=document.getElementById('applock-sub'); if(sub) sub.textContent = hasBio ? '面容 / 指纹解锁' : '输入 PIN 解锁';
  const hint=document.getElementById('applock-pinhint'); if(hint) hint.textContent = hasBio ? '或在下方输入 PIN' : '';
  lockCheckLockout();
  // Default to biometric: auto-prompt it the moment the lock appears (the OS chooses
  // face → fingerprint). If it's blocked (no user gesture) or cancelled, the PIN pad
  // below is the fallback — no scary error on the silent auto attempt.
  if(hasBio && Date.now() >= lockRT.lockoutUntil){
    setTimeout(()=>{ if(!lockRT.unlocked && lockOverlay() && lockOverlay().classList.contains('show')) lockBioTap(true); }, 300);
  }
}
function appUnlockDone(){
  lockRT.unlocked = true; lockRT.entry=''; lockRT.fails=0; lockRT.lockoutUntil=0;
  // Clear the PERSISTED backoff too, so a correct unlock truly resets it (else appShowLock
  // would rehydrate the stale fail count on the next reload and keep escalating forever).
  try{ const c=lockCfg(); if(c.fails||c.lockoutUntil){ c.fails=0; c.lockoutUntil=0; lockSave(c); } }catch(e){}
  document.documentElement.classList.remove('app-locked','app-locked-boot');
  const o = lockOverlay(); if(o) o.classList.remove('show');
  lockResetIdle();
}

/* ── PIN entry ── */
function lockKey(k){
  if(Date.now() < lockRT.lockoutUntil) return;
  if(k==='del'){ lockRT.entry = lockRT.entry.slice(0,-1); lockRenderDots(); return; }
  if(lockRT.entry.length >= 6) return;
  lockRT.entry += String(k);
  lockRenderDots();
  if(lockRT.entry.length === 6) lockSubmitPin();
}
async function lockSubmitPin(){
  const c = lockCfg(); const pin = lockRT.entry;
  const { hash } = await lockHashPin(pin, c.pinSalt, c.pinIter);
  if(hash === c.pinHash){ if(window.Sfx && typeof Sfx.save==='function') Sfx.save(); appUnlockDone(); }
  else {
    lockRT.fails++; lockRT.entry='';
    lockRenderDots();
    const err=document.getElementById('applock-err');
    if(lockRT.fails >= 5){
      const wait = Math.min(300, 15 * Math.pow(2, lockRT.fails-5)); // 15s,30s,60s… cap 5min
      lockRT.lockoutUntil = Date.now() + wait*1000;
      lockCheckLockout();
    } else if(err){ err.textContent = `PIN 不对 · 还可试 ${5-lockRT.fails} 次`; }
    // Persist so escalating backoff survives a reload (cleared only on successful unlock).
    try{ const cc=lockCfg(); cc.fails=lockRT.fails; cc.lockoutUntil=lockRT.lockoutUntil; lockSave(cc); }catch(e){}
  }
}
function lockCheckLockout(){
  const err=document.getElementById('applock-err'); if(!err) return;
  const tick=()=>{
    const left = Math.ceil((lockRT.lockoutUntil - Date.now())/1000);
    if(left > 0){ err.textContent = `尝试过多 · 请 ${left}s 后再试`; setTimeout(tick, 500); }
    else { err.textContent=''; /* keep fails so backoff keeps escalating; cleared only on unlock */ }
  };
  if(Date.now() < lockRT.lockoutUntil) tick();
}
async function lockBioTap(auto){
  if(Date.now() < lockRT.lockoutUntil){ lockCheckLockout(); return; }
  const err=document.getElementById('applock-err');
  if(err) err.textContent = auto ? '' : '验证中…';
  const ok = await lockBioUnlock();
  if(ok){ if(window.Sfx && typeof Sfx.save==='function') Sfx.save(); appUnlockDone(); return; }
  // failed / cancelled — stay on PIN. Stay silent on the auto attempt (often just a
  // missing user-gesture); only nudge if the user tapped the button themselves.
  if(err) err.textContent = auto ? '' : '未通过 · 重试或用 PIN';
}

/* ── auto-lock ── */
function lockResetIdle(){ /* idle timer removed — only locks on load and background return */ }
function initAppLock(){
  if(['localhost','127.0.0.1','::1'].includes(location.hostname)){
    lockRT.unlocked = true;
    document.documentElement.classList.remove('app-locked','app-locked-boot');
    return;
  }
  // Attach the background-return listener BEFORE the lockEnabled() early-return so that
  // enabling the lock in-session starts gating on next app-switch without a reload. It
  // self-guards with `if(!lockEnabled()) return;`, so it's inert while the lock is off.
  // Only lock when the app returns from the background (e.g. switched to another app
  // on mobile). Idle-while-open timer has been removed at user request.
  document.addEventListener('visibilitychange', ()=>{
    if(!lockEnabled()) return;
    if(document.visibilityState==='hidden'){ lockRT.hiddenAt = Date.now(); }
    else if(lockRT.unlocked && lockRT.hiddenAt && (Date.now()-lockRT.hiddenAt) > LOCK_BG_MS){ appShowLock(); }
  });
  if(!lockEnabled()){ document.documentElement.classList.remove('app-locked-boot'); return; }
  appShowLock();
}

/* ════════════ setup / management (rendered in finance 更多) ════════════ */
function appLockSettingsHtml(){
  const c = lockCfg();
  const on = !!c.enabled;
  return `<div class="fin-more-sec">
    <div class="fin-more-head">应用锁 <span class="fin-lock-status ${on?'on':''}">${on?'已启用':'未启用'}</span></div>
    <div class="fin-fx-note" style="margin-bottom:10px;">打开 App 或从后台切回都会要求验证。${on&&c.credId?'已绑定生物识别。':''}</div>
    ${on ? `<div class="fin-export-row">
        <button class="ghost fx-btn" onclick="lockChangePin()">更改 PIN</button>
        <button class="ghost fx-btn" onclick="lockToggleBio()">${c.credId?'移除':'绑定'}生物识别</button>
        <button class="ghost fx-btn danger" onclick="lockDisable()">停用</button>
      </div>`
      : `<button class="primary fx-btn" onclick="lockEnableFlow()">启用应用锁</button>`}
  </div>`;
}
function _lockReRenderMore(){ if(typeof finUI!=='undefined' && finUI.open && finUI.tab==='more' && typeof rFinance==='function') rFinance(); }

async function lockEnableFlow(){
  const pin = await lockPromptNewPin();
  if(!pin) return;
  const { hash, salt, iter } = await lockHashPin(pin);
  const c = { enabled:true, pinHash:hash, pinSalt:salt, pinIter:iter, credId:null, updated:Date.now() };
  lockSave(c);
  // offer biometric
  if(confirm('要绑定这台设备的指纹 / 面容来快速解锁吗？（随时可在这里移除）')){
    const credId = await lockBioRegister();
    if(credId){ c.credId = credId; lockSave(c); alert('已绑定生物识别 ✓'); }
    else alert('这台设备没有可用的生物识别（或被取消）——已只用 PIN。');
  }
  lockRT.unlocked = true;     // already verified by setting it
  _lockReRenderMore();
  alert('应用锁已启用 ✓ 下次打开就会要求验证。');
}
async function lockPromptNewPin(){
  const p1 = prompt('设置 6 位数字 PIN：'); if(p1==null) return null;
  if(!/^\d{6}$/.test(p1)){ alert('请输入恰好 6 位数字。'); return null; }
  const p2 = prompt('再输入一次确认：'); if(p2==null) return null;
  if(p1!==p2){ alert('两次不一致。'); return null; }
  return p1;
}
async function lockVerifyForChange(){
  const c = lockCfg(); if(!c.enabled) return true;
  const pin = prompt('先输入当前 PIN：'); if(pin==null) return false;
  const { hash } = await lockHashPin(pin, c.pinSalt, c.pinIter);
  if(hash!==c.pinHash){ alert('PIN 不对。'); return false; }
  return true;
}
async function lockChangePin(){
  if(!(await lockVerifyForChange())) return;
  const pin = await lockPromptNewPin(); if(!pin) return;
  const { hash, salt, iter } = await lockHashPin(pin);
  const c = lockCfg(); c.pinHash=hash; c.pinSalt=salt; c.pinIter=iter; c.updated=Date.now(); lockSave(c);
  alert('PIN 已更改 ✓');
}
async function lockToggleBio(){
  const c = lockCfg();
  if(c.credId){ if(!(await lockVerifyForChange())) return; c.credId=null; lockSave(c); alert('已移除生物识别。'); _lockReRenderMore(); return; }
  const credId = await lockBioRegister();
  if(credId){ c.credId=credId; lockSave(c); alert('已绑定生物识别 ✓'); }
  else alert('绑定失败或被取消。');
  _lockReRenderMore();
}
async function lockDisable(){
  if(!(await lockVerifyForChange())) return;
  if(!confirm('停用应用锁？任何拿到这台已登录设备的人都能直接看到你的数据。')) return;
  localStorage.removeItem(LOCK_KEY);
  lockRT.unlocked=true;
  appUnlockDone();
  _lockReRenderMore();
  alert('应用锁已停用。');
}

/* ── Forgot PIN → email magic-link verification reset ── */
async function lockForgotPin(){
  if(!confirm('忘记 PIN 了？\n\n我们会给你注册的邮箱发一封魔法链接验证邮件。\n验证成功后就可以设置新 PIN。')) return;
  // We use the Supabase session's email if available; otherwise ask.
  let email = '';
  try{
    if(window.sb){ const { data } = await sb.auth.getSession(); email = data?.session?.user?.email || ''; }
  }catch(e){}
  if(!email){ email = prompt('输入你的登录邮箱：') || ''; email = email.trim(); }
  if(!email){ return; }
  const err=document.getElementById('applock-err');
  try{
    let res;
    if(window.sb){ res = await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: location.href + '?pinreset=1' } }); }
    else throw new Error('no supabase');
    if(res.error) throw res.error;
    if(err) err.textContent='';
    const hint=document.getElementById('applock-pinhint');
    if(hint){ hint.style.color='var(--fin-pos)'; hint.textContent='验证邮件已发送，请点击邮件里的链接，然后回到这里设置新 PIN。'; }
    // after they click the link and return, the page reloads with pinreset=1
    window._lockAwaitReset = true;
  }catch(e){
    if(err) err.textContent = '发送失败：' + (e.message||e);
  }
}
/* If page loaded after a pinreset magic-link click, offer to set a new PIN.
   SECURITY: ?pinreset=1 alone is NOT trusted — a bystander could type it into the
   address bar over an already-persisted session and reset the PIN. We require PROOF
   that a magic-link token was consumed on THIS navigation. With implicit flow +
   detectSessionInUrl (supabase.js), a fresh magic link arrives with access_token in
   the URL hash (e.g. #access_token=...&type=recovery|magiclink) which Supabase then
   clears. Capture the raw hash synchronously NOW (before Supabase clears it) and only
   proceed if it carried a fresh access_token. A pre-existing session is not enough. */
const _lockResetHash = (function(){
  try{
    const h = (location.hash||'').replace(/^#/,'');
    if(!h) return null;
    const p = new URLSearchParams(h);
    if(!p.get('access_token')) return null;
    const t = p.get('type');
    // accept magic-link / recovery tokens (type is absent on some magiclink flows)
    if(t && !/^(recovery|magiclink|signup|invite)$/.test(t)) return null;
    return p;
  }catch(e){ return null; }
})();
if(new URLSearchParams(location.search).get('pinreset')==='1' && _lockResetHash){
  window.addEventListener('load', async ()=>{
    await new Promise(r=>setTimeout(r,600));
    // user just consumed a magic link THIS navigation; let them set a new PIN without the old one
    const pin = await lockPromptNewPin(); if(!pin) return;
    const { hash, salt, iter } = await lockHashPin(pin);
    const c = lockCfg(); c.enabled=true; c.pinHash=hash; c.pinSalt=salt; c.pinIter=iter; c.updated=Date.now();
    lockSave(c); lockRT.unlocked=true; appUnlockDone();
    // clean the URL param
    const u = new URL(location.href); u.searchParams.delete('pinreset'); history.replaceState(null,'',u.href);
    alert('新 PIN 已设置 ✓');
  });
}

/* Engage as early as possible (body-bottom script → DOM is ready), independent of auth. */
if(document.readyState !== 'loading') initAppLock();
else document.addEventListener('DOMContentLoaded', initAppLock);
