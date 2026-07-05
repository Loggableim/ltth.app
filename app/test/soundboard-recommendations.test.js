const EventEmitter = require('events');

jest.mock('../plugins/soundboard/fetcher', () => jest.fn());
jest.mock('../plugins/soundboard/transport-ws', () => jest.fn());
jest.mock('../plugins/soundboard/api-routes', () => jest.fn());
jest.mock('../plugins/soundboard/myinstants-api', () => jest.fn());
jest.mock('../plugins/soundboard/audio-cache', () => jest.fn());
jest.mock('../plugins/soundboard/cache-cleanup', () => jest.fn());

const SoundboardPlugin = require('../plugins/soundboard/main');

describe('Soundboard gift recommendations', () => {
  function createManager({ configured = [], eventRows = [], catalog = {} } = {}) {
    const db = {
      db: {
        prepare: jest.fn((sql) => {
          if (sql.includes('FROM gift_sounds ORDER BY')) {
            return { all: () => configured };
          }
          if (sql.includes('FROM gift_catalog WHERE id = ?')) {
            return { get: (id) => catalog[id] || null };
          }
          return { all: () => [], get: () => null, run: () => ({}) };
        })
      },
      getEventLogsFiltered: jest.fn(() => eventRows)
    };

    return new SoundboardPlugin.SoundboardManager(db, new EventEmitter(), {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    });
  }

  test('returns frequent unconfigured gifts sorted by received count', () => {
    const manager = createManager({
      configured: [
        { gift_id: 10, label: 'Already Configured', mp3_url: 'configured.mp3', volume: 1 }
      ],
      catalog: {
        20: { id: 20, name: 'Rose', image_url: 'rose.png', diamond_count: 1 },
        30: { id: 30, name: 'Galaxy', image_url: 'galaxy.png', diamond_count: 1000 }
      },
      eventRows: [
        { timestamp: '2026-07-05T10:00:00Z', data: { giftId: 20, giftName: 'Rose', repeatCount: 2 } },
        { timestamp: '2026-07-05T10:01:00Z', data: { giftId: 30, giftName: 'Galaxy', repeatCount: 5 } },
        { timestamp: '2026-07-05T10:02:00Z', data: { giftId: 10, giftName: 'Already Configured', repeatCount: 99 } },
        { timestamp: '2026-07-05T10:03:00Z', data: { giftId: 20, giftName: 'Rose', repeatCount: 2 } }
      ]
    });

    const recommendations = manager.getUnconfiguredGiftRecommendations({ limit: 10 });

    expect(recommendations).toHaveLength(2);
    expect(recommendations[0]).toMatchObject({
      giftId: 30,
      label: 'Galaxy',
      repeatCount: 5,
      dropCount: 1,
      diamondCount: 1000
    });
    expect(recommendations[1]).toMatchObject({
      giftId: 20,
      label: 'Rose',
      repeatCount: 4,
      dropCount: 2,
      imageUrl: 'rose.png'
    });
  });
});
