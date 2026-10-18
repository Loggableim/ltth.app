'use strict';

const {
  PluginScheduler,
  createPluginScheduler,
  createPluginLoaderController,
  normalizeShowplan,
  parseTimeOfDay,
  DEFAULT_TOLERANCE_MS
} = require('../modules/plugin-scheduler');

const START_OF_DAY = 1000; // arbitrary non-zero local day start for tests

function createClock(start = 0) {
  const state = { now: start };
  return {
    now: () => state.now,
    set: (value) => { state.now = value; },
    advance: (ms) => { state.now += ms; }
  };
}

function createController(options = {}) {
  const known = new Set(options.known || []);
  const enabled = new Set(options.enabled || []);
  const calls = [];
  const failFor = new Set(options.failFor || []);
  const controller = {
    isKnown: jest.fn((pluginId) => known.has(pluginId)),
    isEnabled: jest.fn((pluginId) => enabled.has(pluginId)),
    enable: jest.fn(async (pluginId) => {
      calls.push(`enable:${pluginId}`);
      if (failFor.has(pluginId)) throw new Error(`boom ${pluginId}`);
      enabled.add(pluginId);
    }),
    disable: jest.fn(async (pluginId) => {
      calls.push(`disable:${pluginId}`);
      if (failFor.has(pluginId)) throw new Error(`boom ${pluginId}`);
      enabled.delete(pluginId);
    })
  };
  return { controller, known, enabled, calls };
}

function createLogger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

describe('plugin-scheduler normalizeShowplan', () => {
  test('resolves HH:MM / HH:MM:SS against startOfDay and sorts ascending', () => {
    const plan = normalizeShowplan([
      { time: '20:30', pluginId: 'quiz-show' },
      { time: '08:05:30', pluginId: 'soundboard', action: 'enable' },
      { at: START_OF_DAY + 3 * 60 * 60 * 1000, pluginId: 'music-bot', action: 'disable' }
    ], { startOfDay: START_OF_DAY });

    expect(plan.map((entry) => entry.pluginId)).toEqual(['music-bot', 'soundboard', 'quiz-show']);
    expect(plan[1]).toEqual({
      at: START_OF_DAY + ((8 * 60 + 5) * 60 + 30) * 1000,
      pluginId: 'soundboard',
      action: 'enable'
    });
    expect(plan[0].at).toBe(START_OF_DAY + 3 * 60 * 60 * 1000);
    expect(plan[2].at).toBe(START_OF_DAY + (20 * 60 + 30) * 60 * 1000);
    expect(Object.isFrozen(plan)).toBe(true);
  });

  test('defaults action to enable', () => {
    const plan = normalizeShowplan([{ at: 10, pluginId: 'a' }]);
    expect(plan[0].action).toBe('enable');
  });

  test('rejects two switches at the same time', () => {
    expect(() => normalizeShowplan([
      { at: 100, pluginId: 'a' },
      { at: 100, pluginId: 'b' }
    ])).toThrow(/double switch/);
  });

  test('rejects invalid entries', () => {
    expect(() => normalizeShowplan([])).toThrow(/not be empty/);
    expect(() => normalizeShowplan('nope')).toThrow(/must be an array/);
    expect(() => normalizeShowplan([{ at: 1 }])).toThrow(/pluginId/);
    expect(() => normalizeShowplan([{ at: 1, pluginId: 'a', action: 'toggle' }])).toThrow(/invalid action/);
    expect(() => normalizeShowplan([{ at: 1, time: '10:00', pluginId: 'a' }])).toThrow(/both/);
    expect(() => normalizeShowplan([{ pluginId: 'a' }])).toThrow(/needs 'at' or 'time'/);
    expect(() => normalizeShowplan([{ time: '10:00', pluginId: 'a' }])).toThrow(/startOfDay/);
    expect(() => normalizeShowplan([{ time: '25:00', pluginId: 'a' }], { startOfDay: 0 })).toThrow(/HH:MM/);
  });

  test('parseTimeOfDay accepts valid and rejects invalid times', () => {
    expect(parseTimeOfDay('09:15')).toEqual({ hours: 9, minutes: 15, seconds: 0 });
    expect(parseTimeOfDay('23:59:59')).toEqual({ hours: 23, minutes: 59, seconds: 59 });
    expect(parseTimeOfDay('24:00')).toBeNull();
    expect(parseTimeOfDay('9:5')).toBeNull();
    expect(parseTimeOfDay('')).toBeNull();
    expect(parseTimeOfDay(915)).toBeNull();
  });
});

describe('PluginScheduler schedule + switch', () => {
  test('enables a plugin only when its switch time is due', async () => {
    const clock = createClock(0);
    const { controller, enabled, calls } = createController({ known: ['soundboard'] });
    const scheduler = createPluginScheduler({
      plan: [{ at: 1000, pluginId: 'soundboard' }],
      controller,
      clock: clock.now,
      toleranceMs: 0,
      name: 'test'
    });

    await scheduler.tick();
    expect(calls).toEqual([]);
    expect(enabled.has('soundboard')).toBe(false);

    clock.set(1000);
    const status = await scheduler.tick();
    expect(calls).toEqual(['enable:soundboard']);
    expect(enabled.has('soundboard')).toBe(true);
    expect(status.applied).toBe(1);
    expect(status.activePluginId).toBe('soundboard');
    expect(status.pending).toBe(0);
  });

  test('does not switch twice on repeated ticks', async () => {
    const clock = createClock(500);
    const { controller, calls } = createController({ known: ['a'] });
    const scheduler = createPluginScheduler({
      plan: [{ at: 100, pluginId: 'a' }],
      controller,
      clock: clock.now,
      toleranceMs: 10000
    });

    await scheduler.tick();
    await scheduler.tick();
    await scheduler.tick();
    expect(calls).toEqual(['enable:a']);
    expect(controller.enable).toHaveBeenCalledTimes(1);
  });

  test('runs enable and disable in plan order and tracks the active plugin', async () => {
    const clock = createClock(0);
    const { controller, calls, enabled } = createController({ known: ['a', 'b'], enabled: ['a'] });
    const scheduler = createPluginScheduler({
      plan: [
        { at: 10, pluginId: 'a', action: 'disable' },
        { at: 20, pluginId: 'b', action: 'enable' }
      ],
      controller,
      clock: clock.now,
      toleranceMs: 1000
    });

    clock.set(20);
    await scheduler.tick();
    expect(calls).toEqual(['disable:a', 'enable:b']);
    expect(enabled.has('a')).toBe(false);
    expect(enabled.has('b')).toBe(true);
    expect(scheduler.getStatus().activePluginId).toBe('b');
  });

  test('catches up multiple missed switches in order without overlap', async () => {
    const clock = createClock(0);
    const { controller, calls } = createController({ known: ['a', 'b', 'c'] });
    const scheduler = createPluginScheduler({
      plan: [
        { at: 10, pluginId: 'a' },
        { at: 20, pluginId: 'b' },
        { at: 30, pluginId: 'c' }
      ],
      controller,
      clock: clock.now,
      toleranceMs: 1000
    });

    clock.set(25);
    await scheduler.tick();
    expect(calls).toEqual(['enable:a', 'enable:b']);
    expect(scheduler.getStatus().pending).toBe(1);

    clock.set(30);
    await scheduler.tick();
    expect(calls).toEqual(['enable:a', 'enable:b', 'enable:c']);
  });

  test('skips a switch that is later than the tolerance', async () => {
    const clock = createClock(0);
    const logger = createLogger();
    const { controller, calls } = createController({ known: ['a'] });
    const scheduler = createPluginScheduler({
      plan: [{ at: 100, pluginId: 'a' }],
      controller,
      clock: clock.now,
      toleranceMs: 50,
      logger
    });

    clock.set(200);
    const status = await scheduler.tick();
    expect(calls).toEqual([]);
    expect(status.skipped).toBe(1);
    expect(status.entries[0].reason).toBe('late');
    expect(logger.warn).toHaveBeenCalled();
  });

  test('logs and skips an unknown plugin but continues with later switches', async () => {
    const clock = createClock(0);
    const logger = createLogger();
    const { controller, calls } = createController({ known: ['b'] });
    const scheduler = createPluginScheduler({
      plan: [
        { at: 10, pluginId: 'ghost' },
        { at: 20, pluginId: 'b' }
      ],
      controller,
      clock: clock.now,
      toleranceMs: 1000,
      logger
    });

    clock.set(20);
    const status = await scheduler.tick();
    expect(calls).toEqual(['enable:b']);
    expect(status.skipped).toBe(1);
    expect(status.applied).toBe(1);
    expect(status.entries[0].reason).toBe('unknown-plugin');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('unknown-plugin'));
  });

  test('skips when the plugin is already in the requested state', async () => {
    const clock = createClock(0);
    const { controller, calls } = createController({ known: ['a'], enabled: ['a'] });
    const scheduler = createPluginScheduler({
      plan: [{ at: 1, pluginId: 'a' }],
      controller,
      clock: clock.now,
      toleranceMs: 0
    });

    clock.set(1);
    const status = await scheduler.tick();
    expect(calls).toEqual([]);
    expect(status.entries[0].reason).toBe('already-enabled');
  });

  test('start() skips past switches and keeps future ones pending', async () => {
    const clock = createClock(500);
    const logger = createLogger();
    const { controller } = createController({ known: ['a', 'b'] });
    const scheduler = createPluginScheduler({
      plan: [
        { at: 100, pluginId: 'a' },
        { at: 900, pluginId: 'b' }
      ],
      controller,
      clock: clock.now,
      toleranceMs: 10000,
      logger
    });

    const status = scheduler.start();
    expect(status.entries[0].reason).toBe('before-start');
    expect(status.pending).toBe(1);

    clock.set(900);
    await scheduler.tick();
    expect(scheduler.getStatus().entries[1].state).toBe('applied');
  });

  test('records a failed switch and keeps going', async () => {
    const clock = createClock(0);
    const logger = createLogger();
    const { controller, calls } = createController({ known: ['a', 'b'], failFor: ['a'] });
    const scheduler = createPluginScheduler({
      plan: [
        { at: 10, pluginId: 'a' },
        { at: 20, pluginId: 'b' }
      ],
      controller,
      clock: clock.now,
      toleranceMs: 1000,
      logger
    });

    const errors = [];
    scheduler.on('error', (payload) => errors.push(payload));

    clock.set(20);
    const status = await scheduler.tick();
    expect(calls).toEqual(['enable:a', 'enable:b']);
    expect(status.failed).toBe(1);
    expect(status.applied).toBe(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].entry.pluginId).toBe('a');
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('boom a'));
  });

  test('emits a switch event for every applied entry', async () => {
    const clock = createClock(0);
    const { controller } = createController({ known: ['a'] });
    const scheduler = createPluginScheduler({
      plan: [{ at: 5, pluginId: 'a' }],
      controller,
      clock: clock.now,
      toleranceMs: 0
    });

    const switches = [];
    scheduler.on('switch', (payload) => switches.push(payload.entry));
    clock.set(5);
    await scheduler.tick();
    expect(switches).toHaveLength(1);
    expect(switches[0]).toMatchObject({ pluginId: 'a', action: 'enable', state: 'applied' });
  });

  test('single-flight: a concurrent tick does not run switches twice', async () => {
    const clock = createClock(0);
    const { controller } = createController({ known: ['a'] });
    const scheduler = createPluginScheduler({
      plan: [{ at: 5, pluginId: 'a' }],
      controller,
      clock: clock.now,
      toleranceMs: 0
    });

    clock.set(5);
    await Promise.all([scheduler.tick(), scheduler.tick(), scheduler.tick()]);
    expect(controller.enable).toHaveBeenCalledTimes(1);
  });

  test('validates constructor options', () => {
    expect(() => new PluginScheduler({ plan: [{ at: 1, pluginId: 'a' }] })).toThrow(/controller/);
    expect(() => new PluginScheduler({
      plan: [{ at: 1, pluginId: 'a' }],
      controller: { isKnown: () => true, enable: () => {}, disable: () => {}, isEnabled: () => false },
      clock: 'now'
    })).toThrow(/clock/);
    expect(() => new PluginScheduler({
      plan: [{ at: 1, pluginId: 'a' }],
      controller: { isKnown: () => true, enable: () => {}, disable: () => {} },
      toleranceMs: -1
    })).toThrow(/toleranceMs/);
  });

  test('uses the default tolerance of one minute', () => {
    const { controller } = createController({ known: ['a'] });
    const scheduler = new PluginScheduler({ plan: [{ at: 1, pluginId: 'a' }], controller });
    expect(scheduler.toleranceMs).toBe(DEFAULT_TOLERANCE_MS);
  });
});

describe('createPluginLoaderController', () => {
  test('adapts a PluginLoader to the controller contract', async () => {
    const loader = {
      resolvePluginInstallation: jest.fn((pluginId) => (pluginId === 'a' ? { path: '/a' } : null)),
      isPluginEnabledFromDisk: jest.fn((pluginId) => pluginId === 'a'),
      enablePlugin: jest.fn(async () => true),
      disablePlugin: jest.fn(async () => true)
    };
    const controller = createPluginLoaderController(loader);

    expect(controller.isKnown('a')).toBe(true);
    expect(controller.isKnown('b')).toBe(false);
    expect(controller.isEnabled('a')).toBe(true);

    await controller.enable('a');
    await controller.disable('a');
    expect(loader.enablePlugin).toHaveBeenCalledWith('a');
    expect(loader.disablePlugin).toHaveBeenCalledWith('a');
  });

  test('rejects a loader without enable/disable', () => {
    expect(() => createPluginLoaderController({})).toThrow(/PluginLoader/);
  });

  test('isKnown and isEnabled survive resolver errors', () => {
    const loader = {
      resolvePluginInstallation: jest.fn(() => { throw new Error('nope'); }),
      isPluginEnabledFromDisk: jest.fn(() => { throw new Error('nope'); }),
      enablePlugin: jest.fn(),
      disablePlugin: jest.fn()
    };
    const controller = createPluginLoaderController(loader);
    expect(controller.isKnown('a')).toBe(false);
    expect(controller.isEnabled('a')).toBe(false);
  });

  test('drives the scheduler end to end', async () => {
    const clock = createClock(0);
    const loader = {
      resolvePluginInstallation: jest.fn((pluginId) => (pluginId === 'soundboard' ? { path: '/p' } : null)),
      isPluginEnabledFromDisk: jest.fn(() => false),
      enablePlugin: jest.fn(async () => true),
      disablePlugin: jest.fn(async () => true)
    };
    const scheduler = createPluginScheduler({
      plan: [{ at: 3, pluginId: 'soundboard', action: 'enable' }],
      controller: createPluginLoaderController(loader),
      clock: clock.now,
      toleranceMs: 0
    });

    clock.set(3);
    const status = await scheduler.tick();
    expect(status.applied).toBe(1);
    expect(loader.enablePlugin).toHaveBeenCalledWith('soundboard');
  });
});
