const Database = require('better-sqlite3');
const os = require('os');
const path = require('path');
const StreamAlchemyPlugin = require('../plugins/stream-monsters');
const StreamMonstersStore = require(
  '../plugins/stream-monsters/backend/streammonsters/database'
);
const StreamMonstersEngine = require(
  '../plugins/stream-monsters/backend/streammonsters/game-engine'
);
const FreeEggDropService = require(
  '../plugins/stream-monsters/backend/streammonsters/free-egg-drop-service'
);
const ChatCommands = require(
  '../plugins/stream-monsters/backend/streammonsters/chat-commands'
);

const activeServices = new Set();

afterEach(() => {
  activeServices.forEach(service => service.destroy());
  activeServices.clear();
});

function createSubject({
  now = 1_000,
  config = {},
  engineConfig = {}
} = {}) {
  const store = new StreamMonstersStore(new Database(':memory:'));
  store.initialize();
  const emitted = [];
  let currentNow = now;
  const engine = new StreamMonstersEngine({
    store,
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => currentNow,
    config: {
      hatchDurationMs: 120_000,
      eggExpiryMs: 86_400_000,
      ...engineConfig
    }
  });
  engine.setStreamKey('creator:stream-current');
  const service = new FreeEggDropService({
    store,
    engine,
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => currentNow,
    config
  }).start();
  activeServices.add(service);
  return {
    store,
    engine,
    service,
    emitted,
    now: () => currentNow,
    setNow(value) {
      currentNow = value;
    }
  };
}

function createPluginApi() {
  const events = [];
  const emitted = [];
  const sqlite = new Database(':memory:');
  const settings = new Map([['streamalchemy_config', {
    enabled: true,
    streamMonsters: {
      enabled: true,
      freeEggDropsEnabled: true,
      freeEggCooldownSeconds: 86_400
    }
  }]]);
  return {
    events,
    emitted,
    sqlite,
    api: {
      pluginDir: path.join(process.cwd(), 'plugins', 'stream-monsters'),
      log: jest.fn(),
      getDatabase: () => sqlite,
      getConfig: key => settings.get(key) || null,
      setConfig: (key, value) => settings.set(key, value),
      getPluginDataDir: () => os.tmpdir(),
      ensurePluginDataDir: () => os.tmpdir(),
      registerRoute: jest.fn(),
      registerTikTokEvent: (event, handler) => events.push({ event, handler }),
      emit: (event, payload) => emitted.push({ event, payload }),
      on: jest.fn(() => true),
      removeListener: jest.fn(),
      pluginLoader: { loadedPlugins: new Map() }
    }
  };
}

function createEgg(store, {
  eggId,
  userId,
  giftId,
  giftName,
  provenance,
  freeOfferId = null
}) {
  return store.createEgg({
    eggId,
    userId,
    giftId,
    giftName,
    element: 'Ember',
    eggColor: '#ef6b45',
    seed: eggId,
    state: 'incubating',
    createdAtMs: 1_000,
    hatchDurationMs: 120_000,
    provenance,
    freeOfferId
  });
}

describe('Stream Monsters free egg lifecycle reliability', () => {
  test('normalizes legacy offer stage and free egg provenance additively', () => {
    const store = new StreamMonstersStore(new Database(':memory:'));
    store.initialize();
    const insertOffer = store.db.prepare(`
      INSERT INTO streammonsters_free_egg_offers (
        offer_id, stream_key, source_user_id, offer_event_id, offered_at_ms,
        reserved_until_ms, status, stage_state
      ) VALUES (?, 'creator:legacy', ?, ?, 1_000, ?, ?, ?)
    `);
    insertOffer.run(
      'offer-public',
      'source-public',
      'event-public',
      61_000,
      'public',
      'reserved'
    );
    insertOffer.run(
      'offer-claimed',
      'source-claimed',
      'event-claimed',
      62_000,
      'claimed',
      'reserved'
    );
    createEgg(store, {
      eggId: 'egg-free-signature',
      userId: 'viewer-free-signature',
      giftId: 0,
      giftName: '  Free Egg Drop ',
      provenance: 'legacy'
    });
    createEgg(store, {
      eggId: 'egg-free-link',
      userId: 'viewer-free-link',
      giftId: 99,
      giftName: 'Historical Offer',
      provenance: 'legacy',
      freeOfferId: 'offer-claimed'
    });
    createEgg(store, {
      eggId: 'egg-gift',
      userId: 'viewer-gift',
      giftId: 1,
      giftName: 'Rose',
      provenance: 'gift'
    });
    createEgg(store, {
      eggId: 'egg-legacy',
      userId: 'viewer-legacy',
      giftId: 2,
      giftName: 'Old Gift',
      provenance: 'legacy'
    });

    store.initialize();

    expect(store.getFreeEggOffer('offer-public')).toEqual(expect.objectContaining({
      status: 'public',
      stage_state: 'public',
      public_expires_at_ms: 361_000
    }));
    expect(store.getFreeEggOffer('offer-claimed')).toEqual(expect.objectContaining({
      status: 'claimed',
      stage_state: 'claimed',
      public_expires_at_ms: 362_000
    }));
    expect(store.getEgg('egg-free-signature')).toEqual(expect.objectContaining({
      provenance: 'free',
      ownership_state: 'owned'
    }));
    expect(store.getEgg('egg-free-link')).toEqual(expect.objectContaining({
      provenance: 'free',
      ownership_state: 'owned'
    }));
    expect(store.getEgg('egg-gift').provenance).toBe('gift');
    expect(store.getEgg('egg-legacy').provenance).toBe('legacy');
  });

  test('does not offer an egg while the viewer claim cooldown is active', () => {
    const subject = createSubject({
      config: { freeEggCooldownSeconds: 120 }
    });
    subject.service.onFirstChat({
      userId: 'viewer-a',
      streamKey: 'creator:stream-current',
      eventId: 'chat-current',
      nowMs: 1_000
    });
    expect(subject.service.adopt({
      userId: 'viewer-a',
      streamKey: 'creator:stream-current',
      eventId: 'adopt-current',
      nowMs: 1_000
    }).status).toBe('claimed');
    const reservedEventsBefore = subject.emitted.filter(
      entry => entry.event === 'streammonsters:free_egg_reserved'
    ).length;

    subject.engine.setStreamKey('creator:stream-next');
    const result = subject.service.onFirstChat({
      userId: 'viewer-a',
      streamKey: 'creator:stream-next',
      eventId: 'chat-next',
      nowMs: 2_000
    });

    expect(result).toEqual(expect.objectContaining({
      success: false,
      status: 'cooldown',
      remainingMs: 119_000
    }));
    expect(subject.store.getFreeEggOffers('creator:stream-next')).toHaveLength(0);
    expect(subject.emitted.filter(
      entry => entry.event === 'streammonsters:free_egg_reserved'
    )).toHaveLength(reservedEventsBefore);
  });

  test('expires a public offer exactly 300 seconds after reservation release', () => {
    const subject = createSubject({ now: 0 });
    const offered = subject.service.onFirstChat({
      userId: 'viewer-a',
      streamKey: 'creator:stream-current',
      eventId: 'chat-a',
      nowMs: 0
    });

    subject.service.sweepAndRearm(59_999);
    expect(subject.store.getFreeEggOffer(offered.offerId).status).toBe('reserved');
    subject.service.sweepAndRearm(60_000);
    expect(subject.store.getFreeEggOffer(offered.offerId)).toEqual(expect.objectContaining({
      status: 'public',
      stage_state: 'public',
      public_expires_at_ms: 360_000
    }));
    subject.service.sweepAndRearm(359_999);
    expect(subject.store.getFreeEggOffer(offered.offerId).status).toBe('public');
    subject.service.sweepAndRearm(360_000);
    expect(subject.store.getFreeEggOffer(offered.offerId)).toEqual(expect.objectContaining({
      status: 'expired',
      stage_state: 'expired'
    }));
    expect(subject.store.getNextFreeEggTransitionDeadline(360_000)).toBeNull();
    expect(subject.emitted).toContainEqual({
      event: 'streammonsters:egg_stage_removed',
      payload: expect.objectContaining({
        eggStage: expect.objectContaining({
          state: 'expired',
          timing: expect.objectContaining({ expiresAtMs: 360_000 })
        })
      })
    });
    expect(FreeEggDropService.PUBLIC_WINDOW_MS).toBe(300_000);
  });

  test('expires an overdue reserved offer without briefly publishing it', () => {
    const subject = createSubject({ now: 0 });
    const offered = subject.service.onFirstChat({
      userId: 'viewer-a',
      streamKey: 'creator:stream-current',
      eventId: 'chat-a',
      nowMs: 0
    });
    subject.emitted.splice(0);

    subject.service.sweepAndRearm(360_000);

    expect(subject.store.getFreeEggOffer(offered.offerId)).toEqual(
      expect.objectContaining({
        status: 'expired',
        stage_state: 'expired'
      })
    );
    expect(subject.emitted.map(entry => entry.event)).toEqual([
      'streammonsters:egg_stage_removed'
    ]);
  });

  test('terminal disconnect expires offers while transient disconnect preserves them', async () => {
    const harness = createPluginApi();
    const plugin = new StreamAlchemyPlugin(harness.api);
    await plugin.init();
    try {
      plugin.streamMonstersEngine.setStreamKey('creator:stream-current');
      plugin.streamMonstersFreeEggDrops.onFirstChat({
        userId: 'viewer-current',
        streamKey: 'creator:stream-current',
        eventId: 'chat-current',
        nowMs: 1_000
      });
      plugin.streamMonstersFreeEggDrops.onFirstChat({
        userId: 'viewer-other',
        streamKey: 'creator:stream-other',
        eventId: 'chat-other',
        nowMs: 1_000
      });
      const cleanup = jest.spyOn(plugin.streamMonstersFreeEggDrops, 'cleanupStream');
      const disconnected = harness.events.find(
        entry => entry.event === 'disconnected'
      )?.handler;

      expect(disconnected).toEqual(expect.any(Function));
      if (!disconnected) return;
      await disconnected({
        code: 1006,
        wasLive: true,
        isTransient: true,
        source: 'eulerstream-websocket',
        streamSessionId: 7,
        streamIdentity: 'creator:stream-current'
      });
      expect(plugin.streamMonstersStore.getFreeEggOfferBySource(
        'creator:stream-current',
        'viewer-current'
      ).status).toBe('reserved');

      const terminal = {
        code: 4005,
        wasLive: true,
        isTransient: false,
        source: 'eulerstream-websocket',
        streamSessionId: 7,
        streamIdentity: 'creator:stream-current'
      };
      await disconnected(terminal);
      await disconnected(terminal);

      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(cleanup).toHaveBeenCalledWith({
        streamKey: 'creator:stream-current'
      });
      expect(plugin.streamMonstersStore.getFreeEggOfferBySource(
        'creator:stream-current',
        'viewer-current'
      ).status).toBe('expired');
      expect(plugin.streamMonstersStore.getFreeEggOfferBySource(
        'creator:stream-other',
        'viewer-other'
      ).status).toBe('reserved');
    } finally {
      await plugin.destroy();
      harness.sqlite.close();
    }
  });

  test('ignores a delayed terminal disconnect from an older session without stream identity', async () => {
    const harness = createPluginApi();
    const plugin = new StreamAlchemyPlugin(harness.api);
    await plugin.init();
    try {
      const sessionStarted = harness.events.find(
        entry => entry.event === 'streamSessionStarted'
      ).handler;
      const disconnected = harness.events.find(
        entry => entry.event === 'disconnected'
      ).handler;
      await sessionStarted({
        username: 'creator',
        streamSessionId: 2
      });
      plugin.streamMonstersFreeEggDrops.onFirstChat({
        userId: 'viewer-current',
        streamKey: 'creator:2',
        eventId: 'chat-current',
        nowMs: 1_000
      });

      await disconnected({
        code: 4005,
        wasLive: true,
        isTransient: false,
        source: 'eulerstream-websocket',
        streamSessionId: 1
      });

      expect(plugin.streamMonstersStore.getFreeEggOfferBySource(
        'creator:2',
        'viewer-current'
      )).toEqual(expect.objectContaining({
        status: 'reserved',
        stage_state: 'reserved'
      }));
    } finally {
      await plugin.destroy();
      harness.sqlite.close();
    }
  });

  test('cleans a matching terminal session without stream identity only once', async () => {
    const harness = createPluginApi();
    const plugin = new StreamAlchemyPlugin(harness.api);
    await plugin.init();
    try {
      const sessionStarted = harness.events.find(
        entry => entry.event === 'streamSessionStarted'
      ).handler;
      const disconnected = harness.events.find(
        entry => entry.event === 'disconnected'
      ).handler;
      await sessionStarted({
        username: 'creator',
        streamSessionId: 3
      });
      plugin.streamMonstersFreeEggDrops.onFirstChat({
        userId: 'viewer-current',
        streamKey: 'creator:3',
        eventId: 'chat-current',
        nowMs: 1_000
      });
      const cleanup = jest.spyOn(
        plugin.streamMonstersFreeEggDrops,
        'cleanupStream'
      );
      const terminal = {
        code: 4005,
        wasLive: true,
        isTransient: false,
        source: 'eulerstream-websocket',
        streamSessionId: 3
      };

      await disconnected(terminal);
      await disconnected(terminal);

      expect(cleanup).toHaveBeenCalledTimes(1);
      expect(cleanup).toHaveBeenCalledWith({ streamKey: 'creator:3' });
      expect(plugin.streamMonstersStore.getFreeEggOfferBySource(
        'creator:3',
        'viewer-current'
      )).toEqual(expect.objectContaining({
        status: 'expired',
        stage_state: 'expired'
      }));
    } finally {
      await plugin.destroy();
      harness.sqlite.close();
    }
  });

  test('disabling free drops expires outstanding offers and stops future offers', () => {
    const subject = createSubject();
    subject.service.onFirstChat({
      userId: 'viewer-current',
      streamKey: 'creator:stream-current',
      eventId: 'chat-current',
      nowMs: 1_000
    });
    subject.service.onFirstChat({
      userId: 'viewer-other',
      streamKey: 'creator:stream-other',
      eventId: 'chat-other',
      nowMs: 1_000
    });

    subject.service.setConfig({
      freeEggDropsEnabled: false,
      freeEggCooldownSeconds: 120
    });

    expect(subject.store.getFreeEggOfferBySource(
      'creator:stream-current',
      'viewer-current'
    ).status).toBe('expired');
    expect(subject.store.getFreeEggOfferBySource(
      'creator:stream-other',
      'viewer-other'
    ).status).toBe('reserved');
    expect(subject.emitted.filter(
      entry => entry.event === 'streammonsters:egg_stage_removed'
    )).toHaveLength(1);
    expect(subject.service.onFirstChat({
      userId: 'viewer-new',
      streamKey: 'creator:stream-current',
      eventId: 'chat-disabled',
      nowMs: 2_000
    })).toEqual(expect.objectContaining({
      success: false,
      status: 'disabled'
    }));
    expect(subject.store.getFreeEggOfferBySource(
      'creator:stream-current',
      'viewer-new'
    )).toBeNull();
  });

  test('adoption keeps the claimant safe display name and avatar', () => {
    const subject = createSubject({ now: 60_000 });
    subject.service.onFirstChat({
      userId: 'source-viewer',
      streamKey: 'creator:stream-current',
      eventId: 'chat-source',
      nowMs: 0
    });
    subject.service.sweepAndRearm(60_000);
    const commands = new ChatCommands({
      store: subject.store,
      engine: subject.engine,
      freeEggDropService: subject.service,
      now: subject.now
    });

    const result = commands.execute({
      userId: 'claimant',
      uniqueId: 'claimant_handle',
      nickname: '\u0000  Claimant Name \u0007',
      rawData: {
        eventId: 'adopt-claimant',
        uniqueId: 'claimant_handle',
        nickname: '\u0000  Claimant Name \u0007',
        profilePictureUrl: 'https://p16-sign.tiktokcdn-us.com/tos-useast5/avatar.jpeg'
      }
    }, 'adopt');

    expect(result).toEqual(expect.objectContaining({
      success: true,
      status: 'claimed',
      egg: expect.objectContaining({
        display_name: 'Claimant Name',
        avatar_ref: expect.stringMatching(
          /^\/api\/stream-monsters\/avatar\/[a-z0-9_-]{16,1024}$/i
        )
      })
    }));
  });

  test('claimed free inventory stage events carry owned provenance metadata', () => {
    const subject = createSubject({
      now: 1_000,
      engineConfig: { hatchDurationMs: 100, eggExpiryMs: 100 }
    });
    const egg = subject.engine.createFreeEgg({
      userId: 'viewer-a',
      offerId: 'offer-a',
      element: 'Ember',
      createdAtMs: 1_000
    });
    const expiredGift = createEgg(subject.store, {
      eggId: 'expired-gift',
      userId: 'viewer-b',
      giftId: 1,
      giftName: 'Rose',
      provenance: 'gift'
    });
    subject.store.db.prepare(`
      UPDATE streammonsters_eggs
      SET state = 'expired', expired_at_ms = ?
      WHERE egg_id = ?
    `).run(1_000, expiredGift.egg_id);

    for (const state of ['ready', 'boosted', 'expired']) {
      expect(subject.engine.eggStageProjector.projectEgg({
        ...egg,
        state
      })).toEqual(expect.objectContaining({
        provenance: 'free',
        ownershipState: 'owned',
        adoptionStatus: 'owned',
        adoptable: false
      }));
    }

    subject.store.upsertGiftMapping({
      giftId: 7,
      giftName: 'Boost',
      coinValue: 1,
      effect: 'boost',
      enabled: true
    });
    subject.engine.processGift({
      userId: 'viewer-a',
      giftId: 7,
      giftName: 'Boost',
      coinValue: 1,
      createdAtMs: 1_000
    });
    subject.engine.markReadyEggs();
    subject.setNow(1_100);
    subject.engine.markReadyEggs();

    const boosted = subject.emitted.find(
      entry => entry.event === 'streammonsters:egg_boosted'
    )?.payload;
    const expired = subject.emitted.find(
      entry => entry.event === 'streammonsters:egg_expired'
    )?.payload;
    expect(boosted).toEqual(expect.objectContaining({
      eggStage: expect.objectContaining({
        provenance: 'free',
        ownershipState: 'owned'
      }),
      eventId: expect.stringMatching(/^sm-[a-f0-9]{32}$/),
      correlationId: expect.stringMatching(/^sm-[a-f0-9]{32}$/)
    }));
    expect(expired).toEqual(expect.objectContaining({
      eggStage: expect.objectContaining({
        provenance: 'free',
        ownershipState: 'owned',
        state: 'expired'
      }),
      eventId: expect.stringMatching(/^sm-[a-f0-9]{32}$/),
      correlationId: expect.stringMatching(/^sm-[a-f0-9]{32}$/)
    }));
    expect(subject.store.getEggStageEggs().map(row => row.egg_id))
      .toEqual(expect.not.arrayContaining([egg.egg_id, expiredGift.egg_id]));
  });
});
