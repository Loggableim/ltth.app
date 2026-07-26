const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');
const ChatCommands = require('../plugins/streamalchemy/backend/streammonsters/chat-commands');

function createLoop({
  now = 1_000,
  hatchDurationMs = 120_000,
  eggExpiryMs = 86_400_000
} = {}) {
  const sqlite = new Database(':memory:');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  const emitted = [];
  let currentNow = now;
  const engine = new StreamMonstersEngine({
    store,
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => currentNow,
    config: { hatchDurationMs, eggExpiryMs, maxUnhatchedEggs: 3 }
  });
  engine.setStreamKey('creator:stream-1');
  store.upsertGiftMapping({
    giftId: 77,
    giftName: 'Team Heart',
    element: 'Random',
    effect: 'spawn',
    enabled: true
  });
  const commands = new ChatCommands({
    store,
    engine,
    battleService: {},
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => currentNow
  });
  return {
    sqlite,
    store,
    engine,
    commands,
    emitted,
    setNow(value) {
      currentNow = value;
    }
  };
}

describe('Stream Monsters 1.5 durable gift and egg loop', () => {
  test('deduplicates a stable provider gift event transactionally without swallowing repeats', () => {
    const { store, engine } = createLoop();

    const first = engine.processGift({
      userId: 'viewer-a',
      giftId: 77,
      giftName: 'Team Heart',
      eventKey: 'tiktok:event-abc:repeat-1'
    });
    const retry = engine.processGift({
      userId: 'viewer-a',
      giftId: 77,
      giftName: 'Team Heart',
      eventKey: 'tiktok:event-abc:repeat-1'
    });
    const legitimateRepeat = engine.processGift({
      userId: 'viewer-a',
      giftId: 77,
      giftName: 'Team Heart',
      eventKey: 'tiktok:event-abc:repeat-2'
    });

    expect(first.type).toBe('spawned');
    expect(retry).toEqual({ type: 'duplicate', eventKey: 'tiktok:event-abc:repeat-1' });
    expect(legitimateRepeat.type).toBe('spawned');
    expect(store.getViewerEggs('viewer-a')).toHaveLength(2);
    expect(store.getViewerProgress('viewer-a').gifts_sent).toBe(2);
  });

  test('persists one six-element Random shuffle bag per stream and gift mapping', () => {
    const loop = createLoop();
    const firstCycle = Array.from({ length: 6 }, (_, index) => loop.engine.processGift({
      userId: `viewer-${index}`,
      giftId: 77,
      giftName: 'Team Heart',
      eventKey: `event-${index}`
    }).gift.element);

    const restarted = new StreamMonstersEngine({
      store: loop.store,
      now: () => 1_000,
      config: { hatchDurationMs: 120_000 }
    });
    restarted.setStreamKey('creator:stream-1');
    const seventh = restarted.processGift({
      userId: 'viewer-next',
      giftId: 77,
      giftName: 'Team Heart',
      eventKey: 'event-6'
    }).gift.element;

    expect(new Set(firstCycle)).toEqual(new Set([
      'Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar'
    ]));
    expect(firstCycle).toHaveLength(6);
    expect(['Ember', 'Tide', 'Grove', 'Gale', 'Volt', 'Lunar']).toContain(seventh);
    expect(loop.store.getElementBag('creator:stream-1', 77)).toEqual(expect.objectContaining({
      cycle: 1,
      position: 1
    }));
  });

  test('uses exactly three incubators while ready eggs free slots for FIFO promotion', () => {
    const loop = createLoop({ now: 1_000, hatchDurationMs: 100 });
    for (let index = 0; index < 5; index += 1) {
      loop.engine.processGift({
        userId: 'viewer-a',
        giftId: 77,
        giftName: 'Team Heart',
        eventKey: `fifo-${index}`
      });
    }

    expect(loop.store.getViewerEggs('viewer-a').map(egg => egg.state).sort())
      .toEqual(['incubating', 'incubating', 'incubating', 'queued', 'queued']);
    expect(loop.store.getQueuedEggs('viewer-a').map(egg => egg.queue_position))
      .toEqual([1, 2]);

    loop.setNow(1_100);
    loop.engine.markReadyEggs();

    expect(loop.store.getViewerEggs('viewer-a').map(egg => egg.state).sort())
      .toEqual(['incubating', 'incubating', 'ready', 'ready', 'ready']);
    expect(loop.store.getViewerEggs('viewer-a', 'incubating').map(egg => egg.queued_at_ms))
      .toEqual([1_000, 1_000]);
  });

  test('returns exact early-hatch wait data and an upper large egg card', () => {
    const { commands } = createLoop({ now: 50_000, hatchDurationMs: 120_000 });
    commands.engine.processGift({
      userId: 'viewer-a',
      giftId: 77,
      giftName: 'Team Heart',
      eventKey: 'wait-event'
    });

    expect(commands.execute({ userId: 'viewer-a' }, 'hatch', ['1'])).toEqual({
      success: false,
      status: 'egg_not_ready',
      message: 'That egg is not ready yet. Check !eggs.',
      wait: {
        slot: 1,
        state: 'incubating',
        readyAtMs: 170_000,
        remainingMs: 120_000
      },
      card: expect.objectContaining({
        type: 'egg_wait',
        size: 'large',
        placement: 'upper',
        slot: 1,
        readyAtMs: 170_000,
        remainingMs: 120_000
      })
    });
  });

  test('expires an unclaimed egg exactly 24 hours after ready_at and cannot hatch it', () => {
    const loop = createLoop({ now: 1_000, hatchDurationMs: 100 });
    const egg = loop.engine.processGift({
      userId: 'viewer-a',
      giftId: 77,
      giftName: 'Team Heart',
      eventKey: 'expiry-event'
    }).egg;

    loop.setNow(1_100);
    loop.engine.markReadyEggs();
    expect(loop.store.getEgg(egg.egg_id).state).toBe('ready');

    loop.setNow(86_401_100);
    loop.engine.markReadyEggs();

    expect(loop.store.getEgg(egg.egg_id)).toEqual(expect.objectContaining({
      state: 'expired',
      ready_at_ms: 1_100,
      expires_at_ms: 86_401_100,
      expired_at_ms: 86_401_100
    }));
    expect(loop.commands.execute({ userId: 'viewer-a' }, 'hatch', ['1']))
      .toEqual(expect.objectContaining({ success: false, status: 'egg_not_found' }));
    expect(loop.emitted).toContainEqual(expect.objectContaining({
      event: 'streammonsters:egg_expired',
      payload: expect.objectContaining({ userId: 'viewer-a' })
    }));
  });

  test('removes free adopt ingress while retaining historical starter rows', () => {
    const { store, commands, engine } = createLoop();
    store.db.prepare(`
      INSERT INTO streammonsters_starter_claims (user_id, egg_id, claimed_at_ms)
      VALUES ('legacy-viewer', 'legacy-starter', 123)
    `).run();

    expect(commands.execute({ userId: 'new-viewer' }, 'adopt', [])).toEqual({
      success: false,
      status: 'ignored'
    });
    expect(store.getViewerEggs('new-viewer')).toEqual([]);
    expect(engine.adoptStarter).toBeUndefined();
    expect(store.claimStarterEgg).toBeUndefined();
    expect(store.getStarterClaim('legacy-viewer')).toEqual({
      user_id: 'legacy-viewer',
      egg_id: 'legacy-starter',
      claimed_at_ms: 123
    });
  });

  test('keeps Hype overflow while awarding every complete charged egg', () => {
    const { store, engine } = createLoop();
    store.addStreamHype('creator:stream-1', 90, 1);

    expect(engine.addHype(25)).toEqual(expect.objectContaining({
      points: 15,
      charged_eggs: 1
    }));
    expect(engine.addHype(200)).toEqual(expect.objectContaining({
      points: 15,
      charged_eggs: 3
    }));
  });
});
