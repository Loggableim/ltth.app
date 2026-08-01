const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const MusicBotPlugin = require('../plugins/music-bot/main');
const MusicResolver = require('../plugins/music-bot/lib/music-resolver');
const PlaybackEngine = require('../plugins/music-bot/lib/playback-engine');
const PlaybackController = require('../plugins/music-bot/lib/playback-controller');
const productionI18n = require('../modules/i18n');

const productionCatalogs = Object.fromEntries(
  ['en', 'es', 'fr'].map((locale) => [locale, productionI18n.getAllTranslations(locale)])
);

function pluginMessages(catalog) {
  return catalog.plugins?.['music-bot'] || catalog;
}

function musicBotUi(catalog) {
  return pluginMessages(catalog).music_bot.ui;
}

function lookupTranslation(catalog, key) {
  const lookup = (path) => path.split('.').reduce((value, part) => value?.[part], catalog);
  return lookup(key) ?? lookup(key.replace(/^plugins\.music-bot\./, ''));
}

function readCanonicalBanTypes() {
  const source = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/lib/ban-list.js'), 'utf8');
  const declaration = source.match(/const VALID_TYPES = \[([^\]]+)\]/);
  if (!declaration) throw new Error('ban-list VALID_TYPES declaration not found');
  return Array.from(declaration[1].matchAll(/'([^']+)'/g), (match) => match[1]);
}

function readProducedPlaylistImportStatuses() {
  const source = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/lib/playlist-import-service.js'), 'utf8');
  return [...new Set([
    ...Array.from(source.matchAll(/\bstatus:\s*'([^']+)'/g), (match) => match[1]),
    ...Array.from(source.matchAll(/job\.status\s*=\s*'([^']+)'/g), (match) => match[1]),
    ...Array.from(source.matchAll(/_finish\(job,\s*'([^']+)'\)/g), (match) => match[1]),
    ...Array.from(source.matchAll(/return \[([^\]]+)\]\.includes\(job\.status\)/g), (match) =>
      Array.from(match[1].matchAll(/'([^']+)'/g), (value) => value[1])).flat()
  ])];
}

function installProductionI18nClient(window, locale, translations) {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/i18n-client.js'), 'utf8');
  const cutoff = source.indexOf('// Create global instance');
  window.eval(`${cutoff >= 0 ? source.slice(0, cutoff) : source}\nwindow.__MusicBotI18nClient = I18nClient;`);
  const client = new window.__MusicBotI18nClient();
  client.initialized = true;
  client.currentLocale = locale;
  client.defaultLocale = locale;
  client.translations = translations[locale]?.plugins
    ? translations
    : { [locale]: translations };
  client._readyResolve();
  window.i18n = client;
}

const windowsTest = process.platform === 'win32' ? test : test.skip;

function createPluginWithQueue(queue) {
  const emitted = [];
  const api = {
    getSocketIO: () => ({ emit: jest.fn() }),
    getDatabase: () => ({}),
    emit: jest.fn((event, payload) => emitted.push({ event, payload })),
    log: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  plugin.config = {
    playback: { mpvPath: 'mpv', autoPlay: true },
    audio: { masterVolume: 100, sourceVolume: 50 },
    autoDJ: { enabled: false },
    fallbackPlaylist: { enabled: false, tracks: [] },
    preCache: { enabled: false }
  };
  plugin._mpvAvailable = false;
  plugin._ensureMpv = jest.fn(async () => {});
  plugin.queueManager = {
    getQueue: jest.fn(() => queue),
    shiftNext: jest.fn(() => queue.shift()),
    returnToFront: jest.fn((song) => queue.unshift(song))
  };
  plugin.playbackEngine = {
    play: jest.fn(),
    clearNowPlaying: jest.fn(),
    getNowPlaying: jest.fn(() => null)
  };
  plugin.autoDJ = { getNextTrack: jest.fn() };
  plugin._playFallbackTrack = jest.fn(async () => null);
  plugin._maybePlayAutoDJ = jest.fn(async () => null);
  plugin._schedulePreCache = jest.fn();
  return { plugin, api, emitted };
}

function createJsonResponse(payload) {
  return { json: async () => payload };
}

function bootMusicBotUi(options = {}) {
  const setupIssues = options.setupIssues || [];
  const postHandler = options.postHandler;
  const fetchHandler = options.fetchHandler;
  const autoDjConfig = options.autoDjConfig || {
    enabled: false,
    mode: 'history',
    historyMinPlays: 2,
    maxConsecutiveAutoDJ: 10,
    announceAutoDJ: true,
    randomKeywords: [],
    playlistUrls: []
  };
  const autoDjStatus = options.autoDjStatus;
  const statusOnboarding = options.statusOnboarding || {
    completed: false,
    completedAt: null
  };
  const statusPayload = options.statusPayload || {};
  const historyPayload = options.historyPayload || [];
  const playlistsPayload = options.playlistsPayload || [];
  const playlistDetails = options.playlistDetails || {};
  const radioSourcesPayload = options.radioSourcesPayload || [];
  const catalogPayload = options.catalogPayload || [];
  const giftCatalogPayload = options.giftCatalogPayload || { catalog: [] };
  const bansPayload = options.bansPayload || [];
  const radioPlanPayload = options.radioPlanPayload || [];
  const streamerPlaylistPayload = options.streamerPlaylistPayload || { playlist: null, suggestions: [] };
  const translations = options.translations;
  const productionLocale = options.productionLocale;
  const i18nReady = options.i18nReady;
  const i18nWarn = options.i18nWarn;
  const staticLocalePayload = options.staticLocalePayload;
  const socketHandlers = {};
  const html = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/ui.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/assets/ui.js'), 'utf8');
  const fetchMock = jest.fn(async (url, options = {}) => {
    const target = String(url);
    if (target.includes('/plugins/music-bot/locales/')) {
      return createJsonResponse(staticLocalePayload || {});
    }
    if (typeof fetchHandler === 'function') {
      const customResponse = await fetchHandler(target, options);
      if (customResponse !== undefined) return customResponse;
    }
    if (options.method === 'POST') {
      if (typeof postHandler === 'function') {
        return postHandler(target, options);
      }
      return createJsonResponse({ success: true, config: {} });
    }
    if (target.includes('/auto-dj/status') && autoDjStatus) {
      return createJsonResponse({ success: true, status: autoDjStatus });
    }
    if (target.includes('/status')) {
      return createJsonResponse({
        success: true,
        nowPlaying: null,
        queueLength: 0,
        playbackState: 'idle',
        masterVolume: 100,
        sourceVolume: 50,
        onboarding: statusOnboarding,
        ...statusPayload
      });
    }
    if (target.includes('/queue')) return createJsonResponse({ success: true, queue: [] });
    if (target.includes('/history')) return createJsonResponse({ success: true, history: historyPayload, total: historyPayload.length });
    if (target.includes('/catalog/search')) return createJsonResponse({ success: true, songs: catalogPayload });
    if (target.includes('/radio/playlist-sources')) return createJsonResponse({ success: true, sources: radioSourcesPayload });
    if (target.includes('/radio/plan')) return createJsonResponse({ success: true, plan: radioPlanPayload });
    if (target.includes('/streamer-playlist')) return createJsonResponse({ success: true, ...streamerPlaylistPayload });
    if (target.includes('/playlists/') && !target.includes('/playlist-imports')) {
      return createJsonResponse({ success: true, playlist: playlistDetails[target.split('/').pop()] });
    }
    if (target.includes('/playlists')) return createJsonResponse({ success: true, playlists: playlistsPayload });
    if (target.includes('/bans')) return createJsonResponse({ success: true, bans: bansPayload });
    if (target.includes('/gift-catalog')) return createJsonResponse(giftCatalogPayload);
    if (target.includes('/setup-status')) return createJsonResponse({ success: true, issues: setupIssues });
    if (target.includes('/config')) {
      return createJsonResponse({
        success: true,
        config: {
          queue: {
            duplicateDetection: 'strict',
            cooldownPerUserSeconds: 30,
            maxSongDurationSeconds: 360,
            cooldownBypassForGifts: false
          },
          playback: { crossfadeDuration: 3000, mpvPath: 'mpv' },
          commandAliases: {},
          autoDJ: autoDjConfig,
          moderation: { rejectAgeRestricted: true, rejectExplicit: false, blockedKeywords: [] },
          resolver: { ytdlpPath: 'yt-dlp' },
          audio: { masterVolume: 100, sourceVolume: 50 },
          permissions: { requireSuperfanForRequest: false },
          monetization: {
            payToPlayEnabled: false,
            payToPlayGiftCatalog: [],
            payToPlayMinCoins: 0,
            payToSkipEnabled: false,
            payToSkipGiftCatalog: [],
            likeGateEnabled: false,
            minLikesPerUser: 1
          },
          giftIntegration: { skipImmunityGifts: [] }
        }
      });
    }
    return createJsonResponse({ success: true });
  });

  const dom = new JSDOM(html, {
    url: 'http://localhost:3000/plugins/music-bot/ui',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.io = () => ({
        on: jest.fn((event, handler) => {
          socketHandlers[event] = handler;
        }),
        emit: jest.fn()
      });
      window.fetch = fetchMock;
      window.open = jest.fn();
      window.navigator.clipboard = { writeText: jest.fn(async () => {}) };
      if (i18nReady) {
        let i18nInitialized = false;
        i18nReady.then(() => {
          i18nInitialized = true;
        });
        window.i18n = {
          ready: i18nReady,
          t: jest.fn(() => {
            if (!i18nInitialized) i18nWarn?.('[i18n] Not initialized yet, returning key');
            return 'music-bot.i18n-key';
          }),
          updateDOM: jest.fn()
        };
      } else if (productionLocale && translations) {
        installProductionI18nClient(window, productionLocale, translations);
      } else if (translations) {
        window.i18n = { t: (key, params = {}) => {
          const value = lookupTranslation(translations, key);
          return typeof value === 'string' ? value.replace(/\{(\w+)\}/g, (_match, name) => params[name] ?? `{${name}}`) : key;
        } };
      }
    }
  });
  if (productionLocale && translations) {
    dom.window.i18n.updateDOM();
  } else if (translations) {
    dom.window.document.querySelectorAll('[data-i18n]').forEach((element) => {
      const value = lookupTranslation(translations, element.dataset.i18n);
      if (typeof value === 'string') element.textContent = value;
    });
    dom.window.document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      const value = lookupTranslation(translations, element.dataset.i18nPlaceholder);
      if (typeof value === 'string') element.placeholder = value;
    });
    dom.window.document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
      const value = lookupTranslation(translations, element.dataset.i18nAriaLabel);
      if (typeof value === 'string') element.setAttribute('aria-label', value);
    });
  }
  dom.window.eval(js);
  return { dom, fetchMock, socketHandlers };
}

function bootMusicBotOverlay() {
  const socketHandlers = {};
  const html = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/overlay.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost:3000/plugins/music-bot/overlay.html?design=minimal&theme=default&position=bottom-left',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.io = () => ({
        on: jest.fn((event, handler) => {
          socketHandlers[event] = handler;
        }),
        emit: jest.fn()
      });
    }
  });
  return { dom, socketHandlers };
}

describe('Music Bot runtime and UI regressions', () => {
  let doms;

  beforeEach(() => {
    doms = [];
  });

  afterEach(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    doms.forEach((dom) => dom.window.close());
  });

  test('keeps queued songs when mpv is unavailable instead of draining the queue', async () => {
    const queue = [{
      id: 'song-1',
      title: 'Queued Song',
      url: 'https://youtube.com/watch?v=abc123xyz99',
      duration: 120,
      requestedBy: 'viewer'
    }];
    const { plugin } = createPluginWithQueue(queue);

    const result = await plugin._playNextFromQueue();

    expect(result.success).toBe(false);
    expect(plugin._ensureMpv).toHaveBeenCalledTimes(1);
    expect(queue).toHaveLength(1);
    expect(plugin.queueManager.shiftNext).not.toHaveBeenCalled();
    expect(plugin.playbackEngine.play).not.toHaveBeenCalled();
  });

  test('delegates stalled-player recovery to the single controller heartbeat without advancing the queue', async () => {
    const current = { id: 'current', title: 'Current Song', url: 'https://example.test/current.mp3' };
    const { plugin } = createPluginWithQueue([{ id: 'requested', title: 'Requested Song' }]);
    let syncCallback;
    const setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation((callback) => {
      syncCallback = callback;
      return 123;
    });
    plugin.playbackEngine = {
      getNowPlaying: jest.fn(() => current),
      heartbeat: jest.fn(async () => ({ action: 'recovered', position: 0 })),
      getState: jest.fn(() => 'playing')
    };
    plugin._skipCurrent = jest.fn();
    plugin._playNextFromQueue = jest.fn();

    try {
      plugin._startPlaybackSync();
      await syncCallback();

      expect(plugin.playbackEngine.heartbeat).toHaveBeenCalledWith({ timeoutMs: 2000 });
      expect(plugin.queueManager.shiftNext).not.toHaveBeenCalled();
      expect(plugin._skipCurrent).not.toHaveBeenCalled();
      expect(plugin._playNextFromQueue).not.toHaveBeenCalled();
    } finally {
      plugin._stopPlaybackSync();
      setIntervalSpy.mockRestore();
    }
  });

  test('confirms the stalled player on the second heartbeat without replaying retained media', async () => {
    const current = { id: 'current', title: 'Current Song', url: 'https://example.test/current.mp3' };
    const { plugin } = createPluginWithQueue([{ id: 'requested', title: 'Requested Song' }]);
    const playbackEngine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    playbackEngine.nowPlaying = current;
    playbackEngine.state = 'playing';
    playbackEngine.restart = jest.fn(async () => current);
    playbackEngine.play = jest.fn(async () => {});

    const first = await playbackEngine._handleHeartbeatFailure(
      new Error('mpv did not acknowledge command: get_property'),
      { resumePlayback: true }
    );
    const second = await playbackEngine._handleHeartbeatFailure(
      new Error('mpv did not acknowledge command: get_property'),
      { resumePlayback: true }
    );

    expect(first).toMatchObject({ ok: false, action: 'counted', failures: 1 });
    expect(second).toMatchObject({ ok: false, action: 'confirmed', failures: 2 });
    expect(playbackEngine.restart).not.toHaveBeenCalled();
    expect(playbackEngine.play).not.toHaveBeenCalled();
    expect(plugin.queueManager.shiftNext).not.toHaveBeenCalled();
  });

  test('returns an atomic playback identity with the initial request-status event', async () => {
    const handlers = {};
    const api = {
      getSocketIO: () => ({ emit: jest.fn() }), getDatabase: () => ({}), log: jest.fn(), emit: jest.fn(),
      registerSocket: jest.fn((event, handler) => { handlers[event] = handler; })
    };
    const plugin = new MusicBotPlugin(api);
    plugin.config = { audio: { masterVolume: 100, sourceVolume: 50 }, autoDJ: { enabled: false } };
    const current = { id: 'playback-99', title: 'Initial track', duration: 120 };
    plugin.playbackEngine = { getNowPlaying: jest.fn(() => current), getState: jest.fn(() => 'playing') };
    plugin.queueManager = { getQueue: jest.fn(() => []) };
    plugin._buildResolverSnapshot = jest.fn(() => ({}));
    plugin._buildHealthPayload = jest.fn(() => ({}));
    plugin._registerSocketEvents();
    const socket = { emit: jest.fn() };

    await handlers['musicbot:request-status'](socket);

    expect(socket.emit).toHaveBeenCalledWith('musicbot:now-playing', expect.objectContaining({ id: 'playback-99', playbackId: 'playback-99' }));
  });

  test('cools down only the selected Auto-DJ source when its initial playback start fails', async () => {
    const track = {
      id: 'start-failed',
      title: 'Broken stream',
      requestedBy: 'AutoDJ',
      streamUrl: 'https://media.example.test/broken-stream.m4a'
    };
    const { plugin } = createPluginWithQueue([]);
    plugin._maybePlayAutoDJ = MusicBotPlugin.prototype._maybePlayAutoDJ.bind(plugin);
    plugin.config.autoDJ.enabled = true;
    plugin.autoDJ = {
      getNextSong: jest.fn(async () => ({ song: track })),
      recordFailedTrack: jest.fn(),
      recordSourceFailure: jest.fn(() => ({ failureClass: 'transient' })),
      markPlaybackFailed: jest.fn()
    };
    plugin.playbackEngine = { play: jest.fn(async () => { throw new Error('loadfile failed'); }) };

    const result = await plugin._maybePlayAutoDJ(true);

    expect(result).toBeNull();
    expect(plugin.autoDJ.recordSourceFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        id: track.id,
        title: track.title,
        requestedBy: track.requestedBy,
        trackKey: expect.any(String)
      }),
      expect.any(Error)
    );
    expect(plugin.autoDJ.recordFailedTrack).not.toHaveBeenCalled();
    expect(plugin.autoDJ.markPlaybackFailed).toHaveBeenCalledTimes(1);
    expect(plugin.autoDJ.recordSourceFailure.mock.invocationCallOrder[0])
      .toBeLessThan(plugin.autoDJ.markPlaybackFailed.mock.invocationCallOrder[0]);
    expect(plugin.autoDJ.getNextSong).toHaveBeenCalledTimes(1);
  });

  test('resolves a page-only Auto-DJ history track before handing it to MPV', async () => {
    const historyTrack = {
      title: 'History page',
      artist: 'History Artist',
      url: 'https://www.youtube.com/watch?v=history01',
      source: 'youtube',
      youtubeId: 'history01',
      channelName: 'Original Channel'
    };
    const resolvedTrack = {
      title: 'History page refreshed',
      artist: 'History Artist',
      url: historyTrack.url,
      streamUrl: 'https://media.example.test/history01.m4a',
      source: 'youtube',
      provider: 'youtube',
      providerId: 'history01',
      trackKey: 'youtube:history01',
      youtubeId: 'history01',
      channelName: 'Resolved Channel'
    };
    const { plugin } = createPluginWithQueue([]);
    plugin._maybePlayAutoDJ = MusicBotPlugin.prototype._maybePlayAutoDJ.bind(plugin);
    plugin.config.autoDJ.enabled = true;
    plugin.musicResolver = {
      resolve: jest.fn(async () => ({ success: true, song: resolvedTrack }))
    };
    plugin.autoDJ = {
      getNextSong: jest.fn(async () => ({ song: historyTrack })),
      recordFailedTrack: jest.fn(),
      markTrackStarted: jest.fn(),
      getStatus: jest.fn(() => ({ mode: 'mix' }))
    };
    plugin.queueManager.markPlaying = jest.fn();
    plugin.playbackEngine = {
      play: jest.fn(async () => {}),
      getNowPlaying: jest.fn(() => null),
      isPlaying: jest.fn(() => false)
    };

    const result = await plugin._maybePlayAutoDJ(true);

    expect(plugin.musicResolver.resolve).toHaveBeenCalledWith(historyTrack.url);
    expect(plugin.playbackEngine.play).toHaveBeenCalledWith(expect.objectContaining({
      title: resolvedTrack.title,
      streamUrl: resolvedTrack.streamUrl,
      requestedBy: 'AutoDJ',
      trackKey: 'youtube:history01'
    }));
    expect(result).toEqual(expect.objectContaining({
      streamUrl: resolvedTrack.streamUrl,
      requestedBy: 'AutoDJ'
    }));
  });

  test('does not replace a viewer request that starts while Auto-DJ resolution is pending', async () => {
    const queue = [];
    const historyTrack = {
      title: 'Slow history page',
      url: 'https://www.youtube.com/watch?v=slowhistory',
      source: 'youtube',
      youtubeId: 'slowhistory'
    };
    let releaseResolve;
    const { plugin } = createPluginWithQueue(queue);
    plugin._maybePlayAutoDJ = MusicBotPlugin.prototype._maybePlayAutoDJ.bind(plugin);
    plugin.config.autoDJ.enabled = true;
    plugin.musicResolver = {
      resolve: jest.fn(() => new Promise((resolve) => {
        releaseResolve = resolve;
      }))
    };
    plugin.autoDJ = {
      getNextSong: jest.fn(async () => ({ song: historyTrack })),
      recordFailedTrack: jest.fn(),
      markTrackStarted: jest.fn(),
      getStatus: jest.fn(() => ({ mode: 'mix' }))
    };
    plugin.queueManager.markPlaying = jest.fn();
    plugin.playbackEngine = {
      play: jest.fn(async () => {}),
      getNowPlaying: jest.fn(() => null),
      isPlaying: jest.fn(() => false)
    };

    const autoDjStart = plugin._maybePlayAutoDJ(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(plugin.musicResolver.resolve).toHaveBeenCalled();
    queue.push({ id: 'viewer-next', title: 'Viewer next', requestedBy: 'viewer' });
    releaseResolve({
      success: true,
      song: {
        ...historyTrack,
        streamUrl: 'https://media.example.test/slowhistory.m4a'
      }
    });

    await expect(autoDjStart).resolves.toBeNull();
    expect(plugin.playbackEngine.play).not.toHaveBeenCalled();
    expect(queue[0].id).toBe('viewer-next');
  });

  test('keeps an already resolved Auto-DJ stream out of the resolver', async () => {
    const directTrack = {
      title: 'Direct radio stream',
      url: 'https://radio.example.test/station',
      streamUrl: 'https://media.example.test/station.aac',
      source: 'radio'
    };
    const { plugin } = createPluginWithQueue([]);
    plugin._maybePlayAutoDJ = MusicBotPlugin.prototype._maybePlayAutoDJ.bind(plugin);
    plugin.config.autoDJ.enabled = true;
    plugin.musicResolver = { resolve: jest.fn() };
    plugin.autoDJ = {
      getNextSong: jest.fn(async () => ({ song: directTrack })),
      recordFailedTrack: jest.fn(),
      markTrackStarted: jest.fn(),
      getStatus: jest.fn(() => ({ mode: 'mix' }))
    };
    plugin.queueManager.markPlaying = jest.fn();
    plugin.playbackEngine = {
      play: jest.fn(async () => {}),
      getNowPlaying: jest.fn(() => null),
      isPlaying: jest.fn(() => false)
    };

    const result = await plugin._maybePlayAutoDJ(true);

    expect(plugin.musicResolver.resolve).not.toHaveBeenCalled();
    expect(plugin.playbackEngine.play).toHaveBeenCalledWith(expect.objectContaining({
      streamUrl: directTrack.streamUrl,
      requestedBy: 'AutoDJ'
    }));
    expect(result.streamUrl).toBe(directTrack.streamUrl);
  });

  test('allows a scheduled Auto-DJ handoff without bypassing the consecutive limit', async () => {
    const outgoingTrack = {
      id: 'outgoing-auto-dj',
      title: 'Outgoing Auto-DJ',
      requestedBy: 'AutoDJ',
      streamUrl: 'https://media.example.test/outgoing.m4a'
    };
    const incomingTrack = {
      id: 'incoming-auto-dj',
      title: 'Incoming Auto-DJ',
      requestedBy: 'AutoDJ',
      streamUrl: 'https://media.example.test/incoming.m4a'
    };
    const { plugin } = createPluginWithQueue([]);
    plugin._maybePlayAutoDJ = MusicBotPlugin.prototype._maybePlayAutoDJ.bind(plugin);
    plugin.config.autoDJ.enabled = true;
    plugin.autoDJ = {
      onQueueEmpty: jest.fn(async () => ({ song: incomingTrack })),
      getNextSong: jest.fn(),
      recordFailedTrack: jest.fn(),
      markTrackStarted: jest.fn(),
      getStatus: jest.fn(() => ({ mode: 'mix' }))
    };
    plugin.queueManager.markPlaying = jest.fn();
    plugin.playbackEngine = {
      play: jest.fn(async () => incomingTrack),
      getNowPlaying: jest.fn(() => outgoingTrack),
      isPlaying: jest.fn(() => true)
    };

    const result = await plugin._maybePlayAutoDJ(false, true);

    expect(result).toEqual(expect.objectContaining({ id: incomingTrack.id }));
    expect(plugin.autoDJ.onQueueEmpty).toHaveBeenCalledTimes(1);
    expect(plugin.autoDJ.getNextSong).not.toHaveBeenCalled();
    expect(plugin.playbackEngine.play).toHaveBeenCalledWith(expect.objectContaining({
      id: incomingTrack.id,
      requestedBy: 'AutoDJ'
    }));
  });

  test('excludes an unresolvable Auto-DJ page and plays the next bounded candidate', async () => {
    const brokenTrack = {
      title: 'Broken history page',
      url: 'https://www.youtube.com/watch?v=brokenpage',
      source: 'youtube',
      youtubeId: 'brokenpage'
    };
    const playableTrack = {
      title: 'Working radio stream',
      url: 'https://radio.example.test/working',
      streamUrl: 'https://media.example.test/working.aac',
      source: 'radio'
    };
    const { plugin } = createPluginWithQueue([]);
    plugin._maybePlayAutoDJ = MusicBotPlugin.prototype._maybePlayAutoDJ.bind(plugin);
    plugin.config.autoDJ.enabled = true;
    plugin.musicResolver = {
      resolve: jest.fn(async () => ({ success: false, message: 'No playable result' }))
    };
    plugin.autoDJ = {
      getNextSong: jest.fn()
        .mockResolvedValueOnce({ song: brokenTrack })
        .mockResolvedValueOnce({ song: playableTrack }),
      recordFailedTrack: jest.fn(),
      recordSourceFailure: jest.fn(() => ({ failureClass: 'long' })),
      markTrackStarted: jest.fn(),
      getStatus: jest.fn(() => ({ mode: 'mix' }))
    };
    plugin.queueManager.markPlaying = jest.fn();
    plugin.playbackEngine = {
      play: jest.fn(async () => {}),
      getNowPlaying: jest.fn(() => null),
      isPlaying: jest.fn(() => false)
    };

    const result = await plugin._maybePlayAutoDJ(true);

    expect(plugin.autoDJ.recordSourceFailure).toHaveBeenCalledWith(
      expect.objectContaining({ youtubeId: brokenTrack.youtubeId }),
      expect.any(Error)
    );
    expect(plugin.autoDJ.recordFailedTrack).not.toHaveBeenCalled();
    expect(plugin.autoDJ.getNextSong).toHaveBeenCalledTimes(2);
    expect(plugin.playbackEngine.play).toHaveBeenCalledTimes(1);
    expect(result.streamUrl).toBe(playableTrack.streamUrl);
  });

  test('keeps an Auto-DJ stream playing when the controller heartbeat confirms playback', async () => {
    const current = { id: 'auto-dj-current', title: 'Auto-DJ Current', requestedBy: 'AutoDJ' };
    const { plugin, api } = createPluginWithQueue([]);
    let syncCallback;
    const setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation((callback) => {
      syncCallback = callback;
      return 124;
    });
    plugin.playbackEngine = {
      getNowPlaying: jest.fn(() => current),
      heartbeat: jest.fn(async () => ({ action: 'healthy', position: 42 })),
      getState: jest.fn(() => 'playing')
    };

    try {
      plugin._startPlaybackSync();
      await syncCallback();

      expect(plugin.playbackEngine.heartbeat).toHaveBeenCalledWith({ timeoutMs: 2000 });
      expect(api.emit).toHaveBeenCalledWith('musicbot:playback-sync', expect.objectContaining({
        id: current.id,
        position: 42
      }));
    } finally {
      plugin._stopPlaybackSync();
      setIntervalSpy.mockRestore();
    }
  });

  test('keeps an Auto-DJ stream playing when the controller heartbeat confirms playback', async () => {
    const { EventEmitter } = require('events');
    const current = {
      id: 'auto-dj-current',
      title: 'Auto-DJ Current',
      url: 'https://example.test/auto-dj-current.mp3',
      requestedBy: 'AutoDJ'
    };
    const engine = new EventEmitter();
    engine.setVolume = jest.fn(async () => {});
    engine.play = jest.fn(async (track) => {
      engine.nowPlaying = track;
      engine.emit('track-start', track);
    });
    engine.getNowPlaying = jest.fn(() => engine.nowPlaying || null);
    engine.getState = jest.fn(() => 'playing');
    engine.heartbeat = jest.fn(async () => ({
      ok: true,
      action: 'healthy',
      failures: 0,
      position: 42
    }));
    engine.shutdown = jest.fn(async () => {});
    const controller = new PlaybackController(
      { defaultVolume: 50 },
      { log: jest.fn() },
      { engineFactory: () => engine }
    );

    await controller.play(current);
    const heartbeat = await controller.heartbeat({ timeoutMs: 2000 });

    expect(heartbeat).toMatchObject({ ok: true, action: 'healthy', position: 42 });
    expect(engine.heartbeat).toHaveBeenCalledWith({ timeoutMs: 2000 });
    expect(engine.play).toHaveBeenCalledTimes(1);
    await controller.shutdown();
  });

  test('advances a concurrently failed Auto-DJ track only once', async () => {
    const failedTrack = { id: 'auto-dj-failed', title: 'Failed Auto-DJ', requestedBy: 'AutoDJ' };
    const { plugin } = createPluginWithQueue([]);
    plugin.autoDJ = {
      recordFailedTrack: jest.fn(),
      recordSourceFailure: jest.fn(() => ({ failureClass: 'transient' })),
      markPlaybackFailed: jest.fn()
    };
    plugin.playbackEngine = {
      getNowPlaying: jest.fn(() => failedTrack),
      clearNowPlaying: jest.fn(),
      restart: jest.fn(),
      play: jest.fn()
    };
    plugin._stopPlaybackSync = jest.fn();
    plugin._maybePlayAutoDJ = jest.fn(async () => null);

    await Promise.all([
      plugin._handleAutoDJPlaybackFailure(failedTrack, 'ipc-confirmed', new Error('MPV unavailable')),
      plugin._handleAutoDJPlaybackFailure(failedTrack, 'ipc-confirmed', new Error('MPV unavailable'))
    ]);

    expect(plugin.autoDJ.recordSourceFailure).toHaveBeenCalledTimes(1);
    expect(plugin.autoDJ.recordSourceFailure).toHaveBeenCalledWith(failedTrack, expect.any(Error));
    expect(plugin.autoDJ.recordFailedTrack).not.toHaveBeenCalled();
    expect(plugin.autoDJ.markPlaybackFailed).toHaveBeenCalledTimes(1);
    expect(plugin._maybePlayAutoDJ).toHaveBeenCalledTimes(1);
    expect(plugin._maybePlayAutoDJ).toHaveBeenCalledWith(true);
    expect(plugin.playbackEngine.restart).not.toHaveBeenCalled();
    expect(plugin.playbackEngine.play).not.toHaveBeenCalled();
  });

  test('allows a new Auto-DJ playback object to recover when it reuses an older track ID', async () => {
    const firstPlayback = { id: 'reused-auto-dj-id', title: 'Auto-DJ A', requestedBy: 'AutoDJ' };
    const secondPlayback = { id: 'reused-auto-dj-id', title: 'Auto-DJ A Again', requestedBy: 'AutoDJ' };
    const { plugin } = createPluginWithQueue([]);
    let activeTrack = firstPlayback;
    plugin.autoDJ = {
      recordFailedTrack: jest.fn(),
      recordSourceFailure: jest.fn(() => ({ failureClass: 'transient' })),
      markPlaybackFailed: jest.fn()
    };
    plugin.playbackEngine = {
      getNowPlaying: jest.fn(() => activeTrack),
      clearNowPlaying: jest.fn(),
      restart: jest.fn(),
      play: jest.fn()
    };
    plugin._stopPlaybackSync = jest.fn();
    plugin._maybePlayAutoDJ = jest.fn(async () => null);

    await plugin._handleAutoDJPlaybackFailure(firstPlayback, 'ipc-confirmed', new Error('first failure'));
    activeTrack = secondPlayback;
    await plugin._handleAutoDJPlaybackFailure(secondPlayback, 'ipc-confirmed', new Error('second failure'));

    expect(plugin.autoDJ.recordSourceFailure).toHaveBeenCalledTimes(2);
    expect(plugin.autoDJ.recordFailedTrack).not.toHaveBeenCalled();
    expect(plugin._maybePlayAutoDJ).toHaveBeenCalledTimes(2);
  });

  test('keeps Auto-DJ supervised after repeated playback failures instead of deactivating it', async () => {
    const tracks = [1, 2, 3].map((index) => ({
      id: `rapid-failure-${index}`,
      title: `Rapid failure ${index}`,
      requestedBy: 'AutoDJ'
    }));
    const { plugin } = createPluginWithQueue([]);
    let activeTrack = tracks[0];
    plugin.autoDJ = {
      recordFailedTrack: jest.fn(),
      recordSourceFailure: jest.fn(() => ({ failureClass: 'transient' })),
      markPlaybackFailed: jest.fn(),
      deactivate: jest.fn()
    };
    plugin.playbackEngine = {
      getNowPlaying: jest.fn(() => activeTrack),
      clearNowPlaying: jest.fn()
    };
    plugin._stopPlaybackSync = jest.fn();
    plugin._maybePlayAutoDJ = jest.fn(async () => null);
    plugin.radioSupervisor = { wake: jest.fn(async () => ({ success: false })) };
    plugin._emitToast = jest.fn();
    plugin._emitPlaybackStopped = jest.fn();
    plugin._emitNowPlaying = jest.fn();
    plugin._emitRuntimeHealth = jest.fn();
    plugin.queueManager.markPlaying = jest.fn();
    plugin.queueManager.resetVoteSkips = jest.fn();

    for (const track of tracks) {
      activeTrack = track;
      await plugin._handleAutoDJPlaybackFailure(track, 'mpv-track-end', new Error('unrecognized file format'));
    }

    expect(plugin._maybePlayAutoDJ).not.toHaveBeenCalled();
    expect(plugin.radioSupervisor.wake).toHaveBeenCalledTimes(3);
    expect(plugin.autoDJ.deactivate).not.toHaveBeenCalled();
    expect(plugin._emitToast).not.toHaveBeenCalled();
    expect(plugin.queueManager.markPlaying).toHaveBeenCalledTimes(3);
    expect(plugin.queueManager.resetVoteSkips).toHaveBeenCalledTimes(3);
  });

  test('emits playback errors through one UI channel', () => {
    const { plugin, api } = createPluginWithQueue([]);
    api.emit.mockClear();

    plugin._emitError('unrecognized file format');

    expect(api.emit).toHaveBeenCalledTimes(1);
    expect(api.emit).toHaveBeenCalledWith('musicbot:error', {
      message: 'unrecognized file format'
    });
  });

  test('ignores a delayed Auto-DJ track-end for the replaced track after watchdog recovery', async () => {
    const failedTrack = { id: 'auto-dj-a', title: 'Auto-DJ A', requestedBy: 'AutoDJ' };
    const replacementTrack = { id: 'auto-dj-b', title: 'Auto-DJ B', requestedBy: 'AutoDJ' };
    const { plugin, api } = createPluginWithQueue([]);
    const playbackEngine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    playbackEngine.nowPlaying = failedTrack;
    playbackEngine.state = 'playing';
    playbackEngine.getPosition = jest.fn(async () => {
      throw new Error('MPV did not respond');
    });
    plugin.playbackEngine = playbackEngine;
    plugin.autoDJ = {
      recordFailedTrack: jest.fn(),
      recordSourceFailure: jest.fn(() => ({ failureClass: 'transient' })),
      markPlaybackFailed: jest.fn(),
      setPlaybackSeed: jest.fn()
    };
    plugin.queueManager = {
      markPlaying: jest.fn(),
      resetVoteSkips: jest.fn(),
      addToHistory: jest.fn(),
      removeSkipImmunity: jest.fn()
    };
    plugin._stopPlaybackSync = jest.fn();
    plugin._startPlaybackSync = jest.fn();
    plugin._clearCrossfadeTimer = jest.fn();
    plugin._maybePlayAutoDJ = jest.fn(async () => {
      playbackEngine.nowPlaying = replacementTrack;
      playbackEngine.state = 'playing';
      playbackEngine.emit('track-start', replacementTrack);
      return replacementTrack;
    });
    plugin._registerPlaybackEvents();

    await plugin._handleAutoDJPlaybackFailure(
      failedTrack,
      'ipc-confirmed',
      new Error('watchdog timed out')
    );
    expect(playbackEngine.getNowPlaying()).toBe(replacementTrack);
    expect(plugin.autoDJ.recordSourceFailure).toHaveBeenCalledTimes(1);
    expect(plugin.autoDJ.recordFailedTrack).not.toHaveBeenCalled();
    expect(plugin._maybePlayAutoDJ).toHaveBeenCalledTimes(1);
    const crossfadeTimerClearCount = plugin._clearCrossfadeTimer.mock.calls.length;
    expect(playbackEngine._replacementOutgoingTrack).toBe(failedTrack);

    playbackEngine._handleMessage(JSON.stringify({
      event: 'end-file',
      reason: 'error',
      error: 'Delayed end-file event for A'
    }));

    expect(playbackEngine.getNowPlaying()).toBe(replacementTrack);
    expect(plugin.autoDJ.recordSourceFailure).toHaveBeenCalledTimes(1);
    expect(plugin.autoDJ.recordFailedTrack).not.toHaveBeenCalled();
    expect(plugin._maybePlayAutoDJ).toHaveBeenCalledTimes(1);
    expect(plugin._clearCrossfadeTimer).toHaveBeenCalledTimes(crossfadeTimerClearCount);
    expect(api.emit).not.toHaveBeenCalledWith('musicbot:error', expect.anything());
    expect(api.emit).not.toHaveBeenCalledWith('musicbot:playback-stopped', expect.anything());
  });

  test('attributes a genuine replacement error to B after A fails and B starts', async () => {
    const firstTrack = { id: 'auto-dj-a', title: 'Auto-DJ A', requestedBy: 'AutoDJ' };
    const secondTrack = { id: 'auto-dj-b', title: 'Auto-DJ B', requestedBy: 'AutoDJ' };
    const thirdTrack = { id: 'auto-dj-c', title: 'Auto-DJ C', requestedBy: 'AutoDJ' };
    const { plugin, api } = createPluginWithQueue([]);
    const playbackEngine = new PlaybackEngine({ defaultVolume: 50 }, { log: jest.fn() });
    playbackEngine.nowPlaying = firstTrack;
    playbackEngine.state = 'playing';
    plugin.playbackEngine = playbackEngine;
    plugin.autoDJ = {
      recordFailedTrack: jest.fn(),
      recordSourceFailure: jest.fn(() => ({ failureClass: 'transient' })),
      markPlaybackFailed: jest.fn(),
      setPlaybackSeed: jest.fn()
    };
    plugin.queueManager = {
      markPlaying: jest.fn(),
      resetVoteSkips: jest.fn(),
      addToHistory: jest.fn(),
      removeSkipImmunity: jest.fn()
    };
    plugin._stopPlaybackSync = jest.fn();
    plugin._startPlaybackSync = jest.fn();
    plugin._clearCrossfadeTimer = jest.fn();
    plugin._maybePlayAutoDJ = jest.fn(async () => {
      const nextTrack = plugin._maybePlayAutoDJ.mock.calls.length === 1 ? secondTrack : thirdTrack;
      playbackEngine.nowPlaying = nextTrack;
      playbackEngine.state = 'playing';
      playbackEngine.emit('track-start', nextTrack);
      return nextTrack;
    });
    plugin._registerPlaybackEvents();

    playbackEngine._handleMessage(JSON.stringify({
      event: 'end-file',
      reason: 'error',
      error: 'A failed'
    }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(playbackEngine.getNowPlaying()).toBe(secondTrack);
    expect(playbackEngine._replacementOutgoingTrack).toBeNull();

    playbackEngine._handleMessage(JSON.stringify({
      event: 'end-file',
      reason: 'error',
      error: 'B failed'
    }));
    await new Promise((resolve) => setImmediate(resolve));

    expect(plugin.autoDJ.recordSourceFailure).toHaveBeenNthCalledWith(1, firstTrack, expect.any(Error));
    expect(plugin.autoDJ.recordSourceFailure).toHaveBeenNthCalledWith(2, secondTrack, expect.any(Error));
    expect(plugin.autoDJ.recordFailedTrack).not.toHaveBeenCalled();
    expect(plugin._maybePlayAutoDJ).toHaveBeenCalledTimes(2);
    expect(playbackEngine.getNowPlaying()).toBe(thirdTrack);
    expect(api.emit).toHaveBeenCalledWith('musicbot:error', expect.objectContaining({
      message: expect.stringContaining('Auto-DJ B')
    }));
    expect(api.emit).toHaveBeenCalledWith('musicbot:playback-stopped', {});
  });

  test('ignores an untracked MPV error after playback is already idle', () => {
    const { plugin, api } = createPluginWithQueue([]);
    const playbackEngine = new (require('events'))();
    playbackEngine.getNowPlaying = jest.fn(() => null);
    plugin.playbackEngine = playbackEngine;
    plugin._clearCrossfadeTimer = jest.fn();
    plugin._emitError = jest.fn();
    plugin._emitPlaybackStopped = jest.fn();
    plugin._registerPlaybackEvents();

    playbackEngine.emit('track-end', {
      track: null,
      reason: 'error',
      error: 'Late untracked MPV error'
    });

    expect(plugin._clearCrossfadeTimer).not.toHaveBeenCalled();
    expect(plugin._emitError).not.toHaveBeenCalled();
    expect(plugin._emitPlaybackStopped).not.toHaveBeenCalled();
    expect(api.emit).not.toHaveBeenCalledWith('musicbot:error', expect.anything());
  });

  test('publishes idle runtime health after a viewer track ends with an MPV error', () => {
    const { plugin, api } = createPluginWithQueue([]);
    const playbackEngine = new (require('events'))();
    playbackEngine.getNowPlaying = jest.fn(() => null);
    playbackEngine.getState = jest.fn(() => 'idle');
    playbackEngine.getSnapshot = jest.fn(() => ({
      lifecycle: 'active',
      safetyLock: false,
      transportState: 'idle',
      activePlaybackId: null,
      activeSlot: null,
      slots: { A: null, B: null },
      healthy: true,
      lastError: { message: 'decoder failed' }
    }));
    plugin.playbackEngine = playbackEngine;
    plugin.autoDJ = { markPlaybackFailed: jest.fn() };
    plugin._clearCrossfadeTimer = jest.fn();
    plugin._stopPlaybackSync = jest.fn();
    plugin._registerPlaybackEvents();
    api.emit.mockClear();

    playbackEngine.emit('track-end', {
      track: { id: 'viewer-error', title: 'Viewer error', requestedBy: 'viewer' },
      reason: 'error',
      error: 'decoder failed'
    });

    expect(api.emit).toHaveBeenCalledWith('musicbot:runtime', expect.objectContaining({
      transportState: 'idle',
      activePlaybackId: null,
      slots: { A: null, B: null }
    }));
    expect(api.emit).toHaveBeenCalledWith('musicbot:health', expect.objectContaining({
      state: 'idle',
      activePlayers: 0
    }));
  });

  test('publishes cleaned runtime health after the active MPV process crashes', () => {
    const { plugin, api } = createPluginWithQueue([]);
    const playbackEngine = new (require('events'))();
    let current = { id: 'viewer-crash', title: 'Viewer crash', requestedBy: 'viewer' };
    playbackEngine.getNowPlaying = jest.fn(() => current);
    playbackEngine.getState = jest.fn(() => current ? 'playing' : 'idle');
    playbackEngine.clearNowPlaying = jest.fn(() => {
      current = null;
    });
    playbackEngine.getSnapshot = jest.fn(() => ({
      lifecycle: 'active',
      safetyLock: false,
      transportState: current ? 'playing' : 'idle',
      activePlaybackId: current?.id || null,
      activeSlot: current ? 'A' : null,
      slots: current ? { A: { pid: 1234, state: 'crashed' }, B: null } : { A: null, B: null },
      healthy: !current,
      lastError: current ? { message: 'mpv crashed' } : null
    }));
    plugin.playbackEngine = playbackEngine;
    plugin._registerPlaybackEvents();
    api.emit.mockClear();

    playbackEngine.emit('crashed', { code: 1 });

    expect(playbackEngine.clearNowPlaying).toHaveBeenCalledTimes(1);
    expect(api.emit).toHaveBeenCalledWith('musicbot:runtime', expect.objectContaining({
      transportState: 'idle',
      activePlaybackId: null,
      slots: { A: null, B: null }
    }));
    expect(api.emit).toHaveBeenCalledWith('musicbot:health', expect.objectContaining({
      state: 'idle',
      activePlayers: 0
    }));
  });

  test('records and drops a requested song when MPV rejects its start command', async () => {
    const queued = [{ id: 'requested', title: 'Requested Song', url: 'https://example.test/requested.mp3' }];
    const { plugin } = createPluginWithQueue(queued);
    plugin._mpvAvailable = true;
    plugin.playbackEngine.play = jest.fn(async () => {
      throw new Error('mpv did not acknowledge command: set_property');
    });
    plugin._emitError = jest.fn();
    plugin._emitQueue = jest.fn();
    plugin.queueManager.addToHistory = jest.fn();

    const result = await plugin._playNextFromQueue();

    expect(result.success).toBe(false);
    expect(plugin.queueManager.returnToFront).not.toHaveBeenCalled();
    expect(plugin.queueManager.addToHistory).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'requested', playbackFailed: true }),
      true
    );
    expect(queued).toHaveLength(0);
  });

  test('keeps music ducked for the full TTS playback and ignores duplicate start events', async () => {
    const { EventEmitter } = require('events');
    const { plugin } = createPluginWithQueue([]);
    plugin.api.pluginLoader = new EventEmitter();
    plugin.playbackEngine = {
      beginDucking: jest.fn(async () => {}),
      endDucking: jest.fn(async () => {}),
      triggerDucking: jest.fn(async () => {})
    };

    plugin._registerDuckingHooks();
    await plugin._ttsDuckingHandlers.ttsStarted({ id: 'tts-1' });
    await plugin._ttsDuckingHandlers.ttsStarted({ id: 'tts-1' });
    await plugin._ttsDuckingHandlers.ttsEnded({ id: 'tts-1' });

    expect(plugin.playbackEngine.beginDucking).toHaveBeenCalledTimes(1);
    expect(plugin.playbackEngine.endDucking).toHaveBeenCalledTimes(1);
    expect(plugin.playbackEngine.triggerDucking).not.toHaveBeenCalled();
  });

  test('does not emit a stale playback sync after the active track changes', async () => {
    const firstTrack = { id: 'first', title: 'First Song', startedAt: Date.now(), duration: 180 };
    const secondTrack = { id: 'second', title: 'Second Song', startedAt: Date.now(), duration: 180 };
    const { plugin, api } = createPluginWithQueue([]);
    let activeTrack = firstTrack;
    let resolveHeartbeat;
    let syncCallback;
    const setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation((callback) => {
      syncCallback = callback;
      return 123;
    });

    plugin.playbackEngine = {
      getNowPlaying: jest.fn(() => activeTrack),
      heartbeat: jest.fn(() => new Promise((resolve) => { resolveHeartbeat = resolve; })),
      getState: jest.fn(() => 'playing')
    };

    try {
      plugin._startPlaybackSync();
      const pendingSync = syncCallback();
      activeTrack = secondTrack;
      resolveHeartbeat({ ok: true, action: 'healthy', position: 5 });
      await pendingSync;

      expect(api.emit).not.toHaveBeenCalledWith('musicbot:playback-sync', expect.anything());
    } finally {
      plugin._stopPlaybackSync();
      setIntervalSpy.mockRestore();
    }
  });

  test('does not emit a stale playback sync when Auto-DJ tracks have no source ID', async () => {
    const firstTrack = { title: 'First Auto-DJ Song', startedAt: Date.now(), duration: 180 };
    const secondTrack = { title: 'Second Auto-DJ Song', startedAt: Date.now(), duration: 180 };
    const { plugin, api } = createPluginWithQueue([]);
    let activeTrack = firstTrack;
    let resolveHeartbeat;
    let syncCallback;
    const setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation((callback) => {
      syncCallback = callback;
      return 456;
    });

    plugin.playbackEngine = {
      getNowPlaying: jest.fn(() => activeTrack),
      heartbeat: jest.fn(() => new Promise((resolve) => { resolveHeartbeat = resolve; })),
      getState: jest.fn(() => 'playing')
    };

    try {
      plugin._startPlaybackSync();
      const pendingSync = syncCallback();
      activeTrack = secondTrack;
      resolveHeartbeat({ ok: true, action: 'healthy', position: 5 });
      await pendingSync;

      expect(api.emit).not.toHaveBeenCalledWith('musicbot:playback-sync', expect.anything());
    } finally {
      plugin._stopPlaybackSync();
      setIntervalSpy.mockRestore();
    }
  });

  test('adopts the current runtime playback identity, ignores stale syncs, and freezes seek previews', async () => {
    jest.useFakeTimers();
    try {
      const { dom, socketHandlers } = bootMusicBotUi({
        statusPayload: {
          nowPlaying: {
            id: 'old-track', playbackId: 'old-playback', title: 'Old Song', duration: 120,
            startedAt: Date.now(), state: 'playing', seekable: true
          },
          runtime: { activePlaybackId: 'old-playback', transportState: 'playing', safetyLock: false }
        }
      });
      doms.push(dom);
      await Promise.resolve();
      await Promise.resolve();

      socketHandlers['musicbot:now-playing']({
        id: 'new-track', title: 'New Song', duration: 120, startedAt: Date.now(), state: 'playing', seekable: true
      });
      socketHandlers['musicbot:runtime']({ activePlaybackId: 'playback-77', transportState: 'playing', safetyLock: false });
      socketHandlers['musicbot:playback-sync']({ playbackId: 'old-playback', position: 3, duration: 120, state: 'playing' });
      socketHandlers['musicbot:playback-sync']({ playbackId: 'playback-77', position: 42, duration: 120, state: 'playing' });

      const seek = dom.window.document.getElementById('np-seek-input');
      expect(seek.disabled).toBe(false);
      expect(seek.value).toBe('42');

      seek.value = '55';
      seek.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      jest.advanceTimersByTime(1000);
      expect(seek.value).toBe('55');
      expect(seek.getAttribute('aria-valuetext')).toContain('0:55');

      socketHandlers['musicbot:playback-advancing']({ reason: 'track-end' });
      expect(seek.disabled).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test('renders playlist import socket status, progress, and errors from the service payload', async () => {
    const { dom, socketHandlers } = bootMusicBotUi();
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 25));
    await Promise.resolve();

    socketHandlers['musicbot:playlist-import-progress']({ playlistId: 'mix', status: 'running', progress: 70 });
    expect(dom.window.document.getElementById('playlist-import-progress').textContent).toBe('Import läuft … (70%)');
    socketHandlers['musicbot:playlist-import-progress']({ playlistId: 'mix', status: 'failed', progress: 100, error: 'source unavailable' });
    expect(dom.window.document.getElementById('playlist-import-progress').textContent).toBe('Import error: source unavailable');
  });

  test('keeps canonical votes fresh across duplicate history rows while preserving per-event bans', async () => {
    const historyPayload = [
      { id: 'event-new', songId: 7, title: 'Same Song', feedback: 'down', banned: true },
      { id: 'event-old', songId: 7, title: 'Same Song', feedback: 'down', banned: false }
    ];
    const { dom, socketHandlers, fetchMock } = bootMusicBotUi({
      historyPayload,
      postHandler: async (target) => target.includes('/catalog/songs/7/feedback')
        ? createJsonResponse({ success: true, feedback: { state: 'up' } })
        : createJsonResponse({ success: true })
    });
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 25));

    socketHandlers['musicbot:history-update']({ songId: 7, feedback: { state: 'up' } });
    expect(Array.from(dom.window.document.querySelectorAll('[data-history-feedback="up"].is-active'))).toHaveLength(2);
    expect(Array.from(dom.window.document.querySelectorAll('.history-ban-badge'))).toHaveLength(1);

    dom.window.document.querySelector('[data-history-feedback="up"]').click();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/catalog/songs/7/feedback'), expect.objectContaining({ method: 'POST' }));
    expect(Array.from(dom.window.document.querySelectorAll('[data-history-feedback="up"].is-active'))).toHaveLength(2);
    expect(Array.from(dom.window.document.querySelectorAll('.history-ban-badge'))).toHaveLength(1);
  });

  test('sends history filters as a fresh query and replays a selected event into the queue', async () => {
    const { dom, fetchMock } = bootMusicBotUi({
      historyPayload: [{
        id: 'event-1', songId: 4, title: 'Filtered history song', requestedBy: 'Viewer',
        url: 'https://www.youtube.com/watch?v=history01', outcome: 'failed'
      }],
      postHandler: async (target) => target.includes('/history/event-1/replay')
        ? createJsonResponse({ success: true, mode: 'queue', song: { id: 4, title: 'Filtered history song' } })
        : createJsonResponse({ success: true })
    });
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 25));

    const document = dom.window.document;
    document.getElementById('history-search').value = 'filtered';
    document.getElementById('history-period').value = '7d';
    document.getElementById('history-outcome').value = 'failed';
    document.getElementById('history-feedback-filter').value = 'down';
    document.getElementById('history-banned').value = 'only';
    document.getElementById('history-sort').value = 'finished_asc';
    document.getElementById('history-search').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 260));

    const historyCalls = fetchMock.mock.calls
      .filter(([target]) => String(target).includes('/plugins/music-bot/history?'));
    const query = new URL(historyCalls.at(-1)[0], 'http://localhost').searchParams;
    expect(query.get('q')).toBe('filtered');
    expect(query.get('outcome')).toBe('failed');
    expect(query.get('feedback')).toBe('down');
    expect(query.get('banned')).toBe('only');
    expect(query.get('sort')).toBe('finished_asc');
    expect(query.get('from')).toBeTruthy();
    expect(query.get('to')).toBeTruthy();

    document.querySelector('[data-history-replay="queue"]').click();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const replayCall = fetchMock.mock.calls.find(([target]) => String(target).includes('/history/event-1/replay'));
    expect(replayCall).toBeDefined();
    expect(JSON.parse(replayCall[1].body)).toEqual({ mode: 'queue' });
  });

  test('keeps only the latest catalog search result when responses resolve out of order', async () => {
    let resolveFirst;
    let resolveSecond;
    const firstResponse = new Promise((resolve) => { resolveFirst = resolve; });
    const secondResponse = new Promise((resolve) => { resolveSecond = resolve; });
    const { dom, fetchMock } = bootMusicBotUi({
      fetchHandler: (target) => {
        if (!target.includes('/catalog/search?')) return undefined;
        const query = new URL(target, 'http://localhost').searchParams.get('q');
        if (query === 'first') return firstResponse;
        if (query === 'second') return secondResponse;
        return undefined;
      }
    });
    doms.push(dom);
    const search = dom.window.document.getElementById('catalog-search-input');

    search.value = 'first';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 225));
    search.value = 'second';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 225));

    const searchQueries = fetchMock.mock.calls
      .filter(([target]) => String(target).includes('/catalog/search?'))
      .map(([target]) => new URL(target, 'http://localhost').searchParams.get('q'));
    expect(searchQueries).toEqual(['first', 'second']);

    resolveSecond(createJsonResponse({
      success: true,
      songs: [{ id: 2, title: 'Second result', artist: 'Latest Artist', genres: [] }]
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    resolveFirst(createJsonResponse({
      success: true,
      songs: [{ id: 1, title: 'First result', artist: 'Older Artist', genres: [] }]
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const results = dom.window.document.getElementById('catalog-search-results').textContent;
    expect(results).toContain('Second result');
    expect(results).toContain('Latest Artist');
    expect(results).not.toContain('First result');
  });

  test('invalidates a pending catalog search when the query is cleared', async () => {
    let resolvePending;
    const pendingResponse = new Promise((resolve) => { resolvePending = resolve; });
    const { dom } = bootMusicBotUi({
      fetchHandler: (target) => {
        if (!target.includes('/catalog/search?')) return undefined;
        const query = new URL(target, 'http://localhost').searchParams.get('q');
        return query === 'pending' ? pendingResponse : undefined;
      }
    });
    doms.push(dom);
    const search = dom.window.document.getElementById('catalog-search-input');

    search.value = 'pending';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 225));
    search.value = '';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    resolvePending(createJsonResponse({
      success: true,
      songs: [{ id: 3, title: 'Pending result', artist: 'Pending Artist', genres: [] }]
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const results = dom.window.document.getElementById('catalog-search-results');
    expect(results.textContent).toBe('');
    expect(results.classList.contains('empty')).toBe(true);
  });

  test('groups catalog title and artist in a narrow-screen-safe result row', async () => {
    const { dom } = bootMusicBotUi({
      catalogPayload: [{
        id: 4,
        title: 'A deliberately long catalog title for narrow screens',
        artist: 'A deliberately long credited artist name',
        genres: ['electronic']
      }]
    });
    doms.push(dom);
    const search = dom.window.document.getElementById('catalog-search-input');

    search.value = 'long';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 225));

    const row = dom.window.document.querySelector('.catalog-search-result');
    const info = row?.querySelector('.catalog-search-result-info');
    expect(row).not.toBeNull();
    expect(info?.querySelector('.queue-title').textContent).toBe('A deliberately long catalog title for narrow screens');
    expect(info?.querySelector('.queue-meta').textContent).toBe('A deliberately long credited artist name');

    const css = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/assets/ui-style.css'), 'utf8');
    expect(css).toMatch(/\.catalog-search-result\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(css).toMatch(/\.catalog-search-result-info\s*\{[^}]*flex:\s*1\s+1/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*440px\)[\s\S]*?\.catalog-search-result-info[^}]*flex-basis:\s*100%/);
    expect(css).toMatch(/@media\s*\(max-width:\s*440px\)[\s\S]*?\.catalog-search-result\s*>\s*\.btn[^}]*flex:\s*1\s+1/s);
  });

  test.each(['en', 'es', 'fr'])('renders dynamic catalog-admin surfaces through production i18n in %s', async (locale) => {
    const translations = JSON.parse(fs.readFileSync(path.join(__dirname, `../plugins/music-bot/locales/${locale}.json`), 'utf8'));
    const playlist = { id: 'viewer-radio', name: 'Viewer Radio', mode: 'ordered', itemCount: 1, isProtected: true };
    const { dom, socketHandlers } = bootMusicBotUi({
      translations,
      historyPayload: [{ id: 'event-1', songId: 4, title: 'History Song', feedback: 'up', banned: true }],
      playlistsPayload: [playlist],
      playlistDetails: { 'viewer-radio': { ...playlist, items: [{ songId: 4, title: 'History Song' }] } },
      radioSourcesPayload: [{ playlistId: 'viewer-radio', name: 'Viewer Radio', enabled: true, weight: 3 }],
      catalogPayload: [{ id: 4, title: 'Catalog Song' }]
    });
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 25));
    const ui = musicBotUi(translations);

    expect(dom.window.document.querySelector('.history-ban-badge').textContent).toBe(ui.history.historyBanned);
    expect(dom.window.document.querySelector('[data-track-ban-trigger]').getAttribute('aria-label')).toBe(ui.history.banTrack);
    expect(dom.window.document.querySelector('[data-playlist-id]').textContent).toContain(ui.playlists.protected);
    expect(dom.window.document.querySelector('[data-playlist-id]').textContent).toContain(ui.playlists.ordered);
    expect(dom.window.document.querySelector('[data-radio-weight]').getAttribute('aria-label')).toBe(ui.playlists.radioWeight);

    dom.window.document.querySelector('[data-playlist-id]').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dom.window.document.getElementById('playlist-save-btn').textContent).toBe(ui.playlists.save);
    expect(dom.window.document.querySelector('[data-playlist-remove-song]').getAttribute('aria-label')).toBe(ui.playlists.remove);

    const search = dom.window.document.getElementById('catalog-search-input');
    search.value = 'Catalog';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(dom.window.document.querySelector('[data-catalog-add-song]').textContent).toBe(ui.catalog.addToPlaylist);
    socketHandlers['musicbot:playlist-import-progress']({ playlistId: 'viewer-radio', status: 'running', progress: 70 });
    expect(dom.window.document.getElementById('playlist-import-progress').textContent).toBe(`${ui.playlists.importRunning} (70%)`);
    socketHandlers['musicbot:playlist-import-progress']({ playlistId: 'viewer-radio', status: 'completed', progress: 100 });
    expect(dom.window.document.getElementById('playlist-import-progress').textContent).toBe(`${ui.playlists.importCompleted} (100%)`);
    socketHandlers['musicbot:playlist-import-progress']({ playlistId: 'viewer-radio', status: 'aborted', progress: 100 });
    expect(dom.window.document.getElementById('playlist-import-progress').textContent).toBe(`${ui.playlists.importAborted} (100%)`);
    socketHandlers['musicbot:playlist-import-progress']({ playlistId: 'viewer-radio', status: 'failed', error: 'offline' });
    expect(dom.window.document.getElementById('playlist-import-progress').textContent).toBe(ui.playlists.importError.replace('{error}', 'offline'));
    socketHandlers['musicbot:now-playing']({ id: 'seek', playbackId: 'seek-1', title: 'Seek', duration: 120, startedAt: Date.now(), state: 'playing', seekable: true });
    socketHandlers['musicbot:runtime']({ activePlaybackId: 'seek-1', transportState: 'playing', safetyLock: false });
    socketHandlers['musicbot:playback-sync']({ playbackId: 'seek-1', position: 20, duration: 120, state: 'playing' });
    expect(dom.window.document.getElementById('np-seek-input').getAttribute('aria-valuetext')).toBe(ui.player.seekAria.replace('{current}', '0:20').replace('{duration}', '2:00'));
  });

  test('localizes normal, empty, error and runtime surfaces with the production merged catalogs', async () => {
    const { dom, socketHandlers } = bootMusicBotUi({
      translations: productionCatalogs,
      productionLocale: 'en',
      autoDjStatus: {
        enabled: true,
        mode: 'mix',
        lastResult: { state: 'selected', message: 'Ausgewaehlt: Runtime Song', params: { title: 'Runtime Song' } }
      }
    });
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 25));

    for (const locale of ['en', 'es', 'fr']) {
      const ui = productionCatalogs[locale].plugins['music-bot'].music_bot.ui;
      dom.window.i18n.currentLocale = locale;
      dom.window.i18n.defaultLocale = locale;
      dom.window.i18n.updateDOM();
      dom.window.document.getElementById('auto-dj-save').click();
      await new Promise((resolve) => setTimeout(resolve, 0));
      dom.window.document.getElementById('musicbot-toast-container').replaceChildren();

      socketHandlers['musicbot:now-playing'](null);
      socketHandlers['musicbot:queue-update']({ queue: [], length: 0 });
      socketHandlers.connect_error();
      socketHandlers['musicbot:error']({});
      socketHandlers['musicbot:paused']();
      socketHandlers['musicbot:resumed']();
      socketHandlers['musicbot:playback-advancing']({
        message: 'Lädt den nächsten Titel …',
        messageKey: 'playbackAdvancing'
      });
      socketHandlers['musicbot:resolver']({ progress: { state: 'validating' } });
      socketHandlers['musicbot:health']({
        mpvAvailable: false,
        controllerHealthy: true,
        cache: { bytes: 0, files: 2 },
        lastError: null,
        players: {}
      });

      expect(dom.window.document.getElementById('now-playing').textContent).toContain(ui.player.nowPlayingEmpty);
      expect(dom.window.document.getElementById('queue-list').textContent).toContain(ui.queue.queueEmptyTitle);
      expect(dom.window.document.getElementById('playback-state').textContent).toBe(ui.player.playbackAdvancing);
      expect(dom.window.document.getElementById('skip-btn').textContent).toBe(ui.player.loading);
      expect(dom.window.document.getElementById('search-feedback').textContent).toBe(ui.health.resolverValidating);
      expect(dom.window.document.getElementById('health-mpv').textContent).toBe(ui.health.unavailable);
      expect(dom.window.document.getElementById('health-cache').textContent).toContain(ui.health.files.replace('{count}', '2'));
      expect(dom.window.document.getElementById('health-last-error').textContent).toBe(ui.health.none);
      expect(dom.window.document.getElementById('auto-dj-status').textContent).toBe(ui.autoDj.autoDjActive);
      expect(dom.window.document.getElementById('auto-dj-detail').textContent).toContain(
        ui.autoDj.autoDjSelected.replace('{title}', 'Runtime Song')
      );
      expect(dom.window.document.getElementById('musicbot-toast-container').textContent).toContain(ui.shell.networkTitle);
      expect(dom.window.document.getElementById('musicbot-toast-container').textContent).toContain(ui.shell.unknownError);

      const dynamicSurface = [
        'now-playing', 'queue-list', 'playback-state', 'skip-btn', 'search-feedback',
        'health-mpv', 'health-cache', 'health-last-error', 'auto-dj-status', 'auto-dj-detail',
        'musicbot-toast-container'
      ].map((id) => dom.window.document.getElementById(id)?.textContent || '').join(' ');
      expect(dynamicSurface).not.toMatch(/Aktuell|Warteschlange|Lädt|Pausiert|Wiedergabe|Netzwerk|Verbindung|nicht verfügbar|Dateien|Keiner|Ausgewaehlt/i);
    }
  });

  test('redacts punctuation-wrapped diagnostic secrets without losing ordinary title and artist values', () => {
    const { plugin } = createPluginWithQueue([]);
    plugin.playbackEngine = {
      getState: jest.fn(() => 'error'),
      getNowPlaying: jest.fn(() => ({ id: 'current', title: 'Artist & Title' })),
      getSnapshot: jest.fn(() => ({
        slots: {
          A: {
            state: 'error',
            media: { title: 'Artist & Title' },
            lastError: { message: 'decoder(sig=SECRET) decoder:signature=OTHER_SECRET [token=TOP_SECRET] "sig=QUOTED_SECRET"|/token=PIPE_SECRET>signature=ANGLE_SECRET stream?expire=999&x-amz-signature=AWS_SECRET' }
          }
        },
        lastError: { message: 'stream token=TOP_SECRET ip=127.0.0.1' }
      }))
    };
    plugin.musicResolver = {
      getSnapshot: jest.fn(() => ({
        progress: { error: 'videoplayback&signature=OTHER_SECRET&key=KEY_SECRET' }
      }))
    };
    plugin._stateTransitions = [{ details: 'retry lsig=LSIG_SECRET credential=CREDENTIAL_SECRET' }];

    const diagnostics = plugin._buildDiagnosticsPayload();
    const health = plugin._buildHealthPayload(diagnostics.runtime, diagnostics.resolver);
    const serialized = JSON.stringify({ diagnostics, health });

    const ordinary = plugin._sanitizeDiagnosticValue({
      title: 'Key=Love',
      artist: 'Token = Love',
      displayName: 'The key=Love',
      error: 'decoder:signature=SECRET'
    });

    expect(serialized).toContain('Artist & Title');
    ['AWS_SECRET', 'OTHER_SECRET', 'TOP_SECRET', 'QUOTED_SECRET', 'PIPE_SECRET', 'ANGLE_SECRET', 'LSIG_SECRET', 'CREDENTIAL_SECRET', '127.0.0.1']
      .forEach((secret) => expect(serialized).not.toContain(secret));
    expect(serialized).toContain('decoder(sig=[redacted])');
    expect(serialized).toContain('decoder:signature=[redacted]');
    expect(serialized).toContain('[token=[redacted]]');
    expect(serialized).toContain('\\"sig=[redacted]\\"|/token=[redacted]>signature=[redacted]');
    expect(ordinary).toEqual({
      title: 'Key=Love',
      artist: 'Token = Love',
      displayName: 'The key=Love',
      error: 'decoder:signature=[redacted]'
    });
  });

  test('rerenders retained dynamic surfaces after the active language changes', async () => {
    const { dom, socketHandlers } = bootMusicBotUi({
      translations: productionCatalogs,
      productionLocale: 'en',
      setupIssues: [{
        id: 'mpv-missing',
        severity: 'error',
        titleKey: 'setupMpvMissingTitle',
        descriptionKey: 'setupMpvMissingDescription',
        oneClickInstall: true,
        installAction: 'mpv',
        installButtonKey: 'installMpv',
        installStatus: { state: 'failed', messageKey: 'mpvInstallFailed' }
      }],
      historyPayload: [{ id: 'event-1', songId: 'song-1', title: 'History title', requestedBy: 'Viewer', feedback: 'up' }],
      playlistsPayload: [{ id: 'playlist-1', name: 'Playlist', mode: 'ordered', itemCount: 1 }],
      playlistDetails: { 'playlist-1': { id: 'playlist-1', name: 'Playlist', mode: 'ordered', revision: 1, items: [] } },
      radioSourcesPayload: [{ playlistId: 'playlist-1', name: 'Playlist', enabled: true, weight: 3 }],
      autoDjStatus: { enabled: true, mode: 'history', lastResult: { state: 'playing' } }
    });
    doms.push(dom);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (dom.window.document.getElementById('history-list').textContent.includes('History title')) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(dom.window.document.getElementById('history-list').textContent).toContain('History title');

    socketHandlers['musicbot:queue-update']({ queue: [{ id: 'queue-1', title: 'Queue title' }], length: 1 });
    socketHandlers['musicbot:health']({ state: 'playing', mpvAvailable: true, controllerHealthy: true, players: {} });
    socketHandlers['musicbot:status-toast']({
      type: 'success',
      titleKey: 'songAddedTitle',
      messageKey: 'requestAdded',
      params: { title: 'Toast title', position: 2 }
    });
    const document = dom.window.document;
    const playlistButton = document.querySelector('[data-playlist-id="playlist-1"]');
    playlistButton.click();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (document.getElementById('playlist-name-input')?.value === 'Playlist') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    document.getElementById('playlist-name-input').value = 'Unsaved playlist name';
    document.getElementById('playlist-mode-input').value = 'shuffle';
    const radioEnabled = document.querySelector('[data-radio-playlist-id="playlist-1"]');
    const radioWeight = document.querySelector('[data-radio-weight="playlist-1"]');
    radioEnabled.checked = false;
    radioWeight.value = '';
    document.getElementById('auto-dj-enabled').checked = false;
    document.getElementById('auto-dj-mode').value = 'random';
    document.getElementById('auto-dj-max-consecutive').value = '';
    await dom.window.i18n.setLocale('es');

    expect(dom.window.document.getElementById('queue-list').textContent).toContain('Espectador');
    expect(dom.window.document.getElementById('history-list').textContent).toContain('Me gusta');
    expect(dom.window.document.getElementById('playlist-list').textContent).toContain('En orden');
    expect(dom.window.document.getElementById('auto-dj-status').textContent).toBe('Reproduciendo');
    expect(dom.window.document.getElementById('health-mpv').textContent).toBe('listo');
    expect(dom.window.document.getElementById('setup-issues-list').textContent).not.toContain('mpv Media Player nicht gefunden');
    expect(document.getElementById('playlist-name-input').value).toBe('Unsaved playlist name');
    expect(document.getElementById('playlist-mode-input').value).toBe('shuffle');
    expect(document.querySelector('[data-radio-playlist-id="playlist-1"]').checked).toBe(false);
    expect(document.querySelector('[data-radio-weight="playlist-1"]').value).toBe('');
    expect(document.getElementById('auto-dj-enabled').checked).toBe(false);
    expect(document.getElementById('auto-dj-mode').value).toBe('random');
    expect(document.getElementById('auto-dj-max-consecutive').value).toBe('');
    expect(document.getElementById('musicbot-toast-container').textContent).toContain('Canción añadida');
    expect(document.getElementById('musicbot-toast-container').textContent).toContain('Toast title');
  });

  test('uses roving tab focus and semantic panel visibility for keyboard navigation', async () => {
    const { dom } = bootMusicBotUi();
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 25));

    const document = dom.window.document;
    const player = document.getElementById('musicbot-tab-player');
    const queue = document.getElementById('musicbot-tab-queue');
    const overlay = document.getElementById('musicbot-tab-overlay');
    const playerPanel = document.getElementById('musicbot-panel-player');
    const queuePanel = document.getElementById('musicbot-panel-queue');
    const overlayPanel = document.getElementById('musicbot-panel-overlay');

    player.focus();
    player.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(queue);
    expect(queue.getAttribute('tabindex')).toBe('0');
    expect(queue.getAttribute('aria-selected')).toBe('true');
    expect(queuePanel.hidden).toBe(false);
    expect(queuePanel.getAttribute('aria-hidden')).toBe('false');
    expect(playerPanel.hidden).toBe(true);

    queue.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(overlay);
    expect(overlay.getAttribute('tabindex')).toBe('0');
    expect(overlay.getAttribute('aria-selected')).toBe('true');
    expect(overlayPanel.hidden).toBe(false);

    overlay.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(player);
    expect(player.getAttribute('tabindex')).toBe('0');
    expect(player.getAttribute('aria-selected')).toBe('true');
    expect(playerPanel.hidden).toBe(false);

    player.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(overlay);
    expect(overlay.getAttribute('aria-selected')).toBe('true');

    overlay.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(player);
    expect(player.getAttribute('aria-selected')).toBe('true');
  });

  test('emits semantic ban and queue-rejection payloads for dashboard and chat requests', async () => {
    const { plugin, emitted } = createPluginWithQueue([]);
    const song = { title: 'Blocked track', url: 'https://example.test/track' };
    plugin.musicResolver = { resolve: jest.fn(async () => ({ success: true, song })) };
    plugin.banList = {
      isUserBanned: jest.fn(() => ({ banned: false })),
      isUrlBanned: jest.fn(() => ({ banned: true })),
      isTrackBanned: jest.fn(() => ({ banned: false })),
      isArtistBanned: jest.fn(() => ({ banned: false })),
      isKeywordBanned: jest.fn(() => ({ banned: false })),
      isChannelBanned: jest.fn(() => ({ banned: false }))
    };

    const dashboard = await plugin._handleDashboardRequest('blocked', 'dashboard');
    expect(dashboard).toEqual(expect.objectContaining({
      success: false,
      messageKey: 'banSong',
      params: expect.any(Object)
    }));
    expect(dashboard.error).toBe('Dieser Song ist gesperrt.');
    expect(emitted.find((entry) => entry.event === 'musicbot:status-toast')?.payload)
      .toEqual(expect.objectContaining({ titleKey: 'songBlockedTitle', messageKey: 'banSong' }));

    emitted.length = 0;
    plugin.banList.isUrlBanned.mockReturnValue({ banned: false });
    plugin.queueManager.addSong = jest.fn(() => ({
      success: false,
      error: 'Queue is full',
      messageKey: 'queueFull',
      params: { maxLength: 10 }
    }));
    await plugin._handleRequest('queue full', 'viewer');
    expect(emitted.find((entry) => entry.event === 'musicbot:status-toast')?.payload)
      .toEqual(expect.objectContaining({ titleKey: 'requestRejectedTitle', messageKey: 'queueFull', params: { maxLength: 10 } }));
  });

  test('prefers a semantic dashboard rejection over its legacy error text', async () => {
    const { dom } = bootMusicBotUi({
      translations: productionCatalogs,
      productionLocale: 'es',
      postHandler: (target) => target.endsWith('/request')
        ? createJsonResponse({ success: false, error: 'Dieser Song ist gesperrt.', messageKey: 'banSong', params: {} })
        : createJsonResponse({ success: true })
    });
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 25));
    dom.window.document.getElementById('search-input').value = 'blocked';
    dom.window.document.getElementById('request-btn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dom.window.document.getElementById('request-feedback').textContent).toContain('Esta canción está bloqueada.');
    expect(dom.window.document.getElementById('request-feedback').textContent).not.toContain('Dieser Song ist gesperrt.');
  });

  test('emits semantic setup issue and MPV status codes instead of German UI text', () => {
    const { plugin } = createPluginWithQueue([]);
    plugin._ytdlpAvailable = false;
    plugin._mpvAvailable = false;
    plugin._mpvInstallStatus = {
      state: 'failed',
      message: 'Installation fehlgeschlagen.',
      command: 'winget install mpv'
    };

    const issues = plugin._getSetupIssues();
    const mpvIssue = issues.find((issue) => issue.id === 'mpv-missing');
    const ytdlpIssue = issues.find((issue) => issue.id === 'ytdlp-missing');

    expect(mpvIssue).toEqual(expect.objectContaining({
      titleKey: 'setupMpvMissingTitle',
      descriptionKey: 'setupMpvMissingDescription',
      installButtonKey: 'installMpv',
      installStatus: expect.objectContaining({ messageKey: 'mpvInstallFailed' })
    }));
    expect(ytdlpIssue).toEqual(expect.objectContaining({
      titleKey: 'setupYtdlpMissingTitle',
      descriptionKey: 'setupYtdlpMissingDescription'
    }));
    expect(mpvIssue.title).toBeUndefined();
    expect(ytdlpIssue.description).toBeUndefined();
  });

  test('preserves user data while emitting producer-owned toast copy as semantic keys', () => {
    const { plugin, emitted } = createPluginWithQueue([]);

    plugin._emitToast('success', {
      titleKey: 'songAddedTitle',
      messageKey: 'requestAdded',
      params: { title: 'Viewer supplied & title', position: 1 }
    });

    const toast = emitted.find((entry) => entry.event === 'musicbot:status-toast')?.payload;
    expect(toast).toEqual(expect.objectContaining({
      titleKey: 'songAddedTitle',
      messageKey: 'requestAdded',
      params: { title: 'Viewer supplied & title', position: 1 }
    }));
    expect(toast.title).toBeUndefined();
    expect(toast.message).toBeUndefined();
  });

  test.each(['de', 'en', 'es', 'fr'])('renders the live gift count and metadata from placeholders in %s', async (locale) => {
    const translations = JSON.parse(fs.readFileSync(path.join(__dirname, `../plugins/music-bot/locales/${locale}.json`), 'utf8'));
    const { dom } = bootMusicBotUi({
      translations,
      giftCatalogPayload: {
        catalog: [
          { name: 'Rose', diamond_count: 1 },
          { name: 'Heart', diamond_count: 5 },
          { name: 'Crown', diamond_count: 100 }
        ],
        locales: ['en', 'de'],
        region: 'EU'
      }
    });
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 25));

    const ui = musicBotUi(translations);
    expect(ui.settings.giftsCount).toContain('{count}');
    expect(ui.settings.giftLocales).toEqual(expect.any(String));
    expect(ui.settings.giftRegion).toEqual(expect.any(String));
    expect(dom.window.document.getElementById('gift-catalog-count').textContent)
      .toBe(ui.settings.giftsCount.replace('{count}', '3'));
    expect(dom.window.document.getElementById('gift-catalog-status').textContent)
      .toContain(ui.settings.giftLocales.replace('{locales}', 'en, de'));
    expect(dom.window.document.getElementById('gift-catalog-status').textContent)
      .toContain(ui.settings.giftRegion.replace('{region}', 'EU'));
  });

  test.each(['de', 'en', 'es', 'fr'])('renders overlay copy success through the %s locale catalog', async (locale) => {
    const expectedCopy = {
      de: '✅ Kopiert!',
      en: '✅ Copied!',
      es: '✅ ¡Copiado!',
      fr: '✅ Copié !'
    };
    const translations = JSON.parse(fs.readFileSync(path.join(__dirname, `../plugins/music-bot/locales/${locale}.json`), 'utf8'));
    const { dom } = bootMusicBotUi({ translations });
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 25));

    const copyButton = dom.window.document.getElementById('overlay-copy');
    copyButton.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(musicBotUi(translations).overlay.copySuccess).toBe(expectedCopy[locale]);
    expect(copyButton.textContent).toBe(expectedCopy[locale]);
  });

  test.each(['de', 'en', 'es', 'fr'])('reconciles every canonical ban type with localized %s UI output', async (locale) => {
    const typeToKey = {
      url: 'url', keyword: 'keyword', channel: 'channel', user: 'user', artist: 'artist', track: 'exactTrack'
    };
    const canonicalTypes = readCanonicalBanTypes();
    expect([...canonicalTypes].sort()).toEqual(Object.keys(typeToKey).sort());
    const translations = JSON.parse(fs.readFileSync(path.join(__dirname, `../plugins/music-bot/locales/${locale}.json`), 'utf8'));
    const { dom } = bootMusicBotUi({
      translations,
      bansPayload: canonicalTypes.map((type, index) => ({ id: index + 1, type, value: `${type}:value`, reason: '' }))
    });
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 25));

    const labels = Array.from(dom.window.document.querySelectorAll('#ban-table tbody tr td:first-child'), (cell) => cell.textContent);
    expect(labels).toEqual(canonicalTypes.map((type) => musicBotUi(translations).moderation[typeToKey[type]]));
  });

  test.each(['de', 'en', 'es', 'fr'])('reconciles every produced playlist-import status with localized %s UI output', async (locale) => {
    const expectedQueued = {
      de: 'Import wartet …',
      en: 'Import queued …',
      es: 'Importación en espera …',
      fr: 'Import en attente…'
    };
    const statusToKey = {
      queued: 'importQueued', running: 'importRunning', completed: 'importCompleted', aborted: 'importAborted', failed: 'importFailed'
    };
    const producedStatuses = readProducedPlaylistImportStatuses();
    expect([...producedStatuses].sort()).toEqual(Object.keys(statusToKey).sort());
    const translations = JSON.parse(fs.readFileSync(path.join(__dirname, `../plugins/music-bot/locales/${locale}.json`), 'utf8'));
    expect(musicBotUi(translations).playlists.importQueued).toBe(expectedQueued[locale]);
    const { dom, socketHandlers } = bootMusicBotUi({ translations });
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 25));

    for (const status of producedStatuses) {
      socketHandlers['musicbot:playlist-import-progress']({ status });
      expect(dom.window.document.getElementById('playlist-import-progress').textContent)
        .toBe(musicBotUi(translations).playlists[statusToKey[status]]);
    }
  });

  test('ships correct Spanish and French sectioned admin orthography', () => {
    const es = musicBotUi(JSON.parse(fs.readFileSync(path.join(__dirname, '../plugins/music-bot/locales/es.json'), 'utf8')));
    const fr = musicBotUi(JSON.parse(fs.readFileSync(path.join(__dirname, '../plugins/music-bot/locales/fr.json'), 'utf8')));

    expect(es.player).toMatchObject({
      seek: 'Posición de reproducción',
      seekUnavailable: 'No se puede cambiar la posición en este momento.',
      seekFailed: 'No se pudo cambiar la posición.'
    });
    expect(es.history.loadMore).toBe('Cargar más');
    expect(es.tabs.catalog).toBe('Catálogo');
    expect(es.catalog).toMatchObject({
      search: 'Buscar títulos, artistas o géneros',
      description: 'Busca y valora canciones anteriores o añádelas a listas.'
    });
    expect(es.playlists).toMatchObject({
      importCompleted: 'Importación completada',
      importError: 'Error de importación: {error}',
      playlistConflict: 'La lista cambió en otro lugar. Actualizando la vista.'
    });
    expect(fr.playlists).toMatchObject({
      description: 'Gérez vos sources et la radio des spectateurs.',
      ordered: 'Dans l’ordre',
      shuffle: 'Aléatoire',
      create: 'Créer',
      radioDescription: 'Activez plusieurs playlists et mélangez-les avec des poids de 1 à 10.',
      importCompleted: 'Import terminé',
      importError: 'Erreur d’import : {error}',
      playlistConflict: 'La playlist a changé ailleurs. Actualisation de la vue.'
    });
    expect(fr.history).toMatchObject({
      historyEmpty: 'Pas encore d’historique.',
      voteUp: 'J’aime'
    });
    expect(fr.catalog).toMatchObject({
      addToPlaylist: 'Ajouter à la liste',
      networkTitle: 'Réseau'
    });
    expect(fr.player.seekUnavailable).toBe('Le déplacement dans le morceau est actuellement indisponible.');
  });

  test.each(['en', 'es', 'fr'])('renders generic POST failures once in %s', async (locale) => {
    const translations = JSON.parse(fs.readFileSync(path.join(__dirname, `../plugins/music-bot/locales/${locale}.json`), 'utf8'));
    const { dom } = bootMusicBotUi({ translations, postHandler: async () => { throw new Error('offline'); } });
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 25));
    const name = dom.window.document.getElementById('playlist-create-name');
    name.value = 'Network test';
    dom.window.document.getElementById('playlist-create-btn').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const toast = dom.window.document.getElementById('musicbot-toast-container').textContent;
    expect(toast).toContain(musicBotUi(translations).catalog.networkTitle);
    expect(toast).toContain(musicBotUi(translations).catalog.postFailed);
  });

  test('rolls a failed seek back once and shows its localized error', async () => {
    const { dom, fetchMock, socketHandlers } = bootMusicBotUi({
      postHandler: async (target) => target.endsWith('/seek')
        ? createJsonResponse({ success: false, error: 'Cannot seek now' })
        : createJsonResponse({ success: true })
    });
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 25));
    socketHandlers['musicbot:now-playing']({ id: 'track', playbackId: 'p1', title: 'Seekable', duration: 120, startedAt: Date.now(), state: 'playing', seekable: true });
    socketHandlers['musicbot:runtime']({ activePlaybackId: 'p1', transportState: 'playing', safetyLock: false });
    socketHandlers['musicbot:playback-sync']({ playbackId: 'p1', position: 20, duration: 120, state: 'playing' });
    const seek = dom.window.document.getElementById('np-seek-input');
    seek.value = '55';
    seek.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seek.value).toBe('20');
    expect(dom.window.document.getElementById('musicbot-toast-container').textContent).toContain('Cannot seek now');
    expect(fetchMock.mock.calls.filter(([url, options]) => String(url).endsWith('/seek') && options?.method === 'POST')).toHaveLength(1);
  });

  test('minimal overlay ignores a stale playback sync from a different title', () => {
    const { dom, socketHandlers } = bootMusicBotOverlay();
    doms.push(dom);

    socketHandlers['musicbot:now-playing']({
      id: 'active-track',
      title: 'Active Song',
      artist: 'Artist',
      duration: 180,
      startedAt: Date.now(),
      state: 'playing'
    });
    socketHandlers['musicbot:playback-sync']({
      title: 'Stale Song',
      artist: 'Other Artist',
      duration: 180,
      position: 10,
      state: 'playing'
    });

    expect(dom.window.document.getElementById('minimal-text').textContent).toContain('Active Song');
    expect(dom.window.document.getElementById('minimal-text').textContent).not.toContain('Stale Song');
  });

  test('minimal overlay ignores an id-less legacy now-playing event after a tracked song starts', () => {
    const { dom, socketHandlers } = bootMusicBotOverlay();
    doms.push(dom);

    socketHandlers['musicbot:now-playing']({
      id: 'active-track',
      title: 'Active Song',
      duration: 180,
      startedAt: Date.now(),
      state: 'playing'
    });
    socketHandlers['musicbot:now-playing']({
      title: 'Legacy Song',
      duration: 180,
      startedAt: Date.now(),
      state: 'playing'
    });

    expect(dom.window.document.getElementById('minimal-text').textContent).toContain('Active Song');
    expect(dom.window.document.getElementById('minimal-text').textContent).not.toContain('Legacy Song');
  });

  test('resolver config updates keep the bundled yt-dlp path for the default setting', () => {
    const bundledPath = require('youtube-dl-exec').constants.YOUTUBE_DL_PATH;
    const resolver = new MusicResolver({ ytdlpPath: 'custom-yt-dlp' }, { log: jest.fn() });

    resolver.updateConfig({
      ytdlpPath: 'yt-dlp',
      moderation: { rejectExplicit: true, blockedKeywords: ['blocked'] }
    });

    expect(resolver.config.ytdlpPath).toBe(bundledPath);
    expect(resolver.config.moderation.rejectExplicit).toBe(true);
    expect(resolver.config.moderation.blockedKeywords).toEqual(['blocked']);
  });

  test('preserves a saved zero for master and source volume', () => {
    const api = {
      getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
      getDatabase: jest.fn(() => ({})),
      getConfig: jest.fn(() => ({ audio: { masterVolume: 0, sourceVolume: 0 } })),
      setConfig: jest.fn()
    };
    const plugin = new MusicBotPlugin(api);

    plugin._loadConfig();

    expect(plugin.config.audio.masterVolume).toBe(0);
    expect(plugin.config.audio.sourceVolume).toBe(0);
    expect(plugin._computeEffectiveVolume()).toBe(0);
  });

  test('rejects direct URLs outside the supported music providers before starting yt-dlp', async () => {
    const resolver = new MusicResolver({ ytdlpPath: 'yt-dlp' }, { log: jest.fn() });

    await expect(resolver.resolve('http://127.0.0.1:3000/internal-status'))
      .rejects.toThrow('Only YouTube and SoundCloud URLs are supported');
  });

  test('keeps YouTube and SoundCloud URLs in the supported direct-request allowlist', () => {
    const resolver = new MusicResolver({ ytdlpPath: 'yt-dlp' }, { log: jest.fn() });

    expect(resolver._isSupportedSourceUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(resolver._isSupportedSourceUrl('https://www.youtube.com/playlist?list=PLScN1UM-Rlxo')).toBe(true);
    expect(resolver._isSupportedSourceUrl('https://soundcloud.com/artist/track')).toBe(true);
  });

  test('resolves one requested YouTube playlist entry without fetching the entire playlist', async () => {
    const resolver = new MusicResolver({ ytdlpPath: 'yt-dlp' }, { log: jest.fn() });
    resolver._runYtDlp = jest.fn(async () => [
      '0',
      'channel-id',
      'Channel',
      "['Music']",
      JSON.stringify({
        id: 'playlist-video',
        title: 'Playlist song',
        webpage_url: 'https://www.youtube.com/watch?v=playlist-video',
        url: 'https://media.example.test/playlist-video.m4a',
        duration: 180
      })
    ].join('\n'));

    const result = await resolver.resolvePlaylistEntry('https://www.youtube.com/playlist?list=PLScN1UM-Rlxo', 3);

    expect(result.song.title).toBe('Playlist song');
    expect(result.song.url).toBe('https://www.youtube.com/watch?v=playlist-video');
    expect(result.song.streamUrl).toBe('https://media.example.test/playlist-video.m4a');
    expect(resolver._runYtDlp.mock.calls[0][0]).toContain('--playlist-items');
    expect(resolver._runYtDlp.mock.calls[0][0]).toContain('3');
    expect(resolver._runYtDlp.mock.calls[0][0]).not.toContain('--no-playlist');
  });

  test('preserves the persisted queue during plugin shutdown', async () => {
    const { plugin } = createPluginWithQueue([]);
    plugin.queueManager = {
      clear: jest.fn(),
      persistQueue: jest.fn()
    };
    plugin.playbackEngine = { shutdown: jest.fn(async () => {}) };

    await plugin.destroy();

    expect(plugin.queueManager.persistQueue).toHaveBeenCalledTimes(1);
    expect(plugin.queueManager.clear).not.toHaveBeenCalled();
  });

  test('wakes the supervisor in the fixed final three-second crossfade interval', () => {
    jest.useFakeTimers();
    try {
      const { plugin } = createPluginWithQueue([]);
      plugin.config.playback.crossfadeDuration = 3000;
      plugin.playbackEngine = {
        getNowPlaying: jest.fn(() => ({ id: 'current', requestedBy: 'AutoDJ' })),
        isPlaying: jest.fn(() => true)
      };
      plugin._playNextFromQueue = jest.fn(async () => ({ success: true }));
      plugin._maybePlayAutoDJ = jest.fn(async () => ({ id: 'next-auto-dj' }));

      plugin._scheduleCrossfadeTransition({ id: 'current', duration: 120 });
      jest.advanceTimersByTime(116999);
      expect(plugin._playNextFromQueue).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(plugin._maybePlayAutoDJ).not.toHaveBeenCalled();
      expect(plugin._playNextFromQueue).toHaveBeenCalledWith('crossfade', {
        allowActiveAutoDJ: true,
        allowActiveViewerAtBoundary: true,
        prefetchGeneration: expect.any(Number)
      });
    } finally {
      jest.useRealTimers();
    }
  });

  test('waits for the Auto-DJ handoff after a skip and returns the next title', async () => {
    const current = { id: 'current', title: 'Current Song', requestedBy: 'viewer' };
    const { plugin, api } = createPluginWithQueue([]);
    const playbackEngine = new (require('events'))();
    playbackEngine.getNowPlaying = jest.fn(() => current);
    playbackEngine.skip = jest.fn(async () => {
      playbackEngine.emit('track-end', { track: current, reason: 'skip' });
    });
    plugin.playbackEngine = playbackEngine;
    plugin.queueManager = {
      addToHistory: jest.fn(),
      removeSkipImmunity: jest.fn(),
      resetVoteSkips: jest.fn()
    };
    plugin._stopPlaybackSync = jest.fn();
    plugin._clearCrossfadeTimer = jest.fn();
    plugin._playNextFromQueue = jest.fn(async () => ({
      success: true,
      song: { id: 'next', title: 'Auto-DJ Next' }
    }));
    plugin._registerPlaybackEvents();

    const result = await plugin._skipCurrent('dashboard');

    expect(plugin._playNextFromQueue).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      next: { id: 'next', title: 'Auto-DJ Next' },
      nextError: null
    });
    expect(api.emit).toHaveBeenCalledWith('musicbot:playback-advancing', expect.objectContaining({
      reason: 'skip'
    }));
  });

  test('routes an Auto-DJ MPV playback error through failure recovery without writing history', async () => {
    const failedTrack = { id: 'failed-track', title: 'Failed Track', requestedBy: 'AutoDJ' };
    const { plugin, api } = createPluginWithQueue([]);
    const playbackEngine = new (require('events'))();
    playbackEngine.getNowPlaying = jest.fn(() => failedTrack);
    plugin.playbackEngine = playbackEngine;
    plugin.queueManager = {
      addToHistory: jest.fn(),
      removeSkipImmunity: jest.fn(),
      resetVoteSkips: jest.fn()
    };
    plugin.autoDJ = { markPlaybackFailed: jest.fn() };
    plugin._stopPlaybackSync = jest.fn();
    plugin._clearCrossfadeTimer = jest.fn();
    plugin._playNextFromQueue = jest.fn(async () => ({ success: true }));
    plugin._handleAutoDJPlaybackFailure = jest.fn(async () => null);
    plugin._emitPlaybackStopped = jest.fn();
    plugin._registerPlaybackEvents();

    playbackEngine.emit('track-end', {
      track: failedTrack,
      reason: 'error',
      error: 'Failed to open stream'
    });
    await Promise.resolve();

    expect(plugin._playNextFromQueue).not.toHaveBeenCalled();
    expect(plugin.queueManager.addToHistory).not.toHaveBeenCalled();
    expect(plugin._handleAutoDJPlaybackFailure).toHaveBeenCalledTimes(1);
    expect(plugin._handleAutoDJPlaybackFailure).toHaveBeenCalledWith(
      failedTrack,
      expect.any(String),
      expect.any(Error)
    );
    expect(api.emit).toHaveBeenCalledWith('musicbot:error', expect.objectContaining({
      message: expect.stringContaining('Failed to open stream')
    }));
  });

  test('advances Auto-DJ after the playback controller retires an errored slot', async () => {
    const { EventEmitter } = require('events');
    const failedTrack = {
      id: 'controller-failed-track',
      title: 'Controller Failed Track',
      url: 'https://example.test/controller-failed.mp3',
      requestedBy: 'AutoDJ'
    };
    const { plugin } = createPluginWithQueue([]);
    const engine = new EventEmitter();
    engine.setVolume = jest.fn(async () => {});
    engine.play = jest.fn(async (track) => {
      engine.nowPlaying = track;
      engine.emit('track-start', track);
    });
    engine.getNowPlaying = jest.fn(() => engine.nowPlaying || null);
    engine.getState = jest.fn(() => (engine.nowPlaying ? 'playing' : 'idle'));
    engine.shutdown = jest.fn(async () => {
      engine.nowPlaying = null;
    });
    const controller = new PlaybackController(
      { defaultVolume: 50 },
      { log: jest.fn() },
      { engineFactory: () => engine }
    );
    plugin.playbackEngine = controller;
    plugin.queueManager = {
      markPlaying: jest.fn(),
      resetVoteSkips: jest.fn(),
      addToHistory: jest.fn(),
      removeSkipImmunity: jest.fn()
    };
    plugin.autoDJ = {
      recordFailedTrack: jest.fn(),
      recordSourceFailure: jest.fn(() => ({ failureClass: 'transient' })),
      markPlaybackFailed: jest.fn(),
      setPlaybackSeed: jest.fn()
    };
    plugin._stopPlaybackSync = jest.fn();
    plugin._startPlaybackSync = jest.fn();
    plugin._clearCrossfadeTimer = jest.fn();
    plugin._scheduleCrossfadeTransition = jest.fn();
    plugin._schedulePreCache = jest.fn();
    plugin._maybePlayAutoDJ = jest.fn(async () => null);
    plugin._registerPlaybackEvents();

    await controller.play(failedTrack);
    engine.emit('track-end', {
      track: failedTrack,
      reason: 'error',
      error: 'Failed to open stream'
    });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(plugin.autoDJ.recordSourceFailure).toHaveBeenCalledWith(failedTrack, expect.any(Error));
    expect(plugin.autoDJ.recordFailedTrack).not.toHaveBeenCalled();
    expect(plugin.autoDJ.markPlaybackFailed).toHaveBeenCalledTimes(1);
    expect(plugin._maybePlayAutoDJ).toHaveBeenCalledWith(true);
  });

  test('uses a playing YouTube track as the Auto-DJ random seed', () => {
    const { plugin } = createPluginWithQueue([]);
    const playbackEngine = new (require('events'))();
    plugin.playbackEngine = playbackEngine;
    plugin.queueManager = {
      markPlaying: jest.fn(),
      resetVoteSkips: jest.fn()
    };
    plugin.autoDJ = { setPlaybackSeed: jest.fn() };
    plugin._emitNowPlaying = jest.fn();
    plugin._startPlaybackSync = jest.fn();
    plugin._scheduleCrossfadeTransition = jest.fn();
    plugin._schedulePreCache = jest.fn();
    plugin._registerPlaybackEvents();
    const track = { id: 'active-track', title: 'Active title', youtubeId: 'active-video' };

    playbackEngine.emit('track-start', track);

    expect(plugin.autoDJ.setPlaybackSeed).toHaveBeenCalledWith(track);
  });

  test('shows a loading state immediately while a skip waits for the next track', async () => {
    let resolveSkip;
    const { dom } = bootMusicBotUi({
      postHandler: (target) => {
        if (target.endsWith('/skip')) {
          return new Promise((resolve) => { resolveSkip = resolve; });
        }
        return createJsonResponse({ success: true });
      }
    });
    doms.push(dom);
    const skipButton = dom.window.document.getElementById('skip-btn');
    const state = dom.window.document.getElementById('playback-state');

    skipButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    expect(skipButton.disabled).toBe(true);
    expect(skipButton.textContent).toBe('Lädt …');
    expect(state.textContent).toContain('Lädt den nächsten Titel');

    await Promise.resolve();
    resolveSkip(createJsonResponse({
      success: true,
      next: { title: 'Auto-DJ Next', requestedBy: 'AutoDJ', duration: 180 }
    }));
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(skipButton.disabled).toBe(false);
    expect(skipButton.textContent).toBe('Überspringen');
    expect(dom.window.document.getElementById('now-playing').textContent).toContain('Auto-DJ Next');
  });

  test('restores the prior playback state after a rejected skip', async () => {
    const { dom } = bootMusicBotUi({
      statusPayload: { playbackState: 'paused' },
      postHandler: (target) => target.endsWith('/skip')
        ? createJsonResponse({ success: false, error: 'Skip is unavailable' })
        : createJsonResponse({ success: true })
    });
    doms.push(dom);
    const skipButton = dom.window.document.getElementById('skip-btn');
    const state = dom.window.document.getElementById('playback-state');

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(state.textContent).toBe('Pausiert');

    skipButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(skipButton.disabled).toBe(false);
    expect(skipButton.textContent).toBe('\u00dcberspringen');
    expect(state.textContent).toBe('Pausiert');
  });

  test('preserves a socket-reported advancing state when a skip request fails', async () => {
    let resolveSkip;
    const { dom, socketHandlers } = bootMusicBotUi({
      statusPayload: { playbackState: 'paused' },
      postHandler: (target) => target.endsWith('/skip')
        ? new Promise((resolve) => { resolveSkip = resolve; })
        : createJsonResponse({ success: true })
    });
    doms.push(dom);
    const skipButton = dom.window.document.getElementById('skip-btn');
    const state = dom.window.document.getElementById('playback-state');

    await new Promise((resolve) => setTimeout(resolve, 25));
    skipButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await Promise.resolve();
    socketHandlers['musicbot:playback-advancing']({ state: 'loading' });
    resolveSkip(createJsonResponse({ success: false, error: 'Skip is unavailable' }));
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(skipButton.disabled).toBe(true);
    expect(state.textContent).toContain('L\u00e4dt den n\u00e4chsten Titel');
    socketHandlers['musicbot:now-playing']({ id: 'next-track', title: 'Next Track', state: 'playing' });
    expect(skipButton.disabled).toBe(false);
  });

  test('lets a terminal now-playing event clear an advancing skip while its request is pending', async () => {
    let resolveSkip;
    const { dom, socketHandlers } = bootMusicBotUi({
      postHandler: (target) => target.endsWith('/skip')
        ? new Promise((resolve) => { resolveSkip = resolve; })
        : createJsonResponse({ success: true })
    });
    doms.push(dom);
    const skipButton = dom.window.document.getElementById('skip-btn');

    await new Promise((resolve) => setTimeout(resolve, 25));
    skipButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await Promise.resolve();
    socketHandlers['musicbot:playback-advancing']({ state: 'loading' });
    expect(skipButton.disabled).toBe(true);

    socketHandlers['musicbot:now-playing']({ id: 'next-track', title: 'Next Track', state: 'playing' });
    expect(skipButton.disabled).toBe(false);

    resolveSkip(createJsonResponse({ success: false, error: 'Skip is unavailable' }));
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(skipButton.disabled).toBe(false);
  });

  test('lets a terminal playback-stopped event clear an advancing skip while its request is pending', async () => {
    let resolveSkip;
    const { dom, socketHandlers } = bootMusicBotUi({
      postHandler: (target) => target.endsWith('/skip')
        ? new Promise((resolve) => { resolveSkip = resolve; })
        : createJsonResponse({ success: true })
    });
    doms.push(dom);
    const skipButton = dom.window.document.getElementById('skip-btn');

    await new Promise((resolve) => setTimeout(resolve, 25));
    skipButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await Promise.resolve();
    socketHandlers['musicbot:playback-advancing']({ state: 'loading' });
    expect(skipButton.disabled).toBe(true);

    socketHandlers['musicbot:playback-stopped']();
    expect(skipButton.disabled).toBe(false);

    resolveSkip(createJsonResponse({ success: false, error: 'Skip is unavailable' }));
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(skipButton.disabled).toBe(false);
  });

  test('requires an explicit control before starting a queue item', async () => {
    const { dom, fetchMock, socketHandlers } = bootMusicBotUi({
      postHandler: (target) => target.endsWith('/queue/0/play')
        ? createJsonResponse({ success: true, track: { title: 'Selected queue track', state: 'playing' } })
        : createJsonResponse({ success: true })
    });
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 0));
    socketHandlers['musicbot:queue-update']({
      queue: [{ id: 'queue-track', title: 'Queue track', requestedBy: 'viewer' }],
      length: 1
    });
    fetchMock.mockClear();

    dom.window.document.querySelector('.queue-item .queue-meta')
      .dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await Promise.resolve();

    const startedByMetadata = fetchMock.mock.calls.some(([target, options = {}]) =>
      String(target).endsWith('/queue/0/play') && options.method === 'POST'
    );
    expect(startedByMetadata).toBe(false);

    dom.window.document.querySelector('[data-queue-action="play"][data-idx="0"]')
      .dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/plugins/music-bot/queue/0/play',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('refreshes a stale queue delete by ID without claiming success', async () => {
    const renderedSong = { id: 'rendered-song', title: 'Rendered song', requestedBy: 'viewer' };
    const refreshedQueue = [{ id: 'still-queued', title: 'Still queued', requestedBy: 'viewer' }];
    const { dom, fetchMock, socketHandlers } = bootMusicBotUi({
      fetchHandler: (target, options) => {
        if (target.endsWith('/queue/0') && options.method === 'DELETE') {
          return createJsonResponse({ success: false, errorCode: 'QUEUE_ITEM_CHANGED' });
        }
        if (target.endsWith('/queue') && !options.method) {
          return createJsonResponse({ success: true, queue: refreshedQueue });
        }
        return undefined;
      }
    });
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 0));
    socketHandlers['musicbot:queue-update']({ queue: [renderedSong], length: 1 });
    fetchMock.mockClear();

    dom.window.document.querySelector('[data-queue-action="remove"][data-idx="0"]')
      .dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const removeRequest = fetchMock.mock.calls.find(([target, options = {}]) =>
      String(target).endsWith('/queue/0') && options.method === 'DELETE'
    );
    expect(removeRequest?.[1]?.body).toBe(JSON.stringify({ songId: 'rendered-song' }));
    expect(fetchMock).toHaveBeenCalledWith('/api/plugins/music-bot/queue');
    expect(dom.window.document.getElementById('queue-list').textContent).toContain('Still queued');
    const toastText = dom.window.document.getElementById('musicbot-toast-container').textContent;
    expect(toastText).toContain('Die Queue hat sich ge\u00e4ndert. Ansicht wurde aktualisiert.');
    expect(toastText).not.toContain('Track wurde entfernt.');
  });

  test('states honestly when a failed queue delete cannot refresh the queue', async () => {
    const { dom, socketHandlers } = bootMusicBotUi({
      fetchHandler: (target, options) => {
        if (target.endsWith('/queue/0') && options.method === 'DELETE') {
          return createJsonResponse({ success: false, errorCode: 'QUEUE_ITEM_CHANGED' });
        }
        if (target.endsWith('/queue') && !options.method) {
          return createJsonResponse({ success: false });
        }
        return undefined;
      }
    });
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 0));
    socketHandlers['musicbot:queue-update']({
      queue: [{ id: 'rendered-song', title: 'Rendered song', requestedBy: 'viewer' }],
      length: 1
    });

    dom.window.document.querySelector('[data-queue-action="remove"][data-idx="0"]')
      .dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const toastText = dom.window.document.getElementById('musicbot-toast-container').textContent;
    expect(toastText).toContain('Die Queue konnte nicht aktualisiert werden. Bitte lade die Ansicht neu.');
    expect(toastText).not.toContain('Queue wurde aktualisiert.');
  });

  test('warns that a successful queue delete could not refresh the queue', async () => {
    const { dom, socketHandlers } = bootMusicBotUi({
      fetchHandler: (target, options) => {
        if (target.endsWith('/queue/0') && options.method === 'DELETE') {
          return createJsonResponse({ success: true });
        }
        if (target.endsWith('/queue') && !options.method) {
          return createJsonResponse({ success: false });
        }
        return undefined;
      }
    });
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 0));
    socketHandlers['musicbot:queue-update']({
      queue: [{ id: 'rendered-song', title: 'Rendered song', requestedBy: 'viewer' }],
      length: 1
    });

    dom.window.document.querySelector('[data-queue-action="remove"][data-idx="0"]')
      .dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const toastText = dom.window.document.getElementById('musicbot-toast-container').textContent;
    expect(toastText).toContain('Track wurde entfernt, aber die Queue konnte nicht aktualisiert werden. Bitte lade die Ansicht neu.');
    expect(toastText).not.toContain('Track wurde entfernt.');
  });

  test('does not style queue metadata as a click target', () => {
    const css = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/assets/ui-style.css'), 'utf8');
    const queueInfoRule = css.match(/\.queue-info\s*\{([^}]*)\}/);

    expect(queueInfoRule).not.toBeNull();
    expect(queueInfoRule?.[1]).not.toMatch(/cursor:\s*pointer/);
  });

  test('updates the visible player state after a successful pause action', async () => {
    const { dom } = bootMusicBotUi({
      postHandler: () => createJsonResponse({ success: true })
    });
    doms.push(dom);
    const pauseButton = dom.window.document.getElementById('pause-btn');
    const state = dom.window.document.getElementById('playback-state');

    await new Promise((resolve) => setTimeout(resolve, 0));
    pauseButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.textContent).toBe('Pausiert');
  });

  test('identifies both songs when moving a queue item', async () => {
    const { dom, fetchMock, socketHandlers } = bootMusicBotUi();
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 0));
    socketHandlers['musicbot:queue-update']({
      queue: [
        { id: 'first-song', title: 'First Song', requestedBy: 'viewer' },
        { id: 'second-song', title: 'Second Song', requestedBy: 'viewer' }
      ],
      length: 2
    });

    const moveUp = dom.window.document.querySelector('[data-queue-action="move-up"][data-idx="1"]');
    moveUp.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const reorderRequest = fetchMock.mock.calls.find(([url, options]) =>
      String(url).endsWith('/queue/reorder') && options.method === 'POST'
    );
    expect(JSON.parse(reorderRequest[1].body)).toMatchObject({
      sourceSongId: 'second-song',
      targetSongId: 'first-song'
    });
  });

  test('UI exposes mpv path configuration and persists it to playback config', async () => {
    const { dom, fetchMock } = bootMusicBotUi();
    doms.push(dom);
    const input = dom.window.document.getElementById('mpv-path');

    expect(input).not.toBeNull();
    input.value = 'C:\\tools\\mpv\\mpv.exe';
    input.dispatchEvent(new dom.window.Event('blur', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    const mpvPost = fetchMock.mock.calls.find(([url, options = {}]) => {
      if (url !== '/api/plugins/music-bot/config' || options.method !== 'POST') return false;
      const body = JSON.parse(options.body || '{}');
      return body.playback?.mpvPath === 'C:\\tools\\mpv\\mpv.exe';
    });
    expect(mpvPost).toBeTruthy();
  });

  test('keeps preview volume visible outside YouTube\'s auto-hiding controls', async () => {
    const { dom } = bootMusicBotUi();
    doms.push(dom);
    const previewVolume = dom.window.document.getElementById('preview-volume-input');
    const previewVolumeValue = dom.window.document.getElementById('preview-volume-value');
    const searchInput = dom.window.document.getElementById('search-input');
    const previewFrame = dom.window.document.getElementById('preview-frame');

    expect(previewVolume).not.toBeNull();
    expect(previewVolumeValue).not.toBeNull();

    previewVolume.value = '73';
    previewVolume.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(previewVolumeValue.value).toBe('73');

    searchInput.value = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    expect(previewFrame.src).toContain('controls=0');
    expect(previewFrame.src).toContain('enablejsapi=1');
  });

  test('curates only the Streamer Playlist from the player and renders five projected DJ titles', async () => {
    const postTargets = [];
    const { dom, fetchMock } = bootMusicBotUi({
      statusPayload: {
        nowPlaying: {
          id: 'curation-song',
          youtubeId: 'curation-video',
          title: 'Current curation song',
          artist: 'Curation Artist',
          duration: 180,
          state: 'playing'
        }
      },
      radioPlanPayload: Array.from({ length: 5 }, (_item, index) => ({
        position: index + 1,
        title: `Planned ${index + 1}`,
        artist: 'Radio Artist',
        score: 1.2
      })),
      streamerPlaylistPayload: {
        playlist: { id: 'streamer-playlist', name: 'Streamer Playlist', itemCount: 1 },
        suggestions: [{ songId: 22, title: 'Suggested title', artist: 'Suggested artist', score: 2.1 }]
      },
      postHandler: async (target, request) => {
        postTargets.push([target, JSON.parse(request.body || '{}')]);
        if (target.endsWith('/streamer-playlist/feedback')) {
          return createJsonResponse({ success: true, feedback: { state: 'up' } });
        }
        if (target.endsWith('/artist-radio/start')) {
          return createJsonResponse({ success: true, status: { artistRadio: { active: true } } });
        }
        if (target.endsWith('/streamer-playlist/suggestions/22')) {
          return createJsonResponse({ success: true, action: 'accept' });
        }
        return createJsonResponse({ success: true });
      }
    });
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 25));

    const document = dom.window.document;
    expect(document.getElementById('radio-preview-list').textContent).toContain('Planned 5');
    expect(document.querySelector('[data-streamer-playlist-feedback="up"]')).not.toBeNull();
    expect(document.querySelector('[data-artist-radio-action="start"]')).not.toBeNull();
    expect(document.querySelector('[data-streamer-suggestion-action="accept"]')).not.toBeNull();

    document.querySelector('[data-streamer-playlist-feedback="up"]').click();
    document.querySelector('[data-artist-radio-action="start"]').click();
    document.querySelector('[data-streamer-suggestion-action="accept"]').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(postTargets).toContainEqual(['/api/plugins/music-bot/streamer-playlist/feedback', { direction: 'up' }]);
    expect(postTargets).toContainEqual(['/api/plugins/music-bot/artist-radio/start', {}]);
    expect(postTargets).toContainEqual(['/api/plugins/music-bot/streamer-playlist/suggestions/22', { action: 'accept' }]);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/radio/live-feedback'))).toBe(false);
  });

  test('persists Auto-DJ playlist URLs and keeps an explicitly selected related-title mode', async () => {
    const { dom, fetchMock } = bootMusicBotUi();
    doms.push(dom);
    const playlistUrls = dom.window.document.getElementById('auto-dj-playlist-urls');
    const mode = dom.window.document.getElementById('auto-dj-mode');
    const save = dom.window.document.getElementById('auto-dj-save');

    playlistUrls.value = 'https://www.youtube.com/watch?v=first\nhttps://www.youtube.com/watch?v=second';
    mode.value = 'random';
    save.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    const togglePost = fetchMock.mock.calls.find(([url, options = {}]) => {
      return url === '/api/plugins/music-bot/auto-dj/toggle' && options.method === 'POST';
    });
    expect(togglePost).toBeTruthy();
    const payload = JSON.parse(togglePost[1].body);
    expect(payload.mode).toBe('random');
    expect(payload.playlistFallbackToRandom).toBe(true);
    expect(payload.playlistUrls).toEqual([
      'https://www.youtube.com/watch?v=first',
      'https://www.youtube.com/watch?v=second'
    ]);
  });

  test('persists Radio-Mix Auto-DJ settings with clamped mix values', async () => {
    const { dom, fetchMock } = bootMusicBotUi();
    doms.push(dom);
    const mode = dom.window.document.getElementById('auto-dj-mode');
    const mixHistoryPercent = dom.window.document.getElementById('auto-dj-mix-history-percent');
    const repeatCooldownHours = dom.window.document.getElementById('auto-dj-repeat-cooldown-hours');
    const save = dom.window.document.getElementById('auto-dj-save');

    mode.value = 'mix';
    mixHistoryPercent.value = '80';
    repeatCooldownHours.value = '12';
    save.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    const togglePost = fetchMock.mock.calls.find(([url, options = {}]) => {
      return url === '/api/plugins/music-bot/auto-dj/toggle' && options.method === 'POST';
    });
    expect(togglePost).toBeTruthy();
    const payload = JSON.parse(togglePost[1].body);
    expect(payload).toMatchObject({
      mode: 'mix',
      mixHistoryPercent: 80,
      repeatCooldownHours: 12
    });
  });

  test('preserves a zero Radio-Mix history percentage in the Auto-DJ save payload', async () => {
    const { dom, fetchMock } = bootMusicBotUi();
    doms.push(dom);
    const mixHistoryPercent = dom.window.document.getElementById('auto-dj-mix-history-percent');
    const save = dom.window.document.getElementById('auto-dj-save');

    mixHistoryPercent.value = '0';
    save.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    const togglePost = fetchMock.mock.calls.find(([url, options = {}]) => {
      return url === '/api/plugins/music-bot/auto-dj/toggle' && options.method === 'POST';
    });
    expect(togglePost).toBeTruthy();
    const payload = JSON.parse(togglePost[1].body);
    expect(payload.mixHistoryPercent).toBe(0);
  });

  test('restores a saved zero Radio-Mix history percentage', async () => {
    const { dom } = bootMusicBotUi({
      autoDjConfig: {
        enabled: true,
        mode: 'mix',
        historyMinPlays: 1,
        maxConsecutiveAutoDJ: 10,
        announceAutoDJ: true,
        mixHistoryPercent: 0,
        repeatCooldownHours: 12,
        playlistUrls: []
      }
    });
    doms.push(dom);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dom.window.document.getElementById('auto-dj-mix-history-percent').value).toBe('0');
  });

  test('shows compact German Auto-DJ selection diagnostics without replacing the last result', async () => {
    const { dom } = bootMusicBotUi({
      autoDjStatus: {
        enabled: true,
        mode: 'mix',
        historyMinPlays: 2,
        mixHistoryPercent: 80,
        repeatCooldownHours: 12,
        maxConsecutiveAutoDJ: 10,
        announceAutoDJ: true,
        selectionSource: 'radio',
        blockedCount: 3,
        lastResult: { state: 'selected', message: 'Ausgewählt: Frischer Titel' }
      }
    });
    doms.push(dom);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const detail = dom.window.document.getElementById('auto-dj-detail').textContent;
    expect(detail).toContain('Ausgewählt: Frischer Titel');
    expect(detail).toContain('Quelle: Radio');
    expect(detail).toContain('Gesperrt: 3');
  });

  test('restores saved Auto-DJ playlist URLs into the settings form', async () => {
    const { dom } = bootMusicBotUi({
      autoDjConfig: {
        enabled: true,
        mode: 'playlist',
        historyMinPlays: 1,
        maxConsecutiveAutoDJ: 10,
        announceAutoDJ: true,
        playlistUrls: ['https://youtube.com/playlist?list=PLScN1UM-Rlxo']
      }
    });
    doms.push(dom);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dom.window.document.getElementById('auto-dj-playlist-urls').value)
      .toBe('https://youtube.com/playlist?list=PLScN1UM-Rlxo');
  });

  test('restores saved Radio-Mix Auto-DJ settings into the settings form', async () => {
    const { dom } = bootMusicBotUi({
      autoDjConfig: {
        enabled: true,
        mode: 'mix',
        historyMinPlays: 1,
        maxConsecutiveAutoDJ: 10,
        announceAutoDJ: true,
        mixHistoryPercent: 80,
        repeatCooldownHours: 12,
        playlistUrls: []
      }
    });
    doms.push(dom);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dom.window.document.getElementById('auto-dj-mix-history-percent').value).toBe('80');
    expect(dom.window.document.getElementById('auto-dj-repeat-cooldown-hours').value).toBe('12');
  });

  test('serves German Music Bot labels as UTF-8 text instead of mojibake', () => {
    const html = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/ui.html'), 'utf8');

    expect(html).toContain('Maximale Songlänge');
    expect(html).toContain('Benötigt für die Audio-Wiedergabe');
    expect(html).not.toContain('ÃƒÂ');
  });

  windowsTest('detects mpv in the Chocolatey mpvio.install tools directory', async () => {
    const { plugin } = createPluginWithQueue([]);

    const candidates = await plugin._getMpvPathCandidates('mpv');

    expect(candidates).toContain('C:\\ProgramData\\chocolatey\\lib\\mpvio.install\\tools\\mpv.exe');
    expect(candidates[0]).toBe('C:\\ProgramData\\chocolatey\\lib\\mpvio.install\\tools\\mpv.exe');
  });

  windowsTest('uses mpvio.install for the Chocolatey mpv installer command', async () => {
    const { plugin } = createPluginWithQueue([]);
    plugin._resolveExecutable = jest.fn(async (name) => {
      if (name === 'winget' || name === 'scoop') return null;
      if (name === 'choco') return 'C:\\ProgramData\\chocolatey\\bin\\choco.exe';
      return null;
    });

    const installCommand = await plugin._getMpvInstallCommand();

    expect(installCommand?.label).toBe('choco install mpvio.install (Administrator)');
    expect(installCommand?.args.join(' ')).toContain('mpvio.install');
  });

  windowsTest('keeps the elevated installer window open for mpv install logs', async () => {
    const { plugin } = createPluginWithQueue([]);
    plugin._resolveExecutable = jest.fn(async (name) => {
      if (name === 'winget' || name === 'scoop') return null;
      if (name === 'choco') return 'C:\\ProgramData\\chocolatey\\bin\\choco.exe';
      return null;
    });

    const installCommand = await plugin._getMpvInstallCommand();
    const commandText = installCommand?.args.join(' ');

    expect(commandText).toContain('cmd.exe');
    expect(commandText).toContain('timeout /t 30');
    expect(installCommand?.windowsHide).toBe(true);
  });

  test('UI shows the first-run assistant until the setup is completed', async () => {
    const { dom, fetchMock } = bootMusicBotUi();
    doms.push(dom);
    const assistant = dom.window.document.getElementById('musicbot-onboarding');

    expect(assistant).not.toBeNull();
    expect(assistant?.textContent || '').toContain('Clip');

    const completeBtn = dom.window.document.getElementById('musicbot-onboarding-complete');
    expect(completeBtn).not.toBeNull();

    completeBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    const onboardingPost = fetchMock.mock.calls.find(([url, options = {}]) => {
      return url === '/api/plugins/music-bot/onboarding/complete' && options.method === 'POST';
    });
    expect(onboardingPost).toBeTruthy();
  });

  test('first-run onboarding exposes an easy copy flow for the OBS overlay URL', async () => {
    const { dom } = bootMusicBotUi();
    doms.push(dom);
    const overlayCopy = dom.window.document.getElementById('overlay-copy');

    expect(overlayCopy).not.toBeNull();

    overlayCopy.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await Promise.resolve();

    expect(dom.window.navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    const [copiedUrl] = dom.window.navigator.clipboard.writeText.mock.calls[0];
    expect(copiedUrl).toContain('/plugins/music-bot/overlay.html');
    expect(copiedUrl).toMatch(/\?.*design=.*theme=.*position=.*/);
    expect(overlayCopy.textContent).toContain('Kopiert');
  });

  test('status payload exposes onboarding completion state', () => {
    const { plugin } = createPluginWithQueue([]);
    plugin.queueManager = {
      getQueue: jest.fn(() => []),
      getHistory: jest.fn(() => []),
      getVoteVoters: jest.fn(() => [])
    };
    plugin.playbackEngine = {
      getNowPlaying: jest.fn(() => null),
      getState: jest.fn(() => 'idle')
    };
    plugin.autoDJ = { getStatus: jest.fn(() => ({ enabled: false })) };
    plugin.config = {
      audio: { masterVolume: 100, sourceVolume: 50 },
      playback: {},
      onboarding: { completed: true, completedAt: 1234567890 }
    };
    plugin._ytdlpAvailable = true;
    plugin._mpvAvailable = true;

    const payload = plugin._buildStatusPayload();

    expect(payload.onboarding).toEqual({ completed: true, completedAt: 1234567890 });
  });

  test('first-run setup steps keep the issue order from the setup status payload', async () => {
    const { dom } = bootMusicBotUi({
      setupIssues: [
        {
          id: 'ytdlp-missing',
          severity: 'warning',
          title: 'yt-dlp nicht gefunden',
          description: 'yt-dlp description'
        },
        {
          id: 'mpv-missing',
          severity: 'error',
          title: 'mpv Media Player nicht gefunden',
          description: 'mpv description'
        }
      ]
    });
    doms.push(dom);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const steps = Array.from(dom.window.document.querySelectorAll('#musicbot-onboarding-steps .onboarding-step-title'))
      .map((node) => node.textContent.trim());

    expect(steps[0]).toBe('Einstellungen prüfen');
    expect(steps[1]).toBe('yt-dlp nicht gefunden');
    expect(steps[2]).toBe('mpv Media Player nicht gefunden');
  });

  test('UI stylesheet uses a local resolved accent token instead of an undefined theme variable', () => {
    const css = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/assets/ui-style.css'), 'utf8');

    expect(css).toContain('--musicbot-accent');
    expect(css).not.toContain('var(--color-accent)');
  });

  test('first-run easy-peasy smoke: overlay copy, onboarding complete and minimum setup persistence path', async () => {
    const { dom, fetchMock } = bootMusicBotUi();
    doms.push(dom);

    const overlayCopy = dom.window.document.getElementById('overlay-copy');
    const onboardingComplete = dom.window.document.getElementById('musicbot-onboarding-complete');
    const onboardingPanel = dom.window.document.getElementById('musicbot-onboarding');
    const blockedKeywords = dom.window.document.getElementById('blocked-keywords');
    const aliasRequest = dom.window.document.querySelector('.alias-input[data-command=\"request\"]');
    const aliasSkip = dom.window.document.querySelector('.alias-input[data-command=\"skip\"]');
    const payToPlayGifts = dom.window.document.getElementById('pay-to-play-gifts');
    const payToSkipGifts = dom.window.document.getElementById('pay-to-skip-gifts');
    const aliasSave = dom.window.document.getElementById('alias-save');

    expect(overlayCopy).not.toBeNull();
    expect(onboardingComplete).not.toBeNull();
    expect(onboardingPanel).not.toBeNull();
    expect(blockedKeywords).not.toBeNull();
    expect(aliasRequest).not.toBeNull();
    expect(aliasSkip).not.toBeNull();
    expect(payToPlayGifts).not.toBeNull();
    expect(payToSkipGifts).not.toBeNull();
    expect(aliasSave).not.toBeNull();

    overlayCopy.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await Promise.resolve();
    expect(dom.window.navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    const [copiedUrl] = dom.window.navigator.clipboard.writeText.mock.calls[0];
    expect(copiedUrl).toContain('/plugins/music-bot/overlay.html');
    expect(copiedUrl).toContain('design=');
    expect(copiedUrl).toContain('theme=');
    expect(copiedUrl).toContain('position=');

    blockedKeywords.value = 'vip\nscammer';
    aliasRequest.value = 'sr, request';
    aliasSkip.value = 'skip, überspringen';
    payToPlayGifts.value = 'Rose, GG';
    payToSkipGifts.value = 'GG';

    aliasSave.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    blockedKeywords.dispatchEvent(new dom.window.Event('blur', { bubbles: true }));
    payToPlayGifts.dispatchEvent(new dom.window.Event('blur', { bubbles: true }));
    payToSkipGifts.dispatchEvent(new dom.window.Event('blur', { bubbles: true }));

    onboardingComplete.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    const onboardingCall = fetchMock.mock.calls.find(([url, options = {}]) => {
      return url === '/api/plugins/music-bot/onboarding/complete' && options.method === 'POST';
    });
    expect(onboardingCall).toBeTruthy();

    const configPosts = fetchMock.mock.calls.filter(([url, options = {}]) => {
      return url === '/api/plugins/music-bot/config' && options.method === 'POST';
    });
    const parsedConfigPosts = configPosts.map(([, options = {}]) => {
      try {
        return JSON.parse(options.body || '{}');
      } catch (_) {
        return {};
      }
    });

    const aliasPayload = parsedConfigPosts.find((payload) => {
      return payload.commandAliases?.request?.includes('sr');
    });
    const moderationPayload = parsedConfigPosts.find((payload) => {
      return payload.moderation && Array.isArray(payload.moderation.blockedKeywords);
    });
    const playPayload = parsedConfigPosts.find((payload) => {
      return payload.monetization && Array.isArray(payload.monetization.payToPlayGiftCatalog);
    });
    const skipPayload = parsedConfigPosts.find((payload) => {
      return payload.monetization && Array.isArray(payload.monetization.payToSkipGiftCatalog);
    });

    expect(aliasPayload).toBeTruthy();
    expect(moderationPayload).toBeTruthy();
    expect(playPayload).toBeTruthy();
    expect(skipPayload).toBeTruthy();
    expect(moderationPayload.moderation.blockedKeywords).toEqual(['vip', 'scammer']);
    expect(aliasPayload.commandAliases.request).toEqual(['sr', 'request']);
    expect(aliasPayload.commandAliases.skip).toEqual(['skip', 'überspringen']);
    expect(playPayload.monetization.payToPlayGiftCatalog).toEqual(['Rose', 'GG']);
    expect(skipPayload.monetization.payToSkipGiftCatalog).toEqual(['GG']);

    expect(onboardingPanel.hidden).toBe(true);
  });

  describe('TikTokstreamer first-run easy-peasy mini-suite', () => {
    test('keeps onboarding completion easy with one-click copy + completion call', async () => {
      const { dom, fetchMock } = bootMusicBotUi();
      doms.push(dom);

      const overlayCopy = dom.window.document.getElementById('overlay-copy');
      const onboardingComplete = dom.window.document.getElementById('musicbot-onboarding-complete');
      const onboardingPanel = dom.window.document.getElementById('musicbot-onboarding');

      expect(overlayCopy).not.toBeNull();
      expect(onboardingComplete).not.toBeNull();
      expect(onboardingPanel).not.toBeNull();

      overlayCopy.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
      await Promise.resolve();
      expect(dom.window.navigator.clipboard.writeText).toHaveBeenCalledTimes(1);

      onboardingComplete.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
      await Promise.resolve();

      const onboardingCall = fetchMock.mock.calls.find(([url, options = {}]) =>
        url === '/api/plugins/music-bot/onboarding/complete' && options.method === 'POST'
      );
      expect(onboardingCall).toBeTruthy();
      expect(onboardingPanel.hidden).toBe(true);
    });

    test('persists minimum bootstrap setup in first-run path for TikTokstreamer onboarding', async () => {
      const { dom, fetchMock } = bootMusicBotUi();
      doms.push(dom);

      const blockedKeywords = dom.window.document.getElementById('blocked-keywords');
      const aliasRequest = dom.window.document.querySelector('.alias-input[data-command=\"request\"]');
      const payToPlayGifts = dom.window.document.getElementById('pay-to-play-gifts');
      const payToSkipGifts = dom.window.document.getElementById('pay-to-skip-gifts');
      const aliasSave = dom.window.document.getElementById('alias-save');

      expect(blockedKeywords).not.toBeNull();
      expect(aliasRequest).not.toBeNull();
      expect(payToPlayGifts).not.toBeNull();
      expect(payToSkipGifts).not.toBeNull();
      expect(aliasSave).not.toBeNull();

      blockedKeywords.value = 'vip\nfast-follower';
      aliasRequest.value = 'sr';
      payToPlayGifts.value = 'rose, gg';
      payToSkipGifts.value = 'hearts';

      aliasSave.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
      blockedKeywords.dispatchEvent(new dom.window.Event('blur', { bubbles: true }));
      payToPlayGifts.dispatchEvent(new dom.window.Event('blur', { bubbles: true }));
      payToSkipGifts.dispatchEvent(new dom.window.Event('blur', { bubbles: true }));

      await Promise.resolve();
      await Promise.resolve();

      const configPosts = fetchMock.mock.calls.filter(([url, options = {}]) => {
        return url === '/api/plugins/music-bot/config' && options.method === 'POST';
      });
      const parsedConfigPosts = configPosts.map(([, options = {}]) => {
        try {
          return JSON.parse(options.body || '{}');
        } catch (_) {
          return {};
        }
      });

      const moderationPayload = parsedConfigPosts.find((payload) => payload?.moderation?.blockedKeywords?.length > 0);
      const aliasPayload = parsedConfigPosts.find((payload) => payload?.commandAliases?.request?.includes('sr'));
      const playPayload = parsedConfigPosts.find((payload) => payload?.monetization?.payToPlayGiftCatalog?.length > 0);
      const skipPayload = parsedConfigPosts.find((payload) => payload?.monetization?.payToSkipGiftCatalog?.length > 0);

      expect(moderationPayload).toBeTruthy();
      expect(aliasPayload).toBeTruthy();
      expect(playPayload).toBeTruthy();
      expect(skipPayload).toBeTruthy();
      expect(moderationPayload.moderation.blockedKeywords).toEqual(['vip', 'fast-follower']);
      expect(aliasPayload.commandAliases.request).toEqual(['sr']);
      expect(playPayload.monetization.payToPlayGiftCatalog).toEqual(['rose', 'gg']);
      expect(skipPayload.monetization.payToSkipGiftCatalog).toEqual(['hearts']);
    });

    test('waits for i18n readiness before initializing without i18n warnings', async () => {
      let resolveI18n;
      const ready = new Promise((resolve) => {
        resolveI18n = resolve;
      });
      const i18nWarn = jest.fn();
      const { dom, fetchMock } = bootMusicBotUi({ i18nReady: ready, i18nWarn });
      doms.push(dom);

      await Promise.resolve();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(i18nWarn).not.toHaveBeenCalled();

      resolveI18n();
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(dom.window.i18n.updateDOM).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('/api/plugins/music-bot/status');
      expect(i18nWarn).not.toHaveBeenCalled();
    });

    test('hydrates the complete plugin locale after a plugin-only reload with a stale server i18n loader', async () => {
      const fullCatalog = JSON.parse(fs.readFileSync(path.join(__dirname, '../plugins/music-bot/locales/en.json'), 'utf8'));
      const staleServerCatalog = {
        en: {
          plugins: {
            'music-bot': {
              ...pluginMessages(fullCatalog)
            }
          }
        }
      };
      const { dom, fetchMock } = bootMusicBotUi({
        productionLocale: 'en',
        translations: staleServerCatalog,
        staticLocalePayload: fullCatalog,
        statusPayload: {
          health: { state: 'locked', locked: true, healthy: true },
          runtime: { transportState: 'idle', safetyLock: true }
        }
      });
      doms.push(dom);

      await new Promise((resolve) => setTimeout(resolve, 40));

      expect(fetchMock).toHaveBeenCalledWith('/plugins/music-bot/locales/en.json', { cache: 'no-store' });
      expect(dom.window.document.querySelector('[data-i18n="plugins.music-bot.music_bot.ui.health.state"]')?.textContent).toBe('State');
      expect(dom.window.document.querySelector('[data-i18n="plugins.music-bot.music_bot.ui.tabs.catalog"]')?.textContent).toBe('Catalog');
      expect(dom.window.document.querySelector('[data-i18n="plugins.music-bot.music_bot.ui.tabs.settings"]')?.textContent).toBe('Settings');
      expect(dom.window.document.querySelector('#now-playing p')?.textContent)
        .toBe(musicBotUi(fullCatalog).player.nowPlayingEmpty);
      expect(dom.window.document.querySelector('#health-state')?.textContent)
        .toBe(musicBotUi(fullCatalog).safety.safetyLocked);
    });
  });
});

