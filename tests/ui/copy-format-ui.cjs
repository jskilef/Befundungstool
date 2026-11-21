'use strict';
// "Befund kopieren" / .txt export layout: section headings in capitals (default) or as the fields are
// named, and 0–3 blank lines between sections; remembered and part of the configuration file.
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
    const page = await (await browser.newContext()).newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.route('https://befundungstool.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    await page.goto('https://befundungstool.test/');
    const stubClipboard = () => page.evaluate(() => { window.copied = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => window.copied.push(text) } }); });
    await stubClipboard();
    const copy = async () => { await page.locator('#copy').click(); return page.evaluate(() => window.copied.at(-1)); };
    const exported = async () => { const download = page.waitForEvent('download'); await page.locator('#export').click(); return fs.readFileSync(await (await download).path(), 'utf8'); };

    // Without the study header, using a template with two fields named by the user.
    await ui.setSetting(page, '#featureMeta', false);
    await page.selectOption('#template', 'combined');
    const ids = ['indication', 'technique', 'comparison', 'combined'];
    const texts = ['Synthetische Fragestellung.', 'Synthetische Technik.', 'Keine Voruntersuchung.', 'Kein Erguss.'];
    for (const [i, id] of ids.entries()) await page.locator('#' + id).fill(texts[i]);
    const labels = await page.evaluate(list => list.map(id => document.querySelector(`label[for=${id}]`).textContent.trim()), ids);
    const layout = (heading, gap) => labels.map((l, i) => heading(l) + '\n' + texts[i]).join('\n'.repeat(gap + 1));

    // Default unchanged: capitals, one blank line.
    assert.equal(await copy(), layout(l => l.toUpperCase(), 1));
    await ui.openSettings(page, 'general');
    assert.equal(await page.inputValue('#headingStyle'), 'upper');
    assert.equal(await page.inputValue('#sectionSpacing'), '1');
    assert.equal(await page.locator('.copy-format legend').textContent(), 'Kopieren und Export');
    assert.equal(await page.locator('#headingStyle option[value=asNamed]').textContent(), 'Wie die Felder benannt sind');

    // As named, no blank line.
    await page.selectOption('#headingStyle', 'asNamed');
    await page.selectOption('#sectionSpacing', '0');
    await ui.closeSettings(page);
    assert.equal(await copy(), layout(l => l, 0));
    assert.notEqual(labels[3], labels[3].toUpperCase(), 'the label keeps its own spelling');

    // Three blank lines; the .txt export uses the same layout.
    await ui.openSettings(page, 'general');
    await page.selectOption('#sectionSpacing', '3');
    await ui.closeSettings(page);
    const expected = layout(l => l, 3);
    assert.equal(await copy(), expected);
    assert.equal(await exported(), expected);

    // Empty sections are left out (heading included); whitespace-only counts as empty.
    await page.locator('#technique').fill('');
    await page.locator('#comparison').fill('  \n ');
    assert.equal(await copy(), [0, 3].map(i => labels[i] + '\n' + texts[i]).join('\n\n\n\n'));
    assert(!(await exported()).includes(labels[1]), 'export too');

    // Custom template fields keep exactly the name the user gave them.
    await page.locator('#addTemplate').click();
    await page.locator('#templateName').fill('Eigene');
    await page.locator('.template-field-name').fill('Befund (MRT)');
    await page.locator('#templateForm button.primary').click();
    await page.locator('.section:visible textarea').first().fill('Synthetisch.');
    assert.equal(await copy(), 'Befund (MRT)\nSynthetisch.');

    // With the study header, the same spacing follows the header.
    await ui.setSetting(page, '#featureMeta', true);
    assert.match(await copy(), /\nDatum: [^\n]*\n\n\n\nBefund \(MRT\)\nSynthetisch\.$/);

    // Remembered after reload and saved in the configuration file.
    await page.reload();
    await stubClipboard();
    assert.equal(await page.inputValue('#headingStyle'), 'asNamed');
    assert.equal(await page.inputValue('#sectionSpacing'), '3');
    assert.deepEqual((await saveConfiguration(page)).data.settings.copyFormat, { headings: 'asNamed', blankLines: 3 });

    assert.deepEqual(errors, []);
    console.log('Kopierformat: Großbuchstaben als Standard, Überschriften wie benannt, 0–3 Leerzeilen, Export gleich, Speicherung und Konfigurationsdatei bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
