const path = require('path');

const FireworksPlugin = require('../plugins/webgpu-fireworks/main');
const { FinaleShuffleBag } = require('../plugins/webgpu-fireworks/lib/finale-shuffle-bag');
const { FINALE_STYLES } = require('../plugins/webgpu-fireworks/lib/finale-show-planner');
const {
  ALLOWED_FINALE_LENGTHS,
  ALLOWED_FINALE_STYLES,
  DEFAULT_FIREWORKS_CONFIG,
  normalizeConfig,
  normalizeFinaleRequest
} = require('../plugins/webgpu-fireworks/lib/config-schema');

function createApi() {
  const routes = new Map();
  const events = new Map();
  return {
    routes,
    events,
    getPluginDataDir: () => path.join(__dirname, '.tmp-webgpu-fireworks-finale'),
    getConfig: jest.fn(() => null),
    setConfig: jest.fn(),
    getDatabase: jest.fn(() => null),
    emit: jest.fn(),
    log: jest.fn(),
    registerMiddleware: jest.fn(),
    registerRoute: jest.fn((method, route, handler) => routes.set(`${method}:${route}`, handler)),
    registerTikTokEvent: jest.fn((event, handler) => events.set(event, handler))
  };
}

function createPlugin(config = {}) {
  const api = createApi();
  const plugin = new FireworksPlugin(api);
  plugin.config = normalizeConfig(config);
  return { api, plugin };
}

describe('WebGPU finale backend contract', () => {
  test('normalizes global finale defaults and rejects invalid style and length values', () => {
    expect(ALLOWED_FINALE_STYLES).toEqual([
      'auto',
      'classic-crescendo',
      'symmetric-salute',
      'sky-ballet',
      'thunder-finale',
      'nishiki-kamuro',
      'aurora-cathedral',
      'royal-brocade',
      'phoenix-ascension',
      'furry-celebration'
    ]);
    expect(ALLOWED_FINALE_LENGTHS).toEqual(['short', 'medium', 'long']);
    expect(DEFAULT_FIREWORKS_CONFIG).toMatchObject({
      goalFinaleStyle: 'auto',
      goalFinaleLength: 'medium',
      goalFinaleDuration: 18000
    });
    expect(normalizeConfig({
      goalFinaleStyle: 'not-a-show',
      goalFinaleLength: 'forever',
      goalFinaleDuration: 999999
    })).toMatchObject({
      goalFinaleStyle: 'auto',
      goalFinaleLength: 'medium',
      goalFinaleDuration: 30000
    });
  });

  test.each([
    [14000, 'short', 10000],
    [14001, 'medium', 18000],
    [23000, 'medium', 18000],
    [23001, 'long', 28000]
  ])('maps legacy duration %dms to %s', (duration, length, durationMs) => {
    expect(normalizeFinaleRequest({ duration })).toMatchObject({ length, duration: durationMs, durationMs });
  });

  test('treats explicit length as authoritative and preserves sanitized queue identity inputs', () => {
    expect(normalizeFinaleRequest({
      style: 'sky-ballet',
      length: 'short',
      duration: 29000,
      intensity: 99,
      seed: 0xffffffff + 10,
      bypassEnabled: true,
      eventId: 'goal:weekly-42'
    })).toEqual({
      style: 'sky-ballet',
      length: 'short',
      intensity: 10,
      seed: 9,
      bypassEnabled: true,
      eventId: 'goal:weekly-42',
      id: 'goal:weekly-42',
      duration: 10000,
      durationMs: 10000
    });

    expect(normalizeFinaleRequest({ style: 'inherit', length: 'inherit' })).toMatchObject({
      style: 'auto',
      length: 'medium',
      durationMs: 18000
    });
    expect(normalizeFinaleRequest({ style: 'invalid', length: 'invalid' })).toMatchObject({
      style: 'auto',
      length: 'medium',
      durationMs: 18000
    });
  });

  test('emits an authoritative deterministic show plan without configured shapes or colors', () => {
    const { api, plugin } = createPlugin({
      activeShapes: ['paws'],
      themeColors: ['#123456'],
      audioEnabled: false,
      audioVolume: 0.35,
      orientation: 'portrait'
    });

    const result = plugin.triggerFinale({
      style: 'sky-ballet',
      length: 'short',
      intensity: 4,
      seed: 1234,
      eventId: 'goal-123'
    });

    expect(result).toMatchObject({
      accepted: true,
      id: 'goal-123',
      eventId: 'goal-123',
      style: 'sky-ballet',
      length: 'short',
      duration: 10000,
      durationMs: 10000,
      seed: 1234
    });
    expect(result.showPlan).toMatchObject({
      planVersion: 2,
      id: 'goal-123',
      style: 'sky-ballet',
      length: 'short',
      durationMs: 10000,
      seed: 1234
    });
    expect(result).toMatchObject({
      playSound: false,
      audioVolume: 0.35,
      audioMuted: true,
      audioMasterVolume: 0.35
    });
    expect(result).not.toHaveProperty('shapes');
    expect(result).not.toHaveProperty('colors');
    expect(api.emit).toHaveBeenCalledWith('webgpu-fireworks:finale', result);

    const repeat = createPlugin({ orientation: 'portrait' }).plugin.triggerFinale({
      style: 'sky-ballet', length: 'short', intensity: 4, seed: 1234, eventId: 'goal-123'
    });
    expect(repeat.showPlan).toEqual(result.showPlan);
  });

  test('provides all nine built-ins to an injectable runtime-local Auto shuffle bag', () => {
    const first = createPlugin().plugin;
    const second = createPlugin().plugin;
    first.finaleShuffleBag = new FinaleShuffleBag(
      () => first.getAutoEligibleFinaleStyleIds(),
      () => 0.999999
    );
    second.finaleShuffleBag = new FinaleShuffleBag(
      () => second.getAutoEligibleFinaleStyleIds(),
      () => 0.999999
    );
    const styles = Array.from({ length: FINALE_STYLES.length }, (_, index) => first.triggerFinale({
      style: 'auto', length: 'short', seed: index + 1, id: `auto-${index}`
    }).style);

    expect(first.getAutoEligibleFinaleStyleIds()).toEqual(FINALE_STYLES);
    expect(new Set(styles)).toEqual(new Set(FINALE_STYLES));
    expect(second.triggerFinale({ style: 'auto', seed: 77, id: 'new-instance' }).style)
      .toBe(styles[0]);
  });

  test('uses the Auto bag for Auto, bypasses it for explicit styles, and keeps legacy payloads compatible', () => {
    const { plugin } = createPlugin();
    plugin.finaleShuffleBag = { draw: jest.fn(() => 'sky-ballet') };

    expect(plugin.triggerFinale({ style: 'auto', seed: 1, id: 'auto' }).style).toBe('sky-ballet');
    expect(plugin.triggerFinale({ style: 'thunder-finale', seed: 2, id: 'explicit' }).style)
      .toBe('thunder-finale');
    expect(plugin.triggerFinale(5, 14000, true)).toMatchObject({
      accepted: true,
      intensity: 5,
      length: 'short',
      durationMs: 10000
    });
    expect(plugin.finaleShuffleBag.draw).toHaveBeenCalledTimes(2);
  });

  test('generates unique IDs for same-millisecond finales that reuse an explicit seed', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1720000000000);
    try {
      const { plugin } = createPlugin();
      const first = plugin.triggerFinale({ style: 'classic-crescendo', seed: 99 });
      const second = plugin.triggerFinale({ style: 'classic-crescendo', seed: 99 });

      expect(first.id).not.toBe(second.id);
      expect(first.showPlan.id).toBe(first.id);
      expect(second.showPlan.id).toBe(second.id);
    } finally {
      now.mockRestore();
    }
  });

  test('uses global values for object calls with inherit and for omitted legacy duration', () => {
    const { plugin } = createPlugin({
      goalFinaleStyle: 'thunder-finale',
      goalFinaleLength: 'long',
      goalFinaleIntensity: 6
    });

    expect(plugin.triggerFinale({ style: 'inherit', length: 'inherit', seed: 1, id: 'inherit' }))
      .toMatchObject({ style: 'thunder-finale', length: 'long', intensity: 6, durationMs: 28000 });
    expect(plugin.triggerFinale(2))
      .toMatchObject({ style: 'thunder-finale', length: 'long', intensity: 2, durationMs: 28000 });
  });

  test('keeps positional legacy calls and their duration mapping compatible', () => {
    const { plugin } = createPlugin();
    expect(plugin.triggerFinale(5, 14000, true))
      .toMatchObject({ accepted: true, intensity: 5, length: 'short', durationMs: 10000 });
    expect(plugin.triggerFinale(5, 23001, true))
      .toMatchObject({ accepted: true, intensity: 5, length: 'long', durationMs: 28000 });
  });

  test('does not consume auto rotation while disabled unless bypassed', () => {
    const { api, plugin } = createPlugin({ enabled: false });
    plugin.finaleShuffleBag = { draw: jest.fn(() => 'classic-crescendo') };
    expect(plugin.triggerFinale({ style: 'auto', seed: 1, id: 'blocked' }))
      .toEqual({ accepted: false, reason: 'disabled' });
    expect(api.emit).not.toHaveBeenCalled();
    expect(plugin.finaleShuffleBag.draw).not.toHaveBeenCalled();
    expect(plugin.triggerFinale({ style: 'auto', seed: 2, id: 'allowed', bypassEnabled: true }).style)
      .toBe('classic-crescendo');
    expect(plugin.finaleShuffleBag.draw).toHaveBeenCalledTimes(1);
  });

  test('API normalizes object and legacy duration requests and returns resolved queue metadata', () => {
    const { api, plugin } = createPlugin();
    plugin.registerRoutes();
    const handler = api.routes.get('post:/api/webgpu-fireworks/finale');
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    handler({ body: { style: 'symmetric-salute', duration: 14000, seed: 44, eventId: 'api-44' } }, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      accepted: true,
      id: 'api-44',
      eventId: 'api-44',
      style: 'symmetric-salute',
      length: 'short',
      durationMs: 10000,
      seed: 44
    }));
    expect(api.emit).toHaveBeenCalledWith('webgpu-fireworks:finale', expect.objectContaining({
      id: 'api-44', bypassEnabled: true
    }));
  });

  test('generic goal events use configured global show values through the object contract', () => {
    const { api, plugin } = createPlugin({
      goalFinaleStyle: 'classic-crescendo',
      goalFinaleLength: 'long',
      goalFinaleIntensity: 7
    });
    plugin.triggerFinale = jest.fn();
    plugin.registerTikTokEventHandlers();

    api.events.get('goal_reached')({ eventId: 'goal-event' });

    expect(plugin.triggerFinale).toHaveBeenCalledWith({
      style: 'classic-crescendo',
      length: 'long',
      intensity: 7,
      eventId: 'goal-event'
    });
  });
});
