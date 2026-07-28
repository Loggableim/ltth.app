const Database = require('better-sqlite3');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');
const FreeEggDropService = require('../plugins/streamalchemy/backend/streammonsters/free-egg-drop-service');
const StreamMonstersChatCommands = require('../plugins/streamalchemy/backend/streammonsters/chat-commands');
const {
  normalizeIngressEventId
} = require('../plugins/streamalchemy/backend/streammonsters/ingress-event-id');
const StreamAlchemyPlugin = require('../plugins/streamalchemy');

function createSubject({ now = 1_000, config = {} } = {}) {
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const emitted = [];
  let currentNow = now;
  const engine = new StreamMonstersEngine({
    store,
    now: () => currentNow,
    config: { hatchDurationMs: 120_000, eggExpiryMs: 86_400_000 }
  });
  engine.setStreamKey('creator:stream-1');
  const service = new FreeEggDropService({
    store,
    engine,
    emit: (event, payload) => emitted.push({ event, payload }),
    now: () => currentNow,
    config
  });
  return {
    store,
    engine,
    service,
    emitted,
    now: () => currentNow,
    setNow(value) { currentNow = value; }
  };
}

function offer(subject, userId, eventId, nowMs) {
  return subject.service.onFirstChat({
    userId,
    streamKey: 'creator:stream-1',
    eventId,
    displayName: userId,
    nowMs
  });
}

function adopt(subject, userId, eventId, nowMs) {
  return subject.service.adopt({
    userId,
    streamKey: 'creator:stream-1',
    eventId,
    nowMs
  });
}

function runContendingAdopters({ databasePath, attempts = 20 } = {}) {
  const gate = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const workerSource = `
    const { parentPort, workerData } = require('worker_threads');
    const Database = require(workerData.databaseModule);
    const Store = require(workerData.storeModule);
    const Engine = require(workerData.engineModule);
    const Service = require(workerData.serviceModule);
    const db = new Database(workerData.databasePath);
    db.pragma('foreign_keys = ON');
    const store = new Store(db);
    store.initialize();
    const engine = new Engine({
      store,
      now: () => 61_000,
      config: { hatchDurationMs: 120_000, eggExpiryMs: 86_400_000 }
    });
    engine.setStreamKey('creator:stream-1');
    const service = new Service({
      store,
      engine,
      now: () => 61_000,
      config: { freeEggCooldownSeconds: 86_400 }
    });
    parentPort.postMessage({ ready: true });
    Atomics.wait(new Int32Array(workerData.gate), 0, 0);
    try {
      parentPort.postMessage({ result: service.adopt({
        userId: workerData.userId,
        streamKey: 'creator:stream-1',
        eventId: workerData.eventId,
        nowMs: 61_000
      }) });
    } catch (error) {
      parentPort.postMessage({ error: error.message });
    } finally {
      db.close();
    }
  `;
  const modules = {
    databaseModule: require.resolve('better-sqlite3'),
    storeModule: require.resolve('../plugins/streamalchemy/backend/streammonsters/database'),
    engineModule: require.resolve('../plugins/streamalchemy/backend/streammonsters/game-engine'),
    serviceModule: require.resolve('../plugins/streamalchemy/backend/streammonsters/free-egg-drop-service')
  };
  const workers = Array.from({ length: attempts }, (_, index) => {
    let resolveReady;
    let rejectReady;
    let resolveResult;
    let resolveExit;
    let readySettled = false;
    const ready = new Promise((resolve, reject) => {
      resolveReady = () => {
        readySettled = true;
        resolve();
      };
      rejectReady = error => {
        readySettled = true;
        reject(error);
      };
    });
    const result = new Promise(resolve => {
      resolveResult = resolve;
    });
    const exited = new Promise(resolve => { resolveExit = resolve; });
    const worker = new Worker(workerSource, {
      eval: true,
      workerData: {
        ...modules,
        databasePath,
        gate,
        userId: `contender-${index}`,
        eventId: `contender-event-${index}`
      }
    });
    worker.on('message', message => {
      if (message.ready) resolveReady();
      else if (message.error) resolveResult({ success: false, error: message.error });
      else resolveResult(message.result);
    });
    worker.on('error', error => {
      if (!readySettled) rejectReady(error);
      resolveResult({ success: false, error: error.message });
    });
    worker.on('exit', code => {
      if (!readySettled) {
        rejectReady(new Error(`Free egg contention worker exited before ready (${code})`));
      }
      resolveExit();
    });
    return { worker, ready, result, exited };
  });
  return {
    async waitForResults() {
      await Promise.all(workers.map(entry => entry.ready));
      Atomics.store(new Int32Array(gate), 0, 1);
      Atomics.notify(new Int32Array(gate), 0, attempts);
      const results = await Promise.all(workers.map(entry => entry.result));
      await Promise.all(workers.map(entry => entry.worker.terminate()));
      await Promise.all(workers.map(entry => entry.exited));
      return results;
    }
  };
}

async function removeTempDirectory(directory) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error.code !== 'EBUSY' || attempt === 19) throw error;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
}

describe('Stream Monsters recurring free egg drops', () => {
  test('exposes enabled daily-drop defaults and both GCCE adoption aliases', () => {
    const plugin = new StreamAlchemyPlugin({ getConfig: () => ({}) });
    plugin.config = plugin.loadConfig({});

    expect(plugin.config.streamMonsters).toEqual(expect.objectContaining({
      freeEggDropsEnabled: true,
      freeEggCooldownSeconds: 86_400
    }));
    expect(plugin.buildStreamMonstersCommandDefinitions('!')
      .filter(definition => definition.commandName === 'adopt')
      .map(definition => definition.name))
      .toEqual(['adopt', 'adoptieren']);
  });

  test('observes a first non-command chat without consuming GCCE chat ingress', async () => {
    const observed = [];
    const plugin = new StreamAlchemyPlugin({ log: jest.fn() });
    plugin.config = { enabled: true, streamMonsters: { enabled: true } };
    plugin.streamMonstersEngine = { streamKey: 'creator:stream-1' };
    plugin.streamMonstersGCCERegistrationState = 'active_commands';
    plugin.resolveStreamMonstersViewerId = () => 'viewer-a';
    plugin.streamMonstersFreeEggDrops = {
      onFirstChat: input => observed.push(input)
    };

    await expect(plugin.handleStreamMonstersChat({
      userId: 'platform-a', uniqueId: 'viewer-a', nickname: 'Viewer A',
      comment: 'hello world', eventId: 'chat-1'
    })).resolves.toEqual({ success: false, status: 'gcce_active' });
    expect(observed).toEqual([expect.objectContaining({
      userId: 'viewer-a',
      streamKey: 'creator:stream-1',
      eventId: 'chat:tiktok:chat-1',
      displayName: 'viewer-a'
    })]);
  });

  test('uses an enabled daily default and gives the first chatter a standard egg without Hype', () => {
    const subject = createSubject();

    const offered = offer(subject, 'viewer-a', 'chat-a', 1_000);
    const claimed = adopt(subject, 'viewer-a', 'adopt-a', 1_000);

    expect(offered).toEqual(expect.objectContaining({ success: true, status: 'offered' }));
    expect(claimed).toEqual(expect.objectContaining({ success: true, status: 'claimed' }));
    expect(claimed.egg).toEqual(expect.objectContaining({
      variant: 'standard',
      state: 'incubating',
      hatch_duration_ms: 120_000
    }));
    expect(subject.store.getStreamHype('creator:stream-1')).toEqual(expect.objectContaining({ points: 0 }));
    expect(subject.emitted.map(entry => entry.event)).toEqual([
      'streammonsters:free_egg_offered',
      'streammonsters:free_egg_reserved',
      'streammonsters:free_egg_claimed'
    ]);
    expect(subject.emitted.at(-1).payload).toEqual(expect.objectContaining({
      removedEggStage: expect.objectContaining({ visualId: expect.any(String) })
    }));
  });

  test('keeps an offer reserved for exactly 60 seconds before releasing it publicly', () => {
    const subject = createSubject();
    offer(subject, 'viewer-a', 'chat-a', 1_000);

    expect(adopt(subject, 'viewer-b', 'adopt-too-early', 60_999))
      .toEqual(expect.objectContaining({ success: false, status: 'no_offer' }));
    expect(adopt(subject, 'viewer-b', 'adopt-released', 61_000))
      .toEqual(expect.objectContaining({ success: true, status: 'claimed', sourceUserId: 'viewer-a' }));
    expect(subject.emitted.map(entry => entry.event)).toContain('streammonsters:free_egg_released');
  });

  test('adopts the oldest released offer in public FIFO order', () => {
    const subject = createSubject();
    offer(subject, 'viewer-a', 'chat-a', 1_000);
    offer(subject, 'viewer-b', 'chat-b', 1_001);

    expect(adopt(subject, 'viewer-c', 'adopt-c', 61_001).sourceUserId).toBe('viewer-a');
    expect(adopt(subject, 'viewer-d', 'adopt-d', 61_001).sourceUserId).toBe('viewer-b');
  });

  test('allows one successful claim per configured cooldown across streams', () => {
    const subject = createSubject({ config: { freeEggCooldownSeconds: 120 } });
    offer(subject, 'viewer-a', 'chat-a', 1_000);
    offer(subject, 'viewer-b', 'chat-b', 1_001);
    expect(adopt(subject, 'viewer-c', 'adopt-c', 61_001).success).toBe(true);

    expect(adopt(subject, 'viewer-c', 'adopt-cooldown', 121_000))
      .toEqual(expect.objectContaining({ success: false, status: 'cooldown' }));
  });

  test('deduplicates chat and adoption event ids and allows only one source offer per viewer and stream', () => {
    const subject = createSubject();
    const first = offer(subject, 'viewer-a', 'chat-a', 1_000);
    const retry = offer(subject, 'viewer-a', 'chat-a', 1_000);
    const secondChat = offer(subject, 'viewer-a', 'chat-b', 1_001);
    const claimed = adopt(subject, 'viewer-a', 'adopt-a', 1_001);
    const claimRetry = adopt(subject, 'viewer-a', 'adopt-a', 1_001);

    expect(retry).toEqual(first);
    expect(secondChat).toEqual(expect.objectContaining({ success: true, status: 'already_offered' }));
    expect(claimRetry).toEqual(claimed);
    expect(subject.store.getFreeEggOffers('creator:stream-1')).toHaveLength(1);
    expect(subject.store.getViewerEggs('viewer-a')).toHaveLength(1);
  });

  test('does not reuse a minimal-context no-offer receipt for a later adoption ingress', () => {
    const subject = createSubject();
    const commands = new StreamMonstersChatCommands({
      store: subject.store,
      engine: subject.engine,
      freeEggDropService: subject.service,
      now: subject.now
    });

    expect(commands.execute({ userId: 'viewer-b' }, 'adopt'))
      .toEqual(expect.objectContaining({ success: false, status: 'no_offer' }));
    subject.setNow(2_000);
    offer(subject, 'viewer-a', 'chat-a', 2_000);
    subject.setNow(62_000);

    expect(commands.execute({ userId: 'viewer-b' }, 'adopt'))
      .toEqual(expect.objectContaining({
        success: true,
        status: 'claimed',
        sourceUserId: 'viewer-a'
      }));
  });

  test('normalizes ingress ids by provider id, raw timestamp, context timestamp, then nonce', () => {
    const fingerprint = { streamKey: 'creator:stream-1', userId: 'viewer-a', message: '!adopt' };
    expect(normalizeIngressEventId({
      namespace: 'adopt',
      rawData: { eventId: 'provider-7', timestamp: 10 },
      context: { timestamp: 20 },
      fingerprint,
      nowMs: 30,
      nonce: 'unused'
    })).toBe('adopt:tiktok:provider-7');

    const fromRawTimestamp = normalizeIngressEventId({
      namespace: 'adopt',
      rawData: { timestamp: 10 },
      context: { timestamp: 20 },
      fingerprint,
      nowMs: 30,
      nonce: 'unused'
    });
    expect(fromRawTimestamp).toBe(normalizeIngressEventId({
      namespace: 'adopt',
      rawData: { timestamp: 10 },
      context: { timestamp: 999 },
      fingerprint,
      nowMs: 999,
      nonce: 'different'
    }));

    const fromContextTimestamp = normalizeIngressEventId({
      namespace: 'adopt',
      context: { timestamp: 20 },
      fingerprint,
      nowMs: 30,
      nonce: 'unused'
    });
    expect(fromContextTimestamp).toBe(normalizeIngressEventId({
      namespace: 'adopt',
      context: { timestamp: 20 },
      fingerprint,
      nowMs: 999,
      nonce: 'different'
    }));

    expect(normalizeIngressEventId({
      namespace: 'adopt',
      fingerprint,
      nowMs: 30,
      nonce: 'first'
    })).not.toBe(normalizeIngressEventId({
      namespace: 'adopt',
      fingerprint,
      nowMs: 30,
      nonce: 'second'
    }));
  });

  test('removes outstanding offers and their event receipts when a stream is cleaned up', () => {
    const subject = createSubject();
    offer(subject, 'viewer-a', 'chat-a', 1_000);

    expect(subject.service.cleanupStream({ streamKey: 'creator:stream-1' }))
      .toEqual({ offersRemoved: 1, eventsRemoved: 1 });
    expect(adopt(subject, 'viewer-b', 'adopt-after-cleanup', 61_000))
      .toEqual(expect.objectContaining({ success: false, status: 'no_offer' }));
  });

  test('keeps claimed offers and cooldown audit rows when a stream is cleaned up with foreign keys enforced', () => {
    const subject = createSubject();
    subject.store.db.pragma('foreign_keys = ON');
    offer(subject, 'viewer-a', 'chat-a', 1_000);
    const claimed = adopt(subject, 'viewer-a', 'adopt-a', 1_000);

    expect(() => subject.service.cleanupStream({ streamKey: 'creator:stream-1' })).not.toThrow();
    expect(subject.store.getFreeEggOffer(claimed.offerId)).toEqual(expect.objectContaining({
      status: 'claimed',
      claimed_by_user_id: 'viewer-a'
    }));
    expect(subject.store.getLatestFreeEggClaim('viewer-a')).toEqual(expect.objectContaining({
      offer_id: claimed.offerId
    }));
    expect(subject.store.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  test('recovers reserved offers after a service reload', () => {
    const subject = createSubject();
    offer(subject, 'viewer-a', 'chat-a', 1_000);
    const reloaded = new FreeEggDropService({
      store: subject.store,
      engine: subject.engine,
      emit: (event, payload) => subject.emitted.push({ event, payload }),
      now: () => 1_001
    });

    expect(reloaded.adopt({
      userId: 'viewer-a', streamKey: 'creator:stream-1', eventId: 'adopt-a', nowMs: 1_001
    })).toEqual(expect.objectContaining({ success: true, status: 'claimed' }));
  });

  describe('persisted reservation release scheduling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('releases an offer at 60 seconds without requiring another ingress', () => {
      const subject = createSubject();
      offer(subject, 'viewer-a', 'chat-a', 1_000);

      subject.setNow(60_999);
      jest.advanceTimersByTime(59_999);
      expect(subject.store.getFreeEggOfferBySource('creator:stream-1', 'viewer-a').status)
        .toBe('reserved');

      subject.setNow(61_000);
      jest.advanceTimersByTime(1);
      expect(subject.store.getFreeEggOfferBySource('creator:stream-1', 'viewer-a').status)
        .toBe('public');
      expect(subject.emitted).toContainEqual({
        event: 'streammonsters:free_egg_released',
        payload: expect.objectContaining({
          streamKey: 'creator:stream-1',
          sourceUserId: 'viewer-a'
        })
      });
    });

    test('sweeps an expired persisted reservation immediately on reload', () => {
      const subject = createSubject();
      offer(subject, 'viewer-a', 'chat-a', 1_000);
      subject.service.destroy();
      subject.setNow(61_000);
      subject.emitted.splice(0);

      const reloaded = new FreeEggDropService({
        store: subject.store,
        engine: subject.engine,
        emit: (event, payload) => subject.emitted.push({ event, payload }),
        now: subject.now
      });

      expect(subject.store.getFreeEggOfferBySource('creator:stream-1', 'viewer-a').status)
        .toBe('public');
      expect(subject.emitted.map(entry => entry.event))
        .toEqual([
          'streammonsters:free_egg_released',
          'streammonsters:free_egg_public'
        ]);
      reloaded.destroy();
    });

    test('rearms to the next reservation and clears scheduling on stream cleanup and destroy', () => {
      const subject = createSubject();
      offer(subject, 'viewer-a', 'chat-a', 1_000);
      subject.setNow(2_000);
      subject.service.onFirstChat({
        userId: 'viewer-b',
        streamKey: 'creator:stream-2',
        eventId: 'chat-b',
        nowMs: 2_000
      });

      subject.setNow(61_000);
      jest.advanceTimersByTime(59_000);
      expect(subject.store.getFreeEggOfferBySource('creator:stream-1', 'viewer-a').status)
        .toBe('public');
      expect(subject.store.getFreeEggOfferBySource('creator:stream-2', 'viewer-b').status)
        .toBe('reserved');

      subject.service.cleanupStream({ streamKey: 'creator:stream-1' });
      subject.setNow(62_000);
      jest.advanceTimersByTime(1_000);
      expect(subject.store.getFreeEggOfferBySource('creator:stream-2', 'viewer-b').status)
        .toBe('public');

      subject.setNow(70_000);
      subject.service.onFirstChat({
        userId: 'viewer-c',
        streamKey: 'creator:stream-3',
        eventId: 'chat-c',
        nowMs: 70_000
      });
      expect(jest.getTimerCount()).toBe(1);
      subject.service.destroy();
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  test('atomically allows one winner when twenty independent SQLite callers contend for one released offer', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-free-egg-'));
    const databasePath = path.join(directory, 'streammonsters.sqlite');
    const sqlite = new Database(databasePath);
    const store = new StreamMonstersDatabase(sqlite);
    store.initialize();
    const engine = new StreamMonstersEngine({
      store,
      now: () => 1_000,
      config: { hatchDurationMs: 120_000, eggExpiryMs: 86_400_000 }
    });
    engine.setStreamKey('creator:stream-1');
    const service = new FreeEggDropService({ store, engine, now: () => 1_000 });
    offer({ service }, 'source-a', 'chat-a', 1_000);
    sqlite.close();

    try {
      const contention = runContendingAdopters({ databasePath });
      const results = await contention.waitForResults();
      const verificationDb = new Database(databasePath);
      verificationDb.pragma('foreign_keys = ON');
      const verificationStore = new StreamMonstersDatabase(verificationDb);

      expect(results.filter(result => result.error)).toHaveLength(0);
      expect(results.filter(result => result.success)).toHaveLength(1);
      expect(verificationStore.getFreeEggOffers('creator:stream-1'))
        .toEqual([expect.objectContaining({ status: 'claimed' })]);
      expect(verificationDb.prepare('SELECT COUNT(*) AS count FROM streammonsters_free_egg_claims').get().count)
        .toBe(1);
      expect(verificationDb.prepare('SELECT COUNT(*) AS count FROM streammonsters_eggs').get().count)
        .toBe(1);
      expect(verificationDb.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      verificationDb.close();
    } finally {
      await removeTempDirectory(directory);
    }
  });
});
