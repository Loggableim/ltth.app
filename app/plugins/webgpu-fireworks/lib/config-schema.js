const ALLOWED_SHAPES = ['burst', 'heart', 'star', 'ring', 'spiral', 'paws'];
const ALLOWED_VISUAL_STYLES = ['premium-hybrid', 'realistic', 'stylized-neon'];
const VALID_GIFT_POPUP_POSITIONS = ['top', 'middle', 'bottom', 'none'];
const VALID_ORIENTATIONS = ['landscape', 'portrait'];
const VALID_RESOLUTION_PRESETS = ['360p', '480p', '540p', '720p', '1080p', '1440p', '4k'];
const VALID_FOLLOWER_POSITIONS = ['top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right'];
const VALID_FOLLOWER_STYLES = ['gradient-purple', 'gradient-blue', 'gradient-gold', 'gradient-rainbow', 'neon', 'minimal'];
const VALID_FOLLOWER_ENTRANCES = ['scale', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'bounce', 'rotate'];
const { FINALE_STYLES, FINALE_LENGTHS } = require('./finale-show-planner');

const ALLOWED_FINALE_STYLES = Object.freeze(['auto', ...FINALE_STYLES]);
const ALLOWED_FINALE_LENGTHS = Object.freeze([...FINALE_LENGTHS]);
const SUPERFAN_FINALE_COOLDOWN_HOURS = Object.freeze([6, 12, 24, 72, 168]);
const FINALE_DURATION_BY_LENGTH = Object.freeze({
  short: 10000,
  medium: 18000,
  long: 28000
});

const DEFAULT_FIREWORKS_CONFIG = {
  enabled: true,
  renderer: 'webgpu',
  visualStyle: 'premium-hybrid',
  maxParticles: 1000,
  targetFps: 60,
  giftTriggersEnabled: true,
  minGiftCoins: 1,
  comboEnabled: true,
  comboTimeout: 10000,
  comboMultiplierBase: 1.2,
  comboMaxMultiplier: 5.0,
  escalationEnabled: true,
  escalationThresholds: {
    small: 0,
    medium: 100,
    big: 500,
    massive: 1000
  },
  particleCount: {
    small: 30,
    medium: 60,
    big: 100,
    massive: 200
  },
  shapesEnabled: true,
  defaultShape: 'burst',
  randomShapeEnabled: false,
  activeShapes: ['burst'],
  giftShapeMappings: {},
  userAvatarEnabled: false,
  avatarParticleChance: 0.3,
  audioEnabled: true,
  rocketSound: '/plugins/webgpu-fireworks/audio/abschussgeraeusch.mp3',
  explosionSound: '/plugins/webgpu-fireworks/audio/explosion_small1.mp3',
  audioVolume: 0.7,
  crackleFrequency: 0.5,
  crackleVolume: 0.75,
  colorMode: 'gift',
  themeColors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'],
  goalFinaleEnabled: true,
  goalFinaleIntensity: 3.0,
  goalFinaleStyle: 'auto',
  goalFinaleLength: 'medium',
  goalFinaleDuration: 18000,
  superfanFinaleEnabled: true,
  superfanFinaleCooldownHours: 24,
  superfanFinaleIntensity: 3,
  superfanEndCardDuration: 3000,
  superfanEndCardPosition: 'center',
  superfanEndCardSize: 'medium',
  superfanEndCardScale: 1,
  followerFireworksEnabled: false,
  followerRocketCount: 3,
  followerShowAnimation: true,
  followerShowProfilePicture: true,
  followerAnimationDuration: 3000,
  followerAnimationDelay: 3000,
  followerAnimationPosition: 'center',
  followerAnimationSize: 'medium',
  followerAnimationScale: 1.0,
  followerAnimationStyle: 'gradient-purple',
  followerAnimationEntrance: 'scale',
  followerThankYouText: 'Thanks for the follow! 💙',
  interactiveEnabled: false,
  clickTriggerEnabled: false,
  chatTriggerEnabled: false,
  chatTriggerKeywords: ['🎆', 'fireworks', 'boom'],
  randomEnabled: false,
  randomInterval: 30000,
  randomMinIntensity: 0.5,
  randomMaxIntensity: 1.5,
  toasterMode: false,
  trailsEnabled: true,
  trailLength: 10,
  glowEnabled: true,
  particleSizeRange: [4, 12],
  resolution: 1.0,
  resolutionPreset: '1080p',
  internalMaxResolutionPreset: '4k',
  internalMinResolutionPreset: '540p',
  orientation: 'landscape',
  adaptiveRenderScaleEnabled: true,
  minRenderScale: 0.45,
  minFps: 24,
  despawnFadeDuration: 3.0,
  giftPopupEnabled: true,
  giftPopupPosition: 'bottom',
  queueEnabled: false,
  maxRocketsPerSecond: 5,
  maxConcurrentFireworks: 12,
  maxTotalParticles: 8192,
  emergencyCleanupThreshold: 10000,
  adaptivePerformance: true,
  minTargetFps: 24,
  frameSkipEnabled: true,
  gravity: 0.1,
  friction: 0.98,
  windEnabled: false,
  windStrength: 0.02
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function clampInteger(value, min, max, fallback) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function normalizeBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function normalizeDisplayText(value, fallback, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, maxLength);
}

function normalizeOptionalImageUrl(value) {
  if (typeof value !== 'string') return null;
  const url = value.trim().slice(0, 2048);
  return /^https?:\/\//i.test(url) ? url : null;
}

function normalizeCompletionNotification(value) {
  if (!isPlainObject(value)) return null;
  const username = normalizeDisplayText(value.username, 'Superfan', 80);
  return {
    username,
    usernameText: normalizeDisplayText(
      value.usernameText,
      `Thank you for being a Superfan, ${username}!`,
      180
    ),
    thankYouText: normalizeDisplayText(value.thankYouText, 'This firework was for you!', 180),
    profilePictureUrl: normalizeOptionalImageUrl(value.profilePictureUrl),
    duration: clampInteger(value.duration, 1000, 10000, 3000),
    position: VALID_FOLLOWER_POSITIONS.includes(value.position) ? value.position : 'center',
    size: ['small', 'medium', 'large', 'custom'].includes(value.size) ? value.size : 'medium',
    scale: clampNumber(value.scale, 0.5, 2, 1),
    style: VALID_FOLLOWER_STYLES.includes(value.style) ? value.style : 'gradient-purple',
    entrance: VALID_FOLLOWER_ENTRANCES.includes(value.entrance) ? value.entrance : 'scale'
  };
}

function normalizeShape(value, fallback = DEFAULT_FIREWORKS_CONFIG.defaultShape) {
  return ALLOWED_SHAPES.includes(value) ? value : fallback;
}

function normalizeVisualStyle(value, fallback = DEFAULT_FIREWORKS_CONFIG.visualStyle) {
  return ALLOWED_VISUAL_STYLES.includes(value) ? value : fallback;
}

function normalizeFinaleStyle(value, fallback = DEFAULT_FIREWORKS_CONFIG.goalFinaleStyle) {
  return ALLOWED_FINALE_STYLES.includes(value) ? value : fallback;
}

function normalizeFinaleLength(value, fallback = DEFAULT_FIREWORKS_CONFIG.goalFinaleLength) {
  return ALLOWED_FINALE_LENGTHS.includes(value) ? value : fallback;
}

function finaleLengthFromDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return DEFAULT_FIREWORKS_CONFIG.goalFinaleLength;
  if (duration <= 14000) return 'short';
  if (duration <= 23000) return 'medium';
  return 'long';
}

function normalizeColor(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) return trimmed;
  if (/^hsl\(\s*\d{1,3}(\.\d+)?\s*,\s*\d{1,3}(\.\d+)?%\s*,\s*\d{1,3}(\.\d+)?%\s*\)$/i.test(trimmed)) return trimmed;
  if (/^hsla\(\s*\d{1,3}(\.\d+)?\s*,\s*\d{1,3}(\.\d+)?%\s*,\s*\d{1,3}(\.\d+)?%\s*,\s*(0|1|0?\.\d+)\s*\)$/i.test(trimmed)) return trimmed;
  return null;
}

function normalizeColorArray(value, fallback = []) {
  const input = Array.isArray(value) ? value : fallback;
  const colors = input.map(normalizeColor).filter(Boolean);
  return colors.length > 0 ? colors.slice(0, 12) : [...fallback];
}

function normalizeShapeArray(value, fallback = DEFAULT_FIREWORKS_CONFIG.activeShapes) {
  const input = Array.isArray(value) ? value : fallback;
  const shapes = [];
  for (const shape of input) {
    if (ALLOWED_SHAPES.includes(shape) && !shapes.includes(shape)) {
      shapes.push(shape);
    }
  }
  return shapes.length > 0 ? shapes : [...fallback];
}

function normalizePosition(value, fallback = { x: 0.5, y: 0.5 }) {
  const source = isPlainObject(value) ? value : fallback;
  return {
    x: clampNumber(source.x, 0, 1, fallback.x),
    y: clampNumber(source.y, 0, 1, fallback.y)
  };
}

function normalizeParticleCounts(value) {
  const source = isPlainObject(value) ? value : {};
  const defaults = DEFAULT_FIREWORKS_CONFIG.particleCount;
  return {
    small: clampInteger(source.small, 1, 3000, defaults.small),
    medium: clampInteger(source.medium, 1, 3000, defaults.medium),
    big: clampInteger(source.big, 1, 3000, defaults.big),
    massive: clampInteger(source.massive, 1, 3000, defaults.massive)
  };
}

function normalizeThresholds(value) {
  const source = isPlainObject(value) ? value : {};
  const defaults = DEFAULT_FIREWORKS_CONFIG.escalationThresholds;
  const small = clampInteger(source.small, 0, 1000000, defaults.small);
  const medium = Math.max(small, clampInteger(source.medium, 0, 1000000, defaults.medium));
  const big = Math.max(medium, clampInteger(source.big, 0, 1000000, defaults.big));
  const massive = Math.max(big, clampInteger(source.massive, 0, 1000000, defaults.massive));
  return { small, medium, big, massive };
}

function normalizeAudioPath(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (trimmed.startsWith('/plugins/fireworks/audio/')) {
    return trimmed.replace('/plugins/fireworks/audio/', '/plugins/webgpu-fireworks/audio/');
  }
  if (
    trimmed.startsWith('/plugins/webgpu-fireworks/audio/') ||
    trimmed.startsWith('/plugins/webgpu-fireworks/uploads/') ||
    /^https:\/\//i.test(trimmed)
  ) return trimmed;
  return fallback;
}

function normalizePreset(value, fallback) {
  return VALID_RESOLUTION_PRESETS.includes(value) ? value : fallback;
}

function normalizeGiftShapeMappings(value) {
  if (!isPlainObject(value)) return {};
  const mappings = {};
  for (const [giftId, mapping] of Object.entries(value)) {
    const source = typeof mapping === 'string'
      ? { giftId, shape: mapping }
      : { giftId, ...(isPlainObject(mapping) ? mapping : {}) };
    const normalized = normalizeGiftMapping(source);
    if (normalized.giftId) {
      mappings[normalized.giftId] = {
        shape: normalized.shape,
        colors: normalized.colors,
        intensity: normalized.intensity,
        visualStyle: normalized.visualStyle
      };
    }
  }
  return mappings;
}

function normalizeConfig(config = {}) {
  const source = isPlainObject(config) ? config : {};
  const defaults = DEFAULT_FIREWORKS_CONFIG;

  return {
    ...defaults,
    enabled: normalizeBoolean(source.enabled, defaults.enabled),
    // This plugin has no alternate backend. Legacy cloned values migrate here.
    renderer: 'webgpu',
    visualStyle: normalizeVisualStyle(source.visualStyle, defaults.visualStyle),
    maxParticles: clampInteger(source.maxParticles, 200, 3000, defaults.maxParticles),
    targetFps: clampInteger(source.targetFps, 24, 120, defaults.targetFps),
    giftTriggersEnabled: normalizeBoolean(source.giftTriggersEnabled, defaults.giftTriggersEnabled),
    minGiftCoins: clampInteger(source.minGiftCoins, 0, 1000000, defaults.minGiftCoins),
    comboEnabled: normalizeBoolean(source.comboEnabled, defaults.comboEnabled),
    comboTimeout: clampInteger(source.comboTimeout, 1000, 60000, defaults.comboTimeout),
    comboMultiplierBase: clampNumber(source.comboMultiplierBase, 1, 5, defaults.comboMultiplierBase),
    comboMaxMultiplier: clampNumber(source.comboMaxMultiplier, 1, 20, defaults.comboMaxMultiplier),
    escalationEnabled: normalizeBoolean(source.escalationEnabled, defaults.escalationEnabled),
    escalationThresholds: normalizeThresholds(source.escalationThresholds),
    particleCount: normalizeParticleCounts(source.particleCount),
    shapesEnabled: normalizeBoolean(source.shapesEnabled, defaults.shapesEnabled),
    defaultShape: normalizeShape(source.defaultShape, defaults.defaultShape),
    randomShapeEnabled: normalizeBoolean(source.randomShapeEnabled, defaults.randomShapeEnabled),
    activeShapes: normalizeShapeArray(source.activeShapes),
    giftShapeMappings: normalizeGiftShapeMappings(source.giftShapeMappings),
    userAvatarEnabled: normalizeBoolean(source.userAvatarEnabled, defaults.userAvatarEnabled),
    avatarParticleChance: clampNumber(source.avatarParticleChance, 0, 1, defaults.avatarParticleChance),
    audioEnabled: normalizeBoolean(source.audioEnabled, defaults.audioEnabled),
    rocketSound: normalizeAudioPath(source.rocketSound, defaults.rocketSound),
    explosionSound: normalizeAudioPath(source.explosionSound, defaults.explosionSound),
    audioVolume: clampNumber(source.audioVolume, 0, 1, defaults.audioVolume),
    crackleFrequency: clampNumber(source.crackleFrequency, 0, 1, defaults.crackleFrequency),
    crackleVolume: clampNumber(source.crackleVolume, 0, 1, defaults.crackleVolume),
    colorMode: ['gift', 'random', 'theme', 'rainbow'].includes(source.colorMode) ? source.colorMode : defaults.colorMode,
    themeColors: normalizeColorArray(source.themeColors, defaults.themeColors),
    goalFinaleEnabled: normalizeBoolean(source.goalFinaleEnabled, defaults.goalFinaleEnabled),
    goalFinaleIntensity: clampNumber(source.goalFinaleIntensity, 0.1, 10, defaults.goalFinaleIntensity),
    goalFinaleStyle: normalizeFinaleStyle(source.goalFinaleStyle, defaults.goalFinaleStyle),
    goalFinaleLength: normalizeFinaleLength(source.goalFinaleLength, defaults.goalFinaleLength),
    goalFinaleDuration: clampInteger(source.goalFinaleDuration, 250, 30000, defaults.goalFinaleDuration),
    superfanFinaleEnabled: normalizeBoolean(source.superfanFinaleEnabled, defaults.superfanFinaleEnabled),
    superfanFinaleCooldownHours: SUPERFAN_FINALE_COOLDOWN_HOURS.includes(Number(source.superfanFinaleCooldownHours))
      ? Number(source.superfanFinaleCooldownHours)
      : defaults.superfanFinaleCooldownHours,
    superfanFinaleIntensity: clampNumber(source.superfanFinaleIntensity, 1, 10, defaults.superfanFinaleIntensity),
    superfanEndCardDuration: clampInteger(source.superfanEndCardDuration, 1000, 10000, defaults.superfanEndCardDuration),
    superfanEndCardPosition: VALID_FOLLOWER_POSITIONS.includes(source.superfanEndCardPosition)
      ? source.superfanEndCardPosition
      : defaults.superfanEndCardPosition,
    superfanEndCardSize: ['small', 'medium', 'large', 'custom'].includes(source.superfanEndCardSize)
      ? source.superfanEndCardSize
      : defaults.superfanEndCardSize,
    superfanEndCardScale: clampNumber(source.superfanEndCardScale, 0.5, 2, defaults.superfanEndCardScale),
    followerFireworksEnabled: normalizeBoolean(source.followerFireworksEnabled, defaults.followerFireworksEnabled),
    followerRocketCount: clampInteger(source.followerRocketCount, 1, 10, defaults.followerRocketCount),
    followerShowAnimation: normalizeBoolean(source.followerShowAnimation, defaults.followerShowAnimation),
    followerShowProfilePicture: normalizeBoolean(source.followerShowProfilePicture, defaults.followerShowProfilePicture),
    followerAnimationDuration: clampInteger(source.followerAnimationDuration, 1000, 10000, defaults.followerAnimationDuration),
    followerAnimationDelay: clampInteger(source.followerAnimationDelay, 0, 10000, defaults.followerAnimationDelay),
    followerAnimationPosition: VALID_FOLLOWER_POSITIONS.includes(source.followerAnimationPosition) ? source.followerAnimationPosition : defaults.followerAnimationPosition,
    followerAnimationSize: ['small', 'medium', 'large', 'custom'].includes(source.followerAnimationSize) ? source.followerAnimationSize : defaults.followerAnimationSize,
    followerAnimationScale: clampNumber(source.followerAnimationScale, 0.5, 2, defaults.followerAnimationScale),
    followerAnimationStyle: VALID_FOLLOWER_STYLES.includes(source.followerAnimationStyle) ? source.followerAnimationStyle : defaults.followerAnimationStyle,
    followerAnimationEntrance: VALID_FOLLOWER_ENTRANCES.includes(source.followerAnimationEntrance) ? source.followerAnimationEntrance : defaults.followerAnimationEntrance,
    followerThankYouText: typeof source.followerThankYouText === 'string' ? source.followerThankYouText.slice(0, 120) : defaults.followerThankYouText,
    interactiveEnabled: normalizeBoolean(source.interactiveEnabled, defaults.interactiveEnabled),
    clickTriggerEnabled: normalizeBoolean(source.clickTriggerEnabled, defaults.clickTriggerEnabled),
    chatTriggerEnabled: normalizeBoolean(source.chatTriggerEnabled, defaults.chatTriggerEnabled),
    chatTriggerKeywords: Array.isArray(source.chatTriggerKeywords) ? source.chatTriggerKeywords.filter((item) => typeof item === 'string').slice(0, 20) : [...defaults.chatTriggerKeywords],
    randomEnabled: normalizeBoolean(source.randomEnabled, defaults.randomEnabled),
    randomInterval: clampInteger(source.randomInterval, 1000, 3600000, defaults.randomInterval),
    randomMinIntensity: clampNumber(source.randomMinIntensity, 0.1, 10, defaults.randomMinIntensity),
    randomMaxIntensity: Math.max(
      clampNumber(source.randomMinIntensity, 0.1, 10, defaults.randomMinIntensity),
      clampNumber(source.randomMaxIntensity, 0.1, 10, defaults.randomMaxIntensity)
    ),
    toasterMode: normalizeBoolean(source.toasterMode, defaults.toasterMode),
    trailsEnabled: normalizeBoolean(source.trailsEnabled, defaults.trailsEnabled),
    trailLength: clampInteger(source.trailLength, 0, 50, defaults.trailLength),
    glowEnabled: normalizeBoolean(source.glowEnabled, defaults.glowEnabled),
    particleSizeRange: Array.isArray(source.particleSizeRange)
      ? [
        clampNumber(source.particleSizeRange[0], 1, 64, defaults.particleSizeRange[0]),
        clampNumber(source.particleSizeRange[1], 1, 64, defaults.particleSizeRange[1])
      ].sort((a, b) => a - b)
      : [...defaults.particleSizeRange],
    resolution: clampNumber(source.resolution, 0.25, 2, defaults.resolution),
    resolutionPreset: normalizePreset(source.resolutionPreset, defaults.resolutionPreset),
    internalMaxResolutionPreset: normalizePreset(source.internalMaxResolutionPreset, defaults.internalMaxResolutionPreset),
    internalMinResolutionPreset: normalizePreset(source.internalMinResolutionPreset, defaults.internalMinResolutionPreset),
    orientation: VALID_ORIENTATIONS.includes(source.orientation) ? source.orientation : defaults.orientation,
    adaptiveRenderScaleEnabled: normalizeBoolean(source.adaptiveRenderScaleEnabled, defaults.adaptiveRenderScaleEnabled),
    minRenderScale: clampNumber(source.minRenderScale, 0.25, 1, defaults.minRenderScale),
    minFps: clampInteger(source.minFps, 15, 60, defaults.minFps),
    despawnFadeDuration: clampNumber(source.despawnFadeDuration, 0.25, 10, defaults.despawnFadeDuration),
    giftPopupEnabled: normalizeBoolean(source.giftPopupEnabled, defaults.giftPopupEnabled),
    giftPopupPosition: VALID_GIFT_POPUP_POSITIONS.includes(source.giftPopupPosition) ? source.giftPopupPosition : defaults.giftPopupPosition,
    queueEnabled: normalizeBoolean(source.queueEnabled, defaults.queueEnabled),
    maxRocketsPerSecond: clampInteger(source.maxRocketsPerSecond, 1, 20, defaults.maxRocketsPerSecond),
    maxConcurrentFireworks: clampInteger(source.maxConcurrentFireworks, 1, 20, defaults.maxConcurrentFireworks),
    maxTotalParticles: clampInteger(source.maxTotalParticles, 512, 16384, defaults.maxTotalParticles),
    emergencyCleanupThreshold: clampInteger(source.emergencyCleanupThreshold, 1024, 16384, defaults.emergencyCleanupThreshold),
    adaptivePerformance: normalizeBoolean(source.adaptivePerformance, defaults.adaptivePerformance),
    minTargetFps: clampInteger(source.minTargetFps, 20, 50, defaults.minTargetFps),
    frameSkipEnabled: normalizeBoolean(source.frameSkipEnabled, defaults.frameSkipEnabled),
    gravity: clampNumber(source.gravity, -1, 2, defaults.gravity),
    friction: clampNumber(source.friction, 0.5, 1, defaults.friction),
    windEnabled: normalizeBoolean(source.windEnabled, defaults.windEnabled),
    windStrength: clampNumber(source.windStrength, -1, 1, defaults.windStrength)
  };
}

function normalizeFireworkTrigger(options = {}, config = DEFAULT_FIREWORKS_CONFIG) {
  const source = isPlainObject(options) ? options : {};
  const safeConfig = normalizeConfig(config);
  const hasExplicitPosition = isPlainObject(source.position);
  const positionMode = source.positionMode === 'exact' || source.positionMode === 'auto'
    ? source.positionMode
    : (hasExplicitPosition ? 'exact' : 'auto');
  return {
    ...source,
    type: typeof source.type === 'string' ? source.type.slice(0, 40) : 'burst',
    intensity: clampNumber(source.intensity, 0.1, 10, 1.0),
    shape: normalizeShape(source.shape, safeConfig.defaultShape),
    colors: source.colors === null || source.colors === undefined
      ? null
      : normalizeColorArray(source.colors, []),
    positionMode,
    position: positionMode === 'exact'
      ? normalizePosition(source.position, { x: 0.5, y: 0.5 })
      : null,
    origin: isPlainObject(source.origin) ? normalizePosition(source.origin, { x: 0.5, y: 1 }) : null,
    seed: clampInteger(source.seed, 0, 0xffffffff, Math.floor(Math.random() * 0xffffffff)),
    visualStyle: normalizeVisualStyle(source.visualStyle, safeConfig.visualStyle),
    particleCount: clampInteger(source.particleCount, 1, safeConfig.maxTotalParticles, 50),
    duration: clampInteger(source.duration, 250, 30000, 2000),
    tier: ['small', 'medium', 'big', 'massive'].includes(source.tier) ? source.tier : 'medium',
    combo: clampInteger(source.combo, 1, 999, 1),
    coins: clampInteger(source.coins, 0, 100000000, 0),
    crackleEnabled: typeof source.crackleEnabled === 'boolean' ? source.crackleEnabled : undefined
  };
}

function normalizeFinaleRequest(body = {}) {
  const source = isPlainObject(body) ? body : {};
  const hasExplicitLength = Object.prototype.hasOwnProperty.call(source, 'length');
  const length = hasExplicitLength
    ? normalizeFinaleLength(source.length)
    : (source.duration === undefined
      ? DEFAULT_FIREWORKS_CONFIG.goalFinaleLength
      : finaleLengthFromDuration(source.duration));
  const rawIdentity = source.eventId ?? source.id;
  const eventId = (typeof rawIdentity === 'string' || typeof rawIdentity === 'number') && String(rawIdentity).trim()
    ? String(rawIdentity).trim().slice(0, 160)
    : null;
  const seedValue = Number(source.seed);
  const seed = Number.isFinite(seedValue)
    ? (Math.trunc(seedValue) >>> 0)
    : (Math.floor(Math.random() * 0x100000000) >>> 0);
  const durationMs = FINALE_DURATION_BY_LENGTH[length];
  const normalized = {
    style: normalizeFinaleStyle(source.style),
    length,
    intensity: clampNumber(source.intensity, 0.1, 10, 3.0),
    seed,
    bypassEnabled: source.bypassEnabled === true,
    eventId,
    id: eventId,
    duration: durationMs,
    durationMs
  };
  const completionNotification = normalizeCompletionNotification(source.completionNotification);
  if (completionNotification) normalized.completionNotification = completionNotification;
  return normalized;
}

function normalizeGiftMapping(body = {}) {
  const source = isPlainObject(body) ? body : {};
  const giftId = typeof source.giftId === 'string' || typeof source.giftId === 'number'
    ? String(source.giftId).replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 80)
    : '';

  return {
    giftId,
    shape: normalizeShape(source.shape),
    colors: source.colors === null || source.colors === undefined
      ? null
      : normalizeColorArray(source.colors, []),
    intensity: clampNumber(source.intensity, 0.1, 10, 1.0),
    visualStyle: source.visualStyle === null || source.visualStyle === undefined || source.visualStyle === ''
      ? null
      : normalizeVisualStyle(source.visualStyle)
  };
}

module.exports = {
  ALLOWED_FINALE_LENGTHS,
  ALLOWED_FINALE_STYLES,
  ALLOWED_SHAPES,
  ALLOWED_VISUAL_STYLES,
  DEFAULT_FIREWORKS_CONFIG,
  FINALE_DURATION_BY_LENGTH,
  SUPERFAN_FINALE_COOLDOWN_HOURS,
  clampInteger,
  clampNumber,
  finaleLengthFromDuration,
  normalizeCompletionNotification,
  normalizeConfig,
  normalizeFinaleLength,
  normalizeFinaleRequest,
  normalizeFinaleStyle,
  normalizeFireworkTrigger,
  normalizeGiftMapping,
  normalizePosition,
  normalizeShape,
  normalizeVisualStyle
};
