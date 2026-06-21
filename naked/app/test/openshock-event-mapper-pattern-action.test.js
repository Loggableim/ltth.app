const OpenShockPlugin = require('../plugins/openshock/main');
const MappingEngine = require('../plugins/openshock/helpers/mappingEngine');
const PatternEngine = require('../plugins/openshock/helpers/patternEngine');

const silentLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

function createPlugin() {
  const api = {
    log: jest.fn(),
    getDatabase: jest.fn(() => ({}))
  };

  const plugin = new OpenShockPlugin(api);
  plugin.mappingEngine = new MappingEngine(silentLogger);
  plugin.patternEngine = new PatternEngine(silentLogger);
  plugin.devices = [{ id: 'device-1', name: 'Device 1' }];
  plugin.zappieHellManager = { addCoins: jest.fn(async () => {}) };
  plugin._addEventLog = jest.fn();
  plugin._addError = jest.fn();
  plugin.config.emergencyStop.enabled = false;

  const executePattern = jest.fn(async () => 'exec-1');
  plugin.patternExecutor = { executePattern };

  plugin.mappingEngine.addMapping({
    id: 'gift-range-pattern',
    name: '99-499 coins pattern',
    enabled: true,
    eventType: 'gift',
    conditions: {
      minCoins: 99,
      maxCoins: 499
    },
    action: {
      type: 'pattern',
      patternId: 'preset-wave',
      deviceId: 'device-1'
    },
    cooldown: {
      global: 0,
      perDevice: 0,
      perUser: 0
    }
  });

  return { plugin, executePattern };
}

describe('OpenShock event mapper pattern actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('matches gift coin ranges when payload only has diamondCount and repeatCount', () => {
    const engine = new MappingEngine(silentLogger);

    engine.addMapping({
      id: 'gift-range-pattern',
      name: '99-499 coins pattern',
      enabled: true,
      eventType: 'gift',
      conditions: {
        minCoins: 99,
        maxCoins: 499
      },
      action: {
        type: 'pattern',
        patternId: 'preset-wave',
        deviceId: 'device-1'
      },
      cooldown: {
        global: 0,
        perDevice: 0,
        perUser: 0
      }
    });

    const matches = engine.evaluateEvent('gift', {
      uniqueId: 'viewer-1',
      username: 'viewer-1',
      giftName: 'Concert',
      diamondCount: 100,
      repeatCount: 1
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].action.type).toBe('pattern');
    expect(matches[0].eventData.coins).toBe(100);
  });

  test('executes pattern action from a gift range mapping after gift normalization', async () => {
    const { plugin, executePattern } = createPlugin();

    await plugin.handleTikTokEvent('gift', {
      uniqueId: 'viewer-1',
      username: 'viewer-1',
      giftName: 'Concert',
      diamondCount: 100,
      repeatCount: 1
    });

    expect(plugin.zappieHellManager.addCoins).toHaveBeenCalledWith(100, 'gift');
    expect(executePattern).toHaveBeenCalledTimes(1);
    expect(executePattern).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'preset-wave' }),
      'device-1',
      'viewer-1',
      'gift',
      1,
      expect.objectContaining({
        username: 'viewer-1',
        sourceData: expect.objectContaining({
          coins: 100,
          giftCoins: 100
        })
      })
    );
  });

  test('resolves legacy pattern action values by pattern name', async () => {
    const { plugin, executePattern } = createPlugin();

    const result = await plugin.executeAction({
      type: 'pattern',
      patternName: 'Wave',
      deviceId: 'device-1'
    }, {
      userId: 'viewer-1',
      username: 'viewer-1',
      source: 'gift',
      sourceData: { coins: 100, repeatCount: 1 }
    });

    expect(result.success).toBe(true);
    expect(executePattern).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'preset-wave' }),
      'device-1',
      'viewer-1',
      'gift',
      1,
      expect.any(Object)
    );
  });
});
