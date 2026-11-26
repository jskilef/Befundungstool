'use strict';
// Focusing a report section shows the accent bar but must not move or re-wrap the text: same text start,
// same inner width and same height before and after focus, text aligned with the heading, in every theme
// and at phone width.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ui = require('../helpers/ui.cjs');

const html = fs.readFileSync(path.join(__dirname, '../../dist/befundungstool.html'), 'utf8');
// Long enough to wrap; the last word sits right at a line end often enough that 12 px would re-wrap it.
const TEXT = 'Synthetischer Befund: '.concat('Kein Pleuraerguss, kein Pneumothorax, regelrechte Herzgröße. '.repeat(6)).trim();

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BT_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const page = await (await browser.newContext()).newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://befundungstool.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('https://befundungstool.test/');
    await page.selectOption('#template', 'combined');

    const measure = () => page.locator('#combined').evaluate(e => {
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      const label = document.querySelector('label[for=combined]').getBoundingClientRect();
      return { textLeft: r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth), right: r.right, innerWidth: e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), height: r.height, scrollHeight: e.scrollHeight, labelLeft: label.left, shadow: cs.boxShadow };
    });

    for (const [width, themes] of [[1200, ['light', 'dark', 'midnight', 'cobalt-light', 'cobalt-dark']], [390, ['light']]]) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of themes) {
        await ui.setSetting(page, '#theme', theme);
        await page.locator('#combined').fill(TEXT);
        await page.locator('#study').focus();
        const before = await measure();
        await page.locator('#combined').focus();
        const after = await measure();
        const where = `${theme} at ${width}px`;
        assert.notEqual(after.shadow, 'none', `${where}: focus shows the bar`);
        assert.equal(before.shadow, 'none', `${where}: no bar without focus`);
        for (const key of ['textLeft', 'right', 'innerWidth', 'height', 'scrollHeight']) assert.equal(after[key], before[key], `${where}: ${key} unchanged on focus`);
        assert(Math.abs(before.textLeft - before.labelLeft) < 1, `${where}: text aligned with the heading`);
      }
    }

    assert.deepEqual(errors, []);
    console.log('Fokus-Layout: Fokusleiste ohne Textverschiebung oder Umbruchänderung, Text bündig mit der Überschrift, alle Designs und Handybreite bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
