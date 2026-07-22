const { DeepgramClient } = require('@deepgram/sdk');
const DeepgramAsrClient = require('./deepgram-client');

const MAX_FRAME_BYTES = 256 * 1024;
const KEEPALIVE_INTERVAL_MS = 5000;
const RECOVERY_DELAYS_MS = [1000, 2000, 5000];

class DeepgramLiveSessionManager {
  constructor(options = {}) {
    this.getConfig = options.getConfig || (() => ({}));
    this.getApiKey = options.getApiKey || (() => '');
    this.logger = options.logger || {
      info: () => {}, warn: () => {}, error: () => {}, debug: () => {}
    };
    this.onInterim = options.onInterim || (() => {});
    this.onFinal = options.onFinal || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.clientFactory = options.clientFactory || ((apiKey) => new DeepgramClient({ apiKey }));
    this.sessions = new Map();
    this.generation = 0;
  }

  async start(socket, input = {}) {
    if (!socket?.id) throw new Error('Deepgram live capture requires a socket id');

    const normalizedInput = this._validateInput(input);
    const apiKey = String(this.getApiKey() || '').trim();
    if (!apiKey) throw new Error('Deepgram API key is not configured');
    this._validateModelLanguage();

    await this.stop(socket.id, 'replaced');
    const session = this._createSession(socket, normalizedInput, ++this.generation);
    this.sessions.set(socket.id, session);
    socket.once('disconnect', () => this.stop(socket.id, 'socket-disconnect'));

    try {
      const opened = await this._openConnection(session, apiKey);
      if (!opened) return { ok: false, state: 'replaced' };
      return { ok: true, state: 'open' };
    } catch (error) {
      if (this._isCurrent(session)) this.sessions.delete(socket.id);
      session.stopped = true;
      this._clearTimers(session);
      this._disposeConnection(session, session.connection);
      const message = this._safeErrorMessage(error, apiKey);
      this._emitStatus(session, { state: 'error', error: message, nextRetryMs: null });
      throw new Error(`Deepgram live connection failed: ${message}`);
    }
  }

  sendAudio(socketId, payload) {
    const session = this.sessions.get(socketId);
    const audio = Buffer.isBuffer(payload)
      ? payload
      : (ArrayBuffer.isView(payload) || payload instanceof ArrayBuffer
        ? Buffer.from(payload.buffer || payload, payload.byteOffset || 0, payload.byteLength)
        : Buffer.alloc(0));

    if (!session?.open || !session.connection || audio.length === 0 || audio.length > MAX_FRAME_BYTES) return false;

    try {
      session.connection.sendMedia(audio);
      session.lastAudioAt = Date.now();
      session.bytesSent += audio.length;
      return true;
    } catch (error) {
      this._handleConnectionFailure(session, session.connection, session.connectionGeneration, error);
      return false;
    }
  }

  finalize(socketId) {
    const session = this.sessions.get(socketId);
    if (!session?.open || !session.connection) return false;
    try {
      session.connection.sendFinalize({ type: 'Finalize' });
      return true;
    } catch (error) {
      this._handleConnectionFailure(session, session.connection, session.connectionGeneration, error);
      return false;
    }
  }

  async stop(socketId, reason = 'stopped') {
    const session = this.sessions.get(socketId);
    if (!session) return false;

    this._flushFinal(session);
    this.sessions.delete(socketId);
    session.stopped = true;
    session.open = false;
    session.state = 'closed';
    this._clearTimers(session);

    if (session.connection) {
      const connection = session.connection;
      try { session.connection.sendFinalize({ type: 'Finalize' }); } catch (error) { /* best effort */ }
      try { session.connection.sendCloseStream({ type: 'CloseStream' }); } catch (error) { /* best effort */ }
      this._disposeConnection(session, connection);
    }

    this._emitStatus(session, { state: 'closed', reason, nextRetryMs: null });
    return true;
  }

  async destroy() {
    await Promise.all(Array.from(this.sessions.keys()).map(socketId => this.stop(socketId, 'destroy')));
  }

  getStatus() {
    return {
      activeSessions: this.sessions.size,
      sessions: Array.from(this.sessions.values()).map(session => ({
        socketId: session.socketId,
        state: session.state,
        sampleRate: session.input.sampleRate,
        channels: session.input.channels,
        startedAt: session.startedAt,
        lastAudioAt: session.lastAudioAt || null,
        bytesSent: session.bytesSent,
        reconnectAttempt: session.reconnectAttempt,
        nextRetryMs: this._nextRetryMs(session)
      }))
    };
  }

  _validateInput(input) {
    const sampleRate = Number(input.sampleRate);
    const channels = input.channels === undefined ? 1 : Number(input.channels);
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
      throw new Error('Deepgram sample rate must be between 8000 and 192000 Hz');
    }
    if (channels !== 1) throw new Error('Deepgram capture supports one audio channel');
    return { sampleRate, channels };
  }

  _createSession(socket, input, generation) {
    return {
      socket,
      socketId: socket.id,
      generation,
      input,
      connection: null,
      apiKey: null,
      connectionGeneration: 0,
      open: false,
      stopped: false,
      state: 'connecting',
      keepAliveTimer: null,
      recoveryTimer: null,
      recoveryDueAt: null,
      reconnectAttempt: 0,
      recoveryInFlight: false,
      startedAt: Date.now(),
      lastAudioAt: 0,
      bytesSent: 0,
      finalParts: new Map(),
      requestId: null
    };
  }

  async _openConnection(session, apiKey) {
    if (!this._isCurrent(session) || session.stopped) return false;

    session.apiKey = apiKey;
    const client = this.clientFactory(apiKey);
    const connection = await client.listen.v1.connect(this._buildConnectOptions(session.input, apiKey));
    if (!connection) throw new Error('Deepgram live connection was not created');
    if (!this._isCurrent(session) || session.stopped) {
      try { connection.close(); } catch (error) { /* best effort */ }
      return false;
    }
    if (session.connection) {
      try { connection.close(); } catch (error) { /* best effort */ }
      throw new Error('Deepgram live connection is still active');
    }

    const connectionGeneration = session.connectionGeneration + 1;
    session.connection = connection;
    session.connectionGeneration = connectionGeneration;
    session.open = false;
    try {
      this._bindConnection(session, connection, connectionGeneration);
      connection.connect();
      await connection.waitForOpen();
    } catch (error) {
      if (session.connection === connection) this._disposeConnection(session, connection);
      throw error;
    }

    if (!this._isCurrentConnection(session, connection, connectionGeneration)) {
      try { connection.close(); } catch (error) { /* best effort */ }
      return false;
    }
    this._markOpen(session, connection, connectionGeneration);
    return true;
  }

  _markOpen(session, connection, connectionGeneration) {
    if (!this._isCurrentConnection(session, connection, connectionGeneration) || session.stopped) return;
    if (session.open && session.state === 'open') return;

    session.open = true;
    session.state = 'open';
    session.recoveryInFlight = false;
    session.reconnectAttempt = 0;
    this._clearRecoveryTimer(session);
    if (!session.keepAliveTimer) {
      session.keepAliveTimer = setInterval(() => this._keepAlive(session), KEEPALIVE_INTERVAL_MS);
    }
    this._emitStatus(session, { state: 'open', reconnectAttempt: 0, nextRetryMs: null });
  }

  _buildConnectOptions(input, apiKey) {
    const config = this.getConfig() || {};
    const asr = config.asr || {};
    const fixedLanguage = asr.languageMode === 'fixed' ? asr.languageFixed : null;

    return {
      model: asr.deepgramModel || 'nova-2',
      language: fixedLanguage || 'multi',
      encoding: 'linear16',
      sample_rate: input.sampleRate,
      channels: 1,
      interim_results: true,
      punctuate: true,
      smart_format: true,
      vad_events: true,
      endpointing: Math.max(10, Number(config.silenceTimeoutMs) || 900),
      utterance_end_ms: String(Math.max(1000, Number(config.vad?.sustainedSilenceMs) || 1500)),
      reconnectAttempts: 0,
      connectionTimeoutInSeconds: 10,
      Authorization: `Token ${apiKey}`
    };
  }

  _validateModelLanguage() {
    const asr = this.getConfig()?.asr || {};
    const model = asr.deepgramModel || 'nova-2';
    const modelInfo = DeepgramAsrClient.MODELS[model];
    if (!modelInfo) return;
    const language = asr.languageMode === 'fixed' ? asr.languageFixed : 'multi';
    if (language === 'multi' && !modelInfo.multilingual) {
      throw new Error(`Deepgram model "${model}" does not support multilingual mode; choose a fixed language or a multilingual model`);
    }
    if (language !== 'multi' && modelInfo.supportedFixedLanguages?.length > 0
      && !modelInfo.supportedFixedLanguages.includes(language)) {
      throw new Error(`Deepgram model "${model}" does not support fixed language "${language}"`);
    }
  }

  _bindConnection(session, connection, connectionGeneration) {
    connection.on('message', message => {
      if (this._isCurrentConnection(session, connection, connectionGeneration)) this._handleMessage(session, message);
    });
    connection.on('error', error => this._handleConnectionFailure(session, connection, connectionGeneration, error));
    connection.on('close', event => {
      this._handleConnectionBoundary(session, connection, connectionGeneration, {
        code: Number.isFinite(event?.code) ? event.code : null
      });
    });
    connection.on('open', () => this._markOpen(session, connection, connectionGeneration));
  }

  _handleConnectionFailure(session, connection, connectionGeneration, error) {
    this._handleConnectionBoundary(session, connection, connectionGeneration, {
      error: this._safeErrorMessage(error, session.apiKey)
    });
  }

  _handleConnectionBoundary(session, connection, connectionGeneration, status = {}) {
    if (!this._isCurrentConnection(session, connection, connectionGeneration) || session.stopped) return;
    session.open = false;
    this._clearKeepAliveTimer(session);
    this._flushFinal(session);
    session.requestId = null;
    this._disposeConnection(session, connection);
    this._scheduleRecovery(session, status);
  }

  _scheduleRecovery(session, status = {}) {
    if (!this._isCurrent(session) || session.stopped || session.recoveryTimer || session.recoveryInFlight) return;
    if (session.reconnectAttempt >= RECOVERY_DELAYS_MS.length) {
      this._failSession(session, status.error || 'Deepgram live reconnection failed');
      return;
    }

    const reconnectAttempt = session.reconnectAttempt + 1;
    const delay = RECOVERY_DELAYS_MS[reconnectAttempt - 1];
    session.reconnectAttempt = reconnectAttempt;
    session.state = 'reconnecting';
    session.recoveryDueAt = Date.now() + delay;
    this._emitStatus(session, {
      state: 'reconnecting',
      ...status,
      reconnectAttempt,
      nextRetryMs: delay
    });
    session.recoveryTimer = setTimeout(() => {
      session.recoveryTimer = null;
      session.recoveryDueAt = null;
      this._recover(session, reconnectAttempt);
    }, delay);
  }

  async _recover(session, reconnectAttempt) {
    if (!this._isCurrent(session) || session.stopped || reconnectAttempt !== session.reconnectAttempt) return;
    session.recoveryInFlight = true;
    let apiKey = '';
    try {
      apiKey = String(this.getApiKey() || '').trim();
      if (!apiKey) throw new Error('Deepgram API key is not configured');
      await this._openConnection(session, apiKey);
    } catch (error) {
      if (!this._isCurrent(session) || session.stopped) return;
      session.recoveryInFlight = false;
      const message = this._safeErrorMessage(error, apiKey || session.apiKey);
      if (session.reconnectAttempt >= RECOVERY_DELAYS_MS.length) {
        this._failSession(session, message);
      } else {
        this._scheduleRecovery(session, { error: message });
      }
    }
  }

  _failSession(session, error) {
    if (!this._isCurrent(session)) return;
    this.sessions.delete(session.socketId);
    session.stopped = true;
    session.open = false;
    session.state = 'error';
    session.recoveryInFlight = false;
    this._clearTimers(session);
    this._disposeConnection(session, session.connection);
    this._emitStatus(session, {
      state: 'error',
      error,
      reconnectAttempt: session.reconnectAttempt,
      nextRetryMs: null
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

    const start = Number(message.start) || 0;
    const duration = Number(message.duration) || 0;
    const key = `${start}:${duration}`;
    if (message.is_final) session.finalParts.set(key, { message, alternative, text, start, duration });

    const stableParts = this._sortedParts(session);
    const displayParts = message.is_final
      ? stableParts.map(part => part.text)
      : [...stableParts.map(part => part.text), text];
    if (!message.speech_final) {
      this.onInterim(session.socketId, { text: displayParts.join(' ').trim(), provider: 'deepgram', isFinal: false });
    }
    if (message.speech_final) this._flushFinal(session);
  }

  _flushFinal(session) {
    if (session.finalParts.size === 0) return false;
    const parts = this._sortedParts(session);
    session.finalParts.clear();
    const confidences = parts.map(part => Number(part.alternative.confidence)).filter(Number.isFinite);
    const lastPart = parts[parts.length - 1];
    const language = lastPart?.message?.channel?.detected_language;
    const end = parts.reduce((maximum, part) => Math.max(maximum, part.start + part.duration), 0);
    this.onFinal(session.socketId, {
      text: parts.map(part => part.text).join(' ').trim(),
      segments: parts.map(part => ({
        text: part.text,
        start: part.start,
        end: part.start + part.duration,
        confidence: part.alternative.confidence
      })),
      duration: end,
      language: language ? String(language).toLowerCase().slice(0, 2) : null,
      confidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : null,
      provider: 'deepgram',
      model: this.getConfig()?.asr?.deepgramModel || 'nova-2',
      requestId: session.requestId
    });
    return true;
  }

  _sortedParts(session) {
    return Array.from(session.finalParts.values())
      .sort((left, right) => left.start - right.start || left.duration - right.duration);
  }

  _keepAlive(session) {
    if (!this._isCurrent(session) || !session.open || !session.connection) return;
    try {
      session.connection.sendKeepAlive({ type: 'KeepAlive' });
    } catch (error) {
      this.logger.debug(`Deepgram keepalive failed for ${session.socketId}`);
    }
  }

  _isCurrent(session) {
    return this.sessions.get(session.socketId) === session;
  }

  _isCurrentConnection(session, connection, connectionGeneration) {
    return this._isCurrent(session)
      && !session.stopped
      && session.connection === connection
      && session.connectionGeneration === connectionGeneration;
  }

  _nextRetryMs(session) {
    return session.recoveryDueAt ? Math.max(0, session.recoveryDueAt - Date.now()) : null;
  }

  _emitStatus(session, status) {
    try {
      this.onStatus(session.socketId, {
        ...status,
        reconnectAttempt: status.reconnectAttempt ?? session.reconnectAttempt,
        nextRetryMs: status.nextRetryMs ?? this._nextRetryMs(session)
      });
    } catch (error) {
      this.logger.warn(`Deepgram status callback failed for ${session.socketId}`);
    }
  }

  _clearKeepAliveTimer(session) {
    if (!session.keepAliveTimer) return;
    clearInterval(session.keepAliveTimer);
    session.keepAliveTimer = null;
  }

  _clearRecoveryTimer(session) {
    if (session.recoveryTimer) clearTimeout(session.recoveryTimer);
    session.recoveryTimer = null;
    session.recoveryDueAt = null;
  }

  _clearTimers(session) {
    this._clearKeepAliveTimer(session);
    this._clearRecoveryTimer(session);
  }

  _disposeConnection(session, connection) {
    if (!connection) return;
    if (typeof connection.on === 'function') {
      for (const event of ['message', 'error', 'close', 'open']) {
        try { connection.on(event, () => {}); } catch (error) { /* best effort */ }
      }
    }
    if (session.connection === connection) {
      session.connection = null;
      session.open = false;
    }
    try { connection.close(); } catch (error) { /* best effort */ }
  }

  _safeErrorMessage(error, apiKey) {
    const raw = String(error?.message || 'Unknown error').slice(0, 500);
    const secret = String(apiKey || '');
    return secret ? raw.split(secret).join('[redacted]') : raw;
  }
}

module.exports = DeepgramLiveSessionManager;
