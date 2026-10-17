'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
function loadImporterForTest() {
  const sourcePath = process.env.LTTH_BACKUP_IMPORTER_SOURCE;
  if (!sourcePath) return require('../modules/backup/importer');
  const anchorPath = process.env.LTTH_BACKUP_IMPORTER_ANCHOR;
  const loaded = new Module(anchorPath, module);
  loaded.filename = anchorPath;
  loaded.paths = Module._nodeModulePaths(path.dirname(anchorPath));
  loaded._compile(fs.readFileSync(sourcePath, 'utf8'), anchorPath);
  return loaded.exports;
}
let mockSqliteAttempts = 0;
jest.mock('better-sqlite3', () => {
  mockSqliteAttempts += 1;
  throw new Error('SQLite loading is forbidden in synthetic transaction safety tests');
});
const { performImport } = loadImporterForTest();
afterAll(() => {
  expect(mockSqliteAttempts).toBe(0);
  if (process.env.LTTH_SQLITE_SAFETY_RECEIPT) fs.writeFileSync(process.env.LTTH_SQLITE_SAFETY_RECEIPT, JSON.stringify({ sqliteAttempts: mockSqliteAttempts }));
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'synthetic-backup-transaction-'));
  const dirs = {
    userConfigs: path.join(root, 'user_configs'),
    plugins: path.join(root, 'plugins'),
    uploads: path.join(root, 'uploads'),
    userData: path.join(root, 'user_data')
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
  const parsed = {
    manifest: { profileScopedDataPlugins: [] },
    globalSettings: null,
    pluginSettings: {},
    dataFiles: {},
    userConfigsFiles: [],
    uploadFiles: [],
    userDataFiles: [],
    warnings: [],
    errors: []
  };
  const deps = {
    db: {},
    configPathManager: {
      getUserConfigsDir: () => dirs.userConfigs,
      getPluginsDir: () => dirs.plugins,
      getPluginDataDir: (id, options = {}) => path.join(dirs.plugins, id, ...(options.profileId ? ['profiles', options.profileId] : []), 'data'),
      getUploadsDir: () => dirs.uploads,
      getUserDataDir: () => dirs.userData
    }
  };
  return { root, dirs, parsed, deps };
}

function incoming(root, name, value) {
  const file = path.join(root, `incoming-${name}`);
  fs.writeFileSync(file, value);
  return file;
}

function options(overrides = {}) {
  return {
    mode: 'replace',
    confirmProfileReplacement: true,
    includeGlobalSettings: false,
    includePluginSettings: false,
    includePluginData: false,
    includeUserConfigs: false,
    includeUploads: true,
    includeUserData: false,
    ...overrides
  };
}

afterEach(() => jest.restoreAllMocks());

describe('synthetic backup restore transaction safety', () => {
  test('fails closed when a destination changes after its original snapshot', async () => {
    const f = fixture();
    const target = path.join(f.dirs.uploads, 'target.bin');
    fs.writeFileSync(target, 'original-before-stage');
    f.parsed.uploadFiles = [{ relPath: 'target.bin', tmpPath: incoming(f.root, 'target', 'backup-payload') }];
    f.parsed.dataFiles = { fixture: [] };
    f.parsed.pluginSettings = { fixture: {} };
    let providerCalled = false;
    f.deps.backupProviders = {
      fixture: {
        async importConfig() {
          providerCalled = true;
          fs.writeFileSync(target, 'concurrent-external-update');
          return {};
        }
      }
    };
    try {
      const result = await performImport(f.parsed, f.deps, options({ includePluginSettings: true }));
      expect(providerCalled).toBe(true);
      expect(fs.readFileSync(target, 'utf8')).toBe(result.success ? 'backup-payload' : 'concurrent-external-update');
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/destination changed after restore staging/i);
      expect(fs.readFileSync(target, 'utf8')).toBe('concurrent-external-update');
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  test('does not overwrite a destination that reappears between unlink and rename', async () => {
    const f = fixture();
    const first = path.join(f.dirs.uploads, 'first.bin');
    const second = path.join(f.dirs.uploads, 'second.bin');
    fs.writeFileSync(first, 'original-first');
    fs.writeFileSync(second, 'original-second');
    f.parsed.uploadFiles = [
      { relPath: 'first.bin', tmpPath: incoming(f.root, 'first-race', 'incoming-first') },
      { relPath: 'second.bin', tmpPath: incoming(f.root, 'second-race', 'incoming-second') }
    ];
    const stageDirs = [];
    const realMkdtemp = fs.mkdtempSync;
    const realLink = fs.linkSync;
    jest.spyOn(fs, 'mkdtempSync').mockImplementation((...args) => {
      const result = realMkdtemp.apply(fs, args);
      if (String(args[0]).includes('.ltth-restore-stage-')) stageDirs.push(result);
      return result;
    });
    jest.spyOn(fs, 'linkSync').mockImplementation((source, destination) => {
      if (String(source).includes('.ltth-restore-stage-') && path.basename(destination) === 'second.bin') {
        fs.writeFileSync(destination, 'external-file-reappeared');
        // Delegate to native exclusive link: EEXIST must preserve this file.
        return realLink.call(fs, source, destination);
      }
      return realLink.call(fs, source, destination);
    });
    try {
      const result = await performImport(f.parsed, f.deps, options());
      expect(result.success).toBe(false);
      expect(fs.readFileSync(second, 'utf8')).toBe('external-file-reappeared');
      expect(result.errors.join(' ')).toMatch(/destination reappeared before original recovery/i);
      expect(result.errors.join(' ')).toMatch(/original backups retained at:/i);
      expect(fs.readFileSync(second, 'utf8')).toBe('external-file-reappeared');
      const secondBackup = stageDirs.map(dir => path.join(dir, 'original'))
        .find(file => fs.existsSync(file) && fs.readFileSync(file, 'utf8') === 'original-second');
      expect(secondBackup).toBeTruthy();
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  test('retains and reports original snapshots after an injected rollback failure', async () => {
    const f = fixture();
    const first = path.join(f.dirs.uploads, 'first.bin');
    const second = path.join(f.dirs.uploads, 'second.bin');
    fs.writeFileSync(first, 'original-first');
    fs.writeFileSync(second, 'original-second');
    f.parsed.uploadFiles = [
      { relPath: 'first.bin', tmpPath: incoming(f.root, 'first', 'incoming-first') },
      { relPath: 'second.bin', tmpPath: incoming(f.root, 'second', 'incoming-second') }
    ];
    const stageDirs = [];
    const realMkdtemp = fs.mkdtempSync;
    const realLink = fs.linkSync;
    const realCopy = fs.copyFileSync;
    jest.spyOn(fs, 'mkdtempSync').mockImplementation((...args) => {
      const result = realMkdtemp.apply(fs, args);
      if (String(args[0]).includes('.ltth-restore-stage-')) stageDirs.push(result);
      return result;
    });
    jest.spyOn(fs, 'linkSync').mockImplementation((source, destination) => {
      if (String(source).includes('.ltth-restore-stage-') && path.basename(destination) === 'second.bin') {
        throw new Error('synthetic second install failure');
      }
      return realLink.call(fs, source, destination);
    });
    jest.spyOn(fs, 'copyFileSync').mockImplementation((source, destination) => {
      if (path.basename(source) === 'original' && path.resolve(destination) === path.resolve(first)) {
        throw new Error('synthetic original recovery copy failure');
      }
      return realCopy.call(fs, source, destination);
    });
    try {
      const result = await performImport(f.parsed, f.deps, options());
      expect(result.success).toBe(false);
      expect(stageDirs.length).toBe(2);
      const retained = stageDirs.map(dir => path.join(dir, 'original'));
      expect(retained.every(file => fs.existsSync(file))).toBe(true);
      expect(retained.map(file => fs.readFileSync(file, 'utf8')).sort()).toEqual(['original-first', 'original-second']);
      expect(result.errors.join(' ')).toMatch(/synthetic original recovery copy failure/i);
      expect(result.errors.join(' ')).toMatch(/original backups retained at:/i);
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });
  test('exclusive recovery copy preserves a file appearing after rollback absence check', async () => {
    const f = fixture();
    const first = path.join(f.dirs.uploads, 'first.bin');
    const second = path.join(f.dirs.uploads, 'second.bin');
    fs.writeFileSync(first, 'original-first');
    fs.writeFileSync(second, 'original-second');
    f.parsed.uploadFiles = [
      { relPath: 'first.bin', tmpPath: incoming(f.root, 'first-exclusive', 'incoming-first') },
      { relPath: 'second.bin', tmpPath: incoming(f.root, 'second-exclusive', 'incoming-second') }
    ];
    const stageDirs = [];
    const mkdtemp = fs.mkdtempSync;
    const link = fs.linkSync;
    const copy = fs.copyFileSync;
    let recoveryInjected = false;
    jest.spyOn(fs, 'mkdtempSync').mockImplementation((...args) => {
      const dir = mkdtemp.apply(fs, args);
      if (String(args[0]).includes('.ltth-restore-stage-')) stageDirs.push(dir);
      return dir;
    });
    jest.spyOn(fs, 'linkSync').mockImplementation((source, destination) => {
      if (destination === second && String(source).includes('.ltth-restore-stage-')) throw new Error('synthetic second link install failure');
      return link(source, destination);
    });
    jest.spyOn(fs, 'copyFileSync').mockImplementation((source, destination, flags) => {
      if (!recoveryInjected && path.basename(source) === 'original' && destination === first) {
        recoveryInjected = true;
        fs.writeFileSync(first, 'foreign-file-before-recovery-copy');
      }
      return copy(source, destination, flags);
    });
    try {
      const result = await performImport(f.parsed, f.deps, options());
      expect(recoveryInjected).toBe(true);
      expect(result.success).toBe(false);
      expect(fs.readFileSync(first, 'utf8')).toBe('foreign-file-before-recovery-copy');
      expect(fs.readFileSync(second, 'utf8')).toBe('original-second');
      expect(result.report.uploads.imported).toEqual([]);
      expect(result.errors.join(' ')).toMatch(/EEXIST|file already exists/);
      expect(result.errors.join(' ')).toMatch(/original backups retained at:/);
      const originals = stageDirs.map(dir => path.join(dir, 'original'));
      expect(originals.every(file => fs.existsSync(file))).toBe(true);
      expect(originals.map(file => fs.readFileSync(file, 'utf8')).sort()).toEqual(['original-first', 'original-second']);
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
  });

});
