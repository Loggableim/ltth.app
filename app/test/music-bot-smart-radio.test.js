const AutoDJ = require('../plugins/music-bot/lib/auto-dj');

function createDbMock() {
  return {
    prepare: jest.fn(() => ({ all: jest.fn(() => []), get: jest.fn(() => ({ count: 0 })), run: jest.fn() }))
  };
}

function candidate(songId, overrides = {}) {
  return {
    songId,
    title: `Song ${songId}`,
    canonicalKey: `youtube:video-${songId}`,
    completePlays: 0,
    earlySkips: 0,
    lastPlayedAt: null,
    createdAt: Date.UTC(2026, 6, 1),
    album: `Album ${songId}`,
    albumLastPlayedAt: null,
    bpm: 128,
    genres: ['electronic'],
    genreAffinities: {},
    radioAffinity: 0,
    feedback: null,
    artists: [{ id: songId, name: `Artist ${songId}`, affinity: 0, lastPlayedAt: null }],
    sources: [{
      id: songId * 10,
      provider: 'youtube',
      providerId: `video-${songId}`,
      trackKey: `youtube:video-${songId}`,
      url: `https://www.youtube.com/watch?v=video-${songId}`,
      cooldownUntil: 0
    }],
    ...overrides
  };
}

function createCatalogAutoDJ(config, candidates, now = Date.UTC(2026, 6, 21, 12, 0, 0)) {
  const playlistStore = {
    getRadioSources: jest.fn(() => [{ enabled: true }]),
    getRadioCandidates: jest.fn(() => candidates.map((entry, index) => ({
      songId: entry.songId,
      playlistId: 'smart-radio',
      weight: 1,
      mode: 'shuffle',
      position: index,
      itemCount: candidates.length
    }))),
    advanceRadioCursor: jest.fn()
  };
  const catalog = {
    getRadioCandidates: jest.fn(() => candidates)
  };
  const autoDJ = new AutoDJ({ enabled: true, mode: 'mix', ...config }, {}, createDbMock(), { log: jest.fn() }, {
    catalog,
    playlistStore,
    now: () => now,
    random: () => 0
  });
  return { autoDJ, catalog, playlistStore };
}

describe('Music Bot Smart Radio', () => {
  test('uses selected genres as a hard, balanced filter and keeps previews non-mutating', async () => {
    const songs = [
      candidate(1, { genres: ['rock'], bpm: 126 }),
      candidate(2, { genres: ['electronic'], bpm: 130 }),
      candidate(3, { genres: ['pop'], bpm: 128 })
    ];
    const { autoDJ, playlistStore } = createCatalogAutoDJ({
      genreFilterEnabled: true,
      selectedGenres: ['rock', 'electronic']
    }, songs);

    const preview = autoDJ.getRadioPreview(3);

    expect(preview).toHaveLength(2);
    expect(preview.map((entry) => entry.songId)).toEqual(expect.arrayContaining([1, 2]));
    expect(preview.map((entry) => entry.songId)).not.toContain(3);
    expect(preview[0].reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'genre-filter' })
    ]));
    expect(playlistStore.advanceRadioCursor).not.toHaveBeenCalled();

    const first = await autoDJ.getNextSong();
    autoDJ.markTrackStarted(first.song);
    const second = await autoDJ.getNextSong();

    expect([first.song.catalogSongId, second.song.catalogSongId].sort()).toEqual([1, 2]);
    expect(autoDJ.getStatus().selectedGenres).toEqual(['rock', 'electronic']);
  });

  test('relaxes album spacing before artist spacing when the strict pool is empty', () => {
    const now = Date.UTC(2026, 6, 21, 12, 0, 0);
    const songs = [
      candidate(1, {
        albumLastPlayedAt: now - (30 * 60 * 1000),
        artists: [{ id: 1, name: 'Artist 1', affinity: 0, lastPlayedAt: now - (4 * 60 * 60 * 1000) }]
      }),
      candidate(2, {
        albumLastPlayedAt: now - (8 * 60 * 60 * 1000),
        artists: [{ id: 2, name: 'Artist 2', affinity: 0, lastPlayedAt: now - (30 * 60 * 1000) }]
      })
    ];
    const { autoDJ } = createCatalogAutoDJ({ artistSpacingMinutes: 90, albumSpacingMinutes: 360 }, songs, now);

    const pool = autoDJ._loadCatalogPool();

    expect(pool.albumSpacingRelaxed).toBe(true);
    expect(pool.artistSpacingRelaxed).toBe(false);
    expect(pool.eligible.map((entry) => entry.songId)).toEqual([1]);
  });

  test('applies request seeds to exactly two Auto-DJ tracks and favours compatible BPM', async () => {
    const songs = [
      candidate(1, { bpm: 127, genres: ['rock'], artists: [{ id: 1, name: 'Viewer Artist', affinity: 0, lastPlayedAt: null }] }),
      candidate(2, { bpm: 129, genres: ['rock'], artists: [{ id: 2, name: 'Viewer Artist', affinity: 0, lastPlayedAt: null }] }),
      candidate(3, { bpm: 80, genres: ['jazz'] })
    ];
    const { autoDJ } = createCatalogAutoDJ({ requestSeedsEnabled: true, bpmTransitionsEnabled: true }, songs);
    autoDJ.setRadioContext({ title: 'Current', artist: 'Current Artist', bpm: 128, genres: ['electronic'] });
    autoDJ.setRequestSeed({ title: 'Viewer Request', artist: 'Viewer Artist', genres: ['rock'] });

    const first = await autoDJ.getNextSong();
    autoDJ.markTrackStarted(first.song);
    const second = await autoDJ.getNextSong();
    autoDJ.markTrackStarted(second.song);
    const third = await autoDJ.getNextSong();

    expect(first.song.radioReasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'request-seed' }),
      expect.objectContaining({ code: 'bpm-transition' })
    ]));
    expect(second.song.radioReasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'request-seed' })
    ]));
    expect(third.song.catalogSongId).toBe(3);
    expect(third.song.radioReasons).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'request-seed' })
    ]));
    expect(autoDJ.getStatus().requestSeedRemaining).toBe(0);
  });

  test('keeps the 20 percent novelty budget and never selects two new tracks in a row', () => {
    const { autoDJ } = createCatalogAutoDJ({ noveltyBudgetPercent: 20 }, []);

    autoDJ.markTrackStarted({ requestedBy: 'AutoDJ', radioNovelty: true });
    expect(autoDJ._canSelectNovelty()).toBe(false);

    autoDJ.recentNovelty = [true, true, false, false, false, false, false, false, false, false];
    expect(autoDJ._canSelectNovelty()).toBe(false);
  });

  test('materializes a voted preview candidate only while it is still eligible', () => {
    const songs = [candidate(1, { genres: ['rock'] }), candidate(2, { genres: ['electronic'] })];
    const { autoDJ } = createCatalogAutoDJ({ selectedGenres: ['rock', 'electronic'] }, songs);
    const preview = autoDJ.getRadioPreview(2);

    const selected = autoDJ.getTrackForPreview(preview[1].id);

    expect(selected).toMatchObject({ catalogSongId: preview[1].songId, radioReasons: expect.any(Array) });
  });

  test('pauses visibly instead of silently discovering an off-genre title', async () => {
    const { autoDJ } = createCatalogAutoDJ({
      genreFilterEnabled: true,
      selectedGenres: ['rock']
    }, [candidate(1, { genres: ['pop'] })]);

    await expect(autoDJ.getNextSong()).resolves.toBeNull();

    expect(autoDJ.getStatus()).toMatchObject({
      isActive: false,
      lastResult: expect.objectContaining({ state: 'no-genre-match' })
    });
  });

  test('does not disable Auto-DJ when matching genres are excluded only by the novelty budget', async () => {
    const now = Date.UTC(2026, 6, 21, 12, 0, 0);
    const { autoDJ } = createCatalogAutoDJ({
      genreFilterEnabled: true,
      selectedGenres: ['rock'],
      noveltyBudgetPercent: 0
    }, [candidate(1, { genres: ['rock'], createdAt: now })], now);

    await expect(autoDJ.getNextSong()).resolves.toBeNull();

    expect(autoDJ.getStatus()).toMatchObject({
      isActive: true,
      lastResult: expect.objectContaining({ state: 'no-track' })
    });
  });

  test('uses the least-served selected genre as the discovery seed', async () => {
    const songs = [
      candidate(1, { genres: ['rock'] }),
      candidate(2, { genres: ['electronic'] })
    ];
    const { autoDJ } = createCatalogAutoDJ({
      genreFilterEnabled: true,
      selectedGenres: ['rock', 'electronic']
    }, songs);
    autoDJ.genreSelectionCounts.set('rock', 1);
    autoDJ._pickRelatedToSeed = jest.fn(async () => ({
      title: 'Discovered electronic track',
      youtubeId: 'discovered-electronic',
      url: 'https://www.youtube.com/watch?v=discovered-electronic'
    }));

    await autoDJ._pickCatalogDiscovery();

    expect(autoDJ._pickRelatedToSeed).toHaveBeenCalledWith(
      expect.objectContaining({ catalogSongId: 2 }),
      expect.any(Object)
    );
  });
});
