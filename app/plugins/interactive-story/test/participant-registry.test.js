const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const StoryDatabase = require('../backend/database');
const ParticipantRegistry = require('../backend/participant-registry');

function createApi(db) {
  return { getDatabase: () => db, log: jest.fn() };
}

describe('ParticipantRegistry', () => {
  let tempDir;
  let sqlite;
  let storyDatabase;
  let registry;
  let sessionId;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interactive-story-participants-'));
    sqlite = new Database(path.join(tempDir, 'story.sqlite'));
    storyDatabase = new StoryDatabase(createApi(sqlite));
    storyDatabase.initialize();
    sessionId = storyDatabase.createSession({ theme: 'fantasy' });
    registry = new ParticipantRegistry(storyDatabase, {
      selectRole: roles => roles.find(role => role.id === 'mage')
    });
  });

  afterEach(() => {
    sqlite.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('keeps one deterministic role assignment for an exact session/user join', () => {
    const first = registry.join(sessionId, 'viewer-1', 'Alice', 1);
    const duplicate = registry.join(sessionId, 'viewer-1', 'Alice renamed', 1);

    expect(first).toEqual({
      username: 'Alice', roleId: 'mage', roleName: 'Mage', joinedRound: 1,
      missedRounds: 0, status: 'active'
    });
    expect(duplicate).toEqual(first);
    expect(registry.list(sessionId)).toEqual([first]);
  });

  test('resets attendance after a vote and eliminates exactly after two consecutive eligible misses', () => {
    registry.join(sessionId, 'viewer-1', 'Alice', 1);
    registry.recordVote(sessionId, 'viewer-1', 1);
    expect(registry.resolveRound(sessionId, 1)).toEqual({ updated: [], eliminated: [] });

    expect(registry.resolveRound(sessionId, 2).updated).toEqual([
      expect.objectContaining({ username: 'Alice', missedRounds: 1, status: 'active' })
    ]);
    const resolution = registry.resolveRound(sessionId, 3);
    expect(resolution.eliminated).toEqual([
      expect.objectContaining({ username: 'Alice', missedRounds: 2, status: 'eliminated' })
    ]);
    expect(registry.recordVote(sessionId, 'viewer-1', 4)).toBeNull();
    expect(registry.join(sessionId, 'viewer-1', 'Alice', 4)).toEqual(resolution.eliminated[0]);
  });

  test('resolves each eligible missed round once when a resolution is retried', () => {
    registry.join(sessionId, 'viewer-1', 'Alice', 0);

    expect(registry.resolveRound(sessionId, 1).updated).toEqual([
      expect.objectContaining({ username: 'Alice', missedRounds: 1, status: 'active' })
    ]);
    expect(registry.resolveRound(sessionId, 1)).toEqual({ updated: [], eliminated: [] });

    expect(registry.resolveRound(sessionId, 2).eliminated).toEqual([
      expect.objectContaining({ username: 'Alice', missedRounds: 2, status: 'eliminated' })
    ]);
  });

  test('does not penalize a participant for the round in which they joined', () => {
    registry.join(sessionId, 'viewer-1', 'Alice', 2);

    expect(registry.resolveRound(sessionId, 2)).toEqual({ updated: [], eliminated: [] });
    expect(registry.list(sessionId)[0]).toMatchObject({ missedRounds: 0, status: 'active' });
    expect(registry.resolveRound(sessionId, 3).updated[0]).toMatchObject({ missedRounds: 1 });
  });

  test('returns public-safe snapshots and includes eliminated players only when requested', () => {
    registry.join(sessionId, 'private-viewer-id', 'Alice', 0);
    registry.resolveRound(sessionId, 1);
    registry.resolveRound(sessionId, 2);

    expect(registry.list(sessionId)).toEqual([]);
    expect(registry.list(sessionId, { includeEliminated: true })).toEqual([
      expect.objectContaining({ username: 'Alice', status: 'eliminated' })
    ]);
    expect(registry.list(sessionId, { includeEliminated: true })[0]).not.toHaveProperty('userId');
  });
});
