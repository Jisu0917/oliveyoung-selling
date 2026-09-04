const CACHE='oy-da22-v7';
const ASSETS=[
  './','./index.html','./manifest.webmanifest','./db.json','./Mallang-Galmuri11-R.ttf',
  './icon-512.png','./icon-192.png','./icon-180.png','./icon-96.png','./icon-48.png','./icon-32.png','./icon-16.png',
  './products_off.png','./products_on.png','./skin_off.png','./skin_on.png','./makeup_off.png','./makeup_on.png',
  './search_off.png','./search_on.png','./sticker_heart.png','./sticker_sleep.png','./sticker_wave.png'
];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))));
