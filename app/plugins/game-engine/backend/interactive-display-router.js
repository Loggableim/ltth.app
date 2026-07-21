const { getViewerTimeRemainingMs } = require('./interactive-session-registry');

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
    this.leaderboard = null;
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

  _nextViewerSession() {
    return this.registry.list()
      .filter(row => row.status === 'active' && row.turnRole === 'viewer')
      .sort((a, b) => (a.lastActivityAt - b.lastActivityAt) || (a.sessionId - b.sessionId))[0] || null;
  }

  _pauseDisplayedTimers() {
    const session = this._displaySession();
    if (session?.turnRole === 'viewer') {
      this.timers.pauseViewer(session);
    } else if (session?.gameType === 'chess' && session.turnRole === 'host') {
      this.timers.pauseHostChess(session);
    }
  }

  _resumeDisplayedTimers() {
    if (this.phase !== 'playing' || this.suspendedReason) return;
    const session = this._displaySession();
    if (session?.turnRole === 'viewer') {
      this.timers.resumeViewer(session);
    } else if (session?.gameType === 'chess' && session.turnRole === 'host') {
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
    if (force) {
      this._clearTransition();
      this.transitionAction = null;
      this.transitionRemainingMs = null;
    }
    const head = this.queue.head();
    if (this.phase === 'leaderboard') {
      if (!head && !force) return this.snapshot();
      this._clearTransition();
      this.leaderboard = null;
      this.resultQueue = [];
    }
    const viewer = head ? null : this._nextViewerSession();
    const nextSessionId = head?.sessionId ?? viewer?.sessionId ?? null;
    const nextPhase = nextSessionId == null ? 'idle' : 'playing';
    if (this.displaySessionId === nextSessionId && this.phase === nextPhase) {
      this._resumeDisplayedTimers();
      return this.snapshot();
    }
    this._pauseDisplayedTimers();
    this.displaySessionId = nextSessionId;
    this.phase = nextPhase;
    this.result = null;
    this._advanceRevision();
    this._resumeDisplayedTimers();
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
    this._pauseDisplayedTimers();
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

  showResult(result, durationMs, leaderboard = null) {
    const entry = { result, durationMs, leaderboard };
    if (this.phase === 'result') {
      this.resultQueue.push(entry);
      return this.snapshot();
    }
    if (this.phase === 'leaderboard') {
      this._clearTransition();
      this.leaderboard = null;
    }
    this._activateResult(entry);
    return this.snapshot();
  }

  _matchesResult(left, right) {
    if (left === right) return true;
    const leftSessionId = left?.sessionId;
    const rightSessionId = right?.sessionId;
    return leftSessionId != null &&
      rightSessionId != null &&
      String(leftSessionId) === String(rightSessionId);
  }

  _hasScheduledTransition() {
    return typeof this.transitionAction === 'function' && (
      this.transitionTimer != null ||
      (this.suspendedReason && this.transitionRemainingMs != null)
    );
  }

  recoverResult(result, durationMs, leaderboard = null) {
    const entry = { result, durationMs, leaderboard };
    const activeMatch = this.phase === 'result' && this._matchesResult(this.result, result);
    if (activeMatch && this._hasScheduledTransition()) {
      return this.snapshot();
    }

    const queuedMatch = this.resultQueue.some(queued => this._matchesResult(queued.result, result));
    if (this.phase === 'result' && !activeMatch) {
      if (!queuedMatch) this.resultQueue.push(entry);
      return this.snapshot();
    }

    this._clearTransition();
    this.transitionAction = null;
    this.transitionRemainingMs = null;
    this.resultQueue = this.resultQueue.filter(queued => !this._matchesResult(queued.result, result));
    this.result = null;
    this.leaderboard = null;
    this.displaySessionId = null;
    this.phase = 'idle';
    this._activateResult(entry);
    return this.snapshot();
  }

  _activateResult(entry) {
    this._clearTransition();
    this._pauseDisplayedTimers();
    this.result = entry.result;
    this.leaderboard = null;
    this.displaySessionId = Number(entry.result?.sessionId) || null;
    this.phase = 'result';
    this._advanceRevision();
    this._publish();
    this._scheduleTransition(entry.durationMs, () => this._advanceAfterResult(entry));
  }

  _advanceAfterResult(entry) {
    if (this.queue.head()) {
      this.resultQueue = [];
      return this._advanceToNextPresentation();
    }
    if (entry.leaderboard?.enabled && entry.leaderboard.types.length) {
      return this._activateLeaderboard(entry, 0);
    }
    return this._advanceToNextPresentation();
  }

  _activateLeaderboard(entry, index) {
    const types = entry.leaderboard?.types || [];
    if (!types[index]) return this._advanceToNextPresentation();
    this._clearTransition();
    this._pauseDisplayedTimers();
    this.result = null;
    this.displaySessionId = null;
    this.phase = 'leaderboard';
    this.leaderboard = {
      gameType: entry.result.gameType,
      hostDisplayName: entry.result.hostDisplayName,
      viewerDisplayName: entry.result.viewerDisplayName,
      type: types[index],
      index,
      total: types.length
    };
    this._advanceRevision();
    this._publish();
    this._scheduleTransition(entry.leaderboard.displayTimeMs, () => {
      if (this.queue.head()) {
        this.resultQueue = [];
        this._advanceToNextPresentation();
        return;
      }
      this._activateLeaderboard(entry, index + 1);
    });
  }

  dismissLeaderboard() {
    if (this.phase !== 'leaderboard') return this.snapshot();
    this._clearTransition();
    this.result = null;
    this.leaderboard = null;
    this.resultQueue = [];
    this.displaySessionId = null;
    this.phase = 'idle';
    this._advanceRevision();
    this._publish();
    return this.sync({ force: true });
  }

  _advanceToNextPresentation() {
    const next = this.resultQueue.shift();
    if (next && !this.queue.head()) {
      this._activateResult(next);
      return this.snapshot();
    }
    this.result = null;
    this.leaderboard = null;
    this.displaySessionId = null;
    this.phase = 'idle';
    if (!this.queue.head() && !this._nextViewerSession()) {
      this._advanceRevision();
      return this._publish();
    }
    return this.sync({ force: true });
  }

  suspend(reason) {
    if (this.suspendedReason) return this.snapshot();
    this._pauseDisplayedTimers();
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
    this._resumeDisplayedTimers();
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
    const result = this.phase === 'result' ? this.result : null;
    const session = ['playing', 'animating'].includes(this.phase)
      ? this._displaySession()
      : null;
    const queue = this.queue.list();
    const leaderboard = this.leaderboard;
    const state = result?.state || session?.adapter?.getState?.() || null;
    const hostRemaining = session?.gameType === 'chess'
      ? this.timers.getHostRemaining?.(session) ?? session.hostTimeRemainingMs
      : null;
    return {
      displaySessionId: this.displaySessionId,
      gameType: this.phase === 'result'
        ? result?.gameType || null
        : this.phase === 'leaderboard'
          ? leaderboard?.gameType || null
          : session?.gameType || null,
      sessionRevision: result?.sessionRevision ?? session?.sessionRevision ?? null,
      displayRevision: this.displayRevision,
      hostDisplayName: result?.hostDisplayName || session?.hostDisplayName || leaderboard?.hostDisplayName || null,
      viewerDisplayName: result?.viewerDisplayName || session?.viewerDisplayName || leaderboard?.viewerDisplayName || null,
      state,
      currentTurnRole: session?.turnRole || null,
      viewerDeadlineMs: session?.viewerDeadlineMs ?? null,
      viewerTimeRemainingMs: getViewerTimeRemainingMs(session, this.now()),
      hostTimeRemainingMs: hostRemaining,
      waitingQueueCount: Math.max(0, queue.length - (this.phase === 'playing' && session ? 1 : 0)),
      activeSessionCount: this.registry.list().length,
      phase: this.phase,
      result: this.result,
      leaderboard: leaderboard
        ? { type: leaderboard.type, index: leaderboard.index, total: leaderboard.total }
        : null,
      suspendedReason: this.suspendedReason,
      config: result?.config || session?.config || null,
      serverTimestamp: this.now()
    };
  }

  destroy() {
    this._clearTransition();
    this.resultQueue = [];
  }
}

module.exports = InteractiveDisplayRouter;
