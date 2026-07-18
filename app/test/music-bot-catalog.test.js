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
    expect(db.prepare(
      'SELECT provider_id AS providerId FROM plugin_music_bot_sources WHERE provider = ?'
    ).get('youtube')).toEqual({ providerId: 'one' });
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

  it('does not mistake ordinary title words for version qualifiers', () => {
    const { db, catalog } = createCatalog();
    const titleTrack = catalog.resolveOrUpsert({
      title: 'Live and Let Die', artist: 'Paul McCartney', provider: 'youtube', providerId: 'title-live'
    });
    const official = catalog.resolveOrUpsert({
      title: 'Live and Let Die (Official Video)', artist: 'Paul McCartney', provider: 'youtube', providerId: 'title-official'
    });
    const liveVersion = catalog.resolveOrUpsert({
      title: 'Live and Let Die (Live)', artist: 'Paul McCartney', provider: 'youtube', providerId: 'live-version'
    });

    expect(titleTrack.song.id).toBe(official.song.id);
    expect(liveVersion.song.id).not.toBe(titleTrack.song.id);
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

  it('projects canonical feedback with every history event for the same song', () => {
    const { db, catalog } = createCatalog();
    const track = { title: 'Shared vote', artist: 'Artist', provider: 'youtube', providerId: 'shared-vote' };
    const first = catalog.recordCompleted(track, { id: 'vote-1', finishedAt: 10, duration: 100, playedSeconds: 100 });
    catalog.recordCompleted(track, { id: 'vote-2', finishedAt: 20, duration: 100, playedSeconds: 100 });
    catalog.setFeedback(first.song.id, 'down');

    expect(catalog.getHistory({ limit: 10 }).items).toEqual([
      expect.objectContaining({ id: 'vote-2', songId: first.song.id, feedback: 'down' }),
      expect.objectContaining({ id: 'vote-1', songId: first.song.id, feedback: 'down' })
    ]);
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

  it('loads canonical radio scoring inputs, linked artist spacing, and provider cooldowns together', () => {
    const { db, catalog } = createCatalog();
    const track = { title: 'Radio score', artist: 'One & Two', provider: 'youtube', providerId: 'radio-score' };
    const completed = catalog.recordCompleted(track, {
      id: 'radio-completed', finishedAt: 100, duration: 100, playedSeconds: 100, requestedBy: 'AutoDJ'
    });
    catalog.recordSkipped(track, {
      id: 'radio-skipped', finishedAt: 90, duration: 100, playedSeconds: 10, requestedBy: 'AutoDJ'
    });
    const alternate = catalog.resolveOrUpsert({
      ...track,
      provider: 'soundcloud',
      providerId: 'radio-score-sc',
      url: 'https://soundcloud.com/example/radio-score'
    });
    catalog.setFeedback(completed.song.id, 'up');
    catalog.recordSourceFailure(alternate.source.id, 'network', 1_000_000);

    expect(catalog.getRadioCandidates([completed.song.id], { now: 1_000_001 })).toEqual([
      expect.objectContaining({
        songId: completed.song.id,
        feedback: 'up',
        completePlays: 1,
        earlySkips: 1,
        lastPlayedAt: 100,
        artists: [
          expect.objectContaining({ name: 'One', affinity: 1, lastPlayedAt: 100 }),
          expect.objectContaining({ name: 'Two', affinity: 1, lastPlayedAt: 100 })
        ],
        sources: expect.arrayContaining([
          expect.objectContaining({ provider: 'youtube', cooldownUntil: null }),
          expect.objectContaining({ provider: 'soundcloud', cooldownUntil: 1_900_000 })
        ])
      })
    ]);
    db.close();
  });

  it('excludes viewer events from implicit taste while keeping AutoDJ events and explicit votes', () => {
    const { db, catalog } = createCatalog();
    const track = { title: 'Taste boundary', artist: 'Taste Artist', provider: 'youtube', providerId: 'taste-boundary' };
    const resolved = catalog.recordCompleted(track, {
      id: 'viewer-complete', finishedAt: 10, duration: 100, playedSeconds: 100, requestedBy: 'viewer-one'
    });
    catalog.recordSkipped(track, {
      id: 'viewer-skip', finishedAt: 20, duration: 100, playedSeconds: 10, requestedBy: 'viewer-two'
    });
    catalog.recordCompleted(track, {
      id: 'autodj-complete', finishedAt: 30, duration: 100, playedSeconds: 100, requestedBy: 'AutoDJ'
    });
    catalog.recordSkipped(track, {
      id: 'autodj-skip', finishedAt: 40, duration: 100, playedSeconds: 10, requestedBy: 'AutoDJ'
    });
    catalog.setFeedback(resolved.song.id, 'up');

    expect(catalog.getRadioCandidates([resolved.song.id], { now: 1000 })).toEqual([
      expect.objectContaining({
        feedback: 'up',
        completePlays: 1,
        earlySkips: 1,
        artists: [expect.objectContaining({ name: 'Taste Artist', affinity: 1 })]
      })
    ]);
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
