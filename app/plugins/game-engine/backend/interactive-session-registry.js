class InteractiveSessionRegistry {
  constructor({ maxSessions = 20 } = {}) {
    const parsedLimit = Number(maxSessions);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      throw new Error('Interactive session limit must be between 1 and 50');
    }
    this.maxSessions = parsedLimit;
    this.sessions = new Map();
    this.viewerSessions = new Map();
  }

  _normalize(session) {
    const sessionId = Number(session?.sessionId);
    const viewerId = String(session?.viewerId || '').trim();
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      throw new Error('Interactive session ID must be a positive integer');
    }
    if (!viewerId) {
      throw new Error('Interactive viewer identity is required');
    }
    if (!['connect4', 'chess'].includes(session.gameType)) {
      throw new Error(`Unsupported interactive game type: ${session.gameType}`);
    }
    return {
      ...session,
      sessionId,
      viewerId,
      status: session.status || 'active'
    };
  }

  add(session) {
    const normalized = this._normalize(session);
    if (this.sessions.has(normalized.sessionId)) {
      throw new Error(`Interactive session ${normalized.sessionId} already exists`);
    }
    if (this.viewerSessions.has(normalized.viewerId)) {
      throw new Error(`Viewer ${normalized.viewerId} already has an active interactive match`);
    }
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Interactive session limit of ${this.maxSessions} reached`);
    }
    this.sessions.set(normalized.sessionId, normalized);
    this.viewerSessions.set(normalized.viewerId, normalized.sessionId);
    return normalized;
  }

  restore(session) {
    return this.add(session);
  }

  get(sessionId) {
    return this.sessions.get(Number(sessionId)) || null;
  }

  getByViewer(viewerId) {
    const sessionId = this.viewerSessions.get(String(viewerId || '').trim());
    return sessionId ? this.get(sessionId) : null;
  }

  remove(sessionId) {
    const normalizedId = Number(sessionId);
    const session = this.sessions.get(normalizedId);
    if (!session) return null;
    this.sessions.delete(normalizedId);
    this.viewerSessions.delete(session.viewerId);
    return session;
  }

  list() {
    return Array.from(this.sessions.values());
  }

  summaries(now = Date.now()) {
    return this.list().map(session => {
      const state = session.adapter?.getState?.() || {};
      return {
        sessionId: session.sessionId,
        gameType: session.gameType,
        viewerId: session.viewerId,
        viewerDisplayName: session.viewerDisplayName,
        hostDisplayName: session.hostDisplayName,
        config: session.config ? { ...session.config } : null,
        sessionRevision: session.sessionRevision,
        turnRole: session.turnRole,
        viewerDeadlineMs: session.viewerDeadlineMs ?? null,
        viewerTimeRemainingMs: session.viewerDeadlineMs == null
          ? null
          : Math.max(0, session.viewerDeadlineMs - now),
        hostTimeRemainingMs: session.hostTimeRemainingMs ?? null,
        moveCount: Number(state.moveCount) || 0,
        lastActivityAt: session.lastActivityAt,
        status: session.status,
        state
      };
    });
  }
}

module.exports = InteractiveSessionRegistry;
