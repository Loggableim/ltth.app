'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const {
  SIDEKICK_DOCS_CAPTURE_CONFIG,
  seedSidekickDocsCaptureProfile
} = require('../../scripts/lib/docs-capture-sidekick-seed');

const repoRoot = path.resolve(__dirname, '../..');

describe('Sidekick documentation capture profile seed', () => {
  let profileDir;
  let fixtureManifest;

  beforeEach(() => {
    profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-sidekick-seed-'));
    const fixtureDir = path.join(profileDir, 'docs-capture-app', 'plugins', 'sidekick');
    fs.mkdirSync(fixtureDir, { recursive: true });
    fixtureManifest = path.join(fixtureDir, 'plugin.json');
    fs.writeFileSync(fixtureManifest, JSON.stringify({ id: 'sidekick', enabled: true }));
  });

  afterEach(() => fs.rmSync(profileDir, { recursive: true, force: true }));

  test('seeds only the exact Sidekick safety config in the isolated default profile database', () => {
    const result = seedSidekickDocsCaptureProfile(repoRoot, profileDir, ['sidekick']);
    const dbPath = path.join(profileDir, 'ltth.app', 'user_configs', 'default.db');
    const db = new Database(dbPath, { readonly: true });
    try {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(result.configKey);
      expect(result).toEqual({ profileName: 'default', configKey: 'plugin:sidekick:config' });
      expect(JSON.parse(row.value)).toEqual(SIDEKICK_DOCS_CAPTURE_CONFIG);
      expect(db.prepare('SELECT value FROM settings WHERE key = ?').get('plugin:weather-control:config'))
        .toBeUndefined();
      expect(fs.readFileSync(path.join(profileDir, 'ltth.app', 'user_configs', '.active_profile'), 'utf8'))
        .toBe('default');
    } finally {
      db.close();
    }
  });

  test.each([
    { allowedIds: [] },
    { allowedIds: ['sidekick', 'weather-control'] },
    { allowedIds: 'Sidekick' }
  ])('rejects a non-exact Sidekick allowlist: $allowedIds', ({ allowedIds }) => {
    expect(() => seedSidekickDocsCaptureProfile(repoRoot, profileDir, allowedIds)).toThrow();
  });

  test('rejects a non-canonical or disabled fixture manifest', () => {
    fs.writeFileSync(fixtureManifest, JSON.stringify({ id: 'sidekick', enabled: false }));
    expect(() => seedSidekickDocsCaptureProfile(repoRoot, profileDir, ['sidekick']))
      .toThrow(/canonical and enabled/);
    expect(fs.existsSync(path.join(profileDir, 'ltth.app', 'user_configs', 'default.db'))).toBe(false);
  });

  test('rejects reuse of a profile with an existing database', () => {
    const configDir = path.join(profileDir, 'ltth.app', 'user_configs');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'default.db'), 'existing');
    expect(() => seedSidekickDocsCaptureProfile(repoRoot, profileDir, ['sidekick']))
      .toThrow(/config directory already exists/);
    expect(fs.readFileSync(path.join(configDir, 'default.db'), 'utf8')).toBe('existing');
  });

  test('capture runner seeds Sidekick only after preparing its fixture and before server spawn', () => {
    const runner = fs.readFileSync(
      path.join(__dirname, '../../scripts/capture-product-screenshots.js'),
      'utf8'
    );
    const fixtureIndex = runner.indexOf('prepareDocsPluginFixture(REPO_ROOT, profileDir, docsCaptureAllowedPluginIds)');
    const seedIndex = runner.indexOf('seedSidekickDocsCaptureProfile(REPO_ROOT, profileDir, docsCaptureAllowedPluginIds)');
    const spawnIndex = runner.indexOf('spawn(captureNode.executablePath, [path.join(REPO_ROOT, \'app\', \'server.js\')]');

    expect(runner).toContain("docsCaptureAllowedPluginIds.includes('sidekick')");
    expect(fixtureIndex).toBeGreaterThanOrEqual(0);
    expect(seedIndex).toBeGreaterThan(fixtureIndex);
    expect(spawnIndex).toBeGreaterThan(seedIndex);
  });
});
