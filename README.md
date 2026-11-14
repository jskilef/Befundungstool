# Befundungstool

A standalone radiology report editor that runs in the browser. German by default with an English interface switch. It combines the radnote report editor (macros, templates, structured report builders) with Report Studio's optional AI review and revision.

**Version 0.1.0** (unreleased) · [Changelog](CHANGELOG.md) · [Clinical and data notice](CLINICAL_NOTICE.md) · [MIT License](LICENSE)

## Start

- **Standalone:** run `npm run build` and open `dist/befundungstool.html`, or open `befundungstool.html` from a release ZIP. No installation and no server needed.
- **Optional launcher** (Node.js 18+): `npm start` or `node local-server.cjs` in a release folder, then open `http://127.0.0.1:8788`. It helps when an AI provider blocks direct browser requests (CORS) and enables installing the app. Set `BEFUNDUNGSTOOL_PORT` to use another port.

Without an AI provider selected, the app makes no network requests.

## Features

**Writing reports**
- Templates: structured, "Befund und Beurteilung", freestyle, and custom templates with named, reorderable fields and default text.
- Macros: `.code` + Tab inserts text; word expansion (`re` + Space → `rechts `); categories, favorites, search; `[[placeholders]]` with F2.
- Frozen text survives new reports; undo/redo (Ctrl/Cmd+Z, 200 steps); copy per field, copy report, export .txt (Ctrl/Cmd+S), print/PDF.
- Optional draft saving on this device. Fluency Direct dictation compatibility mode ([details](docs/radnote/FLUENCY_DIRECT.md)).

**Report builders** (dropdown "Baukasten"): chest radiograph, MR angiography, head CT with ASPECTS, skeletal radiography (21 regions), esophagram. Unassessed structures never produce normal statements; manual preview edits are protected; transfers ask before appending or replacing. Details: [builders](docs/modules/builders.md), [chest](docs/modules/chest.md), [MRA](docs/modules/mra.md), [terminology sources](docs/radnote/TERMINOLOGY.md).

**AI review ("KI-Prüfung", optional)**
- Set up once under the gear icon → *KI* (or *KI einrichten* in the report toolbar). The chip in the top bar shows the current provider, or that AI is off or locked.
- *Prüfen* (Review) and *Überarbeiten* (Revise) sit in the report toolbar. Notes appear directly under the section they refer to and in the *KI-Hinweise* tab (click a note to jump to its section). Revise shows a suggestion card under each changed section with a word diff: *Übernehmen*, *Anhängen*, *Bearbeiten* (edit the suggestion first) or *Verwerfen*. Nothing changes in the report until you choose; frozen text stays protected and every change can be undone.
- Changes to numbers, units, sides, negation and uncertainty are outlined. Results are marked outdated when the report changes.
- Providers: OpenAI, Google Gemini, **LM Studio** (your own GGUF models on this PC), any OpenAI-compatible API, or in-browser models: WebLLM on WebGPU (Qwen3), Transformers.js on CPU (Qwen3, SmolLM2), experimental MedGemma, and your own ONNX/MLC model folders ([model files](docs/MODEL_DOWNLOADS.md)).
- Each custom template can carry *KI-Stilhinweise* (AI style notes). Review/Revise prompts are editable under *Erweiterte Einstellungen*.

**Own GGUF models directly in the browser**
- Gear → *KI* → *Lokal im Browser · GGUF-Modelldatei (llama.cpp)*, then choose the `.gguf` file (e.g. from `%USERPROFILE%\.lmstudio\models`). No LM Studio, no server, no key; the file never leaves the PC. Only the llama.cpp runtime (wllama 3.8.1) is loaded from jsDelivr on first use.
- Files over 2 GB are split into parts inside the browser automatically (no copy, no conversion).
- Uses WebGPU when the browser offers it, otherwise the CPU (several threads when the page is cross-origin isolated: automatically through the launcher, and on the hosted site via a small service worker after one reload; a directly opened HTML file runs single-threaded and is much slower). Expect roughly 40–90 s per revision for 3–4B models; LM Studio is faster.
- Choose the file again after reopening the app (browsers do not keep file access).

**Own models with LM Studio**
- In LM Studio: *Developer* → start the server (port 1234) and load a model. In Befundungstool: gear → *KI* → *LM Studio (auf diesem Gerät)*; the model list loads automatically, no key needed. Report text stays on this PC.
- The browser needs LM Studio's **CORS** option (server settings) when the app runs from the website or a local file. Alternatively start the app with `npm start` (local launcher), which works without CORS.
- LM Studio enforces the response format (structured output), so fine-tuned models return valid suggestions. Empty report sections are not sent, because models tend to fill them with invented content. Local fine-tunes can still reverse findings (e.g. "kein" ↔ "Nachweis"): check every amber-outlined change.
- After a revision, applied or discarded suggestions disappear; *KI-Ergebnisse schließen* in the AI status line removes all remaining notes and suggestions without starting a new report.

**Only what you need**
- Gear → *Allgemein* → *Funktionen*: switch off report builders, dictation, the study/patient/date fields, AI review or the sidebar. The sidebar can sit left or right, in three widths, with any of its sections (Textbausteine, Tastenkürzel, KI-Hinweise).
- New macros default to word expansion (*Kürzel + Leertaste*). Hidden tools keep their data. Without study/patient/date, *Befund kopieren* and *Exportieren* contain only the report sections, ready to paste.

**Settings and appearance**
- *Konfiguration speichern/laden*: one password-encrypted file with everything: macros, templates, favorites, preferences, AI settings and API keys (AES-256-GCM, PBKDF2-SHA256 with 600,000 iterations; passwords of at least 12 characters, not recoverable). Loading asks for the password and restores the keys into memory. By default an encrypted copy of the AI settings and keys is also kept in the browser, so the next session only asks for the password (*Später* skips it, *Vergessen* deletes the copy; manage it under gear → *KI*). Also imports radnote configuration and macro files and Report Studio settings files (plain or encrypted). Report text is never part of a settings file.
- Material Design 3 interface with six themes: System, Studio Hell, Schiefer Dunkel, Mitternacht, Kobalt Hell, Kobalt Dunkel. The Roboto font is embedded, so the app looks the same offline.

## Data handling

Report text stays in the browser unless you copy, export or print it, enable draft saving (stored on this device), or run an AI action. API modes send the report sections and template notes to the endpoint shown in the panel; browser-model modes process them locally but download runtime and model files. API keys are kept in memory only, never in browser storage. Use de-identified text and institution-approved services. See the [clinical and data notice](CLINICAL_NOTICE.md).

## Development

Requires Node.js 22+ for development.

```sh
npm install --ignore-scripts
npm test                      # build + all checks (Node rule checks and Playwright browser checks)
node scripts/test.cjs ui ai   # one group, filtered by file name
npm run release               # dist/release: ZIP, standalone HTML, SHA256SUMS.txt
```

Browser checks use Chromium from `.playwright-browsers/` when present, otherwise from `npx playwright install chromium`. All tests use synthetic reports, mocked providers and a synthetic in-browser runtime; they do not evaluate model quality or clinical accuracy.

Sources live in `src/` and are inlined into one HTML file by `scripts/build.cjs`. Project conventions, invariants and decisions are in [CLAUDE.md](CLAUDE.md).

## License

Project code is [MIT-licensed](LICENSE). The embedded Roboto font is under the [SIL Open Font License 1.1](licenses/Roboto-OFL.txt). Optional runtimes and model assets keep their own licenses and are downloaded separately: see [third-party notices](THIRD_PARTY_NOTICES.md) and [licenses/](licenses/). AI suggestions and builder text require clinical review; no clinical or regulatory certification is claimed.
