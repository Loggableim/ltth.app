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

  return { arena, io, db };
}

describe('ArenaGame', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    expect(config.weaponPickupTypes).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'chainsaw' })
    ]));
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
      targetFps: 60,
      maxRenderPlayers: 48,
      rendererMode: 'auto'
    });

    const state = arena.getState('test');

    expect(state.config).toEqual(expect.objectContaining({
      renderScale: 0.7,
      targetFps: 60,
      maxRenderPlayers: 48,
      rendererMode: 'auto'
    }));
  });

  it('uses high-frequency arena state cadence so render FPS changes can look smooth', () => {
    const { arena } = createArena();
    const config = arena.getConfig();
    const state = arena.getState('test');

    expect(config.tickRateMs).toBeLessThanOrEqual(50);
    expect(config.stateEmitIntervalMs).toBeLessThanOrEqual(50);
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
    expect(config.stateEmitIntervalMs).toBeLessThanOrEqual(50);
    expect(config.targetFps).toBe(60);
  });

  it('upgrades previous 50ms arena cadence defaults to smoother snapshots', () => {
    const { arena } = createArena({
      tickRateMs: 50,
      stateEmitIntervalMs: 50
    });
    const config = arena.getConfig();

    expect(config.tickRateMs).toBeLessThan(50);
    expect(config.stateEmitIntervalMs).toBeLessThan(50);
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
      fleeDistance: 320,
      huntDistance: 460,
      foodSenseDistance: 460,
      steeringStrength: 0.3,
      randomTurn: 0.04,
      fleeMassRatio: 1.03,
      huntMassRatio: 1.04,
      huntLeadSeconds: 0.65,
      threatLookaheadSeconds: 0.9,
      targetSwitchScoreMargin: 1.2
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
      fleeDistance: 320,
      huntDistance: 460,
      steeringStrength: 0.3,
      randomTurn: 0.04,
      fleeMassRatio: 1.03,
      huntMassRatio: 1.04,
      threatLookaheadSeconds: 0.9,
      targetSwitchScoreMargin: 1.2
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

  it('lets aggressive balls pressure near-equal rivals when no growth route exists', () => {
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
    Object.assign(rival, { x: 620, y: 500, vx: 0, vy: 0, mass: 32, weapon: null });
    arena.food.clear();
    arena.weaponPickups.clear();
    arena._syncRadius(hunter, config);
    arena._syncRadius(rival, config);

    const decision = arena.chooseBehavior(hunter, config);

    expect(decision.mode).toBe('pressure-player');
    expect(decision.intent).toBe('pressure');
    expect(decision.target.username).toBe('pressure_rival');
    expect(decision.vector.x).toBeGreaterThan(0.6);
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

  it('lets dominant hunters catch fleeing prey inside strike range instead of losing distance forever', () => {
    let now = 1000;
    const { arena } = createArena({
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
      x: 200,
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
      x: 320,
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

    for (let i = 0; i < 100 && arena.players.has('strike_prey'); i++) {
      now += 50;
      arena.tick(50);
    }

    expect(hunter.behaviorMemory.intent).toBe('attack');
    expect(arena.players.has('strike_prey')).toBe(false);
    expect(hunter.kills).toBe(1);
    expect(arena._distance(hunter, prey)).toBeLessThan(startDistance);
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

  it('lets armed predators challenge prey they would flee from while unarmed', () => {
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
    expect(unarmedDecision.mode).toBe('flee');
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
    expect(big.x - 300).toBeLessThan(100);
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
    snack.x = 241;
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
    Object.assign(snack, { x: 228, y: 200, mass: 20 });
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
      randomness: expect.any(Number)
    }));
    expect(serialized.personality).toEqual(expect.objectContaining({
      id: player.personality.id,
      label: player.personality.label
    }));
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

    expect(config.targetFps).toBe(60);
    expect(config.tickRateMs).toBeLessThanOrEqual(50);
    expect(config.stateEmitIntervalMs).toBeLessThanOrEqual(50);
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
        fleeMassRatio: 1.08,
        huntMassRatio: 1.1,
        huntLeadSeconds: 0.45,
        boundaryAvoidanceDistance: 75
      }
    });

    expect(config.movement).toEqual(expect.objectContaining({
      fleeDistance: 320,
      huntDistance: 460,
      steeringStrength: 0.3,
      randomTurn: 0.04,
      fleeMassRatio: 1.03,
      huntMassRatio: 1.04,
      threatLookaheadSeconds: 0.9,
      targetSwitchScoreMargin: 1.2
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
    expect(config.giftWeaponMappings['7171']).toEqual(expect.objectContaining({
      giftName: 'Shield',
      weaponType: 'shield'
    }));
    expect(config.giftWeaponMappings['6369']).toEqual(expect.objectContaining({
      giftName: 'Lion',
      weaponType: 'chainsaw'
    }));
  });
});

describe('Arena overlay rendering contract', () => {
  function readOverlay() {
    return fs.readFileSync(path.join(__dirname, '..', 'overlay', 'arena.html'), 'utf8');
  }

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

  it('draws chainsaw super weapon teeth around player avatars', () => {
    const overlay = readOverlay();

    expect(overlay).toContain('chainsaw');
    expect(overlay).toContain('drawChainsawTeeth');
    expect(overlay).toContain('chainsaw_teeth');
  });

  it('keeps the arena canvas background clear while food and weapon effects stay translucent', () => {
    const overlay = readOverlay();

    expect(overlay).not.toContain('ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);');
    expect(overlay).toContain('foodOpacity');
    expect(overlay).toContain('state.fever?.active ? 0.36 : 0.28');
    expect(overlay).toContain('weaponAlpha');
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
    expect(ui).toContain('value="chainsaw"');
    for (const weaponType of ['freeze', 'dash', 'magnet', 'vampire', 'mine']) {
      expect(ui).toContain(`value="${weaponType}"`);
    }
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
