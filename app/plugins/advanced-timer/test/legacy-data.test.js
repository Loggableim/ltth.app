const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { inspectLegacy, importLegacy } = require('../backend/legacy-data');
const legacyDataFs = require('fs');
const TimerDatabase = require('../backend/database');

describe('Advanced Timer legacy-data import', () => {
  let root;
  let legacyDir;
  let targetDir;
  let database;
  let targetTimerDatabase;
  let api;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'advanced-timer-legacy-'));
    legacyDir = path.join(root, 'plugins', 'advanced-timer', 'data');
    targetDir = path.join(root, 'plugins', 'advanced-timer', 'profiles', 'test_profile', 'data');
    fs.mkdirSync(path.join(legacyDir, 'frames'), { recursive: true });
    fs.mkdirSync(path.join(targetDir, 'frames'), { recursive: true });
    api = {
      log: jest.fn(),
      getConfigPathManager: () => ({ getPluginDataDir: (_id, options = {}) => options.profileId ? targetDir : legacyDir }),
      getPluginDataDir: options => options?.profileScoped ? targetDir : legacyDir,
      getPluginDir: () => path.join(root, 'plugins', 'advanced-timer'),
      getActiveProfile: () => 'test_profile'
    };
    targetTimerDatabase = new TimerDatabase(api);
    targetTimerDatabase.initialize();
    database = targetTimerDatabase.db;
    createLegacySource();
    fs.writeFileSync(path.join(legacyDir, 'frames', 'old-frame.png'), Buffer.from([4, 3, 2, 1]));
  });

  afterEach(() => {
    targetTimerDatabase?.destroy();
    fs.rmSync(root, { recursive: true, force: true });
  });

  function createLegacySource() {
    const legacyApi = { ...api, getPluginDataDir: () => legacyDir };
    const legacyTimerDatabase = new TimerDatabase(legacyApi);
    legacyTimerDatabase.initialize();
    legacyTimerDatabase.db.prepare('INSERT INTO advanced_timers (id, name, mode) VALUES (?, ?, ?)').run('old-1', 'Legacy timer', 'countdown');
    legacyTimerDatabase.destroy();
  }

  test('previews and imports into an empty profile without changing the shared source', () => {
    const preview = inspectLegacy(api, { db: database });
    expect(preview.canImport).toBe(true);
    expect(preview.rows.advanced_timers).toBe(1);
    const result = importLegacy(api, targetTimerDatabase);
    expect(result.restartRequired).toBe(true);
    expect(targetTimerDatabase.db.prepare('SELECT name FROM advanced_timers WHERE id=?').get('old-1').name).toBe('Legacy timer');
    expect(fs.readFileSync(path.join(targetDir, 'frames', 'old-frame.png'))).toEqual(Buffer.from([4, 3, 2, 1]));
    const sourceDb = new Database(path.join(legacyDir, 'timers.db'), { readonly: true });
    expect(sourceDb.prepare('SELECT COUNT(*) AS count FROM advanced_timers').get().count).toBe(1);
    sourceDb.close();
  });

  test('does not auto-assign plugin-directory legacy timers to the active profile', () => {
    const isolatedRoot = path.join(root, 'isolated-migration');
    const pluginDir = path.join(isolatedRoot, 'app', 'plugins', 'advanced-timer');
    const sharedDir = path.join(isolatedRoot, 'user-data', 'plugins', 'advanced-timer', 'data');
    const sourceDir = path.join(pluginDir, 'data');
    const profileDir = profile => path.join(isolatedRoot, 'profiles', profile, 'plugins', 'advanced-timer', 'data');
    const makeApi = profile => ({
      log: jest.fn(),
      getActiveProfile: () => profile,
      getPluginDir: () => pluginDir,
      getConfigPathManager: () => ({
        getPluginDataDir: (_id, options = {}) => options.profileId ? profileDir(options.profileId) : sharedDir
      }),
      getPluginDataDir: options => options?.profileScoped ? profileDir(profile) : sharedDir
    });
    const sourceApi = { ...makeApi('profile_a'), getPluginDataDir: () => sourceDir };
    const source = new TimerDatabase(sourceApi);
    source.initialize();
    source.db.prepare('INSERT INTO advanced_timers (id, name, mode) VALUES (?, ?, ?)').run('legacy-only', 'Legacy only', 'countdown');
    source.destroy();

    const apiA = makeApi('profile_a');
    const targetA = new TimerDatabase(apiA);
    targetA.initialize();
    const targetB = new TimerDatabase(makeApi('profile_b'));
    targetB.initialize();
    try {
      expect(targetA.db.prepare('SELECT COUNT(*) AS count FROM advanced_timers').get().count).toBe(0);
      expect(targetB.db.prepare('SELECT COUNT(*) AS count FROM advanced_timers').get().count).toBe(0);

      const preview = inspectLegacy(apiA, targetA);
      expect(preview.sourceId).toBe('plugin_directory');
      expect(preview.canImport).toBe(true);
      importLegacy(apiA, targetA, { sourceId: preview.sourceId });

      expect(targetA.db.prepare('SELECT name FROM advanced_timers WHERE id=?').get('legacy-only').name).toBe('Legacy only');
      expect(targetB.db.prepare('SELECT COUNT(*) AS count FROM advanced_timers').get().count).toBe(0);
      const retainedSource = new Database(path.join(sourceDir, 'timers.db'), { readonly: true });
      expect(retainedSource.prepare('SELECT COUNT(*) AS count FROM advanced_timers').get().count).toBe(1);
      retainedSource.close();
    } finally {
      targetA.destroy();
      targetB.destroy();
    }
  });

  test('requires source selection when multiple legacy stores contain data', () => {
    const isolatedRoot = path.join(root, 'ambiguous-migration');
    const pluginDir = path.join(isolatedRoot, 'app', 'plugins', 'advanced-timer');
    const sharedDir = path.join(isolatedRoot, 'user-data', 'plugins', 'advanced-timer', 'data');
    const sourceDir = path.join(pluginDir, 'data');
    const targetDir = path.join(isolatedRoot, 'profiles', 'profile_a', 'plugins', 'advanced-timer', 'data');
    const api = {
      log: jest.fn(),
      getActiveProfile: () => 'profile_a',
      getPluginDir: () => pluginDir,
      getConfigPathManager: () => ({ getPluginDataDir: (_id, options = {}) => options.profileId ? targetDir : sharedDir }),
      getPluginDataDir: options => options?.profileScoped ? targetDir : sharedDir
    };
    for (const [dir, id, name] of [[sourceDir, 'plugin-copy', 'Plugin copy'], [sharedDir, 'shared-copy', 'Shared copy']]) {
      const writer = new TimerDatabase({ ...api, getPluginDataDir: () => dir });
      writer.initialize();
      writer.db.prepare('INSERT INTO advanced_timers (id, name, mode) VALUES (?, ?, ?)').run(id, name, 'countdown');
      writer.destroy();
    }
    const target = new TimerDatabase(api);
    target.initialize();
    try {
      const ambiguous = inspectLegacy(api, target);
      expect(ambiguous.requiresSourceSelection).toBe(true);
      expect(ambiguous.canImport).toBe(false);
      expect(ambiguous.availableSources).toEqual(['shared_data', 'plugin_directory']);

      const selected = inspectLegacy(api, target, { sourceId: 'plugin_directory' });
      expect(selected.canImport).toBe(true);
      expect(selected.sourceId).toBe('plugin_directory');
      importLegacy(api, target, { sourceId: selected.sourceId });
      expect(target.db.prepare('SELECT name FROM advanced_timers').all()).toEqual([{ name: 'Plugin copy' }]);
    } finally {
      target.destroy();
    }
  });

  test('refuses target data or frame conflicts without overwriting', () => {
    fs.writeFileSync(path.join(targetDir, 'frames', 'old-frame.png'), 'keep');
    expect(inspectLegacy(api, targetTimerDatabase).canImport).toBe(false);
    expect(() => importLegacy(api, targetTimerDatabase)).toThrow(/target profile already contains/);
    expect(fs.readFileSync(path.join(targetDir, 'frames', 'old-frame.png'), 'utf8')).toBe('keep');
  });

  test('a frame copy failure rolls back database inserts and removes only copied files', () => {
    fs.writeFileSync(path.join(legacyDir, 'frames', 'second-frame.png'), Buffer.from([5, 5]));
    let copyCount = 0;
    expect(() => importLegacy(api, targetTimerDatabase, {
      copyFinalFile: (source, destination, flags) => {
        copyCount += 1;
        if (copyCount === 2) throw new Error('injected frame-copy failure');
        fs.copyFileSync(source, destination, flags);
      }
    })).toThrow(/injected frame-copy failure/);
    expect(targetTimerDatabase.db.prepare('SELECT COUNT(*) AS count FROM advanced_timers').get().count).toBe(0);
    expect(fs.existsSync(path.join(targetDir, 'frames', 'old-frame.png'))).toBe(false);
    expect(fs.existsSync(path.join(targetDir, 'frames', 'second-frame.png'))).toBe(false);
    expect(fs.existsSync(path.join(legacyDir, 'frames', 'old-frame.png'))).toBe(true);
    const source = new Database(path.join(legacyDir, 'timers.db'), { readonly: true });
    expect(source.prepare('SELECT COUNT(*) AS count FROM advanced_timers').get().count).toBe(1);
    source.close();
  });

  test('keeps the original copy error when staging cleanup also fails', () => {
    const cleanupFs = jest.spyOn(legacyDataFs, 'rmSync').mockImplementation((target, options) => {
      if (String(target).includes('.legacy-timer-import-')) throw new Error('injected stage cleanup failure');
      return fs.rmSync(target, options);
    });
    try {
      expect(() => importLegacy(api, targetTimerDatabase, {
        copyFinalFile: () => { throw new Error('injected original copy failure'); }
      })).toThrow(/injected original copy failure; Legacy import staging cleanup failed: injected stage cleanup failure/);
      expect(targetTimerDatabase.db.prepare('SELECT COUNT(*) AS count FROM advanced_timers').get().count).toBe(0);
    } finally {
      cleanupFs.mockRestore();
      for (const entry of fs.readdirSync(targetDir).filter(name => name.startsWith('.legacy-timer-import-'))) {
        fs.rmSync(path.join(targetDir, entry), { recursive: true, force: true });
      }
    }
  });

  test('returns success with cleanup warning after commit when staging cleanup fails', () => {
    const cleanupFs = jest.spyOn(legacyDataFs, 'rmSync').mockImplementation((target, options) => {
      if (String(target).includes('.legacy-timer-import-')) throw new Error('injected stage cleanup failure');
      return fs.rmSync(target, options);
    });
    let result;
    try {
      result = importLegacy(api, targetTimerDatabase);
      expect(result.success).toBe(true);
      expect(result.cleanupWarning).toMatch(/staging cleanup failed: injected stage cleanup failure/);
      expect(targetTimerDatabase.db.prepare('SELECT COUNT(*) AS count FROM advanced_timers').get().count).toBe(1);
      expect(fs.existsSync(path.join(targetDir, 'frames', 'old-frame.png'))).toBe(true);
    } finally {
      cleanupFs.mockRestore();
      for (const entry of fs.readdirSync(targetDir).filter(name => name.startsWith('.legacy-timer-import-'))) {
        fs.rmSync(path.join(targetDir, entry), { recursive: true, force: true });
      }
    }
  });

  test('rejects an unsupported source schema without changing the initialized target', () => {
    const legacyPath = path.join(legacyDir, 'timers.db');
    const legacy = new Database(legacyPath);
    legacy.exec('ALTER TABLE advanced_timers ADD COLUMN unsupported_user_data TEXT;');
    legacy.close();
    expect(() => importLegacy(api, targetTimerDatabase)).toThrow(/unsupported columns/);
    expect(targetTimerDatabase.db.prepare('SELECT COUNT(*) AS count FROM advanced_timers').get().count).toBe(0);
    expect(fs.existsSync(path.join(legacyDir, 'frames', 'old-frame.png'))).toBe(true);
  });

  test('fresh initialized target with settings defaults still accepts an explicit legacy import', () => {
    const freshRoot = path.join(root, 'fresh');
    const freshLegacyDir = path.join(freshRoot, 'shared');
    const freshTargetDir = path.join(freshRoot, 'profile', 'data');
    fs.mkdirSync(path.join(freshLegacyDir, 'frames'), { recursive: true });
    fs.mkdirSync(path.join(freshTargetDir, 'frames'), { recursive: true });
    const freshApi = {
      ...api,
      getConfigPathManager: () => ({ getPluginDataDir: () => freshLegacyDir }),
      getPluginDataDir: options => options?.profileScoped ? freshTargetDir : freshLegacyDir,
      getPluginDir: () => freshRoot
    };
    const freshTarget = new TimerDatabase(freshApi);
    freshTarget.initialize();
    const freshLegacy = new TimerDatabase({ ...freshApi, getPluginDataDir: () => freshLegacyDir });
    freshLegacy.initialize();
    freshLegacy.db.prepare('INSERT INTO advanced_timers (id, name, mode) VALUES (?, ?, ?)').run('fresh-legacy', 'Fresh legacy timer', 'countdown');
    freshLegacy.destroy();
    expect(inspectLegacy(freshApi, freshTarget).canImport).toBe(true);
    expect(importLegacy(freshApi, freshTarget).success).toBe(true);
    expect(freshTarget.db.prepare('SELECT name FROM advanced_timers WHERE id=?').get('fresh-legacy').name).toBe('Fresh legacy timer');
    freshTarget.destroy();
  });
});
