(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ClarityHUDSettingsSchema = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const VERSION = '1.1.0';
  const DOCKS = ['chat', 'full', 'multi', 'stream'];

  const DEFAULT_CHAT_SETTINGS = {
    fontSize: '48px',
    fontFamily: 'Exo 2',
    fontColor: '#FFFFFF',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    lineHeight: '1.6',
    letterSpacing: '0.5px',
    align: 'left',
    showTimestamps: false,
    maxLines: 10,
    outlineThickness: '2px',
    outlineColor: '#000000',
    wrapLongWords: true,
    mode: 'day',
    highContrastMode: false,
    colorblindSafeMode: false,
    reduceMotion: false,
    dyslexiaFont: false,
    accessibilityPreset: 'default',
    opacity: 1,
    keepOnTop: false,
    transparency: 100,
    emojiRenderMode: 'image',
    badgeSize: 'medium',
    teamLevelStyle: 'icon-glow',
    showTeamLevel: true,
    showModerator: true,
    showSubscriber: true,
    showGifter: true,
    showFanClub: true,
    useVirtualScrolling: true,
    usernameColorByTeamLevel: true
  };

  const DEFAULT_FULL_SETTINGS = {
    ...DEFAULT_CHAT_SETTINGS,
    showChat: true,
    showFollows: true,
    showShares: true,
    showLikes: true,
    showGifts: true,
    showSubs: true,
    showTreasureChests: true,
    showJoins: true,
    layoutMode: 'singleStream',
    feedDirection: 'newestTop',
    animationIn: 'fadeSlideIn',
    animationOut: 'fadeSlideOut',
    animationSpeed: 'medium',
    lineHeight: 1.2,
    opacity: 1,
    keepOnTop: false,
    showGiftImages: false,
    giftImageSize: 'medium',
    giftStreakMode: 'immediate',
    likeAggregationWindowMs: 5000,
    likeAggregationMinCount: 1,
    useVirtualScrolling: true
  };

  const DEFAULT_STREAM_SETTINGS = {
    orientation: 'landscape',
    showChat: false,
    showFollows: true,
    showShares: true,
    showLikes: false,
    showGifts: true,
    showSubs: true,
    showTreasureChests: true,
    showJoins: false,
    slotChat: 'slot-right-rail',
    slotFollow: 'slot-bottom-right',
    slotShare: 'slot-bottom-right',
    slotLike: 'slot-bottom-right',
    slotGift: 'slot-top-center',
    slotSub: 'slot-top-center',
    slotTreasure: 'slot-top-center',
    slotJoin: 'slot-bottom-right',
    highlightGiftThreshold: 100,
    highlightAlwaysSub: true,
    highlightAlwaysTreasure: true,
    ttlChat: 8000,
    ttlFollow: 7000,
    ttlShare: 7000,
    ttlLike: 5000,
    ttlGift: 9000,
    ttlSub: 10000,
    ttlTreasure: 10000,
    ttlJoin: 4000,
    animIn: 'auto',
    animOut: 'auto',
    reduceMotion: false,
    opacity: 1,
    dyslexiaFont: false,
    tickerEnabled: false,
    tickerSpeed: 60,
    tickerLabel: 'LIVE'
  };

  const DEFAULT_MULTI_SETTINGS = {
    enabled: false,
    streams: [
      {
        enabled: false,
        username: '',
        displayName: '',
        textColor: '#00D4FF',
        bgColor: '#1E3A8A',
        accentColor: '#60A5FA'
      },
      {
        enabled: false,
        username: '',
        displayName: '',
        textColor: '#A78BFA',
        bgColor: '#581C87',
        accentColor: '#C084FC'
      },
      {
        enabled: false,
        username: '',
        displayName: '',
        textColor: '#FBBF24',
        bgColor: '#78350F',
        accentColor: '#FCD34D'
      }
    ],
    layout: 'mixed',
    columns: 'auto',
    primarySpan2: false,
    messageStyle: 'stripe',
    density: 'compact',
    showAvatars: false,
    showTimestamps: false,
    highlightPrimary: true,
    primaryOpacity: 1.2,
    maxMessages: 300,
    autoContrast: true,
    pulseOnNew: false,
    reconnectMaxAttempts: 3,
    reconnectBaseDelayMs: 2000
  };

  const DEFAULT_SETTINGS = {
    chat: DEFAULT_CHAT_SETTINGS,
    full: DEFAULT_FULL_SETTINGS,
    multi: DEFAULT_MULTI_SETTINGS,
    stream: DEFAULT_STREAM_SETTINGS
  };

  const BUILTIN_PRESETS = [
    {
      id: 'vrchat-readable',
      name: 'VRChat Readable',
      description: 'Large type, high contrast, low motion, and compact multi-stream layout.',
      settings: {
        chat: {
          fontSize: '54px',
          lineHeight: '1.7',
          highContrastMode: true,
          reduceMotion: true,
          maxLines: 8
        },
        full: {
          fontSize: '34px',
          maxLines: 24,
          reduceMotion: true,
          likeAggregationWindowMs: 5000,
          giftStreakMode: 'finalOnly'
        },
        multi: {
          enabled: true,
          layout: 'mixed',
          density: 'compact',
          showAvatars: false,
          pulseOnNew: false,
          maxMessages: 300
        },
        stream: {
          reduceMotion: true,
          showLikes: false,
          tickerEnabled: false
        }
      }
    },
    {
      id: 'obs-clean',
      name: 'OBS Clean',
      description: 'Transparent broadcast overlay with fewer alerts and a readable ticker.',
      settings: {
        stream: {
          showChat: false,
          showFollows: true,
          showShares: true,
          showLikes: false,
          showGifts: true,
          tickerEnabled: true,
          tickerSpeed: 55,
          tickerLabel: 'LIVE'
        },
        full: {
          showJoins: false,
          showLikes: true,
          likeAggregationWindowMs: 4000
        }
      }
    },
    {
      id: 'high-activity',
      name: 'High Activity',
      description: 'Aggressive aggregation and final gift streak display for busy streams.',
      settings: {
        full: {
          maxLines: 35,
          showJoins: false,
          likeAggregationWindowMs: 3000,
          likeAggregationMinCount: 5,
          giftStreakMode: 'finalOnly'
        },
        chat: {
          useVirtualScrolling: true,
          maxLines: 40
        },
        multi: {
          maxMessages: 500,
          pulseOnNew: false
        }
      }
    }
  ];

  const ENUMS = {
    align: ['left', 'center', 'right'],
    mode: ['day', 'night', 'contrast', 'vision-impaired', 'cid'],
    accessibilityPreset: ['default', 'none', 'highContrast', 'visionImpaired', 'dyslexiaFriendly', 'motionSensitive', 'vr-optimized', 'low-vision', 'colorblind', 'dyslexia'],
    emojiRenderMode: ['image', 'unicode'],
    badgeSize: ['small', 'medium', 'large'],
    teamLevelStyle: ['icon-color', 'icon-glow', 'number-only'],
    layoutMode: ['singleStream', 'structured', 'adaptive'],
    feedDirection: ['newestTop', 'newestBottom', 'top', 'bottom'],
    animationIn: ['fade', 'slide', 'pop', 'zoom', 'fadeSlideIn', 'none', 'auto'],
    animationOut: ['fade', 'slide', 'pop', 'zoom', 'fadeSlideOut', 'none', 'auto'],
    animationSpeed: ['slow', 'medium', 'fast'],
    giftImageSize: ['small', 'medium', 'large'],
    giftStreakMode: ['immediate', 'finalOnly'],
    orientation: ['landscape', 'portrait'],
    layout: ['mixed', 'split'],
    columns: ['auto', '1', '2', '3'],
    messageStyle: ['stripe', 'badge', 'background'],
    density: ['ultra-compact', 'compact', 'comfortable']
  };

  const SLOT_VALUES = [
    'slot-right-rail',
    'slot-bottom-right',
    'slot-top-center',
    'slot-bottom-left',
    'slot-top-left',
    'slot-top-right',
    'slot-center',
    'slot-bottom-center'
  ];

  const NUMERIC_RANGES = {
    maxLines: [1, 500],
    transparency: [0, 100],
    opacity: [0, 2],
    primaryOpacity: [0, 3],
    maxMessages: [50, 1000],
    highlightGiftThreshold: [0, 1000000],
    ttlChat: [1000, 60000],
    ttlFollow: [1000, 60000],
    ttlShare: [1000, 60000],
    ttlLike: [1000, 60000],
    ttlGift: [1000, 60000],
    ttlSub: [1000, 60000],
    ttlTreasure: [1000, 60000],
    ttlJoin: [1000, 60000],
    tickerSpeed: [10, 300],
    likeAggregationWindowMs: [100, 30000],
    likeAggregationMinCount: [1, 10000],
    reconnectMaxAttempts: [0, 10],
    reconnectBaseDelayMs: [10, 60000]
  };

  const STRING_LIMITS = {
    fontFamily: 80,
    tickerLabel: 40
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function getDefaults(dock) {
    return clone(DEFAULT_SETTINGS[dock]);
  }

  function isCssLength(value) {
    return typeof value === 'string' && /^(\d{1,3}(\.\d+)?)(px|rem|em|%)$/.test(value.trim());
  }

  function isColor(value) {
    if (typeof value !== 'string') return false;
    const color = value.trim();
    return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color) ||
      /^rgba?\(\s*(\d{1,3}\s*,\s*){2}\d{1,3}(\s*,\s*(0|1|0?\.\d+))?\s*\)$/.test(color) ||
      color === 'transparent';
  }

  function isSafeString(value, maxLength) {
    return typeof value === 'string' && value.length <= maxLength && !/[<>]/.test(value);
  }

  function validateNumber(key, value, errors) {
    const range = NUMERIC_RANGES[key];
    if (!range) return true;
    if (typeof value !== 'number' || Number.isNaN(value) || value < range[0] || value > range[1]) {
      errors.push(`${key} must be a number between ${range[0]} and ${range[1]}`);
      return false;
    }
    return true;
  }

  function validateStream(stream, index, errors) {
    if (!isPlainObject(stream)) {
      errors.push(`streams[${index}] must be an object`);
      return null;
    }

    const allowed = new Set(['enabled', 'username', 'displayName', 'textColor', 'bgColor', 'accentColor']);
    const sanitized = {};

    Object.keys(stream).forEach((key) => {
      if (!allowed.has(key)) {
        errors.push(`streams[${index}].${key} is not a supported setting`);
      }
    });

    if (typeof stream.enabled !== 'undefined') {
      if (typeof stream.enabled !== 'boolean') {
        errors.push(`streams[${index}].enabled must be a boolean`);
      } else {
        sanitized.enabled = stream.enabled;
      }
    }

    if (typeof stream.username !== 'undefined') {
      if (typeof stream.username !== 'string' || !/^[a-zA-Z0-9_.]{0,32}$/.test(stream.username)) {
        errors.push(`streams[${index}].username must be a TikTok username`);
      } else {
        sanitized.username = stream.username.trim();
      }
    }

    if (typeof stream.displayName !== 'undefined') {
      if (!isSafeString(stream.displayName, 40)) {
        errors.push(`streams[${index}].displayName must be 40 characters or less`);
      } else {
        sanitized.displayName = stream.displayName.trim();
      }
    }

    ['textColor', 'bgColor', 'accentColor'].forEach((key) => {
      if (typeof stream[key] !== 'undefined') {
        if (!isColor(stream[key])) {
          errors.push(`streams[${index}].${key} must be a valid color`);
        } else {
          sanitized[key] = stream[key];
        }
      }
    });

    return sanitized;
  }

  function validateSettings(dock, incoming) {
    const errors = [];
    const sanitized = {};
    const defaults = DEFAULT_SETTINGS[dock];

    if (!DOCKS.includes(dock)) {
      return { valid: false, sanitized, errors: [`Invalid dock: ${dock}`] };
    }

    if (!isPlainObject(incoming)) {
      return { valid: false, sanitized, errors: ['Settings payload must be an object'] };
    }

    Object.entries(incoming).forEach(([key, value]) => {
      if (!Object.prototype.hasOwnProperty.call(defaults, key)) {
        errors.push(`${key} is not a supported setting for ${dock}`);
        return;
      }

      if (key === 'streams') {
        if (!Array.isArray(value) || value.length > 6) {
          errors.push('streams must be an array with up to 6 entries');
          return;
        }
        const streamErrorsBefore = errors.length;
        const streams = value.map((stream, index) => validateStream(stream, index, errors));
        if (errors.length === streamErrorsBefore) {
          sanitized.streams = streams;
        }
        return;
      }

      if (key.startsWith('slot')) {
        if (!SLOT_VALUES.includes(value)) {
          errors.push(`${key} must be a supported overlay slot`);
        } else {
          sanitized[key] = value;
        }
        return;
      }

      if (Object.prototype.hasOwnProperty.call(ENUMS, key)) {
        if (!ENUMS[key].includes(value)) {
          errors.push(`${key} must be one of: ${ENUMS[key].join(', ')}`);
        } else {
          sanitized[key] = value;
        }
        return;
      }

      if (Object.prototype.hasOwnProperty.call(NUMERIC_RANGES, key)) {
        if (validateNumber(key, value, errors)) {
          sanitized[key] = value;
        }
        return;
      }

      if (key.toLowerCase().includes('color')) {
        if (!isColor(value)) {
          errors.push(`${key} must be a valid color`);
        } else {
          sanitized[key] = value;
        }
        return;
      }

      if (key === 'fontSize' || key === 'letterSpacing' || key === 'outlineThickness') {
        if (!isCssLength(value)) {
          errors.push(`${key} must be a CSS length such as 48px`);
        } else {
          sanitized[key] = value;
        }
        return;
      }

      if (key === 'lineHeight') {
        if (typeof value !== 'number' && typeof value !== 'string') {
          errors.push('lineHeight must be a number or string');
        } else {
          sanitized[key] = value;
        }
        return;
      }

      if (Object.prototype.hasOwnProperty.call(STRING_LIMITS, key)) {
        if (!isSafeString(value, STRING_LIMITS[key])) {
          errors.push(`${key} must be ${STRING_LIMITS[key]} characters or less`);
        } else {
          sanitized[key] = value.trim();
        }
        return;
      }

      if (typeof defaults[key] === 'boolean') {
        if (typeof value !== 'boolean') {
          errors.push(`${key} must be a boolean`);
        } else {
          sanitized[key] = value;
        }
        return;
      }

      if (typeof defaults[key] === 'string') {
        if (!isSafeString(value, 120)) {
          errors.push(`${key} must be a safe string`);
        } else {
          sanitized[key] = value.trim();
        }
        return;
      }

      if (typeof defaults[key] === 'number') {
        if (typeof value !== 'number' || Number.isNaN(value)) {
          errors.push(`${key} must be a number`);
        } else {
          sanitized[key] = value;
        }
      }
    });

    return { valid: errors.length === 0, sanitized, errors };
  }

  function mergeSettings(dock, current, incoming) {
    const validation = validateSettings(dock, incoming);
    if (!validation.valid) {
      return {
        valid: false,
        settings: clone(current || DEFAULT_SETTINGS[dock]),
        errors: validation.errors
      };
    }

    return {
      valid: true,
      settings: {
        ...getDefaults(dock),
        ...(current || {}),
        ...validation.sanitized
      },
      errors: []
    };
  }

  function normalizeCustomPresets(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((preset) => {
      return isPlainObject(preset) &&
        typeof preset.id === 'string' &&
        typeof preset.name === 'string' &&
        isPlainObject(preset.settings);
    }).map((preset) => ({
      id: preset.id,
      name: preset.name,
      description: typeof preset.description === 'string' ? preset.description : '',
      settings: clone(preset.settings)
    }));
  }

  function normalizePreset(input, existingIds) {
    const errors = [];
    if (!isPlainObject(input)) {
      return { valid: false, errors: ['Preset payload must be an object'] };
    }

    if (!isSafeString(input.name, 60) || input.name.trim().length === 0) {
      errors.push('Preset name is required and must be 60 characters or less');
    }

    if (!isPlainObject(input.settings)) {
      errors.push('Preset settings must be an object keyed by dock');
    }

    const settings = {};
    if (isPlainObject(input.settings)) {
      Object.entries(input.settings).forEach(([dock, dockSettings]) => {
        if (!DOCKS.includes(dock)) {
          errors.push(`${dock} is not a supported dock`);
          return;
        }
        const validation = validateSettings(dock, dockSettings);
        if (!validation.valid) {
          errors.push(...validation.errors.map(error => `${dock}.${error}`));
          return;
        }
        settings[dock] = validation.sanitized;
      });
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    let id = typeof input.id === 'string' && /^custom-[a-zA-Z0-9_-]+$/.test(input.id)
      ? input.id
      : `custom-${Date.now()}`;
    let suffix = 1;
    while (existingIds.has(id)) {
      id = `${id}-${suffix++}`;
    }

    return {
      valid: true,
      preset: {
        id,
        name: input.name.trim(),
        description: typeof input.description === 'string' ? input.description.trim().slice(0, 160) : '',
        settings
      },
      errors: []
    };
  }

  function createProfile(settings, customPresets) {
    return {
      plugin: 'clarityhud',
      version: VERSION,
      exportedAt: new Date().toISOString(),
      settings: clone(settings),
      customPresets: normalizeCustomPresets(customPresets)
    };
  }

  function validateProfile(profile) {
    const errors = [];
    if (!isPlainObject(profile)) {
      return { valid: false, errors: ['Profile must be an object'] };
    }
    if (profile.plugin && profile.plugin !== 'clarityhud') {
      errors.push('Profile plugin must be clarityhud');
    }
    if (!isPlainObject(profile.settings)) {
      errors.push('Profile settings must be an object');
    }

    const settings = {};
    if (isPlainObject(profile.settings)) {
      Object.entries(profile.settings).forEach(([dock, dockSettings]) => {
        if (!DOCKS.includes(dock)) {
          errors.push(`${dock} is not a supported dock`);
          return;
        }
        const merged = mergeSettings(dock, getDefaults(dock), dockSettings);
        if (!merged.valid) {
          errors.push(...merged.errors.map(error => `${dock}.${error}`));
          return;
        }
        settings[dock] = merged.settings;
      });
    }

    return {
      valid: errors.length === 0,
      settings,
      customPresets: normalizeCustomPresets(profile.customPresets),
      errors
    };
  }

  return {
    VERSION,
    DOCKS,
    DEFAULT_SETTINGS,
    BUILTIN_PRESETS,
    clone,
    getDefaults,
    validateSettings,
    mergeSettings,
    normalizeCustomPresets,
    normalizePreset,
    createProfile,
    validateProfile
  };
});
