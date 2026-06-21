'use strict';

/**
 * Plugin discovery – reads plugin settings from the SQLite `settings` table.
 *
 * Plugin settings are stored with keys of the form `plugin:<pluginId>:<key>`.
 * This module groups those rows into per-plugin objects and provides helpers
 * for exporting and importing them.
 */

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
        const pluginId = extractPluginId(row.key);
        const subKey = extractSubKey(row.key);
        if (!pluginId || !subKey) continue;

        if (!result[pluginId]) {
            result[pluginId] = {};
        }

        try {
            result[pluginId][subKey] = JSON.parse(row.value);
        } catch {
            result[pluginId][subKey] = row.value;
        }
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
    const prefix = `plugin:${pluginId}:`;
    const rows = db
        .prepare("SELECT key, value FROM settings WHERE key LIKE ?")
        .all(`${prefix}%`);

    const result = {};
    for (const row of rows) {
        const subKey = row.key.slice(prefix.length);
        try {
            result[subKey] = JSON.parse(row.value);
        } catch {
            result[subKey] = row.value;
        }
    }
    return result;
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
    const prefix = `plugin:${pluginId}:`;
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
            deleteStmt.run(`${prefix}%`);
        }

        for (const [subKey, value] of Object.entries(settings)) {
            const rawKey = `${prefix}${subKey}`;
            const rawValue = JSON.stringify(value);

            try {
                if (mode === 'replace') {
                    upsertStmt.run(rawKey, rawValue);
                    imported.push(subKey);
                } else {
                    const result = insertStmt.run(rawKey, rawValue);
                    if (result.changes > 0) {
                        imported.push(subKey);
                    } else {
                        skipped.push(subKey);
                    }
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
