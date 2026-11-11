'use strict';
// Browser flow: radnote storage migration, Report Studio (encrypted) import, AI style notes, key-safe export.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Crypto = require('../../src/settings/crypto.js');
const { reportStudioEncrypt } = require('../helpers/report-studio.cjs');

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
    assert(await page.locator('#includeKeysRow').isHidden());

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

    // Keys: never in browser storage; plain export strips them; encrypted export keeps them.
    assert(!await page.evaluate(() => JSON.stringify(Object.entries(localStorage)).includes('sk-synthetic-ui')));
    assert(await page.locator('#includeKeysRow').isVisible());
    const save = async () => {
      const download = page.waitForEvent('download');
      await page.locator('#saveMacros').click();
      const file = await download;
      return { name: file.suggestedFilename(), data: JSON.parse(fs.readFileSync(await file.path(), 'utf8')) };
    };
    const plain = await save();
    assert.equal(plain.name, 'befundungstool-einstellungen.json');
    assert(!JSON.stringify(plain.data).includes('sk-synthetic-ui'));
    assert.equal(plain.data.templates[0].aiInstructions, 'Kurze deutsche Sätze.');
    assert.equal(plain.data.ai.profiles.openai.model, 'synthetic-model');

    await page.locator('#includeKeys').check();
    const pending = save();
    await page.locator('#passwordDialog').waitFor();
    await page.locator('#settingsPassword').fill(PASSWORD);
    await page.locator('#settingsPasswordConfirm').fill(PASSWORD + 'x');
    await page.locator('#passwordSubmit').click();
    assert.equal(await page.locator('#passwordError').textContent(), 'Die Passwörter stimmen nicht überein.');
    await page.locator('#settingsPasswordConfirm').fill(PASSWORD);
    await page.locator('#passwordSubmit').click();
    const encrypted = await pending;
    assert.equal(encrypted.name, 'befundungstool-einstellungen.encrypted.json');
    assert(!JSON.stringify(encrypted.data).includes('sk-synthetic-ui'));
    const opened = await Crypto.decrypt(encrypted.data, PASSWORD);
    assert.equal(opened.ai.profiles.openai.apiKey, 'sk-synthetic-ui');

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
    assert(await fresh.locator('#includeKeysRow').isVisible());

    assert.deepEqual(errors, []);
    console.log('Einstellungen UI: radnote-Migration, verschlüsselter Report-Studio-Import, KI-Stilhinweise, Export ohne/mit Schlüssel bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
