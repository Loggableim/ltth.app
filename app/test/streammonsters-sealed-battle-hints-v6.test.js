const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);
const BattleService = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-service'
);
const BattleMatchService = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
);
const PublicEventProjector = require(
  '../plugins/streamalchemy/backend/streammonsters/public-event-projector'
);

function createMatch(now) {
  const sqlite = new Database(':memory:');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  for (const [id, userId, element, templateId] of [
    ['alpha', 'viewer-a', 'Ember', 'ashfang'],
    ['beta', 'viewer-b', 'Tide', 'ripple']
  ]) {
    sqlite.prepare(`
      INSERT INTO streammonsters_monsters (
        monster_id, user_id, egg_id, name, element, rarity, level, xp,
        stats_json, personality, template_id, is_selected, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, 'Common', 1, 0, ?, 'Adaptive', ?, 1, 1)
    `).run(id, userId, `egg-${id}`, id, element,
      JSON.stringify({ vitality: 10, might: 10, guard: 10, agility: 10 }), templateId);
  }
  const emit = jest.fn();
  const service = new BattleMatchService({
    store,
    battleService: new BattleService({ store, now }),
    now,
    emit,
    rulesVersion: 6,
    autoStart: false
  });
  return { sqlite, store, emit, service };
}

describe('Stream Monsters Rules-v6 sealed battle decisions', () => {
  test('seals individual locks, reveals both choices once, and uses fast durable windows', () => {
    let nowMs = 1_000;
    const { emit, service } = createMatch(() => nowMs);
    service.join({ userId: 'viewer-a' });
    const reserved = service.join({ userId: 'viewer-b' });
    const matchId = reserved.match.matchId;
    const slotA = reserved.match.participants.find(entry => entry.viewerId === 'viewer-a').slot;
    const slotB = reserved.match.participants.find(entry => entry.viewerId === 'viewer-b').slot;

    expect(reserved.match).toEqual(expect.objectContaining({
      rulesVersion: 6,
      rosterDeadlineMs: 11_000
    }));
    service.lockRoster({ userId: 'viewer-a' });
    service.lockRoster({ userId: 'viewer-b' });
    expect(service.getMatch(matchId).actionDeadlineMs).toBe(7_000);

    service.submitChoice({ userId: 'viewer-a', choice: 'A', eventId: 'a-1' });
    const lock = emit.mock.calls.find(([type]) => type === 'streammonsters:battle_choice_locked');
    expect(lock[1]).toEqual(expect.objectContaining({
      matchId,
      decision: expect.objectContaining({
        slot: slotA,
        locked: true,
        source: 'viewer',
        round: 1,
        deadlineMs: 7_000
      })
    }));
    expect(JSON.stringify(lock[1])).not.toContain('"choice":"A"');

    service.submitChoice({ userId: 'viewer-b', choice: 'C', eventId: 'b-1' });
    const revealed = emit.mock.calls.find(([type]) => type === 'streammonsters:battle_choices_revealed');
    expect(revealed[1]).toEqual(expect.objectContaining({
      matchId,
      round: 1,
      choices: expect.arrayContaining([
        expect.objectContaining({ slot: slotA, choice: 'A' }),
        expect.objectContaining({ slot: slotB, choice: 'C' })
      ])
    }));
    const revealIndex = emit.mock.calls.indexOf(revealed);
    const actionIndex = emit.mock.calls.findIndex(([type]) => type === 'streammonsters:battle_skill_used');
    expect(revealIndex).toBeLessThan(actionIndex);
    expect(emit.mock.calls.filter(([type]) => type === 'streammonsters:battle_choices_revealed'))
      .toHaveLength(1);

  });

  test('keeps existing Rules-v5 replay rows normalized as v5', () => {
    let nowMs = 1_000;
    const { sqlite, service } = createMatch(() => nowMs);
    sqlite.prepare(`
      INSERT INTO streammonsters_matches (
        match_id, state, phase_version, seed, rules_version, round_number,
        created_at_ms, updated_at_ms
      ) VALUES ('legacy-v5', 'completed', 1, 'legacy-seed', 5, 0, 1, 1)
    `).run();

    expect(service.getReplay('legacy-v5')).toEqual(expect.objectContaining({
      rulesVersion: 5
    }));
  });

  test('removes a forged choice from a public Rules-v6 lock projection before reveal', () => {
    const projector = new PublicEventProjector();
    const publicLock = projector.project('streammonsters:battle_choice_locked', {
      matchId: 'match-public',
      decision: {
        slot: 2,
        locked: true,
        source: 'viewer',
        round: 3,
        deadlineMs: 6_000,
        choice: 'C'
      }
    });

    expect(publicLock).toEqual({
      matchId: 'match-public',
      decision: {
        slot: 2,
        locked: true,
        source: 'viewer',
        round: 3,
        deadlineMs: 6_000
      }
    });
  });

  test('uses a 15-second persisted standalone stat window', () => {
    let nowMs = 2_000;
    const { sqlite, service } = createMatch(() => nowMs);
    sqlite.prepare(`UPDATE streammonsters_monsters SET unspent_stat_points = 1 WHERE monster_id = 'alpha'`).run();
    const prompt = service.createStandaloneStatPrompt({
      userId: 'viewer-a',
      monsterId: 'alpha',
      sourceKey: 'v6-test'
    });
    expect(prompt.deadline_ms).toBe(17_000);
  });
});

describe('Stream Monsters overlay-only tutorial hints', () => {
  test('uses the active registered alias and its live prefix for an adopt hint', () => {
    const TutorialHintDirector = require(
      '../plugins/streamalchemy/backend/streammonsters/tutorial-hint-director'
    );
    const director = new TutorialHintDirector({
      getCommandReference: command => command === 'adopt' ? '$adoptieren' : ''
    });

    expect(director.nextHint({ eventType: 'streammonsters:free_egg_offered' }, 1_000))
      .toEqual(expect.objectContaining({
        kind: 'adopt',
        command: '$adoptieren'
      }));
  });

  test('defaults to 90 seconds, validates 60–300 seconds, suppresses critical sequences and coalesces bursts', () => {
    const TutorialHintDirector = require(
      '../plugins/streamalchemy/backend/streammonsters/tutorial-hint-director'
    );
    const director = new TutorialHintDirector({
      getCommandReference: command => `!${command}`,
      intervalSeconds: 12
    });
    expect(director.intervalMs).toBe(90_000);
    expect(director.setIntervalSeconds(59)).toBe(90);
    expect(director.setIntervalSeconds(301)).toBe(90);
    expect(director.setIntervalSeconds(120)).toBe(120);
    expect(director.nextHint({ eventType: 'streammonsters:battle_choice_opened', critical: true }, 1_000))
      .toBeNull();
    expect(director.nextHint({ eventType: 'streammonsters:egg_ready' }, 1_000))
      .toEqual(expect.objectContaining({ kind: 'hatch' }));
    expect(director.nextHint({ eventType: 'streammonsters:monster_discovered' }, 2_000))
      .toBeNull();
    expect(director.nextHint({}, 121_000)).toEqual(expect.objectContaining({
      kind: 'collection',
      command: '!monsters'
    }));
  });
});
