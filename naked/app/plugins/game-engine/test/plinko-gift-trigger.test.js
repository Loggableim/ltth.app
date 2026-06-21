/**
 * Test: Plinko Gift Trigger Logic
 * 
 * Tests the enhanced gift trigger logic for Plinko, ensuring:
 * - Case-insensitive gift name matching
 * - Fallback to board-specific gift mappings
 * - Proper error handling and logging
 * - Backward compatibility with existing configurations
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

const mockSocketIO = {
  emit: jest.fn()
};

const mockAPI = {
  getDatabase: () => ({
    db: require('better-sqlite3')(':memory:')
  }),
  getSocketIO: () => mockSocketIO,
  pluginLoader: {
    loadedPlugins: new Map()
  }
};

describe('Plinko Gift Trigger - Enhanced Matching Logic', () => {
  let db, plinkoGame, gameEnginePlugin;

  beforeEach(() => {
    // Clear mocks
    jest.clearAllMocks();
    
    // Create fresh database and plinko game for each test
    db = new GameEngineDatabase(mockAPI, mockLogger);
    db.initialize();
    plinkoGame = new PlinkoGame(mockAPI, db, mockLogger);
    plinkoGame.init();

    // Create mock game engine plugin with minimal required functionality
    gameEnginePlugin = {
      api: mockAPI,
      io: mockSocketIO,
      db: db,
      logger: mockLogger,
      plinkoGame: plinkoGame,
      recentGiftEvents: new Map(),
      GIFT_DEDUP_WINDOW_MS: 1000,
      normalizeGiftId: (giftId) => String(giftId || '').trim(),
      
      // Inline copy of handlePlinkoGiftTrigger kept in sync with main.js
      async handlePlinkoGiftTrigger(username, nickname, profilePictureUrl, giftName, giftId = null, useDefaults = false, boardId = null) {
        try {
          // Normalize gift name and ID for consistent comparisons
          const normalizedGiftName = (giftName || '').trim();
          // Gift IDs from the catalog are stored as string keys (e.g. "5655")
          const normalizedGiftId = giftId ? String(giftId).trim() : null;
          let giftMapping = null;

          // When a specific board was identified during gift trigger lookup, use it directly.
          if (boardId !== null) {
            this.logger.info(`[PLINKO TRIGGER] Board-aware path: targeting board ID ${boardId} (matched by gift trigger lookup)`);
          } else {
            this.logger.debug(`[PLINKO TRIGGER] No specific board targeted – checking primary config then all boards`);
          }

          // Get config for the specific board (if known) or the default/first board (backward compat)
          const config = boardId !== null
            ? this.plinkoGame.getConfig(boardId)
            : this.plinkoGame.getConfig();
          
          // Try by gift ID first (catalog-added mappings use the numeric ID as key)
          if (normalizedGiftId && config.giftMappings && config.giftMappings[normalizedGiftId]) {
            giftMapping = config.giftMappings[normalizedGiftId];
            this.logger.info(`[PLINKO] Found gift mapping in board "${config.name}" (ID: ${config.id}) by ID key "${normalizedGiftId}"`);
          }
          
          // Try exact match by gift name in primary config
          if (!giftMapping && config.giftMappings && config.giftMappings[normalizedGiftName]) {
            giftMapping = config.giftMappings[normalizedGiftName];
            this.logger.info(`[PLINKO] Found gift mapping in board "${config.name}" (ID: ${config.id}) by name key "${normalizedGiftName}"`);
          }
          
          // Try case-insensitive match by gift name in primary config
          if (!giftMapping && config.giftMappings) {
            const lowerGiftName = normalizedGiftName.toLowerCase();
            for (const [key, value] of Object.entries(config.giftMappings)) {
              if (key.toLowerCase() === lowerGiftName) {
                giftMapping = value;
                this.logger.info(`[PLINKO] Matched gift "${normalizedGiftName}" in board "${config.name}" (ID: ${config.id}) via case-insensitive lookup (key: "${key}")`);
                break;
              }
            }
          }
          
          // Fallback: Check all enabled Plinko boards for gift mappings
          if (!giftMapping) {
            if (boardId !== null) {
              this.logger.warn(`[PLINKO] Gift "${normalizedGiftName}" (ID: ${normalizedGiftId || 'none'}) not found in targeted board ID ${boardId} – falling back to all enabled boards`);
            } else {
              this.logger.debug(`[PLINKO] No mapping in primary config, checking all enabled boards...`);
            }
            const boards = this.plinkoGame.getAllBoards();
            const lowerGiftName = normalizedGiftName.toLowerCase();
            
            for (const board of boards) {
              if (!board.enabled) continue;
              
              try {
                // getAllBoards() returns already parsed giftMappings object
                const mappings = board.giftMappings || {};
                
                // Try by gift ID first (catalog-added mappings use the numeric ID as key)
                if (normalizedGiftId && mappings[normalizedGiftId]) {
                  giftMapping = mappings[normalizedGiftId];
                  this.logger.info(`[PLINKO] Found gift mapping in board "${board.name}" (ID: ${board.id}) by ID key "${normalizedGiftId}"`);
                  break;
                }
                
                // Try exact match by name
                if (mappings[normalizedGiftName]) {
                  giftMapping = mappings[normalizedGiftName];
                  this.logger.info(`[PLINKO] Found gift mapping in board "${board.name}" (ID: ${board.id}) by name key "${normalizedGiftName}"`);
                  break;
                }
                
                // Try case-insensitive match by name
                for (const [key, value] of Object.entries(mappings)) {
                  if (key.toLowerCase() === lowerGiftName) {
                    giftMapping = value;
                    this.logger.info(`[PLINKO] Matched gift "${normalizedGiftName}" in board "${board.name}" (ID: ${board.id}) via case-insensitive lookup (key: "${key}")`);
                    break;
                  }
                }
                
                if (giftMapping) break;
              } catch (e) {
                this.logger.error(`[PLINKO] Failed to process gift_mappings for board ${board.id}: ${e.message}`);
              }
            }
            
            // If still no mapping found, decide based on useDefaults flag
            if (!giftMapping) {
              const enabledBoards = boards.filter(b => b.enabled);
              if (useDefaults && enabledBoards.length > 0 && (normalizedGiftName || normalizedGiftId)) {
                // Trigger-Tab-only configuration: spawn with safe defaults
                giftMapping = { betAmount: 100, ballType: 'standard' };
                this.logger.info(`[PLINKO] Gift "${normalizedGiftName || normalizedGiftId}" has no board-specific mapping - using defaults (betAmount=100, ballType=standard) [source: Trigger-Tab fallback]`);
              } else {
                const boardNames = enabledBoards.map(b => b.name).join(', ') || 'none';
                const boardContext = boardId !== null ? ` (targeted board ID: ${boardId})` : '';
                this.logger.warn(`[PLINKO] Gift "${normalizedGiftName}" (ID: ${normalizedGiftId || 'unknown'}) triggered Plinko but no mapping found in any board${boardContext}. Available enabled boards: ${boardNames}`);
                return { success: false, error: 'No gift mapping found' };
              }
            }
          }

          const betAmount = giftMapping.betAmount || 100;
          const ballType = giftMapping.ballType || 'standard';
          const ballCount = Math.min(Math.max(giftMapping.ballCount || 1, 1), 50);
          const boardContext = boardId !== null ? ` [board ID: ${boardId}]` : '';

          let result;
          if (ballCount > 1) {
            this.logger.info(`[PLINKO] Spawning ${ballCount} balls for ${username}: betAmount=${betAmount}${boardContext}`);
            result = await this.plinkoGame.spawnBalls(
              username,
              nickname,
              profilePictureUrl || '',
              betAmount,
              ballCount,
              { preferredColor: null }
            );
          } else {
            this.logger.info(`[PLINKO] Spawning ball for ${username}: betAmount=${betAmount}, ballType=${ballType}${boardContext}`);
            result = await this.plinkoGame.spawnBall(
              username,
              nickname,
              profilePictureUrl || '',
              betAmount,
              ballType
            );
          }

          if (!result.success) {
            this.logger.error(`[PLINKO] Failed to spawn ball for ${username}: ${result.error}`);
          } else {
            this.logger.info(`[PLINKO] ✅ Ball spawned successfully for ${username}`);
          }
          
          return result;
        } catch (error) {
          this.logger.error(`[PLINKO] Error handling gift trigger: ${error.message}`, error);
          return { success: false, error: error.message };
        }
      }
    };
  });

  describe('Exact Match (Case-Sensitive)', () => {
    test('should find gift mapping with exact case match in primary config', async () => {
      // Setup: Add gift mapping to primary config
      const boards = db.getAllPlinkoBoards();
      const board = boards[0];
      
      const giftMappings = {
        'Rose': { betAmount: 100, ballType: 'standard' }
      };
      
      db.updatePlinkoGiftMappings(board.id, giftMappings);

      // Test: Call with exact case
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'Rose'
      );

      expect(result).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Spawning ball for testuser')
      );
    });
  });

  describe('Case-Insensitive Match', () => {
    test('should find gift mapping with case-insensitive match in primary config', async () => {
      // Setup: Add gift mapping with specific case
      const boards = db.getAllPlinkoBoards();
      const board = boards[0];
      
      const giftMappings = {
        'Rose': { betAmount: 100, ballType: 'standard' }
      };
      
      db.updatePlinkoGiftMappings(board.id, giftMappings);

      // Test: Call with different case
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'rose'  // lowercase
      );

      expect(result).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('case-insensitive lookup (key: "Rose")')
      );
    });

    test('should handle uppercase gift name when config has lowercase', async () => {
      // Setup: Add gift mapping in lowercase
      const boards = db.getAllPlinkoBoards();
      const board = boards[0];
      
      const giftMappings = {
        'lion': { betAmount: 500, ballType: 'golden' }
      };
      
      db.updatePlinkoGiftMappings(board.id, giftMappings);

      // Test: Call with uppercase
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'LION'  // uppercase
      );

      expect(result).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('case-insensitive lookup (key: "lion")')
      );
    });
  });

  describe('Fallback to Board-Specific Mappings', () => {
    test('should fallback to board-specific mappings when not in primary config', async () => {
      // Setup: Create a second board with gift mapping
      const secondBoardId = plinkoGame.createBoard('Secondary Board');
      
      db.updatePlinkoGiftMappings(secondBoardId, {
        'Galaxy': { betAmount: 1000, ballType: 'golden' }
      });

      // Test: Call with gift only in secondary board
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'Galaxy'
      );

      expect(result).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Found gift mapping in board "Secondary Board"')
      );
    });

    test('should use case-insensitive matching in fallback boards', async () => {
      // Setup: Create a second board with gift mapping
      const secondBoardId = plinkoGame.createBoard('Secondary Board');
      
      db.updatePlinkoGiftMappings(secondBoardId, {
        'Galaxy': { betAmount: 1000, ballType: 'golden' }
      });

      // Test: Call with different case
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'galaxy'  // lowercase
      );

      expect(result).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Matched gift "galaxy" in board "Secondary Board"')
      );
    });

    test('should skip disabled boards in fallback search', async () => {
      // Setup: Create disabled board with gift mapping
      const secondBoardId = plinkoGame.createBoard('Disabled Board');
      
      db.updatePlinkoGiftMappings(secondBoardId, {
        'TikTok': { betAmount: 100, ballType: 'standard' }
      });
      
      db.updatePlinkoEnabled(secondBoardId, false);

      // Test: Call with gift only in disabled board
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'TikTok'
      );

      expect(result).toEqual({ success: false, error: 'No gift mapping found' });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('no mapping found in any board')
      );
    });
  });

  describe('No Match Scenario', () => {
    test('should log warning when no mapping found in any board', async () => {
      // Test: Call with unmapped gift
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'UnknownGift'
      );

      expect(result).toEqual({ success: false, error: 'No gift mapping found' });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('triggered Plinko but no mapping found in any board')
      );
    });

    test('should list available boards in error message', async () => {
      // Setup: Create multiple boards
      plinkoGame.createBoard('Board 2');
      plinkoGame.createBoard('Board 3');

      // Test: Call with unmapped gift
      await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'UnknownGift'
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringMatching(/Available enabled boards:.*Standard Plinko.*Board 2.*Board 3/)
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle errors gracefully and not crash', async () => {
      // Test: Should handle general errors without crashing
      // Mock getAllBoards to throw an error
      const originalGetAllBoards = gameEnginePlugin.plinkoGame.getAllBoards;
      gameEnginePlugin.plinkoGame.getAllBoards = () => {
        throw new Error('Database connection failed');
      };

      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'Rose'
      );

      expect(result).toEqual({ success: false, error: 'Database connection failed' });
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[PLINKO] Error handling gift trigger'),
        expect.any(Error)
      );

      // Restore original method
      gameEnginePlugin.plinkoGame.getAllBoards = originalGetAllBoards;
    });

    test('should handle null/undefined gift names', async () => {
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        null
      );

      expect(result).toEqual({ success: false, error: 'No gift mapping found' });
    });

    test('should handle empty string gift names', async () => {
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        '  '  // whitespace only
      );

      expect(result).toEqual({ success: false, error: 'No gift mapping found' });
    });
  });

  describe('Backward Compatibility', () => {
    test('should work with existing config structure (no changes to database)', async () => {
      // Setup: Use default board as-is (simulating existing installation)
      const boards = db.getAllPlinkoBoards();
      const board = boards[0];
      
      // Add gift mapping via standard method
      db.updatePlinkoGiftMappings(board.id, {
        'Rose': { betAmount: 100, ballType: 'standard' }
      });

      // Test: Should work exactly as before - the important thing is it finds the mapping
      await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'Rose'
      );

      // Verify the mapping was found and spawn was attempted
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Spawning ball for testuser')
      );
    });
  });

  describe('Gift ID Lookup (Catalog-Style Mappings)', () => {
    test('should find gift mapping by gift ID when stored with numeric ID as key', async () => {
      // When added via gift catalog, UI stores mappings keyed by gift ID (e.g. "5655")
      const boards = db.getAllPlinkoBoards();
      const board = boards[0];
      db.updatePlinkoGiftMappings(board.id, {
        '5655': { name: 'Rose', betAmount: 150, ballType: 'golden' }
      });

      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 'Test User', '', 'Rose', '5655'
      );

      expect(result).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Spawning ball for testuser')
      );
    });

    test('should find gift mapping by gift ID in fallback board', async () => {
      const secondBoardId = plinkoGame.createBoard('Catalog Board');
      db.updatePlinkoGiftMappings(secondBoardId, {
        '9999': { name: 'Dragon', betAmount: 500, ballType: 'golden' }
      });

      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 'Test User', '', 'Dragon', '9999'
      );

      expect(result).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Found gift mapping in board "Catalog Board"')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('"9999"')
      );
    });

    test('should fall back to gift name lookup when no ID-keyed mapping exists', async () => {
      // Mapping stored by name (manual input), no ID key
      const boards = db.getAllPlinkoBoards();
      const board = boards[0];
      db.updatePlinkoGiftMappings(board.id, {
        'Rose': { betAmount: 100, ballType: 'standard' }
      });

      // Pass a giftId that does not exist as a key
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 'Test User', '', 'Rose', '0000'
      );

      expect(result).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Spawning ball for testuser')
      );
    });
  });

  describe('handleGiftTrigger full flow - Plinko board lookup', () => {
    // Tests that handleGiftTrigger routes to plinko when gift is in board giftMappings,
    // without requiring an entry in the general game_triggers table.

    let mockWheelGame;

    beforeEach(() => {
      mockWheelGame = {
        findWheelByGiftTrigger: jest.fn().mockReturnValue(null)
      };

      // Wire handleGiftTrigger inline to replicate the fixed flow
      gameEnginePlugin.wheelGame = mockWheelGame;
      gameEnginePlugin.handleWheelGiftTrigger = jest.fn();
      gameEnginePlugin.handlePlinkoGiftTrigger = jest.fn().mockResolvedValue({ success: true });
      gameEnginePlugin.handleGameStart = jest.fn();

      // Provide the fixed handleGiftTrigger logic (mirrors main.js)
      gameEnginePlugin.handleGiftTrigger = function(data) {
        const {
          uniqueId, giftName, giftId, nickname,
          giftPictureUrl, profilePictureUrl = '', repeatEnd, repeatCount
        } = data;

        if (repeatEnd === false) return;

        const dedupKey = `${uniqueId}_${giftName}_${giftId || 'noId'}`;
        const now = Date.now();
        const lastEventTime = this.recentGiftEvents.get(dedupKey);
        if (lastEventTime && (now - lastEventTime) < this.GIFT_DEDUP_WINDOW_MS) return;

        const giftIdStr = this.normalizeGiftId(giftId);

        // 1. Wheel check
        const matchingWheel = this.wheelGame.findWheelByGiftTrigger(giftIdStr || giftName);
        if (matchingWheel) {
          this.recentGiftEvents.set(dedupKey, now);
          this.handleWheelGiftTrigger(uniqueId, nickname, profilePictureUrl, giftName, matchingWheel.id);
          return;
        }

        // 2. Plinko board check
        const matchingPlinkoBoard = this.plinkoGame.findBoardByGiftTrigger(giftIdStr) ||
                                    this.plinkoGame.findBoardByGiftTrigger(giftName);
        if (matchingPlinkoBoard) {
          this.recentGiftEvents.set(dedupKey, now);
          // Pass matchingPlinkoBoard.id so the correct board's config is used directly
          this.handlePlinkoGiftTrigger(uniqueId, nickname, profilePictureUrl, giftName, giftIdStr, false, matchingPlinkoBoard.id);
          return;
        }

        // 3. General triggers
        const triggers = this.db.getTriggers();
        const giftNameLower = (giftName || '').toLowerCase().trim();
        const matchingTrigger = triggers.find(t => {
          if (t.trigger_type !== 'gift') return false;
          const triggerValueStr = this.normalizeGiftId(t.trigger_value);
          const triggerValueLower = (t.trigger_value || '').toLowerCase().trim();
          return triggerValueStr === giftIdStr || triggerValueLower === giftNameLower;
        });

        if (!matchingTrigger) return;

        this.recentGiftEvents.set(dedupKey, now);
        if (matchingTrigger.game_type === 'plinko') {
          // Pass giftIdStr for ID-keyed mapping resolution and useDefaults=true so
          // a Trigger-Tab-only configuration spawns balls with default parameters.
          this.handlePlinkoGiftTrigger(uniqueId, nickname, profilePictureUrl, giftName, giftIdStr, true);
          return;
        }
        this.handleGameStart(
          matchingTrigger.game_type, uniqueId, nickname, 'gift', giftName, giftPictureUrl
        );
      };
    });

    test('should trigger plinko for catalog-style gift (ID key) without general trigger row', () => {
      const boards = db.getAllPlinkoBoards();
      db.updatePlinkoGiftMappings(boards[0].id, {
        '5655': { name: 'Rose', betAmount: 100, ballType: 'standard' }
      });

      gameEnginePlugin.handleGiftTrigger({
        uniqueId: 'user1', giftName: 'Rose', giftId: 5655,
        nickname: 'User1', giftPictureUrl: '', repeatEnd: true, repeatCount: 1
      });

      expect(gameEnginePlugin.handlePlinkoGiftTrigger).toHaveBeenCalledWith(
        'user1', 'User1', '', 'Rose', '5655', false, boards[0].id
      );
      expect(gameEnginePlugin.handleGameStart).not.toHaveBeenCalled();
      expect(gameEnginePlugin.handleWheelGiftTrigger).not.toHaveBeenCalled();
    });

    test('should trigger plinko for name-keyed gift without general trigger row', () => {
      const boards = db.getAllPlinkoBoards();
      db.updatePlinkoGiftMappings(boards[0].id, {
        'Lion': { betAmount: 500, ballType: 'golden' }
      });

      gameEnginePlugin.handleGiftTrigger({
        uniqueId: 'user2', giftName: 'Lion', giftId: null,
        nickname: 'User2', giftPictureUrl: '', repeatEnd: undefined, repeatCount: 1
      });

      expect(gameEnginePlugin.handlePlinkoGiftTrigger).toHaveBeenCalled();
      expect(gameEnginePlugin.handleGameStart).not.toHaveBeenCalled();
    });

    test('should not trigger plinko for a gift in a disabled board', () => {
      const newBoardId = plinkoGame.createBoard('Disabled Board');
      db.updatePlinkoGiftMappings(newBoardId, {
        '9001': { name: 'Galaxy', betAmount: 200, ballType: 'standard' }
      });
      db.updatePlinkoEnabled(newBoardId, false);

      gameEnginePlugin.handleGiftTrigger({
        uniqueId: 'user3', giftName: 'Galaxy', giftId: 9001,
        nickname: 'User3', giftPictureUrl: '', repeatEnd: true, repeatCount: 1
      });

      expect(gameEnginePlugin.handlePlinkoGiftTrigger).not.toHaveBeenCalled();
    });

    test('should deduplicate rapid plinko gift events', () => {
      const boards = db.getAllPlinkoBoards();
      db.updatePlinkoGiftMappings(boards[0].id, {
        '1234': { name: 'Rose', betAmount: 100, ballType: 'standard' }
      });

      const eventData = {
        uniqueId: 'user4', giftName: 'Rose', giftId: 1234,
        nickname: 'User4', giftPictureUrl: '', repeatEnd: true, repeatCount: 1
      };

      gameEnginePlugin.handleGiftTrigger(eventData);
      gameEnginePlugin.handleGiftTrigger(eventData); // duplicate within window

      expect(gameEnginePlugin.handlePlinkoGiftTrigger).toHaveBeenCalledTimes(1);
    });

    test('should not trigger plinko for gifts in a streak (repeatEnd = false)', () => {
      const boards = db.getAllPlinkoBoards();
      db.updatePlinkoGiftMappings(boards[0].id, {
        '5655': { name: 'Rose', betAmount: 100, ballType: 'standard' }
      });

      gameEnginePlugin.handleGiftTrigger({
        uniqueId: 'user5', giftName: 'Rose', giftId: 5655,
        nickname: 'User5', giftPictureUrl: '', repeatEnd: false, repeatCount: 3
      });

      expect(gameEnginePlugin.handlePlinkoGiftTrigger).not.toHaveBeenCalled();
    });

    test('wheel trigger should take priority over plinko for same gift ID', () => {
      // Both wheel and plinko have the same gift mapped
      mockWheelGame.findWheelByGiftTrigger.mockReturnValue({ id: 1, name: 'Test Wheel' });
      const boards = db.getAllPlinkoBoards();
      db.updatePlinkoGiftMappings(boards[0].id, {
        '5655': { name: 'Rose', betAmount: 100, ballType: 'standard' }
      });

      gameEnginePlugin.handleGiftTrigger({
        uniqueId: 'user6', giftName: 'Rose', giftId: 5655,
        nickname: 'User6', giftPictureUrl: '', repeatEnd: true, repeatCount: 1
      });

      expect(gameEnginePlugin.handleWheelGiftTrigger).toHaveBeenCalled();
      expect(gameEnginePlugin.handlePlinkoGiftTrigger).not.toHaveBeenCalled();
    });

    test('should route to plinko via general trigger and forward giftId + useDefaults=true', () => {
      // Simulate Trigger Tab configuration: gift in game_triggers, NOT in any board mapping
      db.addTrigger('plinko', 'gift', 'Rose');

      gameEnginePlugin.handleGiftTrigger({
        uniqueId: 'user7', giftName: 'Rose', giftId: 5655,
        nickname: 'User7', giftPictureUrl: '', repeatEnd: true, repeatCount: 1
      });

      // Verify handlePlinkoGiftTrigger receives giftIdStr AND useDefaults=true
      expect(gameEnginePlugin.handlePlinkoGiftTrigger).toHaveBeenCalledWith(
        'user7', 'User7', '', 'Rose', '5655', true
      );
      expect(gameEnginePlugin.handleGameStart).not.toHaveBeenCalled();
    });

    test('should route via general trigger using name match (no giftId)', () => {
      // Trigger Tab configured with gift name only
      db.addTrigger('plinko', 'gift', 'Lion');

      gameEnginePlugin.handleGiftTrigger({
        uniqueId: 'user8', giftName: 'Lion', giftId: null,
        nickname: 'User8', giftPictureUrl: '', repeatEnd: undefined, repeatCount: 1
      });

      expect(gameEnginePlugin.handlePlinkoGiftTrigger).toHaveBeenCalledWith(
        'user8', 'User8', '', 'Lion', '', true
      );
    });
  });

  describe('Trigger Tab (useDefaults) fallback', () => {
    let originalSpawnBall;

    beforeEach(() => {
      // Mock spawnBall to succeed (XP system not available in unit-test env)
      originalSpawnBall = gameEnginePlugin.plinkoGame.spawnBall.bind(gameEnginePlugin.plinkoGame);
      gameEnginePlugin.plinkoGame.spawnBall = jest.fn().mockResolvedValue({ success: true, ballId: 'ball_test' });
    });

    afterEach(() => {
      gameEnginePlugin.plinkoGame.spawnBall = originalSpawnBall;
    });

    test('should spawn ball with defaults when no board mapping and useDefaults=true', async () => {
      // No board-specific mapping - simulates Trigger Tab only configuration
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 'Test User', '', 'Rose', null, true
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('using defaults (betAmount=100, ballType=standard)')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Spawning ball for testuser')
      );
      expect(gameEnginePlugin.plinkoGame.spawnBall).toHaveBeenCalledWith(
        'testuser', 'Test User', '', 100, 'standard'
      );
    });

    test('should spawn with defaults for catalog-style gift ID via Trigger Tab', async () => {
      // Gift identified by ID only, Trigger Tab path (no name-keyed or ID-keyed board mapping)
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 'Test User', '', 'Dragon', '9999', true
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('using defaults')
      );
    });

    test('should not use defaults when no enabled boards are available', async () => {
      // Disable all boards
      const boards = db.getAllPlinkoBoards();
      boards.forEach(b => db.updatePlinkoEnabled(b.id, false));

      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 'Test User', '', 'Rose', null, true
      );

      expect(result).toEqual({ success: false, error: 'No gift mapping found' });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('triggered Plinko but no mapping found')
      );
    });

    test('should not use defaults when gift name is empty even with useDefaults=true', async () => {
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 'Test User', '', '', null, true
      );

      expect(result).toEqual({ success: false, error: 'No gift mapping found' });
    });

    test('should use defaults when only giftId provided (empty giftName) with useDefaults=true', async () => {
      // Simulates Trigger-Tab configured by ID only, giftName empty from TikTok event
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 'Test User', '', '', '5655', true
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('using defaults (betAmount=100, ballType=standard)')
      );
      expect(gameEnginePlugin.plinkoGame.spawnBall).toHaveBeenCalledWith(
        'testuser', 'Test User', '', 100, 'standard'
      );
    });

    test('should spawn multiple balls when ballCount > 1 in mapping', async () => {
      // Add a board-specific mapping with ballCount: 3
      const boards = db.getAllPlinkoBoards();
      db.updatePlinkoGiftMappings(boards[0].id, {
        'Dragon': { betAmount: 200, ballType: 'standard', ballCount: 3 }
      });

      const originalSpawnBalls = gameEnginePlugin.plinkoGame.spawnBalls.bind(gameEnginePlugin.plinkoGame);
      gameEnginePlugin.plinkoGame.spawnBalls = jest.fn().mockResolvedValue({ success: true, ballIds: ['b1', 'b2', 'b3'] });

      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 'Test User', '', 'Dragon', null, false
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(gameEnginePlugin.plinkoGame.spawnBalls).toHaveBeenCalledWith(
        'testuser', 'Test User', '', 200, 3, { preferredColor: null }
      );
      expect(gameEnginePlugin.plinkoGame.spawnBall).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Spawning 3 balls for testuser')
      );

      gameEnginePlugin.plinkoGame.spawnBalls = originalSpawnBalls;
    });

    test('board-specific mapping still takes precedence over defaults', async () => {
      // Add a board-specific mapping with custom values
      const boards = db.getAllPlinkoBoards();
      db.updatePlinkoGiftMappings(boards[0].id, {
        'Rose': { betAmount: 500, ballType: 'golden' }
      });

      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 'Test User', '', 'Rose', null, true
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      // Should NOT fall through to defaults - mapped values should be used
      expect(mockLogger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('using defaults')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('betAmount=500')
      );
      expect(gameEnginePlugin.plinkoGame.spawnBall).toHaveBeenCalledWith(
        'testuser', 'Test User', '', 500, 'golden'
      );
    });
  });

  describe('Board-aware path (boardId parameter)', () => {
    let originalSpawnBall;

    beforeEach(() => {
      originalSpawnBall = gameEnginePlugin.plinkoGame.spawnBall.bind(gameEnginePlugin.plinkoGame);
      gameEnginePlugin.plinkoGame.spawnBall = jest.fn().mockResolvedValue({ success: true, ballId: 'ball_boardaware' });
    });

    afterEach(() => {
      gameEnginePlugin.plinkoGame.spawnBall = originalSpawnBall;
    });

    test('gift on non-default board uses that board config directly', async () => {
      // Create a second (non-default) board with a gift mapping
      const secondBoardId = plinkoGame.createBoard('Non-Default Board');
      db.updatePlinkoGiftMappings(secondBoardId, {
        '7777': { name: 'StarFish', betAmount: 300, ballType: 'golden' }
      });

      // The first/default board has NO mapping for this gift
      const firstBoards = db.getAllPlinkoBoards();
      const defaultBoardId = firstBoards[0].id;
      db.updatePlinkoGiftMappings(defaultBoardId, {});

      // Call with boardId pointing to the second board
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'user_nd', 'User ND', '', 'StarFish', '7777', false, secondBoardId
      );

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      // Must find the mapping on the targeted non-default board
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Board-aware path: targeting board ID ${secondBoardId}`)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Non-Default Board')
      );
      expect(gameEnginePlugin.plinkoGame.spawnBall).toHaveBeenCalledWith(
        'user_nd', 'User ND', '', 300, 'golden'
      );
    });

    test('board-aware path does NOT fall back to default board mapping silently', async () => {
      // Default board has a gift mapping; second board does NOT
      const boards = db.getAllPlinkoBoards();
      const defaultBoardId = boards[0].id;
      db.updatePlinkoGiftMappings(defaultBoardId, {
        'Rose': { betAmount: 999, ballType: 'golden' }
      });

      const secondBoardId = plinkoGame.createBoard('Empty Board');
      // No mapping on second board

      // Call with boardId = secondBoardId (explicit non-default board)
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'user_nd2', 'User ND2', '', 'Rose', null, false, secondBoardId
      );

      // Should NOT find the mapping on the second board's primary config;
      // it falls through to the all-boards fallback which finds it on the default board.
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      // A warning should be logged that the targeted board didn't have the mapping
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining(`not found in targeted board ID ${secondBoardId}`)
      );
      // Eventually found via fallback
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Spawning ball for user_nd2')
      );
    });

    test('handleGiftTrigger passes boardId of matched board to handlePlinkoGiftTrigger', () => {
      // Create a second (non-default) board with the gift
      const secondBoardId = plinkoGame.createBoard('Board2');
      db.updatePlinkoGiftMappings(secondBoardId, {
        '8888': { name: 'Comet', betAmount: 200, ballType: 'standard' }
      });

      // Set up mock stubs
      const mockWheelGame = { findWheelByGiftTrigger: jest.fn().mockReturnValue(null) };
      gameEnginePlugin.wheelGame = mockWheelGame;
      gameEnginePlugin.handleWheelGiftTrigger = jest.fn();
      const mockHandlePlinko = jest.fn().mockResolvedValue({ success: true });
      gameEnginePlugin.handlePlinkoGiftTrigger = mockHandlePlinko;
      gameEnginePlugin.handleGameStart = jest.fn();

      // Provide the inline handleGiftTrigger (mirrors main.js)
      gameEnginePlugin.handleGiftTrigger = function(data) {
        const { uniqueId, giftName, giftId, nickname, giftPictureUrl, profilePictureUrl = '', repeatEnd } = data;
        if (repeatEnd === false) return;
        const dedupKey = `${uniqueId}_${giftName}_${giftId || 'noId'}`;
        const now = Date.now();
        const lastEventTime = this.recentGiftEvents.get(dedupKey);
        if (lastEventTime && (now - lastEventTime) < this.GIFT_DEDUP_WINDOW_MS) return;
        const giftIdStr = this.normalizeGiftId(giftId);
        const matchingWheel = this.wheelGame.findWheelByGiftTrigger(giftIdStr || giftName);
        if (matchingWheel) { this.recentGiftEvents.set(dedupKey, now); this.handleWheelGiftTrigger(uniqueId, nickname, profilePictureUrl, giftName, matchingWheel.id); return; }
        const matchingPlinkoBoard = this.plinkoGame.findBoardByGiftTrigger(giftIdStr) || this.plinkoGame.findBoardByGiftTrigger(giftName);
        if (matchingPlinkoBoard) { this.recentGiftEvents.set(dedupKey, now); this.handlePlinkoGiftTrigger(uniqueId, nickname, profilePictureUrl, giftName, giftIdStr, false, matchingPlinkoBoard.id); return; }
        const triggers = this.db.getTriggers();
        const giftNameLower = (giftName || '').toLowerCase().trim();
        const matchingTrigger = triggers.find(t => { if (t.trigger_type !== 'gift') return false; const tv = this.normalizeGiftId(t.trigger_value); const tvl = (t.trigger_value || '').toLowerCase().trim(); return tv === giftIdStr || tvl === giftNameLower; });
        if (!matchingTrigger) return;
        this.recentGiftEvents.set(dedupKey, now);
        if (matchingTrigger.game_type === 'plinko') { this.handlePlinkoGiftTrigger(uniqueId, nickname, profilePictureUrl, giftName, giftIdStr, true); return; }
        this.handleGameStart(matchingTrigger.game_type, uniqueId, nickname, 'gift', giftName, giftPictureUrl);
      };

      gameEnginePlugin.handleGiftTrigger({
        uniqueId: 'user_b2', giftName: 'Comet', giftId: 8888,
        nickname: 'UserB2', giftPictureUrl: '', repeatEnd: true, repeatCount: 1
      });

      // handlePlinkoGiftTrigger must be called with the secondBoardId
      expect(mockHandlePlinko).toHaveBeenCalledWith(
        'user_b2', 'UserB2', '', 'Comet', '8888', false, secondBoardId
      );
    });

    test('Trigger-Tab-only path still passes null boardId (no board context)', () => {
      // No board mapping – only a general trigger entry
      db.addTrigger('plinko', 'gift', 'MagicWand');

      const mockWheelGame = { findWheelByGiftTrigger: jest.fn().mockReturnValue(null) };
      gameEnginePlugin.wheelGame = mockWheelGame;
      gameEnginePlugin.handleWheelGiftTrigger = jest.fn();
      const mockHandlePlinko = jest.fn().mockResolvedValue({ success: true });
      gameEnginePlugin.handlePlinkoGiftTrigger = mockHandlePlinko;
      gameEnginePlugin.handleGameStart = jest.fn();

      // Provide the inline handleGiftTrigger (mirrors main.js)
      gameEnginePlugin.handleGiftTrigger = function(data) {
        const { uniqueId, giftName, giftId, nickname, giftPictureUrl, profilePictureUrl = '', repeatEnd } = data;
        if (repeatEnd === false) return;
        const dedupKey = `${uniqueId}_${giftName}_${giftId || 'noId'}`;
        const now = Date.now();
        const lastEventTime = this.recentGiftEvents.get(dedupKey);
        if (lastEventTime && (now - lastEventTime) < this.GIFT_DEDUP_WINDOW_MS) return;
        const giftIdStr = this.normalizeGiftId(giftId);
        const matchingWheel = this.wheelGame.findWheelByGiftTrigger(giftIdStr || giftName);
        if (matchingWheel) { this.recentGiftEvents.set(dedupKey, now); this.handleWheelGiftTrigger(uniqueId, nickname, profilePictureUrl, giftName, matchingWheel.id); return; }
        const matchingPlinkoBoard = this.plinkoGame.findBoardByGiftTrigger(giftIdStr) || this.plinkoGame.findBoardByGiftTrigger(giftName);
        if (matchingPlinkoBoard) { this.recentGiftEvents.set(dedupKey, now); this.handlePlinkoGiftTrigger(uniqueId, nickname, profilePictureUrl, giftName, giftIdStr, false, matchingPlinkoBoard.id); return; }
        const triggers = this.db.getTriggers();
        const giftNameLower = (giftName || '').toLowerCase().trim();
        const matchingTrigger = triggers.find(t => { if (t.trigger_type !== 'gift') return false; const tv = this.normalizeGiftId(t.trigger_value); const tvl = (t.trigger_value || '').toLowerCase().trim(); return tv === giftIdStr || tvl === giftNameLower; });
        if (!matchingTrigger) return;
        this.recentGiftEvents.set(dedupKey, now);
        if (matchingTrigger.game_type === 'plinko') { this.handlePlinkoGiftTrigger(uniqueId, nickname, profilePictureUrl, giftName, giftIdStr, true); return; }
        this.handleGameStart(matchingTrigger.game_type, uniqueId, nickname, 'gift', giftName, giftPictureUrl);
      };

      gameEnginePlugin.handleGiftTrigger({
        uniqueId: 'user_tt', giftName: 'MagicWand', giftId: null,
        nickname: 'UserTT', giftPictureUrl: '', repeatEnd: true, repeatCount: 1
      });

      // Trigger-Tab path: useDefaults=true, boardId should be absent (undefined or not the 7th arg)
      expect(mockHandlePlinko).toHaveBeenCalledWith(
        'user_tt', 'UserTT', '', 'MagicWand', '', true
      );
      // boardId must NOT be passed (should remain undefined / 7th arg absent)
      const callArgs = mockHandlePlinko.mock.calls[0];
      expect(callArgs.length).toBe(6); // 6 args, no boardId
    });
  });
});
