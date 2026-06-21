/**
 * Sidekick Conversation Coordinator
 *
 * Keeps Sidekick-host speech orchestration focused and separate from viewer
 * memory. Host speech is packaged for AnimazingPal; it is not written into the
 * Sidekick viewer memory store here.
 */

const SUPPORTED_EVENT_TYPES = ['chat', 'gift', 'follow', 'share', 'like', 'subscribe', 'join'];

const DEFAULT_CONVERSATION_COORDINATOR_CONFIG = {
  enabled: true,
  hostName: 'Host',
  minHostSpeechChars: 3,
  echoWindowMs: 12000,
  maxRecentUtterances: 20,
  // Reserved for a future fuzzy duplicate implementation. Current protection
  // intentionally uses exact normalized matches for deterministic safety.
  duplicateSimilarity: 1,
  hostSpeechEventType: 'chat',
  viewerEventTypes: ['chat', 'gift', 'follow', 'share', 'subscribe', 'like']
};

function normalizeSpeechText(text) {
  return safeString(text, 500)
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

function cleanSpeechText(text, maximum = 500) {
  return safeString(text, maximum)
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
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

function normalizeConversationConfig(config = {}) {
  const input = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const defaults = DEFAULT_CONVERSATION_COORDINATOR_CONFIG;
  const viewerEventTypes = Array.isArray(input.viewerEventTypes)
    ? [...new Set(input.viewerEventTypes.filter(type => SUPPORTED_EVENT_TYPES.includes(type)))]
    : defaults.viewerEventTypes;

  return {
    enabled: normalizeBoolean(input.enabled, defaults.enabled),
    hostName: safeString(input.hostName, 64, defaults.hostName) || defaults.hostName,
    minHostSpeechChars: Math.round(clamp(input.minHostSpeechChars, 1, 500, defaults.minHostSpeechChars)),
    echoWindowMs: Math.round(clamp(input.echoWindowMs, 1000, 300000, defaults.echoWindowMs)),
    maxRecentUtterances: Math.round(clamp(input.maxRecentUtterances, 1, 200, defaults.maxRecentUtterances)),
    duplicateSimilarity: clamp(input.duplicateSimilarity, 0, 1, defaults.duplicateSimilarity),
    hostSpeechEventType: SUPPORTED_EVENT_TYPES.includes(input.hostSpeechEventType) ? input.hostSpeechEventType : defaults.hostSpeechEventType,
    viewerEventTypes: viewerEventTypes.length > 0 ? viewerEventTypes : defaults.viewerEventTypes
  };
}

function sanitizeDecision(decision = {}) {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) return {};
  const sanitized = {};
  if (decision.respond !== undefined) sanitized.respond = normalizeBoolean(decision.respond, false);
  if (decision.score !== undefined) sanitized.score = clamp(decision.score, 0, 1, 0);
  for (const key of ['reason', 'type', 'selection']) {
    if (decision[key] !== undefined && decision[key] !== null) {
      sanitized[key] = safeString(decision[key], 80);
    }
  }
  if (decision.priority !== undefined) {
    sanitized.priority = Math.round(clamp(decision.priority, 0, 100, 0));
  }
  return sanitized;
}

class ConversationCoordinator {
  constructor(config = {}) {
    this.config = normalizeConversationConfig(config);
    this.recentUtterances = [];
    this.lastAcceptedHostSpeechReason = null;
    this.lastRejectedHostSpeechReason = null;
    this.lastHostSpeechDecision = null;
  }

  updateConfig(config = {}) {
    this.config = normalizeConversationConfig(config);
    this._prune(Date.now());
  }

  recordSidekickSpeech(text, metadata = {}) {
    const normalizedText = normalizeSpeechText(text);
    if (!normalizedText) return null;

    const record = {
      type: 'sidekick',
      text: cleanSpeechText(text),
      normalizedText,
      timestamp: this._getTimestamp(metadata),
      metadata: this._sanitizeMetadata(metadata)
    };
    this._remember(record);
    return record;
  }

  recordHostSpeech(text, metadata = {}) {
    const normalizedText = normalizeSpeechText(text);
    if (!normalizedText) return null;

    const record = {
      type: 'host',
      text: cleanSpeechText(text),
      normalizedText,
      timestamp: this._getTimestamp(metadata),
      metadata: this._sanitizeMetadata(metadata)
    };
    this._remember(record);
    return record;
  }

  shouldAcceptHostSpeech(text, metadata = {}) {
    const normalizedText = normalizeSpeechText(text);
    const cleanText = cleanSpeechText(text);
    const timestamp = this._getTimestamp(metadata);

    if (!this.config.enabled) {
      return this._reject('disabled', normalizedText);
    }

    if (!normalizedText) {
      return this._reject('empty', normalizedText);
    }

    if (cleanText.length < Number(this.config.minHostSpeechChars || 0)) {
      return this._reject('too_short', normalizedText);
    }

    this._prune(timestamp);

    if (this._hasRecentMatch(normalizedText, 'sidekick', timestamp)) {
      return this._reject('echo', normalizedText);
    }

    if (this._hasRecentMatch(normalizedText, 'host', timestamp)) {
      return this._reject('duplicate', normalizedText);
    }

    const decision = {
      accept: true,
      reason: 'accepted',
      normalizedText
    };
    this.lastAcceptedHostSpeechReason = decision.reason;
    this.lastHostSpeechDecision = decision;
    return decision;
  }

  buildHostSpeechEvent(text, metadata = {}) {
    const message = cleanSpeechText(text, 500);
    const username = cleanSpeechText(this.config.hostName, 64) || DEFAULT_CONVERSATION_COORDINATOR_CONFIG.hostName;
    const event = {
      eventType: this.config.hostSpeechEventType,
      username,
      userId: safeString(metadata.userId, 128, 'sidekick-host') || 'sidekick-host',
      uniqueId: username,
      nickname: username,
      message,
      comment: message,
      source: safeString(metadata.source, 32, 'host-mic') || 'host-mic',
      isHostSpeech: true
    };

    if (metadata.confidence !== undefined && metadata.confidence !== null) {
      event.confidence = clamp(metadata.confidence, 0, 1, 0);
    }
    if (metadata.language !== undefined && metadata.language !== null) {
      event.language = safeString(metadata.language, 20);
    }
    if (metadata.provider !== undefined && metadata.provider !== null) {
      event.provider = safeString(metadata.provider, 64);
    }
    for (const key of ['startedAt', 'endedAt']) {
      if (metadata[key] !== undefined && metadata[key] !== null) event[key] = safeString(metadata[key], 64);
    }

    return event;
  }

  buildViewerEvent(eventType, data = {}, decision = {}) {
    if (!this.config.viewerEventTypes.includes(eventType)) return null;

    const username = safeString(data.uniqueId || data.username || data.userId || data.nickname, 128, 'Viewer') || 'Viewer';
    const message = cleanSpeechText(data.comment || data.message || '', 500);
    const event = {
      eventType,
      username,
      userId: safeString(data.userId || data.uniqueId || username, 128),
      nickname: safeString(data.nickname || username, 128),
      message,
      comment: message,
      source: 'sidekick-viewer',
      decision: sanitizeDecision(decision)
    };

    if (data.giftName !== undefined && data.giftName !== null) {
      event.giftName = safeString(data.giftName, 160);
    }
    if (data.giftId !== undefined && data.giftId !== null) {
      const numericGiftId = Number(data.giftId);
      event.giftId = Number.isFinite(numericGiftId) ? numericGiftId : safeString(data.giftId, 80);
    }
    for (const key of ['diamondCount', 'repeatCount', 'likeCount', 'totalLikeCount', 'teamMemberLevel']) {
      if (data[key] !== undefined && data[key] !== null) event[key] = Math.round(clamp(data[key], 0, 100000000, 0));
    }
    if (data.followRole !== undefined && data.followRole !== null) {
      event.followRole = safeString(data.followRole, 80);
    }
    if (data.isSubscriber !== undefined && data.isSubscriber !== null) {
      event.isSubscriber = normalizeBoolean(data.isSubscriber, false);
    }

    return event;
  }

  getStatus() {
    const recentSidekickUtteranceCount = this.recentUtterances.filter(item => item.type === 'sidekick').length;
    const recentHostUtteranceCount = this.recentUtterances.filter(item => item.type === 'host').length;
    return {
      enabled: !!this.config.enabled,
      hostName: this.config.hostName,
      minHostSpeechChars: this.config.minHostSpeechChars,
      echoWindowMs: this.config.echoWindowMs,
      maxRecentUtterances: this.config.maxRecentUtterances,
      duplicateSimilarity: this.config.duplicateSimilarity,
      hostSpeechEventType: this.config.hostSpeechEventType,
      viewerEventTypes: [...this.config.viewerEventTypes],
      recentUtteranceCount: this.recentUtterances.length,
      recentSidekickUtteranceCount,
      recentHostUtteranceCount,
      lastAcceptedHostSpeechReason: this.lastAcceptedHostSpeechReason,
      lastRejectedHostSpeechReason: this.lastRejectedHostSpeechReason,
      lastHostSpeechDecision: this.lastHostSpeechDecision
    };
  }

  _reject(reason, normalizedText) {
    const decision = {
      accept: false,
      reason,
      normalizedText
    };
    this.lastRejectedHostSpeechReason = reason;
    this.lastHostSpeechDecision = decision;
    return decision;
  }

  _hasRecentMatch(normalizedText, type, timestamp) {
    const windowMs = Number(this.config.echoWindowMs || 0);
    return this.recentUtterances.some((item) => {
      if (item.type !== type) return false;
      if (windowMs > 0 && timestamp - item.timestamp > windowMs) return false;
      return item.normalizedText === normalizedText;
    });
  }

  _remember(record) {
    this.recentUtterances.push(record);
    this._prune(record.timestamp);
  }

  _prune(timestamp) {
    const maxRecent = Math.max(1, Number(this.config.maxRecentUtterances || 1));
    const windowMs = Number(this.config.echoWindowMs || 0);
    if (windowMs > 0) {
      this.recentUtterances = this.recentUtterances.filter(item => timestamp - item.timestamp <= windowMs);
    }
    if (this.recentUtterances.length > maxRecent) {
      this.recentUtterances = this.recentUtterances.slice(this.recentUtterances.length - maxRecent);
    }
  }

  _getTimestamp(metadata) {
    const value = metadata.now ?? metadata.timestamp ?? Date.now();
    const timestamp = Number(value);
    return Number.isFinite(timestamp) ? timestamp : Date.now();
  }

  _sanitizeMetadata(metadata = {}) {
    const sanitized = {};
    for (const key of ['source', 'eventType', 'username', 'userId', 'confidence', 'language', 'provider']) {
      if (metadata[key] !== undefined && metadata[key] !== null) {
        sanitized[key] = metadata[key];
      }
    }
    return sanitized;
  }
}

module.exports = {
  ConversationCoordinator,
  DEFAULT_CONVERSATION_COORDINATOR_CONFIG,
  SUPPORTED_EVENT_TYPES,
  normalizeConversationConfig,
  normalizeSpeechText
};
