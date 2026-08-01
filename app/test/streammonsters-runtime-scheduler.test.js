const Database = require('better-sqlite3');
const Store = require('../plugins/stream-monsters/backend/streammonsters/database');
const FreeEggDropService = require(
  '../plugins/stream-monsters/backend/streammonsters/free-egg-drop-service'
);

function createService() {
  const store = new Store(new Database(':memory:'));
  store.initialize();
  return new FreeEggDropService({
    store,
    engine: { streamKey: 'creator:1' },
    now: () => 1_000
  });
}

describe('Stream Monsters runtime deadline ownership', () => {
  test('does not arm a free egg timer until the lifecycle is started', () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const service = createService();
    try {
      expect(setTimeoutSpy).not.toHaveBeenCalled();
      service.start();
      expect(service.started).toBe(true);
    } finally {
      service.destroy();
      setTimeoutSpy.mockRestore();
    }
  });

  test('rearms the free egg deadline after a sweep database failure', () => {
    const service = createService();
    service.start();
    const rearm = jest.spyOn(service, 'rearmReleaseTimer');
    jest.spyOn(service.store, 'runInImmediateTransaction')
      .mockImplementationOnce(() => { throw new Error('database unavailable'); });
    try {
      expect(() => service.sweepAndRearm()).toThrow('database unavailable');
      expect(rearm).toHaveBeenCalled();
    } finally {
      service.destroy();
    }
  });
  test('uses indexed egg deadlines and returns due work for bounded catch-up', () => {
    const service = createService();
    try {
      service.store.createEgg({
        eggId: 'due-egg', userId: 'viewer', giftId: 1, giftName: 'Rose',
        element: 'Ember', eggColor: '#f00', seed: 'due-egg',
        state: 'incubating', createdAtMs: 0, hatchDurationMs: 1,
        readyAtMs: 1, expiresAtMs: 2
      });
      expect(service.store.getNextEggDeadline(1_000)).toBe(1);
      const indexes = service.store.db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'streammonsters_eggs_state_%_deadline' ORDER BY name"
      ).all().map(row => row.name);
      expect(indexes).toEqual([
        'streammonsters_eggs_state_expiry_deadline',
        'streammonsters_eggs_state_ready_deadline'
      ]);
    } finally {
      service.destroy();
    }
  });
  test('keeps one stable outbox event pending across a restart until delivery is acknowledged', () => {
    const service = createService();
    try {
      const input = {
        eventId: 'stable-transition-1', correlationId: 'cycle-1',
        streamKey: 'creator:1', eventType: 'streammonsters:egg_ready',
        payload: { eventId: 'stable-transition-1' }, createdAtMs: 1
      };
      expect(service.store.enqueueOutboxEvent(input)).toBe(true);
      expect(service.store.enqueueOutboxEvent(input)).toBe(false);
      expect(service.store.pendingOutboxEvents()).toEqual([
        expect.objectContaining({ eventId: 'stable-transition-1' })
      ]);
      expect(service.store.acknowledgeOutboxEvent('stable-transition-1', 2)).toBe(true);
      expect(service.store.pendingOutboxEvents()).toEqual([]);
    } finally {
      service.destroy();
    }
  });
});
