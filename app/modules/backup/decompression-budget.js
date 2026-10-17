'use strict';

const {
  MAX_BACKUP_UNCOMPRESSED_SIZE_BYTES,
  MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES
} = require('./validators');

class DecompressionLimitError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DecompressionLimitError';
    this.code = code;
  }
}

class DecompressionBudget {
  constructor({
    maxTotalBytes = MAX_BACKUP_UNCOMPRESSED_SIZE_BYTES,
    maxEntryBytes = MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES
  } = {}) {
    if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 0 || maxTotalBytes > MAX_BACKUP_UNCOMPRESSED_SIZE_BYTES ||
        !Number.isSafeInteger(maxEntryBytes) || maxEntryBytes < 0 || maxEntryBytes > MAX_BACKUP_ENTRY_UNCOMPRESSED_SIZE_BYTES) {
      throw new TypeError('Invalid backup decompression limits');
    }
    this.maxTotalBytes = maxTotalBytes;
    this.maxEntryBytes = maxEntryBytes;
    this.totalBytes = 0;
    this.entryBytes = new Map();
  }

  add(entryName, chunkBytes) {
    if (typeof entryName !== 'string' || !Number.isSafeInteger(chunkBytes) || chunkBytes < 0) {
      throw new DecompressionLimitError('BACKUP_DECOMPRESSION_INVALID_SIZE', 'Invalid decompressed backup size');
    }

    const currentEntryBytes = this.entryBytes.get(entryName) || 0;
    if (chunkBytes > this.maxEntryBytes - currentEntryBytes) {
      throw new DecompressionLimitError('BACKUP_ENTRY_UNCOMPRESSED_SIZE_LIMIT', 'Backup entry exceeds the maximum uncompressed size');
    }
    if (chunkBytes > this.maxTotalBytes - this.totalBytes) {
      throw new DecompressionLimitError('BACKUP_TOTAL_UNCOMPRESSED_SIZE_LIMIT', 'Backup exceeds the maximum total uncompressed size');
    }

    this.entryBytes.set(entryName, currentEntryBytes + chunkBytes);
    this.totalBytes += chunkBytes;
  }
}

module.exports = { DecompressionBudget, DecompressionLimitError };
