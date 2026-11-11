'use strict';
// Mirrors Report Studio v1.6.0 encryptSettings() to produce genuine legacy encrypted files for import tests.
async function reportStudioEncrypt(payload, password) {
  const { subtle } = globalThis.crypto;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const material = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('ReportStudio/settings/v2'), tagLength: 128 },
    key, new TextEncoder().encode(JSON.stringify(payload))
  );
  const b64 = bytes => Buffer.from(bytes).toString('base64');
  return {
    format: 'report-studio-encrypted-settings', version: 2, kdf: 'PBKDF2-SHA256', iterations: 600000, cipher: 'AES-256-GCM',
    salt: b64(salt), iv: b64(iv), ciphertext: b64(new Uint8Array(ciphertext))
  };
}

module.exports = { reportStudioEncrypt };
