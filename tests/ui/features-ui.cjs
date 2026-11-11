'use strict';
// Optional tools can be switched off in Settings → General; hidden tools keep their data; choices persist and travel in the configuration file.
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://befundungstool.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('https://befundungstool.test/');
    const visible = selector => page.locator(selector).first().isVisible();
    const exported = async () => {
      const download = page.waitForEvent('download');
      await page.locator('#export').click();
      return fs.readFileSync(await (await download).path(), 'utf8');
    };

    // Everything is on by default.
    for (const selector of ['#builder', '#study', '.dictation-action', '#aiSetup', '.side']) assert(await visible(selector), selector + ' visible by default');
    await page.locator('#findings').fill('Synthetischer Befund.');
    await page.locator('#patient').fill('Synthetische Referenz');
    assert.match(await exported(), /^RADIOLOGISCHER BEFUND\n\nUntersuchung: /);

    // Start dictation, choose a builder, then switch everything off.
    await page.selectOption('#builder', 'chest');
    await page.locator('[data-dictation-for=findings]').click();
    assert.equal(await page.locator('#findings').getAttribute('data-dictation'), 'active');
    await ui.openSettings(page, 'general');
    assert.equal(await page.locator('.feature-switches legend').textContent(), 'Funktionen');
    for (const id of ['#featureBuilders', '#featureDictation', '#featureMeta', '#featureAi', '#featureSidebar']) {
      assert(await page.locator(id).isChecked());
      await page.locator(id).uncheck();
    }
    await ui.closeSettings(page);
    assert.equal(await page.locator('html').getAttribute('data-off'), 'builders dictation meta ai sidebar');
    for (const selector of ['.builder-control', '#chestHost', '.meta', '.dictation-action', '#aiSetup', '#aiChip', '#tabNotes', '.side']) {
      assert(!await visible(selector), selector + ' hidden');
    }
    assert.equal(await page.locator('#findings').getAttribute('data-dictation'), null, 'switching dictation off ends an active session');
    // Report-only layout: one column, still usable.
    assert(await visible('#findings'));
    assert(await visible('#template'));
    const mainColumns = await page.locator('main').evaluate(m => getComputedStyle(m).gridTemplateColumns.split(' ').length);
    assert.equal(mainColumns, 1);
    // Macros still expand without the sidebar.
    await page.locator('#impression').fill('.pleura');
    await page.locator('#impression').press('Tab');
    assert.equal(await page.inputValue('#impression'), 'Kein Pleuraerguss oder Pneumothorax.');
    // Copy/export without the study/patient/date header.
    const plain = await exported();
    assert.match(plain, /^KLINISCHE ANGABEN\n/);
    assert(!plain.includes('Synthetische Referenz') && !plain.includes('RADIOLOGISCHER BEFUND'));

    // Hidden tools keep their data; settings persist across reloads.
    await page.reload();
    assert.equal(await page.locator('html').getAttribute('data-off'), 'builders dictation meta ai sidebar');
    assert(!await page.locator('#featureAi').isChecked());
    await ui.setSetting(page, '#featureBuilders', true);
    assert(await visible('#builder'));
    assert.equal(await page.inputValue('#builder'), 'chest', 'builder choice kept while hidden');

    // The configuration file carries the choices; a fresh browser restores them.
    const saved = await saveConfiguration(page);
    assert.deepEqual(saved.data.settings.features, { builders: true, dictation: false, meta: false, ai: false, sidebar: false });
    const fresh = await (await browser.newContext()).newPage();
    fresh.on('pageerror', e => errors.push(e.message));
    await fresh.route('https://befundungstool.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await fresh.goto('https://befundungstool.test/');
    await fresh.locator('#macroFile').setInputFiles({ name: 'c.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved.envelope)) });
    await fresh.locator('#settingsPassword').fill('synthetic-password-1');
    await fresh.locator('#passwordSubmit').click();
    await fresh.waitForFunction(() => document.querySelector('#toast').textContent === 'Konfiguration geladen');
    assert.equal(await fresh.locator('html').getAttribute('data-off'), 'dictation meta ai sidebar');

    // English labels.
    await ui.setSetting(page, '#language', 'en');
    await ui.openSettings(page, 'general');
    assert.equal(await page.locator('label:has(#featureMeta) span').textContent(), 'Study, patient and date');
    await ui.closeSettings(page);

    assert.deepEqual(errors, []);
    console.log('Funktionen: Ausblenden von Baukästen, Diktieren, Kopfdaten, KI und Seitenleiste; Export ohne Kopf; Daten bleiben; Speicherung und Konfigurationsdatei bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
