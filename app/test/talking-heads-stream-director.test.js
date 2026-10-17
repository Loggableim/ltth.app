'use strict';

const TalkingHeadsPlugin = require('../plugins/talking-heads/main.js');

const fox = { packId: 'boba', characterId: 'Fox', options: { expression: 'Happy' } };
const bear = { packId: 'boba', characterId: 'Bear', options: { expression: 'Default' } };

function responseRecorder() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
    sendFile: jest.fn()
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

function createPlugin(savedConfig = { enabled: true, assetPack: 'boba' }) {
  const io = { emit: jest.fn(), on: jest.fn() };
  const api = {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSocketIO: jest.fn(() => io),
    getDatabase: jest.fn(() => ({
      prepare: jest.fn(() => ({ run: jest.fn(), get: jest.fn(), all: jest.fn(() => []) }))
    })),
    getConfig: jest.fn(() => savedConfig),
    setConfig: jest.fn(),
    getPluginDataDir: jest.fn(() => '/tmp/talking-heads-stream-director'),
    ensurePluginDataDir: jest.fn(),
    registerRoute: jest.fn(),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn(),
    pluginLoader: { on: jest.fn(), removeListener: jest.fn() }
  };
  const plugin = new TalkingHeadsPlugin(api);
  plugin.assetSpriteLibrary = {
    getCatalog: jest.fn(() => ({ packs: [{ id: 'boba', name: 'Boba Animals', characters: ['Fox'] }] })),
    getRandomSelection: jest.fn(() => fox),
    getLotteryCandidates: jest.fn(() => [bear, fox, bear]),
    normalizeSelection: jest.fn((sel) => ({
      packId: sel?.packId || 'boba',
      characterId: sel?.characterId || 'Fox',
      options: sel?.options || {}
    })),
    getSpriteSet: jest.fn(async (selection) => ({
      ...selection,
      sprites: { idle_neutral: `/sprites/${selection.characterId}.png` }
    }))
  };
  plugin.avatarLotteryManager = {
    assign: jest.fn(),
    getAssignment: jest.fn(() => null)
  };
  return { plugin, api, io };
}

function findRoute(api, method, pathname) {
  const entry = api.registerRoute.mock.calls.find(([registeredMethod, registeredPath]) => (
    registeredMethod === method && registeredPath === pathname
  ));
  return entry && entry[2];
}

describe('Talking Heads Stream Director routes', () => {
  test('reports only compact local render health without chat text or audio data', () => {
    const { plugin, api } = createPlugin();
    plugin.activePlaybackByUser.set('speaker-1', 'playback-1');
    plugin.pendingAvatarSpins.set('spin-playback', {
      userId: 'viewer-2',
      spinId: 'spin-opaque-id',
      reason: 'initial-assignment'
    });
    plugin.ttsBridgeHandlers = { rendererStartHandler: jest.fn() };
    plugin._registerRoutes();
    const statusRoute = findRoute(api, 'get', '/api/talkingheads/status');
    const res = responseRecorder();

    expect(statusRoute).toEqual(expect.any(Function));
    statusRoute({}, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload).toEqual(expect.objectContaining({
      success: true,
      status: expect.objectContaining({
        enabled: true,
        assetPack: 'boba',
        activeSpeaker: { userId: 'speaker-1', playbackId: 'playback-1' },
        activeSpin: expect.objectContaining({
          playbackId: 'spin-playback',
          userId: 'viewer-2',
          spinId: 'spin-opaque-id'
        }),
        rendererBridge: expect.objectContaining({ available: true, activePlaybackCount: 1 })
      })
    }));
    expect(JSON.stringify(payload)).not.toMatch(/audioData|chat text|message text/i);
  });

  test('emits a preview-only avatar test spin without assigning an avatar or invoking TTS', async () => {
    const { plugin, api, io } = createPlugin();
    plugin._registerRoutes();
    const testSpinRoute = findRoute(api, 'post', '/api/talkingheads/test-spin');
    const res = responseRecorder();

    expect(testSpinRoute).toEqual(expect.any(Function));
    await testSpinRoute({ body: {} }, res);

    const emitted = io.emit.mock.calls.find(([eventName]) => eventName === 'talkingheads:avatar:spin:start');
    expect(emitted).toEqual([
      'talkingheads:avatar:spin:start',
      expect.objectContaining({
        preview: true,
        reason: 'preview',
        playbackId: expect.stringMatching(/^preview-spin-/),
        spinId: expect.any(String),
        winner: expect.objectContaining({ selection: expect.objectContaining({ packId: 'boba' }) })
      })
    ]);
    expect(plugin.avatarLotteryManager.assign).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      preview: true,
      spin: expect.objectContaining({ preview: true, spinId: expect.any(String) })
    }));
  });

  test('reports an avatar-generic error when the preview spin is unavailable', async () => {
    const { plugin, api } = createPlugin();
    plugin._emitAvatarSpin = jest.fn(async () => null);
    plugin._registerRoutes();
    const testSpinRoute = findRoute(api, 'post', '/api/talkingheads/test-spin');
    const res = responseRecorder();

    await testSpinRoute({ body: {} }, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Avatar preview is unavailable' });
  });

  test('migrates persisted lottery settings into the first-assignment and reroll-gift names', () => {
    const { plugin } = createPlugin({
      enabled: true,
      assetPack: 'boba',
      avatarLotteryEnabled: false,
      lotteryGiftId: '4242',
      lotteryGiftNames: ['Heart Me'],
      lotteryAnimationDuration: 3100
    });

    expect(plugin.config).toMatchObject({
      firstAssignmentEnabled: false,
      rerollGiftEnabled: false,
      rerollGiftId: '4242',
      rerollGiftNames: ['Heart Me'],
      spinDurationMs: 3100
    });
  });

  test('normalizes, validates, and clamps all nameplate and animation properties', () => {
    const { plugin } = createPlugin();

    // Default fallbacks for empty / invalid configuration
    const normalizedDefault = plugin._normalizeAvatarConfig({});
    expect(normalizedDefault).toMatchObject({
      nameplatePosition: 'below',
      nameplateFontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      nameplateFontSize: 14,
      nameplateFontColor: '#ffffff',
      nameplateBackgroundColor: '#060c1c',
      nameplateBackgroundOpacity: 0.75,
      nameplateTextShadow: 'subtle',
      nameplateTextStroke: 'none',
      headEntranceAnimation: 'slide-up',
      headExitAnimation: 'fade',
      nameplateEntranceAnimation: 'fade',
      nameplateExitAnimation: 'fade'
    });

    // Valid custom values
    const customConfig = {
      nameplatePosition: 'above',
      nameplateFontFamily: 'Impact, sans-serif',
      nameplateFontSize: 24,
      nameplateFontColor: '#ff0055',
      nameplateBackgroundColor: '#123456',
      nameplateBackgroundOpacity: 0.42,
      nameplateTextShadow: 'glow',
      nameplateTextStroke: '1px black',
      headEntranceAnimation: 'bounce',
      headExitAnimation: 'slide-down',
      nameplateEntranceAnimation: 'pop',
      nameplateExitAnimation: 'slide-up'
    };
    expect(plugin._normalizeAvatarConfig(customConfig)).toMatchObject(customConfig);

    // Clamping and sanitation
    const clampedConfig = plugin._normalizeAvatarConfig({
      nameplatePosition: 'invalid-pos',
      nameplateFontFamily: '   ',
      nameplateFontSize: 999, // exceeds 48
      nameplateFontColor: 'not-a-color',
      nameplateBackgroundColor: 'rgb(0,0,0)',
      nameplateBackgroundOpacity: 5.5, // exceeds 1
      nameplateTextShadow: 'extreme-shadow',
      nameplateTextStroke: '5px red',
      headEntranceAnimation: 'unknown-anim',
      headExitAnimation: 'unknown-anim',
      nameplateEntranceAnimation: 'unknown-anim',
      nameplateExitAnimation: 'unknown-anim'
    });
    expect(clampedConfig).toMatchObject({
      nameplatePosition: 'below',
      nameplateFontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
      nameplateFontSize: 48,
      nameplateFontColor: '#ffffff',
      nameplateBackgroundColor: '#060c1c',
      nameplateBackgroundOpacity: 1,
      nameplateTextShadow: 'subtle',
      nameplateTextStroke: 'none',
      headEntranceAnimation: 'slide-up',
      headExitAnimation: 'fade',
      nameplateEntranceAnimation: 'fade',
      nameplateExitAnimation: 'fade'
    });

    // Lower bound clamping for font size and opacity
    const lowerClamped = plugin._normalizeAvatarConfig({
      nameplateFontSize: 2, // below 10
      nameplateBackgroundOpacity: -0.5 // below 0
    });
    expect(lowerClamped.nameplateFontSize).toBe(10);
    expect(lowerClamped.nameplateBackgroundOpacity).toBe(0);
  });

  test('POST /api/talkingheads/config persists config and emits talkingheads:config:update live broadcast', () => {
    const { plugin, api, io } = createPlugin();
    plugin._registerRoutes();
    const configRoute = findRoute(api, 'post', '/api/talkingheads/config');
    const res = responseRecorder();

    expect(configRoute).toEqual(expect.any(Function));

    const updatedSettings = {
      nameplatePosition: 'above',
      nameplateFontSize: 20,
      nameplateFontColor: '#00ffcc',
      nameplateBackgroundColor: '#112233',
      nameplateBackgroundOpacity: 0.9,
      headEntranceAnimation: 'pop',
      nameplateEntranceAnimation: 'bounce'
    };

    configRoute({ body: updatedSettings }, res);

    expect(api.setConfig).toHaveBeenCalledWith('talking_heads_config', expect.objectContaining({
      nameplatePosition: 'above',
      nameplateFontSize: 20,
      nameplateFontColor: '#00ffcc',
      nameplateBackgroundColor: '#112233',
      nameplateBackgroundOpacity: 0.9,
      headEntranceAnimation: 'pop',
      nameplateEntranceAnimation: 'bounce'
    }));

    expect(io.emit).toHaveBeenCalledWith('talkingheads:config:update', {
      config: expect.objectContaining({
        nameplatePosition: 'above',
        nameplateFontSize: 20,
        nameplateFontColor: '#00ffcc',
        nameplateBackgroundColor: '#112233',
        nameplateBackgroundOpacity: 0.9
      })
    });

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      config: expect.objectContaining({
        nameplatePosition: 'above',
        nameplateFontSize: 20
      })
    }));
  });
});
