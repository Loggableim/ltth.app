# Task 3 review fix 2 report

## Scope

Fixed Interactive Story chapter persistence ordering in all six flows that call `db.saveChapter`:

- automatic next and final chapters;
- initial chapter creation;
- HTTP next/final chapter generation;
- offline admin-choice next/final generation.

Each flow now creates a narration-prepared copy before persistence. The copy keeps clean display content and validated `narrationSegments` plus `ttsText` for downstream playback, while leaving the generated chapter object untouched.

## Regression coverage

Added `app/plugins/interactive-story/test/narration-persistence.test.js` as an integration regression for the automatic next-chapter flow. It snapshots the chapter at the database boundary and verifies that:

- saved content has no Fish cue markers;
- saved narration metadata and TTS cue text remain available;
- emitted chapter content is clean;
- system TTS receives the cue-bearing narration text;
- the original generated chapter was not mutated.

## TDD evidence

The new regression initially failed because `saveChapter` received `(happy) The gate opens. [shouting] Run now!`. After moving narration preparation before persistence, it passed.

## Verification

From `app/`:

```text
node_modules/.bin/jest.cmd --runTestsByPath .../narration-persistence.test.js --runInBand --silent
1 suite passed, 1 test passed

node_modules/.bin/jest.cmd --runTestsByPath <all Interactive Story test files> --runInBand --silent
10 suites passed, 99 tests passed

node_modules/.bin/eslint.cmd plugins/interactive-story/main.js plugins/interactive-story/test/narration-persistence.test.js
exit 0

git diff --check -- app/plugins/interactive-story/main.js app/plugins/interactive-story/test/narration-persistence.test.js
exit 0
```