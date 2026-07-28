'use strict';

const {
  createServerRestartCoordinator
} = require('../modules/server-restart-coordinator');

function createTimers(events) {
  let nextId = 1;
  const tasks = new Map();
  return {
    tasks,
    setTimeout(callback, delay) {
      const id = nextId++;
      const handle = {
        id,
        unref: jest.fn(() => events.push(`unref:${delay}`))
      };
      tasks.set(id, { callback, delay, handle });
      events.push(`timer:${delay}`);
      return handle;
    },
    clearTimeout(handle) {
      tasks.delete(handle.id);
      events.push(`clear:${handle.id}`);
    },
    run(delay) {
      const entry = [...tasks.entries()].find(
        ([, task]) => task.delay === delay
      );
      if (!entry) {
        throw new Error(`No timer with delay ${delay}`);
      }
      const [id, task] = entry;
      tasks.delete(id);
      return task.callback();
    }
  };
}

function createHarness({ shutdown } = {}) {
  const events = [];
  const timers = createTimers(events);
  const coordinator = createServerRestartCoordinator({
    stableLifecycle: {
      shutdown: shutdown || jest.fn(async () => {
        events.push('stable:shutdown');
      })
    },
    io: {
      emit: jest.fn((_event, { reason }) => {
        events.push(`io:emit:${reason}`);
      }),
      disconnectSockets: jest.fn(() => {
        events.push('io:disconnect');
      })
    },
    db: {
      flushEventBatch: jest.fn(() => events.push('db:flush')),
      close: jest.fn(() => events.push('db:close'))
    },
    server: {
      close: jest.fn(callback => {
        events.push('server:close');
        callback();
      })
    },
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    },
    processExit: jest.fn(code => events.push(`exit:${code}`)),
    timers,
    delayMs: 250,
    stableShutdownTimeoutMs: 2000,
    forceExitTimeoutMs: 3000
  });
  return { coordinator, events, timers };
}

describe('server restart coordinator', () => {
  test.each([
    'manual restart API',
    'profile switch to CreatorTwo'
  ])('awaits stable shutdown before teardown for %s', async reason => {
    const { coordinator, events, timers } = createHarness();

    expect(coordinator.schedule(reason)).toBe(true);
    expect(coordinator.schedule('duplicate')).toBe(false);
    await timers.run(250);

    expect(events.indexOf('timer:3000')).toBeLessThan(
      events.indexOf('stable:shutdown')
    );
    expect(events.indexOf('stable:shutdown')).toBeLessThan(
      events.indexOf('io:disconnect')
    );
    expect(events.indexOf('io:disconnect')).toBeLessThan(
      events.indexOf('db:close')
    );
    expect(events.indexOf('db:close')).toBeLessThan(
      events.indexOf('server:close')
    );
    expect(events).toContain(`io:emit:${reason}`);
    expect(events.at(-1)).toBe('exit:75');
    expect(coordinator.isScheduled()).toBe(true);
  });

  test('continues bounded teardown when stable shutdown never settles', async () => {
    const shutdown = jest.fn(() => new Promise(() => {}));
    const { coordinator, events, timers } = createHarness({ shutdown });

    coordinator.schedule('bounded restart');
    const restart = timers.run(250);
    await Promise.resolve();
    await timers.run(2000);
    await restart;

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(events.indexOf('timer:2000')).toBeLessThan(
      events.indexOf('io:disconnect')
    );
    expect(events).toContain('server:close');
    expect(events).toContain('exit:75');
  });
});
