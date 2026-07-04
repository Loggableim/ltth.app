const path = require('path');
const FireworksPlugin = require('../plugins/fireworks/main');

function createApi(savedConfig = null) {
  return {
    emit: jest.fn(),
    getConfig: jest.fn(() => savedConfig),
    getPluginDataDir: jest.fn(() => path.join(__dirname, 'tmp-fireworks-data')),
    log: jest.fn(),
    setConfig: jest.fn()
  };
}

describe('Fireworks stable plugin stability integration', () => {
  test('loadConfig normalizes broken saved settings before runtime use', () => {
    const api = createApi({
      maxConcurrentFireworks: 999,
      maxTotalParticles: 99999,
      minFps: 1,
      defaultShape: 'bad-shape'
    });
    const plugin = new FireworksPlugin(api);

    plugin.loadConfig();

    expect(plugin.config.maxConcurrentFireworks).toBe(20);
    expect(plugin.config.maxTotalParticles).toBe(3000);
    expect(plugin.config.minFps).toBe(15);
    expect(plugin.config.defaultShape).toBe('burst');
  });

  test('triggerFirework drops small gift triggers when overlay fps is unsafe', () => {
    const api = createApi();
    const plugin = new FireworksPlugin(api);
    plugin.loadConfig();
    plugin.currentFps = 10;
    plugin.config.minFps = 24;

    plugin.triggerFirework({
      reason: 'gift',
      tier: 'small',
      particleCount: 30
    });

    expect(api.emit).not.toHaveBeenCalledWith('fireworks:trigger', expect.any(Object));
    expect(api.log).toHaveBeenCalledWith(
      '[FIREWORKS] Trigger dropped by stability policy: low-fps-small-gift',
      'debug'
    );
  });

  test('triggerFirework budgets large gift particles under high load', () => {
    jest.useFakeTimers();
    const api = createApi();
    const plugin = new FireworksPlugin(api);
    plugin.loadConfig();
    plugin.config.maxConcurrentFireworks = 10;
    plugin.config.maxTotalParticles = 1000;
    plugin.activeFireworkCount = 7;
    plugin.currentFps = 60;

    plugin.triggerFirework({
      reason: 'gift',
      tier: 'massive',
      intensity: 4,
      particleCount: 900
    });

    expect(api.emit).toHaveBeenCalledWith(
      'fireworks:trigger',
      expect.objectContaining({
        tier: 'massive',
        particleCount: 500,
        requestedParticleCount: 900
      })
    );

    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });
});
