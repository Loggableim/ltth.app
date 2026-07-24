'use strict';

const runtime = require('../plugins/streamalchemy/streammonsters-overlay-runtime');

describe('Stream Monsters overlay layout and critical queue', () => {
  test('keeps spawn, hatch and every battle skill event in indivisible critical groups', () => {
    for (const type of [
      'egg_spawned',
      'hatch_started',
      'egg_hatched',
      'battle_started',
      'battle_skill_used',
      'battle_special_charged',
      'battle_round',
      'battle_completed'
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

  test('drops an entire oldest critical group at the hard limit, never a partial group', () => {
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

    expect(queue.size()).toBeLessThanOrEqual(7);
    expect(queue.snapshot().filter(entry => entry.groupKey === 'battle:battle-oldest')).toHaveLength(0);
    expect(queue.snapshot().filter(entry => entry.groupKey === 'battle:battle-newest').map(entry => entry.type))
      .toEqual([
        'battle_started',
        'battle_round',
        'battle_round',
        'battle_round',
        'battle_completed'
      ]);
  });

  test('never admits a retransmitted terminal event from a discarded incomplete group', () => {
    const queue = runtime.createPriorityQueue({ maxSize: 2, maxCriticalOverflow: 0 });
    const battleId = 'battle-discarded-incomplete';
    queue.enqueue('battle_started', { battleId }, 1);
    queue.enqueue('battle_round', { battleId, round: { number: 1 } }, 2);
    queue.enqueue('battle_round', { battleId, round: { number: 2 } }, 3);
    queue.enqueue('battle_completed', { battleId }, 4);
    queue.enqueue('battle_completed', { battleId }, 5);

    expect(queue.snapshot()).toHaveLength(0);
  });

  test('bounds discarded-group tombstones and evicts the oldest deterministically', () => {
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

    expect(queue.enqueue('battle_started', { battleId: 'battle-discarded-0' }, 1000)).toBe(true);
    expect(queue.snapshot()).toEqual([
      expect.objectContaining({ groupKey: 'battle:battle-discarded-0' })
    ]);
  });

  test('expires discarded-group tombstones after the configured retention window', () => {
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

  test('keeps the strict bound when a snapshot leaves no room for a single critical group', () => {
    const queue = runtime.createPriorityQueue({ maxSize: 1, maxCriticalOverflow: 0 });
    queue.enqueue('battle_started', { battleId: 'battle-snapshot' }, 1);
    queue.prependSnapshot({ marker: 'latest-state' }, 2);
    expect(queue.size()).toBe(1);
    expect(queue.snapshot()).toEqual([
      expect.objectContaining({ type: 'state_snapshot', data: { marker: 'latest-state' } })
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
