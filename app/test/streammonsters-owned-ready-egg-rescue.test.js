'use strict';

const Database = require('better-sqlite3');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);
const StreamMonstersEngine = require(
  '../plugins/streamalchemy/backend/streammonsters/game-engine'
);
const ProgressionService = require(
  '../plugins/streamalchemy/backend/streammonsters/progression-service'
);
const ChatCommands = require(
  '../plugins/streamalchemy/backend/streammonsters/chat-commands'
);
const FreeEggDropService = require(
  '../plugins/streamalchemy/backend/streammonsters/free-egg-drop-service'
);
const PublicEventProjector = require(
  '../plugins/streamalchemy/backend/streammonsters/public-event-projector'
);
const EggStageView = require(
  '../plugins/streamalchemy/streammonsters-egg-stage-view'
);
const StreamMonstersRoutes = require(
  '../plugins/streamalchemy/backend/streammonsters/routes'
);
const CreatorRuntime = require(
  '../plugins/streamalchemy/streammonsters-creator-runtime'
);
const OverlayRuntime = require(
  '../plugins/streamalchemy/streammonsters-overlay-runtime'
);
const {
  isOutgoingSocketEventAllowed
} = require('../modules/public-overlay-registry');

let OwnedReadyEggRescueService = null;
try {
  OwnedReadyEggRescueService = require(
    '../plugins/streamalchemy/backend/streammonsters/owned-ready-egg-rescue-service'
  );
} catch {
  // The first RED run proves the standalone service does not exist yet.
}

function requireRescueService() {
  expect(OwnedReadyEggRescueService).toEqual(expect.any(Function));
  return OwnedReadyEggRescueService;
}

function createStore(filename = ':memory:') {
  const sqlite = new Database(filename);
  sqlite.pragma('foreign_keys = ON');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  return { sqlite, store };
}

function createReadyEgg(store, {
  eggId,
  userId = 'owner-a',
  readyAtMs = 1_000,
  expiresAtMs = 1_000_000,
  seed = `seed-${eggId}`,
  provenance = 'gift',
  boostMs = 17_000,
  displayName = 'Owner A',
  avatarRef = null
}) {
  return store.createEgg({
    eggId,
    userId,
    giftId: provenance === 'gift' ? 77 : 0,
    giftName: provenance === 'gift' ? 'Team Heart' : 'Legacy Egg',
    element: 'Ember',
    eggColor: '#ff6600',
    seed,
    state: 'ready',
    createdAtMs: 100,
    hatchDurationMs: 100_000,
    initialBoostMs: boostMs,
    readyAtMs,
    expiresAtMs,
    imageUrl: '/plugins/streamalchemy/assets/eggs/ember-standard.png',
    variant: 'charged',
    visualSource: 'egg_asset',
    visualKey: 'egg:ember:charged',
    provenance,
    displayName,
    avatarRef
  });
}

function createSubject({
  nowMs = 1_000,
  graceSeconds,
  filename = ':memory:',
  beforeService = null,
  withProgression = false
} = {}) {
  const Service = requireRescueService();
  if (!Service) return null;
  const { sqlite, store } = createStore(filename);
  beforeService?.({ sqlite, store });
  let currentNowMs = nowMs;
  const emitted = [];
  const progression = withProgression
    ? new ProgressionService({
        store,
        now: () => new Date(currentNowMs)
      })
    : null;
  const service = new Service({
    store,
    progression,
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => currentNowMs,
    config: graceSeconds === undefined
      ? {}
      : { ownedReadyEggRescueGraceSeconds: graceSeconds }
  });
  return {
    sqlite,
    store,
    service,
    progression,
    emitted,
    now: () => currentNowMs,
    setNow(value) {
      currentNowMs = value;
    }
  };
}

function observeAndPublish(subject, eggId, {
  observedAtMs = subject.now(),
  publishedAtMs
} = {}) {
  subject.service.observeReadyEgg(eggId, { observedAtMs });
  subject.service.sweep(publishedAtMs);
}

async function runContendingRescuers({ databasePath, attempts = 12 }) {
  const gate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const workerSource = `
    const { parentPort, workerData } = require('worker_threads');
    const Database = require(workerData.databaseModule);
    const Store = require(workerData.storeModule);
    const Service = require(workerData.serviceModule);
    const sqlite = new Database(workerData.databasePath);
    sqlite.pragma('foreign_keys = ON');
    const store = new Store(sqlite);
    store.initialize();
    const service = new Service({
      store,
      now: () => workerData.nowMs,
      config: { ownedReadyEggRescueGraceSeconds: 1 }
    });
    parentPort.postMessage({ ready: true });
    Atomics.wait(new Int32Array(workerData.gate), 0, 0);
    try {
      parentPort.postMessage({
        result: service.adopt({
          userId: workerData.userId,
          streamKey: 'creator:stream-1',
          eventId: workerData.eventId,
          displayName: workerData.displayName,
          nowMs: workerData.nowMs
        })
      });
    } catch (error) {
      parentPort.postMessage({ error: error.message });
    } finally {
      sqlite.close();
    }
  `;
  const modules = {
    databaseModule: require.resolve('better-sqlite3'),
    storeModule: require.resolve('../plugins/streamalchemy/backend/streammonsters/database'),
    serviceModule: require.resolve(
      '../plugins/streamalchemy/backend/streammonsters/owned-ready-egg-rescue-service'
    )
  };
  const workers = Array.from({ length: attempts }, (_, index) => {
    let resolveReady;
    let rejectReady;
    let resolveResult;
    const ready = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const result = new Promise(resolve => {
      resolveResult = resolve;
    });
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: {
        ...modules,
        databasePath,
        gate,
        nowMs: 2_000,
        userId: `rescuer-${index}`,
        displayName: `Rescuer ${index}`,
        eventId: `rescue-event-${index}`
      }
    });
    worker.on('message', message => {
      if (message.ready) resolveReady();
      else if (message.error) resolveResult({ success: false, error: message.error });
      else resolveResult(message.result);
    });
    worker.on('error', error => {
      rejectReady(error);
      resolveResult({ success: false, error: error.message });
    });
    return { worker, ready, result };
  });
  await Promise.all(workers.map(entry => entry.ready));
  Atomics.store(new Int32Array(gate), 0, 1);
  Atomics.notify(new Int32Array(gate), 0, attempts);
  const results = await Promise.all(workers.map(entry => entry.result));
  await Promise.all(workers.map(entry => entry.worker.terminate()));
  return results;
}

async function runHatchAgainstRescue({ databasePath }) {
  const gate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const common = {
    databaseModule: require.resolve('better-sqlite3'),
    storeModule: require.resolve('../plugins/streamalchemy/backend/streammonsters/database'),
    serviceModule: require.resolve(
      '../plugins/streamalchemy/backend/streammonsters/owned-ready-egg-rescue-service'
    ),
    engineModule: require.resolve('../plugins/streamalchemy/backend/streammonsters/game-engine'),
    databasePath,
    gate,
    nowMs: 2_000
  };
  const workerSource = `
    const { parentPort, workerData } = require('worker_threads');
    const Database = require(workerData.databaseModule);
    const Store = require(workerData.storeModule);
    const sqlite = new Database(workerData.databasePath);
    sqlite.pragma('foreign_keys = ON');
    const store = new Store(sqlite);
    store.initialize();
    parentPort.postMessage({ ready: true });
    Atomics.wait(new Int32Array(workerData.gate), 0, 0);
    try {
      if (workerData.action === 'hatch') {
        const Engine = require(workerData.engineModule);
        const engine = new Engine({ store, now: () => workerData.nowMs });
        parentPort.postMessage({
          result: {
            action: 'hatch',
            success: Boolean(engine.hatchEgg('owner-race'))
          }
        });
      } else {
        const Service = require(workerData.serviceModule);
        const service = new Service({
          store,
          now: () => workerData.nowMs,
          config: { ownedReadyEggRescueGraceSeconds: 1 }
        });
        parentPort.postMessage({
          result: {
            action: 'rescue',
            ...service.adopt({
              userId: 'rescuer-race',
              streamKey: 'creator:stream-1',
              eventId: 'race-rescue-event',
              nowMs: workerData.nowMs
            })
          }
        });
      }
    } catch (error) {
      parentPort.postMessage({
        result: {
          action: workerData.action,
          success: false,
          error: error.code || error.message
        }
      });
    } finally {
      sqlite.close();
    }
  `;
  const workers = ['hatch', 'rescue'].map(action => {
    let resolveReady;
    let resolveResult;
    const ready = new Promise(resolve => {
      resolveReady = resolve;
    });
    const result = new Promise(resolve => {
      resolveResult = resolve;
    });
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: { ...common, action }
    });
    worker.on('message', message => {
      if (message.ready) resolveReady();
      else resolveResult(message.result);
    });
    worker.on('error', error => resolveResult({
      action,
      success: false,
      error: error.message
    }));
    return { worker, ready, result };
  });
  await Promise.all(workers.map(entry => entry.ready));
  Atomics.store(new Int32Array(gate), 0, 1);
  Atomics.notify(new Int32Array(gate), 0, workers.length);
  const results = await Promise.all(workers.map(entry => entry.result));
  await Promise.all(workers.map(entry => entry.worker.terminate()));
  return results;
}

describe('Stream Monsters owned-ready egg rescue', () => {
  test('publishes a newly ready owned egg only after the default 600-second grace', () => {
    const subject = createSubject();
    if (!subject) return;
    createReadyEgg(subject.store, {
      eggId: 'egg-default',
      expiresAtMs: 700_000
    });

    subject.service.observeReadyEgg('egg-default', { observedAtMs: 1_000 });
    subject.service.sweep(600_999);
    expect(subject.service.listPublic(600_999)).toEqual([]);

    subject.service.sweep(601_000);
    expect(subject.service.listPublic(601_000)).toEqual([
      expect.objectContaining({
        rescueId: expect.stringMatching(/^[a-f0-9-]{36}$/i),
        state: 'public',
        expiresAtMs: 700_000,
        remainingMs: 99_000,
        owner: expect.objectContaining({
          displayName: 'Owner A'
        })
      })
    ]);
  });

  test('uses zero grace as a hard disable instead of immediate publication', () => {
    const subject = createSubject({ graceSeconds: 0 });
    if (!subject) return;
    createReadyEgg(subject.store, {
      eggId: 'egg-disabled',
      expiresAtMs: 100_000_000
    });

    expect(subject.service.observeReadyEgg(
      'egg-disabled',
      { observedAtMs: 1_000 }
    )).toBeNull();
    subject.service.sweep(99_000_000);

    expect(subject.service.listPublic(99_000_000)).toEqual([]);
    expect(subject.sqlite.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_owned_ready_egg_rescues
    `).get().count).toBe(0);
  });

  test('hides and rejects an already-public rescue when grace is disabled', () => {
    const subject = createSubject({ graceSeconds: 1 });
    if (!subject) return;
    createReadyEgg(subject.store, {
      eggId: 'egg-disable-public',
      expiresAtMs: 100_000
    });
    observeAndPublish(subject, 'egg-disable-public', { publishedAtMs: 2_000 });
    expect(subject.service.listPublic(2_000)).toHaveLength(1);

    subject.service.setConfig({
      ownedReadyEggRescueGraceSeconds: 0
    }, 2_001);

    expect(subject.service.listPublic(2_001)).toEqual([]);
    expect(subject.service.adopt({
      userId: 'rescuer-disabled',
      streamKey: 'creator:stream-1',
      eventId: 'disabled-rescue',
      nowMs: 2_001
    })).toEqual({
      success: false,
      status: 'disabled'
    });
    expect(subject.emitted).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: 'streammonsters:egg_stage_removed',
        payload: expect.objectContaining({
          reason: 'rescue_disabled',
          eggStage: expect.objectContaining({
            visualId: expect.stringMatching(/^egg-[a-f0-9]{24}$/)
          })
        })
      })
    ]));
  });

  test('gives still-ready eggs a fresh full grace when rescue is re-enabled', () => {
    const subject = createSubject({ graceSeconds: 1 });
    if (!subject) return;
    createReadyEgg(subject.store, {
      eggId: 'egg-reenabled',
      expiresAtMs: 800_000
    });
    observeAndPublish(subject, 'egg-reenabled', { publishedAtMs: 2_000 });
    subject.service.setConfig({
      ownedReadyEggRescueGraceSeconds: 0
    }, 3_000);

    subject.service.setConfig({
      ownedReadyEggRescueGraceSeconds: 600
    }, 10_000);
    subject.service.sweep(609_999);
    expect(subject.service.listPublic(609_999)).toEqual([]);
    subject.service.sweep(610_000);

    expect(subject.service.listPublic(610_000)).toHaveLength(1);
    expect(subject.service.getRescueForEgg('egg-reenabled')).toEqual(
      expect.objectContaining({
        status: 'public',
        observed_at_ms: 10_000,
        eligible_at_ms: 610_000
      })
    );
  });

  test('recomputes only pending deadlines when a nonzero grace changes', () => {
    const subject = createSubject({ graceSeconds: 600 });
    if (!subject) return;
    createReadyEgg(subject.store, {
      eggId: 'egg-pending-reconfigured',
      readyAtMs: 1_000,
      expiresAtMs: 1_000_000
    });
    createReadyEgg(subject.store, {
      eggId: 'egg-public-reconfigured',
      readyAtMs: 1_000,
      expiresAtMs: 1_000_000
    });
    subject.service.observeReadyEgg('egg-pending-reconfigured', {
      observedAtMs: 1_000
    });
    subject.service.observeReadyEgg('egg-public-reconfigured', {
      observedAtMs: 1_000
    });
    subject.sqlite.prepare(`
      UPDATE streammonsters_owned_ready_egg_rescues
      SET status = 'public', published_at_ms = 2_000
      WHERE egg_id = 'egg-public-reconfigured'
    `).run();

    subject.service.setConfig({
      ownedReadyEggRescueGraceSeconds: 60
    }, 10_000);

    expect(subject.service.getRescueForEgg('egg-pending-reconfigured'))
      .toEqual(expect.objectContaining({
        status: 'pending',
        eligible_at_ms: 61_000
      }));
    expect(subject.service.getRescueForEgg('egg-public-reconfigured'))
      .toEqual(expect.objectContaining({
        status: 'public',
        eligible_at_ms: 601_000,
        published_at_ms: 2_000
      }));
  });

  test('caps configured grace at 86400 seconds', () => {
    const subject = createSubject({ graceSeconds: 100_000 });
    if (!subject) return;
    createReadyEgg(subject.store, {
      eggId: 'egg-capped',
      readyAtMs: 1_000,
      expiresAtMs: 90_000_000
    });

    subject.service.observeReadyEgg('egg-capped', { observedAtMs: 1_000 });
    subject.service.sweep(86_400_999);
    expect(subject.service.listPublic(86_400_999)).toEqual([]);
    subject.service.sweep(86_401_000);
    expect(subject.service.listPublic(86_401_000)).toHaveLength(1);
  });

  test('starts legacy ready-egg grace at migration time instead of historical ready_at', () => {
    const subject = createSubject({
      nowMs: 10_000,
      beforeService: ({ store }) => createReadyEgg(store, {
        eggId: 'egg-legacy-ready',
        readyAtMs: 1_000,
        expiresAtMs: 700_000,
        provenance: 'legacy'
      })
    });
    if (!subject) return;

    subject.service.sweep(609_999);
    expect(subject.service.listPublic(609_999)).toEqual([]);
    subject.service.sweep(610_000);

    expect(subject.service.listPublic(610_000)).toHaveLength(1);
    expect(subject.service.getRescueForEgg('egg-legacy-ready')).toEqual(
      expect.objectContaining({
        observed_at_ms: 10_000,
        eligible_at_ms: 610_000,
        migration: 1
      })
    );
  });

  test.each([
    ['manual hatch', engine => engine.hatchEgg('owner-a')],
    ['active-owner auto-hatch', engine => engine.autoHatchReadyEggs({
      isViewerActive: userId => userId === 'owner-a'
    })]
  ])('lets owner %s win before rescue publication', (_label, hatch) => {
    const subject = createSubject({ graceSeconds: 1 });
    if (!subject) return;
    createReadyEgg(subject.store, {
      eggId: `egg-${_label}`,
      expiresAtMs: 50_000
    });
    subject.service.observeReadyEgg(`egg-${_label}`, { observedAtMs: 1_000 });
    const engine = new StreamMonstersEngine({
      store: subject.store,
      now: () => 2_000,
      config: { autoHatchActiveViewers: true }
    });

    hatch(engine);
    subject.service.sweep(2_000);

    expect(subject.service.listPublic(2_000)).toEqual([]);
    expect(subject.service.getRescueForEgg(`egg-${_label}`)).toEqual(
      expect.objectContaining({
        status: 'closed',
        close_reason: 'owner_hatched'
      })
    );
    expect(subject.store.getEgg(`egg-${_label}`).state).toBe('hatched');
  });

  test('transfers the earliest-expiring public egg without changing its lifecycle data', () => {
    const subject = createSubject({ graceSeconds: 1 });
    if (!subject) return;
    const early = createReadyEgg(subject.store, {
      eggId: 'egg-early',
      readyAtMs: 1_000,
      expiresAtMs: 50_000,
      seed: 'seed-must-stay',
      provenance: 'legacy',
      boostMs: 23_000
    });
    createReadyEgg(subject.store, {
      eggId: 'egg-late',
      readyAtMs: 1_000,
      expiresAtMs: 60_000
    });
    observeAndPublish(subject, 'egg-early', { publishedAtMs: 2_000 });
    observeAndPublish(subject, 'egg-late', { publishedAtMs: 2_000 });
    const publicStage = subject.service.listPublic(2_000)[0];

    const result = subject.service.adopt({
      userId: 'rescuer-a',
      streamKey: 'creator:stream-1',
      eventId: 'rescue-claim-a',
      displayName: '@Rescuer A',
      avatarRef: '/api/streammonsters/avatar/a234567890123456',
      nowMs: 2_000
    });
    const transferred = subject.store.getEgg('egg-early');

    expect(result).toEqual(expect.objectContaining({
      success: true,
      status: 'claimed',
      rescueId: expect.any(String),
      eggStage: expect.objectContaining({
        visualId: publicStage.visualId,
        state: 'ready',
        displayName: '@Rescuer A',
        adoptionStatus: 'owned',
        adoptable: false
      })
    }));
    expect(transferred).toEqual(expect.objectContaining({
      egg_id: early.egg_id,
      user_id: 'rescuer-a',
      display_name: '@Rescuer A',
      avatar_ref: '/api/streammonsters/avatar/a234567890123456',
      seed: 'seed-must-stay',
      provenance: 'legacy',
      ready_at_ms: 1_000,
      expires_at_ms: 50_000,
      boost_ms: 23_000,
      ownership_state: 'owned',
      state: 'ready'
    }));
    expect(subject.store.getEgg('egg-late').user_id).toBe('owner-a');

    const emitted = [];
    const engine = new StreamMonstersEngine({
      store: subject.store,
      emit: (event, payload) => emitted.push({ event, payload }),
      now: () => 3_000
    });
    engine.setStreamKey('creator:stream-1');
    expect(engine.hatchEgg('rescuer-a')).toEqual(expect.objectContaining({
      user_id: 'rescuer-a',
      egg_id: 'egg-early'
    }));
    expect(emitted.find(entry => (
      entry.event === 'streammonsters:egg_stage_removed'
    ))?.payload.eggStage.visualId).toBe(publicStage.visualId);
  });

  test('adopt-at-grace emits each other newly public rescue exactly once', () => {
    const subject = createSubject({ graceSeconds: 1 });
    if (!subject) return;
    createReadyEgg(subject.store, {
      eggId: 'egg-adopt-at-grace-first',
      expiresAtMs: 50_000
    });
    createReadyEgg(subject.store, {
      eggId: 'egg-adopt-at-grace-second',
      userId: 'owner-b',
      expiresAtMs: 60_000
    });
    subject.service.observeReadyEgg('egg-adopt-at-grace-first', {
      observedAtMs: 1_000
    });
    subject.service.observeReadyEgg('egg-adopt-at-grace-second', {
      observedAtMs: 1_000
    });

    const claimed = subject.service.adopt({
      userId: 'rescuer-at-grace',
      streamKey: 'creator:stream-1',
      eventId: 'rescue-at-grace',
      nowMs: 2_000
    });
    const remaining = subject.service.listPublic(2_000);
    const publicEvents = () => subject.emitted.filter(entry => (
      entry.event === 'streammonsters:owned_ready_egg_public'
    ));

    expect(claimed).toEqual(expect.objectContaining({
      success: true,
      adoptionSource: 'rescue'
    }));
    expect(remaining).toHaveLength(1);
    expect(publicEvents()).toEqual([
      expect.objectContaining({
        payload: expect.objectContaining({
          eggStage: expect.objectContaining({
            visualId: remaining[0].visualId,
            state: 'public'
          })
        })
      })
    ]);

    subject.service.sweep(2_001);
    expect(publicEvents()).toHaveLength(1);
  });

  test('serializes a hatch-vs-adopt race so only one owner/state transition wins', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-rescue-hatch-race-'));
    const databasePath = path.join(tempDir, 'race.sqlite');
    const subject = createSubject({
      filename: databasePath,
      graceSeconds: 1
    });
    if (!subject) return;
    createReadyEgg(subject.store, {
      eggId: 'egg-hatch-rescue-race',
      userId: 'owner-race',
      readyAtMs: 1_000,
      expiresAtMs: 50_000
    });
    observeAndPublish(subject, 'egg-hatch-rescue-race', {
      publishedAtMs: 2_000
    });

    const results = await runHatchAgainstRescue({ databasePath });
    const egg = subject.store.getEgg('egg-hatch-rescue-race');
    const monsters = subject.sqlite.prepare(`
      SELECT * FROM streammonsters_monsters
      WHERE egg_id = 'egg-hatch-rescue-race'
    `).all();

    expect(results.filter(result => result.success)).toHaveLength(1);
    expect([
      egg.state === 'hatched' &&
        egg.user_id === 'owner-race' &&
        monsters.length === 1,
      egg.state === 'ready' &&
        egg.user_id === 'rescuer-race' &&
        monsters.length === 0
    ].filter(Boolean)).toHaveLength(1);

    subject.sqlite.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('rejects !hatch after expires_at even before the expiry sweep runs', () => {
    const subject = createSubject({ nowMs: 2_000, graceSeconds: 1 });
    if (!subject) return;
    createReadyEgg(subject.store, {
      eggId: 'egg-expired-before-sweep',
      userId: 'owner-expired',
      readyAtMs: 1_000,
      expiresAtMs: 1_999
    });
    const engine = new StreamMonstersEngine({
      store: subject.store,
      now: () => 2_000
    });

    expect(() => engine.hatchEgg('owner-expired')).toThrow(
      'STREAM_MONSTERS_EGG_NOT_READY'
    );
    expect(subject.store.getEgg('egg-expired-before-sweep')).toEqual(
      expect.objectContaining({
        state: 'ready',
        monster_id: null
      })
    );
    expect(subject.store.getViewerMonsters('owner-expired')).toEqual([]);
  });

  test('does not let the original owner reclaim or earn credit from its public rescue', () => {
    const claimAtMs = Date.parse('2026-07-21T12:00:00Z');
    const subject = createSubject({
      nowMs: claimAtMs,
      graceSeconds: 1,
      withProgression: true
    });
    if (!subject) return;
    createReadyEgg(subject.store, {
      eggId: 'egg-owner-reclaim',
      userId: 'owner-no-reclaim',
      readyAtMs: claimAtMs - 1_000,
      expiresAtMs: claimAtMs + 86_400_000
    });
    observeAndPublish(subject, 'egg-owner-reclaim', {
      observedAtMs: claimAtMs - 1_000,
      publishedAtMs: claimAtMs
    });

    expect(subject.service.adopt({
      userId: 'owner-no-reclaim',
      streamKey: 'creator:stream-1',
      eventId: 'owner-reclaim-attempt',
      nowMs: claimAtMs
    })).toEqual({
      success: false,
      status: 'no_rescue'
    });
    expect(subject.store.getEgg('egg-owner-reclaim').user_id)
      .toBe('owner-no-reclaim');
    expect(subject.store.getViewerQuests(
      'owner-no-reclaim',
      '2026-07-21'
    )).toEqual([]);
  });

  test('does not let an active free-egg cooldown block a rescue claim', () => {
    const subject = createSubject({ graceSeconds: 1 });
    if (!subject) return;
    createReadyEgg(subject.store, {
      eggId: 'egg-cooldown-rescue',
      expiresAtMs: 50_000
    });
    observeAndPublish(subject, 'egg-cooldown-rescue', { publishedAtMs: 2_000 });
    subject.store.createFreeEggOffer({
      offerId: 'offer-claimed',
      streamKey: 'creator:stream-1',
      sourceUserId: 'source-viewer',
      offerEventId: 'offer-event',
      offeredAtMs: 1_000,
      reservedUntilMs: 61_000,
      publicExpiresAtMs: 361_000,
      element: 'Tide'
    });
    subject.store.claimFreeEggOffer({
      offerId: 'offer-claimed',
      userId: 'rescuer-cooldown',
      claimedAtMs: 1_500
    });
    subject.store.createFreeEggClaim({
      claimId: 'free-claim',
      offerId: 'offer-claimed',
      streamKey: 'creator:stream-1',
      userId: 'rescuer-cooldown',
      claimEventId: 'free-claim-event',
      claimedAtMs: 1_500
    });

    expect(subject.service.adopt({
      userId: 'rescuer-cooldown',
      streamKey: 'creator:stream-1',
      eventId: 'rescue-despite-cooldown',
      nowMs: 2_000
    })).toEqual(expect.objectContaining({
      success: true,
      status: 'claimed'
    }));
  });

  test('orchestrates !adopt as personal free, rescue, then public free with retry safety', () => {
    const calls = [];
    const freeEggDropService = {
      adopt: jest.fn(input => {
        calls.push(`free:${input.offerScope}`);
        if (input.offerScope === 'reserved') {
          return { success: false, status: 'cooldown', remainingMs: 60_000 };
        }
        return { success: true, status: 'claimed', offerId: 'public-free' };
      })
    };
    const ownedReadyEggRescueService = {
      adopt: jest.fn(() => {
        calls.push('rescue');
        return { success: true, status: 'claimed', rescueId: 'opaque-rescue' };
      })
    };
    const commands = new ChatCommands({
      store: { afterCommit: callback => callback() },
      engine: {
        streamKey: 'creator:stream-1',
        markReadyEggs: jest.fn()
      },
      battleService: {},
      freeEggDropService,
      ownedReadyEggRescueService,
      now: () => 2_000
    });
    const context = {
      userId: 'rescuer-orchestration',
      eventId: 'adopt-orchestration-event',
      rawData: { comment: '!adopt' }
    };

    const first = commands.execute(context, 'adopt');
    const retry = commands.execute(context, 'adopt');

    expect(first).toEqual(expect.objectContaining({
      success: true,
      status: 'claimed',
      rescueId: 'opaque-rescue'
    }));
    expect(retry).toEqual(first);
    expect(calls).toEqual([
      'free:reserved',
      'rescue',
      'free:reserved',
      'rescue'
    ]);
    expect(freeEggDropService.adopt).not.toHaveBeenCalledWith(
      expect.objectContaining({ offerScope: 'public' })
    );
  });

  test('uses one real adoption receipt when a later personal offer appears after rescue', () => {
    const subject = createSubject({ graceSeconds: 1 });
    if (!subject) return;
    createReadyEgg(subject.store, {
      eggId: 'egg-shared-success-receipt',
      expiresAtMs: 50_000
    });
    observeAndPublish(subject, 'egg-shared-success-receipt', {
      publishedAtMs: 2_000
    });
    const engine = new StreamMonstersEngine({
      store: subject.store,
      progression: subject.progression,
      now: () => 2_000
    });
    engine.setStreamKey('creator:stream-1');
    const freeEggs = new FreeEggDropService({
      store: subject.store,
      engine,
      now: () => 2_000,
      config: {
        freeEggDropsEnabled: true,
        freeEggCooldownSeconds: 86_400
      }
    });
    const commands = new ChatCommands({
      store: subject.store,
      engine,
      freeEggDropService: freeEggs,
      ownedReadyEggRescueService: subject.service,
      now: () => 2_000
    });
    const context = {
      userId: 'rescuer-shared-receipt',
      rawData: {
        provider: 'tiktok',
        msgId: 'shared-success',
        comment: '!adopt'
      }
    };

    const first = commands.execute(context, 'adopt');
    subject.store.createFreeEggOffer({
      offerId: 'later-personal-offer',
      streamKey: 'creator:stream-1',
      sourceUserId: 'rescuer-shared-receipt',
      sourceDisplayName: 'Rescuer',
      offerEventId: 'later-personal-event',
      offeredAtMs: 2_001,
      reservedUntilMs: 62_001,
      publicExpiresAtMs: 362_001,
      element: 'Tide'
    });
    const replay = commands.execute(context, 'adopt');

    expect(first).toEqual(expect.objectContaining({
      success: true,
      adoptionSource: 'rescue'
    }));
    expect(replay).toEqual(first);
    expect(subject.store.getFreeEggOffer('later-personal-offer')).toEqual(
      expect.objectContaining({ status: 'reserved' })
    );
    expect(subject.store.getViewerEggs('rescuer-shared-receipt')).toHaveLength(1);
    expect(subject.sqlite.prepare(`
      SELECT COUNT(*) AS count
      FROM streammonsters_free_egg_claims
      WHERE user_id = 'rescuer-shared-receipt'
    `).get().count).toBe(0);
    freeEggs.destroy();
  });

  test('keeps a final no-offer receipt terminal when a rescue appears later', () => {
    const subject = createSubject({ graceSeconds: 1 });
    if (!subject) return;
    const engine = new StreamMonstersEngine({
      store: subject.store,
      now: () => 2_000
    });
    engine.setStreamKey('creator:stream-1');
    const freeEggs = new FreeEggDropService({
      store: subject.store,
      engine,
      now: () => 2_000,
      config: { freeEggDropsEnabled: true }
    });
    const commands = new ChatCommands({
      store: subject.store,
      engine,
      freeEggDropService: freeEggs,
      ownedReadyEggRescueService: subject.service,
      now: () => 2_000
    });
    const context = {
      userId: 'rescuer-terminal-failure',
      rawData: {
        provider: 'tiktok',
        msgId: 'shared-no-offer',
        comment: '!adopt'
      }
    };

    const first = commands.execute(context, 'adopt');
    createReadyEgg(subject.store, {
      eggId: 'egg-after-no-offer',
      expiresAtMs: 50_000
    });
    observeAndPublish(subject, 'egg-after-no-offer', {
      observedAtMs: 1_000,
      publishedAtMs: 2_000
    });
    const replay = commands.execute(context, 'adopt');

    expect(first).toEqual(expect.objectContaining({
      success: false,
      status: 'no_offer'
    }));
    expect(replay).toEqual(first);
    expect(subject.store.getEgg('egg-after-no-offer').user_id).toBe('owner-a');
    expect(subject.service.getRescueForEgg('egg-after-no-offer')).toEqual(
      expect.objectContaining({ status: 'public' })
    );
    freeEggs.destroy();
  });

  test('keeps public rescue event data opaque and drives the same shelf visual through claim', () => {
    const projector = new PublicEventProjector();
    const publicStage = {
      visualId: 'egg-0123456789abcdef01234567',
      provenance: 'legacy',
      state: 'public',
      displayName: 'Readable Owner',
      timing: { expiresAtMs: 50_000, remainingMs: 48_000 },
      adoptionStatus: 'public',
      adoptable: true,
      command: '!adopt'
    };
    const publicPayload = projector.project(
      'streammonsters:owned_ready_egg_public',
      {
        rescueId: 'opaque-rescue',
        originalOwnerId: 'raw-owner-must-not-leak',
        eggId: 'raw-egg-must-not-leak',
        eggStage: publicStage
      }
    );
    const claimedStage = {
      ...publicStage,
      state: 'ready',
      displayName: 'New Owner',
      ownershipState: 'owned',
      adoptionStatus: 'owned',
      adoptable: false
    };

    expect(projector.isCritical('streammonsters:owned_ready_egg_public')).toBe(true);
    expect(projector.isCritical('streammonsters:owned_ready_egg_claimed')).toBe(true);
    expect(JSON.stringify(publicPayload)).not.toContain('raw-owner-must-not-leak');
    expect(JSON.stringify(publicPayload)).not.toContain('raw-egg-must-not-leak');
    expect(publicPayload.eggStage).toEqual(publicStage);
    const shelfCopy = EggStageView.shelfTiming(publicStage, {
      nowMs: 2_000,
      adoptReference: '!adopt'
    });
    expect(shelfCopy).toContain('00:48');
    expect(shelfCopy).toContain('!adopt');
    expect(shelfCopy).toContain('Adoptable');
    expect(shelfCopy).not.toContain('Free');
    expect(EggStageView.reduceEggStage([
      publicStage
    ], 'owned_ready_egg_claimed', {
      eggStage: claimedStage
    })).toEqual([
      expect.objectContaining({
        visualId: publicStage.visualId,
        state: 'ready',
        displayName: 'New Owner'
      })
    ]);
  });

  test('keeps free-provenance owned-ready rescues distinct in shelf and card copy', () => {
    const freeRescueStage = {
      rescueId: 'opaque-free-rescue',
      visualId: 'egg-abcdef0123456789abcdef01',
      provenance: 'free',
      state: 'public',
      displayName: 'Original Claimer',
      timing: { expiresAtMs: 50_000, remainingMs: 48_000 },
      adoptionStatus: 'public',
      adoptable: true
    };

    expect(EggStageView.shelfTiming(freeRescueStage, {
      nowMs: 2_000,
      adoptReference: '$retten',
      labels: {
        public: 'FREE {time} {command}',
        rescuePublic: 'RESCUE {time} {command}'
      }
    })).toBe('RESCUE 00:48 $retten');
    expect(EggStageView.buildEventPresentation(
      'owned_ready_egg_public',
      { eggStage: freeRescueStage },
      {
        commands: { adopt: '$retten' },
        nowMs: 2_000
      }
    )).toEqual(expect.objectContaining({
      kind: 'owned_ready_rescue_public',
      titleKey: 'eggLifecycleRescuePublicTitle',
      copyKey: 'eggLifecycleRescuePublicCopy',
      durationMs: 12_000,
      commands: ['$retten']
    }));
  });

  test('omits a hardcoded command and lets consumers use the active GCCE reference', () => {
    const subject = createSubject({ graceSeconds: 1 });
    if (!subject) return;
    createReadyEgg(subject.store, {
      eggId: 'egg-custom-adopt-reference',
      expiresAtMs: 50_000
    });
    observeAndPublish(subject, 'egg-custom-adopt-reference', {
      publishedAtMs: 2_000
    });
    const stage = subject.service.listPublic(2_000)[0];
    const adoptReference = '?adoptieren';

    expect(stage).not.toHaveProperty('command');
    expect(EggStageView.shelfTiming(stage, {
      nowMs: 2_000,
      adoptReference
    })).toContain(adoptReference);
    expect(EggStageView.buildEventPresentation(
      'owned_ready_egg_public',
      { eggStage: stage },
      {
        commands: { adopt: adoptReference },
        nowMs: 2_000
      }
    )).toEqual(expect.objectContaining({
      kind: 'owned_ready_rescue_public',
      commands: [adoptReference]
    }));
  });

  test('adds each public rescue once to the state snapshot and hides claimed free rescues', () => {
    const subject = createSubject({ graceSeconds: 1 });
    if (!subject) return;
    createReadyEgg(subject.store, {
      eggId: 'egg-route-gift',
      expiresAtMs: 50_000
    });
    createReadyEgg(subject.store, {
      eggId: 'egg-route-free',
      userId: 'owner-free-route',
      expiresAtMs: 60_000,
      provenance: 'free'
    });
    observeAndPublish(subject, 'egg-route-gift', { publishedAtMs: 2_000 });
    observeAndPublish(subject, 'egg-route-free', { publishedAtMs: 2_000 });
    const registered = [];
    const engine = new StreamMonstersEngine({
      store: subject.store,
      now: () => 2_000
    });
    engine.setStreamKey('creator:stream-1');
    const routes = new StreamMonstersRoutes({
      api: {
        registerRoute: (method, routePath, handler) => registered.push({
          method,
          routePath,
          handler
        })
      },
      pluginDir: __dirname,
      store: subject.store,
      engine,
      ownedReadyEggRescueService: subject.service,
      configProvider: {
        getConfig: () => ({
          streamMonsters: {
            enabled: true,
            ownedReadyEggRescueGraceSeconds: 1
          }
        })
      },
      now: () => 2_000
    });
    routes.register();
    const stateHandler = registered.find(entry => (
      entry.method === 'GET' &&
      entry.routePath === '/api/streammonsters/state'
    )).handler;
    const creatorStateHandler = registered.find(entry => (
      entry.method === 'GET' &&
      entry.routePath === '/api/streammonsters/creator-state'
    )).handler;
    const readState = (handler = stateHandler) => {
      const responseState = {};
      handler({
        query: {},
        headers: {},
        socket: { remoteAddress: '127.0.0.1' }
      }, {
        status() {
          return this;
        },
        json(payload) {
          responseState.payload = payload;
        }
      });
      return responseState.payload;
    };

    const publicState = readState();
    const creatorState = readState(creatorStateHandler);
    const publicIds = subject.service.listPublic(2_000)
      .map(stage => stage.visualId);
    expect(publicIds).toHaveLength(2);
    publicIds.forEach(visualId => {
      expect(publicState.eggStage.filter(stage => (
        stage.visualId === visualId
      ))).toEqual([
        expect.objectContaining({
          state: 'public',
          adoptable: true
        })
      ]);
      expect(creatorState.eggStage.filter(stage => (
        stage.visualId === visualId
      ))).toEqual([
        expect.objectContaining({
          state: 'public',
          adoptable: true
        })
      ]);
    });

    subject.service.adopt({
      userId: 'rescuer-route-gift',
      eventId: 'route-gift-claim',
      nowMs: 2_000
    });
    subject.service.adopt({
      userId: 'rescuer-route-free',
      eventId: 'route-free-claim',
      nowMs: 2_000
    });
    const claimedState = readState();
    const claimedFreeVisualId = publicState.eggStage.find(stage => (
      stage.provenance === 'free' && stage.state === 'public'
    )).visualId;
    expect(claimedState.eggStage).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ visualId: claimedFreeVisualId })
    ]));
  });

  test('exposes and validates the 0..86400 rescue grace creator control', () => {
    const html = fs.readFileSync(path.join(
      __dirname,
      '../plugins/streamalchemy/streammonsters-ui.html'
    ), 'utf8');
    expect(html).toContain('id="ownedReadyEggRescueGraceSeconds"');
    expect(html).toContain('min="0" max="86400"');

    expect(CreatorRuntime.buildConfigPayload({
      values: { ownedReadyEggRescueGraceSeconds: 60 }
    })).toEqual(expect.objectContaining({
      ownedReadyEggRescueGraceSeconds: 60
    }));
    expect(CreatorRuntime.buildConfigPayload({
      values: { ownedReadyEggRescueGraceSeconds: 100_000 }
    })).toEqual(expect.objectContaining({
      ownedReadyEggRescueGraceSeconds: 600
    }));
  });

  test('registers rescue socket events as public and recovery-critical', () => {
    for (const eventType of [
      'streammonsters:owned_ready_egg_public',
      'streammonsters:owned_ready_egg_claimed'
    ]) {
      expect(isOutgoingSocketEventAllowed(eventType)).toBe(true);
      expect(OverlayRuntime.isCritical(
        eventType.replace('streammonsters:', '')
      )).toBe(true);
    }
    const overlay = fs.readFileSync(path.join(
      __dirname,
      '../plugins/streamalchemy/streammonsters-overlay.html'
    ), 'utf8');
    expect(overlay).toContain(
      "'streammonsters:owned_ready_egg_public':'owned_ready_egg_public'"
    );
    expect(overlay).toContain(
      "'streammonsters:owned_ready_egg_claimed':'owned_ready_egg_claimed'"
    );
    expect(overlay).toContain(
      "eggLifecycleRescuePublicTitle:'Ready egg needs a new home'"
    );
    expect(overlay).toContain("'owned_ready_rescue_public'");
  });

  test('emits structured rescue lifecycle logs without raw egg or viewer identifiers', () => {
    const logs = [];
    const { sqlite, store } = createStore();
    createReadyEgg(store, {
      eggId: 'raw-egg-secret',
      userId: 'raw-owner-secret',
      expiresAtMs: 50_000
    });
    const Service = requireRescueService();
    const service = new Service({
      store,
      logger: (action, fields, level) => logs.push({ action, fields, level }),
      now: () => 1_000,
      config: { ownedReadyEggRescueGraceSeconds: 1 }
    });
    service.observeReadyEgg('raw-egg-secret', { observedAtMs: 1_000 });
    service.sweep(2_000);
    service.adopt({
      userId: 'raw-rescuer-secret',
      eventId: 'raw-event-secret',
      nowMs: 2_000
    });

    expect(logs.map(entry => entry.action)).toEqual(expect.arrayContaining([
      'owned_ready_egg_rescue_scheduled',
      'owned_ready_egg_rescue_public',
      'owned_ready_egg_rescue_claimed'
    ]));
    expect(JSON.stringify(logs)).not.toMatch(
      /raw-(?:egg|owner|rescuer|event)-secret/
    );
    sqlite.close();
  });

  test('credits a retried rescue as one daily egg receipt and no gift-only progress', () => {
    const claimAtMs = Date.parse('2026-07-21T12:00:00Z');
    const subject = createSubject({
      nowMs: claimAtMs,
      graceSeconds: 1,
      withProgression: true
    });
    if (!subject) return;
    createReadyEgg(subject.store, {
      eggId: 'egg-daily-credit',
      readyAtMs: claimAtMs - 1_000,
      expiresAtMs: claimAtMs + 86_400_000
    });
    observeAndPublish(subject, 'egg-daily-credit', {
      observedAtMs: claimAtMs - 1_000,
      publishedAtMs: claimAtMs
    });
    const input = {
      userId: 'rescuer-daily',
      streamKey: 'creator:stream-1',
      eventId: 'rescue-daily-event',
      nowMs: claimAtMs
    };

    const claimed = subject.service.adopt(input);
    const retried = subject.service.adopt(input);

    expect(retried).toEqual(claimed);
    expect(subject.store.getViewerQuests('rescuer-daily', '2026-07-21')).toEqual([
      expect.objectContaining({
        quest_key: 'daily:gift',
        progress: 1,
        completed: 1
      })
    ]);
    expect(subject.store.getViewerQuests('rescuer-daily', '2026-W30')).toEqual([]);
    expect(subject.store.getViewerProgress('rescuer-daily')).toEqual(
      expect.objectContaining({
        gifts_sent: 0,
        battles_won: 0
      })
    );
    expect(subject.store.getViewerBattleStats('rescuer-daily')).toEqual(
      expect.objectContaining({ battle_count: 0 })
    );
    expect(subject.store.getStreamHype('creator:stream-1')).toEqual(
      expect.objectContaining({
        points: 0,
        charged_eggs: 0
      })
    );
    expect(subject.sqlite.prepare(`
      SELECT COUNT(*) AS count
      FROM streammonsters_owned_ready_egg_rescues
      WHERE status = 'claimed'
    `).get().count).toBe(1);
  });

  test('keeps a claimed ready egg terminal when observation or service startup repeats', () => {
    const subject = createSubject({ graceSeconds: 1 });
    if (!subject) return;
    createReadyEgg(subject.store, {
      eggId: 'egg-no-republish',
      expiresAtMs: 50_000
    });
    observeAndPublish(subject, 'egg-no-republish', { publishedAtMs: 2_000 });
    expect(subject.service.adopt({
      userId: 'rescuer-terminal',
      streamKey: 'creator:stream-1',
      eventId: 'terminal-claim',
      nowMs: 2_000
    })).toEqual(expect.objectContaining({ success: true }));

    subject.service.observeReadyEgg('egg-no-republish', {
      observedAtMs: 3_000
    });
    const reloaded = new OwnedReadyEggRescueService({
      store: subject.store,
      now: () => 3_000,
      config: { ownedReadyEggRescueGraceSeconds: 1 }
    });
    reloaded.sweep(4_000);

    expect(reloaded.listPublic(4_000)).toEqual([]);
    expect(reloaded.getRescueForEgg('egg-no-republish')).toEqual(
      expect.objectContaining({
        status: 'claimed',
        claimed_by_user_id: 'rescuer-terminal'
      })
    );
    expect(subject.sqlite.prepare(`
      SELECT COUNT(*) AS count
      FROM streammonsters_owned_ready_egg_rescues
      WHERE egg_id = 'egg-no-republish'
    `).get().count).toBe(1);
  });

  test('projects only opaque rescue ids and sanitized owner fields', () => {
    const subject = createSubject({
      nowMs: 10_000,
      graceSeconds: 1,
      beforeService: ({ store }) => createReadyEgg(store, {
        eggId: 'private-egg-id',
        userId: 'tiktok:7392847109283746102',
        readyAtMs: 1_000,
        expiresAtMs: 50_000,
        seed: 'private-seed',
        displayName: '7392847109283746102',
        avatarRef: 'https://attacker.invalid/avatar.png'
      })
    });
    if (!subject) return;
    subject.service.sweep(11_000);

    const publicRows = subject.service.listPublic(11_000);
    expect(publicRows).toEqual([
      expect.objectContaining({
        rescueId: expect.stringMatching(/^[a-f0-9-]{36}$/i),
        owner: {
          displayName: 'Viewer',
          avatarRef: null
        }
      })
    ]);
    expect(JSON.stringify(publicRows)).not.toMatch(
      /private-egg-id|7392847109283746102|private-seed|user_id|egg_id/
    );
  });

  test('allows only one contender to claim the same rescue across SQLite connections', async () => {
    const Service = requireRescueService();
    if (!Service) return;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-rescue-'));
    const databasePath = path.join(tempDir, 'rescue.sqlite');
    const { sqlite, store } = createStore(databasePath);
    try {
      createReadyEgg(store, {
        eggId: 'egg-contended',
        expiresAtMs: 50_000
      });
      const service = new Service({
        store,
        now: () => 1_000,
        config: { ownedReadyEggRescueGraceSeconds: 1 }
      });
      service.observeReadyEgg('egg-contended', { observedAtMs: 1_000 });
      service.sweep(2_000);

      const results = await runContendingRescuers({ databasePath });

      expect(results.filter(result => result.success)).toHaveLength(1);
      expect(results.filter(result => (
        !result.success && result.status === 'no_rescue'
      ))).toHaveLength(11);
      expect(sqlite.prepare(`
        SELECT COUNT(*) AS count
        FROM streammonsters_owned_ready_egg_rescues
        WHERE status = 'claimed'
      `).get().count).toBe(1);
      expect(store.getEgg('egg-contended').user_id).toMatch(/^rescuer-\d+$/);
    } finally {
      sqlite.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 30_000);
});
