'use strict';
// Shared UI steps for the settings side sheet (theme, language, draft saving, AI connection, configuration file).

async function openSettings(page, tab = 'general') {
  if (!await page.locator('#settingsSheet').evaluate(d => d.open)) await page.locator('#openSettings').click();
  await page.locator(`[data-sheet-tab="${tab}"]`).click();
}

async function closeSettings(page) {
  if (await page.locator('#settingsSheet').evaluate(d => d.open)) await page.locator('#closeSettings').click();
}

// '#theme' / '#language' take an option value; '#persist' takes true/false.
async function setSetting(page, selector, value) {
  await openSettings(page, 'general');
  if (typeof value === 'boolean') await page.locator(selector).setChecked(value);
  else await page.selectOption(selector, value);
  await closeSettings(page);
}

// Fills the AI connection form in the settings sheet, then closes it.
async function configureAi(page, { provider, key, model, endpoint, reportLanguage, localModel } = {}) {
  await openSettings(page, 'ai');
  if (provider) await page.selectOption('#aiProvider', provider);
  if (endpoint !== undefined) await page.locator('#aiEndpoint').fill(endpoint);
  if (key !== undefined) await page.locator('#aiKey').fill(key);
  if (model !== undefined) await page.locator('#aiModel').fill(model);
  if (localModel) await page.selectOption('#aiLocalModel', localModel);
  if (reportLanguage) await page.selectOption('#aiReportLanguage', reportLanguage);
  await closeSettings(page);
}

module.exports = { openSettings, closeSettings, setSetting, configureAi };
