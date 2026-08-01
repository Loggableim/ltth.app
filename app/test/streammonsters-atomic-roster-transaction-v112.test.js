'use strict';

const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);
const BattleMatchService = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
);

function insertMonster(sqlite, {
  id,
  userId,
  level = 1,
  selected = false,
  element = 'Ember',
  templateId = 'ashfang'
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
    id,
    element,
    level,
    JSON.stringify({ vitality: 10, might: 10, guard: 10, agility: 10 }),
    templateId,
    selected ? 1 : 0,
    level
  );
}

describe('Stream Monsters 1.12 roster/global-selection transaction', () => {
  test('rolls back both projections on rejection and commits both on acceptance', () => {
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    const store = new StreamMonstersDatabase(sqlite);
    store.initialize();
    insertMonster(sqlite, {
      id: 'viewer-a-selected',
      userId: 'viewer-a',
      selected: true
    });
    insertMonster(sqlite, {
      id: 'viewer-a-eligible',
      userId: 'viewer-a'
    });
    insertMonster(sqlite, {
      id: 'viewer-a-ineligible',
      userId: 'viewer-a',
      level: 99
    });
    insertMonster(sqlite, {
      id: 'viewer-b-selected',
      userId: 'viewer-b',
      selected: true,
      element: 'Tide',
      templateId: 'ripple'
    });
    const service = new BattleMatchService({
      store,
      now: () => 1_000,
      rulesVersion: 8,
      autoStart: false
    });

    service.join({ userId: 'viewer-a' });
    const reserved = service.join({ userId: 'viewer-b' });
    expect(reserved.status).toBe('reserved');
    const viewerAParticipant = () => service.getMatch(reserved.match.matchId)
      .participants.find(participant => participant.viewerId === 'viewer-a');
    const viewerASlot = viewerAParticipant().slot;

    const rejected = service.lockRoster({
      userId: 'viewer-a',
      monsterId: 'viewer-a-ineligible',
      selectGlobally: true,
      requestedChoice: 3
    });
    expect(rejected).toEqual(expect.objectContaining({
      accepted: false,
      reason: 'monster_out_of_match_range',
      slot: viewerASlot,
      requestedChoice: 3
    }));
    expect(store.getSelectedMonster('viewer-a').monster_id)
      .toBe('viewer-a-selected');
    expect(viewerAParticipant().lockedMonsterId)
      .toBeNull();

    const accepted = service.lockRoster({
      userId: 'viewer-a',
      monsterId: 'viewer-a-eligible',
      selectGlobally: true,
      requestedChoice: 2
    });
    expect(accepted).toEqual(expect.objectContaining({
      accepted: true,
      slot: viewerASlot,
      requestedChoice: 2,
      selected: expect.objectContaining({
        monster_id: 'viewer-a-eligible'
      })
    }));
    expect(store.getSelectedMonster('viewer-a').monster_id)
      .toBe('viewer-a-eligible');
    expect(viewerAParticipant().lockedMonsterId)
      .toBe('viewer-a-eligible');

    service.destroy();
    sqlite.close();
  });
});
