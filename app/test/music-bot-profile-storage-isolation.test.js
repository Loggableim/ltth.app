const fs = require('fs');
const os = require('os');
const path = require('path');
const DatabaseManager = require('../modules/database');
const ConfigPathManager = require('../modules/config-path-manager');
const { PluginAPI } = require('../modules/plugin-loader');
const UserProfileManager = require('../modules/user-profiles');
const MusicBotPlugin = require('../plugins/music-bot/main');
const QueueManager = require('../plugins/music-bot/lib/queue-manager');

describe('Music Bot profile storage isolation', () => {
  let root;
  let profiles = [];

  function createProfile(profileId) {
    const profileRoot = path.join(root, profileId);
    const configPathManager = new ConfigPathManager({
      appDir: path.join(profileRoot, 'app'),
      env: {
        LOCALAPPDATA: path.join(profileRoot, 'local'),
        USERPROFILE: path.join(profileRoot, 'user')
      }
    });
    const profileManager = new UserProfileManager(configPathManager);
    const dbPath = profileManager.getProfilePath(profileId);
    const db = new DatabaseManager(dbPath, null, { registerShutdownHandlers: false });
    const logger = { debug() {}, info() {}, warn() {}, error() {} };
    const api = new PluginAPI(
      'music-bot',
      path.join(profileRoot, 'plugins', 'music-bot'),
      {},
      { emit: jest.fn() },
      db,
      logger,
      { plugins: new Map() },
      configPathManager,
      null,
      null,
      profileId
    );
    const fixture = { profileId, configPathManager, profileManager, dbPath, db, api };
    profiles.push(fixture);
    return fixture;
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-music-bot-profile-isolation-'));
    profiles = [];
  });

  afterEach(() => {
    for (const profile of profiles) {
      if (!profile.db.isClosed) profile.db.close();
    }
    profiles = [];
    if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
    root = null;
  });

  test('isolates Music Bot settings, queued requester data, and plugin data between two profiles', () => {
    const profileA = createProfile('profile_a');
    const profileB = createProfile('profile_b');
    expect(profileA.dbPath).not.toBe(profileB.dbPath);
    expect(fs.existsSync(profileA.dbPath)).toBe(true);
    expect(fs.existsSync(profileB.dbPath)).toBe(true);

    expect(profileA.api.setConfig('config', {
      playback: { crossfadeDuration: 0, defaultVolume: 24 },
      audio: { masterVolume: 100, sourceVolume: 24 },
      safety: { locked: false, lockedAt: null, reason: null }
    })).toBe(true);

    const pluginA = new MusicBotPlugin(profileA.api);
    const pluginB = new MusicBotPlugin(profileB.api);
    pluginA._loadConfig();
    pluginB._loadConfig();

    expect(profileA.api.getConfig('config').safety).toEqual({
      locked: false, lockedAt: null, reason: null
    });
    expect(pluginA.config.playback.crossfadeDuration).toBe(0);
    expect(pluginA.config.playback.defaultVolume).toBe(24);
    expect(pluginA.config.audio).toEqual({ masterVolume: 100, sourceVolume: 24 });
    expect(pluginA.config.safety.locked).toBe(false);
    expect(pluginB.config.playback.crossfadeDuration).toBe(3000);
    expect(pluginB.config.audio).toEqual({ masterVolume: 100, sourceVolume: 50 });
    expect(pluginB.config.safety.locked).toBe(true);

    const pluginDataA = profileA.api.ensurePluginDataDir({ profileScoped: true });
    const pluginDataB = profileB.api.ensurePluginDataDir({ profileScoped: true });
    expect(pluginDataA).not.toBe(pluginDataB);
    expect(pluginDataA).toContain(path.join('music-bot', 'profiles', 'profile_a', 'data'));
    expect(pluginDataB).toContain(path.join('music-bot', 'profiles', 'profile_b', 'data'));
    fs.writeFileSync(path.join(pluginDataA, 'profile-marker.json'), '{"profile":"a"}');
    expect(fs.existsSync(path.join(pluginDataB, 'profile-marker.json'))).toBe(false);

    const queueA = new QueueManager(pluginA.config, profileA.api);
    const queueB = new QueueManager(pluginB.config, profileB.api);
    const addResult = queueA.addSong({
      id: 'profile-a-track',
      title: 'Profile A fixture request',
      artist: 'Local fixture',
      url: 'https://fixture.invalid/profile-a-track',
      duration: 120,
      requestedBy: 'requester-a'
    });
    expect(addResult.success).toBe(true);
    expect(addResult.song.id).toBe('profile-a-track');
    expect(queueA.userLastRequest.has('requester-a')).toBe(true);
    expect(queueB.getQueue()).toEqual([]);
    expect(queueB.userLastRequest.size).toBe(0);
    expect(profileA.db.prepare('SELECT id, requestedBy FROM plugin_music_bot_queue').all()).toEqual([
      { id: 'profile-a-track', requestedBy: 'requester-a' }
    ]);
    expect(profileB.db.prepare('SELECT id, requestedBy FROM plugin_music_bot_queue').all()).toEqual([]);

    const queueAReloaded = new QueueManager(pluginA.config, profileA.api);
    const queueBReloaded = new QueueManager(pluginB.config, profileB.api);
    expect(queueAReloaded.restoreQueue().restored).toBe(1);
    expect(queueAReloaded.getQueue()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'profile-a-track', requestedBy: 'requester-a' })
    ]));
    expect(queueBReloaded.restoreQueue().restored).toBe(0);
    expect(queueBReloaded.getQueue()).toEqual([]);

    expect(pluginA.config.commandAliases).not.toBe(pluginB.config.commandAliases);
    expect(pluginA.config.queue).not.toBe(pluginB.config.queue);
    pluginA.config.commandAliases.request.push('profile-a-only');
    pluginA.config.queue.maxLength = 9;
    expect(pluginB.config.commandAliases.request).not.toContain('profile-a-only');
    expect(pluginB.config.queue.maxLength).toBe(50);
  });
});
