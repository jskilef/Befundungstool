'use strict';
// Local launcher: loopback host check, session token, origin check, header allow-list, error suppression.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../../server/local-server.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-launcher-'));
fs.writeFileSync(path.join(root, 'befundungstool.html'), '<!doctype html><head><script>\nconsole.log(1)\n</script>');
fs.writeFileSync(path.join(root, 'manifest.webmanifest'), '{}');

(async () => {
  const upstream = [];
  let upstreamReply = () => new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 });
  const server = createServer({ root, upstreamFetch: async (url, init) => { upstream.push({ url, init }); return upstreamReply(); } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const pageResponse = await fetch(base + '/');
    assert.equal(pageResponse.headers.get('cross-origin-opener-policy'), 'same-origin', 'isolation for multi-threaded browser models');
    assert.equal(pageResponse.headers.get('cross-origin-embedder-policy'), 'credentialless');
    const page = await pageResponse.text();
    const token = page.match(/token:"([0-9a-f]{64})"/)[1];
    assert(page.indexOf('BefundungstoolLocal') < page.indexOf('console.log(1)'), 'token script precedes app scripts');
    assert.equal((await fetch(base + '/manifest.webmanifest')).headers.get('content-type'), 'application/manifest+json');
    assert.equal((await fetch(base + '/icons/icon-192.png')).status, 404);
    assert.equal((await fetch(base + '/../secret')).status, 404);

    const api = (body, headers = {}) => fetch(base + '/api', {
      method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', Origin: base, 'x-local-token': token, ...headers }
    });
    const request = { url: 'https://api.openai.com/v1/chat/completions', headers: { Authorization: 'Bearer sk-synthetic', Cookie: 'x=1', 'X-Other': 'y' }, body: { model: 'm' } };

    const ok = await api(request);
    assert.equal(ok.status, 200);
    assert.deepEqual(upstream[0].init.headers, { 'Content-Type': 'application/json', Authorization: 'Bearer sk-synthetic' }, 'only auth headers forwarded');
    assert.equal(upstream[0].init.redirect, 'error');

    assert.equal((await api(request, { 'x-local-token': '0'.repeat(64) })).status, 403);
    assert.equal((await api(request, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await api(request, { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await api({ ...request, url: 'http://example.test/v1' })).status, 400);
    assert.equal((await api({ ...request, url: 'https://example.test/v1?key=1' })).status, 400);
    assert.equal((await api({ ...request, headers: { Authorization: 'Bearer a\r\nX: b' } })).status, 400);
    assert.equal((await api('{not json')).status, 400);
    assert.equal((await api({ ...request, body: { pad: 'x'.repeat(2.1e6) } })).status, 413);

    // Upstream failures: status and known code only, never the message.
    upstreamReply = () => new Response(JSON.stringify({ error: { code: 'invalid_api_key', message: 'Synthetic leaked key sk-123' } }), { status: 401 });
    const denied = await api(request);
    assert.equal(denied.status, 401);
    assert.deepEqual(await denied.json(), { error: 'Provider rejected request', code: 'invalid_api_key' });
    upstreamReply = () => new Response('{}', { status: 503, headers: { 'Retry-After': '7' } });
    assert.equal((await api(request)).headers.get('retry-after'), '7');
    upstreamReply = () => { throw new Error('ECONNREFUSED'); };
    assert.equal((await api(request)).status, 502);

    // Requests with a foreign Host header are refused (DNS rebinding).
    const rebinding = await new Promise(resolve => {
      require('node:http').get({ host: '127.0.0.1', port: server.address().port, path: '/', headers: { Host: 'evil.example' } }, resolve);
    });
    assert.equal(rebinding.statusCode, 403);
    console.log('Lokaler Starter: Host- und Herkunftsprüfung, Sitzungstoken, Header-Filter, Größenlimit, Fehlerunterdrückung bestanden.');
  } finally {
    server.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
