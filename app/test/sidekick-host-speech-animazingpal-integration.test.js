const AnimazingPalPlugin = require('../plugins/animazingpal/main');
const { normalizeLiveHostConfig } = require('../plugins/animazingpal/brain/live-host-config');
const { ConversationCoordinator } = require('../plugins/sidekick/backend/conversation-coordinator');

function createAnimazingPal() {
  const ttsPlugin = { speak: jest.fn().mockResolvedValue({ success: true, id: 'tts-1' }) };
  const plugin = Object.create(AnimazingPalPlugin.prototype);
  plugin.api = {
    getPluginInstance: jest.fn(id => id === 'tts' ? ttsPlugin : null),
    log: jest.fn(),
    emit: jest.fn()
  };
  plugin.config = plugin.getDefaultConfig();
  plugin.config.brain.liveHost = normalizeLiveHostConfig({
    enabled: true,
    tts: { voiceId: 'fish-host' },
    events: {
      chat: {
        cooldownMs: 0,
        brainEnabled: true,
        templateEnabled: false,
        avatarActionEnabled: false
      }
    }
  });
  plugin.config.brain.liveHost.operatingMode = 'sidekick';
  plugin.ensureLiveHostRuntime = jest.fn();
  plugin.recordLiveHostEventOutcome = jest.fn();
  plugin.isDuplicateLiveHostEvent = jest.fn().mockReturnValue({ duplicate: false });
  plugin.canUseLiveHostResponseSlot = jest.fn().mockReturnValue(true);
  plugin.recordLiveHostResponseSlot = jest.fn();
  plugin.speechState = { markStarted: jest.fn(), markEnded: jest.fn() };
  plugin.brainEngine = {
    processHostSpeech: jest.fn().mockResolvedValue({ text: 'Antwort vom Host-Brain.' }),
    processChat: jest.fn()
  };
  return { plugin, ttsPlugin };
}

describe('Sidekick host speech to AnimazingPal integration', () => {
  test('default host speech event reaches AnimazingPal dedicated host brain path with consumed comment field', async () => {
    const coordinator = new ConversationCoordinator({
      hostName: 'Streamer',
      hostReplyProbability: 1,
      hostMinConfidence: 0
    });
    const { plugin, ttsPlugin } = createAnimazingPal();
    const decision = coordinator.shouldAcceptHostSpeech('Kannst du das im Chat sehen?', { now: 1000 });
    const event = coordinator.buildHostSpeechEvent('Kannst du das im Chat sehen?', {
      confidence: 0.91,
      provider: 'future-asr'
    });

    const originalRandom = Math.random;
    Math.random = () => 0;
    const result = await plugin.processSidekickHostSpeech(event, {
      ...decision,
      source: 'sidekick-host-speech'
    });
    Math.random = originalRandom;

    expect(event).toEqual(expect.objectContaining({
      eventType: 'chat',
      username: 'Streamer',
      userId: 'sidekick-host',
      source: 'host-mic',
      isHostSpeech: true,
      message: 'Kannst du das im Chat sehen?',
      comment: 'Kannst du das im Chat sehen?',
      conversationState: expect.objectContaining({
        turnCount: expect.any(Number)
      })
    }));
    expect(result).toEqual(expect.objectContaining({
      handled: true,
      responded: true,
      spokenText: 'Antwort vom Host-Brain.'
    }));
    expect(plugin.brainEngine.processHostSpeech).toHaveBeenCalledWith(
      'Streamer',
      'Kannst du das im Chat sehen?',
      expect.objectContaining({
        forceRespond: false,
        liveContext: expect.objectContaining({
          conversationState: expect.objectContaining({
            turnCount: expect.any(Number)
          }),
          conversationHistory: expect.any(Array)
        }),
        decision: expect.objectContaining({ reason: 'accepted' })
      })
    );
    expect(plugin.brainEngine.processChat).not.toHaveBeenCalled();
    expect(ttsPlugin.speak).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Antwort vom Host-Brain.',
      engine: 'fishaudio',
      username: 'Streamer'
    }));
  });

  test('does not speak when Sidekick decision explicitly blocks host response', async () => {
    const coordinator = new ConversationCoordinator({ hostName: 'Streamer' });
    const { plugin, ttsPlugin } = createAnimazingPal();
    const decision = {
      ...coordinator.shouldAcceptHostSpeech('Kannst du das im Chat sehen?', { now: 1000 }),
      respond: false,
      reason: 'too_short'
    };
    const event = coordinator.buildHostSpeechEvent('Kannst du das im Chat sehen?', {
      confidence: 0.91,
      provider: 'future-asr'
    });

    const result = await plugin.processSidekickHostSpeech(event, decision);

    expect(result).toEqual(expect.objectContaining({
      handled: true,
      responded: false,
      reason: 'too_short'
    }));
    expect(plugin.brainEngine.processHostSpeech).not.toHaveBeenCalled();
    expect(ttsPlugin.speak).not.toHaveBeenCalled();
  });
});
