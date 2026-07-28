const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const AssetSpriteLibrary = require('../plugins/talking-heads/engines/asset-sprite-library');
const CacheManager = require('../plugins/talking-heads/utils/cache-manager');

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLffwAAAABJRU5ErkJggg==',
  'base64'
);

async function writePng(root, relativePath, data = TRANSPARENT_PNG) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data);
}

describe('Talking Heads local asset library', () => {
  let assetRoot;
  let dataDir;
  let library;

  beforeEach(async () => {
    assetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'talking-heads-assets-'));
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'talking-heads-output-'));

    await Promise.all([
      writePng(assetRoot, 'boba/animals/Fox/Layers/Fox_Base.png'),
      writePng(assetRoot, 'boba/animals/Fox/Layers/Eyes_Default.png'),
      writePng(assetRoot, 'boba/animals/Fox/Layers/EyeBrows_Default.png'),
      writePng(assetRoot, 'boba/animals/Fox/Layers/Nose.png'),
      writePng(assetRoot, 'boba/animals/Fox/Layers/Mouth_Default.png'),
      writePng(assetRoot, 'boba/animals/Fox/Layers/Mouth_Happy.png'),
      writePng(assetRoot, 'boba/animals/Fox/Layers/Mouth_Scared.png'),
      writePng(assetRoot, 'kenney/PNG/Default/body_blueA.png'),
      writePng(assetRoot, 'kenney/PNG/Default/eye_human.png'),
      writePng(assetRoot, 'kenney/PNG/Default/eye_closed_happy.png'),
      writePng(assetRoot, 'kenney/PNG/Default/mouth_closed_happy.png'),
      writePng(assetRoot, 'kenney/PNG/Default/mouthA.png'),
      writePng(assetRoot, 'kenney/PNG/Default/mouthC.png'),
      writePng(assetRoot, 'rgs/Animated body parts/Heads/head1/idle_0.png'),
      writePng(assetRoot, 'rgs/Animated body parts/Hairs/hair1/idle_0.png'),
      writePng(assetRoot, 'rgs/Animated body parts/Eyes/eyes1/idle_0.png'),
      writePng(assetRoot, 'rgs/Animated body parts/Eyes/eyes1/idle_3.png'),
      writePng(assetRoot, 'rgs/Animated body parts/Mouths/mouth1/idle_0.png'),
      writePng(assetRoot, 'rgs/Animated body parts/Mouths/mouth2/idle_0.png'),
      writePng(assetRoot, 'rgs/Animated body parts/Mouths/mouth3/idle_0.png')
    ]);

    library = new AssetSpriteLibrary({ assetRoot, dataDir });
  });

  afterEach(async () => {
    await Promise.all([
      fs.rm(assetRoot, { recursive: true, force: true }),
      fs.rm(dataDir, { recursive: true, force: true })
    ]);
  });

  test('exposes Boba, Kenney and vector-character catalog entries', () => {
    const catalog = library.getCatalog();

    expect(catalog.packs.map((pack) => pack.id)).toEqual(['boba', 'kenney', 'rgs']);
    expect(catalog.packs.find((pack) => pack.id === 'boba').characters).toContain('Fox');
    expect(catalog.packs.find((pack) => pack.id === 'kenney').options.body).toContain('blueA');
    expect(catalog.packs.find((pack) => pack.id === 'rgs').options.head).toContain('head1');
  });

  test.each([
    ['boba', 'Fox', {}],
    ['kenney', 'blueA', { eye: 'human' }],
    ['rgs', 'head1', { hair: 'hair1', eyes: 'eyes1', mouth: 'mouth1' }]
  ])('materializes five local TTS frames for %s', async (packId, characterId, options) => {
    const result = await library.getSpriteSet({ packId, characterId, options });

    expect(result.packId).toBe(packId);
    expect(Object.keys(result.sprites).sort()).toEqual([
      'blink',
      'idle_neutral',
      'speak_closed',
      'speak_mid',
      'speak_open'
    ]);

    for (const spriteUrl of Object.values(result.sprites)) {
      expect(spriteUrl).toMatch(/^\/api\/talkingheads\/sprite\/asset_[a-z0-9_-]+\.svg$/);
      const filename = spriteUrl.split('/').pop();
      const svg = await fs.readFile(path.join(dataDir, 'avatars', filename), 'utf8');
      expect(svg).toContain('<svg');
      expect(svg).toContain('data:image/png;base64,');
    }
  });

  test('uses a safe default for an unknown local selection', async () => {
    const result = await library.getSpriteSet({ packId: 'unknown', characterId: '../../Fox' });

    expect(result.packId).toBe('boba');
    expect(result.characterId).toBe('Fox');
  });

  test('composes a selected Boba expression with the real eyebrow, nose and mouth filenames', async () => {
    await Promise.all([
      writePng(assetRoot, 'boba/animals/Fox/Layers/Fox_Base.png', Buffer.from('fox-base')),
      writePng(assetRoot, 'boba/animals/Fox/Layers/Eyes_Happy.png', Buffer.from('happy-eyes')),
      writePng(assetRoot, 'boba/animals/Fox/Layers/EyeBrows_Happy.png', Buffer.from('happy-brows')),
      writePng(assetRoot, 'boba/animals/Fox/Layers/Nose.png', Buffer.from('fox-nose')),
      writePng(assetRoot, 'boba/animals/Fox/Layers/Mouth_Happy.png', Buffer.from('happy-mouth'))
    ]);

    const result = await library.getSpriteSet({
      packId: 'boba',
      characterId: 'Fox',
      options: { expression: 'Happy' }
    });
    const idleSvg = await fs.readFile(
      path.join(dataDir, 'avatars', result.sprites.idle_neutral.split('/').pop()),
      'utf8'
    );

    expect(result.options).toEqual({ expression: 'Happy' });
    for (const layer of ['fox-base', 'happy-eyes', 'happy-brows', 'fox-nose', 'happy-mouth']) {
      expect(idleSvg).toContain(Buffer.from(layer).toString('base64'));
    }
  });

  test('uses the Boba combined expression layer when separate face layers are unavailable', async () => {
    await Promise.all([
      writePng(assetRoot, 'boba/animals/Pinguin/Layers/Pinguin_Base.png', Buffer.from('pinguin-base')),
      writePng(assetRoot, 'boba/animals/Pinguin/Layers/Happy.png', Buffer.from('pinguin-happy')),
      writePng(assetRoot, 'boba/animals/Pinguin/Layers/Nose.png', Buffer.from('pinguin-nose'))
    ]);

    const result = await library.getSpriteSet({
      packId: 'boba',
      characterId: 'Pinguin',
      options: { expression: 'Happy' }
    });

    for (const spriteUrl of Object.values(result.sprites)) {
      const svg = await fs.readFile(path.join(dataDir, 'avatars', spriteUrl.split('/').pop()), 'utf8');
      expect(svg).toContain(Buffer.from('pinguin-base').toString('base64'));
      expect(svg).toContain(Buffer.from('pinguin-happy').toString('base64'));
    }
  });

  test('materializes only one tracked reel frame and reclaims it through generated-asset cleanup', async () => {
    const db = new Database(':memory:');
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const cacheManager = new CacheManager(dataDir, db, logger, {
      cacheEnabled: true,
      cacheDuration: 1000
    });
    await cacheManager.init();
    const managedLibrary = new AssetSpriteLibrary({
      assetRoot,
      dataDir,
      generatedAssetRegistry: cacheManager
    });

    try {
      const candidate = await managedLibrary.getSpriteSet(
        { packId: 'boba', characterId: 'Fox', options: { expression: 'Default' } },
        {
          frameNames: ['idle_neutral'],
          ownerId: 'spin:slot-one:candidates',
          expiresAt: 100
        }
      );

      expect(Object.keys(candidate.sprites)).toEqual(['idle_neutral']);
      expect(await fs.readdir(path.join(dataDir, 'avatars'))).toHaveLength(1);

      await cacheManager.cleanupGeneratedAssets(101);

      expect(await fs.readdir(path.join(dataDir, 'avatars'))).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  test('keeps shared winner frames for a newer playback and clears only tracked generated SVGs', async () => {
    const db = new Database(':memory:');
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const cacheManager = new CacheManager(dataDir, db, logger, {
      cacheEnabled: true,
      cacheDuration: 1000
    });
    await cacheManager.init();
    const managedLibrary = new AssetSpriteLibrary({
      assetRoot,
      dataDir,
      generatedAssetRegistry: cacheManager
    });
    const selection = {
      packId: 'kenney',
      characterId: 'blueA',
      options: { eye: 'human' }
    };
    const manualFile = path.join(dataDir, 'manual', 'owned-by-user.png');
    await fs.mkdir(path.dirname(manualFile), { recursive: true });
    await fs.writeFile(manualFile, TRANSPARENT_PNG);
    const manualSprites = {
      idle_neutral: manualFile,
      blink: manualFile,
      speak_closed: manualFile,
      speak_mid: manualFile,
      speak_open: manualFile
    };
    cacheManager.cacheManualSprites('owned-set', 'Owned Set', manualSprites);
    cacheManager.assignManualSetToUser('manual-viewer', 'Manual Viewer', 'owned-set');
    db.prepare('UPDATE talking_heads_cache SET last_used = 0 WHERE user_id = ?')
      .run('manual-viewer');
    await cacheManager.cleanupOldCache();
    await expect(fs.access(manualFile)).resolves.toBeUndefined();
    cacheManager.assignManualSetToUser('manual-viewer', 'Manual Viewer', 'owned-set');

    try {
      await managedLibrary.getSpriteSet(selection, {
        ownerId: 'playback:old',
        expiresAt: Date.now() + 1000
      });
      await managedLibrary.getSpriteSet(selection, {
        ownerId: 'playback:new',
        expiresAt: Date.now() + 1000
      });
      expect(await fs.readdir(path.join(dataDir, 'avatars'))).toHaveLength(5);

      await cacheManager.releaseGeneratedAssetOwner('playback:old');
      expect(await fs.readdir(path.join(dataDir, 'avatars'))).toHaveLength(5);

      await cacheManager.releaseGeneratedAssetOwner('playback:new');
      expect(await fs.readdir(path.join(dataDir, 'avatars'))).toHaveLength(0);

      await managedLibrary.getSpriteSet(selection, {
        ownerId: 'preview:clear-cache',
        expiresAt: Date.now() + 1000
      });
      await cacheManager.clearAllCache();
      await expect(fs.access(manualFile)).resolves.toBeUndefined();
      expect(await fs.readdir(path.join(dataDir, 'avatars'))).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  test('serializes clear-cache against in-flight generated asset materialization', async () => {
    const db = new Database(':memory:');
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const cacheManager = new CacheManager(dataDir, db, logger, {
      cacheEnabled: true,
      cacheDuration: 1000
    });
    await cacheManager.init();
    const managedLibrary = new AssetSpriteLibrary({
      assetRoot,
      dataDir,
      generatedAssetRegistry: cacheManager
    });
    let releaseComposition;
    let compositionStarted;
    const started = new Promise(resolve => {
      compositionStarted = resolve;
    });
    const compositionGate = new Promise(resolve => {
      releaseComposition = resolve;
    });
    managedLibrary._composeSvg = jest.fn(async () => {
      compositionStarted();
      await compositionGate;
      return '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    });

    try {
      const generation = managedLibrary.getSpriteSet(
        { packId: 'kenney', characterId: 'blueA', options: { eye: 'human' } },
        {
          frameNames: ['idle_neutral'],
          ownerId: 'preview:in-flight',
          expiresAt: Date.now() + 1000
        }
      );
      await started;
      const clear = cacheManager.clearAllCache();
      await new Promise(resolve => setImmediate(resolve));
      releaseComposition();
      await Promise.all([generation, clear]);

      expect(await fs.readdir(path.join(dataDir, 'avatars'))).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  test('preserves active playback frames during periodic cleanup and clear-cache', async () => {
    const db = new Database(':memory:');
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const cacheManager = new CacheManager(dataDir, db, logger, {
      cacheEnabled: true,
      cacheDuration: 1000
    });
    await cacheManager.init();
    const managedLibrary = new AssetSpriteLibrary({
      assetRoot,
      dataDir,
      generatedAssetRegistry: cacheManager
    });
    const activeSelection = {
      packId: 'kenney',
      characterId: 'blueA',
      options: { eye: 'human' }
    };
    const staleSelection = {
      packId: 'boba',
      characterId: 'Fox',
      options: { expression: 'Default' }
    };

    try {
      const active = await managedLibrary.getSpriteSet(activeSelection, {
        ownerId: 'playback:active',
        expiresAt: 10
      });
      const stale = await managedLibrary.getSpriteSet(staleSelection, {
        ownerId: 'preview:stale',
        expiresAt: 10
      });
      const activeIdlePath = path.join(
        dataDir,
        'avatars',
        active.sprites.idle_neutral.split('/').pop()
      );
      const staleIdlePath = path.join(
        dataDir,
        'avatars',
        stale.sprites.idle_neutral.split('/').pop()
      );

      await cacheManager.cleanupGeneratedAssets(11, ['playback:active']);
      await expect(fs.access(activeIdlePath)).resolves.toBeUndefined();
      await expect(fs.access(staleIdlePath)).rejects.toMatchObject({ code: 'ENOENT' });

      await managedLibrary.getSpriteSet(staleSelection, {
        ownerId: 'preview:clear',
        expiresAt: 20
      });
      await cacheManager.clearAllCache(['playback:active']);
      await expect(fs.access(activeIdlePath)).resolves.toBeUndefined();
      await expect(fs.access(staleIdlePath)).rejects.toMatchObject({ code: 'ENOENT' });

      await cacheManager.releaseGeneratedAssetOwner('playback:active');
      await expect(fs.access(activeIdlePath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      db.close();
    }
  });
});
