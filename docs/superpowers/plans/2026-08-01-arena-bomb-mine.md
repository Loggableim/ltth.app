# Arena Bomb Mine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn missed random `!bomb` throws into readable, non-lethal proximity mines whose physical trigger makes large players harder to maneuver around.

**Architecture:** `ArenaGame` remains authoritative for bomb phase, per-owner replacement, physical overlap, radial mass retention, shield immunity, and capped food spawning. `arena.html` consumes serialized phase/readiness data to draw the red-orange ready aura, armed mine, flight fuse, and short explosion effect in Canvas and Pixi.

**Tech Stack:** Node.js CommonJS, Jest, Socket.IO state/events, Canvas 2D, PixiJS.

## Global Constraints

- Keep the random cardinal throw and existing `!bomb` command/cooldown.
- A bomb may shrink a player but never directly eliminate or award a kill/kill score.
- Physical triggering is `player.radius + bomb.radius`; `bombBlastRadius` is damage-only.
- Shielded players and the owner never trigger or receive bomb damage.
- A missed bomb arms for 18,000 ms by default; one active bomb/mine per owner.
- Shared food burst is capped at 40 pieces; ambient food pacing remains untouched.
- Change only Arena runtime, overlay, tests, spec, and this plan.

---

### Task 1: Authoritative bomb phases and cooldown state

**Files:**
- Modify: `app/plugins/game-engine/games/arena.js: DEFAULT_CONFIG, _throwBomb(), _updateBombs(), _serializeAbilities(), getState(), _normalizeConfig()`
- Test: `app/plugins/game-engine/test/arena-engine.test.js: direct ability contracts`

**Interfaces:**
- Consumes: `this.bombs`, `this.players`, `_distance()`, and existing `bombCooldownUntil`.
- Produces: bomb `{ phase: 'flying' | 'armed', armedAt, expiresAt }`; player `abilities.bomb.{ ready, availableAt, cooldownProgress }`.

- [ ] **Step 1: Write the failing phase/state test**

```js
it('arms a missed bomb and serializes its separate cooldown state', () => {
  let now = 60000;
  const { arena } = createArena({ bombRange: 80, bombArmDurationMs: 18000 }, { now: () => now, random: () => 0 });
  const config = arena.getConfig();
  const thrower = movementPlayer(arena, config, 'thrower', 40, { x: 120, y: 300, lives: 500, lastActivityAt: now });
  arena.players.set(thrower.username, thrower);

  expect(arena.handleAbilityCommand({ uniqueId: thrower.username, nickname: thrower.nickname }, 'bomb')).toMatchObject({ success: true });
  now += 200;
  arena.tick(200);

  const state = arena.getState();
  expect(state.players[0].abilities.bomb.ready).toBe(false);
  expect(state.bombs).toEqual([expect.objectContaining({ owner: thrower.username, phase: 'armed', expiresAt: now + 18000 })]);
});
```

- [ ] **Step 2: Verify RED**

Run: `& 'C:\\Users\\logga\\Documents\\ltth_codex\\ltth_desktop2-main\\runtime\\node\\node.exe' 'C:\\Users\\logga\\Documents\\ltth_codex\\ltth_desktop2-main\\app\\node_modules\\jest\\bin\\jest.js' --runInBand plugins/game-engine/test/arena-engine.test.js -t "arms a missed bomb"`

Expected: FAIL because a missed bomb is deleted and `abilities.bomb` is absent.

- [ ] **Step 3: Implement smallest phase/state foundation**

```js
// DEFAULT_CONFIG
bombArmDurationMs: 18000,

// _serializeAbilities() adds this entry beside boost/shield
bomb: {
  ready: now >= (Number(player.bombCooldownUntil) || 0),
  availableAt: Number(player.bombCooldownUntil) || 0,
  cooldownProgress: Math.round(this._clamp(1 - Math.max(0, (Number(player.bombCooldownUntil) || 0) - now) / config.bombCooldownMs, 0, 1) * 100) / 100
}

// after a range/boundary miss
bomb.phase = 'armed';
bomb.vx = 0; bomb.vy = 0;
bomb.armedAt = this.now();
bomb.expiresAt = bomb.armedAt + config.bombArmDurationMs;
```

Normalize `bombArmDurationMs` to `1000..60000`, include it in state config, expire armed bombs after `expiresAt`, and remove an existing active bomb owned by the thrower before inserting their new flying bomb.

- [ ] **Step 4: Verify GREEN and commit**

Run: same command as Step 2. Expected: PASS.

Commit: `git add app/plugins/game-engine/games/arena.js app/plugins/game-engine/test/arena-engine.test.js`, then `git commit -m "feat(arena): arm missed bombs as mines"`.

### Task 2: Physical trigger and non-lethal shared shockwave

**Files:**
- Modify: `app/plugins/game-engine/games/arena.js: _updateBombs(), new _bombTouchesPlayer(), _bombRetentionForDistance(), _detonateBomb()`
- Test: `app/plugins/game-engine/test/arena-engine.test.js: bomb collision contracts`

**Interfaces:**
- Consumes: Task 1 phase/state, `_isShieldActive()`, `_massToLives()`, `_syncRadius()`, and `_spawnFoodBurst()`.
- Produces: `arena:bomb-exploded` with `{ bombId, owner, x, y, radius, phase, victims, timestamp }`.

- [ ] **Step 1: Write failing physical-trigger and radial-band tests**

```js
it('lets a small player pass an armed bomb but makes a giant trigger it from their larger radius', () => {
  const { arena } = createArena({ bombBlastRadius: 92 }, { now: () => 70000 });
  const config = arena.getConfig();
  const small = movementPlayer(arena, config, 'small', 12, { x: 130, y: 300, lives: arena._massToLives(12, config) });
  const giant = movementPlayer(arena, config, 'giant', 180, { x: 150, y: 300, lives: arena._massToLives(180, config) });
  arena.players.set(small.username, small);
  arena.players.set(giant.username, giant);
  arena.bombs.set('bomb_1', { id: 'bomb_1', owner: 'owner', phase: 'armed', x: 100, y: 300, radius: 12, blastRadius: 92, expiresAt: 88000 });

  arena._updateBombs(config, 0);

  expect(arena.bombs.has('bomb_1')).toBe(false);
  expect(small.mass).toBeCloseTo(12, 1);
  expect(giant.mass).toBeLessThan(180);
  expect(giant.mass).toBeGreaterThan(config.minMass);
});

it('applies all three radial bomb bands without a kill or food rain', () => {
  const { arena } = createArena({ maxFood: 100 }, { now: () => 70000 });
  const config = arena.getConfig();
  const core = movementPlayer(arena, config, 'core', 100, { x: 310, y: 300, lives: arena._massToLives(100, config) });
  const middle = movementPlayer(arena, config, 'middle', 100, { x: 346, y: 300, lives: arena._massToLives(100, config) });
  const outer = movementPlayer(arena, config, 'outer', 100, { x: 382, y: 300, lives: arena._massToLives(100, config) });
  arena.players.set(core.username, core);
  arena.players.set(middle.username, middle);
  arena.players.set(outer.username, outer);
  arena.bombs.set('bomb_2', { id: 'bomb_2', owner: 'owner', phase: 'armed', x: 300, y: 300, radius: 12, blastRadius: 92, expiresAt: 88000 });

  arena._updateBombs(config, 0);

  expect(core.mass).toBeCloseTo(22, 0);
  expect(middle.mass).toBeCloseTo(45, 0);
  expect(outer.mass).toBeCloseTo(70, 0);
  expect(core.kills + middle.kills + outer.kills).toBe(0);
  expect(arena.food.size).toBeLessThanOrEqual(40);
});
```

- [ ] **Step 2: Verify RED**

Run: `& 'C:\\Users\\logga\\Documents\\ltth_codex\\ltth_desktop2-main\\runtime\\node\\node.exe' 'C:\\Users\\logga\\Documents\\ltth_codex\\ltth_desktop2-main\\app\\node_modules\\jest\\bin\\jest.js' --runInBand plugins/game-engine/test/arena-engine.test.js -t "small player pass|three radial bomb"`

Expected: FAIL because the current bomb checks `player.radius + bombBlastRadius`, changes one target, and can create up to 72 food per target.

- [ ] **Step 3: Implement physical trigger and radial shockwave**

```js
_bombTouchesPlayer(bomb, player) {
  return this._distance(bomb, player) <= Math.max(1, Number(bomb.radius) || 12) + Math.max(1, Number(player.radius) || 0);
}

_bombRetentionForDistance(distance, blastRadius) {
  const ratio = distance / Math.max(1, blastRadius);
  if (ratio <= 0.35) return 0.22;
  if (ratio <= 0.70) return 0.45;
  return 0.70;
}
```

`_detonateBomb()` selects every unshielded non-owner inside `bomb.blastRadius`, sets each victim to the retention mass while clamping above `minMass + 0.5`, then synchronizes lives/radius. It sums lost mass and calls `_spawnFoodBurst(bomb, Math.min(40, Math.floor(totalMassLost / 10)), config, { source: 'bomb', spread: bomb.blastRadius, ignoreCap: true })` once. It never calls an elimination or kill-score helper. A physical contact from either phase invokes it; a shielded player does not trigger it.

- [ ] **Step 4: Verify focused behavior and commit**

Run: `& 'C:\\Users\\logga\\Documents\\ltth_codex\\ltth_desktop2-main\\runtime\\node\\node.exe' 'C:\\Users\\logga\\Documents\\ltth_codex\\ltth_desktop2-main\\app\\node_modules\\jest\\bin\\jest.js' --runInBand plugins/game-engine/test/arena-engine.test.js -t "bomb|direct shield"`

Expected: PASS, including shield immunity.

Commit: `git add app/plugins/game-engine/games/arena.js app/plugins/game-engine/test/arena-engine.test.js`, then `git commit -m "feat(arena): add nonlethal bomb shockwaves"`.

### Task 3: Canvas/Pixi feedback and explosion contract

**Files:**
- Modify: `app/plugins/game-engine/overlay/arena.html: Pixi bomb layer, drawAbilityRings(), drawBombs(), drawEffects(), Socket.IO handlers`
- Test: `app/plugins/game-engine/test/arena-engine.test.js: Arena overlay rendering contract`

**Interfaces:**
- Consumes: Task 1 `abilities.bomb`, Task 1 bomb phase, and Task 2 `arena:bomb-exploded`.
- Produces: Canvas/Pixi readiness/phase parity and transient `bomb-explosion` effect.

- [ ] **Step 1: Write failing overlay contract test**

```js
it('renders bomb readiness, armed mines, flight fuse, and explosion feedback in both renderers', () => {
  const overlay = fs.readFileSync(path.join(pluginRoot, 'overlay', 'arena.html'), 'utf8');
  expect(overlay).toContain('abilities.bomb');
  expect(overlay).toContain("bomb.phase === 'armed'");
  expect(overlay).toContain('drawBombExplosionEffect');
  expect(overlay).toContain("type: 'bomb-explosion'");
  expect(overlay).toContain('bombLayer');
});
```

- [ ] **Step 2: Verify RED**

Run: `& 'C:\\Users\\logga\\Documents\\ltth_codex\\ltth_desktop2-main\\runtime\\node\\node.exe' 'C:\\Users\\logga\\Documents\\ltth_codex\\ltth_desktop2-main\\app\\node_modules\\jest\\bin\\jest.js' --runInBand plugins/game-engine/test/arena-engine.test.js -t "bomb readiness"`

Expected: FAIL because readiness, armed phase, and bomb explosion drawing are absent.

- [ ] **Step 3: Implement bounded visual feedback**

```js
if (abilities.bomb?.ready) {
  const pulse = 1 + Math.sin(now / 120) * 0.12;
  ctx.strokeStyle = '#F97316';
  ctx.globalAlpha = 0.68 + Math.sin(now / 120) * 0.18;
  ctx.arc(point.x, point.y, (point.radius + 22) * pulse, 0, Math.PI * 2);
  ctx.stroke();
}

socket.on('arena:bomb-exploded', data => pushEffect({
  type: 'bomb-explosion', x: Number(data.x) || 0, y: Number(data.y) || 0,
  radius: Math.max(12, Number(data.radius) || 40), startedAt: Date.now(), duration: 620
}));
```

Canvas renders armed bombs as grounded red-orange octagons with slow pulse and flying bombs as yellow cores with short red fuse opposite velocity. Pixi reads the same phase property. `drawBombExplosionEffect()` draws one expanding orange/red ring and bounded flash, with no particles and no HUD/rotator layout change.

- [ ] **Step 4: Verify overlay contract and commit**

Run: `& 'C:\\Users\\logga\\Documents\\ltth_codex\\ltth_desktop2-main\\runtime\\node\\node.exe' 'C:\\Users\\logga\\Documents\\ltth_codex\\ltth_desktop2-main\\app\\node_modules\\jest\\bin\\jest.js' --runInBand plugins/game-engine/test/arena-engine.test.js -t "bomb readiness|direct ability|rendering contract"`

Expected: PASS.

Commit: `git add app/plugins/game-engine/overlay/arena.html app/plugins/game-engine/test/arena-engine.test.js`, then `git commit -m "feat(arena): visualize bomb mine phases"`.

### Task 4: Full verification and review handoff

**Files:**
- Verify: `app/plugins/game-engine/games/arena.js`
- Verify: `app/plugins/game-engine/overlay/arena.html`
- Verify: `app/plugins/game-engine/test/arena-engine.test.js`
- Verify: `docs/superpowers/specs/2026-08-01-arena-bomb-mine-design.md`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: clean feature branch and fresh regression evidence.

- [ ] **Step 1: Run the complete Arena suite**

Run: `& 'C:\\Users\\logga\\Documents\\ltth_codex\\ltth_desktop2-main\\runtime\\node\\node.exe' 'C:\\Users\\logga\\Documents\\ltth_codex\\ltth_desktop2-main\\app\\node_modules\\jest\\bin\\jest.js' --runInBand plugins/game-engine/test/arena-engine.test.js`

Expected: PASS with no failures.

- [ ] **Step 2: Run targeted lint and whitespace validation**

```powershell
& 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe' 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\app\node_modules\eslint\bin\eslint.js' plugins/game-engine/games/arena.js plugins/game-engine/overlay/arena.html plugins/game-engine/test/arena-engine.test.js
git diff --check a60ea3c2a...HEAD
```

Expected: both commands exit 0.

- [ ] **Step 3: Review all spec invariants**

Confirm random direction, one owner bomb, 18-second armed phase, physical trigger versus AoE radius, three retention bands, shield/owner immunity, no direct elimination/kill, at most 40 shared food, and Canvas/Pixi feedback parity before reviewer handoff.
