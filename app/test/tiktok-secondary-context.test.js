const TikTokConnector = require('../modules/tiktok');

function createIo() {
  return { emit: jest.fn() };
}

function createDb() {
  return {
    getSetting: jest.fn(() => null),
    getAllSettings: jest.fn(() => ({})),
    setSetting: jest.fn(),
    deleteSetting: jest.fn(),
    loadStreamStats: jest.fn(() => ({ likes: 99, username: 'primary-user' })),
    saveStreamStats: jest.fn(),
    resetStreamStats: jest.fn(),
    logEvent: jest.fn(),
    updateGiftCatalog: jest.fn(() => 1),
    getGiftCatalog: jest.fn(() => []),
    getGift: jest.fn(() => null)
  };
}

describe('TikTok connector source contexts', () => {
  test('keeps default primary global broadcasts and persistence behavior', () => {
    const io = createIo();
    const db = createDb();
    const primary = new TikTokConnector(io, db, { info: jest.fn(), warn: jest.fn() });

    expect(primary.getStats().likes).toBe(99);
    primary.handleEvent('chat', { username: 'viewer', comment: 'primary event' });
    primary.broadcastStatus('live');
    primary.broadcastStats();
    primary._adapter._logDatabaseEvent('chat', 'viewer', { comment: 'primary event' });
    primary._adapter._persistStreamStats();
    primary._adapter._persistConnectedUsername();

    expect(io.emit).toHaveBeenCalledWith('tiktok:event', expect.objectContaining({ type: 'chat' }));
    expect(io.emit).toHaveBeenCalledWith('tiktok:status', expect.objectContaining({ status: 'live' }));
    expect(io.emit).toHaveBeenCalledWith('tiktok:stats', expect.objectContaining({ likes: 99 }));
    expect(db.logEvent).toHaveBeenCalledTimes(1);
    expect(db.saveStreamStats).toHaveBeenCalledTimes(1);
    expect(db.setSetting).toHaveBeenCalledWith('last_connected_username', 'primary-user');
  });

  test('isolates two secondary connectors from global effects and from each other', async () => {
    const io = createIo();
    const db = createDb();
    const sourceA = new TikTokConnector(io, db, { info: jest.fn(), warn: jest.fn() }, {
      mode: 'secondary', sourceId: 'stream1'
    });
    const sourceB = new TikTokConnector(io, db, { info: jest.fn(), warn: jest.fn() }, {
      mode: 'secondary', sourceId: 'stream2'
    });
    const seenA = [];
    const seenB = [];
    sourceA.on('chat', event => seenA.push(event));
    sourceB.on('chat', event => seenB.push(event));

    expect(sourceA.getStats().likes).toBe(0);
    sourceA.handleEvent('chat', { username: 'a', comment: 'source A' });
    sourceB.handleEvent('chat', { username: 'b', comment: 'source B' });
    sourceA.broadcastStatus('live');
    sourceA.broadcastStats();
    sourceA._adapter._logDatabaseEvent('chat', 'a', {});
    sourceA._adapter._persistStreamStats();
    sourceA._adapter.confirmedUsername = 'secondary-user';
    sourceA._adapter._persistConnectedUsername();
    sourceA._adapter._emitGlobal('tiktok:streamTimeInfo', { sourceId: 'stream1' });
    sourceA._adapter._emitGlobal('gift-catalog:updated', { gifts: [] });
    sourceA._adapter._updateGiftCatalog([{ id: 1, name: 'Rose' }]);
    sourceA.resetStats();

    expect(seenA.map(event => event.comment)).toEqual(['source A']);
    expect(seenB.map(event => event.comment)).toEqual(['source B']);
    expect(io.emit).not.toHaveBeenCalled();
    expect(db.deleteSetting).not.toHaveBeenCalled();
    expect(db.logEvent).not.toHaveBeenCalled();
    expect(db.saveStreamStats).not.toHaveBeenCalled();
    expect(db.resetStreamStats).not.toHaveBeenCalled();
    expect(db.updateGiftCatalog).not.toHaveBeenCalled();
    expect(db.setSetting).not.toHaveBeenCalled();

    await sourceA.disconnect();
    sourceB.handleEvent('chat', { username: 'b', comment: 'source B still active' });
    expect(seenB.map(event => event.comment)).toEqual(['source B', 'source B still active']);
    expect(io.emit).not.toHaveBeenCalled();
  });

  test('rejects invalid secondary source identifiers', () => {
    expect(() => new TikTokConnector(createIo(), createDb(), console, { mode: 'secondary' }))
      .toThrow('requires a valid sourceId');
    expect(() => new TikTokConnector(createIo(), createDb(), console, { mode: 'unexpected' }))
      .toThrow('context mode');
    expect(() => new TikTokConnector(createIo(), createDb(), console, { mode: '' }))
      .toThrow('context mode');
  });
});
