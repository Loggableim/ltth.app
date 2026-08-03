# Task 3 review fix 3 report

## Scope

Added real SQLite persistence for the narration metadata that prepared Interactive Story chapters already carry:

- additive `story_chapters` migration for `narration_segments` and `tts_text`;
- safe serialization in `saveChapter`;
- safe hydration in `getChapter` and `getSessionChapters`.

Existing databases are preserved: initialization inspects the current table with `PRAGMA table_info` and uses only additive `ALTER TABLE ... ADD COLUMN` operations. Missing or malformed narration segments hydrate as an empty array; absent TTS text hydrates as `null`.

## Regression coverage and TDD

Added `app/plugins/interactive-story/test/story-database-narration-persistence.test.js`.

The regression creates a legacy `story_chapters` table without the two metadata columns, initializes `StoryDatabase`, saves a prepared chapter, closes the SQLite database, reopens it, and proves both `narrationSegments` and `ttsText` survive read-back. It initially failed because the returned chapter did not contain either metadata field, then passed after the additive migration and persistence/hydration change.

## Verification

From `app/` with the bundled Node 22 runtime:

```text
node_modules/jest/bin/jest.js --runTestsByPath plugins/interactive-story/test/story-database-narration-persistence.test.js --runInBand --silent
1 suite passed, 1 test passed

node_modules/jest/bin/jest.js --runTestsByPath <all Interactive Story tests> test/database-startup-integrity-policy.test.js --runInBand --silent
12 suites passed, 102 tests passed

node_modules/.bin/eslint.cmd plugins/interactive-story/backend/database.js plugins/interactive-story/test/story-database-narration-persistence.test.js
exit 0

git diff --check
exit 0 (only pre-existing CRLF warnings for unrelated generated documentation files)
```