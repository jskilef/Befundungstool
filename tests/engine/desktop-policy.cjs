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

// GPU switches: all three by default (plus Vulkan on Linux, where Chromium's WebGPU needs it), none with --safe-gpu.
const BASE = ['enable-unsafe-webgpu', 'ignore-gpu-blocklist', 'force_high_performance_gpu'];
const switchesFor = (platform, safe) => {
  const appended = [];
  const returned = gpu.applyGpuSwitches({ commandLine: { appendSwitch: (name, value) => appended.push(value ? `${name}=${value}` : name) } }, { safe, platform });
  assert.deepEqual(returned, appended, 'reported switches = applied switches');
  return returned;
};
for (const platform of ['win32', 'darwin', 'linux']) assert.deepEqual(switchesFor(platform, true), [], '--safe-gpu on ' + platform);
assert.deepEqual(switchesFor('win32', false), BASE);
assert.deepEqual(switchesFor('darwin', false), BASE);
assert.deepEqual(switchesFor('linux', false), [...BASE, 'enable-features=Vulkan']);
const summary = gpu.summarize({ versions: { app: '0.1.0', electron: '1', chromium: '2' }, mode: 'webgpu', switches: [], featureStatus: { webgpu: 'enabled' }, devices: [{ deviceString: 'Synthetic GPU', driverVersion: '1.0' }], crossOriginIsolated: true, hardwareConcurrency: 8, webgpu: { available: true, adapter: null } }, true);
assert.match(summary, /WebGPU \(navigator\.gpu\): ja/);
assert.match(summary, /crossOriginIsolated .*: ja/);
assert.match(summary, /GPU: Synthetic GPU · Treiber 1\.0/);

// Packaging: allow-listed files only, unsigned builds for all three systems into dist/desktop/, named so
// scripts/release.cjs picks them up (befundungstool-v<version>-<os>-...).
const build = pkg.build;
const targets = platform => build[platform].target.map(t => (typeof t === 'string' ? t : t.target));
assert.deepEqual(targets('win'), ['portable']);
assert.deepEqual(targets('mac'), ['dmg']);
assert.deepEqual(build.mac.target[0].arch, ['arm64', 'x64'], 'Apple Silicon and Intel');
assert.deepEqual(targets('linux'), ['deb', 'AppImage']);
assert.equal(build.mac.identity, '-', 'ad-hoc signature (required on Apple Silicon), no developer certificate');
assert.equal(build.mac.hardenedRuntime, false, 'hardened runtime would reject the ad-hoc signed Electron framework');
assert.match(build.mac.extendInfo.NSMicrophoneUsageDescription, /Offline/, 'macOS asks for the microphone with a reason');
assert.equal(build.electronDist, undefined, 'electron-builder fetches the Electron build for each platform and architecture');
assert.equal(build.electronFuses.runAsNode, false);
for (const [key, os] of [['portable', 'windows-portable'], ['dmg', 'macos-${arch}'], ['deb', 'linux-${arch}'], ['appImage', 'linux-${arch}']]) {
  assert.equal(build[key].artifactName, `befundungstool-v\${version}-${os}.\${ext}`, key + ' artifact name');
}
assert.equal(pkg.main, 'desktop/main.cjs');
assert.equal(build.appId, 'befundungstool');
assert.equal(build.productName, 'Befundungstool');
assert.equal(build.directories.output, 'dist/desktop');
assert.deepEqual(build.files, ['dist/befundungstool.html', 'dist/manifest.webmanifest', 'dist/icons/*.png', 'server/local-server.cjs', 'desktop/**/*', 'package.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'CLINICAL_NOTICE.md', 'licenses/**/*']);
assert.equal(pkg.dependencies, undefined, 'no runtime dependencies packaged');
for (const name of ['electron', 'electron-builder', '@playwright/test']) assert.match(pkg.devDependencies[name], /^\d+\.\d+\.\d+$/, name + ' pinned exactly');
console.log('Desktop policy: Origin, externe Links, Berechtigungen, GPU-Schalter, Paketliste bestanden.');
