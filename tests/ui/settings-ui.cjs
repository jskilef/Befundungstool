'use strict';
// Browser flow: radnote storage migration, Report Studio (encrypted) import, AI style notes, key-safe export.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Crypto = require('../../src/settings/crypto.js');
const { reportStudioEncrypt } = require('../helpers/report-studio.cjs');
const { saveConfiguration } = require('../helpers/config-file.cjs');

const PASSWORD = 'synthetic-password-1';
const html = fs.readFileSync(path.join(__dirname, '../../dist/befundungstool.html'), 'utf8');
const reportStudio = {
  version: 1, endpoint: 'https://api.openai.com/v1/chat/completions', apiKey: 'sk-synthetic-ui', model: 'synthetic-model',
  language: 'German', uiLanguage: 'de', provider: 'openai',
  templates: [{ name: 'General radiology', body: 'Clinical indication:\n\nFindings:\nNo acute findings.\n\nImpression:\n', instructions: 'Use concise radiology prose.' }]
};

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BT_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const context = await browser.newContext();
    // Seed radnote data once, before the first page load only.
    await context.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('radnote-macros-v1', JSON.stringify([{ title: 'Altbestand', code: '.alt', text: 'Aus radnote übernommen.', trigger: 'tab', category: 'general', favorite: false }]));
      localStorage.setItem('radnote-word-macro-intro-v1', '1');
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://befundungstool.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('https://befundungstool.test/');
    const toast = text => page.waitForFunction(t => document.querySelector('#toast').textContent === t, text);
    const upload = (name, data) => page.locator('#macroFile').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });

    // Migration: radnote macro available, radnote key untouched.
    await page.locator('#findings').fill('.alt');
    await page.locator('#findings').press('Tab');
    assert.equal(await page.inputValue('#findings'), 'Aus radnote übernommen.');
    assert(await page.evaluate(() => localStorage.getItem('radnote-macros-v1').includes('Altbestand')));
    assert.equal(await page.evaluate(() => localStorage.getItem('befundungstool-migrated-v1')), 'radnote');

    // Encrypted Report Studio file: cancel, wrong password, then success.
    const sealed = await reportStudioEncrypt(reportStudio, PASSWORD);
    await upload('report-studio-settings.encrypted.json', sealed);
    await page.locator('#passwordDialog').waitFor();
    assert.equal(await page.locator('#passwordTitle').textContent(), 'Einstellungen entsperren');
    assert(await page.locator('#confirmPasswordRow').isHidden());
    await page.locator('#passwordCancel').click();
    await toast('Laden abgebrochen');

    await upload('report-studio-settings.encrypted.json', sealed);
    await page.locator('#settingsPassword').fill('wrong-password-123');
    await page.locator('#passwordSubmit').click();
    await toast('Falsches Passwort oder beschädigte Einstellungsdatei');
    assert.equal(await page.locator('#template option[data-custom]').count(), 0, 'failed import must not change templates');

    await upload('report-studio-settings.encrypted.json', sealed);
    await page.locator('#settingsPassword').fill(PASSWORD);
    await page.locator('#passwordSubmit').click();
    await toast('Report-Studio-Einstellungen importiert');
    assert.equal(await page.inputValue('#findings'), 'Aus radnote übernommen.', 'import must keep report text');
    const option = page.locator('#template option[data-custom]');
    assert.equal(await option.textContent(), 'General radiology');
    await page.selectOption('#template', await option.getAttribute('value'));
    const labels = await page.locator('[data-custom-field]:visible label').allTextContents();
    assert.deepEqual(labels.map(l => l.trim()), ['Clinical indication', 'Findings', 'Impression']);
    assert.equal(await page.locator('[data-custom-field]:visible textarea').nth(1).inputValue(), 'No acute findings.');

    // AI style notes round-trip through the template dialog.
    await page.locator('#editTemplate').click();
    assert.equal(await page.inputValue('#templateAiInstructions'), 'Use concise radiology prose.');
    await page.locator('#templateAiInstructions').fill('Kurze deutsche Sätze.');
    await page.locator('#templateForm button.primary').click();

    // Keys never touch browser storage. Every save is encrypted and contains everything, keys included.
    assert(!await page.evaluate(() => JSON.stringify(Object.entries(localStorage)).includes('sk-synthetic-ui')));
    await page.locator('#patient').fill('Synthetischer Patient 42');
    const download = page.waitForEvent('download');
    await page.locator('#saveMacros').click();
    await page.locator('#passwordDialog').waitFor();
    assert.equal(await page.locator('#passwordTitle').textContent(), 'Einstellungen verschlüsseln');
    await page.locator('#settingsPassword').fill('short');
    await page.locator('#settingsPasswordConfirm').fill('short');
    await page.locator('#passwordSubmit').click();
    assert.equal(await page.locator('#passwordError').textContent(), 'Passwort mit mindestens 12 Zeichen verwenden.');
    await page.locator('#settingsPassword').fill(PASSWORD);
    await page.locator('#settingsPasswordConfirm').fill(PASSWORD + 'x');
    await page.locator('#passwordSubmit').click();
    assert.equal(await page.locator('#passwordError').textContent(), 'Die Passwörter stimmen nicht überein.');
    await page.locator('#settingsPasswordConfirm').fill(PASSWORD);
    await page.locator('#passwordSubmit').click();
    const file = await download;
    const encrypted = { name: file.suggestedFilename(), data: JSON.parse(fs.readFileSync(await file.path(), 'utf8')) };
    assert.equal(encrypted.name, 'befundungstool-einstellungen.encrypted.json');
    assert.equal(encrypted.data.format, 'befundungstool-encrypted-settings');
    assert(!JSON.stringify(encrypted.data).includes('sk-synthetic-ui'));
    assert(!JSON.stringify(encrypted.data).includes('Kurze deutsche'));
    const opened = await Crypto.decrypt(encrypted.data, PASSWORD);
    assert.equal(opened.ai.profiles.openai.apiKey, 'sk-synthetic-ui');
    assert.equal(opened.templates[0].aiInstructions, 'Kurze deutsche Sätze.');
    assert.equal(opened.ai.profiles.openai.model, 'synthetic-model');
    assert(!JSON.stringify(opened).includes('Synthetischer Patient 42'), 'report data is never part of the settings file');

    // Cancelling the password dialog saves nothing.
    await page.locator('#saveMacros').click();
    await page.locator('#passwordCancel').click();
    await toast('Speichern abgebrochen');

    // A fresh browser restores everything from the encrypted file.
    const fresh = await (await browser.newContext()).newPage();
    fresh.on('pageerror', e => errors.push(e.message));
    await fresh.route('https://befundungstool.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await fresh.goto('https://befundungstool.test/');
    await fresh.locator('#macroFile').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(encrypted.data)) });
    await fresh.locator('#settingsPassword').fill(PASSWORD);
    await fresh.locator('#passwordSubmit').click();
    await fresh.waitForFunction(() => document.querySelector('#toast').textContent === 'Konfiguration geladen');
    assert.equal(await fresh.locator('#template option[data-custom]').textContent(), 'General radiology');
    await fresh.locator('#aiPanel > summary').click();
    await fresh.locator('#aiConnection > summary').click();
    assert.equal(await fresh.inputValue('#aiKey'), 'sk-synthetic-ui', 'key restored into memory from the encrypted file');

    // Six themes (D6): colour family for modules, palette for the theme; persisted and exported.
    await page.selectOption('#theme', 'cobalt-dark');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
    assert.equal(await page.locator('html').getAttribute('data-palette'), 'cobalt-dark');
    await page.selectOption('#theme', 'cobalt-light');
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
    assert.equal((await saveConfiguration(page, PASSWORD)).data.settings.theme, 'cobalt-light');
    await page.reload();
    assert.equal(await page.inputValue('#theme'), 'cobalt-light');
    assert.equal(await page.locator('html').getAttribute('data-palette'), 'cobalt-light');

    assert.deepEqual(errors, []);
    console.log('Einstellungen UI: radnote-Migration, verschlüsselter Report-Studio-Import, KI-Stilhinweise, immer verschlüsselter Export mit Schlüsseln, Themes bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
