const DeepgramLiveSessionManager = require('../plugins/stt-ticker/backend/asr/deepgram-live-session');

function createConnection() {
  const handlers = {};
  return {
    on: jest.fn((event, handler) => { handlers[event] = handler; }),
    connect: jest.fn(),
    waitForOpen: jest.fn().mockResolvedValue(),
    sendMedia: jest.fn(),
    sendKeepAlive: jest.fn(),
    sendFinalize: jest.fn(),
    sendCloseStream: jest.fn(),
    close: jest.fn(),
    emit(event, payload) { return handlers[event]?.(payload); }
  };
}

function resultMessage(text, options = {}) {
  const start = options.start || 0;
  return {
    type: 'Results',
    start,
    duration: 0.5,
    is_final: options.isFinal === true,
    speech_final: options.speechFinal === true,
    channel: {
      detected_language: 'de',
      alternatives: [{
        transcript: text,
        confidence: 0.95,
        words: [{
          word: text,
          punctuated_word: text,
          start,
          end: start + 0.5,
          confidence: 0.95
        }]
      }]
    }
  };
}

function createHarness(overrides = {}) {
  const connections = overrides.connections || [createConnection()];
  const connect = jest.fn()
    .mockImplementation(() => Promise.resolve(connections.shift()));
  const socket = { id: 'capture-1', once: jest.fn(), emit: jest.fn() };
  const callbacks = {
    onInterim: overrides.onInterim || jest.fn(),
    onFinal: overrides.onFinal || jest.fn(),
    onStatus: overrides.onStatus || jest.fn()
  };
  const manager = new DeepgramLiveSessionManager({
    getConfig: () => overrides.config || ({
      asr: { deepgramModel: 'nova-2', languageMode: 'fixed', languageFixed: 'de' },
      silenceTimeoutMs: 900,
      vad: { sustainedSilenceMs: 1500 }
    }),
    getApiKey: () => 'test-key',
    clientFactory: () => ({ listen: { v1: { connect } } }),
    ...callbacks,
    logger: { info() {}, warn() {}, error() {}, debug() {} }
  });
  return { manager, connect, socket, ...callbacks };
}

describe('STT Ticker Deepgram live session manager', () => {
  test.each([
    ['nova-3', 'multi'],
    ['nova-2', 'de']
  ])('uses %s with %s in auto-language mode', async (model, expectedLanguage) => {
    const connection = createConnection();
    const { manager, connect, socket } = createHarness({
      connections: [connection],
      config: {
        asr: {
          deepgramModel: model,
          languageMode: 'auto',
          languageDefault: 'de'
        }
      }
    });

    await manager.start(socket, { sampleRate: 16000, channels: 1 });

    expect(connect).toHaveBeenCalledWith(expect.objectContaining({
      model,
      language: expectedLanguage
    }));
    await manager.destroy();
  });

  test('isolates audio by socket and configures a Linear16 live stream', async () => {
    const connection = createConnection();
    const { manager, connect, socket } = createHarness({ connections: [connection] });

    await manager.start(socket, { sampleRate: 16000, channels: 1 });
    const accepted = manager.sendAudio('capture-1', Buffer.from([1, 2]));
    const rejected = manager.sendAudio('capture-2', Buffer.from([3, 4]));

    expect(connect).toHaveBeenCalledWith(expect.objectContaining({
      model: 'nova-2',
      language: 'de',
      encoding: 'linear16',
      sample_rate: 16000,
      channels: 1,
      interim_results: true,
      endpointing: 900,
      utterance_end_ms: '1500',
      reconnectAttempts: 0
    }));
    expect(connection.connect).toHaveBeenCalledTimes(1);
    expect(connection.waitForOpen).toHaveBeenCalledTimes(1);
    expect(connection.sendMedia).toHaveBeenCalledWith(expect.any(Buffer));
    expect(accepted).toBe(true);
    expect(rejected).toBe(false);
    await manager.destroy();
  });

  test('emits interim text and flushes accumulated final fragments once', async () => {
    const connection = createConnection();
    const onInterim = jest.fn();
    const onFinal = jest.fn();
    const { manager, socket } = createHarness({ connections: [connection], onInterim, onFinal });
    await manager.start(socket, { sampleRate: 16000, channels: 1 });

    connection.emit('message', resultMessage('Hallo', { start: 0 }));
    connection.emit('message', resultMessage('Hallo', { isFinal: true, start: 0 }));
    connection.emit('message', resultMessage('Welt.', { isFinal: true, speechFinal: true, start: 0.5 }));
    connection.emit('message', { type: 'UtteranceEnd', last_word_end: 1.2 });

    expect(onInterim).toHaveBeenCalledWith('capture-1', expect.objectContaining({
      text: 'Hallo',
      provider: 'deepgram',
      isFinal: false
    }));
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith('capture-1', expect.objectContaining({
      text: 'Hallo Welt.',
      provider: 'deepgram',
      language: 'de'
    }));
    await manager.destroy();
  });

  test('stops and replaces an existing socket session without accepting stale results', async () => {
    const oldConnection = createConnection();
    const newConnection = createConnection();
    const onFinal = jest.fn();
    const { manager, socket } = createHarness({
      connections: [oldConnection, newConnection],
      onFinal
    });

    await manager.start(socket, { sampleRate: 16000, channels: 1 });
    await manager.start(socket, { sampleRate: 48000, channels: 1 });
    oldConnection.emit('message', resultMessage('Alt', { isFinal: true, speechFinal: true }));
    newConnection.emit('message', resultMessage('Neu', { isFinal: true, speechFinal: true }));

    expect(oldConnection.sendFinalize).toHaveBeenCalledWith({ type: 'Finalize' });
    expect(oldConnection.sendCloseStream).toHaveBeenCalledWith({ type: 'CloseStream' });
    expect(oldConnection.close).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith('capture-1', expect.objectContaining({ text: 'Neu' }));
    await manager.destroy();
  });

  test('rejects invalid input format and never exposes the API key in status', async () => {
    const { manager, socket } = createHarness();

    await expect(manager.start(socket, { sampleRate: 7999, channels: 1 }))
      .rejects.toThrow('sample rate');
    await expect(manager.start(socket, { sampleRate: 16000, channels: 2 }))
      .rejects.toThrow('one audio channel');
    expect(JSON.stringify(manager.getStatus())).not.toContain('test-key');
    await manager.destroy();
  });

  test('finalizes an open utterance without closing the live connection', async () => {
    const connection = createConnection();
    const { manager, socket } = createHarness({ connections: [connection] });
    await manager.start(socket, { sampleRate: 16000, channels: 1 });

    expect(manager.finalize('capture-1')).toBe(true);
    expect(connection.sendFinalize).toHaveBeenCalledWith({ type: 'Finalize' });
    expect(connection.sendCloseStream).not.toHaveBeenCalled();
    await manager.destroy();
  });
});

describe('STT Ticker Deepgram live session recovery', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('recovers after a close and accepts audio on the reopened connection', async () => {
    const first = createConnection();
    const reopened = createConnection();
    const { manager, socket, onStatus } = createHarness({ connections: [first, reopened] });

    await manager.start(socket, { sampleRate: 16000, channels: 1 });
    first.emit('close', { code: 1006 });
    expect(manager.sendAudio(socket.id, Buffer.from([1]))).toBe(false);

    await jest.advanceTimersByTimeAsync(1000);

    expect(reopened.connect).toHaveBeenCalledTimes(1);
    expect(manager.sendAudio(socket.id, Buffer.from([1, 2]))).toBe(true);
    expect(onStatus).toHaveBeenCalledWith(socket.id, expect.objectContaining({
      state: 'reconnecting', reconnectAttempt: 1, nextRetryMs: 1000
    }));
    expect(onStatus).toHaveBeenCalledWith(socket.id, expect.objectContaining({
      state: 'open', reconnectAttempt: 0, nextRetryMs: null
    }));
    await manager.destroy();
  });

  test('flushes and disposes a failed connection before accepting reused timestamps after recovery', async () => {
    const first = createConnection();
    const reopened = createConnection();
    const onFinal = jest.fn();
    const { manager, connect, socket } = createHarness({
      connections: [first, reopened],
      onFinal
    });

    await manager.start(socket, { sampleRate: 16000, channels: 1 });
    first.emit('message', resultMessage('Vorher', { isFinal: true, start: 0 }));
    first.emit('error', new Error('connection failed'));

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenLastCalledWith(socket.id, expect.objectContaining({ text: 'Vorher' }));

    first.emit('message', resultMessage('Veraltet', { isFinal: true, speechFinal: true, start: 0 }));
    await jest.advanceTimersByTimeAsync(1000);

    expect(reopened.connect).toHaveBeenCalledTimes(1);
    expect(first.close.mock.invocationCallOrder[0]).toBeLessThan(reopened.connect.mock.invocationCallOrder[0]);

    reopened.emit('message', resultMessage('Nachher', { isFinal: true, speechFinal: true, start: 0 }));
    first.emit('message', resultMessage('Noch veraltet', { isFinal: true, speechFinal: true, start: 0 }));
    first.emit('close', { code: 1006 });
    first.emit('error', new Error('late stale error'));
    await jest.advanceTimersByTimeAsync(5000);

    expect(connect).toHaveBeenCalledTimes(2);
    expect(onFinal).toHaveBeenCalledTimes(2);
    expect(onFinal.mock.calls.map(([, payload]) => payload.text)).toEqual(['Vorher', 'Nachher']);
    await manager.destroy();
  });

  test('removes the session after three failed recovery attempts', async () => {
    const first = createConnection();
    const { manager, socket, onStatus } = createHarness({ connections: [first, null, null, null] });

    await manager.start(socket, { sampleRate: 16000, channels: 1 });
    first.emit('close', { code: 1006 });
    await jest.advanceTimersByTimeAsync(1000);
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(5000);

    expect(manager.getStatus().activeSessions).toBe(0);
    expect(onStatus).toHaveBeenCalledWith(socket.id, expect.objectContaining({
      state: 'error', reconnectAttempt: 3, nextRetryMs: null
    }));
  });

  test('clears recovery timers when stopped or destroyed', async () => {
    const first = createConnection();
    const { manager, socket } = createHarness({ connections: [first] });

    await manager.start(socket, { sampleRate: 16000, channels: 1 });
    first.emit('close', { code: 1006 });
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    await manager.stop(socket.id);
    expect(jest.getTimerCount()).toBe(0);

    const second = createConnection();
    const harness = createHarness({ connections: [second] });
    await harness.manager.start(harness.socket, { sampleRate: 16000, channels: 1 });
    second.emit('close', { code: 1006 });
    await harness.manager.destroy();
    expect(jest.getTimerCount()).toBe(0);
  });
});
