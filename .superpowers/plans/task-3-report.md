# Task 3 Report: Clear Egg Shelf and Context Guidance

- Added accessible card metadata for sanitized owner, localized element, explicit ownership/offer state, queue position, and a separate large timer.
- Reserved offers identify their reserved viewer; only public and rescue offers publish `!adopt`. Ready owned eggs publish `!hatch` and their rot deadline.
- Added a pure next-action selector with priority `public/rescue adopt` then `ready hatch`; snapshot, immediate delta, and buffered reconnect paths refresh the hint so invalid stale commands are removed.
- Preserved keyed cards and landing behavior; no changes were made to persistence, GCCE ingress, auto-hatch, gift ownership, main, live runtime, or GitHub.

Verification:

- Bundled Node 22.14.0 / ABI 127: 8 focused suites, 87 tests passed.
- JavaScript syntax checks, changed-file ESLint, locale JSON/key validation, and `git diff --check` passed.
