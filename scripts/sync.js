/* Sync layer — pull on auth, push after every local save, Realtime for cross-device.
   Push is fire-and-forget; failures are logged but don't block the UI.
   Push functions await pullAllPromise so writes that fire before initial pull completes
   still execute (after pull). Supabase v2 returns {error} — we log it, not try/catch. */

let realtimeChannel = null;
let initialPullDone = false;
let pullAllPromise = null;

function logIfError(label, res){
  if(res && res.error){
    console.error(`[sync] ${label}`, res.error);
  }
}
async function waitForPull(){
  if(pullAllPromise){
    try{ await pullAllPromise; }catch(e){}
  }
}

/* ════════════ PULL ════════════ */

async function pullSettings(){
  const { data } = await sb.from('settings').select('*')
    .eq('user_id', currentUser.id).maybeSingle();
  if(!data) return;
  // Mirror to localStorage so loadLS() keeps working (creed.js etc. read via loadLS)
  if(data.creed_idx != null) saveLSRaw('creed_idx', data.creed_idx);
  if(data.creed_open != null) saveLSRaw('creed_open', data.creed_open);
  if(data.show_done != null) saveLSRaw('show_done', data.show_done);
  if(data.symbols != null){
    saveLSRaw('symbols', data.symbols);
    S.symbols = data.symbols;
  }
  if(data.notif_banner_dismissed != null) saveLSRaw('notif_banner_dismissed', data.notif_banner_dismissed);
}

async function pullMorning(){
  const { data } = await sb.from('morning').select('*')
    .eq('user_id', currentUser.id).eq('date', TODAY).maybeSingle();
  if(data && data.list){
    S.mr = { date: data.date, list: data.list };
  } else {
    // No row for today — reset to default (carries over yesterday's custom items, all undone)
    S.mr.list = S.mr.list.map(i=>({...i, d:false}));
    S.mr.date = TODAY;
  }
}

async function pullAcademics(){
  const { data } = await sb.from('academics').select('*')
    .eq('user_id', currentUser.id);
  S.ac = (data || []).map(r => ({
    id: r.id, sub: r.sub, name: r.name,
    date: r.date, time: r.time, pri: r.pri,
    remind: r.remind || 0, done: r.done,
  }));
}

async function pullJapanese(){
  const { data } = await sb.from('japanese').select('*')
    .eq('user_id', currentUser.id).maybeSingle();
  if(data){
    S.jp = {
      streak: data.streak || 0,
      last: data.last_date || null,
      log: data.log || {},
      note: data.note || '',
      list: data.list || JSON.parse(JSON.stringify(DEF_JP)),
    };
  }
}

async function pullTrading(){
  const { data } = await sb.from('trading').select('*')
    .eq('user_id', currentUser.id).eq('date', TODAY).maybeSingle();
  if(data){
    S.tr = { date: data.date, bias: data.bias || '', list: data.list };
  } else {
    S.tr.list = S.tr.list.map(i=>({...i, d:false}));
    S.tr.date = TODAY;
    S.tr.bias = '';
  }
}

async function pullCategories(){
  const { data } = await sb.from('categories').select('*')
    .eq('user_id', currentUser.id).order('created_at');
  if(data && data.length){
    S.cats = data.map(c => ({ id: c.id, name: c.name }));
  }
  // If empty, leave S.cats as DEFAULT_CATS — they'll get pushed on next write
}

async function pullTodos(){
  const { data } = await sb.from('todos').select('*')
    .eq('user_id', currentUser.id);
  S.todos = (data || []).map(r => ({
    id: r.id, text: r.text, cat: r.cat_id,
    date: r.date, time: r.time, pri: r.pri,
    remind: r.remind || 0,
    repeat: r.repeat || 'none',
    customDays: r.custom_days || 0,
    done: r.done,
    doneAt: r.done_at ? new Date(r.done_at).getTime() : null,
    created: r.created_at ? r.created_at.slice(0,10) : TODAY,
  }));
}

async function pullAll(force){
  if(!currentUser) return;
  if(pullAllPromise && !force) return pullAllPromise;
  pullAllPromise = (async () => {
    try{
      await Promise.all([
        pullSettings(), pullMorning(), pullAcademics(),
        pullJapanese(), pullTrading(), pullCategories(), pullTodos(),
      ]);
      initialPullDone = true;
      console.log('[sync] initial pull complete');

      // If categories were empty in DB, replace 'c1'..'c4' with uuids and push so future devices see them
      if(S.cats.length && !String(S.cats[0].id).includes('-')){
        S.cats = S.cats.map(c => ({ id: crypto.randomUUID(), name: c.name }));
        saveCats();
      }
    } catch(e){
      console.error('[sync] pullAll', e);
    }
  })();
  return pullAllPromise;
}

/* ════════════ PUSH ════════════ */

async function syncPushSettings(){
  if(!currentUser) return;
  await waitForPull();
  const res = await sb.from('settings').upsert({
    user_id: currentUser.id,
    creed_idx: loadLS('creed_idx', 0),
    creed_open: loadLS('creed_open', false),
    show_done: loadLS('show_done', false),
    symbols: S.symbols,
    notif_banner_dismissed: loadLS('notif_banner_dismissed', false),
  });
  logIfError('push settings', res);
}

async function syncPushMorning(){
  if(!currentUser) return;
  await waitForPull();
  const res = await sb.from('morning').upsert({
    user_id: currentUser.id,
    date: S.mr.date || TODAY,
    list: S.mr.list,
  }, { onConflict: 'user_id,date' });
  logIfError('push morning', res);
}

async function syncPushJP(){
  if(!currentUser) return;
  await waitForPull();
  const res = await sb.from('japanese').upsert({
    user_id: currentUser.id,
    streak: S.jp.streak,
    last_date: S.jp.last || null,
    log: S.jp.log || {},
    note: S.jp.note || '',
    list: S.jp.list,
  });
  logIfError('push jp', res);
}

async function syncPushTrading(){
  if(!currentUser) return;
  await waitForPull();
  const res = await sb.from('trading').upsert({
    user_id: currentUser.id,
    date: S.tr.date || TODAY,
    bias: S.tr.bias || '',
    list: S.tr.list,
  }, { onConflict: 'user_id,date' });
  logIfError('push trading', res);
}

/* Helper: replace-all sync (delete remote rows not in local, upsert local).
   Returns immediately if no currentUser. */
async function replaceTable(table, rows, mapFn){
  const localIds = rows.map(r => r.id);
  let delRes;
  if(localIds.length){
    // Postgrest expects: not.in.("id1","id2")
    const inList = '(' + localIds.map(id => `"${id}"`).join(',') + ')';
    delRes = await sb.from(table).delete().eq('user_id', currentUser.id).not('id', 'in', inList);
  } else {
    delRes = await sb.from(table).delete().eq('user_id', currentUser.id);
  }
  logIfError(`delete ${table}`, delRes);
  if(rows.length){
    const upRes = await sb.from(table).upsert(rows.map(mapFn));
    logIfError(`upsert ${table}`, upRes);
  }
}

async function syncPushAcademics(){
  if(!currentUser) return;
  await waitForPull();
  await replaceTable('academics', S.ac, t => ({
    id: t.id, user_id: currentUser.id,
    sub: t.sub, name: t.name,
    date: t.date || null, time: t.time || null,
    pri: t.pri, remind: t.remind || 0, done: t.done,
  }));
}

async function syncPushCategories(){
  if(!currentUser) return;
  await waitForPull();
  await replaceTable('categories', S.cats, c => ({
    id: c.id, user_id: currentUser.id, name: c.name,
  }));
}

async function syncPushTodos(){
  if(!currentUser) return;
  await waitForPull();
  await replaceTable('todos', S.todos, t => ({
    id: t.id, user_id: currentUser.id,
    text: t.text,
    cat_id: t.cat || null,
    date: t.date || null, time: t.time || null,
    pri: t.pri, remind: t.remind || 0,
    repeat: t.repeat || 'none',
    custom_days: t.customDays || 0,
    done: t.done,
    done_at: t.doneAt ? new Date(t.doneAt).toISOString() : null,
  }));
}

/* ════════════ REALTIME ════════════ */

function subscribeRealtime(){
  if(realtimeChannel || !currentUser) return;
  const uid = currentUser.id;

  realtimeChannel = sb.channel('cyrus-os-' + uid)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'morning', filter: `user_id=eq.${uid}` },
      async () => { await pullMorning(); rMR(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'academics', filter: `user_id=eq.${uid}` },
      async () => { await pullAcademics(); rAC(); rMetrics(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'japanese', filter: `user_id=eq.${uid}` },
      async () => { await pullJapanese(); rJP(); rMetrics(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trading', filter: `user_id=eq.${uid}` },
      async () => { await pullTrading(); rTR(); rMetrics(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `user_id=eq.${uid}` },
      async () => { await pullCategories(); rCats(); rTodos(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: `user_id=eq.${uid}` },
      async () => { await pullTodos(); rTodos(); rMetrics(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: `user_id=eq.${uid}` },
      async () => { await pullSettings(); renderAll(); })
    .subscribe((status, err) => {
      console.log('[realtime]', status);
      if(err) console.error('[realtime] error', err);
    });
}

function unsubscribeRealtime(){
  if(realtimeChannel){
    sb.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

/* Android Chrome aggressively suspends WebSockets in background tabs,
   so Realtime can silently die. On every visibility/focus return, force
   a fresh pull and re-subscribe if the channel isn't healthy. */
function rehydrateOnFocus(){
  if(document.visibilityState !== 'visible') return;
  if(!currentUser) return;
  const ch = realtimeChannel;
  const healthy = ch && (ch.state === 'joined' || ch.state === 'joining');
  if(!healthy){
    console.log('[realtime] re-subscribing (state was ' + (ch ? ch.state : 'none') + ')');
    unsubscribeRealtime();
    subscribeRealtime();
  }
  pullAll(true).then(()=>renderAll());
}
document.addEventListener('visibilitychange', rehydrateOnFocus);
window.addEventListener('focus', rehydrateOnFocus);
