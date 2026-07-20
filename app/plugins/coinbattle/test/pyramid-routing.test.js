const CoinBattlePlugin = require('../main');

const createGift = () => ({
  userId: 'viewer-1',
  uniqueId: 'viewer_one',
  nickname: 'Viewer One',
  profilePictureUrl: null,
  giftId: 1,
  giftName: 'Rose',
  coins: 1,
  repeatCount: 1
});

const createPlugin = ({ pyramidActive = false, pyramidEnabled = false, engineMatch = null } = {}) => {
  const plugin = Object.create(CoinBattlePlugin.prototype);
  plugin.engine = {
    currentMatch: engineMatch,
    processGift: jest.fn(() => ({ duplicate: false, coins: 1 })),
    getLeaderboard: jest.fn(() => [])
  };
  plugin.pyramidMode = {
    active: pyramidActive,
    config: { enabled: pyramidEnabled, autoStart: pyramidEnabled },
    processGift: jest.fn(() => ({ success: true }))
  };
  plugin.performanceManager = { processGiftEvent: jest.fn(() => Promise.resolve({ success: true })) };
  plugin.kothMode = null;
  plugin.db = { getPlayerStats: jest.fn(() => null) };
  plugin.avatarSystem = null;
  plugin.io = { emit: jest.fn() };
  plugin.api = { log: jest.fn() };
  return plugin;
};

describe('CoinBattle exclusive Pyramid event routing', () => {
  test('routes a manually active Pyramid gift only to Pyramid', async () => {
    const plugin = createPlugin({ pyramidActive: true });

    await plugin.processGiftEvent(createGift());

    expect(plugin.pyramidMode.processGift).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'viewer-1' }),
      1
    );
    expect(plugin.engine.processGift).not.toHaveBeenCalled();
  });

  test('auto-starts Pyramid without creating a normal engine match', async () => {
    const plugin = createPlugin({ pyramidEnabled: true });

    await plugin.processGiftEvent(createGift());

    expect(plugin.pyramidMode.processGift).toHaveBeenCalled();
    expect(plugin.engine.processGift).not.toHaveBeenCalled();
  });

  test('routes a normal gift only to the normal engine', async () => {
    const plugin = createPlugin({ engineMatch: { id: 4, mode: 'solo' } });

    await plugin.processGiftEvent(createGift());

    expect(plugin.engine.processGift).toHaveBeenCalled();
    expect(plugin.pyramidMode.processGift).not.toHaveBeenCalled();
  });
});

