'use strict';
// Desktop lifecycle: one instance per data folder (a second start exits and focuses the first window),
// a busy port is reported instead of silently switching origins, and --safe-gpu drops the GPU switches.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { root, electronPath, freePort, desktopEnv, launchDesktop } = require('../helpers/desktop.cjs');

function run(env, { killAfterMs = 20000, until } = {}) {
  return new Promise(resolve => {
    const child = spawn(electronPath(), [root], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => child.kill(), killAfterMs);
    const collect = chunk => { output += chunk; if (until && until.test(output)) child.kill(); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('exit', code => { clearTimeout(timer); resolve({ code, output }); });
  });
}

(async () => {
  // Second instance with the same data folder: exits on its own, the first window stays.
  const first = await launchDesktop();
  try {
    const second = await run(desktopEnv({ port: await freePort(), dataDir: first.dataDir }));
    assert.equal(second.code, 0, 'second instance quits by itself');
    assert.equal(first.app.windows().length, 1);
    assert.equal(await first.page.evaluate(() => typeof window.BefundungstoolLocal.token), 'string', 'first window untouched');
  } finally {
    await first.close();
  }

  // Port held by another program: the app reports it (dialog + stderr) and never opens on another port.
  const blocker = net.createServer();
  await new Promise(r => blocker.listen(0, '127.0.0.1', r));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-desktop-'));
  try {
    const port = blocker.address().port;
    // The error dialog is modal, so the process is ended once the reason has been printed.
    const busy = await run(desktopEnv({ port, dataDir }), { until: /start failed/ });
    assert.match(busy.output, new RegExp(`start failed \\(EADDRINUSE\\) on 127\\.0\\.0\\.1:${port}`));
  } finally {
    blocker.close();
    fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }

  // --safe-gpu: no WebGPU/blocklist switches, the app still runs.
  const safe = await launchDesktop({ args: ['--safe-gpu'] });
  try {
    const switches = await safe.app.evaluate(({ app }) => ['enable-unsafe-webgpu', 'ignore-gpu-blocklist', 'force_high_performance_gpu', 'enable-features'].filter(name => app.commandLine.hasSwitch(name)));
    assert.deepEqual(switches, []);
    assert.equal(await safe.page.evaluate(() => window.crossOriginIsolated), true);
    console.log(`--safe-gpu: navigator.gpu=${await safe.page.evaluate(() => 'gpu' in navigator)}`);
  } finally {
    await safe.close();
  }
  const full = await launchDesktop();
  try {
    const switches = await full.app.evaluate(({ app }) => ['enable-unsafe-webgpu', 'ignore-gpu-blocklist', 'force_high_performance_gpu', 'disable-background-networking'].filter(name => app.commandLine.hasSwitch(name)).concat(app.commandLine.getSwitchValue('enable-features').split(',').filter(Boolean).map(f => 'feature:' + f)));
    assert.deepEqual(switches, ['enable-unsafe-webgpu', 'ignore-gpu-blocklist', 'force_high_performance_gpu', 'disable-background-networking', ...(process.platform === 'linux' ? ['feature:Vulkan'] : [])]);
  } finally {
    await full.close();
  }
  console.log('Desktop-Lebenszyklus: Einzelinstanz, belegter Port, --safe-gpu bestanden.');
})().catch(e => { console.error(e); process.exit(1); });
