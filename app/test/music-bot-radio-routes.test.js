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
    plugin.autoDJ = { getRadioPreview: jest.fn(() => [{ id: 'catalog:1:key', title: 'Candidate' }]) };
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
});
