'use strict';

// External key sourcing for the read-only live source (lt-6qo T2).
//
// The Eulerstream fallback key is wanted, but it must never live inside the repo and
// must never appear in a log, an error message or a PR. This module reads it from a
// source outside the working tree:
//   - environment variable `EULER_FALLBACK_API_KEY` (one or more keys, comma separated), or
//   - a key file named by `EULER_FALLBACK_KEY_FILE` (any location, normally outside the repo).
//
// Only `resolveLiveReadKeys` reads bytes. It returns the key material for the caller to
// hand to the live source and a redacted description for the log. `describeKeySource`
// never contains key material, so it is safe to log.

const fs = require('fs');

const KEY_ENV = 'EULER_FALLBACK_API_KEY';
const KEY_FILE_ENV = 'EULER_FALLBACK_KEY_FILE';

function parseKeys(raw) {
  return String(raw == null ? '' : raw)
    .split(/[\s,]+/)
    .map(key => key.trim())
    .filter(Boolean);
}

// Show only enough of a key to recognise it, never enough to use it.
function redactKey(key) {
  const value = typeof key === 'string' ? key : '';
  if (value.length === 0) return '';
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

// A description that is safe to log: no key, only where it came from and how many.
function describeKeySource(result) {
  return {
    configured: Boolean(result && result.configured),
    source: (result && result.source) || 'none',
    count: Array.isArray(result && result.keys) ? result.keys.length : 0
  };
}

// `readFileSync` is injected so tests can exercise the file path without touching the disk.
// By default the real filesystem is used only when a key file is configured.
function resolveLiveReadKeys({ env = process.env, readFileSync = fs.readFileSync, keyFile } = {}) {
  const file = keyFile || env[KEY_FILE_ENV];
  if (file) {
    if (typeof readFileSync !== 'function') {
      return { keys: [], source: 'file-unreadable', configured: false };
    }
    let contents = '';
    try {
      contents = readFileSync(file, 'utf8');
    } catch (error) {
      // Deliberately no path, no message: a failed read must not leak a location or key.
      return { keys: [], source: 'file-missing', configured: false };
    }
    const keys = parseKeys(contents);
    return { keys, source: 'file', configured: keys.length > 0 };
  }

  const keys = parseKeys(env[KEY_ENV]);
  return { keys, source: 'env', configured: keys.length > 0 };
}

module.exports = {
  KEY_ENV,
  KEY_FILE_ENV,
  parseKeys,
  redactKey,
  describeKeySource,
  resolveLiveReadKeys
};
