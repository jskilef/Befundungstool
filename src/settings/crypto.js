/* Password encryption for settings files (adapted from Report Studio v1.6.0).
   AES-256-GCM with a PBKDF2-SHA256 key (600,000 iterations), fresh salt and IV per file.
   The additional authenticated data binds a ciphertext to its envelope format. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SettingsCrypto = api;
})(globalThis, function () {
  'use strict';

  const ITERATIONS = 600000;
  const MIN_PASSWORD_LENGTH = 12;
  const MAX_CIPHERTEXT_BYTES = 60000000;

  // Own envelope first; Report Studio's is accepted for import only.
  const ENVELOPES = [
    { format: 'befundungstool-encrypted-settings', version: 1, aad: 'Befundungstool/settings/v1' },
    { format: 'report-studio-encrypted-settings', version: 2, aad: 'ReportStudio/settings/v2' }
  ];
  const OWN = ENVELOPES[0];

  function invalid() {
    return new Error('Invalid encrypted settings file');
  }

  function bytesToBase64(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function base64ToBytes(value, maxBytes) {
    if (typeof value !== 'string' || !value.length || value.length % 4 !== 0 || value.length > Math.ceil(maxBytes / 3) * 4) throw invalid();
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw invalid();
    let binary;
    try { binary = atob(value); } catch { throw invalid(); }
    if (binary.length > maxBytes) throw invalid();
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  }

  function subtle() {
    if (!globalThis.crypto?.subtle) throw new Error('Encryption is unavailable in this browser');
    return globalThis.crypto.subtle;
  }

  function envelopeFor(file) {
    return ENVELOPES.find(e => file && file.format === e.format) || null;
  }

  function isEncrypted(file) {
    return !!envelopeFor(file);
  }

  // Validates the envelope shape without needing the password.
  function readEnvelope(file) {
    const envelope = envelopeFor(file);
    if (!envelope || file.version !== envelope.version || file.kdf !== 'PBKDF2-SHA256' ||
        file.iterations !== ITERATIONS || file.cipher !== 'AES-256-GCM') throw invalid();
    const salt = base64ToBytes(file.salt, 16);
    const iv = base64ToBytes(file.iv, 12);
    const ciphertext = base64ToBytes(file.ciphertext, MAX_CIPHERTEXT_BYTES);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17) throw invalid();
    return { envelope, salt, iv, ciphertext };
  }

  async function passwordKey(password, salt) {
    const material = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return subtle().deriveKey(
      { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
      material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }

  async function encrypt(payload, password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) throw new Error('Use a password of at least 12 characters.');
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const key = await passwordKey(password, salt);
    const ciphertext = await subtle().encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(OWN.aad), tagLength: 128 },
      key, new TextEncoder().encode(JSON.stringify(payload))
    );
    return {
      format: OWN.format, version: OWN.version, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, cipher: 'AES-256-GCM',
      salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext))
    };
  }

  // Returns the decrypted JSON value. Callers must validate it before applying anything.
  async function decrypt(file, password) {
    const { envelope, salt, iv, ciphertext } = readEnvelope(file);
    const key = await passwordKey(String(password), salt);
    let plain;
    try {
      plain = await subtle().decrypt(
        { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(envelope.aad), tagLength: 128 }, key, ciphertext
      );
    } catch {
      throw new Error('Incorrect password or damaged settings file');
    }
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
    } catch {
      throw invalid();
    }
  }

  /* Browser vault: the same encryption, kept in browser storage. Opening it yields a session whose
     key is a non-extractable CryptoKey held in memory only, so later changes can be re-sealed without
     asking for the password again (fresh IV per write, salt fixed per vault). */
  const VAULT = { format: 'befundungstool-vault', version: 1, aad: 'Befundungstool/vault/v1' };

  function readVault(file) {
    if (!file || file.format !== VAULT.format || file.version !== VAULT.version || file.kdf !== 'PBKDF2-SHA256' ||
        file.iterations !== ITERATIONS || file.cipher !== 'AES-256-GCM') throw invalid();
    const salt = base64ToBytes(file.salt, 16), iv = base64ToBytes(file.iv, 12), ciphertext = base64ToBytes(file.ciphertext, MAX_CIPHERTEXT_BYTES);
    if (salt.length !== 16 || iv.length !== 12 || ciphertext.length < 17) throw invalid();
    return { salt, iv, ciphertext };
  }

  async function sealVault(payload, session) {
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await subtle().encrypt(
      { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(VAULT.aad), tagLength: 128 },
      session.key, new TextEncoder().encode(JSON.stringify(payload))
    );
    return {
      format: VAULT.format, version: VAULT.version, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, cipher: 'AES-256-GCM',
      salt: bytesToBase64(session.salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext))
    };
  }

  async function createVault(payload, password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) throw new Error('Use a password of at least 12 characters.');
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const session = { salt, key: await passwordKey(password, salt) };
    return { envelope: await sealVault(payload, session), session };
  }

  async function openVault(file, password) {
    const { salt, iv, ciphertext } = readVault(file);
    const session = { salt, key: await passwordKey(String(password), salt) };
    let plain;
    try {
      plain = await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(VAULT.aad), tagLength: 128 }, session.key, ciphertext);
    } catch {
      throw new Error('Incorrect password or damaged settings file');
    }
    try {
      return { payload: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain)), session };
    } catch {
      throw invalid();
    }
  }

  return { ITERATIONS, MIN_PASSWORD_LENGTH, ENVELOPES, VAULT, isEncrypted, readEnvelope, encrypt, decrypt, createVault, openVault, sealVault, readVault };
});
