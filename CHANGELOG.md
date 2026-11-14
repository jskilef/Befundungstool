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
- GGUF models directly in the browser: llama.cpp via wllama 3.8.1 (WebGPU or CPU), model file chosen locally, files over 2 GB split in the browser without copying, structured output enforced by JSON schema.
- LM Studio provider: local GGUF models via LM Studio's server, model list, no key, structured output enforced with a JSON schema; works directly (CORS on) or through the launcher.
- Empty report sections are no longer sent to the AI.
- Applied or discarded suggestions disappear; "KI-Ergebnisse schließen" clears all AI results without a new report.
- Sidebar: left/right, three widths, choice of sections. New macros default to word expansion.
- Feature switches in Settings → General: hide report builders, dictation, study/patient/date (copy/export then omit the header), AI review or the macro sidebar; saved in preferences and the configuration file.
- Reworked layout: app bar with AI status chip and settings sheet; sticky report toolbar with template, builder and AI actions; AI notes and suggestions inline under each section; side tabs for macros and AI notes.
- Browser data moved to `befundungstool-*` keys with a one-time copy of existing radnote data.
