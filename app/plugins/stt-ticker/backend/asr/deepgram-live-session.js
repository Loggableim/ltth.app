const { DeepgramClient } = require('@deepgram/sdk');

const MAX_FRAME_BYTES = 256 * 1024;
const KEEPALIVE_INTERVAL_MS = 5000;

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

    const sampleRate = Number(input.sampleRate);
    const channels = input.channels === undefined ? 1 : Number(input.channels);
    if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
      throw new Error('Deepgram sample rate must be between 8000 and 192000 Hz');
    }
    if (channels !== 1) {
      throw new Error('Deepgram capture supports one audio channel');
    }

    const apiKey = String(this.getApiKey() || '').trim();
    if (!apiKey) throw new Error('Deepgram API key is not configured');

    await this.stop(socket.id, 'replaced');
    const session = this._createSession(socket, { sampleRate, channels }, ++this.generation);
    this.sessions.set(socket.id, session);
    socket.once('disconnect', () => this.stop(socket.id, 'socket-disconnect'));

    try {
      const client = this.clientFactory(apiKey);
      session.connection = await client.listen.v1.connect(
        this._buildConnectOptions(session.input, apiKey)
      );
      this._bindConnection(session);
      session.connection.connect();
      await session.connection.waitForOpen();

      if (!this._isCurrent(session)) {
        session.connection.close();
        return { ok: false, state: 'replaced' };
      }

      session.open = true;
      session.state = 'open';
      session.keepAliveTimer = setInterval(() => this._keepAlive(session), KEEPALIVE_INTERVAL_MS);
      this._emitStatus(session, { state: 'open' });
      return { ok: true, state: 'open' };
    } catch (error) {
      if (this._isCurrent(session)) this.sessions.delete(socket.id);
      this._clearTimer(session);
      try { session.connection?.close(); } catch (closeError) { /* best effort */ }
      const message = this._safeErrorMessage(error, apiKey);
      this._emitStatus(session, { state: 'error', error: message });
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

    if (!session?.open || audio.length === 0 || audio.length > MAX_FRAME_BYTES) return false;

    try {
      session.connection.sendMedia(audio);
      session.lastAudioAt = Date.now();
      session.bytesSent += audio.length;
      return true;
    } catch (error) {
      this._emitStatus(session, {
        state: 'error',
        error: this._safeErrorMessage(error, this.getApiKey())
      });
      return false;
    }
  }

  async stop(socketId, reason = 'stopped') {
    const session = this.sessions.get(socketId);
    if (!session) return false;

    this._flushFinal(session);
    this.sessions.delete(socketId);
    session.open = false;
    session.state = 'closed';
    this._clearTimer(session);

    if (session.connection) {
      try { session.connection.sendFinalize({ type: 'Finalize' }); } catch (error) { /* best effort */ }
      try { session.connection.sendCloseStream({ type: 'CloseStream' }); } catch (error) { /* best effort */ }
      try { session.connection.close(); } catch (error) { /* best effort */ }
    }

    this._emitStatus(session, { state: 'closed', reason });
    return true;
  }

  async destroy() {
    const socketIds = Array.from(this.sessions.keys());
    await Promise.all(socketIds.map(socketId => this.stop(socketId, 'destroy')));
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
        bytesSent: session.bytesSent
      }))
    };
  }

  _createSession(socket, input, generation) {
    return {
      socket,
      socketId: socket.id,
      generation,
      input,
      connection: null,
      open: false,
      state: 'connecting',
      keepAliveTimer: null,
      startedAt: Date.now(),
      lastAudioAt: 0,
      bytesSent: 0,
      finalParts: new Map(),
      requestId: null
    };
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
      utterance_end_ms: String(
        Math.max(1000, Number(config.vad?.sustainedSilenceMs) || 1500)
      ),
      reconnectAttempts: 3,
      connectionTimeoutInSeconds: 10,
      Authorization: `Token ${apiKey}`
    };
  }

  _bindConnection(session) {
    session.connection.on('message', message => this._handleMessage(session, message));
    session.connection.on('error', error => {
      if (!this._isCurrent(session)) return;
      session.state = 'error';
      this._emitStatus(session, {
        state: 'error',
        error: this._safeErrorMessage(error, this.getApiKey())
      });
    });
    session.connection.on('close', event => {
      if (!this._isCurrent(session)) return;
      session.open = false;
      session.state = 'reconnecting';
      this._emitStatus(session, {
        state: 'reconnecting',
        code: Number.isFinite(event?.code) ? event.code : null
      });
    });
    session.connection.on('open', () => {
      if (!this._isCurrent(session)) return;
      session.open = true;
      session.state = 'open';
      this._emitStatus(session, { state: 'open' });
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
    if (message.is_final) {
      session.finalParts.set(key, { message, alternative, text, start, duration });
    }

    const stableParts = this._sortedParts(session);
    const displayParts = message.is_final
      ? stableParts.map(part => part.text)
      : [...stableParts.map(part => part.text), text];

    if (!message.speech_final) {
      this.onInterim(session.socketId, {
        text: displayParts.join(' ').trim(),
        provider: 'deepgram',
        isFinal: false
      });
    }
    if (message.speech_final) this._flushFinal(session);
  }

  _flushFinal(session) {
    if (session.finalParts.size === 0) return false;

    const parts = this._sortedParts(session);
    session.finalParts.clear();
    const confidences = parts
      .map(part => Number(part.alternative.confidence))
      .filter(Number.isFinite);
    const lastPart = parts[parts.length - 1];
    const language = lastPart?.message?.channel?.detected_language;
    const model = this.getConfig()?.asr?.deepgramModel || 'nova-2';
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
      confidence: confidences.length
        ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
        : null,
      provider: 'deepgram',
      model,
      requestId: session.requestId
    });
    return true;
  }

  _sortedParts(session) {
    return Array.from(session.finalParts.values())
      .sort((left, right) => left.start - right.start || left.duration - right.duration);
  }

  _keepAlive(session) {
    if (!this._isCurrent(session) || !session.open) return;
    try {
      session.connection.sendKeepAlive({ type: 'KeepAlive' });
    } catch (error) {
      this.logger.debug(`Deepgram keepalive failed for ${session.socketId}`);
    }
  }

  _isCurrent(session) {
    return this.sessions.get(session.socketId) === session;
  }

  _emitStatus(session, status) {
    try {
      this.onStatus(session.socketId, status);
    } catch (error) {
      this.logger.warn(`Deepgram status callback failed for ${session.socketId}`);
    }
  }

  _clearTimer(session) {
    if (!session.keepAliveTimer) return;
    clearInterval(session.keepAliveTimer);
    session.keepAliveTimer = null;
  }

  _safeErrorMessage(error, apiKey) {
    const raw = String(error?.message || 'Unknown error').slice(0, 500);
    const secret = String(apiKey || '');
    return secret ? raw.split(secret).join('[redacted]') : raw;
  }
}

module.exports = DeepgramLiveSessionManager;
