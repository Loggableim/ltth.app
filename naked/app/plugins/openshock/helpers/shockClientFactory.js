const OpenShockClient = require('./openShockClient');
const PiShockClient = require('./piShockClient');

/**
 * ShockClientFactory
 *
 * Erzeugt basierend auf `config.apiProvider` den passenden API-Client.
 * Unterstützt aktuell: 'openshock' (Standard) und 'pishock'.
 *
 * Beide Clients implementieren dasselbe Interface:
 * - isConfigured (Property)
 * - testConnection()
 * - getDevices()
 * - getDevice(deviceId)
 * - sendShock(deviceId, intensity, duration, options)
 * - sendVibrate(deviceId, intensity, duration, options)
 * - sendSound(deviceId, intensity, duration, options)
 * - sendControl(deviceId, command, options)
 * - sendBatch(commands, options)
 * - updateConfig(config)
 * - validateApiKey()
 * - getRateLimitStatus()
 * - getStats()
 * - clearQueue()
 * - destroy()
 *
 * @class ShockClientFactory
 */
class ShockClientFactory {
    /**
     * Erstellt den passenden Shock-Client basierend auf dem konfigurierten Provider.
     *
     * @param {Object} config - Plugin-Konfiguration
     * @param {string} [config.apiProvider='openshock'] - Provider-ID ('openshock' oder 'pishock')
     * @param {string} [config.apiKey] - OpenShock API-Key (nur für OpenShock)
     * @param {string} [config.baseUrl] - OpenShock Base URL (nur für OpenShock)
     * @param {Object} [config.pishock] - PiShock-Konfiguration
     * @param {string} [config.pishock.username] - PiShock Benutzername
     * @param {string} [config.pishock.apiKey] - PiShock API-Key
     * @param {Array} [config.pishock.shareCodes] - Liste der ShareCodes
     * @param {Object} logger - Logger-Instanz (muss info, warn, error haben)
     * @returns {OpenShockClient|PiShockClient} Initialisierter API-Client
     */
    static create(config, logger) {
        const provider = (config.apiProvider || 'openshock').toLowerCase();

        switch (provider) {
            case 'pishock': {
                const pishockConfig = config.pishock || {};
                logger.info('ShockClientFactory: Creating PiShockClient', {
                    username: pishockConfig.username || '(not set)',
                    shareCodes: (pishockConfig.shareCodes || []).length
                });
                return new PiShockClient(pishockConfig, logger);
            }

            case 'openshock':
            default: {
                logger.info('ShockClientFactory: Creating OpenShockClient', {
                    baseUrl: config.baseUrl || 'https://api.openshock.app'
                });
                return new OpenShockClient(
                    config.apiKey || '',
                    config.baseUrl || 'https://api.openshock.app',
                    logger
                );
            }
        }
    }

    /**
     * Gibt Provider-Metadaten zurück.
     *
     * @param {string} provider - Provider-ID ('openshock' oder 'pishock')
     * @returns {Object} Provider-Informationen
     */
    static getProviderInfo(provider) {
        const providers = {
            openshock: {
                id: 'openshock',
                name: 'OpenShock',
                description: 'Open-Source Shock-Controller Platform',
                authFields: ['apiKey', 'baseUrl'],
                deviceDiscovery: true,
                maxDurationMs: 30000,
                durationUnit: 'milliseconds',
                website: 'https://openshock.org'
            },
            pishock: {
                id: 'pishock',
                name: 'PiShock',
                description: 'PiShock API-basierter Shock-Controller (ShareCode-System)',
                authFields: ['username', 'apiKey', 'shareCodes'],
                deviceDiscovery: false,
                maxDurationMs: 15000,  // 15 Sekunden
                durationUnit: 'seconds (converted from ms)',
                website: 'https://pishock.com'
            }
        };

        return providers[(provider || 'openshock').toLowerCase()] || providers.openshock;
    }

    /**
     * Gibt alle unterstützten Provider zurück.
     *
     * @returns {Array<Object>} Liste aller Provider-Informationen
     */
    static getSupportedProviders() {
        return [
            ShockClientFactory.getProviderInfo('openshock'),
            ShockClientFactory.getProviderInfo('pishock')
        ];
    }
}

module.exports = ShockClientFactory;
