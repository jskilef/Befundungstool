'use strict';
// LM Studio in the browser against a mocked local server (no model runs): model list, structured request, CORS hint.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ui = require('../helpers/ui.cjs');

const html = fs.readFileSync(path.join(__dirname, '../../dist/befundungstool.html'), 'utf8');
const json = body => ({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BT_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [], chats = [], external = [];
  let serverUp = true;
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('https://befundungstool.test/')) return route.fulfill({ contentType: 'text/html', body: html });
      if (url.startsWith('http://127.0.0.1:1234/')) {
        if (!serverUp) return route.abort();
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST' } });
        if (url.endsWith('/v1/models')) return route.fulfill(json({ data: [{ id: 'radgen-qwen-lora' }, { id: 'radgen-ministral-lora' }, { id: 'text-embedding-nomic-embed-text-v1.5' }] }));
        const body = route.request().postDataJSON();
        chats.push({ body, headers: route.request().headers() });
        const payload = JSON.parse(body.messages[1].content);
        const findings = payload.sections.find(s => s.id === 'findings');
        return route.fulfill(json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ sections: [{ id: 'findings', text: findings.text.replace('gross', 'groß') }], issues: [{ category: 'Seitenangabe', detail: 'Synthetischer Hinweis.', section: 'findings' }], changes: [] }) } }] }));
      }
      external.push(url);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('https://befundungstool.test/');
    const waitStatus = text => page.waitForFunction(t => document.querySelector('#aiStatus').textContent.startsWith(t), text);

    // Choosing LM Studio fills the local endpoint, hides the key and loads the model list.
    await ui.openSettings(page, 'ai');
    await page.selectOption('#aiProvider', 'lmstudio');
    assert.equal(await page.inputValue('#aiEndpoint'), 'http://127.0.0.1:1234/v1/chat/completions');
    assert(await page.locator('#aiKey').isHidden());
    await waitStatus('Modelle gefunden: 2');
    assert.equal(await page.inputValue('#aiModel'), 'radgen-qwen-lora');
    assert.deepEqual(await page.locator('#aiModelList option').evaluateAll(o => o.map(x => x.value)), ['radgen-qwen-lora', 'radgen-ministral-lora']);
    assert.equal(await page.locator('#aiDestination').textContent(), 'Befundverarbeitung: auf diesem Gerät · LM Studio');
    await page.locator('#aiModel').fill('radgen-ministral-lora');
    await ui.closeSettings(page);
    assert.equal(await page.locator('#aiChip').textContent(), 'KI: LM Studio · radgen-ministral-lora');

    // Revise: structured output requested, no key sent, suggestion inline.
    await page.locator('#findings').fill('Herz normal gross.');
    await page.locator('#aiRevise').click();
    await waitStatus('Überarbeitung abgeschlossen');
    assert.equal(chats.length, 1);
    assert.equal(chats[0].body.model, 'radgen-ministral-lora');
    assert.equal(chats[0].body.response_format.type, 'json_schema');
    assert.deepEqual(chats[0].body.response_format.json_schema.schema.required, ['sections', 'issues', 'changes']);
    assert.equal(chats[0].headers.authorization, undefined);
    assert.equal(await page.locator('.ai-section[data-section=findings] ins').textContent(), 'groß');

    // Server unreachable (or CORS off): a specific hint instead of a generic network error.
    serverUp = false;
    await page.locator('#aiReview').click();
    await waitStatus('LM Studio ist im Browser nicht erreichbar');

    // Provider and model survive a reload (no key involved).
    await page.reload();
    assert.equal(await page.inputValue('#aiProvider'), 'lmstudio');
    assert.equal(await page.inputValue('#aiModel'), 'radgen-ministral-lora');

    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    console.log('LM Studio UI: Modellliste, verstecktes Schlüsselfeld, strukturierte Anfrage, Vorschläge, Erreichbarkeitshinweis, gespeicherte Auswahl bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
