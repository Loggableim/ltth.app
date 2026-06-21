'use strict';

/**
 * Backup manifest constants and helpers.
 *
 * Defines the versioned backup format used by the Config Backup & Restore system.
 * The manifest is always stored as `manifest.json` at the root of the backup ZIP.
 */

const FORMAT_VERSION = '1.0.0';
const APP_NAME = 'pupcids-little-tiktool-helper';

/**
 * Creates a new backup manifest object.
 *
 * @param {object} opts
 * @param {string} [opts.appVersion] - App version string (e.g. '1.3.3')
 * @param {string} [opts.profile] - Active profile name at export time
 * @param {object} [opts.options] - Export options chosen by the user
 * @param {Array}  [opts.plugins] - Plugin metadata entries included in the backup
 * @param {Array}  [opts.warnings] - Non-fatal warnings generated during export
 * @returns {object} manifest object
 */
function createManifest({ appVersion, profile, options, plugins, warnings } = {}) {
    return {
        formatVersion: FORMAT_VERSION,
        app: {
            name: APP_NAME,
            version: appVersion || 'unknown'
        },
        exportedAt: new Date().toISOString(),
        sourceProfile: profile || null,
        options: options || {},
        plugins: plugins || [],
        warnings: warnings || []
    };
}

/**
 * Validates a manifest object read from a backup archive.
 *
 * @param {object} manifest - Parsed manifest object
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateManifest(manifest) {
    const errors = [];

    if (!manifest || typeof manifest !== 'object') {
        return { valid: false, errors: ['Manifest is not an object'] };
    }

    if (!manifest.formatVersion || typeof manifest.formatVersion !== 'string') {
        errors.push('Missing or invalid formatVersion');
    }

    if (!manifest.exportedAt || typeof manifest.exportedAt !== 'string') {
        errors.push('Missing or invalid exportedAt timestamp');
    } else {
        const ts = Date.parse(manifest.exportedAt);
        if (isNaN(ts)) {
            errors.push('exportedAt is not a valid ISO timestamp');
        }
    }

    if (!manifest.app || typeof manifest.app !== 'object') {
        errors.push('Missing app metadata block');
    }

    if (!Array.isArray(manifest.plugins)) {
        errors.push('plugins must be an array');
    }

    if (!Array.isArray(manifest.warnings)) {
        errors.push('warnings must be an array');
    }

    // Version compatibility check – warn on future major versions
    if (manifest.formatVersion) {
        const [major] = manifest.formatVersion.split('.').map(Number);
        const [currentMajor] = FORMAT_VERSION.split('.').map(Number);
        if (major > currentMajor) {
            errors.push(
                `Backup was created with a newer format version (${manifest.formatVersion}). ` +
                `This installation supports up to ${FORMAT_VERSION}. ` +
                'Some data may not be importable.'
            );
        }
    }

    return { valid: errors.length === 0, errors };
}

module.exports = { FORMAT_VERSION, APP_NAME, createManifest, validateManifest };
