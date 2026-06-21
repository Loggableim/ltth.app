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

function normalizeBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true' || value === 'on') return true;
  if (value === 0 || value === '0' || value === 'false' || value === 'off' || value === '') return false;
  return fallback;
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

const EVENT_DEFAULT_OVERRIDES = {
  chat: { enabled: true, brainEnabled: true, avatarActionEnabled: true, priority: 40, cooldownMs: 3000 },
  gift: { enabled: true, brainEnabled: true, avatarActionEnabled: true, priority: 100, cooldownMs: 1000, minQuantity: 1 },
  follow: { enabled: true, brainEnabled: true, avatarActionEnabled: true, priority: 70, cooldownMs: 3000 },
  share: { enabled: true, brainEnabled: true, avatarActionEnabled: true, priority: 65, cooldownMs: 3000 },
  like: { enabled: true, brainEnabled: false, avatarActionEnabled: true, priority: 20, cooldownMs: 5000, minLikes: 10 },
  subscribe: { enabled: true, brainEnabled: true, avatarActionEnabled: true, priority: 90, cooldownMs: 3000 },
  join: { enabled: false, brainEnabled: false, avatarActionEnabled: false, priority: 10, cooldownMs: 5000 }
};

function buildEventDefaults(type) {
  return { ...eventDefaults(false), ...EVENT_DEFAULT_OVERRIDES[type] };
}

function buildLiveHostDefaults() {
  return {
    enabled: true,
    operatingMode: 'standalone',
    source: {
      username: '',
      readOnly: true,
      autoConnect: true,
      watchdogIntervalMs: 30000,
      eventStaleMs: 300000,
      reconnectOnEventStale: true
    },
    provider: 'ollama',
    providers: {
      openai: providerDefaults('openai', 'https://api.openai.com/v1', 'gpt-4o-mini'),
      gemini: providerDefaults('gemini', 'https://generativelanguage.googleapis.com/v1beta', 'gemini-2.5-flash'),
      openrouter: providerDefaults('openrouter', 'https://openrouter.ai/api/v1', 'openrouter/free'),
      ollama: providerDefaults('ollama', 'https://ollama.com', 'nemotron-3-nano:30b-cloud')
    },
    response: {
      decisionMode: 'auto',
      minDecisionScore: 0.55,
      maxResponsesPerMinute: 4,
      chatProbability: 0.1,
      maxSentences: 2,
      maxCharacters: 500,
      hostReplyProbability: 0.75,
      hostMinConfidence: 0.35,
      hostContextCooldownMs: 6000,
      hostOvertalkCooldownMs: 1800,
      hostLongFormWordLimit: 48,
      language: 'de',
      systemPrompt: '',
      cacheEnabled: true,
      cacheTtlMs: 300000,
      contextMessages: 10,
      queueLimit: 50,
      queueWarnRatio: 0.8,
      queuePolicy: 'drop-lowest',
      speakCooldownMs: 3000,
      silenceWarnAfterEvents: 5
    },
    events: Object.fromEntries(EVENT_TYPES.map(type => [type, buildEventDefaults(type)])),
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
      fallbackBehavior: 'silent',
      probeStaleMs: 300000
    },
    audio: {
      outputDeviceId: '',
      outputDeviceLabel: '',
      monitoringEnabled: false,
      monitoringVolume: 30,
      missingDeviceBehavior: 'mute'
    },
    asr: {
      enabled: true,
      deviceId: '',
      deviceLabel: '',
      unsafeOverride: false,
      language: 'de',
      maxAudioBytes: 8 * 1024 * 1024,
      minTranscriptChars: 1,
      rateLimitMax: 10,
      rateLimitWindowMs: 60000,
      silenceTimeoutMs: 900,
      maxSegmentMs: 12000
    },
    viewerMemory: {
      enabled: true,
      streamerId: '',
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
      preferNames: ['Explaining', 'Walking', 'Bored', 'Victory', 'Hello', 'Dance', 'Heart', 'Confetti'],
      avoidNames: ['Motionless'],
      fallbackToSpecialAction: true,
      includeEmotes: true,
      alternateActionTypes: true,
      pauseWhileSpeaking: false,
      cooldownAfterActionMs: 5000
    },
    diagnostics: {
      verboseLogging: false,
      emitEvents: true,
      retainLastErrors: 20,
      browserHeartbeatStaleMs: 30000,
      movementProbeStaleMs: 300000,
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
  configured.operatingMode = ['standalone', 'sidekick'].includes(configured.operatingMode)
    ? configured.operatingMode : defaults.operatingMode;
  configured.enabled = normalizeBoolean(configured.enabled, defaults.enabled);
  configured.provider = PROVIDERS.includes(configured.provider) ? configured.provider : defaults.provider;
  configured.source.username = safeString(configured.source.username, 100).replace(/^@/, '');
  configured.source.readOnly = true;
  configured.source.autoConnect = normalizeBoolean(configured.source.autoConnect, defaults.source.autoConnect);
  configured.source.watchdogIntervalMs = Math.round(clamp(configured.source.watchdogIntervalMs, 5000, 300000, defaults.source.watchdogIntervalMs));
  configured.source.eventStaleMs = Math.round(clamp(configured.source.eventStaleMs, 30000, 3600000, defaults.source.eventStaleMs));
  configured.source.reconnectOnEventStale = normalizeBoolean(configured.source.reconnectOnEventStale, defaults.source.reconnectOnEventStale);

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
    item.thinking = normalizeBoolean(item.thinking, defaults.providers[provider].thinking);
  }

  configured.response.maxResponsesPerMinute = Math.round(clamp(configured.response.maxResponsesPerMinute, 1, 120, defaults.response.maxResponsesPerMinute));
  configured.response.decisionMode = ['auto', 'probability', 'always', 'off'].includes(configured.response.decisionMode)
    ? configured.response.decisionMode
    : defaults.response.decisionMode;
  configured.response.minDecisionScore = clamp(configured.response.minDecisionScore, 0, 1, defaults.response.minDecisionScore);
  configured.response.hostReplyProbability = clamp(configured.response.hostReplyProbability, 0, 1, defaults.response.hostReplyProbability);
  configured.response.hostMinConfidence = clamp(configured.response.hostMinConfidence, 0, 1, defaults.response.hostMinConfidence);
  configured.response.hostContextCooldownMs = Math.round(clamp(configured.response.hostContextCooldownMs, 0, 60 * 60 * 1000, defaults.response.hostContextCooldownMs));
  configured.response.hostOvertalkCooldownMs = Math.round(clamp(configured.response.hostOvertalkCooldownMs, 0, 5 * 60 * 1000, defaults.response.hostOvertalkCooldownMs));
  configured.response.hostLongFormWordLimit = Math.round(clamp(configured.response.hostLongFormWordLimit, 1, 500, defaults.response.hostLongFormWordLimit));
  configured.response.chatProbability = clamp(configured.response.chatProbability, 0, 1, defaults.response.chatProbability);
  configured.response.maxSentences = Math.round(clamp(configured.response.maxSentences, 1, 10, defaults.response.maxSentences));
  configured.response.maxCharacters = Math.round(clamp(configured.response.maxCharacters, 20, 4000, 500));
  configured.response.cacheTtlMs = Math.round(clamp(configured.response.cacheTtlMs, 0, 86400000, 300000));
  configured.response.contextMessages = Math.round(clamp(configured.response.contextMessages, 0, 100, 10));
  configured.response.queueLimit = Math.round(clamp(configured.response.queueLimit, 1, 1000, 50));
  configured.response.queueWarnRatio = clamp(configured.response.queueWarnRatio, 0, 1, defaults.response.queueWarnRatio);
  configured.response.speakCooldownMs = Math.round(clamp(configured.response.speakCooldownMs, 0, 60000, 3000));
  configured.response.silenceWarnAfterEvents = Math.round(clamp(configured.response.silenceWarnAfterEvents, 1, 1000, defaults.response.silenceWarnAfterEvents));
  configured.response.language = safeString(configured.response.language, 20, 'de');
  configured.response.systemPrompt = safeString(configured.response.systemPrompt, 8000);
  configured.response.queuePolicy = ['drop-lowest', 'drop-oldest', 'reject-new'].includes(configured.response.queuePolicy)
    ? configured.response.queuePolicy : defaults.response.queuePolicy;
  configured.response.cacheEnabled = normalizeBoolean(configured.response.cacheEnabled, defaults.response.cacheEnabled);

  configured.tts.enabled = normalizeBoolean(configured.tts.enabled, defaults.tts.enabled);
  configured.tts.engine = 'fishaudio';
  configured.tts.voiceId = safeString(configured.tts.voiceId, 200);
  configured.tts.emotion = safeString(configured.tts.emotion, 40, 'neutral');
  configured.tts.volume = clamp(configured.tts.volume, 0, 100, 80);
  configured.tts.speed = clamp(configured.tts.speed, 0.5, 2, 1);
  configured.tts.pitch = clamp(configured.tts.pitch, -12, 12, 0);
  configured.tts.priority = Math.round(clamp(configured.tts.priority, 0, 100, 80));
  configured.tts.probeStaleMs = Math.round(clamp(configured.tts.probeStaleMs, 30000, 86400000, defaults.tts.probeStaleMs));
  configured.tts.streaming = normalizeBoolean(configured.tts.streaming, defaults.tts.streaming);
  configured.tts.duckOtherAudio = normalizeBoolean(configured.tts.duckOtherAudio, defaults.tts.duckOtherAudio);
  configured.tts.fallbackBehavior = ['silent', 'default-voice', 'error'].includes(configured.tts.fallbackBehavior)
    ? configured.tts.fallbackBehavior : defaults.tts.fallbackBehavior;
  configured.audio.monitoringEnabled = normalizeBoolean(configured.audio.monitoringEnabled, defaults.audio.monitoringEnabled);
  configured.audio.monitoringVolume = clamp(configured.audio.monitoringVolume, 0, 100, 30);
  configured.asr.enabled = normalizeBoolean(configured.asr.enabled, defaults.asr.enabled);
  configured.asr.deviceId = safeString(configured.asr.deviceId, 500);
  configured.asr.deviceLabel = safeString(configured.asr.deviceLabel, 500);
  configured.asr.unsafeOverride = normalizeBoolean(configured.asr.unsafeOverride, defaults.asr.unsafeOverride);
  configured.asr.language = safeString(configured.asr.language, 20, 'de');
  configured.asr.maxAudioBytes = Math.round(clamp(configured.asr.maxAudioBytes, 1024, 8 * 1024 * 1024, defaults.asr.maxAudioBytes));
  configured.asr.minTranscriptChars = Math.round(clamp(configured.asr.minTranscriptChars, 1, 500, defaults.asr.minTranscriptChars));
  configured.asr.rateLimitMax = Math.round(clamp(configured.asr.rateLimitMax, 1, 120, defaults.asr.rateLimitMax));
  configured.asr.rateLimitWindowMs = Math.round(clamp(configured.asr.rateLimitWindowMs, 1000, 60 * 60 * 1000, defaults.asr.rateLimitWindowMs));
  configured.asr.silenceTimeoutMs = Math.round(clamp(configured.asr.silenceTimeoutMs, 250, 5000, defaults.asr.silenceTimeoutMs));
  configured.asr.maxSegmentMs = Math.round(clamp(configured.asr.maxSegmentMs, 1000, 30000, defaults.asr.maxSegmentMs));
  configured.viewerMemory.enabled = normalizeBoolean(configured.viewerMemory.enabled, defaults.viewerMemory.enabled);
  configured.viewerMemory.writeMemories = normalizeBoolean(configured.viewerMemory.writeMemories, defaults.viewerMemory.writeMemories);
  configured.viewerMemory.includeInsights = normalizeBoolean(configured.viewerMemory.includeInsights, defaults.viewerMemory.includeInsights);
  configured.viewerMemory.includeGiftHistory = normalizeBoolean(configured.viewerMemory.includeGiftHistory, defaults.viewerMemory.includeGiftHistory);
  configured.viewerMemory.maxMemories = Math.round(clamp(configured.viewerMemory.maxMemories, 1, 100, 20));
  configured.viewerMemory.minimumImportance = clamp(configured.viewerMemory.minimumImportance, 0, 1, 0.25);
  configured.viewerMemory.streamerId = safeString(configured.viewerMemory.streamerId, 200, defaults.viewerMemory.streamerId);
  configured.viewerMemory.allowedProfileFields = Array.isArray(configured.viewerMemory.allowedProfileFields)
    ? [...new Set(configured.viewerMemory.allowedProfileFields.filter(field => defaults.viewerMemory.allowedProfileFields.includes(field)))]
    : defaults.viewerMemory.allowedProfileFields;
  configured.privacy.includeNotes = normalizeBoolean(configured.privacy.includeNotes, defaults.privacy.includeNotes);
  configured.privacy.includeBirthday = normalizeBoolean(configured.privacy.includeBirthday, defaults.privacy.includeBirthday);
  configured.privacy.includeContactFields = normalizeBoolean(configured.privacy.includeContactFields, defaults.privacy.includeContactFields);
  configured.privacy.redactPromptPayloads = normalizeBoolean(configured.privacy.redactPromptPayloads, defaults.privacy.redactPromptPayloads);
  configured.avatarSwitch.enabled = normalizeBoolean(configured.avatarSwitch.enabled, defaults.avatarSwitch.enabled);
  configured.avatarSwitch.persistUntilNextSwitch = normalizeBoolean(configured.avatarSwitch.persistUntilNextSwitch, defaults.avatarSwitch.persistUntilNextSwitch);
  configured.avatarSwitch.matchGiftNameFallback = normalizeBoolean(configured.avatarSwitch.matchGiftNameFallback, defaults.avatarSwitch.matchGiftNameFallback);
  configured.avatarSwitch.waitForRepeatEnd = normalizeBoolean(configured.avatarSwitch.waitForRepeatEnd, defaults.avatarSwitch.waitForRepeatEnd);
  configured.avatarSwitch.revertAfterMs = Math.round(clamp(configured.avatarSwitch.revertAfterMs, 0, 86400000, defaults.avatarSwitch.revertAfterMs));

  for (const type of EVENT_TYPES) {
    const event = configured.events[type];
    event.enabled = normalizeBoolean(event.enabled, defaults.events[type].enabled);
    event.brainEnabled = normalizeBoolean(event.brainEnabled, defaults.events[type].brainEnabled);
    event.templateEnabled = normalizeBoolean(event.templateEnabled, defaults.events[type].templateEnabled);
    event.avatarActionEnabled = normalizeBoolean(event.avatarActionEnabled, defaults.events[type].avatarActionEnabled);
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
  configured.idleMotion.enabled = normalizeBoolean(configured.idleMotion.enabled, defaults.idleMotion.enabled);
  configured.idleMotion.intervalMs = Math.round(clamp(configured.idleMotion.intervalMs, 3000, 600000, defaults.idleMotion.intervalMs));
  configured.idleMotion.jitterMs = Math.round(clamp(configured.idleMotion.jitterMs, 0, 120000, defaults.idleMotion.jitterMs));
  configured.idleMotion.actionType = ['idle', 'specialAction', 'emote'].includes(configured.idleMotion.actionType)
    ? configured.idleMotion.actionType : defaults.idleMotion.actionType;
  configured.idleMotion.preferNames = Array.isArray(configured.idleMotion.preferNames)
    ? configured.idleMotion.preferNames.slice(0, 50).map(value => safeString(value, 80)).filter(Boolean)
    : defaults.idleMotion.preferNames;
  configured.idleMotion.avoidNames = Array.isArray(configured.idleMotion.avoidNames)
    ? configured.idleMotion.avoidNames.slice(0, 50).map(value => safeString(value, 80)).filter(Boolean)
    : defaults.idleMotion.avoidNames;
  configured.idleMotion.fallbackToSpecialAction = normalizeBoolean(configured.idleMotion.fallbackToSpecialAction, defaults.idleMotion.fallbackToSpecialAction);
  configured.idleMotion.includeEmotes = normalizeBoolean(configured.idleMotion.includeEmotes, defaults.idleMotion.includeEmotes);
  configured.idleMotion.alternateActionTypes = normalizeBoolean(configured.idleMotion.alternateActionTypes, defaults.idleMotion.alternateActionTypes);
  configured.idleMotion.pauseWhileSpeaking = normalizeBoolean(configured.idleMotion.pauseWhileSpeaking, defaults.idleMotion.pauseWhileSpeaking);
  configured.idleMotion.cooldownAfterActionMs = Math.round(clamp(configured.idleMotion.cooldownAfterActionMs, 0, 600000, defaults.idleMotion.cooldownAfterActionMs));
  configured.audio.outputDeviceId = safeString(configured.audio.outputDeviceId, 500);
  configured.audio.outputDeviceLabel = safeString(configured.audio.outputDeviceLabel, 500);
  configured.audio.missingDeviceBehavior = ['mute', 'default', 'error'].includes(configured.audio.missingDeviceBehavior)
    ? configured.audio.missingDeviceBehavior : defaults.audio.missingDeviceBehavior;
  configured.diagnostics.verboseLogging = normalizeBoolean(configured.diagnostics.verboseLogging, defaults.diagnostics.verboseLogging);
  configured.diagnostics.emitEvents = normalizeBoolean(configured.diagnostics.emitEvents, defaults.diagnostics.emitEvents);
  configured.diagnostics.includePromptBodies = normalizeBoolean(configured.diagnostics.includePromptBodies, defaults.diagnostics.includePromptBodies);
  configured.diagnostics.retainLastErrors = Math.round(clamp(configured.diagnostics.retainLastErrors, 0, 100, defaults.diagnostics.retainLastErrors));
  configured.diagnostics.browserHeartbeatStaleMs = Math.round(clamp(configured.diagnostics.browserHeartbeatStaleMs, 5000, 300000, defaults.diagnostics.browserHeartbeatStaleMs));
  configured.diagnostics.movementProbeStaleMs = Math.round(clamp(configured.diagnostics.movementProbeStaleMs, 30000, 86400000, defaults.diagnostics.movementProbeStaleMs));
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
  if (!['safe-live', 'production-24-7'].includes(preset)) {
    throw new Error(`Unknown live host preset: ${preset}`);
  }
  const current = normalizeLiveHostConfig(config);
  const production = buildLiveHostDefaults();
  for (const provider of PROVIDERS) {
    production.providers[provider].apiKey = current.providers[provider].apiKey;
  }
  production.source.username = current.source.username;
  production.tts.voiceId = current.tts.voiceId;
  production.audio.outputDeviceId = current.audio.outputDeviceId;
  production.audio.outputDeviceLabel = current.audio.outputDeviceLabel;
  production.asr = current.asr;
  production.viewerMemory.streamerId = current.viewerMemory.streamerId;
  production.avatarBundles = current.avatarBundles;
  production.activeAvatarBundleId = current.activeAvatarBundleId;
  return normalizeLiveHostConfig(production);
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
