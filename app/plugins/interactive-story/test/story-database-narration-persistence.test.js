const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const StoryDatabase = require('../backend/database');

function createApi(db) {
  return {
    getDatabase: () => db,
    log: jest.fn()
  };
}

describe('StoryDatabase narration metadata persistence', () => {
  let tempDir;
  let databasePath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'interactive-story-db-'));
    databasePath = path.join(tempDir, 'story.sqlite');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('migrates a legacy chapter table and restores narration metadata after reopening', () => {
    const legacyDb = new Database(databasePath);
    legacyDb.exec(`
      CREATE TABLE story_chapters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        chapter_number INTEGER NOT NULL,
        title TEXT,
        content TEXT NOT NULL,
        choices TEXT NOT NULL,
        memory_tags TEXT,
        image_path TEXT,
        audio_paths TEXT,
        created_at TEXT NOT NULL
      )
    `);

    const writer = new StoryDatabase(createApi(legacyDb));
    writer.initialize();
    const sessionId = writer.createSession({ theme: 'fantasy', metadata: {} });
    const narrationSegments = [
      { text: 'The gate opens.', emotion: 'happy', delivery: null },
      { text: 'Run now!', emotion: 'excited', delivery: 'shouting' }
    ];
    writer.saveChapter(sessionId, {
      chapterNumber: 1,
      title: 'The Gate',
      content: 'The gate opens. Run now!',
      choices: ['Run'],
      narrationSegments,
      ttsText: '(happy) The gate opens. (excited) (shouting) Run now!'
    });
    legacyDb.close();

    const reopenedDb = new Database(databasePath);
    const reader = new StoryDatabase(createApi(reopenedDb));
    reader.initialize();

    const chapter = reader.getChapter(sessionId, 1);
    reopenedDb.close();

    expect(chapter).toMatchObject({
      content: 'The gate opens. Run now!',
      narrationSegments,
      ttsText: '(happy) The gate opens. (excited) (shouting) Run now!'
    });
  });
});
