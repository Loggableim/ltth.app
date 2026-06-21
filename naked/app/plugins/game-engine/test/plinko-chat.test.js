/**
 * Plinko Chat Command Tests
 * Tests for !plinko command handling and HUD integration
 */

const GameEnginePlugin = require('../main');

describe('Plinko Chat Command Integration', () => {
  let plugin;
  let mockApi;
  let mockSocketIO;
  let mockDb;
  let mockViewerLeaderboard;

  beforeEach(() => {
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

    // Mock Viewer Leaderboard Plugin
    mockViewerLeaderboard = {
      instance: {
        db: {
          getViewerProfile: jest.fn((username) => ({
            username: username,
            xp: 1000,
            nickname: 'TestUser'
          })),
          addXP: jest.fn()
        }
      }
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
          ['viewer-leaderboard', mockViewerLeaderboard],
          ['gcce', {
            instance: {
              registerCommandsForPlugin: jest.fn((pluginId, commands) => ({
                registered: commands.map(cmd => cmd.name),
                failed: []
              })),
              unregisterCommandsForPlugin: jest.fn()
            }
          }]
        ])
      }
    };

    plugin = new GameEnginePlugin(mockApi);
    
    // Initialize plugin with mocked Plinko game
    plugin.plinkoGame = {
      init: jest.fn(),
      startCleanupTimer: jest.fn(),
      destroy: jest.fn(),
      spawnBall: jest.fn(async (username, nickname, profilePicUrl, betAmount, ballType) => {
        return { success: true, ballId: 'test-ball-123' };
      }),
      getConfig: jest.fn(() => ({
        slots: [],
        physicsSettings: {},
        giftMappings: {}
      }))
    };

    // Mock wheel game (needed for handleChatCommand to check wheel commands)
    plugin.wheelGame = {
      findWheelByChatCommand: jest.fn(() => null), // Return null = no wheel command match
      destroy: jest.fn()
    };

    plugin.db = {
      getTriggers: jest.fn(() => []),
      getGameConfig: jest.fn(() => null),
      getPlinkoConfig: jest.fn(() => ({
        slots: [],
        physicsSettings: {},
        giftMappings: {}
      }))
    };
  });

  afterEach(() => {
    if (plugin) {
      if (plugin.gcceRetryInterval) {
        clearInterval(plugin.gcceRetryInterval);
        plugin.gcceRetryInterval = null;
      }
      plugin.activeSessions.clear();
      plugin.pendingChallenges.clear();
      plugin.destroy();
    }
  });

  describe('!plinko Command Handling', () => {
    test('should handle !plinko command with amount', async () => {
      const chatData = {
        uniqueId: 'testuser123',
        comment: '!plinko 100',
        nickname: 'TestUser',
        profilePictureUrl: 'https://example.com/avatar.jpg'
      };

      await plugin.handleChatCommand(chatData);

      // Verify spawnBall was called with correct parameters
      expect(plugin.plinkoGame.spawnBall).toHaveBeenCalledWith(
        'testuser123',
        'TestUser',
        'https://example.com/avatar.jpg',
        100,
        'standard'
      );
    });

    test('should handle !plinko command when message field is used', async () => {
      const chatData = {
        userId: 'testuser123',
        message: '!plinko 100',
        nickname: 'TestUser',
        profilePictureUrl: 'https://example.com/avatar.jpg'
      };

      await plugin.handleChatCommand(chatData);

      expect(plugin.plinkoGame.spawnBall).toHaveBeenCalledWith(
        'testuser123',
        'TestUser',
        'https://example.com/avatar.jpg',
        100,
        'standard'
      );
    });

    test('should handle !plinko max command', async () => {
      const chatData = {
        uniqueId: 'testuser123',
        comment: '!plinko max',
        nickname: 'TestUser',
        profilePictureUrl: ''
      };

      await plugin.handleChatCommand(chatData);

      // Verify spawnBall was called with user's max XP (1000)
      expect(plugin.plinkoGame.spawnBall).toHaveBeenCalledWith(
        'testuser123',
        'TestUser',
        '',
        1000, // User has 1000 XP according to mock
        'standard'
      );
    });

    test('should handle !plinko command case-insensitively', async () => {
      const chatData = {
        uniqueId: 'testuser123',
        comment: '!PLINKO 50',
        nickname: 'TestUser',
        profilePictureUrl: ''
      };

      await plugin.handleChatCommand(chatData);

      expect(plugin.plinkoGame.spawnBall).toHaveBeenCalledWith(
        'testuser123',
        'TestUser',
        '',
        50,
        'standard'
      );
    });

    test('should not trigger on partial match', async () => {
      const chatData = {
        uniqueId: 'testuser123',
        comment: '!plinko',
        nickname: 'TestUser'
      };

      await plugin.handleChatCommand(chatData);

      // Should not spawn ball without amount
      expect(plugin.plinkoGame.spawnBall).not.toHaveBeenCalled();
    });
  });

  describe('/plinko GCCE Fallback', () => {
    test('should handle /plinko when GCCE is not registered', async () => {
      plugin.gcceCommandsRegistered = false;

      const chatData = {
        uniqueId: 'testuser123',
        comment: '/plinko 200',
        nickname: 'TestUser',
        profilePictureUrl: ''
      };

      await plugin.handleChatCommand(chatData);

      expect(plugin.plinkoGame.spawnBall).toHaveBeenCalledWith(
        'testuser123',
        'TestUser',
        '',
        200,
        'standard'
      );
    });

    test('should not handle /plinko when GCCE is registered', async () => {
      plugin.gcceCommandsRegistered = true;

      const chatData = {
        uniqueId: 'testuser123',
        comment: '/plinko 200',
        nickname: 'TestUser'
      };

      await plugin.handleChatCommand(chatData);

      // Should let GCCE handle it
      expect(plugin.plinkoGame.spawnBall).not.toHaveBeenCalled();
    });
  });

  describe('Plinko Command Handler', () => {
    test('should handle valid bet amount', async () => {
      const context = {
        username: 'TestUser',
        userId: 'testuser123',
        nickname: 'TestUser',
        profilePictureUrl: ''
      };
      const args = ['100'];

      const result = await plugin.handlePlinkoCommand(args, context);

      expect(result.success).toBe(true);
      expect(result.message).toContain('ball dropped');
      expect(plugin.plinkoGame.spawnBall).toHaveBeenCalledWith(
        'testuser123',
        'TestUser',
        '',
        100,
        'standard'
      );
    });

    test('should handle max bet', async () => {
      const context = {
        username: 'TestUser',
        userId: 'testuser123',
        nickname: 'TestUser',
        profilePictureUrl: ''
      };
      const args = ['max'];

      const result = await plugin.handlePlinkoCommand(args, context);

      expect(result.success).toBe(true);
      expect(plugin.plinkoGame.spawnBall).toHaveBeenCalledWith(
        'testuser123',
        'TestUser',
        '',
        1000, // User's max XP
        'standard'
      );
    });

    test('should reject invalid bet amount', async () => {
      const context = {
        username: 'TestUser',
        userId: 'testuser123',
        nickname: 'TestUser'
      };
      const args = ['invalid'];

      const result = await plugin.handlePlinkoCommand(args, context);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid bet amount');
    });

    test('should handle spawnBall failure', async () => {
      plugin.plinkoGame.spawnBall = jest.fn(async () => ({
        success: false,
        error: 'Insufficient XP'
      }));

      const context = {
        username: 'TestUser',
        userId: 'testuser123',
        nickname: 'TestUser'
      };
      const args = ['5000']; // More than available

      const result = await plugin.handlePlinkoCommand(args, context);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Insufficient XP');
    });
  });

  describe('GCCE Plinko Command Registration', () => {
    test('should register plinko command with GCCE', () => {
      const registeredCommands = [];
      
      mockApi.pluginLoader.loadedPlugins.get('gcce').instance.registerCommandsForPlugin = 
        jest.fn((pluginId, commands) => {
          registeredCommands.push(...commands);
          return {
            registered: commands.map(cmd => cmd.name),
            failed: []
          };
        });

      plugin.registerGCCECommands();

      const plinkoCommand = registeredCommands.find(cmd => cmd.name === 'plinko');
      expect(plinkoCommand).toBeDefined();
      expect(plinkoCommand.description).toContain('Plinko');
      expect(plinkoCommand.permission).toBe('all');
      expect(plinkoCommand.category).toBe('Games');
      expect(plinkoCommand.syntax).toContain('/plinko');
    });
  });

  describe('HUD Socket Events', () => {
    test('should emit plinko:spawn-ball event when ball is spawned', async () => {
      const context = {
        username: 'TestUser',
        userId: 'testuser123',
        nickname: 'TestUser',
        profilePictureUrl: 'https://example.com/avatar.jpg'
      };
      const args = ['100'];

      await plugin.handlePlinkoCommand(args, context);

      // The actual spawnBall in PlinkoGame would emit the event
      // Here we just verify the handler was called
      expect(plugin.plinkoGame.spawnBall).toHaveBeenCalled();
    });
  });
});
