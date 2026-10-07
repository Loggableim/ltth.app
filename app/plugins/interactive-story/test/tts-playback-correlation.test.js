'use strict';

const InteractiveStoryPlugin = require('../main');

function createStoryPlugin(ttsPlugin) {
  const busHandlers = new Map();
  const socketHandlers = new Map();
  const plugin = Object.create(InteractiveStoryPlugin.prototype);
  plugin.api = {
    getPlugin: jest.fn(() => ttsPlugin),
    on: jest.fn((event, handler) => busHandlers.set(event, handler)),
    removeListener: jest.fn(),
    log: jest.fn(),
    registerSocket: jest.fn((event, handler) => socketHandlers.set(event, handler))
  };
  plugin.logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  plugin.ttsPlaybackResolvers = new Map();
  plugin.ttsPlaybackEarlyEnds = new Map();
  plugin._ttsPlaybackTrackingDestroyed = false;
  plugin.TTS_USERNAME = 'Story Narrator (interactive-story)';
  plugin.TTS_PLAYBACK_TIMEOUT_MS = 5000;
  plugin.TTS_EARLY_END_BUFFER_TTL_MS = 1000;
  plugin.TTS_EARLY_END_BUFFER_MAX = 4;
  plugin._loadConfig = jest.fn(() => ({}));
  plugin._registerSocketHandlers();
  return { plugin, busHandlers, socketHandlers };
}

function ended(playbackId, overrides = {}) {
  return {
    playbackId,
    userId: 'interactive-story',
    username: 'Story Narrator (interactive-story)',
    source: 'interactive-story',
    rendererOutcome: 'ended',
    ...overrides
  };
}

describe('Interactive Story TTS playback correlation', () => {
  test('uses the internal TTS plugin method and consumes an early failed terminal event by exact ID', async () => {
    let story;
    const ttsPlugin = {
      _speakForPlugin: jest.fn(async params => {
        story._handleTtsPlaybackEnded(ended('early-playback', { rendererOutcome: 'failed' }));
        return { success: true, queued: true, playbackId: 'early-playback' };
      })
    };
    ({ plugin: story } = createStoryPlugin(ttsPlugin));

    const result = await story._speakThroughSystemTTS('A fixture story sentence.');

    expect(result).toMatchObject({ success: true, playbackId: 'early-playback' });
    expect(story.logger.info).toHaveBeenCalledWith('TTS playback failed - continuing story flow');
    expect(ttsPlugin._speakForPlugin).toHaveBeenCalledWith(expect.objectContaining({
      text: 'A fixture story sentence.',
      userId: 'interactive-story',
      username: story.TTS_USERNAME,
      source: 'interactive-story',
      teamLevel: 999,
      priority: 50
    }));
    expect(story.ttsPlaybackEarlyEnds.size).toBe(0);
    expect(story.ttsPlaybackResolvers.size).toBe(0);
  });

  test('waits only for the exact local playback ID and rejects foreign or late events', async () => {
    const ttsPlugin = { _speakForPlugin: jest.fn().mockResolvedValue({ success: true, playbackId: 'playback-b' }) };
    const { plugin, busHandlers, socketHandlers } = createStoryPlugin(ttsPlugin);
    const speakPromise = plugin._speakThroughSystemTTS('Fixture narration');
    await Promise.resolve();
    await Promise.resolve();

    expect(plugin.ttsPlaybackResolvers.has('playback-b')).toBe(true);
    expect(socketHandlers.has('tts:playback:ended')).toBe(false);
    expect(busHandlers.has('tts:playback:ended')).toBe(true);

    busHandlers.get('tts:playback:ended')(ended('playback-b', { userId: 'foreign-user' }));
    busHandlers.get('tts:playback:ended')(ended('playback-a'));
    await Promise.resolve();
    expect(plugin.ttsPlaybackResolvers.has('playback-b')).toBe(true);

    busHandlers.get('tts:playback:ended')(ended('playback-b'));
    await expect(speakPromise).resolves.toMatchObject({ success: true, playbackId: 'playback-b' });
    expect(plugin.ttsPlaybackResolvers.size).toBe(0);

    // A late end for A must not complete a future B waiter.
    const nextWaiter = plugin._waitForSystemTtsPlayback('playback-b');
    busHandlers.get('tts:playback:ended')(ended('playback-a'));
    expect(plugin.ttsPlaybackResolvers.has('playback-b')).toBe(true);
    busHandlers.get('tts:playback:ended')(ended('playback-b'));
    await expect(nextWaiter).resolves.toMatchObject({ playbackId: 'playback-b' });
    plugin._cleanupTtsPlaybackTracking();
  });

  test('timeout and destroy cleanup clear waiter and early-event timers', async () => {
    const { plugin } = createStoryPlugin({ _speakForPlugin: jest.fn() });
    plugin.TTS_PLAYBACK_TIMEOUT_MS = 1;
    await expect(plugin._waitForSystemTtsPlayback('timeout-id')).resolves.toMatchObject({ timeout: true });
    expect(plugin.ttsPlaybackResolvers.size).toBe(0);

    plugin._handleTtsPlaybackEnded(ended('buffered-id'));
    expect(plugin.ttsPlaybackEarlyEnds.size).toBe(1);
    await plugin.destroy();
    expect(plugin.ttsPlaybackEarlyEnds.size).toBe(0);
    expect(plugin.api.removeListener).toHaveBeenCalledWith('tts:playback:ended', expect.any(Function));
  });

  test('destroy during deferred TTS enqueue cannot register a waiter after unload', async () => {
    let resolveSpeak;
    const ttsPlugin = {
      _speakForPlugin: jest.fn(() => new Promise(resolve => { resolveSpeak = resolve; }))
    };
    const { plugin } = createStoryPlugin(ttsPlugin);
    const speakPromise = plugin._speakThroughSystemTTS('Deferred fixture narration');
    await Promise.resolve();

    await plugin.destroy();
    resolveSpeak({ success: true, queued: true, playbackId: 'after-destroy-id' });

    await expect(speakPromise).resolves.toMatchObject({ success: true, playbackId: 'after-destroy-id' });
    expect(plugin._ttsPlaybackTrackingDestroyed).toBe(true);
    expect(plugin.ttsPlaybackResolvers.size).toBe(0);
    expect(plugin.ttsPlaybackEarlyEnds.size).toBe(0);
  });

  test('unavailable or disabled TTS leaves no waiter behind', async () => {
    const missing = createStoryPlugin(null).plugin;
    await expect(missing._speakThroughSystemTTS('Fixture text')).resolves.toMatchObject({ success: false });
    expect(missing.ttsPlaybackResolvers.size).toBe(0);

    const disabled = createStoryPlugin({
      _speakForPlugin: jest.fn().mockResolvedValue({ success: false, error: 'TTS disabled' })
    }).plugin;
    await expect(disabled._speakThroughSystemTTS('Fixture text')).resolves.toMatchObject({ success: false });
    expect(disabled.ttsPlaybackResolvers.size).toBe(0);
  });
});
