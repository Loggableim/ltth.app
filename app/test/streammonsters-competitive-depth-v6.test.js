const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);
const BattleService = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-service'
);
const BattleMatchService = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
);
const ProgressionService = require(
  '../plugins/streamalchemy/backend/streammonsters/progression-service'
);
const ChatCommands = require(
  '../plugins/streamalchemy/backend/streammonsters/chat-commands'
);

function createStore() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  return { sqlite, store };
}

function insertMonster(sqlite, {
  id,
  userId,
  name = id,
  element = 'Ember',
  templateId = 'ashfang',
  level = 1,
  selected = true,
  stats = { vitality: 10, might: 10, guard: 10, agility: 10 }
}) {
  sqlite.prepare(`
    INSERT INTO streammonsters_monsters (
      monster_id, user_id, egg_id, name, element, rarity, level, xp,
      stats_json, personality, template_id, is_selected, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, 'Common', ?, 0, ?, 'Adaptive', ?, ?, 1)
  `).run(
    id,
    userId,
    `egg-${id}`,
    name,
    element,
    level,
    JSON.stringify(stats),
    templateId,
    selected ? 1 : 0
  );
}

function createService({
  store,
  now,
  emit = jest.fn(),
  progression = null,
  collection = null
}) {
  return new BattleMatchService({
    store,
    battleService: new BattleService({ store, now }),
    progression,
    collection,
    emit,
    now,
    rulesVersion: 6,
    autoStart: false
  });
}

function completeOneRound(service, leftId, rightId, prefix) {
  service.lockRoster({ userId: leftId });
  service.lockRoster({ userId: rightId });
  service.submitChoice({
    userId: leftId,
    choice: 'A',
    eventId: `${prefix}:left`
  });
  return service.submitChoice({
    userId: rightId,
    choice: 'A',
    eventId: `${prefix}:right`
  }).match;
}

describe('Stream Monsters competitive depth rules-v6', () => {
  test('routes GCCE leavebattle through the durable forfeit owner', () => {
    const battleMatchService = {
      leave: jest.fn(() => ({
        status: 'forfeited',
        matchId: 'match-durable',
        winnerSlot: 2
      }))
    };
    const commands = new ChatCommands({
      store: {
        afterCommit: callback => callback(),
        getBattleQueue: () => []
      },
      engine: { streamKey: 'stream-live', markReadyEggs: jest.fn() },
      battleMatchService
    });

    expect(commands.execute({ userId: 'viewer-left' }, 'leavebattle'))
      .toEqual(expect.objectContaining({
        success: true,
        status: 'match_forfeited'
      }));
    expect(battleMatchService.leave).toHaveBeenCalledWith({
      userId: 'viewer-left'
    });
  });

  test('labels the reconnect battle snapshot with the active rules version', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'snapshot-a', userId: 'viewer-snapshot-a' });
    insertMonster(sqlite, {
      id: 'snapshot-b',
      userId: 'viewer-snapshot-b',
      element: 'Tide',
      templateId: 'ripple'
    });
    const service = createService({ store, now: () => 1_000 });
    service.join({ userId: 'viewer-snapshot-a' });
    service.join({ userId: 'viewer-snapshot-b' });

    expect(service.getPublicSnapshot()).toEqual(expect.objectContaining({
      rulesVersion: 6,
      matches: [
        expect.objectContaining({ rulesVersion: 6, state: 'roster' })
      ]
    }));
  });

  test('cancels before a roster lock, records a locked forfeit, and cools repeated queue dodges', () => {
    const { sqlite, store } = createStore();
    [
      ['alpha', 'viewer-alpha', 'Ember', 'ashfang'],
      ['beta', 'viewer-beta', 'Tide', 'ripple'],
      ['dodger', 'viewer-dodger', 'Grove', 'mosswhisker']
    ].forEach(([id, userId, element, templateId]) => insertMonster(sqlite, {
      id,
      userId,
      element,
      templateId,
      stats: id === 'alpha'
        ? { vitality: 10, might: 50, guard: 10, agility: 30 }
        : { vitality: 10, might: 10, guard: 10, agility: 10 }
    }));
    let nowMs = 10_000;
    const progression = { recordBattleProgress: jest.fn() };
    const collection = { recordBattleOutcome: jest.fn() };
    const service = createService({
      store,
      now: () => nowMs,
      progression,
      collection
    });

    service.join({ userId: 'viewer-alpha' });
    const unlocked = service.join({ userId: 'viewer-beta' }).match;
    expect(service.leave({ userId: 'viewer-alpha' })).toEqual(
      expect.objectContaining({
        status: 'cancelled',
        matchId: unlocked.matchId,
        rewarded: false
      })
    );
    expect(service.getMatch(unlocked.matchId).state).toBe('cancelled');
    expect(sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_match_rewards
      WHERE match_id = ?
    `).get(unlocked.matchId).count).toBe(0);
    expect(service.getQueueDodgeStatus('viewer-alpha')).toEqual(
      expect.objectContaining({
        dodgeCount: 1,
        cooldownUntilMs: 0
      })
    );
    sqlite.prepare(`
      DELETE FROM streammonsters_queue_dodges WHERE viewer_id = ?
    `).run('viewer-alpha');

    service.join({ userId: 'viewer-alpha' });
    const locked = service.join({ userId: 'viewer-beta' }).match;
    const alphaSlot = locked.participants.find(
      participant => participant.viewerId === 'viewer-alpha'
    ).slot;
    const betaSlot = locked.participants.find(
      participant => participant.viewerId === 'viewer-beta'
    ).slot;
    service.lockRoster({ userId: 'viewer-alpha' });
    const forfeited = service.leave({ userId: 'viewer-alpha' });
    expect(forfeited).toEqual(expect.objectContaining({
      status: 'forfeited',
      matchId: locked.matchId,
      winnerSlot: betaSlot
    }));
    expect(service.getMatch(locked.matchId)).toEqual(expect.objectContaining({
      state: 'completed',
      winnerMonsterId: 'beta',
      result: expect.objectContaining({
        completion: 'forfeit',
        forfeitedSlot: alphaSlot
      })
    }));
    expect(store.getViewerBattleStats('viewer-alpha')).toEqual(
      expect.objectContaining({ battle_count: 1, win_streak: 0 })
    );
    expect(store.getViewerBattleStats('viewer-beta')).toEqual(
      expect.objectContaining({ battle_count: 1, win_streak: 1 })
    );
    expect(service.getQueueDodgeStatus('viewer-alpha')).toEqual(
      expect.objectContaining({
        dodgeCount: 1,
        cooldownUntilMs: nowMs + 60_000
      })
    );
    expect(progression.recordBattleProgress).toHaveBeenCalledTimes(2);
    expect(collection.recordBattleOutcome).toHaveBeenCalledTimes(1);
    const rewardCount = sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_match_rewards
      WHERE match_id = ?
    `).get(locked.matchId).count;
    const eventCount = sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_match_events
      WHERE match_id = ?
    `).get(locked.matchId).count;

    expect(service.join({ userId: 'viewer-alpha' })).toEqual(
      expect.objectContaining({
        status: 'cooldown',
        retryAfterMs: 60_000
      })
    );
    expect(service.leave({ userId: 'viewer-alpha' }).status).toBe('not_queued');
    expect(service.leave({ userId: 'viewer-alpha' }).status).toBe('not_queued');
    expect(sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_match_rewards
      WHERE match_id = ?
    `).get(locked.matchId).count).toBe(rewardCount);
    expect(sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_match_events
      WHERE match_id = ?
    `).get(locked.matchId).count).toBe(eventCount);
    expect(store.getViewerBattleStats('viewer-alpha').battle_count).toBe(1);
    expect(store.getViewerBattleStats('viewer-beta').battle_count).toBe(1);
    expect(progression.recordBattleProgress).toHaveBeenCalledTimes(2);
    expect(collection.recordBattleOutcome).toHaveBeenCalledTimes(1);

    for (let dodge = 1; dodge <= 3; dodge += 1) {
      expect(service.join({ userId: 'viewer-dodger' }).status).toBe('queued');
      const left = service.leave({ userId: 'viewer-dodger' });
      expect(left.status).toBe(dodge === 3 ? 'cooldown' : 'left_queue');
      nowMs += 1_000;
    }
    expect(service.join({ userId: 'viewer-dodger' })).toEqual(
      expect.objectContaining({
        status: 'cooldown',
        retryAfterMs: 59_000
      })
    );

    nowMs += 60_000;
    expect(service.join({ userId: 'viewer-dodger' }).status).toBe('queued');
  });

  test('awards post-cap monster XP without storing or emitting a rank presentation', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'capped-winner',
      userId: 'viewer-capped-winner',
      stats: { vitality: 10, might: 80, guard: 10, agility: 80 }
    });
    insertMonster(sqlite, {
      id: 'capped-loser',
      userId: 'viewer-capped-loser',
      element: 'Tide',
      templateId: 'ripple',
      stats: { vitality: 1, might: 1, guard: 0, agility: 1 }
    });
    const nowMs = Date.parse('2026-07-27T18:00:00Z');
    const emit = jest.fn();
    const service = createService({ store, now: () => nowMs, emit });
    const season = service.getCurrentArenaSeason();
    ['viewer-capped-winner', 'viewer-capped-loser'].forEach(userId => {
      service.setArenaRating(season.seasonId, userId, 1_200);
      sqlite.prepare(`
        INSERT INTO streammonsters_arena_daily_ledger (
          viewer_id, day_key, rated_battles
        ) VALUES (?, '2026-07-27', 10)
      `).run(userId);
    });

    service.join({ userId: 'viewer-capped-winner' });
    const match = service.join({ userId: 'viewer-capped-loser' }).match;
    const completed = completeOneRound(
      service,
      'viewer-capped-winner',
      'viewer-capped-loser',
      'daily-cap'
    );
    const replay = service.getPublicNormalizedReplay(match.matchId, 0, 100);

    expect(completed.state).toBe('completed');
    expect(store.getMonster('capped-winner').xp).toBe(15);
    expect(store.getMonster('capped-loser').xp).toBe(10);
    expect(replay.result.participants).toEqual(expect.arrayContaining([
      expect.objectContaining({ xpAwarded: 15, arenaEligible: false }),
      expect.objectContaining({ xpAwarded: 10, arenaEligible: false })
    ]));
    expect(replay.ratingChanges).toEqual([]);
    expect(replay.events.map(event => event.type))
      .not.toContain('streammonsters:arena_rating_changed');
    expect(emit.mock.calls.map(([type]) => type))
      .not.toContain('streammonsters:arena_rating_changed');
    expect(service.getArenaRating(season.seasonId, 'viewer-capped-winner').rating)
      .toBe(1_200);
    expect(service.getArenaRating(season.seasonId, 'viewer-capped-loser').rating)
      .toBe(1_200);
  });

  test('persists highlights and exposes complete sanitized v6 replay outcomes', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'underdog-secret',
      userId: 'viewer-underdog',
      name: 'Ashfang',
      level: 1,
      stats: { vitality: 10, might: 80, guard: 10, agility: 80 }
    });
    insertMonster(sqlite, {
      id: 'favorite-secret',
      userId: 'viewer-favorite',
      name: 'Ripple',
      element: 'Tide',
      templateId: 'ripple',
      level: 3,
      stats: { vitality: 1, might: 1, guard: 0, agility: 1 }
    });
    let nowMs = Date.parse('2026-07-27T12:00:00Z');
    const emit = jest.fn();
    const progression = new ProgressionService({
      store,
      emit,
      now: () => new Date(nowMs)
    });
    const service = createService({
      store,
      now: () => nowMs,
      emit,
      progression
    });
    const season = service.getCurrentArenaSeason();
    service.setArenaRating(season.seasonId, 'viewer-underdog', 995);
    service.setArenaRating(season.seasonId, 'viewer-favorite', 995);

    service.join({ userId: 'viewer-underdog' });
    const first = service.join({ userId: 'viewer-favorite' }).match;
    const firstCompleted = completeOneRound(
      service,
      'viewer-underdog',
      'viewer-favorite',
      'first'
    );
    expect(firstCompleted.state).toBe('completed');
    const underdogSlot = first.participants.find(
      participant => participant.viewerId === 'viewer-underdog'
    ).slot;
    const favoriteSlot = first.participants.find(
      participant => participant.viewerId === 'viewer-favorite'
    ).slot;

    const replay = service.getPublicNormalizedReplay(first.matchId, 0, 100);
    expect(replay).toEqual(expect.objectContaining({
      rulesVersion: 6,
      replayVersion: 6,
      result: expect.objectContaining({
        winnerSlot: underdogSlot,
        completion: 'battle',
        participants: expect.arrayContaining([
          expect.objectContaining({
            slot: underdogSlot,
            xpAwarded: 15,
            arenaEligible: true,
            rating: expect.objectContaining({ before: 995, after: 1011, delta: 16 })
          }),
          expect.objectContaining({
            slot: favoriteSlot,
            xpAwarded: 10,
            arenaEligible: true,
            rating: expect.objectContaining({ before: 995, after: 979, delta: -16 })
          })
        ])
      }),
      season: expect.objectContaining({
        seasonId: season.seasonId,
        durationDays: 28
      }),
      reveals: [
        expect.objectContaining({
          round: 1,
          choices: [
            expect.objectContaining({ slot: 1, choice: 'A' }),
            expect.objectContaining({ slot: 2, choice: 'A' })
          ]
        })
      ],
      progression: expect.arrayContaining([
        expect.objectContaining({ type: 'streammonsters:monster_xp_awarded' })
      ]),
      ratingChanges: expect.arrayContaining([
        expect.objectContaining({ slot: underdogSlot, delta: 16 }),
        expect.objectContaining({ slot: favoriteSlot, delta: -16 })
      ])
    }));
    expect(replay.actions[0]).toEqual(expect.objectContaining({
      actorState: expect.objectContaining({ hp: expect.any(Number) }),
      targetState: expect.objectContaining({ hp: expect.any(Number) }),
      outcomes: expect.any(Array)
    }));
    expect(replay.events.map(event => event.type)).toEqual(expect.arrayContaining([
      'streammonsters:battle_choices_revealed',
      'streammonsters:monster_xp_awarded',
      'streammonsters:arena_rating_changed',
      'streammonsters:upset'
    ]));
    expect(replay.ratingChanges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        before: expect.objectContaining({ tier: 'Bronze' }),
        after: expect.objectContaining({ tier: 'Silver' })
      })
    ]));
    expect(JSON.stringify(replay)).not.toContain('viewer-');
    expect(JSON.stringify(replay)).not.toContain('-secret');

    nowMs += 10 * 60 * 1000;
    service.join({ userId: 'viewer-underdog' });
    const second = service.join({ userId: 'viewer-favorite' }).match;
    completeOneRound(
      service,
      'viewer-underdog',
      'viewer-favorite',
      'second'
    );
    const secondEvents = service.getPublicNormalizedReplay(second.matchId, 0, 100)
      .events;
    expect(secondEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'streammonsters:win_streak',
        payload: expect.objectContaining({ count: 2 })
      }),
      expect.objectContaining({
        type: 'streammonsters:rivalry',
        payload: expect.objectContaining({ count: 2 })
      })
    ]));

    const replayAgain = service.getPublicNormalizedReplay(first.matchId, 0, 100);
    expect(replayAgain).toEqual(replay);
    expect(sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_match_rewards
      WHERE match_id = ?
    `).get(first.matchId).count).toBe(2);
  });

  test('rolls Arena and Collector seasons without changing permanent monsters or stat prompts', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'persistent',
      userId: 'viewer-persistent',
      level: 4,
      stats: { vitality: 11, might: 12, guard: 13, agility: 14 }
    });
    let nowMs = Date.parse('2026-07-01T00:00:00Z');
    const progression = new ProgressionService({
      store,
      now: () => new Date(nowMs),
      seasonDurationDays: 7
    });
    const service = new BattleMatchService({
      store,
      battleService: new BattleService({ store, now: () => nowMs }),
      progression,
      now: () => nowMs,
      seasonDurationDays: 7,
      rulesVersion: 6,
      autoStart: false
    });
    const oldArena = service.getCurrentArenaSeason();
    const oldCollector = progression.getCurrentSeason();
    service.setArenaRating(oldArena.seasonId, 'viewer-persistent', 1325);
    progression.addSeasonPoints('viewer-persistent', 510);
    sqlite.prepare(`
      UPDATE streammonsters_monsters SET unspent_stat_points = 1
      WHERE monster_id = 'persistent'
    `).run();
    const prompt = service.createStandaloneStatPrompt({
      userId: 'viewer-persistent',
      monsterId: 'persistent',
      sourceKey: 'season-rollover'
    });

    nowMs += 7 * 24 * 60 * 60 * 1000;
    const newArena = service.getCurrentArenaSeason();
    const newCollector = progression.getCurrentSeason();

    expect(newArena.seasonId).not.toBe(oldArena.seasonId);
    expect(newCollector.season_id).not.toBe(oldCollector.season_id);
    expect(service.getArenaRating(newArena.seasonId, 'viewer-persistent'))
      .toEqual(expect.objectContaining({ rating: 900, battlesRated: 0 }));
    expect(progression.getViewerSeason('viewer-persistent'))
      .toEqual(expect.objectContaining({ points: 0, rank: 'Bronze' }));
    expect(store.getMonster('persistent')).toEqual(expect.objectContaining({
      level: 4,
      unspent_stat_points: 1,
      stats: { vitality: 11, might: 12, guard: 13, agility: 14 }
    }));
    expect(sqlite.prepare(`
      SELECT status, deadline_ms FROM streammonsters_stat_allocations
      WHERE prompt_id = ?
    `).get(prompt.prompt_id)).toEqual({
      status: 'open',
      deadline_ms: Date.parse('2026-07-01T00:00:15Z')
    });
  });
});
