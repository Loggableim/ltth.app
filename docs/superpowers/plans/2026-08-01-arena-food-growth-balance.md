# Arena Food Pacing and Growth Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ambient Arena food spawn waves with a calm one-dot cadence and allow absorb winners to grow to mass 666.

**Architecture:** Keep Arena authoritative: `ArenaGame` owns defaults, legacy normalization, refill cadence, entity lifetimes, and absorb rewards; `main.js` mirrors the legacy normalization for admin/config API responses. The overlay only converts existing food timestamps into a slower visual fade, while `ui.html` constrains the existing food controls to values that cannot recreate a spawn wave.

**Tech Stack:** Node.js CommonJS, Jest, HTML Canvas/Pixi overlay, Game Engine plugin configuration.

## Global Constraints

- Ambient defaults: `maxFood: 72`, `maxFoodRender: 66`, `foodSpawnIntervalMs: 2400`, `foodSpawnBatchSize: 1`, and `foodDespawnMs: 150000`.
- Ambient food fades in over 1400 ms and fades out during its last 48000 ms; combat food sources retain their current behavior.
- Effective migration raises former standard caps `90`, `140`, `170`, `260`, and `520` to `maxMass: 666`.
- A saved `foodSpawnBatchSize` above 3 is a legacy noisy profile: migrate it to the ambient defaults. Preserve explicit pacing of one to three dots per spawn.
- Rebase ordinary absorb-reward damping on `config.maxMass`; do not change weapon absorb behavior, death-drop sources, or life conversion.
- Do not restart the app. A Game Engine plugin reload is allowed only after the user explicitly authorizes it.
- Use `runtime\\node\\node.exe` for Jest in this Windows workspace. Preserve unrelated dirty StreamMonsters and documentation changes.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `app/plugins/game-engine/games/arena.js` | Arena defaults, saved-config migration, ambient timing, and absorb-reward damping. |
| `app/plugins/game-engine/main.js` | Mirrors recognized legacy Arena values for config API/dashboard responses. |
| `app/plugins/game-engine/overlay/arena.html` | Uses the authoritative food timestamps for source-specific soft fades. |
| `app/plugins/game-engine/ui.html` | Limits the ambient `Food pro Spawn` field to 1-3. |
| `app/plugins/game-engine/test/arena-engine.test.js` | Regression coverage for defaults, migrations, pacing, fade contract, and absorb growth. |

## Task 1: Add regression coverage for the new balance contract

**Files:**
- Modify: `app/plugins/game-engine/test/arena-engine.test.js:74-85, 2356-2475, 5210-5285, 6900-7020`

**Interfaces:**
- Consumes: `createArena(config, options)`, `movementPlayer(arena, config, username, mass, overrides)`, and `createPlugin()` test fixtures.
- Produces: Executable expectations for the 666 cap, noisy-profile migration, one-dot refill cadence, ambient fade strings, and absorb-reward scaling.

- [ ] **Step 1: Write failing default and migration tests**

  Add these assertions beside the existing default and admin normalization checks:

  ```js
  expect(arena.getConfig()).toEqual(expect.objectContaining({
    maxMass: 666,
    maxFood: 72,
    maxFoodRender: 66,
    foodSpawnIntervalMs: 2400,
    foodSpawnBatchSize: 1,
    foodDespawnMs: 150000
  }));

  const noisy = createArena({
    maxMass: 260,
    maxFood: 130,
    maxFoodRender: 72,
    foodSpawnIntervalMs: 6000,
    foodSpawnBatchSize: 22
  }).arena.getConfig();
  expect(noisy).toEqual(expect.objectContaining({
    maxMass: 666,
    maxFood: 72,
    maxFoodRender: 66,
    foodSpawnIntervalMs: 2400,
    foodSpawnBatchSize: 1
  }));
  ```

  Mirror the same noisy stored profile through `plugin._getConfigWithDefaults('arena', profile)` and assert the same effective values. Add a preservation case with `foodSpawnBatchSize: 3` and `foodSpawnIntervalMs: 5000` to prove intentional low-volume pacing is not overwritten.

- [ ] **Step 2: Run the new tests to verify they fail**

  Run:

  ```powershell
  ..\runtime\node\node.exe node_modules\jest\bin\jest.js --runInBand plugins/game-engine/test/arena-engine.test.js -t "food pacing|noisy|default state"
  ```

  Expected: FAIL because current defaults are 520/130/72/1600/2 and the existing normalizers leave the 260/22 profile intact.

- [ ] **Step 3: Add pacing, fade, and large-absorb failing tests**

  Use a controlled clock to prove exactly one ambient dot appears after 2400 ms and no second dot appears before the next 2400 ms interval:

  ```js
  let now = 1000;
  const { arena } = createArena({ maxFood: 72, maxWeaponPickups: 0 }, { now: () => now });
  arena.food.clear();
  arena.lastFoodSpawnAt = now;
  now += 2400;
  arena.tick(2400);
  expect(arena.food.size).toBe(1);
  now += 1200;
  arena.tick(1200);
  expect(arena.food.size).toBe(1);
  ```

  Add overlay contract expectations for `1400` and `48000` in `foodOpacityFor`. Create a 320-mass predator and a 120-mass prey under `maxMass: 666`, resolve their collision, and assert the predator grows above 400 while the prey is eliminated. This fails under the old fixed-260 damping curve.

- [ ] **Step 4: Run the focused red suite**

  Run:

  ```powershell
  ..\runtime\node\node.exe node_modules\jest\bin\jest.js --runInBand plugins/game-engine/test/arena-engine.test.js -t "food pacing|ambient refill|absorb reward|large growth|overlay rendering contract"
  ```

  Expected: FAIL only at the newly added contract expectations.

## Task 2: Implement authoritative defaults and safe legacy migration

**Files:**
- Modify: `app/plugins/game-engine/games/arena.js:150-260, 7645-7780`
- Modify: `app/plugins/game-engine/main.js:1230-1300`

**Interfaces:**
- Consumes: Stored Arena config object and `ArenaGame.DEFAULT_CONFIG`.
- Produces: The same effective 666 / calm-food values in `ArenaGame.getConfig()` and `GameEnginePlugin._getConfigWithDefaults('arena', stored)`.

- [ ] **Step 1: Set the new authoritative Arena defaults**

  In `DEFAULT_CONFIG`, set:

  ```js
  maxFood: 72,
  maxFoodRender: 66,
  maxMass: 666,
  foodSpawnIntervalMs: 2400,
  foodSpawnBatchSize: 1,
  foodDespawnMs: 150000,
  ```

- [ ] **Step 2: Add one shared-style legacy predicate in each normalizer**

  In both `ArenaGame._normalizeConfig(config, stored)` and
  `GameEnginePlugin._normalizeArenaConfigDefaults(config, stored)`, implement
  the same exact rules without changing custom low-volume values:

  ```js
  const legacyMassCaps = [90, 140, 170, 260, 520];
  const noisyAmbientProfile = Number(stored?.foodSpawnBatchSize) > 3;

  if (legacyMassCaps.includes(Number(stored?.maxMass))) {
    config.maxMass = DEFAULT_CONFIG.maxMass; // main.js uses this.defaultConfigs.arena.maxMass
  }
  if (noisyAmbientProfile) {
    config.foodSpawnIntervalMs = DEFAULT_CONFIG.foodSpawnIntervalMs;
    config.foodSpawnBatchSize = DEFAULT_CONFIG.foodSpawnBatchSize;
  }
  if (Number(stored?.maxFood) === 130) config.maxFood = DEFAULT_CONFIG.maxFood;
  if (Number(stored?.maxFoodRender) === 72) config.maxFoodRender = DEFAULT_CONFIG.maxFoodRender;
  ```

  Keep the existing invalid-number fallbacks after these rules. In `main.js`,
  use `this.defaultConfigs.arena` for every replacement. Do not write to the
  database from a GET/config-normalization path.

- [ ] **Step 3: Run the migration tests to verify they pass**

  Run:

  ```powershell
  ..\runtime\node\node.exe node_modules\jest\bin\jest.js --runInBand plugins/game-engine/test/arena-engine.test.js -t "food pacing|noisy|default state|admin config"
  ```

  Expected: PASS; legacy 260/22/130/72 resolves to 666/1/72/66 in both paths, while the three-dot custom case is preserved.

- [ ] **Step 4: Commit the authoritative configuration slice**

  ```powershell
  git add app/plugins/game-engine/games/arena.js app/plugins/game-engine/main.js app/plugins/game-engine/test/arena-engine.test.js
  git commit -m "feat(arena): calm ambient food defaults"
  ```

## Task 3: Implement source-specific food fading and safe dashboard bounds

**Files:**
- Modify: `app/plugins/game-engine/games/arena.js:3280-3290`
- Modify: `app/plugins/game-engine/overlay/arena.html:2013-2025`
- Modify: `app/plugins/game-engine/ui.html:3284-3290`
- Modify: `app/plugins/game-engine/test/arena-engine.test.js:7135-7180, 7560-7570`

**Interfaces:**
- Consumes: Food entity `source`, `spawnedAt`, `expiresAt`, and `fadeOutMs` serialized by Arena.
- Produces: Ambient entities with a 48000 ms fade window, 1400 ms visual fade-in, and an admin input that cannot produce a large ambient wave.

- [ ] **Step 1: Implement the ambient-only fade window in Arena**

  Make `_foodFadeOutMs(source, config)` return 48000 for `source === 'ambient'`. Keep the existing `life-drop` branch and the existing lifetime-derived branch for all other sources:

  ```js
  if (normalizedSource === 'ambient') return 48000;
  ```

  Ambient food created by `spawnFood()` already receives `fadeOutMs` from this method; no new entity field or API is required.

- [ ] **Step 2: Implement the overlay fade-in by source**

  In `foodOpacityFor(food, now, baseOpacity)`, replace the fixed 600 ms
  spawn duration with a source-aware value:

  ```js
  const spawnFadeMs = food.source === 'ambient' ? 1400 : 600;
  const spawnEase = clampNumber(ageMs / spawnFadeMs, 0, 1, 1);
  ```

  Preserve the current source-specific fade floor for life drops. The overlay
  reads `food.fadeOutMs`, so the 48000 ms ambient fade supplied by the server
  is used without a second hard-coded ambient fade duration.

- [ ] **Step 3: Restrict dashboard batch input and add contract assertions**

  Change the existing input to:

  ```html
  <input type="number" id="arena-food-spawn-batch-size" min="1" max="3" step="1">
  ```

  Add static overlay/UI contract expectations for `spawnFadeMs`, `1400`,
  `48000`, and `max="3"` alongside the existing Arena overlay/admin
  contract tests.

- [ ] **Step 4: Run the focused green suite**

  Run:

  ```powershell
  ..\runtime\node\node.exe node_modules\jest\bin\jest.js --runInBand plugins/game-engine/test/arena-engine.test.js -t "food pacing|ambient refill|overlay rendering contract|admin and backend integration"
  ```

  Expected: PASS; ambient food has one-dot cadence plus 1400/48000 fade data, and combat sources retain their existing burst timing.

- [ ] **Step 5: Commit the fade and admin-bound slice**

  ```powershell
  git add app/plugins/game-engine/games/arena.js app/plugins/game-engine/overlay/arena.html app/plugins/game-engine/ui.html app/plugins/game-engine/test/arena-engine.test.js
  git commit -m "feat(arena): soften ambient food lifecycle"
  ```

## Task 4: Rebase absorb-reward damping for 666-mass play

**Files:**
- Modify: `app/plugins/game-engine/games/arena.js:3638-3678`
- Modify: `app/plugins/game-engine/test/arena-engine.test.js:5210-5285`

**Interfaces:**
- Consumes: `config.maxMass`, predator/prey mass, and existing absorb ratios.
- Produces: `ArenaGame._absorbRewardContext()` that defers ordinary reward damping beyond the former 260 ceiling while preserving existing weapon rewards and death-food multipliers.

- [ ] **Step 1: Confirm the new large-absorb test is red**

  Run:

  ```powershell
  ..\runtime\node\node.exe node_modules\jest\bin\jest.js --runInBand plugins/game-engine/test/arena-engine.test.js -t "large growth|rewards kills|damps direct rewards"
  ```

  Expected: the new 320-versus-120 case fails its post-kill mass threshold because the current code clamps `balanceCap` to 260.

- [ ] **Step 2: Remove the obsolete fixed 260 reward ceiling**

  In `_absorbRewardContext`, replace:

  ```js
  const balanceCap = Math.min(maxMass, 260);
  ```

  with:

  ```js
  const balanceCap = maxMass;
  ```

  Do not modify the weapon branch, `rewardDamping` formula, life steal
  minima, or death-food multipliers. Those mechanics now scale over the 666
  range through the existing `balanceCap` references.

- [ ] **Step 3: Run the absorb regression set**

  Run:

  ```powershell
  ..\runtime\node\node.exe node_modules\jest\bin\jest.js --runInBand plugins/game-engine/test/arena-engine.test.js -t "larger overlapping players|rewards kills|damps direct rewards|large growth"
  ```

  Expected: PASS; the high-mass predator grows beyond 400, normal kill/drop
  behavior remains present, and near-cap damping still has coverage.

- [ ] **Step 4: Commit the growth slice**

  ```powershell
  git add app/plugins/game-engine/games/arena.js app/plugins/game-engine/test/arena-engine.test.js
  git commit -m "feat(arena): extend absorb growth to mass 666"
  ```

## Task 5: Verify the complete Arena contract and live-safe handoff

**Files:**
- Verify: `app/plugins/game-engine/games/arena.js`
- Verify: `app/plugins/game-engine/main.js`
- Verify: `app/plugins/game-engine/overlay/arena.html`
- Verify: `app/plugins/game-engine/ui.html`
- Verify: `app/plugins/game-engine/test/arena-engine.test.js`

**Interfaces:**
- Consumes: The completed configuration, food lifecycle, rendering, and absorb behavior from Tasks 2-4.
- Produces: Evidence that the full Arena suite is green and a clearly bounded optional live activation procedure.

- [ ] **Step 1: Run full focused Arena verification**

  ```powershell
  cd app
  ..\runtime\node\node.exe node_modules\jest\bin\jest.js --runInBand plugins/game-engine/test/arena-engine.test.js
  ..\runtime\node\node.exe node_modules\eslint\bin\eslint.js plugins/game-engine/games/arena.js plugins/game-engine/main.js plugins/game-engine/test/arena-engine.test.js
  cd ..
  git diff --check
  ```

  Expected: the full focused Arena suite passes, ESLint reports no findings,
  and `git diff --check` reports no whitespace errors.

- [ ] **Step 2: Inspect configuration without changing live gameplay**

  Use only read requests first:

  ```powershell
  Invoke-RestMethod http://127.0.0.1:3000/api/game-engine/arena/state |
    Select-Object -ExpandProperty config |
    Select-Object maxMass,maxFood,maxFoodRender,foodSpawnIntervalMs,foodSpawnBatchSize,foodDespawnMs
  ```

  Expected after an authorized plugin reload: `666, 72, 66, 2400, 1, 150000` for migrated defaults; a legitimate low-volume custom food profile may retain its explicit 1-3 cadence.

- [ ] **Step 3: Request explicit live activation permission before reloading**

  Do not send a reload request in this task. Ask the user whether the Game
  Engine plugin may be reloaded. Never restart the application.

- [ ] **Step 4: After explicit approval, reload only Game Engine and visually verify**

  ```powershell
  Invoke-RestMethod -Method Post http://127.0.0.1:3000/api/plugins/game-engine/reload
  ```

  Reload the Arena overlay in the in-app browser. Confirm a newly created
  ambient dot fades in instead of appearing as a wave, an aging ambient dot
  fades toward zero opacity, and the configured mass cap is 666. Do not call
  `test-activity`, reset endpoints, or any API that changes a live match.

- [ ] **Step 5: Report commit IDs and reload evidence**

  Report the focused-test totals, lint/diff result, exactly which files were
  committed, whether the user authorized a plugin-only reload, and the live
  config values observed after that reload.
