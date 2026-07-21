class InteractiveTurnTimers {
  constructor({
    getSession,
    getDisplaySessionId = () => null,
    database,
    onViewerTimeout,
    onHostTimeout,
    now = () => Date.now(),
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    hostCheckpointIntervalMs = 1000
  }) {
    this.getSession = getSession;
    this.getDisplaySessionId = getDisplaySessionId;
    this.database = database;
    this.onViewerTimeout = onViewerTimeout;
    this.onHostTimeout = onHostTimeout;
    this.now = now;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.hostCheckpointIntervalMs = hostCheckpointIntervalMs;
    this.viewerTimers = new Map();
    this.hostTimers = new Map();
  }

  startViewer(session, seconds, { persist = true } = {}) {
    this.prepareViewer(session, seconds, { persist: false });
    return this.resumeViewer(session, { persist });
  }

  prepareViewer(session, seconds, { persist = true } = {}) {
    this.clearViewer(session.sessionId, { persist: false });
    const remaining = Math.max(0, Number(seconds) * 1000);
    session.viewerDeadlineMs = null;
    session.viewerTimeRemainingMs = remaining;
    if (persist) {
      this.database.updateInteractiveState(session.sessionId, {
        viewerDeadlineMs: null,
        viewerTimeRemainingMs: remaining
      });
    }
    return remaining;
  }

  resumeViewer(session, { persist = true } = {}) {
    const sessionId = Number(session.sessionId);
    const running = this.viewerTimers.get(sessionId);
    if (running) return running.deadline;
    if (session.status !== 'active' || session.turnRole !== 'viewer') {
      return session.viewerDeadlineMs;
    }
    const remaining = session.viewerTimeRemainingMs == null
      ? NaN
      : Number(session.viewerTimeRemainingMs);
    if (!Number.isFinite(remaining)) return session.viewerDeadlineMs;
    const deadline = this.now() + Math.max(0, remaining);
    session.viewerDeadlineMs = deadline;
    session.viewerTimeRemainingMs = null;
    if (persist) {
      this.database.updateInteractiveState(sessionId, {
        viewerDeadlineMs: deadline,
        viewerTimeRemainingMs: null
      });
    }
    this._scheduleViewer(session, Math.max(0, remaining));
    return deadline;
  }

  _scheduleViewer(session, remainingMs = null) {
    const deadline = Number(session.viewerDeadlineMs);
    if (!Number.isFinite(deadline)) return;
    const sessionId = Number(session.sessionId);
    const revision = session.sessionRevision;
    const startedAt = this.now();
    const remaining = remainingMs == null
      ? Math.max(0, deadline - startedAt)
      : Math.max(0, Number(remainingMs) || 0);
    const delay = Math.max(0, deadline - startedAt);
    const timeout = this.setTimeoutFn(() => {
      this.viewerTimers.delete(sessionId);
      const current = this.getSession(sessionId);
      if (
        !current ||
        current.status !== 'active' ||
        current.turnRole !== 'viewer' ||
        current.sessionRevision !== revision ||
        current.viewerDeadlineMs !== deadline ||
        this.getDisplaySessionId() !== sessionId ||
        this.now() < deadline
      ) {
        return;
      }
      this.onViewerTimeout?.(sessionId, revision);
    }, delay);
    timeout.unref?.();
    this.viewerTimers.set(sessionId, { timeout, deadline, startedAt, remaining, revision });
  }

  pauseViewer(session, { persist = true } = {}) {
    const sessionId = Number(session.sessionId);
    const running = this.viewerTimers.get(sessionId);
    if (running) this.clearTimeoutFn(running.timeout);
    this.viewerTimers.delete(sessionId);

    let remaining = session.viewerTimeRemainingMs == null
      ? NaN
      : Number(session.viewerTimeRemainingMs);
    if (running) {
      remaining = Math.max(0, running.remaining - (this.now() - running.startedAt));
    } else if (
      session.viewerDeadlineMs != null &&
      Number.isFinite(Number(session.viewerDeadlineMs))
    ) {
      remaining = Math.max(0, Number(session.viewerDeadlineMs) - this.now());
    }
    if (!Number.isFinite(remaining)) return null;

    session.viewerDeadlineMs = null;
    session.viewerTimeRemainingMs = remaining;
    if (persist) {
      this.database.updateInteractiveState(sessionId, {
        viewerDeadlineMs: null,
        viewerTimeRemainingMs: remaining
      });
    }
    return remaining;
  }

  clearViewer(sessionId, { persist = true } = {}) {
    const normalizedId = Number(sessionId);
    const running = this.viewerTimers.get(normalizedId);
    if (running) this.clearTimeoutFn(running.timeout);
    this.viewerTimers.delete(normalizedId);
    const session = this.getSession(normalizedId);
    if (session) {
      session.viewerDeadlineMs = null;
      session.viewerTimeRemainingMs = null;
    }
    if (persist && session) {
      this.database.updateInteractiveState(normalizedId, {
        viewerDeadlineMs: null,
        viewerTimeRemainingMs: null
      });
    }
  }

  restore(session) {
    if (session.turnRole === 'viewer' && session.viewerDeadlineMs != null) {
      this._scheduleViewer(session, Math.max(0, Number(session.viewerDeadlineMs) - this.now()));
    }
  }

  resumeHostChess(session) {
    if (
      session.gameType !== 'chess' ||
      session.status !== 'active' ||
      session.turnRole !== 'host' ||
      this.hostTimers.has(Number(session.sessionId))
    ) {
      return session.hostTimeRemainingMs;
    }
    const sessionId = Number(session.sessionId);
    const revision = session.sessionRevision;
    const remaining = Math.max(0, Number(session.hostTimeRemainingMs) || 0);
    const startedAt = this.now();
    const timeout = this.setTimeoutFn(() => {
      const running = this.hostTimers.get(sessionId);
      if (running?.checkpoint) this.clearIntervalFn(running.checkpoint);
      this.hostTimers.delete(sessionId);
      const current = this.getSession(sessionId);
      if (
        !current ||
        current.status !== 'active' ||
        current.gameType !== 'chess' ||
        current.turnRole !== 'host' ||
        current.sessionRevision !== revision
      ) {
        return;
      }
      current.hostTimeRemainingMs = 0;
      this.database.updateInteractiveState(sessionId, {
        hostTimeRemainingMs: 0
      });
      this.onHostTimeout?.(sessionId, revision);
    }, remaining);
    timeout.unref?.();
    const checkpoint = this.setIntervalFn(() => {
      const running = this.hostTimers.get(sessionId);
      const current = this.getSession(sessionId);
      if (
        !running ||
        !current ||
        current.status !== 'active' ||
        current.gameType !== 'chess' ||
        current.turnRole !== 'host' ||
        current.sessionRevision !== revision
      ) {
        return;
      }
      const checkpointRemaining = Math.max(0, remaining - (this.now() - startedAt));
      current.hostTimeRemainingMs = checkpointRemaining;
      this.database.updateInteractiveState(sessionId, {
        hostTimeRemainingMs: checkpointRemaining
      });
    }, this.hostCheckpointIntervalMs);
    checkpoint.unref?.();
    this.hostTimers.set(sessionId, { timeout, checkpoint, startedAt, remaining, revision });
    return remaining;
  }

  pauseHostChess(session, { persist = true } = {}) {
    const sessionId = Number(session.sessionId);
    const running = this.hostTimers.get(sessionId);
    if (!running) return session.hostTimeRemainingMs;
    this.clearTimeoutFn(running.timeout);
    if (running.checkpoint) this.clearIntervalFn(running.checkpoint);
    this.hostTimers.delete(sessionId);
    const remaining = Math.max(0, running.remaining - (this.now() - running.startedAt));
    session.hostTimeRemainingMs = remaining;
    if (persist) {
      this.database.updateInteractiveState(sessionId, {
        hostTimeRemainingMs: remaining
      });
    }
    return remaining;
  }

  getHostRemaining(session) {
    const running = this.hostTimers.get(Number(session.sessionId));
    if (!running) return session.hostTimeRemainingMs;
    return Math.max(0, running.remaining - (this.now() - running.startedAt));
  }

  clear(sessionId) {
    const normalizedId = Number(sessionId);
    this.clearViewer(normalizedId, { persist: false });
    const running = this.hostTimers.get(normalizedId);
    if (running) {
      this.clearTimeoutFn(running.timeout);
      if (running.checkpoint) this.clearIntervalFn(running.checkpoint);
    }
    this.hostTimers.delete(normalizedId);
  }

  destroy() {
    for (const sessionId of Array.from(this.hostTimers.keys())) {
      const session = this.getSession(sessionId);
      if (session) this.pauseHostChess(session, { persist: true });
    }
    for (const [sessionId, running] of Array.from(this.viewerTimers.entries())) {
      const session = this.getSession(sessionId);
      if (session) this.pauseViewer(session, { persist: true });
      else this.clearTimeoutFn(running.timeout);
    }
    this.viewerTimers.clear();
    this.hostTimers.clear();
  }
}

module.exports = InteractiveTurnTimers;
