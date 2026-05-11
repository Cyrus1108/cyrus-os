/* Notification permission + local reminder checks */
function canNotify(){return 'Notification' in window && Notification.permission === 'granted';}

function requestNotifPerm(){
  if(!('Notification' in window)){
    alert('此浏览器不支持通知功能');
    return;
  }
  Notification.requestPermission().then(perm=>{
    if(perm === 'granted'){
      new Notification('Cyrus OS', {body:'通知已启用 · 截止时间会自动提醒你', icon:''});
      dismissNotifBanner();
    }
  });
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
function fireNotif(title, body){
  if(canNotify()){
    new Notification(title, {body:body, icon:'', tag:'cyrus-os'});
  }
}

function checkReminders(){
  if(!canNotify()) return;
  const now = Date.now();
  const fired = new Set(S.notifiedIds);

  S.ac.forEach(t=>{
    if(t.done || !t.remind || t.remind === 0) return;
    const dueTime = t.time ? `${t.date}T${t.time}:00` : `${t.date}T23:59:00`;
    const due = new Date(dueTime).getTime();
    const remindAt = due - t.remind * 60000;
    const notifId = `ac_${t.id}_${t.remind}`;
    if(now >= remindAt && now < due && !fired.has(notifId)){
      const mins = t.remind;
      const label = mins >= 1440 ? Math.floor(mins/1440)+' 天后' : mins >= 60 ? Math.floor(mins/60)+' 小时后' : mins+' 分钟后';
      fireNotif(`课业 · ${t.sub}`, `${t.name} · ${label}截止`);
      fired.add(notifId);
    }
  });

  S.todos.forEach(t=>{
    if(t.done || !t.remind || t.remind === 0 || !t.date) return;
    const dueTime = t.time ? `${t.date}T${t.time}:00` : `${t.date}T23:59:00`;
    const due = new Date(dueTime).getTime();
    const remindAt = due - t.remind * 60000;
    const notifId = `td_${t.id}_${t.remind}_${t.date}`;
    if(now >= remindAt && now < due && !fired.has(notifId)){
      const mins = t.remind;
      const label = mins >= 1440 ? Math.floor(mins/1440)+' 天后' : mins >= 60 ? Math.floor(mins/60)+' 小时后' : mins+' 分钟后';
      const cat = S.cats.find(c=>c.id===t.cat);
      fireNotif(`待办 · ${cat?cat.name:'未分类'}`, `${t.text} · ${label}截止`);
      fired.add(notifId);
    }
  });

  S.notifiedIds = Array.from(fired);
  saveLS('notifiedIds', S.notifiedIds);
}
