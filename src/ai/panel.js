/* "KI-Prüfung" panel: AI Review/Revise of the current report (decision D3).
   Review shows notes. Revise shows a per-section diff with an editable draft; nothing reaches the
   editor until the user applies a section (replace / append), through the editor's own transfer path
   so frozen text, undo and draft saving keep working. Results remember their inputs and are marked
   outdated when the report changes. Report text is only sent when the user clicks Review/Revise/Test.

   bridge: { translate, notify, uiLanguage(), getSections(), getTemplate(), getAi(), setAi(ai),
             apply(id, text, mode) -> { ok, message? }, confirm(text) } */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AiPanel = api;
})(globalThis, function (root) {
  'use strict';

  const DE = {
    'AI review': 'KI-Prüfung',
    'Optional. Report text is sent only when you click Review, Revise or Test connection.': 'Optional. Befundtext wird nur beim Klick auf Prüfen, Überarbeiten oder Verbindung testen gesendet.',
    'Review': 'Prüfen', 'Revise': 'Überarbeiten', 'Cancel': 'Abbrechen',
    'Connection': 'Verbindung', 'Provider': 'Anbieter', 'No AI': 'Keine KI', 'OpenAI': 'OpenAI', 'Google Gemini': 'Google Gemini',
    'Other OpenAI-compatible API': 'Andere OpenAI-kompatible API', 'Endpoint': 'Endpunkt', 'API key': 'API-Schlüssel', 'Model ID': 'Modell-ID',
    'Report language': 'Befundsprache', 'Same as original': 'Wie Original', 'German': 'Deutsch', 'English': 'Englisch',
    'Test connection': 'Verbindung testen', 'Advanced settings': 'Erweiterte Einstellungen', 'Review prompt': 'Prompt für Prüfen',
    'Revise prompt': 'Prompt für Überarbeiten', 'Reset': 'Zurücksetzen',
    'API keys are kept in memory only. Save an encrypted configuration file to keep them.': 'API-Schlüssel bleiben nur im Arbeitsspeicher. Zum Aufbewahren eine verschlüsselte Konfigurationsdatei speichern.',
    'No AI provider selected. Nothing is sent.': 'Keine KI ausgewählt. Es wird nichts gesendet.',
    'Report destination:': 'Befundziel:', 'Choose a valid endpoint.': 'Einen gültigen Endpunkt eingeben.',
    'Review notes': 'Prüfhinweise', 'Proposed revision': 'Vorgeschlagene Überarbeitung',
    'The model flagged no potential inconsistencies. This does not establish clinical correctness.': 'Das Modell hat keine möglichen Unstimmigkeiten gemeldet. Das belegt keine medizinische Richtigkeit.',
    'Language edits: ': 'Sprachliche Änderungen: ', 'No text changes.': 'Keine Textänderungen.',
    'Replace': 'Ersetzen', 'Append': 'Anhängen', 'Discard': 'Verwerfen', 'Applied': 'Übernommen', 'Discarded': 'Verworfen',
    'Draft (editable)': 'Entwurf (bearbeitbar)', 'Raw model response': 'Rohantwort des Modells',
    'Review every change. Amber outline: numbers, units, sides, negation or uncertainty. Highlighting can miss clinically important edits.': 'Jede Änderung prüfen. Gelber Rahmen: Zahlen, Einheiten, Seitenangaben, Verneinung oder Unsicherheit. Die Hervorhebung kann wichtige Änderungen übersehen.',
    'The AI changed frozen text in this section. Check it before applying.': 'Die KI hat fixierten Text in diesem Abschnitt verändert. Vor der Übernahme prüfen.',
    'Outdated: the report changed after this result was generated.': 'Veraltet: Der Befund wurde nach Erstellung dieses Ergebnisses geändert.',
    'Previous result: the latest request did not complete.': 'Früheres Ergebnis: Die letzte Anfrage wurde nicht abgeschlossen.',
    'This result is outdated or the latest request failed. Apply it anyway?': 'Dieses Ergebnis ist veraltet oder die letzte Anfrage ist fehlgeschlagen. Trotzdem übernehmen?',
    'The AI changed frozen text in this section. Apply anyway?': 'Die KI hat fixierten Text in diesem Abschnitt verändert. Trotzdem übernehmen?',
    'Generated': 'Erstellt', 'Applied to the report.': 'In den Befund übernommen.',
    'Enter a report first.': 'Zuerst einen Befund eingeben.', 'Choose an AI provider.': 'Einen KI-Anbieter wählen.',
    'Enter the model ID.': 'Modell-ID eingeben.', 'Enter your API key.': 'API-Schlüssel eingeben.',
    'Enter a valid endpoint URL.': 'Eine gültige Endpunkt-Adresse eingeben.',
    'Use an endpoint without credentials, query parameters, or fragments.': 'Endpunkt ohne Zugangsdaten, Abfrageparameter oder Fragmente verwenden.',
    'Use HTTPS, or HTTP on localhost.': 'HTTPS oder HTTP auf localhost verwenden.',
    'Invalid Gemini model ID.': 'Ungültige Gemini-Modell-ID.', 'Gemini endpoint must end with /models.': 'Gemini-Endpunkt muss mit /models enden.',
    'Reviewing…': 'Wird geprüft…', 'Revising…': 'Wird überarbeitet…', 'Testing connection (small billable request)…': 'Verbindung wird getestet (kleine, ggf. kostenpflichtige Anfrage)…',
    'Review complete. Check the notes.': 'Prüfung abgeschlossen. Hinweise kontrollieren.',
    'Revision complete. Check every change before applying it.': 'Überarbeitung abgeschlossen. Jede Änderung vor der Übernahme prüfen.',
    'Inputs changed during the request. Run the action again.': 'Eingaben während der Anfrage geändert. Aktion erneut ausführen.',
    'Draft changed during generation. Your edits were kept; run Revise again.': 'Entwurf während der Erstellung geändert. Ihre Änderungen bleiben erhalten; erneut überarbeiten.',
    'Connection successful.': 'Verbindung erfolgreich.', 'Cancelled or timed out.': 'Abgebrochen oder Zeitüberschreitung.',
    'The model did not return valid structured output. No result was accepted.': 'Das Modell hat keine gültige strukturierte Antwort geliefert. Es wurde kein Ergebnis übernommen.',
    'API key cleared because the endpoint origin changed. Enter the key for this endpoint.': 'API-Schlüssel wegen geänderter Endpunkt-Adresse entfernt. Schlüssel für diesen Endpunkt eingeben.',
    'Temporary provider failure. Retrying': 'Vorübergehender Anbieterfehler. Neuer Versuch',
    'Check the API format, endpoint and model.': 'API-Format, Endpunkt und Modell prüfen.', 'Check your API key.': 'API-Schlüssel prüfen.',
    'Check key restrictions and account permissions.': 'Schlüsselbeschränkungen und Kontoberechtigungen prüfen.',
    'Check the endpoint and model ID.': 'Endpunkt und Modell-ID prüfen.', 'Quota or rate limit reached.': 'Kontingent oder Ratenlimit erreicht.',
    'The provider encountered an internal error. Try again later.': 'Interner Fehler beim Anbieter. Später erneut versuchen.',
    'The local launcher could not reach the provider. Check the endpoint and network.': 'Der lokale Starter konnte den Anbieter nicht erreichen. Endpunkt und Netzwerk prüfen.',
    'The provider or gateway is temporarily unavailable or overloaded. Try again later or select another available model.': 'Anbieter oder Gateway vorübergehend nicht verfügbar oder überlastet. Später erneut versuchen oder ein anderes Modell wählen.',
    'The provider or gateway timed out. Try a shorter report or try again later.': 'Zeitüberschreitung bei Anbieter oder Gateway. Kürzeren Befund oder späteren Versuch wählen.',
    'Provider request failed.': 'Anfrage an den Anbieter fehlgeschlagen.',
    'The endpoint returned non-JSON data. Check its URL.': 'Der Endpunkt hat keine JSON-Daten geliefert. Adresse prüfen.',
    'Gemini returned no candidate. The response may be blocked.': 'Gemini hat keine Antwort geliefert. Sie wurde eventuell blockiert.',
    'The model did not finish normally.': 'Das Modell wurde nicht regulär beendet.',
    'The API returned no text. Check model compatibility.': 'Die API hat keinen Text geliefert. Modellkompatibilität prüfen.',
    'Direct browser connection failed (network, CORS, or browser restrictions). Try the local launcher.': 'Direkte Browserverbindung fehlgeschlagen (Netzwerk, CORS oder Browserbeschränkungen). Lokalen Starter verwenden.',
    'Local connection failed. Check the terminal running the launcher and your network.': 'Lokale Verbindung fehlgeschlagen. Terminal des Starters und Netzwerk prüfen.',
    'Enter non-empty task instructions in Advanced settings (maximum 20,000 characters).': 'In den erweiterten Einstellungen nicht leere Anweisungen eingeben (maximal 20.000 Zeichen).',
    'Reset this prompt to its default?': 'Diesen Prompt auf den Standard zurücksetzen?'
  };

  Object.assign(DE, {
    'Browser local · GPU (WebGPU)': 'Lokal im Browser · GPU (WebGPU)', 'Browser local · CPU (WebAssembly)': 'Lokal im Browser · CPU (WebAssembly)',
    'Browser model': 'Browser-Modell', 'Qwen3 0.6B · smallest': 'Qwen3 0.6B · am kleinsten', 'Qwen3 1.7B · balanced': 'Qwen3 1.7B · ausgewogen',
    'Qwen3 4B · larger': 'Qwen3 4B · größer', 'Qwen3 0.6B · multilingual · larger download': 'Qwen3 0.6B · mehrsprachig · größerer Download',
    'SmolLM2 135M · tiny · English-focused': 'SmolLM2 135M · sehr klein · englischsprachig', 'MedGemma 4B · ONNX · experimental': 'MedGemma 4B · ONNX · experimentell',
    'MedGemma 1.5 4B · ONNX · experimental': 'MedGemma 1.5 4B · ONNX · experimentell', 'Custom local model…': 'Eigenes lokales Modell…',
    'WebGPU is required. First use downloads the runtime and model from jsDelivr, GitHub and Hugging Face. Model weights may be cached; report text stays in the browser worker. No API key is used.': 'WebGPU ist erforderlich. Beim ersten Start werden Laufzeit und Modell von jsDelivr, GitHub und Hugging Face geladen. Modellgewichte können zwischengespeichert werden; der Befundtext bleibt im Browser-Worker. Es wird kein API-Schlüssel verwendet.',
    'CPU mode needs no WebGPU. First use downloads runtime and model files; this can be large and slow. Reports stay in the local worker. Small models may struggle with German and structured reports.': 'Der CPU-Modus benötigt kein WebGPU. Beim ersten Start werden Laufzeit und Modelldateien geladen; das kann groß und langsam sein. Befunde bleiben im lokalen Worker. Kleine Modelle können mit Deutsch und strukturierten Befunden Probleme haben.',
    'Load any compatible text-generation model folder. ONNX models use Transformers.js on CPU or WebGPU; MLC models need WebGPU and a matching compiled library. GGUF, safetensors and PyTorch files are not supported.': 'Einen kompatiblen Textgenerierungs-Modellordner laden. ONNX-Modelle nutzen Transformers.js auf CPU oder WebGPU; MLC-Modelle benötigen WebGPU und eine passende kompilierte Bibliothek. GGUF-, safetensors- und PyTorch-Dateien werden nicht unterstützt.',
    'ONNX weight format': 'ONNX-Gewichtsformat', 'Load model folder': 'Modellordner laden', 'Use online downloads': 'Online-Downloads verwenden',
    'Choose a complete model folder. Model files stay on this device. Runtime assets still require jsDelivr access.': 'Einen vollständigen Modellordner wählen. Modelldateien bleiben auf diesem Gerät. Laufzeitdateien benötigen weiterhin Zugriff auf jsDelivr.',
    'Model files and download instructions': 'Modelldateien und Download-Hinweise', 'Unload browser model': 'Browser-Modell entladen',
    'Report processing: on this device': 'Befundverarbeitung: auf diesem Gerät',
    'Browser model unloaded.': 'Browser-Modell entladen.', 'CPU worker started. Loading runtime…': 'CPU-Worker gestartet. Laufzeit wird geladen…',
    'Loading browser model:': 'Browser-Modell wird geladen:', 'Generating locally…': 'Lokale Erzeugung läuft…', 'Browser model ready.': 'Browser-Modell bereit.',
    'Local model files loaded:': 'Lokale Modelldateien geladen:', 'Online model downloads selected.': 'Online-Modelldownloads ausgewählt.',
    'Choose a custom model folder to continue.': 'Zum Fortfahren einen eigenen Modellordner wählen.',
    'Choose browser CPU or WebGPU mode first.': 'Zuerst den Browser-Modus CPU oder WebGPU wählen.',
    'Choose a supported browser model.': 'Ein unterstütztes Browser-Modell wählen.',
    'Loading browser model and testing local generation…': 'Browser-Modell wird geladen und lokale Erzeugung getestet…',
    'MLC models require WebGPU mode. Select an ONNX model for CPU mode.': 'MLC-Modelle benötigen den WebGPU-Modus. Für den CPU-Modus ein ONNX-Modell wählen.',
    'Loaded model files belong to another model. Load the matching folder or select online downloads.': 'Die geladenen Modelldateien gehören zu einem anderen Modell. Passenden Ordner laden oder Online-Downloads wählen.',
    'A browser model request is already running.': 'Eine Anfrage an das Browser-Modell läuft bereits.',
    'WebGPU is unavailable on this computer. Choose CPU mode or an API provider; WebLLM cannot run on CPU.': 'WebGPU ist auf diesem Computer nicht verfügbar. CPU-Modus oder einen API-Anbieter wählen; WebLLM läuft nicht auf der CPU.',
    'WebAssembly is unavailable in this browser.': 'WebAssembly ist in diesem Browser nicht verfügbar.',
    'Browser workers are unavailable. Try the local launcher in a current browser.': 'Browser-Worker sind nicht verfügbar. Lokalen Starter in einem aktuellen Browser verwenden.',
    'Browser worker could not start. Open the app through the local launcher; browser or workplace policy may block workers.': 'Browser-Worker konnte nicht starten. App über den lokalen Starter öffnen; Browser- oder Arbeitsplatzrichtlinien können Worker blockieren.',
    'CPU input is too long (maximum 2,048 tokens). Shorten the report, template or prompts.': 'Die CPU-Eingabe ist zu lang (maximal 2.048 Token). Befund, Vorlage oder Prompts kürzen.',
    'CPU model initialization ran out of memory. Close other tabs and apps, then retry; the download size is smaller than the RAM needed.': 'Beim Initialisieren des CPU-Modells reichte der Arbeitsspeicher nicht. Andere Tabs und Programme schließen und erneut versuchen; der Download ist kleiner als der benötigte RAM.',
    'CPU model loaded, but generation failed. Try a shorter report or the tiny model.': 'CPU-Modell geladen, aber die Erzeugung ist fehlgeschlagen. Kürzeren Befund oder das kleine Modell versuchen.',
    'CPU model failed to load or generate. Check free RAM, WebAssembly support and access to model downloads. Try the tiny model or the local launcher.': 'CPU-Modell konnte nicht laden oder erzeugen. Freien RAM, WebAssembly-Unterstützung und Zugriff auf Modelldownloads prüfen. Das kleine Modell oder den lokalen Starter versuchen.',
    'Browser model failed to load or generate. Check WebGPU, free GPU memory, and access to model downloads. Try a smaller model or the local launcher.': 'Browser-Modell konnte nicht laden oder erzeugen. WebGPU, freien GPU-Speicher und Zugriff auf Modelldownloads prüfen. Ein kleineres Modell oder den lokalen Starter versuchen.'
  });

  const REQUEST_TIMEOUT_MS = 180000;
  const LOCAL_TIMEOUT_MS = 1200000;
  const TEST_TIMEOUT_MS = 30000;
  const RAW_LIMIT = 20000;

  function mount(host, bridge) {
    const t = key => bridge.translate(key);
    const Providers = root.AiProviders, Contract = root.AiContract, Diff = root.AiDiff, Local = root.AiLocal;
    const isLocal = provider => Local.LOCAL_PROVIDERS.includes(provider);

    // ---- DOM -------------------------------------------------------------
    const node = (tag, attrs = {}, children = []) => {
      const e = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'text') { e.dataset.aiText = v; e.textContent = t(v); } else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v);
      }
      e.append(...children);
      return e;
    };
    const option = (value, label) => node('option', { value, text: label });
    const field = (label, control) => node('label', {}, [node('span', { text: label }), control]);

    const ui = {
      provider: node('select', { id: 'aiProvider' }, [option('none', 'No AI'), option('openai', 'OpenAI'), option('gemini', 'Google Gemini'), option('compatible', 'Other OpenAI-compatible API'), option('webllm', 'Browser local · GPU (WebGPU)'), option('wasm', 'Browser local · CPU (WebAssembly)')]),
      localModel: node('select', { id: 'aiLocalModel' }),
      dtype: node('select', { id: 'aiCustomDtype' }, Local.LOCAL_DTYPES.map(d => option(d, d))),
      folder: node('input', { id: 'aiModelFolder', type: 'file', webkitdirectory: true, multiple: true }),
      clearFolder: node('button', { id: 'aiClearFolder', type: 'button', text: 'Use online downloads' }),
      folderStatus: node('p', { id: 'aiFolderStatus', class: 'hint' }),
      unload: node('button', { id: 'aiUnload', type: 'button', text: 'Unload browser model' }),
      progress: node('p', { id: 'aiModelProgress', class: 'hint', role: 'status' }),
      download: node('a', { id: 'aiModelDownload', target: '_blank', rel: 'noopener noreferrer', text: 'Model files and download instructions' }),
      gpuHelp: node('p', { class: 'hint', text: 'WebGPU is required. First use downloads the runtime and model from jsDelivr, GitHub and Hugging Face. Model weights may be cached; report text stays in the browser worker. No API key is used.' }),
      cpuHelp: node('p', { class: 'hint', text: 'CPU mode needs no WebGPU. First use downloads runtime and model files; this can be large and slow. Reports stay in the local worker. Small models may struggle with German and structured reports.' }),
      endpoint: node('input', { id: 'aiEndpoint', type: 'url', autocomplete: 'off', spellcheck: 'false' }),
      key: node('input', { id: 'aiKey', type: 'password', autocomplete: 'off', spellcheck: 'false' }),
      model: node('input', { id: 'aiModel', autocomplete: 'off', spellcheck: 'false' }),
      language: node('select', { id: 'aiReportLanguage' }, [option('Same as original', 'Same as original'), option('German', 'German'), option('English', 'English')]),
      reviewPrompt: node('textarea', { id: 'aiReviewPrompt', rows: '6', maxlength: String(Contract.MAX_PROMPT) }),
      revisePrompt: node('textarea', { id: 'aiRevisePrompt', rows: '6', maxlength: String(Contract.MAX_PROMPT) }),
      review: node('button', { id: 'aiReview', type: 'button', text: 'Review' }),
      revise: node('button', { id: 'aiRevise', type: 'button', class: 'primary', text: 'Revise' }),
      cancel: node('button', { id: 'aiCancel', type: 'button', disabled: true, text: 'Cancel' }),
      test: node('button', { id: 'aiTest', type: 'button', text: 'Test connection' }),
      destination: node('p', { id: 'aiDestination', class: 'ai-destination' }),
      status: node('p', { id: 'aiStatus', role: 'status', 'aria-live': 'polite' }),
      notes: node('div', { id: 'aiNotes', class: 'ai-notes' }),
      results: node('div', { id: 'aiResults' }),
      raw: node('pre', { id: 'aiRaw' }),
      apiRows: null
    };
    ui.rawBox = node('details', { id: 'aiRawBox', hidden: true }, [node('summary', { text: 'Raw model response' }), ui.raw]);
    const resetButton = which => {
      const b = node('button', { type: 'button', class: 'ai-reset', text: 'Reset' });
      b.onclick = () => { if (bridge.confirm(t('Reset this prompt to its default?'))) { ui[which + 'Prompt'].value = Contract.DEFAULT_PROMPTS[which]; readForm(); } };
      return b;
    };
    ui.apiRows = node('div', { class: 'ai-api-rows' }, [field('Endpoint', ui.endpoint), field('API key', ui.key), node('p', { class: 'hint', text: 'API keys are kept in memory only. Save an encrypted configuration file to keep them.' })]);
    ui.modelField = field('Model ID', ui.model);
    ui.localModelField = field('Browser model', ui.localModel);
    ui.customRows = node('div', { id: 'aiCustomRows' }, [
      node('p', { class: 'hint', text: 'Load any compatible text-generation model folder. ONNX models use Transformers.js on CPU or WebGPU; MLC models need WebGPU and a matching compiled library. GGUF, safetensors and PyTorch files are not supported.' }),
      ui.dtypeField = field('ONNX weight format', ui.dtype)
    ]);
    ui.localRows = node('div', { id: 'aiLocalRows' }, [
      ui.gpuHelp, ui.cpuHelp, ui.customRows,
      field('Load model folder', ui.folder),
      node('div', { class: 'ai-actions' }, [ui.clearFolder, ui.unload]),
      ui.folderStatus,
      node('p', { class: 'hint', text: 'Choose a complete model folder. Model files stay on this device. Runtime assets still require jsDelivr access.' }),
      ui.download, ui.progress
    ]);
    const connection = node('details', { id: 'aiConnection' }, [
      node('summary', { text: 'Connection' }),
      node('div', { class: 'ai-grid' }, [field('Provider', ui.provider), ui.modelField, ui.localModelField, field('Report language', ui.language)]),
      ui.apiRows, ui.localRows,
      ui.test,
      node('details', { id: 'aiAdvanced' }, [
        node('summary', { text: 'Advanced settings' }),
        field('Review prompt', ui.reviewPrompt), resetButton('review'),
        field('Revise prompt', ui.revisePrompt), resetButton('revise')
      ])
    ]);
    const panel = node('details', { id: 'aiPanel', class: 'card ai-panel' }, [
      node('summary', { text: 'AI review' }),
      node('p', { class: 'hint', text: 'Optional. Report text is sent only when you click Review, Revise or Test connection.' }),
      ui.destination,
      node('div', { class: 'ai-actions' }, [ui.review, ui.revise, ui.cancel]),
      ui.status, ui.notes, ui.results, ui.rawBox, connection
    ]);
    host.replaceChildren(panel);

    // ---- Settings ------------------------------------------------------
    let settings = { provider: 'none', reportLanguage: 'Same as original', profiles: {} };
    let credentialOrigin = null;
    const clone = value => JSON.parse(JSON.stringify(value));
    const originOf = url => { try { return new URL(url).origin; } catch { return null; } };

    // Browser-local models: one runner owns the worker; folder loads are raced by `folderRevision`.
    let progressMessage = { key: '', suffix: '' }, folderMessage = { key: '', suffix: '' }, folderRevision = 0;
    const runner = Local.createRunner({ onProgress: (key, suffix = '') => { progressMessage = { key, suffix }; ui.progress.textContent = t(key) + suffix; } });
    function setFolderStatus(key, suffix = '', error = false) {
      folderMessage = { key, suffix };
      ui.folderStatus.textContent = key ? t(key) + suffix : '';
      ui.folderStatus.classList.toggle('ai-warning', error);
    }

    // Local presets fall back to the first model of their list.
    function profileFor(provider) {
      const stored = settings.profiles[provider];
      if (isLocal(provider)) {
        const models = Local.modelsFor(provider);
        return { endpoint: '', model: models.includes(stored?.model) ? stored.model : models[0] };
      }
      return stored || Providers.defaultConnection(provider);
    }

    function currentProfile(provider) {
      if (isLocal(provider)) return { endpoint: '', model: ui.localModel.value };
      return { endpoint: ui.endpoint.value.trim(), model: ui.model.value.trim(), ...(ui.key.value.trim() ? { apiKey: ui.key.value.trim() } : {}) };
    }

    function fillForm() {
      const provider = settings.provider;
      ui.provider.value = provider;
      const profile = provider === 'none' ? { endpoint: '', model: '', apiKey: '' } : profileFor(provider);
      const local = isLocal(provider);
      ui.endpoint.value = local ? '' : profile.endpoint || '';
      ui.key.value = local ? '' : profile.apiKey || '';
      ui.model.value = local ? '' : profile.model || '';
      if (local) {
        ui.localModel.replaceChildren(...Local.modelsFor(provider).map(m => option(m, Local.MODEL_LABELS[m] || m)));
        ui.localModel.value = profile.model;
      }
      ui.dtype.value = settings.customModelDtype || 'q8';
      ui.language.value = settings.reportLanguage;
      ui.reviewPrompt.value = settings.prompts?.review || Contract.DEFAULT_PROMPTS.review;
      ui.revisePrompt.value = settings.prompts?.revise || Contract.DEFAULT_PROMPTS.revise;
      credentialOrigin = originOf(ui.endpoint.value);
      syncControls();
    }

    // Reads the visible form into `settings` and hands a copy to the editor (which persists it without keys).
    function readForm() {
      const provider = ui.provider.value;
      settings.provider = provider;
      settings.reportLanguage = ui.language.value;
      if (provider !== 'none') settings.profiles[provider] = currentProfile(provider);
      settings.customModelDtype = ui.dtype.value;
      const prompts = { review: ui.reviewPrompt.value, revise: ui.revisePrompt.value };
      if (prompts.review === Contract.DEFAULT_PROMPTS.review && prompts.revise === Contract.DEFAULT_PROMPTS.revise) delete settings.prompts;
      else if (prompts.review.trim() && prompts.revise.trim()) settings.prompts = prompts;
      bridge.setAi(clone(settings));
      syncControls();
      refresh();
    }

    function syncControls() {
      const provider = ui.provider.value, none = provider === 'none', local = isLocal(provider);
      const custom = local && ui.localModel.value === Local.CUSTOM_MODEL;
      ui.apiRows.hidden = none || local;
      ui.modelField.hidden = local;
      ui.model.disabled = none;
      ui.localModelField.hidden = !local;
      ui.localRows.hidden = !local;
      ui.gpuHelp.hidden = provider !== 'webllm' || custom;
      ui.cpuHelp.hidden = provider !== 'wasm' || custom;
      ui.customRows.hidden = !custom;
      ui.dtypeField.hidden = runner.bundle?.model === Local.CUSTOM_MODEL && runner.bundle.format === 'mlc';
      const page = local ? Local.downloadPage(ui.localModel.value) : null;
      ui.download.hidden = !page;
      if (page) ui.download.href = page;
      for (const b of [ui.review, ui.revise, ui.test]) b.disabled = none || !!busy;
      renderDestination();
    }

    function renderDestination() {
      const provider = ui.provider.value;
      if (provider === 'none') { ui.destination.textContent = t('No AI provider selected. Nothing is sent.'); return; }
      if (isLocal(provider)) { ui.destination.textContent = t('Report processing: on this device') + ' · ' + (provider === 'wasm' ? 'CPU / WASM' : 'WebGPU'); return; }
      let origin;
      try { origin = new URL(Providers.validateURL(ui.endpoint.value.trim())).origin; } catch { origin = t('Choose a valid endpoint.'); }
      ui.destination.textContent = t('Report destination:') + ' ' + origin;
    }

    ui.provider.onchange = () => {
      readFormFor(settings.provider);
      ++folderRevision;
      runner.stop();
      settings.provider = ui.provider.value;
      fillForm();
      readForm();
    };
    // Saves the outgoing provider's fields before switching.
    function readFormFor(provider) {
      if (provider && provider !== 'none') settings.profiles[provider] = currentProfile(provider);
    }
    ui.localModel.addEventListener('change', () => { ++folderRevision; runner.stop(); readForm(); });
    ui.dtype.addEventListener('change', () => { runner.setDtype(ui.dtype.value); readForm(); });
    ui.unload.onclick = () => runner.stop();
    ui.clearFolder.onclick = () => {
      ++folderRevision;
      runner.setBundle(null);
      setFolderStatus(ui.localModel.value === Local.CUSTOM_MODEL ? 'Choose a custom model folder to continue.' : 'Online model downloads selected.');
      syncControls();
      refresh();
    };
    // Validates the folder for the selected model; a newer selection or a model switch wins the race.
    ui.folder.addEventListener('change', async event => {
      const provider = ui.provider.value, model = ui.localModel.value, ticket = ++folderRevision;
      const files = Array.from(event.target.files || []);
      try {
        const entries = Local.modelFolderEntries(files);
        if (!isLocal(provider)) throw Error('Choose browser CPU or WebGPU mode first.');
        const description = model === Local.CUSTOM_MODEL ? await Local.describeCustomModel(entries, provider, ui.dtype.value) : null;
        if (!description) Local.validateModelBundle(model, entries);
        if (ticket !== folderRevision || provider !== ui.provider.value || model !== ui.localModel.value) return;
        const name = files[0]?.webkitRelativePath?.split('/')[0] || 'Local model';
        runner.setBundle({ model, entries, ...description, name });
        if (description?.dtype) ui.dtype.value = description.dtype;
        setFolderStatus('Local model files loaded:', ' ' + entries.length + ' · ' + name + (description ? ' · ' + description.format.toUpperCase() : ''));
        readForm();
      } catch (error) {
        if (ticket === folderRevision) setFolderStatus(error.message, '', true);
      } finally {
        event.target.value = '';
      }
    });
    function endpointEdited() {
      const origin = originOf(ui.endpoint.value.trim());
      if (ui.key.value && origin !== credentialOrigin) {
        ui.key.value = '';
        setStatus('API key cleared because the endpoint origin changed. Enter the key for this endpoint.', true);
      }
      credentialOrigin = origin;
      readForm();
    }
    ui.endpoint.addEventListener('input', endpointEdited);
    ui.endpoint.addEventListener('change', endpointEdited);
    ui.key.addEventListener('input', () => { credentialOrigin = originOf(ui.endpoint.value.trim()); readForm(); });
    for (const e of [ui.model, ui.reviewPrompt, ui.revisePrompt]) e.addEventListener('input', readForm);
    ui.language.addEventListener('change', readForm);

    // ---- Status ---------------------------------------------------------
    let statusMessage = { key: '', error: false, suffix: '' };
    function setStatus(key, error = false, suffix = '') {
      statusMessage = { key, error, suffix };
      ui.status.textContent = key ? t(key) + suffix : '';
      ui.status.className = error ? 'ai-error' : '';
    }
    function describeError(error) {
      if (error?.name === 'AbortError') return ['Cancelled or timed out.', ''];
      if (error?.name === 'TypeError') return [Providers.connectionError(false), ''];
      if (error?.name === 'ProviderError') return [error.hint, (error.status ? ' (HTTP ' + error.status + ')' : '') + (error.code ? ' [' + error.code + ']' : '')];
      return [String(error?.message || 'Provider request failed.'), ''];
    }

    // ---- Results ----------------------------------------------------------
    let busy = null;               // AbortController of the running request
    let notes = null;              // { snapshot, issues, changes, time }
    let revision = null;           // { snapshot, time, sections: [{ id, label, original, protected, proposed, applied, discarded, el }] }
    let notesFailed = false, revisionFailed = false, draftEditedDuringRequest = false;

    function snapshot(mode) {
      return {
        mode,
        sections: bridge.getSections().map(s => ({ id: s.id, text: s.text, protected: s.protected })),
        template: bridge.getTemplate(),
        reportLanguage: settings.reportLanguage,
        provider: settings.provider,
        endpoint: settings.provider === 'none' ? '' : profileFor(settings.provider).endpoint,
        model: settings.provider === 'none' ? '' : profileFor(settings.provider).model,
        prompt: mode === 'review' ? ui.reviewPrompt.value : ui.revisePrompt.value,
        modelFiles: runner.bundle && runner.bundle.model === profileFor(settings.provider).model ? runner.bundle.revision : 0
      };
    }
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const resultStale = result => !!result && !same(result.snapshot, snapshot(result.snapshot.mode));
    function sectionStale(section) {
      const current = bridge.getSections().find(s => s.id === section.id);
      return !current || current.text !== section.original || !same(revision.snapshot.template, bridge.getTemplate()) || revision.snapshot.reportLanguage !== settings.reportLanguage;
    }

    function renderNotes() {
      ui.notes.replaceChildren();
      if (!notes) return;
      const labels = Object.fromEntries(notes.snapshot.sections.map(s => [s.id, bridge.getSections().find(x => x.id === s.id)?.label || s.id]));
      ui.notes.append(node('h3', { text: 'Review notes' }));
      const provenance = node('p', { class: 'hint ai-provenance' });
      ui.notes.append(provenance);
      if (!notes.issues.length) ui.notes.append(node('p', { class: 'hint', text: 'The model flagged no potential inconsistencies. This does not establish clinical correctness.' }));
      for (const issue of notes.issues) {
        const item = node('div', { class: 'ai-issue' });
        const heading = node('strong');
        heading.textContent = issue.category + (issue.section ? ' · ' + labels[issue.section] : '');
        item.append(heading, document.createTextNode(issue.detail));
        ui.notes.append(item);
      }
      if (notes.changes.length) {
        const p = node('p', { class: 'hint' });
        p.textContent = t('Language edits: ') + notes.changes.join(' · ');
        ui.notes.append(p);
      }
    }

    function renderDiff(target, before, after) {
      target.replaceChildren();
      const diff = Diff.textDiff(before, after);
      for (const part of diff.parts) {
        const e = document.createElement(part.kind === 'delete' ? 'del' : part.kind === 'insert' ? 'ins' : 'span');
        e.textContent = part.text;
        if (part.kind !== 'equal' && Diff.hasSensitiveWording(part.text)) e.className = 'sensitive-change';
        target.append(e);
      }
    }

    function renderRevision() {
      ui.results.replaceChildren();
      if (!revision) return;
      ui.results.append(node('h3', { text: 'Proposed revision' }), node('p', { class: 'hint', text: 'Review every change. Amber outline: numbers, units, sides, negation or uncertainty. Highlighting can miss clinically important edits.' }));
      const changed = revision.sections.filter(s => s.proposed !== s.original);
      if (!changed.length) { ui.results.append(node('p', { class: 'hint', text: 'No text changes.' })); return; }
      for (const s of changed) {
        const diff = node('div', { class: 'diff-body' });
        const draft = node('textarea', { class: 'ai-draft', rows: '5', 'data-section': s.id, 'aria-label': s.label });
        draft.value = s.proposed;
        draft.addEventListener('input', () => { if (busy) draftEditedDuringRequest = true; renderDiff(diff, s.original, draft.value); });
        const state = node('p', { class: 'ai-section-state hint' });
        const frozenWarning = node('p', { class: 'ai-warning', text: 'The AI changed frozen text in this section. Check it before applying.', hidden: s.protectedOk });
        const buttons = node('div', { class: 'ai-section-actions' }, [
          node('button', { type: 'button', 'data-apply': 'replace', text: 'Replace' }),
          node('button', { type: 'button', 'data-apply': 'append', text: 'Append' }),
          node('button', { type: 'button', 'data-apply': 'discard', text: 'Discard' })
        ]);
        buttons.onclick = event => { const mode = event.target.closest('button')?.dataset.apply; if (mode) applySection(s, mode, draft.value); };
        const heading = node('h4');
        heading.textContent = s.label;
        const card = node('section', { class: 'ai-section', 'data-section': s.id }, [heading, state, frozenWarning, diff, field('Draft (editable)', draft), buttons]);
        renderDiff(diff, s.original, s.proposed);
        s.el = { card, state, buttons, draft };
        ui.results.append(card);
      }
      refresh();
    }

    function applySection(section, mode, text) {
      if (section.applied || section.discarded) return;
      if (mode === 'discard') { section.discarded = true; refresh(); return; }
      if ((sectionStale(section) || revisionFailed) && !bridge.confirm(t('This result is outdated or the latest request failed. Apply it anyway?'))) return;
      if (!Contract.protectedIntact(section.protected, text) && !bridge.confirm(t('The AI changed frozen text in this section. Apply anyway?'))) return;
      const result = bridge.apply(section.id, text, mode);
      if (!result.ok) { bridge.notify(result.message); return; }
      section.applied = mode;
      bridge.notify('Applied to the report.');
      refresh();
    }

    // Cheap update of outdated/provenance labels; called on every editor change.
    function refresh() {
      const provenance = ui.notes.querySelector('.ai-provenance');
      if (provenance && notes) {
        const stale = resultStale(notes);
        provenance.textContent = notesFailed ? t('Previous result: the latest request did not complete.') : stale ? t('Outdated: the report changed after this result was generated.') : t('Generated') + ' ' + notes.time;
        provenance.classList.toggle('ai-warning', notesFailed || stale);
      }
      if (!revision) return;
      for (const s of revision.sections) {
        if (!s.el) continue;
        const done = s.applied || s.discarded;
        const stale = !done && (sectionStale(s) || revisionFailed);
        s.el.state.textContent = s.applied ? t('Applied') : s.discarded ? t('Discarded') : revisionFailed ? t('Previous result: the latest request did not complete.') : stale ? t('Outdated: the report changed after this result was generated.') : t('Generated') + ' ' + revision.time;
        s.el.state.classList.toggle('ai-warning', stale);
        s.el.card.classList.toggle('ai-done', !!done);
        s.el.buttons.querySelectorAll('button').forEach(b => { b.disabled = !!done; });
        s.el.draft.readOnly = !!done;
      }
    }

    // ---- Requests ----------------------------------------------------------
    function setBusy(controller) {
      busy = controller;
      ui.cancel.disabled = !controller;
      syncControls();
    }
    ui.cancel.onclick = () => busy?.abort();

    function connectionParts() {
      const provider = settings.provider;
      if (provider === 'none') throw new Providers.ProviderError('Choose an AI provider.');
      const profile = profileFor(provider);
      return { provider, endpoint: profile.endpoint, key: profile.apiKey || '', model: profile.model };
    }

    async function runAction(mode) {
      if (busy) return;
      const before = snapshot(mode);
      const sections = bridge.getSections();
      if (!sections.some(s => s.text.trim())) { setStatus('Enter a report first.', true); return; }
      ui.rawBox.hidden = true;
      ui.raw.textContent = '';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), isLocal(settings.provider) ? LOCAL_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
      draftEditedDuringRequest = false;
      setBusy(controller);
      setStatus(mode === 'review' ? 'Reviewing…' : 'Revising…');
      try {
        const { provider, endpoint, key, model } = connectionParts();
        // Small CPU models follow the JSON contract more reliably with an example (as in Report Studio).
        const system = Contract.systemPrompt(mode, before.prompt, bridge.uiLanguage(), { example: provider === 'wasm' });
        const input = Contract.userInput({ sections, template: before.template, reportLanguage: settings.reportLanguage });
        const data = await send(provider, endpoint, key, model, system, input, controller.signal);
        const text = Providers.responseText(data, isLocal(provider) ? 'compatible' : provider);
        let parsed;
        try {
          parsed = Contract.parse(text, mode, sections.map(s => s.id));
        } catch {
          ui.raw.textContent = text.slice(0, RAW_LIMIT);
          ui.rawBox.hidden = false;
          throw new Error('The model did not return valid structured output. No result was accepted.');
        }
        if (mode === 'revise' && draftEditedDuringRequest) throw new Error('Draft changed during generation. Your edits were kept; run Revise again.');
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        notes = { snapshot: before, issues: parsed.issues, changes: parsed.changes, time };
        notesFailed = false;
        if (mode === 'revise') {
          const proposals = new Map(parsed.sections.map(s => [s.id, s.text]));
          revision = {
            snapshot: before, time,
            sections: sections.filter(s => proposals.has(s.id)).map(s => {
              const proposed = proposals.get(s.id);
              return { id: s.id, label: s.label, original: s.text, protected: s.protected, proposed, protectedOk: Contract.protectedIntact(s.protected, proposed), applied: false, discarded: false, el: null };
            })
          };
          revisionFailed = false;
          renderRevision();
        }
        renderNotes();
        refresh();
        const changedMeanwhile = !same(before, snapshot(mode));
        setStatus(changedMeanwhile ? 'Inputs changed during the request. Run the action again.' : mode === 'review' ? 'Review complete. Check the notes.' : 'Revision complete. Check every change before applying it.', changedMeanwhile);
      } catch (error) {
        if (mode === 'revise' && revision) revisionFailed = true;
        if (notes) notesFailed = true;
        refresh();
        const [key, suffix] = describeError(error);
        setStatus(key, true, suffix);
      } finally {
        clearTimeout(timer);
        setBusy(null);
      }
    }
    ui.review.onclick = () => runAction('review');
    ui.revise.onclick = () => runAction('revise');

    // API providers go through fetch; browser-local providers through the worker runner. Never both.
    function send(provider, endpoint, key, model, system, input, signal) {
      if (isLocal(provider)) return runner.request(Local.buildLocalRequest(provider, model, system, input), signal);
      const request = Providers.buildRequest(provider, endpoint, key, model, system, input);
      return Providers.sendRequest(request, {
        signal,
        onRetry: ({ status, attempt, seconds }) => setStatus('Temporary provider failure. Retrying', false, ` ${attempt}/2 (HTTP ${status}, ${seconds} s)…`)
      });
    }

    ui.test.onclick = async () => {
      if (busy) return;
      const local = isLocal(settings.provider);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), local ? LOCAL_TIMEOUT_MS : TEST_TIMEOUT_MS);
      setBusy(controller);
      setStatus(local ? 'Loading browser model and testing local generation…' : 'Testing connection (small billable request)…');
      try {
        const { provider, endpoint, key, model } = connectionParts();
        const data = await send(provider, endpoint, key, model, 'Return JSON only.', 'Return {"connected":true}.', controller.signal);
        Providers.responseText(data, local ? 'compatible' : provider);
        setStatus('Connection successful.');
      } catch (error) {
        const [key, suffix] = describeError(error);
        setStatus(key, true, suffix);
      } finally {
        clearTimeout(timer);
        setBusy(null);
      }
    };

    // ---- Public API ---------------------------------------------------------
    function applyLanguage() {
      panel.querySelectorAll('[data-ai-text]').forEach(e => { e.textContent = t(e.dataset.aiText); });
      ui.progress.textContent = progressMessage.key ? t(progressMessage.key) + progressMessage.suffix : '';
      setFolderStatus(folderMessage.key, folderMessage.suffix, ui.folderStatus.classList.contains('ai-warning'));
      renderDestination();
      setStatus(statusMessage.key, statusMessage.error, statusMessage.suffix);
      refresh();
    }
    function setSettings(next) {
      settings = next ? clone(next) : { provider: 'none', reportLanguage: 'Same as original', profiles: {} };
      fillForm();
      refresh();
    }
    function clearResults() {
      busy?.abort();
      notes = null; revision = null; notesFailed = false; revisionFailed = false;
      ui.notes.replaceChildren(); ui.results.replaceChildren();
      ui.raw.textContent = ''; ui.rawBox.hidden = true;
      setStatus('');
    }

    setSettings(bridge.getAi());
    applyLanguage();
    return { refresh, applyLanguage, setSettings, clearResults, element: panel };
  }

  return { DE, mount };
});
