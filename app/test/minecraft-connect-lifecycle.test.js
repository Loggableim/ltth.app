const net = require('net');

const MinecraftWebSocketServer = require('../plugins/minecraft-connect/helpers/minecraftWebSocket');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

describe('Minecraft Connect lifecycle', () => {
  test('awaited stop releases its port and heartbeat timer', async () => {
    const port = await getFreePort();
    const service = new MinecraftWebSocketServer({ websocket: {
      host: '127.0.0.1', port, heartbeatInterval: 10
    } }, { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() });

    service.start();
    await new Promise(resolve => service.wss._server.once('listening', resolve));
    service.startHeartbeat();
    expect(service.heartbeatTimer).not.toBeNull();

    await service.stop();
    expect(service.heartbeatTimer).toBeNull();
    expect(service.wss).toBeNull();

    await expect(new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => server.close(resolve));
    })).resolves.toBeUndefined();
  });
});
