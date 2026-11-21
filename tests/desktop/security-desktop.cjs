'use strict';
// Desktop hardening: no navigation away from the app, no new windows (https links go to the default browser),
// microphone (audio only) is the only media permission, everything else is denied; no DevTools, no Reload.
const assert = require('node:assert/strict');
const { launchDesktop } = require('../helpers/desktop.cjs');

(async () => {
  // Fake media devices: a granted microphone request then succeeds without hardware, so a denied
  // camera request can only come from the permission handler.
  const desktop = await launchDesktop({ args: ['--use-fake-device-for-media-stream'] });
  const { app, page, origin } = desktop;
  try {
    // shell.openExternal is replaced so the test never opens the real browser.
    await app.evaluate(({ shell }) => { globalThis.__opened = []; shell.openExternal = async url => { globalThis.__opened.push(url); }; });
    const opened = () => app.evaluate(() => globalThis.__opened);

    // Permissions.
    const permissions = await page.evaluate(async () => {
      const attempt = async fn => { try { await fn(); return 'granted'; } catch (e) { return e.name; } };
      const media = async constraints => { const stream = await navigator.mediaDevices.getUserMedia(constraints); stream.getTracks().forEach(track => track.stop()); };
      return {
        microphone: await attempt(() => media({ audio: true })),
        camera: await attempt(() => media({ video: true })),
        both: await attempt(() => media({ audio: true, video: true })),
        notification: await Notification.requestPermission(),
        geolocation: await new Promise(resolve => navigator.geolocation.getCurrentPosition(() => resolve('granted'), e => resolve(e.code === 1 ? 'denied' : 'error ' + e.code))),
        geolocationQuery: (await navigator.permissions.query({ name: 'geolocation' })).state,
        clipboardRead: await attempt(() => navigator.clipboard.readText()),
        midi: await attempt(() => navigator.requestMIDIAccess({ sysex: true }))
      };
    });
    assert.deepEqual(permissions, { microphone: 'granted', camera: 'NotAllowedError', both: 'NotAllowedError', notification: 'denied', geolocation: 'denied', geolocationQuery: 'denied', clipboardRead: 'NotAllowedError', midi: 'NotAllowedError' });

    // "Befund kopieren" (write-only clipboard) still works.
    await page.locator('#findings').fill('Synthetischer Befund zum Kopieren.');
    await page.locator('#copy').click();
    await page.waitForFunction(() => document.body.textContent.includes('kopiert'));
    assert.match(await app.evaluate(({ clipboard }) => clipboard.readText()), /Synthetischer Befund zum Kopieren\./);

    // No DevTools without --devtools; the menu has no Reload (would discard text) and no Edit roles (app undo).
    const devtools = await app.evaluate(({ BrowserWindow }) => { const contents = BrowserWindow.getAllWindows()[0].webContents; contents.openDevTools(); return contents.isDevToolsOpened(); });
    assert.equal(devtools, false);
    const roles = await app.evaluate(({ Menu }) => {
      const walk = items => items.flatMap(item => [item.role, ...(item.submenu ? walk(item.submenu.items) : [])]);
      return walk(Menu.getApplicationMenu().items).filter(Boolean).map(r => r.toLowerCase());
    });
    for (const role of ['reload', 'forcereload', 'undo', 'redo', 'toggledevtools']) assert(!roles.includes(role), 'menu without ' + role);
    assert(await app.evaluate(({ Menu }) => !!Menu.getApplicationMenu().getMenuItemById('gpu-status')), 'GPU status menu entry');
    // Last: Playwright keeps a cancelled navigation pending, so locator actions must come before it.
    // Navigation to another origin stays blocked; https opens externally, other schemes are dropped.
    await page.evaluate(() => { location.href = 'http://example.invalid/'; });
    await page.waitForTimeout(700);
    await page.evaluate(() => { location.href = 'https://example.org/navigate'; });
    await page.waitForTimeout(700);
    assert.equal(page.url(), origin + '/', 'still on the app origin');
    assert.equal(await page.evaluate(() => typeof window.BefundungstoolLocal.token), 'string', 'page not reloaded');

    // window.open never creates a window.
    const handles = await page.evaluate(() => [window.open('https://example.org/popup'), window.open('file:///C:/Windows/win.ini'), window.open('javascript:alert(1)'), window.open('/')].map(w => w === null));
    assert.deepEqual(handles, [true, true, true, true]);
    await page.waitForTimeout(500);
    assert.equal(app.windows().length, 1, 'no extra windows');
    assert.deepEqual(await opened(), ['https://example.org/navigate', 'https://example.org/popup'], 'only https links reach the default browser');

    console.log('Desktop-Sicherheit: Navigation, Fenster, Berechtigungen, Zwischenablage, DevTools und Menü bestanden.');
  } finally {
    await desktop.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
