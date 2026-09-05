const CACHE='oy-da22-v18';
const CORE=[
  './','./index.html','./manifest.webmanifest','./config.js','./db.json',
  './fonts/Mallang-Galmuri11-R.ttf',
  './icons/icon-16.png','./icons/icon-32.png','./icons/icon-48.png','./icons/icon-96.png','./icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png',
  './icons/products_off.png','./icons/products_on.png','./icons/skin_off.png','./icons/skin_on.png','./icons/makeup_off.png','./icons/makeup_on.png','./icons/search_off.png','./icons/search_on.png','./icons/sticker_heart.png','./icons/sticker_sleep.png','./icons/sticker_wave.png'
];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE).catch(()=>{})))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.origin!==location.origin)return;
  if(u.pathname.endsWith('/config.js')||u.pathname.endsWith('/db.json')){
    e.respondWith(fetch(e.request,{cache:'no-store'}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,copy));return r}).catch(()=>caches.match('./index.html'))));
});
