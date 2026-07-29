const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const Database = require('better-sqlite3');
const GCCE = require('../plugins/gcce');
const StreamAlchemyPlugin = require('../plugins/streamalchemy');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');
const CollectionService = require('../plugins/streamalchemy/backend/streammonsters/collection-service');
const ChatCommands = require('../plugins/streamalchemy/backend/streammonsters/chat-commands');
const overlayRuntime = require('../plugins/streamalchemy/streammonsters-overlay-runtime');
const {
  applyEvolutionGrant
} = require('../plugins/streamalchemy/backend/streammonsters/evolution-rules');

const temporaryDirectories = [];

function temporaryDatabasePath(name) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-review-'));
  temporaryDirectories.push(directory);
  return path.join(directory, `${name}.sqlite`);
}

function createGCCEApi() {
  const configStore = {};
  const api = {
    pluginDir: path.join(process.cwd(), 'plugins', 'gcce'),
    emitted: [],
    log: jest.fn(),
    getConfig: key => configStore[key] || null,
    setConfig: (key, value) => { configStore[key] = value; },
    registerTikTokEvent: jest.fn(),
    registerRoute: jest.fn(),
    registerSocket: jest.fn(),
    registerFlowAction: jest.fn(),
    registerIFTTTAction: jest.fn(),
    emit(event, payload) {
      this.emitted.push({ event, payload });
    },
    on: jest.fn().mockReturnValue(true),
    getDatabase: () => ({ prepare: () => ({ get: () => null }) }),
    getSocketIO() {
      return { emit: (event, payload) => this.emitted.push({ event, payload }) };
    },
    getPluginDataDir: () => path.join(process.cwd(), 'tmp', 'gcce-review'),
    ensurePluginDataDir: () => path.join(process.cwd(), 'tmp', 'gcce-review'),
    pluginLoader: { loadedPlugins: new Map() }
  };
  return api;
}

function createStore(sqlite = new Database(':memory:')) {
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  return store;
}

function createEgg(store, eggId, state = 'ready') {
  return store.createEgg({
    eggId,
    userId: 'viewer-a',
    giftId: 77,
    giftName: 'Team Heart',
    element: 'Ember',
    eggColor: '#ef6b45',
    seed: `seed:${eggId}`,
    state,
    createdAtMs: 1,
    queuedAtMs: state === 'queued' ? 1 : null,
    readyAtMs: state === 'queued' ? null : 1,
    hatchDurationMs: 1
  });
}

function createMonster(store, eggId, monsterId) {
  const egg = createEgg(store, eggId);
  return store.createMonsterFromEgg(egg, {
    monsterId,
    name: monsterId,
    templateId: 'ashfang',
    personality: 'Brave',
    rarity: 'Standard',
    stats: { vitality: 7, might: 8, guard: 6, agility: 7 },
    imageUrl: `/assets/${monsterId}.png`,
    visualSource: 'furry',
    visualKey: 'furry:ashfang',
    createdAtMs: monsterId === 'monster-a' ? 2 : 3
  });
}

function runWorkers(source, workerData, count = 2) {
  const workers = Array.from({ length: count }, () => new Worker(source, {
    eval: true,
    workerData
  }));
  return new Promise((resolve, reject) => {
    const ready = [];
    const results = [];
    let exited = 0;
    workers.forEach(worker => {
      worker.once('error', reject);
      worker.once('exit', () => {
        exited += 1;
        if (exited === workers.length && results.length === workers.length) resolve(results);
      });
      worker.on('message', message => {
        if (message === 'ready') {
          ready.push(worker);
          if (ready.length === workers.length) workers.forEach(item => item.postMessage('go'));
          return;
        }
        results.push(message);
      });
    });
  });
}

afterEach(() => {
  while (temporaryDirectories.length) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe('Stream Monsters review fix round 1', () => {
  test('upgrades the persisted rank-only default with a non-conflicting GCCE alias', () => {
    const plugin = new StreamAlchemyPlugin({ pluginDir: '', log: jest.fn() });

    expect(plugin.normalizeCommandAliases({
      rank: { enabled: ['rank'], disabled: [] }
    }).rank).toEqual({
      enabled: ['rank', 'monsterrank'],
      disabled: []
    });
    expect(plugin.normalizeCommandAliases({
      rank: { enabled: ['rank'], disabled: ['monsterrank'] }
    }).rank).toEqual({
      enabled: ['rank'],
      disabled: ['monsterrank']
    });
  });

  test('keeps GCCE as sole ingress while a real rank ownership collision degrades per alias', async () => {
    const api = createGCCEApi();
    const gcce = new GCCE(api);
    await gcce.init();
    gcce.registerCommandsForPlugin('milestone-leaderboard', [{
      name: 'rank',
      description: 'Viewer XP rank',
      permission: 'all',
      handler: () => ({ success: true })
    }]);

    const plugin = new StreamAlchemyPlugin({
      pluginDir: path.join(process.cwd(), 'plugins', 'streamalchemy'),
      log: jest.fn()
    });
    plugin.config = {
      enabled: true,
      streamMonsters: {
        enabled: true,
        commandAliases: plugin.normalizeCommandAliases()
      }
    };
    plugin.streamMonstersCommandPrefix = '!';
    plugin.streamMonstersGCCERegistrationState = 'fallback';
    plugin.streamMonstersGCCERegistrationError = null;
    plugin.streamMonstersCommandIngress = {
      setCommands: jest.fn(),
      executeCommand: jest.fn().mockResolvedValue({ success: true, status: 'rank' })
    };
    plugin.resolveStreamMonstersViewerId = jest.fn().mockReturnValue('viewer-a');

    expect(plugin.integrateStreamMonstersGCCE({ candidate: gcce })).toBe(true);
    expect(gcce.registry.getCommand('rank')).toEqual(expect.objectContaining({
      pluginId: 'milestone-leaderboard'
    }));
    expect(gcce.registry.getCommand('monsterrank')).toEqual(expect.objectContaining({
      pluginId: 'streamalchemy',
      commandName: 'rank'
    }));
    expect(plugin.getStreamMonstersGCCEState()).toEqual(expect.objectContaining({
      registrationState: 'active_partial',
      registrationError: 'alias_conflicts',
      registrationConflicts: ['rank'],
      commandsRegistered: true
    }));

    await gcce.handleChatMessage({
      comment: '/monsterrank',
      uniqueId: 'viewer-a',
      nickname: 'Viewer A'
    });
    expect(plugin.streamMonstersCommandIngress.executeCommand)
      .toHaveBeenCalledWith(
        'rank',
        [],
        expect.objectContaining({ userId: 'viewer-a' }),
        'gcce',
        'monsterrank'
      );
    expect(plugin.streamMonstersGCCERegistrationState).not.toBe('fallback');
    await gcce.destroy();
  });

  test('accepts every new localized chat result key in the overlay runtime', () => {
    expect([
      'chatResultEggNotFound',
      'chatResultEvolved',
      'chatResultEvolutionLocked'
    ].map(messageKey => overlayRuntime.chatMessageKey({ messageKey }))).toEqual([
      'chatResultEggNotFound',
      'chatResultEvolved',
      'chatResultEvolutionLocked'
    ]);
  });

  test('derives help and hatch guidance from the dynamic prefix and enabled egg alias', () => {
    const store = {
      getQueuedEggs: () => [],
      getViewerEggs: () => []
    };
    const engine = {
      streamKey: 'stream-a',
      markReadyEggs: jest.fn(),
      hatchEgg: () => {
        const error = new Error('missing');
        error.code = 'STREAM_MONSTERS_EGG_NOT_FOUND';
        throw error;
      }
    };
    const references = {
      eggs: '$eier',
      hatch: '$hatch',
      monsters: '$monsterliste',
      monster: '$monster',
      choose: '$choose',
      evolve: '$evolve',
      battle: '$battle',
      leavebattle: '$leavebattle',
      rank: '$monsterrank',
      quests: '$quests'
    };
    const commands = new ChatCommands({
      store,
      engine,
      battleService: {},
      getCommandReference: command => references[command]
    });

    const help = commands.execute({ userId: 'viewer-a' }, 'monstershelp');
    const hatch = commands.execute({ userId: 'viewer-a' }, 'hatch', ['1']);

    expect(help.message).toContain('$eier');
    expect(help.message).toContain('$monsterliste');
    expect(help.message).toContain('$monsterrank');
    expect(help.message).not.toContain('!');
    expect(help.message).not.toContain('$eggs');
    expect(hatch.message).toBe('That egg slot does not exist. Check $eier.');
  });

  test('derives spawned and ready event hints from the same effective command references', () => {
    const store = createStore();
    store.upsertGiftMapping({
      giftId: 77,
      giftName: 'Team Heart',
      coinValue: 1,
      effect: 'spawn',
      element: 'Random',
      enabled: true
    });
    const emitted = [];
    let now = 1_000;
    const references = { inventory: '$monsterliste', hatch: '$schlupf' };
    const engine = new StreamMonstersEngine({
      store,
      now: () => now,
      emit: (event, payload) => emitted.push({ event, payload }),
      getCommandReference: command => references[command],
      config: { hatchDurationMs: 100 }
    });
    engine.processGift({
      userId: 'viewer-a',
      giftId: 77,
      giftName: 'Team Heart',
      eventKey: 'guidance-event'
    });
    now = 1_100;
    engine.markReadyEggs();

    expect(emitted.find(entry => entry.event === 'streammonsters:egg_spawned').payload.hint)
      .toBe('$monsterliste');
    expect(emitted.find(entry => entry.event === 'streammonsters:egg_ready').payload.hint)
      .toBe('$schlupf [slot]');
  });

  test('charges each same-element monster its own 3 then 8 evolution essence total', () => {
    const store = createStore();
    const emitted = [];
    const collection = new CollectionService({
      store,
      emit: (event, payload) => emitted.push({ event, payload }),
      now: () => 5_000
    });
    const first = createMonster(store, 'egg-a', 'monster-a');
    const second = createMonster(store, 'egg-b', 'monster-b');
    const original = [first, second].map(monster => ({
      monsterId: monster.monster_id,
      stats: monster.stats,
      xp: monster.xp,
      level: monster.level
    }));
    store.setTemplateMastery('viewer-a', 'ashfang', 50, []);
    store.setElementEssence('viewer-a', 'Ember', 16, []);

    expect(collection.evolveMonster('viewer-a', 'monster-a').spentEssence).toBe(3);
    expect(collection.evolveMonster('viewer-a', 'monster-a').spentEssence).toBe(8);
    expect(collection.evolveMonster('viewer-a', 'monster-b').spentEssence).toBe(3);
    expect(collection.evolveMonster('viewer-a', 'monster-b').spentEssence).toBe(8);
    expect(collection.getEssence('viewer-a', 'Ember')).toEqual(expect.objectContaining({
      amount: 0,
      spent: 16
    }));
    for (const before of original) {
      const stageThreeStats = applyEvolutionGrant(
        applyEvolutionGrant(before.stats, 'Ember', 2),
        'Ember',
        3
      );
      expect(store.getMonster(before.monsterId)).toEqual(expect.objectContaining({
        evolution_stage: 3,
        evolution_essence_spent: 8,
        stats: stageThreeStats,
        xp: before.xp,
        level: before.level
      }));
    }
  });

  test('backfills per-monster spend for historical Evolution II and III rows', () => {
    const store = createStore();
    createMonster(store, 'egg-a', 'monster-a');
    createMonster(store, 'egg-b', 'monster-b');
    store.db.prepare(`
      UPDATE streammonsters_monsters
      SET evolution_stage = CASE monster_id
        WHEN 'monster-a' THEN 2
        WHEN 'monster-b' THEN 3
      END,
      evolution_essence_spent = 0
      WHERE monster_id IN ('monster-a', 'monster-b')
    `).run();

    store.initialize();

    expect(store.getMonster('monster-a').evolution_essence_spent).toBe(3);
    expect(store.getMonster('monster-b').evolution_essence_spent).toBe(8);
  });

  test('emits every crossed Hype milestone in deterministic order across multiple cycles', () => {
    const store = createStore();
    const emitted = [];
    const engine = new StreamMonstersEngine({
      store,
      emit: (event, payload) => emitted.push({ event, payload }),
      now: () => 10_000
    });
    engine.setStreamKey('stream-a');

    expect(engine.addHype(200)).toEqual(expect.objectContaining({
      points: 0,
      charged_eggs: 2
    }));
    expect(emitted
      .filter(entry => entry.event === 'streammonsters:hype_milestone')
      .map(entry => entry.payload.milestone))
      .toEqual([25, 50, 75, 100, 25, 50, 75, 100]);
  });

  test('rolls back the complete additive migration when a column step fails', () => {
    const sqlite = new Database(':memory:');
    const store = new StreamMonstersDatabase(sqlite);
    const ensureColumn = store.ensureColumn.bind(store);
    store.ensureColumn = (table, column, definition) => {
      if (column === 'expires_at_ms') throw new Error('INJECTED_MIGRATION_FAILURE');
      return ensureColumn(table, column, definition);
    };

    expect(() => store.initialize()).toThrow('INJECTED_MIGRATION_FAILURE');
    expect(sqlite.prepare(`
      SELECT COUNT(*) AS count FROM sqlite_master
      WHERE name LIKE 'streammonsters_%'
    `).get().count).toBe(0);

    store.ensureColumn = ensureColumn;
    expect(() => store.initialize()).not.toThrow();
  });

  test('serializes concurrent legacy initialization across two database connections', async () => {
    const databasePath = temporaryDatabasePath('concurrent-init');
    const seed = new Database(databasePath);
    seed.exec(`
      CREATE TABLE streammonsters_eggs (
        egg_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, gift_id INTEGER NOT NULL,
        gift_name TEXT NOT NULL, element TEXT NOT NULL, egg_color TEXT NOT NULL,
        seed TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'incubating',
        created_at_ms INTEGER NOT NULL, hatch_duration_ms INTEGER NOT NULL,
        boost_ms INTEGER NOT NULL DEFAULT 0, image_url TEXT, monster_id TEXT,
        variant TEXT NOT NULL DEFAULT 'standard', ready_at_ms INTEGER,
        queued_at_ms INTEGER, incubating_at_ms INTEGER,
        visual_source TEXT NOT NULL DEFAULT 'legacy', visual_key TEXT
      );
    `);
    seed.close();
    const workerSource = `
      const { parentPort, workerData } = require('worker_threads');
      const Database = require(workerData.databaseModule);
      const Store = require(workerData.storeModule);
      parentPort.postMessage('ready');
      parentPort.once('message', () => {
        const sqlite = new Database(workerData.databasePath, { timeout: 2000 });
        const store = new Store(sqlite);
        const ensureColumn = store.ensureColumn.bind(store);
        store.ensureColumn = (table, column, definition) => {
          if (column !== 'expires_at_ms') return ensureColumn(table, column, definition);
          const columns = sqlite.prepare('PRAGMA table_info(' + table + ')').all();
          if (columns.some(entry => entry.name === column)) return;
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
          sqlite.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition);
        };
        try {
          store.initialize();
          parentPort.postMessage({ ok: true });
        } catch (error) {
          parentPort.postMessage({ ok: false, error: error.message });
        } finally {
          sqlite.close();
        }
      });
    `;
    const results = await runWorkers(workerSource, {
      databasePath,
      databaseModule: require.resolve('better-sqlite3'),
      storeModule: require.resolve('../plugins/streamalchemy/backend/streammonsters/database')
    });

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    const verify = new Database(databasePath);
    expect(verify.prepare('PRAGMA table_info(streammonsters_eggs)').all()
      .filter(column => column.name === 'expires_at_ms')).toHaveLength(1);
    verify.close();
  }, 10_000);

  test('rolls back readiness and expiry when FIFO promotion fails in the same lifecycle', () => {
    const store = createStore();
    store.createEgg({
      eggId: 'incubating-due',
      userId: 'viewer-a',
      giftId: 77,
      giftName: 'Team Heart',
      element: 'Ember',
      eggColor: '#ef6b45',
      seed: 'due',
      state: 'incubating',
      createdAtMs: 1,
      readyAtMs: 5,
      hatchDurationMs: 4
    });
    store.createEgg({
      eggId: 'ready-expired',
      userId: 'viewer-a',
      giftId: 77,
      giftName: 'Team Heart',
      element: 'Ember',
      eggColor: '#ef6b45',
      seed: 'expired',
      state: 'ready',
      createdAtMs: 1,
      readyAtMs: 1,
      expiresAtMs: 5,
      hatchDurationMs: 1
    });
    createEgg(store, 'queued-a', 'queued');
    const engine = new StreamMonstersEngine({
      store,
      now: () => 10,
      config: { maxUnhatchedEggs: 3, eggExpiryMs: 4 }
    });
    store.promoteQueuedEggs = () => {
      throw new Error('INJECTED_PROMOTION_FAILURE');
    };

    expect(() => engine.markReadyEggs()).toThrow('INJECTED_PROMOTION_FAILURE');
    expect(store.getEgg('incubating-due').state).toBe('incubating');
    expect(store.getEgg('ready-expired').state).toBe('ready');
    expect(store.getEgg('queued-a').state).toBe('queued');
  });

  test('keeps at most three incubators during concurrent lifecycle calls on two connections', async () => {
    const databasePath = temporaryDatabasePath('concurrent-lifecycle');
    const sqlite = new Database(databasePath);
    const store = createStore(sqlite);
    for (let index = 0; index < 12; index += 1) {
      store.createEgg({
        eggId: `queued-${index}`,
        userId: 'viewer-a',
        giftId: 77,
        giftName: 'Team Heart',
        element: 'Ember',
        eggColor: '#ef6b45',
        seed: `queued:${index}`,
        state: 'queued',
        createdAtMs: index + 1,
        queuedAtMs: index + 1,
        hatchDurationMs: 120_000
      });
    }
    sqlite.close();
    const workerSource = `
      const { parentPort, workerData } = require('worker_threads');
      const Database = require(workerData.databaseModule);
      const Store = require(workerData.storeModule);
      const Engine = require(workerData.engineModule);
      parentPort.postMessage('ready');
      parentPort.once('message', () => {
        const sqlite = new Database(workerData.databasePath, { timeout: 2000 });
        const store = new Store(sqlite);
        const getQueuedEggs = store.getQueuedEggs.bind(store);
        store.getQueuedEggs = (...args) => {
          const queued = getQueuedEggs(...args);
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
          return queued;
        };
        const engine = new Engine({
          store,
          now: () => 1_000,
          config: { maxUnhatchedEggs: 3, eggExpiryMs: 86_400_000 }
        });
        try {
          engine.markReadyEggs();
          parentPort.postMessage({ ok: true });
        } catch (error) {
          parentPort.postMessage({ ok: false, error: error.message });
        } finally {
          sqlite.close();
        }
      });
    `;
    const results = await runWorkers(workerSource, {
      databasePath,
      databaseModule: require.resolve('better-sqlite3'),
      storeModule: require.resolve('../plugins/streamalchemy/backend/streammonsters/database'),
      engineModule: require.resolve('../plugins/streamalchemy/backend/streammonsters/game-engine')
    });

    expect(results).toEqual([{ ok: true }, { ok: true }]);
    const verify = new Database(databasePath);
    expect(verify.prepare(`
      SELECT COUNT(*) AS count FROM streammonsters_eggs
      WHERE user_id = 'viewer-a' AND state = 'incubating'
    `).get().count).toBe(3);
    verify.close();
  }, 10_000);
});
