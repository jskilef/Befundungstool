'use strict';
// Offline dictation engine: silence check, transcript cleanup, formatting commands, capture limits and
// buffer clearing, Whisper runner (pinned presets, devices, transfer, cancellation). Synthetic audio only.
const assert = require('node:assert/strict');
const T = require('../../src/speech/text.js');
const Capture = require('../../src/speech/capture.js');
const W = require('../../src/speech/whisper.js');

// Synthetic signals at 16 kHz.
const rate = 16000;
const silence = seconds => new Float32Array(rate * seconds);
function noise(seconds, amplitude) { const a = new Float32Array(rate * seconds); let x = 12345; for (let i = 0; i < a.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; a[i] = (x / 0x7fffffff * 2 - 1) * amplitude; } return a; }
// "Syllables": 150 ms voiced bursts (harmonic tone) separated by 100 ms pauses with faint noise.
function speechLike(seconds, amplitude = 0.3) {
  const a = noise(seconds, 0.002);
  for (let i = 0; i < a.length; i++) if ((i / rate) % 0.25 < 0.15) a[i] += amplitude * (Math.sin(2 * Math.PI * 180 * i / rate) + 0.5 * Math.sin(2 * Math.PI * 360 * i / rate)) / 1.5;
  return a;
}

(async () => {
  // Silence check: silence, faint noise and steady loud noise never reach the model; speech does.
  assert.equal(T.hasSpeech(silence(3)), false);
  assert.equal(T.hasSpeech(noise(3, 0.004)), false, 'room noise');
  assert.equal(T.hasSpeech(noise(3, 0.1)), false, 'steady loud noise (fan, hum) does not vary like speech');
  assert.equal(T.hasSpeech(speechLike(2)), true);
  assert.equal(T.hasSpeech(speechLike(2, 0.03)), true, 'quiet speaker');
  assert.equal(T.hasSpeech(speechLike(0.2)), false, 'a click is not speech');
  assert.equal(T.hasSpeech(new Float32Array(0)), false);

  // Whisper's silence hallucinations (as measured: "[Musik]", "Vielen Dank.") give nothing.
  for (const h of [' [Musik]', ' Vielen Dank.', 'Untertitel im Auftrag des ZDF für funk, 2017', '*Musik*', ' Thanks for watching!', '(Applaus)', '...']) assert.equal(T.cleanTranscript(h), '', h);
  assert.equal(T.cleanTranscript(' Kein Erguss. [Musik] Herz normal groß.'), 'Kein Erguss. Herz normal groß.');
  assert.equal(T.cleanTranscript('Vielen Dank für die Zuweisung, kein Erguss.'), 'Vielen Dank für die Zuweisung, kein Erguss.', 'real sentences stay');

  // Formatting commands in real Whisper output (punctuated, one line) — RepDict only matched standalone lines.
  assert.equal(T.applyCommands('Kein Pleuraerguss rechts. Neuer Absatz. Die Lungengefäßzeichnung ist regelrecht.'), 'Kein Pleuraerguss rechts.\n\nDie Lungengefäßzeichnung ist regelrecht.');
  assert.equal(T.applyCommands('Kein Perikarderguss. Neue Zeile. Beurteilung: unauffällig.'), 'Kein Perikarderguss.\nBeurteilung: unauffällig.');
  assert.equal(T.applyCommands('kein Erguss, neuer Absatz, herz normal groß'), 'kein Erguss\n\nHerz normal groß', 'commas, lower case');
  assert.equal(T.applyCommands('Text NEUER ABSATZ Text neue zeile Ende'), 'Text\n\nText\nEnde');
  assert.equal(T.applyCommands('No effusion. New paragraph. Heart normal.'), 'No effusion.\n\nHeart normal.');
  assert.equal(T.applyCommands('Kein Erguss. Neuer Absatz. Neuer Absatz. Herz.'), 'Kein Erguss.\n\nHerz.', 'never more than one blank line');
  assert.equal(T.applyCommands('Kein Erguss. Neuer Absatz.', false), 'Kein Erguss. Neuer Absatz.', 'switch off');
  assert.equal(T.applyCommands('Die Zeilenabstände und Absatzränder sind normal.'), 'Die Zeilenabstände und Absatzränder sind normal.', 'only whole command words');

  // Resampling (browsers without a 16 kHz context).
  assert.equal(T.resample(new Float32Array(48000), 48000).length, 16000);
  const same = new Float32Array(5);
  assert.equal(T.resample(same, 16000), same);

  // Capture with a fake microphone/AudioContext/worklet: 16 kHz mono, raw constraints, 30 s limit,
  // chunks zero-filled after copying, buffer cleared on stop and cancel, tracks stopped.
  const log = [];
  class FakePort { constructor() { this.onmessage = null; } postMessage(m) { if (m === 'flush') setTimeout(() => this.onmessage?.({ data: 'flushed' })); } close() { log.push('port-closed'); } }
  let lastNode = null;
  class FakeNode { constructor(ctx, name) { this.port = new FakePort(); this.name = name; lastNode = this; } disconnect() {} }
  class FakeContext {
    constructor(options) { this.sampleRate = options?.sampleRate || 48000; this.audioWorklet = { addModule: async url => log.push(url.startsWith('data:text/javascript') ? 'data-url' : 'other-url') }; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    async close() { log.push('context-closed'); }
  }
  const track = { stop: () => log.push('track-stopped') };
  let constraints = null;
  const media = { getUserMedia: async c => { constraints = c; return { getTracks: () => [track] }; } };
  let limits = 0;
  const capture = Capture.createCapture({ maxSeconds: 1, media, AudioContextImpl: FakeContext, AudioWorkletNodeImpl: FakeNode, onLimit: () => limits++ });
  await capture.start();
  assert.deepEqual(constraints, { audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  assert(log.includes('data-url'), 'worklet from a data: URL (works on file://)');
  assert.equal(lastNode.name, 'befundungstool-capture');
  const chunk = new Float32Array(2048).fill(0.5);
  for (let i = 0; i < 10; i++) lastNode.port.onmessage({ data: chunk.slice() });
  lastNode.port.onmessage({ data: chunk });
  assert.equal(chunk[0], 0, 'chunks are cleared after copying');
  assert.equal(limits, 1, 'limit reached once at 1 s');
  assert.equal(capture.seconds, 1);
  const recorded = await capture.stop();
  assert.equal(recorded.length, 16000, 'never longer than the limit');
  assert.equal(recorded[0], 0.5);
  assert(log.includes('track-stopped') && log.includes('context-closed'));
  assert.equal(capture.recording, false);
  await assert.rejects(capture.stop(), /No recording/);
  // Cancel: no audio returned, buffers gone.
  await capture.start();
  lastNode.port.onmessage({ data: new Float32Array(2048).fill(0.2) });
  await capture.cancel();
  assert.equal(capture.seconds, 0);
  await assert.rejects(capture.stop(), /No recording/);
  // A late permission grant after cancel never starts a recording.
  let grant;
  const slow = Capture.createCapture({ media: { getUserMedia: () => new Promise(r => { grant = r; }) }, AudioContextImpl: FakeContext, AudioWorkletNodeImpl: FakeNode });
  const starting = slow.start();
  await slow.cancel();
  let stopped = false;
  grant({ getTracks: () => [{ stop: () => { stopped = true; } }] });
  await assert.rejects(starting, e => e.name === 'AbortError');
  assert(stopped && !slow.recording, 'stale microphone released');
  // Browsers without a 16 kHz context: recorded at 48 kHz, returned at 16 kHz.
  class WideContext extends FakeContext { constructor() { super({ sampleRate: 48000 }); } }
  const wide = Capture.createCapture({ maxSeconds: 1, media, AudioContextImpl: WideContext, AudioWorkletNodeImpl: FakeNode });
  await wide.start();
  for (let i = 0; i < 24; i++) lastNode.port.onmessage({ data: new Float32Array(2048).fill(0.1) });
  assert.equal((await wide.stop()).length, 16000);

  // Whisper presets are pinned (model revision and dtype per device).
  assert.equal(W.TRANSFORMERS_URL, 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1');
  assert.deepEqual(Object.keys(W.PRESETS), ['whisper-small', 'whisper-large-v3-turbo']);
  for (const p of Object.values(W.PRESETS)) assert.match(p.revision, /^[0-9a-f]{40}$/);
  assert.deepEqual(Object.keys(W.PRESETS['whisper-small'].devices), ['wasm'], 'small runs on CPU (measured)');
  assert.deepEqual(W.PRESETS['whisper-large-v3-turbo'].devices.webgpu, { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' });
  assert(W.WORKER_SOURCE.includes("import('" + W.TRANSFORMERS_URL + "')") && W.WORKER_SOURCE.includes('audio.fill(0)'));

  // Runner with a fake worker: device choice, audio transferred, progress, cancellation, model change.
  const workers = [];
  class FakeWorker {
    constructor(url) { this.url = url; this.messages = []; this.terminated = false; workers.push(this); }
    postMessage(message, transfer) {
      this.messages.push({ message, transfer });
      if (this.hold) return;
      setTimeout(() => {
        const reply = data => this.onmessage?.({ data: { id: message.id, ...data } });
        reply({ type: 'progress', progress: 0.5 });
        if (message.type === 'load') return reply({ type: 'loaded' });
        if (this.fail) return reply({ type: 'error', code: this.fail });
        reply({ type: 'transcribing' });
        reply({ type: 'result', text: ' Kein Erguss.' });
      });
    }
    terminate() { this.terminated = true; }
  }
  const progress = [];
  let hasGpu = false;
  const runner = W.createRunner({ WorkerImpl: FakeWorker, gpu: async () => hasGpu, onProgress: (k, s = '') => progress.push(k + s) });
  await assert.rejects(runner.transcribe(new Float32Array(10), { preset: 'none' }), /Choose a dictation model/);
  const samples = speechLike(1);
  const result = await runner.transcribe(samples, { preset: 'whisper-small', language: 'de' });
  assert.deepEqual(result, { text: ' Kein Erguss.', device: 'wasm' });
  const sent = workers[0].messages[0];
  assert.equal(sent.message.model, 'onnx-community/whisper-small');
  assert.equal(sent.message.revision, W.PRESETS['whisper-small'].revision);
  assert.deepEqual(sent.message.dtype, { encoder_model: 'q8', decoder_model_merged: 'q8' });
  assert.equal(sent.message.language, 'german');
  assert.equal(sent.transfer[0], samples.buffer, 'audio is transferred, not copied');
  assert(progress.includes('Loading dictation model… 50 %') && progress.includes('Transcribing locally…'));
  // Same model: same worker. Turbo with WebGPU: q4f16 on webgpu, new worker.
  await runner.transcribe(speechLike(1), { preset: 'whisper-small', language: 'en' });
  assert.equal(workers.length, 1);
  assert.equal(workers[0].messages[1].message.language, 'english');
  hasGpu = true;
  assert.equal((await runner.transcribe(speechLike(1), { preset: 'whisper-large-v3-turbo' })).device, 'webgpu');
  assert(workers[0].terminated && workers.length === 2);
  assert.deepEqual(workers[1].messages[0].message.dtype, { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' });
  hasGpu = false;
  assert.equal((await runner.transcribe(speechLike(1), { preset: 'whisper-large-v3-turbo' })).device, 'wasm', 'turbo falls back to CPU (visible as "(CPU)")');
  // Errors terminate the worker and give a clear message.
  workers.at(-1).fail = 'download';
  await assert.rejects(runner.transcribe(speechLike(1), { preset: 'whisper-large-v3-turbo' }), /could not be downloaded/);
  assert(workers.at(-1).terminated);
  // Cancel during transcription: worker terminated, AbortError; stop() rejects pending work.
  const controller = new AbortController();
  const holding = runner.transcribe(speechLike(1), { preset: 'whisper-small', signal: controller.signal });
  await new Promise(r => setTimeout(r));
  workers.at(-1).hold = true;
  const held = runner.transcribe(speechLike(1), { preset: 'whisper-small' }).catch(e => e);
  await holding;
  await new Promise(r => setTimeout(r));
  runner.stop();
  assert.match((await held).message, /cancelled or the model changed/);
  const w = workers.at(-1);
  const aborting = runner.transcribe(speechLike(1), { preset: 'whisper-small', signal: controller.signal });
  controller.abort();
  await assert.rejects(aborting, e => e.name === 'AbortError');
  assert(w.terminated || workers.at(-1).terminated);
  // Cancel while the worker is busy: reported as cancelled, not as a model change.
  const busyController = new AbortController();
  const busyRunner = W.createRunner({ WorkerImpl: class extends FakeWorker { constructor(u) { super(u); this.hold = true; } }, gpu: async () => false });
  const busy = busyRunner.transcribe(speechLike(1), { preset: 'whisper-small', signal: busyController.signal });
  await new Promise(r => setTimeout(r, 10));
  busyController.abort();
  await assert.rejects(busy, e => e.name === 'AbortError');
  assert.equal(busyRunner.loaded, false, 'worker terminated');
  // Load without audio (Settings → "Load model").
  assert.equal(await W.createRunner({ WorkerImpl: FakeWorker, gpu: async () => false }).load('whisper-small'), 'wasm');

  // Local model folder: structure check and best available variant per device; no presets needed.
  const file = name => [name, { name }];
  const base = ['config.json', 'tokenizer.json', 'preprocessor_config.json'].map(file);
  assert.throws(() => W.validateFolder([file('config.json')]), /not a Whisper model/);
  assert.throws(() => W.validateFolder(base), /No Whisper ONNX files/);
  const folder = [...base, file('onnx/encoder_model_quantized.onnx'), file('onnx/decoder_model_merged_quantized.onnx'), file('onnx/encoder_model_q4f16.onnx'), file('onnx/decoder_model_merged_q4f16.onnx')];
  const names = W.validateFolder(folder);
  assert.deepEqual(W.folderDtype(names, 'wasm'), { encoder_model: 'q8', decoder_model_merged: 'q8' });
  assert.deepEqual(W.folderDtype(names, 'webgpu'), { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' });
  const local = W.createRunner({ WorkerImpl: FakeWorker, gpu: async () => false });
  await assert.rejects(local.transcribe(new Float32Array(1), { preset: W.FOLDER }), /Choose a local Whisper model folder/);
  local.setFolder(folder);
  await local.transcribe(speechLike(1), { preset: W.FOLDER });
  const folderMessage = workers.at(-1).messages[0].message;
  assert.equal(folderMessage.files, folder, 'model files come from the folder');
  assert.equal(folderMessage.model, undefined, 'no Hugging Face model id');
  assert.match(W.WORKER_SOURCE, /Model network downloads disabled/);
  console.log('Diktat-Engine: Stilleprüfung, Halluzinationsfilter, Formatbefehle im Fließtext, Aufnahme (16 kHz, 30 s, Puffer gelöscht), Whisper-Runner (feste Versionen, Geräte, Abbruch, Modellordner) bestanden.');
})().catch(error => { console.error(error); process.exit(1); });
