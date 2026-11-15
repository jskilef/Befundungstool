'use strict';
// Static HTTPS hosting (like GitHub Pages): coi-sw.js makes the page cross-origin isolated for browser models.
// Audit A02: only with a browser model selected, and the automatic reload never discards typed text.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dist = path.join(__dirname, '../../dist');
const html = fs.readFileSync(path.join(dist, 'befundungstool.html'), 'utf8');
const sw = fs.readFileSync(path.join(dist, 'coi-sw.js'), 'utf8');
const GGUF = JSON.stringify({ provider: 'gguf', reportLanguage: 'Same as original', profiles: {} });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BT_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [];
  // gate: a promise the worker response waits for (simulates a slow first installation).
  async function open({ provider, gate } = {}) {
    const context = await browser.newContext();
    const workerRequests = [];
    if (provider) await context.addInitScript(value => { if (!localStorage.getItem('befundungstool-ai-v1')) localStorage.setItem('befundungstool-ai-v1', value); }, provider);
    await context.route('https://befundungstool.test/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/coi-sw.js')) {
        workerRequests.push(url.pathname);
        if (gate) await gate;
        return route.fulfill({ contentType: 'application/javascript', body: sw });
      }
      return route.fulfill({ contentType: 'text/html', body: html });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('https://befundungstool.test/app/befundungstool.html');
    return { context, page, workerRequests };
  }

  try {
    // No AI or an API provider: no service worker, no extra request.
    {
      const { context, page, workerRequests } = await open();
      await page.waitForTimeout(500);
      assert.deepEqual(workerRequests, [], 'no worker without a browser model');
      assert.equal(await page.evaluate(() => window.crossOriginIsolated), false);
      await context.close();
    }

    // Browser model selected, empty report: one automatic reload, then isolated.
    {
      const { context, page } = await open({ provider: GGUF });
      await page.waitForFunction(() => window.crossOriginIsolated === true, null, { timeout: 15000 });
      assert.equal(await page.evaluate(() => sessionStorage.getItem('befundungstool-coi-reload')), '1', 'exactly one reload');
      // The app still works normally after isolation.
      await page.locator('#findings').fill('.pleura');
      await page.locator('#findings').press('Tab');
      assert.equal(await page.inputValue('#findings'), 'Kein Pleuraerguss oder Pneumothorax.');
      // Later visits are isolated immediately, without another reload.
      await page.reload();
      assert(await page.evaluate(() => window.crossOriginIsolated));
      await context.close();
    }

    // Slow installation while the user types (draft saving off): no reload, text kept; isolated on the next load.
    {
      let release;
      const gate = new Promise(r => { release = r; });
      const { context, page, workerRequests } = await open({ provider: GGUF, gate });
      await page.locator('#findings').fill('SYNTHETISCHER UNGESPEICHERTER BEFUND');
      await page.waitForFunction(() => true);
      assert.equal(workerRequests.length, 1);
      release();
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
      await page.waitForTimeout(500);
      assert.equal(await page.inputValue('#findings'), 'SYNTHETISCHER UNGESPEICHERTER BEFUND', 'typed text survives');
      assert.equal(await page.evaluate(() => window.crossOriginIsolated), false);
      await page.reload();
      assert(await page.evaluate(() => window.crossOriginIsolated), 'isolated from the next load');
      await context.close();
    }

    // Choosing a browser model later registers the worker (no reload while the report has text).
    {
      const { context, page, workerRequests } = await open();
      await page.locator('#findings').fill('Synthetisch.');
      await page.locator('#openSettings').click();
      await page.locator('[data-sheet-tab=ai]').click();
      await page.selectOption('#aiProvider', 'gguf');
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 });
      assert.equal(workerRequests.length, 1);
      assert.equal(await page.inputValue('#findings'), 'Synthetisch.');
      await context.close();
    }

    assert.deepEqual(errors, []);
    console.log('Isolation: nur mit Browser-Modell, einmaliges Neuladen nur bei leerem Befund, getippter Text bleibt erhalten, App funktioniert bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
