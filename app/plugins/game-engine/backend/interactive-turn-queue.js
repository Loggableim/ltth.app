class InteractiveTurnQueue {
  constructor(database, logger, now = () => Date.now()) {
    this.database = database;
    this.logger = logger;
    this.now = now;
    this.entries = [];
  }

  enqueue(session) {
    if (!session || session.status !== 'active' || !['host', 'viewer'].includes(session.turnRole)) {
      throw new Error('Only an active interactive turn can enter the interactive queue');
    }
    const sessionId = Number(session.sessionId);
    const existing = this.entries.find(entry => entry.sessionId === sessionId);
    if (existing) return { inserted: false, ...existing };

    const entry = {
      sessionId,
      gameType: session.gameType,
      viewerId: session.viewerId,
      viewerDisplayName: session.viewerDisplayName,
      enqueuedAt: this.now(),
      sessionRevision: session.sessionRevision
    };
    const persisted = this.database.enqueueInteractiveTurn(entry);
    const queued = {
      ...entry,
      sequence: persisted.sequence
    };
    this.entries.push(queued);
    this.entries.sort((left, right) => left.sequence - right.sequence);
    this.logger?.debug?.(`[INTERACTIVE QUEUE] Enqueued ${session.gameType} session ${sessionId} at ${queued.sequence}`);
    return { inserted: persisted.inserted, ...queued };
  }

  remove(sessionId) {
    const normalizedId = Number(sessionId);
    const index = this.entries.findIndex(entry => entry.sessionId === normalizedId);
    const persisted = this.database.removeInteractiveTurn(normalizedId);
    if (index === -1) return Boolean(persisted);
    this.entries.splice(index, 1);
    return true;
  }

  rotateHeadToTail(sessionId) {
    const normalizedId = Number(sessionId);
    if (this.entries.length < 2 || this.entries[0]?.sessionId !== normalizedId) {
      return { moved: false, error: 'not_queue_head' };
    }
    const persisted = this.database.rotateInteractiveTurnToTail(normalizedId);
    if (!persisted?.moved) return persisted;
    const [head] = this.entries.splice(0, 1);
    head.sequence = persisted.sequence;
    head.enqueuedAt = this.now();
    this.entries.push(head);
    this.logger?.debug?.(`[INTERACTIVE QUEUE] Rotated session ${normalizedId} to ${head.sequence}`);
    return { moved: true, ...head };
  }

  head() {
    return this.entries[0] || null;
  }

  has(sessionId) {
    return this.entries.some(entry => entry.sessionId === Number(sessionId));
  }

  list() {
    return this.entries.map(entry => ({ ...entry }));
  }

  restore(rows) {
    const seen = new Set();
    this.entries = (rows || [])
      .map(row => ({
        ...row,
        sessionId: Number(row.sessionId),
        sequence: Number(row.sequence)
      }))
      .filter(row => {
        if (!Number.isInteger(row.sessionId) || seen.has(row.sessionId)) return false;
        seen.add(row.sessionId);
        return ['connect4', 'chess'].includes(row.gameType) && Number.isFinite(row.sequence);
      })
      .sort((left, right) => left.sequence - right.sequence);
    return this.list();
  }
}

module.exports = InteractiveTurnQueue;
