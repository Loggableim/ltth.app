'use strict';

const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/stream-monsters/backend/streammonsters/database'
);
const StreamMonstersEngine = require(
  '../plugins/stream-monsters/backend/streammonsters/game-engine'
);
const CollectionService = require(
  '../plugins/stream-monsters/backend/streammonsters/collection-service'
);
const ViewerRetentionService = require(
  '../plugins/stream-monsters/backend/streammonsters/viewer-retention-service'
);
const StreamMonstersPlugin = require('../plugins/stream-monsters');

function createSubject() {
  const sqlite = new Database(':memory:');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  store.upsertGiftMapping({
    giftId: 7,
    giftName: 'Rose',
    element: 'Ember',
    effect: 'spawn',
    enabled: true
  });
  const collection = new CollectionService({ store, now: () => 1_000 });
  const engine = new StreamMonstersEngine({ store, collection, now: () => 1_000 });
  return { sqlite, store, engine };
}

describe('Stream Monsters bounded gift batches', () => {
  test('handles at most 250 normal repeats in one transaction and converts overflow to capped essence', () => {
    const { store, engine } = createSubject();
    const transaction = jest.spyOn(store, 'runInTransaction');

    const result = engine.processGiftBatch({
      userId: 'viewer-a',
      giftId: 7,
      giftName: 'Rose',
      coinValue: 1,
      repeatCount: 1_000,
      eventKey: 'gift:batch-1'
    });

    expect(transaction.mock.calls.length).toBeLessThanOrEqual(2);
    expect(result).toEqual(expect.objectContaining({
      processedCount: 250,
      overflowEssence: 30
    }));
    expect(store.getElementEssence('viewer-a', 'Ember').amount).toBe(30);
    expect(engine.processGiftBatch({
      userId: 'viewer-a',
      giftId: 7,
      giftName: 'Rose',
      coinValue: 1,
      repeatCount: 1_000,
      eventKey: 'gift:batch-1'
    })).toEqual(expect.objectContaining({ duplicate: true, processedCount: 0 }));
  });
});

describe('Stream Monsters creator retention', () => {
  test('archives only an inactive bounded batch and preserves protected viewers', () => {
    const { store } = createSubject();
    const nowMs = 300 * 86_400_000;
    ['stale-a', 'stale-b', 'protected-outbox', 'protected-claim', 'protected-egg'].forEach(userId => {
      store.touchViewerRetention(userId, 1);
      store.db.prepare(`INSERT INTO streammonsters_viewer_progress (user_id) VALUES (?)`).run(userId);
    });
    store.enqueueOutboxEvent({
      eventId: 'outbox-1', correlationId: 'c', streamKey: 's', eventType: 'x',
      payload: { userId: 'protected-outbox' }, createdAtMs: 1
    });
    store.createFreeEggOffer({
      offerId: 'offer-1', streamKey: 's', sourceUserId: 'protected-claim',
      offerEventId: 'offer-event-1', offeredAtMs: 1, reservedUntilMs: nowMs + 1
    });
    store.createEgg({
      eggId: 'egg-1', userId: 'protected-egg', giftId: 7, giftName: 'Rose',
      element: 'Ember', eggColor: '#f00', seed: 'seed', state: 'ready',
      createdAtMs: 1, hatchDurationMs: 1, readyAtMs: 2
    });
    store.db.prepare(`INSERT INTO streammonsters_monsters (
      monster_id, user_id, egg_id, name, element, rarity, stats_json, created_at_ms
    ) VALUES ('monster-1', 'other', 'egg-1', 'Monster', 'Ember', 'common', '{}', 1)`).run();

    const service = new ViewerRetentionService({ store, now: () => nowMs });
    expect(service.setConfig({ activeDays: 30, purgeDays: 240 })).toEqual({
      activeDays: 30,
      purgeDays: 240
    });
    expect(service.run()).toEqual(expect.objectContaining({ archived: 2 }));
    expect(store.db.prepare(`SELECT user_id FROM streammonsters_viewer_progress ORDER BY user_id`).all())
      .toEqual(expect.arrayContaining([
        { user_id: 'protected-outbox' },
        { user_id: 'protected-claim' },
        { user_id: 'protected-egg' }
      ]));
    expect(store.db.prepare(`SELECT user_id FROM streammonsters_viewer_progress WHERE user_id = 'stale-a'`).get())
      .toBeUndefined();
  });
});


describe('Stream Monsters retention safeguards', () => {
  test('rejects out-of-range and inverted retention windows', () => {
    const { store } = createSubject();
    const service = new ViewerRetentionService({ store });
    expect(() => service.setConfig({ activeDays: 0, purgeDays: 240 })).toThrow('STREAM_MONSTERS_RETENTION_ACTIVE_INVALID');
    expect(() => service.setConfig({ activeDays: 30, purgeDays: 30 })).toThrow('STREAM_MONSTERS_RETENTION_PURGE_INVALID');
    expect(service.setConfig({})).toEqual({ activeDays: 30, purgeDays: 240 });
  });

  test('retains identities and a cooldown ledger while they are still required', () => {
    const { store } = createSubject();
    const now = 300 * 86_400_000;
    store.touchViewerRetention('identity-viewer', 1);
    store.resolveViewerIdentity({ platformUserId: '7123456789012345678', legacyUserId: 'identity-viewer', updatedAtMs: 1 });
    store.touchViewerRetention('cooldown-viewer', 1);
    store.db.prepare('INSERT INTO streammonsters_free_egg_cooldowns (user_id, expires_at_ms) VALUES (?, ?)').run('cooldown-viewer', now + 1);
    const service = new ViewerRetentionService({ store, now: () => now });
    service.run();
    expect(store.db.prepare('SELECT 1 FROM streammonsters_viewer_identities WHERE canonical_user_id = ?').get('tiktok:7123456789012345678')).toBeDefined();
    expect(store.db.prepare('SELECT 1 FROM streammonsters_viewer_archives WHERE user_id = ?').get('cooldown-viewer')).toBeUndefined();
  });
});

describe('Stream Monsters retention configuration', () => {
  test('validates the candidate before persistence and configures the retention service', () => {
    const api = {
      getConfig: () => ({}),
      setConfig: jest.fn(() => true)
    };
    const plugin = new StreamMonstersPlugin(api);
    plugin.config = plugin.loadConfig({});
    expect(() => plugin.updateConfig({ streamMonsters: {
      retentionActiveDays: 90,
      retentionPurgeDays: 90
    } })).toThrow('STREAM_MONSTERS_RETENTION_PURGE_INVALID');
    expect(api.setConfig).not.toHaveBeenCalled();

    const next = plugin.updateConfig({ streamMonsters: {
      retentionActiveDays: 14,
      retentionPurgeDays: 60
    } }, { expectedRevision: 0 });
    expect(next.streamMonsters).toMatchObject({
      retentionActiveDays: 14,
      retentionPurgeDays: 60
    });
    expect(api.setConfig).toHaveBeenCalledTimes(1);
  });
});
