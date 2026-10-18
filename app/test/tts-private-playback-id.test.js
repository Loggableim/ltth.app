'use strict';

const TTSPlugin = require('../plugins/tts/main');
const QueueManager = require('../plugins/tts/utils/queue-manager');

function createSpeakPlugin() {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  const queueManager = new QueueManager({
    maxQueueSize: 10,
    rateLimit: 10,
    rateLimitWindow: 60,
    priorityAgingEnabled: false
  }, logger);
  const ids = ['private-playback-id', 'public-playback-id', 'prepared-playback-id'];
  queueManager._generateId = jest.fn(() => ids.shift());

  const plugin = Object.create(TTSPlugin.prototype);
  plugin.api = {
    getDatabase: () => ({ getSetting: () => 'true' }),
    emit: jest.fn()
  };
  plugin.logger = logger;
  plugin.config = {
    messagePrefixFilter: [],
    profanityFilter: 'none',
    stripEmojis: false,
    maxTextLength: 1000,
    announceUsername: false,
    teamMinLevel: 0,
    autoLanguageDetection: false,
    defaultEngine: 'google',
    defaultVoice: 'fixture-voice',
    fallbackLanguage: 'en-US',
    enableAutoFallback: false,
    performanceMode: 'quality',
    volume: 80,
    speed: 1,
    duckOtherAudio: false,
    eventTTS: {}
  };
  plugin.permissionManager = {
    checkPermission: jest.fn(() => ({ allowed: true })),
    getUserSettings: jest.fn(() => null)
  };
  plugin.profanityFilter = {
    filter: jest.fn(text => ({ filtered: text, hasProfanity: false, action: 'allow', matches: [] }))
  };
  plugin.engines = { google: {} };
  plugin.queueManager = queueManager;
  plugin._maybeAssignTeamLevelFishVoice = jest.fn(() => false);
  plugin._synthesizeWithCircuit = jest.fn().mockResolvedValue(Buffer.from('fixture-audio'));
  plugin._logDebug = jest.fn();
  return { plugin, queueManager };
}

describe('TTS private playback ID contract', () => {
  test('QueueManager returns the exact generated ID stored on the queued item', () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const manager = new QueueManager({ maxQueueSize: 10, rateLimit: 10, rateLimitWindow: 60 }, logger);
    manager._generateId = jest.fn(() => 'fixture-playback-id');
    manager._checkRateLimit = jest.fn(() => true);

    const item = {
      userId: 'interactive-story',
      username: 'Story Narrator (interactive-story)',
      text: 'Fixture narration',
      priority: 50,
      bypassDuplicateFilter: true
    };
    const result = manager.enqueue(item);

    expect(result).toEqual(expect.objectContaining({ success: true, id: 'fixture-playback-id' }));
    expect(manager.queue[0]).toBe(item);
    expect(manager.queue[0].id).toBe(result.id);
  });

  test('only the direct plugin method opts into playback IDs', async () => {
    const plugin = Object.create(TTSPlugin.prototype);
    const params = { text: 'Fixture narration' };
    plugin._speak = jest.fn(async (_params, includePlaybackId) => ({
      success: true,
      ...(includePlaybackId ? { playbackId: 'fixture-playback-id' } : {})
    }));

    const publicResult = await plugin.speak(params);
    const privateResult = await plugin._speakForPlugin(params);

    expect(plugin._speak).toHaveBeenNthCalledWith(1, params, false);
    expect(plugin._speak).toHaveBeenNthCalledWith(2, params, true);
    expect(publicResult).toEqual({ success: true });
    expect(privateResult).toEqual({ success: true, playbackId: 'fixture-playback-id' });
  });

  test('real speak body returns the queued item ID only to the private caller', async () => {
    const { plugin, queueManager } = createSpeakPlugin();
    const params = {
      text: 'Private narration fixture',
      userId: 'interactive-story',
      username: 'Story Narrator (interactive-story)',
      voiceId: 'fixture-voice',
      engine: 'google',
      source: 'interactive-story',
      teamLevel: 999,
      priority: 50
    };

    const privateResult = await plugin._speakForPlugin(params);
    const publicResult = await plugin.speak({ ...params, text: 'Public response fixture' });
    const preparedResult = await plugin.enqueuePreparedAudio({
      ...params,
      text: 'Prepared audio fixture',
      audioData: Buffer.from('prepared-fixture')
    });

    expect(privateResult).toEqual(expect.objectContaining({ success: true, queued: true, playbackId: 'private-playback-id' }));
    expect(queueManager.queue[0].id).toBe(privateResult.playbackId);
    expect(publicResult).toMatchObject({ success: true, queued: true });
    expect(publicResult).not.toHaveProperty('playbackId');
    expect(publicResult).not.toHaveProperty('id');
    expect(queueManager.queue[1].id).toBe('public-playback-id');
    expect(preparedResult).toMatchObject({ success: true, queued: true, id: 'prepared-playback-id' });
    expect(queueManager.queue[2].id).toBe(preparedResult.id);

    const queuedEvents = plugin.api.emit.mock.calls.filter(([event]) => event === 'tts:queued');
    expect(queuedEvents.length).toBeGreaterThan(0);
    for (const [, payload] of queuedEvents) {
      expect(payload).not.toHaveProperty('playbackId');
      expect(payload).not.toHaveProperty('id');
    }
  });
});
