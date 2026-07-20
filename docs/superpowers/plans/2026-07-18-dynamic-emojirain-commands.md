# Dynamic EmojiRain Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and follow test-driven development task by task.

**Goal:** Give Classic and WebGPU EmojiRain a shared, configurable command system with secure asset assignment, paid-subscriber/Teamlevel access, level-based counts, and per-command cooldowns.

**Architecture:** A shared CommonJS domain helper supplies defaults, strict/tolerant normalization, raw paid-subscriber detection, count calculation, and injectable-clock cooldowns. Each plugin owns atomic GCCE registration and its persistence adapter. One browser-side component renders the same safe editor in both UIs.

**Tech stack:** Node.js, CommonJS, Express plugin routes, GCCE, Jest, JSDOM, vanilla browser JavaScript.

## Global constraints

- Do not change GCCE or either renderer.
- Preserve unrelated worktree changes.
- Add production behavior only after a focused failing test proves the missing behavior.
- Register dedicated cooldown state only after a successful spawn.
- Reload only the active EmojiRain plugin after all static and automated verification passes.

### Task 1: Shared command domain

**Files:**

- Create `app/test/emoji-rain-animal-commands.test.js`.
- Create `app/modules/emoji-rain-animal-commands.js`.

- [ ] Add failing tests for missing-vs-empty migration, normalization, invalid/duplicate/reserved names, target validation, and the 50-row limit.
- [ ] Add failing tests for raw paid-subscriber detection that explicitly rejects GCCE's enriched `userData.isSubscriber` as evidence.
- [ ] Add failing tests for level 0, 1, 50, invalid, and negative count behavior.
- [ ] Add controlled-clock tests for paid 15s, Teamlevel 60s, global 15s, and independent command buckets.
- [ ] Implement the smallest shared helper that makes the domain suite pass.

Run:

```powershell
cd app
npm test -- --runInBand test/emoji-rain-animal-commands.test.js
```

### Task 2: Classic and WebGPU backend parity

**Files:**

- Modify `app/plugins/emoji-rain/main.js`.
- Modify `app/plugins/webgpu-emoji-rain/main.js`.
- Modify `app/modules/database.js`.
- Modify `app/plugins/webgpu-emoji-rain/lib/webgpu-config.js`.
- Modify both `plugins/*/test/chat-commands.test.js` suites.

- [ ] Replace hard-coded animal command expectations with failing tests for defaults, custom names, rename/delete/disable, emoji/image forwarding, raw subscriber access, optional Teamlevel access, level count, per-command cooldowns, and post-success recording.
- [ ] Add failing route/registration tests for successful atomic replacement, conflict rollback with HTTP 409, and pending persistence without GCCE.
- [ ] Wire both config normalizers to the shared helper while preserving explicit empty arrays.
- [ ] Replace hard-coded handlers with dynamic definitions and one generic handler per plugin.
- [ ] Add atomic preflight/replacement, rollback, pending startup retry, and response metadata.
- [ ] Run both focused command suites until green.

Run:

```powershell
cd app
npm test -- --runInBand plugins/emoji-rain/test/chat-commands.test.js plugins/webgpu-emoji-rain/test/chat-commands.test.js test/emoji-rain-animal-commands.test.js
```

### Task 3: Shared safe command editor and translations

**Files:**

- Create `app/public/js/emoji-rain-command-editor.js`.
- Create `app/test/emoji-rain-command-editor.test.js`.
- Modify both EmojiRain `ui.html` files and UI JavaScript files.
- Modify both plugins' `locales/{de,en,es,fr}.json` files.
- Extend the existing EmojiRain/WebGPU i18n contract tests.

- [ ] Add failing JSDOM tests for load/serialize, add/remove, asset type changes, gallery selection, upload results, HTTPS values, and inert rendering of hostile command/asset strings.
- [ ] Add failing locale-contract expectations for every new key in all four languages.
- [ ] Implement the shared editor using only safe DOM construction APIs.
- [ ] Integrate the component into both pages and connect existing gallery/upload endpoints.
- [ ] Replace the legacy Superfan-only checkbox with Teamlevel access and cooldown fields in seconds.
- [ ] Run the editor and i18n suites until green.

Run:

```powershell
cd app
npm test -- --runInBand test/emoji-rain-command-editor.test.js test/emoji-rain-runtime-i18n.test.js test/webgpu-emoji-rain-ui-i18n.test.js
```

### Task 4: Final verification and live-safe integration

- [ ] Run all focused command, domain, UI, and i18n suites.
- [ ] Run scoped syntax checks and ESLint for every changed JavaScript file.
- [ ] Run `npm run build:css` and `git diff --check`.
- [ ] Review the complete scoped diff and confirm no renderer or GCCE changes.
- [ ] Commit the isolated feature and integrate it into the active local branch without staging unrelated files.
- [ ] Identify the running server's checkout and enabled EmojiRain variant.
- [ ] Reload only the active EmojiRain plugin endpoint and verify config/registration/status without emitting a test spawn.

Expected final commands include:

```powershell
cd app
npm test -- --runInBand plugins/emoji-rain/test/chat-commands.test.js plugins/webgpu-emoji-rain/test/chat-commands.test.js test/emoji-rain-animal-commands.test.js test/emoji-rain-command-editor.test.js test/emoji-rain-runtime-i18n.test.js test/webgpu-emoji-rain-ui-i18n.test.js
npm run build:css
npm run lint -- --quiet
node --check modules/emoji-rain-animal-commands.js
node --check public/js/emoji-rain-command-editor.js
git diff --check
```

## Plan self-review

- The tasks cover every approved migration, validation, permission, count, cooldown, atomicity, pending-state, UI, translation, and live-rollout requirement.
- Classic and WebGPU use identical domain behavior while retaining their existing persistence and upload boundaries.
- GCCE and renderer code are explicitly out of scope.
