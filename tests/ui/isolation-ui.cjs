'use strict';
// Static HTTPS hosting (like GitHub Pages): coi-sw.js makes the page cross-origin isolated after one reload.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dist = path.join(__dirname, '../../dist');
const html = fs.readFileSync(path.join(dist, 'befundungstool.html'), 'utf8');
const sw = fs.readFileSync(path.join(dist, 'coi-sw.js'), 'utf8');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BT_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const context = await browser.newContext();
    await context.route('https://befundungstool.test/**', route => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/coi-sw.js')) return route.fulfill({ contentType: 'application/javascript', body: sw });
      return route.fulfill({ contentType: 'text/html', body: html });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('https://befundungstool.test/app/befundungstool.html');
    await page.waitForFunction(() => window.crossOriginIsolated === true, null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => sessionStorage.getItem('befundungstool-coi-reload')), '1', 'exactly one reload');
    // The app still works normally after isolation.
    await page.locator('#findings').fill('.pleura');
    await page.locator('#findings').press('Tab');
    assert.equal(await page.inputValue('#findings'), 'Kein Pleuraerguss oder Pneumothorax.');
    // Later visits are isolated immediately, without another reload.
    await page.reload();
    assert(await page.evaluate(() => window.crossOriginIsolated));
    assert.deepEqual(errors, []);
    console.log('Isolation: Service Worker setzt COOP/COEP bei statischem HTTPS-Hosting, einmaliges Neuladen, App funktioniert bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
