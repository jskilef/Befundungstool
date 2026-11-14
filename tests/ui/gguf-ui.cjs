'use strict';
// GGUF model file in the browser: file check, fake llama.cpp runtime (no inference), structured request, chip, reload.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ui = require('../helpers/ui.cjs');
const { buildGguf } = require('../helpers/gguf.cjs');

const html = fs.readFileSync(path.join(__dirname, '../../dist/befundungstool.html'), 'utf8');
const RUNTIME = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/index.js';
// Fake wllama: records what the app passes and answers from the report sections it receives.
const fakeRuntime = `
export class Wllama {
  constructor(paths) { window.__wllama = { paths, loads: [], chats: [] }; }
  isSupportWebGPU() { return false; }
  async loadModel(files, params) { window.__wllama.loads.push({ names: files.map(f => f.name), n_ctx: params.n_ctx }); }
  async createChatCompletion(options) {
    window.__wllama.chats.push(options);
    const payload = JSON.parse(options.messages[1].content);
    const findings = payload.sections.find(s => s.id === 'findings');
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ sections: [{ id: 'findings', text: findings.text.replace('gross', 'groß') }], issues: [], changes: [] }) } }] };
  }
  async exit() { window.__wllama.exited = true; }
}`;

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-gguf-'));
  const modelPath = path.join(dir, 'radgen-synthetic-Q4_K_M.gguf');
  fs.writeFileSync(modelPath, buildGguf({ tensors: [{ name: 'a', size: 100 }, { name: 'b', size: 200 }], arch: 'mistral3' }));
  const notGguf = path.join(dir, 'notes.gguf');
  fs.writeFileSync(notGguf, 'not a model');

  const browser = await chromium.launch({ headless: true, executablePath: process.env.BT_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [], external = [];
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined }));
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('https://befundungstool.test/')) return route.fulfill({ contentType: 'text/html', body: html });
      if (url === RUNTIME) return route.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: fakeRuntime });
      external.push(url);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('https://befundungstool.test/');
    const waitStatus = text => page.waitForFunction(t => document.querySelector('#aiStatus').textContent.startsWith(t), text);

    await ui.openSettings(page, 'ai');
    await page.selectOption('#aiProvider', 'gguf');
    for (const id of ['#aiEndpoint', '#aiKey', '#aiModel', '#aiLocalModel']) assert(await page.locator(id).isHidden(), id + ' hidden');
    assert(await page.locator('#aiGgufFile').isVisible());
    assert.equal(await page.locator('#aiDestination').textContent(), 'Befundverarbeitung: auf diesem Gerät · GGUF · CPU');
    await page.locator('#aiGgufFile').setInputFiles(notGguf);
    await page.waitForFunction(() => document.querySelector('#aiGgufStatus').textContent === 'Keine GGUF-Datei');
    await ui.closeSettings(page);
    assert.equal(await page.locator('#aiChip').textContent(), 'KI: auf diesem Gerät · Modelldatei fehlt');
    await page.locator('#findings').fill('Herz normal gross.');
    await page.locator('#aiReview').click();
    await waitStatus('Eine GGUF-Modelldatei wählen.');

    await ui.openSettings(page, 'ai');
    await page.locator('#aiGgufFile').setInputFiles(modelPath);
    await page.waitForFunction(() => document.querySelector('#aiGgufStatus').textContent.startsWith('GGUF-Modell gewählt'));
    assert.match(await page.locator('#aiGgufStatus').textContent(), /radgen-synthetic-Q4_K_M\.gguf · 0\.0 GB · mistral3$/);
    await ui.closeSettings(page);
    assert.equal(await page.locator('#aiChip').textContent(), 'KI: auf diesem Gerät · radgen-synthetic-Q4_K_M');

    await page.locator('#aiRevise').click();
    await waitStatus('Überarbeitung abgeschlossen');
    const state = await page.evaluate(() => window.__wllama);
    assert.equal(state.paths.default, 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/wasm/wllama.wasm');
    assert.deepEqual(state.loads, [{ names: ['model-00001-of-00001.gguf'], n_ctx: 4096 }]);
    assert.equal(state.chats[0].response_format.type, 'json_schema');
    assert.deepEqual(JSON.parse(state.chats[0].messages[1].content).sections.map(s => s.id), ['findings']);
    assert.equal(await page.locator('.ai-section[data-section=findings] ins').textContent(), 'groß');
    assert.equal(await page.locator('#aiGgufProgress').textContent(), 'Browser-Modell bereit. (CPU)');

    // Second request reuses the loaded model; unloading works; the file must be chosen again after reload.
    await page.locator('#aiReview').click();
    await waitStatus('Prüfung abgeschlossen');
    assert.equal((await page.evaluate(() => window.__wllama.loads.length)), 1);
    await ui.openSettings(page, 'ai');
    await page.locator('#aiGgufUnload').click();
    assert.equal(await page.locator('#aiGgufProgress').textContent(), 'Browser-Modell entladen.');
    await ui.closeSettings(page);
    await page.reload();
    assert.equal(await page.inputValue('#aiProvider'), 'gguf');
    assert.equal(await page.locator('#aiChip').textContent(), 'KI: auf diesem Gerät · Modelldatei fehlt');

    assert.deepEqual(external, [], 'only the (fake) runtime is fetched');
    assert.deepEqual(errors, []);
    console.log('GGUF UI: Dateiprüfung, Laufzeit über jsDelivr (simuliert), strukturierte Anfrage, Wiederverwendung, Entladen, Neuauswahl nach Neuladen bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
