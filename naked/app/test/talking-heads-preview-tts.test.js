/**
 * Test: Talking Heads TTS Preview Integration
 * Verifies that TTS preview requests properly pass source field and are logged
 */

const TalkingHeadsPlugin = require('../plugins/talking-heads/main.js');

describe('Talking Heads TTS Preview', () => {
  let mockApi;
  let mockLogger;
  let mockDb;
  let mockIo;
  let plugin;
  let pluginLoaderEmitSpy;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    mockDb = {
      getSetting: jest.fn(),
      prepare: jest.fn(() => ({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn(() => [])
      }))
    };

    mockIo = {
      on: jest.fn(),
      emit: jest.fn()
    };

    pluginLoaderEmitSpy = jest.fn();

    mockApi = {
      logger: mockLogger,
      getSocketIO: jest.fn(() => mockIo),
      getDatabase: jest.fn(() => mockDb),
      getConfig: jest.fn(() => ({ enabled: true, defaultStyle: 'cartoon' })),
      setConfig: jest.fn(),
      getPluginDataDir: jest.fn(() => '/tmp/test'),
      ensurePluginDataDir: jest.fn(),
      registerRoute: jest.fn(),
      registerSocket: jest.fn(),
      registerTikTokEvent: jest.fn(),
      emit: jest.fn(),
      pluginLoader: {
        emit: pluginLoaderEmitSpy,
        on: jest.fn(),
        removeListener: jest.fn()
      }
    };

    plugin = new TalkingHeadsPlugin(mockApi);
  });

  test('TTS playback bridge logs preview requests', async () => {
    // Initialize the plugin to register the playback bridge
    await plugin.init();

    // Get the registered handler for tts:playback:started
    const onCalls = mockApi.pluginLoader.on.mock.calls;
    const startedHandler = onCalls.find(call => call[0] === 'tts:playback:started');
    
    expect(startedHandler).toBeDefined();
    
    // Simulate a preview TTS playback event
    const previewPayload = {
      userId: 'preview_user',
      username: 'Preview User',
      text: 'Test preview text',
      source: 'talking-heads-preview',
      duration: 5000
    };

    // Call the handler
    await startedHandler[1](previewPayload);

    // Verify that preview request was logged
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining('Preview TTS request received')
    );
  });

  test('TTS playback bridge allows preview even when plugin is disabled', async () => {
    // Create plugin with disabled config
    const disabledApi = {
      ...mockApi,
      getConfig: jest.fn(() => ({ enabled: false, defaultStyle: 'cartoon' }))
    };

    const disabledPlugin = new TalkingHeadsPlugin(disabledApi);
    await disabledPlugin.init();

    // Get the registered handler
    const onCalls = disabledApi.pluginLoader.on.mock.calls;
    const startedHandler = onCalls.find(call => call[0] === 'tts:playback:started');
    
    // Simulate preview request (should work even when disabled)
    const previewPayload = {
      userId: 'preview_user',
      username: 'Preview User',
      text: 'Test preview text',
      source: 'talking-heads-preview',
      duration: 5000
    };

    // Should not throw and should handle the preview
    await expect(startedHandler[1](previewPayload)).resolves.not.toThrow();

    // Verify that preview request was logged
    expect(disabledApi.logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Preview TTS request received')
    );
  });

  test('TTS playback bridge blocks non-preview requests when plugin is disabled', async () => {
    // Create plugin with disabled config
    const disabledApi = {
      ...mockApi,
      getConfig: jest.fn(() => ({ enabled: false, defaultStyle: 'cartoon' }))
    };

    const disabledPlugin = new TalkingHeadsPlugin(disabledApi);
    await disabledPlugin.init();

    // Get the registered handler
    const onCalls = disabledApi.pluginLoader.on.mock.calls;
    const startedHandler = onCalls.find(call => call[0] === 'tts:playback:started');
    
    // Simulate non-preview request (should be blocked)
    const normalPayload = {
      userId: 'normal_user',
      username: 'Normal User',
      text: 'Normal TTS text',
      source: 'chat',
      duration: 5000
    };

    // Should return early without processing
    await startedHandler[1](normalPayload);

    // Verify preview log was NOT created (since this isn't a preview)
    expect(disabledApi.logger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('Preview TTS request received')
    );
  });
});
