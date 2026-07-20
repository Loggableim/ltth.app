const ALLOWED_SHAPES = Object.freeze(['burst', 'heart', 'star', 'ring', 'spiral', 'paws']);
const ALLOWED_VISUAL_STYLES = Object.freeze(['premium-hybrid', 'realistic', 'stylized-neon']);
const VALID_COLOR_MODES = Object.freeze(['gift', 'random', 'theme', 'rainbow']);
const VALID_GIFT_POPUP_POSITIONS = Object.freeze(['top', 'middle', 'bottom', 'none']);
const VALID_ORIENTATIONS = Object.freeze(['landscape', 'portrait']);
const VALID_RESOLUTION_PRESETS = Object.freeze(['360p', '480p', '540p', '720p', '1080p', '1440p', '4k']);
const VALID_FOLLOWER_POSITIONS = Object.freeze(['top-left', 'top-center', 'top-right', 'center', 'bottom-left', 'bottom-center', 'bottom-right']);
const VALID_FOLLOWER_STYLES = Object.freeze(['gradient-purple', 'gradient-blue', 'gradient-gold', 'gradient-rainbow', 'neon', 'minimal']);
const VALID_FOLLOWER_SIZES = Object.freeze(['small', 'medium', 'large', 'custom']);
const VALID_FOLLOWER_ENTRANCES = Object.freeze(['scale', 'fade', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'bounce', 'rotate']);
const { FINALE_STYLES, FINALE_LENGTHS } = require('./finale-show-planner');

const ALLOWED_FINALE_STYLES = Object.freeze(['auto', ...FINALE_STYLES]);
const ALLOWED_FINALE_LENGTHS = Object.freeze([...FINALE_LENGTHS]);
const CUSTOM_FINALE_STYLE_PATTERN = /^custom:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPERFAN_FINALE_COOLDOWN_HOURS = Object.freeze([6, 12, 24, 72, 168]);
const ALLOWED_SUPERFAN_FINALE_STYLES = Object.freeze(['inherit', ...FINALE_STYLES]);
const ALLOWED_SUPERFAN_FINALE_LENGTHS = Object.freeze(['inherit', ...FINALE_LENGTHS]);
const FINALE_DURATION_BY_LENGTH = Object.freeze({
  short: 10000,
  medium: 18000,
  long: 28000
});
const CONFIG_LIMITS = Object.freeze({
  comboTimeout: Object.freeze({ min: 1000, max: 60000, step: 1000, uiScale: 0.001 }),
  comboMaxMultiplier: Object.freeze({ min: 1, max: 20, step: 0.5, uiScale: 1 }),
  audioVolume: Object.freeze({ min: 0, max: 1, step: 0.01, uiScale: 100 }),
  crackleFrequency: Object.freeze({ min: 0, max: 1, step: 0.01, uiScale: 100 }),
  crackleVolume: Object.freeze({ min: 0, max: 1, step: 0.01, uiScale: 100 }),
  maxParticles: Object.freeze({ min: 200, max: 3000, step: 1, uiScale: 1 }),
  targetFps: Object.freeze({ min: 24, max: 120, step: 1, uiScale: 1 }),
  minFps: Object.freeze({ min: 15, max: 60, step: 1, uiScale: 1 }),
  despawnFadeDuration: Object.freeze({ min: 0.25, max: 10, step: 0.25, uiScale: 1 }),
  maxRocketsPerSecond: Object.freeze({ min: 1, max: 20, step: 1, uiScale: 1 }),
  maxConcurrentFireworks: Object.freeze({ min: 1, max: 20, step: 1, uiScale: 1 }),
  maxTotalParticles: Object.freeze({ min: 512, max: 16384, step: 1, uiScale: 1 }),
  emergencyCleanupThreshold: Object.freeze({ min: 1024, max: 16384, step: 1, uiScale: 1 }),
  minTargetFps: Object.freeze({ min: 20, max: 50, step: 1, uiScale: 1 }),
  avatarParticleChance: Object.freeze({ min: 0, max: 1, step: 0.01, uiScale: 100 }),
  goalFinaleIntensity: Object.freeze({ min: 0.1, max: 10, step: 0.1, uiScale: 1 }),
  superfanFinaleIntensity: Object.freeze({ min: 1, max: 10, step: 0.5, uiScale: 1 }),
  superfanEndCardDuration: Object.freeze({ min: 1000, max: 10000, step: 500, uiScale: 0.001 }),
  superfanEndCardScale: Object.freeze({ min: 0.5, max: 2, step: 0.1, uiScale: 1 }),
  followerRocketCount: Object.freeze({ min: 1, max: 10, step: 1, uiScale: 1 }),
  followerAnimationDuration: Object.freeze({ min: 1000, max: 10000, step: 500, uiScale: 0.001 }),
  followerAnimationDelay: Object.freeze({ min: 0, max: 10000, step: 500, uiScale: 0.001 }),
  followerAnimationScale: Object.freeze({ min: 0.5, max: 2, step: 0.1, uiScale: 1 })
});

function enumDescriptor(values, dynamicPattern = null) {
  const descriptor = { values: Object.freeze(values.map(value => String(value))) };
  if (dynamicPattern) {
    descriptor.dynamicPattern = dynamicPattern.source;
    descriptor.dynamicFlags = dynamicPattern.flags;
  }
  return Object.freeze(descriptor);
}

const CONFIG_ENUMS = Object.freeze({
  shape: enumDescriptor(ALLOWED_SHAPES),
  giftVisualStyle: enumDescriptor(['', ...ALLOWED_VISUAL_STYLES]),
  colorMode: enumDescriptor(VALID_COLOR_MODES),
  resolutionPreset: enumDescriptor(VALID_RESOLUTION_PRESETS),
  orientation: enumDescriptor(VALID_ORIENTATIONS),
  giftPopupPosition: enumDescriptor(VALID_GIFT_POPUP_POSITIONS),
  finaleStyle: enumDescriptor(ALLOWED_FINALE_STYLES, CUSTOM_FINALE_STYLE_PATTERN),
  finaleLength: enumDescriptor(ALLOWED_FINALE_LENGTHS),
  superfanFinaleCooldown: enumDescriptor(SUPERFAN_FINALE_COOLDOWN_HOURS),
  superfanFinaleStyle: enumDescriptor(ALLOWED_SUPERFAN_FINALE_STYLES, CUSTOM_FINALE_STYLE_PATTERN),
  superfanFinaleLength: enumDescriptor(ALLOWED_SUPERFAN_FINALE_LENGTHS),
  endCardPosition: enumDescriptor(VALID_FOLLOWER_POSITIONS),
  endCardSize: enumDescriptor(VALID_FOLLOWER_SIZES),
  followerAnimationPosition: enumDescriptor(VALID_FOLLOWER_POSITIONS),
  followerAnimationStyle: enumDescriptor(VALID_FOLLOWER_STYLES),
  followerAnimationSize: enumDescriptor(VALID_FOLLOWER_SIZES),
  followerAnimationEntrance: enumDescriptor(VALID_FOLLOWER_ENTRANCES)
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
  superfanFinaleStyle: 'inherit',
  superfanFinaleLength: 'inherit',
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

function clampConfigNumber(field, value, fallback) {
  const { min, max } = CONFIG_LIMITS[field];
  return clampNumber(value, min, max, fallback);
}

function clampConfigInteger(field, value, fallback) {
  const { min, max } = CONFIG_LIMITS[field];
  return clampInteger(value, min, max, fallback);
}

function normalizeBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function normalizeChatKeywords(value, fallback = DEFAULT_FIREWORKS_CONFIG.chatTriggerKeywords) {
  const input = Array.isArray(value) ? value : fallback;
  const seen = new Set();
  const keywords = [];
  for (const item of input) {
    const keyword = typeof item === 'string' ? item.trim() : '';
    const identity = keyword.toLocaleLowerCase('en-US');
    if (!keyword || seen.has(identity)) continue;
    seen.add(identity);
    keywords.push(keyword);
    if (keywords.length === 20) break;
  }
  return keywords;
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
    duration: clampConfigInteger('superfanEndCardDuration', value.duration, 3000),
    position: CONFIG_ENUMS.endCardPosition.values.includes(value.position) ? value.position : 'center',
    size: CONFIG_ENUMS.endCardSize.values.includes(value.size) ? value.size : 'medium',
    scale: clampConfigNumber('superfanEndCardScale', value.scale, 1),
    style: CONFIG_ENUMS.followerAnimationStyle.values.includes(value.style) ? value.style : 'gradient-purple',
    entrance: CONFIG_ENUMS.followerAnimationEntrance.values.includes(value.entrance) ? value.entrance : 'scale'
  };
}

function normalizeShape(value, fallback = DEFAULT_FIREWORKS_CONFIG.defaultShape) {
  return CONFIG_ENUMS.shape.values.includes(value) ? value : fallback;
}

function normalizeVisualStyle(value, fallback = DEFAULT_FIREWORKS_CONFIG.visualStyle) {
  return ALLOWED_VISUAL_STYLES.includes(value) ? value : fallback;
}

function normalizeFinaleStyle(value, fallback = DEFAULT_FIREWORKS_CONFIG.goalFinaleStyle) {
  if (CONFIG_ENUMS.finaleStyle.values.includes(value)) return value;
  return isCustomFinaleStyleId(value) ? value.toLowerCase() : fallback;
}

function isCustomFinaleStyleId(value) {
  return typeof value === 'string' && CUSTOM_FINALE_STYLE_PATTERN.test(value);
}

function normalizeFinaleLength(value, fallback = DEFAULT_FIREWORKS_CONFIG.goalFinaleLength) {
  return CONFIG_ENUMS.finaleLength.values.includes(value) ? value : fallback;
}

function normalizeSuperfanFinaleStyle(value, fallback = DEFAULT_FIREWORKS_CONFIG.superfanFinaleStyle) {
  if (CONFIG_ENUMS.superfanFinaleStyle.values.includes(value)) return value;
  if (isCustomFinaleStyleId(value)) return value.toLowerCase();
  return fallback;
}

function normalizeSuperfanFinaleLength(value, fallback = DEFAULT_FIREWORKS_CONFIG.superfanFinaleLength) {
  return CONFIG_ENUMS.superfanFinaleLength.values.includes(value) ? value : fallback;
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
  return CONFIG_ENUMS.resolutionPreset.values.includes(value) ? value : fallback;
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
  const targetFps = clampInteger(
    source.targetFps,
    CONFIG_LIMITS.targetFps.min,
    CONFIG_LIMITS.targetFps.max,
    defaults.targetFps
  );
  const minFps = Math.min(targetFps, clampInteger(
    source.minFps,
    CONFIG_LIMITS.minFps.min,
    CONFIG_LIMITS.minFps.max,
    defaults.minFps
  ));
  const minTargetFps = Math.min(targetFps, clampInteger(
    source.minTargetFps,
    CONFIG_LIMITS.minTargetFps.min,
    CONFIG_LIMITS.minTargetFps.max,
    defaults.minTargetFps
  ));
  const requestedInternalMin = normalizePreset(source.internalMinResolutionPreset, defaults.internalMinResolutionPreset);
  const requestedInternalMax = normalizePreset(source.internalMaxResolutionPreset, defaults.internalMaxResolutionPreset);
  const internalBounds = [requestedInternalMin, requestedInternalMax]
    .sort((a, b) => VALID_RESOLUTION_PRESETS.indexOf(a) - VALID_RESOLUTION_PRESETS.indexOf(b));

  return {
    ...defaults,
    enabled: normalizeBoolean(source.enabled, defaults.enabled),
    // This plugin has no alternate backend. Legacy cloned values migrate here.
    renderer: 'webgpu',
    visualStyle: normalizeVisualStyle(source.visualStyle, defaults.visualStyle),
    maxParticles: clampConfigInteger('maxParticles', source.maxParticles, defaults.maxParticles),
    targetFps,
    giftTriggersEnabled: normalizeBoolean(source.giftTriggersEnabled, defaults.giftTriggersEnabled),
    minGiftCoins: clampInteger(source.minGiftCoins, 0, 1000000, defaults.minGiftCoins),
    comboEnabled: normalizeBoolean(source.comboEnabled, defaults.comboEnabled),
    comboTimeout: clampConfigInteger('comboTimeout', source.comboTimeout, defaults.comboTimeout),
    comboMultiplierBase: clampNumber(source.comboMultiplierBase, 1, 5, defaults.comboMultiplierBase),
    comboMaxMultiplier: clampConfigNumber('comboMaxMultiplier', source.comboMaxMultiplier, defaults.comboMaxMultiplier),
    escalationEnabled: normalizeBoolean(source.escalationEnabled, defaults.escalationEnabled),
    escalationThresholds: normalizeThresholds(source.escalationThresholds),
    particleCount: normalizeParticleCounts(source.particleCount),
    shapesEnabled: normalizeBoolean(source.shapesEnabled, defaults.shapesEnabled),
    defaultShape: normalizeShape(source.defaultShape, defaults.defaultShape),
    randomShapeEnabled: normalizeBoolean(source.randomShapeEnabled, defaults.randomShapeEnabled),
    activeShapes: normalizeShapeArray(source.activeShapes),
    giftShapeMappings: normalizeGiftShapeMappings(source.giftShapeMappings),
    userAvatarEnabled: normalizeBoolean(source.userAvatarEnabled, defaults.userAvatarEnabled),
    avatarParticleChance: clampConfigNumber('avatarParticleChance', source.avatarParticleChance, defaults.avatarParticleChance),
    audioEnabled: normalizeBoolean(source.audioEnabled, defaults.audioEnabled),
    rocketSound: normalizeAudioPath(source.rocketSound, defaults.rocketSound),
    explosionSound: normalizeAudioPath(source.explosionSound, defaults.explosionSound),
    audioVolume: clampConfigNumber('audioVolume', source.audioVolume, defaults.audioVolume),
    crackleFrequency: clampConfigNumber('crackleFrequency', source.crackleFrequency, defaults.crackleFrequency),
    crackleVolume: clampConfigNumber('crackleVolume', source.crackleVolume, defaults.crackleVolume),
    colorMode: CONFIG_ENUMS.colorMode.values.includes(source.colorMode) ? source.colorMode : defaults.colorMode,
    themeColors: normalizeColorArray(source.themeColors, defaults.themeColors),
    goalFinaleEnabled: normalizeBoolean(source.goalFinaleEnabled, defaults.goalFinaleEnabled),
    goalFinaleIntensity: clampConfigNumber('goalFinaleIntensity', source.goalFinaleIntensity, defaults.goalFinaleIntensity),
    goalFinaleStyle: normalizeFinaleStyle(source.goalFinaleStyle, defaults.goalFinaleStyle),
    goalFinaleLength: normalizeFinaleLength(source.goalFinaleLength, defaults.goalFinaleLength),
    goalFinaleDuration: clampInteger(source.goalFinaleDuration, 250, 30000, defaults.goalFinaleDuration),
    superfanFinaleEnabled: normalizeBoolean(source.superfanFinaleEnabled, defaults.superfanFinaleEnabled),
    superfanFinaleCooldownHours: CONFIG_ENUMS.superfanFinaleCooldown.values.includes(String(Number(source.superfanFinaleCooldownHours)))
      ? Number(source.superfanFinaleCooldownHours)
      : defaults.superfanFinaleCooldownHours,
    superfanFinaleIntensity: clampConfigNumber('superfanFinaleIntensity', source.superfanFinaleIntensity, defaults.superfanFinaleIntensity),
    superfanFinaleStyle: normalizeSuperfanFinaleStyle(source.superfanFinaleStyle, defaults.superfanFinaleStyle),
    superfanFinaleLength: normalizeSuperfanFinaleLength(source.superfanFinaleLength, defaults.superfanFinaleLength),
    superfanEndCardDuration: clampConfigInteger('superfanEndCardDuration', source.superfanEndCardDuration, defaults.superfanEndCardDuration),
    superfanEndCardPosition: CONFIG_ENUMS.endCardPosition.values.includes(source.superfanEndCardPosition)
      ? source.superfanEndCardPosition
      : defaults.superfanEndCardPosition,
    superfanEndCardSize: CONFIG_ENUMS.endCardSize.values.includes(source.superfanEndCardSize)
      ? source.superfanEndCardSize
      : defaults.superfanEndCardSize,
    superfanEndCardScale: clampConfigNumber('superfanEndCardScale', source.superfanEndCardScale, defaults.superfanEndCardScale),
    followerFireworksEnabled: normalizeBoolean(source.followerFireworksEnabled, defaults.followerFireworksEnabled),
    followerRocketCount: clampConfigInteger('followerRocketCount', source.followerRocketCount, defaults.followerRocketCount),
    followerShowAnimation: normalizeBoolean(source.followerShowAnimation, defaults.followerShowAnimation),
    followerShowProfilePicture: normalizeBoolean(source.followerShowProfilePicture, defaults.followerShowProfilePicture),
    followerAnimationDuration: clampConfigInteger('followerAnimationDuration', source.followerAnimationDuration, defaults.followerAnimationDuration),
    followerAnimationDelay: clampConfigInteger('followerAnimationDelay', source.followerAnimationDelay, defaults.followerAnimationDelay),
    followerAnimationPosition: CONFIG_ENUMS.followerAnimationPosition.values.includes(source.followerAnimationPosition) ? source.followerAnimationPosition : defaults.followerAnimationPosition,
    followerAnimationSize: CONFIG_ENUMS.followerAnimationSize.values.includes(source.followerAnimationSize) ? source.followerAnimationSize : defaults.followerAnimationSize,
    followerAnimationScale: clampConfigNumber('followerAnimationScale', source.followerAnimationScale, defaults.followerAnimationScale),
    followerAnimationStyle: CONFIG_ENUMS.followerAnimationStyle.values.includes(source.followerAnimationStyle) ? source.followerAnimationStyle : defaults.followerAnimationStyle,
    followerAnimationEntrance: CONFIG_ENUMS.followerAnimationEntrance.values.includes(source.followerAnimationEntrance) ? source.followerAnimationEntrance : defaults.followerAnimationEntrance,
    followerThankYouText: typeof source.followerThankYouText === 'string' ? source.followerThankYouText.slice(0, 120) : defaults.followerThankYouText,
    interactiveEnabled: normalizeBoolean(source.interactiveEnabled, defaults.interactiveEnabled),
    clickTriggerEnabled: normalizeBoolean(source.clickTriggerEnabled, defaults.clickTriggerEnabled),
    chatTriggerEnabled: normalizeBoolean(source.chatTriggerEnabled, defaults.chatTriggerEnabled),
    chatTriggerKeywords: normalizeChatKeywords(source.chatTriggerKeywords),
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
    internalMaxResolutionPreset: internalBounds[1],
    internalMinResolutionPreset: internalBounds[0],
    orientation: CONFIG_ENUMS.orientation.values.includes(source.orientation) ? source.orientation : defaults.orientation,
    adaptiveRenderScaleEnabled: normalizeBoolean(source.adaptiveRenderScaleEnabled, defaults.adaptiveRenderScaleEnabled),
    minRenderScale: clampNumber(source.minRenderScale, 0.25, 1, defaults.minRenderScale),
    minFps,
    despawnFadeDuration: clampConfigNumber('despawnFadeDuration', source.despawnFadeDuration, defaults.despawnFadeDuration),
    giftPopupEnabled: normalizeBoolean(source.giftPopupEnabled, defaults.giftPopupEnabled),
    giftPopupPosition: CONFIG_ENUMS.giftPopupPosition.values.includes(source.giftPopupPosition) ? source.giftPopupPosition : defaults.giftPopupPosition,
    queueEnabled: normalizeBoolean(source.queueEnabled, defaults.queueEnabled),
    maxRocketsPerSecond: clampConfigInteger('maxRocketsPerSecond', source.maxRocketsPerSecond, defaults.maxRocketsPerSecond),
    maxConcurrentFireworks: clampConfigInteger('maxConcurrentFireworks', source.maxConcurrentFireworks, defaults.maxConcurrentFireworks),
    maxTotalParticles: clampConfigInteger('maxTotalParticles', source.maxTotalParticles, defaults.maxTotalParticles),
    emergencyCleanupThreshold: clampConfigInteger('emergencyCleanupThreshold', source.emergencyCleanupThreshold, defaults.emergencyCleanupThreshold),
    adaptivePerformance: normalizeBoolean(source.adaptivePerformance, defaults.adaptivePerformance),
    minTargetFps,
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
  CONFIG_ENUMS,
  CONFIG_LIMITS,
  DEFAULT_FIREWORKS_CONFIG,
  FINALE_DURATION_BY_LENGTH,
  SUPERFAN_FINALE_COOLDOWN_HOURS,
  clampInteger,
  clampNumber,
  finaleLengthFromDuration,
  isCustomFinaleStyleId,
  normalizeCompletionNotification,
  normalizeChatKeywords,
  normalizeConfig,
  normalizeFinaleLength,
  normalizeFinaleRequest,
  normalizeFinaleStyle,
  normalizeSuperfanFinaleLength,
  normalizeSuperfanFinaleStyle,
  normalizeFireworkTrigger,
  normalizeGiftMapping,
  normalizePosition,
  normalizeShape,
  normalizeVisualStyle
};
