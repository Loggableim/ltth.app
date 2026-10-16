'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const prep = require('../scripts/live-read-prep');

const SECRET = 'dry-run-secret-value-not-a-real-key';
const ACCOUNT = 'fixture_account_token';

function tempConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-readtest-config-'));
  return path.join(root, 'ltth.app');
}

function writeProfile(configDir, mutate) {
  prep.prepareTempProfile(configDir);
  const dbPath = path.join(configDir, 'user_configs', 'readtest.db');
  const db = new Database(dbPath);
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('last_connected_username', ACCOUNT);
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('theme', 'dark');
  db.prepare(`
    UPDATE stream_stats
    SET viewers = 4, likes = 8, username = ?, room_id = ?
    WHERE id = 1
  `).run(ACCOUNT, 'room-1');
  db.prepare('INSERT OR REPLACE INTO profile_username_aliases (username, is_primary) VALUES (?, 1)').run(ACCOUNT);
  if (mutate) mutate(db, configDir);
  db.close();
}

function fingerprint(configDir) {
  const dbPath = path.join(configDir, 'user_configs', 'readtest.db');
  const activePath = path.join(configDir, 'user_configs', '.active_profile');
  const dbStat = fs.statSync(dbPath);
  const activeStat = fs.statSync(activePath);
  return {
    dbSize: dbStat.size,
    dbMtime: dbStat.mtimeMs,
    active: fs.readFileSync(activePath, 'utf8'),
    activeMtime: activeStat.mtimeMs
  };
}

describe('live-read prep scripts', () => {
  test('an unchanged fixture is Ja on every value and the read does not write', () => {
    const configDir = tempConfig();
    writeProfile(configDir);
    const beforePrint = fingerprint(configDir);
    const before = prep.snapshotFile(configDir);
    const afterPrint = fingerprint(configDir);
    expect(afterPrint).toEqual(beforePrint);
    const verdicts = prep.compareSnapshots(before, prep.snapshotFile(configDir));
    expect(prep.formatVerdicts(verdicts)).toBe([
      'stats: Ja',
      'last_connected_username: Ja',
      'alias_count: Ja',
      'active_profile: Ja',
      'settings: Ja'
    ].join('\n'));
    expect(JSON.stringify(before)).not.toContain(ACCOUNT);
    expect(JSON.stringify(before)).not.toContain(SECRET);
  });

  test.each([
    ['stats', (db) => db.prepare('UPDATE stream_stats SET viewers = 5 WHERE id = 1').run(), 'stats'],
    ['identity', (db) => db.prepare('UPDATE stream_stats SET room_id = ? WHERE id = 1').run('room-2'), 'stats'],
    ['setting name', (db) => db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('other', 'last_connected_username'), 'last_connected_username'],
    ['alias', (db) => db.prepare('INSERT INTO profile_username_aliases (username) VALUES (?)').run('second_alias'), 'alias_count'],
    ['profile', (_db, dir) => {
      const userConfigs = path.join(dir, 'user_configs');
      fs.copyFileSync(path.join(userConfigs, 'readtest.db'), path.join(userConfigs, 'other.db'));
      fs.writeFileSync(path.join(userConfigs, '.active_profile'), 'other', 'utf8');
    }, 'active_profile'],
    ['other setting', (db) => db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('light', 'theme'), 'settings']
  ])('a change in %s is Nein only for that value', (_label, mutate, field) => {
    const configDir = tempConfig();
    writeProfile(configDir);
    const before = prep.snapshotFile(configDir);
    writeProfile(configDir, mutate);
    const verdicts = prep.compareSnapshots(before, prep.snapshotFile(configDir));
    expect(verdicts[field]).toBe(false);
    if (field === 'last_connected_username') expect(verdicts.settings).toBe(false);
    else if (field !== 'settings') expect(verdicts.settings).toBe(true);
  });

  test('a missing profile file is left in place', () => {
    const configDir = tempConfig();
    const userConfigs = path.join(configDir, 'user_configs');
    fs.mkdirSync(userConfigs, { recursive: true });
    const activePath = path.join(userConfigs, '.active_profile');
    fs.writeFileSync(activePath, ACCOUNT, 'utf8');
    const state = prep.readState(configDir);
    expect(fs.readFileSync(activePath, 'utf8')).toBe(ACCOUNT);
    expect(state.aliasCount).toBe(0);
    expect(JSON.stringify(prep.toSnapshot(state))).not.toContain(ACCOUNT);
  });

  test('a config path outside the temp read-test folder is refused', () => {
    expect(prep.assessConfig({
      platform: 'win32',
      tempRoot: 'C:\\Temp\\ltth-readtest-config',
      configPathExists: true,
      configPathContents: 'C:\\AppData\\Local\\ltth.app'
    }).ok).toBe(false);
    expect(prep.assessConfig({
      platform: 'win32',
      tempRoot: 'C:\\Temp\\ltth-readtest-config',
      configPathExists: false
    })).toMatchObject({
      ok: true,
      runAllowed: true,
      localAppData: path.win32.resolve('C:\\Temp\\ltth-readtest-config')
    });
  });

  test('the child plan keeps the key in the object and does not apply the live switch here', () => {
    const previous = process.env.SIDEKICK_LIVE;
    delete process.env.SIDEKICK_LIVE;
    const child = prep.buildChildEnv({ EULER_FALLBACK_API_KEY: SECRET }, 'C:\\Temp\\ltth-readtest-config');
    expect(child.SIDEKICK_LIVE).toBe('1');
    expect(child.LOCALAPPDATA).toBe('C:\\Temp\\ltth-readtest-config');
    expect(process.env.SIDEKICK_LIVE).toBeUndefined();
    expect(prep.redact(`key ${SECRET} folder ltth-readtest-config`, child)).toBe('key [redacted] folder ltth-readtest-config');
    if (previous === undefined) delete process.env.SIDEKICK_LIVE;
    else process.env.SIDEKICK_LIVE = previous;
  });

  test('dry-run does not spawn, does not set the live switch, and prints no secret', () => {
    const previous = process.env.SIDEKICK_LIVE;
    delete process.env.SIDEKICK_LIVE;
    const result = spawnSync(process.execPath, [
      path.join(__dirname, '../scripts/live-read-start.js'),
      '--dry-run'
    ], {
      env: { ...process.env, SIDEKICK_LIVE: '', EULER_FALLBACK_API_KEY: SECRET },
      encoding: 'utf8'
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('spawned: no');
    expect(result.stdout).toContain('sidekick_live: no');
    expect(result.stdout).toContain('auto_reconnect: off');
    expect(result.stdout).toContain('auto_stop_ms: 1800000');
    expect(result.stdout).toContain('key: present');
    expect(result.stdout).toContain('ltth-readtest-config');
    expect(result.stdout).toContain('stats: Ja');
    expect(result.stdout).not.toContain(SECRET);
    expect(result.stderr).not.toContain(SECRET);
    expect(result.stdout).not.toContain(ACCOUNT);
    expect(process.env.SIDEKICK_LIVE).toBeUndefined();
    if (previous === undefined) delete process.env.SIDEKICK_LIVE;
    else process.env.SIDEKICK_LIVE = previous;
  });

  test('run mode on this platform exits before a process starts', () => {
    const result = spawnSync(process.execPath, [
      path.join(__dirname, '../scripts/live-read-start.js'),
      '--run'
    ], {
      env: { ...process.env, SIDEKICK_LIVE: '', EULER_FALLBACK_API_KEY: SECRET },
      encoding: 'utf8'
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('dry-run');
    expect(result.stdout).not.toContain(SECRET);
    expect(result.stderr).not.toContain(SECRET);
    expect(result.stdout).not.toContain('spawned: yes');
  });
});
