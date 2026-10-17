'use strict';

const fs = require('fs');
const path = require('path');
const { collectFiles, DEFAULT_IGNORE_PATTERNS } = require('./file-collector');
const { canonicalizePluginId } = require('../plugin-identities');

const EXPORT_CATEGORIES = Object.freeze([
    'globalSettings',
    'pluginSettings',
    'profileDatabases',
    'userData',
    'pluginFiles',
    'uploads',
    'profileScopedPluginData',
    'schnorrbecherPersistentState',
    'credentialsAndSessions'
]);

const SENSITIVE_KEY_PATTERN = /(?:^|[_\-.])(?:api[_\-.]?key|private[_\-.]?key|signing[_\-.]?key|client[_\-.]?secret|refresh[_\-.]?token|secret|password|passwd|token|cookie|session(?:id)?|credential|auth(?:entication|orization)?(?:[_\-.]?token)?)(?:$|[_\-.])/i;
const SENSITIVE_KEY_EXACT = new Set(['tiktok_euler_api_key', 'euler_api_key', 'sessionid', 'session_id', 'session_cookie']);
const SENSITIVE_FILE_PATTERN = /(?:session(?:id)?|cookie|credential|secret|token|auth)/i;

function isSensitiveKey(key) {
    const normalized = String(key || '').trim().replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    return SENSITIVE_KEY_EXACT.has(normalized) || SENSITIVE_KEY_PATTERN.test(normalized);
}

function isSensitiveFile(relPath) {
    const basename = path.basename(String(relPath || '').replace(/\\/g, '/'));
    return SENSITIVE_FILE_PATTERN.test(basename);
}

function normalizeSelection(selection = {}) {
    const normalized = {};
    for (const category of EXPORT_CATEGORIES) normalized[category] = selection[category] === true;
    return normalized;
}

function selectionFromOptions(options = {}) {
    const choose = (categoryKey, legacyKey, fallback = true) => {
        if (Object.prototype.hasOwnProperty.call(options, categoryKey)) return options[categoryKey] === true;
        if (Object.prototype.hasOwnProperty.call(options, legacyKey)) return options[legacyKey] === true;
        return fallback;
    };
    return normalizeSelection({
        globalSettings: choose('globalSettings', 'includeGlobalSettings'),
        pluginSettings: choose('pluginSettings', 'includePluginSettings'),
        profileDatabases: choose('profileDatabases', 'includeUserConfigs'),
        userData: choose('userData', 'includeUserData'),
        pluginFiles: choose('pluginFiles', 'includePluginData'),
        uploads: choose('uploads', 'includeUploads'),
        profileScopedPluginData: choose('profileScopedPluginData', 'includeProfileScopedPluginData', false),
        schnorrbecherPersistentState: choose('schnorrbecherPersistentState', 'includeSchnorrbecherPersistentState', false),
        credentialsAndSessions: choose('credentialsAndSessions', 'includeCredentialsSessions', false)
    });
}

function isFullBackup(selection) {
    const normalized = normalizeSelection(selection);
    return EXPORT_CATEGORIES.every(category => normalized[category]);
}

function assertSelectionConfirmed(selection) {
    const normalized = normalizeSelection(selection);
    if (normalized.credentialsAndSessions && selection.confirmSensitiveExport !== true) {
        throw new Error('Exporting credentials or session data requires explicit confirmation');
    }
    if (isFullBackup(normalized) && selection.confirmFullBackup !== true) {
        throw new Error('A full backup requires explicit confirmation');
    }
}

function settingStats(settings) {
    const all = settings || {};
    const safe = filterSensitiveSettings(all, false);
    const measure = object => Buffer.byteLength(JSON.stringify(object));
    const sensitiveEntries = Object.keys(all).filter(key => isSensitiveKey(key) || JSON.stringify(all[key]) !== JSON.stringify(safe[key])).length;
    const safeEntries = Object.keys(safe).length;
    const bytes = measure(all);
    const safeBytes = measure(safe);
    return {
        files: safeEntries ? 1 : 0,
        entries: safeEntries,
        bytes: safeBytes,
        sensitiveEntries,
        sensitiveBytes: Math.max(0, bytes - safeBytes)
    };
}

function collectTreeStats(dir, { splitSensitive = false, includeHidden = false } = {}) {
    if (!dir || !fs.existsSync(dir)) return { files: 0, bytes: 0, sensitiveFiles: 0, sensitiveBytes: 0 };
    const { files } = collectFiles(dir, dir);
    const expandedFiles = splitSensitive || includeHidden
        ? collectFiles(dir, dir, { ignorePatterns: DEFAULT_IGNORE_PATTERNS.filter(pattern => !(pattern instanceof RegExp && pattern.toString() === '/^\\./')) }).files
        : files;
    const defaultPaths = new Set((includeHidden ? expandedFiles : files).map(file => file.relPath));
    const result = { files: 0, bytes: 0, sensitiveFiles: 0, sensitiveBytes: 0 };
    for (const file of expandedFiles) {
        if (splitSensitive && isSensitiveFile(file.relPath)) {
            result.sensitiveFiles += 1;
            result.sensitiveBytes += file.size;
        } else if (defaultPaths.has(file.relPath)) {
            result.files += 1;
            result.bytes += file.size;
        }
    }
    return result;
}

function collectPluginTreeStats(configPathManager, pluginLoader, includeHidden = false) {
    const result = { files: 0, bytes: 0, sensitiveFiles: 0, sensitiveBytes: 0 };
    const pluginsDir = configPathManager?.getPluginsDir?.();
    if (!pluginsDir || !fs.existsSync(pluginsDir)) return result;
    const pluginIds = new Set(
        (pluginLoader ? Array.from(pluginLoader.loadedPlugins.keys()) : []).map(canonicalizePluginId)
    );
    try {
        for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
            if (entry.isDirectory()) pluginIds.add(canonicalizePluginId(entry.name));
        }
    } catch {
        return result;
    }
    for (const pluginId of pluginIds) {
        const dataDir = configPathManager.getPluginDataDir(canonicalizePluginId(pluginId));
        const stats = collectTreeStats(dataDir, { splitSensitive: true, includeHidden });
        result.files += stats.files;
        result.bytes += stats.bytes;
        result.sensitiveFiles += stats.sensitiveFiles;
        result.sensitiveBytes += stats.sensitiveBytes;
    }
    return result;
}

function collectProfileDatabaseStats(configPathManager) {
    const stats = collectTreeStats(configPathManager?.getUserConfigsDir?.(), { splitSensitive: true, includeHidden: true });
    const dir = configPathManager?.getUserConfigsDir?.();
    if (!dir || !fs.existsSync(dir)) return { ...stats, databases: 0 };
    const databaseFiles = collectFiles(dir, dir).files.filter(file => /\.db$/i.test(file.relPath) && !isSensitiveFile(file.relPath));
    let databases = 0;
    let sensitiveEntries = 0;
    let sensitiveBytes = stats.sensitiveBytes;
    const Database = databaseFiles.length ? require('better-sqlite3') : null;
    for (const file of databaseFiles) {
        databases += 1;
        let database;
        try {
            database = new Database(file.absPath, { readonly: true, fileMustExist: true });
            const settingsTable = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'").get();
            if (!settingsTable) continue;
            const rows = database.prepare('SELECT key, value FROM settings').all();
            for (const row of rows) {
                let sensitive = isSensitiveKey(row.key);
                if (!sensitive && typeof row.value === 'string') {
                    try {
                        const parsed = JSON.parse(row.value);
                        sensitive = JSON.stringify(filterSensitiveSettings({ value: parsed }, false).value) !== JSON.stringify(parsed);
                    } catch { /* raw values are classified by their key */ }
                }
                if (sensitive) {
                    sensitiveEntries += 1;
                    sensitiveBytes += Buffer.byteLength(String(row.key)) + Buffer.byteLength(String(row.value));
                }
            }
        } catch { /* A corrupt/unreadable profile DB remains counted by file metadata only. */ }
        finally { if (database && database.open) database.close(); }
    }
    return { ...stats, databases, sensitiveEntries, sensitiveBytes };
}

function collectProfileScopedStats(configPathManager, profileId, schnorrStateOnly = false) {
    const stats = { files: 0, bytes: 0 };
    const canonicalProfileId = String(profileId || '').replace(/[^A-Za-z0-9_-]/g, '_');
    if (!/^[A-Za-z0-9_-]+$/.test(canonicalProfileId)) return stats;
    const plugins = schnorrStateOnly ? ['schnorrbecher'] : ['advanced-timer', 'schnorrbecher', 'quiz-show'];
    for (const pluginId of plugins) {
        const dataDir = configPathManager?.getPluginDataDir?.(pluginId, { profileId: canonicalProfileId });
        if (schnorrStateOnly) {
            const statePath = path.join(dataDir || '', 'coin-jar-state.json');
            const configPath = path.join(dataDir || '', 'coin-jar-config.json');
            try {
                if (!dataDir || !fs.existsSync(statePath) || !fs.statSync(statePath).isFile()) continue;
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config.persistenceMode !== 'persistent') continue;
                stats.files += 1;
                stats.bytes += fs.statSync(statePath).size;
            } catch { /* Missing, invalid, or session-only Schnorrbecher state is not exportable. */ }
        } else {
            const current = collectTreeStats(dataDir);
            stats.files += current.files;
            stats.bytes += current.bytes;
        }
    }
    return stats;
}

function filterSensitiveSettings(settings, includeSensitive) {
    const output = {};
    for (const [key, value] of Object.entries(settings || {})) {
        if (isSensitiveKey(key) && !includeSensitive) continue;
        output[key] = filterNestedSensitiveValues(value, includeSensitive);
    }
    return output;
}

function filterNestedSensitiveValues(value, includeSensitive) {
    if (Array.isArray(value)) return value.map(item => filterNestedSensitiveValues(item, includeSensitive));
    if (typeof value === 'string' && !includeSensitive) {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object') return JSON.stringify(filterNestedSensitiveValues(parsed, false));
        } catch { /* non-JSON settings remain unchanged */ }
        return value;
    }
    if (!value || typeof value !== 'object') return value;
    const output = {};
    for (const [key, nestedValue] of Object.entries(value)) {
        if (isSensitiveKey(key) && !includeSensitive) continue;
        output[key] = filterNestedSensitiveValues(nestedValue, includeSensitive);
    }
    return output;
}

function inspectSelection(deps, selection) {
    const normalized = normalizeSelection(selection);
    const globalSettings = deps.db ? require('./plugin-discovery').discoverGlobalSettings(deps.db) : {};
    const pluginSettings = deps.db ? require('./plugin-discovery').discoverAllPluginSettings(deps.db) : {};
    const globalStats = settingStats(globalSettings);
    const pluginStats = { files: 0, entries: 0, bytes: 0, sensitiveEntries: 0, sensitiveBytes: 0 };
    for (const settings of Object.values(pluginSettings)) {
        const current = settingStats(settings);
        for (const key of Object.keys(pluginStats)) pluginStats[key] += current[key] || 0;
    }
    const profileStats = collectProfileDatabaseStats(deps.configPathManager);
    const userStats = collectTreeStats(deps.configPathManager?.getUserDataDir?.(), { splitSensitive: true, includeHidden: normalized.credentialsAndSessions });
    const pluginFileStats = collectPluginTreeStats(deps.configPathManager, deps.pluginLoader, normalized.credentialsAndSessions);
    const uploadStats = collectTreeStats(deps.configPathManager?.getUploadsDir?.(), { splitSensitive: true, includeHidden: normalized.credentialsAndSessions });
    const scopedStats = collectProfileScopedStats(deps.configPathManager, deps.activeProfile);
    const schnorrStateStats = collectProfileScopedStats(deps.configPathManager, deps.activeProfile, true);
    const categories = {
        globalSettings: { selected: normalized.globalSettings, ...globalStats },
        pluginSettings: { selected: normalized.pluginSettings, ...pluginStats },
        profileDatabases: { selected: normalized.profileDatabases, ...profileStats },
        userData: { selected: normalized.userData, ...userStats },
        pluginFiles: { selected: normalized.pluginFiles, ...pluginFileStats },
        uploads: { selected: normalized.uploads, ...uploadStats },
        profileScopedPluginData: { selected: normalized.profileScopedPluginData, ...scopedStats },
        schnorrbecherPersistentState: { selected: normalized.schnorrbecherPersistentState, ...schnorrStateStats },
        credentialsAndSessions: {
            selected: normalized.credentialsAndSessions,
            files: (normalized.profileDatabases ? profileStats.sensitiveFiles : 0) +
                (normalized.userData ? userStats.sensitiveFiles : 0) +
                (normalized.pluginFiles ? pluginFileStats.sensitiveFiles : 0) +
                (normalized.uploads ? uploadStats.sensitiveFiles : 0),
            entries: (normalized.globalSettings ? globalStats.sensitiveEntries : 0) +
                (normalized.pluginSettings ? pluginStats.sensitiveEntries : 0) +
                (normalized.profileDatabases ? profileStats.sensitiveEntries : 0),
            bytes: (normalized.globalSettings ? globalStats.sensitiveBytes : 0) +
                (normalized.pluginSettings ? pluginStats.sensitiveBytes : 0) +
                (normalized.profileDatabases ? profileStats.sensitiveBytes : 0) +
                (normalized.userData ? userStats.sensitiveBytes : 0) +
                (normalized.pluginFiles ? pluginFileStats.sensitiveBytes : 0) +
                (normalized.uploads ? uploadStats.sensitiveBytes : 0)
        }
    };
    const totals = Object.values(categories).reduce((sum, category) => {
        if (!category.selected) return sum;
        sum.files += category.files || 0;
        sum.entries += category.entries || 0;
        sum.bytes += category.bytes || 0;
        return sum;
    }, { files: 0, entries: 0, bytes: 0 });
    return {
        categories,
        totals,
        partial: !isFullBackup(normalized),
        fullBackupWarning: isFullBackup(normalized)
            ? 'A full backup can include unclassified personal or secret values in generic database and file contents.'
            : null
    };
}

module.exports = {
    EXPORT_CATEGORIES,
    isSensitiveKey,
    isSensitiveFile,
    normalizeSelection,
    selectionFromOptions,
    isFullBackup,
    assertSelectionConfirmed,
    settingStats,
    collectTreeStats,
    filterSensitiveSettings,
    inspectSelection
};
