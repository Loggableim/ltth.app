/**
 * Unit tests for the Sidekick AnimazeClient (queue + speech pacing on top of
 * the mocked Animaze transport).
 */

const EventEmitter = require('events');

const { AnimazeClient } = require('../backend/animazeClient');
const { ANIMAZE_ACTIONS } = require('../backend/animazeTransport');

function createMockApi() {
  return {
    log: jest.fn(),
    getConfig: jest.fn(),
    setConfig: jest.fn()
  };
}

class MockSocket extends EventEmitter {
  constructor() {
    super();
    this.sent = [];
    this.readyState = 1;
  }

  send(message) {
    this.sent.push(message);
  }

  close() {
    this.readyState = 3;
  }

  openSocket() {
    this.emit('open');
  }
}

function baseConfig(overrides = {}) {
  return {
    style: { maxLineLength: 140 },
    speech: { waitStartTimeoutMs: 1, maxSpeechMs: 5, postGapMs: 1 },
    animaze: { host: '127.0.0.1', port: 9000, reconnectOnDisconnect: false },
    ...overrides
  };
}

function createClient(options = {}) {
  const api = createMockApi();
  const sockets = [];
  const socketFactory = () => {
    const socket = new MockSocket();
    sockets.push(socket);
    return socket;
  };
  const client = new AnimazeClient(api, baseConfig(), { socketFactory, ...options });
  return { api, client, sockets };
}

describe('AnimazeClient', () => {
  let client;

  afterEach(() => {
    if (client) {
      client.destroy();
      client = null;
    }
  });

  it('shares the speech state with the underlying transport', () => {
    const created = createClient();
    client = created.client;
    expect(client.speechState).toBe(client.transport.speechState);
  });

  it('rejects empty messages', async () => {
    const created = createClient();
    client = created.client;
    await expect(client.sendMessage('   ')).resolves.toBe(false);
    expect(client.messageQueue).toHaveLength(0);
  });

  it('truncates and echoes queued messages', async () => {
    const created = createClient();
    client = created.client;
    client.updateConfig(baseConfig({ style: { maxLineLength: 10 } }));

    await client.sendMessage('abcdefghijklmnop', true);
    expect(client.messageQueue).toHaveLength(1);
    expect(client.messageQueue[0].text.startsWith('-echo ')).toBe(true);
    expect(client.messageQueue[0].text.endsWith('…')).toBe(true);
  });

  it('queues messages without crashing when Animaze is unreachable', async () => {
    const api = createMockApi();
    client = new AnimazeClient(api, baseConfig(), { socketFactory: () => null });

    await expect(client.sendMessage('Hallo', false, 1)).resolves.toBe(true);
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(client.isConnected).toBe(false);
    expect(client.messageQueue).toHaveLength(1);
  });

  it('sends a queued message once connected', async () => {
    const created = createClient();
    client = created.client;

    const connectPromise = client.connect();
    created.sockets[0].openSocket();
    await connectPromise;

    await client.sendMessage('Hallo ChatPal');
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(created.sockets[0].sent).toHaveLength(1);
    const command = JSON.parse(created.sockets[0].sent[0]);
    expect(command.action).toBe(ANIMAZE_ACTIONS.SEND_MESSAGE);
    expect(command.message).toBe('Hallo ChatPal');
  });

  it('reports status including the queue length', () => {
    const created = createClient();
    client = created.client;
    const status = client.getStatus();
    expect(status.driver).toBe('animaze');
    expect(status.isConnected).toBe(false);
    expect(status.queueLength).toBe(0);
    expect(status.stats).toBeDefined();
  });

  it('propagates config updates to the transport', () => {
    const created = createClient();
    client = created.client;
    const next = baseConfig({ animaze: { host: '10.0.0.9', port: 9100 } });
    client.updateConfig(next);
    expect(client.transport.getUri()).toBe('ws://10.0.0.9:9100');
  });

  it('cleans up the queue and listeners on destroy', () => {
    const created = createClient();
    client = created.client;
    client.messageQueue.push({ text: 'x', priority: 1 });
    client.destroy();
    expect(client.messageQueue).toHaveLength(0);
    expect(client.transport.listenerCount('speech-ended')).toBe(0);
  });
});
