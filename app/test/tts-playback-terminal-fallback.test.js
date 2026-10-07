'use strict';

const TTSPlugin = require('../plugins/tts/main');
const InteractiveStoryPlugin = require('../plugins/interactive-story/main');
const { PassThrough } = require('stream');

function createPlugin() {
  const plugin = Object.create(TTSPlugin.prototype);
  plugin.api = { emit: jest.fn(), getPlugin: jest.fn(() => null), pluginLoader: { getPluginInstance: jest.fn(() => null) } };
  plugin.logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  plugin.config = { rendererPlaybackWatchdogMs: 1000, rendererPlaybackMaxMs: 5000 };
  plugin.engines = {};
  plugin._logDebug = jest.fn();
  return plugin;
}

function playbackItem(id, source = 'interactive-story') {
  return {
    id,
    userId: 'interactive-story',
    username: 'Story Narrator (interactive-story)',
    text: `Fixture ${id}`,
    voice: 'fixture-voice',
    engine: 'fixture-engine',
    hasAssignedVoice: true,
    source,
    isStreaming: false,
    audioData: Buffer.from('fixture-audio')
  };
}

function terminalEvents(plugin) {
  return plugin.api.emit.mock.calls
    .filter(([event]) => event === 'tts:playback:ended')
    .map(([, payload]) => payload);
}

function createStoryWaiters(playbackIds) {
  const story = Object.create(InteractiveStoryPlugin.prototype);
  story.api = { removeListener: jest.fn(), log: jest.fn() };
  story.logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  story.TTS_USERNAME = 'Story Narrator (interactive-story)';
  story.TTS_PLAYBACK_TIMEOUT_MS = 5000;
  story.TTS_EARLY_END_BUFFER_TTL_MS = 1000;
  story.TTS_EARLY_END_BUFFER_MAX = 4;
  story.ttsPlaybackResolvers = new Map();
  story.ttsPlaybackEarlyEnds = new Map();
  story._ttsPlaybackTrackingDestroyed = false;
  const waiters = new Map(playbackIds.map(id => [id, story._waitForSystemTtsPlayback(id)]));
  return { story, waiters };
}

function connectStoryBus(ttsPlugin, story) {
  ttsPlugin.api.emit.mockImplementation((event, payload) => {
    if (event === 'tts:playback:ended') story._handleTtsPlaybackEnded(payload);
    return true;
  });
}

describe('TTS playback terminal fallback', () => {
  test('emits one correlated failed terminal when dispatch fails before creating a renderer record', async () => {
    const plugin = createPlugin();
    const item = playbackItem('dispatch-before-record');
    const { story, waiters } = createStoryWaiters([item.id]);
    connectStoryBus(plugin, story);
    plugin._prepareAvatarForPlayback = jest.fn().mockResolvedValue({ state: 'unavailable' });
    plugin._resolvePlaybackDuration = jest.fn(() => { throw new Error('fixture duration failure'); });

    await plugin._playAudio(item);

    expect(terminalEvents(plugin)).toEqual([
      expect.objectContaining({
        id: item.id,
        playbackId: item.id,
        userId: item.userId,
        username: item.username,
        source: item.source,
        rendererOutcome: 'failed',
        reason: 'server-playback-error'
      })
    ]);
    expect(plugin._activeRendererPlaybacks?.has(item.id)).not.toBe(true);
    await expect(waiters.get(item.id)).resolves.toMatchObject({
      playbackId: item.id,
      rendererOutcome: 'failed'
    });
  });

  test('settles a stream setup failure before EOF without treating stream:end as playback completion', async () => {
    const plugin = createPlugin();
    const item = { ...playbackItem('stream-setup-failure'), isStreaming: true, audioData: null };
    const { story, waiters } = createStoryWaiters([item.id]);
    connectStoryBus(plugin, story);
    plugin.engines[item.engine] = {
      synthesizeStream: jest.fn().mockRejectedValue(new Error('fixture stream setup failure'))
    };
    plugin._prepareAvatarForPlayback = jest.fn().mockResolvedValue({ state: 'unavailable' });
    plugin._recordEngineFailure = jest.fn();

    await plugin._playAudio(item);

    expect(terminalEvents(plugin)).toEqual([
      expect.objectContaining({
        playbackId: item.id,
        userId: item.userId,
        username: item.username,
        source: item.source,
        rendererOutcome: 'failed',
        reason: 'server-playback-error'
      })
    ]);
    expect(plugin.api.emit).not.toHaveBeenCalledWith('tts:stream:end', expect.anything());
    expect(plugin._activeRendererPlaybacks?.has(item.id)).not.toBe(true);
    await expect(waiters.get(item.id)).resolves.toMatchObject({
      playbackId: item.id,
      rendererOutcome: 'failed'
    });
  });

  test('a stream error after record creation emits only its original correlated terminal', async () => {
    const plugin = createPlugin();
    const item = { ...playbackItem('stream-error-after-record'), isStreaming: true, audioData: null };
    const stream = new PassThrough();
    const { story, waiters } = createStoryWaiters([item.id]);
    connectStoryBus(plugin, story);
    plugin.engines[item.engine] = {
      synthesizeStream: jest.fn().mockResolvedValue({ stream, format: 'mp3' })
    };
    plugin._prepareAvatarForPlayback = jest.fn().mockResolvedValue({ state: 'unavailable' });
    plugin._assertEngineCircuitAllows = jest.fn();
    plugin._recordEngineSuccess = jest.fn();
    plugin._recordEngineFailure = jest.fn();

    const playback = plugin._playAudio(item);
    await new Promise(resolve => setImmediate(resolve));
    expect(plugin._activeRendererPlaybacks.has(item.id)).toBe(true);
    stream.emit('error', new Error('fixture stream body failure'));
    await playback;

    expect(terminalEvents(plugin)).toEqual([
      expect.objectContaining({
        playbackId: item.id,
        userId: item.userId,
        username: item.username,
        source: item.source,
        rendererOutcome: 'failed',
        reason: 'stream-error'
      })
    ]);
    await expect(waiters.get(item.id)).resolves.toMatchObject({
      playbackId: item.id,
      rendererOutcome: 'failed',
      reason: 'stream-error'
    });
  });

  test('fails pending current and queued IDs on unload and does not duplicate an active record terminal', async () => {
    const plugin = createPlugin();
    const active = playbackItem('unload-active');
    const pendingCurrent = playbackItem('unload-current');
    const pendingQueued = playbackItem('unload-queued');
    const { story, waiters } = createStoryWaiters([active.id, pendingCurrent.id, pendingQueued.id]);
    connectStoryBus(plugin, story);
    plugin.queueManager = {
      currentItem: active,
      queue: [pendingCurrent, pendingQueued],
      stopProcessing: jest.fn()
    };
    plugin.permissionManager = { clearCache: jest.fn() };
    plugin.debugLogs = ['fixture'];
    plugin._beginRendererPlayback({
      id: active.id,
      playbackId: active.id,
      userId: active.userId,
      username: active.username,
      source: active.source
    }, { deferWatchdogs: true });
    await plugin.destroy();

    const events = terminalEvents(plugin);
    expect(events).toHaveLength(3);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ playbackId: active.id, rendererOutcome: 'failed', reason: 'plugin-destroyed' }),
      expect.objectContaining({ playbackId: pendingCurrent.id, rendererOutcome: 'failed', reason: 'plugin-destroyed' }),
      expect.objectContaining({ playbackId: pendingQueued.id, rendererOutcome: 'failed', reason: 'plugin-destroyed' })
    ]));
    expect(events.filter(event => event.playbackId === active.id)).toHaveLength(1);
    expect(plugin.queueManager.stopProcessing).toHaveBeenCalledTimes(1);
    await expect(Promise.all([...waiters.values()])).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ playbackId: active.id, rendererOutcome: 'failed' }),
      expect.objectContaining({ playbackId: pendingCurrent.id, rendererOutcome: 'failed' }),
      expect.objectContaining({ playbackId: pendingQueued.id, rendererOutcome: 'failed' })
    ]));
  });
});
