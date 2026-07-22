const SttTickerPlugin = require('../plugins/stt-ticker/main');
const DeepgramAsrClient = require('../plugins/stt-ticker/backend/asr/deepgram-client');
const ElevenLabsAsrClient = require('../plugins/stt-ticker/backend/asr/elevenlabs-client');
const fs = require('fs');
const path = require('path');

const SECRETS = {
  deepgram: 'deepgram-secret-value',
  elevenlabs: 'elevenlabs-secret-value',
  fish: 'fish-secret-value',
  translation: 'translation-secret-value'
};

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    sendFile() { return this; }
  };
}

function createHarness() {
  const routes = {};
  const api = {
    getSocketIO: () => ({ emit: jest.fn() }),
    log: jest.fn(),
    registerRoute: jest.fn((method, route, handler) => {
      routes[`${method}:${route}`] = handler;
    })
  };
  const plugin = new SttTickerPlugin(api);
  plugin.config = {
    enabled: true,
    asr: {
      provider: 'deepgram',
      deepgramApiKey: SECRETS.deepgram,
      elevenlabsApiKey: SECRETS.elevenlabs,
      fishaudioApiKey: SECRETS.fish,
      deepgramModel: 'nova-2'
    },
    vad: { enabled: true },
    multiLanguage: { enabled: true, outputLanguages: ['en'] },
    translation: {
      enabled: true,
      apiKey: SECRETS.translation,
      model: 'deepseek-v4-flash'
    },
    vrchatChatbox: { enabled: false }
  };
  plugin.configManager = {
    update: jest.fn(() => plugin.config)
  };
  plugin.asrPipeline = {
    updateConfig: jest.fn(),
    getDeepgramApiKey: jest.fn(() => SECRETS.deepgram),
    getElevenLabsApiKey: jest.fn(() => SECRETS.elevenlabs),
    getCredentialStatus: jest.fn(() => ({
      deepgram: { configured: true, source: 'config' },
      elevenlabs: { configured: true, source: 'config' },
      fishaudio: { configured: true, source: 'config' }
    })),
    getStatus: jest.fn(() => ({
      provider: 'deepgram',
      deepgramConfigured: true,
      deepgramKeySource: 'config',
      elevenlabsConfigured: true,
      elevenlabsKeySource: 'config',
      fishaudioConfigured: true,
      fishaudioKeySource: 'config',
      deepgramModel: 'nova-2',
      diagnostics: {}
    }))
  };
  plugin.textBuffer = { updateConfig: jest.fn(), getStats: jest.fn(() => ({})) };
  plugin.translator = {
    updateConfig: jest.fn(),
    getStatus: jest.fn(() => ({ enabled: true, configured: true, model: 'deepseek-v4-flash' })),
    getLanguages: jest.fn(() => []),
    fetchModels: jest.fn(() => [])
  };
  plugin._registerRoutes();
  return { plugin, routes };
}

function expectNoSecrets(value) {
  const serialized = JSON.stringify(value);
  Object.values(SECRETS).forEach(secret => expect(serialized).not.toContain(secret));
}

describe('STT Ticker secret masking', () => {
  test('safe config and status never serialize provider or translation keys', () => {
    const { plugin } = createHarness();

    const safe = plugin._getSafeConfig();
    expectNoSecrets(safe);
    expectNoSecrets(plugin._getStatus());
    expect(safe.asr).toMatchObject({
      deepgramApiKey: '__KEEP__',
      elevenlabsApiKey: '__KEEP__',
      fishaudioApiKey: '__KEEP__',
      deepgramApiKeyConfigured: true,
      elevenlabsApiKeyConfigured: true,
      fishaudioApiKeyConfigured: true
    });
    expect(safe.translation).toMatchObject({
      apiKey: '__KEEP__',
      apiKeyConfigured: true
    });
  });

  test('settings responses preserve keys with __KEEP__ without returning their values', () => {
    const { plugin, routes } = createHarness();
    const asrResponse = createResponse();
    routes['post:/api/stt-ticker/asr/settings']({
      body: {
        asr: {
          provider: 'deepgram',
          deepgramApiKey: '__KEEP__',
          elevenlabsApiKey: '__KEEP__',
          fishaudioApiKey: '__KEEP__'
        }
      }
    }, asrResponse);

    expect(plugin.configManager.update).toHaveBeenCalledWith({
      asr: { provider: 'deepgram' }
    });
    expectNoSecrets(asrResponse.body);
    expect(asrResponse.body.asr.deepgramApiKey).toBe('__KEEP__');

    const multilangResponse = createResponse();
    routes['post:/api/stt-ticker/multilang/settings']({ body: {} }, multilangResponse);
    expectNoSecrets(multilangResponse.body);
    expect(multilangResponse.body.translation.apiKey).toBe('__KEEP__');
    expect(multilangResponse.body.asr.deepgramApiKey).toBe('__KEEP__');
  });

  test('external credential status exposes only configured and source metadata', () => {
    const { plugin } = createHarness();
    plugin.config.asr.deepgramApiKey = '';
    plugin.config.asr.elevenlabsApiKey = '';
    plugin.config.asr.fishaudioApiKey = '';
    plugin.asrPipeline.getCredentialStatus.mockReturnValue({
      deepgram: { configured: true, source: 'environment' },
      elevenlabs: { configured: true, source: 'file' },
      fishaudio: { configured: false, source: null }
    });
    plugin.asrPipeline.getStatus.mockReturnValue({
      provider: 'deepgram',
      deepgramConfigured: true,
      deepgramKeySource: 'environment',
      elevenlabsConfigured: true,
      elevenlabsKeySource: 'file',
      fishaudioConfigured: false,
      fishaudioKeySource: null,
      diagnostics: {}
    });

    const safe = plugin._getSafeConfig();
    const status = plugin._getStatus();

    expect(safe.asr).toMatchObject({
      deepgramApiKey: '__KEEP__',
      deepgramApiKeyConfigured: true,
      deepgramApiKeySource: 'environment',
      elevenlabsApiKey: '__KEEP__',
      elevenlabsApiKeyConfigured: true,
      elevenlabsApiKeySource: 'file',
      fishaudioApiKey: '',
      fishaudioApiKeyConfigured: false,
      fishaudioApiKeySource: null
    });
    expect(status.asr).toMatchObject({
      deepgramKeySource: 'environment',
      elevenlabsKeySource: 'file',
      fishaudioKeySource: null
    });
    expectNoSecrets({ safe, status });
  });

  test('provider key tests use the resolved credential when no key is submitted', async () => {
    const deepgramTest = jest.spyOn(DeepgramAsrClient.prototype, 'testConnection')
      .mockResolvedValue({ ok: true, status: 200 });
    const elevenLabsTest = jest.spyOn(ElevenLabsAsrClient.prototype, 'testConnection')
      .mockResolvedValue({ ok: true, status: 200 });
    const { plugin, routes } = createHarness();
    plugin.config.asr.deepgramApiKey = '';
    plugin.config.asr.elevenlabsApiKey = '';

    const deepgramResponse = createResponse();
    await routes['post:/api/stt-ticker/asr/test-deepgram']({ body: {} }, deepgramResponse);
    const elevenLabsResponse = createResponse();
    await routes['post:/api/stt-ticker/asr/test-elevenlabs']({ body: {} }, elevenLabsResponse);

    expect(plugin.asrPipeline.getDeepgramApiKey).toHaveBeenCalled();
    expect(plugin.asrPipeline.getElevenLabsApiKey).toHaveBeenCalled();
    expect(deepgramTest).toHaveBeenCalled();
    expect(elevenLabsTest).toHaveBeenCalled();
    expectNoSecrets({ deepgramResponse: deepgramResponse.body, elevenLabsResponse: elevenLabsResponse.body });

    deepgramTest.mockRestore();
    elevenLabsTest.mockRestore();
  });

  test('browser pages do not fetch stored secrets or place translation keys in URLs', () => {
    const capture = fs.readFileSync(
      path.join(__dirname, '../plugins/stt-ticker/capture.html'),
      'utf8'
    );
    const ui = fs.readFileSync(
      path.join(__dirname, '../plugins/stt-ticker/ui.html'),
      'utf8'
    );

    expect(capture).not.toContain('/api/settings');
    expect(capture).not.toContain('translationConfig.apiKey');
    expect(capture).not.toContain('translator/models?apiKey');
    expect(ui).not.toContain('translator/models?apiKey');
    expect(ui).toContain("apiKeyField.value = tc.apiKeyConfigured ? '__KEEP__' : ''");
  });
});
