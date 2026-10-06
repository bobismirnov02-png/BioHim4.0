const CACHE='biohim-4.4-v1';
const ASSETS=['/','/index.html','/biology.html','/chemistry.html','/history-law.html','/theory-law.html','/human-action.html','/law.html','/biohim-v4.css','/biohim-v4.js','/biohim-library.css','/biohim-library.js','/biohim-ai.js','/biohim-study.css','/biohim-study.js','/biohim-v4.4.css','/biohim-v4.4.js','/manifest.json','/assets/biohim-64.png','/assets/biohim-192.png','/assets/biohim-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(async res=>{if(res.ok){const cache=await caches.open(CACHE);cache.put(req,res.clone());}return res;}).catch(async()=>await caches.match(req)||await caches.match('/index.html')));
    return;
  }
  event.respondWith(fetch(req).then(async res=>{if(res.ok&&res.type==='basic'){const cache=await caches.open(CACHE);cache.put(req,res.clone());}return res;}).catch(async()=>await caches.match(req)||new Response('Offline resource unavailable',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));
});
