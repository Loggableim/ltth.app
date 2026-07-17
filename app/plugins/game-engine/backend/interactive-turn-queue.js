class InteractiveTurnQueue {
  constructor(database, logger, now = () => Date.now()) {
    this.database = database;
    this.logger = logger;
    this.now = now;
    this.entries = [];
  }

  enqueue(session) {
    if (!session || session.status !== 'active' || session.turnRole !== 'host') {
      throw new Error('Only an active host turn can enter the interactive queue');
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
