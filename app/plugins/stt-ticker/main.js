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
const { ConfigManager, DEFAULT_CONFIG } = require('./backend/config');

// Audio-MIME-Types (identisch zu Sidekick)
const ASR_AUDIO_FIELD = 'audio';
const ASR_SAFE_AUDIO_MIME_TYPES = new Set([
  'audio/webm', 'audio/ogg', 'audio/opus', 'audio/wav',
  'audio/wave', 'audio/x-wav', 'audio/mpeg', 'audio/mp3',
  'audio/mp4', 'audio/m4a', 'audio/aac'
]);
const ASR_OCTET_AUDIO_EXTENSIONS = new Set(['.webm', '.ogg', '.opus', '.wav', '.mp3', '.mpeg', '.mp4', '.m4a', '.aac']);

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

    // Config aktualisieren
    this.api.registerRoute('post', '/api/stt-ticker/config', (req, res) => {
      try {
        this.config = this.configManager.update(req.body);
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

    try {
      // ASR-Pipeline transkribieren (mit Sidekick-Fallback-Strategie)
      transcript = await this.asrPipeline.transcribe(file.buffer, {
        mimeType: file.mimetype,
        filename: file.originalname,
        language: this.config.language || undefined
      });
    } catch (error) {
      this.logger.warn(`STT Ticker transcription failed: ${error.message}`);
      return this._sendError(res, 502, 'TICKER_ASR_FAILED', error.message || 'Transcription failed', true);
    }

    const text = String(transcript.text || '').trim();
    const latencyMs = Date.now() - startedAt;

    if (text.length < (this.config.minTranscriptChars || 2)) {
      return res.json({
        success: true,
        transcript: { text, segments: transcript.segments || [] },
        accepted: false,
        reason: 'transcript-too-short',
        latencyMs
      });
    }

    // Optional: Übersetzung via Ollama Cloud
    let translation = null;
    if (this.translator && this.config.translation?.enabled && this.config.translation?.apiKey) {
      try {
        translation = await this.translator.translate(text);
      } catch (error) {
        this.logger.warn(`STT Ticker translation failed: ${error.message}`);
        // Non-fatal — wir senden trotzdem den Originaltext
      }
    }

    // Text in den Buffer einfügen
    if (this.textBuffer) {
      this.textBuffer.push({
        text,
        segments: transcript.segments || [],
        provider: transcript.provider || 'fish.audio',
        timestamp: Date.now(),
        latencyMs,
        translation  // Übersetzung anhängen
      });
    }

    // Aktuelle Buffer-Ausgabe holen und via Socket senden
    const output = this.textBuffer ? this.textBuffer.getCurrent() : {
      text,
      segments: transcript.segments || [],
      translation
    };
    this._emitTranscript(output);

    return res.json({
      success: true,
      transcript: output,
      accepted: true,
      latencyMs
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
        diagnostics: asrStatus.diagnostics
      },
      buffer: bufferStats,
      translation: translatorStatus,
      config: this._getSafeConfig()
    };
  }

  _getSafeConfig() {
    if (!this.config) return {};
    const safe = JSON.parse(JSON.stringify(this.config));
    // Sensitive Felder entfernen
    if (safe.translation) {
      safe.translation = { ...safe.translation };
      safe.translation.apiKey = safe.translation.apiKey ? '••••••••' : '';
    }
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
