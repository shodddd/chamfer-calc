// Простой service worker для offline-режима.
// Стратегия: network-first для ассетов приложения (чтобы обновления подхватывались сразу при наличии сети),
// с fallback на кэш в офлайне. Это предотвращает залипание старых версий.
const CACHE_NAME = 'chamfer-calc-v6';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.webmanifest',
    './icon-192.png',
    './icon-512.png',
    './icon-maskable.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS).catch(() => {}))
    );
    // Сразу активируем новую версию, не дожидаясь закрытия всех вкладок
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) =>
            Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
        ).then(() => self.clients.claim())
    );
});

// Сообщение от страницы: принудительно применить обновление
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    // Только для запросов внутри нашего origin
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    // Network-first: сначала пытаемся получить свежую версию из сети, при неудаче — из кэша.
    event.respondWith(
        fetch(req)
            .then((resp) => {
                if (resp && resp.status === 200 && resp.type === 'basic') {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
                }
                return resp;
            })
            .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
});
