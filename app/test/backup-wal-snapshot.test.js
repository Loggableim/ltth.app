'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const zip = require('zip-lib');
const { pipeline } = require('stream/promises');
const { exportBackup } = require('../modules/backup/exporter');
const { snapshotProfileDatabases } = require('../modules/backup/sqlite-snapshots');

const options = {
  includeGlobalSettings: false,
  includePluginSettings: false,
  includePluginData: false,
  includeUserConfigs: true,
  includeUploads: false,
  includeUserData: false
};
let root;
let dbs;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-wal-test-'));
  dbs = [];
});
afterEach(() => {
  for (const db of dbs) {
    if (db.open) db.close();
  }
  fs.rmSync(root, { recursive: true, force: true });
});
function stagingDirectories() {
  return fs.readdirSync(os.tmpdir())
    .filter(name => name.startsWith('ltth-backup-sqlite-')).sort();
}
async function settleCleanup() {
  await new Promise(resolve => setTimeout(resolve, 50));
}
function create(name) {
  const db = new Database(path.join(root, name));
  dbs.push(db);
  db.pragma('journal_mode=WAL');
  db.pragma('wal_autocheckpoint=0');
  db.exec('CREATE TABLE saved(id INTEGER); INSERT INTO saved VALUES(1)');
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.exec('INSERT INTO saved VALUES(2)');
  return db;
}
function exportProfiles() {
  return exportBackup({ configPathManager: { getUserConfigsDir: () => root } }, options);
}

test('all profiles survive checkpoint between ZIP entries, sidecars excluded', async () => {
  const before = stagingDirectories();
  const a = create('a.db');
  const b = create('b.db');
  const result = await exportProfiles();
  let interleaved = false;
  result.stream.on('entry', entry => {
    if (entry.name === 'user_configs/a.db') {
      interleaved = true;
      a.pragma('wal_checkpoint(TRUNCATE)');
      b.pragma('wal_checkpoint(TRUNCATE)');
      b.exec('INSERT INTO saved VALUES(3)');
    }
  });
  const archive = path.join(os.tmpdir(), `ltth-${Date.now()}.zip`);
  try {
    await pipeline(result.stream, fs.createWriteStream(archive));
    const dest = path.join(root, 'restore');
    await zip.extract(archive, dest);
    expect(interleaved).toBe(true);
    expect(fs.readdirSync(path.join(dest, 'user_configs')).sort()).toEqual(['a.db', 'b.db']);
    for (const name of ['a.db', 'b.db']) {
      const db = new Database(path.join(dest, 'user_configs', name));
      try {
        expect(db.prepare('SELECT id FROM saved').all()).toEqual([{ id: 1 }, { id: 2 }]);
        expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
      } finally {
        db.close();
      }
    }
    await settleCleanup();
  expect(stagingDirectories()).toEqual(before);
  } finally {
    fs.rmSync(archive, { force: true });
  }
});

test('snapshot remains until caller releases it and cleanup is idempotent', async () => {
  create('a.db');
  const result = await snapshotProfileDatabases([{ absPath: path.join(root, 'a.db'), relPath: 'a.db' }]);
  const snapshot = result.files[0].absPath;
  expect(fs.existsSync(snapshot)).toBe(true);
  result.cleanup();
  expect(fs.existsSync(snapshot)).toBe(false);
  result.cleanup();
});

test('corrupt second database rejects entire export and removes snapshot staging', async () => {
  create('a.db');
  fs.writeFileSync(path.join(root, 'b.db'), 'not sqlite');
  const before = stagingDirectories();
  // Native SQLite errors can originate in another Jest realm. Assert the
  // rejected promise's SQLite error code instead of Error instanceof.
  await expect(exportProfiles()).rejects.toMatchObject({ code: 'SQLITE_NOTADB' });
  await settleCleanup();
  expect(stagingDirectories()).toEqual(before);
});

test('abandoned archive closes and releases snapshot staging', async () => {
  create('a.db');
  const before = stagingDirectories();
  const result = await exportProfiles();
  await new Promise(resolve => {
    result.stream.once('close', resolve);
    result.stream.destroy();
  });
  await settleCleanup();
  expect(stagingDirectories()).toEqual(before);
});

test('early archive failure reaches consumer and releases staging on close', async () => {
  create('a.db');
  const before = stagingDirectories();
  const result = await exportProfiles();
  const failure = new Error('synthetic early archive error');
  await new Promise(resolve => {
    result.stream.once('error', error => expect(error).toBe(failure));
    result.stream.once('close', resolve);
    result.stream.destroy(failure);
  });
  await settleCleanup();
  expect(stagingDirectories()).toEqual(before);
});
