const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

jest.mock('../plugins/tts/engines/fish-asr-client', () => {
  return jest.fn().mockImplementation(() => ({
    transcribe: jest.fn(async () => ({
      text: 'host transcript',
      duration: 1,
      segments: [],
      provider: 'fish.audio'
    }))
  }));
});

const FishAsrClient = require('../plugins/tts/engines/fish-asr-client');
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
    this.log = jest.fn();
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

  getConfigPathManager() {
    return {
      getTikTokSessionId: () => null
    };
  }

  emit() {}
  registerRoute() {}
  registerSocket() {}
  registerTikTokEvent() {}
}

function createTestDatabase() {
  const dbPath = path.join(__dirname, `test-tts-fish-asr-plugin-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  return { db, dbPath };
}

describe('TTSPlugin Fish.audio ASR method', () => {
  let rawDb;
  let dbPath;

  beforeEach(() => {
    jest.clearAllMocks();
    const setup = createTestDatabase();
    rawDb = setup.db;
    dbPath = setup.dbPath;
  });

  afterEach(() => {
    if (rawDb) {
      rawDb.close();
    }

    if (dbPath && fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  test('transcribes using the existing Fish.audio API key without exposing it', async () => {
    const db = new MockDatabase(rawDb);
    db.setSetting('tts_fishaudio_api_key', 'stored-fish-key');
    const api = new MockAPI(db);
    const plugin = new TTSPlugin(api);
    const audio = Buffer.from('host mic');

    const result = await plugin.transcribeFishAudio(audio, { language: 'de', maxAudioBytes: 1000 });

    expect(result).toEqual({
      text: 'host transcript',
      duration: 1,
      segments: [],
      provider: 'fish.audio'
    });
    expect(FishAsrClient).toHaveBeenCalledWith('stored-fish-key', mockLogger, expect.objectContaining({
      maxAudioBytes: undefined
    }));
    expect(FishAsrClient.mock.results[0].value.transcribe).toHaveBeenCalledWith(audio, {
      language: 'de',
      maxAudioBytes: 1000
    });
    expect(api.log).toHaveBeenCalledWith('info', expect.stringContaining('Fish.audio ASR transcription completed'));
  });

  test('throws a clear error when no Fish.audio API key is configured', async () => {
    const plugin = new TTSPlugin(new MockAPI(new MockDatabase(rawDb)));

    await expect(plugin.transcribeFishAudio(Buffer.from('host mic'))).rejects.toThrow('Fish.audio ASR API key is not configured');
    expect(FishAsrClient).not.toHaveBeenCalled();
  });
});
