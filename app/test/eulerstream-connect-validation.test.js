jest.mock('ws', () => {
  const EventEmitter = require('events');
  class FakeWebSocket extends EventEmitter {
    constructor(url) {
      super();
      this.url = url;
      FakeWebSocket.instances.push(this);
    }
    ping() {}
    close() { this.emit('close', 1000, 'manual'); }
    terminate() {}
  }
  FakeWebSocket.instances = [];
  return FakeWebSocket;
});

const WebSocket = require('ws');
const EulerstreamAdapter = require('../modules/adapters/EulerstreamAdapter');
const TEST_API_KEY = 'c'.repeat(64);

function createAdapter() {
  const db = {
    loadStreamStats: jest.fn(() => null),
    saveStreamStats: jest.fn(),
    resetStreamStats: jest.fn(),
    setSetting: jest.fn(),
    getSetting: jest.fn((key) => key === 'tiktok_euler_api_key' ? TEST_API_KEY : null),
    logEvent: jest.fn(),
    updateGiftCatalog: jest.fn(() => 0),
    getGiftCatalog: jest.fn(() => [])
  };
  const adapter = new EulerstreamAdapter(
    { emit: jest.fn() },
    db,
    { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
  );
  adapter._schedulePostConnectTasks = jest.fn();
  return { adapter, db };
}

describe('Eulerstream connect validation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    WebSocket.instances = [];
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('coalesces concurrent connects and rejects an unconfirmed open after 15 seconds', async () => {
    const { adapter, db } = createAdapter();
    const first = adapter.connect('Streamer');
    const second = adapter.connect('streamer');
    expect(WebSocket.instances).toHaveLength(1);

    WebSocket.instances[0].emit('open');
    await jest.advanceTimersByTimeAsync(0);
    expect(adapter.connectionState).toBe('validating');
    expect(db.setSetting).not.toHaveBeenCalledWith('last_connected_username', expect.anything());

    const firstRejection = expect(first).rejects.toMatchObject({ connectionStatus: 'validation_failed' });
    const secondRejection = expect(second).rejects.toMatchObject({ connectionStatus: 'validation_failed' });
    await jest.advanceTimersByTimeAsync(15000);
    await firstRejection;
    await secondRejection;
    expect(WebSocket.instances).toHaveLength(1);
    expect(adapter._autoReconnectTimer).toBeNull();
  });

  test('resolves only after roomInfo confirms LIVE', async () => {
    const { adapter, db } = createAdapter();
    const connection = adapter.connect('Streamer');
    const socket = WebSocket.instances[0];
    socket.emit('open');
    await jest.advanceTimersByTimeAsync(0);

    socket.emit('message', JSON.stringify({
      messages: [{
        type: 'roomInfo',
        data: { roomId: '987654321', start_time: 1700000000 }
      }]
    }));
    await expect(connection).resolves.toEqual(expect.objectContaining({
      roomId: '987654321',
      streamIdentity: 'streamer:987654321',
      isNewStream: true,
      identityPending: false
    }));
    expect(db.setSetting).toHaveBeenCalledWith('last_connected_username', 'streamer');
    adapter.disconnect();
  });
});
