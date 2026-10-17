const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');

jest.mock('../plugins/music-bot/lib/playback-controller', () => {
  const EventEmitter = require('events');
  return jest.fn().mockImplementation(() => {
    const controller = new EventEmitter();
    controller.setVolume = jest.fn(async () => true);
    controller.reconcileProcesses = jest.fn(async () => ({
      detected: [],
      killed: [],
      remaining: [],
      locked: false
    }));
    // This is an observation-only spy; it cannot stop or start any process.
    controller.emergencyStop = jest.fn(async () => true);
    controller.releaseSafetyLock = jest.fn(() => true);
    controller.isSafetyLocked = jest.fn(() => false);
    controller.play = jest.fn(() => { throw new Error('Forbidden playback call in init test'); });
    controller.createEngine = jest.fn(() => { throw new Error('Forbidden engine creation in init test'); });
    controller.spawn = jest.fn(() => { throw new Error('Forbidden process spawn in init test'); });
    controller.shutdown = jest.fn(async () => true);
    return controller;
  });
});

jest.mock('../plugins/music-bot/lib/soundbot-process-registry', () => ({
  SoundbotProcessRegistry: jest.fn(() => {
    throw new Error('Forbidden OS process registry construction in init test');
  })
}));

jest.mock('../plugins/music-bot/lib/music-resolver', () => jest.fn().mockImplementation(() => ({
  runner: { run: jest.fn(() => { throw new Error('Forbidden resolver process run in init test'); }) },
  resolve: jest.fn(() => { throw new Error('Forbidden resolver call in init test'); }),
  cancelAll: jest.fn(async () => true)
})));

jest.mock('../plugins/music-bot/lib/media-cache', () => jest.fn().mockImplementation(() => ({
  schedulePrune: jest.fn(),
  get: jest.fn(() => null),
  pin: jest.fn(),
  unpin: jest.fn(),
  destroy: jest.fn()
})));

jest.mock('../plugins/music-bot/lib/radio-supervisor', () => jest.fn().mockImplementation(() => ({
  setLocked: jest.fn(),
  setEnabled: jest.fn(),
  destroy: jest.fn()
})));

jest.mock('../plugins/music-bot/lib/queue-manager', () => jest.fn().mockImplementation(() => ({
  getQueue: jest.fn(() => []),
  restoreQueue: jest.fn(() => ({ restored: 0, deduped: 0, banned: 0 })),
  persistQueue: jest.fn(),
  markPlaying: jest.fn(),
  getHistory: jest.fn(() => [])
})));

const spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation(() => {
  throw new Error('Forbidden child_process.spawn call in init test');
});
const execFileSpy = jest.spyOn(childProcess, 'execFile').mockImplementation(() => {
  throw new Error('Forbidden child_process.execFile call in init test');
});

const ConfigPathManager = require('../modules/config-path-manager');
const DatabaseManager = require('../modules/database');
const { PluginAPI } = require('../modules/plugin-loader');
const UserProfileManager = require('../modules/user-profiles');
const PlaybackController = require('../plugins/music-bot/lib/playback-controller');
const SoundbotProcessRegistry = require('../plugins/music-bot/lib/soundbot-process-registry').SoundbotProcessRegistry;
const MusicBotPlugin = require('../plugins/music-bot/main');

describe('Music Bot init applies a persisted profile Safety Lock', () => {
  let root;
  let db;
  let plugin;
  let api;
  let controller;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-init-safety-'));
    const profileId = 'safety_init_review';
    const configPathManager = new ConfigPathManager({
      appDir: path.join(root, 'app'),
      env: {
        LOCALAPPDATA: path.join(root, 'local'),
        USERPROFILE: path.join(root, 'user')
      }
    });
    const profiles = new UserProfileManager(configPathManager);
    db = new DatabaseManager(profiles.getProfilePath(profileId), null, { registerShutdownHandlers: false });
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

    api.registerRoute = jest.fn();
    api.registerSocketEvent = jest.fn();
    api.registerTikTokEvent = jest.fn();
    api.on = jest.fn();
    api.off = jest.fn();
  });

  afterEach(() => {
    if (db && !db.isClosed) db.close();
    db = null;
    plugin = null;
    controller = null;
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
    root = null;
    jest.restoreAllMocks();
  });

  test('loads the profile lock and requests startup stop without reaching process or playback boundaries', async () => {
    const savedLock = {
      locked: true,
      lockedAt: 1780772400000,
      reason: 'profile-startup-review'
    };
    expect(api.setConfig('config', { safety: savedLock })).toBe(true);

    plugin = new MusicBotPlugin(api);
    plugin._ensureYtDlp = jest.fn(async () => {});
    plugin._ensureMpv = jest.fn(async () => {});
    plugin._initializeMusicCatalog = jest.fn();
    plugin._initializePlaylistStore = jest.fn();
    plugin._initializePlaylistImports = jest.fn();
    plugin._registerRoutes = jest.fn();
    plugin._registerSocketEvents = jest.fn();
    plugin._registerTikTokEvents = jest.fn();
    plugin._registerDuckingHooks = jest.fn();
    plugin._restoreState = jest.fn(async () => {});
    plugin._scheduleCatalogMetadataEnrichment = jest.fn();
    plugin._emitSetupStatus = jest.fn();

    await plugin.init();

    controller = PlaybackController.mock.results[0].value;
    expect(plugin.config.safety).toEqual(savedLock);
    expect(plugin._isSafetyLocked()).toBe(true);
    expect(api.getConfig('config').safety).toEqual(savedLock);
    expect(plugin._ensureYtDlp).toHaveBeenCalledTimes(1);
    expect(plugin._ensureMpv).toHaveBeenCalledTimes(1);
    expect(controller.reconcileProcesses).toHaveBeenCalledTimes(1);
    expect(controller.emergencyStop).toHaveBeenCalledTimes(1);
    expect(controller.emergencyStop).toHaveBeenCalledWith(savedLock.reason);
    expect(controller.releaseSafetyLock).not.toHaveBeenCalled();
    expect(controller.play).not.toHaveBeenCalled();
    expect(controller.createEngine).not.toHaveBeenCalled();
    expect(controller.spawn).not.toHaveBeenCalled();
    expect(SoundbotProcessRegistry).not.toHaveBeenCalled();
    expect(spawnSpy).not.toHaveBeenCalled();
    expect(execFileSpy).not.toHaveBeenCalled();
  });
});
