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
const os = require('os');
const crypto = require('crypto');
const { Transform } = require('stream');
const zl = require('zip-lib');
const { validateManifest, FORMAT_VERSION } = require('./manifest');
const { validateBackupSize, validateEntryPath, validateDestinationPath, sanitisePluginId, MAX_BACKUP_SIZE_BYTES, MAX_BACKUP_FILES } = require('./validators');
const { DecompressionBudget } = require('./decompression-budget');
const { discoverAllPluginSettings, discoverGlobalSettings, restorePluginSettings, restoreGlobalSettings } = require('./plugin-discovery');
const { detectPluginConflicts, detectSettingsConflicts } = require('./conflict-resolver');
const {
    canonicalizePluginId,
    getIdentityCandidateIds,
    getPluginIdentity
} = require('../plugin-identities');
const { valuesEqual } = require('../plugin-identity-sync');
const { PROFILE_SCOPED_PLUGIN_DATA, normalizeScopedPluginIds, validateProfileId, canonicalProfileId } = require('./profile-scoped-data');
const { DEFAULT_STATE: DEFAULT_COIN_JAR_STATE, normalizeState: normalizeCoinJarState } = require('../../plugins/schnorrbecher/lib/config');

function isEmptyInitializedCoinJarState(filePath) {
    try {
        const state = normalizeCoinJarState(JSON.parse(fs.readFileSync(filePath, 'utf8')));
        return JSON.stringify(state) === JSON.stringify(normalizeCoinJarState(DEFAULT_COIN_JAR_STATE));
    } catch (_) {
        return false;
    }
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

function validateRestoreBase(base) {
    const resolvedBase = path.resolve(base);
    const parsed = path.parse(resolvedBase);
    let cursor = parsed.root;
    for (const part of resolvedBase.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
        cursor = path.join(cursor, part);
        try {
            if (fs.lstatSync(cursor).isSymbolicLink()) {
                throw new Error(`Symbolic link in restore base: ${cursor}`);
            }
        } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
        }
    }
}

function validateRestoreDestination(base, destination) {
    const resolvedBase = path.resolve(base);
    const resolvedDestination = path.resolve(destination);
    const pathCheck = validateDestinationPath(resolvedDestination, resolvedBase);
    if (!pathCheck.valid) throw new Error(pathCheck.error);
    validateRestoreBase(resolvedBase);

    const relative = path.relative(resolvedBase, resolvedDestination);
    const parts = relative.split(path.sep).filter(Boolean);
    let cursor = resolvedBase;
    for (const part of parts) {
        cursor = path.join(cursor, part);
        try {
            if (fs.lstatSync(cursor).isSymbolicLink()) {
                throw new Error(`Symbolic link in restore path: ${cursor}`);
            }
        } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
        }
    }
}

function findQuizShowDatabaseFile(parsed) {
    const quizFiles = Object.entries(parsed?.dataFiles || {})
        .filter(([pluginId]) => canonicalizePluginId(pluginId) === 'quiz-show')
        .flatMap(([, files]) => files || []);
    return quizFiles.find(file =>
        String(file.relPath || '').replace(/\\/g, '/') === 'quiz_show.db'
    ) || null;
}

function validateQuizShowDatabaseFile(file) {
    const Database = require('better-sqlite3');
    const database = new Database(file.tmpPath, { readonly: true, fileMustExist: true });
    try {
        return database.pragma('integrity_check', { simple: true }) === 'ok';
    } finally {
        if (database.open) database.close();
    }
}

function classifyArchiveEntry(entry, seenEntries, seenPathSpellings, seenPathKinds) {
    const entryName = entry && entry.entryName;
    if (typeof entryName !== 'string' || !entryName) return 'invalid-entry-path';
    if (!Number.isSafeInteger(entry.externalFileAttributes) || entry.externalFileAttributes < 0) return 'unsupported-entry-type';

    const slashName = entryName.replace(/\\/g, '/');
    const directory = slashName.endsWith('/');
    const pathName = directory ? slashName.slice(0, -1) : slashName;
    const normalizedPath = path.posix.normalize(pathName);
    if (!normalizedPath || normalizedPath === '.' || normalizedPath !== pathName) return 'invalid-entry-path';
    if (seenEntries.has(slashName)) return 'entry-path-collision';

    const externalAttributes = entry.externalFileAttributes >>> 0;
    const rawMode = (externalAttributes >>> 16) & 0xffff;
    const fileType = rawMode & 0o170000;
    const dosAttributes = externalAttributes & 0xffff;
    if ((dosAttributes & 0x0400) !== 0 || (dosAttributes & 0x0040) !== 0 ||
        (fileType !== 0 && fileType !== 0o100000 && fileType !== 0o040000) ||
        (fileType === 0o040000 && !directory) ||
        (fileType === 0o100000 && directory)) {
        return 'unsupported-entry-type';
    }

    const parts = pathName.split('/');
    for (let index = 0; index < parts.length; index += 1) {
        const prefix = parts.slice(0, index + 1).join('/');
        const canonicalPrefix = prefix.normalize('NFC').toLowerCase();
        const existingSpelling = seenPathSpellings.get(canonicalPrefix);
        if (existingSpelling !== undefined && existingSpelling !== prefix) return 'entry-path-collision';

        const isFinal = index === parts.length - 1;
        const kind = isFinal && !directory ? 'file' : 'directory';
        const existingKind = seenPathKinds.get(canonicalPrefix);
        if (existingKind && existingKind !== kind) return 'entry-path-collision';
        if (!isFinal && existingKind === 'file') return 'entry-path-collision';

        seenPathSpellings.set(canonicalPrefix, prefix);
        seenPathKinds.set(canonicalPrefix, kind);
    }

    seenEntries.add(slashName);
    return null;
}

/**
 * Parse a backup ZIP from a file path on disk.
 *
 * @param {string} zipPath - Absolute path to the uploaded ZIP file
 * @param {number} [fileSizeBytes] - Pre-computed file size for size validation
 * @returns {Promise<{ manifest: object, globalSettings: object|null, pluginSettings: object, dataFiles: object, userConfigsFiles: Array, warnings: string[], errors: string[] }>}
 */
async function parseBackupZip(zipPath, fileSizeBytes, decompressionLimits = {}) {
    const warnings = [];
    const errors = [];

    // Measure the ZIP itself; the optional caller size is only a consistency check.
    let measuredFileSize;
    try {
        measuredFileSize = fs.statSync(zipPath).size;
    } catch (_) {
        return { manifest: null, globalSettings: null, pluginSettings: {}, dataFiles: {}, userConfigsFiles: [], warnings, errors: ['Unable to read backup archive size'] };
    }
    if (fileSizeBytes !== undefined && (!Number.isSafeInteger(fileSizeBytes) || fileSizeBytes !== measuredFileSize)) {
        return { manifest: null, globalSettings: null, pluginSettings: {}, dataFiles: {}, userConfigsFiles: [], warnings, errors: ['Backup archive size does not match the measured file size'] };
    }
    const sizeCheck = validateBackupSize(measuredFileSize);
    if (!sizeCheck.valid) {
        return { manifest: null, globalSettings: null, pluginSettings: {}, dataFiles: {}, userConfigsFiles: [], warnings, errors: [sizeCheck.error] };
    }

    let decompressionBudget;
    try {
        // Optional lower limits are only for trusted internal callers (for example,
        // isolated regression fixtures); callers can never raise the hard limits.
        decompressionBudget = new DecompressionBudget(decompressionLimits);
    } catch (error) {
        return { manifest: null, globalSettings: null, pluginSettings: {}, dataFiles: {}, userConfigsFiles: [], warnings, errors: [error.message] };
    }

    // Extract to a temp directory
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-backup-'));
    let tooManyArchiveEntries = false;
    let decompressionFailure = null;
    let archiveEntryFailure = null;
    const seenEntries = new Set();
    const seenPathSpellings = new Map();
    const seenPathKinds = new Map();
    const zipEntryMetadata = [];
    const extractedFileDigests = new Map();
    const archiveLimitResult = () => ({
        manifest: null,
        globalSettings: null,
        pluginSettings: {},
        dataFiles: {},
        userConfigsFiles: [],
        warnings,
        errors: [`Backup contains more than ${MAX_BACKUP_FILES} archive entries`],
        tmpDir: null
    });
    const archiveEntryFailureResult = () => {
        const message = archiveEntryFailure === 'unsupported-entry-type'
            ? 'Backup archive contains an unsupported file type'
            : 'Backup archive contains invalid, duplicate or colliding entry paths';
        return { manifest: null, globalSettings: null, pluginSettings: {}, dataFiles: {}, userConfigsFiles: [], warnings, errors: [message], tmpDir: null };
    };
    const unzip = new zl.Unzip({
        onEntry(entry) {
            if (entry.entryCount > MAX_BACKUP_FILES) {
                tooManyArchiveEntries = true;
                unzip.cancel();
                return;
            }
            if (archiveEntryFailure) {
                entry.preventDefault();
                return;
            }
            const metadata = zipEntryMetadata.shift();
            const reason = classifyArchiveEntry({
                entryName: entry.entryName,
                externalFileAttributes: metadata?.externalFileAttributes
            }, seenEntries, seenPathSpellings, seenPathKinds);
            if (reason) {
                archiveEntryFailure = reason;
                entry.preventDefault();
            }
        }
    });
    // zip-lib's onEntry callback omits ZIP external attributes, so capture each
    // yauzl entry before zip-lib emits its corresponding name/count event.
    const openZip = unzip.openZip.bind(unzip);
    unzip.openZip = async (...args) => {
        const zipFile = await openZip(...args);
        zipFile.on('entry', zipEntry => {
            if (!archiveEntryFailure && !tooManyArchiveEntries) zipEntryMetadata.push(zipEntry);
        });
        return zipFile;
    };
    const writeEntryToFile = unzip.writeEntryToFile.bind(unzip);
    unzip.writeEntryToFile = (readStream, entry, entryContext, token) => {
        const entryName = String(entryContext.decodeEntryFileName).replace(/\\/g, '/');
        const entryHash = crypto.createHash('sha256');
        const meteredStream = new Transform({
            transform(chunk, _encoding, callback) {
                try {
                    decompressionBudget.add(entryContext.decodeEntryFileName, chunk.length);
                    entryHash.update(chunk);
                    callback(null, chunk);
                } catch (error) {
                    decompressionFailure = error;
                    unzip.cancel();
                    callback(error);
                }
            }
        });
        meteredStream.once('end', () => extractedFileDigests.set(entryName, entryHash.digest('hex')));
        readStream.once('error', error => meteredStream.destroy(error));
        readStream.pipe(meteredStream);
        return writeEntryToFile(meteredStream, entry, entryContext, token);
    };
    try {
        await unzip.extract(zipPath, tmpDir);
    } catch (err) {
        cleanupTempDir(tmpDir);
        if (tooManyArchiveEntries) return archiveLimitResult();
        if (archiveEntryFailure) return archiveEntryFailureResult();
        if (decompressionFailure) {
            return { manifest: null, globalSettings: null, pluginSettings: {}, dataFiles: {}, userConfigsFiles: [], warnings, errors: [decompressionFailure.message], tmpDir: null };
        }
        return { manifest: null, globalSettings: null, pluginSettings: {}, dataFiles: {}, userConfigsFiles: [], warnings, errors: [`Failed to extract backup archive: ${err.message}`] };
    }
    if (tooManyArchiveEntries) {
        cleanupTempDir(tmpDir);
        return archiveLimitResult();
    }
    if (archiveEntryFailure) {
        cleanupTempDir(tmpDir);
        return archiveEntryFailureResult();
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

    const integrityCheck = await validateArchiveIntegrity(tmpDir, manifest);
    warnings.push(...integrityCheck.warnings);
    if (!integrityCheck.valid) {
        cleanupTempDir(tmpDir);
        return {
            manifest,
            globalSettings: null,
            pluginSettings: {},
            dataFiles: {},
            userConfigsFiles: [],
            warnings,
            errors: integrityCheck.errors,
            integrity: integrityCheck.integrity,
            tmpDir: null
        };
    }

    if (!integrityCheck.integrity.fileDigests) {
        Object.defineProperty(integrityCheck.integrity, 'fileDigests', { value: Object.create(null) });
    }
    for (const [entryPath, sha256] of extractedFileDigests) {
        integrityCheck.integrity.fileDigests[entryPath] = sha256;
    }

    if (manifest.dataSelection?.partial === true) {
        warnings.push('This is a partial backup; categories not selected at export time are absent.');
    } else if (!manifest.dataSelection) {
        warnings.push('This legacy archive has no data-scope metadata; backup completeness cannot be determined.');
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
            errors.push(`Failed to parse global/settings.json: ${err.message}`);
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
                    else errors.push(`Failed to parse settings for plugin ${pluginId}: ${err.message}`);
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

    if (errors.length) {
        cleanupTempDir(tmpDir);
    }

    return {
        manifest,
        globalSettings,
        pluginSettings,
        dataFiles,
        userConfigsFiles,
        uploadFiles,
        userDataFiles,
        tmpDir: errors.length ? null : tmpDir, // Caller must clean up
        warnings,
        errors,
        integrity: integrityCheck.integrity
    };
}

async function validateArchiveIntegrity(tmpDir, manifest) {
    const errors = [];
    const warnings = [];
    const files = walkDir(tmpDir);
    const archiveFiles = new Set(files.map(file => path.relative(tmpDir, file).replace(/\\/g, '/')));
    const checksumPath = 'checksums.json';
    const checksumFilePath = path.join(tmpDir, checksumPath);
    const formatVersion = parseBackupFormatVersion(manifest.formatVersion);

    if (!formatVersion) {
        return {
            valid: false,
            errors: [`Unsupported backup format version: ${manifest.formatVersion}`],
            warnings,
            integrity: { status: 'invalid', verifiedFiles: 0, unverifiedFiles: archiveFiles.size }
        };
    }

    if (!archiveFiles.has(checksumPath)) {
        if (formatVersion && compareBackupVersions(formatVersion, [1, 0, 0]) < 0) {
            warnings.push(`Legacy backup format ${manifest.formatVersion} has no checksums; its contents are unverified.`);
            return {
                valid: true,
                errors,
                warnings,
                integrity: { status: 'unverified-legacy', verifiedFiles: 0, unverifiedFiles: archiveFiles.size }
            };
        }
        return {
            valid: false,
            errors: ['checksums.json is required for backup format 1.0.0 and newer'],
            warnings,
            integrity: { status: 'invalid', verifiedFiles: 0, unverifiedFiles: archiveFiles.size }
        };
    }

    let checksums;
    try {
        checksums = JSON.parse(fs.readFileSync(checksumFilePath, 'utf8'));
    } catch (error) {
        return {
            valid: false,
            errors: [`Failed to parse checksums.json: ${error.message}`],
            warnings,
            integrity: { status: 'invalid', verifiedFiles: 0, unverifiedFiles: archiveFiles.size }
        };
    }

    const requiredFiles = new Set([...archiveFiles].filter(file => file !== checksumPath));
    const fileDigests = Object.create(null);
    if (formatVersion && compareBackupVersions(formatVersion, [1, 1, 0]) >= 0) {
        if (!checksums || checksums.formatVersion !== manifest.formatVersion || !checksums.files ||
            typeof checksums.files !== 'object' || Array.isArray(checksums.files) ||
            Object.keys(checksums).some(key => !['formatVersion', 'files'].includes(key))) {
            errors.push(`checksums.json does not match checksum schema ${FORMAT_VERSION}`);
        } else {
            const checksumFiles = checksums.files;
            for (const entryPath of Object.keys(checksumFiles)) {
                if (!validateEntryPath(entryPath).valid || entryPath.replace(/\\/g, '/') !== entryPath || !requiredFiles.has(entryPath)) {
                    errors.push(`checksums.json contains an unknown or unsafe path: ${entryPath}`);
                }
            }
            for (const entryPath of requiredFiles) {
                if (!Object.prototype.hasOwnProperty.call(checksumFiles, entryPath)) {
                    errors.push(`checksums.json is missing an entry for ${entryPath}`);
                    continue;
                }
                const expected = checksumFiles[entryPath];
                if (!expected || typeof expected !== 'object' || Array.isArray(expected) ||
                    Object.keys(expected).sort().join(',') !== 'sha256,sizeBytes' ||
                    !/^[a-f0-9]{64}$/i.test(expected.sha256) ||
                    !Number.isSafeInteger(expected.sizeBytes) || expected.sizeBytes < 0) {
                    errors.push(`checksums.json has an invalid digest or size for ${entryPath}`);
                    continue;
                }
                const actual = await calculateFileChecksum(path.join(tmpDir, entryPath));
                if (actual.sizeBytes !== expected.sizeBytes) {
                    errors.push(`Backup file size mismatch for ${entryPath}`);
                }
                if (actual.sha256 !== expected.sha256.toLowerCase()) {
                    errors.push(`Backup file checksum mismatch for ${entryPath}`);
                } else {
                    fileDigests[entryPath] = expected.sha256.toLowerCase();
                }
            }
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            integrity: attachFileDigests({
                status: errors.length ? 'invalid' : 'verified',
                verifiedFiles: errors.length ? 0 : requiredFiles.size,
                unverifiedFiles: errors.length ? requiredFiles.size : 0
            }, fileDigests)
        };
    }

    // Format 1.0.0 used a digest-only map and omitted streamed payload files.
    // Verify every declared digest and require all JSON files that its exporter covered.
    if (!checksums || typeof checksums !== 'object' || Array.isArray(checksums) ||
        Object.keys(checksums).some(entryPath => entryPath === 'formatVersion' || entryPath === 'files')) {
        errors.push('checksums.json does not match the legacy checksum schema');
        return { valid: false, errors, warnings, integrity: { status: 'invalid', verifiedFiles: 0, unverifiedFiles: requiredFiles.size } };
    }

    let verifiedFiles = 0;
    for (const [entryPath, expectedHash] of Object.entries(checksums)) {
        if (!validateEntryPath(entryPath).valid || entryPath.replace(/\\/g, '/') !== entryPath || !requiredFiles.has(entryPath)) {
            errors.push(`checksums.json contains an unknown or unsafe path: ${entryPath}`);
            continue;
        }
        if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedHash)) {
            errors.push(`checksums.json has an invalid digest for ${entryPath}`);
            continue;
        }
        const actual = await calculateFileChecksum(path.join(tmpDir, entryPath));
        if (actual.sha256 !== expectedHash.toLowerCase()) {
            errors.push(`Backup file checksum mismatch for ${entryPath}`);
            continue;
        }
        verifiedFiles++;
        fileDigests[entryPath] = expectedHash.toLowerCase();
    }

    for (const entryPath of requiredFiles) {
        if (/^(?:manifest\.json|global\/settings\.json|plugins\/[^/]+\/settings\.json)$/.test(entryPath) &&
            !Object.prototype.hasOwnProperty.call(checksums, entryPath)) {
            errors.push(`Legacy checksums.json is missing a required settings digest for ${entryPath}`);
        }
    }

    const unverifiedFiles = requiredFiles.size - verifiedFiles;
    if (!errors.length && unverifiedFiles > 0) {
        warnings.push(`Legacy backup format ${manifest.formatVersion} has partial checksums; ${unverifiedFiles} file(s) are not integrity-verified.`);
    }
    return {
        valid: errors.length === 0,
        errors,
        warnings,
        integrity: attachFileDigests({
            status: errors.length ? 'invalid' : unverifiedFiles ? 'partially-verified-legacy' : 'verified-legacy',
            verifiedFiles,
            unverifiedFiles
        }, fileDigests)
    };
}

function attachFileDigests(integrity, fileDigests) {
    Object.defineProperty(integrity, 'fileDigests', { value: fileDigests });
    return integrity;
}

function parseBackupFormatVersion(value) {
    if (typeof value !== 'string') return null;
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
    return match ? match.slice(1).map(Number) : null;
}

function compareBackupVersions(left, right) {
    for (let index = 0; index < 3; index++) {
        if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
    }
    return 0;
}

function calculateFileChecksum(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        let sizeBytes = 0;
        const input = fs.createReadStream(filePath);
        input.on('data', chunk => {
            hash.update(chunk);
            sizeBytes += chunk.length;
        });
        input.once('error', reject);
        input.once('end', () => resolve({ sha256: hash.digest('hex'), sizeBytes }));
    });
}

function calculateFileChecksumSync(filePath) {
    const descriptor = fs.openSync(filePath, 'r');
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    try {
        let bytesRead;
        while ((bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
            hash.update(buffer.subarray(0, bytesRead));
        }
        return hash.digest('hex');
    } finally {
        fs.closeSync(descriptor);
    }
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
        dataSelection: parsed.manifest.dataSelection || { known: false, partial: null, categories: [] },
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
                (parsed.dataFiles?.schnorrbecher || []).some(file => file.relPath.replace(/\\/g, '/') === 'coin-jar-state.json'),
            legacyQuizShowDatabaseAvailable: !normalizeScopedPluginIds(parsed.manifest.profileScopedDataPlugins || []).includes('quiz-show') &&
                Boolean(findQuizShowDatabaseFile(parsed))
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
 * @param {boolean} [opts.confirmProfileReplacement=false]
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
        includeLegacyQuizShowDatabase = false,
        includeSchnorrbecherPersistentState = false,
        targetProfile = null,
        confirmProfileReplacement = false
    } = opts;

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

    const hasProfileRestoreFiles = (parsed.userConfigsFiles || []).some(file =>
        isRootProfileDatabase(file.relPath) || isActiveProfileMarker(file.relPath)
    );
    if (mode === 'replace' && includeUserConfigs && hasProfileRestoreFiles && confirmProfileReplacement !== true) {
        errors.push('Replacing user profiles requires explicit confirmation that matching profiles may be overwritten and the active profile may change');
        return { success: false, report, warnings, errors };
    }

    const fileTransaction = createFileRestoreTransaction();
    const databaseSnapshot = includeGlobalSettings || (includePluginSettings && Object.keys(parsed.pluginSettings || {}).length)
        ? snapshotSettingsTable(db)
        : null;

    const archivedScopedPlugins = new Set(normalizeScopedPluginIds(parsed.manifest.profileScopedDataPlugins || []));
    const legacyQuizShowDatabaseFile = findQuizShowDatabaseFile(parsed);
    const requestsLegacyQuizShowImport = includeLegacyQuizShowDatabase === true;
    if (requestsLegacyQuizShowImport && (
        !includePluginData || archivedScopedPlugins.has('quiz-show') || !legacyQuizShowDatabaseFile ||
        (pluginFilter && !canonicalPluginFilter(pluginFilter).has('quiz-show'))
    )) {
        errors.push('Legacy Quiz Show import requires an unmarked archive containing plugins/quiz-show/data/quiz_show.db and Plugin Data Files enabled');
        return { success: false, report, warnings, errors };
    }
    const activeProfileId = canonicalProfileId(deps.activeProfile);
    const requestsScopedTarget = (includeProfileScopedPluginData && archivedScopedPlugins.size) || requestsLegacyQuizShowImport;
    if (requestsScopedTarget &&
        activeProfileId && targetProfile && canonicalProfileId(targetProfile) !== activeProfileId &&
        (includeGlobalSettings || includePluginSettings)) {
        errors.push('Global and plugin settings can only be restored to the currently active profile; disable settings import to target another profile');
        return { success: false, report, warnings, errors };
    }
    const schnorrStateFile = (parsed.dataFiles?.schnorrbecher || []).find(file => file.relPath.replace(/\\/g, '/') === 'coin-jar-state.json');
    if (schnorrStateFile && includeSchnorrbecherPersistentState) {
        const configFile = (parsed.dataFiles?.schnorrbecher || []).find(file => file.relPath.replace(/\\/g, '/') === 'coin-jar-config.json');
        let archivedPersistenceMode = null;
        try { archivedPersistenceMode = JSON.parse(fs.readFileSync(configFile.tmpPath, 'utf8')).persistenceMode; } catch (_) { /* invalid config will block state import */ }
        if (!includeProfileScopedPluginData || !archivedScopedPlugins.has('schnorrbecher') || archivedPersistenceMode !== 'persistent') {
            errors.push('Schnorrbecher state import requires profile-scoped metadata and an archived persistent config');
            return { success: false, report, warnings, errors };
        }
    }
    let scopedTargetProfile = null;
    const replaceInitializedTargets = new Set();
    if (includePluginData && requestsScopedTarget) {
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
                const allPluginFiles = parsed.dataFiles?.[pluginId] || [];
                const pluginFiles = pluginId === 'quiz-show' ? allPluginFiles.filter(file => file === findQuizShowDatabaseFile(parsed)) : allPluginFiles;
                if (pluginId === 'quiz-show' && (pluginFiles.length !== 1 || allPluginFiles.length !== 1)) {
                    errors.push('[quiz-show] Profile-scoped archive must contain exactly quiz_show.db');
                    continue;
                }
                let baseIsSafe = true;
                try { validateRestoreBase(destBase); }
                catch (error) {
                    errors.push(`[${pluginId}] Profile-scoped import target is unsafe: ${error.message}`);
                    baseIsSafe = false;
                }
                for (const file of baseIsSafe ? pluginFiles : []) {
                    if (pluginId === 'schnorrbecher' &&
                        file.relPath.replace(/\\/g, '/') === 'coin-jar-state.json' &&
                        !includeSchnorrbecherPersistentState) continue;
                    if (pluginId === 'quiz-show' && !validateQuizShowDatabaseFile(file)) {
                        errors.push('[quiz-show] Profile-scoped database failed SQLite integrity validation');
                        continue;
                    }
                    const pathCheck = validateEntryPath(file.relPath);
                    const destPath = path.join(destBase, file.relPath);
                    const destCheck = validateDestinationPath(destPath, destBase);
                    const existing = fs.existsSync(destPath);
                    const emptyJarInitialization = pluginId === 'schnorrbecher' &&
                        file.relPath.replace(/\\/g, '/') === 'coin-jar-state.json' &&
                        includeSchnorrbecherPersistentState && isEmptyInitializedCoinJarState(destPath);
                    if (emptyJarInitialization) replaceInitializedTargets.add(destPath);
                    if (!pathCheck.valid || !destCheck.valid || (existing && !emptyJarInitialization)) {
                        errors.push(`[${pluginId}] Profile-scoped import preflight failed: ${!pathCheck.valid ? pathCheck.error : !destCheck.valid ? destCheck.error : `Destination already exists: ${file.relPath}`}`);
                    }
                    try { validateRestoreDestination(destBase, destPath); }
                    catch (error) { errors.push(`[${pluginId}] Profile-scoped import target is unsafe: ${error.message}`); }
                }
            }
            if (requestsLegacyQuizShowImport && legacyQuizShowDatabaseFile) {
                const destBase = configPathManager.getPluginDataDir('quiz-show', { profileId: scopedTargetProfile });
                const destPath = path.join(destBase, 'quiz_show.db');
                try {
                    validateRestoreBase(destBase);
                    const pathCheck = validateEntryPath(legacyQuizShowDatabaseFile.relPath);
                    const destCheck = validateDestinationPath(destPath, destBase);
                    if (!pathCheck.valid || !destCheck.valid || fs.existsSync(destPath)) {
                        errors.push(`[quiz-show] Legacy profile import preflight failed: ${!pathCheck.valid ? pathCheck.error : !destCheck.valid ? destCheck.error : 'Destination already exists: quiz_show.db'}`);
                    } else if (!validateQuizShowDatabaseFile(legacyQuizShowDatabaseFile)) {
                        errors.push('[quiz-show] Legacy database failed SQLite integrity validation');
                    }
                } catch (error) {
                    errors.push(`[quiz-show] Legacy profile import target is unsafe: ${error.message}`);
                }
            }
        }
        if (errors.length) {
            fileTransaction.cleanup();
            return { success: false, report, warnings, errors };
        }
    }

    let userConfigProfileNameMap = {};
    try {
        userConfigProfileNameMap = preflightFileRestoreTargets(parsed, db, configPathManager, {
            mode,
            pluginFilter,
            includePluginData,
            includeUserConfigs,
            includeUploads,
            includeUserData,
            includeProfileScopedPluginData,
            includeSchnorrbecherPersistentState,
            includeLegacyQuizShowDatabase,
            archivedScopedPlugins,
            scopedTargetProfile,
            replaceInitializedTargets
        }, fileTransaction);
        await fileTransaction.stage();
    } catch (error) {
        fileTransaction.cleanup();
        errors.push(`File restore preflight failed: ${error.message}`);
        return { success: false, report, warnings, errors };
    }

    try {

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
            const legacyQuizShowScope = pluginId === 'quiz-show' && includeLegacyQuizShowDatabase === true && !profileScoped;
            const scopedImport = profileScoped || legacyQuizShowScope;
            if (PROFILE_SCOPED_PLUGIN_DATA.includes(pluginId) && !scopedImport) {
                warnings.push(`[${pluginId}] Unmarked legacy plugin data skipped; choose an explicit legacy import in the plugin UI.`);
                report.plugins[pluginId].skippedFiles.push(...parsed.dataFiles[pluginId].map(file => file.relPath));
                continue;
            }
            if (pluginId === 'schnorrbecher' && schnorrStateFile && !includeSchnorrbecherPersistentState) {
                warnings.push('[schnorrbecher] State file skipped; persistent state requires explicit selection in the import preview.');
                report.plugins[pluginId].skippedFiles.push('coin-jar-state.json');
                parsed.dataFiles[pluginId] = parsed.dataFiles[pluginId].filter(file => file !== schnorrStateFile);
            }
            if (scopedImport && ((!legacyQuizShowScope && !includeProfileScopedPluginData) || !scopedTargetProfile)) {
                warnings.push(`[${pluginId}] Profile-scoped data skipped; choose a target profile and explicitly enable profile data import.`);
                report.plugins[pluginId].skippedFiles.push(...parsed.dataFiles[pluginId].map(file => file.relPath));
                continue;
            }
            const destBase = scopedImport
                ? configPathManager.getPluginDataDir(pluginId, { profileId: scopedTargetProfile })
                : configPathManager.getPluginDataDir(pluginId);
            if (scopedImport) {
                const files = legacyQuizShowScope
                    ? [legacyQuizShowDatabaseFile].filter(Boolean)
                    : parsed.dataFiles[pluginId];
                if (legacyQuizShowScope) {
                    const skipped = parsed.dataFiles[pluginId].filter(file => file !== legacyQuizShowDatabaseFile);
                    if (skipped.length) {
                        warnings.push('[quiz-show] Only the canonical legacy quiz_show.db is eligible for explicit profile import; other unmarked files were skipped.');
                        report.plugins[pluginId].skippedFiles.push(...skipped.map(file => file.relPath));
                    }
                }
                for (const file of files) {
                    report.plugins[pluginId].importedFiles.push(file.relPath);
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
                    report.plugins[pluginId].importedFiles.push(relPath);
                } catch (err) {
                    warnings.push(`[${pluginId}] Failed to restore file ${relPath}: ${err.message}`);
                    errors.push(`[${pluginId}] File restore failed for ${relPath}`);
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
            const profileNameMap = userConfigProfileNameMap || {};
            const activeDbPath = getActiveDbPath(db);
            const files = parsed.userConfigsFiles.slice().sort(sortUserConfigFiles);
            let profileRestoreFailed = false;

            for (const { tmpPath, relPath } of files) {
                const pathCheck = validateEntryPath(relPath);
                if (!pathCheck.valid) {
                    warnings.push(`[user_configs] Skipping file with unsafe path: ${relPath}`);
                    report.userConfigs.skipped.push(relPath);
                    profileRestoreFailed = true;
                    continue;
                }

                if (isActiveProfileMarker(relPath)) {
                    if (profileRestoreFailed) {
                        warnings.push('[user_configs] Active profile marker skipped because another profile restore file failed.');
                        report.userConfigs.skipped.push(relPath);
                        continue;
                    }
                    try {
                        const originalProfile = fs.readFileSync(tmpPath, 'utf8').trim();
                        const restoredProfile = profileNameMap[originalProfile] || originalProfile;
                        const destPath = path.join(userConfigsBase, '.active_profile');
                        const destCheck = validateDestinationPath(destPath, userConfigsBase);
                        if (!destCheck.valid) {
                            warnings.push(`[user_configs] Skipping .active_profile, ${destCheck.error}`);
                            report.userConfigs.skipped.push(relPath);
                            profileRestoreFailed = true;
                            continue;
                        }
                        if (mode === 'merge' && fs.existsSync(destPath)) {
                            report.userConfigs.skipped.push(relPath);
                            continue;
                        }
                        fs.mkdirSync(path.dirname(destPath), { recursive: true });
                        report.userConfigs.imported.push(relPath);
                    } catch (err) {
                        warnings.push(`[user_configs] Failed to restore ${relPath}: ${err.message}`);
                        report.userConfigs.skipped.push(relPath);
                        profileRestoreFailed = true;
                    }
                    continue;
                }

                let targetRelPath = mapUserConfigRelPath(relPath, profileNameMap);
                let destPath = path.join(userConfigsBase, targetRelPath);
                const destCheck = validateDestinationPath(destPath, userConfigsBase);
                if (!destCheck.valid) {
                    warnings.push(`[user_configs] Skipping file, ${destCheck.error}`);
                    report.userConfigs.skipped.push(relPath);
                    profileRestoreFailed = true;
                    continue;
                }

                if (mode === 'merge' && fs.existsSync(destPath)) {
                    report.userConfigs.skipped.push(relPath);
                    continue;
                }

                if (isRootProfileDatabase(relPath) && activeDbPath && path.resolve(destPath) === activeDbPath) {
                    const originalProfile = path.basename(relPath, '.db');
                    const restoredProfile = profileNameMap[originalProfile] || makeRestoreProfileName(userConfigsBase, originalProfile);
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
                                report.userConfigs.imported.push(fallbackRelPath);
                                report.userConfigs.renamed.push({ from: relPath, to: fallbackRelPath });
                                warnings.push(
                                    `[user_configs] Could not overwrite ${relPath}; restored as ${fallbackRelPath}: ${err.message}`
                                );
                                continue;
                            } catch (fallbackErr) {
                                warnings.push(`[user_configs] Failed fallback restore for ${relPath}: ${fallbackErr.message}`);
                                profileRestoreFailed = true;
                                errors.push(`[user_configs] Profile database restore failed for ${relPath}`);
                            }
                        } else {
                            profileRestoreFailed = true;
                            errors.push(`[user_configs] Profile database restore failed for ${relPath}: ${fallbackCheck.error}`);
                        }
                    } else {
                        warnings.push(`[user_configs] Failed to restore ${relPath}: ${err.message}`);
                        profileRestoreFailed = true;
                        errors.push(`[user_configs] Restore failed for ${relPath}: ${err.message}`);
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
                report.uploads.imported.push(relPath);
            } catch (err) {
                warnings.push(`[uploads] Failed to restore ${relPath}: ${err.message}`);
                errors.push(`[uploads] Restore failed for ${relPath}: ${err.message}`);
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
                report.userData.imported.push(relPath);
            } catch (err) {
                warnings.push(`[user_data] Failed to restore ${relPath}: ${err.message}`);
                errors.push(`[user_data] Restore failed for ${relPath}: ${err.message}`);
                report.userData.skipped.push(relPath);
            }
        }
    }

    if (errors.length) {
        try {
            fileTransaction.rollback();
        } catch (rollbackError) {
            errors.push(`File restore rollback failed: ${rollbackError.message}`);
        }
        if (databaseSnapshot) {
            try { restoreSettingsTable(db, databaseSnapshot); }
            catch (rollbackError) { errors.push(`Settings database rollback failed: ${rollbackError.message}`); }
        }
        clearImportedReport(report);
    } else {
        fileTransaction.commit();
    }
    fileTransaction.cleanup();

    return {
        success: errors.length === 0,
        report,
        warnings,
        errors
    };
    } catch (error) {
        try { fileTransaction.rollback(); }
        catch (rollbackError) { errors.push(`File restore rollback failed: ${rollbackError.message}`); }
        if (databaseSnapshot) {
            try { restoreSettingsTable(db, databaseSnapshot); }
            catch (rollbackError) { errors.push(`Settings database rollback failed: ${rollbackError.message}`); }
        }
        clearImportedReport(report);
        fileTransaction.cleanup();
        errors.push(`Import failed: ${error.message}`);
        return { success: false, report, warnings, errors };
    }
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

function snapshotSettingsTable(db) {
    if (!db || typeof db.prepare !== 'function') return null;
    return db.prepare('SELECT key, value FROM settings').all().map(row => ({ key: row.key, value: row.value }));
}

function restoreSettingsTable(db, rows) {
    if (!db || !Array.isArray(rows)) return;
    const restore = () => {
        db.prepare('DELETE FROM settings').run();
        const insert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
        for (const row of rows) insert.run(row.key, row.value);
    };
    if (typeof db.transaction === 'function') db.transaction(restore)();
    else if (db.db && typeof db.db.exec === 'function') {
        db.db.exec('BEGIN IMMEDIATE');
        try { restore(); db.db.exec('COMMIT'); }
        catch (error) { try { db.db.exec('ROLLBACK'); } catch (_) {} throw error; }
    } else throw new Error('Database does not provide transaction support');
}

function createFileRestoreTransaction() {
    const entries = [];
    const stageDirs = new Set();
    const createdDirs = new Set();
    let preserveStageDirsForRecovery = false;
    let committed = false;
    function ensureDirectory(dirPath) {
        const missing = [];
        let cursor = path.resolve(dirPath);
        while (!fs.existsSync(cursor)) {
            missing.push(cursor);
            const parent = path.dirname(cursor);
            if (parent === cursor) break;
            cursor = parent;
        }
        fs.mkdirSync(dirPath, { recursive: true });
        missing.forEach(dir => createdDirs.add(dir));
    }
    return {
        queue(source, destination, options = {}) {
            const destPath = path.resolve(destination);
            if (entries.some(entry => entry.destPath.toLowerCase() === destPath.toLowerCase())) {
                throw new Error(`Multiple restore entries target ${destPath}`);
            }
            entries.push({
                source,
                destPath,
                replace: Boolean(options.replace),
                order: options.order || 0,
                expectedSha256: options.expectedSha256 || null,
                restoreBase: options.restoreBase ? path.resolve(options.restoreBase) : null,
                originalSha256: null,
                originalRemoved: false,
                installed: false,
                hadOriginal: false
            });
        },
        async stage() {
            for (const entry of entries) {
                if (entry.restoreBase) validateRestoreDestination(entry.restoreBase, entry.destPath);
                ensureDirectory(path.dirname(entry.destPath));
                const stageDir = fs.mkdtempSync(path.join(path.dirname(entry.destPath), '.ltth-restore-stage-'));
                stageDirs.add(stageDir);
                entry.stagePath = path.join(stageDir, 'payload');
                entry.backupPath = path.join(stageDir, 'original');
                if (Buffer.isBuffer(entry.source)) fs.writeFileSync(entry.stagePath, entry.source);
                else fs.copyFileSync(entry.source, entry.stagePath);
                const stagedChecksum = await calculateFileChecksum(entry.stagePath);
                entry.stagedSha256 = stagedChecksum.sha256;
                if (entry.expectedSha256) {
                    if (stagedChecksum.sha256 !== entry.expectedSha256) {
                        throw new Error('Staged backup file failed integrity verification');
                    }
                }
                entry.hadOriginal = fs.existsSync(entry.destPath);
                if (entry.hadOriginal && !entry.replace) throw new Error(`Destination already exists: ${entry.destPath}`);
                if (entry.hadOriginal) {
                    fs.copyFileSync(entry.destPath, entry.backupPath);
                    entry.originalSha256 = calculateFileChecksumSync(entry.backupPath);
                    if (calculateFileChecksumSync(entry.destPath) !== entry.originalSha256) {
                        throw new Error(`Destination changed while its original snapshot was created: ${entry.destPath}`);
                    }
                }
            }
        },
        commit() {
            const ordered = entries.slice().sort((a, b) => a.order - b.order);
            try {
                // All awaitable import/provider hooks have completed before this
                // synchronous commit edge. Revalidate every staged payload without
                // yielding so same-process hooks cannot swap bytes after stage().
                for (const entry of ordered) {
                    if (entry.restoreBase) validateRestoreDestination(entry.restoreBase, entry.destPath);
                    if (calculateFileChecksumSync(entry.stagePath) !== entry.stagedSha256) {
                        throw new Error('Staged backup file changed before commit');
                    }
                    preflightHardlinkInstall(entry);
                }
                for (const entry of ordered) {
                    if (entry.restoreBase) validateRestoreDestination(entry.restoreBase, entry.destPath);
                    const destinationExists = fs.existsSync(entry.destPath);
                    if (destinationExists !== entry.hadOriginal ||
                        (entry.hadOriginal && calculateFileChecksumSync(entry.destPath) !== entry.originalSha256)) {
                        throw new Error(`Destination changed after restore staging: ${entry.destPath}`);
                    }
                    if (entry.hadOriginal) {
                        fs.unlinkSync(entry.destPath);
                        entry.originalRemoved = true;
                    }
                    if (fs.existsSync(entry.destPath)) {
                        throw new Error(`Destination reappeared before restore rename: ${entry.destPath}`);
                    }
                    // Same-volume hard-link creation atomically refuses an existing target.
                    fs.linkSync(entry.stagePath, entry.destPath);
                    entry.installed = true;
                    fs.unlinkSync(entry.stagePath);
                }
                committed = true;
            } catch (error) {
                try { this.rollback(); }
                catch (rollbackError) { error.message += `; rollback failed: ${rollbackError.message}`; }
                throw error;
            }
        },
        rollback() {
            const failures = [];
            for (const entry of entries.slice().reverse()) {
                try {
                    if (entry.restoreBase) validateRestoreDestination(entry.restoreBase, entry.destPath);
                    if (entry.installed && fs.existsSync(entry.destPath)) {
                        if (calculateFileChecksumSync(entry.destPath) !== entry.stagedSha256) {
                            throw new Error(`Installed destination changed before rollback: ${entry.destPath}`);
                        }
                        fs.unlinkSync(entry.destPath);
                    }
                    if (entry.hadOriginal && entry.originalRemoved && fs.existsSync(entry.backupPath)) {
                        if (fs.existsSync(entry.destPath)) {
                            throw new Error(`Destination reappeared before original recovery: ${entry.destPath}`);
                        }
                        if (entry.restoreBase) validateRestoreDestination(entry.restoreBase, entry.destPath);
                        ensureDirectory(path.dirname(entry.destPath));
                        fs.copyFileSync(entry.backupPath, entry.destPath, fs.constants.COPYFILE_EXCL);
                        entry.originalRemoved = false;
                    }
                    entry.installed = false;
                } catch (error) { failures.push(`${entry.destPath}: ${error.message}`); }
            }
            committed = false;
            if (failures.length) {
                preserveStageDirsForRecovery = true;
                const recoveryPaths = entries
                    .filter(entry => entry.hadOriginal && entry.backupPath && fs.existsSync(entry.backupPath))
                    .map(entry => entry.backupPath);
                throw new Error(`${failures.join('; ')}; original backups retained at: ${recoveryPaths.join(', ') || 'stage directories retained for manual recovery'}`);
            }
        },
        cleanup() {
            if (preserveStageDirsForRecovery) return;
            for (const dir of stageDirs) cleanupTempDir(dir);
            for (const dir of [...createdDirs].sort((a, b) => b.length - a.length)) {
                try { fs.rmdirSync(dir); } catch (_) { /* retain non-empty or concurrently used directories */ }
            }
        },
        get committed() { return committed; }
    };
}

function preflightHardlinkInstall(entry) {
  const token = crypto.randomBytes(16).toString('hex');
  const source = path.join(path.dirname(entry.stagePath), `.ltth-link-probe-${token}`);
  const target = path.join(path.dirname(entry.destPath), `.ltth-link-probe-${token}`);
  let sourceCreated = false;
  let targetCreated = false;
  let failure = null;
  try {
    fs.writeFileSync(source, '', { flag: 'wx' });
    sourceCreated = true;
    fs.linkSync(source, target);
    targetCreated = true;
  } catch (error) {
    failure = error;
  } finally {
    for (const [file, owned] of [[target, targetCreated], [source, sourceCreated]]) {
      if (!owned) continue;
      try { fs.unlinkSync(file); }
      catch (error) {
        const detail = `Hardlink probe cleanup failed at ${file}: ${error.message}`;
        if (failure) failure.message += `; ${detail}`;
        else failure = new Error(detail);
      }
    }
  }
  if (failure) throw failure;
}

function preflightFileRestoreTargets(parsed, db, configPathManager, opts, transaction) {
    const {
        mode, pluginFilter, includePluginData, includeUserConfigs, includeUploads, includeUserData,
        includeSchnorrbecherPersistentState, includeLegacyQuizShowDatabase, archivedScopedPlugins, scopedTargetProfile, replaceInitializedTargets
    } = opts;
    const filterIds = canonicalPluginFilter(pluginFilter);
    const selected = new Set([
        ...Object.keys(parsed.dataFiles || {}),
        ...Object.keys(parsed.pluginSettings || {})
    ].filter(id => !filterIds || filterIds.has(canonicalizePluginId(id))));
    const profileNameMap = {};
    if (includePluginData) {
        for (const pluginId of selected) {
            const legacyQuizShowScope = pluginId === 'quiz-show' && includeLegacyQuizShowDatabase === true && !archivedScopedPlugins.has(pluginId);
            if (PROFILE_SCOPED_PLUGIN_DATA.includes(pluginId) && !archivedScopedPlugins.has(pluginId) && !legacyQuizShowScope) continue;
            const scoped = archivedScopedPlugins.has(pluginId) || legacyQuizShowScope;
            if (scoped && ((!legacyQuizShowScope && !opts.includeProfileScopedPluginData) || !scopedTargetProfile)) continue;
            const base = scoped
                ? configPathManager.getPluginDataDir(pluginId, { profileId: scopedTargetProfile })
                : configPathManager.getPluginDataDir(pluginId);
            const files = legacyQuizShowScope
                ? [findQuizShowDatabaseFile(parsed)].filter(Boolean)
                : parsed.dataFiles?.[pluginId] || [];
            for (const file of files) {
                if (pluginId === 'schnorrbecher' && file.relPath.replace(/\\/g, '/') === 'coin-jar-state.json' && !includeSchnorrbecherPersistentState) continue;
                queueRestoreFile(
                    transaction,
                    file,
                    base,
                    mode,
                    mode === 'replace' && !scoped || replaceInitializedTargets.has(path.join(base, file.relPath)),
                    1,
                    null,
                    getExpectedFileDigest(parsed, file),
                    base
                );
            }
        }
    }
    if (includeUserConfigs && configPathManager?.getUserConfigsDir) {
        const base = configPathManager.getUserConfigsDir();
        const activeDbPath = getActiveDbPath(db);
        for (const file of parsed.userConfigsFiles || []) {
            if (!isRootProfileDatabase(file.relPath)) continue;
            const profileName = path.basename(file.relPath, '.db');
            if (path.resolve(path.join(base, file.relPath)) === activeDbPath) {
                profileNameMap[profileName] = makeRestoreProfileName(base, profileName);
            }
        }
        for (const file of parsed.userConfigsFiles || []) {
            const relPath = file.relPath;
            if (isActiveProfileMarker(relPath)) {
                if (mode === 'merge' && fs.existsSync(path.join(base, '.active_profile'))) continue;
                const markerBytes = fs.readFileSync(file.tmpPath);
                assertExpectedFileDigest(parsed, file, markerBytes);
                const incomingProfile = markerBytes.toString('utf8').trim();
                const source = Buffer.from(profileNameMap[incomingProfile] || incomingProfile, 'utf8');
                transaction.queue(source, path.join(base, '.active_profile'), {
                    replace: mode === 'replace', order: 3, restoreBase: base
                });
                continue;
            }
            let targetRelPath = mapUserConfigRelPath(relPath, profileNameMap);
            if (isRootProfileDatabase(relPath) && profileNameMap[path.basename(relPath, '.db')]) {
                targetRelPath = `${profileNameMap[path.basename(relPath, '.db')]}.db`;
            }
            let destPath = path.join(base, targetRelPath);
            if (mode === 'merge' && fs.existsSync(destPath)) continue;
            queueRestoreFile(transaction, file, base, mode, mode === 'replace', isRootProfileDatabase(relPath) ? 0 : 1, destPath, getExpectedFileDigest(parsed, file));
        }
    }
    if (includeUploads && configPathManager?.getUploadsDir) {
        const base = configPathManager.getUploadsDir();
        for (const file of parsed.uploadFiles || []) queueRestoreFile(transaction, file, base, mode, mode === 'replace', 2, null, getExpectedFileDigest(parsed, file));
    }
    if (includeUserData && configPathManager?.getUserDataDir) {
        const base = configPathManager.getUserDataDir();
        for (const file of parsed.userDataFiles || []) queueRestoreFile(transaction, file, base, mode, mode === 'replace', 2, null, getExpectedFileDigest(parsed, file));
    }
    return profileNameMap;
}

function getExpectedFileDigest(parsed, file) {
    if (!parsed.tmpDir || !file.tmpPath) return null;
    const relativePath = path.relative(parsed.tmpDir, file.tmpPath).replace(/\\/g, '/');
    return parsed.integrity?.fileDigests?.[relativePath] || null;
}

function assertExpectedFileDigest(parsed, file, data) {
    const expectedSha256 = getExpectedFileDigest(parsed, file);
    if (!expectedSha256) return;
    const actualSha256 = crypto.createHash('sha256').update(data).digest('hex');
    if (actualSha256 !== expectedSha256) throw new Error('Staged backup file failed integrity verification');
}

function queueRestoreFile(transaction, file, base, mode, replace, order, destination = null, expectedSha256 = null, restoreBase = null) {
    const pathCheck = validateEntryPath(file.relPath);
    if (!pathCheck.valid) throw new Error(`Unsafe relative path ${file.relPath}: ${pathCheck.error}`);
    const destPath = destination || path.join(base, file.relPath);
    const destCheck = validateDestinationPath(destPath, base);
    if (!destCheck.valid) throw new Error(destCheck.error);
    validateRestoreDestination(base, destPath);
    if (mode === 'merge' && fs.existsSync(destPath) && !replace) return;
    if (mode === 'replace' && fs.existsSync(destPath) && !replace) throw new Error(`Destination replacement not authorized: ${destPath}`);
    transaction.queue(file.tmpPath, destPath, { replace, order, expectedSha256, restoreBase: restoreBase || base });
}

function clearImportedReport(report) {
    report.globalSettings.imported = [];
    for (const plugin of Object.values(report.plugins || {})) {
        plugin.importedSettings = [];
        plugin.importedFiles = [];
    }
    for (const section of [report.userConfigs, report.uploads, report.userData]) {
        if (section && Array.isArray(section.imported)) section.imported = [];
    }
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
