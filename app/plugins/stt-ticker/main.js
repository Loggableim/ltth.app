/**
 * STT Ticker Plugin - Main Entry Point
 *
 * Live-Untertitel-Overlay für Hearing-Impaired Zuschauer.
 * Transkribiert Host-Sprache via Fish.audio ASR (TTS-Plugin) und zeigt sie
 * als konfigurierbaren Ticker in OBS an.
 *
 * Übersetzung (optional):
 * - Übersetzt transkribierten Text via Ollama Cloud LLM
 * - Farbe des übersetzten Texts konfigurierbar
 * - API-Key und Modell im Settings-Bereich hinterlegbar
 */

const path = require('path');
const multer = require('multer');
const AsrPipeline = require('./backend/asr-pipeline');
const TextBuffer = require('./backend/text-buffer');
const Translator = require('./backend/translator');
const { routeTranscriptSegments } = require('./backend/lang-detect');
const { ConfigManager, DEFAULT_CONFIG } = require('./backend/config');

// Audio-MIME-Types (identisch zu Sidekick)
const ASR_AUDIO_FIELD = 'audio';
const ASR_SAFE_AUDIO_MIME_TYPES = new Set([
  'audio/webm', 'audio/ogg', 'audio/opus', 'audio/wav',
  'audio/wave', 'audio/x-wav', 'audio/mpeg', 'audio/mp3',
  'audio/mp4', 'audio/m4a', 'audio/aac'
]);
const ASR_OCTET_AUDIO_EXTENSIONS = new Set(['.webm', '.ogg', '.opus', '.wav', '.mp3', '.mpeg', '.mp4', '.m4a', '.aac']);
const VRCHAT_CHATBOX_EVENT = 'stt-ticker:vrchat-chatbox';
const VRCHAT_CHATBOX_DEBOUNCE_MS = 700;
const VRCHAT_CHATBOX_MAX_CHARS = 144;

class SttTickerPlugin {
  constructor(api) {
    this.api = api;
    this.io = api.getSocketIO();

    this.logger = {
      info: (msg) => this.api.log(msg, 'info'),
      error: (msg) => this.api.log(msg, 'error'),
      warn: (msg) => this.api.log(msg, 'warn'),
      debug: (msg) => this.api.log(msg, 'debug')
    };

    this.configManager = null;
    this.config = null;
    this.asrPipeline = null;
    this.textBuffer = null;
    this.translator = null;
    this.destroyed = false;
    this.vrchatChatboxParts = [];
    this.vrchatChatboxTimer = null;
    this.vrchatChatboxTyping = false;
    this.vrchatChatboxLastError = null;
  }

  async init() {
    this.logger.info('📝 Initializing STT Ticker Plugin...');

    try {
      // Config laden
      this.configManager = new ConfigManager(this.api);
      this.config = this.configManager.load();

      // Text-Buffer initialisieren
      this.textBuffer = new TextBuffer(this.config);

      // ASR-Pipeline initialisieren
      this.asrPipeline = new AsrPipeline(this.api, this.config, this.logger);

      // Translator initialisieren (optional)
      this.translator = new Translator(this.config, this.logger);

      // Routes registrieren
      this._registerRoutes();

      // Socket-Events registrieren
      this._registerSocketEvents();

      this.logger.info('✅ STT Ticker Plugin initialized successfully');
      this.logger.info('   - Overlay: /overlay/stt-ticker');
      this.logger.info('   - Master:  /stt-ticker');
      this.logger.info('   - Config:  /api/stt-ticker/config');
      this.logger.info('   - ASR:     /api/stt-ticker/transcribe');
      this.logger.info('   - Translation: ' + (this.config.translation?.enabled ? '✅ enabled' : '⏸️ disabled'));

    } catch (error) {
      this.logger.error(`Failed to initialize STT Ticker: ${error.message}`);
      throw error;
    }
  }

  async destroy() {
    this.logger.info('Destroying STT Ticker Plugin...');
    this.destroyed = true;
    this._clearVrchatChatboxQueue();

    if (this.asrPipeline) {
      this.asrPipeline.destroy();
      this.asrPipeline = null;
    }

    if (this.textBuffer) {
      this.textBuffer.destroy();
      this.textBuffer = null;
    }

    if (this.translator) {
      this.translator.destroy();
      this.translator = null;
    }

    this.logger.info('STT Ticker Plugin destroyed');
  }

  // ==================== Routes ====================

  _registerRoutes() {
    // Overlay ausliefern
    this.api.registerRoute('get', '/overlay/stt-ticker', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlay', 'ticker.html'));
    });

    // Master-UI: kombinierte Ansicht für Admin + Capture
    this.api.registerRoute('get', '/stt-ticker', (req, res) => {
      res.sendFile(path.join(__dirname, 'master.html'));
    });
    this.api.registerRoute('get', '/stt-ticker/master', (req, res) => {
      res.sendFile(path.join(__dirname, 'master.html'));
    });

    // Admin-UI ausliefern
    this.api.registerRoute('get', '/stt-ticker/ui', (req, res) => {
      res.sendFile(path.join(__dirname, 'ui.html'));
    });

    // Standalone Audio-Capture (eigenes Fenster, kein iframe)
    this.api.registerRoute('get', '/stt-ticker/capture', (req, res) => {
      res.sendFile(path.join(__dirname, 'capture.html'));
    });

    // Config abrufen
    this.api.registerRoute('get', '/api/stt-ticker/config', (req, res) => {
      res.json({
        success: true,
        config: this._getSafeConfig()
      });
    });

    // Config aktualisieren — schützt gespeicherte Secrets (ollama apiKey)
    this.api.registerRoute('post', '/api/stt-ticker/config', (req, res) => {
      try {
        const body = req.body || {};
        // Wenn apiKey nicht im body → bestehenden beibehalten
        // (UI sendet Key nur beim ersten Mal oder bei explizitem Ändern)
        if (body.translation && Object.prototype.hasOwnProperty.call(body.translation, 'apiKey')) {
          const newKey = String(body.translation.apiKey || '').trim();
          if (newKey === '' || newKey === '__KEEP__') {
            // Explizit "behalten" oder leer (in Update) → alten Wert nicht überschreiben
            delete body.translation.apiKey;
          }
        }
        this.config = this.configManager.update(body);
        if (this.textBuffer) {
          this.textBuffer.updateConfig(this.config);
        }
        if (this.asrPipeline) {
          this.asrPipeline.updateConfig(this.config);
        }
        if (this.translator) {
          this.translator.updateConfig(this.config);
        }
        this._emitStatus();
        res.json({ success: true, config: this._getSafeConfig() });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ASR-spezifische Settings (Sprache, VAD) — gekapselter Endpoint
    this.api.registerRoute('post', '/api/stt-ticker/asr/settings', (req, res) => {
      try {
        const body = req.body || {};
        const update = {};

        // WICHTIG: 'asr.deepgramApiKey === "__KEEP__"' bedeutet "unverändert lassen".
        // Sonst würde _deepMerge den String literal in die Config schreiben
        // und der User wäre ausgesperrt.
        if (body.asr) {
          const asrUpdate = Object.assign({}, body.asr);
          if (asrUpdate.deepgramApiKey === '__KEEP__' || asrUpdate.deepgramApiKey === '') {
            delete asrUpdate.deepgramApiKey;
          }
          if (asrUpdate.elevenlabsApiKey === '__KEEP__' || asrUpdate.elevenlabsApiKey === '') {
            delete asrUpdate.elevenlabsApiKey;
          }
          if (asrUpdate.fishaudioApiKey === '__KEEP__' || asrUpdate.fishaudioApiKey === '') {
            delete asrUpdate.fishaudioApiKey;
          }
          update.asr = asrUpdate;
        }
        if (body.vad) update.vad = body.vad;
        if (body.dualLanguage) update.dualLanguage = body.dualLanguage;
        if (body.multiLanguage) update.multiLanguage = body.multiLanguage;
        if (body.langDetect) update.langDetect = body.langDetect;
        if (body.overlay && body.overlay.design) update.overlay = { design: body.overlay.design };

        this.config = this.configManager.update(update);
        if (this.textBuffer) this.textBuffer.updateConfig(this.config);
        if (this.asrPipeline) this.asrPipeline.updateConfig(this.config);

        this._emitStatus();
        // Status mit Provider-Info zurückgeben
        const provider = this.asrPipeline ? this.asrPipeline.getStatus() : {};
        res.json({
          success: true,
          asr: this.config.asr,
          vad: this.config.vad,
          dualLanguage: this.config.dualLanguage,
          langDetect: this.config.langDetect,
          provider: provider
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Liefert nur die VAD-Einstellungen (für capture.html, das keinen vollen Config-Zugriff braucht)
    this.api.registerRoute('get', '/api/stt-ticker/vad/settings', (req, res) => {
      res.json({
        success: true,
        vad: this.config.vad || {},
        asr: {
          provider: this.config.asr?.provider,
          languageMode: this.config.asr?.languageMode,
          languageDefault: this.config.asr?.languageDefault,
          languageFixed: this.config.asr?.languageFixed
        },
        multiLanguage: this.config.multiLanguage || {}
      });
    });

    // Liefert die Multi-Language-Einstellungen (für capture.html)
    this.api.registerRoute('get', '/api/stt-ticker/multilang/settings', (req, res) => {
      res.json({
        success: true,
        multiLanguage: this.config.multiLanguage || {}
      });
    });

    // Multi-Language Settings speichern
    this.api.registerRoute('post', '/api/stt-ticker/multilang/settings', (req, res) => {
      try {
        const body = req.body || {};
        const update = {};
        if (body.multiLanguage) {
          update.multiLanguage = body.multiLanguage;
        }
        // Auch Translation-Modell aus der capture.html akzeptieren
        if (body.translation && body.translation.model) {
          update.translation = Object.assign({}, this.config.translation || {}, { model: body.translation.model });
        }
        // Auch ASR-Provider/Modell aus der capture.html akzeptieren
        if (body.asr) {
          const asrUpdate = Object.assign({}, this.config.asr || {});
          if (body.asr.provider) asrUpdate.provider = body.asr.provider;
          if (body.asr.deepgramModel) asrUpdate.deepgramModel = body.asr.deepgramModel;
          if (body.asr.elevenlabsModel) asrUpdate.elevenlabsModel = body.asr.elevenlabsModel;
          update.asr = asrUpdate;
        }
        if (Object.keys(update).length > 0) {
          this.config = this.configManager.update(update);
          if (this.textBuffer) this.textBuffer.updateConfig(this.config);
          if (this.asrPipeline) this.asrPipeline.updateConfig(this.config);
          if (this.translator) this.translator.updateConfig(this.config);
          this._emitStatus();
        }
        res.json({ success: true, multiLanguage: this.config.multiLanguage, translation: this.config.translation, asr: this.config.asr });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Testet ob der konfigurierte Deepgram-Key gültig ist
    this.api.registerRoute('post', '/api/stt-ticker/asr/test-deepgram', async (req, res) => {
      try {
        const body = req.body || {};
        const key = (body.apiKey && body.apiKey.trim()) || (this.config.asr && this.config.asr.deepgramApiKey) || '';
        if (!key.trim()) {
          return res.json({ success: false, error: 'Kein Deepgram-Key konfiguriert' });
        }
        const DeepgramAsrClient = require('./backend/asr/deepgram-client');
        const client = new DeepgramAsrClient(key, this.logger, { timeout: 10000 });
        const result = await client.testConnection();
        if (result.ok) {
          this.logger.info('STT Ticker: Deepgram test-connection successful');
        } else {
          this.logger.warn('STT Ticker: Deepgram test-connection failed: ' + (result.message || result.status));
        }
        res.json({ success: result.ok, ...result });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    // Testet ob der konfigurierte ElevenLabs-Key gültig ist
    this.api.registerRoute('post', '/api/stt-ticker/asr/test-elevenlabs', async (req, res) => {
      try {
        const body = req.body || {};
        const key = (body.apiKey && body.apiKey.trim()) || (this.config.asr && this.config.asr.elevenlabsApiKey) || '';
        if (!key.trim()) {
          return res.json({ success: false, error: 'Kein ElevenLabs-Key konfiguriert' });
        }
        const ElevenLabsAsrClient = require('./backend/asr/elevenlabs-client');
        const client = new ElevenLabsAsrClient(key, this.logger, { timeout: 10000 });
        const result = await client.testConnection();
        if (result.ok) {
          this.logger.info('STT Ticker: ElevenLabs test-connection successful');
        } else {
          this.logger.warn('STT Ticker: ElevenLabs test-connection failed: ' + (result.message || result.status));
        }
        res.json({ success: result.ok, ...result });
      } catch (error) {
        res.json({ success: false, error: error.message });
      }
    });

    // Liste der verfügbaren ElevenLabs-Modelle
    this.api.registerRoute('get', '/api/stt-ticker/asr/elevenlabs/models', (req, res) => {
      const ElevenLabsAsrClient = require('./backend/asr/elevenlabs-client');
      res.json({
        success: true,
        models: Object.entries(ElevenLabsAsrClient.MODELS).map(([id, info]) => ({ id, ...info }))
      });
    });

    // Liste der verfügbaren Deepgram-Modelle
    this.api.registerRoute('get', '/api/stt-ticker/asr/deepgram/models', (req, res) => {
      const DeepgramAsrClient = require('./backend/asr/deepgram-client');
      res.json({
        success: true,
        models: Object.entries(DeepgramAsrClient.MODELS).map(([id, info]) => ({ id, ...info }))
      });
    });

    // Status abrufen
    this.api.registerRoute('get', '/api/stt-ticker/status', (req, res) => {
      res.json({
        success: true,
        status: this._getStatus()
      });
    });

    // Audio transkribieren (Haupt-Endpoint für Browser-Mikrofon)
    this.api.registerRoute('post', '/api/stt-ticker/transcribe', (req, res) => {
      return this._handleTranscribeRoute(req, res);
    });

    // Buffer leeren
    this.api.registerRoute('post', '/api/stt-ticker/clear', (req, res) => {
      if (this.textBuffer) {
        this.textBuffer.clear();
      }
      this._clearVrchatChatboxQueue();
      this._emitTranscript({ text: '', segments: [], cleared: true });
      res.json({ success: true, message: 'Buffer cleared' });
    });

    // Translator-Cache leeren
    this.api.registerRoute('post', '/api/stt-ticker/translator/clear-cache', (req, res) => {
      if (this.translator) {
        this.translator.clearCache();
      }
      res.json({ success: true, message: 'Translation cache cleared' });
    });

    // Translator-Status
    this.api.registerRoute('get', '/api/stt-ticker/translator/status', (req, res) => {
      res.json({
        success: true,
        status: this.translator ? this.translator.getStatus() : { enabled: false, configured: false }
      });
    });

    // Translator-Modelle abrufen (von Ollama Cloud API oder Fallback-Liste)
    this.api.registerRoute('get', '/api/stt-ticker/translator/models', async (req, res) => {
      try {
        const apiKey = req.query.apiKey || this.config.translation?.apiKey;
        const models = this.translator ? await this.translator.fetchModels(apiKey) : [];
        res.json({ success: true, models });
      } catch (error) {
        res.json({ success: false, error: error.message, models: [] });
      }
    });

    // Translator-Sprachenliste
    this.api.registerRoute('get', '/api/stt-ticker/translator/languages', (req, res) => {
      const languages = this.translator ? this.translator.getLanguages() : [];
      res.json({ success: true, languages });
    });
  }

  // ==================== Socket Events ====================

  _registerSocketEvents() {
    this.api.registerSocket('stt-ticker:get-status', () => {
      this._emitStatus();
    });

    this.api.registerSocket('stt-ticker:get-transcript', () => {
      const current = this.textBuffer ? this.textBuffer.getCurrent() : null;
      if (current) {
        this.io.emit('stt-ticker:transcript', current);
      }
    });
  }

  // ==================== Transcribe Route ====================

  _handleTranscribeRoute(req, res) {
    if (!this.config.enabled) {
      return this._sendError(res, 503, 'TICKER_DISABLED', 'STT Ticker is disabled');
    }

    const upload = this._createUploadMiddleware();
    return new Promise((resolve) => {
      upload(req, res, async (uploadError) => {
        try {
          if (uploadError) {
            this._handleUploadError(res, uploadError);
            return;
          }
          await this._processAudio(req, res);
        } catch (error) {
          this.logger.warn(`STT Ticker route failed: ${error.message}`);
          this._sendError(res, 500, 'TICKER_ROUTE_ERROR', 'STT Ticker route failed');
        } finally {
          resolve();
        }
      });
    });
  }

  _createUploadMiddleware() {
    return multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: this.config.maxAudioBytes || 4 * 1024 * 1024,
        files: 1,
        fields: 4,
        parts: 6,
        fieldSize: 1024
      },
      fileFilter: (req, file, callback) => {
        const mimeType = file.mimetype.toLowerCase();
        if (ASR_SAFE_AUDIO_MIME_TYPES.has(mimeType)) {
          return callback(null, true);
        }
        if (mimeType === 'application/octet-stream' && this._hasAllowedExtension(file.originalname)) {
          return callback(null, true);
        }
        const error = new Error('Unsupported audio MIME type');
        error.code = 'TICKER_UNSUPPORTED_MIME';
        return callback(error);
      }
    }).single(ASR_AUDIO_FIELD);
  }

  _hasAllowedExtension(filename) {
    const ext = path.extname(filename || '').toLowerCase();
    return ASR_OCTET_AUDIO_EXTENSIONS.has(ext);
  }

  _handleUploadError(res, error) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return this._sendError(res, 413, 'TICKER_UPLOAD_TOO_LARGE', 'Audio upload exceeds limit');
    }
    if (error.code === 'TICKER_UNSUPPORTED_MIME') {
      return this._sendError(res, 415, 'TICKER_UNSUPPORTED_MIME', 'Unsupported audio MIME type');
    }
    return this._sendError(res, 400, 'TICKER_UPLOAD_INVALID', 'Invalid audio upload');
  }

  async _processAudio(req, res) {
    const file = req.file;
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      return this._sendError(res, 400, 'TICKER_UPLOAD_REQUIRED', 'Audio file required');
    }

    const startedAt = Date.now();
    let transcript;

    this._startVrchatChatboxTyping();

    try {
      // ASR-Pipeline transkribieren
      // Sprache wird intern aus config.asr.languageMode/languageFixed aufgelöst
      transcript = await this.asrPipeline.transcribe(file.buffer, {
        mimeType: file.mimetype,
        filename: file.originalname
      });
    } catch (error) {
      this._stopVrchatChatboxTyping();
      this.logger.warn(`STT Ticker transcription failed: ${error.message}`);
      return this._sendError(res, 502, 'TICKER_ASR_FAILED', error.message || 'Transcription failed', true);
    }

    const text = String(transcript.text || '').trim();
    const latencyMs = Date.now() - startedAt;

    if (text.length < (this.config.minTranscriptChars || 2)) {
      this._stopVrchatChatboxTyping();
      return res.json({
        success: true,
        transcript: {
          text,
          segments: transcript.segments || [],
          language: transcript.language || 'unknown',
          languageSource: transcript.languageSource || 'fallback'
        },
        accepted: false,
        reason: 'transcript-too-short',
        latencyMs
      });
    }

    // Optional: Übersetzung via Ollama Cloud
    let translation = null;
    const multiCfg = this.config.multiLanguage || {};
    const multiLanguageActive = multiCfg.enabled
      && Array.isArray(multiCfg.outputLanguages)
      && multiCfg.outputLanguages.length > 0;

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

    // Aktuelle Buffer-Ausgabe holen und via Socket senden
    const output = this.textBuffer ? this.textBuffer.getCurrent() : {
      text,
      segments: transcript.segments || [],
      translation,
      dual: null
    };
    this._emitTranscript(output);
    this._queueVrchatChatboxText(text);

    return res.json({
      success: true,
      transcript: output,
      accepted: true,
      latencyMs,
      language: transcript.language,
      languageSource: transcript.languageSource
    });
  }

  // ==================== Socket Emitters ====================

  _emitTranscript(data) {
    if (this.destroyed) return;
    this.io.emit('stt-ticker:transcript', data);
  }

  _emitStatus() {
    if (this.destroyed) return;
    this.io.emit('stt-ticker:status', this._getStatus());
  }

  _routeCaptionSegments(transcript) {
    const routed = routeTranscriptSegments(transcript, this.config);
    if (routed.length > 0) return routed;

    return [{
      text: String(transcript.text || '').trim(),
      language: transcript.language || this.config.multiLanguage?.defaultLanguage || 'de',
      languageSource: transcript.languageSource || 'fallback'
    }].filter(segment => segment.text);
  }

  _isVrchatChatboxEnabled() {
    return this.config?.vrchatChatbox?.enabled === true;
  }

  _getVrchatBridge() {
    if (typeof this.api.getPlugin === 'function') {
      return this.api.getPlugin('osc-bridge');
    }
    if (typeof this.api.pluginLoader?.getPluginInstance === 'function') {
      return this.api.pluginLoader.getPluginInstance('osc-bridge');
    }
    return this.api.pluginLoader?.loadedPlugins?.get('osc-bridge')?.instance || null;
  }

  _isVrchatBridgeAvailable() {
    const bridge = this._getVrchatBridge();
    if (!bridge) return false;
    if (typeof bridge.getStatus === 'function') return bridge.getStatus().isRunning === true;
    return bridge.isRunning === true;
  }

  _markVrchatBridgeUnavailable() {
    this.vrchatChatboxLastError = 'OSC Bridge nicht verfuegbar';
  }

  _emitVrchatChatboxIntent(intent) {
    if (!this._isVrchatBridgeAvailable()) {
      this._markVrchatBridgeUnavailable();
      return false;
    }
    if (typeof this.api.emit !== 'function') {
      this.vrchatChatboxLastError = 'Plugin-Event-Bus nicht verfuegbar';
      return false;
    }
    this.vrchatChatboxLastError = null;
    return this.api.emit(VRCHAT_CHATBOX_EVENT, intent) !== false;
  }

  _startVrchatChatboxTyping() {
    if (!this._isVrchatChatboxEnabled() || this.vrchatChatboxTyping) return;
    if (this._emitVrchatChatboxIntent({ type: 'typing', visible: true })) {
      this.vrchatChatboxTyping = true;
    }
  }

  _stopVrchatChatboxTyping() {
    if (!this.vrchatChatboxTyping) return;
    this.vrchatChatboxTyping = false;
    this._emitVrchatChatboxIntent({ type: 'typing', visible: false });
  }

  _queueVrchatChatboxText(text) {
    if (!this._isVrchatChatboxEnabled()) return false;
    if (!this._isVrchatBridgeAvailable()) {
      this._markVrchatBridgeUnavailable();
      return false;
    }

    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return false;

    this._startVrchatChatboxTyping();
    this.vrchatChatboxParts.push(normalized);
    if (this.vrchatChatboxTimer) clearTimeout(this.vrchatChatboxTimer);
    this.vrchatChatboxTimer = setTimeout(() => this._flushVrchatChatboxText(), VRCHAT_CHATBOX_DEBOUNCE_MS);
    return true;
  }

  _flushVrchatChatboxText() {
    this.vrchatChatboxTimer = null;
    const text = this.vrchatChatboxParts.join(' ').replace(/\s+/g, ' ').trim();
    this.vrchatChatboxParts = [];
    if (!text) {
      this._stopVrchatChatboxTyping();
      return false;
    }

    if (!this._isVrchatBridgeAvailable()) {
      this._markVrchatBridgeUnavailable();
      this.vrchatChatboxTyping = false;
      return false;
    }

    this._stopVrchatChatboxTyping();
    return this._emitVrchatChatboxIntent({
      type: 'send',
      messages: this._splitVrchatChatboxText(text)
    });
  }

  _splitVrchatChatboxText(text) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    const messages = [];
    let current = '';

    for (let word of words) {
      while (word.length > VRCHAT_CHATBOX_MAX_CHARS) {
        if (current) {
          messages.push(current);
          current = '';
        }
        messages.push(word.slice(0, VRCHAT_CHATBOX_MAX_CHARS));
        word = word.slice(VRCHAT_CHATBOX_MAX_CHARS);
      }
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > VRCHAT_CHATBOX_MAX_CHARS && current) {
        messages.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) messages.push(current);
    return messages;
  }

  _clearVrchatChatboxQueue() {
    if (this.vrchatChatboxTimer) clearTimeout(this.vrchatChatboxTimer);
    this.vrchatChatboxTimer = null;
    this.vrchatChatboxParts = [];
    this._stopVrchatChatboxTyping();
  }

  // ==================== Status ====================

  _getStatus() {
    const asrStatus = this.asrPipeline ? this.asrPipeline.getStatus() : {};
    const bufferStats = this.textBuffer ? this.textBuffer.getStats() : {};
    const translatorStatus = this.translator ? this.translator.getStatus() : {};

    return {
      enabled: this.config.enabled,
      asr: {
        ttsAvailable: asrStatus.ttsAvailable,
        ttsHasAsr: asrStatus.ttsHasAsr,
        provider: asrStatus.provider,         // effective: 'fish.audio' | 'deepgram' | 'elevenlabs'
        providerConfig: asrStatus.providerConfig,
        deepgramConfigured: asrStatus.deepgramConfigured,
        deepgramModel: asrStatus.deepgramModel,
        elevenlabsConfigured: asrStatus.elevenlabsConfigured,
        elevenlabsModel: asrStatus.elevenlabsModel,
        fishaudioConfigured: asrStatus.fishaudioConfigured,
        diagnostics: asrStatus.diagnostics
      },
      buffer: bufferStats,
      translation: translatorStatus,
      vrchatChatbox: {
        enabled: this._isVrchatChatboxEnabled(),
        bridgeAvailable: this._isVrchatBridgeAvailable(),
        pendingSegments: this.vrchatChatboxParts.length,
        lastError: this.vrchatChatboxLastError
      },
      config: this._getSafeConfig()
    };
  }

  _getSafeConfig() {
    if (!this.config) return {};
    const safe = JSON.parse(JSON.stringify(this.config));
    // API-Key NICHT maskieren — die UI ist nur für den Admin sichtbar
    return safe;
  }

  // ==================== Helpers ====================

  _sendError(res, status, code, message, countAsError = false) {
    if (countAsError && this.asrPipeline) {
      this.asrPipeline.recordError(message);
    }
    return res.status(status).json({
      success: false,
      error: code,
      message
    });
  }
}

module.exports = SttTickerPlugin;
