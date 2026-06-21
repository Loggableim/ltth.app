const SafetyManager = require('../helpers/safetyManager');

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

function createSafetyManager(config = {}) {
  return new SafetyManager({
    globalLimits: {
      maxIntensity: 80,
      maxDuration: 5000,
      maxCommandsPerMinute: 30
    },
    defaultCooldowns: {
      global: 1000,
      perDevice: 1000,
      perUser: 1000
    },
    userLimits: {
      minFollowerAge: 0,
      maxCommandsPerUser: 10,
      whitelist: [],
      blacklist: []
    },
    ...config
  }, logger);
}

describe('SafetyManager command accounting', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('enforces default cooldowns after a command is registered', () => {
    const manager = createSafetyManager();

    try {
      const first = manager.checkCommand(
        { type: 'vibrate', intensity: 50, duration: 1000 },
        'viewer-1',
        'device-1'
      );
      expect(first.allowed).toBe(true);

      manager.registerCommand('device-1', 'viewer-1', { type: 'vibrate', intensity: 50, duration: 1000 });

      const second = manager.checkCommand(
        { type: 'vibrate', intensity: 50, duration: 1000 },
        'viewer-1',
        'device-1'
      );
      expect(second.allowed).toBe(false);
      expect(second.reason).toMatch(/cooldown/i);
    } finally {
      manager.destroy();
    }
  });

  test('global rate limiting uses registered command history', () => {
    const manager = createSafetyManager({
      globalLimits: {
        maxIntensity: 80,
        maxDuration: 5000,
        maxCommandsPerMinute: 1
      },
      defaultCooldowns: {
        global: 0,
        perDevice: 0,
        perUser: 0
      }
    });

    try {
      manager.registerCommand('device-1', 'viewer-1', { type: 'vibrate', intensity: 50, duration: 1000 });

      const result = manager.checkCommand(
        { type: 'vibrate', intensity: 50, duration: 1000 },
        'viewer-2',
        'device-2'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/global rate limit/i);
    } finally {
      manager.destroy();
    }
  });
});
