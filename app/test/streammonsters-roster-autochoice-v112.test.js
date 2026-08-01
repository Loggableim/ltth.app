'use strict';

const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/stream-monsters/backend/streammonsters/database'
);
const BattleMatchService = require(
  '../plugins/stream-monsters/backend/streammonsters/battle-match-service'
);

function insertMonster(sqlite, id, userId, {
  level = 1,
  selected = false,
  element = 'Ember',
  templateId = 'ashfang',
  createdAtMs = 1
} = {}) {
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
    createdAtMs
  );
}

function timeoutAutoChoice({ invalidSelected = false } = {}) {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  insertMonster(sqlite, 'queued-a', 'viewer-a', { selected: true, createdAtMs: 1 });
  insertMonster(sqlite, 'other-a', 'viewer-a', { createdAtMs: 2 });
  insertMonster(sqlite, 'invalid-a', 'viewer-a', { level: 99, createdAtMs: 3 });
  insertMonster(sqlite, 'queued-b', 'viewer-b', {
    selected: true,
    element: 'Tide',
    templateId: 'ripple',
    createdAtMs: 4
  });
  let nowMs = 1_000;
  const service = new BattleMatchService({
    store,
    now: () => nowMs,
    rulesVersion: 8,
    autoStart: false
  });
  service.join({ userId: 'viewer-a' });
  const reserved = service.join({ userId: 'viewer-b' });
  const matchId = reserved.match.matchId;
  const viewerASlot = service.getMatch(matchId).participants
    .find(participant => participant.viewerId === 'viewer-a').slot;
  if (invalidSelected) store.selectMonster('viewer-a', 'invalid-a');
  nowMs = reserved.match.rosterDeadlineMs + 1;
  expect(service.recoverRosterMatch(matchId, nowMs)).toBe(true);
  const replay = service.getPublicNormalizedReplay(matchId);
  const event = replay.events.find(entry => (
    entry.type === 'streammonsters:battle_roster_locked' &&
    entry.payload.slot === viewerASlot
  ));
  return { sqlite, service, event };
}

describe('Stream Monsters 1.12 visible roster auto-choice reasons', () => {
  test.each([
    [false, 'selected_valid_at_timeout'],
    [true, 'queued_fallback_at_timeout']
  ])('publishes %s => %s', (invalidSelected, expectedReason) => {
    const { sqlite, service, event } = timeoutAutoChoice({ invalidSelected });
    expect(event?.payload).toEqual(expect.objectContaining({
      selectionSource: 'timeout',
      autoChoice: expectedReason
    }));
    service.destroy();
    sqlite.close();
  });
});
