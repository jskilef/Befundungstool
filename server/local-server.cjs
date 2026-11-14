'use strict';
// Optional loopback-only launcher (adapted from Report Studio v1.6.0). No dependencies; Node.js 18+.
// Serves the app on 127.0.0.1 and forwards AI API requests (avoids provider CORS). It never logs or
// stores reports or keys, accepts requests only from its own origin with a per-run session token,
// and relays only recognised error codes (upstream messages may echo keys or report text).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, timingSafeEqual } = require('node:crypto');

const KNOWN_CODES = ['tier_not_allowed', 'rate_limit_exceeded', 'quota_exceeded', 'insufficient_quota', 'model_not_allowed', 'invalid_api_key', 'permission_denied', '1300'];
const MAX_BODY_BYTES = 2e6;
const UPSTREAM_TIMEOUT_MS = 180000;

// Release folder: app next to this file. Repository: app in ../dist.
function defaultRoot() {
  return fs.existsSync(path.join(__dirname, 'befundungstool.html')) ? __dirname : path.join(__dirname, '..', 'dist');
}

function createServer({ upstreamFetch = fetch, root = defaultRoot() } = {}) {
  const token = randomBytes(32).toString('hex');
  const assets = {
    '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
    '/icons/icon-192.png': ['icons/icon-192.png', 'image/png'],
    '/icons/icon-512.png': ['icons/icon-512.png', 'image/png']
  };

  const server = http.createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const reply = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };

    // Blocks DNS-rebinding: only the exact loopback host is served.
    if (req.headers.host !== new URL(origin).host) return reply(403, { error: 'Invalid host' });

    if (req.method === 'GET' && ['/', '/index.html', '/befundungstool.html'].includes(req.url)) {
      const html = fs.readFileSync(path.join(root, 'befundungstool.html'), 'utf8');
      const session = `<script>window.BefundungstoolLocal=Object.freeze({token:${JSON.stringify(token)}});</script>\n<script>`;
      res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
      return res.end(html.replace('<script>', () => session));
    }
    if (req.method === 'GET' && Object.hasOwn(assets, req.url)) {
      const [file, type] = assets[req.url];
      const full = path.join(root, file);
      if (!fs.existsSync(full)) return reply(404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': type });
      return res.end(fs.readFileSync(full));
    }
    if (req.method !== 'POST' || req.url !== '/api') return reply(404, { error: 'Not found' });

    const incoming = req.headers['x-local-token'];
    if (req.headers.origin !== origin || typeof incoming !== 'string' || Buffer.byteLength(incoming) !== Buffer.byteLength(token) ||
        !timingSafeEqual(Buffer.from(incoming), Buffer.from(token))) return reply(403, { error: 'Invalid origin or session' });
    if (!req.headers['content-type']?.startsWith('application/json')) return reply(415, { error: 'JSON required' });

    let size = 0;
    const chunks = [];
    try {
      // Oversized bodies are drained (sender is already authenticated) so the client gets a clean 413, not a reset.
      for await (const chunk of req) {
        size += chunk.length;
        if (size <= MAX_BODY_BYTES) chunks.push(chunk);
      }
      if (size > MAX_BODY_BYTES) return reply(413, { error: 'Request too large' });
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const url = new URL(input.url);
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback))) return reply(400, { error: 'Invalid endpoint' });
      // Model lists (GET .../models) are the only other upstream request the app makes.
      const method = input.method === 'GET' && /\/models$/.test(url.pathname) ? 'GET' : 'POST';
      if ((method === 'POST' && (!input.body || typeof input.body !== 'object')) || !input.headers || typeof input.headers !== 'object') return reply(400, { error: 'Invalid request' });
      // Only the authentication headers the app sets are forwarded.
      const headers = { 'Content-Type': 'application/json' };
      for (const name of ['Authorization', 'x-goog-api-key']) {
        if (input.headers[name] === undefined) continue;
        if (typeof input.headers[name] !== 'string' || /[\r\n]/.test(input.headers[name])) return reply(400, { error: 'Invalid headers' });
        headers[name] = input.headers[name];
      }
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), UPSTREAM_TIMEOUT_MS);
      res.on('close', () => { if (!res.writableEnded) abort.abort(); });
      try {
        const upstream = await upstreamFetch(url.href, method === 'GET' ? { method, redirect: 'error', headers, signal: abort.signal } : { method, redirect: 'error', headers, body: JSON.stringify(input.body), signal: abort.signal });
        if (!upstream.ok) {
          const retryAfter = upstream.headers?.get('Retry-After');
          if (retryAfter && /^\d{1,6}$/.test(retryAfter)) res.setHeader('Retry-After', retryAfter);
          const failure = await upstream.json().catch(() => null);
          const candidate = failure?.code ?? failure?.error?.code;
          return reply(upstream.status, { error: 'Provider rejected request', ...(KNOWN_CODES.includes(candidate) ? { code: candidate } : {}) });
        }
        reply(200, await upstream.json());
      } catch {
        reply(502, { error: 'Unable to reach provider' });
      } finally {
        clearTimeout(timer);
      }
    } catch {
      if (!res.headersSent) reply(400, { error: 'Invalid JSON request' });
    }
  });
  return server;
}

if (require.main === module) {
  const port = Number(process.env.BEFUNDUNGSTOOL_PORT || 8788);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('BEFUNDUNGSTOOL_PORT must be between 1 and 65535.');
  const root = defaultRoot();
  if (!fs.existsSync(path.join(root, 'befundungstool.html'))) {
    console.error('befundungstool.html not found. Run "npm run build" first.');
    process.exit(1);
  }
  const server = createServer({ root });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? 'Port is in use. Stop the other launcher or set BEFUNDUNGSTOOL_PORT to another port.' : 'Befundungstool could not start.');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`Befundungstool: http://127.0.0.1:${server.address().port}\nOpen this URL in your browser. Keep this terminal running. Ctrl+C stops the launcher.`));
}

module.exports = { createServer };
