# Interactive Story 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one coordinated Interactive Story upgrade with Ollama Cloud defaults, optional images, Fish.audio emotion-aware narration, normalized drag-and-drop overlay layout, random-role pen-and-paper participation, and a simpler Story Studio GUI.

**Architecture:** Keep `app/plugins/interactive-story/main.js` as the lifecycle/orchestration boundary while adding focused modules for narration, normalized layout, and pen-and-paper participant state. Extend the existing LTTH TTS request contract additively so Interactive Story can select Fish model/emotion behavior without changing unrelated callers. Preserve existing routes, event names, config migrations, and UI IDs while adding new D&D/layout fields and events.

**Tech Stack:** CommonJS Node.js, Express/plugin route contracts, Socket.IO, better-sqlite3 through the existing database wrapper, static HTML/CSS/JavaScript, Jest, bundled runtime at `runtime/node/node.exe`, ESLint, and the existing browser preview workflow.

## Global Constraints

- Read/write only the scoped Interactive Story, TTS, locale, test, and active documentation files listed below; preserve unrelated dirty-worktree files.
- Use prepared statements through the existing database wrapper and `api.getPluginDataDir()` for persistent plugin data.
- Central API keys are read from the settings database and never written into plugin directories or returned in clear text.
- Image generation is optional and must never block text generation, narration, voting, or story memory.
- Public Quick Tunnel/render-only mode must not receive any overlay write path.
- Write the failing test first, run it, implement the smallest passing change, rerun the focused test, then refactor while green.
- Use the bundled Node runtime for Jest commands and run `npm run lint`, `npm run build:css`, and `git diff --check` before completion.

---

### Task 1: Establish provider/configuration contracts and central Ollama key resolution

**Files:**
- Modify: `app/plugins/interactive-story/main.js:230-480,1110-1215,1287-1355,1780-1975`
- Modify: `app/plugins/interactive-story/ui.html:3500-3700,5980-6060,7180-7600`
- Modify: `app/plugins/interactive-story/locales/de.json`
- Modify: `app/plugins/interactive-story/locales/en.json`
- Modify: `app/plugins/interactive-story/locales/es.json`
- Modify: `app/plugins/interactive-story/locales/fr.json`
- Create: `app/plugins/interactive-story/test/provider-config.test.js`
- Modify: `app/plugins/interactive-story/test/interactive-story-api-key.test.js`

**Interfaces:**
- Produce `InteractiveStoryPlugin._getOllamaApiKey(): string|null` with priority `ollama_cloud_api_key`, `ollama_api_key`, `tts_ollama_api_key`.
- Produce defaults `llmProvider: 'ollama'`, `ollamaBaseUrl: 'https://api.ollama.com/v1'`, `ollamaModel: 'qwen3.5:cloud'`, `autoGenerateImages: false`, `ttsEngine: 'fishaudio'`, `fishaudioModel: 's2.1-pro'`, `narrationEmotionMode: 'auto'`, `storyMode: 'classic'`, `dndJoinKeyword: '!join'`, `dndInactivityLimitRounds: 2`, and `overlayLayoutVersion: 2`.
- Consume central settings in provider initialization and `/api/interactive-story/validate-api-key`; return only masked/configured state.

- [ ] **Step 1: Write the failing tests.** Add tests that instantiate the plugin with a mocked database and assert central-key priority, fallback across the three keys, no key returned in safe config, missing-key status for cloud Ollama, and exact new defaults when no saved config exists. Add a regression asserting a saved legacy `llmProvider`, `ttsEngine`, and `autoGenerateImages` value remains unchanged.

- [ ] **Step 2: Run the focused tests to verify failure.**

Run from `app`:

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js plugins/interactive-story/test/provider-config.test.js plugins/interactive-story/test/interactive-story-api-key.test.js --runInBand
```

Expected: FAIL because `_getOllamaApiKey` and the new default/masking contract are not implemented.

- [ ] **Step 3: Implement the minimal configuration change.** Add the resolver using `db.getSetting`, update `_initializeLLMService` and validation to call it, merge defaults without overwriting saved fields, and remove the editable secret from the primary UI flow while retaining a masked central-settings explanation. Keep legacy plugin-config key migration read-only.

- [ ] **Step 4: Run the focused tests and inspect the response contract.**

Run the same Jest command. Expected: PASS, with config/status JSON containing no clear API key. Manually inspect the route mock payload for `provider: 'Ollama'` and `apiKeyConfigured`.

- [ ] **Step 5: Commit the scoped configuration slice.**

```powershell
git add -- app/plugins/interactive-story/main.js app/plugins/interactive-story/ui.html app/plugins/interactive-story/locales app/plugins/interactive-story/test/provider-config.test.js app/plugins/interactive-story/test/interactive-story-api-key.test.js
git commit -m "feat: make interactive story ollama-cloud first"
```

### Task 2: Add Fish.audio model/emotion request forwarding without regressing other TTS engines

**Files:**
- Modify: `app/plugins/tts/main.js:2220-2260,3110-3525`
- Modify: `app/plugins/tts/utils/request-overrides.js:1-40`
- Modify: `app/plugins/tts/engines/fishspeech-engine.js:1050-1145,1200-1280,1320-1380,1610-1635`
- Modify: `app/test/tts-request-overrides.test.js`
- Create: `app/test/tts-fish-emotion-model.test.js`

**Interfaces:**
- Extend `/api/tts/speak` input with optional `model`, `emotion`, `streaming`, `pitch`, `synthesisVolume`, and preserve existing fields.
- `resolveTtsRequestOverrides` returns `model: string|null` and existing clamped fields.
- Fish synthesis uses `options.model || this.model`; `s2`, `s2.1`, and `s2.1-pro*` use `[cue]`, while `s1` uses `(cue)`.

- [ ] **Step 1: Write failing tests.** Assert the request override preserves a model and emotion, non-Fish synthesis does not receive Fish-only model markers, Fish S1 prepends `(scared)` and S2.1 prepends `[scared]`, existing text markers are not duplicated, and a default/neutral emotion adds no marker.

- [ ] **Step 2: Run the tests to verify failure.**

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js test/tts-request-overrides.test.js test/tts-fish-emotion-model.test.js --runInBand
```

Expected: FAIL because model forwarding and syntax selection are absent or fixed to S1 parentheses.

- [ ] **Step 3: Implement additive TTS forwarding.** Destructure the new request fields in the speak route, pass them through `resolveTtsRequestOverrides`, include the effective model in Fish synthesis options, and centralize marker formatting in a small Fish-engine helper. Do not change the global default engine or non-Fish payloads.

- [ ] **Step 4: Run focused TTS tests and existing Fish regressions.**

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js test/tts-request-overrides.test.js test/tts-fish-emotion-model.test.js test/tts-fish-asr-client.test.js test/tts-live-performance.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit the TTS contract slice.**

```powershell
git add -- app/plugins/tts/main.js app/plugins/tts/utils/request-overrides.js app/plugins/tts/engines/fishspeech-engine.js app/test/tts-request-overrides.test.js app/test/tts-fish-emotion-model.test.js
git commit -m "feat: forward fish audio emotion model controls"
```

### Task 3: Build the narration director and wire clean display text to story TTS

**Files:**
- Create: `app/plugins/interactive-story/utils/narration-director.js`
- Modify: `app/plugins/interactive-story/engines/story-engine.js:224-552`
- Modify: `app/plugins/interactive-story/main.js:495-815,1234-1255`
- Create: `app/plugins/interactive-story/test/narration-director.test.js`
- Modify: `app/plugins/interactive-story/test/model-selection.test.js`

**Interfaces:**
- `NarrationDirector({ model, mode, logger }).prepareChapter(chapter, { theme, language }): { displayText, segments, ttsText }`.
- `NarrationDirector.stripMarkers(text): string` and `NarrationDirector.renderMarker(emotion, delivery, model): string` are pure helpers.
- Chapter objects retain `content`/`choices` and may add `narrationSegments` and `ttsText`.

- [ ] **Step 1: Write failing unit tests.** Cover validated segment metadata, deterministic fallback emotion for tense/fantasy sentences, S1/S2 syntax, marker stripping, unsupported cue removal, one primary cue per sentence, and a chapter with no metadata remaining display-identical.

- [ ] **Step 2: Run the test to verify failure.**

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js plugins/interactive-story/test/narration-director.test.js --runInBand
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the director.** Parse optional validated `narrationSegments`; otherwise split sentences and use bounded genre/action heuristics. Drop unknown cues, render syntax according to `fishaudioModel`, and return clean display text separately from marked TTS text.

- [ ] **Step 4: Integrate the director into chapter creation and playback.** Prepare chapters immediately before saving/emitting, pass `ttsText` to `_speakThroughSystemTTS`, pass model/emotion data to `/api/tts/speak`, and ensure `_prepareChapterForEmit` never exposes markers. Keep TTS failures non-fatal.

- [ ] **Step 5: Run narration and existing story suites.**

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js plugins/interactive-story/test/narration-director.test.js plugins/interactive-story/test/story-memory.test.js plugins/interactive-story/test/llm-service.test.js plugins/interactive-story/test/model-selection.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit the narration slice.**

```powershell
git add -- app/plugins/interactive-story/utils/narration-director.js app/plugins/interactive-story/engines/story-engine.js app/plugins/interactive-story/main.js app/plugins/interactive-story/test/narration-director.test.js app/plugins/interactive-story/test/model-selection.test.js
git commit -m "feat: add emotion-aware interactive story narration"
```

### Task 4: Make image generation optional and non-blocking on every chapter path

**Files:**
- Modify: `app/plugins/interactive-story/main.js:1400-1660,2010-2150`
- Create: `app/plugins/interactive-story/test/image-generation-optional.test.js`
- Modify: `app/test/interactive-story-api-key.test.js`

**Interfaces:**
- Add `InteractiveStoryPlugin._maybeGenerateChapterImage(chapter, config): Promise<Object>`.
- The helper returns a chapter with `imagePath: null` when images are disabled/unavailable and emits the existing failure event on provider errors.

- [ ] **Step 1: Write failing tests.** Assert disabled images do not call `generateImage`, `textOnlyMode` suppresses calls, provider rejection still returns a chapter and emits `story:image-generation-failed`, and enabled success stores the generated path. Exercise first, next, final, admin-choice, and manual-advance call sites through the helper spy.

- [ ] **Step 2: Run the test to verify failure.**

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js plugins/interactive-story/test/image-generation-optional.test.js --runInBand
```

Expected: FAIL because generation remains duplicated in multiple routes and the shared helper does not exist.

- [ ] **Step 3: Implement one guarded helper and replace duplicated branches.** Preserve provider/model/style selection, catch errors, set `imagePath` to null, and allow chapter/TTS/voting flow to continue. Do not alter image cache security checks.

- [ ] **Step 4: Run focused image/story tests.**

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js plugins/interactive-story/test/image-generation-optional.test.js plugins/interactive-story/test/interactive-story-api-key.test.js test/interactive-story-local-preview.test.js --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit the optional-image slice.**

```powershell
git add -- app/plugins/interactive-story/main.js app/plugins/interactive-story/test/image-generation-optional.test.js app/test/interactive-story-api-key.test.js
git commit -m "feat: make story image generation optional"
```

### Task 5: Add normalized overlay layout validation and responsive drag editing

**Files:**
- Create: `app/plugins/interactive-story/utils/overlay-layout.js`
- Modify: `app/plugins/interactive-story/main.js:1359-1385`
- Modify: `app/plugins/interactive-story/overlay.html:740-1145,1710-1735`
- Modify: `app/plugins/interactive-story/ui.html:6500-6660`
- Create: `app/plugins/interactive-story/test/overlay-layout.test.js`
- Modify: `app/test/interactive-story-local-preview.test.js`
- Modify: `app/test/interactive-story-preview-loading.test.js`

**Interfaces:**
- `normalizeLayout(payload, viewport): { version: 2, positions: Record<string,{x:number,y:number}> }`.
- `migrateLegacyPixels(payload, viewport): normalized layout`.
- `applyLayout(elementMap, layout, viewport): void` and `resetLayout(): layout`.
- Server POST accepts only validated layout objects and rejects malformed/out-of-range coordinates with 400.

- [ ] **Step 1: Write failing unit and source-contract tests.** Cover pixel-to-normalized migration, clamping, missing/unknown element handling, reset, six draggable IDs (`title`, `content`, `voting`, `generating`, `results`, `participants`), Pointer Events, edit-mode gating, and public render write blocking.

- [ ] **Step 2: Run the tests to verify failure.**

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js plugins/interactive-story/test/overlay-layout.test.js test/interactive-story-local-preview.test.js test/interactive-story-preview-loading.test.js --runInBand
```

Expected: FAIL because pixel storage, Ctrl-only mouse dragging, and partial element coverage do not satisfy the normalized editor contract.

- [ ] **Step 3: Implement the pure layout module and route validation.** Normalize/clamp on read and write, migrate legacy pixels once, preserve the local-only guard, and return a stable `{ version, positions }` object.

- [ ] **Step 4: Replace overlay drag handling.** Use Pointer Events with an explicit `edit=1` or admin-preview flag, normalized coordinates, optional grid snapping, visible edit banner, save/reset controls, and no listeners/write calls in public render mode. Keep default OBS display behavior unchanged.

- [ ] **Step 5: Run focused overlay tests and inspect the DOM source.** Expected: PASS, with no public-mode POST and all six elements covered.

- [ ] **Step 6: Commit the overlay slice.**

```powershell
git add -- app/plugins/interactive-story/utils/overlay-layout.js app/plugins/interactive-story/main.js app/plugins/interactive-story/overlay.html app/plugins/interactive-story/ui.html app/plugins/interactive-story/test/overlay-layout.test.js app/test/interactive-story-local-preview.test.js app/test/interactive-story-preview-loading.test.js
git commit -m "feat: add responsive interactive story overlay layout editor"
```

### Task 6: Persist pen-and-paper participants and round attendance

**Files:**
- Create: `app/plugins/interactive-story/backend/participant-registry.js`
- Modify: `app/plugins/interactive-story/backend/database.js:18-390`
- Create: `app/plugins/interactive-story/test/participant-registry.test.js`
- Create: `app/plugins/interactive-story/test/participant-database.test.js`

**Interfaces:**
- `ParticipantRegistry.join(sessionId, userId, username, round): ParticipantSnapshot`.
- `ParticipantRegistry.recordVote(sessionId, userId, round): ParticipantSnapshot|null`.
- `ParticipantRegistry.resolveRound(sessionId, round): { updated, eliminated }`.
- `ParticipantRegistry.list(sessionId, { includeEliminated }): ParticipantSnapshot[]`.
- `StoryDatabase.createParticipant`, `getParticipant`, `listParticipants`, `recordParticipantVote`, `resolveParticipantRound`, and `resetParticipants` use prepared statements.

- [ ] **Step 1: Write failing tests.** Cover exact join uniqueness, random-role injection with a seeded function, no rejoin after elimination, vote reset, two consecutive missed rounds, newly joined participant protection, persistence round-trip, and public-safe snapshots.

- [ ] **Step 2: Run the tests to verify failure.**

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js plugins/interactive-story/test/participant-registry.test.js plugins/interactive-story/test/participant-database.test.js --runInBand
```

Expected: FAIL because the table, database methods, and registry do not exist.

- [ ] **Step 3: Add the prepared-statement schema and methods.** Create `story_participants` in `initialize`, add session cleanup deletes, and ensure all JSON/public values are normalized in one place.

- [ ] **Step 4: Implement the registry.** Use a stable built-in role catalog, injectable random selector for tests, active/eliminated transitions, and the exact two-round rule. Keep viewer IDs out of UI-facing snapshots unless the existing contract already exposes them.

- [ ] **Step 5: Run focused participant tests.** Expected: PASS.

- [ ] **Step 6: Commit the participant persistence slice.**

```powershell
git add -- app/plugins/interactive-story/backend/participant-registry.js app/plugins/interactive-story/backend/database.js app/plugins/interactive-story/test/participant-registry.test.js app/plugins/interactive-story/test/participant-database.test.js
git commit -m "feat: add pen-and-paper participant registry"
```

### Task 7: Integrate pen-and-paper mode into story lifecycle, chat, voting, and routes

**Files:**
- Modify: `app/plugins/interactive-story/main.js:1300-1725,2000-2295`
- Modify: `app/plugins/interactive-story/engines/story-engine.js:224-420`
- Create: `app/plugins/interactive-story/test/interactive-story-dnd-integration.test.js`
- Modify: `app/plugins/interactive-story/test/voting-system.test.js`

**Interfaces:**
- Add routes `GET /api/interactive-story/participants`, `POST /api/interactive-story/participants/join`, and `POST /api/interactive-story/participants/reset`.
- Add events `story:dnd-participant-joined`, `story:dnd-participants-updated`, and `story:dnd-player-eliminated`.
- Include `storyMode`, `joinKeyword`, `activeParticipants`, and `eliminatedParticipants` in status responses.

- [ ] **Step 1: Write failing integration tests.** Simulate an active D&D session, send `!join`, assert random role/event/roster, send accepted votes across rounds, assert missed-round reset, assert elimination after exactly two missed rounds, and verify participant context is passed to the next chapter prompt.

- [ ] **Step 2: Run the integration test to verify failure.**

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js plugins/interactive-story/test/interactive-story-dnd-integration.test.js plugins/interactive-story/test/voting-system.test.js --runInBand
```

Expected: FAIL because chat only parses votes and no participant lifecycle is wired.

- [ ] **Step 3: Integrate join handling before vote parsing.** Match the configured exact keyword case-insensitively, enroll once, update the registry, and emit public-safe roster events. Preserve the existing quick filter for unrelated long chat messages.

- [ ] **Step 4: Integrate vote attendance and round resolution.** Mark participant attendance only after `VotingSystem.processVote` returns true, resolve the registry in `_handleVoteResults` before starting the next chapter, emit elimination events, and keep non-enrolled audience votes allowed.

- [ ] **Step 5: Add routes/status and prompt context.** Validate active-session/admin constraints, expose roster data, include active role summaries in StoryEngine context, and make reset available only to the active session/admin route.

- [ ] **Step 6: Run focused D&D and API suites.** Expected: PASS.

- [ ] **Step 7: Commit the D&D integration slice.**

```powershell
git add -- app/plugins/interactive-story/main.js app/plugins/interactive-story/engines/story-engine.js app/plugins/interactive-story/test/interactive-story-dnd-integration.test.js app/plugins/interactive-story/test/voting-system.test.js
git commit -m "feat: integrate pen-and-paper story mode"
```

### Task 8: Rebuild the visible page into the compact Story Studio flow

**Files:**
- Modify: `app/plugins/interactive-story/ui.html:1-9300`
- Modify: `app/plugins/interactive-story/overlay.html:740-930`
- Modify: `app/plugins/interactive-story/locales/de.json`
- Modify: `app/plugins/interactive-story/locales/en.json`
- Modify: `app/plugins/interactive-story/locales/es.json`
- Modify: `app/plugins/interactive-story/locales/fr.json`
- Modify: `app/test/interactive-story-ui-i18n.test.js`
- Modify: `app/plugins/interactive-story/test/ui-toggle.test.js`

**Interfaces:**
- Keep existing IDs used by save/load/config tests (`llmProvider`, `ollamaModel`, `autoGenerateImages`, `ttsEngine`, `ttsVoiceId`, `previewFrame`, start/end controls).
- Add `storyMode`, `dndJoinKeyword`, `dndInactivityLimitRounds`, Fish model/emotion controls, and participant roster container with namespaced translations.
- Add preview buttons that toggle `?edit=1`, save, and reset layout.

- [ ] **Step 1: Write failing UI/i18n tests.** Assert the compact sections, mode selector, image-off default label, Fish.audio default label, central-settings key explanation, D&D roster/keyword controls, preview layout buttons, and complete German/English/Spanish/French translation keys.

- [ ] **Step 2: Run UI tests to verify failure.**

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js test/interactive-story-ui-i18n.test.js plugins/interactive-story/test/ui-toggle.test.js --runInBand
```

Expected: FAIL because the existing page exposes the old provider/key flow and lacks the new compact Story Studio controls.

- [ ] **Step 3: Implement the compact shell while preserving stable IDs.** Move advanced fields behind one collapsed section, put Start/Live/Players/Voice first, add clear status/error states, and remove duplicate provider/key instructions from the primary flow.

- [ ] **Step 4: Wire config load/save and live participant rendering.** Ensure the new defaults populate correctly, central key fields are never sent as plugin secrets, status events update the roster, and preview edit mode opens only on explicit action.

- [ ] **Step 5: Update all four locale files and run i18n/UI suites.** Expected: PASS with no hard-coded visible status/chapter language branches.

- [ ] **Step 6: Commit the Story Studio UI slice.**

```powershell
git add -- app/plugins/interactive-story/ui.html app/plugins/interactive-story/overlay.html app/plugins/interactive-story/locales app/test/interactive-story-ui-i18n.test.js app/plugins/interactive-story/test/ui-toggle.test.js
git commit -m "feat: simplify interactive story studio ui"
```

### Task 9: Run integrated workflow verification and finish documentation

**Files:**
- Modify: `app/plugins/interactive-story/README.md`
- Modify: `app/plugins/interactive-story/SCHNELLSTART.md`
- Modify: `app/plugins/interactive-story/ARCHITECTURE.md`
- Modify: `app/test/interactive-story-local-preview.test.js` if integration regressions are found
- Modify: focused tests only when a verified regression requires it

**Interfaces:**
- Documentation describes Ollama Cloud central-key behavior, image-off default, Fish.audio emotion model/syntax, `!join`, two missed rounds, and overlay edit mode.
- No documentation claims live provider success without an actual external check.

- [ ] **Step 1: Run all focused Interactive Story and TTS suites.**

```powershell
..\runtime\node\node.exe node_modules\jest\bin\jest.js test/interactive-story-*.test.js plugins/interactive-story/test/*.test.js test/tts-request-overrides.test.js test/tts-fish-emotion-model.test.js --runInBand
```

Expected: PASS for all scoped suites; investigate failures individually instead of weakening assertions.

- [ ] **Step 2: Run static gates.**

```powershell
npm run lint
npm run build:css
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 3: Exercise the real browser workflow.** Start the app in the existing safe/local test mode and use the browser preview to load the plugin, verify Ollama provider/default masking, save image-off and Fish narration settings, open overlay edit mode, drag title/content/voting/participants, save/reset, start a test story, join two simulated viewers with `!join`, vote one round, skip two rounds for one participant, and confirm the roster/event state. Capture the actual visible state and any network errors.

- [ ] **Step 4: Verify public render safety.** Load the overlay through the local public-render harness, assert that it displays registered read data, has no edit banner/listeners, and that layout POST attempts are skipped/blocked by the local-only guard.

- [ ] **Step 5: Update active docs and run the focused suites again.** Expected: PASS and docs match the final config/event contracts.

- [ ] **Step 6: Perform final review.** Inspect `git diff --stat`, `git status --short`, all staged paths, API-key masking, database cleanup, and unrelated dirty-worktree preservation. Report local commits, test evidence, and any external-provider checks separately.

