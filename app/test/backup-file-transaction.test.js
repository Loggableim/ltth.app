'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
let mockSqliteAttempts = 0;
const rollbackEvidence = [];
jest.mock('better-sqlite3', () => {
  mockSqliteAttempts += 1;
  throw new Error('SQLite loading is forbidden in transaction fixture tests');
});
const { performImport } = require('../modules/backup/importer');

// Load Node's recursive-removal internals before scoped unlink spies exist.
// Otherwise lazily captured spy closures can be reset before finally cleanup.
beforeAll(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-rm-prime-'));
  fs.writeFileSync(path.join(root, 'synthetic'), 'prime');
  fs.rmSync(root, { recursive: true, force: true });
});
afterAll(() => {
  expect(mockSqliteAttempts).toBe(0);
  if (process.env.LTTH_TRANSACTION_EVIDENCE) {
    fs.writeFileSync(process.env.LTTH_TRANSACTION_EVIDENCE, JSON.stringify({ sqliteAttempts: mockSqliteAttempts, rollbackEvidence }, null, 2));
  }
  if (process.env.LTTH_SQLITE_GUARD_RECEIPT) {
    fs.writeFileSync(process.env.LTTH_SQLITE_GUARD_RECEIPT, JSON.stringify({ sqliteAttempts: mockSqliteAttempts }));
  }
});

function setupFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-file-transaction-'));
  const configDir = path.join(root, 'user_configs');
  const pluginDir = path.join(root, 'plugin-data');
  const uploadsDir = path.join(root, 'uploads');
  const userDataDir = path.join(root, 'user_data');
  for (const dir of [configDir, pluginDir, uploadsDir, userDataDir]) fs.mkdirSync(dir, { recursive: true });
  const existing = {
    'user_configs/profileB.db': path.join(configDir, 'profileB.db'),
    'user_configs/.active_profile': path.join(configDir, '.active_profile'),
    'plugin-data/item.txt': path.join(pluginDir, 'item.txt'),
    'uploads/item.txt': path.join(uploadsDir, 'item.txt'),
    'user_data/item.txt': path.join(userDataDir, 'item.txt')
  };
  for (const [name, file] of Object.entries(existing)) fs.writeFileSync(file, `before:${name}`);
  const incoming = Object.fromEntries(Object.keys(existing).map(name => [name, `after:${name}`]));
  const parsed = {
    manifest: { profileScopedDataPlugins: [] },
    globalSettings: null,
    pluginSettings: {},
    dataFiles: { fixture: [{ relPath: 'item.txt', tmpPath: writeTemp(root, incoming['plugin-data/item.txt']) }] },
    userConfigsFiles: [
      { relPath: 'profileB.db', tmpPath: writeTemp(root, incoming['user_configs/profileB.db']) },
      { relPath: '.active_profile', tmpPath: writeTemp(root, incoming['user_configs/.active_profile']) }
    ],
    uploadFiles: [{ relPath: 'item.txt', tmpPath: writeTemp(root, incoming['uploads/item.txt']) }],
    userDataFiles: [{ relPath: 'item.txt', tmpPath: writeTemp(root, incoming['user_data/item.txt']) }],
    warnings: [], errors: []
  };
  const deps = {
    db: { dbPath: path.join(configDir, 'profileA.db') },
    configPathManager: {
      getUserConfigsDir: () => configDir,
      getPluginDataDir: () => pluginDir,
      getUploadsDir: () => uploadsDir,
      getUserDataDir: () => userDataDir
    }
  };
  const snapshot = () => Object.fromEntries(Object.entries(existing).map(([name, file]) => [name, fs.readFileSync(file, 'utf8')]));
  return { root, configDir, pluginDir, existing, incoming, parsed, deps, snapshot };
}

function writeTemp(root, content) {
  const tempPath = path.join(root, `incoming-${Math.random().toString(16).slice(2)}`);
  fs.writeFileSync(tempPath, content);
  return tempPath;
}

describe('backup file restore transaction', () => {
  test.each([1, 2, 3, 4, 5])('rolls back every destination after commit step %i fails', async failureStep => {
    const fixture = setupFixture();
    const before = fixture.snapshot();
    const originalLink = fs.linkSync;
    const originalCopy = fs.copyFileSync;
    const originalUnlink = fs.unlinkSync;
    const destinations = new Set(Object.values(fixture.existing).map(file => path.resolve(file)));
    const installed = new Set();
    const removedOriginals = [];
    const restoredOriginals = [];
    let commitStep = 0;
    let completedInstalls = 0;
    let probeLinks = 0;
    const spy = jest.spyOn(fs, 'linkSync').mockImplementation((source, destination) => {
      if (path.basename(destination).startsWith('.ltth-link-probe-')) probeLinks += 1;
      if (path.basename(source) === 'payload' && destinations.has(path.resolve(destination))) {
        commitStep += 1;
        if (commitStep === failureStep) throw new Error(`synthetic commit failure ${failureStep}`);
        const result = originalLink(source, destination);
        completedInstalls += 1;
        installed.add(path.resolve(destination));
        return result;
      }
      return originalLink(source, destination);
    });
    const unlink = jest.spyOn(fs, 'unlinkSync').mockImplementation(file => {
      const resolved = path.resolve(file);
      if (destinations.has(resolved) && !installed.has(resolved)) removedOriginals.push(resolved);
      return originalUnlink(file);
    });
    const copy = jest.spyOn(fs, 'copyFileSync').mockImplementation((source, destination, flags) => {
      const result = originalCopy(source, destination, flags);
      if (path.basename(source) === 'original' && destinations.has(path.resolve(destination))) {
        expect(flags).toBe(fs.constants.COPYFILE_EXCL);
        restoredOriginals.push(path.resolve(destination));
      }
      return result;
    });
    try {
      const result = await performImport(fixture.parsed, fixture.deps, {
        mode: 'replace', confirmProfileReplacement: true,
        includeGlobalSettings: false, includePluginSettings: false,
        includePluginData: true, includeUserConfigs: true,
        includeUploads: true, includeUserData: true
      });
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toContain('synthetic commit failure');
      expect(fixture.snapshot()).toEqual(before);
      expect(probeLinks).toBe(destinations.size);
      expect(commitStep).toBe(failureStep);
      expect(completedInstalls).toBe(failureStep - 1);
      expect(removedOriginals).toHaveLength(failureStep);
      expect(restoredOriginals.slice().sort()).toEqual(removedOriginals.slice().sort());
      rollbackEvidence.push({ failureStep, probeLinks, commitStep, completedInstalls,
        removedOriginals: removedOriginals.map(file => path.relative(fixture.root, file)),
        restoredOriginals: restoredOriginals.map(file => path.relative(fixture.root, file)),
        byteEquality: true });
    } finally {
      spy.mockRestore();
      unlink.mockRestore();
      copy.mockRestore();
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('never targets the active profile database; it imports under an explicit restored name', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-active-db-target-'));
    const configDir = path.join(root, 'user_configs');
    fs.mkdirSync(configDir, { recursive: true });
    const activeDb = path.join(configDir, 'profileA.db');
    fs.writeFileSync(activeDb, 'open-active-profile-bytes');
    const dbIncoming = writeTemp(root, 'backup-active-profile-bytes');
    const markerIncoming = writeTemp(root, 'profileA');
    const parsed = {
      manifest: { profileScopedDataPlugins: [] }, globalSettings: null, pluginSettings: {}, dataFiles: {},
      userConfigsFiles: [
        { relPath: 'profileA.db', tmpPath: dbIncoming },
        { relPath: '.active_profile', tmpPath: markerIncoming }
      ], uploadFiles: [], userDataFiles: [], warnings: [], errors: []
    };
    try {
      const result = await performImport(parsed, {
        db: { dbPath: activeDb }, configPathManager: { getUserConfigsDir: () => configDir }
      }, {
        mode: 'replace', confirmProfileReplacement: true,
        includeGlobalSettings: false, includePluginSettings: false, includePluginData: false,
        includeUserConfigs: true, includeUploads: false, includeUserData: false
      });
      expect(result.success).toBe(true);
      expect(fs.readFileSync(activeDb, 'utf8')).toBe('open-active-profile-bytes');
      expect(fs.readFileSync(path.join(configDir, '.active_profile'), 'utf8')).toMatch(/^profileA-restored-/);
      const restoredDb = fs.readdirSync(configDir).find(name => /^profileA-restored-.*\.db$/.test(name));
      expect(restoredDb).toBeTruthy();
      expect(fs.readFileSync(path.join(configDir, restoredDb), 'utf8')).toBe('backup-active-profile-bytes');
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('does not follow a synthetic upload-directory junction during replace restore', async () => {
    const fixture = setupFixture();
    const outsideDir = path.join(fixture.root, 'outside');
    const outsideFile = path.join(outsideDir, 'sentinel.txt');
    const junction = path.join(path.dirname(fixture.existing['uploads/item.txt']), 'redirect');
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.writeFileSync(outsideFile, 'preserve-outside-target');
    fs.symlinkSync(outsideDir, junction, 'junction');
    fixture.parsed.uploadFiles.push({
      relPath: 'redirect/escaped.txt',
      tmpPath: writeTemp(fixture.root, 'must-not-escape')
    });

    try {
      const result = await performImport(fixture.parsed, fixture.deps, {
        mode: 'replace', includeGlobalSettings: false, includePluginSettings: false,
        includePluginData: false, includeUserConfigs: false, includeUploads: true,
        includeUserData: false
      });

      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/symbolic link/i);
      expect(fs.readFileSync(outsideFile, 'utf8')).toBe('preserve-outside-target');
      expect(fs.existsSync(path.join(outsideDir, 'escaped.txt'))).toBe(false);
      expect(fs.readFileSync(fixture.existing['uploads/item.txt'], 'utf8')).toBe('before:uploads/item.txt');
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('rejects a synthetic profile data-root junction at commit before writing outside the profile', async () => {
    const fixture = setupFixture();
    const outsideDir = path.join(fixture.root, 'outside-profile-target');
    const outsideSentinel = path.join(outsideDir, 'sentinel.txt');
    const profileRoot = path.join(fixture.root, 'plugins', 'advanced-timer', 'profiles', 'profile_test', 'data');
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.writeFileSync(outsideSentinel, 'untouched-profile-sentinel');
    fs.mkdirSync(path.dirname(profileRoot), { recursive: true });
    fs.symlinkSync(outsideDir, profileRoot, 'junction');
    fixture.parsed.manifest.profileScopedDataPlugins = ['advanced-timer'];
    fixture.parsed.dataFiles = { 'advanced-timer': [{ relPath: 'item.txt', tmpPath: writeTemp(fixture.root, 'must-not-escape') }] };
    fixture.deps.configPathManager.getPluginDataDir = (_pluginId, options = {}) =>
      path.join(fixture.root, 'plugins', 'advanced-timer', ...(options.profileId ? ['profiles', options.profileId] : []), 'data');
    fixture.deps.configPathManager.getUserConfigsDir = () => fixture.configDir;
    fs.writeFileSync(path.join(fixture.configDir, 'profile_test.db'), 'synthetic-profile-marker');

    try {
      const result = await performImport(fixture.parsed, fixture.deps, {
        mode: 'merge', includeGlobalSettings: false, includePluginSettings: false, includePluginData: true,
        includeProfileScopedPluginData: true, targetProfile: 'profile_test',
        includeUserConfigs: false, includeUploads: false, includeUserData: false
      });
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/unsafe|symbolic link/i);
      expect(fs.readFileSync(outsideSentinel, 'utf8')).toBe('untouched-profile-sentinel');
      expect(fs.existsSync(path.join(outsideDir, 'item.txt'))).toBe(false);
      expect(fs.readdirSync(outsideDir)).toEqual(['sentinel.txt']);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
  test('atomically refuses a file appearing after the final absence observation', async () => {
    const fixture = setupFixture();
    const target = fixture.existing['uploads/item.txt'];
    fs.unlinkSync(target);
    const exists = fs.existsSync;
    let absentReads = 0;
    let injected = false;
    const spy = jest.spyOn(fs, 'existsSync').mockImplementation(file => {
      const result = exists(file);
      if (path.resolve(file) === target && !result) {
        absentReads += 1;
        // queue, stage, commit snapshot, final pre-install check.
        if (absentReads === 4) {
          fs.writeFileSync(target, 'concurrent-after-final-check');
          injected = true;
        }
      }
      return result;
    });
    try {
      const result = await performImport(fixture.parsed, fixture.deps, {
        mode: 'replace', includeGlobalSettings: false, includePluginSettings: false,
        includePluginData: false, includeUserConfigs: false, includeUploads: true, includeUserData: false
      });
      expect(injected).toBe(true);
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/EEXIST|file already exists/);
      expect(fs.readFileSync(target, 'utf8')).toBe('concurrent-after-final-check');
      expect(result.report.uploads.imported).toEqual([]);
    } finally {
      spy.mockRestore();
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test('fails closed on EXDEV instead of falling back to replacing rename', async () => {
    const fixture = setupFixture();
    const before = fixture.snapshot();
    let injected = false;
    let probeLinks = 0;
    let originalUnlinks = 0;
    let recoveryCopies = 0;
    const destinations = new Set(Object.values(fixture.existing).map(file => path.resolve(file)));
    const originalLink = fs.linkSync;
    const originalUnlink = fs.unlinkSync;
    const originalCopy = fs.copyFileSync;
    const link = jest.spyOn(fs, 'linkSync').mockImplementation((source, destination) => {
      if (path.basename(destination).startsWith('.ltth-link-probe-')) probeLinks += 1;
      if (path.basename(source) === 'payload' && destinations.has(path.resolve(destination))) {
        injected = true;
        const error = new Error('synthetic EXDEV at actual install');
        error.code = 'EXDEV';
        throw error;
      }
      return originalLink(source, destination);
    });
    const unlink = jest.spyOn(fs, 'unlinkSync').mockImplementation(file => {
      if (destinations.has(path.resolve(file))) originalUnlinks += 1;
      return originalUnlink(file);
    });
    const copy = jest.spyOn(fs, 'copyFileSync').mockImplementation((source, destination, flags) => {
      const result = originalCopy(source, destination, flags);
      if (path.basename(source) === 'original' && destinations.has(path.resolve(destination))) recoveryCopies += 1;
      return result;
    });
    const rename = jest.spyOn(fs, 'renameSync');
    try {
      const result = await performImport(fixture.parsed, fixture.deps, {
        mode: 'replace', confirmProfileReplacement: true,
        includeGlobalSettings: false, includePluginSettings: false,
        includePluginData: true, includeUserConfigs: true, includeUploads: true, includeUserData: true
      });
      expect(injected).toBe(true);
      expect(probeLinks).toBe(destinations.size);
      expect(originalUnlinks).toBe(1);
      expect(recoveryCopies).toBe(1);
      rollbackEvidence.push({ code: 'EXDEV', probeLinks, originalUnlinks, recoveryCopies, byteEquality: true });
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/EXDEV/);
      expect(rename).not.toHaveBeenCalled();
      expect(fixture.snapshot()).toEqual(before);
      expect(result.report.userConfigs.imported).toEqual([]);
      expect(result.report.uploads.imported).toEqual([]);
    } finally {
      link.mockRestore();
      unlink.mockRestore();
      copy.mockRestore();
      rename.mockRestore();
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  test.each(['EPERM', 'ENOTSUP', 'EXDEV'])(
    'preflights hard-link support before removing originals when %s is returned',
    async code => {
      const fixture = setupFixture();
      const before = fixture.snapshot();
      const originalLink = fs.linkSync;
      const originalUnlink = fs.unlinkSync;
      const originalPaths = new Set(Object.values(fixture.existing).map(file => path.resolve(file)));
      let originalUnlinks = 0;
      let renameCalls = 0;
      const link = jest.spyOn(fs, 'linkSync').mockImplementation((source, destination) => {
        if (path.basename(destination).startsWith('.ltth-link-probe-')) {
          const error = new Error(`synthetic ${code}`);
          error.code = code;
          throw error;
        }
        return originalLink(source, destination);
      });
      const unlink = jest.spyOn(fs, 'unlinkSync').mockImplementation(file => {
        if (originalPaths.has(path.resolve(file))) originalUnlinks += 1;
        return originalUnlink(file);
      });
      const rename = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
        renameCalls += 1;
        throw new Error('unexpected rename fallback');
      });
      try {
        const result = await performImport(fixture.parsed, fixture.deps, {
          mode: 'replace', confirmProfileReplacement: true,
          includeGlobalSettings: false, includePluginSettings: false,
          includePluginData: true, includeUserConfigs: true,
          includeUploads: true, includeUserData: true
        });
        expect(result.success).toBe(false);
        expect(result.errors.join(' ')).toContain(code);
        expect(originalUnlinks).toBe(0);
        expect(renameCalls).toBe(0);
        expect(fixture.snapshot()).toEqual(before);
        expect(result.report.uploads.imported).toEqual([]);
        expect(fs.readdirSync(path.dirname(fixture.existing['uploads/item.txt']))
          .some(name => name.startsWith('.ltth-link-probe-'))).toBe(false);
      } finally {
        rename.mockRestore();
        unlink.mockRestore();
        link.mockRestore();
        fs.rmSync(fixture.root, { recursive: true, force: true });
      }
    }
  );

});
