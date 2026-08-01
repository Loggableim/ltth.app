'use strict';

/**
 * Plugin discovery – reads plugin settings from the SQLite `settings` table.
 *
 * Plugin settings are stored with keys of the form `plugin:<pluginId>:<key>`.
 * This module groups those rows into per-plugin objects and provides helpers
 * for exporting and importing them.
 */
const {
    canonicalizePluginId,
    getConfigStorageKeys,
    getIdentityCandidateIds,
    getPluginIdentity
} = require('../plugin-identities');
const {
    CONFIG_MIGRATION_CANONICAL_SNAPSHOT_KEY,
    CONFIG_MIGRATION_LEGACY_SNAPSHOT_KEY,
    CONFIG_SYNC_MARKER_KEY,
    PluginIdentityConflictError,
    createSyncMarker,
    valuesEqual
} = require('../plugin-identity-sync');

const INTERNAL_IDENTITY_KEYS = new Set([
    CONFIG_SYNC_MARKER_KEY,
    CONFIG_MIGRATION_CANONICAL_SNAPSHOT_KEY,
    CONFIG_MIGRATION_LEGACY_SNAPSHOT_KEY
]);

/**
 * Regex that matches a plugin settings key and captures pluginId and subKey.
 * Example: 'plugin:my-plugin:config' → groups [1]='my-plugin', [2]='config'
 */
const PLUGIN_KEY_RE = /^plugin:([^:]+):(.+)$/;

/**
 * Extract the pluginId from a raw settings key.
 *
 * @param {string} rawKey - e.g. 'plugin:quiz-show:config'
 * @returns {string|null} pluginId or null if not a plugin key
 */
function extractPluginId(rawKey) {
    const m = PLUGIN_KEY_RE.exec(rawKey);
    return m ? m[1] : null;
}

/**
 * Extract the sub-key from a raw settings key.
 *
 * @param {string} rawKey - e.g. 'plugin:quiz-show:config'
 * @returns {string|null} sub-key or null
 */
function extractSubKey(rawKey) {
    const m = PLUGIN_KEY_RE.exec(rawKey);
    return m ? m[2] : null;
}

/**
 * Read all plugin settings from the `settings` table and group them by pluginId.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {Object.<string, Object.<string, any>>} pluginId → { subKey: parsedValue }
 */
function discoverAllPluginSettings(db) {
    const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'plugin:%'").all();

    const result = {};
    for (const row of rows) {
        const runtimePluginId = extractPluginId(row.key);
        let subKey = extractSubKey(row.key);
        if (!runtimePluginId || !subKey || INTERNAL_IDENTITY_KEYS.has(row.key)) continue;
        const pluginId = canonicalizePluginId(runtimePluginId);
        if (getPluginIdentity(pluginId) && ['config', 'streamalchemy_config'].includes(subKey)) {
            subKey = 'config';
        }

        let value;
        try {
            value = JSON.parse(row.value);
        } catch {
            value = row.value;
        }
        if (!result[pluginId]) result[pluginId] = {};
        if (
            Object.prototype.hasOwnProperty.call(result[pluginId], subKey) &&
            !valuesEqual(result[pluginId][subKey], value)
        ) {
            throw new PluginIdentityConflictError(
                'PLUGIN_IDENTITY_BACKUP_CONFLICT',
                `Backup export found conflicting settings for ${pluginId}:${subKey}`,
                { pluginId, subKey, rawKey: row.key }
            );
        }
        result[pluginId][subKey] = value;
    }

    return result;
}

/**
 * Read settings for a single plugin.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} pluginId
 * @returns {Object.<string, any>} subKey → parsedValue
 */
function discoverPluginSettings(db, pluginId) {
    return discoverAllPluginSettings(db)[canonicalizePluginId(pluginId)] || {};
}

/**
 * Read all non-plugin global settings from the `settings` table.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {Object.<string, any>} key → parsedValue
 */
function discoverGlobalSettings(db) {
    const rows = db.prepare("SELECT key, value FROM settings WHERE key NOT LIKE 'plugin:%'").all();
    const result = {};
    for (const row of rows) {
        result[row.key] = row.value;
    }
    return result;
}

/**
 * Restore plugin settings for a single plugin into the `settings` table.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} pluginId
 * @param {Object.<string, any>} settings - subKey → value map
 * @param {'merge'|'replace'} mode
 * @returns {{ imported: string[], skipped: string[] }}
 */
function restorePluginSettings(db, pluginId, settings, mode = 'merge') {
    pluginId = canonicalizePluginId(pluginId);
    const identity = getPluginIdentity(pluginId);
    const normalizedSettings = {};
    for (const [rawSubKey, value] of Object.entries(settings || {})) {
        const subKey = identity && ['config', 'streamalchemy_config'].includes(rawSubKey)
            ? 'config'
            : rawSubKey;
        if (normalizedSettings[subKey] !== undefined && !valuesEqual(normalizedSettings[subKey], value)) {
            throw new PluginIdentityConflictError('PLUGIN_IDENTITY_BACKUP_CONFLICT', `Backup import has conflicting ${pluginId}:${subKey}`);
        }
        normalizedSettings[subKey] = value;
    }
    const imported = [];
    const skipped = [];

    const upsertStmt = db.prepare(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO settings (key, value)
        VALUES (?, ?)
    `);

    const restore = db.transaction(() => {
        if (mode === 'replace') {
            const deleteStmt = db.prepare("DELETE FROM settings WHERE key LIKE ?");
            for (const identityId of getIdentityCandidateIds(pluginId)) {
                deleteStmt.run(`plugin:${identityId}:%`);
            }
        }

        for (const [subKey, value] of Object.entries(normalizedSettings)) {
            const rawKeys = identity && subKey === 'config'
                ? getConfigStorageKeys(pluginId, subKey)
                : [`plugin:${pluginId}:${subKey}`];
            const rawValue = JSON.stringify(value);

            try {
                if (mode === 'replace') {
                    rawKeys.forEach(rawKey => upsertStmt.run(rawKey, rawValue));
                    imported.push(subKey);
                } else {
                    const exists = rawKeys.some(rawKey => db.prepare(
                        'SELECT 1 AS present FROM settings WHERE key = ?'
                    ).get(rawKey));
                    if (!exists) {
                        rawKeys.forEach(rawKey => insertStmt.run(rawKey, rawValue));
                        imported.push(subKey);
                    } else {
                        skipped.push(subKey);
                    }
                }
                if (identity && subKey === 'config' && imported.includes(subKey)) {
                    upsertStmt.run(
                        CONFIG_SYNC_MARKER_KEY,
                        JSON.stringify(createSyncMarker(value))
                    );
                }
            } catch (err) {
                skipped.push(subKey);
            }
        }
    });

    restore();
    return { imported, skipped };
}

/**
 * Restore global settings (non-plugin) into the `settings` table.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {Object.<string, any>} settings - key → value map
 * @param {'merge'|'replace'} mode
 * @returns {{ imported: string[], skipped: string[] }}
 */
function restoreGlobalSettings(db, settings, mode = 'merge') {
    const imported = [];
    const skipped = [];

    const upsertStmt = db.prepare(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    const insertStmt = db.prepare(`
        INSERT OR IGNORE INTO settings (key, value)
        VALUES (?, ?)
    `);

    const restore = db.transaction(() => {
        for (const [key, value] of Object.entries(settings)) {
            if (key.startsWith('plugin:')) continue; // handled separately
            const rawValue = typeof value === 'string' ? value : JSON.stringify(value);
            try {
                if (mode === 'replace') {
                    upsertStmt.run(key, rawValue);
                    imported.push(key);
                } else {
                    const result = insertStmt.run(key, rawValue);
                    if (result.changes > 0) {
                        imported.push(key);
                    } else {
                        skipped.push(key);
                    }
                }
            } catch {
                skipped.push(key);
            }
        }
    });

    restore();
    return { imported, skipped };
}

module.exports = {
    extractPluginId,
    extractSubKey,
    discoverAllPluginSettings,
    discoverPluginSettings,
    discoverGlobalSettings,
    restorePluginSettings,
    restoreGlobalSettings,
    PLUGIN_KEY_RE
};
