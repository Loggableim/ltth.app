const MusicBotPlugin = require('../plugins/music-bot/main');
const QueueManager = require('../plugins/music-bot/lib/queue-manager');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createPlugin() {
  const api = {
    getSocketIO: () => ({ emit: jest.fn() }),
    getDatabase: () => ({}),
    log: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  const track = { id: 'track-a', title: 'Synthetic A', url: 'file:///synthetic-a.wav' };
  const play = deferred();
  plugin.queueManager = {
    _mutationsClosed: false,
    shiftNext: jest.fn(() => track),
    markPlaying: jest.fn(),
    addToHistory: jest.fn()
  };
  plugin.playbackEngine = { play: jest.fn(() => play.promise) };
  plugin._recordCatalogTrackEnd = jest.fn();
  plugin._emitError = jest.fn();
  plugin._emitQueue = jest.fn();
  return { plugin, play };
}

describe('Music Bot shutdown blocks late playback rejection recovery', () => {
  test('play rejection after destroy does not record or mutate queue history/current state', async () => {
    const { plugin, play } = createPlugin();
    const operation = plugin._playNextFromQueueInternal({
      isCurrent: () => !plugin._destroyed
    });

    await Promise.resolve();
    expect(plugin.playbackEngine.play).toHaveBeenCalledTimes(1);

    plugin._destroyed = true;
    plugin.queueManager._mutationsClosed = true;
    play.reject(new Error('synthetic playback failure'));

    await expect(operation).resolves.toMatchObject({ success: false, stale: true });
    expect(plugin._recordCatalogTrackEnd).not.toHaveBeenCalled();
    expect(plugin.queueManager.markPlaying).not.toHaveBeenCalled();
    expect(plugin.queueManager.addToHistory).not.toHaveBeenCalled();
    expect(plugin._emitError).not.toHaveBeenCalled();
    expect(plugin._emitQueue).not.toHaveBeenCalled();
  });

  test('destroy during asynchronous IPC reset prevents late queue recovery', async () => {
    const { plugin, play } = createPlugin();
    const reset = deferred();
    const resetPlayerOnce = jest.fn(() => reset.promise);
    const operation = plugin._playNextFromQueueInternal({
      isCurrent: () => !plugin._destroyed,
      resetPlayerOnce
    });

    await Promise.resolve();
    play.reject(new Error('ipc socket closed'));
    await Promise.resolve();
    expect(resetPlayerOnce).toHaveBeenCalledTimes(1);

    plugin._destroyed = true;
    plugin.queueManager._mutationsClosed = true;
    reset.resolve(true);

    await expect(operation).resolves.toMatchObject({ success: false, stale: true });
    expect(plugin._recordCatalogTrackEnd).not.toHaveBeenCalled();
    expect(plugin.queueManager.markPlaying).not.toHaveBeenCalled();
    expect(plugin.queueManager.addToHistory).not.toHaveBeenCalled();
  });

  test('QueueManager rejects history mutation after closeMutations without persistence', () => {
    const manager = Object.create(QueueManager.prototype);
    manager._mutationsClosed = true;
    manager.history = [];
    manager._persistHistory = jest.fn();

    expect(manager.addToHistory({ id: 'late-track' }, true)).toBe(false);
    expect(manager.history).toEqual([]);
    expect(manager._persistHistory).not.toHaveBeenCalled();
  });
});
