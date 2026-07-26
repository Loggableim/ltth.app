const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const ProgressionService = require('../plugins/streamalchemy/backend/streammonsters/progression-service');

function createMonster(store, userId, seed = 'progression-seed') {
  const egg = store.createEgg({
    userId,
    giftId: 1,
    giftName: 'Progress Gift',
    element: 'Ember',
    eggColor: '#ef6b45',
    seed,
    createdAtMs: 1,
    hatchDurationMs: 0
  });
  return store.createMonsterFromEgg(egg, {
    name: 'Fizzlet',
    personality: 'Brave',
    rarity: 'Standard',
    stats: { vitality: 7, might: 7, guard: 7, agility: 7 },
    createdAtMs: 2
  });
}

describe('Stream Monsters 1.2 progression and seasons', () => {
  test('awards the documented permanent XP and 28-day season points', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const monster = createMonster(store, 'viewer-a');
    const progression = new ProgressionService({
      store,
      now: () => new Date('2026-07-23T12:00:00Z')
    });

    progression.recordHatch('viewer-a', 'creator:room', monster);
    progression.recordBattle('viewer-a', 'creator:room', { monster, won: true });

    expect(store.getMonster(monster.monster_id)).toEqual(expect.objectContaining({
      xp: 50
    }));
    expect(progression.getViewerSeason('viewer-a')).toEqual(expect.objectContaining({
      points: 20,
      rank: 'Bronze'
    }));
    progression.recordHatch('viewer-a', 'creator:room', monster);
    expect(progression.getViewerSeason('viewer-a').points).toBe(20);
    expect(progression.getCurrentSeason().ends_at_ms - progression.getCurrentSeason().starts_at_ms)
      .toBe(28 * 24 * 60 * 60 * 1000);
  });

  test('uses 100 + 25 x (level - 1) thresholds and grants one unspent point per level through 20', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const monster = createMonster(store, 'viewer-a', 'level-seed');

    store.awardMonsterXp(monster.monster_id, 225);
    const leveled = store.getMonster(monster.monster_id);

    expect(leveled.level).toBe(3);
    expect(leveled.xp).toBe(0);
    expect(Object.values(leveled.stats).reduce((sum, value) => sum + value, 0)).toBe(28);
    expect(leveled.unspent_stat_points).toBe(2);
  });

  test('keeps early quest and first-action XP pending until the viewer owns a monster', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const progression = new ProgressionService({
      store,
      now: () => new Date('2026-07-23T12:00:00Z')
    });

    progression.recordGift('new-viewer', 'creator:first-stream');
    expect(store.getViewerProgress('new-viewer').pending_xp).toBe(17);

    const monster = createMonster(store, 'new-viewer');
    progression.recordHatch('new-viewer', 'creator:first-stream', monster);

    expect(store.getViewerProgress('new-viewer').pending_xp).toBe(0);
    expect(store.getMonster(monster.monster_id).xp).toBe(52);
  });

  test('all battles grant XP while only the first ten each UTC day grant season points', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const monster = createMonster(store, 'viewer-a');
    const progression = new ProgressionService({
      store,
      now: () => new Date('2026-07-23T12:00:00Z')
    });

    for (let index = 0; index < 12; index += 1) {
      progression.recordBattle('viewer-a', 'creator:room', { monster, won: false });
    }

    expect(store.getMonster(monster.monster_id)).toEqual(expect.objectContaining({ level: 2, xp: 70 }));
    expect(progression.getViewerSeason('viewer-a').points).toBe(40);
  });

  test('season rollover resets league points but preserves collection and monster level', () => {
    let now = new Date('2026-07-23T12:00:00Z');
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const monster = createMonster(store, 'viewer-a');
    const progression = new ProgressionService({ store, now: () => now });
    store.awardMonsterXp(monster.monster_id, 225);
    progression.recordBattle('viewer-a', 'creator:room', { monster, won: true });
    const firstSeason = progression.getCurrentSeason();

    now = new Date(firstSeason.ends_at_ms + 1);
    const secondSeason = progression.getCurrentSeason();

    expect(secondSeason.season_id).not.toBe(firstSeason.season_id);
    expect(progression.getViewerSeason('viewer-a').points).toBe(0);
    expect(store.getViewerMonsters('viewer-a')).toHaveLength(1);
    expect(store.getMonster(monster.monster_id).level).toBe(3);
  });

  test('unlocks the first hatch, charged hatch and six-element achievements once', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const emitted = [];
    const progression = new ProgressionService({
      store,
      now: () => new Date('2026-07-23T12:00:00Z'),
      emit: (event, payload) => emitted.push({ event, payload })
    });
    const elements = ['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar'];
    elements.forEach((element, index) => {
      const monster = createMonster(store, 'viewer-a', `achievement-${element}`);
      store.db.prepare('UPDATE streammonsters_monsters SET element = ? WHERE monster_id = ?')
        .run(element, monster.monster_id);
      progression.recordHatch('viewer-a', 'creator:room', {
        ...store.getMonster(monster.monster_id),
        variant: index === 0 ? 'charged' : 'standard'
      });
    });

    expect(store.getViewerAchievements('viewer-a').map(item => item.achievement_key)).toEqual(
      expect.arrayContaining(['first_hatch', 'charged_hatch', 'six_elements'])
    );
    expect(emitted.filter(entry => entry.event === 'streammonsters:achievement_unlocked')).toHaveLength(3);
    expect(emitted.filter(entry => entry.event === 'streammonsters:achievement_unlocked')
      .map(entry => entry.payload.messageKey)).toEqual(expect.arrayContaining([
      'achievementFirstHatch',
      'achievementChargedHatch',
      'achievementSixElements'
    ]));
  });

  test('counts battle achievements across the whole viewer collection', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const progression = new ProgressionService({
      store,
      now: () => new Date('2026-07-23T12:00:00Z')
    });
    const first = createMonster(store, 'viewer-a', 'battle-a');
    const second = createMonster(store, 'viewer-a', 'battle-b');

    for (let index = 0; index < 5; index += 1) {
      progression.recordBattle('viewer-a', 'creator:room', { monster: first, won: false });
      progression.recordBattle('viewer-a', 'creator:room', { monster: second, won: false });
    }

    expect(store.getViewerAchievements('viewer-a').map(item => item.achievement_key))
      .toContain('10_battles');
  });

  test('tracks Five-Win Streak chronologically across monsters and resets on any loss', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const progression = new ProgressionService({
      store,
      now: () => new Date('2026-07-23T12:00:00Z')
    });
    const first = createMonster(store, 'streak-viewer', 'streak-a');
    const second = createMonster(store, 'streak-viewer', 'streak-b');
    for (let index = 0; index < 5; index += 1) {
      progression.recordBattle('streak-viewer', 'creator:room', {
        monster: index % 2 ? first : second,
        won: true
      });
    }
    expect(store.getViewerAchievements('streak-viewer').map(item => item.achievement_key))
      .toContain('five_win_streak');

    const resetFirst = createMonster(store, 'reset-viewer', 'reset-a');
    const resetSecond = createMonster(store, 'reset-viewer', 'reset-b');
    for (let index = 0; index < 4; index += 1) {
      progression.recordBattle('reset-viewer', 'creator:room', { monster: resetFirst, won: true });
    }
    progression.recordBattle('reset-viewer', 'creator:room', { monster: resetSecond, won: false });
    progression.recordBattle('reset-viewer', 'creator:room', { monster: resetFirst, won: true });
    expect(store.getViewerAchievements('reset-viewer').map(item => item.achievement_key))
      .not.toContain('five_win_streak');
  });

  test('awards weekly collection XP and persists cosmetic rank rewards without battle power', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const monster = createMonster(store, 'viewer-a', 'cosmetic-rank');
    const progression = new ProgressionService({
      store,
      now: () => new Date('2026-07-23T12:00:00Z')
    });

    progression.recordCollection('viewer-a', 6, 'creator:room');
    progression.addSeasonPoints('viewer-a', 80);
    const score = progression.getViewerSeason('viewer-a');

    expect(store.getMonster(monster.monster_id).xp).toBe(50);
    expect(score).toEqual(expect.objectContaining({
      points: 100,
      rank: 'Silver',
      title: 'Silver Collector',
      badge: 'silver',
      frame: 'silver'
    }));
    expect(store.getMonster(monster.monster_id).stats).toEqual(monster.stats);
  });
});
