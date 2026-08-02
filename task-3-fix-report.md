# Task 3 review fix report

## Scope

Fixed the Interactive Story final-chapter narration metadata path only.

- Final-chapter prompts now request optional `NARRATION_SEGMENTS` JSON using the same supported-cue contract as normal chapters.
- Final-chapter parsing stops visible content before `NARRATION_SEGMENTS`, parses valid metadata into `chapter.narrationSegments`, and preserves clean content with an empty metadata list when the block is missing or malformed.
- Added a direct StoryEngine regression suite covering prompt output, valid metadata extraction/redaction, and absent or malformed metadata fallback.

## TDD evidence

The new focused regression suite was run before the implementation and failed as expected in all three cases:

1. The final prompt did not request or show narration metadata.
2. Valid narration JSON remained in `chapter.content`.
3. Final chapters did not expose `narrationSegments` when metadata was absent.

After the minimal implementation, the same suite passed.

## Verification

Commands run from `app/`:
```text
node_modules/.bin/jest.cmd plugins/interactive-story/test/story-engine-final-narration.test.js --runInBand --silent
3 tests passed

node_modules/.bin/jest.cmd plugins/interactive-story/test --runInBand --silent
9 suites passed, 98 tests passed

node_modules/.bin/eslint.cmd plugins/interactive-story/engines/story-engine.js plugins/interactive-story/test/story-engine-final-narration.test.js
exit 0
```
