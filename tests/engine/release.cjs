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
const appImageName = `befundungstool-v${version}-linux-x86_64.AppImage`;
assert(!fs.existsSync(path.join(out, exeName)), 'no desktop package without --desktop');

// --desktop: the freshly built packages (synthetic stand-ins for electron-builder) are copied and checksummed.
const builds = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-desktop-build-'));
const fakes = [[exeName, 'MZ synthetic portable exe'], [appImageName, 'ELF synthetic AppImage']].map(([name, body]) => { fs.writeFileSync(path.join(builds, name), body); return path.join(builds, name); });
const built = [];
const desktop = R.release(out, { desktop: true, buildDesktop: v => { built.push(v); return fakes; } });
assert.deepEqual(built, [version], 'desktop build runs once for this version');
assert(desktop.outputs.includes(exeName) && desktop.outputs.includes(appImageName));
for (const fake of fakes) assert(fs.readFileSync(path.join(out, path.basename(fake))).equals(fs.readFileSync(fake)));
const sums = fs.readFileSync(path.join(out, 'SHA256SUMS.txt'), 'utf8').trim().split('\n').map(line => line.split(/\s+/));
assert.deepEqual(sums.map(([, name]) => name), [zipName, `befundungstool-v${version}.html`, exeName, appImageName]);
assert.equal(sums[3][0], crypto.createHash('sha256').update(fs.readFileSync(fakes[1])).digest('hex'));
const strange = path.join(builds, 'Befundungstool Setup.exe');
fs.writeFileSync(strange, 'x');
assert.throws(() => R.release(out, { desktop: true, buildDesktop: () => [strange] }), /Unexpected desktop package name/);

// A later release without --desktop removes the now outdated packages instead of leaving them unlisted.
R.release(out);
assert(!fs.existsSync(path.join(out, exeName)) && !fs.existsSync(path.join(out, appImageName)), 'stale packages removed');
assert(!/\.(exe|AppImage)/.test(fs.readFileSync(path.join(out, 'SHA256SUMS.txt'), 'utf8')));
fs.rmSync(out, { recursive: true, force: true });
fs.rmSync(builds, { recursive: true, force: true });
console.log('Release: ZIP-Rundlauf, Positivliste, Prüfsummen, Versionsabgleich und Desktop-Pakete bestanden.');
