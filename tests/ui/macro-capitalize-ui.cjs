'use strict';
// "Großschreibung übernehmen" per macro: a shortcut typed with a capital first letter ("Li", ".Nor") inserts the
// text with a capital first letter; off by default; exact codes win; placeholders and leading quotes handled;
// saved, reloaded, exported and imported.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { saveConfiguration } = require('../helpers/config-file.cjs');

const html = fs.readFileSync(path.join(__dirname, '../../dist/befundungstool.html'), 'utf8');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BT_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [];
  try {
    const page = await (await browser.newContext()).newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://befundungstool.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('https://befundungstool.test/');
    const f = page.locator('#findings');
    const type = async (text, key = 'Space') => { await f.fill(text); await f.press(key); return f.inputValue(); };
    async function addMacro({ title, code, text, trigger = 'space', capitalize = false }) {
      await page.locator('#add').click();
      await page.selectOption('#macroTrigger', trigger);
      await page.locator('#macroTitle').fill(title);
      await page.locator('#macroCode').fill(code);
      await page.locator('#macroText').fill(text);
      await page.locator('#macroCapitalize').setChecked(capitalize);
      await page.locator('#macroForm button.primary').click();
    }

    // Off by default: the built-in "re" stays case-sensitive; the dialog explains the option in German.
    assert.equal(await type('Re'), 'Re ');
    await page.locator('#add').click();
    assert(!await page.locator('#macroCapitalize').isChecked());
    assert.equal((await page.locator('#macroCapitalize').locator('..').textContent()).trim(), 'Großschreibung übernehmen');
    await page.locator('#cancel').click();

    await addMacro({ title: 'Links', code: 'li', text: 'links', capitalize: true });
    await addMacro({ title: 'Normal', code: '.nor', text: 'kein Erguss.', trigger: 'tab', capitalize: true });
    await addMacro({ title: 'Seite', code: 'pl', text: '[[Seite]] Pleura', capitalize: true });
    await addMacro({ title: 'Zitat', code: 'zi', text: '„zitat“', capitalize: true });
    await addMacro({ title: 'Äquivalent', code: 'äq', text: 'äquivalent', capitalize: true });
    await addMacro({ title: 'Ohne', code: 'oh', text: 'ohne', capitalize: false });

    // Word expansion and Tab macros.
    assert.equal(await type('li'), 'links ');
    assert.equal(await type('Li'), 'Links ');
    assert.equal(await type('Befund: Li'), 'Befund: Links ');
    assert.equal(await type('LI'), 'LI ', 'only the first letter may differ');
    assert.equal(await type('lI'), 'lI ');
    assert.equal(await type('.nor', 'Tab'), 'kein Erguss.');
    assert.equal(await type('.Nor', 'Tab'), 'Kein Erguss.');
    assert.equal(await type('Äq'), 'Äquivalent ');
    assert.equal(await type('Zi'), '„Zitat“ ', 'leading quotes are skipped');
    assert.equal(await type('Pl'), '[[Seite]] Pleura ', 'a leading placeholder is left alone');
    assert.equal(await f.evaluate(e => e.value.slice(e.selectionStart, e.selectionEnd)), '[[Seite]]');
    assert.equal(await type('Oh'), 'Oh ', 'macros without the option stay case-sensitive');

    // An exact code wins over the capitalized form of another macro.
    await addMacro({ title: 'Lingula', code: 'Li', text: 'Lingula' });
    assert.equal(await type('Li'), 'Lingula ');
    assert.equal(await type('li'), 'links ');

    // The dialog shows the option; it survives a reload and is part of the configuration file.
    await page.reload();
    assert.equal(await type('.Nor', 'Tab'), 'Kein Erguss.');
    await page.locator('#search').fill('Links');
    await page.locator('#macros button.macro').first().click({ button: 'right' });
    assert.equal(await page.inputValue('#macroCode'), 'li');
    assert(await page.locator('#macroCapitalize').isChecked(), 'the dialog shows the option');
    await page.locator('#cancel').click();
    const data = (await saveConfiguration(page)).data;
    assert.equal(data.macros.find(m => m.code === 'li').capitalize, true);
    assert.equal(data.macros.find(m => m.code === 'oh').capitalize, undefined);

    // Imported macro files keep the option.
    await page.locator('#macroFile').setInputFiles({ name: 'macros.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ title: 'Rechtsseitig', code: 'rs', text: 'rechtsseitig', trigger: 'space', capitalize: true }])) });
    await page.waitForFunction(() => document.querySelector('#toast').textContent === 'Textbausteine geladen');
    assert.equal(await type('Rs'), 'Rechtsseitig ');

    assert.deepEqual(errors, []);
    console.log('Großschreibung übernehmen: Standard aus, Wort- und Tab-Kürzel, nur erster Buchstabe, Umlaute, Anführungszeichen, Platzhalter, exakte Kürzel zuerst, Speicherung, Konfigurationsdatei und Import bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
