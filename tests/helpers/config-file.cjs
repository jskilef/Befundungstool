'use strict';
// Saves the configuration through the UI (always password-encrypted) and returns the decrypted content.
const fs = require('node:fs');
const Crypto = require('../../src/settings/crypto.js');
const { openSettings, closeSettings } = require('./ui.cjs');

const TEST_PASSWORD = 'synthetic-password-1';

async function saveConfiguration(page, password = TEST_PASSWORD, { remember = false } = {}) {
  await openSettings(page, 'file');
  const download = page.waitForEvent('download');
  await page.locator('#saveMacros').click();
  await page.locator('#settingsPassword').fill(password);
  await page.locator('#settingsPasswordConfirm').fill(password);
  await page.locator('#rememberInBrowser').setChecked(remember);
  await page.locator('#passwordSubmit').click();
  const file = await download;
  await closeSettings(page);
  const envelope = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
  return { name: file.suggestedFilename(), envelope, data: await Crypto.decrypt(envelope, password) };
}

module.exports = { saveConfiguration, TEST_PASSWORD };
