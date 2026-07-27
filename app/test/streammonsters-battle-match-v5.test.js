const Database = require('better-sqlite3');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const BattleService = require('../plugins/streamalchemy/backend/streammonsters/battle-service');
const ChatCommands = require('../plugins/streamalchemy/backend/streammonsters/chat-commands');
const ProgressionService = require(
  '../plugins/streamalchemy/backend/streammonsters/progression-service'
);
const BattleMatchService = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
);
const {
  PASSIVE_CHARGE_PER_SECOND,
  projectPassiveCharge
} = require('../plugins/streamalchemy/backend/streammonsters/battle-charge');

test('adds five charge per completed active-window second and caps at 100', () => {
  expect(PASSIVE_CHARGE_PER_SECOND).toBe(5);
  expect(projectPassiveCharge({
    baseCharge: 70,
    openedAtMs: 1_000,
    deadlineMs: 7_000,
    asOfMs: 1_999
  })).toBe(70);
  expect(projectPassiveCharge({
    baseCharge: 70,
    openedAtMs: 1_000,
    deadlineMs: 7_000,
    asOfMs: 4_100
  })).toBe(85);
  expect(projectPassiveCharge({
    baseCharge: 95,
    openedAtMs: 1_000,
    deadlineMs: 7_000,
    asOfMs: 9_000
  })).toBe(100);
});

function createStore(filename = ':memory:', options = {}) {
  const sqlite = new Database(filename);
  sqlite.pragma('foreign_keys = ON');
  const store = new StreamMonstersDatabase(sqlite, options);
  store.initialize();
  return { sqlite, store };
}

function insertMonster(sqlite, {
  id,
  userId,
  name = id,
  templateId = 'ashfang',
  element = 'Ember',
  level = 1,
  selected = true,
  stats = { vitality: 10, might: 10, guard: 10, agility: 10 }
}) {
  sqlite.prepare(`
    INSERT INTO streammonsters_monsters (
      monster_id, user_id, egg_id, name, element, rarity, level, xp,
      stats_json, personality, template_id, is_selected, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, 'Common', ?, 0, ?, 'Adaptive', ?, ?, ?)
  `).run(
    id,
    userId,
    `egg-${id}`,
    name,
    element,
    level,
    JSON.stringify(stats),
    templateId,
    selected ? 1 : 0,
    1
  );
}

function createMatchService({
  store,
  now,
  emit = jest.fn(),
  collection = null,
  progression = null,
  getStreamKey = () => null,
  logger = null,
  rulesVersion = 5,
  autoStart = false
}) {
  return new BattleMatchService({
    store,
    battleService: new BattleService({ store, now }),
    emit,
    collection,
    progression,
    getStreamKey,
    now,
    logger,
    rulesVersion,
    autoStart
  });
}

function createReservedRulesV7Match({
  chargeA = 95,
  chargeB = 70,
  openedAtMs = 10_000
} = {}) {
  let nowMs = openedAtMs;
  const { sqlite, store } = createStore();
  insertMonster(sqlite, { id: 'alpha-v7', userId: 'viewer-a' });
  insertMonster(sqlite, {
    id: 'beta-v7',
    userId: 'viewer-b',
    element: 'Tide',
    templateId: 'ripple'
  });
  const service = createMatchService({
    store,
    now: () => nowMs,
    rulesVersion: 7
  });
  service.join({ userId: 'viewer-a' });
  const reserved = service.join({ userId: 'viewer-b' });
  service.lockRoster({ userId: 'viewer-a' });
  service.lockRoster({ userId: 'viewer-b' });
  const match = service.getMatch(reserved.match.matchId);
  sqlite.prepare(`
    UPDATE streammonsters_match_participants
    SET combat_state_json = ?
    WHERE match_id = ? AND viewer_id = ?
  `).run(JSON.stringify({ charge: chargeA }), match.matchId, 'viewer-a');
  sqlite.prepare(`
    UPDATE streammonsters_match_participants
    SET combat_state_json = ?
    WHERE match_id = ? AND viewer_id = ?
  `).run(JSON.stringify({ charge: chargeB }), match.matchId, 'viewer-b');
  return {
    sqlite,
    service,
    matchId: match.matchId,
    advance: milliseconds => { nowMs += milliseconds; },
    decisions: () => sqlite.prepare(`
      SELECT * FROM streammonsters_match_decisions
      WHERE match_id = ? ORDER BY participant_id
    `).all(match.matchId)
  };
}

describe('Stream Monsters durable rules-v5 match schema', () => {
  test('adds durable match, ordered replay, stat and Arena ledgers without replacing v3 battles', () => {
    const { sqlite } = createStore();
    const tables = sqlite.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'streammonsters_%'
    `).all().map(row => row.name);

    expect(tables).toEqual(expect.arrayContaining([
      'streammonsters_battles',
      'streammonsters_matches',
      'streammonsters_match_participants',
      'streammonsters_match_decisions',
      'streammonsters_match_actions',
      'streammonsters_match_events',
      'streammonsters_match_rewards',
      'streammonsters_stat_prompts',
      'streammonsters_stat_allocations',
      'streammonsters_arena_seasons',
      'streammonsters_arena_ratings',
      'streammonsters_arena_daily_ledger'
    ]));
    expect(sqlite.prepare('PRAGMA table_info(streammonsters_monsters)').all()
      .map(column => column.name)).toContain('unspent_stat_points');
    expect(sqlite.prepare('PRAGMA table_info(streammonsters_battles)').all()
      .map(column => column.name)).toEqual(expect.arrayContaining([
        'match_id', 'replay_version'
      ]));
    expect(sqlite.prepare('PRAGMA table_info(streammonsters_match_actions)').all()
      .map(column => column.name)).toContain('event_sequence');
    expect(sqlite.prepare('PRAGMA table_info(streammonsters_match_decisions)').all()
      .map(column => column.name)).toContain('event_sequence');
    expect(sqlite.prepare('PRAGMA table_info(streammonsters_matches)').all()
      .map(column => column.name)).toContain('action_opened_at_ms');
    expect(sqlite.prepare('PRAGMA table_info(streammonsters_match_decisions)').all()
      .map(column => column.name)).toContain('charge_at_choice');
  });

  test('isolates and logs failing afterCommit callbacks while later callbacks still run', () => {
    const errors = [];
    const { store } = createStore(':memory:', {
      logger: { error: message => errors.push(String(message)) }
    });
    const reached = jest.fn();

    expect(() => store.runInImmediateTransaction(() => {
      store.afterCommit(() => {
        throw new Error('first callback failed');
      });
      store.afterCommit(reached);
    })).not.toThrow();
    expect(reached).toHaveBeenCalledTimes(1);
    expect(errors.join('\n')).toContain('first callback failed');
  });
});

describe('Stream Monsters durable BattleMatchService', () => {
  test('Rules v7 rejects early C without a lock and accepts it at the first full tick', () => {
    const { service, advance, decisions } = createReservedRulesV7Match({
      chargeA: 95,
      openedAtMs: 10_000
    });
    advance(999);
    expect(service.submitChoice({ userId: 'viewer-a', choice: 'C' }))
      .toEqual(expect.objectContaining({ handled: false, reason: 'special_not_charged' }));
    expect(decisions()).toHaveLength(0);
    advance(1);
    expect(service.submitChoice({ userId: 'viewer-a', choice: 'C' }))
      .toEqual(expect.objectContaining({ handled: true }));
    expect(decisions()).toHaveLength(1);
    expect(decisions()[0].charge_at_choice).toBe(100);
  });

  test('Rules v7 materializes both charges at the second lock timestamp', () => {
    const { sqlite, service, matchId, advance, decisions } = createReservedRulesV7Match({
      chargeA: 95,
      chargeB: 70,
      openedAtMs: 10_000
    });
    advance(1_000);
    service.submitChoice({ userId: 'viewer-a', choice: 'C', eventId: 'v7-a' });
    service.submitChoice({ userId: 'viewer-b', choice: 'A', eventId: 'v7-b' });

    expect(decisions().map(decision => decision.charge_at_choice).sort((a, b) => a - b))
      .toEqual([75, 100]);
    const actions = sqlite.prepare(`
      SELECT action_json FROM streammonsters_match_actions
      WHERE match_id = ? ORDER BY sequence
    `).all(matchId).map(row => JSON.parse(row.action_json));
    expect(Object.fromEntries(actions.map(action => [action.actorId, action.before.actor.charge])))
      .toEqual({ 'alpha-v7': 100, 'beta-v7': 75 });
  });

  test('Rules v7 timeout charge uses the persisted action deadline', () => {
    const { service, advance, decisions } = createReservedRulesV7Match({
      chargeA: 70,
      chargeB: 70,
      openedAtMs: 20_000
    });
    advance(60_000);
    expect(service.sweep().actionsExpired).toBe(1);
    expect(decisions().map(decision => decision.charge_at_choice)).toEqual([100, 100]);
  });

  test('Rules v7 reconstruction does not double passive charge mid-window', () => {
    const original = createReservedRulesV7Match({
      chargeA: 70,
      chargeB: 70,
      openedAtMs: 30_000
    });
    original.advance(1_000);
    const recovered = createMatchService({
      store: original.service.store,
      now: () => 31_000,
      rulesVersion: 7
    });
    expect(recovered.getActiveMatchForViewer('viewer-a').actionOpenedAtMs).toBe(30_000);
    recovered.submitChoice({ userId: 'viewer-a', choice: 'A', eventId: 'reload-a' });
    recovered.submitChoice({ userId: 'viewer-b', choice: 'A', eventId: 'reload-b' });
    expect(original.decisions().map(decision => decision.charge_at_choice)).toEqual([75, 75]);
  });

  test('applies Arena season duration changes without requiring a plugin reload', () => {
    const { store } = createStore();
    const nowMs = Date.parse('2026-07-21T12:00:00Z');
    const service = createMatchService({ store, now: () => nowMs });

    service.setSeasonDurationDays(14);
    const fortnight = service.getCurrentArenaSeason();
    expect(fortnight).toEqual(expect.objectContaining({ durationDays: 14 }));
    expect(fortnight.endsAtMs - fortnight.startsAtMs)
      .toBe(14 * 24 * 60 * 60 * 1000);

    service.setSeasonDurationDays(90);
    const long = service.getCurrentArenaSeason();
    expect(long).toEqual(expect.objectContaining({ durationDays: 90 }));
    expect(long.seasonId).not.toBe(fortnight.seasonId);
  });

  test('has a dedicated persistent state-machine owner', () => {
    expect(() => require(
      '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
    )).not.toThrow();
  });

  test('atomically reserves two queued viewers and reconstructs the active roster window', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'alpha', userId: 'viewer-a', level: 5 });
    insertMonster(sqlite, {
      id: 'beta',
      userId: 'viewer-b',
      level: 7,
      element: 'Tide',
      templateId: 'ripple'
    });
    let nowMs = 10_000;
    const first = createMatchService({ store, now: () => nowMs });
    expect(first.join({ userId: 'viewer-a' })).toEqual(expect.objectContaining({
      status: 'queued'
    }));

    const joined = first.join({ userId: 'viewer-b' });
    expect(joined).toEqual(expect.objectContaining({
      status: 'reserved',
      match: expect.objectContaining({
        state: 'roster',
        rosterDeadlineMs: 25_000
      })
    }));
    expect(store.getBattleQueue()).toEqual([]);
    expect(sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_match_participants
      WHERE match_id = ? AND active = 1
    `).get(joined.match.matchId).count).toBe(2);

    const recovered = createMatchService({ store, now: () => nowMs });
    expect(recovered.getActiveMatchForViewer('viewer-a')).toEqual(
      expect.objectContaining({
        matchId: joined.match.matchId,
        state: 'roster',
        rosterDeadlineMs: 25_000
      })
    );
    expect(() => first.join({ userId: 'viewer-a' })).not.toThrow();
    expect(first.join({ userId: 'viewer-a' })).toEqual(expect.objectContaining({
      status: 'active',
      match: expect.objectContaining({ matchId: joined.match.matchId })
    }));
  });

  test('prevents a viewer from queueing a low-level monster and swapping to an unfair roster', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'fair-anchor-a',
      userId: 'viewer-fair-a',
      level: 1
    });
    insertMonster(sqlite, {
      id: 'fair-swap-a',
      userId: 'viewer-fair-a',
      level: 20,
      selected: false
    });
    insertMonster(sqlite, {
      id: 'fair-anchor-b',
      userId: 'viewer-fair-b',
      level: 1,
      element: 'Tide',
      templateId: 'ripple'
    });
    const service = createMatchService({ store, now: () => 10_000 });
    service.join({ userId: 'viewer-fair-a' });
    const joined = service.join({ userId: 'viewer-fair-b' });

    expect(joined.status).toBe('reserved');
    expect(service.lockRoster({
      userId: 'viewer-fair-a',
      monsterId: 'fair-swap-a'
    })).toEqual(expect.objectContaining({
      accepted: false,
      reason: 'monster_out_of_match_range',
      allowedLevelGap: 2
    }));
    expect(service.lockRoster({
      userId: 'viewer-fair-a',
      monsterId: 'fair-anchor-a'
    })).toEqual(expect.objectContaining({ accepted: true }));
  });

  test('lets either participant cancel during roster selection exactly once without rewards', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'cancel-a', userId: 'viewer-cancel-a' });
    insertMonster(sqlite, {
      id: 'cancel-b',
      userId: 'viewer-cancel-b',
      element: 'Tide',
      templateId: 'ripple'
    });
    const emit = jest.fn();
    const service = createMatchService({ store, now: () => 1_000, emit });
    service.join({ userId: 'viewer-cancel-a' });
    const joined = service.join({ userId: 'viewer-cancel-b' });

    expect(service.cancelBeforeBattle('viewer-cancel-b')).toEqual({
      cancelled: true,
      matchId: joined.match.matchId
    });
    expect(service.cancelBeforeBattle('viewer-cancel-a')).toEqual({
      cancelled: false,
      reason: 'no_roster_match'
    });
    expect(service.getMatch(joined.match.matchId)).toEqual(
      expect.objectContaining({ state: 'cancelled' })
    );
    expect(service.getActiveMatchForViewer('viewer-cancel-a')).toBeNull();
    expect(sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_match_rewards WHERE match_id = ?
    `).get(joined.match.matchId).count).toBe(0);
    expect(emit.mock.calls.filter(([event]) => (
      event === 'streammonsters:battle_cancelled'
    ))).toHaveLength(1);
  });

  test('dry-runs and idempotently cancels only stale roster or action matches without rewards', () => {
    const { sqlite, store } = createStore();
    [
      ['repair-a', 'viewer-repair-a', 'Ember', 'ashfang'],
      ['repair-b', 'viewer-repair-b', 'Tide', 'ripple'],
      ['repair-c', 'viewer-repair-c', 'Grove', 'oakheart'],
      ['repair-d', 'viewer-repair-d', 'Gale', 'zephyr']
    ].forEach(([id, userId, element, templateId]) => insertMonster(sqlite, {
      id,
      userId,
      element,
      templateId
    }));
    let nowMs = 1_000;
    const service = createMatchService({ store, now: () => nowMs });
    service.join({ userId: 'viewer-repair-a' });
    const actionMatch = service.join({ userId: 'viewer-repair-b' }).match;
    service.lockRoster({ userId: 'viewer-repair-a' });
    service.lockRoster({ userId: 'viewer-repair-b' });
    service.join({ userId: 'viewer-repair-c' });
    const rosterMatch = service.join({ userId: 'viewer-repair-d' }).match;

    nowMs = 100_000;
    expect(service.repairStaleMatches({ dryRun: true, graceMs: 60_000 }))
      .toEqual({ dryRun: true, candidates: 2, cancelled: 0 });
    expect(service.getMatch(actionMatch.matchId).state).toBe('action');
    expect(service.getMatch(rosterMatch.matchId).state).toBe('roster');

    expect(service.repairStaleMatches({ dryRun: false, graceMs: 60_000 }))
      .toEqual({ dryRun: false, candidates: 2, cancelled: 2 });
    expect(service.getMatch(actionMatch.matchId).state).toBe('cancelled');
    expect(service.getMatch(rosterMatch.matchId).state).toBe('cancelled');
    expect(service.repairStaleMatches({ dryRun: false, graceMs: 60_000 }))
      .toEqual({ dryRun: false, candidates: 0, cancelled: 0 });
    expect(sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_match_rewards
    `).get().count).toBe(0);
  });

  test('deduplicates concurrent locks from real worker threads using separate SQLite connections', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-v5-'));
    const filename = path.join(tempDir, 'matches.sqlite');
    const { sqlite, store } = createStore(filename);
    try {
      insertMonster(sqlite, { id: 'alpha', userId: 'viewer-a' });
      insertMonster(sqlite, {
        id: 'beta',
        userId: 'viewer-b',
        element: 'Tide',
        templateId: 'ripple'
      });
      const service = createMatchService({ store, now: () => 1_000 });
      service.join({ userId: 'viewer-a' });
      const joined = service.join({ userId: 'viewer-b' });
      service.lockRoster({ userId: 'viewer-a' });
      service.lockRoster({ userId: 'viewer-b' });

      const workerSource = `
        const { parentPort, workerData } = require('worker_threads');
        const Database = require(workerData.sqliteModule);
        const Store = require(workerData.storeModule);
        const MatchService = require(workerData.serviceModule);
        const sqlite = new Database(workerData.filename);
        sqlite.pragma('busy_timeout = 5000');
        const store = new Store(sqlite);
        const service = new MatchService({
          store,
          battleService: {},
          now: () => 1000,
          autoStart: false
        });
        const result = service.submitChoice(workerData.choice);
        sqlite.close();
        parentPort.postMessage(result);
      `;
      const modules = {
        filename,
        sqliteModule: require.resolve('better-sqlite3'),
        storeModule: require.resolve(
          '../plugins/streamalchemy/backend/streammonsters/database'
        ),
        serviceModule: require.resolve(
          '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
        )
      };
      const runWorker = choice => new Promise((resolve, reject) => {
        const worker = new Worker(workerSource, {
          eval: true,
          workerData: { ...modules, choice }
        });
        worker.once('message', resolve);
        worker.once('error', reject);
      });

      const results = await Promise.all([
        runWorker({ userId: 'viewer-a', choice: 'A', eventId: 'concurrent-a' }),
        runWorker({ userId: 'viewer-a', choice: 'B', eventId: 'concurrent-b' })
      ]);

      expect(results.filter(result => result.handled)).toHaveLength(1);
      expect(results.filter(result => result.reason === 'already_locked')).toHaveLength(1);
      expect(sqlite.prepare(`
        SELECT COUNT(*) AS count FROM streammonsters_match_decisions
        WHERE match_id = ? AND participant_id = ?
          AND window_kind = 'action' AND window_sequence = 1
      `).get(
        joined.match.matchId,
        joined.match.participants.find(entry => entry.viewerId === 'viewer-a').participantId
      ).count).toBe(1);
    } finally {
      sqlite.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('atomically turns a real two-connection queue race into exactly one reservation', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-queue-race-'));
    const filename = path.join(tempDir, 'matches.sqlite');
    const { sqlite } = createStore(filename);
    const workers = [];
    try {
      insertMonster(sqlite, { id: 'alpha', userId: 'viewer-a', level: 5 });
      insertMonster(sqlite, {
        id: 'beta',
        userId: 'viewer-b',
        level: 5,
        element: 'Tide',
        templateId: 'ripple'
      });
      const gate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
      const workerSource = `
        const { parentPort, workerData } = require('worker_threads');
        const Database = require(workerData.sqliteModule);
        const Store = require(workerData.storeModule);
        const MatchService = require(workerData.serviceModule);
        const BattleService = require(workerData.battleModule);
        const gate = new Int32Array(workerData.gate);
        const sqlite = new Database(workerData.filename);
        sqlite.pragma('busy_timeout = 5000');
        const store = new Store(sqlite);
        const service = new MatchService({
          store,
          battleService: new BattleService({ store }),
          now: () => 1000,
          autoStart: false
        });
        parentPort.postMessage({ ready: true });
        Atomics.wait(gate, 0, 0);
        const result = service.join({ userId: workerData.userId });
        sqlite.close();
        parentPort.postMessage({ result });
      `;
      const modules = {
        filename,
        gate,
        sqliteModule: require.resolve('better-sqlite3'),
        storeModule: require.resolve(
          '../plugins/streamalchemy/backend/streammonsters/database'
        ),
        serviceModule: require.resolve(
          '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
        ),
        battleModule: require.resolve(
          '../plugins/streamalchemy/backend/streammonsters/battle-service'
        )
      };
      const startWorker = userId => {
        const worker = new Worker(workerSource, {
          eval: true,
          workerData: { ...modules, userId }
        });
        workers.push(worker);
        return new Promise((resolve, reject) => {
          worker.once('message', ready => {
            if (!ready.ready) reject(new Error('worker_not_ready'));
            else resolve();
          });
          worker.once('error', reject);
        });
      };
      await Promise.all([startWorker('viewer-a'), startWorker('viewer-b')]);
      const results = workers.map(worker => new Promise((resolve, reject) => {
        worker.once('message', message => resolve(message.result));
        worker.once('error', reject);
      }));
      const gateView = new Int32Array(gate);
      Atomics.store(gateView, 0, 1);
      Atomics.notify(gateView, 0, workers.length);
      const joined = await Promise.all(results);

      expect(joined.map(result => result.status).sort()).toEqual(['queued', 'reserved']);
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM streammonsters_matches').get().count)
        .toBe(1);
      expect(sqlite.prepare(`
        SELECT COUNT(*) AS count FROM streammonsters_match_participants WHERE active = 1
      `).get().count).toBe(2);
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM streammonsters_battle_queue')
        .get().count).toBe(0);
    } finally {
      await Promise.all(workers.map(worker => worker.terminate()));
      sqlite.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('widens beyond +/-2 only after 30s and avoids a closer recent rematch', () => {
    const { sqlite, store } = createStore();
    [
      ['target', 'viewer-target', 8],
      ['near', 'viewer-near', 11],
      ['far', 'viewer-far', 11],
      ['rematch', 'viewer-rematch', 11]
    ].forEach(([id, userId, level]) => insertMonster(sqlite, { id, userId, level }));
    let nowMs = 100_000;
    const service = createMatchService({ store, now: () => nowMs });
    const season = service.getCurrentArenaSeason();
    service.setArenaRating(season.seasonId, 'viewer-target', 1000);
    service.setArenaRating(season.seasonId, 'viewer-near', 1010);
    service.setArenaRating(season.seasonId, 'viewer-far', 1200);
    service.setArenaRating(season.seasonId, 'viewer-rematch', 1005);
    store.enqueueBattle({
      userId: 'viewer-near',
      monsterId: 'near',
      stance: 'adaptive',
      queuedAtMs: nowMs
    });
    store.enqueueBattle({
      userId: 'viewer-far',
      monsterId: 'far',
      stance: 'adaptive',
      queuedAtMs: nowMs
    });
    store.enqueueBattle({
      userId: 'viewer-rematch',
      monsterId: 'rematch',
      stance: 'adaptive',
      queuedAtMs: nowMs - 1_000
    });
    sqlite.prepare(`
      INSERT INTO streammonsters_battles (
        battle_id, seed, monster_a_id, monster_b_id, winner_monster_id,
        user_a_id, user_b_id, result_json, created_at_ms
      ) VALUES ('old-rematch', 'old', 'target', 'rematch', 'target', ?, ?, '{}', ?)
    `).run('viewer-target', 'viewer-rematch', nowMs - 60_000);

    const queued = service.join({ userId: 'viewer-target' });
    expect(queued.status).toBe('queued');
    nowMs += 30_000;
    const result = service.reserveBestMatch('viewer-target');

    expect(result.participants.map(participant => participant.viewerId)).toEqual(
      expect.arrayContaining(['viewer-target', 'viewer-near'])
    );
  });

  test('widens the Arena rating band every 30 seconds and rematches queued viewers on sweep', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'rated-a', userId: 'viewer-rated-a', level: 5 });
    insertMonster(sqlite, {
      id: 'rated-b',
      userId: 'viewer-rated-b',
      level: 5,
      element: 'Tide',
      templateId: 'ripple'
    });
    let nowMs = 10_000;
    const service = createMatchService({ store, now: () => nowMs });
    const season = service.getCurrentArenaSeason();
    service.setArenaRating(season.seasonId, 'viewer-rated-a', 900);
    service.setArenaRating(season.seasonId, 'viewer-rated-b', 1_250);

    expect(service.join({ userId: 'viewer-rated-a' }).status).toBe('queued');
    expect(service.join({ userId: 'viewer-rated-b' }).status).toBe('queued');
    expect(store.getBattleQueue()).toHaveLength(2);

    nowMs += 60_000;
    expect(service.sweep()).toEqual(expect.objectContaining({ matchesReserved: 1 }));
    expect(store.getBattleQueue()).toEqual([]);
    expect(service.getActiveMatchForViewer('viewer-rated-a')).toEqual(
      expect.objectContaining({ state: 'roster' })
    );
  });

  test('reload preserves a persistent queue until the concrete stream identity can recover it', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'reload-a', userId: 'viewer-reload-a' });
    insertMonster(sqlite, {
      id: 'reload-b',
      userId: 'viewer-reload-b',
      element: 'Tide',
      templateId: 'ripple'
    });
    const nowMs = 1_000_000;
    store.enqueueBattle({
      userId: 'viewer-reload-a',
      monsterId: 'reload-a',
      stance: 'adaptive',
      streamKey: 'stream-live',
      queuedAtMs: nowMs - 1_000
    });
    store.enqueueBattle({
      userId: 'viewer-reload-b',
      monsterId: 'reload-b',
      stance: 'adaptive',
      streamKey: 'stream-live',
      queuedAtMs: nowMs - 500
    });

    let activeStreamKey = null;
    const service = createMatchService({
      store,
      now: () => nowMs,
      getStreamKey: () => activeStreamKey,
      autoStart: true
    });
    try {
      expect(store.getBattleQueue().map(entry => entry.user_id)).toEqual([
        'viewer-reload-a',
        'viewer-reload-b'
      ]);
      expect(service.getActiveMatchForViewer('viewer-reload-a')).toBeNull();
      expect(service.safeSweep()).toEqual(expect.objectContaining({
        matchesReserved: 0,
        queuePurged: 0
      }));
      activeStreamKey = 'stream-live';
      expect(service.safeSweep()).toEqual(expect.objectContaining({
        matchesReserved: 1,
        queuePurged: 0
      }));
      expect(store.getBattleQueue()).toEqual([]);
      expect(service.getActiveMatchForViewer('viewer-reload-a')).toEqual(
        expect.objectContaining({ state: 'roster' })
      );
    } finally {
      service.destroy();
    }
  });

  test('a resolved stream sweep purges and recovers only its matching queue rows', () => {
    const { sqlite, store } = createStore();
    [
      ['stale-current', 'viewer-stale-current', 'Ember', 'ashfang'],
      ['current-a', 'viewer-current-a', 'Tide', 'ripple'],
      ['current-b', 'viewer-current-b', 'Grove', 'oakheart'],
      ['foreign-a', 'viewer-foreign-a', 'Gale', 'zephyr'],
      ['foreign-b', 'viewer-foreign-b', 'Volt', 'pulse']
    ].forEach(([id, userId, element, templateId]) => insertMonster(sqlite, {
      id,
      userId,
      element,
      templateId
    }));
    const nowMs = 1_000_000;
    store.enqueueBattle({
      userId: 'viewer-stale-current',
      monsterId: 'stale-current',
      stance: 'adaptive',
      streamKey: 'stream-current',
      queuedAtMs: nowMs - (11 * 60 * 1000)
    });
    store.enqueueBattle({
      userId: 'viewer-current-a',
      monsterId: 'current-a',
      stance: 'adaptive',
      streamKey: 'stream-current',
      queuedAtMs: nowMs - 1_000
    });
    store.enqueueBattle({
      userId: 'viewer-current-b',
      monsterId: 'current-b',
      stance: 'adaptive',
      streamKey: 'stream-current',
      queuedAtMs: nowMs - 500
    });
    store.enqueueBattle({
      userId: 'viewer-foreign-a',
      monsterId: 'foreign-a',
      stance: 'adaptive',
      streamKey: 'stream-foreign',
      queuedAtMs: nowMs - 900
    });
    store.enqueueBattle({
      userId: 'viewer-foreign-b',
      monsterId: 'foreign-b',
      stance: 'adaptive',
      streamKey: 'stream-foreign',
      queuedAtMs: nowMs - 400
    });
    const service = createMatchService({
      store,
      now: () => nowMs,
      getStreamKey: () => 'stream-current'
    });

    expect(service.sweep()).toEqual(expect.objectContaining({
      matchesReserved: 1,
      queuePurged: 1
    }));
    expect(store.getBattleQueue().map(entry => entry.user_id)).toEqual([
      'viewer-foreign-a',
      'viewer-foreign-b'
    ]);
    expect(service.getActiveMatchForViewer('viewer-current-a')).toEqual(
      expect.objectContaining({ state: 'roster' })
    );
    expect(service.getActiveMatchForViewer('viewer-foreign-a')).toBeNull();
  });

  test('locks roster snapshots, accepts only the first authorized A/B/C and resolves both-ready immediately', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'alpha',
      userId: 'viewer-a',
      stats: { vitality: 10, might: 30, guard: 10, agility: 30 }
    });
    insertMonster(sqlite, {
      id: 'beta',
      userId: 'viewer-b',
      element: 'Tide',
      templateId: 'ripple',
      stats: { vitality: 10, might: 10, guard: 10, agility: 1 }
    });
    let nowMs = 1_000;
    const service = createMatchService({ store, now: () => nowMs });
    service.join({ userId: 'viewer-a' });
    const { match } = service.join({ userId: 'viewer-b' });

    expect(service.lockRoster({ userId: 'viewer-a' })).toEqual(
      expect.objectContaining({ accepted: true, waiting: true })
    );
    expect(service.lockRoster({ userId: 'viewer-b' })).toEqual(
      expect.objectContaining({
        accepted: true,
        match: expect.objectContaining({
          state: 'action',
          roundNumber: 1,
          actionDeadlineMs: 9_000
        })
      })
    );
    expect(service.submitChoice({
      userId: 'bystander',
      choice: 'A',
      eventId: 'foreign'
    })).toEqual({ handled: false, reason: 'no_active_window' });
    expect(service.submitChoice({
      userId: 'viewer-a',
      choice: 'A',
      eventId: 'choice-a'
    })).toEqual(expect.objectContaining({ handled: true, waiting: true }));
    expect(service.submitChoice({
      userId: 'viewer-a',
      choice: 'B',
      eventId: 'choice-a-duplicate'
    })).toEqual({ handled: false, reason: 'already_locked' });

    const ready = service.submitChoice({
      userId: 'viewer-b',
      choice: 'B',
      eventId: 'choice-b'
    });
    expect(ready).toEqual(expect.objectContaining({
      handled: true,
      waiting: false,
      match: expect.objectContaining({ roundNumber: 2 })
    }));
    expect(sqlite.prepare(`
      SELECT sequence FROM streammonsters_match_actions
      WHERE match_id = ? ORDER BY sequence
    `).all(match.matchId).map(row => row.sequence)).toEqual([1, 2]);
    expect(service.submitChoice({
      userId: 'viewer-b',
      choice: 'B',
      eventId: 'choice-b'
    })).toEqual({ handled: false, reason: 'duplicate_event' });
    nowMs = 10_001;
    expect(service.submitChoice({
      userId: 'viewer-a',
      choice: 'A',
      eventId: 'late-round-two'
    })).toEqual({ handled: false, reason: 'no_active_window' });
  });

  test('recovers expired roster/action windows deterministically and clears its timer on destroy', () => {
    jest.useFakeTimers();
    try {
      const { sqlite, store } = createStore();
      insertMonster(sqlite, { id: 'alpha', userId: 'viewer-a' });
      insertMonster(sqlite, {
        id: 'beta',
        userId: 'viewer-b',
        element: 'Tide',
        templateId: 'ripple'
      });
      let nowMs = 1_000;
      const service = new BattleMatchService({
        store,
        battleService: new BattleService({ store, now: () => nowMs }),
        now: () => nowMs,
        sweepIntervalMs: 500,
        autoStart: true
      });
      service.join({ userId: 'viewer-a' });
      const joined = service.join({ userId: 'viewer-b' });
      nowMs = 16_001;
      expect(service.sweep()).toEqual(expect.objectContaining({
        rosterExpired: 1
      }));
      expect(service.getMatch(joined.match.matchId)).toEqual(
        expect.objectContaining({ state: 'action', roundNumber: 1 })
      );
      nowMs = 24_002;
      expect(service.sweep()).toEqual(expect.objectContaining({
        actionsExpired: 1
      }));
      const decisions = sqlite.prepare(`
        SELECT source, choice FROM streammonsters_match_decisions
        WHERE match_id = ? AND window_kind = 'action'
        ORDER BY participant_id
      `).all(joined.match.matchId);
      expect(decisions).toHaveLength(2);
      expect(decisions.every(decision => decision.source === 'timeout')).toBe(true);
      expect(service.getPublicNormalizedReplay(joined.match.matchId).decisions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            round: 1,
            window: 'action',
            choice: expect.stringMatching(/^[ABC]$/),
            source: 'timeout',
            timeout: true,
            sequence: expect.any(Number)
          })
        ])
      );

      expect(jest.getTimerCount()).toBeGreaterThan(0);
      service.destroy();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test('isolates stale roster and callback failures so timer recovery continues and cleans up', () => {
    jest.useFakeTimers();
    const errors = [];
    try {
      const { sqlite, store } = createStore(':memory:', {
        logger: { error: message => errors.push(String(message)) }
      });
      [
        ['stale-a', 'viewer-stale-a', 'Ember', 'ashfang'],
        ['stale-b', 'viewer-stale-b', 'Tide', 'ripple'],
        ['healthy-a', 'viewer-healthy-a', 'Grove', 'oakheart'],
        ['healthy-b', 'viewer-healthy-b', 'Gale', 'zephyr']
      ].forEach(([id, userId, element, templateId]) => insertMonster(sqlite, {
        id,
        userId,
        element,
        templateId
      }));
      let nowMs = 1_000;
      const service = createMatchService({
        store,
        now: () => nowMs,
        logger: { error: message => errors.push(String(message)) },
        emit: () => {
          throw new Error('socket unavailable');
        },
        autoStart: true
      });
      service.join({ userId: 'viewer-stale-a' });
      const stale = service.join({ userId: 'viewer-stale-b' }).match;
      service.join({ userId: 'viewer-healthy-a' });
      const healthy = service.join({ userId: 'viewer-healthy-b' }).match;
      sqlite.prepare(`
        DELETE FROM streammonsters_monsters
        WHERE monster_id IN ('stale-a', 'stale-b')
      `).run();

      nowMs = 16_000;
      expect(() => jest.advanceTimersByTime(1_000)).not.toThrow();
      expect(service.getMatch(stale.matchId)).toEqual(expect.objectContaining({
        state: 'cancelled'
      }));
      expect(service.getMatch(healthy.matchId)).toEqual(expect.objectContaining({
        state: 'action',
        roundNumber: 1
      }));
      expect(errors.join('\n')).toContain('socket unavailable');

      const originalRecovery = service.recoverActionMatch.bind(service);
      let injected = false;
      service.recoverActionMatch = matchId => {
        if (!injected) {
          injected = true;
          throw new Error(`injected recovery failure:${matchId}`);
        }
        return originalRecovery(matchId);
      };
      nowMs = 24_000;
      expect(() => jest.advanceTimersByTime(1_000)).not.toThrow();
      expect(errors.join('\n')).toContain('injected recovery failure');

      expect(jest.getTimerCount()).toBeGreaterThan(0);
      service.destroy();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test('uses an exclusive roster/action/stat deadline consistently across two connections', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-deadline-'));
    const filename = path.join(tempDir, 'matches.sqlite');
    const primary = createStore(filename);
    const secondary = createStore(filename);
    try {
      insertMonster(primary.sqlite, { id: 'alpha', userId: 'viewer-a' });
      insertMonster(primary.sqlite, {
        id: 'beta',
        userId: 'viewer-b',
        element: 'Tide',
        templateId: 'ripple'
      });
      let nowMs = 1_000;
      const submitter = createMatchService({
        store: primary.store,
        now: () => nowMs
      });
      const sweeper = createMatchService({
        store: secondary.store,
        now: () => nowMs
      });
      submitter.join({ userId: 'viewer-a' });
      const joined = submitter.join({ userId: 'viewer-b' });
      submitter.lockRoster({ userId: 'viewer-a' });

      nowMs = joined.match.rosterDeadlineMs;
      expect(submitter.lockRoster({ userId: 'viewer-b' })).toEqual({
        accepted: false,
        reason: 'no_roster_window'
      });
      expect(sweeper.sweep().rosterExpired).toBe(1);
      const actionMatch = sweeper.getMatch(joined.match.matchId);
      expect(actionMatch.state).toBe('action');

      nowMs = actionMatch.actionDeadlineMs;
      expect(submitter.submitChoice({
        userId: 'viewer-a',
        choice: 'A',
        eventId: 'deadline-action'
      })).toEqual({ handled: false, reason: 'no_active_window' });
      expect(sweeper.sweep().actionsExpired).toBe(1);
      expect(primary.sqlite.prepare(`
        SELECT COUNT(*) AS count FROM streammonsters_match_decisions
        WHERE match_id = ? AND source = 'timeout'
      `).get(joined.match.matchId).count).toBe(2);

      primary.sqlite.prepare(`
        UPDATE streammonsters_monsters
        SET unspent_stat_points = 1
        WHERE monster_id = 'alpha'
      `).run();
      const participant = sweeper.getMatch(joined.match.matchId).participants
        .find(entry => entry.viewerId === 'viewer-a');
      const prompt = sweeper.createStatPrompt(joined.match.matchId, participant, 1);
      nowMs = prompt.deadline_ms;
      expect(submitter.submitStatChoice({
        userId: 'viewer-a',
        choice: '2',
        eventId: 'deadline-stat'
      })).toEqual({ handled: false, reason: 'no_stat_window' });
      expect(sweeper.sweep().statsExpired).toBe(1);
    } finally {
      primary.sqlite.close();
      secondary.sqlite.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('awards both legitimate fighters permanent XP exactly once while Arena rating stops after ten daily battles', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'winner',
      userId: 'viewer-winner',
      stats: { vitality: 10, might: 80, guard: 10, agility: 80 }
    });
    insertMonster(sqlite, {
      id: 'loser',
      userId: 'viewer-loser',
      element: 'Tide',
      templateId: 'ripple',
      stats: { vitality: 1, might: 1, guard: 0, agility: 1 }
    });
    const nowMs = Date.UTC(2026, 6, 26, 12);
    const collection = { recordBattleOutcome: jest.fn() };
    const service = createMatchService({
      store,
      now: () => nowMs,
      collection
    });
    const season = service.getCurrentArenaSeason();
    sqlite.prepare(`
      INSERT INTO streammonsters_arena_daily_ledger (viewer_id, day_key, rated_battles)
      VALUES (?, '2026-07-26', 10), (?, '2026-07-26', 10)
    `).run('viewer-winner', 'viewer-loser');
    service.join({ userId: 'viewer-winner' });
    const joined = service.join({ userId: 'viewer-loser' });
    service.lockRoster({ userId: 'viewer-winner' });
    service.lockRoster({ userId: 'viewer-loser' });
    service.submitChoice({ userId: 'viewer-winner', choice: 'A', eventId: 'win-a' });
    const completed = service.submitChoice({
      userId: 'viewer-loser',
      choice: 'A',
      eventId: 'lose-a'
    }).match;

    expect(completed.state).toBe('completed');
    expect(store.getMonster('winner').xp).toBe(15);
    expect(store.getMonster('loser').xp).toBe(10);
    expect(service.getArenaRating(season.seasonId, 'viewer-winner').rating).toBe(900);
    expect(service.getArenaRating(season.seasonId, 'viewer-loser').rating).toBe(900);
    expect(sqlite.prepare(`
      SELECT xp_awarded, arena_eligible FROM streammonsters_match_rewards
      WHERE match_id = ? ORDER BY xp_awarded DESC
    `).all(joined.match.matchId)).toEqual([
      { xp_awarded: 15, arena_eligible: 0 },
      { xp_awarded: 10, arena_eligible: 0 }
    ]);

    expect(service.finalize(
      joined.match.matchId,
      completed.phaseVersion - 1,
      'winner'
    )).toEqual(expect.objectContaining({ state: 'completed' }));
    expect(store.getMonster('winner').xp).toBe(15);
    expect(store.getMonster('loser').xp).toBe(10);
    expect(sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_match_rewards WHERE match_id = ?
    `).get(joined.match.matchId).count).toBe(2);
    expect(collection.recordBattleOutcome).toHaveBeenCalledTimes(1);
    expect(store.getViewerProgress('viewer-winner').battles_won).toBe(1);
  });

  test('records and emits zero applied XP for level-20 fighters', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'capped-winner',
      userId: 'viewer-capped-winner',
      level: 20,
      stats: { vitality: 10, might: 80, guard: 10, agility: 80 }
    });
    insertMonster(sqlite, {
      id: 'capped-loser',
      userId: 'viewer-capped-loser',
      level: 20,
      element: 'Tide',
      templateId: 'ripple',
      stats: { vitality: 1, might: 1, guard: 0, agility: 1 }
    });
    const emit = jest.fn();
    const service = createMatchService({ store, now: () => 1_000, emit });
    service.join({ userId: 'viewer-capped-winner' });
    const joined = service.join({ userId: 'viewer-capped-loser' });
    service.lockRoster({ userId: 'viewer-capped-winner' });
    service.lockRoster({ userId: 'viewer-capped-loser' });
    const active = service.getMatch(joined.match.matchId);
    const completed = service.finalize(
      joined.match.matchId,
      active.phaseVersion,
      'capped-winner'
    );

    expect(completed.state).toBe('completed');
    expect(sqlite.prepare(`
      SELECT xp_awarded FROM streammonsters_match_rewards
      WHERE match_id = ? ORDER BY participant_id
    `).all(joined.match.matchId)).toEqual([
      { xp_awarded: 0 },
      { xp_awarded: 0 }
    ]);
    expect(emit.mock.calls
      .filter(([event]) => event === 'streammonsters:monster_xp_awarded')
      .map(([, payload]) => payload.amount)).toEqual([0, 0]);
    expect(store.getMonster('capped-winner')).toEqual(
      expect.objectContaining({ level: 20, xp: 0, unspent_stat_points: 0 })
    );
    expect(store.getMonster('capped-loser')).toEqual(
      expect.objectContaining({ level: 20, xp: 0, unspent_stat_points: 0 })
    );
  });

  test('advances battle quests and achievements once without duplicating v5 battle XP', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'winner',
      userId: 'viewer-winner',
      stats: { vitality: 10, might: 80, guard: 10, agility: 80 }
    });
    insertMonster(sqlite, {
      id: 'loser',
      userId: 'viewer-loser',
      element: 'Tide',
      templateId: 'ripple',
      stats: { vitality: 1, might: 1, guard: 0, agility: 1 }
    });
    store.ensureViewer('viewer-winner');
    sqlite.prepare(`
      UPDATE streammonsters_monsters SET battle_count = 9 WHERE monster_id = 'winner'
    `).run();
    sqlite.prepare(`
      UPDATE streammonsters_viewer_progress
      SET battle_win_streak = 4, best_battle_win_streak = 4
      WHERE user_id = 'viewer-winner'
    `).run();
    const nowDate = new Date('2026-07-26T12:00:00Z');
    const progression = new ProgressionService({
      store,
      now: () => nowDate
    });
    store.setQuestProgress({
      userId: 'viewer-winner',
      periodKey: progression.weekKey(),
      questKey: 'weekly:battle',
      title: 'Fight a battle',
      target: 10,
      progress: 10
    });
    const service = createMatchService({
      store,
      now: () => nowDate.getTime(),
      progression
    });
    service.join({ userId: 'viewer-winner' });
    const joined = service.join({ userId: 'viewer-loser' });
    service.lockRoster({ userId: 'viewer-winner' });
    service.lockRoster({ userId: 'viewer-loser' });
    service.submitChoice({ userId: 'viewer-winner', choice: 'A', eventId: 'quest-a' });
    const completed = service.submitChoice({
      userId: 'viewer-loser',
      choice: 'A',
      eventId: 'quest-b'
    }).match;

    expect(store.getMonster('winner')).toEqual(expect.objectContaining({
      xp: 15,
      battle_count: 10
    }));
    expect(store.getMonster('loser')).toEqual(expect.objectContaining({
      xp: 10,
      battle_count: 1
    }));
    expect(store.getViewerQuests('viewer-loser', progression.weekKey()))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ quest_key: 'weekly:battle', progress: 1 })
      ]));
    expect(store.getViewerAchievements('viewer-winner').map(item => item.achievement_key))
      .toEqual(expect.arrayContaining(['10_battles', 'five_win_streak']));

    service.finalize(joined.match.matchId, completed.phaseVersion - 1, 'winner');
    expect(store.getViewerQuests('viewer-loser', progression.weekKey())
      .find(quest => quest.quest_key === 'weekly:battle').progress).toBe(1);
    expect(store.getViewerAchievements('viewer-winner').filter(item => (
      ['10_battles', 'five_win_streak'].includes(item.achievement_key)
    ))).toHaveLength(2);
    expect(store.getMonster('winner').xp).toBe(15);
    expect(store.getMonster('loser').xp).toBe(10);
  });

  test('uses K32 Arena Elo and exact tiers only inside the separate daily ledger', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'winner',
      userId: 'viewer-winner',
      stats: { vitality: 10, might: 80, guard: 10, agility: 80 }
    });
    insertMonster(sqlite, {
      id: 'loser',
      userId: 'viewer-loser',
      element: 'Tide',
      templateId: 'ripple',
      stats: { vitality: 1, might: 1, guard: 0, agility: 1 }
    });
    const nowMs = Date.UTC(2026, 6, 26, 12);
    const service = createMatchService({ store, now: () => nowMs });
    const season = service.getCurrentArenaSeason();
    service.join({ userId: 'viewer-winner' });
    service.join({ userId: 'viewer-loser' });
    service.lockRoster({ userId: 'viewer-winner' });
    service.lockRoster({ userId: 'viewer-loser' });
    service.submitChoice({ userId: 'viewer-winner', choice: 'A', eventId: 'rated-a' });
    service.submitChoice({ userId: 'viewer-loser', choice: 'A', eventId: 'rated-b' });

    expect(service.getArenaRating(season.seasonId, 'viewer-winner')).toEqual(
      expect.objectContaining({ rating: 916, tier: 'Bronze', battlesRated: 1 })
    );
    expect(service.getArenaRating(season.seasonId, 'viewer-loser')).toEqual(
      expect.objectContaining({ rating: 884, tier: 'Bronze', battlesRated: 1 })
    );
    expect(service.arenaTier(999)).toBe('Bronze');
    expect(service.arenaTier(1000)).toBe('Silver');
    expect(service.arenaTier(1150)).toBe('Gold');
    expect(service.arenaTier(1300)).toBe('Crystal');
    expect(service.arenaTier(1500)).toBe('Monster Master');
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM streammonsters_season_scores').get().count)
      .toBe(0);
  });

  test('grants one unspent point for every level 2-20 and consumes authorized stat choices once', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'leveler', userId: 'viewer-leveler' });
    const xpToTwenty = Array.from({ length: 19 }, (_, index) => 100 + (25 * index))
      .reduce((sum, threshold) => sum + threshold, 0);

    const capped = store.awardMonsterXp('leveler', xpToTwenty + 999_999);
    expect(capped).toEqual(expect.objectContaining({
      level: 20,
      xp: 0,
      unspent_stat_points: 19
    }));
    expect(capped.stats).toEqual({
      vitality: 10,
      might: 10,
      guard: 10,
      agility: 10
    });
    expect(store.applyMonsterStatPoint({
      userId: 'other-viewer',
      monsterId: 'leveler',
      stat: 'might'
    })).toEqual({ applied: false, reason: 'not_owned' });
    expect(store.applyMonsterStatPoint({
      userId: 'viewer-leveler',
      monsterId: 'leveler',
      stat: 'might'
    })).toEqual(expect.objectContaining({
      applied: true,
      monster: expect.objectContaining({
        unspent_stat_points: 18,
        stats: expect.objectContaining({ might: 11 })
      })
    }));
  });

  test('binds 30-second stat prompts to match, viewer and monster with deterministic timeout', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'winner',
      userId: 'viewer-winner',
      stats: { vitality: 10, might: 80, guard: 10, agility: 80 }
    });
    insertMonster(sqlite, {
      id: 'loser',
      userId: 'viewer-loser',
      element: 'Tide',
      templateId: 'ripple',
      stats: { vitality: 1, might: 1, guard: 0, agility: 1 }
    });
    sqlite.prepare(`
      UPDATE streammonsters_monsters SET xp = 95 WHERE monster_id = 'winner'
    `).run();
    let nowMs = 10_000;
    const emit = jest.fn();
    const service = createMatchService({ store, now: () => nowMs, emit });
    service.join({ userId: 'viewer-winner' });
    const joined = service.join({ userId: 'viewer-loser' });
    service.lockRoster({ userId: 'viewer-winner' });
    service.lockRoster({ userId: 'viewer-loser' });
    service.submitChoice({ userId: 'viewer-winner', choice: 'A', eventId: 'stat-a' });
    service.submitChoice({ userId: 'viewer-loser', choice: 'A', eventId: 'stat-b' });

    const winnerSlot = joined.match.participants.find(
      participant => participant.viewerId === 'viewer-winner'
    ).slot;
    const loserSlot = joined.match.participants.find(
      participant => participant.viewerId === 'viewer-loser'
    ).slot;
    const emitted = emit.mock.calls.map(([event, payload]) => ({ event, payload }));
    expect(emitted.filter(entry => (
      entry.event === 'streammonsters:monster_xp_awarded'
    ))).toEqual(expect.arrayContaining([
      expect.objectContaining({
        payload: expect.objectContaining({
          matchId: joined.match.matchId,
          slot: winnerSlot,
          amount: 15,
          monster: expect.objectContaining({ name: 'winner', level: 2, xp: 10 })
        })
      }),
      expect.objectContaining({
        payload: expect.objectContaining({
          matchId: joined.match.matchId,
          slot: loserSlot,
          amount: 10,
          monster: expect.objectContaining({ name: 'loser', level: 1, xp: 10 })
        })
      })
    ]));
    expect(emitted).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'streammonsters:monster_level_up',
        payload: expect.objectContaining({
          matchId: joined.match.matchId,
          slot: winnerSlot,
          levelsGained: 1,
          monster: expect.objectContaining({ level: 2, unspentStatPoints: 1 })
        })
      }),
      expect.objectContaining({
        event: 'streammonsters:monster_stat_prompt',
        payload: expect.objectContaining({
          matchId: joined.match.matchId,
          slot: winnerSlot,
          choices: ['1', '2', '3', '4']
        })
      })
    ]));
    expect(emitted.filter(entry => (
      entry.event === 'streammonsters:arena_rating_changed'
    ))).toHaveLength(2);
    expect(JSON.stringify(emitted)).not.toContain('viewer-winner');
    expect(JSON.stringify(emitted)).not.toContain('"monsterId":"winner"');

    const prompt = sqlite.prepare(`
      SELECT * FROM streammonsters_stat_prompts
      WHERE match_id = ? AND viewer_id = 'viewer-winner'
    `).get(joined.match.matchId);
    expect(prompt).toEqual(expect.objectContaining({
      monster_id: 'winner',
      deadline_ms: 40_000,
      status: 'open'
    }));
    expect(service.submitStatChoice({
      userId: 'viewer-loser',
      choice: '2',
      eventId: 'wrong-stat'
    })).toEqual({ handled: false, reason: 'no_stat_window' });
    expect(service.submitStatChoice({
      userId: 'viewer-winner',
      choice: '2',
      eventId: 'right-stat'
    })).toEqual(expect.objectContaining({ handled: true, stat: 'might' }));
    expect(emit).toHaveBeenCalledWith(
      'streammonsters:monster_stat_chosen',
      expect.objectContaining({
        matchId: joined.match.matchId,
        slot: winnerSlot,
        stat: 'might',
        source: 'viewer'
      })
    );
    expect(store.getMonster('winner')).toEqual(expect.objectContaining({
      unspent_stat_points: 0,
      stats: expect.objectContaining({ might: 81 })
    }));

    sqlite.prepare(`
      UPDATE streammonsters_monsters SET unspent_stat_points = 1 WHERE monster_id = 'loser'
    `).run();
    service.createStatPrompt(
      joined.match.matchId,
      joined.match.participants.find(entry => entry.viewerId === 'viewer-loser'),
      1
    );
    nowMs = 40_001;
    expect(service.sweep()).toEqual(expect.objectContaining({ statsExpired: 1 }));
    const timeoutDecision = sqlite.prepare(`
      SELECT choice, event_id FROM streammonsters_stat_prompts
      WHERE match_id = ? AND viewer_id = 'viewer-loser'
    `).get(joined.match.matchId);
    expect(timeoutDecision.choice).toMatch(/^(vitality|might|guard|agility)$/);
    expect(timeoutDecision.event_id).toContain(':stat-timeout:');
    expect(emit).toHaveBeenCalledWith(
      'streammonsters:monster_stat_auto_assigned',
      expect.objectContaining({
        matchId: joined.match.matchId,
        slot: loserSlot,
        stat: timeoutDecision.choice,
        source: 'timeout'
      })
    );
  });

  test('keeps private v3 readability and pages v5 on one lossless public cursor with provenance', () => {
    const { sqlite, store } = createStore();
    const legacyRounds = [{
      round: 1,
      actions: [
        { actorId: 'old-a', targetId: 'old-b', skill: { type: 'attack' } },
        { actorId: 'old-b', targetId: 'old-a', skill: { type: 'defense' } }
      ]
    }];
    sqlite.prepare(`
      INSERT INTO streammonsters_battles (
        battle_id, seed, monster_a_id, monster_b_id, winner_monster_id,
        rounds_json, rules_version, result_json, created_at_ms
      ) VALUES ('legacy-v3', 'old-seed', 'old-a', 'old-b', 'old-a', ?, 3, ?, 1)
    `).run(JSON.stringify(legacyRounds), JSON.stringify({ rounds: legacyRounds }));
    const emit = jest.fn();
    const service = createMatchService({ store, now: () => 1_000, emit });

    expect(service.getPrivateNormalizedReplay('legacy-v3')).toEqual(expect.objectContaining({
      battleId: 'legacy-v3',
      rulesVersion: 3,
      replayVersion: 3,
      actions: [
        expect.objectContaining({ sequence: 1, actorId: 'old-a' }),
        expect.objectContaining({ sequence: 2, actorId: 'old-b' })
      ]
    }));
    expect(sqlite.prepare(`
      SELECT rounds_json, rules_version FROM streammonsters_battles WHERE battle_id = 'legacy-v3'
    `).get()).toEqual({
      rounds_json: JSON.stringify(legacyRounds),
      rules_version: 3
    });

    insertMonster(sqlite, {
      id: 'secret-alpha',
      userId: 'viewer-secret-a',
      name: 'Public Alpha'
    });
    insertMonster(sqlite, {
      id: 'secret-beta',
      userId: 'viewer-secret-b',
      name: 'Public Beta',
      element: 'Tide',
      templateId: 'ripple'
    });
    service.join({ userId: 'viewer-secret-a' });
    const joined = service.join({ userId: 'viewer-secret-b' });
    service.lockRoster({ userId: 'viewer-secret-a' });
    service.lockRoster({ userId: 'viewer-secret-b' });
    service.submitChoice({
      userId: 'viewer-secret-a',
      choice: 'A',
      eventId: 'provider-private-a'
    });
    service.submitChoice({
      userId: 'viewer-secret-b',
      choice: 'B',
      eventId: 'provider-private-b'
    });

    const pages = [];
    let cursor = 0;
    do {
      const page = service.getPublicNormalizedReplay(joined.match.matchId, cursor, 2);
      pages.push(page);
      expect(page.events.every(event => event.sequence > cursor)).toBe(true);
      cursor = page.cursor;
      if (!page.hasMore) break;
    } while (pages.length < 20);
    const events = pages.flatMap(page => page.events);
    const actions = pages.flatMap(page => page.actions);
    const decisions = pages.flatMap(page => page.decisions);
    expect(events.every(event => (
      event.eventId === `${joined.match.matchId}:event:${event.sequence}` &&
      event.correlationId === joined.match.matchId
    ))).toBe(true);
    const liveEventsById = new Map(emit.mock.calls
      .map(([type, payload]) => ({ type, payload }))
      .filter(entry => entry.payload?.eventId)
      .map(entry => [entry.payload.eventId, entry]));
    expect(events.every(event => (
      liveEventsById.get(event.eventId)?.type === event.type &&
      liveEventsById.get(event.eventId)?.payload.correlationId === event.correlationId
    ))).toBe(true);
    expect(events.map(event => event.sequence)).toEqual(
      [...new Set(events.map(event => event.sequence))].sort((a, b) => a - b)
    );
    expect(actions).toHaveLength(2);
    expect(actions.map(action => action.sequence)).toEqual([1, 2]);
    expect(actions.every(action => Number.isInteger(action.eventSequence))).toBe(true);
    const liveActions = emit.mock.calls
      .filter(([event]) => event === 'streammonsters:battle_skill_used')
      .map(([, payload]) => payload.action);
    expect(actions.map(action => action.actorState)).toEqual(
      liveActions.map(action => action.actorState)
    );
    expect(actions.map(action => action.targetState)).toEqual(
      liveActions.map(action => action.targetState)
    );
    expect(actions.some(action => action.actorState.maxHp > 0)).toBe(true);
    expect(decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        round: 1,
        window: 'action',
        slot: 2,
        choice: 'A',
        source: 'viewer',
        timeout: false
      }),
      expect.objectContaining({
        round: 1,
        window: 'action',
        slot: 1,
        choice: 'B',
        source: 'viewer',
        timeout: false
      })
    ]));
    const publicJson = JSON.stringify(pages);
    [
      'viewer-secret',
      'secret-alpha',
      'secret-beta',
      'provider-private',
      'participantId',
      '"before"',
      '"after"'
    ].forEach(secret => expect(publicJson).not.toContain(secret));
    const privateReplay = service.getPrivateNormalizedReplay(joined.match.matchId);
    expect(JSON.stringify(privateReplay)).toContain('secret-alpha');
  });

  test('keeps historical choice-window fighter HUDs unchanged after later actions', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'alpha', userId: 'viewer-a' });
    insertMonster(sqlite, {
      id: 'beta',
      userId: 'viewer-b',
      element: 'Tide',
      templateId: 'ripple'
    });
    const service = createMatchService({ store, now: () => 1_000 });
    service.join({ userId: 'viewer-a' });
    const joined = service.join({ userId: 'viewer-b' });
    service.lockRoster({ userId: 'viewer-a' });
    service.lockRoster({ userId: 'viewer-b' });

    const before = service.getPublicNormalizedReplay(joined.match.matchId);
    const firstWindow = before.events.find(event => (
      event.type === 'streammonsters:battle_choice_opened' &&
      event.payload.round === 1
    ));
    expect(firstWindow.payload.fighters).toHaveLength(2);
    const originalFighters = JSON.parse(JSON.stringify(firstWindow.payload.fighters));

    service.submitChoice({ userId: 'viewer-a', choice: 'A', eventId: 'choice-a' });
    service.submitChoice({ userId: 'viewer-b', choice: 'B', eventId: 'choice-b' });

    const after = service.getPublicNormalizedReplay(joined.match.matchId);
    const replayedFirstWindow = after.events.find(event => (
      event.sequence === firstWindow.sequence
    ));
    expect(replayedFirstWindow.payload.fighters).toEqual(originalFighters);
  });

  test('retains the safe Rules-v7 charge window in public reconnect replays', () => {
    [5, 6, 7].forEach(rulesVersion => {
      const { sqlite, store } = createStore();
      insertMonster(sqlite, { id: `alpha-v${rulesVersion}`, userId: `viewer-a-v${rulesVersion}` });
      insertMonster(sqlite, {
        id: `beta-v${rulesVersion}`,
        userId: `viewer-b-v${rulesVersion}`,
        element: 'Tide',
        templateId: 'ripple'
      });
      const emit = jest.fn();
      const service = createMatchService({
        store,
        now: () => 1_000,
        emit,
        rulesVersion
      });
      service.join({ userId: `viewer-a-v${rulesVersion}` });
      const joined = service.join({ userId: `viewer-b-v${rulesVersion}` });
      service.lockRoster({ userId: `viewer-a-v${rulesVersion}` });
      service.lockRoster({ userId: `viewer-b-v${rulesVersion}` });

      const live = emit.mock.calls.find(([event]) => (
        event === 'streammonsters:battle_choice_opened'
      ))?.[1];
      const replay = service.getPublicNormalizedReplay(joined.match.matchId).events.find(event => (
        event.type === 'streammonsters:battle_choice_opened' && event.payload.round === 1
      ))?.payload;
      expect(replay).toEqual(expect.objectContaining({
        round: 1,
        deadlineMs: live.deadlineMs,
        choices: ['A', 'B', 'C']
      }));
      if (rulesVersion === 7) {
        expect(live.chargeWindow).toEqual({
          openedAtMs: 1_000,
          deadlineMs: 7_000,
          passivePerSecond: 5
        });
        expect(replay.chargeWindow).toEqual(live.chargeWindow);
      } else {
        expect(live.chargeWindow).toBeUndefined();
        expect(replay.chargeWindow).toBeUndefined();
      }
      expect(JSON.stringify(replay)).not.toContain(`viewer-a-v${rulesVersion}`);
    });
  });

  test('publishes only a redacted active battle snapshot', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'alpha', userId: 'viewer-secret-a' });
    insertMonster(sqlite, {
      id: 'beta',
      userId: 'viewer-secret-b',
      element: 'Tide',
      templateId: 'ripple'
    });
    const service = createMatchService({ store, now: () => 1_000 });
    service.join({ userId: 'viewer-secret-a' });
    service.join({ userId: 'viewer-secret-b' });
    service.lockRoster({ userId: 'viewer-secret-a' });
    service.lockRoster({ userId: 'viewer-secret-b' });

    const snapshot = service.getPublicSnapshot();
    const serialized = JSON.stringify(snapshot);
    expect(snapshot.matches).toHaveLength(1);
    expect(snapshot.matches[0]).toEqual(expect.objectContaining({
      state: 'action',
      roundNumber: 1,
      fighters: expect.arrayContaining([
        expect.objectContaining({
          element: 'Ember',
          templateId: 'ashfang',
          evolutionStage: 1,
          imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png',
          maxHp: expect.any(Number)
        }),
        expect.objectContaining({
          element: 'Tide',
          templateId: 'ripple',
          evolutionStage: 1,
          imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/ripple.png',
          maxHp: expect.any(Number)
        })
      ]),
      cursor: expect.any(Number)
    }));
    expect(serialized).not.toContain('viewer-secret');
    expect(serialized).not.toContain('participantId');
    expect(serialized).not.toContain('queuedMonsterId');
    expect(serialized).not.toContain('stats');
  });

  test('opens the live skill window with both safe visual fighters for the OBS arena', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'alpha', userId: 'viewer-private-a' });
    insertMonster(sqlite, {
      id: 'beta',
      userId: 'viewer-private-b',
      element: 'Tide',
      templateId: 'ripple'
    });
    const emit = jest.fn();
    const service = createMatchService({ store, now: () => 1_000, emit });
    service.join({ userId: 'viewer-private-a' });
    service.join({ userId: 'viewer-private-b' });
    service.lockRoster({ userId: 'viewer-private-a' });
    service.lockRoster({ userId: 'viewer-private-b' });

    const opened = emit.mock.calls.find(([event]) => (
      event === 'streammonsters:battle_choice_opened'
    ));
    expect(opened?.[1]).toEqual(expect.objectContaining({
      round: 1,
      choices: ['A', 'B', 'C'],
      fighters: expect.arrayContaining([
        expect.objectContaining({
          slot: 1,
          templateId: expect.any(String),
          imageUrl: expect.stringMatching(/^\/plugins\/streamalchemy\/assets\/streammonsters\/furry\//),
          hp: expect.any(Number),
          maxHp: expect.any(Number)
        }),
        expect.objectContaining({ slot: 2, templateId: expect.any(String) })
      ])
    }));
    expect(JSON.stringify(opened)).not.toContain('viewer-private');
    expect(JSON.stringify(opened)).not.toContain('"stats"');
  });
});

describe('Stream Monsters v5 command composition', () => {
  test('routes battle/choose into the durable owner, cancels roster selection and locks active rounds', () => {
    let activeMatch = {
      matchId: 'match-a',
      state: 'roster'
    };
    const battleMatchService = {
      join: jest.fn(() => ({ status: 'queued' })),
      lockRoster: jest.fn(() => ({ accepted: true, waiting: true })),
      getActiveMatchForViewer: jest.fn(() => activeMatch),
      cancelBeforeBattle: jest.fn(() => ({
        cancelled: true,
        matchId: 'match-a'
      }))
    };
    const store = {
      afterCommit: callback => callback(),
      getBattleQueue: () => [],
      getViewerMonsters: () => [{
        monster_id: 'monster-a',
        user_id: 'viewer-a',
        name: 'Alpha'
      }],
      selectMonster: () => ({
        monster_id: 'monster-a',
        user_id: 'viewer-a',
        name: 'Alpha'
      }),
      removeBattleQueueEntry: jest.fn(() => false),
      purgeBattleQueue: jest.fn()
    };
    const commands = new ChatCommands({
      store,
      engine: { markReadyEggs: jest.fn(), streamKey: 'stream-a' },
      battleService: { stanceForMonster: () => 'power' },
      battleMatchService,
      progression: { recordCommand: jest.fn() }
    });

    expect(commands.execute({ userId: 'viewer-a' }, 'battle', [])).toEqual(
      expect.objectContaining({ success: true, status: 'queued' })
    );
    expect(commands.execute({ userId: 'viewer-a' }, 'choose', ['1'])).toEqual(
      expect.objectContaining({ success: true, status: 'roster_locked' })
    );
    expect(commands.execute({ userId: 'viewer-a' }, 'leavebattle', [])).toEqual({
      success: true,
      status: 'match_cancelled',
      message: 'The reserved battle was cancelled before it started.'
    });
    expect(battleMatchService.cancelBeforeBattle).toHaveBeenCalledWith('viewer-a');

    activeMatch = { matchId: 'match-b', state: 'action' };
    expect(commands.execute({ userId: 'viewer-a' }, 'leavebattle', [])).toEqual({
      success: false,
      status: 'match_locked',
      message: 'A battle in progress cannot be left.'
    });
    expect(store.removeBattleQueueEntry).not.toHaveBeenCalled();
  });
});
