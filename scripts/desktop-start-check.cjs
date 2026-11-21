'use strict';
// Starts the desktop app repeatedly without Playwright and checks that each start reaches "ready": the
// in-process launcher only listens after app.whenReady(), so an HTTP 200 from it means startup finished.
// Catches intermittent startup hangs. Usage: node scripts/desktop-start-check.cjs [count] [app args...]
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { root, electronPath, freePort, desktopEnv } = require('../tests/helpers/desktop.cjs');

const READY_TIMEOUT_MS = 30000;

async function startOnce(args) {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-start-'));
  const child = spawn(electronPath(), [root, ...args], { cwd: root, env: desktopEnv({ port, dataDir }), stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  const collect = chunk => { log = (log + chunk).slice(-4000); };
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  const exited = new Promise(resolve => child.once('exit', code => resolve(code)));
  const started = Date.now();
  let ready = false;
  while (!ready && Date.now() - started < READY_TIMEOUT_MS && child.exitCode === null) {
    ready = await fetch(`http://127.0.0.1:${port}/`).then(r => r.ok, () => false);
    if (!ready) await new Promise(r => setTimeout(r, 200));
  }
  const ms = Date.now() - started;
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  await exited;
  clearTimeout(timer);
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  return { ready, ms, log };
}

(async () => {
  if (!electronPath()) {
    console.log('SKIP: Electron binary not installed (npm run desktop:setup).');
    return;
  }
  const count = Number(process.argv[2] || 10);
  const args = process.argv.slice(3);
  const results = [];
  for (let i = 0; i < count; i++) {
    const result = await startOnce(args);
    results.push(result);
    console.log(`start ${i + 1}/${count} ${args.join(' ') || '(default)'}: ${result.ready ? 'ready after ' + result.ms + ' ms' : 'NO READY within ' + READY_TIMEOUT_MS + ' ms'}`);
    if (!result.ready) console.log(result.log.split('\n').slice(-25).map(line => '    ' + line).join('\n'));
  }
  const failed = results.filter(r => !r.ready).length;
  console.log(`${count - failed}/${count} starts reached ready (${args.join(' ') || 'default switches'})`);
  process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
