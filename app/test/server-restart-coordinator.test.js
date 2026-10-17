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

function createHarness({
  shutdown,
  serverCloseError,
  pluginIds = [],
  pluginShutdownTimeoutMs = 1500,
  databaseFlushTimeoutMs = 2000,
  flushEventBatch,
  closeDatabase
} = {}) {
  const events = [];
  const timers = createTimers(events);
  const pluginLoader = {
    plugins: new Map(pluginIds.map(pluginId => [pluginId, {}])),
    unloadPlugin: jest.fn(async () => true)
  };
  const onRestartAborted = jest.fn(() => events.push('restart:aborted'));
  const coordinator = createServerRestartCoordinator({
    stableLifecycle: {
      shutdown: shutdown || jest.fn(async () => {
        events.push('stable:shutdown');
      })
    },
    pluginLoader,
    io: {
      emit: jest.fn((_event, { reason }) => {
        events.push(`io:emit:${reason}`);
      }),
      disconnectSockets: jest.fn(() => {
        events.push('io:disconnect');
      })
    },
    db: {
      flushEventBatch: jest.fn(() => {
        events.push('db:flush');
        return flushEventBatch?.();
      }),
      close: jest.fn(() => {
        events.push('db:close');
        return closeDatabase?.();
      })
    },
    server: {
      close: jest.fn(callback => {
        events.push('server:close');
        callback(serverCloseError);
      })
    },
    onRestartAborted,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    },
    processExit: jest.fn(code => events.push(`exit:${code}`)),
    timers,
    delayMs: 250,
    stableShutdownTimeoutMs: 2000,
    pluginShutdownTimeoutMs,
    databaseFlushTimeoutMs,
    forceExitTimeoutMs: 3000
  });
  return { coordinator, events, timers, pluginLoader, onRestartAborted };
}

describe('server restart coordinator', () => {
  test('requires the force-exit deadline to outlast the bounded database flush', () => {
    expect(() => createHarness({ databaseFlushTimeoutMs: 3000 })).toThrow(
      'forceExitTimeoutMs must exceed databaseFlushTimeoutMs'
    );
  });

  test.each([
    'manual restart API',
    'profile switch to CreatorTwo'
  ])('awaits stable shutdown before teardown for %s', async reason => {
    const { coordinator, events, timers } = createHarness();

    expect(coordinator.schedule(reason)).toBe(true);
    expect(coordinator.schedule('duplicate')).toBe(false);
    await timers.run(250);

    expect(events.indexOf('stable:shutdown')).toBeLessThan(
      events.indexOf('timer:3000')
    );
    expect(events.indexOf('timer:3000')).toBeLessThan(
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

  test('unloads plugins with application shutdown context before database and HTTP teardown', async () => {
    const { coordinator, events, timers, pluginLoader } = createHarness({
      pluginIds: ['provider-plugin', 'music-bot']
    });
    pluginLoader.unloadPlugin.mockImplementation(async (pluginId, context) => {
      events.push(`plugin:unload:${pluginId}:${context.reason}`);
      if (pluginId === 'music-bot') {
        events.push('music-bot:mpv-shutdown');
        events.push('music-bot:queue-persist');
      }
      return true;
    });

    coordinator.schedule('profile restart');
    await timers.run(250);

    expect(pluginLoader.unloadPlugin).toHaveBeenNthCalledWith(
      1, 'music-bot', { reason: 'application-shutdown' }
    );
    expect(pluginLoader.unloadPlugin).toHaveBeenNthCalledWith(
      2, 'provider-plugin', { reason: 'application-shutdown' }
    );
    expect(events.indexOf('db:flush')).toBeLessThan(
      events.indexOf(`io:emit:profile restart`)
    );
    expect(events.indexOf(`io:emit:profile restart`)).toBeLessThan(
      events.indexOf('io:disconnect')
    );
    expect(events.indexOf('io:disconnect')).toBeLessThan(
      events.indexOf('db:close')
    );
    expect(events.indexOf('stable:shutdown')).toBeLessThan(
      events.indexOf('music-bot:mpv-shutdown')
    );
    expect(events.indexOf('music-bot:mpv-shutdown')).toBeLessThan(
      events.indexOf('music-bot:queue-persist')
    );
    expect(events.indexOf('music-bot:queue-persist')).toBeLessThan(
      events.indexOf('db:close')
    );
    expect(events.indexOf('db:close')).toBeLessThan(
      events.indexOf('server:close')
    );
    expect(events.at(-1)).toBe('exit:75');
  });

  test.each([
    ['returns a cleanup failure', async () => false],
    ['throws during cleanup', async () => { throw new Error('plugin shutdown failed'); }]
  ])('does not close the database or server when plugin cleanup %s', async (_label, unload) => {
    const { coordinator, events, timers, pluginLoader, onRestartAborted } = createHarness({
      pluginIds: ['music-bot']
    });
    pluginLoader.unloadPlugin.mockImplementation(unload);

    coordinator.schedule('failed plugin cleanup');
    await timers.run(250);

    expect(pluginLoader.unloadPlugin).toHaveBeenCalledWith(
      'music-bot', { reason: 'application-shutdown' }
    );
    expect(events).not.toContain('db:close');
    expect(events).not.toContain('server:close');
    expect(events).not.toContain('exit:75');
    expect(events).not.toContain('timer:3000');
    expect(events).toContain('restart:aborted');
    expect(onRestartAborted).toHaveBeenCalledWith({
      reason: 'failed plugin cleanup',
      message: 'Server restart aborted because plugin cleanup failed; HTTP server remains open.',
      stage: 'plugin cleanup',
      error: { name: 'Error', code: null }
    });
    expect(coordinator.isScheduled()).toBe(false);
    expect(coordinator.schedule('retry blocked cleanup')).toBe(true);
    expect(pluginLoader.unloadPlugin).toHaveBeenCalledTimes(1);
  });

  test('an explicit retry reruns plugin cleanup before restart teardown', async () => {
    const { coordinator, events, timers, pluginLoader } = createHarness({
      pluginIds: ['music-bot']
    });
    pluginLoader.unloadPlugin
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    coordinator.schedule('first cleanup attempt');
    await timers.run(250);
    expect(events).not.toContain('db:close');
    expect(coordinator.isScheduled()).toBe(false);

    expect(coordinator.schedule('explicit cleanup retry')).toBe(true);
    await timers.run(250);

    expect(pluginLoader.unloadPlugin).toHaveBeenNthCalledWith(
      2, 'music-bot', { reason: 'application-shutdown' }
    );
    expect(events.indexOf('db:close')).toBeGreaterThan(-1);
    expect(events.indexOf('db:close')).toBeLessThan(events.indexOf('server:close'));
    expect(events.at(-1)).toBe('exit:75');
  });

  test('does not close the database or server when plugin cleanup times out', async () => {
    const { coordinator, events, timers, pluginLoader, onRestartAborted } = createHarness({
      pluginIds: ['provider-plugin', 'music-bot'],
      pluginShutdownTimeoutMs: 1500
    });
    let finishUnload;
    pluginLoader.unloadPlugin
      .mockReturnValueOnce(new Promise(resolve => {
      finishUnload = resolve;
      }))
      .mockResolvedValueOnce(true);

    coordinator.schedule('plugin cleanup timeout');
    const restart = timers.run(250);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if ([...timers.tasks.values()].some(task => task.delay === 1500)) break;
      await Promise.resolve();
    }
    await timers.run(1500);
    await restart;

    expect(pluginLoader.unloadPlugin).toHaveBeenCalledWith(
      'music-bot', { reason: 'application-shutdown' }
    );
    expect(events).not.toContain('db:close');
    expect(events).not.toContain('server:close');
    expect(events).not.toContain('exit:75');
    expect(events).not.toContain('timer:3000');
    expect(events).toContain('restart:aborted');
    expect(onRestartAborted).toHaveBeenCalledWith({
      reason: 'plugin cleanup timeout',
      message: 'Server restart aborted because plugin cleanup failed; HTTP server remains open.',
      stage: 'plugin cleanup',
      error: { name: 'Error', code: null }
    });
    expect(coordinator.isScheduled()).toBe(false);
    expect(pluginLoader.plugins.has('music-bot')).toBe(true);

    finishUnload(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(pluginLoader.unloadPlugin).toHaveBeenCalledTimes(1);
    expect(events).not.toContain('db:close');

    expect(coordinator.schedule('explicit retry after timed-out owner settled')).toBe(true);
    await timers.run(250);

    expect(pluginLoader.unloadPlugin).toHaveBeenCalledTimes(3);
    expect(pluginLoader.unloadPlugin).toHaveBeenNthCalledWith(
      2, 'music-bot', { reason: 'application-shutdown' }
    );
    expect(events.indexOf('db:close')).toBeGreaterThan(-1);
    expect(events.indexOf('db:close')).toBeLessThan(events.indexOf('server:close'));
    expect(events.at(-1)).toBe('exit:75');
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

  test.each([
    ['rejects asynchronously', () => Promise.reject(Object.assign(
      new Error('private database path C:\\secrets\\db.sqlite'),
      { code: 'SQLITE_FLUSH_FAILED' }
    ))],
    ['throws synchronously', () => {
      throw Object.assign(new Error('private database path C:\\secrets\\db.sqlite'), {
        code: 'SQLITE_FLUSH_FAILED'
      });
    }]
  ])('aborts before disconnecting sockets when event flush %s', async (_label, flushEventBatch) => {
    const { coordinator, events, timers, onRestartAborted } = createHarness({ flushEventBatch });
    coordinator.schedule('flush failure');
    await timers.run(250);

    expect(events).toContain('db:flush');
    expect(events).not.toContain('io:emit:flush failure');
    expect(events).not.toContain('io:disconnect');
    expect(events).not.toContain('db:close');
    expect(events).not.toContain('server:close');
    expect(events).not.toContain('exit:75');
    expect(timers.tasks.size).toBe(0);
    expect(onRestartAborted).toHaveBeenCalledWith({
      reason: 'flush failure',
      message: 'Server restart aborted because database-event-flush failed; HTTP server remains open.',
      stage: 'database-event-flush',
      error: { name: 'Error', code: 'SQLITE_FLUSH_FAILED' }
    });
    expect(JSON.stringify(onRestartAborted.mock.calls[0][0])).not.toContain('C:\\secrets');
  });

  test('aborts on event flush timeout and clears the force-exit timer', async () => {
    const { coordinator, events, timers, onRestartAborted } = createHarness({
      flushEventBatch: () => new Promise(() => {}),
      databaseFlushTimeoutMs: 2000
    });
    coordinator.schedule('flush timeout');
    const restart = timers.run(250);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (events.includes('db:flush')) break;
      await Promise.resolve();
    }
    for (let attempt = 0; attempt < 20; attempt += 1) await Promise.resolve();
    expect([...timers.tasks.values()].some(task => task.delay === 2000)).toBe(true);
    await timers.run(2000);
    await restart;

    expect(events).not.toContain('io:disconnect');
    expect(events).not.toContain('db:close');
    expect(events).not.toContain('server:close');
    expect(events).not.toContain('exit:75');
    expect(timers.tasks.size).toBe(0);
    expect(onRestartAborted).toHaveBeenCalledWith({
      reason: 'flush timeout',
      message: 'Server restart aborted because database-event-flush failed; HTTP server remains open.',
      stage: 'database-event-flush',
      error: { name: 'Error', code: 'DATABASE_FLUSH_TIMEOUT' }
    });
  });

  test('aborts before HTTP close and exit when database close throws', async () => {
    let closeAttempts = 0;
    const { coordinator, events, timers, onRestartAborted } = createHarness({
      closeDatabase: () => {
        closeAttempts += 1;
        if (closeAttempts === 1) {
          throw Object.assign(new Error('database close failed'), { code: 'SQLITE_CLOSE_FAILED' });
        }
      }
    });
    coordinator.schedule('database close failure');
    await timers.run(250);

    expect(events).toContain('db:flush');
    expect(events).toContain('io:disconnect');
    expect(events).toContain('db:close');
    expect(events).not.toContain('server:close');
    expect(events).not.toContain('exit:75');
    expect(timers.tasks.size).toBe(0);
    expect(onRestartAborted).toHaveBeenCalledWith({
      reason: 'database close failure',
      message: 'Server restart aborted because database-close failed; HTTP server remains open.',
      stage: 'database-close',
      error: { name: 'Error', code: 'SQLITE_CLOSE_FAILED' }
    });
    expect(coordinator.isScheduled()).toBe(false);

    expect(coordinator.schedule('database close retry')).toBe(true);
    await timers.run(250);
    expect(closeAttempts).toBe(2);
    expect(events).toContain('exit:75');
  });

  test('does not report successful restart when HTTP close callback returns an error', async () => {
    const httpCloseError = Object.assign(new Error('HTTP close failed'), { code: 'ERR_SERVER_NOT_RUNNING' });
    const { coordinator, events, timers } = createHarness({ serverCloseError: httpCloseError });
    coordinator.schedule('HTTP close failure');
    await timers.run(250);

    expect(events).toContain('db:close');
    expect(events).toContain('server:close');
    expect(events).toContain('exit:1');
    expect(events).not.toContain('exit:75');
    expect(timers.tasks.size).toBe(0);
  });
});
