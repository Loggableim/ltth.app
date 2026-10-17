'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const ConfigPathManager = require('../modules/config-path-manager');
const { archiveStartupLogs } = require('../modules/log-paths');
const { createDocsCaptureChildEnvironment } = require('../../scripts/lib/docs-capture-child-env');

describe('documentation capture isolation', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-docs-isolation-test-'));
  });

  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('uses only its temp profile and skips bootstrap paths and legacy data migration', () => {
    const appDir = path.join(tempDir, 'app');
    const profileDir = path.join(tempDir, 'profile');
    const customConfigDir = path.join(tempDir, 'real-user-config');
    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(profileDir, { recursive: true });
    fs.mkdirSync(customConfigDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, '.config_path'), customConfigDir);
    fs.writeFileSync(path.join(customConfigDir, 'must-not-touch.txt'), 'keep');

    for (const directory of ['user_configs', 'user_data', 'uploads']) {
      fs.mkdirSync(path.join(appDir, directory), { recursive: true });
      fs.writeFileSync(path.join(appDir, directory, 'sentinel.txt'), directory);
    }

    const manager = new ConfigPathManager({
      appDir,
      env: { LTTH_DOCS_CAPTURE: 'true', LOCALAPPDATA: profileDir }
    });
    manager.ensureDirectoriesExist();

    expect(manager.migrateFromAppDirectory()).toBe(false);
    expect(manager.getConfigDir()).toBe(path.join(profileDir, 'ltth.app'));
    expect(fs.existsSync(path.join(customConfigDir, '.write_test'))).toBe(false);
    expect(fs.readFileSync(path.join(customConfigDir, 'must-not-touch.txt'), 'utf8')).toBe('keep');
    for (const directory of ['user_configs', 'user_data', 'uploads']) {
      expect(fs.existsSync(path.join(manager.getConfigDir(), directory, 'sentinel.txt'))).toBe(false);
      expect(fs.readFileSync(path.join(appDir, directory, 'sentinel.txt'), 'utf8')).toBe(directory);
    }
  });

  test('fails closed if the capture profile is outside the system temp directory', () => {
    expect(() => new ConfigPathManager({
      appDir: tempDir,
      env: { LTTH_DOCS_CAPTURE: 'true', LOCALAPPDATA: path.dirname(os.tmpdir()) }
    })).toThrow(/inside the system temp directory/);
  });

  test('keeps isolated and legacy logs even when archiving is explicitly requested', () => {
    const profileDir = path.join(tempDir, 'profile');
    const isolatedLogs = path.join(profileDir, 'logs');
    const legacyLogs = path.join(tempDir, 'app', 'logs');
    fs.mkdirSync(isolatedLogs, { recursive: true });
    fs.mkdirSync(legacyLogs, { recursive: true });
    const isolatedLog = path.join(isolatedLogs, 'capture.log');
    const legacyLog = path.join(legacyLogs, 'old.log');
    fs.writeFileSync(isolatedLog, 'capture');
    fs.writeFileSync(legacyLog, 'legacy');

    const result = archiveStartupLogs({
      env: {
        LTTH_DOCS_CAPTURE: 'true',
        LOCALAPPDATA: profileDir,
        LTTH_LOG_DIR: isolatedLogs,
        NODE_ENV: 'production'
      },
      rootLogsDir: isolatedLogs,
      legacyLogsDir: legacyLogs,
      archiveRootLogs: true,
      archiveLegacyLogs: true
    });

    expect(result.archived).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(fs.readFileSync(isolatedLog, 'utf8')).toBe('capture');
    expect(fs.readFileSync(legacyLog, 'utf8')).toBe('legacy');
  });

  test('requires the configured log directory to remain inside its temp profile', () => {
    expect(() => archiveStartupLogs({
      env: {
        LTTH_DOCS_CAPTURE: 'true',
        LOCALAPPDATA: tempDir,
        LTTH_LOG_DIR: path.dirname(tempDir)
      }
    })).toThrow(/LTTH_LOG_DIR inside its isolated profile/);
  });

  test('capture launcher builds a clean child environment with an empty plugin allowlist by default', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../scripts/capture-product-screenshots.js'), 'utf8');
    const env = createDocsCaptureChildEnvironment({
      profileDir: path.join(tempDir, 'profile'),
      port: 43127,
      allowedPluginIds: [],
      inheritedEnv: {},
      tempDir,
      platform: 'linux'
    });

    expect(source).toContain('createDocsCaptureChildEnvironment({');
    expect(source).not.toContain('...process.env');
    expect(env.LTTH_LOG_DIR).toBe(path.join(tempDir, 'profile', 'logs'));
    expect(env.LTTH_DOCS_CAPTURE).toBe('true');
    expect(env.LTTH_DOCS_CAPTURE_ALLOWED_PLUGINS).toBe('');
  });
});
