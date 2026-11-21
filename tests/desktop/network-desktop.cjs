'use strict';
// No unexpected traffic: until a provider or model is chosen, the desktop app (renderer, main process and
// Chromium services) only talks to 127.0.0.1. Chromium's own net-log records every request and DNS lookup.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchDesktop } = require('../helpers/desktop.cjs');

// WPAD is Windows proxy auto-discovery ("Automatically detect settings"). Chromium follows the system proxy
// configuration like Chrome and Edge do; the lookup goes to the local network and carries no app data.
const PROXY_DISCOVERY = /^wpad(\.|$)/i;

function hostsIn(netlog) {
  const hosts = new Set();
  const visit = value => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string' && ['url', 'original_url', 'new_location'].includes(key) && /^[a-z][a-z0-9+.-]*:\/\//i.test(item)) hosts.add(new URL(item).hostname);
      // "host" appears as "name:port", "[v6]:port" or "scheme://name:port".
      else if (typeof item === 'string' && key === 'host') hosts.add(new URL(item.includes('://') ? item : 'tcp://' + item).hostname.replace(/^\[|\]$/g, ''));
      else visit(item);
    }
  };
  visit(netlog.events.map(event => event.params));
  return [...hosts].sort();
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-netlog-'));
  const file = path.join(dir, 'net.json');
  const desktop = await launchDesktop({ args: [`--log-net-log=${file}`] });
  const requests = [];
  desktop.page.on('request', request => requests.push(request.url()));
  let hosts;
  try {
    // Use the editor like a user without AI: type a report, open the AI settings without choosing a provider.
    await desktop.page.locator('#findings').pressSequentially('Synthetischer Befund ohne KI.');
    assert.equal(await desktop.page.inputValue('#findings'), 'Synthetischer Befund ohne KI.');
    await require('../helpers/ui.cjs').openSettings(desktop.page, 'ai');
    await desktop.page.waitForTimeout(6000);
    assert.deepEqual(requests.filter(url => !url.startsWith(desktop.origin + '/') && !/^(data|blob):/.test(url)), [], 'renderer requests stay on the app origin');
  } finally {
    await desktop.close();
  }
  try {
    hosts = hostsIn(JSON.parse(fs.readFileSync(file, 'utf8')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const outside = hosts.filter(host => !['127.0.0.1', 'localhost', '::1'].includes(host) && !PROXY_DISCOVERY.test(host));
  assert.deepEqual(outside, [], 'no request or DNS lookup outside loopback');
  assert(hosts.includes('127.0.0.1'), 'net-log captured the app traffic');
  console.log(`Desktop-Netzwerk: nur Loopback beim Start (net-log Hosts: ${hosts.join(', ')}) bestanden.`);
})().catch(e => { console.error(e); process.exit(1); });
