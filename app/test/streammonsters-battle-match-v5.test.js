const Database = require('better-sqlite3');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const BattleService = require('../plugins/streamalchemy/backend/streammonsters/battle-service');
const ChatCommands = require('../plugins/streamalchemy/backend/streammonsters/chat-commands');
const ProgressionService = require(
  '../plugins/streamalchemy/backend/streammonsters/progression-service'
);
const BattleMatchService = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
);
const {
  PASSIVE_CHARGE_PER_SECOND,
  projectPassiveCharge
} = require('../plugins/streamalchemy/backend/streammonsters/battle-charge');
const {
  effectiveCombatPower
} = require('../plugins/streamalchemy/backend/streammonsters/evolution-rules');

test('adds five charge per completed active-window second and caps at 100', () => {
  expect(PASSIVE_CHARGE_PER_SECOND).toBe(5);
  expect(projectPassiveCharge({
    baseCharge: 70,
    openedAtMs: 1_000,
    deadlineMs: 7_000,
    asOfMs: 1_999
  })).toBe(70);
  expect(projectPassiveCharge({
    baseCharge: 70,
    openedAtMs: 1_000,
    deadlineMs: 7_000,
    asOfMs: 4_100
  })).toBe(85);
  expect(projectPassiveCharge({
    baseCharge: 95,
    openedAtMs: 1_000,
    deadlineMs: 7_000,
    asOfMs: 9_000
  })).toBe(100);
});

function createStore(filename = ':memory:', options = {}) {
  const sqlite = new Database(filename);
  sqlite.pragma('foreign_keys = ON');
  const store = new StreamMonstersDatabase(sqlite, options);
  store.initialize();
  return { sqlite, store };
}

function insertMonster(sqlite, {
  id,
  userId,
  name = id,
  templateId = 'ashfang',
  element = 'Ember',
  level = 1,
  evolutionStage = 1,
  selected = true,
  stats = { vitality: 10, might: 10, guard: 10, agility: 10 }
}) {
  sqlite.prepare(`
    INSERT INTO streammonsters_monsters (
      monster_id, user_id, egg_id, name, element, rarity, level, xp,
      stats_json, personality, template_id, evolution_stage, is_selected,
      created_at_ms
    ) VALUES (?, ?, ?, ?, ?, 'Common', ?, 0, ?, 'Adaptive', ?, ?, ?, ?)
  `).run(
    id,
    userId,
    `egg-${id}`,
    name,
    element,
    level,
    JSON.stringify(stats),
    templateId,
    evolutionStage,
    selected ? 1 : 0,
    1
  );
}

function createMatchService({
  store,
  now,
  emit = jest.fn(),
  collection = null,
  progression = null,
  getStreamKey = () => null,
  logger = null,
  rulesVersion = 5,
  autoStart = false
}) {
  return new BattleMatchService({
    store,
    battleService: new BattleService({ store, now }),
    emit,
    collection,
    progression,
    getStreamKey,
    now,
    logger,
    rulesVersion,
    autoStart
  });
}

function createReservedRulesV7Match({
  chargeA = 95,
  chargeB = 70,
  openedAtMs = 10_000,
  rulesVersion = 7
} = {}) {
  let nowMs = openedAtMs;
  const { sqlite, store } = createStore();
  const emit = jest.fn();
  insertMonster(sqlite, { id: 'alpha-v7', userId: 'viewer-a' });
  insertMonster(sqlite, {
    id: 'beta-v7',
    userId: 'viewer-b',
    element: 'Tide',
    templateId: 'ripple',
    stats: { vitality: 10, might: 10, guard: 10, agility: 20 }
  });
  const service = createMatchService({
    store,
    now: () => nowMs,
    emit,
    rulesVersion
  });
  service.join({ userId: 'viewer-a' });
  const reserved = service.join({ userId: 'viewer-b' });
  service.lockRoster({ userId: 'viewer-a' });
  service.lockRoster({ userId: 'viewer-b' });
  const match = service.getMatch(reserved.match.matchId);
  sqlite.prepare(`
    UPDATE streammonsters_match_participants
    SET combat_state_json = ?
    WHERE match_id = ? AND viewer_id = ?
  `).run(JSON.stringify({ charge: chargeA }), match.matchId, 'viewer-a');
  sqlite.prepare(`
    UPDATE streammonsters_match_participants
    SET combat_state_json = ?
    WHERE match_id = ? AND viewer_id = ?
  `).run(JSON.stringify({ charge: chargeB }), match.matchId, 'viewer-b');
  return {
    sqlite,
    emit,
    service,
    matchId: match.matchId,
    advance: milliseconds => { nowMs += milliseconds; },
    decisions: () => sqlite.prepare(`
      SELECT * FROM streammonsters_match_decisions
      WHERE match_id = ? ORDER BY participant_id
    `).all(match.matchId)
  };
}

describe('Stream Monsters durable rules-v5 match schema', () => {
  test('adds durable match, ordered replay, stat and Arena ledgers without replacing v3 battles', () => {
    const { sqlite } = createStore();
    const tables = sqlite.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'streammonsters_%'
    `).all().map(row => row.name);

    expect(tables).toEqual(expect.arrayContaining([
      'streammonsters_battles',
      'streammonsters_matches',
      'streammonsters_match_participants',
      'streammonsters_match_decisions',
      'streammonsters_match_actions',
      'streammonsters_match_events',
      'streammonsters_match_rewards',
      'streammonsters_stat_prompts',
      'streammonsters_stat_allocations',
      'streammonsters_arena_seasons',
      'streammonsters_arena_ratings',
      'streammonsters_arena_daily_ledger'
    ]));
    expect(sqlite.prepare('PRAGMA table_info(streammonsters_monsters)').all()
      .map(column => column.name)).toContain('unspent_stat_points');
    expect(sqlite.prepare('PRAGMA table_info(streammonsters_battles)').all()
      .map(column => column.name)).toEqual(expect.arrayContaining([
        'match_id', 'replay_version'
      ]));
    expect(sqlite.prepare('PRAGMA table_info(streammonsters_match_actions)').all()
      .map(column => column.name)).toContain('event_sequence');
    expect(sqlite.prepare('PRAGMA table_info(streammonsters_match_decisions)').all()
      .map(column => column.name)).toContain('event_sequence');
    expect(sqlite.prepare('PRAGMA table_info(streammonsters_matches)').all()
      .map(column => column.name)).toContain('action_opened_at_ms');
    expect(sqlite.prepare('PRAGMA table_info(streammonsters_match_decisions)').all()
      .map(column => column.name)).toContain('charge_at_choice');
  });

  test('isolates and logs failing afterCommit callbacks while later callbacks still run', () => {
    const errors = [];
    const { store } = createStore(':memory:', {
      logger: { error: message => errors.push(String(message)) }
    });
    const reached = jest.fn();

    expect(() => store.runInImmediateTransaction(() => {
      store.afterCommit(() => {
        throw new Error('first callback failed');
      });
      store.afterCommit(reached);
    })).not.toThrow();
    expect(reached).toHaveBeenCalledTimes(1);
    expect(errors.join('\n')).toContain('first callback failed');
  });
});

describe('Stream Monsters durable BattleMatchService', () => {
  test('Rules v7 consumes early C with redacted feedback and accepts it at the first full tick', () => {
    const { service, emit, advance, decisions } = createReservedRulesV7Match({
      chargeA: 95,
      openedAtMs: 10_000
    });
    const viewerASlot = service.getActiveMatchForViewer('viewer-a').participants
      .find(participant => participant.viewerId === 'viewer-a').slot;
    advance(999);
    expect(service.submitChoice({ userId: 'viewer-a', choice: 'C' }))
      .toEqual(expect.objectContaining({ handled: true, reason: 'special_not_charged' }));
    expect(decisions()).toHaveLength(0);
    const rejected = emit.mock.calls.find(([event]) => (
      event === 'streammonsters:battle_choice_rejected'
    ));
    expect(rejected).toEqual([
      'streammonsters:battle_choice_rejected',
      expect.objectContaining({
        matchId: expect.any(String),
        slot: viewerASlot,
        reason: 'special_not_charged',
        messageKey: 'arenaChoiceSpecialNotCharged'
      })
    ]);
    expect(JSON.stringify(rejected[1]))
      .not.toMatch(/viewer-a|participant|"choice"|requestedChoice|["']C["']/i);
    advance(1);
    expect(service.submitChoice({ userId: 'viewer-a', choice: 'C' }))
      .toEqual(expect.objectContaining({ handled: true }));
    expect(decisions()).toHaveLength(1);
    expect(decisions()[0].charge_at_choice).toBe(100);
  });

  test('consumes duplicate, already locked and just-closed input only for active fighters', () => {
    const { service, emit, advance } = createReservedRulesV7Match({
      chargeA: 100,
      openedAtMs: 10_000
    });
    const active = service.getActiveMatchForViewer('viewer-a');
    const viewerASlot = active.participants
      .find(participant => participant.viewerId === 'viewer-a').slot;
    const viewerBSlot = active.participants
      .find(participant => participant.viewerId === 'viewer-b').slot;

    expect(service.submitChoice({
      userId: 'viewer-a',
      choice: 'A',
      eventId: 'sealed-once'
    })).toEqual(expect.objectContaining({ handled: true, waiting: true }));
    const locked = emit.mock.calls.find(([event]) => (
      event === 'streammonsters:battle_choice_locked'
    ));
    expect(JSON.stringify(locked)).not.toMatch(/viewer-a|participant|["']A["']/i);

    expect(service.submitChoice({
      userId: 'viewer-a',
      choice: 'A',
      eventId: 'sealed-once'
    })).toEqual(expect.objectContaining({ handled: true, reason: 'duplicate_event' }));
    expect(service.submitChoice({
      userId: 'viewer-a',
      choice: 'B',
      eventId: 'sealed-twice'
    })).toEqual(expect.objectContaining({ handled: true, reason: 'already_locked' }));

    advance(8_001);
    expect(service.submitChoice({
      userId: 'viewer-b',
      choice: 'A',
      eventId: 'closed-fighter'
    })).toEqual(expect.objectContaining({ handled: true, reason: 'no_active_window' }));
    expect(service.submitChoice({
      userId: 'bystander',
      choice: 'A',
      eventId: 'closed-bystander'
    })).toEqual({ handled: false, reason: 'no_active_window' });

    const rejectedPayloads = emit.mock.calls
      .filter(([event]) => event === 'streammonsters:battle_choice_rejected')
      .map(([, payload]) => payload);
    expect(rejectedPayloads).toEqual(expect.arrayContaining([
      expect.objectContaining({ slot: viewerASlot, reason: 'duplicate_event' }),
      expect.objectContaining({ slot: viewerASlot, reason: 'already_locked' }),
      expect.objectContaining({ slot: viewerBSlot, reason: 'no_active_window' })
    ]));
    expect(JSON.stringify(rejectedPayloads))
      .not.toMatch(/viewer-a|viewer-b|"choice"|requestedChoice/i);
  });

  test('consumes defense input from a fighter after Arena Collapse locks defense', () => {
    const { sqlite, service, emit, matchId } = createReservedRulesV7Match({
      rulesVersion: 8,
      openedAtMs: 10_000
    });
    sqlite.prepare(`
      UPDATE streammonsters_matches SET round_number = 11 WHERE match_id = ?
    `).run(matchId);

    expect(service.submitChoice({
      userId:'viewer-a',
      choice:'B',
      eventId:'collapse-defense'
    })).toEqual(expect.objectContaining({
      handled:true,
      accepted:false,
      reason:'arena_collapse_defense_locked',
      feedback:{ messageKey:'arenaChoiceDefenseLocked' }
    }));
    expect(emit).toHaveBeenCalledWith(
      'streammonsters:battle_choice_rejected',
      expect.objectContaining({
        reason:'arena_collapse_defense_locked',
        messageKey:'arenaChoiceDefenseLocked'
      })
    );
  });

  test('Rules v7 materializes both charges at the second lock timestamp', () => {
    const { sqlite, service, matchId, advance, decisions } = createReservedRulesV7Match({
      chargeA: 95,
      chargeB: 70,
      openedAtMs: 10_000
    });
    advance(1_000);
    service.submitChoice({ userId: 'viewer-a', choice: 'C', eventId: 'v7-a' });
    service.submitChoice({ userId: 'viewer-b', choice: 'A', eventId: 'v7-b' });

    expect(decisions().map(decision => decision.charge_at_choice).sort((a, b) => a - b))
      .toEqual([75, 100]);
    const actions = sqlite.prepare(`
      SELECT action_json FROM streammonsters_match_actions
      WHERE match_id = ? ORDER BY sequence
    `).all(matchId).map(row => JSON.parse(row.action_json));
    expect(Object.fromEntries(actions.map(action => [action.actorId, action.before.actor.charge])))
      .toEqual({ 'alpha-v7': 100, 'beta-v7': 75 });
  });

  test('Rules v7 emits the Special-ready edge once when passive active time reaches 100', () => {
    const { emit, service, matchId, advance } = createReservedRulesV7Match({
      chargeA: 95,
      chargeB: 70,
      openedAtMs: 10_000
    });
    advance(1_000);

    service.emitSpecialReadyTransitions(service.getMatch(matchId), 11_000);
    service.emitSpecialReadyTransitions(service.getMatch(matchId), 12_000);

    const ready = emit.mock.calls.filter(([event]) => (
      event === 'streammonsters:battle_special_charged'
    ));
    expect(ready).toEqual([[
      'streammonsters:battle_special_charged',
      expect.objectContaining({
        matchId,
        round: 1,
        slot: 2,
        charge: 100,
        monsterId: 'alpha-v7',
        monster: expect.objectContaining({
          monster_id: 'alpha-v7',
          name: 'alpha-v7'
        })
      })
    ]]);
    expect(JSON.stringify(ready)).not.toContain('viewer-a');
  });

  test('Rules v7 subtracts explicit cinematic pause time from passive charge', () => {
    const { service, matchId, advance } = createReservedRulesV7Match({
      chargeA: 70,
      chargeB: 70,
      openedAtMs: 10_000
    });
    advance(2_000);
    service.pauseChargeClock(matchId, 'cinematic', 12_000);
    advance(4_000);
    const paused = service.getMatch(matchId);
    expect(paused).toEqual(expect.objectContaining({
      actionOpenedAtMs: 10_000,
      actionDeadlineMs: 18_000,
      chargePausedMs: 0,
      chargePauseStartedAtMs: 12_000,
      chargePauseUntilMs: null,
      chargePauseReason: 'cinematic'
    }));
    expect(paused.participants[1].combatState.charge).toBe(70);
    expect(service.projectParticipantCharge(paused.participants[1], paused, 16_000)).toBe(80);
    service.resumeChargeClock(matchId, 16_000);
    const resumed = service.getMatch(matchId);
    expect(service.projectParticipantCharge(resumed.participants[1], resumed, 17_000)).toBe(85);
  });

  test('Rules v7 snapshot Special readiness includes accumulated and open pause time', () => {
    const accumulated = createReservedRulesV7Match({
      chargeA: 70,
      chargeB: 70,
      openedAtMs: 10_000
    });
    accumulated.advance(2_000);
    accumulated.service.pauseChargeClock(accumulated.matchId, 'pause', 12_000);
    accumulated.advance(4_000);
    accumulated.service.resumeChargeClock(accumulated.matchId, 16_000);

    const resumed = accumulated.service.getMatch(accumulated.matchId);
    const resumedSnapshot = accumulated.service.getPublicSnapshot().matches[0];
    const resumedSpecial = resumedSnapshot.fighters
      .find(fighter => fighter.name === 'alpha-v7')
      .skills.find(skill => skill.choice === 'C');
    expect(resumedSnapshot.chargeWindow.pausedMs).toBe(4_000);
    expect(resumedSpecial.readyAtMs).toBe(20_000);
    const alpha = resumed.participants.find(participant => participant.viewerId === 'viewer-a');
    expect(accumulated.service.projectParticipantCharge(alpha, resumed, 19_000)).toBe(95);
    expect(accumulated.service.projectParticipantCharge(alpha, resumed, 20_000)).toBe(100);

    const open = createReservedRulesV7Match({
      chargeA: 90,
      chargeB: 70,
      openedAtMs: 30_000
    });
    open.advance(1_000);
    open.service.pauseChargeClock(open.matchId, 'reconnect', 31_000);
    const openSpecial = open.service.getPublicSnapshot().matches[0].fighters
      .find(fighter => fighter.name === 'alpha-v7')
      .skills.find(skill => skill.choice === 'C');
    expect(openSpecial).not.toHaveProperty('readyAtMs');
  });

  test('Rules v7 opens a fresh full eight-second choice window only after cinematic', () => {
    const { service, matchId, advance } = createReservedRulesV7Match({
      chargeA: 70,
      chargeB: 70,
      openedAtMs: 10_000
    });
    service.submitChoice({ userId: 'viewer-a', choice: 'A', eventId: 'cinematic-a' });
    service.submitChoice({ userId: 'viewer-b', choice: 'A', eventId: 'cinematic-b' });

    const cinematic = service.getMatch(matchId);
    expect(cinematic).toEqual(expect.objectContaining({
      state: 'action',
      roundNumber: 2,
      actionOpenedAtMs: null,
      actionDeadlineMs: null,
      chargePauseReason: 'cinematic',
      chargePauseUntilMs: expect.any(Number)
    }));
    expect(service.submitChoice({ userId: 'viewer-a', choice: 'A' }))
      .toEqual(expect.objectContaining({ handled: true, reason: 'no_active_window' }));

    advance(cinematic.chargePauseUntilMs - 10_000);
    service.sweep();
    const opened = service.getMatch(matchId);
    expect(opened.actionOpenedAtMs).toBe(cinematic.chargePauseUntilMs);
    expect(opened.actionDeadlineMs - opened.actionOpenedAtMs).toBe(8_000);
    expect(opened.chargePauseReason).toBeNull();
  });

  test('reconnect restoration closes its pause before returning the resumed snapshot', () => {
    const original = createReservedRulesV7Match({
      chargeA: 70,
      chargeB: 70,
      openedAtMs: 30_000
    });
    original.advance(1_000);
    const recovered = createMatchService({
      store: original.service.store,
      now: () => 31_000,
      rulesVersion: 7
    });

    const snapshot = recovered.getPublicSnapshot({ restoreReconnect: true });
    const restored = snapshot.matches.find(match => match.matchId === original.matchId);
    expect(restored.actionDeadlineMs).toBe(39_000);
    expect(restored.chargeWindow).toEqual(expect.objectContaining({
      openedAtMs: 30_000,
      deadlineMs: 39_000,
      pausedMs: 1_000
    }));
    expect(restored.chargeWindow).not.toHaveProperty('pauseStartedAtMs');
    expect(restored.chargeWindow).not.toHaveProperty('pauseReason');
  });

  test('auto-start sweep waits for reconnect restoration before timing out an expired Rules-v7 window', () => {
    jest.useFakeTimers();
    const original = createReservedRulesV7Match({
      chargeA: 70,
      chargeB: 70,
      openedAtMs: 30_000
    });
    original.advance(9_000);
    let recovered = null;
    try {
      recovered = createMatchService({
        store: original.service.store,
        now: () => 39_000,
        rulesVersion: 7,
        autoStart: true
      });

      expect(recovered.getMatch(original.matchId)).toEqual(expect.objectContaining({
        state: 'action',
        actionDeadlineMs: 38_000,
        chargePauseStartedAtMs: 30_000,
        chargePauseReason: 'reconnect'
      }));
      expect(recovered.safeSweep()).toEqual(expect.objectContaining({
        actionsExpired: 0
      }));
      expect(original.sqlite.prepare(`
        SELECT COUNT(*) AS count
        FROM streammonsters_match_decisions
        WHERE match_id = ? AND source = 'timeout'
      `).get(original.matchId).count).toBe(0);

      const restored = recovered.getPublicSnapshot({ restoreReconnect: true })
        .matches.find(match => match.matchId === original.matchId);
      expect(restored).toEqual(expect.objectContaining({
        state: 'action',
        actionDeadlineMs: 47_000
      }));
      expect(restored.chargeWindow).not.toHaveProperty('pauseReason');
    } finally {
      recovered?.destroy();
      jest.useRealTimers();
    }
  });

  test('Rules v7 timeout charge uses the persisted action deadline', () => {
    const { service, advance, decisions } = createReservedRulesV7Match({
      chargeA: 70,
      chargeB: 70,
      openedAtMs: 20_000
    });
    advance(60_000);
    expect(service.sweep().actionsExpired).toBe(1);
    expect(decisions().map(decision => decision.charge_at_choice)).toEqual([100, 100]);
  });

  test('Rules v7 reconstruction does not double passive charge mid-window', () => {
    const original = createReservedRulesV7Match({
      chargeA: 70,
      chargeB: 70,
      openedAtMs: 30_000
    });
    original.advance(1_000);
    const recovered = createMatchService({
      store: original.service.store,
      now: () => 31_000,
      rulesVersion: 7
    });
    expect(recovered.getActiveMatchForViewer('viewer-a').actionOpenedAtMs).toBe(30_000);
    recovered.submitChoice({ userId: 'viewer-a', choice: 'A', eventId: 'reload-a' });
    recovered.submitChoice({ userId: 'viewer-b', choice: 'A', eventId: 'reload-b' });
    expect(original.decisions().map(decision => decision.charge_at_choice)).toEqual([70, 70]);
  });

  test('applies Arena season duration changes without requiring a plugin reload', () => {
    const { store } = createStore();
    const nowMs = Date.parse('2026-07-21T12:00:00Z');
    const service = createMatchService({ store, now: () => nowMs });

    service.setSeasonDurationDays(14);
    const fortnight = service.getCurrentArenaSeason();
    expect(fortnight).toEqual(expect.objectContaining({ durationDays: 14 }));
    expect(fortnight.endsAtMs - fortnight.startsAtMs)
      .toBe(14 * 24 * 60 * 60 * 1000);

    service.setSeasonDurationDays(90);
    const long = service.getCurrentArenaSeason();
    expect(long).toEqual(expect.objectContaining({ durationDays: 90 }));
    expect(long.seasonId).not.toBe(fortnight.seasonId);
  });

  test('has a dedicated persistent state-machine owner', () => {
    expect(() => require(
      '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
    )).not.toThrow();
  });

  test('atomically reserves two queued viewers and reconstructs the active roster window', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'alpha', userId: 'viewer-a', level: 5 });
    insertMonster(sqlite, {
      id: 'beta',
      userId: 'viewer-b',
      level: 7,
      element: 'Tide',
      templateId: 'ripple'
    });
    let nowMs = 10_000;
    const first = createMatchService({ store, now: () => nowMs });
    expect(first.join({ userId: 'viewer-a' })).toEqual(expect.objectContaining({
      status: 'queued'
    }));

    const joined = first.join({ userId: 'viewer-b' });
    expect(joined).toEqual(expect.objectContaining({
      status: 'reserved',
      match: expect.objectContaining({
        state: 'roster',
        rosterDeadlineMs: 25_000
      })
    }));
    expect(store.getBattleQueue()).toEqual([]);
    expect(sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_match_participants
      WHERE match_id = ? AND active = 1
    `).get(joined.match.matchId).count).toBe(2);

    const recovered = createMatchService({ store, now: () => nowMs });
    expect(recovered.getActiveMatchForViewer('viewer-a')).toEqual(
      expect.objectContaining({
        matchId: joined.match.matchId,
        state: 'roster',
        rosterDeadlineMs: 25_000
      })
    );
    expect(() => first.join({ userId: 'viewer-a' })).not.toThrow();
    expect(first.join({ userId: 'viewer-a' })).toEqual(expect.objectContaining({
      status: 'active',
      match: expect.objectContaining({ matchId: joined.match.matchId })
    }));
  });

  test('prevents a viewer from queueing a low-level monster and swapping to an unfair roster', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'fair-anchor-a',
      userId: 'viewer-fair-a',
      level: 1
    });
    insertMonster(sqlite, {
      id: 'fair-swap-a',
      userId: 'viewer-fair-a',
      level: 20,
      selected: false
    });
    insertMonster(sqlite, {
      id: 'fair-anchor-b',
      userId: 'viewer-fair-b',
      level: 1,
      element: 'Tide',
      templateId: 'ripple'
    });
    const service = createMatchService({ store, now: () => 10_000 });
    service.join({ userId: 'viewer-fair-a' });
    const joined = service.join({ userId: 'viewer-fair-b' });

    expect(joined.status).toBe('reserved');
    expect(service.lockRoster({
      userId: 'viewer-fair-a',
      monsterId: 'fair-swap-a'
    })).toEqual(expect.objectContaining({
      accepted: false,
      reason: 'monster_out_of_match_range',
      allowedLevelGap: 2
    }));
    expect(service.lockRoster({
      userId: 'viewer-fair-a',
      monsterId: 'fair-anchor-a'
    })).toEqual(expect.objectContaining({ accepted: true }));
  });

  test('lets either participant cancel during roster selection exactly once without rewards', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'cancel-a', userId: 'viewer-cancel-a' });
    insertMonster(sqlite, {
      id: 'cancel-b',
      userId: 'viewer-cancel-b',
      element: 'Tide',
      templateId: 'ripple'
    });
    const emit = jest.fn();
    const service = createMatchService({ store, now: () => 1_000, emit });
    service.join({ userId: 'viewer-cancel-a' });
    const joined = service.join({ userId: 'viewer-cancel-b' });

    expect(service.cancelBeforeBattle('viewer-cancel-b')).toEqual({
      cancelled: true,
      matchId: joined.match.matchId
    });
    expect(service.cancelBeforeBattle('viewer-cancel-a')).toEqual({
      cancelled: false,
      reason: 'no_roster_match'
    });
    expect(service.getMatch(joined.match.matchId)).toEqual(
      expect.objectContaining({ state: 'cancelled' })
    );
    expect(service.getActiveMatchForViewer('viewer-cancel-a')).toBeNull();
    expect(sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_match_rewards WHERE match_id = ?
    `).get(joined.match.matchId).count).toBe(0);
    expect(emit.mock.calls.filter(([event]) => (
      event === 'streammonsters:battle_cancelled'
    ))).toHaveLength(1);
  });

  test('dry-runs and idempotently cancels only stale roster or action matches without rewards', () => {
    const { sqlite, store } = createStore();
    [
      ['repair-a', 'viewer-repair-a', 'Ember', 'ashfang'],
      ['repair-b', 'viewer-repair-b', 'Tide', 'ripple'],
      ['repair-c', 'viewer-repair-c', 'Grove', 'oakheart'],
      ['repair-d', 'viewer-repair-d', 'Gale', 'zephyr']
    ].forEach(([id, userId, element, templateId]) => insertMonster(sqlite, {
      id,
      userId,
      element,
      templateId
    }));
    let nowMs = 1_000;
    const service = createMatchService({ store, now: () => nowMs });
    service.join({ userId: 'viewer-repair-a' });
    const actionMatch = service.join({ userId: 'viewer-repair-b' }).match;
    service.lockRoster({ userId: 'viewer-repair-a' });
    service.lockRoster({ userId: 'viewer-repair-b' });
    service.join({ userId: 'viewer-repair-c' });
    const rosterMatch = service.join({ userId: 'viewer-repair-d' }).match;

    nowMs = 100_000;
    expect(service.repairStaleMatches({ dryRun: true, graceMs: 60_000 }))
      .toEqual({ dryRun: true, candidates: 2, cancelled: 0 });
    expect(service.getMatch(actionMatch.matchId).state).toBe('action');
    expect(service.getMatch(rosterMatch.matchId).state).toBe('roster');

    expect(service.repairStaleMatches({ dryRun: false, graceMs: 60_000 }))
      .toEqual({ dryRun: false, candidates: 2, cancelled: 2 });
    expect(service.getMatch(actionMatch.matchId).state).toBe('cancelled');
    expect(service.getMatch(rosterMatch.matchId).state).toBe('cancelled');
    expect(service.repairStaleMatches({ dryRun: false, graceMs: 60_000 }))
      .toEqual({ dryRun: false, candidates: 0, cancelled: 0 });
    expect(sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_match_rewards
    `).get().count).toBe(0);
  });

  test('deduplicates concurrent locks from real worker threads using separate SQLite connections', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-v5-'));
    const filename = path.join(tempDir, 'matches.sqlite');
    const { sqlite, store } = createStore(filename);
    try {
      insertMonster(sqlite, { id: 'alpha', userId: 'viewer-a' });
      insertMonster(sqlite, {
        id: 'beta',
        userId: 'viewer-b',
        element: 'Tide',
        templateId: 'ripple'
      });
      const service = createMatchService({ store, now: () => 1_000 });
      service.join({ userId: 'viewer-a' });
      const joined = service.join({ userId: 'viewer-b' });
      service.lockRoster({ userId: 'viewer-a' });
      service.lockRoster({ userId: 'viewer-b' });

      const workerSource = `
        const { parentPort, workerData } = require('worker_threads');
        const Database = require(workerData.sqliteModule);
        const Store = require(workerData.storeModule);
        const MatchService = require(workerData.serviceModule);
        const sqlite = new Database(workerData.filename);
        sqlite.pragma('busy_timeout = 5000');
        const store = new Store(sqlite);
        const service = new MatchService({
          store,
          battleService: {},
          now: () => 1000,
          autoStart: false
        });
        const result = service.submitChoice(workerData.choice);
        sqlite.close();
        parentPort.postMessage(result);
      `;
      const modules = {
        filename,
        sqliteModule: require.resolve('better-sqlite3'),
        storeModule: require.resolve(
          '../plugins/streamalchemy/backend/streammonsters/database'
        ),
        serviceModule: require.resolve(
          '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
        )
      };
      const runWorker = choice => new Promise((resolve, reject) => {
        const worker = new Worker(workerSource, {
          eval: true,
          workerData: { ...modules, choice }
        });
        worker.once('message', resolve);
        worker.once('error', reject);
      });

      const results = await Promise.all([
        runWorker({ userId: 'viewer-a', choice: 'A', eventId: 'concurrent-a' }),
        runWorker({ userId: 'viewer-a', choice: 'B', eventId: 'concurrent-b' })
      ]);

      expect(results.filter(result => result.accepted !== false && result.handled))
        .toHaveLength(1);
      expect(results.filter(result => result.reason === 'already_locked')).toHaveLength(1);
      expect(sqlite.prepare(`
        SELECT COUNT(*) AS count FROM streammonsters_match_decisions
        WHERE match_id = ? AND participant_id = ?
          AND window_kind = 'action' AND window_sequence = 1
      `).get(
        joined.match.matchId,
        joined.match.participants.find(entry => entry.viewerId === 'viewer-a').participantId
      ).count).toBe(1);
    } finally {
      sqlite.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('atomically turns a real two-connection queue race into exactly one reservation', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-queue-race-'));
    const filename = path.join(tempDir, 'matches.sqlite');
    const { sqlite } = createStore(filename);
    const workers = [];
    try {
      insertMonster(sqlite, { id: 'alpha', userId: 'viewer-a', level: 5 });
      insertMonster(sqlite, {
        id: 'beta',
        userId: 'viewer-b',
        level: 5,
        element: 'Tide',
        templateId: 'ripple'
      });
      const gate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
      const workerSource = `
        const { parentPort, workerData } = require('worker_threads');
        const Database = require(workerData.sqliteModule);
        const Store = require(workerData.storeModule);
        const MatchService = require(workerData.serviceModule);
        const BattleService = require(workerData.battleModule);
        const gate = new Int32Array(workerData.gate);
        const sqlite = new Database(workerData.filename);
        sqlite.pragma('busy_timeout = 5000');
        const store = new Store(sqlite);
        const service = new MatchService({
          store,
          battleService: new BattleService({ store }),
          now: () => 1000,
          autoStart: false
        });
        parentPort.postMessage({ ready: true });
        Atomics.wait(gate, 0, 0);
        const result = service.join({ userId: workerData.userId });
        sqlite.close();
        parentPort.postMessage({ result });
      `;
      const modules = {
        filename,
        gate,
        sqliteModule: require.resolve('better-sqlite3'),
        storeModule: require.resolve(
          '../plugins/streamalchemy/backend/streammonsters/database'
        ),
        serviceModule: require.resolve(
          '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
        ),
        battleModule: require.resolve(
          '../plugins/streamalchemy/backend/streammonsters/battle-service'
        )
      };
      const startWorker = userId => {
        const worker = new Worker(workerSource, {
          eval: true,
          workerData: { ...modules, userId }
        });
        workers.push(worker);
        return new Promise((resolve, reject) => {
          worker.once('message', ready => {
            if (!ready.ready) reject(new Error('worker_not_ready'));
            else resolve();
          });
          worker.once('error', reject);
        });
      };
      await Promise.all([startWorker('viewer-a'), startWorker('viewer-b')]);
      const results = workers.map(worker => new Promise((resolve, reject) => {
        worker.once('message', message => resolve(message.result));
        worker.once('error', reject);
      }));
      const gateView = new Int32Array(gate);
      Atomics.store(gateView, 0, 1);
      Atomics.notify(gateView, 0, workers.length);
      const joined = await Promise.all(results);

      expect(joined.map(result => result.status).sort()).toEqual(['queued', 'reserved']);
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM streammonsters_matches').get().count)
        .toBe(1);
      expect(sqlite.prepare(`
        SELECT COUNT(*) AS count FROM streammonsters_match_participants WHERE active = 1
      `).get().count).toBe(2);
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM streammonsters_battle_queue')
        .get().count).toBe(0);
    } finally {
      await Promise.all(workers.map(worker => worker.terminate()));
      sqlite.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('widens beyond +/-2 only after 30s and avoids a closer recent rematch', () => {
    const { sqlite, store } = createStore();
    [
      ['target', 'viewer-target', 8],
      ['near', 'viewer-near', 11],
      ['far', 'viewer-far', 11],
      ['rematch', 'viewer-rematch', 11]
    ].forEach(([id, userId, level]) => insertMonster(sqlite, { id, userId, level }));
    let nowMs = 100_000;
    const service = createMatchService({ store, now: () => nowMs });
    const season = service.getCurrentArenaSeason();
    service.setArenaRating(season.seasonId, 'viewer-target', 1000);
    service.setArenaRating(season.seasonId, 'viewer-near', 1010);
    service.setArenaRating(season.seasonId, 'viewer-far', 1200);
    service.setArenaRating(season.seasonId, 'viewer-rematch', 1005);
    store.enqueueBattle({
      userId: 'viewer-near',
      monsterId: 'near',
      stance: 'adaptive',
      queuedAtMs: nowMs
    });
    store.enqueueBattle({
      userId: 'viewer-far',
      monsterId: 'far',
      stance: 'adaptive',
      queuedAtMs: nowMs
    });
    store.enqueueBattle({
      userId: 'viewer-rematch',
      monsterId: 'rematch',
      stance: 'adaptive',
      queuedAtMs: nowMs - 1_000
    });
    sqlite.prepare(`
      INSERT INTO streammonsters_battles (
        battle_id, seed, monster_a_id, monster_b_id, winner_monster_id,
        user_a_id, user_b_id, result_json, created_at_ms
      ) VALUES ('old-rematch', 'old', 'target', 'rematch', 'target', ?, ?, '{}', ?)
    `).run('viewer-target', 'viewer-rematch', nowMs - 60_000);

    const queued = service.join({ userId: 'viewer-target' });
    expect(queued.status).toBe('queued');
    nowMs += 30_000;
    const result = service.reserveBestMatch('viewer-target');

    expect(result.participants.map(participant => participant.viewerId)).toEqual(
      expect.arrayContaining(['viewer-target', 'viewer-near'])
    );
  });

  test('widens the Arena rating band every 30 seconds and rematches queued viewers on sweep', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'rated-a', userId: 'viewer-rated-a', level: 5 });
    insertMonster(sqlite, {
      id: 'rated-b',
      userId: 'viewer-rated-b',
      level: 5,
      element: 'Tide',
      templateId: 'ripple'
    });
    let nowMs = 10_000;
    const service = createMatchService({ store, now: () => nowMs });
    const season = service.getCurrentArenaSeason();
    service.setArenaRating(season.seasonId, 'viewer-rated-a', 900);
    service.setArenaRating(season.seasonId, 'viewer-rated-b', 1_250);

    expect(service.join({ userId: 'viewer-rated-a' }).status).toBe('queued');
    expect(service.join({ userId: 'viewer-rated-b' }).status).toBe('queued');
    expect(store.getBattleQueue()).toHaveLength(2);

    nowMs += 60_000;
    expect(service.sweep()).toEqual(expect.objectContaining({ matchesReserved: 1 }));
    expect(store.getBattleQueue()).toEqual([]);
    expect(service.getActiveMatchForViewer('viewer-rated-a')).toEqual(
      expect.objectContaining({ state: 'roster' })
    );
  });

  test('reload preserves a persistent queue until the concrete stream identity can recover it', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'reload-a', userId: 'viewer-reload-a' });
    insertMonster(sqlite, {
      id: 'reload-b',
      userId: 'viewer-reload-b',
      element: 'Tide',
      templateId: 'ripple'
    });
    const nowMs = 1_000_000;
    store.enqueueBattle({
      userId: 'viewer-reload-a',
      monsterId: 'reload-a',
      stance: 'adaptive',
      streamKey: 'stream-live',
      queuedAtMs: nowMs - 1_000
    });
    store.enqueueBattle({
      userId: 'viewer-reload-b',
      monsterId: 'reload-b',
      stance: 'adaptive',
      streamKey: 'stream-live',
      queuedAtMs: nowMs - 500
    });

    let activeStreamKey = null;
    const service = createMatchService({
      store,
      now: () => nowMs,
      getStreamKey: () => activeStreamKey,
      autoStart: true
    });
    try {
      expect(store.getBattleQueue().map(entry => entry.user_id)).toEqual([
        'viewer-reload-a',
        'viewer-reload-b'
      ]);
      expect(service.getActiveMatchForViewer('viewer-reload-a')).toBeNull();
      expect(service.safeSweep()).toEqual(expect.objectContaining({
        matchesReserved: 0,
        queuePurged: 0
      }));
      activeStreamKey = 'stream-live';
      expect(service.safeSweep()).toEqual(expect.objectContaining({
        matchesReserved: 1,
        queuePurged: 0
      }));
      expect(store.getBattleQueue()).toEqual([]);
      expect(service.getActiveMatchForViewer('viewer-reload-a')).toEqual(
        expect.objectContaining({ state: 'roster' })
      );
    } finally {
      service.destroy();
    }
  });

  test('a resolved stream sweep purges and recovers only its matching queue rows', () => {
    const { sqlite, store } = createStore();
    [
      ['stale-current', 'viewer-stale-current', 'Ember', 'ashfang'],
      ['current-a', 'viewer-current-a', 'Tide', 'ripple'],
      ['current-b', 'viewer-current-b', 'Grove', 'oakheart'],
      ['foreign-a', 'viewer-foreign-a', 'Gale', 'zephyr'],
      ['foreign-b', 'viewer-foreign-b', 'Volt', 'pulse']
    ].forEach(([id, userId, element, templateId]) => insertMonster(sqlite, {
      id,
      userId,
      element,
      templateId
    }));
    const nowMs = 1_000_000;
    store.enqueueBattle({
      userId: 'viewer-stale-current',
      monsterId: 'stale-current',
      stance: 'adaptive',
      streamKey: 'stream-current',
      queuedAtMs: nowMs - (11 * 60 * 1000)
    });
    store.enqueueBattle({
      userId: 'viewer-current-a',
      monsterId: 'current-a',
      stance: 'adaptive',
      streamKey: 'stream-current',
      queuedAtMs: nowMs - 1_000
    });
    store.enqueueBattle({
      userId: 'viewer-current-b',
      monsterId: 'current-b',
      stance: 'adaptive',
      streamKey: 'stream-current',
      queuedAtMs: nowMs - 500
    });
    store.enqueueBattle({
      userId: 'viewer-foreign-a',
      monsterId: 'foreign-a',
      stance: 'adaptive',
      streamKey: 'stream-foreign',
      queuedAtMs: nowMs - 900
    });
    store.enqueueBattle({
      userId: 'viewer-foreign-b',
      monsterId: 'foreign-b',
      stance: 'adaptive',
      streamKey: 'stream-foreign',
      queuedAtMs: nowMs - 400
    });
    const service = createMatchService({
      store,
      now: () => nowMs,
      getStreamKey: () => 'stream-current'
    });

    expect(service.sweep()).toEqual(expect.objectContaining({
      matchesReserved: 1,
      queuePurged: 1
    }));
    expect(store.getBattleQueue().map(entry => entry.user_id)).toEqual([
      'viewer-foreign-a',
      'viewer-foreign-b'
    ]);
    expect(service.getActiveMatchForViewer('viewer-current-a')).toEqual(
      expect.objectContaining({ state: 'roster' })
    );
    expect(service.getActiveMatchForViewer('viewer-foreign-a')).toBeNull();
  });

  test('locks roster snapshots, accepts only the first authorized A/B/C and resolves both-ready immediately', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'alpha',
      userId: 'viewer-a',
      stats: { vitality: 10, might: 30, guard: 10, agility: 30 }
    });
    insertMonster(sqlite, {
      id: 'beta',
      userId: 'viewer-b',
      element: 'Tide',
      templateId: 'ripple',
      stats: { vitality: 10, might: 10, guard: 10, agility: 1 }
    });
    let nowMs = 1_000;
    const service = createMatchService({ store, now: () => nowMs });
    service.join({ userId: 'viewer-a' });
    const { match } = service.join({ userId: 'viewer-b' });

    expect(service.lockRoster({ userId: 'viewer-a' })).toEqual(
      expect.objectContaining({ accepted: true, waiting: true })
    );
    expect(service.lockRoster({ userId: 'viewer-b' })).toEqual(
      expect.objectContaining({
        accepted: true,
        match: expect.objectContaining({
          state: 'action',
          roundNumber: 1,
          actionDeadlineMs: 9_000
        })
      })
    );
    expect(service.submitChoice({
      userId: 'bystander',
      choice: 'A',
      eventId: 'foreign'
    })).toEqual({ handled: false, reason: 'no_active_window' });
    expect(service.submitChoice({
      userId: 'viewer-a',
      choice: 'A',
      eventId: 'choice-a'
    })).toEqual(expect.objectContaining({ handled: true, waiting: true }));
    expect(service.submitChoice({
      userId: 'viewer-a',
      choice: 'B',
      eventId: 'choice-a-duplicate'
    })).toEqual(expect.objectContaining({
      handled: true,
      accepted: false,
      reason: 'already_locked'
    }));

    const ready = service.submitChoice({
      userId: 'viewer-b',
      choice: 'B',
      eventId: 'choice-b'
    });
    expect(ready).toEqual(expect.objectContaining({
      handled: true,
      waiting: false,
      match: expect.objectContaining({ roundNumber: 2 })
    }));
    expect(sqlite.prepare(`
      SELECT sequence FROM streammonsters_match_actions
      WHERE match_id = ? ORDER BY sequence
    `).all(match.matchId).map(row => row.sequence)).toEqual([1, 2]);
    expect(service.submitChoice({
      userId: 'viewer-b',
      choice: 'B',
      eventId: 'choice-b'
    })).toEqual(expect.objectContaining({
      handled: true,
      accepted: false,
      reason: 'duplicate_event'
    }));
    nowMs = 10_001;
    expect(service.submitChoice({
      userId: 'viewer-a',
      choice: 'A',
      eventId: 'late-round-two'
    })).toEqual(expect.objectContaining({
      handled: true,
      accepted: false,
      reason: 'no_active_window'
    }));
  });

  test('recovers expired roster/action windows deterministically and clears its timer on destroy', () => {
    jest.useFakeTimers();
    try {
      const { sqlite, store } = createStore();
      insertMonster(sqlite, { id: 'alpha', userId: 'viewer-a' });
      insertMonster(sqlite, {
        id: 'beta',
        userId: 'viewer-b',
        element: 'Tide',
        templateId: 'ripple'
      });
      let nowMs = 1_000;
      const service = new BattleMatchService({
        store,
        battleService: new BattleService({ store, now: () => nowMs }),
        now: () => nowMs,
        sweepIntervalMs: 500,
        autoStart: true
      });
      service.join({ userId: 'viewer-a' });
      const joined = service.join({ userId: 'viewer-b' });
      nowMs = 16_001;
      expect(service.sweep()).toEqual(expect.objectContaining({
        rosterExpired: 1
      }));
      expect(service.getMatch(joined.match.matchId)).toEqual(
        expect.objectContaining({ state: 'action', roundNumber: 1 })
      );
      nowMs = 24_002;
      expect(service.sweep()).toEqual(expect.objectContaining({
        actionsExpired: 1
      }));
      const decisions = sqlite.prepare(`
        SELECT source, choice FROM streammonsters_match_decisions
        WHERE match_id = ? AND window_kind = 'action'
        ORDER BY participant_id
      `).all(joined.match.matchId);
      expect(decisions).toHaveLength(2);
      expect(decisions.every(decision => decision.source === 'timeout')).toBe(true);
      const replay = service.getPublicNormalizedReplay(joined.match.matchId);
      expect(replay.decisions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          round: 1,
          slot: expect.any(Number),
          locked: true,
          source: 'timeout',
          deadlineMs: 24_001
        })
      ]));
      expect(JSON.stringify(replay.decisions)).not.toMatch(/choice|participantId|viewerId/);
      expect(replay.reveals[0].choices).toEqual(expect.arrayContaining([
        expect.objectContaining({
          choice: expect.stringMatching(/^[ABC]$/),
          source: 'timeout'
        })
      ]));

      expect(jest.getTimerCount()).toBeGreaterThan(0);
      service.destroy();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test('isolates stale roster and callback failures so timer recovery continues and cleans up', () => {
    jest.useFakeTimers();
    const errors = [];
    try {
      const { sqlite, store } = createStore(':memory:', {
        logger: { error: message => errors.push(String(message)) }
      });
      [
        ['stale-a', 'viewer-stale-a', 'Ember', 'ashfang'],
        ['stale-b', 'viewer-stale-b', 'Tide', 'ripple'],
        ['healthy-a', 'viewer-healthy-a', 'Grove', 'oakheart'],
        ['healthy-b', 'viewer-healthy-b', 'Gale', 'zephyr']
      ].forEach(([id, userId, element, templateId]) => insertMonster(sqlite, {
        id,
        userId,
        element,
        templateId
      }));
      let nowMs = 1_000;
      const service = createMatchService({
        store,
        now: () => nowMs,
        logger: { error: message => errors.push(String(message)) },
        emit: () => {
          throw new Error('socket unavailable');
        },
        autoStart: true
      });
      service.join({ userId: 'viewer-stale-a' });
      const stale = service.join({ userId: 'viewer-stale-b' }).match;
      service.join({ userId: 'viewer-healthy-a' });
      const healthy = service.join({ userId: 'viewer-healthy-b' }).match;
      sqlite.prepare(`
        DELETE FROM streammonsters_monsters
        WHERE monster_id IN ('stale-a', 'stale-b')
      `).run();

      nowMs = 16_000;
      expect(() => jest.advanceTimersByTime(1_000)).not.toThrow();
      expect(service.getMatch(stale.matchId)).toEqual(expect.objectContaining({
        state: 'cancelled'
      }));
      expect(service.getMatch(healthy.matchId)).toEqual(expect.objectContaining({
        state: 'action',
        roundNumber: 1
      }));
      expect(errors.join('\n')).toContain('socket unavailable');

      const originalRecovery = service.recoverActionMatch.bind(service);
      let injected = false;
      service.recoverActionMatch = matchId => {
        if (!injected) {
          injected = true;
          throw new Error(`injected recovery failure:${matchId}`);
        }
        return originalRecovery(matchId);
      };
      nowMs = 24_000;
      expect(() => jest.advanceTimersByTime(1_000)).not.toThrow();
      expect(errors.join('\n')).toContain('injected recovery failure');

      expect(jest.getTimerCount()).toBeGreaterThan(0);
      service.destroy();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test('uses an exclusive roster/action/stat deadline consistently across two connections', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-deadline-'));
    const filename = path.join(tempDir, 'matches.sqlite');
    const primary = createStore(filename);
    const secondary = createStore(filename);
    try {
      insertMonster(primary.sqlite, { id: 'alpha', userId: 'viewer-a' });
      insertMonster(primary.sqlite, {
        id: 'beta',
        userId: 'viewer-b',
        element: 'Tide',
        templateId: 'ripple'
      });
      let nowMs = 1_000;
      const submitter = createMatchService({
        store: primary.store,
        now: () => nowMs
      });
      const sweeper = createMatchService({
        store: secondary.store,
        now: () => nowMs
      });
      submitter.join({ userId: 'viewer-a' });
      const joined = submitter.join({ userId: 'viewer-b' });
      submitter.lockRoster({ userId: 'viewer-a' });

      nowMs = joined.match.rosterDeadlineMs;
      expect(submitter.lockRoster({ userId: 'viewer-b' })).toEqual({
        accepted: false,
        reason: 'no_roster_window'
      });
      expect(sweeper.sweep().rosterExpired).toBe(1);
      const actionMatch = sweeper.getMatch(joined.match.matchId);
      expect(actionMatch.state).toBe('action');

      nowMs = actionMatch.actionDeadlineMs;
      expect(submitter.submitChoice({
        userId: 'viewer-a',
        choice: 'A',
        eventId: 'deadline-action'
      })).toEqual(expect.objectContaining({
        handled: true,
        accepted: false,
        reason: 'no_active_window'
      }));
      expect(sweeper.sweep().actionsExpired).toBe(1);
      expect(primary.sqlite.prepare(`
        SELECT COUNT(*) AS count FROM streammonsters_match_decisions
        WHERE match_id = ? AND source = 'timeout'
      `).get(joined.match.matchId).count).toBe(2);

      primary.sqlite.prepare(`
        UPDATE streammonsters_monsters
        SET unspent_stat_points = 1
        WHERE monster_id = 'alpha'
      `).run();
      const participant = sweeper.getMatch(joined.match.matchId).participants
        .find(entry => entry.viewerId === 'viewer-a');
      const prompt = sweeper.createStatPrompt(joined.match.matchId, participant, 1);
      nowMs = prompt.deadline_ms;
      expect(submitter.submitStatChoice({
        userId: 'viewer-a',
        choice: '2',
        eventId: 'deadline-stat'
      })).toEqual({ handled: false, reason: 'no_stat_window' });
      expect(sweeper.sweep().statsExpired).toBe(1);
    } finally {
      primary.sqlite.close();
      secondary.sqlite.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('awards both legitimate fighters permanent XP exactly once while Arena rating stops after ten daily battles', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'winner',
      userId: 'viewer-winner',
      stats: { vitality: 10, might: 80, guard: 10, agility: 80 }
    });
    insertMonster(sqlite, {
      id: 'loser',
      userId: 'viewer-loser',
      element: 'Tide',
      templateId: 'ripple',
      stats: { vitality: 1, might: 1, guard: 0, agility: 1 }
    });
    const nowMs = Date.UTC(2026, 6, 26, 12);
    const collection = { recordBattleOutcome: jest.fn() };
    const service = createMatchService({
      store,
      now: () => nowMs,
      collection
    });
    const season = service.getCurrentArenaSeason();
    sqlite.prepare(`
      INSERT INTO streammonsters_arena_daily_ledger (viewer_id, day_key, rated_battles)
      VALUES (?, '2026-07-26', 10), (?, '2026-07-26', 10)
    `).run('viewer-winner', 'viewer-loser');
    service.join({ userId: 'viewer-winner' });
    const joined = service.join({ userId: 'viewer-loser' });
    service.lockRoster({ userId: 'viewer-winner' });
    service.lockRoster({ userId: 'viewer-loser' });
    service.submitChoice({ userId: 'viewer-winner', choice: 'A', eventId: 'win-a' });
    const completed = service.submitChoice({
      userId: 'viewer-loser',
      choice: 'A',
      eventId: 'lose-a'
    }).match;

    expect(completed.state).toBe('completed');
    expect(store.getMonster('winner').xp).toBe(15);
    expect(store.getMonster('loser').xp).toBe(10);
    expect(service.getArenaRating(season.seasonId, 'viewer-winner').rating).toBe(900);
    expect(service.getArenaRating(season.seasonId, 'viewer-loser').rating).toBe(900);
    expect(sqlite.prepare(`
      SELECT xp_awarded, arena_eligible FROM streammonsters_match_rewards
      WHERE match_id = ? ORDER BY xp_awarded DESC
    `).all(joined.match.matchId)).toEqual([
      { xp_awarded: 15, arena_eligible: 0 },
      { xp_awarded: 10, arena_eligible: 0 }
    ]);

    expect(service.finalize(
      joined.match.matchId,
      completed.phaseVersion - 1,
      'winner'
    )).toEqual(expect.objectContaining({ state: 'completed' }));
    expect(store.getMonster('winner').xp).toBe(15);
    expect(store.getMonster('loser').xp).toBe(10);
    expect(sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_match_rewards WHERE match_id = ?
    `).get(joined.match.matchId).count).toBe(2);
    expect(collection.recordBattleOutcome).toHaveBeenCalledTimes(1);
    expect(store.getViewerProgress('viewer-winner').battles_won).toBe(1);
  });

  test('records and emits zero applied XP for level-20 fighters', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'capped-winner',
      userId: 'viewer-capped-winner',
      level: 20,
      stats: { vitality: 10, might: 80, guard: 10, agility: 80 }
    });
    insertMonster(sqlite, {
      id: 'capped-loser',
      userId: 'viewer-capped-loser',
      level: 20,
      element: 'Tide',
      templateId: 'ripple',
      stats: { vitality: 1, might: 1, guard: 0, agility: 1 }
    });
    const emit = jest.fn();
    const service = createMatchService({ store, now: () => 1_000, emit });
    service.join({ userId: 'viewer-capped-winner' });
    const joined = service.join({ userId: 'viewer-capped-loser' });
    service.lockRoster({ userId: 'viewer-capped-winner' });
    service.lockRoster({ userId: 'viewer-capped-loser' });
    const active = service.getMatch(joined.match.matchId);
    const completed = service.finalize(
      joined.match.matchId,
      active.phaseVersion,
      'capped-winner'
    );

    expect(completed.state).toBe('completed');
    expect(sqlite.prepare(`
      SELECT xp_awarded FROM streammonsters_match_rewards
      WHERE match_id = ? ORDER BY participant_id
    `).all(joined.match.matchId)).toEqual([
      { xp_awarded: 0 },
      { xp_awarded: 0 }
    ]);
    expect(emit.mock.calls
      .filter(([event]) => event === 'streammonsters:monster_xp_awarded')
      .map(([, payload]) => payload.amount)).toEqual([0, 0]);
    expect(store.getMonster('capped-winner')).toEqual(
      expect.objectContaining({ level: 20, xp: 0, unspent_stat_points: 0 })
    );
    expect(store.getMonster('capped-loser')).toEqual(
      expect.objectContaining({ level: 20, xp: 0, unspent_stat_points: 0 })
    );
  });

  test('advances battle quests and achievements once without duplicating v5 battle XP', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'winner',
      userId: 'viewer-winner',
      stats: { vitality: 10, might: 80, guard: 10, agility: 80 }
    });
    insertMonster(sqlite, {
      id: 'loser',
      userId: 'viewer-loser',
      element: 'Tide',
      templateId: 'ripple',
      stats: { vitality: 1, might: 1, guard: 0, agility: 1 }
    });
    store.ensureViewer('viewer-winner');
    sqlite.prepare(`
      UPDATE streammonsters_monsters SET battle_count = 9 WHERE monster_id = 'winner'
    `).run();
    sqlite.prepare(`
      UPDATE streammonsters_viewer_progress
      SET battle_win_streak = 4, best_battle_win_streak = 4
      WHERE user_id = 'viewer-winner'
    `).run();
    const nowDate = new Date('2026-07-26T12:00:00Z');
    const progression = new ProgressionService({
      store,
      now: () => nowDate
    });
    store.setQuestProgress({
      userId: 'viewer-winner',
      periodKey: progression.weekKey(),
      questKey: 'weekly:battle',
      title: 'Fight a battle',
      target: 10,
      progress: 10
    });
    const service = createMatchService({
      store,
      now: () => nowDate.getTime(),
      progression
    });
    service.join({ userId: 'viewer-winner' });
    const joined = service.join({ userId: 'viewer-loser' });
    service.lockRoster({ userId: 'viewer-winner' });
    service.lockRoster({ userId: 'viewer-loser' });
    service.submitChoice({ userId: 'viewer-winner', choice: 'A', eventId: 'quest-a' });
    const completed = service.submitChoice({
      userId: 'viewer-loser',
      choice: 'A',
      eventId: 'quest-b'
    }).match;

    expect(store.getMonster('winner')).toEqual(expect.objectContaining({
      xp: 15,
      battle_count: 10
    }));
    expect(store.getMonster('loser')).toEqual(expect.objectContaining({
      xp: 10,
      battle_count: 1
    }));
    expect(store.getViewerQuests('viewer-loser', progression.weekKey()))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ quest_key: 'weekly:battle', progress: 1 })
      ]));
    expect(store.getViewerAchievements('viewer-winner').map(item => item.achievement_key))
      .toEqual(expect.arrayContaining(['10_battles', 'five_win_streak']));

    service.finalize(joined.match.matchId, completed.phaseVersion - 1, 'winner');
    expect(store.getViewerQuests('viewer-loser', progression.weekKey())
      .find(quest => quest.quest_key === 'weekly:battle').progress).toBe(1);
    expect(store.getViewerAchievements('viewer-winner').filter(item => (
      ['10_battles', 'five_win_streak'].includes(item.achievement_key)
    ))).toHaveLength(2);
    expect(store.getMonster('winner').xp).toBe(15);
    expect(store.getMonster('loser').xp).toBe(10);
  });

  test('uses K32 Arena Elo and exact tiers only inside the separate daily ledger', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'winner',
      userId: 'viewer-winner',
      stats: { vitality: 10, might: 80, guard: 10, agility: 80 }
    });
    insertMonster(sqlite, {
      id: 'loser',
      userId: 'viewer-loser',
      element: 'Tide',
      templateId: 'ripple',
      stats: { vitality: 1, might: 1, guard: 0, agility: 1 }
    });
    const nowMs = Date.UTC(2026, 6, 26, 12);
    const service = createMatchService({ store, now: () => nowMs });
    const season = service.getCurrentArenaSeason();
    service.join({ userId: 'viewer-winner' });
    service.join({ userId: 'viewer-loser' });
    service.lockRoster({ userId: 'viewer-winner' });
    service.lockRoster({ userId: 'viewer-loser' });
    service.submitChoice({ userId: 'viewer-winner', choice: 'A', eventId: 'rated-a' });
    service.submitChoice({ userId: 'viewer-loser', choice: 'A', eventId: 'rated-b' });

    expect(service.getArenaRating(season.seasonId, 'viewer-winner')).toEqual(
      expect.objectContaining({ rating: 916, tier: 'Bronze', battlesRated: 1 })
    );
    expect(service.getArenaRating(season.seasonId, 'viewer-loser')).toEqual(
      expect.objectContaining({ rating: 884, tier: 'Bronze', battlesRated: 1 })
    );
    expect(service.arenaTier(999)).toBe('Bronze');
    expect(service.arenaTier(1000)).toBe('Silver');
    expect(service.arenaTier(1150)).toBe('Gold');
    expect(service.arenaTier(1300)).toBe('Crystal');
    expect(service.arenaTier(1500)).toBe('Monster Master');
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM streammonsters_season_scores').get().count)
      .toBe(0);
  });

  test('grants one unspent point for every level 2-20 and consumes authorized stat choices once', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'leveler', userId: 'viewer-leveler' });
    const xpToTwenty = Array.from({ length: 19 }, (_, index) => 100 + (25 * index))
      .reduce((sum, threshold) => sum + threshold, 0);

    const capped = store.awardMonsterXp('leveler', xpToTwenty + 999_999);
    expect(capped).toEqual(expect.objectContaining({
      level: 20,
      xp: 0,
      unspent_stat_points: 19
    }));
    expect(capped.stats).toEqual({
      vitality: 10,
      might: 10,
      guard: 10,
      agility: 10
    });
    expect(store.applyMonsterStatPoint({
      userId: 'other-viewer',
      monsterId: 'leveler',
      stat: 'might'
    })).toEqual({ applied: false, reason: 'not_owned' });
    expect(store.applyMonsterStatPoint({
      userId: 'viewer-leveler',
      monsterId: 'leveler',
      stat: 'might'
    })).toEqual(expect.objectContaining({
      applied: true,
      monster: expect.objectContaining({
        unspent_stat_points: 18,
        stats: expect.objectContaining({ might: 11 })
      })
    }));
  });

  test('binds 30-second stat prompts to match, viewer and monster with deterministic timeout', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'winner',
      userId: 'viewer-winner',
      stats: { vitality: 10, might: 80, guard: 10, agility: 80 }
    });
    insertMonster(sqlite, {
      id: 'loser',
      userId: 'viewer-loser',
      element: 'Tide',
      templateId: 'ripple',
      stats: { vitality: 1, might: 1, guard: 0, agility: 1 }
    });
    sqlite.prepare(`
      UPDATE streammonsters_monsters SET xp = 95 WHERE monster_id = 'winner'
    `).run();
    let nowMs = 10_000;
    const emit = jest.fn();
    const service = createMatchService({ store, now: () => nowMs, emit });
    service.join({ userId: 'viewer-winner' });
    const joined = service.join({ userId: 'viewer-loser' });
    service.lockRoster({ userId: 'viewer-winner' });
    service.lockRoster({ userId: 'viewer-loser' });
    service.submitChoice({ userId: 'viewer-winner', choice: 'A', eventId: 'stat-a' });
    service.submitChoice({ userId: 'viewer-loser', choice: 'A', eventId: 'stat-b' });

    const winnerSlot = joined.match.participants.find(
      participant => participant.viewerId === 'viewer-winner'
    ).slot;
    const loserSlot = joined.match.participants.find(
      participant => participant.viewerId === 'viewer-loser'
    ).slot;
    const emitted = emit.mock.calls.map(([event, payload]) => ({ event, payload }));
    expect(emitted.filter(entry => (
      entry.event === 'streammonsters:monster_xp_awarded'
    ))).toEqual(expect.arrayContaining([
      expect.objectContaining({
        payload: expect.objectContaining({
          matchId: joined.match.matchId,
          slot: winnerSlot,
          amount: 15,
          monster: expect.objectContaining({ name: 'winner', level: 2, xp: 10 })
        })
      }),
      expect.objectContaining({
        payload: expect.objectContaining({
          matchId: joined.match.matchId,
          slot: loserSlot,
          amount: 10,
          monster: expect.objectContaining({ name: 'loser', level: 1, xp: 10 })
        })
      })
    ]));
    expect(emitted).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'streammonsters:monster_level_up',
        payload: expect.objectContaining({
          matchId: joined.match.matchId,
          slot: winnerSlot,
          levelsGained: 1,
          monster: expect.objectContaining({ level: 2, unspentStatPoints: 1 })
        })
      }),
      expect.objectContaining({
        event: 'streammonsters:monster_stat_prompt',
        payload: expect.objectContaining({
          matchId: joined.match.matchId,
          slot: winnerSlot,
          choices: ['1', '2', '3', '4']
        })
      })
    ]));
    expect(emitted.filter(entry => (
      entry.event === 'streammonsters:arena_rating_changed'
    ))).toHaveLength(2);
    expect(JSON.stringify(emitted)).not.toContain('viewer-winner');
    expect(JSON.stringify(emitted)).not.toContain('"monsterId":"winner"');

    const prompt = sqlite.prepare(`
      SELECT * FROM streammonsters_stat_prompts
      WHERE match_id = ? AND viewer_id = 'viewer-winner'
    `).get(joined.match.matchId);
    expect(prompt).toEqual(expect.objectContaining({
      monster_id: 'winner',
      deadline_ms: 40_000,
      status: 'open'
    }));
    expect(service.submitStatChoice({
      userId: 'viewer-loser',
      choice: '2',
      eventId: 'wrong-stat'
    })).toEqual({ handled: false, reason: 'no_stat_window' });
    expect(service.submitStatChoice({
      userId: 'viewer-winner',
      choice: '2',
      eventId: 'right-stat'
    })).toEqual(expect.objectContaining({ handled: true, stat: 'might' }));
    expect(emit).toHaveBeenCalledWith(
      'streammonsters:monster_stat_chosen',
      expect.objectContaining({
        matchId: joined.match.matchId,
        slot: winnerSlot,
        stat: 'might',
        source: 'viewer'
      })
    );
    expect(store.getMonster('winner')).toEqual(expect.objectContaining({
      unspent_stat_points: 0,
      stats: expect.objectContaining({ might: 81 })
    }));

    sqlite.prepare(`
      UPDATE streammonsters_monsters SET unspent_stat_points = 1 WHERE monster_id = 'loser'
    `).run();
    service.createStatPrompt(
      joined.match.matchId,
      joined.match.participants.find(entry => entry.viewerId === 'viewer-loser'),
      1
    );
    nowMs = 40_001;
    expect(service.sweep()).toEqual(expect.objectContaining({ statsExpired: 1 }));
    const timeoutDecision = sqlite.prepare(`
      SELECT choice, event_id FROM streammonsters_stat_prompts
      WHERE match_id = ? AND viewer_id = 'viewer-loser'
    `).get(joined.match.matchId);
    expect(timeoutDecision.choice).toMatch(/^(vitality|might|guard|agility)$/);
    expect(timeoutDecision.event_id).toContain(':stat-timeout:');
    expect(emit).toHaveBeenCalledWith(
      'streammonsters:monster_stat_auto_assigned',
      expect.objectContaining({
        matchId: joined.match.matchId,
        slot: loserSlot,
        stat: timeoutDecision.choice,
        source: 'timeout'
      })
    );
  });

  test('keeps private v3 readability and pages v5 on one lossless public cursor with provenance', () => {
    const { sqlite, store } = createStore();
    const legacyRounds = [{
      round: 1,
      actions: [
        { actorId: 'old-a', targetId: 'old-b', skill: { type: 'attack' } },
        { actorId: 'old-b', targetId: 'old-a', skill: { type: 'defense' } }
      ]
    }];
    sqlite.prepare(`
      INSERT INTO streammonsters_battles (
        battle_id, seed, monster_a_id, monster_b_id, winner_monster_id,
        rounds_json, rules_version, result_json, created_at_ms
      ) VALUES ('legacy-v3', 'old-seed', 'old-a', 'old-b', 'old-a', ?, 3, ?, 1)
    `).run(JSON.stringify(legacyRounds), JSON.stringify({ rounds: legacyRounds }));
    const emit = jest.fn();
    const service = createMatchService({ store, now: () => 1_000, emit });

    expect(service.getPrivateNormalizedReplay('legacy-v3')).toEqual(expect.objectContaining({
      battleId: 'legacy-v3',
      rulesVersion: 3,
      replayVersion: 3,
      actions: [
        expect.objectContaining({ sequence: 1, actorId: 'old-a' }),
        expect.objectContaining({ sequence: 2, actorId: 'old-b' })
      ]
    }));
    expect(sqlite.prepare(`
      SELECT rounds_json, rules_version FROM streammonsters_battles WHERE battle_id = 'legacy-v3'
    `).get()).toEqual({
      rounds_json: JSON.stringify(legacyRounds),
      rules_version: 3
    });

    insertMonster(sqlite, {
      id: 'secret-alpha',
      userId: 'viewer-secret-a',
      name: 'Public Alpha'
    });
    insertMonster(sqlite, {
      id: 'secret-beta',
      userId: 'viewer-secret-b',
      name: 'Public Beta',
      element: 'Tide',
      templateId: 'ripple'
    });
    service.join({ userId: 'viewer-secret-a' });
    const joined = service.join({ userId: 'viewer-secret-b' });
    service.lockRoster({ userId: 'viewer-secret-a' });
    service.lockRoster({ userId: 'viewer-secret-b' });
    service.submitChoice({
      userId: 'viewer-secret-a',
      choice: 'A',
      eventId: 'provider-private-a'
    });
    service.submitChoice({
      userId: 'viewer-secret-b',
      choice: 'B',
      eventId: 'provider-private-b'
    });

    const pages = [];
    let cursor = 0;
    do {
      const page = service.getPublicNormalizedReplay(joined.match.matchId, cursor, 2);
      pages.push(page);
      expect(page.events.every(event => event.sequence > cursor)).toBe(true);
      cursor = page.cursor;
      if (!page.hasMore) break;
    } while (pages.length < 20);
    const events = pages.flatMap(page => page.events);
    const actions = pages.flatMap(page => page.actions);
    const decisions = pages.flatMap(page => page.decisions);
    const reveals = pages.flatMap(page => page.reveals);
    expect(events.every(event => (
      event.eventId === `${joined.match.matchId}:event:${event.sequence}` &&
      event.correlationId === joined.match.matchId
    ))).toBe(true);
    const liveEventsById = new Map(emit.mock.calls
      .map(([type, payload]) => ({ type, payload }))
      .filter(entry => entry.payload?.eventId)
      .map(entry => [entry.payload.eventId, entry]));
    expect(events.every(event => (
      liveEventsById.get(event.eventId)?.type === event.type &&
      liveEventsById.get(event.eventId)?.payload.correlationId === event.correlationId
    ))).toBe(true);
    expect(events.map(event => event.sequence)).toEqual(
      [...new Set(events.map(event => event.sequence))].sort((a, b) => a - b)
    );
    expect(actions).toHaveLength(2);
    expect(actions.map(action => action.sequence)).toEqual([1, 2]);
    expect(actions.every(action => Number.isInteger(action.eventSequence))).toBe(true);
    const liveActions = emit.mock.calls
      .filter(([event]) => event === 'streammonsters:battle_skill_used')
      .map(([, payload]) => payload.action);
    expect(actions.map(action => action.actorState)).toEqual(
      liveActions.map(action => action.actorState)
    );
    expect(actions.map(action => action.targetState)).toEqual(
      liveActions.map(action => action.targetState)
    );
    expect(actions.some(action => action.actorState.maxHp > 0)).toBe(true);
    expect(decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        round: 1,
        slot: 2,
        locked: true,
        source: 'viewer',
        deadlineMs: 9_000
      }),
      expect.objectContaining({
        round: 1,
        slot: 1,
        locked: true,
        source: 'viewer',
        deadlineMs: 9_000
      })
    ]));
    expect(JSON.stringify(decisions)).not.toContain('"choice"');
    expect(reveals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        choices: expect.arrayContaining([
          expect.objectContaining({ slot: 2, choice: 'A', source: 'viewer' }),
          expect.objectContaining({ slot: 1, choice: 'B', source: 'viewer' })
        ])
      })
    ]));
    const publicJson = JSON.stringify(pages);
    [
      'viewer-secret',
      'secret-alpha',
      'secret-beta',
      'provider-private',
      'participantId',
      '"before"',
      '"after"'
    ].forEach(secret => expect(publicJson).not.toContain(secret));
    const privateReplay = service.getPrivateNormalizedReplay(joined.match.matchId);
    expect(JSON.stringify(privateReplay)).toContain('secret-alpha');
  });

  test('keeps historical choice-window fighter HUDs unchanged after later actions', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'alpha', userId: 'viewer-a' });
    insertMonster(sqlite, {
      id: 'beta',
      userId: 'viewer-b',
      element: 'Tide',
      templateId: 'ripple'
    });
    const service = createMatchService({
      store,
      now: () => 1_000,
      rulesVersion: 7
    });
    service.join({ userId: 'viewer-a' });
    const joined = service.join({ userId: 'viewer-b' });
    service.lockRoster({ userId: 'viewer-a' });
    service.lockRoster({ userId: 'viewer-b' });

    const before = service.getPublicNormalizedReplay(joined.match.matchId);
    const firstWindow = before.events.find(event => (
      event.type === 'streammonsters:battle_choice_opened' &&
      event.payload.round === 1
    ));
    expect(firstWindow.payload.fighters).toHaveLength(2);
    const originalFighters = JSON.parse(JSON.stringify(firstWindow.payload.fighters));
    const storedRow = sqlite.prepare(`
      SELECT public_payload_json
      FROM streammonsters_match_events
      WHERE match_id = ? AND sequence = ?
    `).get(joined.match.matchId, firstWindow.sequence);
    const legacyPayload = JSON.parse(storedRow.public_payload_json);
    legacyPayload.fighters.forEach(fighter => {
      delete fighter.skills;
    });
    sqlite.prepare(`
      UPDATE streammonsters_match_events
      SET public_payload_json = ?
      WHERE match_id = ? AND sequence = ?
    `).run(
      JSON.stringify(legacyPayload),
      joined.match.matchId,
      firstWindow.sequence
    );

    const rebuiltWindow = service.getPublicNormalizedReplay(joined.match.matchId)
      .events.find(event => event.sequence === firstWindow.sequence);
    expect(rebuiltWindow.payload.fighters.map(fighter => fighter.skills))
      .toEqual(originalFighters.map(fighter => fighter.skills));

    service.submitChoice({ userId: 'viewer-a', choice: 'A', eventId: 'choice-a' });
    service.submitChoice({ userId: 'viewer-b', choice: 'B', eventId: 'choice-b' });

    const after = service.getPublicNormalizedReplay(joined.match.matchId);
    const replayedFirstWindow = after.events.find(event => (
      event.sequence === firstWindow.sequence
    ));
    expect(replayedFirstWindow.payload.fighters).toEqual(originalFighters);
  });

  test('uses one persisted effective-power score for queue widening and roster swaps', () => {
    expect(typeof effectiveCombatPower).toBe('function');
    const { sqlite, store } = createStore();
    const stageOne = {
      id: 'power-stage-one',
      userId: 'stage-one-viewer',
      level: 5,
      stats: { vitality: 7, might: 7, guard: 7, agility: 7 }
    };
    const stageThree = {
      id: 'power-stage-three',
      userId: 'stage-three-viewer',
      level: 5,
      evolutionStage: 3,
      stats: { vitality: 7, might: 11, guard: 7, agility: 9 }
    };
    insertMonster(sqlite, stageOne);
    insertMonster(sqlite, stageThree);
    insertMonster(sqlite, {
      id: 'stronger-unqueued-monster',
      userId: 'stage-one-viewer',
      level: 5,
      evolutionStage: 3,
      selected: false,
      stats: { vitality: 20, might: 20, guard: 20, agility: 20 }
    });
    let nowMs = 50_000;
    const service = createMatchService({
      store,
      now: () => nowMs,
      rulesVersion: 7
    });
    const stageOneMonster = store.getMonster(stageOne.id);
    const stageThreeMonster = store.getMonster(stageThree.id);

    expect(effectiveCombatPower(stageOneMonster)).toBe(48);
    expect(effectiveCombatPower(stageThreeMonster)).toBe(60);
    expect(effectiveCombatPower(stageThreeMonster))
      .toBeGreaterThan(effectiveCombatPower(stageOneMonster));

    store.enqueueBattle({
      userId: stageThree.userId,
      monsterId: stageThree.id,
      stance: 'adaptive',
      queuedAtMs: nowMs
    });
    expect(service.join({ userId: stageOne.userId }).status).toBe('queued');
    expect(store.getBattleQueueEntry(stageOne.userId)).toEqual(
      expect.objectContaining({ queued_power: 48 })
    );
    expect(store.getBattleQueueEntry(stageThree.userId)).toEqual(
      expect.objectContaining({ queued_power: 60 })
    );
    expect(service.reserveBestMatch(stageOne.userId)).toBeNull();

    nowMs += 30_000;
    const reserved = service.reserveBestMatch(stageOne.userId);
    expect(reserved).toEqual(expect.objectContaining({
      rulesVersion: 7,
      matchmakingPowerGap: 15
    }));
    expect(reserved.participants.map(participant => participant.queuedPower))
      .toEqual([48, 60]);
    expect(service.lockRoster({
      userId: stageOne.userId,
      monsterId: 'stronger-unqueued-monster'
    })).toEqual(expect.objectContaining({
      accepted: false,
      reason: 'monster_out_of_power_range',
      allowedPowerGap: 15
    }));
    expect(service.lockRoster({
      userId: stageOne.userId,
      monsterId: stageOne.id
    })).toEqual(expect.objectContaining({ accepted: true }));
    expect(service.lockRoster({
      userId: stageThree.userId,
      monsterId: stageThree.id
    })).toEqual(expect.objectContaining({ accepted: true }));

    const locked = service.getMatch(reserved.matchId);
    expect(locked.participants.map(participant => participant.lockedPower))
      .toEqual([48, 60]);
    expect(locked.participants[1].roster.skills.map(skill => skill.id))
      .toEqual([
        'ashfang:A:stage-2',
        'ashfang:B',
        'ashfang:C:stage-3'
      ]);
  });

  test('retains the safe Rules-v7 charge window in public reconnect replays', () => {
    [5, 6, 7].forEach(rulesVersion => {
      const { sqlite, store } = createStore();
      insertMonster(sqlite, { id: `alpha-v${rulesVersion}`, userId: `viewer-a-v${rulesVersion}` });
      insertMonster(sqlite, {
        id: `beta-v${rulesVersion}`,
        userId: `viewer-b-v${rulesVersion}`,
        element: 'Tide',
        templateId: 'ripple'
      });
      const emit = jest.fn();
      const service = createMatchService({
        store,
        now: () => 1_000,
        emit,
        rulesVersion
      });
      service.join({ userId: `viewer-a-v${rulesVersion}` });
      const joined = service.join({ userId: `viewer-b-v${rulesVersion}` });
      service.lockRoster({ userId: `viewer-a-v${rulesVersion}` });
      service.lockRoster({ userId: `viewer-b-v${rulesVersion}` });

      const live = emit.mock.calls.find(([event]) => (
        event === 'streammonsters:battle_choice_opened'
      ))?.[1];
      const replay = service.getPublicNormalizedReplay(joined.match.matchId).events.find(event => (
        event.type === 'streammonsters:battle_choice_opened' && event.payload.round === 1
      ))?.payload;
      expect(replay).toEqual(expect.objectContaining({
        round: 1,
        deadlineMs: live.deadlineMs,
        choices: ['A', 'B', 'C']
      }));
      if (rulesVersion === 7) {
        expect(live.chargeWindow).toEqual({
          openedAtMs: 1_000,
          deadlineMs: 9_000,
          passivePerSecond: 5
        });
        expect(replay.chargeWindow).toEqual(live.chargeWindow);
        expect(live.fighters[0].skills).toEqual(expect.arrayContaining([
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
        ]));
        expect(replay.fighters).toEqual(live.fighters);
        expect(service.getPublicSnapshot().matches[0]).toEqual(expect.objectContaining({
          chargeWindow: live.chargeWindow,
          fighters: live.fighters
        }));
        expect(JSON.stringify({ live, replay })).not.toMatch(
          /participantId|viewerId|providerEventId|requestedChoice|charge_at_choice/
        );
      } else {
        expect(live.chargeWindow).toBeUndefined();
        expect(replay.chargeWindow).toBeUndefined();
      }
      expect(JSON.stringify(replay)).not.toContain(`viewer-a-v${rulesVersion}`);
    });
  });

  test('publishes only a redacted active battle snapshot', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'alpha', userId: 'viewer-secret-a' });
    insertMonster(sqlite, {
      id: 'beta',
      userId: 'viewer-secret-b',
      element: 'Tide',
      templateId: 'ripple'
    });
    const service = createMatchService({ store, now: () => 1_000 });
    service.join({ userId: 'viewer-secret-a' });
    service.join({ userId: 'viewer-secret-b' });
    service.lockRoster({ userId: 'viewer-secret-a' });
    service.lockRoster({ userId: 'viewer-secret-b' });

    const snapshot = service.getPublicSnapshot();
    const serialized = JSON.stringify(snapshot);
    expect(snapshot.matches).toHaveLength(1);
    expect(snapshot.matches[0]).toEqual(expect.objectContaining({
      state: 'action',
      roundNumber: 1,
      fighters: expect.arrayContaining([
        expect.objectContaining({
          element: 'Ember',
          templateId: 'ashfang',
          evolutionStage: 1,
          imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png',
          maxHp: expect.any(Number)
        }),
        expect.objectContaining({
          element: 'Tide',
          templateId: 'ripple',
          evolutionStage: 1,
          imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/ripple.png',
          maxHp: expect.any(Number)
        })
      ]),
      cursor: expect.any(Number)
    }));
    expect(serialized).not.toContain('viewer-secret');
    expect(serialized).not.toContain('participantId');
    expect(serialized).not.toContain('queuedMonsterId');
    expect(serialized).not.toContain('stats');
  });

  test('restores sealed lock facts without revealing A/B/C on a cold snapshot', () => {
    const { service, matchId } = createReservedRulesV7Match({
      chargeA: 70,
      chargeB: 70,
      openedAtMs: 10_000
    });

    expect(service.submitChoice({
      userId: 'viewer-a',
      choice: 'A',
      eventId: 'snapshot-one-sealed'
    })).toEqual(expect.objectContaining({ handled: true, waiting: true }));

    const match = service.getPublicSnapshot().matches[0];
    const viewerSlot = service.getMatch(matchId).participants
      .find(participant => participant.viewerId === 'viewer-a').slot;
    expect(match.choiceLocks).toEqual([{
      round: 1,
      slot: viewerSlot,
      locked: true,
      source: 'viewer',
      deadlineMs: 18_000
    }]);
    expect(match).not.toHaveProperty('revealedChoices');
    expect(JSON.stringify(match.choiceLocks)).not.toMatch(/"choice"|requestedChoice|viewerId/);
  });

  test('restores only jointly revealed choices during the reconnect cinematic', () => {
    const { service, matchId } = createReservedRulesV7Match({
      chargeA: 70,
      chargeB: 70,
      openedAtMs: 10_000
    });
    service.submitChoice({
      userId: 'viewer-a',
      choice: 'A',
      eventId: 'snapshot-reveal-a'
    });
    service.submitChoice({
      userId: 'viewer-b',
      choice: 'B',
      eventId: 'snapshot-reveal-b'
    });

    const match = service.getPublicSnapshot().matches[0];
    expect(match.roundNumber).toBe(2);
    expect(match.actionDeadlineMs).toBeNull();
    expect(match.choiceLocks).toEqual([]);
    const privateMatch = service.getMatch(matchId);
    const alphaSlot = privateMatch.participants
      .find(participant => participant.viewerId === 'viewer-a').slot;
    const betaSlot = privateMatch.participants
      .find(participant => participant.viewerId === 'viewer-b').slot;
    expect(match.revealedChoices).toEqual({
      round: 1,
      choices: [
        { slot: alphaSlot, choice: 'A', source: 'viewer' },
        { slot: betaSlot, choice: 'B', source: 'viewer' }
      ].sort((left, right) => left.slot - right.slot)
    });
  });

  test('restores one active stat prompt with only public owner and monster context', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, {
      id: 'numeric-owner-monster',
      userId: '7392847109283746102',
      name: 'Ashfang'
    });
    sqlite.prepare(`
      UPDATE streammonsters_monsters
      SET unspent_stat_points = 1
      WHERE monster_id = 'numeric-owner-monster'
    `).run();
    const service = createMatchService({ store, now: () => 5_000, rulesVersion: 8 });
    const prompt = service.createStandaloneStatPrompt({
      userId: '7392847109283746102',
      monsterId: 'numeric-owner-monster',
      sourceKey: 'snapshot-stat'
    });

    expect(prompt).not.toBeNull();
    const snapshot = service.getPublicSnapshot();
    expect(snapshot.statPrompt).toEqual(expect.objectContaining({
      promptId: prompt.prompt_id,
      deadlineMs: 15_000,
      choices: ['1', '2', '3', '4'],
      playerName: 'Viewer',
      monster: expect.objectContaining({
        name: 'Ashfang',
        viewerName: 'Viewer',
        unspentStatPoints: 1
      }),
      level: 1,
      remainingUnspentPoints: 1
    }));
    expect(JSON.stringify(snapshot.statPrompt)).not.toContain('7392847109283746102');
  });

  test('redacts numeric viewer names from legacy persisted public monsters', () => {
    const { store } = createStore();
    const service = createMatchService({ store, now: () => 1_000 });

    expect(service.sanitizePublicMonster({
      viewerName: '@7392847109283746102',
      name: 'Legacy',
      templateId: 'ashfang',
      evolutionStage: 1
    })).toEqual(expect.objectContaining({
      viewerName: 'Viewer',
      name: 'Legacy'
    }));
  });

  test('opens the live skill window with both safe visual fighters for the OBS arena', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'alpha', userId: 'viewer-private-a' });
    insertMonster(sqlite, {
      id: 'beta',
      userId: 'viewer-private-b',
      element: 'Tide',
      templateId: 'ripple'
    });
    const emit = jest.fn();
    const service = createMatchService({ store, now: () => 1_000, emit });
    service.join({ userId: 'viewer-private-a' });
    service.join({ userId: 'viewer-private-b' });
    service.lockRoster({ userId: 'viewer-private-a' });
    service.lockRoster({ userId: 'viewer-private-b' });

    const opened = emit.mock.calls.find(([event]) => (
      event === 'streammonsters:battle_choice_opened'
    ));
    expect(opened?.[1]).toEqual(expect.objectContaining({
      round: 1,
      choices: ['A', 'B', 'C'],
      fighters: expect.arrayContaining([
        expect.objectContaining({
          slot: 1,
          templateId: expect.any(String),
          imageUrl: expect.stringMatching(/^\/plugins\/streamalchemy\/assets\/streammonsters\/furry\//),
          hp: expect.any(Number),
          maxHp: expect.any(Number)
        }),
        expect.objectContaining({ slot: 2, templateId: expect.any(String) })
      ])
    }));
    expect(JSON.stringify(opened)).not.toContain('viewer-private');
    expect(JSON.stringify(opened)).not.toContain('"stats"');
  });

  test('auto-locks both sole eligible Rules-v8 monsters after match-found exactly once', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'sole-alpha', userId: 'viewer-sole-a' });
    insertMonster(sqlite, {
      id: 'sole-beta',
      userId: 'viewer-sole-b',
      element: 'Tide',
      templateId: 'ripple'
    });
    const emit = jest.fn();
    const service = createMatchService({
      store,
      now: () => 1_000,
      emit,
      rulesVersion: 8
    });

    service.join({ userId: 'viewer-sole-a' });
    const joined = service.join({ userId: 'viewer-sole-b' });
    const match = service.getMatch(joined.match.matchId);
    const emittedTypes = emit.mock.calls.map(([eventType]) => eventType);

    expect(match.state).toBe('action');
    expect(match.participants.map(participant => participant.lockedMonsterId))
      .toEqual(expect.arrayContaining(['sole-alpha', 'sole-beta']));
    expect(match.participants).toHaveLength(2);
    expect(emittedTypes).toEqual([
      'streammonsters:battle_match_found',
      'streammonsters:battle_roster_locked',
      'streammonsters:battle_roster_locked',
      'streammonsters:battle_choice_opened'
    ]);
    expect(emit.mock.calls
      .filter(([eventType]) => eventType === 'streammonsters:battle_roster_locked')
      .map(([, payload]) => payload.selectionSource))
      .toEqual(['sole_eligible', 'sole_eligible']);
    const replayRosterLocks = service.getPublicNormalizedReplay(match.matchId).events
      .filter(event => event.type === 'streammonsters:battle_roster_locked');
    expect(replayRosterLocks).toHaveLength(2);
    expect(replayRosterLocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        payload: expect.objectContaining({
          selectionSource: 'sole_eligible',
          fighter: expect.objectContaining({ locked: true })
        })
      })
    ]));
    expect(JSON.stringify(replayRosterLocks)).not.toMatch(
      /viewer-sole|participantId|monsterId/
    );

    service.autoLockSoleEligibleRosters(match.matchId);
    expect(emit.mock.calls.map(([eventType]) => eventType)).toEqual(emittedTypes);
    const reloadEmit = jest.fn();
    const recovered = createMatchService({
      store,
      now: () => 1_500,
      emit: reloadEmit,
      rulesVersion: 8
    });
    recovered.autoLockSoleEligibleRosters(match.matchId);
    expect(reloadEmit).not.toHaveBeenCalled();
  });

  test('auto-locks only a sole eligible Rules-v8 side and preserves the other choice window', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'single-alpha', userId: 'viewer-single-a' });
    insertMonster(sqlite, {
      id: 'choice-beta',
      userId: 'viewer-choice-b',
      element: 'Tide',
      templateId: 'ripple'
    });
    insertMonster(sqlite, {
      id: 'choice-beta-two',
      userId: 'viewer-choice-b',
      element: 'Tide',
      templateId: 'brine',
      selected: false
    });
    const emit = jest.fn();
    const service = createMatchService({
      store,
      now: () => 2_000,
      emit,
      rulesVersion: 8
    });

    service.join({ userId: 'viewer-single-a' });
    const joined = service.join({ userId: 'viewer-choice-b' });
    const match = service.getMatch(joined.match.matchId);

    expect(match.state).toBe('roster');
    expect(match.participants.find(entry => entry.viewerId === 'viewer-single-a'))
      .toEqual(expect.objectContaining({ lockedMonsterId: 'single-alpha' }));
    expect(match.participants.find(entry => entry.viewerId === 'viewer-choice-b'))
      .toEqual(expect.objectContaining({ lockedMonsterId: null }));
    expect(emit.mock.calls.map(([eventType]) => eventType)).toEqual([
      'streammonsters:battle_match_found',
      'streammonsters:battle_roster_locked'
    ]);

    expect(service.lockRoster({ userId: 'viewer-choice-b' })).toEqual(
      expect.objectContaining({ accepted: true, selectionSource: 'viewer' })
    );
    expect(service.getMatch(match.matchId).state).toBe('action');
  });

  test('leaves zero-eligible and legacy matches on their existing roster path', () => {
    const zero = createStore();
    insertMonster(zero.sqlite, { id: 'zero-alpha', userId: 'viewer-zero-a' });
    insertMonster(zero.sqlite, {
      id: 'zero-beta',
      userId: 'viewer-zero-b',
      element: 'Tide',
      templateId: 'ripple'
    });
    const zeroEmit = jest.fn();
    const zeroService = createMatchService({
      store: zero.store,
      now: () => 3_000,
      emit: zeroEmit,
      rulesVersion: 8
    });
    jest.spyOn(zeroService, 'rosterEligibility').mockReturnValue({
      accepted: false,
      reason: 'test_ineligible'
    });
    zeroService.join({ userId: 'viewer-zero-a' });
    const zeroJoined = zeroService.join({ userId: 'viewer-zero-b' });
    expect(zeroService.getMatch(zeroJoined.match.matchId)).toEqual(
      expect.objectContaining({
        state: 'roster',
        participants: expect.arrayContaining([
          expect.objectContaining({ lockedMonsterId: null }),
          expect.objectContaining({ lockedMonsterId: null })
        ])
      })
    );
    expect(zeroEmit).toHaveBeenCalledTimes(1);

    const legacy = createStore();
    insertMonster(legacy.sqlite, { id: 'legacy-alpha', userId: 'viewer-legacy-a' });
    insertMonster(legacy.sqlite, {
      id: 'legacy-beta',
      userId: 'viewer-legacy-b',
      element: 'Tide',
      templateId: 'ripple'
    });
    const legacyEmit = jest.fn();
    const legacyService = createMatchService({
      store: legacy.store,
      now: () => 4_000,
      emit: legacyEmit,
      rulesVersion: 7
    });
    legacyService.join({ userId: 'viewer-legacy-a' });
    const legacyJoined = legacyService.join({ userId: 'viewer-legacy-b' });
    expect(legacyService.getMatch(legacyJoined.match.matchId).state).toBe('roster');
    expect(legacyEmit.mock.calls.map(([eventType]) => eventType)).toEqual([
      'streammonsters:battle_match_found'
    ]);
  });

  test('startup sweep recovers and auto-locks a persisted sole-eligible Rules-v8 roster once', () => {
    const { sqlite, store } = createStore();
    insertMonster(sqlite, { id: 'recovery-alpha', userId: 'viewer-recovery-a' });
    insertMonster(sqlite, {
      id: 'recovery-beta',
      userId: 'viewer-recovery-b',
      element: 'Tide',
      templateId: 'ripple'
    });
    const creator = createMatchService({
      store,
      now: () => 5_000,
      rulesVersion: 8
    });
    jest.spyOn(creator, 'rosterEligibility').mockReturnValue({
      accepted: false,
      reason: 'simulate_pre_upgrade_reservation'
    });
    creator.join({ userId: 'viewer-recovery-a' });
    const reserved = creator.join({ userId: 'viewer-recovery-b' });
    expect(creator.getMatch(reserved.match.matchId).state).toBe('roster');

    const emit = jest.fn();
    const recovered = createMatchService({
      store,
      now: () => 5_500,
      emit,
      rulesVersion: 8
    });
    recovered.start();
    expect(recovered.getMatch(reserved.match.matchId).state).toBe('action');
    expect(emit.mock.calls.map(([eventType]) => eventType)).toEqual([
      'streammonsters:battle_roster_locked',
      'streammonsters:battle_roster_locked',
      'streammonsters:battle_choice_opened'
    ]);

    recovered.safeSweep();
    expect(emit).toHaveBeenCalledTimes(3);
    recovered.destroy();
  });

  test('ships localized sole-eligible roster copy for every supported locale', () => {
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const translations = JSON.parse(fs.readFileSync(
        path.join(
          __dirname,
          '..',
          'plugins',
          'streamalchemy',
          'locales',
          `${locale}.json`
        ),
        'utf8'
      )).plugins.streamalchemy.ui.monsters;
      expect(translations.arenaRosterAutoTitle).toEqual(expect.any(String));
      expect(translations.arenaRosterAutoBody).toContain('{name}');
      expect(translations.arenaRosterLockedBody).toEqual(expect.any(String));
    }
  });
});

describe('Stream Monsters v5 command composition', () => {
  test('routes battle/choose into the durable owner, cancels roster selection and locks active rounds', () => {
    let activeMatch = {
      matchId: 'match-a',
      state: 'roster'
    };
    const battleMatchService = {
      join: jest.fn(() => ({ status: 'queued' })),
      lockRoster: jest.fn(() => ({ accepted: true, waiting: true })),
      getActiveMatchForViewer: jest.fn(() => activeMatch),
      cancelBeforeBattle: jest.fn(() => ({
        cancelled: true,
        matchId: 'match-a'
      }))
    };
    const store = {
      afterCommit: callback => callback(),
      getBattleQueue: () => [],
      getViewerMonsters: () => [{
        monster_id: 'monster-a',
        user_id: 'viewer-a',
        name: 'Alpha'
      }],
      selectMonster: () => ({
        monster_id: 'monster-a',
        user_id: 'viewer-a',
        name: 'Alpha'
      }),
      removeBattleQueueEntry: jest.fn(() => false),
      purgeBattleQueue: jest.fn()
    };
    const commands = new ChatCommands({
      store,
      engine: { markReadyEggs: jest.fn(), streamKey: 'stream-a' },
      battleService: { stanceForMonster: () => 'power' },
      battleMatchService,
      progression: { recordCommand: jest.fn() }
    });

    expect(commands.execute({ userId: 'viewer-a' }, 'battle', [])).toEqual(
      expect.objectContaining({ success: true, status: 'queued' })
    );
    expect(commands.execute({ userId: 'viewer-a' }, 'choose', ['1'])).toEqual(
      expect.objectContaining({ success: true, status: 'roster_locked' })
    );
    expect(commands.execute({ userId: 'viewer-a' }, 'leavebattle', [])).toEqual({
      success: true,
      status: 'match_cancelled',
      message: 'The reserved battle was cancelled before it started.'
    });
    expect(battleMatchService.cancelBeforeBattle).toHaveBeenCalledWith('viewer-a');

    activeMatch = { matchId: 'match-b', state: 'action' };
    expect(commands.execute({ userId: 'viewer-a' }, 'leavebattle', [])).toEqual({
      success: false,
      status: 'match_locked',
      message: 'A battle in progress cannot be left.'
    });
    expect(store.removeBattleQueueEntry).not.toHaveBeenCalled();
  });
});
