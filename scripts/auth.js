/* Auth — Magic Link sign-in + session bridge to app init.
   Calls onAuthReady() (defined in app.js) once a session is established. */
let currentSession = null;
let currentUser = null;
let appInitialized = false;

async function initAuth(){
  const { data: { session } } = await sb.auth.getSession();
  await handleAuthChange(session);

  sb.auth.onAuthStateChange((event, session) => {
    handleAuthChange(session);
  });
}

async function handleAuthChange(session){
  currentSession = session;
  currentUser = session?.user || null;

  const overlay = document.getElementById('auth-overlay');
  if(currentUser){
    if(overlay) overlay.style.display = 'none';
    document.body.classList.add('authed');
    if(!appInitialized){
      appInitialized = true;
      if(typeof onAuthReady === 'function') onAuthReady();
    }
  } else {
    if(overlay){
      overlay.style.display = 'flex';
      // Reset to email form (in case we came from "sent" state)
      const form = document.getElementById('auth-form');
      const sent = document.getElementById('auth-sent');
      if(form) form.style.display = 'block';
      if(sent) sent.style.display = 'none';
      const err = document.getElementById('auth-error');
      if(err) err.textContent = '';
      // Random creed line above the email input
      const creedEl = document.getElementById('auth-creed');
      if(creedEl && typeof CREED_VARIANTS !== 'undefined'){
        const pick = CREED_VARIANTS[Math.floor(Math.random()*CREED_VARIANTS.length)];
        creedEl.innerHTML = pick.body;
      }
    }
    document.body.classList.remove('authed');
  }
}

async function signInWithEmail(){
  const inp = document.getElementById('auth-email');
  const email = inp.value.trim();
  if(!email){
    document.getElementById('auth-error').textContent = '邮箱不能为空';
    return;
  }
  const btn = document.getElementById('auth-submit');
  const err = document.getElementById('auth-error');
  btn.disabled = true;
  btn.textContent = '发送中…';
  err.textContent = '';

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });

  btn.disabled = false;
  btn.textContent = 'Send magic link';

  if(error){
    err.textContent = error.message || '发送失败,稍后重试';
    return;
  }
  document.getElementById('auth-form').style.display = 'none';
  document.getElementById('auth-sent').style.display = 'block';
  document.getElementById('auth-sent-email').textContent = email;
}

async function signOut(){
  if(!confirm('确定登出?')) return;
  await sb.auth.signOut();
  location.reload();
}

/* Enter key submits email */
document.addEventListener('keydown', (e)=>{
  if(e.key !== 'Enter') return;
  if(document.activeElement?.id === 'auth-email') signInWithEmail();
});
