const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const CollectionService = require('../plugins/streamalchemy/backend/streammonsters/collection-service');
const ChatCommands = require('../plugins/streamalchemy/backend/streammonsters/chat-commands');

function createCollection(progression = null) {
  const sqlite = new Database(':memory:');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  const emitted = [];
  const collection = new CollectionService({
    store,
    progression,
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => 5_000
  });
  const egg = store.createEgg({
    eggId: 'egg-a',
    userId: 'viewer-a',
    giftId: 1,
    giftName: 'Team Heart',
    element: 'Ember',
    eggColor: '#ef6b45',
    seed: 'seed-a',
    state: 'ready',
    createdAtMs: 1,
    hatchDurationMs: 1,
    readyAtMs: 1
  });
  const monster = store.createMonsterFromEgg(egg, {
    monsterId: 'monster-a',
    name: 'Ashfang',
    templateId: 'ashfang',
    personality: 'Brave',
    rarity: 'Standard',
    stats: { vitality: 7, might: 8, guard: 6, agility: 7 },
    imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png',
    visualSource: 'furry',
    visualKey: 'furry:ashfang',
    createdAtMs: 2
  });
  return { sqlite, store, collection, monster, emitted };
}

describe('Stream Monsters 1.5 collection and cosmetic evolution', () => {
  test('awards the exact Collector points for mastery milestones, evolutions and missions once', () => {
    const progression = { awardCollectorPoints: jest.fn(() => ({ awarded: true })) };
    const { store, collection, monster } = createCollection(progression);

    collection.addMastery('viewer-a', 'ashfang', 10, 'milestone-10');
    collection.addMastery('viewer-a', 'ashfang', 15, 'milestone-25');
    collection.addMastery('viewer-a', 'ashfang', 25, 'milestone-50');
    store.setElementEssence('viewer-a', 'Ember', 8, []);
    collection.evolveMonster('viewer-a', monster.monster_id);
    collection.evolveMonster('viewer-a', monster.monster_id);
    store.addMissionParticipant('stream-a', 'viewer-a', monster.monster_id);
    collection.rewardMissionParticipant(
      'stream-a',
      store.getMissionParticipant('stream-a', 'viewer-a')
    );
    collection.rewardMissionParticipant(
      'stream-a',
      store.getMissionParticipant('stream-a', 'viewer-a')
    );

    expect(progression.awardCollectorPoints.mock.calls.map(call => call.slice(0, 2)))
      .toEqual([
        ['viewer-a', 10],
        ['viewer-a', 10],
        ['viewer-a', 10],
        ['viewer-a', 25],
        ['viewer-a', 50],
        ['viewer-a', 20]
      ]);
  });

  test('spends essence durably for cosmetic Evolution II and III without changing stats', () => {
    const { store, collection, monster } = createCollection();
    const originalStats = monster.stats;
    store.setTemplateMastery('viewer-a', 'ashfang', 25, []);
    store.setElementEssence('viewer-a', 'Ember', 3, []);

    const stageTwo = collection.evolveMonster('viewer-a', 'monster-a');
    expect(stageTwo).toEqual(expect.objectContaining({
      evolutionStage: 2,
      spentEssence: 3,
      monster: expect.objectContaining({
        evolution_stage: 2,
        stats: originalStats
      })
    }));
    expect(collection.getEssence('viewer-a', 'Ember')).toEqual(expect.objectContaining({
      amount: 0,
      spent: 3
    }));

    store.setTemplateMastery('viewer-a', 'ashfang', 50, []);
    store.setElementEssence('viewer-a', 'Ember', 5, []);
    const stageThree = collection.evolveMonster('viewer-a', 'monster-a');

    expect(stageThree).toEqual(expect.objectContaining({
      evolutionStage: 3,
      spentEssence: 8,
      monster: expect.objectContaining({
        evolution_stage: 3,
        stats: originalStats
      })
    }));
    expect(store.getMonster('monster-a')).toEqual(expect.objectContaining({
      level: 1,
      xp: 0,
      stats: originalStats,
      evolution_stage: 3
    }));
  });

  test('rejects evolution below mastery or spend thresholds without consuming essence', () => {
    const { store, collection } = createCollection();
    store.setTemplateMastery('viewer-a', 'ashfang', 24, []);
    store.setElementEssence('viewer-a', 'Ember', 20, []);

    expect(() => collection.evolveMonster('viewer-a', 'monster-a'))
      .toThrow('STREAM_MONSTERS_EVOLUTION_MASTERY_REQUIRED');
    expect(collection.getEssence('viewer-a', 'Ember')).toEqual(expect.objectContaining({
      amount: 20,
      spent: 0
    }));
    expect(store.getMonster('monster-a').evolution_stage).toBe(1);
  });

  test('returns paginated collection, six-card rotation, and a large single-monster card', () => {
    const { collection } = createCollection();

    const page = collection.getCatalogPage('viewer-a', { page: 2, pageSize: 6 });
    expect(page).toEqual(expect.objectContaining({
      page: 2,
      pageSize: 6,
      total: 24,
      totalPages: 4,
      cards: expect.any(Array)
    }));
    expect(page.cards).toHaveLength(6);

    const rotation = collection.getCatalogRotation('viewer-a', { cursor: 0 });
    expect(rotation).toEqual(expect.objectContaining({
      cursor: 0,
      nextCursor: 6,
      cards: expect.any(Array)
    }));
    expect(rotation.cards).toHaveLength(6);

    expect(collection.getMonsterCard('viewer-a', 'monster-a')).toEqual(expect.objectContaining({
      type: 'monster',
      size: 'large',
      placement: 'upper',
      monster: expect.objectContaining({
        monster_id: 'monster-a',
        evolution_stage: 1
      }),
      mastery: expect.objectContaining({ template_id: 'ashfang' })
    }));
  });

  test('exposes pagination, large cards, and cosmetic evolution through viewer commands', () => {
    const { store, collection } = createCollection();
    const commands = new ChatCommands({
      store,
      collection,
      engine: { markReadyEggs: jest.fn(), streamKey: 'stream-a' },
      battleService: {}
    });
    store.setTemplateMastery('viewer-a', 'ashfang', 25, []);
    store.setElementEssence('viewer-a', 'Ember', 3, []);

    expect(commands.execute({ userId: 'viewer-a' }, 'monsters', ['1'])).toEqual(
      expect.objectContaining({
        success: true,
        status: 'inventory',
        page: expect.objectContaining({ page: 1, pageSize: 6, total: 24 }),
        rotation: expect.objectContaining({ cards: expect.any(Array) })
      })
    );
    expect(commands.execute({ userId: 'viewer-a' }, 'monster', ['1'])).toEqual(
      expect.objectContaining({
        success: true,
        card: expect.objectContaining({ size: 'large', placement: 'upper' })
      })
    );
    expect(commands.execute({ userId: 'viewer-a' }, 'evolve', ['1'])).toEqual(
      expect.objectContaining({
        success: true,
        status: 'evolved',
        evolution: expect.objectContaining({ evolutionStage: 2 })
      })
    );
  });
});
