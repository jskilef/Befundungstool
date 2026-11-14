/* Befundungstool settings file (format "befundungstool-settings", version 1).
   A superset of radnote's "radnote-settings" v2: custom templates may carry `aiInstructions`,
   and an optional `ai` section holds the AI connection, prompts and report language.
   Imports: own format, radnote settings v1/v2, legacy macro files, Report Studio plaintext v1
   (encrypted files are decrypted by SettingsCrypto first). Report text is never part of a settings file. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./config.js') : root.RadnoteConfig);
  if (node) module.exports = api;
  else root.BefundSettings = api;
})(globalThis, function (RadnoteConfig) {
  'use strict';

  const FORMAT = 'befundungstool-settings';
  const VERSION = 1;
  const PROVIDERS = ['none', 'openai', 'gemini', 'compatible', 'lmstudio', 'webllm', 'wasm'];
  const LOCAL_PROVIDERS = ['webllm', 'wasm'];
  const REPORT_LANGUAGES = ['Same as original', 'German', 'English'];
  const LOCAL_DTYPES = ['fp32', 'fp16', 'q8', 'int8', 'uint8', 'q4', 'q4f16', 'bnb4'];
  const MAX_INSTRUCTIONS = 20000;
  const MAX_PROMPT = 20000;

  const clone = value => JSON.parse(JSON.stringify(value));
  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const fail = () => { throw new Error('Invalid configuration file'); };

  // Same rules as Report Studio: HTTPS, or HTTP on a loopback host; no credentials, query or fragment.
  function validEndpoint(value) {
    if (value === '') return true;
    if (typeof value !== 'string' || value.length > 2000) return false;
    let url;
    try { url = new URL(value); } catch { return false; }
    if (url.username || url.password || url.hash || url.search) return false;
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  }

  function validProfile(provider, profile) {
    if (!isObject(profile) || typeof profile.endpoint !== 'string' || typeof profile.model !== 'string' || profile.model.length > 300) return false;
    if (profile.apiKey !== undefined && (typeof profile.apiKey !== 'string' || profile.apiKey.length > 4000)) return false;
    if (LOCAL_PROVIDERS.includes(provider)) return profile.endpoint === '' && !profile.apiKey;
    return validEndpoint(profile.endpoint);
  }

  function validPrompts(prompts) {
    return isObject(prompts) && ['review', 'revise'].every(k =>
      typeof prompts[k] === 'string' && prompts[k].trim() && prompts[k].length <= MAX_PROMPT);
  }

  function validAi(ai) {
    if (!isObject(ai) || !PROVIDERS.includes(ai.provider) || !REPORT_LANGUAGES.includes(ai.reportLanguage)) return false;
    if (!isObject(ai.profiles) || !Object.entries(ai.profiles).every(([p, profile]) =>
      PROVIDERS.includes(p) && p !== 'none' && validProfile(p, profile))) return false;
    if (ai.prompts !== undefined && !validPrompts(ai.prompts)) return false;
    if (ai.customModelDtype !== undefined && !LOCAL_DTYPES.includes(ai.customModelDtype)) return false;
    return true;
  }

  function normalizeAi(ai) {
    const out = { provider: ai.provider, reportLanguage: ai.reportLanguage, profiles: {} };
    for (const [provider, p] of Object.entries(ai.profiles)) {
      out.profiles[provider] = { endpoint: p.endpoint, model: p.model };
      if (p.apiKey) out.profiles[provider].apiKey = p.apiKey;
    }
    if (ai.prompts) out.prompts = { review: ai.prompts.review, revise: ai.prompts.revise };
    if (ai.customModelDtype) out.customModelDtype = ai.customModelDtype;
    return out;
  }

  function validInstructions(value) {
    return value === undefined || (typeof value === 'string' && value.length <= MAX_INSTRUCTIONS);
  }

  /* Report Studio template bodies are plain text with "Heading:" lines. Each heading becomes a field;
     text below it becomes the field's default text. Text before the first heading gets its own field. */
  function splitTemplateBody(body, newId) {
    const lines = String(body).replace(/\r\n?/g, '\n').split('\n');
    const sections = [];
    let current = null;
    for (const line of lines) {
      const heading = line.trim().match(/^([^:]{1,80}):$/);
      if (heading) {
        current = { label: heading[1].trim(), text: [] };
        sections.push(current);
      } else {
        if (!current) { current = { label: 'Text', text: [] }; sections.push(current); }
        current.text.push(line);
      }
    }
    const fields = sections
      .map(s => ({ label: s.label, defaultText: s.text.join('\n').replace(/^\n+|\s+$/g, '') }))
      .filter((f, i) => !(i === 0 && f.label === 'Text' && !f.defaultText));
    if (!fields.length) fields.push({ label: 'Befund', defaultText: '' });
    return fields.slice(0, 30).map(f => ({ id: newId(), label: f.label, defaultText: f.defaultText }));
  }

  function isReportStudioPlain(data) {
    return isObject(data) && !data.format && data.version === 1 && Array.isArray(data.templates) && typeof data.endpoint === 'string';
  }

  // Report Studio plaintext v1 (also the payload of its encrypted v2 files).
  function fromReportStudio(data, newId) {
    const okTemplates = data.templates.length && data.templates.length <= 200 && data.templates.every(t =>
      isObject(t) && typeof t.name === 'string' && t.name.trim() && typeof t.body === 'string' && typeof t.instructions === 'string');
    if (!okTemplates || typeof data.apiKey !== 'string' || typeof data.model !== 'string' ||
        !REPORT_LANGUAGES.includes(data.language)) fail();
    const provider = data.provider || (data.endpoint.includes('generativelanguage.googleapis.com') ? 'gemini' : 'openai');
    const profiles = {};
    for (const [p, profile] of Object.entries(isObject(data.providerProfiles) ? data.providerProfiles : {})) profiles[p] = clone(profile);
    profiles[provider] = { endpoint: LOCAL_PROVIDERS.includes(provider) ? '' : data.endpoint, model: data.model, apiKey: LOCAL_PROVIDERS.includes(provider) ? '' : data.apiKey };
    const ai = { provider, reportLanguage: data.language, profiles };
    if (data.prompts !== undefined) ai.prompts = data.prompts;
    if (data.customModelDtype !== undefined) ai.customModelDtype = data.customModelDtype;
    if (!validAi(ai)) fail();
    const templates = data.templates.slice(0, 100).map(t => ({
      id: newId(),
      name: t.name.trim().slice(0, 80),
      fields: splitTemplateBody(t.body, newId),
      ...(t.instructions.trim() ? { aiInstructions: t.instructions.slice(0, MAX_INSTRUCTIONS) } : {})
    }));
    if (!RadnoteConfig.validTemplates(templates)) fail();
    return { kind: 'report-studio', templates, ai: normalizeAi(ai) };
  }

  /* Parses an already decrypted (or plain) file. Returns
     { kind: 'macros' | 'settings' | 'report-studio', ... } like RadnoteConfig.parse, plus `ai` when present. */
  function parse(data, newId) {
    if (data && typeof data === 'object' && data.format === FORMAT) {
      if (data.version !== VERSION) throw new Error('Unsupported configuration version');
      if (data.ai !== undefined && !validAi(data.ai)) fail();
      if (!Array.isArray(data.templates) || !data.templates.every(t => isObject(t) && validInstructions(t.aiInstructions))) fail();
      const legacy = { ...data, format: RadnoteConfig.format, version: RadnoteConfig.version };
      delete legacy.ai;
      const parsed = RadnoteConfig.parse(legacy);
      const instructions = new Map(data.templates.map(t => [t.id, t.aiInstructions]));
      parsed.templates = parsed.templates.map(t => instructions.get(t.id) ? { ...t, aiInstructions: instructions.get(t.id) } : t);
      if (data.ai !== undefined) parsed.ai = normalizeAi(data.ai);
      return parsed;
    }
    if (isReportStudioPlain(data)) return fromReportStudio(data, newId);
    return RadnoteConfig.parse(data);
  }

  /* Merges an import into the current configuration without touching report text.
     current: { macros, templates, chestFavorites, builderFavorites?, settings, ai? } */
  function merge(current, incoming, newId) {
    if (incoming.kind === 'report-studio') {
      const asSettings = { kind: 'settings', macros: [], templates: incoming.templates, chestFavorites: [], settings: current.settings };
      const merged = RadnoteConfig.merge(current, asSettings, newId);
      return { ...merged, settings: clone(current.settings), ai: clone(incoming.ai) };
    }
    const merged = RadnoteConfig.merge(current, incoming, newId);
    const ai = incoming.ai || current.ai;
    return ai ? { ...merged, ai: clone(ai) } : merged;
  }

  // Strips API keys unless explicitly requested; a file with keys must then be encrypted by the caller.
  function serialize(state, { appVersion, includeKeys = false } = {}) {
    const out = {
      format: FORMAT, version: VERSION, appVersion,
      macros: clone(state.macros), templates: clone(state.templates), chestFavorites: clone(state.chestFavorites)
    };
    if (state.builderFavorites !== undefined) out.builderFavorites = clone(state.builderFavorites);
    out.settings = clone(state.settings);
    if (state.ai) {
      const ai = normalizeAi(state.ai);
      if (!includeKeys) for (const profile of Object.values(ai.profiles)) delete profile.apiKey;
      out.ai = ai;
    }
    return out;
  }

  function hasKeys(ai) {
    return !!ai && Object.values(ai.profiles || {}).some(p => p.apiKey);
  }

  return {
    FORMAT, VERSION, PROVIDERS, LOCAL_PROVIDERS, REPORT_LANGUAGES, LOCAL_DTYPES,
    validEndpoint, validAi, splitTemplateBody, parse, merge, serialize, hasKeys
  };
});
