/* Encrypted copy of the AI settings (including API keys) in browser storage (user decision 2026-11-11).
   Only ciphertext is stored. After unlock or creation, a session key stays in memory so changes are
   re-sealed automatically; reloading the page locks it again. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./crypto.js') : root.SettingsCrypto);
  if (node) module.exports = api;
  else root.SettingsVault = api;
})(globalThis, function (Crypto) {
  'use strict';

  const KEY = 'befundungstool-vault-v1';

  function create(storage) {
    let session = null;
    const read = () => { try { return JSON.parse(storage?.getItem(KEY) || 'null'); } catch { return null; } };

    return {
      exists: () => !!read(),
      get unlocked() { return !!session; },
      // Returns the stored payload; throws 'Incorrect password or damaged settings file' on a wrong password.
      async unlock(password) {
        const file = read();
        if (!file) throw new Error('No saved configuration in this browser');
        const opened = await Crypto.openVault(file, password);
        session = opened.session;
        return opened.payload;
      },
      // With a password: (re)creates the vault under that password. Without: re-seals with the session key.
      async save(payload, password) {
        if (password !== undefined) {
          const created = await Crypto.createVault(payload, password);
          storage.setItem(KEY, JSON.stringify(created.envelope));
          session = created.session;
          return true;
        }
        if (!session) return false;
        storage.setItem(KEY, JSON.stringify(await Crypto.sealVault(payload, session)));
        return true;
      },
      forget() {
        session = null;
        try { storage?.removeItem(KEY); } catch { /* storage unavailable */ }
      },
      lock() { session = null; }
    };
  }

  return { KEY, create };
});
