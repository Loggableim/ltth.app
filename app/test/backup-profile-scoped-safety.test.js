const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const ConfigPathManager = require('../modules/config-path-manager');
const { exportBackup } = require('../modules/backup/exporter');
const importerPath = process.env.LTTH_BACKUP_IMPORTER || path.join(__dirname, '../modules/backup/importer');
const { parseBackupZip, performImport, cleanupTempDir } = require(importerPath);
const { validateManifest } = require('../modules/backup/manifest');
const { restorePluginSettings } = require('../modules/backup/plugin-discovery');
const { DEFAULT_STATE } = require('../modules/backup/schnorrbecher-state-schema');

function createStore(root) {
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

async function writeArchive(stream, archivePath) {
  const output = fs.createWriteStream(archivePath);
  stream.pipe(output);
  await new Promise((resolve, reject) => {
    output.once('close', resolve);
    output.once('error', reject);
  });
}

describe('profile-scoped backup prerequisites', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-profile-backup-'));
  });

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  test('ConfigPathManager keeps legacy storage separate from explicitly selected profiles', () => {
    const appDir = path.join(root, 'app');
    const manager = new ConfigPathManager({
      appDir,
      env: { LOCALAPPDATA: path.join(root, 'local') }
    });
    manager.customConfigPath = root;

    const legacy = manager.getPluginDataDir('advanced-timer');
    const profileA = manager.getPluginDataDir('advanced-timer', { profileId: 'profile_a' });
    const profileB = manager.getPluginDataDir('advanced-timer', { profileId: 'profile_b' });
    expect(profileA).not.toBe(legacy);
    expect(profileA).not.toBe(profileB);
    expect(legacy).toBe(path.join(root, 'plugins', 'advanced-timer', 'data'));
    expect(() => manager.getPluginDataDir('advanced-timer', { profileId: '../escape' })).toThrow(/Invalid profile ID/);
  });

  test('export records only explicitly selected active-profile data and omits session state', async () => {
    const store = createStore(path.join(root, 'source'));
    const timerDir = store.getPluginDataDir('advanced-timer', { profileId: 'profile_a' });
    const otherTimerDir = store.getPluginDataDir('advanced-timer', { profileId: 'profile_b' });
    const legacyTimerDir = store.getPluginDataDir('advanced-timer');
    const jarDir = store.getPluginDataDir('schnorrbecher', { profileId: 'profile_a' });
    for (const dir of [timerDir, otherTimerDir, legacyTimerDir, jarDir]) fs.mkdirSync(dir, { recursive: true });
    const timerDb = new Database(path.join(timerDir, 'timers.db'));
    timerDb.exec('CREATE TABLE timers (id TEXT PRIMARY KEY, label TEXT NOT NULL);');
    timerDb.prepare('INSERT INTO timers VALUES (?, ?)').run('source', 'profile-a');
    timerDb.close();
    fs.writeFileSync(path.join(timerDir, 'frame.txt'), 'profile-a frame');
    fs.writeFileSync(path.join(otherTimerDir, 'frame.txt'), 'profile-b frame');
    fs.writeFileSync(path.join(legacyTimerDir, 'frame.txt'), 'legacy frame');
    fs.writeFileSync(path.join(jarDir, 'coin-jar-config.json'), JSON.stringify({ persistenceMode: 'session' }));
    fs.writeFileSync(path.join(jarDir, 'coin-jar-state.json'), JSON.stringify({ ...DEFAULT_STATE, totalCoinValue: 77 }));

    const archivePath = path.join(root, 'profile-a.zip');
    const exported = await exportBackup({
      db: {}, configPathManager: store, activeProfile: 'profile_a', appVersion: 'test'
    }, {
      includeGlobalSettings: false, includePluginSettings: false, includePluginData: true,
      includeUserConfigs: false, includeUploads: false, includeUserData: false,
      profileScopedDataPlugins: ['advanced-timer', 'schnorrbecher'],
      includeSchnorrbecherPersistentState: true
    });
    await writeArchive(exported.stream, archivePath);
    const parsed = await parseBackupZip(archivePath, fs.statSync(archivePath).size);
    try {
      expect(parsed.manifest.sourceProfile).toBe('profile_a');
      expect(parsed.manifest.profileScopedDataPlugins).toEqual(['advanced-timer', 'schnorrbecher']);
      expect(parsed.dataFiles['advanced-timer'].map(file => file.relPath)).toEqual(expect.arrayContaining(['timers.db', 'frame.txt']));
      expect(parsed.dataFiles['schnorrbecher'].map(file => file.relPath)).toContain('coin-jar-config.json');
      expect(parsed.dataFiles['schnorrbecher'].map(file => file.relPath)).not.toContain('coin-jar-state.json');
      expect(fs.readFileSync(parsed.dataFiles['advanced-timer'].find(file => file.relPath === 'frame.txt').tmpPath, 'utf8'))
        .toBe('profile-a frame');
    } finally {
      cleanupTempDir(parsed.tmpDir);
    }
  });

  test('imports only into the explicitly selected target and never changes legacy or neighboring profile data', async () => {
    const source = createStore(path.join(root, 'source'));
    const target = createStore(path.join(root, 'target'));
    const sourceDir = source.getPluginDataDir('advanced-timer', { profileId: 'profile_a' });
    const targetA = target.getPluginDataDir('advanced-timer', { profileId: 'profile_a' });
    const targetB = target.getPluginDataDir('advanced-timer', { profileId: 'profile_b' });
    const targetLegacy = target.getPluginDataDir('advanced-timer');
    for (const dir of [sourceDir, targetA, targetB, targetLegacy, target.getUserConfigsDir()]) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'settings.json'), 'source data');
    fs.writeFileSync(path.join(targetA, 'keep.txt'), 'profile a');
    fs.writeFileSync(path.join(targetLegacy, 'keep.txt'), 'legacy');
    fs.writeFileSync(path.join(target.getUserConfigsDir(), 'profile_b.db'), 'synthetic profile');
    const sourceFile = path.join(root, 'source-file.txt');
    fs.writeFileSync(sourceFile, 'imported profile b');

    const parsed = {
      manifest: { sourceProfile: 'profile_a', profileScopedDataPlugins: ['advanced-timer'] },
      globalSettings: {}, pluginSettings: {},
      dataFiles: { 'advanced-timer': [{ relPath: 'settings.json', tmpPath: sourceFile }] },
      warnings: [], errors: []
    };
    const result = await performImport(parsed, {
      db: {}, configPathManager: target, activeProfile: 'profile_a'
    }, {
      mode: 'merge', includeGlobalSettings: false, includePluginSettings: false,
      includePluginData: true, includeProfileScopedPluginData: true,
      targetProfile: 'profile_b', includeUserConfigs: false, includeUploads: false, includeUserData: false
    });

    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(targetB, 'settings.json'), 'utf8')).toBe('imported profile b');
    expect(fs.readFileSync(path.join(targetA, 'keep.txt'), 'utf8')).toBe('profile a');
    expect(fs.readFileSync(path.join(targetLegacy, 'keep.txt'), 'utf8')).toBe('legacy');
  });


  test('requires an explicit existing target instead of reusing archive source metadata', async () => {
    const target = createStore(path.join(root, 'target'));
    fs.mkdirSync(target.getUserConfigsDir(), { recursive: true });
    fs.writeFileSync(path.join(target.getUserConfigsDir(), 'profile_a.db'), 'synthetic profile A');
    const payload = path.join(root, 'source-file');
    fs.writeFileSync(payload, 'source');
    const parsed = {
      manifest: { sourceProfile: 'profile_a', profileScopedDataPlugins: ['advanced-timer'] },
      globalSettings: {}, pluginSettings: {},
      dataFiles: { 'advanced-timer': [{ relPath: 'settings.json', tmpPath: payload }] },
      warnings: [], errors: []
    };
    const result = await performImport(parsed, { db: {}, configPathManager: target }, {
      mode: 'merge', includeGlobalSettings: false, includePluginSettings: false,
      includePluginData: true, includeProfileScopedPluginData: true,
      targetProfile: null, includeUserConfigs: false, includeUploads: false, includeUserData: false
    });
    expect(result.success).toBe(false);
    expect(result.errors.join(' ')).toMatch(/explicitly selected target profile/);
    expect(fs.existsSync(target.getPluginDataDir('advanced-timer', { profileId: 'profile_a' }))).toBe(false);
    expect(fs.existsSync(target.getPluginDataDir('advanced-timer'))).toBe(false);
  });

  test('preflights traversal before writes and rejects unmarked legacy data without guessing a profile', async () => {
    const target = createStore(path.join(root, 'target'));
    const profileDir = target.getPluginDataDir('advanced-timer', { profileId: 'profile_b' });
    fs.mkdirSync(path.join(target.getUserConfigsDir()), { recursive: true });
    fs.writeFileSync(path.join(target.getUserConfigsDir(), 'profile_b.db'), 'synthetic profile');
    const dataDir = path.join(root, 'source');
    fs.mkdirSync(dataDir, { recursive: true });
    const sourceFile = path.join(dataDir, 'payload');
    fs.writeFileSync(sourceFile, 'outside write must not happen');

    const malicious = {
      manifest: { sourceProfile: 'profile_a', profileScopedDataPlugins: ['advanced-timer'] },
      globalSettings: {}, pluginSettings: {},
      dataFiles: { 'advanced-timer': [{ relPath: '../../escape.txt', tmpPath: sourceFile }] },
      warnings: [], errors: []
    };
    const blocked = await performImport(malicious, { db: {}, configPathManager: target }, {
      mode: 'merge', includeGlobalSettings: false, includePluginSettings: false,
      includePluginData: true, includeProfileScopedPluginData: true,
      targetProfile: 'profile_b', includeUserConfigs: false, includeUploads: false, includeUserData: false
    });
    expect(blocked.success).toBe(false);
    expect(fs.existsSync(path.join(root, 'target', 'plugins', 'advanced-timer', 'profiles', 'escape.txt'))).toBe(false);
    expect(fs.existsSync(profileDir)).toBe(false);

    const unmarked = {
      manifest: { sourceProfile: 'profile_a' }, globalSettings: {}, pluginSettings: {},
      dataFiles: { 'advanced-timer': [{ relPath: 'settings.json', tmpPath: sourceFile }] },
      warnings: [], errors: []
    };
    const skipped = await performImport(unmarked, { db: {}, configPathManager: target }, {
      mode: 'replace', includeGlobalSettings: false, includePluginSettings: false,
      includePluginData: true, includeProfileScopedPluginData: true,
      targetProfile: 'profile_b', includeUserConfigs: false, includeUploads: false, includeUserData: false
    });
    expect(skipped.success).toBe(true);
    expect(fs.existsSync(profileDir)).toBe(false);
    expect(skipped.warnings.join(' ')).toMatch(/Unmarked legacy plugin data skipped/);
  });

  test('blocks Schnorrbecher imports over unknown forward-version state without changing target bytes', async () => {
    const target = createStore(path.join(root, 'target'));
    const configs = target.getUserConfigsDir();
    const targetDir = target.getPluginDataDir('schnorrbecher', { profileId: 'profile_b' });
    fs.mkdirSync(configs, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(configs, 'profile_b.db'), 'synthetic profile');
    const targetStatePath = path.join(targetDir, 'coin-jar-state.json');
    const rawTarget = { ...DEFAULT_STATE, futureVersionMarker: { keep: true } };
    const targetBytes = JSON.stringify(rawTarget);
    fs.writeFileSync(targetStatePath, targetBytes);
    const configPath = path.join(root, 'source-config.json');
    const statePath = path.join(root, 'source-state.json');
    fs.writeFileSync(configPath, JSON.stringify({ persistenceMode: 'persistent' }));
    fs.writeFileSync(statePath, JSON.stringify({ ...DEFAULT_STATE, totalCoinValue: 321 }));
    const parsed = {
      manifest: { sourceProfile: 'profile_a', profileScopedDataPlugins: ['schnorrbecher'] },
      globalSettings: {}, pluginSettings: {},
      dataFiles: { schnorrbecher: [
        { relPath: 'coin-jar-config.json', tmpPath: configPath },
        { relPath: 'coin-jar-state.json', tmpPath: statePath }
      ] },
      warnings: [], errors: []
    };
    const result = await performImport(parsed, { db: {}, configPathManager: target }, {
      mode: 'merge', includeGlobalSettings: false, includePluginSettings: false,
      includePluginData: true, includeProfileScopedPluginData: true,
      includeSchnorrbecherPersistentState: true, targetProfile: 'profile_b',
      includeUserConfigs: false, includeUploads: false, includeUserData: false
    });
    expect(result.success).toBe(false);
    expect(result.errors.join(' ')).toMatch(/Destination already exists: coin-jar-state.json/);
    expect(fs.readFileSync(targetStatePath, 'utf8')).toBe(targetBytes);
    expect(JSON.parse(fs.readFileSync(targetStatePath, 'utf8')).futureVersionMarker).toEqual({ keep: true });
    expect(fs.existsSync(path.join(targetDir, 'coin-jar-config.json'))).toBe(false);
    expect(parsed.dataFiles.schnorrbecher).toHaveLength(2);
  });

  test('accepts only an exact default Schnorrbecher state as initialized empty and permits its explicit replacement', async () => {
    const target = createStore(path.join(root, 'target'));
    const configDir = target.getUserConfigsDir();
    const targetDir = target.getPluginDataDir('schnorrbecher', { profileId: 'profile_b' });
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'profile_b.db'), 'synthetic profile');
    const targetStatePath = path.join(targetDir, 'coin-jar-state.json');
    fs.writeFileSync(targetStatePath, JSON.stringify(DEFAULT_STATE));
    const configPath = path.join(root, 'source-config.json');
    const statePath = path.join(root, 'source-state.json');
    fs.writeFileSync(configPath, JSON.stringify({ persistenceMode: 'persistent' }));
    fs.writeFileSync(statePath, JSON.stringify({ ...DEFAULT_STATE, totalCoinValue: 321 }));
    const parsed = {
      manifest: { sourceProfile: 'profile_a', profileScopedDataPlugins: ['schnorrbecher'] },
      globalSettings: {}, pluginSettings: {},
      dataFiles: { schnorrbecher: [
        { relPath: 'coin-jar-config.json', tmpPath: configPath },
        { relPath: 'coin-jar-state.json', tmpPath: statePath }
      ] },
      warnings: [], errors: []
    };
    const result = await performImport(parsed, { db: {}, configPathManager: target }, {
      mode: 'merge', includeGlobalSettings: false, includePluginSettings: false,
      includePluginData: true, includeProfileScopedPluginData: true,
      includeSchnorrbecherPersistentState: true, targetProfile: 'profile_b',
      includeUserConfigs: false, includeUploads: false, includeUserData: false
    });
    expect(result.success).toBe(true);
    expect(JSON.parse(fs.readFileSync(targetStatePath, 'utf8')).totalCoinValue).toBe(321);
    expect(parsed.dataFiles.schnorrbecher).toHaveLength(2);
  });

  test('preserves a concurrent Schnorrbecher state change made after preflight', async () => {
    const target = createStore(path.join(root, 'target'));
    const configDir = target.getUserConfigsDir();
    const targetDir = target.getPluginDataDir('schnorrbecher', { profileId: 'profile_b' });
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'profile_b.db'), 'synthetic profile');
    const targetStatePath = path.join(targetDir, 'coin-jar-state.json');
    fs.writeFileSync(targetStatePath, JSON.stringify(DEFAULT_STATE));
    const sourceConfig = path.join(root, 'source-config.json');
    const sourceState = path.join(root, 'source-state.json');
    fs.writeFileSync(sourceConfig, JSON.stringify({ persistenceMode: 'persistent' }));
    fs.writeFileSync(sourceState, JSON.stringify({ ...DEFAULT_STATE, totalCoinValue: 321 }));
    const concurrentState = JSON.stringify({ ...DEFAULT_STATE, totalCoinValue: 77, future: 'preserve' });
    const parsed = {
      manifest: { sourceProfile: 'profile_a', profileScopedDataPlugins: ['schnorrbecher'] },
      globalSettings: {}, pluginSettings: {},
      dataFiles: { schnorrbecher: [
        { relPath: 'coin-jar-config.json', tmpPath: sourceConfig },
        { relPath: 'coin-jar-state.json', tmpPath: sourceState }
      ] },
      warnings: [], errors: []
    };
    const originalRename = fs.renameSync;
    const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (destination.includes('.previous-')) fs.writeFileSync(source, concurrentState);
      return originalRename(source, destination);
    });
    try {
      const result = await performImport(parsed, { db: {}, configPathManager: target }, {
        mode: 'merge', includeGlobalSettings: false, includePluginSettings: false,
        includePluginData: true, includeProfileScopedPluginData: true,
        includeSchnorrbecherPersistentState: true, targetProfile: 'profile_b',
        includeUserConfigs: false, includeUploads: false, includeUserData: false
      });
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/changed after preflight/);
      expect(fs.readFileSync(targetStatePath, 'utf8')).toBe(concurrentState);
      expect(fs.existsSync(path.join(targetDir, 'coin-jar-config.json'))).toBe(false);
    } finally {
      renameSpy.mockRestore();
    }
  });

  test('rejects a junction anywhere above the selected profile data directory', async () => {
    const target = createStore(path.join(root, 'target'));
    const configDir = target.getUserConfigsDir();
    const pluginRoot = path.join(target.getPluginsDir(), 'schnorrbecher');
    const outsideProfiles = path.join(root, 'outside-profiles');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(pluginRoot, { recursive: true });
    fs.mkdirSync(path.join(outsideProfiles, 'profile_b', 'data'), { recursive: true });
    fs.writeFileSync(path.join(configDir, 'profile_b.db'), 'synthetic profile');
    fs.symlinkSync(outsideProfiles, path.join(pluginRoot, 'profiles'), 'junction');
    const sourceConfig = path.join(root, 'source-config.json');
    fs.writeFileSync(sourceConfig, JSON.stringify({ persistenceMode: 'persistent' }));
    const parsed = {
      manifest: { sourceProfile: 'profile_a', profileScopedDataPlugins: ['schnorrbecher'] },
      globalSettings: {}, pluginSettings: {},
      dataFiles: { schnorrbecher: [{ relPath: 'coin-jar-config.json', tmpPath: sourceConfig }] },
      warnings: [], errors: []
    };
    const result = await performImport(parsed, { db: {}, configPathManager: target }, {
      mode: 'merge', includeGlobalSettings: false, includePluginSettings: false,
      includePluginData: true, includeProfileScopedPluginData: true,
      targetProfile: 'profile_b', includeUserConfigs: false, includeUploads: false, includeUserData: false
    });
    expect(result.success).toBe(false);
    expect(result.errors.join(' ')).toMatch(/symbolic link/);
    expect(fs.existsSync(path.join(outsideProfiles, 'profile_b', 'data', 'coin-jar-config.json'))).toBe(false);
  });

  test('rechecks profile ancestors after an awaited provider before staging and never writes through its junction swap', async () => {
    const target = createStore(path.join(root, 'target'));
    const configDir = target.getUserConfigsDir();
    const pluginRoot = path.join(target.getPluginsDir(), 'advanced-timer');
    const profilesDir = path.join(pluginRoot, 'profiles');
    const outsideProfiles = path.join(root, 'outside-profiles');
    const outsideTarget = path.join(outsideProfiles, 'profile_b', 'data');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(profilesDir, { recursive: true });
    fs.mkdirSync(outsideTarget, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'profile_b.db'), 'synthetic profile');
    fs.writeFileSync(path.join(outsideTarget, 'sentinel.txt'), 'outside bytes must remain untouched');
    const outsideBefore = fs.readdirSync(outsideTarget).sort();
    const sourcePath = path.join(root, 'source-timer.txt');
    fs.writeFileSync(sourcePath, 'synthetic timer data');
    const parsed = {
      manifest: { sourceProfile: 'profile_a', profileScopedDataPlugins: ['advanced-timer'] },
      globalSettings: {}, pluginSettings: { 'advanced-timer': { marker: 'provider-await' } },
      dataFiles: { 'advanced-timer': [{ relPath: 'timer.txt', tmpPath: sourcePath }] },
      warnings: [], errors: []
    };
    const result = await performImport(parsed, { db: {}, configPathManager: target, backupProviders: {
      'advanced-timer': {
        importConfig: async () => {
          const oldProfiles = path.join(pluginRoot, 'profiles-before-swap');
          fs.renameSync(profilesDir, oldProfiles);
          fs.symlinkSync(outsideProfiles, profilesDir, 'junction');
          return { importedKeys: ['marker'] };
        }
      }
    } }, {
      mode: 'merge', includeGlobalSettings: false, includePluginSettings: true,
      includePluginData: true, includeProfileScopedPluginData: true,
      targetProfile: 'profile_b', includeUserConfigs: false, includeUploads: false, includeUserData: false
    });
    expect(result.success).toBe(false);
    expect(result.errors.join(' ')).toMatch(/symbolic link/);
    expect(fs.readdirSync(outsideTarget).sort()).toEqual(outsideBefore);
    expect(fs.readFileSync(path.join(outsideTarget, 'sentinel.txt'), 'utf8')).toBe('outside bytes must remain untouched');
    expect(fs.existsSync(path.join(outsideTarget, '.ltth-backup-stage-'))).toBe(false);
    expect(fs.readdirSync(path.join(pluginRoot, 'profiles-before-swap'))).toEqual([]);
    expect(fs.lstatSync(profilesDir).isSymbolicLink()).toBe(true);
  });

  test('does not copy into or recursively clean through a junction swapped during staging', async () => {
    const target = createStore(path.join(root, 'target'));
    const configDir = target.getUserConfigsDir();
    const pluginRoot = path.join(target.getPluginsDir(), 'advanced-timer');
    const profilesDir = path.join(pluginRoot, 'profiles');
    const outsideProfiles = path.join(root, 'outside-profiles');
    const outsideTarget = path.join(outsideProfiles, 'profile_b', 'data');
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(profilesDir, { recursive: true });
    fs.mkdirSync(outsideTarget, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'profile_b.db'), 'synthetic profile');
    fs.writeFileSync(path.join(outsideTarget, 'sentinel.txt'), 'outside bytes must remain untouched');
    const outsideBefore = fs.readdirSync(outsideTarget).sort();
    const sourcePath = path.join(root, 'source-timer.txt');
    fs.writeFileSync(sourcePath, 'synthetic timer data');
    const parsed = {
      manifest: { sourceProfile: 'profile_a', profileScopedDataPlugins: ['advanced-timer'] },
      globalSettings: {}, pluginSettings: {},
      dataFiles: { 'advanced-timer': [{ relPath: 'nested/timer.txt', tmpPath: sourcePath }] },
      warnings: [], errors: []
    };
    const originalMkdir = fs.mkdirSync;
    let injected = false;
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation((targetPath, options) => {
      const result = originalMkdir(targetPath, options);
      if (!injected && String(targetPath).includes('.ltth-backup-stage-') && String(targetPath).endsWith(path.join('nested'))) {
        injected = true;
        const oldProfiles = path.join(pluginRoot, 'profiles-before-swap');
        fs.renameSync(profilesDir, oldProfiles);
        fs.symlinkSync(outsideProfiles, profilesDir, 'junction');
      }
      return result;
    });
    try {
      const result = await performImport(parsed, { db: {}, configPathManager: target }, {
        mode: 'merge', includeGlobalSettings: false, includePluginSettings: false,
        includePluginData: true, includeProfileScopedPluginData: true,
        targetProfile: 'profile_b', includeUserConfigs: false, includeUploads: false, includeUserData: false
      });
      expect(injected).toBe(true);
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/became unsafe before copy/);
      expect(fs.readdirSync(outsideTarget).sort()).toEqual(outsideBefore);
      expect(fs.readFileSync(path.join(outsideTarget, 'sentinel.txt'), 'utf8')).toBe('outside bytes must remain untouched');
      const preserved = fs.readdirSync(path.join(pluginRoot, 'profiles-before-swap', 'profile_b', 'data'));
      expect(preserved.some(name => name.startsWith('.ltth-backup-stage-'))).toBe(true);
      expect(fs.lstatSync(profilesDir).isSymbolicLink()).toBe(true);
    } finally {
      mkdirSpy.mockRestore();
    }
  });

  test('keeps rollback recovery files when restoration itself fails', async () => {
    const target = createStore(path.join(root, 'target'));
    const configDir = target.getUserConfigsDir();
    const targetDir = target.getPluginDataDir('schnorrbecher', { profileId: 'profile_b' });
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'profile_b.db'), 'synthetic profile');
    const targetStatePath = path.join(targetDir, 'coin-jar-state.json');
    const originalBytes = JSON.stringify(DEFAULT_STATE);
    fs.writeFileSync(targetStatePath, originalBytes);
    const sourceConfig = path.join(root, 'source-config.json');
    const sourceState = path.join(root, 'source-state.json');
    fs.writeFileSync(sourceConfig, JSON.stringify({ persistenceMode: 'persistent' }));
    fs.writeFileSync(sourceState, JSON.stringify({ ...DEFAULT_STATE, totalCoinValue: 321 }));
    const parsed = {
      manifest: { sourceProfile: 'profile_a', profileScopedDataPlugins: ['schnorrbecher'] },
      globalSettings: {}, pluginSettings: {},
      dataFiles: { schnorrbecher: [
        { relPath: 'coin-jar-config.json', tmpPath: sourceConfig },
        { relPath: 'coin-jar-state.json', tmpPath: sourceState }
      ] },
      warnings: [], errors: []
    };
    const originalCopy = fs.copyFileSync;
    const originalLink = fs.linkSync;
    const copySpy = jest.spyOn(fs, 'copyFileSync').mockImplementation((source, destination, flags) => {
      if (destination === targetStatePath) throw new Error('injected state install failure');
      return originalCopy(source, destination, flags);
    });
    const linkSpy = jest.spyOn(fs, 'linkSync').mockImplementation((source, destination) => {
      if (destination === targetStatePath) throw new Error('injected restore failure');
      return originalLink(source, destination);
    });
    try {
      const result = await performImport(parsed, { db: {}, configPathManager: target }, {
        mode: 'merge', includeGlobalSettings: false, includePluginSettings: false,
        includePluginData: true, includeProfileScopedPluginData: true,
        includeSchnorrbecherPersistentState: true, targetProfile: 'profile_b',
        includeUserConfigs: false, includeUploads: false, includeUserData: false
      });
      expect(result.success).toBe(false);
      expect(result.errors.join(' ')).toMatch(/recovery data retained/);
      const stageDir = fs.readdirSync(targetDir).find(name => name.startsWith('.ltth-backup-stage-'));
      expect(stageDir).toBeDefined();
      const recoveryFile = path.join(targetDir, stageDir, '.previous-0');
      expect(fs.readFileSync(recoveryFile, 'utf8')).toBe(originalBytes);
      expect(fs.existsSync(targetStatePath)).toBe(false);
    } finally {
      copySpy.mockRestore();
      linkSpy.mockRestore();
    }
  });

  test('restores plugin settings through the DatabaseManager wrapper transaction contract', () => {
    const rawDb = new Database(':memory:');
    rawDb.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);');
    const manager = { db: rawDb, prepare: sql => rawDb.prepare(sql) };
    try {
      const result = restorePluginSettings(manager, 'coinbattle', { safe_key: 'safe-value' }, 'merge');
      expect(result.imported).toEqual(['safe_key']);
      expect(JSON.parse(rawDb.prepare('SELECT value FROM settings WHERE key=?').get('plugin:coinbattle:safe_key').value))
        .toBe('safe-value');
    } finally {
      rawDb.close();
    }
  });

  test('manifest rejects unknown or duplicate profile-scoped plugin identifiers', () => {
    const valid = {
      formatVersion: '1.0.0', exportedAt: new Date().toISOString(),
      app: { name: 'ltth.app', version: 'test' }, plugins: [], warnings: [],
      profileScopedDataPlugins: ['advanced-timer', 'schnorrbecher']
    };
    expect(validateManifest(valid).valid).toBe(true);
    expect(validateManifest({ ...valid, profileScopedDataPlugins: ['advanced-timer', 'unknown'] }).valid).toBe(false);
    expect(validateManifest({ ...valid, profileScopedDataPlugins: ['advanced-timer', 'advanced-timer'] }).valid).toBe(false);
  });
});
