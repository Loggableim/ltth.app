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
  conversationWindowMs: 120000,
  conversationActiveWindowMs: 30000,
  conversationTurnLimit: 8,
  // Reserved for a future fuzzy duplicate implementation. Current protection
  // intentionally uses exact normalized matches for deterministic safety.
  duplicateSimilarity: 1,
  hostSpeechEventType: 'chat',
  viewerEventTypes: ['chat', 'gift', 'follow', 'share', 'subscribe', 'like'],
  hostReplyProbability: 0.75,
  hostMinConfidence: 0.35,
  hostContextCooldownMs: 6000,
  hostOvertalkCooldownMs: 1800,
  hostLongFormWordLimit: 48
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
    conversationWindowMs: Math.round(clamp(input.conversationWindowMs, 5000, 600000, defaults.conversationWindowMs)),
    conversationActiveWindowMs: Math.round(clamp(input.conversationActiveWindowMs, 1000, 600000, defaults.conversationActiveWindowMs)),
    conversationTurnLimit: Math.round(clamp(input.conversationTurnLimit, 2, 20, defaults.conversationTurnLimit)),
    duplicateSimilarity: clamp(input.duplicateSimilarity, 0, 1, defaults.duplicateSimilarity),
    hostSpeechEventType: SUPPORTED_EVENT_TYPES.includes(input.hostSpeechEventType) ? input.hostSpeechEventType : defaults.hostSpeechEventType,
    viewerEventTypes: viewerEventTypes.length > 0 ? viewerEventTypes : defaults.viewerEventTypes,
    hostReplyProbability: clamp(input.hostReplyProbability, 0, 1, defaults.hostReplyProbability),
    hostMinConfidence: clamp(input.hostMinConfidence, 0, 1, defaults.hostMinConfidence),
    hostContextCooldownMs: Math.round(clamp(input.hostContextCooldownMs, 0, 60 * 60 * 1000, defaults.hostContextCooldownMs)),
    hostOvertalkCooldownMs: Math.round(clamp(input.hostOvertalkCooldownMs, 0, 5 * 60 * 1000, defaults.hostOvertalkCooldownMs)),
    hostLongFormWordLimit: Math.round(clamp(input.hostLongFormWordLimit, 1, 500, defaults.hostLongFormWordLimit))
  };
}

function sanitizeDecision(decision = {}) {
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) return {};
  const sanitized = {};
  if (decision.respond !== undefined) {
    sanitized.respond = normalizeBoolean(decision.respond, false);
  }
  if (decision.score !== undefined) sanitized.score = clamp(decision.score, 0, 1, 0);
  for (const key of ['reason', 'type', 'selection', 'mode', 'source', 'matchedMention']) {
    if (decision[key] !== undefined && decision[key] !== null) {
      sanitized[key] = safeString(decision[key], 80);
    }
  }
  if (decision.skipReason !== undefined && decision.skipReason !== null) {
    sanitized.skipReason = safeString(decision.skipReason, 80);
  }
  if (decision.priority !== undefined) {
    sanitized.priority = Math.round(clamp(decision.priority, 0, 100, 0));
  }
  if (decision.threshold !== undefined) {
    sanitized.threshold = clamp(decision.threshold, 0, 1, 0);
  }
  if (decision.probability !== undefined) {
    sanitized.probability = clamp(decision.probability, 0, 1, 0);
  }
  if (decision.roll !== undefined) {
    sanitized.roll = Number.isFinite(Number(decision.roll)) ? Number(decision.roll) : 0;
  }
  if (decision.features && typeof decision.features === 'object') {
    sanitized.features = {};
    const allowedFeatureKeys = ['isQuestion', 'isLongForm', 'isGreeting', 'wordCount', 'charCount'];
    for (const key of allowedFeatureKeys) {
      if (decision.features[key] !== undefined) {
        sanitized.features[key] = decision.features[key];
      }
    }
  }
  if (Array.isArray(decision.mentionTerms)) {
    sanitized.mentionTerms = decision.mentionTerms
      .map((term) => safeString(term, 40))
      .filter(Boolean)
      .slice(0, 20);
  }
  return sanitized;
}

function sanitizeConversationSummary(summary = {}) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null;

  const sanitized = {};
  if (summary.uid !== undefined && summary.uid !== null) {
    sanitized.uid = safeString(summary.uid, 128);
  }
  if (summary.nickname !== undefined && summary.nickname !== null) {
    sanitized.nickname = safeString(summary.nickname, 128);
  }
  if (summary.messageCount !== undefined && summary.messageCount !== null) {
    sanitized.messageCount = Math.round(clamp(summary.messageCount, 0, 10000, 0));
  }
  if (summary.summary !== undefined && summary.summary !== null) {
    sanitized.summary = safeString(summary.summary, 1200);
  }
  if (Array.isArray(summary.recentMessages)) {
    sanitized.recentMessages = summary.recentMessages
      .map((entry) => {
        if (typeof entry === 'string') {
          const text = entry.trim();
          if (!text) return null;
          return { text: safeString(text, 160) };
        }
        if (!entry || typeof entry !== 'object') return null;
        const text = safeString(entry.text, 160);
        if (!text) return null;
        const ts = Number(entry.ts);
        return {
          text,
          ...(Number.isFinite(ts) ? { ts } : {})
        };
      })
      .filter(Boolean)
      .slice(0, 5);
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function sanitizeUserContext(userContext = {}) {
  if (!userContext || typeof userContext !== 'object' || Array.isArray(userContext)) return null;

  const sanitized = {};
  for (const key of ['uid', 'nickname']) {
    if (userContext[key] !== undefined && userContext[key] !== null) {
      sanitized[key] = safeString(userContext[key], 128);
    }
  }
  for (const key of ['firstSeen', 'lastSeen', 'lastJoin', 'lastFollow', 'lastSub', 'lastShare', 'lastGift', 'lastLike', 'lastGreet']) {
    if (userContext[key] !== undefined && userContext[key] !== null) {
      const value = Number(userContext[key]);
      if (Number.isFinite(value)) sanitized[key] = Math.round(value);
    }
  }
  for (const key of ['likes', 'gifts', 'follows', 'subs', 'shares', 'joins', 'messageCount']) {
    if (userContext[key] !== undefined && userContext[key] !== null) {
      sanitized[key] = Math.round(clamp(userContext[key], 0, 1000000, 0));
    }
  }
  for (const key of ['isFollower', 'isSubscriber', 'isModerator']) {
    if (userContext[key] !== undefined && userContext[key] !== null) {
      sanitized[key] = normalizeBoolean(userContext[key], false);
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function sanitizeRoleFlags(roleFlags = {}) {
  if (!roleFlags || typeof roleFlags !== 'object' || Array.isArray(roleFlags)) return null;

  const sanitized = {};
  for (const key of ['isFollower', 'isSubscriber', 'isModerator']) {
    if (roleFlags[key] !== undefined && roleFlags[key] !== null) {
      sanitized[key] = normalizeBoolean(roleFlags[key], false);
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function countWords(text = '') {
  return safeString(text, 2000)
    .split(/\s+/)
    .filter(Boolean).length;
}

function hasQuestionStructure(cleanText) {
  if (!cleanText) return false;
  if (cleanText.endsWith('?')) return true;
  const startsWithQuestionWord = /^(wer|was|wie|wann|wo|wieso|warum|weshalb|was ist|was ist|wie lange|kann|können|kannst|sind|war|wie viele|wie viel|is|are|do|does|did|can|could|would|should|who|what|where|when|why|which|who's|what's)\b/i.test(cleanText);
  return startsWithQuestionWord;
}

function isGreeting(text) {
  return /^(hey|hi|hallo|servus|moin|guten tag|guten abend|guten morgen|hello|yo)\b/i.test(text);
}

function buildHostSpeechFeatures(text, config = {}) {
  const normalized = normalizeSpeechText(text);
  const clean = cleanSpeechText(text);
  const wordCount = countWords(clean);
  const longFormLimit = Math.max(1, Number(config.hostLongFormWordLimit || 0) || 48);
  const isLongForm = wordCount > 0 && wordCount > longFormLimit;
  return {
    isQuestion: hasQuestionStructure(clean) || hasQuestionStructure(normalized),
    isGreeting: isGreeting(clean),
    isLongForm,
    wordCount,
    charCount: clean.length
  };
}

function computeHostSpeechScore(features, config) {
  let score = 0.45;
  if (features.isQuestion) score += 0.35;
  if (features.isGreeting) score += 0.15;
  if (features.isLongForm) score -= 0.35;
  return clamp(score, 0, 1, 0.45);
}

class ConversationCoordinator {
  constructor(config = {}) {
    this.config = normalizeConversationConfig(config);
    this.recentUtterances = [];
    this.lastAcceptedHostSpeechReason = null;
    this.lastRejectedHostSpeechReason = null;
    this.lastHostSpeechDecision = null;
    this.lastHostSpeechDecisionAt = null;
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

  getConversationState(options = {}) {
    const now = this._getTimestamp(options);
    const windowMs = Math.max(1000, Number(this.config.conversationWindowMs || 0));
    const activeWindowMs = Math.max(1000, Number(this.config.conversationActiveWindowMs || 0));
    const turnLimit = Math.max(2, Number(this.config.conversationTurnLimit || 0));
    const recentUtterances = this.recentUtterances
      .filter((item) => Number.isFinite(item.timestamp) && (now - item.timestamp) <= windowMs)
      .slice(-turnLimit);

    const recentTurns = recentUtterances.map((item) => ({
      speaker: item.type,
      text: item.text,
      normalizedText: item.normalizedText,
      timestamp: item.timestamp,
      ageMs: Math.max(0, now - item.timestamp),
      source: item.metadata?.source || null,
      eventType: item.metadata?.eventType || null,
      username: item.metadata?.username || null
    }));

    const lastTurn = recentTurns.length > 0 ? recentTurns[recentTurns.length - 1] : null;
    const lastHostSpeech = [...recentTurns].reverse().find((item) => item.speaker === 'host') || null;
    const lastSidekickSpeech = [...recentTurns].reverse().find((item) => item.speaker === 'sidekick') || null;
    const active = Boolean(lastTurn && lastTurn.ageMs <= activeWindowMs && recentTurns.length >= 2);
    const summaryParts = [];
    if (active) summaryParts.push('Dialog aktiv');
    if (lastHostSpeech) summaryParts.push(`Host: ${lastHostSpeech.text}`);
    if (lastSidekickSpeech) summaryParts.push(`Sidekick: ${lastSidekickSpeech.text}`);
    if (recentTurns.length > 0) summaryParts.push(`Turns=${recentTurns.length}`);

    return {
      active,
      hostName: this.config.hostName,
      turnCount: recentTurns.length,
      lastSpeaker: lastTurn?.speaker || null,
      lastHostSpeech,
      lastSidekickSpeech,
      recentTurns,
      summary: summaryParts.join(' | ') || null,
      windowMs,
      activeWindowMs,
      lastUpdatedAt: lastTurn?.timestamp || null
    };
  }

  shouldAcceptHostSpeech(text, metadata = {}) {
    const normalizedText = normalizeSpeechText(text);
    const cleanText = cleanSpeechText(text);
    const timestamp = this._getTimestamp(metadata);
    const confidence = Number(metadata?.confidence);
    const features = buildHostSpeechFeatures(cleanText, this.config);
    const conversationState = this.getConversationState({ now: timestamp });

    if (!this.config.enabled) {
      return this._reject('disabled', normalizedText);
    }

    if (!normalizedText) {
      return this._reject('empty', normalizedText);
    }

    if (cleanText.length < Number(this.config.minHostSpeechChars || 0)) {
      return this._reject('too_short', normalizedText, features, 0, timestamp);
    }

    const activeConversation = conversationState.active;
    const contextCooldownMs = Math.max(0, Number(this.config.hostContextCooldownMs || 0));
    const effectiveContextCooldownMs = activeConversation
      ? Math.min(contextCooldownMs, 2500)
      : contextCooldownMs;
    if (effectiveContextCooldownMs > 0 && this.lastHostSpeechDecisionAt && (timestamp - this.lastHostSpeechDecisionAt) < effectiveContextCooldownMs) {
      return this._reject('active_pause', normalizedText, features, 0, timestamp);
    }

    const overtalkCooldownMs = Math.max(0, Number(this.config.hostOvertalkCooldownMs || 0));
    const effectiveOvertalkCooldownMs = activeConversation
      ? Math.min(overtalkCooldownMs, 900)
      : overtalkCooldownMs;
    const lastHostRelatedUtterance = this._getMostRecentUtteranceTimestamp(['sidekick', 'host'], timestamp);
    if (effectiveOvertalkCooldownMs > 0 && Number.isFinite(lastHostRelatedUtterance) && (timestamp - lastHostRelatedUtterance) < effectiveOvertalkCooldownMs) {
      return this._reject('overtalk', normalizedText, features, 0, timestamp);
    }

    if (features.wordCount > Number(this.config.hostLongFormWordLimit || 0)) {
      return this._reject('context_unclear', normalizedText, {
        ...features,
        isLongForm: true
      }, 0, timestamp);
    }

    const score = computeHostSpeechScore(features, this.config);
    const confidenceValue = Number.isFinite(confidence) ? confidence : null;
    if (Number.isFinite(confidenceValue) && confidenceValue < this.config.hostMinConfidence) {
      return this._reject('low_confidence', normalizedText, { ...features, confidence: confidenceValue }, confidenceValue, timestamp);
    }

    if (Number.isFinite(confidenceValue) && score < this.config.hostMinConfidence) {
      return this._reject('low_score', normalizedText, { ...features, confidence: confidenceValue }, score, timestamp);
    }

    const conversationBoost = activeConversation ? 0.15 : 0;
    const effectiveReplyProbability = Math.min(1, Math.max(0, Number(this.config.hostReplyProbability) + conversationBoost));
    if (Math.random() > (effectiveReplyProbability * score)) {
      return this._reject('low_score', normalizedText, { ...features, confidence: confidenceValue }, score, timestamp);
    }

    this._prune(timestamp);

    if (this._hasRecentMatch(normalizedText, 'sidekick', timestamp)) {
      return this._reject('echo', normalizedText, features, score, timestamp);
    }

    if (this._hasRecentMatch(normalizedText, 'host', timestamp)) {
      return this._reject('duplicate', normalizedText, features, score, timestamp);
    }

    const decision = {
      accept: true,
      respond: true,
      score,
      reason: 'accepted',
      selection: 'host-speech',
      type: 'host',
      features,
      normalizedText,
      conversationState,
      ...(Number.isFinite(confidence) ? { confidence } : {}),
    };
    this.lastAcceptedHostSpeechReason = decision.reason;
    this.lastHostSpeechDecision = decision;
    this.lastHostSpeechDecisionAt = timestamp;
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
    event.conversationState = this.getConversationState({ now: metadata.now ?? metadata.timestamp ?? Date.now() });
    event.conversationHistory = Array.isArray(event.conversationState?.recentTurns)
      ? event.conversationState.recentTurns
      : [];
    for (const key of ['startedAt', 'endedAt']) {
      if (metadata[key] !== undefined && metadata[key] !== null) event[key] = safeString(metadata[key], 64);
    }

    return event;
  }

  buildViewerEvent(eventType, data = {}, decision = {}) {
    if (!this.config.viewerEventTypes.includes(eventType)) return null;

    const username = safeString(data.uniqueId || data.username || data.userId || data.nickname, 128, 'Viewer') || 'Viewer';
    const message = cleanSpeechText(data.comment || data.message || '', 500);
    const conversationSummary = sanitizeConversationSummary(data.conversationSummary);
    const userContext = sanitizeUserContext(data.userContext);
    const roleFlags = sanitizeRoleFlags(data.roleFlags);
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

    if (conversationSummary) {
      event.conversationSummary = conversationSummary;
    }
    if (userContext) {
      event.userContext = userContext;
    }
    if (roleFlags) {
      event.roleFlags = roleFlags;
    }
    event.conversationState = this.getConversationState({ now: data.now ?? decision.now ?? Date.now() });
    event.conversationHistory = Array.isArray(event.conversationState?.recentTurns)
      ? event.conversationState.recentTurns
      : [];
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
    const followerValue = data.isFollower ?? data.follower ?? roleFlags?.isFollower ?? userContext?.isFollower;
    const subscriberValue = data.isSubscriber ?? data.subscriber ?? roleFlags?.isSubscriber ?? userContext?.isSubscriber;
    const moderatorValue = data.isModerator ?? data.moderator ?? roleFlags?.isModerator ?? userContext?.isModerator;
    if (followerValue !== undefined && followerValue !== null) {
      event.isFollower = normalizeBoolean(followerValue, false);
    }
    if (subscriberValue !== undefined && subscriberValue !== null) {
      event.isSubscriber = normalizeBoolean(subscriberValue, false);
    }
    if (moderatorValue !== undefined && moderatorValue !== null) {
      event.isModerator = normalizeBoolean(moderatorValue, false);
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
      hostReplyProbability: this.config.hostReplyProbability,
      hostMinConfidence: this.config.hostMinConfidence,
      hostContextCooldownMs: this.config.hostContextCooldownMs,
      hostOvertalkCooldownMs: this.config.hostOvertalkCooldownMs,
      hostLongFormWordLimit: this.config.hostLongFormWordLimit,
      conversationWindowMs: this.config.conversationWindowMs,
      conversationActiveWindowMs: this.config.conversationActiveWindowMs,
      conversationTurnLimit: this.config.conversationTurnLimit,
      viewerEventTypes: [...this.config.viewerEventTypes],
      recentUtteranceCount: this.recentUtterances.length,
      recentSidekickUtteranceCount,
      recentHostUtteranceCount,
      conversationState: this.getConversationState(),
      lastAcceptedHostSpeechReason: this.lastAcceptedHostSpeechReason,
      lastRejectedHostSpeechReason: this.lastRejectedHostSpeechReason,
      lastHostSpeechDecisionAt: this.lastHostSpeechDecisionAt,
      lastHostSpeechDecision: this.lastHostSpeechDecision
    };
  }

  _reject(reason, normalizedText, features = null, score = 0, timestamp = null) {
    const decisionAt = Number.isFinite(timestamp) ? timestamp : this._getTimestamp({});
    const decision = {
      accept: false,
      respond: false,
      score,
      reason,
      normalizedText,
      confidence: features?.confidence,
      features: features ? {
        isQuestion: !!features.isQuestion,
        isLongForm: !!features.isLongForm,
        isGreeting: !!features.isGreeting,
        wordCount: features.wordCount,
        charCount: features.charCount
      } : undefined
    };
    this.lastRejectedHostSpeechReason = reason;
    this.lastHostSpeechDecision = decision;
    this.lastHostSpeechDecisionAt = decisionAt;
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

  _getMostRecentUtteranceTimestamp(types = [], now = Date.now()) {
    const referenceNow = Number(now);
    const fallbackNow = Number.isFinite(referenceNow) ? referenceNow : Date.now();
    const acceptedTypes = new Set(Array.isArray(types) ? types : []);
    let timestamp = null;
    for (let index = this.recentUtterances.length - 1; index >= 0; index -= 1) {
      const item = this.recentUtterances[index];
      if (acceptedTypes.size > 0 && !acceptedTypes.has(item.type)) continue;
      const itemTimestamp = Number(item.timestamp);
      if (!Number.isFinite(itemTimestamp)) continue;
      if (timestamp === null || itemTimestamp > timestamp) {
        timestamp = itemTimestamp;
      }
    }
    if (timestamp === null) {
      return fallbackNow - Math.max(
        Number(this.config.hostContextCooldownMs || 0),
        Number(this.config.hostOvertalkCooldownMs || 0)
      );
    }
    return timestamp;
  }
}

module.exports = {
  ConversationCoordinator,
  DEFAULT_CONVERSATION_COORDINATOR_CONFIG,
  SUPPORTED_EVENT_TYPES,
  normalizeConversationConfig,
  normalizeSpeechText
};
