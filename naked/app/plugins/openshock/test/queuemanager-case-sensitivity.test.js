/**
 * QueueManager Case Sensitivity Test
 * 
 * Tests that the QueueManager correctly handles command types in different cases
 * (e.g., 'Shock', 'shock', 'Vibrate', 'vibrate', etc.)
 */

const QueueManager = require('../helpers/queueManager');

describe('QueueManager - Command Type Case Sensitivity', () => {
  let queueManager;
  let mockOpenShockClient;
  let mockSafetyManager;
  let mockLogger;

  beforeEach(() => {
    // Mock OpenShock Client
    mockOpenShockClient = {
      sendShock: jest.fn().mockResolvedValue({ success: true }),
      sendVibrate: jest.fn().mockResolvedValue({ success: true }),
      sendSound: jest.fn().mockResolvedValue({ success: true })
    };

    // Mock Safety Manager
    mockSafetyManager = {
      checkCommand: jest.fn((command) => ({
        allowed: true,
        modifiedCommand: command
      }))
    };

    // Mock Logger
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    queueManager = new QueueManager(mockOpenShockClient, mockSafetyManager, mockLogger);
  });

  afterEach(() => {
    if (queueManager) {
      queueManager.stopProcessing();
    }
  });

  describe('Capitalized command types (from Plinko)', () => {
    test('should handle capitalized Shock command', async () => {
      const command = {
        type: 'Shock', // Capitalized
        deviceId: 'test-device',
        intensity: 50,
        duration: 1000
      };

      const result = await queueManager.enqueue(command, 'testuser', 'plinko-reward', {}, 5);
      
      expect(result.success).toBe(true);
      expect(result.queueId).toBeDefined();

      // Note: We use timeouts here because we're testing actual async queue processing
      // The queue manager processes items asynchronously with delays, so we need to wait
      // for the processing loop to complete. In a production environment, you'd use
      // event listeners or callbacks instead.
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify the command was executed
      expect(mockOpenShockClient.sendShock).toHaveBeenCalledWith('test-device', 50, 1000);
    });

    test('should handle capitalized Vibrate command', async () => {
      const command = {
        type: 'Vibrate', // Capitalized
        deviceId: 'test-device',
        intensity: 60,
        duration: 2000
      };

      const result = await queueManager.enqueue(command, 'testuser', 'plinko-reward', {}, 5);
      
      expect(result.success).toBe(true);
      expect(result.queueId).toBeDefined();

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify the command was executed
      expect(mockOpenShockClient.sendVibrate).toHaveBeenCalledWith('test-device', 60, 2000);
    });

    test('should handle capitalized Sound command', async () => {
      const command = {
        type: 'Sound', // Capitalized
        deviceId: 'test-device',
        intensity: 70,
        duration: 1500
      };

      const result = await queueManager.enqueue(command, 'testuser', 'plinko-reward', {}, 5);
      
      expect(result.success).toBe(true);
      expect(result.queueId).toBeDefined();

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify the command was executed
      expect(mockOpenShockClient.sendSound).toHaveBeenCalledWith('test-device', 70, 1500);
    });
  });

  describe('Lowercase command types (from other sources)', () => {
    test('should handle lowercase shock command', async () => {
      const command = {
        type: 'shock', // lowercase
        deviceId: 'test-device',
        intensity: 40,
        duration: 800
      };

      const result = await queueManager.enqueue(command, 'testuser', 'tiktok-gift', {}, 5);
      
      expect(result.success).toBe(true);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify the command was executed
      expect(mockOpenShockClient.sendShock).toHaveBeenCalledWith('test-device', 40, 800);
    });

    test('should handle lowercase vibrate command', async () => {
      const command = {
        type: 'vibrate', // lowercase
        deviceId: 'test-device',
        intensity: 55,
        duration: 1200
      };

      const result = await queueManager.enqueue(command, 'testuser', 'tiktok-follow', {}, 5);
      
      expect(result.success).toBe(true);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify the command was executed
      expect(mockOpenShockClient.sendVibrate).toHaveBeenCalledWith('test-device', 55, 1200);
    });
  });

  describe('Mixed case command types', () => {
    test('should handle mixed case VIBRATE command', async () => {
      const command = {
        type: 'VIBRATE', // All caps
        deviceId: 'test-device',
        intensity: 65,
        duration: 1800
      };

      const result = await queueManager.enqueue(command, 'testuser', 'test', {}, 5);
      
      expect(result.success).toBe(true);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify the command was executed
      expect(mockOpenShockClient.sendVibrate).toHaveBeenCalledWith('test-device', 65, 1800);
    });

    test('should handle mixed case ShOcK command', async () => {
      const command = {
        type: 'ShOcK', // Mixed case
        deviceId: 'test-device',
        intensity: 45,
        duration: 900
      };

      const result = await queueManager.enqueue(command, 'testuser', 'test', {}, 5);
      
      expect(result.success).toBe(true);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify the command was executed
      expect(mockOpenShockClient.sendShock).toHaveBeenCalledWith('test-device', 45, 900);
    });
  });

  describe('Queue sequential processing', () => {
    test('should process multiple commands sequentially', async () => {
      const commands = [
        { type: 'Shock', deviceId: 'device-1', intensity: 50, duration: 500 },
        { type: 'Vibrate', deviceId: 'device-2', intensity: 60, duration: 600 },
        { type: 'Sound', deviceId: 'device-3', intensity: 70, duration: 700 }
      ];

      // Enqueue all commands
      for (const cmd of commands) {
        await queueManager.enqueue(cmd, 'testuser', 'test', {}, 5);
      }

      // Wait for all to process
      await new Promise(resolve => setTimeout(resolve, 2500));

      // Verify all commands were executed in order
      expect(mockOpenShockClient.sendShock).toHaveBeenCalledWith('device-1', 50, 500);
      expect(mockOpenShockClient.sendVibrate).toHaveBeenCalledWith('device-2', 60, 600);
      expect(mockOpenShockClient.sendSound).toHaveBeenCalledWith('device-3', 70, 700);

      // Verify they were called sequentially (not in parallel)
      const shockCallTime = mockOpenShockClient.sendShock.mock.invocationCallOrder[0];
      const vibrateCallTime = mockOpenShockClient.sendVibrate.mock.invocationCallOrder[0];
      const soundCallTime = mockOpenShockClient.sendSound.mock.invocationCallOrder[0];

      expect(shockCallTime).toBeLessThan(vibrateCallTime);
      expect(vibrateCallTime).toBeLessThan(soundCallTime);
    });
  });

  describe('Invalid command types', () => {
    test('should reject unknown command type', async () => {
      const command = {
        type: 'invalid-type',
        deviceId: 'test-device',
        intensity: 50,
        duration: 1000
      };

      const result = await queueManager.enqueue(command, 'testuser', 'test', {}, 5);
      
      expect(result.success).toBe(true); // Enqueue succeeds

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verify none of the send methods were called
      expect(mockOpenShockClient.sendShock).not.toHaveBeenCalled();
      expect(mockOpenShockClient.sendVibrate).not.toHaveBeenCalled();
      expect(mockOpenShockClient.sendSound).not.toHaveBeenCalled();

      // Check that an error was logged
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Safety accounting integration', () => {
    test('passes sourceData into safety checks and registers successful commands', async () => {
      const command = {
        type: 'vibrate',
        deviceId: 'test-device',
        intensity: 50,
        duration: 300
      };
      const sourceData = { username: 'viewer', isSubscriber: true };
      mockSafetyManager.registerCommand = jest.fn();

      const processed = new Promise(resolve => queueManager.once('item-processed', resolve));

      await queueManager.enqueue(command, 'viewer-1', 'gift', sourceData, 5);
      await processed;

      expect(mockSafetyManager.checkCommand).toHaveBeenCalledWith(
        command,
        'viewer-1',
        'test-device',
        sourceData
      );
      expect(mockSafetyManager.registerCommand).toHaveBeenCalledWith(
        'test-device',
        'viewer-1',
        expect.objectContaining(command)
      );
    });

    test('does not retry commands blocked by safety rules', async () => {
      mockSafetyManager.checkCommand = jest.fn(() => ({
        allowed: false,
        reason: 'Default cooldown active'
      }));
      queueManager.retryDelay = 0;

      const command = {
        type: 'vibrate',
        deviceId: 'test-device',
        intensity: 50,
        duration: 1
      };
      const processed = new Promise(resolve => queueManager.once('item-processed', resolve));

      await queueManager.enqueue(command, 'viewer-1', 'gift', {}, 5);
      await processed;

      expect(mockSafetyManager.checkCommand).toHaveBeenCalledTimes(1);
      expect(mockOpenShockClient.sendVibrate).not.toHaveBeenCalled();
    });
  });
});
