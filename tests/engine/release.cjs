'use strict';
// Release packaging: allow-list, archive integrity, checksums, version alignment.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const R = require('../../scripts/release.cjs');

assert.equal(R.crc32(Buffer.from('123456789')).toString(16), 'cbf43926');
const roundTrip = R.unzip(R.zip([['a.txt', Buffer.from('Synthetischer Inhalt äöü')], ['dir/b.bin', Buffer.alloc(5000, 7)]]));
assert.equal(roundTrip.get('a.txt').toString(), 'Synthetischer Inhalt äöü');
assert.equal(roundTrip.get('dir/b.bin').length, 5000);

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-release-'));
const result = R.release(out);
const version = fs.readFileSync(path.join(__dirname, '../../VERSION'), 'utf8').trim();
assert.equal(result.version, version);
const zipName = `befundungstool-v${version}.zip`;
const files = R.unzip(fs.readFileSync(path.join(out, zipName)));
for (const required of ['befundungstool.html', 'local-server.cjs', 'manifest.webmanifest', 'icons/icon-192.png', 'LICENSE', 'CLINICAL_NOTICE.md', 'THIRD_PARTY_NOTICES.md', 'licenses/SOURCES.json']) {
  assert(files.has(required), 'missing ' + required);
}
assert(![...files.keys()].some(name => /^(src|tests|node_modules|\.playwright-browsers)\//.test(name)), 'only allow-listed files');
for (const line of fs.readFileSync(path.join(out, 'SHA256SUMS.txt'), 'utf8').trim().split('\n')) {
  const [hash, name] = line.split(/\s+/);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(out, name))).digest('hex'), hash, name);
}
assert(files.get('befundungstool.html').toString().includes(`content="${version}"`));
const exeName = `befundungstool-v${version}-windows-portable.exe`;
assert(!fs.existsSync(path.join(out, exeName)), 'no desktop exe without --desktop');

// --desktop: the freshly built exe (synthetic stand-in for electron-builder here) is copied and checksummed.
const fakeExe = path.join(out, 'synthetic-build.exe');
fs.writeFileSync(fakeExe, Buffer.from('MZ synthetic portable exe'));
const built = [];
const desktop = R.release(out, { desktop: true, buildDesktop: v => { built.push(v); return fakeExe; } });
assert.deepEqual(built, [version], 'desktop build runs once for this version');
assert(desktop.outputs.includes(exeName));
assert(fs.readFileSync(path.join(out, exeName)).equals(fs.readFileSync(fakeExe)));
const sums = fs.readFileSync(path.join(out, 'SHA256SUMS.txt'), 'utf8').trim().split('\n').map(line => line.split(/\s+/));
assert.deepEqual(sums.map(([, name]) => name), [zipName, `befundungstool-v${version}.html`, exeName]);
assert.equal(sums[2][0], crypto.createHash('sha256').update(fs.readFileSync(fakeExe)).digest('hex'));

// A later release without --desktop removes the now outdated exe instead of leaving it unlisted.
R.release(out);
assert(!fs.existsSync(path.join(out, exeName)), 'stale exe removed');
assert(!fs.readFileSync(path.join(out, 'SHA256SUMS.txt'), 'utf8').includes('.exe'));
fs.rmSync(out, { recursive: true, force: true });
console.log('Release: ZIP-Rundlauf, Positivliste, Prüfsummen, Versionsabgleich und Desktop-Exe bestanden.');
