'use strict';

/**
 * Backup exporter – creates a versioned ZIP archive of the current configuration.
 *
 * The archive layout is:
 *
 *   manifest.json                    – backup metadata
 *   checksums.json                   – SHA-256 of every file in the archive
 *   user_configs/<relPath>           – profile databases, active profile marker, plugin state
 *   global/settings.json             – non-plugin rows from the active settings table
 *   plugins/<id>/settings.json       – plugin:<id>:* rows grouped by key
 *   plugins/<id>/data/<relPath>      – files from the plugin's persistent data dir
 *   uploads/<relPath>                – user uploads (when includeUploads=true)
 *   user_data/<relPath>              – user_data directory  (when includeUserData=true)
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const archiver = require('archiver');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const { createManifest, FORMAT_VERSION } = require('./manifest');
const { computeChecksum } = require('./checksum');
const { discoverAllPluginSettings, discoverGlobalSettings } = require('./plugin-discovery');
const { collectPluginFiles, collectFiles, DEFAULT_IGNORE_PATTERNS } = require('./file-collector');
const { canonicalizePluginId, getIdentityCandidateIds } = require('../plugin-identities');
const { PROFILE_SCOPED_PLUGIN_DATA, normalizeScopedPluginIds, canonicalProfileId, validateProfileId } = require('./profile-scoped-data');
const { DecompressionBudget } = require('./decompression-budget');
const { MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES } = require('./validators');
const { redactLocalPaths } = require('./redact-local-paths');
const {
    isSensitiveKey,
    isSensitiveFile,
    filterSensitiveSettings,
    normalizeSelection,
    isFullBackup,
    assertSelectionConfirmed
} = require('./selection');

async function readProfileScopedFile(pluginId, file) {
    const relPath = file.relPath.replace(/\\/g, '/');
    if (!PROFILE_SCOPED_PLUGIN_DATA.includes(pluginId) || (pluginId !== 'advanced-timer' || relPath !== 'timers.db')) {
        return fs.readFileSync(file.absPath);
    }

    const Database = require('better-sqlite3');
    const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-backup-sqlite-'));
    const snapshotPath = path.join(snapshotDir, 'timers.db');
    let sourceDb;
    try {
        sourceDb = new Database(file.absPath, { readonly: true, fileMustExist: true });
        await sourceDb.backup(snapshotPath);
        return fs.readFileSync(snapshotPath);
    } finally {
        if (sourceDb && sourceDb.open) sourceDb.close();
        fs.rmSync(snapshotDir, { recursive: true, force: true });
    }
}

/**
 * Export the current configuration to a ZIP archive written to a writable stream.
 *
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db
 * @param {import('../config-path-manager')}  deps.configPathManager
 * @param {import('../plugin-loader').PluginLoader} deps.pluginLoader
 * @param {object} [deps.backupProviders] - Map<pluginId, provider> of custom backup providers
 * @param {string} [deps.appVersion]
 * @param {string} [deps.activeProfile]
 * @param {object} opts - Export options
 * @param {boolean} [opts.includeGlobalSettings=true]
 * @param {boolean} [opts.includePluginSettings=true]
 * @param {boolean} [opts.includePluginData=true]
 * @param {boolean} [opts.includeUserConfigs=true]
 * @param {boolean} [opts.includeUploads=true]
 * @param {boolean} [opts.includeUserData=true]
 * @param {string[]} [opts.pluginFilter] - If set, only export these plugin IDs
 * @returns {Promise<{ stream: NodeJS.ReadableStream, warnings: string[] }>}
 */
async function exportBackup(deps, opts = {}) {
    const {
        db,
        configPathManager,
        pluginLoader,
        backupProviders = {},
        appVersion,
        activeProfile
    } = deps;

    const {
        includeGlobalSettings = true,
        includePluginSettings = true,
        includePluginData = true,
        includeUserConfigs = true,
        includeUploads = true,
        includeUserData = true,
        pluginFilter = null,
        profileScopedDataPlugins: requestedScopedDataPlugins = [],
        includeSchnorrbecherPersistentState = false
    } = opts;
    const selection = normalizeSelection({
        globalSettings: opts.includeGlobalSettings !== false,
        pluginSettings: opts.includePluginSettings !== false,
        profileDatabases: opts.includeUserConfigs !== false,
        userData: opts.includeUserData !== false,
        pluginFiles: opts.includePluginData !== false,
        uploads: opts.includeUploads !== false,
        profileScopedPluginData: Array.isArray(requestedScopedDataPlugins) && requestedScopedDataPlugins.length > 0,
        schnorrbecherPersistentState: includeSchnorrbecherPersistentState,
        credentialsAndSessions: opts.includeCredentialsSessions === true
    });
    assertSelectionConfirmed({
        ...selection,
        confirmSensitiveExport: opts.confirmSensitiveExport,
        confirmFullBackup: opts.confirmFullBackup
    });
    const includeSensitive = selection.credentialsAndSessions;
    const profileScopedDataPlugins = normalizeScopedPluginIds(requestedScopedDataPlugins);
    const scopedProfileId = canonicalProfileId(activeProfile);
    if (profileScopedDataPlugins.length && !validateProfileId(scopedProfileId)) {
        throw new Error('A valid active profile is required to export profile-scoped plugin data');
    }
    const profileScopedDataPluginSet = new Set(profileScopedDataPlugins);

    const warnings = [];
    const checksums = { formatVersion: FORMAT_VERSION, files: {} };
    const pluginMeta = [];
    // Trusted internal callers may lower these for synthetic boundary tests; the
    // DecompressionBudget constructor rejects values above the import hard caps.
    const exportBudget = new DecompressionBudget(deps.exportSizeLimits);
    let exportSizeLimitError = null;
    let exportSourceChangedError = null;
    let exportFileStageDir = null;
    let exportFileStageSequence = 0;
    let exportFileStageCleanupRegistered = false;

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Append a serialisable object as a JSON file inside the archive.
     */
    function appendBuffer(archive, name, buffer, includeChecksum = true) {
        const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
        if (!accountExportBytes(name, data.length)) return;
        if (includeChecksum) {
            checksums.files[name] = {
                sha256: computeChecksum(data),
                sizeBytes: data.length
            };
        }
        archive.append(data, { name });
    }

    function accountExportBytes(name, sizeBytes) {
        if (exportSizeLimitError || exportSourceChangedError) return false;
        try {
            exportBudget.add(name, sizeBytes);
            return true;
        } catch (error) {
            exportSizeLimitError = error;
            if (typeof archive.abort === 'function') archive.abort();
            return false;
        }
    }

    function cleanupExportFileStage() {
        if (!exportFileStageDir) return;
        fs.rmSync(exportFileStageDir, { recursive: true, force: true });
        exportFileStageDir = null;
    }

    function assertCollectedFilesWithinEntryLimit(fileWarnings) {
        if (!fileWarnings.some(warning => /Skipping oversized file/.test(warning))) return;
        const error = new Error('Backup entry exceeds the maximum uncompressed size');
        error.code = 'BACKUP_ENTRY_UNCOMPRESSED_SIZE_LIMIT';
        if (typeof archive.abort === 'function') archive.abort();
        cleanupExportFileStage();
        throw error;
    }

    function getExportFileStagePath() {
        if (!exportFileStageDir) {
            exportFileStageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-backup-export-stage-'));
        }
        if (!exportFileStageCleanupRegistered) {
            exportFileStageCleanupRegistered = true;
            archive.once('end', cleanupExportFileStage);
            archive.once('close', cleanupExportFileStage);
            archive.once('error', cleanupExportFileStage);
        }
        return path.join(exportFileStageDir, `entry-${++exportFileStageSequence}`);
    }

    function appendJson(archive, name, obj, includeChecksum = true) {
        const buf = Buffer.from(JSON.stringify(obj, null, 2), 'utf8');
        appendBuffer(archive, name, buf, includeChecksum);
    }

    async function appendFile(archive, filePath, archivePath) {
        if (exportSizeLimitError || exportSourceChangedError) return;
        const sourceBefore = fs.statSync(filePath);
        const stagedPath = getExportFileStagePath();
        const hash = crypto.createHash('sha256');
        let sizeBytes = 0;
        const byteBudgetAndHash = new Transform({
            transform(chunk, _encoding, callback) {
                if (!accountExportBytes(archivePath, chunk.length)) {
                    callback(exportSizeLimitError);
                    return;
                }
                hash.update(chunk);
                sizeBytes += chunk.length;
                callback(null, chunk);
            }
        });
        try {
            await pipeline(
                fs.createReadStream(filePath),
                byteBudgetAndHash,
                fs.createWriteStream(stagedPath, { flags: 'wx' })
            );
            let sourceAfter;
            try { sourceAfter = fs.statSync(filePath); }
            catch (_) { /* A vanished source cannot be a verified snapshot. */ }
            if (!sourceAfter || sizeBytes !== sourceBefore.size ||
                ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].some(key => sourceBefore[key] !== sourceAfter[key])) {
                exportSourceChangedError = new Error(`Backup source changed while copying: ${archivePath}`);
                exportSourceChangedError.code = 'BACKUP_EXPORT_SOURCE_CHANGED';
                if (typeof archive.abort === 'function') archive.abort();
                throw exportSourceChangedError;
            }
        } catch (error) {
            try { fs.rmSync(stagedPath, { force: true }); } catch (_) { /* best-effort cleanup */ }
            if (exportSizeLimitError || exportSourceChangedError) cleanupExportFileStage();
            throw error;
        }
        checksums.files[archivePath] = { sha256: hash.digest('hex'), sizeBytes };
        archive.file(stagedPath, { name: archivePath });
    }

    function normaliseArchivePath(relPath) {
        return relPath.replace(/\\/g, '/');
    }

    function isScopedPluginStagingPath(relPath) {
        const segments = normaliseArchivePath(relPath).split('/');
        return segments.some(segment => /^(?:\.legacy-timer-import-|\.legacy-import-|\.ltth-backup-stage-)/i.test(segment));
    }

    function getUserConfigIgnorePatterns() {
        return DEFAULT_IGNORE_PATTERNS.filter(pattern => {
            return !(pattern instanceof RegExp && pattern.toString() === '/^\\./');
        });
    }

    function discoverPluginDataIds() {
        if (!configPathManager || typeof configPathManager.getPluginsDir !== 'function') {
            return [];
        }

        const fs = require('fs');
        const pluginsDir = configPathManager.getPluginsDir();
        if (!fs.existsSync(pluginsDir)) {
            return [];
        }

        try {
            return fs.readdirSync(pluginsDir, { withFileTypes: true })
                .filter(entry => entry.isDirectory())
                .filter(entry => fs.existsSync(path.join(pluginsDir, entry.name, 'data')))
                .map(entry => canonicalizePluginId(entry.name));
        } catch (err) {
            warnings.push(`Failed to discover plugin data directories: ${err.message}`);
            return [];
        }
    }

    // ── Collect data ──────────────────────────────────────────────────────────

    // Global settings
    let globalSettings = {};
    if (includeGlobalSettings) {
        try {
            globalSettings = discoverGlobalSettings(db);
            globalSettings = filterSensitiveSettings(globalSettings, includeSensitive);
        } catch (err) {
            warnings.push(`Failed to read global settings: ${err.message}`);
        }
    }

    // Plugin settings + custom provider hooks
    const allPluginSettings = {};

    if (includePluginSettings || includePluginData) {
        let rawPluginSettings = {};
        if (includePluginSettings) {
            try {
                rawPluginSettings = discoverAllPluginSettings(db);
                for (const pluginId of Object.keys(rawPluginSettings)) {
                    rawPluginSettings[pluginId] = filterSensitiveSettings(rawPluginSettings[pluginId], includeSensitive);
                }
            } catch (err) {
                if (err.code === 'PLUGIN_IDENTITY_BACKUP_CONFLICT') {
                    throw err;
                }
                warnings.push(`Failed to read plugin settings from database: ${err.message}`);
            }
        }

        // Determine the set of plugin IDs to include
        const dbPluginIds = Object.keys(rawPluginSettings);
        const loadedPluginIds = pluginLoader
            ? Array.from(pluginLoader.loadedPlugins.keys()).map(canonicalizePluginId)
            : [];
        const dataPluginIds = includePluginData
            ? [...new Set([
                ...discoverPluginDataIds().filter(id => !PROFILE_SCOPED_PLUGIN_DATA.includes(id)),
                ...profileScopedDataPlugins
            ])]
            : [];
        const allIds = [...new Set([...dbPluginIds, ...loadedPluginIds, ...dataPluginIds]
            .map(canonicalizePluginId))];
        const filterIds = pluginFilter
            ? new Set(pluginFilter.map(canonicalizePluginId))
            : null;
        const selectedIds = filterIds ? allIds.filter(id => filterIds.has(id)) : allIds;

        for (const pluginId of selectedIds) {
            // Try custom provider first
            const provider = getIdentityCandidateIds(pluginId)
                .map(candidateId => backupProviders[candidateId])
                .find(Boolean);
            let customExport = null;
            if (provider && typeof provider.exportConfig === 'function') {
                try {
                    customExport = await provider.exportConfig();
                } catch (err) {
                    warnings.push(`Custom export failed for plugin ${pluginId}: ${err.message}`);
                }
            }

            const meta = { id: pluginId, hasCustomExport: customExport !== null };
            if (customExport && customExport.warnings) {
                warnings.push(...customExport.warnings.map(w => `[${pluginId}] ${w}`));
            }

            // Merge: custom settings override generic DB settings
            const dbSettings = rawPluginSettings[pluginId] || {};
            const finalSettings = customExport && customExport.settings
                ? { ...dbSettings, ...customExport.settings }
                : dbSettings;

            allPluginSettings[pluginId] = filterSensitiveSettings(finalSettings, includeSensitive);
            pluginMeta.push(meta);
        }
    }

    // ── Build archive ─────────────────────────────────────────────────────────

    const archiveFactory = deps.archiveFactory || archiver;
    const archive = archiveFactory('zip', { zlib: { level: 6 } });

    archive.on('warning', err => {
        warnings.push(`Archive warning: ${err.message}`);
    });

    // Global settings
    if (includeGlobalSettings) {
        appendJson(archive, 'global/settings.json', globalSettings);
    }

    // Per-plugin data
    for (const pluginId of Object.keys(allPluginSettings)) {
        // Settings
        if (includePluginSettings) {
            appendJson(archive, `plugins/${pluginId}/settings.json`, allPluginSettings[pluginId]);
        }

        // Data directory files
        if (includePluginData && PROFILE_SCOPED_PLUGIN_DATA.includes(pluginId) && !profileScopedDataPluginSet.has(pluginId)) {
            warnings.push(`[${pluginId}] Profile-scoped data omitted; select the profile-data backup option to include the active profile's files.`);
        } else if (includePluginData) {
            const dataDir = profileScopedDataPluginSet.has(pluginId)
                ? configPathManager.getPluginDataDir(pluginId, { profileId: scopedProfileId })
                : configPathManager.getPluginDataDir(pluginId);
            const { files, warnings: fileWarnings } = collectPluginFiles(dataDir, profileScopedDataPluginSet.has(pluginId)
                ? { ignorePatterns: [
                    ...DEFAULT_IGNORE_PATTERNS.filter(pattern => !(pattern instanceof RegExp && pattern.toString() === '/^\\./' && !includeSensitive)),
                    /^\.legacy-timer-import-/i, /^\.legacy-import-/i, /^\.ltth-backup-stage-/i
                ], maxFileSizeBytes: MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES }
                : includeSensitive
                    ? {
                        ignorePatterns: DEFAULT_IGNORE_PATTERNS.filter(pattern => !(pattern instanceof RegExp && pattern.toString() === '/^\\./')),
                        maxFileSizeBytes: MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES
                    }
                    : { maxFileSizeBytes: MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES });
            warnings.push(...fileWarnings.map(w => `[${pluginId}] ${w}`));
            assertCollectedFilesWithinEntryLimit(fileWarnings);
            const scopedFiles = profileScopedDataPluginSet.has(pluginId)
                ? files.filter(file => !isScopedPluginStagingPath(file.relPath) &&
                    !/^timers\.db-(?:wal|shm)$/i.test(path.posix.basename(normaliseArchivePath(file.relPath))) &&
                    (pluginId !== 'quiz-show' || normaliseArchivePath(file.relPath) === 'quiz_show.db'))
                : files;
            const exportFiles = scopedFiles.filter(file => includeSensitive || !isSensitiveFile(file.relPath));
            let schnorrPersistent = false;
            let schnorrConfigSnapshot = null;
            if (pluginId === 'schnorrbecher') {
                const config = exportFiles.find(file => file.relPath.replace(/\\/g, '/') === 'coin-jar-config.json');
                try {
                    schnorrConfigSnapshot = config ? await readProfileScopedFile(pluginId, config) : null;
                    schnorrPersistent = Boolean(schnorrConfigSnapshot && JSON.parse(schnorrConfigSnapshot.toString('utf8')).persistenceMode === 'persistent');
                } catch (_) { schnorrPersistent = false; }
            }

            for (const { absPath, relPath } of exportFiles) {
                if (pluginId === 'schnorrbecher' && relPath.replace(/\\/g, '/') === 'coin-jar-state.json' &&
                    (!includeSchnorrbecherPersistentState || !schnorrPersistent)) {
                    if (includeSchnorrbecherPersistentState && !schnorrPersistent) {
                        warnings.push('[schnorrbecher] Session state omitted; only explicitly selected persistent state can be backed up.');
                    }
                    continue;
                }
                const archivePath = `plugins/${pluginId}/data/${normaliseArchivePath(relPath)}`;
                try {
                    if (profileScopedDataPluginSet.has(pluginId)) {
                        const snapshot = pluginId === 'schnorrbecher' && relPath.replace(/\\/g, '/') === 'coin-jar-config.json'
                            ? schnorrConfigSnapshot
                            : pluginId === 'quiz-show' && relPath.replace(/\\/g, '/') === 'quiz_show.db'
                                ? await readSqliteSnapshot(absPath, { includeSensitive, scrubQuizShowSecrets: true })
                                : await readProfileScopedFile(pluginId, { absPath, relPath });
                        appendBuffer(archive, archivePath, snapshot);
                    } else {
                        await appendFile(archive, absPath, archivePath);
                    }
                } catch (err) {
                    warnings.push(`[${pluginId}] Could not add file ${relPath}: ${err.message}`);
                }
            }
        }
    }

    // User profile configs (profile DBs, active profile marker, plugin state)
    if (includeUserConfigs) {
        if (configPathManager && typeof configPathManager.getUserConfigsDir === 'function') {
            const userConfigsDir = configPathManager.getUserConfigsDir();
            const { files, warnings: fileWarnings } = collectFiles(userConfigsDir, userConfigsDir, {
                ignorePatterns: getUserConfigIgnorePatterns(),
                maxFileSizeBytes: MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES
            });
            warnings.push(...fileWarnings.map(w => `[user_configs] ${w}`));
            assertCollectedFilesWithinEntryLimit(fileWarnings);
            for (const { absPath, relPath } of files.filter(file => includeSensitive || !isSensitiveFile(file.relPath))) {
                if (/\.db-(?:wal|shm)$/i.test(relPath)) continue;
                try {
                    if (/\.db$/i.test(relPath)) {
                        const snapshot = await readSqliteSnapshot(absPath, { includeSensitive });
                        appendBuffer(archive, `user_configs/${normaliseArchivePath(relPath)}`, snapshot);
                    } else {
                        await appendFile(archive, absPath, `user_configs/${normaliseArchivePath(relPath)}`);
                    }
                } catch (err) {
                    warnings.push(`[user_configs] Could not add file ${relPath}: ${err.message}`);
                }
            }
        } else {
            warnings.push('[user_configs] Config path manager does not expose getUserConfigsDir()');
        }
    }

    // Uploads
    if (includeUploads) {
        const uploadsDir = configPathManager.getUploadsDir();
        const { files, warnings: fileWarnings } = collectFiles(uploadsDir, uploadsDir, {
            ignorePatterns: includeSensitive
                ? DEFAULT_IGNORE_PATTERNS.filter(pattern => !(pattern instanceof RegExp && pattern.toString() === '/^\\./'))
                : DEFAULT_IGNORE_PATTERNS,
            maxFileSizeBytes: MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES
        });
        warnings.push(...fileWarnings.map(w => `[uploads] ${w}`));
        assertCollectedFilesWithinEntryLimit(fileWarnings);
        for (const { absPath, relPath } of files.filter(file => includeSensitive || !isSensitiveFile(file.relPath))) {
            try {
                await appendFile(archive, absPath, `uploads/${normaliseArchivePath(relPath)}`);
            } catch (err) {
                warnings.push(`[uploads] Could not add file ${relPath}: ${err.message}`);
            }
        }
    }

    // User data
    if (includeUserData) {
        const userDataDir = configPathManager.getUserDataDir();
        const { files, warnings: fileWarnings } = collectFiles(userDataDir, userDataDir, {
            ignorePatterns: includeSensitive
                ? DEFAULT_IGNORE_PATTERNS.filter(pattern => !(pattern instanceof RegExp && pattern.toString() === '/^\\./'))
                : DEFAULT_IGNORE_PATTERNS,
            maxFileSizeBytes: MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES
        });
        warnings.push(...fileWarnings.map(w => `[user_data] ${w}`));
        assertCollectedFilesWithinEntryLimit(fileWarnings);
        for (const { absPath, relPath } of files.filter(file => includeSensitive || !isSensitiveFile(file.relPath))) {
            try {
                await appendFile(archive, absPath, `user_data/${normaliseArchivePath(relPath)}`);
            } catch (err) {
                warnings.push(`[user_data] Could not add file ${relPath}: ${err.message}`);
            }
        }
    }

    if (exportSizeLimitError || exportSourceChangedError) {
        cleanupExportFileStage();
        throw exportSizeLimitError || exportSourceChangedError;
    }

    warnings.push(includeSensitive
        ? 'Credentials and session fields/files were explicitly selected. Unclassified database or file contents may also contain personal or secret values; keep this backup secure.'
        : 'Known credential and session fields/files were omitted. Unclassified database or file contents may still contain personal or secret values.');
    if (isFullBackup(selection)) {
        warnings.push('Full backup selected: generic database and file contents may include unclassified personal or secret values.');
    }

    // Redact local paths before warnings reach the manifest or callers.
    for (let index = 0; index < warnings.length; index += 1) {
        warnings[index] = redactLocalPaths(warnings[index]);
    }

    // Manifest & checksums (append before finalize)
    const manifest = createManifest({
        appVersion,
        profile: activeProfile,
        options: {
            includeGlobalSettings,
            includePluginSettings,
            includePluginData,
            includeUserConfigs,
            includeUploads,
            includeUserData,
            pluginFilter: pluginFilter || 'all',
            profileScopedDataPlugins,
            includeSchnorrbecherPersistentState
        },
        profileScopedDataPlugins,
        dataSelection: {
            categories: Object.keys(selection).filter(category => selection[category]),
            partial: !isFullBackup(selection),
            sensitiveDataIncluded: includeSensitive
        },
        plugins: pluginMeta,
        warnings
    });

    appendJson(archive, 'manifest.json', manifest);
    appendJson(archive, 'checksums.json', checksums, false);

    if (exportSizeLimitError || exportSourceChangedError) {
        cleanupExportFileStage();
        throw exportSizeLimitError || exportSourceChangedError;
    }

    archive.finalize();

    return { stream: archive, warnings };
}

async function readSqliteSnapshot(databasePath, { includeSensitive = false, scrubQuizShowSecrets = false } = {}) {
    const Database = require('better-sqlite3');
    const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-backup-sqlite-'));
    const snapshotPath = path.join(snapshotDir, path.basename(databasePath));
    let sourceDb;
    try {
        sourceDb = new Database(databasePath, { readonly: true, fileMustExist: true });
        await sourceDb.backup(snapshotPath);
        sourceDb.close();
        sourceDb = null;
        if (!includeSensitive) {
            stripSensitiveSettings(snapshotPath, Database);
            if (scrubQuizShowSecrets) stripQuizShowSensitiveSettings(snapshotPath, Database);
        }
        return fs.readFileSync(snapshotPath);
    } finally {
        if (sourceDb && sourceDb.open) sourceDb.close();
        fs.rmSync(snapshotDir, { recursive: true, force: true });
    }
}

function stripQuizShowSensitiveSettings(snapshotPath, Database) {
    const snapshotDb = new Database(snapshotPath);
    try {
        const table = snapshotDb.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'openai_config'").get();
        if (!table) return;
        const columns = snapshotDb.pragma('table_info(openai_config)');
        if (!columns.some(column => column.name === 'api_key')) return;
        snapshotDb.prepare('UPDATE openai_config SET api_key = NULL WHERE api_key IS NOT NULL').run();
    } finally {
        if (snapshotDb.open) snapshotDb.close();
    }
}

function stripSensitiveSettings(snapshotPath, Database) {
    const snapshotDb = new Database(snapshotPath);
    try {
        const table = snapshotDb.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'settings'").get();
        if (!table) return;
        const rows = snapshotDb.prepare('SELECT key, value FROM settings').all();
        const sensitive = rows.filter(row => isSensitiveKey(row.key));
        const updates = rows.filter(row => !isSensitiveKey(row.key)).map(row => {
            if (typeof row.value !== 'string') return null;
            try {
                const parsed = JSON.parse(row.value);
                if (!parsed || typeof parsed !== 'object') return null;
                const filtered = filterSensitiveSettings({ value: parsed }, false).value;
                const next = JSON.stringify(filtered);
                return next === row.value ? null : { key: row.key, value: next };
            } catch { return null; }
        }).filter(Boolean);
        if (!sensitive.length && !updates.length) return;
        const remove = snapshotDb.prepare('DELETE FROM settings WHERE key = ?');
        const update = snapshotDb.prepare('UPDATE settings SET value = ? WHERE key = ?');
        snapshotDb.transaction(() => {
            sensitive.forEach(row => remove.run(row.key));
            updates.forEach(row => update.run(row.value, row.key));
        })();
        snapshotDb.exec('VACUUM');
    } finally {
        if (snapshotDb.open) snapshotDb.close();
    }
}

module.exports = { exportBackup };
