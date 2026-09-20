const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/stream-monsters/backend/streammonsters/database');
const ProgressionService = require('../plugins/stream-monsters/backend/streammonsters/progression-service');
const BattleMatchService = require(
  '../plugins/stream-monsters/backend/streammonsters/battle-match-service'
);

function createProgression() {
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const emitted = [];
  const progression = new ProgressionService({
    store,
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => new Date('2026-07-21T12:00:00Z')
  });
  return { store, progression, emitted };
}

describe('Stream Monsters progression', () => {
  test('uses the configured Collector season duration and applies changes immediately', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const nowMs = Date.parse('2026-07-21T12:00:00Z');
    const progression = new ProgressionService({
      store,
      now: () => new Date(nowMs),
      seasonDurationDays: 7
    });

    const weekly = progression.getCurrentSeason();
    expect(weekly.ends_at_ms - weekly.starts_at_ms).toBe(7 * 24 * 60 * 60 * 1000);
    expect(weekly.season_id).toMatch(/^season-7-/);

    progression.setSeasonDurationDays(60);
    const long = progression.getCurrentSeason();
    expect(long.ends_at_ms - long.starts_at_ms).toBe(60 * 24 * 60 * 60 * 1000);
    expect(long.season_id).toMatch(/^season-60-/);
    expect(long.season_id).not.toBe(weekly.season_id);
  });

  test('creates a transparent deterministic event and daily quest progress for a viewer', () => {
    const { store, progression, emitted } = createProgression();

    const event = progression.startStreamSession({ streamKey: 'creator:room-1' });
    progression.recordGift('viewer-a', event.stream_key);
    progression.recordHatch('viewer-a', event.stream_key);
    progression.recordCommand('viewer-a', event.stream_key);

    expect(event).toEqual(expect.objectContaining({ boost_multiplier: 2 }));
    expect(store.getViewerQuests('viewer-a', '2026-07-21')).toEqual(expect.arrayContaining([
      expect.objectContaining({ quest_key: 'daily:gift', completed: 1 }),
      expect.objectContaining({ quest_key: 'daily:hatch', completed: 1 }),
      expect.objectContaining({ quest_key: 'daily:chat', completed: 1 })
    ]));
    expect(store.getViewerProgress('viewer-a').stream_streak).toBe(1);
    expect(store.getStreamMetrics('creator:room-1')).toEqual(expect.objectContaining({
      active_viewers: 1,
      quest_completions: 3
    }));
    expect(emitted.filter(entry => entry.event === 'streammonsters:quest_completed')
      .map(entry => entry.payload.messageKey)).toEqual(expect.arrayContaining([
      'questDailyGift',
      'questDailyHatch',
      'questDailyChat'
    ]));
  });

  test('records each received egg once while reserving weekly event credit for gifts', () => {
    const { store, progression } = createProgression();
    const streamKey = 'creator:egg-receipt';

    const first = progression.recordEggReceived('viewer-a', streamKey, {
      source: 'free',
      eventId: 'free-claim-1'
    });
    const retry = progression.recordEggReceived('viewer-a', streamKey, {
      source: 'free',
      eventId: 'free-claim-1'
    });

    expect(first).toEqual(expect.objectContaining({ recorded: true, source: 'free' }));
    expect(retry).toEqual(expect.objectContaining({ recorded: false, source: 'free' }));
    expect(store.getViewerQuests('viewer-a', '2026-07-21')).toEqual([
      expect.objectContaining({
        quest_key: 'daily:gift',
        title: 'Receive an egg',
        progress: 1,
        completed: 1
      })
    ]);
    expect(store.getViewerQuests('viewer-a', '2026-W30')).toEqual([]);

    progression.recordGift('viewer-a', streamKey, { eventId: 'gift-1' });
    progression.recordGift('viewer-a', streamKey, { eventId: 'gift-1' });

    expect(store.getViewerQuests('viewer-a', '2026-W30')).toEqual([
      expect.objectContaining({
        quest_key: 'weekly:event',
        progress: 1,
        completed: 0
      })
    ]);
  });

  test('allows prestige only after collecting every original element and never deletes monsters', () => {
    const { store, progression } = createProgression();
    const elements = ['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar'];
    elements.forEach((element, index) => {
      const egg = store.createEgg({
        userId: 'viewer-a', giftId: index + 1, giftName: element, element, eggColor: '#ffffff',
        seed: `seed-${element}`, createdAtMs: index, hatchDurationMs: 0
      });
      store.createMonsterFromEgg(egg, {
        name: `${element}ling`, rarity: 'Common', stats: { vitality: 5, might: 5, guard: 5, agility: 5 }, createdAtMs: index
      });
    });
    store.incrementViewer('viewer-a', 'gifts_sent', 30);

    const result = progression.prestige('viewer-a');

    expect(result.success).toBe(true);
    expect(store.getViewerMonsters('viewer-a')).toHaveLength(6);
    expect(store.getViewerProgress('viewer-a')).toEqual(expect.objectContaining({ prestige: 1, gifts_sent: 0 }));
  });

  test('tracks weekly collection progress as the current element count, not a cumulative sum', () => {
    const { store, progression } = createProgression();

    progression.recordCollection('viewer-a', 1);
    progression.recordCollection('viewer-a', 2);

    expect(store.getViewerQuests('viewer-a', '2026-W30')).toEqual(expect.arrayContaining([
      expect.objectContaining({ quest_key: 'weekly:collection', progress: 2, completed: 0 })
    ]));
  });

  test('opens and consumes a 30-second stat choice when non-battle XP levels a monster', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const emitted = [];
    let nowMs = 1_000;
    const matchService = new BattleMatchService({
      store,
      battleService: {},
      emit: (event, payload) => emitted.push({ event, payload }),
      now: () => nowMs,
      autoStart: false
    });
    const progression = new ProgressionService({
      store,
      now: () => new Date('2026-07-21T12:00:00Z'),
      onMonsterProgressed: change => {
        matchService.createStandaloneStatPrompt({
          userId: change.userId,
          monsterId: change.monster.monster_id,
          sourceKey: change.sourceKey
        });
      }
    });
    const egg = store.createEgg({
      userId: 'viewer-level',
      giftId: 1,
      giftName: 'Team Heart',
      element: 'Ember',
      eggColor: '#ef6b45',
      seed: 'level-seed',
      createdAtMs: 1,
      hatchDurationMs: 0
    });
    const monster = store.createMonsterFromEgg(egg, {
      name: 'Ashfang',
      rarity: 'Common',
      stats: { vitality: 7, might: 7, guard: 7, agility: 7 },
      templateId: 'ashfang',
      imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png',
      createdAtMs: 2
    });
    store.db.prepare(`
      UPDATE streammonsters_monsters SET xp = 90 WHERE monster_id = ?
    `).run(monster.monster_id);

    progression.recordHatch('viewer-level', 'stream-level', store.getMonster(monster.monster_id));

    const prompt = store.db.prepare(`
      SELECT * FROM streammonsters_stat_allocations
      WHERE viewer_id = 'viewer-level' AND status = 'open'
    `).get();
    expect(prompt).toEqual(expect.objectContaining({
      monster_id: monster.monster_id,
      deadline_ms: 31_000,
      status: 'open'
    }));
    expect(emitted).toContainEqual(expect.objectContaining({
      event: 'streammonsters:monster_stat_prompt',
      payload: expect.objectContaining({
        deadlineMs: 31_000,
        choices: ['1', '2', '3', '4']
      })
    }));

    expect(matchService.submitStatChoice({
      userId: 'viewer-level',
      choice: '2',
      eventId: 'outside-level-choice'
    })).toEqual(expect.objectContaining({
      handled: true,
      stat: 'might',
      matchId: null
    }));
    expect(store.getMonster(monster.monster_id)).toEqual(expect.objectContaining({
      level: 2,
      unspent_stat_points: 0,
      stats: expect.objectContaining({ might: 8 })
    }));
    expect(matchService.submitStatChoice({
      userId: 'viewer-level',
      choice: '3',
      eventId: 'outside-level-choice'
    })).toEqual({ handled: false, reason: 'duplicate_event' });

    nowMs = 40_000;
    expect(matchService.sweep()).toEqual(expect.objectContaining({
      allocationsExpired: 0
    }));
  });
});
