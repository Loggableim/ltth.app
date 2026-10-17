'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const archiver = require('archiver');
const ConfigImportPlugin = require('../plugins/config-import/main');
const { createManifest, FORMAT_VERSION } = require('../modules/backup/manifest');
const { parseBackupZip } = require('../modules/backup/importer');

function createDirectRouteHarness(backupManager) {
  const routes = new Map();
  const plugin = new ConfigImportPlugin({
    log() {},
    getBackupManager: () => backupManager,
    registerRoute: (method, route, ...handlers) => routes.set(`${method} ${route}`, handlers)
  });
  plugin.registerBackupRoutes();
  return { plugin, routes };
}

function makeResponse() {
  return {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; }
  };
}

async function invokeUploadRoute(harness, route, bytes, body = {}) {
  const filePath = path.join(__dirname, `.synthetic-backup-${crypto.randomBytes(8).toString('hex')}.zip`);
  fs.writeFileSync(filePath, bytes);
  const request = {
    body,
    file: { path: filePath, size: bytes.length, originalname: 'synthetic.zip', mimetype: 'application/zip' },
    query: {}
  };
  const response = makeResponse();
  try {
    const handlers = harness.routes.get(`POST ${route}`);
    await handlers.at(-1)(request, response);
    return response;
  } finally {
    try { fs.unlinkSync(filePath); } catch { /* route may have removed its upload */ }
  }
}

async function createChecksummedUnsignedFalseArchive() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-synthetic-unsigned-backup-'));
  const zipPath = path.join(root, 'synthetic.zip');
  const entries = {
    'manifest.json': Buffer.from(JSON.stringify(createManifest({
      plugins: [{ id: 'fixture' }],
      warnings: [],
      dataSelection: { categories: ['pluginSettings'], partial: true, sensitiveDataIncluded: false }
    }))),
    'plugins/fixture/settings.json': Buffer.from(JSON.stringify({ apiKey: 'SYNTHETIC_SECRET_SENTINEL' }))
  };
  const files = Object.fromEntries(Object.entries(entries).map(([name, content]) => [name, {
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    sizeBytes: content.length
  }]));
  entries['checksums.json'] = Buffer.from(JSON.stringify({ formatVersion: FORMAT_VERSION, files }));
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip');
  archive.pipe(output);
  for (const [name, content] of Object.entries(entries)) archive.append(content, { name });
  await new Promise((resolve, reject) => {
    output.once('close', resolve);
    archive.once('error', reject);
    archive.finalize();
  });
  return { root, zipPath, bytes: fs.readFileSync(zipPath) };
}

const options = {
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

function managerFor(sensitiveDataIncluded, userConfigsFiles = []) {
  const dataSelection = typeof sensitiveDataIncluded === 'boolean'
    ? { categories: ['globalSettings'], partial: true, sensitiveDataIncluded }
    : undefined;
  const parsed = {
    errors: [], warnings: [], manifest: dataSelection ? { dataSelection } : {},
    globalSettings: null,
    pluginSettings: sensitiveDataIncluded === false
      ? { synthetic: { apiKey: 'SYNTHETIC_SECRET_SENTINEL' } }
      : {},
    dataFiles: {}, userConfigsFiles,
    uploadFiles: [], userDataFiles: [], tmpDir: null
  };
  return {
    parsed,
    backupManager: {
      parseBackup: jest.fn().mockResolvedValue(parsed),
      previewImport: jest.fn(() => ({ manifest: parsed.manifest, plugins: {}, global: {} })),
      import: jest.fn().mockResolvedValue({ success: true, report: {}, warnings: [], errors: [] })
    }
  };
}

async function prepare(harness, bytes, fields = options) {
  const response = await invokeUploadRoute(harness, '/api/config-backup/preview-import', bytes, {
    ...fields,
    prepareImport: 'true'
  });
  expect(response.statusCode).toBe(200);
  expect(response.body.success).toBe(true);
  expect(response.body.importConfirmationToken).toMatch(/^[a-f0-9]{64}$/);
  return response.body;
}

describe('backup import confirmation binding', () => {
  test.each([
    [
      'sensitive data',
      {
        includeGlobalSettings: false, includePluginSettings: false, includePluginData: false,
        includeUserConfigs: false, includeUploads: false, includeUserData: false,
        includeCredentialsSessions: true
      },
      /credentials or session data requires explicit confirmation/i
    ],
    [
      'all categories',
      {
        includeGlobalSettings: true, includePluginSettings: true, includePluginData: true,
        includeUserConfigs: true, includeUploads: true, includeUserData: true,
        includeProfileScopedPluginData: true, includeSchnorrbecherPersistentState: true,
        includeCredentialsSessions: true, confirmSensitiveExport: true
      },
      /full backup requires explicit confirmation/i
    ]
  ])('enforces direct export confirmation for %s before exporter work', async (_name, body, expectedError) => {
    const backupManager = { export: jest.fn() };
    const harness = createDirectRouteHarness(backupManager);
    const response = makeResponse();
    const handlers = harness.routes.get('POST /api/config-backup/export');
    await handlers.at(-1)({ body }, response);
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toMatch(expectedError);
    expect(backupManager.export).not.toHaveBeenCalled();
  });

  test('rejects unrecognized strings as export confirmation values', async () => {
    const backupManager = { export: jest.fn() };
    const harness = createDirectRouteHarness(backupManager);
    const response = makeResponse();
    await harness.routes.get('POST /api/config-backup/export').at(-1)({ body: {
      includeGlobalSettings: false, includePluginSettings: false, includePluginData: false,
      includeUserConfigs: false, includeUploads: false, includeUserData: false,
      includeCredentialsSessions: true, confirmSensitiveExport: 'certainly'
    } }, response);
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toMatch(/credentials or session data requires explicit confirmation/i);
    expect(backupManager.export).not.toHaveBeenCalled();
  });

  test('allows direct full export only when both required confirmations are true', async () => {
    const backupManager = {
      export: jest.fn(async () => ({
        stream: { on() {}, pipe(response) { response.piped = true; } }, warnings: []
      }))
    };
    const harness = createDirectRouteHarness(backupManager);
    const response = makeResponse();
    const handlers = harness.routes.get('POST /api/config-backup/export');
    await handlers.at(-1)({ body: {
      includeGlobalSettings: true, includePluginSettings: true, includePluginData: true,
      includeUserConfigs: true, includeUploads: true, includeUserData: true,
      includeProfileScopedPluginData: true, includeSchnorrbecherPersistentState: true,
      includeCredentialsSessions: true, confirmSensitiveExport: true, confirmFullBackup: true,
      confirmUnclassifiedData: true
    } }, response);
    expect(backupManager.export).toHaveBeenCalledTimes(1);
    expect(response.piped).toBe(true);
  });

  test.each([
    'globalSettings', 'pluginSettings', 'profileDatabases', 'userData', 'pluginFiles', 'uploads',
    'profileScopedPluginData', 'schnorrbecherPersistentState'
  ])('marks %s as containing potentially unclassified content', async category => {
    const backupManager = { previewExport: jest.fn(() => ({ categories: {}, totals: {} })) };
    const harness = createDirectRouteHarness(backupManager);
    const response = makeResponse();
    await harness.routes.get('POST /api/config-backup/preview-export').at(-1)(
      { body: {
        globalSettings: false, pluginSettings: false, profileDatabases: false,
        userData: false, pluginFiles: false, uploads: false,
        profileScopedPluginData: false, schnorrbecherPersistentState: false,
        credentialsAndSessions: false, [category]: true
      } }, response
    );
    expect(response.statusCode).toBe(200);
    expect(response.body.unclassifiedContentRisk).toBe(true);
    expect(response.body.exportPreviewToken).toMatch(/^[a-f0-9]{64}$/);
    expect(backupManager.previewExport).toHaveBeenCalledWith(expect.objectContaining({ [category]: true }));
  });

  test('marks both settings categories as potentially containing unclassified values', async () => {
    const backupManager = { previewExport: jest.fn(() => ({ categories: {}, totals: {} })) };
    const harness = createDirectRouteHarness(backupManager);
    const response = makeResponse();
    await harness.routes.get('POST /api/config-backup/preview-export').at(-1)(
      { body: { globalSettings: true, pluginSettings: true, profileDatabases: false, pluginFiles: false, uploads: false, userData: false } }, response
    );
    expect(response.body.unclassifiedContentRisk).toBe(true);
  });

  test.each([undefined, false, 'certainly'])('requires strict unclassified-content confirmation before issuing an export token (%s)', async confirmation => {
    const backupManager = { previewExport: jest.fn(() => ({ categories: {}, totals: {} })), export: jest.fn() };
    const harness = createDirectRouteHarness(backupManager);
    const selection = { globalSettings: false, pluginSettings: false, profileDatabases: true, userData: false, pluginFiles: false, uploads: false };
    const preview = makeResponse();
    await harness.routes.get('POST /api/config-backup/preview-export').at(-1)({ body: selection }, preview);
    const response = makeResponse();
    await harness.routes.get('POST /api/config-backup/export-token').at(-1)({ body: {
      ...selection,
      exportPreviewToken: preview.body.exportPreviewToken,
      ...(confirmation === undefined ? {} : { confirmUnclassifiedData: confirmation })
    } }, response);
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toMatch(/unclassified personal or secret data.*explicit confirmation/i);
    expect(harness.plugin._exportTokens.size).toBe(0);
    expect(backupManager.export).not.toHaveBeenCalled();
  });

  test('binds unclassified confirmation to the canonical preview selection and consumes its preview token once', async () => {
    const stream = { on() {}, pipe(response) { response.piped = true; } };
    const backupManager = {
      previewExport: jest.fn(() => ({ categories: {}, totals: {} })),
      export: jest.fn(async () => ({ stream, warnings: [] }))
    };
    const harness = createDirectRouteHarness(backupManager);
    const selection = { globalSettings: false, pluginSettings: false, profileDatabases: true, userData: false, pluginFiles: false, uploads: false };
    const preview = makeResponse();
    await harness.routes.get('POST /api/config-backup/preview-export').at(-1)({ body: selection }, preview);

    const changed = makeResponse();
    await harness.routes.get('POST /api/config-backup/export-token').at(-1)({ body: {
      ...selection, credentialsAndSessions: true,
      confirmSensitiveExport: true, confirmUnclassifiedData: true,
      exportPreviewToken: preview.body.exportPreviewToken
    } }, changed);
    expect(changed.statusCode).toBe(400);
    expect(changed.body.error).toMatch(/preview expired or selection changed/i);
    expect(harness.plugin._exportTokens.size).toBe(0);
    expect(backupManager.export).not.toHaveBeenCalled();

    const retryPreview = makeResponse();
    await harness.routes.get('POST /api/config-backup/preview-export').at(-1)({ body: selection }, retryPreview);
    const tokenResponse = makeResponse();
    await harness.routes.get('POST /api/config-backup/export-token').at(-1)({ body: {
      ...selection,
      confirmUnclassifiedData: true,
      exportPreviewToken: retryPreview.body.exportPreviewToken
    } }, tokenResponse);
    expect(tokenResponse.statusCode).toBe(200);
    const token = tokenResponse.body.token;
    const downloadResponse = makeResponse();
    await harness.routes.get('GET /api/config-backup/download').at(-1)(
      { query: { token } }, downloadResponse
    );
    expect(backupManager.export).toHaveBeenCalledTimes(1);
    expect(backupManager.export.mock.calls[0][0].confirmUnclassifiedData).toBe(true);
    expect(downloadResponse.piped).toBe(true);

    const replay = makeResponse();
    await harness.routes.get('POST /api/config-backup/export-token').at(-1)({ body: {
      ...selection,
      confirmUnclassifiedData: true,
      exportPreviewToken: retryPreview.body.exportPreviewToken
    } }, replay);
    expect(replay.statusCode).toBe(400);
    expect(backupManager.export).toHaveBeenCalledTimes(1);
  });

  test('direct export rejects a truthy-looking but invalid unclassified confirmation before exporter work', async () => {
    const backupManager = { export: jest.fn() };
    const harness = createDirectRouteHarness(backupManager);
    const response = makeResponse();
    await harness.routes.get('POST /api/config-backup/export').at(-1)({ body: {
      globalSettings: false, pluginSettings: false, profileDatabases: true,
      userData: false, pluginFiles: false, uploads: false,
      confirmUnclassifiedData: 'certainly'
    } }, response);
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toMatch(/unclassified personal or secret data.*explicit confirmation/i);
    expect(backupManager.export).not.toHaveBeenCalled();
  });

  test.each([
    ['known sensitive data', true, 'sensitive'],
    ['legacy metadata with unknown sensitivity', undefined, 'unknown']
  ])('requires confirmation for %s but leaves preview available', async (_name, sensitiveDataIncluded, expectedRisk) => {
    const { backupManager } = managerFor(sensitiveDataIncluded);
    const harness = createDirectRouteHarness(backupManager);
    const bytes = Buffer.from('synthetic backup fixture');
    const ordinaryPreview = await invokeUploadRoute(harness, '/api/config-backup/preview-import', bytes);
    expect(ordinaryPreview.statusCode).toBe(200);
    expect(ordinaryPreview.body.sensitivityRisk).toBe(expectedRisk);
    expect(ordinaryPreview.body.importConfirmationToken).toBeNull();
    const preview = await prepare(harness, bytes);
    expect(preview.sensitivityRisk).toBe(expectedRisk);

    const missingConfirmation = await invokeUploadRoute(harness, '/api/config-backup/import', bytes, {
      ...options,
      importConfirmationToken: preview.importConfirmationToken,
      confirmSensitiveImport: 'false'
    });
    expect(missingConfirmation.statusCode).toBe(400);
    expect(backupManager.import).not.toHaveBeenCalled();

    const confirmed = await invokeUploadRoute(harness, '/api/config-backup/import', bytes, {
      ...options,
      importConfirmationToken: preview.importConfirmationToken,
      confirmSensitiveImport: 'true'
    });
    expect(confirmed.statusCode).toBe(200);
    expect(backupManager.import).toHaveBeenCalledTimes(1);
    const replay = await invokeUploadRoute(harness, '/api/config-backup/import', bytes, {
      ...options,
      importConfirmationToken: preview.importConfirmationToken,
      confirmSensitiveImport: 'true'
    });
    expect(replay.statusCode).toBe(400);
    expect(backupManager.import).toHaveBeenCalledTimes(1);
  });

  test('treats a forged false manifest as unknown and requires confirmation', async () => {
    const { backupManager } = managerFor(false);
    const harness = createDirectRouteHarness(backupManager);
    const bytes = Buffer.from('synthetic backup fixture');
    const preview = await prepare(harness, bytes);
    expect(preview.sensitivityRisk).toBe('unknown');
    expect(JSON.stringify(preview)).not.toContain('SYNTHETIC_SECRET_SENTINEL');
    const withoutConfirmation = await invokeUploadRoute(harness, '/api/config-backup/import', bytes, {
      ...options,
      importConfirmationToken: preview.importConfirmationToken,
      confirmSensitiveImport: 'false'
    });
    expect(withoutConfirmation.statusCode).toBe(400);
    expect(backupManager.import).not.toHaveBeenCalled();

    const imported = await invokeUploadRoute(harness, '/api/config-backup/import', bytes, {
      ...options,
      importConfirmationToken: preview.importConfirmationToken,
      confirmSensitiveImport: 'true'
    });
    expect(imported.statusCode).toBe(200);
    expect(backupManager.import).toHaveBeenCalledTimes(1);
  });

  test('treats a self-consistent unsigned ZIP with a false claim and sensitive fixture as unknown', async () => {
    const fixture = await createChecksummedUnsignedFalseArchive();
    const parsedValues = [];
    const backupManager = {
      parseBackup: jest.fn(async filePath => {
        const parsed = await parseBackupZip(filePath);
        parsedValues.push(parsed);
        return parsed;
      }),
      previewImport: jest.fn(() => ({ manifest: {}, plugins: {}, global: {} })),
      import: jest.fn().mockResolvedValue({ success: true, report: {}, warnings: [], errors: [] })
    };
    const harness = createDirectRouteHarness(backupManager);
    try {
      const preview = await prepare(harness, fixture.bytes);
      expect(parsedValues[0].integrity.status).toBe('verified');
      expect(parsedValues[0].manifest.dataSelection.sensitiveDataIncluded).toBe(false);
      expect(parsedValues[0].pluginSettings.fixture.apiKey).toBe('SYNTHETIC_SECRET_SENTINEL');
      expect(preview.sensitivityRisk).toBe('unknown');
      expect(JSON.stringify(preview)).not.toContain('SYNTHETIC_SECRET_SENTINEL');

      const denied = await invokeUploadRoute(harness, '/api/config-backup/import', fixture.bytes, {
        ...options,
        importConfirmationToken: preview.importConfirmationToken,
        confirmSensitiveImport: 'false'
      });
      expect(denied.statusCode).toBe(400);
      expect(backupManager.import).not.toHaveBeenCalled();

      const imported = await invokeUploadRoute(harness, '/api/config-backup/import', fixture.bytes, {
        ...options,
        importConfirmationToken: preview.importConfirmationToken,
        confirmSensitiveImport: 'true'
      });
      expect(imported.statusCode).toBe(200);
      expect(backupManager.import).toHaveBeenCalledTimes(1);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test.each([
    ['archive bytes', body => body, Buffer.from('different synthetic backup')],
    ['selected section', body => ({ ...body, includeGlobalSettings: 'false' }), Buffer.from('synthetic backup fixture')],
    ['import mode', body => ({ ...body, mode: 'replace' }), Buffer.from('synthetic backup fixture')],
    ['target profile', body => ({ ...body, targetProfile: 'other synthetic target' }), Buffer.from('synthetic backup fixture')]
  ])('rejects a confirmation after %s changes without calling the importer', async (_name, mutate, importBytes) => {
    const { backupManager } = managerFor(true);
    const harness = createDirectRouteHarness(backupManager);
    const originalBytes = Buffer.from('synthetic backup fixture');
    const preview = await prepare(harness, originalBytes);
    const response = await invokeUploadRoute(harness, '/api/config-backup/import', importBytes, {
      ...mutate(options),
      importConfirmationToken: preview.importConfirmationToken,
      confirmSensitiveImport: 'true'
    });
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toMatch(/preview expired or changed/i);
    expect(backupManager.import).not.toHaveBeenCalled();
  });

  test('rejects direct import calls without a server-issued preview token', async () => {
    const { backupManager } = managerFor(false);
    const harness = createDirectRouteHarness(backupManager);
    const response = await invokeUploadRoute(harness, '/api/config-backup/import', Buffer.from('synthetic backup'), options);
    expect(response.statusCode).toBe(400);
    expect(backupManager.import).not.toHaveBeenCalled();
  });

  test('canonicalizes boolean sections and plugin aliases before comparing preview parameters', async () => {
    const { backupManager, parsed } = managerFor(true);
    const harness = createDirectRouteHarness(backupManager);
    const bytes = Buffer.from('synthetic backup fixture');
    const preview = await prepare(harness, bytes, {
      ...options,
      pluginFilter: '["streamalchemy","fixture","stream-monsters"]'
    });
    const imported = await invokeUploadRoute(harness, '/api/config-backup/import', bytes, {
      ...options,
      includeGlobalSettings: true,
      includePluginSettings: false,
      includePluginData: true,
      includeUserConfigs: false,
      includeUploads: false,
      includeUserData: false,
      includeProfileScopedPluginData: true,
      includeSchnorrbecherPersistentState: false,
      pluginFilter: '["fixture","stream-monsters"]',
      importConfirmationToken: preview.importConfirmationToken,
      confirmSensitiveImport: true
    });
    expect(imported.statusCode).toBe(200);
    expect(backupManager.import.mock.calls[0][0]).toBe(parsed);
    expect(backupManager.import.mock.calls[0][1].pluginFilter).toEqual(['fixture', 'stream-monsters']);
  });

  test.each([
    ['unrecognized section boolean', { ...options, includeGlobalSettings: 'perhaps' }],
    ['unrecognized import mode', { ...options, mode: 'restore' }]
  ])('does not issue a token for %s', async (_name, badOptions) => {
    const { backupManager } = managerFor(true);
    const harness = createDirectRouteHarness(backupManager);
    const response = await invokeUploadRoute(harness, '/api/config-backup/preview-import', Buffer.from('synthetic backup'), {
      ...badOptions,
      prepareImport: 'true'
    });
    expect(response.statusCode).toBe(400);
    expect(response.body.importConfirmationToken).toBeUndefined();
    expect(harness.plugin._importConfirmations.size).toBe(0);
  });

  test('rejects an unrecognized sensitive-confirmation string', async () => {
    const { backupManager } = managerFor(true);
    const harness = createDirectRouteHarness(backupManager);
    const bytes = Buffer.from('synthetic backup fixture');
    const preview = await prepare(harness, bytes);
    const response = await invokeUploadRoute(harness, '/api/config-backup/import', bytes, {
      ...options,
      importConfirmationToken: preview.importConfirmationToken,
      confirmSensitiveImport: 'certainly'
    });
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toMatch(/explicit import confirmation/i);
    expect(backupManager.import).not.toHaveBeenCalled();
  });

  test('keeps sensitive-data and profile-replacement confirmations independent', async () => {
    const { backupManager } = managerFor(true, [{ relPath: 'synthetic-profile.db' }]);
    const harness = createDirectRouteHarness(backupManager);
    const bytes = Buffer.from('synthetic backup fixture');
    const profileOptions = {
      ...options,
      mode: 'replace',
      includeUserConfigs: 'true',
      includeProfileScopedPluginData: 'false',
      targetProfile: '',
      confirmProfileReplacement: 'false'
    };
    const profilePreview = await prepare(harness, bytes, profileOptions);
    const missingProfileConfirmation = await invokeUploadRoute(harness, '/api/config-backup/import', bytes, {
      ...profileOptions,
      importConfirmationToken: profilePreview.importConfirmationToken,
      confirmSensitiveImport: 'true'
    });
    expect(missingProfileConfirmation.statusCode).toBe(400);
    expect(missingProfileConfirmation.body.error).toMatch(/replacing user profiles requires explicit confirmation/i);
    expect(backupManager.import).not.toHaveBeenCalled();

    const sensitiveOptions = { ...profileOptions, confirmProfileReplacement: 'true' };
    const sensitivePreview = await prepare(harness, bytes, sensitiveOptions);
    const missingSensitiveConfirmation = await invokeUploadRoute(harness, '/api/config-backup/import', bytes, {
      ...sensitiveOptions,
      importConfirmationToken: sensitivePreview.importConfirmationToken,
      confirmSensitiveImport: 'false'
    });
    expect(missingSensitiveConfirmation.statusCode).toBe(400);
    expect(missingSensitiveConfirmation.body.error).toMatch(/sensitive or unclassified backup contents/i);
    expect(backupManager.import).not.toHaveBeenCalled();
  });

  test('accepts the exact expiry boundary and rejects a token one millisecond later', async () => {
    const { backupManager } = managerFor(true);
    const harness = createDirectRouteHarness(backupManager);
    const bytes = Buffer.from('synthetic backup fixture');
    let now = 100000;
    const dateNow = jest.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const boundaryPreview = await prepare(harness, bytes);
      now += 5 * 60 * 1000;
      const boundaryResult = await invokeUploadRoute(harness, '/api/config-backup/import', bytes, {
        ...options,
        importConfirmationToken: boundaryPreview.importConfirmationToken,
        confirmSensitiveImport: 'true'
      });
      expect(boundaryResult.statusCode).toBe(200);

      const expiredPreview = await prepare(harness, bytes);
      now += 5 * 60 * 1000 + 1;
      const expiredResult = await invokeUploadRoute(harness, '/api/config-backup/import', bytes, {
        ...options,
        importConfirmationToken: expiredPreview.importConfirmationToken,
        confirmSensitiveImport: 'true'
      });
      expect(expiredResult.statusCode).toBe(400);
      expect(backupManager.import).toHaveBeenCalledTimes(1);
    } finally {
      dateNow.mockRestore();
    }
  });

  test('allows only one concurrent import replay of the same one-time token', async () => {
    const { backupManager } = managerFor(true);
    const harness = createDirectRouteHarness(backupManager);
    const bytes = Buffer.from('synthetic backup fixture');
    const preview = await prepare(harness, bytes);
    const body = {
      ...options,
      importConfirmationToken: preview.importConfirmationToken,
      confirmSensitiveImport: 'true'
    };
    const responses = await Promise.all([
      invokeUploadRoute(harness, '/api/config-backup/import', bytes, body),
      invokeUploadRoute(harness, '/api/config-backup/import', bytes, body)
    ]);
    expect(responses.map(response => response.statusCode).sort()).toEqual([200, 400]);
    expect(backupManager.import).toHaveBeenCalledTimes(1);
  });

  test.each(['preview', 'import'])('rejects an archive changed during %s parsing', async operation => {
    const { backupManager } = managerFor(true);
    const harness = createDirectRouteHarness(backupManager);
    const bytes = Buffer.from('synthetic original backup');

    let fields = options;
    let route = '/api/config-backup/preview-import';
    if (operation === 'import') {
      const prepared = await prepare(harness, bytes);
      fields = {
        ...options,
        importConfirmationToken: prepared.importConfirmationToken,
        confirmSensitiveImport: 'true'
      };
      route = '/api/config-backup/import';
    } else {
      fields = { ...options, prepareImport: 'true' };
    }

    backupManager.parseBackup.mockImplementationOnce(async filePath => {
      fs.writeFileSync(filePath, 'different synthetic backup');
      return {
        errors: [], warnings: [], manifest: { dataSelection: { sensitiveDataIncluded: true } },
        globalSettings: null, pluginSettings: {}, dataFiles: {}, userConfigsFiles: [],
        uploadFiles: [], userDataFiles: [], tmpDir: null
      };
    });

    const response = await invokeUploadRoute(harness, route, bytes, fields);
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toMatch(/backup file changed while it was being processed/i);
    expect(harness.plugin._importConfirmations.size).toBe(operation === 'preview' ? 0 : 1);
    expect(backupManager.import).not.toHaveBeenCalled();
  });
});
