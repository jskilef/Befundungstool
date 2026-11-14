'use strict';
// Builds small synthetic GGUF v3 files and reads GGUF headers independently of src/ai/gguf.js.

function str(s) {
  const b = Buffer.from(s, 'utf8');
  const len = Buffer.alloc(8);
  len.writeBigUInt64LE(BigInt(b.length));
  return Buffer.concat([len, b]);
}
const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
const u64 = v => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); return b; };

// tensors: [{ name, size }] → data filled with a byte pattern per tensor; offsets aligned like llama.cpp.
function buildGguf({ tensors, alignment = 32, vocab = ['<s>', '</s>', 'Befund'], arch = 'synthetic' }) {
  const kvs = [
    Buffer.concat([str('general.architecture'), u32(8), str(arch)]),
    Buffer.concat([str('general.alignment'), u32(4), u32(alignment)]),
    Buffer.concat([str('tokenizer.ggml.tokens'), u32(9), u32(8), u64(vocab.length), ...vocab.map(str)]),
    Buffer.concat([str('synthetic.scores'), u32(9), u32(6), u64(3), Buffer.alloc(12)])
  ];
  let offset = 0;
  const infos = [], datas = [];
  tensors.forEach((t, i) => {
    infos.push(Buffer.concat([str(t.name), u32(1), u64(t.size), u32(0), u64(offset)]));
    const data = Buffer.alloc(Math.ceil(t.size / alignment) * alignment);
    data.fill(i + 1, 0, t.size);
    datas.push(data);
    offset += data.length;
  });
  const head = Buffer.concat([Buffer.from('GGUF'), u32(3), u64(tensors.length), u64(kvs.length), ...kvs, ...infos]);
  const pad = Buffer.alloc(Math.ceil(head.length / alignment) * alignment - head.length);
  return Buffer.concat([head, pad, ...datas]);
}

// Minimal independent reader: returns kv values (scalars/strings), tensors and data start.
function readGguf(buf) {
  let p = 0;
  const r32 = () => { const v = buf.readUInt32LE(p); p += 4; return v; };
  const r64 = () => { const v = Number(buf.readBigUInt64LE(p)); p += 8; return v; };
  const rs = () => { const n = r64(); const s = buf.toString('utf8', p, p + n); p += n; return s; };
  const size = { 0: 1, 1: 1, 2: 2, 3: 2, 4: 4, 5: 4, 6: 4, 7: 1, 10: 8, 11: 8, 12: 8 };
  const val = type => {
    if (type === 2) { const v = buf.readUInt16LE(p); p += 2; return v; }
    if (type === 4) return r32();
    if (type === 5) { const v = buf.readInt32LE(p); p += 4; return v; }
    if (size[type]) { p += size[type]; return null; }
    if (type === 8) return rs();
    if (type === 9) { const it = r32(), n = r64(); const out = []; for (let i = 0; i < n; i++) out.push(val(it)); return out; }
    throw new Error('bad type ' + type);
  };
  if (buf.toString('ascii', 0, 4) !== 'GGUF') throw new Error('bad magic');
  p = 4; const version = r32(), nt = r64(), nk = r64();
  const kv = {};
  for (let i = 0; i < nk; i++) { const k = rs(), t = r32(); kv[k] = val(t); }
  const tensors = [];
  for (let i = 0; i < nt; i++) { const name = rs(), dims = r32(); for (let d = 0; d < dims; d++) r64(); const type = r32(), offset = r64(); tensors.push({ name, type, offset }); }
  const alignment = kv['general.alignment'] || 32;
  return { version, kv, tensors, dataStart: Math.ceil(p / alignment) * alignment };
}

module.exports = { buildGguf, readGguf };
