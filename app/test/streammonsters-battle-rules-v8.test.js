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
const {
  PASSIVE_CHARGE_PER_SECOND,
  MAX_PASSIVE_CHARGE_PER_ROUND,
  projectPassiveCharge
} = require('../plugins/streamalchemy/backend/streammonsters/battle-charge');
const {
  applyArenaCollapse
} = require('../plugins/streamalchemy/backend/streammonsters/battle-rules-v8');
const ArenaDirector = require(
  '../plugins/streamalchemy/streammonsters-arena-director'
);
const OverlayRuntime = require(
  '../plugins/streamalchemy/streammonsters-overlay-runtime'
);
const PublicEventProjector = require(
  '../plugins/streamalchemy/backend/streammonsters/public-event-projector'
);
const ChatCommands = require(
  '../plugins/streamalchemy/backend/streammonsters/chat-commands'
);
const {
  resolveInteractiveRound
} = require('../plugins/streamalchemy/backend/streammonsters/battle-rules-v5');

function createStore() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  return { sqlite, store };
}

function insertMonster(sqlite, {
  id,
  userId,
  name = id,
  element = 'Ember',
  templateId = 'ashfang',
  level = 1,
  unspent = 0
}) {
  sqlite.prepare(`
    INSERT INTO streammonsters_monsters (
      monster_id, user_id, egg_id, name, element, rarity, level, xp,
      stats_json, personality, template_id, evolution_stage, is_selected,
      unspent_stat_points, created_at_ms
    ) VALUES (?, ?, ?, ?, ?, 'Common', ?, 0, ?, 'Adaptive', ?, 1, 1, ?, 1)
  `).run(
    id,
    userId,
    `egg-${id}`,
    name,
    element,
    level,
    JSON.stringify({ vitality: 10, might: 10, guard: 10, agility: 10 }),
    templateId,
    unspent
  );
}

function createService({
  store,
  emit = jest.fn(),
  now = () => 1_000,
  localeCount = 1,
  secondsPerLocale = 6
}) {
  return new BattleMatchService({
    store,
    battleService: new BattleService({ store, now }),
    emit,
    now,
    rulesVersion: 8,
    localeCount,
    secondsPerLocale,
    autoStart: false
  });
}

function createLockedMatch(options = {}) {
  const { sqlite, store } = createStore();
  const emit = jest.fn();
  let nowMs = 1_000;
  insertMonster(sqlite, {
    id: 'alpha-v8',
    userId: 'viewer-a',
    name: 'Ashfang'
  });
  insertMonster(sqlite, {
    id: 'beta-v8',
    userId: 'viewer-b',
    name: 'Ripple',
    element: 'Tide',
    templateId: 'ripple'
  });
  const service = createService({
    store,
    emit,
    now: () => nowMs,
    ...options
  });
  service.join({ userId: 'viewer-a' });
  const joined = service.join({ userId: 'viewer-b' });
  service.lockRoster({ userId: 'viewer-a' });
  service.lockRoster({ userId: 'viewer-b' });
  return {
    sqlite,
    store,
    emit,
    service,
    matchId: joined.match.matchId,
    setNow: value => { nowMs = value; }
  };
}

function submitRound(service, round) {
  expect(service.submitChoice({
    userId: 'viewer-a',
    choice: 'A',
    eventId: `a-${round}`
  })).toEqual(expect.objectContaining({ handled: true, waiting: true }));
  return service.submitChoice({
    userId: 'viewer-b',
    choice: 'B',
    eventId: `b-${round}`
  });
}

describe('Stream Monsters Rules v8 combat contract', () => {
  test('shares one exact Rules-v8 pacing contract across service and overlay timelines', () => {
    const { store } = createStore();
    const service = createService({ store });
    const expected = {
      ROSTER_MS: 6_000,
      SKILL_CHOICE_MS: 6_000,
      STAT_CHOICE_MS: 10_000,
      LOCK_FLASH_MS: 150,
      JOINT_REVEAL_MS: 300,
      ACTION_MS: 900,
      COLLAPSE_MS: 600,
      TERMINAL_ACTION_MS: 1_400,
      RESULT_BOARD_MS: 8_000,
      CANCELLATION_MS: 1_500,
      SERVICE_SWEEP_MS: 250
    };

    expect(ArenaDirector.RULES_V8_PACING).toEqual(expected);
    expect(OverlayRuntime.RULES_V8_PACING).toBe(ArenaDirector.RULES_V8_PACING);
    expect(service.rulesV8Pacing).toBe(ArenaDirector.RULES_V8_PACING);
    expect(service.sweepIntervalMs).toBe(expected.SERVICE_SWEEP_MS);
  });

  test('uses fixed six-second v8 roster and action windows in every language mode', () => {
    const { store } = createStore();
    const singleLocale = createService({ store });
    const bilingual = createService({
      store,
      localeCount: 2,
      secondsPerLocale: 5
    });

    expect(singleLocale.rulesVersion).toBe(8);
    expect(singleLocale.rosterWindowMs({ rulesVersion: 8 })).toBe(6_000);
    expect(singleLocale.actionWindowMs({ rulesVersion: 8 })).toBe(6_000);
    expect(singleLocale.statWindowMs({ rulesVersion: 8 })).toBe(10_000);
    expect(bilingual.actionWindowMs({ rulesVersion: 8 })).toBe(6_000);
  });

  test('keeps a representative four-round fight inside the 35-45 second target', () => {
    const pacing = ArenaDirector.RULES_V8_PACING;
    const representativeDurationMs =
      pacing.ROSTER_MS +
      (4 * pacing.SKILL_CHOICE_MS) +
      (3 * (pacing.JOINT_REVEAL_MS + (2 * pacing.ACTION_MS))) +
      pacing.JOINT_REVEAL_MS +
      pacing.TERMINAL_ACTION_MS +
      pacing.COLLAPSE_MS;

    expect(representativeDurationMs).toBe(38_600);
    expect(representativeDurationMs).toBeGreaterThanOrEqual(35_000);
    expect(representativeDurationMs).toBeLessThanOrEqual(45_000);
  });

  test('fits both locale pages inside the authoritative six-second choice deadline', () => {
    const config = OverlayRuntime.normalizeOverlayLanguage({
      primaryLocale: 'de',
      locales: ['de', 'en'],
      secondsPerLocale: 5
    });

    expect(OverlayRuntime.criticalLocalePages(config, {
      nowMs: 1_000,
      deadlineMs: 7_000
    })).toEqual([
      { locale: 'de', durationMs: 3_000 },
      { locale: 'en', durationMs: 3_000 }
    ]);
  });

  test('fits eight timeout-heavy rounds inside the 75-second pace budget', () => {
    const action = {
      rulesVersion: 8,
      actorSlot: 1,
      targetSlot: 2,
      choice: 'A',
      skill: { type: 'attack', element: 'Ember' },
      hits: [{ index: 1, hpDamage: 4, shieldAbsorbed: 1, evaded: false }],
      outcomes: [],
      terminal: false
    };
    const actionDurationMs = ArenaDirector.buildArcadeTimeline(
      'battle_skill_used',
      { action }
    ).durationMs;
    const timeoutHeavyEightRoundsMs = 6_000 +
      (8 * 6_000) +
      (7 * 2 * actionDurationMs);

    expect(PASSIVE_CHARGE_PER_SECOND).toBe(5);
    expect(MAX_PASSIVE_CHARGE_PER_ROUND).toBe(30);
    expect(actionDurationMs * 2).toBeLessThanOrEqual(3_200);
    expect(timeoutHeavyEightRoundsMs).toBeLessThanOrEqual(75_000);
  });

  test('resolves two early sealed choices immediately with the director-derived pause', () => {
    const { service, matchId } = createLockedMatch();
    const actions = [
      {
        actorId: 'alpha-v8',
        targetId: 'beta-v8',
        round: 1,
        choice: 'A',
        skill: { type: 'attack', element: 'Ember' },
        hits: [{ index: 1, hpDamage: 4, shieldAbsorbed: 0, evaded: false }],
        outcomes: [],
        actorState: { hp: 30, maxHp: 30, shield: 0, charge: 25 },
        targetState: { hp: 26, maxHp: 30, shield: 0, charge: 0 },
        terminal: false
      },
      {
        actorId: 'beta-v8',
        targetId: 'alpha-v8',
        round: 1,
        choice: 'A',
        skill: { type: 'attack', element: 'Tide' },
        hits: [{ index: 1, hpDamage: 3, shieldAbsorbed: 0, evaded: false }],
        outcomes: [],
        actorState: { hp: 26, maxHp: 30, shield: 0, charge: 25 },
        targetState: { hp: 27, maxHp: 30, shield: 0, charge: 25 },
        terminal: false
      }
    ];
    service.battleService.resolveInteractiveRound = jest.fn(() => ({
      terminal: false,
      winnerId: null,
      state: {
        'alpha-v8': actions[1].targetState,
        'beta-v8': actions[1].actorState
      },
      actions
    }));

    expect(service.submitChoice({
      userId: 'viewer-a',
      choice: 'A',
      eventId: 'early-a'
    })).toEqual(expect.objectContaining({ waiting: true }));
    const resolved = service.submitChoice({
      userId: 'viewer-b',
      choice: 'A',
      eventId: 'early-b'
    });
    const match = service.getMatch(matchId);
    const directorPauseMs = 300 + actions.reduce((total, action) => (
      total + ArenaDirector.buildArcadeTimeline(
        'battle_skill_used',
        { action: { ...action, rulesVersion: 8 } }
      ).durationMs
    ), 0);

    expect(resolved).toEqual(expect.objectContaining({ waiting: false }));
    expect(match.actionDeadlineMs).toBeNull();
    expect(match.chargePauseReason).toBe('cinematic');
    expect(match.chargePauseUntilMs - match.chargePauseStartedAtMs)
      .toBe(directorPauseMs);
    expect(directorPauseMs).toBeLessThanOrEqual(3_200);
  });

  test('opens the next choice deadline only after reveal actions and Collapse finish', () => {
    const { sqlite, service, matchId } = createLockedMatch();
    sqlite.prepare(`
      UPDATE streammonsters_matches SET round_number = 4 WHERE match_id = ?
    `).run(matchId);
    const actions = [
      {
        actorId: 'alpha-v8',
        targetId: 'beta-v8',
        round: 4,
        choice: 'A',
        skill: { type: 'attack', element: 'Ember' },
        hits: [{ index: 1, hpDamage: 4, shieldAbsorbed: 0, evaded: false }],
        outcomes: [],
        actorState: { hp: 30, maxHp: 30, shield: 0, charge: 25 },
        targetState: { hp: 26, maxHp: 30, shield: 0, charge: 0 },
        terminal: false
      },
      {
        actorId: 'beta-v8',
        targetId: 'alpha-v8',
        round: 4,
        choice: 'A',
        skill: { type: 'attack', element: 'Tide' },
        hits: [{ index: 1, hpDamage: 3, shieldAbsorbed: 0, evaded: false }],
        outcomes: [],
        actorState: { hp: 26, maxHp: 30, shield: 0, charge: 25 },
        targetState: { hp: 27, maxHp: 30, shield: 0, charge: 25 },
        terminal: false
      }
    ];
    service.battleService.resolveInteractiveRound = jest.fn(() => ({
      terminal: false,
      winnerId: null,
      state: {
        'alpha-v8': actions[1].targetState,
        'beta-v8': actions[1].actorState
      },
      actions
    }));

    service.submitChoice({
      userId: 'viewer-a',
      choice: 'A',
      eventId: 'paced-round-a'
    });
    service.submitChoice({
      userId: 'viewer-b',
      choice: 'A',
      eventId: 'paced-round-b'
    });

    const paced = service.getMatch(matchId);
    const expectedVisualMs = 300 + (2 * 900) + 600;
    expect(paced.actionDeadlineMs).toBeNull();
    expect(paced.chargePauseReason).toBe('cinematic');
    expect(paced.chargePauseUntilMs - paced.chargePauseStartedAtMs)
      .toBe(expectedVisualMs);
    expect(service.resumeCinematicChoiceWindow(
      matchId,
      paced.chargePauseUntilMs - 1
    )).toBe(false);
    expect(service.resumeCinematicChoiceWindow(
      matchId,
      paced.chargePauseUntilMs
    )).toBe(true);
    expect(service.getMatch(matchId)).toEqual(expect.objectContaining({
      roundNumber: 5,
      actionOpenedAtMs: paced.chargePauseUntilMs,
      actionDeadlineMs: paced.chargePauseUntilMs + 6_000
    }));
  });

  test('derives the battle roster instruction from the persisted v8 deadline', () => {
    const { sqlite, store } = createStore();
    const nowMs = 1_000;
    insertMonster(sqlite, {
      id: 'roster-alpha',
      userId: 'roster-viewer-a',
      name: 'Ashfang'
    });
    insertMonster(sqlite, {
      id: 'roster-beta',
      userId: 'roster-viewer-b',
      name: 'Ripple',
      element: 'Tide',
      templateId: 'ripple'
    });
    insertMonster(sqlite, {
      id: 'roster-beta-choice',
      userId: 'roster-viewer-b',
      name: 'Brine',
      element: 'Tide',
      templateId: 'brine'
    });
    const service = createService({
      store,
      now: () => nowMs
    });
    const commands = new ChatCommands({
      store,
      engine: { streamKey: 'stream-v8' },
      battleService: service.battleService,
      battleMatchService: service,
      now: () => nowMs,
      getCommandReference: command => `!${command}`
    });

    expect(commands.executeBattle('roster-viewer-a')).toEqual(
      expect.objectContaining({ status: 'queued' })
    );
    const reserved = commands.executeBattle('roster-viewer-b');

    expect(reserved.match.rosterDeadlineMs).toBe(7_000);
    expect(reserved.message).toContain('within 6 seconds');
    expect(reserved.message).not.toContain('15 seconds');
    expect(reserved.rosterInstruction).toEqual({
      deadlineMs: 7_000,
      remainingSeconds: 6,
      command: '!choose <slot>'
    });
    expect(new PublicEventProjector().project(
      'streammonsters:chat_result',
      {
        username: 'Roster Viewer',
        command: 'battle',
        transport: 'gcce',
        result: {
          ...reserved,
          messageKey: 'chatResultReserved'
        }
      }
    ).result.rosterInstruction).toEqual(reserved.rosterInstruction);
  });

  test('returns an immediate skill instruction instead of choose-zero after both sole rosters auto-lock', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'instant-alpha',
      userId: 'instant-viewer-a',
      name: 'Ashfang'
    });
    insertMonster(sqlite, {
      id: 'instant-beta',
      userId: 'instant-viewer-b',
      name: 'Ripple',
      element: 'Tide',
      templateId: 'ripple'
    });
    const service = createService({ store, now: () => 1_000 });
    const commands = new ChatCommands({
      store,
      engine: { streamKey: 'stream-v8-instant' },
      battleService: service.battleService,
      battleMatchService: service,
      now: () => 1_000,
      getCommandReference: command => `!${command}`
    });

    commands.executeBattle('instant-viewer-a');
    const started = commands.executeBattle('instant-viewer-b');

    expect(started).toEqual(expect.objectContaining({
      status: 'started',
      match: expect.objectContaining({ state: 'action' })
    }));
    expect(started).not.toHaveProperty('rosterInstruction');
    expect(started.message).toMatch(/A\s*\/\s*B\s*\/\s*C/i);
    expect(started.message).not.toMatch(/!choose|<slot>|within 0 seconds/i);
  });

  test('caps time charge at thirty points even when locale presentation runs longer', () => {
    expect(MAX_PASSIVE_CHARGE_PER_ROUND).toBe(30);
    expect(projectPassiveCharge({
      baseCharge: 10,
      openedAtMs: 1_000,
      deadlineMs: 7_000,
      asOfMs: 11_000
    })).toBe(40);
  });

  test('does not advertise Special readiness beyond the six-second charge cap', () => {
    const { sqlite, service, matchId } = createLockedMatch({
      localeCount: 2,
      secondsPerLocale: 5
    });
    sqlite.prepare(`
      UPDATE streammonsters_match_participants
      SET combat_state_json = '{"charge":60}'
      WHERE match_id = ? AND viewer_id = 'viewer-a'
    `).run(matchId);
    const match = service.getMatch(matchId);
    const participant = match.participants.find(entry => entry.viewerId === 'viewer-a');
    const special = service.projectPublicSkillDeck(participant, match)
      .find(skill => skill.choice === 'C');

    expect(special).toEqual(expect.objectContaining({
      available: false,
      unavailableReason: 'special_requires_full_charge'
    }));
    expect(special).not.toHaveProperty('readyAtMs');
  });

  test('publishes the v8 passive charge cap through live and replay projections', () => {
    const { emit, service, matchId } = createLockedMatch({
      localeCount: 2,
      secondsPerLocale: 5
    });
    const opened = emit.mock.calls.find(([event]) => (
      event === 'streammonsters:battle_choice_opened'
    ))?.[1];
    const projector = new PublicEventProjector();

    expect(opened.chargeWindow).toEqual(expect.objectContaining({
      openedAtMs: 1_000,
      deadlineMs: 7_000,
      passivePerSecond: 5,
      maxGain: 30
    }));
    expect(projector.project(
      'streammonsters:battle_choice_opened',
      opened
    ).chargeWindow).toEqual(opened.chargeWindow);

    const replayOpened = service.getPublicNormalizedReplay(matchId, 0, 100)
      .events.find(event => event.type === 'streammonsters:battle_choice_opened');
    expect(replayOpened.payload.chargeWindow).toEqual(opened.chargeWindow);
  });

  test('persists bounded charge ticks at the authoritative second lock', () => {
    const { sqlite, service, matchId, setNow } = createLockedMatch({
      localeCount: 2,
      secondsPerLocale: 5
    });
    service.battleService.resolveInteractiveRound = jest.fn(({ fighters }) => ({
      terminal: false,
      winnerId: null,
      state: Object.fromEntries(fighters.map(fighter => [
        fighter.monster_id,
        { hp: 30, maxHp: 30, shield: 0, charge: 30 }
      ])),
      actions: []
    }));
    setNow(7_000);
    expect(service.recoverActionMatch(matchId, 7_000)).toBe(true);

    const ticks = sqlite.prepare(`
      SELECT public_payload_json
      FROM streammonsters_match_events
      WHERE match_id = ? AND event_type = 'streammonsters:battle_charge_tick'
      ORDER BY sequence
    `).all(matchId).map(row => JSON.parse(row.public_payload_json));
    expect(ticks).toEqual([
      expect.objectContaining({ round: 1, before: 0, after: 30, gained: 30 }),
      expect.objectContaining({ round: 1, before: 0, after: 30, gained: 30 })
    ]);
  });

  test('continues a living match beyond round three without an HP tie-break', () => {
    const { service, matchId, setNow } = createLockedMatch();
    service.battleService.resolveInteractiveRound = jest.fn(({ fighters, round }) => ({
      terminal: false,
      winnerId: null,
      state: Object.fromEntries(fighters.map(fighter => [
        fighter.monster_id,
        {
          hp: 20 - round,
          maxHp: 30,
          shield: 0,
          charge: 0
        }
      ])),
      actions: []
    }));

    for (let round = 1; round <= 3; round += 1) {
      submitRound(service, round);
      setNow(service.getMatch(matchId).chargePauseUntilMs);
      expect(service.resumeCinematicChoiceWindow(matchId)).toBe(true);
    }

    expect(service.getMatch(matchId)).toEqual(expect.objectContaining({
      state: 'action',
      rulesVersion: 8,
      roundNumber: 4
    }));
  });

  test('publishes and persists a privacy-safe KO result with explicit unchanged ratings', () => {
    const { sqlite, store, emit, service, matchId } = createLockedMatch();
    sqlite.prepare(`
      INSERT INTO streammonsters_viewer_identities (
        platform_user_id, canonical_user_id, current_unique_id, updated_at_ms
      ) VALUES ('1234567890123456789', 'viewer-a', 'arenaalpha', 1)
    `).run();
    sqlite.prepare(`
      UPDATE streammonsters_matches SET round_number = 4 WHERE match_id = ?
    `).run(matchId);
    const season = service.getCurrentArenaSeason();
    service.getArenaRating(season.seasonId, 'viewer-a');
    service.getArenaRating(season.seasonId, 'viewer-b');
    sqlite.prepare(`
      UPDATE streammonsters_match_participants
      SET rating_before = CASE viewer_id WHEN 'viewer-a' THEN 1000 ELSE 900 END
      WHERE match_id = ?
    `).run(matchId);
    sqlite.prepare(`
      UPDATE streammonsters_arena_ratings
      SET rating = CASE viewer_id
        WHEN 'viewer-a' THEN 1000
        ELSE 900
      END
      WHERE season_id = ?
    `).run(season.seasonId);
    sqlite.prepare(`
      INSERT INTO streammonsters_arena_daily_ledger (
        viewer_id, day_key, rated_battles
      ) VALUES (?, '1970-01-01', 10), (?, '1970-01-01', 10)
    `).run('viewer-a', 'viewer-b');
    service.battleService.resolveInteractiveRound = jest.fn(({ fighters }) => ({
      terminal: true,
      winnerId: 'alpha-v8',
      state: {
        'alpha-v8': { hp: 12, maxHp: 45, shield: 0, charge: 30 },
        'beta-v8': { hp: 0, maxHp: 40, shield: 0, charge: 20 }
      },
      actions: fighters.map((fighter, index) => ({
        actorId: fighter.monster_id,
        targetId: fighters[1 - index].monster_id,
        round: 4,
        terminal: index === 0
      }))
    }));

    submitRound(service, 4);

    const completed = emit.mock.calls.find(([event]) => (
      event === 'streammonsters:battle_completed'
    ))?.[1];
    const winnerSlot = service.getMatch(matchId).participants.find(participant => (
      participant.lockedMonsterId === 'alpha-v8'
    )).slot;
    expect(completed).toEqual(expect.objectContaining({
      winnerSlot,
      winner: expect.objectContaining({
        viewerName: '@arenaalpha',
        name: 'Ashfang'
      }),
      terminalReason: 'knockout',
      knockout: {
        round: 4,
        remainingHp: 10,
        maxHp: 45
      },
      ratingChanges: expect.arrayContaining([
        { slot: winnerSlot, before: 1000, after: 1000, delta: 0 },
        { slot: winnerSlot === 1 ? 2 : 1, before: 900, after: 900, delta: 0 }
      ])
    }));
    expect(JSON.stringify(completed)).not.toContain('1234567890123456789');
    expect(service.getMatch(matchId).result).toEqual(expect.objectContaining({
      terminalReason: 'knockout',
      knockout: { round: 4, remainingHp: 10, maxHp: 45 }
    }));
  });

  test('persists an authoritative combat report and reconnects its completion once', async () => {
    const {
      sqlite,
      store,
      emit,
      service,
      matchId,
      setNow
    } = createLockedMatch();
    sqlite.prepare(`
      INSERT INTO streammonsters_viewer_identities (
        platform_user_id, canonical_user_id, current_unique_id, updated_at_ms
      ) VALUES
        ('1111111111111111111', 'viewer-a', 'alpha_public', 1),
        ('2222222222222222222', 'viewer-b', 'beta_public', 1)
    `).run();
    const activeMatch = service.getMatch(matchId);
    const alpha = activeMatch.participants.find(participant => (
      participant.lockedMonsterId === 'alpha-v8'
    ));
    const beta = activeMatch.participants.find(participant => (
      participant.lockedMonsterId === 'beta-v8'
    ));
    const persistedAction = {
      sequence: 1,
      round: 1,
      actorId: 'alpha-v8',
      targetId: 'beta-v8',
      choice: 'C',
      skill: { name: 'Solar Bloom', icon: '☀️' },
      hits: [{
        hpDamage: 7,
        shieldAbsorbed: 3,
        evaded: false
      }],
      outcomes: [
        { type: 'heal', amount: 2 },
        { type: 'shield', amount: 4 }
      ],
      retaliations: [{
        type: 'reflect',
        hpDamage: 2,
        shieldAbsorbed: 1
      }],
      statusEffects: [],
      terminal: true
    };
    sqlite.prepare(`
      INSERT INTO streammonsters_match_actions (
        match_id, sequence, round_number, actor_participant_id,
        event_id, event_sequence, action_json, created_at_ms
      ) VALUES (?, 1, 1, ?, ?, NULL, ?, ?)
    `).run(
      matchId,
      alpha.participantId,
      'private-action-event',
      JSON.stringify(persistedAction),
      1_500
    );
    setNow(2_500);

    service.finalize(matchId, activeMatch.phaseVersion, 'alpha-v8', {
      completion: 'battle',
      terminalReason: 'knockout',
      knockout: {
        round: 1,
        remainingHp: 12,
        maxHp: 62
      }
    });

    const expectedCombatReport = {
      roundCount: 1,
      durationMs: 1_500,
      decisiveSkill: {
        round: 1,
        ownerSlot: alpha.slot,
        choice: 'C',
        skillName: 'Solar Bloom',
        skillIcon: '☀️'
      },
      highlights: {
        largestHit: { slot: alpha.slot, amount: 7 },
        largestBlock: { slot: beta.slot, amount: 3 },
        largestHeal: { slot: alpha.slot, amount: 2 }
      },
      fighters: [{
        slot: alpha.slot,
        playerName: '@alpha_public',
        monsterName: 'Ashfang',
        damageDealt: 7,
        damageBlocked: 1,
        healingDone: 2,
        shieldGained: 4,
        specialsUsed: 1,
        hits: 1,
        evades: 0,
        xpAwarded: 15,
        rating: {
          before: 900,
          after: 916,
          delta: 16,
          eligible: true
        }
      }, {
        slot: beta.slot,
        playerName: '@beta_public',
        monsterName: 'Ripple',
        damageDealt: 2,
        damageBlocked: 3,
        healingDone: 0,
        shieldGained: 0,
        specialsUsed: 0,
        hits: 0,
        evades: 0,
        xpAwarded: 10,
        rating: {
          before: 900,
          after: 884,
          delta: -16,
          eligible: true
        }
      }].sort((left, right) => left.slot - right.slot)
    };
    const completedMatch = service.getMatch(matchId);
    const storedBattle = store.getBattle(`battle-${matchId}`);
    const emittedCompletion = emit.mock.calls.find(([event]) => (
      event === 'streammonsters:battle_completed'
    ))?.[1];
    const replay = service.getPublicNormalizedReplay(matchId, 0, 100);
    const completionEvent = replay.events.find(event => (
      event.type === 'streammonsters:battle_completed'
    ));

    expect(completedMatch.result.combatReport).toEqual(expectedCombatReport);
    expect(storedBattle.result.combatReport).toEqual(expectedCombatReport);
    expect(emittedCompletion.combatReport).toEqual(expectedCombatReport);
    expect(replay.result.combatReport).toEqual(expectedCombatReport);
    expect(completionEvent.payload.combatReport).toEqual(expectedCombatReport);
    expect(JSON.stringify({
      emitted: emittedCompletion.combatReport,
      result: replay.result.combatReport,
      event: completionEvent.payload.combatReport
    })).not.toMatch(
      /viewer-a|viewer-b|alpha-v8|beta-v8|private-action-event|actorId|targetId|actions|seed/
    );

    const presented = [];
    const synchronizer = OverlayRuntime.createBattleReplaySynchronizer({
      loadPage: async ({ cursor, limit }) => (
        service.getPublicNormalizedReplay(matchId, cursor, limit)
      ),
      present: async event => {
        presented.push(event);
      }
    });
    await synchronizer.sync({
      battle: {
        matches: [{
          matchId,
          cursor: completionEvent.sequence - 1
        }]
      }
    });
    await synchronizer.sync({ battle: { matches: [] } });
    await synchronizer.sync({ battle: { matches: [] } });

    expect(presented).toEqual([expect.objectContaining({
      type: 'battle_completed',
      data: expect.objectContaining({
        eventId: completionEvent.eventId,
        combatReport: expectedCombatReport
      })
    })]);
    expect(synchronizer.hasSeen('battle_completed', {
      ...completionEvent.payload,
      eventId: completionEvent.eventId,
      correlationId: completionEvent.correlationId,
      sequence: completionEvent.sequence
    })).toBe(true);
  });

  test('keeps legacy normalized replays report-free for safe UI fallback', () => {
    const { store, service } = createLockedMatch();
    store.createBattle({
      battleId: 'legacy-no-combat-report',
      seed: 'private-legacy-seed',
      monsterAId: 'alpha-v8',
      monsterBId: 'beta-v8',
      winnerMonsterId: 'alpha-v8',
      userAId: 'viewer-a',
      userBId: 'viewer-b',
      rulesVersion: 3,
      result: {
        rounds: []
      },
      createdAtMs: 1
    });

    const replay = service.getPublicNormalizedReplay(
      'legacy-no-combat-report',
      0,
      100
    );

    expect(replay).not.toHaveProperty('combatReport');
    expect(replay).not.toHaveProperty('result');
    expect(JSON.stringify(replay)).not.toContain('private-legacy-seed');
  });

  test('keeps the normalized replay winner at its battle-time public snapshot', () => {
    const { sqlite, service, matchId } = createLockedMatch();
    sqlite.prepare(`
      INSERT INTO streammonsters_viewer_identities (
        platform_user_id, canonical_user_id, current_unique_id, updated_at_ms
      ) VALUES ('1234567890123456789', 'viewer-a', 'battle_name', 1)
    `).run();
    service.battleService.resolveInteractiveRound = jest.fn(() => ({
      terminal: true,
      winnerId: 'alpha-v8',
      state: {
        'alpha-v8': { hp: 12, maxHp: 30, shield: 0, charge: 30 },
        'beta-v8': { hp: 0, maxHp: 30, shield: 0, charge: 20 }
      },
      actions: []
    }));

    submitRound(service, 1);

    const completedReplay = service.getPublicNormalizedReplay(matchId, 0, 100);
    const completedEvent = completedReplay.events.find(event => (
      event.type === 'streammonsters:battle_completed'
    ));
    const battleTimeWinner = completedEvent.payload.winner;
    expect(completedReplay.result.winner).toEqual(battleTimeWinner);

    sqlite.prepare(`
      UPDATE streammonsters_monsters
      SET name = 'Changed Later', level = 20, evolution_stage = 3
      WHERE monster_id = 'alpha-v8'
    `).run();
    sqlite.prepare(`
      UPDATE streammonsters_viewer_identities
      SET current_unique_id = 'changed_later', updated_at_ms = 2
      WHERE canonical_user_id = 'viewer-a'
    `).run();

    const replayAfterMutation = service.getPublicNormalizedReplay(matchId, 0, 100);
    const persistedCompletedEvent = replayAfterMutation.events.find(event => (
      event.type === 'streammonsters:battle_completed'
    ));
    expect(persistedCompletedEvent.payload.winner).toEqual(battleTimeWinner);
    expect(replayAfterMutation.result.winner).toEqual(battleTimeWinner);
  });

  test('persists a simultaneous KO as a winnerless draw', () => {
    const { sqlite, emit, service, matchId } = createLockedMatch();
    service.battleService.resolveInteractiveRound = jest.fn(() => ({
      terminal: true,
      winnerId: null,
      state: {
        'alpha-v8': { hp: 0, maxHp: 30, shield: 0, charge: 0 },
        'beta-v8': { hp: 0, maxHp: 30, shield: 0, charge: 0 }
      },
      actions: []
    }));

    submitRound(service, 1);

    expect(service.getMatch(matchId)).toEqual(expect.objectContaining({
      state: 'completed',
      winnerMonsterId: null,
      result: expect.objectContaining({
        winnerMonsterId: null,
        terminalReason: 'double_knockout',
        knockout: null
      })
    }));
    expect(emit.mock.calls.find(([event]) => (
      event === 'streammonsters:battle_completed'
    ))?.[1]).toEqual(expect.objectContaining({
      winnerSlot: 0,
      winner: null,
      terminalReason: 'double_knockout',
      knockout: null
    }));
    expect(sqlite.prepare(`
      SELECT winner_monster_id
      FROM streammonsters_battles
      WHERE match_id = ?
    `).get(matchId)).toEqual({ winner_monster_id: 'double_knockout' });
  });

  test('persists round-four collapse without allowing collapse to cause a KO', () => {
    const { sqlite, service, matchId } = createLockedMatch();
    sqlite.prepare(`
      UPDATE streammonsters_matches SET round_number = 4 WHERE match_id = ?
    `).run(matchId);
    sqlite.prepare(`
      UPDATE streammonsters_match_participants
      SET combat_state_json = CASE locked_monster_id
        WHEN 'alpha-v8' THEN '{"hp":1,"maxHp":30,"shield":2,"charge":0}'
        ELSE '{"hp":8,"maxHp":30,"shield":0,"charge":0}'
      END
      WHERE match_id = ?
    `).run(matchId);
    service.battleService.resolveInteractiveRound = jest.fn(() => ({
      terminal: false,
      winnerId: null,
      state: {
        'alpha-v8': { hp: 1, maxHp: 30, shield: 5, charge: 0 },
        'beta-v8': { hp: 8, maxHp: 30, shield: 2, charge: 0 }
      },
      actions: [
        {
          actorId: 'alpha-v8',
          outcomes: [
            {
              type: 'shield',
              requested: 6,
              amount: 3,
              arenaCollapseReduction: 3
            }
          ]
        },
        {
          actorId: 'beta-v8',
          outcomes: [
            {
              type: 'shield',
              requested: 4,
              amount: 2,
              arenaCollapseReduction: 2
            }
          ]
        }
      ]
    }));

    submitRound(service, 4);

    const match = service.getMatch(matchId);
    expect(match).toEqual(expect.objectContaining({
      state: 'action',
      roundNumber: 5
    }));
    expect(Object.fromEntries(match.participants.map(participant => [
      participant.lockedMonsterId,
      participant.combatState
    ]))).toEqual({
      'alpha-v8': { hp: 1, maxHp: 30, shield: 5, charge: 0 },
      'beta-v8': { hp: 6, maxHp: 30, shield: 2, charge: 0 }
    });
    const collapse = sqlite.prepare(`
      SELECT public_payload_json
      FROM streammonsters_match_events
      WHERE match_id = ? AND event_type = 'streammonsters:battle_arena_collapse'
    `).get(matchId);
    expect(JSON.parse(collapse.public_payload_json)).toEqual(expect.objectContaining({
      round: 4,
      damage: 2,
      fighters: expect.arrayContaining([
        expect.objectContaining({ shieldReduced: 3, hpDamage: 0, hp: 1, shield: 5 }),
        expect.objectContaining({ shieldReduced: 2, hpDamage: 2, hp: 6, shield: 2 })
      ])
    }));
  });

  test('applies symmetric escalating round-four collapse without direct K.O.', () => {
    const collapse = applyArenaCollapse({
      fighters: [
        { monsterId: 'alpha', slot: 1 },
        { monsterId: 'beta', slot: 2 }
      ],
      state: {
        alpha: { hp: 2, shield: 0 },
        beta: { hp: 9, shield: 0 }
      },
      round: 4
    });

    expect(collapse.damage).toBe(2);
    expect(collapse.fighters).toEqual([
      expect.objectContaining({ slot: 1, hpDamage: 1, hp: 1 }),
      expect.objectContaining({ slot: 2, hpDamage: 2, hp: 7 })
    ]);
  });

  test('publishes round-eight Collapse defense copy in every overlay locale', () => {
    const translations = [
      require('../plugins/streamalchemy/locales/de.json'),
      require('../plugins/streamalchemy/locales/en.json'),
      require('../plugins/streamalchemy/locales/es.json'),
      require('../plugins/streamalchemy/locales/fr.json')
    ].map(locale => (
      locale.plugins.streamalchemy.ui.monsters.arenaCollapseDefenseLocked
    ));

    expect(translations).toHaveLength(4);
    translations.forEach(copy => {
      expect(copy).toContain('8');
      expect(copy).not.toContain('11');
    });
  });

  test('halves a round-five shield gain after an equal old shield was consumed', () => {
    const { sqlite, service, matchId } = createLockedMatch();
    const match = service.getMatch(matchId);
    const alpha = match.participants.find(entry => (
      entry.lockedMonsterId === 'alpha-v8'
    ));
    const beta = match.participants.find(entry => (
      entry.lockedMonsterId === 'beta-v8'
    ));
    alpha.roster.stats.agility = 1;
    beta.roster.stats.agility = 50;
    sqlite.prepare(`
      UPDATE streammonsters_matches SET round_number = 5 WHERE match_id = ?
    `).run(matchId);
    sqlite.prepare(`
      UPDATE streammonsters_match_participants
      SET roster_json = ?, combat_state_json = ?
      WHERE match_id = ? AND participant_id = ?
    `).run(
      JSON.stringify(alpha.roster),
      JSON.stringify({
        hp: 62,
        maxHp: 62,
        shield: 6,
        charge: 0,
        burn: 0,
        evade: 0,
        thorns: 0,
        reflect: 0,
        weakened: 0
      }),
      matchId,
      alpha.participantId
    );
    sqlite.prepare(`
      UPDATE streammonsters_match_participants
      SET roster_json = ?, combat_state_json = ?
      WHERE match_id = ? AND participant_id = ?
    `).run(
      JSON.stringify(beta.roster),
      JSON.stringify({
        hp: 62,
        maxHp: 62,
        shield: 0,
        charge: 0,
        burn: 0,
        evade: 0,
        thorns: 0,
        reflect: 0,
        weakened: 0
      }),
      matchId,
      beta.participantId
    );

    expect(service.submitChoice({
      userId: 'viewer-a',
      choice: 'B',
      eventId: 'collapse-defender'
    })).toEqual(expect.objectContaining({ handled: true, waiting: true }));
    service.submitChoice({
      userId: 'viewer-b',
      choice: 'A',
      eventId: 'collapse-attacker'
    });

    const resolved = service.getMatch(matchId);
    const resolvedAlpha = resolved.participants.find(entry => (
      entry.lockedMonsterId === 'alpha-v8'
    ));
    expect(resolvedAlpha.combatState.shield).toBe(3);

    const replay = service.getPublicNormalizedReplay(matchId, 0, 100);
    const shieldAction = replay.actions.find(action => (
      action.actorSlot === alpha.slot &&
      action.outcomes.some(outcome => outcome.type === 'shield')
    ));
    expect(shieldAction.outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'shield',
        requested: 6,
        amount: 3,
        arenaCollapseReduction: 3
      })
    ]));
    expect(shieldAction.actorState.shield).toBe(3);

    const collapse = replay.events.find(event => (
      event.type === 'streammonsters:battle_arena_collapse'
    ));
    expect(collapse.payload.fighters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slot: alpha.slot,
        shieldReduced: 3,
        shield: 3
      })
    ]));
  });

  test('progressively suppresses late collapse shield and healing loops', () => {
    const fighters = [
      {
        monster_id: 'collapse-a',
        template_id: 'brine',
        element: 'Tide',
        evolution_stage: 1,
        level: 1,
        stats: { vitality: 7, might: 7, guard: 0, agility: 8 }
      },
      {
        monster_id: 'collapse-b',
        template_id: 'brine',
        element: 'Tide',
        evolution_stage: 1,
        level: 1,
        stats: { vitality: 7, might: 7, guard: 0, agility: 7 }
      }
    ];
    const resolveDefenseRound = round => resolveInteractiveRound({
      fighters,
      choices: { 'collapse-a': 'B', 'collapse-b': 'B' },
      seed: 'progressive-collapse-recovery',
      round,
      state: {
        'collapse-a': { hp: 20, shield: 0, charge: 0 },
        'collapse-b': { hp: 20, shield: 0, charge: 0 }
      },
      disableElementAdvantage: true,
      rulesVersion: 8
    }).actions[0];

    expect(resolveDefenseRound(4).outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'shield',
        requested: 4,
        amount: 2,
        arenaCollapseFactor: 0.5
      }),
      expect.objectContaining({
        type: 'heal',
        requested: 3,
        amount: 3,
        arenaCollapseFactor: 1
      })
    ]));
    expect(resolveDefenseRound(6).outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'shield',
        requested: 4,
        amount: 1,
        arenaCollapseFactor: 0.25
      }),
      expect.objectContaining({
        type: 'heal',
        requested: 3,
        amount: 2,
        arenaCollapseFactor: 0.5
      })
    ]));
    expect(resolveDefenseRound(8)).toEqual(expect.objectContaining({
      requestedChoice: 'B',
      choice: 'A',
      choiceFallback: 'arena_collapse_defense_locked'
    }));
  });

  test('ends a v8 knockout before a defeated defender can retaliate', () => {
    const fighters = [
      {
        monster_id: 'finisher',
        template_id: 'ashfang',
        element: 'Ember',
        evolution_stage: 1,
        level: 1,
        stats: { vitality: 7, might: 10, guard: 7, agility: 20 }
      },
      {
        monster_id: 'defender',
        template_id: 'pulse',
        element: 'Volt',
        evolution_stage: 1,
        level: 1,
        stats: { vitality: 7, might: 7, guard: 0, agility: 1 }
      }
    ];
    const result = resolveInteractiveRound({
      fighters,
      choices: { finisher: 'A', defender: 'B' },
      seed: 'v8-no-postmortem-retaliation',
      round: 8,
      state: {
        finisher: {
          hp: 1,
          shield: 0,
          charge: 0,
          thorns: 0,
          reflect: 0
        },
        defender: {
          hp: 1,
          shield: 0,
          charge: 0,
          thorns: 3,
          reflect: 3
        }
      },
      disableElementAdvantage: true,
      rulesVersion: 8
    });

    expect(result).toEqual(expect.objectContaining({
      terminal: true,
      winnerId: 'finisher'
    }));
    expect(result.state).toEqual(expect.objectContaining({
      finisher: expect.objectContaining({ hp: 1 }),
      defender: expect.objectContaining({ hp: 0 })
    }));
    expect(result.actions[0].retaliations).toEqual([]);

    const legacy = resolveInteractiveRound({
      fighters,
      choices: { finisher: 'A', defender: 'B' },
      seed: 'v8-no-postmortem-retaliation',
      round: 8,
      state: {
        finisher: {
          hp: 1,
          shield: 0,
          charge: 0,
          thorns: 0,
          reflect: 0
        },
        defender: {
          hp: 1,
          shield: 0,
          charge: 0,
          thorns: 3,
          reflect: 3
        }
      },
      disableElementAdvantage: true,
      rulesVersion: 7
    });
    expect(legacy).toEqual(expect.objectContaining({
      terminal: true,
      winnerId: null
    }));
    expect(legacy.actions[0].retaliations).toEqual([
      expect.objectContaining({ type: 'thorns', hpAfter: 0 })
    ]);
  });

  test('uses replayable seeded rounding for fractional v8 damage tuning only', () => {
    const fighters = [
      {
        monster_id: 'fractional-a',
        template_id: 'ashfang',
        element: 'Ember',
        evolution_stage: 1,
        level: 1,
        stats: { vitality: 7, might: 10, guard: 0, agility: 20 }
      },
      {
        monster_id: 'fractional-b',
        template_id: 'pulse',
        element: 'Volt',
        evolution_stage: 1,
        level: 1,
        stats: { vitality: 100, might: 0, guard: 0, agility: 1 }
      }
    ];
    const resolve = (seed, rulesVersion = 8) => resolveInteractiveRound({
      fighters,
      choices: { 'fractional-a': 'A', 'fractional-b': 'B' },
      seed,
      round: 1,
      state: {},
      disableElementAdvantage: true,
      rulesVersion
    });
    const first = resolve('fractional-v8-seed');
    expect(resolve('fractional-v8-seed')).toEqual(first);
    expect(first.actions[0].rolls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        purpose: 'damage_rounding',
        value: expect.any(Number)
      })
    ]));

    const damageSamples = new Set(Array.from({ length: 64 }, (_, index) => (
      resolve(`fractional-v8-seed-${index}`).actions[0].hits[0].requestedDamage
    )));
    expect([...damageSamples].sort((left, right) => left - right)).toEqual([11, 12]);
    expect(resolve('fractional-v7-seed', 7).actions[0].rolls).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ purpose: 'damage_rounding' })
      ])
    );
  });

  test('applies the low-level Gale compensation to v8 without changing v7', () => {
    const totalDamage = (level, rulesVersion) => Array.from(
      { length: 64 },
      (_, index) => {
        const result = resolveInteractiveRound({
          fighters: [
            {
              monster_id: 'gale-attacker',
              template_id: 'skyrend',
              element: 'Gale',
              evolution_stage: 1,
              level,
              stats: { vitality: 7, might: 10, guard: 0, agility: 20 }
            },
            {
              monster_id: 'gale-target',
              template_id: 'ripple',
              element: 'Tide',
              evolution_stage: 1,
              level: 1,
              stats: { vitality: 100, might: 0, guard: 0, agility: 1 }
            }
          ],
          choices: { 'gale-attacker': 'A', 'gale-target': 'B' },
          seed: `gale-level-compensation-${index}`,
          round: 1,
          state: {},
          disableElementAdvantage: true,
          rulesVersion
        });
        return result.actions[0].hits
          .reduce((sum, hit) => sum + hit.requestedDamage, 0);
      }
    ).reduce((sum, damage) => sum + damage, 0);

    expect(totalDamage(1, 8)).toBeGreaterThan(totalDamage(5, 8));
    expect(totalDamage(1, 7)).toBe(totalDamage(5, 7));
  });

  test('does not let deterministic timeout choices defend forever during collapse', () => {
    const { store } = createStore();
    const service = createService({ store });
    for (const personality of ['Aggressive', 'Defensive', 'Adaptive']) {
      const choices = Array.from({ length: 54 }, (_, index) => (
        service.deterministicTimeoutChoice(
          {
            rulesVersion: 8,
            seed: 'collapse-timeout-pacing',
            roundNumber: index + 8,
            actionDeadlineMs: 10_000
          },
          {
            participantId: `timeout-${personality}`,
            roster: { personality },
            combatState: { charge: 0 }
          }
        )
      ));
      expect(choices).toContain('A');
      expect(choices.every(choice => choice === 'B')).toBe(false);
    }
  });

  test('locks defense from round 8 so a living v8 fight always progresses to K.O.', () => {
    const direct = resolveInteractiveRound({
      fighters: [
        {
          monster_id: 'collapse-alpha',
          template_id: 'ashfang',
          element: 'Ember',
          level: 1,
          stats: { vitality: 10, might: 10, guard: 10, agility: 20 }
        },
        {
          monster_id: 'collapse-beta',
          template_id: 'ripple',
          element: 'Tide',
          level: 1,
          stats: { vitality: 10, might: 10, guard: 10, agility: 1 }
        }
      ],
      choices: {
        'collapse-alpha': 'B',
        'collapse-beta': 'B'
      },
      seed: 'collapse-defense-lock',
      round: 8,
      state: {
        'collapse-alpha': { hp: 1, shield: 0, charge: 0 },
        'collapse-beta': { hp: 1, shield: 0, charge: 0 }
      },
      disableElementAdvantage: true,
      rulesVersion: 8
    });

    expect(direct.terminal).toBe(true);
    expect(direct.actions[0]).toEqual(expect.objectContaining({
      requestedChoice: 'B',
      choice: 'A',
      choiceFallback: 'arena_collapse_defense_locked'
    }));

    const { sqlite, service, matchId } = createLockedMatch();
    sqlite.prepare(`
      UPDATE streammonsters_matches
      SET round_number = 8
      WHERE match_id = ?
    `).run(matchId);
    const match = service.getMatch(matchId);
    const publicFighters = service.projectPublicFighters(match);

    expect(publicFighters).toHaveLength(2);
    for (const fighter of publicFighters) {
      expect(fighter.skills.find(skill => skill.choice === 'B')).toEqual(
        expect.objectContaining({
          available: false,
          unavailableReason: 'arena_collapse_defense_locked'
        })
      );
      expect(service.deterministicTimeoutChoice(match, {
        ...match.participants.find(participant => participant.slot === fighter.slot),
        combatState: { charge: 0 }
      })).toBe('A');
    }
    expect(service.submitChoice({
      userId: 'viewer-a',
      choice: 'B',
      eventId: 'late-defense'
    })).toEqual(expect.objectContaining({
      handled: true,
      accepted: false,
      reason: 'arena_collapse_defense_locked'
    }));
  });

  test('serializes stat windows and identifies the sanitized player and monster', () => {
    const { sqlite, store } = createStore();
    const emit = jest.fn();
    const userId = store.resolveViewerIdentity({
      platformUserId: '1234567890123456789',
      legacyUserId: 'safe_player',
      updatedAtMs: 1
    });
    insertMonster(sqlite, {
      id: 'levelled-alpha',
      userId,
      name: 'Nova',
      level: 3,
      unspent: 2
    });
    insertMonster(sqlite, {
      id: 'levelled-beta',
      userId: 'other-player',
      name: 'Moss',
      level: 2,
      unspent: 1
    });
    const service = createService({ store, emit });

    const first = service.createStandaloneStatPrompt({
      userId,
      monsterId: 'levelled-alpha',
      sourceKey: 'level-up'
    });
    const second = service.createStandaloneStatPrompt({
      userId: 'other-player',
      monsterId: 'levelled-beta',
      sourceKey: 'level-up'
    });

    expect(first).toEqual(expect.objectContaining({ status: 'open' }));
    expect(second).toBeNull();
    const prompt = emit.mock.calls.find(([event]) => (
      event === 'streammonsters:monster_stat_prompt'
    ))?.[1];
    expect(prompt).toEqual(expect.objectContaining({
      playerName: '@safe_player',
      monster: expect.objectContaining({
        name: 'Nova',
        level: 3,
        unspentStatPoints: 2
      }),
      level: 3,
      remainingUnspentPoints: 2
    }));
    expect(JSON.stringify(prompt)).not.toContain('1234567890123456789');

    service.submitStatChoice({
      userId,
      choice: '1',
      eventId: 'stat-v8'
    });
    const result = emit.mock.calls.find(([event]) => (
      event === 'streammonsters:monster_stat_chosen'
    ))?.[1];
    expect(result).toEqual(expect.objectContaining({
      playerName: '@safe_player',
      monster: expect.objectContaining({
        name: 'Nova',
        level: 3,
        unspentStatPoints: 1
      }),
      level: 3,
      remainingUnspentPoints: 1
    }));
  });

  test('identifies the sanitized player and monster in timed-out stat results', () => {
    const { sqlite, store } = createStore();
    const emit = jest.fn();
    let nowMs = 1_000;
    const userId = store.resolveViewerIdentity({
      platformUserId: '9876543210987654321',
      legacyUserId: 'timeout_player',
      updatedAtMs: 1
    });
    insertMonster(sqlite, {
      id: 'timeout-monster',
      userId,
      name: 'Cirrus',
      level: 4,
      unspent: 1
    });
    const service = createService({
      store,
      emit,
      now: () => nowMs
    });
    const prompt = service.createStandaloneStatPrompt({
      userId,
      monsterId: 'timeout-monster',
      sourceKey: 'level-up'
    });
    nowMs = prompt.deadline_ms;

    expect(service.recoverStandaloneStatAllocation(prompt.prompt_id, nowMs)).toBe(true);

    const result = emit.mock.calls.find(([event]) => (
      event === 'streammonsters:monster_stat_auto_assigned'
    ))?.[1];
    expect(result).toEqual(expect.objectContaining({
      playerName: '@timeout_player',
      monster: expect.objectContaining({
        name: 'Cirrus',
        level: 4,
        unspentStatPoints: 0
      }),
      level: 4,
      remainingUnspentPoints: 0
    }));
    expect(JSON.stringify(result)).not.toContain('9876543210987654321');
  });
});
