'use strict';
// An imported configuration must not silently redirect report text: a new AI connection in a file is
// shown and only becomes active after explicit confirmation. Synthetic data only; network is mocked.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ui = require('../helpers/ui.cjs');
const { saveConfiguration } = require('../helpers/config-file.cjs');

const html = fs.readFileSync(path.join(__dirname, '../../dist/befundungstool.html'), 'utf8');
const OPENAI = 'https://api.openai.com/v1/chat/completions';
const OTHER = 'https://unknown-server.example.test/v1';
const completion = { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ issues: [], changes: [] }) } }] };

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BT_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [], calls = [];
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('https://befundungstool.test/')) return route.fulfill({ contentType: 'text/html', body: html });
      calls.push(url);
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'POST' } });
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(completion) });
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('https://befundungstool.test/');
    const toast = text => page.waitForFunction(t => document.querySelector('#toast').textContent === t, text);
    const load = data => page.locator('#macroFile').setInputFiles({ name: 'konfiguration.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });

    // The user's own connection: OpenAI.
    await ui.configureAi(page, { provider: 'openai', key: 'sk-synthetic-own', model: 'synthetic-own-model' });
    const own = (await saveConfiguration(page)).data;

    // A file pointing at another server, with an extra macro.
    const foreign = JSON.parse(JSON.stringify(own));
    foreign.ai = { provider: 'compatible', reportLanguage: 'German', profiles: { compatible: { endpoint: OTHER, model: 'synthetic-other-model', apiKey: 'sk-synthetic-other' } } };
    foreign.macros.push({ title: 'Importiert', code: 'imp', text: 'Synthetischer Import.', trigger: 'space', category: 'general', favorite: false });

    // Keep: the rest of the file applies, the connection does not.
    await load(foreign);
    await page.locator('#aiImportDialog').waitFor();
    assert.equal(await page.locator('#aiImportTitle').textContent(), 'Neue KI-Verbindung in dieser Datei');
    assert.deepEqual(await page.locator('#aiImportList dd').allTextContents(), ['OpenAI → Andere OpenAI-kompatible API', OTHER, 'synthetic-other-model']);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'aiImportKeep', 'the safe choice has focus');
    await page.locator('#aiImportKeep').click();
    await toast('Konfiguration geladen · KI-Verbindung unverändert');
    assert.equal(await page.locator('#aiChip').textContent(), 'KI: OpenAI · synthetic-own-model');
    await page.locator('#findings').fill('imp');
    await page.locator('#findings').press('Space');
    assert.equal(await page.inputValue('#findings'), 'Synthetischer Import. ', 'macros from the file still load');
    await page.locator('#aiReview').click();
    await page.waitForFunction(() => document.querySelector('#aiStatus').textContent.startsWith('Prüfung abgeschlossen'));
    assert(calls.length && calls.every(u => u === OPENAI), 'report text went only to the chosen server: ' + calls.join(', '));

    // Escape also keeps the current connection.
    await load(foreign);
    await page.locator('#aiImportDialog').waitFor();
    await page.keyboard.press('Escape');
    await toast('Konfiguration geladen · KI-Verbindung unverändert');
    assert.equal(await page.inputValue('#aiProvider'), 'openai');

    // An unchanged connection (here only another model and report language) applies without a question.
    const same = JSON.parse(JSON.stringify(own));
    same.ai.reportLanguage = 'English';
    same.ai.profiles.openai.model = 'synthetic-second-model';
    await load(same);
    await toast('Konfiguration geladen');
    assert(await page.locator('#aiImportDialog').evaluate(d => !d.open));
    assert.equal(await page.locator('#aiChip').textContent(), 'KI: OpenAI · synthetic-second-model');

    // Explicit confirmation activates the new connection.
    await load(foreign);
    await page.locator('#aiImportApply').click();
    await toast('Konfiguration geladen');
    assert.equal(await page.inputValue('#aiProvider'), 'compatible');
    assert.equal(await page.locator('#aiChip').textContent(), 'KI: API · synthetic-other-model');
    await ui.openSettings(page, 'ai');
    assert.equal(await page.inputValue('#aiEndpoint'), OTHER);
    await ui.closeSettings(page);

    assert.deepEqual(errors, []);
    console.log('KI-Import: neue Verbindung aus Datei erst nach Bestätigung, Behalten/Escape behalten die aktuelle, unveränderte Verbindung ohne Rückfrage bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
