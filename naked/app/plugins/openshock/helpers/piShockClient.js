const axios = require('axios');

/**
 * PiShock API Client - Production Ready
 *
 * Provides full integration with PiShock API including:
 * - ShareCode-based device management (manual configuration, no discovery API)
 * - Shock/Vibrate/Beep commands
 * - Rate limiting
 * - Retry logic with exponential backoff
 * - Comprehensive error handling
 * - Connection testing
 *
 * Implements the same interface as OpenShockClient so the rest of the plugin
 * (QueueManager, SafetyManager, ZappieHellManager, etc.) works unchanged.
 *
 * API differences vs OpenShock:
 * - Auth: Username + Apikey + Code in JSON body (no header token)
 * - Endpoint: POST https://do.pishock.com/api/apioperate/
 * - Op codes: 0=Shock, 1=Vibrate, 2=Beep (integers)
 * - Intensity: string "0"-"100"
 * - Duration: string "1"-"15" (seconds, not milliseconds!)
 * - No batch endpoint → sequential execution
 * - No device discovery → ShareCodes configured manually
 *
 * @class PiShockClient
 */
class PiShockClient {
    /**
     * Erstellt eine PiShock-Client-Instanz.
     *
     * @param {Object} config - PiShock-Konfiguration
     * @param {string} config.username - PiShock-Benutzername
     * @param {string} config.apiKey - PiShock API-Key
     * @param {Array<{code: string, name: string}>} [config.shareCodes=[]] - Liste der ShareCodes
     * @param {Object} [logger=console] - Logger-Instanz (muss info, warn, error haben)
     */
    constructor(config = {}, logger = console) {
        this.logger = logger;

        // Konfiguration übernehmen
        const { username = '', apiKey = '', shareCodes = [] } = config;

        this.username = username ? username.trim() : '';
        this.apiKey = apiKey ? apiKey.trim() : '';
        this.shareCodes = Array.isArray(shareCodes) ? shareCodes : [];

        // isConfigured: true wenn Username und ApiKey gesetzt
        this.isConfigured = !!(this.username && this.apiKey);

        // PiShock API endpoint
        this.apiUrl = 'https://do.pishock.com/api/apioperate/';

        // Rate-Limiting (konservativ: 30 Anfragen/Minute)
        this.rateLimitWindow = 60000;
        this.maxRequestsPerWindow = 30;
        this.requestTimestamps = [];

        // Gerätekühlung (minimaler Abstand zwischen Befehlen an dasselbe Gerät)
        this.deviceCooldowns = new Map();
        this.minCooldownMs = 200; // 200ms minimum zwischen Befehlen

        // Retry-Konfiguration
        this.maxRetries = 3;
        this.retryDelayBase = 1000; // 1s Basis-Delay

        // Timeout
        this.defaultTimeout = 30000;

        // Statistik
        this._stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            rateLimitHits: 0
        };

        // Axios-Instanz
        this.axiosInstance = axios.create({
            timeout: this.defaultTimeout,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'TikTokHelper/1.0 PiShockClient'
            }
        });

        this._setupInterceptors();

        this.logger.info('PiShockClient initialized', {
            username: this.username || '(not set)',
            shareCodes: this.shareCodes.length,
            isConfigured: this.isConfigured
        });
    }

    // ============================================================
    // PRIVATE: Axios-Interceptors
    // ============================================================

    /**
     * Richtet Axios-Interceptors für Logging und Fehlerbehandlung ein.
     * @private
     */
    _setupInterceptors() {
        this.axiosInstance.interceptors.request.use(
            (config) => {
                // API-Key aus dem Log maskieren
                this.logger.info('PiShock API Request', {
                    method: config.method?.toUpperCase(),
                    url: config.url
                });
                return config;
            },
            (error) => {
                this.logger.error('PiShock Request Error', { error: error.message });
                return Promise.reject(error);
            }
        );

        this.axiosInstance.interceptors.response.use(
            (response) => {
                this.logger.info('PiShock API Response', {
                    status: response.status,
                    data: typeof response.data === 'string' ? response.data.substring(0, 100) : response.data
                });
                return response;
            },
            (error) => {
                const errorInfo = {
                    message: error.message,
                    status: error.response?.status,
                    data: error.response?.data
                };
                this.logger.error('PiShock Response Error', errorInfo);
                return Promise.reject(error);
            }
        );
    }

    // ============================================================
    // PUBLIC: Verbindungstest & Validierung
    // ============================================================

    /**
     * Validiert den API-Key durch einen Test-Request.
     *
     * @returns {Promise<boolean>} True wenn gültig
     * @throws {Error} Bei ungültigen Credentials
     */
    async validateApiKey() {
        const result = await this.testConnection();
        if (!result.success) {
            throw new Error(`PiShock API key validation failed: ${result.error}`);
        }
        return true;
    }

    /**
     * Testet die Verbindung zur PiShock API.
     * Sendet einen minimalen Vibrate-Befehl (Op 1, 0% Intensity, 1s) über den ersten ShareCode.
     *
     * @returns {Promise<Object>} { success, latency, deviceCount, error, timestamp }
     */
    async testConnection() {
        if (!this.isConfigured) {
            return {
                success: false,
                error: 'PiShock credentials not configured (username and API key required)',
                timestamp: new Date().toISOString()
            };
        }

        if (this.shareCodes.length === 0) {
            return {
                success: false,
                error: 'No ShareCodes configured. Please add at least one ShareCode.',
                timestamp: new Date().toISOString()
            };
        }

        const startTime = Date.now();
        const testShareCode = this.shareCodes[0];

        try {
            // Minimaler Vibrate-Test: Op 1, Intensity 0, Duration 1s
            const payload = this._buildPayload(testShareCode.code, 1, 0, 1);
            await this._executeRequest(payload);

            const latency = Date.now() - startTime;
            const result = {
                success: true,
                latency,
                deviceCount: this.shareCodes.length,
                timestamp: new Date().toISOString()
            };

            this.logger.info('PiShock connection test successful', result);
            return result;

        } catch (error) {
            const result = {
                success: false,
                latency: Date.now() - startTime,
                error: error.message,
                timestamp: new Date().toISOString()
            };

            this.logger.error('PiShock connection test failed', result);
            return result;
        }
    }

    // ============================================================
    // PUBLIC: Konfiguration aktualisieren
    // ============================================================

    /**
     * Aktualisiert die PiShock-Konfiguration.
     *
     * @param {Object} config - Neue Konfiguration (username, apiKey, shareCodes)
     */
    updateConfig(config = {}) {
        if (config.username !== undefined) {
            this.username = config.username ? config.username.trim() : '';
        }
        if (config.apiKey !== undefined) {
            this.apiKey = config.apiKey ? config.apiKey.trim() : '';
        }
        if (config.shareCodes !== undefined) {
            this.shareCodes = Array.isArray(config.shareCodes) ? config.shareCodes : [];
        }

        this.isConfigured = !!(this.username && this.apiKey);

        this.logger.info('PiShockClient configuration updated', {
            username: this.username || '(not set)',
            shareCodes: this.shareCodes.length,
            isConfigured: this.isConfigured
        });
    }

    // ============================================================
    // PUBLIC: Geräteverwaltung
    // ============================================================

    /**
     * Gibt die konfigurierten ShareCodes als Device-Objekte zurück.
     * PiShock hat keine Device-Discovery-API – ShareCodes werden manuell konfiguriert.
     *
     * @returns {Promise<Array>} Array von Device-Objekten (kompatibel mit OpenShock-Format)
     */
    async getDevices() {
        if (!this.isConfigured) {
            this.logger.warn('PiShockClient: Cannot get devices – credentials not configured');
            return [];
        }

        // ShareCodes als Devices formatieren (kompatibel mit dem Rest des Plugins)
        const devices = this.shareCodes.map((sc) => ({
            id: sc.code,           // ShareCode als device ID
            name: sc.name || sc.code,
            rfId: null,
            model: 'PiShock',
            isPaused: false,
            createdOn: null,
            deviceId: sc.code,
            deviceName: sc.name || sc.code,
            type: 'PiShock',
            online: true,
            battery: null,
            rssi: null,
            // PiShock-spezifische Felder
            shareCode: sc.code,
            provider: 'pishock'
        }));

        this.logger.info(`PiShockClient: returning ${devices.length} device(s) from ShareCodes`);
        return devices;
    }

    /**
     * Gibt ein einzelnes Device anhand seiner ID (= ShareCode) zurück.
     *
     * @param {string} deviceId - ShareCode
     * @returns {Promise<Object|null>} Device-Objekt oder null
     */
    async getDevice(deviceId) {
        const allDevices = await this.getDevices();
        return allDevices.find((d) => d.id === deviceId) || null;
    }

    // ============================================================
    // PUBLIC: Befehlsausführung
    // ============================================================

    /**
     * Sendet einen Shock-Befehl (Op 0) an ein Gerät.
     *
     * @param {string} deviceId - ShareCode des Geräts
     * @param {number} intensity - Intensität (1-100)
     * @param {number} duration - Dauer in Millisekunden (wird auf 1-15 Sekunden geklammert)
     * @param {Object} [options={}] - Zusätzliche Optionen
     * @returns {Promise<Object>} Ergebnis der API-Anfrage
     */
    async sendShock(deviceId, intensity, duration, options = {}) {
        return this._sendCommand(deviceId, 0, intensity, duration, options);
    }

    /**
     * Sendet einen Vibrate-Befehl (Op 1) an ein Gerät.
     *
     * @param {string} deviceId - ShareCode des Geräts
     * @param {number} intensity - Intensität (1-100)
     * @param {number} duration - Dauer in Millisekunden (wird auf 1-15 Sekunden geklammert)
     * @param {Object} [options={}] - Zusätzliche Optionen
     * @returns {Promise<Object>} Ergebnis der API-Anfrage
     */
    async sendVibrate(deviceId, intensity, duration, options = {}) {
        return this._sendCommand(deviceId, 1, intensity, duration, options);
    }

    /**
     * Sendet einen Beep/Sound-Befehl (Op 2) an ein Gerät.
     *
     * @param {string} deviceId - ShareCode des Geräts
     * @param {number} intensity - Intensität (1-100)
     * @param {number} duration - Dauer in Millisekunden (wird auf 1-15 Sekunden geklammert)
     * @param {Object} [options={}] - Zusätzliche Optionen
     * @returns {Promise<Object>} Ergebnis der API-Anfrage
     */
    async sendSound(deviceId, intensity, duration, options = {}) {
        return this._sendCommand(deviceId, 2, intensity, duration, options);
    }

    /**
     * Generischer Befehlssender – leitet je nach type an sendShock/sendVibrate/sendSound weiter.
     * Kompatibel mit dem OpenShockClient-Interface.
     *
     * @param {string} deviceId - ShareCode des Geräts
     * @param {Object} command - Befehlsobjekt { type, intensity, duration }
     * @param {Object} [options={}] - Zusätzliche Optionen
     * @returns {Promise<Object>} Ergebnis der API-Anfrage
     */
    async sendControl(deviceId, command, options = {}) {
        const { type, intensity, duration } = command;

        // Typ normalisieren (erste Buchstabe groß, Rest klein) – analog zu OpenShockClient
        let normalizedType = type;
        if (typeof type === 'string') {
            normalizedType = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
            if (normalizedType === 'Beep') {
                normalizedType = 'Sound';
            }
        }

        switch (normalizedType) {
            case 'Shock':
                return this.sendShock(deviceId, intensity, duration, options);
            case 'Vibrate':
                return this.sendVibrate(deviceId, intensity, duration, options);
            case 'Sound':
                return this.sendSound(deviceId, intensity, duration, options);
            default:
                throw new Error(`Unknown command type: ${type}. Must be one of: shock, vibrate, sound`);
        }
    }

    /**
     * Sendet mehrere Befehle sequentiell (PiShock hat kein Batch-Endpoint).
     *
     * @param {Array<Object>} commands - Array von Befehlsobjekten
     * @param {Object} [options={}] - Zusätzliche Optionen
     * @returns {Promise<Array>} Array der Einzelergebnisse
     */
    async sendBatch(commands, options = {}) {
        if (!Array.isArray(commands) || commands.length === 0) {
            throw new Error('Commands must be a non-empty array');
        }

        this.logger.info(`PiShockClient: Executing ${commands.length} commands sequentially (no batch API)`);

        const results = [];
        for (const cmd of commands) {
            try {
                const result = await this.sendControl(cmd.deviceId, {
                    type: cmd.type,
                    intensity: cmd.intensity,
                    duration: cmd.duration
                }, options);
                results.push({ success: true, result });
            } catch (error) {
                this.logger.error(`PiShockClient: Batch command failed for device ${cmd.deviceId}`, {
                    error: error.message
                });
                results.push({ success: false, error: error.message });
            }
        }

        return results;
    }

    // ============================================================
    // PUBLIC: Status & Statistik
    // ============================================================

    /**
     * Gibt den Rate-Limit-Status zurück (kompatibel mit OpenShockClient.getRateLimitStatus()).
     *
     * @returns {Object} Rate-Limit-Informationen
     */
    getRateLimitStatus() {
        const now = Date.now();
        const windowStart = now - this.rateLimitWindow;
        const recentRequests = this.requestTimestamps.filter((ts) => ts > windowStart).length;
        const oldestTimestamp = this.requestTimestamps.length > 0 ? this.requestTimestamps[0] : now;

        return {
            used: recentRequests,
            remaining: Math.max(0, this.maxRequestsPerWindow - recentRequests),
            resetAt: new Date(oldestTimestamp + this.rateLimitWindow).toISOString(),
            queueLength: 0, // PiShock verwendet keine interne Queue
            activeRequests: 0
        };
    }

    /**
     * Gibt Client-Statistiken zurück (kompatibel mit OpenShockClient.getStats()).
     *
     * @returns {Object} Statistik-Objekt
     */
    getStats() {
        return {
            provider: 'pishock',
            isConfigured: this.isConfigured,
            rateLimit: this.getRateLimitStatus(),
            deviceCount: this.shareCodes.length,
            requests: { ...this._stats },
            config: {
                username: this.username || '(not set)',
                shareCodes: this.shareCodes.length
            }
        };
    }

    /**
     * Leert die interne Queue (No-Op bei PiShock, da keine interne Queue existiert).
     * Kompatibel mit OpenShockClient.clearQueue().
     */
    clearQueue() {
        this.logger.info('PiShockClient: clearQueue() called (no-op – PiShock has no internal queue)');
    }

    /**
     * Bereinigt den Client (Timer, EventListener, etc.).
     * Kompatibel mit OpenShockClient.destroy().
     */
    destroy() {
        this.deviceCooldowns.clear();
        this.requestTimestamps.length = 0;
        this.logger.info('PiShockClient destroyed');
    }

    // ============================================================
    // PRIVATE: Hilfsmethoden
    // ============================================================

    /**
     * Löst einen ShareCode aus der Konfiguration anhand der deviceId auf.
     *
     * @private
     * @param {string} deviceId - ShareCode (= device ID)
     * @returns {string} Aufgelöster ShareCode
     * @throws {Error} Wenn der ShareCode nicht gefunden wird
     */
    _resolveShareCode(deviceId) {
        if (!deviceId) {
            throw new Error('PiShock: Device ID (ShareCode) is required');
        }

        // Prüfen ob der deviceId selbst ein bekannter ShareCode ist
        const entry = this.shareCodes.find((sc) => sc.code === deviceId);
        if (entry) {
            return entry.code;
        }

        // Wenn keine shareCodes konfiguriert sind, deviceId direkt verwenden
        // (erlaubt direkte ShareCode-Übergabe als deviceId)
        if (this.shareCodes.length === 0) {
            this.logger.warn(`PiShockClient: No ShareCodes configured, using deviceId "${deviceId}" directly`);
            return deviceId;
        }

        throw new Error(
            `PiShock: ShareCode "${deviceId}" not found in configuration. ` +
            `Available codes: ${this.shareCodes.map((sc) => sc.name || sc.code).join(', ')}`
        );
    }

    /**
     * Konvertiert Millisekunden in PiShock-Sekunden (1-15).
     *
     * PiShock akzeptiert Dauern nur als ganze Sekunden im Bereich 1-15.
     * Rundungsbeispiele: 499ms → 1s, 500ms → 1s, 1499ms → 1s, 1500ms → 2s, 15999ms → 16s → clamped to 15s.
     *
     * @private
     * @param {number} durationMs - Dauer in Millisekunden (z.B. 5000 für 5 Sekunden)
     * @returns {number} Dauer in ganzen Sekunden, geklemmt auf 1-15
     */
    _convertDuration(durationMs) {
        return Math.max(1, Math.min(15, Math.round(durationMs / 1000)));
    }

    /**
     * Klemmt die Intensität auf 0-100.
     *
     * @private
     * @param {number} intensity - Intensität
     * @returns {number} Geklemmte Intensität
     */
    _clampIntensity(intensity) {
        return Math.max(0, Math.min(100, Math.round(intensity)));
    }

    /**
     * Baut den PiShock API-Payload zusammen.
     *
     * @private
     * @param {string} shareCode - ShareCode
     * @param {number} op - Operation (0=Shock, 1=Vibrate, 2=Beep)
     * @param {number} intensity - Intensität (0-100)
     * @param {number} durationSec - Dauer in Sekunden (1-15)
     * @returns {Object} API-Payload
     */
    _buildPayload(shareCode, op, intensity, durationSec) {
        return {
            Username: this.username,
            Name: 'TikTokHelper',
            Code: shareCode,
            Intensity: String(intensity),        // PiShock erwartet Strings
            Duration: String(durationSec),        // PiShock erwartet Strings
            Apikey: this.apiKey,
            Op: op                                // Integer Op-Code
        };
    }

    /**
     * Sendet einen Befehl an die PiShock API.
     *
     * @private
     * @param {string} deviceId - ShareCode
     * @param {number} op - Operation (0=Shock, 1=Vibrate, 2=Beep)
     * @param {number} intensity - Intensität (1-100)
     * @param {number} durationMs - Dauer in Millisekunden
     * @param {Object} options - Zusätzliche Optionen
     * @returns {Promise<Object>} API-Ergebnis
     */
    async _sendCommand(deviceId, op, intensity, durationMs, options = {}) {
        if (!this.isConfigured) {
            throw new Error(
                'PiShock credentials not configured. Please set username and API key in the plugin settings.'
            );
        }

        // ShareCode auflösen
        const shareCode = this._resolveShareCode(deviceId);

        // Parameter aufbereiten
        const clampedIntensity = this._clampIntensity(intensity);
        const durationSec = this._convertDuration(durationMs);

        // Gerätekühlung prüfen
        await this._checkDeviceCooldown(deviceId);

        // Payload bauen
        const payload = this._buildPayload(shareCode, op, clampedIntensity, durationSec);

        const opNames = { 0: 'Shock', 1: 'Vibrate', 2: 'Beep' };
        this.logger.info('PiShock: Sending command', {
            deviceId,
            shareCode,
            op: `${op} (${opNames[op] || 'Unknown'})`,
            intensity: clampedIntensity,
            durationSec,
            originalDurationMs: durationMs
        });

        try {
            const result = await this._executeRequest(payload);
            this._updateDeviceCooldown(deviceId);
            return result;
        } catch (error) {
            this.logger.error('PiShock: Command failed', {
                deviceId,
                op,
                intensity: clampedIntensity,
                durationSec,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Führt einen HTTP-Request an die PiShock API aus, mit Rate-Limiting und Retry.
     *
     * @private
     * @param {Object} payload - Vollständiger API-Payload
     * @returns {Promise<any>} Antwortdaten
     */
    async _executeRequest(payload) {
        // Rate Limiting prüfen
        await this._handleRateLimit();

        this._stats.totalRequests++;

        let lastError = null;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                const response = await this.axiosInstance.post(this.apiUrl, payload);

                // Timestamp für Rate-Limiting speichern
                this.requestTimestamps.push(Date.now());
                this._cleanupTimestamps();

                // PiShock gibt bei Erfolg "Operation Successful." oder ähnliches zurück
                const responseText = typeof response.data === 'string'
                    ? response.data
                    : JSON.stringify(response.data);

                this._stats.successfulRequests++;

                // Fehlermeldungen in der Response erkennen
                this._checkResponseForErrors(responseText);

                return {
                    success: true,
                    message: responseText,
                    status: response.status
                };

            } catch (error) {
                lastError = error;

                const isRetryable = this._isRetryableError(error);
                const isLastAttempt = attempt === this.maxRetries;

                this.logger.warn(`PiShock: Request attempt ${attempt}/${this.maxRetries} failed`, {
                    error: error.message,
                    retryable: isRetryable,
                    willRetry: isRetryable && !isLastAttempt
                });

                if (!isRetryable || isLastAttempt) {
                    break;
                }

                // Exponential Backoff
                const delay = this.retryDelayBase * Math.pow(2, attempt - 1);
                await this._sleep(delay);
            }
        }

        this._stats.failedRequests++;
        throw this._normalizeError(lastError);
    }

    /**
     * Prüft die Response-Text auf bekannte PiShock-Fehlermeldungen.
     *
     * @private
     * @param {string} responseText - Antwort-Text der API
     * @throws {Error} Bei erkannten Fehlermeldungen
     */
    _checkResponseForErrors(responseText) {
        if (!responseText) return;

        const lowerText = responseText.toLowerCase();

        // Bekannte PiShock-Fehlermeldungen
        const errorPatterns = [
            { pattern: 'this code doesn\'t exist', message: 'PiShock: Invalid ShareCode – the code does not exist' },
            { pattern: 'not authorized', message: 'PiShock: Not authorized – check your username and API key' },
            { pattern: 'share code not found', message: 'PiShock: ShareCode not found' },
            { pattern: 'device is offline', message: 'PiShock: Device is offline' },
            { pattern: 'device in use', message: 'PiShock: Device is currently in use by another controller' },
            { pattern: 'max intensity', message: 'PiShock: Intensity exceeds the maximum set by the device owner' },
            { pattern: 'max duration', message: 'PiShock: Duration exceeds the maximum set by the device owner' },
            { pattern: 'paused', message: 'PiShock: Device is paused' }
        ];

        for (const { pattern, message } of errorPatterns) {
            if (lowerText.includes(pattern)) {
                throw new Error(message);
            }
        }
    }

    /**
     * Prüft ob ein Fehler wiederholbar ist (z.B. bei Netzwerkproblemen).
     *
     * @private
     * @param {Error} error - Fehlerobjekt
     * @returns {boolean} True wenn Retry sinnvoll ist
     */
    _isRetryableError(error) {
        // Netzwerkfehler immer retryable
        if (!error.response) return true;

        const status = error.response.status;
        // 5xx = Server-Fehler → retry; 4xx = Client-Fehler → kein Retry
        return status >= 500;
    }

    /**
     * Normalisiert einen Fehler zu einer verständlichen Fehlermeldung.
     *
     * @private
     * @param {Error} error - Roher Fehler
     * @returns {Error} Normalisierter Fehler mit hilfreicher Meldung
     */
    _normalizeError(error) {
        if (!error) return new Error('PiShock: Unknown error');

        if (!error.response) {
            // Netzwerkfehler
            if (error.code === 'ECONNREFUSED') {
                return new Error('PiShock: Connection refused – please check your internet connection');
            }
            if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
                return new Error('PiShock: Request timed out – API may be temporarily unavailable');
            }
            return new Error(`PiShock: Network error – ${error.message}`);
        }

        const status = error.response.status;
        const responseData = error.response.data;
        const responseText = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);

        switch (status) {
            case 400:
                return new Error(`PiShock: Bad request – ${responseText || 'check your parameters'}`);
            case 401:
            case 403:
                return new Error(
                    'PiShock: Authentication failed – check your username and API key in the settings'
                );
            case 404:
                return new Error('PiShock: Endpoint not found – the API URL may have changed');
            case 429:
                this._stats.rateLimitHits++;
                return new Error('PiShock: Rate limit exceeded – too many requests, please wait');
            case 500:
            case 502:
            case 503:
                return new Error(`PiShock: Server error (${status}) – the API may be temporarily unavailable`);
            default:
                return new Error(`PiShock: HTTP ${status} – ${responseText || error.message}`);
        }
    }

    /**
     * Behandelt Rate Limiting – wartet wenn nötig.
     *
     * @private
     */
    async _handleRateLimit() {
        const now = Date.now();
        const windowStart = now - this.rateLimitWindow;

        // Alte Timestamps entfernen
        this.requestTimestamps = this.requestTimestamps.filter((ts) => ts > windowStart);

        if (this.requestTimestamps.length >= this.maxRequestsPerWindow) {
            // Warten bis das älteste Request-Fenster abläuft
            const oldestTimestamp = this.requestTimestamps[0];
            const waitTime = oldestTimestamp + this.rateLimitWindow - now + 100; // +100ms Puffer

            if (waitTime > 0) {
                this._stats.rateLimitHits++;
                this.logger.warn(`PiShockClient: Rate limit reached, waiting ${waitTime}ms`);
                await this._sleep(waitTime);
            }
        }
    }

    /**
     * Entfernt abgelaufene Rate-Limit-Timestamps.
     * @private
     */
    _cleanupTimestamps() {
        const windowStart = Date.now() - this.rateLimitWindow;
        this.requestTimestamps = this.requestTimestamps.filter((ts) => ts > windowStart);
    }

    /**
     * Prüft die Gerätekühlung und wartet bei Bedarf.
     *
     * @private
     * @param {string} deviceId - Geräte-ID
     */
    async _checkDeviceCooldown(deviceId) {
        const lastCommand = this.deviceCooldowns.get(deviceId);
        if (lastCommand) {
            const timeSinceLast = Date.now() - lastCommand;
            if (timeSinceLast < this.minCooldownMs) {
                const waitTime = this.minCooldownMs - timeSinceLast;
                this.logger.info(`PiShockClient: Device ${deviceId} on cooldown, waiting ${waitTime}ms`);
                await this._sleep(waitTime);
            }
        }
    }

    /**
     * Aktualisiert den Gerätekühlung-Timestamp.
     *
     * @private
     * @param {string} deviceId - Geräte-ID
     */
    _updateDeviceCooldown(deviceId) {
        this.deviceCooldowns.set(deviceId, Date.now());
    }

    /**
     * Schläft für die angegebene Zeit.
     *
     * @private
     * @param {number} ms - Millisekunden
     * @returns {Promise<void>}
     */
    _sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}

module.exports = PiShockClient;
