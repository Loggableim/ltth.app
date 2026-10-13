'use strict';

const EventEmitter = require('events');

describe('TikTokConnector SuperFan event forwarding', () => {
  let adapter;

  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../modules/adapters/EulerstreamAdapter');
  });

  test('forwards the adapter canonical event while keeping subscribe separate', () => {
    jest.doMock('../modules/adapters/EulerstreamAdapter', () => class MockEulerstreamAdapter extends EventEmitter {
      constructor() {
        super();
        adapter = this;
        this.isConnected = false;
        this.currentUsername = null;
      }

      isActive() {
        return false;
      }
    });

    const TikTokConnector = require('../modules/tiktok');
    const connector = new TikTokConnector(
      { emit: jest.fn() },
      { deleteSetting: jest.fn() },
      { info: jest.fn() }
    );
    const superfanConsumer = jest.fn();
    const subscribeConsumer = jest.fn();
    connector.on('superfan', superfanConsumer);
    connector.on('subscribe', subscribeConsumer);
    const payload = { uniqueId: 'fixture-user', eventId: 'fixture-event' };

    adapter.emit('subscribe', payload);
    expect(subscribeConsumer).toHaveBeenCalledWith(payload);
    expect(superfanConsumer).not.toHaveBeenCalled();

    adapter.emit('superfan', payload);
    expect(superfanConsumer).toHaveBeenCalledTimes(1);
    expect(superfanConsumer).toHaveBeenCalledWith(payload);
  });
});
