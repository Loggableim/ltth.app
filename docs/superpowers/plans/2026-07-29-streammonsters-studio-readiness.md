# Stream Monsters Studio Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the selected professional-readiness patches as a compatible Stream Monsters 1.12.0 release candidate: one product contract, non-gambling arena language, subscriber-only positioning, calibrated portrait profiles, persistent onboarding, faster roster locking, correct free-egg quest credit, audience-scaled missions, a clear post-match report, and a substantially smaller runtime package.

**Architecture:** Keep `streamalchemy` and Rules v8 stable. Additive services and schema changes own viewer onboarding and population-aware missions. The battle service remains authoritative for results and emits one sanitized combat report. A versioned product contract drives release/default/access metadata and is checked against all projections. Existing user layout tuning remains independent from a fixed TikTok portrait geometry profile. Runtime monster art moves from manifest-verified PNG to manifest-verified WebP with a compatibility reader for older PNG manifests.

**Tech Stack:** CommonJS, Express, Socket.IO, SQLite through existing prepared-statement helpers, Jest/JSDOM, vanilla HTML/CSS/JavaScript, Canvas2D/WebGPU overlay, Python/Pillow asset tooling, deterministic ZIP packaging.

## Global Constraints

- Preserve the stable plugin ID `streamalchemy`, existing saves, legacy replays, gift fairness, sealed A/B/C choices, and the rule that only fighters can answer A/B/C.
- Never expose raw numeric viewer IDs, provider data, secrets, or private external avatar URLs.
- Do not modify or reload the running LTTH instance during this implementation pass.
- Do not merge, push, or alter the dirty main checkout. Work only in `codex/streammonsters-studio-readiness`.
- Start every behavior change with a focused failing test, then implement the smallest passing change.
- Use the bundled Node 22 / ABI 127 runtime for native tests.
- Preserve every historical Stream Monsters ZIP byte-for-byte.

---

## Task 1: Establish the Product Contract and Subscriber-Only Positioning

**Files**

- Create: `app/plugins/streamalchemy/product-contract.json`
- Create: `scripts/sync-streammonsters-product.js`
- Modify: `app/plugins/streamalchemy/plugin.json`
- Modify: `app/plugins/streamalchemy/index.js`
- Modify: `plugin-store.json`
- Modify: `scripts/plugin-guides/streamalchemy.js`
- Modify: `streammonsters/index.html`
- Modify: `js/streammonsters-guide.js`
- Modify: `app/CHANGELOG.md`
- Test: `app/test/streammonsters-product-contract.test.js`
- Test: `app/test/plugin-store-registry.test.js`
- Test: `app/test/streammonsters-public-guide-rules-v8.test.js`

- [ ] Write failing tests that require a versioned contract containing product ID/name/version, Rules version, arena label, subscriber access, hatch default, portrait mode/profile, locale set, and package filename.
- [ ] Require `sync-streammonsters-product.js --check` to fail when plugin manifest, Store projection, guide projection, or current release notes drift from the contract.
- [ ] Add contract version `1`, current plugin version `1.11.1`, next release `1.12.0`, Rules version `8`, arena name “Arcade Clash”, and explicit “included with an active LTTH subscription” copy in all four locales. Task 8 atomically promotes the current version after its package exists.
- [ ] Keep `pricing.type: "free"` as “no separate plugin purchase” while retaining `access.type: "subscriber"` and the `subscriber-only` badge.
- [ ] Replace every live “Jackpot Clash” label with “Arcade Clash”; preserve internal legacy replay function names and old historical package data.
- [ ] Consume contract defaults from `index.js` instead of duplicating new-install hatch/portrait defaults.
- [ ] Generate/check the plugin manifest, Store entry, guide metadata, and public presentation projection deterministically.
- [ ] Run the three focused suites and the sync script in check mode.
- [ ] Commit this task independently.

## Task 2: Add a Calibrated TikTok Portrait Overlay Profile

**Files**

- Modify: `app/plugins/streamalchemy/index.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/routes.js`
- Modify: `app/plugins/streamalchemy/streammonsters-creator-runtime.js`
- Modify: `app/plugins/streamalchemy/streammonsters-ui.html`
- Modify: `app/plugins/streamalchemy/streammonsters-overlay-runtime.js`
- Modify: `app/plugins/streamalchemy/streammonsters-overlay.html`
- Modify: `app/plugins/streamalchemy/locales/{de,en,es,fr}.json`
- Test: `app/test/streammonsters-config-v111.test.js`
- Test: `app/test/streammonsters-creator-runtime.test.js`
- Test: `app/test/streammonsters-overlay-layout-queue.test.js`
- Test: `app/test/streammonsters-creator-ui-v15.test.js`

**Interface**

```js
overlayProfiles: {
  portrait: {
    preset: 'tiktok-live-studio-1080x1920',
    width: 1080,
    height: 1920,
    gameplayHeightPercent: 74,
    chatSafeZone: { x: 0, y: 74, width: 100, height: 26 },
    contentInsetPercent: { top: 0, right: 0, bottom: 26, left: 0 }
  }
}
```

- [ ] Write failing normalization tests for legacy config, malformed geometry, profile persistence, and independent preservation of existing `layouts`.
- [ ] Write failing Creator/overlay tests for exact 1080×1920 and 74/26 geometry, URL anchor/scale precedence, and immutable battle placement.
- [ ] Add a strict fixed-profile normalizer. Invalid or missing values fall back to the canonical profile; safe-zone coordinates are not freely editable.
- [ ] Keep existing portrait/landscape anchors and 70–130% scales as the creator’s calibration controls.
- [ ] Add the profile selector, read-only geometry summary, and profile-derived collision preview to Overlay Studio.
- [ ] Feed profile geometry into diagnostics/CSS variables while retaining the same battle timeline and Canvas/WebGPU paths.
- [ ] Localize all new labels in German, English, Spanish, and French.
- [ ] Run focused config, Creator, layout queue, and overlay suites.
- [ ] Commit this task independently.

## Task 3: Persist a Per-Viewer First-Session Journey

**Files**

- Create: `app/plugins/streamalchemy/backend/streammonsters/viewer-onboarding-service.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/database.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/tutorial-hint-director.js`
- Modify: `app/plugins/streamalchemy/index.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/routes.js`
- Modify: `app/plugins/streamalchemy/locales/{de,en,es,fr}.json`
- Test: `app/test/streammonsters-viewer-onboarding.test.js`
- Test: `app/test/streammonsters-creator-retention-v6.test.js`

**Persistent first-session steps**

```text
egg_received -> egg_hatched -> monster_selected -> battle_joined ->
battle_completed
```

- [ ] Write failing migration, idempotency, resume, completion, and sanitized-state tests.
- [ ] Add an additive `(user_id, step_key)` table with a completion timestamp and a compound primary key; update `viewerDataExists()` so onboarding-only identities remain canonical.
- [ ] Implement `recordStep(viewerId, step, atMs)`, `getJourney(viewerId)`, and `nextStep(viewerId)` with prepared statements and idempotent monotonic updates.
- [ ] Record steps only from already-authoritative egg, hatch, choose, accepted battle, and legitimate completion events. Later stat prompts remain contextual guidance, not a blocker for finishing first-session onboarding.
- [ ] Make tutorial hints viewer-aware: emit only the next incomplete action, never regress, and retain global cooldown/coalescing.
- [ ] Expose only a requesting viewer’s sanitized `{completedSteps,nextStep,complete}` journey, with no viewer identifier.
- [ ] Run focused onboarding, retention, state, and lifecycle tests.
- [ ] Commit this task independently.

## Task 4: Auto-Lock a Sole Eligible Monster

**Files**

- Modify: `app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/chat-commands.js`
- Modify: `app/plugins/streamalchemy/locales/{de,en,es,fr}.json`
- Test: `app/test/streammonsters-battle-match-v5.test.js`
- Test: `app/test/streammonsters-sealed-battle-hints-v6.test.js`

- [ ] Write failing tests for zero, one, and multiple eligible monsters, both participants having one monster, event ordering, reload recovery, and exactly-once roster locking.
- [ ] Reuse the existing eligibility and ownership checks; do not trust a client-provided slot or monster ID.
- [ ] After `battle_match_found` is persisted/emitted, immediately lock a participant only when exactly one eligible monster exists.
- [ ] Start the next phase immediately if both rosters auto-lock; retain the existing eight-second window for participants with multiple choices.
- [ ] Emit the normal roster-locked event with an additive `selectionSource: "sole_eligible"` field and localized explanatory copy.
- [ ] Preserve sealed skill selection and all existing anti-swap/rematch logic.
- [ ] Run battle match, GCCE/raw response, sealed hint, and replay suites.
- [ ] Commit this task independently.

## Task 5: Credit Free Adoption and Scale Stream Missions

**Files**

- Modify: `app/plugins/streamalchemy/backend/streammonsters/progression-service.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/free-egg-drop-service.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/collection-service.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/database.js`
- Modify: `app/plugins/streamalchemy/index.js`
- Modify: `app/plugins/streamalchemy/locales/{de,en,es,fr}.json`
- Test: `app/test/streammonsters-free-egg-drops-v6.test.js`
- Test: `app/test/streammonsters-progression.test.js`
- Test: `app/test/streammonsters-collection-layer.test.js`

**Mission bands**

| Band | Unique active participants | Hatches | Elements | Battles | Heart chain |
|---|---:|---:|---:|---:|---:|
| solo | 1–4 | 2 | 2 | 1 | excluded |
| party | 5–14 | 4 | 3 | 2 | 3 |
| rally | 15+ | 6 | 4 | 3 | 5 |

- [ ] Write failing tests proving a claimed free egg completes `daily:gift` (“Receive an egg”) without incrementing gift-only weekly metrics, Hype, or paid-gift effects.
- [ ] Add `recordEggReceived(userId, streamKey, { source, eventId })`; refactor gift receipt to use it while preserving gift-only effects.
- [ ] Call the progression hook exactly once after a transactional free-egg claim; retries and competing adopters must not double-credit.
- [ ] Write failing tests for deterministic mission choice/target by population band, immutable target after mission creation, and exclusion of Heart Chain in the solo band.
- [ ] Extend the viewer activity tracker with a five-minute unique active-viewer count and persist mission `population_band`, `population_peak`, and effective `target`; preserve all existing legacy missions unchanged.
- [ ] Select the mission once. It may scale upward while progress is still zero, never shrink, and freezes permanently after first progress. Small streams never receive Heart Chain; Heart Chain is otherwise eligible only when a qualifying configured gift path exists.
- [ ] Localize the scaled target/explanation in Creator and overlay state.
- [ ] Run free-egg, progression, collection, atomicity, and migration suites.
- [ ] Commit this task independently.

## Task 6: Add an Authoritative Post-Match Report

**Files**

- Create: `app/plugins/streamalchemy/backend/streammonsters/battle-report.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js`
- Modify: `app/plugins/streamalchemy/streammonsters-arena-view.js`
- Modify: `app/plugins/streamalchemy/streammonsters-overlay.html`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/routes.js`
- Modify: `app/plugins/streamalchemy/locales/{de,en,es,fr}.json`
- Test: `app/test/streammonsters-battle-report.test.js`
- Test: `app/test/streammonsters-battle-rules-v8.test.js`
- Test: `app/test/streammonsters-arena-view-v15.test.js`

**Public payload**

```js
combatReport: {
  roundCount,
  durationMs,
  decisiveSkill: { round, ownerSlot, choice, skillName, skillIcon },
  fighters: [{
    slot,
    playerName,
    monsterName,
    damageDealt,
    damageBlocked,
    healingDone,
    shieldGained,
    specialsUsed,
    hits,
    evades,
    xpAwarded,
    rating: { before, after, delta, eligible }
  }]
}
```

- [ ] Write failing aggregation tests for damage, blocked damage, retaliation, heal, shield, multi-hit, evade, Special, XP, Elo-limited matches, forfeit, double K.-o., and legacy missing-action data.
- [ ] Aggregate exclusively from persisted authoritative actions/results; never infer a winner from overlay HP.
- [ ] Store the report inside the battle result, include it in replay normalization, and project only sanitized display names/monster data.
- [ ] Add the report compatibly to `battle_completed` with a stable correlation/event ID, and classify completion as critical so reconnect replays the result once.
- [ ] Render an upper-safe-zone result board for at least eight seconds: K.-o./forfeit reason, winner, round, remaining HP, Elo changes, and concise fighter totals.
- [ ] Provide resilient legacy fallback copy when no report exists.
- [ ] Localize labels and ensure 477×829 and 1080×1920 layouts do not clip.
- [ ] Run report, battle, arena, reconnect, privacy, and demo suites.
- [ ] Commit this task independently.

## Task 7: Convert Bundled Runtime Monster Art to Verified WebP

**Files**

- Create: `scripts/build-streammonsters-runtime-assets.py`
- Modify: `app/plugins/streamalchemy/assets/streammonsters/furry/manifest.json`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/asset-registry.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/routes.js`
- Modify: `scripts/build-streamalchemy-package.py`
- Modify: `scripts/build_streammonsters_public_catalog.js`
- Modify: `.gitignore` only if a generated staging path needs exclusion
- Replace: 72 runtime Furry PNG files with 72 manifest-listed WebP files
- Test: `app/test/streammonsters-assets-v15.test.js`
- Test: `app/test/streammonsters-public-catalog.test.js`
- Test: `app/test/streammonsters-package-builder-v15.test.js`

- [ ] Write failing tests that accept a 1024×1024 alpha WebP signature and reject corrupt, opaque, wrong-size, hash-mismatched, or traversal entries.
- [ ] Keep backward-compatible reading of schema-2 PNG manifests for installed legacy packages while emitting a new schema/version for 1.12.0.
- [ ] Add a deterministic Pillow conversion tool using lossless or visually transparent WebP settings, preserving 1024×1024 alpha and all manifest trim/pivot/effect anchors.
- [ ] Build runtime WebPs from canonical PNG source content, regenerate SHA-256/path/media-type fields, and delete only the replaced 1.12.0 source-package PNG copies.
- [ ] Make routes emit the correct `image/webp` content type and retain Kenney fallback for missing/corrupt assets.
- [ ] Require pixel dimensions, alpha coverage, transparent corners, distinct hashes, manifest completeness, and a package-size regression threshold substantially below 1.11.1.
- [ ] Rebuild the public projection from the same asset/version manifest and prove the 24/72/216 catalog contract remains unchanged.
- [ ] Run the slow asset suite with an extended timeout, plus public catalog and deterministic package-builder suites.
- [ ] Commit this task independently.

## Task 8: Build and Verify Stream Monsters 1.12.0

**Files**

- Create: `plugin-store/packages/streamalchemy-1.12.0.zip`
- Modify: `plugin-store.json`
- Modify: `app/plugins/streamalchemy/plugin.json`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/release-map.json`
- Modify: `app/CHANGELOG.md`
- Modify: release/site metadata generated from the product contract
- Test: `app/test/streammonsters-release-v112.test.js`

- [ ] Write the release test first: exact version alignment, Store URL/hash, source-package parity, deterministic rebuild, historical ZIP hashes unchanged, subscriber access, and no live gambling label.
- [ ] Atomically promote `product-contract.json` from current `1.11.1` to `1.12.0`, generate the package from that exact source state, and update every contract projection.
- [ ] Verify all selected feature suites with bundled Node 22 / ABI 127.
- [ ] Run `npm run lint`, `npm run build:css`, `git diff --check`, product sync `--check`, asset validation, package hash/parity, and a bounded full Jest run.
- [ ] Run deterministic portrait/landscape Creator and overlay demos without touching the live runtime.
- [ ] Request an independent whole-branch review; fix every blocker with a new failing regression test.
- [ ] Record exact pass/fail/timeout evidence and remaining unrelated baseline failures.
- [ ] Commit the verified release candidate. Do not merge, push, reload, or restart without a separate user instruction.
