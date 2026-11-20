'use strict';
// LM Studio provider: structured output, model list, launcher GET proxy, settings validation. Mocked fetch only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const P = require('../../src/ai/providers.js');
const Contract = require('../../src/ai/contract.js');
const S = require('../../src/settings/unified.js');
const C = require('../../src/settings/config.js');
const { createServer } = require('../../server/local-server.cjs');

(async () => {
  // Requests: loopback endpoint, no key needed, JSON schema enforced.
  assert.equal(P.DEFAULT_ENDPOINTS.lmstudio, 'http://127.0.0.1:1234/v1/chat/completions');
  const schema = Contract.responseSchema('revise');
  assert.deepEqual(schema.required, ['sections', 'issues', 'changes']);
  assert.deepEqual(Contract.responseSchema('review').required, ['issues', 'changes']);
  const req = P.buildRequest('lmstudio', P.DEFAULT_ENDPOINTS.lmstudio, '', 'radgen-qwen-lora', 'sys', 'in', { schema });
  assert.equal(req.headers.Authorization, undefined);
  assert.equal(req.body.response_format.type, 'json_schema');
  assert.deepEqual(req.body.response_format.json_schema.schema, schema);
  assert.equal(req.body.store, undefined);
  assert.equal(P.buildRequest('compatible', 'http://127.0.0.1:8080/v1/chat/completions', '', 'm', 's', 'i', { schema }).body.response_format, undefined, 'only LM Studio gets the schema');
  assert.throws(() => P.buildRequest('lmstudio', 'http://example.test/v1/chat/completions', '', 'm', 's', 'i'), /HTTPS, or HTTP on localhost/);

  // Model list: GET <base>/models, embedding models skipped.
  const listing = { data: [{ id: 'radgen-qwen-lora' }, { id: 'radgen-medgemma-lora' }, { id: 'text-embedding-nomic-embed-text-v1.5' }] };
  let seen;
  const ok = body => ({ ok: true, status: 200, json: async () => body });
  assert.deepEqual(await P.listModels(P.DEFAULT_ENDPOINTS.lmstudio, { fetchImpl: async (url, init) => { seen = { url, init }; return ok(listing); } }), ['radgen-qwen-lora', 'radgen-medgemma-lora']);
  assert.equal(seen.url, 'http://127.0.0.1:1234/v1/models');
  assert.equal(seen.init.method, 'GET');
  await P.listModels(P.DEFAULT_ENDPOINTS.lmstudio, { viaLocal: true, localToken: 'tok', fetchImpl: async (url, init) => { seen = { url, init }; return ok(listing); } });
  assert.equal(seen.url, '/api');
  assert.deepEqual(JSON.parse(seen.init.body), { url: 'http://127.0.0.1:1234/v1/models', method: 'GET', headers: {} });
  // Hosted APIs: key as Bearer token, base URLs completed (Mistral's /v1 → /v1/models).
  await P.listModels('https://api.eu.mistral.ai/v1', { key: 'sk-synthetic', fetchImpl: async (url, init) => { seen = { url, init }; return ok(listing); } });
  assert.equal(seen.url, 'https://api.eu.mistral.ai/v1/models');
  assert.equal(seen.init.headers.Authorization, 'Bearer sk-synthetic');
  await P.listModels('https://api.eu.mistral.ai/v1', { key: 'sk-synthetic', viaLocal: true, localToken: 'tok', fetchImpl: async (url, init) => { seen = { url, init }; return ok(listing); } });
  assert.deepEqual(JSON.parse(seen.init.body).headers, { Authorization: 'Bearer sk-synthetic' });
  await assert.rejects(P.listModels(P.DEFAULT_ENDPOINTS.lmstudio, { fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }) }), e => e.status === 404);
  assert.match(P.connectionError(false, 'lmstudio'), /enable CORS/);

  // Launcher forwards GET for model lists only.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-lm-'));
  fs.writeFileSync(path.join(root, 'befundungstool.html'), '<script></script>');
  const upstream = [];
  let upstreamReply = () => new Response(JSON.stringify(listing), { status: 200 });
  const server = createServer({ root, upstreamFetch: async (url, init) => { upstream.push({ url, init }); return upstreamReply(); } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const token = (await (await fetch(base + '/')).text()).match(/token:"([0-9a-f]{64})"/)[1];
    const api = body => fetch(base + '/api', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', Origin: base, 'x-local-token': token } });
    assert.equal((await api({ url: 'http://127.0.0.1:1234/v1/models', method: 'GET', headers: {} })).status, 200);
    assert.equal(upstream[0].init.method, 'GET');
    assert.equal(upstream[0].init.body, undefined);
    assert.equal((await api({ url: 'http://127.0.0.1:1234/v1/chat/completions', method: 'GET', headers: {} })).status, 400, 'GET only for model lists');
    // Context overflow passes through the launcher as a code only, never as upstream text.
    upstreamReply = () => new Response(JSON.stringify({ error: 'Trying to keep the first 9000 tokens when context the overflows. However, the model is loaded with context length of only 4096 tokens (synthetic)' }), { status: 400 });
    const overflow = await api({ url: 'http://127.0.0.1:1234/v1/chat/completions', method: 'POST', headers: {}, body: { model: 'm', messages: [] } });
    assert.equal(overflow.status, 400);
    assert.deepEqual(await overflow.json(), { error: 'Provider rejected request', code: 'context_length_exceeded' });
  } finally {
    server.close();
  }

  // Settings: LM Studio profiles and sidebar layout validate; unknown values are rejected.
  const ai = { provider: 'lmstudio', reportLanguage: 'German', profiles: { lmstudio: { endpoint: P.DEFAULT_ENDPOINTS.lmstudio, model: 'radgen-qwen-lora' } } };
  assert(S.validAi(ai));
  const base2 = { language: 'de', theme: 'auto', builder: 'none', selectedTemplate: 'structured', saveDraft: false, macrosOpen: true, shortcutsOpen: false, chestStyle: 'standard', chestAuto: true };
  assert(C.validSettings({ ...base2, sidebar: { side: 'left', width: 'wide', macros: true, shortcuts: false, notes: true } }));
  for (const bad of [{ side: 'top' }, { width: 'huge' }, { macros: 'yes' }, { other: true }]) assert(!C.validSettings({ ...base2, sidebar: bad }));
  console.log('LM Studio: strukturierte Ausgabe, Modellliste direkt und über Starter, Einstellungsprüfung, Seitenleisten-Validierung bestanden.');
})().catch(error => { console.error(error); process.exit(1); });

// Bounded structured output (prevents endless note loops) and clear length errors.
(async () => {
  const sections = [{ id: 'findings', text: 'x'.repeat(100) }, { id: 'impression', text: 'y' }];
  const revise = Contract.responseSchema('revise', { sections });
  assert.deepEqual(revise.properties.sections.items.properties.id.enum, ['findings', 'impression']);
  assert.equal(revise.properties.sections.maxItems, 2);
  assert.equal(revise.properties.sections.items.properties.text.maxLength, 400);
  assert.equal(revise.properties.issues.maxItems, 6);
  assert.equal(revise.properties.issues.items.properties.detail.maxLength, 300);
  assert.deepEqual(revise.properties.issues.items.properties.section.enum, ['findings', 'impression']);
  assert.equal(revise.properties.changes.maxItems, 6);
  assert.equal(Contract.responseSchema('review', { sections }).properties.sections, undefined);
  assert.equal(Contract.responseSchema('revise').properties.sections.items.properties.text.maxLength, undefined, 'unbounded without sections');

  // Hard limits apply to every provider's answer (audit: parser bounds).
  const ok = { sections: [{ id: 'findings', text: 'x' }], issues: Array.from({ length: 20 }, () => ({ category: 'c', detail: 'd'.repeat(2000) })), changes: [] };
  assert.equal(Contract.parse(JSON.stringify(ok), 'revise', ['findings']).issues.length, 20);
  for (const bad of [
    { ...ok, issues: [...ok.issues, { category: 'c', detail: 'd' }] },
    { ...ok, issues: [{ category: 'c', detail: 'd'.repeat(2001) }] },
    { ...ok, changes: Array.from({ length: 21 }, () => 'x') },
    { ...ok, sections: [{ id: 'findings', text: 'x'.repeat(20001) }] }
  ]) assert.throws(() => Contract.parse(JSON.stringify(bad), 'revise', ['findings']), /Unexpected response format/);
  assert.throws(() => Contract.parse(' '.repeat(200001), 'review', []), /Unexpected response format/);

  // Too long for the model: one specific message; a cut-off answer is discarded (no partial output).
  assert.throws(() => P.responseText({ choices: [{ finish_reason: 'length', message: { content: '{"sections":[' } }] }, 'compatible'),
    e => e.code === 'context' && e.hint === P.TOO_LONG && e.partial === undefined && !JSON.stringify(e).includes('sections'));
  assert.throws(() => P.responseText({ choices: [{ finish_reason: 'length', message: { content: '{' } }] }, 'lmstudio'), e => e.hint === P.TOO_LONG_LMSTUDIO);
  assert.throws(() => P.responseText({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'abc' }] } }] }, 'gemini'), e => e.code === 'context' && e.hint === P.TOO_LONG);
  assert.throws(() => P.responseText({ choices: [{ finish_reason: 'content_filter', message: { content: 'x' } }] }, 'openai'), e => e.code === 'content_filter');

  // Context overflow reported by the server (OpenAI code, llama.cpp/LM Studio and Gemini wording): same message.
  const failing = (status, body) => async () => ({ ok: false, status, headers: { get: () => null }, json: async () => body });
  const req = P.buildRequest('lmstudio', P.DEFAULT_ENDPOINTS.lmstudio, '', 'm', 's', 'i');
  for (const [provider, status, body] of [
    ['openai', 400, { error: { code: 'context_length_exceeded', message: 'synthetic' } }],
    ['lmstudio', 400, { error: 'Trying to keep the first 9000 tokens when context the overflows. However, the model is loaded with context length of only 4096 tokens' }],
    ['compatible', 400, { error: { message: 'the request exceeds the available context size, try increasing it' } }],
    ['gemini', 400, { error: { message: 'The input token count (1200000) exceeds the maximum number of tokens allowed (1048576).' } }],
    ['compatible', 400, { error: { code: 'context_length_exceeded' } }]
  ]) await assert.rejects(P.sendRequest(req, { provider, fetchImpl: failing(status, body) }), e => e.code === 'context' && e.hint === (provider === 'lmstudio' ? P.TOO_LONG_LMSTUDIO : P.TOO_LONG) && e.status === status, provider);
  await assert.rejects(P.sendRequest(req, { provider: 'openai', fetchImpl: failing(400, { error: { message: 'Invalid model synthetic' } }) }), e => e.code === null && e.hint === P.HINTS[400], 'other 400 errors unchanged');

  // Estimates for the pre-check: Review needs the bounded notes; Revise also every section once more.
  assert.equal(Contract.estimateTokens('x'.repeat(300)), 100);
  assert.equal(Contract.outputTokens('review', sections), 800);
  assert.equal(Contract.outputTokens('revise', sections), 800 + Math.ceil(Contract.estimateTokens('x'.repeat(100) + '\n' + 'y') * 1.1) + 80);
  console.log('Begrenzte Antworten: Schema-Grenzen, zu lange Befunde (Längenabbruch, Kontextüberlauf, Schätzung) ohne Teilantwort bestanden.');
})().catch(error => { console.error(error); process.exit(1); });
