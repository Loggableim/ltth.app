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
const { snapshotProfileDatabases } = require('./sqlite-snapshots');
const fs = require('fs');
const os = require('os');
const archiver = require('archiver');
const { createManifest } = require('./manifest');
const { computeChecksum } = require('./checksum');
const { discoverAllPluginSettings, discoverGlobalSettings } = require('./plugin-discovery');
const { collectPluginFiles, collectFiles, DEFAULT_IGNORE_PATTERNS } = require('./file-collector');
const { canonicalizePluginId, getIdentityCandidateIds } = require('../plugin-identities');
const { PROFILE_SCOPED_PLUGIN_DATA, normalizeScopedPluginIds, canonicalProfileId, validateProfileId } = require('./profile-scoped-data');

const USER_CONFIG_FILE_SIZE_LIMIT_BYTES = 500 * 1024 * 1024;

function getUserConfigFileSizeLimit({ relPath }) {
    const fileName = path.posix.basename(relPath.replace(/\\/g, '/'));
    if (/\.db(?:-(?:wal|shm))?$/i.test(fileName)) {
        return null;
    }
    return USER_CONFIG_FILE_SIZE_LIMIT_BYTES;
}

async function readProfileScopedFile(pluginId, file) {
    const relPath = file.relPath.replace(/\\/g, '/');
    if (pluginId !== 'advanced-timer' || relPath !== 'timers.db') {
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
    const profileScopedDataPlugins = normalizeScopedPluginIds(requestedScopedDataPlugins);
    if (!Array.isArray(requestedScopedDataPlugins) || profileScopedDataPlugins.length !== requestedScopedDataPlugins.length) {
        throw new Error('Invalid profile-scoped plugin data selection');
    }
    if (typeof includeSchnorrbecherPersistentState !== 'boolean' ||
        (includeSchnorrbecherPersistentState && !profileScopedDataPlugins.includes('schnorrbecher'))) {
        throw new Error('Persistent Schnorrbecher state requires an explicit Schnorrbecher profile-data export');
    }
    const scopedProfileId = canonicalProfileId(activeProfile);
    if (profileScopedDataPlugins.length && !validateProfileId(scopedProfileId)) {
        throw new Error('A valid active profile is required to export profile-scoped plugin data');
    }
    const profileScopedDataPluginSet = new Set(profileScopedDataPlugins);

    const warnings = [];
    const checksums = {};
    const pluginMeta = [];

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Append a serialisable object as a JSON file inside the archive.
     */
    function appendJson(archive, name, obj) {
        const buf = Buffer.from(JSON.stringify(obj, null, 2), 'utf8');
        checksums[name] = computeChecksum(buf);
        archive.append(buf, { name });
    }

    function normaliseArchivePath(relPath) {
        return relPath.replace(/\\/g, '/');
    }

    function getUserConfigIgnorePatterns() {
        return DEFAULT_IGNORE_PATTERNS.filter(pattern => {
            return !(pattern instanceof RegExp && pattern.toString() === '/^\\./');
        });
    }

    function isScopedPluginStagingPath(relPath) {
        const segments = normaliseArchivePath(relPath).split('/');
        return segments.some(segment => /^(?:\.legacy-timer-import-|\.legacy-import-|\.ltth-backup-stage-)/i.test(segment));
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

            allPluginSettings[pluginId] = finalSettings;
            pluginMeta.push(meta);
        }
    }

    // ── Build archive ─────────────────────────────────────────────────────────

    let profileFiles = [];
    let releaseSnapshots = () => {};
    if (includeUserConfigs && configPathManager?.getUserConfigsDir) {
        const dir = configPathManager.getUserConfigsDir();
        const collected = collectFiles(dir, dir, {
            ignorePatterns: getUserConfigIgnorePatterns(),
            maxFileSizeBytes: USER_CONFIG_FILE_SIZE_LIMIT_BYTES,
            getMaxFileSizeBytes: getUserConfigFileSizeLimit
        });
        if (collected.warnings.length) {
            throw new Error(`[user_configs] Collection failed: ${collected.warnings.join('; ')}`);
        }
        const snapshots = await snapshotProfileDatabases(collected.files);
        profileFiles = snapshots.files;
        releaseSnapshots = snapshots.cleanup;
    }

    let cleanupArchive = releaseSnapshots;
    try {
    const archive = archiver('zip', { zlib: { level: 6 } });
    const snapshotStreams = [];
    cleanupArchive = () => {
        archive.abort();
        Promise.all(snapshotStreams.map(stream => new Promise(resolve => {
            if (stream.closed) return resolve();
            stream.once('close', resolve);
            stream.destroy();
        }))).then(releaseSnapshots);
    };
    archive.once('end', cleanupArchive);
    archive.once('close', cleanupArchive);
    // Keep the listener installed: Archiver can emit another queued error
    // after destroy. Consumers still receive the original stream error.
    archive.on('error', cleanupArchive);

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
                ? { ignorePatterns: [...DEFAULT_IGNORE_PATTERNS, /^\.legacy-timer-import-/i, /^\.legacy-import-/i, /^\.ltth-backup-stage-/i] }
                : {});
            warnings.push(...fileWarnings.map(w => `[${pluginId}] ${w}`));
            const scopedFiles = profileScopedDataPluginSet.has(pluginId)
                ? files.filter(file => !isScopedPluginStagingPath(file.relPath) && !/^timers\.db-(?:wal|shm)$/i.test(path.posix.basename(normaliseArchivePath(file.relPath))))
                : files;
            let schnorrPersistent = false;
            let schnorrConfigSnapshot = null;
            if (pluginId === 'schnorrbecher') {
                const config = scopedFiles.find(file => file.relPath.replace(/\\/g, '/') === 'coin-jar-config.json');
                try {
                    schnorrConfigSnapshot = config ? await readProfileScopedFile(pluginId, config) : null;
                    schnorrPersistent = Boolean(schnorrConfigSnapshot && JSON.parse(schnorrConfigSnapshot.toString('utf8')).persistenceMode === 'persistent');
                } catch (_) { schnorrPersistent = false; }
            }

            for (const { absPath, relPath } of scopedFiles) {
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
                            : await readProfileScopedFile(pluginId, { absPath, relPath });
                        archive.append(snapshot, { name: archivePath });
                    } else {
                        archive.file(absPath, { name: archivePath });
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
            for (const { absPath, relPath } of profileFiles) {
                if (/\.db$/i.test(relPath)) {
                    const stream = fs.createReadStream(absPath, { fd: fs.openSync(absPath, 'r') });
                    snapshotStreams.push(stream);
                    stream.on('error', err => archive.destroy(err));
                    archive.append(stream, { name: `user_configs/${normaliseArchivePath(relPath)}` });
                } else {
                    archive.file(absPath, { name: `user_configs/${normaliseArchivePath(relPath)}` });
                }
            }
        } else {
            warnings.push('[user_configs] Config path manager does not expose getUserConfigsDir()');
        }
    }

    // Uploads
    if (includeUploads) {
        const uploadsDir = configPathManager.getUploadsDir();
        const { files, warnings: fileWarnings } = collectFiles(uploadsDir, uploadsDir);
        warnings.push(...fileWarnings.map(w => `[uploads] ${w}`));
        for (const { absPath, relPath } of files) {
            try {
                archive.file(absPath, { name: `uploads/${normaliseArchivePath(relPath)}` });
            } catch (err) {
                warnings.push(`[uploads] Could not add file ${relPath}: ${err.message}`);
            }
        }
    }

    // User data
    if (includeUserData) {
        const userDataDir = configPathManager.getUserDataDir();
        const { files, warnings: fileWarnings } = collectFiles(userDataDir, userDataDir);
        warnings.push(...fileWarnings.map(w => `[user_data] ${w}`));
        for (const { absPath, relPath } of files) {
            try {
                archive.file(absPath, { name: `user_data/${normaliseArchivePath(relPath)}` });
            } catch (err) {
                warnings.push(`[user_data] Could not add file ${relPath}: ${err.message}`);
            }
        }
    }

    // Warn if secrets might be included
    warnings.push(
        'Secrets and API keys stored in plugin settings are included in this backup. ' +
        'Keep the backup file secure and do not share it publicly.'
    );

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
        plugins: pluginMeta,
        warnings
    });

    appendJson(archive, 'manifest.json', manifest);
    appendJson(archive, 'checksums.json', checksums);

    archive.finalize().catch(err => archive.destroy(err));

    return { stream: archive, warnings };
    } catch (err) {
        cleanupArchive();
        throw err;
    }
}

module.exports = { exportBackup, getUserConfigFileSizeLimit };
