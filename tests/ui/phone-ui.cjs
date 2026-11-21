'use strict';
// Phones (installable web app): no horizontal scrolling, Tab macros expand with Space on touch keyboards
// (no Tab key there), tapping a macro inserts it, and the standalone file still makes no network requests.
const { chromium, devices } = require('@playwright/test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ui = require('../helpers/ui.cjs');

const url = pathToFileURL(path.join(__dirname, '../../dist/befundungstool.html')).href;

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BT_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [], network = [];
  async function open(options) {
    const context = await browser.newContext(options);
    await context.route('**/*', route => (route.request().url().startsWith('file:') ? route.continue() : (network.push(route.request().url()), route.abort())));
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    return { context, page };
  }
  // Elements wider than the screen (the page itself must never scroll sideways).
  const overflow = page => page.evaluate(() => ({
    page: document.documentElement.scrollWidth - innerWidth,
    wide: [...document.querySelectorAll('body *')].filter(e => e.offsetParent !== null && e.getBoundingClientRect().right > innerWidth + 1).map(e => e.tagName + (e.id ? '#' + e.id : ''))
  }));

  try {
    for (const name of ['iPhone SE', 'iPhone 13', 'Pixel 7']) {
      const { context, page } = await open({ ...devices[name] });
      assert.equal(await page.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches), true, name + ' emulates a touch screen');
      assert.deepEqual(await overflow(page), { page: 0, wide: [] }, name + ': main view fits');
      await ui.openSettings(page, 'general');
      assert.deepEqual(await overflow(page), { page: 0, wide: [] }, name + ': settings fit');
      await ui.openSettings(page, 'ai');
      assert.deepEqual(await overflow(page), { page: 0, wide: [] }, name + ': AI settings fit');
      await ui.closeSettings(page);
      await context.close();
    }

    const { context, page } = await open({ ...devices['Pixel 7'] });
    // Android keyboards report keydown as "Unidentified": the text arrives through beforeinput/input only.
    await page.locator('#findings').tap();
    await page.keyboard.insertText('.pleura');
    await page.keyboard.insertText(' ');
    assert.equal(await page.inputValue('#findings'), 'Kein Pleuraerguss oder Pneumothorax. ', 'Space expands a Tab macro on a touch keyboard');
    await page.keyboard.insertText('Weiter .unbekannt ');
    assert.equal(await page.inputValue('#findings'), 'Kein Pleuraerguss oder Pneumothorax. Weiter .unbekannt ', 'unknown codes stay text');
    // The macro list names Space as the trigger on touch screens.
    assert.match(await page.locator('.macro code', { hasText: '.pleura' }).first().textContent(), /^\.pleura · Leertaste$/);
    // Tapping a macro inserts it into the active section; undo still works.
    await page.locator('#impression').tap();
    await page.locator('.macro', { hasText: '.heart' }).first().tap();
    assert.equal(await page.inputValue('#impression'), 'Die kardiomediastinale Silhouette ist regelrecht.');
    await context.close();

    // Mouse and keyboard: unchanged, ".code" + Space stays text and Tab expands.
    const desktop = await open({ viewport: { width: 1280, height: 900 } });
    assert.equal(await desktop.page.evaluate(() => matchMedia('(hover: none) and (pointer: coarse)').matches), false);
    await desktop.page.locator('#findings').click();
    await desktop.page.keyboard.insertText('.pleura');
    await desktop.page.keyboard.insertText(' ');
    assert.equal(await desktop.page.inputValue('#findings'), '.pleura ', 'no Space expansion of Tab macros with a physical keyboard');
    await desktop.page.locator('#findings').fill('.pleura');
    await desktop.page.locator('#findings').press('Tab');
    assert.equal(await desktop.page.inputValue('#findings'), 'Kein Pleuraerguss oder Pneumothorax.');
    assert.match(await desktop.page.locator('.macro code', { hasText: '.pleura' }).first().textContent(), /· Tab$/);
    await desktop.context.close();

    assert.deepEqual(network, [], 'no network requests');
    assert.deepEqual(errors, []);
    console.log('Telefon: Layout ohne Querscrollen, Leertaste für Tab-Bausteine, Tippen fügt ein, keine Netzwerkanfragen bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
