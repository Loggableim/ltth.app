# Stream Monsters Collection Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `!monsters` and `!monster <slot>` readable OBS experiences, add configurable lower-overlay timing, and expire unhatched eggs after 24 hours.

**Architecture:** Keep GCCE and direct TikTok chat on the existing single `streammonsters:chat_result` path. Add a small browser-safe view-model module for paging and timing, extend the SQLite egg state additively, and have the existing engine timer sweep expired eggs before ready-state work. The overlay selects a gallery or profile presentation from the existing command-result payload instead of emitting a second event.

**Tech Stack:** Node.js CommonJS, better-sqlite3, Jest, JSDOM, static HTML/CSS/JavaScript, Socket.IO.

**OBS Surface:** The Stream Monsters OBS overlay remains available at `/streammonsters/overlay`; collection and profile views are rendered only there.

## Global Constraints

- Keep the stable plugin ID `streamalchemy`; all visible copy remains Stream Monsters.
- Preserve exactly one domain action and one `streammonsters:chat_result` per valid GCCE or fallback chat message.
- Use the bundled Node 22 runtime at `runtime/node/node.exe` for every Jest command.
- Do not modify foreign dirty-worktree files, global locales, store packages, or release metadata.
- Do not change permanent monster stats, combat rules, art ownership, paid-gift fairness, command prefixes, or existing battle timing.
- Expiration is 24 hours from `created_at_ms`, applies only to `incubating` and `ready` eggs, and is additive to old data.

---

### Task 1: Add testable collection and profile view-model helpers

**Files:**
- Create: `app/plugins/streamalchemy/streammonsters-overlay-views.js`
- Modify: `app/plugins/streamalchemy/streammonsters-overlay.html`
- Test: `app/test/streammonsters-overlay.test.js`

**Interfaces:**
- Produces `StreamMonstersOverlayViews.paginate(monsters, pageSize = 6)` returning arrays of no more than six monsters in original slot order.
- Produces `StreamMonstersOverlayViews.collectionDurationMs(bottomOverlayDurationMs, pageCount)` returning `Math.max(bottomOverlayDurationMs, pageCount * 5000)`.
- Produces `StreamMonstersOverlayViews.profile(monster, slot)` returning a display-ready object with `vitality`, `might`, `guard`, and `agility` numeric stat values.
- The UMD wrapper assigns the API to `globalThis.StreamMonstersOverlayViews` in OBS and `module.exports` in Jest.

- [ ] **Step 1: Write the failing helper behavior test**

  Add this test to `app/test/streammonsters-overlay.test.js` before creating the helper file:

  ```js
  test('pages collections in stable groups of six and preserves a readable page duration', () => {
    const views = require('../plugins/streamalchemy/streammonsters-overlay-views');
    const monsters = Array.from({ length: 7 }, (_, index) => ({ monster_id: `m-${index + 1}`, stats: {} }));

    expect(views.paginate(monsters)).toEqual([
      expect.arrayContaining([{ monster_id: 'm-1' }, { monster_id: 'm-6' }]),
      [{ monster_id: 'm-7', stats: {} }]
    ]);
    expect(views.paginate(monsters)[0]).toHaveLength(6);
    expect(views.collectionDurationMs(8_000, 2)).toBe(10_000);
  });
  ```

  The break this catches is a gallery that silently drops a seventh monster or rotates pages faster than viewers can read.

- [ ] **Step 2: Run the test and confirm the expected red failure**

  Run:

  ```powershell
  Set-Location app
  ..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\streammonsters-overlay.test.js
  ```

  Expected: `Cannot find module '../plugins/streamalchemy/streammonsters-overlay-views'`.

- [ ] **Step 3: Implement the smallest browser-safe helper module**

  Create the UMD module with these concrete semantics:

  ```js
  function paginate(monsters, pageSize = 6) {
    const safePageSize = Math.max(1, Number(pageSize) || 6);
    const source = Array.isArray(monsters) ? monsters : [];
    return Array.from({ length: Math.ceil(source.length / safePageSize) }, (_, index) => (
      source.slice(index * safePageSize, (index + 1) * safePageSize)
    ));
  }

  function collectionDurationMs(bottomOverlayDurationMs, pageCount) {
    return Math.max(Number(bottomOverlayDurationMs) || 8000, Math.max(1, pageCount) * 5000);
  }
  ```

  Add `<script src="/plugins/streamalchemy/streammonsters-overlay-views.js"></script>` before the inline overlay script so the static plugin route serves the same helper used by Jest.

- [ ] **Step 4: Add the profile normalization assertion and rerun green**

  Extend the test with a monster missing some stat fields and assert literal zeros for missing `vitality`, `might`, `guard`, and `agility`. Then rerun the command from Step 2.

  Expected: all overlay tests pass.

- [ ] **Step 5: Commit the helper and its focused test**

  ```powershell
  git add app/plugins/streamalchemy/streammonsters-overlay-views.js app/plugins/streamalchemy/streammonsters-overlay.html app/test/streammonsters-overlay.test.js
  git commit -m "feat(stream-monsters): add collection overlay view models"
  ```

### Task 2: Persist 24-hour egg expiration without changing old records

**Files:**
- Modify: `app/plugins/streamalchemy/backend/streammonsters/database.js`
- Test: `app/test/streammonsters-core.test.js`

**Interfaces:**
- Adds nullable column `streammonsters_eggs.expired_at_ms` through `ensureColumn`.
- Adds `expireUnhatchedEggs(nowMs, expiryMs = 24 * 60 * 60 * 1000)` returning changed eggs in creation order.
- Adds `getViewerHatchableEggs(userId)` returning only `incubating` and `ready` eggs in the same stable slot order used by `!hatch`.

- [ ] **Step 1: Write the failing expiration-boundary test**

  Add this test to `app/test/streammonsters-core.test.js`:

  ```js
  test('expires ready and incubating eggs at exactly 24 hours but keeps newer eggs hatchable', () => {
    const { store } = createGame();
    store.createEgg({ eggId: 'old-ready', userId: 'viewer', giftId: 1, giftName: 'Heart', element: 'Volt', eggColor: '#fff', seed: 'a', createdAtMs: 0, hatchDurationMs: 1, readyAtMs: 1 });
    store.createEgg({ eggId: 'new-ready', userId: 'viewer', giftId: 2, giftName: 'Heart', element: 'Tide', eggColor: '#fff', seed: 'b', createdAtMs: 1, hatchDurationMs: 1, readyAtMs: 2 });
    store.markReadyEggs(2);

    expect(store.expireUnhatchedEggs(24 * 60 * 60 * 1000).map(egg => egg.egg_id)).toEqual(['old-ready']);
    expect(store.getEgg('old-ready')).toEqual(expect.objectContaining({ state: 'expired', expired_at_ms: 24 * 60 * 60 * 1000 }));
    expect(store.getViewerHatchableEggs('viewer').map(egg => egg.egg_id)).toEqual(['new-ready']);
  });
  ```

  The break this catches is treating expiry as an in-memory display condition instead of a durable, non-hatchable state.

- [ ] **Step 2: Run the test and confirm the expected red failure**

  Run:

  ```powershell
  Set-Location app
  ..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\streammonsters-core.test.js
  ```

  Expected: `store.expireUnhatchedEggs is not a function`.

- [ ] **Step 3: Add the additive migration and store operations**

  In `initialize()`, add:

  ```js
  this.ensureColumn('streammonsters_eggs', 'expired_at_ms', 'INTEGER');
  ```

  Implement a prepared select/update sequence that selects rows with
  `state IN ('incubating', 'ready')` and `created_at_ms + ? <= ?`, updates
  them to `state = 'expired', expired_at_ms = ?`, and returns fresh rows using
  `getEgg()`. Use a transaction so a second sweep returns an empty list.

  Implement `getViewerHatchableEggs(userId)` as a dedicated query rather than
  filtering all stored rows at call sites.

- [ ] **Step 4: Add an idempotence and legacy-data assertion, then rerun green**

  Extend the test to run the expiry sweep twice and assert the second result is
  empty. Initialize a database containing an old `streammonsters_eggs` table
  without `expired_at_ms`, call `initialize()`, and assert the column exists.
  Rerun the command from Step 2.

  Expected: all core tests pass.

- [ ] **Step 5: Commit the database migration and tests**

  ```powershell
  git add app/plugins/streamalchemy/backend/streammonsters/database.js app/test/streammonsters-core.test.js
  git commit -m "feat(stream-monsters): expire unhatched eggs after 24 hours"
  ```

### Task 3: Make engine and command slots expire-safe

**Files:**
- Modify: `app/plugins/streamalchemy/backend/streammonsters/game-engine.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/chat-commands.js`
- Modify: `app/plugins/streamalchemy/index.js`
- Test: `app/test/streammonsters-core.test.js`
- Test: `app/test/streammonsters-chat-commands.test.js`
- Test: `app/test/streammonsters-plugin-integration.test.js`

**Interfaces:**
- Adds `StreamMonstersEngine.expireUnhatchedEggs()` that delegates to the store with `this.now()`.
- `markReadyEggs()` sweeps expired eggs before marking newly ready eggs.
- `hatchEgg()` uses `getViewerHatchableEggs(userId)` after the expiry sweep.
- `ChatCommands.eggs(userId)` returns `{ eggs, expiredEggs }`, where `eggs` is slot-addressable and `expiredEggs` is historical only.
- The existing one-second plugin timer invokes `engine.markReadyEggs()`, so it also performs the sweep after startup and while idle.

- [ ] **Step 1: Write the failing engine and command tests**

  Add a core test that creates a ready egg at timestamp zero, advances the injected clock to exactly 24 hours, and asserts:

  ```js
  expect(() => engine.hatchEgg('viewer', 1)).toThrow('STREAM_MONSTERS_EGG_NOT_READY');
  expect(store.getViewerMonsters('viewer')).toHaveLength(0);
  expect(store.getEgg('old')).toEqual(expect.objectContaining({ state: 'expired' }));
  ```

  Add a chat-command test with one active egg and one expired egg that asserts
  `!eggs` returns `status: 'eggs'`, one slot-addressable egg, and
  `expiredEggs` containing only the expired egg. Add a plugin integration test
  that calls the timer callback after initialization and asserts the engine
  expiry method was reached.

  The breaks these catch are a stale egg hatching after a viewer returns and a
  timer that only changes incubation state.

- [ ] **Step 2: Run the focused tests and confirm red failures**

  Run:

  ```powershell
  Set-Location app
  ..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\streammonsters-core.test.js test\streammonsters-chat-commands.test.js test\streammonsters-plugin-integration.test.js
  ```

  Expected: the expired egg remains ready or `expiredEggs` is absent.

- [ ] **Step 3: Implement pre-ready, pre-hatch, and command-path sweeps**

  In the engine, make the order explicit:

  ```js
  markReadyEggs() {
    this.expireUnhatchedEggs();
    const ready = this.store.markReadyEggs(this.now());
    // existing egg_ready emits
  }

  hatchEgg(userId, slot = 1) {
    this.expireUnhatchedEggs();
    const visibleEggs = this.store.getViewerHatchableEggs(userId);
    // existing ready check and transactional monster creation
  }
  ```

  Make `hatchReadyEggs()` use the same hatchable slot list. Keep the existing
  timer in `index.js`; its call to `markReadyEggs()` now supplies startup and
  periodic expiration without a second interval. In `eggs()`, fetch active
  slots from `getViewerHatchableEggs()` and historical expired rows from
  `getViewerEggs(userId, 'expired')`.

- [ ] **Step 4: Preserve GCCE single-delivery behavior and rerun green**

  In `streammonsters-plugin-integration.test.js`, trigger a registered GCCE
  `monsters` command and assert exactly one emitted `streammonsters:chat_result`
  with `result.status === 'inventory'`. Do not add another backend emit for
  collection/profile views. Rerun the command from Step 2.

  Expected: all three suites pass, with one overlay event per command.

- [ ] **Step 5: Commit engine and command safety**

  ```powershell
  git add app/plugins/streamalchemy/index.js app/plugins/streamalchemy/backend/streammonsters/game-engine.js app/plugins/streamalchemy/backend/streammonsters/chat-commands.js app/test/streammonsters-core.test.js app/test/streammonsters-chat-commands.test.js app/test/streammonsters-plugin-integration.test.js
  git commit -m "feat(stream-monsters): keep expired eggs out of hatch slots"
  ```

### Task 4: Persist and expose lower-overlay duration in Creator UI

**Files:**
- Modify: `app/plugins/streamalchemy/index.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/routes.js`
- Modify: `app/plugins/streamalchemy/streammonsters-ui.html`
- Test: `app/test/streammonsters-collector-routes.test.js`
- Test: `app/test/streammonsters-ui.test.js`

**Interfaces:**
- `streamMonsters.bottomOverlayDurationMs` defaults to `8000`.
- `POST /api/streammonsters/config` accepts `bottomOverlayDurationMs`, clamps it to `4000..20000`, and returns it from `publicConfig()`.
- Creator UI submits milliseconds, displays whole seconds, and initializes from `state.config.bottomOverlayDurationMs`.

- [ ] **Step 1: Write the failing API and UI tests**

  Add this route assertion to `app/test/streammonsters-collector-routes.test.js`:

  ```js
  find('POST', '/api/streammonsters/config')(localRequest({ bottomOverlayDurationMs: 99_999 }), result);
  expect(result.body.config.bottomOverlayDurationMs).toBe(20_000);
  expect(configProvider.updateConfig).toHaveBeenCalledWith({
    streamMonsters: { bottomOverlayDurationMs: 20_000 }
  });
  ```

  Add a JSDOM UI test that selects `12` seconds, clicks `#saveSetup`, and
  asserts the posted JSON contains `{ bottomOverlayDurationMs: 12000 }`.
  The break this catches is a duration control that changes only local DOM
  state or accepts unreadably short values.

- [ ] **Step 2: Run the route and UI tests and confirm red failures**

  Run:

  ```powershell
  Set-Location app
  ..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\streammonsters-collector-routes.test.js test\streammonsters-ui.test.js
  ```

  Expected: config response omits `bottomOverlayDurationMs` and no duration
  control exists in the UI.

- [ ] **Step 3: Implement default, clamp, route contract, and UI control**

  Add `bottomOverlayDurationMs: 8_000` to `loadConfig()` defaults. In
  `sanitizeConfigUpdate()`, add only this explicit bounded conversion:

  ```js
  if (Object.prototype.hasOwnProperty.call(input, 'bottomOverlayDurationMs')) {
    safe.bottomOverlayDurationMs = Math.max(4000, Math.min(20000,
      Number.parseInt(input.bottomOverlayDurationMs, 10) || 8000));
  }
  ```

  Include the field in `publicConfig()`. Add a labeled select with 4, 6, 8,
  10, 12, 15, and 20 second values next to the OBS setup controls; populate it
  from state, convert seconds to milliseconds on save, and update the success
  message to mention the display duration.

- [ ] **Step 4: Add default and lower-bound assertions, then rerun green**

  Assert `4000` when the route receives `1`, and `8000` when an older config
  has no duration. Rerun the command from Step 2.

  Expected: both suites pass and existing creator setup fields still save.

- [ ] **Step 5: Commit the Creator timing control**

  ```powershell
  git add app/plugins/streamalchemy/index.js app/plugins/streamalchemy/backend/streammonsters/routes.js app/plugins/streamalchemy/streammonsters-ui.html app/test/streammonsters-collector-routes.test.js app/test/streammonsters-ui.test.js
  git commit -m "feat(stream-monsters): configure lower overlay duration"
  ```

### Task 5: Render collection rotator and lower-half monster profile in OBS

**Files:**
- Modify: `app/plugins/streamalchemy/streammonsters-overlay.html`
- Modify: `app/test/streammonsters-overlay.test.js`

**Interfaces:**
- `showCollection({ userId, monsters, selected, durationMs })` uses `StreamMonstersOverlayViews.paginate()` and waits 5,000 ms per page.
- `showMonsterProfile({ monster, slot, durationMs })` shows a lower-half stats card for the configured duration.
- `present({ type: 'chat_result', data })` dispatches `inventory` to `showCollection`, `monster` to `showMonsterProfile`, and uses the existing `showChat` path for every other status.

- [ ] **Step 1: Write the failing renderer-contract test**

  Extend `app/test/streammonsters-overlay.test.js` to assert the rendered
  document includes a collection region, a profile region, all four stat labels,
  a selected marker, the helper script, and dispatch branches for the two
  statuses:

  ```js
  expect(html).toContain('id="monster-collection"');
  expect(html).toContain('id="monster-profile"');
  expect(html).toContain('Vitalität');
  expect(html).toContain("result?.status === 'inventory'");
  expect(html).toContain("result?.status === 'monster'");
  ```

  The break this catches is a backend result that falls back to an unreadable
  compact chat card instead of an OBS collection/profile view.

- [ ] **Step 2: Run the overlay test and confirm red**

  Run:

  ```powershell
  Set-Location app
  ..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\streammonsters-overlay.test.js
  ```

  Expected: the new region/branch assertions fail.

- [ ] **Step 3: Implement the DOM regions and responsive styling**

  Add two hidden sibling sections to the overlay:

  ```html
  <section id="monster-collection" aria-live="polite"></section>
  <section id="monster-profile" aria-live="polite"></section>
  ```

  Style the collection as a lower-third 2 by 3 grid in landscape and a
  two-column scrolling-free grid in portrait. Style the profile as a lower-half
  panel with image, metadata, and a four-cell stat grid. Both regions begin
  hidden, become visible only while their async presenter owns the serialized
  queue, and are cleared/hidden after the final wait.

- [ ] **Step 4: Implement safe rotator and profile presenters**

  In the inline overlay script, build cards using `document.createElement` and
  `textContent`, never interpolated HTML. For each collection page, render its
  stable one-based slots, update `Page X/Y`, and await 5,000 ms. Calculate total
  visibility with `collectionDurationMs`; if a configured duration exceeds all
  page waits, show the final page for the remaining time. For `!monster`, find
  the one-based slot from the result's `monsters` array when present, otherwise
  display the selected monster data with a safe `?` slot label.

  Route only these two command statuses before `showChat`:

  ```js
  if (type === 'chat_result' && data?.result?.status === 'inventory' && data?.result?.monsters?.length) {
    return showCollection({ userId: data.userId, monsters: data.result.monsters, selected: data.result.selected, durationMs: bottomOverlayDurationMs(data) });
  }
  if (type === 'chat_result' && data?.result?.status === 'monster' && data?.result?.monster) {
    return showMonsterProfile({ monster: data.result.monster, slot: data.result.slot, durationMs: bottomOverlayDurationMs(data) });
  }
  ```

  Extend the public `chat_result` payload at the plugin boundary only if needed
  to add the current config duration; do not add a second emit.

- [ ] **Step 5: Verify green and commit the OBS renderer**

  Run:

  ```powershell
  Set-Location app
  ..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\streammonsters-overlay.test.js test\streammonsters-chat-commands.test.js test\streammonsters-plugin-integration.test.js
  ```

  Expected: all suites pass. Then commit:

  ```powershell
  git add app/plugins/streamalchemy/streammonsters-overlay.html app/test/streammonsters-overlay.test.js
  git commit -m "feat(stream-monsters): show collections and monster profiles in OBS"
  ```

### Task 6: Verify the full scoped behavior and live overlay after safe reload

**Files:**
- Modify if needed: `app/plugins/streamalchemy/README.md`
- Test: `app/test/streammonsters-core.test.js`
- Test: `app/test/streammonsters-chat-commands.test.js`
- Test: `app/test/streammonsters-overlay.test.js`
- Test: `app/test/streammonsters-collector-routes.test.js`
- Test: `app/test/streammonsters-ui.test.js`
- Test: `app/test/streammonsters-plugin-integration.test.js`

**Interfaces:**
- No new API or socket event beyond additive config/state data.
- OBS view remains available at `/streammonsters/overlay` and legacy route compatibility stays intact.

- [ ] **Step 1: Run all focused Stream Monsters and GCCE regression suites**

  Run:

  ```powershell
  Set-Location app
  ..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\streammonsters-core.test.js test\streammonsters-chat-commands.test.js test\streammonsters-overlay.test.js test\streammonsters-collector-routes.test.js test\streammonsters-ui.test.js test\streammonsters-plugin-integration.test.js test\gcce-plugin-cooldown-contract.test.js
  ```

  Expected: all selected suites pass.

- [ ] **Step 2: Run formatting and build gates**

  Run:

  ```powershell
  Set-Location app
  npm run lint
  npm run build:css
  Set-Location ..
  git diff --check
  ```

  Expected: success; record only unrelated baseline failures separately.

- [ ] **Step 3: Perform live-safe OBS verification**

  First query `/api/status`. If TikTok is connected, do not reload and report
  the pending live check. If disconnected, reload only `streamalchemy`, open
  `/streammonsters/overlay` in a browser source or local browser, then verify:

  1. `!monsters` with seven seeded monsters shows two pages and every page is
     readable for five seconds.
  2. `!monster 1` shows the selected image and all four stats in the lower
     half.
  3. The configured 12-second lower duration persists after reload.
  4. A 24-hour-old ready egg changes to `expired` and cannot hatch.
  5. GCCE command invocation produces only one collection/profile card.

- [ ] **Step 4: Update concise user-facing plugin notes and make the final scoped commit**

  If the README currently states only `!monster [slot]` without describing the
  OBS card, add one concise note covering the gallery, rotator, profile, and
  24-hour egg expiry. Stage only Stream Monsters files and focused tests, audit
  `git diff --cached --check`, and commit:

  ```powershell
  git add app/plugins/streamalchemy app/test/streammonsters-core.test.js app/test/streammonsters-chat-commands.test.js app/test/streammonsters-overlay.test.js app/test/streammonsters-collector-routes.test.js app/test/streammonsters-ui.test.js app/test/streammonsters-plugin-integration.test.js
  git diff --cached --check
  git commit -m "feat(stream-monsters): improve collection command overlays"
  ```
