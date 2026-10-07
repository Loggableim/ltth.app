'use strict';

const { randomUUID } = require('crypto');
const claritySettingsSchema = require('../plugins/clarityhud/lib/settings-schema');
const { isHttpAllowed } = require('./public-overlay-registry');

const activeGoalTokens = new Map();
const goalTokensByObject = new WeakMap();
const retiredGoals = new WeakSet();
const WEATHER_ACTIONS = new Set([
  'rain', 'snow', 'storm', 'fog', 'thunder', 'sunbeam', 'glitchclouds',
  'aurora', 'fireflies', 'meteors', 'sakura', 'embers', 'heatwave'
]);
const WEATHER_OPTION_BOUNDS = Object.freeze({
  particleScale: [0.25, 2],
  opacity: [0.05, 1],
  wind: [-1, 1],
  directionDeg: [-180, 180],
  layer: [0, 100],
  glitchIntensity: [0.1, 3]
});
const WEATHER_BOOLEAN_OPTIONS = new Set([
  'glitchRgbShift', 'glitchDisplacement', 'glitchScanlines', 'glitchNoise',
  'glitchBlocks', 'glitchChromaticAberration'
]);
const COIN_JAR_GIFT_SIZE_KEYS = Object.freeze([
  'giftSize1', 'giftSize2To10', 'giftSize11To29', 'giftSize30To99', 'giftSize100To199',
  'giftSize200To499', 'giftSize500To999', 'giftSize1000To1999', 'giftSize2000To4999', 'giftSize5000Plus'
]);
const VISUAL_FX_NUMERIC_BOUNDS = Object.freeze({
  customWidth: [160, 7680, true], customHeight: [160, 7680, true],
  frameThickness: [5, 500, true], frameGap: [0, 100, false], segmentCount: [4, 64, true],
  flameSpeed: [0, 5, false], flameIntensity: [0, 5, false], flameBrightness: [0, 2, false],
  coreWhiteness: [0, 1, false], pulseAmount: [0, 1, false], pulseSpeed: [0.1, 3, false],
  edgeFeather: [0, 1, false], frameCurve: [0, 1, false], frameNoiseAmount: [0, 1, false],
  bloomIntensity: [0, 2, false], bloomThreshold: [0, 1, false]
});
const VISUAL_FX_ENUMS = Object.freeze({
  effectType: ['flames', 'particles', 'energy', 'lightning'],
  visualStyle: ['realistic', 'neon', 'hybrid'],
  qualityMode: ['obs-safe', 'max-quality', 'low-load'],
  resolutionPreset: ['tiktok-portrait', 'tiktok-landscape', 'hd-portrait', 'hd-landscape', '2k-portrait', '2k-landscape', '4k-portrait', '4k-landscape', 'custom'],
  frameMode: ['bottom', 'top', 'sides', 'all'],
  frameStyle: ['classic', 'organic', 'double', 'segmented', 'portal', 'solar-forge', 'prism-reactor', 'arcane-bloom', 'tempest-rift', 'quantum-circuit'],
  pulsePattern: ['breathe', 'heartbeat', 'ripple']
});
const VISUAL_FX_BOOLEAN_KEYS = Object.freeze(['pulseEnabled']);
const VISUAL_FX_COLORS = Object.freeze(['flameColor', 'secondaryColor', 'backgroundTint']);
const ARENA_PUBLIC_ENUMS = Object.freeze({
  fieldFrameDesign: ['neon-grid', 'hazard-zone', 'glass-circuit', 'retro-arcade', 'high-contrast', 'minimal'],
  largeBallTransparencyMode: ['off', 'flat', 'scale'],
  rendererMode: ['auto', 'canvas2d', 'webgpu'],
  topOverlayDesign: [
    'classic', 'widescreen', 'landscape', 'slim', 'high-contrast', 'tournament-bar',
    'esports-caster', 'cyber-strip', 'glass-ribbon', 'compact-scorebug', 'vertical-stack',
    'bottom-ticker', 'split-corners', 'minimal-pro', 'alert-feed', 'framed-field'
  ],
  topOverlayPosition: ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'],
  topOverlayDensity: ['full', 'compact', 'ticker'],
  topOverlayAccent: ['cyan', 'gold', 'red', 'green', 'mono'],
  topOverlayBackdrop: ['transparent', 'glass', 'solid', 'high-contrast'],
  topOverlayRotatorStyle: ['card', 'ticker', 'badge', 'split'],
  topOverlayPlacement: ['auto', 'inside-field', 'above-field', 'below-field'],
  topOverlayTextScale: ['field-auto', 'small', 'compact', 'normal', 'large', 'very-large', 'huge'],
  infoRotatorPlacement: ['in-hud', 'above-field', 'below-field', 'stream-left-panel'],
  infoRotatorLanguageMode: ['de-en', 'en-de', 'de', 'en']
});
const ARENA_PUBLIC_CONFIG_NUMBERS = Object.freeze({
  arenaWidth: [1, 10000], arenaHeight: [1, 10000],
  fieldFrameThickness: [1, 18], fieldFrameGlow: [0, 1.5],
  largeBallTransparencyStartMass: [1, 10000], largeBallMinOpacity: [0.15, 1],
  maxPlayers: [1, 250], maxFoodRender: [0, 2000],
  renderScale: [0.35, 1.25], targetFps: [24, 60], maxRenderPlayers: [0, 250],
  baseMass: [1, 10000], maxMass: [1, 10000],
  topOverlayLeaderboardRows: [0, 8], tickRateMs: [0, 1000], stateEmitIntervalMs: [0, 1000],
  abilityChargeMs: [10000, 300000], boostDurationMs: [1000, 30000], shieldDurationMs: [1000, 30000],
  infoRotatorIntervalMs: [1500, 20000]
});
const ARENA_PUBLIC_HINT_NUMBERS = Object.freeze({
  likeLifeValue: [0.1, 10000],
  likeGrowthMaxMass: [0, 10000],
  giftLifePerCoin: [1, 100000]
});
const GAME_ENGINE_PUBLIC_CONFIG_ENUMS = Object.freeze({
  chess: Object.freeze({ boardTheme: ['dark', 'light', 'wood'] })
});
const GAME_ENGINE_PUBLIC_CONFIG_BOOLEANS = Object.freeze({
  chess: Object.freeze(['showCoordinates', 'highlightLastMove', 'highlightCheck', 'showCapturedPieces', 'celebrationEnabled']),
  connect4: Object.freeze(['showCoordinates', 'soundEnabled', 'showWinStreaks', 'celebrationEnabled', 'leaderboardEnabled', 'eloEnabled'])
});
const GAME_ENGINE_PUBLIC_CONFIG_NUMBERS = Object.freeze({
  chess: Object.freeze({ animationSpeed: [100, 2000], timerWarningTime: [0, 3600] }),
  connect4: Object.freeze({ animationSpeed: [100, 2000], soundVolume: [0, 1], leaderboardDisplayTime: [1, 10] })
});
const GAME_ENGINE_PUBLIC_LEADERBOARD_TYPES = new Set(['daily', 'season', 'lifetime', 'elo']);
const GAME_ENGINE_PUBLIC_DISPLAY_TEXTS = Object.freeze({
  chess: Object.freeze(['titleText', 'labelWhite', 'labelBlack', 'labelYourTurn', 'labelCheck', 'labelCheckmate', 'labelDraw', 'labelWin']),
  connect4: Object.freeze(['titleText', 'labelPlayer1', 'labelPlayer2', 'labelYourTurn', 'labelWaiting', 'labelWin', 'labelDraw'])
});
const ARENA_PUBLIC_CONFIG_BOOLEANS = Object.freeze([
  'fieldFrameEnabled', 'largeBallTransparencyEnabled', 'adaptiveResolutionEnabled',
  'topOverlayShowTitle', 'topOverlayShowCount', 'topOverlayShowLeaderboard',
  'topOverlayShowAbilityLegend', 'topOverlayShowCommandHints', 'chatStrategyEnabled',
  'chatTargetCommandEnabled', 'directAbilitiesEnabled'
]);
const ARENA_PUBLIC_CONFIG_COLORS = Object.freeze(['boostColor', 'shieldColor']);
const ARENA_PUBLIC_DISPLAY_TEXTS = Object.freeze(['titleText', 'feverText', 'emptyText']);
const ARENA_PUBLIC_WEAPON_TYPES = new Set([
  'speed', 'shield', 'freeze', 'dash', 'laser', 'magnet', 'pulse', 'vampire',
  'missile', 'mine', 'blackhole', 'chainsaw'
]);
const ARENA_PUBLIC_AI_STATES = new Set([
  'scouting', 'farming', 'arming', 'dueling', 'retreating', 'recovering', 'dominating'
]);
const ARENA_PUBLIC_MAX_COUNTS = Object.freeze({ players: 250, food: 2048, weaponPickups: 250, mines: 1000, bombs: 1000, leaderboard: 10 });

function isArenaNumber(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isArenaText(value, maxLength, { allowEmpty = true } = {}) {
  return typeof value === 'string' && value.length <= maxLength && (allowEmpty || value.length > 0);
}

function projectGameEnginePublicConfig(gameType, config) {
  if (!['chess', 'connect4'].includes(gameType) || !isRecord(config)) return null;
  const projected = {};
  const colorKeys = gameType === 'chess'
    ? ['backgroundColor', 'whiteColor', 'blackColor']
    : ['boardColor', 'player1Color', 'player2Color', 'textColor'];
  for (const key of colorKeys) {
    if (config[key] === undefined) continue;
    if (typeof config[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(config[key])) return null;
    projected[key] = config[key].toUpperCase();
  }

  if (config.fontFamily !== undefined) {
    if (typeof config.fontFamily !== 'string' || config.fontFamily.length < 1 || config.fontFamily.length > 120
      || !/^[A-Za-z0-9_\s,'".-]+$/.test(config.fontFamily)) return null;
    projected.fontFamily = config.fontFamily;
  }

  for (const [key, allowed] of Object.entries(GAME_ENGINE_PUBLIC_CONFIG_ENUMS[gameType] || {})) {
    if (config[key] === undefined) continue;
    if (typeof config[key] !== 'string' || !allowed.includes(config[key])) return null;
    projected[key] = config[key];
  }
  for (const key of GAME_ENGINE_PUBLIC_CONFIG_BOOLEANS[gameType] || []) {
    if (config[key] === undefined) continue;
    if (typeof config[key] !== 'boolean') return null;
    projected[key] = config[key];
  }
  for (const [key, [min, max]] of Object.entries(GAME_ENGINE_PUBLIC_CONFIG_NUMBERS[gameType] || {})) {
    if (config[key] === undefined) continue;
    if (typeof config[key] !== 'number' || !Number.isFinite(config[key]) || config[key] < min || config[key] > max
      || (key !== 'soundVolume' && !Number.isInteger(config[key]))) return null;
    projected[key] = config[key];
  }
  if (config.displayTexts !== undefined) {
    if (!isRecord(config.displayTexts)) return null;
    const texts = {};
    for (const key of GAME_ENGINE_PUBLIC_DISPLAY_TEXTS[gameType]) {
      if (config.displayTexts[key] === undefined) continue;
      if (!isArenaText(config.displayTexts[key], 200)) return null;
      texts[key] = config.displayTexts[key];
    }
    projected.displayTexts = texts;
  }
  if (gameType === 'connect4' && config.leaderboardTypes !== undefined) {
    if (!Array.isArray(config.leaderboardTypes) || config.leaderboardTypes.length > GAME_ENGINE_PUBLIC_LEADERBOARD_TYPES.size
      || config.leaderboardTypes.some(type => !GAME_ENGINE_PUBLIC_LEADERBOARD_TYPES.has(type))
      || new Set(config.leaderboardTypes).size !== config.leaderboardTypes.length) return null;
    projected.leaderboardTypes = config.leaderboardTypes.slice();
  }
  return projected;
}

function projectGameEngineConfigResponse(gameType, payload) {
  return projectGameEnginePublicConfig(gameType, payload);
}

function projectArenaConfig(config) {
  if (!isRecord(config)) return null;
  const projected = { giftWeaponMappings: {} };

  for (const [key, allowed] of Object.entries(ARENA_PUBLIC_ENUMS)) {
    if (config[key] === undefined) continue;
    if (typeof config[key] !== 'string' || !allowed.includes(config[key])) return null;
    projected[key] = config[key];
  }
  if (config.arenaSizePreset !== undefined) {
    if (!isArenaText(config.arenaSizePreset, 40, { allowEmpty: false })) return null;
    projected.arenaSizePreset = config.arenaSizePreset;
  }
  for (const [key, [min, max]] of Object.entries(ARENA_PUBLIC_CONFIG_NUMBERS)) {
    if (config[key] === undefined) continue;
    if (!isArenaNumber(config[key], min, max)) return null;
    projected[key] = config[key];
  }
  for (const [key, [min, max]] of Object.entries(ARENA_PUBLIC_HINT_NUMBERS)) {
    if (config[key] === undefined) continue;
    const value = Number(config[key]);
    if (!Number.isFinite(value)) return null;
    projected[key] = Math.max(min, Math.min(max, value));
  }
  for (const key of ARENA_PUBLIC_CONFIG_BOOLEANS) {
    if (config[key] === undefined) continue;
    if (typeof config[key] !== 'boolean') return null;
    projected[key] = config[key];
  }
  for (const key of ARENA_PUBLIC_CONFIG_COLORS) {
    if (config[key] === undefined) continue;
    if (typeof config[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(config[key])) return null;
    projected[key] = config[key].toUpperCase();
  }

  if (config.infoRotatorMessages !== undefined) {
    const messages = Array.isArray(config.infoRotatorMessages)
      ? config.infoRotatorMessages
      : typeof config.infoRotatorMessages === 'string' && config.infoRotatorMessages.length <= 15000
        ? config.infoRotatorMessages.split(/\r?\n/)
        : null;
    if (!messages || messages.length > 30 || messages.some(message => !isArenaText(message, 500))) return null;
    projected.infoRotatorMessages = messages.slice();
  }
  if (config.displayTexts !== undefined) {
    if (!isRecord(config.displayTexts)) return null;
    const displayTexts = {};
    for (const key of ARENA_PUBLIC_DISPLAY_TEXTS) {
      if (config.displayTexts[key] === undefined) continue;
      if (!isArenaText(config.displayTexts[key], 256)) return null;
      displayTexts[key] = config.displayTexts[key];
    }
    projected.displayTexts = displayTexts;
  }

  return projected;
}

function projectArenaPoint(value, { velocity = false } = {}) {
  if (!isRecord(value)
    || !isArenaNumber(value.x, -10000, 10000)
    || !isArenaNumber(value.y, -10000, 10000)
    || !isArenaNumber(value.radius, 0, 10000)) return null;
  const projected = { x: value.x, y: value.y, radius: value.radius };
  if (velocity) {
    if (!isArenaNumber(value.vx, -5000, 5000) || !isArenaNumber(value.vy, -5000, 5000)) return null;
    projected.vx = value.vx;
    projected.vy = value.vy;
  }
  return projected;
}

function projectArenaPlayer(player) {
  if (!isRecord(player)
    || !isArenaText(player.username, 80, { allowEmpty: false })
    || !isArenaText(player.nickname, 120)
    || !isArenaNumber(player.mass, 0, 10000)
    || typeof player.color !== 'string'
    || !/^hsl\((?:[0-9]|[1-9][0-9]|[1-2][0-9]{2}|3[0-5][0-9]),\s*78%,\s*58%\)$/i.test(player.color)
    || !isRecord(player.abilities)
    || !isRecord(player.ai)
    || !ARENA_PUBLIC_AI_STATES.has(player.ai.state)
    || !(player.strategy === null || ['hunt', 'attack', 'flee', 'farm', 'role', 'target'].includes(player.strategy))
    || !(player.activeRole === null || isArenaText(player.activeRole, 80, { allowEmpty: false }))
    || !(player.weapon === null || (isRecord(player.weapon) && ARENA_PUBLIC_WEAPON_TYPES.has(player.weapon.type)))) return null;

  const point = projectArenaPoint(player, { velocity: true });
  if (!point) return null;
  const abilities = {};
  for (const key of ['boost', 'shield']) {
    const ability = player.abilities[key];
    if (!isRecord(ability) || typeof ability.ready !== 'boolean'
      || !isArenaNumber(ability.chargeProgress, 0, 1)) return null;
    abilities[key] = { ready: ability.ready, chargeProgress: ability.chargeProgress };
  }
  if (!isRecord(player.abilities.bomb) || typeof player.abilities.bomb.ready !== 'boolean') return null;
  abilities.bomb = { ready: player.abilities.bomb.ready };

  return {
    ...point,
    username: player.username,
    nickname: player.nickname,
    mass: player.mass,
    color: player.color,
    abilities,
    strategy: player.strategy,
    targetUsername: Boolean(player.targetUsername),
    activeRole: player.activeRole,
    ai: { state: player.ai.state },
    weapon: player.weapon ? { type: player.weapon.type } : null
  };
}

function projectArenaPublicState(payload) {
  if (!isRecord(payload) || payload.gameType !== 'arena' || !isRecord(payload.fever)
    || typeof payload.fever.active !== 'boolean' || !Array.isArray(payload.players)
    || !Array.isArray(payload.food) || !Array.isArray(payload.weaponPickups)
    || !Array.isArray(payload.mines) || !Array.isArray(payload.bombs)
    || !Array.isArray(payload.leaderboard)) return null;
  if (payload.players.length > ARENA_PUBLIC_MAX_COUNTS.players
    || payload.food.length > ARENA_PUBLIC_MAX_COUNTS.food
    || payload.weaponPickups.length > ARENA_PUBLIC_MAX_COUNTS.weaponPickups
    || payload.mines.length > ARENA_PUBLIC_MAX_COUNTS.mines
    || payload.bombs.length > ARENA_PUBLIC_MAX_COUNTS.bombs
    || payload.leaderboard.length > ARENA_PUBLIC_MAX_COUNTS.leaderboard) return null;

  const config = projectArenaConfig(payload.config);
  if (!config) return null;
  const players = payload.players.map(projectArenaPlayer);
  if (players.some(player => !player)) return null;
  const food = payload.food.map(item => {
    const point = projectArenaPoint(item);
    if (!point || !isArenaText(item.source, 32, { allowEmpty: false })
      || !isArenaNumber(item.spawnedAt, 0, Number.MAX_SAFE_INTEGER)
      || !(item.expiresAt === null || isArenaNumber(item.expiresAt, 0, Number.MAX_SAFE_INTEGER))
      || !isArenaNumber(item.fadeOutMs, 0, 90000)) return null;
    const source = item.source === 'ambient' || item.source === 'life-drop' ? item.source : 'burst';
    return { ...point, source, spawnedAt: item.spawnedAt, expiresAt: item.expiresAt, fadeOutMs: item.fadeOutMs };
  });
  if (food.some(item => !item)) return null;
  const weaponPickups = payload.weaponPickups.map(item => {
    const point = projectArenaPoint(item);
    return point && ARENA_PUBLIC_WEAPON_TYPES.has(item.type) ? { ...point, type: item.type } : null;
  });
  if (weaponPickups.some(item => !item)) return null;
  const mines = payload.mines.map(mine => projectArenaPoint(mine));
  if (mines.some(item => !item)) return null;
  const bombs = payload.bombs.map(bomb => {
    const point = projectArenaPoint(bomb, { velocity: true });
    return point && ['flying', 'armed'].includes(bomb.phase) ? { ...point, phase: bomb.phase } : null;
  });
  if (bombs.some(bomb => !bomb)) return null;
  const leaderboard = payload.leaderboard.map(row => {
    if (!isRecord(row) || !isArenaNumber(row.rank, 1, 10)
      || !isArenaText(row.username, 80, { allowEmpty: false })
      || !isArenaText(row.nickname, 120)
      || !isArenaNumber(row.mass, 0, 10000)) return null;
    return { rank: row.rank, username: row.username, nickname: row.nickname, mass: row.mass };
  });
  if (leaderboard.some(row => !row)) return null;

  return {
    gameType: 'arena',
    config,
    fever: { active: payload.fever.active },
    players,
    food,
    weaponPickups,
    mines,
    bombs,
    leaderboard
  };
}
const VISUAL_FX_DESIGN_CONTROLS = Object.freeze({
  'solar-forge': ['emberFlow', 'moltenCrust'],
  'prism-reactor': ['refraction', 'sweepSpeed'],
  'arcane-bloom': ['runeDensity', 'orbitSpeed'],
  'tempest-rift': ['arcCount', 'riftTurbulence'],
  'quantum-circuit': ['traceDensity', 'hudSweep']
});
const INTERACTIVE_STORY_OVERLAY_FONTS = new Set([
  'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
  'Arial, Helvetica, sans-serif',
  'Georgia, serif',
  "'Times New Roman', serif"
]);
const INTERACTIVE_STORY_BACKGROUNDS = new Set([
  'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.9) 30%, rgba(0,0,0,0.95) 100%)',
  'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.95) 100%)',
  'linear-gradient(135deg, rgba(15,52,96,0.5) 0%, rgba(0,0,0,0.9) 100%)',
  'rgba(0,0,0,0)'
]);
const FLAME_OVERLAY_ENUMS = Object.freeze({
  effectType: ['flames', 'particles', 'energy', 'lightning'],
  resolutionPreset: ['tiktok-portrait', 'tiktok-landscape', 'hd-portrait', 'hd-landscape', '2k-portrait', '2k-landscape', '4k-portrait', '4k-landscape', 'custom'],
  frameMode: ['bottom', 'top', 'sides', 'all'],
  animationEasing: ['linear', 'sine', 'quad', 'elastic'],
  qualityMode: ['obs-safe', 'max-quality', 'low-load']
});
const FLAME_OVERLAY_NUMERIC_BOUNDS = Object.freeze({
  customWidth: [160, 7680, true], customHeight: [160, 7680, true],
  frameThickness: [1, 2000, true], backgroundTintOpacity: [0, 1, false],
  flameSpeed: [0, 5, false], flameIntensity: [0, 5, false], flameBrightness: [0, 2, false],
  noiseOctaves: [1, 12, true], edgeFeather: [0, 1, false], frameCurve: [0, 1, false],
  frameNoiseAmount: [0, 1, false], pulseAmount: [0, 1, false], pulseSpeed: [0.1, 3, false],
  bloomIntensity: [0, 2, false], bloomThreshold: [0, 1, false], bloomRadius: [1, 10, false],
  layerCount: [1, 3, true], layerParallax: [0, 1, false], chromaticAberration: [0, 0.02, false],
  filmGrain: [0, 0.1, false], depthIntensity: [0, 1, false], cinematicContrast: [0, 2, false],
  coreWhiteness: [0, 1, false], emberTrailAmount: [0, 1, false], sparkDensity: [0, 2, false],
  heatDistortionStrength: [0, 1, false], smokeIntensity: [0, 1, false], smokeSpeed: [0.1, 1, false],
  visualProfileVersion: [1, 100, true]
});
const FLAME_OVERLAY_BOOLEAN_KEYS = Object.freeze([
  'enableGlow', 'enableAdditiveBlend', 'maskOnlyEdges', 'highDPI', 'useHighQualityTextures',
  'detailScaleAuto', 'pulseEnabled', 'bloomEnabled', 'layersEnabled', 'sparkEnabled',
  'heatDistortionEnabled', 'smokeEnabled'
]);
const FLAME_OVERLAY_COLOR_KEYS = Object.freeze(['flameColor', 'backgroundTint', 'smokeColor']);
const FLAME_OVERLAY_TRIGGER_TYPES = new Set([
  'dramatic', 'intensity-boost', 'flash', 'pulse', 'effect-switch', 'color-flash', 'color-change'
]);
const clarityRawTokens = new WeakMap();
const CLARITY_QUEUE_TYPES = ['chat', 'follow', 'share', 'like', 'gift', 'subscribe', 'treasure', 'join'];
const CLARITY_LEGACY_CHAT_SETTINGS = new Set(['textAlign', 'userNameColor', 'textOutline', 'padding', 'messageSpacing', 'animationType', 'visionImpairedMode']);
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function boundedText(value, limit = 500) {
  return typeof value === 'string' && value.length <= limit ? value : null;
}

function projectClarityUrl(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 2048 || !/^https?:\/\//i.test(value)) return null;
  return value;
}

function projectClarityBadge(value) {
  if (value == null || typeof value === 'string') return value ?? null;
  if (!isRecord(value)) return null;
  const badge = {};
  for (const key of ['type', 'name', 'displayType']) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== 'string' || value[key].length > 80) return null;
    badge[key] = value[key];
  }
  for (const key of ['imageUrl', 'url']) {
    if (value[key] === undefined) continue;
    const url = projectClarityUrl(value[key]);
    if (url === null) return null;
    badge[key] = url;
  }
  return badge;
}

function projectClarityUser(user) {
  if (!isRecord(user)) return null;
  const uniqueId = boundedText(user.uniqueId, 80);
  const nickname = boundedText(user.nickname, 120);
  if (uniqueId === null || nickname === null) return null;
  const projected = { uniqueId, nickname };
  if (user.profilePictureUrl !== undefined) {
    projected.profilePictureUrl = projectClarityUrl(user.profilePictureUrl);
    if (user.profilePictureUrl !== null && projected.profilePictureUrl === null) return null;
  }
  if (user.badge !== undefined) {
    projected.badge = projectClarityBadge(user.badge);
    if (user.badge !== null && projected.badge === null) return null;
  }
  return projected;
}

function getClarityRawToken(raw) {
  let token = clarityRawTokens.get(raw);
  if (!token) {
    token = randomUUID();
    clarityRawTokens.set(raw, token);
  }
  return token;
}

function projectClarityRawChat(raw, displayHandle) {
  if (!isRecord(raw)) return null;
  const result = {};
  for (const key of ['username', 'nickname', 'comment', 'message', 'createTime', 'timestamp']) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] !== 'string' || raw[key].length > 2000) return null;
    result[key] = raw[key];
  }
  for (const key of ['isModerator', 'isSubscriber']) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] !== 'boolean') return null;
    result[key] = raw[key];
  }
  for (const key of ['teamMemberLevel', 'gifterLevel']) {
    if (raw[key] === undefined) continue;
    if (!Number.isInteger(raw[key]) || raw[key] < 0 || raw[key] > 999) return null;
    result[key] = raw[key];
  }
  const handle = boundedText(displayHandle, 80);
  if (handle !== null) result.uniqueId = handle;
  if (raw.userId !== undefined) {
    if (!((typeof raw.userId === 'string' && raw.userId.length > 0 && raw.userId.length <= 256)
      || (typeof raw.userId === 'number' && Number.isFinite(raw.userId)))) return null;
  }
  result.userId = getClarityRawToken(raw);
  if (raw.userIdentity !== undefined) {
    if (!isRecord(raw.userIdentity)) return null;
    result.userIdentity = {};
    for (const key of ['isModeratorOfAnchor', 'isSubscriberOfAnchor']) {
      if (raw.userIdentity[key] === undefined) continue;
      if (typeof raw.userIdentity[key] !== 'boolean') return null;
      result.userIdentity[key] = raw.userIdentity[key];
    }
  }
  if (raw.user !== undefined) {
    if (!isRecord(raw.user)) return null;
    const user = {};
    if (handle !== null) user.uniqueId = handle;
    for (const key of ['nickname', 'displayName']) {
      if (raw.user[key] === undefined) continue;
      if (typeof raw.user[key] !== 'string' || raw.user[key].length > 120) return null;
      user[key] = raw.user[key];
    }
    for (const key of ['isModerator', 'isSubscriber']) {
      if (raw.user[key] === undefined) continue;
      if (typeof raw.user[key] !== 'boolean') return null;
      user[key] = raw.user[key];
    }
    for (const key of ['teamMemberLevel', 'gifterLevel']) {
      if (raw.user[key] === undefined) continue;
      if (!Number.isInteger(raw.user[key]) || raw.user[key] < 0 || raw.user[key] > 999) return null;
      user[key] = raw.user[key];
    }
    if (raw.user.profilePictureUrl !== undefined || raw.user.avatarUrl !== undefined) {
      const avatar = raw.user.profilePictureUrl ?? raw.user.avatarUrl;
      user.profilePictureUrl = projectClarityUrl(avatar);
      if (avatar !== null && user.profilePictureUrl === null) return null;
    }
    if (raw.user.fansClub !== undefined) {
      const club = raw.user.fansClub;
      if (!isRecord(club)) return null;
      const level = club.level ?? club.data?.level;
      if (level !== undefined) {
        if (!Number.isInteger(level) || level < 0 || level > 999) return null;
        user.fansClub = { level };
        const name = club.clubName ?? club.data?.clubName;
        if (name !== undefined) {
          if (typeof name !== 'string' || name.length > 80) return null;
          user.fansClub.clubName = name;
        }
      }
    }
    result.user = user;
  }
  if (raw.fansClub !== undefined) {
    const club = raw.fansClub;
    if (!isRecord(club)) return null;
    const level = club.level ?? club.data?.level;
    if (level !== undefined) {
      if (!Number.isInteger(level) || level < 0 || level > 999) return null;
      result.fansClub = { level };
      const name = club.clubName ?? club.data?.clubName;
      if (name !== undefined) {
        if (typeof name !== 'string' || name.length > 80) return null;
        result.fansClub.clubName = name;
      }
    }
  }
  if (raw.badges !== undefined) {
    if (!Array.isArray(raw.badges) || raw.badges.length > 12) return null;
    result.badges = raw.badges.map(projectClarityBadge);
    if (result.badges.some(badge => badge === null)) return null;
  }
  if (raw.emotes !== undefined) {
    if (!Array.isArray(raw.emotes) || raw.emotes.length > 100) return null;
    result.emotes = [];
    for (const emote of raw.emotes) {
      if (!isRecord(emote)) return null;
      const projected = {};
      for (const key of ['id', 'emoteId', 'name', 'code', 'text', 'emoteText']) {
        if (emote[key] === undefined) continue;
        if (typeof emote[key] !== 'string' || emote[key].length > 100) return null;
        projected[key] = emote[key];
      }
      const imageUrl = emote.imageUrl || emote.url || emote.image?.imageUrl || emote.urls?.[0] || emote.image?.urls?.[0];
      if (imageUrl !== undefined) {
        projected.imageUrl = projectClarityUrl(imageUrl);
        if (projected.imageUrl === null) return null;
      }
      result.emotes.push(projected);
    }
  }
  if (raw.textArray !== undefined) {
    if (!Array.isArray(raw.textArray) || raw.textArray.length > 200) return null;
    result.textArray = [];
    for (const segment of raw.textArray) {
      if (typeof segment === 'string') {
        if (segment.length > 2000) return null;
        result.textArray.push(segment);
        continue;
      }
      if (!isRecord(segment)) return null;
      const projected = {};
      for (const key of ['type', 'text', 'content']) {
        if (segment[key] === undefined) continue;
        if (typeof segment[key] !== 'string' || segment[key].length > 2000) return null;
        projected[key] = segment[key];
      }
      const emote = segment.emote || segment;
      if (segment.type === 'emote' || segment.emote) {
        if (!isRecord(emote)) return null;
        const projectedEmote = {};
        for (const key of ['emoteId', 'id', 'emoteText', 'text']) {
          if (emote[key] === undefined) continue;
          if (typeof emote[key] !== 'string' || emote[key].length > 120) return null;
          projectedEmote[key] = emote[key];
        }
        const imageUrl = emote.imageUrl || emote.image?.imageUrl || emote.urls?.[0] || emote.image?.urls?.[0] || emote.url;
        if (imageUrl !== undefined) {
          projectedEmote.imageUrl = projectClarityUrl(imageUrl);
          if (projectedEmote.imageUrl === null) return null;
        }
        if (segment.emote) projected.emote = projectedEmote;
        else Object.assign(projected, projectedEmote);
      }
      result.textArray.push(projected);
    }
  }
  if (raw.common !== undefined) {
    if (!isRecord(raw.common)) return null;
    const common = {};
    if (raw.common.emoteList !== undefined) {
      if (!Array.isArray(raw.common.emoteList) || raw.common.emoteList.length > 100) return null;
      common.emoteList = [];
      for (const emote of raw.common.emoteList) {
        if (!isRecord(emote)) return null;
        const projected = {};
        for (const key of ['emoteId', 'id', 'emoteText', 'text']) {
          if (emote[key] === undefined) continue;
          if (typeof emote[key] !== 'string' || emote[key].length > 120) return null;
          projected[key] = emote[key];
        }
        const imageUrl = emote.imageUrl || emote.image?.imageUrl || emote.urls?.[0] || emote.image?.urls?.[0] || emote.url;
        if (imageUrl !== undefined) {
          projected.imageUrl = projectClarityUrl(imageUrl);
          if (projected.imageUrl === null) return null;
        }
        common.emoteList.push(projected);
      }
    }
    result.common = common;
  }
  return result;
}

function projectClaritySettings(dock, input) {
  if (!isRecord(input)) return null;
  const defaults = claritySettingsSchema.getDefaults(dock);
  const filtered = {};
  for (const key of Object.keys(defaults)) if (input[key] !== undefined) filtered[key] = input[key];
  if (dock === 'chat') {
    for (const key of CLARITY_LEGACY_CHAT_SETTINGS) if (input[key] !== undefined) filtered[key] = input[key];
  }
  const centralInput = {};
  for (const key of Object.keys(defaults)) if (filtered[key] !== undefined) centralInput[key] = filtered[key];
  const validated = claritySettingsSchema.validateSettings(dock, centralInput);
  if (!validated.valid) return null;
  const result = validated.sanitized;
  if (result.lineHeight !== undefined) {
    const lineHeight = typeof result.lineHeight === 'number'
      ? result.lineHeight
      : (/^\d+(?:\.\d+)?$/.test(result.lineHeight) ? Number(result.lineHeight) : NaN);
    if (!Number.isFinite(lineHeight) || lineHeight < 0.5 || lineHeight > 5) return null;
  }
  if (dock === 'chat') {
    const legacy = filtered;
    if (legacy.textAlign !== undefined) {
      if (!['left', 'center', 'right'].includes(legacy.textAlign)) return null;
      result.textAlign = legacy.textAlign;
    }
    if (legacy.userNameColor !== undefined) {
      if (typeof legacy.userNameColor !== 'string' || !/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent)$/i.test(legacy.userNameColor)) return null;
      result.userNameColor = legacy.userNameColor;
    }
    for (const key of ['textOutline', 'padding', 'messageSpacing']) {
      if (legacy[key] === undefined) continue;
      const match = typeof legacy[key] === 'string' && legacy[key].match(/^(\d{1,2})(px|rem|em)$/);
      if (!match || Number(match[1]) > (key === 'textOutline' ? 8 : 48)) return null;
      result[key] = legacy[key];
    }
    if (legacy.animationType !== undefined) {
      if (!['fade', 'slide', 'pop'].includes(legacy.animationType)) return null;
      result.animationType = legacy.animationType;
    }
    if (legacy.visionImpairedMode !== undefined) {
      if (typeof legacy.visionImpairedMode !== 'boolean') return null;
      result.visionImpairedMode = legacy.visionImpairedMode;
    }
  }
  if (dock === 'multi') {
    result.streams = result.streams.map(stream => ({
      ...stream,
      username: stream.enabled && stream.username ? 'configured' : '',
      displayName: ''
    }));
  }
  return result;
}

function projectClarityEvent(eventType, event, { history = false } = {}) {
  if (!isRecord(event)) return null;
  if (history && (event.type !== eventType || !Number.isFinite(event.timestamp))) return null;
  const user = projectClarityUser(event.user);
  if (!user) return null;
  const result = {};
  if (history) Object.assign(result, { type: eventType, timestamp: event.timestamp });
  result.user = user;
  for (const key of ['uniqueId', 'username', 'message', 'comment', 'giftName', 'subscribeType']) {
    if (event[key] === undefined) continue;
    if (typeof event[key] !== 'string' || event[key].length > 2000) return null;
    result[key] = event[key];
  }
  for (const key of ['coins', 'likeCount', 'totalLikeCount', 'userCount']) {
    if (event[key] === undefined) continue;
    if (typeof event[key] !== 'number' || !Number.isFinite(event[key]) || event[key] < 0 || event[key] > 1e9) return null;
    result[key] = event[key];
  }
  for (const key of ['isAggregated']) {
    if (event[key] === undefined) continue;
    if (typeof event[key] !== 'boolean') return null;
    result[key] = event[key];
  }
  if (event.gift !== undefined) {
    if (!isRecord(event.gift)) return null;
    const gift = {};
    for (const key of ['name']) {
      if (event.gift[key] === undefined) continue;
      if (typeof event.gift[key] !== 'string' || event.gift[key].length > 160) return null;
      gift[key] = event.gift[key];
    }
    for (const key of ['count', 'coins', 'diamondCount']) {
      if (event.gift[key] === undefined) continue;
      if (!Number.isFinite(event.gift[key]) || event.gift[key] < 0 || event.gift[key] > 1e9) return null;
      gift[key] = event.gift[key];
    }
    for (const key of ['image', 'pictureUrl']) {
      if (event.gift[key] === undefined) continue;
      gift[key] = projectClarityUrl(event.gift[key]);
      if (event.gift[key] !== null && gift[key] === null) return null;
    }
    if (typeof event.gift.isTreasureChest === 'boolean') gift.isTreasureChest = event.gift.isTreasureChest;
    result.gift = gift;
  }
  if (event.raw !== undefined && eventType === 'chat') {
    result.raw = projectClarityRawChat(event.raw, user.uniqueId);
    if (!result.raw) return null;
  }
  return result;
}

function projectClarityMultiEvent(eventType, event) {
  if (!isRecord(event) || !Number.isInteger(event.streamIndex) || event.streamIndex < 0 || event.streamIndex > 5
    || !Number.isFinite(event.timestamp) || !/^stream[1-6]$/.test(event.sourceId || '')) return null;
  const user = projectClarityUser(event.user);
  if (!user || !isRecord(event.colors)) return null;
  const colors = {};
  for (const key of ['text', 'bg', 'accent']) {
    if (typeof event.colors[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(event.colors[key])) return null;
    colors[key] = event.colors[key];
  }
  const result = { sourceId: event.sourceId, sourceLabel: `Stream ${event.streamIndex + 1}`, streamIndex: event.streamIndex, colors, user, timestamp: event.timestamp };
  if (eventType === 'chat') {
    if (typeof event.message !== 'string' || event.message.length > 2000) return null;
    result.message = event.message;
    result.raw = projectClarityRawChat(event.raw, user.uniqueId);
    if (!result.raw) return null;
  } else {
    if (!isRecord(event.gift)) return null;
    const gift = {};
    for (const key of ['name']) {
      if (typeof event.gift[key] !== 'string' || event.gift[key].length > 160) return null;
      gift[key] = event.gift[key];
    }
    for (const key of ['count', 'diamondCount', 'coins']) {
      if (!Number.isFinite(event.gift[key]) || event.gift[key] < 0 || event.gift[key] > 1e9) return null;
      gift[key] = event.gift[key];
    }
    gift.pictureUrl = projectClarityUrl(event.gift.pictureUrl);
    if (event.gift.pictureUrl !== null && gift.pictureUrl === null) return null;
    result.gift = gift;
  }
  return result;
}

function projectClarityStateResponse(dock, payload) {
  if (!isRecord(payload) || payload.success !== true || payload.dock !== dock || !isRecord(payload.events)) return null;
  const settings = projectClaritySettings(dock === 'chat' ? 'chat' : 'full', payload.settings);
  if (!settings) return null;
  const events = {};
  const allowedQueues = dock === 'chat' ? ['chat'] : CLARITY_QUEUE_TYPES;
  for (const type of allowedQueues) {
    const queue = payload.events[type];
    if (queue === undefined) continue;
    if (!Array.isArray(queue) || queue.length > 500) return null;
    events[type] = queue.map(item => projectClarityEvent(type, item, { history: true }));
    if (events[type].some(item => !item)) return null;
  }
  return { success: true, dock, events, settings };
}

function projectClaritySettingsResponse(dock, payload) {
  if (!isRecord(payload) || payload.success !== true || payload.dock !== dock) return null;
  const settings = projectClaritySettings(dock, payload.settings);
  return settings ? { success: true, dock, settings } : null;
}

function projectVisualFxFrameWebGPUConfig(config) {
  if (!isRecord(config)) return null;
  const projected = {};
  for (const [key, values] of Object.entries(VISUAL_FX_ENUMS)) {
    if (!values.includes(config[key])) return null;
    projected[key] = config[key];
  }
  for (const [key, [minimum, maximum, integer]] of Object.entries(VISUAL_FX_NUMERIC_BOUNDS)) {
    const value = config[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) return null;
    projected[key] = value;
  }
  for (const key of VISUAL_FX_BOOLEAN_KEYS) {
    if (typeof config[key] !== 'boolean') return null;
    projected[key] = config[key];
  }
  for (const key of VISUAL_FX_COLORS) {
    if (typeof config[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(config[key])) return null;
    projected[key] = config[key];
  }
  if (!Array.isArray(config.framePositions) || config.framePositions.length < 1 || config.framePositions.length > 8) return null;
  projected.framePositions = [];
  for (const frame of config.framePositions) {
    if (!isRecord(frame) || ['x', 'y'].some(key => typeof frame[key] !== 'number' || !Number.isFinite(frame[key]) || frame[key] < 0 || frame[key] > 100)
      || ['width', 'height'].some(key => typeof frame[key] !== 'number' || !Number.isFinite(frame[key]) || frame[key] < 1 || frame[key] > 100)) return null;
    projected.framePositions.push({ x: frame.x, y: frame.y, width: frame.width, height: frame.height });
  }
  if (!isRecord(config.designControls)) return null;
  projected.designControls = {};
  for (const [style, keys] of Object.entries(VISUAL_FX_DESIGN_CONTROLS)) {
    const controls = config.designControls[style];
    if (!isRecord(controls)) return null;
    projected.designControls[style] = {};
    for (const key of keys) {
      if (typeof controls[key] !== 'number' || !Number.isFinite(controls[key]) || controls[key] < 0 || controls[key] > 1) return null;
      projected.designControls[style][key] = controls[key];
    }
  }
  return projected;
}

function projectVisualFxFrameWebGPUConfigResponse(payload) {
  if (!isRecord(payload) || payload.success !== true) return null;
  const config = projectVisualFxFrameWebGPUConfig(payload.config);
  return config ? { success: true, config } : null;
}

function projectVisualFxFrameWebGPUTrigger(payload) {
  if (!isRecord(payload) || typeof payload.type !== 'string'
    || !['dramatic', 'intensity-boost', 'flash', 'pulse', 'effect-switch', 'color-flash', 'color-change'].includes(payload.type)) return null;
  const projected = { type: payload.type };
  if (payload.effect !== undefined) {
    if (!['flames', 'particles', 'energy', 'lightning'].includes(payload.effect)) return null;
    projected.effect = payload.effect;
  }
  if (payload.color !== undefined) {
    if (typeof payload.color !== 'string' || payload.color.length > 32) return null;
    projected.color = payload.color;
  }
  if (payload.duration !== undefined) {
    if (!Number.isFinite(payload.duration) || payload.duration < 100 || payload.duration > 30000) return null;
    projected.duration = payload.duration;
  }
  for (const key of ['amount', 'intensity', 'intensityBoost']) {
    if (payload[key] === undefined) continue;
    if (!Number.isFinite(payload[key]) || payload[key] < 0 || payload[key] > 5) return null;
    projected[key] = payload[key];
  }
  return projected;
}

function projectInteractiveStoryConfigResponse(payload) {
  if (!isRecord(payload)
    || !['landscape', 'portrait'].includes(payload.overlayOrientation)
    || !['1920x1080', '1280x720', '2560x1440', '1080x1920'].includes(payload.overlayResolution)
    || !['full', 'sentence', 'scroll'].includes(payload.overlayDisplayMode)
    || !INTERACTIVE_STORY_OVERLAY_FONTS.has(payload.overlayFontFamily)
    || !Number.isFinite(payload.overlayFontSize) || payload.overlayFontSize < 0.5 || payload.overlayFontSize > 3
    || !Number.isFinite(payload.overlayTitleFontSize) || payload.overlayTitleFontSize < 1 || payload.overlayTitleFontSize > 5
    || typeof payload.overlayTextColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(payload.overlayTextColor)
    || typeof payload.overlayTitleColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(payload.overlayTitleColor)
    || !INTERACTIVE_STORY_BACKGROUNDS.has(payload.overlayBackgroundGradient)) return null;

  return {
    overlayOrientation: payload.overlayOrientation,
    overlayResolution: payload.overlayResolution,
    overlayDisplayMode: payload.overlayDisplayMode,
    overlayFontFamily: payload.overlayFontFamily,
    overlayFontSize: payload.overlayFontSize,
    overlayTitleFontSize: payload.overlayTitleFontSize,
    overlayTextColor: payload.overlayTextColor,
    overlayTitleColor: payload.overlayTitleColor,
    overlayBackgroundGradient: payload.overlayBackgroundGradient,
    // Custom animation URLs are external resource triggers on public clients.
    // Fall back to the shipped spinner; story images use their separate route.
    generatingAnimationMode: 'default'
  };
}

function projectFlameOverlayConfig(config) {
  if (!isRecord(config)) return null;
  const projected = {};
  for (const [key, values] of Object.entries(FLAME_OVERLAY_ENUMS)) {
    if (!values.includes(config[key])) return null;
    projected[key] = config[key];
  }
  for (const [key, [minimum, maximum, integer]] of Object.entries(FLAME_OVERLAY_NUMERIC_BOUNDS)) {
    const value = config[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) return null;
    projected[key] = value;
  }
  for (const key of FLAME_OVERLAY_BOOLEAN_KEYS) {
    if (typeof config[key] !== 'boolean') return null;
    projected[key] = config[key];
  }
  for (const key of FLAME_OVERLAY_COLOR_KEYS) {
    if (typeof config[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(config[key])) return null;
    projected[key] = config[key];
  }
  if (!Array.isArray(config.framePositions) || config.framePositions.length < 1) return null;
  const frame = config.framePositions[0];
  if (!isRecord(frame) || ['x', 'y'].some(key => typeof frame[key] !== 'number' || !Number.isFinite(frame[key]) || frame[key] < 0 || frame[key] > 100)
    || ['width', 'height'].some(key => typeof frame[key] !== 'number' || !Number.isFinite(frame[key]) || frame[key] < 1 || frame[key] > 100)) return null;
  // EffectsEngine reads only framePositions[0]; extra editor/internal entries are not public renderer state.
  projected.framePositions = [{ x: frame.x, y: frame.y, width: frame.width, height: frame.height }];
  return projected;
}

function projectFlameOverlayConfigResponse(payload) {
  if (!isRecord(payload) || payload.success !== true) return null;
  const config = projectFlameOverlayConfig(payload.config);
  return config ? { success: true, config } : null;
}

function projectFlameOverlayTrigger(payload) {
  if (!isRecord(payload) || !FLAME_OVERLAY_TRIGGER_TYPES.has(payload.type)) return null;
  if (typeof payload.duration !== 'number' || !Number.isFinite(payload.duration) || payload.duration < 100 || payload.duration > 30000) return null;
  if (payload.revert !== undefined && typeof payload.revert !== 'boolean') return null;
  if (payload.permanent !== undefined && typeof payload.permanent !== 'boolean') return null;
  const projected = {
    id: randomUUID(),
    type: payload.type,
    duration: payload.duration
  };
  if (payload.revert !== undefined) projected.revert = payload.revert;
  if (payload.permanent !== undefined) projected.permanent = payload.permanent;
  if (payload.effect !== undefined) {
    if (!['flames', 'particles', 'energy', 'lightning'].includes(payload.effect)) return null;
    projected.effect = payload.effect;
  }
  for (const key of ['amount', 'intensity', 'intensityBoost']) {
    if (payload[key] === undefined) continue;
    if (typeof payload[key] !== 'number' || !Number.isFinite(payload[key]) || payload[key] < 0 || payload[key] > 5) return null;
    projected[key] = payload[key];
  }
  if (payload.color !== undefined) {
    if (typeof payload.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(payload.color)) return null;
    projected.color = payload.color;
  }
  if (payload.bloom !== undefined) {
    if (typeof payload.bloom !== 'boolean') return null;
    projected.bloom = payload.bloom;
  }
  if (payload.bloomOverride !== undefined) {
    const override = payload.bloomOverride;
    if (!isRecord(override) || typeof override.enabled !== 'boolean'
      || (override.intensity !== undefined && (typeof override.intensity !== 'number' || !Number.isFinite(override.intensity) || override.intensity < 0 || override.intensity > 2))) return null;
    projected.bloomOverride = { enabled: override.enabled };
    if (override.intensity !== undefined) projected.bloomOverride.intensity = override.intensity;
  }
  return projected;
}

function projectTopTierUpdate(payload) {
  if (!isRecord(payload) || !['likes', 'gifts'].includes(payload.board) || !Array.isArray(payload.entries)) return null;
  const entries = [];
  for (const entry of payload.entries) {
    if (!isRecord(entry) || typeof entry.username !== 'string') return null;
    if (entry.nickname != null && typeof entry.nickname !== 'string') return null;
    if (entry.profile_picture_url != null && typeof entry.profile_picture_url !== 'string') return null;
    if (!Number.isFinite(entry.score) || entry.score < 0 || !Number.isInteger(entry.rank) || entry.rank < 1) return null;
    const projected = {
      username: entry.username,
      score: entry.score,
      rank: entry.rank
    };
    if (entry.nickname != null) projected.nickname = entry.nickname;
    if (entry.profile_picture_url != null) projected.profile_picture_url = entry.profile_picture_url;
    entries.push(projected);
  }
  return { board: payload.board, entries };
}

function projectTopTierRankChange(payload) {
  if (!isRecord(payload)
    || typeof payload.username !== 'string' || payload.username.length === 0 || payload.username.length > 120
    || !Number.isSafeInteger(payload.oldRank) || payload.oldRank < 1 || payload.oldRank > 9999
    || !Number.isSafeInteger(payload.newRank) || payload.newRank < 1 || payload.newRank > 9999
    || payload.oldRank === payload.newRank) return null;
  return { username: payload.username, oldRank: payload.oldRank, newRank: payload.newRank };
}

function projectTopTierNewLeader(payload) {
  if (!isRecord(payload) || typeof payload.username !== 'string' || payload.username.length === 0 || payload.username.length > 120) return null;
  return { username: payload.username };
}

function projectTopTierDecay(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.affectedUsers) || payload.affectedUsers.length > 9999
    || payload.affectedUsers.some(username => typeof username !== 'string' || username.length === 0 || username.length > 120)) return null;
  // The original overlay only uses these names to animate rendered rows. The decay producer
  // also sends every affected row in a potentially much larger board; cap the public hint to
  // the ten rows emitted by the decay board refresh and remove duplicate names.
  const affectedUsers = [...new Set(payload.affectedUsers)].slice(0, 10);
  return { affectedUsers };
}

const GCCE_HUD_POSITIONS = new Set([
  'top-left', 'top-center', 'top-right', 'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right'
]);
const GCCE_ROTATOR_TEMPLATES = new Set([
  'card', 'banner', 'minimal', 'modern', 'neon', 'elegant', 'bold', 'compact', 'wide', 'gradient'
]);
const GCCE_ROTATOR_ANIMATIONS = new Set([
  'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'zoom', 'flip', 'rotate', 'bounce', 'swing'
]);

function isRegisteredGCCEAssetPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048
    || !value.startsWith('/uploads/animations/') || value.startsWith('//')
    || /[\\?#\s]/.test(value)) return false;
  try {
    const parsed = new URL(value, 'http://ltth.local');
    return parsed.origin === 'http://ltth.local'
      && parsed.pathname === value
      && isHttpAllowed({ method: 'GET', pathname: value });
  } catch (_) {
    return false;
  }
}

function projectGCCEColor(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > 64) return fallback;
  const isHex = /^#[0-9a-f]{3,8}$/i.test(value);
  const isRgb = /^rgba?\([\d\s.,%+-]+\)$/i.test(value);
  const isName = /^[a-z]{1,24}$/i.test(value);
  return isHex || isRgb || isName ? value : fallback;
}

function projectGCCEFontFamily(value, fallback) {
  return typeof value === 'string' && value.length > 0 && value.length <= 100
    && /^[\w\s,'-]+$/.test(value) ? value : fallback;
}

function projectGCCEHUDStyle(style, type) {
  if (!isRecord(style) || !GCCE_HUD_POSITIONS.has(style.position)) return null;
  const projected = { position: style.position };
  const numericBounds = type === 'text'
    ? { fontSize: [8, 256], maxWidth: [1, 1920] }
    : { maxWidth: [1, 1920], maxHeight: [1, 1920] };
  for (const [key, [min, max]] of Object.entries(numericBounds)) {
    const value = style[key];
    if (value !== undefined) {
      if (!Number.isFinite(value) || value < min || value > max) return null;
      projected[key] = value;
    }
  }
  if (type === 'text') {
    projected.fontFamily = projectGCCEFontFamily(style.fontFamily, 'Arial, sans-serif');
    projected.textColor = projectGCCEColor(style.textColor, '#FFFFFF');
    projected.backgroundColor = projectGCCEColor(style.backgroundColor, 'rgba(0, 0, 0, 0.7)');
  }
  return projected;
}

function isGCCEElementId(value, type) {
  return typeof value === 'string' && value.length <= 32
    && /^(?:text|image|media)-[1-9][0-9]{0,11}$/.test(value)
    && (!type || value.startsWith(`${type}-`));
}

function projectGCCEHUDShow(payload) {
  if (!isRecord(payload) || !['text', 'image', 'media'].includes(payload.type)
    || !isGCCEElementId(payload.id, payload.type)
    || !Number.isFinite(payload.duration) || payload.duration < 0 || payload.duration > 60000) return null;
  const style = projectGCCEHUDStyle(payload.style, payload.type);
  if (!style) return null;

  let content;
  if (payload.type === 'text') {
    content = boundedText(payload.content, 2000);
    if (content === null) return null;
  } else {
    if (!isRegisteredGCCEAssetPath(payload.content)) return null;
    content = payload.content;
  }
  const projected = { id: payload.id, type: payload.type, content, duration: payload.duration, style };
  if (payload.type === 'media') {
    if (!['gif', 'video'].includes(payload.mediaType)) return null;
    projected.mediaType = payload.mediaType;
  }
  return projected;
}

function projectGCCEHUDRemove(payload) {
  if (!isRecord(payload) || !isGCCEElementId(payload.id)) return null;
  return { id: payload.id };
}

function projectGCCEHUDClear(payload) {
  if (payload === undefined) return undefined;
  return isRecord(payload) ? {} : null;
}

function projectGCCERotator(payload) {
  if (!isRecord(payload) || typeof payload.enabled !== 'boolean'
    || !Number.isSafeInteger(payload.intervalSeconds) || payload.intervalSeconds < 3 || payload.intervalSeconds > 60
    || !Array.isArray(payload.entries) || payload.entries.length > 100) return null;
  const entries = [];
  for (const entry of payload.entries) {
    if (!isRecord(entry) || !['gift', 'media'].includes(entry.type)) return null;
    const projected = {
      type: entry.type,
      template: GCCE_ROTATOR_TEMPLATES.has(entry.template) ? entry.template : 'card',
      animation: GCCE_ROTATOR_ANIMATIONS.has(entry.animation) ? entry.animation : 'fade',
      fontFamily: projectGCCEFontFamily(entry.fontFamily, 'Inter, sans-serif'),
      textColor: projectGCCEColor(entry.textColor, '#ffffff'),
      accentColor: projectGCCEColor(entry.accentColor, '#ff5f9e'),
      backgroundColor: projectGCCEColor(entry.backgroundColor, 'rgba(0, 0, 0, 0.65)')
    };
    for (const [key, maxLength] of [['title', 120], ['info', 160], ['giftName', 200]]) {
      if (entry[key] !== undefined) {
        if (typeof entry[key] !== 'string' || entry[key].length > maxLength) return null;
        projected[key] = entry[key];
      }
    }
    if (entry.type === 'media') {
      if (!['image', 'video'].includes(entry.mediaKind)) return null;
      if (entry.mediaUrl !== undefined && typeof entry.mediaUrl !== 'string') return null;
      projected.mediaKind = entry.mediaKind;
      projected.mediaUrl = isRegisteredGCCEAssetPath(entry.mediaUrl) ? entry.mediaUrl : '';
    } else {
      if (entry.giftImage !== undefined && typeof entry.giftImage !== 'string') return null;
      projected.giftImage = isRegisteredGCCEAssetPath(entry.giftImage) ? entry.giftImage : '';
    }
    entries.push(projected);
  }
  return { enabled: payload.enabled, intervalSeconds: payload.intervalSeconds, entries };
}

function projectGCCERotatorResponse(payload) {
  if (!isRecord(payload) || payload.success !== true) return null;
  const rotator = projectGCCERotator(payload.rotator);
  return rotator ? { success: true, rotator } : null;
}

function projectAnimazingPalStreamAssistantStatusResponse(payload) {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.config)
    || typeof payload.config.enabled !== 'boolean' || typeof payload.config.muted !== 'boolean'
    || !isRecord(payload.runtime) || !isRecord(payload.runtime.diagnostics)
    || !isRecord(payload.analytics) || !Array.isArray(payload.events) || payload.events.length > 20) return null;

  const projectCount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const diagnostics = payload.runtime.diagnostics;
  const analytics = payload.analytics;
  const projectedDiagnostics = {};
  for (const key of ['processedEvents', 'respondedEvents', 'dedupedEvents']) {
    const value = projectCount(diagnostics[key]);
    if (value === null) return null;
    projectedDiagnostics[key] = value;
  }

  const projectedAnalytics = {};
  for (const key of ['processedEvents', 'respondedEvents', 'dedupedEvents']) {
    const value = projectCount(analytics[key]);
    if (value === null) return null;
    projectedAnalytics[key] = value;
  }

  const projectEvent = event => {
    if (!isRecord(event) || typeof event.eventType !== 'string' || event.eventType.length > 80
      || typeof event.reason !== 'string' || event.reason.length > 160) return null;
    return { eventType: event.eventType, reason: event.reason };
  };
  const events = payload.events.map(projectEvent);
  const lastEventResult = diagnostics.lastEventResult == null ? null : projectEvent(diagnostics.lastEventResult);
  if (events.some(event => event === null) || (diagnostics.lastEventResult != null && lastEventResult === null)) return null;

  const safeDiagnostics = { ...projectedDiagnostics };
  if (lastEventResult) safeDiagnostics.lastEventResult = lastEventResult;

  return {
    success: true,
    config: { enabled: payload.config.enabled, muted: payload.config.muted },
    runtime: { diagnostics: safeDiagnostics },
    analytics: projectedAnalytics,
    events
  };
}

function projectEmojiRainUserMappingsResponse(payload) {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.mappings)) return null;
  return { success: true, mappings: {} };
}

function projectEmojiRainUserMappingsUpdate(payload) {
  if (!isRecord(payload) || !isRecord(payload.mappings)) return null;
  return { mappings: {} };
}

function projectGameEngineCurrentState(payload) {
  if (!isRecord(payload) || typeof payload.hasActiveGame !== 'boolean') return null;
  if (!payload.hasActiveGame) return { hasActiveGame: false };
  if (typeof payload.useUnified !== 'boolean'
    || typeof payload.gameType !== 'string'
    || payload.gameType.length === 0
    || payload.gameType.length > 80) return null;
  return {
    hasActiveGame: true,
    gameType: payload.gameType,
    useUnified: payload.useUnified
  };
}

function projectGameEngineTimerUpdate(payload) {
  const timers = payload?.timers;
  const maxTimerMs = 365 * 24 * 60 * 60 * 1000;
  if (!isRecord(payload) || !isRecord(timers)
    || !Number.isFinite(timers.white) || timers.white < 0 || timers.white > maxTimerMs
    || !Number.isFinite(timers.black) || timers.black < 0 || timers.black > maxTimerMs) return null;
  // The chess overlay's timer-update consumer reads only these two display values.
  return { timers: { white: timers.white, black: timers.black } };
}

const GAME_ENGINE_CONNECT4_AUDIO_EVENTS = new Set([
  'new_challenger', 'challenge_accepted', 'piece_drop', 'player_1_wins',
  'player_2_wins', 'game_over', 'timer_warning'
]);

function projectGameEngineAudioStateUpdated(payload) {
  if (!isRecord(payload) || payload.gameType !== 'connect4'
    || !GAME_ENGINE_CONNECT4_AUDIO_EVENTS.has(payload.audioEvent)
    || typeof payload.enabled !== 'boolean') return null;
  // The only overlay consumer is Connect4; it reads these fields and ignores scopeId.
  return { gameType: 'connect4', audioEvent: payload.audioEvent, enabled: payload.enabled };
}

function projectGameEngineMediaUpdated(payload) {
  if (!isRecord(payload) || payload.gameType !== 'connect4'
    || !GAME_ENGINE_CONNECT4_AUDIO_EVENTS.has(payload.mediaEvent)) return null;
  // The Connect4 overlay uses gameType to select its media catalog; mediaEvent is producer metadata.
  return { gameType: 'connect4' };
}

const QUIZ_SHOW_JOKER_TYPES = new Set(['25', '50', 'info', 'time']);
const QUIZ_SHOW_THEME_PRESETS = new Set(['night', 'day', 'contrast', 'vision-impaired', 'neon', 'gold', 'minimal', 'retro', 'casino', 'highContrast']);
const QUIZ_SHOW_HUD_THEMES = new Set(['dark', 'neon', 'gold', 'vision-impaired', 'minimal', 'retro', 'casino', 'highContrast']);
const QUIZ_SHOW_LAYOUT_ELEMENTS = ['question', 'answers', 'timer', 'leaderboard', 'jokerInfo'];
const QUIZ_SHOW_LAYOUT_SIZES = new Set(['small', 'medium', 'large', 'xlarge']);

function projectQuizShowStateUpdate(payload) {
  if (!isRecord(payload) || typeof payload.isRunning !== 'boolean') return null;
  const projected = { isRunning: payload.isRunning };
  if (!payload.isRunning) {
    if (payload.currentQuestion !== null && payload.currentQuestion !== undefined
      && (!isRecord(payload.currentQuestion) || (payload.currentQuestion.question != null && typeof payload.currentQuestion.question !== 'string'))) return null;
    return projected;
  }
  const sourceQuestion = payload.currentQuestion;
  if (!isRecord(sourceQuestion) || typeof sourceQuestion.question !== 'string' || sourceQuestion.question.length > 2000
    || !Array.isArray(sourceQuestion.answers) || sourceQuestion.answers.length !== 4
    || sourceQuestion.answers.some(answer => typeof answer !== 'string' || answer.length > 500)) return null;
  projected.currentQuestion = { question: sourceQuestion.question, answers: sourceQuestion.answers.slice() };
  for (const key of ['info', 'category']) {
    if (sourceQuestion[key] === undefined || sourceQuestion[key] === null) continue;
    if (typeof sourceQuestion[key] !== 'string' || sourceQuestion[key].length > 1000) return null;
    projected.currentQuestion[key] = sourceQuestion[key];
  }
  for (const [key, min, max] of [['currentRound', 0, 100000], ['totalRounds', 0, 100000], ['timeRemaining', 0, 86400], ['totalTime', 1, 86400]]) {
    if (payload[key] === undefined) continue;
    if (!Number.isSafeInteger(payload[key]) || payload[key] < min || payload[key] > max) return null;
    projected[key] = payload[key];
  }
  if (payload.showRoundNumber !== undefined) {
    if (typeof payload.showRoundNumber !== 'boolean') return null;
    projected.showRoundNumber = payload.showRoundNumber;
  }
  if (payload.hiddenAnswers !== undefined) {
    if (!Array.isArray(payload.hiddenAnswers) || payload.hiddenAnswers.length > 4
      || payload.hiddenAnswers.some(index => !Number.isInteger(index) || index < 0 || index > 3)
      || new Set(payload.hiddenAnswers).size !== payload.hiddenAnswers.length) return null;
    projected.hiddenAnswers = payload.hiddenAnswers.slice();
  }
  if (payload.revealedWrongAnswer !== undefined) {
    if (payload.revealedWrongAnswer !== null && (!Number.isInteger(payload.revealedWrongAnswer) || payload.revealedWrongAnswer < 0 || payload.revealedWrongAnswer > 3)) return null;
    projected.revealedWrongAnswer = payload.revealedWrongAnswer;
  }
  if (payload.votersPerAnswer !== undefined) {
    if (!isRecord(payload.votersPerAnswer)) return null;
    projected.votersPerAnswer = {};
    for (let index = 0; index < 4; index++) {
      const voters = payload.votersPerAnswer[index] ?? [];
      if (!Array.isArray(voters) || voters.length > 100) return null;
      projected.votersPerAnswer[index] = [];
      for (const voter of voters) {
        if (!isRecord(voter) || typeof voter.username !== 'string' || voter.username.length > 120) return null;
        const safeVoter = { username: voter.username };
        if (voter.profilePictureUrl !== undefined) {
          safeVoter.profilePictureUrl = projectClarityUrl(voter.profilePictureUrl);
          if (voter.profilePictureUrl !== null && safeVoter.profilePictureUrl === null) return null;
        }
        projected.votersPerAnswer[index].push(safeVoter);
      }
    }
  }
  if (payload.voterIconsConfig !== undefined) {
    const source = payload.voterIconsConfig;
    if (!isRecord(source)) return null;
    const config = {};
    if (source.enabled !== undefined) {
      if (typeof source.enabled !== 'boolean') return null;
      config.enabled = source.enabled;
    }
    if (source.size !== undefined) {
      if (!['small', 'medium', 'large'].includes(source.size)) return null;
      config.size = source.size;
    }
    if (source.maxVisible !== undefined) {
      if (!Number.isInteger(source.maxVisible) || source.maxVisible < 1 || source.maxVisible > 100) return null;
      config.maxVisible = source.maxVisible;
    }
    for (const key of ['compactMode']) {
      if (source[key] === undefined) continue;
      if (typeof source[key] !== 'boolean') return null;
      config[key] = source[key];
    }
    if (source.animation !== undefined) {
      if (typeof source.animation !== 'string' || !/^[a-z-]{1,32}$/.test(source.animation)) return null;
      config.animation = source.animation;
    }
    if (source.position !== undefined) {
      if (!['above', 'beside', 'embedded'].includes(source.position)) return null;
      config.position = source.position;
    }
    if (source.performanceMode !== undefined) {
      if (!['full', 'balanced', 'minimal'].includes(source.performanceMode)) return null;
      config.performanceMode = source.performanceMode;
    }
    projected.voterIconsConfig = config;
  }
  if (payload.jokerEvents !== undefined) {
    if (!Array.isArray(payload.jokerEvents) || payload.jokerEvents.length > 20) return null;
    projected.jokerEvents = [];
    for (const event of payload.jokerEvents) {
      if (!isRecord(event) || !QUIZ_SHOW_JOKER_TYPES.has(event.type) || typeof event.isGiftActivated !== 'boolean') return null;
      const safeEvent = { type: event.type, isGiftActivated: event.isGiftActivated };
      if (event.giftIcon !== undefined && event.giftIcon !== null) {
        safeEvent.giftIcon = projectClarityUrl(event.giftIcon);
        if (safeEvent.giftIcon === null) return null;
      }
      projected.jokerEvents.push(safeEvent);
    }
  }
  if (payload.duel !== undefined) {
    if (payload.duel === null) projected.duel = null;
    else {
      const duel = payload.duel;
      if (!isRecord(duel) || typeof duel.active !== 'boolean' || !(duel.winner == null || ['left', 'right', 'tie'].includes(duel.winner))) return null;
      const safeDuel = { active: duel.active, winner: duel.winner ?? null };
      for (const side of ['left', 'right']) {
        const team = duel[side];
        if (!isRecord(team) || typeof team.label !== 'string' || team.label.length > 120
          || !Number.isSafeInteger(team.score) || team.score < 0
          || !Number.isSafeInteger(team.streak) || team.streak < 0) return null;
        safeDuel[side] = { label: team.label, score: team.score, streak: team.streak };
      }
      projected.duel = safeDuel;
    }
  }
  if (payload.themePreset !== undefined) {
    if (!QUIZ_SHOW_THEME_PRESETS.has(payload.themePreset)) return null;
    projected.themePreset = payload.themePreset;
  }
  for (const key of ['reducedMotion', 'highContrast', 'ultraKompaktModus']) {
    if (payload[key] === undefined) continue;
    if (typeof payload[key] !== 'boolean') return null;
    projected[key] = payload[key];
  }
  if (payload.ultraKompaktAnswerDelay !== undefined) {
    if (!Number.isFinite(payload.ultraKompaktAnswerDelay) || payload.ultraKompaktAnswerDelay < 0 || payload.ultraKompaktAnswerDelay > 60) return null;
    projected.ultraKompaktAnswerDelay = payload.ultraKompaktAnswerDelay;
  }
  return projected;
}

function projectQuizShowStateResponse(payload) {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.config)) return null;
  const config = {};
  if (payload.config.customLayoutEnabled !== undefined) {
    if (typeof payload.config.customLayoutEnabled !== 'boolean') return null;
    config.customLayoutEnabled = payload.config.customLayoutEnabled;
  }
  if (payload.config.customLayoutEnabled === true) {
    if (!Number.isSafeInteger(payload.config.activeLayoutId) || payload.config.activeLayoutId < 1) return null;
    config.activeLayoutId = payload.config.activeLayoutId;
  }
  return { success: true, config };
}

function projectQuizShowBrandKitResponse(payload) {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.brandKit)) return null;
  const brandKit = {};
  for (const key of ['primary_color', 'secondary_color']) {
    const value = payload.brandKit[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value !== 'string' || !/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value)) return null;
    brandKit[key] = value;
  }
  if (payload.brandKit.logo_path !== undefined && payload.brandKit.logo_path !== null && payload.brandKit.logo_path !== '') {
    const logo = payload.brandKit.logo_path;
    if (typeof logo !== 'string' || logo.length > 2048 || logo.startsWith('//') || logo.includes('\\')) return null;
    if (/^https?:\/\//i.test(logo)) {
      brandKit.logo_path = projectClarityUrl(logo);
      if (brandKit.logo_path === null) return null;
    } else if (logo.startsWith('/') && !logo.split('/').some(part => part === '.' || part === '..')) {
      brandKit.logo_path = logo;
    } else return null;
  }
  return { success: true, brandKit };
}

function projectQuizShowLayoutResponse(payload) {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.layout)) return null;
  const layout = payload.layout;
  if (typeof layout.name !== 'string' || layout.name.length > 120
    || !Number.isInteger(layout.resolution_width) || layout.resolution_width < 320 || layout.resolution_width > 7680
    || !Number.isInteger(layout.resolution_height) || layout.resolution_height < 240 || layout.resolution_height > 4320
    || !['horizontal', 'vertical'].includes(layout.orientation)) return null;
  let sourceConfig = layout.layout_config;
  if (typeof sourceConfig === 'string') {
    if (sourceConfig.length > 20000) return null;
    try { sourceConfig = JSON.parse(sourceConfig); } catch (_) { return null; }
  }
  if (!isRecord(sourceConfig)) return null;
  const layoutConfig = {};
  if (sourceConfig.mode !== undefined) {
    if (!['standard', 'splitscreen'].includes(sourceConfig.mode)) return null;
    layoutConfig.mode = sourceConfig.mode;
  }
  for (const element of QUIZ_SHOW_LAYOUT_ELEMENTS) {
    const source = sourceConfig[element];
    if (source === undefined) continue;
    if (!isRecord(source)) return null;
    const item = {};
    if (source.gridColumn !== undefined) {
      if (typeof source.gridColumn !== 'string' || !/^[A-T]$/i.test(source.gridColumn)
        || !Number.isInteger(source.gridRow) || source.gridRow < 1 || source.gridRow > 20
        || !QUIZ_SHOW_LAYOUT_SIZES.has(source.size)) return null;
      item.gridColumn = source.gridColumn.toUpperCase();
      item.gridRow = source.gridRow;
      item.size = source.size;
    } else {
      for (const key of ['x', 'y', 'width', 'height']) {
        if (source[key] === undefined) continue;
        if (!Number.isFinite(source[key]) || Math.abs(source[key]) > 10000) return null;
        item[key] = source[key];
      }
    }
    if (source.visible !== undefined) {
      if (typeof source.visible !== 'boolean') return null;
      item.visible = source.visible;
    }
    layoutConfig[element] = item;
  }
  return { success: true, layout: {
    name: layout.name,
    resolution_width: layout.resolution_width,
    resolution_height: layout.resolution_height,
    orientation: layout.orientation,
    layout_config: layoutConfig
  } };
}

function projectQuizShowHudConfigResponse(payload) {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.config)) return null;
  const source = payload.config;
  const config = {};
  if (source.theme !== undefined) {
    if (!QUIZ_SHOW_HUD_THEMES.has(source.theme)) return null;
    config.theme = source.theme;
  }
  if (source.themePreset !== undefined) {
    if (!QUIZ_SHOW_THEME_PRESETS.has(source.themePreset)) return null;
    config.themePreset = source.themePreset;
  }
  for (const key of ['reducedMotion', 'highContrast']) {
    if (source[key] === undefined) continue;
    if (typeof source[key] !== 'boolean') return null;
    config[key] = source[key];
  }
  for (const [key, allowed] of [
    ['questionAnimation', new Set(['slide-in-left', 'slide-in-right', 'slide-in-top', 'slide-in-bottom', 'fade-in', 'scale-in', 'bounce-in', 'elastic-in'])],
    ['correctAnimation', new Set(['glow-pulse', 'explode', 'burst'])],
    ['wrongAnimation', new Set(['shake', 'fade', 'none'])],
    ['timerVariant', new Set(['circular', 'bar', 'neon', 'ring'])],
    ['answersLayout', new Set(['grid', 'vertical', 'horizontal'])]
  ]) {
    if (source[key] === undefined) continue;
    if (typeof source[key] !== 'string' || !allowed.has(source[key])) return null;
    config[key] = source[key];
  }
  for (const [key, min, max] of [['animationSpeed', 0.1, 5], ['glowIntensity', 0, 3]]) {
    if (source[key] === undefined) continue;
    if (typeof source[key] !== 'number' || !Number.isFinite(source[key]) || source[key] < min || source[key] > max) return null;
    config[key] = source[key];
  }
  if (source.customCSS !== undefined) {
    if (typeof source.customCSS !== 'string' || source.customCSS.length > 10000) return null;
    if (!/@import|url\s*\(|expression\s*\(|javascript\s*:/i.test(source.customCSS)) config.customCSS = source.customCSS;
  }
  if (source.positions !== undefined) {
    if (!isRecord(source.positions)) return null;
    config.positions = {};
    for (const section of ['question', 'answers', 'timer']) {
      const position = source.positions[section];
      if (position === undefined) continue;
      if (!isRecord(position)) return null;
      const safePosition = {};
      for (const key of ['top', 'left']) {
        if (position[key] === undefined) continue;
        if (position[key] !== null && (!Number.isFinite(position[key]) || Math.abs(position[key]) > 10000)) return null;
        safePosition[key] = position[key];
      }
      for (const key of ['width', 'maxWidth']) {
        if (position[key] === undefined) continue;
        if (typeof position[key] !== 'string' || !/^(?:\d+(?:\.\d+)?(?:px|%|vw|vh|rem)|100%)$/.test(position[key])) return null;
        safePosition[key] = position[key];
      }
      config.positions[section] = safePosition;
    }
  }
  if (source.colors !== undefined) {
    if (!isRecord(source.colors)) return null;
    config.colors = {};
    for (const key of ['primary', 'secondary', 'success', 'danger', 'warning']) {
      if (source.colors[key] === undefined) continue;
      if (typeof source.colors[key] !== 'string' || !/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(source.colors[key])) return null;
      config.colors[key] = source.colors[key];
    }
  }
  if (source.fonts !== undefined) {
    if (!isRecord(source.fonts)) return null;
    config.fonts = {};
    for (const key of ['family', 'sizeQuestion', 'sizeAnswer']) {
      if (source.fonts[key] === undefined) continue;
      if (typeof source.fonts[key] !== 'string' || source.fonts[key].length > 160
        || /[<>;{}]|url\s*\(/i.test(source.fonts[key])) return null;
      config.fonts[key] = source.fonts[key];
    }
  }
  if (source.avatarPerformance !== undefined) {
    const avatar = source.avatarPerformance;
    if (!isRecord(avatar)) return null;
    const safeAvatar = {};
    if (avatar.mode !== undefined) {
      if (!['balanced', 'performance', 'quality', 'low', 'medium', 'high'].includes(avatar.mode)) return null;
      safeAvatar.mode = avatar.mode;
    }
    if (avatar.maxVisible !== undefined) {
      if (!Number.isInteger(avatar.maxVisible) || avatar.maxVisible < 1 || avatar.maxVisible > 100) return null;
      safeAvatar.maxVisible = avatar.maxVisible;
    }
    config.avatarPerformance = safeAvatar;
  }
  return { success: true, config };
}

function projectQuizShowLeaderboardResponse(payload) {
  if (!isRecord(payload) || payload.success !== true
    || !Array.isArray(payload.leaderboard) || payload.leaderboard.length > 100) return null;
  const leaderboard = [];
  for (const entry of payload.leaderboard) {
    if (!isRecord(entry) || typeof entry.username !== 'string' || entry.username.length > 120
      || !Number.isSafeInteger(entry.points) || entry.points < 0) return null;
    leaderboard.push({ username: entry.username, points: entry.points });
  }
  return { success: true, leaderboard };
}

function projectQuizShowLeaderboardUpdate(payload) {
  if (!Array.isArray(payload) || payload.length > 100) return null;
  return payload.map(entry => {
    if (!isRecord(entry) || typeof entry.username !== 'string' || entry.username.length > 120
      || !Number.isSafeInteger(entry.points) || entry.points < 0) return null;
    return { username: entry.username, points: entry.points };
  }).some(entry => entry === null) ? null : payload.map(entry => ({ username: entry.username, points: entry.points }));
}

function projectQuizShowLayoutUpdate(payload) {
  if (!isRecord(payload) || typeof payload.customLayoutEnabled !== 'boolean') return null;
  if (!payload.customLayoutEnabled) return { customLayoutEnabled: false, layout: null };
  const projected = projectQuizShowLayoutResponse({ success: true, layout: payload.layout });
  return projected ? { customLayoutEnabled: true, layout: projected.layout } : null;
}

function projectQuizShowDuel(payload) {
  if (!isRecord(payload) || typeof payload.active !== 'boolean'
    || !(payload.winner == null || ['left', 'right', 'tie'].includes(payload.winner))) return null;
  const result = { active: payload.active, winner: payload.winner ?? null };
  for (const side of ['left', 'right']) {
    const team = payload[side];
    if (!isRecord(team) || typeof team.label !== 'string' || team.label.length > 120
      || !Number.isSafeInteger(team.score) || team.score < 0
      || !Number.isSafeInteger(team.streak) || team.streak < 0) return null;
    result[side] = { label: team.label, score: team.score, streak: team.streak };
  }
  return result;
}

function projectQuizShowConfigUpdate(payload) {
  if (!isRecord(payload)) return null;
  const projected = {};
  for (const key of ['ultraKompaktModus', 'reducedMotion', 'highContrast']) {
    if (payload[key] === undefined) continue;
    if (typeof payload[key] !== 'boolean') return null;
    projected[key] = payload[key];
  }
  if (payload.ultraKompaktAnswerDelay !== undefined) {
    if (!Number.isFinite(payload.ultraKompaktAnswerDelay) || payload.ultraKompaktAnswerDelay < 0 || payload.ultraKompaktAnswerDelay > 60) return null;
    projected.ultraKompaktAnswerDelay = payload.ultraKompaktAnswerDelay;
  }
  if (payload.answerDisplayDuration !== undefined) {
    if (!Number.isFinite(payload.answerDisplayDuration) || payload.answerDisplayDuration < 0 || payload.answerDisplayDuration > 600) return null;
    projected.answerDisplayDuration = payload.answerDisplayDuration;
  }
  if (payload.hudThemePreset !== undefined) {
    if (!QUIZ_SHOW_THEME_PRESETS.has(payload.hudThemePreset)) return null;
    projected.themePreset = payload.hudThemePreset;
  }
  return projected;
}

function projectQuizShowCategoryVote(payload) {
  if (!isRecord(payload)) return null;
  const result = {};
  if (payload.options !== undefined) {
    if (!Array.isArray(payload.options) || payload.options.length > 50
      || payload.options.some(option => typeof option !== 'string' || option.length > 120)) return null;
    result.options = payload.options.slice();
  }
  if (payload.votesByCategory !== undefined) {
    if (!isRecord(payload.votesByCategory)) return null;
    result.votesByCategory = {};
    for (const [category, count] of Object.entries(payload.votesByCategory)) {
      if (category.length > 120 || !Number.isSafeInteger(count) || count < 0 || count > 1000000) return null;
      result.votesByCategory[category] = count;
    }
  }
  if (payload.endsAt !== undefined) {
    if (!Number.isSafeInteger(payload.endsAt) || payload.endsAt < 0) return null;
    result.endsAt = payload.endsAt;
  }
  if (payload.selectedCategory !== undefined) {
    if (payload.selectedCategory !== null && (typeof payload.selectedCategory !== 'string' || payload.selectedCategory.length > 120)) return null;
    result.selectedCategory = payload.selectedCategory;
  }
  return result;
}

function projectQuizShowRoundEnded(payload) {
  if (!isRecord(payload) || !Number.isInteger(payload.correctAnswer) || payload.correctAnswer < 0 || payload.correctAnswer > 3) return null;
  const result = { correctAnswer: payload.correctAnswer };
  for (const key of ['correctAnswerLetter', 'correctAnswerText', 'info']) {
    if (payload[key] === undefined || payload[key] === null) continue;
    if (typeof payload[key] !== 'string' || payload[key].length > 2000) return null;
    result[key] = payload[key];
  }
  if (payload.answerDisplayDuration !== undefined) {
    if (!Number.isFinite(payload.answerDisplayDuration) || payload.answerDisplayDuration < 6 || payload.answerDisplayDuration > 600) return null;
    result.answerDisplayDuration = payload.answerDisplayDuration;
  }
  if (payload.votersPerAnswer !== undefined) {
    const state = projectQuizShowStateUpdate({
      isRunning: true,
      currentQuestion: { question: '', answers: ['', '', '', ''] },
      votersPerAnswer: payload.votersPerAnswer,
      voterIconsConfig: payload.voterIconsConfig || {}
    });
    if (!state) return null;
    result.votersPerAnswer = state.votersPerAnswer;
    if (payload.voterIconsConfig !== undefined) result.voterIconsConfig = state.voterIconsConfig;
  }
  return result;
}

function projectQuizShowDisplayLeaderboard(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.leaderboard) || payload.leaderboard.length > 100
    || !['round', 'season', 'both'].includes(payload.displayType)
    || (payload.animationStyle !== undefined && !['fade', 'slide', 'zoom'].includes(payload.animationStyle))) return null;
  const leaderboard = [];
  for (const entry of payload.leaderboard) {
    if (!isRecord(entry) || typeof entry.username !== 'string' || entry.username.length > 120) return null;
    const score = entry.points ?? entry.round_points;
    if (!Number.isSafeInteger(score) || score < 0) return null;
    const projected = { username: entry.username, points: score };
    if (entry.round_points !== undefined) {
      if (!Number.isSafeInteger(entry.round_points) || entry.round_points < 0) return null;
      projected.round_points = entry.round_points;
    }
    leaderboard.push(projected);
  }
  return { leaderboard, displayType: payload.displayType, animationStyle: payload.animationStyle || 'fade' };
}

function projectQuizShowAchievement(payload) {
  if (!isRecord(payload) || typeof payload.username !== 'string' || payload.username.length > 120) return null;
  const label = payload.label ?? payload.id;
  if (typeof label !== 'string' || label.length > 160) return null;
  return { label, username: payload.username };
}

function projectQuizShowMvp(payload) {
  if (!isRecord(payload)) return null;
  const mvp = payload.mvp;
  if (mvp == null) return { mvp: null };
  if (!isRecord(mvp)) return null;
  const projected = {};
  for (const key of ['username', 'name']) {
    if (mvp[key] === undefined) continue;
    if (typeof mvp[key] !== 'string' || mvp[key].length > 120) return null;
    projected[key] = mvp[key];
  }
  if (!projected.username && !projected.name) return null;
  for (const key of ['points', 'totalPoints']) {
    if (mvp[key] === undefined) continue;
    if (!Number.isSafeInteger(mvp[key]) || mvp[key] < 0) return null;
    projected[key] = mvp[key];
  }
  return { mvp: projected };
}

function projectCoinBattleLeaderboardResponse(payload) {
  if (!isRecord(payload) || payload.success !== true || !Array.isArray(payload.data) || payload.data.length > 100) return null;
  const data = [];
  for (const row of payload.data) {
    if (!isRecord(row)) return null;
    const projected = {};
    for (const key of ['nickname', 'unique_id']) {
      if (row[key] === undefined || row[key] === null) continue;
      if (typeof row[key] !== 'string' || row[key].length > 120) return null;
      projected[key] = row[key];
    }
    if (row.profile_picture_url !== undefined) {
      projected.profile_picture_url = projectClarityUrl(row.profile_picture_url);
      if (row.profile_picture_url !== null && projected.profile_picture_url === null) return null;
    }
    const score = row.total_coins ?? row.coins;
    if (!Number.isSafeInteger(score) || score < 0) return null;
    projected.total_coins = score;
    data.push(projected);
  }
  return { success: true, data };
}

function projectCoinBattleMatchState(payload) {
  if (!isRecord(payload) || typeof payload.active !== 'boolean') return null;
  const projected = { active: payload.active };
  if (!payload.active) {
    if (payload.match !== null) return null;
    projected.match = null;
    projected.leaderboard = [];
    projected.teamScores = null;
    if (payload.teamNames !== undefined) {
      const teamNames = projectCoinBattleTeamNames(payload.teamNames);
      if (!teamNames) return null;
      projected.teamNames = teamNames;
    }
    return projected;
  }

  if (!isRecord(payload.match) || !['solo', 'team', '1v1'].includes(payload.match.mode)
    || !Number.isInteger(payload.match.duration) || payload.match.duration < 1 || payload.match.duration > 86400
    || !Number.isFinite(payload.match.elapsed) || payload.match.elapsed < 0 || payload.match.elapsed > 604800
    || !Number.isFinite(payload.match.remaining) || payload.match.remaining < 0 || payload.match.remaining > 86400
    || typeof payload.match.isPaused !== 'boolean') return null;
  projected.match = {
    mode: payload.match.mode,
    duration: payload.match.duration,
    elapsed: payload.match.elapsed,
    remaining: payload.match.remaining,
    isPaused: payload.match.isPaused
  };
  if (payload.match.status !== undefined) {
    if (!['active', 'paused'].includes(payload.match.status)) return null;
    projected.match.status = payload.match.status;
  }

  projected.leaderboard = projectCoinBattleMatchLeaderboard(payload.leaderboard);
  if (!projected.leaderboard) return null;

  if (payload.teamScores === null) {
    projected.teamScores = null;
  } else if (isRecord(payload.teamScores)
    && Number.isSafeInteger(payload.teamScores.red) && payload.teamScores.red >= 0
    && Number.isSafeInteger(payload.teamScores.blue) && payload.teamScores.blue >= 0) {
    projected.teamScores = { red: payload.teamScores.red, blue: payload.teamScores.blue };
  } else {
    return null;
  }

  if (!isRecord(payload.multiplier) || typeof payload.multiplier.active !== 'boolean'
    || typeof payload.multiplier.value !== 'number' || !Number.isFinite(payload.multiplier.value)
    || payload.multiplier.value < 1 || payload.multiplier.value > 100
    || typeof payload.multiplier.paused !== 'boolean') return null;
  projected.multiplier = {
    active: payload.multiplier.active,
    value: payload.multiplier.value,
    paused: payload.multiplier.paused
  };
  if (payload.multiplier.endTime !== undefined && payload.multiplier.endTime !== null) {
    if (!Number.isFinite(payload.multiplier.endTime)) return null;
    projected.multiplier.endTime = payload.multiplier.endTime;
  }
  if (payload.multiplier.remainingMs !== undefined && payload.multiplier.remainingMs !== null) {
    if (!Number.isFinite(payload.multiplier.remainingMs) || payload.multiplier.remainingMs < 0 || payload.multiplier.remainingMs > 86400000) return null;
    projected.multiplier.remainingMs = payload.multiplier.remainingMs;
  }

  if (payload.teamNames !== undefined) {
    const teamNames = projectCoinBattleTeamNames(payload.teamNames);
    if (!teamNames) return null;
    projected.teamNames = teamNames;
  }
  return projected;
}

function projectCoinBattleMatchLeaderboard(leaderboard) {
  if (!Array.isArray(leaderboard) || leaderboard.length > 10) return null;
  const projected = [];
  for (const player of leaderboard) {
    if (!isRecord(player) || typeof player.unique_id !== 'string' || player.unique_id.length < 1 || player.unique_id.length > 80
      || typeof player.nickname !== 'string' || player.nickname.length > 120
      || !Number.isSafeInteger(player.coins) || player.coins < 0) return null;
    const projectedPlayer = {
      // The overlay uses this only to compare positions between leaderboard snapshots.
      // Reuse the already-visible handle; never forward a DB/platform identifier.
      user_id: player.unique_id,
      unique_id: player.unique_id,
      nickname: player.nickname,
      coins: player.coins
    };
    if (player.profile_picture_url !== undefined) {
      projectedPlayer.profile_picture_url = projectClarityUrl(player.profile_picture_url);
      if (player.profile_picture_url !== null && projectedPlayer.profile_picture_url === null) return null;
    }
    if (player.team !== undefined && player.team !== null) {
      if (!['red', 'blue'].includes(player.team)) return null;
      projectedPlayer.team = player.team;
    }
    if (player.badges !== undefined && player.badges !== null) {
      let badges = player.badges;
      if (typeof badges === 'string') {
        if (badges.length > 2048) return null;
        try { badges = JSON.parse(badges); } catch (_) { return null; }
      }
      if (!Array.isArray(badges) || badges.length > 100 || badges.some(badge => typeof badge !== 'string' || badge.length > 80)) return null;
      projectedPlayer.badges = badges.slice(0, 12);
    }
    projected.push(projectedPlayer);
  }
  return projected;
}

function projectCoinBattleLeaderboardUpdate(payload) {
  if (!isRecord(payload) || !['solo', 'team', '1v1'].includes(payload.mode)) return null;
  const leaderboard = projectCoinBattleMatchLeaderboard(payload.leaderboard);
  if (!leaderboard) return null;
  return { leaderboard, mode: payload.mode };
}

function projectCoinBattleMultiplierActivated(payload) {
  if (!isRecord(payload)
    || typeof payload.multiplier !== 'number' || !Number.isFinite(payload.multiplier) || payload.multiplier < 1 || payload.multiplier > 10
    || !Number.isInteger(payload.duration) || payload.duration < 1 || payload.duration > 600) return null;
  const projected = { multiplier: payload.multiplier, duration: payload.duration };
  if (payload.endTime !== undefined) {
    if (!Number.isFinite(payload.endTime) || payload.endTime <= 0) return null;
    projected.endTime = payload.endTime;
  }
  return projected;
}

function projectCoinBattleMatchEnded(payload) {
  if (!isRecord(payload) || !['solo', 'team', '1v1'].includes(payload.mode) || !isRecord(payload.winner)) return null;
  if (payload.mode === 'team') {
    if (typeof payload.winner.is_draw !== 'boolean'
      || !(payload.winner.winner_team === null || ['red', 'blue'].includes(payload.winner.winner_team))
      || !isRecord(payload.teamScores)
      || !Number.isSafeInteger(payload.teamScores.red) || payload.teamScores.red < 0
      || !Number.isSafeInteger(payload.teamScores.blue) || payload.teamScores.blue < 0) return null;
    return {
      winner: {
        is_draw: payload.winner.is_draw,
        winner_team: payload.winner.winner_team
      },
      teamScores: { red: payload.teamScores.red, blue: payload.teamScores.blue }
    };
  }

  if (!Array.isArray(payload.leaderboard) || payload.leaderboard.length > 10) return null;
  const leaderboard = [];
  if (payload.leaderboard.length > 0) {
    const winner = payload.leaderboard[0];
    if (!isRecord(winner)
      || (winner.nickname !== undefined && (typeof winner.nickname !== 'string' || winner.nickname.length > 120))
      || (winner.unique_id !== undefined && (typeof winner.unique_id !== 'string' || winner.unique_id.length < 1 || winner.unique_id.length > 80))) return null;
    const coins = winner.coins ?? winner.points ?? 0;
    if (!Number.isSafeInteger(coins) || coins < 0) return null;
    const projectedWinner = { coins };
    if (winner.nickname !== undefined) projectedWinner.nickname = winner.nickname;
    if (winner.unique_id !== undefined) projectedWinner.unique_id = winner.unique_id;
    leaderboard.push(projectedWinner);
  }
  return { winner: {}, leaderboard };
}

function projectCoinBattleBadgesAwarded(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.badges) || payload.badges.length > 100) return null;
  const firstBadge = payload.badges[0];
  if (firstBadge === undefined) return { badges: [] };
  if (!isRecord(firstBadge) || typeof firstBadge.name !== 'string' || firstBadge.name.length > 120) return null;
  const badge = { name: firstBadge.name };
  if (firstBadge.icon !== undefined && firstBadge.icon !== null) {
    if (typeof firstBadge.icon !== 'string' || firstBadge.icon.length > 80) return null;
    badge.icon = firstBadge.icon;
  }
  return { badges: [badge] };
}

function projectCoinBattlePostMatch(payload) {
  if (!isRecord(payload) || !isRecord(payload.config)) return null;
  const sourceConfig = payload.config;
  const config = {};
  for (const key of ['showLeaderboard', 'showWinnerCredits', 'showXPAwards']) {
    if (sourceConfig[key] === undefined) continue;
    if (typeof sourceConfig[key] !== 'boolean') return null;
    config[key] = sourceConfig[key];
  }
  for (const key of ['leaderboardDuration', 'winnerCreditsDuration']) {
    if (sourceConfig[key] === undefined) continue;
    if (!Number.isInteger(sourceConfig[key]) || sourceConfig[key] < 0 || sourceConfig[key] > 600) return null;
    config[key] = sourceConfig[key];
  }
  if (sourceConfig.leaderboardTypes !== undefined) {
    const allowedTypes = new Set(['weekly', 'season', 'lifetime']);
    if (!Array.isArray(sourceConfig.leaderboardTypes) || sourceConfig.leaderboardTypes.length > allowedTypes.size
      || sourceConfig.leaderboardTypes.some(type => !allowedTypes.has(type))
      || new Set(sourceConfig.leaderboardTypes).size !== sourceConfig.leaderboardTypes.length) return null;
    config.leaderboardTypes = sourceConfig.leaderboardTypes.slice();
  }

  const projected = { config };
  if (payload.winnersWithXP !== undefined) {
    if (!Array.isArray(payload.winnersWithXP) || payload.winnersWithXP.length > 100) return null;
    projected.winnersWithXP = [];
    for (const winner of payload.winnersWithXP) {
      if (!isRecord(winner) || !Number.isInteger(winner.placement) || winner.placement < 1 || winner.placement > 100
        || !Number.isSafeInteger(winner.coins) || winner.coins < 0
        || !Number.isSafeInteger(winner.xp) || winner.xp < 0 || winner.xp > 10000) return null;
      const safeWinner = { placement: winner.placement, coins: winner.coins, xp: winner.xp };
      for (const key of ['nickname', 'uniqueId']) {
        if (winner[key] === undefined) continue;
        if (typeof winner[key] !== 'string' || winner[key].length > 120) return null;
        safeWinner[key] = winner[key];
      }
      if (winner.team !== undefined && winner.team !== null) {
        if (!['red', 'blue'].includes(winner.team)) return null;
        safeWinner.team = winner.team;
      }
      projected.winnersWithXP.push(safeWinner);
    }
  }

  if (payload.leaderboard !== undefined) {
    if (!Array.isArray(payload.leaderboard) || payload.leaderboard.length > 10) return null;
    projected.leaderboard = [];
    for (const player of payload.leaderboard) {
      if (!isRecord(player) || !Number.isSafeInteger(player.coins ?? player.total_coins) || (player.coins ?? player.total_coins) < 0) return null;
      const safePlayer = { coins: player.coins ?? player.total_coins };
      for (const key of ['nickname', 'unique_id']) {
        if (player[key] === undefined) continue;
        if (typeof player[key] !== 'string' || player[key].length > 120) return null;
        safePlayer[key] = player[key];
      }
      if (player.profile_picture_url !== undefined) {
        safePlayer.profile_picture_url = projectClarityUrl(player.profile_picture_url);
        if (player.profile_picture_url !== null && safePlayer.profile_picture_url === null) return null;
      }
      projected.leaderboard.push(safePlayer);
    }
  }
  return projected;
}

function projectCoinBattleTeamNamesUpdated(payload) {
  if (!isRecord(payload) || !['red', 'blue'].includes(payload.team)
    || typeof payload.name !== 'string' || payload.name.trim().length === 0 || payload.name.length > 50) return null;
  const projected = { team: payload.team, name: payload.name };
  if (payload.imageUrl !== undefined) {
    if (payload.imageUrl === null || payload.imageUrl === '') {
      projected.imageUrl = null;
    } else {
      projected.imageUrl = projectClarityUrl(payload.imageUrl);
      if (projected.imageUrl === null) return null;
    }
  }
  return projected;
}

function projectCoinBattleConfigUpdated(payload) {
  if (!isRecord(payload)) return null;
  const projected = {};
  const themes = new Set(['day', 'night', 'contrast', 'vision-impaired', 'cid', 'dark', 'light', 'neon', 'minimal']);
  const skins = new Set(['gold', 'futuristic', 'retro']);
  const layouts = new Set(['fullscreen', 'compact']);
  for (const [key, allowed] of [['theme', themes], ['skin', skins], ['layout', layouts]]) {
    if (payload[key] === undefined) continue;
    if (typeof payload[key] !== 'string' || !allowed.has(payload[key])) return null;
    projected[key] = payload[key];
  }
  for (const key of ['showAvatars', 'showBadges', 'showXPAwards', 'toasterMode']) {
    if (payload[key] === undefined) continue;
    if (typeof payload[key] !== 'boolean') return null;
    projected[key] = payload[key];
  }
  for (const [key, min, max] of [['overlayWidth', 320, 7680], ['overlayHeight', 240, 4320]]) {
    if (payload[key] === undefined) continue;
    if (!Number.isInteger(payload[key]) || payload[key] < min || payload[key] > max) return null;
    projected[key] = payload[key];
  }
  return projected;
}

function projectCoinBattleTimerUpdate(payload) {
  if (!isRecord(payload)
    || !Number.isSafeInteger(payload.elapsed) || payload.elapsed < 0 || payload.elapsed > 604800
    || !Number.isSafeInteger(payload.remaining) || payload.remaining < 0 || payload.remaining > 604800
    || !Number.isSafeInteger(payload.total) || payload.total < 1 || payload.total > 604800
    || payload.remaining > payload.total) return null;
  return { elapsed: payload.elapsed, remaining: payload.remaining, total: payload.total };
}

function projectCoinBattleTeamNames(teamNames) {
  if (!isRecord(teamNames)) return null;
  const projected = {};
  for (const team of ['red', 'blue']) {
    const value = teamNames[team];
    if (value == null) {
      projected[team] = null;
      continue;
    }
    if (!isRecord(value) || typeof value.name !== 'string' || value.name.length > 50) return null;
    const item = { name: value.name };
    if (value.imageUrl !== undefined) {
      item.imageUrl = projectClarityUrl(value.imageUrl);
      if (value.imageUrl !== null && item.imageUrl === null) return null;
    }
    projected[team] = item;
  }
  return projected;
}

function projectCoinBattleGiftReceived(payload) {
  return isRecord(payload) ? {} : null;
}

function projectMusicBotTrack(track, { allowNull = false, includePosition = false } = {}) {
  if (track === null && allowNull) return null;
  if (!isRecord(track)
    || typeof track.id !== 'string' || track.id.length === 0 || track.id.length > 160
    || typeof track.title !== 'string' || track.title.length === 0 || track.title.length > 300) return null;
  const projected = { id: track.id, title: track.title };
  for (const key of ['artist', 'requestedBy', 'state']) {
    if (track[key] === undefined) continue;
    if (typeof track[key] !== 'string' || track[key].length > 300) return null;
    projected[key] = track[key];
  }
  for (const key of ['thumbnail', 'requesterAvatar']) {
    if (track[key] === undefined) continue;
    if (track[key] === null) {
      projected[key] = null;
      continue;
    }
    projected[key] = projectClarityUrl(track[key]);
    if (projected[key] === null) return null;
  }
  if (track.duration !== undefined && track.duration !== null) {
    if (!Number.isFinite(track.duration) || track.duration < 0 || track.duration > 604800) return null;
    projected.duration = track.duration;
  } else if (track.duration === null) {
    projected.duration = null;
  }
  if (track.playbackId !== undefined && track.playbackId !== null) {
    if (typeof track.playbackId !== 'string' || track.playbackId.length === 0 || track.playbackId.length > 160) return null;
    projected.playbackId = track.playbackId;
  } else if (track.playbackId === null) {
    projected.playbackId = null;
  }
  if (track.startedAt !== undefined && track.startedAt !== null) {
    if (!Number.isSafeInteger(track.startedAt) || track.startedAt < 0) return null;
    projected.startedAt = track.startedAt;
  } else if (track.startedAt === null) {
    projected.startedAt = null;
  }
  if (includePosition && track.position !== undefined) {
    if (!Number.isFinite(track.position) || track.position < 0 || track.position > 604800) return null;
    projected.position = track.position;
  }
  if (track.seekable !== undefined) {
    if (typeof track.seekable !== 'boolean') return null;
    projected.seekable = track.seekable;
  }
  return projected;
}

function projectMusicBotQueue(payload) {
  if (!isRecord(payload) || !Number.isSafeInteger(payload.length) || payload.length < 0 || payload.length > 10000) return null;
  const projected = { length: payload.length };
  if (payload.queue !== undefined) {
    if (!Array.isArray(payload.queue) || payload.queue.length > 10000) return null;
    const queue = [];
    for (const track of payload.queue.slice(0, 3)) {
      if (!isRecord(track) || typeof track.title !== 'string' || track.title.length === 0 || track.title.length > 300) return null;
      const item = { title: track.title };
      if (track.artist !== undefined) {
        if (typeof track.artist !== 'string' || track.artist.length > 300) return null;
        item.artist = track.artist;
      }
      queue.push(item);
    }
    projected.queue = queue;
  }
  return projected;
}

function projectMusicBotVote(payload) {
  if (!isRecord(payload)) return null;
  const projected = {};
  if (payload.enabled !== undefined) {
    if (typeof payload.enabled !== 'boolean') return null;
    projected.enabled = payload.enabled;
  }
  if (payload.status !== undefined) {
    if (!['idle', 'open', 'closed', 'cancelled'].includes(payload.status)) return null;
    projected.status = payload.status;
  }
  if (payload.candidates !== undefined) {
    if (!Array.isArray(payload.candidates) || payload.candidates.length > 2) return null;
    projected.candidates = [];
    for (const candidate of payload.candidates) {
      if (!isRecord(candidate) || typeof candidate.title !== 'string' || candidate.title.length === 0 || candidate.title.length > 300) return null;
      const item = { title: candidate.title };
      if (candidate.artist !== undefined) {
        if (typeof candidate.artist !== 'string' || candidate.artist.length > 300) return null;
        item.artist = candidate.artist;
      }
      projected.candidates.push(item);
    }
  }
  if (payload.votes !== undefined) {
    if (!isRecord(payload.votes)) return null;
    projected.votes = {};
    for (const key of ['1', '2']) {
      const value = payload.votes[key];
      if (value === undefined) continue;
      if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) return null;
      projected.votes[key] = value;
    }
  }
  return projected;
}

function projectMusicBotVoteSkip(payload) {
  if (!isRecord(payload)
    || !Number.isSafeInteger(payload.votes) || payload.votes < 0 || payload.votes > 1000000
    || !Number.isSafeInteger(payload.required) || payload.required < 1 || payload.required > 1000000
    || typeof payload.skipped !== 'boolean') return null;
  return { votes: payload.votes, required: payload.required, skipped: payload.skipped };
}

function projectSoundboardPlay(payload) {
  if (!isRecord(payload) || typeof payload.url !== 'string' || payload.url.length === 0 || payload.url.length > 2048
    || typeof payload.volume !== 'number' || !Number.isFinite(payload.volume) || payload.volume < 0 || payload.volume > 1
    || typeof payload.label !== 'string' || payload.label.length > 160
    || !['gift', 'follow', 'subscribe', 'share', 'like', 'test', 'preview', 'animation', 'unknown'].includes(payload.eventType)
    || !['dashboard', 'obs_overlay', 'both'].includes(payload.audioTarget)) return null;
  const isLocalSound = /^\/sounds\/[A-Za-z0-9._ -]+\.(?:m4a|mp3|ogg|wav|webm)$/i.test(payload.url);
  if (!isLocalSound) {
    let parsed;
    try { parsed = new URL(payload.url); } catch (_) { return null; }
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return null;
    if ([...parsed.searchParams.keys()].some(key => /(?:token|api[-_]?key|sig(?:nature)?|auth|credential|password|secret)/i.test(key))) return null;
  }
  const projected = {
    url: payload.url,
    volume: payload.volume,
    label: payload.label,
    eventType: payload.eventType,
    audioTarget: payload.audioTarget
  };
  if (payload.eventType === 'gift' && payload.repeatCount !== undefined) {
    if (!Number.isInteger(payload.repeatCount) || payload.repeatCount < 1 || payload.repeatCount > 50) return null;
    projected.repeatCount = payload.repeatCount;
  }
  return projected;
}

function projectCoinJarConfig(config) {
  if (!isRecord(config)) return null;
  const projected = {};
  const booleanKeys = ['enabled', 'showCounter', 'showGiftPopup', 'showSenderName', 'showGiftImage', 'soundEnabled'];
  for (const key of booleanKeys) {
    if (config[key] === undefined) continue;
    if (typeof config[key] !== 'boolean') return null;
    projected[key] = config[key];
  }

  if (config.jarStyle !== undefined) {
    if (!['classic', 'mason', 'arcade'].includes(config.jarStyle)) return null;
    projected.jarStyle = config.jarStyle;
  }

  const numericRanges = {
    jarWidth: [160, 1600, true],
    jarHeight: [140, 1400, true],
    jarX: [0, 100, false],
    jarY: [0, 100, false],
    iconScale: [0.25, 3, false],
    maxPhysicalIcons: [20, 3000, true],
    spawnMultiplier: [0.1, 5, false],
    spawnDelayMs: [20, 1000, true],
    soundVolume: [0, 1, false],
    jarOpacity: [0, 1, false],
    counterFontSize: [12, 160, true]
  };
  for (const key of [...Object.keys(numericRanges), ...COIN_JAR_GIFT_SIZE_KEYS]) {
    if (config[key] === undefined) continue;
    const [minimum, maximum, integer] = numericRanges[key] || [16, 240, true];
    const value = config[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) return null;
    projected[key] = value;
  }

  for (const [key, maximum] of [['counterLabel', 120], ['jarLabel', 120], ['counterFontFamily', 160]]) {
    if (config[key] === undefined) continue;
    if (typeof config[key] !== 'string' || config[key].length > maximum) return null;
    projected[key] = config[key];
  }
  for (const key of ['jarBorderColor', 'counterColor']) {
    if (config[key] === undefined) continue;
    if (typeof config[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(config[key])) return null;
    projected[key] = config[key];
  }
  return projected;
}

function isValidCoinJarGeneration(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isValidCoinJarGiftImage(value) {
  return value === null || (typeof value === 'string' && value.length <= 2048);
}

function projectCoinJarAdd(payload) {
  if (!isRecord(payload) || !isValidCoinJarGeneration(payload.generation)
    || !Number.isFinite(payload.totalValue) || payload.totalValue <= 0
    || !Number.isInteger(payload.visualCoins) || payload.visualCoins < 1 || payload.visualCoins > 100
    || !Number.isFinite(payload.totalCoinValue) || payload.totalCoinValue < 0
    || typeof payload.giftName !== 'string' || payload.giftName.length > 160
    || (payload.giftImage !== undefined && !isValidCoinJarGiftImage(payload.giftImage))) return null;
  const projected = {
    generation: payload.generation,
    totalValue: payload.totalValue,
    visualCoins: payload.visualCoins,
    totalCoinValue: payload.totalCoinValue,
    giftName: payload.giftName,
    senderName: 'Viewer'
  };
  if (payload.giftImage !== undefined) projected.giftImage = payload.giftImage;
  return projected;
}

function projectCoinJarSync(payload) {
  if (!isRecord(payload) || !isValidCoinJarGeneration(payload.generation)
    || !Number.isFinite(payload.totalCoinValue) || payload.totalCoinValue < 0
    || !Number.isInteger(payload.visualCoinCount) || payload.visualCoinCount < 0
    || !Array.isArray(payload.recentGifts) || payload.recentGifts.length > 24) return null;
  const config = projectCoinJarConfig(payload.config);
  if (!config) return null;
  const recentGifts = [];
  for (const gift of payload.recentGifts) {
    if (!isRecord(gift) || typeof gift.giftName !== 'string' || gift.giftName.length > 160
      || (gift.giftImage !== undefined && !isValidCoinJarGiftImage(gift.giftImage))) return null;
    const projectedGift = { giftName: gift.giftName };
    if (gift.giftImage !== undefined) projectedGift.giftImage = gift.giftImage;
    recentGifts.push(projectedGift);
  }
  return {
    generation: payload.generation,
    totalCoinValue: payload.totalCoinValue,
    visualCoinCount: payload.visualCoinCount,
    recentGifts,
    config
  };
}

function normalizeGoalId(id) {
  if (typeof id === 'string' && id.trim()) return `string:${id}`;
  if (typeof id === 'number' && Number.isFinite(id)) return `number:${id}`;
  return null;
}

function registerPublicZappieHellGoal(goal) {
  if (!isRecord(goal)) return null;
  const key = normalizeGoalId(goal.id);
  if (!key) return null;

  const previous = activeGoalTokens.get(key);
  if (previous && previous.goal !== goal) {
    retiredGoals.add(previous.goal);
  }

  const token = randomUUID();
  activeGoalTokens.set(key, { goal, token });
  goalTokensByObject.set(goal, token);
  return token;
}

function forgetPublicZappieHellGoal(internalGoalId, goal = null) {
  const key = normalizeGoalId(internalGoalId);
  if (!key) return false;

  const active = activeGoalTokens.get(key);
  const target = goal || active?.goal;
  if (target && typeof target === 'object') retiredGoals.add(target);
  if (active && (!goal || active.goal === goal)) {
    activeGoalTokens.delete(key);
    return true;
  }
  return false;
}

function getGoalDisplayToken(goal) {
  const key = normalizeGoalId(goal.id);
  if (!key || retiredGoals.has(goal)) return null;

  const active = activeGoalTokens.get(key);
  if (active && active.goal !== goal) return null;

  const existingToken = goalTokensByObject.get(goal);
  if (existingToken) return existingToken;

  const token = randomUUID();
  activeGoalTokens.set(key, { goal, token });
  goalTokensByObject.set(goal, token);
  return token;
}

function projectGoal(goal) {
  if (!isRecord(goal)) return null;
  if (!normalizeGoalId(goal.id)) return null;
  if (typeof goal.name !== 'string') return null;
  if (!Number.isFinite(goal.targetCoins) || !Number.isFinite(goal.currentCoins)) return null;
  if (goal.type !== 'stream' && goal.type !== 'global') return null;
  if (typeof goal.active !== 'boolean') return null;
  const displayToken = getGoalDisplayToken(goal);
  if (!displayToken) return null;

  return {
    displayToken,
    name: goal.name,
    targetCoins: goal.targetCoins,
    currentCoins: goal.currentCoins,
    type: goal.type,
    active: goal.active
  };
}

function projectGoals(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.goals)) return null;
  const goals = [];
  for (const goal of payload.goals) {
    const projected = projectGoal(goal);
    if (!projected) return null;
    goals.push(projected);
  }
  return { goals };
}

function projectCompletedGoal(payload) {
  if (!isRecord(payload) || !isRecord(payload.goal)) return null;
  const goal = payload.goal;
  const key = normalizeGoalId(goal.id);
  if (!key || retiredGoals.has(goal)) return null;
  const active = activeGoalTokens.get(key);
  if (!active || active.goal !== goal) return null;
  const displayToken = goalTokensByObject.get(goal);
  if (!displayToken) return null;
  return { goal: { displayToken } };
}

function projectAudio(payload) {
  if (!isRecord(payload) || typeof payload.text !== 'string' || !payload.text.trim()) return null;
  const projected = { text: payload.text };
  if (typeof payload.voice === 'string' && payload.voice.trim()) {
    projected.voice = payload.voice;
  }
  return projected;
}

function projectWeatherOptions(options, { allowPermanent = false } = {}) {
  if (!isRecord(options)) return null;
  const projected = {};
  for (const [key, [min, max]] of Object.entries(WEATHER_OPTION_BOUNDS)) {
    if (options[key] === undefined) continue;
    if (typeof options[key] !== 'number' || !Number.isFinite(options[key]) || options[key] < min || options[key] > max) return null;
    projected[key] = options[key];
  }
  for (const key of WEATHER_BOOLEAN_OPTIONS) {
    if (options[key] === undefined) continue;
    if (typeof options[key] !== 'boolean') return null;
    projected[key] = options[key];
  }
  if (options.fogColor !== undefined) {
    if (!['default', 'green', 'red', 'blue', 'golden', 'ice'].includes(options.fogColor)) return null;
    projected.fogColor = options.fogColor;
  }
  if (options.colorTemperature !== undefined) {
    if (!['golden', 'midday', 'sunset', 'cool'].includes(options.colorTemperature)) return null;
    projected.colorTemperature = options.colorTemperature;
  }
  if (allowPermanent && options.permanent !== undefined) {
    if (typeof options.permanent !== 'boolean') return null;
    projected.permanent = options.permanent;
  }
  return projected;
}

function projectWeatherTrigger(payload) {
  if (!isRecord(payload) || !WEATHER_ACTIONS.has(payload.action)) return null;
  if (typeof payload.intensity !== 'number' || !Number.isFinite(payload.intensity) || payload.intensity < 0 || payload.intensity > 1) return null;
  if (typeof payload.duration !== 'number' || !Number.isInteger(payload.duration) || payload.duration < 0 || payload.duration > 60000) return null;
  if (typeof payload.permanent !== 'boolean') return null;
  if (!payload.permanent && payload.duration < 1000) return null;
  if (!isRecord(payload.options)) return null;
  const options = projectWeatherOptions(payload.options, { allowPermanent: true });
  if (!options) return null;
  return {
    action: payload.action,
    intensity: payload.intensity,
    duration: payload.duration,
    permanent: payload.permanent,
    options
  };
}

function projectWeatherGamification(payload) {
  if (!isRecord(payload)) return null;
  const source = isRecord(payload.gamification) ? payload.gamification : payload;
  if (!isRecord(source)) return null;
  const snapshot = {};
  if (source.enabled !== undefined) {
    if (typeof source.enabled !== 'boolean') return null;
    snapshot.enabled = source.enabled;
  }
  if (source.communityMeter !== undefined) {
    const meter = source.communityMeter;
    if (!isRecord(meter) || !Number.isFinite(meter.current) || !Number.isFinite(meter.max) || meter.current < 0 || meter.max < 0) return null;
    snapshot.communityMeter = { current: meter.current, max: meter.max };
    if (meter.enabled !== undefined) {
      if (typeof meter.enabled !== 'boolean') return null;
      snapshot.communityMeter.enabled = meter.enabled;
    }
  }
  if (source.streaks !== undefined) {
    const streaks = source.streaks;
    if (!isRecord(streaks) || !Number.isInteger(streaks.current) || streaks.current < 0) return null;
    snapshot.streaks = { current: streaks.current };
    if (streaks.enabled !== undefined) {
      if (typeof streaks.enabled !== 'boolean') return null;
      snapshot.streaks.enabled = streaks.enabled;
    }
  }
  if (source.quest !== undefined) {
    if (source.quest === null) {
      snapshot.quest = null;
    } else {
      const quest = source.quest;
      if (!isRecord(quest) || typeof quest.title !== 'string' || !Number.isFinite(quest.progress) || !Number.isFinite(quest.target) || quest.progress < 0 || quest.target < 0) return null;
      snapshot.quest = { title: quest.title.slice(0, 80), progress: quest.progress, target: quest.target };
    }
  }
  if (source.rewards !== undefined) {
    const rewards = source.rewards;
    if (!isRecord(rewards)) return null;
    if (rewards.nextThreshold === null) snapshot.rewards = { nextThreshold: null };
    else if (rewards.nextThreshold !== undefined) {
      const threshold = rewards.nextThreshold;
      if (!isRecord(threshold) || typeof threshold.label !== 'string' || !Number.isFinite(threshold.meter) || threshold.meter < 0) return null;
      snapshot.rewards = { nextThreshold: { label: threshold.label.slice(0, 80), meter: threshold.meter } };
    }
  }
  if (source.overlay !== undefined) {
    if (!isRecord(source.overlay)) return null;
    const overlay = {};
    for (const key of ['enabled', 'showMeter', 'showQuest', 'showStreak', 'showRewardFeed']) {
      if (source.overlay[key] === undefined) continue;
      if (typeof source.overlay[key] !== 'boolean') return null;
      overlay[key] = source.overlay[key];
    }
    snapshot.overlay = overlay;
  }
  return snapshot;
}

function projectWebgpuWeatherGamification(payload) {
  if (!isRecord(payload)) return null;
  const source = isRecord(payload.gamification) ? payload.gamification : payload;
  if (!isRecord(source.overlay) || !isRecord(source.communityMeter) || !isRecord(source.streaks)) return null;
  const overlay = {};
  for (const key of ['enabled', 'showMeter', 'showQuest', 'showStreak', 'showRewardFeed']) {
    if (typeof source.overlay[key] !== 'boolean') return null;
    overlay[key] = source.overlay[key];
  }
  const meter = source.communityMeter;
  if (typeof meter.current !== 'number' || !Number.isFinite(meter.current) || meter.current < 0
    || typeof meter.max !== 'number' || !Number.isFinite(meter.max) || meter.max < 1) return null;
  const streaks = source.streaks;
  if (!Number.isInteger(streaks.current) || streaks.current < 0) return null;

  let activeQuest = null;
  if (source.quest !== null && source.quest !== undefined) {
    const quest = isRecord(source.quest.active) ? source.quest.active : source.quest;
    if (!isRecord(quest) || typeof quest.title !== 'string' || quest.title.length > 80) return null;
    activeQuest = { title: quest.title };
  }

  const rewardHistory = source.rewards?.history;
  if (source.rewards !== undefined && (!isRecord(source.rewards) || !Array.isArray(rewardHistory))) return null;
  const latestReward = Array.isArray(rewardHistory) ? rewardHistory[0] : null;
  if (latestReward && (!isRecord(latestReward) || (latestReward.label !== undefined
    && (typeof latestReward.label !== 'string' || latestReward.label.length > 80)))) return null;
  return {
    overlay,
    communityMeter: {
      enabled: meter.enabled !== false,
      current: meter.current,
      max: meter.max
    },
    quest: { active: activeQuest },
    streaks: { enabled: streaks.enabled !== false, current: streaks.current },
    rewards: {
      history: latestReward?.label ? [{ label: latestReward.label }] : []
    }
  };
}

function projectWeatherConfigResponse(payload) {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.config)) return null;
  const config = payload.config;
  if (typeof config.enabled !== 'boolean' || !['low', 'medium', 'high', 'ultra'].includes(config.qualityPreset) || typeof config.adaptiveQuality !== 'boolean' || !Number.isInteger(config.maxConcurrentEffects) || config.maxConcurrentEffects < 1 || config.maxConcurrentEffects > 12 || !isRecord(config.effects)) return null;
  const effects = {};
  for (const [action, effect] of Object.entries(config.effects)) {
    if (!WEATHER_ACTIONS.has(action)) continue;
    if (!isRecord(effect) || typeof effect.defaultIntensity !== 'number' || !Number.isFinite(effect.defaultIntensity) || effect.defaultIntensity < 0 || effect.defaultIntensity > 1 || !Number.isInteger(effect.defaultDuration) || effect.defaultDuration < 0 || effect.defaultDuration > 60000 || typeof effect.enabled !== 'boolean') return null;
    const options = projectWeatherOptions(effect);
    if (!options) return null;
    effects[action] = { enabled: effect.enabled, defaultIntensity: effect.defaultIntensity, defaultDuration: effect.defaultDuration, ...options };
  }
  const gamification = config.gamification;
  if (!isRecord(gamification) || typeof gamification.enabled !== 'boolean' || !isRecord(gamification.overlay)) return null;
  const overlay = {};
  for (const key of ['enabled', 'showMeter', 'showQuest', 'showStreak', 'showRewardFeed']) {
    if (typeof gamification.overlay[key] !== 'boolean') return null;
    overlay[key] = gamification.overlay[key];
  }
  const gamificationSnapshot = projectWeatherGamification({
    enabled: true,
    communityMeter: { current: 0, max: 1 },
    streaks: { current: 0 },
    quest: null,
    rewards: { nextThreshold: null },
    overlay
  });
  const publicConfig = {
    enabled: config.enabled,
    qualityPreset: config.qualityPreset,
    adaptiveQuality: config.adaptiveQuality,
    maxConcurrentEffects: config.maxConcurrentEffects,
    effects,
    gamification: { enabled: gamification.enabled, overlay: gamificationSnapshot.overlay }
  };
  if (config.audio !== undefined) {
    const audio = config.audio;
    if (!isRecord(audio) || typeof audio.enabled !== 'boolean' || typeof audio.volume !== 'number' || !Number.isFinite(audio.volume) || audio.volume < 0 || audio.volume > 1 || !isRecord(audio.effects)) return null;
    const audioEffects = {};
    for (const action of WEATHER_ACTIONS) {
      const item = audio.effects[action];
      if (item === undefined) continue;
      if (!isRecord(item) || typeof item.enabled !== 'boolean' || typeof item.volume !== 'number' || !Number.isFinite(item.volume) || item.volume < 0 || item.volume > 1) return null;
      audioEffects[action] = { enabled: item.enabled, volume: item.volume };
    }
    publicConfig.audio = { enabled: audio.enabled, volume: audio.volume, effects: audioEffects };
  }
  return { success: true, config: publicConfig };
}

function projectWeatherGamificationResponse(payload) {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.gamification)) return null;
  const gamification = projectWeatherGamification(payload.gamification);
  return gamification ? { success: true, gamification } : null;
}

/**
 * Return undefined for events without a public projection, null for malformed
 * payloads that must be withheld publicly, or the projected public payload.
 */
function projectPublicOverlayPayload(eventName, payload) {
  switch (eventName) {
    case 'emoji-rain:user-mappings-update':
      return projectEmojiRainUserMappingsUpdate(payload);
    case 'game-engine:current-state':
      return projectGameEngineCurrentState(payload);
    case 'arena:state':
      return projectArenaPublicState(payload);
    case 'game-engine:config-updated': {
      if (!isRecord(payload)) return null;
      if (payload.gameType === 'arena') {
        const config = projectArenaConfig(payload.config);
        return config ? { gameType: 'arena', config } : null;
      }
      if (payload.gameType !== 'chess' && payload.gameType !== 'connect4') return null;
      const config = projectGameEnginePublicConfig(payload.gameType, payload.config);
      return config ? { gameType: payload.gameType, config } : null;
    }
    case 'game-engine:timer-update':
      return projectGameEngineTimerUpdate(payload);
    case 'game-engine:audio-state-updated':
      return projectGameEngineAudioStateUpdated(payload);
    case 'game-engine:media-updated':
      return projectGameEngineMediaUpdated(payload);
    case 'clarityhud.settings.chat':
    case 'clarityhud.settings.full':
    case 'clarityhud.settings.multi':
    case 'clarityhud.settings.stream': {
      const dock = eventName.slice('clarityhud.settings.'.length);
      return projectClaritySettings(dock, payload);
    }
    case 'clarityhud.update.chat':
    case 'clarityhud.update.follow':
    case 'clarityhud.update.gift':
    case 'clarityhud.update.join':
    case 'clarityhud.update.like':
    case 'clarityhud.update.share':
    case 'clarityhud.update.subscribe':
    case 'clarityhud.update.treasure': {
      const eventType = eventName.slice('clarityhud.update.'.length);
      return projectClarityEvent(eventType, payload);
    }
    case 'clarityhud:multi:chat':
      return projectClarityMultiEvent('chat', payload);
    case 'clarityhud:multi:gift':
      return projectClarityMultiEvent('gift', payload);
    case 'zappiehell:goals:state':
    case 'zappiehell:goals:update':
      return projectGoals(payload);
    case 'zappiehell:goals:completed':
      return projectCompletedGoal(payload);
    case 'zappiehell:audio:play':
      return projectAudio(payload);
    case 'weather:trigger':
      return projectWeatherTrigger(payload);
    case 'weather:stop-effect':
      return isRecord(payload) && WEATHER_ACTIONS.has(payload.action) ? { action: payload.action } : null;
    case 'weather:stop':
    case 'weather:config-changed':
      return isRecord(payload) ? {} : null;
    case 'weather:gamification-state':
      return projectWeatherGamification(payload);
    case 'webgpu-weather:trigger':
      return projectWeatherTrigger(payload);
    case 'webgpu-weather:gamification-state':
      return projectWebgpuWeatherGamification(payload);
    case 'webgpu-weather:config-changed':
    case 'webgpu-weather:stop':
      return isRecord(payload) ? {} : null;
    case 'webgpu-weather:stop-effect':
      return isRecord(payload) && WEATHER_ACTIONS.has(payload.action)
        ? { action: payload.action }
        : null;
    case 'toptier:update':
      return projectTopTierUpdate(payload);
    case 'toptier:rank-change':
      return projectTopTierRankChange(payload);
    case 'toptier:new-leader':
      return projectTopTierNewLeader(payload);
    case 'toptier:decay':
      return projectTopTierDecay(payload);
    // These config events contain backend-only settings or full user mapping
    // tables. Preserve local packets, but withhold public packets until their
    // minimal display DTOs have been reviewed and approved.
    case 'talkingheads:config:update':
    case 'webgpu-emoji-rain:config-update':
    case 'webgpu-emoji-rain:user-mappings-update':
    case 'plinko:config':
    case 'plinko:config-updated':
      return null;
    // Goals currently carry raw database IDs and renderer configuration that
    // have no approved public DTO. Keep the local broadcast, but fail closed
    // for Quick Tunnel clients until a separately reviewed display contract is
    // approved. Do not fall through to the adapter's raw-payload path.
    case 'goals:config-changed':
    case 'goals:deleted':
    case 'goals:reach-complete':
    case 'goals:reached':
    case 'goals:reset':
    case 'goals:subscribed':
    case 'goals:value-changed':
    case 'multigoals:config-changed':
    case 'multigoals:deleted':
    case 'multigoals:subscribed':
      return null;
    case 'gcce:hud:show':
      return projectGCCEHUDShow(payload);
    case 'gcce:hud:remove':
      return projectGCCEHUDRemove(payload);
    case 'gcce:hud:clear':
      return projectGCCEHUDClear(payload);
    case 'gcce:hud:rotator:update':
      return projectGCCERotator(payload);
    case 'quiz-show:state-update':
      return projectQuizShowStateUpdate(payload);
    case 'quiz-show:config-updated':
      return projectQuizShowConfigUpdate(payload);
    case 'quiz-show:hud-config-updated': {
      const result = projectQuizShowHudConfigResponse({ success: true, config: payload });
      return result ? result.config : null;
    }
    case 'quiz-show:brand-kit-updated': {
      const result = projectQuizShowBrandKitResponse({ success: true, brandKit: payload });
      return result ? result.brandKit : null;
    }
    case 'quiz-show:layout-updated':
      return projectQuizShowLayoutUpdate(payload);
    case 'quiz-show:leaderboard-updated':
      return projectQuizShowLeaderboardUpdate(payload);
    case 'quiz-show:leaderboard-update':
      return Array.isArray(payload) ? projectQuizShowLeaderboardUpdate(payload) : projectQuizShowDisplayLeaderboard(payload);
    case 'quiz-show:show-leaderboard':
    case 'quiz-show:leaderboard-show':
      return projectQuizShowDisplayLeaderboard(payload);
    case 'quiz-show:duel-update':
    case 'quiz-show:duel-ended':
      return projectQuizShowDuel(payload);
    case 'quiz-show:category-vote-started':
    case 'quiz-show:category-vote-update':
      return projectQuizShowCategoryVote(payload);
    case 'quiz-show:category-vote-ended':
      return isRecord(payload) ? projectQuizShowCategoryVote(payload) : {};
    case 'quiz-show:round-ended':
      return projectQuizShowRoundEnded(payload);
    case 'quiz-show:time-update':
      return isRecord(payload) && Number.isSafeInteger(payload.timeRemaining) && payload.timeRemaining >= 0 && payload.timeRemaining <= 86400
        && Number.isSafeInteger(payload.totalTime) && payload.totalTime >= 1 && payload.totalTime <= 86400
        ? { timeRemaining: payload.timeRemaining, totalTime: payload.totalTime }
        : null;
    case 'quiz-show:achievement-unlocked':
      return projectQuizShowAchievement(payload);
    case 'quiz-show:quiz-ended':
      return projectQuizShowMvp(payload);
    case 'quiz-show:joker-activated': {
      if (!isRecord(payload) || !QUIZ_SHOW_JOKER_TYPES.has(payload.type) || typeof payload.username !== 'string' || payload.username.length > 120
        || typeof payload.isGiftActivated !== 'boolean') return null;
      const projected = { type: payload.type, username: payload.username, isGiftActivated: payload.isGiftActivated };
      if (payload.data !== undefined && payload.data !== null) {
        if (!isRecord(payload.data)) return null;
        const data = {};
        if (payload.data.hiddenAnswers !== undefined) {
          if (!Array.isArray(payload.data.hiddenAnswers) || payload.data.hiddenAnswers.length > 4
            || payload.data.hiddenAnswers.some(index => !Number.isInteger(index) || index < 0 || index > 3)) return null;
          data.hiddenAnswers = payload.data.hiddenAnswers.slice();
        }
        if (payload.data.revealedWrongAnswer !== undefined) {
          if (!Number.isInteger(payload.data.revealedWrongAnswer) || payload.data.revealedWrongAnswer < 0 || payload.data.revealedWrongAnswer > 3) return null;
          data.revealedWrongAnswer = payload.data.revealedWrongAnswer;
        }
        if (payload.data.timeBoost !== undefined) {
          if (!Number.isFinite(payload.data.timeBoost) || payload.data.timeBoost < 0 || payload.data.timeBoost > 600) return null;
          data.timeBoost = payload.data.timeBoost;
        }
        projected.data = data;
      }
      return projected;
    }
    case 'quiz-show:slot-machine-start':
      return isRecord(payload) && Array.isArray(payload.categories) && payload.categories.length > 0 && payload.categories.length <= 50
        && payload.categories.every(category => typeof category === 'string' && category.length <= 120)
        && Number.isFinite(payload.spinDuration) && payload.spinDuration >= 0 && payload.spinDuration <= 60000
        && Number.isFinite(payload.spinSpeed) && payload.spinSpeed >= 10 && payload.spinSpeed <= 10000
        ? { categories: payload.categories.slice(), spinDuration: payload.spinDuration, spinSpeed: payload.spinSpeed }
        : null;
    case 'quiz-show:slot-machine-stop':
      return isRecord(payload) && typeof payload.selectedCategory === 'string' && payload.selectedCategory.length <= 120
        ? { selectedCategory: payload.selectedCategory }
        : null;
    case 'quiz-show:error':
      return isRecord(payload) ? (typeof payload.type === 'string' && ['no_questions_available', 'slot_machine_no_categories'].includes(payload.type) ? { type: payload.type } : {}) : null;
    case 'quiz-show:play-sound':
      return isRecord(payload) ? {} : null;
    case 'quiz-show:hide-leaderboard':
    case 'quiz-show:hide-timer':
    case 'quiz-show:leaderboard-hide':
    case 'quiz-show:stopped':
      return payload === undefined || isRecord(payload) ? {} : null;
    case 'coinbattle:match-state':
      return projectCoinBattleMatchState(payload);
    case 'coinbattle:leaderboard-update':
      return projectCoinBattleLeaderboardUpdate(payload);
    case 'coinbattle:multiplier-activated':
      return projectCoinBattleMultiplierActivated(payload);
    case 'coinbattle:multiplier-ended':
      return isRecord(payload) ? {} : null;
    case 'coinbattle:match-ended':
      return projectCoinBattleMatchEnded(payload);
    case 'coinbattle:badges-awarded':
      return projectCoinBattleBadgesAwarded(payload);
    case 'coinbattle:post-match':
      return projectCoinBattlePostMatch(payload);
    case 'coinbattle:team-names-updated':
      return projectCoinBattleTeamNamesUpdated(payload);
    case 'coinbattle:config-updated':
      return projectCoinBattleConfigUpdated(payload);
    case 'coinbattle:timer-update':
      return projectCoinBattleTimerUpdate(payload);
    case 'coinbattle:gift-received':
      return projectCoinBattleGiftReceived(payload);
    case 'musicbot:now-playing':
      return projectMusicBotTrack(payload, { allowNull: true });
    case 'musicbot:playback-sync':
      return projectMusicBotTrack(payload, { includePosition: true });
    case 'musicbot:queue-update':
      return projectMusicBotQueue(payload);
    case 'musicbot:next-song-vote':
      return projectMusicBotVote(payload);
    case 'musicbot:vote-skip-update':
      return projectMusicBotVoteSkip(payload);
    case 'musicbot:paused':
    case 'musicbot:playback-stopped':
    case 'musicbot:resumed':
    case 'musicbot:volume-changed':
      return isRecord(payload) ? {} : null;
    case 'soundboard:play':
      return projectSoundboardPlay(payload);
    case 'coinJar.add':
      return projectCoinJarAdd(payload);
    case 'coinJar.sync':
      return projectCoinJarSync(payload);
    case 'coinJar.reset':
      return isRecord(payload) && isValidCoinJarGeneration(payload.generation)
        ? { generation: payload.generation }
        : null;
    case 'coinJar.config':
      return projectCoinJarConfig(payload);
    case 'visual-fx-frame-webgpu:config-update': {
      if (!isRecord(payload)) return null;
      const config = projectVisualFxFrameWebGPUConfig(payload.config);
      return config ? { config } : null;
    }
    case 'visual-fx-frame-webgpu:trigger':
      return projectVisualFxFrameWebGPUTrigger(payload);
    case 'flame-overlay:config-update': {
      if (!isRecord(payload)) return null;
      const config = projectFlameOverlayConfig(payload.config);
      return config ? { config } : null;
    }
    case 'flame-overlay:trigger':
      return projectFlameOverlayTrigger(payload);
    default:
      return undefined;
  }
}

module.exports = {
  projectPublicOverlayPayload,
  projectArenaPublicState,
  projectGameEngineConfigResponse,
  registerPublicZappieHellGoal,
  forgetPublicZappieHellGoal,
  projectWeatherConfigResponse,
  projectWeatherGamificationResponse,
  projectVisualFxFrameWebGPUConfigResponse,
  projectInteractiveStoryConfigResponse,
  projectFlameOverlayConfigResponse,
  projectClaritySettingsResponse,
  projectClarityStateResponse,
  projectCoinBattleLeaderboardResponse,
  projectQuizShowStateResponse,
  projectQuizShowBrandKitResponse,
  projectQuizShowHudConfigResponse,
  projectQuizShowLayoutResponse,
  projectQuizShowLeaderboardResponse,
  projectEmojiRainUserMappingsResponse,
  projectAnimazingPalStreamAssistantStatusResponse,
  projectGCCERotatorResponse
};
