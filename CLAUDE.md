# Befundungstool — project conventions

Standalone radiology report editor (HTML, German-first). It merges two older projects:

- **radnote** (`C:\Users\felix\Documents\radnote`, v1.8.0): editor, macros, templates, frozen text, undo, five rule-based report builders, Fluency Direct dictation mode.
- **Report Studio** (`C:\Users\felix\Documents\Radiologie Befundungssoftware`, v1.6.0): AI Review/Revise via API or in-browser models, diff view, encrypted settings, local launcher.

**Both old projects are READ-ONLY reference. Never modify, build, install, or run git commands that write in them.** Copy what you need into this repo.

## Commands

Node.js and Git live in `C:\Program Files\nodejs` and `C:\Program Files\Git\cmd`. If a shell lacks them, prepend: `$env:Path = "C:\Program Files\nodejs;C:\Program Files\Git\cmd;" + $env:Path`.

```powershell
npm run build              # src/ -> dist/befundungstool.html (+ public/ assets)
npm test                   # build + all tests (tests/engine, then tests/ui)
node scripts/test.cjs ui undo   # one group, filtered by file name
npm start                  # build + launcher on http://127.0.0.1:8788
npm run release            # dist/release/ (ZIP, HTML, SHA256SUMS)
```

Playwright browsers live in `.playwright-browsers/` (gitignored, copied from Report Studio, matching `@playwright/test` 1.63.0); `scripts/test.cjs` sets `PLAYWRIGHT_BROWSERS_PATH` automatically. `BT_CHROMIUM_PATH` overrides the Chromium executable.

## Layout

| Path | Contents |
| --- | --- |
| `src/app.html` | Page shell with `<!-- NAME_STYLES -->` / `<!-- NAME_SCRIPTS -->` build slots |
| `src/core/editor.js` | Editor wiring: fields, templates, macros, frozen text, undo, i18n, theme, storage, export, builder adapters |
| `src/styles/` | Core styles (to become the shared token/theme system) |
| `src/builders/` | Shared exam framework + head CT, skeletal, esophagram (radnote `builders/`) |
| `src/chest/`, `src/mra/` | Chest radiograph and MR angiography builders |
| `src/settings/` | `config.js` (radnote v2 rules), `unified.js` (`befundungstool-settings` v1 + legacy imports), `crypto.js` (encrypted envelopes) |
| `src/core/storage-migration.js` | Runs first: one-time copy of `radnote-*` browser keys to `befundungstool-*` |
| `src/dictation/` | Fluency Direct compatibility mode |
| `src/speech/` | Offline dictation: `text.js` (silence check, hallucination filter, spoken commands), `capture.js` (microphone → 16 kHz memory buffer), `whisper.js` (Transformers.js Whisper worker + runner), `panel.js` (toolbar button, pending transcript, settings) |
| `src/ai/` | `providers.js` (API requests), `contract.js` (prompts + strict per-section response format), `diff.js`, `local.js` (WebLLM/Transformers.js workers, model folders), `panel.js` (KI-Prüfung UI) |
| `src/styles/material-tokens.css` | GENERATED M3 colour roles per theme (`node scripts/material-tokens.cjs`; never edit by hand) |
| `src/styles/material.css` | Material 3 layer, loaded last: maps legacy variables to M3 roles and restyles all components |
| `public/` | Manifest, icons, index redirect; copied into `dist/` by the build |
| `assets/fonts/` | Roboto WOFF2 subsets (unmodified from Google Fonts); inlined into the HTML by the build |
| `server/local-server.cjs` | Optional loopback launcher and `/api` proxy (session token, origin/host checks) |
| `scripts/build.cjs` | Inlines everything into one HTML file; slot order = global dependency order |
| `scripts/release.cjs` | Allow-listed release ZIP + standalone HTML + SHA256SUMS in `dist/release/` |
| `licenses/`, `THIRD_PARTY_NOTICES.md` | Upstream license texts for optional runtimes/models; re-review when versions change |
| `tests/engine/` | Node-only rule/model checks; `tests/ui/` browser checks (plain Node + Playwright); `tests/helpers/` shared fixtures (`ui.cjs` opens the settings sheet, `config-file.cjs` saves/decrypts the configuration) |
| `docs/` | Module docs and the radnote reference docs (AUDIT, TERMINOLOGY, CLINICAL_NOTICE, FLUENCY_DIRECT) |

`src/builders`, `src/chest`, `src/mra`, `src/settings`, `src/dictation` stay siblings: modules `require('../builders/...')` each other.

## Architecture rules

- Output is **one self-contained HTML file** that works from `file://`, over HTTPS, and through the optional launcher. Edit `src/`, never `dist/`.
- **No runtime dependencies in the core editor.** It must make zero network requests unless the user selects an AI provider. AI runtimes (WebLLM, Transformers.js) are loaded lazily from pinned CDN URLs only in browser-model mode.
- Modules publish a browser global and `module.exports` when `module` exists, so engine code is testable in Node without a bundler. No ES-module imports between source files.
- New build slots go in `scripts/build.cjs`; the build fails on missing or unfilled slots.
- Keep dependencies minimal: `@playwright/test` (pinned) is the only dev dependency. Ask before adding any.

## Code style

- **Ported files stay byte-identical** to their radnote/Report Studio origin until a dedicated formatting-only commit (verified by the full test suite). Do not mix reformatting with behavior changes.
- New code: readable, 2-space indent, semicolons, `'use strict'` in Node scripts, small functions, no frameworks. Comments explain *why*, not *what*.
- English identifiers and English UI source strings; German translations live in the dictionary (`translations` / `DE` objects). Clinical builder output is German.

## Product decisions (approved 2026-11-11)

- **D2 Templates:** radnote field-based templates are canonical. Each template may carry optional "KI-Stilhinweise" (AI style notes). Report Studio templates import by splitting `Heading:` lines into fields.
- **D3 AI Revise:** returns revised text **per section**, shown as a per-section diff; nothing reaches the editor until the user applies it (replace / append / cancel). Frozen text stays protected; applying is undoable.
- **D4 Settings file:** one format, and every save is password-encrypted with everything in it, API keys included (user decision 2026-11-11, replacing "plain unless keys"). AES-256-GCM, PBKDF2-SHA256, 600,000 iterations, fresh salt/IV, password ≥ 12 chars. Without Web Crypto (non-secure context) saving is refused, never downgraded to plaintext. Imports radnote settings v1/v2, legacy macro files, and Report Studio plaintext v1 / encrypted v2.
- **D5 AI connection:** API keys are never written to browser storage in plaintext. Provider, model and endpoint (non-secret) are remembered like other preferences. Keys may only be kept in the encrypted browser vault (`src/settings/vault.js`, user decision 2026-11-11): same AES-GCM/PBKDF2 scheme, unlocked by password once per session, session key held in memory as a non-extractable CryptoKey, changes re-sealed automatically, "Vergessen" deletes it.
- **Layout (user decision 2026-11-11):** top app bar (report actions, AI status chip, settings gear) → report card with sticky toolbar (template, builder, AI Review/Revise) → AI suggestions and notes inline under each section → side tabs "Textbausteine" / "KI-Hinweise". All settings (appearance, language, draft saving, AI connection, vault, configuration file) live in the settings side sheet. Keep AI results next to the text they refer to.
- **Optional tools (user decision 2026-11-11):** builders, dictation, offline dictation (`speech`), study/patient/date (`meta`), AI review and the macro sidebar can each be switched off (`settings.features`, `html[data-off]`). Default on. Hiding never deletes data. With `meta` off, copy/export omit the header. New optional tools should join this list.
- **Sidebar layout (user decision 2026-11-14):** `settings.sidebar` = side (right/left), width (narrow/normal/wide), sections (macros, shortcuts, notes). One section left → no tab bar; none → no sidebar.
- **Copy/export layout (user request 2026-11-21):** `settings.copyFormat` = { headings: `upper` (default, previous behaviour) | `asNamed` (field label exactly as named), blankLines: 0–3 (default 1) } applies to "Befund kopieren" and the .txt export, also after the study header. The title line stays as before. Empty (or whitespace-only) sections are always left out, heading included (user decision 2026-11-21).
- **Macros (user decision 2026-11-14):** new macros default to word expansion (code + Space).
- **Local models via LM Studio:** provider `lmstudio` (loopback OpenAI-compatible server, no key, `response_format: json_schema` from `AiContract.responseSchema`). The launcher may forward GET only for `.../models`.
- **GGUF in the browser (user request 2026-11-14):** provider `gguf` runs a user-chosen `.gguf` file with wllama (llama.cpp WASM, pinned `@wllama/wllama@3.8.1` from jsDelivr, WebGPU or CPU). `src/ai/gguf.js` splits files over the 2 GB browser limit into llama-gguf-split-compatible Blob shards (new header + slices, no copying). Tested for real with mistral3, gemma3 and qwen35 GGUFs; keep the shard layout byte-exact (tests/engine/gguf-engine.cjs). CPU speed needs cross-origin isolation (≈6× faster than single-threaded): the launcher sends COOP/COEP credentialless, the hosted site registers `public/coi-sw.js` (headers only, no caching).
- **Offline dictation (user approval 2026-11-21, docs/OFFLINE_DICTATION_PLAN.md):** Whisper via the pinned Transformers.js 3.8.1 in a Blob worker; presets pinned to a model revision: `whisper-small` (8-bit, CPU) and `whisper-large-v3-turbo` (q4f16 on WebGPU, 8-bit on CPU otherwise), or a local model folder (Hugging Face blocked in the worker). Settings `settings.speech` = { model, language, commands }. Rules from RepDict: 16 kHz mono in memory only, hard 30 s limit, buffers zero-filled after use, never stored or uploaded; transcript is editable pending text under the target section, inserted only by "Einfügen" at the cursor (frozen text protected, undoable); "Neuer Befund" calls `speechPanel.clear()` (cancel recording, abort transcription, drop pending text; a session counter drops late results) and counts an active dictation as unsaved work for its confirmation; silence/steady noise never reaches the model (`SpeechText.hasSpeech`) and known Whisper hallucinations are dropped; spoken commands ("neuer Absatz", "neue Zeile") match inside punctuated one-line output (RepDict only matched standalone lines). No network until a model is chosen. The AudioWorklet loads from a `data:` URL (Blob URLs fail on `file://`). A chosen model also enables hosted cross-origin isolation for multi-threaded CPU.
- **Bounded AI output:** `AiContract.responseSchema(mode, { sections })` limits ids (enum), note count/length and revised text length; grammar-enforcing backends (LM Studio, wllama) therefore cannot loop. Seen in practice: radgen-ministral looped on notes for 10+ minutes without bounds.
- **Report too long for the model (2026-11-20):** one message for every provider ("Der Befund ist zu lang für den Kontext dieses Modells…", LM Studio variant suggests a larger context), with token counts when known. Checked before sending where limits are known: GGUF counts the prompt with the model's tokenizer/chat template and needs room for `AiContract.outputTokens(mode, sections)` in its 8,192-token context; WebLLM (4,096 context / 2,048 output) and the Transformers.js worker (1,024 output; its 2,048 prompt limit is checked in the worker) use `estimateTokens` (≈3 chars/token). Afterwards: `finish_reason: length` / `MAX_TOKENS` and server context errors (OpenAI code, llama.cpp/LM Studio/Gemini wording; the launcher passes only the code) map to the same message. A cut-off answer is discarded, never shown or applied. LM Studio's API reports only a model's maximum context, not the loaded one, so it relies on these errors.
- **AI input:** empty sections are never sent (models invent content for them). Applied/discarded suggestions are removed; "Close AI results" clears everything without touching report text.
- **D6 Themes:** Report Studio's six themes (System, Studio Light, Slate Dark, Midnight, Cobalt Light, Cobalt Dark), each rendered as a Material 3 colour scheme (see Design system).
- **D7/D8:** see Code style; npm + pinned `@playwright/test`.
- German is the default UI language with an English switch; the AI report language is a separate setting.

## Design system: Material Design 3 (user requirement, 2026-11-11)

- Follow the [Material 3 guidelines](https://m3.material.io/) for colour roles, typography scale, shape, elevation, states and components.
- Colours: only `--md-sys-color-*` roles (and `--md-ext-color-warning*` for warnings). No hex values in component CSS. Themes are generated from seed colours in `scripts/material-tokens.cjs`; tones are CIELAB L*, so contrast follows the M3 tone mapping. `tests/engine/material-tokens.cjs` enforces WCAG contrast and that the generated file is current.
- Components: filled button = primary action (`button.primary`), outlined = default, text buttons for low-emphasis/inline actions, 32 px small buttons in dense module controls; outlined text fields (4 px corners); elevated cards for top-level surfaces, outlined cards for nested groups; chips (8 px corners) for presets, filters and frozen text; dialogs 28 px corners on surface-container-high; snackbar on inverse-surface; focus ring 3 px secondary.
- Shape tokens `--md-sys-shape-corner-*`, elevation `--md-sys-elevation-1..3`, state layers via `color-mix` (hover 8 %, pressed 10 %).
- Offline rule wins over Material defaults: nothing is fetched at runtime. Roboto (variable font, SIL OFL 1.1) lives in `assets/fonts/` and is inlined as data URLs by `scripts/build.cjs` (`FONT_STYLES`); provenance and hashes in `licenses/SOURCES.json`. Icons, if needed, must be inlined SVG (no Material Symbols font downloads).
- Ported module CSS stays unchanged; adapt it from `material.css` with the `:root[data-palette][data-theme]` prefix. New components (like the AI panel) use M3 tokens directly.
- `data-theme` stays the light/dark family (module CSS and tests rely on it); `data-palette` selects the scheme.

## Clinical invariants (from radnote — do not weaken)

1. Only explicitly documented and assessed structures produce findings; unselected/unassessed/non-assessable never imply normal.
2. MRA region selection controls available segments; shared vessels appear once; sides, segments, lesions, measurements stay distinct.
3. Never infer collateralization, distal reconstitution, or runoff.
4. Never turn nonspecific morphology into a confirmed diagnosis; suppress contradictory normal statements.
5. Manual preview edits survive structured changes; regeneration/restoration is explicit.
6. Transfers respect frozen text and existing content: explicit append / replace / cancel.
7. Keep legacy values visible when they need review; never silently discard findings or bulk-rewrite user macros.

## AI invariants (from Report Studio — do not weaken)

- Review produces notes only; Revise produces an editable draft plus notes. Invalid/unstructured model output never replaces an accepted result.
- Never switch providers silently and never fall back to cloud inference. Show where report text is sent before sending.
- Results carry provenance (input snapshot of **all** sections, frozen text, template, language, connection, model, prompt); any change marks them outdated; applying an outdated result needs confirmation. Changes made by applying suggestions from the same result are expected (`result.expected`). User edits made during a request are preserved.
- Async ownership: every asynchronous workflow (model loads, model lists, vault writes) carries a generation/ticket and re-checks it after each `await`; obsolete work is dropped and its resources disposed once. Never let a late completion overwrite newer state.
- Output safeguards ported from RepDict (2026-11-20), per section: a Review answer with rewritten sections is rejected and its "changes" list dropped; a blank or NUL-containing revised section rejects the answer; `Contract.headingsIntact` warns on a suggestion that removes, reorders or merges standalone headings inside a section (known section words or short "Heading:" lines) and applying it needs confirmation, like changed frozen text.
- Every provider's answer is checked against hard limits in `Contract.parse` (`HARD`); the JSON-schema `LIMITS` only steer grammar-constrained backends.
- Render model text as text (no HTML injection). Keep diagnostics bounded; never surface raw upstream errors that might contain report text or keys.
- Imported AI connections never activate silently: if a configuration file (own format or Report Studio) would change the provider or any API endpoint (`BefundSettings.connectionChanges`), the editor shows provider, endpoint and model and waits for "Neue Verbindung übernehmen"; "Behalten"/Escape keeps the current AI settings while the rest of the file applies.
- Changing an endpoint's origin clears its key. Hidden local-mode fields never leak into requests.
- Browser-model lifecycle: cancel/unload/clear terminates workers and revokes Blob URLs; local model files never fall back to online downloads.

## Data boundaries

- Never discard typed report text automatically (no unguarded reloads; hosted isolation reloads only while `BefundungstoolCanReload()` is true). Never truncate imports or libraries silently: check limits first and refuse with a clear message; an unreadable stored library is kept, not overwritten.
- Configuration (macros, templates, favorites, preferences) is separate from the optional local draft (report text, patient/reference, frozen ranges, builder findings). Config export never contains report content.
- Browser storage keys are prefixed `befundungstool-` (never write `radnote-*` keys; radnote may share the origin). API keys are never written to browser storage in plaintext (only the encrypted vault).
- Browser storage may be unavailable: degrade to session-only, never crash.
- Tests, fixtures, logs and examples use **synthetic data only**. No real patient data or credentials anywhere in the repo.
- Legal: MIT. Keep DRG/AGIT/Fleischner/AO/ACR attribution (docs/radnote/TERMINOLOGY.md) and third-party runtime notices. Never claim clinical, DRG, or vendor certification.

## Git and releases

- Commit after each working milestone (tests green). End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No remote yet. Never push, tag, or publish without the user's explicit OK.
- Versioning: SemVer, 0.x until the first release. Keep `VERSION`, `package.json`, the HTML `application-version` meta tag and the visible badge aligned.
