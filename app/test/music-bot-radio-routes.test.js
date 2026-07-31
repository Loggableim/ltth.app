const MusicBotPlugin = require('../plugins/music-bot/main');

function createApi() {
  const handlers = {};
  return {
    handlers,
    getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
    getDatabase: jest.fn(() => ({ prepare: jest.fn() })),
    registerRoute: jest.fn((method, path, handler) => { handlers[`${method.toUpperCase()}:${path}`] = handler; }),
    registerSocket: jest.fn(),
    emit: jest.fn(),
    log: jest.fn()
  };
}

function response() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn();
  return res;
}

describe('Music Bot radio routes', () => {
  test('returns a non-mutating Auto-DJ preview and records dashboard live feedback for the current song', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    plugin.config = {
      ...plugin.config,
      autoDJ: { ...plugin.config.autoDJ, previewEnabled: true, liveFeedbackEnabled: true }
    };
    plugin.autoDJ = {
      getRadioPreview: jest.fn(() => [{ id: 'catalog:1:key', title: 'Candidate' }]),
      invalidateRadioPlan: jest.fn()
    };
    plugin.musicCatalog = { recordLivePreference: jest.fn(() => ({ songId: 42, direction: 'more', score: 1 })) };
    plugin.playbackEngine = { getNowPlaying: jest.fn(() => ({ catalogSongId: 42, title: 'Current' })) };
    plugin._registerRoutes();

    const previewResponse = response();
    await api.handlers['GET:/api/plugins/music-bot/radio/preview']({}, previewResponse);
    expect(previewResponse.json).toHaveBeenCalledWith({
      success: true,
      candidates: [{ id: 'catalog:1:key', title: 'Candidate' }]
    });

    const feedbackResponse = response();
    await api.handlers['POST:/api/plugins/music-bot/radio/live-feedback']({ body: { direction: 'more' } }, feedbackResponse);
    expect(plugin.autoDJ.invalidateRadioPlan).toHaveBeenCalledWith('live-feedback');
    expect(plugin.musicCatalog.recordLivePreference).toHaveBeenCalledWith(42, 'more');
    expect(api.emit).toHaveBeenCalledWith('musicbot:radio-feedback', expect.objectContaining({
      songId: 42, direction: 'more'
    }));
    expect(feedbackResponse.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('keeps feedback disabled and rejects invalid directions without changing catalog preference', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    plugin.config = {
      ...plugin.config,
      autoDJ: { ...plugin.config.autoDJ, previewEnabled: false, liveFeedbackEnabled: false }
    };
    plugin.autoDJ = { getRadioPreview: jest.fn() };
    plugin.musicCatalog = { recordLivePreference: jest.fn() };
    plugin.playbackEngine = { getNowPlaying: jest.fn(() => ({ catalogSongId: 42 })) };
    plugin._registerRoutes();

    const previewResponse = response();
    await api.handlers['GET:/api/plugins/music-bot/radio/preview']({}, previewResponse);
    expect(previewResponse.json).toHaveBeenCalledWith({ success: true, candidates: [], disabled: true });

    const feedbackResponse = response();
    await api.handlers['POST:/api/plugins/music-bot/radio/live-feedback']({ body: { direction: 'invalid' } }, feedbackResponse);
    expect(feedbackResponse.status).toHaveBeenCalledWith(403);
    expect(plugin.musicCatalog.recordLivePreference).not.toHaveBeenCalled();
  });

  test('opens a two-candidate chat vote, accepts !vote commands, and cancels it for a viewer queue entry', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    plugin.config = {
      ...plugin.config,
      autoDJ: { ...plugin.config.autoDJ, enabled: true, chatVotingEnabled: true, chatVoteCloseBeforeEndSeconds: 20 }
    };
    plugin.autoDJ = {
      getRadioPreview: jest.fn(() => [{ id: 'catalog:1:a', title: 'First' }, { id: 'catalog:2:b', title: 'Second' }])
    };

    expect(plugin._openNextSongVote({ id: 'current', duration: 180 })).toMatchObject({ status: 'open' });
    await plugin._handleCommand({ type: 'vote2' }, { username: 'Alice' });
    expect(plugin._nextSongVote.getStatus()).toMatchObject({ status: 'open', votes: { 1: 0, 2: 1 } });
    expect(api.emit).toHaveBeenCalledWith('musicbot:next-song-vote', expect.objectContaining({ status: 'open' }));

    expect(plugin._cancelNextSongVote('viewer-request')).toMatchObject({ status: 'cancelled', reason: 'viewer-request' });
  });

  test('saves a manual genre correction through the catalog API', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    plugin.musicCatalog = { setSongGenres: jest.fn(() => ({ songId: 7, genres: ['rock'], source: 'manual' })) };
    plugin._registerRoutes();
    const res = response();

    await api.handlers['PUT:/api/plugins/music-bot/catalog/songs/:songId/genres']({ params: { songId: '7' }, body: { genres: ['Rock'] } }, res);

    expect(plugin.musicCatalog.setSongGenres).toHaveBeenCalledWith(7, ['Rock']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, genres: ['rock'] }));
  });

  test('returns five projected DJ titles and starts or stops a song radio from the current player track', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    const status = {
      artistRadio: { active: true, title: 'Current', artist: 'Seed Artist', youtubeId: 'seed-id' }
    };
    plugin.config = {
      ...plugin.config,
      autoDJ: { ...plugin.config.autoDJ, previewEnabled: true }
    };
    plugin.autoDJ = {
      getRadioPlan: jest.fn(() => [{ position: 1, id: 'catalog:1:key', title: 'Candidate' }]),
      startArtistRadio: jest.fn(() => true),
      stopArtistRadio: jest.fn(() => true),
      getStatus: jest.fn(() => status),
      hasArtistRadio: jest.fn(() => true)
    };
    const current = {
      title: 'Current',
      artist: 'Seed Artist',
      youtubeId: 'seed-id',
      source: 'youtube'
    };
    plugin.playbackEngine = { getNowPlaying: jest.fn(() => current) };
    plugin._invalidateRadioPrefetch = jest.fn();
    plugin._cancelNextSongVote = jest.fn();
    plugin._registerRoutes();

    const planResponse = response();
    await api.handlers['GET:/api/plugins/music-bot/radio/plan']({}, planResponse);
    expect(plugin.autoDJ.getRadioPlan).toHaveBeenCalledWith(5);
    expect(planResponse.json).toHaveBeenCalledWith({
      success: true,
      plan: [{ position: 1, id: 'catalog:1:key', title: 'Candidate' }]
    });

    const startResponse = response();
    await api.handlers['POST:/api/plugins/music-bot/artist-radio/start']({}, startResponse);
    expect(plugin.autoDJ.startArtistRadio).toHaveBeenCalledWith(current);
    expect(plugin._invalidateRadioPrefetch).toHaveBeenCalledWith('artist-radio-start');
    expect(startResponse.json).toHaveBeenCalledWith({ success: true, status });

    const stopResponse = response();
    await api.handlers['POST:/api/plugins/music-bot/artist-radio/stop']({}, stopResponse);
    expect(plugin.autoDJ.stopArtistRadio).toHaveBeenCalled();
    expect(plugin._invalidateRadioPrefetch).toHaveBeenCalledWith('artist-radio-stop');
    expect(stopResponse.json).toHaveBeenCalledWith({ success: true, stopped: true, status });
  });

  test('keeps player thumbs isolated to the Streamer Playlist and accepts curated suggestions', async () => {
    const api = createApi();
    const plugin = new MusicBotPlugin(api);
    const streamerPlaylist = { id: 'streamer-playlist', revision: 3, items: [] };
    plugin.musicCatalog = {
      resolveOrUpsert: jest.fn(() => ({ song: { id: 42 } })),
      setStreamerPlaylistFeedback: jest.fn(() => ({ songId: 42, state: 'up' })),
      upsertStreamerPlaylistSuggestion: jest.fn(),
      updateStreamerPlaylistSuggestionStatus: jest.fn(() => ({ songId: 77, status: 'accepted' })),
      listStreamerPlaylistSuggestions: jest.fn(() => [{ songId: 77, title: 'Suggested' }])
    };
    plugin.playlistStore = {
      getStreamerPlaylist: jest.fn(() => streamerPlaylist),
      addItem: jest.fn(() => ({ added: true, playlist: { ...streamerPlaylist, revision: 4, items: [{ songId: 42 }] } })),
      removeItem: jest.fn()
    };
    plugin.playbackEngine = {
      getNowPlaying: jest.fn(() => ({ title: 'Current', artist: 'Creator', youtubeId: 'current-id' }))
    };
    plugin.autoDJ = {
      getRadioPlan: jest.fn(() => []),
      invalidateRadioPlan: jest.fn()
    };
    plugin._rebuildStreamerPlaylistSuggestions = jest.fn(() => []);
    plugin._invalidateRadioPrefetch = jest.fn();
    plugin._registerRoutes();

    const feedbackResponse = response();
    await api.handlers['POST:/api/plugins/music-bot/streamer-playlist/feedback']({ body: { direction: 'up' } }, feedbackResponse);

    expect(plugin.musicCatalog.resolveOrUpsert).toHaveBeenCalledWith(expect.objectContaining({ title: 'Current' }));
    expect(plugin.musicCatalog.setStreamerPlaylistFeedback).toHaveBeenCalledWith(42, 'up');
    expect(plugin.playlistStore.addItem).toHaveBeenCalledWith('streamer-playlist', 42, 3);
    expect(plugin.musicCatalog.recordLivePreference).toBeUndefined();
    expect(plugin.autoDJ.invalidateRadioPlan).toHaveBeenCalledWith('streamer-playlist-feedback');
    expect(feedbackResponse.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      feedback: expect.objectContaining({ state: 'up' })
    }));

    const acceptResponse = response();
    await api.handlers['POST:/api/plugins/music-bot/streamer-playlist/suggestions/:songId'](
      { params: { songId: '77' }, body: { action: 'accept' } },
      acceptResponse
    );
    expect(plugin.musicCatalog.updateStreamerPlaylistSuggestionStatus).toHaveBeenCalledWith(77, 'accepted');
    expect(plugin.playlistStore.addItem).toHaveBeenCalledWith('streamer-playlist', 77, 3);
    expect(acceptResponse.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(plugin.autoDJ.invalidateRadioPlan).toHaveBeenCalledWith('streamer-playlist-suggestion');
  });

  test('builds Streamer Playlist suggestions from weighted artist and genre matches without adding them automatically', async () => {
    const plugin = new MusicBotPlugin(createApi());
    plugin.musicCatalog = {
      listStreamerPlaylistLikedSeeds: jest.fn(() => [{
        songId: 1,
        artists: [{ name: 'Anchor Artist' }],
        genres: ['synthwave'],
        streamerPlaylistFeedbackUpdatedAt: Date.now()
      }]),
      upsertStreamerPlaylistSuggestion: jest.fn()
    };
    plugin.playlistStore = {
      getStreamerPlaylist: jest.fn(() => ({ id: 'streamer-playlist', items: [] }))
    };
    plugin.autoDJ = {
      getRadioPlan: jest.fn(() => [
        { songId: 2, artist: 'Anchor Artist', genres: ['synthwave'], score: 1.2 },
        { songId: 3, artist: 'Unrelated Artist', genres: ['folk'], score: 9 }
      ])
    };

    const suggestions = await plugin._rebuildStreamerPlaylistSuggestions(1);

    expect(plugin.autoDJ.getRadioPlan).toHaveBeenCalledWith(10);
    expect(plugin.musicCatalog.upsertStreamerPlaylistSuggestion).toHaveBeenCalledWith(expect.objectContaining({
      songId: 2,
      seedSongId: 1,
      score: expect.any(Number)
    }));
    expect(plugin.musicCatalog.upsertStreamerPlaylistSuggestion).not.toHaveBeenCalledWith(expect.objectContaining({ songId: 3 }));
    expect(suggestions).toEqual([expect.objectContaining({ songId: 2 })]);
  });
});
