/* API provider requests (adapted from Report Studio v1.6.0): OpenAI Chat Completions, Google Gemini,
   and any OpenAI-compatible endpoint. Never switches providers or falls back to another service.
   Errors carry a translatable `hint` and never echo arbitrary upstream text (it may contain report content). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AiProviders = api;
})(globalThis, function () {
  'use strict';

  // lmstudio: LM Studio's local OpenAI-compatible server (GGUF models stay on this PC; no key).
  const API_PROVIDERS = ['openai', 'gemini', 'compatible', 'lmstudio'];
  const DEFAULT_ENDPOINTS = {
    openai: 'https://api.openai.com/v1/chat/completions',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
    compatible: '',
    lmstudio: 'http://127.0.0.1:1234/v1/chat/completions'
  };
  const HINTS = {
    400: 'Check the API format, endpoint and model.',
    401: 'Check your API key.',
    403: 'Check key restrictions and account permissions.',
    404: 'Check the endpoint and model ID.',
    429: 'Quota or rate limit reached.',
    500: 'The provider encountered an internal error. Try again later.',
    502: 'The local launcher could not reach the provider. Check the endpoint and network.',
    503: 'The provider or gateway is temporarily unavailable or overloaded. Try again later or select another available model.',
    504: 'The provider or gateway timed out. Try a shorter report or try again later.'
  };
  // Only these well-known codes are shown; other upstream text is suppressed.
  const KNOWN_CODES = ['tier_not_allowed', 'rate_limit_exceeded', 'quota_exceeded', 'insufficient_quota', 'model_not_allowed', 'invalid_api_key', 'permission_denied', '1300'];
  const MAX_RETRY_AFTER_MS = 30000;

  /* A report that does not fit the model (prompt over the context, or an answer cut off at the
     output limit) always gets this message. A cut-off answer is discarded, never shown or applied.
     tokens: { used, limit } when known. */
  const TOO_LONG = "The report is too long for this model's context. Shorten the report, use Review instead of Revise, or choose a model with a larger context.";
  const TOO_LONG_LMSTUDIO = "The report is too long for this model's context. Shorten the report, use Review instead of Revise, or increase the model's context length in LM Studio.";
  const tooLongHint = provider => (provider === 'lmstudio' ? TOO_LONG_LMSTUDIO : TOO_LONG);

  class ProviderError extends Error {
    constructor(hint, { status = null, code = null, tokens = null } = {}) {
      super(hint);
      this.name = 'ProviderError';
      this.hint = hint;
      this.status = status;
      this.code = code;
      this.tokens = tokens;
    }
  }

  // Context overflow as reported by OpenAI (code), Gemini, LM Studio/llama.cpp and other servers.
  // Only used to classify the error; the upstream text itself is never shown.
  const CONTEXT_PATTERN = /context[ _-]?(length|window|size|overflow)|n_ctx|maximum context|too many tokens|input token count|prompt is too long|exceeds? the (maximum|max)|tokens to keep|longer than the model/i;
  function contextExceeded(data) {
    const code = String(data?.code ?? data?.error?.code ?? '');
    if (code === 'context_length_exceeded') return true;
    const message = data?.error?.message ?? data?.message ?? data?.error ?? '';
    return typeof message === 'string' && CONTEXT_PATTERN.test(message.slice(0, 2000));
  }

  function defaultConnection(provider) {
    return { endpoint: DEFAULT_ENDPOINTS[provider] ?? '', model: '', apiKey: '' };
  }

  function validateURL(value) {
    let url;
    try { url = new URL(value); } catch { throw new ProviderError('Enter a valid endpoint URL.'); }
    if (url.username || url.password || url.hash || url.search) throw new ProviderError('Use an endpoint without credentials, query parameters, or fragments.');
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new ProviderError('Use HTTPS, or HTTP on localhost.');
    }
    return url.href;
  }

  /* OpenAI-style APIs: the endpoint field takes either the full chat URL or the base URL that provider
     docs list (like `base_url` in the OpenAI libraries), e.g. https://api.mistral.ai/v1 or
     https://generativelanguage.googleapis.com/v1beta/openai. Anything not already ending in
     /chat/completions gets it appended; model lists use the same base plus /models. Posting to a bare
     base URL usually hits a route without CORS headers, which the browser reports as a network error. */
  function chatEndpoint(href) {
    const url = new URL(href);
    if (/\/chat\/completions\/?$/.test(url.pathname)) return href;
    url.pathname = url.pathname.replace(/\/+$/, '') + '/chat/completions';
    return url.href;
  }

  // options.schema: JSON Schema for structured output (LM Studio enforces it with a grammar).
  function buildRequest(provider, endpoint, key, model, system, input, options = {}) {
    if (!API_PROVIDERS.includes(provider)) throw new ProviderError('Choose an AI provider.');
    if (!model) throw new ProviderError('Enter the model ID.');
    const headers = { 'Content-Type': 'application/json' };
    let url = validateURL(endpoint);
    let body;
    if (provider === 'gemini') {
      if (!key) throw new ProviderError('Enter your API key.');
      const id = model.replace(/^models\//, '');
      if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new ProviderError('Invalid Gemini model ID.');
      url = url.replace(/\/$/, '').replace(/\/models\/[^/]+:generateContent$/, '/models');
      if (!url.endsWith('/models')) throw new ProviderError('Gemini endpoint must end with /models.');
      url += '/' + encodeURIComponent(id) + ':generateContent';
      headers['x-goog-api-key'] = key;
      body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: input }] }],
        generationConfig: { responseMimeType: 'application/json' }
      };
    } else {
      url = chatEndpoint(url);
      if (provider === 'openai' && new URL(url).hostname === 'api.openai.com' && !key) throw new ProviderError('Enter your API key.');
      if (key) headers.Authorization = 'Bearer ' + key;
      body = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: input }] };
      if (provider === 'openai') body.store = false;
      if (provider === 'lmstudio' && options.schema) body.response_format = { type: 'json_schema', json_schema: { name: 'befundungstool_result', strict: true, schema: options.schema } };
    }
    return { url, headers, body };
  }

  function abortError() {
    const error = new Error('Cancelled');
    error.name = 'AbortError';
    return error;
  }

  function retryWait(ms, signal) {
    return new Promise((resolve, reject) => {
      const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(abortError()); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
      if (signal?.aborted) return abort();
      signal?.addEventListener('abort', abort, { once: true });
    });
  }

  function retryAfterMs(response) {
    const header = response.headers?.get?.('Retry-After');
    if (!header) return 0;
    return /^\d+$/.test(header) ? Number(header) * 1000 : Math.max(0, Date.parse(header) - Date.now());
  }

  /* Sends one request with at most two retries for HTTP 500/503/504.
     With `viaLocal`, the request goes through the loopback launcher's /api proxy. */
  async function sendRequest(request, { signal, onRetry, fetchImpl = globalThis.fetch, viaLocal = false, localToken = '', provider = '' } = {}) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetchImpl(viaLocal ? '/api' : request.url, {
        method: 'POST', redirect: 'error', signal,
        headers: viaLocal ? { 'Content-Type': 'application/json', 'x-local-token': localToken } : request.headers,
        body: JSON.stringify(viaLocal ? request : request.body)
      });
      const data = await response.json().catch(() => null);
      if (response.ok) {
        if (!data) throw new ProviderError('The endpoint returned non-JSON data. Check its URL.');
        return data;
      }
      const retryAfter = retryAfterMs(response);
      if ([500, 503, 504].includes(response.status) && attempt < 2 && (!Number.isFinite(retryAfter) || retryAfter <= MAX_RETRY_AFTER_MS)) {
        const wait = Math.max(Number.isFinite(retryAfter) ? retryAfter : 0, 2000 * 2 ** attempt);
        onRetry?.({ status: response.status, attempt: attempt + 1, seconds: Math.ceil(wait / 1000) });
        await retryWait(wait, signal);
        continue;
      }
      if ([400, 413, 422, 500].includes(response.status) && contextExceeded(data)) throw new ProviderError(tooLongHint(provider), { status: response.status, code: 'context' });
      const candidate = String(data?.code ?? data?.error?.code ?? '');
      throw new ProviderError(HINTS[response.status] || 'Provider request failed.', {
        status: response.status, code: KNOWN_CODES.includes(candidate) ? candidate : null
      });
    }
  }

  function responseText(data, provider) {
    if (provider === 'gemini') {
      const candidate = data?.candidates?.[0];
      if (!candidate) throw new ProviderError('Gemini returned no candidate. The response may be blocked.');
      if (candidate.finishReason === 'MAX_TOKENS') throw new ProviderError(TOO_LONG, { code: 'context' });
      if (candidate.finishReason && candidate.finishReason !== 'STOP') throw new ProviderError('The model did not finish normally.', { code: String(candidate.finishReason).slice(0, 40) });
      const text = candidate.content?.parts?.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('');
      if (!text) throw new ProviderError('The API returned no text. Check model compatibility.');
      return text;
    }
    const choice = data?.choices?.[0];
    if (choice?.finish_reason === 'length') throw new ProviderError(tooLongHint(provider), { code: 'context' });
    if (choice?.finish_reason && choice.finish_reason !== 'stop') throw new ProviderError('The model did not finish normally.', { code: String(choice.finish_reason).slice(0, 40) });
    if (typeof choice?.message?.content !== 'string' || !choice.message.content.trim()) throw new ProviderError('The API returned no text. Check model compatibility.');
    return choice.message.content;
  }

  function connectionError(viaLocal, provider) {
    if (provider === 'lmstudio' && !viaLocal) return 'LM Studio is not reachable from the browser. Start the LM Studio server and enable CORS (Developer → Server settings), or open the app through the local launcher.';
    return viaLocal
      ? 'Local connection failed. Check the terminal running the launcher and your network.'
      : 'Direct browser connection failed (network, CORS, or browser restrictions). Check the endpoint (the provider’s base URL, e.g. https://api.mistral.ai/v1) or try the local launcher.';
  }

  // key: sent as a Bearer token when given (hosted APIs such as Mistral require it for the model list).
  async function listModels(endpoint, { signal, fetchImpl = globalThis.fetch, viaLocal = false, localToken = '', key = '' } = {}) {
    const url = new URL(chatEndpoint(validateURL(endpoint)));
    url.pathname = url.pathname.replace(/\/chat\/completions\/?$/, '').replace(/\/$/, '') + '/models';
    const auth = key ? { Authorization: 'Bearer ' + key } : {};
    const response = viaLocal
      ? await fetchImpl('/api', { method: 'POST', redirect: 'error', signal, headers: { 'Content-Type': 'application/json', 'x-local-token': localToken }, body: JSON.stringify({ url: url.href, method: 'GET', headers: auth }) })
      : await fetchImpl(url.href, { method: 'GET', redirect: 'error', signal, ...(key ? { headers: auth } : {}) });
    if (!response.ok) throw new ProviderError(HINTS[response.status] || 'Provider request failed.', { status: response.status });
    const data = await response.json().catch(() => null);
    if (!Array.isArray(data?.data)) throw new ProviderError('The endpoint returned non-JSON data. Check its URL.');
    return data.data.map(m => String(m?.id || '')).filter(id => id && !/embed/i.test(id)).slice(0, 200);
  }

  return {
    API_PROVIDERS, DEFAULT_ENDPOINTS, HINTS, KNOWN_CODES, ProviderError, TOO_LONG, TOO_LONG_LMSTUDIO, contextExceeded,
    defaultConnection, validateURL, chatEndpoint, buildRequest, listModels, sendRequest, responseText, connectionError, retryWait
  };
});
