/* Cross-origin isolation for static hosting (GitHub Pages cannot send headers).
   Adds COOP/COEP to the app's own page responses so browser models (llama.cpp, ONNX) can use
   multiple CPU threads. No caching and no other requests are touched. COEP "credentialless"
   keeps the CORS requests the app makes (runtime CDN, AI APIs) working. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.mode !== 'navigate' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).then(response => {
    if (response.type === 'opaqueredirect' || response.status === 0) return response;
    const headers = new Headers(response.headers);
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }));
});
