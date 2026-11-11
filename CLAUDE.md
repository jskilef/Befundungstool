# Befundungstool — project conventions

Standalone radiology report editor (HTML, German-first). It merges two older projects:

- **radnote** (`C:\Users\felix\Documents\radnote`, v1.8.0): editor, macros, templates, frozen text, undo, five rule-based report builders, Fluency Direct dictation mode.
- **Report Studio** (`C:\Users\felix\Documents\Radiologie Befundungssoftware`, v1.6.0): AI Review/Revise via API or in-browser models, diff view, encrypted settings, local launcher.

**Both old projects are READ-ONLY reference. Never modify, build, install, or run git commands that write in them.** Copy what you need into this repo.

## Commands

Node.js and Git live in `C:\Program Files\nodejs` and `C:\Program Files\Git\cmd`. If a shell lacks them, prepend: `$env:Path = "C:\Program Files\nodejs;C:\Program Files\Git\cmd;" + $env:Path`.

```powershell
npm run build              # src/ -> dist/befundungstool.html
npm test                   # build + all tests (tests/engine, then tests/ui)
node scripts/test.cjs ui undo   # one group, filtered by file name
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
| `src/settings/` | Configuration format, validation, import/merge |
| `src/dictation/` | Fluency Direct compatibility mode |
| `src/ai/` | (planned) providers, response contract, encryption, diff, local-model workers |
| `scripts/build.cjs` | Inlines everything into one HTML file; slot order = global dependency order |
| `tests/engine/` | Node-only rule/model checks; `tests/ui/` browser checks (plain Node + Playwright) |
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
- **D4 Settings file:** one format. Plain JSON unless "API-Schlüssel einschließen" is ticked, which forces encryption (AES-256-GCM, PBKDF2-SHA256, 600,000 iterations, fresh salt/IV, password ≥ 12 chars). Imports radnote settings v1/v2, legacy macro files, and Report Studio plaintext v1 / encrypted v2.
- **D5 AI connection:** API keys are **never** written to browser storage. Provider, model and endpoint (non-secret) are remembered like other preferences.
- **D6 Themes:** Report Studio's six themes (System, Studio Light, Slate Dark, Midnight, Cobalt Light, Cobalt Dark) and its CSS token set, applied to every module.
- **D7/D8:** see Code style; npm + pinned `@playwright/test`.
- German is the default UI language with an English switch; the AI report language is a separate setting.

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
- Results carry provenance (input snapshot); changed inputs mark them outdated; exporting/applying an outdated result needs confirmation. User edits made during a request are preserved.
- Render model text as text (no HTML injection). Keep diagnostics bounded; never surface raw upstream errors that might contain report text or keys.
- Changing an endpoint's origin clears its key. Hidden local-mode fields never leak into requests.
- Browser-model lifecycle: cancel/unload/clear terminates workers and revokes Blob URLs; local model files never fall back to online downloads.

## Data boundaries

- Configuration (macros, templates, favorites, preferences) is separate from the optional local draft (report text, patient/reference, frozen ranges, builder findings). Config export never contains report content.
- Browser storage may be unavailable: degrade to session-only, never crash.
- Tests, fixtures, logs and examples use **synthetic data only**. No real patient data or credentials anywhere in the repo.
- Legal: MIT. Keep DRG/AGIT/Fleischner/AO/ACR attribution (docs/radnote/TERMINOLOGY.md) and third-party runtime notices. Never claim clinical, DRG, or vendor certification.

## Git and releases

- Commit after each working milestone (tests green). End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No remote yet. Never push, tag, or publish without the user's explicit OK.
- Versioning: SemVer, 0.x until the first release. Keep `VERSION`, `package.json`, the HTML `application-version` meta tag and the visible badge aligned.
