'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const AUTO_STOP_MS = 30 * 60 * 1000;
const TEST_CONFIG_MARK = 'ltth-readtest-config';
const PROFILE_LABEL = 'readtest';

function pathFor(platform) {
  return platform === 'win32' ? path.win32 : path.posix;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function sanitizeProfileName(name) {
  return String(name).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function isInside(parentDir, childDir, platform) {
  const lib = pathFor(platform);
  const parent = lib.resolve(parentDir);
  const child = lib.resolve(childDir);
  const relative = lib.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${lib.sep}`) && !lib.isAbsolute(relative));
}

function assertTestConfig(configDir) {
  const resolved = path.resolve(configDir);
  const tempRoot = path.resolve(os.tmpdir());
  if (!isInside(tempRoot, resolved, process.platform)) {
    throw new Error('config directory is outside the temp folder');
  }
  if (!resolved.includes(TEST_CONFIG_MARK)) {
    throw new Error('config directory is not the read-test folder');
  }
  return resolved;
}

function assessConfig({ platform, tempRoot, configPathContents, configPathExists }) {
  const lib = pathFor(platform);
  const root = lib.resolve(tempRoot);
  if (!root.includes(TEST_CONFIG_MARK)) {
    return { ok: false, reason: 'temp folder is not the read-test folder' };
  }
  const configDir = lib.join(root, 'ltth.app');
  if (configPathExists) {
    const custom = lib.resolve(String(configPathContents || '').trim());
    if (!custom || !isInside(root, custom, platform)) {
      return { ok: false, reason: 'app config path points outside the read-test folder' };
    }
    return { ok: true, configDir: custom, localAppData: root, platform };
  }
  if (platform !== 'win32') {
    return {
      ok: true,
      configDir,
      localAppData: root,
      platform,
      runAllowed: false,
      reason: 'temp override for the run is LOCALAPPDATA on win32'
    };
  }
  return { ok: true, configDir, localAppData: root, platform, runAllowed: true };
}

function emptyStats() {
  return {
    viewers: 0,
    likes: 0,
    totalCoins: 0,
    followers: 0,
    shares: 0,
    gifts: 0
  };
}

function readState(configDir) {
  const resolved = assertTestConfig(configDir);
  const userConfigs = path.join(resolved, 'user_configs');
  const activePath = path.join(userConfigs, '.active_profile');
  const activeName = fs.existsSync(activePath)
    ? fs.readFileSync(activePath, 'utf8').trim()
    : '';
  const dbPath = activeName
    ? path.join(userConfigs, `${sanitizeProfileName(activeName)}.db`)
    : '';
  const state = {
    activeName,
    lastConnected: '',
    aliasCount: 0,
    settings: {},
    stats: emptyStats(),
    statsIdentity: ''
  };
  if (!dbPath || !fs.existsSync(dbPath)) {
    return state;
  }
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    db.pragma('query_only = ON');
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
    if (tables.has('settings')) {
      for (const row of db.prepare('SELECT key, value FROM settings ORDER BY key').all()) {
        state.settings[row.key] = row.value;
      }
      state.lastConnected = state.settings.last_connected_username || '';
    }
    if (tables.has('profile_username_aliases')) {
      state.aliasCount = db.prepare('SELECT COUNT(*) AS count FROM profile_username_aliases').get().count;
    }
    if (tables.has('stream_stats')) {
      const row = db.prepare('SELECT * FROM stream_stats WHERE id = 1').get();
      if (row) {
        state.stats = {
          viewers: row.viewers || 0,
          likes: row.likes || 0,
          totalCoins: row.total_coins || 0,
          followers: row.followers || 0,
          shares: row.shares || 0,
          gifts: row.gifts || 0
        };
        state.statsIdentity = `${row.username || ''}|${row.room_id || ''}`;
      }
    }
  } finally {
    db.close();
  }
  return state;
}

function toSnapshot(state) {
  const settings = Object.keys(state.settings).sort().map(key => `${key}=${state.settings[key]}`).join('\n');
  return {
    stats: state.stats,
    statsIdentityHash: sha256(state.statsIdentity),
    lastConnectedHash: sha256(state.lastConnected),
    aliasCount: state.aliasCount,
    activeProfileHash: sha256(state.activeName),
    settingsHash: sha256(settings)
  };
}

function snapshotFile(configDir) {
  return toSnapshot(readState(configDir));
}

function sameStats(left, right) {
  const keys = ['viewers', 'likes', 'totalCoins', 'followers', 'shares', 'gifts'];
  return keys.every(key => left.stats[key] === right.stats[key])
    && left.statsIdentityHash === right.statsIdentityHash;
}

function compareSnapshots(before, after) {
  return {
    stats: sameStats(before, after),
    last_connected_username: before.lastConnectedHash === after.lastConnectedHash,
    alias_count: before.aliasCount === after.aliasCount,
    active_profile: before.activeProfileHash === after.activeProfileHash,
    settings: before.settingsHash === after.settingsHash
  };
}

function formatVerdicts(verdicts) {
  return [
    `stats: ${verdicts.stats ? 'Ja' : 'Nein'}`,
    `last_connected_username: ${verdicts.last_connected_username ? 'Ja' : 'Nein'}`,
    `alias_count: ${verdicts.alias_count ? 'Ja' : 'Nein'}`,
    `active_profile: ${verdicts.active_profile ? 'Ja' : 'Nein'}`,
    `settings: ${verdicts.settings ? 'Ja' : 'Nein'}`
  ].join('\n');
}

function keyStatus(env) {
  const value = env && env.EULER_FALLBACK_API_KEY;
  if (typeof value !== 'string' || value.trim() === '') return 'missing';
  return 'present';
}

function redact(text, env) {
  const value = env && env.EULER_FALLBACK_API_KEY;
  const output = String(text);
  if (typeof value !== 'string' || value.length === 0) return output;
  return output.split(value).join('[redacted]');
}

function prepareTempProfile(configDir) {
  const resolved = assertTestConfig(configDir);
  const userConfigs = path.join(resolved, 'user_configs');
  fs.mkdirSync(userConfigs, { recursive: true });
  const dbPath = path.join(userConfigs, `${PROFILE_LABEL}.db`);
  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS profile_username_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        label TEXT,
        is_primary INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS stream_stats (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        viewers INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        total_coins INTEGER DEFAULT 0,
        followers INTEGER DEFAULT 0,
        shares INTEGER DEFAULT 0,
        gifts INTEGER DEFAULT 0,
        username TEXT,
        room_id TEXT
      );
    `);
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('tiktok_auto_reconnect', 'false');
    db.prepare(`
      INSERT OR REPLACE INTO stream_stats (
        id, viewers, likes, total_coins, followers, shares, gifts, username, room_id
      ) VALUES (1, 0, 0, 0, 0, 0, 0, NULL, NULL)
    `).run();
  } finally {
    db.close();
  }
  fs.writeFileSync(path.join(userConfigs, '.active_profile'), PROFILE_LABEL, 'utf8');
  return resolved;
}

function buildChildEnv(env, tempRoot) {
  return {
    ...env,
    SIDEKICK_LIVE: '1',
    LOCALAPPDATA: tempRoot,
    LTTH_DISABLE_AUTO_UPDATE: 'true'
  };
}

module.exports = {
  AUTO_STOP_MS,
  PROFILE_LABEL,
  TEST_CONFIG_MARK,
  assertTestConfig,
  assessConfig,
  buildChildEnv,
  compareSnapshots,
  formatVerdicts,
  keyStatus,
  prepareTempProfile,
  readState,
  redact,
  snapshotFile,
  toSnapshot
};
