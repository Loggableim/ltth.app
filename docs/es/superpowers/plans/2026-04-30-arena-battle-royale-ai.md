# Arena Battle Royale AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework Live Arena into a scalable battle-royale simulation with utility AI, weighted steering, smarter combat, death drops, and live-event resource influence.

**Architecture:** Keep the existing CommonJS plugin surface and routes. Refactor inside `app/plugins/game-engine/games/arena.js` by adding focused internal helpers for steering signals, collision thresholds, death drops, and event resource spawning without removing existing weapons or overlay events.

**Tech Stack:** Node.js CommonJS, Jest, Socket.IO event payloads, existing Canvas/Pixi overlay.

---

## Snapshot Constraints

This workspace is not a Git checkout. Do not run commit commands. Use focused Jest tests and lint instead.

## Files

- Modify: `app/plugins/game-engine/games/arena.js`
- Modify: `app/plugins/game-engine/test/arena-engine.test.js`
- Optional modify after backend state is stable: `app/plugins/game-engine/overlay/arena.html`

## Tasks

### Task 1: Add battle-royale config and TDD coverage

**Files:**
- Modify: `app/plugins/game-engine/test/arena-engine.test.js`
- Modify: `app/plugins/game-engine/games/arena.js`

- [ ] Step 1: Add failing tests for battle-royale config, eat threshold, like food burst, gift reserve lives, and death drops.

Use these concrete tests in `app/plugins/game-engine/test/arena-engine.test.js` inside `describe('ArenaGame', ...)`:

```js
it('requires a radius advantage before one overlapping ball can eat another', () => {
  const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0, eatRadiusRatio: 1.15 });
  const config = arena.getConfig();
  arena.handleActivity({ uniqueId: 'threshold_attacker', nickname: 'Attacker' }, 'chat');
  arena.handleActivity({ uniqueId: 'threshold_target', nickname: 'Target' }, 'chat');

  const attacker = arena.players.get('threshold_attacker');
  const target = arena.players.get('threshold_target');
  Object.assign(attacker, { x: 200, y: 200, mass: 31 });
  Object.assign(target, { x: 224, y: 200, mass: 29 });
  arena._syncRadius(attacker, config);
  arena._syncRadius(target, config);

  arena._resolvePlayerCollisions(config);

  expect(arena.players.has('threshold_target')).toBe(true);
});

it('drops food particles when a player is absorbed', () => {
  const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0, deathFoodDropCount: 5 });
  const config = arena.getConfig();
  arena.handleActivity({ uniqueId: 'drop_predator', nickname: 'Predator' }, 'chat');
  arena.handleActivity({ uniqueId: 'drop_prey', nickname: 'Prey' }, 'chat');

  const predator = arena.players.get('drop_predator');
  const prey = arena.players.get('drop_prey');
  Object.assign(predator, { x: 300, y: 300, mass: 80 });
  Object.assign(prey, { x: 322, y: 300, mass: 20 });
  arena._syncRadius(predator, config);
  arena._syncRadius(prey, config);

  arena._resolvePlayerCollisions(config);

  expect(arena.players.has('drop_prey')).toBe(false);
  expect(arena.food.size).toBeGreaterThanOrEqual(5);
  expect(Array.from(arena.food.values()).some(food => food.source === 'death-drop')).toBe(true);
});

it('spawns a like food burst around the active viewer', () => {
  const { arena } = createArena({ maxFood: 120, likeFoodSpawnInterval: 1, likeFoodValue: 0.7 });
  arena.handleActivity({ uniqueId: 'like_farmer', nickname: 'Liker' }, 'chat');
  const before = arena.food.size;

  arena.handleActivity({ uniqueId: 'like_farmer', nickname: 'Liker', likeCount: 9 }, 'like');

  expect(arena.food.size).toBeGreaterThan(before);
  expect(Array.from(arena.food.values()).some(food => food.source === 'like')).toBe(true);
});

it('adds extra life reserve metadata when a configured gift grants revives', () => {
  const { arena } = createArena({
    giftWeaponMappings: {
      revive_gift: {
        weaponType: 'shield',
        tier: 'large',
        power: 3,
        durationMs: 9000,
        growthBonus: 0,
        extraLives: 2
      }
    }
  });

  arena.handleGift({
    uniqueId: 'revive_user',
    nickname: 'Revive',
    giftName: 'Revive Gift',
    giftId: 'revive_gift',
    repeatCount: 1
  });

  const player = arena.players.get('revive_user');
  expect(player.extraLives).toBe(2);
  expect(arena._serializePlayer(player).extraLives).toBe(2);
});
```

- [ ] Step 2: Run tests and confirm they fail for missing behavior.

Run:

```bash
cd app
npx jest plugins/game-engine/test/arena-engine.test.js --runInBand --silent
```

Expected: FAIL with assertions around unchanged eat threshold, missing death-drop source, missing like food source, or missing extraLives serialization.

- [ ] Step 3: Add config keys and minimal helper shells.

In `DEFAULT_CONFIG`, add:

```js
eatRadiusRatio: 1.15,
deathFoodDropCount: 8,
deathFoodDropValue: 0.9,
deathFoodDropSpread: 72,
likeFoodSpawnInterval: 3,
likeFoodValue: 0.65,
maxFoodBurstPerEvent: 24,
giftExtraLifeValue: 1
```

- [ ] Step 4: Implement the tested behavior in `arena.js`.

Add helper methods:

```js
_spawnFoodBurst(origin, count, config, options = {}) { ... }
_dropDeathFood(prey, predator, config) { ... }
_applyGiftExtraLives(player, weaponMapping, data, config) { ... }
```

Wire them from `_applyActivity`, `_resolvePlayerCollisions`, `handleGift`, and `_serializePlayer`.

- [ ] Step 5: Re-run the focused Jest file and keep existing tests green where possible.

Run:

```bash
cd app
npx jest plugins/game-engine/test/arena-engine.test.js --runInBand --silent
```

Expected: PASS for the new tests and no regressions in this focused file.

### Task 2: Replace decision movement with explicit weighted steering signals

**Files:**
- Modify: `app/plugins/game-engine/test/arena-engine.test.js`
- Modify: `app/plugins/game-engine/games/arena.js`

- [ ] Step 1: Add failing tests that assert separation, avoidance, and combined steering.

Add:

```js
it('combines seek, flee, separation, and boundary steering into final movement', () => {
  const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0, movement: { randomTurn: 0 } }, { random: () => 0.5 });
  const config = arena.getConfig();
  arena.handleActivity({ uniqueId: 'vector_runner', nickname: 'Runner' }, 'chat');
  arena.handleActivity({ uniqueId: 'vector_threat', nickname: 'Threat' }, 'chat');
  arena.handleActivity({ uniqueId: 'vector_neighbor', nickname: 'Neighbor' }, 'chat');

  const runner = arena.players.get('vector_runner');
  const threat = arena.players.get('vector_threat');
  const neighbor = arena.players.get('vector_neighbor');
  Object.assign(runner, { x: 260, y: 300, vx: 1, vy: 0, mass: 18, energy: 80 });
  Object.assign(threat, { x: 340, y: 300, vx: -1, vy: 0, mass: 80 });
  Object.assign(neighbor, { x: 255, y: 338, vx: 0, vy: 0, mass: 18 });
  arena.food.clear();
  arena.food.set('safe_food_vector', { id: 'safe_food_vector', x: 170, y: 260, radius: 5, value: 2 });
  arena._syncRadius(runner, config);
  arena._syncRadius(threat, config);
  arena._syncRadius(neighbor, config);

  const behavior = arena.chooseBehavior(runner, config);

  expect(behavior.mode).toBe('flee');
  expect(behavior.vector.x).toBeLessThan(-0.35);
  expect(Math.abs(behavior.vector.y)).toBeGreaterThan(0.05);
  expect(behavior.metadata.steering).toEqual(expect.objectContaining({
    threat: expect.any(Number),
    separation: expect.any(Number),
    food: expect.any(Number)
  }));
});
```

- [ ] Step 2: Run the focused test and confirm RED.

Run:

```bash
cd app
npx jest plugins/game-engine/test/arena-engine.test.js -t "combines seek, flee, separation" --runInBand --silent
```

Expected: FAIL until steering metadata and final weighted vector exist.

- [ ] Step 3: Add `_buildSteeringPlan(player, context)` and supporting helpers.

Implement helpers:

```js
_buildSteeringPlan(player, context) { ... }
_separationVector(player, config) { ... }
_largeEnemyAvoidanceVector(player, context) { ... }
_weightedSteering(parts) { ... }
```

The plan must combine food, prey, weapon, threat, separation, large-enemy avoidance, and boundary vectors into one normalized vector.

- [ ] Step 4: Use the steering plan in `_selectAiIntent` or immediately after intent selection.

Keep existing intent labels for compatibility, but replace the returned vector with the weighted steering vector and attach `metadata.steering`.

- [ ] Step 5: Re-run focused tests.

Run:

```bash
cd app
npx jest plugins/game-engine/test/arena-engine.test.js --runInBand --silent
```

Expected: focused Arena suite passes.

### Task 3: Make weapons and revives battle-royale safe

**Files:**
- Modify: `app/plugins/game-engine/test/arena-engine.test.js`
- Modify: `app/plugins/game-engine/games/arena.js`

- [ ] Step 1: Add tests for cooldown metadata and revive consumption.

Add:

```js
it('tracks weapon cooldown metadata after active weapon effects', () => {
  const { arena } = createArena({}, { now: () => 1000, random: () => 0.5 });
  const config = arena.getConfig();
  arena.handleActivity({ uniqueId: 'cooldown_laser', nickname: 'Laser' }, 'chat');
  arena.handleActivity({ uniqueId: 'cooldown_target', nickname: 'Target' }, 'chat');
  const laser = arena.players.get('cooldown_laser');
  const target = arena.players.get('cooldown_target');
  Object.assign(laser, { x: 200, y: 200, mass: 60, weapon: { type: 'laser', power: 3, expiresAt: 9000 } });
  Object.assign(target, { x: 260, y: 200, mass: 20 });
  arena._syncRadius(laser, config);
  arena._syncRadius(target, config);

  arena._applyWeaponEffects(laser, config, 0.2);

  expect(laser.weapon.cooldownUntil).toBeGreaterThan(1000);
});

it('consumes an extra life reserve instead of removing a recently killed player', () => {
  const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 });
  const config = arena.getConfig();
  arena.handleActivity({ uniqueId: 'revive_predator', nickname: 'Predator' }, 'chat');
  arena.handleActivity({ uniqueId: 'revive_prey', nickname: 'Prey' }, 'chat');
  const predator = arena.players.get('revive_predator');
  const prey = arena.players.get('revive_prey');
  Object.assign(predator, { x: 300, y: 300, mass: 80 });
  Object.assign(prey, { x: 322, y: 300, mass: 20, extraLives: 1 });
  arena._syncRadius(predator, config);
  arena._syncRadius(prey, config);

  arena._resolvePlayerCollisions(config);

  expect(arena.players.has('revive_prey')).toBe(true);
  expect(prey.extraLives).toBe(0);
  expect(prey.lives).toBeGreaterThan(config.minLives);
});
```

- [ ] Step 2: Run RED.

Run:

```bash
cd app
npx jest plugins/game-engine/test/arena-engine.test.js -t "extra life reserve|cooldown metadata" --runInBand --silent
```

Expected: FAIL until cooldown and revive logic exist.

- [ ] Step 3: Implement cooldown and revive helpers.

Add:

```js
_weaponCanTick(player, cooldownMs) { ... }
_markWeaponCooldown(player, cooldownMs) { ... }
_tryConsumeExtraLife(player, predator, config) { ... }
```

Use cooldowns for active weapons without removing existing weapon behavior.

- [ ] Step 4: Re-run focused tests.

Run:

```bash
cd app
npx jest plugins/game-engine/test/arena-engine.test.js --runInBand --silent
```

Expected: focused Arena suite passes.

### Task 4: Performance guardrails

**Files:**
- Modify: `app/plugins/game-engine/test/arena-engine.test.js`
- Modify: `app/plugins/game-engine/games/arena.js`

- [ ] Step 1: Add a regression test that player collision queries use the spatial index.

Add:

```js
it('uses spatial player queries for collision resolution instead of scanning every player pair', () => {
  const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 });
  const config = arena.getConfig();
  for (let i = 0; i < 80; i++) {
    arena.handleActivity({ uniqueId: `grid_user_${i}`, nickname: `Grid ${i}` }, 'chat');
    const player = arena.players.get(`grid_user_${i}`);
    Object.assign(player, { x: 40 + (i % 10) * 150, y: 40 + Math.floor(i / 10) * 110, mass: 18 });
    arena._syncRadius(player, config);
  }
  arena.aiSpatialIndex = arena._buildSpatialIndex(config);
  const spy = jest.spyOn(arena, '_nearbyPlayers');

  arena._resolvePlayerCollisions(config);

  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});
```

- [ ] Step 2: Run RED if current code does not call `_nearbyPlayers` in collision resolution.

Run:

```bash
cd app
npx jest plugins/game-engine/test/arena-engine.test.js -t "uses spatial player queries" --runInBand --silent
```

Expected: FAIL until `_resolvePlayerCollisions` uses the grid query path.

- [ ] Step 3: Refactor `_resolvePlayerCollisions(config)` to query nearby players per player and dedupe pairs by key.

Use pair keys like:

```js
const key = predator.username < prey.username
  ? `${predator.username}:${prey.username}`
  : `${prey.username}:${predator.username}`;
```

- [ ] Step 4: Re-run focused suite and lint.

Run:

```bash
cd app
npx jest plugins/game-engine/test/arena-engine.test.js --runInBand --silent
npm run lint -- --quiet plugins/game-engine/games/arena.js plugins/game-engine/test/arena-engine.test.js
```

Expected: Arena tests pass. Lint exits 0 for touched files.

## Final Verification

Run:

```bash
cd app
npx jest plugins/game-engine/test/arena-engine.test.js --runInBand --silent
npm run lint -- --quiet plugins/game-engine/games/arena.js plugins/game-engine/test/arena-engine.test.js
```

Do not claim broader `npm test` success because `docs/SNAPSHOT_STATUS.md` documents existing unrelated failing Jest suites.
