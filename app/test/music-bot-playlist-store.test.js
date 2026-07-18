const Database = require('better-sqlite3');
const MusicCatalog = require('../plugins/music-bot/lib/music-catalog');
const PlaylistStore = require('../plugins/music-bot/lib/playlist-store');

function createStore() {
  const db = new Database(':memory:');
  const api = { getDatabase: () => db, log: jest.fn() };
  const catalog = new MusicCatalog(api);
  return { db, catalog, store: new PlaylistStore(api, catalog) };
}

describe('music-bot playlist store', () => {
  it('creates editable playlists with canonical dedupe, contiguous reorder, and revision conflicts', () => {
    const { db, catalog, store } = createStore();
    const first = catalog.resolveOrUpsert({ title: 'First', artist: 'Artist', provider: 'youtube', providerId: 'first' });
    const duplicate = catalog.resolveOrUpsert({ title: 'First (Official Audio)', artist: 'Artist', provider: 'youtube', providerId: 'first-upload' });
    const second = catalog.resolveOrUpsert({ title: 'Second', artist: 'Artist', provider: 'youtube', providerId: 'second' });
    const playlist = store.create({ name: 'Morning', mode: 'shuffle' });

    expect(store.addItem(playlist.id, first.song.id, playlist.revision).added).toBe(true);
    expect(store.addItem(playlist.id, duplicate.song.id, 2)).toMatchObject({ added: false, duplicate: true });
    expect(store.addItem(playlist.id, second.song.id, 2).playlist.revision).toBe(3);
    expect(store.reorder(playlist.id, [second.song.id, first.song.id], 3).items.map((item) => item.songId))
      .toEqual([second.song.id, first.song.id]);
    expect(() => store.removeItem(playlist.id, first.song.id, 3)).toThrow(
      expect.objectContaining({ code: 'PLAYLIST_REVISION_CONFLICT' })
    );
    expect(store.get(playlist.id).items.map((item) => item.position)).toEqual([0, 1]);
    db.close();
  });

  it('protects Viewer Radio while recording only completed error-free viewer tracks once', () => {
    const { db, catalog, store } = createStore();
    const track = catalog.resolveOrUpsert({ title: 'Request', artist: 'Viewer', provider: 'youtube', providerId: 'request' });
    const viewerRadio = store.getViewerRadio();

    expect(() => store.rename(viewerRadio.id, 'Nope', viewerRadio.revision)).toThrow(
      expect.objectContaining({ code: 'PLAYLIST_PROTECTED' })
    );
    expect(store.recordViewerCompletion(track.song.id, { requestedBy: 'viewer', outcome: 'completed', error: null }))
      .toMatchObject({ added: true, requestCount: 1 });
    expect(store.recordViewerCompletion(track.song.id, { requestedBy: 'AutoDJ', outcome: 'completed' })).toBeNull();
    expect(store.recordViewerCompletion(track.song.id, { requestedBy: 'viewer', outcome: 'failed' })).toBeNull();
    expect(store.recordViewerCompletion(track.song.id, { requestedBy: 'viewer', outcome: 'completed' }))
      .toMatchObject({ added: false, requestCount: 2 });
    expect(store.get(viewerRadio.id).items).toEqual([
      expect.objectContaining({ songId: track.song.id, requestCount: 2 })
    ]);
    db.close();
  });

  it('persists normalized weighted sources and skips empty or blocked playlists', () => {
    const { db, catalog, store } = createStore();
    const empty = store.create({ name: 'Empty' });
    const playable = store.create({ name: 'Playable' });
    const song = catalog.resolveOrUpsert({ title: 'Playable', artist: 'Artist', provider: 'youtube', providerId: 'playable' });
    store.addItem(playable.id, song.song.id, playable.revision);

    expect(store.setRadioSources([{ playlistId: empty.id, weight: 10 }, { playlistId: playable.id, weight: 2 }]))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ playlistId: empty.id, weight: 10, enabled: true }),
        expect.objectContaining({ playlistId: playable.id, weight: 2, enabled: true })
      ]));
    expect(store.getRadioCandidates({ isAllowed: (songId) => songId === song.song.id })).toEqual([
      expect.objectContaining({ playlistId: playable.id, songId: song.song.id, weight: 2 })
    ]);
    expect(store.advanceRadioCursor(playable.id, 4)).toMatchObject({ playlistId: playable.id, cursor: 4 });
    db.close();
  });

  it('keeps removed imported songs as tombstones, exposes provenance, and updates both name and mode atomically', () => {
    const { db, catalog, store } = createStore();
    const playlist = store.create({ name: 'Imported once' });
    const entry = { title: 'Snapshot Track', artist: 'Artist', provider: 'youtube', providerId: 'snapshot-track' };
    const first = store.importSnapshot(playlist.id, [entry], {
      sourceType: 'youtube-import', sourceUrl: 'https://www.youtube.com/playlist?list=PL123', externalPlaylistId: 'PL123'
    });
    const song = catalog.resolveOrUpsert(entry).song;
    const afterFirst = first.playlist;
    store.removeItem(playlist.id, song.id, afterFirst.revision);
    const reimported = store.importSnapshot(playlist.id, [entry], {
      sourceType: 'youtube-import', sourceUrl: 'https://www.youtube.com/playlist?list=PL123', externalPlaylistId: 'PL123'
    });

    expect(reimported).toMatchObject({ added: 0, duplicatesSkipped: 1 });
    expect(store.get(playlist.id)).toMatchObject({
      items: [],
      importProvenance: {
        sourceType: 'youtube-import', externalPlaylistId: 'PL123', sourceUrl: 'https://www.youtube.com/playlist?list=PL123'
      }
    });
    const revised = store.update(playlist.id, { name: 'Edited import', mode: 'shuffle' }, store.get(playlist.id).revision);
    expect(revised).toMatchObject({ name: 'Edited import', mode: 'shuffle' });
    expect(() => store.update(playlist.id, { mode: 'ordered' }, afterFirst.revision)).toThrow(
      expect.objectContaining({ code: 'PLAYLIST_REVISION_CONFLICT' })
    );
    db.close();
  });

  it('marks a matching manual item as imported so removal remains a tombstone on later reimport', () => {
    const { db, catalog, store } = createStore();
    const playlist = store.create({ name: 'Manual then import' });
    const entry = { title: 'Manual match', artist: 'Artist', provider: 'youtube', providerId: 'manual-match' };
    const song = catalog.resolveOrUpsert(entry).song;
    const added = store.addItem(playlist.id, song.id, playlist.revision).playlist;

    expect(store.importSnapshot(playlist.id, [entry], {
      sourceType: 'youtube-import', sourceUrl: 'https://www.youtube.com/playlist?list=PLMANUAL', externalPlaylistId: 'PLMANUAL'
    })).toMatchObject({ added: 0, duplicatesSkipped: 1 });
    const removed = store.removeItem(playlist.id, song.id, added.revision);
    expect(store.importSnapshot(playlist.id, [entry], {
      sourceType: 'youtube-import', sourceUrl: 'https://www.youtube.com/playlist?list=PLMANUAL', externalPlaylistId: 'PLMANUAL'
    })).toMatchObject({ added: 0, duplicatesSkipped: 1 });
    expect(store.get(playlist.id).items).toEqual([]);
    expect(removed.removed).toBe(true);
    db.close();
  });

  it('selects enabled playlist sources by weight, rotates their cursors, and falls back when a source is blocked', () => {
    const { db, catalog, store } = createStore();
    const light = store.create({ name: 'Light' });
    const heavy = store.create({ name: 'Heavy' });
    const lightSong = catalog.resolveOrUpsert({ title: 'Light song', artist: 'A', provider: 'youtube', providerId: 'light' }).song;
    const heavyOne = catalog.resolveOrUpsert({ title: 'Heavy one', artist: 'B', provider: 'youtube', providerId: 'heavy-1' }).song;
    const heavyTwo = catalog.resolveOrUpsert({ title: 'Heavy two', artist: 'B', provider: 'youtube', providerId: 'heavy-2' }).song;
    store.addItem(light.id, lightSong.id, light.revision);
    store.addItem(heavy.id, heavyOne.id, heavy.revision);
    store.addItem(heavy.id, heavyTwo.id, 2);
    store.setRadioSources([{ playlistId: light.id, weight: 1 }, { playlistId: heavy.id, weight: 10 }]);

    expect(store.chooseRadioSource({ random: () => 0.5, isAllowed: () => true })).toMatchObject({ playlistId: heavy.id, songId: heavyOne.id });
    expect(store.chooseRadioSource({ random: () => 0.5, isAllowed: () => true })).toMatchObject({ playlistId: heavy.id, songId: heavyTwo.id });
    expect(store.chooseRadioSource({ random: () => 0.5, isAllowed: (songId) => songId !== heavyOne.id && songId !== heavyTwo.id }))
      .toMatchObject({ playlistId: light.id, songId: lightSong.id });
    db.close();
  });
});
