const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function createConfigApi(storedConfig) {
  return {
    getConfig: jest.fn(() => storedConfig),
    setConfig: jest.fn(),
    log: jest.fn()
  };
}

async function renderUiStatus(asr) {
  const html = fs.readFileSync(
    path.join(__dirname, '../plugins/stt-ticker/ui.html'),
    'utf8'
  );
  const { DEFAULT_CONFIG } = require('../plugins/stt-ticker/backend/config');
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  const status = {
    enabled: true,
    asr,
    translation: { enabled: false, configured: false },
    buffer: { segmentCount: 0 },
    vrchatChatbox: { enabled: false, bridgeAvailable: false },
    config
  };
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://127.0.0.1/stt-ticker/ui',
    beforeParse(window) {
      window.fetch = async input => {
        const url = String(input);
        let body = { success: true };
        if (url === '/api/stt-ticker/status') body = { success: true, status };
        else if (url === '/api/stt-ticker/translator/languages') body = { success: true, languages: [] };
        else if (url === '/api/stt-ticker/translator/models') body = { success: true, models: [] };
        else if (url.endsWith('/models')) body = { success: true, models: [] };
        return { json: async () => body };
      };
    }
  });

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const hint = dom.window.document.getElementById('provider-hint').textContent;
    if (hint) return dom;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return dom;
}

describe('STT Ticker Fish-first configuration', () => {
  test('new configurations default to Fish.audio', () => {
    const { ConfigManager } = require('../plugins/stt-ticker/backend/config');
    const config = new ConfigManager(createConfigApi(null)).load();

    expect(config.asr).toMatchObject({
      provider: 'fish.audio',
      deepgramModel: 'nova-3'
    });
  });

  test('migrates legacy auto to Fish.audio without changing explicit providers', () => {
    const { ConfigManager } = require('../plugins/stt-ticker/backend/config');
    const autoApi = createConfigApi({ asr: { provider: 'auto' } });
    const deepgramApi = createConfigApi({ asr: { provider: 'deepgram' } });
    const elevenLabsApi = createConfigApi({ asr: { provider: 'elevenlabs' } });

    expect(new ConfigManager(autoApi).load().asr.provider).toBe('fish.audio');
    expect(autoApi.setConfig).toHaveBeenCalledWith(
      'config',
      expect.objectContaining({ asr: expect.objectContaining({ provider: 'fish.audio' }) })
    );
    expect(new ConfigManager(deepgramApi).load().asr.provider).toBe('deepgram');
    expect(new ConfigManager(elevenLabsApi).load().asr.provider).toBe('elevenlabs');
  });

  test('treats auto as Fish and activates cloud providers only after explicit selection', () => {
    const AsrPipeline = require('../plugins/stt-ticker/backend/asr-pipeline');
    const config = {
      asr: {
        provider: 'auto',
        deepgramApiKey: 'deepgram-secret',
        elevenlabsApiKey: 'elevenlabs-secret'
      }
    };
    const pipeline = new AsrPipeline({}, config, {
      info() {}, warn() {}, error() {}, debug() {}
    });

    expect(pipeline.getEffectiveProvider()).toBe('fish.audio');
    pipeline.updateConfig({ asr: { ...config.asr, provider: 'deepgram' } });
    expect(pipeline.getEffectiveProvider()).toBe('deepgram');
    pipeline.updateConfig({ asr: { ...config.asr, provider: 'elevenlabs' } });
    expect(pipeline.getEffectiveProvider()).toBe('elevenlabs');
  });

  test('shows Fish.audio as the initial UI provider and keeps secrets masked', () => {
    const html = fs.readFileSync(
      path.join(__dirname, '../plugins/stt-ticker/ui.html'),
      'utf8'
    );
    const dom = new JSDOM(html);
    const provider = dom.window.document.getElementById('asr-provider');

    expect(provider.value).toBe('fish.audio');
    expect(provider.selectedOptions[0].textContent).toContain('Fish.audio');
    expect(provider.dataset.deepgramDefault).toBe('nova-3');
    expect(html).toContain("dgKeyField.value = asr.deepgramApiKeyConfigured ? '__KEEP__' : ''");
    expect(html).toContain("fishKeyField.value = asr.fishaudioApiKeyConfigured ? '__KEEP__' : ''");
  });

  test('visibly explains the safe Fish fallback when explicit Deepgram lacks its SDK', async () => {
    const dom = await renderUiStatus({
      provider: 'fish.audio',
      providerConfig: 'deepgram',
      deepgramSdkAvailable: false,
      deepgramSdkReasonCode: 'C:\\private\\raw-reason',
      deepgramSdkError: 'raw private path that must stay hidden'
    });
    const hint = dom.window.document.getElementById('provider-hint').textContent;

    expect(hint).toBe(
      'Deepgram SDK unavailable (deepgram_sdk_unavailable) — Fish.audio fallback active.'
    );
    expect(hint).not.toContain('raw private path');
    expect(hint).not.toContain('C:\\private');
    dom.window.close();
  });
});

describe('STT Ticker optional Deepgram SDK', () => {
  afterEach(() => {
    jest.dontMock('@deepgram/sdk');
    jest.resetModules();
  });

  test('initializes on Fish and exposes only a stable availability code when the SDK is corrupt', async () => {
    jest.resetModules();
    jest.doMock('@deepgram/sdk', () => {
      throw new Error('partial tree at C:\\private\\deepgram-api-key-secret');
    });

    let SttTickerPlugin;
    jest.isolateModules(() => {
      SttTickerPlugin = require('../plugins/stt-ticker/main');
    });

    const fishProvider = {
      async transcribeFishAudio() {
        return {
          text: 'Hallo hello',
          language: 'de',
          confidence: 0.99,
          segments: []
        };
      }
    };
    const api = {
      getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
      getConfig: jest.fn(() => ({
        asr: {
          provider: 'deepgram',
          deepgramApiKey: 'deepgram-api-key-secret'
        }
      })),
      setConfig: jest.fn(),
      getPlugin: jest.fn(name => name === 'tts' ? fishProvider : null),
      log: jest.fn(),
      registerRoute: jest.fn(),
      registerSocket: jest.fn(),
      emit: jest.fn()
    };
    const plugin = new SttTickerPlugin(api);

    await expect(plugin.init()).resolves.toBeUndefined();
    const transcript = await plugin.asrPipeline.transcribe(
      Buffer.from([1, 2, 3]),
      { mimeType: 'audio/wav', filename: 'speech.wav' }
    );
    const status = plugin._getStatus();

    expect(transcript).toMatchObject({ text: 'Hallo hello', provider: 'fish.audio' });
    expect(status.asr).toMatchObject({
      provider: 'fish.audio',
      providerConfig: 'deepgram',
      deepgramSdkAvailable: false,
      deepgramSdkReasonCode: 'deepgram_sdk_unavailable'
    });
    expect(JSON.stringify(status)).not.toContain('deepgram-api-key-secret');
    expect(JSON.stringify(status)).not.toContain('private');
    expect(JSON.stringify(status)).not.toContain('partial tree');
    await plugin.destroy();
  });
});
