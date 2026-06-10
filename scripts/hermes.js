/* Hermes notices — a one-way channel where Hermes (the assistant) surfaces things
   it wants Cyrus to see, without needing a Telegram reply. Read + dismiss only here;
   rows are written server-side by Hermes via the cyrus-os skill. */

const KIND_META = {
  insight:  { label: '洞察', glyph: '◆' },
  reminder: { label: '提醒', glyph: '⏰' },
  nudge:    { label: '提点', glyph: '✦' },
};

/* Sound guard: rHermes runs on page load, on every renderAll, and on realtime
   sync echoes (including our own dismiss bouncing back) — so the chime must be
   driven by ID DIFFING, never by the render itself. First call seeds the set
   silently; afterwards only a genuinely new id chirps. */
let _hermesSeen = null;

function rHermes(){
  const panel = document.getElementById('hermes-panel');
  const listEl = document.getElementById('hermes-list');
  if(!panel || !listEl) return;

  const active = (S.hermes || []).filter(n => !n.dismissedAt);
  // only seed/diff once pullHermes has actually run — the pre-sync renderAll
  // sees an empty S.hermes, and seeding an empty set there would make every
  // standing notice look "fresh" (and chirp) when the real data lands
  if(window._hermesPulled){
    const fresh = _hermesSeen !== null && active.some(n => !_hermesSeen.has(n.id));
    _hermesSeen = new Set(active.map(n => n.id));
    if(fresh && window.Sfx) Sfx.notice();
  }
  if(!active.length){
    panel.style.display = 'none';
    listEl.innerHTML = '';
    return;
  }
  panel.style.display = 'block';

  // newest first
  active.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));

  const countEl = document.getElementById('hermes-count');
  if(countEl) countEl.textContent = active.length;

  listEl.innerHTML = active.map(n=>{
    const meta = KIND_META[n.kind] || KIND_META.insight;
    return `<div class="hermes-notice" data-id="${n.id}">
      <span class="hermes-glyph" title="${meta.label}">${meta.glyph}</span>
      <div class="hermes-notice-body">
        <div class="hermes-notice-text">${escH(n.text)}</div>
        <div class="hermes-notice-meta">${meta.label} · ${hermesTimeAgo(n.createdAt)}</div>
      </div>
      <button class="hermes-dismiss fx-btn" onclick="dismissNotice('${n.id}')" aria-label="知道了">知道了</button>
    </div>`;
  }).join('');
  attachRipples();
}

function hermesTimeAgo(ts){
  if(!ts) return '';
  const diff = Date.now() - ts;
  const m = Math.floor(diff/60000);
  if(m < 1) return '刚刚';
  if(m < 60) return m + ' 分钟前';
  const h = Math.floor(m/60);
  if(h < 24) return h + ' 小时前';
  const d = Math.floor(h/24);
  return d + ' 天前';
}

/* Dismiss = soft-delete (stamp dismissed_at). Optimistic: hide locally, then persist. */
async function dismissNotice(id){
  const n = (S.hermes || []).find(x => x.id === id);
  if(!n || n.dismissedAt) return;   // idempotent — double-click can't double-stamp
  n.dismissedAt = Date.now();
  if(window.Sfx) Sfx.tick();
  rHermes();
  if(typeof syncDismissHermes === 'function') syncDismissHermes(id);
}
