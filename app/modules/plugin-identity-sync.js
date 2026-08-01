'use strict';

const crypto = require('crypto');

const STATE_SYNC_METADATA_KEY = '__ltthPluginIdentitySync';
const CONFIG_SYNC_MARKER_KEY = 'plugin:stream-monsters:config_identity_sync';
const CONFIG_MIGRATION_CANONICAL_SNAPSHOT_KEY =
  'plugin:stream-monsters:config_migration_snapshot_canonical';
const CONFIG_MIGRATION_LEGACY_SNAPSHOT_KEY =
  'plugin:stream-monsters:config_migration_snapshot_legacy';

class PluginIdentityConflictError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'PluginIdentityConflictError';
    this.code = code;
    this.details = details;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, stableValue(value[key])])
  );
}

function stableSerialize(value) {
  return JSON.stringify(stableValue(value));
}

function hashIdentityValue(value) {
  return crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');
}

function cloneIdentityValue(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function mergeIdentityValues(base, incoming) {
  if (!isPlainObject(base) || !isPlainObject(incoming)) {
    return cloneIdentityValue(incoming);
  }
  const merged = cloneIdentityValue(base);
  for (const [key, value] of Object.entries(incoming)) {
    merged[key] = isPlainObject(value) && isPlainObject(merged[key])
      ? mergeIdentityValues(merged[key], value)
      : cloneIdentityValue(value);
  }
  return merged;
}

function createSyncMarker(value) {
  return Object.freeze({ version: 1, hash: hashIdentityValue(value) });
}

function valuesEqual(left, right) {
  return stableSerialize(left) === stableSerialize(right);
}

module.exports = {
  CONFIG_MIGRATION_CANONICAL_SNAPSHOT_KEY,
  CONFIG_MIGRATION_LEGACY_SNAPSHOT_KEY,
  CONFIG_SYNC_MARKER_KEY,
  STATE_SYNC_METADATA_KEY,
  PluginIdentityConflictError,
  cloneIdentityValue,
  createSyncMarker,
  hashIdentityValue,
  isPlainObject,
  mergeIdentityValues,
  stableSerialize,
  valuesEqual
};
