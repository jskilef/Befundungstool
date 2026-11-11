'use strict';
// Browser-local AI with the app's real CPU worker and a synthetic Transformers.js module (no model inference).
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../dist/befundungstool.html'), 'utf8');
const RUNTIMES = ['https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1', 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0'];

// Runs inside the real worker. Behaviour is driven by markers in the synthetic report text.
const fakeRuntime = `
export const env = {backends: {onnx: {wasm: {}}}};
export async function pipeline(task, model, options) {
  options.progress_callback({status: 'progress', progress: 100});
  let lastMessages = null;
  const generator = async rendered => {
    const content = lastMessages.at(-1).content;
    const payload = JSON.parse(content.slice(content.indexOf('{"language"')));
    const findings = payload.sections.find(s => s.id === 'findings') || payload.sections[0];
    if (findings.text.includes('FAKE_HANG')) await new Promise(() => {});
    if (findings.text.includes('FAKE_PROSE')) return [{generated_text: 'The report looks fine.'}];
    const info = model + '|' + options.dtype + '|' + options.device + '|merged:' + (lastMessages.length === 1);
    return [{generated_text: JSON.stringify({sections: [{id: findings.id, text: findings.text.replace('gross', 'groß')}], issues: [{category: 'runtime', detail: info}], changes: []})}];
  };
  generator.tokenizer = () => ({input_ids: {dims: [1, 100]}});
  generator.tokenizer.apply_chat_template = messages => { lastMessages = messages; return 'rendered'; };
  generator.dispose = async () => {};
  return generator;
}`;

function makeFolder(name, files) {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bt-model-')), name);
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BT_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [], external = [];
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined }));
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith('https://befundungstool.test/')) return route.fulfill({ contentType: 'text/html', body: html });
      if (RUNTIMES.includes(url)) return route.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: fakeRuntime });
      if (url.startsWith('blob:')) return route.continue();
      external.push(url);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('https://befundungstool.test/');
    const waitStatus = text => page.waitForFunction(t => document.querySelector('#aiStatus').textContent.startsWith(t), text, { timeout: 20000 });

    await page.locator('#aiPanel > summary').click();
    await page.locator('#aiConnection > summary').click();
    await page.selectOption('#aiProvider', 'wasm');
    for (const id of ['#aiEndpoint', '#aiKey', '#aiModel']) assert(await page.locator(id).isHidden(), id + ' hidden in local mode');
    assert.equal(await page.inputValue('#aiLocalModel'), 'onnx-community/Qwen3-0.6B-ONNX');
    assert.equal(await page.locator('#aiDestination').textContent(), 'Befundverarbeitung: auf diesem Gerät · CPU / WASM');
    assert.equal(await page.locator('#aiModelDownload').getAttribute('href'), 'https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX/tree/main');

    // Preset CPU model: real worker, synthetic runtime, per-section result.
    await page.locator('#findings').fill('Herz normal gross.');
    await page.locator('#aiRevise').click();
    await waitStatus('Überarbeitung abgeschlossen');
    assert.equal(await page.inputValue('.ai-draft'), 'Herz normal groß.');
    assert.equal(await page.locator('#aiNotes .ai-issue').textContent(), 'runtimeonnx-community/Qwen3-0.6B-ONNX|q8|wasm|merged:false');
    assert.equal(await page.locator('#aiModelProgress').textContent(), 'Browser-Modell bereit.');
    assert(await page.locator('#aiRevise').isEnabled());

    // Unstructured output is rejected and shown as raw text.
    await page.locator('#findings').fill('FAKE_PROSE');
    await page.locator('#aiReview').click();
    await waitStatus('Das Modell hat keine gültige strukturierte Antwort');
    assert.equal(await page.locator('#aiRaw').textContent(), 'The report looks fine.');

    // Cancel a hanging generation, then recover with a fresh worker.
    await page.locator('#findings').fill('FAKE_HANG');
    await page.locator('#aiReview').click();
    await page.waitForFunction(() => document.querySelector('#aiModelProgress').textContent === 'Lokale Erzeugung läuft…');
    await page.locator('#aiCancel').click();
    await waitStatus('Abgebrochen');
    assert.equal(await page.locator('#aiModelProgress').textContent(), 'Browser-Modell entladen.');
    await page.locator('#findings').fill('Herz normal gross.');
    await page.locator('#aiReview').click();
    await waitStatus('Prüfung abgeschlossen');

    // Custom ONNX folder: detected format and weights, Gemma merges the system prompt, files are used locally.
    await page.selectOption('#aiLocalModel', 'custom-local');
    assert(await page.locator('#aiCustomRows').isVisible());
    assert(await page.locator('#aiModelDownload').isHidden());
    await page.locator('#aiReview').click();
    await waitStatus('Zum Fortfahren einen eigenen Modellordner wählen.');
    const onnxDir = makeFolder('Synthetic-Gemma-ONNX', { 'config.json': '{"model_type":"gemma3"}', 'tokenizer.json': '{}', 'onnx/model_q4.onnx': 'x' });
    await page.locator('#aiModelFolder').setInputFiles(onnxDir);
    await page.waitForFunction(() => document.querySelector('#aiFolderStatus').textContent.startsWith('Lokale Modelldateien geladen'));
    assert.equal(await page.locator('#aiFolderStatus').textContent(), 'Lokale Modelldateien geladen: 3 · Synthetic-Gemma-ONNX · ONNX');
    assert.equal(await page.inputValue('#aiCustomDtype'), 'q4');
    await page.locator('#aiReview').click();
    await waitStatus('Prüfung abgeschlossen');
    assert.equal(await page.locator('#aiNotes .ai-issue').textContent(), 'runtimelocal-model|q4|wasm|merged:true');

    // MLC folders need WebGPU.
    const mlcDir = makeFolder('Synthetic-MLC', { 'mlc-chat-config.json': '{}', 'tensor-cache.json': '{"records":[{"dataPath":"p.bin"}]}', 'p.bin': 'x', 'tokenizer.json': '{}', 'lib.wasm': 'x' });
    await page.locator('#aiModelFolder').setInputFiles(mlcDir);
    await page.waitForFunction(() => document.querySelector('#aiFolderStatus').textContent.startsWith('MLC-Modelle benötigen'));
    await page.locator('#aiClearFolder').click();
    assert.equal(await page.locator('#aiFolderStatus').textContent(), 'Zum Fortfahren einen eigenen Modellordner wählen.');

    // WebGPU mode reports missing WebGPU instead of falling back to anything else.
    await page.selectOption('#aiProvider', 'webllm');
    assert.equal(await page.locator('#aiDestination').textContent(), 'Befundverarbeitung: auf diesem Gerät · WebGPU');
    await page.locator('#aiReview').click();
    await waitStatus('WebGPU ist auf diesem Computer nicht verfügbar');

    // Local settings persist without folders; model files must be selected again after reload.
    await page.selectOption('#aiProvider', 'wasm');
    await page.selectOption('#aiLocalModel', 'HuggingFaceTB/SmolLM2-135M-Instruct');
    await page.reload();
    assert.equal(await page.inputValue('#aiProvider'), 'wasm');
    assert.equal(await page.inputValue('#aiLocalModel'), 'HuggingFaceTB/SmolLM2-135M-Instruct');

    assert.deepEqual(external, [], 'no requests besides the synthetic runtime');
    assert.deepEqual(errors, []);
    console.log('Lokale KI: echter CPU-Worker, Ergebnisse je Abschnitt, ungültige Ausgaben, Abbruch und Neustart, eigener ONNX-Ordner, MLC-Prüfung, fehlendes WebGPU, gespeicherte Auswahl bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
