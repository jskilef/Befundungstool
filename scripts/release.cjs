'use strict';
// Builds dist/release/: befundungstool-v<VERSION>.zip (explicit allow-list), the standalone HTML,
// and SHA256SUMS.txt. Node built-ins only. Usage: node scripts/release.cjs [outDir]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { build } = require('./build.cjs');

const root = path.join(__dirname, '..');

// [path in archive, source path]. Adding a source file does not add it to the release.
function releaseFiles() {
  const list = [
    ['befundungstool.html', 'dist/befundungstool.html'],
    ['index.html', 'dist/index.html'],
    ['manifest.webmanifest', 'dist/manifest.webmanifest'],
    ['coi-sw.js', 'dist/coi-sw.js'],
    ['icons/icon-192.png', 'dist/icons/icon-192.png'],
    ['icons/icon-512.png', 'dist/icons/icon-512.png'],
    ['local-server.cjs', 'server/local-server.cjs'],
    ['README.md', 'README.md'],
    ['CHANGELOG.md', 'CHANGELOG.md'],
    ['LICENSE', 'LICENSE'],
    ['CLINICAL_NOTICE.md', 'CLINICAL_NOTICE.md'],
    ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
    ['VERSION', 'VERSION'],
    ['docs/MODEL_DOWNLOADS.md', 'docs/MODEL_DOWNLOADS.md'],
    ['docs/radnote/TERMINOLOGY.md', 'docs/radnote/TERMINOLOGY.md'],
    ['docs/radnote/FLUENCY_DIRECT.md', 'docs/radnote/FLUENCY_DIRECT.md']
  ];
  for (const name of fs.readdirSync(path.join(root, 'licenses')).sort()) list.push(['licenses/' + name, 'licenses/' + name]);
  return list;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Minimal ZIP (deflate, fixed timestamp for reproducible archives).
function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  const dosTime = 0, dosDate = (2026 - 1980) << 9 | 1 << 5 | 1;
  for (const [name, data] of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10); central.writeUInt16LE(dosTime, 12); central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, compressed);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + compressed.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// Reads names and contents back from the archive (verification and tests).
function unzip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  let p = buffer.readUInt32LE(end + 16);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    const size = buffer.readUInt32LE(p + 20), nameLength = buffer.readUInt16LE(p + 28), local = buffer.readUInt32LE(p + 42);
    const name = buffer.toString('utf8', p + 46, p + 46 + nameLength);
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const data = zlib.inflateRawSync(buffer.subarray(dataStart, dataStart + size));
    if (crc32(data) !== buffer.readUInt32LE(p + 16)) throw new Error('CRC mismatch: ' + name);
    out.set(name, data);
    p += 46 + nameLength + buffer.readUInt16LE(p + 30) + buffer.readUInt16LE(p + 32);
  }
  return out;
}

function release(outDir = path.join(root, 'dist', 'release')) {
  const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.version !== version) throw new Error(`VERSION ${version} does not match package.json ${pkg.version}`);
  build();
  const html = fs.readFileSync(path.join(root, 'dist', 'befundungstool.html'), 'utf8');
  if (!html.includes(`<meta name="application-version" content="${version}">`) || !html.includes(`>v${version}</span>`)) {
    throw new Error('The app version in src/app.html does not match VERSION');
  }
  const entries = releaseFiles().map(([name, source]) => [name, fs.readFileSync(path.join(root, source))]);
  const archive = zip(entries);
  const check = unzip(archive);
  if (check.size !== entries.length || entries.some(([name, data]) => !check.get(name)?.equals(data))) throw new Error('Archive verification failed');

  fs.mkdirSync(outDir, { recursive: true });
  const outputs = {
    [`befundungstool-v${version}.zip`]: archive,
    [`befundungstool-v${version}.html`]: Buffer.from(html)
  };
  const sums = [];
  for (const [name, data] of Object.entries(outputs)) {
    fs.writeFileSync(path.join(outDir, name), data);
    sums.push(crypto.createHash('sha256').update(data).digest('hex') + '  ' + name);
  }
  fs.writeFileSync(path.join(outDir, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
  return { version, outDir, files: entries.map(([name]) => name), outputs: Object.keys(outputs) };
}

if (require.main === module) {
  const result = release(process.argv[2] && path.resolve(process.argv[2]));
  console.log(`Release ${result.version}: ${result.files.length} files -> ${path.relative(root, result.outDir)} (${result.outputs.join(', ')}, SHA256SUMS.txt)`);
}

module.exports = { release, releaseFiles, zip, unzip, crc32 };
