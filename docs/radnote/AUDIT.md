# Radnote audit — 16 October 2026

Scope: source and generated standalone application, based on v1.7.0 at commit `3943db1043e9caffb0444e257b6c6f5e4a65c768`. Corrections are included in patch release v1.7.1.

The existing test suite passed before changes. Additional adversarial cases reproduced the defects below. All seven finding groups have corrections and regression coverage. Severity reflects potential impact on generated reports, rather than a security CVSS score.

| ID | Severity | Reproduction and consequence | Correction |
| --- | --- | --- | --- |
| A01 | High | Select only “Eingeschränkt beurteilbar” for esophagram reflux or skeletal degeneration. The report invented observed reflux or degenerative changes, with no supporting selection and no validation error. | Positive text requires documented diagnostic attributes. Limited assessment alone produces only its limitation. Incomplete abnormal selections are blocked from transfer. |
| A02 | High | Start with a normal head CT preset, select Stroke, then document hemorrhagic transformation. The impression included both the hemorrhagic finding and “Keine intrakranielle Blutung.” | The impression uses the bleeding-negative record only when it survives the same clinical checks used for the findings text. |
| A03 | High | Mark a hemorrhage category resolved while retaining a lesion's shift/herniation details. The main finding became historical, but a current midline shift could remain. An individual course could also be lost for derived herniation text. Historical shifts or obstruction could conflict with current observations. | Resolve inherited lesion courses before generation; propagate the lesion course to derived findings; distinguish historical and current observations in shift and passage checks. Explicit individual courses take precedence. |
| A04 | High | Combine normal postoperative passage with a stenosis and passage stop. The report could describe both normal passage and obstruction. | Suppress the contradictory normal statement and block transfer until current observations are reconciled. A resolved historical obstruction does not block an explicitly documented normal current passage. |
| A05 | High | Document calf artery occlusions with distal reconstitution but leave distal runoff unspecified. The summary inferred a runoff vessel count. Conflicting explicit runoff observations were not rejected. | Count only explicit, consistent patent/absent distal runoff observations for all three named calf vessels. Occlusion alone, reduced runoff, and unassessable runoff do not establish a count. Conflicting observations require reconciliation. |
| A06 | Medium | Enter vessel-level runoff under Normal, then change the vessel to Pathological. The value remained stored but became hidden and disappeared from the report. | Keep vessel-level measurements/runoff accessible in both states; retain the observation in the findings and include relevant abnormal runoff in the impression. |
| A07 | Low | Call MRA generation with null or malformed findings, including null lesion entries. Validation read unsanitized input and threw an exception. | Sanitize the input before validation as well as generation. This hardens the module boundary; a normal UI action was not shown to trigger this exception. |

Implementation is in `builders/generator.js`, the three examination generators, `builders/validation.js`, `mra/engine.js`, and `mra/ui.js`. `index.html` is rebuilt from the sources. No runtime dependency, configuration format, or storage schema was added.

## Verification

Final result: the complete suite exited successfully after the corrections, all 27 embedded scripts parsed, and `git diff --check` passed. The standalone audited HTML has SHA-256 `ab7023e4efaa8516667360d4bd898485186aff1af2cb7e69201e8f0a7e5506f9`.

Run the complete suite with:

```sh
RADNOTE_CHROMIUM_PATH=/usr/bin/chromium npm test
npm audit --json
git diff --check
```

- The rule/model suites include 43 shared-builder checks, 43 chest checks, 20 MRA checks, and 14 new audit checks: **120 named checks**, plus configuration validation tests. The audit checks include a matrix of ordinary categories across three report styles, ensuring limited assessment alone never produces a positive finding.
- Ten browser suites cover editor functions, macros, templates, undo, all five builders, configuration round trips, frozen-text protection, manual-preview protection, report transfer, persistence, and responsive dark mode.
- New browser checks reproduce corrected clinical text through the actual controls, preserve runoff through status changes, restore frozen drafts, verify storage opt-out and blocked-storage behavior, and import HTML-like text without executing it. The exercised local application made no external requests.
- `npm audit` reported **0 known dependency vulnerabilities** on the audit date. There are no application runtime package dependencies; Playwright is used for tests.
- Verification environment: Node 24.19.0, npm 11.9.0, Chromium 151.0.7922.173, Linux. Browser tests exercise the built local HTML using an intercepted test origin.

The pre-change passing suite is recorded in `/workspace/radnote-audit/radnote-audit-baseline.log`; the final run is recorded in `/workspace/radnote-audit/radnote-audit-final.log`. The dependency result is in `/workspace/radnote-audit/radnote-audit-dependencies.json`. These are workspace verification logs, not shipped application files. The standalone corrected artifact is `/workspace/radiology-editor-audited.html`.

## Practical limits and follow-up

- This is a software and report-rule audit, not independent clinical validation. A radiologist-reviewed reference set should cover each examination, including mixed current/historical findings and postoperative anatomy.
- Chromium was exercised. Safari, Firefox, actual iOS/Android devices, screen-reader behavior, and a formal accessibility conformance assessment remain outside this run.
- Persisted drafts use browser-local storage and include report text. They are not encrypted by the application and remain available to the same browser profile. Storage failure is surfaced; this audit does not assess a clinical institution's device or access-control policy.
- Copying or manually editing text is not a complete clinical consistency check. Structured validation cannot establish the correctness of arbitrary free text or independently verify images.
- Patch release v1.7.1 includes the corrections and updates the GitHub Pages editor. The existing v1.7.0 tag remains the historical pre-audit release.
