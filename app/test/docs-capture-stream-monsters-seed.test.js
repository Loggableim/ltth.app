'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createRequire } = require('module');
const {
  DEMO_GIFT,
  STREAM_MONSTERS_DOCS_CONFIG,
  seedStreamMonstersDocsCaptureProfile
} = require('../../scripts/lib/docs-capture-stream-monsters-seed');

const repoRoot = path.resolve(__dirname, '../..');
const requireAppDependency = createRequire(path.join(repoRoot, 'app', 'package.json'));
const Database = requireAppDependency('better-sqlite3');

describe('Stream Monsters documentation capture seed', () => {
  let profileDir;

  beforeEach(() => {
    profileDir = null;
    profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-stream-monsters-seed-'));
    const fixtureDir = path.join(profileDir, 'docs-capture-app', 'plugins', 'stream-monsters');
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.writeFileSync(path.join(fixtureDir, 'plugin.json'), JSON.stringify({
      id: 'stream-monsters',
      enabled: true
    }));
  });

  afterEach(() => {
    if (profileDir) fs.rmSync(profileDir, { recursive: true, force: true });
    profileDir = null;
  });

  test('writes only synthetic creator config and one gift mapping in the fresh temp profile', () => {
    const receipt = seedStreamMonstersDocsCaptureProfile(repoRoot, profileDir, ['stream-monsters']);
    const dbPath = path.join(profileDir, receipt.database);
    const db = new Database(dbPath, { readonly: true });
    try {
      expect(db.prepare('SELECT value FROM settings WHERE key = ?')
        .get('plugin:stream-monsters:config').value).toBe(JSON.stringify(STREAM_MONSTERS_DOCS_CONFIG));
      expect(db.prepare('SELECT id, name, diamond_count FROM gift_catalog').all()).toEqual([{
        id: DEMO_GIFT.id,
        name: DEMO_GIFT.name,
        diamond_count: DEMO_GIFT.diamondCount
      }]);
      expect(db.prepare('SELECT gift_id, gift_name, effect, enabled FROM streammonsters_gift_mappings').all()).toEqual([{
        gift_id: DEMO_GIFT.id,
        gift_name: DEMO_GIFT.name,
        effect: 'spawn',
        enabled: 1
      }]);
    } finally {
      db.close();
    }

    const receiptBytes = fs.readFileSync(path.join(profileDir, receipt.receiptFile));
    expect(crypto.createHash('sha256').update(receiptBytes).digest('hex')).toBe(receipt.receiptSha256);
    expect(receipt.synthetic).toBe(true);
    expect(receipt.writes.map(({ table, rows }) => [table, rows])).toEqual([
      ['settings', 1],
      ['gift_catalog', 1],
      ['streammonsters_gift_mappings', 1]
    ]);
    expect(fs.readFileSync(path.join(profileDir, 'ltth.app', 'user_configs', '.active_profile'), 'utf8')).toBe('default');
  });

  test('rejects a different allowlist, non-temp path, or existing profile config', () => {
    expect(() => seedStreamMonstersDocsCaptureProfile(repoRoot, profileDir, ['stream-monsters', 'sidekick']))
      .toThrow(/exact \[stream-monsters\] allowlist/);
    expect(() => seedStreamMonstersDocsCaptureProfile(repoRoot, path.join(repoRoot, 'capture-profile'), ['stream-monsters']))
      .toThrow(/isolated temporary profile/);

    const configDir = path.join(profileDir, 'ltth.app', 'user_configs');
    fs.mkdirSync(configDir, { recursive: true });
    expect(() => seedStreamMonstersDocsCaptureProfile(repoRoot, profileDir, ['stream-monsters']))
      .toThrow(/already contains seed data/);
  });

  test('runner seeds only after the exact Stream Monsters fixture is prepared and before app spawn', () => {
    const runner = fs.readFileSync(
      path.join(repoRoot, 'scripts', 'capture-product-screenshots.js'),
      'utf8'
    );
    const fixtureIndex = runner.indexOf('prepareDocsPluginFixture(REPO_ROOT, profileDir, docsCaptureAllowedPluginIds)');
    const seedIndex = runner.indexOf('seedStreamMonstersDocsCaptureProfile(REPO_ROOT, profileDir, docsCaptureAllowedPluginIds)');
    const spawnIndex = runner.indexOf("spawn(captureNode.executablePath, [path.join(REPO_ROOT, 'app', 'server.js')]");

    expect(fixtureIndex).toBeGreaterThan(-1);
    expect(seedIndex).toBeGreaterThan(fixtureIndex);
    expect(spawnIndex).toBeGreaterThan(seedIndex);
    expect(runner).toContain("page.__docsCaptureSeedReceipt = app.docsCaptureSeedReceipt || null");
    expect(runner).toContain("type: 'isolated-temp-profile-seed'");
  });
});
