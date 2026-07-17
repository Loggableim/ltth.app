class InteractiveDisplayRouter {
  constructor({
    registry,
    queue,
    timers,
    database,
    onChange,
    now = () => Date.now(),
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout
  }) {
    this.registry = registry;
    this.queue = queue;
    this.timers = timers;
    this.database = database;
    this.onChange = onChange;
    this.now = now;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.displaySessionId = null;
    this.phase = 'idle';
    this.result = null;
    this.resultQueue = [];
    this.suspendedReason = null;
    this.displayRevision = Number(database.getInteractiveMeta('displayRevision')) || 0;
    this.transitionTimer = null;
    this.transitionDeadline = null;
    this.transitionAction = null;
    this.transitionRemainingMs = null;
  }

  _displaySession() {
    return this.displaySessionId == null
      ? null
      : this.registry.get(this.displaySessionId);
  }

  _pauseDisplayedHost() {
    const session = this._displaySession();
    if (session?.gameType === 'chess' && session.turnRole === 'host') {
      this.timers.pauseHostChess(session);
    }
  }

  _resumeDisplayedHost() {
    const session = this._displaySession();
    if (session?.gameType === 'chess' && session.turnRole === 'host') {
      this.timers.resumeHostChess(session);
    }
  }

  _advanceRevision() {
    this.displayRevision += 1;
    this.database.setInteractiveMeta('displayRevision', String(this.displayRevision));
  }

  _publish() {
    const snapshot = this.snapshot();
    this.onChange?.(snapshot);
    return snapshot;
  }

  sync({ force = false } = {}) {
    if (this.suspendedReason || (!force && ['animating', 'result'].includes(this.phase))) {
      return this.snapshot();
    }
    const head = this.queue.head();
    const nextSessionId = head?.sessionId ?? null;
    if (this.displaySessionId === nextSessionId && this.phase === (head ? 'playing' : 'idle')) {
      return this.snapshot();
    }
    this._pauseDisplayedHost();
    this.displaySessionId = nextSessionId;
    this.phase = head ? 'playing' : 'idle';
    this.result = null;
    this._advanceRevision();
    this._resumeDisplayedHost();
    return this._publish();
  }

  _clearTransition() {
    if (this.transitionTimer) this.clearTimeoutFn(this.transitionTimer);
    this.transitionTimer = null;
    this.transitionDeadline = null;
  }

  _scheduleTransition(durationMs, action) {
    this._clearTransition();
    const delay = Math.max(0, Number(durationMs) || 0);
    const revision = this.displayRevision;
    this.transitionDeadline = this.now() + delay;
    this.transitionAction = action;
    this.transitionTimer = this.setTimeoutFn(() => {
      this.transitionTimer = null;
      this.transitionDeadline = null;
      if (this.displayRevision !== revision || this.suspendedReason) return;
      action();
    }, delay);
    this.transitionTimer.unref?.();
  }

  beginAnimation(sessionId, durationMs) {
    if (Number(sessionId) !== this.displaySessionId) return this.snapshot();
    this._clearTransition();
    this._pauseDisplayedHost();
    this.phase = 'animating';
    this._advanceRevision();
    const snapshot = this._publish();
    this._scheduleTransition(durationMs, () => {
      this.displaySessionId = null;
      this.phase = 'idle';
      this.sync({ force: true });
    });
    return snapshot;
  }

  showResult(result, durationMs) {
    if (this.phase === 'result') {
      this.resultQueue.push({ result, durationMs });
      return this.snapshot();
    }
    this._activateResult(result, durationMs);
    return this.snapshot();
  }

  _activateResult(result, durationMs) {
    this._clearTransition();
    this._pauseDisplayedHost();
    this.result = result;
    this.phase = 'result';
    this._advanceRevision();
    this._publish();
    this._scheduleTransition(durationMs, () => {
      const next = this.resultQueue.shift();
      if (next) {
        this._activateResult(next.result, next.durationMs);
        return;
      }
      this.result = null;
      this.displaySessionId = null;
      this.phase = 'idle';
      this.sync({ force: true });
    });
  }

  suspend(reason) {
    if (this.suspendedReason) return this.snapshot();
    this._pauseDisplayedHost();
    this.suspendedReason = reason || 'transient';
    if (this.transitionTimer) {
      this.transitionRemainingMs = Math.max(0, this.transitionDeadline - this.now());
      this._clearTransition();
    }
    this._advanceRevision();
    return this._publish();
  }

  resume() {
    if (!this.suspendedReason) return this.snapshot();
    this.suspendedReason = null;
    this._advanceRevision();
    this._resumeDisplayedHost();
    const snapshot = this._publish();
    if (this.transitionAction && this.transitionRemainingMs != null) {
      const action = this.transitionAction;
      const delay = this.transitionRemainingMs;
      this.transitionRemainingMs = null;
      this._scheduleTransition(delay, action);
    }
    return snapshot;
  }

  snapshot() {
    const session = this._displaySession();
    const queue = this.queue.list();
    const state = session?.adapter?.getState?.() || null;
    const hostRemaining = session?.gameType === 'chess'
      ? this.timers.getHostRemaining?.(session) ?? session.hostTimeRemainingMs
      : null;
    return {
      displaySessionId: this.displaySessionId,
      gameType: this.phase === 'result' ? this.result?.gameType || session?.gameType || null : session?.gameType || null,
      sessionRevision: session?.sessionRevision ?? null,
      displayRevision: this.displayRevision,
      hostDisplayName: session?.hostDisplayName || this.result?.hostDisplayName || null,
      viewerDisplayName: session?.viewerDisplayName || this.result?.viewerDisplayName || null,
      state,
      currentTurnRole: session?.turnRole || null,
      viewerDeadlineMs: session?.viewerDeadlineMs ?? null,
      hostTimeRemainingMs: hostRemaining,
      waitingQueueCount: Math.max(0, queue.length - (this.phase === 'playing' && session ? 1 : 0)),
      activeSessionCount: this.registry.list().length,
      phase: this.phase,
      result: this.result,
      suspendedReason: this.suspendedReason,
      config: session?.config || null,
      serverTimestamp: this.now()
    };
  }

  destroy() {
    this._clearTransition();
    this.resultQueue = [];
  }
}

module.exports = InteractiveDisplayRouter;
