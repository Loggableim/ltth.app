'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const appRoot = path.join(__dirname, '..');
const { DEFAULT_STATE } = require('../modules/backup/schnorrbecher-state-schema');
const schnorrConfig = require('../plugins/schnorrbecher/lib/config');
const { getUserConfigFileSizeLimit } = require('../modules/backup/exporter');

describe('backup public-runtime dependencies', () => {
  test('shares the Schnorrbecher default state with backup core without duplicating it', () => {
    expect(schnorrConfig.DEFAULT_STATE).toBe(DEFAULT_STATE);
  });

  test('does not impose the regular file-size limit on profile databases or WAL sidecars', () => {
    expect(getUserConfigFileSizeLimit({ relPath: 'profile_a.db' })).toBeNull();
    expect(getUserConfigFileSizeLimit({ relPath: 'nested/profile_a.db-wal' })).toBeNull();
    expect(getUserConfigFileSizeLimit({ relPath: 'preferences.json' })).toBe(500 * 1024 * 1024);
  });

  test('loads backup importer and starts Config Import with all closed-beta sources absent', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-public-backup-startup-'));
    const publicApp = path.join(tempRoot, 'app');
    const publicModules = path.join(publicApp, 'modules');
    const publicPlugins = path.join(publicApp, 'plugins');
    try {
      fs.mkdirSync(publicModules, { recursive: true });
      fs.mkdirSync(publicPlugins, { recursive: true });
      fs.cpSync(path.join(appRoot, 'modules', 'backup'), path.join(publicModules, 'backup'), { recursive: true });
      for (const file of ['plugin-identities.js', 'plugin-identity-sync.js', 'legacy-config-discovery.js']) {
        fs.copyFileSync(path.join(appRoot, 'modules', file), path.join(publicModules, file));
      }
      fs.cpSync(path.join(appRoot, 'plugins', 'config-import'), path.join(publicPlugins, 'config-import'), { recursive: true });
      fs.symlinkSync(path.join(appRoot, 'node_modules'), path.join(publicApp, 'node_modules'), 'junction');

      const releasePolicy = JSON.parse(fs.readFileSync(path.join(appRoot, 'config', 'plugin-release-policy.json'), 'utf8'));
      for (const pluginId of releasePolicy.closedBeta) {
        expect(fs.existsSync(path.join(publicPlugins, pluginId))).toBe(false);
      }

      const importer = require(path.join(publicModules, 'backup', 'importer.js'));
      expect(importer.performImport).toEqual(expect.any(Function));
      const ConfigImportPlugin = require(path.join(publicPlugins, 'config-import', 'main.js'));
      const registeredRoutes = [];
      const plugin = new ConfigImportPlugin({
        log: jest.fn(),
        registerRoute: (...route) => registeredRoutes.push(route)
      });
      await plugin.init();
      expect(registeredRoutes.some(([, route]) => route === '/api/config-backup/import')).toBe(true);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
