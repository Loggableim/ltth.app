const crypto = require('crypto');
const ChessAutoplayService = require('./chess-autoplay-service');
const InteractiveSessionRegistry = require('./interactive-session-registry');
const InteractiveTurnQueue = require('./interactive-turn-queue');
const InteractiveTurnTimers = require('./interactive-turn-timers');
const InteractiveDisplayRouter = require('./interactive-display-router');
const { createInteractiveAdapter } = require('./interactive-game-adapters');

const DEFAULT_SETTINGS = Object.freeze({
  connect4ViewerTimeoutEnabled: false,
  connect4ViewerResponseSeconds: 30,
  connect4ViewerWarningSeconds: 10,
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
    now = () => Date.now(),
    autoplayService = null,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout
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
    this.autoplayService = autoplayService || new ChessAutoplayService();
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.autoplayTimers = new Map();
    this.autoplayExecutions = new Map();

    const settings = this._settings();
    this.registry = new InteractiveSessionRegistry({
      maxSessions: settings.maxConcurrentInteractiveSessions
    });
    this.queue = new InteractiveTurnQueue(database, logger, now);
    this.timers = new InteractiveTurnTimers({
      getSession: sessionId => this.registry.get(sessionId),
      getDisplaySessionId: () => this.router?.snapshot().displaySessionId ?? null,
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
      onChange: () => {
        this.emitState();
        this._reconcileAutoplay();
      },
      now
    });
  }

  _bounded(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
  }

  _autoplaySettings(config = {}) {
    const autoplay = config.autoplay;
    if (!autoplay || typeof autoplay !== 'object' || autoplay.enabled !== true) return null;
    return {
      eloOffset: this._bounded(autoplay.eloOffset, 0, -400, 400),
      moveDelayMs: this._bounded(autoplay.moveDelayMs, 750, 250, 5000),
      eloStartRating: this._bounded(config.eloStartRating, 1000, 100, 3000)
    };
  }

  _createAutoplayIntent(session) {
    if (session.gameType !== 'chess') return null;
    const settings = this._autoplaySettings(session.config);
    if (!settings) return null;
    const viewerElo = this.database.getPlayerELO(
      session.viewerId,
      'chess',
      settings.eloStartRating
    );
    const targetElo = this._bounded(viewerElo + settings.eloOffset, 400, 400, 3000);
    return {
      version: 1,
      enabled: true,
      // ELO accounting and K must remain tied to this match even if the
      // operator changes the live Chess configuration before it ends.
      rated: session.config?.eloEnabled !== false,
      kFactor: this._bounded(session.config?.eloKFactor, 32, 1, 128),
      viewerElo,
      initialRating: settings.eloStartRating,
      targetElo,
      engineVersion: 'stockfish-18.0.8-lite-single',
      selectorVersion: ChessAutoplayService.SELECTOR_VERSION,
      seed: crypto.randomUUID?.() || crypto.randomBytes(16).toString('hex'),
      originRevision: session.sessionRevision,
      dueAtMs: null,
      status: 'pending'
    };
  }

  _warmAutoplayWorker() {
    Promise.resolve(this.autoplayService?.warm?.({ timeoutMs: 10000 })).catch(error => {
      this.logger?.warn?.(`[INTERACTIVE] Chess autoplay worker warmup failed: ${error.message}`);
    });
  }

  _prepareAutoplayIntent(session) {
    const intent = session?.autoplay;
    if (!intent?.enabled || session.gameType !== 'chess' || session.turnRole !== 'host') return null;
    intent.originRevision = session.sessionRevision;
    intent.dueAtMs = null;
    intent.status = 'pending';
    return intent;
  }

  _isAutoplayEligible(session, intent = session?.autoplay) {
    if (
      !session ||
      session.status !== 'active' ||
      session.gameType !== 'chess' ||
      !intent?.enabled ||
      !['pending', 'armed', 'executing'].includes(intent.status) ||
      intent.originRevision !== session.sessionRevision ||
      session.turnRole !== 'host'
    ) return false;
    const host = session.participants?.find(participant => participant.role === 'host');
    if (!host || session.turnPlayerId !== host.id) return false;
    const display = this.router.snapshot();
    const head = this.queue.head();
    return display.displaySessionId === session.sessionId &&
      display.phase === 'playing' &&
      !display.suspendedReason &&
      display.sessionRevision === session.sessionRevision &&
      head?.sessionId === session.sessionId &&
      this.timers.getHostRemaining(session) > 0;
  }

  _clearAutoplayRuntime(sessionId, { abort = false } = {}) {
    const normalizedId = Number(sessionId);
    const timer = this.autoplayTimers.get(normalizedId);
    if (timer) this.clearTimeoutFn(timer.timeout);
    this.autoplayTimers.delete(normalizedId);
    const execution = this.autoplayExecutions.get(normalizedId);
    if (execution && abort) execution.abortController.abort();
    if (abort || !execution) this.autoplayExecutions.delete(normalizedId);
  }

  _persistAutoplayIntent(session) {
    this.database.updateInteractiveState(session.sessionId, this._sessionRecord(session));
  }

  _setAutoplayIntentStatus(session, status, { disable = false, persist = true } = {}) {
    if (!session?.autoplay) return;
    this._clearAutoplayRuntime(session.sessionId, { abort: true });
    session.autoplay.status = status;
    session.autoplay.dueAtMs = null;
    if (disable) session.autoplay.enabled = false;
    if (!persist) return;
    this._persistAutoplayIntent(session);
  }

  _armAutoplay(session) {
    const intent = session?.autoplay;
    if (!this._isAutoplayEligible(session, intent)) return false;
    const running = this.autoplayTimers.get(session.sessionId);
    if (running?.originRevision === intent.originRevision) return true;
    this._clearAutoplayRuntime(session.sessionId, { abort: true });

    const previousStatus = intent.status;
    const previousDueAtMs = intent.dueAtMs;
    const persistedDueAtMs = Number(intent.dueAtMs);
    const dueAtMs = intent.dueAtMs != null && Number.isFinite(persistedDueAtMs)
      ? Math.max(this.now(), persistedDueAtMs)
      : this.now() + this._bounded(session.config?.autoplay?.moveDelayMs, 750, 250, 5000);
    intent.status = 'armed';
    intent.dueAtMs = dueAtMs;
    try {
      this._persistAutoplayIntent(session);
    } catch (error) {
      intent.status = previousStatus;
      intent.dueAtMs = previousDueAtMs;
      this.logger?.error?.(`[INTERACTIVE] Failed to arm chess autoplay for ${session.sessionId}: ${error.message}`);
      return false;
    }

    const originRevision = intent.originRevision;
    const timeout = this.setTimeoutFn(() => {
      this.autoplayTimers.delete(session.sessionId);
      this._executeAutoplay(session.sessionId, originRevision);
    }, Math.max(0, dueAtMs - this.now()));
    timeout.unref?.();
    this.autoplayTimers.set(session.sessionId, { timeout, originRevision, dueAtMs });
    return true;
  }

  _reconcileAutoplay() {
    const display = this.router?.snapshot?.();
    const displayed = display?.displaySessionId == null
      ? null
      : this.registry.get(display.displaySessionId);
    for (const sessionId of Array.from(this.autoplayTimers.keys())) {
      const session = this.registry.get(sessionId);
      if (!session || session !== displayed || !this._isAutoplayEligible(session)) {
        this._clearAutoplayRuntime(sessionId, { abort: true });
        if (session?.autoplay?.enabled && session.autoplay.status === 'armed') {
          session.autoplay.status = 'pending';
          session.autoplay.dueAtMs = null;
          try {
            this._persistAutoplayIntent(session);
          } catch (error) {
            this.logger?.error?.(`[INTERACTIVE] Failed to disarm chess autoplay for ${session.sessionId}: ${error.message}`);
          }
        }
      }
    }
    if (!displayed?.autoplay?.enabled || !this._isAutoplayEligible(displayed)) return false;
    if (displayed.autoplay.originRevision !== displayed.sessionRevision) {
      this._prepareAutoplayIntent(displayed);
      try {
        this._persistAutoplayIntent(displayed);
      } catch (error) {
        this.logger?.error?.(`[INTERACTIVE] Failed to prepare chess autoplay for ${displayed.sessionId}: ${error.message}`);
        return false;
      }
    }
    return this._armAutoplay(displayed);
  }

  _autoplayFallbackMove(legalMoves, intent) {
    const moves = Array.isArray(legalMoves) ? legalMoves : [];
    const normalized = moves
      .map(move => typeof move === 'string'
        ? move
        : `${move?.from || ''}${move?.to || ''}${move?.promotion || ''}`)
      .filter(move => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))
      .sort();
    if (!normalized.length) return null;
    let hash = 2166136261;
    for (const char of `${intent.seed}:${intent.originRevision}`) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return normalized[(hash >>> 0) % normalized.length];
  }

  async _executeAutoplay(sessionId, originRevision) {
    const session = this.registry.get(sessionId);
    const intent = session?.autoplay;
    if (!this._isAutoplayEligible(session, intent) || intent.originRevision !== originRevision) return;

    const legalMoves = session.adapter.game.getLegalMoves?.() || [];
    const fallback = this._autoplayFallbackMove(legalMoves, intent);
    if (!fallback) {
      this._setAutoplayIntentStatus(session, 'failed');
      return;
    }

    const identity = `autoplay:${session.sessionId}:${originRevision}`;
    const abortController = new AbortController();
    const token = crypto.randomUUID?.() || crypto.randomBytes(16).toString('hex');
    this.autoplayExecutions.set(session.sessionId, { identity, token, abortController });
    intent.status = 'executing';
    let move = fallback;
    try {
      const selection = await this.autoplayService.selectMove({
        fen: session.adapter.getState().fen,
        legalMoves,
        seed: `${intent.seed}:${originRevision}`,
        targetElo: intent.targetElo,
        signal: abortController.signal
      });
      if (typeof selection?.move === 'string') move = selection.move;
    } catch (error) {
      if (abortController.signal.aborted) return;
      this.logger?.warn?.(`[INTERACTIVE] Chess autoplay engine fallback for ${session.sessionId}: ${error.message}`);
    }

    const execution = this.autoplayExecutions.get(session.sessionId);
    if (execution?.identity !== identity || abortController.signal.aborted) return;
    if (!this._isAutoplayEligible(session, intent) || intent.originRevision !== originRevision) {
      this.autoplayExecutions.delete(session.sessionId);
      return;
    }
    const legal = new Set((legalMoves || []).map(candidate => typeof candidate === 'string'
      ? candidate.toLowerCase()
      : `${candidate?.from || ''}${candidate?.to || ''}${candidate?.promotion || ''}`.toLowerCase()));
    if (!legal.has(String(move).toLowerCase())) move = fallback;
    const result = this.applyHostMove({
      sessionId: session.sessionId,
      gameType: 'chess',
      sessionRevision: session.sessionRevision,
      displayRevision: this.router.displayRevision,
      move: { uci: move },
      moveIdentity: identity,
      autoplayToken: token
    });
    this.autoplayExecutions.delete(session.sessionId);
    if (!result.success && session.autoplay?.status === 'executing') {
      this._setAutoplayIntentStatus(session, 'pending');
      this._reconcileAutoplay();
    }
  }

  refreshChessAutoplayConfiguration(config = {}) {
    if (this._autoplaySettings(config)) return { cancelled: 0 };
    let cancelled = 0;
    for (const session of this.registry.list()) {
      if (session.gameType !== 'chess' || !session.autoplay?.enabled) continue;
      this._setAutoplayIntentStatus(session, 'cancelled', { disable: true });
      cancelled += 1;
    }
    return { cancelled };
  }

  _publishSafely(label, sessionId, callback) {
    try {
      callback();
      return true;
    } catch (error) {
      try {
        this.logger?.error?.(`[INTERACTIVE] ${label} publication failed for ${sessionId}: ${error.message}`);
      } catch (loggingError) {
        // Publication failures must never invalidate an already committed transition.
      }
      return false;
    }
  }

  _settings() {
    const configured = this.getSettings?.() || {};
    const connect4ViewerResponseSeconds = this._bounded(
      configured.connect4ViewerResponseSeconds,
      DEFAULT_SETTINGS.connect4ViewerResponseSeconds,
      5,
      120
    );
    return {
      connect4ViewerTimeoutEnabled: configured.connect4ViewerTimeoutEnabled === true,
      connect4ViewerResponseSeconds,
      connect4ViewerWarningSeconds: Math.min(
        connect4ViewerResponseSeconds,
        this._bounded(
          configured.connect4ViewerWarningSeconds,
          DEFAULT_SETTINGS.connect4ViewerWarningSeconds,
          3,
          30
        )
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

  _viewerTimeoutEnabled(gameType) {
    return gameType === 'chess' || this._settings().connect4ViewerTimeoutEnabled;
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
      participantIds: session.participantIds,
      participants: session.participants,
      turnPlayerId: session.turnPlayerId,
      viewerDeadlineMs: session.viewerDeadlineMs,
      viewerTimeRemainingMs: session.viewerTimeRemainingMs,
      hostTimeRemainingMs: session.gameType === 'chess'
        ? this.timers.getHostRemaining(session)
        : null,
      timeControl: session.timeControl,
      lastMoveIdentity: session.lastMoveIdentity,
      autoplay: session.autoplay ? { ...session.autoplay } : null,
      lastActivityAt: session.lastActivityAt
    };
  }

  _isValidAvatarSource(value) {
    const source = String(value || '');
    if (!source) return true;
    if (!source.startsWith('/') || source.startsWith('//')) return false;
    try {
      const base = new URL('http://ltth.local');
      const parsed = new URL(source, base);
      return parsed.origin === base.origin && [
        '/api/game-engine/avatar',
        '/api/game-engine/arena/avatar'
      ].includes(parsed.pathname) && parsed.searchParams.has('url');
    } catch (_) {
      return false;
    }
  }

  _normalizeParticipants(viewerId, viewerDisplayName, hostDisplayName, participants) {
    if (!Array.isArray(participants) || participants.length === 0) {
      return [
        { id: viewerId, displayName: viewerDisplayName || viewerId, role: 'viewer', avatarSource: '' },
        { id: 'streamer', displayName: hostDisplayName, role: 'host', avatarSource: '' }
      ];
    }
    if (participants.length !== 2) throw new Error('Interactive matches require two participants');
    return participants.map(participant => {
      const avatarSource = String(participant?.avatarSource || '');
      if (!this._isValidAvatarSource(avatarSource)) {
        throw new Error('invalid_avatar_source');
      }
      return {
        id: String(participant?.id || '').trim(),
        displayName: String(participant?.displayName || participant?.id || '').trim(),
        role: participant?.role || (participant?.id === 'streamer' ? 'host' : 'viewer'),
        avatarSource
      };
    });
  }

  _assertSafeStateAvatarSources(state = {}) {
    const players = [state.player1, state.player2, state.whitePlayer, state.blackPlayer];
    if (players.some(player => !this._isValidAvatarSource(player?.avatarSource))) {
      throw new Error('invalid_avatar_source');
    }
  }

  _isViewerVersusViewer(session) {
    return session.participants?.every(participant => participant.role !== 'host');
  }

  _participant(session, participantId) {
    return session.participants?.find(participant => participant.id === participantId) || null;
  }

  _winnerForPlayerId(session, playerId) {
    const state = session.adapter.getState();
    if (session.gameType === 'connect4') {
      if (state.player1?.username === playerId) return 1;
      if (state.player2?.username === playerId) return 2;
      return null;
    }
    if (state.whitePlayer?.username === playerId) return 'white';
    if (state.blackPlayer?.username === playerId) return 'black';
    return null;
  }

  refreshConnect4TimerConfiguration(config = {}) {
    const enabled = config.roundTimerEnabled === true;
    const responseSeconds = this._bounded(
      config.roundTimeLimit,
      DEFAULT_SETTINGS.connect4ViewerResponseSeconds,
      5,
      120
    );
    const warningSeconds = Math.min(
      responseSeconds,
      this._bounded(
        config.roundWarningTime,
        DEFAULT_SETTINGS.connect4ViewerWarningSeconds,
        3,
        30
      )
    );
    let updatedSessions = 0;
    const nextSessionConfig = {
      ...config,
      roundTimerEnabled: enabled,
      roundTimeLimit: responseSeconds,
      roundWarningTime: warningSeconds
    };

    for (const session of this.registry.list()) {
      if (session.gameType !== 'connect4' || session.status !== 'active') continue;
      const previousEnabled = session.config?.roundTimerEnabled === true;
      const previousResponseSeconds = this._bounded(
        session.config?.roundTimeLimit,
        DEFAULT_SETTINGS.connect4ViewerResponseSeconds,
        5,
        120
      );
      const previousWarningSeconds = Math.min(
        previousResponseSeconds,
        this._bounded(
          session.config?.roundWarningTime,
          DEFAULT_SETTINGS.connect4ViewerWarningSeconds,
          3,
          30
        )
      );
      const scheduleChanged = previousEnabled !== enabled || previousResponseSeconds !== responseSeconds;
      const presentationChanged = scheduleChanged || previousWarningSeconds !== warningSeconds;
      const nextConfig = {
        ...session.config,
        ...nextSessionConfig
      };
      const sessionConfigChanged = JSON.stringify(session.config || {}) !== JSON.stringify(nextConfig);
      if (!presentationChanged && !sessionConfigChanged) continue;

      const viewerTurn = session.turnRole === 'viewer';
      if (presentationChanged && viewerTurn && enabled && !scheduleChanged) {
        this.timers.pauseViewer(session, { persist: false });
      } else if (presentationChanged && viewerTurn && !enabled) {
        this.timers.clearViewer(session.sessionId, { persist: false });
      }
      session.config = nextConfig;
      session.sessionRevision += 1;
      if (presentationChanged && viewerTurn && enabled) {
        if (scheduleChanged) {
          this.timers.prepareViewer(session, responseSeconds, { persist: false });
        }
      }
      this.database.updateInteractiveState(session.sessionId, this._sessionRecord(session));
      const display = this.router.snapshot();
      if (
        presentationChanged &&
        viewerTurn &&
        enabled &&
        display.displaySessionId === session.sessionId &&
        display.phase === 'playing' &&
        !display.suspendedReason
      ) {
        this.timers.resumeViewer(session);
      }
      updatedSessions += 1;
    }

    if (updatedSessions > 0) {
      this.router.sync();
      this.emitState();
    }
    return { updatedSessions };
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

  _rotateAfterTurn(session) {
    const head = this.queue.head();
    if (!head || head.sessionId !== session.sessionId) {
      throw new Error('interactive_queue_head_changed');
    }
    if (this.queue.list().length < 2) return { moved: false, single: true };
    const rotated = this.queue.rotateHeadToTail(session.sessionId);
    if (!rotated?.moved) {
      throw new Error(rotated?.error || 'queue_rotation_failed');
    }
    return rotated;
  }

  startOrJoinConnect4Matchmaking({
    participantId,
    participantDisplayName,
    participantAvatarSource = '',
    triggerType = 'matchmaking_accept',
    triggerValue = 'connect4'
  } = {}) {
    const normalizedId = String(participantId || '').trim();
    const normalizedDisplayName = String(participantDisplayName || '').trim();
    if (!normalizedId || !normalizedDisplayName) {
      return { success: false, error: 'participant_identity_required' };
    }
    if (this.registry.getByParticipant(normalizedId)) {
      return { success: false, error: 'active_session' };
    }
    if (!this._isValidAvatarSource(participantAvatarSource)) {
      return { success: false, error: 'invalid_avatar_source' };
    }

    try {
      const result = this.database.transaction(() => {
        const now = this.now();
        const duplicate = this.database.listOpenInteractiveChallenges(now)
          .find(challenge => challenge.openerId === normalizedId);
        if (duplicate) return { success: false, error: 'challenge_already_open' };

        let challenge = null;
        while (true) {
          challenge = this.database.claimOldestEligibleInteractiveChallenge({
            participantId: normalizedId,
            participantDisplayName: normalizedDisplayName,
            participantAvatarSource
          }, now);
          if (!challenge) break;
          if (
            this._isValidAvatarSource(challenge.openerAvatarSource) &&
            !this.registry.getByParticipant(challenge.openerId) &&
            !this.database.getActiveGamePlayerLockout?.(challenge.openerId, now)
          ) {
            break;
          }
          this.database.invalidateInteractiveChallenge(challenge.challengeId, now);
          challenge = null;
        }
        if (!challenge) {
          const opened = this.database.createInteractiveChallenge({
            gameType: 'connect4',
            openerId: normalizedId,
            openerDisplayName: normalizedDisplayName,
            openerAvatarSource: participantAvatarSource,
            createdAt: now,
            expiresAtMs: now + 30000
          });
          return { success: true, action: 'opened', challenge: opened };
        }

        const started = this.startMatch({
          gameType: 'connect4',
          viewerId: challenge.openerId,
          viewerDisplayName: challenge.openerDisplayName,
          participants: [
            {
              id: challenge.openerId,
              displayName: challenge.openerDisplayName,
              role: 'viewer',
              avatarSource: challenge.openerAvatarSource || ''
            },
            {
              id: challenge.claimedById,
              displayName: challenge.claimedByDisplayName,
              role: 'viewer',
              avatarSource: challenge.claimedByAvatarSource || ''
            }
          ],
          triggerType,
          triggerValue
        });
        if (!started.success) throw new Error(started.error || 'interactive_match_start_failed');
        return { success: true, action: 'matched', challenge, sessionId: started.sessionId };
      });
      if (result.success) this.emitState();
      return result;
    } catch (error) {
      this.emitState();
      return { success: false, error: error.message };
    }
  }

  listRecoverableConnect4Challenges() {
    const challenges = this.database.listRecoverableInteractiveChallenges?.() || [];
    let invalidated = false;
    const valid = challenges.filter(challenge => {
      if (this._isValidAvatarSource(challenge.openerAvatarSource)) return true;
      invalidated = Boolean(this.database.invalidateInteractiveChallenge?.(challenge.challengeId, this.now())) || invalidated;
      this.logger?.warn?.(`[INTERACTIVE] Rejected unsafe Connect4 challenge avatar source for ${challenge.challengeId}`);
      return false;
    });
    if (invalidated) this.emitState();
    return valid;
  }

  getConnect4MatchmakingSnapshot() {
    const openChallenges = this.database.listOpenInteractiveChallenges?.(this.now()) || [];
    if (openChallenges.length === 0) return null;
    const oldestChallenge = openChallenges[0];
    return {
      ...oldestChallenge,
      pendingCount: openChallenges.length,
      pendingChallenges: openChallenges.map(({
        challengeId,
        openerId,
        openerDisplayName,
        openerAvatarSource,
        expiresAtMs,
        createdAt
      }) => ({
        challengeId,
        openerId,
        openerDisplayName,
        openerAvatarSource,
        expiresAtMs,
        createdAt
      }))
    };
  }

  beginExpiredConnect4Fallback(challengeId) {
    const challenge = this.database.markInteractiveChallengeFallbackPending?.(challengeId, this.now());
    if (!challenge) return { success: false, error: 'challenge_not_expired' };
    this.emitState();
    return { success: true, challenge };
  }

  startPendingConnect4Fallback(challengeId, hostDisplayName) {
    const pending = this.database.getInteractiveChallenge(challengeId);
    if (!pending || pending.status !== 'fallback_pending') {
      return { success: false, error: 'fallback_not_pending' };
    }
    const resolvedHostDisplayName = String(hostDisplayName || '').trim() ||
      this.resolveHostName?.() ||
      'Streamer';
    let invalidated = false;
    try {
      const result = this.database.transaction(() => {
        const challenge = this.database.getInteractiveChallenge(challengeId);
        if (!challenge || challenge.status !== 'fallback_pending') {
          return { success: false, error: 'fallback_not_pending' };
        }
        if (this.database.getActiveGamePlayerLockout?.(challenge.openerId, this.now())) {
          const terminal = this.database.invalidateInteractiveChallenge(challengeId, this.now());
          if (!terminal) throw new Error('fallback_terminal_update_failed');
          invalidated = true;
          return { success: false, error: 'game_lockout' };
        }
        if (this.registry.list().length >= this._settings().maxConcurrentInteractiveSessions) {
          return { success: false, error: 'interactive_session_limit' };
        }
        const started = this.startMatch({
          gameType: 'connect4',
          viewerId: challenge.openerId,
          viewerDisplayName: challenge.openerDisplayName,
          hostDisplayName: resolvedHostDisplayName,
          participants: [
            {
              id: challenge.openerId,
              displayName: challenge.openerDisplayName,
              role: 'viewer',
              avatarSource: challenge.openerAvatarSource || ''
            },
            {
              id: 'streamer',
              displayName: resolvedHostDisplayName,
              role: 'host',
              avatarSource: ''
            }
          ],
          triggerType: 'matchmaking_timeout',
          triggerValue: 'connect4'
        });
        if (!started.success) return started;
        const terminal = this.database.invalidateInteractiveChallenge(challengeId, this.now());
        if (!terminal) throw new Error('fallback_terminal_update_failed');
        return { success: true, action: 'fallback_started', challenge: terminal, sessionId: started.sessionId };
      });
      if (result.success || invalidated) this.emitState();
      return result;
    } catch (error) {
      this.emitState();
      return { success: false, error: error.message };
    }
  }

  openConnect4Challenge({ openerId, openerDisplayName, openerAvatarSource = '' } = {}) {
    if (this.database.getOpenInteractiveChallenge(this.now())) {
      return { success: false, error: 'challenge_already_open' };
    }
    if (!String(openerId || '').trim() || !String(openerDisplayName || '').trim()) {
      return { success: false, error: 'opener_identity_required' };
    }
    if (this.registry.getByParticipant(String(openerId).trim())) {
      return { success: false, error: 'active_session' };
    }
    if (!this._isValidAvatarSource(openerAvatarSource)) {
      return { success: false, error: 'invalid_avatar_source' };
    }
    if (this.registry.list().length >= this._settings().maxConcurrentInteractiveSessions) {
      return { success: false, error: 'interactive_session_limit' };
    }
    try {
      const now = this.now();
      const challenge = this.database.createInteractiveChallenge({
        gameType: 'connect4',
        openerId: String(openerId).trim(),
        openerDisplayName: String(openerDisplayName).trim(),
        openerAvatarSource,
        createdAt: now,
        expiresAtMs: now + 30000
      });
      this.emitState();
      return { success: true, challenge };
    } catch (error) {
      return { success: false, error: /open interactive challenge/i.test(error.message)
        ? 'challenge_already_open'
        : error.message };
    }
  }

  acceptConnect4Challenge({ challengeId, participantId, participantDisplayName, participantAvatarSource = '' } = {}) {
    const challenge = this.database.getInteractiveChallenge(challengeId);
    if (!challenge || challenge.status !== 'open' || challenge.expiresAtMs <= this.now()) {
      return { success: false, error: 'challenge_not_open' };
    }
    const normalizedId = String(participantId || '').trim();
    if (normalizedId === challenge.openerId) return { success: false, error: 'self_challenge' };
    if (!normalizedId || !String(participantDisplayName || '').trim()) {
      return { success: false, error: 'participant_identity_required' };
    }
    if (!this._isValidAvatarSource(participantAvatarSource)) {
      return { success: false, error: 'invalid_avatar_source' };
    }
    if (this.registry.getByParticipant(challenge.openerId)) {
      return { success: false, error: 'opener_active_session' };
    }
    if (this.registry.getByParticipant(normalizedId)) return { success: false, error: 'active_session' };
    const claimed = this.database.claimInteractiveChallenge(challengeId, {
      participantId: normalizedId,
      participantDisplayName: String(participantDisplayName).trim(),
      participantAvatarSource
    }, this.now());
    if (!claimed) return { success: false, error: 'challenge_not_open' };
    this.emitState();
    return { success: true, challenge: claimed };
  }

  acceptAndStartConnect4Challenge({
    challengeId,
    participantId,
    participantDisplayName,
    participantAvatarSource = '',
    triggerType = 'matchmaking_accept',
    triggerValue = 'connect4'
  } = {}) {
    try {
      const result = this.database.transaction(() => {
        const accepted = this.acceptConnect4Challenge({
          challengeId,
          participantId,
          participantDisplayName,
          participantAvatarSource
        });
        if (!accepted.success) return accepted;
        const challenge = accepted.challenge;
        const started = this.startMatch({
          gameType: 'connect4',
          viewerId: challenge.openerId,
          viewerDisplayName: challenge.openerDisplayName,
          participants: [
            {
              id: challenge.openerId,
              displayName: challenge.openerDisplayName,
              role: 'viewer',
              avatarSource: challenge.openerAvatarSource || ''
            },
            {
              id: challenge.claimedById,
              displayName: challenge.claimedByDisplayName,
              role: 'viewer',
              avatarSource: challenge.claimedByAvatarSource || ''
            }
          ],
          triggerType,
          triggerValue
        });
        if (!started.success) {
          throw new Error(started.error || 'interactive_match_start_failed');
        }
        return { ...started, challenge };
      });
      return result;
    } catch (error) {
      // The claim and created session share one database transaction. A failed
      // creation rolls the claim back to `open`, making it safe to retry or
      // recover after a restart rather than stranding a claimed challenge.
      this.emitState();
      return { success: false, error: error.message };
    }
  }

  expireConnect4Challenge(challengeId) {
    const challenge = this.database.expireInteractiveChallenge(challengeId, this.now()) ||
      this.database.getInteractiveChallenge(challengeId);
    if (!challenge || challenge.status !== 'expired') return { success: false, error: 'challenge_not_expired' };
    this.emitState();
    return { success: true, challenge };
  }

  recoverConnect4Challenge({ includeExpired = false } = {}) {
    const challenge = this.database.getRecoverableInteractiveChallenge?.() ||
      this.database.getOpenInteractiveChallenge(this.now());
    if (!challenge) return null;
    if (!this._isValidAvatarSource(challenge.openerAvatarSource)) {
      this.database.invalidateInteractiveChallenge?.(challenge.challengeId, this.now());
      this.logger?.warn?.(`[INTERACTIVE] Rejected unsafe Connect4 challenge avatar source for ${challenge.challengeId}`);
      this.emitState();
      return null;
    }
    if (!includeExpired && Number(challenge.expiresAtMs) <= this.now()) return null;
    return challenge;
  }

  init() {
    let recovered = 0;
    const reconciled = this.database.reconcileOrphanedInteractiveSessions?.() || 0;
    const activeRows = this.database.getActiveInteractiveStates();
    const recoveredChallenge = this.listRecoverableConnect4Challenges().length > 0;
    for (const row of activeRows) {
      try {
        if (row.recoveryError) throw new Error(row.recoveryError);
        const participants = this._normalizeParticipants(
          row.viewerId,
          row.viewerDisplayName,
          row.hostDisplayName,
          row.participants
        );
        this._assertSafeStateAvatarSources(row.state);
        const restored = this.restoreGame(row);
        const adapter = createInteractiveAdapter(row.gameType, restored.game);
        adapter.restoreState(row.state);
        const session = this.registry.restore({
          ...row,
          participants,
          adapter,
          config: this.getConfig(row.gameType) || {},
          timeControl: row.timeControl || restored.timeControl,
          status: 'active'
        });
        if (session.autoplay?.enabled && !this._autoplaySettings(session.config)) {
          this._setAutoplayIntentStatus(session, 'cancelled', { disable: true });
        }
        if (session.autoplay?.enabled) this._warmAutoplayWorker();
        if (session.turnRole === 'viewer') {
          if (!this._viewerTimeoutEnabled(session.gameType)) {
            this.timers.clearViewer(session.sessionId);
          } else if (
            (session.viewerDeadlineMs != null && Number.isFinite(Number(session.viewerDeadlineMs))) ||
            (session.viewerTimeRemainingMs != null && Number.isFinite(Number(session.viewerTimeRemainingMs)))
          ) {
            this.timers.pauseViewer(session);
          } else {
            this.timers.prepareViewer(session, this._viewerResponseSeconds(session.gameType));
          }
        }
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
      if (session && session.status === 'active' && ['host', 'viewer'].includes(session.turnRole)) {
        validQueueRows.push(row);
      } else {
        this.database.removeInteractiveTurn(row.sessionId);
      }
    }
    this.queue.restore(validQueueRows);
    for (const session of this.registry.list().sort((left, right) => left.sessionId - right.sessionId)) {
      if (!this.queue.has(session.sessionId)) this.queue.enqueue(session);
    }
    this.router.sync();
    this._reconcileAutoplay();
    this.emitState();
    return { recovered, reconciled, recoveredChallenge, queueLength: this.queue.list().length };
  }

  startMatch({ gameType, viewerId, viewerDisplayName, participants = null, timeControl = null, triggerType = 'command', triggerValue = null, hostDisplayName: requestedHostDisplayName = null }) {
    if (!['connect4', 'chess'].includes(gameType)) {
      return { success: false, error: 'unsupported_game_type' };
    }
    const stableViewerId = String(viewerId || '').trim();
    if (!stableViewerId) return { success: false, error: 'viewer_identity_required' };
    const hostDisplayName = String(requestedHostDisplayName || '').trim() || this.resolveHostName?.() || 'Streamer';
    let normalizedParticipants;
    try {
      normalizedParticipants = this._normalizeParticipants(
        stableViewerId,
        viewerDisplayName || stableViewerId,
        hostDisplayName,
        participants
      );
    } catch (error) {
      return { success: false, error: error.message };
    }
    const existing = normalizedParticipants
      .map(participant => this.registry.getByParticipant(participant.id))
      .find(Boolean);
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
    let created;
    try {
      created = this.createGame({
        gameType,
        viewerId: stableViewerId,
        viewerDisplayName: viewerDisplayName || stableViewerId,
        ...(Array.isArray(participants) ? { participants: normalizedParticipants } : {}),
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
      const turnPlayerId = adapter.getCurrentTurnPlayerId();
      const now = this.now();
      const session = this.registry.add({
        sessionId: created.sessionId,
        gameType,
        viewerId: stableViewerId,
        viewerDisplayName: viewerDisplayName || stableViewerId,
        hostDisplayName,
        participantIds: normalizedParticipants.map(participant => participant.id),
        participants: normalizedParticipants,
        adapter,
        config,
        timeControl: created.timeControl || timeControl,
        sessionRevision: 1,
        displayRevision: this.router.displayRevision,
        turnRole,
        turnPlayerId,
        viewerDeadlineMs: null,
        viewerTimeRemainingMs: null,
        hostTimeRemainingMs: this._hostTimeFromState(gameType, state),
        lastMoveIdentity: null,
        lastActivityAt: now,
        status: 'active'
      });

      if (turnRole === 'viewer' && this._viewerTimeoutEnabled(gameType)) {
        this.timers.prepareViewer(session, this._viewerResponseSeconds(gameType), { persist: false });
      }

      this.database.transaction(() => {
        if (gameType === 'chess') {
          session.autoplay = this._createAutoplayIntent(session);
        }
        this.database.createInteractiveState(this._sessionRecord(session));
        this.queue.enqueue(session);
      });
      if (session.autoplay?.enabled) this._warmAutoplayWorker();
      this.emitLegacyEvent?.('started', { session, state, config });
      this._logTransition('session_started', session);
      this.router.sync();
      this.emitState();
      return { success: true, started: true, sessionId: session.sessionId };
    } catch (error) {
      if (created?.sessionId) {
        this.queue.remove(created.sessionId);
        this.registry.remove(created.sessionId);
        this.discardRestoredGame?.(created.sessionId);
      }
      this.logger?.error?.(`[INTERACTIVE] Failed to start ${gameType}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  applyViewerMove({ viewerId, gameType, move, moveIdentity = null }) {
    const session = this.registry.getByParticipant(viewerId);
    if (!session) return { success: false, error: 'no_active_session' };
    if (session.gameType !== gameType) return { success: false, error: 'wrong_game_type' };
    if (moveIdentity && this.database.hasInteractiveMoveIdentity(session.sessionId, moveIdentity)) {
      return { success: true, duplicate: true, sessionId: session.sessionId };
    }
    if (session.turnRole !== 'viewer') return { success: false, error: 'not_viewer_turn' };
    if (session.turnPlayerId !== viewerId) {
      return { success: false, error: this._isViewerVersusViewer(session)
        ? 'not_active_participant_turn'
        : 'not_viewer_turn' };
    }
    const head = this.queue.head();
    if (!head || head.sessionId !== session.sessionId) return { success: false, error: 'not_queue_head' };
    if (this.router.snapshot().displaySessionId !== session.sessionId) {
      return { success: false, error: 'not_displayed' };
    }
    if (session.viewerDeadlineMs != null && this.now() >= session.viewerDeadlineMs) {
      this._handleViewerTimeout(session.sessionId, session.sessionRevision);
      return { success: false, error: 'viewer_timeout' };
    }

    const previousState = JSON.parse(JSON.stringify(session.adapter.getState()));
    const previous = {
      revision: session.sessionRevision,
      turnRole: session.turnRole,
      turnPlayerId: session.turnPlayerId,
      deadline: session.viewerDeadlineMs,
      remaining: session.viewerTimeRemainingMs,
      lastMoveIdentity: session.lastMoveIdentity,
      autoplay: session.autoplay ? { ...session.autoplay } : null,
      lastActivityAt: session.lastActivityAt
    };
    const result = session.adapter.applyParticipantMove(move, viewerId);
    if (!result.success) return { success: false, error: result.error };

    this.timers.clearViewer(session.sessionId, { persist: false });
    session.sessionRevision += 1;
    session.turnRole = session.adapter.getCurrentTurnRole();
    session.turnPlayerId = session.adapter.getCurrentTurnPlayerId();
    session.viewerDeadlineMs = null;
    session.viewerTimeRemainingMs = null;
    session.lastMoveIdentity = moveIdentity || `${previous.revision}:${JSON.stringify(move)}`;
    session.lastActivityAt = this.now();

    const complete = result.gameOver || session.adapter.isComplete();
    if (!complete && session.gameType === 'chess' && session.turnRole === 'host') {
      this._prepareAutoplayIntent(session);
    }
    if (
      !complete &&
      session.turnRole === 'viewer' &&
      this._viewerTimeoutEnabled(session.gameType)
    ) {
      this.timers.prepareViewer(session, this._viewerResponseSeconds(session.gameType), { persist: false });
    }
    let completionPayload = null;
    try {
      if (complete) {
        completionPayload = this._persistSessionCompletion(session, {
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
          this._rotateAfterTurn(session);
        });
      }
    } catch (error) {
      session.adapter.restoreState(previousState);
      session.sessionRevision = previous.revision;
      session.turnRole = previous.turnRole;
      session.turnPlayerId = previous.turnPlayerId;
      session.viewerDeadlineMs = previous.deadline;
      session.viewerTimeRemainingMs = previous.remaining;
      session.lastMoveIdentity = previous.lastMoveIdentity;
      session.autoplay = previous.autoplay;
      session.lastActivityAt = previous.lastActivityAt;
      this.queue.restore(this.database.getInteractiveQueue());
      this.timers.restore(session);
      this.logger?.error?.(`[INTERACTIVE] Viewer move persistence failed for ${session.sessionId}: ${error.message}`);
      return { success: false, error: 'persistence_error' };
    }
    if (complete) {
      this.registry.remove(session.sessionId);
      this._publishSessionCompletion(session, completionPayload);
    } else {
      this._publishSafely('Viewer move legacy event', session.sessionId, () => {
        this.emitLegacyEvent?.('move', {
          session,
          result,
          actorRole: 'viewer',
          actorId: viewerId,
          actorDisplayName: this._participant(session, viewerId)?.displayName || viewerId
        });
      });
      this._publishSafely('Viewer move transition log', session.sessionId, () => {
        this._logTransition('viewer_move_accepted', session, {
          queueSequence: this.queue.list().find(row => row.sessionId === session.sessionId)?.sequence
        });
      });
      const animationSpeed = this._bounded(session.config?.animationSpeed, 500, 100, 2000);
      const routed = this._publishSafely('Viewer move display routing', session.sessionId, () => {
        this.router.beginAnimation(session.sessionId, animationSpeed);
      });
      if (!routed) {
        this._publishSafely('Viewer move display reconciliation', session.sessionId, () => {
          this.router.sync({ force: true });
        });
      }
      this._publishSafely('Viewer move state', session.sessionId, () => this.emitState());
    }
    return { success: true, sessionId: session.sessionId, result };
  }

  applyHostMove(envelope) {
    const sessionId = Number(envelope?.sessionId);
    const session = this.registry.get(sessionId);
    if (!session) return { success: false, error: 'session_not_found' };
    if (session.gameType !== envelope.gameType) return { success: false, error: 'wrong_game_type' };
    const moveIdentity = envelope?.moveIdentity || null;
    const autoplayMove = typeof moveIdentity === 'string' && moveIdentity.startsWith('autoplay:');
    if (autoplayMove) {
      const execution = this.autoplayExecutions.get(sessionId);
      if (!execution || execution.identity !== moveIdentity || execution.token !== envelope?.autoplayToken) {
        return { success: false, error: 'autoplay_identity_reserved' };
      }
    }
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
    const previousState = JSON.parse(JSON.stringify(session.adapter.getState()));
    const previous = {
      revision: session.sessionRevision,
      turnRole: session.turnRole,
      turnPlayerId: session.turnPlayerId,
      deadline: session.viewerDeadlineMs,
      remaining: session.viewerTimeRemainingMs,
      hostTimeRemainingMs: session.hostTimeRemainingMs,
      lastMoveIdentity: session.lastMoveIdentity,
      autoplay: session.autoplay ? { ...session.autoplay } : null,
      lastActivityAt: session.lastActivityAt
    };
    const result = session.adapter.applyHostMove(envelope.move);
    if (!result.success) {
      if (session.gameType === 'chess') this.timers.resumeHostChess(session);
      return { success: false, error: result.error };
    }
    if (session.gameType === 'chess') {
      session.hostTimeRemainingMs = this._hostTimeFromState('chess', session.adapter.getState());
    }

    if (session.autoplay?.enabled) {
      if (autoplayMove) {
        session.autoplay.status = 'executed';
        session.autoplay.dueAtMs = null;
      } else {
        this._setAutoplayIntentStatus(session, 'cancelled', { persist: false });
      }
    }
    session.sessionRevision += 1;
    session.turnRole = session.adapter.getCurrentTurnRole();
    session.turnPlayerId = session.adapter.getCurrentTurnPlayerId();
    session.lastMoveIdentity = moveIdentity || `${session.sessionRevision - 1}:${JSON.stringify(envelope.move)}`;
    session.lastActivityAt = this.now();
    session.viewerDeadlineMs = null;
    session.viewerTimeRemainingMs = null;
    if (
      !result.gameOver &&
      !session.adapter.isComplete() &&
      session.turnRole === 'viewer' &&
      this._viewerTimeoutEnabled(session.gameType)
    ) {
      this.timers.prepareViewer(session, this._viewerResponseSeconds(session.gameType), { persist: false });
    }

    const complete = result.gameOver || session.adapter.isComplete();
    let completionPayload = null;
    try {
      if (complete) {
        completionPayload = this._persistSessionCompletion(session, {
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
          this._rotateAfterTurn(session);
        });
      }
    } catch (error) {
      session.adapter.restoreState(previousState);
      if (session.gameType === 'chess') {
        session.hostTimeRemainingMs = chessHostTimeBeforeMove;
        if (chessHostSide) session.adapter.game.timers[chessHostSide] = chessHostTimeBeforeMove;
      }
      session.sessionRevision = previous.revision;
      session.turnRole = previous.turnRole;
      session.turnPlayerId = previous.turnPlayerId;
      session.lastMoveIdentity = previous.lastMoveIdentity;
      session.autoplay = previous.autoplay;
      session.lastActivityAt = previous.lastActivityAt;
      session.viewerDeadlineMs = previous.deadline;
      session.viewerTimeRemainingMs = previous.remaining;
      session.hostTimeRemainingMs = previous.hostTimeRemainingMs;
      this.queue.restore(this.database.getInteractiveQueue());
      if (session.gameType === 'chess') this.timers.resumeHostChess(session);
      this.logger?.error?.(`[INTERACTIVE] Host move persistence failed for ${session.sessionId}: ${error.message}`);
      return { success: false, error: 'persistence_error' };
    }
    if (complete) this.registry.remove(session.sessionId);
    this._publishSafely('Host move legacy event', session.sessionId, () => {
      this.emitLegacyEvent?.('move', {
        session,
        result,
        actorRole: 'host',
        actorId: 'streamer',
        actorDisplayName: session.hostDisplayName
      });
    });
    this._publishSafely('Host move transition log', session.sessionId, () => {
      this._logTransition('host_move_accepted', session);
    });
    if (complete) {
      this._publishSessionCompletion(session, completionPayload);
    } else {
      const animationSpeed = this._bounded(session.config?.animationSpeed, 500, 100, 2000);
      const routed = this._publishSafely('Host move display routing', session.sessionId, () => {
        this.router.beginAnimation(session.sessionId, animationSpeed);
      });
      if (!routed) {
        this._publishSafely('Host move display reconciliation', session.sessionId, () => {
          this.router.sync({ force: true });
        });
      }
      this._publishSafely('Host move state', session.sessionId, () => this.emitState());
    }
    return { success: true, sessionId: session.sessionId, result };
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
    const display = this.router.snapshot();
    if (
      display.displaySessionId !== Number(sessionId) ||
      display.sessionRevision !== revision ||
      display.phase !== 'playing' ||
      display.suspendedReason
    ) {
      return false;
    }
    const timedOutPlayerId = session.turnPlayerId || session.viewerId;
    const winnerPlayerId = session.participantIds.find(participantId => participantId !== timedOutPlayerId);
    const winner = this._winnerForPlayerId(session, winnerPlayerId);
    const winnerRole = this._participant(session, winnerPlayerId)?.role === 'host' ? 'host' : 'viewer';
    this._markTimedOut(session, winner, 'viewer_timeout');
    session.sessionRevision += 1;
    session.lastActivityAt = this.now();
    this._logTransition('viewer_timeout', session, { terminalReason: 'viewer_timeout' });
    this._completeSession(session, {
      winner,
      winnerRole,
      reason: 'viewer_timeout',
      timedOutPlayerId,
      gameResult: { gameOver: true, winner, winReason: 'viewer_timeout', timeout: true }
    });
    return true;
  }

  _handleHostTimeout(sessionId, revision) {
    const session = this.registry.get(sessionId);
    if (!session || session.sessionRevision !== revision || session.turnRole !== 'host') return false;
    const timedOutPlayerId = session.turnPlayerId || 'streamer';
    const winnerPlayerId = session.participantIds.find(participantId => participantId !== timedOutPlayerId);
    const winner = this._winnerForPlayerId(session, winnerPlayerId);
    const winnerRole = this._participant(session, winnerPlayerId)?.role === 'host' ? 'host' : 'viewer';
    this._markTimedOut(session, winner, 'host_timeout');
    session.sessionRevision += 1;
    session.lastActivityAt = this.now();
    this._logTransition('host_timeout', session, { terminalReason: 'host_timeout' });
    this._completeSession(session, {
      winner,
      winnerRole,
      reason: 'host_timeout',
      timedOutPlayerId,
      gameResult: { gameOver: true, winner, winReason: 'host_timeout', timeout: true }
    });
    return true;
  }

  _persistSessionCompletion(session, outcome, {
    moveIdentity = null,
    skipAccounting = false,
    skipLeaderboard = false
  } = {}) {
    const autoplayRated = session.autoplay?.rated === true ||
      (session.autoplay?.rated == null && session.autoplay?.enabled === true);
    const autoplayAccounting = autoplayRated
      ? {
        enabled: true,
        rated: true,
        viewerId: session.viewerId,
        viewerElo: session.autoplay.viewerElo,
        targetElo: session.autoplay.targetElo,
        initialRating: session.autoplay.initialRating,
        kFactor: session.autoplay.kFactor
      }
      : null;
    if (session.autoplay) this._setAutoplayIntentStatus(session, 'completed', { persist: false });
    const winnerPlayer = outcome.winner == null
      ? null
      : this._participant(session, session.gameType === 'connect4'
        ? (Number(outcome.winner) === 1
          ? session.adapter.getState().player1?.username
          : session.adapter.getState().player2?.username)
        : (outcome.winner === 'white'
          ? session.adapter.getState().whitePlayer?.username
          : session.adapter.getState().blackPlayer?.username));
    const resultPayload = {
      sessionId: session.sessionId,
      gameType: session.gameType,
      viewerId: session.viewerId,
      viewerDisplayName: session.viewerDisplayName,
      hostDisplayName: session.hostDisplayName,
      participantIds: [...session.participantIds],
      participants: session.participants.map(participant => ({ ...participant })),
      turnPlayerId: session.turnPlayerId,
      winner: outcome.winner,
      winnerRole: outcome.winnerRole,
      winnerDisplayName: winnerPlayer?.displayName || null,
      timedOutPlayerId: outcome.timedOutPlayerId || null,
      reason: outcome.reason,
      gameResult: outcome.gameResult,
      state: session.adapter.getState(),
      sessionRevision: session.sessionRevision,
      config: session.config ? { ...session.config } : null,
      leaderboard: skipLeaderboard ? null : this._leaderboardPresentation(session),
      skipAccounting
    };
    if (autoplayAccounting) {
      Object.defineProperty(resultPayload, 'autoplay', {
        value: autoplayAccounting,
        enumerable: false,
        configurable: false
      });
    }
    this.timers.clear(session.sessionId);
    this.database.transaction(() => {
      if (moveIdentity && !this.database.recordInteractiveMoveIdentity(session.sessionId, moveIdentity)) {
        throw new Error('duplicate_move_identity');
      }
      this.queue.remove(session.sessionId);
      this.database.updateInteractiveState(session.sessionId, this._sessionRecord(session));
      this.database.completeInteractiveState(session.sessionId, outcome.reason);
    });
    return resultPayload;
  }

  _publishSessionCompletion(session, resultPayload, resultDurationMs = null) {
    this._publishSafely('Result accounting', session.sessionId, () => this.finishGame?.(resultPayload));
    this._publishSafely('Session completion legacy event', session.sessionId, () => {
      this.emitLegacyEvent?.('ended', resultPayload);
    });
    this._publishSafely('Session completion transition log', session.sessionId, () => {
      this._logTransition('session_ended', session, { terminalReason: resultPayload.reason });
    });
    const resultDuration = resultDurationMs == null
      ? this._settings().interactiveResultDisplaySeconds * 1000
      : resultDurationMs;
    const routed = this._publishSafely('Session result display', session.sessionId, () => {
      this.router.showResult(resultPayload, resultDuration, resultPayload.leaderboard);
    });
    if (!routed) {
      this._publishSafely('Session result display reconciliation', session.sessionId, () => {
        this.router.recoverResult(resultPayload, resultDuration, resultPayload.leaderboard);
      });
    }
    this._publishSafely('Session completion state', session.sessionId, () => this.emitState());
  }

  _completeSession(session, outcome, {
    moveIdentity = null,
    skipAccounting = false,
    resultDurationMs = null,
    skipLeaderboard = false
  } = {}) {
    const resultPayload = this._persistSessionCompletion(session, outcome, {
      moveIdentity,
      skipAccounting,
      skipLeaderboard
    });
    this.registry.remove(session.sessionId);
    this._publishSessionCompletion(session, resultPayload, resultDurationMs);
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

  resignHost(input) {
    const envelope = typeof input === 'object' && input !== null
      ? input
      : { sessionId: input };
    const session = this.registry.get(envelope.sessionId);
    if (!session) return { success: false, error: 'session_not_found' };
    if (session.gameType !== 'chess') return { success: false, error: 'wrong_game_type' };
    if (envelope.sessionRevision != null && session.sessionRevision !== Number(envelope.sessionRevision)) {
      return { success: false, error: 'stale_session_revision' };
    }
    if (envelope.displayRevision != null && this.router.displayRevision !== Number(envelope.displayRevision)) {
      return { success: false, error: 'stale_display_revision' };
    }

    const state = session.adapter.getState();
    const host = [state.whitePlayer, state.blackPlayer].find(player => player?.role === 'streamer');
    if (!host?.username) return { success: false, error: 'host_not_found' };

    const resignation = session.adapter.game.resign(host.username);
    if (!resignation.success) return { success: false, error: resignation.error };

    session.sessionRevision += 1;
    session.lastActivityAt = this.now();
    this._logTransition('host_resignation', session, { terminalReason: 'resignation' });
    return {
      success: true,
      result: this._completeSession(session, {
        winner: resignation.winner,
        winnerRole: 'viewer',
        reason: 'resignation',
        gameResult: resignation
      })
    };
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
      connect4Matchmaking: this.getConnect4MatchmakingSnapshot(),
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
    const autoplaySessionIds = new Set([
      ...this.autoplayTimers.keys(),
      ...this.autoplayExecutions.keys()
    ]);
    for (const sessionId of autoplaySessionIds) {
      this._clearAutoplayRuntime(sessionId, { abort: true });
    }
    Promise.resolve(this.autoplayService?.destroy?.()).catch(error => {
      this.logger?.warn?.(`[INTERACTIVE] Chess autoplay worker cleanup failed: ${error.message}`);
    });
    this.timers.destroy();
    this.router.destroy();
  }
}

module.exports = InteractiveController;
