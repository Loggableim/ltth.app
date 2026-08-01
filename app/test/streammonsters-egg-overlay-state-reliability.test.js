'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const runtime = require(
  '../plugins/stream-monsters/streammonsters-overlay-runtime'
);
const EggStageView = require(
  '../plugins/stream-monsters/streammonsters-egg-stage-view'
);
const ArenaDirector = require(
  '../plugins/stream-monsters/streammonsters-arena-director'
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

async function createOverlayHarness(snapshot, {
  portrait = false,
  lifecycleCommands = null
} = {}) {
  const html = fs.readFileSync(path.join(
    process.cwd(),
    'plugins',
    'streamalchemy',
    'streammonsters-overlay.html'
  ), 'utf8');
  const socketHandlers = new Map();
  const arenaCalls = [];
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
      window.matchMedia = query => ({
        matches: query === '(orientation: portrait)' ? portrait : false,
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
        if (url.includes('/locales/')) {
          return { ok: true, status: 200, json: async () => ({}) };
        }
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
        return {
          ok: true,
          status: 200,
          json: async () => (
            typeof snapshot === 'function' ? snapshot() : snapshot
          )
        };
      });
      window.StreamMonstersOverlayRuntime = runtime;
      window.StreamMonstersArenaDirector = ArenaDirector;
      window.StreamMonstersEggStageView = lifecycleCommands
        ? {
            ...EggStageView,
            buildEventPresentation(type, payload, options) {
              const notice = EggStageView.buildEventPresentation(
                type,
                payload,
                options
              );
              return notice ? { ...notice, commands: lifecycleCommands } : notice;
            }
          }
        : EggStageView;
      window.StreamMonstersPortraitArena = {
        normalizeVariant(value, fallback = 'classic') {
          return ['split-arena', 'classic'].includes(value) ? value : fallback;
        }
      };
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
          applyMatch: payload => arenaCalls.push(['applyMatch', payload]),
          applySnapshot: () => {},
          openChoice: () => {},
          lockChoice: () => {},
          revealChoices: () => {},
          playEvent: async (type, payload) => {
            arenaCalls.push(['playEvent', type, payload]);
            return true;
          },
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
    arenaCalls,
    pendingTimerDurations() {
      return [...timers.values()].map(timer => timer.milliseconds);
    },
    async runPendingTimers(maxPasses = 80) {
      let idlePasses = 0;
      for (let pass = 0; pass < maxPasses; pass += 1) {
        await flush();
        if (!timers.size) {
          idlePasses += 1;
          if (idlePasses >= 4) return;
          continue;
        }
        idlePasses = 0;
        const pending = [...timers.entries()];
        timers.clear();
        pending.forEach(([, timer]) => timer.callback());
      }
    },
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
  test('production compact lifecycle presenter owns show wait hide and clear', async () => {
    const documentLike = new JSDOM(`
      <!doctype html>
      <div id="egg-lifecycle-notice" hidden>
        <strong data-egg-notice-title></strong>
        <span data-egg-notice-action></span>
      </div>
    `).window.document;
    let finish;
    const waited = [];
    const presentation = EggStageView.presentCompactLifecycleNotice({
      document: documentLike,
      title: 'Egg ready to hatch',
      action: '!hatch 2',
      durationMs: 12_000,
      wait: milliseconds => {
        waited.push(milliseconds);
        return new Promise(resolve => { finish = resolve; });
      }
    });
    const notice = documentLike.getElementById('egg-lifecycle-notice');

    expect(notice.hidden).toBe(false);
    expect(notice.querySelector('[data-egg-notice-title]').textContent)
      .toBe('Egg ready to hatch');
    expect(notice.querySelector('[data-egg-notice-action]').textContent)
      .toBe('!hatch 2');
    expect(waited).toEqual([12_000]);

    finish();
    await expect(presentation).resolves.toBe(true);
    expect(notice.hidden).toBe(true);
    expect(notice.querySelector('[data-egg-notice-title]').textContent).toBe('');
    expect(notice.querySelector('[data-egg-notice-action]').textContent).toBe('');
  });

  test('uses only the compact two-line lifecycle notice in portrait and clears it', async () => {
    const offer = freeEgg('portrait-lifecycle', {
      timing: { publicAtMs: 1_000, expiresAtMs: 61_000 }
    });
    const harness = await createOverlayHarness({
      hype: { points: 0 },
      config: {
        hatchDurationMs: 90_000,
        notificationDurationMs: 12_000,
        portraitArenaVariant: 'split-arena'
      },
      gcce: { commandPrefix: '!', registeredCommands: [] },
      battle: { matches: [] },
      eggStage: [offer]
    }, {
      portrait: true,
      lifecycleCommands: ['!adopt', '!eggs']
    });
    try {
      harness.socketHandlers.get('streammonsters:free_egg_public')({
        eventId: 'portrait-lifecycle-public',
        correlationId: offer.visualId,
        eggStage: offer
      });
      for (let attempt = 0; attempt < 5; attempt += 1) await flush();

      const notice = harness.dom.window.document.getElementById(
        'egg-lifecycle-notice'
      );
      const card = harness.dom.window.document.getElementById('card');
      expect(notice).not.toBeNull();
      if (!notice) return;
      expect(notice.hidden).toBe(false);
      expect(Array.from(notice.children).filter(child => !child.hidden))
        .toHaveLength(2);
      expect(notice.querySelector('[data-egg-notice-title]').textContent.trim())
        .not.toBe('');
      const action = notice.querySelector('[data-egg-notice-action]').textContent;
      expect(action).toBe('!adopt \u00b7 !eggs');
      expect([...action].filter(character => character === '\u00b7')).toHaveLength(1);
      expect(action).not.toContain('\u00c2');
      const overlaySource = fs.readFileSync(path.join(
        process.cwd(),
        'plugins',
        'streamalchemy',
        'streammonsters-overlay.html'
      ), 'utf8');
      const compactJoinLine = overlaySource.split(/\r?\n/).find(line => (
        line.includes('const action = notice.commands')
      ));
      expect(compactJoinLine).toContain("join(' \\u00b7 ')");
      expect(compactJoinLine).not.toContain('\u00c2');
      expect(overlaySource).toContain(
        'StreamMonstersEggStageView.presentCompactLifecycleNotice'
      );
      expect(card.classList.contains('visible')).toBe(false);
      expect(card.hasAttribute('data-presentation')).toBe(false);
      expect(harness.pendingTimerDurations()).toContain(5_000);

      await harness.runPendingTimers();
      expect(notice.hidden).toBe(true);
      expect(notice.querySelector('[data-egg-notice-title]').textContent).toBe('');
      expect(notice.querySelector('[data-egg-notice-action]').textContent).toBe('');
    } finally {
      await harness.close();
    }
  });

  test('keeps portrait rail cards stationary when live eggs land', async () => {
    const offer = freeEgg('portrait-stationary', {
      provenance: 'gift',
      ownershipState: 'owned',
      adoptionStatus: 'owned',
      adoptable: false,
      state: 'incubating'
    });
    const harness = await createOverlayHarness({
      hype: { points: 0 },
      config: { hatchDurationMs: 90_000 },
      gcce: { commandPrefix: '!', registeredCommands: [] },
      battle: { matches: [] },
      eggStage: []
    }, { portrait: true });
    try {
      harness.socketHandlers.get('streammonsters:egg_landed')({
        eventId: 'portrait-stationary-landed',
        correlationId: offer.visualId,
        eggStage: offer
      });
      for (let attempt = 0; attempt < 5; attempt += 1) await flush();

      const card = harness.dom.window.document.querySelector(
        `[data-egg-id="${offer.visualId}"]`
      );
      expect(card).not.toBeNull();
      expect(card.classList).not.toContain('landing');
    } finally {
      await harness.close();
    }
  });

  test('uses the configured four-card circular rail from the live snapshot', async () => {
    const eggs = Array.from({ length: 7 }, (_, index) => freeEgg(`rail-${index}`, {
      provenance: 'gift',
      ownershipState: 'owned',
      adoptionStatus: 'owned',
      adoptable: false,
      state: 'incubating'
    }));
    const harness = await createOverlayHarness({
      hype: { points: 0 },
      config: { hatchDurationMs: 90_000, eggShelfVisibleCount: 4 },
      gcce: { commandPrefix: '!', registeredCommands: [] },
      battle: { matches: [] },
      eggStage: eggs
    }, { portrait: true });
    try {
      expect(harness.dom.window.document.querySelectorAll(
        '[data-egg-slots] [data-egg-id]'
      )).toHaveLength(4);
    } finally {
      await harness.close();
    }
  });

  test('re-renders the open rail when its visible-card config changes', async () => {
    const eggs = Array.from({ length: 7 }, (_, index) => freeEgg(`live-rail-${index}`, {
      provenance: 'gift',
      ownershipState: 'owned',
      adoptionStatus: 'owned',
      adoptable: false,
      state: 'incubating'
    }));
    const harness = await createOverlayHarness({
      hype: { points: 0 },
      config: { hatchDurationMs: 90_000, eggShelfVisibleCount: 4 },
      gcce: { commandPrefix: '!', registeredCommands: [] },
      battle: { matches: [] },
      eggStage: eggs
    }, { portrait: true });
    try {
      expect(harness.dom.window.document.querySelectorAll(
        '[data-egg-slots] [data-egg-id]'
      )).toHaveLength(4);

      const handler = harness.socketHandlers.get('streammonsters:config_updated');
      expect(handler).toEqual(expect.any(Function));
      handler({ config: { eggShelfVisibleCount: 2 } });

      expect(harness.dom.window.document.querySelectorAll(
        '[data-egg-slots] [data-egg-id]'
      )).toHaveLength(2);
    } finally {
      await harness.close();
    }
  });

  test('keeps the existing full lifecycle card path in landscape', async () => {
    const offer = freeEgg('landscape-lifecycle', {
      timing: { publicAtMs: 1_000, expiresAtMs: 61_000 }
    });
    const harness = await createOverlayHarness({
      hype: { points: 0 },
      config: {
        hatchDurationMs: 90_000,
        notificationDurationMs: 12_000,
        portraitArenaVariant: 'classic'
      },
      gcce: { commandPrefix: '!', registeredCommands: [] },
      battle: { matches: [] },
      eggStage: [offer]
    });
    try {
      harness.socketHandlers.get('streammonsters:free_egg_public')({
        eventId: 'landscape-lifecycle-public',
        correlationId: offer.visualId,
        eggStage: offer
      });
      for (let attempt = 0; attempt < 5; attempt += 1) await flush();

      expect(harness.dom.window.document.getElementById('card').classList)
        .toContain('visible');
      expect(harness.dom.window.document.getElementById('card').dataset.presentation)
        .toBe('egg-offer');
      const notice = harness.dom.window.document.getElementById(
        'egg-lifecycle-notice'
      );
      expect(notice).not.toBeNull();
      if (!notice) return;
      expect(notice.hidden).toBe(true);
    } finally {
      await harness.close();
    }
  });

  test('routes rivalry, READY and streak sockets through the shared arena director once', async () => {
    const harness = await createOverlayHarness({
      hype: { points: 0 },
      config: { hatchDurationMs: 90_000 },
      gcce: { commandPrefix: '!', registeredCommands: [] },
      battle: { matches: [] },
      eggStage: []
    });
    try {
      harness.socketHandlers.get('streammonsters:battle_match_found')({
        eventId: 'rivalry-live',
        matchId: 'match-live',
        rivalry: { count: 3, tier: 'rivals' }
      });
      harness.socketHandlers.get('streammonsters:battle_special_charged')({
        eventId: 'ready-live',
        matchId: 'match-live',
        slot: 1,
        charge: 100,
        monster: { name: 'Ashfang', element: 'Ember' }
      });
      harness.socketHandlers.get('streammonsters:win_streak')({
        eventId: 'streak-live',
        matchId: 'match-live',
        count: 5
      });
      await harness.runPendingTimers();

      expect(harness.arenaCalls.filter(call => call[0] === 'applyMatch'))
        .toHaveLength(1);
      expect(harness.arenaCalls.filter(call => (
        call[0] === 'playEvent' && call[1] === 'battle_match_found'
      ))).toHaveLength(1);
      expect(harness.arenaCalls.filter(call => (
        call[0] === 'playEvent' && call[1] === 'battle_special_charged'
      ))).toHaveLength(1);
      expect(harness.arenaCalls.filter(call => (
        call[0] === 'playEvent' && call[1] === 'win_streak'
      ))).toHaveLength(1);
    } finally {
      await harness.close();
    }
  });

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
      harness.dom.window.document.getElementById('hint').textContent = 'NEXT · !adopt';
      harness.socketHandlers.get('streammonsters:free_egg_claimed')({
        eventId: 'claim-now',
        correlationId: 'offer-blocked',
        removedEggStage: offer
      });

      expect(shelf.querySelector('[data-egg-id="offer-blocked"]')).toBeNull();
      expect(harness.dom.window.document.getElementById('hint').textContent)
        .not.toContain('!adopt');
    } finally {
      await harness.close();
    }
  });

  test('replaces a stale NEXT adopt hint after the authoritative claim delta', async () => {
    const offer = freeEgg('offer-next-hint');
    const harness = await createOverlayHarness({
      hype: { points: 0 },
      config: { hatchDurationMs: 90_000 },
      gcce: { commandPrefix: '!', registeredCommands: [] },
      battle: { matches: [] },
      eggStage: [offer]
    });
    try {
      const hint = harness.dom.window.document.getElementById('hint');
      hint.textContent = 'NEXT · !adopt';

      harness.socketHandlers.get('streammonsters:free_egg_claimed')({
        eventId: 'claim-next-hint',
        correlationId: 'offer-next-hint',
        removedEggStage: offer
      });

      expect(hint.textContent).not.toContain('!adopt');
      expect(hint.textContent).not.toMatch(/^NEXT\b/i);
      expect(hint.textContent.trim()).not.toBe('');
      expect(hint.dataset.eggNext).toBeUndefined();
      expect(harness.dom.window.document.getElementById('egg-next-persistent'))
        .toBeNull();
    } finally {
      await harness.close();
    }
  });

  test('restores adopt then hatch then general NEXT guidance after transient cards close', async () => {
    const firstOffer = freeEgg('offer-a', {
      timing: { publicAtMs: 1_000, expiresAtMs: 31_000 }
    });
    const secondOffer = freeEgg('offer-b', {
      timing: { publicAtMs: 1_000, expiresAtMs: 61_000 }
    });
    const readyEgg = {
      visualId: 'ready-next',
      provenance: 'gift',
      ownershipState: 'owned',
      adoptionStatus: 'owned',
      adoptable: false,
      displayName: 'Ready Viewer',
      element: 'Volt',
      variant: 'standard',
      state: 'ready',
      timing: { readyAtMs: 500, expiresAtMs: 121_000 }
    };
    const harness = await createOverlayHarness({
      hype: { points: 0 },
      config: { hatchDurationMs: 90_000 },
      gcce: { commandPrefix: '!', registeredCommands: [] },
      battle: { matches: [] },
      eggStage: [readyEgg, secondOffer, firstOffer]
    });
    const hint = harness.dom.window.document.getElementById('hint');
    try {
      harness.socketHandlers.get('streammonsters:egg_stage_updated')({
        eventId: 'establish-next-guidance',
        correlationId: 'offer-a',
        eggStage: firstOffer
      });
      expect(hint.textContent).toContain('!adopt');

      harness.socketHandlers.get('streammonsters:egg_ready')({
        eventId: 'ready-card-cycle',
        correlationId: 'ready-next',
        eggStage: readyEgg
      });
      await harness.runPendingTimers();
      expect(hint.textContent).toContain('!adopt');

      harness.socketHandlers.get('streammonsters:free_egg_claimed')({
        eventId: 'claim-first-offer',
        correlationId: 'offer-a',
        removedEggStage: firstOffer
      });
      await harness.runPendingTimers();
      expect(hint.textContent).toContain('!adopt');

      harness.socketHandlers.get('streammonsters:free_egg_claimed')({
        eventId: 'claim-second-offer',
        correlationId: 'offer-b',
        removedEggStage: secondOffer
      });
      await harness.runPendingTimers();
      expect(hint.textContent).toContain('!hatch');

      harness.socketHandlers.get('streammonsters:egg_stage_removed')({
        eventId: 'remove-ready',
        correlationId: 'ready-next',
        removedEggStage: readyEgg,
        eggStage: readyEgg
      });
      await harness.runPendingTimers();
      expect(hint.textContent).not.toContain('!adopt');
      expect(hint.textContent).not.toMatch(/no egg action/i);
      expect(hint.textContent).not.toMatch(/^NEXT\b/i);
      expect(hint.textContent).toContain('!eier');
      expect(hint.textContent.trim()).not.toBe('');
    } finally {
      await harness.close();
    }
  });

  test('keeps urgent adopt guidance in the egg-focus rail during a transient card', async () => {
    const offer = freeEgg('offer-visible-next', {
      timing: { publicAtMs: 1_000, expiresAtMs: 31_000 }
    });
    const harness = await createOverlayHarness({
      hype: { points: 0 },
      config: { hatchDurationMs: 90_000 },
      gcce: { commandPrefix: '!', registeredCommands: [] },
      battle: { matches: [] },
      eggStage: [offer]
    });
    try {
      const focus = harness.dom.window.document.querySelector('[data-egg-focus]');
      expect(focus.hidden).toBe(false);
      expect(focus.querySelector('[data-egg-focus-command]').textContent).toBe('!adopt');
      expect(harness.dom.window.document.getElementById('egg-next-persistent')).toBeNull();
      const landscapeNext = harness.dom.window.document.querySelector(
        '[data-egg-next-landscape]'
      );
      expect(landscapeNext).not.toBeNull();
      expect(landscapeNext.hidden).toBe(false);
      expect(landscapeNext.textContent).toContain('!adopt');

      harness.socketHandlers.get('streammonsters:achievement_unlocked')({
        eventId: 'unrelated-visible-card',
        correlationId: 'unrelated-visible-card',
        displayName: 'Collector',
        achievement: 'first_hatch'
      });
      await flush();

      expect(harness.dom.window.document.getElementById('card').classList).toContain('visible');
      expect(harness.dom.window.document.getElementById('hint').textContent).toContain('!adopt');
      expect(focus.querySelector('[data-egg-focus-command]').textContent).toBe('!adopt');
      expect(landscapeNext.hidden).toBe(false);
      expect(landscapeNext.textContent).toContain('!adopt');
    } finally {
      await harness.close();
    }
  });

  test('replays a buffered egg delta after a delayed warm-reconnect snapshot', async () => {
    const offer = freeEgg('offer-warm-reconnect');
    const olderSnapshot = {
      hype: { points: 0 },
      config: { hatchDurationMs: 90_000 },
      gcce: { commandPrefix: '!', registeredCommands: [] },
      battle: { matches: [] },
      eggStage: [offer]
    };
    let stateRequest = 0;
    let resolveWarmSnapshot;
    const harness = await createOverlayHarness(() => {
      stateRequest += 1;
      if (stateRequest === 1) return olderSnapshot;
      return new Promise(resolve => {
        resolveWarmSnapshot = resolve;
      });
    });
    try {
      const shelf = harness.dom.window.document.getElementById('egg-shelf');
      expect(shelf.querySelector('[data-egg-id="offer-warm-reconnect"]')).not.toBeNull();

      const reconnect = harness.socketHandlers.get('connect')();
      for (let attempt = 0; attempt < 10 && !resolveWarmSnapshot; attempt += 1) {
        await flush();
      }
      expect(resolveWarmSnapshot).toEqual(expect.any(Function));

      harness.socketHandlers.get('streammonsters:free_egg_claimed')({
        eventId: 'claim-during-warm-reconnect',
        correlationId: 'offer-warm-reconnect',
        removedEggStage: offer
      });
      resolveWarmSnapshot(olderSnapshot);
      await reconnect;
      for (let attempt = 0; attempt < 10; attempt += 1) await flush();

      expect(shelf.querySelector('[data-egg-id="offer-warm-reconnect"]')).toBeNull();
    } finally {
      await harness.close();
    }
  });

  test('never drops the oldest claim when reconnect buffers more than 256 deltas', async () => {
    const offer = freeEgg('offer-overflow-reconnect');
    const olderSnapshot = {
      hype: { points: 0 },
      config: { hatchDurationMs: 90_000 },
      gcce: { commandPrefix: '!', registeredCommands: [] },
      battle: { matches: [] },
      eggStage: [offer]
    };
    let stateRequest = 0;
    let resolveWarmSnapshot;
    const harness = await createOverlayHarness(() => {
      stateRequest += 1;
      if (stateRequest === 1) return olderSnapshot;
      return new Promise(resolve => {
        resolveWarmSnapshot = resolve;
      });
    });
    try {
      const shelf = harness.dom.window.document.getElementById('egg-shelf');
      const reconnect = harness.socketHandlers.get('connect')();
      for (let attempt = 0; attempt < 10 && !resolveWarmSnapshot; attempt += 1) {
        await flush();
      }
      expect(resolveWarmSnapshot).toEqual(expect.any(Function));

      harness.socketHandlers.get('streammonsters:free_egg_claimed')({
        eventId: 'oldest-overflow-claim',
        correlationId: 'offer-overflow-reconnect',
        removedEggStage: offer
      });
      for (let index = 0; index < 300; index += 1) {
        harness.socketHandlers.get('streammonsters:egg_stage_updated')({
          eventId: `overflow-update-${index}`,
          correlationId: `overflow-egg-${index}`,
          eggStage: freeEgg(`overflow-egg-${index}`, {
            ownershipState: 'owned',
            state: 'incubating',
            adoptionStatus: 'owned',
            adoptable: false
          })
        });
      }

      resolveWarmSnapshot(olderSnapshot);
      await reconnect;
      for (let attempt = 0; attempt < 10; attempt += 1) await flush();

      expect(shelf.querySelector('[data-egg-id="offer-overflow-reconnect"]')).toBeNull();
    } finally {
      await harness.close();
    }
  });

  test('removes owned free eggs and cancels their live landing timers', () => {
    const document = eggShelfDocument();
    const cancelled = [];
    const activeTimers = new Set();
    let timerId = 0;
    const view = EggStageView.createEggStageView({
      document,
      now: () => 1_000,
      setInterval: () => 1,
      clearInterval: () => {},
      setTimeout: () => {
        const handle = ++timerId;
        activeTimers.add(handle);
        return handle;
      },
      clearTimeout: handle => {
        cancelled.push(handle);
        activeTimers.delete(handle);
      }
    });
    [
      ['egg_ready', 'ready'],
      ['egg_boosted', 'incubating']
    ].forEach(([type, state]) => {
      const offer = freeEgg(`owned-free-${type}`);
      const owned = freeEgg(offer.visualId, {
        ownershipState: 'owned',
        adoptionStatus: 'owned',
        adoptable: false,
        state
      });

      expect(view.applyEvent('egg_landed', { eggStage: offer })).toBe(true);
      expect(view.model().total).toBe(1);
      expect(activeTimers.size).toBe(1);
      const landingHandle = [...activeTimers][0];

      expect(view.applyEvent(type, { eggStage: owned })).toBe(true);
      expect(view.model().total).toBe(0);
      expect(activeTimers.size).toBe(0);
      expect(cancelled.filter(handle => handle === landingHandle)).toHaveLength(1);
    });

    const cancellationsBeforeDestroy = cancelled.length;
    view.destroy();
    expect(cancelled).toHaveLength(cancellationsBeforeDestroy);
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
