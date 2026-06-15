/* Motivation Center — a full-screen view (mirrors the finance view) showing a
   grid of YouTube (unlisted) videos. Videos live in the motivation_videos table
   (S.motiv.videos); thumbnails and the embed player need no API key.
   Thumbnail: https://img.youtube.com/vi/<id>/mqdefault.jpg
   Player:    https://www.youtube-nocookie.com/embed/<id> */

const motivUI = { open:false, playing:null };

/* Extract the 11-char YouTube id from a URL (youtu.be / watch?v= / embed / shorts
   / live / v) or a raw id. Returns null if nothing matches. */
function parseYouTubeId(input){
  if(!input) return null;
  const s = String(input).trim();
  if(/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let m;
  m = s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);                 if(m) return m[1];
  m = s.match(/[?&]v=([A-Za-z0-9_-]{11})/);                      if(m) return m[1];
  m = s.match(/\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/); if(m) return m[1];
  return null;
}

/* ── open / close (hash-routed like finance) ── */
function openMotivation(fromHash){
  const v = document.getElementById('motivation-view'); if(!v) return;
  motivUI.open = true;
  v.classList.add('open');
  v.setAttribute('aria-hidden','false');
  document.body.classList.add('motiv-locked');
  if(!fromHash && location.hash!=='#motivation'){ location.hash='motivation'; }
  rMotivation();
}
function closeMotivation(fromHash){
  const v = document.getElementById('motivation-view'); if(!v) return;
  motivUI.open = false;
  v.classList.remove('open');
  v.setAttribute('aria-hidden','true');
  document.body.classList.remove('motiv-locked');
  closeMotivPlayer();
  if(!fromHash && location.hash==='#motivation'){ history.replaceState(null,'',location.pathname+location.search); }
}
function motivHashRoute(){
  if(location.hash==='#motivation'){ if(!motivUI.open) openMotivation(true); }
  else if(motivUI.open){ closeMotivation(true); }
}
window.addEventListener('hashchange', motivHashRoute);
/* Escape closes the player first (if one is open), else the Motivation HUD
   (consistent with finance/system/fitness) */
document.addEventListener('keydown', e => {
  if(e.key!=='Escape' || !motivUI.open) return;
  e.preventDefault();
  if(motivUI.playing) closeMotivPlayer(); else closeMotivation();
});

/* ── render grid + add form (incremental: reuse card nodes keyed by video id, so a
   local add/delete OR a remote realtime change updates in place instead of
   rebuilding the whole grid and re-decoding every thumbnail) ── */
function rMotivation(){
  if(!motivUI.open) return;
  const body = document.getElementById('motiv-body'); if(!body) return;
  const vids = (S.motiv && S.motiv.videos) || [];

  // static shell built once (keeps the inputs + their focus/value across renders)
  if(!body.querySelector('.motiv-add')){
    body.innerHTML = `
      <div class="motiv-add">
        <input id="motiv-url" class="motiv-input" type="text" placeholder="贴上 YouTube 链接…">
        <input id="motiv-name" class="motiv-input motiv-input-name" type="text" placeholder="标题（可留空，自动抓取）">
        <button class="motiv-add-btn" onclick="addMotivVideo()">添加</button>
      </div>
      <div id="motiv-msg" class="motiv-msg" aria-live="polite"></div>
      <div id="motiv-grid" class="motiv-grid"></div>
      <div id="motiv-empty" class="motiv-empty" hidden>还没有视频。贴一条 YouTube（不公开）链接，建立你的动力库。</div>`;
    ['motiv-url','motiv-name'].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.addEventListener('keydown', e=>{ if(e.key==='Enter') addMotivVideo(); });
    });
  }

  const grid = document.getElementById('motiv-grid');
  const emptyEl = document.getElementById('motiv-empty');
  if(emptyEl) emptyEl.hidden = vids.length > 0;
  if(grid) grid.hidden = vids.length === 0;
  if(!grid) return;

  // reconcile cards by id — reuse nodes (no thumbnail re-request), add/remove/reorder
  const have = new Map();
  grid.querySelectorAll('.motiv-card[data-vid]').forEach(c => have.set(c.dataset.vid, c));
  const want = new Set(vids.map(v => v.id));
  have.forEach((node, id) => { if(!want.has(id)) node.remove(); });

  let prev = null;
  for(const v of vids){
    let card = have.get(v.id);
    if(!card){
      card = document.createElement('div');
      card.className = 'motiv-card';
      card.dataset.vid = v.id;
      card.setAttribute('onclick', `playMotiv('${v.id}')`);
      card.innerHTML = `
        <div class="motiv-thumb">
          <img src="https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg" alt="" loading="lazy" width="320" height="180" decoding="async">
          <span class="motiv-play">&#9658;</span>
        </div>
        <div class="motiv-card-title">${escH(v.title || '未命名')}</div>
        <button class="motiv-del" onclick="event.stopPropagation();delMotivVideo('${v.id}')" title="删除" aria-label="删除">&#10005;</button>`;
    } else {
      const t = card.querySelector('.motiv-card-title');
      const title = escH(v.title || '未命名');
      if(t && t.innerHTML !== title) t.innerHTML = title;   // title-only edits stay cheap
    }
    const ref = prev ? prev.nextSibling : grid.firstChild;
    if(card !== ref) grid.insertBefore(card, ref);
    prev = card;
  }
  if(typeof attachRipples==='function') attachRipples(body);
}

function motivMsg(text){
  const el = document.getElementById('motiv-msg');
  if(el) el.textContent = text || '';
}

/* ── add / delete ── */
async function addMotivVideo(){
  const urlEl  = document.getElementById('motiv-url');
  const nameEl = document.getElementById('motiv-name');
  const id = parseYouTubeId(urlEl ? urlEl.value : '');
  if(!id){ motivMsg('链接无法识别，请贴一条 YouTube 链接。'); return; }
  if(S.motiv.videos.some(v => v.videoId === id)){ motivMsg('这个视频已经在库里了。'); return; }
  let title = nameEl ? nameEl.value.trim() : '';
  if(!title){
    // best-effort auto-title via public oEmbed; CORS may block → fall back silently
    motivMsg('正在添加…');
    try{
      const r = await fetch(`https://www.youtube.com/oembed?url=https://youtu.be/${id}&format=json`);
      if(r.ok){ const j = await r.json(); title = j.title || ''; }
    }catch(e){ /* keep title empty */ }
  }
  const maxPos = S.motiv.videos.reduce((m,v)=>Math.max(m, v.position||0), 0);
  S.motiv.videos.push({ id: crypto.randomUUID(), videoId: id, title, position: maxPos + 1 });
  saveMotiv();
  rMotivation();
}

function delMotivVideo(id){
  const v = S.motiv.videos.find(x => x.id === id);
  if(!confirm('删除这个视频？' + (v && v.title ? `\n「${v.title}」` : ''))) return;
  S.motiv.videos = S.motiv.videos.filter(x => x.id !== id);
  saveMotiv();
  rMotivation();
}

/* ── player overlay ── */
function playMotiv(id){
  const v = S.motiv.videos.find(x => x.id === id); if(!v) return;
  motivUI.playing = id;
  const frame = document.getElementById('motiv-player-frame');
  if(frame){
    frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${v.videoId}?autoplay=1&rel=0"`
      + ` title="${escH(v.title || '')}" frameborder="0"`
      + ` allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"`
      + ` allowfullscreen></iframe>`;
  }
  const p = document.getElementById('motiv-player');
  if(p){ p.classList.add('open'); p.setAttribute('aria-hidden','false'); }
}
function closeMotivPlayer(){
  motivUI.playing = null;
  const p = document.getElementById('motiv-player');
  if(p){ p.classList.remove('open'); p.setAttribute('aria-hidden','true'); }
  const frame = document.getElementById('motiv-player-frame');
  if(frame) frame.innerHTML = '';   // clearing the iframe stops playback / kills audio
}

// Honour a deep-link to #motivation on first load.
motivHashRoute();
