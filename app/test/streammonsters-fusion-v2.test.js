const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);

function createStore() {
  const sqlite = new Database(':memory:');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  return { sqlite, store };
}

function createMonster(store, {
  userId = 'viewer-a',
  monsterId,
  templateId = 'ashfang',
  element = 'Ember',
  createdAtMs = 1
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
  return store.createMonsterFromEgg(egg, {
    monsterId,
    templateId,
    name: monsterId,
    rarity: 'Standard',
    personality: 'Curious',
    stats: { vitality: 7, might: 7, guard: 7, agility: 7 },
    imageUrl: `/plugins/streamalchemy/assets/streammonsters/furry/${templateId}.webp`,
    visualSource: 'furry',
    visualKey: `furry:${templateId}`,
    assetVersion: 'furry-1.12.0',
    createdAtMs
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
});
