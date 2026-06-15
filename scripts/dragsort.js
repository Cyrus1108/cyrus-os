/* Touch + mouse drag-to-reorder via Pointer Events.
   HTML5 native drag-and-drop doesn't fire on touch, so we roll our own.

   makeSortable(container, { itemSelector, handleSelector, onReorder })
   - Drag starts only from an element matching handleSelector inside an item,
     so normal list scrolling on the rest of the row still works.
   - The handle must have `touch-action:none` (set in CSS) so the browser
     doesn't steal the gesture for scrolling.
   - onReorder(idsInNewVisualOrder) fires once on drop. Each item must carry
     data-id. Re-binding is idempotent (container._sortableBound guard), so it's
     safe to call after every re-render — the listener lives on the container,
     not the (re-created) items.

   Uses a vertical (y-axis) hit test. Works perfectly for vertical lists; for the
   Morning grid it's serviceable (drag near the target slot and drop). */

function makeSortable(container, opts){
  if(!container) return;
  const { itemSelector, handleSelector, onReorder } = opts;

  // Keep latest opts so re-renders don't need to re-bind
  container._sortOpts = opts;
  if(container._sortableBound) return;
  container._sortableBound = true;

  let dragEl = null, placeholder = null, offsetY = 0;
  let scrollTimer = 0, lastClientY = 0;   // edge autoscroll while dragging

  const EDGE = 40, STEP = 10;
  function stopAutoScroll(){ if(scrollTimer){ clearInterval(scrollTimer); scrollTimer = 0; } }
  function edgeAutoScroll(){
    let dir = 0;
    if(lastClientY < EDGE) dir = -1;
    else if(lastClientY > innerHeight - EDGE) dir = 1;
    if(!dir){ stopAutoScroll(); return; }
    if(scrollTimer) return;
    scrollTimer = setInterval(() => {
      window.scrollBy(0, dir * STEP);
      dragEl && (dragEl.style.top = (lastClientY - offsetY) + 'px');
      const after = afterElement(lastClientY);
      if(after) container.insertBefore(placeholder, after);
      else container.appendChild(placeholder);
    }, 16);
  }

  function afterElement(y){
    const els = [...container.querySelectorAll(itemSelector)]
      .filter(el => el !== dragEl && el !== placeholder);
    let best = { offset: -Infinity, el: null };
    for(const el of els){
      const box = el.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if(offset < 0 && offset > best.offset) best = { offset, el };
    }
    return best.el;
  }

  function onDown(e){
    const o = container._sortOpts;
    const handle = e.target.closest(o.handleSelector);
    if(!handle || !container.contains(handle)) return;
    const item = handle.closest(o.itemSelector);
    if(!item) return;
    e.preventDefault();

    dragEl = item;
    const rect = item.getBoundingClientRect();
    offsetY = e.clientY - rect.top;

    placeholder = document.createElement(item.tagName);
    placeholder.className = 'drag-placeholder';
    placeholder.style.height = rect.height + 'px';
    item.after(placeholder);

    item.classList.add('dragging');
    item.style.position = 'fixed';
    item.style.zIndex = '999';
    item.style.width = rect.width + 'px';
    item.style.left = rect.left + 'px';
    item.style.top = (e.clientY - offsetY) + 'px';

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function onMove(e){
    if(!dragEl) return;
    e.preventDefault();
    lastClientY = e.clientY;
    dragEl.style.top = (e.clientY - offsetY) + 'px';
    const after = afterElement(e.clientY);
    if(after) container.insertBefore(placeholder, after);
    else container.appendChild(placeholder);
    edgeAutoScroll();
  }

  function onUp(){
    if(!dragEl) return;
    stopAutoScroll();
    container.insertBefore(dragEl, placeholder);
    placeholder.remove();
    dragEl.classList.remove('dragging');
    dragEl.style.position = dragEl.style.zIndex = dragEl.style.width = dragEl.style.left = dragEl.style.top = '';
    const ids = [...container.querySelectorAll(container._sortOpts.itemSelector)]
      .map(el => el.dataset.id).filter(Boolean);
    dragEl = placeholder = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    const cb = container._sortOpts.onReorder;
    if(cb) cb(ids);
  }

  container.addEventListener('pointerdown', onDown);
}

/* Reorder an array of {id} objects to match an id order, appending any leftover
   (e.g. filtered-out items not present in the visible list) at the end. */
function reorderById(arr, ids){
  const map = new Map(arr.map(i => [String(i.id), i]));
  const out = ids.map(id => map.get(String(id))).filter(Boolean);
  for(const i of arr) if(!ids.includes(String(i.id))) out.push(i);
  return out;
}
