'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  collectFiles
} = require('../modules/backup/file-collector');
const {
  StableOverlayRoutingCredentials
} = require('../modules/stable-overlay-routing-credentials');

function makeTempConfig() {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-stable-routing-'));
  const userDataDir = path.join(configDir, 'user_data');
  const pluginsDir = path.join(configDir, 'plugins');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(pluginsDir, { recursive: true });
  return {
    configDir,
    userDataDir,
    pluginsDir,
    manager: {
      getDefaultConfigDir: () => configDir,
      getConfigDir: () => configDir,
      getUserDataDir: () => userDataDir,
      getPluginsDir: () => pluginsDir
    }
  };
}

function enrollment(overrides = {}) {
  return {
    deviceId: 'device-123',
    credential: 'a'.repeat(64),
    enrolledAt: '2026-07-27T10:00:00.000Z',
    label: 'Streaming desktop',
    defaultUsername: 'creator.name',
    ...overrides
  };
}

describe('StableOverlayRoutingCredentials', () => {
  const roots = [];

  afterEach(() => {
    jest.restoreAllMocks();
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('isolates each profile credential inside hidden application data and outside plugins/source', () => {
    const fixture = makeTempConfig();
    roots.push(fixture.configDir);
    const sourceRoot = path.join(fixture.configDir, 'checked-out-source');
    fs.mkdirSync(sourceRoot);

    const first = new StableOverlayRoutingCredentials({
      configPathManager: fixture.manager,
      profileId: '../../Creator One',
      sourceRoot
    });
    const second = new StableOverlayRoutingCredentials({
      configPathManager: fixture.manager,
      profileId: 'Creator Two',
      sourceRoot
    });

    expect(path.relative(first.getProfileDataDir(), first.getFilePath()))
      .toBe('credentials.json');
    expect(path.relative(fixture.userDataDir, first.getFilePath()))
      .toMatch(/^\.stable-overlay-routing[\\/]+profiles[\\/]+[a-f0-9]{64}[\\/]credentials\.json$/);
    expect(path.relative(fixture.pluginsDir, first.getFilePath())).toMatch(/^\.\./);
    expect(path.relative(sourceRoot, first.getFilePath())).toMatch(/^\.\./);
    expect(first.getFilePath()).not.toBe(second.getFilePath());
  });

  test('preserves profile case when deriving credential identity', () => {
    const fixture = makeTempConfig();
    roots.push(fixture.configDir);
    const upper = new StableOverlayRoutingCredentials({
      configPathManager: fixture.manager,
      profileId: 'Creator',
      sourceRoot: path.join(fixture.configDir, 'source')
    });
    const lower = new StableOverlayRoutingCredentials({
      configPathManager: fixture.manager,
      profileId: 'creator',
      sourceRoot: path.join(fixture.configDir, 'source')
    });

    expect(upper.getFilePath()).not.toBe(lower.getFilePath());
  });

  test('keeps credentials in the fixed default user root when config is redirected', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-stable-custom-root-'));
    roots.push(root);
    const defaultConfigDir = path.join(root, 'default-user-root');
    const customConfigDir = path.join(root, 'shared-custom-root');
    const customUserDataDir = path.join(customConfigDir, 'user_data');
    const customPluginsDir = path.join(customConfigDir, 'plugins');
    fs.mkdirSync(path.join(defaultConfigDir, 'user_data'), { recursive: true });
    fs.mkdirSync(customUserDataDir, { recursive: true });
    fs.mkdirSync(customPluginsDir, { recursive: true });
    const manager = {
      getDefaultConfigDir: () => defaultConfigDir,
      getConfigDir: () => customConfigDir,
      getUserDataDir: () => customUserDataDir,
      getPluginsDir: () => customPluginsDir
    };
    const store = new StableOverlayRoutingCredentials({
      configPathManager: manager,
      profileId: 'Creator',
      sourceRoot: path.join(root, 'source')
    });

    expect(path.relative(
      path.join(defaultConfigDir, 'user_data'),
      store.getFilePath()
    )).toMatch(/^\.stable-overlay-routing[\\/]/);
    expect(path.relative(customConfigDir, store.getFilePath())).toMatch(/^\.\./);
    store.save(enrollment());
    expect(fs.existsSync(
      path.join(customUserDataDir, '.stable-overlay-routing')
    )).toBe(false);
  });

  test('rejects a configuration root that would put credentials in source or plugin paths', () => {
    const fixture = makeTempConfig();
    roots.push(fixture.configDir);

    expect(() => new StableOverlayRoutingCredentials({
      configPathManager: fixture.manager,
      profileId: 'creator',
      sourceRoot: fixture.configDir
    })).toThrow(/outside application source/i);

    const pluginManager = {
      ...fixture.manager,
      getDefaultConfigDir: () => path.join(
        fixture.pluginsDir,
        'credential-data'
      )
    };
    expect(() => new StableOverlayRoutingCredentials({
      configPathManager: pluginManager,
      profileId: 'creator',
      sourceRoot: path.join(fixture.configDir, 'other-source')
    })).toThrow(/outside plugin paths/i);
  });

  test('rejects a redirected credential directory before writing through it', () => {
    const fixture = makeTempConfig();
    roots.push(fixture.configDir);
    const sourceRoot = path.join(fixture.configDir, 'source');
    fs.mkdirSync(sourceRoot);
    fs.symlinkSync(
      sourceRoot,
      path.join(fixture.userDataDir, '.stable-overlay-routing'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );

    expect(() => new StableOverlayRoutingCredentials({
      configPathManager: fixture.manager,
      profileId: 'creator',
      sourceRoot
    })).toThrow(/credential storage/i);
    expect(fs.existsSync(path.join(sourceRoot, 'profiles'))).toBe(false);
  });

  test('rejects a profile directory redirected after construction', () => {
    const fixture = makeTempConfig();
    roots.push(fixture.configDir);
    const sourceRoot = path.join(fixture.configDir, 'source');
    const externalProfileDir = path.join(sourceRoot, 'forged-profile');
    fs.mkdirSync(externalProfileDir, { recursive: true });
    const store = new StableOverlayRoutingCredentials({
      configPathManager: fixture.manager,
      profileId: 'creator',
      sourceRoot
    });
    fs.rmdirSync(store.getProfileDataDir());
    fs.writeFileSync(
      path.join(externalProfileDir, 'credentials.json'),
      JSON.stringify(enrollment())
    );
    fs.symlinkSync(
      externalProfileDir,
      store.getProfileDataDir(),
      process.platform === 'win32' ? 'junction' : 'dir'
    );

    expect(() => store.load()).toThrow(
      expect.objectContaining({ code: 'STABLE_OVERLAY_CREDENTIAL_INVALID' })
    );
  });

  test('persists only the approved fields with restrictive permissions and backup exclusion', () => {
    const fixture = makeTempConfig();
    roots.push(fixture.configDir);
    const store = new StableOverlayRoutingCredentials({
      configPathManager: fixture.manager,
      profileId: 'creator',
      sourceRoot: path.join(fixture.configDir, 'source')
    });

    store.save({
      ...enrollment(),
      clerkJwt: 'must-not-be-written',
      tunnelOrigin: 'https://secret.trycloudflare.com',
      revision: 99
    });

    expect(JSON.parse(fs.readFileSync(store.getFilePath(), 'utf8'))).toEqual(enrollment());
    expect(store.load()).toEqual(enrollment());
    expect(fs.readdirSync(store.getProfileDataDir()))
      .toEqual(['credentials.json']);

    if (process.platform !== 'win32') {
      expect(fs.statSync(store.getProfileDataDir()).mode & 0o777).toBe(0o700);
      expect(fs.statSync(store.getFilePath()).mode & 0o777).toBe(0o600);
    }

    const collected = collectFiles(fixture.userDataDir, fixture.userDataDir);
    expect(collected.files).toEqual([]);
  });

  test('atomically preserves the previous credential if replacement fails', () => {
    const fixture = makeTempConfig();
    roots.push(fixture.configDir);
    const store = new StableOverlayRoutingCredentials({
      configPathManager: fixture.manager,
      profileId: 'creator',
      sourceRoot: path.join(fixture.configDir, 'source')
    });
    store.save(enrollment());
    const previous = fs.readFileSync(store.getFilePath(), 'utf8');
    const realRename = fs.renameSync;

    jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (to === store.getFilePath()) {
        throw Object.assign(new Error('simulated rename failure'), { code: 'EACCES' });
      }
      return realRename(from, to);
    });

    expect(() => store.save(enrollment({
      credential: 'b'.repeat(64),
      enrolledAt: '2026-07-27T11:00:00.000Z'
    }))).toThrow(/simulated rename failure/);
    expect(fs.readFileSync(store.getFilePath(), 'utf8')).toBe(previous);
    expect(fs.readdirSync(store.getProfileDataDir()))
      .toEqual(['credentials.json']);
  });

  test('updates only the selected default username and retains enrollment material', () => {
    const fixture = makeTempConfig();
    roots.push(fixture.configDir);
    const store = new StableOverlayRoutingCredentials({
      configPathManager: fixture.manager,
      profileId: 'creator',
      sourceRoot: path.join(fixture.configDir, 'source')
    });
    store.save(enrollment());

    expect(store.setDefaultUsername('new.name')).toEqual(enrollment({
      defaultUsername: 'new.name'
    }));
    expect(store.load()).toEqual(enrollment({
      defaultUsername: 'new.name'
    }));
  });

  test('removes a revoked enrollment without touching another profile', () => {
    const fixture = makeTempConfig();
    roots.push(fixture.configDir);
    const first = new StableOverlayRoutingCredentials({
      configPathManager: fixture.manager,
      profileId: 'creator-one',
      sourceRoot: path.join(fixture.configDir, 'source')
    });
    const second = new StableOverlayRoutingCredentials({
      configPathManager: fixture.manager,
      profileId: 'creator-two',
      sourceRoot: path.join(fixture.configDir, 'source')
    });
    first.save(enrollment());
    second.save(enrollment({ deviceId: 'device-456' }));

    expect(first.remove()).toBe(true);
    expect(first.load()).toBeNull();
    expect(second.load()).toEqual(enrollment({ deviceId: 'device-456' }));
    expect(first.remove()).toBe(false);
  });

  test('rejects malformed persisted credential data without returning secrets', () => {
    const fixture = makeTempConfig();
    roots.push(fixture.configDir);
    const store = new StableOverlayRoutingCredentials({
      configPathManager: fixture.manager,
      profileId: 'creator',
      sourceRoot: path.join(fixture.configDir, 'source')
    });
    fs.mkdirSync(store.getProfileDataDir(), { recursive: true });
    fs.writeFileSync(store.getFilePath(), JSON.stringify({
      ...enrollment(),
      clerkJwt: 'unexpected'
    }));

    expect(() => store.load()).toThrow(
      expect.objectContaining({ code: 'STABLE_OVERLAY_CREDENTIAL_INVALID' })
    );
  });
});
