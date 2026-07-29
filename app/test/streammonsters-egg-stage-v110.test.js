const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);
const StreamMonstersEngine = require(
  '../plugins/streamalchemy/backend/streammonsters/game-engine'
);
const FreeEggDropService = require(
  '../plugins/streamalchemy/backend/streammonsters/free-egg-drop-service'
);
const EggStageProjector = require(
  '../plugins/streamalchemy/backend/streammonsters/egg-stage-projector'
);
const { safeAssetReference } = EggStageProjector;
const StreamMonstersRoutes = require(
  '../plugins/streamalchemy/backend/streammonsters/routes'
);
const StreamMonstersPublicEventProjector = require(
  '../plugins/streamalchemy/backend/streammonsters/public-event-projector'
);
const StreamAlchemyPlugin = require('../plugins/streamalchemy');

const activeFreeEggServices = new Set();

afterEach(() => {
  for (const service of activeFreeEggServices) service.destroy();
  activeFreeEggServices.clear();
});

function createSubject({
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
    config: { hatchDurationMs, eggExpiryMs }
  });
  engine.setStreamKey('creator:stream-1');
  store.upsertGiftMapping({
    giftId: 77,
    giftName: 'Team Heart',
    element: 'Ember',
    effect: 'spawn',
    enabled: true
  });
  const freeEggs = new FreeEggDropService({
    store,
    engine,
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => currentNow
  });
  activeFreeEggServices.add(freeEggs);
  return {
    sqlite,
    store,
    engine,
    freeEggs,
    emitted,
    now: () => currentNow,
    setNow(value) {
      currentNow = value;
    }
  };
}

function gift(subject, eventKey, userId = 'viewer-a') {
  return subject.engine.processGift({
    userId,
    displayName: 'Viewer A',
    avatarRef: 'https://unsafe.example/avatar.png',
    giftId: 77,
    giftName: 'Team Heart',
    eventKey
  });
}

function response() {
  return {
    body: null,
    json(body) {
      this.body = body;
      return this;
    },
    status() {
      return this;
    },
    sendFile: jest.fn()
  };
}

describe('Stream Monsters 1.10 egg ownership and public stage', () => {
  test('creates one owned gift egg and deduplicates the public egg_landed contract', () => {
    const subject = createSubject();

    const first = gift(subject, 'gift-event-1');
    const retry = gift(subject, 'gift-event-1');
    const egg = subject.store.getEgg(first.egg.egg_id);
    const landed = subject.emitted.filter(entry => (
      entry.event === 'streammonsters:egg_landed'
    ));

    expect(retry).toEqual({ type: 'duplicate', eventKey: 'gift-event-1' });
    expect(subject.store.getViewerEggs('viewer-a')).toHaveLength(1);
    expect(egg).toEqual(expect.objectContaining({
      provenance: 'gift',
      ownership_state: 'owned',
      display_name: 'Viewer A',
      avatar_ref: null
    }));
    expect(landed).toHaveLength(1);
    expect(landed[0].payload.eggStage).toEqual(expect.objectContaining({
      visualId: expect.stringMatching(/^egg-[a-f0-9]{24}$/),
      provenance: 'gift',
      element: 'Ember',
      variant: 'standard',
      state: 'incubating',
      displayName: 'Viewer A',
      avatarRef: null,
      queuePosition: null,
      adoptionStatus: 'owned',
      adoptable: false
    }));
    expect(JSON.stringify(landed[0].payload.eggStage))
      .not.toMatch(/viewer-a|gift-event-1|egg_id|user_id/);
  });

  test('keeps gift eggs non-adoptable when no free offer exists', () => {
    const subject = createSubject();
    const original = gift(subject, 'gift-event-1').egg;

    const result = subject.freeEggs.adopt({
      userId: 'viewer-b',
      streamKey: 'creator:stream-1',
      eventId: 'adopt-1',
      nowMs: 1_000
    });

    expect(result).toEqual(expect.objectContaining({
      success: false,
      status: 'no_offer'
    }));
    expect(subject.store.getEgg(original.egg_id)).toEqual(expect.objectContaining({
      user_id: 'viewer-a',
      provenance: 'gift',
      ownership_state: 'owned'
    }));
  });

  test('projects a reserved offer, releases it at 60 seconds, and preserves its visual on claim', () => {
    const subject = createSubject();
    const offered = subject.freeEggs.onFirstChat({
      userId: 'viewer-a',
      streamKey: 'creator:stream-1',
      eventId: 'chat-1',
      displayName: 'Viewer A',
      avatarRef: 'https://unsafe.example/avatar.png',
      nowMs: 1_000
    });
    const projector = new EggStageProjector({
      store: subject.store,
      now: subject.now
    });
    const reserved = projector.snapshot('creator:stream-1');
    const reservedEvent = subject.emitted.find(entry => (
      entry.event === 'streammonsters:free_egg_reserved'
    ));

    expect(reserved).toEqual([
      expect.objectContaining({
        provenance: 'free',
        state: 'reserved',
        displayName: 'Viewer A',
        avatarRef: null,
        adoptionStatus: 'reserved',
        adoptable: false,
        timing: expect.objectContaining({
          landedAtMs: 1_000,
          publicAtMs: 61_000
        })
      })
    ]);
    expect(reservedEvent.payload.eggStage).toEqual(expect.objectContaining({
      visualId: reserved[0].visualId,
      provenance: 'free',
      state: 'reserved',
      displayName: 'Viewer A',
      adoptionStatus: 'reserved',
      adoptable: false
    }));

    subject.setNow(61_000);
    subject.freeEggs.sweepAndRearm();
    const publicEvent = subject.emitted.find(entry => (
      entry.event === 'streammonsters:free_egg_public'
    ));
    expect(publicEvent.payload.eggStage).toEqual(expect.objectContaining({
      visualId: reserved[0].visualId,
      state: 'public',
      adoptionStatus: 'public',
      adoptable: true
    }));

    const claimed = subject.freeEggs.adopt({
      userId: 'viewer-b',
      streamKey: 'creator:stream-1',
      eventId: 'adopt-1',
      nowMs: 61_000
    });
    const claimedEvent = subject.emitted.find(entry => (
      entry.event === 'streammonsters:free_egg_claimed'
    ));
    expect(claimed).toEqual(expect.objectContaining({ success: true, status: 'claimed' }));
    expect(claimed.egg).toEqual(expect.objectContaining({
      provenance: 'free',
      ownership_state: 'owned',
      free_offer_id: offered.offerId
    }));
    expect(claimedEvent.payload.eggStage).toEqual(expect.objectContaining({
      visualId: reserved[0].visualId,
      provenance: 'free',
      state: 'incubating',
      adoptionStatus: 'owned',
      adoptable: false
    }));
  });

  test('projects queue, ready, and rotten transitions without exposing internal egg ids', () => {
    const subject = createSubject({ hatchDurationMs: 100, eggExpiryMs: 200 });
    const eggs = Array.from({ length: 4 }, (_, index) => (
      gift(subject, `gift-${index}`, 'viewer-a')
    ));
    const projector = new EggStageProjector({
      store: subject.store,
      now: subject.now
    });
    const initial = projector.snapshot('creator:stream-1');

    expect(initial.filter(entry => entry.state === 'incubating')).toHaveLength(3);
    expect(initial.filter(entry => entry.state === 'queued')).toEqual([
      expect.objectContaining({ queuePosition: 1, timing: expect.objectContaining({ readyAtMs: null }) })
    ]);

    subject.setNow(1_100);
    subject.engine.markReadyEggs();
    expect(projector.snapshot('creator:stream-1').filter(entry => entry.state === 'ready'))
      .toHaveLength(3);

    subject.setNow(1_300);
    subject.engine.markReadyEggs();
    const expiredUpdates = subject.emitted.filter(entry => (
      entry.event === 'streammonsters:egg_stage_updated' &&
      entry.payload.reason === 'expired'
    ));
    expect(expiredUpdates).toHaveLength(3);
    expect(expiredUpdates.map(entry => entry.payload.eggStage.state))
      .toEqual(['expired', 'expired', 'expired']);
    expect(JSON.stringify(expiredUpdates)).not.toContain(eggs[0].egg.egg_id);
  });

  test('removes safely expired gift eggs from the active shelf snapshot', () => {
    const subject = createSubject({ hatchDurationMs: 100, eggExpiryMs: 200 });
    gift(subject, 'gift-rotten');
    const projector = new EggStageProjector({
      store: subject.store,
      now: subject.now
    });

    subject.setNow(1_100);
    subject.engine.markReadyEggs();
    subject.setNow(1_300);
    subject.engine.markReadyEggs();

    expect(projector.snapshot('creator:stream-1')).toEqual([]);
    expect(subject.emitted).toContainEqual({
      event: 'streammonsters:egg_stage_updated',
      payload: expect.objectContaining({
        reason: 'expired',
        eggStage: expect.objectContaining({ state: 'expired' })
      })
    });
    expect(subject.emitted.filter(entry => (
      entry.event === 'streammonsters:egg_stage_removed'
    ))).toEqual([]);
  });

  test('expires outstanding free-offer stage entries when a stream is cleaned up', () => {
    const subject = createSubject();
    subject.freeEggs.onFirstChat({
      userId: 'viewer-a',
      streamKey: 'creator:stream-1',
      eventId: 'chat-1',
      displayName: 'Viewer A',
      nowMs: 1_000
    });

    expect(subject.freeEggs.cleanupStream({ streamKey: 'creator:stream-1' }))
      .toEqual({ offersRemoved: 1, eventsRemoved: 1 });
    expect(subject.store.getFreeEggOffers('creator:stream-1')[0])
      .toEqual(expect.objectContaining({
        status: 'expired',
        stage_state: 'expired'
      }));
    expect(subject.store.getNextFreeEggReservationDeadline()).toBeNull();
    expect(subject.freeEggs.releaseTimer).toBeNull();
    expect(subject.emitted).toContainEqual({
      event: 'streammonsters:egg_stage_removed',
      payload: expect.objectContaining({
        eggStage: expect.objectContaining({
          provenance: 'free',
          state: 'expired',
          adoptionStatus: 'expired',
          adoptable: false
        })
      })
    });
  });

  test('deduplicates stage-only critical events with stable public identities', () => {
    const subject = createSubject({ hatchDurationMs: 100, eggExpiryMs: 100 });
    gift(subject, 'gift-event-1');
    subject.freeEggs.onFirstChat({
      userId: 'viewer-b',
      streamKey: 'creator:stream-1',
      eventId: 'chat-1',
      displayName: 'Viewer B',
      nowMs: 1_000
    });
    subject.setNow(61_000);
    subject.freeEggs.sweepAndRearm();
    subject.freeEggs.cleanupStream({ streamKey: 'creator:stream-1' });
    const stageEvents = [
      'streammonsters:egg_landed',
      'streammonsters:free_egg_public',
      'streammonsters:egg_stage_removed'
    ].map(eventType => ({
      eventType,
      payload: subject.emitted.find(entry => entry.event === eventType).payload
    }));
    const api = { emit: jest.fn(), log: jest.fn() };
    const plugin = new StreamAlchemyPlugin(api);
    plugin.streamMonstersStore = subject.store;
    plugin.streamMonstersEngine = { streamKey: 'creator:stream-1' };
    plugin.streamMonstersPublicEventProjector =
      new StreamMonstersPublicEventProjector({ store: subject.store });

    stageEvents.forEach(({ eventType, payload }) => {
      expect(payload).toEqual(expect.objectContaining({
        eventId: expect.stringMatching(/^sm-[a-f0-9]{32}$/),
        correlationId: expect.stringMatching(/^sm-[a-f0-9]{32}$/)
      }));
      const first = plugin.emitStreamMonsters(eventType, payload);
      const replay = plugin.emitStreamMonsters(eventType, payload);
      expect(replay.eventId).toBe(first.eventId);
      expect(replay.correlationId).toBe(first.correlationId);
    });

    expect(api.emit).toHaveBeenCalledTimes(3);
    expect(subject.store.getRecentPublicEvents('creator:stream-1')).toHaveLength(3);
  });

  test('accepts exact packaged assets but rejects traversal-shaped avatar references', () => {
    expect(safeAssetReference(
      '/plugins/streamalchemy/assets/eggs/ember-standard.png'
    )).toBe('/plugins/streamalchemy/assets/eggs/ember-standard.png');
    [
      '/plugins/streamalchemy/assets/../private.txt',
      '/plugins/streamalchemy/assets/%2e%2e/private.txt',
      '/plugins/streamalchemy/assets/eggs/../../private.txt',
      '/plugins/streamalchemy/assets//eggs/ember-standard.png',
      '/plugins/streamalchemy/assets\\..\\private.txt'
    ].forEach(reference => expect(safeAssetReference(reference)).toBeNull());
  });

  test('migrates unknown egg provenance to owned legacy and never makes it adoptable', () => {
    const subject = createSubject();
    const egg = gift(subject, 'gift-event-1').egg;
    subject.store.db.prepare(`
      UPDATE streammonsters_eggs
      SET provenance = '', ownership_state = ''
      WHERE egg_id = ?
    `).run(egg.egg_id);

    subject.store.initialize();

    expect(subject.store.getEgg(egg.egg_id)).toEqual(expect.objectContaining({
      provenance: 'legacy',
      ownership_state: 'owned'
    }));
    expect(new EggStageProjector({ store: subject.store }).snapshot('creator:stream-1'))
      .toEqual([
        expect.objectContaining({
          provenance: 'legacy',
          adoptionStatus: 'owned',
          adoptable: false
        })
      ]);
  });

  test('migrates legacy free-offer status constraints without losing persisted rows', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE streammonsters_free_egg_offers (
        offer_id TEXT PRIMARY KEY,
        stream_key TEXT NOT NULL,
        source_user_id TEXT NOT NULL,
        source_display_name TEXT,
        offer_event_id TEXT NOT NULL UNIQUE,
        offered_at_ms INTEGER NOT NULL,
        reserved_until_ms INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('reserved', 'public', 'claimed')),
        claimed_by_user_id TEXT,
        claimed_at_ms INTEGER,
        UNIQUE (stream_key, source_user_id)
      );
      INSERT INTO streammonsters_free_egg_offers (
        offer_id, stream_key, source_user_id, source_display_name,
        offer_event_id, offered_at_ms, reserved_until_ms, status
      ) VALUES (
        'legacy-offer', 'creator:legacy', 'viewer-a', 'Viewer A',
        'legacy-chat', 1000, 61000, 'reserved'
      );
    `);
    sqlite.pragma('foreign_keys = ON');
    const store = new StreamMonstersDatabase(sqlite);

    store.initialize();
    store.cleanupFreeEggStream('creator:legacy');

    expect(store.getFreeEggOffer('legacy-offer')).toEqual(expect.objectContaining({
      status: 'expired',
      stage_state: 'expired'
    }));
    expect(sqlite.prepare(`
      SELECT sql FROM sqlite_master
      WHERE type = 'table' AND name = 'streammonsters_free_egg_offers'
    `).get().sql).toContain("'expired'");
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  test('includes the sanitized eggStage in the reconnect-safe public state route', () => {
    const subject = createSubject();
    const landed = gift(subject, 'gift-event-1');
    const registered = [];
    const routes = new StreamMonstersRoutes({
      api: {
        registerRoute(method, routePath, handler) {
          registered.push({ method, routePath, handler });
        },
        emit: jest.fn()
      },
      pluginDir: process.cwd(),
      dataDir: process.cwd(),
      store: subject.store,
      engine: subject.engine,
      giftCatalogProvider: () => [],
      configProvider: {
        getConfig: () => ({
          streamMonsters: { hatchDurationMs: 120_000 }
        }),
        updateConfig: jest.fn()
      }
    });
    routes.register();
    const handler = registered.find(entry => (
      entry.method === 'GET' && entry.routePath === '/api/streammonsters/state'
    )).handler;
    const res = response();

    handler({ query: {} }, res);

    expect(res.body.eggStage).toEqual([
      expect.objectContaining({
        visualId: subject.engine.eggStageProjector.projectEgg(landed.egg).visualId,
        provenance: 'gift',
        adoptionStatus: 'owned'
      })
    ]);
    expect(JSON.stringify(res.body.eggStage))
      .not.toMatch(/viewer-a|egg_id|user_id|gift_id|seed/);
  });
});
