/**
 * GCCE Integration and Manual Mode Tests
 */

const GameEnginePlugin = require('../main');

describe('Game Engine GCCE Integration', () => {
  let plugin;
  let mockApi;
  let mockSocketIO;
  let mockDb;
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
  });

  describe('Connect4 Start Command Handler', () => {
    test('should start game when no active session', async () => {
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
      
      plugin.handleGameStart = jest.fn();
      
      const result = await plugin.handleConnect4StartCommand(args, context);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Game started');
      expect(plugin.handleGameStart).toHaveBeenCalledWith(
        'connect4',
        'test123',      // userId (unique TikTok ID)
        'Test User',    // nickname for display
        'command',
        '/c4start'
      );
    });

    test('should queue game when another game is already active', async () => {
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
      
      plugin.handleGameStart = jest.fn();
      
      const result = await plugin.handleConnect4StartCommand(args, context);
      
      // When there's an active game, the command should queue and return success
      expect(result.success).toBe(true);
      expect(result.message).toContain('queued');
      expect(plugin.handleGameStart).toHaveBeenCalled();
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

    test('should start Connect4 from bare configured chat command', () => {
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4),
        getTriggers: jest.fn(() => []),
        getActiveSessionForPlayer: jest.fn(() => null)
      };
      plugin.handleGameStart = jest.fn();
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

      expect(plugin.handleGameStart).toHaveBeenCalledWith(
        'connect4',
        'user123',
        'TestUser',
        'command',
        '/c4start'
      );
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
