'use strict';

const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
jest.mock('../plugins/tts/utils/language-detector', () => jest.fn());
const TTSPlugin = require('../plugins/tts/main');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createPlugin({ talkingHeads, stream, avatarSetupTimeoutMs = 50 } = {}) {
  const plugin = Object.create(TTSPlugin.prototype);
  plugin.api = {
    emit: jest.fn(),
    getPlugin: jest.fn(() => talkingHeads || null)
  };
  plugin.logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  plugin.config = {
    rendererPlaybackWatchdogMs: 1000,
    rendererPlaybackMaxMs: 5000,
    streamEofWatchdogMs: 120000,
    avatarSetupTimeoutMs,
    duckOtherAudio: false,
    duckVolume: 0
  };
  plugin.engines = {
    fixture: {
      synthesizeStream: jest.fn().mockResolvedValue({ stream, format: 'mp3' })
    }
  };
  plugin.queueManager = { currentItem: null, queue: [], stopProcessing: jest.fn() };
  plugin._pendingAvatarPreparations = new Map();
  plugin._logDebug = jest.fn();
  plugin._assertEngineCircuitAllows = jest.fn();
  plugin._recordEngineSuccess = jest.fn();
  plugin._recordEngineFailure = jest.fn();
  plugin._resolvePlaybackDuration = jest.fn(() => ({ durationMs: 20, source: 'fixture', format: 'mp3' }));
  plugin._emitPlaybackPrepared = jest.fn();
  plugin._prepareAvatarForPlayback = TTSPlugin.prototype._prepareAvatarForPlayback.bind(plugin);
  plugin.permissionManager = null;
  return plugin;
}

function item(id = 'avatar-cancel-fixture') {
  return {
    id,
    text: 'fixture narration',
    voice: 'fixture-voice',
    engine: 'fixture',
    source: 'fixture',
    isStreaming: true,
    volume: 80,
    speed: 1
  };
}

function events(plugin, name) {
  return plugin.api.emit.mock.calls.filter(([event]) => event === name).map(([, payload]) => payload);
}

describe('TTS avatar setup cancellation', () => {
  test('aborts a hanging pre-spin setup at its deadline', async () => {
    const pending = deferred();
    let receivedSignal;
    const plugin = createPlugin({
      avatarSetupTimeoutMs: 15,
      talkingHeads: {
        prepareAvatarForPlayback: jest.fn((meta, options) => {
          receivedSignal = options.signal;
          return pending.promise;
        })
      }
    });
    const controller = new AbortController();

    const result = await plugin._prepareAvatarForPlayback({ playbackId: 'timeout' }, {
      signal: controller.signal,
      abort: reason => controller.abort(reason)
    });

    expect(result).toEqual({ state: 'setup-timeout' });
    expect(receivedSignal.aborted).toBe(true);
    pending.resolve({ spinStatus: 'late' });
  });

  test('stops the setup deadline at spin start and preserves normal spin completion', async () => {
    const pending = deferred();
    const plugin = createPlugin({
      avatarSetupTimeoutMs: 10,
      talkingHeads: {
        prepareAvatarForPlayback: jest.fn((meta, options) => {
          options.onPhase('spin-started');
          return pending.promise;
        })
      }
    });
    const controller = new AbortController();
    const resultPromise = plugin._prepareAvatarForPlayback({ playbackId: 'normal-spin' }, {
      signal: controller.signal,
      abort: reason => controller.abort(reason)
    });

    await new Promise(resolve => setTimeout(resolve, 25));
    expect(controller.signal.aborted).toBe(false);
    pending.resolve({ spinStatus: 'complete', created: true });
    await expect(resultPromise).resolves.toEqual({ state: 'complete', created: true });
  });

  test('unload aborts a streaming item waiting at the avatar gate and settles once', async () => {
    const stream = new PassThrough();
    const pending = deferred();
    let receivedSignal;
    const playbackId = 'unload-avatar-gate';
    const plugin = createPlugin({
      stream,
      talkingHeads: {
        prepareAvatarForPlayback: jest.fn((meta, options) => {
          receivedSignal = options.signal;
          return pending.promise;
        })
      }
    });
    const playback = plugin._playAudio(item(playbackId));
    await new Promise(resolve => setImmediate(resolve));
    expect(stream.destroyed).toBe(false);

    await plugin.destroy();
    expect(plugin._ensurePendingAvatarPreparations().has(playbackId)).toBe(false);
    await playback;
    await new Promise(resolve => setImmediate(resolve));

    expect(receivedSignal.aborted).toBe(true);
    expect(stream.destroyed).toBe(true);
    expect(events(plugin, 'tts:stream:abort')).toEqual([
      { playbackId, reason: 'plugin-destroyed' }
    ]);
    expect(events(plugin, 'tts:renderer:failed')).toHaveLength(1);
    pending.resolve({ spinStatus: 'late' });
  });

  test('unload after a ready gate but before provider response blocks dispatch and destroys the late stream safely', async () => {
    const streamResult = deferred();
    const lateStream = new EventEmitter();
    lateStream.destroyed = false;
    lateStream.destroy = jest.fn((error) => {
      lateStream.destroyed = true;
      setImmediate(() => {
        lateStream.emit('error', error);
        lateStream.emit('close');
      });
      return lateStream;
    });
    const playbackId = 'late-provider-response';
    const plugin = createPlugin({
      talkingHeads: {
        prepareAvatarForPlayback: jest.fn((meta, options) => {
          options.onPhase('spin-started');
          return Promise.resolve({ spinStatus: 'ready' });
        })
      }
    });
    plugin.engines.fixture.synthesizeStream = jest.fn(() => streamResult.promise);
    const playback = plugin._playAudio(item(playbackId));
    await new Promise(resolve => setImmediate(resolve));

    await plugin.destroy();
    await playback;
    const lateStreamClosed = new Promise(resolve => lateStream.once('close', resolve));
    streamResult.resolve({ stream: lateStream, format: 'mp3' });
    await lateStreamClosed;

    expect(lateStream.destroyed).toBe(true);
    expect(lateStream.destroy).toHaveBeenCalledTimes(1);
    expect(lateStream.listenerCount('error')).toBe(0);
    expect(events(plugin, 'tts:play')).toHaveLength(0);
    expect(events(plugin, 'tts:stream:chunk')).toHaveLength(0);
    expect(events(plugin, 'tts:renderer:failed')).toHaveLength(1);
    expect(plugin._ensureActiveStreamingTransports().has(playbackId)).toBe(false);
  });

  test('abort during regular-synthesis fallback never dispatches audio', async () => {
    const fallback = deferred();
    const playbackId = 'aborted-stream-fallback';
    const plugin = createPlugin({
      talkingHeads: {
        prepareAvatarForPlayback: jest.fn((meta, options) => {
          options.onPhase('spin-started');
          return Promise.resolve({ spinStatus: 'ready' });
        })
      }
    });
    plugin.engines.fixture.synthesizeStream = jest.fn().mockRejectedValue(new Error('fixture stream start failure'));
    plugin.engines.fixture.synthesize = jest.fn(() => fallback.promise);
    const playback = plugin._playAudio(item(playbackId));
    await new Promise(resolve => setImmediate(resolve));

    await plugin.destroy();
    await playback;
    fallback.resolve(Buffer.from('late fallback audio'));

    expect(events(plugin, 'tts:play')).toHaveLength(0);
    expect(events(plugin, 'tts:stream:chunk')).toHaveLength(0);
    expect(events(plugin, 'tts:renderer:failed')).toHaveLength(1);
  });
});
