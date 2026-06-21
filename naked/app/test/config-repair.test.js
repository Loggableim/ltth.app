const fs = require('fs');
const os = require('os');
const path = require('path');
const SQLite = require('better-sqlite3');
const ConfigRepair = require('../modules/config-repair');

function makeHarness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-config-repair-'));
  const userConfigsDir = path.join(root, 'user_configs');
  const userDataDir = path.join(root, 'user_data');
  const pluginsDir = path.join(root, 'plugins');
  const uploadsDir = path.join(root, 'uploads');

  const configPathManager = {
    getConfigDir: () => root,
    getUserConfigsDir: () => userConfigsDir,
    getUserDataDir: () => userDataDir,
    getPluginsDir: () => pluginsDir,
    getUploadsDir: () => uploadsDir,
    ensureDirectoriesExist: () => {
      for (const dir of [root, userConfigsDir, userDataDir, pluginsDir, uploadsDir]) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  };

  const profileManager = {
    activeProfilePath: path.join(userConfigsDir, '.active_profile'),
    getProfilePath: username => path.join(userConfigsDir, `${String(username).replace(/[^a-zA-Z0-9_-]/g, '_')}.db`)
  };

  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  configPathManager.ensureDirectoriesExist();

  return { root, userConfigsDir, configPathManager, profileManager, logger };
}

function createProfileDb(dbPath, settings = {}) {
  const db = new SQLite(dbPath);
  db.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  const stmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(settings)) {
    stmt.run(key, value);
  }

  db.close();
}

describe('ConfigRepair', () => {
  let harness;

  afterEach(() => {
    if (harness?.root && fs.existsSync(harness.root)) {
      fs.rmSync(harness.root, { recursive: true, force: true });
    }
  });

  test('selects newest valid profile when copied active profile marker is stale', () => {
    harness = makeHarness();
    const olderPath = path.join(harness.userConfigsDir, 'older.db');
    const newerPath = path.join(harness.userConfigsDir, 'newer.db');

    createProfileDb(olderPath);
    createProfileDb(newerPath);

    const oldTime = new Date('2024-01-01T00:00:00Z');
    const newTime = new Date('2025-01-01T00:00:00Z');
    fs.utimesSync(olderPath, oldTime, oldTime);
    fs.utimesSync(newerPath, newTime, newTime);
    fs.writeFileSync(harness.profileManager.activeProfilePath, 'missing_from_old_pc', 'utf8');

    const report = new ConfigRepair(harness.configPathManager, harness.profileManager, harness.logger).runStartupRepair();

    expect(fs.readFileSync(harness.profileManager.activeProfilePath, 'utf8')).toBe('newer');
    expect(report.repairs.some(item => item.includes('selected newest valid profile "newer"'))).toBe(true);
  });

  test('rewrites copied config-root paths inside profile settings', () => {
    harness = makeHarness();
    const dbPath = path.join(harness.userConfigsDir, 'streamer.db');
    const oldRawPath = 'C:\\Users\\proki\\AppData\\Local\\pupcidslittletiktokhelper\\uploads\\sound.mp3';
    const oldJsonPath = '{"path":"C:\\\\Users\\\\proki\\\\AppData\\\\Local\\\\pupcidslittletiktokhelper\\\\uploads\\\\anim.gif"}';

    createProfileDb(dbPath, {
      raw_path: oldRawPath,
      json_path: oldJsonPath
    });

    const report = new ConfigRepair(harness.configPathManager, harness.profileManager, harness.logger).runStartupRepair();
    const db = new SQLite(dbPath, { readonly: true });
    const rows = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(row => [row.key, row.value]));
    db.close();

    expect(rows.raw_path).toBe(path.join(harness.root, 'uploads', 'sound.mp3'));
    expect(rows.json_path).toContain(harness.root.replace(/\\/g, '\\\\'));
    expect(report.repairs.some(item => item.includes('copied config path setting'))).toBe(true);
  });

  test('quarantines broken profile database and clears active marker when no valid profile remains', () => {
    harness = makeHarness();
    const brokenPath = path.join(harness.userConfigsDir, 'broken.db');
    fs.writeFileSync(brokenPath, 'not a sqlite database', 'utf8');
    fs.writeFileSync(`${brokenPath}-shm`, 'stale sidecar', 'utf8');
    fs.writeFileSync(harness.profileManager.activeProfilePath, 'broken', 'utf8');

    const report = new ConfigRepair(harness.configPathManager, harness.profileManager, harness.logger).runStartupRepair();

    expect(fs.existsSync(brokenPath)).toBe(false);
    expect(fs.existsSync(harness.profileManager.activeProfilePath)).toBe(false);
    expect(report.warnings.some(item => item.includes('could not be opened'))).toBe(true);
    expect(report.repairs.some(item => item.includes('Moved broken profile'))).toBe(true);
    expect(fs.existsSync(path.join(harness.root, 'repair_reports', 'latest-startup-repair.json'))).toBe(true);
  });

  test('recovers readable broken profile backup into a fresh profile and activates it over default', () => {
    harness = makeHarness();
    const defaultPath = path.join(harness.userConfigsDir, 'default.db');
    createProfileDb(defaultPath, { theme: 'fresh-default' });
    fs.writeFileSync(harness.profileManager.activeProfilePath, 'default', 'utf8');

    const backupDir = path.join(harness.root, 'repair_backups', 'older-run', 'broken-profiles');
    fs.mkdirSync(backupDir, { recursive: true });
    const oldProfileBackup = path.join(backupDir, 'derfeuerfuchs.db');
    createProfileDb(oldProfileBackup, {
      theme: 'old-profile',
      api_key: 'secret-from-old-db'
    });

    const report = new ConfigRepair(harness.configPathManager, harness.profileManager, harness.logger).runStartupRepair();

    const recoveredPath = path.join(harness.userConfigsDir, 'derfeuerfuchs.db');
    expect(fs.existsSync(recoveredPath)).toBe(true);
    expect(fs.readFileSync(harness.profileManager.activeProfilePath, 'utf8')).toBe('derfeuerfuchs');

    const recoveredDb = new SQLite(recoveredPath, { readonly: true });
    const settings = Object.fromEntries(recoveredDb.prepare('SELECT key, value FROM settings').all().map(row => [row.key, row.value]));
    recoveredDb.close();

    expect(settings.theme).toBe('old-profile');
    expect(settings.api_key).toBe('secret-from-old-db');
    expect(report.repairs.some(item => item.includes('Recovered') && item.includes('derfeuerfuchs'))).toBe(true);
  });

  test('imports readable default backup into existing default profile', () => {
    harness = makeHarness();
    const defaultPath = path.join(harness.userConfigsDir, 'default.db');
    createProfileDb(defaultPath, { theme: 'fresh-default' });
    fs.writeFileSync(harness.profileManager.activeProfilePath, 'default', 'utf8');

    const backupDir = path.join(harness.root, 'repair_backups', 'older-run', 'broken-profiles');
    fs.mkdirSync(backupDir, { recursive: true });
    const defaultBackup = path.join(backupDir, 'default.db');
    createProfileDb(defaultBackup, {
      theme: 'old-default',
      restored_setting: 'from-backup'
    });

    new ConfigRepair(harness.configPathManager, harness.profileManager, harness.logger).runStartupRepair();

    const db = new SQLite(defaultPath, { readonly: true });
    const settings = Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(row => [row.key, row.value]));
    db.close();

    expect(settings.theme).toBe('old-default');
    expect(settings.restored_setting).toBe('from-backup');
    expect(fs.existsSync(path.join(harness.root, 'repair_reports', 'recovered-sources.json'))).toBe(true);
  });
});
