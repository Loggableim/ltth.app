const TalkingHeadsPlugin = require('../plugins/talking-heads/main.js');

function createPlugin() {
  const io = { on: jest.fn(), emit: jest.fn() };
  const api = {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSocketIO: jest.fn(() => io),
    getDatabase: jest.fn(() => ({
      prepare: jest.fn(() => ({ run: jest.fn(), get: jest.fn(), all: jest.fn(() => []) })),
      getSetting: jest.fn()
    })),
    getConfig: jest.fn(() => ({ enabled: true })),
    setConfig: jest.fn(),
    getPluginDataDir: jest.fn(() => '/tmp/talking-heads-gift-lottery'),
    ensurePluginDataDir: jest.fn(),
    registerRoute: jest.fn(),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn(),
    pluginLoader: { on: jest.fn(), removeListener: jest.fn() }
  };
  return { plugin: new TalkingHeadsPlugin(api), api, io };
}

const fox = { packId: 'boba', characterId: 'Fox', options: {} };
const bear = { packId: 'boba', characterId: 'Bear', options: {} };
const dog = { packId: 'boba', characterId: 'Dog', options: {} };

function spinIdFor(io, playbackId) {
  const event = io.emit.mock.calls.find(([eventName, payload]) => (
    eventName === 'talkingheads:avatar:spin:start' && payload.playbackId === playbackId
  ));
  return event?.[1]?.spinId;
}

describe('Talking Heads gift avatar lottery', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('admin reroll targets the supplied persistent avatar and emits the gift-reroll spin', async () => {
    const { plugin, api, io } = createPlugin();
    plugin.assetSpriteLibrary = {
      getRandomSelection: jest.fn(() => dog),
      getLotteryCandidates: jest.fn(() => [bear, dog, fox]),
      getSpriteSet: jest.fn(async (selection) => ({
        ...selection,
        sprites: { idle_neutral: `/sprite/${selection.characterId}.svg` }
      }))
    };
    plugin.avatarLotteryManager = {
      getAssignment: jest.fn((userId) => userId === 'viewer_handle'
        ? { userId, username: 'ViewerHandle', selection: fox, state: 'kept' }
        : null),
      reroll: jest.fn((userId, username, selection) => ({ userId, username, selection, state: 'kept' }))
    };
    plugin._registerRoutes();
    const rerollRoute = api.registerRoute.mock.calls.find(([, route]) => (
      route === '/api/talkingheads/avatar-reroll'
    ))?.[2];
    const response = { status: jest.fn(() => response), json: jest.fn() };

    expect(rerollRoute).toEqual(expect.any(Function));
    await rerollRoute({ body: { userId: 'viewer_handle', username: 'ViewerHandle' } }, response);

    expect(plugin.avatarLotteryManager.reroll).toHaveBeenCalledWith('viewer_handle', 'ViewerHandle', dog);
    expect(io.emit).toHaveBeenCalledWith('talkingheads:avatar:spin:start', expect.objectContaining({
      userId: 'viewer_handle',
      username: 'ViewerHandle',
      reason: 'gift-reroll'
    }));
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('gift reroll uses the TikTok handle when the event also carries a numeric user ID', async () => {
    const { plugin } = createPlugin();
    plugin.config.rerollGiftNames = ['Go Popular'];
    plugin.assetSpriteLibrary = {
      getRandomSelection: jest.fn(() => dog),
      getLotteryCandidates: jest.fn(() => [bear, dog, fox]),
      getSpriteSet: jest.fn(async (selection) => ({
        ...selection,
        sprites: { idle_neutral: `/sprite/${selection.characterId}.svg` }
      }))
    };
    plugin.avatarLotteryManager = {
      getAssignment: jest.fn((userId) => userId === 'viewer_handle'
        ? { userId, username: 'ViewerHandle', selection: fox, state: 'kept' }
        : null),
      reroll: jest.fn((userId, username, selection) => ({ userId, username, selection, state: 'kept' }))
    };

    await expect(plugin._handleLotteryGift({
      userId: '1234567890123456789',
      uniqueId: 'viewer_handle',
      giftName: 'Go Popular'
    })).resolves.toBe(true);

    expect(plugin.avatarLotteryManager.reroll).toHaveBeenCalledWith('viewer_handle', 'viewer_handle', dog);
  });

  test('registers only the configured gift behavior and rerolls an existing avatar', async () => {
    const { plugin, api, io } = createPlugin();
    plugin._registerAvatarLotteryEvents();

    plugin.assetSpriteLibrary = {
      getRandomSelection: jest.fn(() => dog),
      getLotteryCandidates: jest.fn(() => [bear, dog, fox]),
      getSpriteSet: jest.fn(async (selection) => ({ ...selection, sprites: { idle_neutral: `/sprite/${selection.characterId}.svg` } }))
    };
    plugin.avatarLotteryManager = {
      getAssignment: jest.fn(() => ({ userId: 'viewer-1', username: 'ViewerOne', selection: fox, state: 'kept' })),
      reroll: jest.fn((userId, username, selection) => ({ userId, username, selection, state: 'kept' }))
    };

    await plugin._handleLotteryGift({ userId: 'viewer-1', uniqueId: 'ViewerOne', giftName: 'Heart Me' });

    expect(api.registerTikTokEvent).toHaveBeenCalledWith('gift', expect.any(Function));
    expect(api.registerTikTokEvent).toHaveBeenCalledTimes(1);
    expect(plugin.assetSpriteLibrary.getRandomSelection).toHaveBeenCalledWith(expect.any(Function), fox);
    expect(plugin.avatarLotteryManager.reroll).toHaveBeenCalledWith('viewer-1', 'ViewerOne', dog);
    expect(io.emit).toHaveBeenCalledWith('talkingheads:avatar:spin:start', expect.objectContaining({
      userId: 'viewer-1',
      username: 'ViewerOne',
      reason: 'gift-reroll',
      candidates: expect.arrayContaining([expect.objectContaining({ spriteUrl: '/api/talkingheads/sprite/Bear.svg' })]),
      winner: expect.objectContaining({ sprites: { idle_neutral: '/api/talkingheads/sprite/Dog.svg' } })
    }));
    const payload = io.emit.mock.calls.find(([event]) => event === 'talkingheads:avatar:spin:start')[1];
    expect(payload).not.toHaveProperty('keepCommand');
    expect(payload).not.toHaveProperty('rerollCommand');
  });

  test('uses a configured gift ID over names and ignores gifts from users without avatars', async () => {
    const { plugin } = createPlugin();
    plugin.config.lotteryGiftId = '42';
    plugin.avatarLotteryManager = { getAssignment: jest.fn(() => null), reroll: jest.fn() };
    plugin.assetSpriteLibrary = { getRandomSelection: jest.fn() };

    expect(plugin._isLotteryGift({ giftId: '42', giftName: 'Other' })).toBe(true);
    expect(plugin._isLotteryGift({ giftId: '17', giftName: 'Heart Me' })).toBe(false);

    await expect(plugin._handleLotteryGift({
      userId: 'viewer-1',
      uniqueId: 'ViewerOne',
      giftId: '42'
    })).resolves.toBe(false);
    expect(plugin.assetSpriteLibrary.getRandomSelection).not.toHaveBeenCalled();
    expect(plugin.avatarLotteryManager.reroll).not.toHaveBeenCalled();
  });

  test('defers a gift reroll until the viewer is no longer speaking', async () => {
    const { plugin, api } = createPlugin();
    plugin.activePlaybackByUser.set('viewer-1', 'active-playback');
    plugin.assetSpriteLibrary = { getRandomSelection: jest.fn() };
    plugin.avatarLotteryManager = {
      getAssignment: jest.fn(() => ({ userId: 'viewer-1', username: 'ViewerOne', selection: fox })),
      reroll: jest.fn()
    };

    await expect(plugin._handleLotteryGift({
      userId: 'viewer-1',
      uniqueId: 'ViewerOne',
      giftName: 'Heart Me'
    })).resolves.toBe(true);

    expect(plugin.assetSpriteLibrary.getRandomSelection).not.toHaveBeenCalled();
    expect(plugin.avatarLotteryManager.reroll).not.toHaveBeenCalled();
    expect(plugin.pendingGiftRerolls.get('viewer-1')).toEqual(expect.objectContaining({
      giftName: 'Heart Me'
    }));

    plugin.animationController = { endExternalAnimation: jest.fn() };
    plugin._handleLotteryGift = jest.fn().mockResolvedValue(true);
    plugin._registerPlaybackBridge();
    const handlers = new Map(api.pluginLoader.on.mock.calls);
    handlers.get('tts:renderer:ended')({
      playbackId: 'active-playback',
      userId: 'viewer-1'
    });
    await Promise.resolve();

    expect(plugin.pendingGiftRerolls.has('viewer-1')).toBe(false);
    expect(plugin._handleLotteryGift).toHaveBeenCalledWith(expect.objectContaining({
      giftName: 'Heart Me'
    }));
  });

  test('defers a gift that arrives during an initial avatar spin until renderer terminal', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const { plugin, api, io } = createPlugin();
    let currentAssignment = null;
    plugin.config.avatarLotteryEnabled = true;
    plugin.config.lotteryGiftNames = ['Heart Me'];
    plugin.config.spinDurationMs = 10;
    plugin.assetSpriteLibrary = {
      getRandomSelection: jest.fn((random, excludedSelection) => excludedSelection ? dog : fox),
      getLotteryCandidates: jest.fn(() => [bear, dog, fox]),
      getSpriteSet: jest.fn(async (selection) => ({
        ...selection,
        sprites: { idle_neutral: `/sprite/${selection.characterId}.svg` }
      }))
    };
    plugin.avatarLotteryManager = {
      getAssignment: jest.fn(() => currentAssignment),
      assign: jest.fn((userId, username, selection) => {
        currentAssignment = { userId, username, selection, state: 'kept' };
        return currentAssignment;
      }),
      reroll: jest.fn((userId, username, selection) => {
        currentAssignment = { userId, username, selection, state: 'kept' };
        return currentAssignment;
      })
    };

    const preparation = plugin.prepareAvatarForPlayback({
      playbackId: 'initial-spin',
      userId: 'viewer-1',
      username: 'ViewerOne',
      hasAssignedVoice: true
    });
    await new Promise((resolve) => setImmediate(resolve));

    await expect(plugin._handleLotteryGift({
      userId: 'viewer-1',
      uniqueId: 'ViewerOne',
      giftName: 'Heart Me'
    })).resolves.toBe(true);
    expect(plugin.avatarLotteryManager.reroll).not.toHaveBeenCalled();
    expect(plugin.pendingGiftRerolls.get('viewer-1')).toEqual(expect.objectContaining({
      giftName: 'Heart Me'
    }));

    expect(plugin._completeAvatarSpin({
      playbackId: 'initial-spin',
      userId: 'viewer-1',
      spinId: spinIdFor(io, 'initial-spin')
    })).toBe(false);
    await jest.advanceTimersByTimeAsync(10);
    expect(plugin._completeAvatarSpin({
      playbackId: 'initial-spin',
      userId: 'viewer-1',
      spinId: spinIdFor(io, 'initial-spin')
    })).toBe(true);
    await expect(preparation).resolves.toEqual(expect.objectContaining({ spinStatus: 'complete' }));

    plugin.animationController = { endExternalAnimation: jest.fn(), setMouthIntensity: jest.fn() };
    plugin._handleTTSEvent = jest.fn().mockResolvedValue();
    plugin._registerPlaybackBridge();
    const handlers = new Map(api.pluginLoader.on.mock.calls);
    await handlers.get('tts:renderer:started')({
      playbackId: 'initial-spin',
      userId: 'viewer-1',
      username: 'ViewerOne',
      source: 'chat'
    });
    handlers.get('tts:renderer:ended')({
      playbackId: 'initial-spin',
      userId: 'viewer-1'
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(plugin.avatarLotteryManager.reroll).toHaveBeenCalledTimes(1);
    expect(plugin.avatarLotteryManager.reroll).toHaveBeenCalledWith('viewer-1', 'ViewerOne', dog);
  });

  test('keeps a first-spin reservation after acknowledgement until renderer failure terminal', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    const { plugin, api, io } = createPlugin();
    let currentAssignment = null;
    plugin.config.avatarLotteryEnabled = true;
    plugin.config.lotteryGiftNames = ['Heart Me'];
    plugin.config.spinDurationMs = 10;
    plugin.assetSpriteLibrary = {
      getRandomSelection: jest.fn((random, excludedSelection) => excludedSelection ? dog : fox),
      getLotteryCandidates: jest.fn(() => [bear, dog, fox]),
      getSpriteSet: jest.fn(async (selection) => ({
        ...selection,
        sprites: { idle_neutral: `/sprite/${selection.characterId}.svg` }
      }))
    };
    plugin.avatarLotteryManager = {
      getAssignment: jest.fn(() => currentAssignment),
      assign: jest.fn((userId, username, selection) => {
        currentAssignment = { userId, username, selection, state: 'kept' };
        return currentAssignment;
      }),
      reroll: jest.fn((userId, username, selection) => {
        currentAssignment = { userId, username, selection, state: 'kept' };
        return currentAssignment;
      })
    };

    const preparation = plugin.prepareAvatarForPlayback({
      playbackId: 'post-reveal-gap',
      userId: 'viewer-1',
      username: 'ViewerOne',
      hasAssignedVoice: true
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(plugin._completeAvatarSpin({
      playbackId: 'post-reveal-gap',
      userId: 'viewer-1',
      spinId: spinIdFor(io, 'post-reveal-gap')
    })).toBe(false);
    await jest.advanceTimersByTimeAsync(10);
    expect(plugin._completeAvatarSpin({
      playbackId: 'post-reveal-gap',
      userId: 'viewer-1',
      spinId: spinIdFor(io, 'post-reveal-gap')
    })).toBe(true);
    await expect(preparation).resolves.toEqual(expect.objectContaining({ spinStatus: 'complete' }));

    expect(plugin.initialAvatarPlaybackReservations?.get('viewer-1')).toBe('post-reveal-gap');
    await expect(plugin._handleLotteryGift({
      userId: 'viewer-1',
      uniqueId: 'ViewerOne',
      giftName: 'Heart Me'
    })).resolves.toBe(true);
    expect(plugin.avatarLotteryManager.reroll).not.toHaveBeenCalled();
    expect(plugin.pendingGiftRerolls.get('viewer-1')).toEqual(expect.objectContaining({
      giftName: 'Heart Me'
    }));

    plugin.animationController = { endExternalAnimation: jest.fn(), setMouthIntensity: jest.fn() };
    plugin._handleTTSEvent = jest.fn().mockResolvedValue();
    plugin._registerPlaybackBridge();
    const handlers = new Map(api.pluginLoader.on.mock.calls);
    handlers.get('tts:renderer:failed')({
      playbackId: 'stale-playback',
      userId: 'viewer-1',
      reason: 'renderer-watchdog'
    });
    expect(plugin.initialAvatarPlaybackReservations.get('viewer-1')).toBe('post-reveal-gap');
    expect(plugin.avatarLotteryManager.reroll).not.toHaveBeenCalled();

    await handlers.get('tts:renderer:started')({
      playbackId: 'post-reveal-gap',
      userId: 'viewer-1',
      username: 'ViewerOne',
      source: 'chat'
    });
    expect(plugin.avatarLotteryManager.reroll).not.toHaveBeenCalled();

    handlers.get('tts:renderer:failed')({
      playbackId: 'post-reveal-gap',
      userId: 'viewer-1',
      reason: 'renderer-watchdog'
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(plugin.initialAvatarPlaybackReservations?.has('viewer-1')).toBe(false);
    expect(plugin.avatarLotteryManager.reroll).toHaveBeenCalledTimes(1);
    expect(plugin.avatarLotteryManager.reroll).toHaveBeenCalledWith('viewer-1', 'ViewerOne', dog);
  });
});
