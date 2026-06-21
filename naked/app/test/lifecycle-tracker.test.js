/**
 * Test suite for LifecycleTracker and plugin lifecycle cleanup
 *
 * Covers:
 *  - LifecycleTracker: trackTimeout, trackInterval, trackListener, cleanupAll
 *  - ExpressionController: startCleanup double-registration guard, destroy
 *  - MemoryCleanupScheduler: initial timeout tracked, destroy idempotent
 *  - GoalsPlugin: destroy() wired up, _lifecycle tracker present
 */

const EventEmitter = require('events');
const LifecycleTracker = require('../modules/lifecycle-tracker');

// ---------------------------------------------------------------------------
// LifecycleTracker
// ---------------------------------------------------------------------------

describe('LifecycleTracker', () => {
  test('instantiates without error', () => {
    const tracker = new LifecycleTracker();
    expect(tracker).toBeDefined();
  });

  // --- timeouts ---

  test('trackTimeout returns the handle', () => {
    const tracker = new LifecycleTracker();
    const handle = tracker.trackTimeout(setTimeout(() => {}, 60000));
    expect(handle).toBeDefined();
    tracker.cleanupAll();
  });

  test('cleanupAll cancels tracked timeouts so the callback does not fire', (done) => {
    let fired = false;
    const tracker = new LifecycleTracker();
    tracker.trackTimeout(setTimeout(() => { fired = true; }, 50));
    tracker.cleanupAll();
    setTimeout(() => {
      expect(fired).toBe(false);
      done();
    }, 150);
  });

  test('clearTimeout cancels a specific tracked timeout', (done) => {
    let fired = false;
    const tracker = new LifecycleTracker();
    const handle = tracker.trackTimeout(setTimeout(() => { fired = true; }, 50));
    tracker.clearTimeout(handle);
    setTimeout(() => {
      expect(fired).toBe(false);
      done();
    }, 150);
  });

  // --- intervals ---

  test('trackInterval returns the handle', () => {
    const tracker = new LifecycleTracker();
    const handle = tracker.trackInterval(setInterval(() => {}, 60000));
    expect(handle).toBeDefined();
    tracker.cleanupAll();
  });

  test('clearInterval cancels a specific tracked interval', () => {
    const tracker = new LifecycleTracker();
    const handle = tracker.trackInterval(setInterval(() => {}, 60000));
    tracker.clearInterval(handle);
    tracker.cleanupAll(); // must not throw
  });

  // --- listeners ---

  test('trackListener returns the fn', () => {
    const tracker = new LifecycleTracker();
    const emitter = new EventEmitter();
    const fn = () => {};
    const returned = tracker.trackListener(emitter, 'test', fn);
    expect(returned).toBe(fn);
    tracker.cleanupAll();
  });

  test('cleanupAll removes all tracked event listeners', () => {
    const tracker = new LifecycleTracker();
    const emitter = new EventEmitter();
    let callCount = 0;
    const fn = () => { callCount++; };
    emitter.on('data', tracker.trackListener(emitter, 'data', fn));

    expect(emitter.listenerCount('data')).toBe(1);
    tracker.cleanupAll();
    expect(emitter.listenerCount('data')).toBe(0);

    emitter.emit('data');
    expect(callCount).toBe(0);
  });

  test('cleanupAll removes multiple listeners on the same event', () => {
    const tracker = new LifecycleTracker();
    const emitter = new EventEmitter();
    const fn1 = () => {};
    const fn2 = () => {};
    emitter.on('ping', tracker.trackListener(emitter, 'ping', fn1));
    emitter.on('ping', tracker.trackListener(emitter, 'ping', fn2));
    expect(emitter.listenerCount('ping')).toBe(2);
    tracker.cleanupAll();
    expect(emitter.listenerCount('ping')).toBe(0);
  });

  // --- idempotency ---

  test('cleanupAll is idempotent (safe to call multiple times)', () => {
    const tracker = new LifecycleTracker();
    const emitter = new EventEmitter();
    emitter.on('x', tracker.trackListener(emitter, 'x', () => {}));
    tracker.trackTimeout(setTimeout(() => {}, 60000));
    tracker.trackInterval(setInterval(() => {}, 60000));

    expect(() => {
      tracker.cleanupAll();
      tracker.cleanupAll();
      tracker.cleanupAll();
    }).not.toThrow();
  });

  test('cleanupAll handles emitter with already-removed listener gracefully', () => {
    const tracker = new LifecycleTracker();
    const emitter = new EventEmitter();
    const fn = () => {};
    emitter.on('ev', tracker.trackListener(emitter, 'ev', fn));
    emitter.removeListener('ev', fn); // removed before cleanupAll
    expect(() => tracker.cleanupAll()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ExpressionController — startCleanup double-registration guard
// ---------------------------------------------------------------------------

describe('ExpressionController lifecycle', () => {
  let ctrl;

  beforeEach(() => {
    const api = {
      logger: { warn: jest.fn(), debug: jest.fn(), info: jest.fn(), error: jest.fn() },
      emit: jest.fn()
    };
    const oscBridge = { send: jest.fn() };
    const ExpressionController = require('../plugins/osc-bridge/modules/ExpressionController');
    ctrl = new ExpressionController(api, oscBridge);
  });

  afterEach(() => {
    if (ctrl) ctrl.destroy();
  });

  test('startCleanup does not create duplicate intervals on repeated calls', () => {
    ctrl.startCleanup(60000);
    const firstHandle = ctrl.cleanupInterval;
    expect(firstHandle).toBeTruthy();

    ctrl.startCleanup(60000); // second call — must be no-op
    expect(ctrl.cleanupInterval).toBe(firstHandle);
  });

  test('destroy sets cleanupInterval to null', () => {
    ctrl.startCleanup(60000);
    expect(ctrl.cleanupInterval).toBeTruthy();
    ctrl.destroy();
    expect(ctrl.cleanupInterval).toBeNull();
  });

  test('destroy is safe to call without calling startCleanup first', () => {
    expect(() => ctrl.destroy()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// MemoryCleanupScheduler — initial timeout tracked and cleared on destroy
// ---------------------------------------------------------------------------

describe('MemoryCleanupScheduler lifecycle', () => {
  function makeDb() {
    return {
      prepare: () => ({
        all: () => [],
        run: () => ({ changes: 0 }),
        get: () => ({ count: 0 })
      })
    };
  }

  function makeLogger() {
    return { info: jest.fn(), error: jest.fn() };
  }

  test('_initialCleanupTimeout is set after construction', () => {
    const MemoryCleanupScheduler = require('../plugins/coinbattle/engine/memory-cleanup');
    const scheduler = new MemoryCleanupScheduler(makeDb(), makeLogger());
    expect(scheduler._initialCleanupTimeout).toBeTruthy();
    scheduler.destroy();
  });

  test('destroy clears both cleanupInterval and _initialCleanupTimeout', () => {
    const MemoryCleanupScheduler = require('../plugins/coinbattle/engine/memory-cleanup');
    const scheduler = new MemoryCleanupScheduler(makeDb(), makeLogger());
    scheduler.destroy();
    expect(scheduler.cleanupInterval).toBeNull();
    expect(scheduler._initialCleanupTimeout).toBeNull();
  });

  test('destroy is idempotent', () => {
    const MemoryCleanupScheduler = require('../plugins/coinbattle/engine/memory-cleanup');
    const scheduler = new MemoryCleanupScheduler(makeDb(), makeLogger());
    scheduler.destroy();
    expect(() => scheduler.destroy()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// GoalsPlugin — destroy() exists and lifecycle tracker is present
// ---------------------------------------------------------------------------

describe('GoalsPlugin lifecycle', () => {
  function makeMockApi() {
    return {
      log: jest.fn(),
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      getDatabase: () => null,
      getSocketIO: () => ({ on: jest.fn(), emit: jest.fn() }),
      registerRoute: jest.fn(),
      registerSocket: jest.fn(),
      registerTikTokEvent: jest.fn(),
      registerFlowAction: jest.fn(),
      registerIFTTTAction: jest.fn(),
      iftttEngine: null
    };
  }

  test('destroy() method is defined', () => {
    const GoalsPlugin = require('../plugins/goals/main');
    const plugin = new GoalsPlugin(makeMockApi());
    expect(typeof plugin.destroy).toBe('function');
  });

  test('_lifecycle is a LifecycleTracker instance', () => {
    const GoalsPlugin = require('../plugins/goals/main');
    const plugin = new GoalsPlugin(makeMockApi());
    expect(plugin._lifecycle).toBeInstanceOf(LifecycleTracker);
  });

  test('destroy() does not throw when called without init', async () => {
    const GoalsPlugin = require('../plugins/goals/main');
    const plugin = new GoalsPlugin(makeMockApi());
    // destroy without init: cleanup() iterates stateMachineManager.getAllMachines()
    // which should return empty array on a fresh instance
    await expect(plugin.destroy()).resolves.not.toThrow();
  });
});
