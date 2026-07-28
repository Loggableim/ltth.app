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

  test('emits a preview-only Boba test spin without assigning an avatar or invoking TTS', async () => {
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
});
