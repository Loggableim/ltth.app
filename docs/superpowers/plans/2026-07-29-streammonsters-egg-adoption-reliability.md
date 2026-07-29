# Stream Monsters Egg Adoption Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the free-egg adoption lifecycle and portrait egg shelf authoritative, bounded, readable, and reconnect-safe without changing directly owned gift eggs.

**Architecture:** SQLite remains the lifecycle source of truth. The backend owns canonical transitions and emits sanitized state deltas; the overlay applies those deltas immediately to a keyed shelf reducer while its independent presentation queue handles only optional animation and copy. Reconnect always starts from the HTTP snapshot and never replays egg lifecycle animation.

**Tech Stack:** CommonJS Node.js, SQLite through `better-sqlite3`, Jest/JSDOM, static HTML/CSS, Socket.IO, bundled Node 22 / ABI 127.

## Global Constraints

- Work only in the isolated branch `codex/streammonsters-egg-adoption-reliability`.
- Do not reload Stream Monsters, restart LTTH, call mutating live APIs, or modify the live SQLite database while the stream is active.
- Gift eggs remain directly owned and never become adoptable.
- Free eggs remain reserved for exactly 60 seconds, then public for exactly 300 seconds.
- The configured claim cooldown remains authoritative; its default remains 86,400 seconds.
- Existing incubating eggs retain their stored `ready_at_ms`.
- Public payloads contain only opaque egg IDs and sanitized display data, never numeric viewer IDs.
- Use test-first red-green cycles with `runtime/node/node.exe` and the existing `app/node_modules`.
- Preserve the CommonJS style, two-space indentation, plugin logger, prepared statements, and additive migrations.

---

### Task 1: Canonical backend lifecycle, migration, and identity

**Files:**
- Create: `app/test/streammonsters-free-egg-lifecycle-reliability.test.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/database.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/free-egg-drop-service.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/egg-stage-projector.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/game-engine.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/chat-commands.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/avatar-proxy.js`
- Modify: `app/plugins/streamalchemy/index.js`

**Interfaces:**
- Produces: `FreeEggDropService.PUBLIC_WINDOW_MS = 300_000`.
- Produces: `FreeEggDropService#setConfig({ freeEggDropsEnabled, freeEggCooldownSeconds })`.
- Produces: `StreamMonstersStore#expirePublicFreeEggOffers(streamKey, nowMs): Offer[]`.
- Produces: `StreamMonstersStore#getNextFreeEggTransitionDeadline(nowMs): number|null`.
- Produces: `EggStageProjector#projectEgg()` with additive `ownershipState`.
- Produces: `EggStageProjector#projectOffer()` with `timing.expiresAtMs`.
- Consumes: the existing 60-second `RESERVATION_MS`, transaction helpers, terminal-disconnect payload, GCCE/fallback command context, and avatar proxy.

- [ ] **Step 1: Write migration and lifecycle regression tests**

  Add real in-memory store/service tests that hand-create:

  ```js
  test('normalizes legacy offer stage and free egg provenance additively', () => {
    // public/reserved becomes public/public;
    // claimed/reserved becomes claimed/claimed;
    // gift_id=0 + "Free Egg Drop" becomes provenance="free";
    // ordinary legacy/gift eggs remain unchanged.
  });

  test('does not offer an egg while the viewer claim cooldown is active', () => {
    // A prior claim inside configured cooldown yields status "cooldown",
    // creates zero offers, and emits no reserved shelf event.
  });

  test('expires a public offer exactly 300 seconds after reservation release', () => {
    // 59,999 ms => reserved; 60,000 ms => public;
    // 359,999 ms => public; 360,000 ms => expired and removed.
  });

  test('terminal disconnect expires offers while transient disconnect preserves them', () => {
    // Use registered TikTok handlers with code 4005/non-transient versus
    // code 1006/transient and assert the persisted offer states.
  });

  test('disabling free drops expires outstanding offers and stops future offers', () => {
    // setConfig(false) expires current reserved/public rows and emits removal.
  });

  test('adoption keeps the claimant safe display name and avatar', () => {
    // Feed nickname plus a tiktokcdn-us.com profile URL through ChatCommands;
    // assert the created egg stores the sanitized name and /avatar/ proxy ref.
  });

  test('claimed free inventory stage events carry owned provenance metadata', () => {
    // project ready/boost/expired free eggs and assert ownershipState="owned".
  });
  ```

- [ ] **Step 2: Run the new test and verify RED**

  Run from `app/`:

  ```powershell
  & '..\..\..\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' `
    --runInBand --runTestsByPath `
    test/streammonsters-free-egg-lifecycle-reliability.test.js
  ```

  Expected: assertions fail because cooldown is checked only at claim time,
  public expiry/deadline APIs do not exist, migration preserves mismatched
  `stage_state`, claimed identity is discarded, and US TikTok CDN avatars are
  rejected.

- [ ] **Step 3: Implement the additive migration and store transitions**

  In `database.js`:

  - add nullable `public_expires_at_ms`;
  - normalize every valid `status` into `stage_state`;
  - backfill `public_expires_at_ms = reserved_until_ms + 300000`;
  - backfill canonical historical free eggs using `free_offer_id IS NOT NULL`
    or `gift_id = 0 AND lower(trim(gift_name)) = 'free egg drop'`;
  - insert new offers with the explicit public deadline;
  - expire due public rows transactionally with `RETURNING *`;
  - return the earliest future reservation or public deadline;
  - exclude `expired` rows from `getEggStageEggs()`.

  Use prepared statements for every value-bearing query.

- [ ] **Step 4: Implement service and plugin lifecycle behavior**

  In `free-egg-drop-service.js`:

  - check the latest claim before creating an offer;
  - sweep reserved releases and public expirations in one transaction;
  - emit `egg_stage_removed` for expired offers;
  - rearm against `getNextFreeEggTransitionDeadline`;
  - implement `setConfig()` and expire outstanding current-stream offers on
    enabled-to-disabled transition;
  - pass claimant display/avatar into `createFreeEgg`.

  In `index.js`, call `setConfig()` and register a `disconnected` TikTok handler
  that cleans only terminal stream endings:

  ```js
  const terminal = data.wasLive === true &&
    !data.isTransient &&
    [1000, 4005, 4404].includes(Number(data.code));
  ```

  Deduplicate terminal cleanup by stable session token.

- [ ] **Step 5: Complete sanitized identity and stage payloads**

  - Let `ChatCommands.adopt()` derive a sanitized claimant display name from
    command context and an avatar proxy reference from supported raw avatar
    fields.
  - Add `tiktokcdn-us.com` to the avatar host suffix allowlist.
  - Add `ownershipState` to projected owned eggs and explicit public expiry to
    projected offers.
  - Give boost and expiry stage payloads stable event/correlation IDs.
  - Emit expiration with an `eggStage` payload so its lifecycle copy is
    reachable.

- [ ] **Step 6: Run focused backend tests and verify GREEN**

  Run:

  ```powershell
  & '..\..\..\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' `
    --runInBand --runTestsByPath `
    test/streammonsters-free-egg-lifecycle-reliability.test.js `
    test/streammonsters-free-egg-drops-v6.test.js `
    test/streammonsters-egg-stage-v110.test.js `
    test/streammonsters-gift-egg-loop-v15.test.js `
    test/streammonsters-gcce-v15.test.js
  ```

  Expected: all listed suites pass with no open handles.

- [ ] **Step 7: Commit**

  ```powershell
  git add -- app/plugins/streamalchemy app/test/streammonsters-free-egg-lifecycle-reliability.test.js
  git commit -m "fix(streammonsters): canonicalize free egg lifecycle"
  ```

---

### Task 2: Immediate shelf truth and reconnect-safe event queue

**Files:**
- Create: `app/test/streammonsters-egg-overlay-state-reliability.test.js`
- Modify: `app/plugins/streamalchemy/streammonsters-overlay-runtime.js`
- Modify: `app/plugins/streamalchemy/streammonsters-overlay.html`
- Modify: `app/plugins/streamalchemy/streammonsters-egg-stage-view.js`

**Interfaces:**
- Consumes: Task 1 `ownershipState`, `timing.expiresAtMs`, and stable stage IDs.
- Produces: `isEggStageEvent(type): boolean`.
- Produces: reconnect replay that excludes snapshot-owned egg lifecycle events.
- Produces: priority queue coalescing keyed by event semantics rather than only type.
- Produces: live enqueue that mutates `eggStageView` before cinematic presentation.

- [ ] **Step 1: Write overlay state and queue regression tests**

  Add behavior tests:

  ```js
  test('applies claim removal immediately while a prior presentation is blocked', async () => {
    // Enqueue a long critical card, then free_egg_claimed;
    // the keyed shelf removes the offer before the card promise resolves.
  });

  test('does not replay egg lifecycle events after an authoritative snapshot', () => {
    // Empty snapshot plus missed landed/ready/hatched/removed returns no egg
    // replay events; battle cursor replay remains intact.
  });

  test('ignores owned free inventory eggs on live ready and boost events', () => {
    // applyEvent() never inserts provenance=free, ownershipState=owned.
  });

  test('keeps hatch wait cards for different viewers independently', () => {
    // Two chat_result/egg_not_ready payloads remain two queue entries in order.
  });

  test('coalesces repeated free-offer prompts without delaying shelf state', () => {
    // State reducer sees every transition; visual queue retains only latest
    // reserved and latest public informational card.
  });
  ```

- [ ] **Step 2: Run the new test and verify RED**

  Run:

  ```powershell
  & '..\..\..\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' `
    --runInBand --runTestsByPath `
    test/streammonsters-egg-overlay-state-reliability.test.js
  ```

  Expected: failures show shelf mutation occurs in `present()`, egg events are
  replayed, owned free eggs are accepted live, and `chat_result` is globally
  coalesced.

- [ ] **Step 3: Make snapshot and live reducer ownership explicit**

  In `streammonsters-overlay-runtime.js`:

  - export `isEggStageEvent(type)`;
  - classify landed, reserved, public, claimed, ready, updated, boosted,
    expired, and removed as shelf state events;
  - exclude all egg lifecycle types from `replayableRecentEvents()` because the
    snapshot already owns shelf truth;
  - preserve existing persisted battle replay behavior.

  In `streammonsters-overlay.html`:

  - call `eggStageView.applyEvent(type, data)` synchronously inside `enqueue()`;
  - remove the second reducer mutation from `present()`;
  - map `streammonsters:egg_expired`;
  - let snapshot replay enqueue only presentation-safe non-egg events.

- [ ] **Step 4: Fix queue semantics**

  - Keep `hype_changed` globally coalesced.
  - Coalesce `free_egg_reserved` and `free_egg_public` separately as compact
    informational cards.
  - Key ordinary `chat_result` coalescing by sanitized display name, command,
    and result status.
  - Treat `chat_result` with status `egg_not_ready` as durable so another
    viewer’s command cannot replace or stale-drop it.
  - Keep claimed/hatch/removal state lossless at the reducer even when their
    presentation is deduplicated.

- [ ] **Step 5: Reject claimed free inventory in the live reducer**

  Update `createEggStageView().applyEvent()` so
  `provenance='free' && ownershipState='owned'` removes/ignores the shared shelf
  entry for every live event while leaving presentation payloads available.

- [ ] **Step 6: Run focused overlay tests and verify GREEN**

  Run:

  ```powershell
  & '..\..\..\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' `
    --runInBand --runTestsByPath `
    test/streammonsters-egg-overlay-state-reliability.test.js `
    test/streammonsters-overlay-critical-queue-v15.test.js `
    test/streammonsters-overlay-reconnect-v15.test.js `
    test/streammonsters-egg-stage-animation-v111.test.js `
    test/streammonsters-egg-shelf-autohatch-v111.test.js `
    test/streammonsters-command-ingress-dedupe-v1111.test.js
  ```

  Expected: all listed suites pass.

- [ ] **Step 7: Commit**

  ```powershell
  git add -- app/plugins/streamalchemy/streammonsters-overlay-runtime.js `
    app/plugins/streamalchemy/streammonsters-overlay.html `
    app/plugins/streamalchemy/streammonsters-egg-stage-view.js `
    app/test/streammonsters-egg-overlay-state-reliability.test.js
  git commit -m "fix(streammonsters): make egg shelf state authoritative"
  ```

---

### Task 3: Portrait shelf geometry, stable animation, and compact guidance

**Files:**
- Create: `app/test/streammonsters-egg-shelf-portrait-reliability.test.js`
- Modify: `app/plugins/streamalchemy/streammonsters-egg-stage-view.js`
- Modify: `app/plugins/streamalchemy/streammonsters-overlay.html`
- Modify: `app/plugins/streamalchemy/streammonsters-chat-view.js`
- Modify: `app/locales/de.json`
- Modify: `app/locales/en.json`
- Modify: `app/locales/es.json`
- Modify: `app/locales/fr.json`

**Interfaces:**
- Consumes: Task 1 public expiry and Task 2 immediate reducer.
- Produces: one stable keyed overflow preview and one shelf-level adopt summary.
- Produces: compact public countdown labels and compact upper-third notices.
- Produces: gift landing as state-only presentation and reachable expiry copy.

- [ ] **Step 1: Write shelf DOM and copy regression tests**

  Add JSDOM tests:

  ```js
  test('keeps the same overflow preview node across countdown ticks', () => {
    // Six eggs at 477 px, render twice one second apart;
    // preview element identity is unchanged when rotation did not advance.
  });

  test('renders one adopt summary instead of one wide command pill per egg', () => {
    // Five public offers produce five short expiry timers and exactly one
    // shelf-level !adopt summary.
  });

  test('removes expired eggs from the shared model', () => {
    // Rotten owned eggs are absent while ready/incubating/queued remain.
  });

  test('renders compact reserved and public notices for five seconds', () => {
    // Notice size/placement/duration and command reference are observable.
  });

  test('renders hatch wait with viewer name, countdown, and queue position', async () => {
    // Real ChatView DOM contains all three fields in the upper-third detail.
  });
  ```

- [ ] **Step 2: Run the new test and verify RED**

  Run:

  ```powershell
  & '..\..\..\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' `
    --runInBand --runTestsByPath `
    test/streammonsters-egg-shelf-portrait-reliability.test.js
  ```

  Expected: preview identity changes, public labels repeat `!adopt`, expired
  rows remain, and portrait CSS expands egg-offer cards to the generic minimum.

- [ ] **Step 3: Stabilize keyed shelf rendering**

  In `streammonsters-egg-stage-view.js`:

  - filter `expired` from `buildShelfModel`;
  - show public expiry as a compact localized countdown;
  - maintain the overflow preview and count nodes by key, updating them in
    place on one-second countdown ticks;
  - replace per-egg adopt callouts with one `data-egg-adopt-summary` element;
  - keep landing/jump/shake classes and timers intact across ordinary renders;
  - retain rotation only on the existing three-second rotation timer.

- [ ] **Step 4: Fit the documented portrait band**

  In `streammonsters-overlay.html`:

  - keep the shelf bottom edge at the 26-percent safe-zone boundary;
  - constrain the compact portrait shelf height so its top is no lower than
    66 percent of a 477×829 viewport;
  - use short, non-overlapping timing pills and one centered adopt summary;
  - exclude `data-presentation="egg-offer"` from the generic portrait
    `min-height:250px` rule;
  - keep compact offer cards at the upper third with readable type;
  - do not change battle arena geometry.

- [ ] **Step 5: Remove redundant and unreachable lifecycle presentation**

  - Let `egg_landed` update shelf state without a second ownership card after
    the existing `egg_spawned` reveal.
  - Present the new projected `egg_expired` event once with localized rotten
    copy.
  - Keep reserved/public notices at five seconds and coalescible.
  - Ensure hatch wait stays above Likes/chat and never displays a numeric ID or
    empty unknown avatar.
  - Add complete DE/EN/ES/FR strings for the compact public countdown, adopt
    summary, reservation, public release, expiry, and hatch-wait copy.

- [ ] **Step 6: Run focused UI tests and verify GREEN**

  Run:

  ```powershell
  & '..\..\..\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' `
    --runInBand --runTestsByPath `
    test/streammonsters-egg-shelf-portrait-reliability.test.js `
    test/streammonsters-egg-lifecycle-presenter-v111.test.js `
    test/streammonsters-egg-stage-animation-v111.test.js `
    test/streammonsters-egg-shelf-autohatch-v111.test.js `
    test/streammonsters-overlay-chat-v15.test.js `
    test/streammonsters-overlay-language-v111.test.js
  ```

  Expected: all listed suites pass.

- [ ] **Step 7: Commit**

  ```powershell
  git add -- app/plugins/streamalchemy/streammonsters-egg-stage-view.js `
    app/plugins/streamalchemy/streammonsters-overlay.html `
    app/plugins/streamalchemy/streammonsters-chat-view.js `
    app/locales/de.json app/locales/en.json app/locales/es.json app/locales/fr.json `
    app/test/streammonsters-egg-shelf-portrait-reliability.test.js
  git commit -m "fix(streammonsters): clarify portrait egg shelf"
  ```

---

### Task 4: Integrated verification and release-ready handoff

**Files:**
- Modify only if verification exposes a regression covered by a failing test.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: verified branch evidence; no live integration or reload.

- [ ] **Step 1: Run the complete focused regression set**

  From `app/`, run all Stream Monsters adoption, gift, shelf, chat, GCCE,
  reconnect, identity, public-event, and route-security suites:

  ```powershell
  & '..\..\..\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' `
    --runInBand --runTestsByPath `
    test/streammonsters-free-egg-lifecycle-reliability.test.js `
    test/streammonsters-egg-overlay-state-reliability.test.js `
    test/streammonsters-egg-shelf-portrait-reliability.test.js `
    test/streammonsters-free-egg-drops-v6.test.js `
    test/streammonsters-egg-stage-v110.test.js `
    test/streammonsters-gift-egg-loop-v15.test.js `
    test/streammonsters-command-ingress-dedupe-v1111.test.js `
    test/streammonsters-gcce-v15.test.js `
    test/streammonsters-gcce-tts-v110.test.js `
    test/streammonsters-overlay-critical-queue-v15.test.js `
    test/streammonsters-overlay-reconnect-v15.test.js `
    test/streammonsters-egg-lifecycle-presenter-v111.test.js `
    test/streammonsters-egg-stage-animation-v111.test.js `
    test/streammonsters-egg-shelf-autohatch-v111.test.js `
    test/streammonsters-overlay-chat-v15.test.js `
    test/streammonsters-identity-avatar-v110.test.js `
    test/streammonsters-public-events-v15.test.js `
    test/streammonsters-routes-security.test.js
  ```

- [ ] **Step 2: Run static verification**

  ```powershell
  npm run lint -- --quiet
  npm run build:css
  git diff --check
  ```

- [ ] **Step 3: Perform isolated browser acceptance**

  Start an isolated safe-mode server from the feature worktree on a free port,
  never port 3000, with a temporary database. In Playwright, validate:

  - 477×829 and 1080×1920 shelf placement;
  - five public eggs plus overflow;
  - countdown tick without node replacement;
  - reservation, public, claim, ready, expiry, and hatch-wait demos;
  - no shelf/likes collision and no repeated landing animation.

  Stop only the isolated process after capture.

- [ ] **Step 4: Run whole-branch review**

  Review the full diff from `f48f825a` for lifecycle correctness, migration
  safety, privacy, event dedupe, timer cleanup, reconnect consistency, and
  portrait readability. Fix every Critical or Important finding through a new
  failing test and scoped re-review.

- [ ] **Step 5: Leave the branch ready for explicit integration**

  Do not merge, push, reload, or restart. Report the feature branch, commits,
  exact verification counts, browser evidence, and any unrelated baseline
  failures. Runtime activation requires a separate user instruction after the
  stream is confirmed ended.
