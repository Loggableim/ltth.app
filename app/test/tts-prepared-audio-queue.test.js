const TTSPlugin = require('../plugins/tts/main');

describe('TTS prepared audio queue', () => {
  test('enqueuePreparedAudio queues cached Fish.audio data without synthesizing again', async () => {
    const plugin = Object.create(TTSPlugin.prototype);
    plugin.api = {
      getDatabase: jest.fn(() => ({ getSetting: jest.fn(() => 'true') })),
      emit: jest.fn()
    };
    plugin.config = {
      defaultFishaudioEmotion: 'neutral',
      defaultFishaudioPitch: 0,
      defaultFishaudioVolume: 1,
      volume: 80,
      speed: 1,
      performanceMode: 'quality',
      duckOtherAudio: false
    };
    plugin.queueManager = {
      enqueue: jest.fn().mockReturnValue({
        success: true,
        id: 'queue-1',
        position: 1,
        queueSize: 1,
        estimatedWaitMs: 0
      })
    };
    plugin._synthesizeWithCircuit = jest.fn();
    plugin._logDebug = jest.fn();
    plugin.logger = { info: jest.fn(), error: jest.fn() };

    const result = await plugin.enqueuePreparedAudio({
      text: 'Willkommen, banuki.',
      userId: 'banuki',
      username: 'banuki',
      voiceId: 'fish-dumbledore-de',
      engine: 'fishaudio',
      audioData: 'base64-audio',
      priority: 91,
      volume: 73,
      speed: 1.1,
      source: 'animazingpal:greeting-cache'
    });

    expect(result).toEqual(expect.objectContaining({
      success: true,
      cached: true,
      queued: true,
      id: 'queue-1'
    }));
    expect(plugin._synthesizeWithCircuit).not.toHaveBeenCalled();
    expect(plugin.queueManager.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'banuki',
      username: 'banuki',
      text: 'Willkommen, banuki.',
      voice: 'fish-dumbledore-de',
      engine: 'fishaudio',
      audioData: 'base64-audio',
      isStreaming: false,
      source: 'animazingpal:greeting-cache',
      priority: 91,
      volume: 73,
      speed: 1.1,
      bypassDuplicateFilter: true
    }));
  });
});
