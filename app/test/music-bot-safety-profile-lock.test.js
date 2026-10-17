const fs = require('fs');
const os = require('os');
const path = require('path');
const DatabaseManager = require('../modules/database');
const ConfigPathManager = require('../modules/config-path-manager');
const UserProfileManager = require('../modules/user-profiles');
const { PluginAPI } = require('../modules/plugin-loader');
const MusicBotPlugin = require('../plugins/music-bot/main');
const PlaybackController = require('../plugins/music-bot/lib/playback-controller');

describe('Music Bot persisted profile Safety Lock startup boundary', () => {
  let root;
  let db;
  let plugin;
  let controller;
  let api;
  let handlers;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-safety-profile-'));
    const profileId = 'safety_lock_review';
    const configPathManager = new ConfigPathManager({
      appDir: path.join(root, 'app'),
      env: {
        LOCALAPPDATA: path.join(root, 'local'),
        USERPROFILE: path.join(root, 'user')
      }
    });
    const profiles = new UserProfileManager(configPathManager);
    const profilePath = profiles.getProfilePath(profileId);
    db = new DatabaseManager(profilePath, null, { registerShutdownHandlers: false });
    api = new PluginAPI(
      'music-bot',
      path.join(root, 'plugins', 'music-bot'),
      {},
      { emit: jest.fn() },
      db,
      { debug() {}, info() {}, warn() {}, error() {} },
      {},
      configPathManager,
      null,
      null,
      profileId
    );

    handlers = new Map();
    api.registerRoute = jest.fn((method, route, handler) => {
      handlers.set(`${method.toUpperCase()}:${route}`, handler);
    });
  });

  afterEach(() => {
    plugin = null;
    controller = null;
    if (db && !db.isClosed) db.close();
    db = null;
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
    root = null;
  });

  test('reloads the persisted profile lock and blocks resume and controller engine creation', async () => {
    const persistedSafety = {
      locked: true,
      lockedAt: 1780772400000,
      reason: 'profile-recovery-review'
    };
    expect(api.setConfig('config', { safety: persistedSafety })).toBe(true);

    plugin = new MusicBotPlugin(api);
    plugin._loadConfig();
    plugin.pluginDataDir = api.ensurePluginDataDir({ profileScoped: true });
    expect(plugin.pluginDataDir).toContain(path.join('music-bot', 'profiles', 'safety_lock_review', 'data'));
    expect(api.getConfig('config').safety).toEqual(persistedSafety);
    expect(plugin.config.safety).toEqual(persistedSafety);
    expect(plugin._isSafetyLocked()).toBe(true);

    const engineFactory = jest.fn(() => {
      throw new Error('A locked playback controller must not construct an MPV engine');
    });
    controller = new PlaybackController(
      { mpvPath: 'mpv', defaultVolume: 50 },
      { log: jest.fn() },
      {
        engineFactory,
        processRegistry: { findMarkedProcesses: jest.fn() }
      }
    );
    // Seed the locked runtime state directly; do not exercise lock/unlock/stop APIs.
    controller.safetyLock = true;
    plugin.playbackEngine = controller;
    plugin.musicResolver = { resolve: jest.fn() };
    plugin._registerRoutes();

    const response = {
      status: jest.fn(function status() { return this; }),
      json: jest.fn(function json() { return this; })
    };
    await handlers.get('POST:/api/plugins/music-bot/resume')({}, response);

    expect(response.status).toHaveBeenCalledWith(423);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, locked: true }));
    await expect(controller.play({ url: 'file:///isolated-test-track.wav' }))
      .rejects.toThrow('Playback safety lock is engaged');
    expect(engineFactory).not.toHaveBeenCalled();
    expect(plugin.musicResolver.resolve).not.toHaveBeenCalled();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings'").get())
      .toEqual({ name: 'settings' });
  });
});
