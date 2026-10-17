'use strict';

const express = require('express');
const request = require('supertest');
const { Readable } = require('node:stream');
const ConfigImportPlugin = require('../plugins/config-import/main');
const { createAdminAuth } = require('../modules/admin-auth');

function createRouteHarness(backupManager) {
  const app = express();
  const adminAuth = createAdminAuth({ token: 'synthetic-admin-token' });
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    return adminAuth(req, res, next);
  });
  app.use(express.json());
  const router = express.Router();
  const api = {
    log: jest.fn(),
    getBackupManager: () => backupManager,
    registerRoute: (method, route, ...handlers) => router[method.toLowerCase()](route, ...handlers)
  };
  const plugin = new ConfigImportPlugin(api);
  plugin.registerBackupRoutes();
  app.use(router);
  return { app, api, plugin };
}

function remoteAdminRequest(call) {
  return call
    .set('X-Forwarded-For', '203.0.113.15')
    .set('Authorization', 'Bearer synthetic-admin-token');
}

const exportSelection = {
  includeGlobalSettings: true,
  includePluginSettings: false,
  includePluginData: false,
  includeUserConfigs: false,
  includeUploads: false,
  includeUserData: false,
  includeProfileScopedPluginData: false,
  includeSchnorrbecherPersistentState: false,
  includeCredentialsSessions: false,
  confirmUnclassifiedData: true
};

async function prepareExportDownload(app) {
  const preview = await remoteAdminRequest(request(app).post('/api/config-backup/preview-export'))
    .send({ ...exportSelection, confirmUnclassifiedData: false })
    .expect(200);
  expect(preview.body.unclassifiedContentRisk).toBe(true);

  const tokenResponse = await remoteAdminRequest(request(app).post('/api/config-backup/export-token'))
    .send({ ...exportSelection, exportPreviewToken: preview.body.exportPreviewToken })
    .expect(200);
  expect(tokenResponse.body.token).toMatch(/^[a-f0-9]{32}$/);
  return tokenResponse.body.token;
}

describe('config backup route security', () => {
  test('requires admin auth for remote mutations before export or import work starts', async () => {
    const backupManager = {
      export: jest.fn(),
      parseBackup: jest.fn(),
      import: jest.fn()
    };
    const { app } = createRouteHarness(backupManager);

    await request(app).post('/api/config-backup/export').set('X-Forwarded-For', '203.0.113.15').send({}).expect(401);
    await request(app).post('/api/config-backup/import').set('X-Forwarded-For', '203.0.113.15').send({}).expect(401);
    expect(backupManager.export).not.toHaveBeenCalled();
    expect(backupManager.parseBackup).not.toHaveBeenCalled();
    expect(backupManager.import).not.toHaveBeenCalled();
  });

  test.each([
    [
      'sensitive data',
      {
        includeGlobalSettings: false,
        includePluginSettings: false,
        includePluginData: false,
        includeUserConfigs: false,
        includeUploads: false,
        includeUserData: false,
        includeCredentialsSessions: true
      },
      /credentials or session data requires explicit confirmation/i
    ],
    [
      'all backup categories',
      {
        includeGlobalSettings: true,
        includePluginSettings: true,
        includePluginData: true,
        includeUserConfigs: true,
        includeUploads: true,
        includeUserData: true,
        includeProfileScopedPluginData: true,
        includeSchnorrbecherPersistentState: true,
        includeCredentialsSessions: true,
        confirmSensitiveExport: true
      },
      /full backup requires explicit confirmation/i
    ]
  ])('rejects direct API export without confirmation for %s before creating a stream', async (_caseName, body, errorPattern) => {
    const backupManager = { export: jest.fn() };
    const { app } = createRouteHarness(backupManager);

    const response = await remoteAdminRequest(request(app).post('/api/config-backup/export'))
      .send(body)
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toMatch(errorPattern);
    expect(backupManager.export).not.toHaveBeenCalled();
  });

  const confirmationOptions = {
    mode: 'merge',
    includeGlobalSettings: 'true',
    includePluginSettings: 'false',
    includePluginData: 'true',
    includeUserConfigs: 'false',
    includeUploads: 'false',
    includeUserData: 'false',
    includeProfileScopedPluginData: 'true',
    includeSchnorrbecherPersistentState: 'false',
    targetProfile: 'synthetic-target',
    confirmProfileReplacement: 'false'
  };

  function sendImportForm(app, route, bytes, fields = {}) {
    let call = remoteAdminRequest(request(app).post(route));
    for (const [key, value] of Object.entries(fields)) call = call.field(key, String(value));
    return call.attach('backup', bytes, 'synthetic.zip');
  }

  function makeImportManager(sensitiveDataIncluded) {
    const dataSelection = typeof sensitiveDataIncluded === 'boolean'
      ? { categories: ['globalSettings'], partial: true, sensitiveDataIncluded }
      : undefined;
    const parsed = {
      errors: [], warnings: [], manifest: dataSelection ? { dataSelection } : {},
      globalSettings: null, pluginSettings: {}, dataFiles: {}, userConfigsFiles: [],
      uploadFiles: [], userDataFiles: [], tmpDir: null
    };
    return {
      parsed,
      manager: {
        parseBackup: jest.fn().mockResolvedValue(parsed),
        previewImport: jest.fn(() => ({ manifest: parsed.manifest, global: {}, plugins: {} })),
        import: jest.fn().mockResolvedValue({ success: true, report: {}, warnings: [], errors: [] })
      }
    };
  }

  test.each([
    ['known-sensitive', true, 'sensitive'],
    ['legacy-unknown', undefined, 'unknown']
  ])('requires explicit import confirmation for %s archives and permits retry with unchanged preview', async (_name, sensitiveDataIncluded, expectedRisk) => {
    const { manager } = makeImportManager(sensitiveDataIncluded);
    const { app } = createRouteHarness(manager);
    const bytes = Buffer.from('synthetic archive bytes');
    const prepared = await sendImportForm(app, '/api/config-backup/preview-import', bytes, {
      ...confirmationOptions,
      prepareImport: true
    }).expect(200);

    expect(prepared.body.sensitivityRisk).toBe(expectedRisk);
    expect(prepared.body.importConfirmationToken).toMatch(/^[a-f0-9]{64}$/);
    const importFields = {
      ...confirmationOptions,
      importConfirmationToken: prepared.body.importConfirmationToken,
      confirmSensitiveImport: false
    };
    await sendImportForm(app, '/api/config-backup/import', bytes, importFields)
      .expect(400);
    expect(manager.import).not.toHaveBeenCalled();

    await sendImportForm(app, '/api/config-backup/import', bytes, {
      ...importFields,
      confirmSensitiveImport: true
    }).expect(200);
    expect(manager.import).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['archive bytes', body => body, Buffer.from('different synthetic archive')],
    ['selected section', body => ({ ...body, includeGlobalSettings: 'false' }), Buffer.from('synthetic archive bytes')],
    ['import mode', body => ({ ...body, mode: 'replace' }), Buffer.from('synthetic archive bytes')],
    ['target profile', body => ({ ...body, targetProfile: 'other-synthetic-target' }), Buffer.from('synthetic archive bytes')]
  ])('invalidates import confirmation when %s changes', async (_name, mutateFields, importBytes) => {
    const { manager } = makeImportManager(true);
    const { app } = createRouteHarness(manager);
    const originalBytes = Buffer.from('synthetic archive bytes');
    const prepared = await sendImportForm(app, '/api/config-backup/preview-import', originalBytes, {
      ...confirmationOptions,
      prepareImport: true
    }).expect(200);

    await sendImportForm(app, '/api/config-backup/import', importBytes, {
      ...mutateFields(confirmationOptions),
      importConfirmationToken: prepared.body.importConfirmationToken,
      confirmSensitiveImport: true
    }).expect(400);
    expect(manager.import).not.toHaveBeenCalled();
  });

  test('rejects direct API import without a server-issued preview token', async () => {
    const { manager } = makeImportManager(false);
    const { app } = createRouteHarness(manager);
    await sendImportForm(app, '/api/config-backup/import', Buffer.from('synthetic archive bytes'), {
      ...confirmationOptions,
      confirmSensitiveImport: true
    }).expect(400);
    expect(manager.import).not.toHaveBeenCalled();
  });

  test('returns a generic upload error for rejected file types', async () => {
    const backupManager = { parseBackup: jest.fn() };
    const { app } = createRouteHarness(backupManager);

    const response = await remoteAdminRequest(request(app).post('/api/config-backup/validate'))
      .attach('backup', Buffer.from('synthetic text'), 'fixture.txt')
      .expect(400);

    expect(response.body).toEqual({ success: false, error: 'Backup upload rejected' });
    expect(backupManager.parseBackup).not.toHaveBeenCalled();
  });

  test.each(['validate', 'preview-import', 'import'])('hides parser details in %s rejection responses', async operation => {
    const privateDetail = 'Refuse to write outside "C:\\private\\temp\\ltth-backup-secret"';
    const backupManager = {
      parseBackup: jest.fn().mockResolvedValue({ errors: [privateDetail], warnings: [privateDetail] }),
      import: jest.fn()
    };
    const { app } = createRouteHarness(backupManager);
    const response = await remoteAdminRequest(request(app).post(`/api/config-backup/${operation}`))
      .attach('backup', Buffer.from('synthetic ZIP bytes'), 'fixture.zip')
      .expect(400);

    expect(response.body).toEqual({ success: false, errors: ['Backup file is invalid or unsafe.'] });
    expect(JSON.stringify(response.body)).not.toContain(privateDetail);
    expect(backupManager.parseBackup).toHaveBeenCalledTimes(1);
    expect(backupManager.import).not.toHaveBeenCalled();
  });

  test('uses a one-time token for remote GET downloads and rejects reuse', async () => {
    const backupManager = {
      previewExport: jest.fn(() => ({ categories: {}, totals: {} })),
      export: jest.fn(async () => ({ stream: Readable.from([Buffer.from('synthetic-backup')]), warnings: [] }))
    };
    const { app } = createRouteHarness(backupManager);
    const token = await prepareExportDownload(app);

    const downloadPath = `/api/config-backup/download?token=${token}`;
    const download = await request(app).get(downloadPath).set('X-Forwarded-For', '203.0.113.15').expect(200);
    expect(download.headers['content-type']).toMatch(/application\/zip/);
    expect(download.headers['cache-control']).toBe('no-store');
    expect(download.headers['referrer-policy']).toBe('no-referrer');
    await request(app).get(downloadPath).set('X-Forwarded-For', '203.0.113.15').expect(404);
    expect(backupManager.export).toHaveBeenCalledTimes(1);
  });

  test('redacts export warnings in response headers and applies no-store on errors', async () => {
    const backupManager = {
      previewExport: jest.fn(() => ({ categories: {}, totals: {} })),
      export: jest.fn()
        .mockResolvedValueOnce({
          stream: Readable.from([Buffer.from('synthetic-backup')]),
          warnings: ['EACCES: C:\\Users\\alice\\AppData\\Local\\secret.db']
        })
        .mockRejectedValueOnce(new Error('ENOENT: /home/alice/.config/ltth/private.db'))
    };
    const { app, api } = createRouteHarness(backupManager);

    const successToken = await prepareExportDownload(app);
    const success = await request(app).get(`/api/config-backup/download?token=${successToken}`)
      .set('X-Forwarded-For', '203.0.113.15').expect(200);
    expect(success.headers['cache-control']).toBe('no-store');
    expect(success.headers['referrer-policy']).toBe('no-referrer');
    expect(success.headers['x-backup-warnings']).toContain('[local path redacted]');
    expect(success.headers['x-backup-warnings']).not.toContain('alice');

    const failureToken = await prepareExportDownload(app);
    const failure = await request(app).get(`/api/config-backup/download?token=${failureToken}`)
      .set('X-Forwarded-For', '203.0.113.15').expect(500);
    expect(failure.headers['cache-control']).toBe('no-store');
    expect(failure.headers['referrer-policy']).toBe('no-referrer');
    expect(api.log.mock.calls.flat().join(' ')).not.toContain('alice');
    expect(api.log.mock.calls.flat().join(' ')).toContain('ENOENT');
  });

  test.each(['export', 'import'])('does not return internal details from %s failures', async operation => {
    const privateDetail = 'ENOENT: synthetic private path C:\\private\\user-data\\secret.db';
    const parsed = {
      errors: [], warnings: [], manifest: { dataSelection: { categories: [], partial: true, sensitiveDataIncluded: false } }, globalSettings: null,
      pluginSettings: {}, dataFiles: {}, userConfigsFiles: [], uploadFiles: [], userDataFiles: [], tmpDir: null
    };
    const backupManager = {
      previewExport: jest.fn(() => ({ categories: {}, totals: {} })),
      export: jest.fn().mockRejectedValue(new Error(privateDetail)),
      parseBackup: jest.fn().mockResolvedValue(parsed),
      previewImport: jest.fn(() => ({ manifest: parsed.manifest })),
      import: jest.fn().mockRejectedValue(new Error(privateDetail))
    };
    const { app } = createRouteHarness(backupManager);

    const route = operation === 'export' ? '/api/config-backup/export' : '/api/config-backup/import';
    let response;
    if (operation === 'import') {
      const bytes = Buffer.from('synthetic zip');
      const options = {
        mode: 'merge', includeGlobalSettings: 'true', includePluginSettings: 'true',
        includePluginData: 'true', includeUserConfigs: 'true', includeUploads: 'false',
        includeUserData: 'false', includeProfileScopedPluginData: 'false',
        includeSchnorrbecherPersistentState: 'false', targetProfile: ''
      };
      const preview = await sendImportForm(app, '/api/config-backup/preview-import', bytes, {
        ...options, prepareImport: true
      }).expect(200);
      response = await sendImportForm(app, route, bytes, {
        ...options,
        importConfirmationToken: preview.body.importConfirmationToken,
        confirmSensitiveImport: 'true'
      }).expect(500);
    } else {
      await remoteAdminRequest(request(app).post('/api/config-backup/preview-export'))
        .send({ ...exportSelection, confirmUnclassifiedData: false })
        .expect(200);
      response = await remoteAdminRequest(request(app).post(route)).send(exportSelection).expect(500);
    }

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe(operation === 'export' ? 'Backup export failed' : 'Backup import failed');
    expect(JSON.stringify(response.body)).not.toContain(privateDetail);
    if (operation === 'import') expect(backupManager.import).toHaveBeenCalledTimes(1);
    if (operation === 'export') expect(backupManager.export).toHaveBeenCalledTimes(1);
  });
});
