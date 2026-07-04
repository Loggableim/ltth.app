'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  discoverLegacyConfigCandidates,
  scanImportPath
} = require('../modules/legacy-config-discovery');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-legacy-discovery-'));
}

function writeFile(filePath, content = 'x') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

describe('legacy config discovery', () => {
  test('detects an old persistent config directory with profile DBs and plugin data', () => {
    const root = makeTempDir();
    const legacyDir = path.join(root, 'pupcidslittletiktokhelper');
    const currentDir = path.join(root, 'ltth.app');

    writeFile(path.join(legacyDir, 'user_configs', 'pupcid.db'), 'sqlite');
    writeFile(path.join(legacyDir, 'user_configs', 'pupcid_plugins_state.json'), '{}');
    writeFile(path.join(legacyDir, 'plugins', 'soundboard', 'data', 'sounds.json'), '{}');
    writeFile(path.join(currentDir, 'user_configs', 'pupcid.db'), 'current');

    const candidates = discoverLegacyConfigCandidates({
      currentConfigDir: currentDir,
      searchRoots: [{ path: legacyDir, label: 'old config', source: 'test' }]
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].actualPath).toBe(path.resolve(legacyDir));
    expect(candidates[0].findings.userConfigs).toBe(true);
    expect(candidates[0].findings.plugins).toBe(true);
    expect(candidates[0].findings.counts.profileDatabases).toBe(1);
    expect(candidates[0].recommended).toBe(true);
  });

  test('ignores placeholder-only user_configs directories', () => {
    const root = makeTempDir();
    writeFile(path.join(root, 'user_configs', '.gitkeep'), 'placeholder');
    writeFile(path.join(root, 'user_configs', 'test-config.json'), '{}');

    const scan = scanImportPath(root);

    expect(scan.valid).toBe(false);
  });

  test('detects config data in an app subdirectory', () => {
    const root = makeTempDir();
    const appDir = path.join(root, 'old-install', 'app');
    writeFile(path.join(appDir, 'user_configs', 'streamer.db'), 'sqlite');

    const scan = scanImportPath(path.join(root, 'old-install'));

    expect(scan.valid).toBe(true);
    expect(scan.actualPath).toBe(path.resolve(appDir));
    expect(scan.detectedSubdirectory).toBe('app');
  });

  test('excludes the current active config directory from discovery', () => {
    const root = makeTempDir();
    const currentDir = path.join(root, 'ltth.app');
    writeFile(path.join(currentDir, 'user_configs', 'active.db'), 'sqlite');

    const candidates = discoverLegacyConfigCandidates({
      currentConfigDir: currentDir,
      searchRoots: [{ path: currentDir, label: 'current', source: 'test' }]
    });

    expect(candidates).toHaveLength(0);
  });

  test('skips current app-directory cache data when no profile-like config exists', () => {
    const root = makeTempDir();
    const appDir = path.join(root, 'app');
    writeFile(path.join(appDir, 'user_data', 'puppeteer_profile', 'cache.log'), 'cache');
    writeFile(path.join(appDir, 'plugins', 'example', 'data', 'runtime.log'), 'log');

    const candidates = discoverLegacyConfigCandidates({
      currentConfigDir: path.join(root, 'ltth.app'),
      searchRoots: [{ path: appDir, label: 'app', source: 'app-directory' }]
    });

    expect(candidates).toHaveLength(0);
  });
});
