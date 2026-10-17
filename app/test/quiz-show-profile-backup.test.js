const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const archiver = require('archiver');
const { createManifest } = require('../modules/backup/manifest');
const { exportBackup } = require('../modules/backup/exporter');
const { parseBackupZip, previewImport, performImport, cleanupTempDir } = require('../modules/backup/importer');

function store(root) {
  return {
    getPluginsDir: () => path.join(root, 'plugins'),
    getPluginDataDir: (id, options = {}) => path.join(root, 'plugins', id, ...(options.profileId ? ['profiles', options.profileId] : []), 'data'),
    getUserConfigsDir: () => path.join(root, 'user_configs'),
    getUploadsDir: () => path.join(root, 'uploads'),
    getUserDataDir: () => path.join(root, 'user_data')
  };
}
async function writeArchive(result, file) {
  const output = fs.createWriteStream(file);
  result.stream.pipe(output);
  await new Promise((resolve, reject) => { output.on('close', resolve); output.on('error', reject); });
}
function profileDb(root, profile) {
  const dir = store(root).getUserConfigsDir();
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, `${profile}.db`));
  db.exec('CREATE TABLE IF NOT EXISTS marker (value TEXT)');
  db.close();
}

describe('Quiz Show profile-scoped backup integration', () => {
  let root, source, target;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-quiz-backup-'));
    source = store(path.join(root, 'source'));
    target = store(path.join(root, 'target'));
    profileDb(path.join(root, 'target'), 'profile_a');
    profileDb(path.join(root, 'target'), 'profile_b');
  });
  afterEach(() => { if (root) fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });

  function createQuizDb(dataRoot, profileId, { wal = false, apiKey = 'fixture-secret' } = {}) {
    const dir = store(dataRoot).getPluginDataDir('quiz-show', { profileId });
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'quiz_show.db');
    const db = new Database(file);
    if (wal) { db.pragma('journal_mode = WAL'); db.pragma('wal_autocheckpoint = 0'); }
    db.exec('CREATE TABLE questions (question TEXT); CREATE TABLE openai_config (id INTEGER PRIMARY KEY, api_key TEXT);');
    db.prepare('INSERT INTO questions VALUES (?)').run(`from-${profileId}`);
    db.prepare('INSERT INTO openai_config VALUES (1, ?)').run(apiKey);
    return { db, file };
  }

  async function createScopedParsedQuizBackup() {
    const { db: sourceDb, file: sourcePath } = createQuizDb(path.join(root, 'source'), 'profile_a');
    const db = new Database(':memory:');
    db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);');
    const archivePath = path.join(root, 'scoped-junction.zip');
    const exported = await exportBackup({ db, configPathManager: source, activeProfile: 'profile_a', appVersion: 'test' }, {
      includeGlobalSettings: false, includePluginSettings: false, includePluginData: true,
      includeUserConfigs: false, includeUploads: false, includeUserData: false,
      profileScopedDataPlugins: ['quiz-show']
    });
    await writeArchive(exported, archivePath);
    sourceDb.close();
    db.close();
    return parseBackupZip(archivePath, fs.statSync(archivePath).size);
  }

  test('exports selected profile with source binding, WAL snapshot, and default API key scrub; imports A to B to A', async () => {
    const { db: sourceDb, file: sourcePath } = createQuizDb(path.join(root, 'source'), 'profile_a', { wal: true });
    const walPath = `${sourcePath}-wal`;
    expect(fs.existsSync(walPath)).toBe(true);
    const db = new Database(':memory:');
    db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);');
    const archivePath = path.join(root, 'scoped.zip');
    const exported = await exportBackup({ db, configPathManager: source, activeProfile: 'profile_a', appVersion: 'test' }, {
      includeGlobalSettings: false, includePluginSettings: false, includePluginData: true,
      includeUserConfigs: false, includeUploads: false, includeUserData: false,
      profileScopedDataPlugins: ['quiz-show']
    });
    await writeArchive(exported, archivePath);
    expect(sourceDb.open).toBe(true);
    const parsed = await parseBackupZip(archivePath, fs.statSync(archivePath).size);
    expect(parsed.manifest.sourceProfile).toBe('profile_a');
    expect(parsed.manifest.profileScopedDataPlugins).toEqual(['quiz-show']);
    expect(parsed.dataFiles['quiz-show'].map(file => file.relPath)).toEqual(['quiz_show.db']);
    const archivedDb = new Database(parsed.dataFiles['quiz-show'][0].tmpPath, { readonly: true });
    expect(archivedDb.prepare('SELECT question FROM questions').get().question).toBe('from-profile_a');
    expect(archivedDb.prepare('SELECT api_key FROM openai_config').get().api_key).toBeNull();
    archivedDb.close();
    expect(previewImport(parsed, { db }).profileScopedPluginData.plugins).toContain('quiz-show');

    async function importInto(profile) {
      const result = await performImport(parsed, { db, configPathManager: target }, {
        mode: 'merge', includeGlobalSettings: false, includePluginSettings: false, includePluginData: true,
        includeProfileScopedPluginData: true, targetProfile: profile,
        includeUserConfigs: false, includeUploads: false, includeUserData: false
      });
      expect(result.errors).toEqual([]);
    }
    try {
      await importInto('profile_b');
      const bPath = target.getPluginDataDir('quiz-show', { profileId: 'profile_b' });
      const bDb = new Database(path.join(bPath, 'quiz_show.db'), { readonly: true });
      expect(bDb.prepare('SELECT question FROM questions').get().question).toBe('from-profile_a');
      bDb.close();
      expect(fs.existsSync(target.getPluginDataDir('quiz-show'))).toBe(false);
    } finally {
      cleanupTempDir(parsed.tmpDir);
      db.close(); sourceDb.close();
    }
  });

  test('legacy Quiz Show DB is skipped unless explicitly selected for an existing target profile', async () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);');
    const legacyDir = source.getPluginDataDir('quiz-show');
    fs.mkdirSync(legacyDir, { recursive: true });
    const legacy = new Database(path.join(legacyDir, 'quiz_show.db'));
    legacy.exec('CREATE TABLE questions (question TEXT);');
    legacy.prepare('INSERT INTO questions VALUES (?)').run('legacy-question');
    legacy.close();
    const archivePath = path.join(root, 'legacy.zip');
    const output = fs.createWriteStream(archivePath);
    const archive = archiver('zip'); archive.pipe(output);
    archive.file(path.join(legacyDir, 'quiz_show.db'), { name: 'plugins/quiz-show/data/quiz_show.db' });
    await archive.finalize();
    await new Promise((resolve, reject) => { output.on('close', resolve); output.on('error', reject); });
    const parsed = await parseBackupZip(archivePath, fs.statSync(archivePath).size);
    parsed.manifest = createManifest({ appVersion: 'test', profile: 'legacy', plugins: [], warnings: [] });
    expect(previewImport(parsed, { db }).profileScopedPluginData.legacyQuizShowDatabaseAvailable).toBe(true);
    const opts = { mode: 'merge', includeGlobalSettings: false, includePluginSettings: false, includePluginData: true,
      includeUserConfigs: false, includeUploads: false, includeUserData: false };
    try {
      let result = await performImport(parsed, { db, configPathManager: target }, opts);
      expect(result.errors).toEqual([]);
      expect(result.warnings.join(' ')).toMatch(/Unmarked legacy plugin data skipped/);
      expect(fs.existsSync(target.getPluginDataDir('quiz-show', { profileId: 'profile_b' }))).toBe(false);
      result = await performImport(parsed, { db, configPathManager: target, activeProfile: 'profile_b' }, {
        ...opts, includeLegacyQuizShowDatabase: true, targetProfile: 'profile_b'
      });
      expect(result.errors).toEqual([]);
      expect(fs.existsSync(path.join(target.getPluginDataDir('quiz-show', { profileId: 'profile_b' }), 'quiz_show.db'))).toBe(true);
    } finally {
      cleanupTempDir(parsed.tmpDir); db.close();
    }
  });

  test.each(['scoped archive', 'legacy archive'])('rejects a profile data-root junction for %s without writing through it', async kind => {
    const outsideDir = path.join(root, 'outside');
    const outsideSentinel = path.join(outsideDir, 'sentinel.txt');
    const targetBase = target.getPluginDataDir('quiz-show', { profileId: 'profile_b' });
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.writeFileSync(outsideSentinel, 'untouched-synthetic-sentinel');
    fs.mkdirSync(path.dirname(targetBase), { recursive: true });
    fs.symlinkSync(outsideDir, targetBase, 'junction');

    let parsed;
    let db;
    try {
      if (kind === 'scoped archive') {
        parsed = await createScopedParsedQuizBackup();
        db = new Database(':memory:');
        db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);');
        const result = await performImport(parsed, { db, configPathManager: target }, {
          mode: 'merge', includeGlobalSettings: false, includePluginSettings: false, includePluginData: true,
          includeProfileScopedPluginData: true, targetProfile: 'profile_b',
          includeUserConfigs: false, includeUploads: false, includeUserData: false
        });
        expect(result.success).toBe(false);
        expect(result.errors.join(' ')).toMatch(/unsafe|symbolic link/i);
      } else {
        db = new Database(':memory:');
        db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);');
        const legacyDir = source.getPluginDataDir('quiz-show');
        fs.mkdirSync(legacyDir, { recursive: true });
        const legacyDb = new Database(path.join(legacyDir, 'quiz_show.db'));
        legacyDb.exec('CREATE TABLE questions (question TEXT);');
        legacyDb.prepare('INSERT INTO questions VALUES (?)').run('synthetic-legacy-question');
        legacyDb.close();
        const archivePath = path.join(root, 'legacy-junction.zip');
        const output = fs.createWriteStream(archivePath);
        const archive = archiver('zip');
        archive.pipe(output);
        archive.file(path.join(legacyDir, 'quiz_show.db'), { name: 'plugins/quiz-show/data/quiz_show.db' });
        await archive.finalize();
        await new Promise((resolve, reject) => { output.on('close', resolve); output.on('error', reject); });
        parsed = await parseBackupZip(archivePath, fs.statSync(archivePath).size);
        parsed.manifest = createManifest({ appVersion: 'test', profile: 'legacy', plugins: [], warnings: [] });
        const result = await performImport(parsed, { db, configPathManager: target, activeProfile: 'profile_b' }, {
          mode: 'merge', includeGlobalSettings: false, includePluginSettings: false, includePluginData: true,
          includeLegacyQuizShowDatabase: true, targetProfile: 'profile_b',
          includeUserConfigs: false, includeUploads: false, includeUserData: false
        });
        expect(result.success).toBe(false);
        expect(result.errors.join(' ')).toMatch(/unsafe|symbolic link/i);
      }
      expect(fs.readFileSync(outsideSentinel, 'utf8')).toBe('untouched-synthetic-sentinel');
      expect(fs.existsSync(path.join(outsideDir, 'quiz_show.db'))).toBe(false);
    } finally {
      cleanupTempDir(parsed?.tmpDir);
      if (db?.open) db.close();
    }
  });
});
