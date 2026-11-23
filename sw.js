/* 古典単語DX : app shell offline cache */
const CACHE='koten-dx-app-v3-20261123';
const ASSETS=['./','./index.html','./style.css','./app.js','./data.js','./favicon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name.startsWith('koten-dx-app-')&&name!==CACHE).map(name=>caches.delete(name)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(resp=>{if(resp.ok){const clone=resp.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',clone));}return resp;}).catch(()=>caches.match('./index.html')));
  }else{
    const freshFiles=['/app.js','/data.js','/style.css','/sw.js'];
    const isFresh=freshFiles.some(path=>new URL(event.request.url).pathname.endsWith(path));
    if(isFresh){event.respondWith(fetch(event.request).then(resp=>{if(resp.ok){const clone=resp.clone();caches.open(CACHE).then(cache=>cache.put(event.request,clone));}return resp;}).catch(()=>caches.match(event.request)));}
    else {event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));}
  }
});
