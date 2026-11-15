const fs = require('fs');
function edit(f, pairs) { let s = fs.readFileSync(f, 'utf8'); for (const [a, b] of pairs) { if (!s.includes(a)) throw new Error(f + ' missing: ' + a.slice(0, 70)); s = s.split(a).join(b); } fs.writeFileSync(f, s); }
const OLD = 'Check the endpoint (usually ending in /chat/completions) or try the local launcher.';
const NEW = "Check the endpoint (the provider's base URL, e.g. https://api.mistral.ai/v1) or try the local launcher.";
edit('src/ai/providers.js', [[OLD, NEW]]);
edit('src/ai/panel.js', [
  [OLD + "': 'Direkte Browserverbindung fehlgeschlagen (Netzwerk, CORS oder Browserbeschränkungen). Endpunkt prüfen (endet meist auf /chat/completions) oder den lokalen Starter verwenden.'",
   NEW + "': 'Direkte Browserverbindung fehlgeschlagen (Netzwerk, CORS oder Browserbeschränkungen). Endpunkt prüfen (Basis-URL des Anbieters, z. B. https://api.mistral.ai/v1) oder den lokalen Starter verwenden.'"],
  ["endpoint: node('input', { id: 'aiEndpoint', type: 'url', autocomplete: 'off', spellcheck: 'false' }),",
   "endpoint: node('input', { id: 'aiEndpoint', type: 'url', autocomplete: 'off', spellcheck: 'false', placeholder: 'https://api.example.com/v1' }),"]
]);
edit('tests/engine/ai-engine.cjs', [["/Check the endpoint \(usually ending in \/chat\/completions\)/", "/Check the endpoint \(the provider's base URL/"]]);
edit('CHANGELOG.md', [["- OpenAI-compatible base URLs such as `https://api.eu.mistral.ai/v1` are completed to `/chat/completions` (posting to the base URL failed as a CORS error).",
  "- OpenAI-style endpoints accept the provider's base URL (as `base_url` in the OpenAI libraries, e.g. `https://api.eu.mistral.ai/v1` or Gemini's `…/v1beta/openai`) or the full `/chat/completions` URL; model lists use the same base. Posting to a bare base URL failed as a CORS error."]]);
edit('README.md', [['any OpenAI-compatible API, or in-browser models',
  'any OpenAI-compatible API (enter the base URL from the provider\'s docs, e.g. `https://api.mistral.ai/v1`; `/chat/completions` is added), or in-browser models']]);
