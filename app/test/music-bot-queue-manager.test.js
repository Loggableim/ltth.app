const QueueManager = require('../plugins/music-bot/lib/queue-manager');
const Database = require('better-sqlite3');

function createMockApi() {
  const stmt = {
    run: jest.fn(),
    get: jest.fn(() => null),
    all: jest.fn(() => [])
  };
  return {
    getDatabase: () => ({
      prepare: jest.fn(() => stmt)
    }),
    log: jest.fn()
  };
}

describe('music-bot queue manager', () => {
  it('persists requester avatar on queue entries', () => {
    const api = createMockApi();
    const manager = new QueueManager({
      queue: {
        maxLength: 10,
        maxPerUser: 3,
        maxSongDurationSeconds: 600,
        duplicateDetection: 'off',
        allowDuplicates: true,
        cooldownPerUserSeconds: 0
      }
    }, api);

    const result = manager.addSong({
      title: 'Test Song',
      url: 'https://example.com/song',
      requestedBy: 'tester',
      requesterAvatar: 'https://example.com/avatar.jpg'
    });

    expect(result.success).toBe(true);
    expect(result.song.requesterAvatar).toBe('https://example.com/avatar.jpg');
  });

  it('reorders queue entries by index', () => {
    const api = createMockApi();
    const manager = new QueueManager({
      queue: {
        maxLength: 10,
        maxPerUser: 3,
        maxSongDurationSeconds: 600,
        duplicateDetection: 'off',
        allowDuplicates: true,
        cooldownPerUserSeconds: 0
      }
    }, api);

    manager.addSong({ title: 'A', url: 'https://example.com/a', requestedBy: 'u1' });
    manager.addSong({ title: 'B', url: 'https://example.com/b', requestedBy: 'u2' });
    const reorder = manager.reorderSong(1, 0);

    expect(reorder.success).toBe(true);
    expect(manager.getQueue().map((entry) => entry.title)).toEqual(['B', 'A']);
  });

  it('uses the raw database transaction exposed by the plugin database wrapper', () => {
    const stmt = {
      run: jest.fn(),
      get: jest.fn(() => null),
      all: jest.fn(() => [])
    };
    const transaction = jest.fn((writeSongs) => writeSongs);
    const api = {
      getDatabase: () => ({
        prepare: jest.fn(() => stmt),
        db: { transaction }
      }),
      log: jest.fn()
    };
    const manager = new QueueManager({
      queue: {
        maxLength: 10,
        maxPerUser: 3,
        maxSongDurationSeconds: 600,
        duplicateDetection: 'off',
        allowDuplicates: true,
        cooldownPerUserSeconds: 0
      }
    }, api);

    manager.addSong({ title: 'Persistent Song', url: 'https://example.com/song' });

    expect(transaction).toHaveBeenCalled();
    expect(api.log).not.toHaveBeenCalledWith(
      expect.stringContaining('Failed to persist queue'),
      'error'
    );
  });

  function createRealManager(queueConfig = {}, setupDatabase) {
    const db = new Database(':memory:');
    setupDatabase?.(db);
    const api = {
      getDatabase: () => db,
      log: jest.fn()
    };
    const manager = new QueueManager({
      queue: {
        maxLength: 20,
        maxPerUser: 20,
        maxSongDurationSeconds: 600,
        duplicateDetection: 'strict',
        allowDuplicates: false,
        cooldownPerUserSeconds: 0,
        ...queueConfig
      }
    }, api);
    return { db, api, manager };
  }

  it('deduplicates YouTube and SoundCloud URL aliases by canonical track key', () => {
    const { db, manager } = createRealManager();

    expect(manager.addSong({
      title: 'YouTube one',
      url: 'https://youtu.be/abc123DEF45?si=share',
      requestedBy: 'one'
    }).success).toBe(true);
    expect(manager.addSong({
      title: 'YouTube alias',
      url: 'https://www.youtube.com/watch?v=abc123DEF45&feature=share',
      requestedBy: 'two'
    }).success).toBe(false);

    expect(manager.addSong({
      title: 'SoundCloud one',
      url: 'https://soundcloud.com/Artist/Track?utm_source=test',
      source: 'soundcloud',
      requestedBy: 'three'
    }).success).toBe(true);
    expect(manager.addSong({
      title: 'SoundCloud alias',
      url: 'https://www.soundcloud.com/artist/track/',
      source: 'soundcloud',
      requestedBy: 'four'
    }).success).toBe(false);

    expect(manager.getQueue().map((track) => track.trackKey)).toEqual([
      'youtube:abc123DEF45',
      'soundcloud:soundcloud.com/artist/track'
    ]);
    db.close();
  });

  it('does not collide equal provider IDs across providers and supports duplicate-off mode', () => {
    const { db, manager } = createRealManager({
      duplicateDetection: 'off',
      allowDuplicates: true
    });

    const youtube = manager.addSong({
      title: 'YouTube',
      url: 'https://youtube.com/watch?v=sameID12345',
      provider: 'youtube',
      providerId: 'same-id'
    });
    const soundcloud = manager.addSong({
      title: 'SoundCloud',
      url: 'https://soundcloud.com/a/b',
      provider: 'soundcloud',
      providerId: 'same-id'
    });
    const duplicate = manager.addSong({
      title: 'YouTube duplicate allowed',
      url: 'https://youtu.be/sameID12345',
      provider: 'youtube',
      providerId: 'same-id'
    });

    expect([youtube.success, soundcloud.success, duplicate.success]).toEqual([true, true, true]);
    expect(manager.getQueue().map((track) => track.trackKey)).toEqual([
      'youtube:same-id',
      'soundcloud:same-id',
      'youtube:same-id'
    ]);
    db.close();
  });

  it('restores legacy rows in stable order, backfills identity, filters once, and exposes metadata', () => {
    const { db, manager } = createRealManager({}, (legacyDb) => {
      legacyDb.exec(`
        CREATE TABLE plugin_music_bot_queue (
          id TEXT PRIMARY KEY,
          position INTEGER NOT NULL,
          title TEXT,
          artist TEXT,
          duration INTEGER,
          thumbnail TEXT,
          url TEXT,
          youtubeId TEXT,
          source TEXT,
          requestedBy TEXT,
          requesterAvatar TEXT,
          isGiftRequest INTEGER DEFAULT 0,
          addedAt INTEGER
        )
      `);
    });
    const insert = db.prepare(`
      INSERT INTO plugin_music_bot_queue
        (id, position, title, artist, url, youtubeId, source, requestedBy, addedAt,
         channelId, channelName)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run('first', 0, 'First', 'Allowed Artist', 'https://youtu.be/abc123DEF45', 'abc123DEF45', 'youtube', 'a', 1, 'channel-a', 'Channel A');
    insert.run('duplicate', 1, 'Duplicate', 'Allowed Artist', 'https://youtube.com/watch?v=abc123DEF45', 'abc123DEF45', 'youtube', 'b', 2, 'channel-a', 'Channel A');
    insert.run('banned', 2, 'Banned', 'Blocked Artist', 'https://soundcloud.com/blocked/song', null, 'soundcloud', 'c', 3, 'channel-b', 'Channel B');
    insert.run('last', 3, 'Last', 'Last Artist', 'https://soundcloud.com/last/song', null, 'soundcloud', 'd', 4, 'channel-c', 'Channel C');
    const persist = jest.spyOn(manager, 'persistQueue');
    const checked = [];

    const result = manager.restoreQueue({
      isAllowed: (track) => {
        checked.push({
          trackKey: track.trackKey,
          artist: track.artist,
          channelId: track.channelId,
          channelName: track.channelName
        });
        return track.artist !== 'Blocked Artist';
      }
    });

    expect(result).toEqual({ restored: 2, deduped: 1, banned: 1 });
    expect(manager.getQueue().map((track) => track.id)).toEqual(['first', 'last']);
    expect(manager.getQueue().map((track) => track.trackKey)).toEqual([
      'youtube:abc123DEF45',
      'soundcloud:soundcloud.com/last/song'
    ]);
    expect(checked).toContainEqual({
      trackKey: 'soundcloud:soundcloud.com/blocked/song',
      artist: 'Blocked Artist',
      channelId: 'channel-b',
      channelName: 'Channel B'
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM plugin_music_bot_queue').get().count).toBe(2);
    db.close();
  });

  it('sets the shared local path on every queue instance with the same track key', () => {
    const { db, manager } = createRealManager({
      duplicateDetection: 'off',
      allowDuplicates: true
    });
    manager.addSong({ title: 'One', url: 'https://youtu.be/abc123DEF45' });
    manager.addSong({ title: 'Two', url: 'https://youtube.com/watch?v=abc123DEF45' });
    manager.markPlaying({ ...manager.getQueue()[0] });

    expect(manager.setTrackLocalPath('youtube:abc123DEF45', 'C:\\cache\\song.webm')).toBe(true);
    expect(manager.getQueue().map((track) => track.localPath)).toEqual([
      'C:\\cache\\song.webm',
      'C:\\cache\\song.webm'
    ]);
    expect(manager.getCurrent().localPath).toBe('C:\\cache\\song.webm');
    db.close();
  });

  it('keeps persisted rows recoverable when the ban check throws and a new request is added', () => {
    const { db, manager, api } = createRealManager();
    manager.addSong({
      title: 'Persisted',
      url: 'https://youtu.be/abc123DEF45',
      requestedBy: 'viewer'
    });
    const persistedBefore = db.prepare(
      'SELECT id, title, trackKey FROM plugin_music_bot_queue ORDER BY position'
    ).all();
    const sentinel = { id: 'existing-memory', title: 'Existing memory' };
    manager.queue = [sentinel];
    const persist = jest.spyOn(manager, 'persistQueue');

    const result = manager.restoreQueue({
      isAllowed: () => {
        throw new Error('ban storage unavailable');
      }
    });

    expect(result).toEqual({
      restored: 1,
      deduped: 0,
      banned: 0,
      error: 'ban-check-failed'
    });
    expect(manager.getQueue()).toEqual([
      sentinel,
      expect.objectContaining({
        id: persistedBefore[0].id,
        title: 'Persisted',
        trackKey: 'youtube:abc123DEF45'
      })
    ]);
    expect(persist).not.toHaveBeenCalled();
    expect(db.prepare(
      'SELECT id, title, trackKey FROM plugin_music_bot_queue ORDER BY position'
    ).all()).toEqual(persistedBefore);
    expect(api.log).toHaveBeenCalledWith(
      expect.stringContaining('ban storage unavailable'),
      'error'
    );

    const added = manager.addSong({
      title: 'New request',
      url: 'https://soundcloud.com/new/request',
      requestedBy: 'new-viewer'
    });

    expect(added.success).toBe(true);
    expect(manager.getQueue().map((entry) => entry.id)).toEqual([
      'existing-memory',
      persistedBefore[0].id,
      added.song.id
    ]);
    expect(db.prepare(
      'SELECT id FROM plugin_music_bot_queue ORDER BY position'
    ).all().map((entry) => entry.id)).toEqual([
      'existing-memory',
      persistedBefore[0].id,
      added.song.id
    ]);
    db.close();
  });

  it('canonicalizes YouTube live and privacy-enhanced embed URL aliases', () => {
    const { db, manager } = createRealManager();
    const videoId = 'AbC123xYz_-';

    expect(manager.addSong({
      title: 'Live alias',
      url: `https://www.youtube.com/live/${videoId}?si=share`
    }).song.trackKey).toBe(`youtube:${videoId}`);
    expect(manager.addSong({
      title: 'Short alias',
      url: `https://youtu.be/${videoId}`
    }).success).toBe(false);

    manager.clear();
    expect(manager.addSong({
      title: 'Privacy embed',
      url: `https://www.youtube-nocookie.com/embed/${videoId}`
    }).song.trackKey).toBe(`youtube:${videoId}`);
    expect(manager.addSong({
      title: 'Watch alias',
      url: `https://youtube.com/watch?v=${videoId}`
    }).success).toBe(false);
    db.close();
  });

  it('migrates legacy history and persists canonical provider and channel metadata', () => {
    const { db, manager } = createRealManager({}, (legacyDb) => {
      legacyDb.exec(`
        CREATE TABLE plugin_music_bot_history (
          id TEXT PRIMARY KEY,
          youtubeId TEXT,
          title TEXT,
          artist TEXT,
          url TEXT,
          duration INTEGER,
          requestedBy TEXT,
          source TEXT,
          thumbnail TEXT,
          finishedAt INTEGER,
          skipped INTEGER DEFAULT 0
        )
      `);
    });

    manager.addToHistory({
      id: 'history-track',
      title: 'History Track',
      artist: 'History Artist',
      url: 'https://www.youtube.com/live/AbC123xYz_-',
      provider: 'youtube',
      providerId: 'AbC123xYz_-',
      trackKey: 'youtube:AbC123xYz_-',
      channelId: 'channel-123',
      channelName: 'History Channel'
    });

    expect(db.prepare(`
      SELECT provider, providerId, trackKey, channelId, channelName
      FROM plugin_music_bot_history WHERE id = ?
    `).get('history-track')).toEqual({
      provider: 'youtube',
      providerId: 'AbC123xYz_-',
      trackKey: 'youtube:AbC123xYz_-',
      channelId: 'channel-123',
      channelName: 'History Channel'
    });
    db.close();
  });
});
