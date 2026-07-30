const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);
const CollectionService = require(
  '../plugins/streamalchemy/backend/streammonsters/collection-service'
);
const { effectiveCombatPower } = require(
  '../plugins/streamalchemy/backend/streammonsters/evolution-rules'
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

function completeAssetRegistry() {
  return {
    audit: () => ({ assets: new Map() }),
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
    ['a', 'b', 'c', 'd', 'e'].forEach((suffix, index) => {
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
      .toEqual(['stage-three-a', 'stage-three-e']);
    expect(progression.awardCollectorPoints).not.toHaveBeenCalled();
  });
});
