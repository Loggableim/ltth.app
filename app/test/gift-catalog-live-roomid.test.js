jest.mock('axios', () => ({
  get: jest.fn()
}));

const axios = require('axios');
const EulerstreamAdapter = require('../modules/adapters/EulerstreamAdapter');

function createAdapter() {
  let catalog = [];

  const db = {
    loadStreamStats: jest.fn(() => null),
    getSetting: jest.fn(() => null),
    setSetting: jest.fn(),
    saveStreamStats: jest.fn(),
    resetStreamStats: jest.fn(),
    getGiftCatalog: jest.fn(() => catalog),
    getGift: jest.fn(() => null),
    updateGiftCatalog: jest.fn((gifts) => {
      catalog = gifts.map(gift => ({ ...gift }));
      return gifts.length;
    })
  };

  const adapter = new EulerstreamAdapter(
    { emit: jest.fn() },
    db,
    { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
  );

  return { adapter, db };
}

describe('Gift catalog refresh while connected', () => {
  beforeEach(() => {
    axios.get.mockReset();
  });

  test('captures room ID from live Webcast payloads', () => {
    const { adapter } = createAdapter();

    const roomId = adapter._captureRoomIdFromPayload({
      common: { roomId: '7312345678901234567' }
    }, 'WebcastGiftMessage');

    expect(roomId).toBe('7312345678901234567');
    expect(adapter.roomId).toBe('7312345678901234567');
  });

  test('captures room ID from websocket frame payloads', () => {
    const { adapter } = createAdapter();

    const roomId = adapter._captureRoomIdFromPayload({
      room_id: '7312345678901234568'
    }, 'websocket frame');

    expect(roomId).toBe('7312345678901234568');
    expect(adapter.roomId).toBe('7312345678901234568');
  });

  test('uses captured room ID for gift-list refresh without scraping the live page', async () => {
    const { adapter, db } = createAdapter();
    adapter.currentUsername = 'streamer';
    adapter.fetchRoomId = jest.fn();
    adapter._captureRoomIdFromPayload({ common: { roomId: '7312345678901234567' } });

    axios.get.mockResolvedValueOnce({
      data: {
        data: {
          gifts: [{
            id: 5655,
            name: 'Rose',
            image: { url_list: ['https://example.test/rose.png'] },
            diamond_count: 1
          }]
        }
      }
    });

    const result = await adapter.updateGiftCatalog();

    expect(adapter.fetchRoomId).not.toHaveBeenCalled();
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/gift/list/?'),
      expect.any(Object)
    );
    expect(axios.get.mock.calls[0][0]).toContain('room_id=7312345678901234567');
    expect(axios.get.mock.calls[0][0]).toContain('aid=1233');
    expect(axios.get.mock.calls[0][0]).toContain('app_name=musically_go');
    expect(db.updateGiftCatalog).toHaveBeenCalledWith([{
      id: 5655,
      name: 'Rose',
      image_url: 'https://example.test/rose.png',
      diamond_count: 1
    }]);
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
  });

  test('fetches the full gift catalog even when no room ID is available', async () => {
    const { adapter, db } = createAdapter();

    axios.get.mockResolvedValueOnce({
      data: {
        data: {
          gifts: [{
            id: '5655',
            name: 'Rose',
            image: { url_list: ['https://example.test/rose.png'] },
            diamond_count: '1'
          }]
        }
      }
    });

    const result = await adapter.updateGiftCatalog({ fetchRoomId: false });

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/gift/list/?'),
      expect.any(Object)
    );
    expect(axios.get.mock.calls[0][0]).toContain('aid=1233');
    expect(axios.get.mock.calls[0][0]).toContain('app_name=musically_go');
    expect(axios.get.mock.calls[0][0]).not.toContain('room_id=');
    expect(db.updateGiftCatalog).toHaveBeenCalledWith([{
      id: 5655,
      name: 'Rose',
      image_url: 'https://example.test/rose.png',
      diamond_count: 1
    }]);
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
  });

  test('normalizes locale codes before persisting refreshed gift catalogs', async () => {
    const { adapter, db } = createAdapter();

    axios.get.mockResolvedValueOnce({
      data: {
        data: {
          gifts: [{
            id: '5655',
            name: 'Rose',
            image: { url_list: ['https://example.test/rose.png'] },
            diamond_count: '1'
          }]
        }
      }
    });

    const result = await adapter.updateGiftCatalog({ locale_code: ' EN-US ' });

    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('/gift/list/?'),
      expect.any(Object)
    );
    expect(db.updateGiftCatalog).toHaveBeenCalledWith([{
      id: 5655,
      name: 'Rose',
      image_url: 'https://example.test/rose.png',
      diamond_count: 1
    }], 'en-us');
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
  });

  test('falls back to gifts already seen in the live session when room ID is unavailable', async () => {
    const { adapter, db } = createAdapter();
    adapter.sessionGifts.set(5655, {
      id: 5655,
      name: 'Rose',
      image_url: 'https://example.test/rose.png',
      diamond_count: 1
    });
    axios.get.mockRejectedValueOnce(new Error('network unavailable'));

    const result = await adapter.updateGiftCatalog();

    expect(db.updateGiftCatalog).toHaveBeenCalledWith([{
      id: 5655,
      name: 'Rose',
      image_url: 'https://example.test/rose.png',
      diamond_count: 1
    }]);
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
  });

  test('normalizes live gift payloads before catalog persistence', () => {
    const { adapter } = createAdapter();

    const normalized = adapter._normalizeGiftCatalogEntries([{
      id: '5655',
      name: 'Heart Me',
      giftPictureUrl: {
        giftPictureUrl: 'https://example.test/heart.png'
      },
      diamondCount: '1'
    }]);

    expect(normalized).toEqual([{
      id: 5655,
      name: 'Heart Me',
      image_url: 'https://example.test/heart.png',
      diamond_count: 1
    }]);
  });
});
