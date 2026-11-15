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
    /* Ordering (audit A04): encryption is asynchronous, so a write may finish after a later action.
       The epoch changes on forget, lock and password-based (re)creation; work started under an older
       epoch is dropped. Among re-seals, only the most recently started one may write. */
    let epoch = 0, sealTicket = 0;
    const read = () => { try { return JSON.parse(storage?.getItem(KEY) || 'null'); } catch { return null; } };

    return {
      exists: () => !!read(),
      get unlocked() { return !!session; },
      // Returns the stored payload; throws 'Incorrect password or damaged settings file' on a wrong password.
      async unlock(password) {
        const file = read();
        if (!file) throw new Error('No saved configuration in this browser');
        const started = epoch;
        const opened = await Crypto.openVault(file, password);
        if (started !== epoch) throw new Error('No saved configuration in this browser');
        session = opened.session;
        return opened.payload;
      },
      // With a password: (re)creates the vault under that password. Without: re-seals with the session key.
      // Resolves false when nothing was written (no session, or superseded by a later action).
      async save(payload, password) {
        if (password !== undefined) {
          const started = ++epoch;
          const created = await Crypto.createVault(payload, password);
          if (started !== epoch) return false;
          storage.setItem(KEY, JSON.stringify(created.envelope));
          session = created.session;
          return true;
        }
        if (!session) return false;
        const started = epoch, ticket = ++sealTicket;
        const sealed = await Crypto.sealVault(payload, session);
        if (started !== epoch || ticket !== sealTicket || !session) return false;
        storage.setItem(KEY, JSON.stringify(sealed));
        return true;
      },
      forget() {
        epoch++;
        session = null;
        try { storage?.removeItem(KEY); } catch { /* storage unavailable */ }
      },
      lock() { epoch++; session = null; }
    };
  }

  return { KEY, create };
});
