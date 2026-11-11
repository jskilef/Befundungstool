/* API provider requests (adapted from Report Studio v1.6.0): OpenAI Chat Completions, Google Gemini,
   and any OpenAI-compatible endpoint. Never switches providers or falls back to another service.
   Errors carry a translatable `hint` and never echo arbitrary upstream text (it may contain report content). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AiProviders = api;
})(globalThis, function () {
  'use strict';

  const API_PROVIDERS = ['openai', 'gemini', 'compatible'];
  const DEFAULT_ENDPOINTS = {
    openai: 'https://api.openai.com/v1/chat/completions',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/models',
    compatible: ''
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

  class ProviderError extends Error {
    constructor(hint, { status = null, code = null } = {}) {
      super(hint);
      this.name = 'ProviderError';
      this.hint = hint;
      this.status = status;
      this.code = code;
    }
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

  function buildRequest(provider, endpoint, key, model, system, input) {
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
      if (provider === 'openai' && new URL(url).hostname === 'api.openai.com' && !key) throw new ProviderError('Enter your API key.');
      if (key) headers.Authorization = 'Bearer ' + key;
      body = { model, messages: [{ role: 'system', content: system }, { role: 'user', content: input }] };
      if (provider === 'openai') body.store = false;
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
  async function sendRequest(request, { signal, onRetry, fetchImpl = globalThis.fetch, viaLocal = false, localToken = '' } = {}) {
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
      if (candidate.finishReason && candidate.finishReason !== 'STOP') throw new ProviderError('The model did not finish normally.', { code: String(candidate.finishReason).slice(0, 40) });
      const text = candidate.content?.parts?.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('');
      if (!text) throw new ProviderError('The API returned no text. Check model compatibility.');
      return text;
    }
    const choice = data?.choices?.[0];
    if (choice?.finish_reason && choice.finish_reason !== 'stop') throw new ProviderError('The model did not finish normally.', { code: String(choice.finish_reason).slice(0, 40) });
    if (typeof choice?.message?.content !== 'string' || !choice.message.content.trim()) throw new ProviderError('The API returned no text. Check model compatibility.');
    return choice.message.content;
  }

  function connectionError(viaLocal) {
    return viaLocal
      ? 'Local connection failed. Check the terminal running the launcher and your network.'
      : 'Direct browser connection failed (network, CORS, or browser restrictions). Try the local launcher.';
  }

  return {
    API_PROVIDERS, DEFAULT_ENDPOINTS, HINTS, KNOWN_CODES, ProviderError,
    defaultConnection, validateURL, buildRequest, sendRequest, responseText, connectionError, retryWait
  };
});
