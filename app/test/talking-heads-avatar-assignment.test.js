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
});
