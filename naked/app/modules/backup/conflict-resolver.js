'use strict';

/**
 * Conflict resolver for backup import operations.
 *
 * Compares backup data against the current installation state and classifies
 * each key/file as new, conflict, or unchanged.  Supports merge and replace
 * resolution strategies.
 */

/**
 * Detect conflicts between backup settings and current settings.
 *
 * @param {Object.<string, any>} backupSettings  - key → value from backup
 * @param {Object.<string, any>} currentSettings - key → value from database
 * @returns {{ new: string[], conflicts: string[], unchanged: string[] }}
 */
function detectSettingsConflicts(backupSettings, currentSettings) {
    const result = { new: [], conflicts: [], unchanged: [] };

    for (const key of Object.keys(backupSettings)) {
        if (!(key in currentSettings)) {
            result.new.push(key);
        } else {
            const backupVal = JSON.stringify(backupSettings[key]);
            const currentVal = JSON.stringify(currentSettings[key]);
            if (backupVal === currentVal) {
                result.unchanged.push(key);
            } else {
                result.conflicts.push(key);
            }
        }
    }

    return result;
}

/**
 * Detect conflicts at the per-plugin level.
 *
 * @param {Object.<string, Object>} backupPluginSettings  - pluginId → { subKey: value }
 * @param {Object.<string, Object>} currentPluginSettings - pluginId → { subKey: value }
 * @returns {Object.<string, { new: string[], conflicts: string[], unchanged: string[] }>}
 */
function detectPluginConflicts(backupPluginSettings, currentPluginSettings) {
    const result = {};

    for (const pluginId of Object.keys(backupPluginSettings)) {
        const backup = backupPluginSettings[pluginId] || {};
        const current = currentPluginSettings[pluginId] || {};
        result[pluginId] = detectSettingsConflicts(backup, current);
    }

    return result;
}

/**
 * Apply merge resolution: keep existing values, only add missing keys.
 *
 * @param {Object.<string, any>} backupSettings
 * @param {Object.<string, any>} currentSettings
 * @returns {Object.<string, any>} resolved settings (keys to write)
 */
function mergeSettings(backupSettings, currentSettings) {
    const resolved = {};
    for (const [key, value] of Object.entries(backupSettings)) {
        if (!(key in currentSettings)) {
            resolved[key] = value;
        }
    }
    return resolved;
}

/**
 * Apply replace resolution: overwrite all existing values.
 *
 * @param {Object.<string, any>} backupSettings
 * @returns {Object.<string, any>} resolved settings (keys to write)
 */
function replaceSettings(backupSettings) {
    return { ...backupSettings };
}

module.exports = {
    detectSettingsConflicts,
    detectPluginConflicts,
    mergeSettings,
    replaceSettings
};
