/* One-time copy of radnote browser data into Befundungstool keys.
   Runs before any module reads storage. Both apps share localStorage when opened from file:// or
   from the same host, so Befundungstool uses its own keys and leaves radnote's untouched.
   The marker prevents re-importing after the user deletes data here (e.g. disables draft saving). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.StorageMigration = api;
    try { api.migrate(root.localStorage); } catch (e) { /* storage unavailable: session-only mode */ }
    enableIsolation(root);
  }

  /* Hosted over HTTPS (GitHub Pages): register coi-sw.js once so the page becomes cross-origin
     isolated and browser models can use several CPU threads. The launcher sends the headers itself;
     file:// cannot be isolated. One reload after the first registration, guarded against loops. */
  function enableIsolation(win) {
    try {
      if (win.crossOriginIsolated || win.location.protocol !== 'https:' || !win.navigator.serviceWorker || !win.isSecureContext) return;
      win.navigator.serviceWorker.register('./coi-sw.js').then(registration => {
        if (win.navigator.serviceWorker.controller || win.sessionStorage.getItem('befundungstool-coi-reload')) return;
        win.sessionStorage.setItem('befundungstool-coi-reload', '1');
        const reload = () => win.location.reload();
        if (registration.active) reload();
        else win.navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
      }).catch(() => { /* not available (e.g. unsupported host): single-threaded browser models */ });
    } catch (e) { /* ignore */ }
  }
})(globalThis, function () {
  'use strict';

  const MARKER = 'befundungstool-migrated-v1';
  const KEYS = [
    'draft-v1', 'macros-v1', 'templates-v1', 'preferences-v1', 'chest-favorites-v1', 'builder-favorites-v1',
    'language', 'theme', 'shortcuts-open', 'macros-open', 'word-macro-intro-v1'
  ];

  function migrate(storage) {
    if (!storage || storage.getItem(MARKER)) return [];
    const hasOwnData = KEYS.some(key => storage.getItem('befundungstool-' + key) !== null);
    const copied = [];
    if (!hasOwnData) {
      for (const key of KEYS) {
        const value = storage.getItem('radnote-' + key);
        if (value !== null) {
          storage.setItem('befundungstool-' + key, value);
          copied.push(key);
        }
      }
    }
    storage.setItem(MARKER, copied.length ? 'radnote' : 'none');
    return copied;
  }

  return { MARKER, KEYS, migrate };
});
