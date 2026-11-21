# Befundungstool

A standalone radiology report editor that runs in the browser. German by default with an English interface switch. It combines the radnote report editor (macros, templates, structured report builders) with Report Studio's optional AI review and revision.

**Version 0.1.0** (unreleased) · [Changelog](CHANGELOG.md) · [Clinical and data notice](CLINICAL_NOTICE.md) · [MIT License](LICENSE)

## Start

- **Standalone:** run `npm run build` and open `dist/befundungstool.html`, or open `befundungstool.html` from a release ZIP. No installation and no server needed.
- **Optional launcher** (Node.js 18+): `npm start` or `node local-server.cjs` in a release folder, then open `http://127.0.0.1:8788`. It helps when an AI provider blocks direct browser requests (CORS) and enables installing the app. Set `BEFUNDUNGSTOOL_PORT` to use another port.

Without an AI provider selected, the app makes no network requests.

### Desktop app (Windows, macOS, Linux)

Optional. On some PCs the installed Chrome or Edge blocks WebGPU (IT policies such as `HardwareAccelerationModeEnabled`, or Chromium's GPU blocklist), so browser models and offline dictation fall back to slow CPU paths or do not run. The desktop app brings its own Chromium (Electron), which is not affected by those browser settings. It turns on WebGPU wherever the hardware supports it, prefers the dedicated GPU on laptops, and is cross-origin isolated for multi-threaded CPU inference.

| System | Package | Note on first start |
| --- | --- | --- |
| Windows 10/11 (x64) | `befundungstool-v<version>-windows-portable.exe`: single file, no installation, no admin rights | Not code-signed: SmartScreen may show "Der Computer wurde durch Windows geschützt"; choose *Weitere Informationen → Trotzdem ausführen*. Managed PCs may block unsigned programs; ask your IT department. |
| macOS (Apple Silicon `arm64`, Intel `x64`) | `befundungstool-v<version>-macos-<arch>.dmg`: drag the app to *Programme* | Not notarized by Apple: Control-click the app → *Öffnen* → *Öffnen*. If macOS reports the app as damaged, run `xattr -dr com.apple.quarantine /Applications/Befundungstool.app` once. macOS asks for microphone access the first time you dictate. |
| Linux x64 (Debian/Ubuntu) | `befundungstool-v<version>-linux-<arch>.deb`: `sudo apt install ./befundungstool-….deb` | Recommended on Linux: the package sets up Chromium's sandbox, including the AppArmor profile Ubuntu 24.04+ needs. |
| Linux x64 (other distributions) | `befundungstool-v<version>-linux-<arch>.AppImage`: `chmod +x`, then run | Ubuntu 23.10+ blocks the sandbox an AppImage needs; use the `.deb` there. |

- **Build:** packages are built on the system they are for. `npm install --ignore-scripts`, then `npm run desktop:setup` (downloads the Electron binary for tests and `npm run desktop`), then `npm run desktop:build` (packages in `dist/desktop/`) or `npm run release:desktop` (adds them to `dist/release/` with their SHA-256 in `SHA256SUMS.txt`). The GitHub workflow *Desktop app* (`.github/workflows/desktop.yml`) runs the checks and builds on Windows, macOS and Linux and collects everything into one release folder with one `SHA256SUMS.txt`.
- **Start from the repository:** `npm run desktop` (builds the app, then opens the window).
- **Same app inside:** the window runs the local launcher in-process on the fixed address `http://127.0.0.1:8790` (the browser launcher keeps 8788). AI requests go through its `/api` proxy, using the system proxy settings and certificate store. Only one window runs at a time; starting it again brings the open window to the front. If another program uses port 8790, the app shows an error and quits instead of switching ports, because settings, drafts, the encrypted key vault and downloaded models belong to that address.
- **GPU status:** *Hilfe → GPU-Status* (or start with `--gpu-info`) shows whether WebGPU is available, the adapter (vendor, architecture, features, limits), cross-origin isolation, CPU threads and Chromium's GPU feature status. *Details kopieren* copies everything as JSON; *Chromium-GPU-Bericht* opens `chrome://gpu`. WebGPU uses Direct3D 12 on Windows, Metal on macOS and Vulkan on Linux (the app turns Vulkan on there).
- **Graphics problems:** start with `--safe-gpu` (Windows: a shortcut to the `.exe` with `--safe-gpu`; macOS: `open -a Befundungstool --args --safe-gpu`; Linux: `befundungstool --safe-gpu`). This keeps Chromium's GPU defaults and the blocklist, so WebGPU may be unavailable. `--disable-gpu` turns GPU acceleration off completely.
- **Data stays on this computer:** everything the browser version keeps in browser storage is kept in `%APPDATA%\Befundungstool` (Windows), `~/Library/Application Support/Befundungstool` (macOS) or `~/.config/Befundungstool` (Linux). The app has no updater and no crash reporting and makes no network requests until you choose an AI provider or a model. The microphone is the only device it can use, and only for offline dictation.

### Phones and tablets

Use the hosted site in the phone's browser (Chrome on Android, Safari on iPhone/iPad) and add it to the home screen: Chrome menu → *App installieren* / *Zum Startbildschirm hinzufügen*, Safari share menu → *Zum Home-Bildschirm*. It then opens full-screen like an app. There is no separate phone app: the phone's own browser is the runtime with the best WebGPU support there, while app wrappers would run in a web view with weaker support.

- **Macros:** touch keyboards have no Tab key, so on phones and tablets *Space* also expands `.code` macros (`.pleura` + Space); the macro list shows "Leertaste". Tapping a macro inserts it into the active section. Placeholders (`[[…]]`) have no F2 jump on touch keyboards; select them by tapping.
- **AI:** API providers are called directly from the browser (there is no local launcher on a phone), so the provider must allow browser requests. LM Studio on another computer is not reachable (loopback only). Browser models need a lot of memory: prefer the small presets; larger models may fail to load or run slowly. On iPhone and iPad the CPU path may stay single-threaded (Safari does not support the isolation mode the site uses), so use WebGPU models there.
- **Dictation:** the microphone works over HTTPS after the browser's permission prompt; audio is handled as on the desktop (memory only, never stored or uploaded).
- **Data:** settings, drafts and the key vault stay in that phone's browser, separate from other devices. Use de-identified text, as everywhere.

## Features

**Writing reports**
- Templates: structured, "Befund und Beurteilung", freestyle, and custom templates with named, reorderable fields and default text.
- Macros: `.code` + Tab inserts text; word expansion (`re` + Space → `rechts `); categories, favorites, search; `[[placeholders]]` with F2.
- Frozen text survives new reports; undo/redo (Ctrl/Cmd+Z, 200 steps); copy per field, copy report, export .txt (Ctrl/Cmd+S), print/PDF. Under gear → *Allgemein* → *Kopieren und Export*: section headings in capitals or as the fields are named, and 0–3 blank lines between sections. Empty sections are left out.
- Optional draft saving on this device. Fluency Direct dictation compatibility mode ([details](docs/radnote/FLUENCY_DIRECT.md)).
- **Offline dictation** ("Diktieren" in the report toolbar): Whisper runs in the browser. Choose a model under the gear icon → *Allgemein* → *Offline-Diktat*: Whisper small (CPU, ≈ 250 MB) or Whisper large-v3-turbo (WebGPU ≈ 560 MB, otherwise CPU ≈ 1.1 GB; much better medical terms), or a local model folder. Recordings last at most 30 s; the transcript appears as editable text under the section and is inserted only with *Einfügen*. "Neuer Absatz" / "neue Zeile" become paragraph and line breaks (switchable). Silence inserts nothing.

**Report builders** (dropdown "Baukasten"): chest radiograph, MR angiography, head CT with ASPECTS, skeletal radiography (21 regions), esophagram. Unassessed structures never produce normal statements; manual preview edits are protected; transfers ask before appending or replacing. Details: [builders](docs/modules/builders.md), [chest](docs/modules/chest.md), [MRA](docs/modules/mra.md), [terminology sources](docs/radnote/TERMINOLOGY.md).

**AI review ("KI-Prüfung", optional)**
- Set up once under the gear icon → *KI* (or *KI einrichten* in the report toolbar). The chip in the top bar shows the current provider, or that AI is off or locked.
- *Prüfen* (Review) and *Überarbeiten* (Revise) sit in the report toolbar. Notes appear directly under the section they refer to and in the *KI-Hinweise* tab (click a note to jump to its section). Revise shows a suggestion card under each changed section with a word diff: *Übernehmen*, *Anhängen*, *Bearbeiten* (edit the suggestion first) or *Verwerfen*. Nothing changes in the report until you choose; frozen text stays protected and every change can be undone.
- Changes to numbers, units, sides, negation and uncertainty are outlined. Results are marked outdated when the report changes.
- Providers: OpenAI, Google Gemini, **LM Studio** (your own GGUF models on this PC), any OpenAI-compatible API (enter the base URL from the provider's docs, e.g. `https://api.mistral.ai/v1`; `/chat/completions` is added), or in-browser models: WebLLM on WebGPU (Qwen3), Transformers.js on CPU (Qwen3, SmolLM2), experimental MedGemma, and your own ONNX/MLC model folders ([model files](docs/MODEL_DOWNLOADS.md)).
- Each custom template can carry *KI-Stilhinweise* (AI style notes). Review/Revise prompts are editable under *Erweiterte Einstellungen*; the defaults are German or English, following the report language (or the interface language).

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

Dictation audio stays in the browser's memory (at most 30 s), is cleared after transcription and is never stored or uploaded; the dictation model and runtime are downloaded once, only after you choose a dictation model. Report text stays in the browser unless you copy, export or print it, enable draft saving (stored on this device), or run an AI action. API modes send the report sections and template notes to the endpoint shown in the panel; browser-model modes process them locally but download runtime and model files. API keys are never stored in plaintext: they stay in memory, in the password-encrypted configuration file, and (unless you choose *Vergessen*) in the encrypted copy in this browser. *Verbindung testen* sends a short fixed test text, not the report. On the hosted version, choosing a browser model also loads a small service worker from the same site (`coi-sw.js`) so the model can use several CPU threads; it transmits nothing. Use de-identified text and institution-approved services. See the [clinical and data notice](CLINICAL_NOTICE.md).

## Development

Requires Node.js 22+ for development.

```sh
npm install --ignore-scripts
npm test                      # build + all checks (Node rule checks and Playwright browser checks)
node scripts/test.cjs ui ai   # one group, filtered by file name
npm run release               # dist/release: ZIP, standalone HTML, SHA256SUMS.txt
npm run release:desktop       # the same plus freshly built desktop packages for this system
npm run desktop:setup         # once: download the Electron binary (skipped by --ignore-scripts)
npm run desktop               # build + desktop window
npm run desktop:build         # dist/desktop/: packages for this system (exe, dmg, or deb + AppImage)
npm run test:desktop          # desktop checks only (Playwright drives Electron)
npm run desktop:start-check   # start the desktop app 10 times without Playwright; each start must reach "ready"
```

Browser checks use Chromium from `.playwright-browsers/` when present, otherwise from `npx playwright install chromium`. Desktop checks run as part of `npm test` once the Electron binary is installed; without it they are skipped with a note. All tests use synthetic reports, mocked providers and a synthetic in-browser runtime; they do not evaluate model quality or clinical accuracy.

Sources live in `src/` and are inlined into one HTML file by `scripts/build.cjs`. Project conventions, invariants and decisions are in [CLAUDE.md](CLAUDE.md).

## License

Project code is [MIT-licensed](LICENSE). The embedded Roboto font is under the [SIL Open Font License 1.1](licenses/Roboto-OFL.txt). Optional runtimes and model assets keep their own licenses and are downloaded separately: see [third-party notices](THIRD_PARTY_NOTICES.md) and [licenses/](licenses/). AI suggestions and builder text require clinical review; no clinical or regulatory certification is claimed.
