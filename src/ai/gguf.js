/* GGUF reader and virtual splitter for in-browser llama.cpp (wllama).
   wllama cannot load files over 2 GB (Emscripten file size limit). Instead of asking users to run
   llama-gguf-split, the app builds split shards as Blobs: a new header plus slices of the original
   file, without copying tensor data. The shard layout matches llama-gguf-split: the first shard
   carries all metadata, every shard carries split.no / split.count / split.tensors.count.
   Format reference: GGUF v2/v3 (magic "GGUF", little-endian). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AiGguf = api;
})(globalThis, function () {
  'use strict';

  const MAGIC = 0x46554747; // "GGUF" little-endian
  const TYPE = { UINT8: 0, INT8: 1, UINT16: 2, INT16: 3, UINT32: 4, INT32: 5, FLOAT32: 6, BOOL: 7, STRING: 8, ARRAY: 9, UINT64: 10, INT64: 11, FLOAT64: 12 };
  const FIXED_SIZE = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 };
  const DEFAULT_ALIGNMENT = 32;
  const DEFAULT_SHARD_BYTES = 512 * 1024 * 1024; // wllama recommends ≤ 512 MB per file
  const MAX_HEADER_BYTES = 256 * 1024 * 1024;

  class NeedMore extends Error {}

  function reader(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let pos = 0;
    const need = n => { if (pos + n > bytes.byteLength) throw new NeedMore(); };
    const r = {
      get pos() { return pos; },
      u32() { need(4); const v = view.getUint32(pos, true); pos += 4; return v; },
      u64() { need(8); const v = view.getBigUint64(pos, true); pos += 8; if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Invalid GGUF file'); return Number(v); },
      skip(n) { need(n); pos += n; },
      string() { const n = r.u64(); need(n); const s = new TextDecoder().decode(bytes.subarray(pos, pos + n)); pos += n; return s; },
      value(type) {
        if (FIXED_SIZE[type] !== undefined) {
          need(FIXED_SIZE[type]);
          const v = type === TYPE.UINT32 ? view.getUint32(pos, true) : type === TYPE.UINT16 ? view.getUint16(pos, true) : type === TYPE.INT32 ? view.getInt32(pos, true) : null;
          pos += FIXED_SIZE[type];
          return v;
        }
        if (type === TYPE.STRING) return r.string();
        if (type === TYPE.ARRAY) {
          const itemType = r.u32(), count = r.u64();
          if (FIXED_SIZE[itemType] !== undefined) r.skip(FIXED_SIZE[itemType] * count);
          else for (let i = 0; i < count; i++) r.value(itemType);
          return null;
        }
        throw new Error('Invalid GGUF file');
      }
    };
    return r;
  }

  // Parses the header of a GGUF Blob/File. Returns byte ranges needed to build shards.
  async function parse(blob) {
    let size = Math.min(blob.size, 8 * 1024 * 1024);
    for (;;) {
      const bytes = new Uint8Array(await blob.slice(0, size).arrayBuffer());
      try { return parseBytes(bytes, blob.size); } catch (error) {
        if (!(error instanceof NeedMore) || size >= blob.size || size >= MAX_HEADER_BYTES) throw error instanceof NeedMore ? new Error('Invalid GGUF file') : error;
        size = Math.min(blob.size, size * 4, MAX_HEADER_BYTES);
      }
    }
  }

  function parseBytes(bytes, fileSize) {
    const r = reader(bytes);
    if (r.u32() !== MAGIC) throw new Error('Not a GGUF file');
    const version = r.u32();
    if (version < 2 || version > 3) throw new Error('Unsupported GGUF version');
    const tensorCount = r.u64(), kvCount = r.u64();
    const kvStart = r.pos, kvs = new Map();
    let alignment = DEFAULT_ALIGNMENT, alignmentRange = null;
    for (let i = 0; i < kvCount; i++) {
      const start = r.pos, key = r.string(), type = r.u32(), value = r.value(type);
      if (key === 'general.alignment' && type === TYPE.UINT32 && value > 0) { alignment = value; alignmentRange = [start, r.pos]; }
      if (key.startsWith('split.')) throw new Error('This GGUF file is already split. Select the first part instead.');
      if (type === TYPE.STRING || (FIXED_SIZE[type] !== undefined && value !== null)) kvs.set(key, value);
    }
    const kvEnd = r.pos, tensors = [];
    for (let i = 0; i < tensorCount; i++) {
      const start = r.pos, name = r.string(), dims = r.u32();
      r.skip(8 * dims);
      r.u32(); // ggml type
      const offsetPos = r.pos, offset = r.u64();
      tensors.push({ name, start, end: r.pos, offsetPos, offset });
    }
    const dataStart = Math.ceil(r.pos / alignment) * alignment;
    for (let i = 1; i < tensors.length; i++) if (tensors[i].offset < tensors[i - 1].offset) throw new Error('Unsupported GGUF tensor order');
    return { version, alignment, alignmentRange, kvStart, kvEnd, kvCount, kvs, tensors, dataStart, fileSize, header: bytes.subarray(0, r.pos) };
  }

  // Greedy grouping of consecutive tensors so each shard's tensor data stays under maxBytes.
  function plan(info, maxBytes = DEFAULT_SHARD_BYTES) {
    const dataSize = info.fileSize - info.dataStart;
    const end = i => (i + 1 < info.tensors.length ? info.tensors[i + 1].offset : dataSize);
    const groups = [];
    let first = 0;
    for (let i = 0; i < info.tensors.length; i++) {
      if (i > first && end(i) - info.tensors[first].offset > maxBytes) { groups.push([first, i - 1]); first = i; }
    }
    if (info.tensors.length) groups.push([first, info.tensors.length - 1]);
    return groups.map(([a, b]) => ({ first: a, last: b, from: info.tensors[a].offset, to: end(b) }));
  }

  function kvBytes(key, type, write) {
    const k = new TextEncoder().encode(key);
    const out = new Uint8Array(8 + k.length + 4 + (type === TYPE.UINT16 ? 2 : 4));
    const v = new DataView(out.buffer);
    v.setBigUint64(0, BigInt(k.length), true); out.set(k, 8);
    v.setUint32(8 + k.length, type, true);
    write(v, 12 + k.length);
    return out;
  }

  // Returns shard Blobs; files at or below maxBytes are returned unchanged.
  async function split(blob, { maxBytes = DEFAULT_SHARD_BYTES } = {}) {
    if (blob.size <= maxBytes) return [blob];
    const info = await parse(blob);
    const groups = plan(info, maxBytes);
    if (groups.length < 2) return [blob];
    return groups.map((g, index) => {
      const n = g.last - g.first + 1;
      const splitKvs = [
        kvBytes('split.no', TYPE.UINT16, (v, o) => v.setUint16(o, index, true)),
        kvBytes('split.count', TYPE.UINT16, (v, o) => v.setUint16(o, groups.length, true)),
        kvBytes('split.tensors.count', TYPE.INT32, (v, o) => v.setInt32(o, info.tensors.length, true))
      ];
      const base = index === 0 ? [info.header.subarray(info.kvStart, info.kvEnd)] : info.alignmentRange ? [info.header.subarray(...info.alignmentRange)] : [];
      const kvCount = (index === 0 ? info.kvCount : info.alignmentRange ? 1 : 0) + splitKvs.length;
      const fixed = new Uint8Array(24);
      const fv = new DataView(fixed.buffer);
      fv.setUint32(0, MAGIC, true); fv.setUint32(4, info.version, true);
      fv.setBigUint64(8, BigInt(n), true); fv.setBigUint64(16, BigInt(kvCount), true);
      const infos = [];
      for (let i = g.first; i <= g.last; i++) {
        const t = info.tensors[i];
        const copy = info.header.slice(t.start, t.end);
        new DataView(copy.buffer).setBigUint64(t.offsetPos - t.start, BigInt(t.offset - g.from), true);
        infos.push(copy);
      }
      const headerLength = [fixed, ...base, ...splitKvs, ...infos].reduce((sum, part) => sum + part.length, 0);
      const padding = new Uint8Array(Math.ceil(headerLength / info.alignment) * info.alignment - headerLength);
      return new Blob([fixed, ...base, ...splitKvs, ...infos, padding, blob.slice(info.dataStart + g.from, info.dataStart + g.to)]);
    });
  }

  // llama.cpp finds the other parts by this file name pattern.
  function shardName(prefix, index, count) {
    const pad = x => String(x).padStart(5, '0');
    return `${prefix}-${pad(index + 1)}-of-${pad(count)}.gguf`;
  }

  /* In-browser llama.cpp runtime (wllama, MIT). Loaded lazily from jsDelivr at a pinned version;
     the model file stays on this device. WebGPU is used automatically when available, otherwise CPU
     (multi-threaded only when the page is cross-origin isolated, e.g. through the local launcher). */
  const WLLAMA_VERSION = '3.8.1';
  const WLLAMA_BASE = `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_VERSION}/esm/`;
  const CONTEXT_TOKENS = 4096;

  function abortError() {
    const e = new Error('Cancelled');
    e.name = 'AbortError';
    return e;
  }

  // importer and FileImpl are injectable for tests.
  function createRunner({ onProgress = () => {}, importer = url => import(url), FileImpl = globalThis.File } = {}) {
    let wllama = null, loadedKey = null, file = null, busy = false;
    const keyOf = f => (f ? [f.name, f.size, f.lastModified].join(':') : null);

    async function release() {
      const current = wllama;
      wllama = null;
      loadedKey = null;
      if (current) { try { await current.exit(); } catch { /* worker already gone */ } }
    }

    async function ensureLoaded() {
      if (!file) throw new Error('Choose a GGUF model file.');
      if (wllama && loadedKey === keyOf(file)) return wllama;
      await release();
      onProgress('Loading browser model:', ' ' + file.name);
      let lib;
      try { lib = await importer(WLLAMA_BASE + 'index.js'); } catch {
        throw new Error('The llama.cpp browser runtime could not load from jsDelivr. Check network access or workplace download restrictions.');
      }
      const instance = new lib.Wllama({ default: WLLAMA_BASE + 'wasm/wllama.wasm' }, { suppressNativeLog: true });
      const shards = await split(file);
      const files = shards.map((blob, i) => new FileImpl([blob], shardName('model', i, shards.length)));
      try {
        await instance.loadModel(files, { n_ctx: CONTEXT_TOKENS });
      } catch (error) {
        try { await instance.exit(); } catch { /* ignore */ }
        const message = String(error?.message || '');
        throw new Error(/memory|alloc/i.test(message)
          ? 'The model does not fit into browser memory. Close other tabs or choose a smaller model.'
          : 'The browser runtime could not load this model. Its architecture may not be supported yet; LM Studio can still run it.');
      }
      wllama = instance;
      loadedKey = keyOf(file);
      return instance;
    }

    async function request(messages, { schema, signal, maxTokens = 1024 } = {}) {
      if (busy) throw new Error('A browser model request is already running.');
      if (signal?.aborted) throw abortError();
      busy = true;
      const abort = () => { release(); onProgress('Browser model unloaded.'); };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        const instance = await ensureLoaded();
        if (signal?.aborted) throw abortError();
        onProgress('Generating locally…');
        const response = await instance.createChatCompletion({
          messages, max_tokens: maxTokens, temperature: 0.2,
          ...(schema ? { response_format: { type: 'json_schema', json_schema: { name: 'befundungstool_result', strict: true, schema } } } : {})
        });
        if (signal?.aborted) throw abortError();
        onProgress('Browser model ready.', instance.isSupportWebGPU?.() ? ' (WebGPU)' : ' (CPU)');
        return response;
      } catch (error) {
        if (signal?.aborted) throw abortError();
        throw error;
      } finally {
        busy = false;
        signal?.removeEventListener('abort', abort);
      }
    }

    return {
      // A different file unloads the current model; the same file keeps it loaded.
      setFile(next) { if (keyOf(next) !== keyOf(file)) { file = next || null; release(); } },
      get file() { return file; },
      get loaded() { return !!wllama; },
      request,
      stop() { release(); onProgress('Browser model unloaded.'); }
    };
  }

  return { TYPE, DEFAULT_SHARD_BYTES, WLLAMA_VERSION, parse, plan, split, shardName, createRunner };
});
