'use strict';

const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { exportBackup } = require('../modules/backup/exporter');
const { createManifest, validateManifest } = require('../modules/backup/manifest');
const { EXPORT_CATEGORIES, assertSelectionConfirmed, inspectSelection } = require('../modules/backup/selection');

const EULER_SENTINEL = 'SYNTHETIC_EULER_KEY_SENTINEL';
const SESSION_SENTINEL = 'SYNTHETIC_SESSION_VALUE_SENTINEL';

class FakeArchive extends EventEmitter {
  constructor() {
    super();
    this.entries = new Map();
  }
  append(buffer, options) { this.entries.set(options.name, Buffer.from(buffer)); }
  file() { throw new Error('Unexpected file access in settings-only fixture'); }
  finalize() {}
}

function fakeDb() {
  return {
    prepare(sql) {
      if (sql.includes("key NOT LIKE 'plugin:%'")) {
        return { all: () => [
          { key: 'theme', value: 'dark' },
          { key: 'tiktok_euler_api_key', value: EULER_SENTINEL }
        ] };
      }
      if (sql.includes("key LIKE 'plugin:%'")) {
        return { all: () => [
          { key: 'plugin:fixture:config', value: JSON.stringify({ safe: true, sessionId: SESSION_SENTINEL }) }
        ] };
      }
      throw new Error('Unexpected synthetic SQL: ' + sql);
    }
  };
}

function paths() {
  return {
    getPluginsDir: () => 'missing-synthetic-plugins',
    getPluginDataDir: () => 'missing-synthetic-plugin-data',
    getUserConfigsDir: () => 'missing-synthetic-user-configs',
    getUploadsDir: () => 'missing-synthetic-uploads',
    getUserDataDir: () => 'missing-synthetic-user-data'
  };
}

function dependencies(archiveRef) {
  return {
    db: fakeDb(),
    pluginLoader: null,
    configPathManager: paths(),
    archiveFactory: () => (archiveRef.archive = new FakeArchive())
  };
}

describe('backup export data selection', () => {
  test('omits known credential and session settings by default', async () => {
    const ref = {};
    await exportBackup(dependencies(ref), {
      includeGlobalSettings: true,
      includePluginSettings: true,
      includePluginData: false,
      includeUserConfigs: false,
      includeUploads: false,
      includeUserData: false
    });
    const globalSettings = ref.archive.entries.get('global/settings.json').toString('utf8');
    const pluginSettings = ref.archive.entries.get('plugins/fixture/settings.json').toString('utf8');
    expect(globalSettings).toContain('"theme": "dark"');
    expect(globalSettings).not.toContain(EULER_SENTINEL);
    expect(pluginSettings).not.toContain(SESSION_SENTINEL);
    const manifest = JSON.parse(ref.archive.entries.get('manifest.json').toString('utf8'));
    expect(manifest.dataSelection.partial).toBe(true);
    expect(manifest.dataSelection.categories).not.toContain('credentialsAndSessions');
  });

  test('requires explicit credential and full-backup confirmations', () => {
    const all = Object.fromEntries(EXPORT_CATEGORIES.map(category => [category, true]));
    expect(() => assertSelectionConfirmed({ ...all })).toThrow(/credentials or session data requires explicit confirmation/i);
    expect(() => assertSelectionConfirmed({ ...all, confirmSensitiveExport: true })).toThrow(/full backup requires explicit confirmation/i);
    expect(() => assertSelectionConfirmed({ ...all, confirmSensitiveExport: true, confirmFullBackup: true })).not.toThrow();
  });

  test('export preview returns only aggregate counts and sizes', () => {
    const preview = inspectSelection({ db: fakeDb(), configPathManager: paths() }, {
      globalSettings: true,
      pluginSettings: true,
      credentialsAndSessions: true
    });
    const serialized = JSON.stringify(preview);
    expect(serialized).not.toContain(EULER_SENTINEL);
    expect(serialized).not.toContain(SESSION_SENTINEL);
    expect(serialized).not.toContain('tiktok_euler_api_key');
    expect(preview.categories.credentialsAndSessions.entries).toBeGreaterThan(0);
  });

  test('preview exposes only aggregate data for credential-named files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-preview-redaction-'));
    const uploads = path.join(root, 'synthetic-private-export-directory');
    const filePath = path.join(uploads, 'session-token-synthetic.txt');
    const sentinel = 'SYNTHETIC_RAW_SESSION_SENTINEL';
    fs.mkdirSync(uploads, { recursive: true });
    fs.writeFileSync(filePath, sentinel);
    try {
      const preview = inspectSelection({
        db: null,
        configPathManager: { ...paths(), getUploadsDir: () => uploads }
      }, { uploads: true, credentialsAndSessions: true });
      const serialized = JSON.stringify(preview);
      expect(preview.categories.credentialsAndSessions.selected).toBe(true);
      expect(preview.categories.credentialsAndSessions.files).toBe(1);
      expect(serialized).not.toContain(sentinel);
      expect(serialized).not.toContain(filePath);
      expect(serialized).not.toContain('session-token-synthetic.txt');
      expect(serialized).not.toContain('synthetic-private-export-directory');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('new partial metadata validates and old manifests without it remain valid', () => {
    const partial = createManifest({
      appVersion: 'synthetic',
      plugins: [],
      warnings: [],
      dataSelection: { categories: ['globalSettings'], partial: true, sensitiveDataIncluded: false }
    });
    const legacy = createManifest({ appVersion: 'legacy', plugins: [], warnings: [] });
    expect(validateManifest(partial).valid).toBe(true);
    expect(validateManifest(legacy).valid).toBe(true);
  });
});
