const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
const TTSPlugin = require('../plugins/tts/main');

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

class MockDatabase {
  constructor(db) {
    this.db = db;
  }

  getSetting(key) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  setSetting(key, value) {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }
}

class MockAPI {
  constructor(db) {
    this.db = db;
    this.logger = mockLogger;
    this.config = {};
  }

  getDatabase() {
    return this.db;
  }

  getConfig(key) {
    return this.config[key];
  }

  setConfig(key, value) {
    this.config[key] = value;
    return true;
  }

  emit() {}
  registerRoute() {}
  registerSocket() {}
  registerTikTokEvent() {}
}

function createTestDatabase() {
  const dbPath = path.join(__dirname, `test-tts-teamlevel-fish-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('tts_enabled', 'true');

  return { db, dbPath };
}

describe('TTS team level Fish.audio voice assignment', () => {
  let rawDb;
  let dbPath;
  let plugin;
  let queuedItem;
  let randomSpy;

  beforeEach(async () => {
    jest.clearAllMocks();
    queuedItem = null;

    const setup = createTestDatabase();
    rawDb = setup.db;
    dbPath = setup.dbPath;

    plugin = new TTSPlugin(new MockAPI(new MockDatabase(rawDb)));
    await plugin.init();

    plugin.queueManager.stopProcessing();
    plugin.queueManager = {
      enqueue: jest.fn((item) => {
        queuedItem = item;
        return {
          success: true,
          position: 1,
          queueSize: 1,
          estimatedWaitMs: 0
        };
      }),
      stopProcessing: jest.fn()
    };

    plugin.engines.fishaudio = {
      synthesize: jest.fn(async () => Buffer.from('fish-audio').toString('base64')),
      synthesizeStream: jest.fn()
    };

    plugin.engines.tiktok = {
      synthesize: jest.fn(async () => Buffer.from('tiktok-audio').toString('base64'))
    };

    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(async () => {
    if (randomSpy) {
      randomSpy.mockRestore();
    }

    if (plugin && typeof plugin.destroy === 'function') {
      await plugin.destroy();
    }

    if (rawDb) {
      rawDb.close();
    }

    if (dbPath && fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  test('assigns a random Fish.audio voice when a chat user reaches team level 3 without an assigned voice', async () => {
    const expectedVoiceId = Object.keys(FishSpeechEngine.getVoices())[0];

    const result = await plugin.speak({
      text: 'Hallo Chat',
      userId: 'team-3-user',
      username: 'TeamDrei',
      source: 'chat',
      teamLevel: 3
    });

    expect(result.success).toBe(true);
    expect(queuedItem).toEqual(expect.objectContaining({
      userId: 'team-3-user',
      username: 'TeamDrei',
      engine: 'fishaudio',
      voice: expectedVoiceId,
      hasAssignedVoice: true
    }));

    const settings = plugin.permissionManager.getUserSettings('team-3-user');
    expect(settings).toEqual(expect.objectContaining({
      assigned_voice_id: expectedVoiceId,
      assigned_engine: 'fishaudio',
      allow_tts: 1
    }));
  });

  test('does not overwrite an existing TTS voice for a team level 3 user', async () => {
    plugin.permissionManager.assignVoice('existing-user', 'ExistingUser', 'de_002', 'tiktok');

    const result = await plugin.speak({
      text: 'Bestehende Stimme bleibt',
      userId: 'existing-user',
      username: 'ExistingUser',
      source: 'chat',
      teamLevel: 3
    });

    expect(result.success).toBe(true);
    expect(queuedItem).toEqual(expect.objectContaining({
      userId: 'existing-user',
      engine: 'tiktok',
      voice: 'de_002',
      hasAssignedVoice: true
    }));

    const settings = plugin.permissionManager.getUserSettings('existing-user');
    expect(settings).toEqual(expect.objectContaining({
      assigned_voice_id: 'de_002',
      assigned_engine: 'tiktok'
    }));
  });

  test('does not assign a Fish.audio voice below team level 3', async () => {
    const result = await plugin.speak({
      text: 'Noch kein Level drei',
      userId: 'team-2-user',
      username: 'TeamZwei',
      source: 'chat',
      teamLevel: 2
    });

    expect(result.success).toBe(true);

    const settings = plugin.permissionManager.getUserSettings('team-2-user');
    expect(settings.assigned_voice_id).toBeNull();
    expect(settings.assigned_engine).toBeNull();
  });
});
