'use strict';
// AI contract, provider requests/retries/errors and diff. Mocked fetch only; synthetic text only.
const assert = require('node:assert/strict');
const Contract = require('../../src/ai/contract.js');
const P = require('../../src/ai/providers.js');
const Diff = require('../../src/ai/diff.js');

const sections = [
  { id: 'findings', label: 'Befund', text: 'Kein Pleuraerguss rechts. Herz normal gross.', protected: ['Kein Pleuraerguss rechts.'] },
  { id: 'impression', label: 'Beurteilung', text: 'Unauffaellig.', protected: [] }
];
const ids = sections.map(s => s.id);

function response(status, data, headers = {}) {
  return { ok: status >= 200 && status < 300, status, headers: { get: name => headers[name] ?? null }, json: async () => { if (data === undefined) throw new Error('no json'); return data; } };
}

(async () => {
  // Prompts: contract appended, note language, prompt limits.
  const system = Contract.systemPrompt('revise', Contract.DEFAULT_PROMPTS.revise, 'de');
  assert.match(system, /Response contract: Return ONLY valid JSON with sections/);
  assert.match(system, /Write review notes in German\.$/);
  assert.match(Contract.systemPrompt('review', 'x', 'en'), /Review only\. Do not rewrite the report\..*English\.$/s);
  assert.match(Contract.systemPrompt('review', 'x', 'en', { example: true }), /Output shape example/);
  assert.throws(() => Contract.systemPrompt('review', ' ', 'de'));
  assert.throws(() => Contract.systemPrompt('review', 'x'.repeat(20001), 'de'));

  const input = JSON.parse(Contract.userInput({ sections, template: { name: 'Strukturiert', style: 'Knapp.' }, reportLanguage: 'German' }));
  assert.deepEqual(input.sections[0].protected, ['Kein Pleuraerguss rechts.']);
  assert.equal(input.sections[1].protected, undefined);
  assert.deepEqual(input.template, { name: 'Strukturiert', style: 'Knapp.' });

  // Strict parsing.
  const revise = { sections: [{ id: 'findings', text: 'Kein Pleuraerguss rechts. Herz normal groß.' }], issues: [{ category: 'Spelling', detail: 'gross → groß', section: 'findings' }], changes: ['Rechtschreibung'] };
  assert.deepEqual(Contract.parse('```json\n' + JSON.stringify(revise) + '\n```', 'revise', ids).sections, revise.sections);
  assert.equal(Contract.parse(JSON.stringify({ ...revise, issues: [{ category: 'X', detail: 'Y', section: 'unknown' }] }), 'revise', ids).issues[0].section, null);
  assert.deepEqual(Contract.parse(JSON.stringify({ issues: [], changes: [] }), 'review', ids), { issues: [], changes: [] });
  for (const bad of [
    'Here is the revised report: ...',
    JSON.stringify({ issues: [], changes: [] }),
    JSON.stringify({ ...revise, sections: [{ id: 'other', text: 'x' }] }),
    JSON.stringify({ ...revise, sections: [revise.sections[0], revise.sections[0]] }),
    JSON.stringify({ ...revise, sections: [{ id: 'findings', text: 5 }] }),
    JSON.stringify({ ...revise, issues: [{ category: 'X' }] }),
    JSON.stringify({ ...revise, changes: [1] }),
    'null', '[]'
  ]) assert.throws(() => Contract.parse(bad, 'revise', ids), /Unexpected response format/);

  assert(Contract.protectedIntact(['Kein Pleuraerguss rechts.'], 'Kein Pleuraerguss rechts. Herz normal groß.'));
  assert(!Contract.protectedIntact(['Kein Pleuraerguss rechts.'], 'Kein Pleuraerguss links. Herz normal groß.'));
  assert(!Contract.protectedIntact(['a', 'a'], 'a only once'));

  // Requests per provider.
  const openai = P.buildRequest('openai', P.DEFAULT_ENDPOINTS.openai, 'sk-synthetic', 'synthetic-model', 'sys', 'in');
  assert.equal(openai.headers.Authorization, 'Bearer sk-synthetic');
  assert.equal(openai.body.store, false);
  assert.deepEqual(openai.body.messages.map(m => m.role), ['system', 'user']);
  assert.throws(() => P.buildRequest('openai', P.DEFAULT_ENDPOINTS.openai, '', 'm', 's', 'i'), /Enter your API key/);
  const gemini = P.buildRequest('gemini', P.DEFAULT_ENDPOINTS.gemini, 'g-synthetic', 'models/gemini-synthetic', 'sys', 'in');
  assert.equal(gemini.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-synthetic:generateContent');
  assert.equal(gemini.headers['x-goog-api-key'], 'g-synthetic');
  assert.equal(gemini.headers.Authorization, undefined);
  assert.equal(gemini.body.systemInstruction.parts[0].text, 'sys');
  assert.throws(() => P.buildRequest('gemini', P.DEFAULT_ENDPOINTS.gemini, 'k', 'bad id!', 's', 'i'), /Invalid Gemini model ID/);
  const local = P.buildRequest('compatible', 'http://127.0.0.1:1234/v1/chat/completions', '', 'local-model', 's', 'i');
  assert.equal(local.headers.Authorization, undefined);
  assert.equal(local.body.store, undefined);
  for (const endpoint of ['http://example.test/v1', 'https://user:pw@example.test/v1', 'https://example.test/v1?key=x', 'not a url']) {
    assert.throws(() => P.buildRequest('compatible', endpoint, '', 'm', 's', 'i'));
  }
  assert.throws(() => P.buildRequest('none', '', '', 'm', 's', 'i'), /Choose an AI provider/);

  // Retries: two transient failures, then success; Retry-After honoured; no retry for auth errors.
  const waits = [];
  const realTimeout = global.setTimeout;
  global.setTimeout = (fn, ms) => { waits.push(ms); return realTimeout(fn, 0); };
  let calls = 0;
  const flaky = async () => (++calls < 3 ? response(503, { error: { message: 'Synthetic upstream text with report content' } }, calls === 2 ? { 'Retry-After': '5' } : {}) : response(200, { choices: [{ finish_reason: 'stop', message: { content: '{"issues":[],"changes":[]}' } }] }));
  const retried = [];
  const data = await P.sendRequest(openai, { fetchImpl: flaky, onRetry: r => retried.push(r) });
  global.setTimeout = realTimeout;
  assert.equal(calls, 3);
  assert.deepEqual(waits, [2000, 5000]);
  assert.deepEqual(retried.map(r => r.attempt), [1, 2]);
  assert.equal(P.responseText(data, 'openai'), '{"issues":[],"changes":[]}');

  calls = 0;
  await assert.rejects(P.sendRequest(openai, { fetchImpl: async () => { calls++; return response(401, { error: { code: 'invalid_api_key', message: 'Synthetic secret detail' } }); } }), error => {
    assert.equal(error.name, 'ProviderError');
    assert.equal(error.status, 401);
    assert.equal(error.code, 'invalid_api_key');
    assert.equal(error.hint, 'Check your API key.');
    assert(!error.message.includes('Synthetic secret detail'), 'upstream text must not be exposed');
    return true;
  });
  assert.equal(calls, 1);
  await assert.rejects(P.sendRequest(openai, { fetchImpl: async () => response(418, { error: { code: 'teapot_leak' } }) }), e => e.hint === 'Provider request failed.' && e.code === null);
  await assert.rejects(P.sendRequest(openai, { fetchImpl: async () => response(200, undefined) }), /non-JSON/);

  // Cancelling during a retry wait rejects with AbortError.
  const controller = new AbortController();
  const pending = P.sendRequest(openai, { signal: controller.signal, fetchImpl: async () => response(503, {}), onRetry: () => controller.abort() });
  await assert.rejects(pending, e => e.name === 'AbortError');

  // Via the local launcher, the whole request goes to /api with the session token.
  let seen;
  await P.sendRequest(openai, { viaLocal: true, localToken: 'tok', fetchImpl: async (url, init) => { seen = { url, init }; return response(200, {}); } });
  assert.equal(seen.url, '/api');
  assert.equal(seen.init.headers['x-local-token'], 'tok');
  assert.equal(JSON.parse(seen.init.body).url, P.DEFAULT_ENDPOINTS.openai);

  // Response text extraction.
  assert.throws(() => P.responseText({ choices: [{ finish_reason: 'length', message: { content: '{' } }] }, 'openai'), e => e.code === 'length');
  assert.throws(() => P.responseText({ choices: [{ message: { content: ' ' } }] }, 'compatible'), /no text/);
  assert.equal(P.responseText({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'hidden' }, { text: '{"a":1}' }] } }] }, 'gemini'), '{"a":1}');
  assert.throws(() => P.responseText({ candidates: [] }, 'gemini'), /no candidate/);

  // Diff and sensitive wording.
  const diff = Diff.textDiff('Kein Erguss rechts.', 'Kein Erguss links.');
  assert.deepEqual(diff.parts.filter(p => p.kind !== 'equal').map(p => [p.kind, p.text]), [['delete', 'rechts'], ['insert', 'links']]);
  assert(Diff.hasSensitiveWording('links') && Diff.hasSensitiveWording('12 mm') && !Diff.hasSensitiveWording('Erguss'));
  assert(Diff.textDiff('a '.repeat(1200), 'b '.repeat(1200)).coarse);

  console.log('KI-Kern: Prompt-Vertrag, strikte Antwortprüfung, Fixierungsprüfung, Anbieteranfragen, Wiederholungen, Fehlerdarstellung, Abbruch, Diff bestanden.');
})().catch(error => { console.error(error); process.exit(1); });
