# Arena Mass 2000 and Full Shield Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mass 2000 reachable, make large players progressively slower, and make both direct and pickup shields fully prevent player absorption.

**Architecture:** Keep the simulation server-authoritative in `arena.js`. Add one shield-protection predicate and one collision-separation helper shared by normal, Dash, and Chainsaw absorption. Keep the overlay passive: it renders state and player-specific feedback emitted by the simulation.

**Tech Stack:** CommonJS Node.js, Jest, Socket.IO, Canvas/Pixi overlay, PowerShell on Windows.

## Global Constraints

- Standard caps are exactly `maxMass: 2000` and `maxLives: 1250000`.
- Migrate only complete known profiles: `999 / 320000 / 1 / 1` and the local `999 / 22000 / 1 / 1`; preserve partial/custom profiles.
- The direct shield and active shield pickup prevent normal absorption, Dash, and Chainsaw; a pickup does not gain generic damage immunity.
- A rejected direct shield command produces short player-specific cooldown feedback.
- Do not restart the app. Reload only the `game-engine` plugin after focused verification and the local commit.
- Use `runtime/node/node.exe` for tests.

---

### Task 1: Couple the 2000 mass cap to lives and movement

**Files:**

- Modify: `app/plugins/game-engine/games/arena.js:DEFAULT_CONFIG, _normalizeConfig(), _movementMassMultiplier()`
- Modify: `app/plugins/game-engine/main.js:_normalizeArenaConfigDefaults()`
- Test: `app/plugins/game-engine/test/arena-engine.test.js`

**Interfaces:**

- Produces: `getConfig()` returns `maxMass: 2000`, `maxLives: 1250000` for known complete profiles.
- Produces: `_movementMassMultiplier(player, config)` stays monotone decreasing above base mass and approaches `0.25` at mass 2000.

- [ ] **Step 1: Write failing cap and migration tests**

  Add Jest cases for a default config at 2000/1250000, both complete 999 profiles migrating to that pair, and a partial custom profile remaining unchanged.

- [ ] **Step 2: Run the targeted tests to verify failure**

  Run: `cd app; ..\\runtime\\node\\node.exe node_modules\\jest\\bin\\jest.js --runInBand plugins/game-engine/test/arena-engine.test.js -t "2000|999.*profile"`

  Expected: failure because the default is currently 999/320000 and the 999 profiles are not migrated.

- [ ] **Step 3: Implement the coupled cap migration**

  Set the new defaults and recognize only the exact complete profiles. Do not migrate a profile whose absorb ratios or either cap differs from the known values.

- [ ] **Step 4: Write failing speed checkpoint tests**

  Assert the unarmed neutral multiplier is monotonically decreasing at masses 18, 100, 250, 500, 1000, and 2000, with approximate targets 1.00, 0.78, 0.63, 0.51, 0.38, and 0.25.

- [ ] **Step 5: Implement logarithmic size drag and rerun tests**

  Replace the above-base linear normalized range with logarithmic progress `log(mass/baseMass) / log(maxMass/baseMass)`, apply exponent `1.2`, and map it to the configured minimum multiplier. Keep the existing below-base boost branch.

- [ ] **Step 6: Commit the isolated simulation cap/balance slice**

  Stage only `arena.js`, `main.js`, and `arena-engine.test.js` if no later task needs them in the same atomic commit.

### Task 2: Make both shield sources fully block absorption

**Files:**

- Modify: `app/plugins/game-engine/games/arena.js:_tryResolveAbsorption(), _tryResolveChainsawCollision(), _playerAbsorbContext()`
- Test: `app/plugins/game-engine/test/arena-engine.test.js`

**Interfaces:**

- Produces: `_hasAbsorptionShield(player, now)` returns true for active direct shield or active `weapon.type === 'shield'`.
- Produces: `_separateShieldedCollision(predator, protectedPlayer, config)` leaves both players in bounds and emits no kill/reward.

- [ ] **Step 1: Write failing direct-shield collision tests**

  Cover both player-pair iteration orders and assert an active `abilities.shield.activeUntil` prevents normal absorption, Dash, and Chainsaw without changing lives, mass, kills, or player membership.

- [ ] **Step 2: Write failing pickup-shield collision tests**

  Give the prey an unexpired shield pickup, cover the same three attack types, and assert it is protected. Add an expiry case proving absorption resumes after `weapon.expiresAt`.

- [ ] **Step 3: Implement one protection predicate and separation helper**

  Use `_isShieldActive()` plus `_isWeaponActive(player.weapon, now)` to identify protected prey. On a valid collision, move the protected player outside the predator radius plus its radius and a small safety margin, constrain to arena bounds, and point its velocity outward. Do not apply this to non-collision threat evaluation.

- [ ] **Step 4: Route normal, Dash, and Chainsaw paths through the helper**

  Guard before every absorption reward or chainsaw hit cooldown. Remove the old pickup-only mass-ratio modifier so the two shield sources use the same all-or-nothing absorption contract.

- [ ] **Step 5: Run the focused shield tests**

  Run: `cd app; ..\\runtime\\node\\node.exe node_modules\\jest\\bin\\jest.js --runInBand plugins/game-engine/test/arena-engine.test.js -t "shield.*absorb|absorb.*shield|Chainsaw"`

  Expected: all new shield cases pass and existing direct-damage behavior remains unchanged.

### Task 3: Make active shield state and failed command feedback visible

**Files:**

- Modify: `app/plugins/game-engine/games/arena.js:handleAbilityCommand()`
- Modify: `app/plugins/game-engine/overlay/arena.html:Pixi and Canvas player rendering, socket listeners`
- Test: `app/plugins/game-engine/test/arena-engine.test.js`

**Interfaces:**

- Produces: `arena:ability-feedback` payload `{ username, ability, success, remainingMs, expiresAt, timestamp }` for an ability attempt.
- Consumes: player `abilities.shield.active` from serialized state and the feedback payload.

- [ ] **Step 1: Write failing event and overlay-contract tests**

  Assert a shield attempt during cooldown emits `arena:ability-feedback` with a positive `remainingMs`. Assert the overlay source has an active-shield aura branch and a bounded feedback cache/listener.

- [ ] **Step 2: Emit feedback for successful and rejected shield attempts**

  Retain the existing `arena:ability-activated` event on success. On cooldown, emit the feedback event before returning the existing error; on success emit a positive feedback payload with `expiresAt`.

- [ ] **Step 3: Render the state distinctly in both renderers**

  Keep charge arcs as cooldown progress. Add a solid, pulsing blue aura only while `abilities.shield.active`. Keep the shield-pickup hexagon unchanged. Store feedback by username with a short expiry and draw `SCHILD: Ns CD` near that player without permanently adding HUD clutter.

- [ ] **Step 4: Run overlay and event tests**

  Run: `cd app; ..\\runtime\\node\\node.exe node_modules\\jest\\bin\\jest.js --runInBand plugins/game-engine/test/arena-engine.test.js -t "shield.*feedback|shield.*aura|ability"`

### Task 4: Integrate, verify, commit, and hot reload only the plugin

**Files:**

- Modify: `docs/superpowers/plans/2026-08-02-arena-mass-2000-shield-protection.md` (check completed tasks)

- [ ] **Step 1: Review the complete Arena diff**

  Run: `git diff --check` and inspect `git diff -- app/plugins/game-engine/games/arena.js app/plugins/game-engine/main.js app/plugins/game-engine/overlay/arena.html app/plugins/game-engine/test/arena-engine.test.js`.

- [ ] **Step 2: Run focused verification**

  Run: `cd app; ..\\runtime\\node\\node.exe node_modules\\jest\\bin\\jest.js --runInBand plugins/game-engine/test/arena-engine.test.js` and `npx eslint plugins/game-engine/games/arena.js plugins/game-engine/main.js`.

- [ ] **Step 3: Commit the approved implementation to local main**

  Stage only the Arena source, test, spec, and plan files. Commit with a single feature-focused message. Do not push.

- [ ] **Step 4: Hot reload only Game Engine**

  POST to `http://127.0.0.1:3000/api/plugins/game-engine/reload`; do not stop or restart the application.

- [ ] **Step 5: Verify the running plugin read-only**

  GET `/api/game-engine/config/arena` and `/api/game-engine/arena/state`; confirm `maxMass` is 2000, `maxLives` is 1250000, and the endpoint stays healthy.
