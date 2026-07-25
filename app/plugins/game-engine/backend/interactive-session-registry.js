function getViewerTimeRemainingMs(session, now = Date.now()) {
  if (!session) return null;
  if (session.viewerDeadlineMs != null) {
    const deadline = Number(session.viewerDeadlineMs);
    if (Number.isFinite(deadline)) return Math.max(0, deadline - now);
  }
  if (session.viewerTimeRemainingMs == null) return null;
  const remaining = Number(session.viewerTimeRemainingMs);
  return Number.isFinite(remaining) ? Math.max(0, remaining) : null;
}

class InteractiveSessionRegistry {
  constructor({ maxSessions = 20 } = {}) {
    const parsedLimit = Number(maxSessions);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      throw new Error('Interactive session limit must be between 1 and 50');
    }
    this.maxSessions = parsedLimit;
    this.sessions = new Map();
    this.viewerSessions = new Map();
    this.participantSessions = new Map();
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
    const rawParticipants = Array.isArray(session.participants) && session.participants.length > 0
      ? session.participants
      : [
        { id: viewerId, displayName: session.viewerDisplayName || viewerId, role: 'viewer', avatarSource: '' },
        { id: 'streamer', displayName: session.hostDisplayName || 'Streamer', role: 'host', avatarSource: '' }
      ];
    const participants = rawParticipants.map(participant => ({
      id: String(participant?.id || '').trim(),
      displayName: String(participant?.displayName || participant?.id || '').trim(),
      role: participant?.role || (participant?.id === 'streamer' ? 'host' : 'viewer'),
      avatarSource: String(participant?.avatarSource || '')
    }));
    if (participants.length !== 2 || participants.some(participant => !participant.id || !participant.displayName)) {
      throw new Error('Interactive sessions require two identified participants');
    }
    const participantIds = participants.map(participant => participant.id);
    if (new Set(participantIds).size !== participantIds.length) {
      throw new Error('Interactive session participants must be unique');
    }
    const turnPlayerId = String(session.turnPlayerId || (session.turnRole === 'host'
      ? participants.find(participant => participant.role === 'host')?.id
      : viewerId) || '').trim();
    if (!participantIds.includes(turnPlayerId)) {
      throw new Error('Interactive turn player must be a participant');
    }
    return {
      ...session,
      sessionId,
      viewerId,
      participantIds,
      participants,
      turnPlayerId,
      status: session.status || 'active'
    };
  }

  add(session) {
    const normalized = this._normalize(session);
    if (this.sessions.has(normalized.sessionId)) {
      throw new Error(`Interactive session ${normalized.sessionId} already exists`);
    }
    for (const participant of normalized.participants) {
      if (participant.role === 'host') continue;
      if (this.participantSessions.has(participant.id)) {
        throw new Error(`Viewer ${participant.id} already has an active interactive match`);
      }
    }
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Interactive session limit of ${this.maxSessions} reached`);
    }
    this.sessions.set(normalized.sessionId, normalized);
    this.viewerSessions.set(normalized.viewerId, normalized.sessionId);
    for (const participant of normalized.participants) {
      if (participant.role !== 'host') this.participantSessions.set(participant.id, normalized.sessionId);
    }
    return normalized;
  }

  restore(session) {
    return this.add(session);
  }

  get(sessionId) {
    return this.sessions.get(Number(sessionId)) || null;
  }

  getByViewer(viewerId) {
    return this.getByParticipant(viewerId);
  }

  getByParticipant(participantId) {
    const normalizedId = String(participantId || '').trim();
    const sessionId = this.participantSessions.get(normalizedId) || this.viewerSessions.get(normalizedId);
    return sessionId ? this.get(sessionId) : null;
  }

  remove(sessionId) {
    const normalizedId = Number(sessionId);
    const session = this.sessions.get(normalizedId);
    if (!session) return null;
    this.sessions.delete(normalizedId);
    this.viewerSessions.delete(session.viewerId);
    for (const participant of session.participants || []) {
      if (participant.role !== 'host') this.participantSessions.delete(participant.id);
    }
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
        participantIds: [...session.participantIds],
        participants: session.participants.map(participant => ({ ...participant })),
        turnPlayerId: session.turnPlayerId,
        config: session.config ? { ...session.config } : null,
        sessionRevision: session.sessionRevision,
        turnRole: session.turnRole,
        viewerDeadlineMs: session.viewerDeadlineMs ?? null,
        viewerTimeRemainingMs: getViewerTimeRemainingMs(session, now),
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
module.exports.getViewerTimeRemainingMs = getViewerTimeRemainingMs;
