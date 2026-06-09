/* cyrus-os-reminders — Cloudflare Worker
   Runs every minute (cron `* * * * *`). For each user:
     1. Find todos/academics whose dueTime - remind <= now < dueTime and notified_for != currentKey
     2. Look up the user's push_subscriptions
     3. Send a VAPID-signed, AES128GCM-encrypted Web Push per subscription
     4. Stamp notified_for so we don't fire again until the user changes date/time/remind

   No npm deps — all crypto via Worker's built-in WebCrypto. Implements:
     - VAPID JWT (RFC 8292, ES256)
     - Web Push aes128gcm content encoding (RFC 8291)

   Secrets required (set in Dashboard → Settings → Variables and Secrets):
     SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT
*/

/* ════════════ Supabase REST helpers ════════════ */

const sbBase = (env) => `${env.SUPABASE_URL}/rest/v1`;
const sbHeaders = (env) => ({
  apikey: env.SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
});

async function sbSelect(env, path) {
  const res = await fetch(`${sbBase(env)}/${path}`, { headers: sbHeaders(env) });
  if (!res.ok) {
    console.error('sbSelect failed', path, res.status, await res.text());
    return [];
  }
  return res.json();
}

async function sbUpdate(env, path, body) {
  const res = await fetch(`${sbBase(env)}/${path}`, {
    method: 'PATCH',
    headers: sbHeaders(env),
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error('sbUpdate failed', path, res.status, await res.text());
}

async function sbDelete(env, path) {
  await fetch(`${sbBase(env)}/${path}`, { method: 'DELETE', headers: sbHeaders(env) });
}

/* ════════════ base64url helpers ════════════ */

function b64uEnc(buf) {
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDec(s) {
  const pad = (4 - (s.length % 4)) % 4;
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ════════════ VAPID JWT (RFC 8292) ════════════ */

async function buildVapidJwt(env, audience) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60, // 12h
    sub: env.VAPID_SUBJECT,
  };
  const headB64 = b64uEnc(new TextEncoder().encode(JSON.stringify(header)));
  const payB64 = b64uEnc(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headB64}.${payB64}`;

  // Build JWK from VAPID_PUBLIC (65 bytes: 0x04 || X || Y) + VAPID_PRIVATE (32-byte scalar)
  const pub = b64uDec(env.VAPID_PUBLIC);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error('VAPID_PUBLIC malformed');
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: b64uEnc(pub.slice(1, 33)),
    y: b64uEnc(pub.slice(33, 65)),
    d: env.VAPID_PRIVATE, // already base64url
  };
  const key = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${b64uEnc(sig)}`;
}

/* ════════════ Web Push aes128gcm encryption (RFC 8291) ════════════ */

async function hmac(keyBytes, data) {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

function concatBytes(...parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) { out.set(p, pos); pos += p.length; }
  return out;
}

async function encryptPayload(plaintext, p256dhB64, authB64) {
  const userPub = b64uDec(p256dhB64);
  const userAuth = b64uDec(authB64);

  // 1. Ephemeral ECDH keypair
  const ephemeral = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const ephPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));

  // 2. ECDH: derive shared secret (32 bytes)
  const userPubKey = await crypto.subtle.importKey(
    'raw', userPub,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, []
  );
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: userPubKey },
    ephemeral.privateKey,
    256
  ));

  // 3. HKDF stage 1 — derive IKM
  const prkKey = await hmac(userAuth, ecdh);
  const keyInfo = concatBytes(
    new TextEncoder().encode('WebPush: info\0'),
    userPub,
    ephPubRaw,
    new Uint8Array([0x01])
  );
  const ikm = (await hmac(prkKey, keyInfo)).slice(0, 32);

  // 4. HKDF stage 2 — derive CEK + NONCE from a fresh salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, new TextEncoder().encode('Content-Encoding: aes128gcm\0\x01'))).slice(0, 16);
  const nonce = (await hmac(prk, new TextEncoder().encode('Content-Encoding: nonce\0\x01'))).slice(0, 12);

  // 5. Pad plaintext with delimiter 0x02 (last record)
  const ptBytes = new TextEncoder().encode(plaintext);
  const padded = concatBytes(ptBytes, new Uint8Array([0x02]));

  // 6. AES-128-GCM encrypt
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aesKey,
    padded
  ));

  // 7. aes128gcm header: salt(16) || rs(4, BE, =4096) || idlen(1, =65) || keyid(65, =ephPub)
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  header[16] = 0; header[17] = 0; header[18] = 0x10; header[19] = 0;
  header[20] = 65;
  header.set(ephPubRaw, 21);

  return concatBytes(header, ciphertext);
}

/* ════════════ Send Push ════════════ */

async function sendPush(env, sub, payload) {
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await buildVapidJwt(env, audience);
  const body = await encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth);

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(body.byteLength),
      TTL: '86400',
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`,
    },
    body,
  });

  // 404/410: subscription gone (user uninstalled / changed browser) — clean up
  if (res.status === 404 || res.status === 410) {
    console.log(`[push] subscription gone (${res.status}), deleting`, sub.endpoint.slice(-30));
    await sbDelete(env, `push_subscriptions?id=eq.${sub.id}`);
  } else if (!res.ok) {
    console.error('[push] failed', res.status, await res.text());
  }
  return res;
}

/* ════════════ Reminder logic ════════════ */

function dedupeKey(row) {
  return `${row.date || ''}T${row.time || '23:59'}|${row.remind}`;
}

function remindLabel(mins) {
  if (mins >= 1440) return `${Math.floor(mins / 1440)} 天后`;
  if (mins >= 60) return `${Math.floor(mins / 60)} 小时后`;
  return `${mins} 分钟后`;
}

async function checkReminders(env) {
  const now = Date.now();
  // Look back 24h for date (covers all currently-relevant rows; rows with date in the far past are stale)
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [todos, academics] = await Promise.all([
    sbSelect(env, `todos?select=id,user_id,text,date,time,remind,notified_for&done=eq.false&remind=gt.0&date=gte.${oneDayAgo}`),
    sbSelect(env, `academics?select=id,user_id,sub,name,date,time,remind,notified_for&done=eq.false&remind=gt.0&date=gte.${oneDayAgo}`),
  ]);

  const due = [];
  for (const t of todos) {
    if (!t.date || !t.remind) continue;
    const dueAt = new Date(`${t.date}T${(t.time || '23:59').slice(0,5)}:00+08:00`).getTime();
    const remindAt = dueAt - t.remind * 60000;
    const key = dedupeKey(t);
    if (now >= remindAt && now < dueAt && t.notified_for !== key) {
      due.push({
        table: 'todos', id: t.id, user_id: t.user_id, key,
        title: '待办提醒',
        body: `${t.text} · ${remindLabel(t.remind)}截止`,
      });
    }
  }
  for (const a of academics) {
    if (!a.date || !a.remind) continue;
    const dueAt = new Date(`${a.date}T${a.time || '23:59'}:00`).getTime();
    const remindAt = dueAt - a.remind * 60000;
    const key = dedupeKey(a);
    if (now >= remindAt && now < dueAt && a.notified_for !== key) {
      due.push({
        table: 'academics', id: a.id, user_id: a.user_id, key,
        title: `课业 · ${a.sub || ''}`,
        body: `${a.name} · ${remindLabel(a.remind)}截止`,
      });
    }
  }

  if (!due.length) {
    console.log('[cron]', new Date().toISOString(), 'no due reminders');
    return;
  }
  console.log('[cron]', due.length, 'due reminder(s)');

  // Group by user → fetch subscriptions once per user
  const byUser = new Map();
  for (const r of due) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
    byUser.get(r.user_id).push(r);
  }

  for (const [userId, reminders] of byUser) {
    const subs = await sbSelect(env, `push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${userId}`);
    if (!subs.length) {
      console.log('[cron] user', userId, 'has no subscriptions, marking notified anyway');
    }
    for (const r of reminders) {
      for (const sub of subs) {
        try {
          await sendPush(env, sub, { title: r.title, body: r.body, tag: r.id });
        } catch (e) {
          console.error('[cron] sendPush threw', e.message);
        }
      }
      await sbUpdate(env, `${r.table}?id=eq.${r.id}`, { notified_for: r.key });
    }
  }
}

/* ════════════ System (RPG) push — morning task + nightly settle ════════════
   At 08:00 local: today's challenge (your weakest pillar over the last 30 days).
   At 20:30 local (before the 21:30 phone-away ritual): the day's settle —
   all-clear praise / zero-progress warning / partial nudge. Hard "GM" voice.
   Computed server-side from the90_daily (the scoring rule is tiny + stable). */

const SYS_TZ_OFFSET = 8 * 3600 * 1000;            // Asia/Taipei, no DST
const SYS_START = '2026-05-11';                   // The 90 — day 1
// order MUST mirror RPG_ATTR_ORDER (rpg.js) so weakest-pillar tie-breaking
// matches the in-app daily challenge that actually grants the EXP.
const SYS_TARGETS = [
  { id:'V', label:'健身' }, { id:'II', label:'篮球' }, { id:'IV', label:'日语' },
  { id:'III', label:'赚钱' }, { id:'I', label:'睡眠' },
];
function sysDayOf(dateStr){
  const d = new Date(dateStr + 'T00:00:00+08:00');
  const s = new Date(SYS_START + 'T00:00:00+08:00');
  return Math.floor((d - s) / 86400000) + 1;
}
function sysPhaseOf(day){ return day <= 30 ? 'standardize' : (day <= 60 ? 'stabilize' : 'optimize'); }
function sysMet(score, phase){ return phase === 'stabilize' ? (typeof score === 'number' ? score > 0 : !!score) : !!score; }

async function sbUpsert(env, table, body, onConflict) {
  const res = await fetch(`${sbBase(env)}/${table}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: { ...sbHeaders(env), Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error('sbUpsert failed', table, res.status, await res.text());
}

async function checkSystemPush(env, forceSlot) {
  const localNow = new Date(Date.now() + SYS_TZ_OFFSET);
  const hh = localNow.getUTCHours(), mm = localNow.getUTCMinutes();
  let slot = forceSlot || null;
  if (!slot) {
    if (hh === 8 && mm < 10) slot = 'morning';
    else if (hh === 20 && mm >= 30 && mm < 40) slot = 'night';
  }
  if (!slot) return;

  const today = localNow.toISOString().slice(0, 10);
  const start30 = new Date(localNow.getTime() - 29 * 86400000).toISOString().slice(0, 10);

  const subs = await sbSelect(env, `push_subscriptions?select=id,endpoint,p256dh,auth,user_id`);
  if (!subs.length) return;
  const byUser = new Map();
  for (const s of subs) { if (!byUser.has(s.user_id)) byUser.set(s.user_id, []); byUser.get(s.user_id).push(s); }

  // who already received this slot today (claim-first dedup → at-most-once per day)
  const sent = await sbSelect(env, `system_push_log?select=user_id&slot=eq.${slot}&sent_on=eq.${today}`);
  const sentSet = new Set(sent.map((r) => r.user_id));

  for (const [uid, usubs] of byUser) {
    if (!forceSlot && sentSet.has(uid)) continue;

    const daily = await sbSelect(env, `the90_daily?select=date,scores&user_id=eq.${uid}&date=gte.${start30}&date=lte.${today}`);
    const cnt = { I:0, II:0, III:0, IV:0, V:0 };
    let todayMet = 0;
    for (const row of daily) {
      const ph = sysPhaseOf(sysDayOf(row.date));
      const sc = row.scores || {};
      for (const t of SYS_TARGETS) {
        if (sysMet(sc[t.id], ph)) { cnt[t.id]++; if (row.date === today) todayMet++; }
      }
    }
    let weak = SYS_TARGETS[0];
    for (const t of SYS_TARGETS) { if (cnt[t.id] < cnt[weak.id]) weak = t; }
    const total = SYS_TARGETS.length;

    let body;
    if (slot === 'morning') {
      body = `今日狩猎目标已生成 — 直面你的弱点「${weak.label}」。`;
    } else if (todayMet >= total) {
      body = `今日五项全清。君主的轨迹，已被记录。`;
    } else if (todayMet <= 0) {
      body = `检测到今日零进度。再不行动，衰弱将至。`;
    } else {
      body = `今日 ${todayMet}/${total} — 还差 ${total - todayMet} 项，别让今天留白。`;
    }

    // claim the slot before sending so a double cron tick can't double-buzz
    if (!forceSlot) await sbUpsert(env, 'system_push_log', { user_id: uid, slot, sent_on: today }, 'user_id,slot');
    for (const s of usubs) {
      try { await sendPush(env, s, { title: '[ 系统 ]', body, tag: `sys-${slot}`, url: './#system' }); }
      catch (e) { console.error('[sys-push] sendPush threw', e.message); }
    }
  }
}

/* ════════════ Worker entry points ════════════ */

export default {
  // Cron trigger (every minute)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkReminders(env));
    ctx.waitUntil(checkSystemPush(env));
  },

  // Optional HTTP endpoints for manual testing.
  //   /test                     → run the reminder cron now
  //   /test-system?slot=night   → run a System push now (slot=morning|night), bypassing dedup
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/test') {
      await checkReminders(env);
      return new Response('OK — checkReminders ran\n');
    }
    if (url.pathname === '/test-system') {
      const slot = url.searchParams.get('slot') === 'morning' ? 'morning' : 'night';
      await checkSystemPush(env, slot);
      return new Response(`OK — checkSystemPush(${slot}) ran\n`);
    }
    return new Response('cyrus-os-reminders cron worker\n');
  },
};
