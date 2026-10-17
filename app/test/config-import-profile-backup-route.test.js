const express = require('express');
const request = require('supertest');
const ConfigImportPlugin = require('../plugins/config-import/main');

describe('config-import profile-scoped backup controls', () => {
  test('export token route stores the profile-data opt-in for the actual backup path', async () => {
    const app = express();
    app.use(express.json());
    const router = express.Router();
    app.use(router);
    const api = {
      log: jest.fn(),
      getBackupManager: () => ({ export: jest.fn() }),
      registerRoute: (method, route, ...handlers) => router[method.toLowerCase()](route, ...handlers)
    };
    const plugin = new ConfigImportPlugin(api);
    await plugin.init();

    const response = await request(app).post('/api/config-backup/export-token').send({
      includePluginData: true,
      includeProfileScopedPluginData: true,
      includeSchnorrbecherPersistentState: true
    }).expect(200);
    const token = plugin._exportTokens.get(response.body.token);
    expect(token.opts.profileScopedDataPlugins).toEqual(['advanced-timer', 'schnorrbecher']);
    expect(token.opts.includeSchnorrbecherPersistentState).toBe(true);

    await request(app).post('/api/config-backup/export-token').send({
      includePluginData: false,
      includeProfileScopedPluginData: true
    }).expect(400);
  });
});
