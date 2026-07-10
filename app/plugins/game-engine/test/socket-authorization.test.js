const GameEnginePlugin = require('../main');

function createSocket(handshake) {
  const handlers = new Map();
  return {
    handshake,
    on: jest.fn((event, handler) => handlers.set(event, handler)),
    emit: jest.fn(),
    trigger(event, payload) {
      return handlers.get(event)?.(payload);
    }
  };
}

describe('Game Engine socket authorization', () => {
  function createPlugin() {
    let connectionHandler;
    const io = {
      on: jest.fn((event, handler) => {
        if (event === 'connection') connectionHandler = handler;
      }),
      emit: jest.fn()
    };
    const api = {
      getSocketIO: () => io,
      log: jest.fn()
    };
    const plugin = new GameEnginePlugin(api);
    plugin.handleStreamerMove = jest.fn();
    plugin.registerSocketEvents();
    return { plugin, connectionHandler };
  }

  test('rejects an overlay socket attempting an admin action', () => {
    const { plugin, connectionHandler } = createPlugin();
    const socket = createSocket({
      address: '127.0.0.1',
      auth: { role: 'overlay' },
      headers: { referer: 'http://localhost:3000/overlay/game-engine/plinko' }
    });

    connectionHandler(socket);
    socket.trigger('game-engine:streamer-move', { sessionId: 1, column: 'A' });

    expect(plugin.handleStreamerMove).not.toHaveBeenCalled();
    expect(socket.emit).toHaveBeenCalledWith('game-engine:authorization-error', expect.objectContaining({
      event: 'game-engine:streamer-move'
    }));
  });

  test('accepts a loopback admin socket for streamer actions', () => {
    const { plugin, connectionHandler } = createPlugin();
    const socket = createSocket({
      address: '127.0.0.1',
      auth: { role: 'admin' },
      headers: { referer: 'http://localhost:3000/game-engine/ui' }
    });

    connectionHandler(socket);
    const payload = { sessionId: 1, column: 'A' };
    socket.trigger('game-engine:streamer-move', payload);

    expect(plugin.handleStreamerMove).toHaveBeenCalledWith(payload);
  });

  test('accepts an overlay socket only for rendering completion events', async () => {
    const { plugin, connectionHandler } = createPlugin();
    plugin.plinkoGame = { handleBallLanded: jest.fn().mockResolvedValue({ success: true }) };
    const socket = createSocket({
      address: '127.0.0.1',
      auth: { role: 'overlay' },
      headers: { referer: 'http://localhost:3000/overlay/game-engine/plinko' }
    });

    connectionHandler(socket);
    await socket.trigger('plinko:ball-landed', { ballId: 'ball-1', slotIndex: 99 });

    expect(plugin.plinkoGame.handleBallLanded).toHaveBeenCalledWith('ball-1');
  });
});
