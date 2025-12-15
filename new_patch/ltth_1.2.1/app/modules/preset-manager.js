const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

/**
 * Preset Manager
 * Handles import/export of complete application configurations
 */
class PresetManager {
    constructor(database) {
        this.db = database;
    }

    /**
     * Export complete configuration as a preset
     * @param {Object} options - Export options
     * @returns {Promise<Object>} - Preset data
     */
    async exportPreset(options = {}) {
        try {
            const preset = {
                metadata: {
                    name: options.name || 'Unnamed Preset',
                    description: options.description || '',
                    exportDate: new Date().toISOString(),
                    version: '1.0.3', // Current app version
                    author: options.author || 'Unknown',
                },
                data: {},
            };

            // Export settings
            if (options.includeSettings !== false) {
                preset.data.settings = await this.exportSettings();
            }

            // Export flows
            if (options.includeFlows !== false) {
                preset.data.flows = await this.exportFlows();
            }

            // Export alert configs
            if (options.includeAlerts !== false) {
                preset.data.alertConfigs = await this.exportAlertConfigs();
            }

            // Export gift sounds
            if (options.includeGiftSounds !== false) {
                preset.data.giftSounds = await this.exportGiftSounds();
            }

            // Export user voice mappings
            if (options.includeVoiceMappings !== false) {
                preset.data.userVoices = await this.exportUserVoices();
            }

            // Export plugin configurations
            if (options.includePluginConfigs !== false) {
                preset.data.pluginConfigs = await this.exportPluginConfigs();
            }

            logger.info('Preset exported successfully', { name: preset.metadata.name });
            return preset;
        } catch (error) {
            logger.error('Failed to export preset:', error);
            throw new Error('Failed to export preset: ' + error.message);
        }
    }

    /**
     * Import a preset configuration
     * @param {Object} preset - Preset data to import
     * @param {Object} options - Import options
     * @returns {Promise<Object>} - Import result
     */
    async importPreset(preset, options = {}) {
        const result = {
            success: false,
            imported: {},
            errors: {},
        };

        try {
            // Validate preset format
            if (!preset.metadata || !preset.data) {
                throw new Error('Invalid preset format');
            }

            // Create backup before import
            if (options.createBackup !== false) {
                await this.createBackup();
            }

            // Import settings
            if (preset.data.settings && options.includeSettings !== false) {
                try {
                    await this.importSettings(preset.data.settings, options.overwrite);
                    result.imported.settings = true;
                } catch (error) {
                    result.errors.settings = error.message;
                }
            }

            // Import flows
            if (preset.data.flows && options.includeFlows !== false) {
                try {
                    await this.importFlows(preset.data.flows, options.overwrite);
                    result.imported.flows = true;
                } catch (error) {
                    result.errors.flows = error.message;
                }
            }

            // Import alert configs
            if (preset.data.alertConfigs && options.includeAlerts !== false) {
                try {
                    await this.importAlertConfigs(preset.data.alertConfigs, options.overwrite);
                    result.imported.alertConfigs = true;
                } catch (error) {
                    result.errors.alertConfigs = error.message;
                }
            }

            // Import gift sounds
            if (preset.data.giftSounds && options.includeGiftSounds !== false) {
                try {
                    await this.importGiftSounds(preset.data.giftSounds, options.overwrite);
                    result.imported.giftSounds = true;
                } catch (error) {
                    result.errors.giftSounds = error.message;
                }
            }

            // Import user voice mappings
            if (preset.data.userVoices && options.includeVoiceMappings !== false) {
                try {
                    await this.importUserVoices(preset.data.userVoices, options.overwrite);
                    result.imported.userVoices = true;
                } catch (error) {
                    result.errors.userVoices = error.message;
                }
            }

            // Import plugin configurations
            if (preset.data.pluginConfigs && options.includePluginConfigs !== false) {
                try {
                    await this.importPluginConfigs(preset.data.pluginConfigs, options.overwrite);
                    result.imported.pluginConfigs = true;
                } catch (error) {
                    result.errors.pluginConfigs = error.message;
                }
            }

            result.success = Object.keys(result.imported).length > 0;
            logger.info('Preset imported', { imported: result.imported, errors: result.errors });
            return result;
        } catch (error) {
            logger.error('Failed to import preset:', error);
            throw new Error('Failed to import preset: ' + error.message);
        }
    }

    /**
     * Export settings from database
     */
    async exportSettings() {
        try {
            const stmt = this.db.prepare('SELECT key, value FROM settings');
            const rows = stmt.all();
            const settings = {};

            rows.forEach(row => {
                try {
                    settings[row.key] = JSON.parse(row.value);
                } catch {
                    settings[row.key] = row.value;
                }
            });

            return settings;
        } catch (error) {
            logger.error('Failed to export settings:', error);
            return {};
        }
    }

    /**
     * Import settings into database
     */
    async importSettings(settings, overwrite = false) {
        try {
            const upsert = this.db.prepare(`
                INSERT INTO settings (key, value)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `);

            const insertTransaction = this.db.transaction((settingsObj) => {
                for (const [key, value] of Object.entries(settingsObj)) {
                    const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
                    upsert.run(key, jsonValue);
                }
            });

            if (overwrite) {
                insertTransaction(settings);
            } else {
                // Only import settings that don't exist
                const existingKeys = this.db.prepare('SELECT key FROM settings').all().map(r => r.key);
                const newSettings = {};
                for (const [key, value] of Object.entries(settings)) {
                    if (!existingKeys.includes(key)) {
                        newSettings[key] = value;
                    }
                }
                insertTransaction(newSettings);
            }

            logger.info('Settings imported successfully');
        } catch (error) {
            logger.error('Failed to import settings:', error);
            throw error;
        }
    }

    /**
     * Export flows from database
     */
    async exportFlows() {
        try {
            const stmt = this.db.prepare('SELECT * FROM flows');
            return stmt.all();
        } catch (error) {
            logger.error('Failed to export flows:', error);
            return [];
        }
    }

    /**
     * Import flows into database
     */
    async importFlows(flows, overwrite = false) {
        try {
            if (overwrite) {
                // Clear existing flows
                this.db.prepare('DELETE FROM flows').run();
            }

            const insert = this.db.prepare(`
                INSERT INTO flows (name, trigger_type, trigger_condition, actions, enabled)
                VALUES (?, ?, ?, ?, ?)
            `);

            const insertTransaction = this.db.transaction((flowList) => {
                for (const flow of flowList) {
                    insert.run(
                        flow.name,
                        flow.trigger_type,
                        flow.trigger_condition,
                        flow.actions,
                        flow.enabled
                    );
                }
            });

            insertTransaction(flows);
            logger.info('Flows imported successfully', { count: flows.length });
        } catch (error) {
            logger.error('Failed to import flows:', error);
            throw error;
        }
    }

    /**
     * Export alert configs from database
     */
    async exportAlertConfigs() {
        try {
            const stmt = this.db.prepare('SELECT * FROM alert_configs');
            return stmt.all();
        } catch (error) {
            logger.error('Failed to export alert configs:', error);
            return [];
        }
    }

    /**
     * Import alert configs into database
     */
    async importAlertConfigs(configs, overwrite = false) {
        try {
            if (overwrite) {
                this.db.prepare('DELETE FROM alert_configs').run();
            }

            const insert = this.db.prepare(`
                INSERT OR REPLACE INTO alert_configs
                (event_type, enabled, text_template, sound_file, duration, image_url, animation_type)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            const insertTransaction = this.db.transaction((configList) => {
                for (const config of configList) {
                    insert.run(
                        config.event_type,
                        config.enabled,
                        config.text_template,
                        config.sound_file,
                        config.duration,
                        config.image_url,
                        config.animation_type
                    );
                }
            });

            insertTransaction(configs);
            logger.info('Alert configs imported successfully', { count: configs.length });
        } catch (error) {
            logger.error('Failed to import alert configs:', error);
            throw error;
        }
    }

    /**
     * Export gift sounds from database
     */
    async exportGiftSounds() {
        try {
            const stmt = this.db.prepare('SELECT * FROM gift_sounds');
            return stmt.all();
        } catch (error) {
            logger.error('Failed to export gift sounds:', error);
            return [];
        }
    }

    /**
     * Import gift sounds into database
     */
    async importGiftSounds(sounds, overwrite = false) {
        try {
            if (overwrite) {
                this.db.prepare('DELETE FROM gift_sounds').run();
            }

            const insert = this.db.prepare(`
                INSERT OR REPLACE INTO gift_sounds
                (gift_id, label, mp3_url, volume, animation_url, animation_type)
                VALUES (?, ?, ?, ?, ?, ?)
            `);

            const insertTransaction = this.db.transaction((soundList) => {
                for (const sound of soundList) {
                    insert.run(
                        sound.gift_id,
                        sound.label,
                        sound.mp3_url,
                        sound.volume,
                        sound.animation_url,
                        sound.animation_type
                    );
                }
            });

            insertTransaction(sounds);
            logger.info('Gift sounds imported successfully', { count: sounds.length });
        } catch (error) {
            logger.error('Failed to import gift sounds:', error);
            throw error;
        }
    }

    /**
     * Export user voice mappings from database
     */
    async exportUserVoices() {
        try {
            const stmt = this.db.prepare('SELECT * FROM user_voices');
            return stmt.all();
        } catch (error) {
            logger.error('Failed to export user voices:', error);
            return [];
        }
    }

    /**
     * Import user voice mappings into database
     */
    async importUserVoices(voices, overwrite = false) {
        try {
            if (overwrite) {
                this.db.prepare('DELETE FROM user_voices').run();
            }

            const insert = this.db.prepare(`
                INSERT OR REPLACE INTO user_voices (username, voice_id)
                VALUES (?, ?)
            `);

            const insertTransaction = this.db.transaction((voiceList) => {
                for (const voice of voiceList) {
                    insert.run(voice.username, voice.voice_id);
                }
            });

            insertTransaction(voices);
            logger.info('User voices imported successfully', { count: voices.length });
        } catch (error) {
            logger.error('Failed to import user voices:', error);
            throw error;
        }
    }

    /**
     * Export plugin configurations from database
     */
    async exportPluginConfigs() {
        try {
            // Plugin configs are stored in settings table with 'plugin:' prefix
            const stmt = this.db.prepare("SELECT key, value FROM settings WHERE key LIKE 'plugin:%'");
            const rows = stmt.all();
            const configs = {};

            rows.forEach(row => {
                try {
                    configs[row.key] = JSON.parse(row.value);
                } catch {
                    configs[row.key] = row.value;
                }
            });

            return configs;
        } catch (error) {
            logger.error('Failed to export plugin configs:', error);
            return {};
        }
    }

    /**
     * Import plugin configurations into database
     */
    async importPluginConfigs(configs, overwrite = false) {
        try {
            const upsert = this.db.prepare(`
                INSERT INTO settings (key, value)
                VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
            `);

            const insertTransaction = this.db.transaction((configObj) => {
                for (const [key, value] of Object.entries(configObj)) {
                    if (key.startsWith('plugin:')) {
                        const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
                        upsert.run(key, jsonValue);
                    }
                }
            });

            insertTransaction(configs);
            logger.info('Plugin configs imported successfully');
        } catch (error) {
            logger.error('Failed to import plugin configs:', error);
            throw error;
        }
    }

    /**
     * Create a backup before import
     */
    async createBackup() {
        try {
            const backupDir = path.join(__dirname, '..', 'user_data', 'preset_backups');
            await fs.mkdir(backupDir, { recursive: true });

            const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
            const backupPath = path.join(backupDir, `backup_${timestamp}.json`);

            const backup = await this.exportPreset({
                name: `Backup ${timestamp}`,
                description: 'Automatic backup before preset import',
                includeSettings: true,
                includeFlows: true,
                includeAlerts: true,
                includeGiftSounds: true,
                includeVoiceMappings: true,
                includePluginConfigs: true,
            });

            await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));
            logger.info('Backup created', { path: backupPath });
        } catch (error) {
            logger.error('Failed to create backup:', error);
            // Don't throw - backup is optional
        }
    }

    /**
     * Save preset to file
     */
    async savePresetToFile(preset, filePath) {
        try {
            await fs.writeFile(filePath, JSON.stringify(preset, null, 2));
            logger.info('Preset saved to file', { path: filePath });
        } catch (error) {
            logger.error('Failed to save preset to file:', error);
            throw error;
        }
    }

    /**
     * Load preset from file
     */
    async loadPresetFromFile(filePath) {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const preset = JSON.parse(data);
            logger.info('Preset loaded from file', { path: filePath });
            return preset;
        } catch (error) {
            logger.error('Failed to load preset from file:', error);
            throw error;
        }
    }
}

module.exports = PresetManager;
