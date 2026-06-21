/**
 * Test suite for viewer-leaderboard plugin (consolidated)
 * 
 * Verifies that the consolidated plugin correctly:
 * - Initializes the Viewer XP System with integrated leaderboard
 * - Handles initialization errors gracefully
 * - Properly cleans up on shutdown
 * 
 * Note: The standalone viewer-xp plugin has been removed and consolidated into viewer-leaderboard.
 * The viewer-leaderboard plugin now contains all the implementation directly.
 */

const ViewerLeaderboardPlugin = require('../plugins/viewer-leaderboard/main');

describe('Viewer-Leaderboard Plugin (Consolidated)', () => {
  let mockApi;
  let plugin;

  beforeEach(() => {
    // Mock API object
    mockApi = {
      log: jest.fn(),
      getDatabase: jest.fn(() => ({
        db: {
          prepare: jest.fn(() => ({
            run: jest.fn(),
            get: jest.fn(),
            all: jest.fn(),
            exec: jest.fn()
          })),
          transaction: jest.fn((fn) => fn),
          exec: jest.fn()
        },
        streamerId: 'test-streamer'
      })),
      getSocketIO: jest.fn(() => ({
        on: jest.fn(),
        emit: jest.fn()
      })),
      registerRoute: jest.fn(),
      registerSocket: jest.fn(),
      registerTikTokEvent: jest.fn(),
      emit: jest.fn(),
      getPluginDataDir: jest.fn(() => '/tmp/test-plugin-data'),
      ensurePluginDataDir: jest.fn(),
      pluginLoader: {
        plugins: new Map(),
        state: {},
        loadedPlugins: new Map()
      }
    };
  });

  afterEach(async () => {
    if (plugin) {
      try {
        await plugin.destroy();
      } catch (error) {
        // Ignore cleanup errors in tests
      }
      plugin = null;
    }
  });

  describe('Initialization', () => {
    test('should create plugin instance successfully', () => {
      plugin = new ViewerLeaderboardPlugin(mockApi);
      expect(plugin).toBeDefined();
      expect(plugin.db).toBeDefined();
    });

    test('should initialize successfully', async () => {
      plugin = new ViewerLeaderboardPlugin(mockApi);
      
      await plugin.init();

      expect(mockApi.log).toHaveBeenCalledWith(
        expect.stringContaining('Initializing Viewer XP System Plugin'),
        'info'
      );
      expect(mockApi.log).toHaveBeenCalledWith(
        expect.stringContaining('Viewer XP System initialized successfully'),
        'info'
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle initialization errors gracefully', async () => {
      plugin = new ViewerLeaderboardPlugin(mockApi);
      
      // Simulate database initialization failure
      const dbError = new Error('Database initialization failed');
      plugin.db.initialize = jest.fn(() => {
        throw dbError;
      });

      await expect(plugin.init()).rejects.toThrow();
    });
  });

  describe('Destruction', () => {
    test('should destroy plugin successfully', async () => {
      plugin = new ViewerLeaderboardPlugin(mockApi);
      
      await plugin.init();
      await plugin.destroy();

      expect(mockApi.log).toHaveBeenCalledWith(
        expect.stringContaining('Shutting down'),
        'info'
      );
    });
  });
});
