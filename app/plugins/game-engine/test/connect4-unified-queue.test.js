const GameEnginePlugin = require('../main');
const UnifiedQueueManager = require('../backend/unified-queue');

describe('Interactive games are separated from the transient unified queue', () => {
  let plugin;
  let io;
  let database;

  beforeEach(() => {
    io = { on: jest.fn(), emit: jest.fn() };
    database = {
      getGameConfig: jest.fn(() => null),
      getTriggers: jest.fn(() => []),
      getSession: jest.fn(() => null),
      getXPRewards: jest.fn(() => ({
        win_xp: 100,
        loss_xp: 25,
        draw_xp: 50,
        participation_xp: 10
      }))
    };
    const api = {
      log: jest.fn(),
      getSocketIO: () => io,
      getDatabase: () => database,
      registerRoute: jest.fn(),
      registerSocket: jest.fn(),
      registerTikTokEvent: jest.fn(),
      pluginLoader: { loadedPlugins: new Map() }
    };
    plugin = new GameEnginePlugin(api);
    plugin.db = database;
    plugin.interactiveController = {
      startMatch: jest.fn(input => ({
        success: true,
        started: true,
        sessionId: input.viewerId === 'user1' ? 1 : input.viewerId === 'user2' ? 2 : 3
      }))
    };
  });

  test('keeps UnifiedQueueManager available for transient games', () => {
    expect(plugin.unifiedQueue).toBeInstanceOf(UnifiedQueueManager);
    expect(plugin.unifiedQueue.gameEnginePlugin).toBe(plugin);
  });

  test('starts Connect 4 through the interactive controller even while another match exists', () => {
    plugin.activeSessions.set(99, {});
    const queueConnect4 = jest.spyOn(plugin.unifiedQueue, 'queueConnect4');

    const result = plugin.handleGameStart('connect4', 'user1', 'User One', 'command', '/c4start');

    expect(result).toMatchObject({ success: true, started: true, sessionId: 1 });
    expect(plugin.interactiveController.startMatch).toHaveBeenCalledWith(expect.objectContaining({
      gameType: 'connect4',
      viewerId: 'user1'
    }));
    expect(queueConnect4).not.toHaveBeenCalled();
  });

  test('starts chess through the same interactive controller without serializing it', () => {
    plugin.activeSessions.set(99, {});
    const queueChess = jest.spyOn(plugin.unifiedQueue, 'queueChess');

    const result = plugin.handleGameStart('chess', 'user2', 'User Two', 'command', '/chessstart');

    expect(result).toMatchObject({ success: true, started: true, sessionId: 2 });
    expect(plugin.interactiveController.startMatch).toHaveBeenCalledWith(expect.objectContaining({
      gameType: 'chess',
      viewerId: 'user2'
    }));
    expect(queueChess).not.toHaveBeenCalled();
  });

  test('preserves start order at the interactive-controller boundary', () => {
    plugin.handleGameStart('connect4', 'user1', 'User One', 'command', '/c4start');
    plugin.handleGameStart('chess', 'user2', 'User Two', 'command', '/chessstart');
    plugin.handleGameStart('connect4', 'user3', 'User Three', 'command', '/c4start');

    expect(plugin.interactiveController.startMatch.mock.calls.map(call => [
      call[0].viewerId,
      call[0].gameType
    ])).toEqual([
      ['user1', 'connect4'],
      ['user2', 'chess'],
      ['user3', 'connect4']
    ]);
    expect(plugin.unifiedQueue.getStatus().queueLength).toBe(0);
  });

  test('does not complete transient queue processing when a legacy interactive result is finalized', () => {
    const session = {
      id: 1,
      game_type: 'connect4',
      player1_username: 'user1',
      player2_username: 'streamer',
      status: 'active'
    };
    database.getSession = jest.fn(() => session);
    database.endSession = jest.fn();
    database.updatePlayerStats = jest.fn(() => ({ isNewRecord: false }));
    plugin.activeSessions.set(1, {
      player1: { username: 'user1', role: 'viewer' },
      player2: { username: 'streamer', role: 'streamer' },
      getState: () => ({ board: [] })
    });
    const completeProcessing = jest.spyOn(plugin.unifiedQueue, 'completeProcessing');

    plugin.endGame(1, 1, 'win', { winner: 1 });

    expect(completeProcessing).not.toHaveBeenCalled();
  });

  test('rejects unsupported interactive game types', () => {
    expect(plugin.handleGameStart('othergame', 'user1', 'User One', 'command', '/start')).toEqual({
      success: false,
      error: 'unsupported_game_type'
    });
    expect(plugin.interactiveController.startMatch).not.toHaveBeenCalled();
  });

  test('legacy queued-start callback also delegates without touching the transient queue', async () => {
    const result = await plugin.startGameFromQueue('connect4', 'user1', 'User One', 'command', '/c4start');

    expect(result).toMatchObject({ success: true, started: true, sessionId: 1 });
    expect(plugin.unifiedQueue.getStatus().queueLength).toBe(0);
  });
});
