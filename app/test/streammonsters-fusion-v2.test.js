const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);
const CollectionService = require(
  '../plugins/streamalchemy/backend/streammonsters/collection-service'
);
const StreamMonstersEngine = require(
  '../plugins/streamalchemy/backend/streammonsters/game-engine'
);
const ChatCommands = require(
  '../plugins/streamalchemy/backend/streammonsters/chat-commands'
);
const PublicEventProjector = require(
  '../plugins/streamalchemy/backend/streammonsters/public-event-projector'
);
const StreamAlchemyPlugin = require('../plugins/streamalchemy');
const ArenaDirector = require(
  '../plugins/streamalchemy/streammonsters-arena-director'
);
const { effectiveCombatPower } = require(
  '../plugins/streamalchemy/backend/streammonsters/evolution-rules'
);
const { getTemplate } = require(
  '../plugins/streamalchemy/backend/streammonsters/catalog'
);

function createStore({ assetRegistry = null } = {}) {
  const sqlite = new Database(':memory:');
  const store = new StreamMonstersDatabase(sqlite, { assetRegistry });
  store.initialize();
  return { sqlite, store };
}

function createSubject({ assetRegistry = null, progression = null } = {}) {
  const { sqlite, store } = createStore({ assetRegistry });
  const emitted = [];
  const collection = new CollectionService({
    store,
    assetRegistry,
    progression,
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => 50_000
  });
  return { sqlite, store, collection, emitted };
}

function createLifecycle({ assetRegistry = completeAssetRegistry() } = {}) {
  const subject = createSubject({ assetRegistry });
  const { store, collection, emitted } = subject;
  collection.reserveTemplateForEgg = () => ({
    template: getTemplate('ashfang')
  });
  const progression = {
    recordHatch: jest.fn(),
    recordCollection: jest.fn()
  };
  const engine = new StreamMonstersEngine({
    store,
    collection,
    progression,
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => 50_000,
    config: { hatchDurationMs: 0 }
  });
  return { ...subject, engine, progression };
}

function completeAssetRegistry() {
  return {
    audit: () => ({ assets: new Map() }),
    getAsset: (templateId, stage) => ({
      templateId,
      stage,
      assetVersion: 'furry-1.12.0'
    }),
    resolveVisual: ({ templateId, stage }) => ({
      imageUrl: `/plugins/streamalchemy/assets/streammonsters/furry/evolution/ember/${templateId}-stage${stage}.webp`,
      visualSource: 'furry',
      visualKey: `furry:${templateId}:stage-${stage}`,
      assetVersion: 'furry-1.12.0'
    })
  };
}

function createMonster(store, {
  userId = 'viewer-a',
  monsterId,
  templateId = 'ashfang',
  element = 'Ember',
  createdAtMs = 1,
  stage = 1,
  prestigeLevel = 0,
  level = 1,
  xp = 0,
  stats = { vitality: 7, might: 7, guard: 7, agility: 7 },
  personality = 'Curious'
}) {
  const egg = store.createEgg({
    eggId: `egg:${monsterId}`,
    userId,
    giftId: 1,
    giftName: 'Test Gift',
    element,
    eggColor: '#ef6b45',
    seed: `seed:${monsterId}`,
    state: 'ready',
    readyAtMs: createdAtMs,
    createdAtMs,
    hatchDurationMs: 0
  });
  store.createMonsterFromEgg(egg, {
    monsterId,
    templateId,
    name: monsterId,
    rarity: 'Standard',
    personality,
    stats,
    imageUrl: `/plugins/streamalchemy/assets/streammonsters/furry/${templateId}.webp`,
    visualSource: 'furry',
    visualKey: `furry:${templateId}`,
    assetVersion: 'furry-1.12.0',
    createdAtMs
  });
  store.db.prepare(`
    UPDATE streammonsters_monsters
    SET evolution_stage = ?, prestige_level = ?, level = ?, xp = ?
    WHERE monster_id = ?
  `).run(stage, prestigeLevel, level, xp, monsterId);
  return store.getMonster(monsterId);
}

function createReadyEgg(store, eggId, createdAtMs) {
  return store.createEgg({
    eggId,
    userId: 'viewer-a',
    giftId: 1,
    giftName: 'Test Gift',
    element: 'Ember',
    eggColor: '#ef6b45',
    seed: `seed:${eggId}`,
    state: 'ready',
    readyAtMs: createdAtMs,
    createdAtMs,
    hatchDurationMs: 0
  });
}

describe('Stream Monsters duplicate fusion persistence', () => {
  test('migrates monsters to owned state without startup fusion and hides only archived inventory rows', () => {
    const { sqlite, store } = createStore();
    const first = createMonster(store, {
      monsterId: 'monster-a',
      createdAtMs: 10
    });
    const second = createMonster(store, {
      monsterId: 'monster-b',
      createdAtMs: 20
    });

    store.initialize();

    expect(sqlite.prepare(`
      SELECT monster_id, collection_state, archived_at_ms,
             archived_reason, archived_by_fusion_id, prestige_level
      FROM streammonsters_monsters
      ORDER BY monster_id
    `).all()).toEqual([
      {
        monster_id: first.monster_id,
        collection_state: 'owned',
        archived_at_ms: null,
        archived_reason: null,
        archived_by_fusion_id: null,
        prestige_level: 0
      },
      {
        monster_id: second.monster_id,
        collection_state: 'owned',
        archived_at_ms: null,
        archived_reason: null,
        archived_by_fusion_id: null,
        prestige_level: 0
      }
    ]);
    expect(sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_fusion_ledger
    `).get().count).toBe(0);

    sqlite.prepare(`
      UPDATE streammonsters_monsters
      SET collection_state = 'archived',
          archived_at_ms = 30,
          archived_reason = 'fusion_donor',
          archived_by_fusion_id = 'fusion-a',
          is_selected = 0
      WHERE monster_id = ?
    `).run(second.monster_id);

    expect(store.getViewerMonsters('viewer-a').map(row => row.monster_id))
      .toEqual([first.monster_id]);
    expect(store.getMonster(second.monster_id)).toEqual(expect.objectContaining({
      monster_id: second.monster_id,
      collection_state: 'archived',
      archived_reason: 'fusion_donor'
    }));
    expect(store.getOwnedTemplateIds('viewer-a')).toEqual(['ashfang']);
    expect(store.countOwnedTemplate('viewer-a', 'ashfang')).toBe(1);
    expect(() => store.selectMonster('viewer-a', second.monster_id))
      .toThrow('STREAM_MONSTER_NOT_OWNED');
  });

  test('fuses an exact Stage-I pair into the stronger survivor and transfers donor selection', () => {
    const progression = { awardCollectorPoints: jest.fn() };
    const { sqlite, store, collection, emitted } = createSubject({
      assetRegistry: completeAssetRegistry(),
      progression
    });
    const selectedDonor = createMonster(store, {
      monsterId: 'monster-selected',
      createdAtMs: 10,
      level: 2,
      xp: 44,
      stats: { vitality: 7, might: 7, guard: 7, agility: 7 },
      personality: 'Gentle'
    });
    const strongSurvivor = createMonster(store, {
      monsterId: 'monster-strong',
      createdAtMs: 20,
      level: 5,
      xp: 77,
      stats: { vitality: 11, might: 13, guard: 9, agility: 10 },
      personality: 'Brave'
    });
    createMonster(store, {
      userId: 'viewer-b',
      monsterId: 'monster-other-owner',
      createdAtMs: 5
    });
    createMonster(store, {
      monsterId: 'monster-other-template',
      templateId: 'cindercub',
      createdAtMs: 6
    });

    const result = collection.fuseDuplicates({
      userId: 'viewer-a',
      templateId: 'ashfang',
      triggerType: 'hatch',
      triggerId: 'hatch:monster-strong'
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'fused',
      fromStage: 1,
      toStage: 2,
      prestigeBefore: 0,
      prestigeAfter: 0,
      survivor: expect.objectContaining({
        monster_id: strongSurvivor.monster_id,
        evolution_stage: 2,
        level: 5,
        xp: 77,
        personality: 'Brave',
        stats: { vitality: 11, might: 15, guard: 9, agility: 11 }
      })
    }));
    expect(store.getMonster(selectedDonor.monster_id)).toEqual(
      expect.objectContaining({
        collection_state: 'archived',
        archived_reason: 'fusion_donor',
        is_selected: 0
      })
    );
    expect(store.getSelectedMonster('viewer-a').monster_id)
      .toBe(strongSurvivor.monster_id);
    expect(store.getViewerMonsters('viewer-a').map(row => row.monster_id))
      .toEqual(['monster-other-template', strongSurvivor.monster_id]);
    expect(sqlite.prepare(`
      SELECT template_id, survivor_monster_id, donor_monster_id,
             from_stage, to_stage, prestige_before, prestige_after
      FROM streammonsters_fusion_ledger
    `).get()).toEqual({
      template_id: 'ashfang',
      survivor_monster_id: strongSurvivor.monster_id,
      donor_monster_id: selectedDonor.monster_id,
      from_stage: 1,
      to_stage: 2,
      prestige_before: 0,
      prestige_after: 0
    });
    expect(progression.awardCollectorPoints)
      .toHaveBeenCalledTimes(1);
    expect(emitted).toEqual([
      {
        event: 'streammonsters:monster_evolved',
        payload: expect.objectContaining({
          userId: 'viewer-a',
          evolutionStage: 2,
          fusion: {
            kind: 'stage',
            fromStage: 1,
            toStage: 2,
            prestigeBefore: 0,
            prestigeAfter: 0
          },
          monster: expect.objectContaining({
            monster_id: strongSurvivor.monster_id
          })
        })
      }
    ]);
  });

  test('uses older creation then stable monster ID to break equal-power survivor ties', () => {
    const { store, collection } = createSubject({
      assetRegistry: completeAssetRegistry()
    });
    createMonster(store, {
      monsterId: 'monster-z',
      createdAtMs: 10
    });
    createMonster(store, {
      monsterId: 'monster-b',
      createdAtMs: 10
    });
    createMonster(store, {
      monsterId: 'monster-a',
      createdAtMs: 20
    });

    const first = collection.fuseDuplicates({
      userId: 'viewer-a',
      templateId: 'ashfang',
      triggerType: 'contact',
      triggerId: 'chat:one'
    });

    expect(first.survivor.monster_id).toBe('monster-b');
    expect(store.getMonster('monster-z').collection_state).toBe('archived');
    expect(store.getMonster('monster-a').collection_state).toBe('owned');
  });

  test('advances Stage II with one idempotent grant and rolls the whole fusion back on failure', () => {
    const { sqlite, store, collection } = createSubject({
      assetRegistry: completeAssetRegistry()
    });
    const left = createMonster(store, {
      monsterId: 'stage-two-left',
      createdAtMs: 10,
      stage: 2
    });
    const right = createMonster(store, {
      monsterId: 'stage-two-right',
      createdAtMs: 20,
      stage: 2
    });
    store.applyEvolutionGrant(left.monster_id, 2, 10);
    store.applyEvolutionGrant(right.monster_id, 2, 20);
    const applyEvolutionGrant = store.applyEvolutionGrant.bind(store);
    store.applyEvolutionGrant = () => {
      throw new Error('INJECTED_FUSION_GRANT_FAILURE');
    };

    expect(() => collection.fuseDuplicates({
      userId: 'viewer-a',
      templateId: 'ashfang',
      triggerType: 'manual',
      triggerId: 'manual:retry'
    })).toThrow('INJECTED_FUSION_GRANT_FAILURE');
    expect(store.getViewerMonsters('viewer-a')).toHaveLength(2);
    expect(sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_fusion_ledger
    `).get().count).toBe(0);

    store.applyEvolutionGrant = applyEvolutionGrant;
    const result = collection.fuseDuplicates({
      userId: 'viewer-a',
      templateId: 'ashfang',
      triggerType: 'manual',
      triggerId: 'manual:retry'
    });
    const duplicate = collection.fuseDuplicates({
      userId: 'viewer-a',
      templateId: 'ashfang',
      triggerType: 'manual',
      triggerId: 'manual:retry'
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'fused',
      fromStage: 2,
      toStage: 3,
      survivor: expect.objectContaining({
        evolution_stage: 3,
        stats: { vitality: 7, might: 11, guard: 7, agility: 9 }
      })
    }));
    expect(duplicate).toEqual(expect.objectContaining({
      status: 'already_processed',
      survivor: expect.objectContaining({
        monster_id: result.survivor.monster_id
      })
    }));
    expect(sqlite.prepare(`
      SELECT stage, COUNT(*) AS count
      FROM streammonsters_evolution_grants
      WHERE monster_id = ?
      GROUP BY stage
      ORDER BY stage
    `).all(result.survivor.monster_id)).toEqual([
      { stage: 2, count: 1 },
      { stage: 3, count: 1 }
    ]);
  });

  test('builds Prestige one donor per trigger through three without changing combat power', () => {
    const progression = { awardCollectorPoints: jest.fn() };
    const { store, collection } = createSubject({
      assetRegistry: completeAssetRegistry(),
      progression
    });
    ['a', 'b', 'c', 'd', 'e', 'f'].forEach((suffix, index) => {
      createMonster(store, {
        monsterId: `stage-three-${suffix}`,
        createdAtMs: 10 + index,
        stage: 3,
        level: suffix === 'a' ? 8 : 3,
        xp: suffix === 'a' ? 91 : 10
      });
    });
    const original = store.getMonster('stage-three-a');
    const originalPower = effectiveCombatPower(original);

    const one = collection.fuseDuplicates({
      userId: 'viewer-a',
      templateId: 'ashfang',
      triggerType: 'contact',
      triggerId: 'chat:prestige-1'
    });
    const two = collection.fuseDuplicates({
      userId: 'viewer-a',
      templateId: 'ashfang',
      triggerType: 'contact',
      triggerId: 'chat:prestige-2'
    });
    const three = collection.fuseDuplicates({
      userId: 'viewer-a',
      templateId: 'ashfang',
      triggerType: 'contact',
      triggerId: 'chat:prestige-3'
    });
    const maximum = collection.fuseDuplicates({
      userId: 'viewer-a',
      templateId: 'ashfang',
      triggerType: 'contact',
      triggerId: 'chat:prestige-4'
    });

    expect([one.prestigeAfter, two.prestigeAfter, three.prestigeAfter])
      .toEqual([1, 2, 3]);
    expect(one.survivor.monster_id).toBe('stage-three-a');
    expect(two.survivor.monster_id).toBe('stage-three-a');
    expect(three.survivor.monster_id).toBe('stage-three-a');
    expect(maximum.status).toBe('no_pair');
    expect(store.getMonster('stage-three-a')).toEqual(expect.objectContaining({
      collection_state: 'owned',
      prestige_level: 3,
      level: original.level,
      xp: original.xp,
      stats: original.stats
    }));
    expect(effectiveCombatPower(store.getMonster('stage-three-a')))
      .toBe(originalPower);
    expect(store.getViewerMonsters('viewer-a').map(row => row.monster_id))
      .toEqual(['stage-three-a', 'stage-three-e', 'stage-three-f']);
    expect(progression.awardCollectorPoints).not.toHaveBeenCalled();
  });

  test('commits and emits the hatch reveal before attempting one fusion', () => {
    const { store, collection, engine, emitted } = createLifecycle();
    createReadyEgg(store, 'egg:first-hatch', 10);
    createReadyEgg(store, 'egg:second-hatch', 20);

    const first = engine.hatchEgg('viewer-a', 1);
    const second = engine.hatchEgg('viewer-a', 1);

    expect(first.template_id).toBe('ashfang');
    expect(second.template_id).toBe('ashfang');
    expect(store.getViewerMonsters('viewer-a')).toEqual([
      expect.objectContaining({
        evolution_stage: 2,
        collection_state: 'owned'
      })
    ]);
    expect(collection.getMastery('viewer-a', 'ashfang')).toEqual(
      expect.objectContaining({ points: 10 })
    );
    expect(collection.getEssence('viewer-a', 'Ember')).toEqual(
      expect.objectContaining({ amount: 1, spent: 0 })
    );
    expect(store.getViewerMonsters('viewer-a')[0].evolution_essence_spent)
      .toBe(0);
    const secondReveal = emitted.findIndex(entry => (
      entry.event === 'streammonsters:egg_hatched' &&
      entry.payload.egg.egg_id === 'egg:second-hatch'
    ));
    const fusion = emitted.findIndex(entry => (
      entry.event === 'streammonsters:monster_evolved'
    ));
    expect(secondReveal).toBeGreaterThanOrEqual(0);
    expect(fusion).toBeGreaterThan(secondReveal);
  });

  test('keeps a successful hatch and its pair pending when the target asset is unavailable', () => {
    const assetRegistry = {
      audit: () => ({ assets: new Map() }),
      getAsset: (templateId, stage) => ({
        templateId,
        stage,
        assetVersion: 'furry-1.12.0'
      }),
      resolveVisual: ({ templateId, stage }) => stage === 1
        ? {
          imageUrl: `/plugins/streamalchemy/assets/streammonsters/furry/${templateId}.webp`,
          visualSource: 'furry',
          visualKey: `furry:${templateId}`,
          assetVersion: 'furry-1.12.0'
        }
        : null
    };
    const { sqlite, store, engine, emitted } = createLifecycle({
      assetRegistry
    });
    createReadyEgg(store, 'egg:asset-a', 10);
    createReadyEgg(store, 'egg:asset-b', 20);

    engine.hatchEgg('viewer-a', 1);
    expect(() => engine.hatchEgg('viewer-a', 1)).not.toThrow();

    expect(store.getViewerMonsters('viewer-a')).toHaveLength(2);
    expect(store.getViewerMonsters('viewer-a').map(row => row.evolution_stage))
      .toEqual([1, 1]);
    expect(sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_fusion_ledger
    `).get().count).toBe(0);
    expect(emitted.filter(entry => (
      entry.event === 'streammonsters:egg_hatched'
    ))).toHaveLength(2);
    expect(emitted.some(entry => (
      entry.event === 'streammonsters:monster_evolved'
    ))).toBe(false);
  });

  test.each([
    ['queued', (store, monster) => {
      store.enqueueBattle({
        userId: monster.user_id,
        monsterId: monster.monster_id,
        stance: 'bold',
        queuedAtMs: 40_000
      });
    }],
    ['active_match', (store, monster) => {
      store.db.prepare(`
        INSERT INTO streammonsters_matches (
          match_id, state, seed, created_at_ms, updated_at_ms
        ) VALUES ('match:blocker', 'roster', 'seed', 1, 1)
      `).run();
      store.db.prepare(`
        INSERT INTO streammonsters_match_participants (
          match_id, participant_id, viewer_id, slot,
          queued_monster_id, locked_monster_id, active
        ) VALUES ('match:blocker', 'participant:blocker', ?, 1, ?, ?, 1)
      `).run(monster.user_id, monster.monster_id, monster.monster_id);
    }],
    ['pending_stat_choice', (store, monster) => {
      store.db.prepare(`
        INSERT INTO streammonsters_stat_allocations (
          prompt_id, viewer_id, monster_id, source_key,
          deadline_ms, status, created_at_ms
        ) VALUES ('stat:blocker', ?, ?, 'source:blocker', 60000, 'open', 1)
      `).run(monster.user_id, monster.monster_id);
    }]
  ])('defers a fusion while either candidate is %s', (reason, block) => {
    const { sqlite, store, collection } = createSubject({
      assetRegistry: completeAssetRegistry()
    });
    const blocked = createMonster(store, {
      monsterId: `monster:${reason}:a`,
      createdAtMs: 10
    });
    createMonster(store, {
      monsterId: `monster:${reason}:b`,
      createdAtMs: 20
    });
    block(store, blocked);

    const result = collection.fuseDuplicates({
      userId: 'viewer-a',
      templateId: 'ashfang',
      triggerType: 'contact',
      triggerId: `chat:${reason}`
    });

    expect(result).toEqual({ status: 'blocked', reason });
    expect(store.getViewerMonsters('viewer-a')).toHaveLength(2);
    expect(sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_fusion_ledger
    `).get().count).toBe(0);
  });

  test('excludes an archived donor from stat allocation, XP targets and matchmaking', () => {
    const { store, collection } = createSubject({
      assetRegistry: completeAssetRegistry()
    });
    createMonster(store, {
      monsterId: 'archive-survivor',
      createdAtMs: 10
    });
    const donor = createMonster(store, {
      monsterId: 'archive-donor',
      createdAtMs: 20
    });
    store.selectMonster('viewer-a', donor.monster_id);
    store.db.prepare(`
      UPDATE streammonsters_monsters
      SET unspent_stat_points = 1
      WHERE monster_id = ?
    `).run(donor.monster_id);
    collection.fuseDuplicates({
      userId: 'viewer-a',
      templateId: 'ashfang',
      triggerType: 'hatch',
      triggerId: 'hatch:archive'
    });
    const before = store.getMonster(donor.monster_id);

    expect(store.applyMonsterStatPoint({
      userId: 'viewer-a',
      monsterId: donor.monster_id,
      stat: 'might'
    })).toEqual({ applied: false, reason: 'not_owned' });
    expect(store.awardMonsterXp(donor.monster_id, 100)).toBeNull();
    expect(() => store.enqueueBattle({
      userId: 'viewer-a',
      monsterId: donor.monster_id,
      stance: 'bold',
      queuedAtMs: 50_000
    })).toThrow('STREAM_MONSTER_NOT_OWNED');
    expect(store.getMonster(donor.monster_id)).toEqual(before);

    const awarded = store.awardViewerXp('viewer-a', 100, donor.monster_id);
    expect(awarded).toEqual(expect.objectContaining({
      monster_id: 'archive-survivor',
      level: 2
    }));
    expect(store.getMonster(donor.monster_id)).toEqual(before);
  });

  test('reconciles at most one historical pair per distinct stable contact', () => {
    const { sqlite, store, collection } = createSubject({
      assetRegistry: completeAssetRegistry()
    });
    ['a', 'b', 'c', 'd'].forEach((suffix, index) => {
      createMonster(store, {
        monsterId: `legacy-${suffix}`,
        createdAtMs: 10 + index
      });
    });

    const first = collection.reconcileLegacyContact(
      'viewer-a',
      'chat:tiktok:stable-one'
    );
    const duplicate = collection.reconcileLegacyContact(
      'viewer-a',
      'chat:tiktok:stable-one'
    );
    const second = collection.reconcileLegacyContact(
      'viewer-a',
      'chat:tiktok:stable-two'
    );

    expect(first.status).toBe('fused');
    expect(duplicate.status).toBe('contact_already_processed');
    expect(second.status).toBe('fused');
    expect(sqlite.prepare(`
      SELECT contact_id, result
      FROM streammonsters_fusion_contacts
      ORDER BY contact_id
    `).all()).toEqual([
      { contact_id: 'chat:tiktok:stable-one', result: 'fused' },
      { contact_id: 'chat:tiktok:stable-two', result: 'fused' }
    ]);
    expect(sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_fusion_ledger
    `).get().count).toBe(2);
  });

  test('uses !evolve only as a pair trigger and status command without mastery or essence spending', () => {
    const { store, collection } = createSubject({
      assetRegistry: completeAssetRegistry()
    });
    createMonster(store, {
      monsterId: 'manual-a',
      createdAtMs: 10
    });
    createMonster(store, {
      monsterId: 'manual-b',
      createdAtMs: 20
    });
    const commands = new ChatCommands({
      store,
      collection,
      engine: { markReadyEggs: jest.fn(), streamKey: 'stream-a' },
      battleService: {},
      progression: null,
      now: () => 50_000
    });

    const fused = commands.execute({
      userId: 'viewer-a',
      rawData: { eventId: 'manual-contact-1', provider: 'tiktok' }
    }, 'evolve', ['1']);
    const pending = commands.execute({
      userId: 'viewer-a',
      rawData: { eventId: 'manual-contact-2', provider: 'tiktok' }
    }, 'evolve', ['1']);

    expect(fused).toEqual(expect.objectContaining({
      success: true,
      status: 'fused',
      evolution: expect.objectContaining({
        fromStage: 1,
        toStage: 2
      })
    }));
    expect(pending).toEqual(expect.objectContaining({
      success: true,
      status: 'fusion_pending'
    }));
    expect(collection.getMastery('viewer-a', 'ashfang').points).toBe(0);
    expect(collection.getEssence('viewer-a', 'Ember')).toEqual(
      expect.objectContaining({ amount: 0, spent: 0 })
    );
  });

  test('projects and replays safe Prestige fusion metadata without owner or donor database IDs', () => {
    const { sqlite, store } = createStore();
    const projector = new PublicEventProjector({ store });
    const projected = projector.project('streammonsters:monster_evolved', {
      userId: 'viewer-db-id',
      donorMonsterId: 'donor-db-id',
      evolutionStage: 3,
      prestigeLevel: 2,
      prestige: {
        level: 2,
        stars: '\u2605\u2605',
        aura: 'fusion-crystal-2',
        frame: 'prestige-2',
        title: 'Fusion Nova'
      },
      fusion: {
        kind: 'prestige',
        fromStage: 3,
        toStage: 3,
        prestigeBefore: 1,
        prestigeAfter: 2,
        donorMonsterId: 'donor-db-id'
      },
      statsBefore: { vitality: 9, might: 9, guard: 9, agility: 9 },
      statsAfter: { vitality: 9, might: 9, guard: 9, agility: 9 },
      statChanges: { vitality: 0, might: 0, guard: 0, agility: 0 },
      monster: {
        monster_id: 'survivor-db-id',
        name: 'Ashfang',
        element: 'Ember',
        rarity: 'Standard',
        level: 8,
        xp: 91,
        template_id: 'ashfang',
        evolution_stage: 3,
        prestige_level: 2,
        image_url: '/plugins/streamalchemy/assets/streammonsters/furry/evolution/ember/ashfang-stage3.webp',
        stats: { vitality: 9, might: 9, guard: 9, agility: 9 }
      }
    });

    expect(projected).toEqual(expect.objectContaining({
      evolutionStage: 3,
      prestigeLevel: 2,
      prestige: {
        level: 2,
        stars: '\u2605\u2605',
        aura: 'fusion-crystal-2',
        frame: 'prestige-2',
        title: 'Fusion Nova'
      },
      fusion: {
        kind: 'prestige',
        fromStage: 3,
        toStage: 3,
        prestigeBefore: 1,
        prestigeAfter: 2
      },
      monster: expect.objectContaining({
        prestigeLevel: 2
      })
    }));
    expect(JSON.stringify(projected)).not.toContain('viewer-db-id');
    expect(JSON.stringify(projected)).not.toContain('donor-db-id');
    expect(JSON.stringify(projected)).not.toContain('survivor-db-id');

    store.appendPublicEvent({
      eventId: 'fusion-public-event',
      correlationId: 'fusion-correlation',
      streamKey: 'stream-a',
      eventType: 'streammonsters:monster_evolved',
      payload: projected,
      createdAtMs: 50_000
    });
    const reconnected = new StreamMonstersDatabase(sqlite);
    reconnected.initialize();
    expect(reconnected.getRecentPublicEvents('stream-a')).toEqual([
      expect.objectContaining({
        eventId: 'fusion-public-event',
        type: 'streammonsters:monster_evolved',
        payload: projected
      })
    ]);
  });

  test('persists and reconnect-replays Stage III plus every Prestige fusion exactly once', () => {
    const { sqlite, store } = createStore();
    const api = {
      emit: jest.fn(),
      log: jest.fn()
    };
    const plugin = new StreamAlchemyPlugin(api);
    plugin.streamMonstersStore = store;
    plugin.streamMonstersEngine = { streamKey: 'creator:fusion-live' };
    plugin.streamMonstersPublicEventProjector = new PublicEventProjector({ store });
    const fusionPayloads = [];
    const collection = new CollectionService({
      store,
      assetRegistry: completeAssetRegistry(),
      emit: (event, payload) => {
        fusionPayloads.push({ event, payload });
        plugin.emitStreamMonsters(event, payload);
      },
      now: () => 50_000
    });
    createMonster(store, {
      monsterId: 'lineage-survivor',
      createdAtMs: 1,
      stage: 2,
      level: 8,
      xp: 91
    });
    createMonster(store, {
      monsterId: 'stage-three-donor',
      createdAtMs: 2,
      stage: 2
    });

    const stageThree = collection.fuseDuplicates({
      userId: 'viewer-a',
      templateId: 'ashfang',
      triggerType: 'contact',
      triggerId: 'chat:stage-three'
    });
    ['one', 'two', 'three'].forEach((suffix, index) => {
      createMonster(store, {
        monsterId: `prestige-donor-${suffix}`,
        createdAtMs: 3 + index,
        stage: 3
      });
    });
    const prestigeOne = collection.fuseDuplicates({
      userId: 'viewer-a',
      templateId: 'ashfang',
      triggerType: 'contact',
      triggerId: 'chat:prestige-one'
    });
    const prestigeTwo = collection.fuseDuplicates({
      userId: 'viewer-a',
      templateId: 'ashfang',
      triggerType: 'contact',
      triggerId: 'chat:prestige-two'
    });
    const prestigeThree = collection.fuseDuplicates({
      userId: 'viewer-a',
      templateId: 'ashfang',
      triggerType: 'contact',
      triggerId: 'chat:prestige-three'
    });

    expect([
      stageThree.toStage,
      prestigeOne.prestigeAfter,
      prestigeTwo.prestigeAfter,
      prestigeThree.prestigeAfter
    ]).toEqual([3, 1, 2, 3]);
    expect(fusionPayloads).toHaveLength(4);
    fusionPayloads.forEach(({ event, payload }) => {
      plugin.emitStreamMonsters(event, payload);
    });

    const liveEvents = api.emit.mock.calls
      .filter(([event]) => event === 'streammonsters:monster_evolved')
      .map(([, payload]) => payload);
    expect(liveEvents).toHaveLength(4);
    expect(new Set(liveEvents.map(payload => payload.eventId)).size).toBe(4);
    expect(liveEvents.map(payload => payload.prestigeLevel)).toEqual([0, 1, 2, 3]);

    const reconnected = new StreamMonstersDatabase(sqlite);
    reconnected.initialize();
    const replay = reconnected.getRecentPublicEvents('creator:fusion-live');
    expect(replay).toHaveLength(4);
    expect(replay.map(event => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(replay.map(event => event.eventId))
      .toEqual(liveEvents.map(payload => payload.eventId));
    expect(replay.map(event => event.payload.prestigeLevel)).toEqual([0, 1, 2, 3]);
    expect(replay.map(event => event.payload.fusion.kind))
      .toEqual(['stage', 'prestige', 'prestige', 'prestige']);
  });

  test('orders fusion animation through converge, crystal, evolved asset, stats, skill and settle', () => {
    const timeline = ArenaDirector.buildArcadeTimeline(
      'streammonsters:monster_evolved',
      {
        eventId: 'fusion-animation',
        evolutionStage: 2,
        element: 'Ember',
        fusion: {
          kind: 'stage',
          fromStage: 1,
          toStage: 2,
          prestigeBefore: 0,
          prestigeAfter: 0
        },
        statsBefore: { vitality: 7, might: 7, guard: 7, agility: 7 },
        statsAfter: { vitality: 7, might: 9, guard: 7, agility: 8 },
        unlockedSkill: {
          choice: 'A',
          name: 'Flamefang II',
          nameKey: 'skillNameAshfangAStage2',
          shortText: 'Stronger flame.',
          shortTextKey: 'skillEffectAshfangAStage2',
          icon: '\ud83d\udd25',
          evolutionStage: 2
        },
        monster: {
          name: 'Ashfang',
          element: 'Ember',
          evolutionStage: 2
        }
      }
    );
    const beatTypes = timeline.beats.map(beat => beat.type);

    expect(beatTypes).toEqual([
      'fusion_copies_converge',
      'fusion_crystal',
      'fusion_evolved_asset',
      'evolution_stats',
      'evolution_skill',
      'fusion_settle'
    ]);
    expect(timeline.beats.map(beat => beat.atMs))
      .toEqual([...timeline.beats.map(beat => beat.atMs)].sort((a, b) => a - b));

    const reduced = ArenaDirector.buildArcadeTimeline(
      'streammonsters:monster_evolved',
      {
        eventId: 'fusion-animation-reduced',
        evolutionStage: 3,
        fusion: {
          kind: 'prestige',
          fromStage: 3,
          toStage: 3,
          prestigeBefore: 2,
          prestigeAfter: 3
        },
        prestige: {
          level: 3,
          stars: '\u2605\u2605\u2605',
          aura: 'fusion-crystal-3',
          frame: 'prestige-3',
          title: 'Fusion Crown'
        },
        monster: {
          name: 'Ashfang',
          element: 'Ember',
          evolutionStage: 3
        }
      },
      { reducedMotion: true }
    );
    expect(reduced.beats.map(beat => beat.type)).toEqual([
      'fusion_copies_converge',
      'fusion_crystal',
      'fusion_evolved_asset',
      'fusion_prestige_settle'
    ]);
    expect(reduced.beats.every(beat => beat.durationMs === 0)).toBe(true);
  });
});
