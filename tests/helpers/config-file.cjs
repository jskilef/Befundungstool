'use strict';
// Saves the configuration through the UI (always password-encrypted) and returns the decrypted content.
const fs = require('node:fs');
const Crypto = require('../../src/settings/crypto.js');

const TEST_PASSWORD = 'synthetic-password-1';

async function saveConfiguration(page, password = TEST_PASSWORD) {
  const settingsPanel = page.locator('#settingsPanel');
  if (!await settingsPanel.evaluate(e => e.open)) await page.locator('#settingsPanel summary').click();
  const download = page.waitForEvent('download');
  await page.locator('#saveMacros').click();
  await page.locator('#settingsPassword').fill(password);
  await page.locator('#settingsPasswordConfirm').fill(password);
  await page.locator('#passwordSubmit').click();
  const file = await download;
  const envelope = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
  return { name: file.suggestedFilename(), envelope, data: await Crypto.decrypt(envelope, password) };
}

module.exports = { saveConfiguration, TEST_PASSWORD };
