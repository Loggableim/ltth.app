const Database = require('better-sqlite3');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const BattleService = require('../plugins/streamalchemy/backend/streammonsters/battle-service');
const ChatCommands = require('../plugins/streamalchemy/backend/streammonsters/chat-commands');
const BattleMatchService = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
);

function createStore(filename = ':memory:') {
  const sqlite = new Database(filename);
  sqlite.pragma('foreign_keys = ON');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  return { sqlite, store };
}

function insertMonster(sqlite, {
  id,
  userId,
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
    id,
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
  autoStart = false
}) {
  return new BattleMatchService({
    store,
    battleService: new BattleService({ store, now }),
    emit,
    collection,
    now,
    autoStart
  });
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
  });
});

describe('Stream Monsters durable BattleMatchService', () => {
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

  test('chooses nearest Arena rating, widens level range after 30s and avoids a recent rematch', () => {
    const { sqlite, store } = createStore();
    [
      ['target', 'viewer-target', 8],
      ['near', 'viewer-near', 10],
      ['far', 'viewer-far', 10],
      ['rematch', 'viewer-rematch', 8]
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
      queuedAtMs: nowMs - 31_000
    });
    store.enqueueBattle({
      userId: 'viewer-far',
      monsterId: 'far',
      stance: 'adaptive',
      queuedAtMs: nowMs - 31_000
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

    const result = service.join({ userId: 'viewer-target' });

    expect(result.status).toBe('reserved');
    expect(result.match.participants.map(participant => participant.viewerId)).toEqual(
      expect.arrayContaining(['viewer-target', 'viewer-near'])
    );
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

      expect(jest.getTimerCount()).toBeGreaterThan(0);
      service.destroy();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
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
    const service = createMatchService({ store, now: () => nowMs });
    service.join({ userId: 'viewer-winner' });
    const joined = service.join({ userId: 'viewer-loser' });
    service.lockRoster({ userId: 'viewer-winner' });
    service.lockRoster({ userId: 'viewer-loser' });
    service.submitChoice({ userId: 'viewer-winner', choice: 'A', eventId: 'stat-a' });
    service.submitChoice({ userId: 'viewer-loser', choice: 'A', eventId: 'stat-b' });

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
  });

  test('normalizes old v3 replays and returns ordered v5 cursor pages without rewriting history', () => {
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
    const service = createMatchService({ store, now: () => 1_000 });

    expect(service.getNormalizedReplay('legacy-v3')).toEqual(expect.objectContaining({
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
        expect.objectContaining({ element: 'Ember', templateId: 'ashfang' }),
        expect.objectContaining({ element: 'Tide', templateId: 'ripple' })
      ]),
      cursor: expect.any(Number)
    }));
    expect(serialized).not.toContain('viewer-secret');
    expect(serialized).not.toContain('participantId');
    expect(serialized).not.toContain('queuedMonsterId');
    expect(serialized).not.toContain('stats');
  });
});

describe('Stream Monsters v5 command composition', () => {
  test('routes battle/choose into the durable owner and refuses to leave a locked match', () => {
    const battleMatchService = {
      join: jest.fn(() => ({ status: 'queued' })),
      lockRoster: jest.fn(() => ({ accepted: true, waiting: true })),
      getActiveMatchForViewer: jest.fn(() => ({
        matchId: 'match-a',
        state: 'action'
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
      success: false,
      status: 'match_locked',
      message: 'A reserved match cannot be left.'
    });
    expect(store.removeBattleQueueEntry).not.toHaveBeenCalled();
  });
});
