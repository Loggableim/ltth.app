/**
 * Tests for the Animaze mock endpoint (in-memory test doubles).
 *
 * Verifies that the mock speaks the wire contract from `animazeContract.js`:
 * it records valid commands, answers with the documented speech events and
 * supports deterministic failure injection. No real socket / Animaze needed.
 */

const {
  SOCKET_STATE,
  MockAnimazeServer,
  createMockServer,
  createMockSocketFactory,
  buildCommandFrame
} = require('../backend/animazeMock');

const flushImmediate = () => new Promise(resolve => setImmediate(resolve));

/**
 * Collect inbound frames delivered to a socket.
 * @param {Object} socket
 * @returns {{frames: Array<string>}}
 */
function collect(socket) {
  const frames = [];
  socket.on('message', frame => frames.push(frame));
  return { frames };
}

describe('MockAnimazeSocket', () => {
  it('hands out connecting sockets from the factory', () => {
    const server = createMockServer();
    const socket = server.socketFactory('ws://127.0.0.1:9000');
    expect(server.sockets).toContain(socket);
    expect(socket.readyState).toBe(SOCKET_STATE.CONNECTING);
    expect(socket.isOpen).toBe(false);
  });

  it('throws when sending before the socket is open', () => {
    const server = createMockServer();
    const socket = server.createSocket();
    expect(() => socket.send(buildCommandFrame('Hi'))).toThrow('not open');
  });

  it('emits open exactly once via the driver helper', () => {
    const server = createMockServer();
    const socket = server.createSocket();
    const onOpen = jest.fn();
    socket.on('open', onOpen);
    socket.open().open();
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(socket.isOpen).toBe(true);
  });

  it('emits close only when it was open', () => {
    const server = createMockServer();
    const connecting = server.createSocket();
    const onConnectingClose = jest.fn();
    connecting.on('close', onConnectingClose);
    connecting.close();
    expect(onConnectingClose).not.toHaveBeenCalled();

    const socket = server.createSocket().open();
    const onClose = jest.fn();
    socket.on('close', onClose);
    socket.close(1000, 'bye');
    expect(onClose).toHaveBeenCalledWith(1000, 'bye');
    expect(socket.closeArgs).toEqual({ code: 1000, reason: 'bye' });
  });

  it('refuses and stalls on demand', () => {
    const server = createMockServer();
    const refused = server.createSocket();
    const onError = jest.fn();
    refused.on('error', onError);
    refused.refuse('nope');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(refused.readyState).toBe(SOCKET_STATE.CLOSED);

    const stalled = server.createSocket().stall();
    expect(stalled.readyState).toBe(SOCKET_STATE.CONNECTING);
  });

  it('emits the speech driver helpers as contract frames', () => {
    const server = createMockServer();
    const socket = server.createSocket().open();
    const { frames } = collect(socket);
    socket.speakStarted();
    socket.speakEnded();
    expect(frames).toEqual([
      JSON.stringify({ action: 'ChatbotSpeechStarted' }),
      JSON.stringify({ action: 'ChatbotSpeechEnded' })
    ]);
  });
});

describe('MockAnimazeServer', () => {
  it('records a valid command and answers with the speech cycle', () => {
    const server = createMockServer();
    const socket = server.createSocket().open();
    const { frames } = collect(socket);

    socket.send(buildCommandFrame('  Hello  ', { priority: 1 }));

    expect(server.commands).toEqual([
      { action: 'ChatbotSendMessage', message: 'Hello', priority: 1 }
    ]);
    expect(frames).toEqual([
      JSON.stringify({ action: 'ChatbotSpeechStarted' }),
      JSON.stringify({ action: 'ChatbotSpeechEnded' })
    ]);
    expect(server.events).toEqual(frames);
  });

  it('answers a command carrying an id with a correlated response frame', () => {
    const server = createMockServer();
    const socket = server.createSocket().open();
    const { frames } = collect(socket);

    socket.send(buildCommandFrame('Hi', { requestId: 'sidekick_1_x' }));

    expect(JSON.parse(frames[0])).toEqual({ id: 'sidekick_1_x', ok: true });
  });

  it('counts malformed input and replies with an error frame', () => {
    const server = createMockServer();
    const socket = server.createSocket().open();
    const { frames } = collect(socket);

    socket.send('{not valid json');
    socket.send(JSON.stringify({ action: 'ChatbotSendMessage' }));
    socket.send(JSON.stringify({ nope: true }));

    expect(server.malformedMessages).toBe(3);
    expect(server.commands).toEqual([]);
    expect(frames).toEqual([
      JSON.stringify({ error: 'malformed command' }),
      JSON.stringify({ error: 'malformed command' }),
      JSON.stringify({ error: 'malformed command' })
    ]);
  });

  it('can stay silent on malformed input', () => {
    const server = createMockServer({ respondOnMalformed: false });
    const socket = server.createSocket().open();
    const { frames } = collect(socket);
    socket.send('garbage');
    expect(server.malformedMessages).toBe(1);
    expect(frames).toEqual([]);
  });

  it('does not answer when autoRespond is disabled', () => {
    const server = createMockServer({ autoRespond: false });
    const socket = server.createSocket().open();
    const { frames } = collect(socket);
    socket.send(buildCommandFrame('Hi'));
    expect(server.commands).toHaveLength(1);
    expect(frames).toEqual([]);
  });

  it('injects a server-side error frame via failMode=error', () => {
    const server = createMockServer({ failMode: 'error' });
    const socket = server.createSocket().open();
    const { frames } = collect(socket);
    socket.send(buildCommandFrame('Hi'));
    expect(frames).toEqual([JSON.stringify({ error: 'mock server error' })]);
    expect(server.commands).toEqual([]);
  });

  it('injects a server-initiated close via failMode=close', () => {
    const server = createMockServer({ failMode: 'close' });
    const socket = server.createSocket().open();
    const onClose = jest.fn();
    socket.on('close', onClose);
    socket.send(buildCommandFrame('Hi'));
    expect(onClose).toHaveBeenCalledWith(1011, 'mock server close');
    expect(server.closedConnections).toBe(1);
    expect(server.commands).toEqual([]);
  });

  it('opens sockets automatically when connectBehavior=open', async () => {
    const server = createMockServer({ connectBehavior: 'open' });
    const socket = server.createSocket();
    await flushImmediate();
    expect(socket.isOpen).toBe(true);
  });

  it('fails the connection when connectBehavior=refuse', async () => {
    const server = createMockServer({ connectBehavior: 'refuse' });
    const socket = server.createSocket();
    const onError = jest.fn();
    socket.on('error', onError);
    await flushImmediate();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('stays connecting when connectBehavior=stall', async () => {
    const server = createMockServer({ connectBehavior: 'stall' });
    const socket = server.createSocket();
    await flushImmediate();
    expect(socket.readyState).toBe(SOCKET_STATE.CONNECTING);
  });

  it('forwards logger calls', () => {
    const logger = jest.fn();
    const server = createMockServer({ logger });
    const socket = server.createSocket().open();
    socket.send('garbage');
    expect(logger).toHaveBeenCalledWith('warn', expect.stringContaining('malformed'));
  });

  it('resets all recorded state', () => {
    const server = createMockServer();
    const socket = server.createSocket().open();
    socket.send(buildCommandFrame('Hi'));
    socket.send('garbage');
    server.reset();
    expect(server.commands).toEqual([]);
    expect(server.rawMessages).toEqual([]);
    expect(server.events).toEqual([]);
    expect(server.sockets).toEqual([]);
    expect(server.malformedMessages).toBe(0);
  });

  it('exposes a bound socket factory and speak helper', () => {
    const server = new MockAnimazeServer();
    const socket = server.openSocket();
    const { frames } = collect(socket);
    server.speak(socket);
    expect(socket.isOpen).toBe(true);
    expect(frames).toHaveLength(2);
  });
});

describe('createMockSocketFactory / buildCommandFrame', () => {
  it('returns a factory bound to the created server', () => {
    const { server, factory } = createMockSocketFactory();
    const socket = factory('ws://127.0.0.1:9000');
    expect(server).toBeInstanceOf(MockAnimazeServer);
    expect(server.sockets).toContain(socket);
  });

  it('accepts an existing server instance', () => {
    const server = createMockServer();
    const { server: returned } = createMockSocketFactory(server);
    expect(returned).toBe(server);
  });

  it('builds a JSON command frame', () => {
    expect(JSON.parse(buildCommandFrame('Hi', { priority: 2 }))).toEqual({
      action: 'ChatbotSendMessage',
      message: 'Hi',
      priority: 2
    });
  });
});
