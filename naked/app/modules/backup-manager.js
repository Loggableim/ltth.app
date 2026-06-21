'use strict';

/**
 * BackupManager – top-level orchestrator for the Config Backup & Restore system.
 *
 * Responsibilities:
 *  - Coordinate exports via the Exporter
 *  - Coordinate imports via the Importer
 *  - Manage custom plugin backup provider registrations
 *  - Surface structured reports to callers (HTTP route handlers, UI)
 */

const { exportBackup } = require('./backup/exporter');
const { parseBackupZip, previewImport, performImport, cleanupTempDir } = require('./backup/importer');

class BackupManager {
    /**
     * @param {object} deps
     * @param {import('better-sqlite3').Database} deps.db
     * @param {import('./config-path-manager')} deps.configPathManager
     * @param {import('./plugin-loader').PluginLoader} deps.pluginLoader
     * @param {object} deps.logger - Winston-compatible logger
     * @param {string} [deps.appVersion]
     * @param {string} [deps.activeProfile]
     */
    constructor({ db, configPathManager, pluginLoader, logger, appVersion, activeProfile }) {
        this.db = db;
        this.configPathManager = configPathManager;
        this.pluginLoader = pluginLoader;
        this.logger = logger;
        this.appVersion = appVersion || 'unknown';
        this.activeProfile = activeProfile || (pluginLoader ? pluginLoader.activeProfile : null);

        /** @type {Map<string, { exportConfig?: Function, importConfig?: Function }>} */
        this.backupProviders = new Map();
    }

    // ── Backup provider registry ──────────────────────────────────────────────

    /**
     * Register a custom backup provider for a plugin.
     *
     * @param {string} pluginId
     * @param {{ exportConfig?: Function, importConfig?: Function }} provider
     */
    registerBackupProvider(pluginId, provider) {
        if (!pluginId || typeof pluginId !== 'string') {
            this.logger.warn('[BackupManager] registerBackupProvider called with invalid pluginId');
            return;
        }
        if (!provider || typeof provider !== 'object') {
            this.logger.warn(`[BackupManager] registerBackupProvider: provider for ${pluginId} is not an object`);
            return;
        }
        this.backupProviders.set(pluginId, provider);
        this.logger.info(`[BackupManager] Backup provider registered for plugin: ${pluginId}`);
    }

    /**
     * Remove a plugin's backup provider (called on plugin unload).
     *
     * @param {string} pluginId
     */
    unregisterBackupProvider(pluginId) {
        if (this.backupProviders.has(pluginId)) {
            this.backupProviders.delete(pluginId);
            this.logger.info(`[BackupManager] Backup provider unregistered for plugin: ${pluginId}`);
        }
    }

    /**
     * Get a plugin's backup provider if registered.
     *
     * @param {string} pluginId
     * @returns {{ exportConfig?: Function, importConfig?: Function }|null}
     */
    getBackupProvider(pluginId) {
        return this.backupProviders.get(pluginId) || null;
    }

    // ── Export ────────────────────────────────────────────────────────────────

    /**
     * Export the current configuration to a ZIP stream.
     *
     * @param {object} opts - Export options forwarded to the exporter
     * @param {string} [activeProfile] - Active profile name
     * @returns {Promise<{ stream: NodeJS.ReadableStream, warnings: string[] }>}
     */
    async export(opts = {}, activeProfile = null) {
        this.logger.info('[BackupManager] Starting configuration export');

        const result = await exportBackup(
            {
                db: this.db,
                configPathManager: this.configPathManager,
                pluginLoader: this.pluginLoader,
                backupProviders: Object.fromEntries(this.backupProviders),
                appVersion: this.appVersion,
                activeProfile: activeProfile || this.activeProfile || (this.pluginLoader ? this.pluginLoader.activeProfile : null)
            },
            opts
        );

        if (result.warnings.length > 0) {
            result.warnings.forEach(w => this.logger.warn(`[BackupManager] Export warning: ${w}`));
        }

        this.logger.info('[BackupManager] Export archive prepared');
        return result;
    }

    // ── Import ────────────────────────────────────────────────────────────────

    /**
     * Parse and validate a backup ZIP file.
     *
     * @param {string} zipPath - Absolute path to the uploaded ZIP file
     * @param {number} [fileSizeBytes]
     * @returns {Promise<object>} parsed backup data (includes tmpDir that must be cleaned up)
     */
    async parseBackup(zipPath, fileSizeBytes) {
        this.logger.info(`[BackupManager] Parsing backup archive: ${zipPath}`);
        const parsed = await parseBackupZip(zipPath, fileSizeBytes);

        if (parsed.errors && parsed.errors.length > 0) {
            this.logger.warn(`[BackupManager] Backup parse errors: ${parsed.errors.join('; ')}`);
        }

        return parsed;
    }

    /**
     * Generate a dry-run preview of what a backup would import.
     *
     * @param {object} parsed - Result of parseBackup
     * @param {object} [opts]
     * @returns {object} Preview report
     */
    previewImport(parsed, opts = {}) {
        return previewImport(parsed, { db: this.db }, opts);
    }

    /**
     * Perform the actual import from a previously-parsed backup.
     *
     * @param {object} parsed - Result of parseBackup (tmpDir will be cleaned up)
     * @param {object} opts   - Import options
     * @returns {Promise<{ success: boolean, report: object, warnings: string[], errors: string[] }>}
     */
    async import(parsed, opts = {}) {
        this.logger.info('[BackupManager] Starting configuration import');

        try {
            const result = await performImport(
                parsed,
                {
                    db: this.db,
                    configPathManager: this.configPathManager,
                    backupProviders: Object.fromEntries(this.backupProviders),
                    activeProfile: this.activeProfile || (this.pluginLoader ? this.pluginLoader.activeProfile : null)
                },
                opts
            );

            if (result.errors.length > 0) {
                this.logger.error(`[BackupManager] Import errors: ${result.errors.join('; ')}`);
            } else {
                this.logger.info('[BackupManager] Import completed successfully');
            }

            return result;
        } finally {
            // Always clean up the temp extraction directory
            if (parsed.tmpDir) {
                cleanupTempDir(parsed.tmpDir);
            }
        }
    }

    /**
     * Return capabilities / metadata about what can be exported/imported.
     *
     * @returns {object}
     */
    getCapabilities() {
        const loadedPlugins = this.pluginLoader
            ? Array.from(this.pluginLoader.loadedPlugins.keys())
            : [];

        const customProviders = Array.from(this.backupProviders.keys());

        return {
            supportsExport: true,
            supportsImport: true,
            supportedSections: ['globalSettings', 'pluginSettings', 'pluginData', 'userConfigs', 'uploads', 'userdata'],
            supportedImportModes: ['merge', 'replace'],
            loadedPlugins,
            customBackupProviders: customProviders,
            maxBackupSizeMb: 500
        };
    }
}

module.exports = BackupManager;
