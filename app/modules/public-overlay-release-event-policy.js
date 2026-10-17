'use strict';

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { assertPluginId } = require('./plugin-paths');
const { canonicalizePluginId } = require('./plugin-identities');
const { createPluginReleasePolicy } = require('./plugin-release-policy');

// This pin covers the original closed-beta event inventory plus the narrowly
// reviewed Viewer-XP display events allowed by the current public contract.
const OWNER_MAP_SHA256 = '9e46013b934e6d5301d80fb45bccd650f5b7227f6a5f15f6e250a26773be5a65';
const EXPECTED_EVENT_COUNTS = Object.freeze({ incoming: 11, outgoing: 124 });

function loadReviewedOwners() {
  try {
    const bytes = fs.readFileSync(path.join(__dirname, 'public-overlay-release-event-owners.json'));
    if (createHash('sha256').update(bytes).digest('hex') !== OWNER_MAP_SHA256) throw new Error();
    const mapping = JSON.parse(bytes.toString('utf8'));
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping) ||
        mapping.schemaVersion !== 1 || mapping.activeLeakClaim !== false ||
        !mapping.events || typeof mapping.events !== 'object' || Array.isArray(mapping.events) ||
        Object.keys(mapping.events).sort().join(',') !== 'incoming,outgoing') throw new Error();

    for (const direction of ['incoming', 'outgoing']) {
      const entries = mapping.events[direction];
      if (!entries || typeof entries !== 'object' || Array.isArray(entries) ||
          Object.keys(entries).length !== EXPECTED_EVENT_COUNTS[direction]) throw new Error();
      for (const [eventName, entry] of Object.entries(entries)) {
        if (typeof eventName !== 'string' || !eventName.trim() || eventName.length > 160 ||
            !entry || typeof entry !== 'object' || Array.isArray(entry) ||
            Object.keys(entry).sort().join(',') !== 'owner,ownership' ||
            !['proven-static', 'reserved-exclusive-namespace'].includes(entry.ownership) ||
            typeof entry.owner !== 'string') throw new Error();
        const owner = canonicalizePluginId(assertPluginId(entry.owner));
        if (owner !== entry.owner) throw new Error();
      }
    }
    return mapping;
  } catch {
    const error = new Error('Public release event ownership contract is unavailable');
    error.code = 'PUBLIC_RELEASE_EVENT_OWNER_CONTRACT_INVALID';
    throw error;
  }
}

const owners = loadReviewedOwners();

function createPublicReleaseEventGuard(pluginReleasePolicy = createPluginReleasePolicy()) {
  return (direction, eventName) => {
    if ((direction !== 'incoming' && direction !== 'outgoing') ||
        typeof eventName !== 'string' || !eventName || eventName.length > 160) return false;

    const entries = owners.events[direction];
    if (!Object.prototype.hasOwnProperty.call(entries, eventName)) return false;
    const entry = entries[eventName];

    try {
      const snapshot = pluginReleasePolicy?.getPublicSurfaceSnapshot?.();
      if (!snapshot || typeof snapshot.publicMode !== 'boolean' ||
          snapshot.publicSurface !== true || snapshot.policyInvalid === true) return false;
      return pluginReleasePolicy.isClosedBetaId?.(entry.owner, snapshot) === false;
    } catch {
      // Missing or invalid dynamic policy must never reopen a public event.
      return false;
    }
  };
}

module.exports = { createPublicReleaseEventGuard };
