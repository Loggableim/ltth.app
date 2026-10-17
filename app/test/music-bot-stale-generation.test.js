'use strict';

const MusicBotPlugin = require('../plugins/music-bot/main');

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createHarness() {
  const emitted = [];
  const track = { id: 'synthetic-track', title: 'Synthetic track' };
  const gate = deferred();
  const plugin = Object.create(MusicBotPlugin.prototype);
  plugin._destroyed = false;
  plugin.config = { safety: { locked: false } };
  plugin.api = {
    emit: (...args) => emitted.push(args),
    log: jest.fn()
  };
  plugin.queueManager = {
    shiftNext: jest.fn(() => track),
    returnToFront: jest.fn(),
    getQueue: jest.fn(() => [])
  };
  plugin.playbackEngine = {
    play: jest.fn(() => gate.promise),
    isSafetyLocked: jest.fn(() => false)
  };
  plugin._checkBans = jest.fn(() => null);
  plugin._schedulePreCache = jest.fn();

  return { emitted, gate, plugin, track };
}

describe('Music Bot queue advance lifecycle guard', () => {
  test('preserves normal playback completion, queue publication, and precache scheduling', async () => {
    const harness = createHarness();
    const advance = harness.plugin._playNextFromQueueInternal({ isCurrent: () => true });

    await Promise.resolve();
    harness.gate.resolve(harness.track);

    await expect(advance).resolves.toEqual({ success: true, song: harness.track });
    expect(harness.emitted.filter(([event]) => event === 'musicbot:queue-update')).toHaveLength(1);
    expect(harness.plugin._schedulePreCache).toHaveBeenCalledTimes(1);
  });

  test('does not publish or precache after the supervisor generation becomes stale during playback', async () => {
    const harness = createHarness();
    let generation = 1;
    const advance = harness.plugin._playNextFromQueueInternal({
      isCurrent: () => generation === 1
    });

    await Promise.resolve();
    generation += 1;
    harness.gate.resolve(harness.track);

    await expect(advance).resolves.toEqual({ success: false, stale: true });
    expect(harness.emitted.filter(([event]) => event === 'musicbot:queue-update')).toHaveLength(0);
    expect(harness.plugin._schedulePreCache).not.toHaveBeenCalled();
    expect(harness.plugin.queueManager.shiftNext).toHaveBeenCalledTimes(1);
    expect(harness.plugin.queueManager.returnToFront).not.toHaveBeenCalled();
  });

  test('returns the safety-locked result and suppresses publication after shutdown during playback', async () => {
    const harness = createHarness();
    const advance = harness.plugin._playNextFromQueueInternal({ isCurrent: () => true });

    await Promise.resolve();
    harness.plugin._destroyed = true;
    harness.plugin._lifecycleGeneration = 2;
    harness.gate.resolve(harness.track);

    await expect(advance).resolves.toEqual(harness.plugin._lockedResult());
    expect(harness.emitted.filter(([event]) => event === 'musicbot:queue-update')).toHaveLength(0);
    expect(harness.plugin._schedulePreCache).not.toHaveBeenCalled();
    expect(harness.plugin.queueManager.shiftNext).toHaveBeenCalledTimes(1);
    expect(harness.plugin.queueManager.returnToFront).not.toHaveBeenCalled();
  });

  test('returns the safety-locked result and suppresses publication if the lock engages during playback', async () => {
    const harness = createHarness();
    const advance = harness.plugin._playNextFromQueueInternal({ isCurrent: () => true });

    await Promise.resolve();
    harness.plugin.config.safety.locked = true;
    harness.gate.resolve(harness.track);

    await expect(advance).resolves.toEqual(harness.plugin._lockedResult());
    expect(harness.emitted.filter(([event]) => event === 'musicbot:queue-update')).toHaveLength(0);
    expect(harness.plugin._schedulePreCache).not.toHaveBeenCalled();
    expect(harness.plugin.queueManager.shiftNext).toHaveBeenCalledTimes(1);
    expect(harness.plugin.queueManager.returnToFront).not.toHaveBeenCalled();
  });
});
