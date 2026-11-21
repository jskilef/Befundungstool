/* Offline dictation UI: record button in the report toolbar, pending transcript under the target
   section, and the "Offline-Diktat" settings. Behaviour carried over from RepDict (lib/ui/studio.dart):
   - the transcript is editable pending text, inserted only by "Einfügen" at the cursor (or over the
     selection) of the section that was focused when recording started; nothing is inserted otherwise;
   - silence produces nothing; a new recording asks before discarding a pending transcript;
   - recordings stop at 30 s; audio stays in memory and is cleared after use.
   bridge: { translate, notify, confirm, uiLanguage(), targetField(), sectionHost(id), label(id),
             insert(id, text, start, end) -> { ok, message? }, openSettings(), saveState(),
             enableIsolation() } */
(function (root, factory) {
  const api = factory(root.SpeechText, root.SpeechCapture, root.SpeechWhisper);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SpeechPanel = api;
})(globalThis, function (SpeechText, SpeechCapture, SpeechWhisper) {
  'use strict';

  const DE = {
    'Dictate': 'Diktieren', 'Stop': 'Stopp', 'Offline dictation': 'Offline-Diktat',
    'Dictation model': 'Diktiermodell', 'Off': 'Aus',
    'Whisper small · CPU · ≈ 250 MB download': 'Whisper small · CPU · ≈ 250 MB Download',
    'Whisper large-v3-turbo · WebGPU ≈ 560 MB, CPU ≈ 1.1 GB · best medical terms': 'Whisper large-v3-turbo · WebGPU ≈ 560 MB, CPU ≈ 1,1 GB · beste Fachbegriffe',
    'Local model folder…': 'Lokaler Modellordner…', 'Speech language': 'Sprache des Diktats',
    'German': 'Deutsch', 'English': 'Englisch',
    'Spoken formatting commands ("neuer Absatz", "neue Zeile")': 'Gesprochene Formatbefehle („neuer Absatz“, „neue Zeile“)',
    'Load model': 'Modell laden', 'Unload': 'Entladen',
    'Audio stays in this browser\'s memory, at most 30 seconds per recording, and is cleared after transcription. It is never stored or uploaded. The model is downloaded once from Hugging Face (pinned version) when you first dictate or press "Load model".':
      'Audio bleibt im Arbeitsspeicher dieses Browsers, höchstens 30 Sekunden je Aufnahme, und wird nach der Transkription gelöscht. Es wird nie gespeichert oder hochgeladen. Das Modell wird beim ersten Diktat oder mit „Modell laden“ einmalig von Hugging Face geladen (feste Version).',
    'Model folder': 'Modellordner',
    'Choose a dictation model in Settings → General.': 'Diktiermodell in Einstellungen → Allgemein wählen.',
    'Choose a dictation model in Settings.': 'Diktiermodell in den Einstellungen wählen.',
    'Choose a local Whisper model folder in Settings.': 'Lokalen Whisper-Modellordner in den Einstellungen wählen.',
    'Recording': 'Aufnahme', 'max. 30 s': 'max. 30 s',
    'Recording stopped at 30 seconds.': 'Aufnahme nach 30 Sekunden beendet.',
    'No speech detected. Nothing inserted.': 'Keine Sprache erkannt. Nichts eingefügt.',
    'Check the transcript, then insert it.': 'Transkript prüfen und anschließend einfügen.',
    'Dictation · not yet inserted': 'Diktat · noch nicht eingefügt',
    'Insert': 'Einfügen', 'Discard': 'Verwerfen', 'Cancel': 'Abbrechen',
    'Inserted.': 'Eingefügt.', 'Transcript discarded.': 'Transkript verworfen.', 'Dictation cancelled.': 'Diktat abgebrochen.',
    'Discard the pending transcript and start another recording?': 'Ausstehendes Transkript verwerfen und neu aufnehmen?',
    'Microphone access was denied.': 'Mikrofonzugriff wurde verweigert.',
    'No microphone found.': 'Kein Mikrofon gefunden.',
    'No microphone access in this browser.': 'Kein Mikrofonzugriff in diesem Browser.',
    'The microphone could not be started.': 'Das Mikrofon konnte nicht gestartet werden.',
    'The target section is no longer visible.': 'Der Zielabschnitt ist nicht mehr sichtbar.',
    'Loading dictation model…': 'Diktiermodell wird geladen…', 'Transcribing locally…': 'Lokale Transkription läuft…',
    'Dictation model ready.': 'Diktiermodell bereit.', 'Dictation model unloaded.': 'Diktiermodell entladen.',
    'Dictation on this device (WebGPU)': 'Diktat auf diesem Gerät (WebGPU)', 'Dictation on this device (CPU)': 'Diktat auf diesem Gerät (CPU)',
    'Folder chosen:': 'Ordner gewählt:', 'Choose the folder again after reloading the page.': 'Ordner nach dem Neuladen der Seite erneut wählen.',
    'The speech recognition runtime could not load from jsDelivr. Check network access or workplace download restrictions.': 'Die Spracherkennung konnte nicht von jsDelivr geladen werden. Netzwerkzugang oder Download-Beschränkungen am Arbeitsplatz prüfen.',
    'The dictation model could not be downloaded. Check network access, or use a local model folder.': 'Das Diktiermodell konnte nicht geladen werden. Netzwerkzugang prüfen oder einen lokalen Modellordner verwenden.',
    'The dictation model could not be loaded in this browser.': 'Das Diktiermodell konnte in diesem Browser nicht geladen werden.',
    'The dictation model does not fit into browser memory. Close other tabs or choose Whisper small.': 'Das Diktiermodell passt nicht in den Browserspeicher. Andere Tabs schließen oder Whisper small wählen.',
    'WebGPU could not start. Choose Whisper small, or update the graphics driver.': 'WebGPU konnte nicht starten. Whisper small wählen oder den Grafiktreiber aktualisieren.',
    'Transcription failed. Try again.': 'Transkription fehlgeschlagen. Erneut versuchen.',
    'Dictation was cancelled or the model changed. Record again.': 'Diktat abgebrochen oder Modell gewechselt. Erneut aufnehmen.',
    'This folder is not a Whisper model for Transformers.js (missing config.json).': 'Dieser Ordner ist kein Whisper-Modell für Transformers.js (config.json fehlt).',
    'No Whisper ONNX files (onnx/encoder_model…, onnx/decoder_model_merged…) in this folder.': 'Keine Whisper-ONNX-Dateien (onnx/encoder_model…, onnx/decoder_model_merged…) in diesem Ordner.'
  };
  const MODELS = ['none', 'whisper-small', 'whisper-large-v3-turbo', SpeechWhisper.FOLDER];
  const DEFAULT_STATE = { model: 'none', language: 'de', commands: true };
  const MIC_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/></svg>';

  function validState(s) {
    return !!s && typeof s === 'object' && !Array.isArray(s) && MODELS.includes(s.model) && ['de', 'en'].includes(s.language) && typeof s.commands === 'boolean' &&
      Object.keys(s).every(k => ['model', 'language', 'commands'].includes(k));
  }

  function mount(hosts, bridge, { createCapture = SpeechCapture.createCapture, createRunner = SpeechWhisper.createRunner, modelFolderEntries = files => globalThis.AiLocal.modelFolderEntries(files) } = {}) {
    const t = key => bridge.translate(key);
    function node(tag, attrs = {}, children = []) {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'text') { el.textContent = t(v); el.dataset.speechText = v; }
        else if (k === 'hidden') el.hidden = !!v;
        else el.setAttribute(k, v);
      }
      el.append(...children);
      return el;
    }
    const option = (value, label) => node('option', { value, text: label });

    let state = { ...DEFAULT_STATE };
    let phase = 'idle';            // idle | starting | recording | transcribing
    let target = null;             // { id } chosen when recording starts
    let pending = null;            // { id, card, text }
    let controller = null, statusMessage = { key: '', suffix: '', error: false }, modelMessage = { key: '', suffix: '' };

    // ---- Toolbar -------------------------------------------------------------
    const record = node('button', { type: 'button', id: 'speechRecord', class: 'speech-record' });
    const recordLabel = node('span', { text: 'Dictate' });
    record.innerHTML = MIC_ICON;
    record.append(recordLabel);
    const cancel = node('button', { type: 'button', id: 'speechCancel', class: 'speech-cancel', text: 'Cancel', hidden: true });
    const status = node('span', { id: 'speechStatus', class: 'speech-status', role: 'status' });
    hosts.toolbar.append(node('span', { class: 'speech-control' }, [record, cancel, status]));

    function setStatus(key, error = false, suffix = '') {
      statusMessage = { key, suffix, error };
      status.textContent = key ? t(key) + suffix : '';
      status.classList.toggle('speech-error', !!error);
    }
    function render(seconds = 0) {
      record.classList.toggle('speech-recording', phase === 'recording');
      record.disabled = phase === 'starting' || phase === 'transcribing';
      recordLabel.textContent = phase === 'recording' ? t('Stop') + ' · ' + Math.floor(seconds) + ' s / 30 s' : t('Dictate');
      record.setAttribute('aria-pressed', String(phase === 'recording'));
      cancel.hidden = !(phase === 'recording' || phase === 'transcribing');
    }

    // ---- Settings ------------------------------------------------------------
    const ui = {
      model: node('select', { id: 'speechModel' }, [
        option('none', 'Off'),
        option('whisper-small', 'Whisper small · CPU · ≈ 250 MB download'),
        option('whisper-large-v3-turbo', 'Whisper large-v3-turbo · WebGPU ≈ 560 MB, CPU ≈ 1.1 GB · best medical terms'),
        option(SpeechWhisper.FOLDER, 'Local model folder…')
      ]),
      language: node('select', { id: 'speechLanguage' }, [option('de', 'German'), option('en', 'English')]),
      commands: node('input', { type: 'checkbox', id: 'speechCommands', role: 'switch' }),
      folder: node('input', { type: 'file', id: 'speechFolder', webkitdirectory: '', multiple: '' }),
      load: node('button', { type: 'button', id: 'speechLoad', text: 'Load model' }),
      unload: node('button', { type: 'button', id: 'speechUnload', text: 'Unload' }),
      modelStatus: node('p', { id: 'speechModelStatus', class: 'hint', role: 'status' })
    };
    const field = (label, control) => node('label', {}, [node('span', { text: label }), control]);
    const folderRow = field('Model folder', ui.folder);
    hosts.settings.append(node('fieldset', { class: 'speech-settings' }, [
      node('legend', { text: 'Offline dictation' }),
      node('p', { class: 'hint', text: 'Audio stays in this browser\'s memory, at most 30 seconds per recording, and is cleared after transcription. It is never stored or uploaded. The model is downloaded once from Hugging Face (pinned version) when you first dictate or press "Load model".' }),
      field('Dictation model', ui.model), folderRow, field('Speech language', ui.language),
      node('label', { class: 'switch-row' }, [node('span', { text: 'Spoken formatting commands ("neuer Absatz", "neue Zeile")' }), ui.commands]),
      node('div', { class: 'speech-model-actions' }, [ui.load, ui.unload]), ui.modelStatus
    ]));

    function setModelStatus(key, suffix = '') {
      modelMessage = { key, suffix };
      ui.modelStatus.textContent = key ? t(key) + suffix : '';
    }
    const runner = createRunner({ onProgress: (key, suffix = '') => { setModelStatus(key, suffix); if (phase === 'transcribing') setStatus(key, false, suffix); } });

    function syncSettings() {
      ui.model.value = state.model;
      ui.language.value = state.language;
      ui.commands.checked = state.commands;
      folderRow.hidden = state.model !== SpeechWhisper.FOLDER;
      ui.load.disabled = state.model === 'none';
      ui.unload.disabled = !runner.loaded;
    }
    function readSettings() {
      const model = ui.model.value;
      if (model !== state.model) { runner.stop(); setModelStatus(''); }
      state = { model, language: ui.language.value, commands: ui.commands.checked };
      if (model !== 'none') bridge.enableIsolation();
      if (model === SpeechWhisper.FOLDER && !runner.folder) setModelStatus('Choose the folder again after reloading the page.');
      syncSettings();
      bridge.saveState();
    }
    for (const control of [ui.model, ui.language, ui.commands]) control.addEventListener('change', readSettings);
    ui.folder.addEventListener('change', () => {
      try {
        const entries = modelFolderEntries([...ui.folder.files]);
        runner.setFolder(entries);
        setModelStatus('Folder chosen:', ' ' + (ui.folder.files[0]?.webkitRelativePath?.split('/')[0] || ''));
      } catch (error) {
        runner.setFolder(null);
        setModelStatus(String(error.message));
      }
      ui.folder.value = '';
      syncSettings();
    });
    ui.load.onclick = async () => {
      controller = new AbortController();
      ui.load.disabled = true;
      try { await runner.load(state.model, { signal: controller.signal }); } catch (error) { if (error.name !== 'AbortError') setModelStatus(String(error.message)); }
      finally { controller = null; syncSettings(); }
    };
    ui.unload.onclick = () => { runner.stop(); syncSettings(); };

    // ---- Recording -----------------------------------------------------------
    const capture = createCapture({
      onLimit: () => { if (phase === 'recording') { finish(true); } },
      onTick: seconds => { if (phase === 'recording') render(seconds); }
    });

    function micError(error) {
      if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') return 'Microphone access was denied.';
      if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') return 'No microphone found.';
      if (error?.name === 'NotSupportedError') return 'No microphone access in this browser.';
      return 'The microphone could not be started.';
    }

    async function begin() {
      if (state.model === 'none') { setStatus('Choose a dictation model in Settings → General.', true); bridge.openSettings('general'); ui.model.focus(); return; }
      if (pending && !bridge.confirm(t('Discard the pending transcript and start another recording?'))) return;
      discard(false);
      const field = bridge.targetField();
      if (!field) return;
      target = { id: field.id };
      phase = 'starting';
      render();
      try {
        await capture.start();
        phase = 'recording';
        setStatus('Recording', false, ' · ' + t('max. 30 s'));
        render(0);
      } catch (error) {
        phase = 'idle';
        render();
        if (error?.name !== 'AbortError') setStatus(micError(error), true);
      }
    }

    async function finish(limit = false) {
      if (phase !== 'recording') return;
      phase = 'transcribing';
      render();
      let samples = null;
      try {
        samples = await capture.stop();
        if (!SpeechText.hasSpeech(samples)) { samples.fill(0); phase = 'idle'; render(); setStatus('No speech detected. Nothing inserted.'); return; }
        controller = new AbortController();
        const { text, device } = await runner.transcribe(samples, { preset: state.model, language: state.language, signal: controller.signal });
        samples = null;
        setModelStatus('Dictation model ready.', device === 'webgpu' ? ' (WebGPU)' : ' (CPU)');
        const clean = SpeechText.applyCommands(SpeechText.cleanTranscript(text), state.commands);
        if (!clean.trim()) { setStatus('No speech detected. Nothing inserted.'); return; }
        showPending(target.id, clean);
        setStatus(limit ? 'Recording stopped at 30 seconds.' : 'Check the transcript, then insert it.', false, limit ? ' ' + t('Check the transcript, then insert it.') : '');
      } catch (error) {
        if (error?.name === 'AbortError') setStatus('Dictation cancelled.');
        else setStatus(String(error?.message || 'Transcription failed. Try again.'), true);
      } finally {
        samples?.fill?.(0);
        controller = null;
        phase = 'idle';
        render();
        syncSettings();
      }
    }

    record.onclick = () => (phase === 'recording' ? finish() : phase === 'idle' ? begin() : null);
    cancel.onclick = async () => {
      if (phase === 'recording') { await capture.cancel(); phase = 'idle'; render(); setStatus('Dictation cancelled.'); }
      else if (phase === 'transcribing') controller?.abort();
    };

    // ---- Pending transcript --------------------------------------------------
    function showPending(id, text) {
      const area = node('textarea', { class: 'speech-text', id: 'speechText', rows: '3', 'aria-label': t('Dictation · not yet inserted') });
      area.value = text;
      const insertButton = node('button', { type: 'button', class: 'primary', id: 'speechInsert', text: 'Insert' });
      const discardButton = node('button', { type: 'button', id: 'speechDiscard', text: 'Discard' });
      const card = node('section', { class: 'speech-pending', 'data-section': id, 'aria-label': t('Dictation · not yet inserted') }, [
        node('div', { class: 'speech-pending-head' }, [node('span', { class: 'speech-label', text: 'Dictation · not yet inserted' })]),
        area, node('div', { class: 'speech-pending-actions' }, [insertButton, discardButton])
      ]);
      pending = { id, card, area };
      bridge.sectionHost(id).append(card);
      insertButton.onclick = insertPending;
      discardButton.onclick = () => { discard(true); };
      area.focus();
    }
    function insertPending() {
      if (!pending) return;
      const result = bridge.insert(pending.id, pending.area.value);
      if (!result.ok) { setStatus(result.message, true); return; }
      discard(false);
      setStatus('Inserted.');
    }
    function discard(announce) {
      if (!pending) return;
      pending.area.value = '';
      pending.card.remove();
      pending = null;
      if (announce) setStatus('Transcript discarded.');
    }

    function applyLanguage() {
      for (const el of [...hosts.toolbar.querySelectorAll('[data-speech-text]'), ...hosts.settings.querySelectorAll('[data-speech-text]'), ...(pending ? pending.card.querySelectorAll('[data-speech-text]') : [])]) el.textContent = t(el.dataset.speechText);
      setStatus(statusMessage.key, statusMessage.error, statusMessage.suffix);
      setModelStatus(modelMessage.key, modelMessage.suffix);
      render(capture.seconds);
    }
    // Feature switched off: stop everything and drop pending text (the report itself is untouched).
    async function disable() {
      if (phase === 'recording') await capture.cancel();
      controller?.abort();
      discard(false);
      phase = 'idle';
      render();
    }

    render();
    syncSettings();
    return {
      state: () => ({ ...state }),
      setState(next) { if (validState(next)) { state = { ...next }; syncSettings(); if (state.model !== 'none') bridge.enableIsolation(); } },
      applyLanguage, disable,
      get busy() { return phase !== 'idle'; }
    };
  }

  return { DE, MODELS, DEFAULT_STATE, validState, mount };
});
