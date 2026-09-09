'use strict';
const CACHE = 'studyroom-shell-v9';
const SHELL = ['./', 'index.html', 'style.css?v=9', 'app.js?v=9', 'notes-language.js?v=9', 'builtin-notes.js?v=9', 'library.js?v=9', 'chat.js?v=9', 'library-config.js?v=9', 'extract.mjs?v=9', 'words.json?v=9',  'manifest.webmanifest?v=9', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('studyroom-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const allowed = SHELL.map(path => new URL(path, self.registration.scope).pathname);
  if (request.mode !== 'navigate' && !allowed.includes(url.pathname)) return;
  event.respondWith(fetch(request, {cache: 'no-store'}).then(response => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
    }
    return response;
  }).catch(async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const home = await cache.match(new URL('./', self.registration.scope).href);
      if (home) return home;
    }
    return Response.error();
  }));
});
