# Task 4: Optional Interactive Story Images

## Scope

- Added `InteractiveStoryPlugin._maybeGenerateChapterImage(chapter, config)`.
- Routed all six chapter generation branches through it: first, automatic next, automatic final, explicit final, admin next, and admin final. Manual advance already delegates to the automatic next path.
- Image generation is default-off through the existing config, respects `textOnlyMode`, returns `imagePath: null` when disabled or unavailable, and emits `story:image-generation-failed` on provider errors without rejecting the chapter flow.

## TDD evidence

The new `image-generation-optional.test.js` was run before implementation and failed because the helper and call-site delegation did not exist. It now covers disabled mode, text-only mode, provider rejection, successful paths, and all six delegations.

## Verification

- `runtime/node/node.exe node_modules/jest/bin/jest.js plugins/interactive-story/test/image-generation-optional.test.js plugins/interactive-story/test/interactive-story-api-key.test.js test/interactive-story-local-preview.test.js --runInBand`
  - 3 suites passed, 21 tests passed.
- `runtime/node/node.exe --check plugins/interactive-story/main.js`
  - passed.
- `npm run lint -- --quiet`
  - passed.
- `git diff --check`
  - passed; pre-existing generated documentation files remain unmodified by this task.