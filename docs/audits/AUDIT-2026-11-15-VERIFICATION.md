# Befundungstool audit — verification record

Date: **15 November 2026**. Source: **0.1.0**, commit **95176056bf63f9fa2b4352189f38209dfd8ad669**.

See [the main report](AUDIT-2026-11-15.md) for severity, impact, suggested changes, and priorities. This file records what was actually exercised, including environmental failures and negative results.

## Preservation of the project

- Initial Git status showed only the pre-existing untracked `.codex/` directory.
- No existing tracked files were changed; no project-local build or release was run.
- The normal test runner always builds `dist`, so the audit copied all 140 tracked files to an isolated temporary directory and ran it there. Installed Playwright and browser binaries were reused by absolute path; no packages or browsers were installed.
- Extra browser probes used the real build function with filesystem writes captured in memory. The resulting HTML was served through Playwright routes in fresh synthetic browser contexts.
- The only project additions are the two audit Markdown reports. No commit or Git staging was performed.

## Existing regression suite

Initial isolated run: **33 passed, 5 environment-blocked**. Targeted rerun: **all 5 passed**. Overall: **all 38 scripts were successfully exercised**; this does not mean one initial uninterrupted run was green.

| Test script | Final result | Run note |
| --- | --- | --- |
| `engine/ai-engine.cjs` | Pass | Initial run |
| `engine/audit-engine.cjs` | Pass | Initial run |
| `engine/builders-engine.cjs` | Pass | Initial run |
| `engine/chest-engine.cjs` | Pass | Initial run |
| `engine/config.cjs` | Pass | Initial run |
| `engine/gguf-engine.cjs` | Pass | Initial run |
| `engine/launcher.cjs` | Pass | Rerun with loopback access |
| `engine/lmstudio-engine.cjs` | Pass | Rerun with loopback access |
| `engine/local-engine.cjs` | Pass | Initial run |
| `engine/material-tokens.cjs` | Pass | Initial run |
| `engine/mra-engine.cjs` | Pass | Initial run |
| `engine/release.cjs` | Pass | Initial run; build/release output stayed in temporary copy |
| `engine/settings-unified.cjs` | Pass | Initial run |
| `engine/storage-migration.cjs` | Pass | Initial run |
| `engine/terminology.cjs` | Pass | Initial run |
| `engine/vault.cjs` | Pass | Initial run |
| `ui/ai-ui.cjs` | Pass | Initial run |
| `ui/audit-ui.cjs` | Pass | Initial run |
| `ui/builders-ui.cjs` | Pass | Initial run |
| `ui/chest-macros.cjs` | Pass | Initial run |
| `ui/chest-ui.cjs` | Pass | Rerun with temporary screenshot destination |
| `ui/config-ui.cjs` | Pass | Initial run |
| `ui/dictation-ui.cjs` | Pass | Initial run |
| `ui/features-ui.cjs` | Pass | Initial run |
| `ui/fonts-ui.cjs` | Pass | Initial run |
| `ui/gguf-ui.cjs` | Pass | Initial run |
| `ui/isolation-ui.cjs` | Pass | Initial run |
| `ui/launcher-ui.cjs` | Pass | Rerun with loopback access |
| `ui/lmstudio-ui.cjs` | Pass | Initial run |
| `ui/local-ui.cjs` | Pass | Initial run |
| `ui/mra-ui.cjs` | Pass | Rerun with temporary screenshot destination |
| `ui/report-editor.cjs` | Pass | Initial run |
| `ui/settings-ui.cjs` | Pass | Initial run |
| `ui/sidebar-ui.cjs` | Pass | Initial run |
| `ui/templates.cjs` | Pass | Initial run |
| `ui/terminology-ui.cjs` | Pass | Initial run |
| `ui/undo.cjs` | Pass | Initial run |
| `ui/word-macros.cjs` | Pass | Initial run |

The first two launcher engine failures were `connect EACCES` on temporary loopback ports; the launcher UI failure was `ERR_NETWORK_ACCESS_DENIED`. Chest/MRA UI tests reached their screenshot calls and failed with `EPERM` writing `C:\tmp\radnote-*-mobile.png`. Those were environment constraints, not demonstrated application defects.

The rerun used another isolated copy with loopback access. Only the two copied test files' screenshot destinations were redirected into that temporary copy. Application files and test assertions were unchanged. This also avoided overwriting any existing fixed-path screenshots outside the project.

Environment: Windows, Node **v26.13.0**, Chromium **153.0.8010.12**, project-pinned `@playwright/test` **1.63.0**.

## Additional reproduction evidence

The probes below were separate from the existing suite and did not add permanent test files. Browser tests used new contexts and synthetic reports; the worker-reload probe intentionally allowed the actual local worker script to install via an intercepted HTTPS origin. Other focused UI probes blocked service workers to isolate their behavior.

### A01 — Cross-section staleness

Procedure: configure a synthetic compatible provider; fill findings A and impression A; return a revision of the impression; edit only findings to B; inspect both provenance labels; apply the impression suggestion while counting confirmation dialogs.

Observed:

```text
cardState:   "Erstellt <time>"
notesState:  "Veraltet: Der Befund wurde nach Erstellung dieses Ergebnisses geändert."
confirmations: 0
applied: "Synthetic revised impression based on A."
page errors: []
```

### A02 — Delayed service-worker installation

Procedure: intercept `coi-sw.js` with a deferred response, load a fresh HTTPS page, type before releasing the response, and wait for `crossOriginIsolated === true`.

Observed:

```text
initial provider: "none"
initial draft-saving checkbox: false
initial findings: "SYNTHETIC UNSAVED DRAFT"
worker-script requests observed: 1
findings after isolation/reload: ""
```

The worker processes the reload navigation, so ordinary page-route navigation counters alone are not a reliable assertion for this scenario. The probe checked the resulting isolation state and field contents.

### A03 — GGUF lifecycle

The existing `createRunner({ importer })` injection point supplied a fake runtime whose `loadModel()` waited on a manually released promise. Files A and B had distinct names and synthetic contents. No real GGUF model or runtime download was needed to test ownership/cancellation.

| Operation while A is loading | Request outcome | Loaded afterward | Runtime exits | Additional observation |
| --- | --- | --- | --- | --- |
| Abort signal | `AbortError` | `true` | 0 | Loaded instance retained |
| `runner.stop()` | Returns A result | `true` | 0 | One generation still occurs |
| `runner.setFile(B)` | Returns A result | `true` | 0 before cleanup | Selected file is B; a second request still returns A; total loads remain 1 |

Each probe explicitly stopped its runner during cleanup.

### A04 — Forget during real encryption

Minimal reproduction shape, using an in-memory storage adapter and the real crypto implementation:

```javascript
await vault.save({ synthetic: 1 }, 'synthetic-password-123');
const pending = vault.save({ synthetic: 2 });
vault.forget();
// exists === false, unlocked === false
await pending;
// exists === true, unlocked === false
```

The reappearing value is an encrypted vault envelope. The probe does not demonstrate plaintext key storage.

### A05 — Template count limit

Procedure: seed 100 valid synthetic templates into a fresh browser context, reload, create template 101 through the normal dialog, then reload again.

```text
Before reload:
  visible templates: 101
  saved templates:   101
  validTemplates():  false
After reload:
  visible templates: 0
  saved templates:   101
```

Control case: attempts to add field 31 through the ordinary Add field button stopped at 30; that separate limit was enforced and was not reported as a defect.

### A06 — Legacy import truncation

Procedure: call `BefundSettings.parse()` with a valid synthetic Report Studio plaintext-v1 payload containing 101 named templates; separately call `splitTemplateBody()` with 31 headings and distinct text below each heading.

```text
Input templates: 101; returned templates: 100; no exception.
Input fields:     31; returned fields:     30; no exception.
```

### A07 — Macro double-click

Procedure: focus empty findings and use Playwright's native `dblclick()` on the first macro button, the default `re` word expansion.

```text
macro: "re · LeertasteRechts (Wortersetzung)rechts"
findings afterward: "rechtsrechts"
macro edit dialog open: true
```

### A08 — Inline diff whitespace

Procedure: revise `Synthetic line one.\nSynthetic line two.` into a version with a blank paragraph and revised second line. Inspect the inline diff's computed styles and rendered text.

```text
whiteSpace:   "normal"
overflowWrap: "normal"
textContent:  "Synthetic line one.\n\n\nSynthetic line two revised."
innerText:    "Synthetic line one. Synthetic line two revised."
```

The diff's text content includes both deleted and inserted whitespace, hence three newline characters in this example. The relevant failure is that the rendered view collapses them.

### A09 — Model-list request race

Procedure: delay LM Studio's intercepted `/v1/models` response; switch to `compatible`; enter a new synthetic endpoint while leaving its model blank; release the old list response.

```text
active provider: "compatible"
active endpoint: "https://new-synthetic.invalid/v1/chat/completions"
selected model:  "synthetic-old-lm-model"
```

This probe sends no report to either endpoint.

## Additional checks supporting recommendations

**Parser bounds:** A response with seven issues, each having a 301-character detail, seven change summaries, and a 20,001-character revised section was accepted by `AiContract.parse()`. This exceeds limits expressed by `responseSchema()`. The probe did not attempt an enormous allocation or crash the UI.

**Keyboard tabs:** With General focused in the settings tablist, ArrowRight left both focus and selection on General. General, AI, and Configuration file all had `tabIndex === 0`; none had `aria-controls`. This is specific keyboard/association evidence, not a complete accessibility assessment.

**Asset integrity:** All **16 of 16** entries across `licenses/SOURCES.json`'s `bundled` and `files` arrays matched their recorded SHA-256 hashes byte-for-byte. No newline normalization was needed. This verifies the checked-in artifacts against the checked-in inventory; it does not independently authenticate current upstream licenses.

**Versions:** `VERSION`, `package.json`, and `package-lock.json` all reported `0.1.0`. The existing release and terminology UI checks verified the HTML meta tag and visible version badge as well.

**Clinical safeguards:** Existing clinical engine/UI regressions passed, including limited-assessment behavior, conflicting normal statements, historical/current findings, explicit runoff handling, preview preservation, frozen text, and undo. No new clinical-rule defect was established by this audit. That result is limited to the reviewed code and tested cases.

## Remaining validation work

- Turn the nine reproduced cases into focused regression tests when implementing their fixes; the audit itself intentionally did not modify the suite.
- Exercise actual wllama/ONNX/MLC cancellation, resource disposal, and model swaps with synthetic prompts on supported hardware after the lifecycle fixes.
- Add Firefox/WebKit and keyboard/screen-reader checks without replacing the current fast engine coverage.
- Run a separately authorized, current dependency/runtime security review if release readiness requires it. This audit did not query a fresh vulnerability database or make a “zero known vulnerabilities” claim.
- Keep independent clinical validation separate from software correctness checks.
