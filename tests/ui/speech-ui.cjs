'use strict';
// Offline dictation in the browser: Chromium's fake microphone plays a synthetic WAV (tone "syllables"
// or silence), the app's real capture and worker code run, Transformers.js is a fake module (no model).
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ui = require('../helpers/ui.cjs');

const html = fs.readFileSync(path.join(__dirname, '../../dist/befundungstool.html'), 'utf8');
const RUNTIME = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
// Fake runtime inside the real worker: reports the pipeline call and returns Whisper-like output.
const fakeRuntime = `
export const env = { backends: { onnx: { wasm: {} } } };
export async function pipeline(task, model, options) {
  options.progress_callback && options.progress_callback({ status: 'progress', progress: 100 });
  const asr = async (audio, settings) => {
    // Awaited, so the test can hold a transcription open by delaying this response.
    await fetch('https://record.test/?' + encodeURIComponent(JSON.stringify({ task, model, revision: options.revision, device: options.device, dtype: options.dtype, settings, seconds: audio.length / 16000 }))).catch(() => {});
    return { text: ' Kein Erguss. Neuer Absatz. herz normal groß. [Musik]' };
  };
  asr.dispose = async () => {};
  return asr;
}`;

function wav(file, seconds, speech) {
  const rate = 16000, n = rate * seconds, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const voiced = speech && (i / rate) % 0.25 < 0.15;
    const v = voiced ? 0.3 * (Math.sin(2 * Math.PI * 180 * i / rate) + 0.5 * Math.sin(2 * Math.PI * 360 * i / rate)) / 1.5 : 0;
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, data]));
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-speech-'));
  const speechFile = path.join(dir, 'speech.wav'), silentFile = path.join(dir, 'silent.wav');
  wav(speechFile, 3, true);
  wav(silentFile, 3, false);
  const errors = [];

  async function open(audioFile) {
    const browser = await chromium.launch({ headless: true, executablePath: process.env.BT_CHROMIUM_PATH || undefined,
      args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + audioFile] });
    const context = await browser.newContext();
    const external = [], calls = [], hold = { promise: null };
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith('https://befundungstool.test/')) return route.fulfill({ contentType: 'text/html', body: html });
      if (url === RUNTIME) { external.push(url); return route.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: fakeRuntime }); }
      if (url.startsWith('https://record.test/')) {
        calls.push(JSON.parse(decodeURIComponent(url.split('?')[1])));
        if (hold.promise) await hold.promise;
        return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } }).catch(() => {});   // worker may be gone
      }
      external.push(url);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('https://befundungstool.test/');
    const status = () => page.locator('#speechStatus').textContent();
    const waitStatus = text => page.waitForFunction(t => document.querySelector('#speechStatus').textContent.startsWith(t), text);
    return { browser, page, external, calls, hold, status, waitStatus };
  }

  // ---- Speech-like audio ----------------------------------------------------
  {
    const { browser, page, external, calls, hold, status, waitStatus } = await open(speechFile);
    try {
      // Nothing is fetched and no microphone is used until a dictation model is chosen.
      assert(await page.locator('#speechRecord').isVisible());
      assert.equal(await page.locator('#speechRecord').textContent(), 'Diktieren');
      await page.locator('#speechRecord').click();
      assert.equal(await status(), 'Diktiermodell in Einstellungen → Allgemein wählen.');
      assert(await page.locator('#settingsSheet').evaluate(d => d.open), 'settings open at the model choice');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'speechModel');
      await page.selectOption('#speechModel', 'whisper-small');
      assert(await page.locator('#speechCommands').isChecked(), 'formatting commands on by default');
      await ui.closeSettings(page);
      assert.deepEqual(external, [], 'choosing a model downloads nothing yet');

      // Record into the focused section, stop, transcribe: pending text, nothing inserted yet.
      await page.locator('#findings').fill('Befund:');
      await page.locator('#findings').press('End');
      await page.locator('#speechRecord').click();
      await waitStatus('Aufnahme');
      assert.equal(await page.locator('#speechRecord').getAttribute('aria-pressed'), 'true');
      await page.waitForFunction(() => /Stopp · [12] s/.test(document.querySelector('#speechRecord').textContent));
      await page.waitForTimeout(800);
      await page.locator('#speechRecord').click();
      await waitStatus('Transkript prüfen');
      assert.deepEqual(external, [RUNTIME], 'only the pinned runtime is fetched (models: fake)');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].task, 'automatic-speech-recognition');
      assert.equal(calls[0].model, 'onnx-community/whisper-small');
      assert.equal(calls[0].revision, '36050c46d777d46dc4b5f43f6d90574fc38f8732');
      assert.equal(calls[0].device, 'wasm');
      assert.deepEqual(calls[0].dtype, { encoder_model: 'q8', decoder_model_merged: 'q8' });
      assert.deepEqual(calls[0].settings, { language: 'german', task: 'transcribe', chunk_length_s: 30 });
      assert(calls[0].seconds > 1 && calls[0].seconds < 30, '16 kHz audio of the recorded length: ' + calls[0].seconds);
      const card = page.locator('.speech-pending[data-section=findings]');
      assert(await card.isVisible(), 'pending transcript under the target section');
      assert.equal(await card.locator('.speech-label').textContent(), 'Diktat · noch nicht eingefügt');
      assert.equal(await page.inputValue('#speechText'), 'Kein Erguss.\n\nHerz normal groß.', 'hallucinated tag removed, command applied, new line capitalised');
      assert.equal(await page.inputValue('#findings'), 'Befund:', 'nothing inserted automatically');

      // The transcript is editable; "Einfügen" inserts at the cursor; undo restores.
      await page.locator('#speechText').fill('Kein Erguss.\n\nHerz normal groß. Korrigiert.');
      await page.locator('#speechInsert').click();
      assert.equal(await page.inputValue('#findings'), 'Befund: Kein Erguss.\n\nHerz normal groß. Korrigiert.');
      assert.equal(await card.count(), 0);
      assert.equal(await status(), 'Eingefügt.');
      await page.locator('#undo').click();
      assert.equal(await page.inputValue('#findings'), 'Befund:');

      // A new recording with a pending transcript asks first; discard leaves the report unchanged.
      await page.locator('#impression').focus();
      await page.locator('#speechRecord').click();
      await waitStatus('Aufnahme');
      await page.waitForTimeout(1200);
      await page.locator('#speechRecord').click();
      await waitStatus('Transkript prüfen');
      assert(await page.locator('.speech-pending[data-section=impression]').isVisible());
      page.once('dialog', d => d.dismiss());
      await page.locator('#speechRecord').click();
      assert(await page.locator('.speech-pending[data-section=impression]').isVisible(), 'declined: transcript kept');
      await page.locator('#speechDiscard').click();
      assert.equal(await status(), 'Transkript verworfen.');
      assert.equal(await page.inputValue('#impression'), '');

      // Commands off: the words stay as spoken.
      await ui.openSettings(page, 'general');
      await page.locator('#speechCommands').uncheck();
      await ui.closeSettings(page);
      await page.locator('#findings').focus();
      await page.locator('#speechRecord').click();
      await waitStatus('Aufnahme');
      await page.waitForTimeout(1200);
      await page.locator('#speechRecord').click();
      await waitStatus('Transkript prüfen');
      assert.equal(await page.inputValue('#speechText'), 'Kein Erguss. Neuer Absatz. herz normal groß.');
      await page.locator('#speechDiscard').click();

      // Cancel while recording: nothing transcribed.
      const before = calls.length;
      await page.locator('#speechRecord').click();
      await waitStatus('Aufnahme');
      await page.locator('#speechCancel').click();
      assert.equal(await status(), 'Diktat abgebrochen.');
      assert.equal(calls.length, before);

      // "Neuer Befund" ends the dictation, so nothing dictated for one report reaches the next.
      const newReport = async answer => {
        let asked = false;
        page.once('dialog', d => { asked = true; answer === 'accept' ? d.accept() : d.dismiss(); });
        await page.locator('#new').click();
        return asked;
      };
      const pendingCard = page.locator('.speech-pending');
      // (a) A pending transcript counts as unsaved work even when the report is empty.
      await page.locator('#findings').fill('');
      await page.locator('#speechRecord').click();
      await waitStatus('Aufnahme');
      await page.waitForTimeout(1200);
      await page.locator('#speechRecord').click();
      await waitStatus('Transkript prüfen');
      assert(await newReport('dismiss'), 'asks before a new report while a transcript is pending');
      assert.equal(await pendingCard.count(), 1, 'declined: transcript kept');
      assert(await newReport('accept'));
      assert.equal(await pendingCard.count(), 0, 'pending transcript discarded with the old report');
      assert.equal(await status(), '');
      assert.equal(await page.inputValue('#findings'), '');
      // (b) A running recording is cancelled, not transcribed into the new report.
      const beforeRecording = calls.length;
      await page.locator('#findings').focus();
      await page.locator('#speechRecord').click();
      await waitStatus('Aufnahme');
      assert(await newReport('accept'), 'asks before a new report while recording');
      assert.equal(await page.locator('#speechRecord').getAttribute('aria-pressed'), 'false', 'recording stopped');
      assert(await page.locator('#speechCancel').isHidden());
      await page.waitForTimeout(1500);
      assert.equal(calls.length, beforeRecording, 'cancelled recording never transcribed');
      assert.equal(await pendingCard.count(), 0);
      // (c) A transcription that finishes after "Neuer Befund" is dropped.
      let release;
      hold.promise = new Promise(resolve => { release = resolve; });
      const beforeHeld = calls.length;
      await page.locator('#findings').focus();
      await page.locator('#speechRecord').click();
      await waitStatus('Aufnahme');
      await page.waitForTimeout(1200);
      await page.locator('#speechRecord').click();
      await page.waitForFunction(() => document.querySelector('#speechRecord').disabled);
      for (let i = 0; i < 50 && calls.length === beforeHeld; i++) await page.waitForTimeout(100);
      assert.equal(calls.length, beforeHeld + 1, 'transcription under way');
      assert(await newReport('accept'), 'asks before a new report while transcribing');
      hold.promise = null;
      release();
      await page.waitForTimeout(800);
      assert.equal(await pendingCard.count(), 0, 'late transcript not shown for the new report');
      assert.equal(await page.locator('#speechRecord').isDisabled(), false, 'ready to dictate again');
      assert.equal(await page.inputValue('#findings'), '');
      // Dictation still works afterwards.
      await page.locator('#findings').focus();
      await page.locator('#speechRecord').click();
      await waitStatus('Aufnahme');
      await page.waitForTimeout(1200);
      await page.locator('#speechRecord').click();
      await waitStatus('Transkript prüfen');
      await page.locator('#speechDiscard').click();

      // English interface translates the controls.
      await ui.setSetting(page, '#language', 'en');
      assert.equal(await page.locator('#speechRecord').textContent(), 'Dictate');
      await ui.setSetting(page, '#language', 'de');

      // Choice survives a reload (preferences); the feature switch hides everything.
      await page.reload();
      assert.equal(await page.inputValue('#speechModel'), 'whisper-small');
      assert.equal(await page.locator('#speechCommands').isChecked(), false);
      await ui.openSettings(page, 'general');
      await page.locator('#featureSpeech').uncheck();
      await ui.closeSettings(page);
      assert(await page.locator('#speechRecord').isHidden());
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  }

  // ---- Silence: nothing reaches the model, nothing is inserted -------------------
  {
    const { browser, page, external, calls, waitStatus } = await open(silentFile);
    try {
      await ui.openSettings(page, 'general');
      await page.selectOption('#speechModel', 'whisper-small');
      await ui.closeSettings(page);
      await page.locator('#findings').focus();
      await page.locator('#speechRecord').click();
      await waitStatus('Aufnahme');
      await page.waitForTimeout(1200);
      await page.locator('#speechRecord').click();
      await waitStatus('Keine Sprache erkannt. Nichts eingefügt.');
      assert.equal(calls.length, 0, 'model never called');
      assert.deepEqual(external, [], 'runtime not even loaded');
      assert.equal(await page.locator('.speech-pending').count(), 0);
      assert.equal(await page.inputValue('#findings'), '');
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  }
  console.log('Diktat UI: kein Netz ohne Modell, Aufnahme (Fake-Mikrofon), Transkript ausstehend und bearbeitbar, Einfügen am Cursor mit Rückgängig, Verwerfen, Formatbefehle an/aus, Abbrechen, Neuer Befund beendet Diktat (ausstehend, Aufnahme, Transkription), Stille ohne Modellaufruf, Speicherung, Funktionsschalter bestanden.');
})().catch(e => { console.error(e); process.exit(1); });
