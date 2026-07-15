# STT Ticker Deepgram Live SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace STT Ticker's broken hand-written Deepgram HTTP transport with the official Deepgram SDK, use a persistent Deepgram WebSocket for capture, retain Fish.audio and ElevenLabs chunk uploads, and apply the existing silence filter to both paths.

**Architecture:** The browser keeps microphone ownership and routes audio by the effective provider. Fish.audio and ElevenLabs keep posting VAD-approved WAV chunks; Deepgram sends VAD-gated Linear16 frames over Socket.IO to a server-owned SDK session. The backend broadcasts interim text ephemerally and sends only final utterances through the existing language, translation, buffer, overlay, and VRChat pipeline.

**Tech Stack:** Node.js 18-24 CommonJS, Node 22 maintained runtime, `@deepgram/sdk` 5.5.0, Socket.IO 4, Jest 29, browser Web Audio API.

## Global Constraints

- Keep changes scoped to `app/plugins/stt-ticker`, `app/package.json`, `app/package-lock.json`, and focused `app/test` files.
- Use CommonJS and 2-space JavaScript indentation.
- Keep the Deepgram API key server-side and never print or return it.
- Fish.audio and ElevenLabs must retain their existing WAV chunk behavior.
- Deepgram capture must use `listen.v1.connect()` and `V1Socket.sendMedia()` rather than repeated prerecorded HTTP calls.
- Apply configured `vad.rmsThreshold`, `vad.minSpeechRatio`, `vad.minChunkMs`, and `vad.sustainedSilenceMs` on both provider paths.
- Interim text is display-only; only final text reaches translation, the persistent buffer, or VRChat.
- Preserve unrelated dirty-worktree changes and stage only task-specific files.

## File Structure

### New production files

- `app/plugins/stt-ticker/backend/asr/deepgram-live-session.js`: SDK WebSocket sessions, keepalive, result assembly, lifecycle, and per-socket isolation.
- `app/plugins/stt-ticker/capture-audio.js`: browser/Node-compatible pure PCM conversion and Deepgram VAD gate.

### Modified production files

- `app/plugins/stt-ticker/backend/asr/deepgram-client.js`: SDK-backed prerecorded compatibility adapter and SDK auth test.
- `app/plugins/stt-ticker/backend/asr-pipeline.js`: expose common normalization for uploaded and live provider results.
- `app/plugins/stt-ticker/main.js`: initialize live sessions, register socket events, share final transcript processing, mask secrets, and serve the capture helper.
- `app/plugins/stt-ticker/capture.html`: choose live versus chunk transport and send VAD-approved Linear16 frames.
- `app/plugins/stt-ticker/overlay/ticker.html`: render and replace ephemeral interim captions.
- `app/plugins/stt-ticker/ui.html`: preserve masked keys with `__KEEP__` and stop depending on returned secrets.
- `app/package.json`, `app/package-lock.json`: pin `@deepgram/sdk` 5.5.0.

### New tests

- `app/test/stt-ticker-deepgram-sdk-client.test.js`
- `app/test/stt-ticker-deepgram-live-session.test.js`
- `app/test/stt-ticker-live-transcript-processing.test.js`
- `app/test/stt-ticker-capture-audio.test.js`
- `app/test/stt-ticker-deepgram-capture-routing.test.js`
- `app/test/stt-ticker-interim-overlay.test.js`
- `app/test/stt-ticker-secret-masking.test.js`

---

### Task 1: Replace the Deepgram HTTP client with the SDK adapter

**Files:**
- Modify: `app/package.json`
- Modify: `app/package-lock.json`
- Modify: `app/plugins/stt-ticker/backend/asr/deepgram-client.js`
- Create: `app/test/stt-ticker-deepgram-sdk-client.test.js`

**Interfaces:**
- Consumes: `Buffer` audio and the existing `{ mimeType, filename, language, model }` options.
- Produces: `DeepgramAsrClient.transcribe(audioBuffer, options) -> Promise<{ text, segments, duration, language, confidence, provider, model, requestId }>`.
- Produces: `DeepgramAsrClient.testConnection() -> Promise<{ ok, status, message? }>`.

- [ ] **Step 1: Install the exact official SDK dependency**

Run:

```powershell
cd app
npm install --save-exact @deepgram/sdk@5.5.0
```

Expected: `app/package.json` contains `"@deepgram/sdk": "5.5.0"`; lockfile resolves the SDK and its `ws` dependency without audit errors introduced by this package.

- [ ] **Step 2: Write failing SDK adapter tests**

Create tests using an injected SDK client so no network call occurs:

```js
const DeepgramAsrClient = require('../plugins/stt-ticker/backend/asr/deepgram-client');

function createSdkClient() {
  return {
    listen: {
      v1: {
        media: {
          transcribeFile: jest.fn().mockResolvedValue({
            metadata: { request_id: 'request-1', duration: 1.25 },
            results: {
              channels: [{
                detected_language: 'de',
                alternatives: [{
                  transcript: 'Hallo Deepgram.',
                  confidence: 0.97,
                  words: [{ word: 'Hallo', punctuated_word: 'Hallo', start: 0, end: 0.4, confidence: 0.98 }]
                }]
              }]
            }
          })
        }
      }
    },
    auth: {
      v1: {
        tokens: {
          grant: jest.fn().mockResolvedValue({ access_token: 'not-returned' })
        }
      }
    }
  };
}

test('uses the SDK file transcription API with supported options', async () => {
  const sdk = createSdkClient();
  const client = new DeepgramAsrClient('test-key', null, { clientFactory: () => sdk });

  const result = await client.transcribe(Buffer.from([1, 2, 3]), {
    mimeType: 'audio/wav',
    filename: 'speech.wav',
    language: 'de',
    model: 'nova-2'
  });

  expect(sdk.listen.v1.media.transcribeFile).toHaveBeenCalledWith(
    expect.any(Buffer),
    expect.objectContaining({ model: 'nova-2', language: 'de', smart_format: true, punctuate: true })
  );
  const options = sdk.listen.v1.media.transcribeFile.mock.calls[0][1];
  expect(options).not.toHaveProperty('threshold');
  expect(options).not.toHaveProperty('encoding');
  expect(result).toMatchObject({ text: 'Hallo Deepgram.', provider: 'deepgram', requestId: 'request-1' });
});

test('tests credentials through the SDK without returning a token', async () => {
  const sdk = createSdkClient();
  const client = new DeepgramAsrClient('test-key', null, { clientFactory: () => sdk });

  await expect(client.testConnection()).resolves.toEqual({ ok: true, status: 200 });
});
```

- [ ] **Step 3: Run the tests and verify RED**

Run:

```powershell
cd app
npm test -- --runInBand test/stt-ticker-deepgram-sdk-client.test.js
```

Expected: FAIL because the current client ignores `clientFactory`, calls Axios, and uses `/v1/usage`.

- [ ] **Step 4: Implement the SDK adapter**

Replace Axios/FormData construction with the SDK while preserving parsing helpers and model metadata:

```js
const { DeepgramClient, DeepgramError } = require('@deepgram/sdk');

constructor(apiKey, logger, config = {}) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Deepgram API key is required');
  }
  this.apiKey = apiKey.trim();
  this.logger = logger || { info() {}, warn() {}, error() {}, debug() {} };
  this.timeout = this._resolveTimeout(config.timeout, 30000);
  this.maxAudioBytes = this._resolveMaxAudioBytes(config.maxAudioBytes);
  this.clientFactory = config.clientFactory || ((key) => new DeepgramClient({ apiKey: key }));
}

async transcribe(audioBuffer, options = {}) {
  this._validateAudio(audioBuffer);
  try {
    const client = this.clientFactory(this.apiKey);
    const data = await client.listen.v1.media.transcribeFile(audioBuffer, {
      model: options.model || 'nova-2',
      language: options.language === 'auto' ? 'multi' : (options.language || 'multi'),
      smart_format: true,
      punctuate: true,
      utterances: true,
      utt_split: 1,
      timeoutInSeconds: Math.ceil(this.timeout / 1000),
      maxRetries: 1
    });
    return this._parseResponse(data, options.model || 'nova-2');
  } catch (error) {
    throw this._normalizeSdkError(error, DeepgramError);
  }
}

_validateAudio(audioBuffer) {
  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    throw new Error('Deepgram ASR audio must be a non-empty Buffer');
  }
  if (audioBuffer.length > this.maxAudioBytes) {
    throw new Error(`Deepgram ASR audio exceeds ${this.maxAudioBytes} bytes`);
  }
}

async testConnection() {
  try {
    const client = this.clientFactory(this.apiKey);
    await client.auth.v1.tokens.grant();
    return { ok: true, status: 200 };
  } catch (error) {
    const normalized = this._normalizeSdkError(error, DeepgramError);
    return { ok: false, status: normalized.deepgramStatus || null, message: normalized.message };
  }
}
```

Ensure `_normalizeSdkError` includes status and a bounded message but never serializes request headers, client options, or the key.

- [ ] **Step 5: Run the adapter tests and focused existing tests**

Run:

```powershell
cd app
npm test -- --runInBand test/stt-ticker-deepgram-sdk-client.test.js test/stt-ticker-main-routing.test.js
```

Expected: PASS, 0 failed tests.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- app/package.json app/package-lock.json app/plugins/stt-ticker/backend/asr/deepgram-client.js app/test/stt-ticker-deepgram-sdk-client.test.js
git commit -m "fix(stt-ticker): use Deepgram SDK for batch ASR"
```

---

### Task 2: Build per-socket Deepgram live sessions

**Files:**
- Create: `app/plugins/stt-ticker/backend/asr/deepgram-live-session.js`
- Create: `app/test/stt-ticker-deepgram-live-session.test.js`

**Interfaces:**
- Consumes: `{ getConfig, getApiKey, logger, onInterim, onFinal, onStatus, clientFactory }`.
- Produces: `start(socket, { sampleRate, channels })`, `sendAudio(socketId, payload)`, `stop(socketId, reason)`, `destroy()`, and `getStatus()`.
- Emits final provider results with shape `{ text, segments, duration, language, confidence, provider: 'deepgram', model, requestId }`.

- [ ] **Step 1: Write failing lifecycle and assembly tests**

Use a fake SDK socket with the real v5 method names:

```js
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
  return {
    type: 'Results',
    start: options.start || 0,
    duration: 0.5,
    is_final: options.isFinal === true,
    speech_final: options.speechFinal === true,
    channel: {
      detected_language: 'de',
      alternatives: [{
        transcript: text,
        confidence: 0.95,
        words: [{ word: text, punctuated_word: text, start: options.start || 0, end: (options.start || 0) + 0.5, confidence: 0.95 }]
      }]
    }
  };
}

function createManagerHarness(overrides = {}) {
  const connection = createConnection();
  const connect = jest.fn().mockResolvedValue(connection);
  const socket = { id: 'capture-1', once: jest.fn(), emit: jest.fn() };
  const manager = new DeepgramLiveSessionManager({
    getConfig: () => ({
      asr: { deepgramModel: 'nova-2', languageMode: 'fixed', languageFixed: 'de' },
      silenceTimeoutMs: 900,
      vad: { sustainedSilenceMs: 1500 }
    }),
    getApiKey: () => 'test-key',
    clientFactory: () => ({ listen: { v1: { connect } } }),
    onInterim: overrides.onInterim || jest.fn(),
    onFinal: overrides.onFinal || jest.fn(),
    onStatus: overrides.onStatus || jest.fn(),
    logger: { info() {}, warn() {}, error() {}, debug() {} }
  });
  return { manager, connection, connect, socket };
}

test('isolates audio by socket and configures a Linear16 live stream', async () => {
  const connection = createConnection();
  const connect = jest.fn().mockResolvedValue(connection);
  const manager = new DeepgramLiveSessionManager({
    getConfig: () => ({
      asr: { deepgramModel: 'nova-2', languageMode: 'fixed', languageFixed: 'de' },
      silenceTimeoutMs: 900,
      vad: { sustainedSilenceMs: 1500 }
    }),
    getApiKey: () => 'test-key',
    clientFactory: () => ({ listen: { v1: { connect } } }),
    onInterim: jest.fn(),
    onFinal: jest.fn(),
    onStatus: jest.fn(),
    logger: { info() {}, warn() {}, error() {}, debug() {} }
  });
  const socket = { id: 'capture-1', once: jest.fn(), emit: jest.fn() };

  await manager.start(socket, { sampleRate: 16000, channels: 1 });
  manager.sendAudio('capture-1', Buffer.from([1, 2]));
  manager.sendAudio('capture-2', Buffer.from([3, 4]));

  expect(connect).toHaveBeenCalledWith(expect.objectContaining({
    model: 'nova-2', language: 'de', encoding: 'linear16', sample_rate: 16000,
    channels: 1, interim_results: true, endpointing: 900, utterance_end_ms: '1500'
  }));
  expect(connection.sendMedia).toHaveBeenCalledTimes(1);
});

test('emits interim text and flushes accumulated final fragments once', async () => {
  const onInterim = jest.fn();
  const onFinal = jest.fn();
  const { manager, connection, socket } = createManagerHarness({ onInterim, onFinal });
  await manager.start(socket, { sampleRate: 16000, channels: 1 });

  connection.emit('message', resultMessage('Hallo', { isFinal: false, start: 0 }));
  connection.emit('message', resultMessage('Hallo', { isFinal: true, start: 0 }));
  connection.emit('message', resultMessage('Welt.', { isFinal: true, speechFinal: true, start: 0.5 }));
  connection.emit('message', { type: 'UtteranceEnd', last_word_end: 1.2 });

  expect(onInterim).toHaveBeenCalledWith('capture-1', expect.objectContaining({ text: 'Hallo' }));
  expect(onFinal).toHaveBeenCalledTimes(1);
  expect(onFinal).toHaveBeenCalledWith('capture-1', expect.objectContaining({ text: 'Hallo Welt.' }));
});
```

- [ ] **Step 2: Run the live-session test and verify RED**

Run:

```powershell
cd app
npm test -- --runInBand test/stt-ticker-deepgram-live-session.test.js
```

Expected: FAIL with module-not-found for `deepgram-live-session.js`.

- [ ] **Step 3: Implement the session manager**

Use SDK v5 control methods exactly:

```js
const { DeepgramClient } = require('@deepgram/sdk');

class DeepgramLiveSessionManager {
  constructor(options) {
    this.getConfig = options.getConfig;
    this.getApiKey = options.getApiKey;
    this.logger = options.logger;
    this.onInterim = options.onInterim;
    this.onFinal = options.onFinal;
    this.onStatus = options.onStatus;
    this.clientFactory = options.clientFactory || ((key) => new DeepgramClient({ apiKey: key, reconnect: true }));
    this.sessions = new Map();
    this.generation = 0;
  }

  async start(socket, input = {}) {
    await this.stop(socket.id, 'replaced');
    const sampleRate = Number(input.sampleRate);
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
      throw new Error('Deepgram sample rate must be between 8000 and 192000 Hz');
    }
    if (input.channels !== undefined && Number(input.channels) !== 1) {
      throw new Error('Deepgram capture supports one audio channel');
    }
    const session = this._createSession(socket, input, ++this.generation);
    this.sessions.set(socket.id, session);
    socket.once('disconnect', () => this.stop(socket.id, 'socket-disconnect'));
    const client = this.clientFactory(this.getApiKey());
    session.connection = await client.listen.v1.connect(this._buildConnectOptions(input));
    this._bindConnection(session);
    session.connection.connect();
    await session.connection.waitForOpen();
    session.open = true;
    session.keepAliveTimer = setInterval(() => this._keepAlive(session), 5000);
    this.onStatus(socket.id, { state: 'open' });
    return { ok: true, state: 'open' };
  }

  sendAudio(socketId, payload) {
    const session = this.sessions.get(socketId);
    const audio = Buffer.isBuffer(payload) ? payload : Buffer.from(payload || []);
    if (!session?.open || audio.length === 0 || audio.length > 256 * 1024) return false;
    session.lastAudioAt = Date.now();
    session.connection.sendMedia(audio);
    return true;
  }

  _createSession(socket, input, generation) {
    return {
      socket,
      socketId: socket.id,
      generation,
      input,
      connection: null,
      open: false,
      keepAliveTimer: null,
      lastAudioAt: 0,
      finalParts: new Map(),
      requestId: null
    };
  }

  _buildConnectOptions(input) {
    const config = this.getConfig();
    const asr = config.asr || {};
    const language = asr.languageMode === 'fixed' ? asr.languageFixed : 'multi';
    return {
      model: asr.deepgramModel || 'nova-2',
      language: language || 'multi',
      encoding: 'linear16',
      sample_rate: Number(input.sampleRate),
      channels: 1,
      interim_results: true,
      punctuate: true,
      smart_format: true,
      vad_events: true,
      endpointing: Math.max(10, Number(config.silenceTimeoutMs) || 900),
      utterance_end_ms: String(Math.max(1000, Number(config.vad?.sustainedSilenceMs) || 1500)),
      reconnectAttempts: 3,
      connectionTimeoutInSeconds: 10
    };
  }

  _bindConnection(session) {
    session.connection.on('message', message => this._handleMessage(session, message));
    session.connection.on('error', error => {
      if (this._isCurrent(session)) this.onStatus(session.socketId, { state: 'error', error: error.message });
    });
    session.connection.on('close', event => {
      if (this._isCurrent(session) && session.open) {
        session.open = false;
        this.onStatus(session.socketId, { state: 'reconnecting', code: event?.code || null });
      }
    });
    session.connection.on('open', () => {
      if (this._isCurrent(session)) {
        session.open = true;
        this.onStatus(session.socketId, { state: 'open' });
      }
    });
  }

  _handleMessage(session, message) {
    if (!this._isCurrent(session) || !message) return;
    if (message.type === 'Metadata') {
      session.requestId = message.request_id || session.requestId;
      return;
    }
    if (message.type === 'UtteranceEnd') {
      this._flushFinal(session);
      return;
    }
    if (message.type !== 'Results') return;
    const alternative = message.channel?.alternatives?.[0];
    const text = String(alternative?.transcript || '').trim();
    if (!text) return;
    const key = `${Number(message.start) || 0}:${Number(message.duration) || 0}`;
    if (message.is_final) session.finalParts.set(key, { message, alternative, text });
    const stable = Array.from(session.finalParts.values()).map(part => part.text);
    const display = message.is_final ? stable.join(' ') : [...stable, text].join(' ');
    if (!message.speech_final) {
      this.onInterim(session.socketId, { text: display, provider: 'deepgram' });
    }
    if (message.speech_final) this._flushFinal(session);
  }

  _flushFinal(session) {
    if (session.finalParts.size === 0) return;
    const parts = Array.from(session.finalParts.values());
    session.finalParts.clear();
    const confidenceValues = parts.map(part => part.alternative.confidence).filter(Number.isFinite);
    const finalResult = {
      text: parts.map(part => part.text).join(' '),
      segments: parts.map(part => ({
        text: part.text,
        start: Number(part.message.start) || 0,
        end: (Number(part.message.start) || 0) + (Number(part.message.duration) || 0),
        confidence: part.alternative.confidence
      })),
      duration: parts.reduce((sum, part) => sum + (Number(part.message.duration) || 0), 0),
      language: parts.at(-1)?.message.channel?.detected_language || null,
      confidence: confidenceValues.length ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length : null,
      provider: 'deepgram',
      model: this.getConfig().asr?.deepgramModel || 'nova-2',
      requestId: session.requestId
    };
    Promise.resolve(this.onFinal(session.socketId, finalResult)).catch(error => {
      this.logger.error(`STT Ticker: Deepgram final handling failed: ${error.message}`);
    });
  }

  _keepAlive(session) {
    if (this._isCurrent(session) && session.open && Date.now() - session.lastAudioAt >= 4000) {
      session.connection.sendKeepAlive({ type: 'KeepAlive' });
    }
  }

  _isCurrent(session) {
    return this.sessions.get(session.socketId)?.generation === session.generation;
  }

  async stop(socketId, reason = 'stopped') {
    const session = this.sessions.get(socketId);
    if (!session) return;
    this.sessions.delete(socketId);
    if (session.keepAliveTimer) clearInterval(session.keepAliveTimer);
    if (session.open) {
      session.connection.sendFinalize({ type: 'Finalize' });
      this._flushFinal(session);
      session.connection.sendCloseStream({ type: 'CloseStream' });
    }
    session.connection?.close();
    this.onStatus(socketId, { state: 'stopped', reason });
  }

  getStatus() {
    const sessions = Array.from(this.sessions.values());
    return {
      activeSessions: sessions.length,
      openSessions: sessions.filter(session => session.open).length
    };
  }

  async destroy() {
    await Promise.all(Array.from(this.sessions.keys()).map(socketId => this.stop(socketId, 'destroy')));
  }
}
```

Implement `_bindConnection` to parse `Results`, aggregate unique final fragments by `start`, emit display-only interim text, and flush once on `speech_final` or `UtteranceEnd`. Use `sendKeepAlive({ type: 'KeepAlive' })`, `sendFinalize({ type: 'Finalize' })`, and `sendCloseStream({ type: 'CloseStream' })`. Always clear the keepalive timer and close the SDK socket in `stop()` and `destroy()`.

- [ ] **Step 4: Run the live-session tests and verify GREEN**

Run:

```powershell
cd app
npm test -- --runInBand test/stt-ticker-deepgram-live-session.test.js
```

Expected: PASS, including per-socket isolation, keepalive, interim/final assembly, stop, disconnect, and destroy cases.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- app/plugins/stt-ticker/backend/asr/deepgram-live-session.js app/test/stt-ticker-deepgram-live-session.test.js
git commit -m "feat(stt-ticker): add Deepgram live sessions"
```

---

### Task 3: Integrate live sessions with the common transcript pipeline

**Files:**
- Modify: `app/plugins/stt-ticker/backend/asr-pipeline.js`
- Modify: `app/plugins/stt-ticker/main.js`
- Create: `app/test/stt-ticker-live-transcript-processing.test.js`

**Interfaces:**
- Consumes: final result objects emitted by `DeepgramLiveSessionManager`.
- Produces: `AsrPipeline.acceptLiveResult(result)` with the same normalized return shape as `transcribe()`.
- Produces: `SttTickerPlugin._commitTranscript(transcript, startedAt)` for both uploaded and live results.

- [ ] **Step 1: Write failing common-pipeline tests**

```js
const SttTickerPlugin = require('../plugins/stt-ticker/main');

function createPluginHarness() {
  const socketHandlers = {};
  const room = { emit: jest.fn() };
  const io = {
    emit: jest.fn(),
    to: jest.fn(() => room)
  };
  const api = {
    getSocketIO: jest.fn(() => io),
    registerSocket: jest.fn((event, handler) => { socketHandlers[event] = handler; }),
    log: jest.fn()
  };
  const plugin = new SttTickerPlugin(api);
  plugin.config = {
    enabled: true,
    minTranscriptChars: 2,
    asr: { fallbackLanguage: 'de' },
    langDetect: { enabled: true, minConfidence: 0.15, unknownPolicy: 'auto' },
    multiLanguage: { enabled: false, outputLanguages: [] },
    translation: { enabled: false },
    vrchatChatbox: { enabled: false }
  };
  plugin.asrPipeline = {
    acceptLiveResult: jest.fn(result => result),
    getStatus: jest.fn(() => ({ provider: 'deepgram' }))
  };
  plugin.textBuffer = {
    push: jest.fn(),
    getCurrent: jest.fn(() => ({ text: 'Hallo Welt.', segments: [] }))
  };
  plugin.translator = null;
  plugin.deepgramLive = {
    start: jest.fn().mockResolvedValue({ ok: true, state: 'open' }),
    sendAudio: jest.fn(),
    stop: jest.fn().mockResolvedValue()
  };
  return { plugin, socketHandlers, io, room };
}

test('does not commit interim text but commits a final live result through the buffer', async () => {
  const { plugin, socketHandlers, io } = createPluginHarness();
  plugin._registerSocketEvents();

  plugin._handleDeepgramInterim('capture-1', { text: 'Hal' });
  expect(plugin.textBuffer.push).not.toHaveBeenCalled();
  expect(io.emit).toHaveBeenCalledWith('stt-ticker:interim', { text: 'Hal', provider: 'deepgram' });

  await plugin._handleDeepgramFinal('capture-1', {
    text: 'Hallo Welt.', segments: [], provider: 'deepgram', language: 'de', confidence: 0.95
  });

  expect(plugin.textBuffer.push).toHaveBeenCalledWith(expect.objectContaining({
    text: 'Hallo Welt.', provider: 'deepgram'
  }));
  expect(io.emit).toHaveBeenCalledWith('stt-ticker:interim', expect.objectContaining({ text: '', cleared: true }));
  expect(socketHandlers).toHaveProperty('stt-ticker:deepgram-start');
  expect(socketHandlers).toHaveProperty('stt-ticker:deepgram-audio');
  expect(socketHandlers).toHaveProperty('stt-ticker:deepgram-stop');
});
```

Add a regression test that an uploaded Fish.audio result still calls the same `_commitTranscript()` and produces the existing response body.

- [ ] **Step 2: Run the integration test and verify RED**

Run:

```powershell
cd app
npm test -- --runInBand test/stt-ticker-live-transcript-processing.test.js
```

Expected: FAIL because the plugin has no live-session instance, socket handlers, or common commit method.

- [ ] **Step 3: Refactor ASR result normalization**

Move the post-provider validation/classification out of `transcribe()` without changing its behavior:

```js
acceptLiveResult(result) {
  this.diagnostics.counters.requests += 1;
  try {
    const normalized = this._normalizeProviderResult(result);
    this.diagnostics.counters.transcribed += 1;
    this.diagnostics.lastTranscriptAt = Date.now();
    this.diagnostics.lastError = null;
    this.diagnostics.lastProvider = normalized.provider;
    return normalized;
  } catch (error) {
    this.diagnostics.counters.errors += 1;
    this.diagnostics.lastError = error.message;
    throw error;
  }
}
```

`transcribe()` must call the same `_normalizeProviderResult(result)` before updating diagnostics. Preserve whitelist filtering, Unicode scrubbing, heuristic language classification, model, request ID, segments, confidence, and provider.

- [ ] **Step 4: Initialize and wire the live-session manager**

In `init()` create the manager after `AsrPipeline`:

```js
this.deepgramLive = new DeepgramLiveSessionManager({
  getConfig: () => this.config,
  getApiKey: () => this.asrPipeline.getDeepgramApiKey(),
  logger: this.logger,
  onInterim: (socketId, data) => this._handleDeepgramInterim(socketId, data),
  onFinal: (socketId, result) => this._handleDeepgramFinal(socketId, result),
  onStatus: (socketId, status) => {
    if (status.state === 'error' && status.error) this.asrPipeline.recordError(status.error);
    this.io.to(socketId).emit('stt-ticker:deepgram-status', status);
  }
});
```

Register socket handlers with acknowledgements:

```js
this.api.registerSocket('stt-ticker:deepgram-start', async (socket, input, ack) => {
  try {
    const result = await this.deepgramLive.start(socket, input || {});
    if (typeof ack === 'function') ack(result);
  } catch (error) {
    if (typeof ack === 'function') ack({ ok: false, error: error.message });
  }
});
this.api.registerSocket('stt-ticker:deepgram-audio', (socket, payload) => {
  this.deepgramLive.sendAudio(socket.id, payload);
});
this.api.registerSocket('stt-ticker:deepgram-stop', async (socket, ack) => {
  await this.deepgramLive.stop(socket.id, 'client-stop');
  if (typeof ack === 'function') ack({ ok: true });
});
```

Expose `getDeepgramApiKey()` as a public read-only accessor on `AsrPipeline`; never include its return value in status.

```js
getDeepgramApiKey() {
  return this._getDeepgramKey();
}
```

- [ ] **Step 5: Extract and reuse final transcript commit logic**

Refactor `_processAudio()` so it only obtains an ASR result and delegates:

```js
async _handleDeepgramFinal(socketId, result) {
  const transcript = this.asrPipeline.acceptLiveResult(result);
  await this._commitTranscript(transcript, Date.now());
  this.io.emit('stt-ticker:interim', { text: '', provider: 'deepgram', cleared: true });
}

_handleDeepgramInterim(socketId, data) {
  const text = String(data?.text || '').trim();
  if (!text) return;
  this.io.emit('stt-ticker:interim', { text, provider: 'deepgram' });
}
```

Use this provider-neutral method for the current lines 509-595 behavior:

```js
async _commitTranscript(transcript, startedAt) {
  const text = String(transcript.text || '').trim();
  const latencyMs = Math.max(0, Date.now() - startedAt);
  if (text.length < (this.config.minTranscriptChars || 2)) {
    return {
      output: { text, segments: transcript.segments || [], language: transcript.language || 'unknown' },
      accepted: false,
      reason: 'transcript-too-short',
      latencyMs
    };
  }

  let translation = null;
  const multiCfg = this.config.multiLanguage || {};
  const multiLanguageActive = multiCfg.enabled && Array.isArray(multiCfg.outputLanguages) && multiCfg.outputLanguages.length > 0;
  if (this.textBuffer && multiLanguageActive) {
    let routedSegments = this._routeCaptionSegments(transcript);
    if (this.translator && this.config.translation?.enabled && this.config.translation?.apiKey) {
      routedSegments = await this.translator.translateSegments(routedSegments, {
        defaultLanguage: multiCfg.defaultLanguage,
        outputLanguages: multiCfg.outputLanguages
      });
    }
    for (const segment of routedSegments) {
      this.textBuffer.push({
        text: segment.text,
        provider: transcript.provider || 'fish.audio',
        timestamp: Date.now(),
        latencyMs,
        language: segment.language,
        languageSource: segment.languageSource,
        translation: { translations: segment.translations || {} }
      });
    }
  } else if (this.textBuffer) {
    if (this.translator && this.config.translation?.enabled && this.config.translation?.apiKey) {
      try {
        translation = await this.translator.translate(text, {
          sourceLanguage: transcript.language,
          _detectedLanguage: transcript.language
        });
      } catch (error) {
        this.logger.warn(`STT Ticker translation failed: ${error.message}`);
      }
    }
    this.textBuffer.push({
      text,
      segments: transcript.segments || [],
      provider: transcript.provider || 'fish.audio',
      timestamp: Date.now(),
      latencyMs,
      language: transcript.language || 'unknown',
      languageSource: transcript.languageSource || 'fallback',
      translation
    });
  }

  const output = this.textBuffer ? this.textBuffer.getCurrent() : {
    text,
    segments: transcript.segments || [],
    translation,
    dual: null
  };
  this._emitTranscript(output);
  this._queueVrchatChatboxText(text);
  return { output, accepted: true, reason: null, latencyMs };
}
```

`_processAudio()` serializes the returned `{ output, accepted, reason, latencyMs }` into the existing HTTP response without changing its response keys.

Destroy `deepgramLive` before destroying `asrPipeline` during plugin teardown.

- [ ] **Step 6: Run focused routing and VRChat tests**

Run:

```powershell
cd app
npm test -- --runInBand test/stt-ticker-live-transcript-processing.test.js test/stt-ticker-main-routing.test.js test/stt-ticker-vrchat-chatbox.test.js
```

Expected: PASS, with no duplicate buffer or VRChat writes for interim text.

- [ ] **Step 7: Commit Task 3**

```powershell
git add -- app/plugins/stt-ticker/backend/asr-pipeline.js app/plugins/stt-ticker/main.js app/test/stt-ticker-live-transcript-processing.test.js
git commit -m "feat(stt-ticker): route Deepgram live transcripts"
```

---

### Task 4: Add frame-level Deepgram VAD and provider-aware capture

**Files:**
- Create: `app/plugins/stt-ticker/capture-audio.js`
- Modify: `app/plugins/stt-ticker/main.js`
- Modify: `app/plugins/stt-ticker/capture.html`
- Create: `app/test/stt-ticker-capture-audio.test.js`
- Create: `app/test/stt-ticker-deepgram-capture-routing.test.js`

**Interfaces:**
- Produces: `window.SttCaptureAudio.detectVoiceActivity(samples, sampleRate, vad)`.
- Produces: `window.SttCaptureAudio.floatToLinear16(samples) -> ArrayBuffer`.
- Produces: `window.SttCaptureAudio.createLiveVadGate(vad, sampleRate).push(samples) -> { state, frames, vad }`.

- [ ] **Step 1: Write failing pure audio tests**

```js
const { floatToLinear16, createLiveVadGate } = require('../plugins/stt-ticker/capture-audio');

test('converts normalized floats to little-endian Linear16', () => {
  const result = new DataView(floatToLinear16(Float32Array.from([-1, 0, 1])));
  expect(result.getInt16(0, true)).toBe(-32768);
  expect(result.getInt16(2, true)).toBe(0);
  expect(result.getInt16(4, true)).toBe(32767);
});

test('sends pre-roll, speech, and hangover but suppresses sustained silence', () => {
  const gate = createLiveVadGate({
    enabled: true, rmsThreshold: 0.05, minSpeechRatio: 0.04,
    sustainedSilenceMs: 500, preRollMs: 250
  }, 16000);
  const silence = Float32Array.from({ length: 1600 }, () => 0);
  const speech = Float32Array.from({ length: 1600 }, () => 0.2);

  expect(gate.push(silence).frames).toHaveLength(0);
  expect(gate.push(speech).frames).toHaveLength(2);
  expect(gate.push(silence).frames).toHaveLength(1);
  for (let i = 0; i < 6; i += 1) gate.push(silence);
  expect(gate.push(silence)).toMatchObject({ state: 'silent', frames: [] });
});
```

- [ ] **Step 2: Run the audio test and verify RED**

Run:

```powershell
cd app
npm test -- --runInBand test/stt-ticker-capture-audio.test.js
```

Expected: FAIL with module-not-found for `capture-audio.js`.

- [ ] **Step 3: Implement the UMD-compatible audio helper**

```js
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SttCaptureAudio = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function detectVoiceActivity(samples, sampleRate, vad) {
    if (!samples?.length) return { hasSpeech: false, rms: 0, speechRatio: 0, frameMs: 0 };
    let sumSquares = 0;
    let loudSamples = 0;
    const threshold = Number(vad.rmsThreshold) || 0.012;
    for (const sample of samples) {
      sumSquares += sample * sample;
      if (Math.abs(sample) > threshold * 0.5) loudSamples += 1;
    }
    const rms = Math.sqrt(sumSquares / samples.length);
    const speechRatio = loudSamples / samples.length;
    return {
      hasSpeech: vad.enabled === false || (rms >= threshold && speechRatio >= (Number(vad.minSpeechRatio) || 0.04)),
      rms,
      speechRatio,
      frameMs: samples.length / sampleRate * 1000
    };
  }

  function floatToLinear16(samples) {
    const buffer = new ArrayBuffer(samples.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < samples.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(i * 2, sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767), true);
    }
    return buffer;
  }

  function createLiveVadGate(vad, sampleRate) {
    const preRoll = [];
    let speaking = false;
    let silentMs = 0;
    const preRollMs = Number(vad.preRollMs) || 250;
    return {
      push(samples) {
        const frame = Float32Array.from(samples);
        const result = detectVoiceActivity(frame, sampleRate, vad);
        if (!speaking && !result.hasSpeech) {
          preRoll.push(frame);
          let retainedMs = preRoll.reduce((sum, item) => sum + item.length / sampleRate * 1000, 0);
          while (preRoll.length > 1 && retainedMs > preRollMs) {
            retainedMs -= preRoll.shift().length / sampleRate * 1000;
          }
          return { state: 'silent', frames: [], vad: result };
        }
        if (!speaking && result.hasSpeech) {
          speaking = true;
          silentMs = 0;
          const frames = [...preRoll, frame];
          preRoll.length = 0;
          return { state: 'speaking', frames, vad: result };
        }
        if (result.hasSpeech) {
          silentMs = 0;
          return { state: 'speaking', frames: [frame], vad: result };
        }
        silentMs += result.frameMs;
        if (silentMs <= (Number(vad.sustainedSilenceMs) || 1500)) {
          return { state: 'hangover', frames: [frame], vad: result };
        }
        speaking = false;
        silentMs = 0;
        preRoll.length = 0;
        return { state: 'silent', frames: [], vad: result };
      }
    };
  }

  return { detectVoiceActivity, floatToLinear16, createLiveVadGate };
});
```

`createLiveVadGate` stores a bounded pre-roll based on frame duration, switches to speaking when the existing RMS and speech-ratio conditions pass, sends trailing frames for `sustainedSilenceMs`, then returns to silent suppression.

- [ ] **Step 4: Serve the helper and branch capture by provider**

Add a route in `main.js`:

```js
this.api.registerRoute('get', '/stt-ticker/capture-audio.js', (req, res) => {
  res.type('application/javascript').sendFile(path.join(__dirname, 'capture-audio.js'));
});
```

Load it before the capture inline script. At capture start, fetch `/api/stt-ticker/status`, store the effective provider, and start a Deepgram socket session only when it equals `deepgram`:

```js
const effectiveProvider = statusData.status?.asr?.provider || 'fish.audio';
if (effectiveProvider === 'deepgram') {
  liveVadGate = SttCaptureAudio.createLiveVadGate(vad, audioContext.sampleRate);
  const result = await emitWithAck('stt-ticker:deepgram-start', {
    sampleRate: audioContext.sampleRate,
    channels: 1
  });
  if (!result?.ok) throw new Error(result?.error || 'Deepgram stream failed to start');
}
```

In `onaudioprocess`, keep the existing chunk buffer only for non-Deepgram providers. For Deepgram:

```js
const frame = Float32Array.from(event.inputBuffer.getChannelData(0));
const gated = liveVadGate.push(frame);
for (const samples of gated.frames) {
  socket.emit('stt-ticker:deepgram-audio', SttCaptureAudio.floatToLinear16(samples));
  stats.sent += 1;
}
if (gated.frames.length === 0) stats.skipped += 1;
```

Stop emits `stt-ticker:deepgram-stop`; Fish.audio and ElevenLabs still call the existing `sendWavChunk()` and `/transcribe` route.

- [ ] **Step 5: Add source-level provider routing regression tests**

Assert the capture page loads the helper, starts the Deepgram session, uses Linear16 frames only for Deepgram, retains `sendAudioToServer(wavBlob)` for chunk providers, and stops the live session on capture stop.

- [ ] **Step 6: Run capture tests and existing display tests**

Run:

```powershell
cd app
npm test -- --runInBand test/stt-ticker-capture-audio.test.js test/stt-ticker-deepgram-capture-routing.test.js test/stt-ticker-display-modes.test.js
```

Expected: PASS, 0 failed tests.

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- app/plugins/stt-ticker/capture-audio.js app/plugins/stt-ticker/capture.html app/plugins/stt-ticker/main.js app/test/stt-ticker-capture-audio.test.js app/test/stt-ticker-deepgram-capture-routing.test.js
git commit -m "feat(stt-ticker): stream VAD-gated Deepgram audio"
```

---

### Task 5: Render replaceable interim captions

**Files:**
- Modify: `app/plugins/stt-ticker/overlay/ticker.html`
- Modify: `app/plugins/stt-ticker/capture.html`
- Create: `app/test/stt-ticker-interim-overlay.test.js`

**Interfaces:**
- Consumes: `stt-ticker:interim` payload `{ text, provider, cleared? }`.
- Produces: one replaceable, non-persistent overlay element.

- [ ] **Step 1: Write failing overlay tests**

```js
const fs = require('fs');
const path = require('path');

test('renders Deepgram interim text separately and clears it on final captions', () => {
  const html = fs.readFileSync(path.join(__dirname, '../plugins/stt-ticker/overlay/ticker.html'), 'utf8');
  expect(html).toContain('id="interim-caption"');
  expect(html).toContain("socket.on('stt-ticker:interim'");
  expect(html).toContain('overlayConfig.showInterim');
  expect(html).toContain('clearInterim();');
});
```

- [ ] **Step 2: Run the overlay test and verify RED**

Run:

```powershell
cd app
npm test -- --runInBand test/stt-ticker-interim-overlay.test.js
```

Expected: FAIL because no interim element or handler exists.

- [ ] **Step 3: Implement interim rendering**

Add one independent element and replacement functions:

```html
<div id="interim-caption" aria-live="polite"></div>
```

```js
const interimCaption = document.getElementById('interim-caption');

function renderInterim(text) {
  if (overlayConfig.showInterim === false) return;
  interimCaption.textContent = String(text || '');
  interimCaption.classList.toggle('visible', Boolean(String(text || '').trim()));
}

function clearInterim() {
  renderInterim('');
}

socket.on('stt-ticker:interim', (data) => {
  if (data?.cleared) clearInterim();
  else renderInterim(data?.text);
});
```

Call `clearInterim()` at the beginning of the final `stt-ticker:transcript` handler and on `stt-ticker:clear`. The capture page logs/replaces the latest interim preview without incrementing sent/final statistics.

- [ ] **Step 4: Run overlay and display-mode tests**

Run:

```powershell
cd app
npm test -- --runInBand test/stt-ticker-interim-overlay.test.js test/stt-ticker-display-modes.test.js test/stt-ticker-overlay-params.test.js
```

Expected: PASS without changing classic, dual-language, or multilingual final rendering.

- [ ] **Step 5: Commit Task 5**

```powershell
git add -- app/plugins/stt-ticker/overlay/ticker.html app/plugins/stt-ticker/capture.html app/test/stt-ticker-interim-overlay.test.js
git commit -m "feat(stt-ticker): display Deepgram interim captions"
```

---

### Task 6: Mask secrets and keep model discovery server-side

**Files:**
- Modify: `app/plugins/stt-ticker/main.js`
- Modify: `app/plugins/stt-ticker/capture.html`
- Modify: `app/plugins/stt-ticker/ui.html`
- Create: `app/test/stt-ticker-secret-masking.test.js`

**Interfaces:**
- Produces: `_getSafeConfig()` with `__KEEP__` for every stored secret.
- Preserves: POST save semantics where empty or `__KEEP__` leaves the stored secret unchanged.

- [ ] **Step 1: Write failing secret-masking tests**

```js
const SttTickerPlugin = require('../plugins/stt-ticker/main');

function createPluginWithConfig(config) {
  const api = {
    getSocketIO: jest.fn(() => ({ emit: jest.fn() })),
    log: jest.fn()
  };
  const plugin = new SttTickerPlugin(api);
  plugin.config = config;
  plugin.asrPipeline = { getStatus: jest.fn(() => ({})) };
  plugin.textBuffer = { getStats: jest.fn(() => ({})) };
  plugin.translator = { getStatus: jest.fn(() => ({ enabled: false, configured: false })) };
  return plugin;
}

test('masks every STT Ticker secret in browser-facing config', () => {
  const plugin = createPluginWithConfig({
    asr: {
      deepgramApiKey: 'deepgram-secret',
      elevenlabsApiKey: 'eleven-secret',
      fishaudioApiKey: 'fish-secret'
    },
    translation: { apiKey: 'translation-secret' }
  });

  expect(plugin._getSafeConfig()).toMatchObject({
    asr: {
      deepgramApiKey: '__KEEP__',
      elevenlabsApiKey: '__KEEP__',
      fishaudioApiKey: '__KEEP__'
    },
    translation: { apiKey: '__KEEP__' }
  });
  expect(JSON.stringify(plugin._getStatus())).not.toContain('deepgram-secret');
});
```

Add route tests asserting `/asr/settings` and `/multilang/settings` responses also use safe values, and `__KEEP__` does not overwrite the stored config.

- [ ] **Step 2: Run the masking test and verify RED**

Run:

```powershell
cd app
npm test -- --runInBand test/stt-ticker-secret-masking.test.js
```

Expected: FAIL because `_getSafeConfig()` currently clones raw secrets and several update routes return raw config sections.

- [ ] **Step 3: Implement one masking helper and use it everywhere**

```js
_getSafeConfig() {
  if (!this.config) return {};
  const safe = JSON.parse(JSON.stringify(this.config));
  for (const key of ['deepgramApiKey', 'elevenlabsApiKey', 'fishaudioApiKey']) {
    if (safe.asr && Object.prototype.hasOwnProperty.call(safe.asr, key)) {
      safe.asr[key] = safe.asr[key] ? '__KEEP__' : '';
    }
  }
  if (safe.translation && Object.prototype.hasOwnProperty.call(safe.translation, 'apiKey')) {
    safe.translation.apiKey = safe.translation.apiKey ? '__KEEP__' : '';
  }
  return safe;
}
```

Build ASR and multilang response sections from `_getSafeConfig()`, not `this.config`. Reject `req.query.apiKey` on `/translator/models`; use only `this.config.translation.apiKey` server-side. Change capture model loading to call `/translator/models` without a key query parameter.

Ensure UI password fields display an empty value with configured badges driven by status booleans and submit `__KEEP__` when unchanged.

- [ ] **Step 4: Run masking and UI tests**

Run:

```powershell
cd app
npm test -- --runInBand test/stt-ticker-secret-masking.test.js test/stt-ticker-deepgram-capture-routing.test.js test/generated-plugin-locale.test.js
```

Expected: PASS, and no test response contains any fixture secret.

- [ ] **Step 5: Commit Task 6**

```powershell
git add -- app/plugins/stt-ticker/main.js app/plugins/stt-ticker/capture.html app/plugins/stt-ticker/ui.html app/test/stt-ticker-secret-masking.test.js
git commit -m "fix(stt-ticker): keep provider keys server-side"
```

---

### Task 7: Verify focused suites, runtime behavior, and provider parity

**Files:**
- Modify only if verification exposes a defect: files already listed in Tasks 1-6.
- Runtime config change through API: set STT Ticker provider to `deepgram` after code verification.

**Interfaces:**
- Consumes: the completed SDK adapter, live-session manager, capture gate, common commit pipeline, and safe config responses.
- Produces: verified live Deepgram streaming while leaving Fish.audio chunk transcription operational.

- [ ] **Step 1: Run all focused STT Ticker tests**

```powershell
cd app
npm test -- --runInBand --testPathPattern=stt-ticker
```

Expected: every STT Ticker suite passes with 0 failed tests.

- [ ] **Step 2: Run syntax, lint, and build checks**

```powershell
cd app
node --check plugins/stt-ticker/main.js
node --check plugins/stt-ticker/backend/asr/deepgram-client.js
node --check plugins/stt-ticker/backend/asr/deepgram-live-session.js
node --check plugins/stt-ticker/capture-audio.js
npm run lint -- --quiet
npm run build:css
```

Expected: every command exits 0.

- [ ] **Step 3: Run the full Jest suite**

```powershell
cd app
npm test -- --runInBand --silent
```

Expected: all suites and tests pass; report exact counts from fresh output.

- [ ] **Step 4: Reload only STT Ticker and activate Deepgram**

```powershell
$base = 'http://127.0.0.1:3000'
Invoke-RestMethod -Method Post -Uri "$base/api/plugins/stt-ticker/reload" -ContentType 'application/json' -Body '{}'
Invoke-RestMethod -Method Post -Uri "$base/api/stt-ticker/asr/settings" -ContentType 'application/json' -Body '{"asr":{"provider":"deepgram","deepgramApiKey":"__KEEP__"}}'
```

Expected: reload succeeds; status reports `provider=deepgram`, `deepgramConfigured=true`, and no key value.

- [ ] **Step 5: Run a real SDK authentication check and synthetic live stream**

Call `/api/stt-ticker/asr/test-deepgram` and expect HTTP 200 JSON with `success=true`. Generate a short local WAV with Windows Speech Synthesis, strip the PCM WAV header, then stream 16-bit frames through `socket.io-client` using `stt-ticker:deepgram-start`, `stt-ticker:deepgram-audio`, and `stt-ticker:deepgram-stop` at real-time cadence.

Expected socket evidence:

```text
deepgram-status: open
interim: non-empty
final transcript: non-empty, provider=deepgram
deepgram-status: stopped
```

Do not print the configured key or full config response.

- [ ] **Step 6: Verify silence suppression and resume**

Send speech frames, at least two seconds of silent source frames through the browser VAD gate, then speech again on the same SDK session.

Expected: long silence produces no `deepgram-audio` events, the backend sends keepalive, the same session remains open, and the second phrase produces another final transcript.

- [ ] **Step 7: Verify Fish.audio parity and restore Deepgram**

Temporarily set `provider=fish.audio`, submit one VAD-approved WAV through `/api/stt-ticker/transcribe`, and confirm `provider=fish.audio` in diagnostics. Then set `provider=deepgram` again with `deepgramApiKey=__KEEP__`.

Expected: Fish.audio uses the existing upload route successfully; final status returns to Deepgram live mode.

- [ ] **Step 8: Verify secret-safe responses**

Fetch `/api/stt-ticker/config`, `/api/stt-ticker/status`, `/api/stt-ticker/vad/settings`, and the response from `/api/stt-ticker/asr/settings`.

Expected: none contains the configured Deepgram, ElevenLabs, Fish.audio, or translation key; configured secrets appear only as `__KEEP__` or booleans.

- [ ] **Step 9: Commit any verification-only corrections**

If runtime verification required a scoped correction, first add a failing regression test, make it green, and commit only those files:

```powershell
git add -- app/plugins/stt-ticker app/test/stt-ticker-*.test.js app/package.json app/package-lock.json
git commit -m "fix(stt-ticker): harden Deepgram live runtime"
```

If no correction was required, do not create an empty commit.

---

## Completion Checklist

- [ ] `@deepgram/sdk` 5.5.0 is present and loaded through CommonJS.
- [ ] Prerecorded Deepgram compatibility uses SDK `transcribeFile()`.
- [ ] Capture Deepgram uses one persistent SDK WebSocket per Socket.IO capture socket.
- [ ] VAD pre-roll, hangover, sustained-silence suppression, and keepalive are verified.
- [ ] Interim captions replace in place and never reach translation, buffer, or VRChat.
- [ ] Final captions use the same post-processing path as uploaded Fish.audio captions.
- [ ] Fish.audio and ElevenLabs retain their chunk upload behavior.
- [ ] Every browser-facing STT response masks stored secrets.
- [ ] Focused tests, lint, CSS build, full Jest, plugin reload, and real live streaming pass.
- [ ] Runtime provider is left set to `deepgram` with the existing key preserved.
