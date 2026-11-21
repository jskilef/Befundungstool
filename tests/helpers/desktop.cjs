'use strict';
// Launches the desktop app (desktop/main.cjs) through Playwright's Electron support, with its own data
// folder and a free port so tests never touch the user's real desktop data on port 8790.
const { _electron } = require('@playwright/test');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '../..');

// Reads the binary location the way the electron package does, but without require('electron'): that
// would start a download when the binary is missing (npm install --ignore-scripts), and tests stay offline.
function electronPath() {
  const dir = path.join(root, 'node_modules', 'electron');
  try {
    const name = fs.readFileSync(path.join(dir, 'path.txt'), 'utf8').trim();
    const executable = path.join(dir, 'dist', name);
    return name && fs.existsSync(executable) ? executable : null;
  } catch {
    return null;
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
}

function desktopEnv({ port, dataDir, extra = {} }) {
  const env = { ...process.env, BEFUNDUNGSTOOL_DESKTOP_PORT: String(port), BEFUNDUNGSTOOL_DESKTOP_DATA: dataDir, ...extra };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

// On the Linux CI runner Playwright's attach to Electron sometimes never completes (1 in 5–8 launches),
// while 45/45 direct starts of the same app reached "ready" in ~0.2 s (max 4.6 s). The attach is retried;
// real startup hangs are caught by scripts/desktop-start-check.cjs, which runs without Playwright in CI.
const ATTACH_TIMEOUT_MS = 20000;
const ATTACH_ATTEMPTS = 3;

async function launchWithRetry(options) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await _electron.launch({ ...options, timeout: ATTACH_TIMEOUT_MS });
    } catch (error) {
      if (error.name !== 'TimeoutError' || attempt >= ATTACH_ATTEMPTS) throw error;
      console.log(`Playwright attach to Electron timed out (attempt ${attempt}/${ATTACH_ATTEMPTS}); retrying.`);
    }
  }
}

async function launchDesktop({ args = [], env = {}, dataDir } = {}) {
  const executablePath = electronPath();
  if (!executablePath) throw new Error('Electron binary missing: run "npm run desktop:setup".');
  const ownData = !dataDir;
  dataDir = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'bt-desktop-'));
  const port = await freePort();
  const app = await launchWithRetry({ executablePath, args: [root, ...args], cwd: root, env: desktopEnv({ port, dataDir, extra: env }) });
  let stdout = '';
  app.process().stdout.on('data', chunk => { stdout += chunk; });
  const page = await app.firstWindow();
  await page.waitForLoadState('load');
  // The window stays hidden until its first paint; keystrokes sent before that are lost.
  for (let i = 0; i < 100 && !(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())); i++) await page.waitForTimeout(100);
  return {
    app, page, port, dataDir, origin: `http://127.0.0.1:${port}`,
    stdout: () => stdout,
    async close() {
      await app.close().catch(() => app.process().kill());
      if (ownData) fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  };
}

module.exports = { root, electronPath, freePort, desktopEnv, launchDesktop };
