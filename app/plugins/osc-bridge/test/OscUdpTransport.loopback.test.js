const dgram = require('dgram');
const EventEmitter = require('events');
const osc = require('osc');
const OscUdpTransport = require('../modules/OscUdpTransport');

const pendingWaitCleanups = new Set();

describe('OscUdpTransport UDP loopback', () => {
  const transports = [];
  const sockets = [];

  afterEach(async () => {
    for (const cleanup of [...pendingWaitCleanups]) {
      cleanup();
    }
    await Promise.all(transports.splice(0).map(transport => transport.stop()));
    await Promise.all(sockets.splice(0).map(closeSocket));
  });

  test('starts on a dynamic port and sends a real OSC packet to a local receiver', async () => {
    const receiver = await bindSocket();
    const transport = makeTransport();
    const receivePort = await getFreePort();
    const packet = waitForSocketMessage(receiver);

    await expect(transport.start(makeConfig(receivePort, receiver.address().port))).resolves.toEqual({ success: true });
    transport.send({ address: '/avatar/parameters/Wave', args: [{ type: 'T', value: true }] });

    await expect(packet).resolves.toEqual(expect.objectContaining({
      address: '/avatar/parameters/Wave',
      args: [expect.objectContaining({ type: 'T', value: true })]
    }));
    expect(transport.getStatus()).toEqual(expect.objectContaining({ state: 'running', isRunning: true }));
  });

  test('emits inbound OSC packets, then cleanly stops and restarts on the same port', async () => {
    const receiver = await bindSocket();
    const transport = makeTransport();
    const receivePort = await getFreePort();
    const message = onceEvent(transport, 'message');

    await transport.start(makeConfig(receivePort, receiver.address().port));
    await sendPacket(receiver, receivePort, { address: '/avatar/parameters/Inbound', args: [{ type: 'i', value: 7 }] });

    await expect(message).resolves.toEqual([
      expect.objectContaining({ address: '/avatar/parameters/Inbound', args: [expect.objectContaining({ value: 7 })] }),
      undefined,
      expect.objectContaining({ address: '127.0.0.1' })
    ]);
    await expect(transport.stop()).resolves.toEqual({ success: true });
    await expect(transport.start(makeConfig(receivePort, receiver.address().port))).resolves.toEqual({ success: true });
  });

  test('reports a real port conflict without leaving a running transport behind', async () => {
    const blocker = await bindSocket('0.0.0.0');
    const transport = makeTransport();
    const result = await transport.start(makeConfig(blocker.address().port, await getFreePort()));

    expect(result).toEqual(expect.objectContaining({ success: false, code: 'EADDRINUSE' }));
    expect(transport.getStatus()).toEqual(expect.objectContaining({ state: 'error', isRunning: false }));
  });

  test('wait helpers reject parser failures and timeouts without retaining listeners or timers', async () => {
    jest.useFakeTimers();
    try {
      const socket = new EventEmitter();
      const malformedPacket = waitForSocketMessage(socket);
      socket.emit('message', Buffer.from([0]));

      await expect(malformedPacket).rejects.toThrow();
      expect(socket.listenerCount('message')).toBe(0);
      expect(jest.getTimerCount()).toBe(0);

      const emitter = new EventEmitter();
      const timedOut = onceEvent(emitter, 'message');
      jest.advanceTimersByTime(3000);

      await expect(timedOut).rejects.toThrow('Timed out waiting for message');
      expect(emitter.listenerCount('message')).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  function makeTransport() {
    const transport = new OscUdpTransport({ logger: { warn: jest.fn() } });
    transports.push(transport);
    return transport;
  }

  function makeConfig(receivePort, sendPort) {
    return { receivePort, sendHost: '127.0.0.1', sendPort };
  }

  async function bindSocket(host = '127.0.0.1') {
    const socket = dgram.createSocket('udp4');
    sockets.push(socket);
    await new Promise((resolve, reject) => {
      socket.once('error', reject);
      socket.bind(0, host, resolve);
    });
    return socket;
  }
});

function getFreePort() {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', () => {
      const { port } = socket.address();
      socket.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function waitForSocketMessage(socket) {
  return waitForEvent(socket, 'message', data => osc.readPacket(data, { metadata: true }), 'UDP message');
}

function onceEvent(emitter, event) {
  return waitForEvent(emitter, event, (...args) => args, event);
}

function waitForEvent(emitter, event, transform, label) {
  let timer;
  let handler;
  let settled = false;
  let cancel;

  const promise = new Promise((resolve, reject) => {
    const settle = (complete, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      emitter.removeListener(event, handler);
      pendingWaitCleanups.delete(cancel);
      complete(value);
    };

    handler = (...args) => {
      try {
        settle(resolve, transform(...args));
      } catch (error) {
        settle(reject, error);
      }
    };
    cancel = () => settle(resolve, undefined);
    timer = setTimeout(() => settle(reject, new Error(`Timed out waiting for ${label}`)), 3000);
    emitter.once(event, handler);
    pendingWaitCleanups.add(cancel);
  });

  return promise;
}

function sendPacket(socket, port, packet) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(osc.writePacket(packet, { metadata: true }));
    socket.send(data, port, '127.0.0.1', error => error ? reject(error) : resolve());
  });
}

function closeSocket(socket) {
  return new Promise(resolve => socket.close(() => resolve()));
}
