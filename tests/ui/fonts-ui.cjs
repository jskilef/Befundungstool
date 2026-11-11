'use strict';
// Embedded Roboto: loads and renders with all network access blocked (no font downloads).
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../dist/befundungstool.html'), 'utf8');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BT_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const external = [];
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('https://befundungstool.test/')) return route.fulfill({ contentType: 'text/html', body: html });
      external.push(url);
      return route.abort();
    });
    const page = await context.newPage();
    await page.goto('https://befundungstool.test/');
    const result = await page.evaluate(async () => {
      await Promise.all(['400 16px Roboto', '500 14px Roboto', '400 16px Roboto'].map((f, i) => document.fonts.load(f, ['Befund äöüß', 'Łódź', 'α-Blocker'][i])));
      await document.fonts.ready;
      const faces = [...document.fonts].filter(f => f.family.replace(/"/g, '') === 'Roboto');
      // Width differs from the system fallback only if Roboto is really used.
      const width = family => { const c = document.createElement('canvas').getContext('2d'); c.font = '16px ' + family; return c.measureText('Pleuraerguss rechts 12 mm').width; };
      return {
        faces: faces.length,
        loaded: faces.filter(f => f.status === 'loaded').length,
        check: document.fonts.check('500 14px Roboto', 'Befund äöüß'),
        body: getComputedStyle(document.body).fontFamily,
        differs: width('Roboto') !== width('monospace')
      };
    });
    assert.equal(result.faces, 3, 'latin, latin-ext and greek faces');
    assert(result.loaded >= 2, 'latin and the requested extra subsets load from embedded data');
    assert(result.check);
    assert.match(result.body, /^Roboto/);
    assert(result.differs);
    assert(!html.includes('fonts.gstatic.com') && !html.includes('fonts.googleapis.com'), 'no font URLs in the build');
    assert.deepEqual(external, [], 'no network requests');
    console.log('Schrift: eingebettetes Roboto (Latein, Latein erweitert, Griechisch) lädt ohne Netzwerk bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
