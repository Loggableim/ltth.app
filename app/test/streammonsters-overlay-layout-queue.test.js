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
    }
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
