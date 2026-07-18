const Database = require('better-sqlite3');
const MusicCatalog = require('../plugins/music-bot/lib/music-catalog');
const PlaylistStore = require('../plugins/music-bot/lib/playlist-store');
const PlaylistImportService = require('../plugins/music-bot/lib/playlist-import-service');

function createSubject(runner) {
  const db = new Database(':memory:');
  const api = { getDatabase: () => db, log: jest.fn() };
  const catalog = new MusicCatalog(api);
  const store = new PlaylistStore(api, catalog);
  const progress = jest.fn();
  const service = new PlaylistImportService({ store, catalog, runner, ytdlpPath: 'yt-dlp', onProgress: progress });
  return { db, store, service, progress };
}

describe('music-bot playlist imports', () => {
  it('uses one low-priority flat snapshot job and atomically appends only canonical new tracks', async () => {
    const runner = { run: jest.fn(async () => JSON.stringify({ entries: [
      { id: 'one', title: 'One', uploader: 'Artist', webpage_url: 'https://youtu.be/one' },
      { id: 'one-upload', title: 'One (Official Audio)', uploader: 'Artist', webpage_url: 'https://youtu.be/one-upload' },
      { id: 'two', title: 'Two', uploader: 'Artist', webpage_url: 'https://youtu.be/two' }
    ] })) };
    const { db, store, service, progress } = createSubject(runner);
    const playlist = store.create({ name: 'Imported' });

    const job = service.start({ playlistId: playlist.id, url: 'https://www.youtube.com/playlist?list=abc' });
    const result = await service.wait(job.id);

    expect(runner.run).toHaveBeenCalledWith('yt-dlp', expect.arrayContaining(['--flat-playlist', '--dump-single-json']), expect.objectContaining({ priority: -10 }));
    expect(result).toMatchObject({ status: 'completed', added: 2, total: 3 });
    expect(store.get(playlist.id).items.map((item) => item.title)).toEqual(['One', 'Two']);
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ jobId: job.id, status: 'completed' }));
    db.close();
  });

  it('keeps the previous snapshot unchanged when the import aborts or fails', async () => {
    let rejectRun;
    const runner = { run: jest.fn(() => new Promise((resolve, reject) => { rejectRun = reject; })) };
    const { db, store, service } = createSubject(runner);
    const playlist = store.create({ name: 'Safe import' });
    const existing = store.catalog.resolveOrUpsert({ title: 'Existing', artist: 'Artist', provider: 'youtube', providerId: 'existing' });
    store.addItem(playlist.id, existing.song.id, playlist.revision);
    const job = service.start({ playlistId: playlist.id, url: 'https://youtube.com/playlist?list=safe' });
    service.abort(job.id);
    rejectRun(Object.assign(new Error('aborted'), { code: 'ABORT_ERR' }));

    await expect(service.wait(job.id)).resolves.toMatchObject({ status: 'aborted' });
    expect(store.get(playlist.id).items.map((item) => item.title)).toEqual(['Existing']);
    db.close();
  });

  it('runs only one low-priority snapshot at a time and starts the next job after completion', async () => {
    const deferred = [];
    const runner = {
      run: jest.fn(() => new Promise((resolve) => deferred.push(resolve)))
    };
    const { db, store, service } = createSubject(runner);
    const first = store.create({ name: 'First import' });
    const second = store.create({ name: 'Second import' });
    const firstJob = service.start({ playlistId: first.id, url: 'https://youtube.com/playlist?list=first' });
    const secondJob = service.start({ playlistId: second.id, url: 'https://youtube.com/playlist?list=second' });

    expect(runner.run).toHaveBeenCalledTimes(1);
    deferred.shift()(JSON.stringify({ entries: [] }));
    await service.wait(firstJob.id);
    await new Promise((resolve) => setImmediate(resolve));
    expect(runner.run).toHaveBeenCalledTimes(2);
    deferred.shift()(JSON.stringify({ entries: [] }));
    await expect(service.wait(secondJob.id)).resolves.toMatchObject({ status: 'completed' });
    db.close();
  });

  it('rejects non-YouTube playlist URLs and exposes duplicate skips plus import provenance', async () => {
    const runner = { run: jest.fn(async () => JSON.stringify({ entries: [
      { id: 'one', title: 'One', uploader: 'Artist' },
      { id: 'one-upload', title: 'One (Official Audio)', uploader: 'Artist' }
    ] })) };
    const { db, store, service } = createSubject(runner);
    const playlist = store.create({ name: 'YouTube only' });

    expect(() => service.start({ playlistId: playlist.id, url: 'https://example.com/playlist?list=nope' })).toThrow(/YouTube playlist/i);
    const job = service.start({ playlistId: playlist.id, url: 'https://www.youtube.com/playlist?list=PL123' });
    await expect(service.wait(job.id)).resolves.toMatchObject({
      status: 'completed', total: 2, added: 1, duplicatesSkipped: 1
    });
    expect(store.get(playlist.id).importProvenance).toMatchObject({
      sourceType: 'youtube-import', externalPlaylistId: 'PL123'
    });
    db.close();
  });
});
