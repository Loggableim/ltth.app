const WEATHER_EFFECTS = {
  rain: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, permanent: false, category: 'precipitation', layer: 50, opacity: 1, particleScale: 1, wind: 0, directionDeg: 0 },
  snow: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, permanent: false, category: 'precipitation', layer: 60, opacity: 1, particleScale: 1, wind: 0, directionDeg: 0 },
  storm: { enabled: true, defaultIntensity: 0.7, defaultDuration: 8000, permanent: false, category: 'precipitation', layer: 70, opacity: 1, particleScale: 1, wind: 0.35, directionDeg: 25 },
  fog: { enabled: true, defaultIntensity: 0.4, defaultDuration: 15000, permanent: false, category: 'atmosphere', layer: 10, opacity: 0.9, particleScale: 1, wind: 0, directionDeg: 0, fogColor: 'default' },
  thunder: { enabled: true, defaultIntensity: 0.8, defaultDuration: 5000, permanent: false, category: 'impact', layer: 95, opacity: 1, particleScale: 1, wind: 0, directionDeg: 0 },
  sunbeam: { enabled: true, defaultIntensity: 0.6, defaultDuration: 12000, permanent: false, category: 'light', layer: 20, opacity: 0.9, particleScale: 1, wind: 0, directionDeg: 0, colorTemperature: 'golden' },
  glitchclouds: { enabled: true, defaultIntensity: 0.7, defaultDuration: 8000, permanent: false, category: 'digital', layer: 100, opacity: 1, particleScale: 1, wind: 0, directionDeg: 0, glitchRgbShift: true, glitchDisplacement: true, glitchScanlines: true, glitchNoise: true, glitchBlocks: true, glitchChromaticAberration: true, glitchIntensity: 1 },
  aurora: { enabled: true, defaultIntensity: 0.5, defaultDuration: 15000, permanent: false, category: 'light', layer: 15, opacity: 0.9, particleScale: 1, wind: 0, directionDeg: 0 },
  fireflies: { enabled: true, defaultIntensity: 0.5, defaultDuration: 12000, permanent: false, category: 'ambient', layer: 65, opacity: 1, particleScale: 1, wind: 0, directionDeg: 0 },
  meteors: { enabled: true, defaultIntensity: 0.4, defaultDuration: 10000, permanent: false, category: 'impact', layer: 90, opacity: 1, particleScale: 1, wind: 0, directionDeg: 0 },
  sakura: { enabled: true, defaultIntensity: 0.5, defaultDuration: 12000, permanent: false, category: 'ambient', layer: 55, opacity: 1, particleScale: 1, wind: 0.1, directionDeg: 0 },
  embers: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, permanent: false, category: 'ambient', layer: 75, opacity: 1, particleScale: 1, wind: 0, directionDeg: 0 },
  heatwave: { enabled: true, defaultIntensity: 0.4, defaultDuration: 8000, permanent: false, category: 'atmosphere', layer: 25, opacity: 0.75, particleScale: 1, wind: 0, directionDeg: 0 }
};

function createDefaultGamificationState() {
  return {
    communityMeter: { current: 0, total: 0, lastUpdatedAt: 0, lastRewardAt: 0 },
    streaks: { current: 0, best: 0, lastEventAt: 0, lastContributor: null, lastResetAt: 0 },
    quest: { active: null, rotationIndex: 0, completedCount: 0, lastCompletedAt: 0 },
    rewards: { history: [], firedThresholds: [] },
    lastBroadcastAt: 0
  };
}

function createClassicWeatherDefaults() {
  return {
    enabled: true,
    apiKey: '',
    useGlobalAuth: true,
    rateLimitPerMinute: 10,
    qualityPreset: 'high',
    adaptiveQuality: true,
    maxConcurrentEffects: 5,
    effectLayerOrder: ['fog', 'sunbeam', 'aurora', 'heatwave', 'rain', 'snow', 'storm', 'fireflies', 'sakura', 'embers', 'meteors', 'thunder', 'glitchclouds'],
    audio: {
      enabled: false,
      volume: 0.45,
      effects: {
        rain: { enabled: false, volume: 0.35 },
        storm: { enabled: false, volume: 0.5 },
        thunder: { enabled: false, volume: 0.7 },
        embers: { enabled: false, volume: 0.35 },
        heatwave: { enabled: false, volume: 0.25 }
      }
    },
    triggerEvents: {
      follow: { enabled: false, action: 'sakura', intensity: 0.5, duration: 8000 },
      share: { enabled: false, action: 'fireflies', intensity: 0.5, duration: 8000 },
      subscribe: { enabled: false, action: 'sunbeam', intensity: 0.7, duration: 10000 },
      likeMilestone: { enabled: false, interval: 1000, action: 'meteors', intensity: 0.5, duration: 8000 }
    },
    chatCommands: {
      enabled: true,
      requirePermission: true,
      allowIntensityControl: false,
      allowDurationControl: false,
      commandNames: { weather: 'weather', weatherlist: 'weatherlist', weatherstop: 'weatherstop' }
    },
    permissions: {
      enabled: true,
      allowAll: false,
      allowedGroups: { followers: true, superfans: true, subscribers: true, teamMembers: true, minTeamLevel: 1 },
      allowedUsers: [],
      topGifterThreshold: 10,
      minPoints: 0
    },
    gamification: {
      enabled: true,
      communityMeter: { enabled: true, max: 100, carryOver: true, showOnOverlay: true, rewardBoostMultiplier: 1.2, contributionWeights: { chat: 1, like: 0.02, follow: 15, share: 10, subscribe: 20, gift: 0.05, weatherReward: 5 } },
      quests: {
        enabled: true,
        oneActivePerStream: true,
        rotateOnCompletion: true,
        rotationIntervalMs: 900000,
        streakWindowMs: 60000,
        showOnOverlay: true,
        pool: [
          { id: 'community-chat', title: 'Community Voice', type: 'chat_count', target: 10, eventTypes: ['chat'], reward: { action: 'rain', intensity: 0.35, duration: 8000 } },
          { id: 'supporter-surge', title: 'Supporter Surge', type: 'gift_count', target: 3, eventTypes: ['gift'], reward: { action: 'storm', intensity: 0.7, duration: 10000 } },
          { id: 'hot-streak', title: 'Hot Streak', type: 'streak_chain', target: 5, eventTypes: ['chat', 'like', 'gift', 'follow', 'share', 'subscribe'], reward: { action: 'thunder', intensity: 0.9, duration: 5000 } },
          { id: 'meter-surge', title: 'Meter Surge', type: 'meter_fill', target: 100, eventTypes: ['meter'], reward: { action: 'meteors', intensity: 0.55, duration: 9000 } }
        ]
      },
      streaks: { enabled: true, windowMs: 60000, resetAfterMs: 180000, bonusThreshold: 5, bonusMultiplier: 1.1, showOnOverlay: true },
      rewards: {
        enabled: true,
        cooldownMs: 30000,
        carryOver: true,
        historyLimit: 10,
        thresholds: [
          { meter: 25, action: 'rain', intensity: 0.35, duration: 8000, label: 'Sprinkle' },
          { meter: 50, action: 'snow', intensity: 0.45, duration: 9000, label: 'Blizzard' },
          { meter: 75, action: 'storm', intensity: 0.75, duration: 10000, label: 'Squall' },
          { meter: 100, action: 'thunder', intensity: 0.95, duration: 5000, label: 'Tempest' }
        ]
      },
      overlay: { enabled: true, showMeter: true, showQuest: true, showStreak: true, showRewardFeed: true },
      state: createDefaultGamificationState()
    },
    presets: [
      { name: 'Cozy Rain', effects: { rain: { defaultIntensity: 0.45, defaultDuration: 12000, opacity: 0.85, wind: 0.1 } } },
      { name: 'Boss Storm', effects: { storm: { defaultIntensity: 0.9, defaultDuration: 10000, opacity: 1, wind: 0.45 }, thunder: { defaultIntensity: 0.85, defaultDuration: 6000 } } },
      { name: 'Winter Chill', effects: { snow: { defaultIntensity: 0.65, defaultDuration: 16000, opacity: 0.95, wind: -0.1 }, fog: { defaultIntensity: 0.35, defaultDuration: 12000, fogColor: 'ice' } } },
      { name: 'Cyber Glitch', effects: { glitchclouds: { defaultIntensity: 0.85, defaultDuration: 8000, opacity: 1 }, meteors: { defaultIntensity: 0.45, defaultDuration: 7000 } } }
    ],
    sequences: [
      {
        name: 'Storm Build',
        steps: [
          { action: 'fog', delay: 0, intensity: 0.35, duration: 8000 },
          { action: 'rain', delay: 2000, intensity: 0.55, duration: 10000 },
          { action: 'thunder', delay: 5500, intensity: 0.8, duration: 5000 }
        ]
      }
    ],
    effects: WEATHER_EFFECTS
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clone(value) {
  if (Array.isArray(value)) {
    return value.map(clone);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)]));
  }
  return value;
}

function mergeConfig(base, incoming) {
  const result = clone(base);
  if (!isPlainObject(incoming)) {
    return result;
  }

  Object.entries(incoming).forEach(([key, value]) => {
    if (isPlainObject(result[key])) {
      if (isPlainObject(value)) {
        result[key] = mergeConfig(result[key], value);
      }
      return;
    }
    if (Array.isArray(result[key])) {
      if (Array.isArray(value)) {
        result[key] = clone(value);
      }
      return;
    }
    result[key] = clone(value);
  });
  return result;
}

function generateFreshApiKey(generateApiKey) {
  if (typeof generateApiKey === 'function') {
    const generated = generateApiKey();
    if (typeof generated === 'string' && generated.length > 0) {
      return generated;
    }
  }
  return `webgpu_weather_${Date.now().toString(36)}`;
}

function createInitialWebgpuWeatherConfig(classicConfig, generateApiKey) {
  const config = mergeConfig(createClassicWeatherDefaults(), classicConfig);

  config.enabled = false;
  config.apiKey = generateFreshApiKey(generateApiKey);
  config.qualityPreset = 'auto';
  config.adaptiveQuality = true;
  config.chatCommands = {
    ...config.chatCommands,
    commandNames: {
      weather: 'wgweather',
      weatherlist: 'wgweatherlist',
      weatherstop: 'wgweatherstop'
    }
  };
  config.gamification = {
    ...config.gamification,
    enabled: false,
    overlay: {
      ...config.gamification.overlay,
      enabled: false
    },
    state: createDefaultGamificationState()
  };

  return config;
}

module.exports = {
  createInitialWebgpuWeatherConfig
};
