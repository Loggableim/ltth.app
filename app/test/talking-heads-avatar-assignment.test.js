const TalkingHeadsPlugin = require('../plugins/talking-heads/main.js');

const fox = { packId: 'boba', characterId: 'Fox', options: { expression: 'Happy' } };
const bear = { packId: 'boba', characterId: 'Bear', options: { expression: 'Angry' } };

function createPlugin() {
  const io = { on: jest.fn(), emit: jest.fn() };
  const api = {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    getSocketIO: jest.fn(() => io),
    getDatabase: jest.fn(() => ({
      prepare: jest.fn(() => ({ run: jest.fn(), get: jest.fn(), all: jest.fn(() => []) })),
      getSetting: jest.fn()
    })),
    getConfig: jest.fn(() => ({ enabled: true, assetPack: 'boba', assetCharacter: 'Fox' })),
    setConfig: jest.fn(),
    getPluginDataDir: jest.fn(() => '/tmp/talking-heads-avatar-assignment'),
    ensurePluginDataDir: jest.fn(),
    registerRoute: jest.fn(),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn(),
    pluginLoader: { on: jest.fn(), removeListener: jest.fn() }
  };
  const plugin = new TalkingHeadsPlugin(api);
  plugin.roleManager = { checkEligibility: jest.fn(() => ({ eligible: true })) };
  plugin.cacheManager = {
    getAvatar: jest.fn(() => null),
    getManualSet: jest.fn(() => null)
  };
  plugin.animationController = {
    startAnimation: jest.fn(),
    stopAnimation: jest.fn()
  };
  plugin.assetSpriteLibrary = {
    getRandomSelection: jest.fn(() => fox),
    getSpriteSet: jest.fn(async (selection) => ({
      ...selection,
      sprites: { idle_neutral: `/sprites/${selection.characterId}.svg` }
    }))
  };
  return { plugin, api };
}

describe('Talking Heads persistent avatar assignment', () => {
  test('assigns and persists a Boba avatar on an assigned-voice user first playback', async () => {
    const { plugin } = createPlugin();
    plugin.avatarLotteryManager = {
      getAssignment: jest.fn(() => null),
      assign: jest.fn((userId, username, selection) => ({ userId, username, selection, state: 'kept' }))
    };
    const prepareSpy = jest.spyOn(plugin, 'prepareAvatarAssignment');

    await plugin._handleTTSEvent({
      userId: 'voice-user',
      username: 'Voice User',
      duration: 1000,
      userData: { hasAssignedVoice: true }
    });

    expect(plugin.avatarLotteryManager.assign).toHaveBeenCalledWith('voice-user', 'Voice User', fox);
    expect(prepareSpy.mock.results[0].value).toMatchObject({
      created: true,
      selection: fox,
      reason: 'assigned-voice'
    });
    expect(plugin.animationController.startAnimation).toHaveBeenCalledWith(
      'voice-user',
      'Voice User',
      { idle_neutral: '/sprites/Fox.svg' },
      1000
    );
  });

  test('reuses a valid legacy assignment without drawing or replacing it', async () => {
    const { plugin } = createPlugin();
    plugin.avatarLotteryManager = {
      getAssignment: jest.fn(() => ({
        userId: 'legacy-user',
        username: 'Legacy User',
        selection: bear,
        state: 'pending'
      })),
      assign: jest.fn()
    };

    expect(plugin.prepareAvatarAssignment({
      userId: 'legacy-user',
      username: 'Legacy User',
      hasAssignedVoice: true
    })).toMatchObject({
      created: false,
      selection: bear,
      reason: 'existing'
    });

    await plugin._handleTTSEvent({
      userId: 'legacy-user',
      username: 'Legacy User',
      duration: 1000,
      userData: { hasAssignedVoice: true }
    });

    expect(plugin.assetSpriteLibrary.getRandomSelection).not.toHaveBeenCalled();
    expect(plugin.avatarLotteryManager.assign).not.toHaveBeenCalled();
    expect(plugin.assetSpriteLibrary.getSpriteSet).toHaveBeenCalledWith(bear);
  });

  test('does not automatically persist an avatar without an assigned voice', async () => {
    const { plugin } = createPlugin();
    plugin.avatarLotteryManager = {
      getAssignment: jest.fn(() => null),
      assign: jest.fn()
    };
    const prepareSpy = jest.spyOn(plugin, 'prepareAvatarAssignment');

    await plugin._handleTTSEvent({
      userId: 'plain-user',
      username: 'Plain User',
      duration: 1000,
      userData: { hasAssignedVoice: false }
    });

    expect(plugin.assetSpriteLibrary.getRandomSelection).not.toHaveBeenCalled();
    expect(plugin.avatarLotteryManager.assign).not.toHaveBeenCalled();
    expect(prepareSpy.mock.results[0].value).toEqual({
      created: false,
      selection: null,
      reason: 'voice-not-assigned'
    });
    expect(plugin.animationController.startAnimation).toHaveBeenCalled();
  });

  test('keeps an existing manual cache avatar out of the first-voice spin and uses it at renderer start', async () => {
    const { plugin, api } = createPlugin();
    const manualAvatar = {
      userId: 'manual-user',
      username: 'Manual User',
      styleKey: 'manual:portrait-set',
      sprites: {
        idle_neutral: '/manual/idle.png',
        blink: '/manual/blink.png',
        speak_closed: '/manual/closed.png',
        speak_mid: '/manual/mid.png',
        speak_open: '/manual/open.png'
      }
    };
    plugin.config.spriteMode = 'hybrid';
    plugin.cacheManager = {
      getAvatar: jest.fn((_userId, styleKey) => (
        styleKey === 'manual:portrait-set' ? manualAvatar : null
      )),
      getManualSet: jest.fn(() => null)
    };
    plugin._getManualStyleKeyForUser = jest.fn(() => 'manual:portrait-set');
    plugin.avatarLotteryManager = {
      getAssignment: jest.fn(() => null),
      assign: jest.fn()
    };
    plugin.assetSpriteLibrary.getLotteryCandidates = jest.fn(() => [fox]);

    try {
      await expect(plugin.prepareAvatarForPlayback({
        playbackId: 'manual-cache-playback',
        userId: 'manual-user',
        username: 'Manual User',
        hasAssignedVoice: true
      })).resolves.toEqual(expect.objectContaining({
        created: false,
        reason: 'existing-cache-avatar'
      }));

      expect(plugin.avatarLotteryManager.assign).not.toHaveBeenCalled();
      expect(plugin.io.emit).not.toHaveBeenCalledWith(
        'talkingheads:avatar:spin:start',
        expect.anything()
      );

      plugin._registerPlaybackBridge();
      const handlers = new Map(api.pluginLoader.on.mock.calls);
      await handlers.get('tts:renderer:started')({
        playbackId: 'manual-cache-playback',
        userId: 'manual-user',
        username: 'Manual User',
        hasAssignedVoice: true,
        source: 'chat'
      });

      expect(plugin.animationController.startAnimation).toHaveBeenCalledWith(
        'manual-user',
        'Manual User',
        manualAvatar.sprites,
        expect.any(Number),
        expect.objectContaining({
          playbackId: 'manual-cache-playback',
          externalLifecycle: true
        })
      );
    } finally {
      plugin._cancelPendingAvatarSpins();
    }
  });

  test('treats the active default manual set as an existing avatar for an assigned voice', async () => {
    const { plugin, api } = createPlugin();
    const defaultSprites = {
      idle_neutral: '/default/idle.png',
      blink: '/default/blink.png',
      speak_closed: '/default/closed.png',
      speak_mid: '/default/mid.png',
      speak_open: '/default/open.png'
    };
    plugin.config.spriteMode = 'hybrid';
    plugin.config.defaultManualSetId = 'broadcast-default';
    plugin.cacheManager = {
      getAvatar: jest.fn(() => null),
      getManualSet: jest.fn((setId) => (
        setId === 'broadcast-default' ? { setId, sprites: defaultSprites } : null
      ))
    };
    plugin._getManualStyleKeyForUser = jest.fn(() => null);
    plugin.avatarLotteryManager = {
      getAssignment: jest.fn(() => null),
      assign: jest.fn()
    };
    plugin.assetSpriteLibrary.getLotteryCandidates = jest.fn(() => [fox]);
    const preparation = plugin.prepareAvatarForPlayback({
      playbackId: 'default-manual-playback',
      userId: 'default-manual-user',
      username: 'Default Manual User',
      hasAssignedVoice: true
    });

    try {
      expect(plugin.avatarLotteryManager.assign).not.toHaveBeenCalled();
      await expect(preparation).resolves.toEqual(expect.objectContaining({
        created: false,
        reason: 'existing-cache-avatar'
      }));
      expect(plugin.io.emit).not.toHaveBeenCalledWith(
        'talkingheads:avatar:spin:start',
        expect.anything()
      );

      plugin._registerPlaybackBridge();
      const handlers = new Map(api.pluginLoader.on.mock.calls);
      await handlers.get('tts:renderer:started')({
        playbackId: 'default-manual-playback',
        userId: 'default-manual-user',
        username: 'Default Manual User',
        hasAssignedVoice: true,
        source: 'chat'
      });

      expect(plugin.animationController.startAnimation).toHaveBeenCalledWith(
        'default-manual-user',
        'Default Manual User',
        defaultSprites,
        expect.any(Number),
        expect.objectContaining({
          playbackId: 'default-manual-playback',
          externalLifecycle: true
        })
      );
    } finally {
      plugin._cancelPendingAvatarSpins();
      await preparation.catch(() => undefined);
    }
  });

  test('keeps an existing asset-library cache avatar out of the first-voice spin', async () => {
    const { plugin, api } = createPlugin();
    const cachedAvatar = {
      userId: 'asset-cache-user',
      username: 'Asset Cache User',
      styleKey: 'asset-library',
      sprites: {
        idle_neutral: '/legacy/idle.png',
        blink: '/legacy/blink.png',
        speak_closed: '/legacy/closed.png',
        speak_mid: '/legacy/mid.png',
        speak_open: '/legacy/open.png'
      }
    };
    plugin.cacheManager = {
      getAvatar: jest.fn((_userId, styleKey) => (
        styleKey === 'asset-library' ? cachedAvatar : null
      )),
      getManualSet: jest.fn(() => null)
    };
    plugin.avatarLotteryManager = {
      getAssignment: jest.fn(() => null),
      assign: jest.fn()
    };

    await expect(plugin.prepareAvatarForPlayback({
      playbackId: 'asset-cache-playback',
      userId: 'asset-cache-user',
      username: 'Asset Cache User',
      hasAssignedVoice: true
    })).resolves.toEqual(expect.objectContaining({
      created: false,
      reason: 'existing-cache-avatar'
    }));
    expect(plugin.avatarLotteryManager.assign).not.toHaveBeenCalled();
    expect(plugin.io.emit).not.toHaveBeenCalledWith(
      'talkingheads:avatar:spin:start',
      expect.anything()
    );

    plugin._registerPlaybackBridge();
    const handlers = new Map(api.pluginLoader.on.mock.calls);
    await handlers.get('tts:renderer:started')({
      playbackId: 'asset-cache-playback',
      userId: 'asset-cache-user',
      username: 'Asset Cache User',
      hasAssignedVoice: true,
      source: 'chat'
    });

    expect(plugin.animationController.startAnimation).toHaveBeenCalledWith(
      'asset-cache-user',
      'Asset Cache User',
      cachedAvatar.sprites,
      expect.any(Number),
      expect.objectContaining({
        playbackId: 'asset-cache-playback',
        externalLifecycle: true
      })
    );
  });
});
