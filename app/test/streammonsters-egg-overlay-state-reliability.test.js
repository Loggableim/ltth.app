'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const runtime = require(
  '../plugins/streamalchemy/streammonsters-overlay-runtime'
);
const EggStageView = require(
  '../plugins/streamalchemy/streammonsters-egg-stage-view'
);
const ArenaDirector = require(
  '../plugins/streamalchemy/streammonsters-arena-director'
);

const flush = () => new Promise(resolve => setImmediate(resolve));

function eggShelfDocument() {
  return new JSDOM(`
    <!doctype html>
    <section id="egg-shelf">
      <div data-egg-slots></div>
      <div data-egg-overflow></div>
    </section>
  `).window.document;
}

function freeEgg(visualId, overrides = {}) {
  return {
    visualId,
    provenance: 'free',
    ownershipState: 'offered',
    adoptionStatus: 'public',
    adoptable: true,
    displayName: 'Viewer',
    element: 'Grove',
    variant: 'standard',
    state: 'public',
    timing: { publicAtMs: 1_000, expiresAtMs: 61_000 },
    ...overrides
  };
}

async function createOverlayHarness(snapshot) {
  const html = fs.readFileSync(path.join(
    process.cwd(),
    'plugins',
    'streamalchemy',
    'streammonsters-overlay.html'
  ), 'utf8');
  const socketHandlers = new Map();
  const timers = new Map();
  let timerId = 0;
  const dom = new JSDOM(html, {
    url: 'http://localhost:3001/plugins/streamalchemy/streammonsters-overlay.html',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.Date.now = () => 1_000;
      window.setTimeout = (callback, milliseconds = 0) => {
        const id = ++timerId;
        timers.set(id, { callback, milliseconds });
        return id;
      };
      window.clearTimeout = id => timers.delete(id);
      window.setInterval = () => ++timerId;
      window.clearInterval = () => {};
      window.matchMedia = () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {}
      });
      window.i18n = {
        init: async () => {},
        updateDOM: () => {},
        t: key => key
      };
      window.io = () => ({
        on: (event, handler) => socketHandlers.set(event, handler)
      });
      window.fetch = jest.fn(async input => {
        const url = String(input);
        if (url.includes('/assets/audio/manifest.json')) {
          return { ok: false, status: 404, json: async () => ({}) };
        }
        if (url.includes('/overlay/heartbeat')) {
          return { ok: true, status: 200, json: async () => ({ success: true }) };
        }
        if (url.includes('/battles/')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ cursor: 0, hasMore: false, events: [] })
          };
        }
        return { ok: true, status: 200, json: async () => snapshot };
      });
      window.StreamMonstersOverlayRuntime = runtime;
      window.StreamMonstersArenaDirector = ArenaDirector;
      window.StreamMonstersEggStageView = EggStageView;
      window.StreamMonstersEffectsRenderer = {
        createEffectsRenderer: () => ({
          init: async () => true,
          resize: () => {},
          play: async () => true,
          status: () => ({ backend: 'canvas2d' })
        })
      };
      window.StreamMonstersArenaView = {
        createArenaView: () => ({
          applyMatch: () => {},
          applySnapshot: () => {},
          openChoice: () => {},
          lockChoice: () => {},
          revealChoices: () => {},
          playAction: async () => true,
          complete: async () => {},
          cancel: async () => {},
          destroy: () => {}
        })
      };
      window.StreamMonstersChatView = {
        createChatView: () => ({ show: async () => {} }),
        displayName: (payload, fallback) => payload?.displayName || fallback
      };
    }
  });
  for (let attempt = 0; attempt < 30 && !socketHandlers.has('connect'); attempt += 1) {
    await flush();
  }
  expect(socketHandlers.has('connect')).toBe(true);
  await socketHandlers.get('connect')();
  for (let attempt = 0; attempt < 5; attempt += 1) await flush();
  return {
    dom,
    socketHandlers,
    async close() {
      for (let pass = 0; pass < 20 && timers.size; pass += 1) {
        const pending = [...timers.entries()];
        timers.clear();
        pending.forEach(([, timer]) => timer.callback());
        await flush();
      }
      dom.window.close();
    }
  };
}

describe('Stream Monsters egg overlay state reliability', () => {
  test('does not replay egg lifecycle events after an authoritative snapshot', () => {
    const snapshot = {
      eggStage: [],
      battle: {
        matches: [{
          matchId: 'battle-replay',
          cursor: 4
        }]
      },
      recentEvents: [
        {
          sequence: 5,
          eventId: 'egg-landed',
          type: 'streammonsters:egg_landed',
          payload: { eggStage: { visualId: 'egg-missed', state: 'incubating' } }
        },
        {
          sequence: 6,
          eventId: 'egg-ready',
          type: 'streammonsters:egg_ready',
          payload: { eggStage: { visualId: 'egg-missed', state: 'ready' } }
        },
        {
          sequence: 7,
          eventId: 'egg-hatched',
          type: 'streammonsters:egg_hatched',
          payload: { eggStage: { visualId: 'egg-missed', state: 'hatched' } }
        },
        {
          sequence: 8,
          eventId: 'egg-removed',
          type: 'streammonsters:egg_stage_removed',
          payload: { eggStage: { visualId: 'egg-missed', state: 'hatched' } }
        },
        {
          sequence: 9,
          eventId: 'battle-action',
          type: 'streammonsters:battle_skill_used',
          payload: {
            matchId: 'battle-replay',
            action: { matchId: 'battle-replay', eventSequence: 5 }
          }
        }
      ]
    };

    expect(runtime.replayableRecentEvents(snapshot, { afterSequence: 0 }))
      .toEqual([{
        type: 'battle_skill_used',
        data: {
          matchId: 'battle-replay',
          action: { matchId: 'battle-replay', eventSequence: 5 },
          eventId: 'battle-action'
        },
        sequence: 9
      }]);
  });

  test('keeps hatch wait cards for different viewers independently', () => {
    const queue = runtime.createPriorityQueue({
      staleAfterMs: 10,
      maxSize: 10
    });
    queue.enqueue('chat_result', {
      displayName: '@alpha',
      command: 'hatch',
      result: { status: 'egg_not_ready', wait: { remainingMs: 90_000 } }
    }, 1);
    queue.enqueue('chat_result', {
      displayName: '@beta',
      command: 'hatch',
      result: { status: 'egg_not_ready', wait: { remainingMs: 45_000 } }
    }, 2);

    expect(queue.snapshot().map(entry => entry.data.displayName))
      .toEqual(['@alpha', '@beta']);
    expect(queue.shift(1_000)?.data.displayName).toBe('@alpha');
    expect(queue.shift(1_000)?.data.displayName).toBe('@beta');
  });

  test('coalesces ordinary chat results by sanitized viewer, command and status', () => {
    const queue = runtime.createPriorityQueue({ maxSize: 10 });
    const result = (displayName, command, status, message) => ({
      displayName,
      command,
      result: { status, message }
    });
    queue.enqueue(
      'chat_result',
      result(' \u0000@Alpha ', 'HATCH', 'egg_not_found', 'old'),
      1
    );
    queue.enqueue(
      'chat_result',
      result('@beta', 'hatch', 'egg_not_found', 'beta'),
      2
    );
    queue.enqueue(
      'chat_result',
      result('@alpha', 'hatch', 'egg_not_found', 'latest'),
      3
    );
    queue.enqueue(
      'chat_result',
      result('@alpha', 'eggs', 'egg_not_found', 'other-command'),
      4
    );
    queue.enqueue(
      'chat_result',
      result('@alpha', 'hatch', 'inventory', 'other-status'),
      5
    );

    expect(queue.snapshot().map(entry => entry.data.result.message)).toEqual([
      'beta',
      'latest',
      'other-command',
      'other-status'
    ]);
  });

  test('applies claim removal immediately while a prior presentation is blocked', async () => {
    const offer = freeEgg('offer-blocked');
    const harness = await createOverlayHarness({
      hype: { points: 0 },
      config: { hatchDurationMs: 90_000 },
      gcce: { commandPrefix: '!', registeredCommands: [] },
      battle: { matches: [] },
      eggStage: [offer]
    });
    try {
      const shelf = harness.dom.window.document.getElementById('egg-shelf');
      expect(shelf.querySelector('[data-egg-id="offer-blocked"]')).not.toBeNull();

      harness.socketHandlers.get('streammonsters:egg_spawned')({
        eventId: 'long-card',
        correlationId: 'long-card-correlation',
        displayName: '@alpha',
        egg: { element: 'Grove', variant: 'standard' }
      });
      harness.socketHandlers.get('streammonsters:free_egg_claimed')({
        eventId: 'claim-now',
        correlationId: 'offer-blocked',
        removedEggStage: offer
      });

      expect(shelf.querySelector('[data-egg-id="offer-blocked"]')).toBeNull();
    } finally {
      await harness.close();
    }
  });

  test('ignores owned free inventory eggs on live ready and boost events', () => {
    const document = eggShelfDocument();
    const cancelled = [];
    let timerId = 0;
    const view = EggStageView.createEggStageView({
      document,
      now: () => 1_000,
      setInterval: () => 1,
      clearInterval: () => {},
      setTimeout: () => ++timerId,
      clearTimeout: handle => cancelled.push(handle)
    });
    const offer = freeEgg('owned-free');
    const owned = freeEgg('owned-free', {
      ownershipState: 'owned',
      adoptionStatus: 'owned',
      adoptable: false,
      state: 'ready'
    });

    view.applySnapshot([offer]);
    cancelled.length = 0;
    expect(view.applyEvent('egg_ready', { eggStage: owned })).toBe(true);
    expect(view.model().total).toBe(0);
    expect(cancelled).not.toHaveLength(0);

    view.applySnapshot([offer]);
    cancelled.length = 0;
    expect(view.applyEvent('egg_boosted', {
      eggStage: { ...owned, state: 'incubating' }
    })).toBe(true);
    expect(view.model().total).toBe(0);
    expect(cancelled).not.toHaveLength(0);
  });

  test('coalesces repeated free-offer prompts without delaying shelf state', () => {
    const document = eggShelfDocument();
    const view = EggStageView.createEggStageView({
      document,
      now: () => 1_000,
      setInterval: () => 1,
      clearInterval: () => {},
      setTimeout: () => 1,
      clearTimeout: () => {}
    });
    const queue = runtime.createPriorityQueue({ maxSize: 10 });
    const transitions = [
      ['free_egg_reserved', freeEgg('offer-repeat', {
        displayName: '@first',
        state: 'reserved',
        adoptionStatus: 'reserved',
        adoptable: false
      })],
      ['free_egg_reserved', freeEgg('offer-repeat', {
        displayName: '@latest-reserved',
        state: 'reserved',
        adoptionStatus: 'reserved',
        adoptable: false
      })],
      ['free_egg_public', freeEgg('offer-repeat', { displayName: '@first-public' })],
      ['free_egg_public', freeEgg('offer-repeat', { displayName: '@latest-public' })]
    ];

    transitions.forEach(([type, eggStage], index) => {
      expect(view.applyEvent(type, { eggStage })).toBe(true);
      expect(view.model().visible[0].displayName).toBe(eggStage.displayName);
      queue.enqueue(type, {
        eventId: `offer-event-${index}`,
        correlationId: 'offer-repeat',
        eggStage
      }, index + 1);
    });

    expect(queue.snapshot().map(entry => [
      entry.type,
      entry.data.eggStage.displayName
    ])).toEqual([
      ['free_egg_reserved', '@latest-reserved'],
      ['free_egg_public', '@latest-public']
    ]);
  });
});
