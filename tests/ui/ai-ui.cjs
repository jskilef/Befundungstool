'use strict';
// AI panel end to end against a mocked OpenAI endpoint. All other network access is blocked and counted.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../dist/befundungstool.html'), 'utf8');
const KEY = 'sk-synthetic-ai-ui';
const completion = content => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BT_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [], external = [], apiCalls = [];
  let reply = () => ({ status: 200, body: completion({ issues: [], changes: [] }) });
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('https://befundungstool.test/')) return route.fulfill({ contentType: 'text/html', body: html });
      if (url === 'https://api.openai.com/v1/chat/completions') {
        apiCalls.push(route.request().postDataJSON());
        const { status, body, delay = 0 } = reply();
        return new Promise(r => setTimeout(r, delay)).then(() => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })).catch(() => {});
      }
      external.push(url);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('https://befundungstool.test/');
    const status = () => page.locator('#aiStatus').textContent();
    const waitStatus = text => page.waitForFunction(t => document.querySelector('#aiStatus').textContent.startsWith(t), text);

    // Nothing is sent without a provider: the toolbar offers setup instead of Review/Revise.
    assert.deepEqual(external, [], 'no network requests at startup');
    assert(await page.locator('#aiReview').isHidden());
    assert.equal(await page.locator('#aiChip').textContent(), 'KI aus');
    assert(await page.locator('#aiBanner').isHidden());
    await page.locator('#aiSetup').click();
    assert(await page.locator('#settingsSheet').evaluate(d => d.open), 'setup opens the settings sheet');
    assert(await page.locator('[data-sheet-tab=ai]').evaluate(t => t.getAttribute('aria-selected') === 'true'));
    assert.equal(await page.locator('#aiDestination').textContent(), 'Keine KI ausgewählt. Es wird nichts gesendet.');

    // Configure OpenAI in the settings sheet.
    await page.selectOption('#aiProvider', 'openai');
    assert.equal(await page.inputValue('#aiEndpoint'), 'https://api.openai.com/v1/chat/completions');
    await page.locator('#aiKey').fill(KEY);
    await page.locator('#aiModel').fill('synthetic-model');
    await page.selectOption('#aiReportLanguage', 'German');
    assert.equal(await page.locator('#aiDestination').textContent(), 'Befundziel: https://api.openai.com');
    await page.locator('#closeSettings').click();
    assert.equal(await page.locator('#aiChip').textContent(), 'KI: OpenAI · synthetic-model');
    assert(await page.locator('#aiReview').isVisible());
    assert(await page.locator('#aiSetup').isHidden());

    // Report with frozen text.
    await page.locator('#findings').fill('Kein Pleuraerguss rechts. Herz normal gross.');
    await page.locator('#findings').evaluate(e => e.setSelectionRange(0, 25));
    await page.locator('#findings').locator('..').locator('.freeze-action').click();
    await page.locator('#impression').fill('Unauffaellig.');

    // Review: notes rendered as text only.
    reply = () => ({ status: 200, body: completion({ issues: [{ category: 'Rechtschreibung', detail: '<img src=x onerror="window.pwned=1"> gross → groß', section: 'findings' }], changes: [] }) });
    await page.locator('#aiReview').click();
    await waitStatus('Prüfung abgeschlossen');
    assert.equal(apiCalls.length, 1);
    const sent = apiCalls[0];
    assert.equal(sent.model, 'synthetic-model');
    assert.equal(sent.store, false);
    assert.match(sent.messages[0].content, /Write review notes in German\.$/);
    const payload = JSON.parse(sent.messages[1].content);
    assert.deepEqual(payload.sections.map(s => s.id), ['indication', 'technique', 'comparison', 'findings', 'impression']);
    assert.deepEqual(payload.sections[3].protected, ['Kein Pleuraerguss rechts.']);
    assert.equal(payload.language, 'German');
    assert.equal(await page.locator('#aiNotes .ai-issue strong').textContent(), 'Rechtschreibung · Befund');
    assert.equal(await page.locator('#aiNotes img').count(), 0, 'model text must never become HTML');
    assert.equal(await page.evaluate(() => window.pwned), undefined);
    // The note also appears directly under the Befund section, and the side tab shows a count.
    const inlineNote = page.locator('#findings').locator('xpath=ancestor::div[contains(@class,"section")]').locator('.ai-inline-note');
    assert.equal(await inlineNote.count(), 1);
    assert.match(await inlineNote.textContent(), /^Rechtschreibung: /);
    assert.equal(await page.locator('.ai-inline img').count(), 0);
    assert.equal(await page.locator('#notesCount').textContent(), '1');
    await page.locator('#tabNotes').click();
    assert(await page.locator('#aiNotes .ai-issue').isVisible());
    await page.locator('#aiNotes .ai-issue').click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'findings', 'note jumps to its section');
    await page.locator('#tabMacros').click();

    // Revise: per-section diff; frozen text blocks replace; append works; undo restores.
    reply = () => ({ status: 200, body: completion({
      sections: [{ id: 'findings', text: 'Kein Pleuraerguss rechts. Herz normal groß.' }, { id: 'impression', text: 'Unauffällig.' }],
      issues: [], changes: ['Rechtschreibung korrigiert']
    }) });
    await page.locator('#aiRevise').click();
    await waitStatus('Überarbeitung abgeschlossen');
    assert.equal(await page.locator('.ai-section').count(), 2);
    const findingsCard = page.locator('.ai-section[data-section=findings]');
    // Suggestions sit inside their own report section.
    assert(await findingsCard.evaluate(card => card.closest('.section')?.contains(document.getElementById('findings'))));
    assert.match(await page.locator('#aiStatus').textContent(), /\(2 Vorschläge\)$/);
    assert(await findingsCard.locator('.ai-draft').isHidden(), 'draft editor hidden until "Bearbeiten"');
    await findingsCard.locator('[data-action=edit]').click();
    assert(await findingsCard.locator('.ai-draft').isVisible());
    assert.equal(await findingsCard.locator('[data-apply=replace]').textContent(), 'Übernehmen');
    assert.equal(await findingsCard.locator('del').textContent(), 'gross');
    assert.equal(await findingsCard.locator('ins').textContent(), 'groß');
    assert(await findingsCard.locator('.ai-warning[hidden]').count() === 1, 'frozen text intact: no warning');
    assert.equal(await page.inputValue('#findings'), 'Kein Pleuraerguss rechts. Herz normal gross.', 'nothing applied automatically');

    await findingsCard.locator('[data-apply=replace]').click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.startsWith('Fixierte Textstellen'));
    assert.equal(await page.inputValue('#findings'), 'Kein Pleuraerguss rechts. Herz normal gross.');

    const impressionCard = page.locator('.ai-section[data-section=impression]');
    await impressionCard.locator('[data-apply=replace]').click();
    assert.equal(await page.inputValue('#impression'), 'Unauffällig.');
    assert.equal(await impressionCard.locator('.ai-section-state').textContent(), 'Übernommen');
    assert(await impressionCard.locator('[data-apply=append]').isDisabled());
    assert(await impressionCard.locator('.ai-section-actions').isHidden(), 'applied suggestions collapse');
    await page.locator('#undo').click();
    assert.equal(await page.inputValue('#impression'), 'Unauffaellig.');

    // Outdated result: the report changed, so applying asks first; declining keeps the editor unchanged.
    await page.locator('#findings').press('End');
    await page.locator('#findings').type(' Neu.');
    assert.match(await findingsCard.locator('.ai-section-state').textContent(), /^Veraltet/);
    page.once('dialog', d => d.dismiss());
    await findingsCard.locator('[data-apply=append]').click();
    assert.equal(await page.inputValue('#findings'), 'Kein Pleuraerguss rechts. Herz normal gross. Neu.');
    page.once('dialog', d => d.accept());
    await findingsCard.locator('[data-apply=append]').click();
    assert.equal(await page.inputValue('#findings'), 'Kein Pleuraerguss rechts. Herz normal gross. Neu.\n\nKein Pleuraerguss rechts. Herz normal groß.');

    // Invalid output: rejected, raw text shown as text, previous result kept and marked.
    reply = () => ({ status: 200, body: completion('Sure! Here is your report <b>bold</b>') });
    await page.locator('#aiRevise').click();
    await waitStatus('Das Modell hat keine gültige strukturierte Antwort');
    assert(await page.locator('#aiRawBox').isVisible());
    assert.equal(await page.locator('#aiRaw b').count(), 0);
    assert.equal(await page.locator('.ai-section').count(), 2, 'previous result kept');

    // Provider errors: hint and status only, never upstream text.
    reply = () => ({ status: 401, body: { error: { code: 'invalid_api_key', message: 'Synthetic upstream secret' } } });
    await page.locator('#aiReview').click();
    await waitStatus('API-Schlüssel prüfen.');
    assert.equal(await status(), 'API-Schlüssel prüfen. (HTTP 401) [invalid_api_key]');

    // Cancel a slow request.
    reply = () => ({ status: 200, body: completion({ issues: [], changes: [] }), delay: 5000 });
    await page.locator('#aiReview').click();
    assert(await page.locator('#aiCancel').isEnabled());
    await page.locator('#aiCancel').click();
    await waitStatus('Abgebrochen');
    assert(await page.locator('#aiReview').isEnabled());

    // Changing the endpoint origin clears the key.
    const ui = require('../helpers/ui.cjs');
    await ui.openSettings(page, 'ai');
    await page.locator('#aiEndpoint').fill('https://gateway.example.test/v1/chat/completions');
    assert.equal(await page.inputValue('#aiKey'), '');
    assert.match(await status(), /API-Schlüssel wegen geänderter Endpunkt-Adresse entfernt/);
    await page.locator('#aiEndpoint').fill('https://api.openai.com/v1/chat/completions');
    await page.locator('#aiKey').fill(KEY);
    await ui.closeSettings(page);

    // D5: provider/model/endpoint survive a reload; the key never touches storage (no vault was created).
    assert(!await page.evaluate(k => JSON.stringify(Object.entries(localStorage)).includes(k), KEY));
    await page.reload();
    assert(await page.locator('#unlockDialog').evaluate(d => !d.open), 'no vault, no unlock prompt');
    assert.equal(await page.inputValue('#aiProvider'), 'openai');
    assert.equal(await page.inputValue('#aiModel'), 'synthetic-model');
    assert.equal(await page.inputValue('#aiReportLanguage'), 'German');
    assert.equal(await page.inputValue('#aiKey'), '');
    assert.equal(await page.locator('#aiChip').textContent(), 'KI: OpenAI · synthetic-model · Schlüssel fehlt');

    // English interface translates the AI controls.
    await ui.setSetting(page, '#language', 'en');
    assert.equal(await page.locator('#aiRevise').textContent(), 'Revise');
    assert.equal(await page.locator('#tabNotes').textContent(), 'AI notes ');

    // New report clears AI results, inline and in the side tab.
    await ui.setSetting(page, '#language', 'de');
    await ui.configureAi(page, { key: KEY });
    await page.locator('#findings').fill('Text.');
    reply = () => ({ status: 200, body: completion({ issues: [{ category: 'A', detail: 'B' }], changes: [] }) });
    await page.locator('#aiReview').click();
    await waitStatus('Prüfung abgeschlossen');
    page.once('dialog', d => d.accept());
    await page.locator('#new').click();
    assert.equal(await page.locator('#aiNotes .ai-issue').count(), 0);
    assert.equal(await page.locator('.ai-inline-note, .ai-section').count(), 0);
    assert(await page.locator('#notesCount').isHidden());

    assert.deepEqual(external, [], 'no unexpected network requests');
    assert.deepEqual(errors, []);
    console.log('KI-Panel: kein Netzverkehr ohne Anbieter, Prüfen, Überarbeiten je Abschnitt, Diff, Fixierungsschutz, Rückgängig, Veraltet-Bestätigung, ungültige Antworten, Fehlerhinweise, Abbruch, Schlüsselschutz, Sprachwechsel, neuer Befund bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
