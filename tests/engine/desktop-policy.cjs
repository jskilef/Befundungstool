'use strict';
// Desktop app rules that need no Electron: origin, external links, permissions, GPU switches, packaging list.
const assert = require('node:assert/strict');
const policy = require('../../desktop/policy.cjs');
const gpu = require('../../desktop/gpu.cjs');
const pkg = require('../../package.json');

const origin = policy.appOrigin(policy.DEFAULT_PORT);
assert.equal(origin, 'http://127.0.0.1:8790', 'fixed desktop origin, separate from the npm start launcher (8788)');

assert(policy.isAppUrl(origin + '/', origin));
assert(policy.isAppUrl(origin + '/api', origin));
for (const url of ['http://127.0.0.1:8788/', 'http://localhost:8790/', 'https://127.0.0.1:8790/', 'file:///C:/x.html', 'not a url', '', undefined]) {
  assert(!policy.isAppUrl(url, origin), 'not the app: ' + url);
}

assert(policy.isExternalLink('https://example.org/docs'));
for (const url of ['http://example.org/', 'file:///C:/Windows/win.ini', 'javascript:alert(1)', 'ms-settings:privacy', 'https://user:pass@example.org/', 'mailto:a@example.org', '']) {
  assert(!policy.isExternalLink(url), 'never opened externally: ' + url);
}

const at = (url, extra = {}) => ({ origin, requestingUrl: url, ...extra });
assert(policy.allowPermission('media', at(origin + '/', { mediaTypes: ['audio'] })), 'microphone for the app');
assert(!policy.allowPermission('media', at(origin + '/', { mediaTypes: ['video'] })), 'no camera');
assert(!policy.allowPermission('media', at(origin + '/', { mediaTypes: ['audio', 'video'] })), 'no camera with microphone');
assert(!policy.allowPermission('media', at(origin + '/', { mediaTypes: [] })));
assert(!policy.allowPermission('media', at('https://example.org/', { mediaTypes: ['audio'] })), 'microphone only for the app origin');
assert(policy.allowPermission('clipboard-sanitized-write', at(origin + '/')), 'copy report');
for (const permission of ['clipboard-read', 'notifications', 'geolocation', 'midiSysex', 'openExternal', 'fullscreen', 'pointerLock', 'display-capture', 'hid', 'serial', 'usb', 'idle-detection', 'fileSystem', 'unknown']) {
  assert(!policy.allowPermission(permission, at(origin + '/')), 'denied: ' + permission);
}
assert(policy.allowPermissionCheck('media', at(origin, { mediaType: 'audio' })));
assert(!policy.allowPermissionCheck('media', at(origin, { mediaType: 'video' })));
assert(!policy.allowPermissionCheck('media', at('http://127.0.0.1:8788', { mediaType: 'audio' })));
assert(!policy.allowPermissionCheck('geolocation', at(origin)));

// GPU switches: all three by default, none with --safe-gpu.
const appended = [];
const fakeApp = { commandLine: { appendSwitch: name => appended.push(name) } };
assert.deepEqual(gpu.applyGpuSwitches(fakeApp, { safe: true }), []);
assert.deepEqual(appended, []);
assert.deepEqual(gpu.applyGpuSwitches(fakeApp, { safe: false }), ['enable-unsafe-webgpu', 'ignore-gpu-blocklist', 'force_high_performance_gpu']);
assert.deepEqual(appended, ['enable-unsafe-webgpu', 'ignore-gpu-blocklist', 'force_high_performance_gpu']);
const summary = gpu.summarize({ versions: { app: '0.1.0', electron: '1', chromium: '2' }, mode: 'webgpu', switches: [], featureStatus: { webgpu: 'enabled' }, devices: [{ deviceString: 'Synthetic GPU', driverVersion: '1.0' }], crossOriginIsolated: true, hardwareConcurrency: 8, webgpu: { available: true, adapter: null } }, true);
assert.match(summary, /WebGPU \(navigator\.gpu\): ja/);
assert.match(summary, /crossOriginIsolated .*: ja/);
assert.match(summary, /GPU: Synthetic GPU · Treiber 1\.0/);

// Packaging: allow-listed files only, unsigned portable build into dist/desktop/.
const build = pkg.build;
assert.equal(pkg.main, 'desktop/main.cjs');
assert.equal(build.appId, 'befundungstool');
assert.equal(build.productName, 'Befundungstool');
assert.equal(build.directories.output, 'dist/desktop');
assert.deepEqual(build.files, ['dist/befundungstool.html', 'dist/manifest.webmanifest', 'dist/icons/*.png', 'server/local-server.cjs', 'desktop/**/*', 'package.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'CLINICAL_NOTICE.md', 'licenses/**/*']);
assert.equal(pkg.dependencies, undefined, 'no runtime dependencies packaged');
for (const name of ['electron', 'electron-builder', '@playwright/test']) assert.match(pkg.devDependencies[name], /^\d+\.\d+\.\d+$/, name + ' pinned exactly');
console.log('Desktop policy: Origin, externe Links, Berechtigungen, GPU-Schalter, Paketliste bestanden.');
