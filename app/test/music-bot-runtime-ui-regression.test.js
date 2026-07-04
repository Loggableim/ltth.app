const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const MusicBotPlugin = require('../plugins/music-bot/main');
const MusicResolver = require('../plugins/music-bot/lib/music-resolver');

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
  const statusOnboarding = options.statusOnboarding || {
    completed: false,
    completedAt: null
  };
  const html = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/ui.html'), 'utf8');
  const js = fs.readFileSync(path.join(__dirname, '../plugins/music-bot/assets/ui.js'), 'utf8');
  const fetchMock = jest.fn(async (url, options = {}) => {
    const target = String(url);
    if (options.method === 'POST') {
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
          autoDJ: {
            enabled: false,
            mode: 'history',
            historyMinPlays: 2,
            maxConsecutiveAutoDJ: 10,
            announceAutoDJ: true
          },
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
});

