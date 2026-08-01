'use strict';

const crypto = require('crypto');
const Database = require('better-sqlite3');
const GameEngineDatabase = require('../backend/database');
const UnifiedQueueManager = require('../backend/unified-queue');
const PlinkoGame = require('../games/plinko');
const ViewerXPDatabase = require('../../milestone-leaderboard/vendor/viewer-leaderboard/backend/database');

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

function createFixture() {
  const sqlite = new Database(':memory:');
  const socket = { emit: jest.fn() };
  const pluginLoader = { loadedPlugins: new Map() };
  const api = {
    getDatabase: () => ({ db: sqlite }),
    getSocketIO: () => socket,
    pluginLoader,
    log: jest.fn(),
    random: () => 0
  };
  const gameDb = new GameEngineDatabase(api, logger);
  gameDb.initialize();
  const viewerDb = new ViewerXPDatabase(api);
  viewerDb.initialize();
  pluginLoader.loadedPlugins.set('viewer-leaderboard', { instance: { db: viewerDb } });
  sqlite.prepare(`
    INSERT INTO viewer_profiles (username, xp, level, total_xp_earned, coins, total_coins_earned)
    VALUES ('plinko-viewer', 100, 1, 100, 100, 100)
  `).run();
  return { api, gameDb, viewerDb, sqlite, socket };
}

describe('Plinko durable in-flight outcomes', () => {
  test('migrates persisted Plinko queue ownership without claiming old direct balls', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE game_plinko_inflight (
        ball_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        nickname TEXT,
        profile_picture_url TEXT,
        bet INTEGER NOT NULL,
        ball_type TEXT,
        timestamp_ms INTEGER NOT NULL,
        batch_id TEXT,
        board_id INTEGER,
        server_slot_index INTEGER NOT NULL,
        slot_multiplier REAL,
        is_test INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'in_flight',
        settlement_json TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      )
    `);
    sqlite.prepare(`
      INSERT INTO game_plinko_inflight (
        ball_id, username, nickname, profile_picture_url, bet, ball_type,
        timestamp_ms, batch_id, board_id, server_slot_index, slot_multiplier,
        is_test, state, settlement_json, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'legacy-direct-ball',
      'plinko-viewer',
      'Plinko Viewer',
      '',
      20,
      'standard',
      Date.now(),
      null,
      null,
      0,
      1,
      0,
      'in_flight',
      null,
      Date.now(),
      Date.now()
    );
    const api = {
      getDatabase: () => ({ db: sqlite }),
      getSocketIO: () => ({ emit: jest.fn() }),
      log: jest.fn()
    };
    const gameDb = new GameEngineDatabase(api, logger);
    gameDb.initialize();

    expect(sqlite.prepare('PRAGMA table_info(game_plinko_inflight)').all())
      .toEqual(expect.arrayContaining([expect.objectContaining({ name: 'queue_managed' })]));
    expect(gameDb.getPlinkoInFlight('legacy-direct-ball')).toEqual(expect.objectContaining({
      queueManaged: false
    }));
  });

  test('rehydrates a real ball after reload and refunds an expired bet exactly once', async () => {
    const fixture = createFixture();
    const firstGame = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    const spawned = await firstGame.spawnBall(
      'plinko-viewer',
      'Plinko Viewer',
      '',
      40,
      'standard'
    );
    fixture.viewerDb.processBatch();

    const persisted = fixture.gameDb.getPlinkoInFlight(spawned.ballId);
    expect(persisted).toEqual(expect.objectContaining({
      username: 'plinko-viewer',
      bet: 40,
      state: 'in_flight',
      serverSlotIndex: 0,
      isTest: false
    }));

    const reloadedGame = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    await reloadedGame.recoverInFlightBalls();
    expect(reloadedGame.activeBalls.get(spawned.ballId)).toEqual(expect.objectContaining({ serverSlotIndex: 0 }));

    await Promise.all([
      reloadedGame.cleanupOldBalls(-1),
      reloadedGame.cleanupOldBalls(-1)
    ]);

    expect(fixture.viewerDb.getViewerProfile('plinko-viewer').xp).toBe(100);
    expect(fixture.gameDb.getPlinkoInFlight(spawned.ballId)).toEqual(expect.objectContaining({ state: 'refunded' }));
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM xp_transactions WHERE action_type = 'plinko_refund'").get().count).toBe(1);
  });

  test('does not refund expired test balls during recovery', async () => {
    const fixture = createFixture();
    const firstGame = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    const spawned = await firstGame.spawnTestBall('Test Viewer', 40);

    const reloadedGame = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    await reloadedGame.recoverInFlightBalls();
    await reloadedGame.cleanupOldBalls(-1);

    expect(fixture.gameDb.getPlinkoInFlight(spawned.ballId)).toEqual(expect.objectContaining({
      state: 'discarded',
      isTest: true
    }));
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM xp_transactions WHERE action_type = 'plinko_refund'").get().count).toBe(0);
  });

  test('resumes a claimed payout from its snapshot instead of refunding it after restart', async () => {
    const fixture = createFixture();
    const firstGame = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    const spawned = await firstGame.spawnBall(
      'plinko-viewer',
      'Plinko Viewer',
      '',
      40,
      'standard'
    );
    const persisted = fixture.gameDb.getPlinkoInFlight(spawned.ballId);
    const winnings = Math.floor(persisted.bet * persisted.serverMultiplier);

    expect(fixture.gameDb.claimPlinkoInFlightPayout(spawned.ballId, {
      slotIndex: persisted.serverSlotIndex,
      multiplier: persisted.serverMultiplier,
      winnings,
      netProfit: winnings - persisted.bet
    })).toBe(true);
    fixture.viewerDb.addXPOnce(
      persisted.username,
      winnings,
      'plinko_win',
      { ballId: spawned.ballId, winnings },
      `plinko:${spawned.ballId}:payout`
    );

    fixture.sqlite.prepare(`
      UPDATE game_plinko_inflight SET timestamp_ms = ? WHERE ball_id = ?
    `).run(Date.now() - 120_001, spawned.ballId);
    const liveConfig = firstGame.getConfig();
    fixture.gameDb.updatePlinkoConfig(
      liveConfig.id,
      [],
      liveConfig.physicsSettings,
      liveConfig.giftMappings
    );

    const reloadedGame = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    await reloadedGame.recoverInFlightBalls();

    expect(fixture.viewerDb.getViewerProfile('plinko-viewer').xp).toBe(100 - persisted.bet + winnings);
    expect(fixture.gameDb.getPlinkoInFlight(spawned.ballId)).toEqual(expect.objectContaining({
      state: 'settled'
    }));
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM xp_transactions WHERE action_type = 'plinko_win'").get().count).toBe(1);
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM xp_transactions WHERE action_type = 'plinko_refund'").get().count).toBe(0);
  });

  test('keeps a claimed payout recoverable while XP delivery is unavailable', async () => {
    const fixture = createFixture();
    const firstGame = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    const spawned = await firstGame.spawnBall(
      'plinko-viewer',
      'Plinko Viewer',
      '',
      40,
      'standard'
    );
    const persisted = fixture.gameDb.getPlinkoInFlight(spawned.ballId);
    const winnings = Math.floor(persisted.bet * persisted.serverMultiplier);
    fixture.sqlite.prepare(`
      UPDATE game_plinko_inflight SET timestamp_ms = ? WHERE ball_id = ?
    `).run(Date.now() - 1_001, spawned.ballId);
    fixture.api.pluginLoader.loadedPlugins.delete('viewer-leaderboard');
    const unavailableGame = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    await unavailableGame.recoverInFlightBalls();

    const failedLanding = await unavailableGame.handleBallLanded(spawned.ballId, 0);

    expect(failedLanding).toEqual(expect.objectContaining({
      success: false,
      error: 'Failed to award XP'
    }));
    expect(fixture.gameDb.getPlinkoInFlight(spawned.ballId)).toEqual(expect.objectContaining({
      state: 'payout_claimed'
    }));

    fixture.api.pluginLoader.loadedPlugins.set(
      'viewer-leaderboard',
      { instance: { db: fixture.viewerDb } }
    );
    const reloadedGame = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    await reloadedGame.recoverInFlightBalls();

    expect(fixture.viewerDb.getViewerProfile('plinko-viewer').xp).toBe(100 - persisted.bet + winnings);
    expect(fixture.gameDb.getPlinkoInFlight(spawned.ballId)).toEqual(expect.objectContaining({
      state: 'settled'
    }));
  });

  test('leaves a recovered debit in flight when the original debit reports failure', async () => {
    const fixture = createFixture();
    const game = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    let ballId;
    game.deductXP = jest.fn(async (username, amount, idempotencyKey) => {
      ballId = idempotencyKey.split(':')[1];
      await fixture.viewerDb.addXPOnce(
        username,
        -amount,
        'plinko_bet',
        { bet: amount, source: 'simulated-recovery' },
        idempotencyKey
      );
      expect(fixture.gameDb.markPlinkoInFlightDebitConfirmed(ballId)).toBe(true);
      return false;
    });

    const spawned = await game.spawnBall(
      'plinko-viewer',
      'Plinko Viewer',
      '',
      40,
      'standard'
    );

    expect(spawned).toEqual(expect.objectContaining({ success: false }));
    expect(fixture.gameDb.getPlinkoInFlight(ballId)).toEqual(expect.objectContaining({
      state: 'in_flight'
    }));
    expect(fixture.viewerDb.getViewerProfile('plinko-viewer').xp).toBe(60);
  });

  test('recovers a debit-pending real ball by charging its keyed bet once', async () => {
    const fixture = createFixture();
    const config = fixture.gameDb.getPlinkoConfig();
    const ballId = 'debit-pending-ball';

    const created = fixture.gameDb.createPlinkoInFlight({
      ballId,
      username: 'plinko-viewer',
      nickname: 'Plinko Viewer',
      profilePictureUrl: '',
      bet: 40,
      ballType: 'standard',
      timestamp: Date.now(),
      batchId: null,
      boardId: config.id,
      serverSlotIndex: 0,
      serverMultiplier: 10,
      isTest: false,
      state: 'debit_pending'
    });
    expect(created).toEqual(expect.objectContaining({ state: 'debit_pending' }));

    const reloadedGame = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    await reloadedGame.recoverInFlightBalls();
    await reloadedGame.recoverInFlightBalls();

    expect(fixture.viewerDb.getViewerProfile('plinko-viewer').xp).toBe(60);
    expect(fixture.gameDb.getPlinkoInFlight(ballId)).toEqual(expect.objectContaining({
      state: 'in_flight'
    }));
    expect(reloadedGame.activeBalls.get(ballId)).toEqual(expect.objectContaining({
      serverMultiplier: 10,
      isTest: false
    }));
    expect(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM xp_transactions WHERE action_type = 'plinko_bet'").get().count).toBe(1);
  });

  test('settles a durable test ball immediately when live test mode is disabled', async () => {
    const fixture = createFixture();
    const game = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    expect(game.getConfig().physicsSettings.testModeEnabled).toBe(false);

    const spawned = await game.spawnTestBall('Immediate Test', 40);
    const result = await game.handleBallLanded(spawned.ballId, 0);

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(fixture.gameDb.getPlinkoInFlight(spawned.ballId)).toEqual(expect.objectContaining({
      state: 'discarded',
      isTest: true
    }));
  });

  test('settles a durable real ball from its stored multiplier after the live board changes', async () => {
    const fixture = createFixture();
    const firstGame = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    const spawned = await firstGame.spawnBall(
      'plinko-viewer',
      'Plinko Viewer',
      '',
      40,
      'standard'
    );
    const liveConfig = firstGame.getConfig();
    const persisted = fixture.gameDb.getPlinkoInFlight(spawned.ballId);
    const winnings = Math.floor(persisted.bet * persisted.serverMultiplier);
    fixture.gameDb.updatePlinkoConfig(
      liveConfig.id,
      [],
      liveConfig.physicsSettings,
      liveConfig.giftMappings
    );
    fixture.sqlite.prepare(`
      UPDATE game_plinko_inflight SET timestamp_ms = ? WHERE ball_id = ?
    `).run(Date.now() - 1_001, spawned.ballId);

    const reloadedGame = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    await reloadedGame.recoverInFlightBalls();
    const result = await reloadedGame.handleBallLanded(spawned.ballId, 0);

    expect(result).toEqual(expect.objectContaining({
      success: true,
      multiplier: persisted.serverMultiplier,
      winnings
    }));
    expect(fixture.viewerDb.getViewerProfile('plinko-viewer').xp).toBe(100 - persisted.bet + winnings);
    expect(fixture.gameDb.getPlinkoInFlight(spawned.ballId)).toEqual(expect.objectContaining({
      state: 'settled'
    }));
  });

  test('settles a durable real ball from its stored multiplier after its board is deleted', async () => {
    const fixture = createFixture();
    const firstGame = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    const defaultConfig = firstGame.getConfig();
    const deletedBoardId = firstGame.createBoard(
      'Deleted durable board',
      [{ multiplier: 3.75, label: '3.75x', color: '#663399' }],
      defaultConfig.physicsSettings
    );
    firstGame.createBoard('Surviving board');

    const spawned = await firstGame.spawnBall(
      'plinko-viewer',
      'Plinko Viewer',
      '',
      40,
      'standard',
      { boardId: deletedBoardId }
    );
    const persisted = fixture.gameDb.getPlinkoInFlight(spawned.ballId);
    expect(persisted.serverMultiplier).toBe(3.75);
    expect(fixture.gameDb.deletePlinkoBoard(deletedBoardId)).toBe(true);
    expect(fixture.gameDb.getPlinkoConfig(deletedBoardId)).toBeNull();
    fixture.sqlite.prepare(`
      UPDATE game_plinko_inflight SET timestamp_ms = ? WHERE ball_id = ?
    `).run(Date.now() - 1_001, spawned.ballId);

    const reloadedGame = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    await reloadedGame.recoverInFlightBalls();
    const result = await reloadedGame.handleBallLanded(spawned.ballId, 0);

    expect(result).toEqual(expect.objectContaining({
      success: true,
      multiplier: 3.75,
      winnings: 150
    }));
    expect(fixture.viewerDb.getViewerProfile('plinko-viewer').xp).toBe(210);
    expect(fixture.gameDb.getPlinkoInFlight(spawned.ballId)).toEqual(expect.objectContaining({
      state: 'settled'
    }));
  });

  test('uses one durable keyed debit per real ball in a multi-ball drop', async () => {
    const fixture = createFixture();
    const game = new PlinkoGame(fixture.api, fixture.gameDb, logger);

    const result = await game.spawnBalls(
      'plinko-viewer',
      'Plinko Viewer',
      '',
      20,
      2,
      { forceStart: true }
    );

    expect(result).toEqual(expect.objectContaining({ success: true, ballIds: expect.any(Array) }));
    expect(result.ballIds).toHaveLength(2);
    expect(fixture.viewerDb.getViewerProfile('plinko-viewer').xp).toBe(60);
    expect(fixture.sqlite.prepare(`
      SELECT COUNT(*) AS count FROM viewer_xp_idempotency WHERE action_type = 'plinko_bet'
    `).get().count).toBe(2);
  });

  test('rejects a duplicated durable ball id before a second debit', async () => {
    const fixture = createFixture();
    const game = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    const uuidSpy = jest.spyOn(crypto, 'randomUUID').mockReturnValue('duplicate-ball');

    try {
      const first = await game.spawnBall(
        'plinko-viewer',
        'Plinko Viewer',
        '',
        40,
        'standard'
      );
      const duplicate = await game.spawnBall(
        'plinko-viewer',
        'Plinko Viewer',
        '',
        40,
        'standard'
      );

      expect(first).toEqual(expect.objectContaining({ success: true }));
      expect(duplicate).toEqual(expect.objectContaining({
        success: false,
        error: 'Failed to persist Plinko outcome'
      }));
      expect(fixture.viewerDb.getViewerProfile('plinko-viewer').xp).toBe(60);
      expect(fixture.gameDb.getPlinkoInFlight(first.ballId)).toEqual(expect.objectContaining({
        username: 'plinko-viewer',
        bet: 40,
        state: 'in_flight'
      }));
      expect(fixture.gameDb.getRecoverablePlinkoInFlight()).toHaveLength(1);
    } finally {
      uuidSpy.mockRestore();
    }
  });

  test('keeps a partial durable batch internally consistent and releases it after its last ball', async () => {
    const fixture = createFixture();
    const game = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    const unifiedQueue = { shouldQueue: jest.fn(() => false), completeProcessing: jest.fn() };
    game.setUnifiedQueue(unifiedQueue);
    const originalDeductXP = game.deductXP.bind(game);
    let debitAttempts = 0;
    game.deductXP = jest.fn(async (...args) => {
      debitAttempts += 1;
      if (debitAttempts === 2) return false;
      return originalDeductXP(...args);
    });

    const result = await game.spawnBalls(
      'plinko-viewer',
      'Plinko Viewer',
      '',
      20,
      2,
      { forceStart: true }
    );

    expect(result).toEqual(expect.objectContaining({
      success: true,
      partial: true,
      count: 1,
      totalBet: 20,
      requestedCount: 2,
      requestedTotalBet: 40
    }));
    expect(result.ballIds).toHaveLength(1);
    expect(game.batchTrackers.get(result.batchId)).toEqual(expect.objectContaining({
      remaining: 1,
      totalBet: 20,
      net: -20
    }));

    const activeBall = game.activeBalls.get(result.ballIds[0]);
    activeBall.timestamp = Date.now() - 1_001;
    await game.handleBallLanded(result.ballIds[0], 0);

    expect(game.batchTrackers.has(result.batchId)).toBe(false);
    expect(unifiedQueue.completeProcessing).toHaveBeenCalledTimes(1);
  });
  test('does not release a unified queue for a direct durable single ball', async () => {
    jest.useFakeTimers();
    try {
      const fixture = createFixture();
      const game = new PlinkoGame(fixture.api, fixture.gameDb, logger);
      const unifiedQueue = { shouldQueue: jest.fn(() => false), completeProcessing: jest.fn() };
      game.setUnifiedQueue(unifiedQueue);

      const spawned = await game.spawnBall(
        'plinko-viewer',
        'Plinko Viewer',
        '',
        20,
        'standard'
      );

      expect(spawned).toEqual(expect.objectContaining({ success: true }));
      expect(fixture.gameDb.getPlinkoInFlight(spawned.ballId)).toEqual(expect.objectContaining({
        queueManaged: false
      }));

      const activeBall = game.activeBalls.get(spawned.ballId);
      activeBall.timestamp = Date.now() - 1_001;
      await game.handleBallLanded(spawned.ballId, 0);
      jest.advanceTimersByTime(1_000);

      expect(unifiedQueue.completeProcessing).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  test('does not release a unified queue for a direct durable batch', async () => {
    const fixture = createFixture();
    const game = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    const unifiedQueue = { shouldQueue: jest.fn(() => false), completeProcessing: jest.fn() };
    game.setUnifiedQueue(unifiedQueue);

    const result = await game.spawnBalls(
      'plinko-viewer',
      'Plinko Viewer',
      '',
      20,
      2,
      { testMode: true }
    );

    expect(result).toEqual(expect.objectContaining({ success: true, count: 2 }));
    for (const ballId of result.ballIds) {
      await game.handleBallLanded(ballId, 0);
    }

    expect(unifiedQueue.completeProcessing).not.toHaveBeenCalled();
  });

  test('keeps a zero-count durable tracker until later balls have started', async () => {
    const fixture = createFixture();
    const game = new PlinkoGame(fixture.api, fixture.gameDb, logger);
    const unifiedQueue = { shouldQueue: jest.fn(() => false), completeProcessing: jest.fn() };
    game.setUnifiedQueue(unifiedQueue);
    const originalDeductXP = game.deductXP.bind(game);
    let debitAttempts = 0;
    game.deductXP = jest.fn(async (...args) => {
      debitAttempts += 1;
      if (debitAttempts === 1) return false;
      return originalDeductXP(...args);
    });

    const result = await game.spawnBalls(
      'plinko-viewer',
      'Plinko Viewer',
      '',
      20,
      2,
      { forceStart: true }
    );

    expect(result).toEqual(expect.objectContaining({
      success: true,
      partial: true,
      count: 1,
      totalBet: 20
    }));
    expect(game.batchTrackers.get(result.batchId)).toEqual(expect.objectContaining({
      remaining: 1,
      totalBet: 20,
      net: -20,
      queueManaged: true
    }));

    const activeBall = game.activeBalls.get(result.ballIds[0]);
    activeBall.timestamp = Date.now() - 1_001;
    await game.handleBallLanded(result.ballIds[0], 0);

    expect(game.batchTrackers.has(result.batchId)).toBe(false);
    expect(unifiedQueue.completeProcessing).toHaveBeenCalledTimes(1);
  });

  test('rehydrates a queue-managed force-started single ball and releases the queue once', async () => {
    jest.useFakeTimers();
    try {
      const fixture = createFixture();
      const firstGame = new PlinkoGame(fixture.api, fixture.gameDb, logger);
      const unifiedQueue = { shouldQueue: jest.fn(() => false), completeProcessing: jest.fn() };
      firstGame.setUnifiedQueue(unifiedQueue);

      const spawned = await firstGame.spawnBalls(
        'plinko-viewer',
        'Plinko Viewer',
        '',
        20,
        1,
        { batchId: 'queue-managed-single', forceStart: true }
      );

      expect(fixture.gameDb.getPlinkoInFlight(spawned.ballIds[0])).toEqual(expect.objectContaining({
        queueManaged: true
      }));

      const reloadedGame = new PlinkoGame(fixture.api, fixture.gameDb, logger);
      reloadedGame.setUnifiedQueue(unifiedQueue);
      await reloadedGame.recoverInFlightBalls();
      expect(reloadedGame.activeBalls.get(spawned.ballIds[0])).toEqual(expect.objectContaining({
        queueManaged: true
      }));

      reloadedGame.activeBalls.get(spawned.ballIds[0]).timestamp = Date.now() - 1_001;
      await reloadedGame.handleBallLanded(spawned.ballIds[0], 0);
      jest.advanceTimersByTime(1_000);
      expect(unifiedQueue.completeProcessing).toHaveBeenCalledTimes(1);

      await reloadedGame.handleBallLanded(spawned.ballIds[0], 0);
      jest.advanceTimersByTime(1_000);
      expect(unifiedQueue.completeProcessing).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('releases an actual Unified Queue single-ball job exactly once', async () => {
    jest.useFakeTimers();
    let queue;
    try {
      const fixture = createFixture();
      const game = new PlinkoGame(fixture.api, fixture.gameDb, logger);
      queue = new UnifiedQueueManager(logger, fixture.socket);
      queue.setPlinkoGame(game);
      game.setUnifiedQueue(queue);
      const completeProcessing = jest.spyOn(queue, 'completeProcessing');
      const dropData = {
        username: 'plinko-viewer',
        nickname: 'Plinko Viewer',
        profilePictureUrl: '',
        betAmount: 20,
        count: 1,
        batchId: 'actual-unified-queue-single'
      };

      queue.isProcessing = true;
      queue.currentItem = { type: 'plinko', data: dropData };
      await queue.processPlinkoItem(dropData);

      const [ballId] = game.activeBalls.keys();
      expect(game.activeBalls.get(ballId)).toEqual(expect.objectContaining({
        queueManaged: true
      }));

      game.activeBalls.get(ballId).timestamp = Date.now() - 1_001;
      await game.handleBallLanded(ballId, 0);
      jest.advanceTimersByTime(1_000);
      expect(completeProcessing).toHaveBeenCalledTimes(1);

      await game.handleBallLanded(ballId, 0);
      jest.advanceTimersByTime(1_000);
      expect(completeProcessing).toHaveBeenCalledTimes(1);
    } finally {
      queue?.destroy();
      jest.useRealTimers();
    }
  });
});
