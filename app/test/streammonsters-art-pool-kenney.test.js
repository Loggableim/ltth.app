const fs = require('fs');
const os = require('os');
const path = require('path');
const KenneyMonsterBuilder = require(
  '../plugins/stream-monsters/backend/streammonsters/kenney-monster-builder'
);

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-collector-arena-'));
}

describe('Stream Monsters Kenney fallback', () => {
  test('builds the same cached SVG and safe public URL for the same monster seed', () => {
    const dataDir = createTempDir();
    const builder = new KenneyMonsterBuilder({
      assetDir: path.join(
        process.cwd(),
        'plugins',
        'streamalchemy',
        'assets',
        'kenney-monster-builder'
      ),
      dataDir
    });

    const first = builder.build({ seed: 'seed-ember-1', element: 'Ember' });
    const second = builder.build({ seed: 'seed-ember-1', element: 'Ember' });

    expect(second).toEqual(first);
    expect(first.visualSource).toBe('kenney');
    expect(first.visualKey).toMatch(/^kenney:/);
    expect(first.publicUrl).toMatch(
      /^\/api\/streammonsters\/art\/kenney-[a-f0-9]{16}\.svg$/
    );
    expect(fs.readFileSync(first.absolutePath, 'utf8')).toContain('<svg');
    expect(first.absolutePath).toContain(path.join('streammonsters', 'monster-art'));
  });

  test('builds a valid, distinct element-coloured monster for all six elements', () => {
    const dataDir = createTempDir();
    const builder = new KenneyMonsterBuilder({
      assetDir: path.join(
        process.cwd(),
        'plugins',
        'streamalchemy',
        'assets',
        'kenney-monster-builder'
      ),
      dataDir
    });
    const colors = {
      Ember: 'red',
      Tide: 'blue',
      Grove: 'green',
      Gale: 'white',
      Volt: 'yellow',
      Lunar: 'dark'
    };

    const monsters = Object.entries(colors).map(([element, color]) => {
      const result = builder.build({ seed: `seed-${element}`, element });
      expect(result.selection.color).toBe(color);
      expect(fs.existsSync(result.absolutePath)).toBe(true);
      return result.visualKey;
    });

    expect(new Set(monsters).size).toBe(6);
  });

  test('ships no Art Pool executor while preserving the database-owned historical schema', () => {
    const pluginDir = path.join(process.cwd(), 'plugins', 'stream-monsters');
    expect(fs.existsSync(path.join(
      pluginDir,
      'backend',
      'streammonsters',
      'art-pool-service.js'
    ))).toBe(false);
    const Database = require('better-sqlite3');
    const StreamMonstersDatabase = require(
      '../plugins/stream-monsters/backend/streammonsters/database'
    );
    const sqlite = new Database(':memory:');
    const store = new StreamMonstersDatabase(sqlite);
    store.initialize();
    expect(sqlite.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'streammonsters_art_pool'"
    ).get()).toEqual({ name: 'streammonsters_art_pool' });
  });
});
