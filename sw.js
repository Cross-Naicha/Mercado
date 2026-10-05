const CACHE_NAME = 'mercado-v204-stock-review';
const FILES = ['/static/text-cursor.svg', '/home', '/static/css/style.css', '/static/js/tabs.js', '/static/js/main.js', '/static/js/offline.js', '/static/js/cart.js', '/static/js/stock.js', '/static/js/shopping.js', '/static/manifest.json', '/static/pwa_icon.png'];
self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES)));
});
self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('mercado-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message',event=>{
    if(event.data?.type==='ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/get_products') return;
    if (event.request.mode === 'navigate') {
        event.respondWith(fetch(event.request).catch(() => caches.match('/home')));
    } else if (FILES.includes(url.pathname)) {
        event.respondWith(fetch(event.request).then(response=>{
            if(!response.ok) throw new Error('Archivo no disponible');
            const copy=response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(url.pathname,copy)));
            return response;
        }).catch(()=>caches.match(url.pathname)));
    }
});

























































