'use strict';

const Database = require('better-sqlite3');
const GameEngineDatabase = require('../backend/database');
const SlotGame = require('../games/slot');
const ViewerXPDatabase = require('../../milestone-leaderboard/vendor/viewer-leaderboard/backend/database');

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

function createFixture({ viewerDatabase } = {}) {
  const sqlite = new Database(':memory:');
  const socket = { emit: jest.fn() };
  const pluginLoader = { loadedPlugins: new Map() };
  const api = {
    getDatabase: () => ({ db: sqlite }),
    getSocketIO: () => socket,
    pluginLoader,
    log: jest.fn()
  };
  const gameDb = new GameEngineDatabase(api, logger);
  gameDb.initialize();
  const viewerDb = viewerDatabase || new ViewerXPDatabase(api);
  if (!viewerDatabase) {
    viewerDb.initialize();
  }
  pluginLoader.loadedPlugins.set('viewer-leaderboard', { instance: { db: viewerDb } });
  return { api, gameDb, viewerDb, sqlite, socket };
}

function configureXPReward(gameDb) {
  const config = gameDb.getSlotConfig();
  gameDb.updateSlotConfig(
    config.id,
    config.symbols,
    config.settings,
    config.giftMappings,
    config.oddsProfiles,
    [{ outcomeCategories: ['small_win'], action: 'xp', params: { xp: 25 } }]
  );
  return gameDb.getSlotConfig(config.id);
}

function createSpinData(machineId, spinId = 'slot-durable-1') {
  return {
    spinId,
    username: 'slot-viewer',
    nickname: 'Slot Viewer',
    profilePictureUrl: '',
    machineId,
    triggerType: 'chat',
    triggerValue: '!spin',
    oddsProfileKey: 'chat'
  };
}

function forceSmallWin(game, config) {
  game._resolveOutcome = jest.fn(() => ({
    reels: [config.symbols[0], config.symbols[0], config.symbols[0]],
    category: 'small_win',
    isWin: true
  }));
}

describe('Slot durable reward delivery', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('persists the resolved operation and grants its XP once across a reload and duplicate ACKs', async () => {
    const fixture = createFixture();
    const config = configureXPReward(fixture.gameDb);
    const firstGame = new SlotGame(fixture.api, fixture.gameDb, logger);
    forceSmallWin(firstGame, config);

    await firstGame.startSpinFromQueue(createSpinData(config.id));

    const pending = fixture.gameDb.getSlotOperation('slot-durable-1');
    expect(pending).toEqual(expect.objectContaining({ state: 'pending' }));
    expect(pending.rewardActions).toEqual([{ action: 'xp', params: { xp: 25 } }]);

    const reloadedGame = new SlotGame(fixture.api, fixture.gameDb, logger);
    await reloadedGame.recoverPendingOperations();
    await Promise.all([
      reloadedGame.handleSpinCompleted('slot-durable-1'),
      reloadedGame.forceCompleteSpin('slot-durable-1')
    ]);

    expect(fixture.viewerDb.getViewerProfile('slot-viewer').xp).toBe(25);
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM xp_transactions WHERE username = 'slot-viewer'").get().count).toBe(1);
    expect(fixture.gameDb.getSlotOperation('slot-durable-1')).toEqual(expect.objectContaining({ state: 'completed' }));
  });

  test('does not resolve forceCompleteSpin before an asynchronous durable reward has drained', async () => {
    let resolveGrant;
    const grantDrained = new Promise(resolve => { resolveGrant = resolve; });
    const viewerDatabase = {
      addXPOnce: jest.fn(() => grantDrained)
    };
    const fixture = createFixture({ viewerDatabase });
    const config = configureXPReward(fixture.gameDb);
    const game = new SlotGame(fixture.api, fixture.gameDb, logger);
    forceSmallWin(game, config);

    await game.startSpinFromQueue(createSpinData(config.id, 'slot-durable-await'));
    let settled = false;
    const completion = game.forceCompleteSpin('slot-durable-await').then(() => { settled = true; });

    await Promise.resolve();
    expect(settled).toBe(false);

    resolveGrant({ applied: true });
    await completion;
    expect(viewerDatabase.addXPOnce).toHaveBeenCalledTimes(1);
  });
  test('releases the unified queue only after the durable reward drain finishes', async () => {
    let resolveGrant;
    const grantDrained = new Promise(resolve => { resolveGrant = resolve; });
    const viewerDatabase = {
      addXPOnce: jest.fn(() => grantDrained)
    };
    const fixture = createFixture({ viewerDatabase });
    const config = configureXPReward(fixture.gameDb);
    const game = new SlotGame(fixture.api, fixture.gameDb, logger);
    const unifiedQueue = { completeProcessing: jest.fn() };
    game.setUnifiedQueue(unifiedQueue);
    forceSmallWin(game, config);

    await game.startSpinFromQueue(createSpinData(config.id, 'slot-durable-queue'));
    const completion = game.handleSpinCompleted('slot-durable-queue');

    await Promise.resolve();
    await Promise.resolve();
    expect(unifiedQueue.completeProcessing).not.toHaveBeenCalled();

    resolveGrant({ applied: true });
    await completion;
    expect(unifiedQueue.completeProcessing).toHaveBeenCalledTimes(1);
  });

  test('keeps numeric spin IDs unique when a durable operation survives a restart', () => {
    const fixture = createFixture();
    const config = configureXPReward(fixture.gameDb);
    const fixedTimestamp = 1_700_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(fixedTimestamp);

    try {
      fixture.gameDb.createSlotOperation({
        spinId: fixedTimestamp,
        machineId: config.id,
        username: 'slot-viewer',
        spinData: createSpinData(config.id, fixedTimestamp),
        outcome: { category: 'loss', isWin: false, reels: [] },
        rewardActions: [],
        config
      });

      const reloadedGame = new SlotGame(fixture.api, fixture.gameDb, logger);
      expect(reloadedGame._nextSpinId()).toBe(fixedTimestamp + 1);
    } finally {
      nowSpy.mockRestore();
    }
  });

  test('does not release an installed unified queue when an ACK drains a direct durable spin', async () => {
    jest.useFakeTimers();
    try {
      const fixture = createFixture();
      const config = configureXPReward(fixture.gameDb);
      const game = new SlotGame(fixture.api, fixture.gameDb, logger);
      const unifiedQueue = { completeProcessing: jest.fn() };
      game.setUnifiedQueue(unifiedQueue);
      forceSmallWin(game, config);

      const result = await game._triggerSpin(
        'slot-viewer',
        'Slot Viewer',
        '',
        'test',
        'direct-durable-ack',
        config.id,
        'chat'
      );

      await game.handleSpinCompleted(result.spinId);

      expect(fixture.viewerDb.getViewerProfile('slot-viewer').xp).toBe(25);
      expect(fixture.gameDb.getSlotOperation(result.spinId)).toEqual(expect.objectContaining({
        state: 'completed'
      }));
      expect(unifiedQueue.completeProcessing).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test('drains a direct durable spin without releasing the unified queue', async () => {
    jest.useFakeTimers();
    try {
      const fixture = createFixture();
      const config = configureXPReward(fixture.gameDb);
      const game = new SlotGame(fixture.api, fixture.gameDb, logger);
      const unifiedQueue = { completeProcessing: jest.fn() };
      game.setUnifiedQueue(unifiedQueue);
      forceSmallWin(game, config);

      const result = await game._triggerSpin(
        'slot-viewer',
        'Slot Viewer',
        '',
        'test',
        'direct-durable-test',
        config.id,
        'chat'
      );
      expect(fixture.gameDb.getSlotOperation(result.spinId)).toEqual(expect.objectContaining({
        state: 'pending'
      }));

      await jest.advanceTimersByTimeAsync(5_000);

      expect(fixture.viewerDb.getViewerProfile('slot-viewer').xp).toBe(25);
      expect(fixture.gameDb.getSlotOperation(result.spinId)).toEqual(expect.objectContaining({
        state: 'completed'
      }));
      expect(unifiedQueue.completeProcessing).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

});
