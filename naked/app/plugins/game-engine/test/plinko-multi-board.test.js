/**
 * Test: Plinko Multi-Board Support
 * 
 * Tests the new multi-board functionality for plinko, ensuring:
 * - Database migration from single to multi-board
 * - Creating multiple boards
 * - Board management (create, read, update, delete)
 * - Gift catalog integration
 */

const GameEngineDatabase = require('../backend/database');
const PlinkoGame = require('../games/plinko');

// Mock dependencies
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

const mockAPI = {
  getDatabase: () => ({
    db: require('better-sqlite3')(':memory:')
  }),
  getSocketIO: () => ({
    emit: jest.fn()
  }),
  pluginLoader: {
    loadedPlugins: new Map()
  }
};

describe('Plinko Multi-Board Support', () => {
  let db, plinkoGame;

  beforeEach(() => {
    // Create fresh database and plinko game for each test
    db = new GameEngineDatabase(mockAPI, mockLogger);
    db.initialize();
    plinkoGame = new PlinkoGame(mockAPI, db, mockLogger);
    plinkoGame.init();
  });

  test('should initialize with default board', () => {
    const boards = db.getAllPlinkoBoards();
    expect(boards).toHaveLength(1);
    expect(boards[0].name).toBe('Standard Plinko');
    expect(boards[0].enabled).toBe(true);
  });

  test('should get config for default board', () => {
    const config = plinkoGame.getConfig();
    expect(config).toBeDefined();
    expect(config.id).toBeDefined();
    expect(config.name).toBe('Standard Plinko');
    expect(config.slots).toBeDefined();
    expect(config.slots.length).toBeGreaterThan(0);
    expect(config.physicsSettings).toBeDefined();
    expect(config.giftMappings).toBeDefined();
  });

  test('should create a new board', () => {
    const boardId = plinkoGame.createBoard('Test Plinko');
    expect(boardId).toBeDefined();
    expect(typeof boardId).toBe('number');

    const boards = db.getAllPlinkoBoards();
    expect(boards).toHaveLength(2);
    
    const newBoard = boards.find(b => b.id === boardId);
    expect(newBoard).toBeDefined();
    expect(newBoard.name).toBe('Test Plinko');
    expect(newBoard.enabled).toBe(true);
  });

  test('should get config for specific board', () => {
    const boardId = plinkoGame.createBoard('Custom Board');
    const config = plinkoGame.getConfig(boardId);
    
    expect(config).toBeDefined();
    expect(config.id).toBe(boardId);
    expect(config.name).toBe('Custom Board');
  });

  test('should update board name', () => {
    const boards = db.getAllPlinkoBoards();
    const boardId = boards[0].id;
    
    plinkoGame.updateBoardName(boardId, 'Renamed Board');
    
    const updatedConfig = plinkoGame.getConfig(boardId);
    expect(updatedConfig.name).toBe('Renamed Board');
  });

  test('should update board chat command', () => {
    const boards = db.getAllPlinkoBoards();
    const boardId = boards[0].id;
    
    plinkoGame.updateBoardChatCommand(boardId, '/plinko');
    
    const updatedConfig = plinkoGame.getConfig(boardId);
    expect(updatedConfig.chatCommand).toBe('/plinko');
  });

  test('should update board enabled status', () => {
    const boards = db.getAllPlinkoBoards();
    const boardId = boards[0].id;
    
    plinkoGame.updateBoardEnabled(boardId, false);
    
    const updatedConfig = plinkoGame.getConfig(boardId);
    expect(updatedConfig.enabled).toBe(false);
    
    plinkoGame.updateBoardEnabled(boardId, true);
    const reEnabledConfig = plinkoGame.getConfig(boardId);
    expect(reEnabledConfig.enabled).toBe(true);
  });

  test('should update board configuration', () => {
    const boards = db.getAllPlinkoBoards();
    const boardId = boards[0].id;
    
    const newSlots = [
      { multiplier: 2.0, color: '#FF0000', openshockReward: { enabled: false } },
      { multiplier: 1.0, color: '#00FF00', openshockReward: { enabled: false } },
      { multiplier: 0.5, color: '#0000FF', openshockReward: { enabled: false } }
    ];
    
    const newPhysics = {
      gravity: 2.0,
      ballRestitution: 0.5,
      pegRestitution: 0.7,
      pegRows: 10,
      pegSpacing: 50,
      testModeEnabled: false,
      maxSimultaneousBalls: 3,
      rateLimitMs: 1000
    };
    
    const newGiftMappings = {
      'Rose': { betAmount: 50, ballType: 'standard', multiplier: 1.0 },
      'TikTok': { betAmount: 100, ballType: 'golden', multiplier: 2.0 }
    };
    
    plinkoGame.updateConfig(boardId, newSlots, newPhysics, newGiftMappings);
    
    const updatedConfig = plinkoGame.getConfig(boardId);
    expect(updatedConfig.slots).toHaveLength(3);
    expect(updatedConfig.slots[0].multiplier).toBe(2.0);
    expect(updatedConfig.physicsSettings.gravity).toBe(2.0);
    expect(updatedConfig.giftMappings).toHaveProperty('Rose');
  });

  test('should not delete last board', () => {
    const boards = db.getAllPlinkoBoards();
    const boardId = boards[0].id;
    
    const result = plinkoGame.deleteBoard(boardId);
    expect(result).toBe(false);
    
    const remainingBoards = db.getAllPlinkoBoards();
    expect(remainingBoards).toHaveLength(1);
  });

  test('should delete board when multiple exist', () => {
    const newBoardId = plinkoGame.createBoard('To Be Deleted');
    
    let boards = db.getAllPlinkoBoards();
    expect(boards).toHaveLength(2);
    
    const result = plinkoGame.deleteBoard(newBoardId);
    expect(result).toBe(true);
    
    boards = db.getAllPlinkoBoards();
    expect(boards).toHaveLength(1);
    expect(boards[0].name).not.toBe('To Be Deleted');
  });

  test('should find board by gift trigger', () => {
    const boardId = plinkoGame.createBoard('Gift Test Board');
    
    // Update gift mappings for the board
    const giftMappings = {
      '5655': { name: 'Rose', betAmount: 100, ballType: 'standard', multiplier: 1.0 }
    };
    db.updatePlinkoGiftMappings(boardId, giftMappings);
    
    // Find board by gift ID
    const foundBoard = plinkoGame.findBoardByGiftTrigger('5655');
    expect(foundBoard).toBeDefined();
    expect(foundBoard.id).toBe(boardId);
  });

  test('spawned balls preserve boardId and use that board config on landing', async () => {
    const boardId = plinkoGame.createBoard(
      'Landing Board',
      [
        { multiplier: 3, label: '3x', color: '#123456', openshockReward: { enabled: false } }
      ],
      {
        gravity: 2.5,
        ballRestitution: 0.6,
        pegRestitution: 0.8,
        rows: 8,
        risk: 'medium',
        maxSimultaneousBalls: 5,
        rateLimitMs: 800
      }
    );

    const spawnResult = await plinkoGame.spawnBall(
      'board_user',
      'Board User',
      '',
      10,
      'standard',
      {
        skipValidation: true,
        skipDeduction: true,
        boardId
      }
    );

    expect(spawnResult.success).toBe(true);
    const activeBall = plinkoGame.activeBalls.get(spawnResult.ballId);
    expect(activeBall.boardId).toBe(boardId);

    activeBall.timestamp = Date.now() - 2000;
    const landingResult = await plinkoGame.handleBallLanded(spawnResult.ballId, 0);

    expect(landingResult.success).toBe(true);
    expect(landingResult.multiplier).toBe(3);
  });

  test('should find board by chat command', () => {
    const boardId = plinkoGame.createBoard('Command Test Board');
    plinkoGame.updateBoardChatCommand(boardId, '/plinko-test');
    
    const foundBoard = plinkoGame.findBoardByChatCommand('/plinko-test');
    expect(foundBoard).toBeDefined();
    expect(foundBoard.id).toBe(boardId);
  });

  test('should not find board when disabled', () => {
    const boardId = plinkoGame.createBoard('Disabled Board');
    plinkoGame.updateBoardChatCommand(boardId, '/disabled');
    plinkoGame.updateBoardEnabled(boardId, false);
    
    const foundBoard = plinkoGame.findBoardByChatCommand('/disabled');
    expect(foundBoard).toBeNull();
  });

  test('should support multiple boards with different configurations', () => {
    // Create multiple boards
    const board1Id = plinkoGame.createBoard('High Stakes');
    const board2Id = plinkoGame.createBoard('Low Stakes');
    const board3Id = plinkoGame.createBoard('Experimental');
    
    // Configure each board differently
    plinkoGame.updateConfig(board1Id, 
      [{ multiplier: 10, color: '#FF0000', openshockReward: { enabled: false } }],
      { gravity: 3.0, ballRestitution: 0.8, pegRestitution: 0.9, pegRows: 15, pegSpacing: 70, testModeEnabled: false, maxSimultaneousBalls: 5, rateLimitMs: 800 },
      { 'Galaxy': { betAmount: 1000, ballType: 'golden', multiplier: 2.0 } }
    );
    
    plinkoGame.updateConfig(board2Id,
      [{ multiplier: 1, color: '#00FF00', openshockReward: { enabled: false } }],
      { gravity: 1.5, ballRestitution: 0.4, pegRestitution: 0.6, pegRows: 8, pegSpacing: 40, testModeEnabled: false, maxSimultaneousBalls: 3, rateLimitMs: 1000 },
      { 'Rose': { betAmount: 10, ballType: 'standard', multiplier: 1.0 } }
    );
    
    // Verify each board has unique config
    const config1 = plinkoGame.getConfig(board1Id);
    const config2 = plinkoGame.getConfig(board2Id);
    const config3 = plinkoGame.getConfig(board3Id);
    
    expect(config1.physicsSettings.gravity).toBe(3.0);
    expect(config2.physicsSettings.gravity).toBe(1.5);
    expect(config3.name).toBe('Experimental');
    
    expect(config1.giftMappings).toHaveProperty('Galaxy');
    expect(config2.giftMappings).toHaveProperty('Rose');
    expect(Object.keys(config3.giftMappings)).toHaveLength(0);
  });
});

module.exports = {
  description: 'Tests for plinko multi-board support and gift catalog integration'
};
