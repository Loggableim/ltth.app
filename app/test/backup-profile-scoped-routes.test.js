const express = require('express');
const request = require('supertest');
const ConfigImportPlugin = require('../plugins/config-import/main');

describe('config-import profile-scoped backup route', () => {
  test('passes explicit target and persistent-state choices to the importer', async () => {
    const app = express();
    app.use(express.json());
    const router = express.Router();
    app.use(router);
    const parsed = { errors: [], warnings: [], manifest: {}, dataFiles: {} };
    const importBackup = jest.fn().mockResolvedValue({
      success: true, report: {}, warnings: [], errors: []
    });
    const backupManager = {
      parseBackup: jest.fn().mockResolvedValue(parsed),
      import: importBackup
    };
    const api = {
      log: jest.fn(),
      getBackupManager: () => backupManager,
      registerRoute: (method, route, ...handlers) => router[method.toLowerCase()](route, ...handlers)
    };
    const plugin = new ConfigImportPlugin(api);
    await plugin.init();

    await request(app)
      .post('/api/config-backup/import')
      .attach('backup', Buffer.from('synthetic archive fixture'), {
        filename: 'profile-backup.zip', contentType: 'application/zip'
      })
      .field('mode', 'merge')
      .field('includeGlobalSettings', 'false')
      .field('includePluginSettings', 'false')
      .field('includePluginData', 'true')
      .field('includeProfileScopedPluginData', 'true')
      .field('includeSchnorrbecherPersistentState', 'true')
      .field('targetProfile', 'profile_b')
      .expect(200);

    expect(importBackup).toHaveBeenCalledWith(parsed, expect.objectContaining({
      includeProfileScopedPluginData: true,
      includeSchnorrbecherPersistentState: true,
      targetProfile: 'profile_b'
    }));
  });
});
