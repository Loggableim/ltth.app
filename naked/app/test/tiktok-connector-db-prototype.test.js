const USER_KEY = 'b'.repeat(64);

describe('TikTokConnector database method wrapping', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../modules/adapters/EulerstreamAdapter');
  });

  test('preserves prototype-backed database methods for adapter settings lookups', () => {
    let adapterDb = null;

    jest.doMock('../modules/adapters/EulerstreamAdapter', () => {
      return class MockEulerstreamAdapter {
        constructor(io, db) {
          adapterDb = db;
          this.isConnected = false;
          this.currentUsername = null;
        }

        on() {}

        removeListener() {}

        isActive() {
          return false;
        }

        getEulerApiKeyInfo() {
          const apiKey = adapterDb.getSetting('tiktok_euler_api_key');
          return {
            configured: apiKey === USER_KEY,
            activeSource: apiKey ? 'Database Setting' : null
          };
        }
      };
    });

    class PrototypeDb {
      constructor(settings) {
        this.settings = settings;
      }

      getSetting(key) {
        return this.settings[key] || null;
      }
    }

    const TikTokConnector = require('../modules/tiktok');
    const connector = new TikTokConnector(
      { emit: jest.fn() },
      new PrototypeDb({ tiktok_euler_api_key: USER_KEY }),
      { info: jest.fn() }
    );

    expect(connector.getEulerApiKeyInfo()).toEqual({
      configured: true,
      activeSource: 'Database Setting'
    });
  });
});
