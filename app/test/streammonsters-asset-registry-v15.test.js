'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const AssetRegistry = require(
  '../plugins/streamalchemy/backend/streammonsters/asset-registry'
);
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);
const CollectionService = require(
  '../plugins/streamalchemy/backend/streammonsters/collection-service'
);
const BattleMatchService = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
);
const KenneyMonsterBuilder = require(
  '../plugins/streamalchemy/backend/streammonsters/kenney-monster-builder'
);

const realPluginDir = path.join(process.cwd(), 'plugins', 'streamalchemy');
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function createPluginFixture(assets) {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-assets-'));
  const furryDir = path.join(pluginDir, 'assets', 'streammonsters', 'furry');
  fs.mkdirSync(furryDir, { recursive: true });
  fs.writeFileSync(path.join(furryDir, 'manifest.json'), JSON.stringify({
    schemaVersion: 2,
    assetVersion: 'furry-1.5.0',
    pack: 'furry',
    productionMode: 'bundled-only',
    assets
  }));
  return pluginDir;
}

function copyAsset(pluginDir, relativePath, sourcePath) {
  const absolutePath = path.join(pluginDir, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.copyFileSync(sourcePath, absolutePath);
  return absolutePath;
}

function packageAsset(templateId, stage, relativePath, buffer) {
  return {
    templateId,
    stage,
    element: 'Ember',
    species: 'Wolf',
    assetPath: relativePath,
    dimensions: [1024, 1024],
    sha256: sha256(buffer)
  };
}

function writeLegacyPngSource(tempDirs, filename, marker = 0) {
  const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-png-v15-'));
  tempDirs.push(sourceDir);
  const sourcePath = path.join(sourceDir, filename);
  const bytes = Buffer.alloc(25);
  PNG_SIGNATURE.copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(1024, 16);
  bytes.writeUInt32BE(1024, 20);
  bytes[24] = marker;
  fs.writeFileSync(sourcePath, bytes);
  return sourcePath;
}

function createMonster(store, {
  monsterId = 'monster-ashfang',
  imageUrl = '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png',
  visualSource = 'furry',
  visualKey = 'furry:ashfang'
} = {}) {
  const egg = store.createEgg({
    eggId: `egg-${monsterId}`,
    userId: 'viewer-a',
    giftId: 1,
    giftName: 'Team Heart',
    element: 'Ember',
    eggColor: '#ef6b45',
    seed: `seed-${monsterId}`,
    state: 'ready',
    createdAtMs: 1,
    hatchDurationMs: 1,
    readyAtMs: 1
  });
  return store.createMonsterFromEgg(egg, {
    monsterId,
    name: 'Ashfang',
    templateId: 'ashfang',
    personality: 'Brave',
    rarity: 'Standard',
    stats: { vitality: 7, might: 8, guard: 6, agility: 7 },
    imageUrl,
    visualSource,
    visualKey,
    createdAtMs: 2
  });
}

describe('Stream Monsters runtime asset registry', () => {
  const tempDirs = [];

  afterEach(() => {
    tempDirs.splice(0).forEach(tempDir => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });

  test('returns only a hash-verified 1024px package URL and invalidates its cache after corruption', () => {
    const sourcePath = writeLegacyPngSource(tempDirs, 'ashfang.png');
    const source = fs.readFileSync(sourcePath);
    const relativePath = 'assets/streammonsters/furry/ashfang.png';
    const pluginDir = createPluginFixture([{
      templateId: 'ashfang',
      stage: 1,
      element: 'Ember',
      species: 'Wolf',
      assetPath: relativePath,
      dimensions: [1024, 1024],
      sha256: sha256(source)
    }]);
    tempDirs.push(pluginDir);
    const copiedPath = copyAsset(pluginDir, relativePath, sourcePath);
    const registry = new AssetRegistry({ pluginDir });

    expect(registry.getValidatedUrl('ashfang', 1)).toBe(
      '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png'
    );
    expect(registry.getAsset('ashfang', 1)).toEqual(expect.objectContaining({
      assetVersion: 'furry-1.5.0'
    }));
    expect(registry.getValidatedUrl('ashfang', 0)).toBeNull();
    expect(registry.getValidatedUrl('ashfang', 4)).toBeNull();
    fs.appendFileSync(copiedPath, Buffer.from([0]));
    registry.invalidate();
    expect(registry.getValidatedUrl('ashfang', 1)).toBeNull();
  });

  test('audits an unchanged package once and rechecks files after explicit invalidation', () => {
    const registry = new AssetRegistry({ pluginDir: realPluginDir });
    const lstat = jest.spyOn(fs, 'lstatSync');
    try {
      expect(registry.getIntegrity()).toEqual(expect.objectContaining({
        expected: 72,
        available: 72,
        healthy: true
      }));
      const initialChecks = lstat.mock.calls.length;
      expect(initialChecks).toBeGreaterThan(72);

      for (let index = 0; index < 20; index += 1) {
        expect(registry.getValidatedUrl('ashfang', 1)).toMatch(/ashfang\.webp$/);
        expect(registry.getValidatedUrl('pulse', 3)).toMatch(/pulse-stage3\.webp$/);
        expect(registry.getIntegrity().healthy).toBe(true);
      }
      expect(lstat).toHaveBeenCalledTimes(initialChecks);

      registry.invalidate();
      expect(registry.getValidatedUrl('ashfang', 1)).toMatch(/ashfang\.webp$/);
      expect(lstat.mock.calls.length).toBeGreaterThan(initialChecks);
    } finally {
      lstat.mockRestore();
    }
  });

  test('rejects package paths outside the plugin and symbolic-link assets', () => {
    const sourcePath = writeLegacyPngSource(tempDirs, 'ashfang.png');
    const source = fs.readFileSync(sourcePath);
    const relativePath = 'assets/streammonsters/furry/linked.png';
    const linkedDirectoryPath =
      'assets/streammonsters/furry/linked-directory/ashfang.png';
    const pluginDir = createPluginFixture([
      {
        templateId: 'ashfang',
        stage: 1,
        element: 'Ember',
        species: 'Wolf',
        assetPath: '../outside.png',
        dimensions: [1024, 1024],
        sha256: sha256(source)
      },
      {
        templateId: 'ashfang',
        stage: 2,
        element: 'Ember',
        species: 'Wolf',
        assetPath: relativePath,
        dimensions: [1024, 1024],
        sha256: sha256(source)
      },
      {
        templateId: 'ashfang',
        stage: 3,
        element: 'Ember',
        species: 'Wolf',
        assetPath: linkedDirectoryPath,
        dimensions: [1024, 1024],
        sha256: sha256(source)
      }
    ]);
    tempDirs.push(pluginDir);
    const linkedPath = path.join(pluginDir, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(linkedPath), { recursive: true });
    fs.symlinkSync(sourcePath, linkedPath, 'file');
    const linkedDirectory = path.join(
      pluginDir,
      'assets',
      'streammonsters',
      'furry',
      'linked-directory'
    );
    fs.symlinkSync(
      path.dirname(sourcePath),
      linkedDirectory,
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    const registry = new AssetRegistry({ pluginDir });

    expect(registry.getValidatedUrl('ashfang', 1)).toBeNull();
    expect(registry.getValidatedUrl('ashfang', 2)).toBeNull();
    expect(registry.getValidatedUrl('ashfang', 3)).toBeNull();
  });

  test('uses the deterministic Kenney emergency visual when a base form is missing', () => {
    const pluginDir = createPluginFixture([]);
    tempDirs.push(pluginDir);
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-kenney-'));
    tempDirs.push(dataDir);
    const kenneyBuilder = new KenneyMonsterBuilder({
      assetDir: path.join(realPluginDir, 'assets', 'kenney-monster-builder'),
      dataDir
    });
    const registry = new AssetRegistry({ pluginDir, kenneyBuilder });

    expect(registry.resolveVisual({
      templateId: 'ashfang',
      stage: 1,
      seed: 'fallback-seed',
      element: 'Ember'
    })).toEqual(expect.objectContaining({
      imageUrl: expect.stringMatching(
        /^\/api\/streammonsters\/art\/kenney-[a-f0-9]{16}\.svg$/
      ),
      visualSource: 'kenney',
      visualKey: expect.stringMatching(/^kenney:[a-f0-9]{16}$/),
      fallback: true
    }));
  });

  test('uses Kenney for a corrupt evolution asset while preserving identity and applying evolution stats', () => {
    const basePath = writeLegacyPngSource(tempDirs, 'ashfang.png', 1);
    const stagePath = writeLegacyPngSource(tempDirs, 'ashfang-stage2.png', 2);
    const base = fs.readFileSync(basePath);
    const stage = fs.readFileSync(stagePath);
    const baseRelative = 'assets/streammonsters/furry/ashfang.png';
    const stageRelative =
      'assets/streammonsters/furry/evolution/ember/ashfang-stage2.png';
    const pluginDir = createPluginFixture([
      packageAsset('ashfang', 1, baseRelative, base),
      packageAsset('ashfang', 2, stageRelative, stage)
    ]);
    tempDirs.push(pluginDir);
    copyAsset(pluginDir, baseRelative, basePath);
    const corruptStagePath = copyAsset(pluginDir, stageRelative, stagePath);
    fs.appendFileSync(corruptStagePath, Buffer.from([0]));
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-kenney-'));
    tempDirs.push(dataDir);
    const kenneyBuilder = new KenneyMonsterBuilder({
      assetDir: path.join(realPluginDir, 'assets', 'kenney-monster-builder'),
      dataDir
    });
    const assetRegistry = new AssetRegistry({ pluginDir, kenneyBuilder });
    const sqlite = new Database(':memory:');
    const store = new StreamMonstersDatabase(sqlite, { assetRegistry });
    store.initialize();
    const original = createMonster(store);
    const collection = new CollectionService({ store, assetRegistry });
    store.setTemplateMastery('viewer-a', 'ashfang', 25, []);
    store.setElementEssence('viewer-a', 'Ember', 3, []);

    const result = collection.evolveMonster('viewer-a', 'monster-ashfang');
    const stageTwoStats = {
      vitality: 7,
      might: 10,
      guard: 6,
      agility: 8
    };
    expect(result).toEqual(expect.objectContaining({
      evolutionStage: 2,
      spentEssence: 3,
      statsBefore: original.stats,
      statsAfter: stageTwoStats,
      statChanges: { vitality: 0, might: 2, guard: 0, agility: 1 },
      monster: expect.objectContaining({
        monster_id: original.monster_id,
        user_id: original.user_id,
        name: original.name,
        level: original.level,
        stats: stageTwoStats,
        evolution_stage: 2,
        image_url: expect.stringMatching(
          /^\/api\/streammonsters\/art\/kenney-[a-f0-9]{16}\.svg$/
        ),
        visual_source: 'kenney',
        visual_key: expect.stringMatching(/^kenney:[a-f0-9]{16}$/),
        asset_version: 'kenney-cc0-v1'
      })
    }));
    expect(store.getElementEssence('viewer-a', 'Ember')).toEqual(
      expect.objectContaining({ amount: 0, spent: 3 })
    );

    store.setTemplateMastery('viewer-a', 'ashfang', 50, []);
    store.setElementEssence('viewer-a', 'Ember', 5, []);
    const stageThree = collection.evolveMonster('viewer-a', 'monster-ashfang');
    const stageThreeStats = {
      vitality: 7,
      might: 12,
      guard: 6,
      agility: 9
    };
    expect(stageThree).toEqual(expect.objectContaining({
      statsBefore: stageTwoStats,
      statsAfter: stageThreeStats,
      statChanges: { vitality: 0, might: 2, guard: 0, agility: 1 }
    }));
    expect(stageThree.monster).toEqual(expect.objectContaining({
      monster_id: original.monster_id,
      user_id: original.user_id,
      name: original.name,
      level: original.level,
      stats: stageThreeStats,
      evolution_stage: 3,
      visual_source: 'kenney',
      asset_version: 'kenney-cc0-v1'
    }));
    expect(stageThree.monster.image_url).not.toBe(result.monster.image_url);
    sqlite.close();
  });

  test('records the verified package asset version during canonical legacy migration', () => {
    const sourcePath = writeLegacyPngSource(tempDirs, 'ashfang.png');
    const source = fs.readFileSync(sourcePath);
    const relativePath = 'assets/streammonsters/furry/ashfang.png';
    const pluginDir = createPluginFixture([
      packageAsset('ashfang', 1, relativePath, source)
    ]);
    tempDirs.push(pluginDir);
    copyAsset(pluginDir, relativePath, sourcePath);
    const sqlite = new Database(':memory:');
    const bootstrap = new StreamMonstersDatabase(sqlite);
    bootstrap.initialize();
    createMonster(bootstrap, {
      imageUrl: '/legacy.png',
      visualSource: 'legacy',
      visualKey: 'legacy:ashfang'
    });
    const registry = new AssetRegistry({ pluginDir });
    const guardedStore = new StreamMonstersDatabase(sqlite, {
      assetRegistry: registry
    });

    guardedStore.initialize();

    expect(guardedStore.getMonster('monster-ashfang')).toEqual(
      expect.objectContaining({
        image_url:
          '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png',
        visual_source: 'furry',
        visual_key: 'furry:ashfang',
        asset_version: 'furry-1.5.0'
      })
    );
    sqlite.close();
  });

  test('does not canonicalize a legacy visual onto a corrupt package asset', () => {
    const sourcePath = writeLegacyPngSource(tempDirs, 'ashfang.png');
    const source = fs.readFileSync(sourcePath);
    const relativePath = 'assets/streammonsters/furry/ashfang.png';
    const pluginDir = createPluginFixture([
      packageAsset('ashfang', 1, relativePath, source)
    ]);
    tempDirs.push(pluginDir);
    const corruptPath = copyAsset(pluginDir, relativePath, sourcePath);
    fs.appendFileSync(corruptPath, Buffer.from([0]));
    const assetRegistry = new AssetRegistry({ pluginDir });
    const sqlite = new Database(':memory:');
    const bootstrap = new StreamMonstersDatabase(sqlite);
    bootstrap.initialize();
    createMonster(bootstrap, {
      imageUrl: '/legacy.png',
      visualSource: 'legacy',
      visualKey: 'legacy:ashfang'
    });
    const guardedStore = new StreamMonstersDatabase(sqlite, { assetRegistry });

    guardedStore.initialize();

    expect(guardedStore.getMonster('monster-ashfang')).toEqual(
      expect.objectContaining({
        image_url: '/legacy.png',
        visual_source: 'legacy',
        visual_key: 'legacy:ashfang',
        asset_version: null
      })
    );
    sqlite.close();
  });

  test('projects a stored Kenney emergency URL instead of an invalid canonical battle asset', () => {
    const pluginDir = createPluginFixture([]);
    tempDirs.push(pluginDir);
    const assetRegistry = new AssetRegistry({ pluginDir });
    const sqlite = new Database(':memory:');
    const store = new StreamMonstersDatabase(sqlite, { assetRegistry });
    store.initialize();
    const fallbackUrl =
      '/api/streammonsters/art/kenney-0123456789abcdef.svg';
    const monster = createMonster(store, {
      imageUrl: fallbackUrl,
      visualSource: 'kenney',
      visualKey: 'kenney:0123456789abcdef'
    });
    const service = new BattleMatchService({
      store,
      assetRegistry,
      autoStart: false
    });
    const roster = service.snapshotMonster(monster);
    const publicFighter = service.projectPublicFighters({
      participants: [{
        slot: 1,
        lockedMonsterId: monster.monster_id,
        roster,
        combatState: null
      }]
    })[0];

    expect(roster.image_url).toBe(fallbackUrl);
    expect(publicFighter.imageUrl).toBe(fallbackUrl);
    service.destroy();
    sqlite.close();
  });

  test('builds an immediate seeded Kenney fighter when the canonical battle asset is missing', () => {
    const pluginDir = createPluginFixture([]);
    tempDirs.push(pluginDir);
    const build = jest.fn(({ seed, element }) => ({
      publicUrl: `/api/streammonsters/art/kenney-${seed}-${element}.svg`,
      visualSource: 'kenney',
      visualKey: `kenney:${seed}:${element}`
    }));
    const assetRegistry = new AssetRegistry({
      pluginDir,
      kenneyBuilder: { build }
    });
    const sqlite = new Database(':memory:');
    const store = new StreamMonstersDatabase(sqlite, { assetRegistry });
    store.initialize();
    const monster = createMonster(store, {
      monsterId: 'monster-corrupt',
      imageUrl: '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png',
      visualSource: 'furry',
      visualKey: 'furry:ashfang'
    });
    const service = new BattleMatchService({
      store,
      assetRegistry,
      autoStart: false
    });

    const roster = service.snapshotMonster(monster);

    expect(roster.image_url).toBe(
      '/api/streammonsters/art/kenney-seed-monster-corrupt-Ember.svg'
    );
    expect(build).toHaveBeenCalledWith({
      seed: 'seed-monster-corrupt',
      element: 'Ember'
    });
    service.destroy();
    sqlite.close();
  });

  test('canonical migration performs one asset audit regardless of monster count', () => {
    const sourcePath = writeLegacyPngSource(tempDirs, 'ashfang.png');
    const source = fs.readFileSync(sourcePath);
    const relativePath = 'assets/streammonsters/furry/ashfang.png';
    const pluginDir = createPluginFixture([
      packageAsset('ashfang', 1, relativePath, source)
    ]);
    tempDirs.push(pluginDir);
    copyAsset(pluginDir, relativePath, sourcePath);
    const sqlite = new Database(':memory:');
    const bootstrap = new StreamMonstersDatabase(sqlite);
    bootstrap.initialize();
    for (let index = 0; index < 40; index += 1) {
      createMonster(bootstrap, {
        monsterId: `monster-${index}`,
        imageUrl: '/legacy.png',
        visualSource: 'legacy',
        visualKey: `legacy:${index}`
      });
    }
    const assetRegistry = new AssetRegistry({ pluginDir });
    const guardedStore = new StreamMonstersDatabase(sqlite, { assetRegistry });
    const lstat = jest.spyOn(fs, 'lstatSync');
    try {
      guardedStore.initialize();
      expect(lstat.mock.calls.length).toBeLessThan(40);
      expect(guardedStore.getMonster('monster-39')).toEqual(
        expect.objectContaining({
          image_url:
            '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.png',
          visual_source: 'furry',
          asset_version: 'furry-1.5.0'
        })
      );
    } finally {
      lstat.mockRestore();
      sqlite.close();
    }
  });
});
