const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const StoryDatabase = require('../backend/database');

function createApi(db) {
  return { getDatabase: () => db, log: jest.fn() };
}

describe('StoryDatabase participant persistence', () => {
  let tempDir;
  let databasePath;
  let openSqlite;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interactive-story-participant-db-'));
    databasePath = path.join(tempDir, 'story.sqlite');
  });

  afterEach(() => {
    if (openSqlite) {
      openSqlite.close();
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('persists participant round attendance across a database reopen and resets the session roster', () => {
    const writerSqlite = new Database(databasePath);
    openSqlite = writerSqlite;
    const writer = new StoryDatabase(createApi(writerSqlite));
    writer.initialize();
    const sessionId = writer.createSession({ theme: 'fantasy' });
    writer.createParticipant(sessionId, {
      userId: 'viewer-1', username: 'Alice', roleId: 'ranger', roleName: 'Ranger', joinedRound: 1
    });
    writer.recordParticipantVote(sessionId, 'viewer-1', 2);
    writerSqlite.close();
    openSqlite = null;

    const readerSqlite = new Database(databasePath);
    openSqlite = readerSqlite;
    const reader = new StoryDatabase(createApi(readerSqlite));
    reader.initialize();

    expect(reader.getParticipant(sessionId, 'viewer-1')).toMatchObject({
      user_id: 'viewer-1', username: 'Alice', role_id: 'ranger', role_name: 'Ranger',
      joined_round: 1, last_vote_round: 2, missed_rounds: 0, status: 'active'
    });
    expect(reader.resetParticipants(sessionId)).toBe(1);
    expect(reader.listParticipants(sessionId, { includeEliminated: true })).toEqual([]);
    readerSqlite.close();
    openSqlite = null;
  });
  test('deletes participant rows when expired sessions are cleaned up', () => {
    const sqlite = new Database(databasePath);
    openSqlite = sqlite;
    const storyDatabase = new StoryDatabase(createApi(sqlite));
    storyDatabase.initialize();
    const sessionId = storyDatabase.createSession({ theme: 'fantasy' });
    storyDatabase.createParticipant(sessionId, {
      userId: 'viewer-1', username: 'Alice', roleId: 'bard', roleName: 'Bard', joinedRound: 0
    });
    storyDatabase.updateSessionStatus(sessionId, 'completed');

    expect(storyDatabase.deleteOldSessions(0)).toBe(1);
    expect(sqlite.prepare('SELECT * FROM story_participants WHERE session_id = ?').get(sessionId)).toBeUndefined();
  });
});
