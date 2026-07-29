const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);
const StreamMonstersCommandIngress = require(
  '../plugins/streamalchemy/backend/streammonsters/command-ingress'
);

function createStore(filename = ':memory:') {
  const sqlite = new Database(filename);
  sqlite.pragma('busy_timeout = 5000');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  return { sqlite, store };
}

function commandDefinition() {
  return {
    name: 'hatch',
    commandName: 'hatch',
    minArgs: 0,
    maxArgs: 1,
    cooldown: { user: 0, global: 0 }
  };
}

describe('Stream Monsters durable command ingress deduplication', () => {
  test('executes one provider command only once across fallback and GCCE ingress', async () => {
    const { sqlite, store } = createStore();
    let executions = 0;
    const emitted = [];
    const ingress = new StreamMonstersCommandIngress({
      execute: async () => {
        executions += 1;
        return { success: true, status: 'hatched' };
      },
      emit: (event, payload) => emitted.push({ event, payload }),
      resolveUserId: data => data.userId,
      claimEvent: input => store.claimCommandIngressEvent(input),
      now: () => 10_000
    });
    ingress.setCommands([commandDefinition()], '!');
    const rawData = {
      provider: 'tiktok',
      eventId: 'provider-message-1',
      userId: 'viewer-a',
      comment: '!hatch'
    };

    const fallback = await ingress.handleFallback(rawData);
    const duplicate = await ingress.executeCommand(
      'hatch',
      [],
      { userId: 'viewer-a', username: 'Viewer A', rawData },
      'gcce',
      'hatch'
    );

    expect(fallback).toEqual(expect.objectContaining({
      success: true,
      status: 'hatched'
    }));
    expect(duplicate).toEqual({
      success: true,
      handled: true,
      status: 'duplicate_event',
      duplicate: true,
      suppressed: true
    });
    expect(executions).toBe(1);
    expect(emitted).toHaveLength(1);
    sqlite.close();
  });

  test('suppresses an immediate fallback replay before cooldown feedback is emitted', async () => {
    const { sqlite, store } = createStore();
    let executions = 0;
    const emitted = [];
    const ingress = new StreamMonstersCommandIngress({
      execute: async () => {
        executions += 1;
        return { success: true, status: 'hatched' };
      },
      emit: (event, payload) => emitted.push({ event, payload }),
      resolveUserId: data => data.userId,
      claimEvent: input => store.claimCommandIngressEvent(input),
      now: () => 10_000
    });
    ingress.setCommands([{
      ...commandDefinition(),
      cooldown: { user: 30_000, global: 1_000 }
    }], '!');
    const rawData = {
      provider: 'tiktok',
      eventId: 'provider-message-immediate-replay',
      userId: 'viewer-a',
      comment: '!hatch'
    };

    const first = await ingress.handleFallback(rawData);
    const duplicate = await ingress.handleFallback(rawData);

    expect(first).toEqual(expect.objectContaining({
      success: true,
      status: 'hatched'
    }));
    expect(duplicate).toEqual({
      success: true,
      handled: true,
      status: 'duplicate_event',
      duplicate: true,
      suppressed: true
    });
    expect(executions).toBe(1);
    expect(emitted).toHaveLength(1);
    sqlite.close();
  });

  test('atomically grants one claim to concurrent SQLite connections', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-command-dedupe-'));
    const filename = path.join(tempDir, 'commands.sqlite');
    const { sqlite } = createStore(filename);
    const workerSource = `
      const { parentPort, workerData } = require('worker_threads');
      const Database = require(workerData.sqliteModule);
      const Store = require(workerData.storeModule);
      const sqlite = new Database(workerData.filename);
      sqlite.pragma('busy_timeout = 5000');
      const store = new Store(sqlite);
      const result = store.claimCommandIngressEvent(workerData.input);
      sqlite.close();
      parentPort.postMessage(result);
    `;
    const workerData = {
      filename,
      sqliteModule: require.resolve('better-sqlite3'),
      storeModule: require.resolve(
        '../plugins/streamalchemy/backend/streammonsters/database'
      ),
      input: {
        eventId: 'command:tiktok:provider-message-2',
        commandName: 'hatch',
        userId: 'viewer-a',
        transport: 'gcce',
        createdAtMs: 20_000,
        ttlMs: 60_000,
        maxRows: 100
      }
    };
    const runWorker = () => new Promise((resolve, reject) => {
      const worker = new Worker(workerSource, { eval: true, workerData });
      worker.once('message', resolve);
      worker.once('error', reject);
    });

    try {
      const results = await Promise.all([runWorker(), runWorker()]);

      expect(results.filter(result => result.claimed)).toHaveLength(1);
      expect(results.filter(result => !result.claimed)).toHaveLength(1);
      expect(sqlite.prepare(`
        SELECT COUNT(*) AS count FROM streammonsters_command_ingress_events
      `).get().count).toBe(1);
    } finally {
      sqlite.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('removes expired receipts and keeps the durable ledger within its row bound', () => {
    const { sqlite, store } = createStore();
    for (let index = 0; index < 5; index += 1) {
      expect(store.claimCommandIngressEvent({
        eventId: `command:event-${index}`,
        commandName: 'hatch',
        userId: 'viewer-a',
        transport: 'fallback',
        createdAtMs: 1_000 + index,
        ttlMs: 10_000,
        maxRows: 3
      }).claimed).toBe(true);
    }

    expect(sqlite.prepare(`
      SELECT event_id FROM streammonsters_command_ingress_events
      ORDER BY sequence
    `).all().map(row => row.event_id)).toEqual([
      'command:event-2',
      'command:event-3',
      'command:event-4'
    ]);
    expect(store.claimCommandIngressEvent({
      eventId: 'command:event-5',
      commandName: 'hatch',
      userId: 'viewer-a',
      transport: 'fallback',
      createdAtMs: 20_000,
      ttlMs: 10_000,
      maxRows: 3
    }).claimed).toBe(true);
    expect(sqlite.prepare(`
      SELECT event_id FROM streammonsters_command_ingress_events
    `).all()).toEqual([{ event_id: 'command:event-5' }]);
    sqlite.close();
  });
});
