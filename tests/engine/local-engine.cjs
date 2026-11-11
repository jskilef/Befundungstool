'use strict';
// Browser-local inference: model folders, custom model detection, worker selection and lifecycle (fake Worker).
const assert = require('node:assert/strict');
const L = require('../../src/ai/local.js');

const file = (text, size) => { const f = new File([text], 'x'); if (size) Object.defineProperty(f, 'size', { value: size }); return f; };
const folder = (root, names, contents = {}) => names.map(n => Object.assign(file(contents[n] ?? 'synthetic'), { webkitRelativePath: root + '/' + n }));

(async () => {
  // Folder entries keep relative paths without the root folder and reject unsafe or duplicate paths.
  assert.deepEqual(L.modelFolderEntries(folder('Model', ['config.json', 'onnx/model.onnx'])).map(e => e[0]), ['config.json', 'onnx/model.onnx']);
  assert.throws(() => L.modelFolderEntries(folder('Model', ['a/../b'])), /Invalid or duplicate/);
  assert.throws(() => L.modelFolderEntries([...folder('M', ['a']), ...folder('M', ['a'])]), /Invalid or duplicate/);
  assert.throws(() => L.modelFolderEntries([]), /Choose a model folder/);

  // Preset bundles.
  const entries = names => names.map(n => [n, file('x')]);
  assert.throws(() => L.validateModelBundle('onnx-community/Qwen3-0.6B-ONNX', entries(['config.json', 'tokenizer.json'])), /tokenizer_config\.json/);
  L.validateModelBundle('onnx-community/Qwen3-0.6B-ONNX', entries(['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx']));
  assert.throws(() => L.validateModelBundle('geeek/medgemma-4b-it-ONNX', entries(['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/model_quantized.onnx'])), /embed_tokens_q4/);
  assert.throws(() => L.validateModelBundle('Qwen3-0.6B-q4f16_1-MLC', entries(['mlc-chat-config.json', 'tensor-cache.json'])), /matching WebLLM \.wasm/);
  L.validateModelBundle('Qwen3-0.6B-q4f16_1-MLC', entries(['mlc-chat-config.json', 'tensor-cache.json', 'Qwen3-0.6B-q4f16_1_cs1k-webgpu.wasm']));

  // Custom ONNX: dtype detection, preferred variant, Gemma system-prompt merge.
  const onnx = [['config.json', file('{"model_type":"gemma3"}')], ['tokenizer.json', file('{}')], ['onnx/model_q4.onnx', file('x')], ['onnx/model_quantized.onnx', file('x')]];
  assert.deepEqual(await L.describeCustomModel(onnx, 'wasm', 'fp16'), { format: 'onnx', dtype: 'q4', mergeSystem: true });
  assert.equal((await L.describeCustomModel(onnx, 'wasm', 'q8')).dtype, 'q8');
  await assert.rejects(L.describeCustomModel([['config.json', file('{}')], ['tokenizer.json', file('{}')], ['onnx/m.onnx', file('x')]], 'wasm'), /model_type/);
  await assert.rejects(L.describeCustomModel([['model.gguf', file('x')]], 'wasm'), /GGUF, safetensors and PyTorch/);
  await assert.rejects(L.describeCustomModel([['config.json', file('{"model_type":"x"}', 30e6)]], 'wasm'), /too large/);

  // Custom MLC: WebGPU only, one library, all shards present.
  const mlc = [['mlc-chat-config.json', file('{}')], ['tensor-cache.json', file('{"records":[{"dataPath":"params_shard_0.bin"}]}')], ['params_shard_0.bin', file('x')], ['tokenizer.json', file('{}')], ['lib.wasm', file('x')]];
  assert.deepEqual(await L.describeCustomModel(mlc, 'webllm'), { format: 'mlc', library: 'lib.wasm' });
  await assert.rejects(L.describeCustomModel(mlc, 'wasm'), /MLC models require WebGPU/);
  await assert.rejects(L.describeCustomModel(mlc.filter(e => e[0] !== 'params_shard_0.bin'), 'webllm'), /Missing model file: params_shard_0\.bin/);
  await assert.rejects(L.describeCustomModel([...mlc, ['other.wasm', file('x')]], 'webllm'), /exactly one/);

  // Worker selection.
  assert(L.usesCpuWorker({ local: 'wasm', model: 'x' }));
  assert(L.usesCpuWorker({ local: 'webllm', model: 'geeek/medgemma-4b-it-ONNX' }));
  assert(L.usesCpuWorker({ local: 'webllm', model: 'custom-local' }, { format: 'onnx' }));
  assert(!L.usesCpuWorker({ local: 'webllm', model: 'custom-local' }, { format: 'mlc' }));
  assert(!L.usesCpuWorker({ local: 'webllm', model: 'Qwen3-0.6B-q4f16_1-MLC' }));
  assert.throws(() => L.buildLocalRequest('wasm', 'Qwen3-0.6B-q4f16_1-MLC', 's', 'i'), /supported browser model/);
  assert.equal(L.downloadPage('Qwen3-0.6B-q4f16_1-MLC'), 'https://huggingface.co/mlc-ai/Qwen3-0.6B-q4f16_1-MLC/tree/main');
  assert.equal(L.downloadPage('custom-local'), null);

  // Runner lifecycle with a fake Worker.
  const workers = [], urls = { created: 0, revoked: 0 };
  class FakeWorker {
    constructor(url, options) { this.url = url; this.options = options; this.messages = []; this.terminated = false; workers.push(this); }
    postMessage(m) { this.messages.push(m); }
    terminate() { this.terminated = true; }
    reply(data) { this.onmessage({ data }); }
  }
  const env = {
    Worker: FakeWorker, Blob, WebAssembly: {}, navigator: {},
    URL: { createObjectURL: () => 'blob:' + (++urls.created), revokeObjectURL: () => urls.revoked++ }
  };
  const progress = [];
  const runner = L.createRunner({ env, onProgress: (key, suffix = '') => progress.push(key + suffix) });
  const cpu = L.buildLocalRequest('wasm', 'onnx-community/Qwen3-0.6B-ONNX', 'sys', 'in');

  let pending = runner.request(cpu);
  const w1 = workers[0];
  assert.equal(w1.options.type, 'classic');
  assert.equal(w1.messages[0].device, 'wasm');
  assert.equal(w1.messages[0].files, undefined, 'no local files: online preset');
  w1.reply({ type: 'progress', progress: 0.5 });
  await assert.rejects(runner.request(cpu), /already running/);
  w1.reply({ type: 'result', response: { choices: [] } });
  assert.deepEqual(await pending, { choices: [] });
  assert(progress.includes('Loading browser model: 50%') && progress.includes('Browser model ready.'));

  // Same model reuses the worker; error codes map to messages and release the worker.
  pending = runner.request(cpu);
  assert.equal(workers.length, 1);
  w1.reply({ type: 'error', code: 'memory' });
  await assert.rejects(pending, /ran out of memory/);
  assert(w1.terminated);
  assert.equal(urls.revoked, 1);

  // Abort terminates the worker and revokes its Blob URL.
  const controller = new AbortController();
  pending = runner.request(cpu, controller.signal);
  controller.abort();
  await assert.rejects(pending, e => e.name === 'AbortError');
  assert(workers[1].terminated);
  assert.equal(urls.revoked, urls.created);

  // A different model or bundle revision gets a fresh worker; files are sent only for the matching model.
  await assert.rejects(runner.request(L.buildLocalRequest('wasm', 'custom-local', 's', 'i')), /Choose a custom model folder/);
  const bundle = runner.setBundle({ model: 'custom-local', entries: onnx, format: 'onnx', dtype: 'q4', mergeSystem: true, name: 'M' });
  const firstRevision = bundle.revision;
  await assert.rejects(runner.request(cpu), /belong to another model/);
  pending = runner.request(L.buildLocalRequest('wasm', 'custom-local', 's', 'i'));
  const w3 = workers.at(-1);
  assert.equal(w3.messages[0].files, onnx);
  assert.deepEqual(w3.messages[0].custom, { format: 'onnx', dtype: 'q4', library: undefined, mergeSystem: true });
  w3.reply({ type: 'result', response: {} });
  await pending;
  runner.setDtype('q8');
  assert(w3.terminated, 'changing the ONNX weight format restarts the model');
  assert(runner.bundle.revision > firstRevision);
  assert.equal(runner.bundle.dtype, 'q8');
  runner.setBundle(null);
  assert.equal(runner.bundle, null);

  // Capability checks.
  await assert.rejects(runner.request(L.buildLocalRequest('webllm', 'Qwen3-0.6B-q4f16_1-MLC', 's', 'i')), /WebGPU is unavailable/);
  const gpuRunner = L.createRunner({ env: { ...env, navigator: { gpu: {} } } });
  pending = gpuRunner.request(L.buildLocalRequest('webllm', 'Qwen3-0.6B-q4f16_1-MLC', 's', 'i'));
  const gpuWorker = workers.at(-1);
  assert.equal(gpuWorker.options.type, 'module');
  gpuWorker.onerror();
  await assert.rejects(pending, /Browser model worker failed/);
  await assert.rejects(L.createRunner({ env: { ...env, Worker: undefined } }).request(cpu), /workers are unavailable/);

  // Worker sources keep Report Studio's offline guarantees for local folders.
  assert.match(L.CPU_WORKER_SOURCE, /Model network downloads disabled/);
  assert.match(L.CPU_WORKER_SOURCE, /transformers@3\.8\.1/);
  assert.match(L.CPU_WORKER_SOURCE, /transformers@4\.3\.0/);
  assert.match(L.BROWSER_WORKER_SOURCE, /web-llm@0\.2\.85/);
  console.log('Lokale Modelle: Ordnerprüfung, eigene ONNX/MLC-Modelle, Worker-Auswahl, Lebenszyklus, Abbruch, Fehlercodes, Fähigkeitsprüfung bestanden.');
})().catch(error => { console.error(error); process.exit(1); });
