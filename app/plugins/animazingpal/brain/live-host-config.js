'use strict';

const PROVIDERS = ['openai', 'gemini', 'openrouter', 'ollama'];
const EVENT_TYPES = ['chat', 'gift', 'follow', 'share', 'like', 'subscribe', 'join'];

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function safeString(value, maximum, fallback = '') {
  return String(value ?? fallback).trim().slice(0, maximum);
}

function merge(target, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const output = { ...(target || {}) };
  for (const [key, value] of Object.entries(patch)) {
    output[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? merge(output[key], value)
      : value;
  }
  return output;
}

function providerDefaults(provider, baseUrl, model) {
  return {
    apiKey: '',
    baseUrl,
    model,
    timeoutMs: 30000,
    maxRetries: 2,
    retryBackoffMs: 1000,
    temperature: 0.8,
    maxResponseTokens: 300,
    presencePenalty: 0.3,
    frequencyPenalty: 0.3,
    thinking: provider === 'ollama'
  };
}

function eventDefaults(brainEnabled) {
  return {
    enabled: true,
    brainEnabled,
    templateEnabled: false,
    template: '',
    prompt: '',
    probability: 1,
    cooldownMs: 2000,
    priority: null,
    minCoins: 0,
    minLikes: 0,
    minQuantity: 1,
    avatarActionEnabled: true,
    voiceId: '',
    emotion: '',
    pitch: null,
    volume: null,
    speed: null
  };
}

function buildLiveHostDefaults() {
  return {
    enabled: false,
    source: {
      username: '',
      readOnly: true,
      autoConnect: false
    },
    provider: 'openai',
    providers: {
      openai: providerDefaults('openai', 'https://api.openai.com/v1', 'gpt-4o-mini'),
      gemini: providerDefaults('gemini', 'https://generativelanguage.googleapis.com/v1beta', 'gemini-2.5-flash'),
      openrouter: providerDefaults('openrouter', 'https://openrouter.ai/api/v1', 'openrouter/free'),
      ollama: providerDefaults('ollama', 'https://ollama.com', 'nemotron-3-nano:30b-cloud')
    },
    response: {
      decisionMode: 'auto',
      minDecisionScore: 0.55,
      maxResponsesPerMinute: 10,
      chatProbability: 0.3,
      maxSentences: 3,
      maxCharacters: 500,
      language: 'de',
      systemPrompt: '',
      cacheEnabled: true,
      cacheTtlMs: 300000,
      contextMessages: 10,
      queueLimit: 50,
      queuePolicy: 'drop-lowest',
      speakCooldownMs: 3000
    },
    events: Object.fromEntries(EVENT_TYPES.map(type => [type, eventDefaults(['gift', 'follow', 'share', 'subscribe'].includes(type))])),
    tts: {
      enabled: true,
      engine: 'fishaudio',
      voiceId: '',
      emotion: 'neutral',
      pitch: 0,
      volume: 80,
      speed: 1,
      streaming: true,
      priority: 80,
      duckOtherAudio: true,
      fallbackBehavior: 'silent'
    },
    audio: {
      outputDeviceId: '',
      outputDeviceLabel: '',
      monitoringEnabled: false,
      monitoringVolume: 30,
      missingDeviceBehavior: 'mute'
    },
    viewerMemory: {
      enabled: true,
      streamerId: 'default',
      maxMemories: 20,
      minimumImportance: 0.25,
      writeMemories: true,
      includeInsights: true,
      includeGiftHistory: true,
      allowedProfileFields: ['display_name', 'language', 'tags', 'is_vip', 'vip_tier', 'total_visits', 'total_comments', 'total_gifts_sent', 'total_coins_spent']
    },
    privacy: {
      includeNotes: false,
      includeBirthday: false,
      includeContactFields: false,
      redactPromptPayloads: true
    },
    avatarBundles: [],
    activeAvatarBundleId: '',
    avatarSwitch: {
      enabled: true,
      persistUntilNextSwitch: true,
      revertAfterMs: 0,
      matchGiftNameFallback: true,
      waitForRepeatEnd: true
    },
    idleMotion: {
      enabled: true,
      intervalMs: 15000,
      jitterMs: 5000,
      actionType: 'idle',
      preferNames: ['Explaining', 'Walking', 'Bored', 'Victory', 'Hello', 'Dance'],
      avoidNames: ['Motionless'],
      fallbackToSpecialAction: true,
      pauseWhileSpeaking: false,
      cooldownAfterActionMs: 5000
    },
    diagnostics: {
      verboseLogging: false,
      emitEvents: true,
      retainLastErrors: 20,
      includePromptBodies: false
    }
  };
}

function migrateLegacy(legacy = {}) {
  if (!legacy || typeof legacy !== 'object') return {};
  const patch = {};
  if (legacy.openaiApiKey || legacy.model) {
    patch.provider = 'openai';
    patch.providers = { openai: {} };
    if (legacy.openaiApiKey) patch.providers.openai.apiKey = legacy.openaiApiKey;
    if (legacy.model) patch.providers.openai.model = legacy.model;
  }
  if (legacy.maxResponsesPerMinute !== undefined || legacy.chatResponseProbability !== undefined) {
    patch.response = {};
    if (legacy.maxResponsesPerMinute !== undefined) patch.response.maxResponsesPerMinute = legacy.maxResponsesPerMinute;
    if (legacy.chatResponseProbability !== undefined) patch.response.chatProbability = legacy.chatResponseProbability;
  }
  return patch;
}

function normalizeLiveHostConfig(input = {}, legacy = {}) {
  const defaults = buildLiveHostDefaults();
  const configured = merge(merge(defaults, migrateLegacy(legacy)), input);
  configured.provider = PROVIDERS.includes(configured.provider) ? configured.provider : defaults.provider;
  configured.source.username = safeString(configured.source.username, 100).replace(/^@/, '');
  configured.source.readOnly = true;
  configured.source.autoConnect = !!configured.source.autoConnect;

  for (const provider of PROVIDERS) {
    const item = configured.providers[provider];
    item.baseUrl = safeString(item.baseUrl || defaults.providers[provider].baseUrl, 2048).replace(/\/$/, '');
    item.model = safeString(item.model || defaults.providers[provider].model, 200);
    item.apiKey = typeof item.apiKey === 'string' ? item.apiKey.trim().slice(0, 4096) : '';
    item.timeoutMs = clamp(item.timeoutMs, 1000, 120000, 30000);
    item.maxRetries = Math.round(clamp(item.maxRetries, 0, 10, 2));
    item.retryBackoffMs = Math.round(clamp(item.retryBackoffMs, 0, 30000, 1000));
    item.temperature = clamp(item.temperature, 0, 2, 0.8);
    item.maxResponseTokens = Math.round(clamp(item.maxResponseTokens, 16, 4096, 300));
    item.presencePenalty = clamp(item.presencePenalty, -2, 2, 0.3);
    item.frequencyPenalty = clamp(item.frequencyPenalty, -2, 2, 0.3);
    item.thinking = !!item.thinking;
  }

  configured.response.maxResponsesPerMinute = Math.round(clamp(configured.response.maxResponsesPerMinute, 1, 120, 10));
  configured.response.decisionMode = ['auto', 'probability', 'always', 'off'].includes(configured.response.decisionMode)
    ? configured.response.decisionMode
    : defaults.response.decisionMode;
  configured.response.minDecisionScore = clamp(configured.response.minDecisionScore, 0, 1, defaults.response.minDecisionScore);
  configured.response.chatProbability = clamp(configured.response.chatProbability, 0, 1, 0.3);
  configured.response.maxSentences = Math.round(clamp(configured.response.maxSentences, 1, 10, 3));
  configured.response.maxCharacters = Math.round(clamp(configured.response.maxCharacters, 20, 4000, 500));
  configured.response.cacheTtlMs = Math.round(clamp(configured.response.cacheTtlMs, 0, 86400000, 300000));
  configured.response.contextMessages = Math.round(clamp(configured.response.contextMessages, 0, 100, 10));
  configured.response.queueLimit = Math.round(clamp(configured.response.queueLimit, 1, 1000, 50));
  configured.response.speakCooldownMs = Math.round(clamp(configured.response.speakCooldownMs, 0, 60000, 3000));
  configured.response.language = safeString(configured.response.language, 20, 'de');
  configured.response.systemPrompt = safeString(configured.response.systemPrompt, 8000);
  configured.response.queuePolicy = ['drop-lowest', 'drop-oldest', 'reject-new'].includes(configured.response.queuePolicy)
    ? configured.response.queuePolicy : defaults.response.queuePolicy;

  configured.tts.voiceId = safeString(configured.tts.voiceId, 200);
  configured.tts.emotion = safeString(configured.tts.emotion, 40, 'neutral');
  configured.tts.volume = clamp(configured.tts.volume, 0, 100, 80);
  configured.tts.speed = clamp(configured.tts.speed, 0.5, 2, 1);
  configured.tts.pitch = clamp(configured.tts.pitch, -12, 12, 0);
  configured.tts.priority = Math.round(clamp(configured.tts.priority, 0, 100, 80));
  configured.audio.monitoringVolume = clamp(configured.audio.monitoringVolume, 0, 100, 30);
  configured.viewerMemory.maxMemories = Math.round(clamp(configured.viewerMemory.maxMemories, 1, 100, 20));
  configured.viewerMemory.minimumImportance = clamp(configured.viewerMemory.minimumImportance, 0, 1, 0.25);
  configured.viewerMemory.streamerId = safeString(configured.viewerMemory.streamerId, 200, 'default');
  configured.viewerMemory.allowedProfileFields = Array.isArray(configured.viewerMemory.allowedProfileFields)
    ? [...new Set(configured.viewerMemory.allowedProfileFields.filter(field => defaults.viewerMemory.allowedProfileFields.includes(field)))]
    : defaults.viewerMemory.allowedProfileFields;
  configured.avatarSwitch.revertAfterMs = Math.round(clamp(configured.avatarSwitch.revertAfterMs, 0, 86400000, 0));

  for (const type of EVENT_TYPES) {
    const event = configured.events[type];
    event.probability = clamp(event.probability, 0, 1, 1);
    event.cooldownMs = Math.round(clamp(event.cooldownMs, 0, 3600000, 2000));
    event.priority = event.priority === null || event.priority === ''
      ? null
      : Math.round(clamp(event.priority, 0, 100, 50));
    event.minCoins = Math.round(clamp(event.minCoins, 0, 100000000, 0));
    event.minLikes = Math.round(clamp(event.minLikes, 0, 100000000, 0));
    event.minQuantity = Math.round(clamp(event.minQuantity, 1, 1000000, 1));
    event.prompt = safeString(event.prompt, 4000);
    event.template = safeString(event.template, 2000);
    event.voiceId = safeString(event.voiceId, 200);
    event.emotion = safeString(event.emotion, 40);
    event.pitch = event.pitch === null || event.pitch === '' ? null : clamp(event.pitch, -12, 12, 0);
    event.volume = event.volume === null || event.volume === '' ? null : clamp(event.volume, 0, 100, 80);
    event.speed = event.speed === null || event.speed === '' ? null : clamp(event.speed, 0.5, 2, 1);
  }

  configured.avatarBundles = Array.isArray(configured.avatarBundles)
    ? configured.avatarBundles.slice(0, 200).map(bundle => {
      const id = safeString(bundle?.id, 100).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
      if (!id) return null;
      return {
        id,
        name: safeString(bundle.name || id, 120),
        avatarName: safeString(bundle.avatarName, 200),
        personalityId: safeString(bundle.personalityId, 100),
        voiceId: safeString(bundle.voiceId, 200),
        emotion: safeString(bundle.emotion, 40),
        pitch: clamp(bundle.pitch, -12, 12, 0),
        volume: clamp(bundle.volume, 0, 100, 80),
        speed: clamp(bundle.speed, 0.5, 2, 1),
        priority: Math.round(clamp(bundle.priority, 0, 100, configured.tts.priority)),
        giftIds: [...new Set((Array.isArray(bundle.giftIds) ? bundle.giftIds : []).map(value => safeString(value, 80)).filter(Boolean))],
        giftNames: [...new Set((Array.isArray(bundle.giftNames) ? bundle.giftNames : []).map(value => safeString(value, 160)).filter(Boolean))]
      };
    }).filter(Boolean)
    : [];
  configured.activeAvatarBundleId = safeString(configured.activeAvatarBundleId, 100);
  configured.idleMotion.enabled = configured.idleMotion.enabled !== false;
  configured.idleMotion.intervalMs = Math.round(clamp(configured.idleMotion.intervalMs, 3000, 600000, defaults.idleMotion.intervalMs));
  configured.idleMotion.jitterMs = Math.round(clamp(configured.idleMotion.jitterMs, 0, 120000, defaults.idleMotion.jitterMs));
  configured.idleMotion.actionType = ['idle', 'specialAction'].includes(configured.idleMotion.actionType)
    ? configured.idleMotion.actionType : defaults.idleMotion.actionType;
  configured.idleMotion.preferNames = Array.isArray(configured.idleMotion.preferNames)
    ? configured.idleMotion.preferNames.slice(0, 50).map(value => safeString(value, 80)).filter(Boolean)
    : defaults.idleMotion.preferNames;
  configured.idleMotion.avoidNames = Array.isArray(configured.idleMotion.avoidNames)
    ? configured.idleMotion.avoidNames.slice(0, 50).map(value => safeString(value, 80)).filter(Boolean)
    : defaults.idleMotion.avoidNames;
  configured.idleMotion.fallbackToSpecialAction = configured.idleMotion.fallbackToSpecialAction !== false;
  configured.idleMotion.pauseWhileSpeaking = !!configured.idleMotion.pauseWhileSpeaking;
  configured.idleMotion.cooldownAfterActionMs = Math.round(clamp(configured.idleMotion.cooldownAfterActionMs, 0, 600000, defaults.idleMotion.cooldownAfterActionMs));
  configured.audio.outputDeviceId = safeString(configured.audio.outputDeviceId, 500);
  configured.audio.outputDeviceLabel = safeString(configured.audio.outputDeviceLabel, 500);
  configured.audio.missingDeviceBehavior = ['mute', 'default', 'error'].includes(configured.audio.missingDeviceBehavior)
    ? configured.audio.missingDeviceBehavior : defaults.audio.missingDeviceBehavior;
  return configured;
}

function sanitizeLiveHostConfig(config) {
  const safe = JSON.parse(JSON.stringify(config || buildLiveHostDefaults()));
  for (const provider of PROVIDERS) {
    const source = config?.providers?.[provider] || {};
    delete safe.providers[provider].apiKey;
    safe.providers[provider].apiKeyConfigured = !!source.apiKey;
  }
  return safe;
}

function mergeLiveHostSecrets(current, patch = {}) {
  const prepared = JSON.parse(JSON.stringify(patch || {}));
  prepared.providers = prepared.providers || {};
  for (const provider of PROVIDERS) {
    const incoming = prepared.providers[provider];
    if (!incoming) continue;
    if (incoming.clearApiKey === true) {
      incoming.apiKey = '';
    } else if (!incoming.apiKey || incoming.apiKey === '***configured***') {
      incoming.apiKey = current?.providers?.[provider]?.apiKey || '';
    }
    delete incoming.clearApiKey;
    delete incoming.apiKeyConfigured;
  }
  return normalizeLiveHostConfig(merge(current, prepared));
}

function applyLiveHostPreset(config, preset) {
  if (preset !== 'safe-live') throw new Error(`Unknown live host preset: ${preset}`);
  return normalizeLiveHostConfig(merge(config, {
    enabled: true,
    response: { decisionMode: 'auto', minDecisionScore: 0.55, maxResponsesPerMinute: 4, chatProbability: 0.1, maxSentences: 2 },
    providers: { ollama: { timeoutMs: 30000, maxRetries: 2, retryBackoffMs: 1000 } },
    events: {
      chat: { brainEnabled: true, probability: 0.1 },
      gift: { brainEnabled: true }, follow: { brainEnabled: true }, share: { brainEnabled: true },
      like: { brainEnabled: false }, join: { brainEnabled: false }
    },
    viewerMemory: { enabled: true, writeMemories: true },
    avatarSwitch: { enabled: true, persistUntilNextSwitch: true, revertAfterMs: 0 },
    idleMotion: { enabled: true, intervalMs: 15000, jitterMs: 5000, actionType: 'idle', fallbackToSpecialAction: true, pauseWhileSpeaking: false }
  }));
}

module.exports = {
  PROVIDERS,
  EVENT_TYPES,
  buildLiveHostDefaults,
  normalizeLiveHostConfig,
  sanitizeLiveHostConfig,
  applyLiveHostPreset,
  mergeLiveHostSecrets,
  merge
};
