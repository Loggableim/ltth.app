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
    processChat: jest.fn().mockResolvedValue({ text: 'Antwort vom Host-Brain.' })
  };
  return { plugin, ttsPlugin };
}

describe('Sidekick host speech to AnimazingPal integration', () => {
  test('default host speech event reaches AnimazingPal chat brain path with consumed comment field', async () => {
    const coordinator = new ConversationCoordinator({ hostName: 'Streamer' });
    const { plugin, ttsPlugin } = createAnimazingPal();
    const decision = coordinator.shouldAcceptHostSpeech('Kannst du das im Chat sehen?', { now: 1000 });
    const event = coordinator.buildHostSpeechEvent('Kannst du das im Chat sehen?', {
      confidence: 0.91,
      provider: 'future-asr'
    });

    const result = await plugin.processSidekickEvent(event.eventType, event, {
      ...decision,
      source: 'sidekick-host-speech'
    });

    expect(event).toEqual(expect.objectContaining({
      eventType: 'chat',
      username: 'Streamer',
      userId: 'sidekick-host',
      source: 'host-mic',
      isHostSpeech: true,
      message: 'Kannst du das im Chat sehen?',
      comment: 'Kannst du das im Chat sehen?'
    }));
    expect(result).toEqual(expect.objectContaining({
      handled: true,
      responded: true,
      spokenText: 'Antwort vom Host-Brain.'
    }));
    expect(plugin.brainEngine.processChat).toHaveBeenCalledWith(
      'Streamer',
      'Kannst du das im Chat sehen?',
      expect.objectContaining({
        forceRespond: true,
        decision: expect.objectContaining({ reason: 'sidekick-selected' })
      })
    );
    expect(ttsPlugin.speak).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Antwort vom Host-Brain.',
      engine: 'fishaudio',
      username: 'Streamer'
    }));
  });
});
