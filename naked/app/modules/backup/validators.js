'use strict';

/**
 * Validation helpers for backup files and import inputs.
 *
 * Provides size sanity checks, path traversal protection,
 * and format/content validation before any import is performed.
 */

const path = require('path');

/** Maximum total backup size accepted for import (500 MB). */
const MAX_BACKUP_SIZE_BYTES = 500 * 1024 * 1024;

/** Maximum number of files in a single backup archive. */
const MAX_BACKUP_FILES = 10000;

/**
 * Validate that a backup file size is within acceptable limits.
 *
 * @param {number} sizeBytes
 * @returns {{ valid: boolean, error?: string }}
 */
function validateBackupSize(sizeBytes) {
    if (typeof sizeBytes !== 'number' || sizeBytes < 0) {
        return { valid: false, error: 'Invalid backup size' };
    }
    if (sizeBytes > MAX_BACKUP_SIZE_BYTES) {
        const mb = (sizeBytes / 1024 / 1024).toFixed(1);
        const maxMb = (MAX_BACKUP_SIZE_BYTES / 1024 / 1024).toFixed(0);
        return { valid: false, error: `Backup size (${mb} MB) exceeds maximum (${maxMb} MB)` };
    }
    return { valid: true };
}

/**
 * Validate that an entry path extracted from a ZIP archive is safe to use
 * as a restore destination. Prevents directory traversal attacks.
 *
 * @param {string} entryPath - Relative path from the archive entry
 * @returns {{ valid: boolean, error?: string }}
 */
function validateEntryPath(entryPath) {
    if (!entryPath || typeof entryPath !== 'string') {
        return { valid: false, error: 'Entry path must be a non-empty string' };
    }

    // Reject null bytes before any normalisation.
    if (entryPath.includes('\0')) {
        return { valid: false, error: 'Entry path contains null byte' };
    }

    const zipPath = entryPath.replace(/\\/g, '/');
    const normalised = path.posix.normalize(zipPath);
    const segments = zipPath.split('/');

    // Reject absolute paths, drive-qualified Windows paths, and traversal segments.
    if (
        zipPath.startsWith('/') ||
        normalised.startsWith('/') ||
        /^[A-Za-z]:($|\/)/.test(zipPath) ||
        segments.includes('..') ||
        normalised === '..' ||
        normalised.startsWith('../')
    ) {
        return { valid: false, error: `Unsafe archive entry path: ${entryPath}` };
    }

    return { valid: true };
}

/**
 * Validate that a resolved destination path stays within the allowed base directory.
 * This is the belt-and-suspenders check after joining base + relative.
 *
 * @param {string} destPath - Resolved absolute destination path
 * @param {string} baseDir  - Allowed base directory (absolute)
 * @returns {{ valid: boolean, error?: string }}
 */
function validateDestinationPath(destPath, baseDir) {
    const resolvedDest = path.resolve(destPath);
    const resolvedBase = path.resolve(baseDir);

    if (!resolvedDest.startsWith(resolvedBase + path.sep) && resolvedDest !== resolvedBase) {
        return {
            valid: false,
            error: `Path traversal detected: ${destPath} escapes base directory`
        };
    }
    return { valid: true };
}

/**
 * Validate the shape of a parsed backup payload (after extracting from ZIP).
 *
 * @param {object} payload - Object with at least { manifest }
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateBackupPayload(payload) {
    const errors = [];

    if (!payload || typeof payload !== 'object') {
        return { valid: false, errors: ['Backup payload is not an object'] };
    }

    if (!payload.manifest || typeof payload.manifest !== 'object') {
        errors.push('Missing manifest in backup payload');
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Sanitise a plugin ID for safe use in file system paths.
 * Allows only alphanumerics, hyphens, and underscores.
 * Rejects IDs containing directory traversal patterns (`..'`).
 *
 * @param {string} pluginId
 * @returns {string|null} sanitised plugin ID, or null if invalid
 */
function sanitisePluginId(pluginId) {
    if (!pluginId || typeof pluginId !== 'string') return null;
    // Reject obvious directory traversal patterns before sanitising
    if (pluginId.includes('..')) return null;
    const sanitised = pluginId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!sanitised || sanitised.length === 0) return null;
    return sanitised;
}

module.exports = {
    validateBackupSize,
    validateEntryPath,
    validateDestinationPath,
    validateBackupPayload,
    sanitisePluginId,
    MAX_BACKUP_SIZE_BYTES,
    MAX_BACKUP_FILES
};
