const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const ProgressionService = require('../plugins/streamalchemy/backend/streammonsters/progression-service');

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
});
