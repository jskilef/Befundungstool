# Changelog

All notable changes to Befundungstool. Versions follow Semantic Versioning.

## Unreleased — 0.1.0

First version, merging radnote 1.8.0 and Report Studio 1.6.0 into one standalone editor.

### From radnote
- Structured, combined, freestyle and custom field templates; per-field copy, export, print/PDF.
- Tab macros, Space word expansion, F2 placeholders, frozen text, 200-step undo/redo.
- Report builders: chest radiograph, MR angiography, head CT (ASPECTS), skeletal radiography, esophagram.
- Fluency Direct dictation compatibility mode; optional local draft saving.

### From Report Studio
- AI Review and Revise via OpenAI, Gemini or OpenAI-compatible APIs, or in the browser (WebLLM / Transformers.js, MedGemma, custom ONNX/MLC model folders).
- Word diff with highlighting of numbers, units, sides, negation and uncertainty; outdated-result tracking.
- Password-encrypted settings (AES-256-GCM, PBKDF2 600,000 iterations); optional loopback launcher; installable web app.
- Six themes: System, Studio Light, Slate Dark, Midnight, Cobalt Light, Cobalt Dark.

### New in the merged tool
- AI Revise works per report section; proposals are applied only by explicit Replace/Append and respect frozen text and undo.
- One settings file (`befundungstool-settings` v1), always saved password-encrypted with everything including API keys, with optional AI style notes per template. Imports radnote settings v1/v2, legacy macro files and Report Studio settings (plain and encrypted); Report Studio templates become field templates.
- API keys are never written to browser storage in plaintext; an optional encrypted copy is unlocked by password once per session. Provider, model and endpoint are remembered.
- "Befund kopieren" and the .txt export: section headings in capitals (as before), exactly as the fields are named, or left out, and 0–3 blank lines between sections (Settings → General → "Kopieren und Export"); saved with the other preferences and in the configuration file. Empty sections are left out.
- AI Review/Revise per section, set per template: "An KI-Prüfung senden" for each field in the template dialog ("Vorlage bearbeiten", now also for built-in templates, where only the AI settings and AI style notes can change). Switched-off sections are never sent (fewer tokens; text such as patient details stays in the editor), show "Nicht an KI" in their heading, and the status shows how many were left out. Saved with the template and in the configuration file.
- Macros: optional "Großschreibung übernehmen" per macro. Typing the shortcut with a capital first letter (`Re` + Space, `.Normal` + Tab) inserts the text with a capital first letter ("Rechts"). Off by default; saved with the macro and in the configuration file.
- Clicking into a report section shows the green focus bar without moving the text: the field keeps its width, so lines no longer re-wrap on focus.
- Offline dictation: Whisper in the browser (small on CPU, large-v3-turbo on WebGPU or CPU, or a local model folder). Up to 30 s per recording, audio only in memory and cleared after use, never stored or uploaded; the transcript is editable and inserted only on request at the cursor; silence inserts nothing; "neuer Absatz" / "neue Zeile" work inside normal punctuated speech. "Neuer Befund" ends a running recording or transcription and discards a transcript not yet inserted (and asks first, as for report text), so dictation for one report never reaches the next. Switchable under Settings → Features.
- A configuration file with a different AI provider or endpoint no longer switches the connection silently: the new provider, endpoint and model are shown and become active only after "Neue Verbindung übernehmen"; otherwise the current connection stays and the rest of the file is loaded.
- Fixes from the 2026-11-15 audit (docs/audits): an AI suggestion becomes outdated when any other section, frozen text, connection, model or prompt changes (applying suggestions from the same result still works without warnings); the hosted page no longer reloads by itself while a report has text, and registers its service worker only when a browser model is selected; double-clicking a macro inserts it once and no longer opens the editor; inline AI diffs keep paragraph breaks; a 101st template is refused instead of hiding the whole library after a reload, and an unreadable saved library is kept; Report Studio imports with more than 100 templates or 30 sections per template are refused instead of silently shortened; "Vergessen" can no longer be undone by a pending encrypted save; a late model list no longer changes another provider's model; cancelling, unloading or switching a GGUF model while it loads leaves nothing loaded.
- Hard limits for every AI answer (20 notes, 20,000 characters per section); "Modelle laden" sends the API key for hosted APIs; tabs work with arrow keys; no spinner animation with reduced motion; the test runner fails on unknown groups, empty selections and hung scripts.
- Default AI prompts in German or English, following the report language (or the interface language when "Same as original"); edited prompts are kept as written.
- OpenAI-style endpoints accept the provider's base URL (as `base_url` in the OpenAI libraries, e.g. `https://api.eu.mistral.ai/v1` or Gemini's `…/v1beta/openai`) or the full `/chat/completions` URL; model lists use the same base. Posting to a bare base URL failed as a CORS error.
- AI answers are bounded through the JSON schema (known section ids, at most 6 notes of 300 characters, revised text at most about twice the original), so small models can no longer loop until the length limit; GGUF context raised to 8192 tokens with a report-sized output budget.
- Stricter AI answers (from Report Studio native): a Review that rewrites the report is rejected and no longer lists "language edits"; a revision that would empty a section is rejected; a suggestion that removes, reorders or merges headings inside a section (e.g. "Befund:" / "Beurteilung:" in the free-text template) shows a warning and asks before it is applied.
- Reports that do not fit the model get one clear message ("Der Befund ist zu lang für den Kontext dieses Modells", with token counts when known) for every provider, instead of cut-off or partial output: GGUF checks the prompt with the model's own tokenizer before generating, the other browser models check their fixed limits, and server context errors and cut-off answers from OpenAI, Gemini, LM Studio and other APIs are recognised (also through the launcher).
- GGUF models directly in the browser: llama.cpp via wllama 3.8.1 (WebGPU or CPU), model file chosen locally, files over 2 GB split in the browser without copying, structured output enforced by JSON schema.
- LM Studio provider: local GGUF models via LM Studio's server, model list, no key, structured output enforced with a JSON schema; works directly (CORS on) or through the launcher.
- Empty report sections are no longer sent to the AI.
- Applied or discarded suggestions disappear; "KI-Ergebnisse schließen" clears all AI results without a new report.
- Sidebar: left/right, three widths, choice of sections. New macros default to word expansion.
- Feature switches in Settings → General: hide report builders, dictation, study/patient/date (copy/export then omit the header), AI review or the macro sidebar; saved in preferences and the configuration file.
- Reworked layout: app bar with AI status chip and settings sheet; sticky report toolbar with template, builder and AI actions; AI notes and suggestions inline under each section; side tabs for macros and AI notes.
- Browser data moved to `befundungstool-*` keys with a one-time copy of existing radnote data.
