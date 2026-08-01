'use strict';

const fs = require('fs');
const path = require('path');
const ArenaGame = require('../games/arena');
const GameEnginePlugin = require('../main');

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

function createArena(config = {}, options = {}) {
  const io = { emit: jest.fn() };
  const db = {
    getGameConfig: jest.fn(() => config),
    saveGameConfig: jest.fn()
  };
  const api = {
    getSocketIO: () => io
  };
  const arena = new ArenaGame(api, db, mockLogger, {
    now: options.now || (() => 1000),
    random: options.random || (() => 0.5)
  });

  const withTestProfilePicture = (data = {}) => Object.prototype.hasOwnProperty.call(data, 'profilePictureUrl')
    ? data
    : { ...data, profilePictureUrl: 'https://example.test/test-avatar.png' };
  const handleActivity = arena.handleActivity.bind(arena);
  const handleGift = arena.handleGift.bind(arena);
  arena.handleActivity = (data, activityType) => handleActivity(withTestProfilePicture(data), activityType);
  arena.handleGift = data => handleGift(withTestProfilePicture(data));

  return { arena, io, db };
}

describe('ArenaGame', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function movementPlayer(arena, config, username, mass, overrides = {}) {
    const player = {
      username,
      nickname: username,
      x: 300,
      y: 300,
      vx: 1,
      vy: 0,
      mass,
      energy: 60,
      weapon: null,
      effects: {},
      personality: {
        id: 'balanced',
        label: 'Balanced',
        aggression: 1,
        fear: 1,
        intelligence: 1,
        weaponFocus: 1,
        foodFocus: 1,
        randomness: 0.2,
        commitment: 1
      },
      ...overrides
    };
    arena._syncRadius(player, config);
    return player;
  }

  it('uses lower default state emission and render pressure for smoother arena overlays', () => {
    const { arena } = createArena();
    const config = arena.getConfig();

    expect(config).toEqual(expect.objectContaining({
      maxMass: 999,
      maxFood: 72,
      maxFoodRender: 66,
      foodSpawnIntervalMs: 2400,
      foodSpawnBatchSize: 1,
      foodDespawnMs: 150000
    }));
    expect(config.maxLives).toBe(320000);
    expect(config.stateEmitIntervalMs).toBeGreaterThanOrEqual(50);
    expect(config.targetFps).toBeLessThanOrEqual(45);
    expect(config.maxRenderPlayers).toBeLessThanOrEqual(48);
    expect(config.maxFoodRender).toBeLessThanOrEqual(72);
  });

  it('migrates the shipped 666 absorb profile at runtime without changing ambient food', () => {
    const config = createArena({
      maxMass: 666,
      playerAbsorbMassRatio: 0.82,
      playerAbsorbLifeStealRatio: 0.84,
      maxLives: 88000
    }).arena.getConfig();

    expect(config).toEqual(expect.objectContaining({
      maxMass: 999,
      playerAbsorbMassRatio: 1,
      playerAbsorbLifeStealRatio: 1,
      maxLives: 320000,
      maxFood: 72,
      maxFoodRender: 66,
      foodSpawnIntervalMs: 2400,
      foodSpawnBatchSize: 1,
      foodDespawnMs: 150000
    }));
  });

  it('keeps a custom runtime absorb profile unchanged', () => {
    const config = createArena({
      maxMass: 777,
      playerAbsorbMassRatio: 0.73,
      playerAbsorbLifeStealRatio: 0.91
    }).arena.getConfig();

    expect(config).toEqual(expect.objectContaining({
      maxMass: 777,
      playerAbsorbMassRatio: 0.73,
      playerAbsorbLifeStealRatio: 0.91
    }));
  });

  it('keeps a partial former runtime profile unchanged', () => {
    const config = createArena({
      maxMass: 666,
      playerAbsorbMassRatio: 0.73,
      playerAbsorbLifeStealRatio: 0.91,
      maxLives: 88000
    }).arena.getConfig();

    expect(config).toEqual(expect.objectContaining({
      maxMass: 666,
      playerAbsorbMassRatio: 0.73,
      playerAbsorbLifeStealRatio: 0.91,
      maxLives: 88000
    }));
  });


  it('migrates noisy runtime food profiles without overwriting intentional low-volume pacing', () => {
    const noisyProfile = {
      maxFood: 130,
      maxFoodRender: 72,
      foodSpawnIntervalMs: 6000,
      foodSpawnBatchSize: 22
    };

    for (const legacyMaxMass of [90, 140, 170, 260, 520]) {
      const noisy = createArena({ ...noisyProfile, maxMass: legacyMaxMass }).arena.getConfig();
      expect(noisy).toEqual(expect.objectContaining({
        maxMass: 999,
        maxFood: 72,
        maxFoodRender: 66,
        foodSpawnIntervalMs: 2400,
        foodSpawnBatchSize: 1
      }));
    }

    for (const foodSpawnBatchSize of [1, 2, 3]) {
      const intentionalPacing = createArena({
        foodSpawnIntervalMs: 5000,
        foodSpawnBatchSize
      }).arena.getConfig();
      expect(intentionalPacing).toEqual(expect.objectContaining({
        foodSpawnIntervalMs: 5000,
        foodSpawnBatchSize
      }));
    }
  });

  it('migrates the full noisy legacy ambient profile at runtime', () => {
    const config = createArena({
      maxFood: 66,
      maxFoodRender: 66,
      foodSpawnIntervalMs: 6000,
      foodSpawnBatchSize: 22,
      foodDespawnMs: 120000
    }).arena.getConfig();

    expect(config).toEqual(expect.objectContaining({
      maxMass: 999,
      maxFood: 72,
      maxFoodRender: 66,
      foodSpawnIntervalMs: 2400,
      foodSpawnBatchSize: 1,
      foodDespawnMs: 150000
    }));
  });

  it('migrates batch 4 with an explicit legacy interval to ambient runtime pacing', () => {
    const legacyBurst = createArena({
      foodSpawnIntervalMs: 6000,
      foodSpawnBatchSize: 4
    }).arena.getConfig();

    expect(legacyBurst).toEqual(expect.objectContaining({
      foodSpawnIntervalMs: 2400,
      foodSpawnBatchSize: 1
    }));
  });

  it('defaults the optional upper ability legend off while exposing an explicit enablement', () => {
    const { arena } = createArena();

    expect(arena.getState().config.topOverlayShowAbilityLegend).toBe(false);

    const { arena: enabledArena } = createArena({ topOverlayShowAbilityLegend: true });
    expect(enabledArena.getState().config.topOverlayShowAbilityLegend).toBe(true);
  });

  it('charges boost and shield for sixty seconds before activating their direct effects', () => {
    let now = 0;
    const { arena } = createArena({}, { now: () => now });
    const viewer = {
      uniqueId: 'ability_viewer',
      nickname: 'Ability Viewer',
      profilePictureUrl: 'https://example.test/ability.png'
    };

    arena.handleActivity(viewer, 'chat');
    let player = arena.getState().players[0];
    expect(player.abilities.boost.ready).toBe(false);
    expect(player.abilities.boost.chargeProgress).toBe(0);
    expect(arena.handleAbilityCommand(viewer, 'boost').success).toBe(false);

    now = 60000;
    expect(arena.handleAbilityCommand(viewer, 'boost')).toMatchObject({ success: true, ability: 'boost' });
    expect(arena.handleAbilityCommand(viewer, 'shield')).toMatchObject({ success: true, ability: 'shield' });

    player = arena.getState().players[0];
    expect(player.abilities.boost.active).toBe(true);
    expect(player.abilities.shield.active).toBe(true);
    expect(player.abilities.boost.ready).toBe(false);
    expect(player.abilities.shield.ready).toBe(false);
  });

  it('throws a bomb in one random cardinal direction and leaves a large target alive after the shockwave', () => {
    let now = 60000;
    let randomCall = 0;
    const random = () => {
      randomCall += 1;
      if (randomCall === 1) return 0;
      return randomCall % 2 === 0 ? 0.25 : 1;
    };
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { now: () => now, random });
    const config = arena.getConfig();
    const thrower = movementPlayer(arena, config, 'bomb_thrower', 40, { x: 120, y: 300, lives: 500, lastActivityAt: now });
    const giant = movementPlayer(arena, config, 'bomb_giant', 220, { x: 290, y: 300, lives: 15000, lastActivityAt: now });
    arena.players.set(thrower.username, thrower);
    arena.players.set(giant.username, giant);
    const giantMassBefore = giant.mass;
    const spawnFoodBurst = jest.spyOn(arena, '_spawnFoodBurst');

    const result = arena.handleAbilityCommand({
      uniqueId: thrower.username,
      nickname: thrower.nickname,
      profilePictureUrl: 'https://example.test/thrower.png'
    }, 'bomb');
    expect(result).toMatchObject({ success: true, ability: 'bomb', direction: 'east' });

    now += 350;
    arena.tick(350);

    expect(arena.players.get(giant.username).mass).toBeLessThan(giantMassBefore);
    expect(arena.players.get(giant.username).mass).toBeGreaterThan(config.minMass);
    expect((arena.players.get(giant.username).kills || 0)).toBe(0);
    expect(spawnFoodBurst).toHaveBeenCalledTimes(1);
    expect(arena.food.size).toBeGreaterThan(0);
  });

  it('clears active bombs when reset rebuilds the arena state', () => {
    const { arena } = createArena();
    arena.bombs.set('bomb-in-flight', { id: 'bomb-in-flight', owner: 'viewer' });

    expect(arena.reset()).toEqual({ success: true });
    expect(arena.getState().bombs).toEqual([]);
  });

  it('lets a small player pass an armed bomb but makes a giant trigger it from their larger radius', () => {
    const { arena } = createArena({ bombBlastRadius: 92 }, { now: () => 70000 });
    const config = arena.getConfig();
    const small = movementPlayer(arena, config, 'small', 12, { x: 230, y: 300, lives: arena._massToLives(12, config) });
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

  it('does not detonate an armed bomb for a player inside the blast radius without physical contact', () => {
    const { arena } = createArena({ bombBlastRadius: 92 }, { now: () => 70000 });
    const config = arena.getConfig();
    const nearby = movementPlayer(arena, config, 'nearby', 12, { x: 180, y: 300, lives: arena._massToLives(12, config) });
    arena.players.set(nearby.username, nearby);
    arena.bombs.set('bomb_contact_only', { id: 'bomb_contact_only', owner: 'owner', phase: 'armed', x: 100, y: 300, radius: 12, blastRadius: 92, expiresAt: 88000 });

    arena._updateBombs(config, 0);

    expect(arena.bombs.has('bomb_contact_only')).toBe(true);
    expect(nearby.mass).toBeCloseTo(12, 1);
  });
  it('applies all three radial bomb bands without a kill or food rain', () => {
    const { arena, io } = createArena({ maxFood: 100 }, { now: () => 70000 });
    const config = arena.getConfig();
    const core = movementPlayer(arena, config, 'core', 100, { x: 310, y: 300, lives: arena._massToLives(100, config) });
    const middle = movementPlayer(arena, config, 'middle', 100, { x: 346, y: 300, lives: arena._massToLives(100, config) });
    const outer = movementPlayer(arena, config, 'outer', 100, { x: 382, y: 300, lives: arena._massToLives(100, config) });
    arena.players.set(core.username, core);
    arena.players.set(middle.username, middle);
    arena.players.set(outer.username, outer);
    arena.bombs.set('bomb_2', { id: 'bomb_2', owner: 'owner', phase: 'armed', x: 300, y: 300, radius: 12, blastRadius: 92, expiresAt: 88000 });

    const spawnFoodBurst = jest.spyOn(arena, '_spawnFoodBurst');
    arena._updateBombs(config, 0);

    expect(core.mass).toBeCloseTo(22, 0);
    expect(middle.mass).toBeCloseTo(45, 0);
    expect(outer.mass).toBeCloseTo(70, 0);
    expect((core.kills || 0) + (middle.kills || 0) + (outer.kills || 0)).toBe(0);
    expect(arena.food.size).toBeLessThanOrEqual(40);
    expect(spawnFoodBurst).toHaveBeenCalledTimes(1);
    expect(spawnFoodBurst).toHaveBeenCalledWith(expect.objectContaining({ id: 'bomb_2' }), 16, config, expect.objectContaining({ source: 'bomb', spread: 92, ignoreCap: true }));
    expect(io.emit).toHaveBeenCalledWith('arena:bomb-exploded', expect.objectContaining({
      bombId: 'bomb_2',
      owner: 'owner',
      x: 300,
      y: 300,
      radius: 92,
      phase: 'armed',
      victims: expect.arrayContaining(['core', 'middle', 'outer']),
      timestamp: 70000
    }));

  });
  it('keeps the owner and shielded player unchanged during an actual bomb explosion', () => {
    const now = 70000;
    const { arena } = createArena({}, { now: () => now });
    const config = arena.getConfig();
    const owner = movementPlayer(arena, config, 'owner', 100, { x: 300, y: 300, lives: arena._massToLives(100, config) });
    const shielded = movementPlayer(arena, config, 'shielded', 100, {
      x: 310, y: 300, lives: arena._massToLives(100, config),
      abilities: { shield: { availableAt: now + config.abilityChargeMs, activeUntil: now + config.shieldDurationMs } }
    });
    const trigger = movementPlayer(arena, config, 'trigger', 100, { x: 340, y: 300, lives: arena._massToLives(100, config) });
    arena.players.set(owner.username, owner);
    arena.players.set(shielded.username, shielded);
    arena.players.set(trigger.username, trigger);
    arena.bombs.set('bomb_3', { id: 'bomb_3', owner: owner.username, phase: 'armed', x: 300, y: 300, radius: 12, blastRadius: 92, expiresAt: 88000 });

    arena._updateBombs(config, 0);

    expect(arena.bombs.has('bomb_3')).toBe(false);
    expect(owner.mass).toBeCloseTo(100, 1);
    expect(shielded.mass).toBeCloseTo(100, 1);
    expect(trigger.mass).toBeCloseTo(45, 0);
  });
  it('removes an expired armed bomb before any physical trigger can detonate it', () => {
    const { arena } = createArena({}, { now: () => 70000 }); const config = arena.getConfig();
    const victim = movementPlayer(arena, config, 'victim', 100, { x: 300, y: 300, lives: arena._massToLives(100, config) }); arena.players.set(victim.username, victim);
    arena.bombs.set('expired', { id: 'expired', owner: 'owner', phase: 'armed', x: 300, y: 300, radius: 12, blastRadius: 92, expiresAt: 70000 });
    arena._updateBombs(config, 0);
    expect(arena.bombs.has('expired')).toBe(false); expect(victim.mass).toBeCloseTo(100, 1);
  });

  it('arms a missed flying bomb at its exact range boundary', () => {
    const { arena } = createArena({ bombRange: 80 }, { now: () => 70000 }); const config = arena.getConfig();
    arena.bombs.set('range', { id: 'range', owner: 'owner', phase: 'flying', x: 100, y: 300, vx: 1, vy: 0, radius: 12, speed: 650, range: 80, travelled: 0, blastRadius: 92 });
    arena._updateBombs(config, 0.2);
    expect(arena.bombs.get('range')).toMatchObject({ phase: 'armed', x: 180, y: 300, travelled: 80 });
  });

  it('arms at the radius-safe field edge on an exact-distance tick', () => {
    const { arena } = createArena({}, { now: () => 70000 });
    const config = arena.getConfig();
    arena.bombs.set('field_edge', {
      id: 'field_edge', owner: 'owner', phase: 'flying',
      x: config.arenaWidth - 62, y: 300, vx: 1, vy: 0,
      radius: 12, speed: 500, range: 420, travelled: 0, blastRadius: 92
    });

    arena._updateBombs(config, 0.1);

    const renderedBomb = arena.getState().bombs.find(bomb => bomb.id === 'field_edge');
    expect(renderedBomb).toMatchObject({ phase: 'armed', x: config.arenaWidth - 12, travelled: 50 });
    expect(renderedBomb.x + renderedBomb.radius).toBe(config.arenaWidth);
  });

  it('damages a small player crossed before a delayed flying-bomb tick endpoint', () => {
    const { arena } = createArena({}, { now: () => 70000 }); const config = arena.getConfig();
    const victim = movementPlayer(arena, config, 'tunnel', 12, {
      x: 180, y: 300, lives: arena._massToLives(12, config)
    });
    arena.players.set(victim.username, victim);
    arena.bombs.set('tunnel', {
      id: 'tunnel', owner: 'owner', phase: 'flying',
      x: 100, y: 300, vx: 1, vy: 0,
      radius: 12, speed: 650, range: 420, travelled: 0, blastRadius: 92
    });

    arena._updateBombs(config, 0.35);

    expect(arena.bombs.has('tunnel')).toBe(false);
    expect(victim.mass).toBeLessThan(12);
  });

  it('detonates at the earliest crossed player regardless of map insertion order', () => {
    const { arena, io } = createArena({}, { now: () => 70000 });
    const config = arena.getConfig();
    const later = movementPlayer(arena, config, 'later', 12, {
      x: 250, y: 300, lives: arena._massToLives(12, config)
    });
    const earlier = movementPlayer(arena, config, 'earlier', 12, {
      x: 180, y: 300, lives: arena._massToLives(12, config)
    });
    arena.players.set(later.username, later);
    arena.players.set(earlier.username, earlier);
    arena.bombs.set('ordered_sweep', {
      id: 'ordered_sweep', owner: 'owner', phase: 'flying',
      x: 100, y: 300, vx: 1, vy: 0,
      radius: 12, speed: 650, range: 420, travelled: 0, blastRadius: 92
    });

    arena._updateBombs(config, 0.4);

    expect(io.emit).toHaveBeenCalledWith('arena:bomb-exploded', expect.objectContaining({
      bombId: 'ordered_sweep',
      x: expect.closeTo(154.14, 2),
      y: 300
    }));
  });

  it('detonates a zero-length flying sweep at its starting overlap', () => {
    const { arena, io } = createArena({}, { now: () => 70000 });
    const config = arena.getConfig();
    const victim = movementPlayer(arena, config, 'stationary_overlap', 100, {
      x: 100, y: 300, lives: arena._massToLives(100, config)
    });
    arena.players.set(victim.username, victim);
    arena.bombs.set('zero_length', {
      id: 'zero_length', owner: 'owner', phase: 'flying',
      x: 100, y: 300, vx: 1, vy: 0,
      radius: 12, speed: 650, range: 420, travelled: 0, blastRadius: 92
    });

    arena._updateBombs(config, 0);

    expect(io.emit).toHaveBeenCalledWith('arena:bomb-exploded', expect.objectContaining({
      bombId: 'zero_length', x: 100, y: 300
    }));
    expect(victim.mass).toBeLessThan(100);
  });

  it('never increases a near-minimum victim mass during bomb retention', () => {
    const { arena } = createArena({}, { now: () => 70000 }); const config = arena.getConfig();
    const victim = movementPlayer(arena, config, 'near_min', 8.2, { x: 300, y: 300, lives: arena._massToLives(8.2, config) }); arena.players.set(victim.username, victim);
    arena.bombs.set('near_min', { id: 'near_min', owner: 'owner', phase: 'armed', x: 300, y: 300, radius: 12, blastRadius: 92, expiresAt: 88000 });
    arena._updateBombs(config, 0);
    expect(victim.mass).toBeLessThanOrEqual(8.2);
  });
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

  it('makes the direct shield block direct damage, pushes and slow effects', () => {
    let now = 60000;
    const { arena } = createArena({}, { now: () => now });
    const config = arena.getConfig();
    const protectedPlayer = movementPlayer(arena, config, 'protected_player', 45, {
      lives: 900,
      effects: {},
      abilities: {
        boost: { availableAt: now + config.abilityChargeMs, activeUntil: 0 },
        shield: { availableAt: now + config.abilityChargeMs, activeUntil: now + config.shieldDurationMs }
      }
    });
    const beforeLives = protectedPlayer.lives;
    const beforePosition = { x: protectedPlayer.x, y: protectedPlayer.y };
    arena.players.set(protectedPlayer.username, protectedPlayer);

    expect(arena._addLives(protectedPlayer, -200, config)).toBe(0);
    arena._applySlow(protectedPlayer, 0.3, 5000, now);
    arena._applyPulseWeapon({
      ...movementPlayer(arena, config, 'pulse_owner', 70, { x: 180, y: 300 }),
      weapon: { type: 'pulse', power: 2 }
    }, config, 1);

    expect(protectedPlayer.lives).toBe(beforeLives);
    expect(protectedPlayer.effects.slowedUntil).toBeUndefined();
    expect(protectedPlayer.x).toBe(beforePosition.x);
    expect(protectedPlayer.y).toBe(beforePosition.y);
  });

  it('makes small unarmed players flee larger nearby predators', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { random: () => 0.5 });
    const config = arena.getConfig();
    const small = movementPlayer(arena, config, 'small_survivor', 14, {
      x: 360,
      y: 300,
      weapon: null,
      lives: 60
    });
    const large = movementPlayer(arena, config, 'large_predator', 42, {
      x: 500,
      y: 300,
      vx: -1,
      vy: 0,
      lives: 200
    });

    arena.players.set(small.username, small);
    arena.players.set(large.username, large);
    arena.aiSpatialIndex = null;

    const decision = arena.chooseBehavior(small, config);

    expect(decision.mode).toBe('flee');
    expect(decision.target.username).toBe('large_predator');
    expect(decision.vector.x).toBeLessThan(0);
  });

  it('makes larger players actively hunt edible smaller targets', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { random: () => 0.5 });
    const config = arena.getConfig();
    const hunter = movementPlayer(arena, config, 'big_hunter', 58, {
      x: 320,
      y: 300,
      weapon: null,
      lives: 260
    });
    const prey = movementPlayer(arena, config, 'small_prey', 22, {
      x: 500,
      y: 300,
      vx: -0.2,
      vy: 0,
      weapon: null,
      lives: 100
    });

    arena.players.set(hunter.username, hunter);
    arena.players.set(prey.username, prey);
    arena.aiSpatialIndex = null;

    const decision = arena.chooseBehavior(hunter, config);

    expect(decision.mode).toBe('hunt-player');
    expect(decision.target.username).toBe('small_prey');
    expect(decision.vector.x).toBeGreaterThan(0);
  });

  it('makes large players treat incoming bombs as an urgent hazard', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { random: () => 0.5 });
    const config = arena.getConfig();
    const giant = movementPlayer(arena, config, 'bomb_target', 220, { x: 430, y: 300, lives: 40000 });
    arena.players.set(giant.username, giant);
    arena.bombs.set('incoming_bomb', {
      id: 'incoming_bomb', owner: 'other_player', x: 370, y: 300, vx: 1, vy: 0, radius: 12, blastRadius: config.bombBlastRadius
    });
    arena.aiSpatialIndex = null;

    const decision = arena.chooseBehavior(giant, config);

    expect(decision.mode).toBe('flee');
    expect(decision.target.id).toBe('incoming_bomb');
    expect(decision.vector.x).toBeGreaterThan(0);
  });

  it('slows 220-mass arena players under the 999 cap and raises the bar for borderline absorbs', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { random: () => 0.5 });
    const config = arena.getConfig();

    const heavyMultiplier = arena._movementMassMultiplier({ mass: 220 }, config);
    expect(config.maxMass).toBe(999);
    expect(heavyMultiplier).toBeCloseTo(0.680188, 5);
    expect(heavyMultiplier).toBeLessThan(1);

    const predator = movementPlayer(arena, config, 'borderline_predator', 54, {
      x: 320,
      y: 300,
      lives: 180
    });
    const prey = movementPlayer(arena, config, 'borderline_prey', 40, {
      x: 420,
      y: 300,
      lives: 120
    });

    expect(arena._playerAbsorbContext(predator, prey, config).canAbsorb).toBe(false);
  });

  it('applies immediate stream surges and temporary boosts for likes and gifts', () => {
    let now = 1000;
    const { arena, io } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      giftWeaponMappings: {
        boost_gift: {
          weaponType: 'speed',
          tier: 'small',
          power: 1.2,
          durationMs: 5000,
          growthBonus: 2
        }
      }
    }, { now: () => now, random: () => 0.5 });

    arena.handleActivity({ uniqueId: 'stream_boost', nickname: 'Stream Boost' }, 'like');
    const player = arena.players.get('stream_boost');

    expect(io.emit).toHaveBeenCalledWith('arena:stream-surge', expect.objectContaining({
      username: 'stream_boost',
      kind: 'like'
    }));
    expect(player.effects.streamBoostUntil).toBeGreaterThan(now);
    expect(arena._statusSpeedMultiplier(player)).toBeGreaterThan(1);
    expect(arena._personalityTraits(player).aggression).toBeGreaterThan(player.personality.aggression);

    io.emit.mockClear();

    const giftResult = arena.handleGift({
      uniqueId: 'stream_boost',
      nickname: 'Stream Boost',
      giftName: 'Boost Gift',
      giftId: 'boost_gift',
      diamondCount: 12,
      repeatCount: 2
    });

    expect(giftResult.success).toBe(true);
    expect(io.emit).toHaveBeenCalledWith('arena:stream-surge', expect.objectContaining({
      username: 'stream_boost',
      kind: 'gift'
    }));
    expect(arena._statusSpeedMultiplier(player)).toBeGreaterThan(1.05);
    expect(arena._personalityTraits(player).weaponFocus).toBeGreaterThan(player.personality.weaponFocus);
  });

  it('lets chat strategy hunt bias an otherwise cautious player toward prey', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { random: () => 0.5 });
    const config = arena.getConfig();
    const hunter = movementPlayer(arena, config, 'cautious_hunter', 26, {
      x: 320,
      y: 300,
      lives: 120,
      personality: {
        id: 'cautious',
        label: 'Cautious',
        aggression: 0.55,
        fear: 1.55,
        intelligence: 1,
        weaponFocus: 1,
        foodFocus: 1.2,
        randomness: 0.2,
        commitment: 1,
        riskTolerance: 0.55
      }
    });
    const prey = movementPlayer(arena, config, 'near_prey', 22, {
      x: 470,
      y: 300,
      lives: 90
    });

    arena.players.set(hunter.username, hunter);
    arena.players.set(prey.username, prey);
    arena.setPlayerStrategy({ uniqueId: hunter.username, nickname: hunter.nickname }, 'hunt');
    arena.aiSpatialIndex = null;

    const decision = arena.chooseBehavior(hunter, config);

    expect(decision.mode).toBe('hunt-player');
    expect(decision.target.username).toBe('near_prey');
    expect(hunter.strategyOverride).toBe('hunt');
  });

  it('lets chat strategy flee prefer a reachable weapon while threatened', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { now: () => 1000, random: () => 0.5 });
    const config = arena.getConfig();
    const runner = movementPlayer(arena, config, 'strategy_runner', 22, {
      x: 360,
      y: 300,
      lives: 80
    });
    const threat = movementPlayer(arena, config, 'strategy_threat', 42, {
      x: 520,
      y: 300,
      lives: 220
    });

    arena.players.set(runner.username, runner);
    arena.players.set(threat.username, threat);
    arena.weaponPickups.set('safe_weapon', {
      id: 'safe_weapon',
      type: 'shield',
      tier: 'pickup',
      power: 2,
      durationMs: 9000,
      x: 260,
      y: 300,
      radius: config.weaponPickupRadius,
      spawnedAt: 1000,
      expiresAt: 20000
    });
    arena.setPlayerStrategy({ uniqueId: runner.username, nickname: runner.nickname }, 'flee');
    arena.aiSpatialIndex = null;

    const decision = arena.chooseBehavior(runner, config);

    expect(decision.mode).toBe('evade-weapon');
    expect(decision.target.id).toBe('safe_weapon');
  });

  it('lets chat strategy farm prefer food when not in immediate danger', () => {
    const { arena } = createArena({ maxWeaponPickups: 0 }, { now: () => 1000, random: () => 0.5 });
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'arena_farmer', 45, {
      x: 300,
      y: 300,
      lives: 180
    });
    const prey = movementPlayer(arena, config, 'arena_prey', 28, {
      x: 430,
      y: 300,
      lives: 120
    });

    arena.players.set(player.username, player);
    arena.players.set(prey.username, prey);
    arena.food.set('food_strategy', {
      id: 'food_strategy',
      x: 330,
      y: 300,
      value: 4,
      radius: config.foodRadius,
      spawnedAt: 1000,
      expiresAt: 20000
    });
    arena.setPlayerStrategy({ uniqueId: player.username, nickname: player.nickname }, 'farm');
    arena.aiSpatialIndex = null;

    const decision = arena.chooseBehavior(player, config);

    expect(decision.mode).toBe('hunt-food');
    expect(decision.target.id).toBe('food_strategy');
  });

  it('lets chat target bias movement toward the named target', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { now: () => 1000, random: () => 0.5 });
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'target_picker', 70, {
      x: 300,
      y: 300,
      lives: 320
    });
    const normalPrey = movementPlayer(arena, config, 'normal_prey', 26, {
      x: 390,
      y: 300,
      lives: 110
    });
    const marked = movementPlayer(arena, config, 'Marked Viewer', 25, {
      x: 520,
      y: 300,
      lives: 105
    });

    arena.players.set(player.username, player);
    arena.players.set(normalPrey.username, normalPrey);
    arena.players.set(marked.username, marked);
    arena.setPlayerTarget({ uniqueId: player.username, nickname: player.nickname }, 'marked');
    arena.aiSpatialIndex = null;

    const decision = arena.chooseBehavior(player, config);

    expect(decision.mode).toBe('hunt-player');
    expect(decision.target.username).toBe('Marked Viewer');
  });

  it('expires chat strategy and enforces per-player command cooldown', () => {
    let now = 1000;
    const { arena } = createArena({
      chatStrategyDurationMs: 1000,
      chatStrategyCooldownMs: 8000
    }, { now: () => now, random: () => 0.5 });

    arena.handleActivity({ uniqueId: 'cooldown_player', nickname: 'Cooldown' }, 'chat');
    const first = arena.handleChatStrategy({ uniqueId: 'cooldown_player', nickname: 'Cooldown' }, ['hunt']);
    const second = arena.handleChatStrategy({ uniqueId: 'cooldown_player', nickname: 'Cooldown' }, ['farm']);

    expect(first.success).toBe(true);
    expect(second).toEqual(expect.objectContaining({ success: false, cooldown: true }));

    now = 2100;
    arena.chooseBehavior(arena.players.get('cooldown_player'), arena.getConfig());

    expect(arena.players.get('cooldown_player').strategyOverride).toBe(null);
  });

  it('sends threatened unarmed players toward reachable weapons when the route is safe enough', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { now: () => 1000, random: () => 0.5 });
    const config = arena.getConfig();
    const runner = movementPlayer(arena, config, 'weapon_runner', 18, {
      x: 360,
      y: 300,
      weapon: null,
      lives: 55
    });
    const threat = movementPlayer(arena, config, 'weapon_chaser', 34, {
      x: 520,
      y: 300,
      vx: -1,
      vy: 0,
      weapon: null,
      lives: 180
    });

    arena.players.set(runner.username, runner);
    arena.players.set(threat.username, threat);
    arena.weaponPickups.set('safe_dash', {
      id: 'safe_dash',
      type: 'dash',
      tier: 'pickup',
      power: 3,
      durationMs: 9000,
      x: 260,
      y: 300,
      radius: config.weaponPickupRadius,
      spawnedAt: 1000,
      expiresAt: 20000
    });
    arena.aiSpatialIndex = null;

    const decision = arena.chooseBehavior(runner, config);

    expect(decision.mode).toBe('evade-weapon');
    expect(decision.target.id).toBe('safe_dash');
    expect(decision.vector.x).toBeLessThan(0);
  });

  it('serializes explicit AI states for readable arena strategy feedback', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { random: () => 0.5 });
    const config = arena.getConfig();
    const small = movementPlayer(arena, config, 'state_survivor', 14, {
      x: 360,
      y: 300,
      lives: 60
    });
    const large = movementPlayer(arena, config, 'state_predator', 42, {
      x: 500,
      y: 300,
      vx: -1,
      vy: 0,
      lives: 200
    });

    arena.players.set(small.username, small);
    arena.players.set(large.username, large);
    arena.aiSpatialIndex = null;

    const decision = arena.chooseBehavior(small, config);
    const serialized = arena._serializePlayer(small, config);

    expect(decision.mode).toBe('flee');
    expect(decision.state).toBe('retreating');
    expect(serialized.ai.state).toBe('retreating');
    expect(serialized.ai.stateLabel).toBe('RETREAT');
  });

  it('maps existing AI intents to tactical gameplay states', () => {
    const { arena } = createArena();
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'state_mapper', 40, { lives: 180 });
    const target = movementPlayer(arena, config, 'state_target', 18, { x: 430, y: 300, lives: 80 });
    const context = arena._buildAiContext(player, config);

    expect(arena._classifyAiState(player, { mode: 'wander', intent: 'wander' }, context, config)).toBe('scouting');
    expect(arena._classifyAiState(player, { mode: 'hunt-food', intent: 'feed' }, context, config)).toBe('farming');
    expect(arena._classifyAiState(player, { mode: 'hunt-weapon', intent: 'arm' }, context, config)).toBe('arming');
    expect(arena._classifyAiState(player, { mode: 'hunt-player', intent: 'attack', target }, context, config)).toBe('dueling');
    expect(arena._classifyAiState(player, { mode: 'pressure-player', intent: 'pressure', target }, context, config)).toBe('dominating');
    expect(arena._classifyAiState(player, {
      mode: 'hunt-food',
      intent: 'feed',
      metadata: { reason: 'recovery-food' }
    }, context, config)).toBe('recovering');
  });

  it('keeps AI states stable briefly while allowing urgent retreats to interrupt', () => {
    let now = 1000;
    const { arena } = createArena({ aiStateMinDurationMs: 1000 }, { now: () => now });
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'stateful_player', 40, { lives: 180 });
    const context = { now, personality: player.personality, sizeProfile: arena._sizeBehaviorProfile(player, config), threat: null };

    const farming = arena._resolveAiState(player, 'farming', { mode: 'hunt-food' }, context, config);
    expect(farming.state).toBe('farming');
    expect(farming.enteredAt).toBe(1000);

    now = 1300;
    const shortSwitch = arena._resolveAiState(player, 'dueling', { mode: 'hunt-player' }, {
      ...context,
      now
    }, config);
    expect(shortSwitch.state).toBe('farming');
    expect(shortSwitch.rawState).toBe('dueling');
    expect(shortSwitch.enteredAt).toBe(1000);

    const urgentRetreat = arena._resolveAiState(player, 'retreating', { mode: 'flee' }, {
      ...context,
      now,
      threat: { target: { username: 'danger' } }
    }, config);
    expect(urgentRetreat.state).toBe('retreating');
    expect(urgentRetreat.previousState).toBe('farming');
    expect(urgentRetreat.enteredAt).toBe(1300);
  });

  it('serializes AI state transition metadata for overlay and debugging', () => {
    const { arena } = createArena({}, { now: () => 5000 });
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'state_meta', 40, { lives: 180 });
    player.aiStateMemory = {
      state: 'arming',
      rawState: 'arming',
      previousState: 'scouting',
      enteredAt: 4200,
      updatedAt: 5000
    };

    const serialized = arena._serializePlayer(player, config);

    expect(serialized.ai.state).toBe('arming');
    expect(serialized.ai.stateLabel).toBe('ARM');
    expect(serialized.ai.previousState).toBe('scouting');
    expect(serialized.ai.rawState).toBe('arming');
    expect(serialized.ai.stateEnteredAt).toBe(4200);
    expect(serialized.ai.stateUpdatedAt).toBe(5000);
  });

  it('spawns a viewer ball automatically on live activity', () => {
    const { arena, io } = createArena();

    const result = arena.handleActivity({
      uniqueId: 'viewer_1',
      nickname: 'Viewer One',
      profilePictureUrl: 'https://example.test/avatar.png'
    }, 'chat');

    expect(result.success).toBe(true);
    expect(arena.players.has('viewer_1')).toBe(true);
    expect(result.player.nickname).toBe('Viewer One');
    expect(result.player.mass).toBeGreaterThan(arena.getConfig().baseMass);
    expect(result.player.energy).toBeGreaterThan(arena.getConfig().baseEnergy);
    expect(io.emit).toHaveBeenCalledWith('arena:player-updated', expect.objectContaining({
      username: 'viewer_1',
      activityType: 'chat'
    }));
  });

  it('does not queue or spawn viewers without a profile picture', () => {
    const { arena } = createArena();

    const joinResult = arena.handleActivity({
      uniqueId: 'missing_profile_joiner',
      nickname: 'Missing Profile',
      profilePictureUrl: ''
    }, 'join');
    const chatResult = arena.handleActivity({
      uniqueId: 'missing_profile_chatter',
      nickname: 'Missing Profile',
      profilePictureUrl: ''
    }, 'chat');
    const giftResult = arena.handleGift({
      uniqueId: 'missing_profile_gifter',
      nickname: 'Missing Profile',
      profilePictureUrl: '',
      giftName: 'Rose',
      giftId: 5655,
      repeatEnd: true
    });

    for (const result of [joinResult, chatResult, giftResult]) {
      expect(result).toEqual(expect.objectContaining({
        success: false,
        error: 'Profile picture required to spawn'
      }));
    }
    expect(arena.pendingSpawns.size).toBe(0);
    expect(arena.players.size).toBe(0);
  });

  it('queues joiners for 15 seconds before spawning them as smaller faster players', () => {
    let now = 1000;
    const { arena, io } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0
    }, { now: () => now, random: () => 0.5 });
    const config = arena.getConfig();

    const result = arena.handleActivity({
      uniqueId: 'pending_joiner',
      nickname: 'Pending Joiner'
    }, 'join');

    expect(result).toEqual(expect.objectContaining({
      success: true,
      pending: true,
      spawnsAt: now + 15000
    }));
    expect(arena.players.has('pending_joiner')).toBe(false);
    expect(io.emit).toHaveBeenCalledWith('arena:player-spawn-pending', expect.objectContaining({
      username: 'pending_joiner',
      spawnsAt: now + 15000
    }));

    now += 14999;
    arena.tick(14999);
    expect(arena.players.has('pending_joiner')).toBe(false);

    now += 1;
    arena.tick(1);

    const player = arena.players.get('pending_joiner');
    expect(player).toBeDefined();
    expect(player.lives).toBeCloseTo(config.spawnBaseLives, 5);
    expect(player.lives).toBeLessThan(config.baseLives);
    expect(player.mass).toBeLessThan(config.baseMass);
    expect(arena._movementMassMultiplier(player, config))
      .toBeGreaterThan(arena._movementMassMultiplier({ mass: config.baseMass }, config));
  });

  it('randomizes delayed default spawn lives across an unfair wider envelope', () => {
    const spawnWithRandom = spawnRandom => {
      let now = 1000;
      const { arena } = createArena({
        maxFood: 0,
        maxWeaponPickups: 0
      }, { now: () => now, random: () => spawnRandom });
      const config = arena.getConfig();

      arena.handleActivity({
        uniqueId: `variance_${spawnRandom}`,
        nickname: 'Variance'
      }, 'join');
      now += config.spawnDelayMs;
      arena.tick(config.spawnDelayMs);

      return { lives: arena.players.get(`variance_${spawnRandom}`).lives, config };
    };

    const low = spawnWithRandom(0);
    const high = spawnWithRandom(1);

    expect(low.lives).toBeLessThanOrEqual(low.config.spawnBaseLives * 0.45);
    expect(high.lives).toBeGreaterThan(high.config.baseLives);
    expect(high.lives).toBeLessThanOrEqual(high.config.spawnBaseLives * 2.6);
  });

  it('caps large random spawns below the current top ten player floor', () => {
    let now = 1000;
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0
    }, { now: () => now, random: () => 1 });
    const config = arena.getConfig();

    for (let i = 0; i < 10; i++) {
      arena.handleActivity({ uniqueId: `top_${i}`, nickname: `Top ${i}` }, 'chat');
      const player = arena.players.get(`top_${i}`);
      player.lives = 80 + i * 10;
      arena._syncRadius(player, config);
    }

    arena.handleActivity({ uniqueId: 'lucky_joiner', nickname: 'Lucky' }, 'join');
    now += config.spawnDelayMs;
    arena.tick(config.spawnDelayMs);

    const player = arena.players.get('lucky_joiner');
    const topTenFloor = Array.from(arena.players.values())
      .filter(entry => entry.username !== 'lucky_joiner')
      .map(entry => entry.lives)
      .sort((a, b) => b - a)[9];

    expect(player.lives).toBeLessThan(topTenFloor);
  });

  it('lets gifts sent during the pending spawn window improve spawn lives', () => {
    let now = 1000;
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      giftWeaponMappings: {
        boost_gift: {
          weaponType: 'speed',
          tier: 'small',
          power: 1.2,
          durationMs: 5000,
          growthBonus: 2
        }
      }
    }, { now: () => now, random: () => 0.5 });
    const config = arena.getConfig();

    arena.handleActivity({ uniqueId: 'gift_pending', nickname: 'Gift Pending' }, 'join');
    const giftResult = arena.handleGift({
      uniqueId: 'gift_pending',
      nickname: 'Gift Pending',
      giftName: 'Boost Gift',
      giftId: 'boost_gift',
      diamondCount: 2,
      repeatCount: 1
    });

    expect(giftResult).toEqual(expect.objectContaining({
      success: true,
      pending: true
    }));
    expect(arena.players.has('gift_pending')).toBe(false);

    now += config.spawnDelayMs;
    arena.tick(config.spawnDelayMs);

    const player = arena.players.get('gift_pending');
    expect(player.lives).toBeGreaterThan(config.spawnBaseLives + 45);
    expect(player.weapon).toEqual(expect.objectContaining({
      type: 'speed',
      sourceGift: 'Boost Gift'
    }));
    expect(player.weapon.startedAt).toBe(now);
  });

  it('puts eliminated players on a one minute activity respawn cooldown but lets gifts respawn immediately', () => {
    let now = 1000;
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      respawnCooldownMs: 60000,
      giftWeaponMappings: {
        comeback_gift: {
          weaponType: 'speed',
          tier: 'small',
          power: 1,
          durationMs: 5000,
          growthBonus: 0
        }
      }
    }, { now: () => now, random: () => 0.5 });
    const config = arena.getConfig();

    arena.handleActivity({ uniqueId: 'respawn_hunter', nickname: 'Hunter' }, 'chat');
    arena.handleActivity({ uniqueId: 'fallen_viewer', nickname: 'Fallen Viewer' }, 'chat');
    const hunter = arena.players.get('respawn_hunter');
    const fallen = arena.players.get('fallen_viewer');
    Object.assign(hunter, { x: 500, y: 500, mass: 80, vx: 0, vy: 0 });
    Object.assign(fallen, { x: 500, y: 500, mass: 18, vx: 0, vy: 0 });
    arena._syncRadius(hunter, config);
    arena._syncRadius(fallen, config);

    expect(arena._tryResolveAbsorption(hunter, fallen, config)).toBe(true);
    expect(arena.players.has('fallen_viewer')).toBe(false);

    const blockedLike = arena.handleActivity({
      uniqueId: 'fallen_viewer',
      nickname: 'Fallen Viewer',
      likeCount: 20
    }, 'like');

    expect(blockedLike).toEqual(expect.objectContaining({
      success: false,
      cooldown: true,
      username: 'fallen_viewer',
      respawnsAt: now + 60000,
      remainingMs: 60000
    }));
    expect(arena.players.has('fallen_viewer')).toBe(false);

    const giftResult = arena.handleGift({
      uniqueId: 'fallen_viewer',
      nickname: 'Fallen Viewer',
      giftName: 'Comeback Gift',
      giftId: 'comeback_gift',
      diamondCount: 2,
      repeatCount: 1
    });
    const respawned = arena.players.get('fallen_viewer');

    expect(giftResult).toEqual(expect.objectContaining({
      success: true,
      respawned: true
    }));
    expect(respawned).toBeDefined();
    expect(respawned.lives).toBeCloseTo(config.spawnBaseLives + config.giftLifePerCoin * 2, 5);
    expect(respawned.weapon).toEqual(expect.objectContaining({
      type: 'speed',
      sourceGift: 'Comeback Gift'
    }));
  });

  it('allows like respawn after the elimination cooldown expires', () => {
    let now = 1000;
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      respawnCooldownMs: 60000
    }, { now: () => now, random: () => 0.5 });
    const config = arena.getConfig();

    arena.handleActivity({ uniqueId: 'cooldown_hunter', nickname: 'Hunter' }, 'chat');
    arena.handleActivity({ uniqueId: 'cooldown_fallen', nickname: 'Fallen Viewer' }, 'chat');
    const hunter = arena.players.get('cooldown_hunter');
    const fallen = arena.players.get('cooldown_fallen');
    Object.assign(hunter, { x: 700, y: 500, mass: 80, vx: 0, vy: 0 });
    Object.assign(fallen, { x: 700, y: 500, mass: 18, vx: 0, vy: 0 });
    arena._syncRadius(hunter, config);
    arena._syncRadius(fallen, config);

    expect(arena._tryResolveAbsorption(hunter, fallen, config)).toBe(true);
    expect(arena.handleActivity({
      uniqueId: 'cooldown_fallen',
      nickname: 'Fallen Viewer',
      likeCount: 4
    }, 'like')).toEqual(expect.objectContaining({
      success: false,
      cooldown: true
    }));

    now += 60001;
    const respawnResult = arena.handleActivity({
      uniqueId: 'cooldown_fallen',
      nickname: 'Fallen Viewer',
      likeCount: 4
    }, 'like');

    expect(respawnResult.success).toBe(true);
    expect(respawnResult.player).toEqual(expect.objectContaining({
      username: 'cooldown_fallen'
    }));
    expect(arena.players.has('cooldown_fallen')).toBe(true);
  });

  it('spawns new small players outside immediate predator danger with a clear escape heading', () => {
    let now = 1000;
    const randomValues = [];
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      movement: { randomTurn: 0 }
    }, {
      now: () => now,
      random: () => randomValues.length ? randomValues.shift() : 0.5
    });
    const config = arena.getConfig();

    arena.handleActivity({ uniqueId: 'spawn_predator', nickname: 'Predator' }, 'chat');
    const predator = arena.players.get('spawn_predator');
    Object.assign(predator, { x: 960, y: 540, vx: 0, vy: 0, mass: 110, energy: 90 });
    arena._syncRadius(predator, config);

    randomValues.push(
      0.5,
      0.5, 0.5, 0.5,
      0.82, 0.5
    );
    arena.handleActivity({ uniqueId: 'fresh_small', nickname: 'Fresh Small' }, 'join');
    now += config.spawnDelayMs;
    arena.tick(1);

    const small = arena.players.get('fresh_small');
    const safeDistance = arena._dynamicFleeDistance(small, predator, config.movement, config) +
      predator.radius +
      small.radius * 0.45;
    const escapeAlignment = small.vx * (small.x - predator.x) + small.vy * (small.y - predator.y);

    expect(arena._distance(small, predator)).toBeGreaterThan(safeDistance);
    expect(escapeAlignment).toBeGreaterThan(0.5);
  });

  it('exposes a same-origin profile picture proxy for reliable avatar rendering', () => {
    const { arena } = createArena();

    arena.handleActivity({
      uniqueId: 'avatar_viewer',
      nickname: 'Avatar Viewer',
      profilePictureUrl: 'https://example.test/avatar.webp?size=72&sig=test'
    }, 'chat');

    const state = arena.getState('test');
    const player = state.players.find(entry => entry.username === 'avatar_viewer');

    expect(player.profilePictureUrl).toBe('https://example.test/avatar.webp?size=72&sig=test');
    expect(player.profilePictureProxyUrl).toBe(
      '/api/game-engine/arena/avatar?url=https%3A%2F%2Fexample.test%2Favatar.webp%3Fsize%3D72%26sig%3Dtest'
    );
  });

  it('shrinks inactive balls and removes balls once lives decay below the minimum', () => {
    let now = 1000;
    const { arena } = createArena({}, { now: () => now });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'quiet_viewer', nickname: 'Quiet' }, 'chat');

    const player = arena.players.get('quiet_viewer');
    player.lives = config.minLives + 1;
    player.energy = 4;
    player.lastActivityAt = 1000;
    arena._syncRadius(player, config);

    now = 1000 + config.inactivityGraceMs + 1000;
    arena.tick(1000);

    expect(arena.players.has('quiet_viewer')).toBe(false);
  });

  it('decays inactive lives gradually instead of converting old mass shrink into heavy life loss', () => {
    let now = 1000;
    const { arena } = createArena({}, { now: () => now });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'patient_viewer', nickname: 'Patient' }, 'chat');

    const player = arena.players.get('patient_viewer');
    player.lives = config.baseLives;
    player.lastActivityAt = 1000;
    arena._syncRadius(player, config);

    now = 1000 + config.inactivityGraceMs + 1000;
    arena.tick(1000);

    expect(arena.players.has('patient_viewer')).toBe(true);
    expect(player.lives).toBeGreaterThan(config.baseLives - 3);
  });

  it('applies mapped gift weapons with configured power and duration', () => {
    let now = 1000;
    const { arena } = createArena({
      giftWeaponMappings: {
        Galaxy: {
          weaponType: 'laser',
          tier: 'large',
          power: 5,
          durationMs: 9000,
          growthBonus: 6
        }
      }
    }, { now: () => now });

    const result = arena.handleGift({
      uniqueId: 'gifter',
      nickname: 'Gift Sender',
      giftName: 'Galaxy',
      repeatCount: 1
    });

    expect(result.success).toBe(true);
    expect(result.weapon).toEqual(expect.objectContaining({
      type: 'laser',
      tier: 'large',
      power: 5,
      sourceGift: 'Galaxy',
      expiresAt: 10000
    }));
    expect(arena.players.get('gifter').mass).toBeGreaterThan(arena.getConfig().baseMass + 5);

    now = 10001;
    arena.tick(16);
    expect(arena.players.get('gifter').weapon).toBe(null);
  });

  it('maps gift catalog ids to configured weapons', () => {
    const { arena } = createArena({
      giftWeaponMappings: {
        '5655': {
          weaponType: 'missile',
          tier: 'medium',
          power: 3.5,
          durationMs: 8500,
          growthBonus: 4
        }
      }
    });

    const result = arena.handleGift({
      uniqueId: 'catalog_gifter',
      nickname: 'Catalog Sender',
      giftName: 'Rose',
      giftId: 5655,
      repeatCount: 1
    });

    expect(result.success).toBe(true);
    expect(result.weapon).toEqual(expect.objectContaining({
      type: 'missile',
      tier: 'medium',
      power: 3.5,
      sourceGift: 'Rose'
    }));
  });

  it('ships curated catalog gift weapon mappings for common arena gifts', () => {
    const { arena } = createArena();
    const mappings = arena.getConfig().giftWeaponMappings;

    expect(mappings).toEqual(expect.objectContaining({
      '5655': expect.objectContaining({ giftName: 'Rose', weaponType: 'speed' }),
      '7171': expect.objectContaining({ giftName: 'Shield', weaponType: 'shield' }),
      '5827': expect.objectContaining({ giftName: 'Ice Cream Cone', weaponType: 'freeze' }),
      '6652': expect.objectContaining({ giftName: 'Lightning Bolt', weaponType: 'dash' }),
      '52616': expect.objectContaining({ giftName: 'Party Laser', weaponType: 'laser' }),
      '17825': expect.objectContaining({ giftName: 'Money Magnet', weaponType: 'magnet' }),
      '18361': expect.objectContaining({ giftName: 'Fireworks', weaponType: 'pulse' }),
      '7934': expect.objectContaining({ giftName: 'Heart Me', weaponType: 'vampire' }),
      '12852': expect.objectContaining({ giftName: 'Level Ship', weaponType: 'missile' }),
      '5587': expect.objectContaining({ giftName: 'Gold Mine', weaponType: 'mine' }),
      '11046': expect.objectContaining({ giftName: 'Galaxy', weaponType: 'blackhole' }),
      '6369': expect.objectContaining({ giftName: 'Lion', weaponType: 'chainsaw' })
    }));
  });

  it('uses cheaper default gift tiers so affordable gifts unlock stronger arena weapons', () => {
    const { arena } = createArena({}, { random: () => 0.99 });
    const config = arena.getConfig();

    expect(config.giftTiers.medium.minValue).toBeLessThanOrEqual(5);
    expect(config.giftTiers.large.minValue).toBeLessThanOrEqual(20);

    const mediumResult = arena.handleGift({
      uniqueId: 'medium_tier_gifter',
      nickname: 'Medium Tier',
      giftName: 'Affordable Medium',
      diamondCount: 5,
      repeatCount: 1
    });
    const largeResult = arena.handleGift({
      uniqueId: 'large_tier_gifter',
      nickname: 'Large Tier',
      giftName: 'Affordable Large',
      diamondCount: 20,
      repeatCount: 1
    });

    expect(mediumResult.weapon).toEqual(expect.objectContaining({ tier: 'medium' }));
    expect(largeResult.weapon).toEqual(expect.objectContaining({ tier: 'large' }));
  });

  it('makes chainsaw available from more affordable gift and pickup defaults', () => {
    const { arena } = createArena();
    const config = arena.getConfig();
    const chainsawPickup = config.weaponPickupTypes.find(definition => definition.type === 'chainsaw');

    expect(config.giftTiers.medium.weaponTypes).toContain('chainsaw');
    expect(config.giftTiers.large.weaponTypes.filter(type => type === 'chainsaw').length).toBeGreaterThanOrEqual(2);
    expect(chainsawPickup.weight).toBeGreaterThanOrEqual(22);
    expect(chainsawPickup.durationMs).toBeGreaterThanOrEqual(10500);
    expect(config.maxWeaponPickups).toBeGreaterThanOrEqual(10);
    expect(config.weaponPickupSpawnIntervalMs).toBeLessThanOrEqual(3500);
    expect(config.weaponPickupChance).toBeGreaterThanOrEqual(0.65);
    expect(config.weaponPickupDurationMs).toBeGreaterThanOrEqual(22000);
  });

  it('resolves default catalog gift weapons by id and by gift name', () => {
    const { arena } = createArena();

    const chainsawResult = arena.handleGift({
      uniqueId: 'lion_gifter',
      nickname: 'Lion Sender',
      giftName: 'Lion',
      giftId: 6369,
      diamondCount: 29999,
      repeatCount: 1
    });
    const magnetResult = arena.handleGift({
      uniqueId: 'magnet_gifter',
      nickname: 'Magnet Sender',
      giftName: 'Money Magnet',
      diamondCount: 549,
      repeatCount: 1
    });

    expect(chainsawResult.weapon).toEqual(expect.objectContaining({
      type: 'chainsaw',
      tier: 'large',
      sourceGift: 'Lion'
    }));
    expect(magnetResult.weapon).toEqual(expect.objectContaining({
      type: 'magnet',
      tier: 'medium',
      sourceGift: 'Money Magnet'
    }));
  });

  it('emits food-eaten events for overlay eating animations', () => {
    const { arena, io } = createArena();
    arena.handleActivity({ uniqueId: 'eater', nickname: 'Eater' }, 'chat');

    const player = arena.players.get('eater');
    player.x = 200;
    player.y = 200;
    player.radius = 20;
    arena.food.clear();
    arena.food.set('food_near', {
      id: 'food_near',
      x: 205,
      y: 200,
      radius: 5,
      value: 2
    });

    io.emit.mockClear();
    arena._resolveFoodCollisions(arena.getConfig());

    expect(io.emit).toHaveBeenCalledWith('arena:food-eaten', expect.objectContaining({
      username: 'eater',
      foodId: 'food_near',
      x: 205,
      y: 200,
      gain: 2
    }));
  });

  it('keeps ordinary food available for smaller players instead of letting max-mass balls clear it', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 });
    const config = arena.getConfig();
    const giant = movementPlayer(arena, config, 'giant_food_sweeper', 138, {
      x: 200,
      y: 200,
      energy: 110
    });
    arena.players.set(giant.username, giant);
    arena.food.clear();
    arena.food.set('small_player_food', {
      id: 'small_player_food',
      x: 205,
      y: 200,
      radius: config.foodRadius,
      value: config.foodValue,
      source: 'ambient',
      spawnedAt: 1000
    });

    arena._resolveFoodCollisions(config);

    expect(arena.food.has('small_player_food')).toBe(true);

    const small = movementPlayer(arena, config, 'small_food_collector', 12, {
      x: 205,
      y: 200,
      energy: 60
    });
    arena.players.set(small.username, small);

    arena._resolveFoodCollisions(config);

    expect(arena.food.has('small_player_food')).toBe(false);
    expect(small.mass).toBeGreaterThan(12);
  });

  it('damps normal food growth for heavy balls while preserving small-player growth', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 });
    const config = arena.getConfig();
    const small = movementPlayer(arena, config, 'small_growth', 12);
    const heavy = movementPlayer(arena, config, 'heavy_growth', 118);

    arena.players.set(small.username, small);
    arena.players.set(heavy.username, heavy);

    const beforeSmallMass = small.mass;
    arena.food.set('small_growth_food', {
      id: 'small_growth_food',
      x: small.x,
      y: small.y,
      radius: config.foodRadius,
      value: 2,
      source: 'ambient',
      spawnedAt: 1000
    });
    arena._consumeFood(small, 'small_growth_food', arena.food.get('small_growth_food'), config);
    const smallGain = small.mass - beforeSmallMass;

    const beforeHeavyMass = heavy.mass;
    arena.food.set('heavy_growth_food', {
      id: 'heavy_growth_food',
      x: heavy.x,
      y: heavy.y,
      radius: config.foodRadius,
      value: 2,
      source: 'ambient',
      spawnedAt: 1000
    });
    arena._consumeFood(heavy, 'heavy_growth_food', arena.food.get('heavy_growth_food'), config);
    const heavyGain = heavy.mass - beforeHeavyMass;

    expect(smallGain).toBeGreaterThan(1.5);
    expect(heavyGain).toBeLessThan(smallGain * 0.45);
  });

  it('does not let full-size players chase ordinary food when it no longer improves their game state', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 });
    const config = arena.getConfig();
    const giant = movementPlayer(arena, config, 'full_forager', 139, {
      x: 200,
      y: 200,
      energy: 110
    });
    arena.players.set(giant.username, giant);
    arena.food.clear();
    arena.food.set('ordinary_food', {
      id: 'ordinary_food',
      x: 250,
      y: 200,
      radius: config.foodRadius,
      value: config.foodValue,
      source: 'ambient',
      spawnedAt: 1000
    });

    const decision = arena.chooseBehavior(giant, config);

    expect(decision.mode).not.toBe('hunt-food');
    expect(decision.metadata.reason).toBe('no-useful-target');
  });

  it('does not send saturated giants across the arena for weak macro food', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 });
    const config = arena.getConfig();
    const giant = movementPlayer(arena, config, 'macro_food_giant', config.maxMass, {
      x: 620,
      y: 480,
      energy: 0,
      weapon: null
    });
    arena.players.set(giant.username, giant);
    arena.food.clear();
    arena.food.set('far_weak_drop', {
      id: 'far_weak_drop',
      x: config.foodRadius,
      y: config.arenaHeight - config.foodRadius,
      radius: config.foodRadius,
      value: config.foodValue,
      source: 'death-drop',
      spawnedAt: 1000,
      expiresAt: 200000
    });
    arena.aiSpatialIndex = null;

    expect(arena._rankFoodTarget(giant, config.movement, config)).toBeNull();
    expect(arena.chooseBehavior(giant, config).mode).not.toBe('hunt-food');
  });

  it('still lets saturated giants recover nearby life drops opportunistically', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 });
    const config = arena.getConfig();
    const giant = movementPlayer(arena, config, 'near_life_drop_giant', config.maxMass, {
      x: 620,
      y: 480,
      energy: 0,
      weapon: null
    });
    arena.players.set(giant.username, giant);
    arena.food.clear();
    arena.food.set('near_life_drop', {
      id: 'near_life_drop',
      x: giant.x + 80,
      y: giant.y,
      radius: config.foodRadius,
      value: config.foodValue * 2,
      source: 'life-drop',
      spawnedAt: 1000,
      expiresAt: 200000
    });
    arena.aiSpatialIndex = null;

    const target = arena._rankFoodTarget(giant, config.movement, config);

    expect(target).toEqual(expect.objectContaining({
      target: expect.objectContaining({ id: 'near_life_drop' })
    }));
  });

  it('breaks stale food locks when a much closer edible food target appears', () => {
    let now = 1000;
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { now: () => now, random: () => 0.5 });
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'stale_food_forager', 24, {
      x: 300,
      y: 300,
      energy: 70,
      weapon: null,
      personality: {
        id: 'forager',
        label: 'Forager',
        aggression: 0.72,
        fear: 1,
        intelligence: 1.15,
        weaponFocus: 0.8,
        foodFocus: 1.45,
        randomness: 0.35,
        commitment: 1.35,
        riskTolerance: 0.8
      }
    });
    arena.players.set(player.username, player);
    arena.food.clear();
    arena.food.set('far_food_lock', {
      id: 'far_food_lock',
      x: 730,
      y: 300,
      radius: config.foodRadius,
      value: config.foodValue,
      source: 'ambient',
      spawnedAt: now
    });
    arena.food.set('near_food_now', {
      id: 'near_food_now',
      x: 348,
      y: 300,
      radius: config.foodRadius,
      value: config.foodValue,
      source: 'ambient',
      spawnedAt: now
    });
    player.aiIntent = {
      mode: 'hunt-food',
      intent: 'feed',
      targetKey: 'entity:far_food_lock',
      vector: { x: 1, y: 0 },
      score: 80,
      metadata: {},
      weaponType: null,
      lockedUntil: now + config.movement.behaviorMemoryMs,
      updatedAt: now
    };
    now += 400;

    const decision = arena.chooseBehavior(player, config);

    expect(decision.mode).toBe('hunt-food');
    expect(decision.target.id).toBe('near_food_now');
  });

  it('lets blackhole weapons vacuum nearby food into the player', () => {
    let now = 1000;
    const { arena } = createArena({
      giftWeaponMappings: {
        Galaxy: {
          weaponType: 'blackhole',
          tier: 'large',
          power: 5,
          durationMs: 9000,
          growthBonus: 0
        }
      }
    }, { now: () => now });

    arena.handleGift({
      uniqueId: 'blackhole_user',
      nickname: 'Blackhole',
      giftName: 'Galaxy',
      repeatCount: 1
    });

    const player = arena.players.get('blackhole_user');
    player.x = 200;
    player.y = 200;
    player.vx = 0;
    player.vy = 0;
    player.mass = 26;
    player.score = 0;
    arena.food.clear();
    arena.food.set('near_food', {
      id: 'near_food',
      x: 206,
      y: 200,
      radius: 5,
      value: 2
    });

    now = 1100;
    arena.tick(100);

    expect(arena.food.has('near_food')).toBe(false);
    expect(player.mass).toBeGreaterThan(26);
    expect(player.score).toBeGreaterThan(0);
  });

  it('lets laser weapons drain smaller nearby targets', () => {
    let now = 1000;
    const { arena } = createArena({
      giftWeaponMappings: {
        LaserGift: {
          weaponType: 'laser',
          tier: 'medium',
          power: 4,
          durationMs: 9000,
          growthBonus: 0
        }
      }
    }, { now: () => now, random: () => 0.5 });

    arena.handleGift({
      uniqueId: 'laser_user',
      nickname: 'Laser',
      giftName: 'LaserGift',
      repeatCount: 1
    });
    arena.handleActivity({ uniqueId: 'target_user', nickname: 'Target' }, 'chat');

    const laser = arena.players.get('laser_user');
    const target = arena.players.get('target_user');
    laser.x = 200;
    laser.y = 200;
    laser.vx = 0;
    laser.vy = 0;
    laser.mass = 40;
    laser.score = 0;
    target.x = 255;
    target.y = 200;
    target.vx = 0;
    target.vy = 0;
    target.mass = 20;

    now = 1500;
    arena.tick(500);

    expect(target.mass).toBeLessThan(20);
    expect(laser.score).toBeGreaterThan(0);
  });

  it('spawns random weapon pickups and exposes them in arena state', () => {
    const { arena } = createArena({
      maxWeaponPickups: 3,
      weaponPickupTypes: [
        { type: 'shield', power: 2, durationMs: 7000, weight: 1 }
      ]
    }, { random: () => 0.5 });

    arena.spawnWeaponPickup();

    const state = arena.getState('test');
    expect(state.weaponPickups).toHaveLength(1);
    expect(state.weaponPickups[0]).toEqual(expect.objectContaining({
      type: 'shield',
      power: 2,
      radius: expect.any(Number)
    }));
  });

  it('uses lives as the source for ball size with balanced like and gift growth', () => {
    const { arena } = createArena({
      giftWeaponMappings: {
        coin_gift: {
          weaponType: 'speed',
          tier: 'small',
          power: 1,
          durationMs: 5000,
          growthBonus: 0
        }
      }
    });
    const config = arena.getConfig();

    const likeResult = arena.handleActivity({
      uniqueId: 'life_user',
      nickname: 'Life User',
      likeCount: 10
    }, 'like');
    const player = arena.players.get('life_user');

    expect(likeResult.success).toBe(true);
    expect(player.lives).toBe(config.baseLives + 10);
    expect(player.mass).toBeGreaterThan(config.baseMass);
    expect(likeResult.player).toEqual(expect.objectContaining({
      lives: config.baseLives + 10
    }));

    arena.handleGift({
      uniqueId: 'life_user',
      nickname: 'Life User',
      giftName: 'Coin Gift',
      giftId: 'coin_gift',
      diamondCount: 2,
      repeatCount: 3
    });

    expect(player.lives).toBe(config.baseLives + 10 + 150);
    expect(player.mass).toBeCloseTo(arena._livesToMass(player.lives, config), 5);
    expect(player.radius).toBeGreaterThan(likeResult.player.radius);
  });

  it('caps direct like growth at the configured mass while gifts still grow past it', () => {
    const { arena } = createArena({
      likeGrowthMaxMass: 26,
      giftWeaponMappings: {
        cap_gift: {
          weaponType: 'speed',
          tier: 'small',
          power: 1,
          durationMs: 5000,
          growthBonus: 0
        }
      }
    });
    const config = arena.getConfig();

    const firstLike = arena.handleActivity({
      uniqueId: 'like_cap_user',
      nickname: 'Like Cap User',
      likeCount: 500
    }, 'like');
    const player = arena.players.get('like_cap_user');
    const capLives = arena._massToLives(26, config);

    expect(firstLike.success).toBe(true);
    expect(player.lives).toBeCloseTo(capLives, 5);
    expect(player.mass).toBeCloseTo(26, 5);

    arena.handleActivity({
      uniqueId: 'like_cap_user',
      nickname: 'Like Cap User',
      likeCount: 500
    }, 'like');

    expect(player.lives).toBeCloseTo(capLives, 5);
    expect(player.mass).toBeCloseTo(26, 5);

    arena.handleGift({
      uniqueId: 'like_cap_user',
      nickname: 'Like Cap User',
      giftName: 'Cap Gift',
      giftId: 'cap_gift',
      diamondCount: 2,
      repeatCount: 1
    });

    expect(player.lives).toBeGreaterThan(capLives);
    expect(player.mass).toBeGreaterThan(26);
  });

  it('merges gift events into an existing viewer ball when event identity fields differ', () => {
    const { arena, io } = createArena({
      giftWeaponMappings: {
        rose: {
          weaponType: 'speed',
          tier: 'small',
          power: 1.2,
          durationMs: 5000,
          growthBonus: 4
        }
      }
    });

    arena.handleActivity({
      uniqueId: 'stable_handle',
      nickname: 'Same Viewer'
    }, 'chat');
    const player = arena.players.get('stable_handle');
    const radiusBeforeGift = player.radius;

    const giftResult = arena.handleGift({
      userId: 'numeric_123',
      nickname: 'Same Viewer',
      giftName: 'Rose',
      giftId: 'rose',
      diamondCount: 2,
      repeatCount: 1
    });

    expect(giftResult.success).toBe(true);
    expect(arena.players.size).toBe(1);
    expect(arena.players.get('stable_handle')).toBe(player);
    expect(player.radius).toBeGreaterThan(radiusBeforeGift);
    expect(player.weapon).toEqual(expect.objectContaining({ type: 'speed' }));
    const spawnedCalls = io.emit.mock.calls.filter(([event]) => event === 'arena:player-spawned');
    expect(spawnedCalls).toHaveLength(1);
    expect(spawnedCalls[0][1]).toEqual(expect.objectContaining({ username: 'stable_handle' }));
  });

  it('uses the stable viewer handle over numeric ids so adapter event shapes do not double-spawn', () => {
    const { arena, io } = createArena();

    const chatResult = arena.handleActivity({
      username: 'handle_user',
      userId: '7429384756',
      nickname: 'Handle User'
    }, 'chat');
    const player = arena.players.get('handle_user');
    const radiusAfterChat = player.radius;

    const likeResult = arena.handleActivity({
      username: 'handle_user',
      userId: '7429384756',
      nickname: 'Handle User',
      likeCount: 8
    }, 'like');
    const giftResult = arena.handleGift({
      uniqueId: 'handle_user',
      username: 'handle_user',
      userId: '7429384756',
      nickname: 'Handle User',
      giftName: 'Rose',
      giftId: 5655,
      diamondCount: 1,
      repeatCount: 1
    });

    expect(chatResult.success).toBe(true);
    expect(likeResult.success).toBe(true);
    expect(giftResult.success).toBe(true);
    expect(arena.players.size).toBe(1);
    expect(arena.players.get('handle_user')).toBe(player);
    expect(player.radius).toBeGreaterThan(radiusAfterChat);
    expect(io.emit.mock.calls.filter(([event]) => event === 'arena:player-spawned')).toHaveLength(1);
  });

  it('includes at least five additional weapon types in pickups and gift pools', () => {
    const { arena } = createArena();
    const config = arena.getConfig();
    const newWeapons = ['freeze', 'dash', 'magnet', 'vampire', 'mine'];

    expect(config.weaponPickupTypes).toEqual(expect.arrayContaining(
      newWeapons.map(type => expect.objectContaining({ type }))
    ));
    expect([
      ...config.giftTiers.small.weaponTypes,
      ...config.giftTiers.medium.weaponTypes,
      ...config.giftTiers.large.weaponTypes
    ]).toEqual(expect.arrayContaining(newWeapons));
    expect(config.weaponPhysics).toEqual(expect.objectContaining({
      freezeRadius: expect.any(Number),
      dashSpeedBoost: expect.any(Number),
      magnetRadius: expect.any(Number),
      vampireDrainPerSecond: expect.any(Number),
      mineDamage: expect.any(Number)
    }));
  });

  it('includes chainsaw as a rare super weapon in pickups and large gifts', () => {
    const { arena } = createArena();
    const config = arena.getConfig();
    const pickupChainsaw = config.weaponPickupTypes.find(weapon => weapon.type === 'chainsaw');

    expect(config.weaponPickupTypes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'chainsaw' })
    ]));
    expect(pickupChainsaw.weight).toBeGreaterThanOrEqual(22);
    expect(pickupChainsaw.durationMs).toBeGreaterThanOrEqual(10500);
    expect(config.giftTiers.large.weaponTypes).toContain('chainsaw');
    expect(config.weaponPhysics).toEqual(expect.objectContaining({
      chainsawSpeedBoost: expect.any(Number),
      chainsawRequiredMassRatio: expect.any(Number),
      chainsawAbsorbOverlapBonus: expect.any(Number)
    }));
  });

  it('lets gift mappings unlock the chainsaw super weapon', () => {
    const { arena } = createArena({
      giftWeaponMappings: {
        'super-saw': {
          weaponType: 'chainsaw',
          tier: 'large',
          power: 4,
          durationMs: 10000,
          growthBonus: 5
        }
      }
    });

    const result = arena.handleGift({
      uniqueId: 'saw_user',
      nickname: 'Saw User',
      giftName: 'Super Saw',
      giftId: 'super-saw',
      repeatCount: 1
    });

    expect(result.success).toBe(true);
    expect(result.weapon).toEqual(expect.objectContaining({
      type: 'chainsaw',
      tier: 'large',
      power: 4
    }));
  });

  it('makes unarmed larger opponents flee defensively from an active chainsaw', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 });
    const config = arena.getConfig();
    const saw = movementPlayer(arena, config, 'saw_attacker', 42, {
      x: 300,
      y: 300,
      vx: 1,
      vy: 0,
      energy: 100,
      weapon: { type: 'chainsaw', tier: 'medium', power: 4, expiresAt: 9000 },
      personality: {
        id: 'berserker',
        label: 'Berserker',
        aggression: 1.55,
        fear: 0.6,
        intelligence: 1,
        weaponFocus: 1.4,
        foodFocus: 0.7,
        randomness: 0.2,
        commitment: 1.25,
        riskTolerance: 1.5
      }
    });
    const bigger = movementPlayer(arena, config, 'bigger_unarmed', 100, {
      x: 430,
      y: 300,
      vx: -1,
      vy: 0,
      energy: 85,
      weapon: null,
      personality: {
        id: 'survivor',
        label: 'Survivor',
        aggression: 0.75,
        fear: 1.45,
        intelligence: 1.1,
        weaponFocus: 0.9,
        foodFocus: 0.8,
        randomness: 0.25,
        commitment: 1.2,
        riskTolerance: 0.55
      }
    });
    arena.players.set(saw.username, saw);
    arena.players.set(bigger.username, bigger);
    arena.aiSpatialIndex = null;

    const decision = arena.chooseBehavior(bigger, config);

    expect(decision.mode).toBe('flee');
    expect(decision.target.username).toBe('saw_attacker');
    expect(decision.vector.x).toBeGreaterThan(0);
  });

  it('makes chainsaw bounce deal visible life damage and drop collectible life food from larger targets', () => {
    const { arena, io } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0
    });
    const config = arena.getConfig();
    const saw = movementPlayer(arena, config, 'bounce_saw', 44, {
      x: 300,
      y: 300,
      weapon: { type: 'chainsaw', tier: 'medium', power: 4, expiresAt: 9000 }
    });
    const larger = movementPlayer(arena, config, 'bounce_large', 110, {
      x: 335,
      y: 300,
      weapon: null
    });
    arena.players.set(saw.username, saw);
    arena.players.set(larger.username, larger);
    const beforeLives = larger.lives;

    expect(arena._tryResolveChainsawCollision(saw, larger, config)).toBe(true);

    expect(larger.lives).toBeLessThan(beforeLives * 0.78);
    expect(arena.food.size).toBeGreaterThanOrEqual(config.weaponPhysics.chainsawLifeDropCount);
    expect(io.emit).toHaveBeenCalledWith('arena:chainsaw-hit', expect.objectContaining({
      attacker: 'bounce_saw',
      target: 'bounce_large',
      mode: 'bounce',
      lifeDamage: expect.any(Number),
      foodDrops: expect.any(Number)
    }));
  });

  it('keeps chainsaw life drops collectible with long slow fade and tight spawn spread', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0
    }, { random: () => 0.5 });
    const config = arena.getConfig();
    const saw = movementPlayer(arena, config, 'slow_life_drop_saw', 42, {
      x: 300,
      y: 300,
      weapon: { type: 'chainsaw', tier: 'medium', power: 4, expiresAt: 9000 }
    });
    const larger = movementPlayer(arena, config, 'slow_life_drop_target', 112, {
      x: 336,
      y: 300,
      weapon: null
    });
    const dropOrigin = { x: larger.x, y: larger.y };
    arena.players.set(saw.username, saw);
    arena.players.set(larger.username, larger);

    expect(arena._tryResolveChainsawCollision(saw, larger, config)).toBe(true);

    const lifeDrops = Array.from(arena.food.values()).filter(food => food.source === 'life-drop');
    expect(config.lifeDropDespawnMs).toBeGreaterThanOrEqual(180000);
    expect(config.lifeDropFadeMs).toBeGreaterThanOrEqual(45000);
    expect(config.lifeDropSpread).toBeLessThanOrEqual(48);
    expect(lifeDrops.length).toBeGreaterThanOrEqual(config.weaponPhysics.chainsawLifeDropCount);
    for (const food of lifeDrops) {
      expect(food.expiresAt - food.spawnedAt).toBeGreaterThanOrEqual(config.lifeDropDespawnMs);
      expect(food.fadeOutMs).toBeGreaterThanOrEqual(config.lifeDropFadeMs);
      expect(food.motionScale).toBeLessThanOrEqual(0.2);
      expect(arena._distance(food, dropOrigin)).toBeLessThanOrEqual(config.lifeDropSpread + food.radius + 1);
    }
  });

  it('freeze weapons slow nearby opponents', () => {
    let now = 1000;
    const { arena } = createArena({}, { now: () => now, random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'freezer', nickname: 'Freezer' }, 'chat');
    arena.handleActivity({ uniqueId: 'frozen_target', nickname: 'Target' }, 'chat');

    const freezer = arena.players.get('freezer');
    const target = arena.players.get('frozen_target');
    Object.assign(freezer, { x: 200, y: 200, mass: 40, weapon: { type: 'freeze', power: 3, expiresAt: 9000 } });
    Object.assign(target, { x: 260, y: 200, mass: 24, vx: 1, vy: 0, energy: 60 });
    arena._syncRadius(freezer, config);
    arena._syncRadius(target, config);

    arena._applyWeaponEffects(freezer, config, 0.2);

    expect(target.effects).toEqual(expect.objectContaining({
      slowedUntil: expect.any(Number),
      slowMultiplier: expect.any(Number)
    }));
    expect(target.effects.slowMultiplier).toBeLessThan(1);

    now = target.effects.slowedUntil - 100;
    const startX = target.x;
    arena._steerPlayer(target, { mode: 'hunt-food', target: { x: 900, y: 200 } }, config, 1);
    expect(target.x - startX).toBeLessThan(config.movement.baseSpeed);
  });

  it('dash weapons make players burst faster than normal speed weapons', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    config.movement.randomTurn = 0;
    config.movement.steeringStrength = 0.3;
    arena.handleActivity({ uniqueId: 'dash_runner', nickname: 'Dash' }, 'chat');
    arena.handleActivity({ uniqueId: 'speed_runner', nickname: 'Speed' }, 'chat');

    const dash = arena.players.get('dash_runner');
    const speed = arena.players.get('speed_runner');
    Object.assign(dash, { x: 300, y: 500, vx: 1, vy: 0, mass: 30, energy: 60, weapon: { type: 'dash', power: 3, expiresAt: 9000 } });
    Object.assign(speed, { x: 300, y: 500, vx: 1, vy: 0, mass: 30, energy: 60, weapon: { type: 'speed', power: 3, expiresAt: 9000 } });
    arena._syncRadius(dash, config);
    arena._syncRadius(speed, config);

    arena._steerPlayer(dash, { mode: 'hunt-food', target: { x: 900, y: 500 } }, config, 1);
    arena._steerPlayer(speed, { mode: 'hunt-food', target: { x: 900, y: 500 } }, config, 1);

    expect(dash.x - 300).toBeGreaterThan(speed.x - 300);
  });

  it('magnet weapons pull food and weaker opponents closer', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'magnet_user', nickname: 'Magnet' }, 'chat');
    arena.handleActivity({ uniqueId: 'magnet_prey', nickname: 'Prey' }, 'chat');

    const magnet = arena.players.get('magnet_user');
    const prey = arena.players.get('magnet_prey');
    Object.assign(magnet, { x: 200, y: 200, mass: 45, weapon: { type: 'magnet', power: 3, expiresAt: 9000 } });
    Object.assign(prey, { x: 330, y: 200, mass: 18 });
    arena.food.clear();
    arena.food.set('magnet_food', { id: 'magnet_food', x: 320, y: 200, radius: 5, value: 2 });
    arena._syncRadius(magnet, config);
    arena._syncRadius(prey, config);

    const foodStart = arena.food.get('magnet_food').x;
    const preyStart = prey.x;
    arena._applyWeaponEffects(magnet, config, 1);

    expect(arena.food.get('magnet_food').x).toBeLessThan(foodStart);
    expect(prey.x).toBeLessThan(preyStart);
  });

  it('vampire weapons steal lives from nearby smaller players', () => {
    const { arena } = createArena();
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'vampire_user', nickname: 'Vampire' }, 'chat');
    arena.handleActivity({ uniqueId: 'vampire_target', nickname: 'Target' }, 'chat');

    const vampire = arena.players.get('vampire_user');
    const target = arena.players.get('vampire_target');
    Object.assign(vampire, { x: 200, y: 200, mass: 42, weapon: { type: 'vampire', power: 3, expiresAt: 9000 } });
    Object.assign(target, { x: 250, y: 200, mass: 22 });
    arena._syncRadius(vampire, config);
    arena._syncRadius(target, config);
    const vampireLives = vampire.lives;
    const targetLives = target.lives;

    arena._applyWeaponEffects(vampire, config, 1);

    expect(vampire.lives).toBeGreaterThan(vampireLives);
    expect(target.lives).toBeLessThan(targetLives);
  });

  it('mine weapons drop traps that damage opponents entering the blast radius', () => {
    let now = 1000;
    const { arena } = createArena({}, { now: () => now, random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'miner', nickname: 'Miner' }, 'chat');
    arena.handleActivity({ uniqueId: 'mine_target', nickname: 'Target' }, 'chat');

    const miner = arena.players.get('miner');
    const target = arena.players.get('mine_target');
    Object.assign(miner, { x: 200, y: 200, mass: 40, weapon: { type: 'mine', power: 3, expiresAt: 9000 } });
    Object.assign(target, { x: 220, y: 200, mass: 28 });
    arena._syncRadius(miner, config);
    arena._syncRadius(target, config);

    arena._applyWeaponEffects(miner, config, 0.1);
    expect(arena.mines.size).toBe(1);
    const targetLives = target.lives;

    now += 50;
    arena._updateMines(config);

    expect(target.lives).toBeLessThan(targetLives);
    expect(arena.mines.size).toBe(0);
  });

  it('exposes render performance settings in arena state', () => {
    const { arena } = createArena({
      renderScale: 0.7,
      targetFps: 50,
      maxRenderPlayers: 48,
      rendererMode: 'auto'
    });

    const state = arena.getState('test');

    expect(state.config).toEqual(expect.objectContaining({
      renderScale: 0.7,
      targetFps: 50,
      maxRenderPlayers: 48,
      rendererMode: 'auto'
    }));
  });

  it('exposes arena field size and frame settings in arena state', () => {
    const { arena } = createArena({
      arenaSizePreset: 'wide',
      arenaWidth: 2560,
      arenaHeight: 1080,
      fieldFrameEnabled: true,
      fieldFrameDesign: 'hazard-zone',
      fieldFrameThickness: 5,
      fieldFrameGlow: 0.9
    });

    const config = arena.getConfig();
    const state = arena.getState('test');

    expect(config).toEqual(expect.objectContaining({
      arenaSizePreset: 'wide',
      arenaWidth: 2560,
      arenaHeight: 1080,
      fieldFrameEnabled: true,
      fieldFrameDesign: 'hazard-zone',
      fieldFrameThickness: 5,
      fieldFrameGlow: 0.9
    }));
    expect(state.config).toEqual(expect.objectContaining({
      arenaSizePreset: 'wide',
      arenaWidth: 2560,
      arenaHeight: 1080,
      fieldFrameEnabled: true,
      fieldFrameDesign: 'hazard-zone',
      fieldFrameThickness: 5,
      fieldFrameGlow: 0.9
    }));
  });

  it('exposes large ball transparency settings in arena state', () => {
    const { arena } = createArena({
      largeBallTransparencyEnabled: true,
      largeBallTransparencyStartMass: 64,
      largeBallMinOpacity: 0.36
    });

    const config = arena.getConfig();
    const state = arena.getState('test');

    expect(config).toEqual(expect.objectContaining({
      largeBallTransparencyEnabled: true,
      largeBallTransparencyStartMass: 64,
      largeBallMinOpacity: 0.36
    }));
    expect(state.config).toEqual(expect.objectContaining({
      largeBallTransparencyEnabled: true,
      largeBallTransparencyStartMass: 64,
      largeBallMinOpacity: 0.36
    }));
  });

  it('exposes top overlay design and rotator language settings in arena state', () => {
    const { arena } = createArena({
      topOverlayDesign: 'high-contrast',
      topOverlayPosition: 'bottom-right',
      topOverlayDensity: 'compact',
      topOverlayAccent: 'gold',
      topOverlayBackdrop: 'solid',
      topOverlayRotatorStyle: 'ticker',
      topOverlayTextScale: 'large',
      topOverlayShowTitle: false,
      topOverlayShowCount: false,
      topOverlayShowLeaderboard: false,
      topOverlayLeaderboardRows: 2,
      infoRotatorPlacement: 'below-field',
      infoRotatorLanguageMode: 'en',
      infoRotatorIntervalMs: 3600,
      infoRotatorMessages: ['Custom battle tip']
    });

    const config = arena.getConfig();
    const state = arena.getState('test');

    expect(config).toEqual(expect.objectContaining({
      topOverlayDesign: 'high-contrast',
      topOverlayPosition: 'bottom-right',
      topOverlayDensity: 'compact',
      topOverlayAccent: 'gold',
      topOverlayBackdrop: 'solid',
      topOverlayRotatorStyle: 'ticker',
      topOverlayTextScale: 'large',
      topOverlayShowTitle: false,
      topOverlayShowCount: false,
      topOverlayShowLeaderboard: false,
      topOverlayLeaderboardRows: 2,
      infoRotatorPlacement: 'below-field',
      infoRotatorLanguageMode: 'en',
      infoRotatorIntervalMs: 3600,
      infoRotatorMessages: ['Custom battle tip']
    }));
    expect(state.config).toEqual(expect.objectContaining({
      topOverlayDesign: 'high-contrast',
      topOverlayPosition: 'bottom-right',
      topOverlayDensity: 'compact',
      topOverlayAccent: 'gold',
      topOverlayBackdrop: 'solid',
      topOverlayRotatorStyle: 'ticker',
      topOverlayTextScale: 'large',
      topOverlayShowTitle: false,
      topOverlayShowCount: false,
      topOverlayShowLeaderboard: false,
      topOverlayLeaderboardRows: 2,
      infoRotatorPlacement: 'below-field',
      infoRotatorLanguageMode: 'en',
      infoRotatorIntervalMs: 3600,
      infoRotatorMessages: ['Custom battle tip']
    }));
  });

  it('defaults the arena top overlay to a bottom framed field for portrait OBS layouts', () => {
    const { arena } = createArena();
    const config = arena.getConfig();

    expect(config).toEqual(expect.objectContaining({
      topOverlayDesign: 'framed-field',
      topOverlayPosition: 'top-center',
      topOverlayDensity: 'full',
      topOverlayAccent: 'cyan',
      topOverlayBackdrop: 'solid',
      topOverlayRotatorStyle: 'card',
      topOverlayPlacement: 'below-field',
      topOverlayTextScale: 'very-large',
      topOverlayShowTitle: true,
      topOverlayShowCount: true,
      topOverlayShowLeaderboard: true,
      topOverlayLeaderboardRows: 3,
      infoRotatorPlacement: 'in-hud',
      infoRotatorLanguageMode: 'de-en'
    }));
  });

  it('defaults the arena field to the vertical stream-bottom layout with an enabled minimal frame', () => {
    const { arena } = createArena();
    const config = arena.getConfig();

    expect(config).toEqual(expect.objectContaining({
      arenaSizePreset: 'stream-bottom',
      arenaWidth: 1080,
      arenaHeight: 1000,
      fieldFrameEnabled: true,
      fieldFrameDesign: 'minimal',
      fieldFrameThickness: 3,
      fieldFrameGlow: 0.45
    }));
  });

  it('upgrades the old default neon-grid arena frame to the non-grid default', () => {
    const { arena } = createArena({
      fieldFrameDesign: 'neon-grid'
    });
    const config = arena.getConfig();

    expect(config.fieldFrameDesign).toBe('minimal');
  });

  it('defaults large ball transparency to an enabled conservative fade', () => {
    const { arena } = createArena();
    const config = arena.getConfig();

    expect(config).toEqual(expect.objectContaining({
      largeBallTransparencyEnabled: true,
      largeBallTransparencyMode: 'scale',
      largeBallTransparencyStartMass: 55,
      largeBallMinOpacity: 0.42
    }));
  });

  it('normalizes large ball transparency into selectable off, flat, and scaling modes', () => {
    const disabled = createArena({
      largeBallTransparencyEnabled: false
    }).arena.getConfig();
    const invalid = createArena({
      largeBallTransparencyMode: 'mostly'
    }).arena.getConfig();
    const flat = createArena({
      largeBallTransparencyMode: 'flat'
    }).arena.getConfig();

    expect(disabled.largeBallTransparencyMode).toBe('off');
    expect(invalid.largeBallTransparencyMode).toBe('scale');
    expect(flat.largeBallTransparencyMode).toBe('flat');
  });

  it('exposes transparency mode and life-drop timing in arena state for the overlay', () => {
    const { arena } = createArena({
      largeBallTransparencyMode: 'flat',
      lifeDropDespawnMs: 210000,
      lifeDropFadeMs: 60000,
      lifeDropSpread: 36
    });
    const state = arena.getState('test');

    expect(state.config).toEqual(expect.objectContaining({
      largeBallTransparencyMode: 'flat',
      lifeDropDespawnMs: 210000,
      lifeDropFadeMs: 60000,
      lifeDropSpread: 36
    }));
  });

  it('uses a throttled arena state cadence so OBS overlays keep frame time headroom', () => {
    const { arena } = createArena();
    const config = arena.getConfig();
    const state = arena.getState('test');

    expect(config.tickRateMs).toBeLessThanOrEqual(50);
    expect(config.stateEmitIntervalMs).toBeGreaterThanOrEqual(50);
    expect(config.stateEmitIntervalMs).toBeLessThanOrEqual(80);
    expect(state.config).toEqual(expect.objectContaining({
      tickRateMs: config.tickRateMs,
      stateEmitIntervalMs: config.stateEmitIntervalMs
    }));
  });

  it('upgrades legacy coarse tick and state cadence defaults', () => {
    const { arena } = createArena({
      tickRateMs: 100,
      stateEmitIntervalMs: 120,
      targetFps: 30
    });
    const config = arena.getConfig();

    expect(config.tickRateMs).toBeLessThanOrEqual(50);
    expect(config.stateEmitIntervalMs).toBeGreaterThanOrEqual(50);
    expect(config.targetFps).toBe(45);
  });

  it('upgrades previous 50ms arena cadence defaults to lower network pressure', () => {
    const { arena } = createArena({
      tickRateMs: 50,
      stateEmitIntervalMs: 50
    });
    const config = arena.getConfig();

    expect(config.tickRateMs).toBeLessThan(50);
    expect(config.stateEmitIntervalMs).toBeGreaterThan(50);
  });

  it('uses elapsed wall-clock time for scheduled arena ticks', () => {
    jest.useFakeTimers();
    try {
      let now = 1000;
      const { arena } = createArena({
        tickRateMs: 30
      }, { now: () => now });
      const tickSpy = jest.spyOn(arena, 'tick').mockImplementation(() => ({}));

      arena.start();
      now = 1045;
      jest.advanceTimersByTime(30);

      expect(tickSpy).toHaveBeenCalledWith(45);

      arena.destroy();
      tickSpy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not crash the process when a scheduled tick fires during database shutdown', () => {
    jest.useFakeTimers();
    try {
      let now = 1000;
      const { arena } = createArena({
        tickRateMs: 30
      }, { now: () => now });

      arena.start();
      arena.getConfig = jest.fn(() => {
        throw new Error('The database connection is not open');
      });
      now = 1030;

      expect(() => jest.advanceTimersByTime(30)).not.toThrow();
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Arena tick stopped during shutdown'));
      expect(arena.tickTimer).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('upgrades legacy inactivity shrink defaults to slower lives-based decay', () => {
    const { arena } = createArena({
      inactivityGraceMs: 15000,
      inactivityShrinkPerSecond: 5
    });
    const config = arena.getConfig();

    expect(config.inactivityGraceMs).toBeGreaterThanOrEqual(30000);
    expect(config.inactivityShrinkPerSecond).toBeLessThanOrEqual(1.25);
  });

  it('upgrades old arena growth caps so dominant balls do not flatten at the same max size', () => {
    const { arena } = createArena({
      maxMass: 90,
      maxLives: 2500
    });
    const config = arena.getConfig();

    expect(config.maxMass).toBeGreaterThan(90);
    expect(config.maxLives).toBeGreaterThan(2500);
  });

  it('upgrades previous arena action economy defaults for more volatile late games', () => {
    const { arena } = createArena({
      maxMass: 140,
      maxLives: 6000,
      playerAbsorbMassRatio: 0.7,
      playerAbsorbLifeStealRatio: 0.7,
      deathFoodDropCount: 12,
      deathFoodDropValue: 1.15
    });
    const config = arena.getConfig();

    expect(config.maxMass).toBeGreaterThan(140);
    expect(config.maxLives).toBeGreaterThan(6000);
    expect(config.playerAbsorbMassRatio).toBeGreaterThan(0.7);
    expect(config.playerAbsorbLifeStealRatio).toBeGreaterThan(0.7);
    expect(config.deathFoodDropCount).toBeGreaterThan(12);
    expect(config.deathFoodDropValue).toBeGreaterThan(1.15);
  });

  it('migrates old strict food defaults to calmer low-density arena food', () => {
    const { arena } = createArena({
      maxFood: 90,
      maxFoodRender: 52,
      foodValue: 2.25
    });
    const config = arena.getConfig();

    expect(config.maxFood).toBe(72);
    expect(config.maxFoodRender).toBe(66);
    expect(config.foodValue).toBe(1.35);
  });

  it('uses slow default food spawn and despawn timing to calm the arena screen', () => {
    const { arena } = createArena();
    const config = arena.getConfig();

    expect(config.foodSpawnIntervalMs).toBeGreaterThanOrEqual(1200);
    expect(config.foodSpawnBatchSize).toBeLessThanOrEqual(3);
    expect(config.foodDespawnMs).toBeGreaterThanOrEqual(90000);
    expect(config.foodBurstDespawnMs).toBeGreaterThanOrEqual(60000);
  });

  it('refills ambient food in small timed batches instead of instantly every tick', () => {
    let now = 1000;
    const { arena } = createArena({
      maxFood: 30,
      maxWeaponPickups: 0,
      foodSpawnIntervalMs: 1000,
      foodSpawnBatchSize: 2,
      foodDespawnMs: 60000
    }, { now: () => now });
    const config = arena.getConfig();
    arena.food.clear();
    arena.lastFoodSpawnAt = now;

    now += 500;
    arena.tick(500);
    expect(arena.food.size).toBe(0);

    now += 500;
    arena.tick(500);
    expect(arena.food.size).toBe(2);

    now += 1000;
    arena.tick(1000);
    expect(arena.food.size).toBe(4);
    expect(arena.food.size).toBeLessThan(config.maxFood);
  });

  it('uses food pacing to add one ambient refill dot per 2400 ms interval', () => {
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
  });

  it('serializes a long ambient fade window with food pacing', () => {
    const { arena } = createArena({
      maxFood: 3,
      foodBurstDespawnMs: 100000,
      lifeDropFadeMs: 55000
    });
    const config = arena.getConfig();

    arena.food.clear();
    arena.spawnFood(1);
    const ambient = [...arena.food.values()][0];

    expect(ambient).toEqual(expect.objectContaining({
      source: 'ambient',
      fadeOutMs: 48000
    }));
    expect(arena._foodFadeOutMs('death-drop', config)).toBe(26000);
    expect(arena._foodFadeOutMs('life-drop', config)).toBe(55000);
  });

  it('uses adaptive ambient food catch-up when active players deplete the arena', () => {
    let now = 1000;
    const { arena } = createArena({
      maxFood: 100,
      maxWeaponPickups: 0,
      foodSpawnIntervalMs: 1000,
      foodSpawnBatchSize: 2
    }, { now: () => now });
    const config = arena.getConfig();

    arena.food.clear();
    arena.lastFoodSpawnAt = now - config.foodSpawnIntervalMs;
    for (let i = 0; i < 10; i++) {
      arena.players.set(`depleted_player_${i}`, movementPlayer(arena, config, `depleted_player_${i}`, 18, {
        x: 100 + (i * 24),
        y: 180
      }));
    }

    arena._updateFood(config);

    expect(arena.food.size).toBeGreaterThan(config.foodSpawnBatchSize);
    expect(arena.food.size).toBeLessThanOrEqual(6);
  });

  it('keeps configured ambient food batches when the arena is not depleted', () => {
    let now = 1000;
    const { arena } = createArena({
      maxFood: 100,
      maxWeaponPickups: 0,
      foodSpawnIntervalMs: 1000,
      foodSpawnBatchSize: 2
    }, { now: () => now });
    const config = arena.getConfig();

    arena.food.clear();
    arena.spawnFood(70);
    arena.lastFoodSpawnAt = now - config.foodSpawnIntervalMs;
    for (let i = 0; i < 10; i++) {
      arena.players.set(`stable_player_${i}`, movementPlayer(arena, config, `stable_player_${i}`, 18, {
        x: 100 + (i * 24),
        y: 180
      }));
    }

    arena._updateFood(config);

    expect(arena.food.size).toBe(72);
  });

  it('expires food through configurable slow lifetimes while keeping burst food longer', () => {
    let now = 5000;
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      foodDespawnMs: 1000,
      foodBurstDespawnMs: 3000
    }, { now: () => now });
    const config = arena.getConfig();
    arena.food.set('old_ambient', arena._createFoodEntity({
      id: 'old_ambient',
      x: 100,
      y: 100,
      radius: 5,
      value: 1,
      source: 'ambient',
      spawnedAt: now - 2000
    }));
    arena.food.set('recent_burst', arena._createFoodEntity({
      id: 'recent_burst',
      x: 120,
      y: 100,
      radius: 5,
      value: 1,
      source: 'death-drop',
      spawnedAt: now - 2000
    }));

    arena.tick(100);

    expect(arena.food.has('old_ambient')).toBe(false);
    expect(arena.food.has('recent_burst')).toBe(true);
  });

  it('migrates sparse live food caps to calmer render-bounded defaults', () => {
    const { arena } = createArena({
      maxFood: 50,
      maxFoodRender: 25
    });
    const config = arena.getConfig();

    expect(config.maxFood).toBe(72);
    expect(config.maxFoodRender).toBe(66);
  });

  it('upgrades expensive legacy gift tier defaults to cheaper stream-friendly tiers', () => {
    const { arena } = createArena({
      giftTiers: {
        small: {
          minValue: 0,
          weaponTypes: ['speed', 'shield'],
          power: 1,
          durationMs: 6000,
          growthBonus: 1.5
        },
        medium: {
          minValue: 100,
          weaponTypes: ['laser', 'pulse'],
          power: 2.5,
          durationMs: 9000,
          growthBonus: 4
        },
        large: {
          minValue: 1000,
          weaponTypes: ['blackhole', 'missile'],
          power: 5,
          durationMs: 14000,
          growthBonus: 8
        }
      }
    });
    const config = arena.getConfig();

    expect(config.giftTiers.medium.minValue).toBeLessThanOrEqual(5);
    expect(config.giftTiers.large.minValue).toBeLessThanOrEqual(20);
  });

  it('upgrades previous cheap gift tier defaults to the newer lower weapon prices', () => {
    const { arena } = createArena({
      giftTiers: {
        small: {
          minValue: 0,
          weaponTypes: ['speed', 'shield', 'freeze', 'dash'],
          power: 1,
          durationMs: 6000,
          growthBonus: 1.5
        },
        medium: {
          minValue: 10,
          weaponTypes: ['laser', 'pulse', 'magnet', 'vampire', 'freeze', 'dash', 'chainsaw'],
          power: 2.5,
          durationMs: 9000,
          growthBonus: 4
        },
        large: {
          minValue: 50,
          weaponTypes: ['chainsaw', 'blackhole', 'missile', 'chainsaw', 'vampire', 'mine', 'magnet'],
          power: 5,
          durationMs: 14000,
          growthBonus: 8
        }
      }
    });
    const config = arena.getConfig();

    expect(config.giftTiers.medium.minValue).toBeLessThanOrEqual(5);
    expect(config.giftTiers.large.minValue).toBeLessThanOrEqual(20);
  });

  it('fills risk tolerance into saved personality profiles that predate risky AI', () => {
    const { arena } = createArena({
      personalityProfiles: [
        {
          id: 'berserker',
          label: 'Berserker',
          aggression: 1.45,
          fear: 0.68,
          intelligence: 0.82,
          weaponFocus: 0.85,
          foodFocus: 0.7,
          randomness: 0.6,
          commitment: 0.75
        }
      ]
    });
    const config = arena.getConfig();

    expect(config.personalityProfiles[0]).toEqual(expect.objectContaining({
      id: 'berserker',
      riskTolerance: expect.any(Number)
    }));
    expect(config.personalityProfiles[0].riskTolerance).toBeGreaterThan(1);
  });

  it('upgrades saved low chainsaw pickup weights so saws appear in live games', () => {
    const { arena } = createArena({
      weaponPickupTypes: [
        { type: 'speed', power: 1.2, durationMs: 7000, weight: 28 },
        { type: 'chainsaw', power: 4.4, durationMs: 9000, weight: 4 }
      ]
    });
    const config = arena.getConfig();
    const chainsaw = config.weaponPickupTypes.find(definition => definition.type === 'chainsaw');

    expect(chainsaw.weight).toBeGreaterThanOrEqual(22);
    expect(chainsaw.durationMs).toBeGreaterThanOrEqual(10500);
  });

  it('upgrades previous passive weapon pickup pacing so live games spawn more weapon chances', () => {
    const { arena } = createArena({
      maxWeaponPickups: 8,
      weaponPickupSpawnIntervalMs: 4500,
      weaponPickupChance: 0.45,
      weaponPickupDurationMs: 18000
    });
    const config = arena.getConfig();

    expect(config.maxWeaponPickups).toBeGreaterThanOrEqual(10);
    expect(config.weaponPickupSpawnIntervalMs).toBeLessThanOrEqual(3500);
    expect(config.weaponPickupChance).toBeGreaterThanOrEqual(0.65);
    expect(config.weaponPickupDurationMs).toBeGreaterThanOrEqual(22000);
  });

  it('upgrades legacy default movement config to smarter arena defaults', () => {
    const { arena } = createArena({
      movement: {
        baseSpeed: 90,
        fleeDistance: 180,
        huntDistance: 260,
        foodSenseDistance: 420,
        steeringStrength: 0.15,
        randomTurn: 0.18
      }
    });

    const config = arena.getConfig();

    expect(config.movement).toEqual(expect.objectContaining({
      fleeDistance: 360,
      huntDistance: 520,
      foodSenseDistance: 460,
      steeringStrength: 0.3,
      randomTurn: 0.032,
      fleeMassRatio: 0.98,
      huntMassRatio: 1.02,
      huntLeadSeconds: 0.65,
      threatLookaheadSeconds: 0.9,
      behaviorMemoryMs: 2600,
      targetSwitchScoreMargin: 3.8,
      wanderFocusMinMs: 2200,
      wanderFocusMaxMs: 4500
    }));
  });

  it('upgrades previous smart movement defaults to higher intelligence defaults', () => {
    const { arena } = createArena({
      movement: {
        baseSpeed: 90,
        fleeDistance: 260,
        huntDistance: 380,
        foodSenseDistance: 460,
        steeringStrength: 0.24,
        randomTurn: 0.08,
        fleeMassRatio: 1.08,
        huntMassRatio: 1.1,
        huntLeadSeconds: 0.45,
        boundaryAvoidanceDistance: 75
      }
    });

    const config = arena.getConfig();

    expect(config.movement).toEqual(expect.objectContaining({
      fleeDistance: 360,
      huntDistance: 520,
      steeringStrength: 0.3,
      randomTurn: 0.032,
      fleeMassRatio: 0.98,
      huntMassRatio: 1.02,
      threatLookaheadSeconds: 0.9,
      behaviorMemoryMs: 2600,
      targetSwitchScoreMargin: 3.8,
      wanderFocusMinMs: 2200,
      wanderFocusMaxMs: 4500
    }));
  });

  it('upgrades twitchy AI stability defaults to longer human-like decisions', () => {
    const { arena } = createArena({
      movement: {
        randomTurn: 0.04,
        behaviorMemoryMs: 1600,
        targetSwitchScoreMargin: 2.4,
        wanderFocusMinMs: 1400,
        wanderFocusMaxMs: 2800
      }
    });

    const config = arena.getConfig();

    expect(config.movement).toEqual(expect.objectContaining({
      randomTurn: 0.032,
      behaviorMemoryMs: 2600,
      targetSwitchScoreMargin: 3.8,
      wanderFocusMinMs: 2200,
      wanderFocusMaxMs: 4500
    }));
  });

  it('lets players collect weapon pickups from the arena', () => {
    let now = 1000;
    const { arena, io } = createArena({
      maxWeaponPickups: 2,
      weaponPickupRadius: 14,
      weaponPickupTypes: [
        { type: 'pulse', power: 3, durationMs: 8000, weight: 1 }
      ]
    }, { now: () => now, random: () => 0.5 });

    arena.handleActivity({ uniqueId: 'collector', nickname: 'Collector' }, 'chat');
    const player = arena.players.get('collector');
    player.x = 250;
    player.y = 250;
    arena.weaponPickups.clear();
    arena.weaponPickups.set('weapon_1', {
      id: 'weapon_1',
      type: 'pulse',
      tier: 'pickup',
      power: 3,
      durationMs: 8000,
      x: 252,
      y: 250,
      radius: 14,
      spawnedAt: now,
      expiresAt: now + 10000
    });

    now = 1200;
    arena.tick(100);

    expect(arena.weaponPickups.size).toBe(0);
    expect(player.weapon).toEqual(expect.objectContaining({
      type: 'pulse',
      power: 3,
      sourceGift: 'Arena Pickup'
    }));
    expect(io.emit).toHaveBeenCalledWith('arena:weapon-collected', expect.objectContaining({
      username: 'collector',
      pickupId: 'weapon_1',
      weapon: expect.objectContaining({ type: 'pulse' })
    }));
  });

  it('collects nearby food with a forgiving pickup radius instead of skimming past it', () => {
    const { arena, io } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0
    });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'food_collector', nickname: 'Collector' }, 'chat');
    const player = arena.players.get('food_collector');
    Object.assign(player, { x: 200, y: 200, mass: 18, energy: 60 });
    arena._syncRadius(player, config);

    const strictDistance = player.radius + config.foodRadius + 7;
    arena.food.clear();
    arena.food.set('skim_food', {
      id: 'skim_food',
      x: 200 + strictDistance,
      y: 200,
      radius: config.foodRadius,
      value: 2
    });

    arena._resolveFoodCollisions(config);

    expect(arena.food.has('skim_food')).toBe(false);
    expect(io.emit).toHaveBeenCalledWith('arena:food-eaten', expect.objectContaining({
      username: 'food_collector',
      foodId: 'skim_food'
    }));
  });

  it('collects nearby weapon pickups with a forgiving pickup radius', () => {
    const now = 1000;
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0
    }, { now: () => now });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'weapon_collector', nickname: 'Collector' }, 'chat');
    const player = arena.players.get('weapon_collector');
    Object.assign(player, { x: 300, y: 300, mass: 18, energy: 60, weapon: null });
    arena._syncRadius(player, config);

    const strictDistance = player.radius + config.weaponPickupRadius + 9;
    arena.weaponPickups.clear();
    arena.weaponPickups.set('skim_weapon', {
      id: 'skim_weapon',
      type: 'dash',
      tier: 'pickup',
      power: 2,
      durationMs: 6000,
      x: 300 + strictDistance,
      y: 300,
      radius: config.weaponPickupRadius,
      spawnedAt: now - 500,
      expiresAt: now + 10000
    });

    arena._resolveWeaponPickupCollisions(config);

    expect(arena.weaponPickups.has('skim_weapon')).toBe(false);
    expect(player.weapon).toEqual(expect.objectContaining({
      type: 'dash',
      sourceGift: 'Arena Pickup'
    }));
  });

  it('selects varied gift weapons from tier weapon pools when no explicit mapping exists', () => {
    const { arena } = createArena({
      giftTiers: {
        small: {
          minValue: 0,
          weaponTypes: ['speed', 'shield'],
          power: 1,
          durationMs: 6000,
          growthBonus: 1
        },
        medium: {
          minValue: 100,
          weaponTypes: ['laser', 'pulse'],
          power: 2,
          durationMs: 8000,
          growthBonus: 3
        },
        large: {
          minValue: 1000,
          weaponTypes: ['blackhole', 'missile'],
          power: 5,
          durationMs: 12000,
          growthBonus: 8
        }
      }
    }, { random: () => 0.99 });

    const result = arena.handleGift({
      uniqueId: 'varied_gifter',
      nickname: 'Varied',
      giftName: 'Big Gift',
      diamondCount: 1000,
      repeatCount: 1
    });

    expect(result.weapon).toEqual(expect.objectContaining({
      type: 'missile',
      tier: 'large'
    }));
  });

  it('throttles normal tick state snapshots while keeping activity snapshots immediate', () => {
    let now = 1000;
    const { arena, io } = createArena({
      stateEmitIntervalMs: 250
    }, { now: () => now });

    arena.handleActivity({ uniqueId: 'viewer_1', nickname: 'Viewer One' }, 'chat');
    expect(io.emit).toHaveBeenCalledWith('arena:state', expect.objectContaining({
      reason: 'activity'
    }));

    io.emit.mockClear();
    now = 1100;
    arena.tick(100);
    expect(io.emit).not.toHaveBeenCalledWith('arena:state', expect.any(Object));

    now = 1300;
    arena.tick(100);
    expect(io.emit).toHaveBeenCalledWith('arena:state', expect.objectContaining({
      reason: 'tick'
    }));
  });

  it('coalesces burst activity snapshots into one state packet per interval', () => {
    jest.useFakeTimers();
    try {
      let now = 1000;
      const { arena, io } = createArena({ stateEmitIntervalMs: 250 }, { now: () => now });

      arena.handleActivity({ uniqueId: 'viewer_1', nickname: 'Viewer One' }, 'chat');
      io.emit.mockClear();

      now = 1010;
      arena.handleActivity({ uniqueId: 'viewer_2', nickname: 'Viewer Two' }, 'chat');
      now = 1020;
      arena.handleActivity({ uniqueId: 'viewer_3', nickname: 'Viewer Three' }, 'chat');

      expect(io.emit).not.toHaveBeenCalledWith('arena:state', expect.any(Object));

      now = 1250;
      jest.advanceTimersByTime(240);

      const stateEmits = io.emit.mock.calls.filter(([eventName]) => eventName === 'arena:state');
      expect(stateEmits).toHaveLength(1);
      expect(stateEmits[0][1]).toEqual(expect.objectContaining({
        reason: 'activity',
        players: expect.arrayContaining([
          expect.objectContaining({ username: 'viewer_2' }),
          expect.objectContaining({ username: 'viewer_3' })
        ])
      }));
    } finally {
      jest.useRealTimers();
    }
  });

  it('chooses to flee from a larger nearby player before chasing food', () => {
    const { arena } = createArena();
    arena.handleActivity({ uniqueId: 'small', nickname: 'Small' }, 'chat');
    arena.handleActivity({ uniqueId: 'big', nickname: 'Big' }, 'chat');
    arena.spawnFood(1);

    const small = arena.players.get('small');
    const big = arena.players.get('big');
    small.x = 200;
    small.y = 200;
    small.mass = 20;
    big.x = 225;
    big.y = 200;
    big.mass = 40;

    const decision = arena.chooseBehavior(small, arena.getConfig());

    expect(decision.mode).toBe('flee');
    expect(decision.target.username).toBe('big');
  });

  it('flees from larger players before they are already touching', () => {
    const { arena } = createArena();
    arena.handleActivity({ uniqueId: 'small_far', nickname: 'Small' }, 'chat');
    arena.handleActivity({ uniqueId: 'big_far', nickname: 'Big' }, 'chat');

    const small = arena.players.get('small_far');
    const big = arena.players.get('big_far');
    small.x = 200;
    small.y = 200;
    small.mass = 20;
    big.x = 430;
    big.y = 200;
    big.mass = 42;

    const decision = arena.chooseBehavior(small, arena.getConfig());

    expect(decision.mode).toBe('flee');
    expect(decision.target.username).toBe('big_far');
  });

  it('anticipates approaching larger players before they enter the immediate danger radius', () => {
    const { arena } = createArena();
    arena.handleActivity({ uniqueId: 'lookahead_small', nickname: 'Small' }, 'chat');
    arena.handleActivity({ uniqueId: 'lookahead_big', nickname: 'Big' }, 'chat');

    const small = arena.players.get('lookahead_small');
    const big = arena.players.get('lookahead_big');
    Object.assign(small, { x: 200, y: 200, vx: 0, vy: 0, mass: 18 });
    Object.assign(big, { x: 545, y: 200, vx: -1, vy: 0, mass: 70 });
    arena._syncRadius(small, arena.getConfig());
    arena._syncRadius(big, arena.getConfig());

    const decision = arena.chooseBehavior(small, arena.getConfig());

    expect(decision.mode).toBe('flee');
    expect(decision.target.username).toBe('lookahead_big');
    expect(decision.vector.x).toBeLessThan(0);
  });

  it('hunts smaller nearby players before neutral food', () => {
    const { arena } = createArena();
    arena.handleActivity({ uniqueId: 'hunter', nickname: 'Hunter' }, 'chat');
    arena.handleActivity({ uniqueId: 'prey', nickname: 'Prey' }, 'chat');
    arena.spawnFood(1);

    const hunter = arena.players.get('hunter');
    const prey = arena.players.get('prey');
    hunter.x = 200;
    hunter.y = 200;
    hunter.mass = 40;
    prey.x = 240;
    prey.y = 200;
    prey.mass = 20;

    const decision = arena.chooseBehavior(hunter, arena.getConfig());

    expect(decision.mode).toBe('hunt-player');
    expect(decision.target.username).toBe('prey');
  });

  it('lets character traits change strategy in the same near-rival situation', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 });
    const config = arena.getConfig();
    const aggressive = movementPlayer(arena, config, 'aggressive_character', 42, {
      x: 200,
      y: 300,
      personality: {
        id: 'berserker',
        label: 'Berserker',
        aggression: 1.45,
        fear: 0.68,
        intelligence: 0.82,
        weaponFocus: 0.85,
        foodFocus: 0.7,
        randomness: 0.6,
        commitment: 0.75
      }
    });
    const defensive = movementPlayer(arena, config, 'defensive_character', 42, {
      x: 200,
      y: 520,
      personality: {
        id: 'survivor',
        label: 'Survivor',
        aggression: 0.72,
        fear: 1.42,
        intelligence: 1.15,
        weaponFocus: 1.3,
        foodFocus: 0.95,
        randomness: 0.42,
        commitment: 1.25
      }
    });
    const rival = movementPlayer(arena, config, 'near_rival', 36, { x: 310, y: 300 });
    const defensiveRival = movementPlayer(arena, config, 'near_rival_defensive', 36, { x: 310, y: 520 });
    arena.players.set(aggressive.username, aggressive);
    arena.players.set(defensive.username, defensive);
    arena.players.set(rival.username, rival);
    arena.players.set(defensiveRival.username, defensiveRival);
    arena.food.set('safe_food_for_defender', {
      id: 'safe_food_for_defender',
      x: 255,
      y: 575,
      radius: config.foodRadius,
      value: config.foodValue,
      source: 'ambient',
      spawnedAt: 1000
    });

    const aggressiveDecision = arena.chooseBehavior(aggressive, config);
    const defensiveDecision = arena.chooseBehavior(defensive, config);

    expect(aggressiveDecision.mode).toBe('pressure-player');
    expect(aggressiveDecision.target.username).toBe('near_rival');
    expect(defensiveDecision.mode).toBe('hunt-food');
    expect(defensiveDecision.target.id).toBe('safe_food_for_defender');
  });

  it('lets high-risk players take a kill on the escape lane while low-risk players still flee', () => {
    function runRiskDecision(riskTolerance) {
      const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { random: () => 0.5 });
      const config = arena.getConfig();
      const player = movementPlayer(arena, config, `risk_player_${riskTolerance}`, 42, {
        x: 320,
        y: 500,
        vx: 1,
        vy: 0,
        energy: 95,
        personality: {
          id: `risk_${riskTolerance}`,
          label: 'Risk Test',
          aggression: 1.05,
          fear: 1,
          intelligence: 1.05,
          weaponFocus: 1,
          foodFocus: 0.85,
          randomness: 0.45,
          commitment: 1,
          riskTolerance
        }
      });
      const prey = movementPlayer(arena, config, `risk_prey_${riskTolerance}`, 31, {
        x: 450,
        y: 500,
        vx: 0,
        vy: 0
      });
      const threat = movementPlayer(arena, config, `risk_threat_${riskTolerance}`, 88, {
        x: 205,
        y: 500,
        vx: 0.4,
        vy: 0
      });
      arena.players.set(player.username, player);
      arena.players.set(prey.username, prey);
      arena.players.set(threat.username, threat);

      expect(arena._playerAbsorbContext(player, prey, config).canAbsorb).toBe(true);
      expect(arena._playerAbsorbContext(threat, player, config).canAbsorb).toBe(true);

      return arena.chooseBehavior(player, config);
    }

    const boldDecision = runRiskDecision(1.65);
    const carefulDecision = runRiskDecision(0.35);

    expect(boldDecision.mode).toBe('hunt-player');
    expect(boldDecision.target.username).toBe('risk_prey_1.65');
    expect(carefulDecision.mode).toBe('flee');
    expect(carefulDecision.target.username).toBe('risk_threat_0.35');
  });

  it('keeps high-risk unarmed players from attacking rivals they cannot absorb', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0
    }, { random: () => 0.5 });
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'reckless_but_small', 30, {
      x: 260,
      y: 520,
      vx: 1,
      vy: 0,
      weapon: null,
      personality: {
        id: 'reckless',
        label: 'Reckless',
        aggression: 1.45,
        fear: 0.7,
        intelligence: 0.9,
        weaponFocus: 0.8,
        foodFocus: 0.7,
        randomness: 0.9,
        commitment: 0.7,
        riskTolerance: 1.65
      }
    });
    const rival = movementPlayer(arena, config, 'too_large_rival', 34, {
      x: 390,
      y: 520,
      vx: 0,
      vy: 0,
      weapon: null
    });
    arena.players.set(player.username, player);
    arena.players.set(rival.username, rival);

    expect(arena._playerAbsorbContext(player, rival, config).canAbsorb).toBe(false);

    const decision = arena.chooseBehavior(player, config);

    expect(decision.mode).not.toBe('hunt-player');
    expect(decision.target && decision.target.username).not.toBe('too_large_rival');
  });

  it('makes hungry low-energy hunters secure food instead of forcing a weak chase', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 });
    const config = arena.getConfig();
    const hunter = movementPlayer(arena, config, 'hungry_hunter', 44, {
      x: 200,
      y: 200,
      energy: 3,
      personality: {
        id: 'balanced',
        label: 'Balanced',
        aggression: 1,
        fear: 1,
        intelligence: 1,
        weaponFocus: 1,
        foodFocus: 1,
        randomness: 0.2,
        commitment: 1
      }
    });
    const prey = movementPlayer(arena, config, 'tiring_prey', 30, { x: 360, y: 200 });
    arena.players.set(hunter.username, hunter);
    arena.players.set(prey.username, prey);
    arena.food.set('recovery_food', {
      id: 'recovery_food',
      x: 242,
      y: 200,
      radius: config.foodRadius,
      value: config.foodValue,
      source: 'ambient',
      spawnedAt: 1000
    });

    const decision = arena.chooseBehavior(hunter, config);

    expect(decision.mode).toBe('hunt-food');
    expect(decision.metadata.reason).toMatch(/recovery|safe-food/);
  });

  it('does not orbit near-equal players that cannot actually be absorbed', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0
    }, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'orbit_hunter', nickname: 'Hunter' }, 'chat');
    arena.handleActivity({ uniqueId: 'near_equal_rival', nickname: 'Rival' }, 'chat');

    const hunter = arena.players.get('orbit_hunter');
    const rival = arena.players.get('near_equal_rival');
    Object.assign(hunter, {
      x: 200,
      y: 200,
      vx: 1,
      vy: 0,
      mass: 98,
      weapon: null,
      personality: {
        id: 'berserker',
        label: 'Berserker',
        aggression: 1.45,
        fear: 0.68,
        intelligence: 0.82,
        weaponFocus: 0.85,
        foodFocus: 0.7,
        randomness: 0.2,
        commitment: 1.2
      }
    });
    Object.assign(rival, { x: 360, y: 200, vx: 0, vy: 0, mass: 87, weapon: null });
    arena.food.clear();
    arena.food.set('safe_food', { id: 'safe_food', x: 235, y: 250, radius: 5, value: 3 });
    arena._syncRadius(hunter, config);
    arena._syncRadius(rival, config);

    expect(arena._playerAbsorbContext(hunter, rival, config).canAbsorb).toBe(false);

    const decision = arena.chooseBehavior(hunter, config);

    expect(decision.mode).toBe('hunt-food');
    expect(decision.target.id).toBe('safe_food');
  });

  it('pressures near-equal top rivals instead of wandering when direct absorb is not ready', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      maxMass: 260,
      maxLives: 22000,
      movement: { randomTurn: 0 }
    }, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'top_pressure_hunter', nickname: 'Hunter' }, 'chat');
    arena.handleActivity({ uniqueId: 'top_pressure_rival', nickname: 'Rival' }, 'chat');

    const hunter = arena.players.get('top_pressure_hunter');
    const rival = arena.players.get('top_pressure_rival');
    Object.assign(hunter, {
      x: 260,
      y: 300,
      vx: 1,
      vy: 0,
      mass: 170,
      lives: arena._massToLives(170, config),
      weapon: null,
      personality: {
        id: 'berserker',
        label: 'Berserker',
        aggression: 1.45,
        fear: 0.68,
        intelligence: 1.2,
        weaponFocus: 0.85,
        foodFocus: 0.7,
        randomness: 0.2,
        commitment: 1.25,
        riskTolerance: 1.35
      }
    });
    Object.assign(rival, {
      x: 470,
      y: 300,
      vx: -0.2,
      vy: 0,
      mass: 168,
      lives: arena._massToLives(168, config),
      weapon: null
    });
    arena.food.clear();
    arena.weaponPickups.clear();
    arena._syncRadius(hunter, config);
    arena._syncRadius(rival, config);

    expect(arena._playerAbsorbContext(hunter, rival, config).canAbsorb).toBe(false);

    const decision = arena.chooseBehavior(hunter, config);

    expect(decision.mode).toBe('pressure-player');
    expect(decision.target.username).toBe('top_pressure_rival');
  });

  it('uses aggressive strategy to grow toward a near-equal rival instead of taking irrelevant food', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0
    }, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'strategy_hunter', nickname: 'Hunter' }, 'chat');
    arena.handleActivity({ uniqueId: 'strategy_rival', nickname: 'Rival' }, 'chat');

    const hunter = arena.players.get('strategy_hunter');
    const rival = arena.players.get('strategy_rival');
    Object.assign(hunter, {
      x: 240,
      y: 500,
      vx: 1,
      vy: 0,
      mass: 30,
      weapon: null,
      personality: {
        id: 'berserker',
        label: 'Berserker',
        aggression: 1.45,
        fear: 0.68,
        intelligence: 0.95,
        weaponFocus: 0.85,
        foodFocus: 0.7,
        randomness: 0.2,
        commitment: 1.1
      }
    });
    Object.assign(rival, { x: 780, y: 500, vx: 0, vy: 0, mass: 32, weapon: null });
    arena.food.clear();
    arena.food.set('irrelevant_food', { id: 'irrelevant_food', x: 200, y: 500, radius: 5, value: 1.6 });
    arena.food.set('rival_lane_food', { id: 'rival_lane_food', x: 430, y: 500, radius: 5, value: 1.6 });
    arena._syncRadius(hunter, config);
    arena._syncRadius(rival, config);

    expect(arena._playerAbsorbContext(hunter, rival, config).canAbsorb).toBe(false);

    const decision = arena.chooseBehavior(hunter, config);

    expect(decision.mode).toBe('hunt-food');
    expect(decision.target.id).toBe('rival_lane_food');
    expect(decision.metadata.reason).toBe('strategic-growth');
  });

  it('does not pressure-chase unarmed near-equal rivals when no growth route exists', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0
    }, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'pressure_hunter', nickname: 'Hunter' }, 'chat');
    arena.handleActivity({ uniqueId: 'pressure_rival', nickname: 'Rival' }, 'chat');

    const hunter = arena.players.get('pressure_hunter');
    const rival = arena.players.get('pressure_rival');
    Object.assign(hunter, {
      x: 240,
      y: 500,
      vx: 1,
      vy: 0,
      mass: 30,
      weapon: null,
      personality: {
        id: 'berserker',
        label: 'Berserker',
        aggression: 1.45,
        fear: 0.68,
        intelligence: 0.95,
        weaponFocus: 0.85,
        foodFocus: 0.7,
        randomness: 0.2,
        commitment: 1.1
      }
    });
    Object.assign(rival, { x: 620, y: 500, vx: 0, vy: 0, mass: 30.4, weapon: null });
    arena.food.clear();
    arena.weaponPickups.clear();
    arena._syncRadius(hunter, config);
    arena._syncRadius(rival, config);

    const pressureTarget = arena._rankPressureTarget(hunter, config.movement, config);
    const decision = arena.chooseBehavior(hunter, config);

    expect(pressureTarget).toBeNull();
    expect(decision.mode).not.toBe('pressure-player');
    expect(decision.intent).not.toBe('pressure');
  });

  it('pressures meaningfully smaller rivals instead of chasing off-lane food noise', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0
    }, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'pressure_noise_hunter', nickname: 'Hunter' }, 'chat');
    arena.handleActivity({ uniqueId: 'pressure_noise_rival', nickname: 'Rival' }, 'chat');

    const hunter = arena.players.get('pressure_noise_hunter');
    const rival = arena.players.get('pressure_noise_rival');
    Object.assign(hunter, {
      x: 240,
      y: 500,
      vx: 1,
      vy: 0,
      mass: 35,
      weapon: null,
      personality: {
        id: 'berserker',
        label: 'Berserker',
        aggression: 1.45,
        fear: 0.68,
        intelligence: 0.95,
        weaponFocus: 0.85,
        foodFocus: 0.7,
        randomness: 0.2,
        commitment: 1.1
      }
    });
    Object.assign(rival, { x: 620, y: 500, vx: 0, vy: 0, mass: 30, weapon: null });
    arena.food.clear();
    arena.food.set('off_lane_food', { id: 'off_lane_food', x: 130, y: 710, radius: 5, value: 1.2 });
    arena.weaponPickups.clear();
    arena._syncRadius(hunter, config);
    arena._syncRadius(rival, config);

    expect(arena._playerAbsorbContext(hunter, rival, config).canAbsorb).toBe(false);

    const decision = arena.chooseBehavior(hunter, config);

    expect(decision.mode).toBe('pressure-player');
    expect(decision.intent).toBe('pressure');
    expect(decision.target.username).toBe('pressure_noise_rival');
    expect(decision.metadata.reason).toBe('pressure-rival');
    expect(decision.vector.x).toBeGreaterThan(0.55);
  });

  it('routes toward macro food clusters instead of wandering when local sense is empty', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      movement: {
        foodSenseDistance: 180,
        randomTurn: 0
      }
    }, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'macro_forager', nickname: 'Forager' }, 'chat');

    const player = arena.players.get('macro_forager');
    Object.assign(player, {
      x: 120,
      y: 120,
      vx: -1,
      vy: 0,
      mass: 18,
      weapon: null,
      personality: {
        id: 'forager',
        label: 'Forager',
        aggression: 0.84,
        fear: 1.08,
        intelligence: 1.2,
        weaponFocus: 0.8,
        foodFocus: 1.45,
        randomness: 0.25,
        commitment: 1.15
      }
    });
    arena.food.clear();
    arena.food.set('macro_cluster_a', { id: 'macro_cluster_a', x: 720, y: 120, radius: 5, value: 1.6 });
    arena.food.set('macro_cluster_b', { id: 'macro_cluster_b', x: 748, y: 142, radius: 5, value: 1.6 });
    arena.food.set('macro_cluster_c', { id: 'macro_cluster_c', x: 710, y: 166, radius: 5, value: 1.6 });
    arena._syncRadius(player, config);

    const decision = arena.chooseBehavior(player, config);

    expect(decision.mode).toBe('hunt-food');
    expect(decision.intent).toBe('feed');
    expect(decision.target.id).toMatch(/^macro_cluster_/);
    expect(decision.metadata.reason).toMatch(/macro-food|food-cluster/);
    expect(decision.vector.x).toBeGreaterThan(0.7);
  });

  it('serializes the current tactical AI role and intent into arena state', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0
    }, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'ai_state_player', nickname: 'AI State' }, 'chat');

    const player = arena.players.get('ai_state_player');
    Object.assign(player, { x: 200, y: 220, vx: 1, vy: 0, mass: 20, weapon: null });
    arena.food.clear();
    arena.food.set('state_food', { id: 'state_food', x: 280, y: 220, radius: 5, value: 2 });
    arena._syncRadius(player, config);

    arena.chooseBehavior(player, config);
    const state = arena.getState('test');
    const serialized = state.players.find(entry => entry.username === 'ai_state_player');

    expect(serialized.ai).toEqual(expect.objectContaining({
      role: expect.any(String),
      mode: 'hunt-food',
      intent: 'feed',
      targetKey: 'entity:state_food',
      reason: expect.any(String),
      planner: 'utility-ai-v4',
      navigation: 'influence-field'
    }));
  });

  it('lets dominant large players aggressively hunt valuable prey at longer range', () => {
    const { arena } = createArena();
    arena.handleActivity({ uniqueId: 'alpha_hunter', nickname: 'Alpha' }, 'chat');
    arena.handleActivity({ uniqueId: 'distant_prey', nickname: 'Prey' }, 'chat');

    const hunter = arena.players.get('alpha_hunter');
    const prey = arena.players.get('distant_prey');
    Object.assign(hunter, { x: 200, y: 500, vx: 1, vy: 0, mass: 86 });
    Object.assign(prey, { x: 700, y: 500, vx: -0.2, vy: 0, mass: 34 });
    arena._syncRadius(hunter, arena.getConfig());
    arena._syncRadius(prey, arena.getConfig());

    const decision = arena.chooseBehavior(hunter, arena.getConfig());

    expect(decision.mode).toBe('hunt-player');
    expect(decision.target.username).toBe('distant_prey');
  });

  it('uses predictive intercept steering instead of chasing prey current position', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'intercept_hunter', nickname: 'Hunter' }, 'chat');
    arena.handleActivity({ uniqueId: 'moving_prey', nickname: 'Prey' }, 'chat');

    const hunter = arena.players.get('intercept_hunter');
    const prey = arena.players.get('moving_prey');
    Object.assign(hunter, {
      x: 200,
      y: 200,
      vx: 1,
      vy: 0,
      mass: 58,
      personality: {
        id: 'tactician',
        label: 'Tactician',
        aggression: 1,
        fear: 0.95,
        intelligence: 1.45,
        weaponFocus: 1.25,
        foodFocus: 1,
        randomness: 0.25,
        commitment: 1.45
      }
    });
    Object.assign(prey, { x: 520, y: 200, vx: 0, vy: 1, mass: 24 });
    arena._syncRadius(hunter, config);
    arena._syncRadius(prey, config);

    const decision = arena.chooseBehavior(hunter, config);

    expect(decision.mode).toBe('hunt-player');
    expect(decision.intent).toBe('attack');
    expect(decision.vector.y).toBeGreaterThan(0.05);
    expect(decision.metadata).toEqual(expect.objectContaining({
      planner: 'utility-ai-v4'
    }));
  });

  it('uses spatial influence AI metadata for predator and escape decisions', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'influence_hunter', nickname: 'Hunter' }, 'chat');
    arena.handleActivity({ uniqueId: 'influence_prey', nickname: 'Prey' }, 'chat');

    const hunter = arena.players.get('influence_hunter');
    const prey = arena.players.get('influence_prey');
    Object.assign(hunter, { x: 220, y: 420, vx: -1, vy: 0, mass: 82, energy: 90 });
    Object.assign(prey, { x: 600, y: 420, vx: 0, vy: 1, mass: 28, energy: 70 });
    arena._syncRadius(hunter, config);
    arena._syncRadius(prey, config);

    const decision = arena.chooseBehavior(hunter, config);

    expect(decision.mode).toBe('hunt-player');
    expect(decision.metadata).toEqual(expect.objectContaining({
      planner: 'utility-ai-v4',
      navigation: 'influence-field',
      search: 'spatial-grid'
    }));
    expect(decision.metadata.interceptLeadSeconds).toBeGreaterThan(0);
  });

  it('uses spatial influence escape routing to move small players into safer lanes', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    config.movement.randomTurn = 0;
    arena.handleActivity({ uniqueId: 'lane_runner', nickname: 'Runner' }, 'chat');
    arena.handleActivity({ uniqueId: 'lane_threat', nickname: 'Threat' }, 'chat');
    arena.handleActivity({ uniqueId: 'lane_blocker', nickname: 'Blocker' }, 'chat');

    const runner = arena.players.get('lane_runner');
    const threat = arena.players.get('lane_threat');
    const blocker = arena.players.get('lane_blocker');
    Object.assign(runner, {
      x: 500,
      y: 500,
      vx: -1,
      vy: 0,
      mass: 15,
      energy: 95,
      personality: {
        id: 'survivor',
        label: 'Survivor',
        aggression: 0.65,
        fear: 1.55,
        intelligence: 1.45,
        weaponFocus: 1.1,
        foodFocus: 0.9,
        randomness: 0.2,
        commitment: 1.35
      }
    });
    Object.assign(threat, { x: 385, y: 500, vx: 1, vy: 0, mass: 76 });
    Object.assign(blocker, { x: 500, y: 365, vx: 0, vy: 1, mass: 62 });
    arena._syncRadius(runner, config);
    arena._syncRadius(threat, config);
    arena._syncRadius(blocker, config);

    const startThreatDistance = arena._distance(runner, threat);
    const startBlockerDistance = arena._distance(runner, blocker);
    const decision = arena.chooseBehavior(runner, config);
    arena._updatePlayer(runner, config, 0.45);

    expect(decision.mode).toBe('flee');
    expect(decision.metadata.navigation).toBe('influence-field');
    expect(arena._distance(runner, threat)).toBeGreaterThan(startThreatDistance + 35);
    expect(arena._distance(runner, blocker)).toBeGreaterThan(startBlockerDistance + 12);
  });

  it('turns aggressive hunters toward prey even when their current velocity points away', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    config.movement.randomTurn = 0;

    arena.handleActivity({ uniqueId: 'decisive_hunter', nickname: 'Hunter' }, 'chat');
    arena.handleActivity({ uniqueId: 'decisive_prey', nickname: 'Prey' }, 'chat');

    const hunter = arena.players.get('decisive_hunter');
    const prey = arena.players.get('decisive_prey');
    Object.assign(hunter, {
      x: 200,
      y: 500,
      vx: -1,
      vy: 0,
      mass: 80,
      energy: 90,
      personality: {
        id: 'berserker',
        label: 'Berserker',
        aggression: 1.45,
        fear: 0.68,
        intelligence: 0.82,
        weaponFocus: 0.85,
        foodFocus: 0.7,
        randomness: 0.2,
        commitment: 1.2
      }
    });
    Object.assign(prey, { x: 620, y: 500, vx: 0, vy: 0, mass: 24, energy: 60 });
    arena._syncRadius(hunter, config);
    arena._syncRadius(prey, config);

    const startDistance = arena._distance(hunter, prey);
    arena._updatePlayer(hunter, config, 0.25);

    expect(hunter.behaviorMemory.intent).toBe('attack');
    expect(hunter.vx).toBeGreaterThan(0.5);
    expect(arena._distance(hunter, prey)).toBeLessThan(startDistance - 20);
  });

  it('lets dominant hunters catch fleeing prey through route pressure and absorb radius', () => {
    let now = 1000;
    const { arena } = createArena({
      arenaWidth: 420,
      arenaHeight: 600,
      maxFood: 0,
      maxWeaponPickups: 0,
      movement: { randomTurn: 0 }
    }, { random: () => 0.5, now: () => now });
    const config = arena.getConfig();

    arena.handleActivity({ uniqueId: 'strike_hunter', nickname: 'Hunter' }, 'chat');
    arena.handleActivity({ uniqueId: 'strike_prey', nickname: 'Prey' }, 'chat');

    const hunter = arena.players.get('strike_hunter');
    const prey = arena.players.get('strike_prey');
    Object.assign(hunter, {
      x: 315,
      y: 300,
      vx: 1,
      vy: 0,
      mass: 70,
      energy: 100,
      personality: {
        id: 'berserker',
        label: 'Berserker',
        aggression: 1.45,
        fear: 0.68,
        intelligence: 0.95,
        weaponFocus: 0.85,
        foodFocus: 0.7,
        randomness: 0.2,
        commitment: 1.25
      }
    });
    Object.assign(prey, {
      x: 365,
      y: 300,
      vx: 1,
      vy: 0,
      mass: 28,
      energy: 100,
      personality: {
        id: 'survivor',
        label: 'Survivor',
        aggression: 0.65,
        fear: 1.55,
        intelligence: 1.25,
        weaponFocus: 1.1,
        foodFocus: 0.9,
        randomness: 0.2,
        commitment: 1.2
      }
    });
    arena._syncRadius(hunter, config);
    arena._syncRadius(prey, config);
    const startDistance = arena._distance(hunter, prey);
    const absorbContext = arena._playerAbsorbContext(hunter, prey, config);
    const hunterSpeed = arena._effectiveMovementSpeed(hunter, { mode: 'hunt-player', target: prey }, config);
    const preySpeed = arena._effectiveMovementSpeed(prey, { mode: 'flee', target: hunter }, config);

    expect(startDistance).toBeGreaterThan(absorbContext.absorbDistance);
    expect(preySpeed).toBeGreaterThan(hunterSpeed);

    for (let i = 0; i < 100 && arena.players.has('strike_prey'); i++) {
      now += 50;
      arena.tick(50);
    }

    expect(hunter.behaviorMemory.intent).toBe('attack');
    expect(arena.players.has('strike_prey')).toBe(false);
    expect(hunter.kills).toBe(1);
    expect(arena._distance(hunter, prey)).toBeLessThan(startDistance);
  });

  it('makes giant unarmed predators pressure far prey instead of raw chasing across the arena', () => {
    const { arena } = createArena({
      arenaWidth: 1100,
      arenaHeight: 700,
      maxFood: 0,
      maxWeaponPickups: 0,
      movement: { randomTurn: 0 }
    }, { random: () => 0.5 });
    const config = arena.getConfig();
    const hunter = movementPlayer(arena, config, 'route_pressure_giant', 260, {
      x: 160,
      y: 350,
      vx: 1,
      vy: 0,
      energy: 100,
      weapon: null,
      personality: {
        id: 'berserker',
        label: 'Berserker',
        aggression: 1.45,
        fear: 0.68,
        intelligence: 1.1,
        weaponFocus: 0.85,
        foodFocus: 0.7,
        randomness: 0.2,
        commitment: 1.25,
        riskTolerance: 1.45
      }
    });
    const prey = movementPlayer(arena, config, 'route_pressure_prey', 45, {
      x: 860,
      y: 350,
      vx: 1,
      vy: 0,
      energy: 100,
      weapon: null
    });
    arena.players.set(hunter.username, hunter);
    arena.players.set(prey.username, prey);
    arena.aiSpatialIndex = null;

    const decision = arena.chooseBehavior(hunter, config);

    expect(arena._distance(hunter, prey)).toBeGreaterThan(600);
    expect(decision.mode).toBe('pressure-player');
    expect(decision.intent).toBe('pressure');
    expect(decision.target.username).toBe('route_pressure_prey');
  });

  it('turns defensive players away from larger threats even when they are moving into danger', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    config.movement.randomTurn = 0;

    arena.handleActivity({ uniqueId: 'decisive_runner', nickname: 'Runner' }, 'chat');
    arena.handleActivity({ uniqueId: 'decisive_threat', nickname: 'Threat' }, 'chat');

    const runner = arena.players.get('decisive_runner');
    const threat = arena.players.get('decisive_threat');
    Object.assign(runner, {
      x: 300,
      y: 300,
      vx: 1,
      vy: 0,
      mass: 16,
      energy: 90,
      personality: {
        id: 'survivor',
        label: 'Survivor',
        aggression: 0.72,
        fear: 1.42,
        intelligence: 1.15,
        weaponFocus: 1.3,
        foodFocus: 0.95,
        randomness: 0.2,
        commitment: 1.25
      }
    });
    Object.assign(threat, { x: 510, y: 300, vx: -1, vy: 0, mass: 70, energy: 60 });
    arena._syncRadius(runner, config);
    arena._syncRadius(threat, config);

    const startDistance = arena._distance(runner, threat);
    arena._updatePlayer(runner, config, 0.25);

    expect(runner.behaviorMemory.intent).toBe('flee');
    expect(runner.vx).toBeLessThan(-0.5);
    expect(arena._distance(runner, threat)).toBeGreaterThan(startDistance + 20);
  });

  it('turns feeding players toward food even when current velocity points away', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      movement: { randomTurn: 0 }
    }, { random: () => 0.5 });
    const config = arena.getConfig();
    config.movement.randomTurn = 0;

    arena.handleActivity({ uniqueId: 'decisive_feeder', nickname: 'Feeder' }, 'chat');
    const feeder = arena.players.get('decisive_feeder');
    Object.assign(feeder, {
      x: 300,
      y: 300,
      vx: -1,
      vy: 0,
      mass: 18,
      energy: 60,
      personality: {
        id: 'forager',
        label: 'Forager',
        aggression: 0.84,
        fear: 1.08,
        intelligence: 0.95,
        weaponFocus: 0.8,
        foodFocus: 1.45,
        randomness: 0.2,
        commitment: 1.1
      }
    });
    arena.food.clear();
    arena.food.set('decisive_food', {
      id: 'decisive_food',
      x: 380,
      y: 300,
      radius: 5,
      value: 2
    });
    arena._syncRadius(feeder, config);

    const startDistance = arena._distance(feeder, arena.food.get('decisive_food'));
    arena._updatePlayer(feeder, config, 0.25);

    expect(feeder.behaviorMemory.intent).toBe('feed');
    expect(feeder.vx).toBeGreaterThan(0.45);
    expect(arena._distance(feeder, arena.food.get('decisive_food'))).toBeLessThan(startDistance - 18);
  });

  it('routes small defensive players to weapons while escaping a larger threat', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'routing_small', nickname: 'Small' }, 'chat');
    arena.handleActivity({ uniqueId: 'routing_threat', nickname: 'Threat' }, 'chat');

    const small = arena.players.get('routing_small');
    const threat = arena.players.get('routing_threat');
    Object.assign(small, {
      x: 250,
      y: 300,
      vx: 0,
      vy: 0,
      mass: 14,
      weapon: null,
      personality: {
        id: 'survivor',
        label: 'Survivor',
        aggression: 0.72,
        fear: 1.42,
        intelligence: 1.15,
        weaponFocus: 1.3,
        foodFocus: 0.95,
        randomness: 0.45,
        commitment: 1.25
      }
    });
    Object.assign(threat, { x: 330, y: 300, vx: -1, vy: 0, mass: 68 });
    arena.weaponPickups.clear();
    arena.weaponPickups.set('escape_saw', {
      id: 'escape_saw',
      type: 'chainsaw',
      tier: 'pickup',
      power: 4,
      durationMs: 9000,
      x: 120,
      y: 300,
      radius: 14,
      spawnedAt: 0,
      expiresAt: 20000
    });
    arena.food.clear();
    arena.food.set('unsafe_food', { id: 'unsafe_food', x: 305, y: 300, radius: 5, value: 3 });
    arena._syncRadius(small, config);
    arena._syncRadius(threat, config);

    const decision = arena.chooseBehavior(small, config);

    expect(decision.mode).toBe('evade-weapon');
    expect(decision.target.id).toBe('escape_saw');
    expect(decision.vector.x).toBeLessThan(0);
    expect(decision.metadata.threat.username).toBe('routing_threat');
  });

  it('keeps threatened players fleeing when a weapon would pull them back toward danger', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'bad_route_small', nickname: 'Small' }, 'chat');
    arena.handleActivity({ uniqueId: 'bad_route_threat', nickname: 'Threat' }, 'chat');

    const small = arena.players.get('bad_route_small');
    const threat = arena.players.get('bad_route_threat');
    Object.assign(small, {
      x: 250,
      y: 300,
      vx: 0,
      vy: 0,
      mass: 14,
      weapon: null,
      personality: {
        id: 'survivor',
        label: 'Survivor',
        aggression: 0.72,
        fear: 1.42,
        intelligence: 1.15,
        weaponFocus: 1.3,
        foodFocus: 0.95,
        randomness: 0.45,
        commitment: 1.25
      }
    });
    Object.assign(threat, { x: 330, y: 300, vx: -1, vy: 0, mass: 68 });
    arena.weaponPickups.clear();
    arena.weaponPickups.set('bait_weapon', {
      id: 'bait_weapon',
      type: 'chainsaw',
      tier: 'pickup',
      power: 4,
      durationMs: 9000,
      x: 430,
      y: 300,
      radius: 14,
      spawnedAt: 0,
      expiresAt: 20000
    });
    arena.food.clear();
    arena._syncRadius(small, config);
    arena._syncRadius(threat, config);

    const decision = arena.chooseBehavior(small, config);

    expect(decision.mode).toBe('flee');
    expect(decision.target.username).toBe('bad_route_threat');
    expect(decision.vector.x).toBeLessThan(0);
  });

  it('sends small unarmed players toward weapon pickups before neutral food', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'weapon_seeker', nickname: 'Seeker' }, 'chat');

    const seeker = arena.players.get('weapon_seeker');
    Object.assign(seeker, { x: 200, y: 200, vx: 1, vy: 0, mass: 14, weapon: null });
    arena._syncRadius(seeker, config);
    arena.food.clear();
    arena.food.set('near_food', { id: 'near_food', x: 230, y: 200, radius: 5, value: 2 });
    arena.weaponPickups.clear();
    arena.weaponPickups.set('weapon_escape', {
      id: 'weapon_escape',
      type: 'dash',
      tier: 'pickup',
      power: 2.2,
      durationMs: 5200,
      x: 315,
      y: 200,
      radius: 14,
      spawnedAt: 0,
      expiresAt: 20000
    });

    const decision = arena.chooseBehavior(seeker, config);

    expect(decision.mode).toBe('hunt-weapon');
    expect(decision.target.id).toBe('weapon_escape');
  });

  it('lets armed predators challenge near-equal players without making unarmed players panic-flee', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'armed_predator', nickname: 'Armed' }, 'chat');
    arena.handleActivity({ uniqueId: 'risky_prey', nickname: 'Risky' }, 'chat');

    const predator = arena.players.get('armed_predator');
    const prey = arena.players.get('risky_prey');
    Object.assign(predator, {
      x: 200,
      y: 200,
      vx: 1,
      vy: 0,
      mass: 30,
      weapon: { type: 'missile', power: 3, expiresAt: 9000 },
      personality: {
        id: 'balanced',
        label: 'Balanced',
        aggression: 1,
        fear: 1,
        intelligence: 1,
        weaponFocus: 1,
        foodFocus: 1,
        randomness: 0.55,
        commitment: 1
      }
    });
    Object.assign(prey, { x: 390, y: 200, vx: -0.2, vy: 0, mass: 31 });
    arena._syncRadius(predator, config);
    arena._syncRadius(prey, config);

    const armedDecision = arena.chooseBehavior(predator, config);
    predator.weapon = null;
    predator.behaviorMemory = null;
    const unarmedDecision = arena.chooseBehavior(predator, config);

    expect(armedDecision.mode).toBe('hunt-player');
    expect(armedDecision.target.username).toBe('risky_prey');
    expect(unarmedDecision.mode).not.toBe('hunt-player');
    expect(unarmedDecision.mode).not.toBe('flee');
  });

  it('chooses valuable prey over a closer tiny target when hunting', () => {
    const { arena } = createArena();
    arena.handleActivity({ uniqueId: 'smart_hunter', nickname: 'Hunter' }, 'chat');
    arena.handleActivity({ uniqueId: 'tiny_prey', nickname: 'Tiny' }, 'chat');
    arena.handleActivity({ uniqueId: 'good_prey', nickname: 'Good' }, 'chat');

    const hunter = arena.players.get('smart_hunter');
    const tiny = arena.players.get('tiny_prey');
    const good = arena.players.get('good_prey');
    hunter.x = 200;
    hunter.y = 200;
    hunter.mass = 70;
    tiny.x = 235;
    tiny.y = 200;
    tiny.mass = 9;
    good.x = 330;
    good.y = 200;
    good.mass = 38;

    const decision = arena.chooseBehavior(hunter, arena.getConfig());

    expect(decision.mode).toBe('hunt-player');
    expect(decision.target.username).toBe('good_prey');
  });

  it('keeps a valid prey target briefly to prevent jittery AI target switching', () => {
    let now = 1000;
    const { arena } = createArena({}, { now: () => now });
    arena.handleActivity({ uniqueId: 'steady_hunter', nickname: 'Hunter' }, 'chat');
    arena.handleActivity({ uniqueId: 'steady_prey', nickname: 'Prey A' }, 'chat');
    arena.handleActivity({ uniqueId: 'nearby_prey', nickname: 'Prey B' }, 'chat');

    const config = arena.getConfig();
    const hunter = arena.players.get('steady_hunter');
    const steadyPrey = arena.players.get('steady_prey');
    const nearbyPrey = arena.players.get('nearby_prey');

    Object.assign(hunter, { x: 200, y: 200, mass: 70 });
    Object.assign(steadyPrey, { x: 300, y: 200, mass: 34 });
    Object.assign(nearbyPrey, { x: 500, y: 200, mass: 36 });
    arena._syncRadius(hunter, config);
    arena._syncRadius(steadyPrey, config);
    arena._syncRadius(nearbyPrey, config);

    const firstDecision = arena.chooseBehavior(hunter, config);
    expect(firstDecision.target.username).toBe('steady_prey');

    nearbyPrey.x = 260;
    now += Math.floor(config.movement.behaviorMemoryMs / 2);

    const stableDecision = arena.chooseBehavior(hunter, config);
    expect(stableDecision.target.username).toBe('steady_prey');

    now += config.movement.behaviorMemoryMs + 1;

    const refreshedDecision = arena.chooseBehavior(hunter, config);
    expect(refreshedDecision.target.username).toBe('nearby_prey');
  });

  it('drops a locked attack when the prey grows beyond absorbable size', () => {
    let now = 1000;
    const { arena } = createArena({}, { now: () => now, random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'lock_hunter', nickname: 'Hunter' }, 'chat');
    arena.handleActivity({ uniqueId: 'growing_prey', nickname: 'Prey' }, 'chat');

    const hunter = arena.players.get('lock_hunter');
    const prey = arena.players.get('growing_prey');
    Object.assign(hunter, { x: 200, y: 200, vx: 1, vy: 0, mass: 98, weapon: null });
    Object.assign(prey, { x: 320, y: 200, vx: 0, vy: 0, mass: 60, weapon: null });
    arena.food.clear();
    arena.food.set('fallback_food', { id: 'fallback_food', x: 235, y: 250, radius: 5, value: 3 });
    arena._syncRadius(hunter, config);
    arena._syncRadius(prey, config);

    const firstDecision = arena.chooseBehavior(hunter, config);
    expect(firstDecision.mode).toBe('hunt-player');
    expect(firstDecision.target.username).toBe('growing_prey');

    prey.mass = 87;
    arena._syncRadius(prey, config);
    now += Math.floor(config.movement.behaviorMemoryMs / 2);

    expect(arena._playerAbsorbContext(hunter, prey, config).canAbsorb).toBe(false);

    const nextDecision = arena.chooseBehavior(hunter, config);

    expect(nextDecision.mode).toBe('hunt-food');
    expect(nextDecision.target.id).toBe('fallback_food');
  });

  it('limits same-target steering reversals while an intent is locked', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'committed_runner', 24, {
      x: 300,
      y: 300,
      vx: 1,
      vy: 0
    });
    const threat = movementPlayer(arena, config, 'committed_threat', 90, {
      x: 220,
      y: 300,
      vx: -1,
      vy: 0
    });
    arena.players.set(player.username, player);
    player.aiIntent = {
      mode: 'flee',
      intent: 'flee',
      targetKey: 'player:committed_threat',
      vector: { x: 1, y: 0 },
      score: 20,
      lockedUntil: 4000,
      updatedAt: 1000
    };

    const decision = arena._commitAiIntent(player, {
      mode: 'flee',
      intent: 'flee',
      target: threat,
      vector: { x: -1, y: 0 },
      score: 22,
      metadata: {}
    }, {
      now: 1200,
      movement: config.movement,
      personality: player.personality,
      config,
      threat: {
        target: threat,
        vector: { x: -1, y: 0 },
        threats: [{ target: threat }]
      },
      prey: null,
      pressure: null,
      weapon: null,
      food: null,
      boundary: { x: 0, y: 0 }
    }, config);

    expect(decision.vector.x).toBeGreaterThan(0.85);
    expect(decision.vector.y).not.toBe(0);
  });

  it('limits hard reversals when switching from food to a new combat target', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'combat_switcher', 42, {
      x: 300,
      y: 300,
      vx: 1,
      vy: 0
    });
    const prey = movementPlayer(arena, config, 'combat_switch_prey', 28, {
      x: 180,
      y: 300,
      vx: 0,
      vy: 0
    });
    arena.players.set(player.username, player);
    arena.players.set(prey.username, prey);
    player.aiIntent = {
      mode: 'hunt-food',
      intent: 'feed',
      targetKey: 'entity:old_food',
      vector: { x: 1, y: 0 },
      score: 12,
      lockedUntil: 4000,
      updatedAt: 1000
    };

    const decision = arena._commitAiIntent(player, {
      mode: 'hunt-player',
      intent: 'attack',
      target: prey,
      vector: { x: -1, y: 0 },
      score: 28,
      metadata: {}
    }, {
      now: 1300,
      movement: config.movement,
      personality: player.personality,
      config,
      threat: null,
      prey: { target: prey },
      pressure: null,
      weapon: null,
      food: null,
      boundary: { x: 0, y: 0 }
    }, config);

    expect(decision.vector.x).toBeGreaterThan(0.84);
    expect(Math.abs(decision.vector.y)).toBeGreaterThan(0.05);
  });

  it('keeps a locked flee lane instead of adopting an opposite escape vector immediately', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'lane_runner', 24, {
      x: 300,
      y: 300,
      vx: 1,
      vy: 0
    });
    const threat = movementPlayer(arena, config, 'lane_threat', 90, {
      x: 220,
      y: 300,
      vx: -1,
      vy: 0
    });
    player.aiIntent = {
      mode: 'flee',
      intent: 'flee',
      targetKey: 'player:lane_threat',
      vector: { x: 1, y: 0 },
      score: 20,
      lockedUntil: 4000,
      updatedAt: 1000
    };

    const vector = arena._vectorForPreviousIntent(player, threat, player.aiIntent, {
      movement: config.movement,
      personality: player.personality,
      config,
      threat: {
        target: threat,
        vector: { x: -1, y: 0 }
      },
      boundary: { x: 0, y: 0 }
    });

    expect(vector.x).toBeGreaterThan(0.98);
    expect(Math.abs(vector.y)).toBeGreaterThan(0.01);
    expect(Math.abs(vector.y)).toBeLessThan(0.15);
  });

  it('breaks a stale flee lock when the locked lane points into the real threat', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'stale_flee_runner', 20, {
      x: 300,
      y: 300,
      vx: 1,
      vy: 0
    });
    const threat = movementPlayer(arena, config, 'stale_flee_threat', 90, {
      x: 430,
      y: 300,
      vx: -1,
      vy: 0
    });
    const previous = {
      mode: 'flee',
      intent: 'flee',
      targetKey: 'player:stale_flee_threat',
      vector: { x: 1, y: 0 },
      score: 40,
      lockedUntil: 4000,
      updatedAt: 1000
    };

    const vector = arena._vectorForPreviousIntent(player, threat, previous, {
      movement: config.movement,
      personality: player.personality,
      config,
      threat: {
        target: threat,
        vector: { x: -1, y: 0 }
      },
      boundary: { x: 0, y: 0 }
    });

    expect(vector.x).toBeLessThan(-0.2);
  });

  it('breaks a locked flee lane that points into a nearby arena wall', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'wall_flee_runner', 18, {
      x: 48,
      y: 300,
      vx: -1,
      vy: 0
    });
    const threat = movementPlayer(arena, config, 'wall_flee_threat', 100, {
      x: 180,
      y: 300,
      vx: -1,
      vy: 0
    });
    player.aiIntent = {
      mode: 'flee',
      intent: 'flee',
      targetKey: 'player:wall_flee_threat',
      vector: { x: -1, y: 0 },
      score: 55,
      lockedUntil: 4000,
      updatedAt: 1000
    };

    const boundary = arena._boundaryAvoidanceVector(player, config);
    const decision = arena._commitAiIntent(player, {
      mode: 'flee',
      intent: 'flee',
      target: threat,
      vector: { x: -1, y: 0 },
      score: 57,
      metadata: {}
    }, {
      now: 1200,
      movement: config.movement,
      personality: player.personality,
      config,
      threat: {
        target: threat,
        vector: { x: -1, y: 0 },
        threats: [{ target: threat }]
      },
      prey: null,
      pressure: null,
      weapon: null,
      food: null,
      boundary
    }, config);

    expect(boundary.x).toBeGreaterThan(0);
    expect(decision.vector.x).toBeGreaterThan(0);
  });

  it('routes wall-trapped flee lanes inward even under strong large-enemy avoidance', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'wall_pressure_runner', 18, {
      x: 48,
      y: 300,
      vx: -1,
      vy: 0,
      personality: {
        id: 'survivor',
        label: 'Survivor',
        aggression: 0.65,
        fear: 1.55,
        intelligence: 1.25,
        weaponFocus: 1.1,
        foodFocus: 0.9,
        randomness: 0.2,
        commitment: 1.2
      }
    });
    const threat = movementPlayer(arena, config, 'wall_pressure_giant', 260, {
      x: 180,
      y: 300,
      vx: -1,
      vy: 0
    });
    arena.players.set(player.username, player);
    arena.players.set(threat.username, threat);
    player.aiIntent = {
      mode: 'flee',
      intent: 'flee',
      targetKey: 'player:wall_pressure_giant',
      vector: { x: -1, y: 0 },
      score: 55,
      lockedUntil: 4000,
      updatedAt: 1000
    };

    const boundary = arena._boundaryAvoidanceVector(player, config);
    const decision = arena._commitAiIntent(player, {
      mode: 'flee',
      intent: 'flee',
      target: threat,
      vector: { x: -1, y: 0 },
      score: 57,
      metadata: {}
    }, {
      now: 1200,
      movement: config.movement,
      personality: player.personality,
      config,
      threat: {
        target: threat,
        vector: { x: -1, y: 0 },
        threats: [{ target: threat }]
      },
      prey: null,
      pressure: null,
      weapon: null,
      food: null,
      boundary
    }, config);

    expect(decision.metadata.steering.threat).toBeGreaterThan(decision.metadata.steering.boundary);
    expect(decision.vector.x).toBeGreaterThan(0);
  });

  it('keeps corner wall escape inward on every active boundary axis', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'corner_pressure_runner', 22, {
      x: 46,
      y: 60,
      vx: 0.58,
      vy: -0.81,
      personality: {
        id: 'survivor',
        label: 'Survivor',
        aggression: 0.65,
        fear: 1.55,
        intelligence: 1.25,
        weaponFocus: 1.1,
        foodFocus: 0.9,
        randomness: 0.2,
        commitment: 1.2
      }
    });
    const threat = movementPlayer(arena, config, 'corner_pressure_giant', 86, {
      x: 89,
      y: 106,
      vx: -0.68,
      vy: -0.73
    });
    arena.players.set(player.username, player);
    arena.players.set(threat.username, threat);
    player.aiIntent = {
      mode: 'flee',
      intent: 'flee',
      targetKey: 'player:corner_pressure_giant',
      vector: { x: 0.58, y: -0.81 },
      score: 55,
      lockedUntil: 4000,
      updatedAt: 1000
    };

    const boundary = arena._boundaryAvoidanceVector(player, config);
    const decision = arena._commitAiIntent(player, {
      mode: 'flee',
      intent: 'flee',
      target: threat,
      vector: { x: -1, y: -1 },
      score: 57,
      metadata: {}
    }, {
      now: 1200,
      movement: config.movement,
      personality: player.personality,
      config,
      threat: {
        target: threat,
        vector: { x: -0.7, y: -0.7 },
        threats: [{ target: threat }]
      },
      prey: null,
      pressure: null,
      weapon: null,
      food: null,
      boundary
    }, config);

    expect(boundary.x).toBeGreaterThan(0);
    expect(boundary.y).toBeGreaterThan(0);
    expect(decision.vector.x).toBeGreaterThan(0);
    expect(decision.vector.y).toBeGreaterThan(0);
  });

  it('keeps a locked weapon-evade lane stable instead of orbiting the pickup', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'evade_runner', 24, {
      x: 300,
      y: 300,
      vx: 1,
      vy: 0
    });
    const threat = movementPlayer(arena, config, 'evade_threat', 90, {
      x: 220,
      y: 300,
      vx: -1,
      vy: 0
    });
    const weapon = { id: 'escape_weapon', x: 120, y: 300, radius: 14 };
    const previous = {
      mode: 'evade-weapon',
      intent: 'evade-arm',
      targetKey: 'entity:escape_weapon',
      vector: { x: 1, y: 0 },
      score: 20,
      lockedUntil: 4000,
      updatedAt: 1000
    };

    const vector = arena._vectorForPreviousIntent(player, weapon, previous, {
      movement: config.movement,
      personality: player.personality,
      config,
      threat: {
        target: threat,
        vector: { x: -1, y: 0 }
      },
      boundary: { x: 0, y: 0 }
    });

    expect(vector.x).toBeGreaterThan(0.99);
    expect(Math.abs(vector.y)).toBeLessThan(0.1);
  });

  it('makes small players faster than large players with the same steering intent', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    config.movement.randomTurn = 0;
    config.movement.steeringStrength = 0.3;

    arena.handleActivity({ uniqueId: 'fast_small', nickname: 'Small' }, 'chat');
    arena.handleActivity({ uniqueId: 'slow_big', nickname: 'Big' }, 'chat');
    const small = arena.players.get('fast_small');
    const big = arena.players.get('slow_big');
    const target = { x: 900, y: 500 };

    Object.assign(small, { x: 300, y: 500, vx: 1, vy: 0, mass: 10, energy: 60 });
    Object.assign(big, { x: 300, y: 500, vx: 1, vy: 0, mass: 80, energy: 60 });
    arena._syncRadius(small, config);
    arena._syncRadius(big, config);

    arena._steerPlayer(small, { mode: 'hunt-food', target }, config, 1);
    arena._steerPlayer(big, { mode: 'hunt-food', target }, config, 1);

    expect(small.x - 300).toBeGreaterThan(big.x - 300);
    expect(small.x - 300).toBeGreaterThan(115);
    expect(big.x - 300).toBeLessThan(110);
  });

  it('keeps small fleeing players faster than large unarmed hunters across common mass gaps', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      movement: { randomTurn: 0, steeringStrength: 0.3 }
    });
    const config = arena.getConfig();
    const massPairs = [
      [10, 80],
      [18, 100],
      [25, 120]
    ];

    for (const [preyMass, hunterMass] of massPairs) {
      const hunter = movementPlayer(arena, config, `hunter_${hunterMass}`, hunterMass, {
        x: 200,
        y: 300,
        energy: 80,
        weapon: null,
        personality: {
          id: 'berserker',
          label: 'Berserker',
          aggression: 1.45,
          fear: 0.68,
          intelligence: 0.95,
          weaponFocus: 0.85,
          foodFocus: 0.7,
          randomness: 0.2,
          commitment: 1.25
        }
      });
      const prey = movementPlayer(arena, config, `prey_${preyMass}`, preyMass, {
        x: 320,
        y: 300,
        energy: 80,
        weapon: null,
        personality: {
          id: 'survivor',
          label: 'Survivor',
          aggression: 0.65,
          fear: 1.55,
          intelligence: 1.25,
          weaponFocus: 1.1,
          foodFocus: 0.9,
          randomness: 0.2,
          commitment: 1.2
        }
      });

      const preySpeed = arena._effectiveMovementSpeed(prey, { mode: 'flee', target: hunter }, config);
      const hunterSpeed = arena._effectiveMovementSpeed(hunter, { mode: 'hunt-player', target: prey }, config);

      expect(preySpeed).toBeGreaterThan(hunterSpeed);
      expect(preySpeed).toBeGreaterThan(hunterSpeed * 1.12);
    }
  });

  it('makes small unarmed players flee early and increase distance from large predators', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      movement: { randomTurn: 0, steeringStrength: 0.3 }
    }, { random: () => 0.5 });
    const config = arena.getConfig();
    const small = movementPlayer(arena, config, 'early_flee_small', 18, {
      x: 500,
      y: 300,
      vx: 1,
      vy: 0,
      energy: 90,
      weapon: null,
      personality: {
        id: 'survivor',
        label: 'Survivor',
        aggression: 0.7,
        fear: 1.55,
        intelligence: 1.2,
        weaponFocus: 1,
        foodFocus: 0.8,
        randomness: 0.2,
        commitment: 1.25,
        riskTolerance: 0.5
      }
    });
    const predator = movementPlayer(arena, config, 'early_flee_predator', 105, {
      x: 1080,
      y: 300,
      vx: -1,
      vy: 0,
      energy: 80,
      weapon: null
    });
    arena.players.set(small.username, small);
    arena.players.set(predator.username, predator);
    arena.aiSpatialIndex = null;

    const decision = arena.chooseBehavior(small, config);
    const startDistance = arena._distance(small, predator);
    arena._steerPlayer(small, decision, config, 1);

    expect(decision.mode).toBe('flee');
    expect(decision.target.username).toBe('early_flee_predator');
    expect(arena._distance(small, predator)).toBeGreaterThan(startDistance + 100);
  });

  it('keeps the unarmed effective speed envelope mass ordered', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      movement: { randomTurn: 0, steeringStrength: 0.3 }
    });
    const config = arena.getConfig();
    const target = { x: 900, y: 300 };
    const speeds = [10, 18, 50, 80, 120].map(mass => {
      const player = movementPlayer(arena, config, `runner_${mass}`, mass, {
        x: 300,
        y: 300,
        energy: 60,
        weapon: null
      });
      return arena._effectiveMovementSpeed(player, { mode: 'hunt-food', target }, config);
    });

    for (let i = 0; i < speeds.length - 1; i++) {
      expect(speeds[i]).toBeGreaterThan(speeds[i + 1]);
    }
  });

  it('does not let hunt strike boost push a large unarmed hunter above small flee speed', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      movement: { randomTurn: 0, steeringStrength: 0.3 }
    });
    const config = arena.getConfig();
    const hunter = movementPlayer(arena, config, 'strike_speed_hunter', 120, {
      x: 200,
      y: 300,
      energy: 100,
      weapon: null,
      personality: {
        id: 'berserker',
        label: 'Berserker',
        aggression: 1.45,
        fear: 0.68,
        intelligence: 1.35,
        weaponFocus: 0.85,
        foodFocus: 0.7,
        randomness: 0.2,
        commitment: 1.25
      }
    });
    const prey = movementPlayer(arena, config, 'strike_speed_prey', 18, {
      x: 290,
      y: 300,
      energy: 100,
      weapon: null,
      personality: {
        id: 'survivor',
        label: 'Survivor',
        aggression: 0.65,
        fear: 1.55,
        intelligence: 1.25,
        weaponFocus: 1.1,
        foodFocus: 0.9,
        randomness: 0.2,
        commitment: 1.2
      }
    });

    expect(arena._huntStrikeBoost(hunter, prey, config)).toBeGreaterThan(0);
    expect(arena._effectiveMovementSpeed(prey, { mode: 'flee', target: hunter }, config))
      .toBeGreaterThan(arena._effectiveMovementSpeed(hunter, { mode: 'hunt-player', target: prey }, config));
  });

  it('allows active speed weapons to break the speed envelope visibly but within a cap', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      movement: { randomTurn: 0, steeringStrength: 0.3 }
    });
    const config = arena.getConfig();
    const target = { x: 900, y: 300 };
    const unarmed = movementPlayer(arena, config, 'unarmed_runner', 80, {
      x: 300,
      y: 300,
      energy: 60,
      weapon: null
    });
    const unarmedSpeed = arena._effectiveMovementSpeed(unarmed, { mode: 'hunt-food', target }, config);

    for (const weapon of [
      { type: 'speed', power: 3, expiresAt: 9000 },
      { type: 'dash', power: 3, expiresAt: 9000 },
      { type: 'chainsaw', power: 4, expiresAt: 9000 }
    ]) {
      const runner = movementPlayer(arena, config, `weapon_${weapon.type}`, 80, {
        x: 300,
        y: 300,
        energy: 60,
        weapon
      });
      const weaponSpeed = arena._effectiveMovementSpeed(runner, { mode: 'hunt-food', target }, config);

      expect(runner.weapon).toEqual(expect.objectContaining({ type: weapon.type }));
      expect(weaponSpeed).toBeGreaterThan(unarmedSpeed);
      expect(weaponSpeed).toBeLessThanOrEqual(unarmedSpeed * 1.85);
    }
  });

  it('gives chainsaw players a temporary speed boost', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    config.movement.randomTurn = 0;
    config.movement.steeringStrength = 0.3;

    arena.handleActivity({ uniqueId: 'normal_runner', nickname: 'Normal' }, 'chat');
    arena.handleActivity({ uniqueId: 'chainsaw_runner', nickname: 'Saw' }, 'chat');
    const normal = arena.players.get('normal_runner');
    const saw = arena.players.get('chainsaw_runner');
    const target = { x: 900, y: 500 };

    Object.assign(normal, { x: 300, y: 500, vx: 1, vy: 0, mass: 30, energy: 60, weapon: null });
    Object.assign(saw, {
      x: 300,
      y: 500,
      vx: 1,
      vy: 0,
      mass: 30,
      energy: 60,
      weapon: { type: 'chainsaw', power: 4, expiresAt: 9000 }
    });
    arena._syncRadius(normal, config);
    arena._syncRadius(saw, config);

    arena._steerPlayer(normal, { mode: 'hunt-food', target }, config, 1);
    arena._steerPlayer(saw, { mode: 'hunt-food', target }, config, 1);

    expect(saw.x - 300).toBeGreaterThan(normal.x - 300);
  });

  it('uses combined threat awareness instead of fleeing into another large player', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    config.movement.randomTurn = 0;

    arena.handleActivity({ uniqueId: 'aware_small', nickname: 'Small' }, 'chat');
    arena.handleActivity({ uniqueId: 'threat_left', nickname: 'Left' }, 'chat');
    arena.handleActivity({ uniqueId: 'threat_bottom', nickname: 'Bottom' }, 'chat');

    const small = arena.players.get('aware_small');
    const left = arena.players.get('threat_left');
    const bottom = arena.players.get('threat_bottom');
    Object.assign(small, { x: 200, y: 200, vx: 0, vy: 0, mass: 18, energy: 80 });
    Object.assign(left, { x: 120, y: 200, vx: 0, vy: 0, mass: 55 });
    Object.assign(bottom, { x: 200, y: 280, vx: 0, vy: 0, mass: 55 });
    arena._syncRadius(small, config);
    arena._syncRadius(left, config);
    arena._syncRadius(bottom, config);

    arena._updatePlayer(small, config, 1);

    expect(small.x).toBeGreaterThan(200);
    expect(small.y).toBeLessThan(200);
  });

  it('combines seek, flee, separation, and boundary steering into final movement', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      movement: { randomTurn: 0 }
    }, { random: () => 0.5 });
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

  it('keeps the current heading when steering signals cancel instead of snapping to an arbitrary axis', () => {
    const { arena } = createArena();

    const result = arena._weightedSteering([
      { name: 'threat', vector: { x: -1, y: 0 }, weight: 1 },
      { name: 'food', vector: { x: 1, y: 0 }, weight: 1 }
    ], { x: 0, y: -1 });

    expect(result.vector.x).toBeCloseTo(0, 5);
    expect(result.vector.y).toBeLessThan(-0.9);
    expect(result.weights.stabilized).toBe(1);
  });

  it('redirects zero steering away from horizontal walls instead of sliding along them', () => {
    const { arena } = createArena({ movement: { randomTurn: 0 } });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'top_wall_zero', nickname: 'Top Wall' }, 'chat');
    const player = arena.players.get('top_wall_zero');
    Object.assign(player, { x: 500, y: 500, vx: 0, vy: 0, mass: 20 });
    arena._syncRadius(player, config);
    player.y = player.radius + 0.2;

    const redirected = arena._redirectBlockedMovement(player, { x: 0, y: 0 }, config);

    expect(Math.abs(redirected.x)).toBeLessThan(0.05);
    expect(redirected.y).toBeGreaterThan(0.9);
  });

  it('ramps boundary avoidance gradually instead of snapping at the soft margin', () => {
    const { arena } = createArena({ movement: { randomTurn: 0 } });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'soft_wall_runner', nickname: 'Soft Wall' }, 'chat');
    const player = arena.players.get('soft_wall_runner');
    Object.assign(player, { x: 500, y: 500, vx: -1, vy: 0, mass: 20 });
    arena._syncRadius(player, config);

    player.x = player.radius + config.movement.boundaryAvoidanceDistance - 1;
    const softVector = arena._boundaryAvoidanceVector(player, config);

    player.x = player.radius + 1;
    const hardVector = arena._boundaryAvoidanceVector(player, config);

    expect(softVector.x).toBeGreaterThan(0);
    expect(softVector.x).toBeLessThan(0.05);
    expect(hardVector.x).toBeGreaterThan(0.9);
  });

  it('does not hard-reverse steering while only inside the soft boundary margin', () => {
    const { arena } = createArena({ movement: { randomTurn: 0 } });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'soft_wall_seek', nickname: 'Soft Seek' }, 'chat');
    const player = arena.players.get('soft_wall_seek');
    Object.assign(player, { x: 500, y: 500, vx: -1, vy: 0, mass: 20 });
    arena._syncRadius(player, config);
    player.x = player.radius + config.movement.boundaryAvoidanceDistance - 1;

    const redirected = arena._redirectBlockedMovement(player, { x: -1, y: 0.15 }, config);

    expect(redirected.x).toBeLessThan(-0.65);
  });

  it('slides along hard arena walls instead of bouncing wanderers into full reversals', () => {
    const { arena } = createArena({ movement: { randomTurn: 0 } });
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'hard_wall_wanderer', 137, {
      x: 60,
      y: 90,
      vx: -0.974,
      vy: 0.225
    });
    player.x = player.radius - 3;
    const before = arena._normalizeVector({ x: player.vx, y: player.vy });

    arena._containPlayerInArena(player, config);

    const after = arena._normalizeVector({ x: player.vx, y: player.vy });
    const alignment = before.x * after.x + before.y * after.y;
    expect(player.x).toBe(player.radius);
    expect(alignment).toBeGreaterThan(-0.2);
    expect(after.y).toBeGreaterThan(0.9);
  });

  it('does not invent a rightward steering signal when equal behavior vectors cancel', () => {
    const { arena } = createArena();

    const vector = arena._combineSteeringVectors([
      { vector: { x: -1, y: 0 }, weight: 1 },
      { vector: { x: 1, y: 0 }, weight: 1 }
    ]);

    expect(vector.x).toBeCloseTo(0, 5);
    expect(vector.y).toBeCloseTo(0, 5);
  });

  it('does not invent velocity when both current and desired steering are neutral', () => {
    const { arena } = createArena();
    const player = { vx: 0, vy: 0 };
    const velocity = arena._steerVelocity(
      player,
      { x: 0, y: 0 },
      { mode: 'wander', intent: 'wander' },
      0.3,
      { intelligence: 1 }
    );

    expect(velocity.x).toBeCloseTo(0, 5);
    expect(velocity.y).toBeCloseTo(0, 5);
  });

  it('turns decisive movement through a readable arc instead of snapping to a reversal', () => {
    const { arena } = createArena();
    const velocity = arena._steerVelocity(
      { vx: 1, vy: 0 },
      { x: -1, y: 0 },
      { mode: 'flee', intent: 'flee' },
      0.66,
      { intelligence: 1 }
    );

    expect(velocity.x).toBeGreaterThan(0.75);
    expect(Math.abs(velocity.y)).toBeGreaterThan(0.2);
  });

  it('keeps panic flee steering from zig-zagging through instant reversals', () => {
    const { arena } = createArena();
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'zigzag_runner', 18, {
      x: 300,
      y: 300,
      vx: 1,
      vy: 0,
      energy: 90
    });
    const threat = { x: 450, y: 300, radius: 30 };
    let previous = { x: player.vx, y: player.vy };
    let maxTurnDegrees = 0;

    for (let i = 0; i < 8; i++) {
      const vector = i % 2 === 0 ? { x: -1, y: 0.8 } : { x: -1, y: -0.8 };
      arena._steerPlayer(player, {
        mode: 'flee',
        intent: 'flee',
        target: threat,
        vector
      }, config, 0.05);
      const dot = Math.max(-1, Math.min(1, previous.x * player.vx + previous.y * player.vy));
      const turnDegrees = Math.acos(dot) * 180 / Math.PI;
      maxTurnDegrees = Math.max(maxTurnDegrees, turnDegrees);
      previous = { x: player.vx, y: player.vy };
    }

    expect(maxTurnDegrees).toBeLessThan(38);
  });

  it('turns idle wander movement gradually instead of snapping toward uncertain steering', () => {
    const { arena } = createArena();
    const velocity = arena._steerVelocity(
      { vx: 1, vy: 0 },
      { x: 0, y: 1 },
      { mode: 'wander', intent: 'wander' },
      0.3,
      { intelligence: 1 }
    );
    const turnDegrees = Math.acos(Math.max(-1, Math.min(1, velocity.x))) * 180 / Math.PI;

    expect(turnDegrees).toBeLessThan(14);
  });

  it('moves idle wanderers slower than purposeful food seekers', () => {
    const { arena } = createArena();
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'uncertain_wanderer', 18, {
      x: 300,
      y: 300,
      vx: 1,
      vy: 0,
      energy: 60,
      weapon: null
    });

    const wanderSpeed = arena._effectiveMovementSpeed(player, { mode: 'wander', intent: 'wander', target: null }, config);
    const foodSpeed = arena._effectiveMovementSpeed(player, { mode: 'hunt-food', intent: 'feed', target: { x: 900, y: 300 } }, config);

    expect(wanderSpeed).toBeLessThan(foodSpeed * 0.65);
    expect(wanderSpeed).toBeGreaterThan(foodSpeed * 0.25);
  });

  it('keeps uncertain wander movement coherent despite noisy random input', () => {
    let now = 1000;
    const randomValues = Array.from({ length: 200 }, (_, index) => index % 2 === 0 ? 1 : 0);
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      movement: { randomTurn: 0.04 }
    }, {
      now: () => now,
      random: () => randomValues.length ? randomValues.shift() : 0.5
    });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'coherent_wanderer', nickname: 'Wanderer' }, 'chat');

    const player = arena.players.get('coherent_wanderer');
    Object.assign(player, {
      x: 600,
      y: 500,
      vx: 1,
      vy: 0,
      mass: 18,
      energy: 80,
      weapon: null,
      personality: {
        id: 'chaotic',
        label: 'Chaotic',
        aggression: 1,
        fear: 1,
        intelligence: 0.55,
        weaponFocus: 1,
        foodFocus: 1,
        randomness: 1.35,
        commitment: 0.45
      }
    });
    arena.food.clear();
    arena.weaponPickups.clear();
    arena._syncRadius(player, config);

    let previous = { x: player.vx, y: player.vy };
    let maxTurnDegrees = 0;
    for (let i = 0; i < 60; i++) {
      now += 50;
      arena.tick(50);
      const dot = Math.max(-1, Math.min(1, previous.x * player.vx + previous.y * player.vy));
      const turnDegrees = Math.acos(dot) * 180 / Math.PI;
      maxTurnDegrees = Math.max(maxTurnDegrees, turnDegrees);
      previous = { x: player.vx, y: player.vy };
    }

    expect(maxTurnDegrees).toBeLessThan(4);
  });

  it('refreshes wander headings as gentle course corrections instead of reversals', () => {
    let now = 1000;
    const { arena } = createArena({}, {
      now: () => now,
      random: () => 1
    });
    const movement = arena.getConfig().movement;
    const player = {
      vx: 1,
      vy: 0,
      wanderVector: {
        x: 1,
        y: 0,
        updatedAt: now - movement.wanderTurnIntervalMs - 1
      }
    };

    const vector = arena._wanderVector(player, movement);
    const alignment = vector.x;

    expect(alignment).toBeGreaterThan(0.5);
  });

  it('does not invent a rightward target vector when already on top of a target', () => {
    const { arena } = createArena();
    const vector = arena._vectorToTarget({ x: 300, y: 300 }, { x: 300, y: 300 });

    expect(vector.x).toBeCloseTo(0, 5);
    expect(vector.y).toBeCloseTo(0, 5);
  });

  it('uses a calmer food cap with damped pellet value and a meaningful kill economy', () => {
    const { arena } = createArena();
    const config = arena.getConfig();

    expect(config.maxMass).toBeGreaterThanOrEqual(240);
    expect(config.maxLives).toBeGreaterThanOrEqual(20000);
    expect(config.maxFood).toBe(72);
    expect(config.maxFoodRender).toBe(66);
    expect(config.foodValue).toBeLessThan(2.25);
    expect(config.likeFoodValue).toBeGreaterThanOrEqual(1);
    expect(config.playerAbsorbMassRatio).toBeGreaterThanOrEqual(0.8);
    expect(config.playerAbsorbLifeStealRatio).toBeGreaterThanOrEqual(0.8);
    expect(config.deathFoodDropCount).toBeGreaterThanOrEqual(18);
    expect(config.deathFoodDropValue).toBeGreaterThanOrEqual(1.3);
  });

  it('lets large predators visibly grow past the old cap after eating valuable prey', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0
    });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'old_cap_predator', nickname: 'Predator' }, 'chat');
    arena.handleActivity({ uniqueId: 'valuable_prey', nickname: 'Prey' }, 'chat');

    const predator = arena.players.get('old_cap_predator');
    const prey = arena.players.get('valuable_prey');
    Object.assign(predator, {
      x: 300,
      y: 300,
      mass: 170,
      lives: arena._massToLives(170, config),
      vx: 1,
      vy: 0,
      weapon: null
    });
    Object.assign(prey, {
      x: 320,
      y: 300,
      mass: 85,
      lives: arena._massToLives(85, config),
      vx: 0,
      vy: 0,
      weapon: null
    });
    arena._syncRadius(predator, config);
    arena._syncRadius(prey, config);

    arena._resolvePlayerCollisions(config);

    expect(arena.players.has('valuable_prey')).toBe(false);
    expect(predator.kills).toBe(1);
    expect(predator.mass).toBeGreaterThan(190);
  });

  it('rewards kills with larger growth while still dropping food for nearby players', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      deathFoodDropCount: 12
    });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'reward_predator', nickname: 'Predator' }, 'chat');
    arena.handleActivity({ uniqueId: 'reward_prey', nickname: 'Prey' }, 'chat');

    const predator = arena.players.get('reward_predator');
    const prey = arena.players.get('reward_prey');
    Object.assign(predator, { x: 300, y: 300, mass: 80 });
    Object.assign(prey, { x: 322, y: 300, mass: 28 });
    arena._syncRadius(predator, config);
    arena._syncRadius(prey, config);
    const startMass = predator.mass;

    arena._resolvePlayerCollisions(config);

    expect(arena.players.has('reward_prey')).toBe(false);
    expect(predator.mass - startMass).toBeGreaterThan(18);
    expect(arena.food.size).toBeGreaterThanOrEqual(12);
    expect(Array.from(arena.food.values()).every(food => food.source === 'death-drop')).toBe(true);
  });

  it('scales large growth beyond 400 mass under a custom cap', () => {
    function resolveAbsorb(maxMass) {
      const { arena } = createArena({
        maxMass,
        maxFood: 0,
        maxWeaponPickups: 0
      });
      const config = arena.getConfig();
      const predator = movementPlayer(arena, config, 'large_reward_predator', 320, {
        x: 300,
        y: 300,
        lives: arena._massToLives(320, config),
        spawnedAt: -12000,
        spawnProtectedUntil: 0
      });
      const prey = movementPlayer(arena, config, 'large_reward_prey', 120, {
        x: 322,
        y: 300,
        lives: arena._massToLives(120, config),
        spawnedAt: -12000,
        spawnProtectedUntil: 0
      });
      arena.players.set(predator.username, predator);
      arena.players.set(prey.username, prey);
      arena._resolvePlayerCollisions(config);
      return { arena, predator, prey };
    }

    const customCap = resolveAbsorb(650);

    expect(customCap.arena.players.has(customCap.prey.username)).toBe(false);
    expect(customCap.predator.mass).toBeGreaterThan(400);
  });

  it('gives direct absorbs more mass past 666 and stops them at 999', () => {
    const upgradedConfig = createArena().arena.getConfig();
    expect(upgradedConfig).toEqual(expect.objectContaining({
      maxMass: 999,
      playerAbsorbMassRatio: 1,
      playerAbsorbLifeStealRatio: 1,
      maxLives: 320000
    }));

    function resolveAbsorb(overrides, predatorMass) {
      const { arena, io } = createArena({ maxFood: 0, maxWeaponPickups: 0 });
      const config = { ...arena.getConfig(), ...overrides };
      const predator = movementPlayer(arena, config, 'growth_predator', predatorMass, {
        x: 300, y: 300, lives: arena._massToLives(predatorMass, config), spawnedAt: -12000, spawnProtectedUntil: 0
      });
      const prey = movementPlayer(arena, config, 'growth_prey', 180, {
        x: 322, y: 300, lives: arena._massToLives(180, config), spawnedAt: -12000, spawnProtectedUntil: 0
      });
      arena.players.set(predator.username, predator);
      arena.players.set(prey.username, prey);
      arena._resolvePlayerCollisions(config);
      return io.emit.mock.calls.find(([eventName]) => eventName === 'arena:player-absorbed')[1];
    }

    const formerProfile = resolveAbsorb({ playerAbsorbMassRatio: 0.82, playerAbsorbLifeStealRatio: 0.84 }, 520);
    const upgradedProfile = resolveAbsorb({}, 520);

    expect(upgradedProfile.massGain).toBeGreaterThan(formerProfile.massGain);
    const crossing = resolveAbsorb({}, 650);
    expect(crossing.predatorMass).toBeGreaterThan(666);
    const capped = resolveAbsorb({}, 980);
    expect(capped.predatorMass).toBe(999);
  });

  it('damps direct rewards for dominant unarmed predators and spills more food', () => {
    const { arena, io } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      maxLives: 400000
    });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'dominant_reward_predator', nickname: 'Predator' }, 'chat');
    arena.handleActivity({ uniqueId: 'valuable_medium_prey', nickname: 'Prey' }, 'chat');

    const predator = arena.players.get('dominant_reward_predator');
    const prey = arena.players.get('valuable_medium_prey');
    Object.assign(predator, {
      x: 720,
      y: 420,
      mass: 800,
      lives: arena._massToLives(800, config),
      vx: 1,
      vy: 0,
      weapon: null,
      spawnedAt: -12000
    });
    Object.assign(prey, {
      x: 740,
      y: 420,
      mass: 100,
      lives: arena._massToLives(100, config),
      vx: 0,
      vy: 0,
      weapon: null,
      spawnedAt: -12000
    });
    arena._syncRadius(predator, config);
    arena._syncRadius(prey, config);
    const preyLives = prey.lives;

    io.emit.mockClear();
    arena._resolvePlayerCollisions(config);

    const payload = io.emit.mock.calls.find(([eventName]) => eventName === 'arena:player-absorbed')[1];
    expect(payload).toEqual(expect.objectContaining({
      predator: 'dominant_reward_predator',
      prey: 'valuable_medium_prey',
      weaponType: null
    }));
    expect(payload.lifeStealRatio).toBeLessThan(config.playerAbsorbLifeStealRatio * 0.65);
    expect(payload.lifeStealGain).toBeLessThan(preyLives * config.playerAbsorbLifeStealRatio * 0.65);
    expect(payload.massGainRatio).toBeLessThan(config.playerAbsorbMassRatio * 0.72);
    expect(payload.deathFoodDrops).toBeGreaterThan(config.deathFoodDropCount);
  });

  it('starts damping unarmed absorb rewards before a predator reaches max mass', () => {
    const { arena, io } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      maxLives: 400000
    });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'midgame_reward_predator', nickname: 'Predator' }, 'chat');
    arena.handleActivity({ uniqueId: 'midgame_reward_prey', nickname: 'Prey' }, 'chat');

    const predator = arena.players.get('midgame_reward_predator');
    const prey = arena.players.get('midgame_reward_prey');
    Object.assign(predator, {
      x: 720,
      y: 420,
      mass: 600,
      lives: arena._massToLives(600, config),
      vx: 1,
      vy: 0,
      weapon: null,
      spawnedAt: -12000
    });
    Object.assign(prey, {
      x: 742,
      y: 420,
      mass: 74,
      lives: arena._massToLives(74, config),
      vx: 0,
      vy: 0,
      weapon: null,
      spawnedAt: -12000
    });
    arena._syncRadius(predator, config);
    arena._syncRadius(prey, config);

    io.emit.mockClear();
    arena._resolvePlayerCollisions(config);

    const payload = io.emit.mock.calls.find(([eventName]) => eventName === 'arena:player-absorbed')[1];
    expect(payload.rewardDamping).toBeGreaterThan(0);
    expect(payload.lifeStealRatio).toBeLessThan(config.playerAbsorbLifeStealRatio);
    expect(payload.massGainRatio).toBeLessThan(config.playerAbsorbMassRatio);
  });

  it('gives fresh unarmed spawns a short escape bump instead of instant absorb', () => {
    let now = 1000;
    const { arena, io } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      spawnProtectionMs: 4500
    }, { now: () => now, random: () => 0.5 });
    const config = arena.getConfig();
    const predator = movementPlayer(arena, config, 'spawn_guard_predator', 120, {
      x: 500,
      y: 500,
      vx: -1,
      vy: 0,
      weapon: null,
      spawnedAt: now - 12000
    });
    const fresh = movementPlayer(arena, config, 'fresh_spawn_escape', 18, {
      x: 522,
      y: 500,
      vx: 1,
      vy: 0,
      weapon: null,
      spawnedAt: now,
      spawnProtectedUntil: now + 4500
    });
    arena.players.set(predator.username, predator);
    arena.players.set(fresh.username, fresh);

    io.emit.mockClear();
    arena._resolvePlayerCollisions(config);

    expect(arena.players.has('fresh_spawn_escape')).toBe(true);
    expect(arena._distance(predator, fresh)).toBeGreaterThan(predator.radius + fresh.radius);
    expect(fresh.vx).toBeGreaterThan(0);
    expect(io.emit).toHaveBeenCalledWith('arena:spawn-protection', expect.objectContaining({
      username: 'fresh_spawn_escape',
      predator: 'spawn_guard_predator'
    }));

    now += config.spawnProtectionMs + 1;
    fresh.x = predator.x + 20;
    fresh.y = predator.y;
    arena._resolvePlayerCollisions(config);

    expect(arena.players.has('fresh_spawn_escape')).toBe(false);
  });

  it('routes corner flee decisions toward open arena lanes instead of blocked walls', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      movement: { randomTurn: 0 }
    }, { random: () => 0.5 });
    const config = arena.getConfig();

    arena.handleActivity({ uniqueId: 'corner_prey', nickname: 'Corner Prey' }, 'chat');
    arena.handleActivity({ uniqueId: 'corner_threat', nickname: 'Threat' }, 'chat');

    const prey = arena.players.get('corner_prey');
    const threat = arena.players.get('corner_threat');
    Object.assign(prey, { vx: 0, vy: 0, mass: 42, energy: 80 });
    Object.assign(threat, { x: 112, y: 111, vx: -0.4, vy: 0.8, mass: 85 });
    arena._syncRadius(prey, config);
    arena._syncRadius(threat, config);
    prey.x = prey.radius + 0.25;
    prey.y = prey.radius + 0.25;

    const decision = arena.chooseBehavior(prey, config);

    expect(decision.mode).toBe('flee');
    expect(decision.target.username).toBe('corner_threat');
    expect(decision.vector.x).toBeGreaterThanOrEqual(-0.05);
    expect(decision.vector.y).toBeGreaterThanOrEqual(-0.05);
    expect(decision.vector.x + decision.vector.y).toBeGreaterThan(0.65);
  });

  it('slides flee movement out of corners instead of pinning balls against the wall', () => {
    const { arena } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0,
      movement: { randomTurn: 0 }
    }, { random: () => 0.5 });
    const config = arena.getConfig();

    arena.handleActivity({ uniqueId: 'wall_slider', nickname: 'Slider' }, 'chat');
    const player = arena.players.get('wall_slider');
    Object.assign(player, { vx: 0, vy: 0, mass: 42, energy: 80 });
    arena._syncRadius(player, config);
    player.x = player.radius + 0.25;
    player.y = player.radius + 0.25;
    const startX = player.x;
    const startY = player.y;

    const outwardFlee = {
      mode: 'flee',
      intent: 'flee',
      target: { x: 160, y: 160 },
      vector: { x: -1, y: -1 }
    };

    for (let i = 0; i < 6; i++) {
      arena._steerPlayer(player, outwardFlee, config, 0.05);
    }

    expect(Math.max(player.x - startX, player.y - startY)).toBeGreaterThan(4);
    expect(player.vx > 0 || player.vy > 0).toBe(true);
  });

  it('keeps a small fleeing player alive on shallow unarmed edge overlap', () => {
    const { arena, io } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0
    });
    const config = arena.getConfig();
    const hunter = movementPlayer(arena, config, 'edge_hunter', 105, {
      x: 520,
      y: 300,
      vx: -1,
      vy: 0,
      weapon: null
    });
    const prey = movementPlayer(arena, config, 'edge_prey', 18, {
      y: 300,
      vx: 1,
      vy: 0,
      weapon: null
    });
    prey.x = hunter.x + hunter.radius + prey.radius * 0.18;
    arena.players.set(hunter.username, hunter);
    arena.players.set(prey.username, prey);

    expect(arena._playerAbsorbContext(hunter, prey, config).canAbsorb).toBe(true);
    expect(arena._distance(hunter, prey)).toBeLessThan(hunter.radius + prey.radius);

    io.emit.mockClear();
    arena._resolvePlayerCollisions(config);

    expect(arena.players.has('edge_prey')).toBe(true);
    expect(io.emit).not.toHaveBeenCalledWith('arena:player-absorbed', expect.objectContaining({
      predator: 'edge_hunter',
      prey: 'edge_prey'
    }));
  });

  it('still lets large unarmed players absorb prey that is clearly inside their body', () => {
    const { arena, io } = createArena({
      maxFood: 0,
      maxWeaponPickups: 0
    });
    const config = arena.getConfig();
    const hunter = movementPlayer(arena, config, 'deep_hunter', 105, {
      x: 520,
      y: 300,
      vx: -1,
      vy: 0,
      weapon: null
    });
    const prey = movementPlayer(arena, config, 'deep_prey', 18, {
      y: 300,
      vx: 1,
      vy: 0,
      weapon: null
    });
    prey.x = hunter.x + hunter.radius - prey.radius * 0.3;
    arena.players.set(hunter.username, hunter);
    arena.players.set(prey.username, prey);

    io.emit.mockClear();
    arena._resolvePlayerCollisions(config);

    expect(arena.players.has('deep_prey')).toBe(false);
    expect(io.emit).toHaveBeenCalledWith('arena:player-absorbed', expect.objectContaining({
      predator: 'deep_hunter',
      prey: 'deep_prey',
      weaponType: null
    }));
  });

  it('lets larger overlapping players absorb smaller players and grow', () => {
    const { arena, io } = createArena({
      playerAbsorbOverlapRatio: 0.7,
      playerAbsorbMassRatio: 0.5
    });
    arena.handleActivity({ uniqueId: 'absorber', nickname: 'Absorber' }, 'chat');
    arena.handleActivity({ uniqueId: 'snack', nickname: 'Snack' }, 'chat');

    const absorber = arena.players.get('absorber');
    const snack = arena.players.get('snack');
    absorber.x = 200;
    absorber.y = 200;
    absorber.mass = 64;
    snack.x = 225;
    snack.y = 200;
    snack.mass = 20;
    arena._syncRadius(absorber, arena.getConfig());
    arena._syncRadius(snack, arena.getConfig());
    const startMass = absorber.mass;

    io.emit.mockClear();
    arena._resolvePlayerCollisions(arena.getConfig());

    expect(arena.players.has('snack')).toBe(false);
    expect(absorber.mass).toBeCloseTo(startMass + 10, 5);
    expect(absorber.kills).toBe(1);
    expect(io.emit).toHaveBeenCalledWith('arena:player-absorbed', expect.objectContaining({
      predator: 'absorber',
      prey: 'snack',
      massGain: expect.any(Number),
      lifeGain: expect.any(Number),
      preyLives: expect.any(Number)
    }));
  });

  it('transfers part of the prey lives to the predator when a ball is eaten', () => {
    const { arena, io } = createArena({
      playerAbsorbLifeStealRatio: 0.5
    });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'life_absorber', nickname: 'Absorber' }, 'chat');
    arena.handleActivity({ uniqueId: 'life_snack', nickname: 'Snack' }, 'chat');

    const absorber = arena.players.get('life_absorber');
    const snack = arena.players.get('life_snack');
    Object.assign(absorber, { x: 200, y: 200, mass: 30 });
    Object.assign(snack, { x: 220, y: 200, mass: 20 });
    arena._syncRadius(absorber, config);
    arena._syncRadius(snack, config);
    const startLives = absorber.lives;
    const startMass = absorber.mass;
    const preyLives = snack.lives;

    io.emit.mockClear();
    arena._resolvePlayerCollisions(config);

    expect(arena.players.has('life_snack')).toBe(false);
    expect(absorber.lives).toBeGreaterThanOrEqual(startLives + preyLives * 0.5);
    expect(absorber.mass).toBeGreaterThan(startMass);
    const absorbedPayload = io.emit.mock.calls.find(([eventName]) => eventName === 'arena:player-absorbed')[1];
    expect(absorbedPayload).toEqual(expect.objectContaining({
      predator: 'life_absorber',
      prey: 'life_snack',
      lifeStealRatio: 0.5,
      lifeStealGain: expect.any(Number)
    }));
    expect(absorbedPayload.preyLives).toBeCloseTo(preyLives, 5);
    expect(absorbedPayload.lifeStealGain).toBeCloseTo(preyLives * 0.5, 5);
    expect(absorbedPayload.lifeGain).toBeGreaterThanOrEqual(preyLives * 0.5);
  });

  it('assigns stable personality traits to new arena players', () => {
    const { arena } = createArena();

    arena.handleActivity({ uniqueId: 'personality_user', nickname: 'Persona' }, 'chat');
    const player = arena.players.get('personality_user');
    const serialized = arena._serializePlayer(player);

    expect(player.personality).toEqual(expect.objectContaining({
      id: expect.any(String),
      aggression: expect.any(Number),
      fear: expect.any(Number),
      intelligence: expect.any(Number),
      weaponFocus: expect.any(Number),
      riskTolerance: expect.any(Number),
      randomness: expect.any(Number)
    }));
    expect(serialized.personality).toEqual(expect.objectContaining({
      id: player.personality.id,
      label: player.personality.label,
      riskTolerance: player.personality.riskTolerance
    }));
  });

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
    const { arena } = createArena({
      maxFood: 120,
      likeFoodSpawnInterval: 1,
      likeFoodValue: 0.7
    });
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

  it('uses spatial player queries for collision resolution instead of scanning every player pair', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 });
    const config = arena.getConfig();
    for (let i = 0; i < 80; i++) {
      arena.handleActivity({ uniqueId: `grid_user_${i}`, nickname: `Grid ${i}` }, 'chat');
      const player = arena.players.get(`grid_user_${i}`);
      Object.assign(player, {
        x: 40 + (i % 10) * 150,
        y: 40 + Math.floor(i / 10) * 110,
        mass: 18
      });
      arena._syncRadius(player, config);
    }
    arena.aiSpatialIndex = arena._buildSpatialIndex(config);
    const spy = jest.spyOn(arena, '_nearbyPlayers');

    arena._resolvePlayerCollisions(config);

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reuses pooled food objects for new arena food bursts', () => {
    const { arena } = createArena({ maxFood: 10, maxWeaponPickups: 0 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'pool_player', nickname: 'Pool' }, 'chat');
    const player = arena.players.get('pool_player');
    Object.assign(player, { x: 300, y: 300, mass: 18 });
    arena._syncRadius(player, config);
    arena.food.clear();
    arena.food.set('pooled_food', {
      id: 'pooled_food',
      x: 302,
      y: 300,
      radius: 5,
      value: 2,
      source: 'test'
    });
    const pooledFood = arena.food.get('pooled_food');

    arena._consumeFood(player, 'pooled_food', pooledFood, config);
    expect(arena.foodPool).toContain(pooledFood);

    arena._spawnFoodBurst(player, 1, config, { source: 'like', value: 1 });

    const spawned = Array.from(arena.food.values())[0];
    expect(spawned).toBe(pooledFood);
    expect(spawned.id).not.toBe('pooled_food');
    expect(spawned.source).toBe('like');
  });

  it('derives distinct AI behavior profiles from player size', () => {
    const { arena } = createArena();
    const config = arena.getConfig();
    const small = movementPlayer(arena, config, 'size_small', 10);
    const medium = movementPlayer(arena, config, 'size_medium', 32);
    const large = movementPlayer(arena, config, 'size_large', 110);
    const giant = movementPlayer(arena, config, 'size_giant', 220);

    const smallProfile = arena._sizeBehaviorProfile(small, config);
    const mediumProfile = arena._sizeBehaviorProfile(medium, config);
    const largeProfile = arena._sizeBehaviorProfile(large, config);
    const giantProfile = arena._sizeBehaviorProfile(giant, config);

    expect(smallProfile.sizeClass).toBe('small');
    expect(mediumProfile.sizeClass).toBe('medium');
    expect(largeProfile.sizeClass).toBe('large');
    expect(giantProfile.sizeClass).toBe('giant');
    expect(smallProfile.foodIntentScale).toBeGreaterThan(largeProfile.foodIntentScale);
    expect(smallProfile.fleeIntentScale).toBeGreaterThan(mediumProfile.fleeIntentScale);
    expect(largeProfile.pressureIntentScale).toBeGreaterThan(mediumProfile.pressureIntentScale);
    expect(giantProfile.foodIntentScale).toBeLessThan(mediumProfile.foodIntentScale);
  });

  it('makes small unarmed players grow instead of chasing marginal prey', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { random: () => 0.5 });
    const config = arena.getConfig();
    const small = movementPlayer(arena, config, 'small_growth_first', 13, {
      x: 300,
      y: 300,
      energy: 95,
      personality: {
        id: 'berserker',
        label: 'Berserker',
        aggression: 1.45,
        fear: 0.68,
        intelligence: 0.95,
        weaponFocus: 0.85,
        foodFocus: 0.7,
        randomness: 0.2,
        commitment: 1.2
      }
    });
    const prey = movementPlayer(arena, config, 'small_margin_prey', 9, {
      x: 380,
      y: 300,
      energy: 60
    });
    arena.players.set(small.username, small);
    arena.players.set(prey.username, prey);
    arena.food.clear();
    arena.food.set('safe_growth_food', {
      id: 'safe_growth_food',
      x: 335,
      y: 300,
      radius: config.foodRadius,
      value: config.foodValue * 2.5,
      source: 'ambient',
      spawnedAt: 1000,
      expiresAt: 200000
    });

    const decision = arena.chooseBehavior(small, config);

    expect(decision.metadata.sizeClass).toBe('small');
    expect(decision.mode).toBe('hunt-food');
    expect(decision.target.id).toBe('safe_growth_food');
    expect(arena.getState('test').players.find(player => player.username === 'small_growth_first').ai).toEqual(
      expect.objectContaining({
        sizeClass: 'small',
        sizeRole: 'survive-grow-arm'
      })
    );
  });

  it('keeps small players eating nearby safe food instead of panic-fleeing distant giants', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { random: () => 0.5 });
    const config = arena.getConfig();
    const small = movementPlayer(arena, config, 'far_threat_forager', 18, {
      x: 300,
      y: 300,
      vx: -1,
      vy: 0,
      energy: 85,
      weapon: null
    });
    const giant = movementPlayer(arena, config, 'distant_giant', 260, {
      x: 940,
      y: 300,
      vx: 0,
      vy: 0,
      energy: 70,
      weapon: null
    });
    arena.players.set(small.username, small);
    arena.players.set(giant.username, giant);
    arena.food.clear();
    arena.food.set('near_safe_food', {
      id: 'near_safe_food',
      x: 340,
      y: 300,
      radius: config.foodRadius,
      value: config.foodValue * 2,
      source: 'ambient',
      spawnedAt: 1000,
      expiresAt: 200000
    });

    const decision = arena.chooseBehavior(small, config);

    expect(decision.mode).toBe('hunt-food');
    expect(decision.target.id).toBe('near_safe_food');
  });

  it('does not let prediction alone make small players flee distant unarmed giants', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { random: () => 0.5 });
    const config = arena.getConfig();
    const small = movementPlayer(arena, config, 'predictive_forager', 18, {
      x: 300,
      y: 300,
      vx: 0,
      vy: 0,
      energy: 85,
      weapon: null
    });
    const giant = movementPlayer(arena, config, 'closing_distant_giant', 260, {
      x: 850,
      y: 300,
      vx: -1,
      vy: 0,
      energy: 70,
      weapon: null
    });
    arena.players.set(small.username, small);
    arena.players.set(giant.username, giant);
    arena.food.clear();
    arena.food.set('predictive_safe_food', {
      id: 'predictive_safe_food',
      x: 342,
      y: 300,
      radius: config.foodRadius,
      value: config.foodValue * 2,
      source: 'ambient',
      spawnedAt: 1000,
      expiresAt: 200000
    });

    const decision = arena.chooseBehavior(small, config);

    expect(decision.mode).toBe('hunt-food');
    expect(decision.target.id).toBe('predictive_safe_food');
  });

  it('keeps close giant threats urgent for small players', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { random: () => 0.5 });
    const config = arena.getConfig();
    const small = movementPlayer(arena, config, 'close_threat_runner', 18, {
      x: 300,
      y: 300,
      vx: 1,
      vy: 0,
      energy: 85,
      weapon: null
    });
    const giant = movementPlayer(arena, config, 'close_giant', 260, {
      x: 465,
      y: 300,
      vx: -0.2,
      vy: 0,
      energy: 70,
      weapon: null
    });
    arena.players.set(small.username, small);
    arena.players.set(giant.username, giant);
    arena.food.clear();
    arena.food.set('near_risky_food', {
      id: 'near_risky_food',
      x: 345,
      y: 300,
      radius: config.foodRadius,
      value: config.foodValue * 3,
      source: 'ambient',
      spawnedAt: 1000,
      expiresAt: 200000
    });

    const decision = arena.chooseBehavior(small, config);

    expect(decision.mode).toBe('flee');
    expect(decision.target.username).toBe('close_giant');
  });

  it('turns stale flee lanes through a readable arc instead of flipping direction at once', () => {
    const { arena } = createArena();
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'human_flee_turner', 18, {
      x: 300,
      y: 300,
      vx: 1,
      vy: 0,
      energy: 90,
      weapon: null
    });
    const threat = movementPlayer(arena, config, 'human_flee_threat', 120, {
      x: 520,
      y: 300,
      vx: 0,
      vy: 0,
      weapon: null
    });
    const vector = arena._lockedFleeVector(player, threat, { vector: { x: 1, y: 0 } }, {
      threat: {
        target: threat,
        vector: { x: -1, y: 0 }
      },
      boundary: { x: 0, y: 0 },
      config,
      movement: config.movement,
      personality: arena._personalityTraits(player)
    });
    const turnDegrees = Math.acos(Math.max(-1, Math.min(1, vector.x))) * 180 / Math.PI;

    expect(turnDegrees).toBeGreaterThan(20);
    expect(turnDegrees).toBeLessThan(58);
  });

  it('exposes AI steering weights in arena state for live behavior diagnostics', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { random: () => 0.5 });
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'diagnostic_forager', 18, {
      x: 300,
      y: 300,
      vx: 1,
      vy: 0,
      weapon: null
    });
    arena.players.set(player.username, player);
    arena.food.clear();
    arena.food.set('diagnostic_food', {
      id: 'diagnostic_food',
      x: 345,
      y: 300,
      radius: config.foodRadius,
      value: config.foodValue,
      source: 'ambient',
      spawnedAt: 1000,
      expiresAt: 200000
    });

    arena.chooseBehavior(player, config);
    const serialized = arena.getState('test').players.find(entry => entry.username === 'diagnostic_forager');

    expect(serialized.ai.steering).toEqual(expect.objectContaining({
      food: expect.any(Number),
      boundary: expect.any(Number),
      threat: expect.any(Number)
    }));
  });

  it('makes large aggressive players pressure rivals instead of farming nearby ambient dots', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { random: () => 0.5 });
    const config = arena.getConfig();
    const large = movementPlayer(arena, config, 'large_pressure_first', 110, {
      x: 300,
      y: 300,
      energy: 100,
      personality: {
        id: 'berserker',
        label: 'Berserker',
        aggression: 1.45,
        fear: 0.68,
        intelligence: 1.05,
        weaponFocus: 0.85,
        foodFocus: 0.7,
        randomness: 0.2,
        commitment: 1.25
      }
    });
    const rival = movementPlayer(arena, config, 'large_near_rival', 92, {
      x: 520,
      y: 300,
      energy: 80
    });
    arena.players.set(large.username, large);
    arena.players.set(rival.username, rival);
    arena.food.clear();
    arena.food.set('near_ambient_dot', {
      id: 'near_ambient_dot',
      x: 335,
      y: 300,
      radius: config.foodRadius,
      value: config.foodValue,
      source: 'ambient',
      spawnedAt: 1000,
      expiresAt: 200000
    });

    const decision = arena.chooseBehavior(large, config);

    expect(decision.metadata.sizeClass).toBe('large');
    expect(decision.mode).toBe('pressure-player');
    expect(decision.target.username).toBe('large_near_rival');
  });

  it('uses personality and weapons to make aggressive balls hunt while defensive balls flee', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'aggressive_ball', nickname: 'Aggro' }, 'chat');
    arena.handleActivity({ uniqueId: 'defensive_ball', nickname: 'Def' }, 'chat');
    arena.handleActivity({ uniqueId: 'slightly_big_target', nickname: 'Target' }, 'chat');

    const aggressive = arena.players.get('aggressive_ball');
    const defensive = arena.players.get('defensive_ball');
    const target = arena.players.get('slightly_big_target');
    Object.assign(aggressive, {
      x: 200,
      y: 200,
      vx: 1,
      vy: 0,
      mass: 30,
      weapon: { type: 'missile', power: 3, expiresAt: 9000 },
      personality: {
        id: 'berserker',
        label: 'Berserker',
        aggression: 1.45,
        fear: 0.68,
        intelligence: 0.8,
        weaponFocus: 0.85,
        foodFocus: 0.7,
        randomness: 0.65,
        commitment: 0.75
      }
    });
    Object.assign(defensive, {
      x: 570,
      y: 230,
      vx: 1,
      vy: 0,
      mass: 18,
      personality: {
        id: 'survivor',
        label: 'Survivor',
        aggression: 0.72,
        fear: 1.42,
        intelligence: 1.15,
        weaponFocus: 1.3,
        foodFocus: 0.95,
        randomness: 0.45,
        commitment: 1.25
      }
    });
    Object.assign(target, { x: 360, y: 230, vx: -0.2, vy: 0, mass: 31 });
    arena._syncRadius(aggressive, config);
    arena._syncRadius(defensive, config);
    arena._syncRadius(target, config);

    const aggressiveDecision = arena.chooseBehavior(aggressive, config);
    const defensiveDecision = arena.chooseBehavior(defensive, config);

    expect(aggressiveDecision.mode).toBe('hunt-player');
    expect(aggressiveDecision.target.username).toBe('slightly_big_target');
    expect(defensiveDecision.mode).toBe('flee');
    expect(defensiveDecision.target.username).toBe('slightly_big_target');
  });

  it('does not panic-flee from equal-size unarmed players that cannot absorb each other', () => {
    const { arena } = createArena({}, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'max_survivor', nickname: 'Survivor' }, 'chat');
    arena.handleActivity({ uniqueId: 'max_neighbor', nickname: 'Neighbor' }, 'chat');

    const player = arena.players.get('max_survivor');
    const neighbor = arena.players.get('max_neighbor');
    Object.assign(player, {
      x: 500,
      y: 500,
      vx: 1,
      vy: 0,
      mass: 139,
      weapon: null,
      personality: {
        id: 'nervous',
        label: 'Nervous',
        aggression: 0.5,
        fear: 1.7,
        intelligence: 1.1,
        weaponFocus: 1,
        foodFocus: 1,
        randomness: 0.4,
        commitment: 1
      }
    });
    Object.assign(neighbor, { x: 610, y: 500, vx: -1, vy: 0, mass: 139, weapon: null });
    arena.food.clear();
    arena.weaponPickups.clear();
    arena._syncRadius(player, config);
    arena._syncRadius(neighbor, config);

    expect(arena._playerAbsorbContext(neighbor, player, config).canAbsorb).toBe(false);
    expect(arena._assessThreats(player, config.movement, config)).toBeNull();
    expect(arena.chooseBehavior(player, config).mode).not.toBe('flee');
  });

  it('drops a locked flee target when that player is no longer absorb-capable', () => {
    let now = 1000;
    const { arena } = createArena({}, { now: () => now, random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'flee_memory_small', nickname: 'Small' }, 'chat');
    arena.handleActivity({ uniqueId: 'flee_memory_big', nickname: 'Big' }, 'chat');

    const player = arena.players.get('flee_memory_small');
    const predator = arena.players.get('flee_memory_big');
    Object.assign(player, {
      x: 500,
      y: 500,
      vx: 1,
      vy: 0,
      mass: 40,
      weapon: null,
      personality: {
        id: 'nervous',
        label: 'Nervous',
        aggression: 0.5,
        fear: 1.7,
        intelligence: 1.1,
        weaponFocus: 1,
        foodFocus: 1,
        randomness: 0.4,
        commitment: 1.2
      }
    });
    Object.assign(predator, { x: 610, y: 500, vx: -1, vy: 0, mass: 100, weapon: null });
    arena.food.clear();
    arena.weaponPickups.clear();
    arena._syncRadius(player, config);
    arena._syncRadius(predator, config);

    const firstDecision = arena.chooseBehavior(player, config);
    expect(firstDecision.mode).toBe('flee');
    expect(firstDecision.target.username).toBe('flee_memory_big');

    predator.mass = 42;
    arena._syncRadius(predator, config);
    now += Math.floor(config.movement.behaviorMemoryMs / 2);

    expect(arena._playerAbsorbContext(predator, player, config).canAbsorb).toBe(false);
    expect(arena.chooseBehavior(player, config).mode).not.toBe('flee');
  });

  it('lets chainsaw players absorb similar-size targets more easily', () => {
    const { arena, io } = createArena();
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'saw_predator', nickname: 'Saw' }, 'chat');
    arena.handleActivity({ uniqueId: 'near_equal_prey', nickname: 'Prey' }, 'chat');

    const predator = arena.players.get('saw_predator');
    const prey = arena.players.get('near_equal_prey');
    Object.assign(predator, {
      x: 200,
      y: 200,
      mass: 30,
      weapon: { type: 'chainsaw', power: 4, expiresAt: 9000 }
    });
    Object.assign(prey, { x: 246, y: 200, mass: 26 });
    arena._syncRadius(predator, config);
    arena._syncRadius(prey, config);
    const startMass = predator.mass;

    io.emit.mockClear();
    arena._resolvePlayerCollisions(config);

    expect(arena.players.has('near_equal_prey')).toBe(false);
    expect(predator.mass).toBeGreaterThan(startMass);
    expect(io.emit).toHaveBeenCalledWith('arena:player-absorbed', expect.objectContaining({
      predator: 'saw_predator',
      prey: 'near_equal_prey',
      weaponType: 'chainsaw'
    }));
  });

  it('makes chainsaw hits burst smaller players into food splatter', () => {
    const { arena, io } = createArena({ maxFood: 0, maxWeaponPickups: 0 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'saw_slicer', nickname: 'Saw' }, 'chat');
    arena.handleActivity({ uniqueId: 'saw_victim', nickname: 'Victim' }, 'chat');

    const slicer = arena.players.get('saw_slicer');
    const victim = arena.players.get('saw_victim');
    Object.assign(slicer, {
      x: 300,
      y: 300,
      vx: 1,
      vy: 0,
      mass: 36,
      weapon: { type: 'chainsaw', power: 4, expiresAt: 9000 }
    });
    Object.assign(victim, { x: 334, y: 300, mass: 22 });
    arena._syncRadius(slicer, config);
    arena._syncRadius(victim, config);
    const startMass = slicer.mass;

    io.emit.mockClear();
    arena._resolvePlayerCollisions(config);

    expect(arena.players.has('saw_victim')).toBe(false);
    expect(slicer.mass - startMass).toBeGreaterThan(victim.mass * 0.45);
    expect(Array.from(arena.food.values()).some(food => food.source === 'chainsaw-splatter')).toBe(true);
    expect(io.emit).toHaveBeenCalledWith('arena:chainsaw-hit', expect.objectContaining({
      attacker: 'saw_slicer',
      target: 'saw_victim',
      mode: 'slice',
      foodDrops: expect.any(Number)
    }));
  });

  it('bounces chainsaw players off larger targets and spills collectable life food', () => {
    const { arena, io } = createArena({ maxFood: 0, maxWeaponPickups: 0 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'saw_bouncer', nickname: 'Saw' }, 'chat');
    arena.handleActivity({ uniqueId: 'large_target', nickname: 'Large' }, 'chat');

    const saw = arena.players.get('saw_bouncer');
    const large = arena.players.get('large_target');
    Object.assign(saw, {
      x: 300,
      y: 300,
      vx: 1,
      vy: 0,
      mass: 34,
      weapon: { type: 'chainsaw', power: 4, expiresAt: 9000 }
    });
    Object.assign(large, { x: 334, y: 300, vx: 0, vy: 0, mass: 82 });
    arena._syncRadius(saw, config);
    arena._syncRadius(large, config);
    const largeLives = large.lives;

    io.emit.mockClear();
    arena._resolvePlayerCollisions(config);

    expect(arena.players.has('saw_bouncer')).toBe(true);
    expect(arena.players.has('large_target')).toBe(true);
    expect(large.lives).toBeLessThan(largeLives);
    expect(largeLives - large.lives).toBeGreaterThan(largeLives * 0.14);
    expect(saw.vx).toBeLessThan(0);
    expect(Array.from(arena.food.values()).filter(food => food.source === 'life-drop').length).toBeGreaterThanOrEqual(14);
    expect(io.emit).toHaveBeenCalledWith('arena:chainsaw-hit', expect.objectContaining({
      attacker: 'saw_bouncer',
      target: 'large_target',
      mode: 'bounce',
      lifeDamage: expect.any(Number),
      foodDrops: expect.any(Number)
    }));
  });

  it('makes active chainsaw players hunt larger targets they can damage', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'saw_hunter', nickname: 'Saw' }, 'chat');
    arena.handleActivity({ uniqueId: 'saw_large_target', nickname: 'Large' }, 'chat');

    const saw = arena.players.get('saw_hunter');
    const large = arena.players.get('saw_large_target');
    Object.assign(saw, {
      x: 260,
      y: 300,
      vx: 1,
      vy: 0,
      mass: 38,
      weapon: { type: 'chainsaw', power: 4.4, expiresAt: 9000 },
      personality: {
        id: 'balanced',
        label: 'Balanced',
        aggression: 1,
        fear: 1,
        intelligence: 1,
        weaponFocus: 1,
        foodFocus: 1,
        randomness: 0.45,
        commitment: 1,
        riskTolerance: 1
      }
    });
    Object.assign(large, { x: 430, y: 300, vx: -0.2, vy: 0, mass: 84, weapon: null });
    arena.food.clear();
    arena.weaponPickups.clear();
    arena._syncRadius(saw, config);
    arena._syncRadius(large, config);

    expect(arena._playerAbsorbContext(saw, large, config).canAbsorb).toBe(false);

    const decision = arena.chooseBehavior(saw, config);

    expect(decision.mode).toBe('hunt-player');
    expect(decision.target.username).toBe('saw_large_target');
  });

  it('makes active dash players challenge near-equal targets instead of passively farming food', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'dash_duelist', nickname: 'Dash' }, 'chat');
    arena.handleActivity({ uniqueId: 'dash_target', nickname: 'Target' }, 'chat');

    const dash = arena.players.get('dash_duelist');
    const target = arena.players.get('dash_target');
    Object.assign(dash, {
      x: 260,
      y: 300,
      vx: 1,
      vy: 0,
      mass: 40,
      weapon: { type: 'dash', power: 3.6, expiresAt: 9000 },
      personality: {
        id: 'balanced',
        label: 'Balanced',
        aggression: 1,
        fear: 0.9,
        intelligence: 1,
        weaponFocus: 1.1,
        foodFocus: 1.1,
        randomness: 0.45,
        commitment: 1,
        riskTolerance: 1.05
      }
    });
    Object.assign(target, { x: 405, y: 300, vx: -0.2, vy: 0, mass: 42, weapon: null });
    arena.food.clear();
    arena.food.set('safe_food', {
      id: 'safe_food',
      x: 315,
      y: 300,
      radius: config.foodRadius,
      value: config.foodValue,
      source: 'ambient',
      spawnedAt: 1000
    });
    arena.weaponPickups.clear();
    arena._syncRadius(dash, config);
    arena._syncRadius(target, config);

    expect(arena._playerAbsorbContext(dash, target, config).canAbsorb).toBe(false);

    const decision = arena.chooseBehavior(dash, config);

    expect(decision.mode).toBe('hunt-player');
    expect(decision.target.username).toBe('dash_target');
  });

  it('breaks stale food locks when an active chainsaw has a viable player target', () => {
    let now = 1000;
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { now: () => now, random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'locked_saw', nickname: 'Saw' }, 'chat');
    arena.handleActivity({ uniqueId: 'locked_target', nickname: 'Target' }, 'chat');

    const saw = arena.players.get('locked_saw');
    const target = arena.players.get('locked_target');
    Object.assign(saw, {
      x: 260,
      y: 300,
      vx: 1,
      vy: 0,
      mass: 42,
      weapon: { type: 'chainsaw', power: 4.4, tier: 'large', sourceGift: 'Lion', expiresAt: 12000 },
      personality: {
        id: 'forager',
        label: 'Forager',
        aggression: 0.84,
        fear: 1.08,
        intelligence: 0.95,
        weaponFocus: 0.8,
        foodFocus: 1.45,
        randomness: 0.5,
        commitment: 0.9,
        riskTolerance: 0.84
      }
    });
    Object.assign(target, { x: 425, y: 300, vx: -0.2, vy: 0, mass: 82, weapon: null });
    arena._syncRadius(saw, config);
    arena._syncRadius(target, config);

    arena.food.set('food_lock', { id: 'food_lock', x: 280, y: 300, radius: 8, value: 1.35 });
    saw.aiIntent = {
      mode: 'hunt-food',
      intent: 'feed',
      targetKey: 'entity:food_lock',
      vector: { x: 1, y: 0 },
      score: 80,
      metadata: {},
      weaponType: 'chainsaw',
      lockedUntil: now + 5000,
      updatedAt: now
    };

    const decision = arena.chooseBehavior(saw, config);

    expect(decision.mode).toBe('hunt-player');
    expect(decision.target.username).toBe('locked_target');
  });

  it('keeps active gift chainsaws from being replaced by weaker arena pickups', () => {
    let now = 2000;
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { now: () => now });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'gift_saw_holder', nickname: 'Saw' }, 'chat');

    const player = arena.players.get('gift_saw_holder');
    Object.assign(player, {
      x: 300,
      y: 300,
      mass: 80,
      weapon: arena._createWeapon({
        type: 'chainsaw',
        tier: 'large',
        power: 5.4,
        sourceGift: 'Lion',
        durationMs: 13500
      }, now)
    });
    arena._syncRadius(player, config);
    arena.weaponPickups.set('weak_pickup', {
      id: 'weak_pickup',
      type: 'pulse',
      tier: 'pickup',
      power: 2.4,
      durationMs: 8500,
      x: player.x,
      y: player.y,
      radius: config.weaponPickupRadius,
      spawnedAt: now - 1000,
      expiresAt: now + 9000
    });

    arena._resolveWeaponPickupCollisions(config);

    expect(player.weapon).toEqual(expect.objectContaining({
      type: 'chainsaw',
      sourceGift: 'Lion'
    }));
    expect(arena.weaponPickups.has('weak_pickup')).toBe(true);
  });

  it('makes unarmed players flee active chainsaws that can damage them', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { random: () => 0.5 });
    const config = arena.getConfig();
    arena.handleActivity({ uniqueId: 'saw_threat', nickname: 'Saw' }, 'chat');
    arena.handleActivity({ uniqueId: 'unarmed_target', nickname: 'Target' }, 'chat');

    const saw = arena.players.get('saw_threat');
    const target = arena.players.get('unarmed_target');
    Object.assign(saw, {
      x: 360,
      y: 300,
      vx: 1,
      vy: 0,
      mass: 34,
      weapon: { type: 'chainsaw', power: 4.4, expiresAt: 9000 }
    });
    Object.assign(target, {
      x: 260,
      y: 300,
      vx: -1,
      vy: 0,
      mass: 46,
      weapon: null,
      personality: {
        id: 'balanced',
        label: 'Balanced',
        aggression: 1,
        fear: 1,
        intelligence: 1,
        weaponFocus: 1,
        foodFocus: 1,
        randomness: 0.45,
        commitment: 1,
        riskTolerance: 1
      }
    });
    arena.food.clear();
    arena.weaponPickups.clear();
    arena._syncRadius(saw, config);
    arena._syncRadius(target, config);

    expect(arena._playerAbsorbContext(saw, target, config).canAbsorb).toBe(false);

    const decision = arena.chooseBehavior(target, config);

    expect(decision.mode).toBe('flee');
    expect(decision.target.username).toBe('saw_threat');
  });

  it('makes armed players retreat when their weapon cannot threaten a larger close opponent', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { random: () => 0.5 });
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'armed_but_outmatched', 75, {
      x: 860,
      y: 760,
      vx: -0.3,
      vy: -0.2,
      energy: 82,
      weapon: { type: 'vampire', power: 2.7, expiresAt: 9000 },
      personality: {
        id: 'forager',
        label: 'Forager',
        aggression: 0.84,
        fear: 1.08,
        intelligence: 0.95,
        weaponFocus: 0.8,
        foodFocus: 1.45,
        randomness: 0.5,
        commitment: 0.9,
        riskTolerance: 0.78
      }
    });
    const threat = movementPlayer(arena, config, 'close_larger_pressure', 110, {
      x: 945,
      y: 820,
      vx: -1,
      vy: -0.3,
      energy: 80,
      weapon: null
    });
    arena.players.set(player.username, player);
    arena.players.set(threat.username, threat);
    arena.food.clear();
    arena.food.set('unsafe_bait_food', {
      id: 'unsafe_bait_food',
      x: 820,
      y: 720,
      radius: config.foodRadius,
      value: config.foodValue,
      source: 'ambient',
      spawnedAt: 1000
    });
    arena.aiSpatialIndex = null;

    expect(arena._weaponAttackContext(player, threat, config).canAttack).toBe(false);

    const decision = arena.chooseBehavior(player, config);

    expect(decision.mode).toBe('flee');
    expect(decision.target.username).toBe('close_larger_pressure');
  });

  it('keeps armed food-focused players from farming while a giant threat closes', () => {
    const { arena } = createArena({ maxFood: 0, maxWeaponPickups: 0 }, { random: () => 0.5 });
    const config = arena.getConfig();
    const player = movementPlayer(arena, config, 'laser_forager_under_pressure', 76, {
      x: 1585,
      y: 780,
      vx: 0.1,
      vy: -1,
      energy: 82,
      weapon: { type: 'laser', power: 2.1, expiresAt: 9000 },
      personality: {
        id: 'forager',
        label: 'Forager',
        aggression: 0.84,
        fear: 1.08,
        intelligence: 0.95,
        weaponFocus: 0.8,
        foodFocus: 1.45,
        randomness: 0.5,
        commitment: 0.9,
        riskTolerance: 0.78
      }
    });
    const giant = movementPlayer(arena, config, 'giant_closing_lane', 260, {
      x: 1170,
      y: 690,
      vx: 1,
      vy: 0.4,
      energy: 90,
      weapon: null
    });
    arena.players.set(player.username, player);
    arena.players.set(giant.username, giant);
    arena.food.clear();
    arena.food.set('tempting_food', {
      id: 'tempting_food',
      x: 1595,
      y: 745,
      radius: config.foodRadius,
      value: config.foodValue,
      source: 'ambient',
      spawnedAt: 1000
    });
    player.aiIntent = {
      mode: 'hunt-food',
      intent: 'feed',
      targetKey: 'entity:tempting_food',
      vector: { x: 0, y: -1 },
      score: 100,
      lockedUntil: 5000,
      weaponType: 'laser',
      metadata: {}
    };
    arena.aiSpatialIndex = null;

    expect(arena._weaponAttackContext(player, giant, config).canAttack).toBe(false);

    const decision = arena.chooseBehavior(player, config);

    expect(decision.mode).toBe('flee');
    expect(decision.target.username).toBe('giant_closing_lane');
  });

  it('starts and ends fever phases from the configured cadence', () => {
    let now = 1000;
    const { arena } = createArena({
      feverIntervalMs: 1000,
      feverDurationMs: 500
    }, { now: () => now });

    arena.tick(100);
    expect(arena.fever.active).toBe(false);

    now = 2000;
    arena.tick(100);
    expect(arena.fever.active).toBe(true);

    now = 2501;
    arena.tick(100);
    expect(arena.fever.active).toBe(false);
  });
});

describe('GameEnginePlugin arena integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createPlugin() {
    const handlers = {};
    const routes = {};
    const api = {
      getSocketIO: () => ({ emit: jest.fn(), on: jest.fn() }),
      registerRoute: jest.fn((method, routePath, handler) => {
        routes[`${method} ${routePath}`] = handler;
      }),
      registerTikTokEvent: jest.fn((eventName, handler) => {
        handlers[eventName] = handler;
      }),
      log: jest.fn()
    };
    const plugin = new GameEnginePlugin(api);
    plugin.db = { getTriggers: jest.fn(() => []) };
    plugin.wheelGame = {
      findWheelByChatCommand: jest.fn(),
      findWheelByGiftTrigger: jest.fn()
    };
    plugin.plinkoGame = {
      findBoardByGiftTrigger: jest.fn()
    };
    plugin.slotGame = {
      findMachineByChatCommand: jest.fn(),
      findMachineByGiftTrigger: jest.fn()
    };
    plugin.arenaGame = {
      handleActivity: jest.fn(() => ({ success: true })),
      handleGift: jest.fn(() => ({ success: true }))
    };

    return { plugin, handlers, routes };
  }

  it('registers a same-origin arena avatar proxy route for overlay renderers', () => {
    const { plugin, routes } = createPlugin();

    plugin.registerRoutes();

    expect(routes['GET /api/game-engine/arena/avatar']).toEqual(expect.any(Function));
  });

  it('allows TikTok EU CDN avatars through the Arena proxy', async () => {
    const { plugin } = createPlugin();
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      headers: { get: jest.fn(() => 'image/webp') }
    });

    try {
      await expect(plugin._fetchAllowedArenaAvatar(
        'https://p16-common-sign.tiktokcdn-eu.com/avatar.webp'
      )).resolves.toEqual(expect.objectContaining({ status: 200 }));
      expect(global.fetch).toHaveBeenCalledWith(
        'https://p16-common-sign.tiktokcdn-eu.com/avatar.webp',
        expect.objectContaining({ redirect: 'manual' })
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('revalidates every Arena avatar redirect before fetching the next hop', async () => {
    const { plugin } = createPlugin();
    const originalFetch = global.fetch;
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        status: 302,
        headers: { get: jest.fn(() => 'http://127.0.0.1/private-avatar') }
      });

    try {
      await expect(plugin._fetchAllowedArenaAvatar('https://avatars.tiktokcdn.com/avatar.webp'))
        .rejects.toMatchObject({ statusCode: 403 });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://avatars.tiktokcdn.com/avatar.webp',
        expect.objectContaining({ redirect: 'manual' })
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('keeps chat activity flowing to the arena when GCCE owns chat commands', () => {
    const { plugin, handlers } = createPlugin();
    plugin.gcceCommandsRegistered = true;

    plugin.registerTikTokEvents();
    handlers.chat({ uniqueId: 'viewer_1', nickname: 'Viewer One', comment: 'hi' });

    expect(plugin.arenaGame.handleActivity).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueId: 'viewer_1' }),
      'chat'
    );
    expect(plugin.api.registerTikTokEvent).toHaveBeenCalledWith('chat', expect.any(Function));
  });

  it('routes direct arena ability commands through the fallback chat path', () => {
    const { plugin } = createPlugin();
    plugin.arenaGame.handleAbilityCommand = jest.fn(() => ({ success: true, ability: 'shield' }));

    plugin.handleChatCommand({
      uniqueId: 'viewer_ability', nickname: 'Ability Viewer', profilePictureUrl: 'https://example.test/avatar.png', comment: '!shield'
    });

    expect(plugin.arenaGame.handleAbilityCommand).toHaveBeenCalledWith(expect.objectContaining({
      uniqueId: 'viewer_ability', nickname: 'Ability Viewer'
    }), 'shield');
  });

  it('passes completed gifts to the arena weapon handler before game-specific gift triggers', () => {
    const { plugin, handlers } = createPlugin();

    plugin.registerTikTokEvents();
    handlers.gift({
      uniqueId: 'viewer_1',
      nickname: 'Viewer One',
      giftName: 'Rose',
      giftId: 5655,
      repeatEnd: true,
      repeatCount: 1
    });

    expect(plugin.arenaGame.handleGift).toHaveBeenCalledWith(expect.objectContaining({
      uniqueId: 'viewer_1',
      giftName: 'Rose'
    }));
  });

  it('spawns arena players from TikTok join events', () => {
    const { plugin, handlers } = createPlugin();

    plugin.registerTikTokEvents();
    handlers.join({
      uniqueId: 'joiner_1',
      nickname: 'Joiner One'
    });

    expect(plugin.arenaGame.handleActivity).toHaveBeenCalledWith(
      expect.objectContaining({ uniqueId: 'joiner_1' }),
      'join'
    );
  });

  it('passes like counts through the Arena test activity endpoint', () => {
    const { plugin, routes } = createPlugin();
    const res = {
      json: jest.fn(),
      status: jest.fn()
    };
    res.status.mockReturnValue(res);

    plugin.registerRoutes();
    routes['POST /api/game-engine/arena/test-activity']({
      body: {
        uniqueId: 'api_like_user',
        nickname: 'API Like User',
        activityType: 'like',
        likeCount: 25
      }
    }, res);

    expect(plugin.arenaGame.handleActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        uniqueId: 'api_like_user',
        likeCount: 25
      }),
      'like'
    );
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });

  it('upgrades saved legacy Arena FPS defaults for admin config responses', () => {
    const { plugin } = createPlugin();

    const config = plugin._getConfigWithDefaults('arena', {
      targetFps: 30,
      tickRateMs: 100,
      stateEmitIntervalMs: 120
    });

    expect(config.targetFps).toBe(45);
    expect(config.tickRateMs).toBeLessThanOrEqual(50);
    expect(config.stateEmitIntervalMs).toBeGreaterThanOrEqual(50);
  });

  it('upgrades saved legacy Arena frame defaults for admin config responses', () => {
    const { plugin } = createPlugin();

    const config = plugin._getConfigWithDefaults('arena', {
      fieldFrameDesign: 'neon-grid'
    });

    expect(config.fieldFrameDesign).toBe('minimal');
  });

  it('upgrades saved previous action economy defaults for admin config responses', () => {
    const { plugin } = createPlugin();

    const config = plugin._getConfigWithDefaults('arena', {
      maxMass: 140,
      maxLives: 6000,
      playerAbsorbMassRatio: 0.7,
      playerAbsorbLifeStealRatio: 0.7,
      deathFoodDropCount: 12,
      deathFoodDropValue: 1.15
    });

    expect(config.maxMass).toBeGreaterThan(140);
    expect(config.maxLives).toBeGreaterThan(6000);
    expect(config.playerAbsorbMassRatio).toBeGreaterThan(0.7);
    expect(config.playerAbsorbLifeStealRatio).toBeGreaterThan(0.7);
    expect(config.deathFoodDropCount).toBeGreaterThan(12);
    expect(config.deathFoodDropValue).toBeGreaterThan(1.15);
  });

  it('migrates the shipped 666 absorb profile in admin defaults without changing ambient food', () => {
    const { plugin } = createPlugin();

    const config = plugin._getConfigWithDefaults('arena', {
      maxMass: 666,
      playerAbsorbMassRatio: 0.82,
      playerAbsorbLifeStealRatio: 0.84,
      maxLives: 88000
    });

    expect(config).toEqual(expect.objectContaining({
      maxMass: 999,
      playerAbsorbMassRatio: 1,
      playerAbsorbLifeStealRatio: 1,
      maxLives: 320000,
      maxFood: 72,
      maxFoodRender: 66,
      foodSpawnIntervalMs: 2400,
      foodSpawnBatchSize: 1,
      foodDespawnMs: 150000
    }));
  });

  it('keeps a custom admin absorb profile unchanged', () => {
    const { plugin } = createPlugin();

    const config = plugin._getConfigWithDefaults('arena', {
      maxMass: 777,
      playerAbsorbMassRatio: 0.73,
      playerAbsorbLifeStealRatio: 0.91
    });

    expect(config).toEqual(expect.objectContaining({
      maxMass: 777,
      playerAbsorbMassRatio: 0.73,
      playerAbsorbLifeStealRatio: 0.91
    }));
  });

  it('keeps a partial former admin profile unchanged', () => {
    const { plugin } = createPlugin();

    const config = plugin._getConfigWithDefaults('arena', {
      maxMass: 777,
      playerAbsorbMassRatio: 0.82,
      playerAbsorbLifeStealRatio: 0.91,
      maxLives: 88000
    });

    expect(config).toEqual(expect.objectContaining({
      maxMass: 777,
      playerAbsorbMassRatio: 0.82,
      playerAbsorbLifeStealRatio: 0.91,
      maxLives: 88000
    }));
  });

  it('fills risky AI and chainsaw pickup defaults into saved admin config responses', () => {
    const { plugin } = createPlugin();

    const config = plugin._getConfigWithDefaults('arena', {
      maxWeaponPickups: 8,
      weaponPickupSpawnIntervalMs: 4500,
      weaponPickupChance: 0.45,
      weaponPickupDurationMs: 18000,
      personalityProfiles: [
        {
          id: 'berserker',
          label: 'Berserker',
          aggression: 1.45,
          fear: 0.68,
          intelligence: 0.82,
          weaponFocus: 0.85,
          foodFocus: 0.7,
          randomness: 0.6,
          commitment: 0.75
        }
      ],
      weaponPickupTypes: [
        { type: 'speed', power: 1.2, durationMs: 7000, weight: 28 },
        { type: 'chainsaw', power: 4.4, durationMs: 9000, weight: 4 }
      ]
    });
    const chainsaw = config.weaponPickupTypes.find(definition => definition.type === 'chainsaw');

    expect(config.personalityProfiles[0].riskTolerance).toBeGreaterThan(1);
    expect(chainsaw.weight).toBeGreaterThanOrEqual(22);
    expect(chainsaw.durationMs).toBeGreaterThanOrEqual(10500);
    expect(config.maxWeaponPickups).toBeGreaterThanOrEqual(10);
    expect(config.weaponPickupSpawnIntervalMs).toBeLessThanOrEqual(3500);
    expect(config.weaponPickupChance).toBeGreaterThanOrEqual(0.65);
    expect(config.weaponPickupDurationMs).toBeGreaterThanOrEqual(22000);
  });

  it('upgrades saved previous Arena movement defaults for admin config responses', () => {
    const { plugin } = createPlugin();

    const config = plugin._getConfigWithDefaults('arena', {
      movement: {
        fleeDistance: 260,
        huntDistance: 380,
        foodSenseDistance: 460,
        steeringStrength: 0.24,
        randomTurn: 0.08,
        largeMassSpeedPenalty: 0.62,
        fleeMassRatio: 1.08,
        huntMassRatio: 1.1,
        huntLeadSeconds: 0.45,
        boundaryAvoidanceDistance: 75
      }
    });

    expect(config.movement).toEqual(expect.objectContaining({
      fleeDistance: 360,
      huntDistance: 520,
      steeringStrength: 0.3,
      randomTurn: 0.032,
      largeMassSpeedPenalty: 1.5,
      fleeMassRatio: 0.98,
      huntMassRatio: 1.02,
      threatLookaheadSeconds: 0.9,
      behaviorMemoryMs: 2600,
      targetSwitchScoreMargin: 3.8,
      wanderFocusMinMs: 2200,
      wanderFocusMaxMs: 4500
    }));
  });

  it('migrates saved sparse and twitchy Arena config to calmer admin defaults', () => {
    const { plugin } = createPlugin();

    const config = plugin._getConfigWithDefaults('arena', {
      maxFood: 50,
      maxFoodRender: 25,
      movement: {
        randomTurn: 0.04,
        behaviorMemoryMs: 1600,
        targetSwitchScoreMargin: 2.4,
        wanderFocusMinMs: 1400,
        wanderFocusMaxMs: 2800
      }
    });

    expect(config.maxFood).toBe(72);
    expect(config.maxFoodRender).toBe(66);
    expect(config.foodSpawnIntervalMs).toBeGreaterThanOrEqual(1200);
    expect(config.foodSpawnBatchSize).toBeLessThanOrEqual(3);
    expect(config.foodDespawnMs).toBeGreaterThanOrEqual(90000);
    expect(config.foodBurstDespawnMs).toBeGreaterThanOrEqual(60000);
    expect(config.movement).toEqual(expect.objectContaining({
      randomTurn: 0.032,
      behaviorMemoryMs: 2600,
      targetSwitchScoreMargin: 3.8,
      wanderFocusMinMs: 2200,
      wanderFocusMaxMs: 4500
    }));
  });

  it('migrates noisy stored food profiles without overwriting intentional low-volume pacing', () => {
    const { plugin } = createPlugin();
    const noisyProfile = {
      maxFood: 130,
      maxFoodRender: 72,
      foodSpawnIntervalMs: 6000,
      foodSpawnBatchSize: 22
    };

    for (const legacyMaxMass of [90, 140, 170, 260, 520]) {
      const noisy = plugin._getConfigWithDefaults('arena', { ...noisyProfile, maxMass: legacyMaxMass });
      expect(noisy).toEqual(expect.objectContaining({
        maxMass: 999,
        maxFood: 72,
        maxFoodRender: 66,
        foodSpawnIntervalMs: 2400,
        foodSpawnBatchSize: 1
      }));
    }

    for (const foodSpawnBatchSize of [1, 2, 3]) {
      const intentionalPacing = plugin._getConfigWithDefaults('arena', {
        foodSpawnIntervalMs: 5000,
        foodSpawnBatchSize
      });
      expect(intentionalPacing).toEqual(expect.objectContaining({
        foodSpawnIntervalMs: 5000,
        foodSpawnBatchSize
      }));
    }
  });

  it('migrates the full noisy legacy ambient profile for admin config responses', () => {
    const { plugin } = createPlugin();
    const config = plugin._getConfigWithDefaults('arena', {
      maxFood: 66,
      maxFoodRender: 66,
      foodSpawnIntervalMs: 6000,
      foodSpawnBatchSize: 22,
      foodDespawnMs: 120000
    });

    expect(config).toEqual(expect.objectContaining({
      maxMass: 999,
      maxFood: 72,
      maxFoodRender: 66,
      foodSpawnIntervalMs: 2400,
      foodSpawnBatchSize: 1,
      foodDespawnMs: 150000
    }));
  });

  it('migrates batch 4 with an explicit legacy interval to ambient admin pacing', () => {
    const { plugin } = createPlugin();
    const legacyBurst = plugin._getConfigWithDefaults('arena', {
      foodSpawnIntervalMs: 6000,
      foodSpawnBatchSize: 4
    });

    expect(legacyBurst).toEqual(expect.objectContaining({
      foodSpawnIntervalMs: 2400,
      foodSpawnBatchSize: 1
    }));
  });

  it('adds curated gift weapon defaults to arena admin config responses without overwriting custom mappings', () => {
    const { plugin } = createPlugin();

    const config = plugin._getConfigWithDefaults('arena', {
      giftWeaponMappings: {
        '5655': {
          giftName: 'Rose',
          weaponType: 'mine',
          tier: 'medium',
          power: 9,
          durationMs: 12000,
          growthBonus: 3
        }
      }
    });

    expect(config.giftWeaponMappings['5655']).toEqual(expect.objectContaining({
      giftName: 'Rose',
      weaponType: 'mine',
      power: 9
    }));
    // When giftWeaponMappings is provided in the request, stored values win over defaults
    // to allow deletion of mappings. Only the explicitly provided mappings are kept.
    expect(config.giftWeaponMappings['7171']).toBeUndefined();
    expect(config.giftWeaponMappings['6369']).toBeUndefined();
  });

  it('upgrades expensive legacy arena gift tiers in admin config responses', () => {
    const { plugin } = createPlugin();

    const config = plugin._getConfigWithDefaults('arena', {
      giftTiers: {
        small: {
          minValue: 0,
          weaponTypes: ['speed', 'shield'],
          power: 1,
          durationMs: 6000,
          growthBonus: 1.5
        },
        medium: {
          minValue: 100,
          weaponTypes: ['laser', 'pulse'],
          power: 2.5,
          durationMs: 9000,
          growthBonus: 4
        },
        large: {
          minValue: 1000,
          weaponTypes: ['blackhole', 'missile', 'chainsaw', 'vampire', 'mine', 'magnet'],
          power: 5,
          durationMs: 14000,
          growthBonus: 8
        }
      }
    });

    expect(config.giftTiers.medium.minValue).toBeLessThanOrEqual(5);
    expect(config.giftTiers.large.minValue).toBeLessThanOrEqual(20);
    expect(config.giftTiers.large.weaponTypes).toContain('chainsaw');
  });
});

describe('Arena overlay rendering contract', () => {
  function readOverlay() {
    return fs.readFileSync(path.join(__dirname, '..', 'overlay', 'arena.html'), 'utf8');
  }

  it('does not clamp arena food rendering to old sparse dot limits', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('const MAX_FOOD_RENDER_HIGH = 90;');
    expect(overlay).toContain('const MAX_FOOD_RENDER_LOW = 52;');
  });

  it('renders user profile images through a circular avatar path with a fallback orb', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('avatarImageCache');
    expect(overlay).toContain('avatarRenderUrl');
    expect(overlay).toContain('drawAvatarImage');
    expect(overlay).toContain('profilePictureProxyUrl');
    expect(overlay).toContain('profilePictureUrl');
    expect(overlay).toContain('ctx.clip()');
    expect(overlay).toContain('drawFallbackOrb');
  });

  it('uses cached avatar sprites and capped render DPR for better OBS frame rate', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('MAX_RENDER_DPR');
    expect(overlay).toContain('avatarSpriteCache');
    expect(overlay).toContain('getAvatarSprite');
  });

  it('draws weapon pickups and animated weapon attachments on player avatars', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('drawWeaponPickups');
    expect(overlay).toContain('drawAnimatedWeaponAttachment');
    expect(overlay).toContain('weaponPickups');
    expect(overlay).toContain('weaponPickupSpriteCache');
  });

  it('renders the additional arena weapon visuals and mine hazards', () => {
    const overlay = readOverlay();

    for (const weaponType of ['freeze', 'dash', 'magnet', 'vampire', 'mine']) {
      expect(overlay).toContain(`'${weaponType}'`);
    }
    expect(overlay).toContain('drawMines');
    expect(overlay).toContain('state.mines');
  });

  it('renders direct ability rings, a shared command legend, and flying bombs in both renderers', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('function drawAbilityRings(player, point, now)');
    expect(overlay).toContain('ability.chargeProgress');
    expect(overlay).toContain('function drawAbilityLegend()');
    expect(overlay).toContain('!boost Tempo');
    expect(overlay).toContain('!shield Schutz');
    expect(overlay).toContain('!bomb Wurf');
    expect(overlay).toContain('function drawBombs(now)');
    expect(overlay).toContain('node.abilityRings');
    expect(overlay).toContain('function drawPixiAbilityLegend()');
    expect(overlay).toContain('for (const bomb of state.bombs || [])');
  });

  it('renders bomb readiness, armed mines, flight fuse, and explosion feedback in both renderers', () => {
    const overlay = readOverlay();

    expect((overlay.match(/abilities\.bomb/g) || [])).toHaveLength(2);
    expect((overlay.match(/bomb\.phase === 'armed'/g) || []).length).toBeGreaterThanOrEqual(2);
    expect((overlay.match(/drawBombFuse/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(overlay).toContain('function drawBombExplosionEffect(effect, progress)');
    expect(overlay).toContain("effect.type === 'bomb-explosion'");
    expect(overlay).toContain("socket.on('arena:bomb-exploded'");
    expect(overlay).toContain("type: 'bomb-explosion'");
    expect(overlay).toContain('bombLayer');
  });

  it('lists individual direct abilities in the lower rotator and exposes the optional upper legend toggle', () => {
    const overlay = readOverlay();
    const ui = fs.readFileSync(path.join(__dirname, '..', 'ui.html'), 'utf8');

    expect(overlay).toContain('function getArenaAbilityHints(config)');
    expect(overlay).toContain("if (config?.directAbilitiesEnabled === false) return [];");
    expect(overlay).toContain("kind: 'ability'");
    expect(overlay).toContain('!boost');
    expect(overlay).toContain('F\\u00e4higkeit');
    expect(overlay).toContain('!shield');
    expect(overlay).toContain('!bomb');
    expect(ui).toContain('id="arena-top-overlay-show-ability-legend"');
    expect(ui).toContain('topOverlayShowAbilityLegend:');
  });

  it('gates both upper ability legends behind the opt-in setting', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('if (state.config?.topOverlayShowAbilityLegend === true) {');
    expect(overlay).toContain('drawAbilityLegend();');
    expect(overlay).toContain('drawPixiAbilityLegend();');
  });

  it('draws chainsaw super weapon teeth around player avatars', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('chainsaw');
    expect(overlay).toContain('drawChainsawTeeth');
    expect(overlay).toContain('drawChainsawHitEffect');
    expect(overlay).toContain('arena:chainsaw-hit');
    expect(overlay).toContain('chainsaw_sparks');
    expect(overlay).toContain('chainsaw_teeth');
  });

  it('keeps the arena canvas background clear while food and weapon effects stay translucent', () => {
    const overlay = readOverlay();

    expect(overlay).not.toContain('ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);');
    expect(overlay).toContain('foodOpacity');
    expect(overlay).toContain('foodOpacityFor');
    expect(overlay).toContain("food.source === 'life-drop'");
    expect(overlay).toContain('fadeOutMs');
    expect(overlay).toContain('state.fever?.active ? 0.36 : 0.28');
    expect(overlay).toContain('weaponAlpha');
  });

  it('keeps the overlay rendering contract for gentle food fades', () => {
    const overlay = readOverlay();
    const arenaSource = fs.readFileSync(path.join(__dirname, '..', 'games', 'arena.js'), 'utf8');
    const foodOpacityFor = overlay.slice(
      overlay.indexOf('function foodOpacityFor'),
      overlay.indexOf('function drawFood')
    );

    expect(foodOpacityFor).toContain("const spawnFadeMs = food.source === 'ambient' ? 1400 : 600;");
    expect(foodOpacityFor).toContain('const spawnEase = clampNumber(ageMs / spawnFadeMs, 0, 1, 1);');
    expect(foodOpacityFor).toContain("food.source === 'life-drop'");
    expect(foodOpacityFor).toContain('clampNumber(remainingMs / Math.max(fadeOutMs, 1), 0.16, 1, 1)');
    expect(arenaSource).toContain("if (normalizedSource === 'ambient') return 48000;");
  });

  it('renders selectable large-player transparency modes in Canvas and Pixi', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('largeBallTransparencyMode');
    expect(overlay).toContain('LARGE_BALL_TRANSPARENCY_MODES');
    expect(overlay).toContain('normalizeLargeBallTransparencyMode');
    expect(overlay).toContain("mode === 'off'");
    expect(overlay).toContain("mode === 'flat'");
    expect(overlay).toContain('node.container.alpha = playerVisualAlpha(player)');
    expect(overlay).toContain('const visualAlpha = playerVisualAlpha(player)');
  });

  it('supports configurable render scale, target fps, and eating effects', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('getRenderScale');
    expect(overlay).toContain('getTargetFps');
    expect(overlay).toContain('lastDrawAt');
    expect(overlay).toContain('arena:food-eaten');
    expect(overlay).toContain('drawEatingEffect');
    expect(overlay).toContain('webgpuAvailable');
  });

  it('smooths avatar motion between state packets instead of stopping at each update', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('SMOOTHING_EXTRAPOLATION_MS');
    expect(overlay).toContain('getInterpolationInterval');
    expect(overlay).toContain('serverVx');
    expect(overlay).toContain('stateRateMs');
    expect(overlay).not.toContain('Math.max(70, state.config?.stateEmitIntervalMs || 120)');
  });

  it('rotates gift weapon and like info in the top arena HUD', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('id="arena-info-rotator"');
    expect(overlay).toContain('buildInfoRotatorMessages');
    expect(overlay).toContain('updateInfoRotator');
    expect(overlay).toContain('giftWeaponMappings');
    expect(overlay).toContain('Likes geben Leben');
    expect(overlay).toContain('Geschenke geben Leben');
  });

  it('supports selectable top HUD designs and beta localized feature rotation', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('data-arena-overlay-design');
    expect(overlay).toContain('data-arena-overlay-position');
    expect(overlay).toContain('data-arena-overlay-density');
    expect(overlay).toContain('data-arena-overlay-accent');
    expect(overlay).toContain('data-arena-overlay-backdrop');
    expect(overlay).toContain('data-arena-rotator-style');
    expect(overlay).toContain('data-arena-text-scale');
    expect(overlay).toContain('data-arena-info-placement');
    expect(overlay).toContain('applyTopOverlayDesign');
    expect(overlay).toContain('applyArenaTextScale');
    expect(overlay).toContain('--arena-ui-scale');
    expect(overlay).toContain('--arena-info-outside-top');
    for (const design of [
      'classic',
      'widescreen',
      'landscape',
      'slim',
      'high-contrast',
      'tournament-bar',
      'esports-caster',
      'cyber-strip',
      'glass-ribbon',
      'compact-scorebug',
      'vertical-stack',
      'bottom-ticker',
      'split-corners',
      'minimal-pro',
      'alert-feed',
      'framed-field'
    ]) {
      expect(overlay).toContain(`"${design}"`);
      expect(overlay).toContain(`body[data-arena-overlay-design="${design}"]`);
    }
    for (const position of ['above-field', 'below-field']) {
      expect(overlay).toContain(`"${position}"`);
      expect(overlay).toContain(`body[data-arena-info-placement="${position}"] #arena-info-rotator`);
    }
    for (const helper of [
      'normalizeTopOverlayPosition',
      'normalizeTopOverlayDensity',
      'normalizeTopOverlayAccent',
      'normalizeTopOverlayBackdrop',
      'normalizeTopOverlayRotatorStyle',
      'normalizeTopOverlayTextScale',
      'normalizeInfoRotatorPlacement'
    ]) {
      expect(overlay).toContain(helper);
    }
    expect(overlay).toContain('Beta test - expect bugs');
    expect(overlay).toContain('infoRotatorLanguageMode');
    expect(overlay).toContain('buildLocalizedInfoMessages');
    expect(overlay).toContain('Small balls survive by collecting food and fleeing threats.');
    expect(overlay).toContain('Kleine Baelle sammeln Nahrung und fluechten vor groesseren Gegnern.');
  });

  it('allows the whole arena HUD layout to sit outside the playfield with larger font presets', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('topOverlayPlacement');
    expect(overlay).toContain('TOP_OVERLAY_PLACEMENTS');
    expect(overlay).toContain('normalizeTopOverlayPlacement');
    expect(overlay).toContain('effectiveTopOverlayPlacement');
    expect(overlay).toContain('usesSeparatedArenaLayout');
    expect(overlay).toContain('data-arena-hud-placement');
    expect(overlay).toContain('data-arena-field-layout');
    expect(overlay).toContain('body[data-arena-hud-placement="above-field"] #hud');
    expect(overlay).toContain('body[data-arena-hud-placement="below-field"] #hud');
    expect(overlay).toContain('body[data-arena-field-layout="separated"] #arena-field-frame');
    expect(overlay).toContain('--arena-hud-outside-top');
    expect(overlay).toContain('--arena-hud-outside-height');
    for (const option of ['"auto"', '"inside-field"', '"above-field"', '"below-field"']) {
      expect(overlay).toContain(option);
    }
    for (const scale of ['"small"', '"very-large"', '"huge"']) {
      expect(overlay).toContain(scale);
    }
    expect(overlay).toContain('--arena-title-font: clamp(18px');
    expect(overlay).toContain('--arena-info-font: clamp(16px');
    expect(overlay).toContain('--arena-leader-font: clamp(15px');
    expect(overlay).toContain('--arena-info-icon-size: clamp(42px');
    expect(overlay).toContain("if (mode === 'huge') return 1.9;");
    expect(overlay).toContain('return clampNumber(Math.min(widthScale, heightScale), 1.12, 1.7, 1.18);');
    expect(overlay).toContain('const outsideHeight = Math.round(clampNumber(88 * scale, 72, 190, 88));');
    expect(overlay).toContain('const hudOutsideHeight = Math.round(clampNumber(hudHeightBase * scale, 122, 320, 150));');
    expect(overlay).toContain('-webkit-line-clamp: 2;');
  });

  it('keeps HUD text outside the arena playfield in the framed field overlay', () => {
    const overlay = readOverlay();
    const framedFrameBlock = overlay.match(/body\[data-arena-overlay-design="framed-field"\] #arena-field-frame \{([\s\S]*?)\n    \}/);

    expect(overlay).toContain('function getArenaPlayfieldRect()');
    expect(overlay).toContain('function applyArenaViewportLayout()');
    expect(overlay).toContain('const rect = getArenaPlayfieldRect();');
    expect(overlay).toContain('--arena-playfield-left');
    expect(overlay).toContain('--arena-playfield-top');
    expect(overlay).toContain('--arena-playfield-width');
    expect(overlay).toContain('--arena-playfield-height');
    expect(overlay).toContain('const topInfoBand');
    expect(overlay).toContain("infoPlacement === 'above-field'");
    expect(overlay).toContain('body[data-arena-overlay-design="framed-field"] #hud');
    expect(overlay).toContain('body[data-arena-overlay-design="framed-field"][data-arena-info-placement="below-field"] #hud');
    expect(overlay).toContain('body[data-arena-overlay-design="framed-field"] #arena-field-frame');
    expect(overlay).toContain('body[data-arena-overlay-design="framed-field"] #arena-canvas');
    expect(overlay).toContain('clipToArenaPlayfield');
    expect(overlay).toContain('restoreArenaPlayfieldClip');
    expect(overlay).toContain('x: rect.x + point.x * scale.sx');
    expect(overlay).toContain('y: rect.y + point.y * scale.sy');
    expect(framedFrameBlock).not.toBeNull();
    expect(framedFrameBlock[1].indexOf('inset: auto;')).toBeLessThan(framedFrameBlock[1].indexOf('left: var(--arena-playfield-left'));
  });

  it('stacks large outside info and HUD bands without overlay text collisions', () => {
    const overlay = readOverlay();
    const outsideInfoBlock = overlay.match(/body\[data-arena-info-placement="above-field"\] #arena-info-rotator,[\s\S]*?\{([\s\S]*?)\n    \}/);
    const framedOutsideHudBlock = overlay.match(/body\[data-arena-overlay-design="framed-field"\]\[data-arena-info-placement="below-field"\] #hud \{([\s\S]*?)\n    \}/);
    const framedTitleBlock = overlay.match(/body\[data-arena-overlay-design="framed-field"\] #hud-title \{([\s\S]*?)\n    \}/);

    expect(overlay).toContain('function resolveArenaOutsideBands(');
    expect(overlay).toContain('const stackHeight = infoHeight + gap + hudHeight;');
    expect(overlay).toContain('infoTop: stackTop');
    expect(overlay).toContain('hudTop: stackTop + infoHeight + gap');
    expect(overlay).toContain('const outsideHeight = Math.round(clampNumber(88 * scale, 72, 190, 88));');
    expect(overlay).toContain('const hudOutsideHeight = Math.round(clampNumber(hudHeightBase * scale, 122, 320, 150));');

    expect(outsideInfoBlock).not.toBeNull();
    expect(outsideInfoBlock[1]).toContain('height: var(--arena-info-outside-height);');
    expect(outsideInfoBlock[1]).toContain('max-height: var(--arena-info-outside-height);');

    expect(framedOutsideHudBlock).not.toBeNull();
    expect(framedOutsideHudBlock[1]).toContain('overflow: hidden;');

    expect(framedTitleBlock).not.toBeNull();
    expect(framedTitleBlock[1]).toContain('flex-direction: column;');
    expect(framedTitleBlock[1]).toContain('min-width: 0;');
  });

  it('shows an absorb impact effect instead of silently removing eaten players', () => {
    const overlay = readOverlay();

    expect(overlay).toContain("socket.on('arena:player-absorbed'");
    expect(overlay).toContain("reason: 'absorbed'");
    expect(overlay).toContain('const radius = Math.max(10,');
  });

  it('renders immediate stream surge pulses for likes and gifts', () => {
    const overlay = readOverlay();

    expect(overlay).toContain("socket.on('arena:stream-surge'");
    expect(overlay).toContain("kind === 'gift' ? 'rgba(250, 204, 21, 0.96)' : 'rgba(34, 197, 94, 0.96)'");
  });

  it('renders configurable arena field frame styles outside the canvas renderer', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('id="arena-field-frame"');
    expect(overlay).toContain('FIELD_FRAME_DESIGNS');
    expect(overlay).toContain('applyFieldFrameDesign');
    expect(overlay).toContain('data-field-frame-design');
    expect(overlay).toContain('--field-frame-thickness');
    expect(overlay).toContain('--field-frame-glow');
    for (const design of ['neon-grid', 'hazard-zone', 'glass-circuit', 'retro-arcade', 'high-contrast', 'minimal']) {
      expect(overlay).toContain(`"${design}"`);
      expect(overlay).toContain(`body[data-field-frame-design="${design}"]`);
    }
  });

  it('does not expose a coordinate grid in the default arena field frame', () => {
    const overlay = readOverlay();
    const defaultConfigBlock = overlay.match(/fieldFrameDesign: '([^']+)'/);
    const neonGridBlock = overlay.match(/body\[data-field-frame-design="neon-grid"\] #arena-field-frame \{([\s\S]*?)\n    \}/);

    expect(defaultConfigBlock && defaultConfigBlock[1]).toBe('minimal');
    expect(overlay).toContain("return FIELD_FRAME_DESIGNS.includes(design) ? design : 'minimal';");
    expect(neonGridBlock).not.toBeNull();
    expect(neonGridBlock[1]).not.toContain('background-size');
    expect(neonGridBlock[1]).not.toContain('linear-gradient(rgba');
  });

  it('reserves the upper portrait OBS area for stream-bottom arena layouts', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('function isStreamBottomArenaLayout()');
    expect(overlay).toContain("state.config?.arenaSizePreset) === 'stream-bottom'");
    expect(overlay).toContain('const portraitTopReserve = isStreamBottomArenaLayout()');
    expect(overlay).toContain('viewportHeight * 0.5');
  });

  it('keeps arena field frame designs OBS-safe without backdrop filters or repeating gradients', () => {
    const overlay = readOverlay();

    for (const design of ['neon-grid', 'hazard-zone', 'glass-circuit', 'retro-arcade', 'high-contrast', 'minimal']) {
      const marker = `body[data-field-frame-design="${design}"] #arena-field-frame {`;
      const start = overlay.indexOf(marker);
      expect(start).toBeGreaterThanOrEqual(0);
      const rest = overlay.slice(start + marker.length);
      const end = rest.indexOf('\n    }');
      expect(end).toBeGreaterThan(0);
      const block = rest.slice(0, end);
      expect(block).not.toContain('filter:');
      expect(block).not.toContain('backdrop-filter');
      expect(block).not.toContain('repeating-linear-gradient');
    }
  });

  it('fades large arena balls through one helper in Canvas and Pixi renderers', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('largeBallTransparencyEnabled');
    expect(overlay).toContain('largeBallTransparencyStartMass');
    expect(overlay).toContain('largeBallMinOpacity');
    expect(overlay).toContain('function playerVisualAlpha(player)');
    expect(overlay).toContain('ctx.globalAlpha = visualAlpha');
    expect(overlay).toContain('node.container.alpha = playerVisualAlpha(player)');
  });

  it('renders arena HUD game tips with gift catalog images for weapon triggers', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('id="arena-info-icon"');
    expect(overlay).toContain('loadArenaGiftCatalogImages');
    expect(overlay).toContain('/api/gift-catalog');
    expect(overlay).toContain('giftCatalogById');
    expect(overlay).toContain('renderInfoRotatorMessage');
    expect(overlay).toContain('image_url');
    expect(overlay).toContain('data-info-kind');
    expect(overlay).toContain('Zum Spawnen');
  });

  it('renders arena chat command hints in the existing info rotator', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('topOverlayShowCommandHints');
    expect(overlay).toContain('function getArenaCommandHints');
    expect(overlay).toContain('!arena hunt - Angriff');
    expect(overlay).toContain('!arena flee - Überleben');
    expect(overlay).toContain('!arena farm - Sammeln');
    expect(overlay).toContain('!arena target Name - Ziel markieren');
    expect(overlay).toContain('!arena role tactician - KI-Rolle wählen');
    expect(overlay).toContain("kind: 'command'");
    expect(overlay).toContain('data-info-kind="command"');
  });

  it('draws active arena strategy labels only when player strategy data exists', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('function strategyLabelForPlayer');
    expect(overlay).toContain('function aiStateLabelForPlayer');
    expect(overlay).toContain('drawStrategyLabel(player, point)');
    expect(overlay).toContain('player.strategy');
    expect(overlay).toContain('player.ai');
    expect(overlay).toContain('DOMINATE');
    expect(overlay).toContain('TARGET');
    expect(overlay).toContain('state.players.length > 48');
  });

  it('loads PixiJS and Rapier through a hybrid arena renderer with Canvas fallback', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('loadArenaRenderEngine');
    expect(overlay).toContain("import('/vendor/pixi/pixi.min.mjs')");
    expect(overlay).toContain("import('/vendor/rapier2d/rapier.es.js')");
    expect(overlay).toContain('createPixiArenaRenderer');
    expect(overlay).toContain('createRapierCollisionWorld');
    expect(overlay).toContain('CanvasArenaRenderer');
    expect(overlay).toContain('renderer: renderEngine.name');
  });

  it('adapts internal arena render resolution when FPS drops without changing OBS layout size', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('adaptiveResolutionEnabled');
    expect(overlay).toContain('adaptiveRenderScale');
    expect(overlay).toContain('MIN_ADAPTIVE_RENDER_SCALE');
    expect(overlay).toContain('function getEffectiveRenderScale()');
    expect(overlay).toContain('function updateAdaptiveRenderScale(now)');
    expect(overlay).toContain('targetFps, 24');
    expect(overlay).toContain('resize(false)');
    expect(overlay).toContain('canvas.style.width = `${window.innerWidth}px`;');
    expect(overlay).toContain('canvas.style.height = `${window.innerHeight}px`;');
    expect(overlay).toContain('renderStats.adaptiveRenderScale');
    expect(overlay).toContain('renderStats.effectiveRenderScale');
    expect(overlay).toContain('app.renderer.resolution = Math.max(0.35, Math.min(MAX_RENDER_DPR, (window.devicePixelRatio || 1) * getEffectiveRenderScale()))');
  });
});

describe('Arena admin and backend integration contract', () => {
  function readUi() {
    return fs.readFileSync(path.join(__dirname, '..', 'ui.html'), 'utf8');
  }

  function readBackendSource(file) {
    return fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  }

  function readAppSource(file) {
    return fs.readFileSync(path.join(__dirname, '..', '..', '..', file), 'utf8');
  }

  it('exposes Live Arena as a first-class Game Engine UI tab', () => {
    const ui = readUi();

    expect(ui).toContain('data-tab="arena"');
    expect(ui).toContain('id="tab-arena"');
    expect(ui).toContain('id="arena-overlay-url"');
    expect(ui).toContain('loadArenaSettings');
    expect(ui).toContain('saveArenaSettings');
    expect(ui).toContain('/js/theme-manager.js');
    expect(ui).not.toContain('/game-engine/assets/theme-manager.js');
  });

  it('adds arena performance controls and gift-catalog weapon mapping UI', () => {
    const ui = readUi();

    expect(ui).toContain('id="arena-render-scale"');
    expect(ui).toContain('id="arena-target-fps"');
    expect(ui).toContain('id="arena-max-render-players"');
    expect(ui).toContain('id="arena-renderer-mode"');
    expect(ui).toContain('id="arena-gift-weapon-mappings-container"');
    expect(ui).toContain('id="openArenaGiftCatalogBtn"');
    expect(ui).toContain('id="refreshGiftCatalogModalBtn"');
    expect(ui).toContain('renderArenaGiftWeaponMappings');
    expect(ui).toContain('arenaGiftSelectionMode');
    expect(ui).toContain('arenaGiftSelectionMode = true');
    expect(ui).toContain('id="arena-food-spawn-interval"');
    expect(ui).toContain('id="arena-food-spawn-batch-size"');
    expect(ui).toContain('<input type="number" id="arena-food-spawn-batch-size" min="1" max="3" step="1">');
    expect(ui).toContain('id="arena-food-despawn-ms"');
    expect(ui).toContain('id="arena-food-burst-despawn-ms"');
    expect(ui).toContain('foodSpawnIntervalMs');
    expect(ui).toContain('foodBurstDespawnMs');
    expect(ui).toContain('value="chainsaw"');
    for (const weaponType of ['freeze', 'dash', 'magnet', 'vampire', 'mine']) {
      expect(ui).toContain(`value="${weaponType}"`);
    }
  });

  it('adds admin controls for arena top overlay design and rotator language', () => {
    const ui = readUi();

    expect(ui).toContain('id="arena-top-overlay-design"');
    expect(ui).toContain('id="arena-top-overlay-position"');
    expect(ui).toContain('id="arena-top-overlay-density"');
    expect(ui).toContain('id="arena-top-overlay-accent"');
    expect(ui).toContain('id="arena-top-overlay-backdrop"');
    expect(ui).toContain('id="arena-top-overlay-rotator-style"');
    expect(ui).toContain('id="arena-top-overlay-placement"');
    expect(ui).toContain('id="arena-top-overlay-show-title"');
    expect(ui).toContain('id="arena-top-overlay-show-count"');
    expect(ui).toContain('id="arena-top-overlay-show-leaderboard"');
    expect(ui).toContain('id="arena-top-overlay-leaderboard-rows"');
    expect(ui).toContain('id="arena-info-rotator-interval"');
    expect(ui).toContain('id="arena-info-rotator-messages"');
    expect(ui).toContain('id="arena-info-rotator-language"');
    for (const design of [
      'widescreen',
      'classic',
      'landscape',
      'slim',
      'high-contrast',
      'tournament-bar',
      'esports-caster',
      'cyber-strip',
      'glass-ribbon',
      'compact-scorebug',
      'vertical-stack',
      'bottom-ticker',
      'split-corners',
      'minimal-pro',
      'alert-feed',
      'framed-field'
    ]) {
      expect(ui).toContain(`value="${design}"`);
    }
    for (const option of ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']) {
      expect(ui).toContain(`value="${option}"`);
    }
    for (const option of ['field-auto', 'small', 'compact', 'normal', 'large', 'very-large', 'huge', 'in-hud', 'auto', 'inside-field', 'above-field', 'below-field']) {
      expect(ui).toContain(`value="${option}"`);
    }
    for (const option of ['full', 'compact', 'ticker', 'cyan', 'gold', 'red', 'green', 'mono', 'transparent', 'glass', 'solid', 'card', 'badge', 'split']) {
      expect(ui).toContain(`value="${option}"`);
    }
    for (const languageMode of ['de-en', 'en-de', 'de', 'en']) {
      expect(ui).toContain(`value="${languageMode}"`);
    }
    expect(ui).toContain("setArenaField('arena-top-overlay-design'");
    expect(ui).toContain("setArenaField('arena-top-overlay-position'");
    expect(ui).toContain("setArenaField('arena-top-overlay-density'");
    expect(ui).toContain("setArenaField('arena-top-overlay-accent'");
    expect(ui).toContain("setArenaField('arena-top-overlay-backdrop'");
    expect(ui).toContain("setArenaField('arena-top-overlay-rotator-style'");
    expect(ui).toContain("setArenaField('arena-top-overlay-placement'");
    expect(ui).toContain("setArenaField('arena-top-overlay-text-scale'");
    expect(ui).toContain("setArenaField('arena-info-rotator-placement'");
    expect(ui).toContain("setArenaField('arena-info-rotator-language'");
    expect(ui).toContain('topOverlayDesign: document.getElementById');
    expect(ui).toContain('topOverlayPosition: document.getElementById');
    expect(ui).toContain('topOverlayDensity: document.getElementById');
    expect(ui).toContain('topOverlayAccent: document.getElementById');
    expect(ui).toContain('topOverlayBackdrop: document.getElementById');
    expect(ui).toContain('topOverlayRotatorStyle: document.getElementById');
    expect(ui).toContain('topOverlayPlacement: document.getElementById');
    expect(ui).toContain('topOverlayTextScale: document.getElementById');
    expect(ui).toContain('infoRotatorPlacement: document.getElementById');
    expect(ui).toContain('infoRotatorLanguageMode: document.getElementById');
    expect(ui).toContain('infoRotatorMessages: getArenaRotatorMessages');
  });

  it('adds admin controls for direct like growth caps', () => {
    const ui = readUi();

    expect(ui).toContain('id="arena-like-life-value"');
    expect(ui).toContain('id="arena-like-growth-max-mass"');
    expect(ui).toContain('id="arena-max-like-life-batch"');
    expect(ui).toContain("setArenaField('arena-like-life-value'");
    expect(ui).toContain("setArenaField('arena-like-growth-max-mass'");
    expect(ui).toContain("setArenaField('arena-max-like-life-batch'");
    expect(ui).toContain("likeLifeValue: getArenaNumber('arena-like-life-value'");
    expect(ui).toContain("likeGrowthMaxMass: getArenaNumber('arena-like-growth-max-mass'");
    expect(ui).toContain("maxLikeLifeBatch: getArenaNumber('arena-max-like-life-batch'");
  });

  it('adds admin controls for arena field size presets and frame designs', () => {
    const ui = readUi();

    expect(ui).toContain('id="arena-size-preset"');
    expect(ui).toContain('id="arena-width"');
    expect(ui).toContain('id="arena-height"');
    for (const preset of ['stream-bottom', 'standard', 'wide', 'compact', 'vertical', 'custom']) {
      expect(ui).toContain(`value="${preset}"`);
    }
    expect(ui).toContain('id="arena-field-frame-enabled"');
    expect(ui).toContain('id="arena-field-frame-design"');
    expect(ui).toContain('id="arena-field-frame-thickness"');
    expect(ui).toContain('id="arena-field-frame-glow"');
    for (const design of ['neon-grid', 'hazard-zone', 'glass-circuit', 'retro-arcade', 'high-contrast', 'minimal']) {
      expect(ui).toContain(`value="${design}"`);
    }
    expect(ui).toContain('ARENA_SIZE_PRESETS');
    expect(ui).toContain("'stream-bottom': { width: 1080, height: 1000 }");
    expect(ui).toContain('applyArenaSizePresetToFields');
    expect(ui).toContain("setArenaField('arena-size-preset'");
    expect(ui).toContain("setArenaField('arena-field-frame-design'");
    expect(ui).toContain('arenaSizePreset: document.getElementById');
    expect(ui).toContain('fieldFrameEnabled: document.getElementById');
  });

  it('keeps arena admin frame defaults aligned with the OBS-safe runtime defaults', () => {
    const ui = readUi();

    expect(ui).toContain("setArenaField('arena-size-preset', config.arenaSizePreset || 'stream-bottom')");
    expect(ui).toContain("setArenaField('arena-field-frame-design', config.fieldFrameDesign || 'minimal')");
    expect(ui).toContain("setArenaField('arena-field-frame-glow', config.fieldFrameGlow !== undefined ? config.fieldFrameGlow : 0.45)");
    expect(ui).toContain("base.arenaSizePreset || 'stream-bottom'");
    expect(ui).toContain("base.fieldFrameDesign || 'minimal'");
    expect(ui).not.toContain("config.fieldFrameDesign || 'neon-grid'");
    expect(ui).not.toContain("base.fieldFrameDesign || 'neon-grid'");
  });

  it('adds admin controls for large ball transparency', () => {
    const ui = readUi();

    expect(ui).toContain('id="arena-large-ball-transparency-mode"');
    expect(ui).toContain('value="off"');
    expect(ui).toContain('value="flat"');
    expect(ui).toContain('value="scale"');
    expect(ui).toContain('id="arena-large-ball-transparency-start-mass"');
    expect(ui).toContain('id="arena-large-ball-min-opacity"');
    expect(ui).toContain('largeBallTransparencyEnabled');
    expect(ui).toContain('largeBallTransparencyMode');
    expect(ui).toContain('largeBallTransparencyStartMass');
    expect(ui).toContain('largeBallMinOpacity');
    expect(ui).toContain("setArenaField('arena-large-ball-transparency-mode'");
    expect(ui).toContain("setArenaField('arena-large-ball-transparency-start-mass'");
    expect(ui).toContain("setArenaField('arena-large-ball-min-opacity'");
  });

  it('adds admin controls for arena chat strategy commands', () => {
    const ui = readUi();

    expect(ui).toContain('Arena Chat-Steuerung');
    expect(ui).toContain('id="arena-chat-strategy-enabled"');
    expect(ui).toContain('id="arena-chat-command-prefix"');
    expect(ui).toContain('id="arena-chat-strategy-duration"');
    expect(ui).toContain('id="arena-chat-strategy-cooldown"');
    expect(ui).toContain('id="arena-chat-target-enabled"');
    expect(ui).toContain('id="arena-show-command-hints"');
    expect(ui).toContain('chatStrategyEnabled');
    expect(ui).toContain('chatStrategyDurationMs');
    expect(ui).toContain('chatStrategyCooldownMs');
    expect(ui).toContain('chatTargetCommandEnabled');
    expect(ui).toContain('topOverlayShowCommandHints');
  });

  it('adds configurable direct ability timing and colors to the arena dashboard', () => {
    const ui = readUi();

    expect(ui).toContain('id="arena-direct-abilities-enabled"');
    expect(ui).toContain('id="arena-ability-charge-seconds"');
    expect(ui).toContain('id="arena-boost-duration-seconds"');
    expect(ui).toContain('id="arena-shield-duration-seconds"');
    expect(ui).toContain('id="arena-boost-color"');
    expect(ui).toContain('id="arena-shield-color"');
    expect(ui).toContain('boostDurationMs: getArenaNumber');
    expect(ui).toContain('shieldDurationMs: getArenaNumber');
  });

  it('registers and dispatches the arena GCCE chat command', () => {
    const mainSource = readBackendSource('main.js');

    expect(mainSource).toContain("name: 'arena'");
    expect(mainSource).toContain('handleArenaCommand');
    expect(mainSource).toContain("message.match(/^!arena\\s+(.+)$/i)");
    expect(mainSource).toContain('this.arenaGame.handleChatStrategy');
    expect(mainSource).toContain("['boost', 'shield', 'bomb']");
    expect(mainSource).toContain('handleArenaAbilityCommand');
    expect(mainSource).toContain('^!(boost|shield|schild|bomb)$');
  });

  it('declares and serves PixiJS and Rapier vendor assets locally', () => {
    const packageJson = JSON.parse(readAppSource('package.json'));
    const serverSource = readAppSource('server.js');

    expect(packageJson.dependencies).toEqual(expect.objectContaining({
      'pixi.js': expect.any(String),
      '@dimforge/rapier2d-compat': expect.any(String)
    }));
    expect(serverSource).toContain("app.use('/vendor/pixi'");
    expect(serverSource).toContain("app.use('/vendor/rapier2d'");
  });

  it('includes arena in overlay mode defaults, validation, and UI saving', () => {
    const dbSource = readBackendSource(path.join('backend', 'database.js'));
    const mainSource = readBackendSource('main.js');
    const ui = readUi();

    expect(dbSource).toMatch(/const games = \[[^\]]*'arena'[^\]]*\]/);
    expect(mainSource).toMatch(/const validGames = \[[^\]]*'arena'[^\]]*\]/);
    expect(ui).toContain('id="overlay-mode-arena"');
    expect(ui).toMatch(/const games = \[[^\]]*'arena'[^\]]*\]/);
  });
});
describe('Arena left info and German shield alias contracts', () => {
  it('round-trips stream-left-panel through Arena config updates and state', () => {
    const { arena, db } = createArena();
    db.saveGameConfig.mockImplementation((_game, savedConfig) => {
      db.getGameConfig.mockReturnValue(savedConfig);
    });

    const updated = arena.updateConfig({ infoRotatorPlacement: 'stream-left-panel' });

    expect(updated.infoRotatorPlacement).toBe('stream-left-panel');
    expect(arena.getState('test').config.infoRotatorPlacement).toBe('stream-left-panel');
  });

  it('normalizes stream-left-panel and unsupported info rotator placements without changing the existing default', () => {
    expect(createArena({ infoRotatorPlacement: 'stream-left-panel' }).arena.getConfig().infoRotatorPlacement)
      .toBe('stream-left-panel');
    expect(createArena({ infoRotatorPlacement: 'not-a-placement' }).arena.getConfig().infoRotatorPlacement)
      .toBe('in-hud');
    expect(createArena().arena.getConfig().infoRotatorPlacement).toBe('in-hud');
  });

  it('renders stream-left-panel ability cards first with the German schild alias and configured timing', () => {
    const overlay = fs.readFileSync(path.join(__dirname, '..', 'overlay', 'arena.html'), 'utf8');
    const ui = fs.readFileSync(path.join(__dirname, '..', 'ui.html'), 'utf8');
    const abilitiesAt = overlay.indexOf('...getArenaAbilityHints(config)');
    const localizedInfoAt = overlay.indexOf('...buildLocalizedInfoMessages(config)');

    expect(overlay).toContain('"stream-left-panel"');
    expect(overlay).toContain('data-arena-info-placement="stream-left-panel"');
    expect(overlay).toContain('body[data-arena-info-placement="stream-left-panel"] #arena-info-rotator');
    expect(overlay).toContain('!schild/!shield: ${shieldDurationSeconds}s Schutz, ${abilityChargeSeconds}s CD');
    expect(overlay).toContain('shieldDurationMs');
    expect(overlay).toContain('abilityChargeMs');
    expect(abilitiesAt).toBeGreaterThanOrEqual(0);
    expect(localizedInfoAt).toBeGreaterThan(abilitiesAt);
    expect(ui).toContain('value="stream-left-panel"');
    expect(ui).toContain('Linkes Infofeld (Stream)');
  });

  it('maps schild to the canonical shield ability in GCCE and raw chat handling', () => {
    const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

    expect(mainSource).toContain("name: 'schild'");
    expect(mainSource).toContain("handler: async (_args, context) => await this.handleArenaAbilityCommand('shield', context)");
    expect(mainSource).toContain('^!(boost|shield|schild|bomb)$');
    expect(mainSource).toContain("const ability = arenaAbilityMatch[1].toLowerCase() === 'schild' ? 'shield' : arenaAbilityMatch[1].toLowerCase();");
  });
});
describe('Arena left info review regressions', () => {
  it('reserves a three-line portrait ability card so shield duration and cooldown stay visible', () => {
    const overlay = fs.readFileSync(path.join(__dirname, '..', 'overlay', 'arena.html'), 'utf8');
    const portraitPanelStart = overlay.indexOf('body[data-arena-info-placement="stream-left-panel"] #arena-info-rotator {');
    const portraitPanel = overlay.slice(portraitPanelStart, overlay.indexOf('@media (orientation: landscape)', portraitPanelStart));

    expect(portraitPanel).toContain('min-height: clamp(104px, 10vh, 150px);');
    expect(overlay).toContain('body[data-arena-info-placement="stream-left-panel"] #arena-info-rotator[data-info-kind="ability"] #arena-info-text');
    expect(overlay).toContain('-webkit-line-clamp: 3;');
    expect(overlay).toContain('!schild/!shield: ${shieldDurationSeconds}s Schutz, ${abilityChargeSeconds}s CD');
  });

  it('keeps English-only shield copy English while preserving both aliases and localized dashboard text', () => {
    const overlay = fs.readFileSync(path.join(__dirname, '..', 'overlay', 'arena.html'), 'utf8');
    const ui = fs.readFileSync(path.join(__dirname, '..', 'ui.html'), 'utf8');

    expect(overlay).toContain('preferGermanInAlternating: true');
    expect(overlay).toContain("const textLanguage = definition.preferGermanInAlternating && languages.length > 1 ? 'de' : language;");
    expect(overlay).toContain('!schild/!shield: ${shieldDurationSeconds}s shield, ${abilityChargeSeconds}s CD');
    expect(ui).toContain('value="stream-left-panel" data-i18n="plugins.game-engine.labels.linkes_infofeld_stream"');
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'locales', `${locale}.json`), 'utf8'));
      expect(catalog.plugins['game-engine'].labels.linkes_infofeld_stream).toBeTruthy();
    }
  });
  it('keeps the German shield alias copy in the default de-en ability rotation', () => {
    const overlay = fs.readFileSync(path.join(__dirname, '..', 'overlay', 'arena.html'), 'utf8');

    expect(overlay).toContain('preferGermanInAlternating: true');
    expect(overlay).toContain("const textLanguage = definition.preferGermanInAlternating && languages.length > 1 ? 'de' : language;");
    expect(overlay).toContain('text: definition.text[textLanguage]');
  });

  it('reserves a landscape outside band for stream-left-panel before using its fallback CSS', () => {
    const overlay = fs.readFileSync(path.join(__dirname, '..', 'overlay', 'arena.html'), 'utf8');

    expect(overlay).toContain("infoPlacement === 'stream-left-panel'");
    expect(overlay).toContain("infoPlacement === 'below-field' || infoPlacement === 'stream-left-panel'");
    expect(overlay).toContain("const infoOutside = ['above-field', 'below-field', 'stream-left-panel'].includes(infoPlacement);");
    expect(overlay).toContain('body[data-arena-info-placement="stream-left-panel"] #arena-info-rotator');
  });
});
