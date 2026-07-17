class InteractiveTurnTimers {
  constructor({
    getSession,
    database,
    onViewerTimeout,
    onHostTimeout,
    now = () => Date.now(),
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout
  }) {
    this.getSession = getSession;
    this.database = database;
    this.onViewerTimeout = onViewerTimeout;
    this.onHostTimeout = onHostTimeout;
    this.now = now;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.viewerTimers = new Map();
    this.hostTimers = new Map();
  }

  startViewer(session, seconds, { persist = true } = {}) {
    this.clearViewer(session.sessionId, { persist: false });
    const deadline = this.now() + (Number(seconds) * 1000);
    session.viewerDeadlineMs = deadline;
    if (persist) {
      this.database.updateInteractiveState(session.sessionId, {
        viewerDeadlineMs: deadline
      });
    }
    this._scheduleViewer(session);
    return deadline;
  }

  _scheduleViewer(session) {
    const deadline = Number(session.viewerDeadlineMs);
    if (!Number.isFinite(deadline)) return;
    const sessionId = Number(session.sessionId);
    const revision = session.sessionRevision;
    const delay = Math.max(0, deadline - this.now());
    const timeout = this.setTimeoutFn(() => {
      this.viewerTimers.delete(sessionId);
      const current = this.getSession(sessionId);
      if (
        !current ||
        current.status !== 'active' ||
        current.turnRole !== 'viewer' ||
        current.sessionRevision !== revision ||
        current.viewerDeadlineMs !== deadline ||
        this.now() < deadline
      ) {
        return;
      }
      this.onViewerTimeout?.(sessionId, revision);
    }, delay);
    timeout.unref?.();
    this.viewerTimers.set(sessionId, timeout);
  }

  clearViewer(sessionId, { persist = true } = {}) {
    const normalizedId = Number(sessionId);
    const timeout = this.viewerTimers.get(normalizedId);
    if (timeout) this.clearTimeoutFn(timeout);
    this.viewerTimers.delete(normalizedId);
    const session = this.getSession(normalizedId);
    if (session) session.viewerDeadlineMs = null;
    if (persist && session) {
      this.database.updateInteractiveState(normalizedId, {
        viewerDeadlineMs: null
      });
    }
  }

  restore(session) {
    if (session.turnRole === 'viewer' && session.viewerDeadlineMs != null) {
      this._scheduleViewer(session);
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
    this.hostTimers.set(sessionId, { timeout, startedAt, remaining, revision });
    return remaining;
  }

  pauseHostChess(session, { persist = true } = {}) {
    const sessionId = Number(session.sessionId);
    const running = this.hostTimers.get(sessionId);
    if (!running) return session.hostTimeRemainingMs;
    this.clearTimeoutFn(running.timeout);
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
    if (running) this.clearTimeoutFn(running.timeout);
    this.hostTimers.delete(normalizedId);
  }

  destroy() {
    for (const timeout of this.viewerTimers.values()) this.clearTimeoutFn(timeout);
    for (const running of this.hostTimers.values()) this.clearTimeoutFn(running.timeout);
    this.viewerTimers.clear();
    this.hostTimers.clear();
  }
}

module.exports = InteractiveTurnTimers;
