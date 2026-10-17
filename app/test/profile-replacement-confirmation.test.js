'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const ConfigImportPlugin = require('../plugins/config-import/main');
const { performImport, cleanupTempDir } = require('../modules/backup/importer');

const repoRoot = path.join(__dirname, '..', '..');
const uiSource = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', 'config-import', 'ui.html'), 'utf8');

describe('explicit profile replacement confirmation', () => {
  let root;
  let configDir;
  let archiveDir;
  let parsed;
  let db;
  let configPathManager;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-replace-confirm-'));
    configDir = path.join(root, 'user_configs');
    archiveDir = path.join(root, 'archive');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'profileA.db'), 'active-profile-original');
    fs.writeFileSync(path.join(configDir, 'profileB.db'), 'foreign-profile-original');
    fs.writeFileSync(path.join(configDir, 'profileC.db'), 'unrelated-profile-original');
    fs.writeFileSync(path.join(configDir, '.active_profile'), 'profileA');
    fs.writeFileSync(path.join(archiveDir, 'profileB.db'), 'backup-profileB');
    fs.writeFileSync(path.join(archiveDir, '.active_profile'), 'profileB');
    parsed = {
      manifest: { profileScopedDataPlugins: [] },
      globalSettings: null,
      pluginSettings: {},
      dataFiles: {},
      userConfigsFiles: [
        { relPath: 'profileB.db', tmpPath: path.join(archiveDir, 'profileB.db') },
        { relPath: '.active_profile', tmpPath: path.join(archiveDir, '.active_profile') }
      ],
      uploadFiles: [],
      userDataFiles: [],
      warnings: [],
      errors: [],
      tmpDir: archiveDir
    };
    db = { dbPath: path.join(configDir, 'profileA.db') };
    configPathManager = { getUserConfigsDir: () => configDir };
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('UI requires a fresh unchecked acknowledgement and sends it to the import route', () => {
    expect(uiSource).toMatch(/<input type="checkbox" id="confirmProfileReplacement">/);
    expect(uiSource).toMatch(/class="checkbox-label hidden" id="profileReplaceConfirmationWrap"/);
    expect(uiSource).toContain('data-i18n="plugins.config-import.config-import.ui.confirmProfileReplacement"');
    expect(uiSource).toContain("t('plugins.config-import.config-import.ui.confirmProfileReplacementRequired')");
    expect(uiSource).toContain("fd.append('confirmProfileReplacement', confirmProfileReplacement)");
    expect(uiSource).toContain('I confirm: this import may overwrite existing profiles with matching names and change the active profile to one from this backup.');
  });

  test('rejects replace without the flag before changing any profile or marker bytes', async () => {
    const directResult = await performImport(parsed, { db, configPathManager }, {
      mode: 'replace', includeGlobalSettings: false, includePluginSettings: false,
      includePluginData: false, includeUserConfigs: true, includeUploads: false,
      includeUserData: false
    });
    expect(directResult.success).toBe(false);
    expect(directResult.errors.join(' ')).toContain('explicit confirmation');

    const importSpy = jest.fn(async (archive, opts) => performImport(archive, { db, configPathManager }, opts));
    const { app } = makeImportRoute(importSpy, async () => parsed);

    await request(app)
      .post('/api/config-backup/import')
      .field('mode', 'replace')
      .field('includeUserConfigs', 'true')
      .attach('backup', Buffer.from('synthetic zip bytes'), 'fixture.zip')
      .expect(400);

    expect(importSpy).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(configDir, 'profileA.db'), 'utf8')).toBe('active-profile-original');
    expect(fs.readFileSync(path.join(configDir, 'profileB.db'), 'utf8')).toBe('foreign-profile-original');
    expect(fs.readFileSync(path.join(configDir, 'profileC.db'), 'utf8')).toBe('unrelated-profile-original');
    expect(fs.readFileSync(path.join(configDir, '.active_profile'), 'utf8')).toBe('profileA');

    await request(app)
      .post('/api/config-backup/import')
      .field('mode', 'replace')
      .field('includeUserConfigs', 'true')
      .field('confirmProfileReplacement', 'yes-ish')
      .attach('backup', Buffer.from('synthetic zip bytes'), 'fixture.zip')
      .expect(400);
    expect(importSpy).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(configDir, 'profileB.db'), 'utf8')).toBe('foreign-profile-original');
    expect(fs.readFileSync(path.join(configDir, '.active_profile'), 'utf8')).toBe('profileA');
  });

  test('flag authorizes only the documented matching-profile replacement and active-profile change', async () => {
    const importSpy = jest.fn(async (archive, opts) => {
      try { return await performImport(archive, { db, configPathManager }, opts); }
      finally { cleanupTempDir(archive.tmpDir); }
    });
    const { app } = makeImportRoute(importSpy, async () => parsed);

    const response = await request(app)
      .post('/api/config-backup/import')
      .field('mode', 'replace')
      .field('includeUserConfigs', 'true')
      .field('confirmProfileReplacement', 'true')
      .attach('backup', Buffer.from('synthetic zip bytes'), 'fixture.zip')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(importSpy.mock.calls[0][1].confirmProfileReplacement).toBe(true);
    expect(fs.readFileSync(path.join(configDir, 'profileA.db'), 'utf8')).toBe('active-profile-original');
    expect(fs.readFileSync(path.join(configDir, 'profileB.db'), 'utf8')).toBe('backup-profileB');
    expect(fs.readFileSync(path.join(configDir, 'profileC.db'), 'utf8')).toBe('unrelated-profile-original');
    expect(fs.readFileSync(path.join(configDir, '.active_profile'), 'utf8')).toBe('profileB');
  });

  test('failed profile database restore does not change the active profile marker', async () => {
    const originalRenameSync = fs.renameSync;
    const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation((source, destination, ...args) => {
      if (String(source).includes('.ltth-restore-stage-') && String(destination).startsWith(configDir) && /profileB.*\.db$/i.test(String(destination))) {
        throw new Error('synthetic restore write failure');
      }
      return originalRenameSync(source, destination, ...args);
    });

    try {
      const result = await performImport(parsed, { db, configPathManager }, {
        mode: 'replace', includeGlobalSettings: false, includePluginSettings: false,
        includePluginData: false, includeUserConfigs: true, includeUploads: false,
        includeUserData: false, confirmProfileReplacement: true
      });

      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toContain('synthetic restore write failure');
      expect(fs.readFileSync(path.join(configDir, 'profileA.db'), 'utf8')).toBe('active-profile-original');
      expect(fs.readFileSync(path.join(configDir, 'profileB.db'), 'utf8')).toBe('foreign-profile-original');
      expect(fs.readFileSync(path.join(configDir, '.active_profile'), 'utf8')).toBe('profileA');
    } finally {
      renameSpy.mockRestore();
    }
  });

  test('merge keeps existing profiles and active marker without requiring confirmation', async () => {
    const result = await performImport(parsed, { db, configPathManager }, {
      mode: 'merge', includeGlobalSettings: false, includePluginSettings: false,
      includePluginData: false, includeUserConfigs: true, includeUploads: false,
      includeUserData: false
    });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(configDir, 'profileB.db'), 'utf8')).toBe('foreign-profile-original');
    expect(fs.readFileSync(path.join(configDir, '.active_profile'), 'utf8')).toBe('profileA');
  });
});

function makeImportRoute(importBackup, parseBackup) {
  const app = express();
  const router = express.Router();
  app.use(router);
  const api = {
    log: jest.fn(),
    getBackupManager: () => ({ parseBackup, import: importBackup }),
    registerRoute: (method, route, ...handlers) => router[method.toLowerCase()](route, ...handlers)
  };
  const plugin = new ConfigImportPlugin(api);
  plugin.registerBackupRoutes();
  return { app, plugin };
}
