/**
 * Wheel Segment Copy Test
 * 
 * Tests that segment copying preserves all properties including shockType and shockDevices
 */

const WheelGame = require('../games/wheel');
const GameEngineDatabase = require('../backend/database');

// Mock API
const createMockAPI = () => {
  const mockDB = {
    db: null // Will be set with in-memory database
  };

  const emittedEvents = [];
  
  const mockSocketIO = {
    emit: jest.fn((event, data) => {
      emittedEvents.push({ event, data });
    }),
    on: () => {}
  };

  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  };

  return {
    getSocketIO: () => mockSocketIO,
    getDatabase: () => mockDB,
    log: (msg, level) => mockLogger[level]?.(msg),
    emittedEvents,
    ...mockLogger
  };
};

describe('Wheel Segment Copy', () => {
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
    jest.clearAllMocks();
  });

  test('Copying a segment should preserve all properties including shockType and shockDevices', () => {
    const config = wheelGame.getConfig();
    const wheelId = config.id;
    
    // Create segments with specific shockType and shockDevices
    const testSegments = [
      { 
        text: 'Prize 1', 
        color: '#FF0000', 
        weight: 10, 
        isNiete: false, 
        xpReward: 100,
        prizeAudio: 2,
        isShock: true, 
        shockIntensity: 75, 
        shockDuration: 2000, 
        shockType: 'vibrate', 
        shockDevices: ['device1', 'device2'] 
      },
      { 
        text: 'Prize 2', 
        color: '#00FF00', 
        weight: 8, 
        isNiete: false, 
        xpReward: 50,
        prizeAudio: 1,
        isShock: false, 
        shockIntensity: 50, 
        shockDuration: 1000, 
        shockType: 'shock', 
        shockDevices: [] 
      },
      { 
        text: 'Prize 3', 
        color: '#0000FF', 
        weight: 5, 
        isNiete: true, 
        xpReward: 0,
        prizeAudio: 3,
        isShock: true, 
        shockIntensity: 90, 
        shockDuration: 3000, 
        shockType: 'shock', 
        shockDevices: ['device3'] 
      }
    ];
    
    wheelGame.updateConfig(wheelId, testSegments, config.settings);
    
    // Verify the segments were saved correctly
    const updatedConfig = wheelGame.getConfig(wheelId);
    expect(updatedConfig.segments.length).toBe(3);
    
    // Verify all properties of the first segment
    expect(updatedConfig.segments[0]).toMatchObject({
      text: 'Prize 1',
      color: '#FF0000',
      weight: 10,
      isNiete: false,
      xpReward: 100,
      prizeAudio: 2,
      isShock: true,
      shockIntensity: 75,
      shockDuration: 2000,
      shockType: 'vibrate',
      shockDevices: ['device1', 'device2']
    });
    
    // Verify all properties of the third segment
    expect(updatedConfig.segments[2]).toMatchObject({
      text: 'Prize 3',
      color: '#0000FF',
      weight: 5,
      isNiete: true,
      xpReward: 0,
      prizeAudio: 3,
      isShock: true,
      shockIntensity: 90,
      shockDuration: 3000,
      shockType: 'shock',
      shockDevices: ['device3']
    });
  });

  test('All segment properties should survive save/load cycle', () => {
    const config = wheelGame.getConfig();
    const wheelId = config.id;
    
    // Create a segment with all possible properties set
    const complexSegment = {
      text: 'Complex Prize',
      color: '#FF00FF',
      weight: 7,
      isNiete: false,
      xpReward: 250,
      prizeAudio: 2,
      isShock: true,
      shockIntensity: 85,
      shockDuration: 2500,
      shockType: 'vibrate',
      shockDevices: ['device-a', 'device-b', 'device-c']
    };
    
    // Update with single segment
    wheelGame.updateConfig(wheelId, [complexSegment], config.settings);
    
    // Load it back
    const reloadedConfig = wheelGame.getConfig(wheelId);
    
    // Verify ALL properties are preserved
    expect(reloadedConfig.segments.length).toBe(1);
    expect(reloadedConfig.segments[0]).toEqual(complexSegment);
  });

  test('Empty shockDevices array should be preserved (not converted to default)', () => {
    const config = wheelGame.getConfig();
    const wheelId = config.id;
    
    const segmentWithEmptyDevices = {
      text: 'No Devices',
      color: '#00FFFF',
      weight: 5,
      isNiete: false,
      xpReward: 0,
      prizeAudio: 1,
      isShock: true,
      shockIntensity: 50,
      shockDuration: 1000,
      shockType: 'shock',
      shockDevices: [] // Explicitly empty, should stay empty
    };
    
    wheelGame.updateConfig(wheelId, [segmentWithEmptyDevices], config.settings);
    const reloadedConfig = wheelGame.getConfig(wheelId);
    
    expect(reloadedConfig.segments[0].shockDevices).toEqual([]);
    expect(Array.isArray(reloadedConfig.segments[0].shockDevices)).toBe(true);
  });

  test('Multiple segments should maintain distinct shockType and shockDevices', () => {
    const config = wheelGame.getConfig();
    const wheelId = config.id;
    
    const segments = [
      { text: 'S1', color: '#FF0000', weight: 1, isNiete: false, xpReward: 0, prizeAudio: 1, isShock: true, shockIntensity: 30, shockDuration: 500, shockType: 'shock', shockDevices: ['d1'] },
      { text: 'S2', color: '#00FF00', weight: 1, isNiete: false, xpReward: 0, prizeAudio: 1, isShock: true, shockIntensity: 40, shockDuration: 1000, shockType: 'vibrate', shockDevices: ['d2'] },
      { text: 'S3', color: '#0000FF', weight: 1, isNiete: false, xpReward: 0, prizeAudio: 1, isShock: true, shockIntensity: 50, shockDuration: 1500, shockType: 'shock', shockDevices: ['d3'] },
      { text: 'S4', color: '#FFFF00', weight: 1, isNiete: false, xpReward: 0, prizeAudio: 1, isShock: true, shockIntensity: 60, shockDuration: 2000, shockType: 'vibrate', shockDevices: ['d4', 'd5'] }
    ];
    
    wheelGame.updateConfig(wheelId, segments, config.settings);
    const reloadedConfig = wheelGame.getConfig(wheelId);
    
    // Verify each segment maintains its distinct configuration
    expect(reloadedConfig.segments[0].shockType).toBe('shock');
    expect(reloadedConfig.segments[0].shockDevices).toEqual(['d1']);
    
    expect(reloadedConfig.segments[1].shockType).toBe('vibrate');
    expect(reloadedConfig.segments[1].shockDevices).toEqual(['d2']);
    
    expect(reloadedConfig.segments[2].shockType).toBe('shock');
    expect(reloadedConfig.segments[2].shockDevices).toEqual(['d3']);
    
    expect(reloadedConfig.segments[3].shockType).toBe('vibrate');
    expect(reloadedConfig.segments[3].shockDevices).toEqual(['d4', 'd5']);
  });
});
