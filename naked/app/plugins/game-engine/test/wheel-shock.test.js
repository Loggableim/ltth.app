/**
 * Wheel Shock Integration Test
 * 
 * Tests that shock segments can be configured and work properly
 */

const WheelGame = require('../games/wheel');
const GameEngineDatabase = require('../backend/database');

// Mock API with OpenShock plugin
const createMockAPI = () => {
  const mockDB = {
    db: null // Will be set with in-memory database
  };

  const mockOpenShockPlugin = {
    instance: {
      devices: [
        { id: 'mock-device-1', name: 'Test Shocker' }
      ],
      openShockClient: {
        sendShock: jest.fn().mockResolvedValue({ success: true })
      }
    }
  };

  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  };

  const mockSocketIO = {
    emit: jest.fn(),
    on: () => {}
  };

  return {
    getSocketIO: () => mockSocketIO,
    getDatabase: () => mockDB,
    log: (msg, level) => {
      // Uncomment for debugging
      // console.log(`[${level || 'info'}] ${msg}`);
    },
    pluginLoader: {
      loadedPlugins: new Map([
        ['openshock', mockOpenShockPlugin]
      ])
    },
    ...mockLogger
  };
};

describe('Wheel Shock Integration', () => {
  let wheelGame;
  let gameDB;
  let mockAPI;

  beforeEach(() => {
    // Create in-memory SQLite database for testing
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    
    mockAPI = createMockAPI();
    mockAPI.getDatabase().db = db;
    
    // Initialize database
    gameDB = new GameEngineDatabase(mockAPI, mockAPI);
    gameDB.initialize();
    
    // Create wheel game instance
    wheelGame = new WheelGame(mockAPI, gameDB, mockAPI);
    wheelGame.init();
  });

  afterEach(() => {
    if (wheelGame) {
      wheelGame.destroy();
    }
  });

  test('Default wheel segments should include shock fields', () => {
    const config = wheelGame.getConfig();
    
    expect(config).toBeDefined();
    expect(config.segments).toBeDefined();
    expect(config.segments.length).toBeGreaterThan(0);
    
    // Check that all segments have shock fields including new fields
    config.segments.forEach(segment => {
      expect(segment).toHaveProperty('isShock');
      expect(segment).toHaveProperty('shockIntensity');
      expect(segment).toHaveProperty('shockDuration');
      expect(segment).toHaveProperty('shockType');
      expect(segment).toHaveProperty('shockDevices');
      expect(typeof segment.isShock).toBe('boolean');
      expect(typeof segment.shockIntensity).toBe('number');
      expect(typeof segment.shockDuration).toBe('number');
      expect(typeof segment.shockType).toBe('string');
      expect(Array.isArray(segment.shockDevices)).toBe(true);
    });
  });

  test('Can create wheel with shock segment', () => {
    const shockSegments = [
      { text: '100 XP', color: '#FF6B6B', weight: 10, isNiete: false, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] },
      { text: 'Shock!', color: '#FF6B00', weight: 5, isNiete: false, isShock: true, shockIntensity: 50, shockDuration: 1000, shockType: 'shock', shockDevices: ['mock-device-1'] }
    ];
    
    const wheelId = wheelGame.createWheel('Test Shock Wheel', shockSegments);
    const config = wheelGame.getConfig(wheelId);
    
    expect(config.segments).toHaveLength(2);
    
    const shockSegment = config.segments.find(s => s.isShock);
    expect(shockSegment).toBeDefined();
    expect(shockSegment.text).toBe('Shock!');
    expect(shockSegment.shockIntensity).toBe(50);
    expect(shockSegment.shockDuration).toBe(1000);
    expect(shockSegment.shockType).toBe('shock');
    expect(shockSegment.shockDevices).toEqual(['mock-device-1']);
  });

  test('Can update wheel with shock segment configuration', () => {
    const config = wheelGame.getConfig();
    const wheelId = config.id;
    
    // Add a shock segment with device selection
    const updatedSegments = [
      ...config.segments,
      { text: 'Test Shock', color: '#FF4500', weight: 3, isNiete: false, isShock: true, shockIntensity: 75, shockDuration: 2000, shockType: 'shock', shockDevices: ['mock-device-1'] }
    ];
    
    wheelGame.updateConfig(wheelId, updatedSegments, config.settings);
    
    // Verify shock segment was saved
    const updatedConfig = wheelGame.getConfig(wheelId);
    const shockSegment = updatedConfig.segments.find(s => s.text === 'Test Shock');
    
    expect(shockSegment).toBeDefined();
    expect(shockSegment.isShock).toBe(true);
    expect(shockSegment.shockIntensity).toBe(75);
    expect(shockSegment.shockDuration).toBe(2000);
    expect(shockSegment.shockType).toBe('shock');
    expect(shockSegment.shockDevices).toEqual(['mock-device-1']);
  });

  test('Shock intensity is clamped to valid range (1-100)', async () => {
    const config = wheelGame.getConfig();
    const wheelId = config.id;
    
    // Create segment with shock including new fields
    const segments = [
      { text: 'Shock Test', color: '#FF4500', weight: 10, isNiete: false, isShock: true, shockIntensity: 150, shockDuration: 1000, shockType: 'shock', shockDevices: ['mock-device-1'] }
    ];
    
    wheelGame.updateConfig(wheelId, segments, config.settings);
    
    // Manually test that triggerShock clamps intensity
    const mockOpenShock = mockAPI.pluginLoader.loadedPlugins.get('openshock').instance;
    const segment = { isShock: true, shockIntensity: 150, shockDuration: 1000, shockType: 'shock', shockDevices: ['mock-device-1'], text: 'Test' };
    const spinData = { username: 'test', nickname: 'Test', spinId: 'test-123' };
    
    await wheelGame.triggerShock(mockOpenShock, segment, spinData, wheelId, 'Test Wheel');
    
    // Verify sendShock was called with clamped intensity (100)
    expect(mockOpenShock.openShockClient.sendShock).toHaveBeenCalled();
    const callArgs = mockOpenShock.openShockClient.sendShock.mock.calls[0];
    expect(callArgs[1]).toBe(100); // intensity should be clamped to 100
  });

  test('Shock duration is clamped to valid range (300-30000)', async () => {
    const mockOpenShock = mockAPI.pluginLoader.loadedPlugins.get('openshock').instance;
    
    // Test with duration too short
    const shortSegment = { isShock: true, shockIntensity: 50, shockDuration: 100, shockType: 'shock', shockDevices: ['mock-device-1'], text: 'Short' };
    const spinData = { username: 'test', nickname: 'Test', spinId: 'test-123' };
    
    await wheelGame.triggerShock(mockOpenShock, shortSegment, spinData, 1, 'Test');
    
    let callArgs = mockOpenShock.openShockClient.sendShock.mock.calls[0];
    expect(callArgs[2]).toBe(300); // duration should be clamped to 300
    
    // Test with duration too long
    mockOpenShock.openShockClient.sendShock.mockClear();
    const longSegment = { isShock: true, shockIntensity: 50, shockDuration: 50000, shockType: 'shock', shockDevices: ['mock-device-1'], text: 'Long' };
    
    await wheelGame.triggerShock(mockOpenShock, longSegment, spinData, 1, 'Test');
    
    callArgs = mockOpenShock.openShockClient.sendShock.mock.calls[0];
    expect(callArgs[2]).toBe(30000); // duration should be clamped to 30000
  });

  test('Shock trigger fails gracefully when OpenShock plugin not available', async () => {
    // Create API without OpenShock plugin
    const apiWithoutPlugin = createMockAPI();
    apiWithoutPlugin.pluginLoader.loadedPlugins.delete('openshock');
    
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    apiWithoutPlugin.getDatabase().db = db;
    
    const testDB = new GameEngineDatabase(apiWithoutPlugin, apiWithoutPlugin);
    testDB.initialize();
    
    const testWheel = new WheelGame(apiWithoutPlugin, testDB, apiWithoutPlugin);
    testWheel.init();
    
    // Create wheel with shock segment including new fields
    const segments = [
      { text: 'Shock', color: '#FF4500', weight: 10, isNiete: false, isShock: true, shockIntensity: 50, shockDuration: 1000, shockType: 'shock', shockDevices: [] }
    ];
    const wheelId = testWheel.createWheel('Test', segments);
    
    // Trigger spin (should not crash)
    const result = await testWheel.triggerSpin('test', 'Test User', '', 'Gift', wheelId);
    
    expect(result.success).toBe(true);
    expect(result.spinId).toBeDefined();
    
    testWheel.destroy();
  });

  test('Spin start event includes shock information', async () => {
    const config = wheelGame.getConfig();
    const wheelId = config.id;
    
    // Create wheel with shock segment including new fields
    const segments = [
      { text: 'Shock Prize', color: '#FF4500', weight: 10, isNiete: false, isShock: true, shockIntensity: 60, shockDuration: 1500, shockType: 'shock', shockDevices: ['mock-device-1'], xpReward: 0, prizeAudio: 1 }
    ];
    
    wheelGame.updateConfig(wheelId, segments, config.settings);
    
    // Get fresh reference to socket
    const socketEmit = mockAPI.getSocketIO().emit;
    
    // Trigger a spin
    const result = await wheelGame.triggerSpin('testuser', 'Test User', '', 'Test Gift', wheelId);
    
    expect(result.success).toBe(true);
    expect(result.winningSegment).toBeDefined();
    expect(result.winningSegment.isShock).toBeDefined();
    expect(result.winningSegment.shockIntensity).toBeDefined();
    expect(result.winningSegment.shockDuration).toBeDefined();
    expect(result.winningSegment.shockType).toBeDefined();
    expect(result.winningSegment.shockDevices).toBeDefined();
    
    // The spin-start event should have been emitted with shock data
    expect(socketEmit).toHaveBeenCalled();
    
    const emitCalls = socketEmit.mock.calls;
    const spinStartCall = emitCalls.find(call => call[0] === 'wheel:spin-start');
    
    expect(spinStartCall).toBeDefined();
    if (spinStartCall) {
      expect(spinStartCall[1].winningSegment.isShock).toBeDefined();
      expect(spinStartCall[1].winningSegment.shockIntensity).toBeDefined();
      expect(spinStartCall[1].winningSegment.shockDuration).toBeDefined();
      expect(spinStartCall[1].winningSegment.shockType).toBeDefined();
      expect(spinStartCall[1].winningSegment.shockDevices).toBeDefined();
    }
  });

  test('Can trigger vibrate instead of shock', async () => {
    const mockOpenShock = mockAPI.pluginLoader.loadedPlugins.get('openshock').instance;
    mockOpenShock.openShockClient.sendVibrate = jest.fn().mockResolvedValue({ success: true });
    
    // Create segment with vibrate
    const vibrateSegment = { 
      isShock: true, 
      shockIntensity: 50, 
      shockDuration: 1000, 
      shockType: 'vibrate',
      shockDevices: ['mock-device-1'],
      text: 'Vibrate' 
    };
    const spinData = { username: 'test', nickname: 'Test', spinId: 'test-123' };
    
    await wheelGame.triggerShock(mockOpenShock, vibrateSegment, spinData, 1, 'Test');
    
    // Verify sendVibrate was called instead of sendShock
    expect(mockOpenShock.openShockClient.sendVibrate).toHaveBeenCalled();
    expect(mockOpenShock.openShockClient.sendShock).not.toHaveBeenCalled();
    
    const callArgs = mockOpenShock.openShockClient.sendVibrate.mock.calls[0];
    expect(callArgs[0]).toBe('mock-device-1'); // deviceId
    expect(callArgs[1]).toBe(50); // intensity
    expect(callArgs[2]).toBe(1000); // duration
  });

  test('Can trigger shock on multiple devices', async () => {
    const mockOpenShock = mockAPI.pluginLoader.loadedPlugins.get('openshock').instance;
    
    // Add more mock devices
    mockOpenShock.devices.push(
      { id: 'mock-device-2', name: 'Test Shocker 2' },
      { id: 'mock-device-3', name: 'Test Shocker 3' }
    );
    
    // Create segment targeting multiple devices
    const multiDeviceSegment = { 
      isShock: true, 
      shockIntensity: 50, 
      shockDuration: 1000, 
      shockType: 'shock',
      shockDevices: ['mock-device-1', 'mock-device-2', 'mock-device-3'],
      text: 'Multi Shock' 
    };
    const spinData = { username: 'test', nickname: 'Test', spinId: 'test-123' };
    
    await wheelGame.triggerShock(mockOpenShock, multiDeviceSegment, spinData, 1, 'Test');
    
    // Verify sendShock was called 3 times (once per device)
    expect(mockOpenShock.openShockClient.sendShock).toHaveBeenCalledTimes(3);
    
    // Check each call had correct device ID
    const calls = mockOpenShock.openShockClient.sendShock.mock.calls;
    expect(calls[0][0]).toBe('mock-device-1');
    expect(calls[1][0]).toBe('mock-device-2');
    expect(calls[2][0]).toBe('mock-device-3');
  });

  test('Falls back to first device when no devices configured', async () => {
    const mockOpenShock = mockAPI.pluginLoader.loadedPlugins.get('openshock').instance;
    
    // Create segment with empty device list
    const noDeviceSegment = { 
      isShock: true, 
      shockIntensity: 50, 
      shockDuration: 1000, 
      shockType: 'shock',
      shockDevices: [], // Empty array
      text: 'No Device Config' 
    };
    const spinData = { username: 'test', nickname: 'Test', spinId: 'test-123' };
    
    await wheelGame.triggerShock(mockOpenShock, noDeviceSegment, spinData, 1, 'Test');
    
    // Should use first available device
    expect(mockOpenShock.openShockClient.sendShock).toHaveBeenCalled();
    const callArgs = mockOpenShock.openShockClient.sendShock.mock.calls[0];
    expect(callArgs[0]).toBe('mock-device-1'); // First device ID
  });

  test('Falls back to first device when configured devices are not available', async () => {
    const mockOpenShock = mockAPI.pluginLoader.loadedPlugins.get('openshock').instance;
    
    // Create segment with device that doesn't exist
    const unknownDeviceSegment = { 
      isShock: true, 
      shockIntensity: 50, 
      shockDuration: 1000, 
      shockType: 'shock',
      shockDevices: ['unknown-device-99'],
      text: 'Unknown Device' 
    };
    const spinData = { username: 'test', nickname: 'Test', spinId: 'test-123' };
    
    await wheelGame.triggerShock(mockOpenShock, unknownDeviceSegment, spinData, 1, 'Test');
    
    // Should fall back to first available device
    expect(mockOpenShock.openShockClient.sendShock).toHaveBeenCalled();
    const callArgs = mockOpenShock.openShockClient.sendShock.mock.calls[0];
    expect(callArgs[0]).toBe('mock-device-1'); // Fallback to first device
  });
});
