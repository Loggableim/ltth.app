const DEFAULT_OSC_BRIDGE_CONFIG = {
  enabled: false,
  sendHost: '127.0.0.1',
  sendPort: 9000,
  receivePort: 9001,
  verboseMode: false,
  autoRetryOnError: false,
  retryDelay: 5000,
  maxPacketSize: 65536,
  giftMappings: [],
  avatars: [],
  favorites: {
    avatars: [],
    maxFavorites: 10
  },
  messageBatching: {
    enabled: true,
    batchWindow: 10
  },
  parameterCaching: {
    enabled: true,
    ttl: 5000
  },
  rateLimiting: {
    enabled: true,
    maxPerSecond: 100
  },
  oscQuery: {
    enabled: false,
    host: '127.0.0.1',
    port: 9001,
    autoSubscribe: true,
    scanStartPort: 9000,
    scanEndPort: 9020,
    timeout: 1000
  },
  liveMonitoring: {
    enabled: false,
    updateInterval: 100,
    historyDuration: 60000
  },
  physBones: {
    enabled: false,
    bones: []
  },
  chatbox: {
    enabled: false,
    mirrorTikTokChat: false,
    prefix: '[TikTok]',
    showTyping: true,
    notificationSound: false
  },
  chatCommands: {
    enabled: true,
    requireOSCConnection: true,
    cooldownSeconds: 3,
    rateLimitPerMinute: 10,
    commands: createDefaultCommands(),
    avatarSwitch: {
      enabled: false,
      cooldownType: 'global',
      cooldownSeconds: 60,
      permission: 'subscriber'
    }
  }
};

function createDefaultCommands() {
  return [
    {
      id: 'wave',
      name: 'wave',
      description: 'Trigger wave animation',
      syntax: '/wave',
      permission: 'all',
      enabled: true,
      category: 'VRChat',
      actionType: 'predefined',
      action: 'wave'
    },
    {
      id: 'celebrate',
      name: 'celebrate',
      description: 'Trigger celebration animation',
      syntax: '/celebrate',
      permission: 'all',
      enabled: true,
      category: 'VRChat',
      actionType: 'predefined',
      action: 'celebrate'
    },
    {
      id: 'dance',
      name: 'dance',
      description: 'Trigger dance animation',
      syntax: '/dance',
      permission: 'subscriber',
      enabled: true,
      category: 'VRChat',
      actionType: 'predefined',
      action: 'dance'
    },
    {
      id: 'hearts',
      name: 'hearts',
      description: 'Trigger hearts effect',
      syntax: '/hearts',
      permission: 'all',
      enabled: true,
      category: 'VRChat',
      actionType: 'predefined',
      action: 'hearts'
    },
    {
      id: 'confetti',
      name: 'confetti',
      description: 'Trigger confetti effect',
      syntax: '/confetti',
      permission: 'all',
      enabled: true,
      category: 'VRChat',
      actionType: 'predefined',
      action: 'confetti'
    },
    {
      id: 'emote',
      name: 'emote',
      description: 'Trigger emote slot',
      syntax: '/emote <slot>',
      permission: 'subscriber',
      enabled: true,
      category: 'VRChat',
      actionType: 'predefined',
      action: 'emote',
      minArgs: 1,
      maxArgs: 1
    }
  ];
}

function normalizeConfig(config = {}) {
  const merged = deepMerge(DEFAULT_OSC_BRIDGE_CONFIG, config || {});

  merged.sendPort = normalizeInteger(merged.sendPort);
  merged.receivePort = normalizeInteger(merged.receivePort);
  merged.autoRetryOnError = false;
  merged.retryDelay = normalizeInteger(merged.retryDelay);
  merged.maxPacketSize = normalizeInteger(merged.maxPacketSize);
  merged.messageBatching.batchWindow = normalizeInteger(merged.messageBatching.batchWindow);
  merged.parameterCaching.ttl = normalizeInteger(merged.parameterCaching.ttl);
  merged.rateLimiting.maxPerSecond = normalizeInteger(merged.rateLimiting.maxPerSecond);
  merged.oscQuery.port = normalizeInteger(merged.oscQuery.port);
  merged.oscQuery.scanStartPort = normalizeInteger(merged.oscQuery.scanStartPort);
  merged.oscQuery.scanEndPort = normalizeInteger(merged.oscQuery.scanEndPort);
  merged.oscQuery.timeout = normalizeInteger(merged.oscQuery.timeout);
  merged.liveMonitoring.updateInterval = normalizeInteger(merged.liveMonitoring.updateInterval);
  merged.liveMonitoring.historyDuration = normalizeInteger(merged.liveMonitoring.historyDuration);
  merged.chatCommands.cooldownSeconds = normalizeInteger(merged.chatCommands.cooldownSeconds);
  merged.chatCommands.rateLimitPerMinute = normalizeInteger(merged.chatCommands.rateLimitPerMinute);
  merged.chatCommands.avatarSwitch.cooldownSeconds = normalizeInteger(merged.chatCommands.avatarSwitch.cooldownSeconds);

  if (!Array.isArray(merged.giftMappings)) merged.giftMappings = [];
  if (!Array.isArray(merged.avatars)) merged.avatars = [];
  delete merged.allowedIPs;
  if (!Array.isArray(merged.chatCommands.commands) || merged.chatCommands.commands.length === 0) {
    merged.chatCommands.commands = createDefaultCommands();
  }

  return merged;
}

function validateConfig(config) {
  const errors = [];

  if (!isNonEmptyString(config.sendHost)) {
    errors.push('sendHost must be a non-empty string');
  }
  if (!isValidPort(config.sendPort)) {
    errors.push('sendPort must be an integer between 1 and 65535');
  }
  if (!isValidPort(config.receivePort)) {
    errors.push('receivePort must be an integer between 1 and 65535');
  }
  if (config.oscQuery?.enabled) {
    if (!isNonEmptyString(config.oscQuery.host)) {
      errors.push('oscQuery.host must be a non-empty string');
    }
    if (!isValidPort(config.oscQuery.port)) {
      errors.push('oscQuery.port must be an integer between 1 and 65535');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

function deepMerge(base, override) {
  if (Array.isArray(base)) {
    return Array.isArray(override) ? clone(override) : clone(base);
  }

  if (!isPlainObject(base)) {
    return override === undefined ? clone(base) : clone(override);
  }

  const output = {};
  const keys = new Set([
    ...Object.keys(base),
    ...Object.keys(isPlainObject(override) ? override : {})
  ]);

  for (const key of keys) {
    const baseValue = base[key];
    const overrideValue = isPlainObject(override) || Array.isArray(override)
      ? override[key]
      : undefined;

    if (overrideValue === undefined) {
      output[key] = clone(baseValue);
    } else if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
      output[key] = deepMerge(baseValue, overrideValue);
    } else {
      output[key] = clone(overrideValue);
    }
  }

  return output;
}

function clone(value) {
  if (Array.isArray(value)) {
    return value.map(clone);
  }
  if (isPlainObject(value)) {
    return deepMerge(value, {});
  }
  return value;
}

function normalizeInteger(value) {
  const parsed = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : value;
}

function isValidPort(value) {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

module.exports = {
  DEFAULT_OSC_BRIDGE_CONFIG,
  createDefaultCommands,
  normalizeConfig,
  validateConfig,
  isValidPort,
  deepMerge
};
