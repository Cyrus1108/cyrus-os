/* Notification permission + Web Push subscription.
   Stage 4: real server-driven push via Cloudflare Worker cron + VAPID.
   The legacy local checkReminders() function from v6.1 is gone — server cron is authoritative. */

const VAPID_PUBLIC_KEY = 'BJ7N5oHznyh8Vpfb5HLrsbJbcM7XjRAU8OHItVG6oftgvKbhsi5Ru1_kU75OG-s3ynVgcjMUOzEvIwOGTzubIWI';

function canNotify(){return 'Notification' in window && Notification.permission === 'granted';}

/* base64url → Uint8Array — needed to pass VAPID public key to pushManager.subscribe */
function urlBase64ToUint8Array(b64){
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const base64 = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function requestNotifPerm(){
  if(!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)){
    alert('此浏览器不支持 Web Push 通知');
    return;
  }

  const perm = await Notification.requestPermission();
  if(perm !== 'granted'){
    dismissNotifBanner();
    return;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub){
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await registerSubscription(sub);
    new Notification('Cyrus OS', { body: '通知已启用 · 提醒会在锁屏显示', icon: './icons/icon-192.png' });
    dismissNotifBanner();
  } catch(e){
    console.error('[push] subscribe failed', e);
    alert('订阅推送失败:' + e.message);
  }
}

/* Persist subscription to Supabase so the Cloudflare Worker cron can find it.
   Endpoint is unique per browser+device → ON CONFLICT (endpoint) replaces row. */
async function registerSubscription(sub){
  if(!currentUser){
    console.warn('[push] no user, skipping subscription register');
    return;
  }
  const json = sub.toJSON();
  const row = {
    user_id: currentUser.id,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    user_agent: navigator.userAgent.slice(0, 200),
  };
  const res = await sb.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });
  if(res.error) console.error('[push] register subscription', res.error);
  else console.log('[push] subscription registered');
}

/* Called from auth.js after login — re-registers existing subscription so the user_id is current */
async function reattachPushSubscription(){
  if(!currentUser || !('serviceWorker' in navigator)) return;
  if(!canNotify()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if(sub) await registerSubscription(sub);
  } catch(e){
    console.error('[push] reattach failed', e);
  }
}

function dismissNotifBanner(){
  document.getElementById('notif-banner').classList.remove('show');
  saveLS('notif_banner_dismissed', true);
}
function checkNotifBanner(){
  if(!('Notification' in window)) return;
  if(Notification.permission === 'default' && !loadLS('notif_banner_dismissed', false)){
    document.getElementById('notif-banner').classList.add('show');
  }
}

/* Stub kept so app.js init() doesn't break. Cron drives reminders now;
   this is just a no-op for local-only fallback (e.g. if Worker is down). */
function checkReminders(){
  // intentionally empty — Stage 4 moves reminder logic to Cloudflare Worker cron
}
