/**
 * LTTH Game Engine Plugin - Main Entry Point
 * 
 * Interactive game engine for TikTok LIVE streams.
 * Allows viewers to play games with streamers using chat commands and gifts.
 * 
 * Features:
 * - Connect4 (Vier Gewinnt) game
 * - Chess (Blitzschach) game
 * - Plinko game
 * - Glücksrad (Wheel of Fortune) game
 * - Slot Machine game
 * - Live Arena persistent overlay game
 * - GCCE chat command integration
 * - Gift trigger support
 * - XP rewards for winners/losers
 * - Customizable overlays
 * - Extensible game framework
 */

const path = require('path');

function clearGameEngineModuleCache() {
  const pluginRoot = path.resolve(__dirname);
  for (const modulePath of Object.keys(require.cache)) {
    if (modulePath === __filename) {
      continue;
    }

    const relativePath = path.relative(pluginRoot, modulePath);
    if (relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))) {
      delete require.cache[modulePath];
    }
  }
}

// Running app versions reload only this entry module. Clear the Game Engine's
// cached children here so a plugin-only reload also refreshes its backend.
clearGameEngineModuleCache();

const GameEngineDatabase = require('./backend/database');
const Connect4Game = require('./games/connect4');
const ChessGame = require('./games/chess');
const PlinkoGame = require('./games/plinko');
const WheelGame = require('./games/wheel');
const SlotGame = require('./games/slot');
const ArenaGame = require('./games/arena');
const UnifiedQueueManager = require('./backend/unified-queue');
const InteractiveController = require('./backend/interactive-controller');
const SocketAuthorization = require('./backend/socket-authorization');
const fs = require('fs');
const multer = require('multer');
const net = require('net');

const AVATAR_PROXY_ALLOWED_HOST_SUFFIXES = [
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktokcdn-eu.com',
  'bytegoofy.com',
  'tiktok.com',
  'muscdn.com',
  'tiktokv.com'
];
const AVATAR_PROXY_BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '::ffff:127.0.0.1']);
const AVATAR_PROXY_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_PROXY_TIMEOUT_MS = 5000;
const AVATAR_PROXY_MAX_REDIRECTS = 3;
const CONNECT4_AUDIO_EVENTS = Object.freeze([
  'new_challenger',
  'challenge_accepted',
  'piece_drop',
  'player_1_wins',
  'player_2_wins',
  'game_over',
  'timer_warning'
]);
const CONNECT4_MEDIA_EVENTS = new Set(CONNECT4_AUDIO_EVENTS);
const WHEEL_AUDIO_EVENTS = Object.freeze(['spinning', 'prize1', 'prize2', 'prize3', 'lost']);
const SLOT_AUDIO_EVENTS = Object.freeze(['spin', 'small_win', 'medium_win', 'big_win', 'jackpot', 'near_miss', 'reel_stop']);
const CONNECT4_AUDIO_EXTENSIONS = new Map([
  ['audio/mpeg', '.mp3'],
  ['audio/mp3', '.mp3'],
  ['audio/wav', '.wav'],
  ['audio/x-wav', '.wav'],
  ['audio/ogg', '.ogg'],
  ['audio/webm', '.webm'],
  ['audio/mp4', '.m4a'],
  ['audio/x-m4a', '.m4a'],
  ['audio/aac', '.aac']
]);
const CONNECT4_AUDIO_TYPES_BY_EXTENSION = new Map([
  ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'],
  ['.ogg', 'audio/ogg'],
  ['.webm', 'audio/webm'],
  ['.m4a', 'audio/mp4'],
  ['.aac', 'audio/aac']
]);
const CONNECT4_MATCHMAKING_DRAIN_RETRY_MS = 1000;

class GameEnginePlugin {
  constructor(api) {
    this.api = api;
    this.io = this._getSocketIO();
    this.db = null;
    this.logger = {
      info: (msg) => this.api.log(msg, 'info'),
      error: (msg) => this.api.log(msg, 'error'),
      warn: (msg) => this.api.log(msg, 'warn'),
      debug: (msg) => this.api.log(msg, 'debug')
    };
    this.socketAuthorization = new SocketAuthorization(this.logger);
    
    // Active game sessions (in-memory)
    this.activeSessions = new Map(); // sessionId -> gameInstance
    
    // Pending challenges (waiting for opponent)
    this.pendingChallenges = new Map(); // sessionId -> { challenger, gift, timeout }
    
    
    // Plinko game instance
    this.plinkoGame = null;
    
    // Wheel (Glücksrad) game instance
    this.wheelGame = null;

    // Slot Machine game instance
    this.slotGame = null;

    // Live Arena game instance
    this.arenaGame = null;
    
    // Unified queue manager for Plinko, Wheel, Slot, Connect4, and Chess
    this.unifiedQueue = new UnifiedQueueManager(this.logger, this.io);
    this.unifiedQueue.setGameEnginePlugin(this);
    this.interactiveController = null;
    this.connect4MatchmakingTimeouts = new Map();
    this.connect4MatchmakingDrainTimeout = null;
    this.connect4MatchmakingDrainRetries = 0;
    this.recentConnect4MatchmakingEvents = new Map();
    
    // GCCE integration state
    this.gcceCommandsRegistered = false;
    this.gcceRetryInterval = null;
    this.gcceRetryCount = 0;
    this.gcceEventListenersRegistered = false;
    this.gccePluginEventHandlers = [];
    
    // Gift event deduplication (prevent double triggers from rapid/duplicate events)
    this.recentGiftEvents = new Map(); // key: `${username}_${giftName}_${giftId}` -> timestamp
    this.GIFT_DEDUP_WINDOW_MS = 1000; // 1 second deduplication window
    this.giftDedupCleanupInterval = null;
    this.MAX_REPEAT_TRIGGERS = 50; // Cap for gift repeat count to prevent abuse
    
    // Default configurations
    this.defaultConfigs = {
      connect4: {
        boardColor: '#2C3E50',
        player1Color: '#E74C3C',
        player2Color: '#F1C40F',
        textColor: '#FFFFFF',
        fontFamily: 'Arial, sans-serif',
        showCoordinates: true,
        animationSpeed: 500,
        streamerRole: 'player2', // streamer is player 2 (yellow) by default
        soundEnabled: false,
        soundVolume: 0.5,
        showWinStreaks: true,
        celebrationEnabled: true,
        challengeTimeout: 30, // seconds to wait for challenger
        showChallengeScreen: true,
        leaderboardEnabled: true,
        leaderboardDisplayTime: 3, // seconds per leaderboard
        leaderboardTypes: ['daily', 'season', 'lifetime', 'elo'], // which boards to show
        eloEnabled: true,
        eloStartRating: 1000,
        eloKFactor: 32,
        roundTimerEnabled: false,
        roundTimeLimit: 30, // seconds per move
        roundWarningTime: 10, // warning at X seconds
        timeoutLockoutMinutes: 1440,
        chatCommand: 'c4start', // customizable chat command to start Connect4
        displayTexts: {
          titleText:     '🔵 CONNECT 4',
          labelPlayer1:  'Spieler 1',
          labelPlayer2:  'Spieler 2',
          labelYourTurn: 'Du bist dran! Tippe A-G',
          labelWaiting:  'Warte auf Gegner...',
          labelWin:      '🏆 {player} gewinnt!',
          labelDraw:     '🤝 Unentschieden!',
        }
      },
      chess: {
        boardTheme: 'dark', // dark, light, wood
        backgroundColor: '#1a1a2e',
        whiteColor: '#4CAF50',
        blackColor: '#2196F3',
        whitePiecesColor: '#FFFFFF',
        blackPiecesColor: '#000000',
        textColor: '#FFFFFF',
        fontFamily: 'Arial, sans-serif',
        showCoordinates: true,
        animationSpeed: 300,
        highlightLastMove: true,
        highlightCheck: true,
        showCapturedPieces: true,
        streamerRole: 'random', // 'white', 'black', or 'random'
        soundEnabled: true,
        soundVolume: 0.5,
        showWinStreaks: true,
        celebrationEnabled: true,
        challengeTimeout: 30,
        showChallengeScreen: true,
        leaderboardEnabled: true,
        leaderboardDisplayTime: 3,
        leaderboardTypes: ['daily', 'season', 'lifetime', 'elo'],
        eloEnabled: true,
        eloStartRating: 1000,
        eloKFactor: 32,
        defaultTimeControl: '5+0', // Format: "minutes+increment" (e.g., "3+0", "3+2", "5+0", "10+5")
        timeControls: ['3+0', '3+2', '5+0', '5+3', '10+0', '10+5'], // Available time controls
        timerWarningTime: 30, // Warning when timer below X seconds
        displayTexts: {
          titleText:      '♟️ SCHACH',
          labelWhite:     'Weiß',
          labelBlack:     'Schwarz',
          labelYourTurn:  'Dein Zug',
          labelCheck:     '⚠️ Schach!',
          labelCheckmate: '♚ Schachmatt!',
          labelDraw:      '🤝 Remis!',
          labelWin:       '🏆 {player} gewinnt!',
        }
      },
      interactive: {
        chessViewerResponseSeconds: 60,
        maxConcurrentInteractiveSessions: 20,
        interactiveResultDisplaySeconds: 3
      },
      arena: ArenaGame.DEFAULT_CONFIG
    };
  }

  _resolveHostDisplayName() {
    const liveUsername = String(this.api.tiktok?.currentUsername || '').trim().replace(/^@/, '');
    if (liveUsername) return liveUsername;
    const activeProfile = String(this.api.pluginLoader?.activeProfile || '').trim().replace(/^@/, '');
    return activeProfile || 'Streamer';
  }

  _normalizeTikTokUsername(value) {
    return String(value || '').trim().replace(/^@/, '').toLowerCase();
  }

  _isHostChatEvent(data = {}) {
    const hostUsername = this._normalizeTikTokUsername(this._resolveHostDisplayName());
    if (!hostUsername) return false;

    const user = data.user && typeof data.user === 'object' ? data.user : {};
    return [data.uniqueId, data.username, user.uniqueId, user.username]
      .some(candidate => this._normalizeTikTokUsername(candidate) === hostUsername);
  }

  _getChatMoveIdentity(data) {
    const identity = data?.msgId ?? data?.messageId ?? data?.id ?? data?.eventId;
    return identity == null || identity === '' ? null : `chat:${identity}`;
  }

  _isDuplicateConnect4MatchmakingEvent(data = {}) {
    const identity = this._getChatMoveIdentity(data);
    if (!identity) return false;
    const now = Date.now();
    const cutoff = now - 60000;
    for (const [knownIdentity, timestamp] of this.recentConnect4MatchmakingEvents) {
      if (timestamp > cutoff) break;
      this.recentConnect4MatchmakingEvents.delete(knownIdentity);
    }
    const previous = this.recentConnect4MatchmakingEvents.get(identity);
    if (previous && now - previous < 60000) return true;
    this.recentConnect4MatchmakingEvents.set(identity, now);
    while (this.recentConnect4MatchmakingEvents.size > 1000) {
      this.recentConnect4MatchmakingEvents.delete(this.recentConnect4MatchmakingEvents.keys().next().value);
    }
    return false;
  }

  _connect4StartAliases() {
    return new Set(['connect4', '4gewinnt', this.getConnect4StartCommandName()]);
  }

  _isConnect4StartAlias(message) {
    return this._connect4StartAliases().has(this.normalizeChatCommandName(message));
  }

  _getInteractiveSettings() {
    const stored = this.db?.getGameConfig?.('interactive') || {};
    const settings = this._getConfigWithDefaults('interactive', stored);
    const connect4 = this._getConfigWithDefaults(
      'connect4',
      this.db?.getGameConfig?.('connect4') || {}
    );
    settings.connect4ViewerTimeoutEnabled = Boolean(connect4.roundTimerEnabled);
    settings.connect4ViewerResponseSeconds = connect4.roundTimeLimit;
    settings.connect4ViewerWarningSeconds = connect4.roundWarningTime;
    return settings;
  }

  _getSocketIO() {
    const noopSocket = { emit: () => {}, on: () => {} };
    try {
      if (typeof this.api.getSocketIO === 'function') {
        return this.api.getSocketIO() || noopSocket;
      }
    } catch (error) {
      if (typeof this.api.log === 'function') {
        this.api.log(`Game Engine socket unavailable: ${error.message}`, 'warn');
      }
    }
    return noopSocket;
  }

  _ensureDatabaseInitialized() {
    if (this.db) {
      return;
    }

    const apiDb = typeof this.api.getDatabase === 'function' ? this.api.getDatabase() : null;
    if (apiDb && !apiDb.db && typeof apiDb.createSession === 'function') {
      this.db = apiDb;
      if (typeof this.db.initialize === 'function') {
        this.db.initialize();
      }
      return;
    }

    this.db = new GameEngineDatabase(this.api, this.logger);
    this.db.initialize();
  }

  _createInteractiveGame({
    gameType,
    viewerId,
    viewerDisplayName,
    participants = null,
    hostDisplayName,
    config,
    timeControl,
    triggerType,
    triggerValue
  }) {
    if (gameType === 'connect4') {
      const viewerParticipants = Array.isArray(participants) && participants.length === 2
        ? participants
        : null;
      if (viewerParticipants?.every(participant => participant.role === 'viewer')) {
        const [playerOne, playerTwo] = viewerParticipants;
        const sessionId = this.db.createSession(
          gameType,
          playerOne.id,
          'viewer',
          triggerType,
          triggerValue
        );
        this.db.addPlayer2(sessionId, playerTwo.id, 'viewer');
        const game = new Connect4Game(sessionId, {
          username: playerOne.id,
          role: 'viewer',
          color: config.player1Color,
          nickname: playerOne.displayName,
          avatarSource: playerOne.avatarSource || ''
        }, {
          username: playerTwo.id,
          role: 'viewer',
          color: config.player2Color,
          nickname: playerTwo.displayName,
          avatarSource: playerTwo.avatarSource || ''
        }, this.logger);
        this.activeSessions.set(sessionId, game);
        return { sessionId, game, timeControl: null };
      }
      const streamerRole = config.streamerRole || 'player2';
      const viewerParticipant = viewerParticipants?.find(participant => participant.role === 'viewer');
      const sessionId = this.db.createSession(
        gameType,
        streamerRole === 'player1' ? 'streamer' : viewerId,
        streamerRole === 'player1' ? 'streamer' : 'viewer',
        triggerType,
        triggerValue
      );
      this.db.addPlayer2(
        sessionId,
        streamerRole === 'player2' ? 'streamer' : viewerId,
        streamerRole === 'player2' ? 'streamer' : 'viewer'
      );
      const player1 = {
        username: streamerRole === 'player1' ? 'streamer' : viewerId,
        role: streamerRole === 'player1' ? 'streamer' : 'viewer',
        color: config.player1Color,
        nickname: streamerRole === 'player1' ? hostDisplayName : viewerDisplayName,
        avatarSource: streamerRole === 'player1' ? '' : (viewerParticipant?.avatarSource || '')
      };
      const player2 = {
        username: streamerRole === 'player2' ? 'streamer' : viewerId,
        role: streamerRole === 'player2' ? 'streamer' : 'viewer',
        color: config.player2Color,
        nickname: streamerRole === 'player2' ? hostDisplayName : viewerDisplayName,
        avatarSource: streamerRole === 'player2' ? '' : (viewerParticipant?.avatarSource || '')
      };
      const game = new Connect4Game(sessionId, player1, player2, this.logger);
      this.activeSessions.set(sessionId, game);
      return { sessionId, game, timeControl: null };
    }

    const configuredSide = config.streamerRole || 'random';
    const streamerSide = configuredSide === 'white' || configuredSide === 'black'
      ? configuredSide
      : Math.random() < 0.5 ? 'white' : 'black';
    const gameTimeControl = timeControl || config.defaultTimeControl || '5+0';
    const sessionId = this.db.createSession(
      'chess',
      streamerSide === 'white' ? 'streamer' : viewerId,
      streamerSide === 'white' ? 'streamer' : 'viewer',
      triggerType,
      triggerValue
    );
    this.db.addPlayer2(
      sessionId,
      streamerSide === 'black' ? 'streamer' : viewerId,
      streamerSide === 'black' ? 'streamer' : 'viewer'
    );
    const whitePlayer = {
      username: streamerSide === 'white' ? 'streamer' : viewerId,
      role: streamerSide === 'white' ? 'streamer' : 'viewer',
      color: config.whiteColor,
      nickname: streamerSide === 'white' ? hostDisplayName : viewerDisplayName,
      side: 'white'
    };
    const blackPlayer = {
      username: streamerSide === 'black' ? 'streamer' : viewerId,
      role: streamerSide === 'black' ? 'streamer' : 'viewer',
      color: config.blackColor,
      nickname: streamerSide === 'black' ? hostDisplayName : viewerDisplayName,
      side: 'black'
    };
    const game = new ChessGame(sessionId, whitePlayer, blackPlayer, gameTimeControl, this.logger);
    this.activeSessions.set(sessionId, game);
    return { sessionId, game, timeControl: gameTimeControl };
  }

  _restoreInteractiveGame(row) {
    let game;
    if (row.gameType === 'connect4') {
      game = new Connect4Game(row.sessionId, row.state.player1, row.state.player2, this.logger);
    } else {
      game = new ChessGame(
        row.sessionId,
        row.state.whitePlayer,
        row.state.blackPlayer,
        row.timeControl || '5+0',
        this.logger
      );
    }
    this.activeSessions.set(row.sessionId, game);
    return { sessionId: row.sessionId, game, timeControl: row.timeControl };
  }

  _discardRestoredInteractiveGame(sessionId) {
    this.activeSessions.delete(Number(sessionId));
  }

  _emitInteractiveLegacyEvent(event, payload) {
    const session = payload.session;
    if (event === 'started') {
      this.io.emit('game-engine:game-started', {
        sessionId: session.sessionId,
        gameType: session.gameType,
        state: payload.state,
        config: payload.config,
        timeControl: session.timeControl,
        useUnified: true,
        interactive: true
      });
      return;
    }
    if (event === 'move') {
      const move = payload.result.move;
      if (move && this.db?.saveMove) {
        const playerUsername = payload.actorId || (payload.actorRole === 'host' ? 'streamer' : session.viewerId);
        this.db.saveMove(session.sessionId, playerUsername, move, move.moveNumber);
      }
      this.io.emit('game-engine:move-made', {
        sessionId: session.sessionId,
        gameType: session.gameType,
        move,
        state: session.adapter.getState(),
        interactive: true
      });
    }
  }

  _finishInteractiveGame(payload) {
    this._applyViewerTimeoutLockout(payload);
    this.endGame(
      payload.sessionId,
      payload.winner,
      payload.reason,
      payload.gameResult,
      { interactive: true, skipAccounting: payload.skipAccounting === true }
    );
    this._drainPendingConnect4Fallbacks();
  }

  _initializeInteractiveController() {
    this.interactiveController = new InteractiveController({
      database: this.db,
      io: this.io,
      logger: this.logger,
      createGame: input => this._createInteractiveGame(input),
      restoreGame: row => this._restoreInteractiveGame(row),
      discardRestoredGame: sessionId => this._discardRestoredInteractiveGame(sessionId),
      finishGame: payload => this._finishInteractiveGame(payload),
      emitLegacyEvent: (event, payload) => this._emitInteractiveLegacyEvent(event, payload),
      resolveHostName: () => this._resolveHostDisplayName(),
      getConfig: gameType => this._getConfigWithDefaults(gameType, this.db.getGameConfig(gameType)),
      getSettings: () => this._getInteractiveSettings()
    });
    const recovery = this.interactiveController.init();
    this._recoverConnect4MatchmakingChallenges();
    return recovery;
  }

  _recoverConnect4MatchmakingChallenges() {
    const challenges = this.interactiveController?.listRecoverableConnect4Challenges?.() || [];
    const recovered = challenges.map(challenge => this._recoverConnect4MatchmakingChallenge(challenge));
    this._drainPendingConnect4Fallbacks();
    return recovered;
  }

  _recoverConnect4MatchmakingChallenge(challenge) {
    if (!challenge?.challengeId) return null;
    if (challenge.status === 'fallback_pending') {
      return this._drainPendingConnect4Fallbacks();
    }
    if (challenge.status !== 'open') return null;
    if (Number(challenge.expiresAtMs) <= Date.now()) {
      return this._expireConnect4MatchmakingChallenge(challenge);
    }
    this._scheduleConnect4MatchmakingExpiry(challenge);
    return { success: true, scheduled: true, challengeId: challenge.challengeId };
  }

  _scheduleConnect4MatchmakingExpiry(challenge) {
    if (!challenge?.challengeId || challenge.status !== 'open') return;
    const challengeId = challenge.challengeId;
    this._clearConnect4MatchmakingExpiry(challengeId);
    const delay = Math.max(0, Number(challenge.expiresAtMs) - Date.now());
    const timeout = setTimeout(() => {
      if (this.connect4MatchmakingTimeouts.get(challengeId) !== timeout) return;
      this.connect4MatchmakingTimeouts.delete(challengeId);
      this._expireConnect4MatchmakingChallenge({ challengeId }).catch(error => {
        this.logger.error(`Failed to expire Connect4 matchmaking challenge: ${error.message}`);
      });
    }, delay);
    this.connect4MatchmakingTimeouts.set(challengeId, timeout);
    if (typeof timeout.unref === 'function') {
      timeout.unref();
    }
  }

  _clearConnect4MatchmakingExpiry(challengeId) {
    const timeout = this.connect4MatchmakingTimeouts.get(challengeId);
    if (!timeout) return false;
    clearTimeout(timeout);
    this.connect4MatchmakingTimeouts.delete(challengeId);
    return true;
  }

  async _expireConnect4MatchmakingChallenge(challenge) {
    const result = this.interactiveController?.beginExpiredConnect4Fallback?.(challenge.challengeId);
    if (!result?.success) return result || { success: false, error: 'interactive_controller_unavailable' };
    const started = this.interactiveController.startPendingConnect4Fallback?.(
      challenge.challengeId,
      this._resolveHostDisplayName()
    ) || { success: false, error: 'interactive_controller_unavailable' };
    if (started.error === 'interactive_session_limit') {
      this._scheduleConnect4MatchmakingFallbackDrain();
    }
    return started;
  }

  _scheduleConnect4MatchmakingFallbackDrain() {
    if (this.connect4MatchmakingDrainTimeout || this.connect4MatchmakingDrainRetries >= 1) return;
    this.connect4MatchmakingDrainRetries += 1;
    this.connect4MatchmakingDrainTimeout = setTimeout(() => {
      this.connect4MatchmakingDrainTimeout = null;
      this._drainPendingConnect4Fallbacks();
    }, CONNECT4_MATCHMAKING_DRAIN_RETRY_MS);
    if (typeof this.connect4MatchmakingDrainTimeout.unref === 'function') {
      this.connect4MatchmakingDrainTimeout.unref();
    }
  }

  _clearConnect4MatchmakingFallbackDrain() {
    if (this.connect4MatchmakingDrainTimeout) {
      clearTimeout(this.connect4MatchmakingDrainTimeout);
      this.connect4MatchmakingDrainTimeout = null;
    }
    this.connect4MatchmakingDrainRetries = 0;
  }

  _drainPendingConnect4Fallbacks() {
    const challenges = this.interactiveController?.listRecoverableConnect4Challenges?.() || [];
    const pending = challenges.filter(challenge => challenge?.status === 'fallback_pending');
    if (pending.length === 0) {
      this._clearConnect4MatchmakingFallbackDrain();
      return { success: true, drained: 0 };
    }

    let drained = 0;
    for (const challenge of pending) {
      const result = this.interactiveController.startPendingConnect4Fallback?.(
        challenge.challengeId,
        this._resolveHostDisplayName()
      ) || { success: false, error: 'interactive_controller_unavailable' };
      if (result.error === 'interactive_session_limit') {
        this._scheduleConnect4MatchmakingFallbackDrain();
        return { success: false, error: result.error, drained };
      }
      if (result.success) drained += 1;
    }
    this._clearConnect4MatchmakingFallbackDrain();
    return { success: true, drained };
  }

  _safeJoin(baseDir, ...parts) {
    const root = path.resolve(baseDir);
    const target = path.resolve(root, ...parts.map(part => String(part || '')));
    const relative = path.relative(root, target);

    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      return target;
    }

    return null;
  }

  _isPathInside(baseDir, filePath) {
    if (!filePath || typeof filePath !== 'string') return false;
    const root = path.resolve(baseDir);
    const target = path.resolve(filePath);
    const relative = path.relative(root, target);
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  _serializeConnect4Media(row, mediaDir) {
    if (
      !row ||
      !CONNECT4_MEDIA_EVENTS.has(row.media_event) ||
      !this._isPathInside(mediaDir, row.file_path) ||
      !fs.existsSync(row.file_path)
    ) {
      return null;
    }

    const revision = Math.floor(fs.statSync(row.file_path).mtimeMs);
    return {
      game_type: 'connect4',
      media_type: 'audio',
      media_event: row.media_event,
      file_type: row.file_type,
      enabled: row.enabled,
      filename: path.basename(row.file_path),
      url: `/game-engine/media/connect4/${encodeURIComponent(row.media_event)}?v=${revision}`
    };
  }

  _resolveConnect4AudioUpload(file) {
    if (!file || typeof file !== 'object') return null;

    const mimetype = String(file.mimetype || '').trim().toLowerCase();
    const originalExtension = path.extname(String(file.originalname || '')).toLowerCase();
    const extensionFromMime = CONNECT4_AUDIO_EXTENSIONS.get(mimetype);
    const fileTypeFromExtension = CONNECT4_AUDIO_TYPES_BY_EXTENSION.get(originalExtension);
    const extension = extensionFromMime || (fileTypeFromExtension ? originalExtension : null);

    if (!extension) return null;

    return {
      extension,
      fileType: extensionFromMime ? mimetype : fileTypeFromExtension
    };
  }

  _getUploadedConnect4AudioFile(req) {
    if (req?.file) return req.file;
    const files = req?.files;

    if (Array.isArray(files)) {
      return files.find(file => file?.fieldname === 'file') ||
        files.find(file => file?.fieldname === 'audio') ||
        files[0] ||
        null;
    }

    return files?.file?.[0] || files?.audio?.[0] || null;
  }

  _isSafeAudioFilename(filename) {
    if (!filename || typeof filename !== 'string') {
      return false;
    }

    const normalized = filename.trim();
    if (normalized !== filename || normalized.includes('/') || normalized.includes('\\') || normalized.includes('..')) {
      return false;
    }

    return /^[A-Za-z0-9 ._-]+\.mp3$/i.test(normalized);
  }

  _sanitizeNumericId(value, fallback = '1') {
    const id = String(value || '').trim();
    if (!/^[0-9]+$/.test(id)) {
      return fallback;
    }

    const parsed = parseInt(id, 10);
    return parsed > 0 ? String(parsed) : fallback;
  }

  _sanitizeWheelAudioType(audioType) {
    return WHEEL_AUDIO_EVENTS.includes(audioType) ? audioType : null;
  }

  _getGameAudioEvents(gameType) {
    if (gameType === 'connect4') return CONNECT4_AUDIO_EVENTS;
    if (gameType === 'wheel') return WHEEL_AUDIO_EVENTS;
    if (gameType === 'slot') return SLOT_AUDIO_EVENTS;
    return null;
  }

  _getGameAudioScopeId(gameType, scopeId) {
    if (gameType === 'connect4') return 'default';
    if (gameType === 'wheel' || gameType === 'slot') {
      const normalizedScopeId = String(scopeId || '').trim();
      if (!/^[0-9]+$/.test(normalizedScopeId)) return null;
      const numericScopeId = parseInt(normalizedScopeId, 10);
      return numericScopeId > 0 ? String(numericScopeId) : null;
    }
    return null;
  }

  _getAudioSettings(gameType, scopeId, sourceSettings = {}) {
    const audioEvents = this._getGameAudioEvents(gameType) || [];
    return audioEvents.reduce((settings, audioEvent) => {
      settings[audioEvent] = {
        ...(sourceSettings[audioEvent] || {}),
        enabled: this.db.isGameAudioEnabled(gameType, scopeId, audioEvent)
      };
      return settings;
    }, {});
  }

  _isStreamerLockoutIdentity(username) {
    const normalizedUsername = this._normalizeTikTokUsername(username);
    const hostName = this._normalizeTikTokUsername(this._resolveHostDisplayName());
    return normalizedUsername === 'streamer' ||
      (normalizedUsername && hostName && normalizedUsername.toLowerCase() === hostName.toLowerCase());
  }

  _getActiveGameLockout(username) {
    if (!username || this._isStreamerLockoutIdentity(username)) return null;
    if (typeof this.db?.getActiveGamePlayerLockout !== 'function') return null;

    try {
      return this.db.getActiveGamePlayerLockout(username);
    } catch (error) {
      this.logger.error(`Failed to read game lockout for ${username}: ${error.message}`);
      return null;
    }
  }

  _formatGameLockoutMessage(lockout) {
    const remainingMs = Math.max(0, Number(lockout?.remainingMs) || 0);
    const remainingHours = Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)));
    return `You are locked out from games for ${remainingHours}h after timing out.`;
  }

  _rejectIfGameLocked(username, nickname, gameType) {
    const lockout = this._getActiveGameLockout(username);
    if (!lockout) return null;

    const payload = {
      username,
      nickname: nickname || username,
      gameType,
      reason: lockout.reason,
      expiresAt: lockout.expiresAt,
      remainingMs: lockout.remainingMs
    };
    this.io.emit('game-engine:player-lockout', payload);
    this.logger.info(`[GAME LOCKOUT] ${username} blocked from ${gameType || 'game'} (${Math.ceil(lockout.remainingMs / 1000)}s remaining)`);
    return {
      success: false,
      error: 'game_lockout',
      message: this._formatGameLockoutMessage(lockout),
      displayOverlay: true,
      lockedUntil: lockout.expiresAt,
      remainingMs: lockout.remainingMs
    };
  }

  _applyViewerTimeoutLockout(payload) {
    if (payload?.reason !== 'viewer_timeout') return null;
    const viewerId = payload.timedOutPlayerId || payload.viewerId;
    if (!viewerId || this._isStreamerLockoutIdentity(viewerId)) return null;
    if (typeof this.db?.setGamePlayerLockout !== 'function') return null;

    const connect4Config = this._getConfigWithDefaults(
      'connect4',
      this.db.getGameConfig?.('connect4') || {}
    );
    const lockoutMinutes = connect4Config.timeoutLockoutMinutes;
    if (lockoutMinutes === 0) return null;

    const timedOutParticipant = Array.isArray(payload.participants)
      ? payload.participants.find(participant => participant.id === viewerId)
      : null;

    try {
      const lockout = this.db.setGamePlayerLockout(
        viewerId,
        'viewer_timeout',
        lockoutMinutes * 60 * 1000
      );
      if (lockout) {
        this.io.emit('game-engine:player-lockout', {
          username: viewerId,
          nickname: timedOutParticipant?.displayName || payload.viewerDisplayName || viewerId,
          gameType: payload.gameType || 'connect4',
          reason: lockout.reason,
          expiresAt: lockout.expiresAt,
          remainingMs: lockout.remainingMs
        });
        this.logger.info(`[GAME LOCKOUT] ${viewerId} locked from games for ${lockoutMinutes} minute(s) after interactive timeout`);
      }
      return lockout;
    } catch (error) {
      this.logger.error(`Failed to persist game lockout for ${viewerId}: ${error.message}`);
      return null;
    }
  }

  _getSocketAddress(socket) {
    return this.socketAuthorization.getSocketAddress(socket);
  }

  _hasValidAdminSocketToken(socket) {
    return this.socketAuthorization.hasValidAdminToken(socket);
  }

  _isAdminSocket(socket) {
    return this.socketAuthorization.isAdmin(socket);
  }

  _isOverlaySocket(socket) {
    return this.socketAuthorization.isOverlay(socket);
  }

  _requireSocketRole(socket, eventName, allowedRoles) {
    return this.socketAuthorization.requireRole(socket, eventName, allowedRoles);
  }

  _isPrivateIpAddress(hostname) {
    const ipVersion = net.isIP(hostname);
    if (!ipVersion) return false;

    if (ipVersion === 4) {
      const parts = hostname.split('.').map((part) => Number(part));
      const [first, second] = parts;
      return first === 127 || first === 0 || first === 10 || first === 169 && second === 254 || first === 192 && second === 168 || first === 172 && second >= 16 && second <= 31;
    }

    if (ipVersion === 6) {
      const normalized = hostname.toLowerCase();
      if (normalized === '::1' || normalized === '::ffff:127.0.0.1') {
        return true;
      }
      if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80')) {
        return true;
      }
      if (normalized.startsWith('::ffff:')) {
        const embedded = normalized.replace(/^::ffff:/, '');
        return this._isPrivateIpAddress(embedded);
      }
      return false;
    }

    return false;
  }

  _isDisallowedAvatarHost(hostname) {
    const normalizedHost = String(hostname || '').toLowerCase();
    if (!normalizedHost) return true;
    if (AVATAR_PROXY_BLOCKED_HOSTS.has(normalizedHost)) return true;
    if (this._isPrivateIpAddress(normalizedHost)) return true;
    return !AVATAR_PROXY_ALLOWED_HOST_SUFFIXES.some((suffix) => {
      return normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`);
    });
  }

  _assertAllowedAvatarUrl(value) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch (_) {
      const error = new Error('Invalid avatar URL');
      error.statusCode = 400;
      throw error;
    }

    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
      const error = new Error('Invalid avatar URL');
      error.statusCode = 400;
      throw error;
    }
    if (this._isDisallowedAvatarHost(parsed.hostname)) {
      const error = new Error('Avatar host is not allowed');
      error.statusCode = 403;
      throw error;
    }
    return parsed;
  }

  // Kept for callers that still use the former Arena-specific helper.
  _assertAllowedArenaAvatarUrl(value) {
    return this._assertAllowedAvatarUrl(value);
  }

  async _fetchAllowedAvatar(rawUrl) {
    let currentUrl = this._assertAllowedAvatarUrl(rawUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AVATAR_PROXY_TIMEOUT_MS);

    try {
      for (let redirectCount = 0; redirectCount <= AVATAR_PROXY_MAX_REDIRECTS; redirectCount += 1) {
        // Validate every hop. Native fetch follows redirects by default, which
        // would otherwise bypass the hostname/IP policy after the first URL.
        currentUrl = this._assertAllowedArenaAvatarUrl(currentUrl.toString());
        const upstream = await fetch(currentUrl.toString(), {
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': 'LTTH-GameEngine/1.3 AvatarProxy' }
        });

        if (upstream.status >= 300 && upstream.status < 400) {
          const location = upstream.headers.get('location');
          if (!location) {
            const error = new Error('Avatar redirect is missing a location');
            error.statusCode = 502;
            throw error;
          }
          currentUrl = new URL(location, currentUrl);
          continue;
        }

        return upstream;
      }

      const error = new Error('Avatar redirect limit exceeded');
      error.statusCode = 502;
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async _fetchAllowedArenaAvatar(rawUrl) {
    return this._fetchAllowedAvatar(rawUrl);
  }

  _getAvatarProxyPath(rawUrl) {
    const value = String(rawUrl || '').trim();
    if (!value) return '';
    try {
      this._assertAllowedAvatarUrl(value);
      return `/api/game-engine/avatar?url=${encodeURIComponent(value)}`;
    } catch (_) {
      return '';
    }
  }

  async _serveAllowedAvatar(req, res, label = 'Avatar') {
    try {
      const rawUrl = String(req.query?.url || '').trim();
      const upstream = await this._fetchAllowedAvatar(rawUrl);
      if (!upstream.ok) {
        return res.status(upstream.status).json({ error: 'Avatar image unavailable' });
      }
      const contentType = upstream.headers.get('content-type') || 'image/webp';
      if (!contentType.toLowerCase().startsWith('image/')) {
        return res.status(415).json({ error: 'Avatar URL is not an image' });
      }
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (bytes.length > AVATAR_PROXY_MAX_BYTES) {
        return res.status(413).json({ error: 'Avatar image too large' });
      }
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=1800');
      return res.send(bytes);
    } catch (error) {
      this.logger.warn(`${label} avatar proxy failed: ${error.message}`);
      return res.status(error.statusCode || 400).json({ error: 'Invalid avatar request' });
    }
  }

  _isDrawReason(reason) {
    return [
      'draw',
      'stalemate',
      'repetition',
      'insufficient_material',
      'fifty_move_rule',
      'draw_agreement'
    ].includes(reason);
  }

  _getChessSideForPlayer(game, username, fallbackSide) {
    if (!game || !username) {
      return fallbackSide;
    }

    const candidates = [game.player1, game.player2, game.whitePlayer, game.blackPlayer]
      .filter(Boolean);
    const player = candidates.find(candidate => candidate.username === username);
    return player?.side || fallbackSide;
  }

  _getSessionPlayerOutcomes(session, winner, reason) {
    const isDraw = this._isDrawReason(reason);

    if (session.game_type === 'chess') {
      const game = this.activeSessions.get(session.id);
      const player1Side = this._getChessSideForPlayer(game, session.player1_username, 'white');
      const player2Side = this._getChessSideForPlayer(game, session.player2_username, 'black');

      return {
        player1IsWinner: !isDraw && winner === player1Side,
        player2IsWinner: !isDraw && winner === player2Side,
        isDraw,
        player1Side,
        player2Side
      };
    }

    return {
      player1IsWinner: !isDraw && winner === 1,
      player2IsWinner: !isDraw && winner === 2,
      isDraw,
      player1Side: null,
      player2Side: null
    };
  }

  _mergeConfigDefaults(base, override) {
    const output = Array.isArray(base)
      ? base.map(item => this._cloneConfigDefault(item))
      : Object.fromEntries(Object.entries(base || {}).map(([key, value]) => [key, this._cloneConfigDefault(value)]));
    for (const [key, value] of Object.entries(override || {})) {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        base &&
        base[key] &&
        typeof base[key] === 'object' &&
        !Array.isArray(base[key])
      ) {
        output[key] = this._mergeConfigDefaults(base[key], value);
      } else {
        output[key] = value;
      }
    }
    return output;
  }

  _cloneConfigDefault(value) {
    if (Array.isArray(value)) {
      return value.map(item => this._cloneConfigDefault(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, this._cloneConfigDefault(nested)]));
    }
    return value;
  }

  _getConfigWithDefaults(gameType, config) {
    const defaults = this.defaultConfigs[gameType];
    if (!defaults) return config || {};
    const merged = this._mergeConfigDefaults(defaults, config || {});
    if (gameType === 'connect4') {
      return this._normalizeConnect4Config(merged);
    }
    if (gameType === 'chess') {
      return this._normalizeChessConfig(merged);
    }
    if (gameType === 'arena') {
      return this._normalizeArenaConfigDefaults(merged, config || {});
    }
    return merged;
  }

  _isValidChessTimeControl(value) {
    try {
      ChessGame.parseTimeControl(value);
      return true;
    } catch (error) {
      return false;
    }
  }

  _normalizeChessConfig(config) {
    const defaults = this.defaultConfigs.chess;
    const normalized = { ...config };
    normalized.defaultTimeControl = this._isValidChessTimeControl(normalized.defaultTimeControl)
      ? normalized.defaultTimeControl.trim()
      : defaults.defaultTimeControl;
    normalized.timeControls = Array.isArray(normalized.timeControls) &&
      normalized.timeControls.length > 0 &&
      normalized.timeControls.every(timeControl => this._isValidChessTimeControl(timeControl))
      ? [...new Set(normalized.timeControls.map(timeControl => timeControl.trim()))]
      : [...defaults.timeControls];
    normalized.streamerRole = ['white', 'black', 'random'].includes(normalized.streamerRole)
      ? normalized.streamerRole
      : defaults.streamerRole;
    return normalized;
  }

  _isValidChessConfig(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
    const has = key => Object.prototype.hasOwnProperty.call(config, key);
    if (has('defaultTimeControl') && !this._isValidChessTimeControl(config.defaultTimeControl)) return false;
    if (has('timeControls') && (
      !Array.isArray(config.timeControls) ||
      config.timeControls.length === 0 ||
      config.timeControls.some(timeControl => !this._isValidChessTimeControl(timeControl))
    )) return false;
    if (has('streamerRole') && !['white', 'black', 'random'].includes(config.streamerRole)) return false;
    return true;
  }

  _normalizeConnect4Config(config) {
    const defaults = this.defaultConfigs.connect4;
    const normalized = { ...config };
    const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    const validInteger = (value, minimum, maximum) => Number.isInteger(value) && value >= minimum && value <= maximum;
    const validLeaderboardTypes = ['daily', 'season', 'lifetime', 'elo'];
    const command = this.normalizeChatCommandName(normalized.chatCommand, defaults.chatCommand);

    normalized.streamerRole = ['player1', 'player2'].includes(normalized.streamerRole)
      ? normalized.streamerRole
      : defaults.streamerRole;
    normalized.animationSpeed = validInteger(normalized.animationSpeed, 100, 2000)
      ? normalized.animationSpeed
      : defaults.animationSpeed;
    normalized.chatCommand = /^[a-z0-9_-]+$/i.test(command) ? command : defaults.chatCommand;
    for (const key of ['boardColor', 'player1Color', 'player2Color', 'textColor']) {
      normalized[key] = validColor(normalized[key]) ? normalized[key].toUpperCase() : defaults[key];
    }
    normalized.soundVolume = typeof normalized.soundVolume === 'number' && Number.isFinite(normalized.soundVolume) &&
      normalized.soundVolume >= 0 && normalized.soundVolume <= 1
      ? normalized.soundVolume
      : defaults.soundVolume;
    normalized.soundEnabled = typeof normalized.soundEnabled === 'boolean'
      ? normalized.soundEnabled
      : defaults.soundEnabled;
    normalized.leaderboardTypes = Array.isArray(normalized.leaderboardTypes) &&
      normalized.leaderboardTypes.every(type => validLeaderboardTypes.includes(type))
      ? [...new Set(normalized.leaderboardTypes)]
      : [...defaults.leaderboardTypes];
    normalized.leaderboardDisplayTime = validInteger(normalized.leaderboardDisplayTime, 1, 10)
      ? normalized.leaderboardDisplayTime
      : defaults.leaderboardDisplayTime;
    normalized.roundTimerEnabled = typeof normalized.roundTimerEnabled === 'boolean'
      ? normalized.roundTimerEnabled
      : defaults.roundTimerEnabled;
    normalized.roundTimeLimit = validInteger(normalized.roundTimeLimit, 5, 120)
      ? normalized.roundTimeLimit
      : defaults.roundTimeLimit;
    normalized.roundWarningTime = validInteger(normalized.roundWarningTime, 3, 30) &&
      normalized.roundWarningTime <= normalized.roundTimeLimit
      ? normalized.roundWarningTime
      : defaults.roundWarningTime;
    normalized.timeoutLockoutMinutes = validInteger(normalized.timeoutLockoutMinutes, 0, 10080)
      ? normalized.timeoutLockoutMinutes
      : defaults.timeoutLockoutMinutes;
    if (normalized.roundWarningTime > normalized.roundTimeLimit) {
      normalized.roundWarningTime = Math.min(defaults.roundWarningTime, normalized.roundTimeLimit);
    }
    return normalized;
  }

  _isValidConnect4Config(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
    const validColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
    const validInteger = (value, minimum, maximum) => Number.isInteger(value) && value >= minimum && value <= maximum;
    const allowedTypes = ['daily', 'season', 'lifetime', 'elo'];
    const has = key => Object.prototype.hasOwnProperty.call(config, key);
    if (has('streamerRole') && !['player1', 'player2'].includes(config.streamerRole)) return false;
    if (has('animationSpeed') && !validInteger(config.animationSpeed, 100, 2000)) return false;
    if (has('chatCommand')) {
      const command = this.normalizeChatCommandName(config.chatCommand);
      if (!command || !/^[a-z0-9_-]+$/i.test(command)) return false;
    }
    if (['boardColor', 'player1Color', 'player2Color', 'textColor'].some(key => has(key) && !validColor(config[key]))) return false;
    if (has('soundEnabled') && typeof config.soundEnabled !== 'boolean') return false;
    if (has('soundVolume') && (typeof config.soundVolume !== 'number' || !Number.isFinite(config.soundVolume) || config.soundVolume < 0 || config.soundVolume > 1)) return false;
    if (has('leaderboardTypes') && (!Array.isArray(config.leaderboardTypes) ||
      config.leaderboardTypes.some(type => !allowedTypes.includes(type)) ||
      new Set(config.leaderboardTypes).size !== config.leaderboardTypes.length)) return false;
    if (has('leaderboardDisplayTime') && !validInteger(config.leaderboardDisplayTime, 1, 10)) return false;
    if (has('roundTimerEnabled') && typeof config.roundTimerEnabled !== 'boolean') return false;
    if (has('roundTimeLimit') && !validInteger(config.roundTimeLimit, 5, 120)) return false;
    if (has('roundWarningTime') && !validInteger(config.roundWarningTime, 3, 30)) return false;
    if (has('timeoutLockoutMinutes') && !validInteger(config.timeoutLockoutMinutes, 0, 10080)) return false;
    const timeLimit = has('roundTimeLimit') ? config.roundTimeLimit : this.defaultConfigs.connect4.roundTimeLimit;
    const warningTime = has('roundWarningTime') ? config.roundWarningTime : this.defaultConfigs.connect4.roundWarningTime;
    return warningTime <= timeLimit;
  }

  _normalizeArenaConfigDefaults(config, stored) {
    if (Number(stored?.tickRateMs) === 100 || Number(stored?.tickRateMs) === 50) {
      config.tickRateMs = this.defaultConfigs.arena.tickRateMs;
    }
    if ([120, 50, 33].includes(Number(stored?.stateEmitIntervalMs))) {
      config.stateEmitIntervalMs = this.defaultConfigs.arena.stateEmitIntervalMs;
    }
    if ([30, 60].includes(Number(stored?.targetFps))) {
      config.targetFps = this.defaultConfigs.arena.targetFps;
    }
    if (Number(stored?.renderScale) === 0.75) {
      config.renderScale = this.defaultConfigs.arena.renderScale;
    }
    if (Number(stored?.maxRenderPlayers) === 60) {
      config.maxRenderPlayers = this.defaultConfigs.arena.maxRenderPlayers;
    }
    if (Number(stored?.inactivityGraceMs) === 15000) {
      config.inactivityGraceMs = this.defaultConfigs.arena.inactivityGraceMs;
    }
    if (Number(stored?.inactivityShrinkPerSecond) === 5) {
      config.inactivityShrinkPerSecond = this.defaultConfigs.arena.inactivityShrinkPerSecond;
    }
    const legacyMassCaps = [90, 140, 170, 260, 520];
    const noisyAmbientProfile = Number(stored?.foodSpawnBatchSize) > 3;
    if (legacyMassCaps.includes(Number(stored?.maxMass))) {
      config.maxMass = this.defaultConfigs.arena.maxMass;
    }
    if ([2500, 6000, 9000].includes(Number(stored?.maxLives))) {
      config.maxLives = this.defaultConfigs.arena.maxLives;
    }
    if ([0.7, 0.42, 0.82, 0.9].includes(Number(stored?.playerAbsorbMassRatio))) {
      config.playerAbsorbMassRatio = this.defaultConfigs.arena.playerAbsorbMassRatio;
    }
    if ([0.7, 0.55, 0.84, 0.9].includes(Number(stored?.playerAbsorbLifeStealRatio))) {
      config.playerAbsorbLifeStealRatio = this.defaultConfigs.arena.playerAbsorbLifeStealRatio;
    }
    if ([12, 8, 16].includes(Number(stored?.deathFoodDropCount))) {
      config.deathFoodDropCount = this.defaultConfigs.arena.deathFoodDropCount;
    }
    if ([1.15, 0.9, 1.25].includes(Number(stored?.deathFoodDropValue))) {
      config.deathFoodDropValue = this.defaultConfigs.arena.deathFoodDropValue;
    }
    if (Number(stored?.maxFood) === 90 || Number(stored?.maxFood) === 50) {
      config.maxFood = this.defaultConfigs.arena.maxFood;
    }
    if (Number(stored?.maxFood) === 130) {
      config.maxFood = this.defaultConfigs.arena.maxFood;
    }
    if ([90, 52, 25].includes(Number(stored?.maxFoodRender))) {
      config.maxFoodRender = this.defaultConfigs.arena.maxFoodRender;
    }
    if (Number(stored?.maxFoodRender) === 72) {
      config.maxFoodRender = this.defaultConfigs.arena.maxFoodRender;
    }
    if (Number(stored?.foodValue) === 2.25) {
      config.foodValue = this.defaultConfigs.arena.foodValue;
    }
    if (noisyAmbientProfile) {
      config.foodSpawnIntervalMs = this.defaultConfigs.arena.foodSpawnIntervalMs;
      config.maxFood = this.defaultConfigs.arena.maxFood;
      config.maxFoodRender = this.defaultConfigs.arena.maxFoodRender;
      config.foodDespawnMs = this.defaultConfigs.arena.foodDespawnMs;
      config.foodSpawnBatchSize = this.defaultConfigs.arena.foodSpawnBatchSize;
    }
    if (!Number.isFinite(Number(config.foodSpawnIntervalMs)) || Number(config.foodSpawnIntervalMs) < 0) {
      config.foodSpawnIntervalMs = this.defaultConfigs.arena.foodSpawnIntervalMs;
    }
    if (!Number.isFinite(Number(config.foodSpawnBatchSize)) || Number(config.foodSpawnBatchSize) < 1) {
      config.foodSpawnBatchSize = this.defaultConfigs.arena.foodSpawnBatchSize;
    }
    if (!Number.isFinite(Number(config.foodDespawnMs)) || Number(config.foodDespawnMs) < 0) {
      config.foodDespawnMs = this.defaultConfigs.arena.foodDespawnMs;
    }
    if (!Number.isFinite(Number(config.foodBurstDespawnMs)) || Number(config.foodBurstDespawnMs) < 0) {
      config.foodBurstDespawnMs = this.defaultConfigs.arena.foodBurstDespawnMs;
    }
    if (!Number.isFinite(Number(config.lifeDropDespawnMs)) || Number(config.lifeDropDespawnMs) < 0) {
      config.lifeDropDespawnMs = this.defaultConfigs.arena.lifeDropDespawnMs;
    }
    if (!Number.isFinite(Number(config.lifeDropFadeMs)) || Number(config.lifeDropFadeMs) < 0) {
      config.lifeDropFadeMs = this.defaultConfigs.arena.lifeDropFadeMs;
    }
    if (!Number.isFinite(Number(config.lifeDropSpread)) || Number(config.lifeDropSpread) < 0) {
      config.lifeDropSpread = this.defaultConfigs.arena.lifeDropSpread;
    }
    if (!Number.isFinite(Number(config.lifeDropMotionScale)) || Number(config.lifeDropMotionScale) < 0) {
      config.lifeDropMotionScale = this.defaultConfigs.arena.lifeDropMotionScale;
    }
    if (stored?.fieldFrameDesign === 'neon-grid') {
      config.fieldFrameDesign = this.defaultConfigs.arena.fieldFrameDesign;
    }
    this._normalizeArenaLargeBallTransparencyDefaults(config, stored);
    if ([10, 20, 100].includes(Number(stored?.giftTiers?.medium?.minValue)) && config.giftTiers?.medium) {
      config.giftTiers.medium.minValue = this.defaultConfigs.arena.giftTiers.medium.minValue;
    }
    if ([50, 100, 1000].includes(Number(stored?.giftTiers?.large?.minValue)) && config.giftTiers?.large) {
      config.giftTiers.large.minValue = this.defaultConfigs.arena.giftTiers.large.minValue;
    }
    if (Number(stored?.maxWeaponPickups) === 8) {
      config.maxWeaponPickups = this.defaultConfigs.arena.maxWeaponPickups;
    }
    if (Number(stored?.weaponPickupSpawnIntervalMs) === 4500) {
      config.weaponPickupSpawnIntervalMs = this.defaultConfigs.arena.weaponPickupSpawnIntervalMs;
    }
    if (Number(stored?.weaponPickupChance) === 0.45) {
      config.weaponPickupChance = this.defaultConfigs.arena.weaponPickupChance;
    }
    if (Number(stored?.weaponPickupDurationMs) === 18000) {
      config.weaponPickupDurationMs = this.defaultConfigs.arena.weaponPickupDurationMs;
    }
    if (config.giftTiers?.medium) {
      const storedMediumWeaponTypes = stored?.giftTiers?.medium?.weaponTypes;
      if (!Array.isArray(storedMediumWeaponTypes)) {
        config.giftTiers.medium.weaponTypes = [...this.defaultConfigs.arena.giftTiers.medium.weaponTypes];
      } else if (storedMediumWeaponTypes.join('|') === 'laser|pulse|magnet|vampire|freeze|dash') {
        config.giftTiers.medium.weaponTypes = [...this.defaultConfigs.arena.giftTiers.medium.weaponTypes];
      }
    }
    // giftWeaponMappings: stored values must win over defaults to allow deletion
    if (stored && stored.giftWeaponMappings && typeof stored.giftWeaponMappings === 'object') {
      config.giftWeaponMappings = { ...stored.giftWeaponMappings };
    }
    config.personalityProfiles = this._normalizeArenaPersonalityProfiles(config.personalityProfiles);
    config.weaponPickupTypes = this._normalizeArenaWeaponPickupTypes(
      config.weaponPickupTypes,
      !Array.isArray(stored?.weaponPickupTypes)
    );

    const movement = stored && stored.movement && typeof stored.movement === 'object'
      ? stored.movement
      : null;
    if (movement && this.defaultConfigs.arena?.movement) {
      const hasSmartMovementKeys = [
        'fleeMassRatio',
        'huntMassRatio',
        'huntLeadSeconds',
        'boundaryAvoidanceDistance'
      ].some(key => Object.prototype.hasOwnProperty.call(movement, key));

      const isLegacyDefaultMovement =
        !hasSmartMovementKeys &&
        Number(movement.fleeDistance) === 180 &&
        Number(movement.huntDistance) === 260 &&
        Number(movement.foodSenseDistance) === 420 &&
        Number(movement.steeringStrength) === 0.15 &&
        Number(movement.randomTurn) === 0.18;

      if (isLegacyDefaultMovement) {
        config.movement = {
          ...config.movement,
          fleeDistance: this.defaultConfigs.arena.movement.fleeDistance,
          huntDistance: this.defaultConfigs.arena.movement.huntDistance,
          foodSenseDistance: this.defaultConfigs.arena.movement.foodSenseDistance,
          steeringStrength: this.defaultConfigs.arena.movement.steeringStrength,
          randomTurn: this.defaultConfigs.arena.movement.randomTurn
        };
      }

      if (this._isPreviousSmartArenaMovementDefault(movement)) {
        config.movement = {
          ...config.movement,
          ...this.defaultConfigs.arena.movement
        };
      }

      if (this._isPreviousArenaAiStabilityDefault(movement)) {
        config.movement = {
          ...config.movement,
          behaviorMemoryMs: this.defaultConfigs.arena.movement.behaviorMemoryMs,
          targetSwitchScoreMargin: this.defaultConfigs.arena.movement.targetSwitchScoreMargin
        };
      }

      if (this._isTwitchyArenaMovementDefault(movement)) {
        config.movement = {
          ...config.movement,
          randomTurn: this.defaultConfigs.arena.movement.randomTurn,
          behaviorMemoryMs: this.defaultConfigs.arena.movement.behaviorMemoryMs,
          targetSwitchScoreMargin: this.defaultConfigs.arena.movement.targetSwitchScoreMargin,
          wanderFocusMinMs: this.defaultConfigs.arena.movement.wanderFocusMinMs,
          wanderFocusMaxMs: this.defaultConfigs.arena.movement.wanderFocusMaxMs
        };
      }

      if ([0.48, 0.62, 0.72].includes(Number(movement.largeMassSpeedPenalty))) {
        config.movement = {
          ...config.movement,
          largeMassSpeedPenalty: this.defaultConfigs.arena.movement.largeMassSpeedPenalty
        };
      }
      if (Number(movement.minMassSpeedMultiplier) === 0.55) {
        config.movement = {
          ...config.movement,
          minMassSpeedMultiplier: this.defaultConfigs.arena.movement.minMassSpeedMultiplier
        };
      }
    }

    if (config.giftTiers?.large) {
      const weaponTypes = Array.isArray(config.giftTiers.large.weaponTypes)
        ? config.giftTiers.large.weaponTypes
        : [];
      const storedLargeWeaponTypes = stored?.giftTiers?.large?.weaponTypes;
      if (!Array.isArray(storedLargeWeaponTypes) && !weaponTypes.includes('chainsaw')) {
        config.giftTiers.large.weaponTypes = [...weaponTypes, 'chainsaw'];
      } else if (Array.isArray(storedLargeWeaponTypes) && storedLargeWeaponTypes.join('|') === 'blackhole|missile|chainsaw|vampire|mine|magnet') {
        config.giftTiers.large.weaponTypes = [...this.defaultConfigs.arena.giftTiers.large.weaponTypes];
      }
    }

    return config;
  }

  _normalizeArenaLargeBallTransparencyDefaults(config, stored = {}) {
    const modes = ['off', 'flat', 'scale'];
    const storedHasMode = Object.prototype.hasOwnProperty.call(stored || {}, 'largeBallTransparencyMode');
    let mode = String(config.largeBallTransparencyMode || '').trim();

    if (!modes.includes(mode)) {
      mode = this.defaultConfigs.arena.largeBallTransparencyMode;
    }
    if (!storedHasMode && stored.largeBallTransparencyEnabled === false) {
      mode = 'off';
    }

    config.largeBallTransparencyMode = mode;
    config.largeBallTransparencyEnabled = mode !== 'off';
    if (!Number.isFinite(Number(config.largeBallTransparencyStartMass)) || Number(config.largeBallTransparencyStartMass) < 0) {
      config.largeBallTransparencyStartMass = this.defaultConfigs.arena.largeBallTransparencyStartMass;
    }
    if (!Number.isFinite(Number(config.largeBallMinOpacity)) || Number(config.largeBallMinOpacity) <= 0) {
      config.largeBallMinOpacity = this.defaultConfigs.arena.largeBallMinOpacity;
    }
  }

  _clamp(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.min(max, Math.max(min, number));
  }

  _normalizeArenaPersonalityProfiles(profiles) {
    const defaults = this.defaultConfigs.arena?.personalityProfiles || [];
    const source = Array.isArray(profiles) && profiles.length ? profiles : defaults;
    return source.map(profile => {
      const aggression = this._clamp(Number(profile.aggression) || 1, 0.5, 1.7);
      const fear = this._clamp(Number(profile.fear) || 1, 0.5, 1.7);
      const weaponFocus = this._clamp(Number(profile.weaponFocus) || 1, 0.45, 1.7);
      const randomness = this._clamp(Number(profile.randomness) || 0.55, 0.15, 1.35);
      const derivedRiskTolerance = 1 +
        (aggression - 1) * 0.58 +
        (randomness - 0.55) * 0.28 -
        (fear - 1) * 0.46 +
        (weaponFocus - 1) * 0.08;

      return {
        ...profile,
        aggression,
        fear,
        intelligence: this._clamp(Number(profile.intelligence) || 1, 0.45, 1.65),
        weaponFocus,
        foodFocus: this._clamp(Number(profile.foodFocus) || 1, 0.45, 1.7),
        randomness,
        commitment: this._clamp(Number(profile.commitment) || 1, 0.45, 1.7),
        riskTolerance: this._clamp(Number(profile.riskTolerance) || derivedRiskTolerance, 0.35, 1.75)
      };
    });
  }

  _normalizeArenaWeaponPickupTypes(weaponPickupTypes, mergeMissingDefaults = false) {
    const normalized = mergeMissingDefaults
      ? this._mergeArenaWeaponPickupDefaults(weaponPickupTypes)
      : Array.isArray(weaponPickupTypes)
        ? [...weaponPickupTypes]
        : [];
    const defaultChainsaw = (this.defaultConfigs.arena?.weaponPickupTypes || [])
      .find(definition => definition.type === 'chainsaw');
    if (!defaultChainsaw) return normalized;

    return normalized.map(definition => {
      if (!definition || definition.type !== 'chainsaw') return definition;
      return {
        ...definition,
        power: Number.isFinite(Number(definition.power)) ? Number(definition.power) : defaultChainsaw.power,
        durationMs: Math.max(
          Number(definition.durationMs) || 0,
          Number(defaultChainsaw.durationMs) || 0
        ),
        weight: Math.max(
          Number(definition.weight) || 0,
          Number(defaultChainsaw.weight) || 0
        )
      };
    });
  }

  _mergeArenaWeaponPickupDefaults(weaponPickupTypes) {
    const existing = Array.isArray(weaponPickupTypes) ? [...weaponPickupTypes] : [];
    const existingTypes = new Set(existing.map(item => item && item.type).filter(Boolean));
    for (const defaultDefinition of this.defaultConfigs.arena?.weaponPickupTypes || []) {
      if (!existingTypes.has(defaultDefinition.type)) {
        existing.push({ ...defaultDefinition });
      }
    }
    return existing;
  }

  _isPreviousSmartArenaMovementDefault(movement) {
    return Number(movement.fleeDistance) === 260 &&
      Number(movement.huntDistance) === 380 &&
      Number(movement.foodSenseDistance) === 460 &&
      Number(movement.steeringStrength) === 0.24 &&
      Number(movement.randomTurn) === 0.08 &&
      Number(movement.fleeMassRatio) === 1.08 &&
      Number(movement.huntMassRatio) === 1.1;
  }

  _isPreviousArenaAiStabilityDefault(movement) {
    return Number(movement.behaviorMemoryMs) === 700 &&
      Number(movement.targetSwitchScoreMargin) === 1.2;
  }

  _isTwitchyArenaMovementDefault(movement) {
    return Number(movement.randomTurn) === 0.04 &&
      Number(movement.behaviorMemoryMs) === 1600 &&
      Number(movement.targetSwitchScoreMargin) === 2.4 &&
      Number(movement.wanderFocusMinMs) === 1400 &&
      Number(movement.wanderFocusMaxMs) === 2800;
  }

  async init() {
    this.logger.info('🎮 Initializing LTTH Game Engine Plugin...');

    try {
      // Initialize database
      this._ensureDatabaseInitialized();

      if (!this.unifiedQueue) {
        this.unifiedQueue = new UnifiedQueueManager(this.logger, this.io);
      }

      // Reset transient queue state on init while preserving constructor-time availability
      this.unifiedQueue.clearQueue();
      this.unifiedQueue.setGameEnginePlugin(this);

      // Initialize Plinko game
      this.plinkoGame = new PlinkoGame(this.api, this.db, this.logger);
      this.plinkoGame.init();
      this.plinkoGame.startCleanupTimer();
      this.plinkoGame.setUnifiedQueue(this.unifiedQueue);
      this.unifiedQueue.setPlinkoGame(this.plinkoGame);

      // Initialize Wheel (Glücksrad) game
      this.wheelGame = new WheelGame(this.api, this.db, this.logger);
      this.wheelGame.init();
      this.wheelGame.startCleanupTimer();
      this.wheelGame.setUnifiedQueue(this.unifiedQueue);
      this.unifiedQueue.setWheelGame(this.wheelGame);

      // Initialize Slot Machine game
      this.slotGame = new SlotGame(this.api, this.db, this.logger);
      this.slotGame.init();
      this.slotGame.startCleanupTimer();
      this.slotGame.setUnifiedQueue(this.unifiedQueue);
      this.unifiedQueue.setSlotGame(this.slotGame);

      // Initialize Live Arena game
      this.arenaGame = new ArenaGame(this.api, this.db, this.logger);
      this.arenaGame.init();
      this.arenaGame.startTickTimer();
      
      // Set game engine reference for Connect4 and Chess
      this.unifiedQueue.setGameEnginePlugin(this);
      
      // Load and apply overlay settings to unified queue
      try {
        const overlaySettings = this.db.getOverlaySettings();
        Object.entries(overlaySettings).forEach(([gameType, useUnified]) => {
          this.unifiedQueue.setGameMode(gameType, useUnified);
        });
        this.logger.info('✅ Overlay settings loaded and applied to unified queue');
      } catch (error) {
        this.logger.warn(`Failed to load overlay settings: ${error.message}`);
      }

      const interactiveRecovery = this._initializeInteractiveController();
      this.logger.info(`Interactive games restored: ${interactiveRecovery.recovered}, host queue: ${interactiveRecovery.queueLength}`);
      
      // Register routes
      this.registerRoutes();

      // Register socket events
      this.registerSocketEvents();
      
      // Start gift deduplication cleanup (runs every 5 seconds for better memory efficiency)
      this.giftDedupCleanupInterval = setInterval(() => {
        const now = Date.now();
        const oldSize = this.recentGiftEvents.size;
        
        // Remove entries older than dedup window
        for (const [key, timestamp] of this.recentGiftEvents.entries()) {
          if (now - timestamp > this.GIFT_DEDUP_WINDOW_MS) {
            this.recentGiftEvents.delete(key);
          }
        }
        
        if (this.recentGiftEvents.size < oldSize) {
          this.logger.debug(`[GIFT DEDUP] Cleaned ${oldSize - this.recentGiftEvents.size} old gift events (${this.recentGiftEvents.size} remaining)`);
        }
      }, 5000); // Run every 5 seconds
      if (typeof this.giftDedupCleanupInterval.unref === 'function') {
        this.giftDedupCleanupInterval.unref();
      }

      // Register GCCE commands FIRST (before TikTok events)
      // This ensures we know if GCCE is available before deciding whether to register fallback chat handler
      this.setupGCCEIntegrationListeners();
      this.registerGCCECommands();
      
      // Set up retry mechanism for GCCE command registration
      // This handles the case where Game Engine loads before GCCE
      if (!this.gcceCommandsRegistered) {
        this.logger.info('[GAME ENGINE] GCCE not available yet, starting retry mechanism');
        this.gcceRetryCount = 0;
        this.gcceRetryInterval = setInterval(() => {
          this.gcceRetryCount++;
          if (this.gcceRetryCount > 5) {
            this.logger.error('❌ [GAME ENGINE] Failed to register GCCE commands after 5 retries');
            clearInterval(this.gcceRetryInterval);
            this.gcceRetryInterval = null;
            return;
          }
          this.logger.debug(`💬 [GAME ENGINE] Retrying GCCE command registration (attempt ${this.gcceRetryCount}/5)`);
          this.registerGCCECommands();
          
          // If registration succeeds during retry, we need to re-register TikTok events
          // to switch from fallback chat handler to GCCE-based handling
          if (this.gcceCommandsRegistered) {
            this.logger.info('✅ [GAME ENGINE] GCCE commands registered on retry #' + this.gcceRetryCount);
            clearInterval(this.gcceRetryInterval);
            this.gcceRetryInterval = null;
            // Note: The fallback chat handler (if already registered) checks the 
            // gcceCommandsRegistered flag at runtime in handleChatCommand (line 2723)
            // to avoid processing commands when GCCE becomes available after initial registration.
          }
        }, 2000); // Retry every 2 seconds
        if (typeof this.gcceRetryInterval.unref === 'function') {
          this.gcceRetryInterval.unref();
        }
      }

      // Register TikTok events (conditional chat handler based on GCCE status)
      this.registerTikTokEvents();

      this.logger.info('✅ LTTH Game Engine initialized successfully');
      this.logger.info('   - Connect4 game available');
      this.logger.info('   - Chess (Blitzschach) game available');
      this.logger.info('   - Plinko game available');
      this.logger.info('   - Glücksrad (Wheel) game available');
      this.logger.info('   - Slot Machine game available');
      this.logger.info('   - Live Arena game available');
      this.logger.info('   - Overlays: /overlay/game-engine/connect4, /overlay/game-engine/chess, /overlay/game-engine/plinko, /overlay/game-engine/wheel, /overlay/game-engine/slot, /overlay/game-engine/arena');
      this.logger.info('   - Admin UI: /game-engine/ui');
    } catch (error) {
      this.logger.error(`Failed to initialize Game Engine: ${error.message}`);
      throw error;
    }
  }

  async destroy() {
    for (const timeout of this.connect4MatchmakingTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.connect4MatchmakingTimeouts.clear();
    this._clearConnect4MatchmakingFallbackDrain();
    this.recentConnect4MatchmakingEvents.clear();

    // Clear GCCE retry interval if still running
    if (this.gcceRetryInterval) {
      clearInterval(this.gcceRetryInterval);
      this.gcceRetryInterval = null;
    }

    this.removeGCCEIntegrationListeners();
    
    // Clear gift deduplication cleanup interval and map
    if (this.giftDedupCleanupInterval) {
      clearInterval(this.giftDedupCleanupInterval);
      this.giftDedupCleanupInterval = null;
    }
    this.recentGiftEvents.clear();
    
    // Unregister GCCE commands
    this.unregisterGCCECommands();

    // Destroy Plinko game
    if (this.plinkoGame) {
      this.plinkoGame.destroy();
      this.plinkoGame = null;
    }

    // Destroy Wheel (Glücksrad) game
    if (this.wheelGame) {
      this.wheelGame.destroy();
      this.wheelGame = null;
    }

    // Destroy Slot Machine game
    if (this.slotGame) {
      this.slotGame.destroy();
      this.slotGame = null;
    }

    // Destroy Live Arena game
    if (this.arenaGame) {
      this.arenaGame.destroy();
      this.arenaGame = null;
    }

    const interactiveSessionIds = new Set(
      this.interactiveController?.registry?.list?.().map(session => session.sessionId) || []
    );
    if (this.interactiveController) {
      this.interactiveController.destroy();
      this.interactiveController = null;
    }

    // Destroy unified queue
    if (this.unifiedQueue) {
      this.unifiedQueue.destroy();
      this.unifiedQueue = null;
    }

    // Cancel all pending challenges
    for (const [sessionId, challenge] of this.pendingChallenges.entries()) {
      if (challenge.timeout) {
        try {
          clearTimeout(challenge.timeout);
        } catch (error) {
          this.logger.warn(`Failed to clear challenge timeout for session ${sessionId}: ${error.message}`);
        }
      }
    }
    this.pendingChallenges.clear();

    // End all active games and cleanup timers
    for (const [sessionId, game] of this.activeSessions.entries()) {
      // Clear chess timer interval if exists (Bug #1 fix)
      if (game && game.timerInterval) {
        try {
          clearInterval(game.timerInterval);
          game.timerInterval = null;
        } catch (error) {
          this.logger.warn(`Failed to clear timer interval for session ${sessionId}: ${error.message}`);
        }
      }
      if (interactiveSessionIds.has(sessionId)) {
        this.activeSessions.delete(sessionId);
        continue;
      }
      this.endGame(sessionId, null, 'plugin_shutdown');
    }
    
    this.logger.info('Game Engine plugin destroyed');
  }

  /**
   * Unregister GCCE commands
   */
  unregisterGCCECommands() {
    try {
      const gccePlugin = this.api.pluginLoader?.loadedPlugins?.get('gcce');
      if (gccePlugin?.instance) {
        gccePlugin.instance.unregisterCommandsForPlugin('game-engine');
        this.logger.debug('💬 [GAME ENGINE] Unregistered GCCE commands');
      }
    } catch (error) {
      this.logger.error(`❌ [GAME ENGINE] Error unregistering GCCE commands: ${error.message}`);
    }
  }

  /**
   * Listen for GCCE lifecycle events so command registration works even when
   * GCCE is enabled or reloaded after the game engine has finished loading.
   */
  setupGCCEIntegrationListeners() {
    if (this.gcceEventListenersRegistered || typeof this.api.on !== 'function') {
      return;
    }

    const registerWhenGCCEIsAvailable = (eventName, payload) => {
      const pluginId = typeof payload === 'string' ? payload : payload?.id;
      if (eventName !== 'gcce:ready' && pluginId !== 'gcce') {
        return;
      }

      this.logger.debug(`💬 [GAME ENGINE] GCCE lifecycle event received (${eventName}), registering commands`);
      this.registerGCCECommands();
    };

    const markGCCEUnavailable = (payload) => {
      const pluginId = typeof payload === 'string' ? payload : payload?.id;
      if (pluginId !== 'gcce') {
        return;
      }

      this.gcceCommandsRegistered = false;
      this.logger.debug('💬 [GAME ENGINE] GCCE became unavailable, fallback chat handling remains active');
    };

    const listeners = [
      ['gcce:ready', (payload) => registerWhenGCCEIsAvailable('gcce:ready', payload)],
      ['plugin:loaded', (payload) => registerWhenGCCEIsAvailable('plugin:loaded', payload)],
      ['plugin:enabled', (payload) => registerWhenGCCEIsAvailable('plugin:enabled', payload)],
      ['plugin:reloaded', (payload) => registerWhenGCCEIsAvailable('plugin:reloaded', payload)],
      ['plugin:unloaded', markGCCEUnavailable],
      ['plugin:disabled', markGCCEUnavailable]
    ];

    listeners.forEach(([event, callback]) => {
      if (this.api.on(event, callback)) {
        this.gccePluginEventHandlers.push({ event, callback });
      }
    });

    this.gcceEventListenersRegistered = true;
  }

  /**
   * Remove GCCE lifecycle listeners registered through the plugin event bus.
   */
  removeGCCEIntegrationListeners() {
    if (!this.gcceEventListenersRegistered) {
      return;
    }

    this.gccePluginEventHandlers.forEach(({ event, callback }) => {
      if (typeof this.api.removeListener === 'function') {
        this.api.removeListener(event, callback);
      }
    });

    this.gccePluginEventHandlers = [];
    this.gcceEventListenersRegistered = false;
  }

  /**
   * Create a pending challenge
   */
  createPendingChallenge(gameType, challengerUsername, challengerNickname, giftName, giftImageUrl, config, triggerType = 'gift') {
    this._ensureDatabaseInitialized();

    // Create database session
    const sessionId = this.db.createSession(
      gameType,
      challengerUsername,
      'viewer',
      triggerType,
      giftName
    );

    // Calculate expiration time
    const timeoutSeconds = config.challengeTimeout || 30;
    const expiresAt = new Date(Date.now() + timeoutSeconds * 1000);

    // Update session with challenge info
    this.db.updateSession(sessionId, {
      challenger_username: challengerUsername,
      challenger_nickname: challengerNickname,
      gift_image_url: giftImageUrl,
      challenge_expires_at: expiresAt.toISOString()
    });

    // Set timeout to auto-accept against streamer (Bug #6 fix - cleanup added)
    const timeoutHandle = setTimeout(() => {
      this.logger.info(`Challenge #${sessionId} timed out, starting game against streamer`);
      
      // Bug #6 fix: Update session status in database before accepting
      try {
        this.db.updateSession(sessionId, {
          status: 'timeout',
          timeout_at: new Date().toISOString()
        });
      } catch (error) {
        this.logger.error(`Failed to update session ${sessionId} on timeout: ${error.message}`);
      }
      
      // Emit timeout event for frontend notification
      this.io.emit('game-engine:challenge-timeout', {
        sessionId,
        gameType,
        challengerUsername
      });
      
      this.acceptChallengeAsStreamer(sessionId);
    }, timeoutSeconds * 1000);
    if (typeof timeoutHandle.unref === 'function') {
      timeoutHandle.unref();
    }

    // Store pending challenge
    this.pendingChallenges.set(sessionId, {
      sessionId,
      gameType,
      challengerUsername,
      challengerNickname,
      giftName,
      giftImageUrl,
      expiresAt,
      timeout: timeoutHandle
    });

    // Get challenge media (if configured)
    const challengeMedia = this.db.getGameMedia(gameType, 'new_challenger');
    
    // Use default sound if no custom media configured
    const media = challengeMedia || {
      file_path: '/game-engine/sounds/default/new-challenger-alert.mp3',
      file_type: 'audio/mp3',
      media_type: 'audio',
      is_default: true
    };

    // Emit challenge event
    this.io.emit('game-engine:challenge-created', {
      sessionId,
      gameType,
      challengerUsername,
      challengerNickname,
      giftName,
      giftImageUrl,
      expiresAt: expiresAt.toISOString(),
      timeoutSeconds,
      media: media
    });

    this.logger.info(`Challenge created #${sessionId}: ${challengerUsername} with ${giftName}`);

    return sessionId;
  }

  /**
   * Accept a challenge (by another viewer or streamer)
   */
  acceptChallenge(sessionId, opponentUsername = 'streamer') {
    const challenge = this.pendingChallenges.get(sessionId);
    
    if (!challenge) {
      this.logger.warn(`Challenge ${sessionId} not found or already accepted`);
      return;
    }

    // Clear timeout
    if (challenge.timeout) {
      clearTimeout(challenge.timeout);
    }

    // Remove from pending
    this.pendingChallenges.delete(sessionId);

    // Start the game with streamer as opponent
    this.startGameFromChallenge(sessionId, challenge, opponentUsername || 'streamer');
  }

  /**
   * Accept challenge automatically as streamer (on timeout)
   */
  acceptChallengeAsStreamer(sessionId) {
    const challenge = this.pendingChallenges.get(sessionId);
    
    if (!challenge) {
      return;
    }

    if (challenge.timeout) {
      clearTimeout(challenge.timeout);
    }

    // Remove from pending
    this.pendingChallenges.delete(sessionId);

    // Start the game with streamer as opponent
    this.startGameFromChallenge(sessionId, challenge, 'streamer');
  }

  /**
   * Reject a challenge
   */
  rejectChallenge(sessionId) {
    const challenge = this.pendingChallenges.get(sessionId);
    
    if (!challenge) {
      this.logger.warn(`Challenge ${sessionId} not found`);
      return;
    }

    // Clear timeout
    if (challenge.timeout) {
      clearTimeout(challenge.timeout);
    }

    // Remove from pending
    this.pendingChallenges.delete(sessionId);

    // Update database
    this.db.updateSession(sessionId, {
      status: 'rejected',
      ended_at: new Date().toISOString()
    });

    // Emit rejection event
    this.io.emit('game-engine:challenge-rejected', {
      sessionId
    });

    this.logger.info(`Challenge #${sessionId} rejected`);
  }

  /**
   * Start game from an accepted challenge
   */
  startGameFromChallenge(sessionId, challenge, opponentUsername) {
    if (!challenge || !challenge.gameType) {
      this.logger.warn(`Invalid challenge payload for session ${sessionId}`);
      return;
    }
    const opponent = opponentUsername || 'streamer';
    const challengerUsername = challenge.challengerUsername;
    const challengerNickname = challenge.challengerNickname || challengerUsername;
    const config = this._getConfigWithDefaults(
      challenge.gameType,
      this.db.getGameConfig(challenge.gameType)
    );

    if (!challengerUsername) {
      this.logger.warn(`Challenge ${sessionId} missing challengerUsername`);
      return;
    }
    if (opponent !== 'streamer' && opponent === challengerUsername) {
      this.logger.warn(`Challenge ${sessionId} rejected: opponent matches challenger (${opponent})`);
      return;
    }

    if (!config) {
      this.logger.warn(`Missing config for challenge game type ${challenge.gameType}`);
      return;
    }

    if (challenge.gameType === 'chess') {
      return this.startChessGameFromChallenge(sessionId, challenge, opponent, config);
    }
    
    // Determine roles
    const streamerRole = config.streamerRole || 'player2';

    // Keep stored session players aligned with the in-memory player numbers.
    const opponentIsStreamer = opponent === 'streamer';
    if (streamerRole === 'player1') {
      if (opponentIsStreamer) {
        this.db.updateSession(sessionId, {
          player1_username: 'streamer',
          player1_role: 'streamer'
        });
        this.db.addPlayer2(sessionId, challengerUsername, 'viewer');
      } else {
        this.db.addPlayer2(sessionId, opponent, 'viewer');
      }
    } else {
      this.db.addPlayer2(
        sessionId,
        opponent,
        opponent === 'streamer' ? 'streamer' : 'viewer'
      );
    }

    // Create game instance
    const player1 = streamerRole === 'player1' ? {
      username: opponentIsStreamer ? 'streamer' : challengerUsername,
      role: opponentIsStreamer ? 'streamer' : 'viewer',
      color: config.player1Color,
      nickname: opponentIsStreamer ? 'Streamer' : challengerNickname
    } : {
      username: challengerUsername,
      role: 'viewer',
      color: config.player1Color,
      nickname: challengerNickname
    };

    const player2 = streamerRole === 'player2' ? {
      username: opponentIsStreamer ? 'streamer' : opponent,
      role: opponentIsStreamer ? 'streamer' : 'viewer',
      color: config.player2Color,
      nickname: opponentIsStreamer ? 'Streamer' : opponent
    } : {
      username: opponentIsStreamer ? challengerUsername : opponent,
      role: 'viewer',
      color: config.player2Color,
      nickname: opponentIsStreamer ? challengerNickname : opponent
    };

    const game = new Connect4Game(sessionId, player1, player2, this.logger);
    this.activeSessions.set(sessionId, game);

    // Get challenge accepted media
    const acceptedMedia = this.db.getGameMedia(challenge.gameType, 'challenge_accepted');
    
    // Use default sound if no custom media configured
    const media = acceptedMedia || {
      file_path: '/game-engine/sounds/default/challenge accepted.mp3',
      file_type: 'audio/mp3',
      media_type: 'audio',
      is_default: true
    };

    // Check if should use unified overlay
    const useUnified = this.unifiedQueue ? this.unifiedQueue.shouldUseUnifiedOverlay(challenge.gameType) : false;
    
    // Emit game-switched event for unified overlay
    if (useUnified && this.unifiedQueue) {
      this.unifiedQueue.switchGame(challenge.gameType, sessionId, config);
    }

    // Emit game started event (backwards compatibility)
    this.io.emit('game-engine:game-started', {
      sessionId,
      gameType: challenge.gameType,
      state: game.getState(),
      config,
      media: media,
      useUnified
    });

    this.logger.info(`Started ${challenge.gameType} game #${sessionId}: ${player1.username} vs ${player2.username}`);
  }

  /**
   * Start a chess game from an accepted challenge
   */
  startChessGameFromChallenge(sessionId, challenge, opponentUsername, config) {
    const challengerUsername = challenge.challengerUsername;
    const challengerNickname = challenge.challengerNickname || challengerUsername;
    const opponent = opponentUsername || challengerUsername;
    const opponentIsStreamer = opponent === 'streamer';

    // Determine sides (white/black)
    const streamerRole = config.streamerRole || 'random';
    let streamerSide, viewerSide;
    
    if (streamerRole === 'random') {
      streamerSide = Math.random() < 0.5 ? 'white' : 'black';
      viewerSide = streamerSide === 'white' ? 'black' : 'white';
    } else if (streamerRole === 'white' || streamerRole === 'black') {
      streamerSide = streamerRole;
      viewerSide = streamerRole === 'white' ? 'black' : 'white';
    } else {
      // Default to random if config contains unexpected value
      streamerSide = Math.random() < 0.5 ? 'white' : 'black';
      viewerSide = streamerSide === 'white' ? 'black' : 'white';
    }

    // Keep stored session players aligned with the in-memory player colors.
    if (opponentIsStreamer) {
      if (streamerSide === 'white') {
        this.db.updateSession(sessionId, {
          player1_username: 'streamer',
          player1_role: 'streamer'
        });
        this.db.addPlayer2(sessionId, challengerUsername, 'viewer');
      } else {
        this.db.addPlayer2(sessionId, opponent, 'streamer');
      }
    } else {
      this.db.addPlayer2(sessionId, opponent, 'viewer');
    }

    const viewerChallengerSide = opponentIsStreamer
      ? viewerSide
      : (streamerRole === 'white'
        ? 'black'
        : streamerRole === 'black'
          ? 'white'
          : viewerSide);
    const viewerOpponentSide = viewerChallengerSide === 'white' ? 'black' : 'white';

    const whitePlayer = viewerChallengerSide === 'white'
      ? {
          username: challengerUsername,
          role: 'viewer',
          color: config.whiteColor,
          nickname: challengerNickname,
          side: 'white'
        }
      : {
          username: opponent,
          role: opponentIsStreamer ? 'streamer' : 'viewer',
          color: config.whiteColor,
          nickname: opponentIsStreamer ? 'Streamer' : opponent,
          side: 'white'
        };

    const blackPlayer = viewerOpponentSide === 'black'
      ? {
          username: opponent,
          role: opponentIsStreamer ? 'streamer' : 'viewer',
          color: config.blackColor,
          nickname: opponentIsStreamer ? 'Streamer' : opponent,
          side: 'black'
        }
      : {
          username: challengerUsername,
          role: 'viewer',
          color: config.blackColor,
          nickname: challengerNickname,
          side: 'black'
        };

    const gameTimeControl = config.defaultTimeControl || '5+0';
    return this._startChessMatch(sessionId, whitePlayer, blackPlayer, config, gameTimeControl, viewerSide);
  }

  /**
   * Register API routes
   */
  registerRoutes() {
    // Serve overlay HTML
    this.api.registerRoute('GET', '/overlay/game-engine/connect4', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlay', 'connect4.html'));
    });

    // Serve chess overlay HTML
    this.api.registerRoute('GET', '/overlay/game-engine/chess', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlay', 'chess.html'));
    });

    // Serve Plinko overlay HTML
    this.api.registerRoute('GET', '/overlay/game-engine/plinko', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlay', 'plinko.html'));
    });

    // Serve Wheel (Glücksrad) overlay HTML
    this.api.registerRoute('GET', '/overlay/game-engine/wheel', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlay', 'wheel.html'));
    });

    // Serve Unified overlay HTML (all games in one)
    this.api.registerRoute('GET', '/overlay/game-engine/unified', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlay', 'unified.html'));
    });

    // Serve HUD overlay HTML
    this.api.registerRoute('GET', '/overlay/game-engine/hud', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlay', 'game-hud.html'));
    });

    // Serve Live Arena overlay HTML
    this.api.registerRoute('GET', '/overlay/game-engine/arena', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlay', 'arena.html'));
    });

    // Serve UI HTML
    this.api.registerRoute('GET', '/game-engine/ui', (req, res) => {
      res.sendFile(path.join(__dirname, 'ui.html'));
    });

    // Serve default sound files
    this.api.registerRoute('GET', '/game-engine/sounds/default/:filename', (req, res) => {
      const { filename } = req.params;
      const soundDir = path.join(__dirname, 'assets', 'sounds', 'default');
      const soundPath = this._isSafeAudioFilename(filename)
        ? this._safeJoin(soundDir, filename)
        : null;
      
      // Check if file exists
      if (soundPath && fs.existsSync(soundPath)) {
        res.sendFile(soundPath);
      } else {
        res.status(404).json({ error: 'Sound file not found' });
      }
    });

    // Serve wheel sound files
    this.api.registerRoute('GET', '/game-engine/sounds/wheel/:filename', (req, res) => {
      const { filename } = req.params;
      const soundDir = path.join(__dirname, 'assets', 'sounds', 'wheel');
      const soundPath = this._isSafeAudioFilename(filename)
        ? this._safeJoin(soundDir, filename)
        : null;
      
      // Check if file exists
      if (soundPath && fs.existsSync(soundPath)) {
        res.sendFile(soundPath);
      } else {
        res.status(404).json({ error: 'Sound file not found' });
      }
    });

    // Serve slot machine sound files (fallback: 204 so browser console stays clean for missing optional sounds)
    this.api.registerRoute('GET', '/game-engine/sounds/slot/:filename', (req, res) => {
      const { filename } = req.params;
      // Strict allowlist: only alphanumeric, hyphens, underscores, and dots before .mp3
      // Spaces are intentionally excluded; slot sound filenames use hyphens instead.
      if (!/^[\w\-.]+\.mp3$/i.test(filename)) {
        return res.status(400).json({ error: 'Invalid filename' });
      }
      const soundPath = path.join(__dirname, 'assets', 'sounds', 'slot', filename);
      if (fs.existsSync(soundPath)) {
        res.sendFile(soundPath);
      } else {
        // Return 204 (no content) instead of 404 for optional missing sounds
        res.status(204).end();
      }
    });

    // API: Get game configuration
    this.api.registerRoute('GET', '/api/game-engine/config/:gameType', (req, res) => {
      try {
        const { gameType } = req.params;
        const config = gameType === 'interactive'
          ? this._getInteractiveSettings()
          : this._getConfigWithDefaults(gameType, this.db.getGameConfig(gameType));
        
        res.json(config || {});
      } catch (error) {
        this.logger.error(`Error getting game config: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Save game configuration
    this.api.registerRoute('POST', '/api/game-engine/config/:gameType', (req, res) => {
      try {
        const { gameType } = req.params;
        if (gameType === 'connect4' && !this._isValidConnect4Config(req.body || {})) {
          return res.status(400).json({ error: 'invalid_connect4_config' });
        }
        if (gameType === 'chess' && !this._isValidChessConfig(req.body || {})) {
          return res.status(400).json({ error: 'invalid_chess_config' });
        }
        const config = this._getConfigWithDefaults(gameType, req.body || {});
        
        this.db.saveGameConfig(gameType, config);
        if (gameType === 'connect4') {
          this.interactiveController?.refreshConnect4TimerConfiguration?.(config);
        }
        
        // Emit config update to overlays
        this.io.emit('game-engine:config-updated', { gameType, config });
        
        res.json(gameType === 'interactive'
          ? { success: true, config: this._getInteractiveSettings() }
          : { success: true });
      } catch (error) {
        this.logger.error(`Error saving game config: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.api.registerRoute('GET', '/api/game-engine/connect4/lockouts', (req, res) => {
      try {
        const lockouts = this.db.listActiveGamePlayerLockouts();
        res.json({ success: true, lockouts });
      } catch (error) {
        this.logger.error(`Error listing Connect4 timeout lockouts: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.api.registerRoute('DELETE', '/api/game-engine/connect4/lockouts/:username', (req, res) => {
      try {
        const removed = this.db.clearGamePlayerLockout(req.params.username);
        const lockouts = this.db.listActiveGamePlayerLockouts();
        res.json({ success: true, removed, lockouts });
      } catch (error) {
        this.logger.error(`Error clearing Connect4 timeout lockout: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get Live Arena state
    this.api.registerRoute('GET', '/api/game-engine/arena/state', (req, res) => {
      try {
        if (!this.arenaGame) {
          return res.status(503).json({ error: 'Arena game is not initialized' });
        }
        res.json(this.arenaGame.getState('api'));
      } catch (error) {
        this.logger.error(`Error getting Arena state: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Proxy approved profile pictures as same-origin images for game overlays.
    this.api.registerRoute('GET', '/api/game-engine/avatar', async (req, res) => {
      await this._serveAllowedAvatar(req, res, 'Game Engine');
    });

    // Legacy Arena URL remains compatible with existing Canvas/Pixi renderers.
    this.api.registerRoute('GET', '/api/game-engine/arena/avatar', async (req, res) => {
      await this._serveAllowedAvatar(req, res, 'Arena');
    });

    // API: Trigger Live Arena test activity
    this.api.registerRoute('POST', '/api/game-engine/arena/test-activity', (req, res) => {
      try {
        if (!this.arenaGame) {
          return res.status(503).json({ error: 'Arena game is not initialized' });
        }
        const body = req.body || {};
        const username = body.uniqueId || body.username || 'TestViewer';
        const nickname = body.nickname || username;
        const activityType = body.activityType || 'chat';
        const profilePictureUrl = body.profilePictureUrl || '';
        const result = this.arenaGame.handleActivity({
          uniqueId: String(username),
          nickname: String(nickname),
          profilePictureUrl: String(profilePictureUrl),
          likeCount: body.likeCount,
          count: body.count
        }, String(activityType));
        res.json(result);
      } catch (error) {
        this.logger.error(`Error triggering Arena test activity: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Trigger Live Arena test gift weapon
    this.api.registerRoute('POST', '/api/game-engine/arena/test-gift', (req, res) => {
      try {
        if (!this.arenaGame) {
          return res.status(503).json({ error: 'Arena game is not initialized' });
        }
        const body = req.body || {};
        const username = body.uniqueId || body.username || 'TestViewer';
        const nickname = body.nickname || username;
        const giftName = body.giftName || 'Test Gift';
        const giftId = body.giftId || 'test-gift';
        const diamondCount = body.diamondCount || body.giftValue || 1;
        const repeatCount = body.repeatCount || 1;
        const profilePictureUrl = body.profilePictureUrl || '';
        const result = this.arenaGame.handleGift({
          uniqueId: String(username),
          nickname: String(nickname),
          profilePictureUrl: String(profilePictureUrl),
          giftName: String(giftName),
          giftId: String(giftId),
          diamondCount: Number(diamondCount) || 1,
          repeatCount: Number(repeatCount) || 1,
          repeatEnd: true
        });
        res.json(result);
      } catch (error) {
        this.logger.error(`Error triggering Arena test gift: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Reset Live Arena state
    this.api.registerRoute('POST', '/api/game-engine/arena/reset', (req, res) => {
      try {
        if (!this.arenaGame) {
          return res.status(503).json({ error: 'Arena game is not initialized' });
        }
        res.json(this.arenaGame.reset());
      } catch (error) {
        this.logger.error(`Error resetting Arena: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get triggers
    this.api.registerRoute('GET', '/api/game-engine/triggers/:gameType?', (req, res) => {
      try {
        const { gameType } = req.params;
        const triggers = this.db.getTriggers(gameType);
        res.json(triggers);
      } catch (error) {
        this.logger.error(`Error getting triggers: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Add trigger
    this.api.registerRoute('POST', '/api/game-engine/triggers', (req, res) => {
      try {
        const { gameType, triggerType, triggerValue } = req.body;
        this.db.addTrigger(gameType, triggerType, triggerValue);
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error adding trigger: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Remove trigger
    this.api.registerRoute('DELETE', '/api/game-engine/triggers/:triggerId', (req, res) => {
      try {
        const { triggerId } = req.params;
        this.db.removeTrigger(triggerId);
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error removing trigger: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get XP rewards
    this.api.registerRoute('GET', '/api/game-engine/xp-rewards/:gameType', (req, res) => {
      try {
        const { gameType } = req.params;
        const rewards = this.db.getXPRewards(gameType);
        res.json(rewards);
      } catch (error) {
        this.logger.error(`Error getting XP rewards: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Save XP rewards
    this.api.registerRoute('POST', '/api/game-engine/xp-rewards/:gameType', (req, res) => {
      try {
        const { gameType } = req.params;
        const { winXP, lossXP, drawXP, participationXP } = req.body;
        
        this.db.saveXPRewards(gameType, winXP, lossXP, drawXP, participationXP);
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error saving XP rewards: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.api.registerRoute('GET', '/api/game-engine/interactive/state', (req, res) => {
      if (!this.interactiveController) {
        return res.status(503).json({ error: 'Interactive controller is not initialized' });
      }
      return res.json(this.interactiveController.getState());
    });

    // Compatibility endpoint: return the authoritative board selected for display.
    this.api.registerRoute('GET', '/api/game-engine/active-session', (req, res) => {
      try {
        if (this.interactiveController) {
          const display = this.interactiveController.getState().display;
          return res.json(display.displaySessionId == null ? null : {
            sessionId: display.displaySessionId,
            gameType: display.gameType,
            state: display.state
          });
        }
        return res.json(null);
      } catch (error) {
        this.logger.error(`Error getting active session: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get game queue status
    this.api.registerRoute('GET', '/api/game-engine/queue', (req, res) => {
      try {
        res.json(this.unifiedQueue ? this.unifiedQueue.getStatus() : {
          isProcessing: false,
          queueLength: 0,
          currentItem: null,
          queue: []
        });
      } catch (error) {
        this.logger.error(`Error getting queue: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get game statistics
    this.api.registerRoute('GET', '/api/game-engine/stats/:gameType?', (req, res) => {
      try {
        const { gameType } = req.params;
        const stats = this.db.getGameStats(gameType);
        res.json(stats);
      } catch (error) {
        this.logger.error(`Error getting game stats: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get player statistics
    this.api.registerRoute('GET', '/api/game-engine/player-stats/:username', (req, res) => {
      try {
        const { username } = req.params;
        const stats = this.db.getPlayerStats(username);
        res.json(stats);
      } catch (error) {
        this.logger.error(`Error getting player stats: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get detailed player statistics with streaks
    this.api.registerRoute('GET', '/api/game-engine/player-stats-detailed/:username/:gameType?', (req, res) => {
      try {
        const { username, gameType } = req.params;
        const stats = this.db.getDetailedPlayerStats(username, gameType);
        res.json(stats);
      } catch (error) {
        this.logger.error(`Error getting detailed player stats: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get streak leaderboard
    this.api.registerRoute('GET', '/api/game-engine/streak-leaderboard/:gameType?', (req, res) => {
      try {
        const { gameType } = req.params;
        const limit = parseInt(req.query.limit) || 10;
        const leaderboard = this.db.getStreakLeaderboard(gameType, limit);
        res.json(leaderboard);
      } catch (error) {
        this.logger.error(`Error getting streak leaderboard: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get daily leaderboard
    this.api.registerRoute('GET', '/api/game-engine/daily-leaderboard/:gameType?', (req, res) => {
      try {
        const { gameType } = req.params;
        const limit = parseInt(req.query.limit) || 10;
        const leaderboard = this.db.getDailyLeaderboard(gameType, limit);
        res.json(leaderboard);
      } catch (error) {
        this.logger.error(`Error getting daily leaderboard: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get season leaderboard
    this.api.registerRoute('GET', '/api/game-engine/season-leaderboard/:gameType?', (req, res) => {
      try {
        const { gameType } = req.params;
        const limit = parseInt(req.query.limit) || 10;
        const leaderboard = this.db.getSeasonLeaderboard(gameType, limit);
        res.json(leaderboard);
      } catch (error) {
        this.logger.error(`Error getting season leaderboard: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get lifetime leaderboard
    this.api.registerRoute('GET', '/api/game-engine/lifetime-leaderboard/:gameType?', (req, res) => {
      try {
        const { gameType } = req.params;
        const limit = parseInt(req.query.limit) || 10;
        const leaderboard = this.db.getLifetimeLeaderboard(gameType, limit);
        res.json(leaderboard);
      } catch (error) {
        this.logger.error(`Error getting lifetime leaderboard: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get ELO leaderboard
    this.api.registerRoute('GET', '/api/game-engine/elo-leaderboard/:gameType?', (req, res) => {
      try {
        const { gameType } = req.params;
        const limit = parseInt(req.query.limit) || 10;
        const leaderboard = this.db.getELOLeaderboard(gameType, limit);
        res.json(leaderboard);
      } catch (error) {
        this.logger.error(`Error getting ELO leaderboard: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    const gameMediaDataDir = typeof this.api.getPluginDataDir === 'function'
      ? this.api.getPluginDataDir()
      : path.join(__dirname, 'data');
    const connect4MediaDir = path.join(gameMediaDataDir, 'game-media', 'connect4');
    fs.mkdirSync(connect4MediaDir, { recursive: true });

    const validateConnect4MediaRequest = (req, res, next) => {
      if (req.params.gameType !== 'connect4') {
        return res.status(400).json({ success: false, error: 'invalid_connect4_media_game' });
      }
      if (!CONNECT4_MEDIA_EVENTS.has(req.params.mediaEvent)) {
        return res.status(400).json({ success: false, error: 'invalid_connect4_media_event' });
      }
      next();
    };

    const connect4MediaStorage = multer.diskStorage({
      destination: (req, file, callback) => callback(null, connect4MediaDir),
      filename: (req, file, callback) => {
        const uploadInfo = this._resolveConnect4AudioUpload(file);
        if (!uploadInfo) {
          const error = new Error('Unsupported Connect4 audio type');
          error.code = 'INVALID_CONNECT4_MEDIA_TYPE';
          callback(error);
          return;
        }
        callback(null, `${req.params.mediaEvent}${uploadInfo.extension}`);
      }
    });
    const connect4MediaUpload = multer({
      storage: connect4MediaStorage,
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, callback) => {
        if (this._resolveConnect4AudioUpload(file)) {
          callback(null, true);
          return;
        }
        const error = new Error('Unsupported Connect4 audio type');
        error.code = 'INVALID_CONNECT4_MEDIA_TYPE';
        callback(error);
      }
    });
    const receiveConnect4MediaUpload = (req, res, next) => {
      connect4MediaUpload.fields([
        { name: 'file', maxCount: 1 },
        { name: 'audio', maxCount: 1 }
      ])(req, res, error => {
        if (!error) {
          next();
          return;
        }
        const errorCode = error.code === 'LIMIT_FILE_SIZE'
          ? 'connect4_media_too_large'
          : 'invalid_connect4_media_type';
        res.status(400).json({ success: false, error: errorCode });
      });
    };

    // API: Get browser-safe game media metadata
    this.api.registerRoute('GET', '/api/game-engine/media/:gameType', (req, res) => {
      try {
        const { gameType } = req.params;
        if (gameType !== 'connect4') {
          return res.status(400).json({ success: false, error: 'invalid_connect4_media_game' });
        }
        if (typeof res.set === 'function') res.set('Cache-Control', 'no-store');
        const mediaByEvent = new Map(this.db.getGameMedia(gameType)
          .map(row => this._serializeConnect4Media(row, connect4MediaDir))
          .filter(Boolean)
          .map(media => [media.media_event, media]));
        const media = CONNECT4_AUDIO_EVENTS.map(mediaEvent => ({
          game_type: 'connect4',
          media_type: 'audio',
          media_event: mediaEvent,
          isCustom: mediaByEvent.has(mediaEvent),
          ...(mediaByEvent.get(mediaEvent) || {}),
          enabled: this.db.isGameAudioEnabled('connect4', 'default', mediaEvent)
        }));
        res.json(media);
      } catch (error) {
        this.logger.error(`Error getting game media: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Serve an enabled custom audio file without exposing its local path
    this.api.registerRoute('GET', '/game-engine/media/:gameType/:mediaEvent', (req, res) => {
      try {
        const { gameType, mediaEvent } = req.params;
        if (gameType !== 'connect4' || !CONNECT4_MEDIA_EVENTS.has(mediaEvent)) {
          return res.status(404).json({ error: 'connect4_media_not_found' });
        }
        const media = this.db.getGameMedia(gameType, mediaEvent);
        if (!media || !this._isPathInside(connect4MediaDir, media.file_path) || !fs.existsSync(media.file_path)) {
          return res.status(404).json({ error: 'connect4_media_not_found' });
        }
        if (typeof res.set === 'function') res.set('Cache-Control', 'no-store');
        if (typeof res.type === 'function' && media.file_type) res.type(media.file_type);
        res.sendFile(path.resolve(media.file_path));
      } catch (error) {
        this.logger.error(`Error serving game media: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Upload game media
    this.api.registerRoute(
      'POST',
      '/api/game-engine/media/:gameType/:mediaEvent',
      validateConnect4MediaRequest,
      receiveConnect4MediaUpload,
      (req, res) => {
        try {
          const uploadedFile = this._getUploadedConnect4AudioFile(req);
          if (!uploadedFile) {
            return res.status(400).json({ success: false, error: 'connect4_media_file_required' });
          }
          const uploadInfo = this._resolveConnect4AudioUpload(uploadedFile);
          if (!uploadInfo) {
            return res.status(400).json({ success: false, error: 'invalid_connect4_media_type' });
          }
          const { gameType, mediaEvent } = req.params;
          const previousMedia = this.db.getGameMedia(gameType, mediaEvent);
          const uploadedPath = path.resolve(uploadedFile.path);

          if (!this._isPathInside(connect4MediaDir, uploadedPath)) {
            return res.status(400).json({ success: false, error: 'invalid_connect4_media_path' });
          }

          this.db.saveGameMedia(gameType, mediaEvent, uploadedPath, uploadInfo.fileType);
          if (
            previousMedia &&
            previousMedia.file_path !== uploadedPath &&
            this._isPathInside(connect4MediaDir, previousMedia.file_path) &&
            fs.existsSync(previousMedia.file_path)
          ) {
            fs.unlinkSync(previousMedia.file_path);
          }

          this.io.emit('game-engine:media-updated', { gameType, mediaEvent });
          this.logger.info(`Connect4 audio uploaded: ${mediaEvent}`);
          res.json({
            success: true,
            filename: path.basename(uploadedPath),
            url: `/game-engine/media/connect4/${encodeURIComponent(mediaEvent)}`
          });
        } catch (error) {
          this.logger.error(`Error saving game media: ${error.message}`);
          res.status(500).json({ error: error.message });
        }
      }
    );

    // API: Delete game media
    this.api.registerRoute('DELETE', '/api/game-engine/media/:gameType/:mediaEvent', (req, res) => {
      try {
        const { gameType, mediaEvent } = req.params;
        if (gameType !== 'connect4' || !CONNECT4_MEDIA_EVENTS.has(mediaEvent)) {
          return res.status(400).json({ success: false, error: 'invalid_connect4_media_event' });
        }
        const media = this.db.getGameMedia(gameType, mediaEvent);
        if (media && this._isPathInside(connect4MediaDir, media.file_path) && fs.existsSync(media.file_path)) {
          fs.unlinkSync(media.file_path);
        }
        this.db.removeGameMedia(gameType, mediaEvent);
        this.io.emit('game-engine:media-updated', { gameType, mediaEvent });
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error removing game media: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    this.api.registerRoute('PUT', '/api/game-engine/audio-state/:gameType/:audioEvent', (req, res) => {
      try {
        const { gameType, audioEvent } = req.params;
        const body = req.body || {};
        const audioEvents = this._getGameAudioEvents(gameType);
        if (!audioEvents) {
          return res.status(400).json({ error: 'invalid_game_type' });
        }
        if (!audioEvents.includes(audioEvent)) {
          return res.status(400).json({ error: 'invalid_audio_event' });
        }
        if (typeof body.enabled !== 'boolean') {
          return res.status(400).json({ error: 'invalid_audio_enabled' });
        }

        const scopeId = this._getGameAudioScopeId(gameType, body.scopeId);
        if (!scopeId) {
          return res.status(400).json({ error: 'invalid_audio_scope' });
        }
        const enabled = body.enabled;
        if (!this.db.setGameAudioEnabled(gameType, scopeId, audioEvent, enabled)) {
          return res.status(500).json({ error: 'audio_state_not_saved' });
        }

        if (gameType === 'connect4') {
          this.io.emit('game-engine:media-updated', { gameType, mediaEvent: audioEvent });
        } else if (gameType === 'wheel') {
          this.io.emit('wheel:audio-updated', { wheelId: scopeId, audioType: audioEvent, enabled });
        } else {
          this.io.emit('slot:audio-updated', { machineId: scopeId, audioType: audioEvent, enabled });
        }
        this.io.emit('game-engine:audio-state-updated', { gameType, scopeId, audioEvent, enabled });
        res.json({ success: true, gameType, scopeId, audioEvent, enabled });
      } catch (error) {
        this.logger.error(`Error saving game audio state: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get round timer config
    this.api.registerRoute('GET', '/api/game-engine/round-timer/:gameType', (req, res) => {
      try {
        const { gameType } = req.params;
        const timer = this.db.getRoundTimer(gameType);
        res.json(timer);
      } catch (error) {
        this.logger.error(`Error getting round timer: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Save round timer config
    this.api.registerRoute('POST', '/api/game-engine/round-timer/:gameType', (req, res) => {
      try {
        const { gameType } = req.params;
        const { enabled, timeLimitSeconds, warningTimeSeconds } = req.body;
        
        this.db.saveRoundTimer(gameType, enabled, timeLimitSeconds, warningTimeSeconds);
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error saving round timer: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // ===== MANUAL MODE ROUTES =====

    // API: Start a manual test game (for offline testing)
    this.api.registerRoute('POST', '/api/game-engine/manual/start', (req, res) => {
      try {
        const { gameType, opponentType, player1Name, player2Name } = req.body;
        
        // Validate game type
        if (gameType !== 'connect4') {
          return res.status(400).json({ error: 'Unsupported game type', gameType });
        }

        // Check if there's already an active game
        if (this.activeSessions.size > 0) {
          return res.status(400).json({ 
            error: 'Game already active',
            message: 'A game is already in progress. Please end it first.'
          });
        }

        // Check if there's a pending challenge
        if (this.pendingChallenges.size > 0) {
          return res.status(400).json({ 
            error: 'Challenge pending',
            message: 'A challenge is pending. Please cancel it first.'
          });
        }

        // Default names
        const p1Name = player1Name || 'Test Player 1';
        const p2Name = player2Name || (opponentType === 'bot' ? 'Bot' : 'Test Player 2');

        // Start manual test game
        const sessionId = this.startManualGame(gameType, p1Name, p2Name, opponentType);
        
        this.logger.info(`Manual test game started: ${p1Name} vs ${p2Name}`);
        
        res.json({ 
          success: true, 
          sessionId,
          gameType,
          message: `Manual game started: ${p1Name} vs ${p2Name}`
        });
      } catch (error) {
        this.logger.error(`Error starting manual game: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Make a manual move (for testing)
    this.api.registerRoute('POST', '/api/game-engine/manual/move', (req, res) => {
      try {
        const { sessionId, player, column } = req.body;
        
        if (!sessionId) {
          return res.status(400).json({ error: 'Session ID required' });
        }

        if (!column || !/^[A-G]$/i.test(column)) {
          return res.status(400).json({ error: 'Invalid column. Use A-G.' });
        }

        // Find the game session
        const game = this.activeSessions.get(sessionId);
        if (!game) {
          return res.status(404).json({ error: 'Game not found or already ended' });
        }

        // Make the move
        const result = this.makeManualMove(sessionId, player, column.toUpperCase());
        
        res.json(result);
      } catch (error) {
        this.logger.error(`Error making manual move: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: End manual game
    this.api.registerRoute('POST', '/api/game-engine/manual/end', (req, res) => {
      try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
          return res.status(400).json({ error: 'Session ID required' });
        }

        // End the game
        this.endGame(sessionId, null, 'manual_end');
        
        res.json({ success: true, message: 'Game ended' });
      } catch (error) {
        this.logger.error(`Error ending manual game: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // === PLINKO API ROUTES ===

    // API: Get all plinko boards
    this.api.registerRoute('GET', '/api/game-engine/plinko/boards', (req, res) => {
      try {
        const boards = this.plinkoGame.getAllBoards();
        res.json(boards);
      } catch (error) {
        this.logger.error(`Error getting plinko boards: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Create a new plinko board
    this.api.registerRoute('POST', '/api/game-engine/plinko/boards', (req, res) => {
      try {
        const { name, slots, physicsSettings } = req.body;
        const boardId = this.plinkoGame.createBoard(name || 'New Plinko', slots, physicsSettings);
        res.json({ success: true, boardId });
      } catch (error) {
        this.logger.error(`Error creating plinko board: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Delete a plinko board
    this.api.registerRoute('DELETE', '/api/game-engine/plinko/boards/:boardId', (req, res) => {
      try {
        const { boardId } = req.params;
        
        // Validate boardId
        const parsedBoardId = parseInt(boardId);
        if (isNaN(parsedBoardId) || parsedBoardId <= 0) {
          return res.status(400).json({ success: false, error: 'Invalid board ID' });
        }
        
        const result = this.plinkoGame.deleteBoard(parsedBoardId);
        if (!result) {
          return res.status(400).json({ success: false, error: 'Cannot delete the last plinko board' });
        }
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error deleting plinko board: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Update plinko board name
    this.api.registerRoute('PUT', '/api/game-engine/plinko/boards/:boardId/name', (req, res) => {
      try {
        const { boardId } = req.params;
        const { name } = req.body;
        
        // Validate boardId
        const parsedBoardId = parseInt(boardId);
        if (isNaN(parsedBoardId) || parsedBoardId <= 0) {
          return res.status(400).json({ success: false, error: 'Invalid board ID' });
        }
        
        // Validate name
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          return res.status(400).json({ success: false, error: 'Board name is required and must be non-empty' });
        }
        
        this.plinkoGame.updateBoardName(parsedBoardId, name);
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error updating plinko board name: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Update plinko board chat command
    this.api.registerRoute('PUT', '/api/game-engine/plinko/boards/:boardId/chat-command', (req, res) => {
      try {
        const { boardId } = req.params;
        const { chatCommand } = req.body;
        
        // Validate boardId
        const parsedBoardId = parseInt(boardId);
        if (isNaN(parsedBoardId) || parsedBoardId <= 0) {
          return res.status(400).json({ success: false, error: 'Invalid board ID' });
        }
        
        this.plinkoGame.updateBoardChatCommand(parsedBoardId, chatCommand || null);
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error updating plinko board chat command: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Update plinko board enabled status
    this.api.registerRoute('PUT', '/api/game-engine/plinko/boards/:boardId/enabled', (req, res) => {
      try {
        const { boardId } = req.params;
        const { enabled } = req.body;
        
        // Validate boardId
        const parsedBoardId = parseInt(boardId);
        if (isNaN(parsedBoardId) || parsedBoardId <= 0) {
          return res.status(400).json({ success: false, error: 'Invalid board ID' });
        }
        
        // Validate enabled is boolean
        if (typeof enabled !== 'boolean') {
          return res.status(400).json({ success: false, error: 'Enabled must be a boolean value' });
        }
        
        this.plinkoGame.updateBoardEnabled(parsedBoardId, enabled);
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error updating plinko board enabled status: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get Plinko configuration (supports boardId parameter for specific board)
    this.api.registerRoute('GET', '/api/game-engine/plinko/config', (req, res) => {
      try {
        const boardId = req.query.boardId ? parseInt(req.query.boardId) : null;
        const config = this.plinkoGame.getConfig(boardId);
        res.json(config);
      } catch (error) {
        this.logger.error(`Error getting Plinko config: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Update Plinko configuration (supports boardId in body)
    this.api.registerRoute('POST', '/api/game-engine/plinko/config', (req, res) => {
      try {
        const { boardId, slots, physicsSettings, giftMappings, displayTexts } = req.body;
        // Use boardId if provided, otherwise get first board's ID
        let actualBoardId = boardId;
        if (!actualBoardId) {
          const boards = this.plinkoGame.getAllBoards();
          if (boards && boards.length > 0) {
            actualBoardId = boards[0].id;
          } else {
            return res.status(400).json({ success: false, error: 'No plinko boards found' });
          }
        }

        // Merge displayTexts into physicsSettings for storage (backward-compat approach)
        const plinkoDisplayDefaults = {
          titleText: '🎰 PLINKO', labelDrop: '⬇️ Ball wird gedropt!', labelWin: '🎉 Gewonnen!',
          labelMultiplierPrefix: '×', labelQueued: '⏳ Warteschlange...'
        };
        const mergedDisplayTexts = Object.assign({ ...plinkoDisplayDefaults }, displayTexts || {});
        const mergedPhysicsSettings = { ...physicsSettings, displayTexts: mergedDisplayTexts };

        this.plinkoGame.updateConfig(actualBoardId, slots, mergedPhysicsSettings, giftMappings);
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error updating Plinko config: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Update Plinko gift mappings (supports boardId)
    this.api.registerRoute('POST', '/api/game-engine/plinko/gift-mappings', (req, res) => {
      try {
        const { giftMappings, boardId } = req.body;
        // Use boardId if provided
        let actualBoardId = boardId ? parseInt(boardId) : null;
        if (!actualBoardId) {
          const boards = this.plinkoGame.getAllBoards();
          if (boards && boards.length > 0) {
            actualBoardId = boards[0].id;
          } else {
            return res.status(400).json({ success: false, error: 'No plinko boards found' });
          }
        }
        this.db.updatePlinkoGiftMappings(actualBoardId, giftMappings);
        
        // Emit update event
        this.io.emit('plinko:gift-mappings-updated', {
          boardId: actualBoardId,
          giftMappings
        });
        
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error updating Plinko gift mappings: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get Plinko statistics
    this.api.registerRoute('GET', '/api/game-engine/plinko/stats', (req, res) => {
      try {
        const stats = this.plinkoGame.getStats();
        res.json(stats);
      } catch (error) {
        this.logger.error(`Error getting Plinko stats: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get user Plinko history
    this.api.registerRoute('GET', '/api/game-engine/plinko/history/:username', (req, res) => {
      try {
        const { username } = req.params;
        const limit = parseInt(req.query.limit) || 10;
        const history = this.plinkoGame.getUserHistory(username, limit);
        res.json(history);
      } catch (error) {
        this.logger.error(`Error getting Plinko history: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get Plinko leaderboard
    this.api.registerRoute('GET', '/api/game-engine/plinko/leaderboard', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 10;
        const leaderboard = this.plinkoGame.getLeaderboard(limit);
        res.json(leaderboard);
      } catch (error) {
        this.logger.error(`Error getting Plinko leaderboard: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Offline Plinko test drop (no XP required)
    this.api.registerRoute('POST', '/api/game-engine/plinko/test-drop', async (req, res) => {
      try {
        const { username, nickname, bet, count, color } = req.body || {};
        const result = await this.plinkoGame.spawnBalls(
          username || 'test-user',
          nickname || 'Test User',
          '',
          Math.max(1, parseInt(bet) || 100),
          Math.max(1, parseInt(count) || 1),
          { testMode: true, preferredColor: color || null }
        );
        res.json(result);
      } catch (error) {
        this.logger.error(`Error triggering Plinko test drop: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Spawn test ball (new enhanced test mode)
    this.api.registerRoute('POST', '/api/game-engine/plinko/test/spawn', async (req, res) => {
      try {
        const { betAmount, playerName, count, boardId } = req.body || {};

        // Validate bet amount
        const bet = parseInt(betAmount);
        if (!bet || bet <= 0 || bet > 10000) {
          return res.status(400).json({ 
            success: false, 
            error: 'Invalid bet amount (must be between 1 and 10000)' 
          });
        }

        // Validate count
        const ballCount = parseInt(count) || 1;
        if (ballCount < 1 || ballCount > 10) {
          return res.status(400).json({ 
            success: false, 
            error: 'Invalid count (must be between 1 and 10)' 
          });
        }

        const player = playerName || 'TestUser';
        const results = [];

        // Spawn multiple balls if requested
        for (let i = 0; i < ballCount; i++) {
          const result = await this.plinkoGame.spawnTestBall(
            ballCount > 1 ? `${player}${i + 1}` : player,
            bet,
            boardId || null
          );
          if (result.success) {
            results.push(result);
          }
        }

        if (results.length > 0) {
          res.json({
            success: true,
            ballIds: results.map(r => r.ballId),
            message: `Test ball${ballCount > 1 ? 's' : ''} spawned for ${player}`,
            testMode: true,
            count: results.length
          });
        } else {
          res.status(500).json({ success: false, error: 'Failed to spawn test balls' });
        }
      } catch (error) {
        this.logger.error(`Error spawning test ball: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // API: Get test statistics
    this.api.registerRoute('GET', '/api/game-engine/plinko/test/stats', (req, res) => {
      try {
        const stats = this.db.getPlinkoTestStats();
        res.json(stats);
      } catch (error) {
        this.logger.error(`Error getting test stats: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get test history
    this.api.registerRoute('GET', '/api/game-engine/plinko/test/history', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 50;
        const history = this.db.getPlinkoTestHistory(limit);
        res.json(history);
      } catch (error) {
        this.logger.error(`Error getting test history: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Clear test history
    this.api.registerRoute('DELETE', '/api/game-engine/plinko/test/history', (req, res) => {
      try {
        const deletedCount = this.db.clearPlinkoTestHistory();
        res.json({ success: true, deletedCount });
      } catch (error) {
        this.logger.error(`Error clearing test history: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // API: Toggle Plinko debug mode
    this.api.registerRoute('POST', '/api/game-engine/plinko/debug', (req, res) => {
      try {
        const { enabled } = req.body;
        
        if (typeof enabled !== 'boolean') {
          return res.status(400).json({ 
            success: false, 
            error: 'Invalid enabled parameter. Must be a boolean.' 
          });
        }
        
        this.plinkoGame.setDebugMode(enabled);
        
        res.json({ 
          success: true, 
          debugMode: enabled,
          message: `Debug mode ${enabled ? 'enabled' : 'disabled'}`
        });
      } catch (error) {
        this.logger.error(`Error toggling debug mode: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // === WHEEL (GLÜCKSRAD) API ROUTES ===

    // API: Get all wheels
    this.api.registerRoute('GET', '/api/game-engine/wheels', (req, res) => {
      try {
        const wheels = this.wheelGame.getAllWheels();
        res.json(wheels);
      } catch (error) {
        this.logger.error(`Error getting wheels: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Create a new wheel
    this.api.registerRoute('POST', '/api/game-engine/wheels', (req, res) => {
      try {
        const { name, segments, settings } = req.body;
        const wheelId = this.wheelGame.createWheel(name || 'New Wheel', segments, settings);
        res.json({ success: true, wheelId });
      } catch (error) {
        this.logger.error(`Error creating wheel: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Delete a wheel
    this.api.registerRoute('DELETE', '/api/game-engine/wheels/:wheelId', (req, res) => {
      try {
        const { wheelId } = req.params;
        const result = this.wheelGame.deleteWheel(parseInt(wheelId));
        if (!result) {
          return res.status(400).json({ success: false, error: 'Cannot delete the last wheel' });
        }
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error deleting wheel: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Update wheel name
    this.api.registerRoute('PUT', '/api/game-engine/wheels/:wheelId/name', (req, res) => {
      try {
        const { wheelId } = req.params;
        const { name } = req.body;
        this.wheelGame.updateWheelName(parseInt(wheelId), name);
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error updating wheel name: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Update wheel chat command
    this.api.registerRoute('PUT', '/api/game-engine/wheels/:wheelId/chat-command', (req, res) => {
      try {
        const { wheelId } = req.params;
        const { chatCommand } = req.body;
        this.wheelGame.updateWheelChatCommand(parseInt(wheelId), chatCommand || null);
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error updating wheel chat command: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Update wheel enabled status
    this.api.registerRoute('PUT', '/api/game-engine/wheels/:wheelId/enabled', (req, res) => {
      try {
        const { wheelId } = req.params;
        const { enabled } = req.body;
        this.wheelGame.updateWheelEnabled(parseInt(wheelId), enabled);
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error updating wheel enabled status: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get Wheel configuration (supports wheelId parameter for specific wheel)
    this.api.registerRoute('GET', '/api/game-engine/wheel/config', (req, res) => {
      try {
        const wheelId = req.query.wheelId ? parseInt(req.query.wheelId) : null;
        const config = this.wheelGame.getConfig(wheelId);
        res.json(config);
      } catch (error) {
        this.logger.error(`Error getting Wheel config: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Update Wheel configuration (supports wheelId in body)
    this.api.registerRoute('POST', '/api/game-engine/wheel/config', (req, res) => {
      try {
        const { wheelId, segments, settings } = req.body;
        // Use wheelId if provided, otherwise get first wheel's ID
        let actualWheelId = wheelId;
        if (!actualWheelId) {
          const config = this.wheelGame.getConfig();
          actualWheelId = config?.id || 1;
        }

        // Ensure displayTexts defaults are present (backward compat)
        const wheelDisplayDefaults = {
          titleText: '🎡 GLÜCKSRAD', labelSpin: '🔄 Dreht sich...', labelResult: '🎉 Ergebnis:',
          labelNiete: '💔 Niete!', labelWin: '🎊 Gewonnen!', labelQueued: '⏳ In der Warteschlange...'
        };
        if (!settings.displayTexts || typeof settings.displayTexts !== 'object') {
          settings.displayTexts = { ...wheelDisplayDefaults };
        } else {
          settings.displayTexts = Object.assign({ ...wheelDisplayDefaults }, settings.displayTexts);
        }

        this.wheelGame.updateConfig(actualWheelId, segments, settings);
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error updating Wheel config: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Update Wheel gift triggers (supports wheelId)
    this.api.registerRoute('POST', '/api/game-engine/wheel/gift-triggers', (req, res) => {
      try {
        const { giftTriggers, wheelId } = req.body;
        // Use wheelId if provided
        let actualWheelId = wheelId ? parseInt(wheelId) : null;
        if (!actualWheelId) {
          const config = this.wheelGame.getConfig();
          actualWheelId = config?.id || 1;
        }
        this.db.updateWheelGiftTriggers(giftTriggers, actualWheelId);
        
        // Emit config update to overlays
        const config = this.wheelGame.getConfig(actualWheelId);
        this.io.emit('wheel:config-updated', {
          wheelId: actualWheelId,
          segments: config.segments,
          settings: config.settings
        });
        
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error updating Wheel gift triggers: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get Wheel statistics (supports wheelId parameter)
    this.api.registerRoute('GET', '/api/game-engine/wheel/stats', (req, res) => {
      try {
        const wheelId = req.query.wheelId ? parseInt(req.query.wheelId) : null;
        const stats = this.wheelGame.getStats(wheelId);
        res.json(stats);
      } catch (error) {
        this.logger.error(`Error getting Wheel stats: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get Wheel win history (supports wheelId parameter)
    this.api.registerRoute('GET', '/api/game-engine/wheel/history', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 50;
        const wheelId = req.query.wheelId ? parseInt(req.query.wheelId) : null;
        const history = this.wheelGame.getWinHistory(limit, wheelId);
        res.json(history);
      } catch (error) {
        this.logger.error(`Error getting Wheel history: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get user's Wheel win history
    this.api.registerRoute('GET', '/api/game-engine/wheel/history/:username', (req, res) => {
      try {
        const { username } = req.params;
        const limit = parseInt(req.query.limit) || 10;
        const history = this.wheelGame.getUserWinHistory(username, limit);
        res.json(history);
      } catch (error) {
        this.logger.error(`Error getting user Wheel history: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get unpaid Wheel prizes
    this.api.registerRoute('GET', '/api/game-engine/wheel/unpaid', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 100;
        const unpaid = this.db.getUnpaidWheelPrizes(limit);
        res.json(unpaid);
      } catch (error) {
        this.logger.error(`Error getting unpaid Wheel prizes: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Mark Wheel prize as paid
    this.api.registerRoute('POST', '/api/game-engine/wheel/pay/:winId', (req, res) => {
      try {
        const { winId } = req.params;
        const result = this.wheelGame.markPrizeAsPaid(parseInt(winId));
        res.json({ success: true, prize: result });
      } catch (error) {
        this.logger.error(`Error marking Wheel prize as paid: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Get Wheel queue status
    this.api.registerRoute('GET', '/api/game-engine/wheel/queue', (req, res) => {
      try {
        const queueStatus = this.wheelGame.getQueueStatus();
        res.json(queueStatus);
      } catch (error) {
        this.logger.error(`Error getting Wheel queue: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Edit a wheel win entry
    this.api.registerRoute('PUT', '/api/game-engine/wheel/win/:winId', (req, res) => {
      try {
        const { winId } = req.params;
        const { prize_text } = req.body;
        const result = this.db.updateWheelWin(parseInt(winId), prize_text);
        if (!result) {
          return res.status(404).json({ success: false, error: 'Win not found' });
        }
        res.json({ success: true, prize: result });
      } catch (error) {
        this.logger.error(`Error updating Wheel win: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Delete a wheel win entry
    this.api.registerRoute('DELETE', '/api/game-engine/wheel/win/:winId', (req, res) => {
      try {
        const { winId } = req.params;
        const deleted = this.db.deleteWheelWin(parseInt(winId));
        if (!deleted) {
          return res.status(404).json({ success: false, error: 'Win not found' });
        }
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error deleting Wheel win: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Reset all wheel wins (full reset, supports wheelId)
    this.api.registerRoute('DELETE', '/api/game-engine/wheel/reset-wins', (req, res) => {
      try {
        const wheelId = req.query.wheelId ? parseInt(req.query.wheelId) : null;
        this.db.resetAllWheelWins(wheelId);
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error resetting Wheel wins: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: Trigger manual wheel spin (for testing, supports wheelId)
    this.api.registerRoute('POST', '/api/game-engine/wheel/spin', (req, res) => {
      try {
        const { username, nickname, giftName, wheelId } = req.body;
        const result = this.wheelGame.triggerSpin(
          username || 'test_user',
          nickname || 'Test User',
          '',
          giftName || 'Manual Spin',
          wheelId ? parseInt(wheelId) : null
        );
        res.json(result);
      } catch (error) {
        this.logger.error(`Error triggering Wheel spin: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // === WHEEL CUSTOM AUDIO ROUTES ===
    
    // Get plugin data directory for custom audio storage
    const pluginDataDir = typeof this.api.getPluginDataDir === 'function'
      ? this.api.getPluginDataDir()
      : path.join(__dirname, 'data');
    const wheelAudioDir = path.join(pluginDataDir, 'wheel-audio');
    
    // Ensure wheel audio directory exists
    if (!fs.existsSync(wheelAudioDir)) {
      fs.mkdirSync(wheelAudioDir, { recursive: true });
    }
    
    // Configure multer for audio file uploads
    const audioStorage = multer.diskStorage({
      destination: (req, file, cb) => {
        const wheelId = this._sanitizeNumericId(req.body.wheelId);
        const wheelDir = this._safeJoin(wheelAudioDir, wheelId);
        if (!wheelDir) {
          cb(new Error('Invalid wheel ID'));
          return;
        }
        if (!fs.existsSync(wheelDir)) {
          fs.mkdirSync(wheelDir, { recursive: true });
        }
        cb(null, wheelDir);
      },
      filename: (req, file, cb) => {
        const audioType = this._sanitizeWheelAudioType(req.body.audioType);
        if (!audioType) {
          cb(new Error('Invalid audio type'));
          return;
        }
        // Use consistent filename based on audio type
        cb(null, `${audioType}.mp3`);
      }
    });
    
    const audioUpload = multer({
      storage: audioStorage,
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
      fileFilter: (req, file, cb) => {
        // Accept only audio files
        if (file.mimetype.startsWith('audio/')) {
          cb(null, true);
        } else {
          cb(new Error('Only audio files are allowed'));
        }
      }
    });
    
    // API: Upload custom wheel audio
    this.api.registerRoute('POST', '/api/game-engine/wheel/audio/upload', audioUpload.single('audio'), (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ success: false, error: 'No audio file uploaded' });
        }
        
        const wheelId = this._sanitizeNumericId(req.body.wheelId);
        const audioType = this._sanitizeWheelAudioType(req.body.audioType);
        if (!audioType) {
          return res.status(400).json({ success: false, error: 'Invalid audio type' });
        }
        
        // Save audio settings to database
        this.db.saveWheelAudioSetting(wheelId, audioType, req.file.originalname, true);
        
        this.logger.info(`Wheel audio uploaded: ${audioType} for wheel ${wheelId}`);
        
        // Emit config update to overlays
        this.io.emit('wheel:audio-updated', {
          wheelId,
          audioType,
          isCustom: true
        });
        
        res.json({ success: true, filename: req.file.originalname });
      } catch (error) {
        this.logger.error(`Error uploading wheel audio: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // API: Reset wheel audio to default
    this.api.registerRoute('POST', '/api/game-engine/wheel/audio/reset', (req, res) => {
      try {
        const { wheelId, audioType } = req.body;
        const safeWheelId = this._sanitizeNumericId(wheelId);
        const safeAudioType = this._sanitizeWheelAudioType(audioType);
        if (!safeAudioType) {
          return res.status(400).json({ success: false, error: 'Invalid audio type' });
        }
        
        // Delete custom audio file if exists
        const audioPath = this._safeJoin(wheelAudioDir, safeWheelId, `${safeAudioType}.mp3`);
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
        
        // Update database
        this.db.saveWheelAudioSetting(safeWheelId, safeAudioType, null, false);
        
        this.logger.info(`Wheel audio reset to default: ${safeAudioType} for wheel ${safeWheelId}`);
        
        // Emit config update to overlays
        this.io.emit('wheel:audio-updated', {
          wheelId: safeWheelId,
          audioType: safeAudioType,
          isCustom: false
        });
        
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error resetting wheel audio: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // API: Get wheel audio settings
    this.api.registerRoute('GET', '/api/game-engine/wheel/audio/settings', (req, res) => {
      try {
        const wheelId = this._sanitizeNumericId(req.query.wheelId);
        const settings = this._getAudioSettings('wheel', wheelId, this.db.getWheelAudioSettings(wheelId));
        res.json(settings);
      } catch (error) {
        this.logger.error(`Error getting wheel audio settings: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });
    
    // Serve custom wheel audio files
    this.api.registerRoute('GET', '/game-engine/sounds/wheel/custom/:wheelId/:filename', (req, res) => {
      const { wheelId, filename } = req.params;
      const safeWheelId = this._sanitizeNumericId(wheelId, null);
      const audioPath = safeWheelId && this._isSafeAudioFilename(filename)
        ? this._safeJoin(wheelAudioDir, safeWheelId, filename)
        : null;
      
      if (audioPath && fs.existsSync(audioPath)) {
        res.sendFile(audioPath);
      } else {
        res.status(404).json({ error: 'Audio file not found' });
      }
    });
    
    // === SLOT MACHINE API ===

    // GET /api/game-engine/slots – list all slot machines
    this.api.registerRoute('GET', '/api/game-engine/slots', (req, res) => {
      try {
        const machines = this.slotGame.getAllMachines();
        res.json(machines);
      } catch (error) {
        this.logger.error(`Error listing slot machines: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/game-engine/slots – create a new slot machine
    this.api.registerRoute('POST', '/api/game-engine/slots', (req, res) => {
      try {
        const { name } = req.body;
        if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
        const id = this.slotGame.createMachine(name.slice(0, 100));
        res.json({ success: true, id });
      } catch (error) {
        this.logger.error(`Error creating slot machine: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // DELETE /api/game-engine/slots/:machineId – delete a slot machine
    this.api.registerRoute('DELETE', '/api/game-engine/slots/:machineId', (req, res) => {
      try {
        const machineId = parseInt(req.params.machineId, 10);
        if (isNaN(machineId)) return res.status(400).json({ error: 'Invalid machine ID' });
        const ok = this.slotGame.deleteMachine(machineId);
        if (!ok) return res.status(404).json({ error: 'Slot machine not found' });
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error deleting slot machine: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // PUT /api/game-engine/slots/:machineId/name – rename
    this.api.registerRoute('PUT', '/api/game-engine/slots/:machineId/name', (req, res) => {
      try {
        const machineId = parseInt(req.params.machineId, 10);
        if (isNaN(machineId)) return res.status(400).json({ error: 'Invalid machine ID' });
        const { name } = req.body;
        if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
        this.slotGame.updateMachineName(machineId, name.slice(0, 100));
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error renaming slot machine: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // PUT /api/game-engine/slots/:machineId/chat-command – update chat command
    this.api.registerRoute('PUT', '/api/game-engine/slots/:machineId/chat-command', (req, res) => {
      try {
        const machineId = parseInt(req.params.machineId, 10);
        if (isNaN(machineId)) return res.status(400).json({ error: 'Invalid machine ID' });
        const { chatCommand } = req.body;
        this.slotGame.updateMachineChatCommand(machineId, chatCommand || null);
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error updating slot chat command: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // PUT /api/game-engine/slots/:machineId/enabled – enable/disable
    this.api.registerRoute('PUT', '/api/game-engine/slots/:machineId/enabled', (req, res) => {
      try {
        const machineId = parseInt(req.params.machineId, 10);
        if (isNaN(machineId)) return res.status(400).json({ error: 'Invalid machine ID' });
        const { enabled } = req.body;
        if (enabled === undefined) return res.status(400).json({ error: 'enabled is required' });
        this.slotGame.updateMachineEnabled(machineId, !!enabled);
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error updating slot machine enabled: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/game-engine/slots/:machineId/config – get full config
    this.api.registerRoute('GET', '/api/game-engine/slots/:machineId/config', (req, res) => {
      try {
        const machineId = req.params.machineId === 'default'
          ? null
          : parseInt(req.params.machineId, 10);
        if (machineId !== null && isNaN(machineId)) return res.status(400).json({ error: 'Invalid machine ID' });
        const config = this.slotGame.getConfig(machineId);
        if (!config) return res.status(404).json({ error: 'Slot machine not found' });
        res.json(config);
      } catch (error) {
        this.logger.error(`Error getting slot config: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/game-engine/slots/:machineId/config – update full config
    this.api.registerRoute('POST', '/api/game-engine/slots/:machineId/config', (req, res) => {
      try {
        const machineId = parseInt(req.params.machineId, 10);
        if (isNaN(machineId)) return res.status(400).json({ error: 'Invalid machine ID' });
        const { symbols, settings, giftMappings, oddsProfiles, rewardRules } = req.body;
        if (!Array.isArray(symbols) || symbols.length === 0) {
          return res.status(400).json({ error: 'symbols must be a non-empty array' });
        }
        if (!settings || typeof settings !== 'object') {
          return res.status(400).json({ error: 'settings must be an object' });
        }
        // Ensure overlayMode defaults are present (backward-compatible migration)
        if (!settings.overlayMode || typeof settings.overlayMode !== 'object') {
          settings.overlayMode = { defaultMode: 'large', chatMode: '', giftMode: '', jackpotMode: 'large', iconPreset: 'normal' };
        } else {
          settings.overlayMode = Object.assign(
            { defaultMode: 'large', chatMode: '', giftMode: '', jackpotMode: 'large', iconPreset: 'normal' },
            settings.overlayMode
          );
        }
        // Ensure designSettings defaults are present (backward-compatible migration)
        if (!settings.designSettings || typeof settings.designSettings !== 'object') {
          settings.designSettings = { bgColor: '#1a0a2e', borderColor: '#FFD700', reelBgColor: '#0d0620', textColor: '#ffffff', winColor: '#FFD700', titleText: '🎰 SLOT MACHINE' };
        } else {
          settings.designSettings = Object.assign(
            { bgColor: '#1a0a2e', borderColor: '#FFD700', reelBgColor: '#0d0620', textColor: '#ffffff', winColor: '#FFD700', titleText: '🎰 SLOT MACHINE' },
            settings.designSettings
          );
        }
        this.slotGame.updateConfig(machineId, symbols, settings, giftMappings || {}, oddsProfiles || {}, rewardRules || []);
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error updating slot config: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/game-engine/slots/:machineId/stats – statistics
    this.api.registerRoute('GET', '/api/game-engine/slots/:machineId/stats', (req, res) => {
      try {
        const machineId = parseInt(req.params.machineId, 10);
        if (isNaN(machineId)) return res.status(400).json({ error: 'Invalid machine ID' });
        const stats = this.slotGame.getStats(machineId);
        res.json(stats);
      } catch (error) {
        this.logger.error(`Error getting slot stats: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/game-engine/slots/:machineId/test-spin – manual test spin
    this.api.registerRoute('POST', '/api/game-engine/slots/:machineId/test-spin', async (req, res) => {
      try {
        const machineId = parseInt(req.params.machineId, 10);
        if (isNaN(machineId)) return res.status(400).json({ error: 'Invalid machine ID' });
        const { username = 'TestUser', nickname = 'Test User', oddsProfile = 'chat' } = req.body || {};
        // Validate oddsProfile against the machine's configured profiles
        const config = this.slotGame.getConfig(machineId);
        if (!config) return res.status(404).json({ error: 'Slot machine not found' });
        const validProfiles = Object.keys(config.oddsProfiles || {});
        const safeProfile = validProfiles.includes(oddsProfile) ? oddsProfile : (validProfiles[0] || 'chat');
        const result = await this.slotGame._triggerSpin(
          String(username).slice(0, 50),
          String(nickname).slice(0, 50),
          '',
          'test',
          'test-spin',
          machineId,
          safeProfile
        );
        res.json(result);
      } catch (error) {
        this.logger.error(`Error in test spin: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/game-engine/slots/:machineId/cooldown/:username
    this.api.registerRoute('GET', '/api/game-engine/slots/:machineId/cooldown/:username', (req, res) => {
      try {
        const machineId = parseInt(req.params.machineId, 10);
        if (isNaN(machineId)) return res.status(400).json({ error: 'Invalid machine ID' });
        const { username } = req.params;
        if (!username) return res.status(400).json({ error: 'username is required' });
        const remainingMs = this.slotGame.getUserCooldownRemaining(username, machineId);
        res.json({ remainingMs, remainingSeconds: Math.ceil(remainingMs / 1000) });
      } catch (error) {
        this.logger.error(`Error getting slot cooldown: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Serve slot overlay HTML
    this.api.registerRoute('GET', '/overlay/game-engine/slot', (req, res) => {
      const overlayPath = path.join(__dirname, 'overlay', 'slot.html');
      res.sendFile(overlayPath);
    });

    // === SLOT CUSTOM AUDIO ROUTES ===

    const slotAudioDir = path.join(pluginDataDir, 'slot-audio');
    if (!fs.existsSync(slotAudioDir)) {
      fs.mkdirSync(slotAudioDir, { recursive: true });
    }

    const slotAudioStorage = multer.diskStorage({
      destination: (req, file, cb) => {
        const safeId = String(parseInt(req.body.machineId, 10) || 1);
        const machineDir = path.join(slotAudioDir, safeId);
        if (!fs.existsSync(machineDir)) {
          fs.mkdirSync(machineDir, { recursive: true });
        }
        cb(null, machineDir);
      },
      filename: (req, file, cb) => {
        const audioType = SLOT_AUDIO_EVENTS.includes(req.body.audioType) ? req.body.audioType : 'unknown';
        cb(null, `${audioType}.mp3`);
      }
    });

    const slotAudioUpload = multer({
      storage: slotAudioStorage,
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('audio/')) {
          cb(null, true);
        } else {
          cb(new Error('Only audio files are allowed'));
        }
      }
    });

    // API: Upload custom slot audio
    this.api.registerRoute('POST', '/api/game-engine/slot/audio/upload', slotAudioUpload.single('audio'), (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ success: false, error: 'No audio file uploaded' });
        }
        const safeId = String(parseInt(req.body.machineId, 10) || 1);
        const audioType = req.body.audioType;
        if (!SLOT_AUDIO_EVENTS.includes(audioType)) {
          return res.status(400).json({ success: false, error: 'Invalid audio type' });
        }
        const durationMs = req.body.durationMs ? Math.max(0, Math.min(parseInt(req.body.durationMs, 10), 60000)) : null;

        this.db.saveSlotAudioSetting(safeId, audioType, req.file.originalname, durationMs, true);
        this.logger.info(`Slot audio uploaded: ${audioType} for machine ${safeId}`);

        // If this is the spin sound and syncSpinToSound is requested, update the machine's spinDuration
        if (audioType === 'spin' && durationMs && durationMs > 0) {
          const machineIdInt = parseInt(safeId, 10);
          if (!isNaN(machineIdInt)) {
            const config = this.slotGame.getConfig(machineIdInt);
            if (config && config.settings && config.settings.syncSpinToSound) {
              const newSettings = Object.assign({}, config.settings, { spinDuration: durationMs });
              this.slotGame.updateConfig(machineIdInt, config.symbols, newSettings, config.giftMappings, config.oddsProfiles, config.rewardRules);
              this.logger.info(`Slot spinDuration auto-synced to ${durationMs}ms for machine ${machineIdInt}`);
            }
          }
        }

        this.io.emit('slot:audio-updated', { machineId: safeId, audioType, isCustom: true });
        res.json({ success: true, filename: req.file.originalname });
      } catch (error) {
        this.logger.error(`Error uploading slot audio: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // API: Reset slot audio to default
    this.api.registerRoute('POST', '/api/game-engine/slot/audio/reset', (req, res) => {
      try {
        const { machineId, audioType } = req.body;
        const safeId = String(parseInt(machineId, 10) || 1);
        if (!SLOT_AUDIO_EVENTS.includes(audioType)) {
          return res.status(400).json({ success: false, error: 'Invalid audio type' });
        }
        const audioPath = path.join(slotAudioDir, safeId, `${audioType}.mp3`);
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
        this.db.saveSlotAudioSetting(safeId, audioType, null, null, false);
        this.logger.info(`Slot audio reset to default: ${audioType} for machine ${safeId}`);
        this.io.emit('slot:audio-updated', { machineId: safeId, audioType, isCustom: false });
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error resetting slot audio: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // API: Get slot audio settings
    this.api.registerRoute('GET', '/api/game-engine/slot/audio/settings', (req, res) => {
      try {
        const machineId = this._sanitizeNumericId(req.query.machineId);
        const settings = this._getAudioSettings('slot', machineId, this.db.getSlotAudioSettings(machineId));
        res.json(settings);
      } catch (error) {
        this.logger.error(`Error getting slot audio settings: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Serve custom slot audio files
    this.api.registerRoute('GET', '/game-engine/sounds/slot/custom/:machineId/:filename', (req, res) => {
      const { machineId, filename } = req.params;
      if (!/^\d+$/.test(machineId) || !/^[\w\-.]+\.mp3$/i.test(filename)) {
        return res.status(400).json({ error: 'Invalid path' });
      }
      const audioPath = path.join(slotAudioDir, machineId, filename);
      // Guard against path traversal (path.join normalizes, but verify result stays in slotAudioDir)
      if (!audioPath.startsWith(slotAudioDir + path.sep)) {
        return res.status(400).json({ error: 'Invalid path' });
      }
      if (fs.existsSync(audioPath)) {
        res.sendFile(audioPath);
      } else {
        res.status(204).end();
      }
    });

    // === SLOT SYMBOL IMAGE ROUTES ===

    const slotImagesDir = path.join(pluginDataDir, 'slot-images');
    if (!fs.existsSync(slotImagesDir)) {
      fs.mkdirSync(slotImagesDir, { recursive: true });
    }

    const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
    const detectSlotImageExtension = (filePath) => {
      const bytes = fs.readFileSync(filePath);
      if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'png';
      if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'jpg';
      if (bytes.length >= 6 && (bytes.subarray(0, 6).toString('ascii') === 'GIF87a' || bytes.subarray(0, 6).toString('ascii') === 'GIF89a')) return 'gif';
      if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
      return null;
    };

    const slotImageStorage = multer.diskStorage({
      destination: (req, file, cb) => {
        const safeId = String(parseInt(req.body.machineId, 10) || 1);
        const machineDir = path.join(slotImagesDir, safeId);
        if (!fs.existsSync(machineDir)) {
          fs.mkdirSync(machineDir, { recursive: true });
        }
        cb(null, machineDir);
      },
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.png';
        const symId = (req.body.symbolId || 'sym').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
        cb(null, `${symId}${ext}`);
      }
    });

    const slotImageUpload = multer({
      storage: slotImageStorage,
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (ALLOWED_IMAGE_MIME.has(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Only PNG, JPEG, GIF, and WebP image files are allowed'));
        }
      }
    });

    // API: Upload symbol image
    this.api.registerRoute('POST', '/api/game-engine/slot/symbol-image/upload', (req, res) => {
      slotImageUpload.single('image')(req, res, (err) => {
        if (err) {
          return res.status(400).json({ success: false, error: err.message });
        }
        if (!req.file) {
          return res.status(400).json({ success: false, error: 'No image file uploaded' });
        }
        const safeId = String(parseInt(req.body.machineId, 10) || 1);
        const symId  = (req.body.symbolId || 'sym').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
        const extension = detectSlotImageExtension(req.file.path);
        if (!extension) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ success: false, error: 'Invalid image content' });
        }
        const filename = `${symId}.${extension}`;
        const finalPath = path.join(path.dirname(req.file.path), filename);
        if (req.file.path !== finalPath) {
          if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
          fs.renameSync(req.file.path, finalPath);
        }
        const imageUrl = `/game-engine/slot-images/${safeId}/${filename}`;
        this.logger.info(`Slot symbol image uploaded: ${symId} for machine ${safeId}`);
        res.json({ success: true, imageUrl });
      });
    });

    // Serve slot symbol images
    this.api.registerRoute('GET', '/game-engine/slot-images/:machineId/:filename', (req, res) => {
      const { machineId, filename } = req.params;
      if (!/^\d+$/.test(machineId) || !/^[\w\-]+\.(png|jpe?g|gif|webp)$/i.test(filename)) {
        return res.status(400).json({ error: 'Invalid path' });
      }
      const imgPath = path.join(slotImagesDir, machineId, filename);
      if (!imgPath.startsWith(slotImagesDir + path.sep)) {
        return res.status(400).json({ error: 'Invalid path' });
      }
      if (fs.existsSync(imgPath)) {
        res.sendFile(imgPath);
      } else {
        res.status(404).json({ error: 'Image not found' });
      }
    });


    // API: Get gift catalog symbols for use as slot symbols
    this.api.registerRoute('GET', '/api/game-engine/slot/gift-catalog', (req, res) => {
      try {
        const gifts = this.slotGame.getGiftCatalogSymbols();
        res.json({ success: true, gifts });
      } catch (error) {
        this.logger.error(`Error fetching slot gift catalog: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    
    // API: Get overlay settings for all games
    this.api.registerRoute('GET', '/api/game-engine/overlay-settings', (req, res) => {
      try {
        const settings = this.db.getOverlaySettings();
        res.json(settings);
      } catch (error) {
        this.logger.error(`Error getting overlay settings: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // API: List Game Engine games for admin UI and integrations
    this.api.registerRoute('GET', '/api/game-engine/games', (req, res) => {
      res.json({
        success: true,
        games: [
          { id: 'connect4', name: 'Connect4', kind: 'interactive', overlayPath: '/overlay/game-engine/connect4' },
          { id: 'chess', name: 'Blitzschach', kind: 'interactive', overlayPath: '/overlay/game-engine/chess' },
          { id: 'plinko', name: 'Plinko', kind: 'queued', overlayPath: '/overlay/game-engine/plinko' },
          { id: 'wheel', name: 'Glücksrad', kind: 'queued', overlayPath: '/overlay/game-engine/wheel' },
          { id: 'slot', name: 'Slot Machine', kind: 'queued', overlayPath: '/overlay/game-engine/slot' },
          {
            id: 'arena',
            name: 'Live Arena',
            kind: 'persistent',
            overlayPath: '/overlay/game-engine/arena',
            configPath: '/api/game-engine/config/arena',
            statePath: '/api/game-engine/arena/state'
          }
        ]
      });
    });
    
    // API: Update overlay settings for a specific game
    this.api.registerRoute('POST', '/api/game-engine/overlay-settings', (req, res) => {
      try {
        const { gameType, useUnified } = req.body;
        
        if (!gameType || useUnified === undefined) {
          return res.status(400).json({ error: 'Missing required fields: gameType, useUnified' });
        }
        
        // Validate game type
        const validGames = ['connect4', 'chess', 'plinko', 'wheel', 'slot', 'arena'];
        if (!validGames.includes(gameType)) {
          return res.status(400).json({ error: `Invalid game type. Must be one of: ${validGames.join(', ')}` });
        }
        
        // Update database
        this.db.setOverlaySetting(gameType, useUnified);
        
        // Update unified queue manager
        if (this.unifiedQueue) {
          this.unifiedQueue.setGameMode(gameType, useUnified);
        }
        
        // Emit update to overlays
        this.io.emit('game-engine:overlay-settings-updated', { 
          gameType, 
          useUnified 
        });
        
        this.logger.info(`Overlay settings updated for ${gameType}: ${useUnified ? 'unified' : 'legacy'}`);
        
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error updating overlay settings: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  /**
   * Register Socket.io events
   */
  _registerSocketConnection(handler) {
    if (typeof this.api.registerSocketConnection === 'function') {
      return this.api.registerSocketConnection(handler);
    }

    // Compatibility for isolated legacy unit-test APIs. The runtime PluginAPI
    // always provides the disposer-backed method above.
    return this.io.on('connection', handler);
  }

  registerSocketEvents() {
    // Streamer makes a move
    this._registerSocketConnection((socket) => {
      socket.on('game-engine:streamer-move', (data) => {
        if (!this._requireSocketRole(socket, 'game-engine:streamer-move', 'admin')) return;
        this.handleStreamerMove(data);
      });

      socket.on('game-engine:interactive-host-move', (data) => {
        if (!this._requireSocketRole(socket, 'game-engine:interactive-host-move', 'admin')) return;
        const result = this.interactiveController?.applyHostMove({
          sessionId: data?.sessionId,
          gameType: data?.gameType,
          sessionRevision: data?.sessionRevision,
          displayRevision: data?.displayRevision,
          move: data?.move
        }) || {
          success: false,
          error: 'interactive_controller_unavailable'
        };
        if (!result.success) {
          socket.emit('game-engine:error', {
            sessionId: data?.sessionId,
            error: result.error
          });
          this.interactiveController?.emitState(socket);
        }
      });

      socket.on('game-engine:cancel-game', (data) => {
        if (!this._requireSocketRole(socket, 'game-engine:cancel-game', 'admin')) return;
        const result = this.cancelGame(data);
        if (result && !result.success) {
          socket.emit('game-engine:error', { sessionId: data?.sessionId, error: result.error });
          this.interactiveController?.emitState(socket);
        }
      });

      socket.on('game-engine:interactive-skip-host-turn', (data) => {
        if (!this._requireSocketRole(socket, 'game-engine:interactive-skip-host-turn', 'admin')) return;
        const result = this.interactiveController?.skipHostTurn({
          sessionId: data?.sessionId,
          gameType: data?.gameType,
          sessionRevision: data?.sessionRevision,
          displayRevision: data?.displayRevision
        }) || { success: false, error: 'interactive_controller_unavailable' };
        if (!result.success) {
          socket.emit('game-engine:error', { sessionId: data?.sessionId, error: result.error });
          this.interactiveController?.emitState(socket);
        }
      });

      socket.on('game-engine:accept-challenge', (data) => {
        if (!this._requireSocketRole(socket, 'game-engine:accept-challenge', 'admin')) return;
        this.acceptChallenge(data?.sessionId, data?.opponentUsername || data?.username);
      });

      socket.on('game-engine:reject-challenge', (data) => {
        if (!this._requireSocketRole(socket, 'game-engine:reject-challenge', 'admin')) return;
        this.rejectChallenge(data.sessionId);
      });

      // === PLINKO SOCKET EVENTS ===
      
      // Overlay requests current Plinko config
      socket.on('plinko:request-config', () => {
        if (!this._requireSocketRole(socket, 'plinko:request-config', ['admin', 'overlay'])) return;
        const config = this.plinkoGame.getConfig();
        socket.emit('plinko:config', config);
      });

      // Overlay requests Plinko leaderboard
      socket.on('plinko:request-leaderboard', (data) => {
        if (!this._requireSocketRole(socket, 'plinko:request-leaderboard', ['admin', 'overlay'])) return;
        const limit = data?.limit || 10;
        const leaderboard = this.plinkoGame.getLeaderboard(limit);
        socket.emit('plinko:leaderboard', leaderboard);
      });

      // Ball landed in slot (sent from overlay)
      socket.on('plinko:ball-landed', async (data) => {
        if (!this._requireSocketRole(socket, 'plinko:ball-landed', 'overlay')) return;
        const { ballId } = data || {};
        await this.plinkoGame.handleBallLanded(ballId);
      });

      // === WHEEL (GLÜCKSRAD) SOCKET EVENTS ===
      
      // Overlay requests current Wheel config
      socket.on('wheel:request-config', () => {
        if (!this._requireSocketRole(socket, 'wheel:request-config', ['admin', 'overlay'])) return;
        const config = this.wheelGame.getConfig();
        socket.emit('wheel:config', config);
      });

      // Overlay requests current unified queue status
      socket.on('unified-queue:request-status', () => {
        if (!this._requireSocketRole(socket, 'unified-queue:request-status', ['admin', 'overlay'])) return;
        if (this.unifiedQueue) {
          socket.emit('unified-queue:status', this.unifiedQueue.getStatus());
        }
      });

      // Unified overlay requests current game state (e.g. on load or reconnect)
      socket.on('game-engine:request-state', () => {
        if (!this._requireSocketRole(socket, 'game-engine:request-state', ['admin', 'overlay'])) return;
        if (this.interactiveController) {
          this.interactiveController.emitState(socket);
          return;
        }
        if (this.activeSessions.size > 0) {
          const [sessionId] = [...this.activeSessions.entries()][0];
          const session = this.db.getSession(sessionId);
          if (session) {
            const useUnified = this.unifiedQueue ? this.unifiedQueue.shouldUseUnifiedOverlay(session.game_type) : false;
            socket.emit('game-engine:current-state', {
              hasActiveGame: true,
              gameType: session.game_type,
              sessionId,
              useUnified
            });
          } else {
            socket.emit('game-engine:current-state', { hasActiveGame: false });
          }
        } else {
          socket.emit('game-engine:current-state', { hasActiveGame: false });
        }
      });

      // Spin completed (sent from overlay)
      socket.on('wheel:spin-complete', async (data) => {
        if (!this._requireSocketRole(socket, 'wheel:spin-complete', 'overlay')) return;
        const { spinId, segmentIndex, reportedSegmentIndex } = data;
        await this.wheelGame.handleSpinComplete(spinId, segmentIndex, reportedSegmentIndex);
      });

      // === SLOT MACHINE SOCKET EVENTS ===

      // Overlay requests current slot config
      socket.on('slot:request-config', (data) => {
        if (!this._requireSocketRole(socket, 'slot:request-config', ['admin', 'overlay'])) return;
        if (!this.slotGame) { socket.emit('slot:config', null); return; }
        const machineId = data && data.machineId ? data.machineId : null;
        const config = this.slotGame.getConfig(machineId);
        socket.emit('slot:config', config);
      });

      // Overlay confirms that the spin animation has fully completed.
      // Rewards (OpenShock, XP, audio) are dispatched only now so they fire
      // AFTER the reels have visually stopped and the result is displayed.
      socket.on('slot:spin-completed', (data) => {
        if (!this._requireSocketRole(socket, 'slot:spin-completed', 'overlay')) return;
        if (!this.slotGame) return;
        const spinId = data && data.spinId;
        if (!spinId) return;
        this.slotGame.handleSpinCompleted(spinId).catch(err => {
          this.logger.error(`[SLOT] handleSpinCompleted error for spinId ${spinId}: ${err.message}`);
        });
      });

      // Listen for config updates to re-register GCCE commands
      socket.on('game-engine:config-updated', (data) => {
        if (!this._requireSocketRole(socket, 'game-engine:config-updated', 'admin')) return;
        if (data.gameType === 'connect4') {
          this.logger.info('💬 [GAME ENGINE] Connect4 config updated, re-registering GCCE commands');
          this.registerGCCECommands();
        }
      });
    });
  }

  /**
   * Register TikTok event handlers
   */
  registerTikTokEvents() {
    // Listen for gifts that trigger games
    this.api.registerTikTokEvent('gift', (data) => {
      if (data && data.repeatEnd !== false && this._isDuplicateGiftEvent(data)) {
        return;
      }

      if (this.arenaGame) {
        this.arenaGame.handleGift(data);
      }
      this.handleGiftTrigger(data, { skipDedup: true });
    });

    this.api.registerTikTokEvent('chat', (data) => {
      if (this.arenaGame) {
        this.arenaGame.handleActivity(data, 'chat');
      }
      if (!this.gcceCommandsRegistered || !this.isGCCECommandMessage(data)) {
        this.handleChatCommand(data);
      }
    });

    ['join', 'like', 'follow', 'share', 'subscribe'].forEach(eventName => {
      this.api.registerTikTokEvent(eventName, (data) => {
        if (this.arenaGame) {
          this.arenaGame.handleActivity(data, eventName);
        }
      });
    });

    if (!this.gcceCommandsRegistered) {
      this.logger.info('💬 [GAME ENGINE] Fallback chat handler registered (GCCE not available)');
    } else {
      this.logger.info('💬 [GAME ENGINE] Chat commands handled by GCCE');
    }
  }

  /**
   * Check whether a chat event uses the active GCCE command prefix.
   * @param {Object} data - TikTok chat event
   * @returns {boolean} True when GCCE should own the command
   */
  isGCCECommandMessage(data) {
    const message = (data?.comment || data?.message || '').trim();
    return Boolean(message && message.startsWith(this.getGCCECommandPrefix()));
  }

  /**
   * Get the currently configured GCCE command prefix.
   * @returns {string} Single-character command prefix
   */
  getGCCECommandPrefix() {
    const gccePlugin = this.api.pluginLoader?.loadedPlugins?.get('gcce');
    const prefix = gccePlugin?.instance?.pluginConfig?.commandPrefix;
    return typeof prefix === 'string' && prefix.trim().length > 0
      ? prefix.trim().charAt(0)
      : '/';
  }

  /**
   * Normalize a chat command configured by users.
   * @param {string} command - Raw command value
   * @param {string} fallback - Fallback command when raw value is empty
   * @returns {string} Lowercase command name without common prefixes
   */
  normalizeChatCommandName(command, fallback = '') {
    const raw = typeof command === 'string' ? command.trim() : '';
    const fallbackValue = typeof fallback === 'string' ? fallback.trim() : '';
    const value = raw || fallbackValue;
    return value.replace(/^[!/]+/, '').trim().toLowerCase();
  }

  /**
   * Get the configured Connect4 start command as a GCCE-compatible name.
   * @returns {string} Command name without prefix
   */
  getConnect4StartCommandName() {
    const storedConfig = this.db?.getGameConfig ? this.db.getGameConfig('connect4') : null;
    const connect4Config = this._getConfigWithDefaults('connect4', storedConfig);
    return this.normalizeChatCommandName(connect4Config?.chatCommand, 'c4start') || 'c4start';
  }

  /**
   * Register GCCE chat commands
   */
  registerGCCECommands() {
    try {
      // Try to get GCCE plugin instance
      const gccePlugin = this.api.pluginLoader?.loadedPlugins?.get('gcce');
      
      if (!gccePlugin?.instance) {
        this.logger.debug('💬 [GAME ENGINE] GCCE not available yet, will retry');
        this.gcceCommandsRegistered = false;
        return;
      }

      const gcce = gccePlugin.instance;
      const getExistingCommandOwner = (commandName) => {
        const existingCommand = gcce.registry?.getCommand?.(commandName);
        if (!existingCommand || existingCommand.pluginId === 'game-engine') {
          return null;
        }
        return existingCommand.pluginId;
      };

      const c4ChatCommand = this.getConnect4StartCommandName();
      const connect4StartCommands = [...this._connect4StartAliases()]
        .filter(commandName => commandName !== 'c4');

      // Load all chat command triggers from database
      const triggers = this.db.getTriggers();
      const chatCommandTriggers = triggers.filter(t => t.trigger_type === 'command');
      
      this.logger.debug(`💬 [GAME ENGINE] Found ${chatCommandTriggers.length} chat command triggers in database`);

      // Define game commands
      const commands = [
        {
          name: 'c4',
          description: 'Play Connect4 - drop a piece in column A-G',
          syntax: '/c4 <A-G>',
          permission: 'all', // All viewers can play
          enabled: true,
          minArgs: 0,
          maxArgs: 1,
          category: 'Games',
          handler: async (args, context) => args?.length
            ? await this.handleConnect4Command(args, context)
            : await this.handleConnect4StartCommand(args, context)
        },
        ...connect4StartCommands.map(commandName => ({
          name: commandName,
          description: 'Start or join a Connect4 viewer challenge',
          syntax: `/${commandName}`,
          permission: 'all',
          enabled: true,
          minArgs: 0,
          maxArgs: 0,
          category: 'Games',
          handler: async (args, context) => await this.handleConnect4StartCommand(args, context)
        })),
        {
          name: 'move',
          description: 'Make a chess move (SAN or UCI format)',
          syntax: '/move <move> or /m <move>',
          aliases: ['m'],
          permission: 'all',
          enabled: true,
          minArgs: 1,
          maxArgs: 1,
          category: 'Games',
          handler: async (args, context) => await this.handleChessMoveCommand(args, context)
        },
        {
          name: 'chessstart',
          description: 'Start a new chess game',
          syntax: '/chessstart [timecontrol]',
          permission: 'all',
          enabled: true,
          minArgs: 0,
          maxArgs: 1,
          category: 'Games',
          handler: async (args, context) => await this.handleChessStartCommand(args, context)
        },
        {
          name: 'resign',
          description: 'Resign from current game',
          syntax: '/resign',
          permission: 'all',
          enabled: true,
          minArgs: 0,
          maxArgs: 0,
          category: 'Games',
          handler: async (args, context) => await this.handleResignCommand(args, context)
        },
        {
          name: 'plinko',
          description: 'Play Plinko - bet XP for a chance to win multipliers',
          syntax: '/plinko <amount> or /plinko max',
          permission: 'all',
          enabled: true,
          minArgs: 1,
          maxArgs: 1,
          category: 'Games',
          handler: async (args, context) => await this.handlePlinkoCommand(args, context)
        },
        {
          name: 'arena',
          description: 'Set your Live Arena strategy',
          syntax: '/arena <hunt|flee|farm|target|role|status>',
          permission: 'all',
          enabled: true,
          minArgs: 1,
          maxArgs: 3,
          category: 'Games',
          handler: async (args, context) => await this.handleArenaCommand(args, context)
        },
        ...['boost', 'shield', 'bomb'].flatMap(ability => {
          const existingOwner = getExistingCommandOwner(ability);
          if (existingOwner) {
            this.logger.warn(`[GAME ENGINE] Arena command "${ability}" is already owned by ${existingOwner}; GCCE registration skipped.`);
            return [];
          }
          return [{
            name: ability,
            description: `Use the Live Arena ${ability} ability`,
            syntax: `/${ability}`,
            permission: 'all', enabled: true, minArgs: 0, maxArgs: 0, category: 'Games',
            handler: async (_args, context) => await this.handleArenaAbilityCommand(ability, context)
          }];
        }),
        ...['schild'].flatMap(command => {
          const existingOwner = getExistingCommandOwner(command);
          if (existingOwner) {
            this.logger.warn(`[GAME ENGINE] Arena command "${command}" is already owned by ${existingOwner}; GCCE registration skipped.`);
            return [];
          }
          return [{
            name: 'schild',
            description: 'Use the Live Arena shield ability',
            syntax: '/schild',
            permission: 'all', enabled: true, minArgs: 0, maxArgs: 0, category: 'Games',
            handler: async (_args, context) => await this.handleArenaAbilityCommand('shield', context)
          }];
        }),
      ];

      // Register slot machine chat commands (stored in game_slot_config, not game_triggers)
      // Each enabled slot machine can have its own command (e.g. "!spin")
      if (this.slotGame) {
        try {
          const slotMachines = this.slotGame.getAllMachines();
          slotMachines.forEach(machine => {
            if (!machine.enabled || !machine.chatCommand) return;
            const slotCommandName = machine.chatCommand.replace(/^[!/]/, '').toLowerCase();
            if (!slotCommandName) return;
            // Avoid duplicate registration in case a machine command matches a hardcoded one
            if (commands.some(cmd => cmd.name === slotCommandName)) {
              this.logger.debug(`💬 [GAME ENGINE] Slot command "${slotCommandName}" already registered – skipping`);
              return;
            }
            const existingOwner = getExistingCommandOwner(slotCommandName);
            if (existingOwner) {
              this.logger.info(`[GAME ENGINE] Slot command "${slotCommandName}" is already owned by ${existingOwner}; skipping game-engine registration`);
              return;
            }
            const capturedMachineId = machine.id;
            commands.push({
              name: slotCommandName,
              description: `Spin the "${machine.name}" slot machine`,
              syntax: `/${slotCommandName}`,
              permission: 'all',
              enabled: true,
              minArgs: 0,
              maxArgs: 0,
              category: 'Games',
              handler: async (args, context) => await this.handleSlotSpinCommand(args, context, capturedMachineId)
            });
            this.logger.debug(`💬 [GAME ENGINE] Registered slot command: ${slotCommandName} -> machine ID ${capturedMachineId}`);
          });
        } catch (slotErr) {
          this.logger.warn(`💬 [GAME ENGINE] Could not load slot machine commands for GCCE: ${slotErr.message}`);
        }
      }

      // Register custom triggers from database
      // These are commands added via Admin UI that should trigger games
      chatCommandTriggers.forEach(trigger => {
        // Extract command name without prefix (remove /, !, etc.)
        const commandName = trigger.trigger_value.replace(/^[!/]/, '');
        
        // Check if command is already registered (avoid duplicates)
        if (commands.some(cmd => cmd.name === commandName)) {
          this.logger.debug(`💬 [GAME ENGINE] Skipping duplicate command: ${commandName}`);
          return;
        }
        
        const existingOwner = getExistingCommandOwner(commandName);
        if (existingOwner) {
          this.logger.info(`[GAME ENGINE] Skipping custom DB trigger command "${commandName}" because it is already owned by ${existingOwner}`);
          return;
        }

        // Determine appropriate handler based on game type
        let handler;
        let description;
        let syntax = `/${commandName}`;
        
        if (trigger.game_type === 'connect4') {
          handler = async (args, context) => await this.handleConnect4StartCommand(args, context);
          description = `Start Connect4 game (custom trigger: ${trigger.trigger_value})`;
        } else if (trigger.game_type === 'chess') {
          handler = async (args, context) => await this.handleChessStartCommand(args, context);
          description = `Start Chess game (custom trigger: ${trigger.trigger_value})`;
        } else if (trigger.game_type === 'plinko') {
          handler = async (args, context) => await this.handlePlinkoCommand(args, context);
          description = `Play Plinko (custom trigger: ${trigger.trigger_value})`;
        } else if (trigger.game_type === 'slot') {
          // Slot machine commands from the game_triggers table – delegate to the first machine
          // (per-machine assignment is handled via game_slot_config.chat_command).
          if (this.slotGame) {
            handler = async (args, context) => await this.handleSlotSpinCommand(args, context, null);
            description = `Spin a slot machine (trigger: ${trigger.trigger_value})`;
          } else {
            this.logger.debug(`💬 [GAME ENGINE] Skipping slot trigger: slotGame not available`);
            return;
          }
        } else if (trigger.game_type === 'wheel') {
          // Wheel is triggered exclusively via gifts, not chat commands - skip
          this.logger.debug(`💬 [GAME ENGINE] Skipping wheel chat command trigger: ${trigger.trigger_value} (wheel uses gift triggers only)`);
          return;
        } else {
          // Unknown game type, skip
          this.logger.warn(`💬 [GAME ENGINE] Unknown game type for trigger: ${trigger.game_type}`);
          return;
        }
        
        // Add custom command to GCCE
        commands.push({
          name: commandName,
          description: description,
          syntax: syntax,
          permission: 'all',
          enabled: true,
          minArgs: 0,
          maxArgs: trigger.game_type === 'plinko' ? 1 : 0,
          category: 'Games',
          handler: handler
        });
        
        this.logger.debug(`💬 [GAME ENGINE] Added custom DB trigger command: ${commandName} -> ${trigger.game_type}`);
      });

      // Unregister old commands first (in case of reload)
      try {
        gcce.unregisterCommandsForPlugin('game-engine');
      } catch (e) {
        // Ignore errors if commands don't exist yet
      }

      // Register commands with GCCE
      const result = gcce.registerCommandsForPlugin('game-engine', commands);
      
      if (result.registered.length > 0) {
        this.gcceCommandsRegistered = true;
        this.logger.info(`💬 [GAME ENGINE] Registered ${result.registered.length} commands with GCCE: ${result.registered.join(', ')}`);
      }
      
      if (result.failed.length > 0) {
        this.logger.warn(`💬 [GAME ENGINE] Failed to register commands: ${result.failed.join(', ')}`);
      }

    } catch (error) {
      this.logger.error(`❌ [GAME ENGINE] Error registering GCCE commands: ${error.message}`);
      this.gcceCommandsRegistered = false;
    }
  }

  /**
   * Handle Slot Machine spin command (GCCE context adapter).
   *
   * Called from GCCE-registered handlers when a viewer types the machine's
   * chat command (e.g. !spin).  Adapts the GCCE context object to the
   * format expected by SlotGame.triggerSpinFromChat().
   *
   * @param {Array}  _args       – command arguments (not used for slot spins)
   * @param {Object} context     – GCCE command context
   * @param {number|null} machineId – target slot machine ID (null → first machine)
   */
  async handleSlotSpinCommand(_args, context, machineId = null) {
    if (!this.slotGame) {
      this.logger.warn('[SLOT] handleSlotSpinCommand called but slotGame is not initialised');
      return;
    }

    const {
      uniqueId, userId, nickname, profilePictureUrl = '',
      userData = {}  // GCCE places role flags inside context.userData, not at the top level
    } = context;

    // Role flags: prefer context.userData (GCCE-enriched); fall back to top-level
    // for any edge-case where the context is constructed differently.
    const isModerator    = userData.isModerator    ?? context.isModerator    ?? false;
    const isSubscriber   = userData.isSubscriber   ?? context.isSubscriber   ?? false;
    const teamMemberLevel = userData.teamMemberLevel ?? context.teamMemberLevel ?? 0;
    // Superfan detection: TikTok provides this via isSuperFan, isSuperfan, or topGifter flags
    const isSuperfan     = !!(userData.isSuperFan || userData.isSuperfan || userData.topGifter
                            || context.isSuperFan || context.isSuperfan);

    const username = uniqueId || userId || nickname || 'Unknown';
    const userRoles = { isModerator, isSubscriber, teamMemberLevel, isSuperfan };

    try {
      const lockoutRejection = this._rejectIfGameLocked(username, nickname || username, 'slot');
      if (lockoutRejection) {
        return lockoutRejection;
      }

      const result = await this.slotGame.triggerSpinFromChat(
        username,
        nickname || username,
        profilePictureUrl,
        context.command || '!spin',
        machineId,
        userRoles
      );

      if (!result.success) {
        this.logger.debug(`[SLOT] GCCE spin declined for ${username}: ${result.error}`);
      }
    } catch (err) {
      this.logger.error(`[SLOT] Error in handleSlotSpinCommand for ${username}: ${err.message}`);
    }
  }

  /**
   * Handle wheel (Glücksrad) command
   */
  async handleWheelCommand(args, context) {
    const { username, uniqueId, nickname, profilePictureUrl } = context;
    const playerId = uniqueId || username;
    
    try {
      const lockoutRejection = this._rejectIfGameLocked(playerId, nickname || username, 'wheel');
      if (lockoutRejection) {
        return {
          success: false,
          response: `@${nickname || username} ${lockoutRejection.message}`,
          error: lockoutRejection.error
        };
      }

      const result = await this.wheelGame.triggerSpin(
        playerId,
        nickname || username,
        profilePictureUrl || '',
        'Chat Command'
      );

      if (!result.success) {
        return {
          success: false,
          response: `@${nickname || username} Fehler: ${result.error}`
        };
      }

      if (result.queued) {
        return {
          success: true,
          response: `@${nickname || username} 🎡 Dein Spin wurde in die Warteschlange aufgenommen (Position ${result.position})!`
        };
      }

      return {
        success: true,
        response: `@${nickname || username} 🎡 Das Glücksrad dreht sich für dich!`
      };
    } catch (error) {
      this.logger.error(`Error handling wheel command: ${error.message}`);
      return {
        success: false,
        response: `@${nickname || username} Fehler beim Drehen des Glücksrads.`
      };
    }
  }

  /**
   * Normalize gift ID to string for consistent comparisons (Bug #4 fix)
   * @param {string|number|null|undefined} giftId - Gift ID to normalize
   * @returns {string} Normalized gift ID as string
   */
  normalizeGiftId(giftId) {
    if (giftId === undefined || giftId === null || giftId === '') {
      return '';
    }
    return String(giftId).trim();
  }

  _isDuplicateGiftEvent(data) {
    const { uniqueId, giftName, giftId } = data;
    const dedupKey = `${uniqueId || ''}_${giftName || ''}_${giftId || 'noId'}`;
    const now = Date.now();
    const lastEventTime = this.recentGiftEvents.get(dedupKey);

    if (lastEventTime && (now - lastEventTime) < this.GIFT_DEDUP_WINDOW_MS) {
      this.logger.warn(`[GIFT DEDUP] Duplicate gift event blocked: ${giftName} from ${uniqueId} (${now - lastEventTime}ms since last event)`);
      return true;
    }

    this.recentGiftEvents.set(dedupKey, now);
    return false;
  }

  /**
   * Handle gift trigger
   */
  handleGiftTrigger(data, options = {}) {
    const { uniqueId, giftName, giftId, nickname, giftPictureUrl, profilePictureUrl = '', repeatEnd, repeatCount } = data;
    
    // Enhanced gift event logging for debugging
    this.logger.info(`[GIFT TRIGGER] Received: ${giftName} (ID: ${giftId}) from ${uniqueId}, repeatEnd: ${repeatEnd}, repeatCount: ${repeatCount ?? 1}`);
    
    // Only process gift triggers when the gift streak is complete (repeatEnd = true)
    // This prevents multiple triggers for streakable gifts like roses
    // If repeatEnd is undefined, assume it's a single gift (not a streak)
    if (repeatEnd === false) {
      this.logger.debug(`[GIFT TRIGGER] Gift ${giftName} (ID: ${giftId}) is part of a streak, waiting for repeatEnd`);
      return;
    }

    if (!options.skipDedup && this._isDuplicateGiftEvent(data)) {
      return;
    }
    
    // Normalize gift ID for consistent comparisons (Bug #4 fix)
    const giftIdStr = this.normalizeGiftId(giftId);
    const giftNameLower = (giftName || '').toLowerCase().trim();

    // Cap repeatCount to prevent abuse from extremely high values
    const effectiveCount = Math.min(Math.max(repeatCount || 1, 1), this.MAX_REPEAT_TRIGGERS);
    
    // Check for Wheel (Glücksrad) gift triggers across ALL wheels
    const matchingWheel = this.wheelGame.findWheelByGiftTrigger(giftIdStr || giftName);
    if (matchingWheel) {
      this.logger.info(`[WHEEL TRIGGER] Gift ${giftName} (ID: ${giftId}) matched Wheel "${matchingWheel.name}" (ID: ${matchingWheel.id}) - triggering ${effectiveCount}x spin(s)`);
      // Each handleWheelGiftTrigger call enqueues into the wheel's own queue system (triggerSpin),
      // so rapid calls are safe - the queue absorbs the load.
      for (let i = 0; i < effectiveCount; i++) {
        this.handleWheelGiftTrigger(uniqueId, nickname, profilePictureUrl, giftName, matchingWheel.id);
      }
      return;
    }

    // Check for Plinko gift triggers across ALL boards (board-specific giftMappings)
    // Catalog-added gifts use the gift ID as the mapping key; manually-entered gifts may use the name.
    // We try giftIdStr first, then fall back to giftName so both storage formats are found.
    const matchingPlinkoBoard = this.plinkoGame.findBoardByGiftTrigger(giftIdStr) ||
                                this.plinkoGame.findBoardByGiftTrigger(giftName);
    if (matchingPlinkoBoard) {
      this.logger.info(`[PLINKO TRIGGER] Gift ${giftName} (ID: ${giftId}) matched Plinko board "${matchingPlinkoBoard.name}" (ID: ${matchingPlinkoBoard.id}) - triggering ${effectiveCount}x`);
      for (let i = 0; i < effectiveCount; i++) {
        // Pass matchingPlinkoBoard.id so handlePlinkoGiftTrigger uses the correct board's config
        // directly instead of falling back to the default (first) board.
        this.handlePlinkoGiftTrigger(uniqueId, nickname, profilePictureUrl, giftName, giftIdStr, false, matchingPlinkoBoard.id);
      }
      return;
    }

    // Check for Slot Machine gift triggers
    if (this.slotGame) {
      const matchingSlotMachine = this.slotGame.findMachineByGiftTrigger(giftIdStr || giftName) ||
                                  this.slotGame.findMachineByGiftTrigger(giftName);
      if (matchingSlotMachine) {
        const giftMapping = (matchingSlotMachine.giftMappings || {})[giftIdStr] ||
                            (matchingSlotMachine.giftMappings || {})[giftName] ||
                            {};
        const oddsProfile = giftMapping.oddsProfile || 'gift_common';
        this.logger.info(`[SLOT TRIGGER] Gift ${giftName} (ID: ${giftId}) matched Slot "${matchingSlotMachine.name}" (ID: ${matchingSlotMachine.id}, odds: ${oddsProfile}) - triggering ${effectiveCount}x`);
        for (let i = 0; i < effectiveCount; i++) {
          this.handleSlotGiftTrigger(uniqueId, nickname, profilePictureUrl, giftName, oddsProfile, matchingSlotMachine.id);
        }
        return;
      }
    }

    // Check if this gift triggers a game from database triggers
    const triggers = this.db.getTriggers();
    this.logger.debug(`[GIFT TRIGGER] Checking ${triggers.length} triggers for gift "${giftName}" (ID: ${giftIdStr})...`);
    
    const matchingTrigger = triggers.find(t => {
      if (t.trigger_type !== 'gift') return false;
      
      // Normalize trigger values (Bug #4 fix)
      const triggerValueStr = this.normalizeGiftId(t.trigger_value);
      const triggerValueLower = (t.trigger_value || '').toLowerCase().trim();
      
      // Match by gift ID (exact string comparison) or gift name (case-insensitive)
      const match = triggerValueStr === giftIdStr || 
                    triggerValueLower === giftNameLower;
      
      if (match) {
        this.logger.info(`[GIFT TRIGGER] ✅ Match found! Trigger: "${t.trigger_value}" → ${t.game_type}`);
      }
      
      return match;
    });

    if (!matchingTrigger) {
      this.logger.warn(`[GIFT TRIGGER] ❌ No matching trigger found for "${giftName}" (ID: ${giftId}). Available gift triggers: ${triggers.filter(t => t.trigger_type === 'gift').map(t => t.trigger_value).join(', ') || 'none'}`);
      return;
    }
    
    // Handle Plinko differently - it doesn't need queuing
    if (matchingTrigger.game_type === 'plinko') {
      this.logger.info(`[GIFT TRIGGER] Plinko trigger matched for gift "${giftName}" - triggering ${effectiveCount}x`);
      for (let i = 0; i < effectiveCount; i++) {
        // Pass giftIdStr so ID-keyed board mappings are resolved correctly, and
        // useDefaults=true so the Trigger-Tab-only case spawns with default parameters
        // when no board-specific mapping exists.
        this.handlePlinkoGiftTrigger(uniqueId, nickname, profilePictureUrl, giftName, giftIdStr, true);
      }
      return;
    }
    
    // Handle Wheel (Glücksrad) from legacy triggers - has its own queue system
    if (matchingTrigger.game_type === 'wheel') {
      this.logger.info(`[LEGACY WHEEL TRIGGER] Gift ${giftName} (ID: ${giftId}) matched legacy trigger - triggering ${effectiveCount}x spin(s)`);
      for (let i = 0; i < effectiveCount; i++) {
        this.handleWheelGiftTrigger(uniqueId, nickname, profilePictureUrl, giftName, null);
      }
      return;
    }

    // Use handleGameStart to handle queueing for other games
    for (let i = 0; i < effectiveCount; i++) {
      this.handleGameStart(
        matchingTrigger.game_type, 
        uniqueId, 
        nickname, 
        'gift', 
        giftName,
        giftPictureUrl
      );
    }
  }

  /**
   * Handle Wheel (Glücksrad) gift trigger
   * @param {string} username - Username
   * @param {string} nickname - Nickname
   * @param {string} profilePictureUrl - Profile picture URL
   * @param {string} giftName - Gift name
   * @param {number} wheelId - Wheel ID (optional, defaults to first wheel)
   */
  async handleWheelGiftTrigger(username, nickname, profilePictureUrl, giftName, wheelId = null) {
    try {
      const lockoutRejection = this._rejectIfGameLocked(username, nickname, 'wheel');
      if (lockoutRejection) {
        return lockoutRejection;
      }

      const result = await this.wheelGame.triggerSpin(
        username,
        nickname,
        profilePictureUrl || '',
        giftName,
        wheelId
      );

      if (!result.success) {
        this.logger.error(`Failed to trigger Wheel spin for ${username}: ${result.error}`);
      } else {
        const wheelName = result.wheelName || 'Wheel';
        if (result.queued) {
          this.logger.info(`🎡 ${wheelName} spin queued for ${username} (position ${result.position})`);
        } else {
          this.logger.info(`🎡 ${wheelName} spin started for ${username}`);
        }
      }
    } catch (error) {
      this.logger.error(`Error handling Wheel gift trigger: ${error.message}`);
    }
  }

  /**
   * Handle Slot Machine gift trigger
   * @param {string} username
   * @param {string} nickname
   * @param {string} profilePictureUrl
   * @param {string} giftName
   * @param {string} oddsProfile – odds profile key from gift mapping
   * @param {number|null} machineId
   */
  async handleSlotGiftTrigger(username, nickname, profilePictureUrl, giftName, oddsProfile = 'gift_common', machineId = null) {
    try {
      const lockoutRejection = this._rejectIfGameLocked(username, nickname, 'slot');
      if (lockoutRejection) {
        return lockoutRejection;
      }

      const result = await this.slotGame.triggerSpinFromGift(
        username,
        nickname,
        profilePictureUrl || '',
        giftName,
        oddsProfile,
        machineId
      );
      if (!result.success) {
        this.logger.error(`[SLOT] Failed to trigger spin for ${username}: ${result.error}`);
      } else {
        this.logger.info(`🎰 Slot spin triggered for ${username} via gift "${giftName}" (${result.category})`);
      }
    } catch (error) {
      this.logger.error(`[SLOT] Error handling gift trigger: ${error.message}`);
    }
  }

  /**
   * Handle Plinko gift trigger
   */
  async handlePlinkoGiftTrigger(username, nickname, profilePictureUrl, giftName, giftId = null, useDefaults = false, boardId = null) {
    try {
      const lockoutRejection = this._rejectIfGameLocked(username, nickname, 'plinko');
      if (lockoutRejection) {
        return lockoutRejection;
      }

      // Normalize gift name and ID for consistent comparisons
      const normalizedGiftName = (giftName || '').trim();
      // Gift IDs from the catalog are stored as string keys (e.g. "5655")
      const normalizedGiftId = giftId ? String(giftId).trim() : null;
      let giftMapping = null;
      let resolvedBoardId = boardId;
      
      // When a specific board was identified during gift trigger lookup, use it directly.
      // This prevents silently falling back to the first/default board when the matching
      // gift actually belongs to a different board (the root cause of non-default boards
      // not spawning balls).
      if (boardId !== null) {
        this.logger.info(`[PLINKO TRIGGER] Board-aware path: targeting board ID ${boardId} (matched by gift trigger lookup)`);
      } else {
        this.logger.debug(`[PLINKO TRIGGER] No specific board targeted – checking primary config then all boards`);
      }

      // Get config for the specific board (if known) or the default/first board (backward compat)
      const config = boardId !== null
        ? this.plinkoGame.getConfig(boardId)
        : this.plinkoGame.getConfig();
      
      // Try by gift ID first (catalog-added mappings use the numeric ID as key)
      if (normalizedGiftId && config.giftMappings && config.giftMappings[normalizedGiftId]) {
        giftMapping = config.giftMappings[normalizedGiftId];
        resolvedBoardId = config.id || resolvedBoardId;
        this.logger.info(`[PLINKO] Found gift mapping in board "${config.name}" (ID: ${config.id}) by ID key "${normalizedGiftId}"`);
      }
      
      // Try exact match by gift name in primary config
      if (!giftMapping && config.giftMappings && config.giftMappings[normalizedGiftName]) {
        giftMapping = config.giftMappings[normalizedGiftName];
        resolvedBoardId = config.id || resolvedBoardId;
        this.logger.info(`[PLINKO] Found gift mapping in board "${config.name}" (ID: ${config.id}) by name key "${normalizedGiftName}"`);
      }
      
      // Try case-insensitive match by gift name in primary config
      if (!giftMapping && config.giftMappings) {
        const lowerGiftName = normalizedGiftName.toLowerCase();
        for (const [key, value] of Object.entries(config.giftMappings)) {
          if (key.toLowerCase() === lowerGiftName) {
            giftMapping = value;
            resolvedBoardId = config.id || resolvedBoardId;
            this.logger.info(`[PLINKO] Matched gift "${normalizedGiftName}" in board "${config.name}" (ID: ${config.id}) via case-insensitive lookup (key: "${key}")`);
            break;
          }
        }
      }
      
      // Fallback: Check all enabled Plinko boards for gift mappings.
      // This path is only reached when no specific boardId was provided (e.g. backward-compat
      // calls) or when the primary config does not contain the mapping.
      // When boardId IS provided, the primary config above is already the correct board, so
      // reaching here means the mapping was not found there – log a warning for debuggability.
      if (!giftMapping) {
        if (boardId !== null) {
          this.logger.warn(`[PLINKO] Gift "${normalizedGiftName}" (ID: ${normalizedGiftId || 'none'}) not found in targeted board ID ${boardId} – falling back to all enabled boards`);
        } else {
          this.logger.debug(`[PLINKO] No mapping in primary config, checking all enabled boards...`);
        }
        const boards = this.plinkoGame.getAllBoards();
        const lowerGiftName = normalizedGiftName.toLowerCase(); // Compute once, reuse in loop
        
        for (const board of boards) {
          if (!board.enabled) continue;
          
          try {
            // getAllBoards() returns already parsed giftMappings object
            const mappings = board.giftMappings || {};
            
            // Try by gift ID first (catalog-added mappings use the numeric ID as key)
                if (normalizedGiftId && mappings[normalizedGiftId]) {
                  giftMapping = mappings[normalizedGiftId];
                  resolvedBoardId = board.id;
                  this.logger.info(`[PLINKO] Found gift mapping in board "${board.name}" (ID: ${board.id}) by ID key "${normalizedGiftId}"`);
                  break;
                }
            
            // Try exact match by name
                if (mappings[normalizedGiftName]) {
                  giftMapping = mappings[normalizedGiftName];
                  resolvedBoardId = board.id;
                  this.logger.info(`[PLINKO] Found gift mapping in board "${board.name}" (ID: ${board.id}) by name key "${normalizedGiftName}"`);
                  break;
                }
            
            // Try case-insensitive match by name
            for (const [key, value] of Object.entries(mappings)) {
              if (key.toLowerCase() === lowerGiftName) {
                giftMapping = value;
                resolvedBoardId = board.id;
                this.logger.info(`[PLINKO] Matched gift "${normalizedGiftName}" in board "${board.name}" (ID: ${board.id}) via case-insensitive lookup (key: "${key}")`);
                break;
              }
            }
            
            if (giftMapping) break;
          } catch (e) {
            this.logger.error(`[PLINKO] Failed to process gift_mappings for board ${board.id}: ${e.message}`);
          }
        }
        
        // If still no mapping found, decide based on useDefaults flag
        if (!giftMapping) {
          const enabledBoards = boards.filter(b => b.enabled);
          if (useDefaults && enabledBoards.length > 0 && (normalizedGiftName || normalizedGiftId)) {
            // Trigger-Tab-only configuration: no board-specific mapping, but the gift IS
            // configured as a Plinko trigger. Spawn with safe defaults so the user sees balls.
            giftMapping = { betAmount: 100, ballType: 'standard' };
            this.logger.info(`[PLINKO] Gift "${normalizedGiftName || normalizedGiftId}" has no board-specific mapping - using defaults (betAmount=100, ballType=standard) [source: Trigger-Tab fallback]`);
          } else {
            const boardNames = enabledBoards.map(b => b.name).join(', ') || 'none';
            const boardContext = boardId !== null ? ` (targeted board ID: ${boardId})` : '';
            this.logger.warn(`[PLINKO] Gift "${normalizedGiftName}" (ID: ${normalizedGiftId || 'unknown'}) triggered Plinko but no mapping found in any board${boardContext}. Available enabled boards: ${boardNames}`);
            return { success: false, error: 'No gift mapping found' };
          }
        }
      }

      const betAmount = giftMapping.betAmount || 100; // Default bet if not configured
      const ballType = giftMapping.ballType || 'standard'; // 'standard' or 'golden'
      const ballCount = Math.min(Math.max(giftMapping.ballCount || 1, 1), 50);
      const boardContext = resolvedBoardId !== null ? ` [board ID: ${resolvedBoardId}]` : '';

      let result;
      if (ballCount > 1) {
        this.logger.info(`[PLINKO] Spawning ${ballCount} balls for ${username}: betAmount=${betAmount}${boardContext}`);
        result = await this.plinkoGame.spawnBalls(
          username,
          nickname,
          profilePictureUrl || '',
          betAmount,
          ballCount,
          { preferredColor: null, boardId: resolvedBoardId }
        );
      } else {
        this.logger.info(`[PLINKO] Spawning ball for ${username}: betAmount=${betAmount}, ballType=${ballType}${boardContext}`);
        result = await this.plinkoGame.spawnBall(
          username,
          nickname,
          profilePictureUrl || '',
          betAmount,
          ballType,
          { boardId: resolvedBoardId }
        );
      }

      if (!result.success) {
        this.logger.error(`[PLINKO] Failed to spawn ball for ${username}: ${result.error}`);
      } else {
        this.logger.info(`[PLINKO] ✅ Ball spawned successfully for ${username}`);
      }

      return result;
    } catch (error) {
      this.logger.error(`[PLINKO] Error handling gift trigger: ${error.message}`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if game type should use unified queue
   * @param {string} gameType - Game type (connect4, chess, plinko, wheel, etc.)
   * @returns {boolean} True if should use unified queue
   */
  shouldUseUnifiedQueue(gameType) {
    return false;
  }

  /**
   * Handle game start request - queue if game is active, start immediately otherwise
   */
  handleGameStart(gameType, viewerUsername, viewerNickname, triggerType, triggerValue, giftPictureUrl = null) {
    this._ensureDatabaseInitialized();

    if (!['connect4', 'chess'].includes(gameType)) {
      return { success: false, error: 'unsupported_game_type' };
    }

    const lockoutRejection = this._rejectIfGameLocked(viewerUsername, viewerNickname, gameType);
    if (lockoutRejection) {
      return lockoutRejection;
    }

    if (this.interactiveController) {
      return this.interactiveController.startMatch({
        gameType,
        viewerId: viewerUsername,
        viewerDisplayName: viewerNickname,
        triggerType,
        triggerValue,
        giftPictureUrl
      });
    }

    // Check if unified queue is available for this game type
    const useUnifiedQueue = this.shouldUseUnifiedQueue(gameType);
    
    if (useUnifiedQueue) {
      // Use unified queue for Connect4 and Chess
      const shouldQueue = this.unifiedQueue.shouldQueue() || this.activeSessions.size > 0 || this.pendingChallenges.size > 0;
      
      if (shouldQueue) {
        // Add to unified queue
        const gameData = {
          gameType,
          viewerUsername,
          viewerNickname,
          triggerType,
          triggerValue,
          giftPictureUrl
        };
        
        const result = gameType === 'connect4'
          ? this.unifiedQueue.queueConnect4(gameData)
          : this.unifiedQueue.queueChess(gameData);

        if (!result.queued) {
          return {
            queued: false,
            queueType: 'unified',
            position: 0,
            error: result.error || 'Queue rejected request'
          };
        }

        this.logger.info(`Game queued in unified queue: ${viewerUsername} for ${gameType}`);
        return { queued: true, queueType: 'unified', position: result.position };
      }
    }

    // Check if player already has an active game
    const activeSession = this.db.getActiveSessionForPlayer(viewerUsername);
    if (activeSession) {
      this.logger.info(`Player ${viewerUsername} already has an active game`);
      return { success: false, error: 'active_session' };
    }

    // Get configuration
    const config = this._getConfigWithDefaults(gameType, this.db.getGameConfig(gameType));

    // If challenge screen is disabled, start game directly
    if (!config.showChallengeScreen) {
      this.startGame(gameType, viewerUsername, viewerNickname, triggerType, triggerValue);
      return { success: true, started: true };
    }

    // Create a pending challenge
    const sessionId = this.createPendingChallenge(
      gameType, 
      viewerUsername, 
      viewerNickname, 
      triggerValue,
      giftPictureUrl,
      config,
      triggerType
    );

    this.logger.info(`Challenge created #${sessionId}: ${viewerUsername} challenges with ${triggerValue}`);
    return { success: true, challenge: true, sessionId };
  }

  /**
   * Start game from unified queue (called by UnifiedQueueManager)
   * This bypasses queue checking since the game is already dequeued
   */
  async startGameFromQueue(gameType, viewerUsername, viewerNickname, triggerType, triggerValue, giftPictureUrl = null) {
    try {
      this._ensureDatabaseInitialized();

      const lockoutRejection = this._rejectIfGameLocked(viewerUsername, viewerNickname, gameType);
      if (lockoutRejection) {
        if (this.unifiedQueue) {
          this.unifiedQueue.completeProcessing();
        }
        return { ...lockoutRejection, completed: true };
      }

      if (this.interactiveController) {
        return this.interactiveController.startMatch({
          gameType,
          viewerId: viewerUsername,
          viewerDisplayName: viewerNickname,
          triggerType,
          triggerValue,
          giftPictureUrl
        });
      }

      this.logger.info(`🎮 [GAME ENGINE] Starting ${gameType} from unified queue for ${viewerUsername}`);
      // Check if player already has an active game
      const activeSession = this.db.getActiveSessionForPlayer(viewerUsername);
      if (activeSession) {
        this.logger.warn(`Player ${viewerUsername} already has an active game, completing queue processing`);
        if (this.unifiedQueue) {
          this.unifiedQueue.completeProcessing();
        }
        return {
          success: false,
          completed: true,
          error: 'Player already has active game'
        };
      }

      // Get configuration
      const config = this.db.getGameConfig(gameType) || this.defaultConfigs[gameType];

      // If challenge screen is disabled, start game directly
      if (!config.showChallengeScreen) {
        const result = this.startGame(gameType, viewerUsername, viewerNickname, triggerType, triggerValue);
        return result || { success: true, started: true };
      }

      // Create a pending challenge
      const sessionId = this.createPendingChallenge(
        gameType, 
        viewerUsername, 
        viewerNickname, 
        triggerValue,
        giftPictureUrl,
        config,
        triggerType
      );

      this.logger.info(`Challenge created #${sessionId}: ${viewerUsername} challenges with ${triggerValue}`);
      return { success: true, challenge: true, sessionId };
    } catch (error) {
      this.logger.error(`Error starting game from queue: ${error.message}`);
      if (this.unifiedQueue) {
        this.unifiedQueue.completeProcessing();
      }
      return {
        success: false,
        completed: true,
        error: error.message
      };
    }
  }

  /**
   * Handle chat command (fallback mode when GCCE is not available)
   * This also catches commands that GCCE might miss
   */
  handleChatCommand(data) {
    const {
      uniqueId, userId, comment, message: messageField, nickname, profilePictureUrl = '',
      isModerator = false, isSubscriber = false, teamMemberLevel = 0
    } = data;
    const message = (comment || messageField || '').trim();
    const viewerId = uniqueId || userId || data.username;
    const viewerNickname = nickname || data.username || 'Anonymous';
    // User role flags – used by slot cooldown adjuster
    const userRoles = { isModerator, isSubscriber, teamMemberLevel };
    const c4ChatCommand = this.getConnect4StartCommandName();
    const arenaAbilityMatch = message.match(/^!(boost|shield|schild|bomb)$/i);
    if (arenaAbilityMatch) {
      const ability = arenaAbilityMatch[1].toLowerCase() === 'schild' ? 'shield' : arenaAbilityMatch[1].toLowerCase();
      this.handleArenaAbilityCommand(ability, {
        username: viewerNickname, userId: viewerId, nickname: viewerNickname, rawData: data, profilePictureUrl
      });
      return;
    }

    // Matchmaking start aliases intentionally run before generic trigger and
    // GCCE fallback routing. This keeps `connect4`/`4gewinnt` reliable even
    // when another plugin owns a similarly named database trigger.
    if (this._isConnect4StartAlias(message)) {
      this.handleConnect4StartCommand([], {
        username: viewerNickname,
        userId: viewerId,
        nickname: viewerNickname,
        profilePictureUrl,
        rawData: data
      });
      return;
    }

    const arenaMatch = message.match(/^!arena\s+(.+)$/i);
    if (arenaMatch) {
      this.handleArenaCommand(arenaMatch[1].trim().split(/\s+/), {
        username: viewerNickname,
        userId: viewerId,
        nickname: viewerNickname,
        rawData: data,
        profilePictureUrl
      });
      return;
    }

    // Check for wheel chat commands (custom commands per wheel)
    // These can be with or without / prefix
    const cleanCommand = this.normalizeChatCommandName(message);
    const matchingWheel = this.wheelGame.findWheelByChatCommand(cleanCommand);
    if (matchingWheel) {
      this.logger.debug(`Wheel chat command matched: "${cleanCommand}" -> Wheel "${matchingWheel.name}" (ID: ${matchingWheel.id})`);
      this.handleWheelGiftTrigger(viewerId, viewerNickname, profilePictureUrl, `Command: ${cleanCommand}`, matchingWheel.id);
      return;
    }

    // Check for slot machine chat commands (custom commands per machine)
    if (this.slotGame) {
      const matchingSlotMachine = this.slotGame.findMachineByChatCommand(cleanCommand);
      if (matchingSlotMachine) {
        this.logger.debug(`Slot chat command matched: "${cleanCommand}" -> Slot "${matchingSlotMachine.name}" (ID: ${matchingSlotMachine.id})`);
        const lockoutRejection = this._rejectIfGameLocked(viewerId, viewerNickname, 'slot');
        if (lockoutRejection) {
          return;
        }
        this.slotGame.triggerSpinFromChat(viewerId, viewerNickname, profilePictureUrl, cleanCommand, matchingSlotMachine.id, userRoles)
          .then(result => {
            if (!result.success) {
              this.logger.debug(`[SLOT] Chat spin result for ${viewerId}: ${result.error}`);
            }
          })
          .catch(err => this.logger.error(`[SLOT] Chat trigger error: ${err.message}`));
        return;
      }
    }

    // Check if this chat message triggers a game from database triggers
    // Support multiple formats: exact match, /command, !command
    const triggers = this.db.getTriggers();
    const messageLower = message.toLowerCase();
    
    const matchingTrigger = triggers.find(t => {
      if (t.trigger_type !== 'command') {
        return false;
      }
      
      const triggerValue = t.trigger_value.toLowerCase();
      const triggerWithoutPrefix = triggerValue.replace(/^[!/]/, '');
      const messageWithoutPrefix = messageLower.replace(/^[!/]/, '');
      
      // Check for exact match or match without prefixes
      return messageLower === triggerValue ||
             messageWithoutPrefix === triggerWithoutPrefix ||
             messageLower === `/${triggerWithoutPrefix}` ||
             messageLower === `!${triggerWithoutPrefix}`;
    });

    if (matchingTrigger) {
      // Chat command trigger found - start or queue game
      this.logger.debug(`💬 [GAME ENGINE] DB trigger matched: "${message}" -> ${matchingTrigger.game_type} (trigger: ${matchingTrigger.trigger_value})`);
      this.handleGameStart(matchingTrigger.game_type, viewerId, viewerNickname, 'command', matchingTrigger.trigger_value);
      return;
    }

    // Check for Plinko command with ! prefix (fallback for users expecting !plinko)
    // Patterns: !plinko <amount>, !plinko max
    const plinkoMatch = message.match(/^!plinko\s+(max|\d+)$/i);
    if (plinkoMatch) {
      this.handlePlinkoChatCommand(viewerId, viewerNickname, data, plinkoMatch[1]);
      return;
    }

    // Skip if GCCE is handling commands (GCCE uses / prefix)
    // Only process non-GCCE formatted commands here
    if (message.startsWith('/')) {
      // If GCCE is registered, it will handle /c4 commands
      // Only process /c4 here if GCCE is NOT registered
      if (this.gcceCommandsRegistered) {
        return; // Let GCCE handle it
      }
      
      // GCCE fallback: handle /c4 and custom start command
      const c4Match = message.match(/^\/c4\s+([a-g])$/i);
      if (c4Match) {
        const column = c4Match[1].toUpperCase();
        if (this._isHostChatEvent(data)) {
          this.handleInteractiveHostMove('connect4', { column }, this._getChatMoveIdentity(data));
        } else {
          this.handleViewerMove(viewerId, viewerNickname, 'connect4', column, this._getChatMoveIdentity(data));
        }
        return;
      }
      
      // Match the configured chat command dynamically (escape special regex chars for security)
      const escapedCommand = c4ChatCommand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const c4StartRegex = new RegExp(`^\/${escapedCommand}$`, 'i');
      const c4StartMatch = message.match(c4StartRegex);
      if (c4StartMatch) {
        // Handle custom start command - start a new game
        this.handleConnect4StartCommand([], {
          username: viewerNickname,
          userId: viewerId,
          nickname: viewerNickname,
          profilePictureUrl,
          rawData: data
        });
        return;
      }
      
      // GCCE fallback: handle /plinko commands
      const plinkoSlashMatch = message.match(/^\/plinko\s+(max|\d+)$/i);
      if (plinkoSlashMatch) {
        this.handlePlinkoChatCommand(viewerId, viewerNickname, data, plinkoSlashMatch[1]);
        return;
      }

      const arenaSlashMatch = message.match(/^\/arena\s+(.+)$/i);
      if (arenaSlashMatch && !this.gcceCommandsRegistered) {
        this.handleArenaCommand(arenaSlashMatch[1].trim().split(/\s+/), {
          username: viewerNickname,
          userId: viewerId,
          nickname: viewerNickname,
          rawData: data,
          profilePictureUrl
        });
        return;
      }
    }

    // Check for Connect4 moves (simple patterns for non-GCCE mode)
    // Patterns: !c4 A, !c4A, c4 A, c4A, just A (single letter).
    // A leading ! on a bare letter is host-only, so it does not take over
    // potential viewer commands owned by another plugin.
    const isHostChatEvent = this._isHostChatEvent(data);
    const match = messageLower.match(/^!?c4\s*([a-g])$/i) ||
      messageLower.match(/^([a-g])$/i) ||
      (isHostChatEvent ? messageLower.match(/^!([a-g])$/i) : null);
    
    if (match) {
      const column = match[1].toUpperCase();
      if (isHostChatEvent) {
        this.handleInteractiveHostMove('connect4', { column }, this._getChatMoveIdentity(data));
        return;
      }
      this.handleViewerMove(viewerId, viewerNickname, 'connect4', column, this._getChatMoveIdentity(data));
    }
  }

  /**
   * Helper method to handle Plinko chat command from both ! and / prefixes
   * @private
   */
  handlePlinkoChatCommand(uniqueId, nickname, data, betArg) {
    const profilePictureUrl = data.profilePictureUrl || '';
    // Call the Plinko command handler
    this.handlePlinkoCommand([betArg], {
      username: uniqueId,
      userId: uniqueId,
      nickname: nickname,
      profilePictureUrl: profilePictureUrl,
      rawData: data
    }).then(result => {
      this.logger.debug(`Plinko command result: ${JSON.stringify(result)}`);
    }).catch(error => {
      this.logger.error(`Plinko command error: ${error.message}`);
    });
  }

  async handleArenaCommand(args, context = {}) {
    try {
      if (!this.arenaGame) {
        return {
          success: false,
          message: 'Live Arena is not available.',
          displayOverlay: true
        };
      }

      const userId = context.userId || context.username;
      const nickname = context.nickname || context.username || userId;
      const rawData = context.rawData || {};
      const result = this.arenaGame.handleChatStrategy({
        ...rawData,
        uniqueId: userId,
        userId,
        username: userId,
        nickname,
        profilePictureUrl: context.profilePictureUrl || rawData.profilePictureUrl || ''
      }, args);

      return {
        success: result.success,
        message: result.message || result.error || this._arenaCommandMessage(result),
        displayOverlay: true,
        result
      };
    } catch (error) {
      this.logger.error(`Error in handleArenaCommand: ${error.message}`);
      return {
        success: false,
        error: 'An error occurred',
        message: 'Failed to update Arena strategy'
      };
    }
  }

  async handleArenaAbilityCommand(ability, context = {}) {
    if (!this.arenaGame) return { success: false, message: 'Live Arena is not available.' };
    const userId = context.userId || context.username;
    const result = this.arenaGame.handleAbilityCommand({
      ...(context.rawData || {}), uniqueId: userId, userId, username: userId,
      nickname: context.nickname || context.username || userId,
      profilePictureUrl: context.profilePictureUrl || context.rawData?.profilePictureUrl || ''
    }, ability);
    return { success: result.success, message: result.error || `Arena ${ability} activated.`, displayOverlay: true, result };
  }

  _arenaCommandMessage(result) {
    if (!result || !result.success) return 'Arena command failed.';
    if (result.status && result.message) return result.message;
    if (result.targetUsername) return `Arena target set: ${result.targetUsername}`;
    if (result.activeRole) return `Arena role set: ${result.activeRole}`;
    if (result.strategy) return `Arena strategy set: ${result.strategy}`;
    return 'Arena strategy updated.';
  }

  /**
   * Handle Connect4 command from GCCE
   */
  async handleConnect4Command(args, context) {
    try {
      // Use userId for player identification (unique TikTok ID)
      // Use username (which is actually nickname in GCCE context) for display
      const userId = context.userId || context.username;
      const nickname = context.username || context.nickname || userId;
      
      if (!args || args.length === 0) {
        return {
          success: false,
          error: 'Please specify a column (A-G)',
          message: 'Usage: /c4 <A-G>',
          displayOverlay: true
        };
      }

      const column = args[0].toUpperCase();
      
      // Validate column
      if (!/^[A-G]$/.test(column)) {
        return {
          success: false,
          error: 'Invalid column',
          message: 'Please use columns A-G',
          displayOverlay: true
        };
      }

      if (this._isHostChatEvent(context.rawData || context)) {
        return this.handleInteractiveHostMove('connect4', { column }, this._getChatMoveIdentity(context.rawData || context));
      }

      return this.handleViewerMove(
        userId,
        nickname,
        'connect4',
        column,
        this._getChatMoveIdentity(context.rawData || context)
      );
    } catch (error) {
      this.logger.error(`Error in handleConnect4Command: ${error.message}`);
      return {
        success: false,
        error: 'An error occurred',
        message: 'Failed to process move'
      };
    }
  }

  /**
   * Handle Connect4 start command from GCCE
   */
  async handleConnect4StartCommand(args, context) {
    try {
      const userId = context.userId || context.username;
      const nickname = context.nickname || context.username || userId;
      const rawData = context.rawData || context;
      if (!userId) {
        return { success: false, error: 'viewer_identity_required', message: 'Could not identify the player.', displayOverlay: true };
      }
      if (this._isHostChatEvent(rawData)) {
        return { success: false, error: 'host_cannot_challenge', message: 'The streamer cannot join a viewer challenge.', displayOverlay: true };
      }
      if (this._isDuplicateConnect4MatchmakingEvent(rawData)) {
        return { success: true, duplicate: true, displayOverlay: true };
      }
      const lockoutRejection = this._rejectIfGameLocked(userId, nickname, 'connect4');
      if (lockoutRejection) return lockoutRejection;

      const controller = this.interactiveController;
      if (!controller) {
        return {
          success: false,
          error: 'interactive_controller_unavailable',
          message: 'Connect4 matchmaking is unavailable. Please try again shortly.',
          displayOverlay: true
        };
      }

      const avatarSource = this._getAvatarProxyPath(context.profilePictureUrl || rawData.profilePictureUrl || '');
      const result = controller.startOrJoinConnect4Matchmaking({
        participantId: userId,
        participantDisplayName: nickname,
        participantAvatarSource: avatarSource,
        triggerType: 'matchmaking_accept',
        triggerValue: 'connect4'
      });
      if (!result?.success) {
        return {
          success: false,
          error: result?.error || 'game_start_failed',
          message: result?.error === 'active_session'
            ? 'You already have an interactive game in progress.'
            : result?.error === 'interactive_session_limit'
              ? 'The interactive game limit is currently reached.'
                : result?.error === 'game_lockout'
                  ? (result.message || 'You are locked out from games after timing out.')
                  : 'Could not start the challenge.',
          displayOverlay: true
        };
      }
      if (result.action === 'matched') {
        this._clearConnect4MatchmakingExpiry(result.challenge?.challengeId);
        return {
          ...result,
          accepted: true,
          message: 'A viewer Connect4 game started.',
          displayOverlay: true
        };
      }
      if (result.action === 'opened') {
        this._scheduleConnect4MatchmakingExpiry(result.challenge);
        return {
          ...result,
          challenge: true,
          challengeId: result.challenge?.challengeId,
          message: `${nickname} opened a 30-second Connect4 viewer search.`,
          displayOverlay: true
        };
      }
      return { ...result, displayOverlay: true };
    } catch (error) {
      this.logger.error(`Error in handleConnect4StartCommand: ${error.message}`);
      return {
        success: false,
        error: 'An error occurred',
        message: 'Failed to start game'
      };
    }
  }

  /**
   * Start a new game
   */
  startGame(gameType, viewerUsername, viewerNickname, triggerType, triggerValue, timeControl = null) {
    this._ensureDatabaseInitialized();

    if (gameType !== 'connect4' && gameType !== 'chess') {
      this.logger.warn(`Unsupported game type: ${gameType}`);
      return { success: false, error: `Unsupported game type: ${gameType}` };
    }

    const lockoutRejection = this._rejectIfGameLocked(viewerUsername, viewerNickname, gameType);
    if (lockoutRejection) {
      return lockoutRejection;
    }

    if (this.interactiveController) {
      return this.interactiveController.startMatch({
        gameType,
        viewerId: viewerUsername,
        viewerDisplayName: viewerNickname,
        triggerType,
        triggerValue,
        timeControl
      });
    }

    // Get configuration
    const config = this.db.getGameConfig(gameType) || this.defaultConfigs[gameType];

    // For chess, determine sides (white/black)
    if (gameType === 'chess') {
      return this.startChessGame(viewerUsername, viewerNickname, triggerType, triggerValue, timeControl, config);
    }

    // Connect4 logic (existing)
    // Determine roles (streamer is always one player)
    const streamerRole = config.streamerRole || 'player2';
    const viewerRole = streamerRole === 'player1' ? 'player2' : 'player1';

    // Create database session
    const sessionId = this.db.createSession(
      gameType,
      streamerRole === 'player1' ? 'streamer' : viewerUsername,
      streamerRole === 'player1' ? 'streamer' : 'viewer',
      triggerType,
      triggerValue
    );

    // Add player 2
    this.db.addPlayer2(
      sessionId,
      streamerRole === 'player2' ? 'streamer' : viewerUsername,
      streamerRole === 'player2' ? 'streamer' : 'viewer'
    );

    // Create game instance
    const player1 = {
      username: streamerRole === 'player1' ? 'streamer' : viewerUsername,
      role: streamerRole === 'player1' ? 'streamer' : 'viewer',
      color: config.player1Color,
      nickname: streamerRole === 'player1' ? 'Streamer' : viewerNickname
    };

    const player2 = {
      username: streamerRole === 'player2' ? 'streamer' : viewerUsername,
      role: streamerRole === 'player2' ? 'streamer' : 'viewer',
      color: config.player2Color,
      nickname: streamerRole === 'player2' ? 'Streamer' : viewerNickname
    };

    const game = new Connect4Game(sessionId, player1, player2, this.logger);
    this.activeSessions.set(sessionId, game);

    // Check if should use unified overlay
    const useUnified = this.unifiedQueue ? this.unifiedQueue.shouldUseUnifiedOverlay('connect4') : false;
    
    // Emit game-switched event for unified overlay
    if (useUnified && this.unifiedQueue) {
      this.unifiedQueue.switchGame('connect4', sessionId, config);
    }

    // Emit game started event (backwards compatibility)
    this.io.emit('game-engine:game-started', {
      sessionId,
      gameType,
      state: game.getState(),
      config,
      useUnified
    });

    this.logger.info(`Started ${gameType} game #${sessionId}: ${player1.username} vs ${player2.username}`);
    return { success: true, started: true, sessionId };
  }

  /**
   * Start a chess game
   */
  startChessGame(viewerUsername, viewerNickname, triggerType, triggerValue, timeControl, config) {
    config = this._getConfigWithDefaults('chess', config);

    // Determine sides (white/black)
    const streamerRole = config.streamerRole || 'random';
    let streamerSide, viewerSide;
    
    if (streamerRole === 'random') {
      streamerSide = Math.random() < 0.5 ? 'white' : 'black';
      viewerSide = streamerSide === 'white' ? 'black' : 'white';
    } else if (streamerRole === 'white' || streamerRole === 'black') {
      streamerSide = streamerRole;
      viewerSide = streamerRole === 'white' ? 'black' : 'white';
    } else {
      // Default to random
      streamerSide = Math.random() < 0.5 ? 'white' : 'black';
      viewerSide = streamerSide === 'white' ? 'black' : 'white';
    }

    // Use provided time control or default
    const gameTimeControl = timeControl || config.defaultTimeControl || '5+0';

    // Create database session
    const sessionId = this.db.createSession(
      'chess',
      streamerSide === 'white' ? 'streamer' : viewerUsername,
      streamerSide === 'white' ? 'streamer' : 'viewer',
      triggerType,
      triggerValue
    );

    // Add player 2
    this.db.addPlayer2(
      sessionId,
      streamerSide === 'black' ? 'streamer' : viewerUsername,
      streamerSide === 'black' ? 'streamer' : 'viewer'
    );

    // Create player objects with sides
    const whitePlayer = {
      username: streamerSide === 'white' ? 'streamer' : viewerUsername,
      role: streamerSide === 'white' ? 'streamer' : 'viewer',
      color: config.whiteColor,
      nickname: streamerSide === 'white' ? 'Streamer' : viewerNickname,
      side: 'white'
    };

    const blackPlayer = {
      username: streamerSide === 'black' ? 'streamer' : viewerUsername,
      role: streamerSide === 'black' ? 'streamer' : 'viewer',
      color: config.blackColor,
      nickname: streamerSide === 'black' ? 'Streamer' : viewerNickname,
      side: 'black'
    };

    return this._startChessMatch(sessionId, whitePlayer, blackPlayer, config, gameTimeControl, viewerSide, 'chess');
  }

  /**
   * Initialize and wire a chess game instance
   */
  _startChessMatch(sessionId, whitePlayer, blackPlayer, config, gameTimeControl, viewerSide = 'white', gameType = 'chess') {
    const game = new ChessGame(sessionId, whitePlayer, blackPlayer, gameTimeControl, this.logger);
    this.activeSessions.set(sessionId, game);

    // Start the game timer
    game.startTimer();

    // Set up timer update interval with adaptive timing (Bug #7 fix)
    // Use 100ms when time is critical (< 10s), otherwise 500ms to reduce flooding
    let updateCounter = 0;
    let currentInterval = 500; // Start with 500ms
    let timerInterval;
    
    const updateTimerInterval = () => {
      try {
        if (game.status !== 'active') {
          if (timerInterval) clearInterval(timerInterval);
          return;
        }
        
        game.updateTimer();

        if (game.status === 'completed' && game.winReason === 'timeout') {
          if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
          }
          game.timerInterval = null;

          const timeoutResult = {
            gameOver: true,
            winner: game.winner,
            winReason: game.winReason,
            fen: game.getFEN ? game.getFEN() : undefined,
            pgn: game.getPGN ? game.getPGN() : undefined,
            capturedPieces: game.getCapturedPieces ? game.getCapturedPieces() : undefined,
            timeout: true
          };

          try {
            if (typeof this.db.updateSession === 'function') {
              this.db.updateSession(sessionId, {
                final_pgn: timeoutResult.pgn,
                final_fen: timeoutResult.fen,
                win_reason: timeoutResult.winReason
              });
            }
          } catch (error) {
            this.logger.warn(`Failed to persist chess timeout state for session ${sessionId}: ${error.message}`);
          }

          this.io.emit('game-engine:timer-update', {
            sessionId,
            timers: game.timers,
            currentPlayer: game.currentPlayer
          });

          this.endGame(sessionId, game.winner, game.winReason, timeoutResult);
          return;
        }
        
        // Determine if we need faster updates (when time is low)
        const whiteTimeLow = game.timers.white < 10000; // Less than 10 seconds
        const blackTimeLow = game.timers.black < 10000;
        const needFastUpdates = whiteTimeLow || blackTimeLow;
        
        // Adaptive interval: 100ms when time is critical, 500ms otherwise
        const desiredInterval = needFastUpdates ? 100 : 500;
        
        // If interval needs to change, recreate the timer
        if (desiredInterval !== currentInterval) {
          clearInterval(timerInterval);
          currentInterval = desiredInterval;
          updateCounter = 0;
          timerInterval = setInterval(updateTimerInterval, currentInterval);
          if (typeof timerInterval.unref === 'function') {
            timerInterval.unref();
          }
          game.timerInterval = timerInterval;
          this.logger.debug(`Chess timer interval changed to ${currentInterval}ms for session ${sessionId}`);
        }
        
        updateCounter++;
        
        // Emit timer update every 500ms (5 updates at 100ms, 1 update at 500ms)
        const emitThreshold = currentInterval === 100 ? 5 : 1;
        if (updateCounter >= emitThreshold) {
          updateCounter = 0;
          this.io.emit('game-engine:timer-update', {
            sessionId,
            timers: game.timers,
            currentPlayer: game.currentPlayer
          });
        }
      } catch (error) {
        this.logger.error(`Error in chess timer interval for session ${sessionId}: ${error.message}`);
        // Clean up on error
        try {
          if (timerInterval) clearInterval(timerInterval);
          if (game) game.timerInterval = null;
        } catch (cleanupError) {
          this.logger.error(`Error during timer cleanup: ${cleanupError.message}`);
        }
      }
    };
    
    // Start the timer
    timerInterval = setInterval(updateTimerInterval, currentInterval);
    if (typeof timerInterval.unref === 'function') {
      timerInterval.unref();
    }

    // Store interval reference for cleanup
    game.timerInterval = timerInterval;

    // Check if should use unified overlay
    const useUnified = this.unifiedQueue ? this.unifiedQueue.shouldUseUnifiedOverlay(gameType) : false;
    
    // Emit game-switched event for unified overlay
    if (useUnified && this.unifiedQueue) {
      this.unifiedQueue.switchGame(gameType, sessionId, config);
    }

    // Emit game started event (backwards compatibility)
    this.io.emit('game-engine:game-started', {
      sessionId,
      gameType,
      state: game.getState(),
      config,
      timeControl: gameTimeControl,
      useUnified
    });

    this.logger.info(`Started chess game #${sessionId}: ${whitePlayer.username} (white) vs ${blackPlayer.username} (black) - Time control: ${gameTimeControl} - viewer side: ${viewerSide}`);
    return { success: true, started: true, sessionId };
  }

  /**
   * Handle viewer move
   */
  handleViewerMove(username, nickname, gameType, column, moveIdentity = null) {
    if (this.interactiveController) {
      const result = this.interactiveController.applyViewerMove({
        viewerId: username,
        gameType,
        move: { column },
        moveIdentity
      });
      const messages = {
        no_active_session: 'You do not have an active game.',
        wrong_game_type: 'Use the move command for your active game.',
        not_viewer_turn: 'It is not your turn!',
        viewer_timeout: 'Your response time expired. You lost the game.'
      };
      return {
        ...result,
        message: result.success ? 'Move made successfully!' : messages[result.error] || result.error,
        displayOverlay: true
      };
    }
    // Find active game for this viewer
    const activeSession = this.db.getActiveSessionForPlayer(username);
    
    if (!activeSession) {
      return {
        success: false,
        message: 'You don\'t have an active game. Send a gift to start!',
        displayOverlay: true
      };
    }

    if (activeSession.game_type !== gameType) {
      const displayGameType = gameType === 'connect4' ? 'Connect4' : gameType;
      return {
        success: false,
        message: `This is not a ${displayGameType} game. Use the appropriate command for this game.`,
        displayOverlay: true
      };
    }

    const game = this.activeSessions.get(activeSession.id);
    
    if (!game) {
      return {
        success: false,
        message: 'Game session not found',
        displayOverlay: true
      };
    }

    // Check if it's the viewer's turn
    const currentPlayerInfo = game.getCurrentPlayerInfo();
    if (currentPlayerInfo.username !== username) {
      return {
        success: false,
        message: 'It\'s not your turn!',
        displayOverlay: true
      };
    }

    // Make the move
    const result = game.dropPiece(column);
    
    if (!result.success) {
      return {
        success: false,
        message: result.error,
        displayOverlay: true
      };
    }

    // Save move to database
    this.db.saveMove(activeSession.id, username, result.move, result.move.moveNumber);

    // Emit move event
    this.io.emit('game-engine:move-made', {
      sessionId: activeSession.id,
      gameType,
      move: result.move,
      state: game.getState()
    });

    // Check if game is over
    if (result.gameOver) {
      this.endGame(activeSession.id, result.winner, result.draw ? 'draw' : 'win', result);
    }

    return {
      success: true,
      message: result.gameOver ? 
        (result.draw ? 'Game ended in a draw!' : 'You won!') : 
        'Move made successfully!',
      displayOverlay: true
    };
  }

  /**
   * Apply a live host move using the currently displayed interactive session.
   * Chat events do not include the revision fields required by the controller,
   * so they are captured atomically from the display before applying the move.
   */
  handleInteractiveHostMove(gameType, move, moveIdentity = null) {
    if (!this.interactiveController) {
      return {
        success: false,
        error: 'interactive_controller_unavailable',
        displayOverlay: true
      };
    }

    const display = this.interactiveController.getState()?.display;
    if (!display || display.displaySessionId == null || display.gameType !== gameType) {
      return {
        success: false,
        error: 'no_active_host_session',
        displayOverlay: true
      };
    }

    const envelope = {
      sessionId: display.displaySessionId,
      gameType,
      sessionRevision: display.sessionRevision,
      displayRevision: display.displayRevision,
      move
    };
    if (moveIdentity) envelope.moveIdentity = moveIdentity;
    const result = this.interactiveController.applyHostMove(envelope);

    if (!result.success) {
      this.io.emit('game-engine:error', {
        sessionId: display.displaySessionId,
        error: result.error
      });
    }

    return {
      ...result,
      message: result.success ? 'Move made successfully!' : result.error,
      displayOverlay: true
    };
  }

  /**
   * Handle streamer move
   */
  handleStreamerMove(data) {
    if (this.interactiveController) {
      const display = this.interactiveController.getState().display;
      const envelope = data?.gameType && data?.sessionRevision != null && data?.displayRevision != null
        ? {
          sessionId: data.sessionId,
          gameType: data.gameType,
          sessionRevision: data.sessionRevision,
          displayRevision: data.displayRevision,
          move: data.move
        }
        : {
          sessionId: data?.sessionId,
          gameType: display.gameType,
          sessionRevision: display.sessionRevision,
          displayRevision: display.displayRevision,
          move: display.gameType === 'chess'
            ? { move: data?.move }
            : { column: data?.column }
        };
      const result = this.interactiveController.applyHostMove(envelope);
      if (!result.success) {
        this.io.emit('game-engine:error', {
          sessionId: envelope.sessionId,
          error: result.error
        });
      }
      return result;
    }
    const { sessionId, column } = data;
    
    const session = this.db.getSession(sessionId);
    if (!session) {
      this.logger.warn(`Session ${sessionId} not found`);
      return;
    }

    const game = this.activeSessions.get(sessionId);
    if (!game) {
      this.logger.warn(`Game instance ${sessionId} not found`);
      return;
    }

    // Check if it's the streamer's turn
    const currentPlayerInfo = game.getCurrentPlayerInfo();
    if (currentPlayerInfo.role !== 'streamer') {
      this.io.emit('game-engine:error', {
        sessionId,
        error: 'It\'s not your turn!'
      });
      return;
    }

    // Make the move
    const result = game.dropPiece(column);
    
    if (!result.success) {
      this.io.emit('game-engine:error', {
        sessionId,
        error: result.error
      });
      return;
    }

    // Save move to database
    this.db.saveMove(sessionId, 'streamer', result.move, result.move.moveNumber);

    // Emit move event
    this.io.emit('game-engine:move-made', {
      sessionId,
      gameType: 'connect4',
      move: result.move,
      state: game.getState()
    });

    // Check if game is over
    if (result.gameOver) {
      this.endGame(sessionId, result.winner, result.draw ? 'draw' : 'win', result);
    }
  }

  /**
   * End a game and award XP
   */
  endGame(sessionId, winner, reason, gameResult = null, options = {}) {
    this._ensureDatabaseInitialized();

    // Bug #5 fix - Wrap DB operations in try-catch
    let session, config, xpRewards;
    try {
      session = this.db.getSession(sessionId);
    } catch (error) {
      this.logger.error(`Failed to get session ${sessionId}: ${error.message}`);
      return;
    }

    if (!session) {
      return;
    }

    const game = this.activeSessions.get(sessionId);
    if (!game) {
      return;
    }

    // Get configuration with error handling
    try {
      config = this.db.getGameConfig(session.game_type) || this.defaultConfigs[session.game_type];
    } catch (error) {
      this.logger.error(`Failed to get config for ${session.game_type}: ${error.message}`);
      config = this.defaultConfigs[session.game_type] || {};
    }
    
    // Get XP rewards with error handling
    try {
      xpRewards = this.db.getXPRewards(session.game_type);
    } catch (error) {
      this.logger.error(`Failed to get XP rewards for ${session.game_type}: ${error.message}`);
      xpRewards = { win_xp: 100, loss_xp: 25, draw_xp: 50, participation_xp: 10 };
    }

    // Determine winner username (Bug #3 fix - added defensive null checks)
    let winnerUsername = null;
    let winnerIsViewer = false;
    let winnerStreakInfo = null;
    let eloChanges = null;
    
    if (winner && gameResult && game) {
      let winnerInfo;
      
      if (session.game_type === 'chess') {
        // For chess, winner is 'white' or 'black'
        if (winner === 'white' && game.whitePlayer) {
          winnerInfo = game.whitePlayer;
        } else if (winner === 'black' && game.blackPlayer) {
          winnerInfo = game.blackPlayer;
        }
      } else {
        // For Connect4, winner is 1 or 2
        if (winner === 1 && game.player1) {
          winnerInfo = game.player1;
        } else if (winner === 2 && game.player2) {
          winnerInfo = game.player2;
        }
      }
      
      if (winnerInfo?.username) {
        winnerUsername = winnerInfo.username;
        winnerIsViewer = winnerInfo.role === 'viewer';
      }
    }

    // Save final game state (with null check and error handling - Bug #5 fix)
    try {
      if (game && game.getState) {
        this.db.endSession(sessionId, winnerUsername, game.getState(), reason);
      } else {
        this.logger.warn(`Cannot save final state for session ${sessionId}: game or getState is null`);
        this.db.endSession(sessionId, winnerUsername, null, reason);
      }
    } catch (error) {
      this.logger.error(`Failed to end session ${sessionId} in database: ${error.message}`);
    }

    // Calculate and apply ELO changes if enabled
    if (!options.skipAccounting && config.eloEnabled && session.player1_username !== 'streamer' && session.player2_username !== 'streamer') {
      eloChanges = this.calculateAndApplyELO(session, winner, reason, config);
    }

    // Award XP and get streak info
    const streakData = options.skipAccounting ? null : this.awardGameXP(session, winner, reason, xpRewards);
    
    // Get win streak for the winner if viewer (Bug #5 fix - added error handling)
    if (!options.skipAccounting && winnerIsViewer && winnerUsername) {
      try {
        winnerStreakInfo = this.db.getDetailedPlayerStats(winnerUsername, session.game_type);
      } catch (error) {
        this.logger.error(`Failed to get player stats for ${winnerUsername}: ${error.message}`);
      }
    }

    // Clear chess timer interval if exists (Bug #1 fix)
    if (game && game.timerInterval) {
      try {
        clearInterval(game.timerInterval);
        game.timerInterval = null;
      } catch (error) {
        this.logger.warn(`Failed to clear timer interval for session ${sessionId}: ${error.message}`);
      }
    }

    // Emit game ended event (Bug #3 fix - added null check for game state)
    this.io.emit('game-engine:game-ended', {
      sessionId,
      gameType: session.game_type,
      winner: winnerUsername,
      reason,
      state: game && game.getState ? game.getState() : null,
      gameResult,
      interactive: options.interactive === true,
      winStreak: winnerStreakInfo ? {
        newWinStreak: winnerStreakInfo.current_win_streak,
        bestWinStreak: winnerStreakInfo.best_win_streak
      } : null,
      eloChanges: eloChanges
    });

    // Remove from active sessions
    this.activeSessions.delete(sessionId);

    this.logger.info(`Ended game #${sessionId}: Winner=${winnerUsername || 'none'}, Reason=${reason}`);
    
    // Check if this is a game that should use unified queue
    const useUnifiedQueue = this.shouldUseUnifiedQueue(session.game_type);
    
    if (useUnifiedQueue) {
      // Complete processing in unified queue
      this.logger.debug(`Completing unified queue processing for ${session.game_type} game #${sessionId}`);
      this.unifiedQueue.completeProcessing();
    } else {
      // Process next game in old queue after a short delay (allow UI to update)
      const nextGameTimer = setTimeout(() => {
      }, 2000);
      if (typeof nextGameTimer.unref === 'function') {
        nextGameTimer.unref();
      }
    }
  }

  /**
   * Calculate and apply ELO changes for both players
   */
  calculateAndApplyELO(session, winner, reason, config) {
    const player1 = session.player1_username;
    const player2 = session.player2_username;
    
    // Skip if either player is streamer
    if (player1 === 'streamer' || player2 === 'streamer') {
      return null;
    }

    // Get current ELO ratings
    const player1ELO = this.db.getPlayerELO(player1, session.game_type);
    const player2ELO = this.db.getPlayerELO(player2, session.game_type);

    // Determine scores (1 = win, 0.5 = draw, 0 = loss)
    let player1Score, player2Score;
    
    const outcome = this._getSessionPlayerOutcomes(session, winner, reason);

    if (outcome.isDraw) {
      player1Score = 0.5;
      player2Score = 0.5;
    } else if (outcome.player1IsWinner) {
      player1Score = 1;
      player2Score = 0;
    } else if (outcome.player2IsWinner) {
      player1Score = 0;
      player2Score = 1;
    } else {
      // No valid winner, skip ELO
      return null;
    }

    // Calculate ELO changes
    const kFactor = config.eloKFactor || 32;
    const player1Change = this.db.calculateELOChange(player1ELO, player2ELO, player1Score, kFactor);
    const player2Change = this.db.calculateELOChange(player2ELO, player1ELO, player2Score, kFactor);

    // Apply ELO changes
    const player1ELOResult = this.db.updatePlayerELO(player1, session.game_type, player1Change);
    const player2ELOResult = this.db.updatePlayerELO(player2, session.game_type, player2Change);

    this.logger.info(`ELO Update - ${player1}: ${player1ELOResult.oldELO} → ${player1ELOResult.newELO} (${player1Change > 0 ? '+' : ''}${player1Change})`);
    this.logger.info(`ELO Update - ${player2}: ${player2ELOResult.oldELO} → ${player2ELOResult.newELO} (${player2Change > 0 ? '+' : ''}${player2Change})`);

    return {
      player1: player1ELOResult,
      player2: player2ELOResult
    };
  }

  /**
   * Cancel a game
   */
  cancelGame(input) {
    const request = typeof input === 'object' && input !== null ? input : { sessionId: input };
    if (this.interactiveController?.registry?.get(request.sessionId)) {
      const result = this.interactiveController.cancel(request);
      this._drainPendingConnect4Fallbacks();
      return result;
    }
    this.endGame(request.sessionId, null, 'cancelled', null, { skipAccounting: true });
    this._drainPendingConnect4Fallbacks();
    return { success: true };
  }

  /**
   * Award XP to players and update statistics
   */
  awardGameXP(session, winner, reason, xpRewards) {
    // Get viewer-leaderboard plugin for XP
    const viewerXP = this.api.getPlugin?.('viewer-leaderboard');
    
    if (!viewerXP || !viewerXP.db) {
      this.logger.warn('Viewer XP plugin not available, skipping XP rewards');
      return;
    }

    const player1 = session.player1_username;
    const player2 = session.player2_username;

    // Determine winner and loser
    const outcome = this._getSessionPlayerOutcomes(session, winner, reason);
    const { player1IsWinner, player2IsWinner, isDraw } = outcome;

    // Calculate XP for each player
    let player1XP = xpRewards.participation_xp || 0;
    let player2XP = xpRewards.participation_xp || 0;

    if (isDraw) {
      player1XP += xpRewards.draw_xp || 0;
      player2XP += xpRewards.draw_xp || 0;
    } else if (winner) {
      if (player1IsWinner) {
        player1XP += xpRewards.win_xp || 0;
        player2XP += xpRewards.loss_xp || 0;
      } else if (player2IsWinner) {
        player1XP += xpRewards.loss_xp || 0;
        player2XP += xpRewards.win_xp || 0;
      }
    }

    // Award XP and update stats for player 1
    if (player1 !== 'streamer') {
      if (player1XP > 0) {
        viewerXP.db.addXP(player1, player1XP, isDraw ? 'game_draw' : (player1IsWinner ? 'game_win' : 'game_loss'), {
          gameType: session.game_type,
          sessionId: session.id
        });
      }
      
      // Update player statistics (use chess-specific if chess game)
      let streakInfo;
      if (session.game_type === 'chess') {
        streakInfo = this.db.updateChessPlayerStats(
          player1, 
          session.game_type, 
          player1IsWinner, 
          player2IsWinner, 
          isDraw,
          outcome.player1Side,
          player1XP
        );
      } else {
        streakInfo = this.db.updatePlayerStats(
          player1, 
          session.game_type, 
          player1IsWinner, 
          player2IsWinner, 
          isDraw, 
          player1XP
        );
      }
      
      // Emit win streak notification if new record (Bug #3 fix - added null check)
      if (streakInfo?.isNewRecord && streakInfo.newWinStreak > 1) {
        this.io.emit('game-engine:new-streak-record', {
          username: player1,
          gameType: session.game_type,
          streak: streakInfo.newWinStreak
        });
        this.logger.info(`🎉 ${player1} achieved a new win streak record: ${streakInfo.newWinStreak} in ${session.game_type}`);
      }
    }
    
    // Award XP and update stats for player 2
    if (player2 !== 'streamer') {
      if (player2XP > 0) {
        viewerXP.db.addXP(player2, player2XP, isDraw ? 'game_draw' : (player2IsWinner ? 'game_win' : 'game_loss'), {
          gameType: session.game_type,
          sessionId: session.id
        });
      }
      
      // Update player statistics (use chess-specific if chess game)
      let streakInfo;
      if (session.game_type === 'chess') {
        streakInfo = this.db.updateChessPlayerStats(
          player2, 
          session.game_type, 
          player2IsWinner, 
          player1IsWinner, 
          isDraw,
          outcome.player2Side,
          player2XP
        );
      } else {
        streakInfo = this.db.updatePlayerStats(
          player2, 
          session.game_type, 
          player2IsWinner, 
          player1IsWinner, 
          isDraw, 
          player2XP
        );
      }
      
      // Emit win streak notification if new record (Bug #3 fix - added null check)
      if (streakInfo?.isNewRecord && streakInfo.newWinStreak > 1) {
        this.io.emit('game-engine:new-streak-record', {
          username: player2,
          gameType: session.game_type,
          streak: streakInfo.newWinStreak
        });
        this.logger.info(`🎉 ${player2} achieved a new win streak record: ${streakInfo.newWinStreak} in ${session.game_type}`);
      }
    }
  }

  /**
   * Start a manual test game (for offline testing)
   */
  startManualGame(gameType, player1Name, player2Name, opponentType = 'manual') {
    if (gameType !== 'connect4') {
      throw new Error(`Unsupported game type: ${gameType}`);
    }

    // Get configuration
    const config = this.db.getGameConfig(gameType) || this.defaultConfigs[gameType];

    // Create database session (mark as manual/test)
    const sessionId = this.db.createSession(
      gameType,
      player1Name,
      'test_player',
      'manual',
      `manual_${opponentType}`
    );

    // Add player 2
    this.db.addPlayer2(
      sessionId,
      player2Name,
      opponentType === 'bot' ? 'bot' : 'test_player'
    );

    // Create game instance
    const player1 = {
      username: player1Name,
      role: 'test_player',
      color: config.player1Color,
      nickname: player1Name
    };

    const player2 = {
      username: player2Name,
      role: opponentType === 'bot' ? 'bot' : 'test_player',
      color: config.player2Color,
      nickname: player2Name
    };

    const game = new Connect4Game(sessionId, player1, player2, this.logger);
    this.activeSessions.set(sessionId, game);

    // Emit game started event
    this.io.emit('game-engine:game-started', {
      sessionId,
      gameType,
      state: game.getState(),
      config,
      manual: true,
      opponentType
    });

    this.logger.info(`🎮 Manual ${gameType} game started #${sessionId}: ${player1Name} vs ${player2Name} (${opponentType})`);
    
    return sessionId;
  }

  /**
   * Make a manual move (for testing)
   */
  makeManualMove(sessionId, playerNumber, column) {
    const session = this.db.getSession(sessionId);
    if (!session) {
      return {
        success: false,
        error: 'Session not found'
      };
    }

    const game = this.activeSessions.get(sessionId);
    if (!game) {
      return {
        success: false,
        error: 'Game instance not found'
      };
    }

    // Validate it's the correct player's turn
    const currentPlayer = game.currentPlayer;
    if (playerNumber && currentPlayer !== playerNumber) {
      return {
        success: false,
        error: `It's player ${currentPlayer}'s turn, not player ${playerNumber}`
      };
    }

    // Make the move
    const result = game.dropPiece(column);
    
    if (!result.success) {
      return result;
    }

    // Save move to database
    const playerUsername = currentPlayer === 1 ? session.player1_username : session.player2_username;
    this.db.saveMove(sessionId, playerUsername, result.move, result.move.moveNumber);

    // Emit move event
    this.io.emit('game-engine:move-made', {
      sessionId,
      gameType: session.game_type,
      move: result.move,
      state: game.getState(),
      manual: true
    });

    // Check if game is over
    if (result.gameOver) {
      this.endGame(sessionId, result.winner, result.draw ? 'draw' : 'win', result);
    }

    return {
      success: true,
      result,
      message: result.gameOver ? 
        (result.draw ? 'Game ended in a draw!' : `Player ${result.winner} won!`) : 
        'Move made successfully!',
      nextPlayer: game.currentPlayer
    };
  }

  /**
   * Handle chess move command from GCCE
   */
  async handleChessMoveCommand(args, context) {
    try {
      // Use userId for player identification (unique TikTok ID)
      // Use username (which is actually nickname in GCCE context) for display
      const userId = context.userId || context.username;
      const nickname = context.username || context.nickname || userId;
      
      if (!args || args.length === 0) {
        return {
          success: false,
          error: 'Please specify a move',
          message: 'Usage: /move <move> or /m <move> (e.g., /m e4, /m Nf3, /m e2e4)',
          displayOverlay: true
        };
      }

      const move = args[0];
      
      return this.handleViewerChessMove(
        userId,
        nickname,
        move,
        this._getChatMoveIdentity(context.rawData || context)
      );
    } catch (error) {
      this.logger.error(`Error in handleChessMoveCommand: ${error.message}`);
      return {
        success: false,
        error: 'An error occurred',
        message: 'Failed to process move'
      };
    }
  }

  /**
   * Handle chess start command from GCCE
   */
  async handleChessStartCommand(args, context) {
    try {
      // Use userId for player identification (unique TikTok ID)
      // Use username (which is actually nickname in GCCE context) for display
      const userId = context.userId || context.username;
      const nickname = context.username || context.nickname || userId;
      
      // Optional time control argument
      let timeControl = null;
      if (args && args.length > 0) {
        // Validate time control format (e.g., "3+0", "5+2")
        const tc = args[0];
        if (this._isValidChessTimeControl(tc)) {
          timeControl = tc.trim();
        } else {
          return {
            success: false,
            error: 'Invalid time control format',
            message: 'Format: minutes+increment (e.g., 3+0, 5+2, 10+5)',
            displayOverlay: true
          };
        }
      }

      // Get config to check default time control
      const config = this._getConfigWithDefaults('chess', this.db.getGameConfig('chess'));
      const finalTimeControl = timeControl || config.defaultTimeControl || '5+0';

      // Start a new chess game
      const result = this.startGame('chess', userId, nickname, 'command', '/chessstart', finalTimeControl);
      if (!result?.success) {
        return {
          success: false,
          error: result?.error || 'game_start_failed',
          message: result?.error === 'active_session'
            ? 'You already have an interactive game in progress.'
            : result?.error === 'interactive_session_limit'
              ? 'The interactive game limit is currently reached.'
              : 'Could not start the chess game.',
          displayOverlay: true
        };
      }
      
      return {
        success: true,
        message: `Chess game started! ${this._resolveHostDisplayName()} vs ${nickname}. Time control: ${finalTimeControl}. Use /move <move> to play.`,
        displayOverlay: true
      };
    } catch (error) {
      this.logger.error(`Error in handleChessStartCommand: ${error.message}`);
      return {
        success: false,
        error: 'An error occurred',
        message: 'Failed to start game'
      };
    }
  }

  /**
   * Handle resign command from GCCE
   */
  async handleResignCommand(args, context) {
    try {
      // Use userId for player identification (unique TikTok ID)
      const userId = context.userId || context.username;

      const interactiveSession = this.interactiveController?.registry?.getByViewer(userId);
      if (interactiveSession) {
        if (interactiveSession.gameType !== 'chess') {
          return {
            success: false,
            message: 'Resignation is only available in chess games.',
            displayOverlay: true
          };
        }
        const resignation = interactiveSession.adapter.game.resign(userId);
        if (!resignation.success) {
          return { success: false, message: resignation.error, displayOverlay: true };
        }
        this.interactiveController.end(interactiveSession.sessionId, {
          winner: resignation.winner,
          winnerRole: 'host',
          reason: 'resignation',
          gameResult: resignation
        });
        return {
          success: true,
          message: 'You resigned from the game.',
          displayOverlay: true
        };
      }

      if (this._isHostChatEvent(context.rawData || context) && this.interactiveController) {
        const display = this.interactiveController.router?.snapshot?.() || {};
        let hostChessSession = display.displaySessionId == null
          ? null
          : this.interactiveController.registry?.get?.(display.displaySessionId);
        if (!hostChessSession) {
          const chessSessions = (this.interactiveController.registry?.list?.() || [])
            .filter(session => session.gameType === 'chess');
          hostChessSession = chessSessions.length === 1 ? chessSessions[0] : null;
        }
        if (!hostChessSession || hostChessSession.gameType !== 'chess') {
          return {
            success: false,
            message: 'You don\'t have an active chess game.',
            displayOverlay: true
          };
        }

        const resignation = this.interactiveController.resignHost({
          sessionId: hostChessSession.sessionId,
          gameType: 'chess',
          sessionRevision: hostChessSession.sessionRevision,
          displayRevision: display.displayRevision
        });
        if (!resignation.success) {
          return {
            success: false,
            message: resignation.error,
            displayOverlay: true
          };
        }
        return {
          success: true,
          message: 'You resigned from the game.',
          displayOverlay: true,
          result: resignation.result
        };
      }
      
      // Find active game for this player
      const activeSession = this.db.getActiveSessionForPlayer(userId);
      
      if (!activeSession) {
        return {
          success: false,
          message: 'You don\'t have an active game.',
          displayOverlay: true
        };
      }

      const game = this.activeSessions.get(activeSession.id);
      
      if (!game) {
        return {
          success: false,
          message: 'Game session not found',
          displayOverlay: true
        };
      }

      // Only chess supports resignation (Connect4 can just be cancelled)
      if (activeSession.game_type === 'chess') {
        const result = game.resign(userId);
        
        if (!result.success) {
          return {
            success: false,
            message: result.error,
            displayOverlay: true
          };
        }

        // Emit move event
        this.io.emit('game-engine:move-made', {
          sessionId: activeSession.id,
          gameType: 'chess',
          move: { type: 'resignation', player: userId },
          state: game.getState()
        });

        // End the game
        this.endGame(activeSession.id, result.winner, 'resignation', result);

        return {
          success: true,
          message: 'You resigned from the game.',
          displayOverlay: true
        };
      } else {
        return {
          success: false,
          message: 'Resignation is only available in chess games.',
          displayOverlay: true
        };
      }
    } catch (error) {
      this.logger.error(`Error in handleResignCommand: ${error.message}`);
      return {
        success: false,
        error: 'An error occurred',
        message: 'Failed to resign'
      };
    }
  }

  /**
   * Handle Plinko command
   */
  async handlePlinkoCommand(args, context) {
    try {
      // Use userId for player identification (unique TikTok ID)
      // Use nickname for display name
      const userId = context.userId || context.username;
      const nickname = context.nickname || context.username || userId;
      const profilePictureUrl = context.rawData?.profilePictureUrl || context.profilePictureUrl || '';
      const lockoutRejection = this._rejectIfGameLocked(userId, nickname, 'plinko');
      if (lockoutRejection) {
        return {
          success: false,
          message: lockoutRejection.message,
          error: lockoutRejection.error,
          displayOverlay: true
        };
      }
      
      // Get bet amount
      const primaryArg = args[0] || '0';
      let betAmount;
      let ballCount = 1;

      // Support inline multiplier syntax (e.g., 100x3)
      const inlineMulti = primaryArg.match(/^(\d+)\s*x\s*(\d+)$/i);
      if (inlineMulti) {
        betAmount = parseInt(inlineMulti[1]);
        ballCount = Math.max(1, parseInt(inlineMulti[2]));
      }

      if (args[1]) {
        const parsedCount = parseInt(args[1]);
        if (!isNaN(parsedCount) && parsedCount > 0) {
          ballCount = parsedCount;
        }
      }

      if (primaryArg.toLowerCase() === 'max') {
        // Get user's current XP and split evenly across requested balls
        const viewerLeaderboard = this.api.pluginLoader?.loadedPlugins?.get('viewer-leaderboard');
        if (!viewerLeaderboard || !viewerLeaderboard.instance) {
          return {
            success: false,
            message: 'XP system not available',
            displayOverlay: true
          };
        }
        
        const profile = viewerLeaderboard.instance.db.getViewerProfile(userId);
        if (!profile) {
          return {
            success: false,
            message: 'You need to interact with the stream first to play Plinko!',
            displayOverlay: true
          };
        }

        ballCount = Math.min(ballCount, 10);
        betAmount = Math.max(1, Math.floor(profile.xp / ballCount));
      } else if (!inlineMulti) {
        betAmount = parseInt(primaryArg);
      }

      if (isNaN(betAmount) || betAmount <= 0) {
        return {
          success: false,
          message: 'Invalid bet amount. Use /plinko <amount> [balls] or /plinko 100x3',
          displayOverlay: true
        };
      }

      const result = ballCount > 1
        ? await this.plinkoGame.spawnBalls(
            userId,
            nickname,
            profilePictureUrl,
            betAmount,
            ballCount,
            { preferredColor: null }
          )
        : await this.plinkoGame.spawnBall(
            userId,
            nickname,
            profilePictureUrl,
            betAmount,
            'standard'
          );

      if (!result.success) {
        return {
          success: false,
          message: result.error,
          displayOverlay: true
        };
      }

      return {
        success: true,
        message: ballCount > 1
          ? `🎰 ${ballCount} Plinko balls dropped! ${betAmount} XP each (${betAmount * ballCount} XP total).`
          : `🎰 Plinko ball dropped! You bet ${betAmount} XP. Good luck!`,
        displayOverlay: true
      };
    } catch (error) {
      this.logger.error(`Error in handlePlinkoCommand: ${error.message}`);
      return {
        success: false,
        error: 'An error occurred',
        message: 'Failed to play Plinko'
      };
    }
  }

  /**
   * Handle viewer chess move
   */
  handleViewerChessMove(username, nickname, move, moveIdentity = null) {
    if (this.interactiveController) {
      const result = this.interactiveController.applyViewerMove({
        viewerId: username,
        gameType: 'chess',
        move: { move },
        moveIdentity
      });
      return {
        ...result,
        message: result.success ? 'Move made successfully!' : result.error,
        displayOverlay: true
      };
    }
    // Find active game for this viewer
    const activeSession = this.db.getActiveSessionForPlayer(username);
    
    if (!activeSession) {
      return {
        success: false,
        message: 'You don\'t have an active chess game. Use /chessstart to start!',
        displayOverlay: true
      };
    }

    if (activeSession.game_type !== 'chess') {
      return {
        success: false,
        message: 'This is not a chess game. Use the appropriate command for this game.',
        displayOverlay: true
      };
    }

    const game = this.activeSessions.get(activeSession.id);
    
    if (!game) {
      return {
        success: false,
        message: 'Game session not found',
        displayOverlay: true
      };
    }

    // Make the move
    const result = game.makeMove(move, username);
    
    if (!result.success) {
      // Emit error event to overlay
      this.io.emit('game-engine:move-error', {
        sessionId: activeSession.id,
        username,
        error: result.error,
        move: move
      });
      
      return {
        success: false,
        message: result.error || 'Invalid move',
        displayOverlay: true
      };
    }

    // Save move to database
    this.db.saveMove(activeSession.id, username, result.move, result.move.moveNumber);

    // Emit move event
    this.io.emit('game-engine:move-made', {
      sessionId: activeSession.id,
      gameType: 'chess',
      move: result.move,
      state: game.getState(),
      fen: result.fen,
      inCheck: result.inCheck,
      capturedPieces: result.capturedPieces
    });

    // Check if game is over
    if (result.gameOver) {
      // Save PGN to session
      this.db.updateSession(activeSession.id, {
        pgn_history: result.pgn,
        final_fen: result.fen,
        win_reason: result.winReason
      });
      
      this.endGame(activeSession.id, result.winner, result.winReason, result);
    }

    return {
      success: true,
      message: result.gameOver ? 
        (result.winner ? `Game over! Winner: ${result.winner}` : 'Game ended in a draw!') : 
        'Move made successfully!',
      displayOverlay: true
    };
  }
}

module.exports = GameEnginePlugin;
