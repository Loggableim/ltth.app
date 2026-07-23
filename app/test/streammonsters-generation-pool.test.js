const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const StreamMonstersEngine = require('../plugins/streamalchemy/backend/streammonsters/game-engine');
const GenerationPool = require('../plugins/streamalchemy/backend/streammonsters/generation-pool');

function createPool() {
  const store = new StreamMonstersDatabase(new Database(':memory:'));
  store.initialize();
  const generationService = {
    generateImage: jest.fn().mockResolvedValue({
      imageUrl: 'https://images.example/ember-egg.png', provider: 'localComfy', model: 'sdxl_lightning_4step'
    })
  };
  const pool = new GenerationPool({ store, generationService });
  const engine = new StreamMonstersEngine({
    store,
    generationPool: pool,
    now: () => 1_000,
    config: { hatchDurationMs: 1_800_000 }
  });
  return { store, pool, engine, generationService };
}

describe('Stream Monsters legacy generation pool compatibility', () => {
  test('ignores an unselected live gift and never invokes image generation', () => {
    const { store, engine, generationService } = createPool();

    const result = engine.processGift({ userId: 'viewer-a', giftId: 44, giftName: 'Comet', coinValue: 10 });

    expect(result.type).toBe('ignored');
    expect(generationService.generateImage).not.toHaveBeenCalled();
    expect(store.getGenerationPool()).toEqual([]);
  });

  test('uses bundled element egg art for a selected live gift without queueing AI', async () => {
    const { store, engine, generationService } = createPool();
    store.upsertGiftMapping({
      giftId: 44, giftName: 'Comet', element: 'Ember', effect: 'spawn', enabled: true
    });
    engine.processGift({ userId: 'viewer-a', giftId: 44, giftName: 'Comet', coinValue: 10 });

    const next = engine.processGift({ userId: 'viewer-b', giftId: 44, giftName: 'Comet', coinValue: 10 });

    expect(generationService.generateImage).not.toHaveBeenCalled();
    expect(store.getGenerationPool()).toEqual([]);
    expect(next.egg.image_url).toBe('/plugins/streamalchemy/assets/eggs/ember-standard.png');
  });

  test('treats configured booster gifts as explicit hatch acceleration rather than chance', () => {
    const { store, engine } = createPool();
    store.upsertGiftMapping({ giftId: 1, giftName: 'Rose', element: 'Ember', effect: 'spawn', enabled: true });
    engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Rose', coinValue: 1 });
    store.upsertGiftMapping({ giftId: 99, giftName: 'Galaxy', coinValue: 100, effect: 'boost', enabled: true });

    const result = engine.processGift({ userId: 'viewer-a', giftId: 99, giftName: 'Galaxy', coinValue: 100 });

    expect(result.type).toBe('boosted');
    expect(store.getViewerEggs('viewer-a', 'incubating')).toHaveLength(1);
  });
});
