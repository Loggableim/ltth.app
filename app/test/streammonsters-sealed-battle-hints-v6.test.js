const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/stream-monsters/backend/streammonsters/database'
);
const BattleService = require(
  '../plugins/stream-monsters/backend/streammonsters/battle-service'
);
const BattleMatchService = require(
  '../plugins/stream-monsters/backend/streammonsters/battle-match-service'
);
const PublicEventProjector = require(
  '../plugins/stream-monsters/backend/streammonsters/public-event-projector'
);
const OverlayRuntime = require(
  '../plugins/stream-monsters/streammonsters-overlay-runtime'
);
const StreamAlchemyPlugin = require('../plugins/stream-monsters');

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
        deadlineMs: 9_000,
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

  test('synthesizes and replays one simultaneous reveal from stored pre-seal Rules-v5 lock rows', async () => {
    let nowMs = 1_000;
    const { sqlite, service } = createMatch(() => nowMs);
    sqlite.prepare(`
      INSERT INTO streammonsters_matches (
        match_id, state, phase_version, seed, rules_version, round_number,
        created_at_ms, updated_at_ms
      ) VALUES ('legacy-v5', 'completed', 1, 'legacy-seed', 5, 0, 1, 1)
    `).run();
    const insertLegacyLock = sqlite.prepare(`
      INSERT INTO streammonsters_match_events (
        match_id, sequence, event_id, event_type, payload_json,
        public_payload_json, created_at_ms
      ) VALUES ('legacy-v5', ?, ?, 'streammonsters:battle_choice_locked', ?, ?, 1)
    `);
    [
      { sequence: 1, slot: 1, choice: 'A', source: 'viewer' },
      { sequence: 2, slot: 2, choice: 'C', source: 'timeout' }
    ].forEach(decision => {
      insertLegacyLock.run(
        decision.sequence,
        `legacy-v5:event:${decision.sequence}`,
        JSON.stringify({
          matchId: 'legacy-v5',
          participantId: `private-participant-${decision.slot}`,
          viewerId: `private-viewer-${decision.slot}`,
          round: 1,
          window: 'action',
          choice: decision.choice,
          source: decision.source,
          timeout: decision.source === 'timeout'
        }),
        JSON.stringify({
          matchId: 'legacy-v5',
          decision: {
            sequence: decision.sequence,
            round: 1,
            window: 'action',
            slot: decision.slot,
            choice: decision.choice,
            source: decision.source,
            timeout: decision.source === 'timeout'
          }
        })
      );
    });

    expect(service.getReplay('legacy-v5')).toEqual(expect.objectContaining({
      rulesVersion: 5
    }));
    const firstPage = service.getPublicNormalizedReplay('legacy-v5', 0, 1);
    const secondPage = service.getPublicNormalizedReplay('legacy-v5', firstPage.cursor, 1);
    const interruptedResumePage = service.getPublicNormalizedReplay('legacy-v5', 2, 1);
    const replay = service.getPublicNormalizedReplay('legacy-v5');

    expect(firstPage.events.map(event => event.type)).toEqual([
      'streammonsters:battle_choice_locked'
    ]);
    expect(firstPage.reveals).toEqual([]);
    expect(secondPage.events.map(event => event.type)).toEqual([
      'streammonsters:battle_choice_locked',
      'streammonsters:battle_choices_revealed'
    ]);
    expect(secondPage.cursor).toBe(2.5);
    expect(secondPage.events.every(event => event.sequence > firstPage.cursor)).toBe(true);
    expect(interruptedResumePage.events.map(event => event.type)).toEqual([
      'streammonsters:battle_choices_revealed'
    ]);
    expect(interruptedResumePage.cursor).toBe(2.5);
    expect(replay.decisions).toEqual([
      expect.objectContaining({ slot: 1, locked: true }),
      expect.objectContaining({ slot: 2, locked: true })
    ]);
    expect(JSON.stringify(replay.decisions)).not.toMatch(/choice|participantId|viewerId/);
    expect(replay.reveals).toEqual([{
      matchId: 'legacy-v5',
      round: 1,
      choices: [
        { slot: 1, choice: 'A', source: 'viewer' },
        { slot: 2, choice: 'C', source: 'timeout' }
      ]
    }]);

    const interruptedRequests = [];
    const interruptedShown = [];
    let interruptReveal = true;
    const interruptedSynchronizer = OverlayRuntime.createBattleReplaySynchronizer({
      loadPage: ({ matchId, cursor, limit }) => {
        interruptedRequests.push(cursor);
        return service.getPublicNormalizedReplay(matchId, cursor, limit);
      },
      present: async event => {
        if (event.type === 'battle_choices_revealed' && interruptReveal) {
          interruptReveal = false;
          throw new Error('PRESENTER_INTERRUPTED');
        }
        interruptedShown.push(event);
      },
      pageLimit: 1
    });
    await interruptedSynchronizer.sync({
      matches: [{ matchId: 'legacy-v5', cursor: firstPage.cursor }]
    });
    await expect(interruptedSynchronizer.sync({
      matches: [{ matchId: 'legacy-v5', cursor: 2 }]
    })).rejects.toThrow('PRESENTER_INTERRUPTED');
    expect(interruptedSynchronizer.state().matches).toEqual([
      expect.objectContaining({ matchId: 'legacy-v5', cursor: 2 })
    ]);

    const interruptedResume = await interruptedSynchronizer.sync({
      matches: [{ matchId: 'legacy-v5', cursor: 2 }]
    });
    expect(interruptedRequests).toEqual([1, 2]);
    expect(interruptedShown.map(event => event.type)).toEqual([
      'battle_choice_locked',
      'battle_choices_revealed'
    ]);
    expect(interruptedShown.map(event => event.sequence)).toEqual([2, 2.5]);
    expect(interruptedResume).toEqual(expect.objectContaining({
      replayed: 1,
      caughtUp: true
    }));
    expect(interruptedSynchronizer.state().matches).toEqual([
      expect.objectContaining({ matchId: 'legacy-v5', cursor: 2.5 })
    ]);

    const shown = [];
    const synchronizer = OverlayRuntime.createBattleReplaySynchronizer({
      loadPage: ({ matchId, cursor, limit }) => (
        service.getPublicNormalizedReplay(matchId, cursor, limit)
      ),
      present: async event => shown.push(event),
      pageLimit: 1
    });
    await synchronizer.sync({
      matches: [{ matchId: 'legacy-v5', cursor: firstPage.cursor }]
    });
    const synchronized = await synchronizer.sync({
      matches: [{ matchId: 'legacy-v5', cursor: 2 }]
    });

    expect(shown.map(event => event.type)).toEqual([
      'battle_choice_locked',
      'battle_choices_revealed'
    ]);
    expect(shown[1].sequence).toBeGreaterThan(shown[0].sequence);
    expect(synchronized).toEqual(expect.objectContaining({
      replayed: 2,
      caughtUp: true
    }));

    const followUp = service.appendEvent(
      'legacy-v5',
      'streammonsters:battle_cancelled',
      { matchId: 'legacy-v5', reason: 'compatibility-check' }
    );
    const resumed = await synchronizer.sync({
      matches: [{ matchId: 'legacy-v5', cursor: followUp.sequence }]
    });

    expect(shown.map(event => event.type)).toEqual([
      'battle_choice_locked',
      'battle_choices_revealed',
      'battle_cancelled'
    ]);
    expect(shown.map(event => event.sequence)).toEqual([2, 2.5, 3]);
    expect(resumed).toEqual(expect.objectContaining({
      replayed: 1,
      caughtUp: true
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
        imageUrl: '/plugins/stream-monsters/assets/streammonsters/furry/ashfang.png',
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
              readyAtMs: 2_000,
              effects: [{
                type: 'damage',
                power: 99
              }]
            })
          ]
        })
      ]
    }));
    expect(JSON.stringify(projected)).not.toMatch(
      /participantId|requestedChoice|charge_at_choice|secretSeed|admin/
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

  test.each([
    ['one choice', [{ slot: 1, choice: 'A', source: 'viewer' }]],
    ['duplicate slots', [
      { slot: 1, choice: 'A', source: 'viewer' },
      { slot: 1, choice: 'B', source: 'timeout' }
    ]],
    ['invalid choice', [
      { slot: 1, choice: 'Z', source: 'viewer' },
      { slot: 2, choice: 'C', source: 'timeout' }
    ]]
  ])('fails closed for a public reveal with %s', (_label, choices) => {
    const projector = new PublicEventProjector();

    expect(projector.project('streammonsters:battle_choices_revealed', {
      matchId: 'match-malformed',
      round: 4,
      choices
    })).toEqual({
      matchId: 'match-malformed',
      round: 4,
      choices: []
    });
  });

  test.each([
    ['one choice', [{ slot: 1, choice: 'A', source: 'viewer' }]],
    ['duplicate slots', [
      { slot: 1, choice: 'A', source: 'viewer' },
      { slot: 1, choice: 'B', source: 'timeout' }
    ]],
    ['invalid choice', [
      { slot: 1, choice: 'Z', source: 'viewer' },
      { slot: 2, choice: 'C', source: 'timeout' }
    ]]
  ])('fails closed while normalizing a stored reveal with %s', (label, choices) => {
    const { sqlite, service } = createMatch(() => 1_000);
    const matchId = `malformed-${label.replaceAll(' ', '-')}`;
    sqlite.prepare(`
      INSERT INTO streammonsters_matches (
        match_id, state, phase_version, seed, rules_version, round_number,
        created_at_ms, updated_at_ms
      ) VALUES (?, 'completed', 1, 'malformed-seed', 6, 1, 1, 1)
    `).run(matchId);
    const payload = { matchId, round: 1, choices };
    sqlite.prepare(`
      INSERT INTO streammonsters_match_events (
        match_id, sequence, event_id, event_type, payload_json,
        public_payload_json, created_at_ms
      ) VALUES (?, 1, ?, 'streammonsters:battle_choices_revealed', ?, ?, 1)
    `).run(
      matchId,
      `${matchId}:event:1`,
      JSON.stringify(payload),
      JSON.stringify(payload)
    );

    expect(service.getPublicNormalizedReplay(matchId).reveals).toEqual([{
      matchId,
      round: 1,
      choices: []
    }]);
  });

  test('drops stored skills when a replay fighter slot is unknown', () => {
    const { sqlite, service } = createMatch(() => 1_000, 7);
    service.join({ userId: 'viewer-a' });
    const reserved = service.join({ userId: 'viewer-b' });
    service.lockRoster({ userId: 'viewer-a' });
    service.lockRoster({ userId: 'viewer-b' });
    const row = sqlite.prepare(`
      SELECT sequence, public_payload_json
      FROM streammonsters_match_events
      WHERE match_id = ? AND event_type = 'streammonsters:battle_choice_opened'
    `).get(reserved.match.matchId);
    const payload = JSON.parse(row.public_payload_json);
    payload.fighters[0].slot = 3;
    payload.fighters[0].skills = [{
      choice: 'A',
      icon: '!',
      name: 'Forged',
      nameKey: 'forgedName',
      shortText: 'Forged',
      shortTextKey: 'forgedText',
      available: true
    }];
    sqlite.prepare(`
      UPDATE streammonsters_match_events
      SET public_payload_json = ?
      WHERE match_id = ? AND sequence = ?
    `).run(JSON.stringify(payload), reserved.match.matchId, row.sequence);

    const replayed = service.getPublicNormalizedReplay(reserved.match.matchId)
      .events.find(event => event.sequence === row.sequence);
    expect(replayed.payload.fighters.find(fighter => fighter.slot === 3))
      .not.toHaveProperty('skills');
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
      '../plugins/stream-monsters/backend/streammonsters/tutorial-hint-director'
    );
    const director = new TutorialHintDirector({
      getCommandReference: command => command === 'adopt' ? '$adoptieren' : ''
    });

    expect(director.nextHint({ eventType: 'streammonsters:free_egg_offered' }, 1_000))
      .toEqual(expect.objectContaining({
        kind: 'adopt',
        label: 'NEXT',
        command: '$adoptieren',
        commands: ['$adoptieren']
      }));
  });

  test('emits one contextual NEXT card with at most two live command references', () => {
    const TutorialHintDirector = require(
      '../plugins/stream-monsters/backend/streammonsters/tutorial-hint-director'
    );
    const director = new TutorialHintDirector({
      getCommandReference: command => ({
        hatch: '/schlupf',
        eggs: '/eier',
        battle: ''
      })[command] || ''
    });

    const hint = director.nextHint({
      eventType: 'streammonsters:egg_ready'
    }, 1_000);

    expect(hint).toEqual(expect.objectContaining({
      kind: 'hatch',
      label: 'NEXT',
      commands: ['/schlupf']
    }));
    expect(hint.commands).toHaveLength(1);
    expect(new Set(hint.commands).size).toBe(hint.commands.length);
    expect(hint.commands.length).toBeLessThanOrEqual(2);
    expect(director.nextHint({}, 1_001)).toBeNull();
  });

  test.each([
    ['streammonsters:battle_choice_opened', 'skills', 'A / B / C'],
    ['streammonsters:stat_choice_opened', 'stats', '1 / 2 / 3 / 4']
  ])('uses only raw valid responses for %s NEXT actions', (eventType, kind, action) => {
    const TutorialHintDirector = require(
      '../plugins/stream-monsters/backend/streammonsters/tutorial-hint-director'
    );
    const resolvedCommands = [];
    const director = new TutorialHintDirector({
      getCommandReference: command => {
        resolvedCommands.push(command);
        return `!${command}`;
      }
    });

    const hint = director.nextHint({ eventType }, 1_000);

    expect(hint).toEqual(expect.objectContaining({
      kind,
      label: 'NEXT',
      command: action,
      commands: [action],
      params: { command: action }
    }));
    expect(hint.commands.length).toBeLessThanOrEqual(2);
    expect(resolvedCommands).toEqual([]);
  });

  test('defaults to 90 seconds, validates 60–300 seconds, suppresses critical sequences and coalesces bursts', () => {
    const TutorialHintDirector = require(
      '../plugins/stream-monsters/backend/streammonsters/tutorial-hint-director'
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
      '../plugins/stream-monsters/backend/streammonsters/tutorial-hint-director'
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
