'use strict';
// Audit A05: the template dialog cannot create a library the loader rejects; an unreadable saved library is kept.
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../dist/befundungstool.html'), 'utf8');
const KEY = 'befundungstool-templates-v1';
const library = n => JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: 'custom-t' + i, name: 'Synthetische Vorlage ' + i, fields: [{ id: 'custom-f' + i, label: 'Befund', defaultText: '' }] })));

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BT_CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [];
  async function open(stored) {
    const context = await browser.newContext();
    await context.addInitScript(([key, value]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('seeded', '1'); } }, [KEY, stored]);
    await context.route('https://befundungstool.test/**', route => route.fulfill({ contentType: 'text/html', body: html }));
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('https://befundungstool.test/');
    return { context, page };
  }
  const customCount = page => page.locator('#template option[value^="custom-"]').count();
  const toast = page => page.waitForFunction(() => document.querySelector('#toast').textContent);
  try {
    // 100 templates: a 101st is refused with a message; the library stays loadable after reload.
    {
      const { context, page } = await open(library(100));
      assert.equal(await customCount(page), 100);
      await page.locator('#addTemplate').click();
      await page.locator('#templateName').fill('Nummer 101');
      await page.locator('.template-field-name').fill('Befund');
      await page.locator('#templateForm button.primary').click();
      await toast(page);
      assert.equal(await page.locator('#toast').textContent(), 'Höchstens 100 Vorlagen. Zuerst eine löschen.');
      assert.equal(await customCount(page), 100);
      assert.equal(JSON.parse(await page.evaluate(k => localStorage.getItem(k), KEY)).length, 100);
      // Editing an existing template at the limit still works.
      await page.locator('#templateDialog').evaluate(d => d.close());
      await page.selectOption('#template', 'custom-t5');
      await page.locator('#editTemplate').click();
      await page.locator('#templateName').fill('Umbenannt');
      await page.locator('#templateForm button.primary').click();
      await page.reload();
      assert.equal(await customCount(page), 100);
      assert.equal(await page.locator('#template option[value="custom-t5"]').textContent(), 'Umbenannt');
      await context.close();
    }

    // An unreadable saved library (e.g. 101 entries) is kept under its own key and reported.
    {
      const { context, page } = await open(library(101));
      await toast(page);
      assert.equal(await page.locator('#toast').textContent(), 'Gespeicherte Vorlagen konnten nicht gelesen werden. Sie bleiben in diesem Browser unverändert erhalten.');
      assert.equal(await customCount(page), 0);
      assert.equal(JSON.parse(await page.evaluate(k => localStorage.getItem(k + '-unreadable'), KEY)).length, 101, 'copy kept');
      await context.close();
    }

    assert.deepEqual(errors, []);
    console.log('Vorlagengrenzen: 101. Vorlage abgelehnt, Bearbeiten an der Grenze, unlesbare Bibliothek bleibt erhalten bestanden.');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
