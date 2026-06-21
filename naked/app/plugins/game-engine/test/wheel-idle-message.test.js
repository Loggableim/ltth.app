/**
 * Wheel Idle Message Configuration Test
 * 
 * Tests that idle message settings can be configured and retrieved
 */

const WheelGame = require('../games/wheel');
const GameEngineDatabase = require('../backend/database');

// Mock API
const createMockAPI = () => {
  const mockDB = {
    db: null // Will be set with in-memory database
  };

  return {
    getSocketIO: () => ({
      emit: () => {},
      on: () => {}
    }),
    getDatabase: () => mockDB,
    log: (msg, level) => {
      // Uncomment for debugging
      // console.log(`[${level || 'info'}] ${msg}`);
    }
  };
};

describe('Wheel Idle Message Configuration', () => {
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

  test('Default wheel should have idle message settings', () => {
    const config = wheelGame.getConfig();
    
    expect(config).toBeDefined();
    expect(config.settings).toBeDefined();
    expect(config.settings.idleMessageEnabled).toBe(true);
    expect(config.settings.idleMessageTitle).toBe('🎡 Warte auf Spieler...');
    expect(config.settings.idleMessageSubtitle).toBe('Sende ein Geschenk, um das Glücksrad zu drehen!');
  });

  test('Idle message settings should be customizable', () => {
    const config = wheelGame.getConfig();
    const wheelId = config.id;
    
    // Update with custom idle message
    const customSegments = config.segments;
    const customSettings = {
      ...config.settings,
      idleMessageEnabled: false,
      idleMessageTitle: 'Custom Title',
      idleMessageSubtitle: 'Custom Subtitle'
    };
    
    wheelGame.updateConfig(wheelId, customSegments, customSettings);
    
    // Verify changes
    const updatedConfig = wheelGame.getConfig(wheelId);
    expect(updatedConfig.settings.idleMessageEnabled).toBe(false);
    expect(updatedConfig.settings.idleMessageTitle).toBe('Custom Title');
    expect(updatedConfig.settings.idleMessageSubtitle).toBe('Custom Subtitle');
  });

  test('Idle message should support German special characters', () => {
    const config = wheelGame.getConfig();
    const wheelId = config.id;
    
    // Update with German text
    const customSegments = config.segments;
    const customSettings = {
      ...config.settings,
      idleMessageTitle: '🎡 Warte auf Spieler (Glücksrad)...',
      idleMessageSubtitle: 'Sende Geschenke für das Glücksrad!'
    };
    
    wheelGame.updateConfig(wheelId, customSegments, customSettings);
    
    // Verify German characters are preserved
    const updatedConfig = wheelGame.getConfig(wheelId);
    expect(updatedConfig.settings.idleMessageTitle).toContain('Glücksrad');
    expect(updatedConfig.settings.idleMessageSubtitle).toContain('für');
  });

  test('Empty idle message strings should use defaults', () => {
    const config = wheelGame.getConfig();
    const wheelId = config.id;
    
    // Update with empty strings
    const customSegments = config.segments;
    const customSettings = {
      ...config.settings,
      idleMessageTitle: '',
      idleMessageSubtitle: ''
    };
    
    wheelGame.updateConfig(wheelId, customSegments, customSettings);
    
    // Verify empty strings are stored (not replaced with defaults)
    const updatedConfig = wheelGame.getConfig(wheelId);
    expect(updatedConfig.settings.idleMessageTitle).toBe('');
    expect(updatedConfig.settings.idleMessageSubtitle).toBe('');
  });

  test('Multiple wheels can have different idle messages', () => {
    // Create two wheels with different messages
    const wheel1Id = wheelGame.createWheel('Wheel 1');
    const wheel2Id = wheelGame.createWheel('Wheel 2');
    
    // Update wheel 1
    const wheel1Config = wheelGame.getConfig(wheel1Id);
    wheelGame.updateConfig(wheel1Id, wheel1Config.segments, {
      ...wheel1Config.settings,
      idleMessageTitle: 'Wheel 1 Title',
      idleMessageSubtitle: 'Wheel 1 Subtitle'
    });
    
    // Update wheel 2
    const wheel2Config = wheelGame.getConfig(wheel2Id);
    wheelGame.updateConfig(wheel2Id, wheel2Config.segments, {
      ...wheel2Config.settings,
      idleMessageTitle: 'Wheel 2 Title',
      idleMessageSubtitle: 'Wheel 2 Subtitle'
    });
    
    // Verify both wheels have correct messages
    const updatedWheel1 = wheelGame.getConfig(wheel1Id);
    const updatedWheel2 = wheelGame.getConfig(wheel2Id);
    
    expect(updatedWheel1.settings.idleMessageTitle).toBe('Wheel 1 Title');
    expect(updatedWheel2.settings.idleMessageTitle).toBe('Wheel 2 Title');
  });
});
