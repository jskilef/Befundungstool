'use strict';
// Which sections go to AI Review/Revise is part of each template's configuration ("An KI-Prüfung senden" per
// field in the template dialog; built-in templates allow only these AI settings). Switched-off sections never
// reach the provider and show a read-only "Nicht an KI" hint; the status says how many were left out; editing
// them keeps a result current, changing the setting marks it outdated; the setting is remembered and saved in
// the configuration file; the earlier global setting (settings.aiExcluded) is migrated.
// Mocked OpenAI endpoint; all other network blocked.
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
    const hint = id => page.locator(`.ai-off-hint[data-field=${id}]`);
    const payload = call => JSON.parse(call.messages[1].content);
    const sentIds = call => payload(call).sections.map(s => s.id);
    const row = id => page.locator(`.template-row[data-field-id="${id}"]`);
    // Opens the dialog of the current template, sets "An KI-Prüfung senden" per field id, saves.
    async function setTemplateAi(changes, style) {
      await page.locator('#editTemplate').click();
      for (const [id, send] of Object.entries(changes)) await row(id).locator('.template-field-ai').setChecked(send);
      if (style !== undefined) await page.locator('#templateAiInstructions').fill(style);
      await page.locator('#templateForm button.primary').click();
    }

    await ui.configureAi(page, { provider: 'openai', key: 'sk-synthetic-sections', model: 'synthetic-model' });
    await page.selectOption('#template', 'combined');
    await page.locator('#indication').fill('Synthetische Fragestellung mit Patientenangaben.');
    await page.locator('#technique').fill('Synthetische Technik.');
    await page.locator('#combined').fill('Kein Erguss.');

    // Built-in template: only the AI part is editable; every field is sent by default; no hint.
    assert(await page.locator('#editTemplate').isVisible(), 'built-in templates offer their AI settings');
    assert.equal(await hint('indication').count(), 1);
    assert(await hint('indication').isHidden());
    await page.locator('#editTemplate').click();
    assert(await page.locator('#templateName').isDisabled());
    assert.equal(await page.inputValue('#templateName'), 'Befund und Beurteilung');
    assert.deepEqual(await page.locator('.template-row').evaluateAll(rows => rows.map(r => r.dataset.fieldId)), ['indication', 'technique', 'comparison', 'combined']);
    assert(await row('indication').locator('.template-field-name').isDisabled());
    assert.equal(await page.locator('.template-row .template-field-default').count(), 0, 'no default text for built-ins');
    assert.equal(await page.locator('.template-row .row-actions').count(), 0, 'no reordering or removing');
    assert(await page.locator('#addTemplateField').isHidden());
    assert(await page.locator('#deleteTemplate').isHidden());
    assert(await page.locator('.builtin-template-hint').isVisible());
    assert.equal(await row('indication').locator('.template-ai').textContent(), ' An KI-Prüfung senden');
    assert(await row('indication').locator('.template-field-ai').isChecked());
    await page.locator('#cancelTemplate').click();

    // Switch off "Klinische Angaben" with style notes: not sent; the status and the heading say so.
    await setTemplateAi({ indication: false }, 'Synthetischer Stilhinweis.');
    assert(await hint('indication').isVisible());
    assert.equal(await hint('indication').textContent(), 'Nicht an KI');
    assert(await hint('technique').isHidden());
    await page.locator('#aiReview').click();
    await waitStatus('Prüfung abgeschlossen');
    assert.equal(apiCalls.length, 1);
    assert.deepEqual(sentIds(apiCalls[0]), ['technique', 'combined']);
    assert.equal(payload(apiCalls[0]).template.style, 'Synthetischer Stilhinweis.', 'built-in style notes are used');
    assert(!JSON.stringify(apiCalls[0]).includes('Patientenangaben'), 'switched-off text never leaves the editor');
    assert(!JSON.stringify(apiCalls[0].response_format || {}).includes('indication'), 'the schema offers only sent sections');
    assert.match(await status(), / · 1 Abschnitt nicht gesendet$/);

    // Editing a switched-off section keeps the result current; changing the template setting does not.
    const provenance = () => page.locator('#aiNotes .ai-provenance').textContent();
    assert.match(await provenance(), /^Erstellt /);
    await page.locator('#indication').fill('Andere synthetische Fragestellung.');
    assert.match(await provenance(), /^Erstellt /, 'the model never saw this section');
    await setTemplateAi({ indication: true });
    assert.match(await provenance(), /^Veraltet/);
    await setTemplateAi({ indication: false });
    assert.match(await provenance(), /^Erstellt /);

    // The setting belongs to this template: "Strukturiert" has the same field and still sends it.
    await page.selectOption('#template', 'structured');
    assert(await hint('indication').isHidden());
    await page.selectOption('#template', 'combined');
    assert(await hint('indication').isVisible());

    // Revise: an answer that rewrites a section that was not sent is rejected as a whole.
    reply = () => completion({ sections: [{ id: 'technique', text: 'Andere Technik.' }, { id: 'combined', text: 'Kein Pleuraerguss.' }], issues: [], changes: [] });
    await setTemplateAi({ technique: false });
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
    await setTemplateAi({ combined: false });
    await page.locator('#aiReview').click();
    assert.equal(await status(), 'Alle Abschnitte mit Text sind für die KI ausgeschaltet. Es wurde nichts gesendet.');
    assert.equal(apiCalls.length, 3);

    // Custom template: the switch is stored on the field and travels with the template.
    await page.locator('#addTemplate').click();
    assert(await page.locator('#templateName').isEnabled());
    await page.locator('#templateName').fill('Synthetisch MRT');
    await page.locator('.template-field-name').fill('Patientendaten');
    await page.locator('.template-row .template-field-ai').setChecked(false);
    await page.locator('#addTemplateField').click();
    await page.locator('.template-field-name').nth(1).fill('Befund');
    await page.locator('#templateForm button.primary').click();
    const [privateId, findingsId] = await page.locator('.section:visible textarea').evaluateAll(list => list.map(e => e.id));
    await page.locator('#' + privateId).fill('Synthetische Patientin, 1970.');
    await page.locator('#' + findingsId).fill('Synthetischer Befund.');
    assert(await hint(privateId).isVisible());
    reply = () => completion({ issues: [], changes: [] });
    await page.locator('#aiReview').click();
    await waitStatus('Prüfung abgeschlossen');
    assert.deepEqual(sentIds(apiCalls[3]), [findingsId]);
    assert(!JSON.stringify(apiCalls[3]).includes('1970'));
    // Editing it again keeps the setting; the dialog shows it.
    await page.locator('#editTemplate').click();
    assert(!await row(privateId).locator('.template-field-ai').isChecked());
    assert(await row(findingsId).locator('.template-field-ai').isChecked());
    await page.locator('#cancelTemplate').click();

    // Hidden with the AI feature (hint, dialog switches, built-in edit button); English labels.
    await ui.setSetting(page, '#featureAi', false);
    assert(await hint(privateId).isHidden());
    await page.locator('#editTemplate').click();
    assert(await row(privateId).locator('.template-ai').isHidden());
    await page.locator('#cancelTemplate').click();
    await page.selectOption('#template', 'combined');
    assert(await page.locator('#editTemplate').isHidden(), 'nothing to edit in a built-in template without AI');
    await ui.setSetting(page, '#featureAi', true);
    assert(await page.locator('#editTemplate').isVisible());
    await ui.setSetting(page, '#language', 'en');
    assert.equal(await hint('indication').textContent(), 'Not to AI');
    await ui.setSetting(page, '#language', 'de');

    // Remembered after a reload and saved in the configuration file.
    await page.reload();
    assert(await hint('indication').isVisible());
    assert(await hint('comparison').isHidden());
    const saved = (await saveConfiguration(page)).data;
    assert.deepEqual(saved.settings.templateAi, { combined: { excluded: ['indication', 'technique', 'combined'], instructions: 'Synthetischer Stilhinweis.' } });
    assert.equal(saved.settings.aiExcluded, undefined);
    assert.deepEqual(saved.templates[0].fields.map(f => f.ai), [false, undefined]);

    // The earlier global setting is converted into the templates once.
    await page.evaluate(([key]) => {
      const prefs = JSON.parse(localStorage.getItem(key));
      delete prefs.templateAi;
      prefs.aiExcluded = ['comparison', 'impression'];
      localStorage.setItem(key, JSON.stringify(prefs));
    }, ['befundungstool-preferences-v1']);
    await page.reload();
    await page.selectOption('#template', 'combined');
    assert(await hint('comparison').isVisible());
    assert(await hint('indication').isHidden(), 'the converted setting replaces the stored one');
    await page.selectOption('#template', 'structured');
    assert(await hint('comparison').isVisible());
    assert(await hint('impression').isVisible());
    const migrated = (await saveConfiguration(page)).data.settings;
    assert.deepEqual(migrated.templateAi, { structured: { excluded: ['comparison', 'impression'] }, combined: { excluded: ['comparison'] } });
    assert.equal(migrated.aiExcluded, undefined);

    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    console.log('KI-Abschnitte in der Vorlage: Standard- und eigene Vorlagen, Hinweis, nicht gesendet, Status, Aktualität, Überarbeitung, nichts zu senden, KI aus, Sprache, Speicherung, Konfigurationsdatei und Übernahme der alten Einstellung bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
