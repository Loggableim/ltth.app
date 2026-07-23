const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const KenneyMonsterBuilder = require('../plugins/streamalchemy/backend/streammonsters/kenney-monster-builder');
const ArtPoolService = require('../plugins/streamalchemy/backend/streammonsters/art-pool-service');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-collector-arena-'));
}

const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('Stream Monsters Kenney fallback and AI art pool', () => {
  test('builds the same cached SVG for the same monster seed', () => {
    const dataDir = createTempDir();
    const builder = new KenneyMonsterBuilder({
      assetDir: path.join(process.cwd(), 'plugins', 'streamalchemy', 'assets', 'kenney-monster-builder'),
      dataDir
    });

    const first = builder.build({ seed: 'seed-ember-1', element: 'Ember' });
    const second = builder.build({ seed: 'seed-ember-1', element: 'Ember' });

    expect(second).toEqual(first);
    expect(first.visualSource).toBe('kenney');
    expect(first.visualKey).toMatch(/^kenney:/);
    expect(fs.readFileSync(first.absolutePath, 'utf8')).toContain('<svg');
    expect(first.absolutePath).toContain(path.join('streammonsters', 'monster-art'));
  });

  test('builds a valid, distinct element-coloured monster for all six elements', () => {
    const dataDir = createTempDir();
    const builder = new KenneyMonsterBuilder({
      assetDir: path.join(process.cwd(), 'plugins', 'streamalchemy', 'assets', 'kenney-monster-builder'),
      dataDir
    });
    const colors = {
      Ember: 'red',
      Tide: 'blue',
      Grove: 'green',
      Gale: 'white',
      Volt: 'yellow',
      Lunar: 'dark'
    };

    const monsters = Object.entries(colors).map(([element, color]) => {
      const result = builder.build({ seed: `seed-${element}`, element });
      expect(result.selection.color).toBe(color);
      expect(fs.existsSync(result.absolutePath)).toBe(true);
      return result.visualKey;
    });

    expect(new Set(monsters).size).toBe(6);
  });

  test('prepares serial AI art by element and variant and rejects placeholder output', async () => {
    const dataDir = createTempDir();
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const generationService = {
      generateImage: jest.fn()
        .mockResolvedValueOnce({ provider: 'placeholder', imageUrl: 'data:image/svg+xml,bad' })
        .mockResolvedValueOnce({
          provider: 'openai',
          imageUrl: `data:image/png;base64,${ONE_PIXEL_PNG}`
        })
    };
    const pool = new ArtPoolService({ store, generationService, dataDir, now: () => 50_000 });

    const result = await pool.prepare({
      targetPerVariant: 1,
      combinations: [
        { element: 'Ember', variant: 'standard' },
        { element: 'Tide', variant: 'charged' }
      ]
    });

    expect(generationService.generateImage).toHaveBeenCalledTimes(2);
    expect(result.coverage).toEqual(expect.arrayContaining([
      expect.objectContaining({ element: 'Ember', variant: 'standard', ready: 0 }),
      expect.objectContaining({ element: 'Tide', variant: 'charged', ready: 1 })
    ]));
    expect(store.consumeArtPoolSkin('Tide', 'charged')).toEqual(expect.objectContaining({
      provider: 'openai',
      status: 'consumed'
    }));
  });

  test('clamps the configurable pool target to one through eight', async () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const pool = new ArtPoolService({
      store,
      generationService: { generateImage: jest.fn() },
      dataDir: createTempDir()
    });

    expect(pool.normalizeTarget(0)).toBe(1);
    expect(pool.normalizeTarget(3)).toBe(3);
    expect(pool.normalizeTarget(99)).toBe(8);
  });

  test('does not start paid generation until at least one spawn gift is active', async () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const generationService = { generateImage: jest.fn() };
    const pool = new ArtPoolService({
      store,
      generationService,
      dataDir: createTempDir()
    });

    const result = await pool.prepare({ targetPerVariant: 3 });

    expect(result.jobs).toEqual([]);
    expect(result.coverage).toEqual([]);
    expect(generationService.generateImage).not.toHaveBeenCalled();
  });

  test('shows zero-ready coverage for both variants of every active spawn element', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    store.upsertGiftMapping({
      giftId: 1,
      giftName: 'Rose',
      element: 'Ember',
      effect: 'spawn',
      enabled: true
    });
    const pool = new ArtPoolService({
      store,
      generationService: { generateImage: jest.fn() },
      dataDir: createTempDir()
    });

    expect(pool.coverage(3)).toEqual([
      { element: 'Ember', variant: 'standard', ready: 0, consumed: 0, target: 3 },
      { element: 'Ember', variant: 'charged', ready: 0, consumed: 0, target: 3 }
    ]);
  });

  test('evolves one Kenney fallback cosmetically during the next preparation without changing ownership or stats', async () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const egg = store.createEgg({
      userId: 'viewer-a',
      giftId: 1,
      giftName: 'Rose',
      element: 'Ember',
      eggColor: '#ef6b45',
      seed: 'evolution-seed',
      variant: 'standard',
      createdAtMs: 1,
      hatchDurationMs: 0
    });
    const monster = store.createMonsterFromEgg(egg, {
      name: 'Fizzlet',
      personality: 'Brave',
      rarity: 'Standard',
      stats: { vitality: 7, might: 7, guard: 7, agility: 7 },
      imageUrl: '/api/streammonsters/art/kenney-old.svg',
      visualSource: 'kenney',
      visualKey: 'kenney:old',
      createdAtMs: 2
    });
    const emitted = [];
    const pool = new ArtPoolService({
      store,
      generationService: {
        generateImage: jest.fn(async () => ({
          provider: 'openai',
          imageUrl: `data:image/png;base64,${ONE_PIXEL_PNG}`
        }))
      },
      dataDir: createTempDir(),
      emit: (event, payload) => emitted.push({ event, payload }),
      now: () => 50_000
    });

    await pool.prepare({
      targetPerVariant: 1,
      combinations: [{ element: 'Ember', variant: 'standard' }]
    });
    const evolved = store.getMonster(monster.monster_id);

    expect(evolved).toEqual(expect.objectContaining({
      user_id: 'viewer-a',
      name: 'Fizzlet',
      visual_source: 'ai',
      stats: monster.stats
    }));
    expect(evolved.image_url).toMatch(/^\/api\/streammonsters\/art\/ai-/);
    expect(emitted.map(entry => entry.event)).toContain('streammonsters:monster_visual_evolved');
    expect(store.getArtPoolReadyCount('Ember', 'standard')).toBe(1);
  });

  test('rejects non-image bytes instead of adding broken provider output to the pool', async () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    store.upsertGiftMapping({
      giftId: 1,
      giftName: 'Rose',
      element: 'Ember',
      effect: 'spawn',
      enabled: true
    });
    const pool = new ArtPoolService({
      store,
      generationService: {
        generateImage: jest.fn(async () => ({
          provider: 'openai',
          imageUrl: 'data:image/png;base64,aGVsbG8='
        }))
      },
      dataDir: createTempDir()
    });

    const result = await pool.prepare({
      targetPerVariant: 1,
      combinations: [{ element: 'Ember', variant: 'standard' }]
    });

    expect(result.jobs[0]).toEqual(expect.objectContaining({
      status: 'failed',
      error: 'STREAM_MONSTERS_AI_IMAGE_INVALID'
    }));
    expect(store.getArtPoolReadyCount('Ember', 'standard')).toBe(0);
  });
});
