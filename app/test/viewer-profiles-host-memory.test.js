const Database = require('better-sqlite3');
const ViewerProfilesDatabase = require('../plugins/viewer-leaderboard/backend/analytics-database');
const ViewerMemoryAdapter = require('../plugins/animazingpal/brain/viewer-memory-adapter');

function createViewerDb() {
  const raw = new Database(':memory:');
  const api = { getDatabase: () => raw, log: jest.fn() };
  const db = new ViewerProfilesDatabase(api);
  db.initialize();
  return db;
}

describe('Viewer Profiles host long-term memory', () => {
  test('stores and retrieves streamer-scoped host memories for a viewer', () => {
    const db = createViewerDb();
    db.getOrCreateViewer('alice', { nickname: 'Alice' });

    db.recordHostMemory('alice', {
      streamerId: 'stream-a', type: 'chat-summary', content: 'Alice baut gern in Minecraft.',
      importance: 0.8, metadata: { topic: 'minecraft' }
    });
    db.recordHostMemory('alice', {
      streamerId: 'stream-b', type: 'chat-summary', content: 'Andere Stream-Erinnerung', importance: 1
    });

    const memories = db.getHostMemories('alice', 'stream-a', { limit: 10, minimumImportance: 0.5 });
    expect(memories).toHaveLength(1);
    expect(memories[0]).toEqual(expect.objectContaining({
      content: 'Alice baut gern in Minecraft.', metadata: { topic: 'minecraft' }
    }));
  });

  test('builds privacy-filtered host context from Viewer Profiles insights', () => {
    const db = createViewerDb();
    db.getOrCreateViewer('alice', { nickname: 'Alice' });
    db.updateViewer('alice', {
      language: 'de', tags: JSON.stringify(['regular', 'minecraft']), notes: 'Private Telefonnummer',
      discord_username: 'private-discord', birthday: '2000-01-01', tts_voice: 'fish-viewer'
    });
    db.recordHostMemory('alice', {
      streamerId: 'stream-a', content: 'Mag Minecraft.', importance: 0.9
    });
    const viewerPlugin = { db };
    const adapter = new ViewerMemoryAdapter({ getPlugin: () => viewerPlugin, log: jest.fn() });

    const context = adapter.getViewerContext('alice', {
      streamerId: 'stream-a', allowedProfileFields: ['display_name', 'language', 'tags', 'tts_voice'],
      maxMemories: 5, minimumImportance: 0.2
    }, { includeNotes: false, includeBirthday: false, includeContactFields: false });

    expect(context.profile).toEqual(expect.objectContaining({ display_name: 'Alice', language: 'de', tags: ['regular', 'minecraft'] }));
    expect(context.profile.notes).toBeUndefined();
    expect(context.profile.discord_username).toBeUndefined();
    expect(context.profile.birthday).toBeUndefined();
    expect(context.memories[0].content).toBe('Mag Minecraft.');
  });

  test('falls back cleanly when Viewer Profiles is disabled', () => {
    const adapter = new ViewerMemoryAdapter({ getPlugin: () => null, log: jest.fn() });
    expect(adapter.getViewerContext('alice', {}, {})).toEqual({ available: false, profile: null, memories: [] });
    expect(adapter.recordMemory('alice', { content: 'x' })).toBe(false);
  });
});
