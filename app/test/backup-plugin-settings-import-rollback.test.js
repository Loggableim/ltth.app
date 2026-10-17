'use strict';

const fs = require('fs');
const path = require('path');
const DatabaseManager = require('../modules/database');
const { performImport } = require('../modules/backup/importer');

describe('backup plugin settings import transaction', () => {
  test('rolls back an earlier plugin group when preparing a later group fails', async () => {
    const root = fs.mkdtempSync(path.join(__dirname, '.backup-plugin-settings-rollback-'));
    const manager = new DatabaseManager(path.join(root, 'profile.db'), null, {
      registerShutdownHandlers: false
    });

    try {
      manager.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
        .run('plugin:existing:keep', JSON.stringify('before-import'));
      const before = manager.prepare('SELECT key, value FROM settings ORDER BY key').all();
      const originalPrepare = manager.prepare.bind(manager);
      let pluginInsertStatements = 0;
      let failOnce = true;

      // restorePluginSettings prepares one INSERT statement per plugin group.
      // Fail while preparing group two, after group one has committed its own
      // inner transaction, to verify performImport's outer rollback boundary.
      manager.prepare = sql => {
        if (failOnce && /^\s*INSERT INTO settings\s*\(/i.test(sql) && ++pluginInsertStatements === 2) {
          failOnce = false;
          throw new Error('synthetic second-plugin statement setup failure');
        }
        return originalPrepare(sql);
      };

      const result = await performImport({
        manifest: { profileScopedDataPlugins: [] },
        globalSettings: null,
        pluginSettings: {
          coinbattle: { first_group: 'must-roll-back' },
          gcce: { second_group: 'must-not-commit' }
        },
        dataFiles: {},
        userConfigsFiles: [],
        uploadFiles: [],
        userDataFiles: [],
        warnings: [],
        errors: []
      }, {
        db: manager,
        configPathManager: {},
        activeProfile: 'synthetic-profile'
      }, {
        mode: 'merge',
        includeGlobalSettings: false,
        includePluginSettings: true,
        includePluginData: false,
        includeUserConfigs: false,
        includeUploads: false,
        includeUserData: false
      });

      manager.prepare = originalPrepare;
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toContain('synthetic second-plugin statement setup failure');
      expect(result.report.plugins.coinbattle.importedSettings).toEqual([]);
      expect(manager.prepare('SELECT key, value FROM settings ORDER BY key').all()).toEqual(before);
    } finally {
      manager.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
