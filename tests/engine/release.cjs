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
console.log('Release: ZIP-Rundlauf, Positivliste, Prüfsummen und Versionsabgleich bestanden.');
