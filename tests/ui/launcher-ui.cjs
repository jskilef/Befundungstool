'use strict';
// The built app served by the local launcher sends AI requests through /api, never directly to the provider.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createServer } = require('../../server/local-server.cjs');

(async () => {
  const upstream = [];
  const server = createServer({
    root: path.join(__dirname, '../../dist'),
    upstreamFetch: async (url, init) => {
      upstream.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ issues: [{ category: 'Launcher', detail: 'via proxy' }], changes: [] }) } }] }), { status: 200 });
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BT_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [], direct = [];
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => (route.request().url().startsWith(base) ? route.continue() : (direct.push(route.request().url()), route.abort())));
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    assert.equal(await page.evaluate(() => typeof window.BefundungstoolLocal.token), 'string');
    assert.equal(await page.locator('link[rel=manifest]').getAttribute('href'), './manifest.webmanifest');
    assert.equal((await page.request.get(base + 'manifest.webmanifest')).status(), 200);

    await require('../helpers/ui.cjs').configureAi(page, { provider: 'openai', key: 'sk-synthetic-launcher', model: 'synthetic-model' });
    assert.equal(await page.locator('#aiDestination').textContent(), 'Befundziel: https://api.openai.com · über lokalen Starter');
    await page.locator('#findings').fill('Synthetischer Befund.');
    await page.locator('#aiReview').click();
    await page.waitForFunction(() => document.querySelector('#aiStatus').textContent.startsWith('Prüfung abgeschlossen'));
    assert.equal(upstream.length, 1);
    assert.equal(upstream[0].url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(upstream[0].headers.Authorization, 'Bearer sk-synthetic-launcher');
    assert.equal(await page.locator('#aiNotes .ai-issue').textContent(), 'Launchervia proxy');
    assert.deepEqual(direct, [], 'no direct provider requests from the browser');
    assert.deepEqual(errors, []);
    console.log('Starter UI: App über localhost, Manifest, KI-Anfrage über /api-Proxy bestanden.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
