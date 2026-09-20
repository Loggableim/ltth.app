# Arena Live Balance Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Arena balance, protection, bomb/mine, weapon-AI, pickup, food, and readable control changes.

**Architecture:** Keep `arena.js` server-authoritative. Defaults and migrations live in both Arena configuration normalizers; the overlay consumes serialized state and keeps command help in the lower rotator. Tests exercise real Arena methods with deterministic clock/random dependencies.

**Tech Stack:** CommonJS, Jest, Socket.IO, Canvas/Pixi overlay.

## Global Constraints

- Default mass/lives are exactly 6500/13100000; maximum-mass movement is 0.25.
- Bombs use random cardinal direction and apply a nonlethal exact 50 percent mass loss to each eligible victim.
- Reload only `game-engine` after commit; never restart the app.

---

### Task 1: Physical 6500 cap and full absorption shields

**Files:**
- Modify: `app/plugins/game-engine/games/arena.js:DEFAULT_CONFIG,_movementMassMultiplier,_tryResolveAbsorption,_tryResolveChainsawCollision,_playerAbsorbContext`
- Modify: `app/plugins/game-engine/main.js:_normalizeArenaConfigDefaults`
- Test: `app/plugins/game-engine/test/arena-engine.test.js`

**Interfaces:**
- Produces `_hasAbsorptionShield(player, now)` for direct and unexpired pickup shields.
- Produces default `maxMass: 6500`, `maxLives: 13100000` and a monotone size multiplier ending at `0.25`.

- [ ] **Step 1: Write failing tests.** Add tests asserting default 6500/13100000, actual radius `Math.sqrt(6500) * 4`, multiplier 0.25 at cap, and that an unexpired `weapon: { type: 'shield', expiresAt }` prevents normal, Dash and Chainsaw absorption.
- [ ] **Step 2: Verify RED.** Run `cd app; ..\\runtime\\node\\node.exe node_modules\\jest\\bin\\jest.js --runInBand plugins/game-engine/test/arena-engine.test.js -t "6500|pickup shield"`; expect the old 999 cap and pickup-shield absorption cases to fail.
- [ ] **Step 3: Implement the smallest shared protection path.** Add:
```js
_hasAbsorptionShield(player, now = this.now()) {
  return this._isShieldActive(player, now) ||
    Boolean(player?.weapon?.type === 'shield' && (!player.weapon.expiresAt || player.weapon.expiresAt > now));
}
```
Guard each absorption path with it, remove the partial `shieldMultiplier`, and use logarithmic progress from base mass to 6500 when mapping to `minMassSpeedMultiplier`.
- [ ] **Step 4: Verify GREEN and commit.** Re-run the focused tests, then commit only the source and test files with `feat(arena): extend physical mass and shield protection`.

### Task 2: Fixed-loss bombs, mines, and redistributed food

**Files:**
- Modify: `app/plugins/game-engine/games/arena.js:_bombRetentionForDistance,_detonateBomb,_spawnFoodBurst,_canConsumeFood`
- Test: `app/plugins/game-engine/test/arena-engine.test.js`

**Interfaces:**
- `_bombRetentionForDistance()` returns `0.5` for every in-range explosion.
- Bomb food has `source: 'bomb'`, a per-piece value, and `excludedUsername` equal to its thrower.

- [ ] **Step 1: Write failing tests.** Assert a victim at center and edge each retains exactly 50 percent (subject to min mass), a random-direction bomb becomes armed if it hits nobody, 45 percent of loss is represented in at most 40 food values, and the owner cannot consume that food while another player can.
- [ ] **Step 2: Verify RED.** Run `cd app; ..\\runtime\\node\\node.exe node_modules\\jest\\bin\\jest.js --runInBand plugins/game-engine/test/arena-engine.test.js -t "bomb.*50|bomb food|armed bomb"`; expect the distance bands and unvalued food to fail.
- [ ] **Step 3: Implement fixed loss and ownership.** Replace the body of `_bombRetentionForDistance` with `return 0.5;`. In `_detonateBomb`, calculate `recoverableMass = totalMassLost * 0.45`, pass `value: recoverableMass / foodCount` and `excludedUsername: bomb.owner` to `_spawnFoodBurst`; preserve the existing max 40 and armed mine flow. In `_canConsumeFood`, return false when `food.excludedUsername === player.username`.
- [ ] **Step 4: Verify GREEN and commit.** Run the focused bomb tests and commit with `feat(arena): make bombs decisive and redistribute mass`.

### Task 3: Offensive-weapon hunting and full frequent pickup defaults

**Files:**
- Modify: `app/plugins/game-engine/games/arena.js:DEFAULT_CONFIG,_selectBehavior,_scoreHuntTarget,_weaponAttackContext,_normalizeWeaponPickupTypes`
- Modify: `app/plugins/game-engine/main.js:_normalizeArenaWeaponPickupTypes`
- Test: `app/plugins/game-engine/test/arena-engine.test.js`

**Interfaces:**
- `_hasOffensiveWeapon(player)` is true only for laser, pulse, freeze, dash, magnet, vampire, missile, mine, blackhole, chainsaw.
- Default pickup pacing is 14/2800/0.85 and all types exist.

- [ ] **Step 1: Write failing tests.** Give an AI a valid laser target plus food and assert hunting wins; assert speed and shield do not force a hunt; assert the default pool contains all 12 types and no single Chainsaw weight exceeds the sum of offensive alternatives.
- [ ] **Step 2: Verify RED.** Run `cd app; ..\\runtime\\node\\node.exe node_modules\\jest\\bin\\jest.js --runInBand plugins/game-engine/test/arena-engine.test.js -t "offensive weapon|pickup pool"`.
- [ ] **Step 3: Implement minimal priority rule.** Define the offensive type set; when it is active and `_scoreHuntTarget` finds a reachable target, choose it before food/wander but after an active lethal flee decision. Set the approved default pacing and weights in both normalizers without overriding explicit custom pools.
- [ ] **Step 4: Verify GREEN and commit.** Re-run the focused tests and commit with `feat(arena): make offensive pickups hunt and diversify`.

### Task 4: Food pacing, lower rotator contract, integration and live handoff

**Files:**
- Modify: `app/plugins/game-engine/games/arena.js:DEFAULT_CONFIG,_maybeSpawnFood,_spawnFoodBurst`
- Modify: `app/plugins/game-engine/overlay/arena.html:rotator cards and optional ability legend`
- Test: `app/plugins/game-engine/test/arena-engine.test.js`

- [ ] **Step 1: Write failing tests.** Assert food spawn batches remain small and lifetime is staggered; assert overlay source has three lower rotator messages containing `!boost`, `!schild`/`!shield`, `!bomb`, and defaults `topOverlayShowAbilityLegend: false`.
- [ ] **Step 2: Verify RED.** Run `cd app; ..\\runtime\\node\\node.exe node_modules\\jest\\bin\\jest.js --runInBand plugins/game-engine/test/arena-engine.test.js -t "food.*despawn|rotator|ability legend"`.
- [ ] **Step 3: Implement only missing deltas.** Keep the low-rate spawn path, assign staggered burst expiry timestamps, retain growth falloff, and render the three readable command cards solely through the lower rotator. Do not enable the upper legend by default.
- [ ] **Step 4: Verify, commit, and reload only the plugin.** Run the full focused Arena suite, `npx eslint plugins/game-engine/games/arena.js plugins/game-engine/main.js`, and `git diff --check`; commit the remaining scoped files. POST `/api/plugins/game-engine/reload`, then GET config/state and confirm the endpoints remain healthy.
