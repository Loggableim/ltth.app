const path = require('path');
const FireworksPlugin = require('../plugins/fireworks/main');

function createApi(savedConfig = null) {
  return {
    emit: jest.fn(),
    getConfig: jest.fn(() => savedConfig),
    getDatabase: jest.fn(() => ({
      getGift: jest.fn(() => null)
    })),
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
    plugin.overlayTelemetry.set('obs-overlay', {
      benchmark: false,
      fps: 10,
      updatedAt: Date.now()
    });
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
    plugin.overlayTelemetry.set('obs-overlay', {
      benchmark: false,
      fps: 60,
      updatedAt: Date.now()
    });

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

  test('handleGiftEvent treats adapter coins as total coins instead of multiplying repeatCount twice', () => {
    jest.useFakeTimers();
    const api = createApi();
    const plugin = new FireworksPlugin(api);
    plugin.loadConfig();
    plugin.overlayTelemetry.set('obs-overlay', {
      benchmark: false,
      fps: 60,
      updatedAt: Date.now()
    });

    plugin.handleGiftEvent({
      giftId: 5655,
      giftName: 'Rose',
      userId: 'viewer-1',
      uniqueId: 'viewer_1',
      diamondCount: 1,
      repeatCount: 100,
      coins: 100
    });

    expect(api.emit).toHaveBeenCalledWith(
      'fireworks:trigger',
      expect.objectContaining({
        reason: 'gift',
        coins: 100,
        tier: 'medium'
      })
    );

    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('keeps benchmark FPS isolated from live overlay stability telemetry', () => {
    const plugin = new FireworksPlugin(createApi());
    const now = Date.now();
    plugin.overlayTelemetry.set('obs-overlay', { benchmark: false, fps: 22, updatedAt: now });
    plugin.overlayTelemetry.set('preview-overlay', { benchmark: false, fps: 48, updatedAt: now });
    plugin.overlayTelemetry.set('benchmark-overlay', { benchmark: true, fps: 60, updatedAt: now });

    expect(plugin.getOverlayFps(false)).toEqual({ fps: 22, sampleCount: 2 });
    expect(plugin.getOverlayFps(true)).toEqual({ fps: 60, sampleCount: 1 });
  });

  test('drops stale overlay telemetry instead of using it for backpressure', () => {
    const plugin = new FireworksPlugin(createApi());
    plugin.overlayTelemetry.set('stale-overlay', {
      benchmark: false,
      fps: 5,
      updatedAt: Date.now() - 6000
    });

    expect(plugin.getOverlayFps(false)).toEqual({ fps: 0, sampleCount: 0 });
    expect(plugin.overlayTelemetry.size).toBe(0);
  });

  test('ignores hidden browser previews when selecting live overlay FPS', () => {
    const plugin = new FireworksPlugin(createApi());
    const now = Date.now();
    plugin.overlayTelemetry.set('obs-overlay', { benchmark: false, visible: true, fps: 58, updatedAt: now });
    plugin.overlayTelemetry.set('hidden-preview', { benchmark: false, visible: false, fps: 2, updatedAt: now });

    expect(plugin.getOverlayFps(false)).toEqual({ fps: 58, sampleCount: 1 });
  });
});
