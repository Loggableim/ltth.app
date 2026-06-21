/**
 * Sidekick Conversation Coordinator
 *
 * Keeps Sidekick-host speech orchestration focused and separate from viewer
 * memory. Host speech is packaged for AnimazingPal; it is not written into the
 * Sidekick viewer memory store here.
 */

const DEFAULT_CONVERSATION_COORDINATOR_CONFIG = {
  enabled: true,
  hostName: 'Host',
  minHostSpeechChars: 3,
  echoWindowMs: 12000,
  maxRecentUtterances: 20,
  duplicateSimilarity: 1,
  hostSpeechEventType: 'sidekick-host-speech',
  viewerEventTypes: ['chat', 'gift', 'follow', 'share', 'subscribe', 'like']
};

function normalizeSpeechText(text) {
  return String(text || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

function cleanSpeechText(text) {
  return String(text || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ');
}

class ConversationCoordinator {
  constructor(config = {}) {
    this.config = {
      ...DEFAULT_CONVERSATION_COORDINATOR_CONFIG,
      ...(config || {})
    };
    this.recentUtterances = [];
    this.lastAcceptedHostSpeechReason = null;
    this.lastRejectedHostSpeechReason = null;
    this.lastHostSpeechDecision = null;
  }

  updateConfig(config = {}) {
    this.config = {
      ...DEFAULT_CONVERSATION_COORDINATOR_CONFIG,
      ...(config || {})
    };
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
    this._remember({
      type: 'host',
      text: cleanText,
      normalizedText,
      timestamp,
      metadata: this._sanitizeMetadata(metadata)
    });
    return decision;
  }

  buildHostSpeechEvent(text, metadata = {}) {
    const event = {
      eventType: this.config.hostSpeechEventType || DEFAULT_CONVERSATION_COORDINATOR_CONFIG.hostSpeechEventType,
      username: cleanSpeechText(this.config.hostName) || DEFAULT_CONVERSATION_COORDINATOR_CONFIG.hostName,
      userId: metadata.userId || 'sidekick-host',
      message: cleanSpeechText(text),
      source: metadata.source || 'host-mic'
    };

    for (const key of ['confidence', 'language', 'provider', 'startedAt', 'endedAt']) {
      if (metadata[key] !== undefined && metadata[key] !== null) {
        event[key] = metadata[key];
      }
    }

    return event;
  }

  buildViewerEvent(eventType, data = {}, decision = {}) {
    const username = data.uniqueId || data.username || data.userId || data.nickname || 'Viewer';
    const message = data.comment || data.message || '';
    const event = {
      eventType,
      username,
      userId: data.userId || data.uniqueId || username,
      nickname: data.nickname || username,
      message,
      comment: data.comment || message,
      source: 'sidekick-viewer',
      decision
    };

    for (const key of [
      'giftName',
      'giftId',
      'diamondCount',
      'repeatCount',
      'likeCount',
      'totalLikeCount',
      'followRole',
      'isSubscriber',
      'teamMemberLevel'
    ]) {
      if (data[key] !== undefined && data[key] !== null) {
        event[key] = data[key];
      }
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
  normalizeSpeechText
};
