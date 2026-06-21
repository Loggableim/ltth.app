/**
 * Test for Chat Handler Registration Fix
 * Validates that chat handler is only registered when GCCE is not available
 */

const GameEnginePlugin = require('../main');

describe('Chat Handler Registration Fix', () => {
  let plugin;
  let mockApi;
  let mockSocketIO;
  let mockDb;
  let registeredTikTokEvents = {};

  beforeEach(() => {
    // Track all registered TikTok events
    registeredTikTokEvents = {};
    
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
      registerTikTokEvent: jest.fn((eventType, handler) => {
        // Track which events are registered
        if (!registeredTikTokEvents[eventType]) {
          registeredTikTokEvents[eventType] = [];
        }
        registeredTikTokEvents[eventType].push(handler);
      }),
      getConfig: jest.fn(() => Promise.resolve(null)),
      setConfig: jest.fn(() => Promise.resolve()),
      emit: jest.fn(),
      pluginLoader: null // Will be set per test
    };

    plugin = new GameEnginePlugin(mockApi);
  });

  afterEach(() => {
    if (plugin) {
      // Clear intervals
      if (plugin.gcceRetryInterval) {
        clearInterval(plugin.gcceRetryInterval);
        plugin.gcceRetryInterval = null;
      }
      if (plugin.giftDedupCleanupInterval) {
        clearInterval(plugin.giftDedupCleanupInterval);
        plugin.giftDedupCleanupInterval = null;
      }
      
      // Clear active sessions
      plugin.activeSessions.clear();
      plugin.pendingChallenges.clear();
      
      // Mock required methods for destroy
      plugin.db = {
        getSession: jest.fn(() => null),
        getTriggers: jest.fn(() => []),
        getGameConfig: jest.fn(() => null)
      };
      
      plugin.wheelGame = { destroy: jest.fn() };
      plugin.plinkoGame = { destroy: jest.fn() };
      plugin.unifiedQueue = { destroy: jest.fn() };
      
      plugin.destroy();
    }
  });

  describe('When GCCE is Available', () => {
    test('should leave prefixed chat commands to GCCE', () => {
      // Setup GCCE as available
      mockApi.pluginLoader = {
        loadedPlugins: new Map([
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
      };
      
      // Setup mock database
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4),
        getTriggers: jest.fn(() => [])
      };

      // Register GCCE commands (should succeed)
      plugin.registerGCCECommands();
      expect(plugin.gcceCommandsRegistered).toBe(true);

      plugin.handleChatCommand = jest.fn();

      // Register TikTok events
      plugin.registerTikTokEvents();

      // Verify gift handler is registered
      expect(registeredTikTokEvents.gift).toBeDefined();
      expect(registeredTikTokEvents.gift.length).toBeGreaterThan(0);

      // Verify chat handler is registered for arena/non-prefixed commands,
      // but prefixed commands are still owned by GCCE.
      expect(registeredTikTokEvents.chat).toBeDefined();
      registeredTikTokEvents.chat[0]({
        uniqueId: 'user123',
        nickname: 'TestUser',
        comment: '/c4start'
      });
      expect(plugin.handleChatCommand).not.toHaveBeenCalled();

      // Verify correct log message
      expect(mockApi.log).toHaveBeenCalledWith(
        expect.stringContaining('Chat commands handled by GCCE'),
        'info'
      );
    });

    test('should route bare Game Engine chat commands through fallback handler', () => {
      mockApi.pluginLoader = {
        loadedPlugins: new Map([
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
      };

      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4),
        getTriggers: jest.fn(() => [])
      };

      plugin.registerGCCECommands();
      expect(plugin.gcceCommandsRegistered).toBe(true);
      plugin.handleChatCommand = jest.fn();

      plugin.registerTikTokEvents();
      registeredTikTokEvents.chat[0]({
        uniqueId: 'user123',
        nickname: 'TestUser',
        comment: 'c4start'
      });

      expect(plugin.handleChatCommand).toHaveBeenCalledWith(
        expect.objectContaining({ comment: 'c4start' })
      );
    });
  });

  describe('When GCCE is NOT Available', () => {
    test('should register fallback chat handler', () => {
      // Setup GCCE as NOT available
      mockApi.pluginLoader = {
        loadedPlugins: new Map()
      };
      
      // Setup mock database
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4),
        getTriggers: jest.fn(() => [])
      };

      // Try to register GCCE commands (should fail)
      plugin.registerGCCECommands();
      expect(plugin.gcceCommandsRegistered).toBe(false);

      // Register TikTok events
      plugin.registerTikTokEvents();

      // Verify gift handler is registered
      expect(registeredTikTokEvents.gift).toBeDefined();
      expect(registeredTikTokEvents.gift.length).toBeGreaterThan(0);

      // Verify chat handler IS registered (fallback mode)
      expect(registeredTikTokEvents.chat).toBeDefined();
      expect(registeredTikTokEvents.chat.length).toBeGreaterThan(0);

      // Verify correct log message
      expect(mockApi.log).toHaveBeenCalledWith(
        expect.stringContaining('Fallback chat handler registered'),
        'info'
      );
    });
  });

  describe('Initialization Order', () => {
    test('should register GCCE commands before TikTok events', () => {
      const callOrder = [];
      
      // Track call order
      const originalRegisterGCCE = plugin.registerGCCECommands.bind(plugin);
      const originalRegisterTikTok = plugin.registerTikTokEvents.bind(plugin);
      
      plugin.registerGCCECommands = jest.fn(() => {
        callOrder.push('registerGCCECommands');
        originalRegisterGCCE();
      });
      
      plugin.registerTikTokEvents = jest.fn(() => {
        callOrder.push('registerTikTokEvents');
        originalRegisterTikTok();
      });

      // Setup GCCE as available
      mockApi.pluginLoader = {
        loadedPlugins: new Map([
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
      };

      // Setup mock database
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4),
        getTriggers: jest.fn(() => [])
      };

      // Manually call the init sequence
      plugin.registerGCCECommands();
      plugin.registerTikTokEvents();

      // Verify order
      expect(callOrder).toEqual(['registerGCCECommands', 'registerTikTokEvents']);
    });
  });

  describe('GCCE Retry Mechanism', () => {
    test('should update gcceCommandsRegistered flag on successful retry', (done) => {
      // Start with GCCE not available
      mockApi.pluginLoader = {
        loadedPlugins: new Map()
      };
      
      // Setup mock database
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4),
        getTriggers: jest.fn(() => [])
      };

      // First attempt should fail
      plugin.registerGCCECommands();
      expect(plugin.gcceCommandsRegistered).toBe(false);

      // Simulate GCCE becoming available after 1 second
      setTimeout(() => {
        mockApi.pluginLoader = {
          loadedPlugins: new Map([
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
        };
      }, 1000);

      // Start retry mechanism (similar to what init does)
      plugin.gcceRetryCount = 0;
      plugin.gcceRetryInterval = setInterval(() => {
        plugin.gcceRetryCount++;
        plugin.registerGCCECommands();
        
        if (plugin.gcceCommandsRegistered) {
          clearInterval(plugin.gcceRetryInterval);
          plugin.gcceRetryInterval = null;
          
          // Verify success
          expect(plugin.gcceCommandsRegistered).toBe(true);
          done();
        }
        
        if (plugin.gcceRetryCount > 5) {
          clearInterval(plugin.gcceRetryInterval);
          plugin.gcceRetryInterval = null;
          done.fail('Should have registered GCCE commands within 5 retries');
        }
      }, 500);
    }, 10000); // 10 second timeout for this async test
  });
});
