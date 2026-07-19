# Task 5C Report: DE/EN/ES/FR show localization and runtime status

Commit: this scoped Task 5C commit

## Implemented

- Normalized all four WebGPU Fireworks locale documents to the canonical `plugins.webgpu-fireworks` namespace consumed by the runtime loader.
- Reworked `scripts/repair-webgpu-fireworks-i18n.js` into an import-safe, root-injectable, byte-idempotent repairer that preserves the canonical namespace.
- Added key-parity translations for all nine built-in show titles and descriptions in German, English, Spanish, and French.
- Added complete selector, Superfan, Designer lifecycle, preview lifecycle, structured Show API, runtime, phase, and queue status key groups.
- Added the matching nine translated finale titles and selector group labels to all four Goals locales.
- Marked the five new static built-in options, Superfan controls, and Show Designer navigation fallback with locale keys.
- Extended the shared safe selector helper to localize built-in titles by ID while keeping Custom metadata names as unmodified user text.
- Added conflict-free Settings runtime formatting for localized active show, fixed duration, actual V2 phase, and queue count.
- Kept unknown phases readable and safe, without changing the renderer, ShowPlanV2 engine, repository, Show API controller, or Designer mechanics.

## TDD evidence

- The unchanged baseline failed `webgpu-fireworks-i18n.test.js` and the premium-sync locale fixture because locale documents had no `plugins.webgpu-fireworks` namespace.
- Strengthened tests failed for the missing canonical loader contract, nine-show parity, future UI/API keys, repair export/idempotence, localized built-in options, and runtime status formatter.
- The first GREEN pass exposed two genuine legacy English values (`save_settings` and the shape-selection help text); the repairer now restores the established DE/ES/FR editorial translations.
- Existing Settings and Superfan fixture tests were migrated to the intentional canonical namespace, without weakening their exact localized-value assertions.

## Verification

- Focused i18n/Settings/Goals/Superfan/API/runtime matrix: 12 suites, 249 tests passed.
- Core canonical locale and status-helper matrix: 2 suites, 31 tests passed.
- Repair script byte-idempotence passed across WebGPU/Goals locales and Settings HTML.
- JavaScript syntax and all eight locale JSON parses passed.
- Focused ESLint passed with `--quiet`, including the root repair script.
- Scoped `git diff --check` passed.

## Known unrelated baseline

- `goals-ui-i18n.test.js` still has six pre-existing failures for general Goals shell localization (`connection.connected`, the Multigoal placeholder, and the broader `goals.ui` key set).
- Those assertions cover unrelated Goals UI restructuring rather than Task 5C finale selector labels. The focused Goals finale and selector suites pass.

## Scope safety

- No renderer choreography, `gpu/engine.js`, `gpu/show-plan-v2-runtime.js`, `main.js`, Show API controller, repository, Designer mechanics, version, restart, or push changes.
- Parallel untracked Designer tests and `app/node_modules.primary-junction/` were not touched or staged.
