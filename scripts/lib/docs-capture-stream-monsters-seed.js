'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');
const { parseDocsCapturePluginIds } = require('./docs-capture-plugin-fixture');

const STREAM_MONSTERS_DOCS_CONFIG = Object.freeze({
  streamMonsters: Object.freeze({
    creatorName: 'Documentation Preview',
    giftMappingCustomized: true
  })
});

const DEMO_GIFT = Object.freeze({
  id: 900001,
  name: 'Documentation Heart',
  diamondCount: 1
});

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relativePath !== ''
    && relativePath !== '..'
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath);
}

function seedStreamMonstersDocsCaptureProfile(repoRoot, profileDir, allowedPluginIds) {
  const resolvedRepoRoot = path.resolve(repoRoot || '');
  if (!fs.existsSync(path.join(resolvedRepoRoot, 'app', 'package.json'))) {
    throw new Error('Stream Monsters documentation capture seed requires the LTTH app root');
  }

  const allowedIds = parseDocsCapturePluginIds(allowedPluginIds);
  if (allowedIds.length !== 1 || allowedIds[0] !== 'stream-monsters') {
    throw new Error('Stream Monsters documentation capture seed requires the exact [stream-monsters] allowlist');
  }

  const profileRoot = path.resolve(profileDir || '');
  if (!profileDir || !isPathInside(os.tmpdir(), profileRoot)) {
    throw new Error('Stream Monsters documentation capture seed requires an isolated temporary profile');
  }

  const fixtureManifest = path.join(profileRoot, 'docs-capture-app', 'plugins', 'stream-monsters', 'plugin.json');
  if (!fs.existsSync(fixtureManifest)) {
    throw new Error('Stream Monsters documentation capture fixture must exist before profile seeding');
  }
  const manifest = JSON.parse(fs.readFileSync(fixtureManifest, 'utf8'));
  if (manifest.id !== 'stream-monsters' || manifest.enabled !== true) {
    throw new Error('Stream Monsters documentation capture fixture must be canonical and enabled');
  }

  const profileName = 'default';
  const configDir = path.join(profileRoot, 'ltth.app', 'user_configs');
  const dbPath = path.join(configDir, `${profileName}.db`);
  const activeProfilePath = path.join(configDir, '.active_profile');
  const seedReceiptPath = path.join(profileRoot, 'docs-capture-seed-receipt.json');
  if (fs.existsSync(configDir) || fs.existsSync(dbPath) || fs.existsSync(seedReceiptPath)) {
    throw new Error('Stream Monsters documentation capture profile already contains seed data');
  }

  const requireAppDependency = createRequire(path.join(resolvedRepoRoot, 'app', 'package.json'));
  const Database = requireAppDependency('better-sqlite3');
  fs.mkdirSync(configDir, { recursive: true });
  const db = new Database(dbPath);
  try {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE gift_catalog (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          image_url TEXT,
          diamond_count INTEGER DEFAULT 0,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
          names_by_locale TEXT
        );
        CREATE TABLE streammonsters_gift_mappings (
          gift_id INTEGER PRIMARY KEY,
          gift_name TEXT NOT NULL,
          coin_value INTEGER NOT NULL DEFAULT 0,
          element TEXT,
          egg_color TEXT,
          effect TEXT NOT NULL DEFAULT 'spawn',
          enabled INTEGER NOT NULL DEFAULT 1,
          image_url TEXT,
          updated_at_ms INTEGER NOT NULL
        );
      `);
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)')
        .run('plugin:stream-monsters:config', JSON.stringify(STREAM_MONSTERS_DOCS_CONFIG));
      db.prepare(`
        INSERT INTO gift_catalog (id, name, image_url, diamond_count, last_updated, names_by_locale)
        VALUES (?, ?, NULL, ?, CURRENT_TIMESTAMP, NULL)
      `).run(DEMO_GIFT.id, DEMO_GIFT.name, DEMO_GIFT.diamondCount);
      db.prepare(`
        INSERT INTO streammonsters_gift_mappings (
          gift_id, gift_name, coin_value, element, egg_color, effect, enabled, image_url, updated_at_ms
        ) VALUES (?, ?, ?, 'Random', 'rose', 'spawn', 1, NULL, 1)
      `).run(DEMO_GIFT.id, DEMO_GIFT.name, DEMO_GIFT.diamondCount);
    })();
  } finally {
    db.close();
  }

  fs.writeFileSync(activeProfilePath, profileName, 'utf8');
  const seedReceipt = {
    schemaVersion: 1,
    kind: 'isolated-docs-capture-seed',
    plugin: 'stream-monsters',
    profile: profileName,
    database: 'ltth.app/user_configs/default.db',
    synthetic: true,
    writes: [
      { table: 'settings', key: 'plugin:stream-monsters:config', rows: 1 },
      { table: 'gift_catalog', id: DEMO_GIFT.id, label: DEMO_GIFT.name, rows: 1 },
      { table: 'streammonsters_gift_mappings', giftId: DEMO_GIFT.id, rows: 1 }
    ]
  };
  const receiptBytes = Buffer.from(`${JSON.stringify(seedReceipt, null, 2)}\n`, 'utf8');
  fs.writeFileSync(seedReceiptPath, receiptBytes);

  return Object.freeze({
    ...seedReceipt,
    receiptFile: 'docs-capture-seed-receipt.json',
    receiptSha256: crypto.createHash('sha256').update(receiptBytes).digest('hex')
  });
}

module.exports = {
  DEMO_GIFT,
  STREAM_MONSTERS_DOCS_CONFIG,
  seedStreamMonstersDocsCaptureProfile
};
