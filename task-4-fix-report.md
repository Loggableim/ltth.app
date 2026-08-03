# Task 4 review fix report

## Scope

Fixed only the `story:regenerate-image` socket path for optional Interactive Story images.

- Regeneration now delegates to `_maybeGenerateChapterImage` with its optional custom prompt.
- Disabled image generation or an unavailable provider leaves the current chapter image unchanged.
- Provider failures use the shared non-blocking fallback and emit `story:image-generation-failed`.
- Model selection is shared with normal chapter generation: OpenAI uses `openaiImageModel`; other providers use `defaultImageModel`.

## TDD evidence

Before the production change, the new socket regression cases failed as expected:

- provider rejection did not emit `story:image-generation-failed`;
- OpenAI regeneration passed `defaultImageModel` (`sdxl`) instead of `openaiImageModel` (`gpt-image-1`).

After routing the socket through the helper, all regressions pass.

## Verification

- `node app/node_modules/jest/bin/jest.js plugins/interactive-story/test/image-generation-optional.test.js --runInBand` — 1 suite, 8 tests passed.
- `node app/node_modules/jest/bin/jest.js plugins/interactive-story/test/image-generation-optional.test.js plugins/interactive-story/test/interactive-story-api-key.test.js test/interactive-story-local-preview.test.js --runInBand` — 3 suites, 24 tests passed.
- `node --check app/plugins/interactive-story/main.js` — passed.
- `git diff --check` — passed (only pre-existing CRLF conversion warnings in the dirty worktree).