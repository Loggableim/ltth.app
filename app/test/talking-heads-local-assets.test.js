const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const AssetSpriteLibrary = require('../plugins/talking-heads/engines/asset-sprite-library');

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLffwAAAABJRU5ErkJggg==',
  'base64'
);

async function writePng(root, relativePath) {
  const target = path.join(root, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, TRANSPARENT_PNG);
}

describe('Talking Heads local asset library', () => {
  let assetRoot;
  let dataDir;
  let library;

  beforeEach(async () => {
    assetRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'talking-heads-assets-'));
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'talking-heads-output-'));

    await Promise.all([
      writePng(assetRoot, 'boba/animals/Fox/Fox_Base.png'),
      writePng(assetRoot, 'boba/animals/Fox/Fox_Eyes_Default.png'),
      writePng(assetRoot, 'boba/animals/Fox/Fox_Mouth_Default.png'),
      writePng(assetRoot, 'boba/animals/Fox/Fox_Mouth_Happy.png'),
      writePng(assetRoot, 'boba/animals/Fox/Fox_Mouth_Scared.png'),
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
});
