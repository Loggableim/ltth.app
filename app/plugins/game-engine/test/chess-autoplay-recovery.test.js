const Database = require('better-sqlite3');
const GameEnginePlugin = require('../main');
const GameEngineDatabase = require('../backend/database');

function createPlugin(sqlite) {
  const io = { emit: jest.fn(), on: jest.fn() };
  const api = {
    log: jest.fn(),
    getSocketIO: () => io,
    getDatabase: () => ({ db: sqlite }),
    getPlugin: jest.fn(() => null),
    pluginLoader: { activeProfile: 'LiveHost', loadedPlugins: new Map() },
    tiktok: { currentUsername: '@LiveHost' }
  };
  const plugin = new GameEnginePlugin(api);
  plugin.db = new GameEngineDatabase(api, plugin.logger);
  plugin.db.initialize();
  return { plugin, io };
}

function persistTerminalAutoplaySession(database) {
  const sessionId = Number(database.createSession(
    'chess',
    'streamer',
    'streamer',
    'command',
    '/chessstart'
  ));
  database.addPlayer2(sessionId, 'viewer-recovery', 'viewer');
  const autoplay = {
    version: 1,
    enabled: true,
    rated: true,
    viewerElo: 1200,
    initialRating: 1200,
    targetElo: 1450,
    kFactor: 20,
    engineVersion: 'stockfish-18.0.8-lite-single',
    selectorVersion: 'seeded-multipv-v1',
    seed: 'private-recovery-seed',
    originRevision: 7,
    dueAtMs: null,
    status: 'completed'
  };
  const state = {
    sessionId,
    fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
    pgn: '1. f3 e5 2. g4 Qh4#',
    currentPlayer: 'white',
    whitePlayer: { username: 'streamer', role: 'streamer', side: 'white' },
    blackPlayer: { username: 'viewer-recovery', role: 'viewer', side: 'black' },
    timers: { white: 300000, black: 300000 },
    timeControl: { initial: 300000, increment: 0 },
    moveCount: 4,
    winner: 'black',
    winReason: 'checkmate',
    status: 'completed',
    lastMove: null,
    moveHistory: []
  };
  database.createInteractiveState({
    sessionId,
    gameType: 'chess',
    viewerId: 'viewer-recovery',
    viewerDisplayName: 'Viewer Recovery',
    hostDisplayName: 'LiveHost',
    state,
    sessionRevision: 7,
    displayRevision: 3,
    turnRole: 'viewer',
    participantIds: ['viewer-recovery', 'streamer'],
    participants: [
      { id: 'viewer-recovery', displayName: 'Viewer Recovery', role: 'viewer', avatarSource: '' },
      { id: 'streamer', displayName: 'LiveHost', role: 'host', avatarSource: '' }
    ],
    turnPlayerId: 'viewer-recovery',
    viewerDeadlineMs: null,
    viewerTimeRemainingMs: null,
    hostTimeRemainingMs: 300000,
    timeControl: '5+0',
    autoplay
  });
  database.completeInteractiveState(sessionId, 'checkmate');
  return sessionId;
}

describe('Chess autoplay ELO crash recovery', () => {
  test('startup recovers a terminal autoplay chess result exactly once', () => {
    const sqlite = new Database(':memory:');
    const { plugin } = createPlugin(sqlite);
    const sessionId = persistTerminalAutoplaySession(plugin.db);
    plugin.db.saveGameConfig('chess', { eloEnabled: false, eloKFactor: 64 });

    try {
      expect(sqlite.prepare(
        'SELECT session_id FROM game_interactive_autoplay_elo_results WHERE session_id = ?'
      ).all(sessionId)).toEqual([]);

      plugin._initializeInteractiveController();

      expect(sqlite.prepare(`
        SELECT viewer_id, target_elo, old_elo, new_elo, change
        FROM game_interactive_autoplay_elo_results
        WHERE session_id = ?
      `).all(sessionId)).toEqual([{
        viewer_id: 'viewer-recovery',
        target_elo: 1450,
        old_elo: 1200,
        new_elo: 1216,
        change: 16
      }]);

      plugin._recoverPendingAutoplayChessELO();

      expect(sqlite.prepare(`
        SELECT viewer_id, target_elo, old_elo, new_elo, change
        FROM game_interactive_autoplay_elo_results
        WHERE session_id = ?
      `).all(sessionId)).toHaveLength(1);
      expect(sqlite.prepare(`
        SELECT elo_rating FROM game_player_stats
        WHERE username = ? AND game_type = 'chess'
      `).get('viewer-recovery')).toEqual({ elo_rating: 1216 });
    } finally {
      plugin.interactiveController?.destroy();
      sqlite.close();
    }
  });

  test('game-ended does not expose an autoplay target or private selector snapshot', () => {
    const sqlite = new Database(':memory:');
    const { plugin, io } = createPlugin(sqlite);
    const session = {
      id: 23,
      game_type: 'chess',
      player1_username: 'viewer-public',
      player2_username: 'streamer'
    };
    const game = {
      whitePlayer: { username: 'viewer-public', role: 'viewer', side: 'white' },
      blackPlayer: { username: 'streamer', role: 'streamer', side: 'black' },
      getState: () => ({
        winner: 'white',
        status: 'completed',
        whitePlayer: { username: 'viewer-public', role: 'viewer', side: 'white' },
        blackPlayer: { username: 'streamer', role: 'streamer', side: 'black' }
      })
    };
    plugin.db.getSession = jest.fn(() => session);
    plugin.db.getGameConfig = jest.fn(() => ({ eloEnabled: true, eloKFactor: 32 }));
    plugin.db.getXPRewards = jest.fn(() => ({ win_xp: 0, loss_xp: 0, draw_xp: 0, participation_xp: 0 }));
    plugin.db.endSession = jest.fn();
    plugin.db.updateChessPlayerStats = jest.fn(() => ({ isNewRecord: false }));
    plugin.db.applyAutoplayChessELOOnce = jest.fn(() => ({
      viewerId: 'viewer-public',
      targetElo: 1450,
      oldELO: 1200,
      newELO: 1206,
      change: 6,
      alreadyApplied: false
    }));
    plugin.activeSessions.set(session.id, game);

    plugin.endGame(session.id, 'white', 'checkmate', { gameOver: true, winner: 'white' }, {
      interactive: true,
      autoplay: {
        enabled: true,
        viewerId: 'viewer-public',
        initialRating: 1200,
        targetElo: 1450,
        engineVersion: 'stockfish-18.0.8-lite-single',
        selectorVersion: 'seeded-multipv-v1',
        seed: 'private-event-seed'
      }
    });

    const event = io.emit.mock.calls.find(([name]) => name === 'game-engine:game-ended')?.[1];
    expect(event).toBeDefined();
    expect(event.eloChanges).toEqual({
      viewer: { oldELO: 1200, newELO: 1206, change: 6 }
    });
    expect(JSON.stringify(event)).not.toContain('targetElo');
    expect(JSON.stringify(event)).not.toContain('private-event-seed');
    expect(JSON.stringify(event)).not.toContain('selectorVersion');
  });
});
