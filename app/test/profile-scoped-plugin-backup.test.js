const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const archiver = require('archiver');
const { exportBackup } = require('../modules/backup/exporter');
const { parseBackupZip, performImport, cleanupTempDir } = require('../modules/backup/importer');

function makeProfileStore(root) {
  return {
    getPluginsDir: () => path.join(root, 'plugins'),
    getPluginDataDir: (pluginId, options = {}) => path.join(
      root, 'plugins', pluginId,
      ...(options.profileId ? ['profiles', options.profileId] : []), 'data'
    ),
    getUserConfigsDir: () => path.join(root, 'user_configs'),
    getUploadsDir: () => path.join(root, 'uploads'),
    getUserDataDir: () => path.join(root, 'user_data')
  };
}

async function writeArchive(stream, filePath) {
  const output = fs.createWriteStream(filePath);
  stream.pipe(output);
  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
  });
}

describe('profile-scoped plugin backup', () => {
  let root;
  let source;
  let target;
  let sourceDb;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-scoped-backup-'));
    source = makeProfileStore(path.join(root, 'source'));
    target = makeProfileStore(path.join(root, 'target'));
    const sourceTimerDir = source.getPluginDataDir('advanced-timer', { profileId: 'profile_a' });
    const sourceJarDir = source.getPluginDataDir('schnorrbecher', { profileId: 'profile_a' });
    const targetTimerDir = target.getPluginDataDir('advanced-timer', { profileId: 'profile_b' });
    const targetJarDir = target.getPluginDataDir('schnorrbecher', { profileId: 'profile_b' });
    const legacyTimerDir = source.getPluginDataDir('advanced-timer');
    const legacyJarDir = source.getPluginDataDir('schnorrbecher');
    const timerStage = path.join(sourceTimerDir, '.legacy-timer-import-test', 'nested');
    for (const dir of [sourceTimerDir, sourceJarDir, targetTimerDir, targetJarDir,
      legacyTimerDir, legacyJarDir,
      timerStage,
      path.join(sourceTimerDir, 'frames'), path.join(targetTimerDir, 'frames'),
      target.getPluginDataDir('advanced-timer', { profileId: 'profile_a' }),
      source.getUserConfigsDir(), target.getUserConfigsDir()]) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(source.getUserConfigsDir(), 'profile_a.db'), 'source profile marker');
    fs.writeFileSync(path.join(target.getUserConfigsDir(), 'profile_b.db'), 'target profile marker');
    sourceDb = new Database(path.join(sourceTimerDir, 'timers.db'));
    sourceDb.exec('CREATE TABLE audit_timer (id TEXT PRIMARY KEY, label TEXT NOT NULL);');
    sourceDb.prepare('INSERT INTO audit_timer VALUES (?, ?)').run('timer-a', 'source-only');
    sourceDb.close();
    fs.writeFileSync(path.join(sourceTimerDir, 'frames', 'frame.png'), Buffer.from([1, 2, 3, 4]));
    fs.writeFileSync(path.join(timerStage, 'should-not-export.txt'), 'staging data');
    fs.writeFileSync(path.join(sourceJarDir, 'coin-jar-config.json'), '{"jarLabel":"Source A"}');
    fs.writeFileSync(path.join(sourceJarDir, 'coin-jar-state.json'), '{"totalCoinValue":123}');
    fs.writeFileSync(path.join(legacyTimerDir, 'legacy-only.db'), 'shared timer bytes');
    fs.writeFileSync(path.join(legacyJarDir, 'legacy-only.json'), 'shared coin jar bytes');
    fs.writeFileSync(path.join(target.getPluginDataDir('advanced-timer', { profileId: 'profile_a' }), 'keep.txt'), 'not target B');
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('exports selected profile files and imports only into the explicitly selected target profile', async () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);');
    const archivePath = path.join(root, 'profile-a.zip');
    const exported = await exportBackup({
      db,
      configPathManager: source,
      activeProfile: 'profile_a',
      appVersion: 'test'
    }, {
      includeGlobalSettings: false,
      includePluginSettings: false,
      includePluginData: true,
      includeUserConfigs: false,
      includeUploads: false,
      includeUserData: false,
      profileScopedDataPlugins: ['advanced-timer', 'schnorrbecher']
    });
    await writeArchive(exported.stream, archivePath);
    const parsed = await parseBackupZip(archivePath, fs.statSync(archivePath).size);

    expect(parsed.manifest.sourceProfile).toBe('profile_a');
    expect(parsed.manifest.profileScopedDataPlugins).toEqual(['advanced-timer', 'schnorrbecher']);
    expect(parsed.dataFiles['advanced-timer'].some(file => file.relPath.includes('.legacy-timer-import-'))).toBe(false);
    const result = await performImport(parsed, {
      db,
      configPathManager: target
    }, {
      mode: 'merge',
      includeGlobalSettings: false,
      includePluginSettings: false,
      includePluginData: true,
      includeProfileScopedPluginData: true,
      targetProfile: 'profile_b',
      includeUserConfigs: false,
      includeUploads: false,
      includeUserData: false
    });

    expect(result.errors).toEqual([]);
    expect(fs.readFileSync(path.join(target.getPluginDataDir('advanced-timer', { profileId: 'profile_b' }), 'frames', 'frame.png')))
      .toEqual(Buffer.from([1, 2, 3, 4]));
    expect(fs.readFileSync(path.join(target.getPluginDataDir('schnorrbecher', { profileId: 'profile_b' }), 'coin-jar-config.json'), 'utf8'))
      .toContain('Source A');
    expect(fs.existsSync(path.join(target.getPluginDataDir('schnorrbecher', { profileId: 'profile_b' }), 'coin-jar-state.json'))).toBe(false);
    expect(fs.existsSync(path.join(target.getPluginDataDir('advanced-timer', { profileId: 'profile_a' }), 'timers.db'))).toBe(false);
    expect(fs.existsSync(path.join(target.getPluginDataDir('advanced-timer'), 'timers.db'))).toBe(false);
    const copiedDb = new Database(path.join(target.getPluginDataDir('advanced-timer', { profileId: 'profile_b' }), 'timers.db'), { readonly: true });
    expect(copiedDb.prepare('SELECT label FROM audit_timer WHERE id=?').get('timer-a').label).toBe('source-only');
    copiedDb.close();
    cleanupTempDir(parsed.tmpDir);
    db.close();
  });

  test('includes Schnorrbecher state only when explicitly selected and the config is persistent', async () => {
    const jarDir = source.getPluginDataDir('schnorrbecher', { profileId: 'profile_a' });
    fs.writeFileSync(path.join(jarDir, 'coin-jar-config.json'), '{"jarLabel":"Source A","persistenceMode":"persistent"}');
    const targetStatePath = path.join(target.getPluginDataDir('schnorrbecher', { profileId: 'profile_b' }), 'coin-jar-state.json');
    fs.writeFileSync(targetStatePath, `${JSON.stringify(require('../plugins/schnorrbecher/lib/config').DEFAULT_STATE, null, 2)}\n`);
    const db = new Database(':memory:');
    db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);');
    const archivePath = path.join(root, 'persistent-profile-a.zip');
    const exported = await exportBackup({ db, configPathManager: source, activeProfile: 'profile_a', appVersion: 'test' }, {
      includeGlobalSettings: false, includePluginSettings: false, includePluginData: true,
      includeUserConfigs: false, includeUploads: false, includeUserData: false,
      profileScopedDataPlugins: ['schnorrbecher'], includeSchnorrbecherPersistentState: true
    });
    await writeArchive(exported.stream, archivePath);
    const parsed = await parseBackupZip(archivePath, fs.statSync(archivePath).size);
    expect(parsed.dataFiles.schnorrbecher.map(file => file.relPath)).toContain('coin-jar-state.json');
    const result = await performImport(parsed, { db, configPathManager: target }, {
      mode: 'merge', includeGlobalSettings: false, includePluginSettings: false, includePluginData: true,
      includeProfileScopedPluginData: true, includeSchnorrbecherPersistentState: true,
      targetProfile: 'profile_b', includeUserConfigs: false, includeUploads: false, includeUserData: false
    });
    expect(result.errors).toEqual([]);
    expect(fs.readFileSync(path.join(target.getPluginDataDir('schnorrbecher', { profileId: 'profile_b' }), 'coin-jar-state.json'), 'utf8'))
      .toContain('123');
    cleanupTempDir(parsed.tmpDir);
    db.close();
  });

  test('exports an active Advanced Timer WAL as a standalone consistent database snapshot', async () => {
    const timerDir = source.getPluginDataDir('advanced-timer', { profileId: 'profile_a' });
    const timerPath = path.join(timerDir, 'timers.db');
    sourceDb = new Database(timerPath);
    sourceDb.pragma('journal_mode = WAL');
    sourceDb.pragma('wal_autocheckpoint = 0');
    sourceDb.exec('CREATE TABLE live_timer (id TEXT PRIMARY KEY, label TEXT NOT NULL);');
    sourceDb.prepare('INSERT INTO live_timer VALUES (?, ?)').run('wal-committed', 'Visible only from WAL');
    const walPath = `${timerPath}-wal`;
    expect(fs.statSync(walPath).size).toBeGreaterThan(0);
    const walBefore = fs.readFileSync(walPath);

    const db = new Database(':memory:');
    db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);');
    const archivePath = path.join(root, 'active-wal.zip');
    const exported = await exportBackup({ db, configPathManager: source, activeProfile: 'profile_a' }, {
      includeGlobalSettings: false, includePluginSettings: false, includePluginData: true,
      includeUserConfigs: false, includeUploads: false, includeUserData: false,
      profileScopedDataPlugins: ['advanced-timer']
    });
    expect(sourceDb.open).toBe(true);
    expect(fs.readFileSync(walPath)).toEqual(walBefore);
    await writeArchive(exported.stream, archivePath);
    const parsed = await parseBackupZip(archivePath, fs.statSync(archivePath).size);
    const files = parsed.dataFiles['advanced-timer'].map(file => file.relPath);
    expect(files).toContain('timers.db');
    expect(files.some(name => /timers\.db-(?:wal|shm)$/i.test(name))).toBe(false);

    const result = await performImport(parsed, { db, configPathManager: target }, {
      mode: 'merge', includeGlobalSettings: false, includePluginSettings: false,
      includePluginData: true, includeProfileScopedPluginData: true, targetProfile: 'profile_b',
      includeUserConfigs: false, includeUploads: false, includeUserData: false
    });
    expect(result.errors).toEqual([]);
    const importedPath = path.join(target.getPluginDataDir('advanced-timer', { profileId: 'profile_b' }), 'timers.db');
    expect(fs.existsSync(`${importedPath}-wal`)).toBe(false);
    expect(fs.existsSync(`${importedPath}-shm`)).toBe(false);
    const importedDb = new Database(importedPath, { readonly: true });
    expect(importedDb.prepare('SELECT label FROM live_timer WHERE id=?').get('wal-committed').label)
      .toBe('Visible only from WAL');
    importedDb.close();
    expect(sourceDb.prepare('SELECT count(*) AS n FROM live_timer').get().n).toBe(1);
    expect(sourceDb.open).toBe(true);
    cleanupTempDir(parsed.tmpDir);
    sourceDb.close();
    db.close();
  });

  test('snapshots user profile databases with an open WAL without checkpointing or archiving sidecars', async () => {
    const userConfigsDir = source.getUserConfigsDir();
    const profileDbPath = path.join(userConfigsDir, 'profile_a.db');
    fs.rmSync(profileDbPath, { force: true });
    sourceDb = new Database(profileDbPath);
    sourceDb.pragma('journal_mode = WAL');
    sourceDb.pragma('wal_autocheckpoint = 0');
    sourceDb.exec('CREATE TABLE profile_live (id TEXT PRIMARY KEY, value TEXT NOT NULL);');
    sourceDb.prepare('INSERT INTO profile_live VALUES (?, ?)').run('wal-row', 'committed in WAL');
    const walPath = `${profileDbPath}-wal`;
    expect(fs.statSync(walPath).size).toBeGreaterThan(0);
    const walBefore = fs.readFileSync(walPath);

    const db = new Database(':memory:');
    db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);');
    const archivePath = path.join(root, 'user-config-wal.zip');
    const exported = await exportBackup({ db, configPathManager: source, activeProfile: 'profile_a' }, {
      includeGlobalSettings: false, includePluginSettings: false, includePluginData: false,
      includeUserConfigs: true, includeUploads: false, includeUserData: false
    });
    expect(sourceDb.open).toBe(true);
    expect(fs.readFileSync(walPath)).toEqual(walBefore);
    await writeArchive(exported.stream, archivePath);
    const parsed = await parseBackupZip(archivePath, fs.statSync(archivePath).size);
    expect(parsed.userConfigsFiles.map(file => file.relPath)).toContain('profile_a.db');
    expect(parsed.userConfigsFiles.some(file => /profile_a\.db-(?:wal|shm)$/i.test(file.relPath))).toBe(false);

    const result = await performImport(parsed, { db, configPathManager: target }, {
      mode: 'merge', includeGlobalSettings: false, includePluginSettings: false,
      includePluginData: false, includeUserConfigs: true, includeUploads: false, includeUserData: false
    });
    expect(result.errors).toEqual([]);
    const importedPath = path.join(target.getUserConfigsDir(), 'profile_a.db');
    expect(fs.existsSync(`${importedPath}-wal`)).toBe(false);
    expect(fs.existsSync(`${importedPath}-shm`)).toBe(false);
    const importedDb = new Database(importedPath, { readonly: true });
    expect(importedDb.prepare('SELECT value FROM profile_live WHERE id=?').get('wal-row').value)
      .toBe('committed in WAL');
    importedDb.close();
    expect(sourceDb.prepare('SELECT count(*) AS n FROM profile_live').get().n).toBe(1);
    cleanupTempDir(parsed.tmpDir);
    sourceDb.close();
    db.close();
  });

  test('uses captured Schnorrbecher config and state bytes for the export', async () => {
    const jarDir = source.getPluginDataDir('schnorrbecher', { profileId: 'profile_a' });
    const configPath = path.join(jarDir, 'coin-jar-config.json');
    const statePath = path.join(jarDir, 'coin-jar-state.json');
    fs.writeFileSync(configPath, '{"persistenceMode":"persistent","revision":"captured"}');
    fs.writeFileSync(statePath, '{"revision":"captured-state"}');
    const db = new Database(':memory:');
    db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);');
    const archivePath = path.join(root, 'captured-jar.zip');
    const exported = await exportBackup({ db, configPathManager: source, activeProfile: 'profile_a' }, {
      includeGlobalSettings: false, includePluginSettings: false, includePluginData: true,
      includeUserConfigs: false, includeUploads: false, includeUserData: false,
      profileScopedDataPlugins: ['schnorrbecher'], includeSchnorrbecherPersistentState: true
    });
    fs.writeFileSync(configPath, '{"persistenceMode":"session","revision":"later"}');
    fs.writeFileSync(statePath, '{"revision":"later-state"}');
    await writeArchive(exported.stream, archivePath);
    const parsed = await parseBackupZip(archivePath, fs.statSync(archivePath).size);
    const config = parsed.dataFiles.schnorrbecher.find(file => file.relPath === 'coin-jar-config.json');
    const state = parsed.dataFiles.schnorrbecher.find(file => file.relPath === 'coin-jar-state.json');
    expect(JSON.parse(fs.readFileSync(config.tmpPath, 'utf8')).revision).toBe('captured');
    expect(JSON.parse(fs.readFileSync(state.tmpPath, 'utf8')).revision).toBe('captured-state');
    cleanupTempDir(parsed.tmpDir);
    db.close();
  });

  test('does not assign an old archive or conflict to any profile and preflights before writes', async () => {
    const parsed = {
      manifest: { sourceProfile: 'untrusted', plugins: [], warnings: [] },
      pluginSettings: {},
      globalSettings: null,
      dataFiles: { 'schnorrbecher': [{ relPath: 'coin-jar-config.json', tmpPath: path.join(root, 'legacy.json') }] },
      warnings: [], errors: []
    };
    fs.writeFileSync(path.join(root, 'legacy.json'), '{"legacy":true}');
    const db = new Database(':memory:');
    db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);');
    const skipped = await performImport(parsed, { db, configPathManager: target }, {
      includeGlobalSettings: false, includePluginSettings: false, includePluginData: true,
      includeUserConfigs: false, includeUploads: false, includeUserData: false
    });
    expect(skipped.warnings.join(' ')).toContain('skipped');
    expect(fs.existsSync(path.join(target.getPluginDataDir('schnorrbecher'), 'coin-jar-config.json'))).toBe(false);

    fs.writeFileSync(path.join(target.getPluginDataDir('schnorrbecher', { profileId: 'profile_b' }), 'coin-jar-config.json'), 'preserve');
    parsed.manifest.profileScopedDataPlugins = ['schnorrbecher'];
    const conflict = await performImport(parsed, { db, configPathManager: target }, {
      mode: 'merge', includeGlobalSettings: false, includePluginSettings: false, includePluginData: true,
      includeProfileScopedPluginData: true, targetProfile: 'profile_b',
      includeUserConfigs: false, includeUploads: false, includeUserData: false
    });
    expect(conflict.success).toBe(false);
    expect(conflict.errors.join(' ')).toContain('already exists');
    expect(fs.readFileSync(path.join(target.getPluginDataDir('schnorrbecher', { profileId: 'profile_b' }), 'coin-jar-config.json'), 'utf8')).toBe('preserve');
    db.close();
  });

  test('rejects SQL settings for a different scoped target before mutating settings or files', async () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);');
    db.prepare('INSERT INTO settings VALUES (?, ?)').run('theme', 'active-value');
    db.prepare('INSERT INTO settings VALUES (?, ?)').run('plugin:advanced-timer:config', '{"active":true}');
    const profileScopedPath = path.join(root, 'settings-data.json');
    fs.writeFileSync(profileScopedPath, '{"profile":"target"}');
    const beforeSettings = db.prepare('SELECT key, value FROM settings ORDER BY key').all();
    const parsed = {
      manifest: { sourceProfile: 'profile_a', profileScopedDataPlugins: ['schnorrbecher'], plugins: [], warnings: [] },
      globalSettings: { theme: 'backup-value' },
      pluginSettings: { 'advanced-timer': { config: { active: false } } },
      dataFiles: { schnorrbecher: [{ relPath: 'coin-jar-config.json', tmpPath: profileScopedPath }] },
      warnings: [], errors: []
    };
    const result = await performImport(parsed, { db, configPathManager: target, activeProfile: 'profile_a' }, {
      mode: 'merge', includeGlobalSettings: true, includePluginSettings: true, includePluginData: true,
      includeProfileScopedPluginData: true, targetProfile: 'profile_b', includeUserConfigs: false,
      includeUploads: false, includeUserData: false
    });

    expect(result.success).toBe(false);
    expect(result.errors.join(' ')).toMatch(/currently active profile/);
    expect(db.prepare('SELECT key, value FROM settings ORDER BY key').all()).toEqual(beforeSettings);
    expect(fs.existsSync(path.join(target.getPluginDataDir('schnorrbecher', { profileId: 'profile_b' }), 'coin-jar-config.json'))).toBe(false);
    db.close();
  });

  test('omits shared legacy files from normal backups even when the plugins are loaded', async () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);');
    const archivePath = path.join(root, 'without-profile-data.zip');
    const exported = await exportBackup({
      db, configPathManager: source, activeProfile: 'profile_a', appVersion: 'test',
      pluginLoader: { loadedPlugins: new Map([['advanced-timer', {}], ['schnorrbecher', {}]]) }
    }, {
      includeGlobalSettings: false, includePluginSettings: false, includePluginData: true,
      includeUserConfigs: false, includeUploads: false, includeUserData: false
    });
    await writeArchive(exported.stream, archivePath);
    const parsed = await parseBackupZip(archivePath, fs.statSync(archivePath).size);
    expect(parsed.dataFiles['advanced-timer']).toBeUndefined();
    expect(parsed.dataFiles.schnorrbecher).toBeUndefined();
    expect(exported.warnings.join(' ')).toContain('profile-data backup option');
    cleanupTempDir(parsed.tmpDir);
    db.close();
  });

  test('keeps ordinary plugin files on the archive streaming path', async () => {
    const ordinaryDataDir = path.join(source.getPluginsDir(), 'ordinary-plugin', 'data');
    fs.mkdirSync(ordinaryDataDir, { recursive: true });
    const ordinaryFile = path.join(ordinaryDataDir, 'large-data.bin');
    fs.writeFileSync(ordinaryFile, Buffer.alloc(4096, 0x5a));
    const db = new Database(':memory:');
    db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);');
    const readSpy = jest.spyOn(fs, 'readFileSync');
    const archivedFiles = [];
    const archiveFactory = (...args) => {
      const archive = archiver(...args);
      const originalFile = archive.file.bind(archive);
      archive.file = (filePath, options) => {
        archivedFiles.push(path.resolve(filePath));
        return originalFile(filePath, options);
      };
      return archive;
    };
    try {
      const exported = await exportBackup({
        db, configPathManager: source, activeProfile: 'profile_a', archiveFactory,
        pluginLoader: { loadedPlugins: new Map([['ordinary-plugin', {}]]) }
      }, {
        includeGlobalSettings: false, includePluginSettings: false, includePluginData: true,
        includeUserConfigs: false, includeUploads: false, includeUserData: false
      });
      expect(archivedFiles).toContain(path.resolve(ordinaryFile));
      expect(readSpy.mock.calls.some(([file]) => typeof file === 'string' && path.resolve(file) === path.resolve(ordinaryFile))).toBe(false);
      await writeArchive(exported.stream, path.join(root, 'ordinary-streaming.zip'));
    } finally {
      readSpy.mockRestore();
      db.close();
    }
  });
});
