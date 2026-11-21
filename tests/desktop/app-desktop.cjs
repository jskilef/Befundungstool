'use strict';
// Desktop app: the window serves the launcher (token, /api proxy, cross-origin isolation) and exposes WebGPU.
// The provider is a synthetic OpenAI-compatible stub on loopback, reached only through the app's /api proxy.
const assert = require('node:assert/strict');
const http = require('node:http');
const { launchDesktop } = require('../helpers/desktop.cjs');
const { configureAi } = require('../helpers/ui.cjs');

(async () => {
  const upstream = [];
  const stub = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      upstream.push({ method: req.method, url: req.url, authorization: req.headers.authorization, origin: req.headers.origin, body: JSON.parse(body || '{}') });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ issues: [{ category: 'Desktop', detail: 'via proxy' }], changes: [] }) } }] }));
    });
  });
  await new Promise(r => stub.listen(0, '127.0.0.1', r));
  const endpoint = `http://127.0.0.1:${stub.address().port}/v1/chat/completions`;

  const desktop = await launchDesktop({ args: ['--gpu-info'] });
  const { app, page, origin } = desktop;
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', request => requests.push(request.url()));
  try {
    assert.equal(page.url(), origin + '/', 'window loads the in-process launcher on the configured port');
    assert.match(await page.title(), /^Befundungstool/);
    const state = await page.evaluate(() => ({ isolated: window.crossOriginIsolated, token: window.BefundungstoolLocal?.token, gpu: 'gpu' in navigator, threads: navigator.hardwareConcurrency }));
    assert.equal(state.isolated, true, 'cross-origin isolated (multi-threaded WASM)');
    assert.match(state.token, /^[0-9a-f]{64}$/, 'session token injected');
    assert.equal(state.gpu, true, 'navigator.gpu exposed');

    // Secure renderer settings.
    const prefs = await app.evaluate(({ BrowserWindow, session }) => {
      const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return { contextIsolation: p.contextIsolation, sandbox: p.sandbox, nodeIntegration: p.nodeIntegration, webSecurity: p.webSecurity, spellcheck: session.defaultSession.isSpellCheckerEnabled(), preload: p.preload || null };
    });
    assert.deepEqual(prefs, { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false, preload: null });

    // --gpu-info: diagnostics as JSON on stdout (the dialog opens as well). A real adapter is not required:
    // CI machines may have none, so its result is only logged.
    for (let i = 0; i < 100 && !desktop.stdout().includes('GPU-INFO '); i++) await page.waitForTimeout(100);
    const line = desktop.stdout().split('\n').find(l => l.startsWith('GPU-INFO '));
    assert(line, 'GPU info printed');
    const info = JSON.parse(line.slice('GPU-INFO '.length));
    assert.equal(info.mode, 'webgpu');
    assert.deepEqual(info.switches, ['enable-unsafe-webgpu', 'ignore-gpu-blocklist', 'force_high_performance_gpu']);
    assert.equal(info.crossOriginIsolated, true);
    assert.equal(info.webgpu.available, true);
    assert.equal(typeof info.featureStatus.webgpu, 'string');
    assert.equal(info.versions.app, require('../../package.json').version);
    const adapter = info.webgpu.adapter;
    console.log(`WebGPU adapter: ${adapter ? [adapter.info.vendor, adapter.info.architecture, adapter.isFallbackAdapter ? 'fallback' : 'hardware'].join(' / ') : 'none (' + (info.webgpu.error || 'no adapter') + ')'}; feature status webgpu=${info.featureStatus.webgpu}; threads=${info.hardwareConcurrency}`);

    // The AI panel recognises the launcher and sends the request through /api (Chromium's net.fetch upstream).
    await configureAi(page, { provider: 'compatible', endpoint, key: 'sk-synthetic-desktop', model: 'synthetic-model' });
    await page.locator('#findings').fill('Synthetischer Befund für den Desktop-Test.');
    await page.locator('#aiReview').click();
    await page.waitForFunction(() => document.querySelector('#aiStatus').textContent.startsWith('Prüfung abgeschlossen'), null, { timeout: 30000 });
    assert.equal(upstream.length, 1);
    assert.equal(upstream[0].method, 'POST');
    assert.equal(upstream[0].url, '/v1/chat/completions');
    assert.equal(upstream[0].authorization, 'Bearer sk-synthetic-desktop');
    assert.equal(upstream[0].origin, undefined, 'upstream request comes from the proxy, not the page');
    assert.equal(upstream[0].body.model, 'synthetic-model');
    assert.equal(await page.locator('#aiNotes .ai-issue').textContent(), 'Desktopvia proxy');
    assert(requests.includes(origin + '/api'), 'renderer used /api (viaLocal)');
    assert.deepEqual(requests.filter(url => !url.startsWith(origin + '/') && !url.startsWith('data:') && !url.startsWith('blob:')), [], 'renderer only talks to the app origin');
    assert.deepEqual(errors, []);
    console.log('Desktop: Fenster, Token, Isolation, WebGPU-Diagnose und KI-Anfrage über /api bestanden.');
  } finally {
    await desktop.close();
    stub.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
