const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const StreamMonstersDatabase = require('../plugins/stream-monsters/backend/streammonsters/database');

describe('Stream Monsters generation-pool retirement', () => {
  test('removes the executor while preserving historical rows byte-for-byte', () => {
    expect(fs.existsSync(path.join(
      process.cwd(),
      'plugins',
      'streamalchemy',
      'backend',
      'streammonsters',
      'generation-pool.js'
    ))).toBe(false);
    const sqlite = new Database(':memory:');
    const store = new StreamMonstersDatabase(sqlite);
    store.initialize();
    sqlite.prepare(`
      INSERT INTO streammonsters_generation_pool (
        pool_key, gift_id, gift_name, element, egg_color, status, attempts,
        prompt, image_url, error, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'legacy-row',
      1,
      'Gift',
      'Ember',
      '#fff',
      'ready',
      2,
      'historical prompt',
      'file:///historical.png',
      null,
      10,
      11
    );
    const before = sqlite.prepare(
      'SELECT * FROM streammonsters_generation_pool WHERE pool_key = ?'
    ).get('legacy-row');

    store.initialize();

    expect(sqlite.prepare(
      'SELECT * FROM streammonsters_generation_pool WHERE pool_key = ?'
    ).get('legacy-row')).toEqual(before);
  });
});
