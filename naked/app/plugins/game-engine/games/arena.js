'use strict';

const DEFAULT_TICK_RATE_MS = 33;
const LEGACY_DEFAULT_TICK_RATE_MS = 100;
const PREVIOUS_DEFAULT_TICK_RATE_MS = 50;
const LEGACY_DEFAULT_STATE_EMIT_INTERVAL_MS = 120;
const PREVIOUS_DEFAULT_STATE_EMIT_INTERVAL_MS = 50;
const LEGACY_DEFAULT_TARGET_FPS = 30;
const LEGACY_DEFAULT_INACTIVITY_GRACE_MS = 15000;
const LEGACY_DEFAULT_INACTIVITY_SHRINK_PER_SECOND = 5;
const LEGACY_DEFAULT_MAX_MASS = 90;
const LEGACY_DEFAULT_MAX_LIVES = 2500;

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
  arenaWidth: 1920,
  arenaHeight: 1080,
  maxPlayers: 80,
  maxFood: 90,
  maxFoodRender: 52,
  renderScale: 0.75,
  targetFps: 60,
  maxRenderPlayers: 60,
  rendererMode: 'auto',
  maxWeaponPickups: 8,
  weaponPickupRadius: 14,
  weaponPickupSpawnIntervalMs: 4500,
  weaponPickupChance: 0.45,
  weaponPickupDurationMs: 18000,
  baseMass: 18,
  minMass: 8,
  maxMass: 140,
  baseLives: 100,
  minLives: 20,
  maxLives: 6000,
  likeLifeValue: 1,
  giftLifePerCoin: 25,
  maxLikeLifeBatch: 500,
  maxGiftLifeBatch: 50000,
  baseEnergy: 60,
  maxEnergy: 120,
  inactivityGraceMs: 30000,
  inactivityShrinkPerSecond: 1.25,
  energyDecayPerSecond: 1.2,
  foodValue: 1.6,
  foodRadius: 5,
  playerAbsorbOverlapRatio: 0.65,
  playerAbsorbMassRatio: 0.42,
  playerAbsorbLifeStealRatio: 0.55,
  tickRateMs: DEFAULT_TICK_RATE_MS,
  stateEmitIntervalMs: DEFAULT_TICK_RATE_MS,
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
    fleeDistance: 320,
    huntDistance: 460,
    weaponSenseDistance: 540,
    foodSenseDistance: 460,
    steeringStrength: 0.3,
    randomTurn: 0.04,
    fleeMassRatio: 1.03,
    huntMassRatio: 1.04,
    huntLeadSeconds: 0.65,
    threatLookaheadSeconds: 0.9,
    fleeSpeedBoost: 0.3,
    huntSpeedBoost: 0.18,
    huntStrikeDistance: 260,
    huntStrikeBoost: 1.18,
    smallMassSpeedBoost: 0.35,
    largeMassSpeedPenalty: 0.48,
    minMassSpeedMultiplier: 0.55,
    maxMassSpeedMultiplier: 1.35,
    boundaryAvoidanceDistance: 90,
    boundaryAvoidanceStrength: 0.8,
    behaviorMemoryMs: 700,
    targetSwitchScoreMargin: 1.2,
    wanderTurnIntervalMs: 850
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
      commitment: 0.75
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
      commitment: 1.25
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
      commitment: 1.45
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
      commitment: 1
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
      commitment: 0.9
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
      commitment: 0.55
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
    { type: 'chainsaw', power: 4.4, durationMs: 9000, weight: 4 }
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
    chainsawSpeedBoost: 0.45,
    chainsawRequiredMassRatio: 1.04,
    chainsawAbsorbOverlapBonus: 0.58,
    chainsawAbsorbMassRatio: 0.58,
    chainsawAbsorbLifeStealRatio: 0.78,
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
    mineDurationMs: 9000
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
      minValue: 100,
      weaponType: 'laser',
      weaponTypes: ['laser', 'pulse', 'magnet', 'vampire', 'freeze', 'dash'],
      power: 2.5,
      durationMs: 9000,
      growthBonus: 4
    },
    large: {
      minValue: 1000,
      weaponType: 'blackhole',
      weaponTypes: ['blackhole', 'missile', 'chainsaw', 'vampire', 'mine', 'magnet'],
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

class ArenaGame {
  constructor(api, db, logger, options = {}) {
    this.api = api;
    this.db = db;
    this.logger = this._normalizeLogger(logger);
    this.io = this._getSocketIO();
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.random = typeof options.random === 'function' ? options.random : () => Math.random();

    this.players = new Map();
    this.food = new Map();
    this.weaponPickups = new Map();
    this.mines = new Map();
    this.recentGiftEvents = new Map();
    this.foodIdCounter = 0;
    this.weaponPickupIdCounter = 0;
    this.mineIdCounter = 0;
    this.tickTimer = null;
    this.lastStateEmitAt = 0;
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
    const config = this.getConfig();
    this.spawnFood(Math.min(config.maxFood, 20));
    this.spawnWeaponPickup(Math.min(config.maxWeaponPickups, 2));
    this.logger.info('Arena game initialized');
  }

  start() {
    if (this.tickTimer) return;
    this.lastTickAt = this.now();
    this._scheduleNextTick();
  }

  _scheduleNextTick() {
    const config = this.getConfig();
    const interval = Math.max(8, Number(config.tickRateMs) || DEFAULT_TICK_RATE_MS);
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      const now = this.now();
      const elapsed = this.lastTickAt === null ? interval : Math.max(0, now - this.lastTickAt);
      const maxDelta = Math.max(interval * 3, 120);
      this.lastTickAt = now;
      this.tick(Math.min(elapsed || interval, maxDelta));
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
    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }
    this.lastTickAt = null;
    this.players.clear();
    this.food.clear();
    this.weaponPickups.clear();
    this.mines.clear();
    this.recentGiftEvents.clear();
    this.logger.info('Arena game destroyed');
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

    const player = this._getOrCreatePlayer(viewer, config);
    this._applyActivity(player, activityType, config, this._activityMultiplier(data, activityType), data);
    this._syncRadius(player, config);

    const payload = this._serializePlayer(player);
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
    const dedupKey = `${viewer.username}:${giftName}:${giftId || 'no-id'}`;
    const now = this.now();
    const lastGiftAt = this.recentGiftEvents.get(dedupKey);
    if (lastGiftAt && now - lastGiftAt < 1000) {
      return { success: false, error: 'Duplicate gift ignored' };
    }
    this.recentGiftEvents.set(dedupKey, now);

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
    this._addMassEquivalent(player, weapon.growthBonus, config);
    player.energy = this._clamp(player.energy + weapon.power * 4, 0, config.maxEnergy);
    this._syncRadius(player, config);

    const payload = this._serializePlayer(player);
    this.io.emit('arena:weapon-activated', {
      username: player.username,
      nickname: player.nickname,
      weapon: player.weapon,
      timestamp: now
    });
    this.emitState('gift', { force: true });

    return { success: true, player: payload, weapon: player.weapon };
  }

  tick(deltaMs = DEFAULT_TICK_RATE_MS) {
    const config = this.getConfig();
    if (!config.enabled) return this.getState('disabled');

    this._updateFever(config);
    this.spawnFood(this._targetFoodCount(config) - this.food.size);
    this._updateWeaponPickups(config);
    this._updateMines(config);

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
    this.aiSpatialIndex = null;
    this.emitState('tick');
    return this.getState('tick');
  }

  spawnFood(count = 1) {
    const config = this.getConfig();
    const amount = Math.max(0, Math.floor(count));
    for (let i = 0; i < amount; i++) {
      if (this.food.size >= this._targetFoodCount(config)) break;
      const id = `food_${++this.foodIdCounter}`;
      this.food.set(id, {
        id,
        x: this.random() * config.arenaWidth,
        y: this.random() * config.arenaHeight,
        radius: config.foodRadius,
        value: config.foodValue
      });
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
    const spatialIndex = this.aiSpatialIndex || this._buildSpatialIndex(config);
    const threat = this._assessThreats(player, movement, config);
    const prey = this._rankHuntTarget(player, movement, config);
    const weapon = this._rankWeaponPickup(player, movement, config);
    const pressure = this._rankPressureTarget(player, movement, config);
    const food = this._rankFoodTarget(player, movement, config, {
      pressureTarget: pressure && pressure.target,
      threatTarget: threat && threat.target
    });
    const boundary = this._boundaryAvoidanceVector(player, config);

    return {
      now: this.now(),
      player,
      config,
      movement,
      personality,
      spatialIndex,
      threat,
      prey,
      pressure,
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
    const threatScore = context.threat ? context.threat.score : 0;
    const candidates = [];

    if (context.threat) {
      candidates.push(this._createFleeIntent(player, context, threatScore));
      if (context.weapon && (!player.weapon || personality.weaponFocus >= 0.8)) {
        candidates.push(this._createEvadeWeaponIntent(player, context, threatScore));
      }
    }

    if (context.prey) {
      const threatPenalty = context.threat
        ? threatScore * personality.fear * (player.weapon ? 0.18 : 0.48)
        : 0;
      candidates.push(this._createAttackIntent(player, context, context.prey.score - threatPenalty));
    }

    if (context.pressure && !context.prey && !context.food && !context.weapon) {
      const threatPenalty = context.threat ? threatScore * personality.fear * 0.35 : 0;
      candidates.push(this._createPressureIntent(player, context, context.pressure.score - threatPenalty));
    }

    if (context.weapon) {
      const weaponUrgency = player.weapon ? 0.75 : 1.25;
      candidates.push({
        mode: 'hunt-weapon',
        intent: 'arm',
        target: context.weapon.target,
        vector: this._vectorToTarget(player, context.weapon.target),
        score: context.weapon.score * weaponUrgency + personality.weaponFocus * 1.1,
        metadata: this._aiMetadata({
          reason: player.weapon ? 'upgrade-weapon' : 'get-weapon'
        })
      });
    }

    if (context.food) {
      candidates.push({
        mode: 'hunt-food',
        intent: 'feed',
        target: context.food.target,
        vector: this._vectorToTarget(player, context.food.target),
        score: context.food.score,
        metadata: this._aiMetadata({
          reason: context.food.reason || 'safe-food',
          strategicTarget: this._serializeAiEntity(context.food.strategyTarget)
        })
      });
    }

    candidates.push(this._createWanderIntent(player, context));
    return candidates;
  }

  _createFleeIntent(player, context, threatScore) {
    const personality = context.personality;
    return {
      mode: 'flee',
      intent: 'flee',
      target: context.threat.target,
      vector: this._combineSteeringVectors([
        { vector: context.threat.vector, weight: 2.8 * personality.fear },
        { vector: context.boundary, weight: 0.8 }
      ]),
      score: threatScore * 1.22 * personality.fear + (1.6 - personality.aggression),
      metadata: this._aiMetadata({
        reason: 'survive-threat',
        threat: this._serializeAiEntity(context.threat.target),
        escapeScore: Math.round((context.threat.escapeScore || 0) * 100) / 100
      })
    };
  }

  _createEvadeWeaponIntent(player, context, threatScore) {
    const personality = context.personality;
    const toWeapon = this._vectorToTarget(player, context.weapon.target);
    return {
      mode: 'evade-weapon',
      intent: 'evade-arm',
      target: context.weapon.target,
      vector: this._combineSteeringVectors([
        { vector: context.threat.vector, weight: 2.2 * personality.fear },
        { vector: toWeapon, weight: 1.8 * personality.weaponFocus },
        { vector: context.boundary, weight: 0.7 }
      ]),
      score: threatScore * 0.98 * personality.fear +
        context.weapon.score * 1.25 * personality.weaponFocus +
        personality.intelligence * 1.4,
      metadata: this._aiMetadata({
        reason: 'escape-to-weapon',
        threat: this._serializeAiEntity(context.threat.target)
      })
    };
  }

  _createAttackIntent(player, context, score) {
    const personality = context.personality;
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
      score: score + personality.aggression * 1.6 + personality.intelligence * 0.8,
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
    const rival = context.pressure.target;
    const pressurePoint = this._predictInterceptPosition(player, rival, context.movement, context.config, personality);
    const growthVector = context.food ? this._vectorToTarget(player, context.food.target) : { x: 0, y: 0 };
    return {
      mode: 'pressure-player',
      intent: 'pressure',
      target: rival,
      vector: this._combineSteeringVectors([
        { vector: this._vectorToTarget(player, pressurePoint), weight: 1.55 * personality.aggression },
        { vector: growthVector, weight: context.food ? 0.65 * personality.foodFocus : 0 },
        { vector: context.boundary, weight: 0.35 }
      ]),
      score: score + personality.aggression * 1.05 + personality.intelligence * 0.55,
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

  _previousAiIntent(player, context, config) {
    const previous = player.aiIntent;
    if (!previous || context.now > previous.lockedUntil) return null;
    const currentWeaponType = player.weapon && player.weapon.type ? player.weapon.type : null;
    if (previous.weaponType !== currentWeaponType) return null;
    const target = this._resolveAiTarget(previous);
    if (previous.targetKey && !target) return null;

    const movement = context.movement;
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
    const decision = this._storeBehaviorDecision(player, {
      mode: intent.mode,
      intent: intent.intent,
      target: intent.target,
      vector: intent.vector,
      score: intent.score,
      metadata: {
        ...this._aiMetadata(),
        ...(intent.metadata || {})
      }
    });

    player.aiIntent = {
      mode: decision.mode,
      intent: decision.intent,
      targetKey,
      vector: decision.vector,
      score: Number(decision.score) || 0,
      metadata: decision.metadata || {},
      weaponType: player.weapon && player.weapon.type ? player.weapon.type : null,
      lockedUntil: now + memoryMs * lockScale,
      updatedAt: now
    };

    return decision;
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
      if (context.threat && context.threat.vector) return context.threat.vector;
      return this._normalizeVector({ x: player.x - target.x, y: player.y - target.y });
    }
    if (previous.intent === 'evade-arm' && context.threat) {
      return this._combineSteeringVectors([
        { vector: context.threat.vector, weight: 2.2 * context.personality.fear },
        { vector: this._vectorToTarget(player, target), weight: 1.8 * context.personality.weaponFocus },
        { vector: context.boundary, weight: 0.7 }
      ]);
    }
    return this._vectorToTarget(player, target);
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

  getState(reason = 'snapshot') {
    const config = this.getConfig();
    const players = Array.from(this.players.values())
      .map(player => this._serializePlayer(player))
      .sort((a, b) => b.mass - a.mass);

    return {
      gameType: 'arena',
      reason,
      timestamp: this.now(),
      config: {
        arenaWidth: config.arenaWidth,
        arenaHeight: config.arenaHeight,
        maxPlayers: config.maxPlayers,
        maxFood: config.maxFood,
        maxFoodRender: config.maxFoodRender,
        baseLives: config.baseLives,
        minLives: config.minLives,
        maxLives: config.maxLives,
        likeLifeValue: config.likeLifeValue,
        giftLifePerCoin: config.giftLifePerCoin,
        renderScale: config.renderScale,
        targetFps: config.targetFps,
        maxRenderPlayers: config.maxRenderPlayers,
        rendererMode: config.rendererMode,
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

    this.lastStateEmitAt = now;
    this.io.emit('arena:state', this.getState(reason));
    return true;
  }

  reset() {
    this.players.clear();
    this.food.clear();
    this.weaponPickups.clear();
    this.mines.clear();
    this.spawnFood(Math.min(this.getConfig().maxFood, 20));
    this.spawnWeaponPickup(Math.min(this.getConfig().maxWeaponPickups, 2));
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

    if (player.lives <= config.minLives || player.mass < config.minMass || inactiveMs > config.inactivityGraceMs * 8) {
      this.players.delete(player.username);
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
    let behaviorSpeedBoost = 0;

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
        behaviorSpeedBoost = Number(movement.fleeSpeedBoost) || 0;
      } else if (behavior.mode === 'evade-weapon') {
        steeringMultiplier = 2.05;
        behaviorSpeedBoost = Number(movement.fleeSpeedBoost) || 0.18;
      } else if (behavior.mode === 'hunt-player') {
        steeringMultiplier = 1.75;
        behaviorSpeedBoost = Math.max(
          Number(movement.huntSpeedBoost) || 0,
          0.2 + this._clamp(this._personalityTraits(player).aggression - 1, 0, 0.7) * 0.12
        );
        behaviorSpeedBoost += this._huntStrikeBoost(player, behavior.target, config);
      } else if (behavior.mode === 'pressure-player') {
        steeringMultiplier = 1.48;
        behaviorSpeedBoost = Math.max(
          0.12,
          (Number(movement.huntSpeedBoost) || 0) * 0.7 +
            this._clamp(this._personalityTraits(player).aggression - 1, 0, 0.7) * 0.08
        );
      } else if (behavior.mode === 'hunt-weapon') {
        steeringMultiplier = 1.45;
        behaviorSpeedBoost = 0.08;
      } else if (behavior.mode === 'hunt-food') {
        steeringMultiplier = 1.52;
        behaviorSpeedBoost = 0.1;
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

    const randomTurn = behavior.mode === 'hunt-player' || behavior.mode === 'pressure-player' || behavior.mode === 'flee' || behavior.mode === 'hunt-weapon' || behavior.mode === 'evade-weapon'
      ? movement.randomTurn * 0.12
      : behavior.target ? movement.randomTurn * 0.28 : movement.randomTurn * 0.45;
    const personality = this._personalityTraits(player);
    const personalityRandomness = this._clamp(
      personality.randomness / Math.max(personality.intelligence, 0.35),
      0.18,
      1.35
    );
    const randomPush = {
      x: (this.random() * 2 - 1) * randomTurn * personalityRandomness,
      y: (this.random() * 2 - 1) * randomTurn * personalityRandomness
    };

    const steeringStrength = movement.steeringStrength * steeringMultiplier;
    const desiredVelocity = this._redirectBlockedMovement(player, {
      x: desired.x + randomPush.x,
      y: desired.y + randomPush.y
    }, config);
    const velocity = this._steerVelocity(player, desiredVelocity, behavior, steeringStrength, personality);
    const physics = config.weaponPhysics || DEFAULT_CONFIG.weaponPhysics;
    const weaponSpeed = this._weaponSpeedBoost(player.weapon, physics);
    const feverSpeed = this.fever.active ? 0.15 : 0;
    const energyBoost = (player.energy / config.maxEnergy) * 0.35;
    const massSpeed = this._movementMassMultiplier(player, config);
    const statusSpeed = this._statusSpeedMultiplier(player);
    const speed = movement.baseSpeed * massSpeed * statusSpeed * (1 + weaponSpeed + feverSpeed + energyBoost + behaviorSpeedBoost);

    player.vx = velocity.x;
    player.vy = velocity.y;
    player.x += player.vx * speed * seconds;
    player.y += player.vy * speed * seconds;

    this._containPlayerInArena(player, config);
  }

  _applyWeaponEffects(player, config, seconds) {
    if (!player.weapon || seconds <= 0) return;

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

  _applyLaserWeapon(player, config, seconds) {
    const physics = config.weaponPhysics || DEFAULT_CONFIG.weaponPhysics;
    const power = Number(player.weapon.power) || 1;
    const range = physics.laserRange + power * 18;
    const target = this._nearestPlayer(player, other =>
      other.mass < player.mass * 0.98 &&
      this._distance(player, other) <= range
    );

    if (!target) return;

    const shieldMultiplier = target.weapon && target.weapon.type === 'shield' ? 0.35 : 1;
    const damage = (physics.laserDamagePerSecond + power * 1.5) * seconds * shieldMultiplier;
    this._addMassEquivalent(target, -damage, config);
    target.energy = this._clamp(target.energy - damage * 2, 0, config.maxEnergy);
    player.score += damage * physics.laserScoreMultiplier;
    player.energy = this._clamp(player.energy + damage * 0.2, 0, config.maxEnergy);

    if (target.lives <= config.minLives || target.mass < config.minMass) {
      this.players.delete(target.username);
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

    const shieldMultiplier = target.weapon && target.weapon.type === 'shield' ? 0.45 : 1;
    const damage = (physics.missileDamagePerSecond + power * 1.8) * seconds * shieldMultiplier;
    this._addMassEquivalent(target, -damage, config);
    target.energy = this._clamp(target.energy - damage * 1.4, 0, config.maxEnergy);
    player.score += damage * 1.3;

    if (target.lives <= config.minLives || target.mass < config.minMass) {
      this.players.delete(target.username);
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
        this.players.delete(other.username);
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
      this.players.delete(target.username);
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
          this.players.delete(player.username);
          const owner = this.players.get(mine.owner);
          if (owner) {
            owner.kills += 1;
            owner.score += Math.max(0, -applied);
          }
        }
        break;
      }
    }
  }

  _resolveFoodCollisions(config) {
    for (const player of this.players.values()) {
      for (const [foodId, food] of Array.from(this.food.entries())) {
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
    this._addMassEquivalent(player, gain, config);
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
      lifeGain,
      reason,
      timestamp: this.now()
    });

    this._syncRadius(player, config);
    return gain;
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

        this.weaponPickups.delete(pickupId);
        player.weapon = this._createWeapon({
          type: pickup.type,
          tier: pickup.tier || 'pickup',
          power: pickup.power,
          sourceGift: 'Arena Pickup',
          durationMs: pickup.durationMs
        });
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

  _resolvePlayerCollisions(config) {
    const players = Array.from(this.players.values());
    for (const player of players) {
      if (!this.players.has(player.username)) continue;

      for (const other of players) {
        if (player.username === other.username || !this.players.has(other.username)) continue;
        const absorbContext = this._playerAbsorbContext(player, other, config);
        if (!absorbContext.canAbsorb) continue;

        if (this._distance(player, other) <= absorbContext.absorbDistance) {
          const preyLives = this._ensureLives(other, config);
          const beforeLives = this._ensureLives(player, config);
          const beforeMass = player.mass;
          const lifeStealGain = preyLives * absorbContext.lifeStealRatio;
          const massEquivalentLifeGain = this._massDeltaToLifeDelta(
            player.mass,
            other.mass * absorbContext.massGainRatio,
            config
          );
          this._addLives(player, Math.max(lifeStealGain, massEquivalentLifeGain), config);
          const lifeGain = player.lives - beforeLives;
          const massGain = player.mass - beforeMass;
          player.score += other.mass;
          player.kills += 1;
          this.players.delete(other.username);
          this.io.emit('arena:player-absorbed', {
            predator: player.username,
            prey: other.username,
            massGain,
            lifeGain,
            preyLives,
            lifeStealRatio: absorbContext.lifeStealRatio,
            lifeStealGain,
            massGainRatio: absorbContext.massGainRatio,
            predatorMass: player.mass,
            predatorLives: player.lives,
            weaponType: absorbContext.weaponType,
            timestamp: this.now()
          });
          this._syncRadius(player, config);
        }
      }
    }
  }

  _playerAbsorbContext(player, other, config) {
    const physics = config.weaponPhysics || DEFAULT_CONFIG.weaponPhysics;
    const absorbOverlapRatio = Number(config.playerAbsorbOverlapRatio) || DEFAULT_CONFIG.playerAbsorbOverlapRatio;
    const hasChainsaw = player.weapon && player.weapon.type === 'chainsaw';
    const hasDash = player.weapon && player.weapon.type === 'dash';
    const requiredMassRatio = hasChainsaw
      ? Number(physics.chainsawRequiredMassRatio) || DEFAULT_CONFIG.weaponPhysics.chainsawRequiredMassRatio
      : hasDash
        ? Number(physics.dashRequiredMassRatio) || DEFAULT_CONFIG.weaponPhysics.dashRequiredMassRatio
        : 1.25;
    const shieldMultiplier = other.weapon && other.weapon.type === 'shield' ? 1.55 : 1;
    const canAbsorb = player.mass > other.mass * requiredMassRatio * shieldMultiplier;
    const chainsawOverlapBonus = hasChainsaw
      ? Number(physics.chainsawAbsorbOverlapBonus) || DEFAULT_CONFIG.weaponPhysics.chainsawAbsorbOverlapBonus
      : 0;
    const dashOverlapBonus = hasDash
      ? Number(physics.dashAbsorbOverlapBonus) || DEFAULT_CONFIG.weaponPhysics.dashAbsorbOverlapBonus
      : 0;
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
      absorbDistance: player.radius + other.radius * (absorbOverlapRatio + chainsawOverlapBonus + dashOverlapBonus),
      lifeStealRatio,
      massGainRatio,
      weaponType: hasChainsaw ? 'chainsaw' : hasDash ? 'dash' : null
    };
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

  _getOrCreatePlayer(viewer, config) {
    let player = this.players.get(viewer.username);
    if (player) {
      player.nickname = viewer.nickname || player.nickname;
      player.profilePictureUrl = viewer.profilePictureUrl || player.profilePictureUrl;
      return player;
    }

    if (this.players.size >= config.maxPlayers) {
      const lowest = Array.from(this.players.values()).sort((a, b) => a.mass - b.mass)[0];
      if (lowest) this.players.delete(lowest.username);
    }

    player = {
      username: viewer.username,
      nickname: viewer.nickname || viewer.username,
      profilePictureUrl: viewer.profilePictureUrl || '',
      x: this.random() * config.arenaWidth,
      y: this.random() * config.arenaHeight,
      vx: this.random() * 2 - 1,
      vy: this.random() * 2 - 1,
      radius: 16,
      mass: config.baseMass,
      lives: config.baseLives,
      energy: config.baseEnergy,
      score: 0,
      kills: 0,
      color: this._colorForUsername(viewer.username),
      weapon: null,
      effects: {},
      personality: this._personalityForUsername(viewer.username, config),
      behaviorMemory: null,
      wanderVector: null,
      spawnedAt: this.now(),
      lastActivityAt: this.now()
    };
    this._syncRadius(player, config);
    this.players.set(player.username, player);
    this.io.emit('arena:player-spawned', this._serializePlayer(player));
    return player;
  }

  _applyActivity(player, activityType, config, multiplier = 1, data = {}) {
    const weight = config.activityWeights[activityType] || config.activityWeights.chat;
    player.energy = this._clamp(
      player.energy + weight.energy * multiplier,
      0,
      config.maxEnergy
    );
    const lifeGain = this._activityLifeGain(data, activityType, config, multiplier, weight);
    this._addLives(player, lifeGain, config);
    player.score += Math.max(0, lifeGain);
    player.lastActivityAt = this.now();
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

  _activityLifeGain(data, activityType, config, multiplier, weight) {
    if (activityType === 'like') {
      const count = Math.min(
        Math.max(Number(data && (data.likeCount || data.count)) || multiplier || 1, 1),
        Number(config.maxLikeLifeBatch) || DEFAULT_CONFIG.maxLikeLifeBatch
      );
      return count * (Number(config.likeLifeValue) || DEFAULT_CONFIG.likeLifeValue);
    }

    if (activityType === 'gift') {
      return this._giftLifeGain(data, config);
    }

    if (Number.isFinite(Number(weight.lives))) {
      return Number(weight.lives) * multiplier;
    }

    return this._massDeltaToLifeDelta(config.baseMass, (Number(weight.mass) || 0) * multiplier, config);
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
      growthBonus: this._finiteOrDefault(mapping && mapping.growthBonus, tierDefaults.growthBonus)
    };
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
      if (other.mass <= player.mass * fleeMassRatio) continue;

      const futureThreat = this._predictThreatPosition(player, other, movement, config, lookaheadSeconds);
      const futureDistance = this._distance(player, futureThreat);
      const effectiveDistance = Math.min(distance, futureDistance);
      const dynamicFleeDistance = this._dynamicFleeDistance(player, other, movement, config);
      if (
        effectiveDistance > dynamicFleeDistance + other.radius + player.radius * 0.45
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
      const fearScale = personality.fear * (1.18 - Math.min(0.45, (personality.aggression - 1) * 0.45));
      const intelligenceScale = 0.85 + Math.min(0.35, personality.intelligence * 0.18);
      const score = (massRatio * 3.3 + closeness * 5.2 + closing * 3 + smallness * 1.2) *
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
    const baseStep = (Number(movement.baseSpeed) || DEFAULT_CONFIG.movement.baseSpeed) *
      this._movementMassMultiplier(player, config) *
      (1 + (Number(movement.fleeSpeedBoost) || DEFAULT_CONFIG.movement.fleeSpeedBoost)) *
      0.7;
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
      if (boundaryEscape.x || boundaryEscape.y) {
        const boundaryAlignment = vector.x * boundaryEscape.x + vector.y * boundaryEscape.y;
        score += Math.max(0, boundaryAlignment) * (totalThreatScore * 1.35 + 4.5);
        score -= Math.max(0, -boundaryAlignment) * (totalThreatScore * 1.8 + 5.5);
      }
      score -= this._blockedMovementRatio(player, vector, baseStep, config) * (totalThreatScore * 2.2 + 8);
      const forwardAlignment = vector.x * (player.vx || 0) + vector.y * (player.vy || 0);
      score += Math.max(0, forwardAlignment) * 0.25;

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
    const threatScale = this._clamp((massRatio - 1) * 0.28, 0, 0.75);
    const personalityScale = this._clamp(0.78 + personality.fear * 0.25 - (personality.aggression - 1) * 0.1, 0.65, 1.35);
    return base * (1 + threatScale + smallness * 0.22) * personalityScale;
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
    return this._clamp(1 - maxPenalty * t, minMultiplier, 1);
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

    return this._clamp(
      baseBoost * 0.38 + dominanceBoost + closeBoost + aggressionBoost + intelligenceBoost + weaponBoost,
      0,
      1.75
    );
  }

  _steerVelocity(player, desiredVelocity, behavior, steeringStrength, personality) {
    const current = this._normalizeVector({ x: player.vx, y: player.vy });
    const desired = this._normalizeVector(desiredVelocity);
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
    }

    const alignment = current.x * desired.x + current.y * desired.y;
    if (alignment < -0.25 && decisiveModes.includes(mode)) {
      turnRate = Math.max(turnRate, 0.78);
    } else if (alignment < 0.15 && (mode === 'flee' || mode === 'hunt-player' || mode === 'pressure-player' || mode === 'hunt-food')) {
      turnRate = Math.max(turnRate, 0.68);
    }

    const blended = {
      x: current.x * (1 - turnRate) + desired.x * turnRate,
      y: current.y * (1 - turnRate) + desired.y * turnRate
    };
    const blendedLength = Math.sqrt(blended.x * blended.x + blended.y * blended.y);
    if (blendedLength < 0.08 && decisiveModes.includes(mode)) {
      return desired;
    }
    return this._normalizeVector(blended);
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
    let best = null;
    let bestScore = -Infinity;
    let bestReason = 'safe-food';
    const pressureTarget = strategy.pressureTarget || null;
    const threatTarget = strategy.threatTarget || null;

    for (const food of this._nearbyFood(player, senseDistance + player.radius + 80)) {
      const distance = this._distance(player, food);
      if (distance > senseDistance + player.radius) continue;

      const closeness = 1 - Math.min(1, distance / Math.max(senseDistance, 1));
      const value = Number(food.value) || DEFAULT_CONFIG.foodValue;
      const riskPenalty = this._riskAtPoint(player, food, movement, config) * personality.fear * 0.55;
      const strategyBonus = this._foodStrategyBonus(player, food, movement, config, {
        pressureTarget,
        threatTarget,
        personality,
        senseDistance
      });
      const score = (value * 1.25 + closeness * 2.1 + personality.foodFocus) *
        personality.foodFocus *
        (0.72 + personality.intelligence * 0.18) +
        strategyBonus.score -
        riskPenalty;

      if (score > bestScore) {
        best = food;
        bestScore = score;
        bestReason = strategyBonus.reason || 'safe-food';
      }
    }

    return best ? {
      target: best,
      score: bestScore,
      reason: bestReason,
      strategyTarget: bestReason === 'strategic-growth' ? pressureTarget : null
    } : null;
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
    const minRatio = player.weapon ? 0.78 : 0.88;
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

  _canAttackPlayerTarget(player, other, distance, movement, config = DEFAULT_CONFIG) {
    if (!other || other.username === player.username) return false;
    const absorbContext = this._playerAbsorbContext(player, other, config);
    const weaponContext = this._weaponAttackContext(player, other, config);
    if (!absorbContext.canAbsorb && !weaponContext.canAttack) return false;

    const huntDistance = this._dynamicHuntDistance(player, other, movement, config);
    const weaponRange = weaponContext.range > 0 ? weaponContext.range * 1.2 + player.radius : 0;
    return distance <= Math.max(huntDistance + player.radius, weaponRange);
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

  _personalityTraits(player) {
    return this._normalizePersonality(player && player.personality);
  }

  _normalizePersonality(profile = {}) {
    return {
      id: profile.id || 'balanced',
      label: profile.label || 'Balanced',
      aggression: this._clamp(Number(profile.aggression) || 1, 0.5, 1.7),
      fear: this._clamp(Number(profile.fear) || 1, 0.5, 1.7),
      intelligence: this._clamp(Number(profile.intelligence) || 1, 0.45, 1.65),
      weaponFocus: this._clamp(Number(profile.weaponFocus) || 1, 0.45, 1.7),
      foodFocus: this._clamp(Number(profile.foodFocus) || 1, 0.45, 1.7),
      randomness: this._clamp(Number(profile.randomness) || 0.55, 0.15, 1.35),
      commitment: this._clamp(Number(profile.commitment) || 1, 0.45, 1.7)
    };
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
      const turn = (this.random() * 2 - 1) * Math.PI * 0.7;
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
    });
  }

  _combineSteeringVectors(parts) {
    const vector = { x: 0, y: 0 };
    for (const part of parts || []) {
      if (!part || !part.vector) continue;
      const weight = Number(part.weight) || 0;
      vector.x += (Number(part.vector.x) || 0) * weight;
      vector.y += (Number(part.vector.y) || 0) * weight;
    }
    return this._normalizeVector(vector);
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
    return { x: vector.x / length, y: vector.y / length };
  }

  _redirectBlockedMovement(player, vector, config) {
    const desired = this._normalizeVector(vector);
    const movement = config.movement || DEFAULT_CONFIG.movement;
    const edgeSlack = Math.max(2, Number(movement.boundaryAvoidanceDistance) || DEFAULT_CONFIG.movement.boundaryAvoidanceDistance);
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

    const escape = this._boundaryAvoidanceVector(player, config);
    adjusted = {
      x: adjusted.x + escape.x * 0.9,
      y: adjusted.y + escape.y * 0.9
    };
    return this._normalizeVector(adjusted);
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
    const username = data.uniqueId || data.userId || data.username || data.nickname || '';
    return {
      username: username ? String(username) : '',
      nickname: data.nickname || data.username || username || 'Anonymous',
      profilePictureUrl: data.profilePictureUrl || data.avatar || ''
    };
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

  _serializePlayer(player) {
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
      score: Math.round(player.score * 100) / 100,
      kills: player.kills,
      color: player.color,
      personality: player.personality ? { ...player.personality } : null,
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
    player.lives = this._clamp(before + (Number(amount) || 0), config.minLives, config.maxLives);
    this._syncRadius(player, config);
    return player.lives - before;
  }

  _addMassEquivalent(player, massDelta, config) {
    this._syncRadius(player, config);
    const livesDelta = this._massDeltaToLifeDelta(player.mass, Number(massDelta) || 0, config);
    return this._addLives(player, livesDelta, config);
  }

  _applySlow(player, multiplier, durationMs, now = this.now()) {
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
  }

  _statusSpeedMultiplier(player) {
    const now = this.now();
    if (player.effects?.slowedUntil && now < player.effects.slowedUntil) {
      return this._clamp(Number(player.effects.slowMultiplier) || 1, 0.15, 1);
    }
    return 1;
  }

  _distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  _normalizeVector(vector) {
    const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y);
    if (!length) return { x: 1, y: 0 };
    return { x: vector.x / length, y: vector.y / length };
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
    if (
      Number(stored?.tickRateMs) === LEGACY_DEFAULT_TICK_RATE_MS ||
      Number(stored?.tickRateMs) === PREVIOUS_DEFAULT_TICK_RATE_MS
    ) {
      config.tickRateMs = DEFAULT_CONFIG.tickRateMs;
    }
    if (
      Number(stored?.stateEmitIntervalMs) === LEGACY_DEFAULT_STATE_EMIT_INTERVAL_MS ||
      Number(stored?.stateEmitIntervalMs) === PREVIOUS_DEFAULT_STATE_EMIT_INTERVAL_MS
    ) {
      config.stateEmitIntervalMs = DEFAULT_CONFIG.stateEmitIntervalMs;
    }
    if (Number(stored?.targetFps) === LEGACY_DEFAULT_TARGET_FPS) {
      config.targetFps = DEFAULT_CONFIG.targetFps;
    }
    if (Number(stored?.inactivityGraceMs) === LEGACY_DEFAULT_INACTIVITY_GRACE_MS) {
      config.inactivityGraceMs = DEFAULT_CONFIG.inactivityGraceMs;
    }
    if (Number(stored?.inactivityShrinkPerSecond) === LEGACY_DEFAULT_INACTIVITY_SHRINK_PER_SECOND) {
      config.inactivityShrinkPerSecond = DEFAULT_CONFIG.inactivityShrinkPerSecond;
    }
    if (Number(stored?.maxMass) === LEGACY_DEFAULT_MAX_MASS) {
      config.maxMass = DEFAULT_CONFIG.maxMass;
    }
    if (Number(stored?.maxLives) === LEGACY_DEFAULT_MAX_LIVES) {
      config.maxLives = DEFAULT_CONFIG.maxLives;
    }

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
    }

    if (!Array.isArray(stored?.weaponPickupTypes)) {
      config.weaponPickupTypes = this._mergeWeaponPickupDefaults(config.weaponPickupTypes);
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
