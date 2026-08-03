# Task 8 Fix Report - Story Studio

## Fixes

- Set `#startStoryBtn` to `type="button"`. Moving the existing start controls into the Story Studio configuration form can no longer trigger the configuration form submission.
- Preserve an existing `openRouterApiKey` when a configuration save does not include that field. The Studio intentionally omits credentials; the existing GET route continues to mask configured keys.

## TDD evidence

- Red: focused tests failed before implementation because the moved start button defaulted to `submit`, and a key-less OpenRouter save removed the stored key.
- Green: both regression tests passed after the minimal fixes.

## Verification

- `node node_modules/jest/bin/jest.js test/interactive-story-ui-i18n.test.js plugins/interactive-story/test/ui-toggle.test.js plugins/interactive-story/test/interactive-story-api-key.test.js --runInBand`
  - 3 suites passed, 38 tests passed.
- `git diff --check -- app/plugins/interactive-story/ui.html app/plugins/interactive-story/main.js app/plugins/interactive-story/test/ui-toggle.test.js app/plugins/interactive-story/test/interactive-story-api-key.test.js task-8-fix-report.md`
  - passed.

## Scope

Only Interactive Story UI/config handling, its focused tests, and this report were changed. Existing generated documentation and root-checkout changes were left untouched.