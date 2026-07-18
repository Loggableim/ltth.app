const InteractiveSessionRegistry = require('./interactive-session-registry');
const InteractiveTurnQueue = require('./interactive-turn-queue');
const InteractiveTurnTimers = require('./interactive-turn-timers');
const InteractiveDisplayRouter = require('./interactive-display-router');
const { createInteractiveAdapter } = require('./interactive-game-adapters');

const DEFAULT_SETTINGS = Object.freeze({
  connect4ViewerResponseSeconds: 30,
  chessViewerResponseSeconds: 60,
  maxConcurrentInteractiveSessions: 20,
  interactiveResultDisplaySeconds: 3
});

class InteractiveController {
  constructor({
    database,
    io,
    logger,
    createGame,
    restoreGame,
    discardRestoredGame,
    finishGame,
    emitLegacyEvent,
    resolveHostName,
    getConfig,
    getSettings,
    now = () => Date.now()
  }) {
    this.database = database;
    this.io = io;
    this.logger = logger;
    this.createGame = createGame;
    this.restoreGame = restoreGame;
    this.discardRestoredGame = discardRestoredGame;
    this.finishGame = finishGame;
    this.emitLegacyEvent = emitLegacyEvent;
    this.resolveHostName = resolveHostName;
    this.getConfig = getConfig;
    this.getSettings = getSettings;
    this.now = now;

    const settings = this._settings();
    this.registry = new InteractiveSessionRegistry({
      maxSessions: settings.maxConcurrentInteractiveSessions
    });
    this.queue = new InteractiveTurnQueue(database, logger, now);
    this.timers = new InteractiveTurnTimers({
      getSession: sessionId => this.registry.get(sessionId),
      database,
      onViewerTimeout: (sessionId, revision) => this._handleViewerTimeout(sessionId, revision),
      onHostTimeout: (sessionId, revision) => this._handleHostTimeout(sessionId, revision),
      now
    });
    this.router = new InteractiveDisplayRouter({
      registry: this.registry,
      queue: this.queue,
      timers: this.timers,
      database,
      onChange: () => this.emitState(),
      now
    });
  }

  _bounded(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
  }

  _settings() {
    const configured = this.getSettings?.() || {};
    return {
      connect4ViewerResponseSeconds: this._bounded(
        configured.connect4ViewerResponseSeconds,
        DEFAULT_SETTINGS.connect4ViewerResponseSeconds,
        5,
        300
      ),
      chessViewerResponseSeconds: this._bounded(
        configured.chessViewerResponseSeconds,
        DEFAULT_SETTINGS.chessViewerResponseSeconds,
        5,
        300
      ),
      maxConcurrentInteractiveSessions: this._bounded(
        configured.maxConcurrentInteractiveSessions,
        DEFAULT_SETTINGS.maxConcurrentInteractiveSessions,
        1,
        50
      ),
      interactiveResultDisplaySeconds: this._bounded(
        configured.interactiveResultDisplaySeconds,
        DEFAULT_SETTINGS.interactiveResultDisplaySeconds,
        1,
        10
      )
    };
  }

  _viewerResponseSeconds(gameType) {
    const settings = this._settings();
    return gameType === 'chess'
      ? settings.chessViewerResponseSeconds
      : settings.connect4ViewerResponseSeconds;
  }

  _hostTimeFromState(gameType, state) {
    if (gameType !== 'chess') return null;
    const host = [state.whitePlayer, state.blackPlayer].find(player => player?.role === 'streamer');
    return host?.side ? Number(state.timers?.[host.side]) || 0 : 0;
  }

  _leaderboardPresentation(session) {
    const config = session?.config || {};
    const supportedTypes = new Set(['daily', 'season', 'lifetime', 'elo']);
    const types = Array.isArray(config.leaderboardTypes)
      ? config.leaderboardTypes.filter(type => supportedTypes.has(type))
      : [];
    return {
      enabled: Boolean(config.leaderboardEnabled) && types.length > 0,
      types,
      displayTimeMs: this._bounded(config.leaderboardDisplayTime, 3, 1, 10) * 1000
    };
  }

  _sessionRecord(session) {
    return {
      sessionId: session.sessionId,
      gameType: session.gameType,
      viewerId: session.viewerId,
      viewerDisplayName: session.viewerDisplayName,
      hostDisplayName: session.hostDisplayName,
      state: session.adapter.getState(),
      sessionRevision: session.sessionRevision,
      displayRevision: this.router.displayRevision,
      turnRole: session.turnRole,
      viewerDeadlineMs: session.viewerDeadlineMs,
      hostTimeRemainingMs: session.gameType === 'chess'
        ? this.timers.getHostRemaining(session)
        : null,
      timeControl: session.timeControl,
      lastMoveIdentity: session.lastMoveIdentity,
      lastActivityAt: session.lastActivityAt
    };
  }

  _logTransition(transition, session, extra = {}) {
    this.logger?.info?.(`[INTERACTIVE] ${JSON.stringify({
      transition,
      sessionId: session?.sessionId,
      gameType: session?.gameType,
      viewerId: session?.viewerId,
      sessionRevision: session?.sessionRevision,
      displayRevision: this.router.displayRevision,
      ...extra
    })}`);
  }

  init() {
    let recovered = 0;
    const reconciled = this.database.reconcileOrphanedInteractiveSessions?.() || 0;
    const activeRows = this.database.getActiveInteractiveStates();
    for (const row of activeRows) {
      try {
        if (row.recoveryError) throw new Error(row.recoveryError);
        const restored = this.restoreGame(row);
        const adapter = createInteractiveAdapter(row.gameType, restored.game);
        adapter.restoreState(row.state);
        const session = this.registry.restore({
          ...row,
          adapter,
          config: this.getConfig(row.gameType) || {},
          timeControl: row.timeControl || restored.timeControl,
          status: 'active'
        });
        this.timers.restore(session);
        recovered += 1;
        this._logTransition('session_recovered', session);
      } catch (error) {
        this.timers.clear(row.sessionId);
        this.registry.remove(row.sessionId);
        this.discardRestoredGame?.(row.sessionId);
        this.database.failInteractiveRecovery(row.sessionId);
        this.logger?.error?.(`[INTERACTIVE] Failed to recover session ${row.sessionId}: ${error.message}`);
      }
    }

    const validQueueRows = [];
    for (const row of this.database.getInteractiveQueue()) {
      const session = this.registry.get(row.sessionId);
      if (session && session.status === 'active' && session.turnRole === 'host') {
        validQueueRows.push(row);
      } else {
        this.database.removeInteractiveTurn(row.sessionId);
      }
    }
    this.queue.restore(validQueueRows);
    this.router.sync();
    this.emitState();
    return { recovered, reconciled, queueLength: validQueueRows.length };
  }

  startMatch({ gameType, viewerId, viewerDisplayName, timeControl = null, triggerType = 'command', triggerValue = null }) {
    if (!['connect4', 'chess'].includes(gameType)) {
      return { success: false, error: 'unsupported_game_type' };
    }
    const stableViewerId = String(viewerId || '').trim();
    if (!stableViewerId) return { success: false, error: 'viewer_identity_required' };
    const existing = this.registry.getByViewer(stableViewerId);
    if (existing) {
      return {
        success: false,
        error: 'active_session',
        sessionId: existing.sessionId,
        gameType: existing.gameType
      };
    }

    const settings = this._settings();
    this.registry.maxSessions = settings.maxConcurrentInteractiveSessions;
    if (this.registry.list().length >= settings.maxConcurrentInteractiveSessions) {
      return { success: false, error: 'interactive_session_limit' };
    }

    const config = this.getConfig(gameType) || {};
    const hostDisplayName = this.resolveHostName?.() || 'Streamer';
    let created;
    try {
      created = this.createGame({
        gameType,
        viewerId: stableViewerId,
        viewerDisplayName: viewerDisplayName || stableViewerId,
        hostDisplayName,
        config,
        timeControl,
        triggerType,
        triggerValue
      });
      const adapter = createInteractiveAdapter(gameType, created.game);
      if (gameType === 'chess') {
        created.game.stopTimer?.();
        created.game.lastMoveTime = null;
      }
      const state = adapter.getState();
      const turnRole = adapter.getCurrentTurnRole();
      const now = this.now();
      const session = this.registry.add({
        sessionId: created.sessionId,
        gameType,
        viewerId: stableViewerId,
        viewerDisplayName: viewerDisplayName || stableViewerId,
        hostDisplayName,
        adapter,
        config,
        timeControl: created.timeControl || timeControl,
        sessionRevision: 1,
        displayRevision: this.router.displayRevision,
        turnRole,
        viewerDeadlineMs: turnRole === 'viewer'
          ? now + (this._viewerResponseSeconds(gameType) * 1000)
          : null,
        hostTimeRemainingMs: this._hostTimeFromState(gameType, state),
        lastMoveIdentity: null,
        lastActivityAt: now,
        status: 'active'
      });

      this.database.transaction(() => {
        this.database.createInteractiveState(this._sessionRecord(session));
        if (turnRole === 'host') this.queue.enqueue(session);
      });
      if (turnRole === 'viewer') this.timers.restore(session);
      this.emitLegacyEvent?.('started', { session, state, config });
      this._logTransition('session_started', session);
      this.router.sync();
      this.emitState();
      return { success: true, started: true, sessionId: session.sessionId };
    } catch (error) {
      if (created?.sessionId) {
        this.queue.remove(created.sessionId);
        this.registry.remove(created.sessionId);
      }
      this.logger?.error?.(`[INTERACTIVE] Failed to start ${gameType}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  applyViewerMove({ viewerId, gameType, move, moveIdentity = null }) {
    const session = this.registry.getByViewer(viewerId);
    if (!session) return { success: false, error: 'no_active_session' };
    if (session.gameType !== gameType) return { success: false, error: 'wrong_game_type' };
    if (moveIdentity && this.database.hasInteractiveMoveIdentity(session.sessionId, moveIdentity)) {
      return { success: true, duplicate: true, sessionId: session.sessionId };
    }
    if (session.turnRole !== 'viewer') return { success: false, error: 'not_viewer_turn' };
    if (session.viewerDeadlineMs != null && this.now() >= session.viewerDeadlineMs) {
      this._handleViewerTimeout(session.sessionId, session.sessionRevision);
      return { success: false, error: 'viewer_timeout' };
    }

    const previousState = session.adapter.getState();
    const previous = {
      revision: session.sessionRevision,
      turnRole: session.turnRole,
      deadline: session.viewerDeadlineMs,
      lastMoveIdentity: session.lastMoveIdentity,
      lastActivityAt: session.lastActivityAt
    };
    const result = session.adapter.applyViewerMove(move, session.viewerId);
    if (!result.success) return { success: false, error: result.error };

    this.timers.clearViewer(session.sessionId, { persist: false });
    session.sessionRevision += 1;
    session.turnRole = session.adapter.getCurrentTurnRole();
    session.viewerDeadlineMs = null;
    session.lastMoveIdentity = moveIdentity || `${previous.revision}:${JSON.stringify(move)}`;
    session.lastActivityAt = this.now();

    try {
      if (result.gameOver || session.adapter.isComplete()) {
        this._completeSession(session, {
          winner: result.winner,
          winnerRole: this._roleForWinner(session, result.winner),
          reason: result.winReason || (result.draw ? 'draw' : 'win'),
          gameResult: result
        }, { moveIdentity });
      } else {
        this.database.transaction(() => {
          if (moveIdentity && !this.database.recordInteractiveMoveIdentity(session.sessionId, moveIdentity)) {
            throw new Error('duplicate_move_identity');
          }
          this.database.updateInteractiveState(session.sessionId, this._sessionRecord(session));
          this.queue.enqueue(session);
        });
        this.emitLegacyEvent?.('move', { session, result, actorRole: 'viewer' });
        this._logTransition('viewer_move_accepted', session, {
          queueSequence: this.queue.list().find(row => row.sessionId === session.sessionId)?.sequence
        });
        this.router.sync();
        this.emitState();
      }
      return { success: true, sessionId: session.sessionId, result };
    } catch (error) {
      session.adapter.restoreState(previousState);
      session.sessionRevision = previous.revision;
      session.turnRole = previous.turnRole;
      session.viewerDeadlineMs = previous.deadline;
      session.lastMoveIdentity = previous.lastMoveIdentity;
      session.lastActivityAt = previous.lastActivityAt;
      this.timers.restore(session);
      this.logger?.error?.(`[INTERACTIVE] Viewer move persistence failed for ${session.sessionId}: ${error.message}`);
      return { success: false, error: 'persistence_error' };
    }
  }

  applyHostMove(envelope) {
    const sessionId = Number(envelope?.sessionId);
    const session = this.registry.get(sessionId);
    if (!session) return { success: false, error: 'session_not_found' };
    if (session.gameType !== envelope.gameType) return { success: false, error: 'wrong_game_type' };
    const moveIdentity = envelope?.moveIdentity || null;
    if (moveIdentity && this.database.hasInteractiveMoveIdentity(session.sessionId, moveIdentity)) {
      return { success: true, duplicate: true, sessionId: session.sessionId };
    }
    const head = this.queue.head();
    if (!head || head.sessionId !== sessionId) return { success: false, error: 'not_queue_head' };
    if (this.router.snapshot().displaySessionId !== sessionId) return { success: false, error: 'not_displayed' };
    if (session.sessionRevision !== Number(envelope.sessionRevision)) {
      return { success: false, error: 'stale_session_revision' };
    }
    if (this.router.displayRevision !== Number(envelope.displayRevision)) {
      return { success: false, error: 'stale_display_revision' };
    }
    if (session.turnRole !== 'host') return { success: false, error: 'not_host_turn' };

    let chessHostSide = null;
    let chessHostTimeBeforeMove = null;
    if (session.gameType === 'chess') {
      const remaining = this.timers.pauseHostChess(session, { persist: false });
      if (remaining <= 0) {
        this._handleHostTimeout(session.sessionId, session.sessionRevision);
        return { success: false, error: 'host_timeout' };
      }
      chessHostTimeBeforeMove = session.hostTimeRemainingMs;
      const chessState = session.adapter.getState();
      chessHostSide = ['white', 'black'].find(side => chessState[`${side}Player`]?.role === 'streamer');
      if (chessHostSide) {
        session.adapter.game.timers[chessHostSide] = chessHostTimeBeforeMove;
        session.adapter.game.lastMoveTime = null;
      }
    }
    const previousState = session.adapter.getState();
    const previousLastMoveIdentity = session.lastMoveIdentity;
    const result = session.adapter.applyHostMove(envelope.move);
    if (!result.success) {
      if (session.gameType === 'chess') this.timers.resumeHostChess(session);
      return { success: false, error: result.error };
    }
    if (session.gameType === 'chess') {
      session.hostTimeRemainingMs = this._hostTimeFromState('chess', session.adapter.getState());
    }

    session.sessionRevision += 1;
    session.turnRole = session.adapter.getCurrentTurnRole();
    session.lastMoveIdentity = moveIdentity || `${session.sessionRevision - 1}:${JSON.stringify(envelope.move)}`;
    session.lastActivityAt = this.now();
    session.viewerDeadlineMs = result.gameOver || session.adapter.isComplete()
      ? null
      : this.now() + (this._viewerResponseSeconds(session.gameType) * 1000);

    try {
      this.database.transaction(() => {
        if (moveIdentity && !this.database.recordInteractiveMoveIdentity(session.sessionId, moveIdentity)) {
          throw new Error('duplicate_move_identity');
        }
        this.queue.remove(session.sessionId);
        this.database.updateInteractiveState(session.sessionId, this._sessionRecord(session));
      });
      this.emitLegacyEvent?.('move', { session, result, actorRole: 'host' });
      this._logTransition('host_move_accepted', session);
      if (result.gameOver || session.adapter.isComplete()) {
        this._completeSession(session, {
          winner: result.winner,
          winnerRole: this._roleForWinner(session, result.winner),
          reason: result.winReason || (result.draw ? 'draw' : 'win'),
          gameResult: result
        });
      } else {
        this.timers.restore(session);
        const animationSpeed = this._bounded(session.config?.animationSpeed, 500, 100, 2000);
        this.router.beginAnimation(session.sessionId, animationSpeed);
        this.emitState();
      }
      return { success: true, sessionId: session.sessionId, result };
    } catch (error) {
      session.adapter.restoreState(previousState);
      if (session.gameType === 'chess') {
        session.hostTimeRemainingMs = chessHostTimeBeforeMove;
        if (chessHostSide) session.adapter.game.timers[chessHostSide] = chessHostTimeBeforeMove;
      }
      session.sessionRevision -= 1;
      session.turnRole = 'host';
      session.lastMoveIdentity = previousLastMoveIdentity;
      session.viewerDeadlineMs = null;
      if (!this.queue.has(session.sessionId)) this.queue.enqueue(session);
      if (session.gameType === 'chess') this.timers.resumeHostChess(session);
      this.logger?.error?.(`[INTERACTIVE] Host move persistence failed for ${session.sessionId}: ${error.message}`);
      return { success: false, error: 'persistence_error' };
    }
  }

  skipHostTurn(envelope) {
    const sessionId = Number(envelope?.sessionId);
    const session = this.registry.get(sessionId);
    if (!session) return { success: false, error: 'session_not_found' };
    if (session.gameType !== envelope?.gameType) return { success: false, error: 'wrong_game_type' };
    const head = this.queue.head();
    if (!head || head.sessionId !== sessionId) return { success: false, error: 'not_queue_head' };
    if (this.router.snapshot().displaySessionId !== sessionId) return { success: false, error: 'not_displayed' };
    if (session.sessionRevision !== Number(envelope?.sessionRevision)) {
      return { success: false, error: 'stale_session_revision' };
    }
    if (this.router.displayRevision !== Number(envelope?.displayRevision)) {
      return { success: false, error: 'stale_display_revision' };
    }
    if (session.turnRole !== 'host') return { success: false, error: 'not_host_turn' };
    if (this.queue.list().length < 2) return { success: false, error: 'queue_too_short' };

    const rotated = this.queue.rotateHeadToTail(sessionId);
    if (!rotated?.moved) return { success: false, error: rotated?.error || 'queue_rotation_failed' };
    this._logTransition('host_turn_skipped', session, { queueSequence: rotated.sequence });
    this.router.sync();
    this.emitState();
    return { success: true, sessionId, displayRevision: this.router.displayRevision };
  }

  _roleForWinner(session, winner) {
    if (winner == null) return null;
    const state = session.adapter.getState();
    if (session.gameType === 'connect4') {
      const player = Number(winner) === 1 ? state.player1 : state.player2;
      return player?.role === 'streamer' ? 'host' : 'viewer';
    }
    const player = winner === 'white' ? state.whitePlayer : state.blackPlayer;
    return player?.role === 'streamer' ? 'host' : 'viewer';
  }

  _winnerForRole(session, winnerRole) {
    const state = session.adapter.getState();
    const expectedRole = winnerRole === 'host' ? 'streamer' : 'viewer';
    if (session.gameType === 'connect4') {
      return state.player1?.role === expectedRole ? 1 : 2;
    }
    return state.whitePlayer?.role === expectedRole ? 'white' : 'black';
  }

  _markTimedOut(session, winner, reason) {
    const game = session.adapter.game;
    game.status = 'completed';
    game.winner = winner;
    if (session.gameType === 'chess') game.winReason = reason;
  }

  _handleViewerTimeout(sessionId, revision) {
    const session = this.registry.get(sessionId);
    if (!session || session.sessionRevision !== revision || session.turnRole !== 'viewer') return false;
    const winner = this._winnerForRole(session, 'host');
    this._markTimedOut(session, winner, 'viewer_timeout');
    session.sessionRevision += 1;
    session.lastActivityAt = this.now();
    this._logTransition('viewer_timeout', session, { terminalReason: 'viewer_timeout' });
    this._completeSession(session, {
      winner,
      winnerRole: 'host',
      reason: 'viewer_timeout',
      gameResult: { gameOver: true, winner, winReason: 'viewer_timeout', timeout: true }
    });
    return true;
  }

  _handleHostTimeout(sessionId, revision) {
    const session = this.registry.get(sessionId);
    if (!session || session.sessionRevision !== revision || session.turnRole !== 'host') return false;
    const winner = this._winnerForRole(session, 'viewer');
    this._markTimedOut(session, winner, 'host_timeout');
    session.sessionRevision += 1;
    session.lastActivityAt = this.now();
    this._logTransition('host_timeout', session, { terminalReason: 'host_timeout' });
    this._completeSession(session, {
      winner,
      winnerRole: 'viewer',
      reason: 'host_timeout',
      gameResult: { gameOver: true, winner, winReason: 'host_timeout', timeout: true }
    });
    return true;
  }

  _completeSession(session, outcome, {
    moveIdentity = null,
    skipAccounting = false,
    resultDurationMs = null,
    skipLeaderboard = false
  } = {}) {
    const resultPayload = {
      sessionId: session.sessionId,
      gameType: session.gameType,
      viewerId: session.viewerId,
      viewerDisplayName: session.viewerDisplayName,
      hostDisplayName: session.hostDisplayName,
      winner: outcome.winner,
      winnerRole: outcome.winnerRole,
      winnerDisplayName: outcome.winnerRole === 'host'
        ? session.hostDisplayName
        : outcome.winnerRole === 'viewer'
          ? session.viewerDisplayName
          : null,
      reason: outcome.reason,
      gameResult: outcome.gameResult,
      state: session.adapter.getState(),
      sessionRevision: session.sessionRevision,
      leaderboard: skipLeaderboard ? null : this._leaderboardPresentation(session),
      skipAccounting
    };
    this.timers.clear(session.sessionId);
    this.database.transaction(() => {
      if (moveIdentity && !this.database.recordInteractiveMoveIdentity(session.sessionId, moveIdentity)) {
        throw new Error('duplicate_move_identity');
      }
      this.queue.remove(session.sessionId);
      this.database.updateInteractiveState(session.sessionId, this._sessionRecord(session));
      this.database.completeInteractiveState(session.sessionId, outcome.reason);
    });
    this.registry.remove(session.sessionId);
    try {
      this.finishGame?.(resultPayload);
    } catch (error) {
      this.logger?.error?.(`[INTERACTIVE] Result accounting failed for ${session.sessionId}: ${error.message}`);
    }
    this.emitLegacyEvent?.('ended', resultPayload);
    this._logTransition('session_ended', session, { terminalReason: outcome.reason });
    const resultDuration = resultDurationMs == null
      ? this._settings().interactiveResultDisplaySeconds * 1000
      : resultDurationMs;
    this.router.showResult(resultPayload, resultDuration, resultPayload.leaderboard);
    this.emitState();
    return resultPayload;
  }

  cancel(input) {
    const envelope = typeof input === 'object' && input !== null
      ? input
      : { sessionId: input };
    const session = this.registry.get(envelope.sessionId);
    if (!session) return { success: false, error: 'session_not_found' };
    if (envelope.gameType != null && session.gameType !== envelope.gameType) {
      return { success: false, error: 'wrong_game_type' };
    }
    if (envelope.sessionRevision != null && session.sessionRevision !== Number(envelope.sessionRevision)) {
      return { success: false, error: 'stale_session_revision' };
    }
    if (envelope.displayRevision != null && this.router.displayRevision !== Number(envelope.displayRevision)) {
      return { success: false, error: 'stale_display_revision' };
    }
    session.sessionRevision += 1;
    const result = this._completeSession(session, {
      winner: null,
      winnerRole: null,
      reason: 'cancelled',
      gameResult: { gameOver: true, cancelled: true }
    }, {
      skipAccounting: true,
      skipLeaderboard: true,
      resultDurationMs: 1500
    });
    return { success: true, result };
  }

  end(sessionId, outcome) {
    const session = this.registry.get(sessionId);
    if (!session) return { success: false, error: 'session_not_found' };
    session.sessionRevision += 1;
    return { success: true, result: this._completeSession(session, outcome) };
  }

  getState() {
    return {
      display: this.router.snapshot(),
      hostQueue: this.queue.list(),
      activeSessions: this.registry.summaries(this.now()),
      configuration: this._settings(),
      serverTimestamp: this.now()
    };
  }

  emitState(targetSocket = null) {
    const state = this.getState();
    if (targetSocket?.emit) targetSocket.emit('game-engine:interactive-state', state);
    else this.io?.emit?.('game-engine:interactive-state', state);
    return state;
  }

  destroy() {
    this.timers.destroy();
    this.router.destroy();
  }
}

module.exports = InteractiveController;
