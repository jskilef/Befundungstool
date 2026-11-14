'use strict';
// Sidebar layout: side, width, sections, single-tab and empty states; persisted and in the configuration file.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ui = require('../helpers/ui.cjs');
const { saveConfiguration } = require('../helpers/config-file.cjs');

const html = fs.readFileSync(path.join(__dirname, '../../dist/befundungstool.html'), 'utf8');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BT_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://befundungstool.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('https://befundungstool.test/');
    const box = selector => page.locator(selector).boundingBox();
    const visible = selector => page.locator(selector).isVisible();

    // Defaults: right, normal width (320 px), both tabs.
    assert((await box('.side')).x > (await box('.workspace')).x);
    assert.equal(Math.round((await box('.side')).width), 320);
    assert(await visible('.side-tabs'));

    // Left and wide.
    await ui.openSettings(page, 'general');
    assert(await visible('#sidebarOptions'));
    await page.selectOption('#sidebarSide', 'left');
    await page.selectOption('#sidebarWidth', 'wide');
    await ui.closeSettings(page);
    assert((await box('.side')).x < (await box('.workspace')).x, 'sidebar on the left');
    assert.equal(Math.round((await box('.side')).width), 400);

    // Sections: without shortcuts; then AI notes only (single tab → no tab bar); then nothing → no sidebar.
    await ui.setSetting(page, '#sidebarShortcuts', false);
    assert(!await visible('#shortcutsPanel'));
    assert(await visible('#macroPanel'));
    await ui.setSetting(page, '#sidebarMacros', false);
    assert(!await visible('.side-tabs'), 'one section left: no tab bar');
    assert(await visible('#panelNotes'), 'remaining section shown');
    await ui.setSetting(page, '#sidebarNotes', false);
    assert(!await visible('.side'), 'no sections: no sidebar');
    assert.equal(await page.locator('main').evaluate(m => getComputedStyle(m).gridTemplateColumns.split(' ').length), 1);

    // Sidebar switched off hides its options; on again restores them.
    await ui.setSetting(page, '#sidebarMacros', true);
    await ui.setSetting(page, '#featureSidebar', false);
    await ui.openSettings(page, 'general');
    assert(!await visible('#sidebarOptions'));
    await page.locator('#featureSidebar').check();
    assert(await visible('#sidebarOptions'));
    await ui.closeSettings(page);

    // Persisted across reloads and saved in the configuration file.
    await page.reload();
    assert.equal(await page.inputValue('#sidebarSide'), 'left');
    assert.equal(await page.inputValue('#sidebarWidth'), 'wide');
    assert(!await page.locator('#sidebarShortcuts').isChecked());
    const saved = await saveConfiguration(page);
    assert.deepEqual(saved.data.settings.sidebar, { side: 'left', width: 'wide', macros: true, shortcuts: false, notes: false });

    // New macros default to word expansion.
    await page.locator('#add').click();
    assert.equal(await page.inputValue('#macroTrigger'), 'space');
    assert.equal(await page.inputValue('#macroCode'), '');
    await page.locator('#macroDialog button:has-text("Abbrechen")').first().click().catch(() => page.keyboard.press('Escape'));

    assert.deepEqual(errors, []);
    console.log('Seitenleiste: Position, Breite, Bereiche, Einzel-/Leerzustand, Speicherung, Konfigurationsdatei; Wortersetzung als Standard bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
