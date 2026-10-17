'use strict';

const EventEmitter = require('events');
const EulerstreamAdapter = require('../modules/adapters/EulerstreamAdapter');

describe('EulerStream SuperFan source log privacy', () => {
  test('does not write raw WebSocket message data to logs after a processing error', async () => {
    const adapter = Object.create(EulerstreamAdapter.prototype);
    EventEmitter.call(adapter);
    adapter.ws = new EventEmitter();
    adapter.eventEmitter = new EventEmitter();
    adapter.logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    adapter._activeGeneration = 1;
    adapter._recordEulerstreamActivity = jest.fn();
    adapter._captureRoomIdFromPayload = jest.fn();
    adapter._extractEulerstreamMessages = () => { throw new Error('synthetic processing failure'); };
    adapter._registerEulerstreamEvents = jest.fn();

    await adapter._setupWebSocketHandlers(1);
    const rawFixture = JSON.stringify({
      type: 'WebcastBarrageMessage',
      data: { userId: 'synthetic-private-id', nickname: 'Synthetic Viewer' }
    });
    const messageHandler = adapter.ws.listeners('message')[0];
    await messageHandler(rawFixture);

    const logs = JSON.stringify([
      ...adapter.logger.debug.mock.calls,
      ...adapter.logger.warn.mock.calls,
      ...adapter.logger.error.mock.calls
    ]);
    expect(logs).not.toContain('synthetic-private-id');
    expect(logs).not.toContain('Synthetic Viewer');

    adapter._extractEulerstreamMessages = () => [];
    await messageHandler(JSON.stringify({
      userId: 'synthetic-private-id',
      nickname: 'Synthetic Viewer'
    }));
    adapter._extractEulerstreamMessages = () => [{
      data: { userId: 'synthetic-private-id', nickname: 'Synthetic Viewer' }
    }];
    await messageHandler(JSON.stringify({ messages: [{}] }));
    adapter._extractRoomIdFromPayload = () => 'synthetic-room-id';
    adapter.roomId = null;
    adapter._captureRoomIdFromPayload({}, 'WebcastBarrageMessage');

    const allLogs = JSON.stringify([
      ...adapter.logger.debug.mock.calls,
      ...adapter.logger.warn.mock.calls,
      ...adapter.logger.error.mock.calls
    ]);
    expect(allLogs).not.toContain('synthetic-private-id');
    expect(allLogs).not.toContain('Synthetic Viewer');
    expect(allLogs).not.toContain('synthetic-room-id');
  });
});
