const Database = require('better-sqlite3');
const path = require('path');
const StreamMonstersDatabase = require('../plugins/stream-monsters/backend/streammonsters/database');
const AssetRegistry = require('../plugins/stream-monsters/backend/streammonsters/asset-registry');
const CollectionService = require('../plugins/stream-monsters/backend/streammonsters/collection-service');
const ChatCommands = require('../plugins/stream-monsters/backend/streammonsters/chat-commands');

function createCollection(progression = null, assetRegistry = null) {
  const sqlite = new Database(':memory:');
  const store = new StreamMonstersDatabase(sqlite, { assetRegistry });
  store.initialize();
  const emitted = [];
  const collection = new CollectionService({
    store,
    progression,
    assetRegistry,
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

function sumStats(stats) {
  return ['vitality', 'might', 'guard', 'agility']
    .reduce((total, key) => total + stats[key], 0);
}

describe('Stream Monsters 1.5 collection and combat evolution', () => {
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

  test('Stage II and III each grant exactly three element stats once', () => {
    const { sqlite, store, collection, monster } = createCollection();
    const originalStats = monster.stats;
    sqlite.prepare(`
      UPDATE streammonsters_monsters
      SET visual_source = 'kenney',
          visual_key = 'kenney:legacy-fallback',
          image_url = '/api/streammonsters/art/kenney-0123456789abcdef.svg'
      WHERE monster_id = 'monster-a'
    `).run();
    store.setTemplateMastery('viewer-a', 'ashfang', 25, []);
    store.setElementEssence('viewer-a', 'Ember', 3, []);

    const stageTwo = collection.evolveMonster('viewer-a', 'monster-a');
    expect(stageTwo).toEqual(expect.objectContaining({
      evolutionStage: 2,
      spentEssence: 3,
      statsBefore: originalStats,
      statsAfter: { vitality: 7, might: 10, guard: 6, agility: 8 },
      statChanges: { vitality: 0, might: 2, guard: 0, agility: 1 },
      unlockedSkill: expect.objectContaining({
        choice: 'A',
        evolutionStage: 2
      }),
      monster: expect.objectContaining({
        evolution_stage: 2,
        image_url: '/plugins/streamalchemy/assets/streammonsters/furry/evolution/ember/ashfang-stage2.webp',
        visual_source: 'furry',
        visual_key: 'furry:ashfang:stage-2',
        stats: { vitality: 7, might: 10, guard: 6, agility: 8 }
      })
    }));
    expect(sumStats(stageTwo.monster.stats) - sumStats(originalStats)).toBe(3);
    expect(collection.getEssence('viewer-a', 'Ember')).toEqual(expect.objectContaining({
      amount: 0,
      spent: 3
    }));
    expect(() => collection.evolveMonster('viewer-a', 'monster-a'))
      .toThrow('STREAM_MONSTERS_EVOLUTION_MASTERY_REQUIRED');
    expect(store.getMonster('monster-a').stats).toEqual(stageTwo.statsAfter);

    store.setTemplateMastery('viewer-a', 'ashfang', 50, []);
    store.setElementEssence('viewer-a', 'Ember', 5, []);
    const stageThree = collection.evolveMonster('viewer-a', 'monster-a');

    expect(stageThree).toEqual(expect.objectContaining({
      evolutionStage: 3,
      spentEssence: 8,
      statsBefore: { vitality: 7, might: 10, guard: 6, agility: 8 },
      statsAfter: { vitality: 7, might: 12, guard: 6, agility: 9 },
      statChanges: { vitality: 0, might: 2, guard: 0, agility: 1 },
      unlockedSkill: expect.objectContaining({
        choice: 'C',
        evolutionStage: 3,
        chargeRequired: 100
      }),
      monster: expect.objectContaining({
        evolution_stage: 3,
        image_url: '/plugins/streamalchemy/assets/streammonsters/furry/evolution/ember/ashfang-stage3.webp',
        visual_key: 'furry:ashfang:stage-3',
        stats: { vitality: 7, might: 12, guard: 6, agility: 9 }
      })
    }));
    expect(sumStats(stageThree.monster.stats) - sumStats(stageTwo.monster.stats)).toBe(3);
    expect(store.getMonster('monster-a')).toEqual(expect.objectContaining({
      level: 1,
      xp: 0,
      stats: { vitality: 7, might: 12, guard: 6, agility: 9 },
      evolution_stage: 3,
      visual_source: 'furry'
    }));
  });

  test('keeps cosmetic essence milestones based on lifetime earned after evolution spending', () => {
    const { store, collection } = createCollection();
    store.setTemplateMastery('viewer-a', 'ashfang', 50, []);

    collection.addEssence('viewer-a', 'Ember', 3, 'lifetime:palette');
    collection.evolveMonster('viewer-a', 'monster-a');
    expect(collection.getEssence('viewer-a', 'Ember')).toEqual(
      expect.objectContaining({
        amount: 0,
        spent: 3,
        unlocks: ['palette']
      })
    );

    collection.addEssence('viewer-a', 'Ember', 3, 'lifetime:aura');
    collection.addEssence('viewer-a', 'Ember', 3, 'lifetime:aura');
    expect(collection.getEssence('viewer-a', 'Ember')).toEqual(
      expect.objectContaining({
        amount: 3,
        spent: 3,
        unlocks: ['palette', 'hatch_aura']
      })
    );

    collection.addEssence('viewer-a', 'Ember', 2, 'lifetime:stage-three');
    collection.evolveMonster('viewer-a', 'monster-a');
    collection.addEssence('viewer-a', 'Ember', 4, 'lifetime:badge');
    expect(collection.getEssence('viewer-a', 'Ember')).toEqual(
      expect.objectContaining({
        amount: 4,
        spent: 8,
        unlocks: ['palette', 'hatch_aura', 'profile_badge']
      })
    );

    store.setElementEssence('legacy-viewer', 'Tide', 1, ['palette'], 5);
    collection.addEssence('legacy-viewer', 'Tide', 1, 'legacy:repair');
    expect(collection.getEssence('legacy-viewer', 'Tide')).toEqual(
      expect.objectContaining({
        amount: 2,
        spent: 5,
        unlocks: ['palette', 'hatch_aura']
      })
    );
  });

  test.each([
    ['Ember', { vitality: 0, might: 2, guard: 0, agility: 1 }],
    ['Tide', { vitality: 2, might: 0, guard: 1, agility: 0 }],
    ['Grove', { vitality: 1, might: 0, guard: 2, agility: 0 }],
    ['Gale', { vitality: 0, might: 1, guard: 0, agility: 2 }],
    ['Volt', { vitality: 0, might: 2, guard: 0, agility: 1 }],
    ['Lunar', { vitality: 1, might: 1, guard: 1, agility: 0 }]
  ])('%s uses its fixed three-point Stage II and III grant', (element, expected) => {
    let evolutionRules;
    expect(() => {
      evolutionRules = require(
        '../plugins/stream-monsters/backend/streammonsters/evolution-rules'
      );
    }).not.toThrow();

    expect(evolutionRules.evolutionStatGrant(element, 2)).toEqual(expected);
    expect(evolutionRules.evolutionStatGrant(element, 3)).toEqual(expected);
    expect(sumStats(evolutionRules.evolutionStatGrant(element, 2))).toBe(3);
  });

  test('backfills historical Stage II and III grants exactly once across initialization', () => {
    const { sqlite, store, monster } = createCollection();
    sqlite.prepare(`
      UPDATE streammonsters_monsters
      SET evolution_stage = 3, evolution_essence_spent = 8, stats_json = ?
      WHERE monster_id = ?
    `).run(JSON.stringify(monster.stats), monster.monster_id);

    store.initialize();
    const afterFirstInitialization = store.getMonster(monster.monster_id);
    store.initialize();
    const afterSecondInitialization = store.getMonster(monster.monster_id);
    const grantTable = sqlite.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'streammonsters_evolution_grants'
    `).get();

    expect(grantTable).toEqual({ name: 'streammonsters_evolution_grants' });
    expect(afterFirstInitialization.stats).toEqual({
      vitality: 7,
      might: 12,
      guard: 6,
      agility: 9
    });
    expect(afterSecondInitialization.stats).toEqual(afterFirstInitialization.stats);
    expect(sqlite.prepare(`
      SELECT stage, stats_json FROM streammonsters_evolution_grants
      WHERE monster_id = ? ORDER BY stage
    `).all(monster.monster_id)).toEqual([
      {
        stage: 2,
        stats_json: JSON.stringify({ vitality: 0, might: 2, guard: 0, agility: 1 })
      },
      {
        stage: 3,
        stats_json: JSON.stringify({ vitality: 0, might: 2, guard: 0, agility: 1 })
      }
    ]);
  });

  test('upgrades automatic Kenney fallback visuals to their bundled canonical Furry form', () => {
    const assetRegistry = new AssetRegistry({
      pluginDir: path.join(process.cwd(), 'plugins', 'stream-monsters')
    });
    const { sqlite, store } = createCollection(null, assetRegistry);
    sqlite.prepare(`
      UPDATE streammonsters_monsters
      SET visual_source = 'kenney',
          visual_key = 'kenney:legacy-fallback',
          image_url = '/api/streammonsters/art/kenney-0123456789abcdef.svg'
      WHERE monster_id = 'monster-a'
    `).run();

    store.initialize();

    expect(store.getMonster('monster-a')).toEqual(expect.objectContaining({
      template_id: 'ashfang',
      evolution_stage: 1,
      image_url: '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.webp',
      visual_source: 'furry',
      visual_key: 'furry:ashfang'
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

  test('exposes pagination, large cards, and duplicate fusion through viewer commands', () => {
    const assetRegistry = new AssetRegistry({
      pluginDir: path.join(process.cwd(), 'plugins', 'stream-monsters')
    });
    const { store, collection } = createCollection(null, assetRegistry);
    const commands = new ChatCommands({
      store,
      collection,
      engine: { markReadyEggs: jest.fn(), streamKey: 'stream-a' },
      battleService: {}
    });
    store.setTemplateMastery('viewer-a', 'ashfang', 25, []);
    store.setElementEssence('viewer-a', 'Ember', 3, []);
    const duplicateEgg = store.createEgg({
      eggId: 'egg-duplicate',
      userId: 'viewer-a',
      giftId: 2,
      giftName: 'Duplicate Gift',
      element: 'Ember',
      eggColor: '#ef6b45',
      seed: 'seed-duplicate',
      state: 'ready',
      createdAtMs: 3,
      hatchDurationMs: 1,
      readyAtMs: 3
    });
    store.createMonsterFromEgg(duplicateEgg, {
      monsterId: 'monster-duplicate',
      name: 'Ashfang',
      templateId: 'ashfang',
      personality: 'Bold',
      rarity: 'Standard',
      stats: { vitality: 7, might: 8, guard: 6, agility: 7 },
      imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.webp',
      visualSource: 'furry',
      visualKey: 'furry:ashfang',
      createdAtMs: 3
    });

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
        status: 'fused',
        evolution: expect.objectContaining({ fromStage: 1, toStage: 2 })
      })
    );
    expect(collection.getEssence('viewer-a', 'Ember')).toEqual(
      expect.objectContaining({ amount: 3, spent: 0 })
    );
  });
});
