const Database = require('better-sqlite3');
const ViewerProfilesDatabase = require('../plugins/viewer-profiles/backend/database');

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
});
