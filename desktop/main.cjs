'use strict';
// Optional Windows desktop app: Electron window around the loopback launcher (server/local-server.cjs).
// The launcher runs in this process on a fixed port, so the app gets the same session token, /api proxy
// and cross-origin isolation headers as `npm start`, without any change in src/. The bundled Chromium
// does not read Chrome/Edge policies, and the switches in gpu.cjs turn on WebGPU despite the blocklist.
//
// Kept small on purpose: native inference (llama.cpp / whisper.cpp helpers) would be a separate module
// started from here and reached through the same loopback server.
const { app, BrowserWindow, Menu, clipboard, dialog, net, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('../server/local-server.cjs');
const policy = require('./policy.cjs');
const gpu = require('./gpu.cjs');

const has = flag => process.argv.includes(flag);
const SAFE_GPU = has('--safe-gpu');
const DEVTOOLS = has('--devtools');
const GPU_INFO_AT_START = has('--gpu-info');
const APP_ROOT = path.join(__dirname, '..', 'dist');
const ICON = path.join(APP_ROOT, 'icons', 'icon-512.png');

// Overrides for tests and unusual setups only. Changing the port changes the origin, and with it all
// browser data (settings, vault, drafts, cached models), so the default never changes on its own.
const PORT = Number(process.env.BEFUNDUNGSTOOL_DESKTOP_PORT || policy.DEFAULT_PORT);
const ORIGIN = policy.appOrigin(PORT);
if (process.env.BEFUNDUNGSTOOL_DESKTOP_DATA) app.setPath('userData', path.resolve(process.env.BEFUNDUNGSTOOL_DESKTOP_DATA));

let mainWindow = null;
let server = null;
const german = () => /^de\b/i.test(app.getLocale());
const text = (de, en) => (german() ? de : en);

// ---- Before ready: GPU switches, sandbox, no background traffic -------------------------------------
const switches = gpu.applyGpuSwitches(app, { safe: SAFE_GPU });
app.enableSandbox();
// The core editor must stay silent until the user picks a provider or model. Electron has no updater or
// crash upload unless started; this switch also turns off Chromium's remaining background fetches.
app.commandLine.appendSwitch('disable-background-networking');
app.setAppUserModelId('befundungstool');

function fail(reason) {
  const port = `127.0.0.1:${PORT}`;
  const messages = {
    EADDRINUSE: [`Port ${port} wird bereits von einem anderen Programm verwendet. Beenden Sie dieses Programm und starten Sie Befundungstool erneut.`,
      `Port ${port} is already used by another program. Close that program and start Befundungstool again.`],
    EACCES: [`Windows verweigert den Zugriff auf Port ${port} (z. B. reservierter Portbereich). Bitte wenden Sie sich an Ihre IT.`,
      `Windows denied access to port ${port} (for example a reserved port range). Please contact your IT department.`],
    MISSING: ['Die App-Dateien fehlen (befundungstool.html). Bitte "npm run build" ausführen oder die App neu installieren.',
      'The app files are missing (befundungstool.html). Run "npm run build" or reinstall the app.']
  };
  const [de, en] = messages[reason] || ['Befundungstool konnte nicht gestartet werden.', 'Befundungstool could not start.'];
  // A fixed origin keeps the user's data reachable, so there is no silent fallback to another port.
  process.stderr.write(`Befundungstool: start failed (${reason || 'unknown'}) on ${port}\n`);
  dialog.showErrorBox('Befundungstool', `${de}\n\n${en}`);
  app.exit(1);
}

function startServer() {
  if (!fs.existsSync(path.join(APP_ROOT, 'befundungstool.html'))) return Promise.reject(Object.assign(new Error('missing'), { code: 'MISSING' }));
  // Provider requests go through Chromium's network stack instead of Node's fetch: it uses the Windows
  // proxy settings and certificate store, which managed (hospital) networks with TLS inspection require.
  const instance = createServer({ root: APP_ROOT, upstreamFetch: (url, init) => net.fetch(url, { ...init, credentials: 'omit', bypassCustomProtocolHandlers: true }) });
  return new Promise((resolve, reject) => {
    instance.once('error', reject);
    instance.listen(PORT, '127.0.0.1', () => { instance.off('error', reject); resolve(instance); });
  });
}

// ---- Security: every web contents (app window, GPU details window) ----------------------------------
function openExternal(url) {
  if (policy.isExternalLink(url)) shell.openExternal(url).catch(() => {});
}

function harden(contents) {
  const keepInApp = (event, url) => {
    const target = event.url || url;
    if (policy.isAppUrl(target, ORIGIN) && contents === mainWindow?.webContents) return;
    event.preventDefault();
    openExternal(target);
  };
  contents.on('will-navigate', keepInApp);
  contents.on('will-redirect', keepInApp);
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
}

function configureSession(ses) {
  ses.setSpellCheckerEnabled(false);
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(policy.allowPermission(permission, { origin: ORIGIN, requestingUrl: details.requestingUrl, mediaTypes: details.mediaTypes }));
  });
  ses.setPermissionCheckHandler((contents, permission, requestingOrigin, details) =>
    policy.allowPermissionCheck(permission, { origin: ORIGIN, requestingUrl: details.requestingUrl || requestingOrigin, mediaType: details.mediaType }));
  ses.setDevicePermissionHandler(() => false);
}

// ---- Diagnostics ------------------------------------------------------------------------------------
async function gpuInfo() {
  return gpu.collectGpuInfo({ app, webContents: mainWindow.webContents, switches, safe: SAFE_GPU });
}

async function showGpuStatus() {
  if (!mainWindow) return null;
  const info = await gpuInfo();
  const buttons = [text('Details kopieren', 'Copy details'), text('Chromium-GPU-Bericht', 'Chromium GPU report'), 'OK'];
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'info', title: text('GPU-Status', 'GPU status'), message: text('GPU-Status', 'GPU status'),
    detail: gpu.summarize(info, german()), buttons, defaultId: 2, cancelId: 2, noLink: true
  });
  if (response === 0) clipboard.writeText(JSON.stringify(info, null, 2));
  if (response === 1) openGpuReport();
  return info;
}

// chrome://gpu explains why a feature is off (driver bugs, blocklist entries). Local page, no network.
function openGpuReport() {
  const report = new BrowserWindow({ width: 1000, height: 800, parent: mainWindow, title: text('GPU-Bericht', 'GPU report'), icon: ICON, autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, devTools: DEVTOOLS } });
  report.removeMenu();
  report.loadURL('chrome://gpu');
}

function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info', title: 'Befundungstool', message: `Befundungstool ${app.getVersion()}`, buttons: ['OK'], noLink: true,
    detail: text(`Desktop-App (Electron ${process.versions.electron}). Berichte, Einstellungen und Modelle bleiben auf diesem PC:\n${app.getPath('userData')}\n\nMIT-Lizenz. Kein Medizinprodukt: Befunde immer ärztlich prüfen.`,
      `Desktop app (Electron ${process.versions.electron}). Reports, settings and models stay on this PC:\n${app.getPath('userData')}\n\nMIT license. Not a medical device: always review reports clinically.`)
  });
}

// No Reload entry (it would discard unsaved report text) and no Edit roles (Ctrl+Z belongs to the
// app's own undo). Windows handles copy/paste shortcuts without menu roles.
function buildMenu() {
  const view = [
    { role: 'zoomIn', label: text('Vergrößern', 'Zoom in') },
    { role: 'zoomOut', label: text('Verkleinern', 'Zoom out') },
    { role: 'resetZoom', label: text('Originalgröße', 'Actual size') },
    { type: 'separator' },
    { role: 'togglefullscreen', label: text('Vollbild', 'Full screen') }
  ];
  if (DEVTOOLS) view.push({ type: 'separator' }, { role: 'toggleDevTools', label: text('Entwicklertools', 'Developer tools') });
  return Menu.buildFromTemplate([
    { label: text('&Datei', '&File'), submenu: [{ role: 'quit', label: text('Beenden', 'Quit') }] },
    { label: text('&Ansicht', '&View'), submenu: view },
    { label: text('&Hilfe', '&Help'), submenu: [
      { id: 'gpu-status', label: text('GPU-Status', 'GPU status'), click: () => showGpuStatus().catch(() => {}) },
      { type: 'separator' },
      { id: 'about', label: text('Über Befundungstool', 'About Befundungstool'), click: showAbout }
    ] }
  ]);
}

function contextMenu(params) {
  const items = params.isEditable
    ? [{ role: 'cut', label: text('Ausschneiden', 'Cut') }, { role: 'copy', label: text('Kopieren', 'Copy') }, { role: 'paste', label: text('Einfügen', 'Paste') }, { type: 'separator' }, { role: 'selectAll', label: text('Alles auswählen', 'Select all') }]
    : params.selectionText ? [{ role: 'copy', label: text('Kopieren', 'Copy') }] : [];
  if (items.length) Menu.buildFromTemplate(items).popup({ window: mainWindow });
}

// ---- Window -----------------------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 950, minWidth: 720, minHeight: 500, show: false, title: 'Befundungstool', icon: ICON,
    webPreferences: {
      contextIsolation: true, sandbox: true, nodeIntegration: false, nodeIntegrationInWorker: false, webSecurity: true,
      spellcheck: false, devTools: DEVTOOLS, navigateOnDragDrop: false, safeDialogs: true
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.on('context-menu', (event, params) => contextMenu(params));
  if (GPU_INFO_AT_START) {
    mainWindow.webContents.once('did-finish-load', async () => {
      const info = await gpuInfo().catch(error => ({ error: String(error?.message || error) }));
      process.stdout.write('GPU-INFO ' + JSON.stringify(info) + '\n');
      showGpuStatus().catch(() => {});
    });
  }
  mainWindow.loadURL(ORIGIN + '/');
}

function main() {
  // One instance per data folder: two windows would fight over the port and the stored drafts.
  if (!app.requestSingleInstanceLock()) return app.quit();
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.on('web-contents-created', (event, contents) => harden(contents));
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { server?.closeAllConnections(); server?.close(); });
  app.whenReady().then(async () => {
    configureSession(session.defaultSession);
    Menu.setApplicationMenu(buildMenu());
    try {
      server = await startServer();
    } catch (error) {
      return fail(error.code);
    }
    createWindow();
  });
}

main();
