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
  await assert.rejects(P.listModels(P.DEFAULT_ENDPOINTS.lmstudio, { fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }) }), e => e.status === 404);
  assert.match(P.connectionError(false, 'lmstudio'), /enable CORS/);

  // Launcher forwards GET for model lists only.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-lm-'));
  fs.writeFileSync(path.join(root, 'befundungstool.html'), '<script></script>');
  const upstream = [];
  const server = createServer({ root, upstreamFetch: async (url, init) => { upstream.push({ url, init }); return new Response(JSON.stringify(listing), { status: 200 }); } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const token = (await (await fetch(base + '/')).text()).match(/token:"([0-9a-f]{64})"/)[1];
    const api = body => fetch(base + '/api', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json', Origin: base, 'x-local-token': token } });
    assert.equal((await api({ url: 'http://127.0.0.1:1234/v1/models', method: 'GET', headers: {} })).status, 200);
    assert.equal(upstream[0].init.method, 'GET');
    assert.equal(upstream[0].init.body, undefined);
    assert.equal((await api({ url: 'http://127.0.0.1:1234/v1/chat/completions', method: 'GET', headers: {} })).status, 400, 'GET only for model lists');
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
