/**
 * GCCE Integration and Manual Mode Tests
 */

const GameEnginePlugin = require('../main');
const EventEmitter = require('events');

describe('Game Engine GCCE Integration', () => {
  let plugin;
  let mockApi;
  let mockSocketIO;
  let mockDb;
  let pluginEvents;
  let registeredCommands = [];

  beforeEach(() => {
    // Reset registered commands
    registeredCommands = [];
    
    // Mock Socket.IO
    mockSocketIO = {
      on: jest.fn(),
      emit: jest.fn()
    };

    // Mock Database
    mockDb = {
      prepare: jest.fn(() => ({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn(() => [])
      }))
    };

    pluginEvents = new EventEmitter();

    // Mock API
    mockApi = {
      log: jest.fn(),
      getSocketIO: () => mockSocketIO,
      getDatabase: () => mockDb,
      registerRoute: jest.fn(),
      registerSocket: jest.fn(),
      registerTikTokEvent: jest.fn(),
      getConfig: jest.fn(() => Promise.resolve(null)),
      setConfig: jest.fn(() => Promise.resolve()),
      emit: jest.fn(),
      on: jest.fn((event, callback) => {
        pluginEvents.on(event, callback);
        return true;
      }),
      removeListener: jest.fn((event, callback) => {
        pluginEvents.removeListener(event, callback);
      }),
      pluginLoader: {
        loadedPlugins: new Map([
          ['gcce', {
            instance: {
              registerCommandsForPlugin: jest.fn((pluginId, commands) => {
                registeredCommands.push(...commands);
                return {
                  registered: commands.map(cmd => cmd.name),
                  failed: []
                };
              }),
              unregisterCommandsForPlugin: jest.fn()
            }
          }]
        ])
      }
    };

    plugin = new GameEnginePlugin(mockApi);
  });

  afterEach(() => {
    if (plugin) {
      // Clear any intervals before destroy
      if (plugin.gcceRetryInterval) {
        clearInterval(plugin.gcceRetryInterval);
        plugin.gcceRetryInterval = null;
      }
      
      // Clear active sessions to prevent endGame from being called
      plugin.activeSessions.clear();
      plugin.pendingChallenges.clear();
      
      // Ensure db has required methods for destroy
      plugin.db = {
        getSession: jest.fn(() => null),
        getTriggers: jest.fn(() => []),
        getGameConfig: jest.fn(() => null)
      };
      
      // Mock game objects to prevent destroy errors
      plugin.wheelGame = {
        destroy: jest.fn()
      };
      plugin.plinkoGame = {
        destroy: jest.fn()
      };
      plugin.unifiedQueue = {
        destroy: jest.fn()
      };
      
      plugin.destroy();
    }
  });

  describe('GCCE Command Registration', () => {
    test('should register c4 command with GCCE', () => {
      // Setup mock database
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4),
        getTriggers: jest.fn(() => [])
      };
      
      plugin.registerGCCECommands();
      
      const c4Command = registeredCommands.find(cmd => cmd.name === 'c4');
      expect(c4Command).toBeDefined();
      expect(c4Command.description).toContain('Connect4');
      expect(c4Command.permission).toBe('all');
      expect(c4Command.category).toBe('Games');
    });

    test('should register c4start command with GCCE', () => {
      // Setup mock database
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4),
        getTriggers: jest.fn(() => [])
      };
      
      plugin.registerGCCECommands();
      
      const c4StartCommand = registeredCommands.find(cmd => cmd.name === 'c4start');
      expect(c4StartCommand).toBeDefined();
      expect(c4StartCommand.description).toContain('Start');
      expect(c4StartCommand.permission).toBe('all');
    });

    test('should handle missing GCCE gracefully', () => {
      mockApi.pluginLoader.loadedPlugins = new Map();
      
      expect(() => {
        plugin.registerGCCECommands();
      }).not.toThrow();
      
      // Check that it logged a debug message about GCCE not being available
      expect(mockApi.log).toHaveBeenCalledWith(
        expect.stringContaining('GCCE not available'),
        'debug'
      );
      
      // Check that gcceCommandsRegistered is false
      expect(plugin.gcceCommandsRegistered).toBe(false);
    });

    test('should register commands when GCCE loads after retry window ended', () => {
      mockApi.pluginLoader.loadedPlugins = new Map();
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4),
        getTriggers: jest.fn(() => [])
      };

      plugin.setupGCCEIntegrationListeners();
      plugin.gcceRetryInterval = null;
      plugin.gcceRetryCount = 5;

      const gcceInstance = {
        registry: {
          getCommand: jest.fn(() => null)
        },
        registerCommandsForPlugin: jest.fn((pluginId, commands) => {
          registeredCommands.push(...commands);
          return {
            registered: commands.map(cmd => cmd.name),
            failed: []
          };
        }),
        unregisterCommandsForPlugin: jest.fn()
      };

      mockApi.pluginLoader.loadedPlugins.set('gcce', { instance: gcceInstance });
      pluginEvents.emit('plugin:loaded', { id: 'gcce', instance: gcceInstance });

      expect(plugin.gcceCommandsRegistered).toBe(true);
      expect(gcceInstance.registerCommandsForPlugin).toHaveBeenCalledWith(
        'game-engine',
        expect.arrayContaining([
          expect.objectContaining({ name: 'c4' }),
          expect.objectContaining({ name: 'c4start' })
        ])
      );
    });
  });

  describe('Connect4 Command Handler', () => {
    test('should handle valid move command', async () => {
      const context = {
        username: 'Test User',  // In GCCE, username is actually the nickname
        userId: 'test123',      // userId is the unique TikTok ID
        nickname: 'Test User'
      };
      const args = ['A'];
      
      // Mock active session - player1_username should match userId (unique ID)
      plugin.db = {
        getActiveSessionForPlayer: jest.fn(() => ({
          id: 1,
          game_type: 'connect4',
          player1_username: 'test123'
        }))
      };
      
      // Mock game instance - getCurrentPlayerInfo.username should match userId
      const mockGame = {
        currentPlayer: 1,
        getCurrentPlayerInfo: () => ({ username: 'test123' }),
        dropPiece: jest.fn(() => ({
          success: true,
          move: { player: 1, column: 0, row: 5, moveNumber: 1 },
          gameOver: false,
          nextPlayer: 2
        })),
        getState: jest.fn(() => ({ board: [] }))
      };
      plugin.activeSessions.set(1, mockGame);
      
      plugin.db.saveMove = jest.fn();
      
      const result = await plugin.handleConnect4Command(args, context);
      
      expect(result.success).toBe(true);
      expect(mockGame.dropPiece).toHaveBeenCalledWith('A');
    });

    test('should reject command without column', async () => {
      const context = {
        username: 'testuser',
        userId: 'test123'
      };
      const args = [];
      
      const result = await plugin.handleConnect4Command(args, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('column');
    });

    test('should reject invalid column', async () => {
      const context = {
        username: 'testuser',
        userId: 'test123'
      };
      const args = ['H']; // Invalid column
      
      const result = await plugin.handleConnect4Command(args, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    test('should reject connect4 moves when the active session is another game type', async () => {
      const context = {
        username: 'Test User',
        userId: 'test123',
        nickname: 'Test User'
      };

      plugin.db = {
        getActiveSessionForPlayer: jest.fn(() => ({
          id: 1,
          game_type: 'chess',
          player1_username: 'test123'
        }))
      };

      const mockChessGame = {
        getCurrentPlayerInfo: jest.fn(() => ({ username: 'test123' })),
        dropPiece: jest.fn()
      };
      plugin.activeSessions.set(1, mockChessGame);

      const result = await plugin.handleConnect4Command(['A'], context);

      expect(result.success).toBe(false);
      expect(result.message).toContain('not a Connect4 game');
      expect(mockChessGame.dropPiece).not.toHaveBeenCalled();
    });
  });

  describe('Connect4 Start Command Handler', () => {
    test('routes GCCE starts through the FIFO matchmaking handler', async () => {
      const context = {
        username: 'Test User',
        userId: 'test123',
        nickname: 'Test User',
        profilePictureUrl: 'https://p16-sign-va.tiktokcdn.com/avatar.webp'
      };
      plugin.interactiveController = {
        destroy: jest.fn(),
        startOrJoinConnect4Matchmaking: jest.fn(() => ({
          success: true,
          action: 'opened',
          challenge: { challengeId: 43, status: 'open', expiresAtMs: Date.now() + 30000 }
        }))
      };

      const result = await plugin.handleConnect4StartCommand([], context);

      expect(result).toMatchObject({ success: true, action: 'opened', challengeId: 43 });
      expect(plugin.interactiveController.startOrJoinConnect4Matchmaking).toHaveBeenCalledWith(expect.objectContaining({
        participantId: 'test123',
        participantDisplayName: 'Test User',
        triggerType: 'matchmaking_accept',
        triggerValue: 'connect4'
      }));
      plugin._clearConnect4MatchmakingExpiry(43);
    });

    test('opens a FIFO viewer search when no active session exists', async () => {
      const context = {
        username: 'Test User',  // In GCCE, username is actually the nickname
        userId: 'test123',      // userId is the unique TikTok ID
        nickname: 'Test User'
      };
      const args = [];
      
      plugin.db = {
        getActiveSessionForPlayer: jest.fn(() => null),
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4)
      };
      
      plugin.interactiveController = {
        destroy: jest.fn(),
        startOrJoinConnect4Matchmaking: jest.fn(() => ({
          success: true,
          action: 'opened',
          challenge: { challengeId: 42, status: 'open', expiresAtMs: Date.now() + 30000 }
        }))
      };
      
      const result = await plugin.handleConnect4StartCommand(args, context);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('viewer search');
      expect(plugin.interactiveController.startOrJoinConnect4Matchmaking).toHaveBeenCalledWith(expect.objectContaining({
        participantId: 'test123',
        participantDisplayName: 'Test User'
      }));
      plugin._clearConnect4MatchmakingExpiry(42);
    });

    test('matches through FIFO matchmaking when another interactive game is active', async () => {
      const context = {
        username: 'Test User',
        userId: 'test123'
      };
      const args = [];
      
      // Simulate active game
      plugin.activeSessions.set(1, {});
      
      // Setup mock database
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4)
      };
      
      plugin.interactiveController = {
        destroy: jest.fn(),
        startOrJoinConnect4Matchmaking: jest.fn(() => ({
          success: true,
          action: 'matched',
          challenge: { challengeId: 43, status: 'claimed' },
          sessionId: 43
        }))
      };
      
      const result = await plugin.handleConnect4StartCommand(args, context);
      
      // Matches run concurrently; only their host turns enter the display queue.
      expect(result.success).toBe(true);
      expect(result.message).toContain('viewer Connect4 game');
      expect(plugin.interactiveController.startOrJoinConnect4Matchmaking).toHaveBeenCalled();
    });

    test('should return queue rejection when active game queue is full', async () => {
      const context = {
        username: 'Test User',
        userId: 'test123'
      };

      plugin.activeSessions.set(1, {});
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4)
      };
      plugin.interactiveController = {
        destroy: jest.fn(),
        startOrJoinConnect4Matchmaking: jest.fn(() => ({
          success: false,
          error: 'interactive_session_limit'
        }))
      };

      const result = await plugin.handleConnect4StartCommand([], context);

      expect(result.success).toBe(false);
      expect(result.message).toContain('limit');
    });

    test('should preserve command trigger type when creating a pending challenge', () => {
      plugin.db = {
        getActiveSessionForPlayer: jest.fn(() => null),
        getGameConfig: jest.fn(() => ({
          ...plugin.defaultConfigs.connect4,
          showChallengeScreen: true
        })),
        createSession: jest.fn(() => 77),
        updateSession: jest.fn(),
        getGameMedia: jest.fn(() => null)
      };

      const result = plugin.handleGameStart('connect4', 'test123', 'Test User', 'command', '/c4start');
      const challenge = plugin.pendingChallenges.get(77);
      clearTimeout(challenge.timeout);

      expect(result).toMatchObject({ success: true, challenge: true, sessionId: 77 });
      expect(plugin.db.createSession).toHaveBeenCalledWith(
        'connect4',
        'test123',
        'viewer',
        'command',
        '/c4start'
      );
    });

    test('should align stored challenge players with streamer player1 config', () => {
      plugin.db = {
        getGameConfig: jest.fn(() => ({
          ...plugin.defaultConfigs.connect4,
          streamerRole: 'player1'
        })),
        updateSession: jest.fn(),
        addPlayer2: jest.fn(),
        getGameMedia: jest.fn(() => null)
      };

      plugin.startGameFromChallenge(88, {
        gameType: 'connect4',
        challengerUsername: 'viewer123',
        challengerNickname: 'Viewer Name'
      }, 'streamer');

      const game = plugin.activeSessions.get(88);

      expect(plugin.db.updateSession).toHaveBeenCalledWith(88, expect.objectContaining({
        player1_username: 'streamer',
        player1_role: 'streamer'
      }));
      expect(plugin.db.addPlayer2).toHaveBeenCalledWith(88, 'viewer123', 'viewer');
      expect(game.player1.username).toBe('streamer');
      expect(game.player2.username).toBe('viewer123');
    });

    test('should start chess from challenge with deterministic white/black roles', () => {
      plugin.db = {
        getGameConfig: jest.fn(() => ({
          ...plugin.defaultConfigs.chess,
          streamerRole: 'white'
        })),
        updateSession: jest.fn(),
        addPlayer2: jest.fn(),
        getGameMedia: jest.fn(() => null)
      };

      plugin.startGameFromChallenge(99, {
        gameType: 'chess',
        challengerUsername: 'viewer123',
        challengerNickname: 'Viewer Name'
      }, 'streamer');

      const game = plugin.activeSessions.get(99);

      expect(plugin.db.updateSession).toHaveBeenCalledWith(99, expect.objectContaining({
        player1_username: 'streamer',
        player1_role: 'streamer'
      }));
      expect(plugin.db.addPlayer2).toHaveBeenCalledWith(99, 'viewer123', 'viewer');
      expect(game.whitePlayer.username).toBe('streamer');
      expect(game.blackPlayer.username).toBe('viewer123');
      expect(game.whitePlayer.side).toBe('white');
      expect(game.blackPlayer.side).toBe('black');

      if (game.timerInterval) {
        clearInterval(game.timerInterval);
      }
    });

    test('should accept chess challenge and remove pending challenge entry', () => {
      plugin.db = {
        getGameConfig: jest.fn(() => ({
          ...plugin.defaultConfigs.chess,
          streamerRole: 'black'
        })),
        updateSession: jest.fn(),
        addPlayer2: jest.fn(),
        getGameMedia: jest.fn(() => null)
      };

      plugin.pendingChallenges.set(100, {
        sessionId: 100,
        gameType: 'chess',
        challengerUsername: 'viewer123',
        challengerNickname: 'Viewer Name'
      });

      plugin.acceptChallenge(100);

      expect(plugin.pendingChallenges.has(100)).toBe(false);
      expect(mockSocketIO.emit).toHaveBeenCalledWith(
        'game-engine:game-started',
        expect.objectContaining({
          sessionId: 100,
          gameType: 'chess'
        })
      );

      const game = plugin.activeSessions.get(100);
      expect(game).toBeDefined();
      expect(game.whitePlayer.username).toBe('viewer123');
      expect(game.blackPlayer.username).toBe('streamer');

      if (game.timerInterval) {
        clearInterval(game.timerInterval);
      }
    });

    test('should support passing viewer opponent when accepting challenge', () => {
      plugin.db = {
        getGameConfig: jest.fn(() => ({
          ...plugin.defaultConfigs.connect4,
          streamerRole: 'player1'
        })),
        updateSession: jest.fn(),
        addPlayer2: jest.fn(),
        getGameMedia: jest.fn(() => null)
      };

      plugin.pendingChallenges.set(101, {
        sessionId: 101,
        gameType: 'connect4',
        challengerUsername: 'viewer123',
        challengerNickname: 'Viewer One'
      });

      plugin.acceptChallenge(101, 'viewer456');

      expect(plugin.db.addPlayer2).toHaveBeenCalledWith(101, 'viewer456', 'viewer');
      expect(mockSocketIO.emit).toHaveBeenCalledWith(
        'game-engine:game-started',
        expect.objectContaining({
          sessionId: 101,
          gameType: 'connect4'
        })
      );

      const game = plugin.activeSessions.get(101);
      expect(game).toBeDefined();
      expect(game.player1.username).toBe('viewer123');
      expect(game.player2.username).toBe('viewer456');
      expect(plugin.pendingChallenges.has(101)).toBe(false);
    });

    test('should allow viewer opponent to start chess challenge with both viewer sides represented', () => {
      plugin.db = {
        getGameConfig: jest.fn(() => ({
          ...plugin.defaultConfigs.chess,
          streamerRole: 'white'
        })),
        updateSession: jest.fn(),
        addPlayer2: jest.fn(),
        getGameMedia: jest.fn(() => null)
      };

      plugin.pendingChallenges.set(102, {
        sessionId: 102,
        gameType: 'chess',
        challengerUsername: 'viewer123',
        challengerNickname: 'Viewer One'
      });

      plugin.acceptChallenge(102, 'viewer456');

      expect(plugin.db.addPlayer2).toHaveBeenCalledWith(102, 'viewer456', 'viewer');
      const game = plugin.activeSessions.get(102);
      expect(game).toBeDefined();
      expect(game.whitePlayer.username).toBe('viewer456');
      expect(game.blackPlayer.username).toBe('viewer123');

      if (game.timerInterval) {
        clearInterval(game.timerInterval);
      }
    });

    test('should assign player objects correctly when Connect4 challenge is accepted by viewer with streamerRole player2', () => {
      plugin.db = {
        getGameConfig: jest.fn(() => ({
          ...plugin.defaultConfigs.connect4,
          streamerRole: 'player2'
        })),
        updateSession: jest.fn(),
        addPlayer2: jest.fn(),
        getGameMedia: jest.fn(() => null)
      };

      plugin.pendingChallenges.set(103, {
        sessionId: 103,
        gameType: 'connect4',
        challengerUsername: 'viewer123',
        challengerNickname: 'Viewer One'
      });

      plugin.acceptChallenge(103, 'viewer456');

      const game = plugin.activeSessions.get(103);
      expect(game).toBeDefined();
      expect(game.player1.username).toBe('viewer123');
      expect(game.player2.username).toBe('viewer456');
      expect(game.player1.role).toBe('viewer');
      expect(game.player2.role).toBe('viewer');
      expect(plugin.db.addPlayer2).toHaveBeenCalledWith(103, 'viewer456', 'viewer');
    });

    test('should ignore malformed challenge payload without gameType', () => {
      plugin.db = {
        getGameConfig: jest.fn(),
        updateSession: jest.fn(),
        addPlayer2: jest.fn()
      };

      expect(() => {
        plugin.startGameFromChallenge(101, null, 'streamer');
      }).not.toThrow();
    });

    test('should ignore malformed challenge payload without challengerUsername', () => {
      plugin.db = {
        getGameConfig: jest.fn(),
        updateSession: jest.fn(),
        addPlayer2: jest.fn()
      };

      expect(() => {
        plugin.startGameFromChallenge(101, { gameType: 'connect4' }, 'streamer');
      }).not.toThrow();
    });

    test('should ignore challenge acceptance when opponent equals challenger', () => {
      plugin.db = {
        getGameConfig: jest.fn(() => ({
          ...plugin.defaultConfigs.connect4
        })),
        updateSession: jest.fn(),
        addPlayer2: jest.fn()
      };

      expect(() => {
        plugin.startGameFromChallenge(104, {
          gameType: 'connect4',
          challengerUsername: 'viewer123',
          challengerNickname: 'Viewer One'
        }, 'viewer123');
      }).not.toThrow();

      expect(plugin.db.addPlayer2).not.toHaveBeenCalled();
      expect(plugin.activeSessions.has(104)).toBe(false);
    });

    test('should ignore malformed challenge payload on acceptChallenge and clear pending entry', () => {
      plugin.db = {
        getGameConfig: jest.fn(),
        updateSession: jest.fn(),
        addPlayer2: jest.fn()
      };

      plugin.pendingChallenges.set(105, {
        sessionId: 105,
        gameType: 'connect4'
      });

      expect(() => {
        plugin.acceptChallenge(105, 'streamer');
      }).not.toThrow();

      expect(plugin.pendingChallenges.has(105)).toBe(false);
      expect(plugin.db.addPlayer2).not.toHaveBeenCalled();
      expect(plugin.activeSessions.has(105)).toBe(false);
    });

    test('should clear timeout when challenge is accepted by viewer opponent', () => {
      jest.useFakeTimers();
      plugin.db = {
        getGameConfig: jest.fn(() => ({
          ...plugin.defaultConfigs.connect4
        })),
        getGameMedia: jest.fn(() => null),
        updateSession: jest.fn(),
        addPlayer2: jest.fn()
      };

      const timeoutHandle = setTimeout(() => {}, 10000);
      const clearSpy = jest.spyOn(global, 'clearTimeout').mockImplementation(() => {});

      plugin.pendingChallenges.set(108, {
        sessionId: 108,
        gameType: 'connect4',
        challengerUsername: 'viewer123',
        challengerNickname: 'Viewer One',
        timeout: timeoutHandle
      });

      plugin.acceptChallenge(108, 'viewer456');

      expect(clearSpy).toHaveBeenCalledWith(timeoutHandle);
      expect(plugin.pendingChallenges.has(108)).toBe(false);

      clearSpy.mockRestore();
      jest.useRealTimers();
    });

    test('should accept timeout challenge as streamer by default', () => {
      plugin.db = {
        getGameConfig: jest.fn(() => ({
          ...plugin.defaultConfigs.connect4
        })),
        getGameMedia: jest.fn(() => null),
        updateSession: jest.fn(),
        addPlayer2: jest.fn(),
        getChallenge: jest.fn()
      };

      plugin.pendingChallenges.set(106, {
        sessionId: 106,
        gameType: 'connect4',
        challengerUsername: 'viewer123',
        challengerNickname: 'Viewer One'
      });

      const startSpy = jest.spyOn(plugin, 'startGameFromChallenge').mockImplementation(() => {});

      plugin.acceptChallengeAsStreamer(106);

      expect(startSpy).toHaveBeenCalledWith(106, expect.objectContaining({
        challengerUsername: 'viewer123'
      }), 'streamer');
      expect(plugin.pendingChallenges.has(106)).toBe(false);
    });

    test('should clear timeout when accepting challenge as streamer', () => {
      jest.useFakeTimers();
      plugin.db = {
        getGameConfig: jest.fn(() => ({
          ...plugin.defaultConfigs.connect4
        })),
        getGameMedia: jest.fn(() => null),
        updateSession: jest.fn(),
        addPlayer2: jest.fn()
      };

      const timeoutHandle = setTimeout(() => {}, 10000);
      const clearSpy = jest.spyOn(global, 'clearTimeout').mockImplementation(() => {});

      plugin.pendingChallenges.set(107, {
        sessionId: 107,
        gameType: 'connect4',
        challengerUsername: 'viewer123',
        challengerNickname: 'Viewer One',
        timeout: timeoutHandle
      });

      plugin.acceptChallengeAsStreamer(107);

      expect(clearSpy).toHaveBeenCalledWith(timeoutHandle);
      expect(plugin.pendingChallenges.has(107)).toBe(false);

      clearSpy.mockRestore();
      jest.useRealTimers();
    });

    test('should forward opponentUsername from socket event to acceptChallenge', () => {
      let connectionHandler;
      let acceptChallengeHandler;
      const socketForConnection = {
        on: jest.fn((event, callback) => {
          if (event === 'game-engine:accept-challenge') {
            acceptChallengeHandler = callback;
          }
        })
      };

      mockSocketIO.on.mockImplementation((event, handler) => {
        if (event === 'connection') {
          connectionHandler = handler;
        }
      });

      const acceptSpy = jest.spyOn(plugin, 'acceptChallenge').mockImplementation(() => {});

      plugin.registerSocketEvents();
      connectionHandler(socketForConnection);
      acceptChallengeHandler({
        sessionId: 123,
        opponentUsername: 'viewer456'
      });

      expect(acceptSpy).toHaveBeenCalledWith(123, 'viewer456');
    });
  });

  describe('Manual Mode', () => {
    beforeEach(() => {
      plugin.db = {
        createSession: jest.fn(() => 1),
        addPlayer2: jest.fn(),
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4),
        getSession: jest.fn(() => ({
          id: 1,
          game_type: 'connect4',
          player1_username: 'Player1',
          player2_username: 'Player2'
        })),
        saveMove: jest.fn()
      };
    });

    test('should start manual game', () => {
      const sessionId = plugin.startManualGame('connect4', 'Player1', 'Player2', 'manual');
      
      expect(sessionId).toBe(1);
      expect(plugin.activeSessions.has(1)).toBe(true);
      expect(mockSocketIO.emit).toHaveBeenCalledWith(
        'game-engine:game-started',
        expect.objectContaining({
          sessionId: 1,
          gameType: 'connect4',
          manual: true
        })
      );
    });

    test('should make manual move', () => {
      // Start manual game first
      const sessionId = plugin.startManualGame('connect4', 'Player1', 'Player2', 'manual');
      
      const result = plugin.makeManualMove(sessionId, 1, 'A');
      
      expect(result.success).toBe(true);
      expect(mockSocketIO.emit).toHaveBeenCalledWith(
        'game-engine:move-made',
        expect.objectContaining({
          sessionId,
          manual: true
        })
      );
    });

    test('should reject manual move for invalid session', () => {
      const result = plugin.makeManualMove(999, 1, 'A');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should support bot opponent', () => {
      const sessionId = plugin.startManualGame('connect4', 'Player1', 'Bot', 'bot');
      
      expect(sessionId).toBe(1);
      expect(plugin.db.addPlayer2).toHaveBeenCalledWith(1, 'Bot', 'bot');
    });
  });

  describe('Cleanup', () => {
    test('should unregister GCCE commands on destroy', async () => {
      plugin.registerGCCECommands();
      const gcceInstance = mockApi.pluginLoader.loadedPlugins.get('gcce').instance;
      
      await plugin.destroy();
      
      expect(gcceInstance.unregisterCommandsForPlugin).toHaveBeenCalledWith('game-engine');
    });
  });

  describe('Customizable Chat Command', () => {
    test('should use custom chat command from config', () => {
      // Setup mock database with custom chat command
      plugin.db = {
        getGameConfig: jest.fn(() => ({
          ...plugin.defaultConfigs.connect4,
          chatCommand: 'start4'
        })),
        getTriggers: jest.fn(() => [])
      };
      
      plugin.registerGCCECommands();
      
      // Check that custom command is registered instead of default
      const customCommand = registeredCommands.find(cmd => cmd.name === 'start4');
      expect(customCommand).toBeDefined();
      expect(customCommand.description).toContain('Start');
      expect(customCommand.syntax).toBe('/start4');
    });

    test('should default to c4start when no custom command configured', () => {
      // Setup mock database without custom chat command
      plugin.db = {
        getGameConfig: jest.fn(() => null),
        getTriggers: jest.fn(() => [])
      };
      
      plugin.registerGCCECommands();
      
      // Check that default command is used
      const defaultCommand = registeredCommands.find(cmd => cmd.name === 'c4start');
      expect(defaultCommand).toBeDefined();
      expect(defaultCommand.syntax).toBe('/c4start');
    });

    test('should fallback to c4start if chatCommand is empty', () => {
      // Setup mock database with empty chat command
      plugin.db = {
        getGameConfig: jest.fn(() => ({
          ...plugin.defaultConfigs.connect4,
          chatCommand: ''
        })),
        getTriggers: jest.fn(() => [])
      };
      
      plugin.registerGCCECommands();
      
      // Check that default command is used
      const defaultCommand = registeredCommands.find(cmd => cmd.name === 'c4start');
      expect(defaultCommand).toBeDefined();
    });

    test('routes bare configured chat commands through FIFO matchmaking', () => {
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4),
        getTriggers: jest.fn(() => []),
        getActiveSessionForPlayer: jest.fn(() => null)
      };
      plugin.interactiveController = {
        destroy: jest.fn(),
        startOrJoinConnect4Matchmaking: jest.fn(() => ({
          success: true,
          action: 'opened',
          challenge: { challengeId: 44, status: 'open', expiresAtMs: Date.now() + 30000 }
        }))
      };
      plugin.wheelGame = {
        findWheelByChatCommand: jest.fn(() => null)
      };
      plugin.slotGame = {
        findMachineByChatCommand: jest.fn(() => null),
        destroy: jest.fn()
      };

      plugin.handleChatCommand({
        uniqueId: 'user123',
        nickname: 'TestUser',
        comment: 'c4start'
      });

      expect(plugin.interactiveController.startOrJoinConnect4Matchmaking).toHaveBeenCalledWith(expect.objectContaining({
        participantId: 'user123',
        participantDisplayName: 'TestUser'
      }));
      plugin._clearConnect4MatchmakingExpiry(44);
    });
  });

  describe('Database Trigger Integration', () => {
    beforeEach(() => {
      // Reset registered commands
      registeredCommands = [];
    });

    test('should register custom DB triggers for Connect4', () => {
      // Setup mock database with triggers
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4),
        getTriggers: jest.fn(() => [
          {
            id: 1,
            game_type: 'connect4',
            trigger_type: 'command',
            trigger_value: '/play',
            enabled: 1
          },
          {
            id: 2,
            game_type: 'connect4',
            trigger_type: 'command',
            trigger_value: '!challenge',
            enabled: 1
          }
        ])
      };
      
      plugin.registerGCCECommands();
      
      // Check that custom triggers are registered
      const playCommand = registeredCommands.find(cmd => cmd.name === 'play');
      expect(playCommand).toBeDefined();
      expect(playCommand.description).toContain('custom trigger: /play');
      expect(playCommand.permission).toBe('all');
      
      const challengeCommand = registeredCommands.find(cmd => cmd.name === 'challenge');
      expect(challengeCommand).toBeDefined();
      expect(challengeCommand.description).toContain('custom trigger: !challenge');
    });

    test('should not register duplicate commands from DB triggers', () => {
      // Setup mock database with a trigger that duplicates existing command
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4),
        getTriggers: jest.fn(() => [
          {
            id: 1,
            game_type: 'connect4',
            trigger_type: 'command',
            trigger_value: '/c4', // This already exists
            enabled: 1
          }
        ])
      };
      
      plugin.registerGCCECommands();
      
      // Count how many c4 commands are registered
      const c4Commands = registeredCommands.filter(cmd => cmd.name === 'c4');
      expect(c4Commands.length).toBe(1); // Should only have one
    });

    test('should register DB triggers for different game types', () => {
      // Setup mock database with triggers for multiple games
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4),
        getTriggers: jest.fn(() => [
          {
            id: 1,
            game_type: 'connect4',
            trigger_type: 'command',
            trigger_value: '/play',
            enabled: 1
          },
          {
            id: 2,
            game_type: 'chess',
            trigger_type: 'command',
            trigger_value: '/chess',
            enabled: 1
          },
          {
            id: 3,
            game_type: 'plinko',
            trigger_type: 'command',
            trigger_value: '/drop',
            enabled: 1
          }
        ])
      };
      
      plugin.registerGCCECommands();
      
      // Check that all game type commands are registered
      const playCommand = registeredCommands.find(cmd => cmd.name === 'play');
      expect(playCommand).toBeDefined();
      
      const chessCommand = registeredCommands.find(cmd => cmd.name === 'chess');
      expect(chessCommand).toBeDefined();
      
      const dropCommand = registeredCommands.find(cmd => cmd.name === 'drop');
      expect(dropCommand).toBeDefined();
    });

    test('should handle DB trigger matching in chat command handler', () => {
      // Setup mock database
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4),
        getTriggers: jest.fn(() => [
          {
            id: 1,
            game_type: 'connect4',
            trigger_type: 'command',
            trigger_value: '/play',
            enabled: 1
          }
        ])
      };
      
      plugin.handleGameStart = jest.fn();
      plugin.wheelGame = {
        findWheelByChatCommand: jest.fn(() => null)
      };
      
      // Test exact match
      plugin.handleChatCommand({
        uniqueId: 'user123',
        nickname: 'TestUser',
        comment: '/play'
      });
      
      expect(plugin.handleGameStart).toHaveBeenCalledWith(
        'connect4',
        'user123',
        'TestUser',
        'command',
        '/play'
      );
    });

    test('should match DB triggers with different prefixes', () => {
      // Setup mock database
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4),
        getTriggers: jest.fn(() => [
          {
            id: 1,
            game_type: 'connect4',
            trigger_type: 'command',
            trigger_value: 'play', // No prefix in DB
            enabled: 1
          }
        ])
      };
      
      plugin.handleGameStart = jest.fn();
      plugin.wheelGame = {
        findWheelByChatCommand: jest.fn(() => null)
      };
      
      // Test with / prefix
      plugin.handleChatCommand({
        uniqueId: 'user123',
        nickname: 'TestUser',
        comment: '/play'
      });
      
      expect(plugin.handleGameStart).toHaveBeenCalledWith(
        'connect4',
        'user123',
        'TestUser',
        'command',
        'play'
      );
      
      plugin.handleGameStart.mockClear();
      
      // Test with ! prefix
      plugin.handleChatCommand({
        uniqueId: 'user123',
        nickname: 'TestUser',
        comment: '!play'
      });
      
      expect(plugin.handleGameStart).toHaveBeenCalledWith(
        'connect4',
        'user123',
        'TestUser',
        'command',
        'play'
      );
    });

    test('should match DB triggers when stored with prefix', () => {
      // Setup mock database with trigger that has prefix
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4),
        getTriggers: jest.fn(() => [
          {
            id: 1,
            game_type: 'connect4',
            trigger_type: 'command',
            trigger_value: '/challenge', // Prefix in DB
            enabled: 1
          }
        ])
      };
      
      plugin.handleGameStart = jest.fn();
      plugin.wheelGame = {
        findWheelByChatCommand: jest.fn(() => null)
      };
      
      // Test with exact match
      plugin.handleChatCommand({
        uniqueId: 'user123',
        nickname: 'TestUser',
        comment: '/challenge'
      });
      
      expect(plugin.handleGameStart).toHaveBeenCalled();
      
      plugin.handleGameStart.mockClear();
      
      // Test with ! prefix (should also match)
      plugin.handleChatCommand({
        uniqueId: 'user123',
        nickname: 'TestUser',
        comment: '!challenge'
      });
      
      expect(plugin.handleGameStart).toHaveBeenCalled();
    });
  });
});
