'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const runtime = require('../plugins/stream-monsters/streammonsters-overlay-runtime');

describe('Stream Monsters overlay layout and critical queue', () => {
  test('applies the immutable 1080 by 1920 portrait profile to CSS without letting it move battle placement', () => {
    const setProperty = jest.fn();
    const stage = { dataset: {}, style: { setProperty } };
    const battle = { dataset: {} };
    const controller = runtime.createLayoutController({
      window: {
        innerWidth: 1080,
        innerHeight: 1920,
        location: {
          search: '?layout=portrait&portraitAnchor=top-right&portraitScale=130'
        },
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
      },
      stage,
      battle,
      config: {
        portraitAnchor: 'bottom-left',
        portraitScale: 70,
        overlayProfiles: {
          portrait: { width: 1, height: 1, gameplayHeightPercent: 1 }
        }
      }
    });

    expect(controller.current()).toEqual(expect.objectContaining({
      layout: 'portrait',
      anchor: 'top-right',
      scale: 130,
      profile: expect.objectContaining({
        preset: 'tiktok-live-studio-1080x1920',
        width: 1080,
        height: 1920,
        gameplayHeightPercent: 74,
        chatSafeZone: { x: 0, y: 74, width: 100, height: 26 }
      })
    }));
    expect(setProperty).toHaveBeenCalledWith('--overlay-profile-width', '1080');
    expect(setProperty).toHaveBeenCalledWith('--arena-gameplay-height', '74%');
    expect(battle.dataset).toEqual({ layoutIndependent: 'true' });
  });

  test('baselines the first battle snapshot without replaying an already-running fight', async () => {
    const loadPage = jest.fn();
    const present = jest.fn();
    const synchronizer = runtime.createBattleReplaySynchronizer({
      loadPage,
      present
    });

    const result = await synchronizer.sync({
      rulesVersion: 5,
      matches: [{ matchId: 'match-live', cursor: 7 }]
    });

    expect(result).toEqual(expect.objectContaining({
      baseline: true,
      replayed: 0,
      caughtUp: true
    }));
    expect(loadPage).not.toHaveBeenCalled();
    expect(present).not.toHaveBeenCalled();
    expect(synchronizer.state().matches).toEqual([
      expect.objectContaining({ matchId: 'match-live', cursor: 7 })
    ]);
  });

  test('restores sealed locks and an active stat prompt on the first cursor baseline', async () => {
    const shown = [];
    const synchronizer = runtime.createBattleReplaySynchronizer({
      loadPage: jest.fn(),
      present: async event => shown.push(event)
    });

    const result = await synchronizer.sync({
      rulesVersion: 8,
      statPrompt: {
        promptId: 'allocation-safe',
        deadlineMs: 20_000,
        choices: ['1', '2', '3', '4'],
        playerName: '@luna',
        monster: { name: 'Selene', viewerName: '@luna' },
        level: 7,
        remainingUnspentPoints: 2
      },
      matches: [{
        matchId: 'match-cold',
        cursor: 7,
        roundNumber: 3,
        choiceLocks: [{
          round: 3,
          slot: 1,
          locked: true,
          source: 'viewer',
          deadlineMs: 20_000
        }]
      }]
    });

    expect(result).toEqual(expect.objectContaining({
      baseline: true,
      restored: 2
    }));
    expect(shown.map(event => event.type)).toEqual([
      'battle_choice_locked',
      'monster_stat_prompt'
    ]);
    expect(shown[0].data.decision).toEqual({
      round: 3,
      slot: 1,
      locked: true,
      source: 'viewer',
      deadlineMs: 20_000
    });
    expect(shown[0].data.decision).not.toHaveProperty('choice');
    expect(shown[1].data).toEqual(expect.objectContaining({
      promptId: 'allocation-safe',
      playerName: '@luna',
      monster: { name: 'Selene', viewerName: '@luna' }
    }));
  });

  test('restores A/B/C only from a joint reveal in the first cursor baseline', async () => {
    const shown = [];
    const synchronizer = runtime.createBattleReplaySynchronizer({
      loadPage: jest.fn(),
      present: async event => shown.push(event)
    });

    await synchronizer.sync({
      matches: [{
        matchId: 'match-revealed',
        cursor: 9,
        roundNumber: 2,
        choiceLocks: [],
        revealedChoices: {
          round: 1,
          choices: [
            { slot: 1, choice: 'A', source: 'viewer' },
            { slot: 2, choice: 'B', source: 'timeout' }
          ]
        }
      }]
    });

    expect(shown).toHaveLength(1);
    expect(shown[0]).toEqual(expect.objectContaining({
      type: 'battle_choices_revealed',
      data: expect.objectContaining({
        matchId: 'match-revealed',
        round: 1,
        choices: [
          { slot: 1, choice: 'A', source: 'viewer' },
          { slot: 2, choice: 'B', source: 'timeout' }
        ]
      })
    }));
  });

  test('replays missed rules-v5 events once in sequence across bounded pages', async () => {
    const pages = new Map([
      [4, {
        cursor: 6,
        hasMore: true,
        events: [
          {
            sequence: 6,
            eventId: 'match-live:event:6',
            correlationId: 'match-live',
            type: 'streammonsters:battle_skill_used',
            payload: {
              matchId: 'match-live',
              action: { matchId: 'match-live', eventSequence: 6, choice: 'B' }
            }
          },
          {
            sequence: 5,
            eventId: 'match-live:event:5',
            correlationId: 'match-live',
            type: 'streammonsters:battle_choice_locked',
            payload: { matchId: 'match-live', decision: { sequence: 5, slot: 1, choice: 'B' } }
          }
        ]
      }],
      [6, {
        cursor: 8,
        hasMore: false,
        events: [
          {
            sequence: 6,
            eventId: 'match-live:event:6',
            correlationId: 'match-live',
            type: 'streammonsters:battle_skill_used',
            payload: {
              matchId: 'match-live',
              action: { matchId: 'match-live', eventSequence: 6, choice: 'B' }
            }
          },
          {
            sequence: 7,
            eventId: 'match-live:event:7',
            correlationId: 'match-live',
            type: 'streammonsters:battle_skill_used',
            payload: {
              matchId: 'match-live',
              action: { matchId: 'match-live', eventSequence: 7, choice: 'A' }
            }
          },
          {
            sequence: 8,
            eventId: 'match-live:event:8',
            correlationId: 'match-live',
            type: 'streammonsters:battle_choice_opened',
            payload: { matchId: 'match-live', round: 2, choices: ['A', 'B'] }
          }
        ]
      }]
    ]);
    const loadPage = jest.fn(async ({ cursor }) => pages.get(cursor));
    const shown = [];
    const synchronizer = runtime.createBattleReplaySynchronizer({
      loadPage,
      present: async event => shown.push(event)
    });
    await synchronizer.sync({
      matches: [{ matchId: 'match-live', cursor: 4 }]
    });

    const replay = await synchronizer.sync({
      matches: [{ matchId: 'match-live', cursor: 8 }]
    });

    expect(loadPage.mock.calls.map(([request]) => request.cursor)).toEqual([4, 6]);
    expect(shown.map(event => event.sequence)).toEqual([5, 6, 7, 8]);
    expect(shown.map(event => event.type)).toEqual([
      'battle_choice_locked',
      'battle_skill_used',
      'battle_skill_used',
      'battle_choice_opened'
    ]);
    expect(shown[1].data).toEqual(expect.objectContaining({
      eventId: 'match-live:event:6',
      correlationId: 'match-live',
      action: expect.objectContaining({ eventSequence: 6 })
    }));
    expect(replay).toEqual(expect.objectContaining({
      baseline: false,
      replayed: 4,
      caughtUp: true
    }));

    await synchronizer.sync({
      matches: [{ matchId: 'match-live', cursor: 8 }]
    });
    expect(shown).toHaveLength(4);
  });

  test('deduplicates a live socket event against replay and resumes after a bounded page limit', async () => {
    const shown = [];
    const loadPage = jest.fn(async ({ cursor }) => ({
      cursor: cursor + 1,
      hasMore: true,
      events: [{
        sequence: cursor + 1,
        eventId: `match-bounded:event:${cursor + 1}`,
        correlationId: 'match-bounded',
        type: 'streammonsters:battle_skill_used',
        payload: {
          matchId: 'match-bounded',
          action: { matchId: 'match-bounded', eventSequence: cursor + 1 }
        }
      }]
    }));
    const synchronizer = runtime.createBattleReplaySynchronizer({
      loadPage,
      present: async event => shown.push(event),
      maxPages: 2,
      pageLimit: 1
    });
    await synchronizer.sync({
      matches: [{ matchId: 'match-bounded', cursor: 1 }]
    });
    synchronizer.observe('battle_skill_used', {
      matchId: 'match-bounded',
      sequence: 2,
      eventId: 'match-bounded:event:2',
      action: { eventSequence: 2 }
    });

    const first = await synchronizer.sync({
      matches: [{ matchId: 'match-bounded', cursor: 100 }]
    });

    expect(loadPage.mock.calls.map(([request]) => request.cursor)).toEqual([2, 3]);
    expect(shown.map(event => event.sequence)).toEqual([3, 4]);
    expect(first.caughtUp).toBe(false);
    expect(synchronizer.state().matches).toEqual([
      expect.objectContaining({ matchId: 'match-bounded', cursor: 4 })
    ]);

    loadPage.mockClear();
    const second = await synchronizer.sync({
      matches: [{ matchId: 'match-bounded', cursor: 100 }]
    });
    expect(loadPage.mock.calls.map(([request]) => request.cursor)).toEqual([4, 5]);
    expect(shown.map(event => event.sequence)).toEqual([3, 4, 5, 6]);
    expect(second.caughtUp).toBe(false);
    expect(synchronizer.hasSeen('battle_skill_used', {
      matchId: 'match-bounded',
      sequence: 5,
      eventId: 'match-bounded:event:5'
    })).toBe(true);
  });

  test('finishes the tracked old match before replaying a match created during disconnect', async () => {
    const shown = [];
    const loadPage = jest.fn(async ({ matchId, cursor }) => {
      if (matchId === 'match-old') {
        return {
          cursor: 3,
          hasMore: false,
          events: [{
            sequence: 3,
            eventId: 'match-old:event:3',
            correlationId: 'match-old',
            type: 'streammonsters:battle_completed',
            payload: { matchId: 'match-old', winnerSlot: 1 }
          }]
        };
      }
      expect(cursor).toBe(0);
      return {
        cursor: 2,
        hasMore: false,
        events: [{
          sequence: 1,
          eventId: 'match-new:event:1',
          correlationId: 'match-new',
          type: 'streammonsters:battle_match_found',
          payload: { matchId: 'match-new' }
        }, {
          sequence: 2,
          eventId: 'match-new:event:2',
          correlationId: 'match-new',
          type: 'streammonsters:battle_choice_opened',
          payload: { matchId: 'match-new', round: 1, choices: ['A', 'B'] }
        }]
      };
    });
    const synchronizer = runtime.createBattleReplaySynchronizer({
      loadPage,
      present: async event => shown.push(`${event.data.matchId}:${event.type}`)
    });
    await synchronizer.sync({
      matches: [{ matchId: 'match-old', cursor: 2 }]
    });

    await synchronizer.sync({
      matches: [{ matchId: 'match-new', cursor: 2 }]
    });

    expect(shown).toEqual([
      'match-old:battle_completed',
      'match-new:battle_match_found',
      'match-new:battle_choice_opened'
    ]);
    expect(synchronizer.state().matches).toEqual([
      expect.objectContaining({ matchId: 'match-new', cursor: 2 })
    ]);
  });

  test('fingerprints canonical and compatibility stat prompts per participant window', () => {
    const canonical = {
      matchId: 'match-level-up',
      slot: 1,
      deadlineMs: 123456
    };
    expect(runtime.statPromptKey(canonical)).toBe('match-level-up:1:123456');
    expect(runtime.statPromptKey({
      ...canonical,
      compatibilityAlias: true
    })).toBe(runtime.statPromptKey(canonical));
    expect(runtime.statPromptKey({ ...canonical, slot: 2 })).not.toBe(runtime.statPromptKey(canonical));
    expect(runtime.statPromptKey({ ...canonical, deadlineMs: 123457 })).not.toBe(runtime.statPromptKey(canonical));
  });

  test('preserves an explicit double-knockout draw and only infers exact legacy winners', () => {
    expect(runtime.resolveBattleWinnerSlot({
      winnerSlot: 0,
      winner: null,
      terminalReason: 'double_knockout'
    }, ['monster-left', 'monster-right'])).toBe(0);
    expect(runtime.resolveBattleWinnerSlot({
      winnerSlot: 1
    }, ['monster-left', 'monster-right'])).toBe(1);
    expect(runtime.resolveBattleWinnerSlot({
      winnerSlot: 2
    }, ['monster-left', 'monster-right'])).toBe(2);
    expect(runtime.resolveBattleWinnerSlot({
      winner: { monsterId: 'monster-right' }
    }, ['monster-left', 'monster-right'])).toBe(2);
    expect(runtime.resolveBattleWinnerSlot({
      winner: null
    }, ['monster-left', 'monster-right'])).toBe(0);
    expect(runtime.resolveBattleWinnerSlot({
      winner: {}
    }, [null, null])).toBe(0);
  });

  test('keeps spawn, hatch and every battle skill event in indivisible critical groups', () => {
    for (const type of [
      'egg_spawned',
      'hatch_started',
      'egg_hatched',
      'battle_started',
      'battle_skill_used',
      'battle_special_charged',
      'battle_round',
      'battle_completed',
      'battle_match_found',
      'battle_choice_opened',
      'battle_choice_locked',
      'battle_cancelled',
      'monster_evolved'
    ]) {
      expect(runtime.isCritical(type)).toBe(true);
    }

    const queue = runtime.createPriorityQueue({ maxSize: 3, maxCriticalOverflow: 8 });
    const battle = { battleId: 'battle-a' };
    queue.enqueue('battle_started', battle, 1);
    queue.enqueue('battle_skill_used', battle, 2);
    queue.enqueue('battle_special_charged', battle, 3);
    queue.enqueue('battle_round', battle, 4);
    queue.enqueue('battle_completed', battle, 5);

    expect(queue.snapshot().map(entry => entry.type)).toEqual([
      'battle_started',
      'battle_skill_used',
      'battle_special_charged',
      'battle_round',
      'battle_completed'
    ]);
    expect(queue.size()).toBe(5);
  });

  test('groups the durable rules-v5 room by match id and terminates it on completion or cancellation', () => {
    const queue = runtime.createPriorityQueue({ maxSize: 3, maxCriticalOverflow: 8 });
    const match = { matchId: 'match-v5' };
    [
      'battle_match_found',
      'battle_choice_opened',
      'battle_choice_locked',
      'battle_skill_used',
      'battle_completed'
    ].forEach((type, index) => queue.enqueue(type, {
      ...match,
      eventId: `event-${index}`,
      action: type === 'battle_skill_used' ? { eventSequence: 4 } : undefined
    }, index));
    expect(queue.snapshot().map(entry => entry.groupKey)).toEqual(
      Array(5).fill('battle:match-v5')
    );
    expect(queue.snapshot().map(entry => entry.type)).toEqual([
      'battle_match_found',
      'battle_choice_opened',
      'battle_choice_locked',
      'battle_skill_used',
      'battle_completed'
    ]);

    const cancelled = runtime.createPriorityQueue();
    cancelled.enqueue('battle_match_found', { matchId: 'match-cancelled', eventId: 'found' }, 1);
    cancelled.enqueue('battle_cancelled', { matchId: 'match-cancelled', eventId: 'cancel' }, 2);
    expect(cancelled.shift(3).type).toBe('battle_match_found');
    expect(cancelled.shift(3).type).toBe('battle_cancelled');
  });

  test('keeps the shelf visible while deferring its lifecycle presentation during battle', () => {
    const overlayHtml = fs.readFileSync(path.join(
      process.cwd(),
      'plugins',
      'stream-monsters',
      'streammonsters-overlay.html'
    ), 'utf8');
    const dom = new JSDOM(overlayHtml);
    const battleHideSelectors = Array.from(dom.window.document.styleSheets)
      .flatMap(sheet => Array.from(sheet.cssRules || []))
      .filter(rule => rule.selectorText?.includes(
        '#streammonsters-overlay[data-battle-active="true"]'
      ))
      .map(rule => rule.selectorText);
    expect(battleHideSelectors.some(selector => selector.includes('#egg-shelf')))
      .toBe(false);

    const queue = runtime.createPriorityQueue();
    queue.enqueue('battle_match_found', {
      matchId: 'takeover',
      correlationId: 'takeover',
      eventId: 'takeover:found'
    }, 1);
    queue.enqueue('egg_landed', {
      eventId: 'egg:during-battle',
      eggStage: { visualId: 'egg-during-battle' }
    }, 2);
    queue.enqueue('monster_xp_awarded', {
      matchId: 'takeover',
      eventId: 'takeover:xp'
    }, 3);
    queue.enqueue('chat_result', {
      eventId: 'chat:during-battle'
    }, 4);
    queue.enqueue('battle_choice_opened', {
      matchId: 'takeover',
      correlationId: 'takeover',
      eventId: 'takeover:choice'
    }, 5);
    queue.enqueue('battle_completed', {
      matchId: 'takeover',
      correlationId: 'takeover',
      eventId: 'takeover:completed'
    }, 6);

    queue.setBattleActive(true, 'takeover');
    expect(queue.shift(10).type).toBe('battle_match_found');
    expect(queue.shift(10).type).toBe('battle_choice_opened');
    expect(queue.shift(10).type).toBe('battle_completed');
    expect(queue.shift(10)).toBeNull();
    expect(queue.snapshot().map(entry => entry.type)).toEqual(expect.arrayContaining([
      'egg_landed',
      'monster_xp_awarded',
      'chat_result'
    ]));

    queue.setBattleActive(false);
    expect(queue.shift(11).type).toBe('egg_landed');
    dom.window.close();
  });

  test('coalesces hype/chat, drops stale noncritical events, and never partially trims hatch groups', () => {
    const queue = runtime.createPriorityQueue({ maxSize: 4, staleAfterMs: 10, maxCriticalOverflow: 8 });
    queue.enqueue('hype_changed', { points: 10 }, 1);
    queue.enqueue('hype_changed', { points: 20 }, 2);
    queue.enqueue('chat_result', { message: 'old' }, 1);
    queue.enqueue('chat_result', { message: 'new' }, 2);
    queue.enqueue('egg_spawned', { eggId: 'egg-a' }, 3);
    queue.enqueue('hatch_started', { eggId: 'egg-a' }, 4);
    queue.enqueue('egg_hatched', { eggId: 'egg-a' }, 5);

    expect(queue.snapshot().filter(entry => entry.type === 'hype_changed')).toHaveLength(0);
    expect(queue.snapshot().filter(entry => entry.type === 'chat_result')).toHaveLength(1);
    expect(queue.snapshot().filter(entry => entry.groupKey === 'hatch:egg-a').map(entry => entry.type)).toEqual([
      'egg_spawned',
      'hatch_started',
      'egg_hatched'
    ]);
    const shifted = [];
    for (let entry = queue.shift(100); entry; entry = queue.shift(100)) shifted.push(entry.type);
    expect(shifted).not.toContain('chat_result');
    expect(shifted).toEqual(expect.arrayContaining(['egg_spawned', 'hatch_started', 'egg_hatched']));
  });

  test('deduplicates a transport flood before enqueue while retaining the complete battle', () => {
    const queue = runtime.createPriorityQueue({ maxSize: 30, maxCriticalOverflow: 20 });
    const battleId = 'battle-flood';
    const events = [
      ['battle_started', { battleId, eventId: 'start' }],
      ['battle_special_charged', { battleId, monsterId: 'monster-a', eventId: 'charged' }],
      ['battle_round', { battleId, round: { number: 1 }, eventId: 'round-1' }],
      ['battle_round', { battleId, round: { number: 2 }, eventId: 'round-2' }],
      ['battle_round', { battleId, round: { number: 3 }, eventId: 'round-3' }],
      ['battle_completed', { battleId, eventId: 'completed' }]
    ];
    for (let repeat = 0; repeat < 100; repeat += 1) {
      for (const [type, data] of events) queue.enqueue(type, data, repeat);
      expect(queue.size()).toBeLessThanOrEqual(50);
    }

    expect(queue.snapshot().map(entry => entry.type)).toEqual([
      'battle_started',
      'battle_special_charged',
      'battle_round',
      'battle_round',
      'battle_round',
      'battle_completed'
    ]);
    expect(queue.snapshot().every(entry => entry.data.criticalGroupSummary == null)).toBe(true);
  });

  test('deduplicates a repeated skill event without collapsing the same skill in another round', () => {
    const queue = runtime.createPriorityQueue({ maxSize: 10, maxCriticalOverflow: 5 });
    const skill = {
      battleId: 'battle-skill-fingerprint',
      actorId: 'monster-a',
      skill: { vfxKey: 'ashfang:attack' }
    };
    queue.enqueue('battle_skill_used', { ...skill, round: 1 }, 1);
    queue.enqueue('battle_skill_used', { ...skill, round: 1 }, 2);
    queue.enqueue('battle_skill_used', { ...skill, round: 2 }, 3);

    expect(queue.snapshot().map(entry => entry.data.round)).toEqual([1, 2]);
  });

  test('retains every event in a normal three-round battle sequence', () => {
    const queue = runtime.createPriorityQueue({ maxSize: 3, maxCriticalOverflow: 8 });
    const battleId = 'battle-three-rounds';
    const sequence = [
      ['battle_started', { battleId }],
      ['stance_revealed', { battleId, monsterId: 'left' }],
      ['stance_revealed', { battleId, monsterId: 'right' }],
      ['battle_round', { battleId, round: { number: 1 } }],
      ['battle_round', { battleId, round: { number: 2 } }],
      ['battle_round', { battleId, round: { number: 3 } }],
      ['battle_completed', { battleId }]
    ];
    sequence.forEach(([type, data], index) => queue.enqueue(type, data, index));

    expect(queue.snapshot().map(entry => entry.type)).toEqual(sequence.map(([type]) => type));
  });

  test('compacts critical overflow into exactly one resync sentinel', () => {
    const queue = runtime.createPriorityQueue({ maxSize: 4, maxCriticalOverflow: 3 });
    const enqueueBattle = battleId => {
      queue.enqueue('battle_started', { battleId }, 1);
      for (let round = 1; round <= 3; round += 1) {
        queue.enqueue('battle_round', { battleId, round: { number: round } }, 1 + round);
      }
      queue.enqueue('battle_completed', { battleId }, 5);
    };
    enqueueBattle('battle-oldest');
    enqueueBattle('battle-newest');

    expect(queue.snapshot()).toEqual([
      expect.objectContaining({ type: 'state_resync_required', priority: 4, data: { reason: 'critical_overflow' } })
    ]);
  });

  test('rejects late critical events after compacting an overflow', () => {
    const queue = runtime.createPriorityQueue({ maxSize: 4, maxCriticalOverflow: 3 });
    const oldBattleId = 'battle-complete-retained';
    queue.enqueue('battle_started', { battleId: oldBattleId }, 1);
    for (let round = 1; round <= 3; round += 1) {
      queue.enqueue('battle_round', { battleId: oldBattleId, round: { number: round } }, 1 + round);
    }
    queue.enqueue('battle_completed', { battleId: oldBattleId }, 5);

    const newBattleId = 'battle-pressure';
    queue.enqueue('battle_started', { battleId: newBattleId }, 6);
    queue.enqueue('battle_round', { battleId: newBattleId, round: { number: 1 } }, 7);
    queue.enqueue('battle_round', { battleId: newBattleId, round: { number: 2 } }, 8);
    expect(queue.snapshot()).toEqual([expect.objectContaining({ type: 'state_resync_required' })]);

    expect(queue.enqueue('battle_skill_used', {
      battleId: oldBattleId,
      round: 4,
      actorId: 'monster-late',
      skill: { vfxKey: 'late:unique' }
    }, 9)).toBe(false);
    expect(queue.snapshot()).toHaveLength(1);
  });

  test('deduplicates retransmissions after a critical overflow resync sentinel', () => {
    const queue = runtime.createPriorityQueue({ maxSize: 2, maxCriticalOverflow: 0 });
    const battleId = 'battle-retained-incomplete';
    queue.enqueue('battle_started', { battleId }, 1);
    queue.enqueue('battle_round', { battleId, round: { number: 1 } }, 2);
    queue.enqueue('battle_round', { battleId, round: { number: 2 } }, 3);
    expect(queue.enqueue('battle_completed', { battleId }, 4)).toBe(false);
    expect(queue.enqueue('battle_completed', { battleId }, 5)).toBe(false);

    expect(queue.snapshot()).toEqual([expect.objectContaining({ type: 'state_resync_required', data: { reason: 'critical_overflow' } })]);
  });

  test('keeps one sentinel while fingerprint history records compacted critical events', () => {
    const queue = runtime.createPriorityQueue({
      maxSize: 1,
      maxCriticalOverflow: 0,
      tombstoneAfterMs: 1_000_000
    });
    for (let index = 0; index < 100; index += 1) {
      const battleId = `battle-discarded-${index}`;
      queue.enqueue('battle_started', { battleId }, index * 2);
      queue.enqueue('battle_round', { battleId, round: { number: 1 } }, index * 2 + 1);
    }

    expect(queue.enqueue('battle_started', { battleId: 'battle-discarded-0' }, 1000)).toBe(false);
    expect(queue.snapshot()).toEqual([expect.objectContaining({ type: 'state_resync_required' })]);
  });

  test('allows reconnect snapshot initialization to replace prior critical overflow', () => {
    const queue = runtime.createPriorityQueue({
      maxSize: 2,
      maxCriticalOverflow: 0,
      tombstoneAfterMs: 10
    });
    const battleId = 'battle-expired-tombstone';
    queue.enqueue('battle_started', { battleId }, 1);
    queue.enqueue('battle_round', { battleId, round: { number: 1 } }, 2);
    queue.enqueue('battle_round', { battleId, round: { number: 2 } }, 3);
    expect(queue.enqueue('battle_completed', { battleId }, 5)).toBe(false);
    expect(queue.snapshot()).toEqual([expect.objectContaining({ type: 'state_resync_required' })]);

    queue.beginSnapshot();
    expect(queue.enqueue('battle_started', { battleId }, 20)).toBe(true);
    expect(queue.snapshot()).toEqual([
      expect.objectContaining({ type: 'battle_started', groupKey: `battle:${battleId}` })
    ]);
  });

  test('drops excess lower-priority durable events before a critical group', () => {
    const queue = runtime.createPriorityQueue({ maxSize: 3, maxCriticalOverflow: 0 });
    const battle = { battleId: 'battle-priority' };
    queue.enqueue('battle_started', battle, 1);
    queue.enqueue('battle_completed', battle, 2);
    queue.enqueue('hype_milestone', { milestone: 10 }, 3);
    queue.enqueue('quest_completed', { questId: 'quest-a' }, 4);

    expect(queue.size()).toBe(3);
    expect(queue.snapshot().map(entry => entry.type)).toEqual([
      'battle_started',
      'battle_completed',
      'hype_milestone'
    ]);
  });

  test('prepends a reconnect snapshot without displacing a critical group', () => {
    const queue = runtime.createPriorityQueue({ maxSize: 1, maxCriticalOverflow: 0 });
    queue.enqueue('battle_started', { battleId: 'battle-snapshot' }, 1);
    queue.prependSnapshot({ marker: 'latest-state' }, 2);
    expect(queue.size()).toBe(2);
    expect(queue.snapshot()).toEqual([
      expect.objectContaining({ type: 'state_snapshot', data: { marker: 'latest-state' } }),
      expect.objectContaining({
        type: 'battle_started',
        groupKey: 'battle:battle-snapshot'
      })
    ]);
  });

  test('clears pre-reconnect events and always prepends the fetched snapshot before socket arrivals', async () => {
    let resolveSnapshot;
    const queue = runtime.createPriorityQueue();
    queue.enqueue('chat_result', { stale: true });
    const controller = runtime.createReconnectController({
      queue,
      loadSnapshot: () => new Promise(resolve => { resolveSnapshot = resolve; })
    });

    const reconnect = controller.reconnect();
    queue.enqueue('egg_spawned', { eggId: 'fresh' });
    resolveSnapshot({ marker: 'snapshot' });
    await reconnect;

    expect(queue.snapshot().map(entry => entry.type)).toEqual(['state_snapshot', 'egg_spawned']);
    expect(queue.snapshot()[0].data).toEqual({ marker: 'snapshot' });
  });

  test('replays persisted battle events after the snapshot cursor while egg lifecycles restore from state', () => {
    const snapshot = {
      battle: {
        matches: [{
          matchId: 'match-live',
          cursor: 4
        }]
      },
      recentEvents: [{
        sequence: 19,
        eventId: 'battle-match-snapshot-already-has',
        correlationId: 'match-live',
        type: 'streammonsters:battle_match_found',
        payload: {
          matchId: 'match-live',
          fighters: []
        }
      }, {
        sequence: 20,
        eventId: 'battle-action-old',
        correlationId: 'match-live',
        type: 'streammonsters:battle_skill_used',
        payload: {
          matchId: 'match-live',
          action: { eventSequence: 4, choice: 'A' }
        }
      }, {
        sequence: 21,
        eventId: 'battle-action-new',
        correlationId: 'match-live',
        type: 'streammonsters:battle_skill_used',
        payload: {
          matchId: 'match-live',
          action: { eventSequence: 5, choice: 'B' }
        }
      }, {
        sequence: 22,
        eventId: 'egg-ready-public',
        correlationId: 'egg-public',
        type: 'streammonsters:egg_ready',
        payload: {
          displayName: 'Public Hatcher',
          egg: { element: 'Lunar', state: 'ready' }
        }
      }, {
        sequence: 23,
        eventId: 'battle-match-already-in-snapshot',
        correlationId: 'match-live',
        type: 'streammonsters:battle_match_found',
        payload: {
          matchId: 'match-live',
          fighters: []
        }
      }]
    };

    expect(runtime.replayableRecentEvents(snapshot, { afterSequence: 20 })).toEqual([
      expect.objectContaining({
        type: 'battle_skill_used',
        data: expect.objectContaining({
          eventId: 'battle-action-new',
          correlationId: 'match-live',
          action: expect.objectContaining({ eventSequence: 5 })
        })
      })
    ]);
  });

  test('does not replay egg lifecycle events and still deduplicates matching live delivery', () => {
    const snapshot = {
      battle: { matches: [] },
      recentEvents: [{
        sequence: 4,
        eventId: 'persisted-ready',
        correlationId: 'egg-correlation',
        type: 'streammonsters:egg_ready',
        payload: { displayName: 'Viewer', egg: { element: 'Grove' } }
      }, {
        sequence: 5,
        eventId: 'persisted-ready',
        correlationId: 'egg-correlation',
        type: 'streammonsters:egg_ready',
        payload: { displayName: 'Viewer', egg: { element: 'Grove' } }
      }]
    };
    const replay = runtime.replayableRecentEvents(snapshot);
    const queue = runtime.createPriorityQueue();

    expect(replay).toEqual([]);
    expect(queue.enqueue('egg_ready', {
      eventId: 'persisted-ready',
      correlationId: 'egg-correlation',
      displayName: 'Viewer',
      egg: { element: 'Grove' }
    }, 2)).toBe(true);
    expect(queue.enqueue('egg_ready', {
      eventId: 'persisted-ready',
      correlationId: 'egg-correlation',
      displayName: 'Viewer',
      egg: { element: 'Grove' }
    }, 3)).toBe(false);
    expect(queue.snapshot()).toHaveLength(1);
  });

  test('does not replay egg lifecycle events missed after the persisted public cursor', () => {
    const snapshot = {
      battle: { matches: [] },
      recentEvents: [{
        sequence: 9,
        eventId: 'already-cursor',
        type: 'streammonsters:egg_ready',
        payload: { displayName: 'One' }
      }, {
        sequence: 10,
        eventId: 'already-live',
        type: 'streammonsters:egg_ready',
        payload: { displayName: 'Two' }
      }, {
        sequence: 11,
        eventId: 'missed-while-offline',
        type: 'streammonsters:egg_ready',
        payload: { displayName: 'Three' }
      }]
    };

    expect(runtime.replayableRecentEvents(snapshot, {
      afterSequence: 9,
      seenEventIds: new Set(['already-live'])
    })).toEqual([]);
  });

  test.each([
    [{
      layout: 'portrait',
      quality: 'high',
      renderer: {
        renderer: 'webgpu',
        fps: 59.6,
        fallbackReason: null
      },
      audio: {
        channels: {
          master: { enabled: true, volume: 0.65 }
        }
      }
    }, {
      layout: 'portrait',
      profile: 'streammonsters-full-v1',
      view: 'full',
      renderer: {
        backend: 'webgpu',
        quality: 'high',
        fps: 60,
        deviceLost: false,
        fallbackReason: null
      },
      audio: {
        muted: false,
        masterVolume: 0.65
      }
    }],
    [{
      layout: 'landscape',
      quality: 'medium',
      renderer: {
        renderer: 'canvas2d',
        fps: 28,
        fallbackReason: 'device-lost'
      },
      audio: {
        channels: {
          master: { enabled: false, volume: 0.4 }
        }
      }
    }, {
      layout: 'landscape',
      profile: 'streammonsters-full-v1',
      view: 'full',
      renderer: {
        backend: 'canvas2d',
        quality: 'medium',
        fps: 28,
        deviceLost: true,
        fallbackReason: 'device-lost'
      },
      audio: {
        muted: true,
        masterVolume: 0.4
      }
    }]
  ])('builds a bounded OBS heartbeat for WebGPU and fallback diagnostics', (input, expected) => {
    expect(runtime.overlayHeartbeatPayload(input)).toEqual(expected);
  });

  test.each([
    ['landscape', 1920, 1080],
    ['portrait', 1080, 1920]
  ])('resolves all nine anchors and bounded scales for %s', (layout, width, height) => {
    const expectedOrigins = {
      'top-left': { x: 0.18, y: 0.18 },
      'top-center': { x: 0.5, y: 0.18 },
      'top-right': { x: 0.82, y: 0.18 },
      'middle-left': { x: 0.18, y: 0.5 },
      center: { x: 0.5, y: 0.5 },
      'middle-right': { x: 0.82, y: 0.5 },
      'bottom-left': { x: 0.18, y: 0.82 },
      'bottom-center': { x: 0.5, y: 0.82 },
      'bottom-right': { x: 0.82, y: 0.82 }
    };
    expect(runtime.ANCHORS).toEqual([
      'top-left', 'top-center', 'top-right',
      'middle-left', 'center', 'middle-right',
      'bottom-left', 'bottom-center', 'bottom-right'
    ]);
    for (const anchor of runtime.ANCHORS) {
      const resolved = runtime.resolveLayoutSettings({
        width,
        height,
        search: `?layout=${layout}&${layout}Anchor=${anchor}&${layout}Scale=113`
      });
      expect(resolved).toEqual(expect.objectContaining({ layout, anchor, scale: 113 }));
      expect(runtime.anchorPlacement(anchor)).toEqual(expect.objectContaining({
        align: expect.any(String),
        justify: expect.any(String)
      }));
      const effect = runtime.effectPlacement(anchor, 113);
      expect(effect.origin).toEqual(expectedOrigins[anchor]);
      expect(effect.scale).toBe(1.13);
    }
  });

  test('describes the exact hatch duration including the 30-second preset', () => {
    expect(runtime.hatchDurationSpec(30_000)).toEqual({
      key: 'duration30Seconds',
      params: { seconds: 30 }
    });
    expect(runtime.hatchDurationSpec(120_000)).toEqual({
      key: 'duration2Minutes',
      params: { minutes: 2 }
    });
  });

  test('uses specified defaults, validates URL overrides, and updates on resize without moving the battle arena', () => {
    expect(runtime.resolveLayoutSettings({ width: 1920, height: 1080, search: '' }))
      .toEqual(expect.objectContaining({ layout: 'landscape', anchor: 'bottom-center', scale: 100 }));
    expect(runtime.resolveLayoutSettings({ width: 1080, height: 1920, search: '' }))
      .toEqual(expect.objectContaining({ layout: 'portrait', anchor: 'center', scale: 100 }));
    expect(runtime.resolveLayoutSettings({
      width: 1920,
      height: 1080,
      search: '?layout=portrait&portraitAnchor=top-right&portraitScale=130&landscapeScale=69'
    })).toEqual(expect.objectContaining({ layout: 'portrait', anchor: 'top-right', scale: 130 }));

    const listeners = {};
    const stage = { dataset: {}, style: { setProperty: jest.fn() } };
    const battle = { dataset: {} };
    const windowLike = {
      innerWidth: 1920,
      innerHeight: 1080,
      location: { search: '' },
      addEventListener: jest.fn((type, handler) => { listeners[type] = handler; }),
      removeEventListener: jest.fn()
    };
    const controller = runtime.createLayoutController({ window: windowLike, stage, battle });
    expect(stage.dataset.anchor).toBe('bottom-center');
    expect(battle.dataset.layoutIndependent).toBe('true');
    windowLike.innerWidth = 900;
    windowLike.innerHeight = 1600;
    listeners.resize();
    expect(stage.dataset.anchor).toBe('center');
    expect(stage.dataset.layout).toBe('portrait');
    controller.destroy();
  });

  test('reports safe-zone rectangle collisions and non-collisions', () => {
    expect(runtime.rectanglesOverlap(
      { x: 10, y: 10, width: 100, height: 100 },
      { x: 80, y: 80, width: 100, height: 100 }
    )).toBe(true);
    expect(runtime.rectanglesOverlap(
      { x: 10, y: 10, width: 40, height: 40 },
      { x: 80, y: 80, width: 40, height: 40 }
    )).toBe(false);
    expect(runtime.safeZoneCollisions({
      reveal: { x: 30, y: 70, width: 40, height: 25 },
      reserved: {
        logo: { x: 2, y: 2, width: 20, height: 10 },
        hype: { x: 82, y: 2, width: 16, height: 16 },
        chat: { x: 2, y: 82, width: 35, height: 14 }
      }
    })).toEqual(['chat']);
  });
});
