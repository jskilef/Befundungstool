'use strict';
// GGUF virtual splitting (byte-exact shards in llama-gguf-split layout) and the wllama runner with a fake runtime.
const assert = require('node:assert/strict');
const G = require('../../src/ai/gguf.js');
const { buildGguf, readGguf } = require('../helpers/gguf.cjs');

(async () => {
  const sizes = [700, 300, 1200, 50, 900, 400];
  const original = buildGguf({ tensors: sizes.map((size, i) => ({ name: 'blk.' + i + '.weight', size })) });
  const blob = new Blob([original]);
  const info = await G.parse(blob);
  assert.equal(info.tensors.length, 6);
  assert.equal(info.alignment, 32);
  assert.equal(info.kvs.get('general.architecture'), 'synthetic');

  // Small files stay whole.
  assert.equal((await G.split(blob)).length, 1);

  // Split with a 1500-byte budget: every shard is a valid GGUF with split keys; tensor bytes are identical.
  const shards = await G.split(blob, { maxBytes: 1500 });
  assert(shards.length >= 3);
  const ref = readGguf(original);
  const seen = [];
  for (const [index, shard] of shards.entries()) {
    const buf = Buffer.from(await shard.arrayBuffer());
    const h = readGguf(buf);
    assert.equal(h.kv['split.no'], index);
    assert.equal(h.kv['split.count'], shards.length);
    assert.equal(h.kv['split.tensors.count'], 6);
    assert.equal(h.kv['general.alignment'], 32);
    if (index === 0) assert.deepEqual(h.kv['tokenizer.ggml.tokens'], ['<s>', '</s>', 'Befund'], 'first shard keeps all metadata');
    else assert.equal(h.kv['general.architecture'], undefined);
    assert.equal(h.dataStart % 32, 0);
    for (const t of h.tensors) {
      const o = ref.tensors.find(x => x.name === t.name);
      const size = sizes[ref.tensors.indexOf(o)];
      assert.equal(t.offset % 32, 0);
      assert(buf.subarray(h.dataStart + t.offset, h.dataStart + t.offset + size).equals(original.subarray(ref.dataStart + o.offset, ref.dataStart + o.offset + size)), t.name + ' bytes');
      seen.push(t.name);
    }
  }
  assert.deepEqual(seen, ref.tensors.map(t => t.name), 'every tensor exactly once, in order');
  assert.equal(G.shardName('model', 0, 6), 'model-00001-of-00006.gguf');

  await assert.rejects(G.parse(new Blob([Buffer.from('NOTGGUF....')])), /Not a GGUF file/);
  await assert.rejects(G.parse(new Blob([original.subarray(0, 40)])), /Invalid GGUF file/);

  // Runner with a fake wllama module.
  const calls = [];
  class FakeWllama {
    constructor(paths) { calls.push(['new', paths.default]); }
    isSupportWebGPU() { return false; }
    async loadModel(files, params) { calls.push(['load', files.map(f => f.name), params.n_ctx]); }
    async createChatCompletion(options) { calls.push(['chat', options]); return { choices: [{ finish_reason: 'stop', message: { content: '{}' } }] }; }
    async exit() { calls.push(['exit']); }
  }
  const progress = [];
  const runner = G.createRunner({ importer: async url => { calls.push(['import', url]); return { Wllama: FakeWllama }; }, onProgress: (k, s = '') => progress.push(k + s) });
  await assert.rejects(runner.request([]), /Choose a GGUF model file/);
  const file = new File([original], 'radgen-synthetic-Q4_K_M.gguf', { lastModified: 1 });
  runner.setFile(file);
  const schema = { type: 'object' };
  await runner.request([{ role: 'user', content: 'x' }], { schema });
  assert.equal(calls[0][1], 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/index.js');
  assert.equal(calls[1][1], 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/wasm/wllama.wasm');
  assert.deepEqual(calls[2], ['load', ['model-00001-of-00001.gguf'], 8192]);
  assert.deepEqual(calls[3][1].response_format.json_schema.schema, schema);
  assert.equal(calls[3][1].max_tokens, 4096, 'short prompt: full output budget');
  assert.equal(calls[3][1].penalty_repeat, 1.1);
  assert.equal(calls[2][2], 8192, 'context');
  assert(progress.includes('Browser model ready. (CPU)'));
  // Long prompts shrink the output budget so prompt + answer fit the context.
  await runner.request([{ role: 'user', content: 'x'.repeat(15000) }]);
  assert.equal(calls.at(-1)[1].max_tokens, 8192 - Math.ceil(15000 / 3) - 64 - 128);
  // Same file: no reload. Different file: unload and reload.
  await runner.request([{ role: 'user', content: 'y' }]);
  assert.equal(calls.filter(c => c[0] === 'load').length, 1);
  assert.equal(calls.at(-1)[1].response_format, undefined);
  runner.setFile(new File([original], 'other.gguf', { lastModified: 2 }));
  await runner.request([{ role: 'user', content: 'z' }]);
  assert.equal(calls.filter(c => c[0] === 'load').length, 2);
  assert(calls.some(c => c[0] === 'exit'));

  // Abort unloads; load failures give a clear message.
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runner.request([], { signal: controller.signal }), e => e.name === 'AbortError');
  const failing = G.createRunner({ importer: async () => ({ Wllama: class extends FakeWllama { async loadModel() { throw new Error('unknown model architecture: xyz'); } } }) });
  failing.setFile(file);
  await assert.rejects(failing.request([]), /architecture may not be supported/);
  const offline = G.createRunner({ importer: async () => { throw new TypeError('Failed to fetch'); } });
  offline.setFile(file);
  await assert.rejects(offline.request([]), /could not load from jsDelivr/);
  // Audit A03: abort, unload or a file change while a model is loading leaves nothing behind.
  function controllable() {
    const log = { loads: [], exits: 0, chats: 0 };
    let releaseLoad;
    class SlowWllama {
      constructor() { this.name = null; }
      isSupportWebGPU() { return false; }
      async loadModel(files) { log.loads.push(files.length); await new Promise(r => { releaseLoad = r; }); }
      async createChatCompletion() { log.chats++; return { choices: [{ finish_reason: 'stop', message: { content: '{}' } }] }; }
      async exit() { log.exits++; }
    }
    const r = G.createRunner({ importer: async () => ({ Wllama: SlowWllama }) });
    const waitLoading = async () => { while (!releaseLoad) await new Promise(res => setTimeout(res, 5)); };
    return { r, log, waitLoading, finish: () => releaseLoad() };
  }
  const fileA = new File([original], 'a.gguf', { lastModified: 10 });
  const fileB = new File([original], 'b.gguf', { lastModified: 20 });
  {
    const { r, log, waitLoading, finish } = controllable();
    r.setFile(fileA);
    const c = new AbortController();
    const pending = r.request([{ role: 'user', content: 'x' }], { signal: c.signal });
    await waitLoading();
    c.abort();
    finish();
    await assert.rejects(pending, e => e.name === 'AbortError');
    assert.equal(r.loaded, false, 'abort during load: nothing loaded');
    assert.equal(log.exits, 1, 'loading instance disposed once');
    assert.equal(log.chats, 0);
  }
  {
    const { r, log, waitLoading, finish } = controllable();
    r.setFile(fileA);
    const pending = r.request([{ role: 'user', content: 'x' }]);
    await waitLoading();
    r.stop();
    finish();
    await assert.rejects(pending, new RegExp(G.SUPERSEDED.slice(0, 40)));
    assert.equal(r.loaded, false, 'unload during load: nothing loaded');
    assert.equal(log.chats, 0, 'no generation after unload');
    assert.equal(log.exits, 1);
  }
  {
    const { r, log, waitLoading, finish } = controllable();
    r.setFile(fileA);
    const pending = r.request([{ role: 'user', content: 'x' }]);
    await waitLoading();
    r.setFile(fileB);
    finish();
    await assert.rejects(pending, /unloaded or changed/);
    assert.equal(r.loaded, false, 'A never becomes current after switching to B');
    assert.equal(log.exits, 1);
    assert.equal(r.file, fileB);
  }
  console.log('GGUF: Kopfzeile, virtuelle Teilung (bytegenau, llama-gguf-split-Format), Runner mit Laden/Wiederverwenden/Abbruch/Fehlern bestanden.');
})().catch(error => { console.error(error); process.exit(1); });
