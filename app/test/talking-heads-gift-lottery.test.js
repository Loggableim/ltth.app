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

describe('Talking Heads gift avatar lottery', () => {
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
    expect(io.emit).toHaveBeenCalledWith('talkingheads:avatar:lottery:start', expect.objectContaining({
      userId: 'viewer-1',
      username: 'ViewerOne',
      candidates: expect.arrayContaining([expect.objectContaining({ spriteUrl: '/sprite/Bear.svg' })]),
      winner: expect.objectContaining({ sprites: { idle_neutral: '/sprite/Dog.svg' } })
    }));
    const payload = io.emit.mock.calls.find(([event]) => event === 'talkingheads:avatar:lottery:start')[1];
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
});
