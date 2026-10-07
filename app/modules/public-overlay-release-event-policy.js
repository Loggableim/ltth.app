'use strict';

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

// The independent reviewed byte pin prevents removed events or changed owners
// from silently reopening public admission. Corruption blocks initialization.
const OWNER_MAP_SHA256 = 'b2bda0e3c041720abca290292d7ec0ed4ae8f62e8e386964e3304e87d8b0f241';
function loadReviewedOwners() {
  try {
    const bytes = fs.readFileSync(path.join(__dirname, 'public-overlay-release-event-owners.json'));
    if (createHash('sha256').update(bytes).digest('hex') !== OWNER_MAP_SHA256) throw new Error();
    const mapping = JSON.parse(bytes.toString('utf8'));
    if (mapping.schemaVersion !== 1 || mapping.activeLeakClaim !== false ||
        Object.keys(mapping.events).sort().join(',') !== 'incoming,outgoing' ||
        Object.keys(mapping.events.outgoing).length !== 119 ||
        Object.keys(mapping.events.incoming).length !== 9) throw new Error();
    return mapping;
  } catch {
    const error = new Error('Public release event ownership contract is unavailable');
    error.code = 'PUBLIC_RELEASE_EVENT_OWNER_CONTRACT_INVALID';
    throw error;
  }
}
const owners = loadReviewedOwners();
const { createPluginReleasePolicy } = require('./plugin-release-policy');

// Exact reviewed event ownership only. Shared namespaces are not inferred.
function createPublicReleaseEventGuard(pluginReleasePolicy = createPluginReleasePolicy()) {
  return (direction, eventName) => {
    if (direction !== 'incoming' && direction !== 'outgoing') return false;
    const entry = Object.prototype.hasOwnProperty.call(owners.events[direction] || {}, eventName)
      ? owners.events[direction][eventName] : undefined;
    if (!entry) return true;
    try {
      const snapshot = pluginReleasePolicy.getSnapshot();
      if (!snapshot || typeof snapshot.publicMode !== 'boolean') return false;
      if (snapshot.policyInvalid) return false;
      if (!snapshot.publicMode) return true;
      return pluginReleasePolicy.isClosedBetaId(entry.owner, snapshot) === false;
    } catch {
      // Unavailable policy cannot reopen a reviewed public-only boundary.
      return false;
    }
  };
}

module.exports = { createPublicReleaseEventGuard };
