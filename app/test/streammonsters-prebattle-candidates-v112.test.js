'use strict';

const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/stream-monsters/backend/streammonsters/database'
);
const BattleMatchService = require(
  '../plugins/stream-monsters/backend/streammonsters/battle-match-service'
);

function insertMonster(sqlite, {
  id,
  userId,
  name,
  templateId,
  element,
  level = 1,
  selected = false,
  createdAtMs
}) {
  sqlite.prepare(`
    INSERT INTO streammonsters_monsters (
      monster_id, user_id, egg_id, name, element, rarity, level, xp,
      stats_json, personality, template_id, evolution_stage, is_selected,
      unspent_stat_points, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, 'Common', ?, 0, ?, 'Adaptive', ?, 1, ?, 0, ?)
  `).run(
    id,
    userId,
    `egg-${id}`,
    name,
    element,
    level,
    JSON.stringify({ vitality: 10, might: 10, guard: 10, agility: 10 }),
    templateId,
    selected ? 1 : 0,
    createdAtMs
  );
}

describe('Stream Monsters 1.12 prebattle candidate contract', () => {
  test('publishes every collection slot with localized eligibility metadata', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    const store = new StreamMonstersDatabase(sqlite);
    store.initialize();
    insertMonster(sqlite, {
      id: 'alpha',
      userId: 'private-viewer-a',
      name: 'Ashfang',
      templateId: 'ashfang',
      element: 'Ember',
      selected: true,
      createdAtMs: 1
    });
    insertMonster(sqlite, {
      id: 'cinder',
      userId: 'private-viewer-a',
      name: 'Cinderfox',
      templateId: 'cinder',
      element: 'Ember',
      createdAtMs: 2
    });
    insertMonster(sqlite, {
      id: 'overlevelled',
      userId: 'private-viewer-a',
      name: 'Pyrra',
      templateId: 'pyrra',
      element: 'Ember',
      level: 99,
      createdAtMs: 3
    });
    insertMonster(sqlite, {
      id: 'ripple',
      userId: 'private-viewer-b',
      name: 'Ripple',
      templateId: 'ripple',
      element: 'Tide',
      selected: true,
      createdAtMs: 4
    });
    const service = new BattleMatchService({
      store,
      now: () => 1_000,
      rulesVersion: 8,
      autoStart: false
    });

    service.join({ userId: 'private-viewer-a' });
    const reserved = service.join({ userId: 'private-viewer-b' });
    const event = service.getReplay(reserved.match.matchId).events.find(entry => (
      entry.type === 'streammonsters:battle_match_found'
    ));
    const candidateFighter = event.payload.fighters.find(fighter => (
      fighter.candidates.length === 3
    ));

    expect(candidateFighter.candidates).toEqual([
      expect.objectContaining({
        collectionSlot: 1,
        name: 'Ashfang',
        species: 'Wolf',
        speciesKey: 'speciesWolf',
        role: 'striker',
        roleEpithetKey: 'roleEpithetAshfang',
        element: 'Ember',
        level: 1,
        combatPower: expect.any(Number),
        eligibility: expect.objectContaining({
          eligible: true,
          reason: null
        })
      }),
      expect.objectContaining({
        collectionSlot: 2,
        name: 'Cinderfox',
        species: 'Fox',
        element: 'Ember',
        eligibility: expect.objectContaining({ eligible: true })
      }),
      expect.objectContaining({
        collectionSlot: 3,
        name: 'Pyrra',
        species: 'Red Panda',
        level: 99,
        eligibility: {
          eligible: false,
          reason: 'monster_out_of_match_range',
          reasonKey: 'arenaRosterIneligibleLevel'
        }
      })
    ]);
    expect(JSON.stringify(event.payload)).not.toMatch(
      /private-viewer|monster_id|user_id/
    );

    service.destroy();
    sqlite.close();
  });
});
