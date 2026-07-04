const ALLOWED_SHAPES = ['burst', 'heart', 'star', 'ring', 'spiral'];
const VALID_GIFT_POPUP_POSITIONS = ['top', 'middle', 'bottom', 'none'];
const VALID_ORIENTATIONS = ['landscape', 'portrait'];

const DEFAULT_FIREWORKS_CONFIG = {
  enabled: true,
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
  rocketSound: '/assets/audio/sound1.mp3',
  explosionSound: '/assets/audio/sound2.mp3',
  audioVolume: 0.7,
  colorMode: 'gift',
  themeColors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'],
  goalFinaleEnabled: true,
  goalFinaleIntensity: 3.0,
  goalFinaleDuration: 5000,
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
  gpuAcceleration: true,
  preserveDrawingBuffer: true,
  desynchronized: true,
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
  maxTotalParticles: 1400,
  emergencyCleanupThreshold: 2200,
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

function normalizeShape(value, fallback = DEFAULT_FIREWORKS_CONFIG.defaultShape) {
  return ALLOWED_SHAPES.includes(value) ? value : fallback;
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
  return {
    small: clampInteger(source.small, 0, 1000000, defaults.small),
    medium: clampInteger(source.medium, 1, 1000000, defaults.medium),
    big: clampInteger(source.big, 1, 1000000, defaults.big),
    massive: clampInteger(source.massive, 1, 1000000, defaults.massive)
  };
}

function normalizeGiftShapeMappings(value) {
  if (!isPlainObject(value)) return {};
  const mappings = {};
  for (const [giftId, mapping] of Object.entries(value)) {
    const normalized = normalizeGiftMapping({ giftId, ...(isPlainObject(mapping) ? mapping : {}) });
    if (normalized.giftId) {
      mappings[normalized.giftId] = {
        shape: normalized.shape,
        colors: normalized.colors,
        intensity: normalized.intensity
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
    rocketSound: typeof source.rocketSound === 'string' ? source.rocketSound : defaults.rocketSound,
    explosionSound: typeof source.explosionSound === 'string' ? source.explosionSound : defaults.explosionSound,
    audioVolume: clampNumber(source.audioVolume, 0, 1, defaults.audioVolume),
    colorMode: ['gift', 'random', 'theme', 'rainbow'].includes(source.colorMode) ? source.colorMode : defaults.colorMode,
    themeColors: normalizeColorArray(source.themeColors, defaults.themeColors),
    goalFinaleEnabled: normalizeBoolean(source.goalFinaleEnabled, defaults.goalFinaleEnabled),
    goalFinaleIntensity: clampNumber(source.goalFinaleIntensity, 0.1, 10, defaults.goalFinaleIntensity),
    goalFinaleDuration: clampInteger(source.goalFinaleDuration, 250, 30000, defaults.goalFinaleDuration),
    followerFireworksEnabled: normalizeBoolean(source.followerFireworksEnabled, defaults.followerFireworksEnabled),
    followerRocketCount: clampInteger(source.followerRocketCount, 1, 10, defaults.followerRocketCount),
    followerShowAnimation: normalizeBoolean(source.followerShowAnimation, defaults.followerShowAnimation),
    followerShowProfilePicture: normalizeBoolean(source.followerShowProfilePicture, defaults.followerShowProfilePicture),
    followerAnimationDuration: clampInteger(source.followerAnimationDuration, 1000, 10000, defaults.followerAnimationDuration),
    followerAnimationDelay: clampInteger(source.followerAnimationDelay, 0, 10000, defaults.followerAnimationDelay),
    followerAnimationPosition: typeof source.followerAnimationPosition === 'string' ? source.followerAnimationPosition : defaults.followerAnimationPosition,
    followerAnimationSize: ['small', 'medium', 'large', 'custom'].includes(source.followerAnimationSize) ? source.followerAnimationSize : defaults.followerAnimationSize,
    followerAnimationScale: clampNumber(source.followerAnimationScale, 0.5, 2, defaults.followerAnimationScale),
    followerAnimationStyle: typeof source.followerAnimationStyle === 'string' ? source.followerAnimationStyle : defaults.followerAnimationStyle,
    followerAnimationEntrance: typeof source.followerAnimationEntrance === 'string' ? source.followerAnimationEntrance : defaults.followerAnimationEntrance,
    followerThankYouText: typeof source.followerThankYouText === 'string' ? source.followerThankYouText.slice(0, 120) : defaults.followerThankYouText,
    interactiveEnabled: normalizeBoolean(source.interactiveEnabled, defaults.interactiveEnabled),
    clickTriggerEnabled: normalizeBoolean(source.clickTriggerEnabled, defaults.clickTriggerEnabled),
    chatTriggerEnabled: normalizeBoolean(source.chatTriggerEnabled, defaults.chatTriggerEnabled),
    chatTriggerKeywords: Array.isArray(source.chatTriggerKeywords) ? source.chatTriggerKeywords.filter((item) => typeof item === 'string').slice(0, 20) : [...defaults.chatTriggerKeywords],
    randomEnabled: normalizeBoolean(source.randomEnabled, defaults.randomEnabled),
    randomInterval: clampInteger(source.randomInterval, 1000, 3600000, defaults.randomInterval),
    randomMinIntensity: clampNumber(source.randomMinIntensity, 0.1, 10, defaults.randomMinIntensity),
    randomMaxIntensity: clampNumber(source.randomMaxIntensity, 0.1, 10, defaults.randomMaxIntensity),
    gpuAcceleration: normalizeBoolean(source.gpuAcceleration, defaults.gpuAcceleration),
    preserveDrawingBuffer: normalizeBoolean(source.preserveDrawingBuffer, defaults.preserveDrawingBuffer),
    desynchronized: normalizeBoolean(source.desynchronized, defaults.desynchronized),
    particleSizeRange: Array.isArray(source.particleSizeRange)
      ? [
        clampNumber(source.particleSizeRange[0], 1, 64, defaults.particleSizeRange[0]),
        clampNumber(source.particleSizeRange[1], 1, 64, defaults.particleSizeRange[1])
      ].sort((a, b) => a - b)
      : [...defaults.particleSizeRange],
    resolution: clampNumber(source.resolution, 0.25, 2, defaults.resolution),
    resolutionPreset: typeof source.resolutionPreset === 'string' ? source.resolutionPreset : defaults.resolutionPreset,
    internalMaxResolutionPreset: typeof source.internalMaxResolutionPreset === 'string' ? source.internalMaxResolutionPreset : defaults.internalMaxResolutionPreset,
    internalMinResolutionPreset: typeof source.internalMinResolutionPreset === 'string' ? source.internalMinResolutionPreset : defaults.internalMinResolutionPreset,
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
    maxTotalParticles: clampInteger(source.maxTotalParticles, 200, 3000, defaults.maxTotalParticles),
    emergencyCleanupThreshold: clampInteger(source.emergencyCleanupThreshold, 500, 3000, defaults.emergencyCleanupThreshold),
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
  return {
    ...source,
    type: typeof source.type === 'string' ? source.type.slice(0, 40) : 'burst',
    intensity: clampNumber(source.intensity, 0.1, 10, 1.0),
    shape: normalizeShape(source.shape, safeConfig.defaultShape),
    colors: source.colors === null || source.colors === undefined
      ? null
      : normalizeColorArray(source.colors, []),
    position: normalizePosition(source.position, { x: 0.5, y: 0.5 }),
    particleCount: clampInteger(source.particleCount, 1, safeConfig.maxTotalParticles, 50),
    duration: clampInteger(source.duration, 250, 30000, 2000),
    tier: ['small', 'medium', 'big', 'massive'].includes(source.tier) ? source.tier : 'medium',
    combo: clampInteger(source.combo, 1, 999, 1),
    coins: clampInteger(source.coins, 0, 100000000, 0)
  };
}

function normalizeFinaleRequest(body = {}) {
  const source = isPlainObject(body) ? body : {};
  return {
    intensity: clampNumber(source.intensity, 0.1, 10, 3.0),
    duration: clampInteger(source.duration, 250, 30000, 5000)
  };
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
    intensity: clampNumber(source.intensity, 0.1, 10, 1.0)
  };
}

module.exports = {
  ALLOWED_SHAPES,
  DEFAULT_FIREWORKS_CONFIG,
  clampInteger,
  clampNumber,
  normalizeConfig,
  normalizeFinaleRequest,
  normalizeFireworkTrigger,
  normalizeGiftMapping,
  normalizePosition,
  normalizeShape
};
