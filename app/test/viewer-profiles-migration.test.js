const Database = require('better-sqlite3');
const ViewerProfilesDatabase = require('../plugins/viewer-leaderboard/backend/analytics-database');

function createApi(db) {
  return {
    getDatabase: () => db,
    log: jest.fn()
  };
}

describe('Viewer Profiles database migration', () => {
  let sqlite;

  afterEach(() => {
    if (sqlite) {
      sqlite.close();
      sqlite = null;
    }
  });

  test('migrates legacy viewer_profiles tables with timestamp columns', () => {
    sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE viewer_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT
      );
      INSERT INTO viewer_profiles DEFAULT VALUES;
    `);

    const store = new ViewerProfilesDatabase(createApi(sqlite));

    expect(() => store.initialize()).not.toThrow();

    const columns = sqlite.prepare('PRAGMA table_info(viewer_profiles)').all().map(column => column.name);
    expect(columns).toEqual(expect.arrayContaining([
      'tiktok_username',
      'first_seen_at',
      'created_at',
      'updated_at'
    ]));

    const row = sqlite.prepare('SELECT first_seen_at, created_at, updated_at FROM viewer_profiles WHERE id = 1').get();
    expect(row.first_seen_at).toEqual(expect.any(String));
    expect(row.created_at).toEqual(expect.any(String));
    expect(row.updated_at).toEqual(expect.any(String));
  });

  test('repairs legacy viewer_profiles tables without id columns for live interactions', () => {
    sqlite = new Database(':memory:');
    sqlite.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE viewer_profiles (
        tiktok_username TEXT UNIQUE NOT NULL,
        display_name TEXT
      );
      INSERT INTO viewer_profiles (tiktok_username, display_name)
      VALUES ('legacy_viewer', 'Legacy Viewer');
    `);

    const store = new ViewerProfilesDatabase(createApi(sqlite));

    expect(() => store.initialize()).not.toThrow();

    const columns = sqlite.prepare('PRAGMA table_info(viewer_profiles)').all();
    expect(columns.map(column => column.name)).toContain('id');

    const viewer = store.getOrCreateViewer('legacy_viewer');
    expect(viewer.id).toEqual(expect.any(Number));

    expect(() => store.addInteraction(viewer.id, 'comment', 'hello')).not.toThrow();

    const inserted = store.getOrCreateViewer('new_viewer', { nickname: 'New Viewer' });
    expect(inserted.id).toEqual(expect.any(Number));
    expect(inserted.id).toBeGreaterThan(0);
    expect(() => store.addInteraction(inserted.id, 'like')).not.toThrow();
  });
});
