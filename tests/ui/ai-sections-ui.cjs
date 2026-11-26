'use strict';
// Per-section AI switch ("An KI" / "Nicht an KI"): switched-off sections never reach the provider, the status
// says how many were left out, editing them keeps a result current, switching marks it outdated, and the
// choice is remembered and saved in the configuration file. Mocked OpenAI endpoint; all other network blocked.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ui = require('../helpers/ui.cjs');
const { saveConfiguration } = require('../helpers/config-file.cjs');

const html = fs.readFileSync(path.join(__dirname, '../../dist/befundungstool.html'), 'utf8');
const completion = content => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BT_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [], external = [], apiCalls = [];
  let reply = () => completion({ issues: [], changes: [] });
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('https://befundungstool.test/')) return route.fulfill({ contentType: 'text/html', body: html });
      if (url === 'https://api.openai.com/v1/chat/completions') {
        apiCalls.push(route.request().postDataJSON());
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply()) });
      }
      external.push(url);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('https://befundungstool.test/');
    const status = () => page.locator('#aiStatus').textContent();
    const waitStatus = text => page.waitForFunction(t => document.querySelector('#aiStatus').textContent.startsWith(t), text);
    const sw = id => page.locator(`.ai-skip[data-field=${id}]`);
    const sentIds = call => JSON.parse(call.messages[1].content).sections.map(s => s.id);

    await ui.configureAi(page, { provider: 'openai', key: 'sk-synthetic-sections', model: 'synthetic-model' });
    await page.selectOption('#template', 'combined');
    await page.locator('#indication').fill('Synthetische Fragestellung mit Patientenangaben.');
    await page.locator('#technique').fill('Synthetische Technik.');
    await page.locator('#combined').fill('Kein Erguss.');

    // Every section is sent by default; the switch says so.
    assert.equal(await sw('indication').textContent(), 'An KI');
    assert.equal(await sw('indication').getAttribute('aria-checked'), 'true');
    assert.equal(await sw('indication').getAttribute('aria-label'), 'An KI-Prüfung senden');

    // Switch off "Fragestellung": it is not sent, and the status says so.
    await sw('indication').click();
    assert.equal(await sw('indication').textContent(), 'Nicht an KI');
    assert.equal(await sw('indication').getAttribute('aria-checked'), 'false');
    assert(await page.locator('#indication').evaluate(e => e.closest('.section').classList.contains('ai-excluded')));
    await page.locator('#aiReview').click();
    await waitStatus('Prüfung abgeschlossen');
    assert.equal(apiCalls.length, 1);
    assert.deepEqual(sentIds(apiCalls[0]), ['technique', 'combined']);
    assert(!JSON.stringify(apiCalls[0]).includes('Patientenangaben'), 'switched-off text never leaves the editor');
    assert(!JSON.stringify(apiCalls[0].response_format || {}).includes('indication'), 'the schema offers only sent sections');
    assert.match(await status(), / · 1 Abschnitt nicht gesendet$/);

    // Editing a switched-off section keeps the result current; switching a section changes it.
    const provenance = () => page.locator('#aiNotes .ai-provenance').textContent();
    assert.match(await provenance(), /^Erstellt /);
    await page.locator('#indication').fill('Andere synthetische Fragestellung.');
    assert.match(await provenance(), /^Erstellt /, 'the model never saw this section');
    await sw('indication').click();
    assert.match(await provenance(), /^Veraltet/);
    await sw('indication').click();
    assert.match(await provenance(), /^Erstellt /);

    // Revise: an answer that rewrites a section that was not sent is rejected as a whole.
    reply = () => completion({ sections: [{ id: 'technique', text: 'Andere Technik.' }, { id: 'combined', text: 'Kein Pleuraerguss.' }], issues: [], changes: [] });
    await sw('technique').click();
    await page.locator('#aiRevise').click();
    await waitStatus('Das Modell hat keine gültige strukturierte Antwort');
    assert.deepEqual(sentIds(apiCalls[1]), ['combined']);
    assert.equal(await page.locator('.ai-section').count(), 0, 'nothing proposed');
    reply = () => completion({ sections: [{ id: 'combined', text: 'Kein Pleuraerguss.' }], issues: [], changes: [] });
    await page.locator('#aiRevise').click();
    await waitStatus('Überarbeitung abgeschlossen');
    assert.match(await status(), /\(1 Vorschlag\) · 2 Abschnitte nicht gesendet$/);
    assert.equal(await page.locator('.ai-section[data-section=combined]').count(), 1);

    // Nothing left to send: no request at all.
    await sw('combined').click();
    await page.locator('#aiReview').click();
    assert.equal(await status(), 'Alle Abschnitte mit Text sind für die KI ausgeschaltet. Es wurde nichts gesendet.');
    assert.equal(apiCalls.length, 3);

    // Hidden with the AI feature; English labels.
    await ui.setSetting(page, '#featureAi', false);
    assert(await sw('indication').isHidden());
    await ui.setSetting(page, '#featureAi', true);
    assert(await sw('indication').isVisible());
    await ui.setSetting(page, '#language', 'en');
    assert.equal(await sw('indication').textContent(), 'Not to AI');
    assert.equal(await sw('findings').textContent(), 'To AI');
    await ui.setSetting(page, '#language', 'de');

    // Remembered after a reload (for every report) and saved in the configuration file.
    await page.reload();
    assert.equal(await sw('indication').getAttribute('aria-checked'), 'false');
    assert.equal(await sw('findings').getAttribute('aria-checked'), 'true');
    assert.deepEqual((await saveConfiguration(page)).data.settings.aiExcluded, ['combined', 'indication', 'technique']);

    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    console.log('KI-Abschnittsauswahl: ausgeschaltete Abschnitte nicht gesendet, Status, Aktualität, Überarbeitung, nichts zu senden, Sprache, Speicherung und Konfigurationsdatei bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
