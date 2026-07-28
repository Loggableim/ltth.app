const TTSPlugin = require('../plugins/tts/main');
const { PassThrough } = require('stream');

function createPlugin() {
  const plugin = Object.create(TTSPlugin.prototype);
  plugin.api = {
    emit: jest.fn(),
    getPlugin: jest.fn(() => null),
    pluginLoader: {
      getPluginInstance: jest.fn(() => null)
    },
    registerSocket: jest.fn()
  };
  plugin.logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
  plugin.config = {
    playbackCompletionBufferMs: 0,
    playbackEstimateBufferMs: 0,
    rendererPlaybackWatchdogMs: 25,
    rendererPlaybackMaxMs: 100,
    avatarPreparationTimeoutMs: 25,
    duckOtherAudio: false
  };
  plugin.engines = {};
  plugin._logDebug = jest.fn();
  return plugin;
}

function lifecycleEvents(api, eventName) {
  return api.emit.mock.calls
    .filter(([event]) => event === eventName)
    .map(([, payload]) => payload);
}

describe('TTS renderer lifecycle', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('publishes one native start and one terminal phase for a playback id', async () => {
    const plugin = createPlugin();
    const meta = {
      id: 'playback-a',
      playbackId: 'playback-a',
      userId: 'viewer-a',
      username: 'Viewer A',
      voice: 'voice-a',
      engine: 'tiktok',
      hasAssignedVoice: true,
      source: 'chat',
      isStreaming: false
    };

    const completion = plugin._beginRendererPlayback(meta, { durationMs: 10 });

    expect(plugin._handleRendererLifecycle('tts:renderer:started', {
      playbackId: 'playback-a',
      currentTimeMs: 0
    })).toBe(true);
    expect(plugin._handleRendererLifecycle('tts:renderer:started', {
      playbackId: 'playback-a',
      currentTimeMs: 0
    })).toBe(false);
    expect(plugin._handleRendererLifecycle('tts:renderer:ended', {
      playbackId: 'playback-a',
      currentTimeMs: 10
    })).toBe(true);
    expect(plugin._handleRendererLifecycle('tts:renderer:ended', {
      playbackId: 'playback-a',
      currentTimeMs: 10
    })).toBe(false);

    await expect(completion).resolves.toMatchObject({
      outcome: 'ended',
      playbackId: 'playback-a'
    });
    expect(lifecycleEvents(plugin.api, 'tts:renderer:started')).toHaveLength(1);
    expect(lifecycleEvents(plugin.api, 'tts:renderer:ended')).toHaveLength(1);
    expect(lifecycleEvents(plugin.api, 'tts:playback:started')).toEqual([
      expect.objectContaining({
        playbackId: 'playback-a',
        rendererAuthoritative: true,
        rendererPhase: 'started'
      })
    ]);
    expect(lifecycleEvents(plugin.api, 'tts:playback:ended')).toEqual([
      expect.objectContaining({
        playbackId: 'playback-a',
        rendererAuthoritative: true,
        rendererPhase: 'ended',
        rendererOutcome: 'ended'
      })
    ]);
    expect(lifecycleEvents(plugin.api, 'tts:renderer:started')[0]).toEqual(expect.objectContaining({
      playbackId: 'playback-a',
      id: 'playback-a',
      userId: 'viewer-a',
      username: 'Viewer A'
    }));
  });

  test('ignores a stale renderer terminal event without settling a newer playback', async () => {
    const plugin = createPlugin();
    const first = plugin._beginRendererPlayback({
      id: 'first', playbackId: 'first', userId: 'same-viewer', username: 'Viewer'
    }, { durationMs: 10 });
    const second = plugin._beginRendererPlayback({
      id: 'second', playbackId: 'second', userId: 'same-viewer', username: 'Viewer'
    }, { durationMs: 10 });

    plugin._handleRendererLifecycle('tts:renderer:ended', { playbackId: 'first' });
    expect(plugin._handleRendererLifecycle('tts:renderer:ended', { playbackId: 'first' })).toBe(false);
    expect(plugin._activeRendererPlaybacks.has('second')).toBe(true);

    plugin._handleRendererLifecycle('tts:renderer:ended', { playbackId: 'second' });
    await expect(first).resolves.toMatchObject({ playbackId: 'first', outcome: 'ended' });
    await expect(second).resolves.toMatchObject({ playbackId: 'second', outcome: 'ended' });
  });

  test('settles an unacknowledged renderer playback through its watchdog', async () => {
    jest.useFakeTimers();
    const plugin = createPlugin();
    plugin.config.rendererPlaybackWatchdogMs = 10;
    plugin.config.rendererPlaybackMaxMs = 50;
    const completion = plugin._beginRendererPlayback({
      id: 'watchdog', playbackId: 'watchdog', userId: 'viewer', username: 'Viewer'
    }, { durationMs: 1 });

    await jest.advanceTimersByTimeAsync(11);

    await expect(completion).resolves.toMatchObject({
      playbackId: 'watchdog',
      outcome: 'failed',
      reason: 'renderer-watchdog'
    });
    expect(lifecycleEvents(plugin.api, 'tts:renderer:failed')).toHaveLength(1);
    expect(lifecycleEvents(plugin.api, 'tts:playback:ended')).toEqual([
      expect.objectContaining({
        playbackId: 'watchdog',
        rendererAuthoritative: true,
        rendererPhase: 'ended',
        rendererOutcome: 'failed',
        reason: 'renderer-watchdog'
      })
    ]);
  });

  test('uses the Talking Heads preparation gate when it is available', async () => {
    const plugin = createPlugin();
    const prepareAvatarForPlayback = jest.fn().mockResolvedValue({
      created: true,
      spinStatus: 'complete'
    });
    plugin.api.getPlugin.mockReturnValue({ prepareAvatarForPlayback });

    await expect(plugin._prepareAvatarForPlayback({
      playbackId: 'gate-success',
      userId: 'viewer',
      username: 'Viewer',
      hasAssignedVoice: true
    })).resolves.toEqual(expect.objectContaining({
      state: 'complete',
      created: true
    }));
    expect(prepareAvatarForPlayback).toHaveBeenCalledWith(expect.objectContaining({
      playbackId: 'gate-success',
      userId: 'viewer'
    }));
  });

  test('does not block playback when Talking Heads is absent or its gate times out', async () => {
    jest.useFakeTimers();
    const plugin = createPlugin();

    await expect(plugin._prepareAvatarForPlayback({ playbackId: 'without-plugin' }))
      .resolves.toEqual(expect.objectContaining({ state: 'unavailable' }));

    plugin.api.getPlugin.mockReturnValue({
      prepareAvatarForPlayback: jest.fn(() => new Promise(() => {}))
    });
    const timed = plugin._prepareAvatarForPlayback({ playbackId: 'gate-timeout' });
    await jest.advanceTimersByTimeAsync(26);
    await expect(timed).resolves.toEqual(expect.objectContaining({ state: 'timeout' }));
  });

  test('keeps legacy tts:play fields while waiting for native renderer ended', async () => {
    const plugin = createPlugin();
    plugin._prepareAvatarForPlayback = jest.fn().mockResolvedValue({ state: 'existing', created: false });
    plugin._resolvePlaybackDuration = jest.fn(() => ({ durationMs: 10, source: 'test', format: 'wav' }));
    const item = {
      id: 'normal-audio',
      userId: 'viewer-a',
      username: 'Viewer A',
      text: 'Hello renderer',
      voice: 'voice-a',
      engine: 'tiktok',
      hasAssignedVoice: true,
      source: 'chat',
      audioData: 'base64-audio',
      volume: 75,
      speed: 1,
      isStreaming: false
    };

    const playback = plugin._playAudio(item);
    await Promise.resolve();
    await Promise.resolve();

    const playPayload = lifecycleEvents(plugin.api, 'tts:play')[0];
    expect(lifecycleEvents(plugin.api, 'tts:playback:prepared')).toHaveLength(1);
    expect(playPayload).toEqual(expect.objectContaining({
      id: 'normal-audio',
      playbackId: 'normal-audio',
      userId: 'viewer-a',
      username: 'Viewer A',
      hasAssignedVoice: true,
      audioData: 'base64-audio'
    }));

    plugin._handleRendererLifecycle('tts:renderer:started', { playbackId: 'normal-audio' });
    plugin._handleRendererLifecycle('tts:renderer:ended', { playbackId: 'normal-audio' });
    await expect(playback).resolves.toBeUndefined();
    expect(lifecycleEvents(plugin.api, 'tts:renderer:ended')).toHaveLength(1);
  });

  test('uses the same renderer contract for buffered streaming audio', async () => {
    const plugin = createPlugin();
    const stream = new PassThrough();
    plugin._prepareAvatarForPlayback = jest.fn().mockResolvedValue({ state: 'existing', created: false });
    plugin._assertEngineCircuitAllows = jest.fn();
    plugin._recordEngineSuccess = jest.fn();
    plugin._recordEngineFailure = jest.fn();
    plugin._resolvePlaybackDuration = jest.fn(() => ({ durationMs: 10, source: 'test', format: 'mp3' }));
    plugin.engines.tiktok = {
      synthesizeStream: jest.fn().mockResolvedValue({ stream, format: 'mp3' })
    };
    const item = {
      id: 'stream-audio',
      userId: 'viewer-stream',
      username: 'Viewer Stream',
      text: 'Streaming hello',
      voice: 'voice-stream',
      engine: 'tiktok',
      hasAssignedVoice: true,
      source: 'chat',
      volume: 80,
      speed: 1,
      isStreaming: true
    };

    const playback = plugin._playAudio(item);
    await new Promise((resolve) => setImmediate(resolve));
    // Dashboard buffers this transport stream. Its audio element cannot emit
    // native `playing` until EOF, so no renderer watchdog may start yet.
    expect(lifecycleEvents(plugin.api, 'tts:playback:prepared')).toHaveLength(0);
    stream.end(Buffer.from('stream-data'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(lifecycleEvents(plugin.api, 'tts:playback:prepared')).toHaveLength(1);
    expect(lifecycleEvents(plugin.api, 'tts:stream:chunk')[0]).toEqual(expect.objectContaining({
      id: 'stream-audio',
      playbackId: 'stream-audio',
      userId: 'viewer-stream'
    }));
    expect(lifecycleEvents(plugin.api, 'tts:stream:end')[0]).toEqual(expect.objectContaining({
      playbackId: 'stream-audio'
    }));

    plugin._handleRendererLifecycle('tts:renderer:started', { playbackId: 'stream-audio' });
    expect(lifecycleEvents(plugin.api, 'tts:playback:started')).toEqual([
      expect.objectContaining({
        playbackId: 'stream-audio',
        isStreaming: true,
        rendererAuthoritative: true,
        rendererPhase: 'started'
      })
    ]);
    plugin._handleRendererLifecycle('tts:renderer:ended', { playbackId: 'stream-audio' });
    await expect(playback).resolves.toBeUndefined();
  });

  test('settles a streaming playback promptly when Dashboard reports autoplay lock before EOF', async () => {
    const plugin = createPlugin();
    const stream = new PassThrough();
    plugin._prepareAvatarForPlayback = jest.fn().mockResolvedValue({ state: 'existing', created: false });
    plugin._assertEngineCircuitAllows = jest.fn();
    plugin._recordEngineSuccess = jest.fn();
    plugin._recordEngineFailure = jest.fn();
    plugin._resolvePlaybackDuration = jest.fn(() => ({ durationMs: 10, source: 'test', format: 'mp3' }));
    plugin.engines.tiktok = {
      synthesizeStream: jest.fn().mockResolvedValue({ stream, format: 'mp3' })
    };
    const item = {
      id: 'stream-autoplay-lock',
      userId: 'viewer-stream',
      username: 'Viewer Stream',
      text: 'Streaming hello',
      voice: 'voice-stream',
      engine: 'tiktok',
      hasAssignedVoice: true,
      source: 'chat',
      volume: 80,
      speed: 1,
      isStreaming: true
    };

    const playback = plugin._playAudio(item);
    try {
      await new Promise((resolve) => setImmediate(resolve));
      stream.write(Buffer.from('first-chunk'));

      expect(plugin._activeRendererPlaybacks.get('stream-autoplay-lock')).toEqual(expect.objectContaining({
        watchdogTimer: null,
        maxTimer: null
      }));
      expect(plugin._handleRendererLifecycle('tts:renderer:failed', {
        playbackId: 'stream-autoplay-lock',
        reason: 'audio-locked'
      })).toBe(true);

      await expect(playback).resolves.toBeUndefined();
      expect(lifecycleEvents(plugin.api, 'tts:playback:prepared')).toHaveLength(0);
      expect(lifecycleEvents(plugin.api, 'tts:renderer:failed')).toEqual([
        expect.objectContaining({
          playbackId: 'stream-autoplay-lock',
          reason: 'audio-locked'
        })
      ]);

      stream.end();
      await new Promise((resolve) => setImmediate(resolve));
      expect(lifecycleEvents(plugin.api, 'tts:stream:end')).toEqual([
        expect.objectContaining({ playbackId: 'stream-autoplay-lock' })
      ]);
      expect(lifecycleEvents(plugin.api, 'tts:playback:prepared')).toHaveLength(0);
    } finally {
      if (!stream.writableEnded) stream.end();
      await new Promise((resolve) => setImmediate(resolve));
      plugin._handleRendererLifecycle('tts:renderer:failed', {
        playbackId: 'stream-autoplay-lock',
        reason: 'test-cleanup'
      });
      await playback.catch(() => {});
    }
  });

  test('registers renderer acknowledgements as local socket input only', async () => {
    const plugin = createPlugin();
    plugin.queueManager = {
      clear: jest.fn(() => 0),
      skipCurrent: jest.fn(() => false)
    };
    plugin._registerSocketEvents();
    const handlers = new Map(plugin.api.registerSocket.mock.calls);
    const completion = plugin._beginRendererPlayback({
      id: 'socket-ack', playbackId: 'socket-ack', userId: 'viewer', username: 'Viewer'
    });

    expect(handlers.get('tts:renderer:started')({}, { playbackId: 'socket-ack' })).toBe(true);
    expect(handlers.get('tts:renderer:ended')({}, { playbackId: 'socket-ack' })).toBe(true);
    await expect(completion).resolves.toMatchObject({ outcome: 'ended' });
    expect(handlers.has('tts:renderer:started')).toBe(true);
    expect(handlers.has('tts:renderer:progress')).toBe(true);
    expect(handlers.has('tts:renderer:ended')).toBe(true);
    expect(handlers.has('tts:renderer:failed')).toBe(true);
  });
});
