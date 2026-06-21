/**
 * Plinko OpenShock Multi-Device Tests
 * Tests for triggering OpenShock rewards on multiple devices
 */

const PlinkoGame = require('../games/plinko');

describe('Plinko OpenShock Multi-Device Integration', () => {
  let plinkoGame;
  let mockApi;
  let mockSocketIO;
  let mockDb;
  let mockOpenshockPlugin;
  let queuedCommands;

  beforeEach(() => {
    queuedCommands = [];

    // Mock Socket.IO
    mockSocketIO = {
      on: jest.fn(),
      emit: jest.fn()
    };

    // Mock Database
    mockDb = {
      getAllPlinkoBoards: jest.fn(() => []),
      getPlinkoBoard: jest.fn(() => null),
      recordPlinkoTransaction: jest.fn(),
      recordPlinkoTestTransaction: jest.fn()
    };

    // Mock OpenShock Plugin with QueueManager
    mockOpenshockPlugin = {
      instance: {
        queueManager: {
          enqueue: jest.fn((command, username, source, metadata, priority) => {
            queuedCommands.push({ command, username, source, metadata, priority });
            return Promise.resolve({
              success: true,
              queueId: `queue-${queuedCommands.length}`,
              position: queuedCommands.length
            });
          })
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
      pluginLoader: {
        loadedPlugins: new Map([
          ['openshock', mockOpenshockPlugin]
        ])
      }
    };

    plinkoGame = new PlinkoGame(mockApi, mockSocketIO, mockDb);
    
    // Mock logger
    plinkoGame.logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };
  });

  describe('triggerOpenshockReward - Multi-Device Support', () => {
    test('should trigger multiple devices when deviceIds array is provided', async () => {
      const reward = {
        enabled: true,
        type: 'Vibrate',
        intensity: 50,
        duration: 1000,
        deviceIds: ['device-1', 'device-2', 'device-3']
      };

      const result = await plinkoGame.triggerOpenshockReward('testuser', reward, 0);

      expect(result).toBe(true);
      expect(queuedCommands).toHaveLength(3);
      
      // Verify all devices were queued
      expect(queuedCommands[0].command.deviceId).toBe('device-1');
      expect(queuedCommands[1].command.deviceId).toBe('device-2');
      expect(queuedCommands[2].command.deviceId).toBe('device-3');

      // Verify command parameters are consistent
      queuedCommands.forEach(cmd => {
        expect(cmd.command.type).toBe('Vibrate');
        expect(cmd.command.intensity).toBe(50);
        expect(cmd.command.duration).toBe(1000);
        expect(cmd.username).toBe('testuser');
        expect(cmd.source).toBe('plinko-reward');
      });

      // Verify socket event was emitted
      expect(mockSocketIO.emit).toHaveBeenCalledWith('plinko:openshock-triggered', 
        expect.objectContaining({
          username: 'testuser',
          type: 'Vibrate',
          deviceCount: 3,
          totalDevices: 3
        })
      );
    });

    test('should support backward compatibility with single deviceId string', async () => {
      const reward = {
        enabled: true,
        type: 'Shock',
        intensity: 30,
        duration: 500,
        deviceId: 'legacy-device-id'  // Old format
      };

      const result = await plinkoGame.triggerOpenshockReward('testuser', reward, 0);

      expect(result).toBe(true);
      expect(queuedCommands).toHaveLength(1);
      expect(queuedCommands[0].command.deviceId).toBe('legacy-device-id');
    });

    test('should fail gracefully when no devices are configured', async () => {
      const reward = {
        enabled: true,
        type: 'Vibrate',
        intensity: 50,
        duration: 1000,
        deviceIds: []  // Empty array
      };

      const result = await plinkoGame.triggerOpenshockReward('testuser', reward, 0);

      expect(result).toBe(false);
      expect(queuedCommands).toHaveLength(0);
    });

    test('should fail gracefully when deviceIds is missing and deviceId is empty', async () => {
      const reward = {
        enabled: true,
        type: 'Vibrate',
        intensity: 50,
        duration: 1000,
        deviceId: ''  // Empty string
      };

      const result = await plinkoGame.triggerOpenshockReward('testuser', reward, 0);

      expect(result).toBe(false);
      expect(queuedCommands).toHaveLength(0);
    });

    test('should clamp intensity and duration to safety limits', async () => {
      const reward = {
        enabled: true,
        type: 'Vibrate',
        intensity: 150,  // Over max (100)
        duration: 10000,  // Over max (5000)
        deviceIds: ['device-1']
      };

      const result = await plinkoGame.triggerOpenshockReward('testuser', reward, 0);

      expect(result).toBe(true);
      expect(queuedCommands[0].command.intensity).toBe(100);  // Clamped to max
      expect(queuedCommands[0].command.duration).toBe(5000);  // Clamped to max
    });

    test('should handle partial failures when some devices fail to queue', async () => {
      // Mock enqueue to fail for second device
      mockOpenshockPlugin.instance.queueManager.enqueue = jest.fn((command, username) => {
        const cmd = { command, username };
        queuedCommands.push(cmd);
        
        if (command.deviceId === 'device-2') {
          return Promise.resolve({
            success: false,
            message: 'Device not found'
          });
        }
        
        return Promise.resolve({
          success: true,
          queueId: `queue-${queuedCommands.length}`,
          position: queuedCommands.length
        });
      });

      const reward = {
        enabled: true,
        type: 'Vibrate',
        intensity: 50,
        duration: 1000,
        deviceIds: ['device-1', 'device-2', 'device-3']
      };

      const result = await plinkoGame.triggerOpenshockReward('testuser', reward, 0);

      // Should succeed if at least one device succeeded
      expect(result).toBe(true);
      expect(queuedCommands).toHaveLength(3);
      
      // Verify socket event shows partial success
      expect(mockSocketIO.emit).toHaveBeenCalledWith('plinko:openshock-triggered', 
        expect.objectContaining({
          deviceCount: 2,  // Only 2 succeeded
          totalDevices: 3
        })
      );
    });

    test('should fail when OpenShock plugin is not available', async () => {
      // Remove OpenShock plugin
      mockApi.pluginLoader.loadedPlugins.delete('openshock');

      const reward = {
        enabled: true,
        type: 'Vibrate',
        intensity: 50,
        duration: 1000,
        deviceIds: ['device-1']
      };

      const result = await plinkoGame.triggerOpenshockReward('testuser', reward, 0);

      expect(result).toBe(false);
      expect(queuedCommands).toHaveLength(0);
    });

    test('should validate required parameters', async () => {
      const invalidRewards = [
        { enabled: true, intensity: 50, duration: 1000, deviceIds: ['device-1'] },  // Missing type
        { enabled: true, type: 'Vibrate', duration: 1000, deviceIds: ['device-1'] },  // Missing intensity
        { enabled: true, type: 'Vibrate', intensity: 50, deviceIds: ['device-1'] },  // Missing duration
      ];

      for (const reward of invalidRewards) {
        queuedCommands = [];
        const result = await plinkoGame.triggerOpenshockReward('testuser', reward, 0);
        expect(result).toBe(false);
        expect(queuedCommands).toHaveLength(0);
      }
    });

    test('should handle NaN values from invalid form inputs with defaults', async () => {
      const rewardWithNaN = {
        enabled: true,
        type: 'Vibrate',
        intensity: NaN,  // Invalid form input resulted in NaN
        duration: 1000,
        deviceIds: ['device-1']
      };

      const result = await plinkoGame.triggerOpenshockReward('testuser', rewardWithNaN, 0);

      expect(result).toBe(true);  // Should succeed with default value
      expect(queuedCommands).toHaveLength(1);
      expect(queuedCommands[0].command.intensity).toBe(30);  // Default value
      expect(queuedCommands[0].command.duration).toBe(1000);
    });

    test('should handle both NaN intensity and duration with defaults', async () => {
      const rewardWithBothNaN = {
        enabled: true,
        type: 'Shock',
        intensity: NaN,  // Invalid form input
        duration: NaN,   // Invalid form input
        deviceIds: ['device-1', 'device-2']
      };

      const result = await plinkoGame.triggerOpenshockReward('testuser', rewardWithBothNaN, 0);

      expect(result).toBe(true);
      expect(queuedCommands).toHaveLength(2);
      expect(queuedCommands[0].command.intensity).toBe(30);   // Default value
      expect(queuedCommands[0].command.duration).toBe(1000);  // Default value
      expect(queuedCommands[1].command.intensity).toBe(30);
      expect(queuedCommands[1].command.duration).toBe(1000);
    });
  });

  describe('handleBallLanded - OpenShock Integration', () => {
    beforeEach(() => {
      // Setup plinkoGame with a test configuration
      plinkoGame.cachedConfig = {
        slots: [
          {
            multiplier: 10,
            color: '#FFD700',
            openshockReward: {
              enabled: true,
              type: 'Vibrate',
              intensity: 50,
              duration: 1000,
              deviceIds: ['device-1', 'device-2']
            }
          }
        ],
        physicsSettings: {
          testModeEnabled: false
        }
      };

      // Mock awardXP
      plinkoGame.awardXP = jest.fn().mockResolvedValue(true);
      
      // Ensure db has the required methods
      plinkoGame.db = {
        recordPlinkoTransaction: jest.fn(),
        recordPlinkoTestTransaction: jest.fn()
      };

      // Add active ball
      plinkoGame.activeBalls.set('ball-123', {
        ballId: 'ball-123',
        username: 'testuser',
        nickname: 'Test User',
        bet: 100,
        timestamp: Date.now() - 5000,  // 5 seconds ago (valid)
        isTest: false
      });
    });

    test('should trigger OpenShock rewards on multiple devices when ball lands', async () => {
      const result = await plinkoGame.handleBallLanded('ball-123', 0);

      expect(result.success).toBe(true);
      expect(queuedCommands).toHaveLength(2);
      expect(queuedCommands[0].command.deviceId).toBe('device-1');
      expect(queuedCommands[1].command.deviceId).toBe('device-2');
    });

    test('should trigger OpenShock for test balls', async () => {
      // Make it a test ball
      plinkoGame.activeBalls.get('ball-123').isTest = true;

      const result = await plinkoGame.handleBallLanded('ball-123', 0);

      expect(result.success).toBe(true);
      expect(queuedCommands).toHaveLength(2);  // Should trigger OpenShock even for test balls
      expect(queuedCommands[0].command.deviceId).toBe('device-1');
      expect(queuedCommands[1].command.deviceId).toBe('device-2');
    });

    test('should not trigger OpenShock when not enabled', async () => {
      plinkoGame.cachedConfig.slots[0].openshockReward.enabled = false;

      const result = await plinkoGame.handleBallLanded('ball-123', 0);

      expect(result.success).toBe(true);
      expect(queuedCommands).toHaveLength(0);  // Should not trigger OpenShock
    });
  });
});
