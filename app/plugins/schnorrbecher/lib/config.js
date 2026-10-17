const DEFAULT_GIFT_SIZES = Object.freeze({
  giftSize1: 32,
  giftSize2To10: 40,
  giftSize11To29: 50,
  giftSize30To99: 62,
  giftSize100To199: 76,
  giftSize200To499: 92,
  giftSize500To999: 110,
  giftSize1000To1999: 132,
  giftSize2000To4999: 158,
  giftSize5000Plus: 180
});

const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  jarStyle: 'classic',
  jarWidth: 460,
  jarHeight: 580,
  jarX: 50,
  jarY: 82,
  iconScale: 1,
  ...DEFAULT_GIFT_SIZES,
  maxPhysicalIcons: 300,
  spawnMultiplier: 1,
  spawnDelayMs: 80,
  showCounter: true,
  showGiftPopup: true,
  showSenderName: true,
  showGiftImage: true,
  counterLabel: 'Gifts',
  jarLabel: 'Schnorr Becher',
  persistenceMode: 'session',
  resetOnNewStream: true,
  physicsEnabled: true,
  soundEnabled: false,
  soundVolume: 0.35,
  jarBorderColor: '#f6d365',
  jarOpacity: 0.22,
  counterFontFamily: 'Arial, sans-serif',
  counterFontSize: 42,
  counterColor: '#ffffff',
  requireResetConfirmation: true
});

const DEFAULT_STATE = Object.freeze({
  sessionId: null,
  totalCoinValue: 0,
  visualCoinCount: 0,
  recentGifts: [],
  lastProcessedEventIds: [],
  updatedAt: 0
});

function clamp(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeText(value, fallback, maximum = 120) {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maximum) || fallback;
}

function normalizeJarStyle(value) {
  return ['classic', 'mason', 'arcade'].includes(value) ? value : DEFAULT_CONFIG.jarStyle;
}

function normalizeRecentGifts(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const gifts = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const giftImage = typeof candidate.giftImage === 'string' ? candidate.giftImage.trim() : '';
    const giftId = String(candidate.giftId || '').slice(0, 160);
    const giftName = typeof candidate.giftName === 'string' ? candidate.giftName.slice(0, 160) : 'Gift';
    const key = `${giftId}:${giftImage}`;
    if (seen.has(key)) continue;
    seen.add(key);
    gifts.push({ giftId, giftName, giftImage });
  }
  return gifts.slice(-24);
}

function normalizeConfig(input = {}) {
  const giftSizes = Object.fromEntries(Object.entries(DEFAULT_GIFT_SIZES)
    .map(([key, fallback]) => [key, Math.round(clamp(input[key], fallback, 16, 240))]));
  return {
    ...DEFAULT_CONFIG,
    ...input,
    ...giftSizes,
    enabled: normalizeBoolean(input.enabled, DEFAULT_CONFIG.enabled),
    jarStyle: normalizeJarStyle(input.jarStyle),
    jarWidth: Math.round(clamp(input.jarWidth, DEFAULT_CONFIG.jarWidth, 160, 1600)),
    jarHeight: Math.round(clamp(input.jarHeight, DEFAULT_CONFIG.jarHeight, 140, 1400)),
    jarX: clamp(input.jarX, DEFAULT_CONFIG.jarX, 0, 100),
    jarY: clamp(input.jarY, DEFAULT_CONFIG.jarY, 0, 100),
    iconScale: clamp(input.iconScale, DEFAULT_CONFIG.iconScale, 0.25, 3),
    maxPhysicalIcons: Math.round(clamp(input.maxPhysicalIcons, DEFAULT_CONFIG.maxPhysicalIcons, 20, 3000)),
    spawnMultiplier: clamp(input.spawnMultiplier, DEFAULT_CONFIG.spawnMultiplier, 0.1, 5),
    spawnDelayMs: Math.round(clamp(input.spawnDelayMs, DEFAULT_CONFIG.spawnDelayMs, 20, 1000)),
    showCounter: normalizeBoolean(input.showCounter, DEFAULT_CONFIG.showCounter),
    showGiftPopup: normalizeBoolean(input.showGiftPopup, DEFAULT_CONFIG.showGiftPopup),
    showSenderName: normalizeBoolean(input.showSenderName, DEFAULT_CONFIG.showSenderName),
    showGiftImage: normalizeBoolean(input.showGiftImage, DEFAULT_CONFIG.showGiftImage),
    counterLabel: normalizeText(input.counterLabel, DEFAULT_CONFIG.counterLabel),
    jarLabel: normalizeText(input.jarLabel, DEFAULT_CONFIG.jarLabel),
    persistenceMode: input.persistenceMode === 'persistent' ? 'persistent' : 'session',
    resetOnNewStream: normalizeBoolean(input.resetOnNewStream, DEFAULT_CONFIG.resetOnNewStream),
    // Physics is now always active. Keep the field for old stored configs and
    // external callers, but migrate every legacy false value to the only
    // supported mode.
    physicsEnabled: true,
    soundEnabled: normalizeBoolean(input.soundEnabled, DEFAULT_CONFIG.soundEnabled),
    soundVolume: clamp(input.soundVolume, DEFAULT_CONFIG.soundVolume, 0, 1),
    jarBorderColor: normalizeText(input.jarBorderColor, DEFAULT_CONFIG.jarBorderColor, 32),
    jarOpacity: clamp(input.jarOpacity, DEFAULT_CONFIG.jarOpacity, 0, 1),
    counterFontFamily: normalizeText(input.counterFontFamily, DEFAULT_CONFIG.counterFontFamily, 160),
    counterFontSize: Math.round(clamp(input.counterFontSize, DEFAULT_CONFIG.counterFontSize, 12, 160)),
    counterColor: normalizeText(input.counterColor, DEFAULT_CONFIG.counterColor, 32),
    requireResetConfirmation: normalizeBoolean(input.requireResetConfirmation, DEFAULT_CONFIG.requireResetConfirmation)
  };
}

function normalizeState(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    sessionId: typeof source.sessionId === 'string' ? source.sessionId.slice(0, 240) : null,
    totalCoinValue: Math.max(0, Number(source.totalCoinValue) || 0),
    visualCoinCount: Math.max(0, Math.floor(Number(source.visualCoinCount) || 0)),
    recentGifts: normalizeRecentGifts(source.recentGifts),
    lastProcessedEventIds: Array.isArray(source.lastProcessedEventIds)
      ? source.lastProcessedEventIds.filter(value => typeof value === 'string').slice(-5000)
      : [],
    updatedAt: Math.max(0, Number(source.updatedAt) || 0)
  };
}

module.exports = {
  DEFAULT_GIFT_SIZES,
  DEFAULT_CONFIG,
  DEFAULT_STATE,
  normalizeConfig,
  normalizeState
};
