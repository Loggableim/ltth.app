const QueueManager = require('../plugins/music-bot/lib/queue-manager');
const Database = require('better-sqlite3');

function createMockApi() {
  const stmt = {
    run: jest.fn(),
    get: jest.fn(() => null),
    all: jest.fn(() => [])
  };
  const databaseManager = {
    prepare: jest.fn(() => stmt),
    // DatabaseManager exposes better-sqlite3 on .db; QueueManager must use its atomic transaction.
    db: { transaction: (work) => (...args) => work(...args) }
  };
  return {
    getDatabase: () => databaseManager,
    log: jest.fn()
  };
}

describe('music-bot queue manager', () => {
  it('synthetic ban-check failure keeps persisted and pending rows guarded until a safe retry', () => {
    const persistedSong = {
      id: 'persisted-banned',
      title: 'Persisted banned song',
      artist: 'Artist',
      duration: 90,
      url: 'https://youtu.be/ban12345678',
      youtubeId: 'ban12345678',
      provider: 'youtube',
      providerId: 'ban12345678',
      trackKey: 'youtube:ban12345678',
      requestedBy: 'old-viewer',
      source: 'youtube',
      addedAt: 1
    };
    const pendingSong = {
      id: 'pending-safe',
      title: 'Pending safe song',
      artist: 'Safe Artist',
      duration: 90,
      url: 'https://soundcloud.com/safe/pending',
      provider: 'soundcloud',
      providerId: 'soundcloud.com/safe/pending',
      trackKey: 'soundcloud:soundcloud.com/safe/pending',
      requestedBy: 'new-viewer',
      requesterKey: 'new-viewer',
      source: 'soundcloud',
      addedAt: 2
    };
    const state = { rows: [{ ...persistedSong }] };
    const db = {
      prepare: (sql) => {
        if (String(sql).startsWith('SELECT * FROM plugin_music_bot_queue')) {
          return { all: () => state.rows.map((row) => ({ ...row })) };
        }
        if (String(sql).startsWith('DELETE FROM plugin_music_bot_queue')) {
          return { run: () => { state.rows = []; } };
        }
        if (String(sql).startsWith('INSERT INTO plugin_music_bot_queue')) {
          return { run: (row) => { state.rows.push({ ...row }); } };
        }
        return { run: jest.fn(), all: () => [] };
      },
      transaction: (work) => (...args) => work(...args)
    };
    const manager = Object.create(QueueManager.prototype);
    manager.db = db;
    manager.api = { log: jest.fn() };
    manager.queueConfig = { duplicateDetection: 'strict', allowDuplicates: false };
    manager.queue = [pendingSong];
    manager.userLastRequest = new Map();
    manager._persistenceGuard = { blocked: false, reason: null, blockedAt: null, lastError: null };

    const failedRestore = manager.restoreQueue({
      isAllowed: () => { throw new Error('ban database temporarily unavailable'); }
    });
    expect(failedRestore).toMatchObject({ error: 'ban-check-failed', persistenceBlocked: true });
    expect(manager.getQueue().map((song) => song.id)).toEqual(['pending-safe']);
    expect(manager.getPersistenceStatus()).toMatchObject({
      blocked: true,
      reason: 'ban-check-failed',
      lastError: 'ban database temporarily unavailable',
      pendingCount: 1
    });
    expect(manager.persistQueue()).toMatchObject({ success: false, blocked: true });
    expect(state.rows.map((song) => song.id)).toEqual(['persisted-banned']);

    const checkedIds = [];
    const recovered = manager.restoreQueue({
      isAllowed: (song) => {
        checkedIds.push(song.id);
        return song.id !== 'persisted-banned';
      }
    });
    expect(recovered).toMatchObject({ restored: 1, deduped: 0, banned: 1, persisted: true });
    expect(checkedIds).toEqual(['pending-safe', 'persisted-banned']);
    expect(manager.getPersistenceStatus()).toMatchObject({ blocked: false, pendingCount: 1 });
    expect(manager.getQueue().map((song) => song.id)).toEqual(['pending-safe']);
    expect(state.rows.map((song) => song.id)).toEqual(['pending-safe']);
  });

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

  it('rejects a stale expected song ID without mutating the queue', () => {
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
    manager.queue = [{ id: 'current-song', title: 'Current song' }];
    const persistQueue = jest.spyOn(manager, 'persistQueue');

    const result = manager.removeSong(0, 'rendered-song');

    expect(result).toMatchObject({ success: false, errorCode: 'QUEUE_ITEM_CHANGED' });
    expect(manager.getQueue()).toEqual([{ id: 'current-song', title: 'Current song' }]);
    expect(persistQueue).not.toHaveBeenCalled();
  });

  it('rejects a non-integer position before mutating the queue', () => {
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
    manager.queue = [{ id: 'current-song', title: 'Current song' }];
    const persistQueue = jest.spyOn(manager, 'persistQueue');

    const result = manager.removeSong(0.5, 'current-song');

    expect(result).toEqual({ success: false, error: 'Invalid queue position' });
    expect(manager.getQueue()).toEqual([{ id: 'current-song', title: 'Current song' }]);
    expect(persistQueue).not.toHaveBeenCalled();
  });

  it('keeps index-only removal compatible', () => {
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
    manager.queue = [{ id: 'current-song', title: 'Current song' }];

    const result = manager.removeSong(0);

    expect(result).toMatchObject({ success: true, song: { id: 'current-song' } });
    expect(manager.getQueue()).toEqual([]);
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

    expect(result).toEqual({ restored: 2, deduped: 1, banned: 1, persisted: true });
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

  it('keeps memory unchanged after ban-check failure and rechecks persisted plus pending entries', () => {
    const { db, manager, api } = createRealManager();
    manager.addSong({
      title: 'Persisted',
      url: 'https://youtu.be/abc123DEF45',
      requestedBy: 'viewer'
    });
    const persistedBefore = db.prepare(
      'SELECT id, title, trackKey FROM plugin_music_bot_queue ORDER BY position'
    ).all();
    const sentinel = {
      id: 'existing-memory',
      title: 'Existing memory',
      url: 'https://soundcloud.com/pending/memory',
      requestedBy: 'pending-viewer',
      trackKey: 'soundcloud:soundcloud.com/pending/memory'
    };
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
      error: 'ban-check-failed',
      persistenceBlocked: true
    });
    // Fail closed: a row whose ban check failed must not be exposed as playable in memory.
    expect(manager.getQueue()).toEqual([sentinel]);
    expect(persist).not.toHaveBeenCalled();
    expect(manager.getPersistenceStatus()).toMatchObject({
      blocked: true,
      reason: 'ban-check-failed',
      lastError: 'ban storage unavailable'
    });
    expect(manager.persistQueue()).toEqual({
      success: false,
      blocked: true,
      reason: 'ban-check-failed'
    });
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

    // The persistence guard rejects new mutations; the prior test accepted these in RAM.
    expect(added).toMatchObject({ success: false, blocked: true, errorCode: 'QUEUE_PERSISTENCE_BLOCKED' });
    expect(manager.getPersistenceStatus()).toMatchObject({ blocked: true, pendingCount: 1 });
    expect(manager.getQueue().map((entry) => entry.id)).toEqual(['existing-memory']);
    expect(db.prepare(
      'SELECT id, title, trackKey FROM plugin_music_bot_queue ORDER BY position'
    ).all()).toEqual(persistedBefore);

    const checked = [];
    const recovered = manager.restoreQueue({
      isAllowed: (entry) => {
        checked.push(entry.id);
        return entry.id !== persistedBefore[0].id;
      }
    });
    expect(recovered).toMatchObject({ restored: 1, deduped: 0, banned: 1, persisted: true });
    expect(checked).toEqual(['existing-memory', persistedBefore[0].id]);
    expect(manager.getPersistenceStatus()).toMatchObject({ blocked: false, pendingCount: 1 });
    expect(manager.getQueue().map((entry) => entry.id)).toEqual(['existing-memory']);
    expect(db.prepare(
      'SELECT id FROM plugin_music_bot_queue ORDER BY position'
    ).all().map((entry) => entry.id)).toEqual([
      'existing-memory'
    ]);
    db.close();
  });

  it('rejects queue mutations after a restore SELECT failure until recovery restores existing rows', () => {
    const { db, manager } = createRealManager();
    const persisted = manager.addSong({
      title: 'Persisted before failure',
      url: 'https://youtu.be/oldTrack123',
      requestedBy: 'old-viewer'
    }).song;
    manager.queue = [];
    manager.userLastRequest.clear();

    const realDatabase = manager.db;
    let failRestoreRead = true;
    manager.db = {
      prepare: (sql) => {
        if (failRestoreRead && String(sql).startsWith('SELECT * FROM plugin_music_bot_queue')) {
          throw new Error('queue read unavailable');
        }
        return realDatabase.prepare(sql);
      },
      transaction: realDatabase.transaction.bind(realDatabase)
    };

    expect(manager.restoreQueue()).toEqual({
      restored: 0,
      deduped: 0,
      banned: 0,
      error: 'restore-read-failed',
      persistenceBlocked: true
    });
    expect(manager.getPersistenceStatus()).toMatchObject({
      blocked: true,
      reason: 'restore-read-failed',
      pendingCount: 0,
      lastError: 'queue read unavailable'
    });

    const added = manager.addSong({
      title: 'Rejected while guarded',
      url: 'https://soundcloud.com/new/guarded-request',
      requestedBy: 'new-viewer'
    });

    expect(added).toMatchObject({ success: false, blocked: true, errorCode: 'QUEUE_PERSISTENCE_BLOCKED' });
    expect(manager.persistQueue()).toMatchObject({
      success: false,
      blocked: true,
      reason: 'restore-read-failed'
    });
    expect(manager.getPersistenceStatus()).toMatchObject({ blocked: true, pendingCount: 0 });
    expect(db.prepare('SELECT id FROM plugin_music_bot_queue ORDER BY position').all())
      .toEqual([{ id: persisted.id }]);

    failRestoreRead = false;
    expect(manager.restoreQueue()).toMatchObject({ restored: 1, deduped: 0, banned: 0, persisted: true });
    expect(manager.getPersistenceStatus()).toMatchObject({ blocked: false, pendingCount: 1 });
    expect(db.prepare('SELECT id FROM plugin_music_bot_queue ORDER BY position').all())
      .toEqual([{ id: persisted.id }]);
    db.close();
  });

  it('does not accept duplicate requests while guarded and restores the persisted canonical track', () => {
    const { db, manager } = createRealManager();
    const persisted = manager.addSong({
      title: 'Persisted original',
      url: 'https://youtu.be/AbC123xYz_-',
      requestedBy: 'old-viewer'
    }).song;
    manager.queue = [];
    manager.userLastRequest.clear();

    const realDatabase = manager.db;
    let failRestoreRead = true;
    manager.db = {
      prepare: (sql) => {
        if (failRestoreRead && String(sql).startsWith('SELECT * FROM plugin_music_bot_queue')) {
          throw new Error('queue read unavailable');
        }
        return realDatabase.prepare(sql);
      },
      transaction: realDatabase.transaction.bind(realDatabase)
    };

    expect(manager.restoreQueue()).toMatchObject({
      error: 'restore-read-failed',
      persistenceBlocked: true
    });
    const duplicate = manager.addSong({
      title: 'Guarded duplicate',
      url: 'https://www.youtube.com/watch?v=AbC123xYz_-',
      requestedBy: 'new-viewer'
    });
    expect(duplicate).toMatchObject({ success: false, blocked: true, errorCode: 'QUEUE_PERSISTENCE_BLOCKED' });

    failRestoreRead = false;
    expect(manager.restoreQueue()).toMatchObject({ restored: 1, deduped: 0, banned: 0, persisted: true });
    expect(manager.getQueue()).toEqual([
      expect.objectContaining({
        id: persisted.id,
        title: 'Persisted original',
        trackKey: 'youtube:AbC123xYz_-'
      })
    ]);
    expect(db.prepare('SELECT id FROM plugin_music_bot_queue ORDER BY position').all())
      .toEqual([{ id: persisted.id }]);
    db.close();
  });

  it('blocks persistence when a persisted row cannot be decoded', () => {
    const { db, manager } = createRealManager();
    const persisted = manager.addSong({
      title: 'Undecodable persisted row',
      url: 'https://youtu.be/decode12345'
    }).song;
    manager.queue = [];
    manager.userLastRequest.clear();
    jest.spyOn(manager, '_entryFromPersistedRow').mockImplementation(() => {
      throw new Error('row decode failed');
    });

    expect(manager.restoreQueue()).toEqual({
      restored: 0,
      deduped: 0,
      banned: 0,
      error: 'restore-decode-failed',
      persistenceBlocked: true
    });
    expect(manager.getPersistenceStatus()).toMatchObject({
      blocked: true,
      reason: 'restore-decode-failed',
      lastError: 'row decode failed'
    });

    expect(manager.addSong({
      title: 'Rejected after decode failure',
      url: 'https://soundcloud.com/new/decode-failure'
    })).toMatchObject({ success: false, blocked: true, errorCode: 'QUEUE_PERSISTENCE_BLOCKED' });
    expect(manager.persistQueue()).toMatchObject({ success: false, blocked: true });
    expect(db.prepare('SELECT id FROM plugin_music_bot_queue ORDER BY position').all())
      .toEqual([{ id: persisted.id }]);
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
