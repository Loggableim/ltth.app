'use strict';

const { unloadPluginsForShutdown } = require('../modules/plugin-shutdown');

describe('plugin shutdown gate', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('unloads in reverse order and reports success only after every plugin resolves true', async () => {
    const order = [];
    const pluginLoader = {
      plugins: new Map([['first', {}], ['music-bot', {}], ['last', {}]]),
      unloadPlugin: jest.fn(async (pluginId, context) => {
        expect(context).toEqual({ reason: 'application-shutdown' });
        order.push(pluginId);
        return true;
      })
    };

    await expect(unloadPluginsForShutdown({
      pluginLoader,
      timeoutMs: 1000,
      logger: { warn: jest.fn() }
    }))
      .resolves.toEqual({ success: true, timedOut: false });
    expect(order).toEqual(['last', 'music-bot', 'first']);
  });

  test.each([
    ['a false result', async () => false],
    ['a thrown error', async () => { throw new Error('cleanup failed'); }]
  ])('fails closed on %s', async (_label, unload) => {
    const pluginLoader = {
      plugins: new Map([['dependent', {}], ['music-bot', {}]]),
      unloadPlugin: jest.fn(unload)
    };

    await expect(unloadPluginsForShutdown({
      pluginLoader,
      timeoutMs: 1000,
      logger: { warn: jest.fn() }
    }))
      .resolves.toEqual({ success: false, timedOut: false });
    expect(pluginLoader.unloadPlugin).toHaveBeenCalledTimes(1);
    expect(pluginLoader.unloadPlugin).toHaveBeenCalledWith(
      'music-bot', { reason: 'application-shutdown' }
    );
  });

  test('fails closed when a plugin cleanup times out', async () => {
    jest.useFakeTimers();
    const pluginLoader = {
      plugins: new Map([['music-bot', {}]]),
      unloadPlugin: jest.fn(() => new Promise(() => {}))
    };

    const shutdown = unloadPluginsForShutdown({ pluginLoader, timeoutMs: 100 });
    await jest.advanceTimersByTimeAsync(100);

    await expect(shutdown).resolves.toEqual({ success: false, timedOut: true });
    expect(pluginLoader.unloadPlugin).toHaveBeenCalledWith(
      'music-bot', { reason: 'application-shutdown' }
    );
  });
});
