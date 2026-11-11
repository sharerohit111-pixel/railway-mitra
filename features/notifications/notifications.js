/* Railway Mitra Notifications — static in-app feed; no push/cloud services. */
(function(){
  "use strict";
  const FEED_URL="notices.json";
  const STORAGE_KEY="railwayMitra.notifications.read.v1";
  const list=document.getElementById("notificationList");
  const unreadCount=document.getElementById("unreadCount");
  const totalCount=document.getElementById("totalCount");
  const markAll=document.getElementById("markAllRead");
  const filters=document.querySelectorAll("[data-filter]");
  let notices=[];
  let activeFilter="all";
  let readIds=new Set();
  try{readIds=new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]"));}catch(_){readIds=new Set();}

  function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify([...readIds]));}catch(_){}}
  function safe(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function render(){
    const unread=notices.filter(n=>!readIds.has(n.id)).length;
    unreadCount.textContent=unread+" unread";
    totalCount.textContent=notices.length+" notifications";
    const shown=notices.filter(n=>activeFilter==="all"||(activeFilter==="unread"?!readIds.has(n.id):n.category===activeFilter));
    if(!shown.length){list.innerHTML='<div class="rm-notifications__empty">'+(notices.length?'No notifications in this category.':'No notifications yet. New announcements will appear here.')+'</div>';return;}
    list.innerHTML=shown.map(n=>{
      const read=readIds.has(n.id);
      return '<article class="rm-notification '+(read?'':'is-unread')+'"><div class="rm-notification__top"><span>'+safe(n.categoryLabel||"UPDATE")+'</span><span>'+(read?'READ':'NEW')+'</span></div><h2>'+safe(n.title)+'</h2><p>'+safe(n.message)+'</p><div class="rm-notification__date">'+safe(n.date||"")+'</div>'+(read?'':'<button class="rm-notification__read" type="button" data-read="'+safe(n.id)+'">Mark as read</button>')+'</article>';
    }).join("");
  }
  filters.forEach(button=>button.addEventListener("click",()=>{activeFilter=button.dataset.filter;filters.forEach(x=>x.classList.toggle("is-active",x===button));render();}));
  list.addEventListener("click",event=>{const button=event.target.closest("[data-read]");if(!button)return;readIds.add(button.dataset.read);save();render();});
  markAll.addEventListener("click",()=>{notices.forEach(n=>readIds.add(n.id));save();render();});
  fetch(FEED_URL,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error("Feed unavailable");return r.json();}).then(data=>{notices=Array.isArray(data)?data.filter(n=>n&&n.id&&n.title&&n.message):[];render();}).catch(()=>{list.innerHTML='<div class="rm-notifications__empty">Notifications could not be loaded. Please try again later.</div>';});
})();