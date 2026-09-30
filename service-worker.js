const CACHE='controle-refeicoes-v16';
const FILES=['./','./index.html','./manifest.webmanifest','./icone.svg','./logo-r2.png','./imagem-2r.jpg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('controle-refeicoes-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!['/','/index.html','/manifest.webmanifest','/icone.svg','/logo-r2.png','/imagem-2r.jpg'].includes(url.pathname))return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));});
