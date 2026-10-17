const fs = require('fs');
const os = require('os');
const path = require('path');

const { createDocsCaptureChildEnvironment } = require('../../scripts/lib/docs-capture-child-env');

describe('docs capture child environment', () => {
  let tempDir;
  let profileDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-docs-env-test-'));
    profileDir = fs.mkdtempSync(path.join(tempDir, 'profile-'));
  });

  afterEach(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  test('passes only platform essentials and explicit isolated capture values', () => {
    const pluginDir = path.join(profileDir, 'plugins');
    fs.mkdirSync(pluginDir);
    const env = createDocsCaptureChildEnvironment({
      profileDir,
      port: 43123,
      allowedPluginIds: [],
      pluginDir,
      inheritedEnv: {
        SystemRoot: 'C:\\Windows',
        WINDIR: 'C:\\Windows',
        PATH: 'C:\\unsafe-tools',
        NODE_OPTIONS: '--require C:\\unsafe-preload.js',
        HTTPS_PROXY: 'http://proxy.invalid',
        FISHAUDIO_API_KEY: 'must-not-pass'
      },
      tempDir,
      platform: 'win32'
    });

    expect(env).toEqual({
      SystemRoot: 'C:\\Windows',
      WINDIR: 'C:\\Windows',
      HOMEDRIVE: '',
      HOMEPATH: '',
      LOGONSERVER: '',
      PATH: '',
      SYSTEMDRIVE: '',
      USERDOMAIN: '',
      USERNAME: '',
      USERPROFILE: '',
      TEMP: tempDir,
      TMP: tempDir,
      LOCALAPPDATA: profileDir,
      LTTH_LOG_DIR: path.join(profileDir, 'logs'),
      LTTH_PORT: '43123',
      LTTH_DOCS_CAPTURE: 'true',
      LTTH_DOCS_CAPTURE_ALLOWED_PLUGINS: '',
      LTTH_DISABLE_TIKTOK_AUTO_RECONNECT: 'true',
      LTTH_NO_BROWSER: 'true',
      DISABLE_SWAGGER: 'true',
      LTTH_BIND_ADDRESS: '127.0.0.1',
      LTTH_DOCS_CAPTURE_PLUGIN_DIR: pluginDir
    });
    expect(Object.values(env).join('\n')).not.toContain('must-not-pass');
    expect(env.PATH).toBe('');
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(env.HTTPS_PROXY).toBeUndefined();
  });

  test('serializes a non-empty plugin allowlist exactly', () => {
    const pluginDir = path.join(profileDir, 'plugins');
    for (const pluginId of ['sidekick', 'stream-monsters']) {
      const pluginRoot = path.join(pluginDir, pluginId);
      fs.mkdirSync(pluginRoot, { recursive: true });
      fs.writeFileSync(path.join(pluginRoot, 'plugin.json'), JSON.stringify({ id: pluginId, enabled: true }));
    }

    const env = createDocsCaptureChildEnvironment({
      profileDir,
      port: 43124,
      allowedPluginIds: ['sidekick', 'stream-monsters'],
      pluginDir,
      inheritedEnv: {},
      tempDir,
      platform: 'linux'
    });

    expect(env.LTTH_DOCS_CAPTURE_ALLOWED_PLUGINS).toBe('sidekick,stream-monsters');
    expect(env.TMPDIR).toBe(tempDir);
    expect(env.LOCALAPPDATA).toBe(profileDir);
  });

  test('rejects a fixture whose directory set differs from the allowlist', () => {
    const pluginDir = path.join(profileDir, 'plugins');
    fs.mkdirSync(path.join(pluginDir, 'sidekick'), { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'sidekick', 'plugin.json'), JSON.stringify({ id: 'sidekick', enabled: true }));
    fs.mkdirSync(path.join(pluginDir, 'unexpected'));

    expect(() => createDocsCaptureChildEnvironment({
      profileDir,
      port: 43125,
      allowedPluginIds: ['sidekick'],
      pluginDir,
      inheritedEnv: {},
      tempDir,
      platform: 'linux'
    })).toThrow(/does not match its explicit allowlist/);
  });

  test('rejects outside-temp profiles, outside-profile fixtures, and invalid ports', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-docs-outside-'));
    try {
      expect(() => createDocsCaptureChildEnvironment({
        profileDir: outside,
        port: 43126,
        allowedPluginIds: [],
        inheritedEnv: {},
        tempDir,
        platform: 'linux'
      })).toThrow(/unique child of the system temp directory/);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }

    expect(() => createDocsCaptureChildEnvironment({
      profileDir,
      port: 43126,
      allowedPluginIds: [],
      pluginDir: path.join(tempDir, 'outside-fixture'),
      inheritedEnv: {},
      tempDir,
      platform: 'linux'
    })).toThrow(/must remain inside its isolated profile/);
    expect(() => createDocsCaptureChildEnvironment({
      profileDir,
      port: 0,
      allowedPluginIds: [],
      inheritedEnv: {},
      tempDir,
      platform: 'linux'
    })).toThrow(/valid local port/);
  });

  test('runner does not spread the calling process environment', () => {
    const runner = fs.readFileSync(path.resolve(__dirname, '../../scripts/capture-product-screenshots.js'), 'utf8');
    expect(runner).toContain('createDocsCaptureChildEnvironment({');
    expect(runner).toContain('allowedPluginIds: docsCaptureAllowedPluginIds');
    expect(runner).not.toContain('...process.env');
  });
});
