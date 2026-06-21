'use strict';

/**
 * Checksum helpers for backup integrity verification.
 *
 * SHA-256 digests are computed for every significant file stored in the archive
 * and collected into a `checksums.json` manifest entry.
 */

const crypto = require('crypto');
const fs = require('fs');

/**
 * Compute SHA-256 hex digest for a Buffer or string.
 *
 * @param {Buffer|string} data
 * @returns {string} hex digest
 */
function computeChecksum(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Compute SHA-256 hex digest for a file on disk.
 *
 * @param {string} filePath - Absolute path to the file
 * @returns {string} hex digest
 */
function computeFileChecksum(filePath) {
    const data = fs.readFileSync(filePath);
    return computeChecksum(data);
}

/**
 * Verify that a data buffer matches an expected checksum.
 *
 * @param {Buffer|string} data
 * @param {string} expected - Expected hex digest
 * @returns {boolean}
 */
function verifyChecksum(data, expected) {
    return computeChecksum(data) === expected;
}

module.exports = { computeChecksum, computeFileChecksum, verifyChecksum };
