'use strict';

/**
 * File collector for plugin data directories.
 *
 * Walks a plugin's persistent data directory and returns a list of files
 * suitable for inclusion in a backup archive, respecting ignore patterns
 * so that caches, temp files, and logs are excluded by default.
 */

const fs = require('fs');
const path = require('path');

/**
 * Default ignore patterns applied to file and directory names.
 * Entries may be strings (exact match) or RegExp (tested against basename).
 */
const DEFAULT_IGNORE_PATTERNS = [
    /^\./, // hidden files / dot-files
    /^cache$/i,
    /^caches$/i,
    /^tmp$/i,
    /^temp$/i,
    /^log$/i,
    /^logs$/i,
    /\.log$/i,
    /^node_modules$/,
    /^__pycache__$/,
    /\.tmp$/i
];

/**
 * Maximum single-file size included in a backup by default (50 MB).
 * Files larger than this are skipped and noted as warnings.
 */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * Determine whether a basename should be ignored.
 *
 * @param {string} basename
 * @param {Array<string|RegExp>} patterns
 * @returns {boolean}
 */
function shouldIgnore(basename, patterns) {
    for (const pattern of patterns) {
        if (pattern instanceof RegExp) {
            if (pattern.test(basename)) return true;
        } else {
            if (basename === pattern) return true;
        }
    }
    return false;
}

/**
 * Recursively collect files from a directory.
 *
 * @param {string} dir - Absolute path to scan
 * @param {string} baseDir - Root directory (used to compute relative paths)
 * @param {object} opts
 * @param {Array<string|RegExp>} [opts.ignorePatterns] - Override ignore patterns
 * @param {number} [opts.maxFileSizeBytes] - Skip files larger than this
 * @param {number} [opts.maxDepth] - Maximum recursion depth (default: unlimited)
 * @param {number} [opts._depth] - Internal: current depth
 * @returns {{ files: Array<{absPath:string, relPath:string, size:number}>, warnings: string[] }}
 */
function collectFiles(dir, baseDir, opts = {}) {
    const {
        ignorePatterns = DEFAULT_IGNORE_PATTERNS,
        maxFileSizeBytes = MAX_FILE_SIZE_BYTES,
        maxDepth = Infinity,
        _depth = 0
    } = opts;

    const files = [];
    const warnings = [];

    if (!fs.existsSync(dir)) {
        return { files, warnings };
    }

    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
        warnings.push(`Cannot read directory ${dir}: ${err.message}`);
        return { files, warnings };
    }

    for (const entry of entries) {
        if (shouldIgnore(entry.name, ignorePatterns)) {
            continue;
        }

        const absPath = path.join(dir, entry.name);

        if (entry.isSymbolicLink()) {
            warnings.push(`Skipping symbolic link: ${absPath}`);
            continue;
        }

        if (entry.isDirectory()) {
            if (_depth >= maxDepth) {
                warnings.push(`Max depth reached, skipping subdirectory: ${absPath}`);
                continue;
            }
            const sub = collectFiles(absPath, baseDir, {
                ...opts,
                _depth: _depth + 1
            });
            files.push(...sub.files);
            warnings.push(...sub.warnings);
        } else if (entry.isFile()) {
            let stat;
            try {
                stat = fs.statSync(absPath);
            } catch (err) {
                warnings.push(`Cannot stat file ${absPath}: ${err.message}`);
                continue;
            }

            if (stat.size > maxFileSizeBytes) {
                warnings.push(
                    `Skipping oversized file (${(stat.size / 1024 / 1024).toFixed(1)} MB): ${absPath}`
                );
                continue;
            }

            const relPath = path.relative(baseDir, absPath);
            files.push({ absPath, relPath, size: stat.size });
        }
    }

    return { files, warnings };
}

/**
 * Collect all files from a plugin's data directory.
 *
 * @param {string} pluginDataDir - Absolute path to the plugin's data directory
 * @param {object} [opts] - Options forwarded to collectFiles
 * @returns {{ files: Array<{absPath:string, relPath:string, size:number}>, warnings: string[] }}
 */
function collectPluginFiles(pluginDataDir, opts = {}) {
    return collectFiles(pluginDataDir, pluginDataDir, opts);
}

module.exports = {
    collectFiles,
    collectPluginFiles,
    shouldIgnore,
    DEFAULT_IGNORE_PATTERNS,
    MAX_FILE_SIZE_BYTES
};
