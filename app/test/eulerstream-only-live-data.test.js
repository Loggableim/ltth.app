const fs = require('fs');

describe('EulerStream-only TikTok connector', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../modules/adapters/EulerstreamAdapter');
  });

  test('always creates EulerStream and removes only legacy source settings', () => {
    let adapterDb;
    jest.doMock('../modules/adapters/EulerstreamAdapter', () => class MockEulerstreamAdapter {
      constructor(io, db) {
        adapterDb = db;
        this.isConnected = false;
        this.currentUsername = null;
      }
      on() {}
      removeListener() {}
      isActive() { return false; }
    });

    const db = {
      getSetting: jest.fn((key) => key === 'tiktok_data_source' ? 'tikfinity' : null),
      deleteSetting: jest.fn()
    };
    const TikTokConnector = require('../modules/tiktok');
    const connector = new TikTokConnector({ emit: jest.fn() }, db, { info: jest.fn() });

    expect(adapterDb).toBe(db);
    expect(db.deleteSetting).toHaveBeenCalledTimes(2);
    expect(db.deleteSetting).toHaveBeenNthCalledWith(1, 'tiktok_data_source');
    expect(db.deleteSetting).toHaveBeenNthCalledWith(2, 'tikfinity_ws_port');
    expect(connector.getActiveAdapterInfo()).toEqual(expect.objectContaining({ dataSource: 'eulerstream' }));
    expect(connector.switchSourceNow).toBeUndefined();
  });

  test('does not ship the TikFinity adapter', () => {
    expect(fs.existsSync(require('path').join(__dirname, '..', 'modules', 'adapters', 'TikFinityAdapter.js'))).toBe(false);
  });
});
