const TTSPlugin = require('../plugins/tts/main');

describe('TTS global disable message', () => {
  test('returns a Quick Actions specific error when tts_enabled is false', async () => {
    const plugin = Object.create(TTSPlugin.prototype);
    const logDebug = jest.fn();
    const info = jest.fn();

    plugin.api = {
      getDatabase: () => ({
        getSetting: () => 'false'
      })
    };
    plugin._logDebug = logDebug;
    plugin.logger = { info, warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

    const result = await plugin.speak({
      text: 'Hello',
      source: 'preview'
    });

    expect(result).toEqual({
      success: false,
      error: 'TTS is disabled via Quick Actions',
      blocked: true,
      reason: 'tts_disabled',
      disabledBy: 'quick_actions'
    });
    expect(logDebug).toHaveBeenCalledWith(
      'SPEAK_BLOCKED',
      'TTS is disabled via Quick Actions',
      expect.objectContaining({
        tts_enabled: false,
        disabledBy: 'quick_actions',
        source: 'preview'
      })
    );
    expect(info).toHaveBeenCalledWith('TTS: Blocked - TTS is disabled via Quick Actions (source: preview)');
  });
});
