const fs = require('fs');
const os = require('os');
const path = require('path');
const ConfigPathManager = require('../modules/config-path-manager');
const { PluginAPI } = require('../modules/plugin-loader');

describe('profile-scoped plugin data paths', () => {
  let root;
  let manager;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-profile-path-'));
    manager = new ConfigPathManager();
    manager.customConfigPath = root;
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('isolates profile data while preserving the legacy default path', () => {
    const legacy = manager.getPluginDataDir('advanced-timer');
    const testProfile = manager.getPluginDataDir('advanced-timer', { profileId: 'test' });
    const otherProfile = manager.getPluginDataDir('advanced-timer', { profileId: 'pupcid' });

    expect(testProfile).not.toBe(otherProfile);
    expect(testProfile).not.toBe(legacy);
    expect(testProfile).toContain(path.join('profiles', 'test', 'data'));
    expect(legacy).toBe(path.join(root, 'plugins', 'advanced-timer', 'data'));
  });

  test('rejects unsafe profile identifiers and leaves legacy data in place', () => {
    const legacy = manager.getPluginDataDir('schnorrbecher');
    fs.mkdirSync(legacy, { recursive: true });
    fs.writeFileSync(path.join(legacy, 'coin-jar-state.json'), '{"legacy":true}');

    expect(() => manager.getPluginDataDir('schnorrbecher', { profileId: '../other' })).toThrow(/Invalid profile ID/);
    expect(fs.readFileSync(path.join(legacy, 'coin-jar-state.json'), 'utf8')).toBe('{"legacy":true}');
    expect(fs.existsSync(path.join(root, 'plugins', 'schnorrbecher', 'profiles'))).toBe(false);
  });

  test('binds scoped PluginAPI requests to the active profile and keeps default requests legacy', () => {
    const getPluginDataDir = jest.spyOn(manager, 'getPluginDataDir');
    const api = new PluginAPI('schnorrbecher', root, {}, {}, {}, { info: jest.fn(), warn: jest.fn(), error: jest.fn() }, {
      plugins: new Map()
    }, manager, null, null, 'test');

    const scoped = api.getPluginDataDir({ profileScoped: true });
    const legacy = api.getPluginDataDir();

    expect(scoped).toContain(path.join('profiles', 'test', 'data'));
    expect(legacy).toBe(path.join(root, 'plugins', 'schnorrbecher', 'data'));
    expect(getPluginDataDir).toHaveBeenNthCalledWith(1, 'schnorrbecher', { profileId: 'test' });
    expect(getPluginDataDir).toHaveBeenNthCalledWith(2, 'schnorrbecher', undefined);
  });

  test('does not silently fall back to shared storage when no active profile exists', () => {
    const api = new PluginAPI('advanced-timer', root, {}, {}, {}, { info: jest.fn(), warn: jest.fn(), error: jest.fn() }, {
      plugins: new Map()
    }, manager, null, null, null);
    expect(() => api.getPluginDataDir({ profileScoped: true })).toThrow(/without an active profile/);
  });

  test('uses the same stored-name normalization as profile database paths and isolates reloaded instances', () => {
    const makeApi = profile => new PluginAPI('schnorrbecher', root, {}, {}, {}, { info: jest.fn(), warn: jest.fn(), error: jest.fn() }, {
      plugins: new Map(), sanitizeProfileName: name => name.replace(/[^a-zA-Z0-9_-]/g, '_')
    }, manager, null, null, profile);
    const existingName = makeApi('show.name').getPluginDataDir({ profileScoped: true });
    const legacyStoredName = makeApi('show_name').getPluginDataDir({ profileScoped: true });
    const reloadedOtherProfile = makeApi('second_profile').getPluginDataDir({ profileScoped: true });

    expect(existingName).toBe(legacyStoredName);
    expect(existingName).toContain(path.join('profiles', 'show_name', 'data'));
    expect(reloadedOtherProfile).not.toBe(existingName);
    expect(manager.getPluginDataDir('advanced-timer', { profileId: 'x'.repeat(64) }))
      .toContain(path.join('profiles', 'x'.repeat(64), 'data'));
  });
});
