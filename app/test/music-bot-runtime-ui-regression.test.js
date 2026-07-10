const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const MusicBotPlugin = require('../plugins/music-bot/main');
const MusicResolver = require('../plugins/music-bot/lib/music-resolver');

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
  const autoDjConfig = options.autoDjConfig || {
    enabled: false,
    mode: 'history',
    historyMinPlays: 2,
    maxConsecutiveAutoDJ: 10,
    announceAutoDJ: true,
    randomKeywords: [],
    playlistUrls: []
  };
  const statusOnboarding = options.statusOnboarding || {
    completed: false,
    completedAt: null
  };
  const html = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/ui.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/assets/ui.js'), 'utf8');
  const fetchMock = jest.fn(async (url, options = {}) => {
    const target = String(url);
    if (options.method === 'POST') {
      if (typeof postHandler === 'function') {
        return postHandler(target, options);
      }
      return createJsonResponse({ success: true, config: {} });
    }
    if (target.includes('/status')) {
      return createJsonResponse({
        success: true,
        nowPlaying: null,
        queueLength: 0,
        playbackState: 'idle',
        masterVolume: 100,
        sourceVolume: 50,
        onboarding: statusOnboarding
      });
    }
    if (target.includes('/queue')) return createJsonResponse({ success: true, queue: [] });
    if (target.includes('/history')) return createJsonResponse({ success: true, history: [] });
    if (target.includes('/auto-dj/status')) {
      return createJsonResponse({
        success: true,
        status: {
          enabled: false,
          mode: 'history',
          historyMinPlays: 2,
          maxConsecutiveAutoDJ: 10,
          announceAutoDJ: true
        }
      });
    }
    if (target.includes('/bans')) return createJsonResponse({ success: true, bans: [] });
    if (target.includes('/gift-catalog')) return createJsonResponse({ catalog: [] });
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
      window.io = () => ({ on: jest.fn(), emit: jest.fn() });
      window.fetch = fetchMock;
      window.open = jest.fn();
      window.navigator.clipboard = { writeText: jest.fn(async () => {}) };
    }
  });
  dom.window.eval(js);
  return { dom, fetchMock };
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
    expect(queue).toHaveLength(1);
    expect(plugin.queueManager.shiftNext).not.toHaveBeenCalled();
    expect(plugin.playbackEngine.play).not.toHaveBeenCalled();
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

  test('starts the next song in the final configured crossfade interval', () => {
    jest.useFakeTimers();
    try {
      const { plugin } = createPluginWithQueue([]);
      plugin.config.playback.crossfadeDuration = 3000;
      plugin.playbackEngine = {
        getNowPlaying: jest.fn(() => ({ id: 'current' })),
        isPlaying: jest.fn(() => true)
      };
      plugin._playNextFromQueue = jest.fn(async () => ({ success: true }));

      plugin._scheduleCrossfadeTransition({ id: 'current', duration: 120 });
      jest.advanceTimersByTime(116999);
      expect(plugin._playNextFromQueue).not.toHaveBeenCalled();

      jest.advanceTimersByTime(1);
      expect(plugin._playNextFromQueue).toHaveBeenCalledTimes(1);
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
    expect(skipButton.textContent).toBe('Skip');
    expect(dom.window.document.getElementById('now-playing').textContent).toContain('Auto-DJ Next');
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

    expect(state.textContent).toBe('Paused');
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

  test('persists Auto-DJ playlist URLs and random search terms', async () => {
    const { dom, fetchMock } = bootMusicBotUi();
    doms.push(dom);
    const keywords = dom.window.document.getElementById('auto-dj-random-keywords');
    const playlistUrls = dom.window.document.getElementById('auto-dj-playlist-urls');
    const save = dom.window.document.getElementById('auto-dj-save');

    keywords.value = 'lofi, synthwave';
    playlistUrls.value = 'https://www.youtube.com/watch?v=first\nhttps://www.youtube.com/watch?v=second';
    save.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    const togglePost = fetchMock.mock.calls.find(([url, options = {}]) => {
      return url === '/api/plugins/music-bot/auto-dj/toggle' && options.method === 'POST';
    });
    expect(togglePost).toBeTruthy();
    const payload = JSON.parse(togglePost[1].body);
    expect(payload.mode).toBe('playlist');
    expect(payload.randomKeywords).toEqual(['lofi', 'synthwave']);
    expect(payload.playlistUrls).toEqual([
      'https://www.youtube.com/watch?v=first',
      'https://www.youtube.com/watch?v=second'
    ]);
  });

  test('restores saved Auto-DJ playlist URLs into the settings form', async () => {
    const { dom } = bootMusicBotUi({
      autoDjConfig: {
        enabled: true,
        mode: 'playlist',
        historyMinPlays: 1,
        maxConsecutiveAutoDJ: 10,
        announceAutoDJ: true,
        randomKeywords: ['synthwave'],
        playlistUrls: ['https://youtube.com/playlist?list=PLScN1UM-Rlxo']
      }
    });
    doms.push(dom);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(dom.window.document.getElementById('auto-dj-playlist-urls').value)
      .toBe('https://youtube.com/playlist?list=PLScN1UM-Rlxo');
    expect(dom.window.document.getElementById('auto-dj-random-keywords').value)
      .toBe('synthwave');
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
  });
});

