const Database = require('better-sqlite3');
const MusicCatalog = require('../plugins/music-bot/lib/music-catalog');

function createCatalog(setup) {
  const db = new Database(':memory:');
  setup?.(db);
  const api = {
    getDatabase: () => db,
    log: jest.fn()
  };
  return { db, catalog: new MusicCatalog(api), api };
}

describe('music-bot catalog', () => {
  it('imports legacy history transactionally without changing rows or duplicating events', () => {
    const { db, catalog } = createCatalog((legacyDb) => {
      legacyDb.exec(`
        CREATE TABLE plugin_music_bot_history (
          id TEXT PRIMARY KEY,
          title TEXT,
          artist TEXT,
          url TEXT,
          duration INTEGER,
          requestedBy TEXT,
          source TEXT,
          finishedAt INTEGER,
          skipped INTEGER DEFAULT 0
        );
        INSERT INTO plugin_music_bot_history
          (id, title, artist, url, duration, requestedBy, source, finishedAt, skipped)
          VALUES ('legacy-1', 'Song (Official Video)', 'Artist', 'https://youtu.be/one', 200, 'viewer', 'youtube', 100, 0);
      `);
    });

    expect(catalog.migrateLegacyHistory()).toEqual({ imported: 1, skipped: 0 });
    expect(catalog.migrateLegacyHistory()).toEqual({ imported: 0, skipped: 1 });
    expect(db.prepare('SELECT * FROM plugin_music_bot_history WHERE id = ?').get('legacy-1'))
      .toMatchObject({ title: 'Song (Official Video)', artist: 'Artist' });
    expect(db.prepare('SELECT COUNT(*) AS count FROM plugin_music_bot_play_events').get().count).toBe(1);
    db.close();
  });

  it('merges normal uploads while keeping versioned recordings and unreliable artists provider-bound', () => {
    const { db, catalog } = createCatalog();
    const official = catalog.resolveOrUpsert({
      title: 'One More Time (Official Video)', artist: 'Daft Punk', provider: 'youtube', providerId: 'official'
    });
    const lyrics = catalog.resolveOrUpsert({
      title: 'One More Time - Lyrics', artist: 'Daft Punk', provider: 'youtube', providerId: 'lyrics'
    });
    const live = catalog.resolveOrUpsert({
      title: 'One More Time (Live)', artist: 'Daft Punk', provider: 'youtube', providerId: 'live'
    });
    const remix = catalog.resolveOrUpsert({
      title: 'One More Time (Remix)', artist: 'Daft Punk', provider: 'youtube', providerId: 'remix'
    });
    const acoustic = catalog.resolveOrUpsert({
      title: 'One More Time (Acoustic)', artist: 'Daft Punk', provider: 'youtube', providerId: 'acoustic'
    });
    const unknownA = catalog.resolveOrUpsert({ title: 'Same Title', artist: 'Unknown', provider: 'youtube', providerId: 'a' });
    const unknownB = catalog.resolveOrUpsert({ title: 'Same Title', artist: '', provider: 'youtube', providerId: 'b' });

    expect(official.song.id).toBe(lyrics.song.id);
    expect(new Set([live.song.id, remix.song.id, acoustic.song.id]).size).toBe(3);
    expect(unknownA.song.id).not.toBe(unknownB.song.id);
    expect(db.prepare('SELECT COUNT(*) AS count FROM plugin_music_bot_sources').get().count).toBe(7);
    db.close();
  });

  it('links multiple credited artists in deterministic order', () => {
    const { db, catalog } = createCatalog();
    const { song } = catalog.resolveOrUpsert({
      title: 'Collaboration', artist: 'Zed ft. Alpha & Beta', provider: 'youtube', providerId: 'collab'
    });

    expect(catalog.getSongArtists(song.id).map((artist) => artist.name)).toEqual(['Alpha', 'Beta', 'Zed']);
    expect(db.prepare('SELECT COUNT(*) AS count FROM plugin_music_bot_song_artists WHERE song_id = ?').get(song.id).count).toBe(3);
    db.close();
  });

  it('toggles feedback, shares it across history, and exposes radio scoring and artist affinity', () => {
    const { db, catalog } = createCatalog();
    const track = { title: 'Rated Song', artist: 'One & Two', provider: 'youtube', providerId: 'rating' };
    const first = catalog.recordCompleted(track, { id: 'play-1', finishedAt: 10, duration: 100, playedSeconds: 100 });
    catalog.recordCompleted({ ...track, providerId: 'rating-reupload', title: 'Rated Song (Official Audio)' }, { id: 'play-2', finishedAt: 20, duration: 100, playedSeconds: 100 });

    expect(catalog.setFeedback(first.song.id, 'up')).toMatchObject({ state: 'up' });
    expect(catalog.getScoringInputs(first.song.id)).toMatchObject({ songFactor: 3, radioAllowed: true });
    expect(catalog.getArtistAffinity(first.song.id)).toEqual({ One: 1, Two: 1 });
    expect(catalog.setFeedback(first.song.id, 'up')).toMatchObject({ state: 'neutral' });
    expect(catalog.getArtistAffinity(first.song.id)).toEqual({ One: 0, Two: 0 });
    expect(catalog.setFeedback(first.song.id, 'down')).toMatchObject({ state: 'down' });
    expect(catalog.getScoringInputs(first.song.id)).toMatchObject({ songFactor: 0, radioAllowed: false, requestAllowed: true });
    expect(db.prepare('SELECT COUNT(DISTINCT song_id) AS count FROM plugin_music_bot_play_events').get().count).toBe(1);
    db.close();
  });

  it('records completed plays and early skips distinctly for later implicit scoring', () => {
    const { db, catalog } = createCatalog();
    const track = { title: 'Progress', artist: 'Artist', provider: 'youtube', providerId: 'progress' };
    catalog.recordCompleted(track, { id: 'completed', duration: 200, playedSeconds: 200, finishedAt: 20 });
    catalog.recordSkipped(track, { id: 'early', duration: 200, playedSeconds: 99, finishedAt: 10 });

    expect(catalog.getHistory({ limit: 10 }).items.map((entry) => entry.outcome)).toEqual(['completed', 'early_skip']);
    db.close();
  });

  it('applies source cooldown policy and clears failure state on success', () => {
    const { db, catalog } = createCatalog();
    const source = catalog.resolveOrUpsert({ title: 'Source', artist: 'Artist', provider: 'youtube', providerId: 'source' }).source;
    const now = 1_000_000;

    expect(catalog.recordSourceFailure(source.id, 'timeout', now).cooldownUntil).toBe(now + 15 * 60 * 1000);
    expect(catalog.recordSourceSuccess(source.id)).toMatchObject({ failureCount: 0, cooldownUntil: null });
    expect(catalog.recordSourceFailure(source.id, 'DRM unavailable', now).cooldownUntil).toBe(now + 24 * 60 * 60 * 1000);
    catalog.recordSourceSuccess(source.id);
    catalog.recordSourceFailure(source.id, 'network', now);
    catalog.recordSourceFailure(source.id, 'network', now + 1);
    expect(catalog.recordSourceFailure(source.id, 'network', now + 2).cooldownUntil).toBe(now + 2 + 7 * 24 * 60 * 60 * 1000);
    db.close();
  });

  it('keeps immutable history without a retention limit and paginates newest first', () => {
    const { db, catalog } = createCatalog();
    for (let index = 0; index < 3; index += 1) {
      catalog.recordCompleted(
        { title: `Song ${index}`, artist: 'Artist', provider: 'youtube', providerId: `song-${index}` },
        { id: `event-${index}`, finishedAt: index + 1, duration: 10, playedSeconds: 10 }
      );
    }

    expect(catalog.getHistory({ limit: 2, offset: 1 })).toMatchObject({
      total: 3,
      items: [expect.objectContaining({ id: 'event-1' }), expect.objectContaining({ id: 'event-0' })]
    });
    expect(() => catalog.recordCompleted({}, { id: 'event-3' })).not.toThrow();
    expect(db.prepare('SELECT COUNT(*) AS count FROM plugin_music_bot_play_events').get().count).toBe(4);
    db.close();
  });
});
