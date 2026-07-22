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

describe('Stream Monsters pre-stream generation pool', () => {
  test('queues an unknown gift during live play but never invokes image generation', () => {
    const { store, engine, generationService } = createPool();

    const result = engine.processGift({ userId: 'viewer-a', giftId: 44, giftName: 'Comet', coinValue: 10 });

    expect(result.egg.image_url).toMatch(/^data:image\/svg\+xml/);
    expect(generationService.generateImage).not.toHaveBeenCalled();
    expect(store.getGenerationPool()).toEqual([expect.objectContaining({ gift_id: 44, status: 'queued' })]);
  });

  test('prepares queued gift art once before a stream and reuses it for future eggs', async () => {
    const { store, pool, engine, generationService } = createPool();
    engine.processGift({ userId: 'viewer-a', giftId: 44, giftName: 'Comet', coinValue: 10 });

    const prepared = await pool.preparePending();
    const next = engine.processGift({ userId: 'viewer-b', giftId: 44, giftName: 'Comet', coinValue: 10 });

    expect(prepared).toHaveLength(1);
    expect(generationService.generateImage).toHaveBeenCalledTimes(1);
    expect(store.getGenerationPool()[0]).toEqual(expect.objectContaining({ status: 'ready', image_url: 'https://images.example/ember-egg.png' }));
    expect(next.egg.image_url).toBe('https://images.example/ember-egg.png');
  });

  test('treats configured booster gifts as explicit hatch acceleration rather than chance', () => {
    const { store, engine } = createPool();
    engine.processGift({ userId: 'viewer-a', giftId: 1, giftName: 'Rose', coinValue: 1 });
    store.upsertGiftMapping({ giftId: 99, giftName: 'Galaxy', coinValue: 100, effect: 'boost' });

    const result = engine.processGift({ userId: 'viewer-a', giftId: 99, giftName: 'Galaxy', coinValue: 100 });

    expect(result.type).toBe('boosted');
    expect(store.getViewerEggs('viewer-a', 'incubating')).toHaveLength(1);
  });
});
