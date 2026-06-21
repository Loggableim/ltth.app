/**
 * Test suite for Plinko debug mode functionality
 * 
 * Verifies that:
 * - Debug mode can be toggled on/off
 * - Debug logs are only emitted when debug mode is enabled
 * - Environment variable PLINKO_DEBUG initializes debug mode
 */

describe('Plinko Debug Mode', () => {
  let PlinkoGame;
  let mockApi;
  let mockDb;
  let mockLogger;
  let loggedMessages;

  beforeEach(() => {
    // Reset environment variable
    delete process.env.PLINKO_DEBUG;
    
    // Reset module cache to allow re-importing with fresh env
    jest.resetModules();
    
    // Mock dependencies
    loggedMessages = [];
    
    mockLogger = {
      info: jest.fn((msg, data) => {
        loggedMessages.push({ level: 'info', msg, data });
      }),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
    
    mockApi = {
      getSocketIO: jest.fn(() => ({
        emit: jest.fn()
      })),
      pluginLoader: {
        loadedPlugins: new Map()
      }
    };
    
    mockDb = {
      getPlinkoConfig: jest.fn(() => ({
        id: 1,
        slots: [
          { multiplier: 0.5, color: '#FF0000', openshockReward: null },
          { multiplier: 1.0, color: '#00FF00', openshockReward: null },
          { multiplier: 2.0, color: '#0000FF', openshockReward: { enabled: true, type: 'Shock', intensity: 50, duration: 1000, deviceIds: ['device1'] } }
        ],
        physicsSettings: {
          gravity: 1.0,
          ballRestitution: 0.6,
          pegRestitution: 0.8,
          pegRows: 12,
          pegSpacing: 60,
          testModeEnabled: false,
          maxSimultaneousBalls: 5
        }
      }))
    };
    
    // Load the PlinkoGame class
    PlinkoGame = require('../plugins/game-engine/games/plinko');
  });

  test('should initialize with debug mode disabled by default', () => {
    const plinkoGame = new PlinkoGame(mockApi, mockDb, mockLogger);
    expect(plinkoGame.debugMode).toBe(false);
  });

  test('should initialize with debug mode enabled when PLINKO_DEBUG env var is true', () => {
    process.env.PLINKO_DEBUG = 'true';
    jest.resetModules();
    PlinkoGame = require('../plugins/game-engine/games/plinko');
    
    const plinkoGame = new PlinkoGame(mockApi, mockDb, mockLogger);
    expect(plinkoGame.debugMode).toBe(true);
  });

  test('should not log debug messages when debug mode is disabled', () => {
    const plinkoGame = new PlinkoGame(mockApi, mockDb, mockLogger);
    
    plinkoGame._debugLog('Test debug message');
    
    const debugLogs = loggedMessages.filter(log => log.msg.includes('[Plinko Debug]'));
    expect(debugLogs.length).toBe(0);
  });

  test('should log debug messages when debug mode is enabled', () => {
    const plinkoGame = new PlinkoGame(mockApi, mockDb, mockLogger);
    plinkoGame.setDebugMode(true);
    
    loggedMessages = []; // Clear logs from setDebugMode
    plinkoGame._debugLog('Test debug message');
    
    const debugLogs = loggedMessages.filter(log => log.msg.includes('[Plinko Debug]'));
    expect(debugLogs.length).toBe(1);
    expect(debugLogs[0].msg).toContain('Test debug message');
  });

  test('should toggle debug mode on and off', () => {
    const plinkoGame = new PlinkoGame(mockApi, mockDb, mockLogger);
    
    expect(plinkoGame.debugMode).toBe(false);
    
    plinkoGame.setDebugMode(true);
    expect(plinkoGame.debugMode).toBe(true);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('enabled'));
    
    plinkoGame.setDebugMode(false);
    expect(plinkoGame.debugMode).toBe(false);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('disabled'));
  });

  test('should log debug data when provided', () => {
    const plinkoGame = new PlinkoGame(mockApi, mockDb, mockLogger);
    plinkoGame.setDebugMode(true);
    
    loggedMessages = []; // Clear logs from setDebugMode
    const testData = { slotIndex: 2, multiplier: 2.0 };
    plinkoGame._debugLog('Test with data', testData);
    
    const debugLogs = loggedMessages.filter(log => log.msg.includes('[Plinko Debug]'));
    expect(debugLogs.length).toBe(1);
    expect(debugLogs[0].data).toEqual(testData);
  });
});
