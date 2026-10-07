'use strict';

/**
 * Backup importer – reads a ZIP archive produced by the exporter and restores
 * configuration into the running installation.
 *
 * Supports:
 *  - dry-run (preview) mode that returns a structured report without writing anything
 *  - merge mode  – only write settings/files that don't already exist
 *  - replace mode – overwrite everything
 *  - selective restore – caller can limit which plugins / sections to import
 */

const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');
const os = require('os');
const zl = require('zip-lib');
const { validateManifest } = require('./manifest');
const { validateBackupSize, validateEntryPath, validateDestinationPath, sanitisePluginId, MAX_BACKUP_SIZE_BYTES } = require('./validators');
const { discoverAllPluginSettings, discoverGlobalSettings, restorePluginSettings, restoreGlobalSettings } = require('./plugin-discovery');
const { detectPluginConflicts, detectSettingsConflicts } = require('./conflict-resolver');
const {
    canonicalizePluginId,
    getIdentityCandidateIds,
    getPluginIdentity
} = require('../plugin-identities');
const { valuesEqual } = require('../plugin-identity-sync');
const { PROFILE_SCOPED_PLUGIN_DATA, normalizeScopedPluginIds, validateProfileId, canonicalProfileId } = require('./profile-scoped-data');
const { DEFAULT_STATE: DEFAULT_COIN_JAR_STATE } = require('./schnorrbecher-state-schema');

function isEmptyInitializedCoinJarState(filePath) {
    try {
        const rawState = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return rawState !== null && typeof rawState === 'object' && !Array.isArray(rawState) &&
            isDeepStrictEqual(rawState, DEFAULT_COIN_JAR_STATE);
    } catch (_) {
        return false;
    }
}

function findUnsafeProfilePath(pluginRoot, targetPath) {
    const root = path.resolve(pluginRoot);
    const target = path.resolve(targetPath);
    const relative = path.relative(root, target);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        return { path: target, reason: 'escapes the plugin data root' };
    }

    let current = root;
    const candidates = [current, ...relative.split(path.sep).filter(Boolean).map(part => (current = path.join(current, part)))];
    for (const candidate of candidates) {
        try {
            if (fs.lstatSync(candidate).isSymbolicLink()) {
                return { path: candidate, reason: 'is a symbolic link' };
            }
        } catch (error) {
            if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
            return { path: candidate, reason: `cannot be inspected (${error.message})` };
        }
    }
    return null;
}

function normalizeBackupPluginSettings(pluginId, settings = {}) {
    const canonicalId = canonicalizePluginId(pluginId);
    const identity = getPluginIdentity(canonicalId);
    const normalized = {};
    for (const [rawSubKey, value] of Object.entries(settings || {})) {
        const subKey = identity && ['config', 'streamalchemy_config'].includes(rawSubKey)
            ? 'config'
            : rawSubKey;
        if (Object.prototype.hasOwnProperty.call(normalized, subKey) && !valuesEqual(normalized[subKey], value)) {
            const error = new Error(`Backup contains conflicting settings for ${canonicalId}:${subKey}`);
            error.code = 'PLUGIN_IDENTITY_BACKUP_CONFLICT';
            throw error;
        }
        normalized[subKey] = value;
    }
    return normalized;
}

function mergeBackupSettings(target, pluginId, settings) {
    const canonicalId = canonicalizePluginId(pluginId);
    const incoming = normalizeBackupPluginSettings(canonicalId, settings);
    const current = target[canonicalId] || {};
    for (const [subKey, value] of Object.entries(incoming)) {
        if (Object.prototype.hasOwnProperty.call(current, subKey) && !valuesEqual(current[subKey], value)) {
            const error = new Error(`Backup contains conflicting settings for ${canonicalId}:${subKey}`);
            error.code = 'PLUGIN_IDENTITY_BACKUP_CONFLICT';
            throw error;
        }
        current[subKey] = value;
    }
    target[canonicalId] = current;
}

function canonicalPluginFilter(pluginFilter) {
    return pluginFilter ? new Set(pluginFilter.map(canonicalizePluginId)) : null;
}

/**
 * Parse a backup ZIP from a file path on disk.
 *
 * @param {string} zipPath - Absolute path to the uploaded ZIP file
 * @param {number} [fileSizeBytes] - Pre-computed file size for size validation
 * @returns {Promise<{ manifest: object, globalSettings: object|null, pluginSettings: object, dataFiles: object, userConfigsFiles: Array, warnings: string[], errors: string[] }>}
 */
async function parseBackupZip(zipPath, fileSizeBytes) {
    const warnings = [];
    const errors = [];

    // Size check
    if (fileSizeBytes !== undefined) {
        const sizeCheck = validateBackupSize(fileSizeBytes);
        if (!sizeCheck.valid) {
            return { manifest: null, globalSettings: null, pluginSettings: {}, dataFiles: {}, userConfigsFiles: [], warnings, errors: [sizeCheck.error] };
        }
    }

    // Extract to a temp directory
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-backup-'));
    try {
        await zl.extract(zipPath, tmpDir);
    } catch (err) {
        cleanupTempDir(tmpDir);
        return { manifest: null, globalSettings: null, pluginSettings: {}, dataFiles: {}, userConfigsFiles: [], warnings, errors: [`Failed to extract backup archive: ${err.message}`] };
    }

    // ── Read manifest ─────────────────────────────────────────────────────────
    const manifestPath = path.join(tmpDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        cleanupTempDir(tmpDir);
        return { manifest: null, globalSettings: null, pluginSettings: {}, dataFiles: {}, userConfigsFiles: [], warnings, errors: ['Invalid backup: manifest.json not found'] };
    }

    let manifest;
    try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
        cleanupTempDir(tmpDir);
        return { manifest: null, globalSettings: null, pluginSettings: {}, dataFiles: {}, userConfigsFiles: [], warnings, errors: [`Failed to parse manifest.json: ${err.message}`] };
    }

    const manifestValidation = validateManifest(manifest);
    if (!manifestValidation.valid) {
        cleanupTempDir(tmpDir);
        return { manifest, globalSettings: null, pluginSettings: {}, dataFiles: {}, userConfigsFiles: [], warnings, errors: manifestValidation.errors };
    }
    warnings.push(...(manifest.warnings || []).map(w => `[original export] ${w}`));
    manifest.plugins = [...new Map((manifest.plugins || []).map(plugin => {
        const canonicalId = canonicalizePluginId(plugin.id);
        return [canonicalId, { ...plugin, id: canonicalId }];
    })).values()];

    // ── Read global settings ──────────────────────────────────────────────────
    let globalSettings = null;
    const globalSettingsPath = path.join(tmpDir, 'global', 'settings.json');
    if (fs.existsSync(globalSettingsPath)) {
        try {
            globalSettings = JSON.parse(fs.readFileSync(globalSettingsPath, 'utf8'));
        } catch (err) {
            warnings.push(`Failed to parse global/settings.json: ${err.message}`);
        }
    }

    // ── Read per-plugin settings ──────────────────────────────────────────────
    const pluginSettings = {};
    const pluginsDir = path.join(tmpDir, 'plugins');

    if (fs.existsSync(pluginsDir)) {
        const pluginEntries = fs.readdirSync(pluginsDir, { withFileTypes: true })
            .filter(e => e.isDirectory());

        for (const entry of pluginEntries) {
            const runtimePluginId = sanitisePluginId(entry.name);
            const pluginId = runtimePluginId && canonicalizePluginId(runtimePluginId);
            if (!pluginId) {
                warnings.push(`Skipping plugin directory with unsafe name: ${entry.name}`);
                continue;
            }

            const settingsFile = path.join(pluginsDir, entry.name, 'settings.json');
            if (fs.existsSync(settingsFile)) {
                try {
                    mergeBackupSettings(pluginSettings, pluginId, JSON.parse(fs.readFileSync(settingsFile, 'utf8')));
                } catch (err) {
                    if (err.code === 'PLUGIN_IDENTITY_BACKUP_CONFLICT') errors.push(`${err.code}: ${err.message}`);
                    else warnings.push(`Failed to parse settings for plugin ${pluginId}: ${err.message}`);
                }
            }
        }
    }

    // ── Collect data files (keep as temp paths for now) ───────────────────────
    // dataFiles: pluginId → Array<{ tmpPath, relPath }>
    const dataFiles = {};

    if (fs.existsSync(pluginsDir)) {
        const pluginEntries = fs.readdirSync(pluginsDir, { withFileTypes: true })
            .filter(e => e.isDirectory());

        for (const entry of pluginEntries) {
            const runtimePluginId = sanitisePluginId(entry.name);
            const pluginId = runtimePluginId && canonicalizePluginId(runtimePluginId);
            if (!pluginId) continue;

            const dataDir = path.join(pluginsDir, entry.name, 'data');
            if (!fs.existsSync(dataDir)) continue;

            const files = walkDir(dataDir);
            const existingFiles = new Map((dataFiles[pluginId] || []).map(file => [
                file.relPath.replace(/\\/g, '/'), file
            ]));
            for (const absPath of files) {
                const relPath = path.relative(dataDir, absPath);
                const relKey = relPath.replace(/\\/g, '/');
                const existing = existingFiles.get(relKey);
                if (existing) {
                    if (!fs.readFileSync(existing.tmpPath).equals(fs.readFileSync(absPath))) {
                        errors.push(
                            `PLUGIN_IDENTITY_BACKUP_CONFLICT: Backup contains conflicting data for ${pluginId}:${relKey}`
                        );
                    }
                    continue;
                }
                existingFiles.set(relKey, { tmpPath: absPath, relPath });
            }
            dataFiles[pluginId] = [...existingFiles.values()];
        }
    }

    // ── Collect upload / user_data file paths ─────────────────────────────────
    const uploadFiles = [];
    const uploadsDir = path.join(tmpDir, 'uploads');
    if (fs.existsSync(uploadsDir)) {
        walkDir(uploadsDir).forEach(absPath => {
            uploadFiles.push({ tmpPath: absPath, relPath: path.relative(uploadsDir, absPath) });
        });
    }

    const userDataFiles = [];
    const userDataDir = path.join(tmpDir, 'user_data');
    if (fs.existsSync(userDataDir)) {
        walkDir(userDataDir).forEach(absPath => {
            userDataFiles.push({ tmpPath: absPath, relPath: path.relative(userDataDir, absPath) });
        });
    }

    const userConfigsFiles = [];
    const userConfigsDir = path.join(tmpDir, 'user_configs');
    if (fs.existsSync(userConfigsDir)) {
        walkDir(userConfigsDir).forEach(absPath => {
            userConfigsFiles.push({ tmpPath: absPath, relPath: path.relative(userConfigsDir, absPath) });
        });
    }

    return {
        manifest,
        globalSettings,
        pluginSettings,
        dataFiles,
        userConfigsFiles,
        uploadFiles,
        userDataFiles,
        tmpDir,     // Caller must clean up
        warnings,
        errors
    };
}

/**
 * Generate a dry-run preview of what would be imported.
 *
 * @param {object} parsed      - Result of parseBackupZip
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db
 * @param {object} [opts]
 * @param {string[]} [opts.pluginFilter] - Only preview these plugin IDs
 * @returns {object} Preview report
 */
function previewImport(parsed, deps, opts = {}) {
    const { db } = deps;
    const { pluginFilter } = opts;

    const currentGlobal = discoverGlobalSettings(db);
    const currentPlugins = discoverAllPluginSettings(db);

    const globalConflicts = parsed.globalSettings
        ? detectSettingsConflicts(parsed.globalSettings, currentGlobal)
        : { new: [], conflicts: [], unchanged: [] };

    const allPluginIds = [...new Set([
        ...Object.keys(parsed.pluginSettings || {}),
        ...Object.keys(parsed.dataFiles || {})
    ])];
    const filterIds = canonicalPluginFilter(pluginFilter);
    const selectedPluginIds = filterIds
        ? allPluginIds.filter(id => filterIds.has(canonicalizePluginId(id)))
        : allPluginIds;

    const pluginConflicts = detectPluginConflicts(
        Object.fromEntries(selectedPluginIds.map(id => [id, parsed.pluginSettings[id] || {}])),
        currentPlugins
    );

    const dataFileSummary = {};
    for (const pluginId of selectedPluginIds) {
        const files = parsed.dataFiles[pluginId] || [];
        dataFileSummary[pluginId] = files.length;
    }

    return {
        manifest: parsed.manifest,
        warnings: parsed.warnings,
        global: {
            new: globalConflicts.new.length,
            conflicts: globalConflicts.conflicts.length,
            unchanged: globalConflicts.unchanged.length,
            conflictKeys: globalConflicts.conflicts
        },
        plugins: Object.fromEntries(
            selectedPluginIds.map(id => [
                id,
                {
                    settingsNew: (pluginConflicts[id] || {}).new?.length || 0,
                    settingsConflicts: (pluginConflicts[id] || {}).conflicts?.length || 0,
                    settingsUnchanged: (pluginConflicts[id] || {}).unchanged?.length || 0,
                    conflictKeys: (pluginConflicts[id] || {}).conflicts || [],
                    dataFiles: dataFileSummary[id] || 0
                }
            ])
        ),
        userConfigFiles: (parsed.userConfigsFiles || []).length,
        uploadFiles: (parsed.uploadFiles || []).length,
        userDataFiles: (parsed.userDataFiles || []).length,
        profileScopedPluginData: {
            sourceProfile: parsed.manifest.sourceProfile || null,
            plugins: normalizeScopedPluginIds(parsed.manifest.profileScopedDataPlugins || []),
            requiresExplicitTargetProfile: normalizeScopedPluginIds(parsed.manifest.profileScopedDataPlugins || []).length > 0,
            schnorrbecherPersistentStateAvailable: normalizeScopedPluginIds(parsed.manifest.profileScopedDataPlugins || []).includes('schnorrbecher') &&
                (parsed.dataFiles?.schnorrbecher || []).some(file => file.relPath.replace(/\\/g, '/') === 'coin-jar-state.json')
        }
    };
}

/**
 * Perform the actual import.
 *
 * @param {object} parsed      - Result of parseBackupZip
 * @param {object} deps
 * @param {import('better-sqlite3').Database} deps.db
 * @param {import('../config-path-manager')} deps.configPathManager
 * @param {object} [deps.backupProviders] - Map<pluginId, provider>
 * @param {object} opts
 * @param {'merge'|'replace'} [opts.mode='merge']
 * @param {boolean} [opts.includeGlobalSettings=true]
 * @param {boolean} [opts.includePluginSettings=true]
 * @param {boolean} [opts.includePluginData=true]
 * @param {boolean} [opts.includeUserConfigs=true]
 * @param {boolean} [opts.includeUploads=true]
 * @param {boolean} [opts.includeUserData=true]
 * @param {string[]} [opts.pluginFilter] - Only restore these plugin IDs
 * @returns {Promise<{ success: boolean, report: object, warnings: string[], errors: string[] }>}
 */
async function performImport(parsed, deps, opts = {}) {
    const { db, configPathManager, backupProviders = {} } = deps;
    const {
        mode = 'merge',
        includeGlobalSettings = true,
        includePluginSettings = true,
        includePluginData = true,
        includeUserConfigs = true,
        includeUploads = true,
        includeUserData = true,
        pluginFilter = null,
        includeProfileScopedPluginData = false,
        includeSchnorrbecherPersistentState = false,
        targetProfile = null
    } = opts;

    const importProfileScopedPluginData = includeProfileScopedPluginData === true;
    const importSchnorrbecherPersistentState = includeSchnorrbecherPersistentState === true;

    const warnings = [...(parsed.warnings || [])];
    const errors = [...(parsed.errors || [])];
    const report = {
        globalSettings: { imported: [], skipped: [] },
        plugins: {},
        userConfigs: { imported: [], skipped: [], renamed: [] }
    };
    if (errors.length) {
        return {
            success: false,
            report,
            warnings,
            errors
        };
    }

    const archivedScopedPlugins = new Set(normalizeScopedPluginIds(parsed.manifest.profileScopedDataPlugins || []));
    const activeProfileId = canonicalProfileId(deps.activeProfile);
    if (importProfileScopedPluginData && archivedScopedPlugins.size &&
        activeProfileId && targetProfile && canonicalProfileId(targetProfile) !== activeProfileId &&
        (includeGlobalSettings || includePluginSettings)) {
        errors.push('Global and plugin settings can only be restored to the currently active profile; disable settings import to target another profile');
        return { success: false, report, warnings, errors };
    }
    const schnorrStateFile = (parsed.dataFiles?.schnorrbecher || []).find(file => file.relPath.replace(/\\/g, '/') === 'coin-jar-state.json');
    if (schnorrStateFile && importSchnorrbecherPersistentState) {
        const configFile = (parsed.dataFiles?.schnorrbecher || []).find(file => file.relPath.replace(/\\/g, '/') === 'coin-jar-config.json');
        let archivedPersistenceMode = null;
        try { archivedPersistenceMode = JSON.parse(fs.readFileSync(configFile.tmpPath, 'utf8')).persistenceMode; } catch (_) { /* invalid config will block state import */ }
        if (!importProfileScopedPluginData || !archivedScopedPlugins.has('schnorrbecher') || archivedPersistenceMode !== 'persistent') {
            errors.push('Schnorrbecher state import requires profile-scoped metadata and an archived persistent config');
            return { success: false, report, warnings, errors };
        }
    }
    let scopedTargetProfile = null;
    const replaceInitializedTargets = new Set();
    if (includePluginData && importProfileScopedPluginData && archivedScopedPlugins.size) {
        if (mode !== 'merge') {
            errors.push('Profile-scoped plugin data only supports merge mode so existing target files are never overwritten');
        }
        if (!validateProfileId(targetProfile)) {
            errors.push('A valid explicitly selected target profile is required for profile-scoped plugin data');
        } else {
            const userConfigsDir = configPathManager?.getUserConfigsDir?.();
            const targetPath = userConfigsDir && path.join(userConfigsDir, `${targetProfile}.db`);
            if (!targetPath || !fs.existsSync(targetPath)) {
                errors.push('The selected target profile does not exist');
            } else {
                scopedTargetProfile = targetProfile;
            }
        }
        if (!errors.length) {
            for (const pluginId of archivedScopedPlugins) {
                if (pluginFilter && !canonicalPluginFilter(pluginFilter).has(pluginId)) continue;
                const destBase = configPathManager.getPluginDataDir(pluginId, { profileId: scopedTargetProfile });
                const pluginRoot = path.dirname(configPathManager.getPluginDataDir(pluginId));
                for (const file of parsed.dataFiles?.[pluginId] || []) {
                    if (pluginId === 'schnorrbecher' &&
                        file.relPath.replace(/\\/g, '/') === 'coin-jar-state.json' &&
                        !importSchnorrbecherPersistentState) continue;
                    const pathCheck = validateEntryPath(file.relPath);
                    if (!pathCheck.valid) {
                        errors.push(`[${pluginId}] Profile-scoped import preflight failed: ${pathCheck.error}`);
                        continue;
                    }
                    const destPath = path.join(destBase, file.relPath);
                    const destCheck = validateDestinationPath(destPath, destBase);
                    const existing = fs.existsSync(destPath);
                    const unsafePath = findUnsafeProfilePath(pluginRoot, destPath);
                    const emptyJarInitialization = pluginId === 'schnorrbecher' &&
                        file.relPath.replace(/\\/g, '/') === 'coin-jar-state.json' &&
                        importSchnorrbecherPersistentState && isEmptyInitializedCoinJarState(destPath);
                    if (emptyJarInitialization) replaceInitializedTargets.add(destPath);
                    if (!pathCheck.valid || !destCheck.valid || unsafePath || (existing && !emptyJarInitialization)) {
                        const reason = !pathCheck.valid
                            ? pathCheck.error
                            : !destCheck.valid
                                ? destCheck.error
                                : unsafePath
                                    ? `Profile-scoped import path ${unsafePath.reason}: ${unsafePath.path}`
                                    : `Destination already exists: ${file.relPath}`;
                        errors.push(`[${pluginId}] Profile-scoped import preflight failed: ${reason}`);
                    }
                }
            }
        }
        if (errors.length) return { success: false, report, warnings, errors };
    }

    // ── Global settings ───────────────────────────────────────────────────────
    if (includeGlobalSettings && parsed.globalSettings) {
        try {
            const result = restoreGlobalSettings(db, parsed.globalSettings, mode);
            report.globalSettings = result;
        } catch (err) {
            errors.push(`Failed to restore global settings: ${err.message}`);
        }
    }

    // ── Plugin settings ───────────────────────────────────────────────────────
    const allPluginIds = [...new Set([
        ...Object.keys(parsed.pluginSettings || {}),
        ...Object.keys(parsed.dataFiles || {})
    ])];
    const filterIds = canonicalPluginFilter(pluginFilter);
    const selectedPluginIds = filterIds
        ? allPluginIds.filter(id => filterIds.has(canonicalizePluginId(id)))
        : allPluginIds;

    for (const pluginId of selectedPluginIds) {
        report.plugins[pluginId] = { importedSettings: [], skippedSettings: [], importedFiles: [], skippedFiles: [] };

        // Try custom provider
        const provider = getIdentityCandidateIds(pluginId)
            .map(candidateId => backupProviders[candidateId])
            .find(Boolean);
        if (provider && typeof provider.importConfig === 'function' && includePluginSettings) {
            try {
                const customResult = await provider.importConfig({
                    settings: parsed.pluginSettings[pluginId] || {},
                    mode
                });
                if (customResult.warnings) warnings.push(...customResult.warnings.map(w => `[${pluginId}] ${w}`));
                if (customResult.importedKeys) report.plugins[pluginId].importedSettings = customResult.importedKeys;
            } catch (err) {
                warnings.push(`Custom import failed for plugin ${pluginId}, using generic fallback: ${err.message}`);
                // Fall through to generic import
                if (includePluginSettings && parsed.pluginSettings[pluginId]) {
                    const result = restorePluginSettings(db, pluginId, parsed.pluginSettings[pluginId], mode);
                    report.plugins[pluginId].importedSettings = result.imported;
                    report.plugins[pluginId].skippedSettings = result.skipped;
                }
            }
        } else if (includePluginSettings && parsed.pluginSettings[pluginId]) {
            const result = restorePluginSettings(db, pluginId, parsed.pluginSettings[pluginId], mode);
            report.plugins[pluginId].importedSettings = result.imported;
            report.plugins[pluginId].skippedSettings = result.skipped;
        }

        // Plugin data files
        if (includePluginData && parsed.dataFiles && parsed.dataFiles[pluginId]) {
            const profileScoped = archivedScopedPlugins.has(pluginId);
            if (PROFILE_SCOPED_PLUGIN_DATA.includes(pluginId) && !profileScoped) {
                warnings.push(`[${pluginId}] Unmarked legacy plugin data skipped; choose an explicit legacy import in the plugin UI.`);
                report.plugins[pluginId].skippedFiles.push(...parsed.dataFiles[pluginId].map(file => file.relPath));
                continue;
            }
            if (pluginId === 'schnorrbecher' && schnorrStateFile && !importSchnorrbecherPersistentState) {
                warnings.push('[schnorrbecher] State file skipped; persistent state requires explicit selection in the import preview.');
                report.plugins[pluginId].skippedFiles.push('coin-jar-state.json');
            }
            if (profileScoped && (!importProfileScopedPluginData || !scopedTargetProfile)) {
                warnings.push(`[${pluginId}] Profile-scoped data skipped; choose a target profile and explicitly enable profile data import.`);
                report.plugins[pluginId].skippedFiles.push(...parsed.dataFiles[pluginId].map(file => file.relPath));
                continue;
            }
            const destBase = profileScoped
                ? configPathManager.getPluginDataDir(pluginId, { profileId: scopedTargetProfile })
                : configPathManager.getPluginDataDir(pluginId);
            if (profileScoped) {
                const files = parsed.dataFiles[pluginId].filter(file => !(pluginId === 'schnorrbecher' &&
                    file.relPath.replace(/\\/g, '/') === 'coin-jar-state.json' && !importSchnorrbecherPersistentState));
                const staged = [];
                const pluginRoot = path.dirname(configPathManager.getPluginDataDir(pluginId));
                let stageDir = null;
                let preserveStageForRecovery = false;
                try {
                    const unsafeBase = findUnsafeProfilePath(pluginRoot, destBase);
                    if (unsafeBase) {
                        throw new Error(`Profile-scoped import path ${unsafeBase.reason}: ${unsafeBase.path}`);
                    }
                    fs.mkdirSync(destBase, { recursive: true });
                    const unsafeBeforeStage = findUnsafeProfilePath(pluginRoot, destBase);
                    if (unsafeBeforeStage) {
                        throw new Error(`Profile-scoped import path became unsafe before staging: ${unsafeBeforeStage.path} ${unsafeBeforeStage.reason}`);
                    }
                    stageDir = fs.mkdtempSync(path.join(destBase, '.ltth-backup-stage-'));
                    for (const file of files) {
                        const stagePath = path.join(stageDir, file.relPath);
                        const unsafeStage = findUnsafeProfilePath(pluginRoot, stagePath);
                        if (unsafeStage) {
                            throw new Error(`Profile-scoped stage path became unsafe before directory creation: ${unsafeStage.path} ${unsafeStage.reason}`);
                        }
                        const unsafeBeforeStageMkdir = findUnsafeProfilePath(pluginRoot, stagePath);
                        if (unsafeBeforeStageMkdir) {
                            throw new Error(`Profile-scoped stage path became unsafe before directory creation: ${unsafeBeforeStageMkdir.path} ${unsafeBeforeStageMkdir.reason}`);
                        }
                        fs.mkdirSync(path.dirname(stagePath), { recursive: true });
                        const unsafeBeforeStageCopy = findUnsafeProfilePath(pluginRoot, stagePath);
                        if (unsafeBeforeStageCopy) {
                            throw new Error(`Profile-scoped stage path became unsafe before copy: ${unsafeBeforeStageCopy.path} ${unsafeBeforeStageCopy.reason}`);
                        }
                        fs.copyFileSync(file.tmpPath, stagePath);
                        staged.push({ stagePath, destPath: path.join(destBase, file.relPath), relPath: file.relPath });
                    }
                    const installed = [];
                    const replacedTargets = [];
                    try {
                        for (const file of staged) {
                            const unsafePath = findUnsafeProfilePath(pluginRoot, file.destPath);
                            if (unsafePath) {
                                throw new Error(`Destination path became unsafe before directory creation: ${unsafePath.path} ${unsafePath.reason}`);
                            }
                            fs.mkdirSync(path.dirname(file.destPath), { recursive: true });
                            const unsafeBeforeExchange = findUnsafeProfilePath(pluginRoot, file.destPath);
                            if (unsafeBeforeExchange) {
                                throw new Error(`Destination path became unsafe before exchange: ${unsafeBeforeExchange.path} ${unsafeBeforeExchange.reason}`);
                            }
                            if (replaceInitializedTargets.has(file.destPath) && fs.existsSync(file.destPath)) {
                                const previous = path.join(stageDir, `.previous-${replacedTargets.length}`);
                                fs.renameSync(file.destPath, previous);
                                replacedTargets.push({ target: file.destPath, backup: previous });
                                if (!isEmptyInitializedCoinJarState(previous)) {
                                    throw new Error(`Destination changed after preflight; preserved concurrent state for ${file.relPath}`);
                                }
                            }
                            const unsafeBeforeInstall = findUnsafeProfilePath(pluginRoot, file.destPath);
                            if (unsafeBeforeInstall) {
                                throw new Error(`Destination path became unsafe before install: ${unsafeBeforeInstall.path} ${unsafeBeforeInstall.reason}`);
                            }
                            fs.copyFileSync(file.stagePath, file.destPath, fs.constants.COPYFILE_EXCL);
                            installed.push(file.destPath);
                            report.plugins[pluginId].importedFiles.push(file.relPath);
                        }
                    } catch (error) {
                        const rollbackErrors = [];
                        for (const installedPath of installed.reverse()) {
                            try {
                                const unsafeInstalled = findUnsafeProfilePath(pluginRoot, installedPath);
                                if (unsafeInstalled) throw new Error(`unsafe rollback target ${unsafeInstalled.path} ${unsafeInstalled.reason}`);
                                fs.unlinkSync(installedPath);
                            } catch (rollbackError) { rollbackErrors.push(`${installedPath}: ${rollbackError.message}`); }
                        }
                        for (const entry of replacedTargets.reverse()) {
                            try {
                                const unsafeBackup = findUnsafeProfilePath(pluginRoot, entry.backup);
                                const unsafeTarget = findUnsafeProfilePath(pluginRoot, entry.target);
                                if (unsafeBackup || unsafeTarget) {
                                    const unsafePath = unsafeBackup || unsafeTarget;
                                    throw new Error(`unsafe rollback path ${unsafePath.path} ${unsafePath.reason}`);
                                }
                                fs.linkSync(entry.backup, entry.target);
                                fs.unlinkSync(entry.backup);
                            } catch (rollbackError) {
                                rollbackErrors.push(`${entry.target}: ${rollbackError.message}`);
                            }
                        }
                        if (rollbackErrors.length) {
                            preserveStageForRecovery = true;
                            error.message += `; rollback failed: ${rollbackErrors.join('; ')}; recovery data retained at ${stageDir}`;
                        }
                        throw error;
                    }
                } catch (error) {
                    errors.push(`[${pluginId}] Profile-scoped import failed: ${error.message}`);
                } finally {
                    if (!preserveStageForRecovery && stageDir) {
                        const unsafeCleanup = findUnsafeProfilePath(pluginRoot, stageDir);
                        if (unsafeCleanup) {
                            preserveStageForRecovery = true;
                            errors.push(`[${pluginId}] Stage cleanup skipped because the recovery path became unsafe: ${unsafeCleanup.path} ${unsafeCleanup.reason}`);
                        } else {
                            cleanupTempDir(stageDir);
                        }
                    }
                }
                continue;
            }

            for (const { tmpPath, relPath } of parsed.dataFiles[pluginId]) {
                // Path traversal check
                const pathCheck = validateEntryPath(relPath);
                if (!pathCheck.valid) {
                    warnings.push(`[${pluginId}] Skipping file with unsafe path: ${relPath}`);
                    report.plugins[pluginId].skippedFiles.push(relPath);
                    continue;
                }

                const destPath = path.join(destBase, relPath);
                const destCheck = validateDestinationPath(destPath, destBase);
                if (!destCheck.valid) {
                    warnings.push(`[${pluginId}] Skipping file, ${destCheck.error}`);
                    report.plugins[pluginId].skippedFiles.push(relPath);
                    continue;
                }

                // In merge mode, skip existing files
                if ((mode === 'merge' || profileScoped) && fs.existsSync(destPath)) {
                    report.plugins[pluginId].skippedFiles.push(relPath);
                    continue;
                }

                try {
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    fs.copyFileSync(tmpPath, destPath);
                    report.plugins[pluginId].importedFiles.push(relPath);
                } catch (err) {
                    warnings.push(`[${pluginId}] Failed to restore file ${relPath}: ${err.message}`);
                    report.plugins[pluginId].skippedFiles.push(relPath);
                }
            }
        }
    }

    // ── Uploads ───────────────────────────────────────────────────────────────
    // User profile config files
    if (includeUserConfigs && parsed.userConfigsFiles && parsed.userConfigsFiles.length > 0) {
        if (!configPathManager || typeof configPathManager.getUserConfigsDir !== 'function') {
            warnings.push('[user_configs] Config path manager does not expose getUserConfigsDir()');
        } else {
            const userConfigsBase = configPathManager.getUserConfigsDir();
            const profileNameMap = {};
            const activeDbPath = getActiveDbPath(db);
            const files = parsed.userConfigsFiles.slice().sort(sortUserConfigFiles);

            for (const { tmpPath, relPath } of files) {
                const pathCheck = validateEntryPath(relPath);
                if (!pathCheck.valid) {
                    warnings.push(`[user_configs] Skipping file with unsafe path: ${relPath}`);
                    report.userConfigs.skipped.push(relPath);
                    continue;
                }

                if (isActiveProfileMarker(relPath)) {
                    try {
                        const originalProfile = fs.readFileSync(tmpPath, 'utf8').trim();
                        const restoredProfile = profileNameMap[originalProfile] || originalProfile;
                        const destPath = path.join(userConfigsBase, '.active_profile');
                        const destCheck = validateDestinationPath(destPath, userConfigsBase);
                        if (!destCheck.valid) {
                            warnings.push(`[user_configs] Skipping .active_profile, ${destCheck.error}`);
                            report.userConfigs.skipped.push(relPath);
                            continue;
                        }
                        if (mode === 'merge' && fs.existsSync(destPath)) {
                            report.userConfigs.skipped.push(relPath);
                            continue;
                        }
                        fs.mkdirSync(path.dirname(destPath), { recursive: true });
                        fs.writeFileSync(destPath, restoredProfile, 'utf8');
                        report.userConfigs.imported.push(relPath);
                    } catch (err) {
                        warnings.push(`[user_configs] Failed to restore ${relPath}: ${err.message}`);
                        report.userConfigs.skipped.push(relPath);
                    }
                    continue;
                }

                let targetRelPath = mapUserConfigRelPath(relPath, profileNameMap);
                let destPath = path.join(userConfigsBase, targetRelPath);
                const destCheck = validateDestinationPath(destPath, userConfigsBase);
                if (!destCheck.valid) {
                    warnings.push(`[user_configs] Skipping file, ${destCheck.error}`);
                    report.userConfigs.skipped.push(relPath);
                    continue;
                }

                if (mode === 'merge' && fs.existsSync(destPath)) {
                    report.userConfigs.skipped.push(relPath);
                    continue;
                }

                if (isRootProfileDatabase(relPath) && activeDbPath && path.resolve(destPath) === activeDbPath) {
                    const originalProfile = path.basename(relPath, '.db');
                    const restoredProfile = makeRestoreProfileName(userConfigsBase, originalProfile);
                    profileNameMap[originalProfile] = restoredProfile;
                    targetRelPath = `${restoredProfile}.db`;
                    destPath = path.join(userConfigsBase, targetRelPath);
                    report.userConfigs.renamed.push({ from: relPath, to: targetRelPath });
                    warnings.push(
                        `[user_configs] Active profile database ${relPath} restored as ${targetRelPath}; restart the application to load it.`
                    );
                }

                try {
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                    fs.copyFileSync(tmpPath, destPath);
                    report.userConfigs.imported.push(targetRelPath);
                } catch (err) {
                    if (isRootProfileDatabase(relPath)) {
                        const originalProfile = path.basename(relPath, '.db');
                        const restoredProfile = profileNameMap[originalProfile] || makeRestoreProfileName(userConfigsBase, originalProfile);
                        profileNameMap[originalProfile] = restoredProfile;
                        const fallbackRelPath = `${restoredProfile}.db`;
                        const fallbackDestPath = path.join(userConfigsBase, fallbackRelPath);
                        const fallbackCheck = validateDestinationPath(fallbackDestPath, userConfigsBase);

                        if (fallbackCheck.valid) {
                            try {
                                fs.mkdirSync(path.dirname(fallbackDestPath), { recursive: true });
                                fs.copyFileSync(tmpPath, fallbackDestPath);
                                report.userConfigs.imported.push(fallbackRelPath);
                                report.userConfigs.renamed.push({ from: relPath, to: fallbackRelPath });
                                warnings.push(
                                    `[user_configs] Could not overwrite ${relPath}; restored as ${fallbackRelPath}: ${err.message}`
                                );
                                continue;
                            } catch (fallbackErr) {
                                warnings.push(`[user_configs] Failed fallback restore for ${relPath}: ${fallbackErr.message}`);
                            }
                        }
                    } else {
                        warnings.push(`[user_configs] Failed to restore ${relPath}: ${err.message}`);
                    }
                    report.userConfigs.skipped.push(relPath);
                }
            }
        }
    }

    if (includeUploads && parsed.uploadFiles && parsed.uploadFiles.length > 0) {
        const uploadsBase = configPathManager.getUploadsDir();
        report.uploads = { imported: [], skipped: [] };

        for (const { tmpPath, relPath } of parsed.uploadFiles) {
            const pathCheck = validateEntryPath(relPath);
            if (!pathCheck.valid) {
                warnings.push(`[uploads] Skipping file with unsafe path: ${relPath}`);
                report.uploads.skipped.push(relPath);
                continue;
            }

            const destPath = path.join(uploadsBase, relPath);
            const destCheck = validateDestinationPath(destPath, uploadsBase);
            if (!destCheck.valid) {
                warnings.push(`[uploads] Skipping file, ${destCheck.error}`);
                report.uploads.skipped.push(relPath);
                continue;
            }

            if (mode === 'merge' && fs.existsSync(destPath)) {
                report.uploads.skipped.push(relPath);
                continue;
            }

            try {
                fs.mkdirSync(path.dirname(destPath), { recursive: true });
                fs.copyFileSync(tmpPath, destPath);
                report.uploads.imported.push(relPath);
            } catch (err) {
                warnings.push(`[uploads] Failed to restore ${relPath}: ${err.message}`);
                report.uploads.skipped.push(relPath);
            }
        }
    }

    // ── User data ─────────────────────────────────────────────────────────────
    if (includeUserData && parsed.userDataFiles && parsed.userDataFiles.length > 0) {
        const userDataBase = configPathManager.getUserDataDir();
        report.userData = { imported: [], skipped: [] };

        for (const { tmpPath, relPath } of parsed.userDataFiles) {
            const pathCheck = validateEntryPath(relPath);
            if (!pathCheck.valid) {
                warnings.push(`[user_data] Skipping file with unsafe path: ${relPath}`);
                report.userData.skipped.push(relPath);
                continue;
            }

            const destPath = path.join(userDataBase, relPath);
            const destCheck = validateDestinationPath(destPath, userDataBase);
            if (!destCheck.valid) {
                warnings.push(`[user_data] Skipping file, ${destCheck.error}`);
                report.userData.skipped.push(relPath);
                continue;
            }

            if (mode === 'merge' && fs.existsSync(destPath)) {
                report.userData.skipped.push(relPath);
                continue;
            }

            try {
                fs.mkdirSync(path.dirname(destPath), { recursive: true });
                fs.copyFileSync(tmpPath, destPath);
                report.userData.imported.push(relPath);
            } catch (err) {
                warnings.push(`[user_data] Failed to restore ${relPath}: ${err.message}`);
                report.userData.skipped.push(relPath);
            }
        }
    }

    return {
        success: errors.length === 0,
        report,
        warnings,
        errors
    };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Recursively walk a directory and return absolute file paths.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function walkDir(dir) {
    const results = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkDir(full));
        } else if (entry.isFile()) {
            results.push(full);
        }
    }
    return results;
}

function isActiveProfileMarker(relPath) {
    return relPath.replace(/\\/g, '/') === '.active_profile';
}

function isRootProfileDatabase(relPath) {
    const zipPath = relPath.replace(/\\/g, '/');
    return !zipPath.includes('/') && zipPath.endsWith('.db');
}

function isRootPluginStateFile(relPath) {
    const zipPath = relPath.replace(/\\/g, '/');
    return !zipPath.includes('/') && zipPath.endsWith('_plugins_state.json');
}

function mapUserConfigRelPath(relPath, profileNameMap) {
    if (isRootPluginStateFile(relPath)) {
        const fileName = path.basename(relPath);
        const profileName = fileName.slice(0, -'_plugins_state.json'.length);
        if (profileNameMap[profileName]) {
            return `${profileNameMap[profileName]}_plugins_state.json`;
        }
    }

    return relPath;
}

function sortUserConfigFiles(a, b) {
    const priority = (relPath) => {
        if (isRootProfileDatabase(relPath)) return 0;
        if (isRootPluginStateFile(relPath)) return 1;
        if (isActiveProfileMarker(relPath)) return 2;
        return 3;
    };

    return priority(a.relPath) - priority(b.relPath);
}

function makeRestoreProfileName(userConfigsBase, originalProfile) {
    const safeBaseName = originalProfile.replace(/[^a-zA-Z0-9_-]/g, '_') || 'imported-profile';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    let candidate = `${safeBaseName}-restored-${timestamp}`;
    let counter = 1;

    while (
        fs.existsSync(path.join(userConfigsBase, `${candidate}.db`)) ||
        fs.existsSync(path.join(userConfigsBase, `${candidate}_plugins_state.json`))
    ) {
        candidate = `${safeBaseName}-restored-${timestamp}-${counter}`;
        counter += 1;
    }

    return candidate;
}

function getActiveDbPath(db) {
    if (!db) return null;
    if (db.dbPath) return path.resolve(db.dbPath);
    if (db.name && db.name !== ':memory:') return path.resolve(db.name);
    if (db.db && db.db.name && db.db.name !== ':memory:') return path.resolve(db.db.name);
    return null;
}

/**
 * Remove a temporary directory created during import parsing.
 *
 * @param {string} tmpDir
 */
function cleanupTempDir(tmpDir) {
    try {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    } catch {
        // best effort
    }
}

module.exports = { parseBackupZip, previewImport, performImport, cleanupTempDir };
