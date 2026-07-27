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
const StreamAlchemyPlugin = require('../plugins/streamalchemy');

function createMatch(now, rulesVersion = 6) {
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
    rulesVersion,
    autoStart: false
  });
  return { sqlite, store, emit, service };
}

describe('Stream Monsters Rules-v6 sealed battle decisions', () => {
  test('publishes a Rules-v7 passive charge window without revealing sealed choices', () => {
    let nowMs = 1_000;
    const { emit, service } = createMatch(() => nowMs, 7);
    service.join({ userId: 'viewer-a' });
    const reserved = service.join({ userId: 'viewer-b' });
    service.lockRoster({ userId: 'viewer-a' });
    service.lockRoster({ userId: 'viewer-b' });

    const opened = emit.mock.calls.find(([type]) => type === 'streammonsters:battle_choice_opened');
    expect(opened[1]).toEqual(expect.objectContaining({
      matchId: reserved.match.matchId,
      chargeWindow: {
        openedAtMs: 1_000,
        deadlineMs: 7_000,
        passivePerSecond: 5
      },
      fighters: expect.arrayContaining([
        expect.objectContaining({
          skills: expect.arrayContaining([
            expect.objectContaining({
              choice: 'A',
              icon: expect.any(String),
              nameKey: expect.any(String),
              shortTextKey: expect.any(String),
              available: true
            }),
            expect.objectContaining({
              choice: 'C',
              chargeRequired: 100,
              readyAtMs: expect.any(Number)
            })
          ])
        })
      ])
    }));
    expect(JSON.stringify(opened[1])).not.toMatch(
      /participantId|viewerId|providerEventId|requestedChoice|charge_at_choice/
    );
    service.submitChoice({ userId: 'viewer-a', choice: 'A', eventId: 'v7-sealed-a' });
    const locked = emit.mock.calls.find(([type]) => type === 'streammonsters:battle_choice_locked');
    expect(JSON.stringify(locked[1])).not.toContain('"choice":"A"');
  });

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
      choices: [
        { slot: slotA, choice: 'A', source: 'viewer' },
        { slot: slotB, choice: 'C', source: 'viewer' }
      ].sort((left, right) => left.slot - right.slot)
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

  test('seals Rules-v5 service locks and reveals both choices together', () => {
    const { emit, service } = createMatch(() => 1_000, 5);
    service.join({ userId: 'viewer-a' });
    service.join({ userId: 'viewer-b' });
    service.lockRoster({ userId: 'viewer-a' });
    service.lockRoster({ userId: 'viewer-b' });

    service.submitChoice({ userId: 'viewer-a', choice: 'A', eventId: 'v5-sealed-a' });
    const lock = emit.mock.calls.find(([type]) => type === 'streammonsters:battle_choice_locked');
    expect(lock[1].decision).toEqual(expect.objectContaining({
      locked: true,
      source: 'viewer'
    }));
    expect(lock[1].decision).not.toHaveProperty('choice');

    service.submitChoice({ userId: 'viewer-b', choice: 'B', eventId: 'v5-sealed-b' });
    expect(emit.mock.calls.find(([type]) => (
      type === 'streammonsters:battle_choices_revealed'
    ))?.[1].choices).toEqual(expect.arrayContaining([
      expect.objectContaining({ choice: 'A' }),
      expect.objectContaining({ choice: 'B' })
    ]));
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

  test('allowlists choice-open skill presentation in the generic public projector', () => {
    const projector = new PublicEventProjector();
    const projected = projector.project('streammonsters:battle_choice_opened', {
      matchId: 'match-public-skills',
      participantId: 'private-participant',
      requestedChoice: 'C',
      charge_at_choice: 95,
      round: 2,
      deadlineMs: 7_000,
      chargeWindow: {
        openedAtMs: 1_000,
        deadlineMs: 7_000,
        passivePerSecond: 5
      },
      fighters: [{
        slot: 1,
        locked: true,
        name: 'Ashfang',
        element: 'Ember',
        templateId: 'ashfang',
        evolutionStage: 1,
        imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png',
        level: 1,
        hp: 62,
        maxHp: 62,
        shield: 0,
        charge: 95,
        skills: [{
          choice: 'C',
          icon: '☄️',
          name: 'Ashfang: Inferno Heart',
          nameKey: 'skillNameAshfangCStage1',
          shortText: 'A charged blaze.',
          shortTextKey: 'skillEffectAshfangCStage1',
          available: false,
          chargeRequired: 100,
          readyAtMs: 2_000,
          effects: [{ type: 'damage', power: 99 }],
          requestedChoice: 'C'
        }]
      }]
    });

    expect(projected).toEqual(expect.objectContaining({
      chargeWindow: {
        openedAtMs: 1_000,
        deadlineMs: 7_000,
        passivePerSecond: 5
      },
      fighters: [
        expect.objectContaining({
          skills: [
            expect.objectContaining({
              choice: 'C',
              nameKey: 'skillNameAshfangCStage1',
              shortTextKey: 'skillEffectAshfangCStage1',
              chargeRequired: 100,
              readyAtMs: 2_000
            })
          ]
        })
      ]
    }));
    expect(JSON.stringify(projected)).not.toMatch(
      /participantId|requestedChoice|charge_at_choice|effects|power/
    );
  });

  test('removes a selected choice from every live lock projection before reveal', () => {
    const projector = new PublicEventProjector();
    expect(projector.project('streammonsters:battle_choice_locked', {
      matchId: 'match-v5',
      decision: {
        sequence: 4,
        round: 1,
        window: 'action',
        slot: 2,
        choice: 'B',
        source: 'viewer',
        timeout: false
      }
    })).toEqual({
      matchId: 'match-v5',
      decision: {
        slot: 2,
        locked: true,
        source: 'viewer',
        round: 1,
        deadlineMs: 0
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
    expect(director.nextHint({ eventType: 'streammonsters:egg_ready', critical: true }, 1_000))
      .toBeNull();
    expect(director.nextHint({}, 1_001))
      .toEqual(expect.objectContaining({ kind: 'hatch' }));
    expect(director.nextHint({ eventType: 'streammonsters:monster_discovered' }, 2_000))
      .toBeNull();
    expect(director.nextHint({}, 121_001)).toEqual(expect.objectContaining({
      kind: 'collection',
      command: '!monsters'
    }));
  });

  test('flushes the newest all-critical hint after its configured deferral and clears it on shutdown', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-27T12:00:00.000Z'));
    const emitted = [];
    const plugin = new StreamAlchemyPlugin({
      log: jest.fn(),
      emit: (event, payload) => emitted.push({ event, payload })
    });
    const TutorialHintDirector = require(
      '../plugins/streamalchemy/backend/streammonsters/tutorial-hint-director'
    );
    plugin.config = {
      streamMonsters: {
        tutorialHintIntervalSeconds: 90,
        notificationDurationMs: 8_000
      }
    };
    plugin.streamMonstersTutorialHintDirector = new TutorialHintDirector({
      getCommandReference: command => `!${command}`
    });

    plugin.emitStreamMonstersTutorialHint('streammonsters:egg_ready', true);
    plugin.emitStreamMonstersTutorialHint('streammonsters:egg_hatched', true);
    expect(emitted).toEqual([]);
    jest.advanceTimersByTime(7_999);
    expect(emitted).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(emitted).toEqual([{
      event: 'streammonsters:tutorial_hint',
      payload: expect.objectContaining({ kind: 'monster', command: '!monster' })
    }]);

    plugin.emitStreamMonstersTutorialHint('streammonsters:egg_ready', true);
    await plugin.destroy();
    jest.advanceTimersByTime(8_000);
    expect(emitted).toHaveLength(1);
    jest.useRealTimers();
  });
});
