'use strict';
// Browser vault: ciphertext only in storage, unlock with password, automatic re-seal, forget.
const assert = require('node:assert/strict');
const V = require('../../src/settings/vault.js');
const C = require('../../src/settings/crypto.js');

function storage() {
  const map = new Map();
  return { map, getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
}
const ai = { provider: 'openai', reportLanguage: 'German', profiles: { openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'm', apiKey: 'sk-synthetic-vault' } } };

(async () => {
  const s = storage();
  const vault = V.create(s);
  assert(!vault.exists() && !vault.unlocked);
  assert.equal(await vault.save(ai), false, 'no session, no password: nothing stored');
  await assert.rejects(vault.save(ai, 'short'), /at least 12/);

  await vault.save(ai, 'synthetic-password-1');
  assert(vault.exists() && vault.unlocked);
  const stored = s.getItem(V.KEY);
  assert(!stored.includes('sk-synthetic-vault') && !stored.includes('openai'), 'only ciphertext in storage');
  assert.equal(JSON.parse(stored).format, 'befundungstool-vault');

  // Re-seal with the session key: fresh IV, same salt, no password needed.
  const changed = { ...ai, profiles: { openai: { ...ai.profiles.openai, apiKey: 'sk-synthetic-new' } } };
  assert.equal(await vault.save(changed), true);
  const resealed = JSON.parse(s.getItem(V.KEY));
  assert.equal(resealed.salt, JSON.parse(stored).salt);
  assert.notEqual(resealed.iv, JSON.parse(stored).iv);

  // A new page: locked until the password is entered.
  const reopened = V.create(s);
  assert(reopened.exists() && !reopened.unlocked);
  await assert.rejects(reopened.unlock('wrong-password-123'), /Incorrect password/);
  assert(!reopened.unlocked);
  assert.equal((await reopened.unlock('synthetic-password-1')).profiles.openai.apiKey, 'sk-synthetic-new');
  assert(reopened.unlocked);

  // Vault envelopes are not settings files and vice versa (different AAD and format).
  assert(!C.isEncrypted(resealed));
  const file = await C.encrypt({ x: 1 }, 'synthetic-password-1');
  await assert.rejects(C.openVault({ ...file, format: 'befundungstool-vault', version: 1 }, 'synthetic-password-1'), /Incorrect password/);

  reopened.forget();
  assert(!reopened.exists() && !reopened.unlocked);
  console.log('Browser-Tresor: nur Chiffretext gespeichert, Entsperren, automatisches Neuverschlüsseln, Trennung von Dateien, Vergessen bestanden.');
})().catch(error => { console.error(error); process.exit(1); });
