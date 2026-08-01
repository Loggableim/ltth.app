const Database = require('better-sqlite3');
const fs = require('fs');
const os = require('os');
const path = require('path');
const StreamAlchemyPlugin = require('../plugins/stream-monsters');

const RETIRED_EXECUTABLE_FILES = [
  'config.js',
  'craftingService.js',
  'db.js',
  'fusionService.js',
  'lightxService.js',
  'overlay.html',
  'promptGenerator.js',
  'siliconFlowService.js',
  'style.css',
  'tierSystem.js',
  'ui-old.html',
  'ui.html',
  'backend/constants.js',
  'backend/crafting-engine.js',
  'backend/database.js',
  'backend/event-processor.js',
  'backend/generation-service.js',
  'backend/inventory-service.js',
  'backend/legacy-importer.js',
  'backend/local-model-installer.js',
  'backend/model-catalog.js',
  'backend/overlay-publisher.js',
  'backend/prompt-service.js',
  'backend/rarity-frames.js',
  'backend/recipe-service.js',
  'backend/routes.js',
  'backend/system-analyzer.js',
  'backend/providers/local-comfy-provider.js',
  'backend/providers/placeholder-provider.js',
  'backend/providers/remote-provider-adapters.js',
  'backend/streammonsters/art-pool-service.js',
  'backend/streammonsters/generation-pool.js',
  'backend/streammonsters/managed-runtime-installer.js'
];

function createApi(sqlite, dataDir) {
  return {
    pluginDir: path.join(process.cwd(), 'plugins', 'stream-monsters'),
    getDatabase: () => sqlite,
    getConfig: () => ({}),
    setConfig: jest.fn(),
    ensurePluginDataDir: () => dataDir,
    registerRoute: jest.fn(),
    registerTikTokEvent: jest.fn(),
    emit: jest.fn(),
    log: jest.fn(),
    on: jest.fn(() => true),
    removeListener: jest.fn(),
    pluginLoader: { loadedPlugins: new Map() }
  };
}

describe('retired StreamAlchemy execution surface', () => {
  test('does not ship generator, provider, managed-runtime or legacy static executables', () => {
    const pluginDir = path.join(process.cwd(), 'plugins', 'stream-monsters');
    for (const relativePath of RETIRED_EXECUTABLE_FILES) {
      expect(fs.existsSync(path.join(pluginDir, relativePath))).toBe(false);
    }
    expect(fs.existsSync(path.join(pluginDir, 'streammonsters-ui.html'))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, 'streammonsters-overlay.html'))).toBe(true);
  });

  test('preserves historical StreamAlchemy database rows and data-directory bytes', async () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE streamalchemy_items (
        item_id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        name TEXT NOT NULL,
        generator TEXT NOT NULL,
        payload BLOB
      );
      CREATE TABLE streamalchemy_generation_jobs (
        job_id TEXT PRIMARY KEY,
        item_id TEXT,
        status TEXT NOT NULL,
        provider TEXT NOT NULL,
        prompt TEXT NOT NULL
      );
      CREATE TABLE streamalchemy_user_inventory (
        user_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        PRIMARY KEY (user_id, item_id)
      );
    `);
    sqlite.prepare(`
      INSERT INTO streamalchemy_items
        (item_id, source_type, name, generator, payload)
      VALUES (?, ?, ?, ?, ?)
    `).run('legacy-item', 'gift', 'Historical item', 'siliconflow', Buffer.from([0, 1, 2, 255]));
    sqlite.prepare(`
      INSERT INTO streamalchemy_generation_jobs
        (job_id, item_id, status, provider, prompt)
      VALUES (?, ?, ?, ?, ?)
    `).run('legacy-job', 'legacy-item', 'complete', 'local-comfy', 'historical prompt');
    sqlite.prepare(`
      INSERT INTO streamalchemy_user_inventory
        (user_id, item_id, quantity)
      VALUES (?, ?, ?)
    `).run('legacy-viewer', 'legacy-item', 7);

    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streamalchemy-retired-data-'));
    const modelDir = path.join(dataDir, 'models', 'historical');
    const markerPath = path.join(modelDir, 'model.bin');
    const marker = Buffer.from('historical-provider-bytes\u0000unchanged', 'utf8');
    fs.mkdirSync(modelDir, { recursive: true });
    fs.writeFileSync(markerPath, marker);

    const snapshot = {
      schema: sqlite.prepare(`
        SELECT name, sql
        FROM sqlite_master
        WHERE type = 'table' AND name LIKE 'streamalchemy_%'
        ORDER BY name
      `).all(),
      items: sqlite.prepare(`
        SELECT item_id, source_type, name, generator, hex(payload) AS payload
        FROM streamalchemy_items
        ORDER BY item_id
      `).all(),
      jobs: sqlite.prepare('SELECT * FROM streamalchemy_generation_jobs ORDER BY job_id').all(),
      inventory: sqlite.prepare('SELECT * FROM streamalchemy_user_inventory ORDER BY user_id').all()
    };

    const plugin = new StreamAlchemyPlugin(createApi(sqlite, dataDir));
    await plugin.init();
    await plugin.destroy();

    expect(sqlite.prepare(`
      SELECT name, sql
      FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'streamalchemy_%'
      ORDER BY name
    `).all()).toEqual(snapshot.schema);
    expect(sqlite.prepare(`
      SELECT item_id, source_type, name, generator, hex(payload) AS payload
      FROM streamalchemy_items
      ORDER BY item_id
    `).all()).toEqual(snapshot.items);
    expect(sqlite.prepare(
      'SELECT * FROM streamalchemy_generation_jobs ORDER BY job_id'
    ).all()).toEqual(snapshot.jobs);
    expect(sqlite.prepare(
      'SELECT * FROM streamalchemy_user_inventory ORDER BY user_id'
    ).all()).toEqual(snapshot.inventory);
    expect(fs.readFileSync(markerPath)).toEqual(marker);
    expect(fs.readdirSync(modelDir)).toEqual(['model.bin']);
    sqlite.close();
  });
});
