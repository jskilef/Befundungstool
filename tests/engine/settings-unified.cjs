'use strict';
// Unified settings format, legacy imports (radnote, Report Studio) and settings encryption. Synthetic data only.
const assert = require('node:assert/strict');
const S = require('../../src/settings/unified.js');
const C = require('../../src/settings/config.js');
const Crypto = require('../../src/settings/crypto.js');
const { reportStudioEncrypt } = require('../helpers/report-studio.cjs');

let counter = 0;
const newId = () => 'custom-import-' + (++counter);

const settings = { language: 'de', theme: 'dark', builder: 'none', selectedTemplate: 'structured', saveDraft: false, macrosOpen: true, shortcutsOpen: false, settingsOpen: true, chestStyle: 'standard', chestAuto: true };
const macro = { title: 'Rechts', code: 're', text: 'rechts', trigger: 'space', category: 'general', favorite: false };
const template = { id: 'custom-t1', name: 'CT Abdomen', fields: [{ id: 'custom-f1', label: 'Befund', defaultText: 'Regelrecht.' }], aiInstructions: 'Knapp formulieren.' };
const ai = {
  provider: 'openai', reportLanguage: 'German',
  profiles: { openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'synthetic-model', apiKey: 'sk-synthetic-key' } }
};
const state = { macros: [macro], templates: [template], chestFavorites: [], builderFavorites: { head: [], skeleton: [], esophagram: [] }, settings, ai };
const empty = { macros: [], templates: [], chestFavorites: [], settings: { ...settings, selectedTemplate: 'structured' } };

(async () => {
  // Own format round trip; API keys are stripped unless requested.
  const plain = S.serialize(state, { appVersion: '0.1.0' });
  assert.equal(plain.format, 'befundungstool-settings');
  assert.equal(plain.version, 1);
  assert(!JSON.stringify(plain).includes('sk-synthetic-key'), 'plain export must not contain API keys');
  assert.equal(S.serialize(state, { includeKeys: true }).ai.profiles.openai.apiKey, 'sk-synthetic-key');
  assert(S.hasKeys(state.ai) && !S.hasKeys(plain.ai));

  const parsed = S.parse(JSON.parse(JSON.stringify(plain)), newId);
  assert.equal(parsed.kind, 'settings');
  assert.equal(parsed.templates[0].aiInstructions, 'Knapp formulieren.');
  const merged = S.merge(empty, parsed, newId);
  assert.deepEqual(merged.templates, [template]);
  assert.deepEqual(merged.ai.profiles.openai, { endpoint: ai.profiles.openai.endpoint, model: 'synthetic-model' });
  assert.deepEqual(S.merge(merged, parsed, newId).templates, merged.templates, 'identical import must be idempotent');

  // Legacy radnote files still load.
  const radnote = { format: C.format, version: 2, macros: [macro], templates: [{ id: 'custom-t1', name: 'Alt', fields: template.fields }], chestFavorites: [], settings };
  assert.equal(S.parse(radnote, newId).kind, 'settings');
  assert.equal(S.parse([{ title: 'Alt', code: '.alt', text: 'Text' }], newId).kind, 'macros');
  assert.throws(() => S.parse({ ...plain, version: 2 }, newId), /Unsupported configuration version/);

  // Feature switches: optional booleans for known tools only.
  const withFeatures = JSON.parse(JSON.stringify(plain));
  withFeatures.settings.features = { builders: false, meta: false };
  assert.deepEqual(S.parse(withFeatures, newId).settings.features, { builders: false, meta: false });
  for (const bad of [{ builders: 'no' }, { unknown: true }, []]) {
    const broken = JSON.parse(JSON.stringify(plain));
    broken.settings.features = bad;
    assert.throws(() => S.parse(broken, newId));
  }

  // Invalid AI sections are rejected before anything is applied.
  const badAi = [
    a => a.provider = 'unknown',
    a => a.profiles.openai.endpoint = 'https://example.test/v1?key=1',
    a => a.profiles.openai.endpoint = 'http://example.test/v1',
    a => a.profiles.webllm = { endpoint: '', model: 'x', apiKey: 'leak' },
    a => a.prompts = { review: '', revise: 'x' },
    a => a.reportLanguage = 'French'
  ];
  for (const change of badAi) {
    const bad = JSON.parse(JSON.stringify(plain));
    change(bad.ai);
    assert.throws(() => S.parse(bad, newId));
  }
  assert(S.validEndpoint('http://127.0.0.1:1234/v1/chat/completions'));

  // Report Studio template bodies become field templates.
  const rsBody = 'Clinical indication:\n\nTechnique:\n\nComparison:\n\nFindings:\nNo acute findings.\n\nImpression:\n';
  assert.deepEqual(S.splitTemplateBody(rsBody, newId).map(f => [f.label, f.defaultText]),
    [['Clinical indication', ''], ['Technique', ''], ['Comparison', ''], ['Findings', 'No acute findings.'], ['Impression', '']]);
  assert.deepEqual(S.splitTemplateBody('Freier Text ohne Überschrift', newId).map(f => [f.label, f.defaultText]), [['Text', 'Freier Text ohne Überschrift']]);
  assert.deepEqual(S.splitTemplateBody('Vorspann\nBefund:\nSeitengleich: regelrecht.', newId).map(f => [f.label, f.defaultText]),
    [['Text', 'Vorspann'], ['Befund', 'Seitengleich: regelrecht.']]);
  assert.deepEqual(S.splitTemplateBody('', newId).map(f => f.label), ['Befund']);

  const reportStudio = {
    version: 1, endpoint: 'https://api.openai.com/v1/chat/completions', apiKey: 'sk-synthetic-rs', model: 'synthetic-model',
    language: 'German', uiLanguage: 'de', provider: 'openai',
    templates: [
      { name: 'General radiology', body: rsBody, instructions: 'Use concise radiology prose.' },
      { name: 'CT Abdomen', body: 'Befund:\n\nBeurteilung:\n', instructions: '' }
    ],
    prompts: { review: 'Synthetic review prompt.', revise: 'Synthetic revise prompt.' },
    providerProfiles: { gemini: { endpoint: 'https://generativelanguage.googleapis.com/v1beta/models', apiKey: '', model: 'synthetic-gemini' } }
  };
  const rs = S.parse(reportStudio, newId);
  assert.equal(rs.kind, 'report-studio');
  assert.equal(rs.templates[0].aiInstructions, 'Use concise radiology prose.');
  assert.equal(rs.templates[1].aiInstructions, undefined);
  assert.equal(rs.ai.profiles.openai.apiKey, 'sk-synthetic-rs');
  assert.equal(rs.ai.prompts.revise, 'Synthetic revise prompt.');

  // Importing Report Studio keeps editor settings and macros, appends templates, renames name conflicts.
  const rsMerged = S.merge(merged, rs, newId);
  assert.deepEqual(rsMerged.settings, merged.settings);
  assert.deepEqual(rsMerged.macros, merged.macros);
  assert.equal(rsMerged.templates.length, 3);
  assert.equal(rsMerged.templates[2].name, 'CT Abdomen (Import 2)');
  assert(C.validTemplates(rsMerged.templates));
  assert.equal(rsMerged.ai.provider, 'openai');
  assert.throws(() => S.parse({ ...reportStudio, templates: [] }, newId));

  // Encryption: own round trip, wrong password, tampering, envelope binding, Report Studio envelopes.
  await assert.rejects(Crypto.encrypt(plain, 'short'), /at least 12/);
  const password = 'synthetic-password-1';
  const sealed = await Crypto.encrypt(S.serialize(state, { includeKeys: true }), password);
  assert.equal(sealed.format, 'befundungstool-encrypted-settings');
  assert(!JSON.stringify(sealed).includes('sk-synthetic-key'));
  assert.equal(S.parse(await Crypto.decrypt(sealed, password), newId).ai.profiles.openai.apiKey, 'sk-synthetic-key');
  await assert.rejects(Crypto.decrypt(sealed, 'wrong-password-123'), /Incorrect password or damaged settings file/);
  const tampered = { ...sealed, ciphertext: sealed.ciphertext.replace(/^./, c => (c === 'A' ? 'B' : 'A')) };
  await assert.rejects(Crypto.decrypt(tampered, password), /Incorrect password or damaged settings file/);
  assert.throws(() => Crypto.readEnvelope({ ...sealed, iterations: 1000 }), /Invalid encrypted settings file/);
  await assert.rejects(Crypto.decrypt({ ...sealed, format: 'report-studio-encrypted-settings', version: 2 }, password),
    /Incorrect password or damaged settings file/, 'AAD must bind the ciphertext to its envelope format');

  const rsSealed = await reportStudioEncrypt(reportStudio, password);
  assert(Crypto.isEncrypted(rsSealed));
  assert.equal(S.parse(await Crypto.decrypt(rsSealed, password), newId).kind, 'report-studio');
  assert(!Crypto.isEncrypted({ version: 2, macros: [macro] }), 'radnote macro files are not encrypted envelopes');

  assert.deepEqual(state.templates, [template], 'inputs must not be mutated');
  console.log('Einstellungen: eigenes Format, Schlüsseltrennung, radnote- und Report-Studio-Import, Vorlagenaufteilung, Verschlüsselung und Manipulationsschutz bestanden.');
})().catch(error => { console.error(error); process.exit(1); });
