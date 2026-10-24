'use strict';

const TTSPlugin = require('../plugins/tts/main');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { isOutgoingSocketEventAllowed } = require('../modules/public-overlay-registry');

function createStreamingPlayback(stream, { streamEofWatchdogMs = 120000 } = {}) {
  const playbackId = 'fixture-stream-playback';
  const plugin = Object.create(TTSPlugin.prototype);
  plugin.api = { emit: jest.fn(), getPlugin: jest.fn(() => null) };
  plugin.logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  plugin.config = {
    rendererPlaybackWatchdogMs: 1000,
    rendererPlaybackMaxMs: 5000,
    streamEofWatchdogMs
  };
  plugin.engines = {
    fixture: {
      synthesizeStream: jest.fn().mockResolvedValue({ stream, format: 'mp3' })
    }
  };
  plugin.queueManager = {
    currentItem: null,
    queue: [],
    stopProcessing: jest.fn()
  };
  plugin._logDebug = jest.fn();
  plugin._assertEngineCircuitAllows = jest.fn();
  plugin._recordEngineSuccess = jest.fn();
  plugin._recordEngineFailure = jest.fn();
  plugin._prepareAvatarForPlayback = jest.fn().mockResolvedValue({ state: 'unavailable' });
  plugin._resolvePlaybackDuration = jest.fn(() => ({ durationMs: 1000, source: 'fixture', format: 'mp3' }));
  plugin._emitPlaybackPrepared = jest.fn();

  const item = {
    id: playbackId,
    playbackId,
    text: 'Fixture narration',
    voice: 'fixture-voice',
    engine: 'fixture',
    source: 'fixture',
    isStreaming: true,
    volume: 80,
    speed: 1
  };

  return { plugin, item, playbackId };
}

async function waitForStreamListeners(stream) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (stream.listenerCount('data') > 0) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('TTS producer did not attach stream listeners');
}

function waitForStreamClose(stream) {
  if (stream.closed === true) return Promise.resolve();
  return new Promise(resolve => stream.once('close', resolve));
}

function eventsFor(plugin, eventName) {
  return plugin.api.emit.mock.calls
    .filter(([event]) => event === eventName)
    .map(([, payload]) => payload);
}

describe('TTS absolute stream EOF watchdog', () => {
  test('keeps stream abort outside the public outgoing event allowlist', () => {
    expect(isOutgoingSocketEventAllowed('tts:stream:abort')).toBe(false);
  });

  test('aborts at the absolute deadline despite continuing bytes and emits one correlated terminal', async () => {
    const stream = new PassThrough();
    const { plugin, item, playbackId } = createStreamingPlayback(stream, { streamEofWatchdogMs: 40 });
    const playback = plugin._playAudio(item);
    await waitForStreamListeners(stream);
    const streamClosed = waitForStreamClose(stream);

    for (let index = 0; index < 4; index += 1) {
      stream.write(Buffer.from(`chunk-${index}`));
      await new Promise(resolve => setTimeout(resolve, 12));
    }
    await playback;
    await streamClosed;

    expect(stream.destroyed).toBe(true);
    expect(stream.listenerCount('data')).toBe(0);
    expect(stream.listenerCount('end')).toBe(0);
    expect(stream.listenerCount('error')).toBe(0);
    expect(stream.listenerCount('close')).toBe(0);
    expect(eventsFor(plugin, 'tts:stream:abort')).toEqual([
      { playbackId, reason: 'stream-eof-timeout' }
    ]);
    expect(eventsFor(plugin, 'tts:stream:end')).toEqual([]);
    expect(eventsFor(plugin, 'tts:playback:ended')).toEqual([
      expect.objectContaining({ playbackId, rendererOutcome: 'failed', reason: 'stream-eof-timeout' })
    ]);
    expect(plugin._activeStreamingTransports?.has(playbackId)).not.toBe(true);

    stream.emit('data', Buffer.from('late chunk'));
    stream.emit('end');
    expect(eventsFor(plugin, 'tts:stream:abort')).toHaveLength(1);
    expect(eventsFor(plugin, 'tts:stream:end')).toHaveLength(0);
    expect(eventsFor(plugin, 'tts:playback:ended')).toHaveLength(1);
  });

  test('keeps normal transport EOF separate from renderer audio completion', async () => {
    const stream = new PassThrough();
    const { plugin, item, playbackId } = createStreamingPlayback(stream);
    const playback = plugin._playAudio(item);
    await waitForStreamListeners(stream);

    stream.write(Buffer.from('complete fixture audio'));
    stream.end();
    await new Promise(resolve => setImmediate(resolve));

    expect(eventsFor(plugin, 'tts:stream:end')).toEqual([
      expect.objectContaining({ playbackId, totalChunks: 1, totalBytes: 22 })
    ]);
    expect(eventsFor(plugin, 'tts:stream:abort')).toEqual([]);
    expect(eventsFor(plugin, 'tts:playback:ended')).toEqual([]);
    expect(plugin._activeRendererPlaybacks.has(playbackId)).toBe(true);
    expect(plugin._activeStreamingTransports?.has(playbackId)).not.toBe(true);
    expect(['data', 'end', 'error', 'close'].map(event => stream.listenerCount(event))).toEqual([0, 0, 0, 0]);

    plugin._handleRendererLifecycle('tts:renderer:ended', { playbackId, currentTimeMs: 1000 });
    await playback;

    expect(eventsFor(plugin, 'tts:playback:ended')).toEqual([
      expect.objectContaining({ playbackId, rendererOutcome: 'ended' })
    ]);
    expect(plugin.api.emit.mock.calls.findIndex(([event]) => event === 'tts:stream:end'))
      .toBeLessThan(plugin.api.emit.mock.calls.findIndex(([event]) => event === 'tts:playback:ended'));
  });

  test('treats close before EOF as a failed transport and removes all listeners', async () => {
    const stream = new PassThrough();
    const { plugin, item, playbackId } = createStreamingPlayback(stream);
    const playback = plugin._playAudio(item);
    await waitForStreamListeners(stream);
    const streamClosed = waitForStreamClose(stream);

    stream.destroy();
    await playback;
    await streamClosed;

    expect(eventsFor(plugin, 'tts:stream:abort')).toEqual([
      { playbackId, reason: 'stream-closed' }
    ]);
    expect(eventsFor(plugin, 'tts:stream:end')).toEqual([]);
    expect(eventsFor(plugin, 'tts:playback:ended')).toEqual([
      expect.objectContaining({ playbackId, rendererOutcome: 'failed', reason: 'stream-closed' })
    ]);
    expect(plugin._activeStreamingTransports?.has(playbackId)).not.toBe(true);
    expect(['data', 'end', 'error', 'close'].map(event => stream.listenerCount(event))).toEqual([0, 0, 0, 0]);
  });

  test('unload destroys an open stream, removes listeners, and ignores late callbacks', async () => {
    const stream = new PassThrough();
    const { plugin, item, playbackId } = createStreamingPlayback(stream);
    const playback = plugin._playAudio(item);
    await waitForStreamListeners(stream);
    const streamClosed = waitForStreamClose(stream);
    stream.write(Buffer.from('partial audio'));

    await plugin.destroy();
    await playback;
    await streamClosed;

    expect(stream.destroyed).toBe(true);
    expect(['data', 'end', 'error', 'close'].map(event => stream.listenerCount(event))).toEqual([0, 0, 0, 0]);
    expect(eventsFor(plugin, 'tts:stream:abort')).toEqual([
      { playbackId, reason: 'plugin-destroyed' }
    ]);
    expect(eventsFor(plugin, 'tts:stream:end')).toEqual([]);
    expect(eventsFor(plugin, 'tts:playback:ended')).toEqual([
      expect.objectContaining({ playbackId, rendererOutcome: 'failed', reason: 'plugin-destroyed' })
    ]);

    stream.emit('data', Buffer.from('late audio'));
    stream.emit('end');
    expect(eventsFor(plugin, 'tts:stream:abort')).toHaveLength(1);
    expect(eventsFor(plugin, 'tts:stream:end')).toHaveLength(0);
    expect(eventsFor(plugin, 'tts:playback:ended')).toHaveLength(1);
  });

  test('consumes a delayed destroy error until close without a second terminal or leaked listener', async () => {
    const stream = new EventEmitter();
    stream.destroyed = false;
    stream.readableEnded = false;
    stream.destroy = jest.fn(() => {
      stream.destroyed = true;
      setImmediate(() => {
        stream.emit('error', new Error('fixture destroy callback error'));
        stream.emit('close');
      });
      return stream;
    });
    const { plugin, item, playbackId } = createStreamingPlayback(stream, { streamEofWatchdogMs: 10 });
    const playback = plugin._playAudio(item);
    await waitForStreamListeners(stream);
    const streamClosed = waitForStreamClose(stream);
    stream.emit('data', Buffer.from('partial fixture'));

    await playback;
    await streamClosed;

    expect(stream.destroy).toHaveBeenCalledTimes(1);
    expect(eventsFor(plugin, 'tts:stream:abort')).toEqual([
      { playbackId, reason: 'stream-eof-timeout' }
    ]);
    expect(eventsFor(plugin, 'tts:stream:end')).toEqual([]);
    expect(eventsFor(plugin, 'tts:playback:ended')).toEqual([
      expect.objectContaining({ playbackId, rendererOutcome: 'failed', reason: 'stream-eof-timeout' })
    ]);
    expect(['data', 'end', 'error', 'close'].map(event => stream.listenerCount(event))).toEqual([0, 0, 0, 0]);
  });
});
