'use strict';

const DEFAULT_TICK_RATE_MS = 33;
const LEGACY_DEFAULT_TICK_RATE_MS = 100;
const PREVIOUS_DEFAULT_TICK_RATE_MS = 50;
const LEGACY_DEFAULT_STATE_EMIT_INTERVAL_MS = 120;
const PREVIOUS_DEFAULT_STATE_EMIT_INTERVAL_MS = 50;
const PREVIOUS_HIGH_FREQUENCY_STATE_EMIT_INTERVAL_MS = 33;
const LEGACY_DEFAULT_TARGET_FPS = 30;
const PREVIOUS_HIGH_DEFAULT_TARGET_FPS = 60;
const LEGACY_DEFAULT_INACTIVITY_GRACE_MS = 15000;
const LEGACY_DEFAULT_INACTIVITY_SHRINK_PER_SECOND = 5;
const LEGACY_DEFAULT_MAX_MASS = 90;
const LEGACY_DEFAULT_MAX_LIVES = 2500;
const PREVIOUS_DEFAULT_MAX_MASS = 140;
const PREVIOUS_DEFAULT_MAX_LIVES = 6000;
const PREVIOUS_ACTION_MAX_MASS = 170;
const PREVIOUS_ACTION_MAX_LIVES = 9000;
const LEGACY_DEFAULT_MAX_FOOD = 90;
const LEGACY_DEFAULT_MAX_FOOD_RENDER = 52;
const PREVIOUS_SPARSE_MAX_FOOD = 50;
const PREVIOUS_SPARSE_MAX_FOOD_RENDER = 25;
const PREVIOUS_HIGH_MAX_FOOD_RENDER = 90;
const LEGACY_DEFAULT_FOOD_VALUE = 2.25;
const PREVIOUS_DEFAULT_PLAYER_ABSORB_MASS_RATIO = 0.7;
const PREVIOUS_DEFAULT_PLAYER_ABSORB_LIFE_STEAL_RATIO = 0.7;
const PREVIOUS_LOW_PLAYER_ABSORB_MASS_RATIO = 0.42;
const PREVIOUS_LOW_PLAYER_ABSORB_LIFE_STEAL_RATIO = 0.55;
const PREVIOUS_ACTION_PLAYER_ABSORB_MASS_RATIO = 0.9;
const PREVIOUS_ACTION_PLAYER_ABSORB_LIFE_STEAL_RATIO = 0.9;
const PREVIOUS_DEFAULT_DEATH_FOOD_DROP_COUNT = 12;
const PREVIOUS_DEFAULT_DEATH_FOOD_DROP_VALUE = 1.15;
const PREVIOUS_LOW_DEATH_FOOD_DROP_COUNT = 8;
const PREVIOUS_LOW_DEATH_FOOD_DROP_VALUE = 0.9;
const PREVIOUS_ACTION_DEATH_FOOD_DROP_COUNT = 16;
const PREVIOUS_ACTION_DEATH_FOOD_DROP_VALUE = 1.25;
const LEGACY_DEFAULT_GIFT_MEDIUM_MIN_VALUE = 100;
const LEGACY_DEFAULT_GIFT_LARGE_MIN_VALUE = 1000;
const PREVIOUS_DEFAULT_GIFT_MEDIUM_MIN_VALUE = 20;
const PREVIOUS_DEFAULT_GIFT_LARGE_MIN_VALUE = 100;
const PREVIOUS_STREAM_GIFT_MEDIUM_MIN_VALUE = 10;
const PREVIOUS_STREAM_GIFT_LARGE_MIN_VALUE = 50;
const PREVIOUS_ACTION_MAX_WEAPON_PICKUPS = 8;
const PREVIOUS_ACTION_WEAPON_PICKUP_SPAWN_INTERVAL_MS = 4500;
const PREVIOUS_ACTION_WEAPON_PICKUP_CHANCE = 0.45;
const PREVIOUS_ACTION_WEAPON_PICKUP_DURATION_MS = 18000;
const LEGACY_DEFAULT_FIELD_FRAME_DESIGN = 'neon-grid';
const LARGE_BALL_TRANSPARENCY_MODES = new Set(['off', 'flat', 'scale']);

const DEFAULT_GIFT_WEAPON_MAPPINGS = {
  '5655': {
    giftName: 'Rose',
    catalogDiamondCount: 1,
    weaponType: 'speed',
    tier: 'small',
    power: 1.15,
    durationMs: 6500,
    growthBonus: 1.5
  },
  '7171': {
    giftName: 'Shield',
    catalogDiamondCount: 1,
    weaponType: 'shield',
    tier: 'small',
    power: 1.25,
    durationMs: 7200,
    growthBonus: 1.5
  },
  '5827': {
    giftName: 'Ice Cream Cone',
    catalogDiamondCount: 1,
    weaponType: 'freeze',
    tier: 'small',
    power: 1.35,
    durationMs: 6800,
    growthBonus: 1.4
  },
  '6652': {
    giftName: 'Lightning Bolt',
    catalogDiamondCount: 1,
    weaponType: 'dash',
    tier: 'small',
    power: 1.55,
    durationMs: 5600,
    growthBonus: 1.6
  },
  '52616': {
    giftName: 'Party Laser',
    catalogDiamondCount: 1300,
    weaponType: 'laser',
    tier: 'large',
    power: 4.4,
    durationMs: 12500,
    growthBonus: 9
  },
  '17825': {
    giftName: 'Money Magnet',
    catalogDiamondCount: 549,
    weaponType: 'magnet',
    tier: 'medium',
    power: 3.2,
    durationMs: 10500,
    growthBonus: 5.5
  },
  '18361': {
    giftName: 'Fireworks',
    catalogDiamondCount: 500,
    weaponType: 'pulse',
    tier: 'medium',
    power: 3,
    durationMs: 10000,
    growthBonus: 5
  },
  '7934': {
    giftName: 'Heart Me',
    catalogDiamondCount: 1,
    weaponType: 'vampire',
    tier: 'small',
    power: 1.65,
    durationMs: 7200,
    growthBonus: 1.8
  },
  '12852': {
    giftName: 'Level Ship',
    catalogDiamondCount: 1500,
    weaponType: 'missile',
    tier: 'large',
    power: 4.2,
    durationMs: 12500,
    growthBonus: 9
  },
  '5587': {
    giftName: 'Gold Mine',
    catalogDiamondCount: 1000,
    weaponType: 'mine',
    tier: 'large',
    power: 4,
    durationMs: 13000,
    growthBonus: 8
  },
  '11046': {
    giftName: 'Galaxy',
    catalogDiamondCount: 1000,
    weaponType: 'blackhole',
    tier: 'large',
    power: 4.6,
    durationMs: 14000,
    growthBonus: 10
  },
  '6369': {
    giftName: 'Lion',
    catalogDiamondCount: 29999,
    weaponType: 'chainsaw',
    tier: 'large',
    power: 5.4,
    durationMs: 13500,
    growthBonus: 14
  }
};

const DEFAULT_CONFIG = {
  enabled: true,
  arenaSizePreset: 'stream-bottom',
  arenaWidth: 1080,
  arenaHeight: 1000,
  fieldFrameEnabled: true,
  fieldFrameDesign: 'minimal',
  fieldFrameThickness: 3,
  fieldFrameGlow: 0.45,
  largeBallTransparencyEnabled: true,
  largeBallTransparencyMode: 'scale',
  largeBallTransparencyStartMass: 55,
  largeBallMinOpacity: 0.42,
  maxPlayers: 80,
  maxFood: 130,
  maxFoodRender: 72,
  renderScale: 0.7,
  adaptiveResolutionEnabled: true,
  targetFps: 45,
  maxRenderPlayers: 48,
  rendererMode: 'auto',
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
  infoRotatorLanguageMode: 'de-en',
  chatStrategyEnabled: true,
  chatStrategyDurationMs: 45000,
  chatStrategyCooldownMs: 8000,
  chatTargetCommandEnabled: true,
  topOverlayShowCommandHints: true,
  maxWeaponPickups: 10,
  weaponPickupRadius: 14,
  weaponPickupSpawnIntervalMs: 3400,
  weaponPickupChance: 0.68,
  weaponPickupDurationMs: 24000,
  spawnSafetyAttempts: 24,
  spawnEdgePadding: 110,
  spawnThreatClearanceRatio: 1,
  baseMass: 18,
  minMass: 8,
  maxMass: 520,
  baseLives: 100,
  spawnDelayMs: 15000,
  spawnBaseLives: 45,
  spawnLifeVariance: 0.2,
  spawnLifeMinFactor: 0.35,
  spawnLifeMaxFactor: 2.55,
  spawnTopTenCapRatio: 0.92,
  spawnProtectionMs: 4500,
  respawnCooldownMs: 60000,
  minLives: 20,
  maxLives: 88000,
  directAbilitiesEnabled: true,
  abilityChargeMs: 60000,
  boostDurationMs: 6000,
  shieldDurationMs: 8000,
  boostColor: '#EF4444',
  shieldColor: '#3B82F6',
  bombCooldownMs: 15000,
  bombSpeed: 650,
  bombRange: 420,
  bombBlastRadius: 92,
  likeLifeValue: 1,
  likeGrowthMaxMass: 42,
  giftLifePerCoin: 25,
  maxLikeLifeBatch: 500,
  maxGiftLifeBatch: 50000,
  baseEnergy: 60,
  maxEnergy: 120,
  inactivityGraceMs: 30000,
  inactivityShrinkPerSecond: 1.25,
  energyDecayPerSecond: 1.2,
  foodValue: 1.35,
  foodRadius: 5,
  foodSpawnIntervalMs: 1600,
  foodSpawnBatchSize: 2,
  foodDespawnMs: 120000,
  foodBurstDespawnMs: 90000,
  lifeDropDespawnMs: 180000,
  lifeDropFadeMs: 55000,
  lifeDropSpread: 40,
  lifeDropMotionScale: 0.12,
  foodGrowthFalloffStartMass: 42,
  foodGrowthMinMultiplier: 0.22,
  largePlayerFoodIgnoreMassRatio: 0.78,
  largePlayerFoodEnergyRatio: 0.35,
  eatRadiusRatio: 1.15,
  deathFoodDropCount: 18,
  deathFoodDropValue: 1.4,
  deathFoodDropSpread: 104,
  likeFoodSpawnInterval: 3,
  likeFoodValue: 1,
  maxFoodBurstPerEvent: 24,
  giftExtraLifeValue: 1,
  playerAbsorbOverlapRatio: 0.65,
    playerAbsorbMassRatio: 0.82,
    playerAbsorbLifeStealRatio: 0.84,
  tickRateMs: DEFAULT_TICK_RATE_MS,
  stateEmitIntervalMs: 66,
  feverIntervalMs: 180000,
  feverDurationMs: 30000,
  feverFoodMultiplier: 2,
  activityWeights: {
    join: { energy: 6, mass: 0.7, lives: 8 },
    chat: { energy: 10, mass: 1.2, lives: 14 },
    like: { energy: 4, mass: 0.35, lives: 1 },
    follow: { energy: 18, mass: 2.5, lives: 28 },
    share: { energy: 14, mass: 2, lives: 22 },
    subscribe: { energy: 24, mass: 4, lives: 45 },
    gift: { energy: 20, mass: 3, lives: 0 }
  },
  movement: {
    baseSpeed: 90,
    fleeDistance: 360,
    huntDistance: 520,
    weaponSenseDistance: 620,
    foodSenseDistance: 460,
    steeringStrength: 0.3,
    randomTurn: 0.032,
    fleeMassRatio: 0.98,
    huntMassRatio: 1.02,
    huntLeadSeconds: 0.65,
    threatLookaheadSeconds: 0.9,
    fleeSpeedBoost: 0.36,
    huntSpeedBoost: 0.24,
    huntStrikeDistance: 260,
    huntStrikeBoost: 1.18,
    smallMassSpeedBoost: 0.35,
    largeMassSpeedPenalty: 1.5,
    minMassSpeedMultiplier: 0.38,
    maxMassSpeedMultiplier: 1.35,
    boundaryAvoidanceDistance: 90,
    boundaryAvoidanceStrength: 0.8,
    behaviorMemoryMs: 2600,
    targetSwitchScoreMargin: 3.8,
    pressureMassAdvantageRatio: 1.12,
    armedPressureMinMassRatio: 0.78,
    wanderTurnIntervalMs: 850,
    wanderFocusMinMs: 2200,
    wanderFocusMaxMs: 4500,
    wanderSpeedMultiplier: 0.48
  },
  giftWeaponMappings: DEFAULT_GIFT_WEAPON_MAPPINGS,
  infoRotatorIntervalMs: 4200,
  infoRotatorMessages: [],
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
      commitment: 0.75,
      riskTolerance: 1.45
    },
    {
      id: 'survivor',
      label: 'Survivor',
      aggression: 0.72,
      fear: 1.42,
      intelligence: 1.15,
      weaponFocus: 1.3,
      foodFocus: 0.95,
      randomness: 0.42,
      commitment: 1.25,
      riskTolerance: 0.55
    },
    {
      id: 'tactician',
      label: 'Tactician',
      aggression: 1,
      fear: 0.95,
      intelligence: 1.45,
      weaponFocus: 1.25,
      foodFocus: 1,
      randomness: 0.25,
      commitment: 1.45,
      riskTolerance: 0.95
    },
    {
      id: 'opportunist',
      label: 'Opportunist',
      aggression: 1.15,
      fear: 0.95,
      intelligence: 1.12,
      weaponFocus: 1.05,
      foodFocus: 1.2,
      randomness: 0.42,
      commitment: 1,
      riskTolerance: 1.12
    },
    {
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
    },
    {
      id: 'chaotic',
      label: 'Chaotic',
      aggression: 1.18,
      fear: 0.9,
      intelligence: 0.62,
      weaponFocus: 0.75,
      foodFocus: 1,
      randomness: 1.15,
      commitment: 0.55,
      riskTolerance: 1.35
    }
  ],
  weaponPickupTypes: [
    { type: 'speed', power: 1.2, durationMs: 7000, weight: 28 },
    { type: 'shield', power: 1.4, durationMs: 8000, weight: 20 },
    { type: 'freeze', power: 1.8, durationMs: 7500, weight: 18 },
    { type: 'dash', power: 2.2, durationMs: 5200, weight: 16 },
    { type: 'laser', power: 2.1, durationMs: 8500, weight: 18 },
    { type: 'magnet', power: 2.2, durationMs: 8500, weight: 15 },
    { type: 'pulse', power: 2.4, durationMs: 9000, weight: 16 },
    { type: 'vampire', power: 2.7, durationMs: 8500, weight: 12 },
    { type: 'missile', power: 3, durationMs: 9500, weight: 12 },
    { type: 'mine', power: 3.1, durationMs: 10000, weight: 10 },
    { type: 'blackhole', power: 3.8, durationMs: 10500, weight: 6 },
    { type: 'chainsaw', power: 4.6, durationMs: 11000, weight: 22 }
  ],
  weaponPhysics: {
    laserRange: 280,
    laserDamagePerSecond: 8,
    laserScoreMultiplier: 1.1,
    missileRange: 340,
    missileDamagePerSecond: 12,
    pulseRadius: 190,
    pulseDamagePerSecond: 4,
    pulsePushPerSecond: 160,
    blackholeRadius: 220,
    blackholeFoodPullPerSecond: 480,
    blackholePlayerPullPerSecond: 120,
    blackholeGrowthMultiplier: 1.2,
    chainsawSpeedBoost: 0.55,
    chainsawRequiredMassRatio: 1.04,
    chainsawAbsorbOverlapBonus: 0.58,
    chainsawAbsorbMassRatio: 0.82,
    chainsawAbsorbLifeStealRatio: 0.95,
    chainsawThreatMassRatio: 2.65,
    chainsawHitCooldownMs: 360,
    chainsawSplatterFoodCount: 18,
    chainsawLifeDropCount: 16,
    chainsawLargeTargetDamageRatio: 0.26,
    chainsawLargeTargetMinDamage: 95,
    chainsawBounceSpeed: 1.3,
    freezeRadius: 230,
    freezeSlowMultiplier: 0.42,
    freezeDurationMs: 1250,
    freezeDamagePerSecond: 2.4,
    dashSpeedBoost: 0.85,
    dashRequiredMassRatio: 1.1,
    dashAbsorbOverlapBonus: 0.22,
    dashAbsorbLifeStealRatio: 0.65,
    magnetRadius: 260,
    magnetFoodPullPerSecond: 360,
    magnetPlayerPullPerSecond: 90,
    vampireRange: 170,
    vampireDrainPerSecond: 18,
    vampireStealRatio: 0.72,
    mineRadius: 62,
    mineDamage: 34,
    mineSlowMultiplier: 0.45,
    mineSlowDurationMs: 1200,
    mineDropIntervalMs: 950,
    mineDurationMs: 9000,
    weaponCooldownMs: {
      laser: 350,
      missile: 520,
      pulse: 460,
      blackhole: 90,
      freeze: 420,
      magnet: 90,
      vampire: 360,
      mine: 950
    }
  },
  giftTiers: {
    small: {
      minValue: 0,
      weaponType: 'speed',
      weaponTypes: ['speed', 'shield', 'freeze', 'dash'],
      power: 1,
      durationMs: 6000,
      growthBonus: 1.5
    },
    medium: {
      minValue: 5,
      weaponType: 'laser',
      weaponTypes: ['laser', 'pulse', 'magnet', 'vampire', 'freeze', 'dash', 'chainsaw'],
      power: 2.5,
      durationMs: 9000,
      growthBonus: 4
    },
    large: {
      minValue: 20,
      weaponType: 'blackhole',
      weaponTypes: ['chainsaw', 'blackhole', 'missile', 'chainsaw', 'vampire', 'mine', 'magnet'],
      power: 5,
      durationMs: 14000,
      growthBonus: 8
    }
  },
  displayTexts: {
    titleText: 'LIVE ARENA',
    feverText: 'FEVER MODE',
    emptyText: 'Waiting for live activity'
  }
};

const AI_STATE_MIN_DURATION_MS = 900;

class ArenaGame {
  constructor(api, db, logger, options = {}) {
    this.api = api;
    this.db = db;
    this.logger = this._normalizeLogger(logger);
    this.io = this._getSocketIO();
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.random = typeof options.random === 'function' ? options.random : () => Math.random();

    this.players = new Map();
    this.pendingSpawns = new Map();
    this.playerIdentityAliases = new Map();
    this.pendingSpawnIdentityAliases = new Map();
    this.respawnCooldowns = new Map();
    this.respawnCooldownIdentityAliases = new Map();
    this.food = new Map();
    this.foodPool = [];
    this.weaponPickups = new Map();
    this.mines = new Map();
    this.bombs = new Map();
    this.foodIdCounter = 0;
    this.weaponPickupIdCounter = 0;
    this.mineIdCounter = 0;
    this.bombIdCounter = 0;
    this.lastFoodSpawnAt = 0;
    this.tickTimer = null;
    this.destroyed = false;
    this.lastStateEmitAt = 0;
    this.pendingStateEmitTimer = null;
    this.pendingStateEmitReason = null;
    this.lastWeaponPickupSpawnAt = 0;
    this.lastTickAt = null;
    this.aiSpatialIndex = null;

    const config = this.getConfig();
    this.fever = {
      active: false,
      nextStartAt: this.now() + config.feverIntervalMs,
      endsAt: null
    };
  }

  init() {
    this.destroyed = false;
    const config = this.getConfig();
    this.spawnFood(Math.min(config.maxFood, 20));
    this.lastFoodSpawnAt = this.now();
    this.spawnWeaponPickup(Math.min(config.maxWeaponPickups, 2));
    this.logger.info('Arena game initialized');
  }

  start() {
    if (this.tickTimer) return;
    this.destroyed = false;
    this.lastTickAt = this.now();
    this._scheduleNextTick();
  }

  _scheduleNextTick() {
    if (this.destroyed) return;

    let config;
    try {
      config = this.getConfig();
    } catch (error) {
      this.tickTimer = null;
      this.logger.warn(`Arena tick scheduler stopped: ${error.message}`);
      return;
    }

    const interval = Math.max(8, Number(config.tickRateMs) || DEFAULT_TICK_RATE_MS);
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      if (this.destroyed) return;

      const now = this.now();
      const elapsed = this.lastTickAt === null ? interval : Math.max(0, now - this.lastTickAt);
      const maxDelta = Math.max(interval * 3, 120);
      this.lastTickAt = now;

      try {
        this.tick(Math.min(elapsed || interval, maxDelta));
      } catch (error) {
        if (this._isDatabaseShutdownError(error)) {
          this.logger.warn(`Arena tick stopped during shutdown: ${error.message}`);
          return;
        }
        this.logger.error(`Arena tick failed: ${error.message}`);
      }

      this._scheduleNextTick();
    }, interval);
    if (typeof this.tickTimer.unref === 'function') {
      this.tickTimer.unref();
    }
  }

  startTickTimer() {
    this.start();
  }

  destroy() {
    this.destroyed = true;
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.pendingStateEmitTimer) {
      clearTimeout(this.pendingStateEmitTimer);
      this.pendingStateEmitTimer = null;
    }
    this.pendingStateEmitReason = null;
    this.lastTickAt = null;
    this.players.clear();
    this.pendingSpawns.clear();
    this.playerIdentityAliases.clear();
    this.pendingSpawnIdentityAliases.clear();
    this.respawnCooldowns.clear();
    this.respawnCooldownIdentityAliases.clear();
    this.food.clear();
    this.foodPool.length = 0;
    this.weaponPickups.clear();
    this.mines.clear();
    this.bombs.clear();
    this.logger.info('Arena game destroyed');
  }

  _isDatabaseShutdownError(error) {
    return /database connection is not open/i.test(String(error && error.message ? error.message : error));
  }

  getConfig() {
    const stored = this.db && typeof this.db.getGameConfig === 'function'
      ? this.db.getGameConfig('arena')
      : null;
    const merged = this._mergeConfig(DEFAULT_CONFIG, stored || {});
    return this._normalizeConfig(merged, stored || {});
  }

  updateConfig(config) {
    const merged = this._mergeConfig(this.getConfig(), config || {});
    if (this.db && typeof this.db.saveGameConfig === 'function') {
      this.db.saveGameConfig('arena', merged);
    }
    this.io.emit('arena:config-updated', merged);
    return merged;
  }

  handleActivity(data, activityType = 'chat') {
    const config = this.getConfig();
    if (!config.enabled) {
      return { success: false, error: 'Arena disabled' };
    }

    const viewer = this._normalizeViewer(data);
    if (!viewer.username) {
      return { success: false, error: 'Missing viewer identity' };
    }

    this._cleanupRespawnCooldowns(config);
    const existingUsername = this._resolvePlayerUsername(viewer);
    const existingPlayer = existingUsername ? this.players.get(existingUsername) : null;
    const pending = existingUsername ? null : this._resolvePendingSpawn(viewer);
    const cooldown = existingUsername || pending ? null : this._resolveRespawnCooldown(viewer, config);
    if (!this._adoptViewerProfilePicture(viewer, existingPlayer, pending, cooldown)) {
      return this._missingProfilePictureResponse();
    }
    if (cooldown) {
      return this._respawnCooldownResponse(cooldown);
    }

    if (activityType === 'join' && !existingUsername) {
      const queued = this._queuePendingSpawn(viewer, config);
      this.emitState('pending-spawn', { force: true });
      return {
        success: true,
        pending: true,
        username: queued.username,
        spawnsAt: queued.spawnsAt,
        lives: Math.round(queued.lives * 100) / 100
      };
    }
    if (pending) {
      this._refreshPendingSpawnIdentity(pending, viewer);
      pending.lastActivityAt = this.now();
      this.emitState('pending-spawn-activity', { force: true });
      return {
        success: true,
        pending: true,
        username: pending.username,
        spawnsAt: pending.spawnsAt,
        lives: Math.round(pending.lives * 100) / 100
      };
    }

    const player = this._getOrCreatePlayer(viewer, config);
    this._applyActivity(player, activityType, config, this._activityMultiplier(data, activityType), data);
    this._syncRadius(player, config);

    const payload = this._serializePlayer(player, config);
    this.io.emit('arena:player-updated', {
      ...payload,
      activityType,
      timestamp: this.now()
    });
    this.emitState('activity', { force: true });

    return { success: true, player: payload };
  }

  handleGift(data) {
    if (data && data.repeatEnd === false) {
      return { success: false, error: 'Gift streak still active' };
    }

    const config = this.getConfig();
    if (!config.enabled) {
      return { success: false, error: 'Arena disabled' };
    }

    const viewer = this._normalizeViewer(data);
    if (!viewer.username) {
      return { success: false, error: 'Missing viewer identity' };
    }

    const giftName = (data && data.giftName ? String(data.giftName) : 'Gift').trim();
    const giftId = data && data.giftId !== undefined && data.giftId !== null ? String(data.giftId).trim() : '';
    const now = this.now();

    this._cleanupRespawnCooldowns(config);
    const existingUsername = this._resolvePlayerUsername(viewer);
    const existingPlayer = existingUsername ? this.players.get(existingUsername) : null;
    const pending = existingUsername ? null : this._resolvePendingSpawn(viewer);
    const cooldown = existingUsername || pending ? null : this._resolveRespawnCooldown(viewer, config);
    if (!this._adoptViewerProfilePicture(viewer, existingPlayer, pending, cooldown)) {
      return this._missingProfilePictureResponse();
    }
    if (pending) {
      const weapon = this._resolveGiftWeapon(data || {}, config);
      this._applyPendingSpawnGift(pending, viewer, weapon, data || {}, giftName, config);
      this.emitState('pending-spawn-gift', { force: true });
      return {
        success: true,
        pending: true,
        username: pending.username,
        spawnsAt: pending.spawnsAt,
        lives: Math.round(pending.lives * 100) / 100,
        weapon: {
          type: weapon.weaponType,
          tier: weapon.tier,
          power: weapon.power,
          sourceGift: giftName,
          durationMs: weapon.durationMs
        }
      };
    }

    if (cooldown) {
      const weapon = this._resolveGiftWeapon(data || {}, config);
      const player = this._spawnGiftRespawn(viewer, weapon, data || {}, giftName, config, now);
      this._clearRespawnCooldown(cooldown);
      this.io.emit('arena:gift-respawned', {
        username: player.username,
        nickname: player.nickname,
        lives: player.lives,
        mass: player.mass,
        weapon: player.weapon,
        timestamp: now
      });
      if (player.weapon) {
        this.io.emit('arena:weapon-activated', {
          username: player.username,
          nickname: player.nickname,
          weapon: player.weapon,
          timestamp: now
        });
      }
      this._applyStreamActivityBoost(player, 'gift', this._giftLifeGain(data || {}, config));
      this.emitState('gift-respawn', { force: true });
      return { success: true, respawned: true, player: this._serializePlayer(player, config), weapon: player.weapon };
    }

    const player = this._getOrCreatePlayer(viewer, config);
    this._applyActivity(player, 'gift', config, this._activityMultiplier(data, 'gift'), data);

    const weapon = this._resolveGiftWeapon(data || {}, config);
    player.weapon = this._createWeapon({
      type: weapon.weaponType,
      tier: weapon.tier,
      power: weapon.power,
      sourceGift: giftName,
      durationMs: weapon.durationMs
    }, now);
    this._resetAiIntentForWeaponChange(player);
    this._applyGiftExtraLives(player, weapon, data, config);
    this._addMassEquivalent(player, weapon.growthBonus, config);
    player.energy = this._clamp(player.energy + weapon.power * 4, 0, config.maxEnergy);
    this._syncRadius(player, config);

    const payload = this._serializePlayer(player, config);
    this.io.emit('arena:weapon-activated', {
      username: player.username,
      nickname: player.nickname,
      weapon: player.weapon,
      timestamp: now
    });
    this.emitState('gift', { force: true });

    return { success: true, player: payload, weapon: player.weapon };
  }

  handleChatStrategy(data, argsOrMessage = []) {
    const config = this.getConfig();
    if (!config.enabled || config.chatStrategyEnabled === false) {
      return { success: false, error: 'Arena chat strategy disabled' };
    }

    const viewer = this._normalizeViewer(data);
    if (!viewer.username) {
      return { success: false, error: 'Missing viewer identity' };
    }

    const args = this._normalizeChatStrategyArgs(argsOrMessage);
    const command = String(args[0] || '').trim().toLowerCase();
    if (!command) {
      return { success: false, error: 'Missing arena command' };
    }

    const existingUsername = this._resolvePlayerUsername(viewer);
    const existingPlayer = existingUsername ? this.players.get(existingUsername) : null;
    if (!this._adoptViewerProfilePicture(viewer, existingPlayer)) {
      return this._missingProfilePictureResponse();
    }
    const player = this._getOrCreatePlayer(viewer, config);
    if (!player) {
      return this._missingProfilePictureResponse();
    }
    this._cleanupPlayerChatStrategy(player);

    if (command !== 'status') {
      const cooldown = this._chatStrategyCooldown(player, config);
      if (cooldown) {
        return cooldown;
      }
    }

    if (command === 'hunt' || command === 'attack') {
      return this.setPlayerStrategy(viewer, 'hunt', { player, config });
    }
    if (command === 'flee') {
      return this.setPlayerStrategy(viewer, 'flee', { player, config });
    }
    if (command === 'farm') {
      return this.setPlayerStrategy(viewer, 'farm', { player, config });
    }
    if (command === 'target') {
      if (config.chatTargetCommandEnabled === false) {
        return { success: false, error: 'Target command disabled' };
      }
      return this.setPlayerTarget(viewer, args.slice(1).join(' '), { player, config });
    }
    if (command === 'role') {
      return this.setPlayerStrategy(viewer, 'role', {
        player,
        config,
        role: String(args[1] || '').trim().toLowerCase()
      });
    }
    if (command === 'status') {
      return {
        success: true,
        status: true,
        username: player.username,
        strategy: player.strategyOverride || null,
        targetUsername: player.targetUsername || null,
        activeRole: player.activeRole || null,
        message: this._formatChatStrategyStatus(player)
      };
    }

    return { success: false, error: 'Unknown arena command' };
  }

  handleAbilityCommand(data, abilityName) {
    const config = this.getConfig();
    if (!config.enabled || config.directAbilitiesEnabled === false) return { success: false, error: 'Arena abilities disabled' };
    const viewer = this._normalizeViewer(data);
    const username = this._resolvePlayerUsername(viewer);
    const player = username ? this.players.get(username) : null;
    if (!player) return { success: false, error: 'Join the Arena first' };
    const ability = String(abilityName || '').trim().toLowerCase();
    const now = this.now();
    if (ability === 'bomb') return this._throwBomb(player, config, now);
    if (!['boost', 'shield'].includes(ability)) return { success: false, error: 'Unknown arena ability' };
    const state = this._abilityState(player, ability, config);
    if (now < state.availableAt) return { success: false, error: `${ability} recharges in ${Math.ceil((state.availableAt - now) / 1000)}s` };
    state.activeUntil = now + (ability === 'boost' ? config.boostDurationMs : config.shieldDurationMs);
    state.availableAt = now + config.abilityChargeMs;
    this.io.emit('arena:ability-activated', { username: player.username, nickname: player.nickname, ability, activeUntil: state.activeUntil, timestamp: now });
    this.emitState(`ability-${ability}`, { force: true });
    return { success: true, ability, activeUntil: state.activeUntil };
  }

  setPlayerStrategy(viewer, strategy, options = {}) {
    const config = options.config || this.getConfig();
    const player = options.player || this._getOrCreatePlayer(this._normalizeViewer(viewer), config);
    const normalized = this._normalizeStrategy(strategy);
    if (!player || !normalized) {
      return { success: false, error: 'Invalid arena strategy' };
    }

    const now = this.now();
    const durationMs = this._strategyDurationMs(config);
    let activeRole = null;
    let activeRoleProfile = null;

    if (normalized === 'role') {
      activeRole = this._normalizeRoleId(options.role, config);
      if (!activeRole) {
        return { success: false, error: 'Invalid arena role' };
      }
      activeRoleProfile = this._roleProfile(activeRole, config);
    }

    player.strategyOverride = normalized;
    player.strategyExpiresAt = now + durationMs;
    player.chatCommandCooldownUntil = now + this._strategyCooldownMs(config);
    player.activeRole = activeRole;
    player.activeRoleProfile = activeRoleProfile;
    player.activeRoleExpiresAt = activeRole ? player.strategyExpiresAt : null;

    this.io.emit('arena:strategy-updated', {
      username: player.username,
      nickname: player.nickname,
      strategy: player.strategyOverride,
      strategyExpiresAt: player.strategyExpiresAt,
      activeRole: player.activeRole,
      timestamp: now
    });
    this.emitState('strategy-updated', { force: true });

    return {
      success: true,
      username: player.username,
      strategy: player.strategyOverride,
      strategyExpiresAt: player.strategyExpiresAt,
      activeRole: player.activeRole
    };
  }

  setPlayerTarget(viewer, targetQuery, options = {}) {
    const config = options.config || this.getConfig();
    const player = options.player || this._getOrCreatePlayer(this._normalizeViewer(viewer), config);
    if (!player) {
      return { success: false, error: 'Missing player' };
    }

    const target = this._findTargetPlayer(targetQuery, player.username);
    if (!target) {
      return { success: false, error: 'Target not found' };
    }

    const now = this.now();
    player.strategyOverride = player.strategyOverride || 'target';
    player.strategyExpiresAt = now + this._strategyDurationMs(config);
    player.targetUsername = target.username;
    player.targetExpiresAt = player.strategyExpiresAt;
    player.chatCommandCooldownUntil = now + this._strategyCooldownMs(config);

    this.io.emit('arena:target-updated', {
      username: player.username,
      nickname: player.nickname,
      targetUsername: target.username,
      targetNickname: target.nickname,
      targetExpiresAt: player.targetExpiresAt,
      timestamp: now
    });
    this.emitState('target-updated', { force: true });

    return {
      success: true,
      username: player.username,
      targetUsername: target.username,
      targetExpiresAt: player.targetExpiresAt
    };
  }

  getArenaCommandHints(config = this.getConfig()) {
    if (config.chatStrategyEnabled === false || config.topOverlayShowCommandHints === false) {
      return [];
    }
    const hints = [
      { kind: 'command', label: 'Chat Command', iconText: 'CMD', text: '!arena hunt - Angriff' },
      { kind: 'command', label: 'Chat Command', iconText: 'CMD', text: '!arena flee - Überleben' },
      { kind: 'command', label: 'Chat Command', iconText: 'CMD', text: '!arena farm - Sammeln' }
    ];
    if (config.chatTargetCommandEnabled !== false) {
      hints.push({ kind: 'command', label: 'Chat Command', iconText: 'CMD', text: '!arena target Name - Ziel markieren' });
    }
    hints.push({ kind: 'command', label: 'Chat Command', iconText: 'CMD', text: '!arena role tactician - KI-Rolle wählen' });
    return hints;
  }

  tick(deltaMs = DEFAULT_TICK_RATE_MS) {
    const config = this.getConfig();
    if (!config.enabled) return this.getState('disabled');

    this._updateFever(config);
    this._updateFood(config);
    this._updateWeaponPickups(config);
    this._updateMines(config);
    this._updateBombs(config, Math.max(deltaMs, 0) / 1000);

    const seconds = Math.max(deltaMs, 0) / 1000;
    this.aiSpatialIndex = this._buildSpatialIndex(config);
    for (const player of Array.from(this.players.values())) {
      this._updatePlayer(player, config, seconds);
    }

    for (const player of Array.from(this.players.values())) {
      this._applyWeaponEffects(player, config, seconds);
    }

    this._resolveFoodCollisions(config);
    this._resolveWeaponPickupCollisions(config);
    this._resolvePlayerCollisions(config);
    this._materializePendingSpawns(config);
    this.aiSpatialIndex = null;
    this.emitState('tick');
    return this.getState('tick');
  }

  spawnFood(count = 1) {
    const config = this.getConfig();
    const amount = Math.max(0, Math.floor(count));
    const now = this.now();
    for (let i = 0; i < amount; i++) {
      if (this.food.size >= this._targetFoodCount(config)) break;
      const id = `food_${++this.foodIdCounter}`;
      this.food.set(id, this._createFoodEntity({
        id,
        x: this.random() * config.arenaWidth,
        y: this.random() * config.arenaHeight,
        radius: config.foodRadius,
        value: config.foodValue,
        source: 'ambient',
        spawnedAt: now,
        expiresAt: this._foodExpiresAt('ambient', now, config)
      }));
    }
    return this.food.size;
  }

  spawnWeaponPickup(count = 1) {
    const config = this.getConfig();
    const amount = Math.max(0, Math.floor(count));
    for (let i = 0; i < amount; i++) {
      if (this.weaponPickups.size >= config.maxWeaponPickups) break;
      const definition = this._pickWeaponDefinition(config.weaponPickupTypes || DEFAULT_CONFIG.weaponPickupTypes);
      const id = `weapon_${++this.weaponPickupIdCounter}`;
      const now = this.now();
      this.weaponPickups.set(id, {
        id,
        type: definition.type,
        tier: 'pickup',
        power: definition.power,
        durationMs: definition.durationMs,
        x: this.random() * config.arenaWidth,
        y: this.random() * config.arenaHeight,
        radius: config.weaponPickupRadius,
        spawnedAt: now,
        expiresAt: now + (definition.pickupDurationMs || config.weaponPickupDurationMs)
      });
    }
    return this.weaponPickups.size;
  }

  chooseBehavior(player, config = this.getConfig()) {
    this._cleanupPlayerChatStrategy(player);
    if (!this.aiSpatialIndex) {
      this.aiSpatialIndex = this._buildSpatialIndex(config);
    }
    const context = this._buildAiContext(player, config);
    const intent = this._selectAiIntent(player, context, config);
    return this._commitAiIntent(player, intent, context, config);
  }

  _legacyChooseBehavior(player, config = this.getConfig()) {
    const movement = config.movement || DEFAULT_CONFIG.movement;
    const threat = this._assessThreats(player, movement, config);

    if (threat) {
      return this._storeBehaviorDecision(player, {
        mode: 'flee',
        target: threat.target,
        vector: threat.vector,
        score: threat.score
      });
    }

    const weaponPickup = this._rankWeaponPickup(player, movement, config);
    const smallerPrey = this._rankHuntTarget(player, movement, config);
    if (weaponPickup && this._shouldPrioritizeWeapon(player, weaponPickup, smallerPrey, config)) {
      return this._storeBehaviorDecision(player, {
        mode: 'hunt-weapon',
        target: weaponPickup.target,
        score: weaponPickup.score
      });
    }

    if (smallerPrey) {
      return this._stabilizeBehavior(player, {
        mode: 'hunt-player',
        target: smallerPrey.target,
        score: smallerPrey.score
      }, movement, config);
    }

    if (weaponPickup) {
      return this._storeBehaviorDecision(player, {
        mode: 'hunt-weapon',
        target: weaponPickup.target,
        score: weaponPickup.score
      });
    }

    const foodTarget = this._nearestFood(player, movement.foodSenseDistance);
    if (foodTarget) {
      return this._storeBehaviorDecision(player, { mode: 'hunt-food', target: foodTarget });
    }

    return this._storeBehaviorDecision(player, { mode: 'wander', target: null });
  }

  _buildAiContext(player, config) {
    const movement = config.movement || DEFAULT_CONFIG.movement;
    const personality = this._personalityTraits(player);
    const sizeProfile = this._sizeBehaviorProfile(player, config);
    const spatialIndex = this.aiSpatialIndex || this._buildSpatialIndex(config);
    const threat = this._assessThreats(player, movement, config);
    const prey = this._rankHuntTarget(player, movement, config);
    const weapon = this._rankWeaponPickup(player, movement, config);
    const pressure = this._rankPressureTarget(player, movement, config);
    const targetPlayer = this._activeTargetPlayer(player);
    const growthRival = pressure || this._rankStrategicGrowthTarget(player, movement, config);
    const food = this._rankFoodTarget(player, movement, config, {
      pressureTarget: growthRival && growthRival.target,
      threatTarget: threat && threat.target
    });
    const boundary = this._boundaryAvoidanceVector(player, config);

    return {
      now: this.now(),
      player,
      config,
      movement,
      personality,
      sizeProfile,
      spatialIndex,
      threat,
      prey,
      pressure,
      targetPlayer,
      weapon,
      food,
      boundary
    };
  }

  _selectAiIntent(player, context, config) {
    const candidates = this._scoreAiIntents(player, context, config)
      .filter(candidate => candidate && Number.isFinite(candidate.score))
      .sort((a, b) => b.score - a.score);
    const best = candidates[0] || this._createWanderIntent(player, context);
    const previous = this._previousAiIntent(player, context, config);

    if (previous && previous.score >= best.score - previous.switchMargin) {
      return previous;
    }

    return best;
  }

  _scoreAiIntents(player, context, config) {
    const personality = context.personality;
    const sizeProfile = context.sizeProfile || this._sizeBehaviorProfile(player, config);
    const threatScore = context.threat ? context.threat.score : 0;
    const survivalNeed = this._survivalNeed(player, config, personality);
    const combatReadiness = this._combatReadiness(player, config, personality, survivalNeed);
    const riskAppetite = this._riskAppetite(player, config, personality, survivalNeed);
    const activeWeaponType = this._activeWeaponType(player, context.now);
    const hasActiveChainsaw = activeWeaponType === 'chainsaw';
    const mustRetreatFromThreat = this._shouldPrioritizeRetreatFromThreat(player, context, config);
    const candidates = [];

    if (context.threat) {
      const fleeIntent = this._createFleeIntent(player, context, threatScore, riskAppetite);
      if (mustRetreatFromThreat && riskAppetite < 0.9) {
        fleeIntent.score += threatScore * 0.55 + 4.2;
        fleeIntent.metadata = this._aiMetadata({
          ...fleeIntent.metadata,
          reason: 'outmatched-threat'
        });
      }
      candidates.push(fleeIntent);
      if (context.weapon && (!player.weapon || personality.weaponFocus >= 0.8)) {
        const escapeRoute = this._weaponEscapeRoute(player, context);
        if (escapeRoute.viable) {
          const evadeIntent = this._createEvadeWeaponIntent(player, context, threatScore, escapeRoute);
          if (!player.weapon) {
            evadeIntent.score += survivalNeed * 2.6 + personality.weaponFocus * 0.75;
          }
          if (escapeRoute.alignment > 0.35 && personality.fear >= 1.2) {
            evadeIntent.score += threatScore * 0.42 + personality.weaponFocus * 2.2;
          }
          candidates.push(evadeIntent);
        }
      }
    }

    if (context.prey) {
      const weaponContext = this._weaponAttackContext(player, context.prey.target, config);
      const chainsawCommitmentBonus = hasActiveChainsaw && weaponContext.canAttack
        ? 7.4 + this._clamp(
          1 - this._distance(player, context.prey.target) / Math.max(weaponContext.range * 1.35, 1),
          0,
          1
        ) * 3.2
        : 0;
      const threatDiscount = this._clamp(1 - riskAppetite * (player.weapon ? 0.38 : 0.3), 0.46, 1);
      const threatPenalty = context.threat
        ? threatScore * personality.fear * (player.weapon ? 0.18 : 0.48) * threatDiscount
        : 0;
      const staminaPenalty = survivalNeed * (context.prey.score > 18 ? 2.4 : 5.4);
      const laneAlignment = context.threat
        ? Math.max(0, context.prey.vector
          ? context.prey.vector.x * context.threat.vector.x + context.prey.vector.y * context.threat.vector.y
          : this._vectorToTarget(player, context.prey.target).x * context.threat.vector.x +
            this._vectorToTarget(player, context.prey.target).y * context.threat.vector.y)
        : 0;
      const massAdvantage = Math.max(1, player.mass / Math.max(context.prey.target.mass, 1));
      const predatorBonus = this._clamp((massAdvantage - 1.25) * 2.1, 0, 5.8) *
        sizeProfile.attackIntentScale;
      const riskBonus = riskAppetite * (4.2 + laneAlignment * 5.8);
      candidates.push(this._createAttackIntent(
        player,
        context,
        (context.prey.score - threatPenalty - staminaPenalty + combatReadiness * 1.2 + riskBonus +
          chainsawCommitmentBonus + predatorBonus) * sizeProfile.attackIntentScale
      ));
    }

    if ((player.strategyOverride === 'hunt' || player.strategyOverride === 'attack') && !context.prey) {
      const chatHuntTarget = this._rankChatHuntTarget(player, context.movement, config);
      if (chatHuntTarget) {
        const intercept = this._predictInterceptPosition(player, chatHuntTarget.target, context.movement, config, personality);
        candidates.push({
          mode: 'hunt-player',
          intent: 'attack',
          target: chatHuntTarget.target,
          vector: this._vectorToTarget(player, intercept),
          score: chatHuntTarget.score + 18,
          metadata: this._aiMetadata({
            reason: 'chat-hunt',
            target: this._serializeAiEntity(chatHuntTarget.target)
          })
        });
      }
    }

    if (context.targetPlayer) {
      const targetIntent = this._createTargetIntent(player, context, config);
      if (targetIntent) {
        candidates.push(targetIntent);
      }
    }

    if (
      context.pressure &&
      !context.prey &&
      !context.weapon &&
      combatReadiness + riskAppetite * 0.24 >= 0.45 &&
      (
        !this._hasImmediateFoodObjective(player, context) ||
        (sizeProfile.pressureIntentScale > 1.28 && survivalNeed < 0.55)
      )
    ) {
      const threatPenalty = context.threat
        ? threatScore * personality.fear * 0.35 * this._clamp(1 - riskAppetite * 0.26, 0.52, 1)
        : 0;
      const foodCost = this._pressureFoodOpportunityCost(player, context) * sizeProfile.pressureFoodCostScale;
      candidates.push(this._createPressureIntent(
        player,
        context,
        (context.pressure.score - threatPenalty - foodCost - survivalNeed * 2.2 +
          combatReadiness * 1.4 + riskAppetite * 1.55) * sizeProfile.pressureIntentScale
      ));
    }

    if (context.weapon && !mustRetreatFromThreat && (!hasActiveChainsaw || this._weaponExpiresSoon(player.weapon, context.now, 1600))) {
      let weaponUrgency = 1.25;
      if (player.weapon) {
        weaponUrgency = hasActiveChainsaw ? 0.24 : 0.75;
      }
      const unarmedThreatBonus = context.threat && !player.weapon
        ? threatScore * 0.35 + survivalNeed * 2.4
        : 0;
      candidates.push({
        mode: 'hunt-weapon',
        intent: 'arm',
        target: context.weapon.target,
        vector: this._vectorToTarget(player, context.weapon.target),
        score: (
          context.weapon.score * weaponUrgency +
          personality.weaponFocus * 1.1 +
          survivalNeed * 1.25 +
          unarmedThreatBonus
        ) * sizeProfile.weaponIntentScale,
        metadata: this._aiMetadata({
          reason: player.weapon ? 'upgrade-weapon' : 'get-weapon'
        })
      });
    }

    if (context.food && !mustRetreatFromThreat && !(hasActiveChainsaw && context.prey)) {
      const foodSteeringTarget = context.food.steeringTarget || context.food.target;
      candidates.push({
        mode: 'hunt-food',
        intent: 'feed',
        target: context.food.target,
        vector: this._vectorToTarget(player, foodSteeringTarget),
        score: context.food.score * sizeProfile.foodIntentScale +
          survivalNeed * 5.2 * sizeProfile.survivalIntentScale,
        metadata: this._aiMetadata({
          reason: survivalNeed > 0.55 ? 'recovery-food' : context.food.reason || 'safe-food',
          strategicTarget: this._serializeAiEntity(context.food.strategyTarget),
          cluster: context.food.cluster ? {
            count: context.food.cluster.count,
            value: Math.round(context.food.cluster.value * 100) / 100,
            x: Math.round(context.food.cluster.center.x * 100) / 100,
            y: Math.round(context.food.cluster.center.y * 100) / 100
          } : null,
          foodSearch: context.food.search || 'local-food'
        })
      });
    }

    candidates.push(this._createWanderIntent(player, context));
    return this._applyChatStrategyBias(candidates, player, context, config);
  }

  _createTargetIntent(player, context, config) {
    const target = context.targetPlayer;
    if (!target || target.username === player.username) return null;
    const distance = this._distance(player, target);
    const maxDistance = Math.max(
      Number(context.movement?.huntDistance) || DEFAULT_CONFIG.movement.huntDistance,
      Number(context.movement?.weaponSenseDistance) || DEFAULT_CONFIG.movement.weaponSenseDistance
    ) * 1.35;
    if (distance > maxDistance) return null;

    const threat = context.threat && context.threat.target && context.threat.target.username !== target.username
      ? context.threat
      : null;
    const attackContext = this._playerAbsorbContext(player, target, config);
    const weaponContext = this._weaponAttackContext(player, target, config);
    const canChallenge = attackContext.canAbsorb || weaponContext.canAttack ||
      (Number(player.mass) || 0) >= (Number(target.mass) || 0) * 0.88;
    if (!canChallenge) return null;

    const personality = context.personality;
    const intercept = this._predictInterceptPosition(player, target, context.movement, config, personality);
    const threatPenalty = threat ? Math.max(0, threat.score || 0) * personality.fear * 0.34 : 0;
    const closeness = this._clamp(1 - distance / Math.max(maxDistance, 1), 0, 1);
    return {
      mode: 'hunt-player',
      intent: 'target',
      target,
      vector: this._combineSteeringVectors([
        { vector: this._vectorToTarget(player, intercept), weight: 2.8 * personality.aggression },
        { vector: threat ? threat.vector : { x: 0, y: 0 }, weight: threat ? 0.45 * personality.fear : 0 },
        { vector: context.boundary, weight: 0.35 }
      ]),
      score: 18 + closeness * 8 + personality.aggression * 3 + personality.intelligence * 1.4 - threatPenalty,
      metadata: this._aiMetadata({
        reason: 'chat-target',
        target: this._serializeAiEntity(target)
      })
    };
  }

  _applyChatStrategyBias(candidates, player, context, config) {
    this._cleanupPlayerChatStrategy(player);
    const strategy = player && player.strategyOverride;
    if (!strategy && !player?.targetUsername) return candidates;

    return candidates.map(candidate => {
      if (!candidate) return candidate;
      let score = candidate.score;
      if (strategy === 'hunt' || strategy === 'attack') {
        if (candidate.mode === 'hunt-player') score += 14;
        if (candidate.mode === 'pressure-player') score += 7;
        if (candidate.mode === 'hunt-food') score -= 7;
        if (candidate.mode === 'flee') score -= 4;
      } else if (strategy === 'flee') {
        if (candidate.mode === 'flee') score += 12;
        if (candidate.mode === 'evade-weapon') score += 18;
        if (candidate.mode === 'hunt-weapon') score += 6;
        if (candidate.mode === 'hunt-player' || candidate.mode === 'pressure-player') score -= 8;
      } else if (strategy === 'farm') {
        if (candidate.mode === 'hunt-food') score += 24;
        if (candidate.mode === 'hunt-weapon') score += 8;
        if (candidate.mode === 'evade-weapon') score += 5;
        if (candidate.mode === 'hunt-player' || candidate.mode === 'pressure-player') score -= 14;
      } else if (strategy === 'role') {
        if (candidate.mode === 'hunt-player' && player.activeRole === 'berserker') score += 8;
        if ((candidate.mode === 'flee' || candidate.mode === 'evade-weapon') && player.activeRole === 'survivor') score += 8;
        if ((candidate.mode === 'hunt-food' || candidate.mode === 'hunt-weapon') && player.activeRole === 'forager') score += 8;
      }
      if (player.targetUsername && candidate.target?.username === player.targetUsername) {
        score += 16;
      }
      return score === candidate.score
        ? candidate
        : {
            ...candidate,
            score,
            metadata: this._aiMetadata({
              ...candidate.metadata,
              chatStrategy: strategy || null,
              chatTarget: player.targetUsername || null
            })
          };
    });
  }

  _shouldPrioritizeRetreatFromThreat(player, context, config = DEFAULT_CONFIG) {
    if (!context || !context.threat || !context.threat.target) return false;
    const threat = context.threat.target;
    const playerWeaponContext = this._weaponAttackContext(player, threat, config);
    if (playerWeaponContext.canAttack) return false;

    const movement = context.movement || config.movement || DEFAULT_CONFIG.movement;
    const distance = this._distance(player, threat);
    const absorbThreat = this._playerAbsorbContext(threat, player, config);
    const weaponThreat = this._weaponAttackContext(threat, player, config);
    // If player can absorb the threat (e.g. with chainsaw/dash), no retreat needed
    // unless the threat currently can damage the player with a weapon.
    const playerAbsorb = this._playerAbsorbContext(player, threat, config);
    if (playerAbsorb.canAbsorb && !weaponThreat.canAttack) return false;
    const weaponThreatRange = weaponThreat.range > 0
      ? weaponThreat.range + (Number(threat.radius) || 0) + (Number(player.radius) || 0) * 0.4
      : 0;
    if (weaponThreat.canAttack && distance <= weaponThreatRange) return true;
    if (!absorbThreat.canAbsorb) return false;

    const massRatio = Math.max(1, Number(threat.mass) || 1) / Math.max(1, Number(player.mass) || 1);
    if (massRatio < 1.08) return false;
    const dynamicFleeDistance = this._dynamicFleeDistance(player, threat, movement, config);
    const closeLimit = dynamicFleeDistance * 0.72 +
      (Number(threat.radius) || 0) +
      (Number(player.radius) || 0) * 0.45;
    return distance <= closeLimit;
  }

  _survivalNeed(player, config, personality = this._personalityTraits(player)) {
    const maxEnergy = Math.max(1, Number(config.maxEnergy) || DEFAULT_CONFIG.maxEnergy);
    const energyRatio = this._clamp((Number(player.energy) || 0) / maxEnergy, 0, 1);
    const energyNeed = this._clamp((0.42 - energyRatio) / 0.42, 0, 1);
    const baseMass = Number(config.baseMass) || DEFAULT_CONFIG.baseMass;
    const minMass = Number(config.minMass) || DEFAULT_CONFIG.minMass;
    const mass = Number(player.mass) || baseMass;
    const smallNeed = this._clamp((baseMass - mass) / Math.max(1, baseMass - minMass), 0, 1);
    const lives = this._ensureLives(player, config);
    const lowLifeNeed = this._clamp(
      ((Number(config.baseLives) || DEFAULT_CONFIG.baseLives) * 0.55 - lives) /
        Math.max(1, (Number(config.baseLives) || DEFAULT_CONFIG.baseLives) * 0.55),
      0,
      1
    );
    return this._clamp(
      energyNeed * 1.05 +
        smallNeed * personality.fear * 0.32 +
        lowLifeNeed * personality.fear * 0.28,
      0,
      1.4
    );
  }

  _combatReadiness(player, config, personality = this._personalityTraits(player), survivalNeed = 0) {
    const maxEnergy = Math.max(1, Number(config.maxEnergy) || DEFAULT_CONFIG.maxEnergy);
    const energyRatio = this._clamp((Number(player.energy) || 0) / maxEnergy, 0, 1);
    const baseMass = Math.max(1, Number(config.baseMass) || DEFAULT_CONFIG.baseMass);
    const massRatio = this._clamp((Number(player.mass) || baseMass) / baseMass, 0.35, 3.5);
    const massConfidence = this._clamp((massRatio - 0.75) / 1.7, 0, 1);
    const weaponConfidence = player.weapon && (!player.weapon.expiresAt || player.weapon.expiresAt > this.now()) ? 0.28 : 0;
    return this._clamp(
      energyRatio * 0.42 +
        massConfidence * 0.34 +
        personality.aggression * 0.2 +
        personality.intelligence * 0.08 +
        weaponConfidence -
        survivalNeed * 0.42,
      0,
      1.4
    );
  }

  _riskAppetite(player, config, personality = this._personalityTraits(player), survivalNeed = null) {
    const maxEnergy = Math.max(1, Number(config.maxEnergy) || DEFAULT_CONFIG.maxEnergy);
    const energyRatio = this._clamp((Number(player.energy) || 0) / maxEnergy, 0, 1);
    const baseMass = Math.max(1, Number(config.baseMass) || DEFAULT_CONFIG.baseMass);
    const massRatio = this._clamp((Number(player.mass) || baseMass) / baseMass, 0.35, 4);
    const massConfidence = this._clamp((massRatio - 0.75) / 1.85, 0, 1);
    const weaponConfidence = player.weapon && (!player.weapon.expiresAt || player.weapon.expiresAt > this.now())
      ? this._clamp(this._weaponUtility(player.weapon.type, player.weapon.power) * 0.07, 0.12, 0.36)
      : 0;
    const survival = Number.isFinite(survivalNeed)
      ? survivalNeed
      : this._survivalNeed(player, config, personality);

    return this._clamp(
      (personality.riskTolerance - 0.7) * 0.72 +
        (personality.aggression - 0.95) * 0.34 +
        (personality.randomness - 0.45) * 0.16 +
        energyRatio * 0.22 +
        massConfidence * 0.18 +
        weaponConfidence -
        Math.max(0, personality.fear - 0.85) * 0.18 -
        survival * 0.76,
      0,
      1.35
    );
  }

  _createFleeIntent(player, context, threatScore, riskAppetite = 0) {
    const personality = context.personality;
    const sizeProfile = context.sizeProfile || this._sizeBehaviorProfile(player, context.config);
    const riskScale = this._clamp(1 - riskAppetite * 0.24, 0.68, 1);
    return {
      mode: 'flee',
      intent: 'flee',
      target: context.threat.target,
      vector: this._combineSteeringVectors([
        { vector: context.threat.vector, weight: 2.8 * personality.fear },
        { vector: context.boundary, weight: 0.8 }
      ]),
      score: threatScore * 1.22 * personality.fear * riskScale * sizeProfile.fleeIntentScale +
        (1.6 - personality.aggression) -
        riskAppetite * 0.85,
      metadata: this._aiMetadata({
        reason: 'survive-threat',
        threat: this._serializeAiEntity(context.threat.target),
        escapeScore: Math.round((context.threat.escapeScore || 0) * 100) / 100
      })
    };
  }

  _createEvadeWeaponIntent(player, context, threatScore, escapeRoute = this._weaponEscapeRoute(player, context)) {
    const personality = context.personality;
    const toWeapon = this._vectorToTarget(player, context.weapon.target);
    const routeAlignment = Number(escapeRoute.alignment) || 0;
    const weaponRouteWeight = routeAlignment > 0.35
      ? 1.7
      : routeAlignment > 0
        ? 1.05
        : escapeRoute.close
          ? 0.55
          : 0.22;
    return {
      mode: 'evade-weapon',
      intent: 'evade-arm',
      target: context.weapon.target,
      vector: this._combineSteeringVectors([
        { vector: context.threat.vector, weight: 2.45 * personality.fear },
        { vector: toWeapon, weight: weaponRouteWeight * personality.weaponFocus },
        { vector: context.boundary, weight: 0.7 }
      ]),
      score: threatScore * 0.98 * personality.fear +
        context.weapon.score * 1.25 * personality.weaponFocus +
        personality.intelligence * 1.2 +
        Math.max(0, routeAlignment) * 2.2 -
        Math.max(0, -routeAlignment) * 4.4 +
        (escapeRoute.close ? 0.9 : 0),
      metadata: this._aiMetadata({
        reason: 'escape-to-weapon',
        threat: this._serializeAiEntity(context.threat.target),
        routeAlignment: Math.round(routeAlignment * 100) / 100
      })
    };
  }

  _weaponEscapeRoute(player, context) {
    if (!context || !context.weapon || !context.weapon.target || !context.threat || !context.threat.vector) {
      return { viable: false, alignment: -1, close: false };
    }

    const toWeapon = this._vectorToTarget(player, context.weapon.target);
    const escape = this._normalizeVector(context.threat.vector, { x: 0, y: 0 });
    const alignment = toWeapon.x * escape.x + toWeapon.y * escape.y;
    const distance = this._distance(player, context.weapon.target);
    const closeDistance = player.radius + (context.weapon.target.radius || 0) + 95;
    const close = distance <= closeDistance;

    return {
      alignment,
      close,
      viable: alignment >= -0.18 || close
    };
  }

  _createAttackIntent(player, context, score) {
    const personality = context.personality;
    const sizeProfile = context.sizeProfile || this._sizeBehaviorProfile(player, context.config);
    const intercept = this._predictInterceptPosition(player, context.prey.target, context.movement, context.config, personality);
    return {
      mode: 'hunt-player',
      intent: 'attack',
      target: context.prey.target,
      vector: this._combineSteeringVectors([
        { vector: this._vectorToTarget(player, intercept), weight: 2.4 * personality.aggression },
        { vector: context.threat && context.threat.target.username !== context.prey.target.username ? context.threat.vector : { x: 0, y: 0 }, weight: 0.55 * personality.fear },
        { vector: context.boundary, weight: 0.35 }
      ]),
      score: score + (personality.aggression * 1.6 + personality.intelligence * 0.8) * sizeProfile.attackIntentScale,
      metadata: this._aiMetadata({
        reason: 'intercept-prey',
        interceptX: Math.round(intercept.x * 100) / 100,
        interceptY: Math.round(intercept.y * 100) / 100,
        interceptLeadSeconds: Math.round((intercept._leadSeconds || 0) * 100) / 100
      })
    };
  }

  _createPressureIntent(player, context, score) {
    const personality = context.personality;
    const sizeProfile = context.sizeProfile || this._sizeBehaviorProfile(player, context.config);
    const rival = context.pressure.target;
    const pressurePoint = this._predictInterceptPosition(player, rival, context.movement, context.config, personality);
    const growthTarget = context.food ? context.food.steeringTarget || context.food.target : null;
    const growthVector = growthTarget ? this._vectorToTarget(player, growthTarget) : { x: 0, y: 0 };
    return {
      mode: 'pressure-player',
      intent: 'pressure',
      target: rival,
      vector: this._combineSteeringVectors([
        { vector: this._vectorToTarget(player, pressurePoint), weight: 1.55 * personality.aggression },
        { vector: growthVector, weight: context.food ? 0.65 * personality.foodFocus : 0 },
        { vector: context.boundary, weight: 0.35 }
      ]),
      score: score + (personality.aggression * 1.05 + personality.intelligence * 0.55) * sizeProfile.pressureIntentScale,
      metadata: this._aiMetadata({
        reason: 'pressure-rival',
        rival: this._serializeAiEntity(rival),
        pressureGap: Math.round((context.pressure.gap || 0) * 100) / 100
      })
    };
  }

  _createWanderIntent(player, context) {
    return {
      mode: 'wander',
      intent: 'wander',
      target: null,
      vector: this._combineSteeringVectors([
        { vector: this._wanderVector(player, context.movement), weight: Math.max(0.2, context.personality.randomness) },
        { vector: context.boundary, weight: 0.8 }
      ]),
      score: 0.15 * context.personality.randomness,
      metadata: this._aiMetadata({
        reason: 'no-useful-target'
      })
    };
  }

  _hasImmediateFoodObjective(player, context) {
    if (!context.food || !context.food.target) return false;
    if (context.food.reason === 'strategic-growth') return true;

    const distance = this._distance(player, context.food.target);
    const immediateDistance = player.radius + Math.max(
      110,
      (Number(context.config.foodRadius) || DEFAULT_CONFIG.foodRadius) * 12
    );
    return distance <= immediateDistance && context.food.score >= (context.pressure ? context.pressure.score * 0.58 : 0);
  }

  _pressureFoodOpportunityCost(player, context) {
    if (!context.food || !context.food.target || !context.pressure || !context.pressure.target) return 0;
    if (context.food.reason === 'strategic-growth') return context.food.score + 4;

    const toFood = this._vectorToTarget(player, context.food.steeringTarget || context.food.target);
    const toRival = this._vectorToTarget(player, context.pressure.target);
    const alignment = Math.max(0, toFood.x * toRival.x + toFood.y * toRival.y);
    const distance = this._distance(player, context.food.target);
    const immediateDistance = player.radius + Math.max(
      120,
      (Number(context.config.foodRadius) || DEFAULT_CONFIG.foodRadius) * 14
    );
    const immediateBias = distance <= immediateDistance ? context.food.score * 0.5 + 1.2 : 0;
    return immediateBias + context.food.score * alignment * 0.18;
  }

  _previousAiIntent(player, context, config) {
    const previous = player.aiIntent;
    if (!previous || context.now > previous.lockedUntil) return null;
    const movement = context.movement;
    const currentWeaponType = player.weapon && player.weapon.type ? player.weapon.type : null;
    if (previous.weaponType !== currentWeaponType) return null;
    const target = this._resolveAiTarget(previous);
    if (previous.targetKey && !target) return null;
    if (previous.intent === 'feed' && context.threat && context.threat.target) {
      const threat = context.threat.target;
      const weaponContext = this._weaponAttackContext(player, threat, config);
      const absorbThreat = this._playerAbsorbContext(threat, player, config);
      const threatDistance = this._distance(player, threat);
      const dynamicFleeDistance = this._dynamicFleeDistance(player, threat, movement, config);
      const threatLimit = dynamicFleeDistance + (Number(threat.radius) || 0) + (Number(player.radius) || 0) * 0.5;
      if (!weaponContext.canAttack && absorbThreat.canAbsorb && threatDistance <= threatLimit) {
        return null;
      }
    }
    if (
      previous.intent === 'feed' &&
      target &&
      target.id &&
      context.food &&
      context.food.target &&
      context.food.target.id !== target.id
    ) {
      const lockedDistance = this._distance(player, target);
      const currentDistance = this._distance(player, context.food.target);
      const immediateFoodDistance = player.radius + Math.max(
        130,
        (Number(config.foodRadius) || DEFAULT_CONFIG.foodRadius) * 18
      );
      if (
        currentDistance <= immediateFoodDistance &&
        lockedDistance > currentDistance * 1.7 + 55
      ) {
        return null;
      }
    }
    if (
      currentWeaponType === 'chainsaw' &&
      context.prey &&
      context.prey.target &&
      !['attack', 'pressure', 'flee', 'evade-arm'].includes(previous.intent)
    ) {
      return null;
    }

    if (target && previous.intent === 'attack' && target.username) {
      const distance = this._distance(player, target);
      if (!this._canAttackPlayerTarget(player, target, distance, movement, config)) {
        return null;
      }
    }
    if (target && previous.intent === 'pressure' && target.username) {
      const distance = this._distance(player, target);
      if (!this._canPressurePlayerTarget(player, target, distance, movement, config)) {
        return null;
      }
    }
    if (previous.intent === 'flee' || previous.intent === 'evade-arm') {
      if (!context.threat) return null;
      if (target && target.username) {
        const previousThreat = Array.isArray(context.threat.threats)
          ? context.threat.threats.find(threat => threat.target && threat.target.username === target.username)
          : null;
        if (!previousThreat) return null;
      }
    }

    const memoryMs = Number(movement.behaviorMemoryMs) || DEFAULT_CONFIG.movement.behaviorMemoryMs;
    const remainingRatio = this._clamp((previous.lockedUntil - context.now) / Math.max(memoryMs, 1), 0, 1);
    return {
      mode: previous.mode,
      intent: previous.intent,
      target,
      vector: target ? this._vectorForPreviousIntent(player, target, previous, context) : previous.vector,
      score: previous.score + remainingRatio * context.personality.commitment,
      metadata: {
        ...previous.metadata,
        reason: 'locked-intent',
        planner: 'utility-ai-v4',
        navigation: 'influence-field',
        search: 'spatial-grid'
      },
      switchMargin: (Number(movement.targetSwitchScoreMargin) || DEFAULT_CONFIG.movement.targetSwitchScoreMargin) *
        context.personality.commitment
    };
  }

  _commitAiIntent(player, intent, context, config) {
    const now = context.now;
    const movement = context.movement;
    const memoryMs = Number(movement.behaviorMemoryMs) || DEFAULT_CONFIG.movement.behaviorMemoryMs;
    const lockScale = this._clamp(context.personality.commitment, 0.55, 1.55);
    const targetKey = this._targetKey(intent.target);
    const sizeProfile = context.sizeProfile || this._sizeBehaviorProfile(player, config);
    const steeringPlan = this._buildSteeringPlan(player, intent, context);
    const steeringVector = this._smoothCommittedSteeringVector(player, steeringPlan.vector, intent, context, targetKey);
    const rawAiState = this._classifyAiState(player, intent, context, config);
    const aiStateMemory = this._resolveAiState(player, rawAiState, intent, context, config);
    const aiState = aiStateMemory.state;
    const decision = this._storeBehaviorDecision(player, {
      mode: intent.mode,
      intent: intent.intent,
      target: intent.target,
      vector: steeringVector,
      score: intent.score,
      state: aiState,
      metadata: {
        ...this._aiMetadata(),
        ...(intent.metadata || {}),
        aiState,
        aiStateRaw: aiStateMemory.rawState,
        aiStatePrevious: aiStateMemory.previousState,
        aiStateEnteredAt: aiStateMemory.enteredAt,
        aiStateUpdatedAt: aiStateMemory.updatedAt,
        sizeClass: sizeProfile.sizeClass,
        sizeRole: sizeProfile.role,
        steering: steeringPlan.weights
      }
    });

    player.aiIntent = {
      mode: decision.mode,
      intent: decision.intent,
      targetKey,
      vector: steeringVector,
      score: Number(decision.score) || 0,
      metadata: decision.metadata || {},
      state: aiState,
      rawState: aiStateMemory.rawState,
      previousState: aiStateMemory.previousState,
      stateEnteredAt: aiStateMemory.enteredAt,
      stateUpdatedAt: aiStateMemory.updatedAt,
      weaponType: player.weapon && player.weapon.type ? player.weapon.type : null,
      lockedUntil: now + memoryMs * lockScale,
      updatedAt: now
    };

    return decision;
  }

  _classifyAiState(player, intent = {}, context = null, config = this.getConfig()) {
    const mode = String(intent && intent.mode ? intent.mode : '').toLowerCase();
    const action = String(intent && intent.intent ? intent.intent : mode).toLowerCase();
    const metadata = intent && intent.metadata ? intent.metadata : {};
    const personality = context && context.personality ? context.personality : this._personalityTraits(player);
    const survivalNeed = this._survivalNeed(player, config, personality);
    const sizeProfile = context && context.sizeProfile ? context.sizeProfile : this._sizeBehaviorProfile(player, config);
    const hasThreat = Boolean(context && context.threat);

    if (mode === 'flee' || action === 'flee') return 'retreating';
    if (metadata.reason === 'recovery-food' || survivalNeed >= 0.82) return 'recovering';
    if (mode === 'evade-weapon' || action === 'evade-arm' || mode === 'hunt-weapon' || action === 'arm') {
      return hasThreat && mode === 'evade-weapon' && survivalNeed >= 0.86 ? 'retreating' : 'arming';
    }
    if (mode === 'hunt-player' || action === 'attack' || action === 'target') return 'dueling';
    if (mode === 'pressure-player' || action === 'pressure') return 'dominating';
    if (mode === 'hunt-food' || action === 'feed') return 'farming';
    if ((sizeProfile.sizeClass === 'large' || sizeProfile.sizeClass === 'giant') && !hasThreat && survivalNeed < 0.55) {
      return 'dominating';
    }
    return 'scouting';
  }

  _resolveAiState(player, rawState, intent = {}, context = null, config = this.getConfig()) {
    const now = context && Number.isFinite(context.now) ? context.now : this.now();
    const nextState = this._normalizeAiState(rawState);
    const previous = player && player.aiStateMemory ? player.aiStateMemory : null;
    const previousState = previous && previous.state ? this._normalizeAiState(previous.state) : null;
    const enteredAt = previous && Number.isFinite(previous.enteredAt) ? previous.enteredAt : now;
    const elapsedMs = Math.max(0, now - enteredAt);
    const minDurationMs = Number(config.aiStateMinDurationMs) || AI_STATE_MIN_DURATION_MS;
    const urgentInterrupt = this._aiStatePriority(nextState) >= 75 &&
      this._aiStatePriority(nextState) > this._aiStatePriority(previousState);
    const canInterrupt = !previousState ||
      previousState === nextState ||
      elapsedMs >= minDurationMs ||
      urgentInterrupt;
    const state = canInterrupt ? nextState : previousState;
    const changed = !previousState || state !== previousState;
    const memory = {
      state,
      rawState: nextState,
      previousState: changed ? previousState : previous && previous.previousState ? previous.previousState : null,
      enteredAt: changed ? now : enteredAt,
      updatedAt: now,
      mode: intent && intent.mode ? intent.mode : null,
      intent: intent && intent.intent ? intent.intent : null
    };

    if (player) {
      player.aiStateMemory = memory;
    }
    return memory;
  }

  _normalizeAiState(state) {
    const normalized = String(state || '').toLowerCase();
    if ([
      'scouting',
      'farming',
      'arming',
      'dueling',
      'retreating',
      'recovering',
      'dominating'
    ].includes(normalized)) {
      return normalized;
    }
    return 'scouting';
  }

  _aiStatePriority(state) {
    const priority = {
      scouting: 10,
      farming: 20,
      dominating: 30,
      dueling: 45,
      arming: 55,
      recovering: 75,
      retreating: 100
    };
    return priority[this._normalizeAiState(state)] || 0;
  }

  _aiStateLabel(state) {
    const labels = {
      scouting: 'SCOUT',
      farming: 'FARM',
      arming: 'ARM',
      dueling: 'DUEL',
      retreating: 'RETREAT',
      recovering: 'RECOVER',
      dominating: 'DOMINATE'
    };
    return labels[String(state || '').toLowerCase()] || 'SCOUT';
  }

  _smoothCommittedSteeringVector(player, vector, intent, context, targetKey) {
    const desired = this._normalizeVector(vector, { x: 0, y: 0 });
    if (this._vectorLength(desired) < 0.001) return desired;

    const previous = player.aiIntent;
    if (
      !previous ||
      !previous.vector
    ) {
      return desired;
    }

    const current = this._normalizeVector(previous.vector, desired);
    if (this._vectorLength(current) < 0.001) return desired;
    if (previous.mode !== intent.mode || previous.targetKey !== targetKey) {
      const maxTurn = this._modeSwitchSteeringTurnLimit(player, intent, context, previous);
      return this._rotateVectorTowards(current, desired, maxTurn);
    }

    const staleFleeLane = this._isStaleFleeLane(player, previous, intent, context);
    const boundaryTrapLane = this._isBoundaryTrapFleeLane(player, previous, intent, context);
    if (staleFleeLane || boundaryTrapLane) {
      const boundaryStrength = this._vectorLength(context.boundary || { x: 0, y: 0 });
      const target = (context && context.threat && context.threat.target) || intent.target;
      const panicDistance = target
        ? player.radius + (target.radius || 0) + 90
        : 0;
      const isPanicClose = target ? this._distance(player, target) <= panicDistance : false;
      const maxTurn = this._fleeRecoveryTurnLimitDegrees({
        boundaryStrength,
        boundaryTrap: boundaryTrapLane,
        staleLane: staleFleeLane,
        isPanicClose
      }) * Math.PI / 180;

      return this._rotateVectorTowards(current, desired, maxTurn);
    }

    const maxTurn = this._committedSteeringTurnLimit(player, intent, context);
    return this._rotateVectorTowards(current, desired, maxTurn);
  }

  _modeSwitchSteeringTurnLimit(player, intent, context, previous) {
    const base = this._committedSteeringTurnLimit(player, intent, context);
    const action = intent && intent.intent ? intent.intent : intent && intent.mode;
    let degrees = Math.max(10, base * 180 / Math.PI);

    if (action === 'flee' || action === 'evade-arm') {
      degrees = 18;
      const target = context && context.threat && context.threat.target
        ? context.threat.target
        : intent && intent.target;
      if (target) {
        const panicDistance = player.radius + (target.radius || 0) + 85;
        if (this._distance(player, target) <= panicDistance) {
          degrees = 34;
        }
      }
    } else if (action === 'attack' || action === 'pressure') {
      degrees = 14;
      if (previous && previous.mode === 'flee') {
        degrees = 18;
      }
    } else if (action === 'feed' || action === 'arm') {
      degrees = 12;
    }

    if (this._vectorLength(context && context.boundary ? context.boundary : { x: 0, y: 0 }) > 0.35) {
      degrees += 4;
    }

    return degrees * Math.PI / 180;
  }

  _isStaleFleeLane(player, previous, intent, context) {
    if (!player || !previous || !intent || intent.intent !== 'flee') return false;
    const target = (context && context.threat && context.threat.target) || intent.target;
    if (!target) return false;

    const current = this._normalizeVector(previous.vector || { x: player.vx, y: player.vy }, { x: 0, y: 0 });
    const directAway = this._normalizeVector({
      x: player.x - target.x,
      y: player.y - target.y
    }, current);
    if (this._vectorLength(current) < 0.05 || this._vectorLength(directAway) < 0.05) return false;

    return current.x * directAway.x + current.y * directAway.y < -0.05;
  }

  _isBoundaryTrapFleeLane(player, previous, intent, context) {
    if (!player || !previous || !intent || intent.intent !== 'flee') return false;
    const boundary = context && context.boundary ? context.boundary : { x: 0, y: 0 };
    if (this._vectorLength(boundary) <= 0.35) return false;

    const current = this._normalizeVector(previous.vector || { x: player.vx, y: player.vy }, { x: 0, y: 0 });
    if (this._vectorLength(current) < 0.05) return false;

    return this._isVectorAgainstBoundary(current, boundary);
  }

  _isBoundaryTrapSteeringIntent(player, intent, context) {
    if (!player || !intent || intent.intent !== 'flee') return false;
    const boundary = context && context.boundary ? context.boundary : { x: 0, y: 0 };
    if (this._vectorLength(boundary) <= 0.35) return false;

    const target = (context && context.threat && context.threat.target) || intent.target;
    const candidate = intent.vector ||
      (context && context.threat && context.threat.vector) ||
      (target ? { x: player.x - target.x, y: player.y - target.y } : { x: player.vx, y: player.vy });
    const desired = this._normalizeVector(candidate, { x: 0, y: 0 });
    if (this._vectorLength(desired) < 0.05) return false;

    return this._isVectorAgainstBoundary(desired, boundary);
  }

  _isVectorAgainstBoundary(vector, boundary) {
    if (!vector || !boundary) return false;
    if (Math.abs(boundary.x) > 0.2 && vector.x * boundary.x < -0.02) return true;
    if (Math.abs(boundary.y) > 0.2 && vector.y * boundary.y < -0.02) return true;
    return vector.x * boundary.x + vector.y * boundary.y < -0.05;
  }

  _committedSteeringTurnLimit(player, intent, context) {
    const mode = intent && intent.mode ? intent.mode : 'wander';
    const action = intent && intent.intent ? intent.intent : mode;
    const degreesByAction = {
      flee: 8,
      'evade-arm': 8,
      attack: 10,
      pressure: 9,
      arm: 8,
      feed: 9,
      wander: 7
    };
    let degrees = degreesByAction[action] || degreesByAction[mode] || 14;

    if ((action === 'flee' || action === 'evade-arm') && context.threat && context.threat.target) {
      const panicDistance = player.radius + context.threat.target.radius + 90;
      if (this._distance(player, context.threat.target) <= panicDistance) {
        degrees += 2;
      }
    }
    if (this._vectorLength(context.boundary) > 0.05) {
      degrees += mode === 'hunt-food' ? 3 : 2;
    }

    return degrees * Math.PI / 180;
  }

  _rotateVectorTowards(current, desired, maxRadians) {
    const currentAngle = Math.atan2(current.y, current.x);
    const desiredAngle = Math.atan2(desired.y, desired.x);
    let delta = desiredAngle - currentAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    if (Math.abs(delta) <= maxRadians) return desired;

    const nextAngle = currentAngle + Math.sign(delta || 1) * maxRadians;
    return {
      x: Math.cos(nextAngle),
      y: Math.sin(nextAngle)
    };
  }

  _targetKey(target) {
    if (!target) return null;
    if (target.username) return `player:${target.username}`;
    if (target.id) return `entity:${target.id}`;
    return null;
  }

  _resolveAiTarget(previous) {
    if (!previous || !previous.targetKey) return null;
    if (previous.targetKey.startsWith('player:')) {
      return this.players.get(previous.targetKey.slice(7)) || null;
    }
    if (previous.targetKey.startsWith('entity:')) {
      const id = previous.targetKey.slice(7);
      return this.weaponPickups.get(id) || this.food.get(id) || null;
    }
    return null;
  }

  _vectorForPreviousIntent(player, target, previous, context) {
    if ((previous.intent === 'attack' || previous.intent === 'pressure') && target.username) {
      return this._vectorToTarget(player, this._predictInterceptPosition(player, target, context.movement, context.config, context.personality));
    }
    if (previous.intent === 'flee') {
      return this._lockedFleeVector(player, target, previous, context);
    }
    if (previous.intent === 'evade-arm' && context.threat) {
      const desired = this._combineSteeringVectors([
        { vector: context.threat.vector, weight: 2.2 * context.personality.fear },
        { vector: this._vectorToTarget(player, target), weight: 1.8 * context.personality.weaponFocus },
        { vector: context.boundary, weight: 0.7 }
      ]);
      const boundaryStrength = this._vectorLength(context.boundary || { x: 0, y: 0 });
      return this._lockedSteeringVector(player, previous, desired, context, boundaryStrength > 0.35 ? 8 : 5);
    }
    return this._vectorToTarget(player, target);
  }

  _lockedSteeringVector(player, previous, desired, context, maxDegrees) {
    const current = this._normalizeVector(
      previous && previous.vector ? previous.vector : { x: player.vx, y: player.vy },
      this._normalizeVector(desired, { x: 1, y: 0 })
    );
    const redirected = context.config
      ? this._redirectBlockedMovement(player, desired, context.config)
      : desired;

    return this._rotateVectorTowards(
      current,
      this._normalizeVector(redirected, current),
      maxDegrees * Math.PI / 180
    );
  }

  _lockedFleeVector(player, target, previous, context) {
    const current = this._normalizeVector(
      previous && previous.vector ? previous.vector : { x: player.vx, y: player.vy },
      this._normalizeVector({ x: player.x - target.x, y: player.y - target.y }, { x: 1, y: 0 })
    );
    const directAway = this._normalizeVector({
      x: player.x - target.x,
      y: player.y - target.y
    }, current);
    let desired = context.threat && context.threat.vector
      ? context.threat.vector
      : { x: player.x - target.x, y: player.y - target.y };
    const directAwayAlignment = current.x * directAway.x + current.y * directAway.y;
    if (this._vectorLength(directAway) > 0.05) {
      const desiredAlignment = desired.x * directAway.x + desired.y * directAway.y;
      if (desiredAlignment < 0.2 && directAwayAlignment < 0.35) {
        desired = this._combineSteeringVectors([
          { vector: directAway, weight: 2.4 },
          { vector: desired, weight: 0.45 }
        ]);
      }
    }
    const boundary = context.boundary || { x: 0, y: 0 };
    const boundaryStrength = this._vectorLength(boundary);
    const boundaryTrap = boundaryStrength > 0.35 &&
      this._isVectorAgainstBoundary(current, boundary);

    if (boundaryStrength > 0.05) {
      if (boundaryTrap) {
        desired = this._combineSteeringVectors([
          { vector: this._wallEscapeVector(player, target, boundary, previous), weight: 3.2 },
          { vector: desired, weight: 0.35 }
        ]);
      } else {
        desired = this._combineSteeringVectors([
          { vector: desired, weight: 1.7 },
          { vector: boundary, weight: boundaryStrength > 0.35 ? 1.35 : 0.65 }
        ]);
      }
    }

    const panicDistance = player.radius + (target.radius || 0) + 90;
    const isPanicClose = this._distance(player, target) <= panicDistance;
    const staleLane = this._vectorLength(directAway) > 0.05 &&
      directAwayAlignment < -0.05;
    const maxDegrees = this._fleeRecoveryTurnLimitDegrees({
      boundaryStrength,
      boundaryTrap,
      staleLane,
      isPanicClose
    });
    return this._lockedSteeringVector(player, { vector: current }, desired, context, maxDegrees);
  }

  _fleeRecoveryTurnLimitDegrees({ boundaryStrength = 0, boundaryTrap = false, staleLane = false, isPanicClose = false } = {}) {
    if (boundaryTrap) {
      const boundaryPressure = this._clamp(boundaryStrength, 0, 1);
      if (isPanicClose || boundaryPressure > 0.65) {
        return this._clamp(96 + boundaryPressure * 20 + (isPanicClose ? 8 : 0), 96, 124);
      }
      return this._clamp(42 + boundaryPressure * 22 + (isPanicClose ? 8 : 0), 42, 72);
    }
    if (staleLane) {
      return isPanicClose ? 108 : 46;
    }
    if (boundaryStrength > 0.35) return 8;
    return isPanicClose ? 5 : 3;
  }

  _wallEscapeVector(player, target, boundary, previous) {
    const inward = this._normalizeVector(boundary, { x: 0, y: 0 });
    if (this._vectorLength(inward) < 0.05) return inward;

    const tangentA = this._normalizeVector({ x: -inward.y, y: inward.x }, { x: 0, y: 1 });
    const tangentB = { x: -tangentA.x, y: -tangentA.y };
    const away = target
      ? this._normalizeVector({ x: player.x - target.x, y: player.y - target.y }, { x: 0, y: 0 })
      : { x: 0, y: 0 };
    const previousVector = this._normalizeVector(
      previous && previous.vector ? previous.vector : { x: player.vx, y: player.vy },
      tangentA
    );
    const scoreA = tangentA.x * away.x + tangentA.y * away.y +
      (tangentA.x * previousVector.x + tangentA.y * previousVector.y) * 0.35;
    const scoreB = tangentB.x * away.x + tangentB.y * away.y +
      (tangentB.x * previousVector.x + tangentB.y * previousVector.y) * 0.35;
    const tangent = scoreA >= scoreB ? tangentA : tangentB;

    const mixed = {
      x: inward.x * 0.78 + tangent.x * 0.62,
      y: inward.y * 0.78 + tangent.y * 0.62
    };
    if (Math.abs(inward.x) > 0.2 && mixed.x * inward.x < Math.abs(inward.x) * 0.1) {
      mixed.x = inward.x * 0.18;
    }
    if (Math.abs(inward.y) > 0.2 && mixed.y * inward.y < Math.abs(inward.y) * 0.1) {
      mixed.y = inward.y * 0.18;
    }

    return this._normalizeVector(mixed, inward);
  }

  _serializeAiEntity(entity) {
    if (!entity) return null;
    return {
      username: entity.username,
      id: entity.id,
      x: Math.round((entity.x || 0) * 100) / 100,
      y: Math.round((entity.y || 0) * 100) / 100,
      mass: entity.mass !== undefined ? Math.round(entity.mass * 100) / 100 : undefined
    };
  }

  _serializeAiState(player, config = this.getConfig()) {
    const intent = player.aiIntent || null;
    const memory = player.behaviorMemory || null;
    const stateMemory = player.aiStateMemory || null;
    const metadata = intent && intent.metadata ? intent.metadata : {};
    const sizeProfile = this._sizeBehaviorProfile(player, config);
    const targetKey = intent && intent.targetKey
      ? intent.targetKey
      : memory && memory.targetUsername
        ? `player:${memory.targetUsername}`
        : memory && memory.targetId
          ? `entity:${memory.targetId}`
          : null;
    const state = intent && intent.state
      ? intent.state
      : metadata.aiState
        ? metadata.aiState
        : stateMemory && stateMemory.state
          ? stateMemory.state
          : memory && memory.state
          ? memory.state
          : 'scouting';
    const rawState = intent && intent.rawState
      ? intent.rawState
      : metadata.aiStateRaw
        ? metadata.aiStateRaw
        : stateMemory && stateMemory.rawState
          ? stateMemory.rawState
          : state;
    const previousState = intent && Object.prototype.hasOwnProperty.call(intent, 'previousState')
      ? intent.previousState
      : metadata.aiStatePrevious || (stateMemory && stateMemory.previousState) || null;
    const stateEnteredAt = intent && intent.stateEnteredAt
      ? intent.stateEnteredAt
      : metadata.aiStateEnteredAt || (stateMemory && stateMemory.enteredAt) || null;
    const stateUpdatedAt = intent && intent.stateUpdatedAt
      ? intent.stateUpdatedAt
      : metadata.aiStateUpdatedAt || (stateMemory && stateMemory.updatedAt) || null;

    return {
      role: this._aiRole(player, config),
      state,
      stateLabel: this._aiStateLabel(state),
      rawState,
      previousState,
      stateEnteredAt,
      stateUpdatedAt,
      mode: intent && intent.mode ? intent.mode : memory && memory.mode ? memory.mode : 'idle',
      intent: intent && intent.intent ? intent.intent : memory && memory.intent ? memory.intent : 'idle',
      targetKey,
      score: Math.round(Number((intent && intent.score) || (memory && memory.score) || 0) * 100) / 100,
      reason: metadata.reason || null,
      planner: metadata.planner || 'utility-ai-v4',
      navigation: metadata.navigation || 'influence-field',
      search: metadata.search || 'spatial-grid',
      foodSearch: metadata.foodSearch || null,
      steering: metadata.steering || null,
      sizeClass: metadata.sizeClass || sizeProfile.sizeClass,
      sizeRole: metadata.sizeRole || sizeProfile.role,
      lockedUntil: intent && intent.lockedUntil ? intent.lockedUntil : null,
      updatedAt: intent && intent.updatedAt ? intent.updatedAt : memory && memory.updatedAt ? memory.updatedAt : null
    };
  }

  _aiRole(player, config = DEFAULT_CONFIG) {
    const personality = this._personalityTraits(player);
    const baseMass = Number(config.baseMass) || DEFAULT_CONFIG.baseMass;
    const massRatio = player && Number(player.mass) ? Number(player.mass) / Math.max(1, baseMass) : 1;
    const intent = player && player.aiIntent && player.aiIntent.intent ? player.aiIntent.intent : '';

    if (intent === 'flee' || (personality.fear >= 1.3 && massRatio <= 1.25)) return 'survivor';
    if (player && player.weapon && personality.weaponFocus >= 1.05) return 'armed-hunter';
    if (intent === 'attack' || massRatio >= 2.1) return 'predator';
    if (intent === 'pressure' || personality.aggression >= 1.25) return 'aggressor';
    if (personality.foodFocus >= 1.25) return 'forager';
    if (personality.intelligence >= 1.25) return 'tactician';
    return 'balanced';
  }

  getState(reason = 'snapshot') {
    const config = this.getConfig();
    const players = Array.from(this.players.values())
      .map(player => this._serializePlayer(player, config))
      .sort((a, b) => b.mass - a.mass);

    return {
      gameType: 'arena',
      reason,
      timestamp: this.now(),
      config: {
        arenaSizePreset: config.arenaSizePreset,
        arenaWidth: config.arenaWidth,
        arenaHeight: config.arenaHeight,
        fieldFrameEnabled: config.fieldFrameEnabled,
        fieldFrameDesign: config.fieldFrameDesign,
        fieldFrameThickness: config.fieldFrameThickness,
        fieldFrameGlow: config.fieldFrameGlow,
        largeBallTransparencyEnabled: config.largeBallTransparencyEnabled,
        largeBallTransparencyMode: config.largeBallTransparencyMode,
        largeBallTransparencyStartMass: config.largeBallTransparencyStartMass,
        largeBallMinOpacity: config.largeBallMinOpacity,
        maxPlayers: config.maxPlayers,
        maxFood: config.maxFood,
        maxFoodRender: config.maxFoodRender,
        foodSpawnIntervalMs: config.foodSpawnIntervalMs,
        foodSpawnBatchSize: config.foodSpawnBatchSize,
        foodDespawnMs: config.foodDespawnMs,
        foodBurstDespawnMs: config.foodBurstDespawnMs,
        lifeDropDespawnMs: config.lifeDropDespawnMs,
        lifeDropFadeMs: config.lifeDropFadeMs,
        lifeDropSpread: config.lifeDropSpread,
        baseLives: config.baseLives,
        spawnBaseLives: config.spawnBaseLives,
        respawnCooldownMs: config.respawnCooldownMs,
        minLives: config.minLives,
        maxLives: config.maxLives,
        maxMass: config.maxMass,
        directAbilitiesEnabled: config.directAbilitiesEnabled,
        abilityChargeMs: config.abilityChargeMs,
        boostDurationMs: config.boostDurationMs,
        shieldDurationMs: config.shieldDurationMs,
        boostColor: config.boostColor,
        shieldColor: config.shieldColor,
        bombCooldownMs: config.bombCooldownMs,
        bombSpeed: config.bombSpeed,
        bombRange: config.bombRange,
        bombBlastRadius: config.bombBlastRadius,
        likeLifeValue: config.likeLifeValue,
        likeGrowthMaxMass: config.likeGrowthMaxMass,
        maxLikeLifeBatch: config.maxLikeLifeBatch,
        giftLifePerCoin: config.giftLifePerCoin,
        renderScale: config.renderScale,
        adaptiveResolutionEnabled: config.adaptiveResolutionEnabled,
        targetFps: config.targetFps,
        maxRenderPlayers: config.maxRenderPlayers,
        rendererMode: config.rendererMode,
        topOverlayDesign: config.topOverlayDesign,
        topOverlayPosition: config.topOverlayPosition,
        topOverlayDensity: config.topOverlayDensity,
        topOverlayAccent: config.topOverlayAccent,
        topOverlayBackdrop: config.topOverlayBackdrop,
        topOverlayRotatorStyle: config.topOverlayRotatorStyle,
        topOverlayPlacement: config.topOverlayPlacement,
        topOverlayTextScale: config.topOverlayTextScale,
        topOverlayShowTitle: config.topOverlayShowTitle,
        topOverlayShowCount: config.topOverlayShowCount,
        topOverlayShowLeaderboard: config.topOverlayShowLeaderboard,
        topOverlayLeaderboardRows: config.topOverlayLeaderboardRows,
        topOverlayShowCommandHints: config.topOverlayShowCommandHints,
        infoRotatorPlacement: config.infoRotatorPlacement,
        infoRotatorLanguageMode: config.infoRotatorLanguageMode,
        chatStrategyEnabled: config.chatStrategyEnabled,
        chatStrategyDurationMs: config.chatStrategyDurationMs,
        chatStrategyCooldownMs: config.chatStrategyCooldownMs,
        chatTargetCommandEnabled: config.chatTargetCommandEnabled,
        maxWeaponPickups: config.maxWeaponPickups,
        tickRateMs: config.tickRateMs,
        stateEmitIntervalMs: config.stateEmitIntervalMs,
        giftWeaponMappings: config.giftWeaponMappings,
        infoRotatorIntervalMs: config.infoRotatorIntervalMs,
        infoRotatorMessages: config.infoRotatorMessages,
        displayTexts: config.displayTexts
      },
      fever: { ...this.fever },
      players,
      food: Array.from(this.food.values()),
      weaponPickups: Array.from(this.weaponPickups.values()).map(pickup => this._serializeWeaponPickup(pickup)),
      mines: Array.from(this.mines.values()).map(mine => this._serializeMine(mine)),
      bombs: Array.from(this.bombs.values()).map(bomb => ({ ...bomb })),
      leaderboard: players.slice(0, 10).map((player, index) => ({
        rank: index + 1,
        username: player.username,
        nickname: player.nickname,
        mass: player.mass,
        score: player.score,
        kills: player.kills
      }))
    };
  }

  emitState(reason = 'snapshot', options = {}) {
    const force = options === true || options.force === true;
    const config = this.getConfig();
    const now = this.now();

    if (!force && config.stateEmitIntervalMs > 0 && now - this.lastStateEmitAt < config.stateEmitIntervalMs) {
      return false;
    }

    // Live activity can arrive in bursts (chat, likes, gifts). The first
    // mutation is sent immediately, while later mutations in the current
    // snapshot window are folded into one authoritative state packet.
    if (force && config.stateEmitIntervalMs > 0 && now - this.lastStateEmitAt < config.stateEmitIntervalMs) {
      this._scheduleCoalescedStateEmit(reason, config.stateEmitIntervalMs - (now - this.lastStateEmitAt));
      return false;
    }

    this._emitStateNow(reason);
    return true;
  }

  _emitStateNow(reason) {
    if (this.pendingStateEmitTimer) {
      clearTimeout(this.pendingStateEmitTimer);
      this.pendingStateEmitTimer = null;
    }
    this.pendingStateEmitReason = null;
    this.lastStateEmitAt = this.now();
    this.io.emit('arena:state', this.getState(reason));
  }

  _scheduleCoalescedStateEmit(reason, delayMs) {
    this.pendingStateEmitReason = reason;
    if (this.pendingStateEmitTimer || this.destroyed) return;

    const delay = Math.max(1, Math.ceil(delayMs));
    this.pendingStateEmitTimer = setTimeout(() => {
      this.pendingStateEmitTimer = null;
      const pendingReason = this.pendingStateEmitReason;
      this.pendingStateEmitReason = null;
      if (this.destroyed || !pendingReason) return;

      const config = this.getConfig();
      const now = this.now();
      // A regular tick may already have carried the pending changes.
      if (config.stateEmitIntervalMs > 0 && now - this.lastStateEmitAt < config.stateEmitIntervalMs) return;
      this.lastStateEmitAt = now;
      this.io.emit('arena:state', this.getState(pendingReason));
    }, delay);
    if (typeof this.pendingStateEmitTimer.unref === 'function') {
      this.pendingStateEmitTimer.unref();
    }
  }

  reset() {
    this.players.clear();
    this.pendingSpawns.clear();
    this.playerIdentityAliases.clear();
    this.pendingSpawnIdentityAliases.clear();
    this.respawnCooldowns.clear();
    this.respawnCooldownIdentityAliases.clear();
    for (const food of this.food.values()) {
      this._releaseFood(food);
    }
    this.food.clear();
    this.weaponPickups.clear();
    this.mines.clear();
    const config = this.getConfig();
    this.spawnFood(Math.min(config.maxFood, 20));
    this.lastFoodSpawnAt = this.now();
    this.spawnWeaponPickup(Math.min(config.maxWeaponPickups, 2));
    this.emitState('reset', { force: true });
    return { success: true };
  }

  _updatePlayer(player, config, seconds) {
    const now = this.now();
    const inactiveMs = now - player.lastActivityAt;

    player.energy = this._clamp(
      player.energy - config.energyDecayPerSecond * seconds,
      0,
      config.maxEnergy
    );

    if (inactiveMs > config.inactivityGraceMs) {
      const overdueMs = inactiveMs - config.inactivityGraceMs;
      const decayMultiplier = 1 + Math.min(1.5, overdueMs / 30000);
      this._addLives(player, -config.inactivityShrinkPerSecond * seconds * decayMultiplier, config);
    }

    if (player.weapon && now >= player.weapon.expiresAt) {
      player.weapon = null;
    }
    this._cleanupPlayerEffects(player, now);

    const lifeExpired = player.lives <= config.minLives || player.mass < config.minMass;
    if (lifeExpired || inactiveMs > config.inactivityGraceMs * 8) {
      if (lifeExpired) {
        this._eliminatePlayer(player, config, 'inactive');
      } else {
        this._removePlayer(player.username);
      }
      this.io.emit('arena:player-removed', {
        username: player.username,
        reason: 'inactive',
        timestamp: now
      });
      return;
    }

    const behavior = this.chooseBehavior(player, config);
    this._steerPlayer(player, behavior, config, seconds);
    this._syncRadius(player, config);
  }

  _steerPlayer(player, behavior, config, seconds) {
    const movement = config.movement || DEFAULT_CONFIG.movement;
    let desired = this._wanderVector(player, movement);
    let steeringMultiplier = 1;

    if (behavior.target) {
      const target = behavior.mode === 'hunt-player' || behavior.mode === 'pressure-player'
        ? this._predictTargetPosition(behavior.target, movement, config)
        : behavior.target;
      const toTarget = {
        x: target.x - player.x,
        y: target.y - player.y
      };
      desired = behavior.vector || (behavior.mode === 'flee'
        ? { x: -toTarget.x, y: -toTarget.y }
        : toTarget);

      if (behavior.mode === 'flee') {
        steeringMultiplier = 2.2;
      } else if (behavior.mode === 'evade-weapon') {
        steeringMultiplier = 2.05;
      } else if (behavior.mode === 'hunt-player') {
        steeringMultiplier = 1.75;
      } else if (behavior.mode === 'pressure-player') {
        steeringMultiplier = 1.48;
      } else if (behavior.mode === 'hunt-weapon') {
        steeringMultiplier = 1.45;
      } else if (behavior.mode === 'hunt-food') {
        steeringMultiplier = 1.52;
      }
    }

    desired = this._normalizeVector(desired);
    const boundaryAvoidance = this._boundaryAvoidanceVector(player, config);
    if (boundaryAvoidance.x || boundaryAvoidance.y) {
      const boundaryStrength = Number(movement.boundaryAvoidanceStrength) || 0.8;
      desired = this._normalizeVector({
        x: desired.x + boundaryAvoidance.x * boundaryStrength,
        y: desired.y + boundaryAvoidance.y * boundaryStrength
      });
    }
    desired = this._redirectBlockedMovement(player, desired, config);

    const personality = this._personalityTraits(player);
    const randomPush = this._randomSteeringPush(behavior, movement, personality);

    const steeringStrength = movement.steeringStrength * steeringMultiplier;
    let desiredVelocity = this._redirectBlockedMovement(player, {
      x: desired.x + randomPush.x,
      y: desired.y + randomPush.y
    }, config);
    desiredVelocity = this._humanizedDesiredVelocity(player, desiredVelocity, behavior, config, personality);
    const velocity = this._steerVelocity(player, desiredVelocity, behavior, steeringStrength, personality, seconds);
    const speed = this._effectiveMovementSpeed(player, behavior, config);

    player.vx = velocity.x;
    player.vy = velocity.y;
    player.x += player.vx * speed * seconds;
    player.y += player.vy * speed * seconds;

    this._containPlayerInArena(player, config);
  }

  _applyWeaponEffects(player, config, seconds) {
    if (!player.weapon || seconds <= 0) return;
    if (this._usesWeaponCooldown(player.weapon.type)) {
      if (!this._weaponCanTick(player)) return;
      this._markWeaponCooldown(player, config);
    }

    if (player.weapon.type === 'laser') {
      this._applyLaserWeapon(player, config, seconds);
      return;
    }

    if (player.weapon.type === 'missile') {
      this._applyMissileWeapon(player, config, seconds);
      return;
    }

    if (player.weapon.type === 'pulse') {
      this._applyPulseWeapon(player, config, seconds);
      return;
    }

    if (player.weapon.type === 'blackhole') {
      this._applyBlackholeWeapon(player, config, seconds);
      return;
    }

    if (player.weapon.type === 'freeze') {
      this._applyFreezeWeapon(player, config, seconds);
      return;
    }

    if (player.weapon.type === 'magnet') {
      this._applyMagnetWeapon(player, config, seconds);
      return;
    }

    if (player.weapon.type === 'vampire') {
      this._applyVampireWeapon(player, config, seconds);
      return;
    }

    if (player.weapon.type === 'mine') {
      this._applyMineWeapon(player, config);
    }
  }

  _usesWeaponCooldown(type) {
    return ['laser', 'missile', 'pulse', 'blackhole', 'freeze', 'magnet', 'vampire', 'mine'].includes(type);
  }

  _weaponCanTick(player) {
    const now = this.now();
    return !player.weapon || !player.weapon.cooldownUntil || now >= player.weapon.cooldownUntil;
  }

  _markWeaponCooldown(player, config) {
    if (!player.weapon) return 0;
    const physics = config.weaponPhysics || DEFAULT_CONFIG.weaponPhysics;
    const cooldowns = physics.weaponCooldownMs || DEFAULT_CONFIG.weaponPhysics.weaponCooldownMs;
    const cooldownMs = Math.max(50, Number(cooldowns[player.weapon.type]) || 250);
    player.weapon.cooldownUntil = this.now() + cooldownMs;
    return player.weapon.cooldownUntil;
  }

  _applyLaserWeapon(player, config, seconds) {
    const physics = config.weaponPhysics || DEFAULT_CONFIG.weaponPhysics;
    const power = Number(player.weapon.power) || 1;
    const range = physics.laserRange + power * 18;
    const target = this._nearestPlayer(player, other =>
      other.mass < player.mass * 0.98 &&
      this._distance(player, other) <= range
    );

    if (!target) return;
    if (this._isShieldActive(target)) return;

    const shieldMultiplier = target.weapon && target.weapon.type === 'shield' ? 0.35 : 1;
    const damage = (physics.laserDamagePerSecond + power * 1.5) * seconds * shieldMultiplier;
    this._addMassEquivalent(target, -damage, config);
    target.energy = this._clamp(target.energy - damage * 2, 0, config.maxEnergy);
    player.score += damage * physics.laserScoreMultiplier;
    player.energy = this._clamp(player.energy + damage * 0.2, 0, config.maxEnergy);

    if (target.lives <= config.minLives || target.mass < config.minMass) {
      if (this._tryConsumeExtraLife(target, player, config)) {
        this._syncRadius(player, config);
        return;
      }
      this._eliminatePlayer(target, config, 'laser', player);
      player.kills += 1;
      this._addMassEquivalent(player, Math.max(0, target.mass) * 0.22, config);
      this.io.emit('arena:player-absorbed', {
        predator: player.username,
        prey: target.username,
        weaponType: 'laser',
        timestamp: this.now()
      });
    } else {
      this._syncRadius(target, config);
    }

    this._syncRadius(player, config);
  }

  _applyMissileWeapon(player, config, seconds) {
    const physics = config.weaponPhysics || DEFAULT_CONFIG.weaponPhysics;
    const power = Number(player.weapon.power) || 1;
    const range = physics.missileRange + power * 20;
    const target = this._nearestPlayer(player, other =>
      other.mass < player.mass * 1.08 &&
      this._distance(player, other) <= range
    );

    if (!target) return;
    if (this._isShieldActive(target)) return;

    const shieldMultiplier = target.weapon && target.weapon.type === 'shield' ? 0.45 : 1;
    const damage = (physics.missileDamagePerSecond + power * 1.8) * seconds * shieldMultiplier;
    this._addMassEquivalent(target, -damage, config);
    target.energy = this._clamp(target.energy - damage * 1.4, 0, config.maxEnergy);
    player.score += damage * 1.3;

    if (target.lives <= config.minLives || target.mass < config.minMass) {
      if (this._tryConsumeExtraLife(target, player, config)) {
        this._syncRadius(player, config);
        return;
      }
      this._eliminatePlayer(target, config, 'missile', player);
      player.kills += 1;
      this._addMassEquivalent(player, Math.max(0, target.mass) * 0.28, config);
      this.io.emit('arena:player-absorbed', {
        predator: player.username,
        prey: target.username,
        weaponType: 'missile',
        timestamp: this.now()
      });
    } else {
      this._syncRadius(target, config);
    }
    this._syncRadius(player, config);
  }

  _applyPulseWeapon(player, config, seconds) {
    const physics = config.weaponPhysics || DEFAULT_CONFIG.weaponPhysics;
    const power = Number(player.weapon.power) || 1;
    const radius = physics.pulseRadius + power * 18;
    for (const other of this.players.values()) {
      if (other.username === player.username) continue;
      if (this._isShieldActive(other)) continue;
      const distance = this._distance(player, other);
      if (distance <= 0 || distance > radius) continue;

      const strength = 1 - distance / radius;
      const shieldMultiplier = other.weapon && other.weapon.type === 'shield' ? 0.35 : 1;
      const damage = physics.pulseDamagePerSecond * power * strength * seconds * shieldMultiplier;
      this._addMassEquivalent(other, -damage, config);
      other.energy = this._clamp(other.energy - damage, 0, config.maxEnergy);

      const direction = this._normalizeVector({
        x: other.x - player.x,
        y: other.y - player.y
      });
      const push = physics.pulsePushPerSecond * strength * seconds * shieldMultiplier;
      other.x = this._clamp(other.x + direction.x * push, other.radius, config.arenaWidth - other.radius);
      other.y = this._clamp(other.y + direction.y * push, other.radius, config.arenaHeight - other.radius);

      if (other.lives <= config.minLives || other.mass < config.minMass) {
        if (this._tryConsumeExtraLife(other, player, config)) {
          continue;
        }
        this._eliminatePlayer(other, config, 'pulse', player);
        player.kills += 1;
        player.score += other.mass;
      } else {
        this._syncRadius(other, config);
      }
    }

    for (const [foodId, food] of Array.from(this.food.entries())) {
      if (this._distance(player, food) <= radius * 0.45) {
        this._consumeFood(player, foodId, food, config, 0.8, 0.8, 'pulse');
      }
    }

    this._syncRadius(player, config);
  }

  _applyBlackholeWeapon(player, config, seconds) {
    const physics = config.weaponPhysics || DEFAULT_CONFIG.weaponPhysics;
    const power = Number(player.weapon.power) || 1;
    const radius = physics.blackholeRadius + power * 24;

    for (const [foodId, food] of Array.from(this.food.entries())) {
      const distance = this._distance(player, food);
      if (distance > radius) continue;

      if (distance <= player.radius + food.radius + 4) {
        this._consumeFood(
          player,
          foodId,
          food,
          config,
          physics.blackholeGrowthMultiplier,
          1.4,
          'blackhole'
        );
        continue;
      }

      const direction = this._normalizeVector({
        x: player.x - food.x,
        y: player.y - food.y
      });
      const pull = Math.min(
        Math.max(0, distance - player.radius),
        physics.blackholeFoodPullPerSecond * (1 + power * 0.08) * seconds
      );
      food.x += direction.x * pull;
      food.y += direction.y * pull;
    }

    for (const other of this.players.values()) {
      if (other.username === player.username || other.mass >= player.mass) continue;
      if (this._isShieldActive(other)) continue;
      const distance = this._distance(player, other);
      if (distance > radius || distance <= 0) continue;

      const direction = this._normalizeVector({
        x: player.x - other.x,
        y: player.y - other.y
      });
      const shieldMultiplier = other.weapon && other.weapon.type === 'shield' ? 0.25 : 1;
      const pull = Math.min(
        Math.max(0, distance - player.radius),
        physics.blackholePlayerPullPerSecond * (1 + power * 0.06) * seconds * shieldMultiplier
      );
      other.x = this._clamp(other.x + direction.x * pull, other.radius, config.arenaWidth - other.radius);
      other.y = this._clamp(other.y + direction.y * pull, other.radius, config.arenaHeight - other.radius);
    }

    this._syncRadius(player, config);
  }

  _applyFreezeWeapon(player, config, seconds) {
    const physics = config.weaponPhysics || DEFAULT_CONFIG.weaponPhysics;
    const power = Number(player.weapon.power) || 1;
    const radius = physics.freezeRadius + power * 18;
    const now = this.now();
    const slowMultiplier = Math.max(0.25, (Number(physics.freezeSlowMultiplier) || 0.42) - power * 0.025);
    const durationMs = (Number(physics.freezeDurationMs) || 1200) + power * 80;

    for (const other of this.players.values()) {
      if (other.username === player.username) continue;
      if (this._isShieldActive(other)) continue;
      const distance = this._distance(player, other);
      if (distance > radius) continue;

      this._applySlow(other, slowMultiplier, durationMs, now);
      const strength = 1 - Math.min(1, distance / Math.max(radius, 1));
      const damage = (Number(physics.freezeDamagePerSecond) || 2.4) * (1 + power * 0.25) * strength * seconds;
      if (damage > 0) {
        this._addMassEquivalent(other, -damage, config);
        other.energy = this._clamp(other.energy - damage * 1.2, 0, config.maxEnergy);
        player.score += damage;
      }
    }
  }

  _applyMagnetWeapon(player, config, seconds) {
    const physics = config.weaponPhysics || DEFAULT_CONFIG.weaponPhysics;
    const power = Number(player.weapon.power) || 1;
    const radius = (Number(physics.magnetRadius) || 260) + power * 22;

    for (const [foodId, food] of Array.from(this.food.entries())) {
      const distance = this._distance(player, food);
      if (distance > radius) continue;
      if (distance <= player.radius + food.radius + 3) {
        this._consumeFood(player, foodId, food, config, 1, 1, 'magnet');
        continue;
      }

      const direction = this._normalizeVector({ x: player.x - food.x, y: player.y - food.y });
      const pull = Math.min(
        Math.max(0, distance - player.radius),
        (Number(physics.magnetFoodPullPerSecond) || 360) * (1 + power * 0.08) * seconds
      );
      food.x += direction.x * pull;
      food.y += direction.y * pull;
    }

    for (const other of this.players.values()) {
      if (other.username === player.username || other.mass >= player.mass * 0.96) continue;
      if (this._isShieldActive(other)) continue;
      const distance = this._distance(player, other);
      if (distance > radius || distance <= 0) continue;

      const shieldMultiplier = other.weapon && other.weapon.type === 'shield' ? 0.35 : 1;
      const direction = this._normalizeVector({ x: player.x - other.x, y: player.y - other.y });
      const pull = Math.min(
        Math.max(0, distance - player.radius),
        (Number(physics.magnetPlayerPullPerSecond) || 90) * (1 + power * 0.06) * seconds * shieldMultiplier
      );
      other.x = this._clamp(other.x + direction.x * pull, other.radius, config.arenaWidth - other.radius);
      other.y = this._clamp(other.y + direction.y * pull, other.radius, config.arenaHeight - other.radius);
    }
  }

  _applyVampireWeapon(player, config, seconds) {
    const physics = config.weaponPhysics || DEFAULT_CONFIG.weaponPhysics;
    const power = Number(player.weapon.power) || 1;
    const range = (Number(physics.vampireRange) || 170) + power * 16;
    const target = this._nearestPlayer(player, other =>
      other.mass < player.mass * 1.05 &&
      this._distance(player, other) <= range
    );
    if (!target) return;
    if (this._isShieldActive(target)) return;

    const shieldMultiplier = target.weapon && target.weapon.type === 'shield' ? 0.4 : 1;
    const drain = (Number(physics.vampireDrainPerSecond) || 18) * (1 + power * 0.18) * seconds * shieldMultiplier;
    const applied = this._addLives(target, -drain, config);
    const stolenLives = Math.max(0, -applied) * (Number(physics.vampireStealRatio) || 0.72);
    if (stolenLives > 0) {
      this._addLives(player, stolenLives, config);
      target.energy = this._clamp(target.energy - stolenLives * 0.5, 0, config.maxEnergy);
      player.energy = this._clamp(player.energy + stolenLives * 0.2, 0, config.maxEnergy);
      player.score += stolenLives;
    }

    if (target.lives <= config.minLives || target.mass < config.minMass) {
      if (this._tryConsumeExtraLife(target, player, config)) {
        return;
      }
      this._eliminatePlayer(target, config, 'vampire', player);
      player.kills += 1;
      this.io.emit('arena:player-absorbed', {
        predator: player.username,
        prey: target.username,
        weaponType: 'vampire',
        timestamp: this.now()
      });
    }
  }

  _applyMineWeapon(player, config) {
    const physics = config.weaponPhysics || DEFAULT_CONFIG.weaponPhysics;
    const now = this.now();
    const intervalMs = Number(physics.mineDropIntervalMs) || DEFAULT_CONFIG.weaponPhysics.mineDropIntervalMs;
    if (player.weapon.lastMineAt && now - player.weapon.lastMineAt < intervalMs) return;
    player.weapon.lastMineAt = now;

    const power = Number(player.weapon.power) || 1;
    const id = `mine_${++this.mineIdCounter}`;
    this.mines.set(id, {
      id,
      owner: player.username,
      x: player.x,
      y: player.y,
      radius: (Number(physics.mineRadius) || 62) + power * 3,
      power,
      damage: (Number(physics.mineDamage) || 34) * (1 + power * 0.08),
      slowMultiplier: Number(physics.mineSlowMultiplier) || 0.45,
      slowDurationMs: (Number(physics.mineSlowDurationMs) || 1200) + power * 80,
      spawnedAt: now,
      expiresAt: now + (Number(physics.mineDurationMs) || 9000)
    });
  }

  _updateMines(config) {
    const now = this.now();
    for (const [mineId, mine] of Array.from(this.mines.entries())) {
      if (mine.expiresAt && now >= mine.expiresAt) {
        this.mines.delete(mineId);
        continue;
      }

      for (const player of Array.from(this.players.values())) {
        if (player.username === mine.owner) continue;
        if (this._isShieldActive(player)) continue;
        if (this._distance(player, mine) > mine.radius + player.radius * 0.35) continue;

        const applied = this._addLives(player, -mine.damage, config);
        this._applySlow(player, mine.slowMultiplier, mine.slowDurationMs, now);
        this.mines.delete(mineId);
        this.io.emit('arena:mine-triggered', {
          mineId,
          owner: mine.owner,
          target: player.username,
          damageLives: Math.max(0, -applied),
          x: mine.x,
          y: mine.y,
          radius: mine.radius,
          timestamp: now
        });

        if (player.lives <= config.minLives || player.mass < config.minMass) {
          const owner = this.players.get(mine.owner);
          if (this._tryConsumeExtraLife(player, owner || mine, config)) {
            break;
          }
          this._eliminatePlayer(player, config, 'mine', owner || mine);
          if (owner) {
            owner.kills += 1;
            owner.score += Math.max(0, -applied);
          }
        }
        break;
      }
    }
  }

  _throwBomb(player, config, now) {
    const cooldownUntil = Number(player.bombCooldownUntil) || 0;
    if (now < cooldownUntil) return { success: false, error: `bomb recharges in ${Math.ceil((cooldownUntil - now) / 1000)}s` };
    const directions = [
      { name: 'east', x: 1, y: 0 }, { name: 'south', x: 0, y: 1 },
      { name: 'west', x: -1, y: 0 }, { name: 'north', x: 0, y: -1 }
    ];
    const direction = directions[Math.min(directions.length - 1, Math.floor(this.random() * directions.length))];
    const bomb = {
      id: `bomb_${++this.bombIdCounter}`, owner: player.username, x: player.x, y: player.y,
      vx: direction.x, vy: direction.y, radius: 12, travelled: 0, spawnedAt: now,
      range: config.bombRange, speed: config.bombSpeed, blastRadius: config.bombBlastRadius
    };
    player.bombCooldownUntil = now + config.bombCooldownMs;
    this.bombs.set(bomb.id, bomb);
    this.io.emit('arena:bomb-thrown', { ...bomb, direction: direction.name, timestamp: now });
    this.emitState('bomb-thrown', { force: true });
    return { success: true, ability: 'bomb', direction: direction.name, bombId: bomb.id };
  }

  _updateBombs(config, seconds) {
    for (const [id, bomb] of Array.from(this.bombs.entries())) {
      const distance = bomb.speed * seconds;
      bomb.x += bomb.vx * distance;
      bomb.y += bomb.vy * distance;
      bomb.travelled += distance;
      const target = Array.from(this.players.values()).find(player =>
        player.username !== bomb.owner && !this._isShieldActive(player) &&
        this._distance(player, bomb) <= player.radius + bomb.blastRadius
      );
      if (target) {
        const beforeMass = target.mass;
        target.lives = config.minLives + 1;
        this._syncRadius(target, config);
        this._spawnFoodBurst(target, Math.max(18, Math.min(72, Math.floor(beforeMass / 3))), config, {
          source: 'bomb', value: Math.max(config.foodValue * 2, beforeMass / 160), spread: bomb.blastRadius, ignoreCap: true
        });
        this.io.emit('arena:bomb-exploded', { bombId: id, owner: bomb.owner, target: target.username, x: target.x, y: target.y, timestamp: this.now() });
        this.bombs.delete(id);
      } else if (bomb.travelled >= bomb.range || bomb.x < 0 || bomb.y < 0 || bomb.x > config.arenaWidth || bomb.y > config.arenaHeight) {
        this.bombs.delete(id);
      }
    }
  }

  _resolveFoodCollisions(config) {
    for (const player of this.players.values()) {
      for (const [foodId, food] of Array.from(this.food.entries())) {
        if (!this._canConsumeFood(player, food, config, 'collision')) continue;
        if (this._distance(player, food) <= this._foodCollectionDistance(player, food, config)) {
          this._consumeFood(player, foodId, food, config, 1, 1, 'collision');
        }
      }
    }
  }

  _consumeFood(player, foodId, food, config, gainMultiplier = 1, energyGain = 1, reason = 'food') {
    if (!this.food.has(foodId)) return 0;

    const gain = food.value * gainMultiplier;
    this.food.delete(foodId);
    const beforeLives = this._ensureLives(player, config);
    const growthGain = gain * this._foodGrowthMultiplier(player, food, config);
    this._addMassEquivalent(player, growthGain, config);
    const lifeGain = player.lives - beforeLives;
    player.score += gain;
    player.energy = this._clamp(player.energy + energyGain, 0, config.maxEnergy);

    this.io.emit('arena:food-eaten', {
      username: player.username,
      nickname: player.nickname,
      foodId,
      x: food.x,
      y: food.y,
      radius: food.radius,
      gain,
      growthGain,
      lifeGain,
      reason,
      timestamp: this.now()
    });

    this._releaseFood(food);
    this._syncRadius(player, config);
    return gain;
  }

  _canConsumeFood(player, food, config = DEFAULT_CONFIG, reason = 'collision') {
    if (!player || !food) return false;
    if (reason !== 'collision') return true;
    if (this._isFoodUsefulForPlayer(player, config)) return true;

    const source = String(food.source || 'ambient');
    return !['ambient', 'like', 'death-drop', 'burst'].includes(source);
  }

  _isFoodUsefulForPlayer(player, config = DEFAULT_CONFIG) {
    if (!player) return false;
    if (player.weapon && (!player.weapon.expiresAt || player.weapon.expiresAt > this.now())) return true;

    const mass = Number(player.mass) || Number(config.baseMass) || DEFAULT_CONFIG.baseMass;
    const maxMass = Math.max(1, Number(config.maxMass) || DEFAULT_CONFIG.maxMass);
    const maxEnergy = Math.max(1, Number(config.maxEnergy) || DEFAULT_CONFIG.maxEnergy);
    const energyRatio = this._clamp((Number(player.energy) || 0) / maxEnergy, 0, 1);
    const ignoreMassRatio = this._clamp(
      Number(config.largePlayerFoodIgnoreMassRatio) || DEFAULT_CONFIG.largePlayerFoodIgnoreMassRatio,
      0.5,
      0.98
    );
    const falloffStart = Number(config.foodGrowthFalloffStartMass) || DEFAULT_CONFIG.foodGrowthFalloffStartMass;
    const ordinaryFoodSaturationMass = Math.min(maxMass * ignoreMassRatio, falloffStart + 95);
    const energyThreshold = this._clamp(
      Number(config.largePlayerFoodEnergyRatio) || DEFAULT_CONFIG.largePlayerFoodEnergyRatio,
      0,
      1
    );

    return !(mass >= ordinaryFoodSaturationMass && energyRatio >= energyThreshold);
  }

  _foodGrowthMultiplier(player, food, config = DEFAULT_CONFIG) {
    const mass = Number(player && player.mass) || Number(config.baseMass) || DEFAULT_CONFIG.baseMass;
    const maxMass = Math.max(1, Number(config.maxMass) || DEFAULT_CONFIG.maxMass);
    const start = this._clamp(
      Number(config.foodGrowthFalloffStartMass) || DEFAULT_CONFIG.foodGrowthFalloffStartMass,
      Number(config.baseMass) || DEFAULT_CONFIG.baseMass,
      maxMass
    );
    if (mass <= start) return 1;

    const minMultiplier = this._clamp(
      Number(config.foodGrowthMinMultiplier) || DEFAULT_CONFIG.foodGrowthMinMultiplier,
      0.05,
      1
    );
    const falloffEnd = this._clamp(Math.min(maxMass * 0.82, start + 110), start + 1, maxMass);
    const t = this._clamp((mass - start) / Math.max(1, falloffEnd - start), 0, 1);
    const smooth = t * t * (3 - 2 * t);
    return this._clamp(1 - (1 - minMultiplier) * smooth, minMultiplier, 1);
  }

  _createFoodEntity(data) {
    const food = this.foodPool.pop() || {};
    food.id = data.id;
    food.x = data.x;
    food.y = data.y;
    food.radius = data.radius;
    food.value = data.value;
    food.source = data.source || 'ambient';
    food.spawnedAt = data.spawnedAt || this.now();
    food.expiresAt = Number(data.expiresAt) || null;
    food.fadeOutMs = Number(data.fadeOutMs) || this._foodFadeOutMs(food.source, null);
    food.motionScale = this._clamp(Number(data.motionScale) || 0, 0, 1);
    return food;
  }

  _updateFood(config) {
    this._expireFood(config);

    const missing = this._targetFoodCount(config) - this.food.size;
    if (missing <= 0) return;

    const now = this.now();
    const intervalMs = Math.max(
      0,
      Number(config.foodSpawnIntervalMs) || DEFAULT_CONFIG.foodSpawnIntervalMs
    );
    if (intervalMs > 0 && now - this.lastFoodSpawnAt < intervalMs) return;

    const batchSize = this._ambientFoodSpawnBatchSize(config, missing);
    this.spawnFood(Math.min(missing, batchSize));
    this.lastFoodSpawnAt = now;
  }

  _ambientFoodSpawnBatchSize(config, missing) {
    const baseBatch = Math.max(
      1,
      Math.floor(Number(config.foodSpawnBatchSize) || DEFAULT_CONFIG.foodSpawnBatchSize)
    );
    if (missing <= baseBatch) return Math.max(0, missing);

    const targetFood = Math.max(1, this._targetFoodCount(config));
    const fillRatio = this._clamp(this.food.size / targetFood, 0, 1);
    const activePlayers = this.players.size;
    let batchSize = baseBatch;

    if (activePlayers >= 14 && fillRatio < 0.58) {
      batchSize = Math.max(batchSize, baseBatch + 6);
    } else if (activePlayers >= 10 && fillRatio < 0.52) {
      batchSize = Math.max(batchSize, baseBatch + 4);
    } else if (activePlayers >= 7 && fillRatio < 0.45) {
      batchSize = Math.max(batchSize, baseBatch + 3);
    } else if (activePlayers >= 4 && fillRatio < 0.35) {
      batchSize = Math.max(batchSize, baseBatch + 1);
    }

    const adaptiveCap = Math.max(baseBatch, 8);
    return Math.min(missing, Math.min(batchSize, adaptiveCap));
  }

  _expireFood(config) {
    const now = this.now();
    for (const [foodId, food] of Array.from(this.food.entries())) {
      const expiresAt = food.expiresAt || this._foodExpiresAt(food.source, food.spawnedAt, config);
      food.expiresAt = expiresAt;
      if (!expiresAt || now < expiresAt) continue;

      this.food.delete(foodId);
      this._releaseFood(food);
      this.io.emit('arena:food-expired', {
        foodId,
        source: food.source,
        x: food.x,
        y: food.y,
        timestamp: now
      });
    }
  }

  _foodExpiresAt(source, spawnedAt, config = DEFAULT_CONFIG) {
    const lifetimeMs = this._foodLifetimeMs(source, config);
    if (lifetimeMs <= 0) return null;
    return (Number(spawnedAt) || this.now()) + lifetimeMs;
  }

  _foodLifetimeMs(source, config = DEFAULT_CONFIG) {
    const normalizedSource = String(source || 'ambient');
    if (normalizedSource === 'life-drop') {
      return Math.max(0, Number(config.lifeDropDespawnMs) || DEFAULT_CONFIG.lifeDropDespawnMs);
    }
    const isAmbient = normalizedSource === 'ambient';
    const configured = isAmbient ? config.foodDespawnMs : config.foodBurstDespawnMs;
    const fallback = isAmbient ? DEFAULT_CONFIG.foodDespawnMs : DEFAULT_CONFIG.foodBurstDespawnMs;
    return Math.max(0, Number(configured) || fallback);
  }

  _foodFadeOutMs(source, config = DEFAULT_CONFIG) {
    const normalizedSource = String(source || 'ambient');
    if (normalizedSource === 'life-drop') {
      return Math.max(0, Number(config?.lifeDropFadeMs) || DEFAULT_CONFIG.lifeDropFadeMs);
    }
    const lifetime = this._foodLifetimeMs(normalizedSource, config || DEFAULT_CONFIG);
    return Math.max(5000, Math.min(26000, lifetime * 0.28));
  }

  _releaseFood(food) {
    if (!food || this.foodPool.includes(food) || this.foodPool.length >= 500) return false;
    this.foodPool.push(food);
    return true;
  }

  _spawnFoodBurst(origin, count, config, options = {}) {
    const amount = Math.min(
      Math.max(0, Math.floor(Number(count) || 0)),
      Math.max(1, Number(config.maxFoodBurstPerEvent) || DEFAULT_CONFIG.maxFoodBurstPerEvent)
    );
    if (!amount || !origin) return 0;

    const ignoreCap = Boolean(options.ignoreCap);
    const cap = Math.max(0, this._targetFoodCount(config));
    const source = String(options.source || 'burst');
    const radius = Math.max(2, Number(options.radius) || Number(config.foodRadius) || DEFAULT_CONFIG.foodRadius);
    const value = Math.max(0.1, Number(options.value) || Number(config.foodValue) || DEFAULT_CONFIG.foodValue);
    const spread = Math.max(radius * 2, Number(options.spread) || 64);
    const fadeOutMs = Number.isFinite(Number(options.fadeOutMs))
      ? Math.max(0, Number(options.fadeOutMs))
      : this._foodFadeOutMs(source, config);
    const motionScale = this._clamp(
      Number.isFinite(Number(options.motionScale)) ? Number(options.motionScale) : 0.35,
      0,
      1
    );
    const now = this.now();
    let spawned = 0;

    for (let i = 0; i < amount; i++) {
      if (!ignoreCap && this.food.size >= cap) break;

      const angle = this.random() * Math.PI * 2;
      const distance = Math.sqrt(this.random()) * spread;
      const id = `food_${++this.foodIdCounter}`;
      this.food.set(id, this._createFoodEntity({
        id,
        x: this._clamp((Number(origin.x) || 0) + Math.cos(angle) * distance, radius, config.arenaWidth - radius),
        y: this._clamp((Number(origin.y) || 0) + Math.sin(angle) * distance, radius, config.arenaHeight - radius),
        radius,
        value,
        source,
        spawnedAt: now,
        expiresAt: this._foodExpiresAt(source, now, config),
        fadeOutMs,
        motionScale
      }));
      spawned += 1;
    }

    if (spawned > 0) {
      this.io.emit('arena:food-burst', {
        source,
        count: spawned,
        x: Math.round((Number(origin.x) || 0) * 100) / 100,
        y: Math.round((Number(origin.y) || 0) * 100) / 100,
        timestamp: now
      });
    }

    return spawned;
  }

  _dropDeathFood(prey, predator, config, options = {}) {
    const countMultiplier = this._clamp(Number(options.countMultiplier) || 1, 0.5, 2.4);
    const valueMultiplier = this._clamp(Number(options.valueMultiplier) || 1, 0.5, 2.2);
    const count = Math.max(
      0,
      Math.floor((Number(config.deathFoodDropCount) || DEFAULT_CONFIG.deathFoodDropCount) * countMultiplier)
    );
    if (!count || !prey) return 0;

    const preyMass = Math.max(0, Number(prey.mass) || 0);
    const value = Math.max(
      0.2,
      Number(config.deathFoodDropValue) || DEFAULT_CONFIG.deathFoodDropValue,
      preyMass / Math.max(count * 12, 1)
    ) * valueMultiplier;
    const spawned = this._spawnFoodBurst(prey, count, config, {
      source: 'death-drop',
      value,
      radius: Math.max(3, Number(config.foodRadius) || DEFAULT_CONFIG.foodRadius),
      spread: Math.max(Number(config.deathFoodDropSpread) || DEFAULT_CONFIG.deathFoodDropSpread, prey.radius * 2.4),
      ignoreCap: true
    });

    if (spawned > 0) {
      this.io.emit('arena:death-drop', {
        predator: predator && predator.username ? predator.username : null,
        prey: prey.username,
        count: spawned,
        x: Math.round((Number(prey.x) || 0) * 100) / 100,
        y: Math.round((Number(prey.y) || 0) * 100) / 100,
        timestamp: this.now()
      });
    }

    return spawned;
  }

  _tryConsumeExtraLife(player, attacker, config) {
    const reserve = Math.max(0, Math.floor(Number(player && player.extraLives) || 0));
    if (!reserve) return false;

    const now = this.now();
    player.extraLives = reserve - 1;
    player.lives = Math.max(
      Number(config.minLives) + 1,
      Math.min(Number(config.baseLives) || DEFAULT_CONFIG.baseLives, (Number(config.baseLives) || DEFAULT_CONFIG.baseLives) * 0.55)
    );
    player.energy = Math.max(
      Number(player.energy) || 0,
      (Number(config.baseEnergy) || DEFAULT_CONFIG.baseEnergy) * 0.7
    );

    if (attacker) {
      const away = this._normalizeVector({
        x: player.x - attacker.x,
        y: player.y - attacker.y
      });
      const escapeDistance = Math.max(player.radius + (attacker.radius || 0) + 70, 110);
      player.x = this._clamp(player.x + away.x * escapeDistance, player.radius, config.arenaWidth - player.radius);
      player.y = this._clamp(player.y + away.y * escapeDistance, player.radius, config.arenaHeight - player.radius);
      player.vx = away.x;
      player.vy = away.y;
    }

    player.lastActivityAt = now;
    this._syncRadius(player, config);
    this.io.emit('arena:player-revived', {
      username: player.username,
      nickname: player.nickname,
      attacker: attacker && attacker.username ? attacker.username : null,
      extraLives: player.extraLives,
      lives: player.lives,
      x: player.x,
      y: player.y,
      timestamp: now
    });
    return true;
  }

  _updateWeaponPickups(config) {
    const now = this.now();
    for (const [pickupId, pickup] of Array.from(this.weaponPickups.entries())) {
      if (pickup.expiresAt && now >= pickup.expiresAt) {
        this.weaponPickups.delete(pickupId);
      }
    }

    if (this.weaponPickups.size >= config.maxWeaponPickups) return;
    if (now - this.lastWeaponPickupSpawnAt < config.weaponPickupSpawnIntervalMs) return;

    this.lastWeaponPickupSpawnAt = now;
    if (this.random() <= config.weaponPickupChance || this.weaponPickups.size === 0) {
      this.spawnWeaponPickup(1);
    }
  }

  _resolveWeaponPickupCollisions(config) {
    const now = this.now();
    for (const player of this.players.values()) {
      for (const [pickupId, pickup] of Array.from(this.weaponPickups.entries())) {
        if (now - pickup.spawnedAt < 120) continue;
        if (this._distance(player, pickup) > this._weaponPickupCollectionDistance(player, pickup, config)) continue;
        if (!this._shouldReplaceWeaponWithPickup(player, pickup, now)) continue;

        this.weaponPickups.delete(pickupId);
        player.weapon = this._createWeapon({
          type: pickup.type,
          tier: pickup.tier || 'pickup',
          power: pickup.power,
          sourceGift: 'Arena Pickup',
          durationMs: pickup.durationMs
        });
        this._resetAiIntentForWeaponChange(player);
        player.energy = this._clamp(player.energy + pickup.power * 3, 0, config.maxEnergy);

        this.io.emit('arena:weapon-collected', {
          username: player.username,
          nickname: player.nickname,
          pickupId,
          weapon: player.weapon,
          timestamp: now
        });
        this.io.emit('arena:weapon-activated', {
          username: player.username,
          nickname: player.nickname,
          weapon: player.weapon,
          timestamp: now
        });
        this._syncRadius(player, config);
      }
    }
  }

  _foodCollectionDistance(player, food, config = DEFAULT_CONFIG) {
    const foodRadius = Number(food && food.radius) || Number(config.foodRadius) || DEFAULT_CONFIG.foodRadius;
    const playerRadius = Number(player && player.radius) || 0;
    const pickupAssist = this._clamp(playerRadius * 0.3, 8, 16);
    return playerRadius + foodRadius + pickupAssist;
  }

  _weaponPickupCollectionDistance(player, pickup, config = DEFAULT_CONFIG) {
    const pickupRadius = Number(pickup && pickup.radius) || Number(config.weaponPickupRadius) || DEFAULT_CONFIG.weaponPickupRadius;
    const playerRadius = Number(player && player.radius) || 0;
    const pickupAssist = this._clamp(playerRadius * 0.32, 10, 20);
    return playerRadius + pickupRadius + pickupAssist;
  }

  _isWeaponActive(weapon, now = this.now()) {
    return Boolean(weapon && weapon.type && (!weapon.expiresAt || weapon.expiresAt > now));
  }

  _activeWeaponType(player, now = this.now()) {
    return this._isWeaponActive(player && player.weapon, now) ? player.weapon.type : null;
  }

  _weaponExpiresSoon(weapon, now = this.now(), thresholdMs = 1500) {
    if (!this._isWeaponActive(weapon, now)) return true;
    if (!weapon.expiresAt) return false;
    return weapon.expiresAt - now <= thresholdMs;
  }

  _weaponReplacementValue(weapon) {
    if (!weapon || !weapon.type) return 0;
    const tierBonus = {
      large: 1.15,
      medium: 0.55,
      small: 0.18,
      pickup: 0
    }[weapon.tier] || 0;
    const giftBonus = weapon.sourceGift && weapon.sourceGift !== 'Arena Pickup' ? 0.45 : 0;
    return this._weaponUtility(weapon.type, weapon.power) + tierBonus + giftBonus;
  }

  _shouldReplaceWeaponWithPickup(player, pickup, now = this.now()) {
    const current = player && player.weapon;
    if (!this._isWeaponActive(current, now)) return true;

    const remainingMs = current.expiresAt ? current.expiresAt - now : Infinity;
    const currentValue = this._weaponReplacementValue(current);
    const pickupValue = this._weaponReplacementValue(pickup);
    const currentIsGift = Boolean(current.sourceGift && current.sourceGift !== 'Arena Pickup');

    if (current.type === 'chainsaw' && remainingMs > 1800) {
      return pickupValue > currentValue + 2.2;
    }
    if (currentIsGift && remainingMs > 2200) {
      return pickupValue > currentValue + 1.2;
    }
    if (remainingMs > 3000) {
      return pickupValue > currentValue + 0.55;
    }
    return pickupValue >= currentValue - 0.15;
  }

  _resetAiIntentForWeaponChange(player) {
    if (!player) return;
    player.aiIntent = null;
    player.aiStateMemory = null;
  }

  _resolvePlayerCollisions(config) {
    if (!this.aiSpatialIndex) {
      this.aiSpatialIndex = this._buildSpatialIndex(config);
    }
    const players = Array.from(this.players.values());
    const checkedPairs = new Set();
    for (const player of players) {
      if (!this.players.has(player.username)) continue;

      const searchRadius = Math.max(220, player.radius * 4 + Math.sqrt(config.maxMass) * 6);
      for (const other of this._nearbyPlayers(player, searchRadius)) {
        if (player.username === other.username || !this.players.has(other.username)) continue;
        const pairKey = player.username < other.username
          ? `${player.username}:${other.username}`
          : `${other.username}:${player.username}`;
        if (checkedPairs.has(pairKey)) continue;
        checkedPairs.add(pairKey);

        if (this._tryResolveAbsorption(player, other, config)) continue;
        this._tryResolveAbsorption(other, player, config);
      }
    }
  }

  _tryResolveAbsorption(player, other, config) {
    if (!this.players.has(player.username) || !this.players.has(other.username)) return false;
    if (this._isShieldActive(other)) return false;
    if (this._tryResolveChainsawCollision(player, other, config)) return true;
    if (this._tryResolveChainsawCollision(other, player, config)) return true;

    const absorbContext = this._playerAbsorbContext(player, other, config);
    if (!absorbContext.canAbsorb) return false;
    if (this._distance(player, other) > absorbContext.absorbDistance) return false;

    if (!absorbContext.weaponType && this._tryApplySpawnProtection(other, player, config)) {
      return true;
    }

    if (this._tryConsumeExtraLife(other, player, config)) {
      return true;
    }

    const rewardContext = this._absorbRewardContext(player, other, config, absorbContext);
    const preyLives = this._ensureLives(other, config);
    const beforeLives = this._ensureLives(player, config);
    const beforeMass = player.mass;
    const lifeStealGain = preyLives * rewardContext.lifeStealRatio;
    const massEquivalentLifeGain = this._massDeltaToLifeDelta(
      player.mass,
      other.mass * rewardContext.massGainRatio,
      config
    );
    this._addLives(player, Math.max(lifeStealGain, massEquivalentLifeGain), config);
    const lifeGain = player.lives - beforeLives;
    const massGain = player.mass - beforeMass;
    player.score += other.mass;
    player.kills += 1;
    const deathFoodDrops = this._dropDeathFood(other, player, config, {
      countMultiplier: rewardContext.deathFoodCountMultiplier,
      valueMultiplier: rewardContext.deathFoodValueMultiplier
    });
    this._eliminatePlayer(other, config, 'absorbed', player);
    this.io.emit('arena:player-absorbed', {
      predator: player.username,
      prey: other.username,
      massGain,
      lifeGain,
      preyLives,
      lifeStealRatio: rewardContext.lifeStealRatio,
      lifeStealGain,
      massGainRatio: rewardContext.massGainRatio,
      rewardDamping: rewardContext.rewardDamping,
      deathFoodDrops,
      predatorMass: player.mass,
      predatorLives: player.lives,
      x: Math.round((Number(other.x) || 0) * 100) / 100,
      y: Math.round((Number(other.y) || 0) * 100) / 100,
      radius: Math.round((Number(other.radius) || 0) * 100) / 100,
      weaponType: absorbContext.weaponType,
      timestamp: this.now()
    });
    this._syncRadius(player, config);
    return true;
  }

  _absorbRewardContext(player, other, config, absorbContext) {
    const baseLifeStealRatio = this._clamp(
      Number(absorbContext.lifeStealRatio) || Number(config.playerAbsorbLifeStealRatio) || DEFAULT_CONFIG.playerAbsorbLifeStealRatio,
      0,
      1.5
    );
    const baseMassGainRatio = this._clamp(
      Number(absorbContext.massGainRatio) || Number(config.playerAbsorbMassRatio) || DEFAULT_CONFIG.playerAbsorbMassRatio,
      0,
      1.5
    );

    if (absorbContext.weaponType) {
      return {
        lifeStealRatio: baseLifeStealRatio,
        massGainRatio: baseMassGainRatio,
        deathFoodCountMultiplier: 1,
        deathFoodValueMultiplier: 1,
        rewardDamping: 0
      };
    }

    const maxMass = Math.max(1, Number(config.maxMass) || DEFAULT_CONFIG.maxMass);
    const predatorMass = this._clamp(Number(player.mass) || Number(config.baseMass) || DEFAULT_CONFIG.baseMass, config.minMass, maxMass);
    const preyMass = Math.max(1, Number(other.mass) || Number(config.baseMass) || DEFAULT_CONFIG.baseMass);
    const balanceCap = Math.min(maxMass, 260);
    const dominance = this._clamp((predatorMass - balanceCap * 0.46) / Math.max(1, balanceCap * 0.42), 0, 1);
    const capPressure = this._clamp((predatorMass - balanceCap * 0.82) / Math.max(1, balanceCap * 0.18), 0, 1);
    const preyGap = this._clamp((predatorMass / preyMass - 1.7) / 3.5, 0, 1);
    const preyGapPressure = preyGap * Math.max(dominance, capPressure);
    const rewardDamping = this._clamp(dominance * 0.65 + capPressure * 0.45 + preyGapPressure * 0.18, 0, 0.86);

    return {
      lifeStealRatio: this._clamp(baseLifeStealRatio * (1 - rewardDamping * 0.78), 0.18, baseLifeStealRatio),
      massGainRatio: this._clamp(baseMassGainRatio * (1 - rewardDamping * 0.72), 0.16, baseMassGainRatio),
      deathFoodCountMultiplier: 1 + rewardDamping * 0.9,
      deathFoodValueMultiplier: 1 + rewardDamping * 0.45,
      rewardDamping: Math.round(rewardDamping * 1000) / 1000
    };
  }

  _tryApplySpawnProtection(player, predator, config) {
    const now = this.now();
    const protectedUntil = Number(player && player.spawnProtectedUntil);
    if (!Number.isFinite(protectedUntil)) return false;
    const remainingMs = protectedUntil - now;
    if (remainingMs <= 0) {
      player.spawnProtectedUntil = null;
      return false;
    }
    if (this._isWeaponActive(player.weapon, now)) return false;

    const away = this._normalizeVector({
      x: player.x - predator.x,
      y: player.y - predator.y
    }, this._normalizeVector({ x: Number(player.vx) || 1, y: Number(player.vy) || 0 }, { x: 1, y: 0 }));
    const safeDistance = (Number(predator.radius) || 0) +
      (Number(player.radius) || 0) +
      Math.max(22, (Number(player.radius) || 0) * 0.8);

    player.x = this._clamp(predator.x + away.x * safeDistance, player.radius, config.arenaWidth - player.radius);
    player.y = this._clamp(predator.y + away.y * safeDistance, player.radius, config.arenaHeight - player.radius);
    player.vx = away.x;
    player.vy = away.y;
    player.energy = this._clamp((Number(player.energy) || 0) + 12, 0, config.maxEnergy);
    player.aiIntent = null;
    player.aiStateMemory = null;

    this.io.emit('arena:spawn-protection', {
      username: player.username,
      nickname: player.nickname,
      predator: predator.username,
      remainingMs,
      x: Math.round(player.x * 100) / 100,
      y: Math.round(player.y * 100) / 100,
      timestamp: now
    });
    return true;
  }

  _spawnProtectionMs(config) {
    return Math.max(0, Number(config.spawnProtectionMs) || DEFAULT_CONFIG.spawnProtectionMs);
  }

  _tryResolveChainsawCollision(player, other, config) {
    const weapon = player && player.weapon;
    if (!weapon || weapon.type !== 'chainsaw' || (weapon.expiresAt && weapon.expiresAt <= this.now())) {
      return false;
    }
    if (this._isShieldActive(other)) return false;

    const physics = config.weaponPhysics || DEFAULT_CONFIG.weaponPhysics;
    const absorbOverlapRatio = Number(config.playerAbsorbOverlapRatio) || DEFAULT_CONFIG.playerAbsorbOverlapRatio;
    const overlapBonus = Number(physics.chainsawAbsorbOverlapBonus) || DEFAULT_CONFIG.weaponPhysics.chainsawAbsorbOverlapBonus;
    const hitDistance = this._radiusForAbsorb(player, config) +
      this._radiusForAbsorb(other, config) * (absorbOverlapRatio + overlapBonus);
    if (this._distance(player, other) > hitDistance) return false;

    const now = this.now();
    if (weapon.chainsawHitCooldownUntil && now < weapon.chainsawHitCooldownUntil) {
      return true;
    }
    weapon.chainsawHitCooldownUntil = now +
      (Number(physics.chainsawHitCooldownMs) || DEFAULT_CONFIG.weaponPhysics.chainsawHitCooldownMs);

    const requiredRatio = Number(physics.chainsawRequiredMassRatio) ||
      DEFAULT_CONFIG.weaponPhysics.chainsawRequiredMassRatio;
    if (player.mass > other.mass * requiredRatio) {
      return this._resolveChainsawSlice(player, other, config, physics);
    }

    return this._resolveChainsawBounce(player, other, config, physics);
  }

  _resolveChainsawSlice(player, other, config, physics) {
    if (this._tryConsumeExtraLife(other, player, config)) {
      this._emitChainsawHit(player, other, 'slice-blocked', {
        lifeDamage: 0,
        foodDrops: 0
      });
      return true;
    }

    const preyLives = this._ensureLives(other, config);
    const beforeLives = this._ensureLives(player, config);
    const beforeMass = player.mass;
    const massGainRatio = Number(physics.chainsawAbsorbMassRatio) || DEFAULT_CONFIG.weaponPhysics.chainsawAbsorbMassRatio;
    const lifeStealRatio = Number(physics.chainsawAbsorbLifeStealRatio) || DEFAULT_CONFIG.weaponPhysics.chainsawAbsorbLifeStealRatio;
    const directSteal = preyLives *
      lifeStealRatio *
      0.62;
    const massEquivalentLifeGain = this._massDeltaToLifeDelta(
      player.mass,
      other.mass * massGainRatio,
      config
    );
    this._addLives(player, Math.max(directSteal, massEquivalentLifeGain), config);
    const lifeGain = player.lives - beforeLives;
    const massGain = player.mass - beforeMass;
    const foodDrops = this._dropChainsawFood(
      other,
      config,
      'chainsaw-splatter',
      Number(physics.chainsawSplatterFoodCount) || DEFAULT_CONFIG.weaponPhysics.chainsawSplatterFoodCount,
      0.42
    );

    player.score += other.mass * 1.15;
    player.kills += 1;
    this._eliminatePlayer(other, config, 'chainsaw', player);
    this.io.emit('arena:player-absorbed', {
      predator: player.username,
      prey: other.username,
      massGain,
      lifeGain,
      preyLives,
      lifeStealRatio: lifeStealRatio * 0.62,
      lifeStealGain: directSteal,
      massGainRatio,
      deathFoodDrops: foodDrops,
      predatorMass: player.mass,
      predatorLives: player.lives,
      weaponType: 'chainsaw',
      timestamp: this.now()
    });
    this._emitChainsawHit(player, other, 'slice', {
      lifeDamage: preyLives,
      foodDrops
    });
    this._syncRadius(player, config);
    return true;
  }

  _resolveChainsawBounce(player, other, config, physics) {
    const beforeLives = this._ensureLives(other, config);
    const power = Number(player.weapon && player.weapon.power) || 1;
    const minDamage = Number(physics.chainsawLargeTargetMinDamage) ||
      DEFAULT_CONFIG.weaponPhysics.chainsawLargeTargetMinDamage;
    const damageRatio = Number(physics.chainsawLargeTargetDamageRatio) ||
      DEFAULT_CONFIG.weaponPhysics.chainsawLargeTargetDamageRatio;
    const maxDamage = Math.max(0, beforeLives - (Number(config.minLives) || DEFAULT_CONFIG.minLives) - 1);
    const requestedDamage = Math.max(minDamage, beforeLives * damageRatio + power * 9);
    const lifeDamage = Math.min(maxDamage, requestedDamage);
    const applied = lifeDamage > 0 ? Math.max(0, -this._addLives(other, -lifeDamage, config)) : 0;
    const foodDrops = applied > 0
      ? this._dropLifeFood(other, config, applied, physics)
      : 0;
    const away = this._normalizeVector({
      x: player.x - other.x,
      y: player.y - other.y
    }, this._normalizeVector({ x: -(Number(player.vx) || 1), y: -(Number(player.vy) || 0) }));
    const bounceSpeed = Number(physics.chainsawBounceSpeed) || DEFAULT_CONFIG.weaponPhysics.chainsawBounceSpeed;
    const shove = Math.max(12, player.radius * 0.28);

    player.vx = away.x * bounceSpeed;
    player.vy = away.y * bounceSpeed;
    player.x = this._clamp(player.x + away.x * shove, player.radius, config.arenaWidth - player.radius);
    player.y = this._clamp(player.y + away.y * shove, player.radius, config.arenaHeight - player.radius);
    other.vx = (Number(other.vx) || 0) - away.x * 0.18;
    other.vy = (Number(other.vy) || 0) - away.y * 0.18;
    player.score += applied * 0.12;

    this._emitChainsawHit(player, other, 'bounce', {
      lifeDamage: applied,
      foodDrops
    });
    this._syncRadius(player, config);
    this._syncRadius(other, config);
    return true;
  }

  _dropChainsawFood(target, config, source, count, valueScale) {
    const amount = Math.max(1, Math.floor(Number(count) || 1));
    const value = Math.max(
      0.2,
      (Number(target.mass) || Number(config.baseMass) || DEFAULT_CONFIG.baseMass) *
        (Number(valueScale) || 0.35) /
        Math.max(amount, 1)
    );
    return this._spawnFoodBurst(target, amount, config, {
      source,
      value,
      radius: Math.max(3, Number(config.foodRadius) || DEFAULT_CONFIG.foodRadius),
      spread: Math.max(Number(config.deathFoodDropSpread) || DEFAULT_CONFIG.deathFoodDropSpread, target.radius * 2.8),
      ignoreCap: true
    });
  }

  _dropLifeFood(target, config, lifeDamage, physics) {
    const count = Math.max(
      1,
      Math.floor(Number(physics.chainsawLifeDropCount) || DEFAULT_CONFIG.weaponPhysics.chainsawLifeDropCount)
    );
    const beforeMass = this._livesToMass(this._ensureLives(target, config) + lifeDamage, config);
    const afterMass = this._livesToMass(this._ensureLives(target, config), config);
    const massValue = Math.max(0.25, beforeMass - afterMass);
    const spread = this._clamp(
      Number(config.lifeDropSpread) || DEFAULT_CONFIG.lifeDropSpread,
      Math.max(18, Number(config.foodRadius) * 5 || 25),
      72
    );
    return this._spawnFoodBurst(target, count, config, {
      source: 'life-drop',
      value: Math.max(0.25, massValue / Math.max(count, 1)),
      radius: Math.max(3, Number(config.foodRadius) || DEFAULT_CONFIG.foodRadius),
      spread,
      fadeOutMs: Number(config.lifeDropFadeMs) || DEFAULT_CONFIG.lifeDropFadeMs,
      motionScale: Number(config.lifeDropMotionScale) || DEFAULT_CONFIG.lifeDropMotionScale,
      ignoreCap: true
    });
  }

  _emitChainsawHit(player, other, mode, details = {}) {
    this.io.emit('arena:chainsaw-hit', {
      attacker: player.username,
      attackerNickname: player.nickname,
      target: other.username,
      targetNickname: other.nickname,
      mode,
      x: Math.round(((Number(player.x) || 0) + (Number(other.x) || 0)) * 50) / 100,
      y: Math.round(((Number(player.y) || 0) + (Number(other.y) || 0)) * 50) / 100,
      radius: Math.max(Number(player.radius) || 0, Number(other.radius) || 0),
      lifeDamage: Math.round((Number(details.lifeDamage) || 0) * 100) / 100,
      foodDrops: Math.max(0, Math.floor(Number(details.foodDrops) || 0)),
      timestamp: this.now()
    });
  }

  _playerAbsorbContext(player, other, config) {
    const physics = config.weaponPhysics || DEFAULT_CONFIG.weaponPhysics;
    const absorbOverlapRatio = Number(config.playerAbsorbOverlapRatio) || DEFAULT_CONFIG.playerAbsorbOverlapRatio;
    const hasChainsaw = player.weapon && player.weapon.type === 'chainsaw';
    const hasDash = player.weapon && player.weapon.type === 'dash';
    const playerRadius = this._radiusForAbsorb(player, config);
    const otherRadius = this._radiusForAbsorb(other, config);
    const requiredMassRatio = hasChainsaw
      ? Number(physics.chainsawRequiredMassRatio) || DEFAULT_CONFIG.weaponPhysics.chainsawRequiredMassRatio
      : hasDash
        ? Number(physics.dashRequiredMassRatio) || DEFAULT_CONFIG.weaponPhysics.dashRequiredMassRatio
        : 1.25;
    const shieldMultiplier = other.weapon && other.weapon.type === 'shield' ? 1.55 : 1;
    const baseEatRadiusRatio = Number(config.eatRadiusRatio) || DEFAULT_CONFIG.eatRadiusRatio;
    const eatRadiusRatio = hasChainsaw
      ? Math.min(baseEatRadiusRatio, 1.03)
      : hasDash
        ? Math.min(baseEatRadiusRatio, 1.08)
        : baseEatRadiusRatio;
    const radiusAdvantage = playerRadius > otherRadius * eatRadiusRatio;
    const canAbsorb = radiusAdvantage && player.mass > other.mass * requiredMassRatio * shieldMultiplier;
    const chainsawOverlapBonus = hasChainsaw
      ? Number(physics.chainsawAbsorbOverlapBonus) || DEFAULT_CONFIG.weaponPhysics.chainsawAbsorbOverlapBonus
      : 0;
    const dashOverlapBonus = hasDash
      ? Number(physics.dashAbsorbOverlapBonus) || DEFAULT_CONFIG.weaponPhysics.dashAbsorbOverlapBonus
      : 0;
    const effectiveOverlapRatio = hasChainsaw || hasDash
      ? absorbOverlapRatio
      : this._unarmedAbsorbOverlapRatio(player, config, absorbOverlapRatio);
    const lifeStealRatio = hasChainsaw
      ? Number(physics.chainsawAbsorbLifeStealRatio) || DEFAULT_CONFIG.weaponPhysics.chainsawAbsorbLifeStealRatio
      : hasDash
        ? Number(physics.dashAbsorbLifeStealRatio) || DEFAULT_CONFIG.weaponPhysics.dashAbsorbLifeStealRatio
        : Number(config.playerAbsorbLifeStealRatio) || DEFAULT_CONFIG.playerAbsorbLifeStealRatio;
    const massGainRatio = hasChainsaw
      ? Number(physics.chainsawAbsorbMassRatio) || DEFAULT_CONFIG.weaponPhysics.chainsawAbsorbMassRatio
      : Number(config.playerAbsorbMassRatio) || DEFAULT_CONFIG.playerAbsorbMassRatio;

    return {
      canAbsorb,
      absorbDistance: playerRadius + otherRadius * (effectiveOverlapRatio + chainsawOverlapBonus + dashOverlapBonus),
      lifeStealRatio,
      massGainRatio,
      weaponType: hasChainsaw ? 'chainsaw' : hasDash ? 'dash' : null
    };
  }

  _unarmedAbsorbOverlapRatio(player, config, configuredOverlapRatio) {
    const baseOverlapRatio = this._clamp(
      Number(configuredOverlapRatio) || DEFAULT_CONFIG.playerAbsorbOverlapRatio,
      0.1,
      0.9
    );
    const mass = this._clamp(
      Number(player && player.mass) || Number(config.baseMass) || DEFAULT_CONFIG.baseMass,
      Number(config.minMass) || DEFAULT_CONFIG.minMass,
      Number(config.maxMass) || DEFAULT_CONFIG.maxMass
    );
    const baseMass = Number(config.baseMass) || DEFAULT_CONFIG.baseMass;
    const maxMass = Number(config.maxMass) || DEFAULT_CONFIG.maxMass;
    const massT = mass <= baseMass ? 0 : this._clamp((mass - baseMass) / Math.max(1, maxMass - baseMass), 0, 1);
    const massDampedRatio = baseOverlapRatio * (0.18 - massT * 0.12);
    return this._clamp(massDampedRatio, 0.035, 0.14);
  }

  _radiusForAbsorb(player, config) {
    const mass = this._clamp(
      Number(player && player.mass) || Number(config.baseMass) || DEFAULT_CONFIG.baseMass,
      Number(config.minMass) || DEFAULT_CONFIG.minMass,
      Number(config.maxMass) || DEFAULT_CONFIG.maxMass
    );
    return this._clamp(Math.sqrt(mass) * 4, 10, Math.sqrt(config.maxMass) * 4.6);
  }

  _updateFever(config) {
    const now = this.now();
    if (this.fever.active && now >= this.fever.endsAt) {
      this.fever = {
        active: false,
        nextStartAt: now + config.feverIntervalMs,
        endsAt: null
      };
      this.io.emit('arena:fever-ended', { timestamp: now, nextStartAt: this.fever.nextStartAt });
      return;
    }

    if (!this.fever.active && now >= this.fever.nextStartAt) {
      this.fever = {
        active: true,
        nextStartAt: null,
        endsAt: now + config.feverDurationMs
      };
      this.io.emit('arena:fever-started', { timestamp: now, endsAt: this.fever.endsAt });
    }
  }

  _targetFoodCount(config) {
    const multiplier = this.fever.active ? config.feverFoodMultiplier : 1;
    return Math.round(config.maxFood * multiplier);
  }

  _markRespawnCooldown(player, config, reason, attacker = null) {
    const durationMs = Math.max(0, Number(config.respawnCooldownMs) || DEFAULT_CONFIG.respawnCooldownMs);
    if (!player || !player.username || durationMs <= 0) return null;

    const now = this.now();
    const existing = this.respawnCooldowns.get(player.username);
    if (existing) {
      this._clearRespawnCooldown(existing);
    }

    const identityAliases = player.identityAliases instanceof Set
      ? new Set(player.identityAliases)
      : new Set(player.identityAliases || []);
    identityAliases.add(`username:${String(player.username).toLowerCase()}`);
    identityAliases.add(`id:${String(player.username).toLowerCase()}`);

    const cooldown = {
      username: player.username,
      nickname: player.nickname || player.username,
      profilePictureUrl: player.profilePictureUrl || '',
      identityAliases,
      reason: reason || 'eliminated',
      attacker: attacker && attacker.username ? attacker.username : null,
      eliminatedAt: now,
      expiresAt: now + durationMs
    };

    this.respawnCooldowns.set(cooldown.username, cooldown);
    this._indexRespawnCooldownAliases(cooldown);
    this.io.emit('arena:respawn-cooldown', this._serializeRespawnCooldown(cooldown));
    return cooldown;
  }

  _eliminatePlayer(player, config, reason, attacker = null) {
    if (!player || !player.username) return;
    this._markRespawnCooldown(player, config, reason, attacker);
    this._removePlayer(player.username);
  }

  _resolveRespawnCooldown(viewer) {
    this._cleanupRespawnCooldowns();
    const username = this._resolveRespawnCooldownUsername(viewer);
    return username ? this.respawnCooldowns.get(username) || null : null;
  }

  _resolveRespawnCooldownUsername(viewer) {
    if (!viewer) return null;
    if (viewer.username && this.respawnCooldowns.has(viewer.username)) return viewer.username;
    for (const alias of viewer.identityAliases || []) {
      const username = this.respawnCooldownIdentityAliases.get(alias);
      if (username && this.respawnCooldowns.has(username)) return username;
    }
    return null;
  }

  _cleanupRespawnCooldowns() {
    const now = this.now();
    for (const cooldown of Array.from(this.respawnCooldowns.values())) {
      if (now >= cooldown.expiresAt) {
        this._clearRespawnCooldown(cooldown);
      }
    }
  }

  _indexRespawnCooldownAliases(cooldown) {
    if (!cooldown || !cooldown.identityAliases) return;
    for (const alias of cooldown.identityAliases) {
      this.respawnCooldownIdentityAliases.set(alias, cooldown.username);
    }
  }

  _clearRespawnCooldown(cooldown) {
    if (!cooldown) return;
    this.respawnCooldowns.delete(cooldown.username);
    for (const alias of cooldown.identityAliases || []) {
      if (this.respawnCooldownIdentityAliases.get(alias) === cooldown.username) {
        this.respawnCooldownIdentityAliases.delete(alias);
      }
    }
  }

  _serializeRespawnCooldown(cooldown) {
    return {
      username: cooldown.username,
      nickname: cooldown.nickname,
      profilePictureUrl: cooldown.profilePictureUrl,
      profilePictureProxyUrl: this._avatarProxyUrl(cooldown.profilePictureUrl || ''),
      reason: cooldown.reason,
      attacker: cooldown.attacker,
      eliminatedAt: cooldown.eliminatedAt,
      respawnsAt: cooldown.expiresAt,
      remainingMs: Math.max(0, cooldown.expiresAt - this.now())
    };
  }

  _respawnCooldownResponse(cooldown) {
    return {
      success: false,
      cooldown: true,
      username: cooldown.username,
      respawnsAt: cooldown.expiresAt,
      remainingMs: Math.max(0, cooldown.expiresAt - this.now()),
      reason: cooldown.reason
    };
  }

  _spawnGiftRespawn(viewer, weapon, data, giftName, config, now = this.now()) {
    const baseLives = this._clamp(
      Number(config.spawnBaseLives) || DEFAULT_CONFIG.spawnBaseLives,
      config.minLives,
      config.maxLives
    );
    const currentMass = this._livesToMass(baseLives, config);
    const giftLifeGain = this._giftLifeGain(data, config);
    const growthLifeGain = this._massDeltaToLifeDelta(currentMass, weapon.growthBonus, config);
    const lives = this._clamp(baseLives + giftLifeGain + growthLifeGain, config.minLives, config.maxLives);
    const weaponDefinition = {
      type: weapon.weaponType,
      tier: weapon.tier,
      power: weapon.power,
      sourceGift: giftName,
      durationMs: weapon.durationMs
    };

    return this._getOrCreatePlayer(viewer, config, {
      lives,
      energy: this._clamp((Number(config.baseEnergy) || DEFAULT_CONFIG.baseEnergy) + weapon.power * 4, 0, config.maxEnergy),
      score: Math.max(0, giftLifeGain),
      extraLives: this._pendingGiftExtraLives(weapon, data, config),
      weaponDefinition,
      spawnedAt: now,
      lastActivityAt: now
    });
  }

  _queuePendingSpawn(viewer, config) {
    const existing = this._resolvePendingSpawn(viewer);
    if (existing) {
      this._refreshPendingSpawnIdentity(existing, viewer);
      return existing;
    }

    const now = this.now();
    const pending = {
      username: viewer.username,
      nickname: viewer.nickname || viewer.username,
      profilePictureUrl: viewer.profilePictureUrl || '',
      identityAliases: new Set(viewer.identityAliases || []),
      lives: this._randomizedSpawnLives(config),
      energy: Number(config.baseEnergy) || DEFAULT_CONFIG.baseEnergy,
      score: 0,
      extraLives: 0,
      weaponDefinition: null,
      createdAt: now,
      lastActivityAt: now,
      spawnsAt: now + (Number(config.spawnDelayMs) || DEFAULT_CONFIG.spawnDelayMs)
    };
    this.pendingSpawns.set(pending.username, pending);
    this._indexPendingSpawnAliases(pending);
    this.io.emit('arena:player-spawn-pending', this._serializePendingSpawn(pending));
    return pending;
  }

  _resolvePendingSpawn(viewer) {
    const username = this._resolvePendingSpawnUsername(viewer);
    return username ? this.pendingSpawns.get(username) || null : null;
  }

  _resolvePendingSpawnUsername(viewer) {
    if (!viewer) return null;
    if (viewer.username && this.pendingSpawns.has(viewer.username)) return viewer.username;
    for (const alias of viewer.identityAliases || []) {
      const username = this.pendingSpawnIdentityAliases.get(alias);
      if (username && this.pendingSpawns.has(username)) return username;
    }
    return null;
  }

  _refreshPendingSpawnIdentity(pending, viewer) {
    if (!pending || !viewer) return;
    this._removePendingSpawnAliases(pending);
    pending.nickname = viewer.nickname || pending.nickname || pending.username;
    pending.profilePictureUrl = viewer.profilePictureUrl || pending.profilePictureUrl || '';
    pending.identityAliases = new Set([
      ...(pending.identityAliases ? Array.from(pending.identityAliases) : []),
      ...(viewer.identityAliases || [])
    ]);
    this._indexPendingSpawnAliases(pending);
  }

  _indexPendingSpawnAliases(pending) {
    if (!pending || !pending.identityAliases) return;
    for (const alias of pending.identityAliases) {
      this.pendingSpawnIdentityAliases.set(alias, pending.username);
    }
  }

  _removePendingSpawnAliases(pending) {
    if (!pending || !pending.identityAliases) return;
    for (const alias of pending.identityAliases) {
      if (this.pendingSpawnIdentityAliases.get(alias) === pending.username) {
        this.pendingSpawnIdentityAliases.delete(alias);
      }
    }
  }

  _serializePendingSpawn(pending) {
    return {
      username: pending.username,
      nickname: pending.nickname,
      profilePictureUrl: pending.profilePictureUrl,
      profilePictureProxyUrl: this._avatarProxyUrl(pending.profilePictureUrl || ''),
      lives: Math.round((Number(pending.lives) || 0) * 100) / 100,
      extraLives: Math.max(0, Math.floor(Number(pending.extraLives) || 0)),
      weapon: pending.weaponDefinition ? { ...pending.weaponDefinition } : null,
      createdAt: pending.createdAt,
      spawnsAt: pending.spawnsAt,
      lastActivityAt: pending.lastActivityAt
    };
  }

  _randomizedSpawnLives(config) {
    const baseLives = Number(config.spawnBaseLives) || DEFAULT_CONFIG.spawnBaseLives;
    const lowFactor = this._clamp(
      Number(config.spawnLifeMinFactor) || DEFAULT_CONFIG.spawnLifeMinFactor,
      0.15,
      1
    );
    const highFactor = Math.max(
      1,
      Number(config.spawnLifeMaxFactor) || DEFAULT_CONFIG.spawnLifeMaxFactor
    );
    const roll = this._clamp(this.random(), 0, 1);
    const factor = roll <= 0.5
      ? lowFactor + Math.pow(roll / 0.5, 0.85) * (1 - lowFactor)
      : 1 + Math.pow((roll - 0.5) / 0.5, 1.25) * (highFactor - 1);
    const cap = this._spawnLeaderboardLifeCap(config);
    return this._clamp(Math.min(baseLives * factor, cap), config.minLives, config.maxLives);
  }

  _spawnLeaderboardLifeCap(config) {
    const players = Array.from(this.players.values());
    if (players.length < 10) return Number(config.maxLives) || DEFAULT_CONFIG.maxLives;

    const topTen = players
      .map(player => this._ensureLives(player, config))
      .sort((a, b) => b - a)
      .slice(0, 10);
    const floor = topTen[9];
    if (!Number.isFinite(floor)) return Number(config.maxLives) || DEFAULT_CONFIG.maxLives;

    const ratio = this._clamp(
      Number(config.spawnTopTenCapRatio) || DEFAULT_CONFIG.spawnTopTenCapRatio,
      0.5,
      0.98
    );
    return Math.max(Number(config.minLives) || DEFAULT_CONFIG.minLives, floor * ratio);
  }

  _applyPendingSpawnGift(pending, viewer, weapon, data, giftName, config) {
    this._refreshPendingSpawnIdentity(pending, viewer);
    const currentMass = this._livesToMass(pending.lives, config);
    const giftLifeGain = this._giftLifeGain(data, config);
    const growthLifeGain = this._massDeltaToLifeDelta(currentMass, weapon.growthBonus, config);
    pending.lives = this._clamp(pending.lives + giftLifeGain + growthLifeGain, config.minLives, config.maxLives);
    pending.energy = this._clamp(
      (Number(pending.energy) || Number(config.baseEnergy) || DEFAULT_CONFIG.baseEnergy) + weapon.power * 4,
      0,
      config.maxEnergy
    );
    pending.score += Math.max(0, giftLifeGain);
    pending.lastActivityAt = this.now();

    const weaponDefinition = {
      type: weapon.weaponType,
      tier: weapon.tier,
      power: weapon.power,
      sourceGift: giftName,
      durationMs: weapon.durationMs
    };
    const currentUtility = pending.weaponDefinition
      ? this._weaponUtility(pending.weaponDefinition.type, pending.weaponDefinition.power)
      : 0;
    const nextUtility = this._weaponUtility(weaponDefinition.type, weaponDefinition.power);
    if (!pending.weaponDefinition || nextUtility >= currentUtility) {
      pending.weaponDefinition = weaponDefinition;
    }

    const extraLives = this._pendingGiftExtraLives(weapon, data, config);
    if (extraLives > 0) {
      pending.extraLives = Math.min(20, Math.max(0, Number(pending.extraLives) || 0) + extraLives);
    }

    this.io.emit('arena:player-spawn-pending-updated', this._serializePendingSpawn(pending));
  }

  _pendingGiftExtraLives(weapon, data, config) {
    const configuredLives = Math.max(0, Number(weapon && weapon.extraLives) || 0);
    if (!configuredLives) return 0;

    const repeatCount = Math.min(Math.max(Number(data && data.repeatCount) || 1, 1), 5);
    const extraLifeValue = Math.max(0, Number(config.giftExtraLifeValue) || DEFAULT_CONFIG.giftExtraLifeValue);
    return Math.floor(configuredLives * repeatCount * extraLifeValue);
  }

  _materializePendingSpawns(config) {
    const now = this.now();
    for (const pending of Array.from(this.pendingSpawns.values())) {
      if (now < pending.spawnsAt) continue;
      this._removePendingSpawnAliases(pending);
      this.pendingSpawns.delete(pending.username);
      if (!this._isSpawnableProfilePictureUrl(pending.profilePictureUrl)) {
        this.io.emit('arena:player-spawn-skipped', {
          username: pending.username,
          nickname: pending.nickname,
          reason: 'missing-profile-picture',
          timestamp: now
        });
        continue;
      }
      const existingUsername = this._resolvePlayerUsername(pending);
      if (existingUsername) {
        const player = this.players.get(existingUsername);
        if (player) {
          this._addLives(player, Math.max(0, pending.lives - config.minLives), config);
          player.energy = this._clamp(player.energy + pending.energy * 0.35, 0, config.maxEnergy);
          continue;
        }
      }
      const player = this._getOrCreatePlayer(pending, config, {
        lives: pending.lives,
        energy: pending.energy,
        score: pending.score,
        extraLives: pending.extraLives,
        weaponDefinition: pending.weaponDefinition,
        spawnedAt: now,
        spawnProtection: true,
        lastActivityAt: now
      });
      this.io.emit('arena:player-spawned-from-pending', {
        username: player.username,
        nickname: player.nickname,
        lives: player.lives,
        mass: player.mass,
        timestamp: now
      });
      if (player.weapon) {
        this.io.emit('arena:weapon-activated', {
          username: player.username,
          nickname: player.nickname,
          weapon: player.weapon,
          timestamp: now
        });
      }
    }
  }

  _getOrCreatePlayer(viewer, config, spawnOptions = {}) {
    const existingUsername = this._resolvePlayerUsername(viewer);
    let player = existingUsername ? this.players.get(existingUsername) : null;
    if (player) {
      this._refreshPlayerIdentity(player, viewer);
      return player;
    }

    if (!this._isSpawnableProfilePictureUrl(viewer && viewer.profilePictureUrl)) {
      return null;
    }

    if (this.players.size >= config.maxPlayers) {
      const lowest = Array.from(this.players.values()).sort((a, b) => a.mass - b.mass)[0];
      if (lowest) this._removePlayer(lowest.username);
    }

    const lives = Number.isFinite(Number(spawnOptions.lives))
      ? Number(spawnOptions.lives)
      : config.baseLives;
    const personality = this._personalityForUsername(viewer.username, config);
    const spawn = this._selectSpawnPoint(config, personality, { lives });
    const now = this.now();
    player = {
      username: viewer.username,
      nickname: viewer.nickname || viewer.username,
      profilePictureUrl: viewer.profilePictureUrl || '',
      x: spawn.x,
      y: spawn.y,
      vx: spawn.vx,
      vy: spawn.vy,
      radius: 16,
      mass: config.baseMass,
      lives,
      energy: Number.isFinite(Number(spawnOptions.energy)) ? Number(spawnOptions.energy) : config.baseEnergy,
      score: Number(spawnOptions.score) || 0,
      kills: 0,
      color: this._colorForUsername(viewer.username),
      weapon: spawnOptions.weaponDefinition ? this._createWeapon(spawnOptions.weaponDefinition, now) : null,
      extraLives: Math.max(0, Math.floor(Number(spawnOptions.extraLives) || 0)),
      identityAliases: new Set(),
      effects: {},
      abilities: {
        boost: { availableAt: now + config.abilityChargeMs, activeUntil: 0 },
        shield: { availableAt: now + config.abilityChargeMs, activeUntil: 0 }
      },
      bombCooldownUntil: 0,
      personality,
      behaviorMemory: null,
      aiStateMemory: null,
      wanderVector: null,
      spawnedAt: Number(spawnOptions.spawnedAt) || now,
      spawnProtectedUntil: spawnOptions.spawnProtection
        ? now + this._spawnProtectionMs(config)
        : Number(spawnOptions.spawnProtectedUntil) || null,
      lastActivityAt: Number(spawnOptions.lastActivityAt) || now
    };
    this._refreshPlayerIdentity(player, viewer);
    this._syncRadius(player, config);
    this.players.set(player.username, player);
    this._indexPlayerIdentityAliases(player);
    this.io.emit('arena:player-spawned', this._serializePlayer(player, config));
    return player;
  }

  _selectSpawnPoint(config, personality, spawnOptions = {}) {
    const attempts = Math.max(1, Math.floor(Number(config.spawnSafetyAttempts) || DEFAULT_CONFIG.spawnSafetyAttempts));
    const probe = this._spawnProbe(config, personality, spawnOptions);
    let best = null;

    for (let i = 0; i < attempts; i++) {
      const candidate = this._randomSpawnCandidate(config, probe.radius);
      probe.x = candidate.x;
      probe.y = candidate.y;

      const assessment = this._assessSpawnPoint(probe, config);
      if (!best || assessment.score > best.assessment.score) {
        best = { ...candidate, assessment };
      }
      if (assessment.safe && assessment.score >= 1) {
        best = { ...candidate, assessment };
        break;
      }
    }

    for (const candidate of this._strategicSpawnCandidates(config, probe)) {
      probe.x = candidate.x;
      probe.y = candidate.y;

      const assessment = this._assessSpawnPoint(probe, config);
      if (!best || assessment.score > best.assessment.score) {
        best = { ...candidate, assessment };
      }
      if (assessment.safe && assessment.score >= 1) {
        best = { ...candidate, assessment };
        break;
      }
    }

    const point = best || this._randomSpawnCandidate(config, probe.radius);
    probe.x = point.x;
    probe.y = point.y;
    const escape = this._spawnEscapeVector(probe, config);
    const velocity = this._vectorLength(escape) > 0.001
      ? escape
      : this._randomUnitVector();

    return {
      x: point.x,
      y: point.y,
      vx: velocity.x,
      vy: velocity.y
    };
  }

  _spawnProbe(config, personality, spawnOptions = {}) {
    const lives = Number.isFinite(Number(spawnOptions.lives))
      ? Number(spawnOptions.lives)
      : Number(config.baseLives) || DEFAULT_CONFIG.baseLives;
    const player = {
      username: '__spawn_probe__',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 16,
      mass: Number(config.baseMass) || DEFAULT_CONFIG.baseMass,
      lives,
      personality: personality || this._normalizePersonality()
    };
    this._syncRadius(player, config);
    return player;
  }

  _strategicSpawnCandidates(config, probe) {
    const movement = config.movement || DEFAULT_CONFIG.movement;
    const padding = Math.max(
      probe.radius + 18,
      Number(config.spawnEdgePadding) || DEFAULT_CONFIG.spawnEdgePadding,
      (Number(movement.boundaryAvoidanceDistance) || DEFAULT_CONFIG.movement.boundaryAvoidanceDistance) * 0.9
    );
    const minX = Math.min(Math.max(probe.radius, padding), config.arenaWidth / 2);
    const maxX = Math.max(minX, config.arenaWidth - minX);
    const minY = Math.min(Math.max(probe.radius, padding), config.arenaHeight / 2);
    const maxY = Math.max(minY, config.arenaHeight - minY);
    const clampPoint = (x, y) => ({
      x: this._clamp(x, minX, maxX),
      y: this._clamp(y, minY, maxY),
      radius: probe.radius
    });
    const candidates = [
      clampPoint(minX, minY),
      clampPoint(maxX, minY),
      clampPoint(minX, maxY),
      clampPoint(maxX, maxY),
      clampPoint(config.arenaWidth / 2, minY),
      clampPoint(config.arenaWidth / 2, maxY),
      clampPoint(minX, config.arenaHeight / 2),
      clampPoint(maxX, config.arenaHeight / 2)
    ];

    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
      { x: 0.707, y: 0.707 },
      { x: -0.707, y: 0.707 },
      { x: 0.707, y: -0.707 },
      { x: -0.707, y: -0.707 }
    ];

    for (const other of this.players.values()) {
      if ((Number(other.mass) || 0) <= (Number(probe.mass) || 0) * this._effectiveFleeMassRatio(probe, movement)) {
        continue;
      }

      const clearance = this._spawnThreatRadius(probe, other, movement, config) * 1.08;
      for (const direction of directions) {
        candidates.push(clampPoint(
          (Number(other.x) || config.arenaWidth / 2) + direction.x * clearance,
          (Number(other.y) || config.arenaHeight / 2) + direction.y * clearance
        ));
      }
    }

    const seen = new Set();
    return candidates.filter(candidate => {
      const key = `${Math.round(candidate.x)}:${Math.round(candidate.y)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  _randomSpawnCandidate(config, radius) {
    const movement = config.movement || DEFAULT_CONFIG.movement;
    const padding = Math.max(
      radius + 18,
      Number(config.spawnEdgePadding) || DEFAULT_CONFIG.spawnEdgePadding,
      (Number(movement.boundaryAvoidanceDistance) || DEFAULT_CONFIG.movement.boundaryAvoidanceDistance) * 0.9
    );

    return {
      x: this._spawnCoordinate(config.arenaWidth, radius, padding),
      y: this._spawnCoordinate(config.arenaHeight, radius, padding),
      radius
    };
  }

  _spawnCoordinate(size, radius, padding) {
    const center = size / 2;
    const edge = Math.min(
      Math.max(Number(radius) || 0, Number(padding) || 0),
      Math.max(Number(radius) || 0, center)
    );
    const min = edge;
    const max = Math.max(min, size - edge);
    if (max <= min) return center;
    return this._clamp(this.random() * size, min, max);
  }

  _assessSpawnPoint(player, config) {
    const movement = config.movement || DEFAULT_CONFIG.movement;
    const boundaryMargin = Math.max(
      player.radius + 24,
      Number(config.spawnEdgePadding) || DEFAULT_CONFIG.spawnEdgePadding,
      Number(movement.boundaryAvoidanceDistance) || DEFAULT_CONFIG.movement.boundaryAvoidanceDistance
    );
    let score = this._boundarySafetyScore(player, config, boundaryMargin) * 2;
    let safe = score > 0.35;
    const searchRadius = Math.max(
      (Number(movement.fleeDistance) || DEFAULT_CONFIG.movement.fleeDistance) * 2.2,
      boundaryMargin * 2
    ) + player.radius * 2;

    for (const other of this._nearbyPlayers(player, searchRadius)) {
      if (other.username === player.username) continue;
      const distance = Math.max(0.1, this._distance(player, other));
      const collisionRadius = player.radius + other.radius + 18;

      if (distance < collisionRadius) {
        const collisionCloseness = 1 - distance / Math.max(collisionRadius, 1);
        score -= 9 + collisionCloseness * 10;
        safe = false;
      }

      if ((Number(other.mass) || 0) <= (Number(player.mass) || 0) * this._effectiveFleeMassRatio(player, movement)) {
        const spacingRadius = Math.max(collisionRadius, player.radius * 3.5);
        if (distance < spacingRadius) {
          score -= (1 - distance / Math.max(spacingRadius, 1)) * 1.5;
        }
        continue;
      }

      const threatRadius = this._spawnThreatRadius(player, other, movement, config);
      const massRatio = (Number(other.mass) || 1) / Math.max(Number(player.mass) || 1, 1);
      if (distance < threatRadius) {
        const closeness = 1 - distance / Math.max(threatRadius, 1);
        score -= 5 + closeness * this._clamp(massRatio, 1, 6) * 5;
        safe = false;
      } else {
        score += Math.min(1.4, distance / Math.max(threatRadius, 1) - 1) * 0.6;
      }
    }

    return { safe, score };
  }

  _spawnThreatRadius(player, threat, movement, config) {
    const ratio = Math.max(0.65, Number(config.spawnThreatClearanceRatio) || DEFAULT_CONFIG.spawnThreatClearanceRatio);
    return this._dynamicFleeDistance(player, threat, movement, config) * ratio +
      (Number(threat.radius) || 0) +
      (Number(player.radius) || 0) * 0.45;
  }

  _spawnEscapeVector(player, config) {
    const movement = config.movement || DEFAULT_CONFIG.movement;
    const vector = { x: 0, y: 0 };
    const searchRadius = (Number(movement.fleeDistance) || DEFAULT_CONFIG.movement.fleeDistance) * 2.5 +
      player.radius * 2;

    for (const other of this._nearbyPlayers(player, searchRadius)) {
      if (other.username === player.username) continue;
      if ((Number(other.mass) || 0) <= (Number(player.mass) || 0) * this._effectiveFleeMassRatio(player, movement)) {
        continue;
      }

      const distance = Math.max(0.1, this._distance(player, other));
      const comfortRadius = this._spawnThreatRadius(player, other, movement, config) * 1.28;
      if (distance > comfortRadius) continue;

      const away = this._normalizeVector({
        x: player.x - other.x,
        y: player.y - other.y
      }, this._openArenaVector(player, config));
      const massRatio = (Number(other.mass) || 1) / Math.max(Number(player.mass) || 1, 1);
      const closeness = 1 - Math.min(1, distance / Math.max(comfortRadius, 1));
      const weight = Math.max(0.2, closeness) * this._clamp(massRatio, 1, 4);
      vector.x += away.x * weight;
      vector.y += away.y * weight;
    }

    const boundary = this._boundaryAvoidanceVector(player, config);
    if (boundary.x || boundary.y) {
      vector.x += boundary.x * 0.85;
      vector.y += boundary.y * 0.85;
    }

    return this._normalizeVector(vector, { x: 0, y: 0 });
  }

  _openArenaVector(player, config) {
    return this._normalizeVector({
      x: config.arenaWidth / 2 - player.x,
      y: config.arenaHeight / 2 - player.y
    }, { x: 1, y: 0 });
  }

  _randomUnitVector() {
    const angle = this.random() * Math.PI * 2;
    return {
      x: Math.cos(angle),
      y: Math.sin(angle)
    };
  }

  _resolvePlayerUsername(viewer) {
    if (viewer.username && this.players.has(viewer.username)) {
      return viewer.username;
    }

    for (const alias of viewer.identityAliases || []) {
      const username = this.playerIdentityAliases.get(alias);
      if (!username) continue;
      if (this.players.has(username)) return username;
      this.playerIdentityAliases.delete(alias);
    }
    return null;
  }

  _refreshPlayerIdentity(player, viewer) {
    player.nickname = viewer.nickname || player.nickname;
    player.profilePictureUrl = viewer.profilePictureUrl || player.profilePictureUrl;
    if (!(player.identityAliases instanceof Set)) {
      player.identityAliases = new Set(player.identityAliases || []);
    }
    for (const alias of viewer.identityAliases || []) {
      player.identityAliases.add(alias);
    }
    this._indexPlayerIdentityAliases(player);
  }

  _indexPlayerIdentityAliases(player) {
    if (!player || !(player.identityAliases instanceof Set)) return;
    for (const alias of player.identityAliases) {
      this.playerIdentityAliases.set(alias, player.username);
    }
  }

  _removePlayer(username) {
    const player = this.players.get(username);
    this.players.delete(username);
    if (!player || !(player.identityAliases instanceof Set)) return;
    for (const alias of player.identityAliases) {
      if (this.playerIdentityAliases.get(alias) === username) {
        this.playerIdentityAliases.delete(alias);
      }
    }
  }

  _applyActivity(player, activityType, config, multiplier = 1, data = {}) {
    const weight = config.activityWeights[activityType] || config.activityWeights.chat;
    player.energy = this._clamp(
      player.energy + weight.energy * multiplier,
      0,
      config.maxEnergy
    );
    const lifeGain = this._activityLifeGain(player, data, activityType, config, multiplier, weight);
    const addedLives = this._addLives(player, lifeGain, config);
    player.score += Math.max(0, addedLives);
    player.lastActivityAt = this.now();

    if (activityType === 'like') {
      const likeCount = Math.min(
        Math.max(Number(data && (data.likeCount || data.count)) || multiplier || 1, 1),
        Number(config.maxLikeLifeBatch) || DEFAULT_CONFIG.maxLikeLifeBatch
      );
      this._applyStreamActivityBoost(player, 'like', likeCount, config);
      const interval = Math.max(1, Number(config.likeFoodSpawnInterval) || DEFAULT_CONFIG.likeFoodSpawnInterval);
      const burstCount = Math.min(
        Number(config.maxFoodBurstPerEvent) || DEFAULT_CONFIG.maxFoodBurstPerEvent,
        Math.floor(likeCount / interval)
      );
      if (burstCount > 0) {
        this._spawnFoodBurst(player, burstCount, config, {
          source: 'like',
          value: Number(config.likeFoodValue) || DEFAULT_CONFIG.likeFoodValue,
          radius: Math.max(3, Number(config.foodRadius) || DEFAULT_CONFIG.foodRadius),
          spread: Math.max(40, player.radius * 3)
        });
      }
    } else if (activityType === 'gift') {
      this._applyStreamActivityBoost(player, 'gift', this._giftLifeGain(data, config), config);
    }

  }

  _activityMultiplier(data, activityType) {
    if (activityType === 'like') {
      return Math.min(Math.max(Number(data && (data.likeCount || data.count)) || 1, 1), 50);
    }
    if (activityType === 'gift') {
      return Math.min(Math.max(Number(data && data.repeatCount) || 1, 1), 50);
    }
    return 1;
  }

  _activityLifeGain(player, data, activityType, config, multiplier, weight) {
    if (activityType === 'like') {
      const count = Math.min(
        Math.max(Number(data && (data.likeCount || data.count)) || multiplier || 1, 1),
        Number(config.maxLikeLifeBatch) || DEFAULT_CONFIG.maxLikeLifeBatch
      );
      return this._capLikeLifeGain(
        player,
        count * (Number(config.likeLifeValue) || DEFAULT_CONFIG.likeLifeValue),
        config
      );
    }

    if (activityType === 'gift') {
      return this._giftLifeGain(data, config);
    }

    if (Number.isFinite(Number(weight.lives))) {
      return Number(weight.lives) * multiplier;
    }

    return this._massDeltaToLifeDelta(config.baseMass, (Number(weight.mass) || 0) * multiplier, config);
  }

  _capLikeLifeGain(player, rawLifeGain, config) {
    const lifeGain = Math.max(0, Number(rawLifeGain) || 0);
    if (!lifeGain || !player) return 0;

    const configuredMaxMass = Number(config.likeGrowthMaxMass);
    const likeGrowthMaxMass = Number.isFinite(configuredMaxMass)
      ? configuredMaxMass
      : DEFAULT_CONFIG.likeGrowthMaxMass;
    if (likeGrowthMaxMass <= 0) return 0;

    const targetMass = this._clamp(likeGrowthMaxMass, config.minMass, config.maxMass);
    const targetLives = this._massToLives(targetMass, config);
    const currentLives = this._ensureLives(player, config);
    if (currentLives >= targetLives) return 0;

    return Math.min(lifeGain, targetLives - currentLives);
  }

  _giftLifeGain(data, config) {
    const repeatCount = Math.min(Math.max(Number(data && data.repeatCount) || 1, 1), 50);
    const coinValue = Math.max(0, Number(data && (data.diamondCount || data.giftValue || data.diamondValue || data.cost)) || 1);
    const lives = coinValue * repeatCount * (Number(config.giftLifePerCoin) || DEFAULT_CONFIG.giftLifePerCoin);
    return Math.min(lives, Number(config.maxGiftLifeBatch) || DEFAULT_CONFIG.maxGiftLifeBatch);
  }

  _createWeapon(definition, now = this.now()) {
    const durationMs = Number(definition.durationMs) || 6000;
    return {
      type: definition.type || definition.weaponType || 'speed',
      tier: definition.tier || 'pickup',
      power: Number(definition.power) || 1,
      sourceGift: definition.sourceGift || 'Arena Pickup',
      startedAt: now,
      expiresAt: now + durationMs
    };
  }

  _pickWeaponDefinition(definitions = []) {
    const fallback = DEFAULT_CONFIG.weaponPickupTypes[0];
    const pool = Array.isArray(definitions) && definitions.length ? definitions : [fallback];
    const totalWeight = pool.reduce((sum, item) => sum + (Number(item.weight) || 1), 0);
    let cursor = this.random() * totalWeight;
    for (const item of pool) {
      cursor -= Number(item.weight) || 1;
      if (cursor <= 0) {
        return item;
      }
    }
    return pool[pool.length - 1] || fallback;
  }

  _pickWeaponType(types, fallback) {
    if (!Array.isArray(types) || !types.length) return fallback;
    const index = Math.min(types.length - 1, Math.floor(this.random() * types.length));
    return types[index] || fallback;
  }

  _resolveGiftWeapon(data, config) {
    const giftName = data.giftName ? String(data.giftName).trim() : '';
    const giftId = data.giftId !== undefined && data.giftId !== null ? String(data.giftId).trim() : '';
    const mapping = this._findGiftMapping(giftId, giftName, config.giftWeaponMappings);
    const tier = mapping && mapping.tier ? mapping.tier : this._tierFromGiftValue(data, config);
    const tierDefaults = config.giftTiers[tier] || config.giftTiers.small;
    const defaultWeaponType = this._pickWeaponType(tierDefaults.weaponTypes, tierDefaults.weaponType);

    return {
      tier,
      weaponType: mapping && mapping.weaponType ? mapping.weaponType : defaultWeaponType,
      power: this._finiteOrDefault(mapping && mapping.power, tierDefaults.power),
      durationMs: this._finiteOrDefault(mapping && mapping.durationMs, tierDefaults.durationMs),
      growthBonus: this._finiteOrDefault(mapping && mapping.growthBonus, tierDefaults.growthBonus),
      extraLives: this._finiteOrDefault(mapping && mapping.extraLives, 0)
    };
  }

  _applyGiftExtraLives(player, weapon, data, config) {
    const configuredLives = Math.max(0, Number(weapon && weapon.extraLives) || 0);
    if (!configuredLives) return 0;

    const repeatCount = Math.min(Math.max(Number(data && data.repeatCount) || 1, 1), 5);
    const extraLifeValue = Math.max(0, Number(config.giftExtraLifeValue) || DEFAULT_CONFIG.giftExtraLifeValue);
    const granted = Math.floor(configuredLives * repeatCount * extraLifeValue);
    if (granted <= 0) return 0;

    player.extraLives = Math.min(20, Math.max(0, Number(player.extraLives) || 0) + granted);
    this.io.emit('arena:extra-lives-granted', {
      username: player.username,
      nickname: player.nickname,
      extraLives: player.extraLives,
      granted,
      sourceGift: data && data.giftName ? String(data.giftName) : 'Gift',
      timestamp: this.now()
    });
    return granted;
  }

  _applyStreamActivityBoost(player, activityType, intensity) {
    if (!player) return null;
    const now = this.now();
    if (!player.effects || typeof player.effects !== 'object') {
      player.effects = {};
    }

    const kind = activityType === 'gift' ? 'gift' : 'like';
    const value = Math.max(1, Number(intensity) || 1);
    const baseDurationMs = kind === 'gift' ? 4200 : 2200;
    const maxDurationMs = kind === 'gift' ? 12000 : 6400;
    const durationMs = Math.round(this._clamp(
      baseDurationMs + Math.log1p(value) * (kind === 'gift' ? 480 : 260),
      baseDurationMs,
      maxDurationMs
    ));
    const speedMultiplier = this._clamp(
      1 + Math.log1p(value) * (kind === 'gift' ? 0.024 : 0.016),
      kind === 'gift' ? 1.08 : 1.04,
      kind === 'gift' ? 1.22 : 1.13
    );
    const aggressionBoost = this._clamp(
      (kind === 'gift' ? 0.11 : 0.05) + Math.log1p(value) * (kind === 'gift' ? 0.012 : 0.007),
      0.05,
      kind === 'gift' ? 0.24 : 0.14
    );
    const foodFocusBoost = this._clamp(
      (kind === 'gift' ? 0.07 : 0.06) + Math.log1p(value) * (kind === 'gift' ? 0.008 : 0.006),
      0.04,
      kind === 'gift' ? 0.18 : 0.14
    );
    const weaponFocusBoost = this._clamp(
      (kind === 'gift' ? 0.12 : 0.03) + Math.log1p(value) * (kind === 'gift' ? 0.009 : 0.004),
      0.03,
      kind === 'gift' ? 0.24 : 0.08
    );
    const commitmentBoost = this._clamp(
      (kind === 'gift' ? 0.06 : 0.03) + Math.log1p(value) * (kind === 'gift' ? 0.006 : 0.003),
      0.02,
      kind === 'gift' ? 0.16 : 0.08
    );
    const riskToleranceBoost = this._clamp(
      (kind === 'gift' ? 0.08 : 0.03) + Math.log1p(value) * (kind === 'gift' ? 0.007 : 0.004),
      0.02,
      kind === 'gift' ? 0.18 : 0.09
    );

    player.effects.streamBoostUntil = Math.max(Number(player.effects.streamBoostUntil) || 0, now + durationMs);
    player.effects.streamBoostKind = kind;
    player.effects.streamBoostMultiplier = Math.max(Number(player.effects.streamBoostMultiplier) || 1, speedMultiplier);
    player.effects.streamAggressionBoost = Math.max(Number(player.effects.streamAggressionBoost) || 0, aggressionBoost);
    player.effects.streamFoodFocusBoost = Math.max(Number(player.effects.streamFoodFocusBoost) || 0, foodFocusBoost);
    player.effects.streamWeaponFocusBoost = Math.max(Number(player.effects.streamWeaponFocusBoost) || 0, weaponFocusBoost);
    player.effects.streamCommitmentBoost = Math.max(Number(player.effects.streamCommitmentBoost) || 0, commitmentBoost);
    player.effects.streamRiskToleranceBoost = Math.max(Number(player.effects.streamRiskToleranceBoost) || 0, riskToleranceBoost);

    this._emitStreamSurge(player, kind, value, {
      durationMs: kind === 'gift' ? 760 : 520,
      speedMultiplier
    });

    return {
      kind,
      durationMs,
      speedMultiplier,
      aggressionBoost,
      foodFocusBoost,
      weaponFocusBoost,
      commitmentBoost,
      riskToleranceBoost
    };
  }

  _emitStreamSurge(player, kind, intensity, options = {}) {
    if (!player) return;
    const durationMs = Math.max(240, Number(options.durationMs) || 520);
    const speedMultiplier = this._clamp(Number(options.speedMultiplier) || 1, 1, 1.35);
    this.io.emit('arena:stream-surge', {
      username: player.username,
      nickname: player.nickname,
      kind,
      intensity: Math.round(Math.max(1, Number(intensity) || 1)),
      x: Math.round((Number(player.x) || 0) * 100) / 100,
      y: Math.round((Number(player.y) || 0) * 100) / 100,
      radius: Math.round(Math.max(16, (Number(player.radius) || 16) * (kind === 'gift' ? 1.45 : 1.2)) * 100) / 100,
      speedMultiplier: Math.round(speedMultiplier * 1000) / 1000,
      durationMs,
      timestamp: this.now()
    });
  }

  _finiteOrDefault(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  _findGiftMapping(giftId, giftName, mappings = {}) {
    if (giftId && mappings[giftId]) return mappings[giftId];
    if (giftName && mappings[giftName]) return mappings[giftName];
    const lowerGiftName = giftName.toLowerCase();
    if (!lowerGiftName) return null;
    return Object.entries(mappings).find(([key, mapping]) => {
      if (key.toLowerCase() === lowerGiftName) return true;
      return mapping &&
        typeof mapping === 'object' &&
        String(mapping.giftName || '').trim().toLowerCase() === lowerGiftName;
    })?.[1] || null;
  }

  _tierFromGiftValue(data, config) {
    const repeatCount = Math.min(Math.max(Number(data.repeatCount) || 1, 1), 50);
    const diamondValue = Number(data.diamondCount || data.giftValue || data.diamondValue || data.cost || 1);
    const totalValue = diamondValue * repeatCount;
    const tiers = Object.entries(config.giftTiers)
      .sort((a, b) => b[1].minValue - a[1].minValue);
    const match = tiers.find(([, tierConfig]) => totalValue >= tierConfig.minValue);
    return match ? match[0] : 'small';
  }

  _buildSpatialIndex(config) {
    const movement = config.movement || DEFAULT_CONFIG.movement;
    const maxSense = Math.max(
      Number(movement.fleeDistance) || DEFAULT_CONFIG.movement.fleeDistance,
      Number(movement.huntDistance) || DEFAULT_CONFIG.movement.huntDistance,
      Number(movement.foodSenseDistance) || DEFAULT_CONFIG.movement.foodSenseDistance,
      Number(movement.weaponSenseDistance) || DEFAULT_CONFIG.movement.weaponSenseDistance
    );
    const cellSize = Math.max(96, Math.min(360, maxSense / 2));
    const index = {
      cellSize,
      players: new Map(),
      food: new Map(),
      weapons: new Map()
    };

    for (const player of this.players.values()) {
      this._spatialInsert(index.players, cellSize, player);
    }
    for (const food of this.food.values()) {
      this._spatialInsert(index.food, cellSize, food);
    }
    for (const pickup of this.weaponPickups.values()) {
      this._spatialInsert(index.weapons, cellSize, pickup);
    }
    return index;
  }

  _spatialInsert(bucketMap, cellSize, entity) {
    if (!entity) return;
    const key = this._spatialKey(entity.x, entity.y, cellSize);
    if (!bucketMap.has(key)) bucketMap.set(key, []);
    bucketMap.get(key).push(entity);
  }

  _spatialKey(x, y, cellSize) {
    return `${Math.floor((Number(x) || 0) / cellSize)}:${Math.floor((Number(y) || 0) / cellSize)}`;
  }

  _nearbyFromSpatial(bucketMap, point, radius, fallbackValues = []) {
    const index = this.aiSpatialIndex;
    if (!index || !bucketMap || !bucketMap.size) return Array.from(fallbackValues);
    const cellSize = index.cellSize;
    const minX = Math.floor(((Number(point.x) || 0) - radius) / cellSize);
    const maxX = Math.floor(((Number(point.x) || 0) + radius) / cellSize);
    const minY = Math.floor(((Number(point.y) || 0) - radius) / cellSize);
    const maxY = Math.floor(((Number(point.y) || 0) + radius) / cellSize);
    const result = [];
    const seen = new Set();

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const bucket = bucketMap.get(`${cx}:${cy}`);
        if (!bucket) continue;
        for (const entity of bucket) {
          const key = entity.username || entity.id || `${entity.x}:${entity.y}`;
          if (seen.has(key)) continue;
          seen.add(key);
          result.push(entity);
        }
      }
    }
    return result;
  }

  _nearbyPlayers(player, radius) {
    return this._nearbyFromSpatial(
      this.aiSpatialIndex && this.aiSpatialIndex.players,
      player,
      radius,
      this.players.values()
    );
  }

  _nearbyFood(player, radius) {
    return this._nearbyFromSpatial(
      this.aiSpatialIndex && this.aiSpatialIndex.food,
      player,
      radius,
      this.food.values()
    );
  }

  _nearbyWeaponPickups(player, radius) {
    return this._nearbyFromSpatial(
      this.aiSpatialIndex && this.aiSpatialIndex.weapons,
      player,
      radius,
      this.weaponPickups.values()
    );
  }

  _aiMetadata(extra = {}) {
    return {
      planner: 'utility-ai-v4',
      navigation: 'influence-field',
      search: 'spatial-grid',
      ...extra
    };
  }

  _assessThreats(player, movement, config) {
    const fleeDistance = Number(movement.fleeDistance) || DEFAULT_CONFIG.movement.fleeDistance;
    const fleeMassRatio = this._effectiveFleeMassRatio(player, movement);
    const lookaheadSeconds = Number(movement.threatLookaheadSeconds) || DEFAULT_CONFIG.movement.threatLookaheadSeconds;
    const personality = this._personalityTraits(player);
    let strongestThreat = null;
    let strongestScore = -Infinity;
    const vector = { x: 0, y: 0 };
    const threatEntries = [];
    const searchRadius = fleeDistance * 2.8 + player.radius * 2;

    for (const other of this._nearbyPlayers(player, searchRadius)) {
      if (other.username === player.username) continue;
      const distance = this._distance(player, other);
      const massRatio = other.mass / Math.max(player.mass, 1);
      const absorbThreat = this._playerAbsorbContext(other, player, config);
      const weaponThreat = this._weaponAttackContext(other, player, config);
      // If player can absorb the other (e.g. with chainsaw/dash), don't treat as threat
      // unless that other player carries an active weapon that can damage them.
      const playerAbsorb = this._playerAbsorbContext(player, other, config);
      if (playerAbsorb.canAbsorb && !weaponThreat.canAttack) continue;
      if (!absorbThreat.canAbsorb && !weaponThreat.canAttack) continue;
      if (!weaponThreat.canAttack && other.mass <= player.mass * fleeMassRatio) continue;

      const futureThreat = this._predictThreatPosition(player, other, movement, config, lookaheadSeconds);
      const futureDistance = this._distance(player, futureThreat);
      const effectiveDistance = Math.min(distance, futureDistance);
      const dynamicFleeDistance = this._dynamicFleeDistance(player, other, movement, config);
      const threatBoundary = dynamicFleeDistance + other.radius + player.radius * 0.45;
      if (
        distance > this._currentFleeThreatLimit(player, other, dynamicFleeDistance, weaponThreat) ||
        effectiveDistance > threatBoundary
      ) {
        continue;
      }

      const away = this._normalizeVector({
        x: player.x - futureThreat.x,
        y: player.y - futureThreat.y
      });
      const closeness = 1 - Math.min(1, effectiveDistance / Math.max(dynamicFleeDistance, 1));
      const closing = Math.max(0, distance - futureDistance) / Math.max(fleeDistance, 1);
      const smallness = Math.max(0, (Number(config.baseMass) || DEFAULT_CONFIG.baseMass) - player.mass) /
        Math.max(1, (Number(config.baseMass) || DEFAULT_CONFIG.baseMass) - (Number(config.minMass) || DEFAULT_CONFIG.minMass));
      const isChainsawThreat = weaponThreat.canAttack && other.weapon && other.weapon.type === 'chainsaw';
      const weaponThreatValue = isChainsawThreat
        ? this._weaponUtility(other.weapon.type, other.weapon.power)
        : 0;
      const weaponThreatBonus = isChainsawThreat
        ? 1.2 + weaponThreatValue * 0.68
        : 0;
      const fearScale = personality.fear * (1.18 - Math.min(0.45, (personality.aggression - 1) * 0.45));
      const intelligenceScale = 0.85 + Math.min(0.35, personality.intelligence * 0.18);
      const score = (massRatio * 3.3 + closeness * 5.2 + closing * 3 + smallness * 1.2 + weaponThreatBonus) *
        fearScale *
        intelligenceScale;
      vector.x += away.x * score;
      vector.y += away.y * score;
      threatEntries.push({
        target: other,
        future: futureThreat,
        distance: effectiveDistance,
        score,
        dynamicFleeDistance
      });

      if (score > strongestScore) {
        strongestThreat = other;
        strongestScore = score;
      }
    }

    for (const bomb of this.bombs.values()) {
      if (bomb.owner === player.username) continue;
      const distance = this._distance(player, bomb);
      const danger = bomb.blastRadius + player.radius + 90;
      if (distance > danger) continue;
      const away = this._normalizeVector({ x: player.x - bomb.x, y: player.y - bomb.y });
      const score = (1 - distance / danger) * (8 + player.radius / 8) * personality.fear;
      vector.x += away.x * score;
      vector.y += away.y * score;
      threatEntries.push({ target: bomb, future: bomb, distance, score, dynamicFleeDistance: danger });
      if (score > strongestScore) {
        strongestThreat = bomb;
        strongestScore = score;
      }
    }

    if (!strongestThreat) return null;
    const escape = this._bestEscapeVector(player, threatEntries, movement, config);
    return {
      target: strongestThreat,
      score: strongestScore,
      vector: escape.vector || this._normalizeVector(vector),
      threats: threatEntries,
      escapeScore: escape.score
    };
  }

  _bestEscapeVector(player, threats, movement, config) {
    if (!Array.isArray(threats) || !threats.length) {
      return { vector: { x: 0, y: 0 }, score: 0 };
    }

    const directions = 20;
    const baseStep = this._effectiveMovementSpeed(player, {
      mode: 'flee',
      target: threats[0].target
    }, config) * 0.7;
    const boundaryMargin = Math.max(player.radius + 18, Number(movement.boundaryAvoidanceDistance) || 80);
    let bestVector = null;
    let bestScore = -Infinity;
    const pressureAway = { x: 0, y: 0 };
    let totalThreatScore = 0;

    for (const threat of threats) {
      const away = this._normalizeVector({
        x: player.x - (threat.future || threat.target).x,
        y: player.y - (threat.future || threat.target).y
      });
      pressureAway.x += away.x * threat.score;
      pressureAway.y += away.y * threat.score;
      totalThreatScore += threat.score;
    }
    const pressureVector = this._normalizeVector(pressureAway);
    const boundaryEscape = this._boundaryAvoidanceVector(player, config);
    const previousEscape = player.aiIntent && player.aiIntent.intent === 'flee' && player.aiIntent.vector
      ? this._normalizeVector(player.aiIntent.vector, { x: 0, y: 0 })
      : this._normalizeVector({ x: player.vx, y: player.vy }, { x: 0, y: 0 });
    const previousEscapeAlignment = previousEscape.x * pressureVector.x + previousEscape.y * pressureVector.y;
    const hasPreviousEscape = this._vectorLength(previousEscape) > 0.05 && previousEscapeAlignment > -0.15;

    for (let i = 0; i < directions; i++) {
      const angle = i * Math.PI * 2 / directions;
      const vector = { x: Math.cos(angle), y: Math.sin(angle) };
      const candidate = {
        x: this._clamp(player.x + vector.x * baseStep, player.radius, config.arenaWidth - player.radius),
        y: this._clamp(player.y + vector.y * baseStep, player.radius, config.arenaHeight - player.radius),
        radius: player.radius
      };
      let score = 0;

      for (const threat of threats) {
        const distance = this._distance(candidate, threat.future || threat.target);
        const normalizedClearance = distance / Math.max(threat.dynamicFleeDistance || 1, 1);
        score += Math.min(2.5, normalizedClearance) * threat.score;
      }

      score += this._boundarySafetyScore(candidate, config, boundaryMargin) * 3.2;
      score += Math.max(0, vector.x * pressureVector.x + vector.y * pressureVector.y) * totalThreatScore * 0.9;
      if (hasPreviousEscape) {
        const laneAlignment = vector.x * previousEscape.x + vector.y * previousEscape.y;
        score += Math.max(0, laneAlignment) * (totalThreatScore * 0.75 + 1.8);
        score -= Math.max(0, -laneAlignment) * (totalThreatScore * 0.95 + 2.4);
      }
      if (boundaryEscape.x || boundaryEscape.y) {
        const boundaryAlignment = vector.x * boundaryEscape.x + vector.y * boundaryEscape.y;
        score += Math.max(0, boundaryAlignment) * (totalThreatScore * 1.35 + 4.5);
        score -= Math.max(0, -boundaryAlignment) * (totalThreatScore * 1.8 + 5.5);
      }
      score -= this._blockedMovementRatio(player, vector, baseStep, config) * (totalThreatScore * 2.2 + 8);
      const forwardAlignment = vector.x * (player.vx || 0) + vector.y * (player.vy || 0);
      score += Math.max(0, forwardAlignment) * (previousEscapeAlignment > -0.15 ? 0.25 : 0.04);

      if (score > bestScore) {
        bestScore = score;
        bestVector = vector;
      }
    }

    return {
      vector: this._normalizeVector(bestVector || { x: player.x - threats[0].target.x, y: player.y - threats[0].target.y }),
      score: bestScore
    };
  }

  _boundarySafetyScore(point, config, margin) {
    const left = Math.max(0, point.x - point.radius);
    const right = Math.max(0, config.arenaWidth - point.radius - point.x);
    const top = Math.max(0, point.y - point.radius);
    const bottom = Math.max(0, config.arenaHeight - point.radius - point.y);
    const minDistance = Math.min(left, right, top, bottom);
    return this._clamp(minDistance / Math.max(margin, 1), 0, 1);
  }

  _dynamicFleeDistance(player, other, movement, config) {
    const base = Number(movement.fleeDistance) || DEFAULT_CONFIG.movement.fleeDistance;
    const personality = this._personalityTraits(player);
    const massRatio = other.mass / Math.max(player.mass, 1);
    const baseMass = Number(config.baseMass) || DEFAULT_CONFIG.baseMass;
    const minMass = Number(config.minMass) || DEFAULT_CONFIG.minMass;
    const smallness = Math.max(0, (baseMass - player.mass) / Math.max(1, baseMass - minMass));
    const threatScale = this._clamp((massRatio - 1) * 0.18, 0, 0.38);
    const activeWeapon = other && other.weapon && other.weapon.type ? other.weapon.type : null;
    const weaponThreatScale = activeWeapon === 'chainsaw'
      ? 0.22
      : ['dash', 'missile', 'laser', 'blackhole', 'pulse', 'vampire'].includes(activeWeapon)
        ? 0.16
        : 0;
    const personalityScale = this._clamp(0.82 + personality.fear * 0.22 - (personality.aggression - 1) * 0.08, 0.72, 1.2);
    return base * (1 + threatScale + smallness * 0.2 + weaponThreatScale) * personalityScale;
  }

  _currentFleeThreatLimit(player, threat, dynamicFleeDistance, weaponThreat = null) {
    const threatRadius = Number(threat && threat.radius) || 0;
    const playerRadius = Number(player && player.radius) || 0;
    const activeWeapon = threat && threat.weapon && threat.weapon.type ? threat.weapon.type : null;

    if (weaponThreat && weaponThreat.canAttack) {
      const weaponSlack = activeWeapon === 'chainsaw' ? 150 : 115;
      return dynamicFleeDistance + threatRadius + playerRadius * 0.45 + weaponSlack;
    }

    const personality = this._personalityTraits(player);
    const fearSlack = this._clamp((personality.fear - 1) * 110, 0, 75);
    return dynamicFleeDistance + threatRadius * 0.4 + playerRadius * 0.25 + fearSlack;
  }

  _predictThreatPosition(player, threat, movement, config, lookaheadSeconds) {
    if (!lookaheadSeconds || (!threat.vx && !threat.vy && !player.vx && !player.vy)) {
      return threat;
    }
    const speed = Number(movement.baseSpeed) || DEFAULT_CONFIG.movement.baseSpeed;
    const threatMassSpeed = this._movementMassMultiplier(threat, config);
    const playerMassSpeed = this._movementMassMultiplier(player, config);
    const threatVelocity = this._constrainVelocityToBounds(threat, {
      x: Number(threat.vx) || 0,
      y: Number(threat.vy) || 0
    }, config);
    const playerVelocity = this._constrainVelocityToBounds(player, {
      x: Number(player.vx) || 0,
      y: Number(player.vy) || 0
    }, config);
    return {
      ...threat,
      x: this._clamp(
        threat.x + (threatVelocity.x * speed * threatMassSpeed - playerVelocity.x * speed * playerMassSpeed * 0.35) * lookaheadSeconds,
        threat.radius,
        config.arenaWidth - threat.radius
      ),
      y: this._clamp(
        threat.y + (threatVelocity.y * speed * threatMassSpeed - playerVelocity.y * speed * playerMassSpeed * 0.35) * lookaheadSeconds,
        threat.radius,
        config.arenaHeight - threat.radius
      )
    };
  }

  _movementMassMultiplier(player, config) {
    const movement = config.movement || DEFAULT_CONFIG.movement;
    const mass = this._clamp(player.mass, config.minMass, config.maxMass);
    const baseMass = Number(config.baseMass) || DEFAULT_CONFIG.baseMass;
    const minMass = Number(config.minMass) || DEFAULT_CONFIG.minMass;
    const maxMass = Number(config.maxMass) || DEFAULT_CONFIG.maxMass;
    const maxBoost = Number(movement.smallMassSpeedBoost) || DEFAULT_CONFIG.movement.smallMassSpeedBoost;
    const maxPenalty = Number(movement.largeMassSpeedPenalty) || DEFAULT_CONFIG.movement.largeMassSpeedPenalty;
    const minMultiplier = Number(movement.minMassSpeedMultiplier) || DEFAULT_CONFIG.movement.minMassSpeedMultiplier;
    const maxMultiplier = Number(movement.maxMassSpeedMultiplier) || DEFAULT_CONFIG.movement.maxMassSpeedMultiplier;

    if (mass <= baseMass) {
      const range = Math.max(1, baseMass - minMass);
      const t = (baseMass - mass) / range;
      return this._clamp(1 + maxBoost * t, 1, maxMultiplier);
    }

    const range = Math.max(1, maxMass - baseMass);
    const t = (mass - baseMass) / range;
    const bulkDrag = Math.pow(t, 1.4) * 0.1;
    return this._clamp(1 - maxPenalty * t - bulkDrag, minMultiplier, 1);
  }

  _effectiveMovementSpeed(player, behavior, config = this.getConfig()) {
    const movement = config.movement || DEFAULT_CONFIG.movement;
    const physics = config.weaponPhysics || DEFAULT_CONFIG.weaponPhysics;
    const baseSpeed = Number(movement.baseSpeed) || DEFAULT_CONFIG.movement.baseSpeed;
    const massSpeed = this._movementMassMultiplier(player, config);
    const statusSpeed = this._statusSpeedMultiplier(player);
    const weaponSpeed = this._weaponSpeedBoost(player.weapon, physics);
    const feverSpeed = this.fever.active ? 0.15 : 0;
    const maxEnergy = Math.max(1, Number(config.maxEnergy) || DEFAULT_CONFIG.maxEnergy);
    const energyBoost = this._clamp((Number(player.energy) || 0) / maxEnergy, 0, 1) * 0.35;
    const behaviorSpeedBoost = this._behaviorSpeedBoost(player, behavior, config);
    const additiveBoost = this._clamp(
      weaponSpeed + feverSpeed + energyBoost + behaviorSpeedBoost,
      0,
      this._movementAdditiveBoostCap(player, config)
    );
    const speedMultiplier = this._behaviorSpeedMultiplier(player, behavior, config);

    return baseSpeed * massSpeed * statusSpeed * (1 + additiveBoost) * speedMultiplier;
  }

  _behaviorSpeedBoost(player, behavior, config) {
    if (!behavior || !behavior.target) return 0;

    const movement = config.movement || DEFAULT_CONFIG.movement;
    const mode = behavior.mode || 'wander';
    const personality = this._personalityTraits(player);

    if (mode === 'flee') {
      return Number(movement.fleeSpeedBoost) || 0;
    }
    if (mode === 'evade-weapon') {
      return Number(movement.fleeSpeedBoost) || 0.18;
    }
    if (mode === 'hunt-player') {
      const rawHuntBoost = Math.max(
        Number(movement.huntSpeedBoost) || 0,
        0.2 + this._clamp(personality.aggression - 1, 0, 0.7) * 0.12
      );
      return Math.min(rawHuntBoost, this._huntBehaviorSpeedCap(player, config)) +
        this._huntStrikeBoost(player, behavior.target, config);
    }
    if (mode === 'pressure-player') {
      const rawPressureBoost = Math.max(
        0.12,
        (Number(movement.huntSpeedBoost) || 0) * 0.7 +
          this._clamp(personality.aggression - 1, 0, 0.7) * 0.08
      );
      return Math.min(rawPressureBoost, this._pressureBehaviorSpeedCap(player, config));
    }
    if (mode === 'hunt-weapon') {
      return 0.08;
    }
    if (mode === 'hunt-food') {
      return 0.1;
    }
    return 0;
  }

  _behaviorSpeedMultiplier(player, behavior, config) {
    const mode = behavior && behavior.mode ? behavior.mode : 'wander';
    if (mode !== 'wander' || behavior?.target) return 1;

    const movement = config.movement || DEFAULT_CONFIG.movement;
    const baseMultiplier = Number(movement.wanderSpeedMultiplier) || DEFAULT_CONFIG.movement.wanderSpeedMultiplier;
    const personality = this._personalityTraits(player);
    const curiosity = this._clamp((personality.randomness - 0.55) * 0.08, -0.04, 0.06);
    return this._clamp(baseMultiplier + curiosity, 0.32, 0.62);
  }

  _huntBehaviorSpeedCap(player, config) {
    const mass = this._clampedMovementMass(player, config);
    const baseMass = Number(config.baseMass) || DEFAULT_CONFIG.baseMass;
    const minMass = Number(config.minMass) || DEFAULT_CONFIG.minMass;
    const maxMass = Number(config.maxMass) || DEFAULT_CONFIG.maxMass;

    if (mass <= baseMass) {
      const t = (baseMass - mass) / Math.max(1, baseMass - minMass);
      return this._clamp(0.2 + t * 0.06, 0.16, 0.28);
    }

    const t = (mass - baseMass) / Math.max(1, maxMass - baseMass);
    return this._clamp(0.16 - t * 0.11, 0.045, 0.16);
  }

  _pressureBehaviorSpeedCap(player, config) {
    return this._clamp(this._huntBehaviorSpeedCap(player, config) * 0.68, 0.035, 0.16);
  }

  _movementAdditiveBoostCap(player, config) {
    const mass = this._clampedMovementMass(player, config);
    const baseMass = Number(config.baseMass) || DEFAULT_CONFIG.baseMass;
    const maxMass = Number(config.maxMass) || DEFAULT_CONFIG.maxMass;
    const t = mass <= baseMass ? 0 : (mass - baseMass) / Math.max(1, maxMass - baseMass);

    if (player.weapon && player.weapon.type) {
      return this._clamp(1.45 - t * 0.25, 1.1, 1.45);
    }

    return this._clamp(0.85 - t * 0.18, 0.62, 0.85);
  }

  _clampedMovementMass(player, config) {
    return this._clamp(
      Number(player && player.mass) || Number(config.baseMass) || DEFAULT_CONFIG.baseMass,
      Number(config.minMass) || DEFAULT_CONFIG.minMass,
      Number(config.maxMass) || DEFAULT_CONFIG.maxMass
    );
  }

  _weaponSpeedBoost(weapon, physics) {
    if (!weapon) return 0;
    if (weapon.type === 'speed') {
      return weapon.power * 0.2;
    }
    if (weapon.type === 'dash') {
      const baseBoost = Number(physics.dashSpeedBoost) || DEFAULT_CONFIG.weaponPhysics.dashSpeedBoost;
      const powerScale = Math.max(0.85, Math.min(1.35, (Number(weapon.power) || 1) / 3));
      return baseBoost * powerScale;
    }
    if (weapon.type === 'chainsaw') {
      const baseBoost = Number(physics.chainsawSpeedBoost) || DEFAULT_CONFIG.weaponPhysics.chainsawSpeedBoost;
      const powerScale = Math.max(0.9, Math.min(1.35, (Number(weapon.power) || 1) / 4));
      return baseBoost * powerScale;
    }
    return 0;
  }

  _randomSteeringPush(behavior, movement, personality) {
    const mode = behavior && behavior.mode ? behavior.mode : 'wander';
    if (mode === 'wander' && !behavior?.target) {
      return { x: 0, y: 0 };
    }

    const randomTurn = mode === 'hunt-player' || mode === 'pressure-player' || mode === 'flee' || mode === 'hunt-weapon' || mode === 'evade-weapon'
      ? movement.randomTurn * 0.12
      : behavior?.target ? movement.randomTurn * 0.28 : movement.randomTurn * 0.45;
    const personalityRandomness = this._clamp(
      personality.randomness / Math.max(personality.intelligence, 0.35),
      0.18,
      1.35
    );

    return {
      x: (this.random() * 2 - 1) * randomTurn * personalityRandomness,
      y: (this.random() * 2 - 1) * randomTurn * personalityRandomness
    };
  }

  _humanizedDesiredVelocity(player, desiredVelocity, behavior, config, personality) {
    const mode = behavior && behavior.mode ? behavior.mode : 'wander';
    if (mode !== 'wander' || behavior?.target) {
      if (player.humanMotion && player.humanMotion.mode === 'wander') {
        player.humanMotion = null;
      }
      return desiredVelocity;
    }

    const boundary = this._boundaryAvoidanceVector(player, config);
    if (this._vectorLength(boundary) > 0.05) {
      return desiredVelocity;
    }

    const now = this.now();
    const previous = player.humanMotion;
    if (previous && previous.mode === 'wander' && now < previous.lockedUntil) {
      return this._normalizeVector(previous.vector, desiredVelocity);
    }

    const current = this._normalizeVector({ x: player.vx, y: player.vy }, desiredVelocity);
    const desired = this._normalizeVector(desiredVelocity, current);
    const focus = this._normalizeVector({
      x: current.x * 0.82 + desired.x * 0.18,
      y: current.y * 0.82 + desired.y * 0.18
    }, desired);
    player.humanMotion = {
      mode: 'wander',
      vector: focus,
      lockedUntil: now + this._wanderFocusMs(config.movement || DEFAULT_CONFIG.movement, personality),
      updatedAt: now
    };
    return focus;
  }

  _wanderFocusMs(movement, personality) {
    const minFocusMs = Number(movement.wanderFocusMinMs) || DEFAULT_CONFIG.movement.wanderFocusMinMs;
    const maxFocusMs = Number(movement.wanderFocusMaxMs) || DEFAULT_CONFIG.movement.wanderFocusMaxMs;
    const randomness = this._clamp((personality.randomness - 0.15) / 1.2, 0, 1);
    return this._clamp(
      maxFocusMs - (maxFocusMs - minFocusMs) * randomness,
      minFocusMs,
      Math.max(minFocusMs, maxFocusMs)
    );
  }

  _huntStrikeBoost(player, target, config) {
    if (!target || target.username === player.username) return 0;
    const absorbContext = this._playerAbsorbContext(player, target, config);
    if (!absorbContext.canAbsorb) return 0;

    const movement = config.movement || DEFAULT_CONFIG.movement;
    const personality = this._personalityTraits(player);
    const distance = this._distance(player, target);
    const configuredStrikeDistance = Number(movement.huntStrikeDistance) || DEFAULT_CONFIG.movement.huntStrikeDistance;
    const strikeDistance = Math.max(
      configuredStrikeDistance,
      player.radius * 3.2 + target.radius * 2.4
    );
    if (distance > strikeDistance) return 0;

    const massAdvantage = player.mass / Math.max(target.mass, 1);
    const chaseBand = Math.max(1, strikeDistance - absorbContext.absorbDistance);
    const closeness = 1 - Math.min(1, Math.max(0, distance - absorbContext.absorbDistance) / chaseBand);
    const baseBoost = Number(movement.huntStrikeBoost) || DEFAULT_CONFIG.movement.huntStrikeBoost;
    const dominanceBoost = this._clamp((massAdvantage - 1) * 0.42, 0, 0.9);
    const aggressionBoost = this._clamp((personality.aggression - 1) * 0.24, -0.08, 0.18);
    const intelligenceBoost = this._clamp((personality.intelligence - 1) * 0.12, -0.06, 0.12);
    const closeBoost = closeness * 0.48;
    const weaponBoost = player.weapon
      ? this._clamp(this._weaponUtility(player.weapon.type, player.weapon.power) * 0.04, 0.08, 0.34)
      : 0;
    const strikeCap = this._huntStrikeBoostCap(player, config);

    return this._clamp(
      baseBoost * 0.38 + dominanceBoost + closeBoost + aggressionBoost + intelligenceBoost + weaponBoost,
      0,
      strikeCap
    );
  }

  _huntStrikeBoostCap(player, config) {
    const mass = this._clampedMovementMass(player, config);
    const baseMass = Number(config.baseMass) || DEFAULT_CONFIG.baseMass;
    const minMass = Number(config.minMass) || DEFAULT_CONFIG.minMass;
    const maxMass = Number(config.maxMass) || DEFAULT_CONFIG.maxMass;
    let cap;

    if (mass <= baseMass) {
      const t = (baseMass - mass) / Math.max(1, baseMass - minMass);
      cap = 0.14 + t * 0.04;
    } else {
      const t = (mass - baseMass) / Math.max(1, maxMass - baseMass);
      cap = 0.11 - t * 0.085;
    }

    if (player.weapon && player.weapon.type) {
      const weaponCap = this._clamp(
        this._weaponUtility(player.weapon.type, player.weapon.power) * 0.018,
        0.04,
        0.16
      );
      cap += weaponCap;
    }

    return this._clamp(cap, 0.025, player.weapon ? 0.3 : 0.18);
  }

  _steerVelocity(player, desiredVelocity, behavior, steeringStrength, personality, seconds = DEFAULT_TICK_RATE_MS / 1000) {
    const rawCurrent = { x: Number(player.vx) || 0, y: Number(player.vy) || 0 };
    const rawDesired = { x: Number(desiredVelocity && desiredVelocity.x) || 0, y: Number(desiredVelocity && desiredVelocity.y) || 0 };
    const current = this._normalizeVector(rawCurrent, { x: 0, y: 0 });
    const desired = this._normalizeVector(rawDesired, { x: 0, y: 0 });
    const currentLength = this._vectorLength(current);
    const desiredLength = this._vectorLength(desired);
    if (desiredLength < 0.001 && currentLength < 0.001) {
      return { x: 0, y: 0 };
    }
    if (desiredLength < 0.001) {
      return current;
    }
    if (currentLength < 0.001) {
      return desired;
    }
    const mode = behavior && behavior.mode ? behavior.mode : 'wander';
    const intent = behavior && behavior.intent ? behavior.intent : mode;
    const decisiveModes = ['flee', 'evade-weapon', 'hunt-player', 'pressure-player', 'hunt-weapon', 'hunt-food'];
    const minTurnRateByIntent = {
      flee: 0.72,
      'evade-arm': 0.68,
      attack: 0.62,
      pressure: 0.54,
      arm: 0.52,
      feed: 0.64
    };
    const intelligenceScale = this._clamp(0.88 + personality.intelligence * 0.16, 0.92, 1.15);
    let turnRate = this._clamp(steeringStrength * intelligenceScale, 0.08, 0.94);

    if (decisiveModes.includes(mode)) {
      turnRate = Math.max(turnRate, minTurnRateByIntent[intent] || 0.5);
    } else if (mode === 'wander') {
      turnRate = this._clamp(turnRate * 0.45, 0.045, 0.16);
    }

    const alignment = current.x * desired.x + current.y * desired.y;
    if (alignment < -0.25 && decisiveModes.includes(mode)) {
      turnRate = Math.max(turnRate, 0.78);
    } else if (alignment < 0.15 && (mode === 'flee' || mode === 'hunt-player' || mode === 'pressure-player' || mode === 'hunt-food')) {
      turnRate = Math.max(turnRate, 0.68);
    }

    return this._rotateVectorTowards(
      current,
      desired,
      this._velocityTurnLimit(mode, intent, turnRate, alignment, seconds)
    );
  }

  _velocityTurnLimit(mode, intent, turnRate, alignment, seconds) {
    const maxDegreesByIntent = {
      flee: 24,
      'evade-arm': 22,
      attack: 20,
      pressure: 16,
      arm: 14,
      feed: 20,
      wander: 10
    };
    const maxDegreesByMode = {
      flee: 24,
      'evade-weapon': 22,
      'hunt-player': 20,
      'pressure-player': 16,
      'hunt-weapon': 14,
      'hunt-food': 20,
      wander: 10
    };
    const maxDegrees = maxDegreesByIntent[intent] || maxDegreesByMode[mode] || 24;
    if (mode === 'wander') {
      return this._clamp(turnRate * 28, 1.5, maxDegrees) * Math.PI / 180;
    }

    let degrees = this._clamp(turnRate * 48, 8, maxDegrees);
    if (alignment < -0.45) {
      degrees = Math.min(maxDegrees, degrees + 4);
    }
    const tickSeconds = DEFAULT_TICK_RATE_MS / 1000;
    const stepScale = this._clamp((Number(seconds) || tickSeconds) / tickSeconds, 1, 8);
    return degrees * stepScale * Math.PI / 180;
  }

  _effectiveFleeMassRatio(player, movement) {
    const base = Number(movement.fleeMassRatio) || DEFAULT_CONFIG.movement.fleeMassRatio;
    const personality = this._personalityTraits(player);
    let ratio = base +
      Math.max(-0.12, Math.min(0.16, (personality.aggression - 1) * 0.18)) -
      Math.max(-0.1, Math.min(0.16, (personality.fear - 1) * 0.16));
    if (!player.weapon || !player.weapon.type) return this._clamp(ratio, 0.82, 1.38);

    const toleranceByWeapon = {
      shield: 0.24,
      blackhole: 0.18,
      chainsaw: 0.16,
      missile: 0.14,
      dash: 0.12,
      laser: 0.12,
      pulse: 0.1,
      freeze: 0.1,
      vampire: 0.08,
      magnet: 0.08,
      mine: 0.06,
      speed: 0.06
    };
    ratio += toleranceByWeapon[player.weapon.type] || 0;
    return this._clamp(ratio, 0.82, 1.45);
  }

  _effectiveHuntMassRatio(player, movement) {
    const base = Number(movement.huntMassRatio) || DEFAULT_CONFIG.movement.huntMassRatio;
    const personality = this._personalityTraits(player);
    let ratio = base -
      Math.max(-0.12, Math.min(0.18, (personality.aggression - 1) * 0.2)) +
      Math.max(-0.08, Math.min(0.12, (personality.fear - 1) * 0.12));

    const ratioByWeapon = {
      chainsaw: 0.98,
      missile: 0.95,
      laser: 0.97,
      blackhole: 0.96,
      vampire: 0.99,
      pulse: 1,
      freeze: 1,
      magnet: 1.01,
      dash: Math.min(base, 1.04)
    };
    if (player.weapon && player.weapon.type && ratioByWeapon[player.weapon.type]) {
      ratio = Math.min(ratio, ratioByWeapon[player.weapon.type]);
    }
    return this._clamp(ratio, 0.86, 1.28);
  }

  _rankWeaponPickup(player, movement, config) {
    const senseDistance = Number(movement.weaponSenseDistance) || DEFAULT_CONFIG.movement.weaponSenseDistance;
    const personality = this._personalityTraits(player);
    const now = this.now();
    let best = null;
    let bestScore = -Infinity;

    for (const pickup of this._nearbyWeaponPickups(player, senseDistance + player.radius + 80)) {
      if (pickup.expiresAt && now >= pickup.expiresAt) continue;
      const distance = this._distance(player, pickup);
      if (distance > senseDistance + player.radius) continue;

      const closeness = 1 - Math.min(1, distance / Math.max(senseDistance, 1));
      const weaponValue = this._weaponUtility(pickup.type, pickup.power);
      const currentWeaponValue = player.weapon ? this._weaponUtility(player.weapon.type, player.weapon.power) : 0;
      const needsWeapon = player.weapon ? 0 : 1.4;
      const upgradeValue = Math.max(0, weaponValue - currentWeaponValue) * 0.9;
      const baseMass = Number(config.baseMass) || DEFAULT_CONFIG.baseMass;
      const defensiveNeed = player.mass < baseMass ? (baseMass - player.mass) / Math.max(1, baseMass - config.minMass) : 0;
      const score = (
        weaponValue * 1.25 +
        closeness * 2.2 +
        needsWeapon +
        upgradeValue +
        defensiveNeed * 1.2
      ) * personality.weaponFocus * (0.82 + personality.intelligence * 0.18);

      if (score > bestScore) {
        best = pickup;
        bestScore = score;
      }
    }

    return best ? { target: best, score: bestScore } : null;
  }

  _rankFoodTarget(player, movement, config, strategy = {}) {
    const personality = this._personalityTraits(player);
    const senseDistance = Number(movement.foodSenseDistance) || DEFAULT_CONFIG.movement.foodSenseDistance;
    const localRadius = senseDistance + player.radius + 80;
    const localCandidates = this._nearbyFood(player, localRadius)
      .filter(food => this._canConsumeFood(player, food, config, 'collision') &&
        this._distance(player, food) <= senseDistance + player.radius);
    const macroSearch = localCandidates.length === 0 &&
      this.food.size > 0 &&
      this._canMacroSearchFood(player, config);
    const candidates = macroSearch
      ? Array.from(this.food.values()).filter(food => this._canConsumeFood(player, food, config, 'collision'))
      : localCandidates;
    const arenaDiagonal = Math.sqrt(config.arenaWidth * config.arenaWidth + config.arenaHeight * config.arenaHeight);
    let best = null;
    let bestScore = -Infinity;
    let bestReason = 'safe-food';
    let bestCluster = null;
    let bestSteeringTarget = null;
    let bestDistance = Infinity;
    let immediateBest = null;
    const pressureTarget = strategy.pressureTarget || null;
    const threatTarget = strategy.threatTarget || null;
    const immediateFoodDistance = player.radius + Math.max(
      130,
      (Number(config.foodRadius) || DEFAULT_CONFIG.foodRadius) * 18
    );

    for (const food of candidates) {
      const distance = this._distance(player, food);
      if (!macroSearch && distance > senseDistance + player.radius) continue;

      const searchDistance = macroSearch ? Math.max(arenaDiagonal, 1) : Math.max(senseDistance, 1);
      const closeness = 1 - Math.min(1, distance / searchDistance);
      const value = Number(food.value) || DEFAULT_CONFIG.foodValue;
      const riskPenalty = this._riskAtPoint(player, food, movement, config) * personality.fear * 0.55;
      const strategyBonus = this._foodStrategyBonus(player, food, movement, config, {
        pressureTarget,
        threatTarget,
        personality,
        senseDistance
      });
      const cluster = this._foodClusterScore(player, food, candidates, config, {
        macroSearch,
        personality
      });
      const score = (value * 1.25 + closeness * 2.1 + personality.foodFocus) *
        personality.foodFocus *
        (0.72 + personality.intelligence * 0.18) +
        cluster.score +
        strategyBonus.score -
        riskPenalty -
        (macroSearch ? 0.35 : 0);
      const candidateReason = strategyBonus.reason && strategyBonus.reason !== 'safe-food'
        ? strategyBonus.reason
        : cluster.count > 1
          ? (macroSearch ? 'macro-food' : 'food-cluster')
          : macroSearch
            ? 'macro-food'
            : 'safe-food';
      const candidate = {
        target: food,
        steeringTarget: cluster.count > 1 ? cluster.center : food,
        score,
        reason: candidateReason,
        cluster: cluster.count > 1 ? cluster : null,
        distance
      };

      if (score > bestScore) {
        best = food;
        bestScore = score;
        bestCluster = candidate.cluster;
        bestSteeringTarget = candidate.steeringTarget;
        bestReason = candidate.reason;
        bestDistance = distance;
      }

      if (!macroSearch && distance <= immediateFoodDistance) {
        if (
          !immediateBest ||
          distance < immediateBest.distance ||
          (score > immediateBest.score + 1.15 && distance <= immediateBest.distance * 1.35)
        ) {
          immediateBest = candidate;
        }
      }
    }

    if (
      best &&
      immediateBest &&
      immediateBest.target !== best &&
      bestReason !== 'strategic-growth' &&
      bestDistance > immediateBest.distance * 1.7 + 55 &&
      immediateBest.score >= bestScore - 3.2
    ) {
      best = immediateBest.target;
      bestScore = immediateBest.score;
      bestCluster = immediateBest.cluster;
      bestSteeringTarget = immediateBest.steeringTarget;
      bestReason = immediateBest.reason === 'safe-food' ? 'immediate-food' : immediateBest.reason;
    }

    return best ? {
      target: best,
      steeringTarget: bestSteeringTarget || best,
      score: bestScore,
      reason: bestReason,
      strategyTarget: bestReason === 'strategic-growth' ? pressureTarget : null,
      cluster: bestCluster,
      search: macroSearch ? 'macro-food' : 'local-food'
    } : null;
  }

  _canMacroSearchFood(player, config = DEFAULT_CONFIG) {
    if (!this._isFoodUsefulForPlayer(player, config)) return false;

    const mass = Number(player && player.mass) || Number(config.baseMass) || DEFAULT_CONFIG.baseMass;
    const maxMass = Math.max(1, Number(config.maxMass) || DEFAULT_CONFIG.maxMass);
    const ignoreMassRatio = this._clamp(
      Number(config.largePlayerFoodIgnoreMassRatio) || DEFAULT_CONFIG.largePlayerFoodIgnoreMassRatio,
      0.5,
      0.98
    );
    const falloffStart = Number(config.foodGrowthFalloffStartMass) || DEFAULT_CONFIG.foodGrowthFalloffStartMass;
    const saturatedMass = Math.min(maxMass * ignoreMassRatio, falloffStart + 95);
    return mass < saturatedMass;
  }

  _foodClusterScore(player, food, foods, config, options = {}) {
    const personality = options.personality || this._personalityTraits(player);
    const macroSearch = Boolean(options.macroSearch);
    const clusterRadius = macroSearch
      ? Math.max(145, Math.min(220, Math.max(config.arenaWidth, config.arenaHeight) * 0.11))
      : Math.max(95, Math.min(155, Math.max(config.arenaWidth, config.arenaHeight) * 0.075));
    let count = 0;
    let value = 0;
    let weightedX = 0;
    let weightedY = 0;

    for (const candidate of foods || []) {
      const distance = this._distance(food, candidate);
      if (distance > clusterRadius) continue;

      const candidateValue = Number(candidate.value) || DEFAULT_CONFIG.foodValue;
      count += 1;
      value += candidateValue;
      weightedX += candidate.x * candidateValue;
      weightedY += candidate.y * candidateValue;
    }

    if (!count || value <= 0) {
      return {
        count: 0,
        value: 0,
        score: 0,
        center: food
      };
    }

    const center = {
      x: weightedX / value,
      y: weightedY / value
    };
    if (count === 1) {
      return {
        count,
        value,
        score: 0,
        center
      };
    }

    const arenaDiagonal = Math.sqrt(config.arenaWidth * config.arenaWidth + config.arenaHeight * config.arenaHeight);
    const distanceToCenter = this._distance(player, center);
    const closeness = 1 - Math.min(1, distanceToCenter / Math.max(arenaDiagonal, 1));
    const densityScore = this._clamp((count - 1) / 5, 0, 1) * 1.35;
    const valueScore = Math.min(2.4, Math.max(0, value - (Number(food.value) || DEFAULT_CONFIG.foodValue)) * 0.32);
    const macroBonus = macroSearch ? 0.45 : 0;
    const score = (densityScore + valueScore + closeness * 0.65 + macroBonus) *
      personality.foodFocus *
      (0.72 + personality.intelligence * 0.18);

    return {
      count,
      value,
      score,
      center
    };
  }

  _foodStrategyBonus(player, food, movement, config, strategy) {
    const personality = strategy.personality || this._personalityTraits(player);
    let score = 0;
    let reason = 'safe-food';

    if (strategy.pressureTarget && personality.aggression >= 1.05) {
      const toFood = this._normalizeVector({ x: food.x - player.x, y: food.y - player.y });
      const toRival = this._normalizeVector({
        x: strategy.pressureTarget.x - player.x,
        y: strategy.pressureTarget.y - player.y
      });
      const alignment = Math.max(0, toFood.x * toRival.x + toFood.y * toRival.y);
      const rivalDistance = Math.max(1, this._distance(player, strategy.pressureTarget));
      const foodToRivalDistance = this._distance(food, strategy.pressureTarget);
      const progress = this._clamp(1 - foodToRivalDistance / rivalDistance, 0, 1);
      const gap = this._pressureMassGap(player, strategy.pressureTarget, config);
      const gapUrgency = this._clamp(1 - gap / 0.28, 0, 1);
      const laneScore = alignment * (0.9 + progress * 0.85) * (0.9 + gapUrgency * 0.5) *
        personality.aggression *
        (0.85 + personality.intelligence * 0.24);
      if (laneScore > 0.75) {
        score += laneScore * 1.55;
        reason = 'strategic-growth';
      }
    }

    if (strategy.threatTarget) {
      const awayFromThreat = this._normalizeVector({
        x: player.x - strategy.threatTarget.x,
        y: player.y - strategy.threatTarget.y
      });
      const toFood = this._normalizeVector({ x: food.x - player.x, y: food.y - player.y });
      const escapeAlignment = Math.max(0, awayFromThreat.x * toFood.x + awayFromThreat.y * toFood.y);
      if (escapeAlignment > 0.3) {
        score += escapeAlignment * personality.fear * (0.75 + personality.intelligence * 0.2);
        if (reason === 'safe-food') reason = 'escape-food';
      }
    }

    return { score, reason };
  }

  _riskAtPoint(player, point, movement, config) {
    let risk = 0;
    for (const other of this._nearbyPlayers(point, (Number(movement.fleeDistance) || DEFAULT_CONFIG.movement.fleeDistance) * 2.6)) {
      if (other.username === player.username) continue;
      if (other.mass <= player.mass * this._effectiveFleeMassRatio(player, movement)) continue;
      const distance = this._distance(point, other);
      const dangerRadius = this._dynamicFleeDistance(player, other, movement, config);
      if (distance > dangerRadius) continue;
      const closeness = 1 - Math.min(1, distance / Math.max(dangerRadius, 1));
      risk += closeness * (other.mass / Math.max(player.mass, 1));
    }
    return risk;
  }

  _weaponUtility(type, power = 1) {
    const baseValue = {
      chainsaw: 5.2,
      blackhole: 4.7,
      missile: 4.2,
      vampire: 3.8,
      laser: 3.6,
      pulse: 3.2,
      freeze: 3,
      dash: 2.9,
      magnet: 2.7,
      mine: 2.5,
      shield: 2.4,
      speed: 2
    };
    return (baseValue[type] || 1.5) + Math.max(0, Number(power) || 1) * 0.18;
  }

  _shouldPrioritizeWeapon(player, weaponPickup, preyTarget, config) {
    if (!weaponPickup || !weaponPickup.target) return false;
    const personality = this._personalityTraits(player);
    const hasActiveWeapon = Boolean(player.weapon && player.weapon.expiresAt > this.now());
    if (!preyTarget) return true;

    const baseMass = Number(config.baseMass) || DEFAULT_CONFIG.baseMass;
    const roleMassRatio = player.mass / Math.max(1, baseMass);
    const isRareWeapon = ['chainsaw', 'blackhole', 'missile'].includes(weaponPickup.target.type);
    if (!hasActiveWeapon && roleMassRatio < 1.6 && personality.weaponFocus >= 0.8) return true;
    if (!hasActiveWeapon && isRareWeapon && weaponPickup.score > preyTarget.score - 0.4) return true;
    if (hasActiveWeapon) return weaponPickup.score > preyTarget.score + 2.8 / Math.max(personality.weaponFocus, 0.5);
    return weaponPickup.score > preyTarget.score + 1.2 / Math.max(personality.weaponFocus, 0.5);
  }

  _rankStrategicGrowthTarget(player, movement, config) {
    const personality = this._personalityTraits(player);
    if (personality.aggression < 1.05 || player.weapon) return null;
    return this._rankPlayerTarget(
      player,
      (other, distance) => this._canStrategicGrowthTarget(player, other, distance, movement, config),
      (other, distance) => this._scoreStrategicGrowthTarget(player, other, distance, movement, config),
      config
    );
  }

  _canStrategicGrowthTarget(player, other, distance, movement, config = DEFAULT_CONFIG) {
    if (!other || other.username === player.username) return false;
    if (this._canAttackPlayerTarget(player, other, distance, movement, config)) return false;

    const personality = this._personalityTraits(player);
    if (personality.aggression < 1.05) return false;

    const massRatio = player.mass / Math.max(other.mass, 1);
    const upperRatio = Number(movement.pressureMassAdvantageRatio) || DEFAULT_CONFIG.movement.pressureMassAdvantageRatio;
    if (massRatio < 0.84 || massRatio >= upperRatio) return false;

    const strategicDistance = this._dynamicHuntDistance(player, other, movement, config) *
      this._clamp(1 + personality.intelligence * 0.18, 1.05, 1.3) +
      player.radius;
    return distance <= strategicDistance;
  }

  _scoreStrategicGrowthTarget(player, other, distance, movement, config = DEFAULT_CONFIG) {
    const personality = this._personalityTraits(player);
    const strategicDistance = this._dynamicHuntDistance(player, other, movement, config) * 1.25;
    const closeness = 1 - Math.min(1, distance / Math.max(strategicDistance, 1));
    const gap = this._pressureMassGap(player, other, config);
    const gapUrgency = this._clamp(1 - gap / 0.34, 0, 1);
    const rivalValue = Math.min(1.3, other.mass / Math.max(player.mass, 1));
    return (1 + closeness * 1.4 + gapUrgency * 1.3 + rivalValue * 0.55) *
      personality.aggression *
      (0.82 + personality.intelligence * 0.22);
  }

  _rankPressureTarget(player, movement, config) {
    const personality = this._personalityTraits(player);
    if (personality.aggression < 1.05 && !player.weapon) return null;
    return this._rankPlayerTarget(
      player,
      (other, distance) => this._canPressurePlayerTarget(player, other, distance, movement, config),
      (other, distance) => this._scorePressureTarget(player, other, distance, movement, config),
      config
    );
  }

  _canPressurePlayerTarget(player, other, distance, movement, config = DEFAULT_CONFIG) {
    if (!other || other.username === player.username) return false;
    if (this._canAttackPlayerTarget(player, other, distance, movement, config)) return false;

    const personality = this._personalityTraits(player);
    if (personality.aggression < 1.05 && !player.weapon) return false;
    if (!player.weapon && other.mass > player.mass * this._effectiveFleeMassRatio(player, movement)) return false;

    const massRatio = player.mass / Math.max(other.mass, 1);
    const minRatio = player.weapon
      ? Number(movement.armedPressureMinMassRatio) || DEFAULT_CONFIG.movement.armedPressureMinMassRatio
      : this._effectivePressureMassRatio(player, other, movement, config, personality);
    if (massRatio < minRatio) return false;

    const gap = this._pressureMassGap(player, other, config);
    const maxGap = player.weapon ? 0.36 : 0.3;
    if (gap > maxGap) return false;

    const pressureDistance = this._dynamicHuntDistance(player, other, movement, config) *
      this._clamp(0.82 + personality.intelligence * 0.12 + personality.aggression * 0.05, 0.85, 1.15) +
      player.radius;
    return distance <= pressureDistance;
  }

  _scorePressureTarget(player, other, distance, movement, config = DEFAULT_CONFIG) {
    const personality = this._personalityTraits(player);
    const pressureDistance = this._dynamicHuntDistance(player, other, movement, config);
    const closeness = 1 - Math.min(1, distance / Math.max(pressureDistance, 1));
    const gap = this._pressureMassGap(player, other, config);
    const gapScore = this._clamp(1 - gap / 0.32, 0, 1);
    const rivalValue = Math.min(1.4, other.mass / Math.max(player.mass, 1));
    const weaponPressure = player.weapon ? this._weaponUtility(player.weapon.type, player.weapon.power) * 0.18 : 0;
    return (
      1.3 +
      gapScore * 2.6 +
      closeness * 1.8 +
      rivalValue * 0.9 +
      weaponPressure
    ) * personality.aggression * (0.72 + personality.intelligence * 0.24);
  }

  _effectivePressureMassRatio(player, other, movement, config = DEFAULT_CONFIG, personality = this._personalityTraits(player)) {
    const base = Number(movement.pressureMassAdvantageRatio) || DEFAULT_CONFIG.movement.pressureMassAdvantageRatio;
    const baseMass = Math.max(1, Number(config.baseMass) || DEFAULT_CONFIG.baseMass);
    const massDominance = this._clamp(((Number(player.mass) || baseMass) / baseMass - 4) / 4.5, 0, 1);
    const riskAppetite = this._riskAppetite(player, config, personality, 0);
    const personalityRelax = this._clamp(
      Math.max(0, personality.aggression - 1) * 0.04 +
        Math.max(0, personality.intelligence - 1) * 0.035 +
        riskAppetite * 0.025,
      0,
      0.08
    );

    return this._clamp(base - massDominance * 0.18 - personalityRelax, 0.9, base);
  }

  _pressureMassGap(player, other, config = DEFAULT_CONFIG) {
    const physics = config.weaponPhysics || DEFAULT_CONFIG.weaponPhysics;
    const hasChainsaw = player.weapon && player.weapon.type === 'chainsaw';
    const hasDash = player.weapon && player.weapon.type === 'dash';
    const requiredMassRatio = hasChainsaw
      ? Number(physics.chainsawRequiredMassRatio) || DEFAULT_CONFIG.weaponPhysics.chainsawRequiredMassRatio
      : hasDash
        ? Number(physics.dashRequiredMassRatio) || DEFAULT_CONFIG.weaponPhysics.dashRequiredMassRatio
        : 1.25;
    const shieldMultiplier = other.weapon && other.weapon.type === 'shield' ? 1.55 : 1;
    const requiredMass = Math.max(1, other.mass * requiredMassRatio * shieldMultiplier);
    return Math.max(0, (requiredMass - player.mass) / requiredMass);
  }

  _rankHuntTarget(player, movement, config) {
    return this._rankPlayerTarget(
      player,
      (other, distance) => this._canAttackPlayerTarget(player, other, distance, movement, config),
      (other, distance) => this._scoreHuntTarget(player, other, distance, movement, config),
      config
    );
  }

  _rankChatHuntTarget(player, movement, config) {
    return this._rankPlayerTarget(
      player,
      (other, distance) => this._canChatHuntTarget(player, other, distance, movement, config),
      (other, distance) => {
        const massRatio = Math.max(0.1, (Number(player.mass) || 1) / Math.max(1, Number(other.mass) || 1));
        const closeness = this._clamp(1 - distance / Math.max(1, Number(movement.huntDistance) || DEFAULT_CONFIG.movement.huntDistance), 0, 1);
        return massRatio * 5 + closeness * 6;
      },
      config
    );
  }

  _canChatHuntTarget(player, other, distance, movement, config = DEFAULT_CONFIG) {
    if (!other || other.username === player.username) return false;
    const maxDistance = (Number(movement.huntDistance) || DEFAULT_CONFIG.movement.huntDistance) * 1.15;
    if (distance > maxDistance) return false;
    const playerMass = Math.max(1, Number(player.mass) || 1);
    const otherMass = Math.max(1, Number(other.mass) || 1);
    const weaponContext = this._weaponAttackContext(player, other, config);
    return weaponContext.canAttack || playerMass >= otherMass * 1.08;
  }

  _canAttackPlayerTarget(player, other, distance, movement, config = DEFAULT_CONFIG) {
    if (!other || other.username === player.username) return false;
    const absorbContext = this._playerAbsorbContext(player, other, config);
    const weaponContext = this._weaponAttackContext(player, other, config);
    if (!absorbContext.canAbsorb && !weaponContext.canAttack) return false;
    if (
      absorbContext.canAbsorb &&
      !weaponContext.canAttack &&
      this._shouldPressureInsteadOfRawHunt(player, other, distance, movement, config, absorbContext)
    ) {
      return false;
    }

    const huntDistance = this._dynamicHuntDistance(player, other, movement, config);
    const weaponRange = weaponContext.range > 0 ? weaponContext.range * 1.2 + player.radius : 0;
    return distance <= Math.max(huntDistance + player.radius, weaponRange);
  }

  _shouldPressureInsteadOfRawHunt(player, other, distance, movement, config = DEFAULT_CONFIG, absorbContext = null) {
    if (!player || !other || player.weapon) return false;
    const baseMass = Math.max(1, Number(config.baseMass) || DEFAULT_CONFIG.baseMass);
    const mass = Math.max(1, Number(player.mass) || baseMass);
    const otherMass = Math.max(1, Number(other.mass) || baseMass);
    const massDominance = mass / baseMass;
    const massAdvantage = mass / otherMass;
    if (massDominance < 5 || massAdvantage < 2.35) return false;

    const personality = this._personalityTraits(player);
    const context = absorbContext || this._playerAbsorbContext(player, other, config);
    const configuredStrikeDistance = Number(movement.huntStrikeDistance) || DEFAULT_CONFIG.movement.huntStrikeDistance;
    const radiusCorridor =
      (Number(context.absorbDistance) || 0) +
      (Number(player.radius) || 0) * 3.1 +
      (Number(other.radius) || 0) * 2.2;
    const dominanceT = this._clamp((massDominance - 5) / 7, 0, 1);
    const overmatchT = this._clamp((massAdvantage - 2.35) / 4.5, 0, 1);
    const ceiling = this._clamp(540 - dominanceT * 120 - overmatchT * 80, 340, 540);
    const tacticalReach = Math.min(
      Math.max(configuredStrikeDistance, radiusCorridor) *
        this._clamp(0.94 + personality.intelligence * 0.1 + personality.aggression * 0.05, 0.98, 1.17),
      ceiling
    );

    return distance > tacticalReach;
  }

  _weaponAttackContext(player, other, config = DEFAULT_CONFIG) {
    const weapon = player.weapon;
    if (!weapon || !weapon.type || (weapon.expiresAt && weapon.expiresAt <= this.now())) {
      return { canAttack: false, range: 0 };
    }

    const physics = config.weaponPhysics || DEFAULT_CONFIG.weaponPhysics;
    const power = Number(weapon.power) || 1;
    const shieldMultiplier = other.weapon && other.weapon.type === 'shield' ? 0.82 : 1;
    const mass = Math.max(1, player.mass);
    const otherMass = Math.max(1, other.mass);

    if (weapon.type === 'laser') {
      return {
        canAttack: otherMass < mass * 0.98 * shieldMultiplier,
        range: (Number(physics.laserRange) || DEFAULT_CONFIG.weaponPhysics.laserRange) + power * 18
      };
    }

    if (weapon.type === 'missile') {
      return {
        canAttack: otherMass < mass * 1.08 * shieldMultiplier,
        range: (Number(physics.missileRange) || DEFAULT_CONFIG.weaponPhysics.missileRange) + power * 20
      };
    }

    if (weapon.type === 'dash') {
      return {
        canAttack: otherMass < mass * 1.12 * shieldMultiplier,
        range: 150 + power * 24 + Math.max(Number(player.radius) || 0, Number(other.radius) || 0)
      };
    }

    if (weapon.type === 'speed') {
      return {
        canAttack: otherMass < mass * 1.02 * shieldMultiplier,
        range: 135 + power * 18 + Math.max(Number(player.radius) || 0, Number(other.radius) || 0)
      };
    }

    if (weapon.type === 'vampire') {
      return {
        canAttack: otherMass < mass * 1.05 * shieldMultiplier,
        range: (Number(physics.vampireRange) || DEFAULT_CONFIG.weaponPhysics.vampireRange) + power * 16
      };
    }

    if (weapon.type === 'blackhole') {
      return {
        canAttack: otherMass < mass * shieldMultiplier,
        range: (Number(physics.blackholeRadius) || DEFAULT_CONFIG.weaponPhysics.blackholeRadius) + power * 24
      };
    }

    if (weapon.type === 'chainsaw') {
      const threatRatio = Number(physics.chainsawThreatMassRatio) ||
        DEFAULT_CONFIG.weaponPhysics.chainsawThreatMassRatio;
      return {
        canAttack: otherMass <= mass * threatRatio * shieldMultiplier,
        range: 110 + power * 26 + Math.max(Number(player.radius) || 0, Number(other.radius) || 0)
      };
    }

    if (weapon.type === 'magnet') {
      return {
        canAttack: otherMass < mass * 0.96 * shieldMultiplier,
        range: (Number(physics.magnetRadius) || DEFAULT_CONFIG.weaponPhysics.magnetRadius) + power * 22
      };
    }

    if (weapon.type === 'pulse' || weapon.type === 'freeze') {
      const rangeKey = weapon.type === 'pulse' ? 'pulseRadius' : 'freezeRadius';
      return {
        canAttack: otherMass < mass * 0.92 * shieldMultiplier,
        range: (Number(physics[rangeKey]) || DEFAULT_CONFIG.weaponPhysics[rangeKey]) + power * 18
      };
    }

    return { canAttack: false, range: 0 };
  }

  _scoreHuntTarget(player, other, distance, movement, config = DEFAULT_CONFIG) {
    const personality = this._personalityTraits(player);
    const huntDistance = this._dynamicHuntDistance(player, other, movement, config);
    const preyLives = this._estimatedLivesForScoring(other, config);
    const playerLives = Math.max(1, this._estimatedLivesForScoring(player, config));
    const preyValue = other.mass / Math.max(player.mass, 1);
    const lifeValue = Math.min(1.8, preyLives / Math.max(Number(config.baseLives) || DEFAULT_CONFIG.baseLives, playerLives * 0.28));
    const closeness = 1 - Math.min(1, distance / Math.max(huntDistance, 1));
    const massAdvantage = player.mass / Math.max(other.mass, 1);
    const predicted = this._predictTargetPosition(other, movement, config);
    const predictedDistance = this._distance(player, predicted);
    const catchability = 1 - Math.min(1, predictedDistance / Math.max(huntDistance, 1));
    const absorbContext = this._playerAbsorbContext(player, other, config);
    const weaponContext = this._weaponAttackContext(player, other, config);
    if (!absorbContext.canAbsorb && !weaponContext.canAttack) return -Infinity;

    const absorbOpportunity = absorbContext.canAbsorb ? 1.1 : 0;
    const weaponPressure = weaponContext.canAttack ? this._weaponUtility(player.weapon.type, player.weapon.power) * 0.24 : 0;
    const preyWeaponPenalty = other.weapon ? this._weaponUtility(other.weapon.type, other.weapon.power) * 0.08 : 0;
    let alignment = 0;
    if (player.vx || player.vy) {
      const playerDirection = this._normalizeVector({ x: player.vx, y: player.vy });
      const toPrey = this._normalizeVector({ x: other.x - player.x, y: other.y - player.y });
      alignment = Math.max(0, playerDirection.x * toPrey.x + playerDirection.y * toPrey.y);
    }
    const rawScore = preyValue * 3.2 +
      lifeValue * 2.6 +
      closeness * 2.4 +
      catchability * 1.8 +
      absorbOpportunity +
      weaponPressure +
      alignment * 0.35 +
      Math.min(1.4, massAdvantage * 0.18) -
      preyWeaponPenalty;
    return rawScore * personality.aggression * (0.72 + personality.intelligence * 0.28);
  }

  _dynamicHuntDistance(player, other, movement, config = DEFAULT_CONFIG) {
    const base = Number(movement.huntDistance) || DEFAULT_CONFIG.movement.huntDistance;
    const personality = this._personalityTraits(player);
    const massAdvantage = player.mass / Math.max(other.mass, 1);
    const aggression = this._clamp((massAdvantage - 1) * 0.28, 0, 0.9);
    const baseMass = Number(config.baseMass) || DEFAULT_CONFIG.baseMass;
    const dominance = this._clamp((player.mass / Math.max(1, baseMass) - 1) * 0.12, 0, 0.35);
    const weaponAggression = player.weapon ? this._clamp(this._weaponUtility(player.weapon.type, player.weapon.power) * 0.035, 0, 0.22) : 0;
    const personalityRange = this._clamp(0.75 + personality.aggression * 0.22 + personality.intelligence * 0.08 - personality.fear * 0.05, 0.7, 1.35);
    return base * (1 + aggression + dominance + weaponAggression) * personalityRange;
  }

  _estimatedLivesForScoring(player, config) {
    const lives = Number(player.lives);
    const mass = Number(player.mass);
    const lastSyncedMass = Number(player._lastSyncedMass);
    const massChangedExternally =
      Number.isFinite(mass) &&
      (!Number.isFinite(lastSyncedMass) || Math.abs(mass - lastSyncedMass) > 0.001);

    if (massChangedExternally || !Number.isFinite(lives)) {
      return this._massToLives(Number.isFinite(mass) ? mass : config.baseMass, config);
    }
    return lives;
  }

  _personalityForUsername(username, config) {
    const profiles = Array.isArray(config.personalityProfiles) && config.personalityProfiles.length
      ? config.personalityProfiles
      : DEFAULT_CONFIG.personalityProfiles;
    const hash = this._hashString(username || 'anonymous');
    const profile = profiles[Math.abs(hash) % profiles.length] || DEFAULT_CONFIG.personalityProfiles[0];
    return this._normalizePersonality(profile);
  }

  _sizeBehaviorProfile(player, config = DEFAULT_CONFIG) {
    const minMass = Number(config.minMass) || DEFAULT_CONFIG.minMass;
    const baseMass = Math.max(1, Number(config.baseMass) || DEFAULT_CONFIG.baseMass);
    const maxMass = Math.max(baseMass + 1, Number(config.maxMass) || DEFAULT_CONFIG.maxMass);
    const mass = this._clamp(
      Number(player && player.mass) || baseMass,
      minMass,
      maxMass
    );
    const smallness = this._clamp((baseMass - mass) / Math.max(1, baseMass - minMass), 0, 1);
    const behaviorCap = Math.min(maxMass, 260);
    const growth = mass <= baseMass ? 0 : this._clamp((mass - baseMass) / Math.max(1, behaviorCap - baseMass), 0, 1);
    const largeStart = Math.min(maxMass * 0.34, baseMass * 3.2);
    const large = this._clamp((mass - largeStart) / Math.max(1, behaviorCap - largeStart), 0, 1);
    const giantStart = Math.min(maxMass * 0.62, baseMass * 9);
    const giant = this._clamp((mass - giantStart) / Math.max(1, maxMass - giantStart), 0, 1);
    const activeWeapon = player && player.weapon && player.weapon.type &&
      (!player.weapon.expiresAt || player.weapon.expiresAt > this.now());
    const weaponLift = activeWeapon
      ? this._clamp(this._weaponUtility(player.weapon.type, player.weapon.power) * 0.035, 0.06, 0.22)
      : 0;
    let sizeClass = 'medium';

    if (smallness > 0.08) {
      sizeClass = 'small';
    } else if (giant > 0) {
      sizeClass = 'giant';
    } else if (large > 0) {
      sizeClass = 'large';
    }

    return {
      sizeClass,
      role: sizeClass === 'small'
        ? 'survive-grow-arm'
        : sizeClass === 'medium'
          ? 'opportunist'
          : sizeClass === 'large'
            ? 'pressure-control'
            : 'zone-predator',
      mass,
      massRatio: Math.round((mass / baseMass) * 1000) / 1000,
      smallness: Math.round(smallness * 1000) / 1000,
      largeness: Math.round(large * 1000) / 1000,
      giantness: Math.round(giant * 1000) / 1000,
      fleeIntentScale: this._clamp(1 + smallness * 0.42 - large * 0.12 - giant * 0.12, 0.78, 1.42),
      survivalIntentScale: this._clamp(1 + smallness * 0.35 - large * 0.08, 0.85, 1.35),
      foodIntentScale: this._clamp(1 + smallness * 0.58 - large * 0.45 - giant * 0.48 - weaponLift * 0.2, 0.32, 1.58),
      weaponIntentScale: this._clamp(1 + smallness * 0.38 + giant * 0.1 - large * 0.04, 0.9, 1.42),
      attackIntentScale: this._clamp(0.68 + growth * 0.55 + large * 0.38 + giant * 0.12 - smallness * 0.82 + weaponLift, 0.24, 1.55),
      pressureIntentScale: this._clamp(0.82 + growth * 0.48 + large * 1.2 + giant * 0.22 - smallness * 0.36 + weaponLift * 0.5, 0.38, 1.6),
      pressureFoodCostScale: this._clamp(1 - large * 2 - giant * 0.35, 0.35, 1)
    };
  }

  _personalityTraits(player) {
    this._cleanupPlayerChatStrategy(player);
    const base = player && player.activeRoleProfile
      ? player.activeRoleProfile
      : player && player.personality;
    const traits = this._normalizePersonality(base);
    const strategy = player && player.strategyOverride;
    let adjusted = traits;

    if (strategy === 'hunt' || strategy === 'attack') {
      adjusted = this._normalizePersonality({
        ...traits,
        aggression: traits.aggression + 0.36,
        fear: traits.fear - 0.22,
        weaponFocus: traits.weaponFocus + 0.08,
        foodFocus: traits.foodFocus - 0.25,
        commitment: traits.commitment + 0.18,
        riskTolerance: traits.riskTolerance + 0.32
      });
    } else if (strategy === 'flee') {
      adjusted = this._normalizePersonality({
        ...traits,
        aggression: traits.aggression - 0.28,
        fear: traits.fear + 0.36,
        weaponFocus: traits.weaponFocus + 0.28,
        foodFocus: traits.foodFocus - 0.05,
        commitment: traits.commitment + 0.12,
        riskTolerance: traits.riskTolerance - 0.3
      });
    } else if (strategy === 'farm') {
      adjusted = this._normalizePersonality({
        ...traits,
        aggression: traits.aggression - 0.26,
        fear: traits.fear + 0.08,
        weaponFocus: traits.weaponFocus + 0.14,
        foodFocus: traits.foodFocus + 0.42,
        commitment: traits.commitment + 0.1,
        riskTolerance: traits.riskTolerance - 0.12
      });
    }

    const streamBoost = this._streamActivityBoost(player);
    if (!streamBoost) {
      return adjusted;
    }

    return this._normalizePersonality({
      ...adjusted,
      aggression: adjusted.aggression + streamBoost.aggressionBoost,
      fear: adjusted.fear - Math.min(0.18, streamBoost.aggressionBoost * 0.42),
      weaponFocus: adjusted.weaponFocus + streamBoost.weaponFocusBoost,
      foodFocus: adjusted.foodFocus + streamBoost.foodFocusBoost,
      commitment: adjusted.commitment + streamBoost.commitmentBoost,
      riskTolerance: adjusted.riskTolerance + streamBoost.riskToleranceBoost
    });
  }

  _streamActivityBoost(player) {
    const now = this.now();
    if (!player || !player.effects || typeof player.effects !== 'object') return null;
    if (!player.effects.streamBoostUntil || now >= player.effects.streamBoostUntil) return null;

    return {
      kind: player.effects.streamBoostKind || 'like',
      speedMultiplier: this._clamp(Number(player.effects.streamBoostMultiplier) || 1, 1, 1.35),
      aggressionBoost: this._clamp(Number(player.effects.streamAggressionBoost) || 0, 0, 0.35),
      foodFocusBoost: this._clamp(Number(player.effects.streamFoodFocusBoost) || 0, 0, 0.35),
      weaponFocusBoost: this._clamp(Number(player.effects.streamWeaponFocusBoost) || 0, 0, 0.35),
      commitmentBoost: this._clamp(Number(player.effects.streamCommitmentBoost) || 0, 0, 0.25),
      riskToleranceBoost: this._clamp(Number(player.effects.streamRiskToleranceBoost) || 0, 0, 0.3)
    };
  }

  _normalizePersonality(profile = {}) {
    const aggression = this._clamp(Number(profile.aggression) || 1, 0.5, 1.7);
    const fear = this._clamp(Number(profile.fear) || 1, 0.5, 1.7);
    const intelligence = this._clamp(Number(profile.intelligence) || 1, 0.45, 1.65);
    const weaponFocus = this._clamp(Number(profile.weaponFocus) || 1, 0.45, 1.7);
    const foodFocus = this._clamp(Number(profile.foodFocus) || 1, 0.45, 1.7);
    const randomness = this._clamp(Number(profile.randomness) || 0.55, 0.15, 1.35);
    const commitment = this._clamp(Number(profile.commitment) || 1, 0.45, 1.7);
    const derivedRiskTolerance = 1 +
      (aggression - 1) * 0.58 +
      (randomness - 0.55) * 0.28 -
      (fear - 1) * 0.46 +
      (weaponFocus - 1) * 0.08;

    return {
      id: profile.id || 'balanced',
      label: profile.label || 'Balanced',
      aggression,
      fear,
      intelligence,
      weaponFocus,
      foodFocus,
      randomness,
      commitment,
      riskTolerance: this._clamp(Number(profile.riskTolerance) || derivedRiskTolerance, 0.35, 1.75)
    };
  }

  _normalizeChatStrategyArgs(argsOrMessage) {
    if (Array.isArray(argsOrMessage)) {
      return argsOrMessage.map(arg => String(arg || '').trim()).filter(Boolean);
    }
    const message = String(argsOrMessage || '').trim();
    if (!message) return [];
    return message.replace(/^[/!]arena\s*/i, '').split(/\s+/).filter(Boolean);
  }

  _normalizeStrategy(strategy) {
    const value = String(strategy || '').trim().toLowerCase();
    if (value === 'attack') return 'hunt';
    return ['hunt', 'flee', 'farm', 'target', 'role'].includes(value) ? value : null;
  }

  _strategyDurationMs(config) {
    return this._clamp(Number(config.chatStrategyDurationMs) || DEFAULT_CONFIG.chatStrategyDurationMs, 1000, 10 * 60 * 1000);
  }

  _strategyCooldownMs(config) {
    return this._clamp(Number(config.chatStrategyCooldownMs) || DEFAULT_CONFIG.chatStrategyCooldownMs, 0, 5 * 60 * 1000);
  }

  _chatStrategyCooldown(player, config) {
    const now = this.now();
    const until = Number(player && player.chatCommandCooldownUntil) || 0;
    if (until <= now) return null;
    return {
      success: false,
      cooldown: true,
      username: player.username,
      remainingMs: until - now,
      availableAt: until
    };
  }

  _cleanupPlayerChatStrategy(player) {
    if (!player) return;
    const now = this.now();
    if (player.strategyExpiresAt && now >= player.strategyExpiresAt) {
      player.strategyOverride = null;
      player.strategyExpiresAt = null;
      player.activeRole = null;
      player.activeRoleProfile = null;
      player.activeRoleExpiresAt = null;
    }
    if (player.targetExpiresAt && now >= player.targetExpiresAt) {
      player.targetUsername = null;
      player.targetExpiresAt = null;
    }
  }

  _normalizeRoleId(roleId, config) {
    const role = String(roleId || '').trim().toLowerCase();
    return this._roleProfile(role, config) ? role : null;
  }

  _roleProfile(roleId, config) {
    const profiles = Array.isArray(config.personalityProfiles) && config.personalityProfiles.length
      ? config.personalityProfiles
      : DEFAULT_CONFIG.personalityProfiles;
    const role = String(roleId || '').trim().toLowerCase();
    const profile = profiles.find(item => String(item && item.id || '').toLowerCase() === role);
    return profile ? this._normalizePersonality(profile) : null;
  }

  _findTargetPlayer(query, ownUsername = '') {
    const needle = String(query || '').trim().toLowerCase();
    if (!needle) return null;
    const normalizedOwn = String(ownUsername || '').toLowerCase();
    let partial = null;
    for (const player of this.players.values()) {
      if (!player || String(player.username || '').toLowerCase() === normalizedOwn) continue;
      const username = String(player.username || '').toLowerCase();
      const nickname = String(player.nickname || '').toLowerCase();
      if (username === needle || nickname === needle) return player;
      if (!partial && (username.includes(needle) || nickname.includes(needle))) {
        partial = player;
      }
    }
    return partial;
  }

  _activeTargetPlayer(player) {
    this._cleanupPlayerChatStrategy(player);
    if (!player || !player.targetUsername) return null;
    const target = this.players.get(player.targetUsername);
    return target || this._findTargetPlayer(player.targetUsername, player.username);
  }

  _formatChatStrategyStatus(player) {
    const parts = [];
    if (player.strategyOverride) parts.push(`strategy ${player.strategyOverride}`);
    if (player.activeRole) parts.push(`role ${player.activeRole}`);
    if (player.targetUsername) parts.push(`target ${player.targetUsername}`);
    return parts.length ? `Arena: ${parts.join(', ')}` : 'Arena: no active strategy';
  }

  _stabilizeBehavior(player, candidate, movement, config = DEFAULT_CONFIG) {
    const previous = player.behaviorMemory;
    if (
      candidate.mode === 'hunt-player' &&
      candidate.target &&
      previous &&
      previous.mode === 'hunt-player' &&
      previous.targetUsername &&
      previous.targetUsername !== candidate.target.username
    ) {
      const previousTarget = this.players.get(previous.targetUsername);
      const memoryMs = Number(movement.behaviorMemoryMs) || DEFAULT_CONFIG.movement.behaviorMemoryMs;
      const switchMargin = Number(movement.targetSwitchScoreMargin) || DEFAULT_CONFIG.movement.targetSwitchScoreMargin;
      const lockedAt = previous.lockedAt || previous.updatedAt || this.now();
      if (previousTarget && this.now() - lockedAt <= memoryMs) {
        const previousDistance = this._distance(player, previousTarget);
        const previousScore = this._scoreHuntTarget(player, previousTarget, previousDistance, movement, config);
        const previousStillValid = this._canAttackPlayerTarget(player, previousTarget, previousDistance, movement, config);
        if (previousStillValid && candidate.score - previousScore < switchMargin) {
          return this._storeBehaviorDecision(player, {
            mode: 'hunt-player',
            target: previousTarget,
            score: previousScore
          }, lockedAt);
        }
      }
    }

    return this._storeBehaviorDecision(player, candidate);
  }

  _storeBehaviorDecision(player, decision, lockedAt = null) {
    const now = this.now();
    const targetUsername = decision.target && decision.target.username ? decision.target.username : null;
    const targetId = decision.target && decision.target.id ? decision.target.id : null;
    const previous = player.behaviorMemory;
    player.behaviorMemory = {
      mode: decision.mode,
      intent: decision.intent || decision.mode,
      state: decision.state || (decision.metadata && decision.metadata.aiState) || null,
      targetUsername,
      targetId,
      score: Number(decision.score) || 0,
      lockedAt: lockedAt || (previous && previous.mode === decision.mode && previous.targetUsername === targetUsername
        ? previous.lockedAt || previous.updatedAt || now
        : now),
      updatedAt: now
    };
    return {
      ...decision,
      intent: decision.intent || decision.mode,
      metadata: decision.metadata || {}
    };
  }

  _wanderVector(player, movement) {
    const now = this.now();
    const interval = Number(movement.wanderTurnIntervalMs) || DEFAULT_CONFIG.movement.wanderTurnIntervalMs;
    if (!player.wanderVector || now - player.wanderVector.updatedAt >= interval) {
      const current = player.wanderVector || this._normalizeVector({ x: player.vx, y: player.vy });
      const baseAngle = Math.atan2(current.y, current.x);
      const turn = (this.random() * 2 - 1) * Math.PI * 0.2;
      player.wanderVector = {
        x: Math.cos(baseAngle + turn),
        y: Math.sin(baseAngle + turn),
        updatedAt: now
      };
    }

    return { x: player.wanderVector.x, y: player.wanderVector.y };
  }

  _bestPlayerTarget(player, predicate, scoreTarget, config = this.getConfig()) {
    const ranked = this._rankPlayerTarget(player, predicate, scoreTarget, config);
    return ranked ? ranked.target : null;
  }

  _rankPlayerTarget(player, predicate, scoreTarget, config = this.getConfig()) {
    let best = null;
    let bestScore = -Infinity;
    const maxDistance = Math.max(
      Number(config.movement?.huntDistance) || DEFAULT_CONFIG.movement.huntDistance,
      Number(config.movement?.fleeDistance) || DEFAULT_CONFIG.movement.fleeDistance,
      Number(config.movement?.weaponSenseDistance) || DEFAULT_CONFIG.movement.weaponSenseDistance
    ) * 2.8;
    for (const other of this._nearbyPlayers(player, maxDistance)) {
      if (other.username === player.username) continue;
      const distance = this._distance(player, other);
      if (!predicate(other, distance)) continue;
      const score = scoreTarget(other, distance);
      if (score > bestScore) {
        best = other;
        bestScore = score;
      }
    }
    return best ? { target: best, score: bestScore } : null;
  }

  _predictTargetPosition(target, movement, config) {
    const leadSeconds = Number(movement.huntLeadSeconds) || 0;
    if (!leadSeconds || (!target.vx && !target.vy)) {
      return target;
    }

    const leadDistance = (Number(movement.baseSpeed) || DEFAULT_CONFIG.movement.baseSpeed) * leadSeconds;
    const velocity = this._constrainVelocityToBounds(target, {
      x: Number(target.vx) || 0,
      y: Number(target.vy) || 0
    }, config);
    return {
      ...target,
      x: this._clamp(target.x + velocity.x * leadDistance, target.radius, config.arenaWidth - target.radius),
      y: this._clamp(target.y + velocity.y * leadDistance, target.radius, config.arenaHeight - target.radius)
    };
  }

  _predictInterceptPosition(player, target, movement, config, personality = this._personalityTraits(player)) {
    const baseSpeed = Number(movement.baseSpeed) || DEFAULT_CONFIG.movement.baseSpeed;
    const distance = this._distance(player, target);
    const playerSpeed = Math.max(1, baseSpeed * this._movementMassMultiplier(player, config));
    const travelSeconds = this._clamp(distance / playerSpeed, 0.18, 1.35);
    const leadSeconds = this._clamp(
      (Number(movement.huntLeadSeconds) || DEFAULT_CONFIG.movement.huntLeadSeconds) *
        (0.65 + personality.intelligence * 0.45) +
        travelSeconds * 0.28,
      0.15,
      1.6
    );
    const velocity = this._constrainVelocityToBounds(target, {
      x: Number(target.vx) || 0,
      y: Number(target.vy) || 0
    }, config);

    return {
      ...target,
      _leadSeconds: leadSeconds,
      x: this._clamp(
        target.x + velocity.x * baseSpeed * leadSeconds,
        target.radius || 0,
        config.arenaWidth - (target.radius || 0)
      ),
      y: this._clamp(
        target.y + velocity.y * baseSpeed * leadSeconds,
        target.radius || 0,
        config.arenaHeight - (target.radius || 0)
      )
    };
  }

  _vectorToTarget(player, target) {
    if (!target) return { x: 1, y: 0 };
    return this._normalizeVector({
      x: target.x - player.x,
      y: target.y - player.y
    }, { x: 0, y: 0 });
  }

  _combineSteeringVectors(parts) {
    const vector = { x: 0, y: 0 };
    for (const part of parts || []) {
      if (!part || !part.vector) continue;
      const weight = Number(part.weight) || 0;
      vector.x += (Number(part.vector.x) || 0) * weight;
      vector.y += (Number(part.vector.y) || 0) * weight;
    }
    return this._normalizeVector(vector, { x: 0, y: 0 });
  }

  _buildSteeringPlan(player, intent, context) {
    const mode = intent && intent.mode ? intent.mode : 'wander';
    const personality = context.personality || this._personalityTraits(player);
    const isFlee = mode === 'flee' || mode === 'evade-weapon';
    const isAttack = mode === 'hunt-player' || mode === 'pressure-player';
    const boundaryTrap = isFlee && this._isBoundaryTrapSteeringIntent(player, intent, context);
    const wallEscape = boundaryTrap
      ? this._wallEscapeVector(
        player,
        (context.threat && context.threat.target) || intent.target,
        context.boundary,
        player.aiIntent
      )
      : null;
    const parts = [];

    const add = (name, vector, weight) => {
      const numericWeight = Number(weight) || 0;
      if (!vector || numericWeight <= 0) return;
      const length = Math.sqrt(
        Math.pow(Number(vector.x) || 0, 2) +
        Math.pow(Number(vector.y) || 0, 2)
      );
      if (length < 0.001) return;
      const normalized = this._normalizeVector(vector);
      parts.push({ name, vector: normalized, weight: numericWeight });
    };

    if (intent && intent.vector) {
      add('intent', wallEscape || intent.vector, isFlee ? 1.15 : isAttack ? 1.8 : 1.45);
    }

    const largeEnemyAvoidance = this._largeEnemyAvoidanceVector(player, context);
    if (context.threat) {
      add(
        'threat',
        wallEscape || largeEnemyAvoidance.vector,
        (isFlee ? 4.2 : 2.1) * personality.fear * largeEnemyAvoidance.intensity
      );
      add('threatRoute', wallEscape || context.threat.vector, (isFlee ? 1.2 : 0.55) * personality.fear);
    }

    if (context.weapon && context.weapon.target) {
      add(
        'weapon',
        this._vectorToTarget(player, context.weapon.target),
        (mode === 'hunt-weapon' || mode === 'evade-weapon' ? 2.4 : isFlee ? 0.85 : 1.25) * personality.weaponFocus
      );
    }

    if (context.prey && context.prey.target) {
      const preyTarget = this._predictInterceptPosition(player, context.prey.target, context.movement, context.config, personality);
      add(
        'prey',
        this._vectorToTarget(player, preyTarget),
        (mode === 'hunt-player' ? 2.45 : mode === 'pressure-player' ? 1.25 : isFlee ? 0.2 : 0.85) *
          personality.aggression
      );
    }

    if (context.food && context.food.target) {
      const foodTarget = context.food.steeringTarget || context.food.target;
      add(
        'food',
        this._vectorToTarget(player, foodTarget),
        (mode === 'hunt-food' ? 2.15 : isFlee ? 0.75 : 1.05) * personality.foodFocus
      );
    }

    const separation = this._separationVector(player, context.config);
    add('separation', separation.vector, separation.intensity * (isAttack ? 0.65 : 1.2));
    add('boundary', context.boundary, isFlee ? 5.5 : 0.75);

    if (parts.length === 0) {
      add('wander', this._wanderVector(player, context.movement), Math.max(0.2, personality.randomness));
    }

    return this._weightedSteering(parts, this._stableSteeringFallback(player, intent));
  }

  _stableSteeringFallback(player, intent) {
    const currentVelocity = {
      x: Number(player && player.vx) || 0,
      y: Number(player && player.vy) || 0
    };
    const currentLength = Math.sqrt(currentVelocity.x * currentVelocity.x + currentVelocity.y * currentVelocity.y);
    if (currentLength > 0.001) return currentVelocity;

    if (intent && intent.vector) {
      const intentVector = {
        x: Number(intent.vector.x) || 0,
        y: Number(intent.vector.y) || 0
      };
      const intentLength = Math.sqrt(intentVector.x * intentVector.x + intentVector.y * intentVector.y);
      if (intentLength > 0.001) return intentVector;
    }

    const previous = player && player.aiIntent && player.aiIntent.vector ? player.aiIntent.vector : null;
    if (previous) {
      const previousVector = {
        x: Number(previous.x) || 0,
        y: Number(previous.y) || 0
      };
      const previousLength = Math.sqrt(previousVector.x * previousVector.x + previousVector.y * previousVector.y);
      if (previousLength > 0.001) return previousVector;
    }

    return { x: 1, y: 0 };
  }

  _weightedSteering(parts, fallbackVector = null) {
    const vector = { x: 0, y: 0 };
    const weights = {
      intent: 0,
      threat: 0,
      threatRoute: 0,
      weapon: 0,
      prey: 0,
      food: 0,
      separation: 0,
      boundary: 0,
      wander: 0,
      stabilized: 0
    };

    for (const part of parts || []) {
      if (!part || !part.vector) continue;
      const weight = Number(part.weight) || 0;
      if (weight <= 0) continue;
      vector.x += (Number(part.vector.x) || 0) * weight;
      vector.y += (Number(part.vector.y) || 0) * weight;
      if (Object.prototype.hasOwnProperty.call(weights, part.name)) {
        weights[part.name] += weight;
      }
    }

    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
    if (length < 0.001 && fallbackVector) {
      const fallback = {
        x: Number(fallbackVector.x) || 0,
        y: Number(fallbackVector.y) || 0
      };
      const fallbackLength = Math.sqrt(fallback.x * fallback.x + fallback.y * fallback.y);
      if (fallbackLength > 0.001) {
        weights.stabilized = 1;
        return {
          vector: { x: fallback.x / fallbackLength, y: fallback.y / fallbackLength },
          weights: Object.fromEntries(
            Object.entries(weights).map(([key, value]) => [key, Math.round(value * 100) / 100])
          )
        };
      }
    }

    return {
      vector: this._normalizeVector(vector),
      weights: Object.fromEntries(
        Object.entries(weights).map(([key, value]) => [key, Math.round(value * 100) / 100])
      )
    };
  }

  _separationVector(player, config) {
    const radius = Math.max(player.radius * 3.5, 82);
    const vector = { x: 0, y: 0 };
    let intensity = 0;

    for (const other of this._nearbyPlayers(player, radius + player.radius)) {
      if (other.username === player.username) continue;
      const distance = Math.max(0.1, this._distance(player, other));
      if (distance > radius) continue;
      const away = this._normalizeVector({ x: player.x - other.x, y: player.y - other.y });
      const closeness = 1 - Math.min(1, distance / radius);
      const massPressure = this._clamp((Number(other.mass) || 0) / Math.max(Number(player.mass) || 1, 1), 0.65, 2.2);
      const weight = closeness * massPressure;
      vector.x += away.x * weight;
      vector.y += away.y * weight;
      intensity += weight;
    }

    return {
      vector: this._normalizeVector(vector, { x: 0, y: 0 }),
      intensity: this._clamp(intensity, 0, 2.4)
    };
  }

  _largeEnemyAvoidanceVector(player, context) {
    const movement = context.movement || DEFAULT_CONFIG.movement;
    const config = context.config || DEFAULT_CONFIG;
    const radius = (Number(movement.fleeDistance) || DEFAULT_CONFIG.movement.fleeDistance) + player.radius * 2;
    const vector = { x: 0, y: 0 };
    let intensity = 0;

    for (const other of this._nearbyPlayers(player, radius)) {
      if (other.username === player.username) continue;
      if ((Number(other.mass) || 0) <= (Number(player.mass) || 0) * 1.02) continue;

      const distance = Math.max(0.1, this._distance(player, other));
      const dynamicRadius = this._dynamicFleeDistance(player, other, movement, config) + other.radius;
      if (distance > dynamicRadius) continue;

      const away = this._normalizeVector({ x: player.x - other.x, y: player.y - other.y });
      const massRatio = (Number(other.mass) || 1) / Math.max(Number(player.mass) || 1, 1);
      const closeness = 1 - Math.min(1, distance / Math.max(dynamicRadius, 1));
      const weight = closeness * this._clamp(massRatio, 1, 4);
      vector.x += away.x * weight;
      vector.y += away.y * weight;
      intensity += weight;
    }

    return {
      vector: this._normalizeVector(vector, { x: 0, y: 0 }),
      intensity: this._clamp(intensity || (context.threat ? 1 : 0), 0, 3.2)
    };
  }

  _boundaryAvoidanceVector(player, config) {
    const movement = config.movement || DEFAULT_CONFIG.movement;
    const margin = Number(movement.boundaryAvoidanceDistance) || 0;
    if (margin <= 0) return { x: 0, y: 0 };

    const vector = { x: 0, y: 0 };
    const left = player.x - player.radius;
    const right = config.arenaWidth - player.radius - player.x;
    const top = player.y - player.radius;
    const bottom = config.arenaHeight - player.radius - player.y;

    if (left < margin) vector.x += (margin - left) / margin;
    if (right < margin) vector.x -= (margin - right) / margin;
    if (top < margin) vector.y += (margin - top) / margin;
    if (bottom < margin) vector.y -= (margin - bottom) / margin;

    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
    if (!length) return vector;
    if (length <= 1) return vector;
    return { x: vector.x / length, y: vector.y / length };
  }

  _hardBoundarySlack(player, config) {
    const movement = config.movement || DEFAULT_CONFIG.movement;
    const softMargin = Number(movement.boundaryAvoidanceDistance) || DEFAULT_CONFIG.movement.boundaryAvoidanceDistance;
    const radius = Number(player.radius) || 0;
    return this._clamp(Math.max(6, radius * 0.35), 6, Math.max(8, softMargin * 0.3));
  }

  _redirectBlockedMovement(player, vector, config) {
    const escape = this._boundaryAvoidanceVector(player, config);
    const desired = this._normalizeVector(vector, { x: 0, y: 0 });
    if (this._vectorLength(desired) < 0.001) {
      return this._vectorLength(escape) > 0.001 ? escape : desired;
    }
    const edgeSlack = this._hardBoundarySlack(player, config);
    const minX = player.radius + edgeSlack;
    const maxX = config.arenaWidth - player.radius - edgeSlack;
    const minY = player.radius + edgeSlack;
    const maxY = config.arenaHeight - player.radius - edgeSlack;
    let adjusted = { ...desired };
    let blocked = false;

    if (player.x <= minX && adjusted.x < 0) {
      adjusted.x = 0;
      blocked = true;
    } else if (player.x >= maxX && adjusted.x > 0) {
      adjusted.x = 0;
      blocked = true;
    }

    if (player.y <= minY && adjusted.y < 0) {
      adjusted.y = 0;
      blocked = true;
    } else if (player.y >= maxY && adjusted.y > 0) {
      adjusted.y = 0;
      blocked = true;
    }

    if (!blocked) return desired;

    adjusted = {
      x: adjusted.x + escape.x * 0.9,
      y: adjusted.y + escape.y * 0.9
    };
    return this._normalizeVector(adjusted, this._vectorLength(escape) > 0.001 ? escape : desired);
  }

  _blockedMovementRatio(player, vector, step, config) {
    const distance = Math.max(1, Number(step) || 1);
    const rawX = player.x + (Number(vector.x) || 0) * distance;
    const rawY = player.y + (Number(vector.y) || 0) * distance;
    const clampedX = this._clamp(rawX, player.radius, config.arenaWidth - player.radius);
    const clampedY = this._clamp(rawY, player.radius, config.arenaHeight - player.radius);
    const clippedDistance = Math.sqrt(
      Math.pow(rawX - clampedX, 2) +
      Math.pow(rawY - clampedY, 2)
    ) / distance;
    let blockedAxisPenalty = 0;

    if (player.x <= player.radius + 1 && vector.x < 0) blockedAxisPenalty += 0.45;
    if (player.x >= config.arenaWidth - player.radius - 1 && vector.x > 0) blockedAxisPenalty += 0.45;
    if (player.y <= player.radius + 1 && vector.y < 0) blockedAxisPenalty += 0.45;
    if (player.y >= config.arenaHeight - player.radius - 1 && vector.y > 0) blockedAxisPenalty += 0.45;

    return this._clamp(clippedDistance + blockedAxisPenalty, 0, 1.8);
  }

  _constrainVelocityToBounds(entity, velocity, config) {
    const radius = Number(entity.radius) || 0;
    const edgeSlack = 1.5;
    let vx = Number(velocity.x) || 0;
    let vy = Number(velocity.y) || 0;

    if (entity.x <= radius + edgeSlack && vx < 0) vx = 0;
    if (entity.x >= config.arenaWidth - radius - edgeSlack && vx > 0) vx = 0;
    if (entity.y <= radius + edgeSlack && vy < 0) vy = 0;
    if (entity.y >= config.arenaHeight - radius - edgeSlack && vy > 0) vy = 0;

    return { x: vx, y: vy };
  }

  _containPlayerInArena(player, config) {
    const minX = player.radius;
    const maxX = config.arenaWidth - player.radius;
    const minY = player.radius;
    const maxY = config.arenaHeight - player.radius;
    let hitBoundary = false;

    if (player.x < minX) {
      player.x = minX;
      if (player.vx < 0) player.vx = 0;
      hitBoundary = true;
    } else if (player.x > maxX) {
      player.x = maxX;
      if (player.vx > 0) player.vx = 0;
      hitBoundary = true;
    }

    if (player.y < minY) {
      player.y = minY;
      if (player.vy < 0) player.vy = 0;
      hitBoundary = true;
    } else if (player.y > maxY) {
      player.y = maxY;
      if (player.vy > 0) player.vy = 0;
      hitBoundary = true;
    }

    if (!hitBoundary) return;

    const slideLength = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
    if (slideLength > 0.001) {
      player.vx /= slideLength;
      player.vy /= slideLength;
      return;
    }

    const escape = this._boundaryAvoidanceVector(player, config);
    const redirected = {
      x: player.vx + escape.x * 0.35,
      y: player.vy + escape.y * 0.35
    };
    const length = Math.sqrt(redirected.x * redirected.x + redirected.y * redirected.y);
    if (length > 0.001) {
      player.vx = redirected.x / length;
      player.vy = redirected.y / length;
    }
  }

  _nearestPlayer(player, predicate) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const other of this.players.values()) {
      if (other.username === player.username || !predicate(other)) continue;
      const distance = this._distance(player, other);
      if (distance < nearestDistance) {
        nearest = other;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  _nearestFood(player, maxDistance) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const food of this.food.values()) {
      const distance = this._distance(player, food);
      if (distance <= maxDistance && distance < nearestDistance) {
        nearest = food;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  _normalizeViewer(data = {}) {
    const username = this._viewerPrimaryUsername(data);
    return {
      username: username ? String(username) : '',
      nickname: data.nickname || data.displayName || data.username || username || 'Anonymous',
      profilePictureUrl: this._profilePictureUrl(data.profilePictureUrl || data.avatar || data.profilePicture?.url),
      identityAliases: this._viewerIdentityAliases(data, username)
    };
  }

  _profilePictureUrl(value) {
    const rawUrl = String(value || '').trim();
    if (!rawUrl) return '';

    try {
      const parsed = new URL(rawUrl);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? rawUrl : '';
    } catch (_) {
      return '';
    }
  }

  _isSpawnableProfilePictureUrl(value) {
    return Boolean(this._profilePictureUrl(value));
  }

  _adoptViewerProfilePicture(viewer, ...sources) {
    if (!viewer) return false;
    const candidates = [viewer.profilePictureUrl];
    for (const source of sources) {
      candidates.push(source && typeof source === 'object' ? source.profilePictureUrl : source);
    }

    for (const candidate of candidates) {
      const profilePictureUrl = this._profilePictureUrl(candidate);
      if (!profilePictureUrl) continue;
      viewer.profilePictureUrl = profilePictureUrl;
      return true;
    }
    return false;
  }

  _missingProfilePictureResponse() {
    return {
      success: false,
      error: 'Profile picture required to spawn',
      reason: 'missing-profile-picture'
    };
  }

  _viewerPrimaryUsername(data = {}) {
    const user = data.user && typeof data.user === 'object' ? data.user : {};
    return data.uniqueId ||
      data.username ||
      (typeof data.user === 'string' ? data.user : '') ||
      user.uniqueId ||
      user.username ||
      data.userId ||
      data.uid ||
      data.user_id ||
      user.userId ||
      user.id ||
      data.nickname ||
      data.displayName ||
      user.nickname ||
      user.displayName ||
      '';
  }

  _viewerIdentityAliases(data = {}, username = '') {
    const user = data.user && typeof data.user === 'object' ? data.user : {};
    const aliases = [];
    const addAlias = (kind, value) => {
      const text = String(value || '').trim();
      if (!text) return;
      const normalized = text.toLowerCase();
      aliases.push(`${kind}:${normalized}`);
      if (kind !== 'nickname') aliases.push(`id:${normalized}`);
    };

    addAlias('uniqueId', data.uniqueId);
    addAlias('userId', data.userId);
    addAlias('userId', data.uid);
    addAlias('userId', data.user_id);
    addAlias('username', data.username);
    addAlias('username', typeof data.user === 'string' ? data.user : '');
    addAlias('nickname', data.nickname);
    addAlias('nickname', data.displayName);
    addAlias('uniqueId', user.uniqueId);
    addAlias('userId', user.userId);
    addAlias('userId', user.id);
    addAlias('username', user.username);
    addAlias('nickname', user.nickname);
    addAlias('nickname', user.displayName);
    addAlias('username', username);

    return Array.from(new Set(aliases));
  }

  _avatarProxyUrl(profilePictureUrl) {
    const rawUrl = String(profilePictureUrl || '').trim();
    if (!rawUrl) return '';

    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return '';
      }
      return `/api/game-engine/arena/avatar?url=${encodeURIComponent(rawUrl)}`;
    } catch (_) {
      return '';
    }
  }

  _serializePlayer(player, config = this.getConfig()) {
    this._cleanupPlayerChatStrategy(player);
    const profilePictureUrl = player.profilePictureUrl || '';
    return {
      username: player.username,
      nickname: player.nickname,
      profilePictureUrl,
      profilePictureProxyUrl: this._avatarProxyUrl(profilePictureUrl),
      x: Math.round(player.x * 100) / 100,
      y: Math.round(player.y * 100) / 100,
      vx: Math.round(player.vx * 1000) / 1000,
      vy: Math.round(player.vy * 1000) / 1000,
      radius: Math.round(player.radius * 100) / 100,
      mass: Math.round(player.mass * 100) / 100,
      lives: Math.round((player.lives || 0) * 100) / 100,
      energy: Math.round(player.energy * 100) / 100,
      abilities: this._serializeAbilities(player, config),
      score: Math.round(player.score * 100) / 100,
      kills: player.kills,
      extraLives: Math.max(0, Math.floor(Number(player.extraLives) || 0)),
      color: player.color,
      personality: player.personality ? { ...player.personality } : null,
      strategy: player.strategyOverride || null,
      strategyExpiresAt: player.strategyExpiresAt || null,
      targetUsername: player.targetUsername || null,
      targetExpiresAt: player.targetExpiresAt || null,
      activeRole: player.activeRole || null,
      ai: this._serializeAiState(player, config),
      weapon: player.weapon ? { ...player.weapon } : null,
      lastActivityAt: player.lastActivityAt
    };
  }

  _serializeMine(mine) {
    return {
      id: mine.id,
      owner: mine.owner,
      x: Math.round(mine.x * 100) / 100,
      y: Math.round(mine.y * 100) / 100,
      radius: Math.round(mine.radius * 100) / 100,
      power: Math.round(mine.power * 100) / 100,
      spawnedAt: mine.spawnedAt,
      expiresAt: mine.expiresAt
    };
  }

  _abilityState(player, ability, config = this.getConfig()) {
    if (!player.abilities || typeof player.abilities !== 'object') player.abilities = {};
    if (!player.abilities[ability]) player.abilities[ability] = { availableAt: this.now() + config.abilityChargeMs, activeUntil: 0 };
    return player.abilities[ability];
  }

  _serializeAbilities(player, config = this.getConfig()) {
    const now = this.now();
    const charge = Math.max(1, Number(config.abilityChargeMs) || 60000);
    return Object.fromEntries(['boost', 'shield'].map(ability => {
      const state = this._abilityState(player, ability, config);
      return [ability, {
        active: now < state.activeUntil,
        ready: now >= state.availableAt,
        activeUntil: state.activeUntil,
        availableAt: state.availableAt,
        chargeProgress: Math.round(this._clamp(1 - Math.max(0, state.availableAt - now) / charge, 0, 1) * 100) / 100
      }];
    }));
  }

  _isShieldActive(player, now = this.now()) {
    return Boolean(player && this._abilityState(player, 'shield', this.getConfig()).activeUntil > now);
  }

  _serializeWeaponPickup(pickup) {
    return {
      id: pickup.id,
      type: pickup.type,
      tier: pickup.tier,
      power: Math.round(pickup.power * 100) / 100,
      durationMs: pickup.durationMs,
      x: Math.round(pickup.x * 100) / 100,
      y: Math.round(pickup.y * 100) / 100,
      radius: Math.round(pickup.radius * 100) / 100,
      spawnedAt: pickup.spawnedAt,
      expiresAt: pickup.expiresAt
    };
  }

  _syncRadius(player, config) {
    const currentMass = Number(player.mass);
    const expectedMass = Number.isFinite(Number(player.lives))
      ? this._livesToMass(Number(player.lives), config)
      : NaN;
    const externalMassChanged =
      Number.isFinite(currentMass) &&
      Number.isFinite(Number(player._lastSyncedMass)) &&
      Math.abs(currentMass - Number(player._lastSyncedMass)) > 0.001 &&
      (!Number.isFinite(expectedMass) || Math.abs(currentMass - expectedMass) > 0.001);

    if (!Number.isFinite(Number(player.lives)) || externalMassChanged) {
      player.lives = this._massToLives(Number.isFinite(currentMass) ? currentMass : config.baseMass, config);
    }

    player.lives = this._clamp(Number(player.lives), config.minLives, config.maxLives);
    player.mass = this._livesToMass(player.lives, config);
    player.radius = this._clamp(Math.sqrt(player.mass) * 4, 10, Math.sqrt(config.maxMass) * 4.6);
    player._lastSyncedMass = player.mass;
  }

  _ensureLives(player, config) {
    this._syncRadius(player, config);
    return player.lives;
  }

  _livesToMass(lives, config) {
    const baseLives = Math.max(1, Number(config.baseLives) || DEFAULT_CONFIG.baseLives);
    const baseMass = Math.max(1, Number(config.baseMass) || DEFAULT_CONFIG.baseMass);
    const scale = baseMass / Math.sqrt(baseLives);
    return this._clamp(Math.sqrt(Math.max(0, Number(lives) || 0)) * scale, config.minMass, config.maxMass);
  }

  _massToLives(mass, config) {
    const baseLives = Math.max(1, Number(config.baseLives) || DEFAULT_CONFIG.baseLives);
    const baseMass = Math.max(1, Number(config.baseMass) || DEFAULT_CONFIG.baseMass);
    const scale = baseMass / Math.sqrt(baseLives);
    const lives = Math.pow(Math.max(0, Number(mass) || 0) / scale, 2);
    return this._clamp(lives, config.minLives, config.maxLives);
  }

  _massDeltaToLifeDelta(currentMass, massDelta, config) {
    const startMass = this._clamp(Number(currentMass) || config.baseMass, config.minMass, config.maxMass);
    const targetMass = this._clamp(startMass + (Number(massDelta) || 0), config.minMass, config.maxMass);
    return this._massToLives(targetMass, config) - this._massToLives(startMass, config);
  }

  _addLives(player, amount, config) {
    const before = this._ensureLives(player, config);
    const delta = Number(amount) || 0;
    if (delta < 0 && this._isShieldActive(player)) return 0;
    player.lives = this._clamp(before + delta, config.minLives, config.maxLives);
    this._syncRadius(player, config);
    return player.lives - before;
  }

  _addMassEquivalent(player, massDelta, config) {
    this._syncRadius(player, config);
    const livesDelta = this._massDeltaToLifeDelta(player.mass, Number(massDelta) || 0, config);
    return this._addLives(player, livesDelta, config);
  }

  _applySlow(player, multiplier, durationMs, now = this.now()) {
    if (this._isShieldActive(player, now)) return;
    if (!player.effects || typeof player.effects !== 'object') {
      player.effects = {};
    }
    const nextUntil = now + Math.max(0, Number(durationMs) || 0);
    player.effects.slowedUntil = Math.max(Number(player.effects.slowedUntil) || 0, nextUntil);
    player.effects.slowMultiplier = Math.min(
      Number(player.effects.slowMultiplier) || 1,
      this._clamp(Number(multiplier) || 1, 0.15, 1)
    );
  }

  _cleanupPlayerEffects(player, now = this.now()) {
    if (!player.effects || typeof player.effects !== 'object') {
      player.effects = {};
      return;
    }
    if (player.effects.slowedUntil && now >= player.effects.slowedUntil) {
      delete player.effects.slowedUntil;
      delete player.effects.slowMultiplier;
    }
    if (player.effects.streamBoostUntil && now >= player.effects.streamBoostUntil) {
      delete player.effects.streamBoostUntil;
      delete player.effects.streamBoostKind;
      delete player.effects.streamBoostMultiplier;
      delete player.effects.streamAggressionBoost;
      delete player.effects.streamFoodFocusBoost;
      delete player.effects.streamWeaponFocusBoost;
      delete player.effects.streamCommitmentBoost;
      delete player.effects.streamRiskToleranceBoost;
    }
  }

  _statusSpeedMultiplier(player) {
    const now = this.now();
    let streamMultiplier = 1;
    if (this._abilityState(player, 'boost', this.getConfig()).activeUntil > now) {
      streamMultiplier *= 1.7;
    }
    if (player.effects?.streamBoostUntil && now < player.effects.streamBoostUntil) {
      streamMultiplier = this._clamp(Number(player.effects.streamBoostMultiplier) || 1, 1, 1.35);
    }
    if (player.effects?.slowedUntil && now < player.effects.slowedUntil) {
      return this._clamp(Number(player.effects.slowMultiplier) || 1, 0.15, 1) * streamMultiplier;
    }
    return streamMultiplier;
  }

  _distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _normalizeVector(vector) {
    const fallback = arguments.length > 1 ? arguments[1] : { x: 1, y: 0 };
    const x = Number(vector && vector.x) || 0;
    const y = Number(vector && vector.y) || 0;
    const length = Math.sqrt(x * x + y * y);
    if (!length) return { x: Number(fallback.x) || 0, y: Number(fallback.y) || 0 };
    return { x: x / length, y: y / length };
  }

  _vectorLength(vector) {
    const x = Number(vector && vector.x) || 0;
    const y = Number(vector && vector.y) || 0;
    return Math.sqrt(x * x + y * y);
  }

  _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  _colorForUsername(username) {
    const hash = this._hashString(username);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 78%, 58%)`;
  }

  _hashString(value) {
    const input = String(value || '');
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash) + input.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  _mergeConfig(base, override) {
    const output = Array.isArray(base)
      ? base.map(item => this._cloneConfigValue(item))
      : Object.fromEntries(Object.entries(base || {}).map(([key, value]) => [key, this._cloneConfigValue(value)]));
    for (const [key, value] of Object.entries(override || {})) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        base &&
        base[key] &&
        typeof base[key] === 'object' &&
        !Array.isArray(base[key])
      ) {
        output[key] = this._mergeConfig(base[key], value);
      } else {
        output[key] = value;
      }
    }
    return output;
  }

  _cloneConfigValue(value) {
    if (Array.isArray(value)) {
      return value.map(item => this._cloneConfigValue(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, this._cloneConfigValue(nested)]));
    }
    return value;
  }

  _normalizeConfig(config, stored) {
    const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    config.directAbilitiesEnabled = config.directAbilitiesEnabled !== false;
    config.abilityChargeMs = this._clamp(Number(config.abilityChargeMs) || 60000, 10000, 300000);
    config.boostDurationMs = this._clamp(Number(config.boostDurationMs) || 6000, 1000, 30000);
    config.shieldDurationMs = this._clamp(Number(config.shieldDurationMs) || 8000, 1000, 30000);
    config.boostColor = validColor(config.boostColor) ? config.boostColor.toUpperCase() : '#EF4444';
    config.shieldColor = validColor(config.shieldColor) ? config.shieldColor.toUpperCase() : '#3B82F6';
    config.bombCooldownMs = this._clamp(Number(config.bombCooldownMs) || 15000, 1000, 120000);
    config.bombSpeed = this._clamp(Number(config.bombSpeed) || 650, 120, 1800);
    config.bombRange = this._clamp(Number(config.bombRange) || 420, 80, 1200);
    config.bombBlastRadius = this._clamp(Number(config.bombBlastRadius) || 92, 30, 260);
    if (
      Number(stored?.tickRateMs) === LEGACY_DEFAULT_TICK_RATE_MS ||
      Number(stored?.tickRateMs) === PREVIOUS_DEFAULT_TICK_RATE_MS
    ) {
      config.tickRateMs = DEFAULT_CONFIG.tickRateMs;
    }
    if (
      Number(stored?.stateEmitIntervalMs) === LEGACY_DEFAULT_STATE_EMIT_INTERVAL_MS ||
      Number(stored?.stateEmitIntervalMs) === PREVIOUS_DEFAULT_STATE_EMIT_INTERVAL_MS ||
      Number(stored?.stateEmitIntervalMs) === PREVIOUS_HIGH_FREQUENCY_STATE_EMIT_INTERVAL_MS
    ) {
      config.stateEmitIntervalMs = DEFAULT_CONFIG.stateEmitIntervalMs;
    }
    if (
      Number(stored?.targetFps) === LEGACY_DEFAULT_TARGET_FPS ||
      Number(stored?.targetFps) === PREVIOUS_HIGH_DEFAULT_TARGET_FPS
    ) {
      config.targetFps = DEFAULT_CONFIG.targetFps;
    }
    if (Number(stored?.renderScale) === 0.75) {
      config.renderScale = DEFAULT_CONFIG.renderScale;
    }
    if (Number(stored?.maxRenderPlayers) === 60) {
      config.maxRenderPlayers = DEFAULT_CONFIG.maxRenderPlayers;
    }
    if (Number(stored?.inactivityGraceMs) === LEGACY_DEFAULT_INACTIVITY_GRACE_MS) {
      config.inactivityGraceMs = DEFAULT_CONFIG.inactivityGraceMs;
    }
    if (Number(stored?.inactivityShrinkPerSecond) === LEGACY_DEFAULT_INACTIVITY_SHRINK_PER_SECOND) {
      config.inactivityShrinkPerSecond = DEFAULT_CONFIG.inactivityShrinkPerSecond;
    }
    if (
      Number(stored?.maxMass) === LEGACY_DEFAULT_MAX_MASS ||
      Number(stored?.maxMass) === PREVIOUS_DEFAULT_MAX_MASS ||
      Number(stored?.maxMass) === PREVIOUS_ACTION_MAX_MASS
    ) {
      config.maxMass = DEFAULT_CONFIG.maxMass;
    }
    if (
      Number(stored?.maxLives) === LEGACY_DEFAULT_MAX_LIVES ||
      Number(stored?.maxLives) === PREVIOUS_DEFAULT_MAX_LIVES ||
      Number(stored?.maxLives) === PREVIOUS_ACTION_MAX_LIVES
    ) {
      config.maxLives = DEFAULT_CONFIG.maxLives;
    }
    if (
      Number(stored?.playerAbsorbMassRatio) === PREVIOUS_DEFAULT_PLAYER_ABSORB_MASS_RATIO ||
      Number(stored?.playerAbsorbMassRatio) === PREVIOUS_LOW_PLAYER_ABSORB_MASS_RATIO ||
      Number(stored?.playerAbsorbMassRatio) === PREVIOUS_ACTION_PLAYER_ABSORB_MASS_RATIO
    ) {
      config.playerAbsorbMassRatio = DEFAULT_CONFIG.playerAbsorbMassRatio;
    }
    if (Number(stored?.playerAbsorbMassRatio) === 0.9) {
      config.playerAbsorbMassRatio = DEFAULT_CONFIG.playerAbsorbMassRatio;
    }
    if (Number(stored?.playerAbsorbLifeStealRatio) === 0.9) {
      config.playerAbsorbLifeStealRatio = DEFAULT_CONFIG.playerAbsorbLifeStealRatio;
    }
    if (
      Number(stored?.playerAbsorbLifeStealRatio) === PREVIOUS_DEFAULT_PLAYER_ABSORB_LIFE_STEAL_RATIO ||
      Number(stored?.playerAbsorbLifeStealRatio) === PREVIOUS_LOW_PLAYER_ABSORB_LIFE_STEAL_RATIO ||
      Number(stored?.playerAbsorbLifeStealRatio) === PREVIOUS_ACTION_PLAYER_ABSORB_LIFE_STEAL_RATIO
    ) {
      config.playerAbsorbLifeStealRatio = DEFAULT_CONFIG.playerAbsorbLifeStealRatio;
    }
    if (
      Number(stored?.deathFoodDropCount) === PREVIOUS_DEFAULT_DEATH_FOOD_DROP_COUNT ||
      Number(stored?.deathFoodDropCount) === PREVIOUS_LOW_DEATH_FOOD_DROP_COUNT ||
      Number(stored?.deathFoodDropCount) === PREVIOUS_ACTION_DEATH_FOOD_DROP_COUNT
    ) {
      config.deathFoodDropCount = DEFAULT_CONFIG.deathFoodDropCount;
    }
    if (
      Number(stored?.deathFoodDropValue) === PREVIOUS_DEFAULT_DEATH_FOOD_DROP_VALUE ||
      Number(stored?.deathFoodDropValue) === PREVIOUS_LOW_DEATH_FOOD_DROP_VALUE ||
      Number(stored?.deathFoodDropValue) === PREVIOUS_ACTION_DEATH_FOOD_DROP_VALUE
    ) {
      config.deathFoodDropValue = DEFAULT_CONFIG.deathFoodDropValue;
    }
    if (
      Number(stored?.maxFood) === LEGACY_DEFAULT_MAX_FOOD ||
      Number(stored?.maxFood) === PREVIOUS_SPARSE_MAX_FOOD
    ) {
      config.maxFood = DEFAULT_CONFIG.maxFood;
    }
    if (
      Number(stored?.maxFoodRender) === LEGACY_DEFAULT_MAX_FOOD_RENDER ||
      Number(stored?.maxFoodRender) === PREVIOUS_SPARSE_MAX_FOOD_RENDER ||
      Number(stored?.maxFoodRender) === PREVIOUS_HIGH_MAX_FOOD_RENDER
    ) {
      config.maxFoodRender = DEFAULT_CONFIG.maxFoodRender;
    }
    if (Number(stored?.foodValue) === LEGACY_DEFAULT_FOOD_VALUE) {
      config.foodValue = DEFAULT_CONFIG.foodValue;
    }
    if (!Number.isFinite(Number(config.foodSpawnIntervalMs)) || Number(config.foodSpawnIntervalMs) < 0) {
      config.foodSpawnIntervalMs = DEFAULT_CONFIG.foodSpawnIntervalMs;
    }
    if (!Number.isFinite(Number(config.foodSpawnBatchSize)) || Number(config.foodSpawnBatchSize) < 1) {
      config.foodSpawnBatchSize = DEFAULT_CONFIG.foodSpawnBatchSize;
    }
    if (!Number.isFinite(Number(config.foodDespawnMs)) || Number(config.foodDespawnMs) < 0) {
      config.foodDespawnMs = DEFAULT_CONFIG.foodDespawnMs;
    }
    if (!Number.isFinite(Number(config.foodBurstDespawnMs)) || Number(config.foodBurstDespawnMs) < 0) {
      config.foodBurstDespawnMs = DEFAULT_CONFIG.foodBurstDespawnMs;
    }
    if (!Number.isFinite(Number(config.lifeDropDespawnMs)) || Number(config.lifeDropDespawnMs) < 0) {
      config.lifeDropDespawnMs = DEFAULT_CONFIG.lifeDropDespawnMs;
    }
    if (!Number.isFinite(Number(config.lifeDropFadeMs)) || Number(config.lifeDropFadeMs) < 0) {
      config.lifeDropFadeMs = DEFAULT_CONFIG.lifeDropFadeMs;
    }
    if (!Number.isFinite(Number(config.lifeDropSpread)) || Number(config.lifeDropSpread) < 0) {
      config.lifeDropSpread = DEFAULT_CONFIG.lifeDropSpread;
    }
    if (!Number.isFinite(Number(config.lifeDropMotionScale)) || Number(config.lifeDropMotionScale) < 0) {
      config.lifeDropMotionScale = DEFAULT_CONFIG.lifeDropMotionScale;
    }
    if (stored?.fieldFrameDesign === LEGACY_DEFAULT_FIELD_FRAME_DESIGN) {
      config.fieldFrameDesign = DEFAULT_CONFIG.fieldFrameDesign;
    }
    this._normalizeLargeBallTransparencyDefaults(config, stored);
    this._normalizeGiftTierDefaults(config, stored);
    this._normalizeWeaponPickupPacingDefaults(config, stored);
    // giftWeaponMappings: stored values must win over defaults to allow deletion.
    // Without this, _mergeConfig re-introduces default mappings that were deleted by the user.
    if (stored && stored.giftWeaponMappings && typeof stored.giftWeaponMappings === 'object') {
      config.giftWeaponMappings = { ...stored.giftWeaponMappings };
    }
    config.personalityProfiles = this._normalizePersonalityProfiles(config.personalityProfiles);
    config.weaponPickupTypes = this._normalizeWeaponPickupTypes(
      config.weaponPickupTypes,
      !Array.isArray(stored?.weaponPickupTypes)
    );

    const movement = stored && stored.movement && typeof stored.movement === 'object'
      ? stored.movement
      : null;

    if (movement) {
      const hasSmartMovementKeys = [
        'fleeMassRatio',
        'huntMassRatio',
        'huntLeadSeconds',
        'boundaryAvoidanceDistance'
      ].some(key => Object.prototype.hasOwnProperty.call(movement, key));

      const isLegacyDefaultMovement =
        !hasSmartMovementKeys &&
        Number(movement.fleeDistance) === 180 &&
        Number(movement.huntDistance) === 260 &&
        Number(movement.foodSenseDistance) === 420 &&
        Number(movement.steeringStrength) === 0.15 &&
        Number(movement.randomTurn) === 0.18;

      if (isLegacyDefaultMovement) {
        config.movement = {
          ...config.movement,
          fleeDistance: DEFAULT_CONFIG.movement.fleeDistance,
          huntDistance: DEFAULT_CONFIG.movement.huntDistance,
          foodSenseDistance: DEFAULT_CONFIG.movement.foodSenseDistance,
          steeringStrength: DEFAULT_CONFIG.movement.steeringStrength,
          randomTurn: DEFAULT_CONFIG.movement.randomTurn
        };
      }

      if (this._isPreviousSmartMovementDefault(movement)) {
        config.movement = {
          ...config.movement,
          ...DEFAULT_CONFIG.movement
        };
      }

      if (this._isTwitchyMovementDefault(movement)) {
        config.movement = {
          ...config.movement,
          randomTurn: DEFAULT_CONFIG.movement.randomTurn,
          behaviorMemoryMs: DEFAULT_CONFIG.movement.behaviorMemoryMs,
          targetSwitchScoreMargin: DEFAULT_CONFIG.movement.targetSwitchScoreMargin,
          wanderFocusMinMs: DEFAULT_CONFIG.movement.wanderFocusMinMs,
          wanderFocusMaxMs: DEFAULT_CONFIG.movement.wanderFocusMaxMs
        };
      }

      if ([0.48, 0.62, 0.72].includes(Number(movement.largeMassSpeedPenalty))) {
        config.movement = {
          ...config.movement,
          largeMassSpeedPenalty: DEFAULT_CONFIG.movement.largeMassSpeedPenalty
        };
      }
    }

    if (config.giftTiers?.large) {
      const weaponTypes = Array.isArray(config.giftTiers.large.weaponTypes)
        ? config.giftTiers.large.weaponTypes
        : [];
      const storedLargeWeaponTypes = stored?.giftTiers?.large?.weaponTypes;
      if (!Array.isArray(storedLargeWeaponTypes) && !weaponTypes.includes('chainsaw')) {
        config.giftTiers.large.weaponTypes = [...weaponTypes, 'chainsaw'];
      }
    }

    return config;
  }

  _normalizeGiftTierDefaults(config, stored) {
    if (!config.giftTiers || typeof config.giftTiers !== 'object') {
      config.giftTiers = this._cloneConfigValue(DEFAULT_CONFIG.giftTiers);
      return;
    }

    if (
      Number(stored?.giftTiers?.medium?.minValue) === LEGACY_DEFAULT_GIFT_MEDIUM_MIN_VALUE ||
      Number(stored?.giftTiers?.medium?.minValue) === PREVIOUS_DEFAULT_GIFT_MEDIUM_MIN_VALUE ||
      Number(stored?.giftTiers?.medium?.minValue) === PREVIOUS_STREAM_GIFT_MEDIUM_MIN_VALUE
    ) {
      config.giftTiers.medium = {
        ...config.giftTiers.medium,
        minValue: DEFAULT_CONFIG.giftTiers.medium.minValue
      };
    }
    if (
      Number(stored?.giftTiers?.large?.minValue) === LEGACY_DEFAULT_GIFT_LARGE_MIN_VALUE ||
      Number(stored?.giftTiers?.large?.minValue) === PREVIOUS_DEFAULT_GIFT_LARGE_MIN_VALUE ||
      Number(stored?.giftTiers?.large?.minValue) === PREVIOUS_STREAM_GIFT_LARGE_MIN_VALUE
    ) {
      config.giftTiers.large = {
        ...config.giftTiers.large,
        minValue: DEFAULT_CONFIG.giftTiers.large.minValue
      };
    }

    if (config.giftTiers.medium) {
      const storedMediumWeaponTypes = stored?.giftTiers?.medium?.weaponTypes;
      if (!Array.isArray(storedMediumWeaponTypes)) {
        config.giftTiers.medium.weaponTypes = [...DEFAULT_CONFIG.giftTiers.medium.weaponTypes];
      } else if (storedMediumWeaponTypes.join('|') === 'laser|pulse|magnet|vampire|freeze|dash') {
        config.giftTiers.medium.weaponTypes = [...DEFAULT_CONFIG.giftTiers.medium.weaponTypes];
      }
    }

    if (config.giftTiers.large) {
      const weaponTypes = Array.isArray(config.giftTiers.large.weaponTypes)
        ? config.giftTiers.large.weaponTypes
        : [];
      const storedLargeWeaponTypes = stored?.giftTiers?.large?.weaponTypes;
      if (!Array.isArray(storedLargeWeaponTypes)) {
        config.giftTiers.large.weaponTypes = [...DEFAULT_CONFIG.giftTiers.large.weaponTypes];
      } else if (storedLargeWeaponTypes.join('|') === 'blackhole|missile|chainsaw|vampire|mine|magnet') {
        config.giftTiers.large.weaponTypes = [...DEFAULT_CONFIG.giftTiers.large.weaponTypes];
      }
    }
  }

  _normalizeWeaponPickupPacingDefaults(config, stored) {
    if (Number(stored?.maxWeaponPickups) === PREVIOUS_ACTION_MAX_WEAPON_PICKUPS) {
      config.maxWeaponPickups = DEFAULT_CONFIG.maxWeaponPickups;
    }
    if (Number(stored?.weaponPickupSpawnIntervalMs) === PREVIOUS_ACTION_WEAPON_PICKUP_SPAWN_INTERVAL_MS) {
      config.weaponPickupSpawnIntervalMs = DEFAULT_CONFIG.weaponPickupSpawnIntervalMs;
    }
    if (Number(stored?.weaponPickupChance) === PREVIOUS_ACTION_WEAPON_PICKUP_CHANCE) {
      config.weaponPickupChance = DEFAULT_CONFIG.weaponPickupChance;
    }
    if (Number(stored?.weaponPickupDurationMs) === PREVIOUS_ACTION_WEAPON_PICKUP_DURATION_MS) {
      config.weaponPickupDurationMs = DEFAULT_CONFIG.weaponPickupDurationMs;
    }
  }

  _normalizeLargeBallTransparencyDefaults(config, stored = {}) {
    let mode = String(config.largeBallTransparencyMode || '').trim();
    const storedHasMode = Object.prototype.hasOwnProperty.call(stored || {}, 'largeBallTransparencyMode');

    if (!LARGE_BALL_TRANSPARENCY_MODES.has(mode)) {
      mode = DEFAULT_CONFIG.largeBallTransparencyMode;
    }
    if (!storedHasMode && stored.largeBallTransparencyEnabled === false) {
      mode = 'off';
    }

    config.largeBallTransparencyMode = mode;
    config.largeBallTransparencyEnabled = mode !== 'off';
    if (!Number.isFinite(Number(config.largeBallTransparencyStartMass)) || Number(config.largeBallTransparencyStartMass) < 0) {
      config.largeBallTransparencyStartMass = DEFAULT_CONFIG.largeBallTransparencyStartMass;
    }
    if (!Number.isFinite(Number(config.largeBallMinOpacity)) || Number(config.largeBallMinOpacity) <= 0) {
      config.largeBallMinOpacity = DEFAULT_CONFIG.largeBallMinOpacity;
    }
  }

  _normalizePersonalityProfiles(profiles) {
    const source = Array.isArray(profiles) && profiles.length
      ? profiles
      : DEFAULT_CONFIG.personalityProfiles;
    return source.map(profile => this._normalizePersonality(profile));
  }

  _normalizeWeaponPickupTypes(weaponPickupTypes, mergeMissingDefaults = false) {
    const normalized = mergeMissingDefaults
      ? this._mergeWeaponPickupDefaults(weaponPickupTypes)
      : Array.isArray(weaponPickupTypes)
        ? [...weaponPickupTypes]
        : [];
    const defaultChainsaw = DEFAULT_CONFIG.weaponPickupTypes.find(definition => definition.type === 'chainsaw');
    if (!defaultChainsaw) return normalized;

    return normalized.map(definition => {
      if (!definition || definition.type !== 'chainsaw') return definition;
      return {
        ...definition,
        power: this._finiteOrDefault(definition.power, defaultChainsaw.power),
        durationMs: Math.max(
          Number(definition.durationMs) || 0,
          Number(defaultChainsaw.durationMs) || 0
        ),
        weight: Math.max(
          Number(definition.weight) || 0,
          Number(defaultChainsaw.weight) || 0
        )
      };
    });
  }

  _mergeWeaponPickupDefaults(weaponPickupTypes) {
    const existing = Array.isArray(weaponPickupTypes) ? [...weaponPickupTypes] : [];
    const existingTypes = new Set(existing.map(item => item && item.type).filter(Boolean));
    for (const defaultDefinition of DEFAULT_CONFIG.weaponPickupTypes) {
      if (!existingTypes.has(defaultDefinition.type)) {
        existing.push({ ...defaultDefinition });
      }
    }
    return existing;
  }

  _isPreviousSmartMovementDefault(movement) {
    return Number(movement.fleeDistance) === 260 &&
      Number(movement.huntDistance) === 380 &&
      Number(movement.foodSenseDistance) === 460 &&
      Number(movement.steeringStrength) === 0.24 &&
      Number(movement.randomTurn) === 0.08 &&
      Number(movement.fleeMassRatio) === 1.08 &&
      Number(movement.huntMassRatio) === 1.1;
  }

  _isTwitchyMovementDefault(movement) {
    return Number(movement.randomTurn) === 0.04 &&
      Number(movement.behaviorMemoryMs) === 1600 &&
      Number(movement.targetSwitchScoreMargin) === 2.4 &&
      Number(movement.wanderFocusMinMs) === 1400 &&
      Number(movement.wanderFocusMaxMs) === 2800;
  }

  _normalizeLogger(logger) {
    const fallback = () => {};
    return {
      info: typeof logger?.info === 'function' ? logger.info.bind(logger) : fallback,
      warn: typeof logger?.warn === 'function' ? logger.warn.bind(logger) : fallback,
      error: typeof logger?.error === 'function' ? logger.error.bind(logger) : fallback,
      debug: typeof logger?.debug === 'function' ? logger.debug.bind(logger) : fallback
    };
  }

  _getSocketIO() {
    if (typeof this.api?.getSocketIO === 'function') {
      return this.api.getSocketIO() || { emit: () => {} };
    }
    return { emit: () => {} };
  }
}

ArenaGame.DEFAULT_CONFIG = DEFAULT_CONFIG;

module.exports = ArenaGame;
