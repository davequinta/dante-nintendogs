// Service worker: cache-first para los assets con hash, network-first para la página, así abre sin internet una vez instalada
const VER='dante-v1';
self.addEventListener('install',e=>{ self.skipWaiting(); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VER).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',e=>{ const u=new URL(e.request.url); if(e.request.method!=='GET'||u.origin!==location.origin) return;
  if(u.pathname.startsWith('/assets/')||u.pathname.startsWith('/tex/')||u.pathname.startsWith('/icons/')||u.pathname.startsWith('/audio/')){
    e.respondWith(caches.open(VER).then(async c=>{ const hit=await c.match(e.request); if(hit) return hit; const r=await fetch(e.request); if(r.ok) c.put(e.request,r.clone()); return r; })); return; }
  e.respondWith(fetch(e.request).then(r=>{ if(r.ok){ const cp=r.clone(); caches.open(VER).then(c=>c.put(e.request,cp)); } return r; }).catch(()=>caches.match(e.request).then(h=>h||caches.match('/')))); });
