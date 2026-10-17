const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const nodeExecutable = process.execPath;
const syncScript = path.join(repoRoot, 'scripts', 'sync-streammonsters-product.js');
const releasePolicyPath = 'app/config/plugin-release-policy.json';
const projectedFiles = [
  'app/plugins/stream-monsters/product-contract.json',
  releasePolicyPath,
  'app/plugins/stream-monsters/plugin.json',
  'plugin-store.json',
  'scripts/plugin-guides/stream-monsters.js',
  'streammonsters/index.html',
  'js/streammonsters-guide.js',
  'app/CHANGELOG.md'
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function runSync(root, ...args) {
  return childProcess.spawnSync(
    nodeExecutable,
    [syncScript, '--root', root, ...args],
    { cwd: repoRoot, encoding: 'utf8' }
  );
}

function expectSyncStatus(result, expectedStatus) {
  try {
    expect(result.status).toBe(expectedStatus);
  } catch (assertionError) {
    const diagnostics = {
      errorCode: result.error?.code || null,
      errorMessage: result.error?.message?.slice(0, 1000) || null,
      signal: result.signal,
      status: result.status,
      stdout: result.stdout?.slice(0, 1000) || '',
      stderr: result.stderr?.slice(0, 1000) || ''
    };
    assertionError.message += `\nspawnSync diagnostics: ${JSON.stringify(diagnostics)}`;
    throw assertionError;
  }
}

function createProjectionFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-product-'));
  for (const relativePath of projectedFiles) {
    const source = path.join(repoRoot, relativePath);
    const destination = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  return root;
}

describe('Stream Monsters product contract', () => {
  test('release policy keeps closed-beta Stream Monsters out of the Store projection', () => {
    const { shouldProjectStore } = require('../../scripts/sync-streammonsters-product');
    const contract = readJson('app/plugins/stream-monsters/product-contract.json');

    expect(shouldProjectStore(repoRoot, contract)).toBe(false);
  });

  test('owns the stable identity, release, access and new-install defaults', () => {
    const contract = readJson('app/plugins/stream-monsters/product-contract.json');

    expect(contract.contractVersion).toBe(1);
    expect(contract.product).toEqual(expect.objectContaining({
      id: 'stream-monsters',
      name: 'Stream Monsters',
      currentVersion: '1.12.0',
      nextVersion: '1.13.0',
      packageFilename: 'stream-monsters-1.12.0.zip'
    }));
    expect(contract.rules).toEqual({
      version: 8,
      arenaLabel: 'Arcade Clash'
    });
    expect(contract.access).toEqual(expect.objectContaining({
      type: 'subscriber',
      badge: 'subscriber-only',
      pricing: { type: 'free', amount: 0, currency: 'EUR' }
    }));
    expect(contract.defaults).toEqual(expect.objectContaining({
      hatchDurationMs: 60_000,
      portraitBattleMode: 'takeover-74',
      portraitArenaVariant: 'split-arena',
      portraitProfile: 'tiktok-live-studio-1080x1920'
    }));
    expect(contract.locales).toEqual(['de', 'en', 'es', 'fr']);

    for (const locale of contract.locales) {
      expect(contract.copy.subscription[locale]).toEqual(expect.any(String));
      expect(contract.copy.subscription[locale].length).toBeGreaterThan(20);
    }
    expect(contract.copy.subscription.en).toContain(
      'Included with an active LTTH subscription'
    );
    expect(JSON.stringify(contract)).not.toMatch(/Ã|Â|â€|�/);
  });

  test('uses contract defaults for fresh runtime configuration', () => {
    const contractPath = require.resolve(
      '../plugins/stream-monsters/product-contract.json'
    );
    const pluginPath = require.resolve('../plugins/stream-monsters');
    const contract = require(contractPath);
    const original = { ...contract.defaults };
    try {
      contract.defaults.hatchDurationMs = 91_234;
      contract.defaults.portraitBattleMode = 'contract-test-mode';
      contract.defaults.portraitArenaVariant = 'contract-test-variant';
      delete require.cache[pluginPath];
      const StreamAlchemyPlugin = require(pluginPath);
      const plugin = new StreamAlchemyPlugin({ pluginDir: path.dirname(pluginPath) });
      const fresh = plugin.loadConfig({}).streamMonsters;

      expect(fresh.hatchDurationMs).toBe(91_234);
      expect(fresh.portraitBattleMode).toBe('contract-test-mode');
      expect(fresh.portraitArenaVariant).toBe('contract-test-variant');
      expect(fresh.rulesVersion).toBe(8);
    } finally {
      Object.assign(contract.defaults, original);
      delete require.cache[pluginPath];
      delete require.cache[contractPath];
    }
  });

  test('keeps every checked product projection synchronized', () => {
    const result = runSync(repoRoot, '--check');

    expectSyncStatus(result, 0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Stream Monsters product projections are synchronized');
  });

  test.each([
    ['plugin manifest', 'app/plugins/stream-monsters/plugin.json', (value) => {
      const parsed = JSON.parse(value);
      parsed.version = '0.0.0';
      return `${JSON.stringify(parsed, null, 2)}\n`;
    }],
    ['guide metadata', 'scripts/plugin-guides/stream-monsters.js', value => (
      value.replace('Arcade Clash', 'Drifted Arena')
    )],
    ['public presentation', 'streammonsters/index.html', value => (
      value.replace('data-streammonsters-rules-version="8"', 'data-streammonsters-rules-version="7"')
    )],
    ['current release notes', 'app/CHANGELOG.md', value => (
      value.replace('Arcade Clash', 'Drifted Arena')
    )]
  ])('reports %s drift in --check mode', (_label, relativePath, mutate) => {
    const fixtureRoot = createProjectionFixture();
    try {
      const target = path.join(fixtureRoot, relativePath);
      fs.writeFileSync(target, mutate(fs.readFileSync(target, 'utf8')), 'utf8');

      const result = runSync(fixtureRoot, '--check');

      expectSyncStatus(result, 1);
      expect(`${result.stdout}${result.stderr}`).toContain(relativePath);
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test('write mode is deterministic and repairs every projection', () => {
    const fixtureRoot = createProjectionFixture();
    try {
      const manifestPath = path.join(
        fixtureRoot,
        'app/plugins/stream-monsters/plugin.json'
      );
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.version = '0.0.0';
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      expectSyncStatus(runSync(fixtureRoot), 0);
      const first = projectedFiles.map(relativePath => (
        fs.readFileSync(path.join(fixtureRoot, relativePath))
      ));
      expectSyncStatus(runSync(fixtureRoot), 0);
      const second = projectedFiles.map(relativePath => (
        fs.readFileSync(path.join(fixtureRoot, relativePath))
      ));

      expect(second).toEqual(first);
      expectSyncStatus(runSync(fixtureRoot, '--check'), 0);
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test('does not project closed-beta Stream Monsters back into the public store', () => {
    const { buildProjections, shouldProjectStore } = require('../../scripts/sync-streammonsters-product');
    const fixtureRoot = createProjectionFixture();
    try {
      const storePath = path.join(fixtureRoot, 'plugin-store.json');
      const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      const originalIds = store.plugins.map(plugin => plugin.id);
      store.plugins = store.plugins.filter(plugin => plugin.id !== 'stream-monsters');
      fs.writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`);

      const before = fs.readFileSync(storePath, 'utf8');
      const contract = JSON.parse(fs.readFileSync(
        path.join(fixtureRoot, 'app/plugins/stream-monsters/product-contract.json'),
        'utf8'
      ));
      const projection = buildProjections(fixtureRoot, contract)
        .find(entry => entry.relativePath === 'plugin-store.json');

      expect(shouldProjectStore(fixtureRoot, contract)).toBe(false);
      expect(projection.content).toBe(before);
      expect(JSON.parse(before).plugins.map(plugin => plugin.id))
        .toEqual(originalIds.filter(id => id !== 'stream-monsters'));
    } finally {
      fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
