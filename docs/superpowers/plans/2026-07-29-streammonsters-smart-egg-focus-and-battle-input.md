# Stream Monsters Smart Egg Focus and Battle Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unreadable portrait egg icon row with a large rotating ownership/status card and make eligible fighter `A/B/C` input observable and robust.

**Architecture:** `streammonsters-egg-stage-view.js` remains the authoritative client projection of `eggStage`, but receives a portrait focus mode that selects one keyed card without changing landscape behavior. GCCE continues to own chat ingress; Stream Monsters normalizes and classifies eligible battle responses, logs the result safely, and emits sealed or rejected feedback without revealing a choice.

**Tech Stack:** CommonJS, vanilla DOM/CSS, Jest/JSDOM, Socket.IO event projection, GCCE plugin APIs, bundled Node 22 / ABI 127.

## Global Constraints

- The live LTTH process on port 3000 must not be restarted.
- GCCE is the only command ingress while active; direct TikTok handling is fallback only.
- The first fighter choice remains sealed and must never reveal `A`, `B`, or `C` before both decisions exist.
- Gift eggs are immediately owned and never adoptable.
- Only free offers may be reserved, public, claimed, or expired.
- Claimed, hatched, and expired eggs leave the shared shelf immediately.
- Portrait gameplay stays above the lower 26-percent TikTok chat-safe zone.
- Text must remain readable in 477 by 829 and 1080 by 1920 layouts.
- Existing unrelated main-worktree files must not be modified.

---

### Task 1: Portrait Smart Egg Focus

**Files:**
- Modify: `app/plugins/streamalchemy/streammonsters-egg-stage-view.js`
- Modify: `app/plugins/streamalchemy/streammonsters-overlay.html`
- Modify: `app/plugins/streamalchemy/locales/de.json`
- Modify: `app/plugins/streamalchemy/locales/en.json`
- Modify: `app/plugins/streamalchemy/locales/es.json`
- Modify: `app/plugins/streamalchemy/locales/fr.json`
- Modify: `app/locales/de.json`
- Modify: `app/locales/en.json`
- Modify: `app/locales/es.json`
- Modify: `app/locales/fr.json`
- Test: `app/test/streammonsters-egg-smart-focus-v111.test.js`
- Test: `app/test/streammonsters-egg-shelf-portrait-reliability.test.js`

**Interfaces:**
- Consumes: existing sanitized `eggStage` entries and dynamic `getLabels()`, `getHatchReference()`, and `getAdoptReference()` callbacks.
- Produces: `buildPortraitFocusModel(eggStage, { rotationIndex })`, one keyed `[data-egg-focus]` card, and localized focus labels.

- [ ] **Step 1: Write failing focus-model tests**

Add tests proving that portrait focus alternates a public egg with ready/incubating eggs, public eggs remain visible on every second turn, claimed or expired eggs are absent, and landscape `buildShelfModel` retains the existing multi-item result.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
& 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe' node_modules\jest\bin\jest.js test\streammonsters-egg-smart-focus-v111.test.js --runInBand
```

Expected: FAIL because `buildPortraitFocusModel` and the focus DOM do not exist.

- [ ] **Step 3: Implement the minimal focus model and keyed DOM**

Add a pure portrait selection helper. Render owner, state, countdown or queue, command, and position/total into one reusable node. Keep the public/reserved free egg on alternating turns and use the existing five-second rotation timer.

- [ ] **Step 4: Write and run failing portrait CSS/localization tests**

Assert viewport-relative card sizing, owner font, state/timer font, colored state selectors, the 26-percent bottom boundary, and non-empty DE/EN/ES/FR labels.

- [ ] **Step 5: Implement responsive portrait CSS and translations**

Replace the portrait-only five-icon grid with the large focus card. Keep the landscape rules unchanged and integrate the command into the focused state line rather than a detached summary.

- [ ] **Step 6: Run focused tests and commit**

Run the new test plus the existing portrait, animation, reconnect, language, and lifecycle presenter suites. Commit only Task 1 files.

### Task 2: GCCE and Fighter Raw-Input Feedback

**Files:**
- Modify: `app/plugins/gcce/index.js`
- Modify: `app/plugins/streamalchemy/index.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/public-event-projector.js`
- Modify: `app/plugins/streamalchemy/streammonsters-overlay.html`
- Modify: locale files only when new user-visible feedback keys are required
- Test: `app/test/gcce-streammonsters-integration-v13.test.js`
- Test: `app/test/streammonsters-battle-match-v4.test.js`
- Test: `app/test/streammonsters-overlay-language-presenter-v111.test.js`

**Interfaces:**
- Consumes: GCCE `registerRawResponseHandlerForPlugin`, battle match action/stat windows, and existing sealed decision events.
- Produces: exactly-once eligible raw dispatch from `comment|message|text`, privacy-safe response status logs, and redacted `battle_choice_rejected` or sealed acknowledgement payloads.

- [ ] **Step 1: Add failing raw-ingress tests**

Prove that GCCE dispatches a lowercase/whitespace `text: " a "` payload once, while unrelated chat remains unhandled and the direct Stream Monsters fallback does not also execute.

- [ ] **Step 2: Run the ingress tests and verify RED**

Expected: the `text`-only fixture fails to reach the raw handler.

- [ ] **Step 3: Implement the smallest GCCE payload normalization**

Read `data.comment || data.message || data.text`, preserve existing command parsing, and do not broaden accepted raw values.

- [ ] **Step 4: Add failing battle-result tests**

Prove accepted sealing, no first-choice disclosure, handled feedback for an eligible but uncharged `C`, handled feedback for an already sealed fighter, a closed-window acknowledgement only for an active participant, and unhandled responses from non-participants.

- [ ] **Step 5: Implement result classification and redacted feedback**

Keep `submitChoice()` authoritative. Convert eligible rejection outcomes into handled responses with a reason and public-safe payload; emit/log acknowledgement without exposing the sealed choice.

- [ ] **Step 6: Run focused tests and commit**

Run GCCE raw-response, battle-match, public-projector, overlay-language, TTS-consumption, and exactly-once suites. Commit only Task 2 files.

### Task 3: Integrated Browser and Live-Safe Verification

**Files:**
- Test only; no new production files unless a failing verification exposes a scoped defect.

**Interfaces:**
- Consumes: Task 1 and Task 2 commits.
- Produces: evidence for integration into local `main` and a plugin-only live reload.

- [ ] **Step 1: Run the combined Node 22 gate**

Run the focused Stream Monsters egg, GCCE, battle, overlay, reconnect, and localization suites with bundled Node 22.

- [ ] **Step 2: Run static checks**

Run ESLint on touched JavaScript, `npm run build:css`, and `git diff --check`.

- [ ] **Step 3: Perform real-browser portrait verification**

At 477 by 829 and 1080 by 1920, confirm the focused owner/state/timer text is readable, the card remains above the 26-percent boundary, timer ticks reuse the node, and claimed/expired events remove it.

- [ ] **Step 4: Review and integrate**

Complete task review and final whole-branch review. Cherry-pick the reviewed commits into local `main` without touching unrelated files.

- [ ] **Step 5: Reload only Stream Monsters**

Confirm TikTok remains connected, call only `POST /api/plugins/streamalchemy/reload`, verify the same port-3000 process remains alive, and inspect post-reload Stream Monsters logs. Do not reload GCCE or restart LTTH during the active stream.
