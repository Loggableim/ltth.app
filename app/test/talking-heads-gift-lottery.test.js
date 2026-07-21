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
  test('registers gift and chat listeners, then emits a local lottery result for Heart Me', async () => {
    const { plugin, api, io } = createPlugin();
    await plugin.init();

    plugin.assetSpriteLibrary = {
      getRandomSelection: jest.fn(() => fox),
      getLotteryCandidates: jest.fn(() => [bear, dog, fox]),
      getSpriteSet: jest.fn(async (selection) => ({ ...selection, sprites: { idle_neutral: `/sprite/${selection.characterId}.svg` } }))
    };
    plugin.avatarLotteryManager = {
      getChoice: jest.fn(() => null),
      shouldDraw: jest.fn(() => true),
      draw: jest.fn((userId, username, selection) => ({ userId, username, selection, state: 'pending' })),
      applyCommand: jest.fn()
    };

    await plugin._handleLotteryGift({ userId: 'viewer-1', uniqueId: 'ViewerOne', giftName: 'Heart Me' });

    expect(api.registerTikTokEvent).toHaveBeenCalledWith('gift', expect.any(Function));
    expect(api.registerTikTokEvent).toHaveBeenCalledWith('chat', expect.any(Function));
    expect(plugin.avatarLotteryManager.draw).toHaveBeenCalledWith('viewer-1', 'ViewerOne', fox);
    expect(io.emit).toHaveBeenCalledWith('talkingheads:avatar:lottery:start', expect.objectContaining({
      userId: 'viewer-1',
      username: 'ViewerOne',
      candidates: expect.arrayContaining([expect.objectContaining({ spriteUrl: '/sprite/Bear.svg' })]),
      winner: expect.objectContaining({ sprites: { idle_neutral: '/sprite/Fox.svg' } }),
      keepCommand: '!keep',
      rerollCommand: '!reroll'
    }));
  });

  test('uses a configured gift ID over names and forwards exact keep/reroll chat commands', async () => {
    const { plugin } = createPlugin();
    await plugin.init();
    plugin.config.lotteryGiftId = '42';
    plugin.avatarLotteryManager = { applyCommand: jest.fn(() => ({ state: 'kept' })) };

    expect(plugin._isLotteryGift({ giftId: '42', giftName: 'Other' })).toBe(true);
    expect(plugin._isLotteryGift({ giftId: '17', giftName: 'Heart Me' })).toBe(false);

    await plugin._handleLotteryCommand({ userId: 'viewer-1', comment: ' !KEEP ' });
    await plugin._handleLotteryCommand({ userId: 'viewer-1', comment: 'hello !reroll' });
    await plugin._handleLotteryCommand({ userId: 'viewer-1', comment: '!ReRoLl' });

    expect(plugin.avatarLotteryManager.applyCommand).toHaveBeenNthCalledWith(1, 'viewer-1', '!keep');
    expect(plugin.avatarLotteryManager.applyCommand).toHaveBeenNthCalledWith(2, 'viewer-1', '!reroll');
    expect(plugin.avatarLotteryManager.applyCommand).toHaveBeenCalledTimes(2);
  });
});
