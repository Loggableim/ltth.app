'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const { performImport } = require('../modules/backup/importer');
const { DEFAULT_STATE } = require('../modules/backup/schnorrbecher-state-schema');

for (const mode of ['success', 'rollback', 'recovery']) {
  const rollbackFails = mode === 'recovery';
  const installFails = mode !== 'success';
  test(`scoped report excludes rolled-back files, preserves truthful settings count; mode=${mode}`, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-backup-report-'));
    let db;
    const originalCopy = fs.copyFileSync;
    const originalLink = fs.linkSync;
    try {
      const configDir = path.join(root, 'user_configs');
      const targetDir = path.join(root, 'plugins/schnorrbecher/profiles/profile_b/data');
      fs.mkdirSync(configDir, { recursive: true });
      fs.mkdirSync(targetDir, { recursive: true });
      db = new Database(path.join(configDir, 'profile_b.db'));
      db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT)');
      const targetState = path.join(targetDir, 'coin-jar-state.json');
      const targetConfig = path.join(targetDir, 'coin-jar-config.json');
      const original = JSON.stringify(DEFAULT_STATE);
      fs.writeFileSync(targetState, original);
      const sourceConfig = path.join(root, 'source-config.json');
      const sourceState = path.join(root, 'source-state.json');
      fs.writeFileSync(sourceConfig, JSON.stringify({ persistenceMode: 'persistent' }));
      fs.writeFileSync(sourceState, JSON.stringify({ ...DEFAULT_STATE, totalCoinValue: 321 }));
      const parsed = {
        manifest: { sourceProfile: 'profile_a', profileScopedDataPlugins: ['schnorrbecher'] },
        globalSettings: {}, pluginSettings: { schnorrbecher: { example: 'restored-setting' } },
        dataFiles: { schnorrbecher: [
          { relPath: 'coin-jar-config.json', tmpPath: sourceConfig },
          { relPath: 'coin-jar-state.json', tmpPath: sourceState }
        ] }, warnings: [], errors: []
      };
      const store = {
        getPluginsDir: () => path.join(root, 'plugins'),
        getPluginDataDir: (id, options = {}) => path.join(root, 'plugins', id, ...(options.profileId ? ['profiles', options.profileId] : []), 'data'),
        getUserConfigsDir: () => configDir
      };
      fs.copyFileSync = (source, dest, flags) => {
        if (installFails && dest === targetState) throw new Error('synthetic second-file install failure');
        return originalCopy(source, dest, flags);
      };
      fs.linkSync = (source, dest) => {
        if (rollbackFails && dest === targetState) throw new Error('synthetic rollback failure');
        return originalLink(source, dest);
      };
      const result = await performImport(parsed, { db, configPathManager: store, activeProfile: 'profile_b' }, {
        mode: 'merge', includeGlobalSettings: false, includePluginSettings: true,
        includePluginData: true, includeProfileScopedPluginData: true,
        includeSchnorrbecherPersistentState: true, targetProfile: 'profile_b',
        includeUserConfigs: false, includeUploads: false, includeUserData: false
      });
      expect(result.success).toBe(!installFails);
      expect(fs.existsSync(targetConfig)).toBe(!installFails);
      expect(result.report.plugins.schnorrbecher.importedSettings).toContain('example');
      expect(db.prepare('SELECT value FROM settings WHERE key=?').get('plugin:schnorrbecher:example').value).toBe('"restored-setting"');
      if (rollbackFails) {
        const stage = fs.readdirSync(targetDir).find(name => name.startsWith('.ltth-backup-stage-'));
        expect(fs.readFileSync(path.join(targetDir, stage, '.previous-0'), 'utf8')).toBe(original);
        expect(result.errors.join(' ')).toContain('recovery data retained');
      } else {
        expect(fs.readFileSync(targetState, 'utf8')).toBe(installFails
          ? original : JSON.stringify({ ...DEFAULT_STATE, totalCoinValue: 321 }));
      }
      expect(result.report.plugins.schnorrbecher.importedFiles).toEqual(installFails
        ? [] : ['coin-jar-config.json', 'coin-jar-state.json']);
    } finally {
      fs.copyFileSync = originalCopy;
      fs.linkSync = originalLink;
      if (db?.open) db.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
